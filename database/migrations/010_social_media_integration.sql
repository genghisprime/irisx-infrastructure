-- Migration: 010_social_media_integration.sql
-- Description: Social media integration (Discord, Slack, Teams, Telegram)
-- Created: October 30, 2025
-- Phase: Week 17-18 - Social Media Integration

-- =============================================================================
-- Social Media Accounts Table
-- =============================================================================
-- Stores OAuth credentials and configuration for all social platforms

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Platform Info
  platform VARCHAR(20) NOT NULL, -- 'discord', 'slack', 'teams', 'telegram'
  account_name VARCHAR(100) NOT NULL, -- Server name, Workspace name, Team name, Bot name

  -- Platform-specific IDs
  platform_user_id VARCHAR(100), -- Bot user ID
  platform_team_id VARCHAR(100), -- Guild ID (Discord), Workspace ID (Slack), Team ID (Teams)

  -- OAuth Credentials (encrypted)
  access_token TEXT,
  refresh_token TEXT,
  bot_token TEXT, -- For Discord, Telegram
  webhook_url TEXT, -- Incoming webhook URL

  -- Configuration
  settings JSONB, -- Platform-specific settings
  enabled_channels JSONB, -- List of enabled channel IDs

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'disabled', 'error'
  last_synced_at TIMESTAMP,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, platform, platform_team_id)
);

CREATE INDEX idx_social_accounts_tenant ON social_accounts(tenant_id, platform);
CREATE INDEX idx_social_accounts_status ON social_accounts(status);

-- =============================================================================
-- Social Media Messages Table
-- =============================================================================
-- Unified table for all social media messages

CREATE TABLE social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Platform Info
  platform VARCHAR(20) NOT NULL,

  -- Message Identity
  platform_message_id VARCHAR(200) UNIQUE, -- Unique ID from platform
  platform_channel_id VARCHAR(100), -- Channel/DM ID
  platform_thread_id VARCHAR(100), -- Thread ID (for threaded replies)

  -- Direction and Status
  direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
  status VARCHAR(20) DEFAULT 'sent', -- 'pending', 'sent', 'delivered', 'failed', 'deleted'

  -- Sender/Recipient Info
  from_user_id VARCHAR(100) NOT NULL, -- Platform user ID
  from_username VARCHAR(100), -- Display name or username
  from_avatar_url TEXT,

  to_user_id VARCHAR(100), -- For DMs
  to_username VARCHAR(100),

  -- Channel Info
  channel_name VARCHAR(100), -- Channel or DM name
  channel_type VARCHAR(20), -- 'channel', 'dm', 'group', 'thread'

  -- Message Content
  message_type VARCHAR(20) NOT NULL, -- 'text', 'image', 'video', 'file', 'audio', 'sticker', 'embed'
  text_content TEXT,

  -- Media/Attachments
  attachments JSONB, -- Array of attachment objects
  -- Example: [{"type": "image", "url": "https://...", "filename": "image.png", "size": 12345}]

  -- Embeds (Discord/Slack rich messages)
  embeds JSONB,
  -- Example: [{"title": "Alert", "description": "...", "color": "#FF0000", "fields": [...]}]

  -- Reactions
  reactions JSONB, -- Array of reactions
  -- Example: [{"emoji": "👍", "count": 5, "users": ["user1", "user2"]}]

  -- Reply/Thread Context
  reply_to_message_id VARCHAR(200), -- Message being replied to
  is_thread_parent BOOLEAN DEFAULT false,

  -- Mentions
  mentions JSONB, -- Array of mentioned users
  -- Example: [{"id": "user123", "username": "john_doe"}]

  -- Platform-specific Data
  platform_data JSONB, -- Full message object from platform

  -- Timestamps
  sent_at TIMESTAMP,
  edited_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_social_messages_tenant ON social_messages(tenant_id, created_at DESC);
CREATE INDEX idx_social_messages_account ON social_messages(social_account_id, created_at DESC);
CREATE INDEX idx_social_messages_contact ON social_messages(contact_id, created_at DESC);
CREATE INDEX idx_social_messages_channel ON social_messages(platform_channel_id, created_at DESC);
CREATE INDEX idx_social_messages_thread ON social_messages(platform_thread_id, created_at DESC) WHERE platform_thread_id IS NOT NULL;
CREATE INDEX idx_social_messages_platform ON social_messages(platform, direction, created_at DESC);

-- =============================================================================
-- Social Media Channels Table
-- =============================================================================
-- Tracks channels/rooms/groups across platforms

CREATE TABLE social_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,

  -- Channel Identity
  platform VARCHAR(20) NOT NULL,
  platform_channel_id VARCHAR(100) NOT NULL,

  -- Channel Info
  channel_name VARCHAR(100) NOT NULL,
  channel_type VARCHAR(20), -- 'text', 'voice', 'private', 'public', 'dm', 'group'
  channel_topic TEXT,

  -- Permissions
  is_enabled BOOLEAN DEFAULT true, -- Whether bot can post here
  is_monitored BOOLEAN DEFAULT true, -- Whether to listen for messages

  -- Statistics
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(social_account_id, platform_channel_id)
);

CREATE INDEX idx_social_channels_account ON social_channels(social_account_id);
CREATE INDEX idx_social_channels_enabled ON social_channels(is_enabled, is_monitored);

-- =============================================================================
-- Social Media Users Table
-- =============================================================================
-- Tracks users across platforms (for contact linking)

