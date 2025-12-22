-- Migration: 069_add_unsubscribe_system.sql
-- Description: Unsubscribe preferences and management
-- Date: December 16, 2025

-- ===========================================
-- UNSUBSCRIBE PREFERENCES
-- ===========================================

-- Per-recipient unsubscribe preferences
CREATE TABLE IF NOT EXISTS unsubscribe_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(50),
    -- Channel preferences
    email_marketing BOOLEAN DEFAULT true,
    email_transactional BOOLEAN DEFAULT true,
    sms_marketing BOOLEAN DEFAULT true,
    sms_transactional BOOLEAN DEFAULT true,
    voice_marketing BOOLEAN DEFAULT true,
    voice_transactional BOOLEAN DEFAULT true,
    whatsapp_marketing BOOLEAN DEFAULT true,
    whatsapp_transactional BOOLEAN DEFAULT true,
    -- Global opt-out
    global_optout BOOLEAN DEFAULT false,
    -- Metadata
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    resubscribed_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(50), -- link, api, admin, complaint
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email),
    UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_unsubscribe_preferences_tenant ON unsubscribe_preferences(tenant_id);
CREATE INDEX idx_unsubscribe_preferences_email ON unsubscribe_preferences(email);
CREATE INDEX idx_unsubscribe_preferences_phone ON unsubscribe_preferences(phone);
CREATE INDEX idx_unsubscribe_preferences_global ON unsubscribe_preferences(global_optout) WHERE global_optout = true;

-- ===========================================
-- UNSUBSCRIBE TOKENS
-- ===========================================

-- Secure one-click unsubscribe tokens
CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255),
    phone VARCHAR(50),
    channel VARCHAR(20) NOT NULL, -- email, sms, voice, whatsapp
    category VARCHAR(50) NOT NULL, -- marketing, transactional, all
    campaign_id UUID,
    email_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 year'),
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_unsubscribe_tokens_token ON unsubscribe_tokens(token);
CREATE INDEX idx_unsubscribe_tokens_email ON unsubscribe_tokens(email);
CREATE INDEX idx_unsubscribe_tokens_phone ON unsubscribe_tokens(phone);
CREATE INDEX idx_unsubscribe_tokens_expires ON unsubscribe_tokens(expires_at);

-- ===========================================
-- UNSUBSCRIBE EVENTS
-- ===========================================

-- Log all unsubscribe/resubscribe events
CREATE TABLE IF NOT EXISTS unsubscribe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(50),
    event_type VARCHAR(20) NOT NULL, -- unsubscribe, resubscribe, update
    channel VARCHAR(20), -- email, sms, voice, whatsapp, all
    category VARCHAR(50), -- marketing, transactional, all
    source VARCHAR(50) NOT NULL, -- link, api, admin, list_unsubscribe, complaint, bounce
    token_id UUID REFERENCES unsubscribe_tokens(id) ON DELETE SET NULL,
    campaign_id UUID,
    email_id UUID,
    reason TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_unsubscribe_events_tenant ON unsubscribe_events(tenant_id);
CREATE INDEX idx_unsubscribe_events_email ON unsubscribe_events(email);
CREATE INDEX idx_unsubscribe_events_phone ON unsubscribe_events(phone);
CREATE INDEX idx_unsubscribe_events_type ON unsubscribe_events(event_type);
CREATE INDEX idx_unsubscribe_events_created ON unsubscribe_events(created_at);

-- ===========================================
-- UNSUBSCRIBE SETTINGS
-- ===========================================

-- Per-tenant unsubscribe settings
CREATE TABLE IF NOT EXISTS unsubscribe_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    -- Page customization
    page_title VARCHAR(255) DEFAULT 'Manage Your Preferences',
    page_logo_url TEXT,
    page_primary_color VARCHAR(7) DEFAULT '#6366f1',
    page_background_color VARCHAR(7) DEFAULT '#f9fafb',
    -- Content
    confirmation_message TEXT DEFAULT 'You have been successfully unsubscribed.',
    resubscribe_message TEXT DEFAULT 'Welcome back! You have been resubscribed.',
    -- Behavior
    require_confirmation BOOLEAN DEFAULT false,
    allow_resubscribe BOOLEAN DEFAULT true,
    show_preference_center BOOLEAN DEFAULT true,
    -- Headers
    include_list_unsubscribe BOOLEAN DEFAULT true,
    include_one_click_unsubscribe BOOLEAN DEFAULT true,
    -- Custom footer
    custom_footer TEXT,
    -- Redirect
    redirect_url TEXT,
    redirect_delay_seconds INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- SUPPRESSION LIST
