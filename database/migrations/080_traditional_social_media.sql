-- Migration: 080_traditional_social_media.sql
-- Description: Add support for traditional social media platforms (Facebook, Twitter/X, Instagram, LinkedIn)
-- Date: 2026-02-16
--
-- ARCHITECTURE:
-- - IRISX Admin configures OAuth app credentials (App ID, App Secret) for each platform
-- - Customers connect their own accounts via OAuth in Customer Portal
-- - Customer access tokens are stored encrypted per-tenant
-- - Messages route through customer's connected accounts

-- =============================================================================
-- EXTEND social_accounts PLATFORM CONSTRAINT
-- =============================================================================

-- Update platform constraint to include new platforms
DO $$ BEGIN
  ALTER TABLE social_accounts
    DROP CONSTRAINT IF EXISTS social_accounts_platform_check;

  ALTER TABLE social_accounts
    ADD CONSTRAINT social_accounts_platform_check
    CHECK (platform IN (
      'discord', 'slack', 'teams', 'telegram',  -- Existing
      'facebook', 'twitter', 'instagram', 'linkedin',  -- Traditional social
      'whatsapp', 'line', 'wechat', 'viber'  -- Messaging apps
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

-- =============================================================================
-- PLATFORM OAUTH APPS (Admin-managed)
-- Stores our OAuth app credentials for each platform
-- =============================================================================

CREATE TABLE IF NOT EXISTS social_platform_apps (
  id SERIAL PRIMARY KEY,

  -- Platform identification
  platform VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,

  -- OAuth App Credentials (encrypted)
  app_id VARCHAR(255),              -- Facebook App ID, Twitter Client ID, etc.
  app_secret_encrypted TEXT,        -- Encrypted app secret
  app_secret_iv VARCHAR(255),

  -- OAuth Configuration
  oauth_authorize_url TEXT,
  oauth_token_url TEXT,
  oauth_scope TEXT,                 -- Required permissions/scopes

  -- API Configuration
  api_base_url TEXT,
  api_version VARCHAR(20),

  -- Webhook Configuration
  webhook_verify_token VARCHAR(255),
  webhook_secret_encrypted TEXT,
  webhook_secret_iv VARCHAR(255),

  -- Features & Limits
  features JSONB DEFAULT '{}',       -- {"messaging": true, "posting": true, "analytics": true}
  rate_limits JSONB DEFAULT '{}',    -- {"requests_per_hour": 1000, "messages_per_day": 250}

  -- Status
  is_enabled BOOLEAN DEFAULT false,  -- Admin must enable after configuration
  setup_instructions TEXT,           -- Help text for setup

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- FACEBOOK-SPECIFIC TABLES
-- =============================================================================

-- Facebook Pages connected by tenants
CREATE TABLE IF NOT EXISTS facebook_pages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,

  -- Page Identity
  page_id VARCHAR(100) NOT NULL,
  page_name VARCHAR(255) NOT NULL,
  page_username VARCHAR(100),
  page_category VARCHAR(100),
  page_picture_url TEXT,

  -- Access Token (encrypted, long-lived page token)
  page_access_token_encrypted TEXT NOT NULL,
  page_access_token_iv VARCHAR(255) NOT NULL,
  token_expires_at TIMESTAMPTZ,

  -- Permissions
  permissions JSONB DEFAULT '[]',    -- ['pages_messaging', 'pages_manage_posts', etc.]

  -- Messaging Settings
  messaging_enabled BOOLEAN DEFAULT true,
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,

  -- Statistics
  follower_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, page_id)
);

CREATE INDEX idx_facebook_pages_tenant ON facebook_pages(tenant_id);
CREATE INDEX idx_facebook_pages_page_id ON facebook_pages(page_id);

-- Facebook Messenger conversations
CREATE TABLE IF NOT EXISTS facebook_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  facebook_page_id INTEGER NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,

  -- Conversation Identity
  psid VARCHAR(100) NOT NULL,        -- Page-scoped User ID
  thread_id VARCHAR(100),

  -- User Info (from Facebook)
  user_first_name VARCHAR(100),
  user_last_name VARCHAR(100),
  user_profile_pic TEXT,
  user_locale VARCHAR(20),
  user_timezone INTEGER,

  -- Conversation State
  status VARCHAR(20) DEFAULT 'open', -- open, closed, pending
  assigned_agent_id INTEGER REFERENCES agents(id),

  -- Last Activity
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction VARCHAR(10),
  unread_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(facebook_page_id, psid)
);

