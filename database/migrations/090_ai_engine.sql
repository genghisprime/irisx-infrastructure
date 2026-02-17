-- Migration: 090_ai_engine.sql
-- Description: Unified AI Engine Abstraction - Multi-provider AI services
-- Created: 2026-02-17

-- ============================================
-- AI PROVIDERS CATALOG
-- ============================================
-- Master catalog of available AI providers

CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider identification
    name VARCHAR(50) NOT NULL UNIQUE, -- openai, anthropic, google, aws_bedrock, azure_openai, cohere
    display_name VARCHAR(100) NOT NULL,

    -- Provider capabilities
    capabilities JSONB DEFAULT '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": false,
        "image_generation": false,
        "image_analysis": false,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": false,
        "streaming": true
    }',

    -- API configuration
    base_url VARCHAR(500),
    api_version VARCHAR(50),

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Pricing (for cost estimation)
    pricing JSONB DEFAULT '{
        "input_per_1k_tokens": 0.0,
        "output_per_1k_tokens": 0.0,
        "embedding_per_1k_tokens": 0.0
    }',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI MODEL CATALOG
-- ============================================
-- Available models per provider

CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,

    -- Model identification
    model_id VARCHAR(100) NOT NULL, -- gpt-4, claude-3-opus, gemini-pro, etc.
    display_name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Model capabilities
    capabilities JSONB DEFAULT '{
        "text_generation": true,
        "chat_completion": true,
        "function_calling": false,
        "vision": false,
        "streaming": true
    }',

    -- Model specs
    context_window INTEGER DEFAULT 4096,
    max_output_tokens INTEGER DEFAULT 4096,

    -- Quality tier
    quality_tier VARCHAR(20) DEFAULT 'standard', -- basic, standard, advanced, premium

    -- Use case recommendations
    recommended_for JSONB DEFAULT '[]', -- ["summarization", "chat", "analysis", etc.]

    -- Pricing
    input_cost_per_1k DECIMAL(10,6) DEFAULT 0,
    output_cost_per_1k DECIMAL(10,6) DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider_id, model_id)
);

-- ============================================
-- PLATFORM AI CREDENTIALS
-- ============================================
-- Platform-wide AI provider credentials (admin-managed)

CREATE TABLE IF NOT EXISTS platform_ai_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,

    -- Credential name
    name VARCHAR(100) NOT NULL,

    -- Encrypted credentials
    credentials JSONB NOT NULL, -- api_key, org_id, project_id, etc.

    -- Configuration overrides
    config JSONB DEFAULT '{}', -- base_url override, custom headers, etc.

    -- Usage limits
    monthly_budget_cents INTEGER DEFAULT 0, -- 0 = unlimited
    current_month_usage_cents INTEGER DEFAULT 0,
    rate_limit_rpm INTEGER DEFAULT 0, -- requests per minute, 0 = use provider default

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Health tracking
    last_health_check TIMESTAMPTZ,
    health_status VARCHAR(20) DEFAULT 'unknown', -- healthy, degraded, down
    avg_latency_ms INTEGER DEFAULT 0,
    error_rate DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TENANT AI SETTINGS
-- ============================================
-- Per-tenant AI configuration

CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Feature enablement
    ai_enabled BOOLEAN DEFAULT true,

    -- Default preferences
    default_provider VARCHAR(50) DEFAULT 'openai',
    default_model VARCHAR(100) DEFAULT 'gpt-4o-mini',

    -- Quality vs cost preference (0 = cheapest, 100 = best quality)
    quality_preference INTEGER DEFAULT 50,

    -- Provider priority for failover
    provider_priority JSONB DEFAULT '["openai", "anthropic", "google"]',

    -- Feature-specific settings
    features JSONB DEFAULT '{
        "message_composer": true,
        "agent_assist": true,
        "summarization": true,
        "sentiment_analysis": true,
        "intent_detection": true,
        "chatbot": false,
        "voice_assistant": false
    }',

    -- Billing
    monthly_budget_cents INTEGER, -- null = no limit
    billing_alert_threshold INTEGER DEFAULT 80, -- percentage

    -- Moderation
    content_moderation BOOLEAN DEFAULT true,
    block_inappropriate BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id)
);

