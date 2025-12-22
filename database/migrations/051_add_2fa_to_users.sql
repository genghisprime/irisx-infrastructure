-- Migration: Add 2FA/MFA support to tenant users table
-- Date: 2025-12-16
-- Description: Adds two-factor authentication columns to users table (matching admin_users)

-- Add 2FA columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);

-- Add index for quick 2FA lookup during login
CREATE INDEX IF NOT EXISTS idx_users_2fa_enabled ON users(id) WHERE two_factor_enabled = true;

-- Add comment for documentation
COMMENT ON COLUMN users.two_factor_enabled IS 'Whether 2FA/TOTP is enabled for this user';
COMMENT ON COLUMN users.two_factor_secret IS 'TOTP secret key for authenticator apps (encrypted at rest)';
