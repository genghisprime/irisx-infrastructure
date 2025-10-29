-- Migration: Email API System
-- Phase 1, Week 11-12
-- Transactional and marketing email capabilities

-- Email providers (SendGrid, AWS SES, Postmark, etc.)
CREATE TABLE email_providers (
  id SERIAL PRIMARY KEY,
  provider_name VARCHAR(50) UNIQUE NOT NULL, -- sendgrid, aws_ses, postmark, mailgun
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '{}', -- {transactional, marketing, webhooks}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default email providers
INSERT INTO email_providers (provider_name, capabilities) VALUES
  ('sendgrid', '{"transactional": true, "marketing": true, "webhooks": true}'::jsonb),
  ('aws_ses', '{"transactional": true, "marketing": false, "webhooks": true}'::jsonb),
  ('postmark', '{"transactional": true, "marketing": false, "webhooks": true}'::jsonb),
  ('mailgun', '{"transactional": true, "marketing": true, "webhooks": true}'::jsonb);

-- Tenant email configuration
CREATE TABLE tenant_email_config (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_provider_id INTEGER REFERENCES email_providers(id),

  -- Provider credentials (encrypted)
  api_key VARCHAR(255),
  api_secret VARCHAR(255),

  -- Sending configuration
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  reply_to_email VARCHAR(255),

  -- Domain verification
  domain VARCHAR(255),
  domain_verified BOOLEAN DEFAULT false,
  domain_verified_at TIMESTAMPTZ,

  -- Limits
  daily_send_limit INTEGER DEFAULT 1000,
  monthly_send_limit INTEGER DEFAULT 30000,

  -- Features
  tracking_enabled BOOLEAN DEFAULT true,
  open_tracking_enabled BOOLEAN DEFAULT true,
  click_tracking_enabled BOOLEAN DEFAULT true,

  -- Statistics
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_email_config_tenant ON tenant_email_config(tenant_id);

-- Outbound emails
CREATE TABLE emails (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Message identification
  message_id VARCHAR(255) UNIQUE NOT NULL, -- Provider message ID
  internal_id UUID DEFAULT gen_random_uuid(),

  -- Sender/Recipient
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  cc_emails TEXT[], -- Array of CC emails
  bcc_emails TEXT[], -- Array of BCC emails
  reply_to_email VARCHAR(255),

  -- Content
  subject VARCHAR(500) NOT NULL,
  body_text TEXT, -- Plain text version
  body_html TEXT, -- HTML version

  -- Attachments
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'queued', -- queued, sent, delivered, bounced, failed, opened, clicked
  status_message TEXT,

  -- Delivery tracking
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Engagement
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  bounce_type VARCHAR(50), -- hard, soft, block
  bounce_reason TEXT,

  -- Classification
  email_type VARCHAR(50) DEFAULT 'transactional', -- transactional, marketing
  tags TEXT[], -- Array of tags

  -- Cost tracking
  cost_cents INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked'))
);

CREATE INDEX idx_emails_tenant ON emails(tenant_id);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_message_id ON emails(message_id);
CREATE INDEX idx_emails_to_email ON emails(to_email);
CREATE INDEX idx_emails_from_email ON emails(from_email);
CREATE INDEX idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX idx_emails_sent_at ON emails(sent_at DESC) WHERE sent_at IS NOT NULL;

-- Email attachments
CREATE TABLE email_attachments (
  id BIGSERIAL PRIMARY KEY,
  email_id BIGINT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- File details
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100),
  size_bytes BIGINT,

  -- Storage
  storage_path VARCHAR(500), -- S3 path
  storage_url VARCHAR(500), -- Public URL if applicable

  -- Inline vs attachment
  disposition VARCHAR(20) DEFAULT 'attachment', -- attachment, inline
  content_id VARCHAR(255), -- For inline images

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email ON email_attachments(email_id);
CREATE INDEX idx_email_attachments_tenant ON email_attachments(tenant_id);

-- Email templates
CREATE TABLE email_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Template identification
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,

  -- Content
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,

  -- Variables/Placeholders
  variables JSONB DEFAULT '[]', -- ["name", "order_id", "amount"]

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Usage stats
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_email_templates_tenant ON email_templates(tenant_id);
CREATE INDEX idx_email_templates_slug ON email_templates(slug);
CREATE INDEX idx_email_templates_active ON email_templates(is_active) WHERE is_active = true;

-- Email events (webhooks from providers)
CREATE TABLE email_events (
  id BIGSERIAL PRIMARY KEY,
  email_id BIGINT REFERENCES emails(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- delivered, bounced, opened, clicked, spam_report, unsubscribed
  event_data JSONB,

  -- Tracking
  user_agent TEXT,
  ip_address INET,
  url VARCHAR(500), -- For click events

  -- Provider details
  provider_message_id VARCHAR(255),
  provider_event_id VARCHAR(255),

  -- Timestamp
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_events_email ON email_events(email_id);
CREATE INDEX idx_email_events_tenant ON email_events(tenant_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_occurred_at ON email_events(occurred_at DESC);

-- Inbound emails
CREATE TABLE inbound_emails (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Message identification
  message_id VARCHAR(255) UNIQUE NOT NULL,

  -- Sender/Recipient
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),

  -- Content
  subject VARCHAR(500),
  body_text TEXT,
  body_html TEXT,

  -- Attachments
  has_attachments BOOLEAN DEFAULT false,
  attachment_count INTEGER DEFAULT 0,

  -- Headers
  headers JSONB,

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inbound_emails_tenant ON inbound_emails(tenant_id);
CREATE INDEX idx_inbound_emails_to_email ON inbound_emails(to_email);
CREATE INDEX idx_inbound_emails_from_email ON inbound_emails(from_email);
CREATE INDEX idx_inbound_emails_received_at ON inbound_emails(received_at DESC);

-- Email bounce list (suppression list)
CREATE TABLE email_bounces (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Email details
  email_address VARCHAR(255) NOT NULL,

  -- Bounce details
  bounce_type VARCHAR(50), -- hard, soft, complaint
  bounce_reason TEXT,
  bounce_count INTEGER DEFAULT 1,

  -- Status
  is_suppressed BOOLEAN DEFAULT true,

  -- Timestamps
  first_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  last_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email_address)
);

CREATE INDEX idx_email_bounces_tenant ON email_bounces(tenant_id);
CREATE INDEX idx_email_bounces_email ON email_bounces(email_address);
CREATE INDEX idx_email_bounces_suppressed ON email_bounces(is_suppressed) WHERE is_suppressed = true;

-- Email unsubscribes
CREATE TABLE email_unsubscribes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Email details
  email_address VARCHAR(255) NOT NULL,

  -- Unsubscribe details
  reason VARCHAR(255),

  -- Timestamps
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email_address)
);

CREATE INDEX idx_email_unsubscribes_tenant ON email_unsubscribes(tenant_id);
CREATE INDEX idx_email_unsubscribes_email ON email_unsubscribes(email_address);

-- Function to update email statistics
CREATE OR REPLACE FUNCTION update_email_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update tenant email config stats based on email status
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    UPDATE tenant_email_config
    SET total_sent = total_sent + 1
    WHERE tenant_id = NEW.tenant_id;
  ELSIF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE tenant_email_config
    SET total_delivered = total_delivered + 1
    WHERE tenant_id = NEW.tenant_id;
  ELSIF NEW.status = 'bounced' AND (OLD.status IS NULL OR OLD.status != 'bounced') THEN
    UPDATE tenant_email_config
    SET total_bounced = total_bounced + 1
    WHERE tenant_id = NEW.tenant_id;
  ELSIF NEW.status = 'opened' AND (OLD.status IS NULL OR OLD.status != 'opened') THEN
    UPDATE tenant_email_config
    SET total_opened = total_opened + 1
    WHERE tenant_id = NEW.tenant_id;
  ELSIF NEW.status = 'clicked' AND (OLD.status IS NULL OR OLD.status != 'clicked') THEN
    UPDATE tenant_email_config
    SET total_clicked = total_clicked + 1
    WHERE tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_stats_update
AFTER UPDATE ON emails
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_email_stats();

-- Function to check suppression list before sending
CREATE OR REPLACE FUNCTION check_email_suppression(p_tenant_id BIGINT, p_email VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  is_bounced BOOLEAN;
  is_unsubscribed BOOLEAN;
BEGIN
  -- Check if email is in bounce suppression list
  SELECT EXISTS (
    SELECT 1 FROM email_bounces
    WHERE tenant_id = p_tenant_id
      AND email_address = p_email
      AND is_suppressed = true
  ) INTO is_bounced;

  -- Check if email is unsubscribed
  SELECT EXISTS (
    SELECT 1 FROM email_unsubscribes
    WHERE tenant_id = p_tenant_id
      AND email_address = p_email
  ) INTO is_unsubscribed;

  RETURN NOT (is_bounced OR is_unsubscribed);
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE emails IS 'Outbound email messages with delivery tracking';
COMMENT ON TABLE email_templates IS 'Reusable email templates with variable substitution';
COMMENT ON TABLE email_events IS 'Email engagement events from provider webhooks';
COMMENT ON TABLE inbound_emails IS 'Inbound emails received by tenants';
COMMENT ON TABLE email_bounces IS 'Bounced email addresses for suppression';
COMMENT ON TABLE email_unsubscribes IS 'Unsubscribed email addresses';