CREATE INDEX idx_facebook_conversations_tenant ON facebook_conversations(tenant_id);
CREATE INDEX idx_facebook_conversations_status ON facebook_conversations(status, last_message_at DESC);

-- =============================================================================
-- TWITTER/X TABLES
-- =============================================================================

-- Twitter accounts connected by tenants
CREATE TABLE IF NOT EXISTS twitter_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,

  -- Account Identity
  twitter_user_id VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,    -- @handle without @
  display_name VARCHAR(255),
  profile_image_url TEXT,
  verified BOOLEAN DEFAULT false,

  -- OAuth 2.0 Tokens (encrypted)
  access_token_encrypted TEXT NOT NULL,
  access_token_iv VARCHAR(255) NOT NULL,
  refresh_token_encrypted TEXT,
  refresh_token_iv VARCHAR(255),
  token_expires_at TIMESTAMPTZ,

  -- Permissions/Scopes
  scopes JSONB DEFAULT '[]',         -- ['tweet.read', 'tweet.write', 'dm.read', 'dm.write']

  -- Features
  dm_enabled BOOLEAN DEFAULT true,
  posting_enabled BOOLEAN DEFAULT false,
  mention_monitoring BOOLEAN DEFAULT true,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,

  -- Statistics
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  tweet_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, twitter_user_id)
);

CREATE INDEX idx_twitter_accounts_tenant ON twitter_accounts(tenant_id);
CREATE INDEX idx_twitter_accounts_user_id ON twitter_accounts(twitter_user_id);

-- Twitter DM conversations
CREATE TABLE IF NOT EXISTS twitter_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  twitter_account_id INTEGER NOT NULL REFERENCES twitter_accounts(id) ON DELETE CASCADE,

  -- Conversation Identity
  conversation_id VARCHAR(100) NOT NULL,
  participant_id VARCHAR(100) NOT NULL,
  participant_username VARCHAR(100),
  participant_name VARCHAR(255),
  participant_profile_pic TEXT,

  -- Conversation State
  status VARCHAR(20) DEFAULT 'open',
  assigned_agent_id INTEGER REFERENCES agents(id),

  -- Last Activity
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction VARCHAR(10),
  unread_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(twitter_account_id, conversation_id)
);

CREATE INDEX idx_twitter_conversations_tenant ON twitter_conversations(tenant_id);

-- =============================================================================
-- INSTAGRAM TABLES
-- =============================================================================

-- Instagram Business/Creator accounts (connected via Facebook)
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
  facebook_page_id INTEGER REFERENCES facebook_pages(id),  -- Instagram requires FB Page

  -- Account Identity
  instagram_user_id VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  profile_picture_url TEXT,
  account_type VARCHAR(50),          -- BUSINESS, CREATOR

  -- Access Token (uses Facebook Page token)
  -- Token stored in linked facebook_pages record

  -- Features
  messaging_enabled BOOLEAN DEFAULT true,
  story_mentions_enabled BOOLEAN DEFAULT true,
  comment_replies_enabled BOOLEAN DEFAULT true,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,

  -- Statistics
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  media_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, instagram_user_id)
);

CREATE INDEX idx_instagram_accounts_tenant ON instagram_accounts(tenant_id);

-- Instagram DM conversations
CREATE TABLE IF NOT EXISTS instagram_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instagram_account_id INTEGER NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,

  -- Conversation Identity
  igsid VARCHAR(100) NOT NULL,       -- Instagram-scoped User ID
  thread_id VARCHAR(100),

  -- User Info
  user_username VARCHAR(100),
  user_name VARCHAR(255),
  user_profile_pic TEXT,

  -- Conversation State
  status VARCHAR(20) DEFAULT 'open',
  assigned_agent_id INTEGER REFERENCES agents(id),

  -- Last Activity
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction VARCHAR(10),
  unread_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(instagram_account_id, igsid)
);

