/**
 * AI Engine Service
 * Multi-provider AI abstraction layer supporting:
 * - OpenAI, Anthropic, Google, AWS Bedrock, Azure OpenAI, Cohere, Mistral, Groq
 * - Chat completion, text generation, embeddings
 * - Streaming responses
 * - Automatic failover
 * - Cost-based and quality-based routing
 * - Response caching
 * - Usage tracking
 * - Function calling
 */

import crypto from 'crypto';

// Provider SDK imports (lazy loaded)
let OpenAI, Anthropic, GoogleGenerativeAI, BedrockRuntimeClient, CohereClient;

class AIEngineService {
  constructor(db) {
    this.db = db;
    this.providerClients = new Map();
    this.modelCache = new Map();
    this.responseCache = new Map();
    this.cacheMaxAge = 3600000; // 1 hour
  }

  // ============== Provider Initialization ==============

  async initializeProvider(providerName, credentials) {
    try {
      switch (providerName) {
        case 'openai':
          if (!OpenAI) {
            const module = await import('openai');
            OpenAI = module.default;
          }
          return new OpenAI({ apiKey: credentials.api_key });

        case 'anthropic':
          if (!Anthropic) {
            const module = await import('@anthropic-ai/sdk');
            Anthropic = module.default;
          }
          return new Anthropic({ apiKey: credentials.api_key });

        case 'google':
          if (!GoogleGenerativeAI) {
            const module = await import('@google/generative-ai');
            GoogleGenerativeAI = module.GoogleGenerativeAI;
          }
          return new GoogleGenerativeAI(credentials.api_key);

        case 'aws_bedrock':
          if (!BedrockRuntimeClient) {
            const module = await import('@aws-sdk/client-bedrock-runtime');
            BedrockRuntimeClient = module.BedrockRuntimeClient;
          }
          return new BedrockRuntimeClient({
            region: credentials.region || 'us-east-1',
            credentials: {
              accessKeyId: credentials.access_key_id,
              secretAccessKey: credentials.secret_access_key
            }
          });

        case 'azure_openai':
          if (!OpenAI) {
            const module = await import('openai');
            OpenAI = module.default;
          }
          return new OpenAI({
            apiKey: credentials.api_key,
            baseURL: `${credentials.endpoint}/openai/deployments/${credentials.deployment_name}`,
            defaultQuery: { 'api-version': credentials.api_version || '2024-02-01' },
            defaultHeaders: { 'api-key': credentials.api_key }
          });

        case 'cohere':
          if (!CohereClient) {
            const module = await import('cohere-ai');
            CohereClient = module.CohereClient;
          }
          return new CohereClient({ token: credentials.api_key });

        case 'mistral':
          // Mistral uses OpenAI-compatible API
          if (!OpenAI) {
            const module = await import('openai');
            OpenAI = module.default;
          }
          return new OpenAI({
            apiKey: credentials.api_key,
            baseURL: 'https://api.mistral.ai/v1'
          });

        case 'groq':
          // Groq uses OpenAI-compatible API
          if (!OpenAI) {
            const module = await import('openai');
            OpenAI = module.default;
          }
          return new OpenAI({
            apiKey: credentials.api_key,
            baseURL: 'https://api.groq.com/openai/v1'
          });

        default:
          throw new Error(`Unknown provider: ${providerName}`);
      }
    } catch (error) {
      console.error(`Failed to initialize ${providerName}:`, error);
      throw error;
    }
  }

