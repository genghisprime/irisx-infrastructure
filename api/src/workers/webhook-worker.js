/**
 * Webhook Worker
 * Consumes webhook delivery jobs from NATS JetStream and delivers them with retry logic
 *
 * Phase 1, Week 4
 */

import natsService from '../services/nats.js';
import { query } from '../db/connection.js';
import crypto from 'crypto';

class WebhookWorker {
  constructor() {
    this.isRunning = false;
    this.retryDelays = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff in ms
  }

  async start() {
    console.log('[Webhook Worker] Starting...');
    this.isRunning = true;

    // Subscribe to webhook delivery jobs
    await natsService.subscribe(
      'WEBHOOKS',
      'webhooks.deliver',
      'webhook-deliverer',
      this.handleWebhookDeliver.bind(this)
    );

    console.log('[Webhook Worker] ✅ Started');
  }

  async handleWebhookDeliver(data, msg) {
    const { deliveryId } = data;

    try {
      console.log(`[Webhook Worker] Processing delivery ${deliveryId}`);

      // Get delivery details
      const deliveryResult = await query(
        `SELECT wd.*, w.url, w.secret, w.timeout_seconds
         FROM webhook_deliveries wd
         JOIN webhooks w ON w.id = wd.webhook_id
         WHERE wd.id = $1`,
        [deliveryId]
      );

      if (deliveryResult.rows.length === 0) {
        throw new Error('Delivery not found');
      }

      const delivery = deliveryResult.rows[0];

      // Check if already completed
      if (['success', 'cancelled'].includes(delivery.status)) {
        console.log(`[Webhook Worker] Delivery ${deliveryId} already completed`);
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

          console.log(`[Webhook Worker] ✅ Delivery ${deliveryId} succeeded`);
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

        console.log(`[Webhook Worker] Scheduling retry for delivery ${deliveryId} in ${retryDelay}ms`);

        // Publish retry job to NATS
        await natsService.publish('webhooks.retry', { deliveryId });
      } else {
        // Max attempts reached
        await this.markDeliveryFailed(deliveryId, errorMessage, httpStatus, responseBody, duration);
      }
    } catch (error) {
      console.error(`[Webhook Worker] Error processing delivery ${deliveryId}:`, error);

      // Mark as failed
      await this.markDeliveryFailed(deliveryId, error.message);

      throw error;  // Will cause NATS to retry the worker job
    }
  }

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

  generateSignature(payload, secret, timestamp) {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signedPayload = `${timestamp}.${payloadString}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);

    return `sha256=${hmac.digest('hex')}`;
  }

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
  }

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

    console.log(`[Webhook Worker] ❌ Delivery ${deliveryId} failed: ${errorMessage}`);
  }

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
      console.error('[Webhook Worker] Error logging attempt:', error);
    }
  }

  async stop() {
    console.log('[Webhook Worker] Stopping...');
    this.isRunning = false;
  }
}

const worker = new WebhookWorker();
worker.start().catch(err => {
  console.error('[Webhook Worker] Fatal error:', err);
  process.exit(1);
});

export default worker;