CREATE INDEX idx_instagram_conversations_tenant ON instagram_conversations(tenant_id);

-- =============================================================================
-- LINKEDIN TABLES
-- =============================================================================

-- LinkedIn Organization Pages
CREATE TABLE IF NOT EXISTS linkedin_pages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,

  -- Organization Identity
  organization_id VARCHAR(100) NOT NULL,
  organization_name VARCHAR(255) NOT NULL,
  vanity_name VARCHAR(100),          -- LinkedIn URL slug
  logo_url TEXT,

  -- OAuth Tokens (encrypted)
  access_token_encrypted TEXT NOT NULL,
  access_token_iv VARCHAR(255) NOT NULL,
  refresh_token_encrypted TEXT,
  refresh_token_iv VARCHAR(255),
  token_expires_at TIMESTAMPTZ,

  -- Permissions
  permissions JSONB DEFAULT '[]',    -- ['r_organization_social', 'w_organization_social', etc.]

  -- Features
  messaging_enabled BOOLEAN DEFAULT true,
  posting_enabled BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,

  -- Statistics
  follower_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, organization_id)
);

CREATE INDEX idx_linkedin_pages_tenant ON linkedin_pages(tenant_id);

-- =============================================================================
-- UNIFIED SOCIAL MESSAGES (extends existing social_messages)
-- =============================================================================

-- Add platform-specific columns to social_messages if needed
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='social_messages' AND column_name='facebook_mid') THEN
    ALTER TABLE social_messages ADD COLUMN facebook_mid VARCHAR(255);
    ALTER TABLE social_messages ADD COLUMN instagram_mid VARCHAR(255);
    ALTER TABLE social_messages ADD COLUMN twitter_event_id VARCHAR(255);
    ALTER TABLE social_messages ADD COLUMN linkedin_activity_id VARCHAR(255);
  END IF;
END $$;

-- =============================================================================
-- DEFAULT PLATFORM CONFIGURATIONS
-- =============================================================================

INSERT INTO social_platform_apps (platform, display_name, oauth_authorize_url, oauth_token_url, oauth_scope, api_base_url, api_version, features, setup_instructions, is_enabled)
VALUES
  ('facebook', 'Facebook / Messenger',
   'https://www.facebook.com/v19.0/dialog/oauth',
   'https://graph.facebook.com/v19.0/oauth/access_token',
   'pages_messaging,pages_read_engagement,pages_manage_metadata,pages_manage_posts',
   'https://graph.facebook.com',
   'v19.0',
   '{"messaging": true, "posting": true, "analytics": true, "webhooks": true}',
   'Create a Facebook App at developers.facebook.com. Enable Messenger Platform. Add webhook subscriptions for messages, messaging_postbacks.',
   false
  ),
  ('instagram', 'Instagram',
   'https://www.facebook.com/v19.0/dialog/oauth',
   'https://graph.facebook.com/v19.0/oauth/access_token',
   'instagram_basic,instagram_manage_messages,instagram_content_publish',
   'https://graph.facebook.com',
   'v19.0',
   '{"messaging": true, "posting": true, "story_mentions": true}',
   'Instagram API is accessed via Facebook Graph API. Link Instagram Business account to a Facebook Page, then connect the Facebook Page.',
   false
  ),
  ('twitter', 'Twitter / X',
   'https://twitter.com/i/oauth2/authorize',
   'https://api.twitter.com/2/oauth2/token',
   'tweet.read tweet.write users.read dm.read dm.write offline.access',
   'https://api.twitter.com',
   '2',
   '{"messaging": true, "posting": true, "mentions": true}',
   'Create a Twitter App at developer.twitter.com. Enable OAuth 2.0 with PKCE. Request Elevated access for DM permissions.',
   false
  ),
  ('linkedin', 'LinkedIn',
   'https://www.linkedin.com/oauth/v2/authorization',
   'https://www.linkedin.com/oauth/v2/accessToken',
   'r_organization_social w_organization_social r_liteprofile',
   'https://api.linkedin.com',
   'v2',
   '{"messaging": true, "posting": true}',
   'Create a LinkedIn App at linkedin.com/developers. Request Marketing Developer Platform access for organization posting.',
   false
  )
