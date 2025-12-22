-- Migration: 027_whatsapp_integration_corrected.sql
-- Description: WhatsApp Business API integration support (corrected for BIGINT tenant_id)
-- Created: December 4, 2025

-- =============================================================================
-- WhatsApp Accounts Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- WhatsApp Business Account Info
  phone_number_id VARCHAR(50) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(100),
  business_account_id VARCHAR(50),

  -- API Credentials
  access_token TEXT NOT NULL,
  webhook_verify_token VARCHAR(100),

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  verified BOOLEAN DEFAULT false,
  quality_rating VARCHAR(20),

  -- Limits
  messaging_limit VARCHAR(20),
  daily_conversation_limit INT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant ON whatsapp_accounts(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone ON whatsapp_accounts(phone_number_id);

-- =============================================================================
-- WhatsApp Templates Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id INT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- Template Identity
  template_name VARCHAR(100) NOT NULL,
  template_id VARCHAR(100),

  -- Content
  language VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,

  -- Template Structure
  header_type VARCHAR(20),
  header_text TEXT,
  header_media_url TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'PENDING',
  rejection_reason TEXT,
  quality_score VARCHAR(20),

  -- Usage Stats
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant ON whatsapp_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_account ON whatsapp_templates(whatsapp_account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_status ON whatsapp_templates(status);

-- =============================================================================
-- WhatsApp Messages Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id INT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,

  -- Message Identity
  message_id VARCHAR(100),
  wamid VARCHAR(150),

  -- Direction and Status
  direction VARCHAR(10) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',

  -- Contact Info
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(100),

  -- Message Content
  message_type VARCHAR(20) NOT NULL,
  text_body TEXT,
  caption TEXT,

  -- Media Info
  media_id VARCHAR(100),
  media_url TEXT,
  media_mime_type VARCHAR(100),
  media_filename VARCHAR(255),
  media_sha256 VARCHAR(64),
  media_size_bytes BIGINT,
  media_s3_key VARCHAR(500),

  -- Location Info
  location_latitude DECIMAL(10, 8),
  location_longitude DECIMAL(11, 8),
  location_name VARCHAR(255),
  location_address TEXT,

  -- Template Info
  template_name VARCHAR(100),
  template_language VARCHAR(10),
  template_params JSONB,

  -- Interactive Message Info
  interactive_type VARCHAR(20),
  interactive_data JSONB,

  -- Reaction Info
  reaction_emoji VARCHAR(10),
  reaction_message_id VARCHAR(150),

  -- Context
  context_message_id VARCHAR(150),

  -- Error Info
  error_code VARCHAR(50),
  error_message TEXT,

  -- Conversation Info
  conversation_id INT,
  conversation_category VARCHAR(20),
  conversation_origin VARCHAR(20),

  -- Timestamps
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Metadata
  metadata JSONB,
  raw_webhook_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact ON whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(tenant_id, direction, created_at DESC);

-- =============================================================================
-- WhatsApp Contacts Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_account_id INT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- WhatsApp Info
  phone_number VARCHAR(20) NOT NULL,
  whatsapp_name VARCHAR(100),
  profile_pic_url TEXT,

  -- Conversation State
  last_message_at TIMESTAMP,
  last_message_from VARCHAR(10),
  conversation_state VARCHAR(20) DEFAULT 'open',

  -- Opt-in Status
  opted_in BOOLEAN DEFAULT true,
  opted_in_at TIMESTAMP,
  opted_out_at TIMESTAMP,
  opt_out_reason TEXT,

  -- Statistics
  message_count INT DEFAULT 0,
  last_contacted_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(whatsapp_account_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_tenant ON whatsapp_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_contact ON whatsapp_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(whatsapp_account_id, phone_number);

-- =============================================================================
-- WhatsApp Media Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_media (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id INT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- Media Identity
  media_id VARCHAR(100),
  message_id INT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,

  -- Media Details
  media_type VARCHAR(20) NOT NULL,
  mime_type VARCHAR(100),
  filename VARCHAR(255),
  caption TEXT,

  -- File Info
  size_bytes BIGINT,
  sha256 VARCHAR(64),

  -- Storage
  meta_url TEXT,
  s3_key VARCHAR(500),
  s3_url TEXT,

  -- Status
  download_status VARCHAR(20) DEFAULT 'pending',
  upload_status VARCHAR(20) DEFAULT 'pending',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  downloaded_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_media_tenant ON whatsapp_media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_media_message ON whatsapp_media(message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_media_status ON whatsapp_media(download_status);

-- =============================================================================
-- WhatsApp Webhooks Log Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_webhooks_log (
  id SERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  whatsapp_account_id INT REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,

  -- Webhook Info
  event_type VARCHAR(50),
  phone_number_id VARCHAR(50),

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  processing_error TEXT,

  -- Payload
  payload JSONB NOT NULL,

  -- Metadata
  received_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhooks_tenant ON whatsapp_webhooks_log(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhooks_processed ON whatsapp_webhooks_log(processed, received_at);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE whatsapp_accounts IS 'WhatsApp Business Account credentials and configuration';
COMMENT ON TABLE whatsapp_messages IS 'All WhatsApp messages (sent and received)';
COMMENT ON TABLE whatsapp_templates IS 'Approved message templates for WhatsApp Business API';
COMMENT ON TABLE whatsapp_contacts IS 'WhatsApp-specific contact info and conversation metadata';
COMMENT ON TABLE whatsapp_media IS 'Media files from WhatsApp messages';
COMMENT ON TABLE whatsapp_webhooks_log IS 'Audit log of webhook events from Meta';
