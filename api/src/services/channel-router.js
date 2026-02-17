/**
 * ============================================================================
 * UNIFIED CHANNEL ROUTER SERVICE
 * ============================================================================
 *
 * CRITICAL ABSTRACTION LAYER:
 * ---------------------------
 * This service provides a UNIFIED API for all channel types (TTS, STT, SMS,
 * Email, Voice/Carrier) while hiding provider details from customers.
 *
 * CUSTOMER-FACING ABSTRACTION:
 * - Customers use IRISX voice names (aria, marcus, elena) NOT provider names
 * - Customers never see "openai", "elevenlabs", "twilio" in their API responses
 * - IRISX maintains provider relationships internally
 *
 * FEATURES:
 * - Automatic LCR (Least Cost Routing) based on health, cost, priority
 * - Provider failover on errors
 * - Health score tracking per provider
 * - Usage logging for billing (without exposing providers to customer)
 * - Unified interface across all channel types
 *
 * Phase: Unified Provider Abstraction
 * Created: 2026-02-16
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

class ChannelRouter {
  constructor() {
    // Provider adapters (lazy-loaded)
    this.adapters = {};

    // Health check intervals (ms)
    this.healthCheckInterval = 60000; // 1 minute

    // Cache for provider credentials (short TTL)
    this.credentialCache = new Map();
    this.credentialCacheTTL = 300000; // 5 minutes

    // Encryption key for credentials
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'change-this-key-in-production';
  }

  // ==========================================================================
  // VOICE CATALOG (TTS)
  // ==========================================================================

  /**
   * Get unified voice by customer-facing code
   * Customers use codes like "aria", "marcus" - never provider-specific IDs
   *
   * @param {string} voiceCode - Customer-facing voice code
   * @returns {Promise<Object>} Voice configuration with provider mapping
   */
  async getVoice(voiceCode) {
    const result = await query(
      `SELECT * FROM voice_catalog WHERE voice_code = $1 AND is_active = true`,
      [voiceCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`Voice '${voiceCode}' not found`);
    }

    return result.rows[0];
  }

  /**
   * List all available voices for customers
   * Returns only customer-facing info, hides provider details
   *
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of voices
   */
  async listVoices(filters = {}) {
    let whereConditions = ['is_active = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (filters.quality_tier) {
      whereConditions.push(`quality_tier = $${paramIndex}`);
      queryParams.push(filters.quality_tier);
      paramIndex++;
    }

    if (filters.gender) {
      whereConditions.push(`gender = $${paramIndex}`);
      queryParams.push(filters.gender);
      paramIndex++;
    }

    if (filters.language) {
      whereConditions.push(`language = $${paramIndex}`);
      queryParams.push(filters.language);
      paramIndex++;
    }

    const result = await query(
      `SELECT
        voice_code,
        display_name,
        description,
        quality_tier,
        gender,
        language,
        style,
        sample_text
       FROM voice_catalog
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY quality_tier DESC, display_name ASC`,
      queryParams
    );

    // Note: primary_provider and primary_voice_id are NOT returned to customers
    return result.rows;
  }

  /**
   * Select the best TTS provider for a voice using LCR
   * Considers: health score, cost, priority, availability
   *
   * @param {string} voiceCode - Customer-facing voice code
   * @param {number} tenantId - Optional tenant ID for tenant-specific routing
   * @returns {Promise<Object>} Selected provider with credentials
   */
  async selectTTSProvider(voiceCode, tenantId = null) {
    const voice = await this.getVoice(voiceCode);

    // Use PostgreSQL function for LCR selection
    const result = await query(
      `SELECT * FROM select_tts_provider($1, $2, 30)`,
      [voiceCode, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error(`No available TTS provider for voice '${voiceCode}'`);
    }

    const selected = result.rows[0];

    // Get decrypted credentials
    const credentials = await this.getProviderCredentials(selected.provider_id);

    return {
      providerId: selected.provider_id,
      providerName: selected.provider_name,
      voiceId: selected.voice_id,
      costPer1kChars: selected.cost_per_1k_chars,
      healthScore: selected.health_score,
      credentials
    };
  }

  /**
   * Get fallback providers for a voice
   *
   * @param {string} voiceCode - Voice code
   * @returns {Promise<Array>} List of fallback providers in priority order
   */
  async getTTSFallbacks(voiceCode) {
    const result = await query(
      `SELECT * FROM get_tts_fallbacks($1)`,
      [voiceCode]
    );
    return result.rows;
  }

  // ==========================================================================
  // SMS PROVIDER ROUTING
  // ==========================================================================

  /**
   * Select the best SMS provider using LCR
   *
   * @param {string} destinationCountry - ISO country code
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Selected provider
   */
  async selectSMSProvider(destinationCountry, tenantId) {
    // First try tenant-specific providers
    let result = await query(
      `SELECT mp.*, crr.cost_multiplier
       FROM messaging_providers mp
       LEFT JOIN channel_routing_rules crr ON mp.id = crr.provider_id
       WHERE mp.provider_type = 'sms'
         AND mp.is_active = true
         AND COALESCE(mp.health_score, 100) >= 30
         AND (mp.tenant_id = $1 OR mp.tenant_id IS NULL)
         AND mp.deleted_at IS NULL
       ORDER BY
         CASE WHEN mp.tenant_id = $1 THEN 0 ELSE 1 END,
         COALESCE(mp.health_score, 100) DESC,
         COALESCE(mp.cost_per_unit, 999) ASC,
         COALESCE(mp.priority, 50) ASC
       LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('No available SMS provider');
    }

    const provider = result.rows[0];
    const credentials = await this.getProviderCredentials(provider.id);

    return {
      providerId: provider.id,
      providerName: provider.provider_name,
      costPerMessage: provider.cost_per_unit,
      healthScore: provider.health_score,
      credentials
    };
  }

  /**
   * Get SMS fallback providers
   */
  async getSMSFallbacks(tenantId) {
    const result = await query(
      `SELECT mp.*
       FROM messaging_providers mp
       WHERE mp.provider_type = 'sms'
         AND mp.is_active = true
         AND COALESCE(mp.health_score, 100) >= 30
         AND (mp.tenant_id = $1 OR mp.tenant_id IS NULL)
         AND mp.deleted_at IS NULL
       ORDER BY
         CASE WHEN mp.tenant_id = $1 THEN 0 ELSE 1 END,
         COALESCE(mp.health_score, 100) DESC,
         COALESCE(mp.priority, 50) ASC`,
      [tenantId]
    );
    return result.rows;
  }

  // ==========================================================================
  // EMAIL PROVIDER ROUTING
  // ==========================================================================

  /**
   * Select the best email provider using LCR
   *
   * @param {string} emailType - Type: transactional, marketing, bulk
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Selected provider
   */
  async selectEmailProvider(emailType, tenantId) {
    const result = await query(
      `SELECT mp.*
       FROM messaging_providers mp
       WHERE mp.provider_type = 'email'
         AND mp.is_active = true
         AND COALESCE(mp.health_score, 100) >= 30
         AND (mp.tenant_id = $1 OR mp.tenant_id IS NULL)
         AND mp.deleted_at IS NULL
       ORDER BY
         CASE WHEN mp.tenant_id = $1 THEN 0 ELSE 1 END,
         COALESCE(mp.health_score, 100) DESC,
         COALESCE(mp.cost_per_unit, 999) ASC,
         COALESCE(mp.priority, 50) ASC
       LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('No available email provider');
    }

    const provider = result.rows[0];
    const credentials = await this.getProviderCredentials(provider.id);

    return {
      providerId: provider.id,
      providerName: provider.provider_name,
      costPerEmail: provider.cost_per_unit,
      healthScore: provider.health_score,
      credentials
    };
  }

  // ==========================================================================
  // STT (SPEECH-TO-TEXT) ROUTING
  // ==========================================================================

  /**
   * List available STT models for customers
   * Returns customer-facing model names, not provider details
   */
  async listSTTModels(filters = {}) {
    let whereConditions = ['is_active = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (filters.language) {
      whereConditions.push(`$${paramIndex} = ANY(supported_languages)`);
      queryParams.push(filters.language);
      paramIndex++;
    }

    if (filters.realtime !== undefined) {
      whereConditions.push(`supports_realtime = $${paramIndex}`);
      queryParams.push(filters.realtime);
      paramIndex++;
    }

    const result = await query(
      `SELECT
        model_code,
        display_name,
        description,
        quality_tier,
        supported_languages,
        supports_realtime,
        supports_diarization
       FROM stt_model_catalog
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY quality_tier DESC, display_name ASC`,
      queryParams
    );

    return result.rows;
  }

  /**
   * Select the best STT provider for a model
   */
  async selectSTTProvider(modelCode, tenantId = null) {
    const result = await query(
      `SELECT smc.*, mp.id as provider_id, mp.health_score
       FROM stt_model_catalog smc
       JOIN messaging_providers mp ON smc.primary_provider = mp.provider_name
       WHERE smc.model_code = $1
         AND smc.is_active = true
         AND mp.provider_type = 'stt'
         AND mp.is_active = true
         AND mp.health_score >= 30
         AND mp.deleted_at IS NULL`,
      [modelCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`STT model '${modelCode}' not available`);
    }

    const model = result.rows[0];
    const credentials = await this.getProviderCredentials(model.provider_id);

    return {
      providerId: model.provider_id,
      providerName: model.primary_provider,
      modelId: model.primary_model_id,
      healthScore: model.health_score,
      credentials
    };
  }

  // ==========================================================================
  // CARRIER/VOICE ROUTING
  // ==========================================================================

  /**
   * Select the best carrier for outbound calling
   */
  async selectCarrier(destinationNumber, tenantId) {
    // Extract country code from number
    const countryCode = this.extractCountryCode(destinationNumber);

    const result = await query(
      `SELECT cc.*, mp.id as provider_id, mp.health_score, mp.credentials_encrypted, mp.credentials_iv
       FROM carrier_catalog cc
       JOIN messaging_providers mp ON cc.primary_provider = mp.provider_name
       WHERE cc.is_active = true
         AND mp.provider_type IN ('voice', 'carrier')
         AND mp.is_active = true
         AND mp.health_score >= 30
         AND mp.deleted_at IS NULL
         AND ($1 = ANY(cc.supported_countries) OR cc.supported_countries = '{}')
       ORDER BY
         cc.cost_per_minute ASC,
         mp.health_score DESC,
         mp.priority ASC
       LIMIT 1`,
      [countryCode]
    );

    if (result.rows.length === 0) {
      throw new Error(`No carrier available for ${destinationNumber}`);
    }

    const carrier = result.rows[0];
    const credentials = await this.getProviderCredentials(carrier.provider_id);

    return {
      providerId: carrier.provider_id,
      carrierCode: carrier.carrier_code,
      carrierName: carrier.display_name,
      costPerMinute: carrier.cost_per_minute,
      healthScore: carrier.health_score,
      credentials
    };
  }

  // ==========================================================================
  // PROVIDER HEALTH & LOGGING
  // ==========================================================================

  /**
   * Log provider usage (for billing and analytics)
   * IMPORTANT: This is internal - customer-facing logs should NOT show provider
   */
  async logUsage(params) {
    const {
      channelType,
      providerId,
      tenantId,
      requestId,
      success,
      latencyMs,
      costCents,
      metadata = {}
    } = params;

    try {
      // Try using the PostgreSQL function first
      await query(
        `SELECT log_provider_usage($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          channelType,
          providerId,
          tenantId,
          requestId || crypto.randomUUID(),
          success,
          latencyMs,
          costCents,
          JSON.stringify(metadata)
        ]
      );
    } catch (error) {
      // Fallback to direct insert if function doesn't exist yet
      console.warn('[ChannelRouter] log_provider_usage function not found, using direct insert');

      await query(
        `INSERT INTO provider_usage_log (
          request_id, tenant_id, channel_type, provider_id,
          success, latency_ms, cost_cents, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT DO NOTHING`,
        [
          requestId || crypto.randomUUID(),
          tenantId,
          channelType,
          providerId,
          success,
          latencyMs,
          costCents,
          JSON.stringify(metadata)
        ]
      ).catch(() => {
        // Table might not exist yet, just log
        console.warn('[ChannelRouter] Could not log usage - table may not exist');
      });
    }
  }

  /**
   * Update provider health score after success/failure
   */
  async updateProviderHealth(providerId, success) {
    // Adjust health score: +1 for success, -10 for failure (asymmetric to be cautious)
    const adjustment = success ? 1 : -10;

    try {
      if (success) {
        await query(
          `UPDATE messaging_providers
           SET
             health_score = GREATEST(0, LEAST(100, COALESCE(health_score, 100) + $1)),
             total_requests = COALESCE(total_requests, 0) + 1,
             last_used_at = NOW(),
             last_success_at = NOW(),
             updated_at = NOW()
           WHERE id = $2`,
          [adjustment, providerId]
        );
      } else {
        await query(
          `UPDATE messaging_providers
           SET
             health_score = GREATEST(0, LEAST(100, COALESCE(health_score, 100) + $1)),
             total_requests = COALESCE(total_requests, 0) + 1,
             failed_requests = COALESCE(failed_requests, 0) + 1,
             last_used_at = NOW(),
             last_failure_at = NOW(),
             updated_at = NOW()
           WHERE id = $2`,
          [adjustment, providerId]
        );
      }
    } catch (error) {
      // Columns might not exist yet
      console.warn('[ChannelRouter] Could not update provider health:', error.message);
    }
  }

  /**
   * Execute a request with automatic failover
   *
   * @param {string} channelType - 'tts', 'stt', 'sms', 'email', 'voice'
   * @param {Array} providers - List of providers to try in order
   * @param {Function} executor - Async function that executes the request
   * @param {Object} context - Context for logging
   * @returns {Promise<Object>} Result from successful provider
   */
  async executeWithFailover(channelType, providers, executor, context = {}) {
    const startTime = Date.now();
    let lastError;

    for (const provider of providers) {
      try {
        const result = await executor(provider);

        // Log success
        await this.logUsage({
          channelType,
          providerId: provider.providerId,
          tenantId: context.tenantId,
          requestId: context.requestId,
          success: true,
          latencyMs: Date.now() - startTime,
          costCents: result.costCents || 0,
          metadata: { ...context.metadata }
        });

        await this.updateProviderHealth(provider.providerId, true);

        return result;

      } catch (error) {
        console.error(`[ChannelRouter] ${channelType} provider ${provider.providerName} failed:`, error.message);

        // Log failure
        await this.logUsage({
          channelType,
          providerId: provider.providerId,
          tenantId: context.tenantId,
          requestId: context.requestId,
          success: false,
          latencyMs: Date.now() - startTime,
          costCents: 0,
          metadata: { error: error.message, ...context.metadata }
        });

        await this.updateProviderHealth(provider.providerId, false);

        lastError = error;
        // Continue to next provider
      }
    }

    // All providers failed
    throw new Error(`All ${channelType} providers failed. Last error: ${lastError?.message}`);
  }

  // ==========================================================================
  // CREDENTIAL MANAGEMENT
  // ==========================================================================

  /**
   * Get decrypted credentials for a provider
   * Uses short-lived cache to reduce database queries
   */
  async getProviderCredentials(providerId) {
    // Check cache
    const cached = this.credentialCache.get(providerId);
    if (cached && cached.expiry > Date.now()) {
      return cached.credentials;
    }

    const result = await query(
      `SELECT credentials_encrypted, credentials_iv
       FROM messaging_providers
       WHERE id = $1 AND deleted_at IS NULL`,
      [providerId]
    );

    if (result.rows.length === 0) {
      throw new Error('Provider not found');
    }

    const { credentials_encrypted, credentials_iv } = result.rows[0];
    const credentials = this.decryptCredentials(credentials_encrypted, credentials_iv);

    // Cache for short period
    this.credentialCache.set(providerId, {
      credentials,
      expiry: Date.now() + this.credentialCacheTTL
    });

    return credentials;
  }

  /**
   * Decrypt provider credentials
   */
  decryptCredentials(encrypted, iv) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  /**
   * Extract country code from phone number
   */
  extractCountryCode(phoneNumber) {
    // Simple extraction - could be enhanced with libphonenumber
    const cleaned = phoneNumber.replace(/\D/g, '');

    if (cleaned.startsWith('1') && cleaned.length === 11) {
      return 'US';
    }
    if (cleaned.startsWith('44')) {
      return 'GB';
    }
    if (cleaned.startsWith('61')) {
      return 'AU';
    }
    if (cleaned.startsWith('33')) {
      return 'FR';
    }
    if (cleaned.startsWith('49')) {
      return 'DE';
    }
    if (cleaned.startsWith('81')) {
      return 'JP';
    }
    if (cleaned.startsWith('86')) {
      return 'CN';
    }
    if (cleaned.startsWith('91')) {
      return 'IN';
    }

    // Default to US
    return 'US';
  }

  /**
   * Get customer-facing billing rate (with IRISX margin)
   * Customers see IRISX rates, not actual provider costs
   */
  async getCustomerRate(channelType, tenantId) {
    // Get tenant-specific pricing if available
    const result = await query(
      `SELECT billing_rate
       FROM tenant_pricing
       WHERE tenant_id = $1 AND channel_type = $2`,
      [tenantId, channelType]
    );

    if (result.rows.length > 0) {
      return result.rows[0].billing_rate;
    }

    // Default IRISX rates (with margin built in)
    const defaultRates = {
      tts: 0.02,      // $0.02 per 1000 chars
      stt: 0.01,      // $0.01 per minute
      sms: 0.008,     // $0.008 per message
      email: 0.001,   // $0.001 per email
      voice: 0.02     // $0.02 per minute
    };

    return defaultRates[channelType] || 0.01;
  }
}

// Singleton instance
const channelRouter = new ChannelRouter();

export default channelRouter;
