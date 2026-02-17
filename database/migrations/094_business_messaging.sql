-- Business Messaging Channels Migration
-- Apple Business Messages, Google Business Messages, and RCS Messaging

-- ==================== APPLE BUSINESS MESSAGES ====================

-- Apple Business Chat accounts (registered with Apple)
CREATE TABLE IF NOT EXISTS apple_business_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- Apple Business Registration
    business_id VARCHAR(100) NOT NULL, -- Apple Business ID
    business_name VARCHAR(255) NOT NULL,
    msp_id VARCHAR(100), -- Messaging Service Provider ID (if using MSP)

    -- Authentication
    api_key_encrypted TEXT,
    shared_secret_encrypted TEXT,
    oauth_client_id VARCHAR(255),
    oauth_client_secret_encrypted TEXT,

    -- Configuration
    webhook_url VARCHAR(500),
    webhook_secret_encrypted TEXT,

    -- Business identity
    logo_url VARCHAR(500),
    icon_url VARCHAR(500),
    primary_color VARCHAR(7), -- Hex color

    -- Capabilities
    capabilities JSONB DEFAULT '["messaging", "rich_links", "list_picker", "time_picker", "apple_pay"]',

    -- Entitlements
    entitlements JSONB DEFAULT '{}', -- Apple-granted capabilities

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
    verified_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, business_id)
);

-- Apple Business Messages conversations
CREATE TABLE IF NOT EXISTS apple_business_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES apple_business_accounts(id) ON DELETE CASCADE,

    -- Conversation identification
    conversation_id VARCHAR(255) NOT NULL, -- Apple conversation ID
    source_id VARCHAR(255), -- Where customer started (Maps, Spotlight, etc.)
    intent VARCHAR(100), -- Customer's initial intent
    group_name VARCHAR(255), -- For group conversations

    -- Customer info (opaque from Apple)
    customer_id VARCHAR(255), -- Apple opaque ID
    customer_locale VARCHAR(10),
    customer_device_type VARCHAR(50), -- iPhone, iPad, Mac

    -- Conversation state
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id UUID,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(account_id, conversation_id)
);

-- Apple Business Messages
CREATE TABLE IF NOT EXISTS apple_business_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES apple_business_conversations(id) ON DELETE CASCADE,

    -- Message identification
    message_id VARCHAR(255) NOT NULL, -- Apple message ID
    source_id VARCHAR(255), -- Reply to specific message

    -- Direction
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('customer', 'agent', 'bot', 'system')),
    sender_id VARCHAR(255),

    -- Content
    message_type VARCHAR(50) NOT NULL, -- text, image, file, interactive, list_picker, time_picker, apple_pay
    content TEXT,
    attachments JSONB DEFAULT '[]', -- [{type, url, mimeType, name, size}]
    interactive_data JSONB, -- For rich messages (buttons, list pickers, etc.)

    -- Apple Pay specific
    apple_pay_data JSONB, -- For payment requests/receipts

    -- Delivery status
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Apple Business Message templates (for structured messages)
CREATE TABLE IF NOT EXISTS apple_business_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES apple_business_accounts(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- text, rich_link, list_picker, time_picker, quick_replies

    -- Template content
    content JSONB NOT NULL,
    -- Example for list_picker:
    -- {
    --   "header": "Select an option",
    --   "sections": [
    --     {"title": "Section 1", "items": [{"id": "1", "title": "Option 1", "subtitle": "..."}]}
    --   ]
    -- }

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- ==================== GOOGLE BUSINESS MESSAGES ====================

-- Google Business Messages agents (registered with Google)
CREATE TABLE IF NOT EXISTS google_business_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- Google Business registration
    agent_id VARCHAR(100) NOT NULL, -- Google agent ID
    agent_name VARCHAR(255) NOT NULL,
    brand_id VARCHAR(100), -- Associated brand

    -- Partner & Account info
    partner_key VARCHAR(255),
    service_account_email VARCHAR(255),
    service_account_key_encrypted TEXT, -- JSON key file content

    -- Agent configuration
    logo_url VARCHAR(500),
    conversation_starters JSONB DEFAULT '[]', -- [{text, postbackData}]
    primary_interaction_url VARCHAR(500), -- Webhook URL
    primary_interaction_token_encrypted TEXT,

    -- Contact info
    phone_number VARCHAR(20),
    privacy_policy_url VARCHAR(500),

    -- Capabilities
    capabilities JSONB DEFAULT '["rich_cards", "carousels", "suggestions", "authentication"]',

    -- Entry points (where users can find this agent)
    entry_points JSONB DEFAULT '[]', -- ["PLACESHEET", "MAPS", "NON_LOCAL"]

    -- Verification status
    verification_status VARCHAR(20) DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    verification_contact_email VARCHAR(255),

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, agent_id)
);

