-- Migration 013: Platform Admin Portal System
-- Purpose: Admin authentication, tenant management, audit logging, system monitoring
-- Created: November 1, 2025

-- =====================================================
-- ADMIN USERS TABLE
-- =====================================================
-- Platform administrators (IRISX staff only)
-- Separate from tenant users for security
CREATE TABLE admin_users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'support', -- 'superadmin', 'admin', 'support', 'readonly'
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'deleted'
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45),
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes for admin users
CREATE INDEX idx_admin_users_email ON admin_users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_users_role ON admin_users(role) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_admin_users_status ON admin_users(status);

COMMENT ON TABLE admin_users IS 'Platform administrators (IRISX staff only) - separate from tenant users';
COMMENT ON COLUMN admin_users.role IS 'superadmin: full access, admin: most access, support: customer support, readonly: view only';

-- =====================================================
-- ADMIN SESSIONS TABLE
-- =====================================================
-- Track admin login sessions for security
CREATE TABLE admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES admin_users(id),
  token_hash VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Indexes for admin sessions
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at) WHERE revoked_at IS NULL;

COMMENT ON TABLE admin_sessions IS 'Admin login sessions with token tracking and expiration';

-- =====================================================
-- ADMIN AUDIT LOG TABLE
-- =====================================================
-- Comprehensive audit trail of all admin actions
CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT REFERENCES admin_users(id),
  action VARCHAR(100) NOT NULL, -- 'tenant.create', 'tenant.suspend', 'user.impersonate', etc.
  resource_type VARCHAR(50), -- 'tenant', 'user', 'agent', 'call', 'message'
  resource_id BIGINT,
  tenant_id BIGINT REFERENCES tenants(id), -- Affected tenant (if applicable)
  changes JSONB, -- Before/after values for updates
  metadata JSONB, -- Additional context (IP, user agent, etc.)
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX idx_admin_audit_log_admin ON admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX idx_admin_audit_log_resource ON admin_audit_log(resource_type, resource_id);
CREATE INDEX idx_admin_audit_log_tenant ON admin_audit_log(tenant_id);
CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at DESC);

COMMENT ON TABLE admin_audit_log IS 'Audit trail of all admin actions for compliance and security';
COMMENT ON COLUMN admin_audit_log.action IS 'Format: resource.action (e.g., tenant.create, user.suspend)';
COMMENT ON COLUMN admin_audit_log.changes IS 'JSONB with before/after values for audit trail';

-- =====================================================
-- TENANT ENHANCED FIELDS
-- =====================================================
-- Add fields to tenants table for admin management
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'; -- 'active', 'suspended', 'trial', 'cancelled'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'trial'; -- 'trial', 'starter', 'professional', 'enterprise'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mrr DECIMAL(10,2) DEFAULT 0.00; -- Monthly Recurring Revenue
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notes TEXT; -- Admin notes about this tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for enhanced tenant fields
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends ON tenants(trial_ends_at) WHERE status = 'trial';
CREATE INDEX IF NOT EXISTS idx_tenants_suspended ON tenants(suspended_at) WHERE status = 'suspended';

COMMENT ON COLUMN tenants.status IS 'active: normal operation, suspended: access blocked, trial: free trial, cancelled: deleted but data retained';
COMMENT ON COLUMN tenants.plan IS 'Billing plan tier for the tenant';
COMMENT ON COLUMN tenants.mrr IS 'Monthly Recurring Revenue in USD';

-- =====================================================
-- SYSTEM METRICS TABLE
-- =====================================================
-- Store system-wide metrics for admin dashboard
CREATE TABLE system_metrics (
  id BIGSERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(12,2) NOT NULL,
  metric_unit VARCHAR(20), -- 'count', 'percentage', 'seconds', 'bytes', 'usd'
  dimensions JSONB, -- Additional dimensions (e.g., {"channel": "voice", "status": "completed"})
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for system metrics
CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, timestamp DESC);

COMMENT ON TABLE system_metrics IS 'System-wide metrics collected every 5 minutes for admin dashboard';
COMMENT ON COLUMN system_metrics.dimensions IS 'JSONB for filtering metrics by channel, status, region, etc.';

-- =====================================================
-- PLATFORM SETTINGS TABLE
-- =====================================================
-- Global platform configuration and feature flags
CREATE TABLE platform_settings (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  category VARCHAR(50), -- 'feature_flags', 'system', 'billing', 'limits'
  description TEXT,
  is_public BOOLEAN DEFAULT false, -- Can tenants see this setting?
  updated_by BIGINT REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for platform settings
CREATE INDEX idx_platform_settings_key ON platform_settings(key);
CREATE INDEX idx_platform_settings_category ON platform_settings(category);

COMMENT ON TABLE platform_settings IS 'Global platform configuration and feature flags';
COMMENT ON COLUMN platform_settings.is_public IS 'If true, tenants can read this setting via API';

-- =====================================================
-- VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: Tenant Summary with Stats
CREATE OR REPLACE VIEW admin_tenant_summary AS
SELECT
  t.id,
  t.name,
  t.domain,
  t.status,
  t.plan,
  t.mrr,
  t.trial_ends_at,
  t.created_at,
  COUNT(DISTINCT u.id) as user_count,
  COUNT(DISTINCT ag.id) as agent_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.initiated_at >= NOW() - INTERVAL '30 days') as calls_last_30d,
  COUNT(DISTINCT sm.id) FILTER (WHERE sm.created_at >= NOW() - INTERVAL '30 days') as sms_last_30d,
  COUNT(DISTINCT e.id) FILTER (WHERE e.created_at >= NOW() - INTERVAL '30 days') as emails_last_30d,
  MAX(c.initiated_at) as last_call_at,
  MAX(u.last_login_at) as last_user_login_at
