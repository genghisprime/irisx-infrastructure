-- Migration: 079_unified_provider_abstraction.sql
-- Description: Unified provider abstraction layer for all channels
-- Enables: Customers use IRISX API with unified voice/service names, never see provider details
-- Date: 2026-02-16

-- ===========================================
-- EXTEND MESSAGING PROVIDERS FOR ALL CHANNELS
-- ===========================================

-- Add new channel types to messaging_providers
DO $$ BEGIN
  -- Drop old constraint on provider_type
  ALTER TABLE messaging_providers
    DROP CONSTRAINT IF EXISTS messaging_providers_provider_type_check;

  -- Add updated constraint allowing all channel types
  ALTER TABLE messaging_providers
    ADD CONSTRAINT messaging_providers_provider_type_check
    CHECK (provider_type IN ('sms', 'email', 'voice', 'tts', 'stt', 'whatsapp', 'social', 'video', 'carrier'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Add LCR/routing columns if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='messaging_providers' AND column_name='priority') THEN
    ALTER TABLE messaging_providers ADD COLUMN priority INTEGER DEFAULT 50;
    ALTER TABLE messaging_providers ADD COLUMN cost_per_unit DECIMAL(10, 6);
    ALTER TABLE messaging_providers ADD COLUMN health_score INTEGER DEFAULT 100;
    ALTER TABLE messaging_providers ADD COLUMN total_requests BIGINT DEFAULT 0;
    ALTER TABLE messaging_providers ADD COLUMN failed_requests BIGINT DEFAULT 0;
    ALTER TABLE messaging_providers ADD COLUMN last_success_at TIMESTAMPTZ;
    ALTER TABLE messaging_providers ADD COLUMN last_failure_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add TTS/STT specific columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='messaging_providers' AND column_name='tts_rate_per_char') THEN
    ALTER TABLE messaging_providers ADD COLUMN tts_rate_per_char DECIMAL(10, 8) DEFAULT 0.000015;
    ALTER TABLE messaging_providers ADD COLUMN stt_rate_per_minute DECIMAL(10, 6) DEFAULT 0.006;
    ALTER TABLE messaging_providers ADD COLUMN voice_rate_per_minute DECIMAL(10, 6) DEFAULT 0.01;
    ALTER TABLE messaging_providers ADD COLUMN supported_voices JSONB DEFAULT '[]';
    ALTER TABLE messaging_providers ADD COLUMN supported_languages JSONB DEFAULT '[]';
    ALTER TABLE messaging_providers ADD COLUMN quality_tier VARCHAR(20) DEFAULT 'standard';
    ALTER TABLE messaging_providers ADD COLUMN latency_ms INTEGER DEFAULT 500;
  END IF;
END $$;

-- ===========================================
-- UNIFIED VOICE CATALOG
-- Customer-facing voice names mapped to provider voices
-- ===========================================

