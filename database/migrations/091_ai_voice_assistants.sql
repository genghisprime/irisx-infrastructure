-- Migration: 091_ai_voice_assistants.sql
-- Description: AI Voice Assistants (IVR Bots) with multi-provider TTS/STT
-- Date: 2025-02-17

-- ============================================
-- AI Voice Provider Configuration
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_providers (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('tts', 'stt', 'both')),
    api_endpoint VARCHAR(500),
    supported_languages JSONB DEFAULT '[]',
    supported_voices JSONB DEFAULT '[]',
    features JSONB DEFAULT '{}',
    pricing_model JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform credentials for voice providers
CREATE TABLE IF NOT EXISTS ai_voice_platform_credentials (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER REFERENCES ai_voice_providers(id) ON DELETE CASCADE,
    credential_key VARCHAR(100) NOT NULL,
    credential_value TEXT NOT NULL, -- encrypted
    environment VARCHAR(20) DEFAULT 'production',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, credential_key, environment)
);

-- Tenant-specific voice provider credentials (BYOK)
CREATE TABLE IF NOT EXISTS ai_voice_tenant_credentials (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id INTEGER REFERENCES ai_voice_providers(id) ON DELETE CASCADE,
    credentials JSONB NOT NULL, -- encrypted
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider_id)
);

-- ============================================
-- Voice Assistant Configuration
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_assistants (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    assistant_type VARCHAR(50) DEFAULT 'ivr_bot' CHECK (assistant_type IN ('ivr_bot', 'outbound_agent', 'survey_bot', 'appointment_scheduler', 'payment_collector', 'custom')),

    -- Voice Configuration
    tts_provider_id INTEGER REFERENCES ai_voice_providers(id),
    stt_provider_id INTEGER REFERENCES ai_voice_providers(id),
    voice_id VARCHAR(100), -- provider-specific voice ID
    voice_name VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en-US',
    speaking_rate DECIMAL(3,2) DEFAULT 1.0,
    pitch DECIMAL(3,2) DEFAULT 0.0,
    volume_gain_db DECIMAL(4,1) DEFAULT 0.0,

    -- AI/LLM Configuration
    ai_model_id INTEGER REFERENCES ai_models(id),
    system_prompt TEXT,
    max_response_tokens INTEGER DEFAULT 500,
    temperature DECIMAL(3,2) DEFAULT 0.7,

    -- Behavior Settings
    initial_greeting TEXT,
    fallback_message TEXT DEFAULT 'I''m sorry, I didn''t understand that. Could you please repeat?',
    goodbye_message TEXT DEFAULT 'Thank you for calling. Goodbye!',
    transfer_message TEXT DEFAULT 'Let me transfer you to an agent who can better assist you.',
    hold_music_url VARCHAR(500),
    max_silence_seconds INTEGER DEFAULT 5,
    max_conversation_minutes INTEGER DEFAULT 10,
    max_no_input_retries INTEGER DEFAULT 3,
    max_no_match_retries INTEGER DEFAULT 3,

    -- Intent & Entity Configuration
    intents_config JSONB DEFAULT '[]',
    entities_config JSONB DEFAULT '[]',

    -- Integration Settings
    ivr_flow_id INTEGER REFERENCES ivr_flows(id),
    webhook_url VARCHAR(500),
    webhook_events JSONB DEFAULT '["call_start", "call_end", "intent_detected", "transfer"]',

    -- Advanced Features
    sentiment_analysis_enabled BOOLEAN DEFAULT false,
    call_recording_enabled BOOLEAN DEFAULT true,
    transcription_enabled BOOLEAN DEFAULT true,
    summarization_enabled BOOLEAN DEFAULT false,

    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    version INTEGER DEFAULT 1,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice Assistant Versions (for rollback)
CREATE TABLE IF NOT EXISTS ai_voice_assistant_versions (
    id SERIAL PRIMARY KEY,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    config_snapshot JSONB NOT NULL,
    published_by INTEGER REFERENCES users(id),
    published_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(assistant_id, version)
);

-- ============================================
-- Conversation & Dialog Management
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_conversations (
    id SERIAL PRIMARY KEY,
    conversation_uuid UUID DEFAULT gen_random_uuid() UNIQUE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE SET NULL,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,

    -- Call Details
    call_id VARCHAR(100), -- external call ID
    caller_number VARCHAR(50),
    called_number VARCHAR(50),
    direction VARCHAR(20) DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),

    -- Conversation State
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'transferred', 'abandoned', 'failed')),
    current_state VARCHAR(100),
    context JSONB DEFAULT '{}',
    collected_data JSONB DEFAULT '{}',

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,

    -- Outcomes
    outcome VARCHAR(50),
    transfer_target VARCHAR(100),
    transfer_reason TEXT,

    -- Analytics
    sentiment_scores JSONB DEFAULT '[]',
    overall_sentiment VARCHAR(20),
    detected_intents JSONB DEFAULT '[]',

    -- Recording & Transcription
    recording_url VARCHAR(500),
    transcription_status VARCHAR(20) DEFAULT 'pending',
    summary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Turns (each exchange)
