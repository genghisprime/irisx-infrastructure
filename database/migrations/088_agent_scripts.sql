-- Migration: 088_agent_scripts.sql
-- Description: Agent scripts and guided workflows
-- Created: 2026-02-16

-- ============================================
-- AGENT SCRIPTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS agent_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Script content (JSONB array of steps)
    steps JSONB NOT NULL DEFAULT '[]',

    -- Association (optional - can be default, queue-specific, or campaign-specific)
    queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

    -- Flags
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCRIPT OBJECTION HANDLERS
-- ============================================

CREATE TABLE IF NOT EXISTS script_objection_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    script_id UUID REFERENCES agent_scripts(id) ON DELETE CASCADE,

    -- Objection content
    objection VARCHAR(500) NOT NULL, -- The objection text
    response TEXT NOT NULL, -- The suggested response
    category VARCHAR(100) DEFAULT 'general', -- For grouping (pricing, timing, competition, etc.)

    -- Display
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCRIPT USAGE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS script_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    script_id UUID NOT NULL REFERENCES agent_scripts(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,

    -- Progress tracking
    completed_steps JSONB DEFAULT '[]', -- Array of step IDs completed
    collected_data JSONB DEFAULT '{}', -- Data collected during script
    outcome VARCHAR(100), -- final outcome (completed, abandoned, objection, etc.)

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_agent_scripts_tenant ON agent_scripts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_scripts_queue ON agent_scripts(queue_id);
CREATE INDEX IF NOT EXISTS idx_agent_scripts_campaign ON agent_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agent_scripts_default ON agent_scripts(tenant_id, is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_script_objections_script ON script_objection_handlers(script_id);
CREATE INDEX IF NOT EXISTS idx_script_objections_tenant ON script_objection_handlers(tenant_id);

CREATE INDEX IF NOT EXISTS idx_script_usage_script ON script_usage(script_id);
CREATE INDEX IF NOT EXISTS idx_script_usage_agent ON script_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_script_usage_call ON script_usage(call_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_agent_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_scripts_updated_at ON agent_scripts;
CREATE TRIGGER trigger_agent_scripts_updated_at
    BEFORE UPDATE ON agent_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_scripts_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE agent_scripts IS 'Call scripts and guided workflows for agents';
COMMENT ON TABLE script_objection_handlers IS 'Pre-defined objection responses for scripts';
COMMENT ON TABLE script_usage IS 'Tracking of script usage during calls';

COMMENT ON COLUMN agent_scripts.steps IS 'JSONB array of script steps with type, text, responses, etc.';
COMMENT ON COLUMN script_usage.collected_data IS 'Free-form data collected during script execution';