-- ============================================
-- TENANT AI CREDENTIALS (BYOK)
-- ============================================
-- Tenants can bring their own AI API keys

CREATE TABLE IF NOT EXISTS tenant_ai_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,

    -- Credential name
    name VARCHAR(100) NOT NULL,

    -- Encrypted credentials
    credentials JSONB NOT NULL,

    -- Settings
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- Lower = higher priority

    -- Usage tracking
    monthly_usage_cents INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, provider_id, name)
);

-- ============================================
-- AI PROMPT TEMPLATES
-- ============================================
-- Reusable prompt templates

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- null = platform-wide

    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'general', -- summarization, reply, analysis, etc.

    -- Prompt content
    system_prompt TEXT,
    user_prompt_template TEXT NOT NULL, -- supports {{variable}} placeholders

    -- Model preferences
    recommended_model VARCHAR(100),
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER,

    -- Metadata
    variables JSONB DEFAULT '[]', -- expected variables
    tags JSONB DEFAULT '[]',

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI USAGE LOG
-- ============================================
-- Detailed usage tracking for billing and analytics

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Request info
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    credential_type VARCHAR(20) DEFAULT 'platform', -- platform, tenant

    -- Request details
    request_type VARCHAR(50) NOT NULL, -- chat, completion, embedding, image, audio
    feature VARCHAR(50), -- message_composer, agent_assist, summarization, etc.

    -- Token counts
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Cost
    cost_cents DECIMAL(10,4) DEFAULT 0,

    -- Performance
    latency_ms INTEGER,

    -- Context
    user_id UUID REFERENCES users(id),
    conversation_id UUID,
    call_id UUID,

    -- Status
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    error_message TEXT,

    -- Caching
    cache_hit BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI CONVERSATIONS (for chatbots)
-- ============================================
-- Stores AI conversation history for context

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Conversation identification
    external_id VARCHAR(100), -- link to chat/call
    conversation_type VARCHAR(50) DEFAULT 'chat', -- chat, voice_assistant, agent_assist

    -- Participant info
    user_id UUID REFERENCES users(id), -- agent if agent_assist
    contact_id UUID REFERENCES contacts(id),

    -- State
    status VARCHAR(20) DEFAULT 'active', -- active, completed, abandoned

    -- Context window management
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI CONVERSATION MESSAGES
-- ============================================
-- Individual messages in AI conversations

CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

    -- Message info
    role VARCHAR(20) NOT NULL, -- system, user, assistant, function
    content TEXT NOT NULL,

    -- Function calls (for tool use)
    function_call JSONB, -- name, arguments
    function_response JSONB,

    -- Token count
    tokens INTEGER DEFAULT 0,

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI AGENT ASSIST SUGGESTIONS
-- ============================================
-- Real-time suggestions for agents

CREATE TABLE IF NOT EXISTS ai_agent_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Context
    call_id UUID REFERENCES calls(id),
    conversation_id UUID,
    agent_id UUID REFERENCES users(id),

    -- Suggestion
    suggestion_type VARCHAR(50) NOT NULL, -- response, upsell, compliance_warning, knowledge, objection_handler
    content TEXT NOT NULL,
    confidence DECIMAL(5,4), -- 0-1

    -- Source
    source VARCHAR(50), -- llm, knowledge_base, script, rule
    source_id UUID, -- reference to KB article, script step, etc.

    -- Action taken
    action VARCHAR(20), -- shown, used, dismissed, modified
    agent_feedback VARCHAR(20), -- helpful, not_helpful, incorrect

    -- Timing
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    shown_at TIMESTAMPTZ,
    actioned_at TIMESTAMPTZ
);

