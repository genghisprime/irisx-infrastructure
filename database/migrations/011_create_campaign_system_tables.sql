-- Migration 011: Create Campaign System Tables
-- Purpose: Bulk SMS/Email/Voice campaign management
-- Date: 2025-10-29

-- ======================
-- CAMPAIGNS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Campaign Details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- 'sms', 'email', 'voice', 'mixed'

  -- Target Audience
  contact_list_ids BIGINT[], -- Array of contact_list IDs
  filter_criteria JSONB, -- Additional filtering on contacts
  total_recipients INTEGER DEFAULT 0,

  -- Message Content
  message_template TEXT, -- SMS/Email body with {{variable}} placeholders
  subject VARCHAR(255), -- Email subject
  from_number VARCHAR(50), -- SMS/Voice from number
  from_email VARCHAR(255), -- Email from address
  from_name VARCHAR(255), -- Email from name

  -- Voice Campaign Settings
  voice_script TEXT, -- TTS script or audio file URL
  voice_provider VARCHAR(50), -- 'openai', 'elevenlabs', 'aws_polly'
  voice_id VARCHAR(100), -- Voice ID for TTS

  -- Scheduling
  schedule_type VARCHAR(50) DEFAULT 'immediate', -- 'immediate', 'scheduled', 'recurring'
  scheduled_at TIMESTAMPTZ, -- For scheduled campaigns
  timezone VARCHAR(100) DEFAULT 'UTC',
  recurrence_rule VARCHAR(255), -- RRULE format for recurring campaigns

  -- Sending Limits
  daily_limit INTEGER, -- Max sends per day
  hourly_limit INTEGER, -- Max sends per hour
  rate_limit INTEGER DEFAULT 10, -- Messages per second

  -- Status & Progress
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,

  -- Statistics
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0, -- Email clicks
  total_opened INTEGER DEFAULT 0, -- Email opens
  total_replied INTEGER DEFAULT 0, -- SMS/Email replies

  -- Cost Tracking
  estimated_cost DECIMAL(10,4),
  actual_cost DECIMAL(10,4),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_lists ON campaigns USING GIN(contact_list_ids);


-- ======================
-- CAMPAIGN_RECIPIENTS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,

  -- Recipient Info (denormalized for speed)
  phone VARCHAR(50),
  email VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  custom_fields JSONB DEFAULT '{}'::jsonb,

  -- Sending Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'bounced', 'unsubscribed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Message IDs (for tracking)
  sms_id BIGINT REFERENCES sms_messages(id) ON DELETE SET NULL,
  email_id BIGINT REFERENCES emails(id) ON DELETE SET NULL,
  call_id BIGINT REFERENCES calls(id) ON DELETE SET NULL,

  -- Response Tracking
  opened_at TIMESTAMPTZ, -- Email opens
  clicked_at TIMESTAMPTZ, -- Email clicks
  replied_at TIMESTAMPTZ, -- SMS/Email replies
  unsubscribed_at TIMESTAMPTZ,

  -- Error Details
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_sent ON campaign_recipients(sent_at);


-- ======================
-- CAMPAIGN_TEMPLATES TABLE
-- ======================
CREATE TABLE IF NOT EXISTS campaign_templates (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Template Details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- 'sms', 'email', 'voice'
  category VARCHAR(100), -- 'marketing', 'transactional', 'reminder', etc.

  -- Content
  subject VARCHAR(255), -- Email subject
  body TEXT NOT NULL, -- Message body with {{variables}}
  variables JSONB DEFAULT '[]'::jsonb, -- ['first_name', 'company', 'amount']

  -- Metadata
  usage_count INTEGER DEFAULT 0,
  is_shared BOOLEAN DEFAULT false, -- Global templates vs tenant-specific

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_tenant ON campaign_templates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_templates_type ON campaign_templates(type);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_category ON campaign_templates(category);


-- ======================
-- CAMPAIGN_ANALYTICS TABLE (Aggregated metrics)
-- ======================
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Time Period
  date DATE NOT NULL,
  hour INTEGER, -- 0-23, NULL for daily aggregates

  -- Metrics
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,

  -- Rates (calculated)
  delivery_rate DECIMAL(5,2), -- %
  open_rate DECIMAL(5,2), -- %
  click_rate DECIMAL(5,2), -- %
  reply_rate DECIMAL(5,2), -- %

  -- Cost
  cost DECIMAL(10,4),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, date, hour)
);

CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_date ON campaign_analytics(date);


