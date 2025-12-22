-- Migration: Add Agent Wrap-up State System
-- Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
-- Features: Wrap-up codes, call dispositions, configurable wrap-up time limits

-- Create wrap-up codes table (tenant-configurable disposition codes)
CREATE TABLE IF NOT EXISTS wrap_up_codes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'sales', 'support', 'billing', 'complaint', 'followup', etc.
  color VARCHAR(7) DEFAULT '#6366f1', -- Hex color for UI display
  requires_notes BOOLEAN DEFAULT false,
  requires_followup BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- Create call wrap-ups table (disposition records)
CREATE TABLE IF NOT EXISTS call_wrap_ups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  call_uuid VARCHAR(50),
  agent_id INTEGER NOT NULL,
  wrap_up_code_id INTEGER REFERENCES wrap_up_codes(id) ON DELETE SET NULL,
  notes TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_assigned_to INTEGER, -- Agent assigned for follow-up
  wrap_up_started_at TIMESTAMPTZ NOT NULL,
  wrap_up_ended_at TIMESTAMPTZ,
  wrap_up_duration_seconds INTEGER,
  was_extended BOOLEAN DEFAULT false, -- If wrap-up time was extended
  auto_completed BOOLEAN DEFAULT false, -- If completed by system timeout
  customer_phone VARCHAR(20),
  customer_name VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create agent wrap-up settings (per-queue or per-tenant settings)
CREATE TABLE IF NOT EXISTS agent_wrap_up_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  queue_id INTEGER REFERENCES queues(id) ON DELETE CASCADE,
  -- If queue_id is NULL, these are tenant-wide defaults
  wrap_up_enabled BOOLEAN DEFAULT true,
  default_wrap_up_time_seconds INTEGER DEFAULT 60, -- Default: 60 seconds
  max_wrap_up_time_seconds INTEGER DEFAULT 300, -- Max: 5 minutes
  allow_extension BOOLEAN DEFAULT true,
  extension_time_seconds INTEGER DEFAULT 30, -- Additional time per extension
  max_extensions INTEGER DEFAULT 3,
  auto_available_after_timeout BOOLEAN DEFAULT true,
  force_disposition_code BOOLEAN DEFAULT true, -- Require disposition code before available
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, queue_id)
);

-- Add wrap-up related columns to agents table if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'wrap_up_call_id') THEN
    ALTER TABLE agents ADD COLUMN wrap_up_call_id INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'wrap_up_started_at') THEN
    ALTER TABLE agents ADD COLUMN wrap_up_started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'wrap_up_extensions') THEN
    ALTER TABLE agents ADD COLUMN wrap_up_extensions INTEGER DEFAULT 0;
  END IF;
END$$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_wrap_up_codes_tenant ON wrap_up_codes(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_wrap_up_codes_category ON wrap_up_codes(tenant_id, category) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_call_wrap_ups_tenant ON call_wrap_ups(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_wrap_ups_agent ON call_wrap_ups(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_wrap_ups_call ON call_wrap_ups(call_id);
CREATE INDEX IF NOT EXISTS idx_call_wrap_ups_followup ON call_wrap_ups(tenant_id, follow_up_date)
  WHERE follow_up_required = true AND follow_up_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_wrap_up_settings_tenant ON agent_wrap_up_settings(tenant_id);

-- Create function to update wrap-up duration
CREATE OR REPLACE FUNCTION calculate_wrap_up_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wrap_up_ended_at IS NOT NULL AND NEW.wrap_up_started_at IS NOT NULL THEN
    NEW.wrap_up_duration_seconds := EXTRACT(EPOCH FROM (NEW.wrap_up_ended_at - NEW.wrap_up_started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-calculating wrap-up duration
DROP TRIGGER IF EXISTS trg_calculate_wrap_up_duration ON call_wrap_ups;
CREATE TRIGGER trg_calculate_wrap_up_duration
  BEFORE INSERT OR UPDATE ON call_wrap_ups
  FOR EACH ROW
  EXECUTE FUNCTION calculate_wrap_up_duration();

-- Insert default wrap-up codes for system (can be cloned per tenant)
INSERT INTO wrap_up_codes (tenant_id, code, name, description, category, color, requires_notes, is_default, sort_order)
SELECT
  t.id,
  codes.code,
  codes.name,
  codes.description,
  codes.category,
  codes.color,
  codes.requires_notes,
  codes.is_default,
  codes.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('resolved', 'Issue Resolved', 'Customer issue was fully resolved', 'support', '#10b981', false, true, 1),
  ('callback', 'Callback Required', 'Customer requested callback', 'followup', '#f59e0b', true, false, 2),
  ('escalated', 'Escalated', 'Issue escalated to supervisor/tier 2', 'support', '#ef4444', true, false, 3),
  ('sale_completed', 'Sale Completed', 'Successful sale transaction', 'sales', '#22c55e', false, false, 4),
  ('sale_declined', 'Sale Declined', 'Customer declined offer', 'sales', '#6b7280', false, false, 5),
  ('info_provided', 'Information Provided', 'General information given to customer', 'support', '#3b82f6', false, false, 6),
  ('voicemail', 'Voicemail Left', 'Left voicemail message', 'followup', '#8b5cf6', false, false, 7),
  ('no_answer', 'No Answer', 'Customer did not answer', 'followup', '#6b7280', false, false, 8),
  ('wrong_number', 'Wrong Number', 'Incorrect phone number', 'other', '#ef4444', false, false, 9),
  ('dnd_request', 'DNC Request', 'Customer requested no further contact', 'compliance', '#dc2626', true, false, 10)
) AS codes(code, name, description, category, color, requires_notes, is_default, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM wrap_up_codes wc WHERE wc.tenant_id = t.id AND wc.code = codes.code
);

-- Insert default wrap-up settings for tenants
INSERT INTO agent_wrap_up_settings (tenant_id, queue_id, wrap_up_enabled, default_wrap_up_time_seconds, max_wrap_up_time_seconds)
SELECT t.id, NULL, true, 60, 300
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM agent_wrap_up_settings s WHERE s.tenant_id = t.id AND s.queue_id IS NULL
);

-- Comments for documentation
COMMENT ON TABLE wrap_up_codes IS 'Disposition codes used by agents during post-call wrap-up (ACW)';
COMMENT ON TABLE call_wrap_ups IS 'Records of call dispositions and wrap-up data';
COMMENT ON TABLE agent_wrap_up_settings IS 'Configurable wrap-up time limits per tenant or queue';
COMMENT ON COLUMN call_wrap_ups.auto_completed IS 'True if system auto-completed wrap-up after timeout';
COMMENT ON COLUMN agent_wrap_up_settings.force_disposition_code IS 'If true, agents must select a disposition code before going available';
