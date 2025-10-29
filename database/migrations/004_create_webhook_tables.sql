-- Migration: Webhook Notification System
-- Phase 1, Week 9-10
-- Allows tenants to receive real-time event notifications

-- Webhook endpoints configured by tenants
CREATE TABLE webhooks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Configuration
  url VARCHAR(500) NOT NULL,
  description VARCHAR(255),
  secret VARCHAR(100) NOT NULL, -- For HMAC-SHA256 signing

  -- Event subscriptions (array of event types)
  events TEXT[] NOT NULL DEFAULT '{}', -- ['call.initiated', 'call.completed', 'sms.received', etc.]

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false, -- Verified via challenge

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,

  -- Retry configuration
  max_retries INTEGER DEFAULT 5,
  retry_strategy VARCHAR(20) DEFAULT 'exponential', -- exponential, linear
  timeout_seconds INTEGER DEFAULT 10,

  -- Statistics
  total_deliveries BIGINT DEFAULT 0,
  successful_deliveries BIGINT DEFAULT 0,
  failed_deliveries BIGINT DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_url CHECK (url ~* '^https?://'),
  CONSTRAINT valid_events CHECK (array_length(events, 1) > 0)
);

CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;

-- Webhook delivery attempts and logs
CREATE TABLE webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- call.initiated, call.completed, sms.received, etc.
  event_id VARCHAR(100) NOT NULL, -- UUID of the event
  payload JSONB NOT NULL,

  -- Delivery status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, success, failed, retrying
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,

  -- Response details
  http_status_code INTEGER,
  response_body TEXT,
  error_message TEXT,

  -- Timing
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  first_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'success', 'failed', 'retrying', 'cancelled'))
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_scheduled ON webhook_deliveries(scheduled_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';

-- Individual retry attempts for debugging
CREATE TABLE webhook_attempts (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Attempt details
  attempt_number INTEGER NOT NULL,
  http_status_code INTEGER,
  response_headers JSONB,
  response_body TEXT,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_attempts_delivery ON webhook_attempts(delivery_id);
CREATE INDEX idx_webhook_attempts_webhook ON webhook_attempts(webhook_id);

-- Supported webhook events
CREATE TABLE webhook_event_types (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL, -- call, sms, email, system
  description TEXT,
  payload_schema JSONB, -- JSON schema for payload
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default event types
INSERT INTO webhook_event_types (event_type, category, description) VALUES
  -- Call events
  ('call.initiated', 'call', 'Call has been initiated but not yet ringing'),
  ('call.ringing', 'call', 'Call is ringing at destination'),
  ('call.answered', 'call', 'Call has been answered'),
  ('call.completed', 'call', 'Call has ended normally'),
  ('call.failed', 'call', 'Call failed to connect'),
  ('call.recording.started', 'call', 'Call recording has started'),
  ('call.recording.completed', 'call', 'Call recording has been saved'),
  ('call.dtmf', 'call', 'DTMF digit received during call'),

  -- SMS events
  ('sms.received', 'sms', 'Inbound SMS message received'),
  ('sms.sent', 'sms', 'Outbound SMS message sent'),
  ('sms.delivered', 'sms', 'SMS message delivered to carrier'),
  ('sms.failed', 'sms', 'SMS message delivery failed'),
  ('sms.queued', 'sms', 'SMS message queued for sending'),

  -- MMS events
  ('mms.received', 'sms', 'Inbound MMS message received'),
  ('mms.sent', 'sms', 'Outbound MMS message sent'),

  -- Email events (future)
  ('email.received', 'email', 'Inbound email received'),
  ('email.sent', 'email', 'Outbound email sent'),
  ('email.delivered', 'email', 'Email delivered to recipient'),
  ('email.bounced', 'email', 'Email bounced'),
  ('email.opened', 'email', 'Email opened by recipient'),
  ('email.clicked', 'email', 'Link clicked in email'),

  -- System events
  ('tenant.limit.reached', 'system', 'Tenant reached usage limit'),
  ('tenant.limit.warning', 'system', 'Tenant approaching usage limit'),
  ('phone_number.assigned', 'system', 'Phone number assigned to tenant'),
  ('phone_number.released', 'system', 'Phone number released from tenant');

-- Webhook rate limiting (Redis-backed tracking in code)
CREATE TABLE webhook_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  -- Counts
  requests_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(webhook_id, window_start)
);

CREATE INDEX idx_webhook_rate_limits_webhook ON webhook_rate_limits(webhook_id);
CREATE INDEX idx_webhook_rate_limits_window ON webhook_rate_limits(window_start, window_end);

-- Function to update webhook statistics
CREATE OR REPLACE FUNCTION update_webhook_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'success' AND OLD.status != 'success' THEN
    UPDATE webhooks
    SET
      total_deliveries = total_deliveries + 1,
      successful_deliveries = successful_deliveries + 1,
      last_delivery_at = NOW(),
      last_success_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.webhook_id;
  ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    UPDATE webhooks
    SET
      total_deliveries = total_deliveries + 1,
      failed_deliveries = failed_deliveries + 1,
      last_delivery_at = NOW(),
      last_failure_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.webhook_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_stats_update
AFTER UPDATE ON webhook_deliveries
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_webhook_stats();

-- Function to clean old webhook logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM webhook_deliveries
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND status IN ('success', 'failed')
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE webhooks IS 'Webhook endpoints configured by tenants for receiving event notifications';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts with retry logic';
COMMENT ON TABLE webhook_attempts IS 'Individual HTTP request attempts for debugging';
COMMENT ON TABLE webhook_event_types IS 'Available webhook event types';
