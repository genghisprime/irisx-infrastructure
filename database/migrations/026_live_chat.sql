-- Migration 026: Live Chat Widget System
-- Enables embeddable chat widget for customer websites with real-time messaging

-- Create chat_widgets table for widget configuration
CREATE TABLE IF NOT EXISTS chat_widgets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  widget_key VARCHAR(64) UNIQUE NOT NULL, -- Public key for embedding: cw_abc123...
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Appearance customization
  primary_color VARCHAR(7) DEFAULT '#667eea', -- Hex color
  widget_position VARCHAR(20) DEFAULT 'bottom-right', -- bottom-right, bottom-left, top-right, top-left
  greeting_message TEXT DEFAULT 'Hi! How can we help you today?',
  offline_message TEXT DEFAULT 'We are currently offline. Leave us a message!',
  placeholder_text VARCHAR(255) DEFAULT 'Type your message...',
  show_agent_avatars BOOLEAN DEFAULT TRUE,

  -- Behavior settings
  auto_open BOOLEAN DEFAULT FALSE,
  auto_open_delay INTEGER DEFAULT 5, -- seconds
  show_launcher BOOLEAN DEFAULT TRUE,
  allow_file_upload BOOLEAN DEFAULT TRUE,
  max_file_size_mb INTEGER DEFAULT 10,
  require_email BOOLEAN DEFAULT FALSE, -- Require visitor email before chat

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  domains_whitelist TEXT[], -- Allowed domains for embedding

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Indexes for chat_widgets
CREATE INDEX IF NOT EXISTS idx_chat_widgets_tenant_id ON chat_widgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_widgets_widget_key ON chat_widgets(widget_key);
CREATE INDEX IF NOT EXISTS idx_chat_widgets_active ON chat_widgets(tenant_id, is_active);

-- Create chat_conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  widget_id INTEGER NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
  conversation_id VARCHAR(64) UNIQUE NOT NULL, -- cc_abc123...

  -- Visitor information
  visitor_id VARCHAR(255), -- Persistent visitor ID (cookie-based)
  visitor_name VARCHAR(100),
  visitor_email VARCHAR(255),
  visitor_ip VARCHAR(50),
  visitor_user_agent TEXT,
  visitor_location JSONB, -- {country, region, city}

  -- Page context
  page_url TEXT,
  page_title TEXT,
  referrer TEXT,

  -- Chat status
  status VARCHAR(50) DEFAULT 'active', -- active, closed, abandoned
  assigned_agent_id INTEGER REFERENCES users(id),
  assigned_at TIMESTAMPTZ,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_response_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,

  -- Metrics
  message_count INTEGER DEFAULT 0,
  visitor_message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,

  -- Rating
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  rated_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_conversations
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_id ON chat_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_widget_id ON chat_conversations(widget_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_conversation_id ON chat_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_agent ON chat_conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at ON chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_visitor ON chat_conversations(visitor_id);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(64) UNIQUE NOT NULL, -- cm_abc123...

  -- Message content
  sender_type VARCHAR(20) NOT NULL, -- 'visitor', 'agent', 'system'
  sender_id INTEGER REFERENCES users(id), -- NULL for visitors
  sender_name VARCHAR(100),

  -- Message body
  message_type VARCHAR(20) DEFAULT 'text', -- text, image, file, system
  message_text TEXT,

  -- File attachments
  file_url TEXT,
  file_name VARCHAR(255),
  file_size INTEGER, -- bytes
  file_type VARCHAR(100), -- MIME type

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(conversation_id, is_read) WHERE is_read = FALSE;

-- Create chat_agent_presence table for online status
CREATE TABLE IF NOT EXISTS chat_agent_presence (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Status
  status VARCHAR(20) DEFAULT 'online', -- online, away, busy, offline
  status_message TEXT,

  -- Connection info
  socket_id VARCHAR(255),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metrics
  active_chats INTEGER DEFAULT 0,
  max_concurrent_chats INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, agent_id)
);

-- Indexes for chat_agent_presence
CREATE INDEX IF NOT EXISTS idx_chat_agent_presence_tenant ON chat_agent_presence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_agent_presence_status ON chat_agent_presence(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_agent_presence_agent ON chat_agent_presence(agent_id);

-- Create chat_typing_indicators table for real-time typing status
CREATE TABLE IF NOT EXISTS chat_typing_indicators (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL, -- 'visitor', 'agent'
  sender_id INTEGER REFERENCES users(id),
  is_typing BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 seconds'
);

-- Index for chat_typing_indicators
CREATE INDEX IF NOT EXISTS idx_chat_typing_conversation ON chat_typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_typing_expires ON chat_typing_indicators(expires_at);

-- Function to generate widget key
CREATE OR REPLACE FUNCTION generate_chat_widget_key()
RETURNS TEXT AS $$
BEGIN
  RETURN 'cw_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to generate conversation ID
CREATE OR REPLACE FUNCTION generate_conversation_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'cc_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to generate message ID
CREATE OR REPLACE FUNCTION generate_message_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'cm_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    visitor_message_count = CASE WHEN NEW.sender_type = 'visitor' THEN visitor_message_count + 1 ELSE visitor_message_count END,
    agent_message_count = CASE WHEN NEW.sender_type = 'agent' THEN agent_message_count + 1 ELSE agent_message_count END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_chat_message_insert
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_last_message();

-- Trigger to set first_response_at
CREATE OR REPLACE FUNCTION set_first_response_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sender_type = 'agent' THEN
    UPDATE chat_conversations
    SET first_response_at = NEW.created_at
    WHERE id = NEW.conversation_id
      AND first_response_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_agent_message_insert
AFTER INSERT ON chat_messages
FOR EACH ROW
WHEN (NEW.sender_type = 'agent')
EXECUTE FUNCTION set_first_response_at();

-- Function to clean up expired typing indicators
CREATE OR REPLACE FUNCTION cleanup_expired_typing_indicators()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_typing_indicators
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get available agents for chat assignment
CREATE OR REPLACE FUNCTION get_available_chat_agents(p_tenant_id INTEGER)
RETURNS TABLE(
  agent_id INTEGER,
  agent_name VARCHAR,
  active_chats INTEGER,
  max_chats INTEGER,
  availability_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cap.agent_id,
    u.first_name || ' ' || u.last_name as agent_name,
    cap.active_chats,
    cap.max_concurrent_chats,
    -- Lower score = more available
    (cap.active_chats::NUMERIC / NULLIF(cap.max_concurrent_chats, 0)::NUMERIC) as availability_score
  FROM chat_agent_presence cap
  JOIN users u ON cap.agent_id = u.id
  WHERE cap.tenant_id = p_tenant_id
    AND cap.status = 'online'
    AND cap.active_chats < cap.max_concurrent_chats
    AND u.is_active = TRUE
  ORDER BY availability_score ASC, cap.last_seen_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE chat_widgets IS 'Chat widget configurations for embedding on customer websites';
COMMENT ON TABLE chat_conversations IS 'Chat conversations between visitors and agents';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat conversations';
COMMENT ON TABLE chat_agent_presence IS 'Real-time online status of chat agents';
COMMENT ON TABLE chat_typing_indicators IS 'Real-time typing indicators for active chats';

COMMENT ON FUNCTION generate_chat_widget_key IS 'Generate unique widget key (cw_...)';
COMMENT ON FUNCTION generate_conversation_id IS 'Generate unique conversation ID (cc_...)';
COMMENT ON FUNCTION generate_message_id IS 'Generate unique message ID (cm_...)';
COMMENT ON FUNCTION get_available_chat_agents IS 'Get list of available agents sorted by workload';