ON CONFLICT (platform) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  oauth_authorize_url = EXCLUDED.oauth_authorize_url,
  oauth_token_url = EXCLUDED.oauth_token_url,
  oauth_scope = EXCLUDED.oauth_scope,
  api_base_url = EXCLUDED.api_base_url,
  api_version = EXCLUDED.api_version,
  features = EXCLUDED.features,
  setup_instructions = EXCLUDED.setup_instructions,
  updated_at = NOW();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get tenant's connected social accounts summary
CREATE OR REPLACE FUNCTION get_tenant_social_accounts(p_tenant_id INTEGER)
RETURNS TABLE (
  platform VARCHAR(30),
  account_count INTEGER,
  total_conversations INTEGER,
  unread_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'facebook'::VARCHAR(30) as platform,
    COUNT(DISTINCT fp.id)::INTEGER as account_count,
    COUNT(DISTINCT fc.id)::INTEGER as total_conversations,
    COALESCE(SUM(fc.unread_count), 0)::INTEGER as unread_count
  FROM facebook_pages fp
  LEFT JOIN facebook_conversations fc ON fp.id = fc.facebook_page_id
  WHERE fp.tenant_id = p_tenant_id AND fp.is_active = true

  UNION ALL

  SELECT
    'twitter'::VARCHAR(30),
    COUNT(DISTINCT ta.id)::INTEGER,
    COUNT(DISTINCT tc.id)::INTEGER,
    COALESCE(SUM(tc.unread_count), 0)::INTEGER
  FROM twitter_accounts ta
  LEFT JOIN twitter_conversations tc ON ta.id = tc.twitter_account_id
  WHERE ta.tenant_id = p_tenant_id AND ta.is_active = true

  UNION ALL

  SELECT
    'instagram'::VARCHAR(30),
    COUNT(DISTINCT ia.id)::INTEGER,
    COUNT(DISTINCT ic.id)::INTEGER,
    COALESCE(SUM(ic.unread_count), 0)::INTEGER
  FROM instagram_accounts ia
  LEFT JOIN instagram_conversations ic ON ia.id = ic.instagram_account_id
  WHERE ia.tenant_id = p_tenant_id AND ia.is_active = true

  UNION ALL

  SELECT
    'linkedin'::VARCHAR(30),
    COUNT(DISTINCT lp.id)::INTEGER,
    0::INTEGER,  -- LinkedIn doesn't have conversation tracking in same way
    0::INTEGER
  FROM linkedin_pages lp
  WHERE lp.tenant_id = p_tenant_id AND lp.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE social_platform_apps IS 'OAuth app credentials for each social platform (admin-managed)';
COMMENT ON TABLE facebook_pages IS 'Facebook Pages connected by tenants for Messenger';
COMMENT ON TABLE facebook_conversations IS 'Facebook Messenger conversation threads';
COMMENT ON TABLE twitter_accounts IS 'Twitter/X accounts connected by tenants';
COMMENT ON TABLE twitter_conversations IS 'Twitter DM conversation threads';
COMMENT ON TABLE instagram_accounts IS 'Instagram Business/Creator accounts connected by tenants';
COMMENT ON TABLE instagram_conversations IS 'Instagram DM conversation threads';
COMMENT ON TABLE linkedin_pages IS 'LinkedIn Organization pages connected by tenants';

-- =============================================================================
-- =============================================================================
-- OAUTH STATES (for OAuth flow security)
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_states (
  id SERIAL PRIMARY KEY,
  state VARCHAR(255) NOT NULL UNIQUE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  redirect_uri TEXT,
  code_verifier VARCHAR(255),       -- For PKCE (Twitter OAuth 2.0)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- Auto-cleanup expired states (optional cron job or pg_cron)
-- DELETE FROM oauth_states WHERE expires_at < NOW();

-- =============================================================================
-- ADD MISSING COLUMNS FOR OAUTH ROUTES
-- =============================================================================

-- Add app_secret column (unencrypted reference for routes that don't use IV)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='social_platform_apps' AND column_name='app_secret') THEN
    ALTER TABLE social_platform_apps ADD COLUMN app_secret TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='social_platform_apps' AND column_name='oauth_scopes') THEN
    ALTER TABLE social_platform_apps ADD COLUMN oauth_scopes TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='social_platform_apps' AND column_name='webhook_url') THEN
    ALTER TABLE social_platform_apps ADD COLUMN webhook_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='social_platform_apps' AND column_name='settings') THEN
    ALTER TABLE social_platform_apps ADD COLUMN settings JSONB DEFAULT '{}';
  END IF;
