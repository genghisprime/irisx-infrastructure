-- Migration: 089_translation_services.sql
-- Description: Multi-provider language translation services
-- Created: 2026-02-17

-- ============================================
-- TRANSLATION PROVIDERS (Platform Level)
-- ============================================
-- Master catalog of available translation providers
-- Managed by platform admins

CREATE TABLE IF NOT EXISTS translation_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider identification
    name VARCHAR(50) NOT NULL UNIQUE, -- google, aws, deepl, azure, ibm_watson
    display_name VARCHAR(100) NOT NULL,

    -- Provider capabilities
    capabilities JSONB DEFAULT '{
        "text_translation": true,
        "speech_to_text": false,
        "text_to_speech": false,
        "real_time": false,
        "document_translation": false,
        "language_detection": true
    }',

    -- Supported languages (array of language codes)
    supported_languages JSONB DEFAULT '[]',

    -- Provider config schema (what credentials/settings are needed)
    config_schema JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Pricing info (for billing calculations)
    pricing JSONB DEFAULT '{
        "per_character": 0.00002,
        "per_word": 0,
        "per_request": 0,
        "free_tier_characters": 500000
    }',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLATFORM TRANSLATION CREDENTIALS (Admin Level)
-- ============================================
-- Platform-wide credentials for translation providers
-- Managed by IRISX platform admins

CREATE TABLE IF NOT EXISTS platform_translation_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES translation_providers(id) ON DELETE CASCADE,

    -- Credential name for management
    name VARCHAR(100) NOT NULL,

    -- Encrypted credentials
    credentials JSONB NOT NULL, -- Encrypted: api_key, project_id, region, etc.

    -- Usage limits
    monthly_limit INTEGER DEFAULT 0, -- 0 = unlimited
    current_usage INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Health tracking
    last_health_check TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown', -- healthy, degraded, down
    error_rate DECIMAL(5,2) DEFAULT 0,
    avg_latency_ms INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TENANT TRANSLATION SETTINGS
-- ============================================
-- Per-tenant translation configuration

CREATE TABLE IF NOT EXISTS tenant_translation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Feature enablement
    translation_enabled BOOLEAN DEFAULT false,

    -- Default settings
    default_language VARCHAR(10) DEFAULT 'en', -- Agent/company default language
    auto_detect BOOLEAN DEFAULT true, -- Auto-detect customer language

    -- Provider preference (ordered list for failover)
    provider_priority JSONB DEFAULT '["google", "aws", "deepl"]',

    -- Channel-specific settings
    channel_settings JSONB DEFAULT '{
        "sms": { "enabled": true, "auto_translate_inbound": true, "auto_translate_outbound": true },
        "chat": { "enabled": true, "auto_translate_inbound": true, "auto_translate_outbound": true },
        "email": { "enabled": true, "auto_translate_inbound": true, "auto_translate_outbound": false },
        "voice": { "enabled": false, "real_time_translation": false },
        "whatsapp": { "enabled": true, "auto_translate_inbound": true, "auto_translate_outbound": true },
        "social": { "enabled": true, "auto_translate_inbound": true, "auto_translate_outbound": true }
    }',

    -- Voice translation settings
    voice_settings JSONB DEFAULT '{
        "stt_provider": "google",
        "tts_provider": "openai",
        "real_time_enabled": false,
        "transcript_translation": true
    }',

    -- Billing
    billing_enabled BOOLEAN DEFAULT true,
    monthly_budget DECIMAL(10,2), -- Optional spending limit

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id)
);

-- ============================================
-- TENANT TRANSLATION CREDENTIALS (Customer-owned)
-- ============================================
-- Tenants can bring their own translation API keys

CREATE TABLE IF NOT EXISTS tenant_translation_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES translation_providers(id) ON DELETE CASCADE,

    -- Credential name
    name VARCHAR(100) NOT NULL,

    -- Encrypted credentials
    credentials JSONB NOT NULL,

    -- Settings
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Lower = higher priority

    -- Health tracking
    last_health_check TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, provider_id, name)
);

-- ============================================
-- TRANSLATION LANGUAGE PAIRS
-- ============================================
-- Track supported language pairs per tenant