  async getProviderClient(tenantId, providerName, useCase = 'chat') {
    // Check for tenant-specific credentials first
    const tenantCreds = await this.db.query(`
      SELECT tac.*, ap.name as provider_name, ap.api_endpoint
      FROM tenant_ai_credentials tac
      JOIN ai_providers ap ON tac.provider_id = ap.id
      WHERE tac.tenant_id = $1 AND ap.name = $2 AND tac.is_active = true
    `, [tenantId, providerName]);

    if (tenantCreds.rows.length > 0) {
      const creds = tenantCreds.rows[0];
      const cacheKey = `tenant_${tenantId}_${providerName}`;

      if (!this.providerClients.has(cacheKey)) {
        const client = await this.initializeProvider(providerName, creds.credentials);
        this.providerClients.set(cacheKey, client);
      }
      return this.providerClients.get(cacheKey);
    }

    // Fall back to platform credentials
    const platformCreds = await this.db.query(`
      SELECT pac.*, ap.name as provider_name, ap.api_endpoint
      FROM platform_ai_credentials pac
      JOIN ai_providers ap ON pac.provider_id = ap.id
      WHERE ap.name = $1 AND pac.is_active = true
      ORDER BY pac.is_default DESC
      LIMIT 1
    `, [providerName]);

    if (platformCreds.rows.length === 0) {
      throw new Error(`No credentials found for provider: ${providerName}`);
    }

    const creds = platformCreds.rows[0];
    const cacheKey = `platform_${providerName}`;

    if (!this.providerClients.has(cacheKey)) {
      const client = await this.initializeProvider(providerName, creds.credentials);
      this.providerClients.set(cacheKey, client);
    }
    return this.providerClients.get(cacheKey);
  }

  // ============== Model Selection ==============

  async getAvailableModels(tenantId, capability = null) {
    let query = `
      SELECT am.*, ap.name as provider_name, ap.display_name as provider_display_name
      FROM ai_models am
      JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE am.is_active = true AND ap.is_active = true
    `;
    const params = [];

    if (capability) {
      params.push(capability);
      query += ` AND $${params.length} = ANY(am.capabilities)`;
    }

    query += ' ORDER BY am.quality_tier DESC, am.cost_per_1k_input ASC';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async selectModel(tenantId, options = {}) {
    const {
      capability = 'chat',
      qualityTier = null,
      maxCost = null,
      preferredProvider = null,
      modelId = null
    } = options;

    // If specific model requested
    if (modelId) {
      const model = await this.db.query(`
        SELECT am.*, ap.name as provider_name
        FROM ai_models am
        JOIN ai_providers ap ON am.provider_id = ap.id
        WHERE am.id = $1 AND am.is_active = true
      `, [modelId]);
      return model.rows[0] || null;
    }

    // Get tenant settings for default preferences
    const tenantSettings = await this.db.query(`
      SELECT * FROM tenant_ai_settings WHERE tenant_id = $1
    `, [tenantId]);

    const settings = tenantSettings.rows[0] || {};
    const effectiveQualityTier = qualityTier || settings.default_quality_tier || 'balanced';
    const effectiveMaxCost = maxCost || settings.max_cost_per_request || 1.0;

    let query = `
      SELECT am.*, ap.name as provider_name
      FROM ai_models am
      JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE am.is_active = true
        AND ap.is_active = true
        AND $1 = ANY(am.capabilities)
    `;
    const params = [capability];

    if (effectiveQualityTier) {
      params.push(effectiveQualityTier);
      query += ` AND am.quality_tier = $${params.length}`;
    }

    if (effectiveMaxCost) {
      params.push(effectiveMaxCost);
      query += ` AND am.cost_per_1k_input <= $${params.length}`;
    }

    if (preferredProvider) {
      params.push(preferredProvider);
      query += ` AND ap.name = $${params.length}`;
    }

    query += ' ORDER BY am.quality_tier DESC, am.cost_per_1k_input ASC LIMIT 1';

    const result = await this.db.query(query, params);
    return result.rows[0] || null;
  }

  // ============== Chat Completion ==============

  async chatCompletion(tenantId, messages, options = {}) {
    const {
      model: modelOption,
      systemPrompt,
      temperature = 0.7,
      maxTokens = 1024,
      functions = null,
      stream = false,
      cacheKey = null,
      userId = null,
      conversationId = null
    } = options;

    // Check cache
    if (cacheKey) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) return cached;
    }

    // Select model
    const model = typeof modelOption === 'object'
      ? modelOption
      : await this.selectModel(tenantId, {
          modelId: modelOption,
          capability: 'chat'
        });

    if (!model) {
      throw new Error('No suitable model available');
    }

    const client = await this.getProviderClient(tenantId, model.provider_name);
    const startTime = Date.now();
    let response, inputTokens = 0, outputTokens = 0;

