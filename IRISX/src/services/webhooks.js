/**
 * Webhook Management Service
 * Event delivery with retry logic, HMAC signatures, and failure tracking
 */

import crypto from 'crypto';
import { query } from '../db/index.js';

class WebhooksService {
  /**
   * Create webhook endpoint
   */
  async createEndpoint(endpointData) {
    const {
      tenant_id,
      created_by,
      name,
      url,
      description,
      auth_type = 'none',
      auth_credentials,
      subscribed_events = ['*'],
      ip_whitelist = [],
      max_retries = 3,
      retry_backoff_seconds = 60,
      timeout_seconds = 30,
      auto_disable_after_failures = 10,
      metadata = {}
    } = endpointData;

    // Generate secret key for HMAC
    const secretKey = crypto.randomBytes(32).toString('hex');

    const sql = `
      INSERT INTO webhook_endpoints (
        tenant_id, created_by, name, url, description,
        auth_type, auth_credentials, subscribed_events, secret_key,
        ip_whitelist, max_retries, retry_backoff_seconds, timeout_seconds,
        auto_disable_after_failures, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, created_by, name, url, description,
      auth_type, auth_credentials ? JSON.stringify(auth_credentials) : null,
      subscribed_events, secretKey, ip_whitelist,
      max_retries, retry_backoff_seconds, timeout_seconds,
      auto_disable_after_failures, JSON.stringify(metadata)
    ]);

    return {
      ...result.rows[0],
      secret_key: secretKey  // Only shown on creation
    };
  }

  /**
   * List webhook endpoints for tenant
   */
  async listEndpoints(tenantId, includeDisabled = false) {
    let sql = `
      SELECT
        id, uuid, tenant_id, name, url, description,
        subscribed_events, is_active, is_verified,
        failure_count, consecutive_failures,
        last_triggered_at, created_at
      FROM webhook_endpoints
      WHERE tenant_id = $1
    `;

    if (!includeDisabled) {
      sql += ` AND is_active = TRUE`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  /**
   * Get webhook endpoint by ID
   */
  async getEndpoint(endpointId, tenantId) {
    const sql = `
      SELECT * FROM webhook_endpoints
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await query(sql, [endpointId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Webhook endpoint not found');
    }

    return result.rows[0];
  }

  /**
   * Update webhook endpoint
   */
  async updateEndpoint(endpointId, tenantId, updates) {
    const allowedFields = [
      'name', 'url', 'description', 'subscribed_events',
      'max_retries', 'retry_backoff_seconds', 'timeout_seconds',
      'is_active', 'metadata'
    ];

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(endpointId, tenantId);
    const sql = `
      UPDATE webhook_endpoints
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Webhook endpoint not found');
    }

    return result.rows[0];
  }

  /**
   * Delete webhook endpoint
   */
  async deleteEndpoint(endpointId, tenantId) {
    const sql = `
      DELETE FROM webhook_endpoints
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, [endpointId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Webhook endpoint not found');
    }

    return result.rows[0];
  }

  /**
   * Generate HMAC signature for payload
   */
  generateSignature(payload, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Queue webhook delivery
   */
  async queueDelivery(deliveryData) {
    const {
      webhook_endpoint_id,
      tenant_id,
      event_type,
      event_id,
      payload
    } = deliveryData;

    const sql = `SELECT record_webhook_delivery($1, $2, $3, $4, $5) as delivery_id`;

    const result = await query(sql, [
      webhook_endpoint_id,
      tenant_id,
      event_type,
      event_id,
      JSON.stringify(payload)
    ]);

    return result.rows[0].delivery_id;
  }

  /**
   * Trigger webhook for an event
   */
  async triggerEvent(tenantId, eventType, eventId, payload) {
    // Find all active endpoints subscribed to this event
    const sql = `
      SELECT * FROM webhook_endpoints
      WHERE tenant_id = $1
        AND is_active = TRUE
        AND ($2 = ANY(subscribed_events) OR '*' = ANY(subscribed_events))
    `;

    const result = await query(sql, [tenantId, eventType]);
    const endpoints = result.rows;

    const deliveryIds = [];

    for (const endpoint of endpoints) {
      try {
        const deliveryId = await this.queueDelivery({
          webhook_endpoint_id: endpoint.id,
          tenant_id: tenantId,
          event_type: eventType,
          event_id: eventId,
          payload
        });

        deliveryIds.push(deliveryId);
      } catch (error) {
        console.error(`[Webhooks] Error queueing delivery for endpoint ${endpoint.id}:`, error);
      }
    }

    return deliveryIds;
  }

  /**
   * Get pending deliveries for retry
   */
  async getPendingRetries(limit = 100) {
    const sql = `
      SELECT * FROM webhook_deliveries_pending_retry
      LIMIT $1
    `;

    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(deliveryId, status, responseData = {}) {
    const {
      response_status_code,
      response_body,
      response_time_ms,
      error_message
    } = responseData;

    const sql = `SELECT update_delivery_status($1, $2, $3, $4, $5, $6)`;

    await query(sql, [
      deliveryId,
      status,
      response_status_code,
      response_body,
      response_time_ms,
      error_message
    ]);
  }

  /**
   * Get webhook endpoint health
   */
  async getEndpointHealth(tenantId) {
    const sql = `
      SELECT * FROM webhook_endpoints_health
      WHERE tenant_id = $1
      ORDER BY success_rate_percent ASC
    `;

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  /**
   * Get delivery statistics
   */
  async getDeliveryStats(tenantId, days = 7) {
    const sql = `
      SELECT * FROM webhook_delivery_stats_7d
      WHERE tenant_id = $1
      ORDER BY total_deliveries DESC
    `;

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  /**
   * List deliveries for an endpoint
   */
  async listDeliveries(endpointId, tenantId, filters = {}) {
    const {
      status,
      event_type,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `
      SELECT * FROM webhook_deliveries
      WHERE webhook_endpoint_id = $1 AND tenant_id = $2
    `;
    const params = [endpointId, tenantId];
    let paramIndex = 3;

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (event_type) {
      sql += ` AND event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get delivery by ID
   */
  async getDelivery(deliveryId, tenantId) {
    const sql = `
      SELECT * FROM webhook_deliveries
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await query(sql, [deliveryId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Webhook delivery not found');
    }

    return result.rows[0];
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(deliveryId, tenantId) {
    // Reset delivery to pending for retry
    const sql = `
      UPDATE webhook_deliveries
      SET status = 'pending',
          next_retry_at = NOW()
      WHERE id = $1 AND tenant_id = $2
        AND status IN ('failed', 'retrying')
        AND retry_count < max_attempts
      RETURNING *
    `;

    const result = await query(sql, [deliveryId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Delivery cannot be retried');
    }

    return result.rows[0];
  }

  /**
   * Get available webhook events
   */
  async getAvailableEvents(category = null) {
    let sql = `SELECT * FROM webhook_events WHERE is_active = TRUE`;

    if (category) {
      sql += ` AND event_category = $1`;
      const result = await query(sql, [category]);
      return result.rows;
    }

    sql += ` ORDER BY event_category, event_type`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Log webhook activity
   */
  async logActivity(logData) {
    const {
      webhook_endpoint_id,
      delivery_id,
      tenant_id,
      log_level = 'info',
      message,
      event_type,
      error_code,
      stack_trace,
      metadata
    } = logData;

    const sql = `
      INSERT INTO webhook_logs (
        webhook_endpoint_id, delivery_id, tenant_id, log_level,
        message, event_type, error_code, stack_trace, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(sql, [
      webhook_endpoint_id, delivery_id, tenant_id, log_level,
      message, event_type, error_code, stack_trace,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  }

  /**
   * Regenerate secret key
   */
  async regenerateSecret(endpointId, tenantId) {
    const newSecret = crypto.randomBytes(32).toString('hex');

    const sql = `
      UPDATE webhook_endpoints
      SET secret_key = $1
      WHERE id = $2 AND tenant_id = $3
      RETURNING id, uuid, name, secret_key
    `;

    const result = await query(sql, [newSecret, endpointId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Webhook endpoint not found');
    }

    return result.rows[0];
  }
}

export default new WebhooksService();
