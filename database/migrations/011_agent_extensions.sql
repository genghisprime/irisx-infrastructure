-- Migration 011: Agent Extensions & Provisioning
-- Purpose: Auto-provisioning system for Agent Desktop WebRTC extensions
-- Date: October 31, 2025

-- ============================================================================
-- 1. Agent Extensions Table
-- ============================================================================
-- Manages SIP extensions for agents (WebRTC calling)
-- Each tenant gets 1000 extensions (e.g., Tenant 7 = 7000-7999)

CREATE TABLE IF NOT EXISTS agent_extensions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = available, set = assigned
  extension VARCHAR(10) NOT NULL,
  sip_password VARCHAR(255) NOT NULL, -- Hashed with bcrypt
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
  voicemail_enabled BOOLEAN DEFAULT true,

  -- Metadata
  assigned_at TIMESTAMP, -- When assigned to user
  last_login_at TIMESTAMP, -- Last WebRTC connection
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(tenant_id, extension), -- Each tenant has unique extension namespace
  CHECK (status IN ('active', 'suspended', 'deleted')),
  CHECK (extension ~ '^[0-9]+$') -- Only numeric extensions
);

-- Indexes for performance
CREATE INDEX idx_agent_extensions_tenant_user ON agent_extensions(tenant_id, user_id);
CREATE INDEX idx_agent_extensions_status ON agent_extensions(tenant_id, status);
CREATE INDEX idx_agent_extensions_available ON agent_extensions(tenant_id) WHERE user_id IS NULL AND status = 'active';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_extension_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;

  -- Set assigned_at when user_id is set
  IF NEW.user_id IS NOT NULL AND OLD.user_id IS NULL THEN
    NEW.assigned_at = CURRENT_TIMESTAMP;
  END IF;

  -- Clear assigned_at when user_id is cleared
  IF NEW.user_id IS NULL AND OLD.user_id IS NOT NULL THEN
    NEW.assigned_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_extension_timestamp
BEFORE UPDATE ON agent_extensions
FOR EACH ROW
EXECUTE FUNCTION update_agent_extension_timestamp();

-- ============================================================================
-- 2. FreeSWITCH Clusters Table (for future multi-region support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS freeswitch_clusters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL, -- us-east-1, us-west-2, eu-west-1
  ip_address VARCHAR(50) NOT NULL,
  websocket_url VARCHAR(255) NOT NULL, -- wss://ip:8066
  max_concurrent_calls INTEGER DEFAULT 500,
  max_tenants INTEGER DEFAULT 50,
  current_tenants INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- active, maintenance, offline
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CHECK (status IN ('active', 'maintenance', 'offline'))
);

-- Insert default cluster (current FreeSWITCH server)
INSERT INTO freeswitch_clusters (name, region, ip_address, websocket_url, max_concurrent_calls, max_tenants)
VALUES (
  'Primary US East',
  'us-east-1',
  '54.160.220.243',
  'wss://54.160.220.243:8066',
  500,
  100
) ON CONFLICT DO NOTHING;

-- Add cluster reference to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS freeswitch_cluster_id INTEGER REFERENCES freeswitch_clusters(id) DEFAULT 1;

-- ============================================================================
-- 3. Extension Pool Pre-Generation Helper Function
-- ============================================================================
-- Generates a pool of available extensions for a tenant

CREATE OR REPLACE FUNCTION generate_extension_pool(
  p_tenant_id INTEGER,
  p_count INTEGER DEFAULT 10
)
RETURNS TABLE(extension VARCHAR, password VARCHAR) AS $$
DECLARE
  v_extension_base INTEGER;
  v_next_extension INTEGER;
  v_sip_password VARCHAR;
  v_extension VARCHAR;
BEGIN
  -- Calculate extension base (tenant_id + 1) * 1000
  -- Tenant 1 = 2000-2999, Tenant 7 = 8000-8999, etc.
  v_extension_base := (p_tenant_id + 1) * 1000;

  -- Find the last extension for this tenant
  SELECT COALESCE(MAX(CAST(ae.extension AS INTEGER)), v_extension_base - 1)
  INTO v_next_extension
  FROM agent_extensions ae
  WHERE ae.tenant_id = p_tenant_id;

  -- Generate extensions
  FOR i IN 1..p_count LOOP
    v_next_extension := v_next_extension + 1;
    v_extension := v_next_extension::VARCHAR;

    -- Generate random password (will be hashed by application)
    v_sip_password := encode(gen_random_bytes(32), 'hex');

    -- Check if extension already exists
    IF NOT EXISTS (
      SELECT 1 FROM agent_extensions
      WHERE tenant_id = p_tenant_id AND extension = v_extension
    ) THEN
      extension := v_extension;
      password := v_sip_password;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Get Next Available Extension Function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_available_extension(
  p_tenant_id INTEGER,
  p_user_id INTEGER
)
RETURNS VARCHAR AS $$
DECLARE
  v_extension VARCHAR;
