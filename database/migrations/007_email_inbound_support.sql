/**
 * Migration: Email Inbound Support
 * Week 13-14, Phase 1
 *
 * Adds support for receiving inbound emails, reply threading, and routing rules
 */

-- Add inbound email fields to emails table
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS in_reply_to VARCHAR(255),
  ADD COLUMN IF NOT EXISTS references TEXT, -- Full References header for threading
  ADD COLUMN IF NOT EXISTS raw_email_s3_key TEXT, -- S3 key for full MIME email
  ADD COLUMN IF NOT EXISTS parsed_headers JSONB, -- Parsed email headers
  ADD COLUMN IF NOT EXISTS spam_score DECIMAL(5,2), -- Spam score (0-100)
  ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;

-- Add index for thread lookups
CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_in_reply_to ON emails(in_reply_to);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);

-- Update email_attachments table to include virus scan results
ALTER TABLE email_attachments
  ADD COLUMN IF NOT EXISTS virus_scan_status VARCHAR(20) DEFAULT 'pending' CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error')),
  ADD COLUMN IF NOT EXISTS virus_scan_result JSONB,
  ADD COLUMN IF NOT EXISTS virus_scanned_at TIMESTAMP;

-- Create email routing rules table
CREATE TABLE IF NOT EXISTS email_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Matching patterns (regex supported)
  from_pattern VARCHAR(255), -- Match sender email
  to_pattern VARCHAR(255), -- Match recipient email
  subject_pattern VARCHAR(255), -- Match subject line
  body_pattern VARCHAR(255), -- Match email body content

  -- Actions to perform
  webhook_url TEXT, -- Forward to webhook URL
  forward_to_email VARCHAR(255), -- Forward to this email
  auto_response_template_id UUID REFERENCES email_templates(id), -- Send auto-response
  tag VARCHAR(100), -- Tag email with this value

  -- Configuration
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 0, -- Higher priority rules evaluated first
  stop_processing BOOLEAN DEFAULT false, -- Stop evaluating rules after this one matches

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT valid_action CHECK (
    webhook_url IS NOT NULL OR
    forward_to_email IS NOT NULL OR
    auto_response_template_id IS NOT NULL OR
    tag IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_email_routing_rules_tenant ON email_routing_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_routing_rules_enabled ON email_routing_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_email_routing_rules_priority ON email_routing_rules(priority DESC);

-- Create email routing executions table (for tracking rule execution)
CREATE TABLE IF NOT EXISTS email_routing_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES email_routing_rules(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  matched_at TIMESTAMP DEFAULT NOW(),
  action_taken VARCHAR(50), -- 'webhook', 'forward', 'auto_response', 'tag'
  action_result JSONB, -- Result of the action (webhook response, etc.)
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_routing_executions_rule ON email_routing_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_email_routing_executions_email ON email_routing_executions(email_id);

-- Create inbound email stats view
CREATE OR REPLACE VIEW email_inbound_stats AS
SELECT
  e.tenant_id,
  COUNT(*) FILTER (WHERE e.direction = 'inbound') as total_inbound,
  COUNT(*) FILTER (WHERE e.direction = 'inbound' AND e.is_spam = true) as spam_count,
  COUNT(*) FILTER (WHERE e.direction = 'inbound' AND e.thread_id IS NOT NULL) as replies_count,
  COUNT(DISTINCT e.thread_id) FILTER (WHERE e.direction = 'inbound') as unique_threads,
  AVG(e.spam_score) FILTER (WHERE e.direction = 'inbound') as avg_spam_score,
  COUNT(DISTINCT DATE(e.created_at)) as active_days,
  DATE_TRUNC('day', MIN(e.created_at)) FILTER (WHERE e.direction = 'inbound') as first_inbound_date,
  DATE_TRUNC('day', MAX(e.created_at)) FILTER (WHERE e.direction = 'inbound') as last_inbound_date
FROM emails e
WHERE e.direction = 'inbound'
GROUP BY e.tenant_id;

-- Create routing rules performance view
CREATE OR REPLACE VIEW email_routing_performance AS
SELECT
  r.id as rule_id,
  r.tenant_id,
  r.name as rule_name,
  r.enabled,
  COUNT(e.id) as executions_count,
  COUNT(e.id) FILTER (WHERE e.success = true) as successful_executions,
  COUNT(e.id) FILTER (WHERE e.success = false) as failed_executions,
  ROUND(
    COUNT(e.id) FILTER (WHERE e.success = true)::numeric /
    NULLIF(COUNT(e.id), 0) * 100,
    2
  ) as success_rate,
  MAX(e.matched_at) as last_execution,
  COUNT(DISTINCT e.email_id) as unique_emails_matched
FROM email_routing_rules r
LEFT JOIN email_routing_executions e ON r.id = e.rule_id
GROUP BY r.id, r.tenant_id, r.name, r.enabled;

-- Function to automatically create thread_id for inbound emails
CREATE OR REPLACE FUNCTION create_email_thread_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an inbound email with an In-Reply-To header
  IF NEW.direction = 'inbound' AND NEW.in_reply_to IS NOT NULL THEN
    -- Try to find the parent email's thread
    SELECT thread_id INTO NEW.thread_id
    FROM emails
    WHERE message_id = NEW.in_reply_to
    LIMIT 1;

    -- If parent email doesn't have a thread, use parent's message_id
    IF NEW.thread_id IS NULL THEN
      SELECT id INTO NEW.thread_id
      FROM emails
      WHERE message_id = NEW.in_reply_to
      LIMIT 1;
    END IF;
  END IF;

  -- If still no thread_id and this is part of a conversation, create new thread
  IF NEW.thread_id IS NULL AND NEW.in_reply_to IS NOT NULL THEN
    NEW.thread_id := gen_random_uuid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic thread creation
DROP TRIGGER IF EXISTS trigger_create_email_thread ON emails;
CREATE TRIGGER trigger_create_email_thread
  BEFORE INSERT ON emails
  FOR EACH ROW
  EXECUTE FUNCTION create_email_thread_id();

-- Function to get email thread (all related emails)
CREATE OR REPLACE FUNCTION get_email_thread(p_email_id UUID)
RETURNS TABLE (
  id UUID,
  direction VARCHAR(10),
  from_email VARCHAR(255),
  to_email VARCHAR(255),
  subject TEXT,
  created_at TIMESTAMP,
  status VARCHAR(20),
  is_spam BOOLEAN
) AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  -- Get the thread_id for the given email
  SELECT thread_id INTO v_thread_id
  FROM emails
  WHERE emails.id = p_email_id;

  -- If no thread_id, just return the single email
  IF v_thread_id IS NULL THEN
    RETURN QUERY
    SELECT
      e.id,
      e.direction,
      e.from_email,
      e.to_email,
      e.subject,
      e.created_at,
      e.status,
      e.is_spam
    FROM emails e
    WHERE e.id = p_email_id;
  ELSE
    -- Return all emails in the thread
    RETURN QUERY
    SELECT
      e.id,
      e.direction,
      e.from_email,
      e.to_email,
      e.subject,
      e.created_at,
      e.status,
      e.is_spam
    FROM emails e
    WHERE e.thread_id = v_thread_id
    ORDER BY e.created_at ASC;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN emails.direction IS 'Email direction: inbound (received) or outbound (sent)';
COMMENT ON COLUMN emails.thread_id IS 'UUID linking related emails in a conversation thread';
COMMENT ON COLUMN emails.in_reply_to IS 'Message-ID of the email this is replying to';
COMMENT ON COLUMN emails.references IS 'Full References header for proper threading';
COMMENT ON COLUMN emails.raw_email_s3_key IS 'S3 key for the complete raw MIME email';
COMMENT ON COLUMN emails.parsed_headers IS 'JSON object containing all parsed email headers';
COMMENT ON COLUMN emails.spam_score IS 'Spam score from 0-100 (higher = more likely spam)';

COMMENT ON TABLE email_routing_rules IS 'Rules for routing inbound emails to webhooks, forwards, or auto-responses';
COMMENT ON TABLE email_routing_executions IS 'Audit log of email routing rule executions';

COMMENT ON VIEW email_inbound_stats IS 'Statistics for inbound email processing per tenant';
COMMENT ON VIEW email_routing_performance IS 'Performance metrics for email routing rules';

-- Grant permissions
GRANT SELECT ON email_inbound_stats TO api_user;
GRANT SELECT ON email_routing_performance TO api_user;
GRANT ALL ON email_routing_rules TO api_user;
GRANT ALL ON email_routing_executions TO api_user;

-- Insert default routing rule examples (commented out - for reference)
/*
INSERT INTO email_routing_rules (tenant_id, name, description, to_pattern, webhook_url, enabled, priority)
VALUES
  -- Example: Forward support emails to webhook
  (
    '00000000-0000-0000-0000-000000000000', -- Replace with actual tenant_id
    'Support Email Router',
    'Forward all emails to support@ to webhook for ticket creation',
    '^support@',
    'https://api.example.com/webhooks/support-email',
    true,
    10
  ),

  -- Example: Auto-respond to sales inquiries
  (
    '00000000-0000-0000-0000-000000000000',
    'Sales Auto-Responder',
    'Send automatic response to sales inquiries',
    '^sales@',
    NULL, -- No webhook
    true,
    5
  );
*/