CREATE TABLE IF NOT EXISTS ai_voice_conversation_turns (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES ai_voice_conversations(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,

    -- User Input
    user_audio_url VARCHAR(500),
    user_transcript TEXT,
    user_transcript_confidence DECIMAL(5,4),

    -- Assistant Response
    assistant_text TEXT,
    assistant_audio_url VARCHAR(500),

    -- Analysis
    detected_intent VARCHAR(100),
    intent_confidence DECIMAL(5,4),
    detected_entities JSONB DEFAULT '[]',
    sentiment VARCHAR(20),

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    stt_latency_ms INTEGER,
    llm_latency_ms INTEGER,
    tts_latency_ms INTEGER,
    total_latency_ms INTEGER,

    -- Errors
    error_type VARCHAR(50),
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Intent & Entity Definitions
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_intents (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,

    intent_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200),
    description TEXT,

    -- Training Phrases
    training_phrases JSONB DEFAULT '[]', -- array of example phrases

    -- Action Configuration
    action_type VARCHAR(50) CHECK (action_type IN ('respond', 'collect_info', 'transfer', 'api_call', 'play_audio', 'hangup', 'custom')),
    action_config JSONB DEFAULT '{}',

    -- Follow-up
    follow_up_intents JSONB DEFAULT '[]',
    output_contexts JSONB DEFAULT '[]',

    priority INTEGER DEFAULT 0,
    is_fallback BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assistant_id, intent_name)
);

CREATE TABLE IF NOT EXISTS ai_voice_entities (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,

    entity_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200),
    entity_type VARCHAR(50) CHECK (entity_type IN ('custom', 'system', 'regex', 'composite')),

    -- Values (for custom entities)
    values JSONB DEFAULT '[]', -- [{value: "...", synonyms: ["...", "..."]}]

    -- For regex entities
    regex_pattern VARCHAR(500),

    -- For composite entities
    components JSONB DEFAULT '[]',

    is_fuzzy_match BOOLEAN DEFAULT true,
    is_required BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assistant_id, entity_name)
);

-- ============================================
-- Dialog Flow Nodes (extends IVR)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_dialog_nodes (
    id SERIAL PRIMARY KEY,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,

    node_id VARCHAR(100) NOT NULL,
    node_type VARCHAR(50) NOT NULL CHECK (node_type IN (
        'ai_conversation', 'collect_info', 'confirm', 'play_message',
        'api_call', 'condition', 'transfer', 'hangup', 'loop', 'goto'
    )),
    node_name VARCHAR(200),

    -- Position (for visual builder)
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Prompts
    prompts JSONB DEFAULT '[]', -- array of prompt variations

    -- Connections
    next_node_id VARCHAR(100),
    conditional_next JSONB DEFAULT '[]', -- [{condition: "...", next_node_id: "..."}]

    -- Validation
    required_intents JSONB DEFAULT '[]',
    required_entities JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assistant_id, node_id)
);

