-- Migration 016: Audit Logging System
-- Comprehensive audit trail for security, compliance, and debugging

-- =====================================================
-- AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who performed the action
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_type VARCHAR(50) DEFAULT 'user',  -- user, system, api_key, webhook
  actor_identifier VARCHAR(255),  -- email, API key ID, IP address, etc.

  -- What action was performed
  action VARCHAR(100) NOT NULL,  -- create, read, update, delete, login, logout, etc.
  resource_type VARCHAR(100) NOT NULL,  -- call, contact, campaign, invoice, user, etc.
  resource_id VARCHAR(255),  -- ID of the affected resource
  resource_name VARCHAR(255),  -- Human-readable name (for display)

  -- Details
  description TEXT,  -- Human-readable description of the action
  changes JSONB,  -- Before/after values for updates ({"before": {...}, "after": {...}})
  metadata JSONB,  -- Additional context (user agent, IP, API version, etc.)

  -- Severity/Risk Level
  severity VARCHAR(20) DEFAULT 'info',  -- debug, info, warning, critical
  is_sensitive BOOLEAN DEFAULT FALSE,  -- PII, financial data, etc.

  -- Request details
  http_method VARCHAR(10),  -- GET, POST, PUT, DELETE
  endpoint VARCHAR(500),  -- /v1/calls/:id
  request_id UUID,  -- Trace across services
  ip_address INET,
  user_agent TEXT,

  -- Result
  status VARCHAR(50) DEFAULT 'success',  -- success, failed, error, denied
  error_message TEXT,  -- If status = failed/error

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_user_created
  ON audit_logs(tenant_id, user_id, created_at DESC);

-- =====================================================
-- SECURITY EVENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who/What
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET NOT NULL,

  -- Event details
  event_type VARCHAR(100) NOT NULL,  -- login_failed, api_key_invalid, rate_limit_exceeded, etc.
  severity VARCHAR(20) DEFAULT 'warning',  -- info, warning, critical
  description TEXT,
  metadata JSONB,  -- Additional details

  -- Detection
  is_blocked BOOLEAN DEFAULT FALSE,  -- Was the action blocked?
  detection_method VARCHAR(100),  -- rate_limiter, firewall, manual_review

  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_id ON security_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_is_resolved ON security_events(is_resolved);

-- =====================================================
-- DATA ACCESS LOGS (for PII/PHI compliance)
-- =====================================================
CREATE TABLE IF NOT EXISTS data_access_logs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Who accessed the data
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_identifier VARCHAR(255),  -- email, API key, service name

  -- What data was accessed
  data_type VARCHAR(100) NOT NULL,  -- contact_pii, call_recording, payment_method, etc.
  resource_id VARCHAR(255) NOT NULL,
  access_type VARCHAR(50) NOT NULL,  -- read, export, download, decrypt

  -- Purpose and justification
  purpose VARCHAR(255),  -- customer_support, billing_audit, legal_request, etc.
  justification TEXT,  -- Why was this data accessed?

  -- Request details
  ip_address INET,
  user_agent TEXT,
  request_id UUID,

  -- Timestamp
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_access_logs_tenant_id ON data_access_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_user_id ON data_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_data_type ON data_access_logs(data_type);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_resource_id ON data_access_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_data_access_logs_accessed_at ON data_access_logs(accessed_at DESC);

