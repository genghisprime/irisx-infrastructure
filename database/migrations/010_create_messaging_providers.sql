-- Create messaging_providers table for admin provider credentials management
-- This table stores encrypted credentials for email/SMS/WhatsApp/Social providers

CREATE TABLE IF NOT EXISTS messaging_providers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id),  -- NULL for global/shared providers
  provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('email', 'sms', 'whatsapp', 'social')),
  provider_name VARCHAR(50) NOT NULL,  -- sendgrid, twilio, whatsapp, discord, etc.

  -- Encrypted credentials (API keys, tokens, secrets)
  credentials_encrypted TEXT NOT NULL,
  credentials_iv VARCHAR(255) NOT NULL,  -- Initialization vector for decryption

  -- Additional configuration (JSON)
  config JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,  -- Soft delete
  last_used_at TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_messaging_providers_tenant_id ON messaging_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messaging_providers_provider_type ON messaging_providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_messaging_providers_deleted_at ON messaging_providers(deleted_at) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE messaging_providers IS 'Stores encrypted credentials for email/SMS/WhatsApp/Social providers';
COMMENT ON COLUMN messaging_providers.credentials_encrypted IS 'Encrypted JSON blob containing API keys and secrets';
COMMENT ON COLUMN messaging_providers.credentials_iv IS 'Initialization vector used for AES-256-CBC encryption';