-- Google Business Messages locations (for local agents)
CREATE TABLE IF NOT EXISTS google_business_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id) ON DELETE CASCADE,

    -- Google location info
    location_id VARCHAR(100) NOT NULL, -- Google location ID
    place_id VARCHAR(255), -- Google Maps place ID
    location_name VARCHAR(255) NOT NULL,

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country_code VARCHAR(2),
    postal_code VARCHAR(20),

    -- Coordinates
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Business hours (JSONB for flexibility)
    business_hours JSONB,

    -- Entry point configuration
    entry_point_configs JSONB DEFAULT '{}',

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_verification')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, location_id)
);

-- Google Business Messages conversations
CREATE TABLE IF NOT EXISTS google_business_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id) ON DELETE CASCADE,
    location_id UUID REFERENCES google_business_locations(id),

    -- Conversation identification
    conversation_id VARCHAR(255) NOT NULL, -- Google conversation ID
    entry_point VARCHAR(50), -- How user started (PLACESHEET, MAPS, URL, etc.)

    -- User info (from Google)
    user_device_locale VARCHAR(10),
    user_timezone VARCHAR(50),

    -- Conversation state
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id UUID,

    -- Surveys and feedback
    survey_response JSONB, -- CSAT survey response

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, conversation_id)
);

-- Google Business Messages
CREATE TABLE IF NOT EXISTS google_business_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES google_business_conversations(id) ON DELETE CASCADE,

    -- Message identification
    message_id VARCHAR(255) NOT NULL, -- Google message ID
    reply_to_message_id VARCHAR(255),

    -- Direction
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('user', 'agent', 'bot', 'system')),
    sender_id VARCHAR(255),

    -- Content
    message_type VARCHAR(50) NOT NULL, -- text, image, rich_card, carousel, suggestion
    content TEXT,
    attachments JSONB DEFAULT '[]', -- [{type, url, mimeType, name, thumbnailUrl}]
    rich_card JSONB, -- Standalone or carousel card
    suggestions JSONB DEFAULT '[]', -- [{type: "reply"|"action", text, postbackData, ...}]

    -- Events (typing, receipts, etc.)
    event_type VARCHAR(50), -- TYPING_STARTED, TYPING_STOPPED, etc.

    -- Authentication request/response
    auth_data JSONB,

    -- Delivery status
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(50),
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Business Message templates
CREATE TABLE IF NOT EXISTS google_business_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id),

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- text, rich_card, carousel, suggestions

    -- Template content
    content JSONB NOT NULL,
    -- Example for rich_card:
    -- {
    --   "standaloneCard": {
    --     "cardContent": {
    --       "title": "...",
    --       "description": "...",
    --       "media": {"height": "TALL", "contentInfo": {"fileUrl": "..."}},
    --       "suggestions": [...]
    --     }
    --   }
    -- }

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- ==================== RCS MESSAGING ====================

-- RCS Business Messaging agents
CREATE TABLE IF NOT EXISTS rcs_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- RCS agent registration
    agent_id VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Provider info (e.g., Google Jibe, Mavenir, Sinch)
    provider VARCHAR(50) NOT NULL,
    provider_agent_id VARCHAR(255),
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,

    -- Branding
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),

    -- Contact info
    phone_number VARCHAR(20), -- Sender ID
    website_url VARCHAR(500),
    privacy_policy_url VARCHAR(500),
    terms_of_service_url VARCHAR(500),

    -- Capabilities
    capabilities JSONB DEFAULT '["rich_cards", "carousels", "suggested_replies", "suggested_actions"]',

    -- Verification
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_at TIMESTAMP WITH TIME ZONE,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, agent_id)
);

-- RCS conversations
CREATE TABLE IF NOT EXISTS rcs_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES rcs_agents(id) ON DELETE CASCADE,

    -- Conversation identification
    conversation_id VARCHAR(255) NOT NULL,

    -- Recipient info
    msisdn VARCHAR(20) NOT NULL, -- User's phone number

    -- RCS capabilities detected
    rcs_capable BOOLEAN DEFAULT true,
    fallback_channel VARCHAR(20), -- 'sms' if RCS not available

    -- Conversation state
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id UUID,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, msisdn)
);

