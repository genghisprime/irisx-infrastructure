/**
 * Webhook Management API Routes
 * Phase 1, Week 9-10
 *
 * Endpoints:
 * - POST   /v1/webhooks              - Create webhook
 * - GET    /v1/webhooks              - List webhooks
 * - GET    /v1/webhooks/:id          - Get webhook
 * - PUT    /v1/webhooks/:id          - Update webhook
 * - DELETE /v1/webhooks/:id          - Delete webhook
 * - GET    /v1/webhooks/:id/deliveries - List deliveries
 * - POST   /v1/webhooks/:id/test     - Test webhook
 * - POST   /v1/webhooks/deliveries/:id/retry - Retry delivery
 * - GET    /v1/webhooks/event-types  - List event types
 */

import { Hono } from 'hono';
import { query } from '../db/index.js';
import webhookService from '../services/webhook.js';
import crypto from 'crypto';

const webhooks = new Hono();

/**
 * Create a new webhook
 * POST /v1/webhooks
 */
webhooks.post('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    // Validate required fields
    const { url, events, description } = body;

    if (!url) {
      return c.json({ error: 'Missing required field: url' }, 400);
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return c.json({ error: 'Missing required field: events (must be non-empty array)' }, 400);
    }

    // Validate URL format
    if (!url.match(/^https?:\/\/.+/)) {
      return c.json({ error: 'Invalid URL format (must start with http:// or https://)' }, 400);
    }

    // Validate events exist
    const validEventsResult = await query(
      `SELECT event_type FROM webhook_event_types WHERE is_active = true`
    );
    const validEvents = validEventsResult.rows.map(r => r.event_type);

    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return c.json({
        error: 'Invalid event types',
        invalid_events: invalidEvents,
        valid_events: validEvents
      }, 400);
    }

    // Generate webhook secret for HMAC signing
    const secret = crypto.randomBytes(32).toString('hex');

    // Create webhook
    const result = await query(
      `INSERT INTO webhooks (
        tenant_id, url, description, secret, events,
        is_active, is_verified,
        max_retries, timeout_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, url, description, events, is_active, is_verified,
                max_retries, timeout_seconds, created_at`,
      [
        tenantId,
        url,
        description || null,
        secret,
        events,
        body.is_active !== undefined ? body.is_active : true,
        false, // Start unverified
        body.max_retries || 5,
        body.timeout_seconds || 10
      ]
    );

    const webhook = result.rows[0];

    return c.json({
      webhook: {
        ...webhook,
        secret // Return secret ONCE on creation
      }
    }, 201);
  } catch (error) {
    console.error('[API] Error creating webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List webhooks for tenant
 * GET /v1/webhooks
 */
webhooks.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT id, url, description, events, is_active, is_verified,
              total_deliveries, successful_deliveries, failed_deliveries,
              last_delivery_at, last_success_at, last_failure_at,
              created_at, updated_at
       FROM webhooks
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return c.json({
      webhooks: result.rows
    });
  } catch (error) {
    console.error('[API] Error listing webhooks:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Get webhook by ID
 * GET /v1/webhooks/:id
 */
webhooks.get('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const webhookId = c.req.param('id');

    const result = await query(
      `SELECT id, url, description, events, is_active, is_verified,
              max_retries, timeout_seconds, rate_limit_per_minute, rate_limit_per_hour,
              total_deliveries, successful_deliveries, failed_deliveries,
              last_delivery_at, last_success_at, last_failure_at,
              created_at, updated_at
       FROM webhooks
       WHERE id = $1 AND tenant_id = $2`,
      [webhookId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    // Get statistics
    const stats = await webhookService.getWebhookStats(webhookId);

    return c.json({
      webhook: result.rows[0],
      statistics: stats
    });
  } catch (error) {
    console.error('[API] Error getting webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Update webhook
 * PUT /v1/webhooks/:id
 */
webhooks.put('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const webhookId = c.req.param('id');
    const body = await c.req.json();

    // Check webhook exists
    const existingResult = await query(
      `SELECT id FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [webhookId, tenantId]
    );

    if (existingResult.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (body.url !== undefined) {
      if (!body.url.match(/^https?:\/\/.+/)) {
        return c.json({ error: 'Invalid URL format' }, 400);
      }
      updates.push(`url = $${paramIndex++}`);
      values.push(body.url);
    }

    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }

    if (body.events !== undefined) {
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return c.json({ error: 'events must be non-empty array' }, 400);
      }
      updates.push(`events = $${paramIndex++}`);
      values.push(body.events);
    }

    if (body.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(body.is_active);
    }

    if (body.max_retries !== undefined) {
      updates.push(`max_retries = $${paramIndex++}`);
      values.push(body.max_retries);
    }

    if (body.timeout_seconds !== undefined) {
      updates.push(`timeout_seconds = $${paramIndex++}`);
      values.push(body.timeout_seconds);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push(`updated_at = NOW()`);

    values.push(webhookId, tenantId);

    const result = await query(
      `UPDATE webhooks
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING id, url, description, events, is_active, is_verified, updated_at`,
      values
    );

    return c.json({
      webhook: result.rows[0]
    });
  } catch (error) {
    console.error('[API] Error updating webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Delete webhook
 * DELETE /v1/webhooks/:id
 */
webhooks.delete('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const webhookId = c.req.param('id');

    const result = await query(
      `DELETE FROM webhooks
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [webhookId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    return c.json({
      message: 'Webhook deleted successfully'
    });
  } catch (error) {
    console.error('[API] Error deleting webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List webhook deliveries
 * GET /v1/webhooks/:id/deliveries
 */
webhooks.get('/:id/deliveries', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const webhookId = c.req.param('id');

    // Check webhook exists
    const webhookResult = await query(
      `SELECT id FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [webhookId, tenantId]
    );

    if (webhookResult.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    // Query parameters
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status'); // pending, success, failed, retrying

    let whereClause = 'WHERE webhook_id = $1';
    const params = [webhookId];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    const result = await query(
      `SELECT id, event_type, event_id, status, attempts, max_attempts,
              http_status_code, error_message,
              scheduled_at, first_attempt_at, last_attempt_at, completed_at,
              duration_ms, created_at
       FROM webhook_deliveries
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM webhook_deliveries ${whereClause}`,
      params
    );

    return c.json({
      deliveries: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('[API] Error listing deliveries:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Test webhook with sample event
 * POST /v1/webhooks/:id/test
 */
webhooks.post('/:id/test', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const webhookId = c.req.param('id');

    // Check webhook exists
    const webhookResult = await query(
      `SELECT id, events FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [webhookId, tenantId]
    );

    if (webhookResult.rows.length === 0) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    const webhook = webhookResult.rows[0];

    // Use first subscribed event type
    const testEventType = webhook.events[0];

    // Create test payload
    const testPayload = {
      event: testEventType,
      event_id: `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook delivery'
      }
    };

    // Trigger webhook
    await webhookService.triggerEvent({
      tenantId,
      eventType: testEventType,
      eventId: testPayload.event_id,
      payload: testPayload
    });

    return c.json({
      message: 'Test webhook triggered',
      event_type: testEventType
    });
  } catch (error) {
    console.error('[API] Error testing webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Retry failed delivery
 * POST /v1/webhooks/deliveries/:id/retry
 */
webhooks.post('/deliveries/:id/retry', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const deliveryId = c.req.param('id');

    // Check delivery exists and belongs to tenant
    const deliveryResult = await query(
      `SELECT id, status FROM webhook_deliveries
       WHERE id = $1 AND tenant_id = $2`,
      [deliveryId, tenantId]
    );

    if (deliveryResult.rows.length === 0) {
      return c.json({ error: 'Delivery not found' }, 404);
    }

    const delivery = deliveryResult.rows[0];

    if (delivery.status !== 'failed') {
      return c.json({ error: 'Can only retry failed deliveries' }, 400);
    }

    // Retry delivery
    await webhookService.retryDelivery(deliveryId);

    return c.json({
      message: 'Delivery retry initiated'
    });
  } catch (error) {
    console.error('[API] Error retrying delivery:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List available webhook event types
 * GET /v1/webhooks/event-types
 */
webhooks.get('/event-types', async (c) => {
  try {
    const result = await query(
      `SELECT event_type, category, description
       FROM webhook_event_types
       WHERE is_active = true
       ORDER BY category, event_type`
    );

    // Group by category
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.category]) {
        grouped[row.category] = [];
      }
      grouped[row.category].push({
        event_type: row.event_type,
        description: row.description
      });
    }

    return c.json({
      event_types: grouped
    });
  } catch (error) {
    console.error('[API] Error listing event types:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default webhooks;
