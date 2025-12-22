-- Voice Cloning Tables
-- Full voice cloning support for custom TTS voices

-- Cloned voices table
CREATE TABLE IF NOT EXISTS cloned_voices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
    provider_voice_id VARCHAR(255),
    quality_tier VARCHAR(50) NOT NULL DEFAULT 'standard',
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    labels JSONB DEFAULT '{}',
    error_message TEXT,
    is_active BOOLEAN DEFAULT true,
    total_characters_generated BIGINT DEFAULT 0,
    total_audio_bytes_generated BIGINT DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice samples table
CREATE TABLE IF NOT EXISTS voice_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_id UUID NOT NULL REFERENCES cloned_voices(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    filepath TEXT NOT NULL,
    duration_sec DECIMAL(10, 2),
    file_size BIGINT,
    format VARCHAR(20),
    status VARCHAR(50) DEFAULT 'uploaded',
    transcript TEXT,
    quality_score DECIMAL(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice clone usage tracking
CREATE TABLE IF NOT EXISTS voice_clone_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
    character_count INTEGER NOT NULL,
    audio_bytes INTEGER,
    cost_cents DECIMAL(10, 4),
    provider VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice settings per tenant (defaults and preferences)
CREATE TABLE IF NOT EXISTS tenant_voice_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,
    default_provider VARCHAR(50) DEFAULT 'elevenlabs',
    default_quality VARCHAR(50) DEFAULT 'standard',
    stability DECIMAL(3, 2) DEFAULT 0.50,
    similarity_boost DECIMAL(3, 2) DEFAULT 0.75,
    style DECIMAL(3, 2) DEFAULT 0.00,
    use_speaker_boost BOOLEAN DEFAULT true,
    max_characters_per_request INTEGER DEFAULT 5000,
    monthly_character_limit BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- Voice generation jobs (for async processing)
CREATE TABLE IF NOT EXISTS voice_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    voice_id UUID NOT NULL REFERENCES cloned_voices(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    output_filepath TEXT,
    output_url TEXT,
    duration_sec DECIMAL(10, 2),
    file_size BIGINT,
    cost_cents DECIMAL(10, 4),
    error_message TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cloned_voices_tenant ON cloned_voices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_status ON cloned_voices(status);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_provider ON cloned_voices(provider);
CREATE INDEX IF NOT EXISTS idx_voice_samples_voice ON voice_samples(voice_id);
CREATE INDEX IF NOT EXISTS idx_voice_clone_usage_tenant ON voice_clone_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_clone_usage_created ON voice_clone_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_voice_generation_jobs_tenant ON voice_generation_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_generation_jobs_status ON voice_generation_jobs(status);

-- Add trigger to update total usage on cloned_voices
CREATE OR REPLACE FUNCTION update_voice_usage_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE cloned_voices
    SET total_characters_generated = total_characters_generated + NEW.character_count,
        total_audio_bytes_generated = total_audio_bytes_generated + COALESCE(NEW.audio_bytes, 0),
        updated_at = NOW()
    WHERE id = NEW.voice_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_voice_usage ON voice_clone_usage;
CREATE TRIGGER trigger_update_voice_usage
    AFTER INSERT ON voice_clone_usage
    FOR EACH ROW
    WHEN (NEW.voice_id IS NOT NULL)
    EXECUTE FUNCTION update_voice_usage_totals();

-- Comments
COMMENT ON TABLE cloned_voices IS 'Custom cloned voices for TTS';
COMMENT ON TABLE voice_samples IS 'Audio samples used for voice cloning';
COMMENT ON TABLE voice_clone_usage IS 'Usage tracking for voice cloning';
COMMENT ON TABLE tenant_voice_settings IS 'Voice settings and preferences per tenant';
COMMENT ON TABLE voice_generation_jobs IS 'Async voice generation job queue';

COMMENT ON COLUMN cloned_voices.provider IS 'Voice cloning provider: elevenlabs, playht, resemble';
COMMENT ON COLUMN cloned_voices.quality_tier IS 'Quality tier: instant, standard, premium';
COMMENT ON COLUMN cloned_voices.status IS 'Voice status: processing, ready, failed, retraining';
COMMENT ON COLUMN voice_samples.quality_score IS 'Audio quality score 0-100';
