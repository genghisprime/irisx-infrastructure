-- Migration: Add OAuth Tables
-- Date: 2025-12-16
-- Description: OAuth 2.0 social login support (Google, Microsoft, GitHub)

-- ======================
-- OAUTH LINKS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS oauth_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Provider Info
    provider VARCHAR(50) NOT NULL,
    -- Options: google, microsoft, github
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),

    -- Tokens (encrypted in production)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,

    -- Profile Data (cached)
    profile_data JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,

    -- Unique constraint per provider/user combo
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_links_user ON oauth_links(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_links_provider ON oauth_links(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_links_provider_user ON oauth_links(provider, provider_user_id);

-- ======================
-- OAUTH AUDIT LOG
-- ======================
CREATE TABLE IF NOT EXISTS oauth_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    -- Events: login, register, link, unlink, refresh_token, failed_login
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_audit_user ON oauth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_created ON oauth_audit_log(created_at);

-- ======================
-- ADD EMAIL_VERIFIED TO USERS
-- ======================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

-- ======================
-- COMMENTS
-- ======================
COMMENT ON TABLE oauth_links IS 'Links users to external OAuth providers for social login';
COMMENT ON COLUMN oauth_links.provider IS 'OAuth provider: google, microsoft, github';
COMMENT ON COLUMN oauth_links.provider_user_id IS 'Unique user ID from the OAuth provider';
COMMENT ON COLUMN oauth_links.profile_data IS 'Cached profile data from the provider';
COMMENT ON TABLE oauth_audit_log IS 'Audit trail for OAuth authentication events';