    try {
      switch (model.provider_name) {
        case 'openai':
        case 'azure_openai':
        case 'mistral':
        case 'groq':
          response = await this.openAIStyleCompletion(client, model, messages, {
            systemPrompt, temperature, maxTokens, functions, stream
          });
          inputTokens = response.usage?.prompt_tokens || 0;
          outputTokens = response.usage?.completion_tokens || 0;
          break;

        case 'anthropic':
          response = await this.anthropicCompletion(client, model, messages, {
            systemPrompt, temperature, maxTokens, stream
          });
          inputTokens = response.usage?.input_tokens || 0;
          outputTokens = response.usage?.output_tokens || 0;
          break;

        case 'google':
          response = await this.googleCompletion(client, model, messages, {
            systemPrompt, temperature, maxTokens, stream
          });
          inputTokens = response.usageMetadata?.promptTokenCount || 0;
          outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
          break;

        case 'aws_bedrock':
          response = await this.bedrockCompletion(client, model, messages, {
            systemPrompt, temperature, maxTokens
          });
          inputTokens = response.usage?.inputTokens || 0;
          outputTokens = response.usage?.outputTokens || 0;
          break;

        case 'cohere':
          response = await this.cohereCompletion(client, model, messages, {
            systemPrompt, temperature, maxTokens
          });
          inputTokens = response.meta?.tokens?.input_tokens || 0;
          outputTokens = response.meta?.tokens?.output_tokens || 0;
          break;

        default:
          throw new Error(`Provider ${model.provider_name} not implemented`);
      }

      const latency = Date.now() - startTime;

      // Log usage
      await this.logUsage(tenantId, {
        modelId: model.id,
        operationType: 'chat_completion',
        inputTokens,
        outputTokens,
        latencyMs: latency,
        userId,
        conversationId
      });

      const result = {
        content: this.extractContent(response, model.provider_name),
        model: model.model_id,
        provider: model.provider_name,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        latencyMs: latency,
        functionCall: this.extractFunctionCall(response, model.provider_name)
      };

      // Cache response
      if (cacheKey) {
        this.setCachedResponse(cacheKey, result);
      }

      return result;

    } catch (error) {
      console.error(`AI completion error (${model.provider_name}):`, error);

      // Try failover to another provider
      if (options._failoverAttempt !== true) {
        const fallbackModel = await this.selectModel(tenantId, {
          capability: 'chat',
          qualityTier: model.quality_tier
        });

        if (fallbackModel && fallbackModel.id !== model.id) {
          console.log(`Failing over from ${model.model_id} to ${fallbackModel.model_id}`);
          return this.chatCompletion(tenantId, messages, {
            ...options,
            model: fallbackModel,
            _failoverAttempt: true
          });
        }
      }

      throw error;
    }
  }

  // OpenAI-style completion (OpenAI, Azure, Mistral, Groq)
  async openAIStyleCompletion(client, model, messages, options) {
    const { systemPrompt, temperature, maxTokens, functions, stream } = options;

    const formattedMessages = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(...messages.map(m => ({
      role: m.role,
      content: m.content
    })));

    const params = {
      model: model.model_id,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens
    };

    if (functions && functions.length > 0) {
      params.tools = functions.map(f => ({
        type: 'function',
        function: f
      }));
    }

    if (stream) {
      return client.chat.completions.create({ ...params, stream: true });
    }

    return client.chat.completions.create(params);
  }

  // Anthropic completion
  async anthropicCompletion(client, model, messages, options) {
    const { systemPrompt, temperature, maxTokens, stream } = options;

    const formattedMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const params = {
      model: model.model_id,
      messages: formattedMessages,
      max_tokens: maxTokens,
      temperature
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (stream) {
      return client.messages.stream(params);
    }

    return client.messages.create(params);
  }

  // Google Gemini completion
  async googleCompletion(client, model, messages, options) {
    const { systemPrompt, temperature, maxTokens } = options;

    const genModel = client.getGenerativeModel({
      model: model.model_id,
      systemInstruction: systemPrompt
    });

    const chat = genModel.startChat({
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    });

    // Send all messages except the last one as history
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        await chat.sendMessage(msg.content);
      }
    }

    // Send the last message and get response
    const lastMessage = messages[messages.length - 1];
    return chat.sendMessage(lastMessage.content);
  }

  // AWS Bedrock completion
  async bedrockCompletion(client, model, messages, options) {
    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const { systemPrompt, temperature, maxTokens } = options;

    // Format for Anthropic models on Bedrock
    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const command = new InvokeModelCommand({
      modelId: model.model_id,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body)
    });

    const response = await client.send(command);
    return JSON.parse(new TextDecoder().decode(response.body));
  }

  // Cohere completion
  async cohereCompletion(client, model, messages, options) {
    const { systemPrompt, temperature, maxTokens } = options;

    const chatHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'USER' : 'CHATBOT',
      message: m.content
    }));

    const lastMessage = messages[messages.length - 1];

    return client.chat({
      model: model.model_id,
      message: lastMessage.content,
      chatHistory,
      preamble: systemPrompt,
      temperature,
      maxTokens
    });
  }

  // Extract content from different provider responses
  extractContent(response, provider) {
    switch (provider) {
      case 'openai':
      case 'azure_openai':
      case 'mistral':
      case 'groq':
        return response.choices?.[0]?.message?.content || '';
      case 'anthropic':
        return response.content?.[0]?.text || '';
      case 'google':
        return response.response?.text() || '';
      case 'aws_bedrock':
        return response.content?.[0]?.text || '';
      case 'cohere':
        return response.text || '';
      default:
        return '';
    }
  }

  // Extract function call from response
  extractFunctionCall(response, provider) {
    switch (provider) {
      case 'openai':
      case 'azure_openai':
      case 'mistral':
      case 'groq':
        const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function) {
          return {
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}')
          };
        }
        return null;
      default:
        return null;
    }
  }

  // ============== Embeddings ==============

  async createEmbedding(tenantId, text, options = {}) {
    const { modelId = null, dimension = null } = options;

    const model = await this.selectModel(tenantId, {
      modelId,
      capability: 'embeddings'
    });

    if (!model) {
      throw new Error('No embedding model available');
    }

    const client = await this.getProviderClient(tenantId, model.provider_name);
    let embedding;

    switch (model.provider_name) {
      case 'openai':
      case 'azure_openai':
        const response = await client.embeddings.create({
          model: model.model_id,
          input: text,
          dimensions: dimension || undefined
        });
        embedding = response.data[0].embedding;
        break;

      case 'cohere':
        const cohereResponse = await client.embed({
          model: model.model_id,
          texts: [text],
          inputType: 'search_document'
        });
        embedding = cohereResponse.embeddings[0];
        break;

      case 'google':
        const genModel = client.getGenerativeModel({ model: model.model_id });
        const googleResponse = await genModel.embedContent(text);
        embedding = googleResponse.embedding.values;
        break;

      default:
        throw new Error(`Embeddings not supported for ${model.provider_name}`);
    }

    return {
      embedding,
      model: model.model_id,
      provider: model.provider_name,
      dimension: embedding.length
    };
  }

  async storeEmbedding(tenantId, embedding, metadata = {}) {
    const { contentType, contentId, contentText } = metadata;

    const result = await this.db.query(`
      INSERT INTO ai_embeddings (tenant_id, content_type, content_id, content_text, embedding_vector, model_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, content_type, content_id)
      DO UPDATE SET embedding_vector = $5, content_text = $4, updated_at = NOW()
      RETURNING id
    `, [tenantId, contentType, contentId, contentText, `[${embedding.embedding.join(',')}]`, embedding.model]);

    return result.rows[0];
  }

  async searchSimilar(tenantId, queryEmbedding, options = {}) {
    const { contentType = null, limit = 10, threshold = 0.7 } = options;

    let query = `
      SELECT content_type, content_id, content_text,
             1 - (embedding_vector <=> $1) as similarity
      FROM ai_embeddings
      WHERE tenant_id = $2
    `;
    const params = [`[${queryEmbedding.join(',')}]`, tenantId];

    if (contentType) {
      params.push(contentType);
      query += ` AND content_type = $${params.length}`;
    }

    params.push(threshold);
    query += ` AND 1 - (embedding_vector <=> $1) >= $${params.length}`;

    params.push(limit);
    query += ` ORDER BY embedding_vector <=> $1 LIMIT $${params.length}`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  // ============== Prompt Templates ==============

  async getPromptTemplate(tenantId, templateName, useCase = null) {
    // Check tenant-specific templates first
    let template = await this.db.query(`
      SELECT * FROM ai_prompt_templates
      WHERE tenant_id = $1 AND name = $2 AND is_active = true
    `, [tenantId, templateName]);

    if (template.rows.length === 0) {
      // Fall back to system templates
      template = await this.db.query(`
        SELECT * FROM ai_prompt_templates
        WHERE tenant_id IS NULL AND name = $1 AND is_active = true
      `, [templateName]);
    }

    return template.rows[0] || null;
  }

  async renderPrompt(template, variables = {}) {
    let prompt = template.system_prompt || '';
    let userTemplate = template.user_prompt_template || '';

    // Replace variables in format {{variable_name}}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      prompt = prompt.replace(regex, value);
      userTemplate = userTemplate.replace(regex, value);
    }

    return { systemPrompt: prompt, userPrompt: userTemplate };
  }

  // ============== Agent Assist ==============

  async generateAgentSuggestion(tenantId, context, options = {}) {
    const {
      conversationHistory,
      customerInfo,
      kbArticles = [],
      suggestionType = 'reply'
    } = context;

    // Get appropriate prompt template
    const templateName = suggestionType === 'reply' ? 'chat_response_generator' : 'agent_coaching';
    const template = await this.getPromptTemplate(tenantId, templateName);

    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Build context for the prompt
    const variables = {
      conversation_history: conversationHistory.map(m =>
        `${m.role}: ${m.content}`
      ).join('\n'),
      customer_name: customerInfo?.name || 'Customer',
      customer_sentiment: customerInfo?.sentiment || 'neutral',
      kb_articles: kbArticles.map(a =>
        `Title: ${a.title}\nContent: ${a.content}`
      ).join('\n\n')
    };

    const { systemPrompt, userPrompt } = await this.renderPrompt(template, variables);

    // Generate suggestion
    const response = await this.chatCompletion(tenantId, [
      { role: 'user', content: userPrompt || 'Generate a helpful response based on the context.' }
    ], {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 512
    });

    // Store suggestion
    if (context.conversationId && context.agentId) {
      await this.db.query(`
        INSERT INTO ai_agent_suggestions
        (tenant_id, agent_id, conversation_id, suggestion_type, suggested_content, model_used, confidence_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tenantId, context.agentId, context.conversationId, suggestionType,
          response.content, response.model, 0.85]);
    }

    return {
      suggestion: response.content,
      model: response.model,
      provider: response.provider
    };
  }

  async summarizeConversation(tenantId, messages, options = {}) {
    const template = await this.getPromptTemplate(tenantId, 'conversation_summarization');

    const variables = {
      conversation_text: messages.map(m =>
        `${m.role}: ${m.content}`
      ).join('\n')
    };

    const { systemPrompt, userPrompt } = template
      ? await this.renderPrompt(template, variables)
      : {
          systemPrompt: 'You are a helpful assistant that summarizes conversations.',
          userPrompt: `Summarize this conversation:\n\n${variables.conversation_text}`
        };

    return this.chatCompletion(tenantId, [
      { role: 'user', content: userPrompt }
    ], {
      systemPrompt,
      temperature: 0.3,
      maxTokens: 256
    });
  }

  async analyzesentiment(tenantId, text) {
    const template = await this.getPromptTemplate(tenantId, 'sentiment_analysis');

    const variables = { text };
    const { systemPrompt, userPrompt } = template
      ? await this.renderPrompt(template, variables)
      : {
          systemPrompt: 'Analyze sentiment and return JSON with: sentiment (positive/negative/neutral), score (-1 to 1), emotions (array)',
          userPrompt: `Analyze: ${text}`
        };

    const response = await this.chatCompletion(tenantId, [
      { role: 'user', content: userPrompt }
    ], {
      systemPrompt,
      temperature: 0.1,
      maxTokens: 128
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return { sentiment: 'neutral', score: 0, raw: response.content };
    }
  }

  async classifyIntent(tenantId, text, intents = []) {
    const template = await this.getPromptTemplate(tenantId, 'intent_classification');

    const variables = {
      text,
      intents: intents.length > 0 ? intents.join(', ') : 'general inquiry, support request, complaint, feedback, sales inquiry'
    };

    const { systemPrompt, userPrompt } = template
      ? await this.renderPrompt(template, variables)
      : {
          systemPrompt: `Classify the intent of the message. Available intents: ${variables.intents}. Return JSON with: intent, confidence (0-1), reasoning`,
          userPrompt: text
        };

    const response = await this.chatCompletion(tenantId, [
      { role: 'user', content: userPrompt }
    ], {
      systemPrompt,
      temperature: 0.1,
      maxTokens: 128
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return { intent: 'unknown', confidence: 0, raw: response.content };
    }
  }

  // ============== Content Moderation ==============

  async moderateContent(tenantId, text, options = {}) {
    const { categories = ['hate', 'violence', 'sexual', 'self-harm', 'dangerous'] } = options;

    const systemPrompt = `You are a content moderation system. Analyze text for policy violations.
Categories to check: ${categories.join(', ')}
Return JSON: { flagged: boolean, categories: { [category]: { flagged: boolean, score: 0-1 } }, reasoning: string }`;

    const response = await this.chatCompletion(tenantId, [
      { role: 'user', content: `Moderate: ${text}` }
    ], {
      systemPrompt,
      temperature: 0,
      maxTokens: 256
    });

    let result;
    try {
      result = JSON.parse(response.content);
    } catch {
      result = { flagged: false, raw: response.content };
    }

    // Log moderation
    await this.db.query(`
      INSERT INTO ai_moderation_log (tenant_id, content_type, content_text, moderation_result, flagged_categories, action_taken)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      tenantId,
      options.contentType || 'message',
      text.substring(0, 500),
      result,
      result.flagged ? Object.keys(result.categories || {}).filter(c => result.categories[c]?.flagged) : [],
      result.flagged ? 'flagged' : 'approved'
    ]);

    return result;
  }

  // ============== Usage Tracking ==============

  async logUsage(tenantId, data) {
    const { modelId, operationType, inputTokens, outputTokens, latencyMs, userId, conversationId } = data;

    // Get model cost
    const model = await this.db.query('SELECT * FROM ai_models WHERE model_id = $1', [modelId]);
    const costPerInput = model.rows[0]?.cost_per_1k_input || 0;
    const costPerOutput = model.rows[0]?.cost_per_1k_output || 0;
    const totalCost = (inputTokens / 1000 * costPerInput) + (outputTokens / 1000 * costPerOutput);

    await this.db.query(`
      INSERT INTO ai_usage_log
      (tenant_id, model_id, operation_type, input_tokens, output_tokens, total_cost, latency_ms, user_id, conversation_id)
      VALUES ($1, (SELECT id FROM ai_models WHERE model_id = $2), $3, $4, $5, $6, $7, $8, $9)
    `, [tenantId, modelId, operationType, inputTokens, outputTokens, totalCost, latencyMs, userId, conversationId]);
  }

  async getUsageStats(tenantId, startDate, endDate) {
    const result = await this.db.query(`
      SELECT
        am.model_id,
        ap.display_name as provider,
        aul.operation_type,
        COUNT(*) as request_count,
        SUM(aul.input_tokens) as total_input_tokens,
        SUM(aul.output_tokens) as total_output_tokens,
        SUM(aul.total_cost) as total_cost,
        AVG(aul.latency_ms) as avg_latency_ms
      FROM ai_usage_log aul
      JOIN ai_models am ON aul.model_id = am.id
      JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE aul.tenant_id = $1
        AND aul.created_at BETWEEN $2 AND $3
      GROUP BY am.model_id, ap.display_name, aul.operation_type
      ORDER BY total_cost DESC
    `, [tenantId, startDate, endDate]);

    return result.rows;
  }

  // ============== Caching ==============

  generateCacheKey(prefix, data) {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
    return `${prefix}_${hash}`;
  }

  getCachedResponse(key) {
    const cached = this.responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.data;
    }
    this.responseCache.delete(key);
    return null;
  }

  setCachedResponse(key, data) {
    this.responseCache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Cleanup old entries
    if (this.responseCache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.responseCache.entries()) {
        if (now - v.timestamp > this.cacheMaxAge) {
          this.responseCache.delete(k);
        }
      }
    }
  }

  // ============== Chatbot Management ==============

  async getChatbot(tenantId, chatbotId) {
    const result = await this.db.query(`
      SELECT c.*, am.model_id, ap.name as provider_name
      FROM ai_chatbots c
      LEFT JOIN ai_models am ON c.model_id = am.id
      LEFT JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE c.id = $1 AND c.tenant_id = $2
    `, [chatbotId, tenantId]);

    return result.rows[0] || null;
  }

  async processChatbotMessage(tenantId, chatbotId, sessionId, message, options = {}) {
    const chatbot = await this.getChatbot(tenantId, chatbotId);
    if (!chatbot) {
      throw new Error('Chatbot not found');
    }

    // Get conversation history
    const history = await this.db.query(`
      SELECT role, content FROM ai_conversation_messages
      WHERE conversation_id = (
        SELECT id FROM ai_conversations WHERE session_id = $1 AND chatbot_id = $2
      )
      ORDER BY created_at ASC
      LIMIT 20
    `, [sessionId, chatbotId]);

    const messages = history.rows.length > 0
      ? [...history.rows, { role: 'user', content: message }]
      : [{ role: 'user', content: message }];

    // Get or create conversation
    let conversation = await this.db.query(`
      SELECT id FROM ai_conversations WHERE session_id = $1 AND chatbot_id = $2
    `, [sessionId, chatbotId]);

    if (conversation.rows.length === 0) {
      conversation = await this.db.query(`
        INSERT INTO ai_conversations (tenant_id, chatbot_id, session_id, channel)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [tenantId, chatbotId, sessionId, options.channel || 'web']);
    }

    const conversationId = conversation.rows[0].id;

    // Store user message
    await this.db.query(`
      INSERT INTO ai_conversation_messages (conversation_id, role, content)
      VALUES ($1, 'user', $2)
    `, [conversationId, message]);

    // Generate response
    const response = await this.chatCompletion(tenantId, messages, {
      systemPrompt: chatbot.system_prompt,
      temperature: chatbot.temperature,
      maxTokens: chatbot.max_tokens,
      model: chatbot.model_id ? { id: chatbot.model_id, model_id: chatbot.model_id, provider_name: chatbot.provider_name } : null,
      conversationId
    });

    // Store assistant response
    await this.db.query(`
      INSERT INTO ai_conversation_messages (conversation_id, role, content, tokens_used)
      VALUES ($1, 'assistant', $2, $3)
    `, [conversationId, response.content, response.usage.totalTokens]);

    // Update conversation
    await this.db.query(`
      UPDATE ai_conversations
      SET message_count = message_count + 2,
          total_tokens = total_tokens + $1,
          last_message_at = NOW()
      WHERE id = $2
    `, [response.usage.totalTokens, conversationId]);

    return {
      response: response.content,
      conversationId,
      usage: response.usage
    };
  }

  // ============== Function Calling ==============

  async registerFunction(tenantId, functionDef) {
    const { name, description, parameters, endpoint, httpMethod = 'POST', headers = {} } = functionDef;

    const result = await this.db.query(`
      INSERT INTO ai_functions (tenant_id, name, description, parameters_schema, endpoint, http_method, headers)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, name) DO UPDATE SET
        description = $3, parameters_schema = $4, endpoint = $5, http_method = $6, headers = $7
      RETURNING id
    `, [tenantId, name, description, parameters, endpoint, httpMethod, headers]);

    return result.rows[0];
  }

  async getFunctions(tenantId) {
    const result = await this.db.query(`
      SELECT * FROM ai_functions WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);

    return result.rows.map(f => ({
      name: f.name,
      description: f.description,
      parameters: f.parameters_schema
    }));
  }

  async executeFunction(tenantId, functionName, args) {
    const func = await this.db.query(`
      SELECT * FROM ai_functions WHERE tenant_id = $1 AND name = $2 AND is_active = true
    `, [tenantId, functionName]);

    if (func.rows.length === 0) {
      throw new Error(`Function ${functionName} not found`);
    }

    const { endpoint, http_method, headers } = func.rows[0];

    // Execute the function via HTTP
    const response = await fetch(endpoint, {
      method: http_method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(args)
    });

    return response.json();
  }
}

// Factory function
export function createAIEngineService(db) {
  return new AIEngineService(db);
}

export default AIEngineService;
