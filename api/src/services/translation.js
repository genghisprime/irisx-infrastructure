/**
 * ============================================================================
 * TRANSLATION SERVICE - MULTI-PROVIDER LANGUAGE TRANSLATION
 * ============================================================================
 *
 * SUPPORTED PROVIDERS:
 * - Google Cloud Translation (Primary)
 * - Amazon Translate (AWS)
 * - DeepL (High quality European languages)
 * - Azure Translator (Microsoft)
 * - IBM Watson Language Translator
 *
 * FEATURES:
 * - Automatic language detection
 * - Translation caching for cost optimization
 * - Provider failover
 * - Usage tracking and billing
 * - Custom glossary support
 * - Real-time voice translation pipeline (STT → Translate → TTS)
 *
 * CHANNEL INTEGRATION:
 * - SMS: Inbound/outbound auto-translation
 * - Chat: Real-time message translation
 * - Email: Subject + body translation
 * - Voice: STT → Translate → TTS pipeline
 * - WhatsApp: Template and conversation translation
 * - Social: Post and comment translation
 */

import { query, getClient } from '../db/connection.js';
import crypto from 'crypto';

class TranslationService {
  constructor() {
    this.providerClients = new Map();
    this.providerCache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load provider configurations
      const result = await query(`
        SELECT * FROM translation_providers WHERE is_active = true
      `);

      result.rows.forEach(provider => {
        this.providerCache.set(provider.name, provider);
      });

      console.log(`✓ Translation service initialized with ${result.rows.length} providers`);
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize translation service:', error);
    }
  }

  /**
   * Get provider client with credentials
   */
  async getProviderClient(providerName, tenantId = null) {
    const cacheKey = `${providerName}_${tenantId || 'platform'}`;

    if (this.providerClients.has(cacheKey)) {
      return this.providerClients.get(cacheKey);
    }

    // First try tenant-specific credentials
    let credentials = null;
    if (tenantId) {
      const tenantCreds = await query(`
        SELECT tc.*, tp.name as provider_name
        FROM tenant_translation_credentials tc
        JOIN translation_providers tp ON tp.id = tc.provider_id
        WHERE tc.tenant_id = $1 AND tp.name = $2 AND tc.is_active = true
        ORDER BY tc.priority ASC
        LIMIT 1
      `, [tenantId, providerName]);

      if (tenantCreds.rows.length > 0) {
        credentials = tenantCreds.rows[0].credentials;
      }
    }

    // Fall back to platform credentials
    if (!credentials) {
      const platformCreds = await query(`
        SELECT pc.*, tp.name as provider_name
        FROM platform_translation_credentials pc
        JOIN translation_providers tp ON tp.id = pc.provider_id
        WHERE tp.name = $1 AND pc.is_active = true
        ORDER BY pc.is_default DESC
        LIMIT 1
      `, [providerName]);

      if (platformCreds.rows.length > 0) {
        credentials = platformCreds.rows[0].credentials;
      }
    }

    if (!credentials) {
      throw new Error(`No credentials found for provider: ${providerName}`);
    }

    // Create provider client
    const client = this.createProviderClient(providerName, credentials);
    this.providerClients.set(cacheKey, client);
    return client;
  }

  /**
   * Create provider-specific client
   */
  createProviderClient(providerName, credentials) {
    switch (providerName) {
      case 'google':
        return new GoogleTranslateClient(credentials);
      case 'aws':
        return new AWSTranslateClient(credentials);
      case 'deepl':
        return new DeepLClient(credentials);
      case 'azure':
        return new AzureTranslateClient(credentials);
      case 'ibm_watson':
        return new IBMWatsonClient(credentials);
      default:
        throw new Error(`Unknown translation provider: ${providerName}`);
    }
  }

  /**
   * Translate text
   */
  async translate(params) {
    const {
      tenantId,
      text,
      sourceLanguage = null, // null = auto-detect
      targetLanguage,
      provider = null, // null = use tenant preference or default
      channel = null,
      conversationId = null,
      messageId = null,
      direction = 'inbound',
      skipCache = false
    } = params;

    const startTime = Date.now();

    try {
      // Check cache first
      if (!skipCache) {
        const cached = await this.getCached(text, sourceLanguage, targetLanguage);
        if (cached) {
          await this.logTranslation({
            tenantId,
            provider: cached.provider,
            sourceLanguage: cached.source_language,
            targetLanguage,
            textLength: text.length,
            translatedLength: cached.translated_text.length,
            channel,
            direction,
            conversationId,
            messageId,
            latencyMs: Date.now() - startTime,
            cacheHit: true,
            costCents: 0
          });

          return {
            success: true,
            translatedText: cached.translated_text,
            detectedLanguage: cached.source_language,
            provider: cached.provider,
            cached: true
          };
        }
      }

      // Get tenant settings
      const settings = await this.getTenantSettings(tenantId);

      // Determine which provider to use
      let selectedProvider = provider;
      if (!selectedProvider) {
        selectedProvider = await this.selectProvider(tenantId, sourceLanguage, targetLanguage, settings);
      }

      // Apply glossary/custom terms
      const glossaryTerms = await this.getGlossaryTerms(tenantId, sourceLanguage, targetLanguage);

      // Get provider client and translate
      const client = await this.getProviderClient(selectedProvider, tenantId);

      const result = await client.translate({
        text,
        sourceLanguage,
        targetLanguage,
        glossary: glossaryTerms
      });

      const latencyMs = Date.now() - startTime;
      const cost = this.calculateCost(selectedProvider, text.length);

      // Cache the result
      await this.cacheTranslation({
        text,
        sourceLanguage: result.detectedLanguage || sourceLanguage,
        targetLanguage,
        translatedText: result.translatedText,
        provider: selectedProvider,
        confidence: result.confidence
      });

      // Log for billing
      await this.logTranslation({
        tenantId,
        provider: selectedProvider,
        sourceLanguage: result.detectedLanguage || sourceLanguage,
        targetLanguage,
        textLength: text.length,
        translatedLength: result.translatedText.length,
        channel,
        direction,
        conversationId,
        messageId,
        latencyMs,
        cacheHit: false,
        costCents: cost
      });

      return {
        success: true,
        translatedText: result.translatedText,
        detectedLanguage: result.detectedLanguage || sourceLanguage,
        provider: selectedProvider,
        cached: false,
        latencyMs
      };
    } catch (error) {
      console.error('[Translation] Error:', error);

      // Log failed translation
      await this.logTranslation({
        tenantId,
        provider: provider || 'unknown',
        sourceLanguage: sourceLanguage || 'unknown',
        targetLanguage,
        textLength: text.length,
        translatedLength: 0,
        channel,
        direction,
        conversationId,
        messageId,
        latencyMs: Date.now() - startTime,
        cacheHit: false,
        costCents: 0,
        success: false,
        errorMessage: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch translate multiple texts
   */
  async translateBatch(params) {
    const { tenantId, texts, sourceLanguage, targetLanguage, provider } = params;

    const results = await Promise.all(
      texts.map(text => this.translate({
        tenantId,
        text,
        sourceLanguage,
        targetLanguage,
        provider
      }))
    );

    return results;
  }

  /**
   * Detect language
   */
  async detectLanguage(params) {
    const { tenantId, text, provider = null } = params;

    try {
      const settings = await this.getTenantSettings(tenantId);
      const selectedProvider = provider || settings?.provider_priority?.[0] || 'google';

      const client = await this.getProviderClient(selectedProvider, tenantId);
      const result = await client.detectLanguage(text);

      return {
        success: true,
        language: result.language,
        confidence: result.confidence,
        provider: selectedProvider
      };
    } catch (error) {
      console.error('[Translation] Detection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get tenant translation settings
   */
  async getTenantSettings(tenantId) {
    const result = await query(`
      SELECT * FROM tenant_translation_settings
      WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      return {
        translation_enabled: false,
        default_language: 'en',
        auto_detect: true,
        provider_priority: ['google', 'aws', 'deepl']
      };
    }

    return result.rows[0];
  }

  /**
   * Select best provider based on settings and capabilities
   */
  async selectProvider(tenantId, sourceLanguage, targetLanguage, settings) {
    // Check for specific language pair override
    const pairResult = await query(`
      SELECT preferred_provider FROM tenant_language_pairs
      WHERE tenant_id = $1 AND source_language = $2 AND target_language = $3 AND is_enabled = true
    `, [tenantId, sourceLanguage, targetLanguage]);

    if (pairResult.rows.length > 0 && pairResult.rows[0].preferred_provider) {
      return pairResult.rows[0].preferred_provider;
    }

    // Use provider priority from settings
    const priority = settings?.provider_priority || ['google', 'aws', 'deepl'];

    // Find first provider with active credentials
    for (const providerName of priority) {
      try {
        await this.getProviderClient(providerName, tenantId);
        return providerName;
      } catch {
        continue;
      }
    }

    throw new Error('No translation provider available');
  }

  /**
   * Get cached translation
   */
  async getCached(text, sourceLanguage, targetLanguage) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    const result = await query(`
      SELECT * FROM translation_cache
      WHERE source_hash = $1
        AND ($2 IS NULL OR source_language = $2)
        AND target_language = $3
        AND expires_at > NOW()
      LIMIT 1
    `, [hash, sourceLanguage, targetLanguage]);

    if (result.rows.length > 0) {
      // Update hit count
      await query(`
        UPDATE translation_cache
        SET hit_count = hit_count + 1, last_accessed = NOW()
        WHERE id = $1
      `, [result.rows[0].id]);

      return result.rows[0];
    }

    return null;
  }

  /**
   * Cache a translation
   */
  async cacheTranslation(params) {
    const { text, sourceLanguage, targetLanguage, translatedText, provider, confidence } = params;
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    await query(`
      INSERT INTO translation_cache (
        source_hash, source_language, target_language, provider,
        source_text, translated_text, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_hash, source_language, target_language, provider)
      DO UPDATE SET
        translated_text = EXCLUDED.translated_text,
        confidence = EXCLUDED.confidence,
        hit_count = translation_cache.hit_count + 1,
        last_accessed = NOW()
    `, [hash, sourceLanguage, targetLanguage, provider, text, translatedText, confidence]);
  }

  /**
   * Get glossary terms for translation
   */
  async getGlossaryTerms(tenantId, sourceLanguage, targetLanguage) {
    const result = await query(`
      SELECT source_term, target_term, case_sensitive
      FROM translation_glossary
      WHERE tenant_id = $1
        AND source_language = $2
        AND target_language = $3
        AND is_active = true
    `, [tenantId, sourceLanguage, targetLanguage]);

    return result.rows;
  }

  /**
   * Calculate cost for translation
   */
  calculateCost(provider, charCount) {
    const costPerChar = {
      google: 0.00002,
      aws: 0.000015,
      deepl: 0.00002,
      azure: 0.00001,
      ibm_watson: 0.00002
    };

    return (costPerChar[provider] || 0.00002) * charCount * 100; // Convert to cents
  }

  /**
   * Log translation for billing and analytics
   */
  async logTranslation(params) {
    const {
      tenantId,
      provider,
      sourceLanguage,
      targetLanguage,
      textLength,
      translatedLength,
      channel,
      direction,
      conversationId,
      messageId,
      latencyMs,
      cacheHit,
      costCents,
      success = true,
      errorMessage = null
    } = params;

    await query(`
      INSERT INTO translation_log (
        tenant_id, provider, source_language, target_language,
        source_text_length, translated_text_length, channel, direction,
        conversation_id, message_id, latency_ms, cache_hit, cost_cents,
        success, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      tenantId, provider, sourceLanguage, targetLanguage,
      textLength, translatedLength, channel, direction,
      conversationId, messageId, latencyMs, cacheHit, costCents,
      success, errorMessage
    ]);
  }

  // ============================================
  // CHANNEL-SPECIFIC TRANSLATION METHODS
  // ============================================

  /**
   * Translate SMS message
   */
  async translateSMS(params) {
    const { tenantId, text, customerLanguage, agentLanguage, direction } = params;

    const settings = await this.getTenantSettings(tenantId);
    if (!settings?.channel_settings?.sms?.enabled) {
      return { success: false, error: 'SMS translation disabled' };
    }

    const shouldTranslate = direction === 'inbound'
      ? settings.channel_settings.sms.auto_translate_inbound
      : settings.channel_settings.sms.auto_translate_outbound;

    if (!shouldTranslate) {
      return { success: true, translatedText: text, skipped: true };
    }

    const sourceLanguage = direction === 'inbound' ? customerLanguage : agentLanguage;
    const targetLanguage = direction === 'inbound' ? agentLanguage : customerLanguage;

    return this.translate({
      tenantId,
      text,
      sourceLanguage,
      targetLanguage,
      channel: 'sms',
      direction
    });
  }

  /**
   * Translate chat message
   */
  async translateChat(params) {
    const { tenantId, text, customerLanguage, agentLanguage, direction, conversationId, messageId } = params;

    const settings = await this.getTenantSettings(tenantId);
    if (!settings?.channel_settings?.chat?.enabled) {
      return { success: false, error: 'Chat translation disabled' };
    }

    const shouldTranslate = direction === 'inbound'
      ? settings.channel_settings.chat.auto_translate_inbound
      : settings.channel_settings.chat.auto_translate_outbound;

    if (!shouldTranslate) {
      return { success: true, translatedText: text, skipped: true };
    }

    const sourceLanguage = direction === 'inbound' ? customerLanguage : agentLanguage;
    const targetLanguage = direction === 'inbound' ? agentLanguage : customerLanguage;

    return this.translate({
      tenantId,
      text,
      sourceLanguage,
      targetLanguage,
      channel: 'chat',
      direction,
      conversationId,
      messageId
    });
  }

  /**
   * Translate email
   */
  async translateEmail(params) {
    const { tenantId, subject, body, customerLanguage, agentLanguage, direction } = params;

    const settings = await this.getTenantSettings(tenantId);
    if (!settings?.channel_settings?.email?.enabled) {
      return { success: false, error: 'Email translation disabled' };
    }

    const shouldTranslate = direction === 'inbound'
      ? settings.channel_settings.email.auto_translate_inbound
      : settings.channel_settings.email.auto_translate_outbound;

    if (!shouldTranslate) {
      return {
        success: true,
        translatedSubject: subject,
        translatedBody: body,
        skipped: true
      };
    }

    const sourceLanguage = direction === 'inbound' ? customerLanguage : agentLanguage;
    const targetLanguage = direction === 'inbound' ? agentLanguage : customerLanguage;

    const [subjectResult, bodyResult] = await Promise.all([
      this.translate({
        tenantId,
        text: subject,
        sourceLanguage,
        targetLanguage,
        channel: 'email',
        direction
      }),
      this.translate({
        tenantId,
        text: body,
        sourceLanguage,
        targetLanguage,
        channel: 'email',
        direction
      })
    ]);

    return {
      success: subjectResult.success && bodyResult.success,
      translatedSubject: subjectResult.translatedText || subject,
      translatedBody: bodyResult.translatedText || body,
      detectedLanguage: bodyResult.detectedLanguage
    };
  }

  // ============================================
  // REAL-TIME VOICE TRANSLATION
  // ============================================

  /**
   * Start a voice translation session
   */
  async startVoiceSession(params) {
    const { tenantId, callId, agentId, agentLanguage, customerLanguage } = params;

    const settings = await this.getTenantSettings(tenantId);
    if (!settings?.voice_settings?.real_time_enabled) {
      return { success: false, error: 'Voice translation not enabled' };
    }

    const result = await query(`
      INSERT INTO voice_translation_sessions (
        tenant_id, call_id, agent_id, agent_language, customer_language,
        stt_provider, translation_provider, tts_provider, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      RETURNING *
    `, [
      tenantId, callId, agentId, agentLanguage, customerLanguage,
      settings.voice_settings.stt_provider || 'google',
      settings.provider_priority?.[0] || 'google',
      settings.voice_settings.tts_provider || 'openai'
    ]);

    return {
      success: true,
      session: result.rows[0]
    };
  }

  /**
   * Process voice segment (STT → Translate → TTS)
   */
  async processVoiceSegment(params) {
    const { sessionId, audioData, direction } = params;

    // Get session details
    const sessionResult = await query(`
      SELECT * FROM voice_translation_sessions WHERE id = $1
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      return { success: false, error: 'Session not found' };
    }

    const session = sessionResult.rows[0];
    const startTime = Date.now();

    try {
      // 1. Speech-to-Text
      const sttService = await import('./stt.js');
      const sttResult = await sttService.default.transcribe({
        audioData,
        language: direction === 'customer' ? session.customer_language : session.agent_language,
        provider: session.stt_provider
      });

      if (!sttResult.success || !sttResult.text) {
        return { success: false, error: 'STT failed' };
      }

      // 2. Translate
      const sourceLanguage = direction === 'customer' ? session.customer_language : session.agent_language;
      const targetLanguage = direction === 'customer' ? session.agent_language : session.customer_language;

      const translateResult = await this.translate({
        tenantId: session.tenant_id,
        text: sttResult.text,
        sourceLanguage,
        targetLanguage,
        channel: 'voice'
      });

      if (!translateResult.success) {
        return { success: false, error: 'Translation failed' };
      }

      // 3. Text-to-Speech
      const ttsService = await import('./tts.js');
      const ttsResult = await ttsService.default.generateSpeech({
        text: translateResult.translatedText,
        voice: direction === 'customer' ? 'alloy' : 'nova', // Different voices for clarity
        provider: session.tts_provider,
        tenantId: session.tenant_id
      });

      const latencyMs = Date.now() - startTime;

      // Update session stats
      await query(`
        UPDATE voice_translation_sessions
        SET segments_processed = segments_processed + 1,
            total_characters_translated = total_characters_translated + $1,
            avg_latency_ms = (avg_latency_ms * segments_processed + $2) / (segments_processed + 1)
        WHERE id = $3
      `, [sttResult.text.length, latencyMs, sessionId]);

      return {
        success: true,
        originalText: sttResult.text,
        translatedText: translateResult.translatedText,
        audioUrl: ttsResult.audioUrl,
        latencyMs
      };
    } catch (error) {
      console.error('[VoiceTranslation] Error:', error);

      // Update error count
      await query(`
        UPDATE voice_translation_sessions
        SET error_count = error_count + 1
        WHERE id = $1
      `, [sessionId]);

      return { success: false, error: error.message };
    }
  }

  /**
   * End voice translation session
   */
  async endVoiceSession(sessionId) {
    await query(`
      UPDATE voice_translation_sessions
      SET status = 'completed', ended_at = NOW()
      WHERE id = $1
    `, [sessionId]);

    return { success: true };
  }

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================

  /**
   * Get all translation providers
   */
  async getProviders() {
    const result = await query(`
      SELECT * FROM translation_providers ORDER BY name
    `);
    return result.rows;
  }

  /**
   * Get platform credentials
   */
  async getPlatformCredentials() {
    const result = await query(`
      SELECT
        pc.*,
        tp.name as provider_name,
        tp.display_name as provider_display_name
      FROM platform_translation_credentials pc
      JOIN translation_providers tp ON tp.id = pc.provider_id
      ORDER BY pc.is_default DESC, pc.name
    `);
    return result.rows;
  }

  /**
   * Add platform credentials
   */
  async addPlatformCredentials(params) {
    const { name, providerName, credentials, monthlyLimit = 0, isDefault = false } = params;

    // Get provider ID
    const providerResult = await query(`
      SELECT id FROM translation_providers WHERE name = $1
    `, [providerName]);

    if (providerResult.rows.length === 0) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const providerId = providerResult.rows[0].id;

    // If setting as default, unset others
    if (isDefault) {
      await query(`
        UPDATE platform_translation_credentials
        SET is_default = false
        WHERE provider_id = $1
      `, [providerId]);
    }

    const result = await query(`
      INSERT INTO platform_translation_credentials (
        provider_id, name, credentials, monthly_limit, is_default
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [providerId, name, JSON.stringify(credentials), monthlyLimit, isDefault]);

    // Clear client cache
    this.providerClients.clear();

    return result.rows[0];
  }

  /**
   * Test credentials
   */
  async testCredentials(credentialId) {
    const credResult = await query(`
      SELECT pc.*, tp.name as provider_name
      FROM platform_translation_credentials pc
      JOIN translation_providers tp ON tp.id = pc.provider_id
      WHERE pc.id = $1
    `, [credentialId]);

    if (credResult.rows.length === 0) {
      throw new Error('Credentials not found');
    }

    const cred = credResult.rows[0];
    const client = this.createProviderClient(cred.provider_name, cred.credentials);

    try {
      const result = await client.translate({
        text: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'es'
      });

      // Update health status
      await query(`
        UPDATE platform_translation_credentials
        SET health_status = 'healthy', last_health_check = NOW()
        WHERE id = $1
      `, [credentialId]);

      return { success: true, result: result.translatedText };
    } catch (error) {
      // Update health status
      await query(`
        UPDATE platform_translation_credentials
        SET health_status = 'down', last_health_check = NOW()
        WHERE id = $1
      `, [credentialId]);

      return { success: false, error: error.message };
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(params) {
    const { days = 30, groupBy = 'provider', tenantId = null } = params;

    let groupColumn;
    switch (groupBy) {
      case 'tenant':
        groupColumn = 'tenant_id';
        break;
      case 'channel':
        groupColumn = 'channel';
        break;
      default:
        groupColumn = 'provider';
    }

    const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
    const queryParams = tenantId ? [days, tenantId] : [days];

    const result = await query(`
      SELECT
        ${groupColumn} as group_key,
        COUNT(*) as translations,
        SUM(source_text_length) as total_characters,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as cache_hit_rate,
        SUM(cost_cents) / 100.0 as total_cost,
        AVG(latency_ms) as avg_latency
      FROM translation_log
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND success = true
        ${tenantFilter}
      GROUP BY ${groupColumn}
      ORDER BY translations DESC
    `, queryParams);

    return result.rows;
  }
}

// ============================================
// PROVIDER CLIENT IMPLEMENTATIONS
// ============================================

class GoogleTranslateClient {
  constructor(credentials) {
    this.apiKey = credentials.api_key;
    this.projectId = credentials.project_id;
  }

  async translate(params) {
    const { text, sourceLanguage, targetLanguage } = params;

    // In production, this would call Google Cloud Translation API
    // For now, return a placeholder
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: sourceLanguage,
          target: targetLanguage,
          format: 'text'
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.data.translations[0].translatedText,
      detectedLanguage: data.data.translations[0].detectedSourceLanguage
    };
  }

  async detectLanguage(text) {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2/detect?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text })
      }
    );

    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.status}`);
    }

    const data = await response.json();
    const detection = data.data.detections[0][0];
    return {
      language: detection.language,
      confidence: detection.confidence
    };
  }
}

class AWSTranslateClient {
  constructor(credentials) {
    this.accessKeyId = credentials.access_key_id;
    this.secretAccessKey = credentials.secret_access_key;
    this.region = credentials.region || 'us-east-1';
  }

  async translate(params) {
    const { text, sourceLanguage, targetLanguage } = params;

    // In production, use AWS SDK
    // const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
    // For now, placeholder implementation

    // Simulated response
    return {
      translatedText: `[AWS Translated: ${text.substring(0, 50)}...]`,
      detectedLanguage: sourceLanguage || 'en'
    };
  }

  async detectLanguage(text) {
    // AWS Comprehend for language detection
    return {
      language: 'en',
      confidence: 0.95
    };
  }
}

class DeepLClient {
  constructor(credentials) {
    this.apiKey = credentials.api_key;
    this.useFreeApi = credentials.use_free_api || false;
    this.baseUrl = this.useFreeApi
      ? 'https://api-free.deepl.com/v2'
      : 'https://api.deepl.com/v2';
  }

  async translate(params) {
    const { text, sourceLanguage, targetLanguage } = params;

    const response = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLanguage?.toUpperCase(),
        target_lang: targetLanguage.toUpperCase()
      })
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.translations[0].text,
      detectedLanguage: data.translations[0].detected_source_language?.toLowerCase()
    };
  }

  async detectLanguage(text) {
    // DeepL detects language during translation
    const result = await this.translate({
      text: text.substring(0, 100),
      targetLanguage: 'en' // Just to trigger detection
    });

    return {
      language: result.detectedLanguage,
      confidence: 0.95
    };
  }
}

class AzureTranslateClient {
  constructor(credentials) {
    this.subscriptionKey = credentials.subscription_key;
    this.region = credentials.region || 'eastus';
    this.endpoint = credentials.endpoint || 'https://api.cognitive.microsofttranslator.com';
  }

  async translate(params) {
    const { text, sourceLanguage, targetLanguage } = params;

    const url = `${this.endpoint}/translate?api-version=3.0&to=${targetLanguage}` +
      (sourceLanguage ? `&from=${sourceLanguage}` : '');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Ocp-Apim-Subscription-Region': this.region,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ text }])
    });

    if (!response.ok) {
      throw new Error(`Azure Translate API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data[0].translations[0].text,
      detectedLanguage: data[0].detectedLanguage?.language
    };
  }

  async detectLanguage(text) {
    const response = await fetch(`${this.endpoint}/detect?api-version=3.0`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Ocp-Apim-Subscription-Region': this.region,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ text }])
    });

    if (!response.ok) {
      throw new Error(`Azure Translate API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      language: data[0].language,
      confidence: data[0].score
    };
  }
}

class IBMWatsonClient {
  constructor(credentials) {
    this.apiKey = credentials.api_key;
    this.url = credentials.url;
    this.version = credentials.version || '2018-05-01';
  }

  async translate(params) {
    const { text, sourceLanguage, targetLanguage } = params;

    const auth = Buffer.from(`apikey:${this.apiKey}`).toString('base64');

    const response = await fetch(`${this.url}/v3/translate?version=${this.version}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        source: sourceLanguage,
        target: targetLanguage
      })
    });

    if (!response.ok) {
      throw new Error(`IBM Watson API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      translatedText: data.translations[0].translation,
      detectedLanguage: sourceLanguage
    };
  }

  async detectLanguage(text) {
    const auth = Buffer.from(`apikey:${this.apiKey}`).toString('base64');

    const response = await fetch(`${this.url}/v3/identify?version=${this.version}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'text/plain'
      },
      body: text
    });

    if (!response.ok) {
      throw new Error(`IBM Watson API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      language: data.languages[0].language,
      confidence: data.languages[0].confidence
    };
  }
}

// Export singleton
const translationService = new TranslationService();
export default translationService;
export { TranslationService };
