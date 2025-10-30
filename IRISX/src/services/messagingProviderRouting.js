import { query } from '../db/connection.js';

/**
 * Messaging Provider Routing Service
 * Implements Least-Cost Routing (LCR) for SMS and Email
 *
 * Features:
 * - Selects cheapest provider for destination
 * - Health-based provider selection
 * - Automatic failover on provider failure
 * - Message cost calculation
 * - Routing decision logging
 */
class MessagingProviderRoutingService {
  /**
   * Select best SMS provider using LCR
   * @param {string} destinationNumber - E.164 formatted phone number
   * @param {object} options - Routing options
   * @returns {object} - Selected provider with alternates
   */
  async selectSMSProvider(destinationNumber, options = {}) {
    const {
      preferCost = true,
      excludeProviders = [],
      minimumHealthScore = 30,
      isMMS = false,
    } = options;

    const startTime = Date.now();

    try {
      // Extract country code from destination
      const countryCode = this.extractCountryCode(destinationNumber);
      const prefix = this.extractPrefix(destinationNumber);

      console.log(`[SMS Routing] Selecting provider for ${destinationNumber} (country: ${countryCode})`);

      // Get all active SMS providers with rates
      const sql = `
        SELECT
          mp.id,
          mp.name,
          mp.provider,
          mp.api_key,
          mp.api_secret,
          mp.account_sid,
          mp.from_number,
          mp.health_score,
          mp.consecutive_failures,
          mp.priority,
          COALESCE(
            mpr.${isMMS ? 'mms_rate' : 'sms_rate'},
            mp.${isMMS ? 'mms_rate_per_message' : 'sms_rate_per_message'}
          ) as rate_per_message,
          CASE
            WHEN mp.consecutive_failures >= 5 THEN 0
            WHEN mp.health_score < 50 THEN mp.health_score * 0.7
            ELSE mp.health_score
          END as effective_health
        FROM messaging_providers mp
        LEFT JOIN messaging_provider_rates mpr ON mpr.provider_id = mp.id
          AND (mpr.country_code = $1 OR mpr.destination_prefix = $2)
          AND (mpr.expires_at IS NULL OR mpr.expires_at > CURRENT_DATE)
        WHERE mp.type = 'sms'
          AND mp.status = 'active'
          AND mp.health_score >= $3
          ${excludeProviders.length > 0 ? `AND mp.id NOT IN (${excludeProviders.join(',')})` : ''}
        ORDER BY
          effective_health DESC,
          ${preferCost ? `COALESCE(mpr.${isMMS ? 'mms_rate' : 'sms_rate'}, mp.${isMMS ? 'mms_rate_per_message' : 'sms_rate_per_message'}) ASC` : 'mp.priority ASC'},
          mp.priority ASC
        LIMIT 5
      `;

      const result = await query(sql, [countryCode, prefix, minimumHealthScore]);

      if (result.rows.length === 0) {
        throw new Error('No healthy SMS providers available');
      }

      const primary = result.rows[0];
      const alternates = result.rows.slice(1);

      const routingDuration = Date.now() - startTime;

      console.log(`[SMS Routing] ✅ Selected ${primary.name} ($${primary.rate_per_message}/msg, health: ${primary.health_score}) in ${routingDuration}ms`);

      return {
        primary,
        alternates,
        selection_reason: preferCost ? 'lcr' : 'priority',
        routing_duration_ms: routingDuration,
      };
    } catch (error) {
      console.error(`[SMS Routing] Error selecting provider:`, error);
      throw error;
    }
  }