-- ============================================
-- AI CHATBOT CONFIGS
-- ============================================
-- Chatbot/voice assistant configurations

CREATE TABLE IF NOT EXISTS ai_chatbots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Bot info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    bot_type VARCHAR(50) DEFAULT 'chat', -- chat, voice, hybrid

    -- Personality
    system_prompt TEXT NOT NULL,
    persona_name VARCHAR(100),
    tone VARCHAR(50) DEFAULT 'professional', -- professional, friendly, formal, casual

    -- Model settings
    provider VARCHAR(50) DEFAULT 'openai',
    model VARCHAR(100) DEFAULT 'gpt-4o-mini',
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,

    -- Capabilities
    capabilities JSONB DEFAULT '{
        "knowledge_base": true,
        "function_calling": false,
        "handoff_to_human": true,
        "collect_info": true,
        "schedule_callback": false
    }',

    -- Knowledge sources
    knowledge_base_ids JSONB DEFAULT '[]', -- KB category IDs to search

    -- Handoff rules
    handoff_rules JSONB DEFAULT '{
        "max_turns_without_resolution": 5,
        "sentiment_threshold": -0.5,
        "keywords": ["speak to human", "agent", "representative"],
        "queue_id": null
    }',

    -- Channels
    channels JSONB DEFAULT '["chat"]', -- chat, sms, whatsapp, voice, etc.

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Analytics
    total_conversations INTEGER DEFAULT 0,
    containment_rate DECIMAL(5,2) DEFAULT 0, -- % resolved without human
    avg_csat DECIMAL(3,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI CHATBOT INTENTS
-- ============================================
-- Intent recognition for chatbots

CREATE TABLE IF NOT EXISTS ai_chatbot_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chatbot_id UUID NOT NULL REFERENCES ai_chatbots(id) ON DELETE CASCADE,

    -- Intent info
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Training examples
    examples JSONB DEFAULT '[]', -- array of example phrases

    -- Response handling
    response_type VARCHAR(50) DEFAULT 'llm', -- llm, template, function, handoff
    response_template TEXT,
    function_name VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI FUNCTIONS (for function calling)
-- ============================================
-- Available functions for AI to call

CREATE TABLE IF NOT EXISTS ai_functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- null = platform-wide

    -- Function info
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,

    -- Function schema (OpenAI function calling format)
    parameters JSONB NOT NULL, -- JSON Schema for parameters

    -- Implementation
    implementation_type VARCHAR(50) DEFAULT 'internal', -- internal, webhook, workflow
    implementation_config JSONB DEFAULT '{}', -- endpoint URL, workflow ID, etc.

    -- Permissions
    requires_confirmation BOOLEAN DEFAULT false,
    allowed_chatbot_ids JSONB DEFAULT '[]', -- empty = all

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI EMBEDDINGS CACHE
-- ============================================
-- Cache for text embeddings (semantic search)

CREATE TABLE IF NOT EXISTS ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Source identification
    source_type VARCHAR(50) NOT NULL, -- knowledge_article, transcript, message
    source_id UUID NOT NULL,
    chunk_index INTEGER DEFAULT 0, -- for long documents split into chunks

    -- Content
    content_hash VARCHAR(64) NOT NULL, -- SHA256 of content
    content_preview VARCHAR(500), -- first 500 chars

    -- Embedding
    embedding vector(1536), -- OpenAI ada-002 dimensions (requires pgvector)
    model VARCHAR(100) NOT NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, source_type, source_id, chunk_index)
);

-- ============================================
-- AI CONTENT MODERATION LOG
-- ============================================
-- Tracks content moderation results

CREATE TABLE IF NOT EXISTS ai_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Content
    content_type VARCHAR(50) NOT NULL, -- message, response, image
    content_hash VARCHAR(64),
    content_preview VARCHAR(500),

    -- Moderation result
    flagged BOOLEAN DEFAULT false,
    categories JSONB DEFAULT '{}', -- hate, violence, sexual, etc.
    scores JSONB DEFAULT '{}',

    -- Action taken
    action VARCHAR(50), -- allowed, blocked, modified, flagged_for_review

    -- Context
    user_id UUID REFERENCES users(id),
    conversation_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_quality ON ai_models(quality_tier, is_active);