CREATE TABLE IF NOT EXISTS tenant_language_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,

    -- Override default settings
    is_enabled BOOLEAN DEFAULT true,
    preferred_provider VARCHAR(50), -- Override provider for this pair

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, source_language, target_language)
);

-- ============================================
-- TRANSLATION CACHE
-- ============================================
-- Cache frequently used translations to reduce costs

CREATE TABLE IF NOT EXISTS translation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Cache key components
    source_hash VARCHAR(64) NOT NULL, -- SHA256 of source text
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    provider VARCHAR(50) NOT NULL,

    -- Cached translation
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,

    -- Quality
    confidence DECIMAL(5,4), -- Detection confidence if auto-detected

    -- Usage tracking
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW(),

    -- Expiration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',

    UNIQUE(source_hash, source_language, target_language, provider)
);

-- ============================================
-- TRANSLATION LOG
-- ============================================
-- Audit trail of all translations for billing and analytics

CREATE TABLE IF NOT EXISTS translation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Provider used
    provider VARCHAR(50) NOT NULL,
    credential_type VARCHAR(20) DEFAULT 'platform', -- platform, tenant

    -- Translation details
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    source_text_length INTEGER NOT NULL,
    translated_text_length INTEGER NOT NULL,

    -- Context
    channel VARCHAR(50), -- sms, chat, email, voice, whatsapp, social
    direction VARCHAR(20), -- inbound, outbound
    conversation_id UUID,
    message_id UUID,
    call_id UUID,

    -- Performance
    latency_ms INTEGER,
    cache_hit BOOLEAN DEFAULT false,

    -- Billing
    cost_cents DECIMAL(10,4) DEFAULT 0,
    billed BOOLEAN DEFAULT false,

    -- Outcome
    success BOOLEAN DEFAULT true,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REAL-TIME VOICE TRANSLATION SESSIONS
-- ============================================
-- Track active voice translation sessions

CREATE TABLE IF NOT EXISTS voice_translation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id),

    -- Languages
    agent_language VARCHAR(10) NOT NULL,
    customer_language VARCHAR(10) NOT NULL,

    -- Providers being used
    stt_provider VARCHAR(50) NOT NULL,
    translation_provider VARCHAR(50) NOT NULL,
    tts_provider VARCHAR(50) NOT NULL,

    -- Session state
    status VARCHAR(20) DEFAULT 'active', -- active, paused, completed, error

    -- Statistics
    segments_processed INTEGER DEFAULT 0,
    total_audio_seconds INTEGER DEFAULT 0,
    total_characters_translated INTEGER DEFAULT 0,

    -- Quality metrics
    avg_latency_ms INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- ============================================
-- GLOSSARY / CUSTOM TERMINOLOGY
-- ============================================
-- Tenant-specific translation overrides

CREATE TABLE IF NOT EXISTS translation_glossary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Term definition
    source_term VARCHAR(500) NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_term VARCHAR(500) NOT NULL,
    target_language VARCHAR(10) NOT NULL,

    -- Context
    category VARCHAR(100), -- product, brand, technical, etc.
    case_sensitive BOOLEAN DEFAULT false,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, source_term, source_language, target_language)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_platform_trans_creds_provider ON platform_translation_credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_trans_creds_active ON platform_translation_credentials(is_active, is_default);

CREATE INDEX IF NOT EXISTS idx_tenant_trans_settings_tenant ON tenant_translation_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_trans_creds_tenant ON tenant_translation_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_trans_creds_provider ON tenant_translation_credentials(provider_id);

CREATE INDEX IF NOT EXISTS idx_tenant_lang_pairs_tenant ON tenant_language_pairs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_trans_cache_lookup ON translation_cache(source_hash, source_language, target_language, provider);
CREATE INDEX IF NOT EXISTS idx_trans_cache_expires ON translation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_trans_cache_accessed ON translation_cache(last_accessed);

CREATE INDEX IF NOT EXISTS idx_trans_log_tenant ON translation_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trans_log_created ON translation_log(created_at);
CREATE INDEX IF NOT EXISTS idx_trans_log_channel ON translation_log(channel);
CREATE INDEX IF NOT EXISTS idx_trans_log_provider ON translation_log(provider);
CREATE INDEX IF NOT EXISTS idx_trans_log_billing ON translation_log(tenant_id, billed, created_at);

