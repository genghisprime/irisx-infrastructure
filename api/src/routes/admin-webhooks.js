/**
 * Admin Webhook Management Routes
 * Webhook monitoring, delivery tracking, retry management
 * Requires admin authentication
 */

import { Hono } from 'hono';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminWebhooks = new Hono();

// All routes require admin authentication
adminWebhooks.use('*', authenticateAdmin);

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * GET /admin/webhooks/stats
 * Get overall webhook statistics
 * NOTE: This route MUST be defined before /:id routes
 */
adminWebhooks.get('/stats', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_webhooks,
        COUNT(*) FILTER (WHERE status = 'active') as active_webhooks,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_webhooks,
        COALESCE(SUM(total_deliveries), 0) as total_deliveries,
        COALESCE(SUM(successful_deliveries), 0) as successful_deliveries,
        COALESCE(SUM(failed_deliveries), 0) as failed_deliveries
      FROM webhooks
      WHERE deleted_at IS NULL
    `);

    const stats = result.rows[0];

    // Get recent delivery stats (last 24 hours)
    const recentResult = await pool.query(`
      SELECT
        COUNT(*) as deliveries_24h,
        COUNT(*) FILTER (WHERE status = 'delivered') as successful_24h,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_24h,
        AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_time
      FROM webhook_deliveries
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    const recent = recentResult.rows[0];

    return c.json({
      ...stats,
      deliveries_24h: parseInt(recent.deliveries_24h, 10) || 0,
      successful_24h: parseInt(recent.successful_24h, 10) || 0,
      failed_24h: parseInt(recent.failed_24h, 10) || 0,
      avg_response_time_ms: recent.avg_response_time ? Math.round(parseFloat(recent.avg_response_time)) : 0,
      success_rate: stats.total_deliveries > 0
        ? Math.round((stats.successful_deliveries / stats.total_deliveries) * 100)
        : 100
    });

  } catch (err) {
    console.error('Webhook stats error:', err);
    return c.json({ error: 'Failed to load webhook stats' }, 500);
  }
});

/**
 * GET /admin/webhooks
 * List all webhooks across tenants
 */
