/**
 * AI Voice Assistant API Routes
 * TTS/STT and Voice Bot endpoints for customers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { aiVoiceService } from '../services/ai-voice.js';

const aiVoice = new Hono();

// ============================================
// Voice Providers
// ============================================
aiVoice.get('/providers', async (c) => {
    try {
        const providers = await aiVoiceService.listProviders();
        return c.json({ providers });
    } catch (error) {
        console.error('List voice providers error:', error);
        return c.json({ error: 'Failed to list providers' }, 500);
    }
});

// ============================================
// Voice Assistant CRUD
// ============================================
const createAssistantSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    assistant_type: z.enum(['ivr_bot', 'outbound_agent', 'survey_bot', 'appointment_scheduler', 'payment_collector', 'custom']).optional(),
    tts_provider_id: z.number().optional(),
    stt_provider_id: z.number().optional(),
    voice_id: z.string().optional(),
    voice_name: z.string().optional(),
    language: z.string().default('en-US'),
    speaking_rate: z.number().min(0.5).max(2.0).optional(),
    pitch: z.number().min(-20).max(20).optional(),
    volume_gain_db: z.number().min(-10).max(10).optional(),
    ai_model_id: z.number().optional(),
    system_prompt: z.string().optional(),
    max_response_tokens: z.number().min(50).max(2000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    initial_greeting: z.string().optional(),
    fallback_message: z.string().optional(),
    goodbye_message: z.string().optional(),
    transfer_message: z.string().optional(),
    max_silence_seconds: z.number().min(1).max(30).optional(),
    max_conversation_minutes: z.number().min(1).max(60).optional(),
    max_no_input_retries: z.number().min(1).max(10).optional(),
    max_no_match_retries: z.number().min(1).max(10).optional(),
    intents_config: z.array(z.any()).optional(),
    entities_config: z.array(z.any()).optional(),
    ivr_flow_id: z.number().optional(),
    webhook_url: z.string().url().optional(),
    webhook_events: z.array(z.string()).optional(),
    sentiment_analysis_enabled: z.boolean().optional(),
    call_recording_enabled: z.boolean().optional(),
    transcription_enabled: z.boolean().optional(),
    summarization_enabled: z.boolean().optional()
});

aiVoice.post('/assistants', zValidator('json', createAssistantSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const userId = c.get('userId');
        const data = c.req.valid('json');

        const assistant = await aiVoiceService.createAssistant(tenantId, data, userId);
        return c.json({ assistant }, 201);
    } catch (error) {
        console.error('Create voice assistant error:', error);
        return c.json({ error: 'Failed to create assistant' }, 500);
    }
});

aiVoice.get('/assistants', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { status, assistant_type, limit, offset } = c.req.query();

        const assistants = await aiVoiceService.listAssistants(tenantId, {
            status, assistant_type,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined
        });
        return c.json({ assistants });
    } catch (error) {
        console.error('List voice assistants error:', error);
        return c.json({ error: 'Failed to list assistants' }, 500);
    }
});

aiVoice.get('/assistants/:id', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const assistantId = parseInt(c.req.param('id'));

        const assistant = await aiVoiceService.getAssistant(assistantId, tenantId);
        if (!assistant) return c.json({ error: 'Assistant not found' }, 404);

        return c.json({ assistant });
    } catch (error) {
        console.error('Get voice assistant error:', error);
        return c.json({ error: 'Failed to get assistant' }, 500);
    }
});

aiVoice.put('/assistants/:id', zValidator('json', createAssistantSchema.partial()), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const assistantId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const assistant = await aiVoiceService.updateAssistant(assistantId, tenantId, data);
        if (!assistant) return c.json({ error: 'Assistant not found' }, 404);

        return c.json({ assistant });
    } catch (error) {
        console.error('Update voice assistant error:', error);
        return c.json({ error: 'Failed to update assistant' }, 500);
    }
});

aiVoice.delete('/assistants/:id', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const assistantId = parseInt(c.req.param('id'));

        const deleted = await aiVoiceService.deleteAssistant(assistantId, tenantId);
        if (!deleted) return c.json({ error: 'Assistant not found' }, 404);

        return c.json({ success: true });
    } catch (error) {
        console.error('Delete voice assistant error:', error);
        return c.json({ error: 'Failed to delete assistant' }, 500);
    }
});

aiVoice.post('/assistants/:id/publish', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const userId = c.get('userId');
        const assistantId = parseInt(c.req.param('id'));
        const { notes } = await c.req.json().catch(() => ({}));

        const result = await aiVoiceService.publishAssistant(assistantId, tenantId, userId, notes);
        return c.json(result);
    } catch (error) {
        console.error('Publish voice assistant error:', error);
        return c.json({ error: 'Failed to publish assistant' }, 500);
    }
});

// ============================================
// Text-to-Speech
// ============================================
const synthesizeSchema = z.object({
    text: z.string().min(1).max(5000),
    provider_id: z.number(),
    voice_id: z.string(),
    language: z.string().optional(),
    speaking_rate: z.number().optional(),
    pitch: z.number().optional(),
    volume_gain_db: z.number().optional(),
    model: z.string().optional()
});

aiVoice.post('/tts/synthesize', zValidator('json', synthesizeSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const data = c.req.valid('json');

        const result = await aiVoiceService.synthesizeSpeech(tenantId, data.text, data);

        // Return audio as base64 for simplicity
        const base64Audio = Buffer.from(result.audio).toString('base64');
        return c.json({
            audio: base64Audio,
            format: result.format,
            latency_ms: result.latencyMs
        });
    } catch (error) {
        console.error('TTS synthesize error:', error);
        return c.json({ error: error.message || 'Failed to synthesize speech' }, 500);
    }
});

// ============================================
// Speech-to-Text
// ============================================
aiVoice.post('/stt/transcribe', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const formData = await c.req.formData();
        const audio = formData.get('audio');
        const providerId = parseInt(formData.get('provider_id'));
        const language = formData.get('language') || 'en-US';

        if (!audio || !providerId) {
            return c.json({ error: 'Audio file and provider_id required' }, 400);
        }

        const audioBuffer = await audio.arrayBuffer();
        const result = await aiVoiceService.transcribeSpeech(tenantId, Buffer.from(audioBuffer), {
            provider_id: providerId,
            language
        });

        return c.json({
            transcript: result.transcript,
            confidence: result.confidence,
            latency_ms: result.latencyMs
        });
    } catch (error) {
        console.error('STT transcribe error:', error);
        return c.json({ error: error.message || 'Failed to transcribe speech' }, 500);
    }
});

// ============================================
// Conversations
// ============================================
const startConversationSchema = z.object({
    assistant_id: z.number(),
    call_id: z.string().optional(),
    caller_number: z.string().optional(),
    called_number: z.string().optional(),
    direction: z.enum(['inbound', 'outbound']).optional()
});

aiVoice.post('/conversations', zValidator('json', startConversationSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const data = c.req.valid('json');

        const conversation = await aiVoiceService.startConversation(data.assistant_id, tenantId, data);
        return c.json({ conversation }, 201);
    } catch (error) {
        console.error('Start conversation error:', error);
        return c.json({ error: 'Failed to start conversation' }, 500);
    }
});

aiVoice.get('/conversations', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { assistant_id, status, start_date, end_date, limit, offset } = c.req.query();

        const conversations = await aiVoiceService.listConversations(tenantId, {
            assistant_id: assistant_id ? parseInt(assistant_id) : undefined,
            status,
            start_date,
            end_date,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined
        });
        return c.json({ conversations });
    } catch (error) {
        console.error('List conversations error:', error);
        return c.json({ error: 'Failed to list conversations' }, 500);
    }
});

aiVoice.get('/conversations/:id', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const conversationId = parseInt(c.req.param('id'));

        const conversation = await aiVoiceService.getConversation(conversationId, tenantId);
        if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

        return c.json({ conversation });
    } catch (error) {
        console.error('Get conversation error:', error);
        return c.json({ error: 'Failed to get conversation' }, 500);
    }
});

const addTurnSchema = z.object({
    user_audio_url: z.string().url().optional(),
    user_transcript: z.string().optional(),
    user_transcript_confidence: z.number().optional(),
    assistant_text: z.string().optional(),
    assistant_audio_url: z.string().url().optional(),
    detected_intent: z.string().optional(),
    intent_confidence: z.number().optional(),
    detected_entities: z.array(z.any()).optional(),
    sentiment: z.string().optional(),
    stt_latency_ms: z.number().optional(),
    llm_latency_ms: z.number().optional(),
    tts_latency_ms: z.number().optional(),
    total_latency_ms: z.number().optional(),
    error_type: z.string().optional(),
    error_message: z.string().optional()
});

aiVoice.post('/conversations/:id/turns', zValidator('json', addTurnSchema), async (c) => {
    try {
        const conversationId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const turn = await aiVoiceService.addConversationTurn(conversationId, data);
        return c.json({ turn }, 201);
    } catch (error) {
        console.error('Add turn error:', error);
        return c.json({ error: 'Failed to add turn' }, 500);
    }
});

const endConversationSchema = z.object({
    outcome: z.string(),
    transfer_target: z.string().optional(),
    transfer_reason: z.string().optional()
});

aiVoice.post('/conversations/:id/end', zValidator('json', endConversationSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const conversationId = parseInt(c.req.param('id'));
        const { outcome, transfer_target, transfer_reason } = c.req.valid('json');

        const transferDetails = transfer_target ? { target: transfer_target, reason: transfer_reason } : null;
        const conversation = await aiVoiceService.endConversation(conversationId, outcome, transferDetails);

        return c.json({ conversation });
    } catch (error) {
        console.error('End conversation error:', error);
        return c.json({ error: 'Failed to end conversation' }, 500);
    }
});

// ============================================
// Intents & Entities
// ============================================
const createIntentSchema = z.object({
    intent_name: z.string().min(1).max(100),
    display_name: z.string().optional(),
    description: z.string().optional(),
    training_phrases: z.array(z.string()).optional(),
    action_type: z.enum(['respond', 'collect_info', 'transfer', 'api_call', 'play_audio', 'hangup', 'custom']).optional(),
    action_config: z.any().optional(),
    follow_up_intents: z.array(z.string()).optional(),
    output_contexts: z.array(z.string()).optional(),
    priority: z.number().optional(),
    is_fallback: z.boolean().optional()
});

aiVoice.post('/assistants/:id/intents', zValidator('json', createIntentSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const assistantId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const intent = await aiVoiceService.createIntent(assistantId, tenantId, data);
        return c.json({ intent }, 201);
    } catch (error) {
        console.error('Create intent error:', error);
        return c.json({ error: 'Failed to create intent' }, 500);
    }
});

aiVoice.get('/assistants/:id/intents', async (c) => {
    try {
        const assistantId = parseInt(c.req.param('id'));
        const intents = await aiVoiceService.listIntents(assistantId);
        return c.json({ intents });
    } catch (error) {
        console.error('List intents error:', error);
        return c.json({ error: 'Failed to list intents' }, 500);
    }
});

const createEntitySchema = z.object({
    entity_name: z.string().min(1).max(100),
    display_name: z.string().optional(),
    entity_type: z.enum(['custom', 'system', 'regex', 'composite']).optional(),
    values: z.array(z.any()).optional(),
    regex_pattern: z.string().optional(),
    components: z.array(z.any()).optional(),
    is_fuzzy_match: z.boolean().optional(),
    is_required: z.boolean().optional()
});

aiVoice.post('/assistants/:id/entities', zValidator('json', createEntitySchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const assistantId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const entity = await aiVoiceService.createEntity(assistantId, tenantId, data);
        return c.json({ entity }, 201);
    } catch (error) {
        console.error('Create entity error:', error);
        return c.json({ error: 'Failed to create entity' }, 500);
    }
});

aiVoice.get('/assistants/:id/entities', async (c) => {
    try {
        const assistantId = parseInt(c.req.param('id'));
        const entities = await aiVoiceService.listEntities(assistantId);
        return c.json({ entities });
    } catch (error) {
        console.error('List entities error:', error);
        return c.json({ error: 'Failed to list entities' }, 500);
    }
});

// ============================================
// Dialog Nodes
// ============================================
aiVoice.get('/assistants/:id/dialog-nodes', async (c) => {
    try {
        const assistantId = parseInt(c.req.param('id'));
        const nodes = await aiVoiceService.getDialogNodes(assistantId);
        return c.json({ nodes });
    } catch (error) {
        console.error('Get dialog nodes error:', error);
        return c.json({ error: 'Failed to get dialog nodes' }, 500);
    }
});

aiVoice.put('/assistants/:id/dialog-nodes', async (c) => {
    try {
        const assistantId = parseInt(c.req.param('id'));
        const { nodes } = await c.req.json();

        const savedNodes = await aiVoiceService.saveDialogNodes(assistantId, nodes);
        return c.json({ nodes: savedNodes });
    } catch (error) {
        console.error('Save dialog nodes error:', error);
        return c.json({ error: 'Failed to save dialog nodes' }, 500);
    }
});

// ============================================
// Prompt Templates
// ============================================
aiVoice.get('/prompt-templates', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { category } = c.req.query();

        const templates = await aiVoiceService.listPromptTemplates(tenantId, category);
        return c.json({ templates });
    } catch (error) {
        console.error('List prompt templates error:', error);
        return c.json({ error: 'Failed to list templates' }, 500);
    }
});

const createTemplateSchema = z.object({
    template_name: z.string().min(1).max(100),
    template_category: z.enum(['greeting', 'clarification', 'confirmation', 'error', 'transfer', 'goodbye', 'hold', 'callback', 'custom']),
    template_text: z.string().min(1),
    variables: z.array(z.string()).optional(),
    language: z.string().optional()
});

aiVoice.post('/prompt-templates', zValidator('json', createTemplateSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const data = c.req.valid('json');

        const template = await aiVoiceService.createPromptTemplate(tenantId, data);
        return c.json({ template }, 201);
    } catch (error) {
        console.error('Create template error:', error);
        return c.json({ error: 'Failed to create template' }, 500);
    }
});

// ============================================
// Custom Voices
// ============================================
aiVoice.get('/custom-voices', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const voices = await aiVoiceService.listCustomVoices(tenantId);
        return c.json({ voices });
    } catch (error) {
        console.error('List custom voices error:', error);
        return c.json({ error: 'Failed to list voices' }, 500);
    }
});

const createCustomVoiceSchema = z.object({
    voice_name: z.string().min(1).max(100),
    description: z.string().optional(),
    provider_id: z.number(),
    training_audio_urls: z.array(z.string().url()).optional(),
    training_text: z.string().optional(),
    gender: z.string().optional(),
    age_range: z.string().optional(),
    accent: z.string().optional(),
    style: z.string().optional()
});

aiVoice.post('/custom-voices', zValidator('json', createCustomVoiceSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const userId = c.get('userId');
        const data = c.req.valid('json');

        const voice = await aiVoiceService.createCustomVoice(tenantId, data, userId);
        return c.json({ voice }, 201);
    } catch (error) {
        console.error('Create custom voice error:', error);
        return c.json({ error: 'Failed to create voice' }, 500);
    }
});

// ============================================
// Outbound Campaigns
// ============================================
const createCampaignSchema = z.object({
    assistant_id: z.number(),
    campaign_name: z.string().min(1).max(200),
    campaign_type: z.enum(['survey', 'reminder', 'collection', 'notification', 'sales', 'custom']).optional(),
    contact_list_id: z.number().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    calling_hours_start: z.string().optional(),
    calling_hours_end: z.string().optional(),
    timezone: z.string().optional(),
    days_of_week: z.array(z.string()).optional(),
    max_concurrent_calls: z.number().min(1).max(100).optional(),
    calls_per_minute: z.number().min(0.1).max(60).optional(),
    max_attempts: z.number().min(1).max(10).optional(),
    retry_interval_minutes: z.number().min(5).max(1440).optional()
});

aiVoice.post('/outbound-campaigns', zValidator('json', createCampaignSchema), async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const userId = c.get('userId');
        const data = c.req.valid('json');

        const campaign = await aiVoiceService.createOutboundCampaign(tenantId, data, userId);
        return c.json({ campaign }, 201);
    } catch (error) {
        console.error('Create outbound campaign error:', error);
        return c.json({ error: 'Failed to create campaign' }, 500);
    }
});

aiVoice.get('/outbound-campaigns', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { status } = c.req.query();

        const campaigns = await aiVoiceService.listOutboundCampaigns(tenantId, { status });
        return c.json({ campaigns });
    } catch (error) {
        console.error('List outbound campaigns error:', error);
        return c.json({ error: 'Failed to list campaigns' }, 500);
    }
});

// ============================================
// Analytics & Usage
// ============================================
aiVoice.get('/analytics', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { assistant_id, start_date, end_date } = c.req.query();

        if (!assistant_id || !start_date || !end_date) {
            return c.json({ error: 'assistant_id, start_date, and end_date required' }, 400);
        }

        const analytics = await aiVoiceService.getAnalytics(tenantId, parseInt(assistant_id), start_date, end_date);
        return c.json({ analytics });
    } catch (error) {
        console.error('Get analytics error:', error);
        return c.json({ error: 'Failed to get analytics' }, 500);
    }
});

aiVoice.get('/usage', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const { start_date, end_date } = c.req.query();

        const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = end_date || new Date().toISOString().split('T')[0];

        const usage = await aiVoiceService.getUsageSummary(tenantId, startDate, endDate);
        return c.json({ usage });
    } catch (error) {
        console.error('Get usage error:', error);
        return c.json({ error: 'Failed to get usage' }, 500);
    }
});

// ============================================
// Tenant Credentials (BYOK)
// ============================================
aiVoice.post('/credentials/:providerId', async (c) => {
    try {
        const tenantId = c.get('tenantId');
        const providerId = parseInt(c.req.param('providerId'));
        const { credentials } = await c.req.json();

        await aiVoiceService.saveTenantCredentials(tenantId, providerId, credentials);
        return c.json({ success: true });
    } catch (error) {
        console.error('Save credentials error:', error);
        return c.json({ error: 'Failed to save credentials' }, 500);
    }
});

export default aiVoice;
