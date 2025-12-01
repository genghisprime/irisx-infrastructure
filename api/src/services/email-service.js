/**
 * Email Service with Least-Cost Routing (LCR) and Automatic Failover
 *
 * Features:
 * - Automatic provider selection based on health score and cost
 * - Automatic failover to backup providers on failure
 * - Health score updates after each delivery attempt
 * - Routing decision logging
 * - Support for multiple email providers (Elastic Email, SendGrid, Custom SMTP)
 */

import crypto from 'crypto';
import pool from '../db/connection.js';
import { createEmailProvider } from './email-providers/index.js';

/**
 * Decrypt provider credentials
 */
function decryptCredentials(encrypted, iv) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.ENCRYPTION_KEY || 'change-this-key-in-production',
      'salt',
      32
    );
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'hex')
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[Email Service] Failed to decrypt credentials:', error);
    throw new Error('Failed to decrypt provider credentials');
  }
}

/**
 * Get best email provider using LCR
 */
async function selectEmailProvider(hasAttachments = false, minimumHealthScore = 30) {
  try {
    const result = await pool.query(
      `SELECT * FROM select_email_provider($1, $2)`,
      [minimumHealthScore, hasAttachments]
    );

    if (result.rows.length === 0) {
      throw new Error('No healthy email providers available');
    }

    const selectedProvider = result.rows[0];

    // Get full provider details including credentials
    const providerDetails = await pool.query(
      `SELECT * FROM messaging_providers WHERE id = $1`,
      [selectedProvider.provider_id]
    );

    if (providerDetails.rows.length === 0) {
      throw new Error('Provider not found');
    }

    return providerDetails.rows[0];
  } catch (error) {
    console.error('[Email Service] Provider selection failed:', error);
    throw error;
  }
}

/**
 * Update provider health score after delivery attempt
 */