CREATE INDEX IF NOT EXISTS idx_platform_ai_creds_provider ON platform_ai_credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_ai_creds_active ON platform_ai_credentials(is_active, is_default);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_settings_tenant ON tenant_ai_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_ai_creds_tenant ON tenant_ai_credentials(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_tenant ON ai_prompt_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_category ON ai_prompt_templates(category, is_active);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage_log(provider, model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_billing ON ai_usage_log(tenant_id, created_at, cost_cents);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON ai_conversations(status, tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_messages_conv ON ai_conversation_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_call ON ai_agent_suggestions(call_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_agent ON ai_agent_suggestions(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type ON ai_agent_suggestions(suggestion_type);

CREATE INDEX IF NOT EXISTS idx_ai_chatbots_tenant ON ai_chatbots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_chatbot_intents_bot ON ai_chatbot_intents(chatbot_id);

CREATE INDEX IF NOT EXISTS idx_ai_functions_tenant ON ai_functions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source ON ai_embeddings(tenant_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_tenant ON ai_moderation_log(tenant_id, created_at);

-- ============================================
-- INSERT DEFAULT PROVIDERS
-- ============================================

INSERT INTO ai_providers (name, display_name, base_url, capabilities, pricing) VALUES
(
    'openai',
    'OpenAI',
    'https://api.openai.com/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": true,
        "image_analysis": true,
        "audio_transcription": true,
        "audio_generation": true,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.0025, "output_per_1k_tokens": 0.01}'
),
(
    'anthropic',
    'Anthropic Claude',
    'https://api.anthropic.com/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": false,
        "image_generation": false,
        "image_analysis": true,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.003, "output_per_1k_tokens": 0.015}'
),
(
    'google',
    'Google Gemini',
    'https://generativelanguage.googleapis.com/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": true,
        "image_analysis": true,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.00025, "output_per_1k_tokens": 0.0005}'
),
(
    'aws_bedrock',
    'AWS Bedrock',
    'https://bedrock-runtime.us-east-1.amazonaws.com',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": true,
        "image_analysis": true,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.003, "output_per_1k_tokens": 0.015}'
),
(
    'azure_openai',
    'Azure OpenAI',
    NULL,
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": true,
        "image_analysis": true,
        "audio_transcription": true,
        "audio_generation": true,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.003, "output_per_1k_tokens": 0.012}'
),
(
    'cohere',
    'Cohere',
    'https://api.cohere.ai/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": false,
        "image_analysis": false,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": false,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.0004, "output_per_1k_tokens": 0.0004}'
),
(
    'mistral',
    'Mistral AI',
    'https://api.mistral.ai/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": true,
        "image_generation": false,
        "image_analysis": false,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.0002, "output_per_1k_tokens": 0.0006}'
),
(
    'groq',
    'Groq',
    'https://api.groq.com/openai/v1',
    '{
        "text_generation": true,
        "chat_completion": true,
        "embeddings": false,
        "image_generation": false,
        "image_analysis": false,
        "audio_transcription": false,
        "audio_generation": false,
        "function_calling": true,
        "streaming": true
    }',
    '{"input_per_1k_tokens": 0.00005, "output_per_1k_tokens": 0.0001}'
)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    base_url = EXCLUDED.base_url,
    capabilities = EXCLUDED.capabilities,
    pricing = EXCLUDED.pricing,
    updated_at = NOW();

-- ============================================
-- INSERT DEFAULT MODELS
-- ============================================

