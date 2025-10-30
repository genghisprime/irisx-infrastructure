-- Migration 024: Authentication Tokens Tables
-- Purpose: Store refresh tokens and password reset tokens for JWT authentication
-- Date: October 29, 2025

-- ============================================
-- REFRESH TOKENS TABLE
-- Store JWT refresh tokens for authentication
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, token)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, revoked, expires_at);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token) WHERE revoked = FALSE;
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked = FALSE;

-- ============================================
-- PASSWORD RESET TOKENS TABLE
-- Store password reset tokens for forgot password flow
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256 hash of reset token
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id, used);
CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash, used, expires_at);

-- ============================================
-- CLEANUP FUNCTIONS
-- ============================================

/**
 * Clean up expired refresh tokens (older than 7 days)
 */
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

/**
 * Clean up used/expired password reset tokens (older than 24 hours)
 */
CREATE OR REPLACE FUNCTION cleanup_old_password_reset_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_tokens
  WHERE (used = TRUE AND used_at < NOW() - INTERVAL '24 hours')
     OR (expires_at < NOW() - INTERVAL '24 hours');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-CLEANUP TRIGGER FOR REFRESH TOKENS
-- Automatically revoke refresh tokens when user changes password
-- ============================================
CREATE OR REPLACE FUNCTION revoke_refresh_tokens_on_password_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
    UPDATE refresh_tokens
    SET revoked = TRUE,
        revoked_at = NOW(),
        revoked_reason = 'password_changed'
    WHERE user_id = NEW.id AND revoked = FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_revoke_tokens_on_password_change
AFTER UPDATE OF password_hash ON users
FOR EACH ROW
EXECUTE FUNCTION revoke_refresh_tokens_on_password_change();

-- ============================================
-- VIEWS FOR MONITORING
-- ============================================

/**
 * Active refresh tokens summary
 */
CREATE OR REPLACE VIEW active_refresh_tokens AS
SELECT
  u.id as user_id,
  u.email,
  u.tenant_id,
  COUNT(*) as active_token_count,
  MAX(rt.created_at) as last_token_created_at,
  MIN(rt.expires_at) as earliest_expiration
FROM users u
JOIN refresh_tokens rt ON rt.user_id = u.id
WHERE rt.revoked = FALSE AND rt.expires_at > NOW()
GROUP BY u.id, u.email, u.tenant_id
ORDER BY active_token_count DESC;

/**
 * Password reset token stats
 */
CREATE OR REPLACE VIEW password_reset_stats AS
SELECT
  u.id as user_id,
  u.email,
  u.tenant_id,
  COUNT(*) as total_reset_requests,
  COUNT(*) FILTER (WHERE prt.used = TRUE) as successful_resets,
  MAX(prt.created_at) as last_reset_request_at,
  MAX(prt.used_at) as last_successful_reset_at
FROM users u
LEFT JOIN password_reset_tokens prt ON prt.user_id = u.id
WHERE prt.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.tenant_id
ORDER BY last_reset_request_at DESC NULLS LAST;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE refresh_tokens IS 'Stores JWT refresh tokens for user authentication';
COMMENT ON TABLE password_reset_tokens IS 'Stores password reset tokens for forgot password flow';
COMMENT ON COLUMN refresh_tokens.token IS 'Full JWT refresh token (stored in plaintext)';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'SHA256 hash of the reset token (never store plaintext)';
COMMENT ON FUNCTION cleanup_expired_refresh_tokens() IS 'Clean up expired refresh tokens older than 7 days';
COMMENT ON FUNCTION cleanup_old_password_reset_tokens() IS 'Clean up used/expired password reset tokens older than 24 hours';