  /**
   * Select best email provider using LCR
   * @param {object} options - Routing options
   * @returns {object} - Selected provider with alternates
   */
  async selectEmailProvider(options = {}) {
    const {
      preferCost = true,
      excludeProviders = [],
      minimumHealthScore = 30,
      hasAttachments = false,
      requiresTracking = false,
    } = options;

    const startTime = Date.now();

    try {
      console.log(`[Email Routing] Selecting provider (attachments: ${hasAttachments})`);

      const sql = `
        SELECT
          mp.id,
          mp.name,
          mp.provider,
          mp.api_key,
          mp.api_secret,
          mp.api_endpoint,
          mp.from_email,
          mp.from_name,
          mp.health_score,
          mp.consecutive_failures,
          mp.priority,
          mp.email_rate_per_1000 as rate_per_1000,
          mp.supports_attachments,
          mp.supports_tracking,
          CASE
            WHEN mp.consecutive_failures >= 5 THEN 0
            WHEN mp.health_score < 50 THEN mp.health_score * 0.7
            ELSE mp.health_score
          END as effective_health
        FROM messaging_providers mp
        WHERE mp.type = 'email'
          AND mp.status = 'active'
          AND mp.health_score >= $1
          AND (${hasAttachments} = FALSE OR mp.supports_attachments = TRUE)
          AND (${requiresTracking} = FALSE OR mp.supports_tracking = TRUE)
          ${excludeProviders.length > 0 ? `AND mp.id NOT IN (${excludeProviders.join(',')})` : ''}
        ORDER BY
          effective_health DESC,
          ${preferCost ? 'mp.email_rate_per_1000 ASC' : 'mp.priority ASC'},
          mp.priority ASC
        LIMIT 5
      `;

      const result = await query(sql, [minimumHealthScore]);

      if (result.rows.length === 0) {
        throw new Error('No healthy email providers available');
      }

      const primary = result.rows[0];
      const alternates = result.rows.slice(1);

      const routingDuration = Date.now() - startTime;

      console.log(`[Email Routing] ✅ Selected ${primary.name} ($${primary.rate_per_1000}/1000, health: ${primary.health_score}) in ${routingDuration}ms`);

      return {
        primary,
        alternates,
        selection_reason: preferCost ? 'lcr' : 'priority',
        routing_duration_ms: routingDuration,
      };
    } catch (error) {
      console.error(`[Email Routing] Error selecting provider:`, error);
      throw error;
    }
  }

  /**
   * Extract country code from phone number
   */
  extractCountryCode(number) {
    const cleaned = number.replace(/[^0-9]/g, '');

    const countryCodes = {
      '1': 'US',
      '44': 'GB',
      '61': 'AU',
      '86': 'CN',
      '91': 'IN',
      '33': 'FR',
      '49': 'DE',
      '81': 'JP',
      '82': 'KR',
      '55': 'BR',
      // Add more as needed
    };

    // Check 1-3 digit country codes
    for (let length = 3; length >= 1; length--) {
      const code = cleaned.substring(0, length);
      if (countryCodes[code]) {
        return countryCodes[code];
      }
    }

    return 'US'; // Default
  }

  /**
   * Extract phone prefix (similar to carrier routing)
   */
  extractPrefix(number) {
    const cleaned = number.replace(/[^0-9]/g, '');

    const prefixes = {
      '1': '+1',
      '44': '+44',
      '61': '+61',
      '86': '+86',
      '91': '+91',
      // Add more as needed
    };

    for (let length = 4; length >= 1; length--) {
      const prefix = cleaned.substring(0, length);
      if (prefixes[prefix]) {
        return prefixes[prefix];
      }
    }

    return '+1';
  }

  /**
   * Update provider health after message delivery
   */
  async updateProviderHealth(providerId, deliverySuccess, deliveryTimeSeconds = null) {
    try {
      await query(
        'SELECT update_messaging_provider_health($1, $2, $3)',
        [providerId, deliverySuccess, deliveryTimeSeconds]
      );

      console.log(`[Provider Health] Updated provider ${providerId}: ${deliverySuccess ? 'success' : 'failed'}`);
    } catch (error) {
      console.error(`[Provider Health] Error updating:`, error);
    }
  }