-- =====================================================
-- ADMIN ACTIVITY LOGS (for privileged actions)
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Admin who performed the action
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_email VARCHAR(255) NOT NULL,

  -- Target (who was affected)
  target_tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Action
  action VARCHAR(100) NOT NULL,  -- modify_tenant, impersonate_user, reset_password, etc.
  action_category VARCHAR(50) DEFAULT 'general',  -- access, modification, deletion, configuration
  description TEXT,
  changes JSONB,  -- Before/after values

  -- Justification
  reason TEXT,  -- Why was this action taken?
  ticket_reference VARCHAR(100),  -- Support ticket, JIRA ticket, etc.

  -- Approval
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Request details
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_user_id ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_target_tenant_id ON admin_activity_logs(target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_requires_approval ON admin_activity_logs(requires_approval);

-- =====================================================
-- WEBHOOK DELIVERY LOGS (already exists but enhance)
-- =====================================================
-- Note: notification_delivery_log table already exists from migration 015
-- We'll enhance it with additional audit fields if needed

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Recent failed login attempts (potential brute force)
CREATE OR REPLACE VIEW failed_login_attempts AS
SELECT
  tenant_id,
  user_id,
  ip_address,
  COUNT(*) as attempt_count,
  MAX(created_at) as last_attempt,
  MIN(created_at) as first_attempt
FROM security_events
WHERE event_type = 'login_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY tenant_id, user_id, ip_address
HAVING COUNT(*) >= 3;

-- Sensitive data access summary (last 30 days)
CREATE OR REPLACE VIEW sensitive_data_access_summary AS
SELECT
  tenant_id,
  user_id,
  data_type,
  access_type,
  COUNT(*) as access_count,
  MAX(accessed_at) as last_access
FROM data_access_logs
WHERE accessed_at > NOW() - INTERVAL '30 days'
GROUP BY tenant_id, user_id, data_type, access_type;

-- Admin actions requiring review (last 7 days)
CREATE OR REPLACE VIEW admin_actions_for_review AS
SELECT
  aal.id,
  aal.admin_email,
  aal.action,
  aal.description,
  aal.target_tenant_id,
  t.name as tenant_name,
  aal.created_at
FROM admin_activity_logs aal
LEFT JOIN tenants t ON aal.target_tenant_id = t.id
WHERE aal.created_at > NOW() - INTERVAL '7 days'
  AND aal.requires_approval = TRUE
  AND aal.approved_at IS NULL
ORDER BY aal.created_at DESC;

-- =====================================================
-- FUNCTIONS FOR AUDIT LOGGING
-- =====================================================

-- Function to log audit event (called from application)
CREATE OR REPLACE FUNCTION log_audit_event(
  p_tenant_id BIGINT,
  p_user_id BIGINT,
  p_action VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    description,
    metadata,
    ip_address
  ) VALUES (
    p_tenant_id,
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_description,
    p_metadata,
    p_ip_address
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RETENTION POLICY (delete old audit logs)
-- =====================================================

-- Function to archive/delete old audit logs (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete non-critical audit logs older than retention period
  DELETE FROM audit_logs
  WHERE created_at < NOW() - MAKE_INTERVAL(days := retention_days)
    AND severity IN ('debug', 'info')
    AND is_sensitive = FALSE;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Keep security events and sensitive logs forever (or separate longer retention)
-- They are kept in security_events and data_access_logs tables

-- =====================================================
-- SAMPLE AUDIT LOG ENTRIES
-- =====================================================

-- Example: User login
INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, description, severity, status, ip_address)
VALUES (1, 1, 'login', 'user', '1', 'User logged in successfully', 'info', 'success', '73.6.78.238');

-- Example: Call created
INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, description, metadata)
VALUES (1, 1, 'create', 'call', 'abc-123', 'Outbound call created', '{"to": "+12025551234", "from": "+12025559999"}');

-- Example: Failed login attempt
INSERT INTO security_events (tenant_id, user_id, ip_address, event_type, severity, description, is_blocked)
VALUES (1, 1, '192.168.1.1', 'login_failed', 'warning', 'Invalid password attempt', FALSE);

-- Example: PII access
INSERT INTO data_access_logs (tenant_id, user_id, actor_identifier, data_type, resource_id, access_type, purpose)
VALUES (1, 1, 'admin@example.com', 'contact_pii', '12345', 'read', 'customer_support');

-- Example: Admin action
INSERT INTO admin_activity_logs (admin_user_id, admin_email, target_tenant_id, action, description, reason)
VALUES (1, 'admin@example.com', 1, 'modify_tenant_limits', 'Increased concurrent call limit from 10 to 50', 'Customer upgrade to enterprise plan');

COMMIT;
