-- Migration: 009_whatsapp_integration.sql
-- Description: WhatsApp Business API integration support
-- Created: October 30, 2025
-- Phase: Week 15-16 Phase 1 - WhatsApp Integration

-- =============================================================================
-- WhatsApp Accounts Table
-- =============================================================================
-- Stores WhatsApp Business Account credentials and configuration

CREATE TABLE whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- WhatsApp Business Account Info
  phone_number_id VARCHAR(50) NOT NULL, -- Meta's phone number ID
  phone_number VARCHAR(20) NOT NULL, -- Actual phone number (E.164 format)
  display_name VARCHAR(100), -- Business name
  business_account_id VARCHAR(50), -- Meta business account ID

  -- API Credentials
  access_token TEXT NOT NULL, -- Meta access token (encrypted)
  webhook_verify_token VARCHAR(100), -- For webhook verification

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'disabled', 'suspended'
  verified BOOLEAN DEFAULT false,
  quality_rating VARCHAR(20), -- 'GREEN', 'YELLOW', 'RED', 'UNKNOWN'

  -- Limits (from Meta)
  messaging_limit VARCHAR(20), -- 'TIER_50', 'TIER_250', 'TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'
  daily_conversation_limit INT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX idx_whatsapp_accounts_tenant ON whatsapp_accounts(tenant_id);
CREATE UNIQUE INDEX idx_whatsapp_accounts_phone ON whatsapp_accounts(phone_number_id);

-- =============================================================================
-- WhatsApp Messages Table
-- =============================================================================
-- Stores all WhatsApp messages (sent and received)

CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Message Identity
  message_id VARCHAR(100), -- Meta's message ID (for sent messages)
  wamid VARCHAR(150), -- WhatsApp message ID (for received messages)

  -- Direction and Status
  direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'

  -- Contact Info
  from_number VARCHAR(20) NOT NULL, -- E.164 format
  to_number VARCHAR(20) NOT NULL, -- E.164 format
  contact_name VARCHAR(100), -- Display name if available

  -- Message Content
  message_type VARCHAR(20) NOT NULL, -- 'text', 'image', 'video', 'audio', 'document', 'location', 'contacts', 'template', 'interactive', 'reaction', 'sticker'
  text_body TEXT, -- For text messages
  caption TEXT, -- For media messages

  -- Media Info (for image, video, audio, document)
  media_id VARCHAR(100), -- Meta's media ID
  media_url TEXT, -- URL to download media
  media_mime_type VARCHAR(100),
  media_filename VARCHAR(255),
  media_sha256 VARCHAR(64),
  media_size_bytes BIGINT,
  media_s3_key VARCHAR(500), -- Our S3 storage location

  -- Location Info (for location messages)
  location_latitude DECIMAL(10, 8),
  location_longitude DECIMAL(11, 8),
  location_name VARCHAR(255),
  location_address TEXT,

  -- Template Info (for template messages)
  template_name VARCHAR(100),
  template_language VARCHAR(10),
  template_params JSONB,

  -- Interactive Message Info (buttons, lists)
  interactive_type VARCHAR(20), -- 'button', 'list', 'product', 'product_list'
  interactive_data JSONB,

  -- Reaction Info
  reaction_emoji VARCHAR(10),
  reaction_message_id VARCHAR(150), -- Message being reacted to

  -- Context (Reply Info)
  context_message_id VARCHAR(150), -- Message being replied to

  -- Error Info
  error_code VARCHAR(50),
  error_message TEXT,

  -- Conversation Info
  conversation_id UUID, -- Link related messages
  conversation_category VARCHAR(20), -- 'authentication', 'marketing', 'utility', 'service'
  conversation_origin VARCHAR(20), -- 'business_initiated', 'user_initiated'

  -- Timestamps
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Metadata
  metadata JSONB, -- Additional data from webhook
  raw_webhook_data JSONB -- Full webhook payload for debugging
);