END $$;

-- Fix facebook_pages columns for OAuth routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='facebook_pages' AND column_name='profile_picture_url') THEN
    ALTER TABLE facebook_pages ADD COLUMN profile_picture_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='facebook_pages' AND column_name='status') THEN
    ALTER TABLE facebook_pages ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Fix twitter_accounts columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='twitter_accounts' AND column_name='user_id') THEN
    -- user_id is an alias for twitter_user_id for OAuth routes
    ALTER TABLE twitter_accounts ADD COLUMN user_id VARCHAR(100);
    UPDATE twitter_accounts SET user_id = twitter_user_id WHERE user_id IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='twitter_accounts' AND column_name='status') THEN
    ALTER TABLE twitter_accounts ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='twitter_accounts' AND column_name='access_token_encrypted') THEN
    ALTER TABLE twitter_accounts ADD COLUMN access_token_encrypted TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='twitter_accounts' AND column_name='refresh_token_encrypted') THEN
    ALTER TABLE twitter_accounts ADD COLUMN refresh_token_encrypted TEXT;
  END IF;
END $$;

-- Fix instagram_accounts columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='instagram_accounts' AND column_name='ig_user_id') THEN
    ALTER TABLE instagram_accounts ADD COLUMN ig_user_id VARCHAR(100);
    UPDATE instagram_accounts SET ig_user_id = instagram_user_id WHERE ig_user_id IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='instagram_accounts' AND column_name='facebook_page_id') THEN
    ALTER TABLE instagram_accounts ADD COLUMN facebook_page_id VARCHAR(100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='instagram_accounts' AND column_name='access_token_encrypted') THEN
    ALTER TABLE instagram_accounts ADD COLUMN access_token_encrypted TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='instagram_accounts' AND column_name='status') THEN
    ALTER TABLE instagram_accounts ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Fix linkedin_pages columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='linkedin_pages' AND column_name='logo_url') THEN
    ALTER TABLE linkedin_pages ADD COLUMN logo_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='linkedin_pages' AND column_name='status') THEN
    ALTER TABLE linkedin_pages ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Add conversation page_id/account_id FK references
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='facebook_conversations' AND column_name='page_id') THEN
    ALTER TABLE facebook_conversations ADD COLUMN page_id INTEGER REFERENCES facebook_pages(id) ON DELETE CASCADE;
    UPDATE facebook_conversations SET page_id = facebook_page_id WHERE page_id IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='twitter_conversations' AND column_name='account_id') THEN
    ALTER TABLE twitter_conversations ADD COLUMN account_id INTEGER REFERENCES twitter_accounts(id) ON DELETE CASCADE;
    UPDATE twitter_conversations SET account_id = twitter_account_id WHERE account_id IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='instagram_conversations' AND column_name='account_id') THEN
    ALTER TABLE instagram_conversations ADD COLUMN account_id INTEGER REFERENCES instagram_accounts(id) ON DELETE CASCADE;
    UPDATE instagram_conversations SET account_id = instagram_account_id WHERE account_id IS NULL;
  END IF;
END $$;

-- Migration Complete
-- =============================================================================
-- Tables: 10 (1 platform config + 8 platform-specific + 1 oauth_states)
-- Functions: 1
-- Default data: 4 platform configurations
