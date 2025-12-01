-- Add index to admin_sessions.token_hash for fast session lookup
-- This fixes the 13+ second delay in admin authentication middleware

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash
ON admin_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id_revoked
ON admin_sessions(admin_user_id, revoked_at)
WHERE revoked_at IS NULL;

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_admin_sessions_lookup
ON admin_sessions(token_hash, revoked_at, expires_at)
WHERE revoked_at IS NULL;