-- Indexes for performance
CREATE INDEX idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_contact ON whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(tenant_id, status, created_at DESC);
CREATE INDEX idx_whatsapp_messages_direction ON whatsapp_messages(tenant_id, direction, created_at DESC);
CREATE UNIQUE INDEX idx_whatsapp_messages_wamid ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;

-- =============================================================================
-- WhatsApp Templates Table
-- =============================================================================
-- Stores approved message templates for WhatsApp

CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- Template Identity
  template_name VARCHAR(100) NOT NULL, -- Meta's template name
  template_id VARCHAR(100), -- Meta's template ID

  -- Content
  language VARCHAR(10) NOT NULL, -- 'en_US', 'es_ES', etc.
  category VARCHAR(20) NOT NULL, -- 'AUTHENTICATION', 'MARKETING', 'UTILITY'

  -- Template Structure
  header_type VARCHAR(20), -- 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION', null
  header_text TEXT,
  header_media_url TEXT,

  body_text TEXT NOT NULL, -- Template body with {{1}}, {{2}} placeholders
  footer_text TEXT,

  -- Buttons (if any)
  buttons JSONB, -- Array of button objects
  -- Example: [{"type": "QUICK_REPLY", "text": "Yes"}, {"type": "PHONE_NUMBER", "text": "Call Us", "phone_number": "+1234567890"}]

  -- Status
  status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'DISABLED'
  rejection_reason TEXT,

  -- Quality
  quality_score VARCHAR(20), -- 'GREEN', 'YELLOW', 'RED', 'UNKNOWN'

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

-- Indexes
CREATE INDEX idx_whatsapp_templates_tenant ON whatsapp_templates(tenant_id);
CREATE INDEX idx_whatsapp_templates_account ON whatsapp_templates(whatsapp_account_id);
CREATE INDEX idx_whatsapp_templates_status ON whatsapp_templates(status);
CREATE UNIQUE INDEX idx_whatsapp_templates_name_lang ON whatsapp_templates(whatsapp_account_id, template_name, language);

-- =============================================================================
-- WhatsApp Contacts Table
-- =============================================================================
-- Stores WhatsApp-specific contact info and conversation metadata

CREATE TABLE whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- WhatsApp Info
  phone_number VARCHAR(20) NOT NULL, -- E.164 format
  whatsapp_name VARCHAR(100), -- Name from WhatsApp profile
  profile_pic_url TEXT,

  -- Conversation State
  last_message_at TIMESTAMP,
  last_message_from VARCHAR(10), -- 'user', 'business'
  conversation_state VARCHAR(20) DEFAULT 'open', -- 'open', 'closed', 'pending'

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

-- Indexes
CREATE INDEX idx_whatsapp_contacts_tenant ON whatsapp_contacts(tenant_id);
CREATE INDEX idx_whatsapp_contacts_contact ON whatsapp_contacts(contact_id);
CREATE INDEX idx_whatsapp_contacts_phone ON whatsapp_contacts(whatsapp_account_id, phone_number);

-- =============================================================================
-- WhatsApp Media Table
-- =============================================================================
-- Tracks media files (images, videos, documents, audio)

CREATE TABLE whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,

  -- Media Identity
  media_id VARCHAR(100) UNIQUE, -- Meta's media ID
  message_id UUID REFERENCES whatsapp_messages(id) ON DELETE SET NULL,

  -- Media Details
  media_type VARCHAR(20) NOT NULL, -- 'image', 'video', 'audio', 'document', 'sticker'
  mime_type VARCHAR(100),
  filename VARCHAR(255),
  caption TEXT,

  -- File Info
  size_bytes BIGINT,
  sha256 VARCHAR(64),

  -- Storage
  meta_url TEXT, -- Meta's temporary download URL
  s3_key VARCHAR(500), -- Our S3 storage location
  s3_url TEXT, -- Our permanent URL

  -- Status
  download_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'downloading', 'completed', 'failed'
  upload_status VARCHAR(20) DEFAULT 'pending', -- For outbound media

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  downloaded_at TIMESTAMP,
  expires_at TIMESTAMP -- Meta URLs expire after 5 minutes
);

