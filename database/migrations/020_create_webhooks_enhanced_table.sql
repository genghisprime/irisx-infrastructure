-- Migration 020: Enhanced Webhook Management System
-- Comprehensive webhook delivery with retry logic, signatures, and failure tracking

-- =====================================================
-- WEBHOOK ENDPOINTS TABLE (Enhanced)
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Ownership
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Endpoint details
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  description TEXT,

  -- Authentication
  auth_type VARCHAR(50) DEFAULT 'none',  -- none, basic, bearer, hmac
  auth_credentials JSONB,  -- Encrypted credentials

  -- Event subscriptions
  subscribed_events TEXT[] DEFAULT ARRAY['*']::TEXT[],  -- Events to send

  -- Security
  secret_key VARCHAR(128),  -- For HMAC signature
  ip_whitelist INET[] DEFAULT ARRAY[]::INET[],

  -- Retry configuration
  max_retries INTEGER DEFAULT 3,
  retry_backoff_seconds INTEGER DEFAULT 60,  -- Exponential backoff base
  timeout_seconds INTEGER DEFAULT 30,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,

  -- Auto-disable on failures
  auto_disable_after_failures INTEGER DEFAULT 10,
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant_id ON webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_is_active ON webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events ON webhook_endpoints USING GIN(subscribed_events);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_webhook_endpoints_updated_at
BEFORE UPDATE ON webhook_endpoints
FOR EACH ROW
EXECUTE FUNCTION update_webhook_endpoints_updated_at();

-- =====================================================
-- WEBHOOK DELIVERIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Endpoint reference
  webhook_endpoint_id BIGINT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_id UUID,

  -- Payload
  payload JSONB NOT NULL,
  payload_size_bytes INTEGER,

  -- Delivery attempt
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,

  -- Request details
  request_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'POST',
  request_headers JSONB,
  request_signature VARCHAR(128),  -- HMAC signature

  -- Response details
  response_status_code INTEGER,
  response_body TEXT,
  response_headers JSONB,
  response_time_ms INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, delivered, failed, retrying
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Retry scheduling
  next_retry_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_id ON webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

-- =====================================================
-- WEBHOOK EVENTS TABLE (Event definitions)
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,

  -- Event definition
  event_type VARCHAR(100) NOT NULL UNIQUE,
  event_category VARCHAR(50) NOT NULL,  -- calls, sms, email, billing, system
  description TEXT,

  -- Schema
  payload_schema JSONB,  -- JSON Schema for payload validation

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_category ON webhook_events(event_category);
CREATE INDEX IF NOT EXISTS idx_webhook_events_is_active ON webhook_events(is_active);

