-- Migration 023: Multi-Provider SMS and Email Routing
-- Purpose: Enable least-cost routing for SMS and email across multiple providers
-- Date: October 29, 2025

-- ============================================
-- MESSAGING PROVIDERS TABLE
-- Supports both SMS and email providers
-- ============================================
CREATE TABLE IF NOT EXISTS messaging_providers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'sms', 'email'
  provider VARCHAR(50) NOT NULL, -- 'twilio', 'telnyx', 'bandwidth', 'sendgrid', 'ses', 'mailgun', 'postmark'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'disabled', 'testing'
  priority INTEGER DEFAULT 1, -- 1 = highest priority
  weight INTEGER DEFAULT 100, -- For load balancing (0-100)

  -- API Configuration
  api_key TEXT NOT NULL,
  api_secret TEXT,
  account_sid VARCHAR(255), -- Twilio/Bandwidth
  api_endpoint VARCHAR(255),
  from_number VARCHAR(50), -- Default SMS from number
  from_email VARCHAR(255), -- Default email from address
  from_name VARCHAR(255), -- Default email from name

  -- Pricing (SMS)
  sms_rate_per_message DECIMAL(10, 6) DEFAULT 0.0079, -- Per SMS
  mms_rate_per_message DECIMAL(10, 6) DEFAULT 0.0200, -- Per MMS
  sms_rate_international DECIMAL(10, 6) DEFAULT 0.0500, -- International SMS

  -- Pricing (Email)
  email_rate_per_1000 DECIMAL(10, 6) DEFAULT 0.10, -- Per 1000 emails
  email_rate_attachment DECIMAL(10, 6) DEFAULT 0, -- Extra fee for attachments

  -- Health Monitoring
  health_score INTEGER DEFAULT 100, -- 0-100
  last_health_check_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  failed_messages INTEGER DEFAULT 0,
  avg_delivery_time_seconds INTEGER,

  -- Limits
  daily_limit INTEGER, -- Max messages per day
  rate_limit_per_second INTEGER DEFAULT 10,
  max_recipients_per_message INTEGER DEFAULT 1,

  -- Features
  supports_attachments BOOLEAN DEFAULT true,
  supports_templates BOOLEAN DEFAULT true,
  supports_tracking BOOLEAN DEFAULT true, -- Email opens/clicks, SMS delivery
  supports_scheduling BOOLEAN DEFAULT false,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name, type)
);

CREATE INDEX idx_messaging_providers_type ON messaging_providers(type, status);
CREATE INDEX idx_messaging_providers_priority ON messaging_providers(priority, weight);
CREATE INDEX idx_messaging_providers_health ON messaging_providers(health_score);