-- OpenAI Models
INSERT INTO ai_models (provider_id, model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost_per_1k, output_cost_per_1k, is_default)
SELECT
    p.id,
    m.model_id,
    m.display_name,
    m.description,
    m.capabilities,
    m.context_window,
    m.max_output_tokens,
    m.quality_tier,
    m.recommended_for,
    m.input_cost,
    m.output_cost,
    m.is_default
FROM ai_providers p
CROSS JOIN (VALUES
    ('gpt-4o', 'GPT-4o', 'Most capable GPT-4 model with vision', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 128000, 16384, 'premium', '["complex_analysis", "vision", "coding"]', 0.0025, 0.01, false),
    ('gpt-4o-mini', 'GPT-4o Mini', 'Fast and affordable GPT-4 class model', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 128000, 16384, 'standard', '["chat", "summarization", "general"]', 0.00015, 0.0006, true),
    ('gpt-4-turbo', 'GPT-4 Turbo', 'Previous GPT-4 with 128K context', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 128000, 4096, 'advanced', '["analysis", "writing", "coding"]', 0.01, 0.03, false),
    ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 'Fast and cost-effective', '{"text_generation": true, "chat_completion": true, "function_calling": true, "streaming": true}', 16385, 4096, 'basic', '["simple_chat", "classification"]', 0.0005, 0.0015, false),
    ('text-embedding-3-small', 'Embedding Small', 'Efficient embeddings', '{"embeddings": true}', 8191, 0, 'standard', '["embeddings", "search"]', 0.00002, 0, false),
    ('text-embedding-3-large', 'Embedding Large', 'High quality embeddings', '{"embeddings": true}', 8191, 0, 'advanced', '["embeddings", "search"]', 0.00013, 0, false)
) AS m(model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost, output_cost, is_default)
WHERE p.name = 'openai'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities::jsonb,
    context_window = EXCLUDED.context_window,
    max_output_tokens = EXCLUDED.max_output_tokens,
    quality_tier = EXCLUDED.quality_tier,
    recommended_for = EXCLUDED.recommended_for::jsonb,
    input_cost_per_1k = EXCLUDED.input_cost_per_1k,
    output_cost_per_1k = EXCLUDED.output_cost_per_1k,
    updated_at = NOW();

-- Anthropic Models
INSERT INTO ai_models (provider_id, model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost_per_1k, output_cost_per_1k, is_default)
SELECT
    p.id,
    m.model_id,
    m.display_name,
    m.description,
    m.capabilities,
    m.context_window,
    m.max_output_tokens,
    m.quality_tier,
    m.recommended_for,
    m.input_cost,
    m.output_cost,
    m.is_default
FROM ai_providers p
CROSS JOIN (VALUES
    ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'Best balance of intelligence and speed', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 200000, 8192, 'advanced', '["analysis", "writing", "coding"]', 0.003, 0.015, true),
    ('claude-3-opus-20240229', 'Claude 3 Opus', 'Most intelligent Claude model', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 200000, 4096, 'premium', '["complex_analysis", "research"]', 0.015, 0.075, false),
    ('claude-3-haiku-20240307', 'Claude 3 Haiku', 'Fastest Claude model', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 200000, 4096, 'basic', '["simple_chat", "quick_tasks"]', 0.00025, 0.00125, false)
) AS m(model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost, output_cost, is_default)
WHERE p.name = 'anthropic'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities::jsonb,
    context_window = EXCLUDED.context_window,
    max_output_tokens = EXCLUDED.max_output_tokens,
    quality_tier = EXCLUDED.quality_tier,
    recommended_for = EXCLUDED.recommended_for::jsonb,
    input_cost_per_1k = EXCLUDED.input_cost_per_1k,
    output_cost_per_1k = EXCLUDED.output_cost_per_1k,
    updated_at = NOW();

-- Google Models
INSERT INTO ai_models (provider_id, model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost_per_1k, output_cost_per_1k, is_default)
SELECT
    p.id,
    m.model_id,
    m.display_name,
    m.description,
    m.capabilities,
    m.context_window,
    m.max_output_tokens,
    m.quality_tier,
    m.recommended_for,
    m.input_cost,
    m.output_cost,
    m.is_default