-- ============================================
-- Voice Cloning & Custom Voices
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_custom_voices (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,

    voice_name VARCHAR(100) NOT NULL,
    description TEXT,
    provider_id INTEGER REFERENCES ai_voice_providers(id),
    provider_voice_id VARCHAR(200), -- ID from provider after cloning

    -- Training Data
    training_audio_urls JSONB DEFAULT '[]',
    training_text TEXT,
    training_status VARCHAR(30) DEFAULT 'pending' CHECK (training_status IN ('pending', 'processing', 'completed', 'failed')),

    -- Voice Properties
    gender VARCHAR(20),
    age_range VARCHAR(30),
    accent VARCHAR(50),
    style VARCHAR(50),

    -- Quality & Samples
    quality_score DECIMAL(3,2),
    sample_audio_url VARCHAR(500),

    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Prompt Templates for Voice
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_prompt_templates (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,

    template_name VARCHAR(100) NOT NULL,
    template_category VARCHAR(50) CHECK (template_category IN (
        'greeting', 'clarification', 'confirmation', 'error',
        'transfer', 'goodbye', 'hold', 'callback', 'custom'
    )),

    template_text TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- available variables

    language VARCHAR(10) DEFAULT 'en-US',
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Usage & Analytics
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_usage (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE SET NULL,
    conversation_id INTEGER REFERENCES ai_voice_conversations(id) ON DELETE SET NULL,

    usage_date DATE NOT NULL,

    -- Provider Usage
    tts_provider_id INTEGER REFERENCES ai_voice_providers(id),
    stt_provider_id INTEGER REFERENCES ai_voice_providers(id),

    -- Metrics
    tts_characters INTEGER DEFAULT 0,
    stt_seconds INTEGER DEFAULT 0,
    llm_tokens INTEGER DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    transferred_calls INTEGER DEFAULT 0,
    abandoned_calls INTEGER DEFAULT 0,

    -- Cost
    tts_cost DECIMAL(10,4) DEFAULT 0,
    stt_cost DECIMAL(10,4) DEFAULT 0,
    llm_cost DECIMAL(10,4) DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_voice_analytics_daily (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,
    analytics_date DATE NOT NULL,

    -- Volume
    total_conversations INTEGER DEFAULT 0,
    completed_conversations INTEGER DEFAULT 0,
    transferred_conversations INTEGER DEFAULT 0,
    abandoned_conversations INTEGER DEFAULT 0,

    -- Duration
    avg_duration_seconds DECIMAL(10,2),
    total_duration_seconds INTEGER DEFAULT 0,

    -- Performance
    avg_turns_per_conversation DECIMAL(5,2),
    intent_recognition_rate DECIMAL(5,4),
    task_completion_rate DECIMAL(5,4),
    transfer_rate DECIMAL(5,4),

    -- Sentiment
    positive_sentiment_pct DECIMAL(5,2),
    neutral_sentiment_pct DECIMAL(5,2),
    negative_sentiment_pct DECIMAL(5,2),

    -- Latency
    avg_stt_latency_ms INTEGER,
    avg_llm_latency_ms INTEGER,
    avg_tts_latency_ms INTEGER,
    avg_total_latency_ms INTEGER,

    -- Top Intents
    top_intents JSONB DEFAULT '[]',
    top_entities JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, assistant_id, analytics_date)
);

-- ============================================
-- Outbound Campaign Integration
-- ============================================
CREATE TABLE IF NOT EXISTS ai_voice_outbound_campaigns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    assistant_id INTEGER REFERENCES ai_voice_assistants(id) ON DELETE CASCADE,

    campaign_name VARCHAR(200) NOT NULL,
    campaign_type VARCHAR(50) CHECK (campaign_type IN ('survey', 'reminder', 'collection', 'notification', 'sales', 'custom')),

    -- Contact List
    contact_list_id INTEGER REFERENCES contact_lists(id),
    total_contacts INTEGER DEFAULT 0,

    -- Scheduling
    start_date DATE,
    end_date DATE,
    calling_hours_start TIME DEFAULT '09:00',
    calling_hours_end TIME DEFAULT '18:00',
    timezone VARCHAR(50) DEFAULT 'UTC',
    days_of_week JSONB DEFAULT '["mon","tue","wed","thu","fri"]',

    -- Pacing
    max_concurrent_calls INTEGER DEFAULT 1,
    calls_per_minute DECIMAL(5,2) DEFAULT 1.0,

    -- Retry Settings
    max_attempts INTEGER DEFAULT 3,
    retry_interval_minutes INTEGER DEFAULT 60,

    -- Status
    status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),

    -- Stats
    calls_made INTEGER DEFAULT 0,
    calls_answered INTEGER DEFAULT 0,
    calls_completed INTEGER DEFAULT 0,
    voicemails_left INTEGER DEFAULT 0,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ai_voice_assistants_tenant ON ai_voice_assistants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_assistants_status ON ai_voice_assistants(status);
CREATE INDEX IF NOT EXISTS idx_ai_voice_conversations_tenant ON ai_voice_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_conversations_assistant ON ai_voice_conversations(assistant_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_conversations_status ON ai_voice_conversations(status);
CREATE INDEX IF NOT EXISTS idx_ai_voice_conversations_started ON ai_voice_conversations(started_at);
CREATE INDEX IF NOT EXISTS idx_ai_voice_turns_conversation ON ai_voice_conversation_turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_intents_assistant ON ai_voice_intents(assistant_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_entities_assistant ON ai_voice_entities(assistant_id);
CREATE INDEX IF NOT EXISTS idx_ai_voice_usage_tenant_date ON ai_voice_usage(tenant_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_ai_voice_analytics_tenant_date ON ai_voice_analytics_daily(tenant_id, analytics_date);
CREATE INDEX IF NOT EXISTS idx_ai_voice_outbound_tenant ON ai_voice_outbound_campaigns(tenant_id);

-- ============================================
-- Pre-populate Voice Providers
-- ============================================
INSERT INTO ai_voice_providers (provider_name, display_name, provider_type, api_endpoint, supported_languages, supported_voices, features) VALUES
    ('elevenlabs', 'ElevenLabs', 'tts', 'https://api.elevenlabs.io/v1',
     '["en","es","fr","de","it","pt","pl","nl","ar","hi","ja","ko","zh"]',
     '[{"id":"21m00Tcm4TlvDq8ikWAM","name":"Rachel"},{"id":"AZnzlk1XvdvUeBnXmlld","name":"Domi"},{"id":"EXAVITQu4vr4xnSDxMaL","name":"Bella"},{"id":"MF3mGyEYCl7XYWbV9V6O","name":"Elli"}]',
     '{"voice_cloning":true,"real_time":true,"ssml":true,"emotions":true}'
    ),
    ('google_tts', 'Google Cloud TTS', 'tts', 'https://texttospeech.googleapis.com/v1',
     '["en-US","en-GB","es-ES","es-MX","fr-FR","de-DE","it-IT","pt-BR","ja-JP","ko-KR","zh-CN"]',
     '[{"id":"en-US-Neural2-A","name":"Neural2-A"},{"id":"en-US-Neural2-C","name":"Neural2-C"},{"id":"en-US-Wavenet-D","name":"Wavenet-D"}]',
     '{"ssml":true,"neural":true,"wavenet":true}'
    ),
    ('aws_polly', 'Amazon Polly', 'tts', 'https://polly.amazonaws.com',
     '["en-US","en-GB","es-ES","es-MX","fr-FR","de-DE","it-IT","pt-BR","ja-JP","ko-KR"]',
     '[{"id":"Joanna","name":"Joanna"},{"id":"Matthew","name":"Matthew"},{"id":"Amy","name":"Amy"},{"id":"Brian","name":"Brian"}]',
     '{"ssml":true,"neural":true,"standard":true}'
    ),
    ('azure_tts', 'Azure Speech Services', 'both', 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
     '["en-US","en-GB","es-ES","es-MX","fr-FR","de-DE","it-IT","pt-BR","ja-JP","ko-KR","zh-CN"]',
     '[{"id":"en-US-JennyNeural","name":"Jenny"},{"id":"en-US-GuyNeural","name":"Guy"},{"id":"en-US-AriaNeural","name":"Aria"}]',
     '{"ssml":true,"neural":true,"custom_voice":true,"real_time":true}'
    ),
    ('google_stt', 'Google Cloud STT', 'stt', 'https://speech.googleapis.com/v1',
     '["en-US","en-GB","es-ES","es-MX","fr-FR","de-DE","it-IT","pt-BR","ja-JP","ko-KR","zh-CN"]',
     '[]',
     '{"streaming":true,"punctuation":true,"speaker_diarization":true}'
    ),
    ('aws_transcribe', 'Amazon Transcribe', 'stt', 'https://transcribe.amazonaws.com',
     '["en-US","en-GB","es-ES","es-US","fr-FR","fr-CA","de-DE","it-IT","pt-BR","ja-JP","ko-KR"]',
     '[]',
     '{"streaming":true,"medical":true,"call_analytics":true}'
    ),
    ('deepgram', 'Deepgram', 'stt', 'https://api.deepgram.com/v1',
     '["en","es","fr","de","it","pt","nl","ja","ko","zh"]',
     '[]',
     '{"streaming":true,"punctuation":true,"diarization":true,"sentiment":true,"topics":true,"summarization":true}'
    ),
    ('assemblyai', 'AssemblyAI', 'stt', 'https://api.assemblyai.com/v2',
     '["en","es","fr","de","it","pt","nl"]',
     '[]',
     '{"streaming":true,"punctuation":true,"speaker_labels":true,"sentiment_analysis":true,"entity_detection":true}'
    ),
    ('openai_whisper', 'OpenAI Whisper', 'stt', 'https://api.openai.com/v1/audio',
     '["en","es","fr","de","it","pt","nl","pl","ru","ja","ko","zh","ar","hi"]',
     '[]',
     '{"transcription":true,"translation":true}'
    ),
    ('openai_tts', 'OpenAI TTS', 'tts', 'https://api.openai.com/v1/audio/speech',
     '["en","es","fr","de","it","pt","pl","ru","ja","ko","zh"]',
     '[{"id":"alloy","name":"Alloy"},{"id":"echo","name":"Echo"},{"id":"fable","name":"Fable"},{"id":"onyx","name":"Onyx"},{"id":"nova","name":"Nova"},{"id":"shimmer","name":"Shimmer"}]',
     '{"hd":true,"standard":true}'
    )
ON CONFLICT (provider_name) DO NOTHING;

-- Default Prompt Templates
INSERT INTO ai_voice_prompt_templates (tenant_id, template_name, template_category, template_text, variables, is_system) VALUES
    (NULL, 'Default Greeting', 'greeting', 'Hello! Thank you for calling {{company_name}}. How can I assist you today?', '["company_name"]', true),
    (NULL, 'Business Hours Greeting', 'greeting', 'Thank you for calling {{company_name}}. Our business hours are {{business_hours}}. How may I help you?', '["company_name","business_hours"]', true),
    (NULL, 'Clarification Request', 'clarification', 'I''m sorry, I didn''t quite catch that. Could you please repeat what you said?', '[]', true),
    (NULL, 'Multiple Options Clarify', 'clarification', 'I found multiple options: {{options}}. Which one did you mean?', '["options"]', true),
    (NULL, 'Confirmation Yes/No', 'confirmation', 'Just to confirm, you want to {{action}}. Is that correct?', '["action"]', true),
    (NULL, 'Data Confirmation', 'confirmation', 'Let me verify: your {{field_name}} is {{field_value}}. Is that right?', '["field_name","field_value"]', true),
    (NULL, 'Technical Error', 'error', 'I''m experiencing a technical issue. Please hold while I try again.', '[]', true),
    (NULL, 'Cannot Help', 'error', 'I''m sorry, but I''m unable to help with that request. Let me transfer you to a human agent.', '[]', true),
    (NULL, 'Transfer to Agent', 'transfer', 'I''ll transfer you to one of our agents who can better assist you. Please hold.', '[]', true),
    (NULL, 'Transfer to Department', 'transfer', 'I''m transferring you to our {{department}} department. Please hold.', '["department"]', true),
    (NULL, 'End Call Thanks', 'goodbye', 'Thank you for calling {{company_name}}. Have a great day!', '["company_name"]', true),
    (NULL, 'Survey End', 'goodbye', 'Thank you for completing our survey. Your feedback is valuable to us. Goodbye!', '[]', true),
    (NULL, 'Hold Message', 'hold', 'Please hold while I look that up for you.', '[]', true),
    (NULL, 'Callback Offer', 'callback', 'Our wait time is approximately {{wait_time}}. Would you like me to schedule a callback instead?', '["wait_time"]', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE ai_voice_assistants IS 'AI-powered voice assistants for IVR bots, outbound agents, and surveys';
COMMENT ON TABLE ai_voice_conversations IS 'Voice conversation sessions with full context tracking';
COMMENT ON TABLE ai_voice_conversation_turns IS 'Individual turns in a voice conversation with latency metrics';
COMMENT ON TABLE ai_voice_intents IS 'Intent definitions for voice understanding';
COMMENT ON TABLE ai_voice_entities IS 'Entity definitions for slot filling in voice dialogs';