adminWebhooks.get('/', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        w.*,
        t.name as tenant_name,
        CASE
          WHEN COALESCE(w.total_deliveries, 0) > 0
          THEN ROUND(COALESCE(w.successful_deliveries, 0)::numeric / w.total_deliveries * 100)
          ELSE 100
        END as success_rate,
        (SELECT COUNT(*) FROM webhook_deliveries wd WHERE wd.webhook_id = w.id AND wd.created_at >= NOW() - INTERVAL '24 hours') as deliveries_24h
      FROM webhooks w
      JOIN tenants t ON w.tenant_id = t.id
      WHERE w.deleted_at IS NULL
      ORDER BY w.created_at DESC
      LIMIT 100
    `);

    return c.json(result.rows);

  } catch (err) {
    console.error('Webhook list error:', err);
    return c.json({ error: 'Failed to load webhooks' }, 500);
  }
});

/**
 * POST /admin/webhooks/:id/test
 * Test a webhook endpoint by sending an actual HTTP request
 */
adminWebhooks.post('/:id/test', async (c) => {
  try {
    const webhookId = c.req.param('id');
    const admin = c.get('admin');

    // Fetch the webhook details
    const webhookResult = await pool.query(`
      SELECT w.*, t.name as tenant_name
      FROM webhooks w
      JOIN tenants t ON w.tenant_id = t.id
      WHERE w.id = $1 AND w.deleted_at IS NULL
    `, [webhookId]);

    if (webhookResult.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    const webhook = webhookResult.rows[0];

    // Generate test payload
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const testPayload = {
      event: 'webhook.test',
      event_id: eventId,
      timestamp,
      test: true,
      message: 'This is a test webhook delivery from Tazzi Admin Portal',
      webhook_id: webhook.id,
      webhook_name: webhook.name,
      triggered_by: admin.email
    };

    // Generate signature
    const signature = generateSignature(testPayload, webhook.secret_key);

    // Prepare request headers
    const requestHeaders = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Event': 'webhook.test',
      'X-Webhook-ID': webhook.uuid,
      'X-Webhook-Timestamp': timestamp,
      'User-Agent': 'IRISX-Webhook/1.0'
    };

    // Track timing
    const startTime = Date.now();
    let responseStatus = null;
    let responseBody = null;
    let responseHeaders = null;
    let errorMessage = null;
    let success = false;

    try {
      // Make the actual HTTP request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(testPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      responseStatus = response.status;
      responseHeaders = Object.fromEntries(response.headers.entries());

      // Try to get response body (limit to 10KB)
      try {
        const text = await response.text();
        responseBody = text.substring(0, 10000);
      } catch {
        responseBody = null;
      }

      success = responseStatus >= 200 && responseStatus < 300;

    } catch (fetchError) {
      errorMessage = fetchError.name === 'AbortError'
        ? 'Request timeout (10s)'
        : fetchError.message;
    }

    const responseTimeMs = Date.now() - startTime;

    // Log the delivery to database
    const deliveryResult = await pool.query(`
      INSERT INTO webhook_deliveries (
        webhook_id,
        tenant_id,
        event_type,
        event_id,
        request_url,
        request_method,
        request_headers,
        request_body,
        request_signature,
        response_status_code,
        response_headers,
        response_body,
        response_time_ms,
        status,
        error_message,
        attempt_number,
        delivered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      webhook.id,
      webhook.tenant_id,
      'webhook.test',
      eventId,
      webhook.url,
      'POST',
      JSON.stringify(requestHeaders),
      testPayload,
      signature,
      responseStatus,
      responseHeaders ? JSON.stringify(responseHeaders) : null,
      responseBody,
      responseTimeMs,
      success ? 'delivered' : 'failed',
      errorMessage,
      1,
      success ? new Date() : null
    ]);

    // Update webhook stats
    if (success) {
      await pool.query(`
        UPDATE webhooks
        SET
          total_deliveries = COALESCE(total_deliveries, 0) + 1,
          successful_deliveries = COALESCE(successful_deliveries, 0) + 1,
          last_delivery_at = NOW(),
          last_success_at = NOW()
        WHERE id = $1
      `, [webhookId]);
    } else {
      await pool.query(`
        UPDATE webhooks
        SET
          total_deliveries = COALESCE(total_deliveries, 0) + 1,
          failed_deliveries = COALESCE(failed_deliveries, 0) + 1,
          last_delivery_at = NOW(),
          last_failure_at = NOW()
        WHERE id = $1
      `, [webhookId]);
    }

    // Log admin action
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      admin.adminId,
      'webhook_test',
      'webhook',
      webhookId,
      JSON.stringify({
        webhook_name: webhook.name,
        url: webhook.url,
        success,
        response_status: responseStatus,
        response_time_ms: responseTimeMs
      })
    ]);

    return c.json({
      success,
      webhook_id: webhookId,
      webhook_name: webhook.name,
      url: webhook.url,
      delivery_id: deliveryResult.rows[0].id,
      request: {
        method: 'POST',
        headers: requestHeaders,
        body: testPayload
      },
      response: {
        status_code: responseStatus,
        headers: responseHeaders,
        body: responseBody ? responseBody.substring(0, 500) : null,
        time_ms: responseTimeMs
      },
      error: errorMessage
    });

  } catch (err) {
    console.error('Webhook test error:', err);
    return c.json({ error: 'Failed to test webhook', details: err.message }, 500);
  }
});

/**
 * GET /admin/webhooks/:id/logs
 * Get webhook delivery logs
 */
adminWebhooks.get('/:id/logs', async (c) => {
  try {
    const webhookId = c.req.param('id');
    const { page = '1', limit = '20' } = c.req.query();

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    // Get delivery logs
    const result = await pool.query(`
      SELECT
        id,
        event_type,
        event_id,
        request_url,
        response_status_code,
        response_time_ms,
        status,
        error_message,
        attempt_number,
        created_at,
        delivered_at
      FROM webhook_deliveries
      WHERE webhook_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [webhookId, limitNum, offset]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = $1
    `, [webhookId]);

    const total = parseInt(countResult.rows[0].total, 10);

    return c.json({
      logs: result.rows.map(row => ({
        id: row.id,
        event_type: row.event_type,
        event_id: row.event_id,
        url: row.request_url,
        status_code: row.response_status_code,
        response_time_ms: row.response_time_ms,
        status: row.status,
        error: row.error_message,
        attempt: row.attempt_number,
        timestamp: row.created_at,
        delivered_at: row.delivered_at,
        success: row.status === 'delivered'
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('Webhook logs error:', err);
    return c.json({ error: 'Failed to load webhook logs' }, 500);
  }
});

export default adminWebhooks;