FROM ai_providers p
CROSS JOIN (VALUES
    ('gemini-1.5-pro', 'Gemini 1.5 Pro', 'Most capable Gemini with 2M context', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 2097152, 8192, 'premium', '["long_context", "analysis", "multimodal"]', 0.00125, 0.005, false),
    ('gemini-1.5-flash', 'Gemini 1.5 Flash', 'Fast and versatile', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 1048576, 8192, 'standard', '["chat", "general", "summarization"]', 0.000075, 0.0003, true),
    ('gemini-2.0-flash-exp', 'Gemini 2.0 Flash', 'Latest experimental model', '{"text_generation": true, "chat_completion": true, "function_calling": true, "vision": true, "streaming": true}', 1048576, 8192, 'advanced', '["multimodal", "reasoning"]', 0.0001, 0.0004, false)
) AS m(model_id, display_name, description, capabilities, context_window, max_output_tokens, quality_tier, recommended_for, input_cost, output_cost, is_default)
WHERE p.name = 'google'
ON CONFLICT (provider_id, model_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities::jsonb,
    context_window = EXCLUDED.context_window,
    max_output_tokens = EXCLUDED.max_output_tokens,
    quality_tier = EXCLUDED.quality_tier,
    recommended_for = EXCLUDED.recommended_for::jsonb,
    input_cost_per_1k = EXCLUDED.input_cost_per_1k,
    output_cost_per_1k = EXCLUDED.output_cost_per_1k,
    updated_at = NOW();

-- ============================================
-- INSERT DEFAULT PROMPT TEMPLATES
-- ============================================

INSERT INTO ai_prompt_templates (tenant_id, name, description, category, system_prompt, user_prompt_template, recommended_model, temperature, variables, is_default) VALUES
(NULL, 'Call Summary', 'Generate a concise call summary', 'summarization',
'You are a call center analyst. Generate concise, professional call summaries.',
'Summarize this call transcript in 2-3 sentences, highlighting the main topic, resolution, and any follow-up needed:

{{transcript}}',
'gpt-4o-mini', 0.3, '["transcript"]', true),

(NULL, 'Email Reply Draft', 'Draft a professional email reply', 'reply',
'You are a professional customer service representative. Write clear, helpful, and friendly email responses.',
'Draft a professional reply to this customer email. Match their tone and address all their concerns:

Customer Email:
{{customer_email}}

Context:
- Customer Name: {{customer_name}}
- Account Status: {{account_status}}
- Previous Interactions: {{interaction_history}}',
'gpt-4o-mini', 0.7, '["customer_email", "customer_name", "account_status", "interaction_history"]', true),

(NULL, 'Chat Response', 'Generate a chat response', 'reply',
'You are a helpful customer service agent in a live chat. Be concise, friendly, and solution-oriented. Keep responses under 100 words.',
'Generate a helpful response to this customer message:

Customer: {{customer_message}}

Context:
- Issue Type: {{issue_type}}
- Customer Sentiment: {{sentiment}}',
'gpt-4o-mini', 0.7, '["customer_message", "issue_type", "sentiment"]', true),

(NULL, 'Sentiment Analysis', 'Analyze message sentiment', 'analysis',
'You are a sentiment analysis system. Respond only with a JSON object.',
'Analyze the sentiment of this text and return a JSON object with: sentiment (positive/negative/neutral), score (-1 to 1), emotions (array), and key_phrases (array).

Text: {{text}}',
'gpt-4o-mini', 0.1, '["text"]', true),

(NULL, 'Intent Detection', 'Detect customer intent', 'analysis',
'You are an intent classification system. Classify customer messages into intents.',
'Classify the intent of this customer message. Return a JSON object with: primary_intent, confidence (0-1), secondary_intents (array), and entities (object).

Available intents: billing_inquiry, technical_support, account_update, complaint, cancellation, general_inquiry, sales, feedback

Message: {{message}}',
'gpt-4o-mini', 0.1, '["message"]', true),

(NULL, 'Knowledge Base Answer', 'Answer from knowledge base', 'reply',
'You are a helpful assistant that answers questions using the provided knowledge base articles. Only answer based on the provided context. If the answer is not in the context, say you do not have that information.',
'Answer this customer question using only the provided knowledge base articles:

Question: {{question}}

Knowledge Base Context:
{{kb_context}}',
'gpt-4o-mini', 0.3, '["question", "kb_context"]', true),

(NULL, 'Agent Coaching', 'Provide real-time coaching to agents', 'agent_assist',
'You are an expert call center coach. Provide brief, actionable suggestions to help agents handle calls better.',
'Based on this conversation snippet, provide a brief coaching suggestion for the agent:

Recent Conversation:
{{conversation}}

Current Situation: {{situation}}
Agent Performance Context: {{agent_context}}',
'gpt-4o-mini', 0.5, '["conversation", "situation", "agent_context"]', true),

(NULL, 'Objection Handler', 'Suggest objection handling responses', 'agent_assist',
'You are a sales expert. Provide persuasive but respectful responses to customer objections.',
'The customer has raised this objection: "{{objection}}"

Product/Service: {{product}}
Customer Context: {{customer_context}}

Provide 2-3 response options the agent can use, ranked by effectiveness.',
'gpt-4o-mini', 0.6, '["objection", "product", "customer_context"]', true)

ON CONFLICT DO NOTHING;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_ai_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_providers_updated ON ai_providers;
CREATE TRIGGER trigger_ai_providers_updated
    BEFORE UPDATE ON ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_ai_timestamp();

DROP TRIGGER IF EXISTS trigger_ai_models_updated ON ai_models;
CREATE TRIGGER trigger_ai_models_updated
    BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION update_ai_timestamp();

DROP TRIGGER IF EXISTS trigger_platform_ai_creds_updated ON platform_ai_credentials;
CREATE TRIGGER trigger_platform_ai_creds_updated
    BEFORE UPDATE ON platform_ai_credentials
    FOR EACH ROW EXECUTE FUNCTION update_ai_timestamp();

DROP TRIGGER IF EXISTS trigger_tenant_ai_settings_updated ON tenant_ai_settings;
CREATE TRIGGER trigger_tenant_ai_settings_updated
    BEFORE UPDATE ON tenant_ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_ai_timestamp();

DROP TRIGGER IF EXISTS trigger_ai_chatbots_updated ON ai_chatbots;
CREATE TRIGGER trigger_ai_chatbots_updated
    BEFORE UPDATE ON ai_chatbots
    FOR EACH ROW EXECUTE FUNCTION update_ai_timestamp();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE ai_providers IS 'Catalog of available AI providers (OpenAI, Anthropic, Google, etc.)';
COMMENT ON TABLE ai_models IS 'Available models per provider with capabilities and pricing';
COMMENT ON TABLE platform_ai_credentials IS 'Platform-wide AI API credentials';
COMMENT ON TABLE tenant_ai_settings IS 'Per-tenant AI configuration and preferences';
COMMENT ON TABLE tenant_ai_credentials IS 'Customer-owned AI API keys (BYOK)';
COMMENT ON TABLE ai_prompt_templates IS 'Reusable prompt templates for various AI tasks';
COMMENT ON TABLE ai_usage_log IS 'Detailed AI usage tracking for billing and analytics';
COMMENT ON TABLE ai_conversations IS 'AI conversation history for chatbots and assistants';
COMMENT ON TABLE ai_agent_suggestions IS 'Real-time AI suggestions shown to agents';
COMMENT ON TABLE ai_chatbots IS 'Chatbot and voice assistant configurations';
COMMENT ON TABLE ai_functions IS 'Functions available for AI function calling';
COMMENT ON TABLE ai_embeddings IS 'Text embeddings cache for semantic search';
