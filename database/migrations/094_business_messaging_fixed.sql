-- Business Messaging Channels Migration (Fixed for BIGINT tenant_id)
-- Apple Business Messages, Google Business Messages, and RCS Messaging

-- ==================== APPLE BUSINESS MESSAGES ====================

-- Apple Business Chat accounts (registered with Apple)
CREATE TABLE IF NOT EXISTS apple_business_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,

    -- Apple Business Registration
    business_id VARCHAR(100) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    msp_id VARCHAR(100),

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
    primary_color VARCHAR(7),

    -- Capabilities
    capabilities JSONB DEFAULT '["messaging", "rich_links", "list_picker", "time_picker", "apple_pay"]',
    entitlements JSONB DEFAULT '{}',

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
    verified_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, business_id)
);

-- Apple Business Messages conversations
CREATE TABLE IF NOT EXISTS apple_business_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES apple_business_accounts(id) ON DELETE CASCADE,

    conversation_id VARCHAR(255) NOT NULL,
    source_id VARCHAR(255),
    intent VARCHAR(100),
    group_name VARCHAR(255),

    customer_id VARCHAR(255),
    customer_locale VARCHAR(10),
    customer_device_type VARCHAR(50),

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id BIGINT,

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES apple_business_conversations(id) ON DELETE CASCADE,

    message_id VARCHAR(255) NOT NULL,
    source_id VARCHAR(255),

    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('customer', 'agent', 'bot', 'system')),
    sender_id VARCHAR(255),

    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    attachments JSONB DEFAULT '[]',
    interactive_data JSONB,
    apple_pay_data JSONB,

    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Apple Business Message templates
CREATE TABLE IF NOT EXISTS apple_business_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES apple_business_accounts(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- ==================== GOOGLE BUSINESS MESSAGES ====================

-- Google Business Messages agents
CREATE TABLE IF NOT EXISTS google_business_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,

    agent_id VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    brand_id VARCHAR(100),
    display_name VARCHAR(255),

    partner_key VARCHAR(255),
    service_account_email VARCHAR(255),
    service_account_key_encrypted TEXT,

    logo_url VARCHAR(500),
    conversation_starters JSONB DEFAULT '[]',
    primary_interaction_url VARCHAR(500),
    primary_interaction_token_encrypted TEXT,

    phone_number VARCHAR(20),
    privacy_policy_url VARCHAR(500),

    capabilities JSONB DEFAULT '["rich_cards", "carousels", "suggestions", "authentication"]',
    entry_points JSONB DEFAULT '[]',

    verification_status VARCHAR(20) DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    verification_contact_email VARCHAR(255),

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deleted')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, agent_id)
);

-- Google Business Messages locations
CREATE TABLE IF NOT EXISTS google_business_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id) ON DELETE CASCADE,

    location_id VARCHAR(100) NOT NULL,
    place_id VARCHAR(255),
    location_name VARCHAR(255) NOT NULL,

    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country_code VARCHAR(2),
    postal_code VARCHAR(20),

    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    business_hours JSONB,
    entry_point_configs JSONB DEFAULT '{}',

    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending_verification')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, location_id)
);

-- Google Business Messages conversations
CREATE TABLE IF NOT EXISTS google_business_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id) ON DELETE CASCADE,
    location_id UUID REFERENCES google_business_locations(id),

    conversation_id VARCHAR(255) NOT NULL,
    entry_point VARCHAR(50),

    user_device_locale VARCHAR(10),
    user_timezone VARCHAR(50),

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id BIGINT,

    survey_response JSONB,

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES google_business_conversations(id) ON DELETE CASCADE,

    message_id VARCHAR(255) NOT NULL,
    reply_to_message_id VARCHAR(255),

    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('user', 'agent', 'bot', 'system')),
    sender_id VARCHAR(255),

    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    attachments JSONB DEFAULT '[]',
    rich_card JSONB,
    suggestions JSONB DEFAULT '[]',

    event_type VARCHAR(50),
    auth_data JSONB,

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES google_business_agents(id),

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- ==================== RCS MESSAGING ====================

-- RCS Business Messaging agents
CREATE TABLE IF NOT EXISTS rcs_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,

    agent_id VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    description TEXT,

    provider VARCHAR(50) NOT NULL,
    provider_agent_id VARCHAR(255),
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,

    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),

    phone_number VARCHAR(20),
    website_url VARCHAR(500),
    privacy_policy_url VARCHAR(500),
    terms_of_service_url VARCHAR(500),

    capabilities JSONB DEFAULT '["rich_cards", "carousels", "suggested_replies", "suggested_actions"]',

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES rcs_agents(id) ON DELETE CASCADE,

    conversation_id VARCHAR(255) NOT NULL,
    msisdn VARCHAR(20) NOT NULL,

    rcs_capable BOOLEAN DEFAULT true,
    fallback_channel VARCHAR(20),

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    assigned_agent_id BIGINT,

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES rcs_conversations(id) ON DELETE CASCADE,

    message_id VARCHAR(255) NOT NULL,
    reply_to_message_id VARCHAR(255),

    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type VARCHAR(20) CHECK (sender_type IN ('user', 'agent', 'bot', 'system')),

    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    attachments JSONB DEFAULT '[]',
    rich_card JSONB,
    carousel JSONB,
    suggestions JSONB DEFAULT '[]',

    fallback_text TEXT,
    used_fallback BOOLEAN DEFAULT false,

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
    tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES rcs_agents(id),

    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    fallback_text TEXT,

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
    tenant_id BIGINT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    apple_enabled BOOLEAN DEFAULT false,
    apple_auto_reply_enabled BOOLEAN DEFAULT false,
    apple_auto_reply_message TEXT,

    google_enabled BOOLEAN DEFAULT false,
    google_auto_reply_enabled BOOLEAN DEFAULT false,
    google_auto_reply_message TEXT,
    google_survey_enabled BOOLEAN DEFAULT true,

    rcs_enabled BOOLEAN DEFAULT false,
    rcs_fallback_to_sms BOOLEAN DEFAULT true,
    rcs_auto_reply_enabled BOOLEAN DEFAULT false,
    rcs_auto_reply_message TEXT,

    business_hours JSONB,
    out_of_hours_message TEXT,
    max_response_time_minutes INTEGER DEFAULT 60,

    default_queue_id BIGINT,
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