async function updateProviderHealth(providerId, success, deliveryTimeSeconds = null) {
  try {
    await pool.query(
      `SELECT update_messaging_provider_health($1, $2, $3)`,
      [providerId, success, deliveryTimeSeconds]
    );
  } catch (error) {
    console.error('[Email Service] Failed to update provider health:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Log routing decision
 */
async function logRoutingDecision(data) {
  try {
    await pool.query(
      `INSERT INTO message_routing_logs (
        message_id,
        message_type,
        tenant_id,
        destination,
        destination_country,
        selected_provider_id,
        selected_provider_name,
        selected_rate,
        provider_selection_reason,
        alternate_providers,
        routing_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        data.messageId,
        'email',
        data.tenantId,
        data.destination,
        data.destinationCountry || null,
        data.providerId,
        data.providerName,
        data.rate,
        data.reason,
        JSON.stringify(data.alternateProviders || []),
        data.durationMs
      ]
    );
  } catch (error) {
    console.error('[Email Service] Failed to log routing decision:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Get list of all active email providers sorted by preference
 */
async function getAllActiveProviders() {
  try {
    const result = await pool.query(
      `SELECT
        id,
        provider_name,
        config,
        credentials_encrypted,
        credentials_iv
      FROM messaging_providers
      WHERE provider_type = 'email'
        AND is_active = true
      ORDER BY
        COALESCE((config->>'health_score')::integer, 100) DESC,
        COALESCE((config->>'email_rate_per_1000')::numeric, 999) ASC,
        COALESCE((config->>'priority')::integer, 999) ASC`
    );

    return result.rows;
  } catch (error) {
    console.error('[Email Service] Failed to get active providers:', error);
    return [];
  }
}

/**
 * Send email with automatic provider selection and failover
 *
 * @param {Object} emailData - Email data
 * @param {string|string[]} emailData.to - Recipient email(s)
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML body
 * @param {string} [emailData.text] - Plain text body
 * @param {string} [emailData.from] - Override sender email
 * @param {string} [emailData.replyTo] - Reply-to email
 * @param {Array} [emailData.attachments] - Attachments
 * @param {number} [emailData.tenantId] - Tenant ID for tracking
 * @param {number} [emailData.messageId] - Message ID for tracking
 *
 * @returns {Promise<Object>} Delivery result
 */
export async function sendEmail(emailData) {
  const startTime = Date.now();
  const hasAttachments = emailData.attachments && emailData.attachments.length > 0;
  const destination = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;

  // Validate required fields
  if (!emailData.to || (!emailData.html && !emailData.text) || !emailData.subject) {
    throw new Error('Missing required email fields: to, subject, and html or text are required');
  }

  console.log(`[Email Service] Sending email to ${destination}`);

  // Get all active providers for failover
  const allProviders = await getAllActiveProviders();

  if (allProviders.length === 0) {
    throw new Error('No active email providers configured');
  }

  let lastError = null;
  let attemptedProviders = [];

  // Try each provider in order until one succeeds
  for (const providerConfig of allProviders) {
    const attemptStartTime = Date.now();

    try {
      const displayName = providerConfig.config?.display_name || providerConfig.provider_name;
      const healthScore = providerConfig.config?.health_score || 100;

      console.log(`[Email Service] Attempting with provider: ${displayName} (health: ${healthScore})`);

      // Decrypt credentials
      let credentials = decryptCredentials(
        providerConfig.credentials_encrypted,
        providerConfig.credentials_iv
      );

      // Create provider instance
      const provider = createEmailProvider(providerConfig.provider_name, credentials);

      // Attempt to send email
      const result = await provider.send(emailData);

      if (result.success) {
        const deliveryTime = Math.floor((Date.now() - attemptStartTime) / 1000);

        // Update provider health (success)
        await updateProviderHealth(providerConfig.id, true, deliveryTime);

        // Log routing decision
        await logRoutingDecision({
          messageId: emailData.messageId || null,
          tenantId: emailData.tenantId || null,
          destination,
          providerId: providerConfig.id,
          providerName: displayName,
          rate: providerConfig.config?.email_rate_per_1000 || 0,
          reason: attemptedProviders.length === 0 ? 'lcr' : 'failover',
          alternateProviders: attemptedProviders,
          durationMs: Date.now() - startTime
        });

        console.log(`[Email Service] ✓ Email sent successfully via ${displayName} (${deliveryTime}s)`);

        return {
          success: true,
          provider: displayName,
          providerId: providerConfig.id,
          messageId: result.messageId,
          deliveryTime,
          attemptedProviders: attemptedProviders.length + 1,
          response: result.response
        };
      } else {
        throw new Error(result.error || 'Provider returned failure');
      }
    } catch (error) {
      console.error(`[Email Service] ✗ Provider ${displayName} failed:`, error.message);

      // Update provider health (failure)
      await updateProviderHealth(providerConfig.id, false);

      // Track this attempt
      attemptedProviders.push({
        id: providerConfig.id,
        name: displayName,
        error: error.message
      });

      lastError = error;

      // Continue to next provider
    }
  }

  // All providers failed
  console.error(`[Email Service] All ${allProviders.length} providers failed for ${destination}`);

  // Log final failed routing decision
  await logRoutingDecision({
    messageId: emailData.messageId || null,
    tenantId: emailData.tenantId || null,
    destination,
    providerId: null,
    providerName: 'none',
    rate: 0,
    reason: 'all_failed',
    alternateProviders: attemptedProviders,
    durationMs: Date.now() - startTime
  });

  throw new Error(
    `Email delivery failed: All ${allProviders.length} providers failed. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Test provider connection
 */
export async function testProviderConnection(providerId) {
  try {
    const result = await pool.query(
      `SELECT * FROM messaging_providers WHERE id = $1 AND type = 'email'`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Provider not found'
      };
    }

    const providerConfig = result.rows[0];

    // Decrypt credentials
    let credentials;
    if (providerConfig.credentials_encrypted && providerConfig.credentials_iv) {
      credentials = decryptCredentials(
        providerConfig.credentials_encrypted,
        providerConfig.credentials_iv
      );
    } else {
      credentials = {
        api_key: providerConfig.api_key,
        api_secret: providerConfig.api_secret,
        api_endpoint: providerConfig.api_endpoint,
        from_email: providerConfig.from_email,
        from_name: providerConfig.from_name,
        ...((providerConfig.metadata && typeof providerConfig.metadata === 'object')
          ? providerConfig.metadata
          : {})
      };
    }

    // Create provider instance
    const provider = createEmailProvider(providerConfig.provider, credentials);

    // Test connection
    const testResult = await provider.testConnection();

    // Log health check
    await pool.query(
      `INSERT INTO messaging_provider_health_logs (
        provider_id,
        check_type,
        status,
        error_message,
        metadata
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        providerId,
        'api_health',
        testResult.success ? 'healthy' : 'failed',
        testResult.success ? null : testResult.message,
        JSON.stringify(testResult)
      ]
    );

    return testResult;
  } catch (error) {
    console.error('[Email Service] Connection test failed:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get email provider statistics
 */
export async function getProviderStats(providerId, startDate, endDate) {
  try {
    const result = await pool.query(
      `SELECT * FROM messaging_providers WHERE id = $1 AND type = 'email'`,
      [providerId]
    );

    if (result.rows.length === 0) {
      throw new Error('Provider not found');
    }

    const providerConfig = result.rows[0];

    // Decrypt credentials
    let credentials;
    if (providerConfig.credentials_encrypted && providerConfig.credentials_iv) {
      credentials = decryptCredentials(
        providerConfig.credentials_encrypted,
        providerConfig.credentials_iv
      );
    } else {
      credentials = {
        api_key: providerConfig.api_key,
        api_secret: providerConfig.api_secret,
        api_endpoint: providerConfig.api_endpoint,
        from_email: providerConfig.from_email,
        from_name: providerConfig.from_name,
        ...((providerConfig.metadata && typeof providerConfig.metadata === 'object')
          ? providerConfig.metadata
          : {})
      };
    }

    // Create provider instance
    const provider = createEmailProvider(providerConfig.provider, credentials);

    // Get stats from provider API
    const stats = await provider.getStats(startDate, endDate);

    return {
      success: true,
      provider: providerConfig.name,
      stats
    };
  } catch (error) {
    console.error('[Email Service] Failed to get provider stats:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  sendEmail,
  testProviderConnection,
  getProviderStats
};