CREATE TABLE IF NOT EXISTS voice_catalog (
    id BIGSERIAL PRIMARY KEY,

    -- Customer-facing (unified) voice identity
    voice_code VARCHAR(50) NOT NULL UNIQUE,     -- e.g., 'aria', 'marcus', 'elena'
    display_name VARCHAR(100) NOT NULL,         -- e.g., 'Aria (Professional Female)'
    description TEXT,
    gender VARCHAR(20),                         -- male, female, neutral
    language VARCHAR(10) DEFAULT 'en-US',       -- Primary language
    accent VARCHAR(50),                         -- american, british, australian, etc.
    style VARCHAR(50),                          -- professional, casual, warm, authoritative
    use_cases TEXT[],                           -- IVR, voicemail, notifications, etc.

    -- Quality and pricing tiers
    quality_tier VARCHAR(20) DEFAULT 'standard', -- standard, high, premium

    -- Provider mapping (hidden from customer)
    primary_provider VARCHAR(50) NOT NULL,      -- openai, elevenlabs, aws_polly
    primary_voice_id VARCHAR(100) NOT NULL,     -- Provider's voice ID

    -- Fallback providers (in order)
    fallback_mappings JSONB DEFAULT '[]',
    -- Example: [{"provider": "aws_polly", "voice_id": "Joanna"}, {"provider": "openai", "voice_id": "nova"}]

    -- Audio sample (for customer preview)
    sample_text TEXT DEFAULT 'Hello, this is a sample of my voice. I can help you with customer service, notifications, and more.',
    sample_audio_url TEXT,

    -- Availability
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,          -- Show prominently in UI
    tenant_ids INTEGER[],                       -- NULL = available to all, else restricted

    -- Usage tracking
    usage_count BIGINT DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_catalog_code ON voice_catalog(voice_code);
CREATE INDEX idx_voice_catalog_language ON voice_catalog(language);
CREATE INDEX idx_voice_catalog_tier ON voice_catalog(quality_tier);
CREATE INDEX idx_voice_catalog_active ON voice_catalog(is_active);
CREATE INDEX idx_voice_catalog_gender ON voice_catalog(gender);

-- ===========================================
-- STT MODEL CATALOG
-- Customer-facing transcription models
-- ===========================================

CREATE TABLE IF NOT EXISTS stt_model_catalog (
    id BIGSERIAL PRIMARY KEY,

    -- Customer-facing model identity
    model_code VARCHAR(50) NOT NULL UNIQUE,     -- e.g., 'standard', 'enhanced', 'realtime'
    display_name VARCHAR(100) NOT NULL,         -- e.g., 'Enhanced Accuracy'
    description TEXT,

    -- Capabilities
    supported_languages JSONB DEFAULT '["en-US"]',
    supports_realtime BOOLEAN DEFAULT false,
    supports_diarization BOOLEAN DEFAULT false,
    supports_punctuation BOOLEAN DEFAULT true,
    supports_profanity_filter BOOLEAN DEFAULT true,
    max_audio_duration_seconds INTEGER DEFAULT 7200,

    -- Quality tier
    quality_tier VARCHAR(20) DEFAULT 'standard',
    accuracy_rating DECIMAL(3, 2),              -- 0.00 to 1.00

    -- Provider mapping (hidden from customer)
    primary_provider VARCHAR(50) NOT NULL,
    primary_model_id VARCHAR(100) NOT NULL,

    -- Fallback providers
    fallback_mappings JSONB DEFAULT '[]',

    -- Availability
    is_active BOOLEAN DEFAULT true,
    tenant_ids INTEGER[],

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- UNIFIED CARRIER CATALOG (Voice/Phone)
-- ===========================================

CREATE TABLE IF NOT EXISTS carrier_catalog (
    id BIGSERIAL PRIMARY KEY,

    -- Internal carrier identity (not exposed to customers)
    carrier_code VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    carrier_type VARCHAR(20) DEFAULT 'sip',     -- sip, pri, isdn

    -- Provider mapping (references messaging_providers)
    primary_provider VARCHAR(50) NOT NULL,      -- twilio, telnyx, bandwidth, vonage

    -- Capabilities
    supported_countries TEXT[] DEFAULT '{}',
    supports_sms BOOLEAN DEFAULT true,
    supports_mms BOOLEAN DEFAULT false,
    supports_voice BOOLEAN DEFAULT true,
    supports_fax BOOLEAN DEFAULT false,

    -- Quality metrics
    quality_score DECIMAL(5, 2) DEFAULT 100.00,

    -- Pricing (per minute, domestic US)
    cost_per_minute DECIMAL(10, 6) DEFAULT 0.014,

    -- LCR priority
    priority INTEGER DEFAULT 50,

    -- Health
    health_score INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- CHANNEL ROUTING RULES
-- Define how messages are routed across providers
-- ===========================================

CREATE TABLE IF NOT EXISTS channel_routing_rules (
    id BIGSERIAL PRIMARY KEY,

    -- Rule identity
    name VARCHAR(255) NOT NULL,
    description TEXT,
    channel_type VARCHAR(20) NOT NULL,          -- sms, email, tts, stt, voice, whatsapp

    -- Matching conditions
    tenant_id INTEGER REFERENCES tenants(id),   -- NULL = global rule
    destination_pattern VARCHAR(100),           -- Regex for phone/email matching
    country_code VARCHAR(10),
    quality_tier VARCHAR(20),                   -- standard, high, premium

    -- Routing strategy
    strategy VARCHAR(20) DEFAULT 'lcr',         -- lcr, priority, round_robin, failover

    -- Provider selection
    provider_order JSONB NOT NULL,              -- Ordered list of provider IDs
    -- Example: [{"provider_id": 1, "weight": 70}, {"provider_id": 2, "weight": 30}]

    -- Failover settings
    max_retries INTEGER DEFAULT 3,
    retry_delay_ms INTEGER DEFAULT 1000,
    failover_on_error_codes TEXT[],             -- Provider error codes that trigger failover

    -- Cost controls
    max_cost_per_message DECIMAL(10, 4),

    -- Scheduling
    active_hours_start TIME,
    active_hours_end TIME,
    active_days INTEGER[],                      -- 0-6 (Sunday-Saturday)

    -- Status
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 100,               -- Lower = higher priority

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_routing_rules_channel ON channel_routing_rules(channel_type);
CREATE INDEX idx_channel_routing_rules_tenant ON channel_routing_rules(tenant_id);
CREATE INDEX idx_channel_routing_rules_active ON channel_routing_rules(is_active, priority);

-- ===========================================
-- PROVIDER USAGE TRACKING (Unified)
-- ===========================================

CREATE TABLE IF NOT EXISTS provider_usage_log (
    id BIGSERIAL PRIMARY KEY,

    -- Request identification
    request_id UUID DEFAULT gen_random_uuid(),
    tenant_id INTEGER REFERENCES tenants(id),

    -- Channel info
    channel_type VARCHAR(20) NOT NULL,

    -- Provider used (hidden from customer)
    provider_id BIGINT,

    -- Timing
    request_duration_ms INTEGER,
    latency_ms INTEGER,

    -- Cost (internal - not shown to customer)
    provider_cost DECIMAL(10, 6),
    cost_cents INTEGER,

    -- Status
    success BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'success',       -- success, failed, partial
    error_message TEXT,

    -- Metadata (for analytics)
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_usage_log_tenant ON provider_usage_log(tenant_id, created_at);
CREATE INDEX idx_provider_usage_log_channel ON provider_usage_log(channel_type, created_at);
CREATE INDEX idx_provider_usage_log_provider ON provider_usage_log(provider_id, created_at);
CREATE INDEX idx_provider_usage_log_request ON provider_usage_log(request_id);

-- ===========================================
-- FUNCTIONS
-- ===========================================

/**
 * Select best TTS provider based on voice code and LCR
 */
CREATE OR REPLACE FUNCTION select_tts_provider(
    p_voice_code VARCHAR(50),
    p_tenant_id INTEGER DEFAULT NULL,
    p_minimum_health INTEGER DEFAULT 30
) RETURNS TABLE (
    provider_id BIGINT,
    provider_name VARCHAR(100),
    voice_id VARCHAR(100),
    cost_per_1k_chars DECIMAL(10, 6),
    health_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH voice_info AS (
        SELECT
            vc.primary_provider,
            vc.primary_voice_id,
            vc.fallback_mappings
        FROM voice_catalog vc
        WHERE vc.voice_code = p_voice_code
          AND vc.is_active = true
          AND (vc.tenant_ids IS NULL OR p_tenant_id = ANY(vc.tenant_ids))
    )
    SELECT
        mp.id as provider_id,
        mp.provider_name as provider_name,
        vi.primary_voice_id as voice_id,
        COALESCE(mp.cost_per_unit, 0.015) as cost_per_1k_chars,
        COALESCE(mp.health_score, 100)::INTEGER as health_score
    FROM messaging_providers mp
    CROSS JOIN voice_info vi
    WHERE mp.provider_name = vi.primary_provider
      AND mp.provider_type = 'tts'
      AND mp.is_active = true
      AND COALESCE(mp.health_score, 100) >= p_minimum_health
      AND mp.deleted_at IS NULL
    ORDER BY COALESCE(mp.health_score, 100) DESC, COALESCE(mp.cost_per_unit, 999) ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

/**
 * Get fallback TTS providers for a voice
 */
CREATE OR REPLACE FUNCTION get_tts_fallbacks(
    p_voice_code VARCHAR(50),
    p_exclude_provider_id BIGINT DEFAULT NULL
) RETURNS TABLE (
    provider_id BIGINT,
    provider_name VARCHAR(100),
    voice_id VARCHAR(100),
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH voice_info AS (
        SELECT fallback_mappings
        FROM voice_catalog
        WHERE voice_code = p_voice_code AND is_active = true
    ),
    fallbacks AS (
        SELECT
            (fb->>'provider')::VARCHAR as fb_provider,
            (fb->>'voice_id')::VARCHAR as fb_voice_id,
            row_number() OVER () as fb_priority
        FROM voice_info, jsonb_array_elements(fallback_mappings) as fb
    )
    SELECT
        mp.id,
        mp.provider_name,
        f.fb_voice_id,
        f.fb_priority::INTEGER
    FROM fallbacks f
    JOIN messaging_providers mp ON mp.provider_name = f.fb_provider AND mp.provider_type = 'tts'
    WHERE mp.is_active = true
      AND COALESCE(mp.health_score, 100) >= 30
      AND mp.deleted_at IS NULL
      AND (p_exclude_provider_id IS NULL OR mp.id != p_exclude_provider_id)
    ORDER BY f.fb_priority;
END;
$$ LANGUAGE plpgsql;

/**
 * Log provider usage and update stats
 * Note: Uses simpler interface matching ChannelRouter service
 */
CREATE OR REPLACE FUNCTION log_provider_usage(
    p_channel_type VARCHAR(20),
    p_provider_id BIGINT,
    p_tenant_id INTEGER,
    p_request_id UUID,
    p_success BOOLEAN,
    p_latency_ms INTEGER,
    p_cost_cents INTEGER,
    p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    -- Insert usage log
    INSERT INTO provider_usage_log (
        request_id, tenant_id, channel_type, provider_id,
        request_duration_ms, provider_cost, status
    ) VALUES (
        p_request_id,
        p_tenant_id,
        p_channel_type,
        p_provider_id,
        p_latency_ms,
        p_cost_cents / 100.0,
        CASE WHEN p_success THEN 'success' ELSE 'failed' END
    );

    -- Update provider stats
    IF p_success THEN
        UPDATE messaging_providers SET
            total_requests = COALESCE(total_requests, 0) + 1,
            health_score = LEAST(100, COALESCE(health_score, 100) + 1),
            last_success_at = NOW(),
            updated_at = NOW()
        WHERE id = p_provider_id;
    ELSE
        UPDATE messaging_providers SET
            total_requests = COALESCE(total_requests, 0) + 1,
            failed_requests = COALESCE(failed_requests, 0) + 1,
            health_score = GREATEST(0, COALESCE(health_score, 100) - 5),
            last_failure_at = NOW(),
            updated_at = NOW()
        WHERE id = p_provider_id;
    END IF;

    -- Update voice catalog usage count if applicable
    IF p_channel_type = 'tts' AND p_metadata->>'voiceCode' IS NOT NULL THEN
        UPDATE voice_catalog SET usage_count = usage_count + 1
        WHERE voice_code = p_metadata->>'voiceCode';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DEFAULT DATA - TTS Providers
-- Note: These are template entries. Credentials must be configured via admin panel.
-- ===========================================

-- TTS providers will be added via admin interface with proper encrypted credentials
-- This migration only creates the schema; provider data is managed operationally

-- ===========================================
-- DEFAULT DATA - STT Providers
-- Note: These are template entries. Credentials must be configured via admin panel.
-- ===========================================

-- STT providers will be added via admin interface with proper encrypted credentials

-- ===========================================
-- DEFAULT DATA - Voice Catalog
-- Customer-facing unified voices
-- ===========================================

INSERT INTO voice_catalog (
    voice_code, display_name, description, gender, language, accent, style,
    use_cases, quality_tier, primary_provider, primary_voice_id, fallback_mappings,
    is_active, is_featured
) VALUES
    -- Professional voices
    ('aria', 'Aria', 'Professional female voice, clear and confident', 'female', 'en-US', 'american', 'professional',
     ARRAY['IVR', 'voicemail', 'notifications', 'announcements'], 'high',
     'openai', 'nova', '[{"provider": "elevenlabs", "voice_id": "rachel"}, {"provider": "aws_polly", "voice_id": "Joanna"}]'::JSONB,
     true, true),

    ('marcus', 'Marcus', 'Deep male voice, authoritative and warm', 'male', 'en-US', 'american', 'authoritative',
     ARRAY['IVR', 'announcements', 'training'], 'high',
     'openai', 'onyx', '[{"provider": "elevenlabs", "voice_id": "adam"}, {"provider": "aws_polly", "voice_id": "Matthew"}]'::JSONB,
     true, true),

    ('elena', 'Elena', 'Warm female voice, friendly and approachable', 'female', 'en-US', 'american', 'warm',
     ARRAY['customer_service', 'notifications', 'greetings'], 'high',
     'openai', 'shimmer', '[{"provider": "elevenlabs", "voice_id": "bella"}, {"provider": "aws_polly", "voice_id": "Amy"}]'::JSONB,
     true, false),

    ('james', 'James', 'British male voice, sophisticated and clear', 'male', 'en-GB', 'british', 'professional',
     ARRAY['IVR', 'announcements', 'premium_services'], 'premium',
     'elevenlabs', 'josh', '[{"provider": "aws_polly", "voice_id": "Brian"}, {"provider": "openai", "voice_id": "echo"}]'::JSONB,
     true, false),

    ('sofia', 'Sofia', 'Spanish-accented female voice, energetic', 'female', 'es-US', 'hispanic', 'friendly',
     ARRAY['bilingual_IVR', 'notifications'], 'high',
     'aws_polly', 'Lupe', '[{"provider": "openai", "voice_id": "nova"}]'::JSONB,
     true, false),

    -- Standard tier (cost-effective)
    ('alex', 'Alex', 'Neutral voice, versatile for all purposes', 'neutral', 'en-US', 'american', 'neutral',
     ARRAY['IVR', 'voicemail', 'general'], 'standard',
     'openai', 'alloy', '[{"provider": "aws_polly", "voice_id": "Ivy"}]'::JSONB,
     true, false),

    ('sam', 'Sam', 'Casual male voice, friendly tone', 'male', 'en-US', 'american', 'casual',
     ARRAY['notifications', 'reminders'], 'standard',
     'openai', 'echo', '[{"provider": "aws_polly", "voice_id": "Joey"}]'::JSONB,
     true, false)
ON CONFLICT (voice_code) DO NOTHING;

-- ===========================================
-- DEFAULT DATA - STT Model Catalog
-- ===========================================

INSERT INTO stt_model_catalog (
    model_code, display_name, description,
    supported_languages, supports_realtime, supports_diarization,
    quality_tier, accuracy_rating,
    primary_provider, primary_model_id, fallback_mappings
) VALUES
    ('standard', 'Standard Transcription', 'Fast and accurate for most use cases',
     '["en-US", "es-ES", "fr-FR", "de-DE"]'::JSONB, false, false,
     'standard', 0.92,
     'deepgram', 'nova-2', '[{"provider": "openai", "model_id": "whisper-1"}]'::JSONB),

    ('enhanced', 'Enhanced Accuracy', 'Higher accuracy with speaker diarization',
     '["en-US", "es-ES", "fr-FR", "de-DE", "ja-JP", "zh-CN"]'::JSONB, false, true,
     'high', 0.96,
     'openai', 'whisper-1', '[{"provider": "deepgram", "model_id": "nova-2"}]'::JSONB),

    ('realtime', 'Real-time Transcription', 'Live transcription with minimal latency',
     '["en-US"]'::JSONB, true, false,
     'high', 0.90,
     'deepgram', 'nova-2-streaming', '[]'::JSONB)
ON CONFLICT (model_code) DO NOTHING;

-- ===========================================
-- VIEWS
-- ===========================================

/**
 * Customer-facing voice list (no provider details)
 */
CREATE OR REPLACE VIEW public_voice_catalog AS
SELECT
    voice_code,
    display_name,
    description,
    gender,
    language,
    accent,
    style,
    use_cases,
    quality_tier,
    sample_audio_url,
    is_featured
FROM voice_catalog
WHERE is_active = true
ORDER BY is_featured DESC, display_name;

/**
 * Provider performance by channel
 */
CREATE OR REPLACE VIEW provider_channel_performance AS
SELECT
    mp.provider_type as channel_type,
    mp.provider_name,
    mp.is_active,
    COALESCE(mp.health_score, 100) as health_score,
    COALESCE(mp.total_requests, 0) as total_requests,
    COALESCE(mp.failed_requests, 0) as failed_requests,
    CASE WHEN COALESCE(mp.total_requests, 0) > 0
         THEN ROUND((mp.total_requests - COALESCE(mp.failed_requests, 0))::NUMERIC / mp.total_requests * 100, 2)
         ELSE 100
    END as success_rate,
    COALESCE(mp.priority, 50) as priority,
    mp.cost_per_unit as rate,
    mp.updated_at
FROM messaging_providers mp
WHERE mp.deleted_at IS NULL
ORDER BY mp.provider_type, COALESCE(mp.priority, 50);

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT ON public_voice_catalog TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
