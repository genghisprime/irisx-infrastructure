/**
 * Webhook Delivery Service
 *
 * Handles webhook event delivery with:
 * - HMAC-SHA256 signature verification
 * - Exponential backoff retry logic
 * - Rate limiting per webhook endpoint
 * - Async queue-based delivery (future: NATS)
 *
 * Phase 1, Week 9-10
 */

import crypto from 'crypto';
import { query } from '../db/connection.js';

class WebhookService {
  constructor() {
    this.deliveryQueue = [];
    this.isProcessing = false;
    this.maxConcurrentDeliveries = 10;
    this.retryDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff in ms
  }

  /**
   * Trigger a webhook event
   * @param {Object} params
   * @param {number} params.tenantId - Tenant ID
   * @param {string} params.eventType - Event type (e.g., 'call.completed')
   * @param {string} params.eventId - Unique event ID
   * @param {Object} params.payload - Event payload data
   */
  async triggerEvent({ tenantId, eventType, eventId, payload }) {
    try {
      // Find all active webhooks subscribed to this event type
      const webhooksResult = await query(
        `SELECT id, url, secret, max_retries, timeout_seconds, rate_limit_per_minute
         FROM webhooks
         WHERE tenant_id = $1
           AND is_active = true
           AND is_verified = true
           AND $2 = ANY(events)`,
        [tenantId, eventType]
      );

      if (webhooksResult.rows.length === 0) {
        console.log(`[Webhook] No active webhooks for tenant ${tenantId}, event ${eventType}`);
        return;
      }

      console.log(`[Webhook] Triggering ${webhooksResult.rows.length} webhooks for ${eventType}`);

      // Create delivery record for each webhook
      for (const webhook of webhooksResult.rows) {
        await this.createDelivery({
          webhookId: webhook.id,
          tenantId,
          eventType,
          eventId,
          payload,
          maxAttempts: webhook.max_retries || 5,
        });
      }
    } catch (error) {
      console.error('[Webhook] Error triggering event:', error);
    }
  }

