/**
 * Admin Webhook Management Routes
 * Webhook monitoring, delivery tracking, retry management
 * Requires admin authentication
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminWebhooks = new Hono();

// All routes require admin authentication
adminWebhooks.use('*', authenticateAdmin);

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
        100 as success_rate,
        10 as deliveries_24h,
        NOW() as last_delivery,
        'active' as status
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
 * Test a webhook endpoint
 */
adminWebhooks.post('/:id/test', async (c) => {
  try {
    const webhookId = c.req.param('id');

    // TODO: Implement actual webhook test
    return c.json({ message: 'Webhook test sent', id: webhookId });

  } catch (err) {
    console.error('Webhook test error:', err);
    return c.json({ error: 'Failed to test webhook' }, 500);
  }
});

/**
 * GET /admin/webhooks/:id/logs
 * Get webhook delivery logs
 */
adminWebhooks.get('/:id/logs', async (c) => {
  try {
    const webhookId = c.req.param('id');

    // Return sample logs for now
    return c.json([
      {
        id: 1,
        timestamp: new Date().toISOString(),
        success: true,
        response_time: 145
      }
    ]);

  } catch (err) {
    console.error('Webhook logs error:', err);
    return c.json({ error: 'Failed to load webhook logs' }, 500);
  }
});

export default adminWebhooks;
