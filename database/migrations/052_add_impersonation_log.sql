-- Migration: Add admin impersonation log table
-- Date: 2025-12-16
-- Description: Creates a dedicated table for tracking admin impersonation of tenant users

-- Create impersonation log table
CREATE TABLE IF NOT EXISTS admin_impersonation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON admin_impersonation_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target_user ON admin_impersonation_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_target_tenant ON admin_impersonation_log(target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_started_at ON admin_impersonation_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_active ON admin_impersonation_log(admin_user_id) WHERE ended_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE admin_impersonation_log IS 'Audit log of admin users impersonating tenant users';
COMMENT ON COLUMN admin_impersonation_log.admin_user_id IS 'The admin user who initiated the impersonation';
COMMENT ON COLUMN admin_impersonation_log.target_user_id IS 'The tenant user being impersonated';
COMMENT ON COLUMN admin_impersonation_log.target_tenant_id IS 'The tenant of the user being impersonated';
COMMENT ON COLUMN admin_impersonation_log.reason IS 'Required reason for the impersonation (audit compliance)';
COMMENT ON COLUMN admin_impersonation_log.started_at IS 'When the impersonation session started';
COMMENT ON COLUMN admin_impersonation_log.ended_at IS 'When the impersonation session ended (NULL if still active)';
