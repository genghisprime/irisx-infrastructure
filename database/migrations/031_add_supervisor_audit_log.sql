-- Migration: Add Supervisor Action Audit Log table
-- Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
-- Features: Monitor, Whisper, Barge audit trail

-- Create supervisor action audit log table
CREATE TABLE IF NOT EXISTS supervisor_action_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  supervisor_id INTEGER NOT NULL,  -- References users table (supervisor)
  agent_id INTEGER,                 -- References users table (agent being supervised)
  call_id INTEGER,                  -- References calls table
  call_sid VARCHAR(50),
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('monitor', 'whisper', 'barge', 'stop')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_supervisor_action_tenant ON supervisor_action_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_action_supervisor ON supervisor_action_log(supervisor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_action_agent ON supervisor_action_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_action_call ON supervisor_action_log(call_sid);
CREATE INDEX IF NOT EXISTS idx_supervisor_action_type ON supervisor_action_log(action_type, created_at DESC);

-- Add supervisor session tracking
CREATE TABLE IF NOT EXISTS supervisor_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  supervisor_id INTEGER NOT NULL,
  agent_id INTEGER,
  call_id INTEGER,
  call_sid VARCHAR(50),
  session_uuid VARCHAR(50),       -- FreeSWITCH session UUID for the supervisor leg
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('monitor', 'whisper', 'barge')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active sessions lookup
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_active ON supervisor_sessions(tenant_id, supervisor_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_supervisor_sessions_call ON supervisor_sessions(call_sid, status);

-- Comments for documentation
COMMENT ON TABLE supervisor_action_log IS 'Audit trail for supervisor call monitoring actions (monitor, whisper, barge)';
COMMENT ON COLUMN supervisor_action_log.action_type IS 'monitor=listen only, whisper=speak to agent only, barge=speak to all parties';
COMMENT ON TABLE supervisor_sessions IS 'Active supervisor monitoring sessions for real-time tracking';
