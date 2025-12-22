-- Migration: Add WebRTC Session Tokens table
-- Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
-- Features: Time-limited session tokens for WebRTC/SIP connections

-- Create webrtc_session_tokens table for secure WebSocket authentication
CREATE TABLE IF NOT EXISTS webrtc_session_tokens (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  extension VARCHAR(20) NOT NULL,
  token VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  UNIQUE(agent_id, extension)
);

-- Create indexes for efficient token validation
CREATE INDEX IF NOT EXISTS idx_webrtc_tokens_lookup ON webrtc_session_tokens(token, extension) WHERE expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_webrtc_tokens_agent ON webrtc_session_tokens(agent_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_tokens_expires ON webrtc_session_tokens(expires_at);

-- Create function to clean up expired tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_webrtc_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webrtc_session_tokens WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add WebRTC-related columns to agents table if not exists
DO $$
BEGIN
  -- Add last_webrtc_connection timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'last_webrtc_connection') THEN
    ALTER TABLE agents ADD COLUMN last_webrtc_connection TIMESTAMPTZ;
  END IF;

  -- Add webrtc_user_agent for tracking client info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'webrtc_user_agent') THEN
    ALTER TABLE agents ADD COLUMN webrtc_user_agent TEXT;
  END IF;

  -- Add sip_registered flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'sip_registered') THEN
    ALTER TABLE agents ADD COLUMN sip_registered BOOLEAN DEFAULT false;
  END IF;

  -- Add sip_registered_at timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'sip_registered_at') THEN
    ALTER TABLE agents ADD COLUMN sip_registered_at TIMESTAMPTZ;
  END IF;
END$$;

-- Create agent_sip_events table for tracking SIP registration events
CREATE TABLE IF NOT EXISTS agent_sip_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  extension VARCHAR(20) NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'register', 'unregister', 'reregister',
    'call_start', 'call_end', 'call_hold', 'call_unhold',
    'transfer', 'conference', 'dtmf'
  )),
  event_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for SIP events
CREATE INDEX IF NOT EXISTS idx_sip_events_tenant ON agent_sip_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sip_events_agent ON agent_sip_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sip_events_extension ON agent_sip_events(extension, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sip_events_type ON agent_sip_events(event_type, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE webrtc_session_tokens IS 'Time-limited tokens for authenticating WebRTC/SIP WebSocket connections';
COMMENT ON COLUMN webrtc_session_tokens.token IS '64-character hex token for session authentication';
COMMENT ON COLUMN webrtc_session_tokens.expires_at IS 'Token expiration timestamp (typically 1-8 hours)';
COMMENT ON TABLE agent_sip_events IS 'Audit trail of SIP registration and call events per agent';
COMMENT ON COLUMN agent_sip_events.event_type IS 'Type of SIP event (register, call_start, etc.)';
