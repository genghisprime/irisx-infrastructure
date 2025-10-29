-- Migration 022: Multi-Carrier System
-- Purpose: Enable least-cost routing (LCR) and automatic failover across multiple SIP carriers
-- Date: October 29, 2025

-- ============================================
-- CARRIERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS carriers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL, -- 'twilio', 'telnyx', 'bandwidth', 'custom'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'disabled', 'testing', 'maintenance'
  priority INTEGER DEFAULT 1, -- 1 = highest priority for failover
  weight INTEGER DEFAULT 100, -- For weighted load balancing (0-100)

  -- SIP Configuration
  sip_domain VARCHAR(255) NOT NULL,
  sip_username VARCHAR(255),
  sip_password VARCHAR(255),
  sip_proxy VARCHAR(255),
  sip_port INTEGER DEFAULT 5060,

  -- API Configuration (for direct API calls)
  api_key TEXT,
  api_secret TEXT,
  api_endpoint VARCHAR(255),

  -- Health Monitoring
  health_score INTEGER DEFAULT 100, -- 0-100, updated based on call success rate
  last_health_check TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,

  -- Rate Information
  default_rate_per_minute DECIMAL(10, 6) DEFAULT 0.01,
  billing_increment_seconds INTEGER DEFAULT 6, -- 6-second increments typical
  minimum_duration_seconds INTEGER DEFAULT 0,

  -- Feature Flags
  supports_sms BOOLEAN DEFAULT false,
  supports_mms BOOLEAN DEFAULT false,
  supports_emergency BOOLEAN DEFAULT false,
  supports_international BOOLEAN DEFAULT true,

  -- Configuration
  max_concurrent_calls INTEGER,
  cps_limit INTEGER, -- Calls per second limit
  codec_preferences TEXT[], -- ['PCMU', 'PCMA', 'G729']

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carriers_status ON carriers(status);
CREATE INDEX idx_carriers_priority ON carriers(priority, weight);
CREATE INDEX idx_carriers_health ON carriers(health_score);