-- ======================
-- CAMPAIGN_LINKS TABLE (Track email/SMS link clicks)
-- ======================
CREATE TABLE IF NOT EXISTS campaign_links (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Link Details
  original_url TEXT NOT NULL,
  short_code VARCHAR(50) UNIQUE NOT NULL, -- Random short code
  full_short_url VARCHAR(255), -- https://irisx.co/c/{short_code}

  -- Statistics
  total_clicks INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign ON campaign_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_links_short_code ON campaign_links(short_code);


-- ======================
-- CAMPAIGN_LINK_CLICKS TABLE (Individual click tracking)
-- ======================
CREATE TABLE IF NOT EXISTS campaign_link_clicks (
  id BIGSERIAL PRIMARY KEY,
  link_id BIGINT NOT NULL REFERENCES campaign_links(id) ON DELETE CASCADE,
  recipient_id BIGINT REFERENCES campaign_recipients(id) ON DELETE SET NULL,

  -- Click Details
  ip_address INET,
  user_agent TEXT,
  referer TEXT,

  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_link_clicks_link ON campaign_link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_campaign_link_clicks_recipient ON campaign_link_clicks(recipient_id);
CREATE INDEX IF NOT EXISTS idx_campaign_link_clicks_clicked ON campaign_link_clicks(clicked_at);


-- ======================
-- UNSUBSCRIBES TABLE (Global unsubscribe list)
-- ======================
CREATE TABLE IF NOT EXISTS unsubscribes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,

  -- Unsubscribe Details
  email VARCHAR(255),
  phone VARCHAR(50),
  type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'voice', 'all'
  reason VARCHAR(255),

  -- Source
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email, type),
  UNIQUE(tenant_id, phone, type)
);

CREATE INDEX IF NOT EXISTS idx_unsubscribes_tenant ON unsubscribes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unsubscribes_phone ON unsubscribes(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unsubscribes_type ON unsubscribes(type);


-- ======================
-- TRIGGERS
-- ======================

-- Update campaign updated_at timestamp
CREATE OR REPLACE FUNCTION update_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_campaign_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION update_campaign_timestamp();


-- Update campaign statistics when recipient status changes
CREATE OR REPLACE FUNCTION update_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment total_sent when status changes to 'sent'
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    UPDATE campaigns SET total_sent = total_sent + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Increment total_delivered when status changes to 'delivered'
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE campaigns SET total_delivered = total_delivered + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Increment total_failed when status changes to 'failed'
  IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
    UPDATE campaigns SET total_failed = total_failed + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Increment total_bounced when status changes to 'bounced'
  IF NEW.status = 'bounced' AND (OLD.status IS NULL OR OLD.status != 'bounced') THEN
    UPDATE campaigns SET total_bounced = total_bounced + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Track opens
  IF NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL THEN
    UPDATE campaigns SET total_opened = total_opened + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Track clicks
  IF NEW.clicked_at IS NOT NULL AND OLD.clicked_at IS NULL THEN
    UPDATE campaigns SET total_clicked = total_clicked + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Track replies
  IF NEW.replied_at IS NOT NULL AND OLD.replied_at IS NULL THEN
    UPDATE campaigns SET total_replied = total_replied + 1 WHERE id = NEW.campaign_id;
  END IF;

  -- Track unsubscribes
  IF NEW.unsubscribed_at IS NOT NULL AND OLD.unsubscribed_at IS NULL THEN
    UPDATE campaigns SET total_unsubscribed = total_unsubscribed + 1 WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_campaign_stats
AFTER INSERT OR UPDATE ON campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION update_campaign_stats();


-- Increment link click count
CREATE OR REPLACE FUNCTION increment_link_clicks()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE campaign_links
  SET total_clicks = total_clicks + 1
  WHERE id = NEW.link_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_link_clicks
AFTER INSERT ON campaign_link_clicks
FOR EACH ROW
EXECUTE FUNCTION increment_link_clicks();


-- ======================
-- VIEWS
-- ======================

-- Campaign performance summary
CREATE OR REPLACE VIEW campaign_performance AS
SELECT
  c.id as campaign_id,
  c.tenant_id,
  c.name as campaign_name,
  c.type,
  c.status,
  c.total_recipients,
  c.total_sent,
  c.total_delivered,
  c.total_failed,
  c.total_opened,
  c.total_clicked,
  c.total_replied,
  c.total_unsubscribed,
  ROUND(
    CASE WHEN c.total_sent > 0
    THEN (c.total_delivered::DECIMAL / c.total_sent) * 100
    ELSE 0 END,
    2
  ) as delivery_rate_percent,
  ROUND(
    CASE WHEN c.total_delivered > 0
    THEN (c.total_opened::DECIMAL / c.total_delivered) * 100
    ELSE 0 END,
    2
  ) as open_rate_percent,
  ROUND(
    CASE WHEN c.total_opened > 0
    THEN (c.total_clicked::DECIMAL / c.total_opened) * 100
    ELSE 0 END,
    2
  ) as click_rate_percent,
  c.actual_cost,
  c.started_at,
  c.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.started_at)) as duration_seconds
FROM campaigns c
WHERE c.deleted_at IS NULL;