-- =====================================================
-- WEBHOOK LOGS TABLE (Audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Endpoint reference
  webhook_endpoint_id BIGINT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  delivery_id BIGINT REFERENCES webhook_deliveries(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Log details
  log_level VARCHAR(20) DEFAULT 'info',  -- debug, info, warning, error
  message TEXT NOT NULL,

  -- Context
  event_type VARCHAR(100),
  error_code VARCHAR(50),
  stack_trace TEXT,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_endpoint_id ON webhook_logs(webhook_endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_tenant_id ON webhook_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_log_level ON webhook_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- Webhook endpoint health summary
CREATE OR REPLACE VIEW webhook_endpoints_health AS
SELECT
  we.id,
  we.uuid,
  we.tenant_id,
  we.name,
  we.url,
  we.is_active,
  we.failure_count,
  we.consecutive_failures,
  we.last_triggered_at,
  ROUND(
    (COUNT(*) FILTER (WHERE wd.status = 'delivered')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100), 2
  ) as success_rate_percent,
  COUNT(*) FILTER (WHERE wd.created_at > NOW() - INTERVAL '24 hours') as deliveries_24h,
  COUNT(*) FILTER (WHERE wd.status = 'failed' AND wd.created_at > NOW() - INTERVAL '24 hours') as failures_24h
FROM webhook_endpoints we
LEFT JOIN webhook_deliveries wd ON we.id = wd.webhook_endpoint_id
GROUP BY we.id, we.uuid, we.tenant_id, we.name, we.url, we.is_active,
         we.failure_count, we.consecutive_failures, we.last_triggered_at;

-- Failed deliveries requiring retry
CREATE OR REPLACE VIEW webhook_deliveries_pending_retry AS
SELECT
  wd.*,
  we.url,
  we.max_retries,
  we.retry_backoff_seconds
FROM webhook_deliveries wd
JOIN webhook_endpoints we ON wd.webhook_endpoint_id = we.id
WHERE wd.status = 'retrying'
  AND wd.next_retry_at <= NOW()
  AND wd.retry_count < wd.max_attempts
  AND we.is_active = TRUE
ORDER BY wd.next_retry_at ASC;

-- Webhook delivery statistics (last 7 days)
CREATE OR REPLACE VIEW webhook_delivery_stats_7d AS
SELECT
  tenant_id,
  event_type,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
  MAX(response_time_ms) as max_response_time_ms
FROM webhook_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id, event_type
ORDER BY total_deliveries DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_next_retry_time(
  p_retry_count INTEGER,
  p_backoff_seconds INTEGER
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  -- Exponential backoff: backoff_seconds * (2 ^ retry_count)
  -- Capped at 24 hours
  RETURN NOW() + INTERVAL '1 second' * LEAST(
    p_backoff_seconds * POWER(2, p_retry_count),
    86400  -- Max 24 hours
  );
END;
$$ LANGUAGE plpgsql;

-- Function to record webhook delivery
CREATE OR REPLACE FUNCTION record_webhook_delivery(
  p_webhook_endpoint_id BIGINT,
  p_tenant_id BIGINT,
  p_event_type VARCHAR,
  p_event_id UUID,
  p_payload JSONB
) RETURNS BIGINT AS $$
DECLARE
  v_delivery_id BIGINT;
  v_webhook RECORD;
BEGIN
  -- Get webhook endpoint details
  SELECT * INTO v_webhook
  FROM webhook_endpoints
  WHERE id = p_webhook_endpoint_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook endpoint not found or inactive';
  END IF;

  -- Create delivery record
  INSERT INTO webhook_deliveries (
    webhook_endpoint_id,
    tenant_id,
    event_type,
    event_id,
    payload,
    payload_size_bytes,
    request_url,
    max_attempts
  ) VALUES (
    p_webhook_endpoint_id,
    p_tenant_id,
    p_event_type,
    p_event_id,
    p_payload,
    LENGTH(p_payload::TEXT),
    v_webhook.url,
    v_webhook.max_retries
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update delivery status
CREATE OR REPLACE FUNCTION update_delivery_status(
  p_delivery_id BIGINT,
  p_status VARCHAR,
  p_response_status_code INTEGER DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_delivery RECORD;
  v_webhook RECORD;
BEGIN
  -- Get delivery details
  SELECT * INTO v_delivery FROM webhook_deliveries WHERE id = p_delivery_id;
  SELECT * INTO v_webhook FROM webhook_endpoints WHERE id = v_delivery.webhook_endpoint_id;

  -- Update delivery record
  IF p_status = 'delivered' THEN
    UPDATE webhook_deliveries
    SET status = p_status,
        delivered_at = NOW(),
        response_status_code = p_response_status_code,
        response_body = p_response_body,
        response_time_ms = p_response_time_ms
    WHERE id = p_delivery_id;

    -- Reset failure counters on success
    UPDATE webhook_endpoints
    SET consecutive_failures = 0,
        last_triggered_at = NOW()
    WHERE id = v_delivery.webhook_endpoint_id;

  ELSIF p_status = 'failed' THEN
    UPDATE webhook_deliveries
    SET status = p_status,
        failed_at = NOW(),
        response_status_code = p_response_status_code,
        error_message = p_error_message,
        retry_count = retry_count + 1,
        next_retry_at = CASE
          WHEN retry_count + 1 < max_attempts THEN calculate_next_retry_time(retry_count + 1, v_webhook.retry_backoff_seconds)
          ELSE NULL
        END,
        status = CASE
          WHEN retry_count + 1 < max_attempts THEN 'retrying'
          ELSE 'failed'
        END
    WHERE id = p_delivery_id;

    -- Increment failure counters
    UPDATE webhook_endpoints
    SET failure_count = failure_count + 1,
        consecutive_failures = consecutive_failures + 1,
        last_triggered_at = NOW(),
        disabled_at = CASE
          WHEN consecutive_failures + 1 >= auto_disable_after_failures THEN NOW()
          ELSE disabled_at
        END,
        is_active = CASE
          WHEN consecutive_failures + 1 >= auto_disable_after_failures THEN FALSE
          ELSE is_active
        END,
        disabled_reason = CASE
          WHEN consecutive_failures + 1 >= auto_disable_after_failures THEN 'Auto-disabled after ' || auto_disable_after_failures || ' consecutive failures'
          ELSE disabled_reason
        END
    WHERE id = v_delivery.webhook_endpoint_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DEFAULT WEBHOOK EVENTS
-- =====================================================
INSERT INTO webhook_events (event_type, event_category, description) VALUES
  ('call.initiated', 'calls', 'Call was initiated'),
  ('call.ringing', 'calls', 'Call is ringing'),
  ('call.answered', 'calls', 'Call was answered'),
  ('call.completed', 'calls', 'Call completed successfully'),
  ('call.failed', 'calls', 'Call failed to connect'),
  ('call.recording.ready', 'calls', 'Call recording is ready'),
  ('sms.sent', 'sms', 'SMS message sent'),
  ('sms.delivered', 'sms', 'SMS message delivered'),
  ('sms.failed', 'sms', 'SMS delivery failed'),
  ('email.sent', 'email', 'Email sent'),
  ('email.delivered', 'email', 'Email delivered'),
  ('email.bounced', 'email', 'Email bounced'),
  ('billing.invoice.created', 'billing', 'Invoice created'),
  ('billing.payment.succeeded', 'billing', 'Payment succeeded'),
  ('billing.payment.failed', 'billing', 'Payment failed'),
  ('system.quota.exceeded', 'system', 'Usage quota exceeded'),
  ('system.rate_limit.exceeded', 'system', 'Rate limit exceeded');

COMMIT;