CREATE TABLE social_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Platform Info
  platform VARCHAR(20) NOT NULL,
  platform_user_id VARCHAR(100) NOT NULL,

  -- User Info
  username VARCHAR(100),
  display_name VARCHAR(100),
  email VARCHAR(255), -- If available
  avatar_url TEXT,

  -- Status
  is_bot BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Statistics
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(platform, platform_user_id)
);

CREATE INDEX idx_social_users_tenant ON social_users(tenant_id);
CREATE INDEX idx_social_users_contact ON social_users(contact_id);
CREATE INDEX idx_social_users_platform ON social_users(platform, platform_user_id);

-- =============================================================================
-- Social Media Webhooks Log Table
-- =============================================================================
-- Audit log of webhook events from all platforms

CREATE TABLE social_webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,

  -- Webhook Info
  platform VARCHAR(20) NOT NULL,
  event_type VARCHAR(50),

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  processing_error TEXT,

  -- Payload
  payload JSONB NOT NULL,

  -- Metadata
  received_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_webhooks_platform ON social_webhooks_log(platform, received_at DESC);
CREATE INDEX idx_social_webhooks_processed ON social_webhooks_log(processed, received_at);

-- =============================================================================
-- Social Media Statistics View
-- =============================================================================

CREATE OR REPLACE VIEW social_stats AS
SELECT
  sa.id AS account_id,
  sa.tenant_id,
  sa.platform,
  sa.account_name,
  sa.status,

  -- Message counts
  COUNT(sm.id) AS total_messages,
  COUNT(CASE WHEN sm.direction = 'outbound' THEN 1 END) AS sent_messages,
  COUNT(CASE WHEN sm.direction = 'inbound' THEN 1 END) AS received_messages,

  -- Message types
  COUNT(CASE WHEN sm.message_type = 'text' THEN 1 END) AS text_messages,
  COUNT(CASE WHEN sm.message_type = 'image' THEN 1 END) AS image_messages,
  COUNT(CASE WHEN sm.message_type = 'file' THEN 1 END) AS file_messages,

  -- Channels
  (SELECT COUNT(*) FROM social_channels WHERE social_account_id = sa.id AND is_enabled = true) AS enabled_channels,

  -- Users
  (SELECT COUNT(DISTINCT from_user_id) FROM social_messages WHERE social_account_id = sa.id) AS unique_users,

  -- Recent activity
  COUNT(CASE WHEN sm.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS messages_24h,
  MAX(sm.created_at) AS last_message_at

FROM social_accounts sa
LEFT JOIN social_messages sm ON sa.id = sm.social_account_id
GROUP BY sa.id, sa.tenant_id, sa.platform, sa.account_name, sa.status;

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Get or create social user
CREATE OR REPLACE FUNCTION get_or_create_social_user(
  p_tenant_id UUID,
  p_platform VARCHAR(20),
  p_platform_user_id VARCHAR(100),
  p_username VARCHAR(100) DEFAULT NULL,
  p_display_name VARCHAR(100) DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_is_bot BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find existing user
  SELECT id INTO v_user_id
  FROM social_users
  WHERE platform = p_platform
    AND platform_user_id = p_platform_user_id;

  -- Create if not exists
  IF v_user_id IS NULL THEN
    INSERT INTO social_users (
      tenant_id, platform, platform_user_id, username, display_name, avatar_url, is_bot, created_at
    ) VALUES (
      p_tenant_id, p_platform, p_platform_user_id, p_username, p_display_name, p_avatar_url, p_is_bot, NOW()
    )
    RETURNING id INTO v_user_id;
  ELSE
    -- Update info if provided
    UPDATE social_users
    SET
      username = COALESCE(p_username, username),
      display_name = COALESCE(p_display_name, display_name),
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Update channel message count
CREATE OR REPLACE FUNCTION update_social_channel_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_channels
  SET
    message_count = message_count + 1,
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE platform_channel_id = NEW.platform_channel_id
    AND social_account_id = NEW.social_account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_social_channel_stats
  AFTER INSERT ON social_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_social_channel_stats();

-- Update user message count
CREATE OR REPLACE FUNCTION update_social_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_users
  SET
    message_count = message_count + 1,
    last_message_at = NEW.created_at,
    updated_at = NOW()
  WHERE platform = NEW.platform
    AND platform_user_id = NEW.from_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_social_user_stats
  AFTER INSERT ON social_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_social_user_stats();

-- =============================================================================
-- Sample Data (for testing)
-- =============================================================================

-- Example Discord account
INSERT INTO social_accounts (
  tenant_id,
  platform,
  account_name,
  platform_user_id,
  platform_team_id,
  bot_token,
  status
) VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'discord',
  'IRISX Support Server',
  '1234567890123456789', -- Bot user ID
  '9876543210987654321', -- Guild ID
  'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXX', -- Bot token
  'active'
);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE social_accounts IS 'OAuth credentials and configuration for Discord, Slack, Teams, Telegram';
COMMENT ON TABLE social_messages IS 'Unified table for all social media messages across platforms';
COMMENT ON TABLE social_channels IS 'Channels/rooms/groups across social platforms';
COMMENT ON TABLE social_users IS 'Users across social platforms (for contact linking)';
COMMENT ON TABLE social_webhooks_log IS 'Audit log of webhook events from social platforms';

COMMENT ON COLUMN social_accounts.platform IS 'discord, slack, teams, telegram';
COMMENT ON COLUMN social_messages.message_type IS 'text, image, video, file, audio, sticker, embed';
COMMENT ON COLUMN social_messages.channel_type IS 'channel, dm, group, thread';

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Tables: 5
-- Views: 1
-- Functions: 3
-- Triggers: 2
-- Sample data: 1 Discord account
