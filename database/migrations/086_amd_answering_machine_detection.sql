-- Migration: 086_amd_answering_machine_detection.sql
-- Description: Answering Machine Detection (AMD) for predictive dialer
-- Created: 2026-02-16

-- AMD Configuration per tenant/campaign
CREATE TABLE IF NOT EXISTS amd_configurations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,

    -- Detection Settings
    enabled BOOLEAN DEFAULT true,
    detection_mode VARCHAR(20) DEFAULT 'async', -- 'sync', 'async'

    -- Timing thresholds (milliseconds)
    initial_silence_ms INTEGER DEFAULT 2500,      -- Max silence before greeting
    greeting_max_ms INTEGER DEFAULT 1500,         -- Max greeting duration for human
    after_greeting_silence_ms INTEGER DEFAULT 800, -- Silence after greeting
    total_analysis_ms INTEGER DEFAULT 5000,       -- Total time to analyze

    -- Voice characteristics
    min_word_length_ms INTEGER DEFAULT 100,       -- Minimum word length
    between_words_silence_ms INTEGER DEFAULT 50,  -- Silence between words
    max_number_of_words INTEGER DEFAULT 3,        -- Max words in human greeting

    -- Machine indicators
    machine_greeting_min_ms INTEGER DEFAULT 1500, -- Min duration for machine
    beep_detection_enabled BOOLEAN DEFAULT true,
    beep_frequency_min INTEGER DEFAULT 350,       -- Min beep frequency Hz
    beep_frequency_max INTEGER DEFAULT 950,       -- Max beep frequency Hz
    beep_duration_min_ms INTEGER DEFAULT 200,     -- Min beep duration

    -- Actions
    human_action VARCHAR(30) DEFAULT 'connect',   -- 'connect', 'transfer', 'ivr'
    machine_action VARCHAR(30) DEFAULT 'voicemail', -- 'hangup', 'voicemail', 'callback'
    uncertain_action VARCHAR(30) DEFAULT 'connect', -- 'connect', 'hangup', 'transfer'

    -- Transfer destinations
    human_transfer_to VARCHAR(100),
    machine_transfer_to VARCHAR(100),
    voicemail_audio_id INTEGER,

    -- Adaptive settings
    adaptive_enabled BOOLEAN DEFAULT true,
    learning_rate DECIMAL(4,3) DEFAULT 0.05,
    min_samples_for_adaptation INTEGER DEFAULT 100,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- AMD Detection Results
CREATE TABLE IF NOT EXISTS amd_results (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    call_id VARCHAR(100) NOT NULL,
    campaign_id INTEGER REFERENCES campaigns(id),
    configuration_id INTEGER REFERENCES amd_configurations(id),

    -- Detection outcome
    result VARCHAR(20) NOT NULL, -- 'human', 'machine', 'uncertain', 'silence', 'notsure', 'hangup'
    confidence DECIMAL(5,4), -- 0.0000 to 1.0000

    -- Timing measurements (milliseconds)
    detection_time_ms INTEGER,
    initial_silence_ms INTEGER,
    greeting_duration_ms INTEGER,
    total_audio_ms INTEGER,

    -- Audio analysis
    words_detected INTEGER,
    avg_word_duration_ms INTEGER,
    beep_detected BOOLEAN DEFAULT false,
    beep_frequency INTEGER,

    -- Voice features (for ML)
    energy_level DECIMAL(8,4),
    zero_crossing_rate DECIMAL(8,4),
    spectral_centroid DECIMAL(10,4),
    voice_activity_ratio DECIMAL(5,4),

    -- Action taken
    action_taken VARCHAR(30),
    transfer_destination VARCHAR(100),

    -- Verification (for training)
    verified_result VARCHAR(20), -- Human-verified result
    verified_by INTEGER REFERENCES agents(id),
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    phone_number VARCHAR(20),
    carrier VARCHAR(100),
    call_started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AMD Analytics (aggregated per hour)
CREATE TABLE IF NOT EXISTS amd_analytics (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES campaigns(id),
    configuration_id INTEGER REFERENCES amd_configurations(id),
    hour_bucket TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Counts
    total_calls INTEGER DEFAULT 0,
    human_count INTEGER DEFAULT 0,
    machine_count INTEGER DEFAULT 0,
    uncertain_count INTEGER DEFAULT 0,
    silence_count INTEGER DEFAULT 0,
    hangup_count INTEGER DEFAULT 0,

    -- Accuracy (if verified)
    verified_count INTEGER DEFAULT 0,
    correct_human INTEGER DEFAULT 0,
    correct_machine INTEGER DEFAULT 0,
    false_positive_human INTEGER DEFAULT 0, -- Detected human, was machine
    false_negative_human INTEGER DEFAULT 0, -- Detected machine, was human

    -- Timing averages
    avg_detection_time_ms DECIMAL(10,2),
    avg_confidence DECIMAL(5,4),

    -- Actions
    connected_count INTEGER DEFAULT 0,
    voicemail_count INTEGER DEFAULT 0,
    hangup_action_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, campaign_id, configuration_id, hour_bucket)
);