BEGIN
  -- Try to find an unassigned extension
  SELECT extension INTO v_extension
  FROM agent_extensions
  WHERE tenant_id = p_tenant_id
    AND user_id IS NULL
    AND status = 'active'
  ORDER BY CAST(extension AS INTEGER) ASC
  LIMIT 1;

  -- If found, assign it
  IF v_extension IS NOT NULL THEN
    UPDATE agent_extensions
    SET user_id = p_user_id, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = p_tenant_id AND extension = v_extension;

    RETURN v_extension;
  END IF;

  -- No available extensions, return NULL
  -- Application will create a new one
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Agent Stats View
-- ============================================================================

CREATE OR REPLACE VIEW agent_stats AS
SELECT
  ae.tenant_id,
  ae.user_id,
  u.email,
  u.first_name,
  u.last_name,
  COUNT(ae.id) as total_extensions,
  COUNT(ae.id) FILTER (WHERE ae.status = 'active') as active_extensions,
  MAX(ae.last_login_at) as last_login_at,
  MIN(ae.assigned_at) as first_assigned_at
FROM agent_extensions ae
LEFT JOIN users u ON u.id = ae.user_id
WHERE ae.user_id IS NOT NULL
GROUP BY ae.tenant_id, ae.user_id, u.email, u.first_name, u.last_name;

-- ============================================================================
-- 6. Tenant Extension Stats View
-- ============================================================================

CREATE OR REPLACE VIEW tenant_extension_stats AS
SELECT
  t.id as tenant_id,
  t.company_name,
  COUNT(ae.id) as total_extensions,
  COUNT(ae.id) FILTER (WHERE ae.user_id IS NOT NULL) as assigned_extensions,
  COUNT(ae.id) FILTER (WHERE ae.user_id IS NULL) as available_extensions,
  COUNT(ae.id) FILTER (WHERE ae.status = 'active') as active_extensions,
  COUNT(ae.id) FILTER (WHERE ae.status = 'suspended') as suspended_extensions
FROM tenants t
LEFT JOIN agent_extensions ae ON ae.tenant_id = t.id
GROUP BY t.id, t.company_name;

-- ============================================================================
-- 7. Pre-Generate Extension Pool for Existing Tenants
-- ============================================================================
-- Create 10 extensions for each existing tenant

DO $$
DECLARE
  tenant_record RECORD;
  ext_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    -- Generate 10 extensions per tenant
    FOR ext_record IN SELECT * FROM generate_extension_pool(tenant_record.id, 10) LOOP
      INSERT INTO agent_extensions (tenant_id, extension, sip_password, status)
      VALUES (
        tenant_record.id,
        ext_record.extension,
        ext_record.password, -- Will be hashed by application on first use
        'active'
      )
      ON CONFLICT (tenant_id, extension) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Generated extensions for tenant %', tenant_record.id;
  END LOOP;
END $$;

-- ============================================================================
-- 8. Comments for Documentation
-- ============================================================================

COMMENT ON TABLE agent_extensions IS 'SIP extensions for Agent Desktop WebRTC calling';
COMMENT ON COLUMN agent_extensions.extension IS 'SIP extension number (e.g., 8001 for tenant 7)';
COMMENT ON COLUMN agent_extensions.sip_password IS 'Bcrypt hashed SIP password for WebRTC authentication';
COMMENT ON COLUMN agent_extensions.user_id IS 'NULL = available in pool, set = assigned to agent';
COMMENT ON TABLE freeswitch_clusters IS 'FreeSWITCH server clusters for multi-region support';
COMMENT ON FUNCTION generate_extension_pool IS 'Pre-generates a pool of extensions for a tenant';
COMMENT ON FUNCTION get_next_available_extension IS 'Assigns the next available extension to a user';

-- Migration complete
SELECT 'Migration 011 complete: Agent extensions system ready' as status;
