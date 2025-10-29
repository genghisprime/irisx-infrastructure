-- Migration 019: Enhanced API Key Management System
-- Comprehensive API key management with scopes, permissions, and usage tracking

-- =====================================================
-- API KEYS TABLE (Enhanced)
-- =====================================================
CREATE TABLE IF NOT EXISTS api_keys_enhanced (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Ownership
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Key details
  key_name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(10) DEFAULT 'sk',  -- sk (secret), pk (publishable), test
  key_hash VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 hash of the actual key
  key_hint VARCHAR(10),  -- Last 4 characters for display

  -- Permissions
  scopes TEXT[] DEFAULT ARRAY['read']::TEXT[],  -- read, write, delete, admin
  allowed_endpoints TEXT[] DEFAULT ARRAY['*']::TEXT[],  -- Endpoint patterns
  ip_whitelist INET[] DEFAULT ARRAY[]::INET[],  -- Allowed IPs (empty = all)

  -- Rate limiting
  rate_limit_tier VARCHAR(50) DEFAULT 'standard',  -- standard, premium, unlimited
  custom_rate_limit INTEGER,  -- Override default rate limit

  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  total_requests BIGINT DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_test_mode BOOLEAN DEFAULT FALSE,  -- Test keys can't affect production
  expires_at TIMESTAMPTZ,

  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason TEXT,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_enhanced_tenant_id ON api_keys_enhanced(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_enhanced_key_hash ON api_keys_enhanced(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_enhanced_is_active ON api_keys_enhanced(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_enhanced_expires_at ON api_keys_enhanced(expires_at);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_api_keys_enhanced_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_api_keys_enhanced_updated_at
BEFORE UPDATE ON api_keys_enhanced
FOR EACH ROW
EXECUTE FUNCTION update_api_keys_enhanced_updated_at();

-- =====================================================
-- API KEY USAGE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS api_key_usage (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Key reference
  api_key_id BIGINT NOT NULL REFERENCES api_keys_enhanced(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Request details
  endpoint VARCHAR(500) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,

  -- Source
  ip_address INET,
  user_agent TEXT,
  referer TEXT,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Metadata
  request_id UUID,
  metadata JSONB,

  -- Timestamp
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_api_key_id ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_tenant_id ON api_key_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_requested_at ON api_key_usage(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_endpoint ON api_key_usage(endpoint);

-- Partition by month for performance (example)
-- CREATE TABLE IF NOT EXISTS api_key_usage_2025_01 PARTITION OF api_key_usage
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- =====================================================
-- API KEY ROTATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS api_key_rotations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Key reference
  old_key_id BIGINT NOT NULL REFERENCES api_keys_enhanced(id) ON DELETE CASCADE,
  new_key_id BIGINT REFERENCES api_keys_enhanced(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Rotation details
  rotation_reason VARCHAR(100) NOT NULL,  -- scheduled, compromised, manual
  initiated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Grace period
  grace_period_ends_at TIMESTAMPTZ,  -- Old key still valid until this time
  old_key_disabled_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, active, completed

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_rotations_old_key_id ON api_key_rotations(old_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_rotations_tenant_id ON api_key_rotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_key_rotations_status ON api_key_rotations(status);

-- =====================================================
-- API KEY SCOPES TABLE (Granular permissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS api_key_scopes (
  id BIGSERIAL PRIMARY KEY,

  -- Scope definition
  scope_name VARCHAR(100) NOT NULL UNIQUE,
  scope_category VARCHAR(50) NOT NULL,  -- calls, sms, email, billing, admin
  description TEXT,

  -- Permissions
  allows_read BOOLEAN DEFAULT TRUE,
  allows_write BOOLEAN DEFAULT FALSE,
  allows_delete BOOLEAN DEFAULT FALSE,

  -- Endpoints covered
  endpoint_patterns TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_scopes_scope_name ON api_key_scopes(scope_name);
CREATE INDEX IF NOT EXISTS idx_api_key_scopes_category ON api_key_scopes(scope_category);

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- Active API keys summary
CREATE OR REPLACE VIEW api_keys_summary AS
SELECT
  ak.id,
  ak.uuid,
  ak.tenant_id,
  t.name as tenant_name,
  ak.key_name,
  ak.key_prefix || '_****' || ak.key_hint as masked_key,
  ak.scopes,
  ak.is_active,
  ak.is_test_mode,
  ak.total_requests,
  ak.last_used_at,
  ak.expires_at,
  CASE
    WHEN ak.revoked_at IS NOT NULL THEN 'revoked'
    WHEN ak.expires_at < NOW() THEN 'expired'
    WHEN ak.is_active = FALSE THEN 'inactive'
    ELSE 'active'
  END as status
FROM api_keys_enhanced ak
LEFT JOIN tenants t ON ak.tenant_id = t.id;

-- API key usage statistics (last 24 hours)
CREATE OR REPLACE VIEW api_key_usage_24h AS
SELECT
  api_key_id,
  ak.key_name,
  ak.tenant_id,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE success = TRUE) as successful_requests,
  COUNT(*) FILTER (WHERE success = FALSE) as failed_requests,
  ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
  COUNT(DISTINCT endpoint) as unique_endpoints,
  COUNT(DISTINCT ip_address) as unique_ips,
  MAX(requested_at) as last_request_at
FROM api_key_usage aku
JOIN api_keys_enhanced ak ON aku.api_key_id = ak.id
WHERE requested_at > NOW() - INTERVAL '24 hours'
GROUP BY api_key_id, ak.key_name, ak.tenant_id
ORDER BY total_requests DESC;

-- Expiring API keys (next 30 days)
CREATE OR REPLACE VIEW api_keys_expiring_soon AS
SELECT
  ak.id,
  ak.uuid,
  ak.tenant_id,
  t.name as tenant_name,
  ak.key_name,
  ak.expires_at,
  EXTRACT(DAY FROM (ak.expires_at - NOW())) as days_until_expiry
FROM api_keys_enhanced ak
LEFT JOIN tenants t ON ak.tenant_id = t.id
WHERE ak.is_active = TRUE
  AND ak.revoked_at IS NULL
  AND ak.expires_at IS NOT NULL
  AND ak.expires_at > NOW()
  AND ak.expires_at < NOW() + INTERVAL '30 days'
ORDER BY ak.expires_at ASC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update API key usage statistics
CREATE OR REPLACE FUNCTION update_api_key_usage_stats(
  p_key_hash VARCHAR,
  p_ip_address INET
) RETURNS VOID AS $$
BEGIN
  UPDATE api_keys_enhanced
  SET
    total_requests = total_requests + 1,
    last_used_at = NOW(),
    last_used_ip = p_ip_address
  WHERE key_hash = p_key_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to validate API key
CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash VARCHAR)
RETURNS TABLE(
  is_valid BOOLEAN,
  api_key_id BIGINT,
  tenant_id BIGINT,
  scopes TEXT[],
  reason VARCHAR
) AS $$
DECLARE
  v_key RECORD;
BEGIN
  -- Get key details
  SELECT * INTO v_key
  FROM api_keys_enhanced
  WHERE key_hash = p_key_hash;

  -- Key not found
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::BIGINT, NULL::BIGINT, NULL::TEXT[], 'key_not_found';
    RETURN;
  END IF;

  -- Key revoked
  IF v_key.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, v_key.id, v_key.tenant_id, v_key.scopes, 'key_revoked';
    RETURN;
  END IF;

  -- Key expired
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE, v_key.id, v_key.tenant_id, v_key.scopes, 'key_expired';
    RETURN;
  END IF;

  -- Key inactive
  IF v_key.is_active = FALSE THEN
    RETURN QUERY SELECT FALSE, v_key.id, v_key.tenant_id, v_key.scopes, 'key_inactive';
    RETURN;
  END IF;

  -- Valid key
  RETURN QUERY SELECT TRUE, v_key.id, v_key.tenant_id, v_key.scopes, 'valid';
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old API key usage logs
CREATE OR REPLACE FUNCTION cleanup_old_api_key_usage(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_key_usage
  WHERE requested_at < NOW() - MAKE_INTERVAL(days := retention_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DEFAULT SCOPES
-- =====================================================
INSERT INTO api_key_scopes (scope_name, scope_category, description, allows_read, allows_write, allows_delete, endpoint_patterns)
VALUES
  ('calls:read', 'calls', 'Read call records and CDRs', TRUE, FALSE, FALSE, ARRAY['/v1/calls', '/v1/calls/*']),
  ('calls:write', 'calls', 'Create and manage calls', TRUE, TRUE, FALSE, ARRAY['/v1/calls', '/v1/calls/*']),
  ('sms:read', 'sms', 'Read SMS messages', TRUE, FALSE, FALSE, ARRAY['/v1/sms', '/v1/sms/*']),
  ('sms:write', 'sms', 'Send SMS messages', TRUE, TRUE, FALSE, ARRAY['/v1/sms', '/v1/sms/*']),
  ('email:read', 'email', 'Read email logs', TRUE, FALSE, FALSE, ARRAY['/v1/email', '/v1/email/*']),
  ('email:write', 'email', 'Send emails', TRUE, TRUE, FALSE, ARRAY['/v1/email/*']),
  ('billing:read', 'billing', 'Read billing data and invoices', TRUE, FALSE, FALSE, ARRAY['/v1/billing/*']),
  ('analytics:read', 'analytics', 'Read analytics and reports', TRUE, FALSE, FALSE, ARRAY['/v1/analytics/*']),
  ('admin', 'admin', 'Full admin access to all endpoints', TRUE, TRUE, TRUE, ARRAY['*']);

COMMIT;