-- Indexes
CREATE INDEX idx_whatsapp_media_tenant ON whatsapp_media(tenant_id);
CREATE INDEX idx_whatsapp_media_message ON whatsapp_media(message_id);
CREATE INDEX idx_whatsapp_media_status ON whatsapp_media(download_status);

-- =============================================================================
-- WhatsApp Webhooks Log Table
-- =============================================================================
-- Audit log of all webhook events received from Meta

CREATE TABLE whatsapp_webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  whatsapp_account_id UUID REFERENCES whatsapp_accounts(id) ON DELETE SET NULL,

  -- Webhook Info
  event_type VARCHAR(50), -- 'messages', 'message_status', 'messages_reaction', etc.
  phone_number_id VARCHAR(50),

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  processing_error TEXT,

  -- Payload
  payload JSONB NOT NULL, -- Full webhook payload

  -- Metadata
  received_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_whatsapp_webhooks_tenant ON whatsapp_webhooks_log(tenant_id, received_at DESC);
CREATE INDEX idx_whatsapp_webhooks_processed ON whatsapp_webhooks_log(processed, received_at);

-- =============================================================================
-- WhatsApp Statistics View
-- =============================================================================
-- Aggregated statistics per WhatsApp account

CREATE OR REPLACE VIEW whatsapp_stats AS
SELECT
  wa.id AS account_id,
  wa.tenant_id,
  wa.phone_number,
  wa.display_name,
  wa.status,
  wa.quality_rating,

  -- Message counts
  COUNT(wm.id) AS total_messages,
  COUNT(CASE WHEN wm.direction = 'outbound' THEN 1 END) AS sent_messages,
  COUNT(CASE WHEN wm.direction = 'inbound' THEN 1 END) AS received_messages,

  -- Status counts
  COUNT(CASE WHEN wm.status = 'delivered' THEN 1 END) AS delivered_count,
  COUNT(CASE WHEN wm.status = 'read' THEN 1 END) AS read_count,
  COUNT(CASE WHEN wm.status = 'failed' THEN 1 END) AS failed_count,

  -- Delivery rate
  ROUND(
    100.0 * COUNT(CASE WHEN wm.status IN ('delivered', 'read') THEN 1 END) /
    NULLIF(COUNT(CASE WHEN wm.direction = 'outbound' THEN 1 END), 0),
    2
  ) AS delivery_rate_percent,

  -- Read rate
  ROUND(
    100.0 * COUNT(CASE WHEN wm.status = 'read' THEN 1 END) /
    NULLIF(COUNT(CASE WHEN wm.status IN ('delivered', 'read') THEN 1 END), 0),
    2
  ) AS read_rate_percent,

  -- Message types
  COUNT(CASE WHEN wm.message_type = 'text' THEN 1 END) AS text_messages,
  COUNT(CASE WHEN wm.message_type = 'image' THEN 1 END) AS image_messages,
  COUNT(CASE WHEN wm.message_type = 'video' THEN 1 END) AS video_messages,
  COUNT(CASE WHEN wm.message_type = 'document' THEN 1 END) AS document_messages,
  COUNT(CASE WHEN wm.message_type = 'template' THEN 1 END) AS template_messages,

  -- Timing
  MAX(wm.created_at) AS last_message_at,

  -- Today's stats
  COUNT(CASE WHEN wm.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS messages_24h,
  COUNT(CASE WHEN wm.created_at > NOW() - INTERVAL '24 hours' AND wm.direction = 'outbound' THEN 1 END) AS sent_24h,
  COUNT(CASE WHEN wm.created_at > NOW() - INTERVAL '24 hours' AND wm.direction = 'inbound' THEN 1 END) AS received_24h

FROM whatsapp_accounts wa
LEFT JOIN whatsapp_messages wm ON wa.id = wm.whatsapp_account_id
GROUP BY wa.id, wa.tenant_id, wa.phone_number, wa.display_name, wa.status, wa.quality_rating;

-- =============================================================================
-- Trigger Function: Update message counts
-- =============================================================================

CREATE OR REPLACE FUNCTION update_whatsapp_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update contact's last message timestamp and count
  UPDATE whatsapp_contacts
  SET
    last_message_at = NEW.created_at,
    last_message_from = CASE WHEN NEW.direction = 'inbound' THEN 'user' ELSE 'business' END,
    message_count = message_count + 1,
    updated_at = NOW()
  WHERE phone_number = NEW.from_number
    AND whatsapp_account_id = NEW.whatsapp_account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update contact stats
CREATE TRIGGER trigger_update_whatsapp_contact_stats
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_contact_stats();

-- =============================================================================
-- Helper Function: Get or create WhatsApp contact
-- =============================================================================

CREATE OR REPLACE FUNCTION get_or_create_whatsapp_contact(
  p_tenant_id UUID,
  p_whatsapp_account_id UUID,
  p_phone_number VARCHAR(20),
  p_whatsapp_name VARCHAR(100) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- Try to find existing contact
  SELECT id INTO v_contact_id
  FROM whatsapp_contacts
  WHERE whatsapp_account_id = p_whatsapp_account_id
    AND phone_number = p_phone_number;

  -- Create if not exists
  IF v_contact_id IS NULL THEN
    INSERT INTO whatsapp_contacts (
      tenant_id,
      whatsapp_account_id,
      phone_number,
      whatsapp_name,
      created_at
    ) VALUES (
      p_tenant_id,
      p_whatsapp_account_id,
      p_phone_number,
      p_whatsapp_name,
      NOW()
    )
    RETURNING id INTO v_contact_id;
  ELSIF p_whatsapp_name IS NOT NULL THEN
    -- Update name if provided
    UPDATE whatsapp_contacts
    SET whatsapp_name = p_whatsapp_name,
        updated_at = NOW()
    WHERE id = v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Sample Data (for testing)
-- =============================================================================

-- Example WhatsApp account
INSERT INTO whatsapp_accounts (
  tenant_id,
  phone_number_id,
  phone_number,
  display_name,
  business_account_id,
  access_token,
  webhook_verify_token,
  status,
  verified,
  quality_rating,
  messaging_limit
) VALUES (
  (SELECT id FROM tenants LIMIT 1),
  '123456789012345',
  '+15551234567',
  'IRISX Support',
  'business_account_123',
  'EAAxxxxxxxxx', -- This should be encrypted in production
  'verify_token_123',
  'active',
  true,
  'GREEN',
  'TIER_1K'
);

-- =============================================================================
-- Comments and Notes
-- =============================================================================

COMMENT ON TABLE whatsapp_accounts IS 'WhatsApp Business Account credentials and configuration';
COMMENT ON TABLE whatsapp_messages IS 'All WhatsApp messages (sent and received)';
COMMENT ON TABLE whatsapp_templates IS 'Approved message templates for WhatsApp Business API';
COMMENT ON TABLE whatsapp_contacts IS 'WhatsApp-specific contact info and conversation metadata';
COMMENT ON TABLE whatsapp_media IS 'Media files from WhatsApp messages';
COMMENT ON TABLE whatsapp_webhooks_log IS 'Audit log of webhook events from Meta';

COMMENT ON COLUMN whatsapp_messages.message_type IS 'text, image, video, audio, document, location, contacts, template, interactive, reaction, sticker';
COMMENT ON COLUMN whatsapp_messages.status IS 'pending, sent, delivered, read, failed';
COMMENT ON COLUMN whatsapp_templates.category IS 'AUTHENTICATION, MARKETING, UTILITY';
COMMENT ON COLUMN whatsapp_templates.status IS 'PENDING, APPROVED, REJECTED, DISABLED';

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Tables: 6
-- Views: 1
-- Functions: 2
-- Triggers: 1
-- Sample data: 1 WhatsApp account