-- ============================================
-- MESSAGING PROVIDER RATES
-- Country/region specific pricing
-- ============================================
CREATE TABLE IF NOT EXISTS messaging_provider_rates (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT REFERENCES messaging_providers(id) ON DELETE CASCADE,
  country_code VARCHAR(10) NOT NULL, -- 'US', 'GB', 'IN', etc.
  country_name VARCHAR(100),
  destination_prefix VARCHAR(20), -- Phone prefix for SMS (e.g., '+1', '+44')

  -- SMS Rates
  sms_rate DECIMAL(10, 6),
  mms_rate DECIMAL(10, 6),

  -- Email Rates (usually flat)
  email_rate_per_1000 DECIMAL(10, 6),

  -- Validity
  effective_date DATE DEFAULT CURRENT_DATE,
  expires_at DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_rates_country ON messaging_provider_rates(provider_id, country_code);
CREATE INDEX idx_provider_rates_prefix ON messaging_provider_rates(provider_id, destination_prefix);

-- ============================================
-- MESSAGING PROVIDER HEALTH LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS messaging_provider_health_logs (
  id BIGSERIAL PRIMARY KEY,
  provider_id BIGINT REFERENCES messaging_providers(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'api_health', 'delivery_test', 'message_result'
  status VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'failed'
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_health_logs_provider ON messaging_provider_health_logs(provider_id, checked_at);

-- ============================================
-- MESSAGE ROUTING LOGS
-- Tracks provider selection decisions
-- ============================================
CREATE TABLE IF NOT EXISTS message_routing_logs (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT, -- References sms_messages.id or emails.id
  message_type VARCHAR(10) NOT NULL, -- 'sms' or 'email'
  tenant_id BIGINT REFERENCES tenants(id),
  destination VARCHAR(255) NOT NULL, -- Phone number or email address
  destination_country VARCHAR(10),

  -- Selected provider
  selected_provider_id BIGINT REFERENCES messaging_providers(id),
  selected_provider_name VARCHAR(100),
  selected_rate DECIMAL(10, 6),

  -- Routing decision
  provider_selection_reason VARCHAR(255), -- 'lcr', 'priority', 'failover', 'default'
  alternate_providers JSONB, -- Array of backup providers considered
  routing_duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_routing_logs_message ON message_routing_logs(message_type, message_id);
CREATE INDEX idx_message_routing_logs_tenant ON message_routing_logs(tenant_id, created_at);
CREATE INDEX idx_message_routing_logs_provider ON message_routing_logs(selected_provider_id, created_at);

-- ============================================
-- FUNCTIONS
-- ============================================

/**
 * Update provider health after message delivery attempt
 */
CREATE OR REPLACE FUNCTION update_messaging_provider_health(
  p_provider_id BIGINT,
  p_delivery_success BOOLEAN,
  p_delivery_time_seconds INTEGER DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF p_delivery_success THEN
    -- Success: increase health score
    UPDATE messaging_providers SET
      health_score = LEAST(100, health_score + 2),
      consecutive_failures = 0,
      total_messages = total_messages + 1,
      avg_delivery_time_seconds = COALESCE(
        (avg_delivery_time_seconds * total_messages + p_delivery_time_seconds) / (total_messages + 1),
        p_delivery_time_seconds
      ),
      updated_at = NOW()
    WHERE id = p_provider_id;
  ELSE
    -- Failure: decrease health score
    UPDATE messaging_providers SET
      health_score = GREATEST(0, health_score - 5),
      consecutive_failures = consecutive_failures + 1,
      failed_messages = failed_messages + 1,
      total_messages = total_messages + 1,
      updated_at = NOW()
    WHERE id = p_provider_id;

    -- Auto-disable after 10 consecutive failures
    UPDATE messaging_providers SET
      status = 'disabled',
      updated_at = NOW()
    WHERE id = p_provider_id AND consecutive_failures >= 10;
  END IF;
END;
$$ LANGUAGE plpgsql;

/**
 * Get best provider for SMS using LCR
 */
CREATE OR REPLACE FUNCTION select_sms_provider(
  p_destination_number VARCHAR(50),
  p_minimum_health_score INTEGER DEFAULT 30
) RETURNS TABLE (
  provider_id BIGINT,
  provider_name VARCHAR(100),
  provider_type VARCHAR(50),
  rate DECIMAL(10, 6),
  health_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.name,
    mp.provider,
    COALESCE(mpr.sms_rate, mp.sms_rate_per_message) as rate,
    mp.health_score
  FROM messaging_providers mp
  LEFT JOIN messaging_provider_rates mpr ON mpr.provider_id = mp.id
    AND (mpr.destination_prefix = SUBSTRING(p_destination_number FROM 1 FOR 2)
         OR mpr.destination_prefix = SUBSTRING(p_destination_number FROM 1 FOR 3))
    AND (mpr.expires_at IS NULL OR mpr.expires_at > CURRENT_DATE)
  WHERE mp.type = 'sms'
    AND mp.status = 'active'
    AND mp.health_score >= p_minimum_health_score
  ORDER BY
    mp.health_score DESC,
    COALESCE(mpr.sms_rate, mp.sms_rate_per_message) ASC,
    mp.priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

/**
 * Get best provider for Email using LCR
 */
CREATE OR REPLACE FUNCTION select_email_provider(
  p_minimum_health_score INTEGER DEFAULT 30,
  p_has_attachments BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  provider_id BIGINT,
  provider_name VARCHAR(100),
  provider_type VARCHAR(50),
  rate DECIMAL(10, 6),
  health_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mp.id,
    mp.name,
    mp.provider,
    mp.email_rate_per_1000 as rate,
    mp.health_score
  FROM messaging_providers mp
  WHERE mp.type = 'email'
    AND mp.status = 'active'
    AND mp.health_score >= p_minimum_health_score
    AND (p_has_attachments = FALSE OR mp.supports_attachments = TRUE)
  ORDER BY
    mp.health_score DESC,
    mp.email_rate_per_1000 ASC,
    mp.priority ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

/**
 * Provider Performance Summary
 */
CREATE OR REPLACE VIEW messaging_provider_performance AS
SELECT
  mp.id,
  mp.name,
  mp.type,
  mp.provider,
  mp.status,
  mp.health_score,
  mp.total_messages,
  mp.failed_messages,
  CASE
    WHEN mp.total_messages > 0
    THEN ROUND((mp.total_messages - mp.failed_messages)::numeric / mp.total_messages * 100, 2)
    ELSE 0
  END as success_rate_percent,
  mp.consecutive_failures,
  mp.avg_delivery_time_seconds,
  CASE
    WHEN mp.type = 'sms' THEN mp.sms_rate_per_message
    WHEN mp.type = 'email' THEN mp.email_rate_per_1000
  END as base_rate,
  mp.last_health_check_at,
  mp.created_at
FROM messaging_providers mp
ORDER BY mp.type, mp.priority;

/**
 * Cost Savings Analysis
 */
CREATE OR REPLACE VIEW messaging_cost_savings AS
WITH provider_costs AS (
  SELECT
    mrl.message_type,
    mrl.tenant_id,
    mrl.selected_provider_name,
    COUNT(*) as message_count,
    SUM(mrl.selected_rate) as total_cost,
    AVG(mrl.selected_rate) as avg_rate
  FROM message_routing_logs mrl
  WHERE mrl.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY mrl.message_type, mrl.tenant_id, mrl.selected_provider_name
)
SELECT
  pc.message_type,
  pc.tenant_id,
  pc.message_count,
  pc.selected_provider_name as provider_used,
  pc.total_cost as actual_cost,
  -- Calculate what it would cost with highest-rate provider
  pc.message_count * (
    SELECT MAX(CASE
      WHEN mp.type = 'sms' THEN mp.sms_rate_per_message
      WHEN mp.type = 'email' THEN mp.email_rate_per_1000
    END)
    FROM messaging_providers mp
    WHERE mp.type = pc.message_type AND mp.status = 'active'
  ) as max_cost,
  pc.total_cost - (pc.message_count * (
    SELECT MAX(CASE
      WHEN mp.type = 'sms' THEN mp.sms_rate_per_message
      WHEN mp.type = 'email' THEN mp.email_rate_per_1000
    END)
    FROM messaging_providers mp
    WHERE mp.type = pc.message_type AND mp.status = 'active'
  )) as savings
FROM provider_costs pc;

-- ============================================
-- DEFAULT DATA
-- Insert default providers for testing
-- ============================================

-- SMS Providers
INSERT INTO messaging_providers (
  name, type, provider, status, priority, weight,
  api_key, api_secret, account_sid,
  sms_rate_per_message, mms_rate_per_message,
  from_number
) VALUES
  ('Twilio SMS', 'sms', 'twilio', 'disabled', 1, 100,
   'YOUR_TWILIO_API_KEY', 'YOUR_TWILIO_API_SECRET', 'YOUR_ACCOUNT_SID',
   0.0079, 0.0200, '+1234567890'),

  ('Telnyx SMS', 'sms', 'telnyx', 'disabled', 2, 100,
   'YOUR_TELNYX_API_KEY', NULL, NULL,
   0.0035, 0.0100, '+1234567890')
ON CONFLICT (name, type) DO NOTHING;

-- Email Providers
INSERT INTO messaging_providers (
  name, type, provider, status, priority, weight,
  api_key, api_secret,
  email_rate_per_1000,
  from_email, from_name
) VALUES
  ('SendGrid', 'email', 'sendgrid', 'disabled', 1, 100,
   'YOUR_SENDGRID_API_KEY', NULL,
   0.100, 'noreply@example.com', 'IRISX'),

  ('Amazon SES', 'email', 'ses', 'disabled', 2, 100,
   'YOUR_AWS_ACCESS_KEY', 'YOUR_AWS_SECRET_KEY',
   0.100, 'noreply@example.com', 'IRISX'),

  ('Mailgun', 'email', 'mailgun', 'disabled', 3, 100,
   'YOUR_MAILGUN_API_KEY', NULL,
   0.080, 'noreply@example.com', 'IRISX'),

  ('Postmark', 'email', 'postmark', 'disabled', 4, 100,
   'YOUR_POSTMARK_API_KEY', NULL,
   0.125, 'noreply@example.com', 'IRISX')
ON CONFLICT (name, type) DO NOTHING;

-- ============================================
-- SMS Messages - Add provider tracking
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='sms_messages' AND column_name='provider_id') THEN
    ALTER TABLE sms_messages ADD COLUMN provider_id BIGINT REFERENCES messaging_providers(id);
    ALTER TABLE sms_messages ADD COLUMN provider_rate DECIMAL(10, 6);
    ALTER TABLE sms_messages ADD COLUMN provider_cost DECIMAL(10, 4);
  END IF;
END $$;

-- ============================================
-- Emails - Add provider tracking
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='emails' AND column_name='provider_id') THEN
    ALTER TABLE emails ADD COLUMN provider_id BIGINT REFERENCES messaging_providers(id);
    ALTER TABLE emails ADD COLUMN provider_rate DECIMAL(10, 6);
    ALTER TABLE emails ADD COLUMN provider_cost DECIMAL(10, 4);
  END IF;
END $$;