CREATE INDEX IF NOT EXISTS idx_voice_trans_call ON voice_translation_sessions(call_id);
CREATE INDEX IF NOT EXISTS idx_voice_trans_tenant ON voice_translation_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_trans_status ON voice_translation_sessions(status);

CREATE INDEX IF NOT EXISTS idx_trans_glossary_tenant ON translation_glossary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trans_glossary_lookup ON translation_glossary(tenant_id, source_language, target_language, is_active);

-- ============================================
-- INSERT DEFAULT PROVIDERS
-- ============================================

INSERT INTO translation_providers (name, display_name, capabilities, supported_languages, config_schema, pricing) VALUES
(
    'google',
    'Google Cloud Translation',
    '{
        "text_translation": true,
        "speech_to_text": true,
        "text_to_speech": true,
        "real_time": true,
        "document_translation": true,
        "language_detection": true
    }',
    '["af","sq","am","ar","hy","az","eu","be","bn","bs","bg","ca","ceb","zh","zh-TW","co","hr","cs","da","nl","en","eo","et","fi","fr","fy","gl","ka","de","el","gu","ht","ha","haw","he","hi","hmn","hu","is","ig","id","ga","it","ja","jw","kn","kk","km","rw","ko","ku","ky","lo","la","lv","lt","lb","mk","mg","ms","ml","mt","mi","mr","mn","my","ne","no","ny","or","ps","fa","pl","pt","pa","ro","ru","sm","gd","sr","st","sn","sd","si","sk","sl","so","es","su","sw","sv","tl","tg","ta","tt","te","th","tr","tk","uk","ur","ug","uz","vi","cy","xh","yi","yo","zu"]',
    '{
        "api_key": {"type": "string", "required": true, "encrypted": true},
        "project_id": {"type": "string", "required": false}
    }',
    '{"per_character": 0.00002, "free_tier_characters": 500000}'
),
(
    'aws',
    'Amazon Translate',
    '{
        "text_translation": true,
        "speech_to_text": true,
        "text_to_speech": true,
        "real_time": true,
        "document_translation": true,
        "language_detection": true
    }',
    '["af","sq","am","ar","az","bn","bs","bg","ca","zh","zh-TW","hr","cs","da","fa-AF","nl","en","et","fa","tl","fi","fr","fr-CA","ka","de","el","gu","ht","ha","he","hi","hu","is","id","ga","it","ja","kn","kk","ko","lv","lt","mk","ms","ml","mt","mr","mn","no","ps","pl","pt","pt-PT","pa","ro","ru","sr","si","sk","sl","so","es","es-MX","sw","sv","ta","te","th","tr","uk","ur","uz","vi","cy"]',
    '{
        "access_key_id": {"type": "string", "required": true, "encrypted": true},
        "secret_access_key": {"type": "string", "required": true, "encrypted": true},
        "region": {"type": "string", "required": true, "default": "us-east-1"}
    }',
    '{"per_character": 0.000015, "free_tier_characters": 2000000}'
),
(
    'deepl',
    'DeepL Translator',
    '{
        "text_translation": true,
        "speech_to_text": false,
        "text_to_speech": false,
        "real_time": true,
        "document_translation": true,
        "language_detection": true
    }',
    '["bg","cs","da","de","el","en","en-GB","en-US","es","et","fi","fr","hu","id","it","ja","ko","lt","lv","nb","nl","pl","pt","pt-BR","pt-PT","ro","ru","sk","sl","sv","tr","uk","zh"]',
    '{
        "api_key": {"type": "string", "required": true, "encrypted": true},
        "use_free_api": {"type": "boolean", "required": false, "default": false}
    }',
    '{"per_character": 0.00002, "free_tier_characters": 500000}'
),
(
    'azure',
    'Azure Translator',
    '{
        "text_translation": true,
        "speech_to_text": true,
        "text_to_speech": true,
        "real_time": true,
        "document_translation": true,
        "language_detection": true
    }',
    '["af","sq","am","ar","az","bn","bs","bg","ca","zh-Hans","zh-Hant","hr","cs","da","prs","nl","en","et","fj","fil","fi","fr","fr-CA","de","el","gu","ht","he","hi","hmn","hu","is","id","iu","ga","it","ja","kn","kk","km","ko","ku","kmr","lo","lv","lt","mg","ms","ml","mt","mi","mr","my","ne","nb","or","ps","fa","pl","pt","pt-PT","pa","ro","ru","sm","sr-Cyrl","sr-Latn","sk","sl","es","sw","sv","ty","ta","te","th","ti","to","tr","uk","ur","vi","cy","zu"]',
    '{
        "subscription_key": {"type": "string", "required": true, "encrypted": true},
        "region": {"type": "string", "required": true, "default": "eastus"},
        "endpoint": {"type": "string", "required": false}
    }',
    '{"per_character": 0.00001, "free_tier_characters": 2000000}'
),
(
    'ibm_watson',
    'IBM Watson Language Translator',
    '{
        "text_translation": true,
        "speech_to_text": true,
        "text_to_speech": true,
        "real_time": false,
        "document_translation": true,
        "language_detection": true
    }',
    '["ar","bn","bg","ca","zh","zh-TW","hr","cs","da","nl","en","et","fi","fr","de","el","gu","he","hi","hu","id","ga","it","ja","ko","lv","lt","ms","ml","mt","ne","nb","pl","pt","ro","ru","si","sk","sl","es","sv","ta","te","th","tr","uk","ur","vi"]',
    '{
        "api_key": {"type": "string", "required": true, "encrypted": true},
        "url": {"type": "string", "required": true},
        "version": {"type": "string", "required": false, "default": "2018-05-01"}
    }',
    '{"per_character": 0.00002, "free_tier_characters": 1000000}'
)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    capabilities = EXCLUDED.capabilities,
    supported_languages = EXCLUDED.supported_languages,
    config_schema = EXCLUDED.config_schema,
    pricing = EXCLUDED.pricing,
    updated_at = NOW();

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_translation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_translation_providers_updated ON translation_providers;
CREATE TRIGGER trigger_translation_providers_updated
    BEFORE UPDATE ON translation_providers
    FOR EACH ROW EXECUTE FUNCTION update_translation_timestamp();