-- ============================================
-- CARRIER RATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS carrier_rates (
  id BIGSERIAL PRIMARY KEY,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE CASCADE,
  destination_prefix VARCHAR(20) NOT NULL, -- E.164 prefix (e.g., '+1', '+44', '+1212')
  destination_name VARCHAR(100), -- 'United States', 'United Kingdom', 'New York'
  destination_type VARCHAR(50), -- 'domestic', 'international', 'premium', 'mobile'

  -- Pricing
  rate_per_minute DECIMAL(10, 6) NOT NULL,
  connection_fee DECIMAL(10, 4) DEFAULT 0,

  -- Validity Period
  effective_date DATE DEFAULT CURRENT_DATE,
  expires_at DATE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carrier_rates_prefix ON carrier_rates(carrier_id, destination_prefix);
CREATE INDEX idx_carrier_rates_effective ON carrier_rates(carrier_id, effective_date, expires_at);
CREATE UNIQUE INDEX idx_carrier_rates_unique ON carrier_rates(carrier_id, destination_prefix, effective_date)
  WHERE expires_at IS NULL;

-- ============================================
-- CARRIER HEALTH LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS carrier_health_logs (
  id BIGSERIAL PRIMARY KEY,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'sip_options', 'test_call', 'api_health', 'call_result'
  status VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'failed'
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carrier_health_logs_carrier ON carrier_health_logs(carrier_id, checked_at DESC);
CREATE INDEX idx_carrier_health_logs_status ON carrier_health_logs(carrier_id, status);

-- ============================================
-- CALL ROUTING LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS call_routing_logs (
  id BIGSERIAL PRIMARY KEY,
  call_id BIGINT REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id),
  destination_number VARCHAR(50),

  -- Selected Carrier
  selected_carrier_id BIGINT REFERENCES carriers(id),
  selected_carrier_name VARCHAR(100),
  selected_rate DECIMAL(10, 6),

  -- Routing Decision
  carrier_selection_reason VARCHAR(255), -- 'lcr', 'priority', 'failover', 'forced'
  alternate_carriers JSONB, -- Array of other carriers considered: [{id, name, rate, health_score}]

  -- Routing Performance
  routing_duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_call_routing_logs_call ON call_routing_logs(call_id);
CREATE INDEX idx_call_routing_logs_carrier ON call_routing_logs(selected_carrier_id, created_at DESC);
CREATE INDEX idx_call_routing_logs_tenant ON call_routing_logs(tenant_id, created_at DESC);

-- ============================================
-- UPDATE CALLS TABLE
-- ============================================
-- Add carrier_id to calls table if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='calls' AND column_name='carrier_id')
  THEN
    ALTER TABLE calls ADD COLUMN carrier_id BIGINT REFERENCES carriers(id);
    CREATE INDEX idx_calls_carrier ON calls(carrier_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='calls' AND column_name='carrier_rate')
  THEN
    ALTER TABLE calls ADD COLUMN carrier_rate DECIMAL(10, 6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='calls' AND column_name='carrier_cost')
  THEN
    ALTER TABLE calls ADD COLUMN carrier_cost DECIMAL(10, 4);
  END IF;
END $$;

-- ============================================
-- VIEWS
-- ============================================

-- Carrier Performance Summary
CREATE OR REPLACE VIEW carrier_performance_summary AS
SELECT
  c.id,
  c.name,
  c.type,
  c.status,
  c.health_score,
  c.total_calls,
  c.failed_calls,
  CASE
    WHEN c.total_calls > 0
    THEN ROUND(100.0 * (c.total_calls - c.failed_calls) / c.total_calls, 2)
    ELSE 100.0
  END as success_rate_percent,
  c.avg_response_time_ms,
  c.consecutive_failures,
  c.default_rate_per_minute,
  COUNT(DISTINCT crl.id) as routes_today,
  c.last_health_check,
  c.updated_at
FROM carriers c
LEFT JOIN call_routing_logs crl ON crl.selected_carrier_id = c.id
  AND crl.created_at > CURRENT_DATE
GROUP BY c.id, c.name, c.type, c.status, c.health_score, c.total_calls,
  c.failed_calls, c.avg_response_time_ms, c.consecutive_failures,
  c.default_rate_per_minute, c.last_health_check, c.updated_at
ORDER BY c.priority, c.health_score DESC;

-- Lowest Cost Routes
CREATE OR REPLACE VIEW lowest_cost_routes AS
SELECT DISTINCT ON (destination_prefix)
  cr.destination_prefix,
  cr.destination_name,
  c.id as carrier_id,
  c.name as carrier_name,
  cr.rate_per_minute as lowest_rate,
  c.health_score,
  c.status
FROM carrier_rates cr
JOIN carriers c ON c.id = cr.carrier_id
WHERE c.status = 'active'
  AND c.health_score >= 50
  AND (cr.expires_at IS NULL OR cr.expires_at > CURRENT_DATE)
  AND cr.effective_date <= CURRENT_DATE
ORDER BY cr.destination_prefix, cr.rate_per_minute ASC, c.health_score DESC;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update carrier health after call attempt
CREATE OR REPLACE FUNCTION update_carrier_health_after_call(
  p_carrier_id BIGINT,
  p_call_success BOOLEAN,
  p_response_time_ms INTEGER DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF p_call_success THEN
    -- Successful call - improve health
    UPDATE carriers
    SET
      health_score = LEAST(100, health_score + 2),
      consecutive_failures = 0,
      total_calls = total_calls + 1,
      avg_response_time_ms = CASE
        WHEN p_response_time_ms IS NOT NULL THEN
          COALESCE((avg_response_time_ms * total_calls + p_response_time_ms) / (total_calls + 1), p_response_time_ms)
        ELSE avg_response_time_ms
      END,
      last_health_check = NOW(),
      updated_at = NOW()
    WHERE id = p_carrier_id;

    -- Log health check
    INSERT INTO carrier_health_logs (carrier_id, check_type, status, response_time_ms)
    VALUES (p_carrier_id, 'call_result', 'healthy', p_response_time_ms);
  ELSE
    -- Failed call - degrade health
    UPDATE carriers
    SET
      health_score = GREATEST(0, health_score - 5),
      consecutive_failures = consecutive_failures + 1,
      total_calls = total_calls + 1,
      failed_calls = failed_calls + 1,
      last_health_check = NOW(),
      updated_at = NOW()
    WHERE id = p_carrier_id;

    -- Auto-disable carrier after 10 consecutive failures
    UPDATE carriers
    SET status = 'disabled', updated_at = NOW()
    WHERE id = p_carrier_id AND consecutive_failures >= 10;

    -- Log health check
    INSERT INTO carrier_health_logs (carrier_id, check_type, status)
    VALUES (p_carrier_id, 'call_result', 'failed');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get best carrier for destination
CREATE OR REPLACE FUNCTION get_best_carrier_for_destination(
  p_destination_number VARCHAR(50),
  p_prefer_cost BOOLEAN DEFAULT true
) RETURNS TABLE (
  carrier_id BIGINT,
  carrier_name VARCHAR(100),
  rate_per_minute DECIMAL(10, 6),
  health_score INTEGER,
  selection_reason VARCHAR(255)
) AS $$
DECLARE
  v_prefix VARCHAR(20);
BEGIN
  -- Extract prefix (simplified - check up to 4 digits)
  v_prefix := '+' || substring(regexp_replace(p_destination_number, '[^0-9]', '', 'g') from 1 for 1);

  -- Try to find matching rate by prefix (longest match first)
  FOR i IN REVERSE 4..1 LOOP
    v_prefix := '+' || substring(regexp_replace(p_destination_number, '[^0-9]', '', 'g') from 1 for i);

    RETURN QUERY
    SELECT
      c.id,
      c.name,
      cr.rate_per_minute,
      c.health_score,
      CASE
        WHEN p_prefer_cost THEN 'lcr'::VARCHAR(255)
        ELSE 'priority'::VARCHAR(255)
      END as selection_reason
    FROM carriers c
    JOIN carrier_rates cr ON cr.carrier_id = c.id
    WHERE c.status = 'active'
      AND c.health_score >= 30
      AND cr.destination_prefix = v_prefix
      AND (cr.expires_at IS NULL OR cr.expires_at > CURRENT_DATE)
      AND cr.effective_date <= CURRENT_DATE
    ORDER BY
      CASE WHEN p_prefer_cost THEN cr.rate_per_minute ELSE c.priority END ASC,
      c.health_score DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END LOOP;

  -- No specific rate found, return best default carrier
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.default_rate_per_minute,
    c.health_score,
    'default'::VARCHAR(255) as selection_reason
  FROM carriers c
  WHERE c.status = 'active'
    AND c.health_score >= 30
  ORDER BY c.priority ASC, c.health_score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INSERT DEFAULT CARRIERS
-- ============================================

-- Twilio (Primary)
INSERT INTO carriers (name, type, sip_domain, priority, weight, default_rate_per_minute, status)
VALUES ('Twilio', 'twilio', 'yourapp.pstn.twilio.com', 1, 60, 0.0085, 'active')
ON CONFLICT (name) DO UPDATE
SET sip_domain = EXCLUDED.sip_domain,
    default_rate_per_minute = EXCLUDED.default_rate_per_minute;

-- Telnyx (Backup - Cheaper)
INSERT INTO carriers (name, type, sip_domain, priority, weight, default_rate_per_minute, status)
VALUES ('Telnyx', 'telnyx', 'sip.telnyx.com', 2, 40, 0.0040, 'active')
ON CONFLICT (name) DO UPDATE
SET sip_domain = EXCLUDED.sip_domain,
    default_rate_per_minute = EXCLUDED.default_rate_per_minute;

-- ============================================
-- INSERT SAMPLE RATES
-- ============================================

-- Twilio Rates
INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+1', 'United States/Canada', 'domestic', 0.0085
FROM carriers WHERE name = 'Twilio'
ON CONFLICT DO NOTHING;

INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+44', 'United Kingdom', 'international', 0.0240
FROM carriers WHERE name = 'Twilio'
ON CONFLICT DO NOTHING;

INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+61', 'Australia', 'international', 0.0360
FROM carriers WHERE name = 'Twilio'
ON CONFLICT DO NOTHING;

-- Telnyx Rates (Cheaper)
INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+1', 'United States/Canada', 'domestic', 0.0040
FROM carriers WHERE name = 'Telnyx'
ON CONFLICT DO NOTHING;

INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+44', 'United Kingdom', 'international', 0.0150
FROM carriers WHERE name = 'Telnyx'
ON CONFLICT DO NOTHING;

INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, destination_type, rate_per_minute)
SELECT id, '+61', 'Australia', 'international', 0.0290
FROM carriers WHERE name = 'Telnyx'
ON CONFLICT DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- This migration adds multi-carrier support with:
-- - 4 tables (carriers, carrier_rates, carrier_health_logs, call_routing_logs)
-- - 2 views (carrier_performance_summary, lowest_cost_routes)
-- - 2 functions (update_carrier_health_after_call, get_best_carrier_for_destination)
-- - Default carriers: Twilio (primary) + Telnyx (backup)
-- - Sample rate tables for US, UK, Australia
