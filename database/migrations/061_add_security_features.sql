-- Security Features Tables
-- Migration: 061_add_security_features.sql

-- IP Whitelist for tenant-level access control
CREATE TABLE IF NOT EXISTS ip_whitelists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    ip_address VARCHAR(45) NOT NULL, -- Supports IPv4 and IPv6
    cidr_range VARCHAR(49), -- Optional CIDR notation (e.g., 192.168.1.0/24)
    description VARCHAR(255),

    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, ip_address)
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    token_hash VARCHAR(64) NOT NULL, -- SHA256 of token

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add email_verified column to users if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email_verified'
    ) THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email_verified_at'
    ) THEN
        ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
END
$$;

-- Add IP whitelist settings to tenants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'ip_whitelist_enabled'
    ) THEN
        ALTER TABLE tenants ADD COLUMN ip_whitelist_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'require_email_verification'
    ) THEN
        ALTER TABLE tenants ADD COLUMN require_email_verification BOOLEAN DEFAULT true;
    END IF;
END
$$;

-- Login attempts tracking for security
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,

    success BOOLEAN DEFAULT false,
    failure_reason VARCHAR(100),

    user_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Account lockouts
CREATE TABLE IF NOT EXISTS account_lockouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),

    locked_until TIMESTAMP WITH TIME ZONE NOT NULL,
    lockout_reason VARCHAR(100) DEFAULT 'too_many_failed_attempts',
    failed_attempts INTEGER DEFAULT 0,

    unlocked_at TIMESTAMP WITH TIME ZONE,
    unlocked_by UUID REFERENCES users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security audit events
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),

    event_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'password_change', 'ip_blocked', 'verification_sent', etc.
    event_details JSONB DEFAULT '{}',

    ip_address VARCHAR(45),
    user_agent TEXT,
    country_code VARCHAR(2),
    city VARCHAR(100),

    risk_level VARCHAR(20) DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    is_suspicious BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password history for password policies
CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255),

    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    device_name VARCHAR(100),

    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason VARCHAR(100),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_whitelists_tenant ON ip_whitelists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ip_whitelists_active ON ip_whitelists(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_email ON account_lockouts(email, locked_until);
CREATE INDEX IF NOT EXISTS idx_security_audit_tenant ON security_audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);

COMMENT ON TABLE ip_whitelists IS 'IP whitelist for enterprise tenant access control';
COMMENT ON TABLE email_verifications IS 'Email verification tokens';
COMMENT ON TABLE login_attempts IS 'Track login attempts for security monitoring';
COMMENT ON TABLE account_lockouts IS 'Account lockout records';
COMMENT ON TABLE security_audit_log IS 'Security-related audit events';
COMMENT ON TABLE password_history IS 'Password history for enforcing password policies';
COMMENT ON TABLE user_sessions IS 'Active user sessions for multi-device management';