FROM tenants t
LEFT JOIN users u ON t.id = u.tenant_id AND u.deleted_at IS NULL
LEFT JOIN agents ag ON t.id = ag.tenant_id AND ag.deleted_at IS NULL
LEFT JOIN calls c ON t.id = c.tenant_id
LEFT JOIN sms_messages sm ON t.id = sm.tenant_id
LEFT JOIN emails e ON t.id = e.tenant_id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.name, t.domain, t.status, t.plan, t.mrr, t.trial_ends_at, t.created_at;

COMMENT ON VIEW admin_tenant_summary IS 'Comprehensive tenant summary for admin dashboard with usage stats';

-- View: Platform Health Summary
CREATE OR REPLACE VIEW admin_platform_health AS
SELECT
  (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND deleted_at IS NULL) as active_tenants,
  (SELECT COUNT(*) FROM tenants WHERE status = 'trial' AND deleted_at IS NULL) as trial_tenants,
  (SELECT COUNT(*) FROM tenants WHERE status = 'suspended' AND deleted_at IS NULL) as suspended_tenants,
  (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
  (SELECT COUNT(*) FROM agents WHERE deleted_at IS NULL) as total_agents,
  (SELECT COUNT(*) FROM calls WHERE initiated_at >= NOW() - INTERVAL '24 hours') as calls_24h,
  (SELECT COUNT(*) FROM sms_messages WHERE created_at >= NOW() - INTERVAL '24 hours') as sms_24h,
  (SELECT COUNT(*) FROM emails WHERE created_at >= NOW() - INTERVAL '24 hours') as emails_24h,
  (SELECT SUM(mrr) FROM tenants WHERE status = 'active' AND deleted_at IS NULL) as total_mrr,
  (SELECT AVG(duration_seconds) FROM calls WHERE status = 'completed' AND initiated_at >= NOW() - INTERVAL '24 hours') as avg_call_duration_24h;

COMMENT ON VIEW admin_platform_health IS 'Real-time platform health metrics for admin dashboard';

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Log admin action
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_user_id BIGINT,
  p_action VARCHAR,
  p_resource_type VARCHAR DEFAULT NULL,
  p_resource_id BIGINT DEFAULT NULL,
  p_tenant_id BIGINT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL,
  p_ip_address VARCHAR DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO admin_audit_log (
    admin_user_id, action, resource_type, resource_id, tenant_id,
    changes, ip_address, user_agent,
    metadata
  ) VALUES (
    p_admin_user_id, p_action, p_resource_type, p_resource_id, p_tenant_id,
    p_changes, p_ip_address, p_user_agent,
    jsonb_build_object('timestamp', NOW(), 'ip', p_ip_address)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_admin_action IS 'Helper function to log admin actions with context';

-- Function: Suspend tenant
CREATE OR REPLACE FUNCTION suspend_tenant(
  p_tenant_id BIGINT,
  p_reason TEXT,
  p_admin_user_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE tenants
  SET
    status = 'suspended',
    suspended_at = NOW(),
    suspension_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_tenant_id;

  -- Log the action
  PERFORM log_admin_action(
    p_admin_user_id,
    'tenant.suspend',
    'tenant',
    p_tenant_id,
    p_tenant_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION suspend_tenant IS 'Suspend a tenant and log the action';

-- Function: Reactivate tenant
CREATE OR REPLACE FUNCTION reactivate_tenant(
  p_tenant_id BIGINT,
  p_admin_user_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE tenants
  SET
    status = 'active',
    suspended_at = NULL,
    suspension_reason = NULL,
    updated_at = NOW()
  WHERE id = p_tenant_id;

  -- Log the action
  PERFORM log_admin_action(
    p_admin_user_id,
    'tenant.reactivate',
    'tenant',
    p_tenant_id,
    p_tenant_id
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reactivate_tenant IS 'Reactivate a suspended tenant and log the action';

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update admin_users.updated_at
CREATE OR REPLACE FUNCTION update_admin_user_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_admin_user_timestamp
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION update_admin_user_timestamp();

-- =====================================================
-- SEED DATA (Optional)
-- =====================================================
-- Create initial superadmin user
-- Password: 'ChangeMe123!' (bcrypt hash)
-- NOTE: Change this password immediately after first login!
INSERT INTO admin_users (email, password_hash, first_name, last_name, role, status)
VALUES (
  'admin@irisx.internal',
  '$2b$10$rZ3QkzO5m5YQjKVx8X8vXOyGz5FPJ3fKlHJQNxVwYXKzLqX7ZQy6C', -- ChangeMe123!
  'System',
  'Administrator',
  'superadmin',
  'active'
) ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE admin_users IS 'Default superadmin: admin@irisx.internal / ChangeMe123! - CHANGE THIS PASSWORD!';

-- =====================================================
-- SECURITY NOTES
-- =====================================================
-- 1. Admin users are COMPLETELY SEPARATE from tenant users
-- 2. Admin tokens should have short expiration (e.g., 4 hours)
-- 3. All admin actions are logged in admin_audit_log
-- 4. Consider requiring 2FA for superadmin and admin roles
-- 5. IP whitelisting recommended for production
-- 6. Rotate admin tokens frequently
-- 7. Monitor admin_audit_log for suspicious activity

-- Migration complete!
