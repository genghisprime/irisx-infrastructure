-- Migration 012: Unified Inbox - Conversations System
-- Purpose: Cross-channel conversation management for SMS, Email, WhatsApp, Social
-- Date: 2025-11-01
-- Replaces per-channel silos with unified agent inbox

-- ======================
-- CONVERSATIONS TABLE (Unified across all channels)
-- ======================
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Channel Info
  channel VARCHAR(50) NOT NULL, -- 'sms', 'email', 'whatsapp', 'discord', 'slack', 'telegram', 'teams', 'voice'
  channel_conversation_id VARCHAR(255), -- Link to channel-specific ID (email thread_id, whatsapp conversation_id, etc.)

  -- Participants
  customer_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  customer_identifier VARCHAR(255) NOT NULL, -- phone number, email, @username, etc.
  customer_name VARCHAR(255),

  -- Assignment
  assigned_agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by VARCHAR(50), -- 'auto', 'manual', 'round-robin', 'skills-based', 'workload-based'

  -- Status
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'pending', 'closed', 'snoozed'
  priority VARCHAR(20) DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'

  -- Content
  subject VARCHAR(500), -- For emails, general topic for others
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT, -- First 200 chars of last message
  last_message_direction VARCHAR(20), -- 'inbound', 'outbound'

  -- Metrics
  message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  customer_message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0, -- Unread messages from customer

  -- Response Time Tracking
  first_response_at TIMESTAMPTZ,
  first_response_time_seconds INTEGER, -- Time to first agent response (seconds)
  avg_response_time_seconds INTEGER,
  last_agent_response_at TIMESTAMPTZ,

  -- Tags & Categories
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['billing', 'technical', 'vip']
  category VARCHAR(100), -- 'support', 'sales', 'general', 'complaint'

  -- SLA (Service Level Agreement)
  sla_due_at TIMESTAMPTZ, -- When response is due
  sla_breached BOOLEAN DEFAULT false,
  sla_response_time_seconds INTEGER, -- Expected response time for this priority

  -- Sentiment Analysis (optional, for future AI features)
  sentiment VARCHAR(20), -- 'positive', 'neutral', 'negative', 'angry'
  sentiment_score DECIMAL(3,2), -- -1.00 to 1.00

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,

  -- Metadata (channel-specific data)
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_assigned_agent ON conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_conversations_status ON conversations(status) WHERE status IN ('open', 'pending') AND deleted_at IS NULL;
CREATE INDEX idx_conversations_channel ON conversations(channel, tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_customer ON conversations(customer_id) WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_conversations_priority ON conversations(priority, status) WHERE status = 'open' AND deleted_at IS NULL;
CREATE INDEX idx_conversations_sla ON conversations(sla_due_at) WHERE sla_breached = false AND status = 'open' AND deleted_at IS NULL;
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_unread ON conversations(tenant_id, assigned_agent_id, unread_count) WHERE unread_count > 0 AND deleted_at IS NULL;

-- Full text search on subject
CREATE INDEX idx_conversations_subject_search ON conversations USING gin(to_tsvector('english', COALESCE(subject, ''))) WHERE deleted_at IS NULL;


-- ======================
-- CONVERSATION_MESSAGES TABLE (Unified message log)
-- ======================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message Details
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  sender_type VARCHAR(20), -- 'customer', 'agent', 'system', 'bot'
  sender_id BIGINT, -- user_id if agent, contact_id if customer
  sender_name VARCHAR(255),
  sender_identifier VARCHAR(255), -- phone, email, @username

  -- Content
  content_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file', 'audio', 'video', 'location'
  content TEXT,
  content_html TEXT, -- For emails with HTML formatting

  -- Attachments
  attachments JSONB, -- [{"url": "s3://...", "filename": "doc.pdf", "type": "application/pdf", "size": 1024}]

  -- Channel-Specific Reference
  channel_message_id VARCHAR(255), -- Link to sms_messages.id, emails.id, whatsapp_messages.id, etc.

  -- Status (for outbound messages)
  status VARCHAR(50), -- 'queued', 'sent', 'delivered', 'read', 'failed'
  error_message TEXT,

  -- Read tracking
  read_by_agent BOOLEAN DEFAULT false,
  read_by_agent_at TIMESTAMPTZ,
  read_by_customer BOOLEAN DEFAULT false,
  read_by_customer_at TIMESTAMPTZ,

  -- Internal notes (not visible to customer)
  is_internal_note BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_conversation_messages_conversation ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversation_messages_channel_ref ON conversation_messages(channel_message_id) WHERE channel_message_id IS NOT NULL;
CREATE INDEX idx_conversation_messages_direction ON conversation_messages(conversation_id, direction);
CREATE INDEX idx_conversation_messages_unread ON conversation_messages(conversation_id) WHERE direction = 'inbound' AND read_by_agent = false;

-- Full text search on content
CREATE INDEX idx_conversation_messages_content_search ON conversation_messages USING gin(to_tsvector('english', COALESCE(content, '')));


-- ======================
-- CONVERSATION_ASSIGNMENTS TABLE (Assignment history & audit trail)
-- ======================
CREATE TABLE IF NOT EXISTS conversation_assignments (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Assignment
  agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL, -- Who assigned it (admin, or NULL for auto)
  assignment_method VARCHAR(50), -- 'manual', 'auto', 'round-robin', 'skills-based', 'workload-based', 'claimed'

  -- Timestamps
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,

  -- Reason for reassignment
  reason TEXT, -- 'Agent unavailable', 'Escalated to specialist', 'Agent requested reassignment', etc.

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_conversation_assignments_conversation ON conversation_assignments(conversation_id, assigned_at DESC);
CREATE INDEX idx_conversation_assignments_agent ON conversation_assignments(agent_id, assigned_at DESC) WHERE agent_id IS NOT NULL;


-- ======================
-- CONVERSATION_TAGS TABLE (Many-to-many for structured tags)
-- ======================
CREATE TABLE IF NOT EXISTS conversation_tags (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Tag info
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20), -- Hex color for UI: '#3B82F6'
  description TEXT,

  -- Usage stats
  usage_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_conversation_tags_tenant ON conversation_tags(tenant_id);


-- ======================
-- TRIGGERS
-- ======================

-- Update conversation updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_conversation_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();


-- Update conversation stats when message is added
CREATE OR REPLACE FUNCTION update_conversation_on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    message_count = message_count + 1,
    agent_message_count = agent_message_count + CASE WHEN NEW.direction = 'outbound' AND NEW.sender_type = 'agent' THEN 1 ELSE 0 END,
    customer_message_count = customer_message_count + CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
    unread_count = unread_count + CASE WHEN NEW.direction = 'inbound' AND NEW.read_by_agent = false THEN 1 ELSE 0 END,
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 200),
    last_message_direction = NEW.direction,
    updated_at = NOW(),
    -- Calculate first response time if this is first agent message
    first_response_at = CASE
      WHEN first_response_at IS NULL AND NEW.direction = 'outbound' AND NEW.sender_type = 'agent'
      THEN NEW.created_at
      ELSE first_response_at
    END,
    first_response_time_seconds = CASE
      WHEN first_response_at IS NULL AND NEW.direction = 'outbound' AND NEW.sender_type = 'agent'
      THEN EXTRACT(EPOCH FROM (NEW.created_at - created_at))::INTEGER
      ELSE first_response_time_seconds
    END,
    last_agent_response_at = CASE
      WHEN NEW.direction = 'outbound' AND NEW.sender_type = 'agent'
      THEN NEW.created_at
      ELSE last_agent_response_at
    END
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_on_new_message
AFTER INSERT ON conversation_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_on_new_message();


-- Decrement unread count when message is marked as read
CREATE OR REPLACE FUNCTION update_conversation_on_message_read()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.read_by_agent = false AND NEW.read_by_agent = true AND NEW.direction = 'inbound' THEN
    UPDATE conversations
    SET
      unread_count = GREATEST(unread_count - 1, 0),
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_on_message_read
AFTER UPDATE ON conversation_messages
FOR EACH ROW
WHEN (OLD.read_by_agent IS DISTINCT FROM NEW.read_by_agent)
EXECUTE FUNCTION update_conversation_on_message_read();


-- Log conversation assignment changes
CREATE OR REPLACE FUNCTION log_conversation_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- If assignment changed
  IF OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id THEN
    -- Mark previous assignment as ended
    IF OLD.assigned_agent_id IS NOT NULL THEN
      UPDATE conversation_assignments
      SET unassigned_at = NOW()
      WHERE conversation_id = NEW.id
        AND agent_id = OLD.assigned_agent_id
        AND unassigned_at IS NULL;
    END IF;

    -- Create new assignment record if assigned to someone
    IF NEW.assigned_agent_id IS NOT NULL THEN
      INSERT INTO conversation_assignments (
        conversation_id,
        agent_id,
        assignment_method,
        assigned_at
      ) VALUES (
        NEW.id,
        NEW.assigned_agent_id,
        NEW.assigned_by,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_conversation_assignment
AFTER UPDATE ON conversations
FOR EACH ROW
WHEN (OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id)
EXECUTE FUNCTION log_conversation_assignment();


-- ======================
-- VIEWS
-- ======================

-- Agent inbox summary
CREATE OR REPLACE VIEW agent_inbox_summary AS
SELECT
  u.id as agent_id,
  u.tenant_id,
  u.first_name,
  u.last_name,
  u.email,
  COUNT(c.id) FILTER (WHERE c.status = 'open') as open_conversations,
  COUNT(c.id) FILTER (WHERE c.status = 'pending') as pending_conversations,
  SUM(c.unread_count) FILTER (WHERE c.status IN ('open', 'pending')) as total_unread,
  COUNT(c.id) FILTER (WHERE c.sla_due_at < NOW() AND c.sla_breached = false AND c.status = 'open') as sla_at_risk,
  COUNT(c.id) FILTER (WHERE c.sla_breached = true AND c.status = 'open') as sla_breached,
  MAX(c.updated_at) FILTER (WHERE c.status IN ('open', 'pending')) as last_conversation_updated
FROM users u
LEFT JOIN conversations c ON u.id = c.assigned_agent_id AND c.deleted_at IS NULL
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id, u.first_name, u.last_name, u.email;


-- Conversation details view (for inbox list)
CREATE OR REPLACE VIEW conversation_inbox AS
SELECT
  c.id,
  c.uuid,
  c.tenant_id,
  c.channel,
  c.customer_identifier,
  c.customer_name,
  c.assigned_agent_id,
  CONCAT(u.first_name, ' ', u.last_name) as assigned_agent_name,
  c.status,
  c.priority,
  c.subject,
  c.last_message_at,
  c.last_message_preview,
  c.last_message_direction,
  c.message_count,
  c.unread_count,
  c.tags,
  c.category,
  c.sla_due_at,
  c.sla_breached,
  c.created_at,
  c.updated_at,
  -- Time since last message (for sorting by urgency)
  EXTRACT(EPOCH FROM (NOW() - c.last_message_at))::INTEGER as seconds_since_last_message,
  -- Is overdue for response
  CASE
    WHEN c.sla_due_at IS NOT NULL AND c.sla_due_at < NOW() AND c.sla_breached = false
    THEN true
    ELSE false
  END as is_overdue
FROM conversations c
LEFT JOIN users u ON c.assigned_agent_id = u.id
WHERE c.deleted_at IS NULL;


-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Get next agent for round-robin assignment
CREATE OR REPLACE FUNCTION get_next_round_robin_agent(p_tenant_id BIGINT, p_channel VARCHAR)
RETURNS BIGINT AS $$
DECLARE
  v_agent_id BIGINT;
BEGIN
  -- Find agent with fewest active conversations
  SELECT u.id INTO v_agent_id
  FROM users u
  LEFT JOIN conversations c ON u.id = c.assigned_agent_id
    AND c.status IN ('open', 'pending')
    AND c.deleted_at IS NULL
  WHERE u.tenant_id = p_tenant_id
    AND u.status = 'active'
    AND u.deleted_at IS NULL
    AND u.role IN ('agent', 'supervisor', 'admin')
  GROUP BY u.id
  ORDER BY COUNT(c.id) ASC, RANDOM() -- Fewest conversations, random tiebreaker
  LIMIT 1;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql;


-- Auto-assign conversation
CREATE OR REPLACE FUNCTION auto_assign_conversation(
  p_conversation_id BIGINT,
  p_method VARCHAR DEFAULT 'round-robin'
) RETURNS BIGINT AS $$
DECLARE
  v_tenant_id BIGINT;
  v_channel VARCHAR;
  v_agent_id BIGINT;
BEGIN
  -- Get conversation details
  SELECT tenant_id, channel INTO v_tenant_id, v_channel
  FROM conversations
  WHERE id = p_conversation_id;

  -- Get next agent based on method
  IF p_method = 'round-robin' THEN
    v_agent_id := get_next_round_robin_agent(v_tenant_id, v_channel);
  -- Add more methods here: skills-based, workload-based, etc.
  END IF;

  -- Assign if agent found
  IF v_agent_id IS NOT NULL THEN
    UPDATE conversations
    SET
      assigned_agent_id = v_agent_id,
      assigned_at = NOW(),
      assigned_by = p_method,
      updated_at = NOW()
    WHERE id = p_conversation_id;
  END IF;

  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql;


-- ======================
-- COMMENTS
-- ======================
COMMENT ON TABLE conversations IS 'Unified inbox - all customer conversations across channels (SMS, Email, WhatsApp, Social, Voice)';
COMMENT ON TABLE conversation_messages IS 'Individual messages within conversations, linked to channel-specific message tables';
COMMENT ON TABLE conversation_assignments IS 'Assignment history and audit trail for conversations';
COMMENT ON TABLE conversation_tags IS 'Predefined tags for categorizing conversations';

COMMENT ON COLUMN conversations.channel IS 'Communication channel: sms, email, whatsapp, discord, slack, telegram, teams, voice';
COMMENT ON COLUMN conversations.status IS 'open = needs response, pending = waiting on customer, closed = resolved, snoozed = temporarily hidden';
COMMENT ON COLUMN conversations.priority IS 'urgent = < 15min SLA, high = < 1hr, normal = < 4hr, low = < 24hr';
COMMENT ON COLUMN conversations.sla_due_at IS 'Calculated based on priority + creation time. When response is due.';
COMMENT ON COLUMN conversation_messages.is_internal_note IS 'Internal agent notes not visible to customer';