-- ===========================================

-- Hard suppression list (bounces, complaints)
CREATE TABLE IF NOT EXISTS suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(50),
    suppression_type VARCHAR(20) NOT NULL, -- hard_bounce, soft_bounce, complaint, manual, global
    channel VARCHAR(20), -- email, sms, voice
    reason TEXT,
    bounce_type VARCHAR(50), -- permanent, temporary
    bounce_subtype VARCHAR(100), -- mailbox_full, no_email, suppressed, etc.
    provider_code VARCHAR(50),
    suppressed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL for permanent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email, channel),
    UNIQUE(tenant_id, phone, channel)
);

CREATE INDEX idx_suppression_list_tenant ON suppression_list(tenant_id);
CREATE INDEX idx_suppression_list_email ON suppression_list(email);
CREATE INDEX idx_suppression_list_phone ON suppression_list(phone);
CREATE INDEX idx_suppression_list_type ON suppression_list(suppression_type);
CREATE INDEX idx_suppression_list_expires ON suppression_list(expires_at) WHERE expires_at IS NOT NULL;

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Generate unsubscribe token
CREATE OR REPLACE FUNCTION generate_unsubscribe_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

-- Create unsubscribe token for a recipient
CREATE OR REPLACE FUNCTION create_unsubscribe_token(
    p_tenant_id UUID,
    p_email VARCHAR(255),
    p_phone VARCHAR(50),
    p_channel VARCHAR(20),
    p_category VARCHAR(50),
    p_campaign_id UUID DEFAULT NULL,
    p_email_id UUID DEFAULT NULL
)
RETURNS VARCHAR(64) AS $$
DECLARE
    v_token VARCHAR(64);
BEGIN
    v_token := generate_unsubscribe_token();

    INSERT INTO unsubscribe_tokens (
        tenant_id, token, email, phone, channel, category, campaign_id, email_id
    ) VALUES (
        p_tenant_id, v_token, p_email, p_phone, p_channel, p_category, p_campaign_id, p_email_id
    );

    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Process unsubscribe