-- AMD Model Parameters (for adaptive learning)
CREATE TABLE IF NOT EXISTS amd_model_parameters (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    configuration_id INTEGER REFERENCES amd_configurations(id),

    -- Model version
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,

    -- Learned thresholds
    learned_initial_silence_ms INTEGER,
    learned_greeting_max_ms INTEGER,
    learned_machine_min_ms INTEGER,

    -- Statistical parameters
    human_greeting_mean_ms DECIMAL(10,2),
    human_greeting_stddev_ms DECIMAL(10,2),
    machine_greeting_mean_ms DECIMAL(10,2),
    machine_greeting_stddev_ms DECIMAL(10,2),

    -- Word patterns
    human_avg_words DECIMAL(5,2),
    machine_avg_words DECIMAL(5,2),

    -- Training stats
    training_samples INTEGER DEFAULT 0,
    human_samples INTEGER DEFAULT 0,
    machine_samples INTEGER DEFAULT 0,
    accuracy_score DECIMAL(5,4),

    trained_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, configuration_id, version)
);

-- AMD Audio Samples (for analysis/training)
CREATE TABLE IF NOT EXISTS amd_audio_samples (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    result_id INTEGER REFERENCES amd_results(id) ON DELETE CASCADE,

    -- Audio reference
    audio_url TEXT,
    duration_ms INTEGER,
    sample_rate INTEGER DEFAULT 8000,

    -- Extracted features (JSON for flexibility)
    features JSONB,

    -- Labels
    auto_label VARCHAR(20),
    verified_label VARCHAR(20),

    -- Flags
    is_training_sample BOOLEAN DEFAULT false,
    is_edge_case BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_amd_config_tenant ON amd_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_amd_config_campaign ON amd_configurations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_amd_results_tenant ON amd_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_amd_results_call ON amd_results(call_id);
CREATE INDEX IF NOT EXISTS idx_amd_results_campaign ON amd_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_amd_results_result ON amd_results(result);
CREATE INDEX IF NOT EXISTS idx_amd_results_created ON amd_results(created_at);
CREATE INDEX IF NOT EXISTS idx_amd_analytics_tenant_hour ON amd_analytics(tenant_id, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_amd_analytics_campaign ON amd_analytics(campaign_id, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_amd_model_active ON amd_model_parameters(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_amd_samples_training ON amd_audio_samples(is_training_sample);

-- Default AMD configuration
INSERT INTO amd_configurations (tenant_id, name, enabled)
SELECT id, 'Default AMD', true
FROM tenants
WHERE NOT EXISTS (
    SELECT 1 FROM amd_configurations WHERE tenant_id = tenants.id AND name = 'Default AMD'
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE amd_configurations IS 'AMD detection settings per tenant/campaign';
COMMENT ON TABLE amd_results IS 'Individual AMD detection results per call';
COMMENT ON TABLE amd_analytics IS 'Hourly aggregated AMD statistics';
COMMENT ON TABLE amd_model_parameters IS 'Adaptive learning model parameters';
COMMENT ON TABLE amd_audio_samples IS 'Audio samples for AMD training/analysis';