-- RCS messages
CREATE TABLE IF NOT EXISTS rcs_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES rcs_conversations(id) ON DELETE CASCADE,

    -- Message identification
    message_id VARCHAR(255) NOT NULL, -- RCS message ID
    reply_to_message_id VARCHAR(255),

    -- Direction
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('user', 'agent', 'bot', 'system')),

    -- Content
    message_type VARCHAR(50) NOT NULL, -- text, image, video, file, rich_card, carousel, location
    content TEXT,
    attachments JSONB DEFAULT '[]',
    rich_card JSONB, -- Standalone rich card
    carousel JSONB, -- Carousel of cards
    suggestions JSONB DEFAULT '[]', -- Suggested replies/actions

    -- Fallback (if RCS fails)
    fallback_text TEXT, -- SMS fallback content
    used_fallback BOOLEAN DEFAULT false,

    -- Delivery status
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(50),
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RCS message templates
CREATE TABLE IF NOT EXISTS rcs_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES rcs_agents(id),

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- text, rich_card, carousel

    -- Template content
    content JSONB NOT NULL,
    fallback_text TEXT, -- SMS fallback

    -- Approval status (some providers require approval)
    approval_status VARCHAR(20) DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected')),
    rejection_reason TEXT,

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- ==================== UNIFIED BUSINESS MESSAGING SETTINGS ====================

-- Tenant settings for business messaging channels
CREATE TABLE IF NOT EXISTS tenant_business_messaging_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- Apple Business Messages
    apple_enabled BOOLEAN DEFAULT false,
    apple_auto_reply_enabled BOOLEAN DEFAULT false,
    apple_auto_reply_message TEXT,

    -- Google Business Messages
    google_enabled BOOLEAN DEFAULT false,
    google_auto_reply_enabled BOOLEAN DEFAULT false,
    google_auto_reply_message TEXT,
    google_survey_enabled BOOLEAN DEFAULT true,

    -- RCS
    rcs_enabled BOOLEAN DEFAULT false,
    rcs_fallback_to_sms BOOLEAN DEFAULT true,
    rcs_auto_reply_enabled BOOLEAN DEFAULT false,
    rcs_auto_reply_message TEXT,

    -- General settings
    business_hours JSONB, -- Operating hours for all channels
    out_of_hours_message TEXT,
    max_response_time_minutes INTEGER DEFAULT 60,

    -- Routing
    default_queue_id UUID,
    routing_method VARCHAR(20) DEFAULT 'round_robin' CHECK (routing_method IN ('round_robin', 'skills_based', 'least_busy')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== INDEXES ====================

-- Apple Business Messages
CREATE INDEX IF NOT EXISTS idx_apple_accounts_tenant ON apple_business_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apple_conversations_tenant ON apple_business_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apple_conversations_account ON apple_business_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_apple_conversations_status ON apple_business_conversations(status);
CREATE INDEX IF NOT EXISTS idx_apple_messages_conversation ON apple_business_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_apple_messages_created ON apple_business_messages(created_at);

-- Google Business Messages
CREATE INDEX IF NOT EXISTS idx_google_agents_tenant ON google_business_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_locations_agent ON google_business_locations(agent_id);
CREATE INDEX IF NOT EXISTS idx_google_conversations_tenant ON google_business_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_conversations_agent ON google_business_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_google_conversations_status ON google_business_conversations(status);
CREATE INDEX IF NOT EXISTS idx_google_messages_conversation ON google_business_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_google_messages_created ON google_business_messages(created_at);

-- RCS
CREATE INDEX IF NOT EXISTS idx_rcs_agents_tenant ON rcs_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rcs_conversations_tenant ON rcs_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rcs_conversations_agent ON rcs_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_rcs_conversations_msisdn ON rcs_conversations(msisdn);
CREATE INDEX IF NOT EXISTS idx_rcs_messages_conversation ON rcs_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rcs_messages_created ON rcs_messages(created_at);

-- ==================== SAMPLE DATA ====================

-- Add RCS providers to messaging_providers if table exists
INSERT INTO messaging_providers (name, type, config, is_active)
SELECT 'Google Jibe RCS', 'rcs', '{"api_url": "https://businessmessages.googleapis.com/v1"}', true
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messaging_providers')
ON CONFLICT DO NOTHING;

INSERT INTO messaging_providers (name, type, config, is_active)
SELECT 'Sinch RCS', 'rcs', '{"api_url": "https://us.rcs.api.sinch.com"}', true
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messaging_providers')
ON CONFLICT DO NOTHING;
