-- Google OAuth Tokens Table
-- Stores OAuth tokens for Google Sheets integration

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_google_oauth_tenant_user ON google_oauth_tokens(tenant_id, user_id);
CREATE INDEX idx_google_oauth_expires ON google_oauth_tokens(expires_at);

COMMENT ON TABLE google_oauth_tokens IS 'Stores Google OAuth tokens for Sheets API access';
COMMENT ON COLUMN google_oauth_tokens.tenant_id IS 'Tenant ID';
COMMENT ON COLUMN google_oauth_tokens.user_id IS 'User ID who authorized access';
COMMENT ON COLUMN google_oauth_tokens.access_token IS 'Google OAuth access token';
COMMENT ON COLUMN google_oauth_tokens.refresh_token IS 'Google OAuth refresh token';
COMMENT ON COLUMN google_oauth_tokens.expires_at IS 'Token expiration timestamp';
