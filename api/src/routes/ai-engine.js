/**
 * AI Engine API Routes
 * Provides unified AI capabilities across multiple providers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createAIEngineService } from '../services/ai-engine.js';

const router = new Hono();

// Initialize AI service
let aiService = null;
const getAIService = (c) => {
  if (!aiService) {
    aiService = createAIEngineService(c.get('db'));
  }
  return aiService;
};

// ============== Chat Completion ==============

const chatCompletionSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(100000).optional(),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any())
  })).optional(),
  stream: z.boolean().optional()
});

router.post('/chat/completions', zValidator('json', chatCompletionSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.chatCompletion(tenantId, body.messages, {
      model: body.model,
      systemPrompt: body.systemPrompt,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      functions: body.functions,
      stream: body.stream,
      userId
    });

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Chat completion error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Embeddings ==============

const embeddingSchema = z.object({
  text: z.string(),
  model: z.string().optional(),
  dimension: z.number().optional()
});

router.post('/embeddings', zValidator('json', embeddingSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.createEmbedding(tenantId, body.text, {
      modelId: body.model,
      dimension: body.dimension
    });

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Embedding error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const storeEmbeddingSchema = z.object({
  text: z.string(),
  contentType: z.string(),
  contentId: z.string(),
  model: z.string().optional()
});

router.post('/embeddings/store', zValidator('json', storeEmbeddingSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    // Create embedding first
    const embedding = await ai.createEmbedding(tenantId, body.text, {
      modelId: body.model
    });

    // Store it
    const stored = await ai.storeEmbedding(tenantId, embedding, {
      contentType: body.contentType,
      contentId: body.contentId,
      contentText: body.text
    });

    return c.json({
      success: true,
      data: {
        id: stored.id,
        dimension: embedding.dimension
      }
    });
  } catch (error) {
    console.error('Store embedding error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const searchSimilarSchema = z.object({
  text: z.string(),
  contentType: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  threshold: z.number().min(0).max(1).optional()
});

router.post('/embeddings/search', zValidator('json', searchSimilarSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    // Create embedding for query
    const queryEmbedding = await ai.createEmbedding(tenantId, body.text);

    // Search similar
    const results = await ai.searchSimilar(tenantId, queryEmbedding.embedding, {
      contentType: body.contentType,
      limit: body.limit,
      threshold: body.threshold
    });

    return c.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Search similar error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Agent Assist ==============

const agentSuggestionSchema = z.object({
  conversationHistory: z.array(z.object({
    role: z.string(),
    content: z.string()
  })),
  customerInfo: z.object({
    name: z.string().optional(),
    sentiment: z.string().optional()
  }).optional(),
  kbArticles: z.array(z.object({
    title: z.string(),
    content: z.string()
  })).optional(),
  suggestionType: z.enum(['reply', 'coaching']).optional(),
  conversationId: z.string().optional(),
  agentId: z.string().optional()
});

router.post('/agent/suggest', zValidator('json', agentSuggestionSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.generateAgentSuggestion(tenantId, body);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Agent suggestion error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const summarizeSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string()
  }))
});

router.post('/agent/summarize', zValidator('json', summarizeSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.summarizeConversation(tenantId, body.messages);

    return c.json({
      success: true,
      data: {
        summary: result.content,
        usage: result.usage
      }
    });
  } catch (error) {
    console.error('Summarize error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const sentimentSchema = z.object({
  text: z.string()
});

router.post('/agent/sentiment', zValidator('json', sentimentSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.analyzesentiment(tenantId, body.text);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Sentiment error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const intentSchema = z.object({
  text: z.string(),
  intents: z.array(z.string()).optional()
});

router.post('/agent/intent', zValidator('json', intentSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.classifyIntent(tenantId, body.text, body.intents);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Intent error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Content Moderation ==============

const moderationSchema = z.object({
  text: z.string(),
  contentType: z.string().optional(),
  categories: z.array(z.string()).optional()
});

router.post('/moderation', zValidator('json', moderationSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.moderateContent(tenantId, body.text, {
      contentType: body.contentType,
      categories: body.categories
    });

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Moderation error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Chatbot ==============

const chatbotMessageSchema = z.object({
  chatbotId: z.string(),
  sessionId: z.string(),
  message: z.string(),
  channel: z.string().optional()
});

router.post('/chatbot/message', zValidator('json', chatbotMessageSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.processChatbotMessage(
      tenantId,
      body.chatbotId,
      body.sessionId,
      body.message,
      { channel: body.channel }
    );

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Chatbot message error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.get('/chatbot/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const chatbotId = c.req.param('id');
    const ai = getAIService(c);

    const chatbot = await ai.getChatbot(tenantId, chatbotId);

    if (!chatbot) {
      return c.json({
        success: false,
        error: 'Chatbot not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: chatbot
    });
  } catch (error) {
    console.error('Get chatbot error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Models & Providers ==============

router.get('/models', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const capability = c.req.query('capability');
    const ai = getAIService(c);

    const models = await ai.getAvailableModels(tenantId, capability);

    return c.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Get models error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.get('/providers', async (c) => {
  try {
    const db = c.get('db');

    const result = await db.query(`
      SELECT id, name, display_name, description, supported_features, is_active
      FROM ai_providers
      WHERE is_active = true
      ORDER BY display_name
    `);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get providers error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Prompt Templates ==============

router.get('/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const db = c.get('db');
    const useCase = c.req.query('use_case');

    let query = `
      SELECT * FROM ai_prompt_templates
      WHERE (tenant_id = $1 OR tenant_id IS NULL) AND is_active = true
    `;
    const params = [tenantId];

    if (useCase) {
      params.push(useCase);
      query += ` AND use_case = $${params.length}`;
    }

    query += ' ORDER BY tenant_id NULLS LAST, name';

    const result = await db.query(query, params);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get templates error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const templateSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  useCase: z.string(),
  systemPrompt: z.string(),
  userPromptTemplate: z.string().optional(),
  variables: z.record(z.any()).optional()
});

router.post('/templates', zValidator('json', templateSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO ai_prompt_templates
      (tenant_id, name, display_name, use_case, system_prompt, user_prompt_template, variables)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, name) WHERE tenant_id IS NOT NULL
      DO UPDATE SET
        display_name = $3,
        use_case = $4,
        system_prompt = $5,
        user_prompt_template = $6,
        variables = $7,
        updated_at = NOW()
      RETURNING *
    `, [tenantId, body.name, body.displayName, body.useCase, body.systemPrompt,
        body.userPromptTemplate, body.variables || {}]);

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create template error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/templates/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const templateId = c.req.param('id');
    const db = c.get('db');

    await db.query(`
      UPDATE ai_prompt_templates
      SET is_active = false
      WHERE id = $1 AND tenant_id = $2
    `, [templateId, tenantId]);

    return c.json({
      success: true
    });
  } catch (error) {
    console.error('Delete template error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Functions ==============

router.get('/functions', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const ai = getAIService(c);

    const functions = await ai.getFunctions(tenantId);

    return c.json({
      success: true,
      data: functions
    });
  } catch (error) {
    console.error('Get functions error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const functionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
  endpoint: z.string().url(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string()).optional()
});

router.post('/functions', zValidator('json', functionSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const ai = getAIService(c);

    const result = await ai.registerFunction(tenantId, body);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Register function error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Usage & Stats ==============

router.get('/usage', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const ai = getAIService(c);

    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end_date') || new Date().toISOString();

    const stats = await ai.getUsageStats(tenantId, startDate, endDate);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get usage error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Settings ==============

router.get('/settings', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const db = c.get('db');

    const result = await db.query(`
      SELECT * FROM tenant_ai_settings WHERE tenant_id = $1
    `, [tenantId]);

    return c.json({
      success: true,
      data: result.rows[0] || null
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const settingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  defaultQualityTier: z.enum(['economy', 'balanced', 'premium']).optional(),
  maxCostPerRequest: z.number().optional(),
  monthlyBudget: z.number().optional(),
  enabledFeatures: z.array(z.string()).optional(),
  contentModerationEnabled: z.boolean().optional(),
  allowedModels: z.array(z.string()).optional()
});

router.put('/settings', zValidator('json', settingsSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO tenant_ai_settings (tenant_id, is_enabled, default_quality_tier, max_cost_per_request, monthly_budget, enabled_features, content_moderation_enabled, allowed_models)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id) DO UPDATE SET
        is_enabled = COALESCE($2, tenant_ai_settings.is_enabled),
        default_quality_tier = COALESCE($3, tenant_ai_settings.default_quality_tier),
        max_cost_per_request = COALESCE($4, tenant_ai_settings.max_cost_per_request),
        monthly_budget = COALESCE($5, tenant_ai_settings.monthly_budget),
        enabled_features = COALESCE($6, tenant_ai_settings.enabled_features),
        content_moderation_enabled = COALESCE($7, tenant_ai_settings.content_moderation_enabled),
        allowed_models = COALESCE($8, tenant_ai_settings.allowed_models),
        updated_at = NOW()
      RETURNING *
    `, [tenantId, body.isEnabled, body.defaultQualityTier, body.maxCostPerRequest,
        body.monthlyBudget, body.enabledFeatures, body.contentModerationEnabled, body.allowedModels]);

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Credentials ==============

router.get('/credentials', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const db = c.get('db');

    const result = await db.query(`
      SELECT tac.id, tac.provider_id, ap.name as provider_name, ap.display_name,
             tac.is_active, tac.created_at
      FROM tenant_ai_credentials tac
      JOIN ai_providers ap ON tac.provider_id = ap.id
      WHERE tac.tenant_id = $1
      ORDER BY ap.display_name
    `, [tenantId]);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get credentials error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const credentialSchema = z.object({
  providerId: z.number(),
  credentials: z.record(z.any())
});

router.post('/credentials', zValidator('json', credentialSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO tenant_ai_credentials (tenant_id, provider_id, credentials)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, provider_id) DO UPDATE SET
        credentials = $3,
        updated_at = NOW()
      RETURNING id
    `, [tenantId, body.providerId, body.credentials]);

    return c.json({
      success: true,
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    console.error('Create credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/credentials/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const credentialId = c.req.param('id');
    const db = c.get('db');

    await db.query(`
      DELETE FROM tenant_ai_credentials
      WHERE id = $1 AND tenant_id = $2
    `, [credentialId, tenantId]);

    return c.json({
      success: true
    });
  } catch (error) {
    console.error('Delete credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Chatbots Management ==============

router.get('/chatbots', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const db = c.get('db');

    const result = await db.query(`
      SELECT c.*, am.model_id, ap.display_name as provider_name
      FROM ai_chatbots c
      LEFT JOIN ai_models am ON c.model_id = am.id
      LEFT JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE c.tenant_id = $1
      ORDER BY c.created_at DESC
    `, [tenantId]);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get chatbots error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const chatbotSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  systemPrompt: z.string(),
  welcomeMessage: z.string().optional(),
  modelId: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
  channels: z.array(z.string()).optional(),
  fallbackBehavior: z.string().optional()
});

router.post('/chatbots', zValidator('json', chatbotSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO ai_chatbots
      (tenant_id, name, description, system_prompt, welcome_message, model_id, temperature, max_tokens, channels, fallback_behavior)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [tenantId, body.name, body.description, body.systemPrompt, body.welcomeMessage,
        body.modelId, body.temperature || 0.7, body.maxTokens || 1024,
        body.channels || ['web'], body.fallbackBehavior || 'escalate']);

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create chatbot error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.put('/chatbots/:id', zValidator('json', chatbotSchema), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const chatbotId = c.req.param('id');
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      UPDATE ai_chatbots SET
        name = $3,
        description = $4,
        system_prompt = $5,
        welcome_message = $6,
        model_id = $7,
        temperature = $8,
        max_tokens = $9,
        channels = $10,
        fallback_behavior = $11,
        updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [chatbotId, tenantId, body.name, body.description, body.systemPrompt, body.welcomeMessage,
        body.modelId, body.temperature, body.maxTokens, body.channels, body.fallbackBehavior]);

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update chatbot error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/chatbots/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const chatbotId = c.req.param('id');
    const db = c.get('db');

    await db.query(`
      UPDATE ai_chatbots SET is_active = false
      WHERE id = $1 AND tenant_id = $2
    `, [chatbotId, tenantId]);

    return c.json({
      success: true
    });
  } catch (error) {
    console.error('Delete chatbot error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default router;