DROP TRIGGER IF EXISTS trigger_platform_trans_creds_updated ON platform_translation_credentials;
CREATE TRIGGER trigger_platform_trans_creds_updated
    BEFORE UPDATE ON platform_translation_credentials
    FOR EACH ROW EXECUTE FUNCTION update_translation_timestamp();

DROP TRIGGER IF EXISTS trigger_tenant_trans_settings_updated ON tenant_translation_settings;
CREATE TRIGGER trigger_tenant_trans_settings_updated
    BEFORE UPDATE ON tenant_translation_settings
    FOR EACH ROW EXECUTE FUNCTION update_translation_timestamp();

DROP TRIGGER IF EXISTS trigger_tenant_trans_creds_updated ON tenant_translation_credentials;
CREATE TRIGGER trigger_tenant_trans_creds_updated
    BEFORE UPDATE ON tenant_translation_credentials
    FOR EACH ROW EXECUTE FUNCTION update_translation_timestamp();

DROP TRIGGER IF EXISTS trigger_trans_glossary_updated ON translation_glossary;
CREATE TRIGGER trigger_trans_glossary_updated
    BEFORE UPDATE ON translation_glossary
    FOR EACH ROW EXECUTE FUNCTION update_translation_timestamp();

-- ============================================
-- CACHE CLEANUP FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_translation_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM translation_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE translation_providers IS 'Master catalog of available translation providers';
COMMENT ON TABLE platform_translation_credentials IS 'Platform-wide translation provider credentials';
COMMENT ON TABLE tenant_translation_settings IS 'Per-tenant translation configuration';
COMMENT ON TABLE tenant_translation_credentials IS 'Customer-owned translation API credentials';
COMMENT ON TABLE translation_cache IS 'Cache for frequently used translations';
COMMENT ON TABLE translation_log IS 'Audit trail for all translations (billing/analytics)';
COMMENT ON TABLE voice_translation_sessions IS 'Active real-time voice translation sessions';
COMMENT ON TABLE translation_glossary IS 'Custom terminology overrides per tenant';