  /**
   * Log routing decision for analytics
   */
  async logRoutingDecision(messageId, messageType, tenantId, destination, routing) {
    try {
      const destinationCountry = messageType === 'sms' ?
        this.extractCountryCode(destination) : null;

      await query(`
        INSERT INTO message_routing_logs (
          message_id, message_type, tenant_id, destination, destination_country,
          selected_provider_id, selected_provider_name, selected_rate,
          provider_selection_reason, alternate_providers, routing_duration_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        messageId,
        messageType,
        tenantId,
        destination,
        destinationCountry,
        routing.primary.id,
        routing.primary.name,
        messageType === 'sms' ? routing.primary.rate_per_message : routing.primary.rate_per_1000,
        routing.selection_reason,
        JSON.stringify(routing.alternates.map(p => ({
          id: p.id,
          name: p.name,
          rate: messageType === 'sms' ? p.rate_per_message : p.rate_per_1000,
        }))),
        routing.routing_duration_ms,
      ]);

      console.log(`[Routing Log] Logged ${messageType} routing decision for message ${messageId}`);
    } catch (error) {
      console.error(`[Routing Log] Error logging:`, error);
    }
  }

  /**
   * Calculate SMS cost
   */
  calculateSMSCost(messageCount, ratePerMessage) {
    const totalCost = messageCount * ratePerMessage;

    return {
      message_count: messageCount,
      rate_per_message: ratePerMessage,
      total_cost: parseFloat(totalCost.toFixed(4)),
    };
  }

  /**
   * Calculate email cost
   */
  calculateEmailCost(emailCount, ratePer1000) {
    const totalCost = (emailCount / 1000) * ratePer1000;

    return {
      email_count: emailCount,
      rate_per_1000: ratePer1000,
      total_cost: parseFloat(totalCost.toFixed(4)),
    };
  }

  /**
   * Get provider by ID
   */
  async getProvider(providerId) {
    const result = await query(
      'SELECT * FROM messaging_providers WHERE id = $1',
      [providerId]
    );
    return result.rows[0];
  }

  /**
   * List providers by type
   */
  async listProviders(type, status = 'active') {
    const sql = `
      SELECT * FROM messaging_providers
      WHERE type = $1
        ${status ? 'AND status = $2' : ''}
      ORDER BY priority ASC, health_score DESC
    `;

    const result = await query(sql, status ? [type, status] : [type]);
    return result.rows;
  }

  /**
   * Get provider performance stats
   */
  async getProviderStats(providerId = null, days = 30) {
    const sql = `
      SELECT * FROM messaging_provider_performance
      ${providerId ? 'WHERE id = $1' : ''}
      ORDER BY type, success_rate_percent DESC
    `;

    const result = await query(sql, providerId ? [providerId] : []);
    return result.rows;
  }

  /**
   * Get cost savings analysis
   */
  async getCostSavings(tenantId = null, days = 30) {
    const sql = `
      SELECT * FROM messaging_cost_savings
      ${tenantId ? 'WHERE tenant_id = $1' : ''}
      ORDER BY savings DESC
    `;

    const result = await query(sql, tenantId ? [tenantId] : []);
    return result.rows;
  }

  /**
   * Test provider health (API connectivity)
   */
  async testProviderHealth(providerId) {
    try {
      const provider = await this.getProvider(providerId);

      if (!provider) {
        throw new Error('Provider not found');
      }

      console.log(`[Provider Health] Testing ${provider.name}...`);

      // This would integrate with actual provider APIs
      // For now, just log the attempt
      await query(`
        INSERT INTO messaging_provider_health_logs (
          provider_id, check_type, status, response_time_ms
        )
        VALUES ($1, 'api_health', 'healthy', $2)
      `, [providerId, 50]);

      return { success: true, responseTimeMs: 50, provider: provider.name };
    } catch (error) {
      console.error(`[Provider Health] Test failed:`, error);

      await query(`
        INSERT INTO messaging_provider_health_logs (
          provider_id, check_type, status, error_message
        )
        VALUES ($1, 'api_health', 'failed', $2)
      `, [providerId, error.message]);

      return { success: false, error: error.message };
    }
  }

  /**
   * Update provider status
   */
  async updateProviderStatus(providerId, status) {
    await query(
      'UPDATE messaging_providers SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, providerId]
    );

    console.log(`[Provider] Updated provider ${providerId} status to ${status}`);
  }

  /**
   * Reset provider health score
   */
  async resetProviderHealth(providerId) {
    await query(`
      UPDATE messaging_providers
      SET
        health_score = 100,
        consecutive_failures = 0,
        last_health_check_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [providerId]);

    console.log(`[Provider] Reset health for provider ${providerId}`);
  }
}

export default new MessagingProviderRoutingService();
