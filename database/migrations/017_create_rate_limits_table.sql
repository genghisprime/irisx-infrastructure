-- Migration 017: Advanced Rate Limiting System
-- Flexible rate limiting with multiple strategies and tenant-specific configurations

-- =====================================================
-- RATE LIMIT RULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_rules (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Scope
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global rule
  rule_name VARCHAR(100) NOT NULL,
  description TEXT,

  -- What to limit
  resource_type VARCHAR(100) NOT NULL,  -- calls, sms, email, api_requests, etc.
  endpoint_pattern VARCHAR(500),  -- e.g., /v1/calls*, /v1/sms/*

  -- Rate limit configuration
  limit_type VARCHAR(50) NOT NULL DEFAULT 'requests',  -- requests, calls, sms, data_mb, cost_usd
  max_requests INTEGER NOT NULL,  -- Maximum number of requests
  window_seconds INTEGER NOT NULL,  -- Time window in seconds (60, 3600, 86400)

  -- Multiple limit tiers
  limits JSONB DEFAULT '[]'::jsonb,  -- Array of {tier: "tier1", max: 100, window: 60}

  -- Burst allowance
  burst_size INTEGER DEFAULT 0,  -- Allow bursts up to this amount

  -- Penalty for exceeding
  penalty_seconds INTEGER DEFAULT 0,  -- Block for N seconds after exceeding

  -- Targeting
  applies_to VARCHAR(50) DEFAULT 'tenant',  -- tenant, user, ip, api_key

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100,  -- Lower = higher priority (checked first)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_rules_tenant_id ON rate_limit_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_rules_resource_type ON rate_limit_rules(resource_type);
CREATE INDEX IF NOT EXISTS idx_rate_limit_rules_is_active ON rate_limit_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_rate_limit_rules_priority ON rate_limit_rules(priority);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_rate_limit_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rate_limit_rules_updated_at
BEFORE UPDATE ON rate_limit_rules
FOR EACH ROW
EXECUTE FUNCTION update_rate_limit_rules_updated_at();

-- =====================================================
-- RATE LIMIT VIOLATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who violated
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  api_key_id BIGINT,

  -- What rule was violated
  rule_id BIGINT REFERENCES rate_limit_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(100),
  resource_type VARCHAR(100),
  endpoint VARCHAR(500),

  -- Violation details
  limit_value INTEGER,  -- The limit that was exceeded
  current_usage INTEGER,  -- Actual usage at time of violation
  window_seconds INTEGER,

  -- Request context
  http_method VARCHAR(10),
  user_agent TEXT,
  request_id UUID,

  -- Action taken
  action_taken VARCHAR(50) DEFAULT 'blocked',  -- blocked, throttled, warned, logged
  penalty_until TIMESTAMPTZ,  -- Blocked until this time

  -- Metadata
  metadata JSONB,

  -- Timestamp
  violated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_tenant_id ON rate_limit_violations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_id ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip_address ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_rule_id ON rate_limit_violations(rule_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_violated_at ON rate_limit_violations(violated_at DESC);

-- =====================================================
-- RATE LIMIT QUOTAS TABLE (for non-time-based limits)
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_quotas (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- What resource
  resource_type VARCHAR(100) NOT NULL,  -- calls, sms, email, storage_gb, etc.

  -- Quota limits
  quota_limit BIGINT NOT NULL,  -- Total allowed (e.g., 10000 calls per month)
  quota_used BIGINT DEFAULT 0,  -- Current usage
  quota_remaining BIGINT GENERATED ALWAYS AS (quota_limit - quota_used) STORED,

  -- Period
  period_type VARCHAR(50) DEFAULT 'monthly',  -- hourly, daily, weekly, monthly, yearly, lifetime
  period_start TIMESTAMPTZ DEFAULT NOW(),
  period_end TIMESTAMPTZ,

  -- Auto-reset
  auto_reset BOOLEAN DEFAULT TRUE,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_exceeded BOOLEAN GENERATED ALWAYS AS (quota_used >= quota_limit) STORED,

  -- Notifications
  notify_at_percent INTEGER DEFAULT 80,  -- Notify when X% used
  notified_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_quotas_tenant_id ON rate_limit_quotas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_quotas_resource_type ON rate_limit_quotas(resource_type);
CREATE INDEX IF NOT EXISTS idx_rate_limit_quotas_is_exceeded ON rate_limit_quotas(is_exceeded);
CREATE INDEX IF NOT EXISTS idx_rate_limit_quotas_period_end ON rate_limit_quotas(period_end);

-- Unique constraint: one quota per tenant per resource per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_quotas_unique
  ON rate_limit_quotas(tenant_id, resource_type, period_type, period_start);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_rate_limit_quotas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rate_limit_quotas_updated_at
BEFORE UPDATE ON rate_limit_quotas
FOR EACH ROW
EXECUTE FUNCTION update_rate_limit_quotas_updated_at();

-- =====================================================
-- RATE LIMIT EXEMPTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_exemptions (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who is exempted
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ip_address INET,

  -- What resources
  resource_types TEXT[] DEFAULT ARRAY[]::TEXT[],  -- Empty = all resources
  endpoint_patterns TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Exemption details
  reason TEXT NOT NULL,
  exemption_type VARCHAR(50) DEFAULT 'permanent',  -- permanent, temporary
  expires_at TIMESTAMPTZ,

  -- Approval
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_tenant_id ON rate_limit_exemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_user_id ON rate_limit_exemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_ip_address ON rate_limit_exemptions(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_exemptions_is_active ON rate_limit_exemptions(is_active);

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- Top violators (last 24 hours)
CREATE OR REPLACE VIEW rate_limit_top_violators AS
SELECT
  tenant_id,
  user_id,
  ip_address,
  resource_type,
  COUNT(*) as violation_count,
  MAX(violated_at) as last_violation,
  ARRAY_AGG(DISTINCT rule_name) as violated_rules
FROM rate_limit_violations
WHERE violated_at > NOW() - INTERVAL '24 hours'
GROUP BY tenant_id, user_id, ip_address, resource_type
HAVING COUNT(*) >= 5
ORDER BY violation_count DESC;

-- Quota usage summary
CREATE OR REPLACE VIEW rate_limit_quota_usage AS
SELECT
  q.tenant_id,
  t.name as tenant_name,
  q.resource_type,
  q.quota_limit,
  q.quota_used,
  q.quota_remaining,
  ROUND((q.quota_used::NUMERIC / NULLIF(q.quota_limit, 0)) * 100, 2) as usage_percent,
  q.period_type,
  q.period_end,
  q.is_exceeded
FROM rate_limit_quotas q
LEFT JOIN tenants t ON q.tenant_id = t.id
WHERE q.is_active = TRUE
ORDER BY usage_percent DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to increment quota usage
CREATE OR REPLACE FUNCTION increment_quota_usage(
  p_tenant_id BIGINT,
  p_resource_type VARCHAR,
  p_increment INTEGER DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
  v_quota RECORD;
  v_result JSONB;
BEGIN
  -- Get current quota
  SELECT * INTO v_quota
  FROM rate_limit_quotas
  WHERE tenant_id = p_tenant_id
    AND resource_type = p_resource_type
    AND is_active = TRUE
    AND period_end > NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active quota found',
      'quota_found', false
    );
  END IF;

  -- Check if would exceed
  IF v_quota.quota_used + p_increment > v_quota.quota_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Quota exceeded',
      'quota_limit', v_quota.quota_limit,
      'quota_used', v_quota.quota_used,
      'quota_remaining', v_quota.quota_remaining,
      'would_be_used', v_quota.quota_used + p_increment
    );
  END IF;

  -- Increment usage
  UPDATE rate_limit_quotas
  SET quota_used = quota_used + p_increment
  WHERE id = v_quota.id;

  -- Build result
  SELECT jsonb_build_object(
    'success', true,
    'quota_limit', quota_limit,
    'quota_used', quota_used,
    'quota_remaining', quota_remaining,
    'usage_percent', ROUND((quota_used::NUMERIC / quota_limit) * 100, 2)
  ) INTO v_result
  FROM rate_limit_quotas
  WHERE id = v_quota.id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to reset quotas (call from cron)
CREATE OR REPLACE FUNCTION reset_expired_quotas()
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  WITH reset_quotas AS (
    UPDATE rate_limit_quotas
    SET quota_used = 0,
        period_start = NOW(),
        period_end = CASE period_type
          WHEN 'hourly' THEN NOW() + INTERVAL '1 hour'
          WHEN 'daily' THEN NOW() + INTERVAL '1 day'
          WHEN 'weekly' THEN NOW() + INTERVAL '7 days'
          WHEN 'monthly' THEN NOW() + INTERVAL '1 month'
          WHEN 'yearly' THEN NOW() + INTERVAL '1 year'
          ELSE period_end
        END,
        notified_at = NULL
    WHERE auto_reset = TRUE
      AND period_end < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO reset_count FROM reset_quotas;

  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DEFAULT RATE LIMIT RULES
-- =====================================================

-- Global default: 100 requests per minute per tenant
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, priority)
VALUES (NULL, 'global_api_default', 'Default rate limit for all API endpoints', 'api_requests', '/v1/*', 'requests', 100, 60, 100);

-- Calls: 10 CPS (calls per second) per tenant
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, priority)
VALUES (NULL, 'calls_default', 'Default call rate limit', 'calls', '/v1/calls', 'requests', 10, 1, 50);

-- SMS: 100 per minute per tenant
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, priority)
VALUES (NULL, 'sms_default', 'Default SMS rate limit', 'sms', '/v1/sms', 'requests', 100, 60, 50);

-- Email: 50 per minute per tenant
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, priority)
VALUES (NULL, 'email_default', 'Default email rate limit', 'email', '/v1/email/*', 'requests', 50, 60, 50);

-- Login attempts: 5 per minute per IP (security)
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, applies_to, penalty_seconds, priority)
VALUES (NULL, 'login_attempts', 'Prevent brute force login attacks', 'auth', '/v1/auth/login', 'requests', 5, 60, 'ip', 300, 10);

-- Campaign creation: 10 per hour per tenant
INSERT INTO rate_limit_rules (tenant_id, rule_name, description, resource_type, endpoint_pattern, limit_type, max_requests, window_seconds, priority)
VALUES (NULL, 'campaign_creation', 'Limit campaign creation rate', 'campaigns', '/v1/campaigns', 'requests', 10, 3600, 75);

COMMIT;