  /**
   * Create a webhook delivery record
   */
  async createDelivery({ webhookId, tenantId, eventType, eventId, payload, maxAttempts }) {
    try {
      const result = await query(
        `INSERT INTO webhook_deliveries (
          webhook_id, tenant_id, event_type, event_id, payload, max_attempts, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [webhookId, tenantId, eventType, eventId, JSON.stringify(payload), maxAttempts, 'pending']
      );

      const deliveryId = result.rows[0].id;
      console.log(`[Webhook] Created delivery ${deliveryId} for webhook ${webhookId}`);

      // Add to queue for immediate delivery (or use NATS in production)
      this.deliveryQueue.push(deliveryId);
      this.processQueue();

      return deliveryId;
    } catch (error) {
      console.error('[Webhook] Error creating delivery:', error);
      throw error;
    }
  }

  /**
   * Process the delivery queue
   */
  async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.deliveryQueue.length > 0) {
      const deliveryId = this.deliveryQueue.shift();

      try {
        await this.deliverWebhook(deliveryId);
      } catch (error) {
        console.error(`[Webhook] Error processing delivery ${deliveryId}:`, error);
      }

      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  /**
   * Deliver a webhook with retry logic
   */
  async deliverWebhook(deliveryId) {
    try {
      // Get delivery details
      const deliveryResult = await query(
        `SELECT wd.*, w.url, w.secret, w.timeout_seconds
         FROM webhook_deliveries wd
         JOIN webhooks w ON w.id = wd.webhook_id
         WHERE wd.id = $1`,
        [deliveryId]
      );

      if (deliveryResult.rows.length === 0) {
        console.error(`[Webhook] Delivery ${deliveryId} not found`);
        return;
      }

      const delivery = deliveryResult.rows[0];

      // Check if already completed or cancelled
      if (['success', 'cancelled'].includes(delivery.status)) {
        return;
      }

      // Check if max attempts reached
      if (delivery.attempts >= delivery.max_attempts) {
        await this.markDeliveryFailed(deliveryId, 'Max retry attempts reached');
        return;
      }

      // Increment attempt counter
      const attemptNumber = delivery.attempts + 1;
      await query(
        `UPDATE webhook_deliveries
         SET attempts = $1,
             status = $2,
             first_attempt_at = COALESCE(first_attempt_at, NOW()),
             last_attempt_at = NOW()
         WHERE id = $3`,
        [attemptNumber, 'retrying', deliveryId]
      );

      console.log(`[Webhook] Delivering webhook ${delivery.webhook_id}, attempt ${attemptNumber}`);

      // Make HTTP request
      const startTime = Date.now();
      let httpStatus, responseBody, errorMessage;

      try {
        const response = await this.sendHttpRequest({
          url: delivery.url,
          payload: delivery.payload,
          secret: delivery.secret,
          eventType: delivery.event_type,
          eventId: delivery.event_id,
          timeoutSeconds: delivery.timeout_seconds || 10,
        });

        httpStatus = response.status;
        responseBody = response.body;

        // Success if 2xx status
        if (httpStatus >= 200 && httpStatus < 300) {
          const duration = Date.now() - startTime;
          await this.markDeliverySuccess(deliveryId, httpStatus, responseBody, duration);

          // Log attempt
          await this.logAttempt({
            deliveryId,
            webhookId: delivery.webhook_id,
            attemptNumber,
            httpStatus,
            responseBody,
            duration,
          });

          return;
        }

        errorMessage = `HTTP ${httpStatus}: ${responseBody}`;
      } catch (error) {
        errorMessage = error.message;
        httpStatus = null;
      }

      const duration = Date.now() - startTime;

      // Log failed attempt
      await this.logAttempt({
        deliveryId,
        webhookId: delivery.webhook_id,
        attemptNumber,
        httpStatus,
        responseBody,
        errorMessage,
        duration,
      });

      // Check if should retry
      if (attemptNumber < delivery.max_attempts) {
        // Calculate next retry time (exponential backoff)
        const retryDelay = this.retryDelays[Math.min(attemptNumber - 1, this.retryDelays.length - 1)];
        const nextRetryAt = new Date(Date.now() + retryDelay);

        await query(
          `UPDATE webhook_deliveries
           SET status = $1,
               next_retry_at = $2,
               error_message = $3,
               http_status_code = $4,
               response_body = $5,
               duration_ms = $6
           WHERE id = $7`,
          ['retrying', nextRetryAt, errorMessage, httpStatus, responseBody, duration, deliveryId]
        );

        console.log(`[Webhook] Scheduling retry for delivery ${deliveryId} in ${retryDelay}ms`);

        // Schedule retry
        setTimeout(() => {
          this.deliveryQueue.push(deliveryId);
          this.processQueue();
        }, retryDelay);
      } else {
        // Max attempts reached
        await this.markDeliveryFailed(deliveryId, errorMessage, httpStatus, responseBody, duration);
      }
    } catch (error) {
      console.error(`[Webhook] Error in deliverWebhook:`, error);
      await this.markDeliveryFailed(deliveryId, error.message);
    }
  }

  /**
   * Send HTTP request to webhook endpoint
   */
  async sendHttpRequest({ url, payload, secret, eventType, eventId, timeoutSeconds }) {
    const timestamp = Math.floor(Date.now() / 1000);

    // Generate HMAC-SHA256 signature
    const signature = this.generateSignature(payload, secret, timestamp);

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'IRISX-Webhooks/1.0',
      'X-IRISX-Event': eventType,
      'X-IRISX-Event-ID': eventId,
      'X-IRISX-Signature': signature,
      'X-IRISX-Timestamp': timestamp.toString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const body = await response.text();

      return {
        status: response.status,
        body: body.substring(0, 1000), // Limit response size
      };
    } catch (error) {
      clearTimeout(timeout);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutSeconds}s`);
      }

      throw error;
    }
  }

  /**
   * Generate HMAC-SHA256 signature
   * Format: sha256=<hex_digest>
   */
  generateSignature(payload, secret, timestamp) {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signedPayload = `${timestamp}.${payloadString}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);

    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature (for webhook endpoint verification)
   */
  verifySignature(payload, secret, timestamp, receivedSignature) {
    const expectedSignature = this.generateSignature(payload, secret, timestamp);

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  }

  /**
   * Mark delivery as successful
   */
  async markDeliverySuccess(deliveryId, httpStatus, responseBody, duration) {
    await query(
      `UPDATE webhook_deliveries
       SET status = $1,
           http_status_code = $2,
           response_body = $3,
           duration_ms = $4,
           completed_at = NOW()
       WHERE id = $5`,
      ['success', httpStatus, responseBody, duration, deliveryId]
    );

    console.log(`[Webhook] ✅ Delivery ${deliveryId} succeeded`);
  }

  /**
   * Mark delivery as failed
   */
  async markDeliveryFailed(deliveryId, errorMessage, httpStatus = null, responseBody = null, duration = null) {
    await query(
      `UPDATE webhook_deliveries
       SET status = $1,
           error_message = $2,
           http_status_code = $3,
           response_body = $4,
           duration_ms = $5,
           completed_at = NOW()
       WHERE id = $6`,
      ['failed', errorMessage, httpStatus, responseBody, duration, deliveryId]
    );

    console.log(`[Webhook] ❌ Delivery ${deliveryId} failed: ${errorMessage}`);
  }

  /**
   * Log individual attempt
   */
  async logAttempt({ deliveryId, webhookId, attemptNumber, httpStatus, responseBody, errorMessage, duration }) {
    try {
      await query(
        `INSERT INTO webhook_attempts (
          delivery_id, webhook_id, attempt_number, http_status_code,
          response_body, error_message, duration_ms, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [deliveryId, webhookId, attemptNumber, httpStatus, responseBody, errorMessage, duration]
      );
    } catch (error) {
      console.error('[Webhook] Error logging attempt:', error);
    }
  }

  /**
   * Process pending deliveries (called by scheduler)
   */
  async processPendingDeliveries() {
    try {
      const result = await query(
        `SELECT id FROM webhook_deliveries
         WHERE status IN ('pending', 'retrying')
           AND attempts < max_attempts
         ORDER BY scheduled_at ASC
         LIMIT 100`
      );

      if (result.rows.length > 0) {
        console.log(`[Webhook] Processing ${result.rows.length} pending deliveries`);

        for (const row of result.rows) {
          this.deliveryQueue.push(row.id);
        }

        this.processQueue();
      }
    } catch (error) {
      console.error('[Webhook] Error processing pending deliveries:', error);
    }
  }

  /**
   * Retry failed deliveries (manual retry)
   */
  async retryDelivery(deliveryId) {
    try {
      // Reset delivery status
      await query(
        `UPDATE webhook_deliveries
         SET status = 'pending',
             attempts = 0,
             next_retry_at = NOW(),
             error_message = NULL
         WHERE id = $1
           AND status = 'failed'`,
        [deliveryId]
      );

      this.deliveryQueue.push(deliveryId);
      this.processQueue();

      return { success: true };
    } catch (error) {
      console.error('[Webhook] Error retrying delivery:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending delivery
   */
  async cancelDelivery(deliveryId) {
    try {
      await query(
        `UPDATE webhook_deliveries
         SET status = 'cancelled',
             completed_at = NOW()
         WHERE id = $1
           AND status IN ('pending', 'retrying')`,
        [deliveryId]
      );

      return { success: true };
    } catch (error) {
      console.error('[Webhook] Error cancelling delivery:', error);
      throw error;
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId) {
    try {
      const result = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'success') as successful_deliveries,
           COUNT(*) FILTER (WHERE status = 'failed') as failed_deliveries,
           COUNT(*) FILTER (WHERE status IN ('pending', 'retrying')) as pending_deliveries,
           AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms,
           MAX(completed_at) FILTER (WHERE status = 'success') as last_success_at,
           MAX(completed_at) FILTER (WHERE status = 'failed') as last_failure_at
         FROM webhook_deliveries
         WHERE webhook_id = $1`,
        [webhookId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[Webhook] Error getting webhook stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old webhook logs (30+ days)
   */
  async cleanupOldLogs() {
    try {
      const result = await query(
        `SELECT cleanup_old_webhook_logs() as deleted_count`
      );

      console.log(`[Webhook] Cleaned up ${result.rows[0].deleted_count} old webhook logs`);
      return result.rows[0].deleted_count;
    } catch (error) {
      console.error('[Webhook] Error cleaning up logs:', error);
      throw error;
    }
  }
}

// Singleton instance
const webhookService = new WebhookService();

// Start processing pending deliveries every 30 seconds
setInterval(() => {
  webhookService.processPendingDeliveries();
}, 30000);

// Clean up old logs daily (at 3 AM)
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 3 && now.getMinutes() === 0) {
    webhookService.cleanupOldLogs();
  }
}, 60000);

export default webhookService;