CREATE OR REPLACE FUNCTION process_unsubscribe(
    p_token VARCHAR(64),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_token_record RECORD;
    v_pref_id UUID;
BEGIN
    -- Look up token
    SELECT * INTO v_token_record
    FROM unsubscribe_tokens
    WHERE token = p_token
      AND expires_at > NOW()
      AND used_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token expired or invalid');
    END IF;

    -- Mark token as used
    UPDATE unsubscribe_tokens SET used_at = NOW() WHERE id = v_token_record.id;

    -- Update or create preferences
    IF v_token_record.email IS NOT NULL THEN
        INSERT INTO unsubscribe_preferences (tenant_id, email, unsubscribed_at, source, reason, ip_address, user_agent)
        VALUES (v_token_record.tenant_id, v_token_record.email, NOW(), 'link', p_reason, p_ip_address, p_user_agent)
        ON CONFLICT (tenant_id, email) DO UPDATE SET
            unsubscribed_at = NOW(),
            source = 'link',
            reason = COALESCE(p_reason, unsubscribe_preferences.reason),
            ip_address = COALESCE(p_ip_address, unsubscribe_preferences.ip_address),
            user_agent = COALESCE(p_user_agent, unsubscribe_preferences.user_agent),
            updated_at = NOW()
        RETURNING id INTO v_pref_id;

        -- Update channel preferences based on category
        IF v_token_record.category = 'all' THEN
            UPDATE unsubscribe_preferences SET global_optout = true WHERE id = v_pref_id;
        ELSIF v_token_record.category = 'marketing' THEN
            UPDATE unsubscribe_preferences SET
                email_marketing = CASE WHEN v_token_record.channel IN ('email', 'all') THEN false ELSE email_marketing END,
                sms_marketing = CASE WHEN v_token_record.channel IN ('sms', 'all') THEN false ELSE sms_marketing END,
                voice_marketing = CASE WHEN v_token_record.channel IN ('voice', 'all') THEN false ELSE voice_marketing END,
                whatsapp_marketing = CASE WHEN v_token_record.channel IN ('whatsapp', 'all') THEN false ELSE whatsapp_marketing END
            WHERE id = v_pref_id;
        END IF;
    END IF;

    IF v_token_record.phone IS NOT NULL THEN
        INSERT INTO unsubscribe_preferences (tenant_id, phone, unsubscribed_at, source, reason, ip_address, user_agent)
        VALUES (v_token_record.tenant_id, v_token_record.phone, NOW(), 'link', p_reason, p_ip_address, p_user_agent)
        ON CONFLICT (tenant_id, phone) DO UPDATE SET
            unsubscribed_at = NOW(),
            source = 'link',
            reason = COALESCE(p_reason, unsubscribe_preferences.reason),
            updated_at = NOW()
        RETURNING id INTO v_pref_id;

        IF v_token_record.category = 'all' THEN
            UPDATE unsubscribe_preferences SET global_optout = true WHERE id = v_pref_id;
        ELSIF v_token_record.category = 'marketing' THEN
            UPDATE unsubscribe_preferences SET
                sms_marketing = CASE WHEN v_token_record.channel IN ('sms', 'all') THEN false ELSE sms_marketing END,
                voice_marketing = CASE WHEN v_token_record.channel IN ('voice', 'all') THEN false ELSE voice_marketing END,
                whatsapp_marketing = CASE WHEN v_token_record.channel IN ('whatsapp', 'all') THEN false ELSE whatsapp_marketing END
            WHERE id = v_pref_id;
        END IF;
    END IF;

    -- Log event
    INSERT INTO unsubscribe_events (
        tenant_id, email, phone, event_type, channel, category, source,
        token_id, campaign_id, email_id, reason, ip_address, user_agent
    ) VALUES (
        v_token_record.tenant_id, v_token_record.email, v_token_record.phone,
        'unsubscribe', v_token_record.channel, v_token_record.category, 'link',
        v_token_record.id, v_token_record.campaign_id, v_token_record.email_id,
        p_reason, p_ip_address, p_user_agent
    );

    RETURN jsonb_build_object(
        'success', true,
        'email', v_token_record.email,
        'phone', v_token_record.phone,
        'channel', v_token_record.channel,
        'category', v_token_record.category
    );
END;
$$ LANGUAGE plpgsql;

-- Check if recipient is unsubscribed
CREATE OR REPLACE FUNCTION is_unsubscribed(
    p_tenant_id UUID,
    p_email VARCHAR(255),
    p_phone VARCHAR(50),
    p_channel VARCHAR(20),
    p_category VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_pref RECORD;
    v_suppressed BOOLEAN;
BEGIN
    -- Check suppression list first
    IF p_email IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM suppression_list
            WHERE tenant_id = p_tenant_id
              AND email = p_email
              AND (channel = p_channel OR channel IS NULL)
              AND (expires_at IS NULL OR expires_at > NOW())
        ) INTO v_suppressed;
        IF v_suppressed THEN RETURN true; END IF;
    END IF;

    IF p_phone IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM suppression_list
            WHERE tenant_id = p_tenant_id
              AND phone = p_phone
              AND (channel = p_channel OR channel IS NULL)
              AND (expires_at IS NULL OR expires_at > NOW())
        ) INTO v_suppressed;
        IF v_suppressed THEN RETURN true; END IF;
    END IF;

    -- Check preferences
    SELECT * INTO v_pref FROM unsubscribe_preferences
    WHERE tenant_id = p_tenant_id
      AND (email = p_email OR phone = p_phone);

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Check global optout
    IF v_pref.global_optout THEN
        RETURN true;
    END IF;

    -- Check specific channel/category
    IF p_channel = 'email' THEN
        IF p_category = 'marketing' AND NOT v_pref.email_marketing THEN RETURN true; END IF;
        IF p_category = 'transactional' AND NOT v_pref.email_transactional THEN RETURN true; END IF;
    ELSIF p_channel = 'sms' THEN
        IF p_category = 'marketing' AND NOT v_pref.sms_marketing THEN RETURN true; END IF;
        IF p_category = 'transactional' AND NOT v_pref.sms_transactional THEN RETURN true; END IF;
    ELSIF p_channel = 'voice' THEN
        IF p_category = 'marketing' AND NOT v_pref.voice_marketing THEN RETURN true; END IF;
        IF p_category = 'transactional' AND NOT v_pref.voice_transactional THEN RETURN true; END IF;
    ELSIF p_channel = 'whatsapp' THEN
        IF p_category = 'marketing' AND NOT v_pref.whatsapp_marketing THEN RETURN true; END IF;
        IF p_category = 'transactional' AND NOT v_pref.whatsapp_transactional THEN RETURN true; END IF;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DEFAULT SETTINGS
-- ===========================================

-- Create default settings for existing tenants
INSERT INTO unsubscribe_settings (tenant_id)
SELECT id FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM unsubscribe_settings)
ON CONFLICT DO NOTHING;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
