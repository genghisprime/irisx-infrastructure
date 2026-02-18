/**
 * Email API Routes
 * Send emails with automatic least-cost routing and failover
 *
 * Endpoints:
 * - GET  /v1/emails        - List emails
 * - GET  /v1/emails/stats  - Get email statistics
 * - POST /v1/emails        - Send email with LCR
 * - POST /v1/emails/test   - Test email delivery
 */

import { Hono } from 'hono';
import { sendEmail } from '../services/email-service.js';
import { query } from '../db/connection.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const app = new Hono();

/**
 * GET /v1/emails/stats/timeline - Get email statistics over time
 */
app.get('/stats/timeline', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;

    if (!tenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const days = parseInt(c.req.query('days') || '30');

    // Get daily stats for the specified period
    const result = await query(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'sent' OR status = 'delivered' THEN 1 END) as sent,
         COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
         COUNT(CASE WHEN status = 'opened' THEN 1 END) as opened,
         COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked,
         COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
       FROM emails
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [tenantId]
    );

    return c.json({
      success: true,
      data: {
        timeline: result.rows.map(row => ({
          date: row.date,
          total: parseInt(row.total) || 0,
          sent: parseInt(row.sent) || 0,
          delivered: parseInt(row.delivered) || 0,
          opened: parseInt(row.opened) || 0,
          clicked: parseInt(row.clicked) || 0,
          bounced: parseInt(row.bounced) || 0
        })),
        period: days
      }
    });
  } catch (error) {
    console.error('[Emails API] Stats timeline error:', error);
    return c.json({ error: 'Failed to fetch email stats timeline' }, 500);
  }
});

/**
 * GET /v1/emails/stats - Get email statistics
 * Must come before GET / to avoid matching 'stats' as pagination
 */
app.get('/stats', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;

    if (!tenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get email statistics
    const result = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'sent' OR status = 'delivered' THEN 1 END) as sent,
         COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
         COUNT(CASE WHEN status = 'opened' THEN 1 END) as opened,
         COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked,
         COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
       FROM emails
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const stats = result.rows[0] || {};
    const total = parseInt(stats.total) || 0;
    const sent = parseInt(stats.sent) || 0;
    const delivered = parseInt(stats.delivered) || 0;
    const opened = parseInt(stats.opened) || 0;

    return c.json({
      success: true,
      data: {
        total,
        sent,
        delivered,
        opened,
        clicked: parseInt(stats.clicked) || 0,
        bounced: parseInt(stats.bounced) || 0,
        failed: parseInt(stats.failed) || 0,
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
        openRate: delivered > 0 ? Math.round((opened / delivered) * 100) : 0
      }
    });
  } catch (error) {
    console.error('[Emails API] Stats error:', error);
    return c.json({ error: 'Failed to fetch email stats' }, 500);
  }
});

/**
 * GET /v1/emails - List emails for tenant
 */
app.get('/', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;

    if (!tenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;
    const status = c.req.query('status');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const search = c.req.query('search');

    let whereClause = 'WHERE tenant_id = $1';
    const params = [tenantId];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (dateFrom) {
      whereClause += ` AND created_at >= $${params.length + 1}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ` AND created_at <= $${params.length + 1}`;
      params.push(dateTo);
    }

    if (search) {
      whereClause += ` AND (to_email ILIKE $${params.length + 1} OR subject ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    // Get emails
    const result = await query(
      `SELECT
         id, internal_id, message_id,
         from_email, to_email, subject,
         status, email_type,
         open_count, click_count,
         sent_at, delivered_at, opened_at,
         created_at
       FROM emails
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM emails ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0]?.total) || 0;

    return c.json({
      success: true,
      data: {
        emails: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[Emails API] List error:', error);
    return c.json({ error: 'Failed to fetch emails' }, 500);
  }
});

/**
 * POST /v1/emails - Send email with LCR
 *
 * Request body:
 * {
 *   "to": "user@example.com" or ["user1@example.com", "user2@example.com"],
 *   "subject": "Email subject",
 *   "html": "<p>HTML body</p>",
 *   "text": "Plain text body (optional)",
 *   "from": "custom@sender.com (optional)",
 *   "replyTo": "reply@example.com (optional)",
 *   "attachments": [{ filename, content, type }] (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "provider": "Elastic Email Primary",
 *   "messageId": "abc123",
 *   "deliveryTime": 2,
 *   "attemptedProviders": 1
 * }
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.to) {
      return c.json({
        error: 'Missing required field: to'
      }, 400);
    }

    if (!body.subject) {
      return c.json({
        error: 'Missing required field: subject'
      }, 400);
    }

    if (!body.html && !body.text) {
      return c.json({
        error: 'Missing required field: html or text must be provided'
      }, 400);
    }

    // Extract tenant ID from JWT token (if available)
    const user = c.get('user');
    const tenantId = user?.tenantId || null;

    // Send email with LCR
    const result = await sendEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      from: body.from,
      replyTo: body.replyTo,
      attachments: body.attachments,
      tenantId,
      messageId: null // Can be linked to emails table if needed
    });

    return c.json(result, 200);
  } catch (error) {
    console.error('[Email API] Send failed:', error);

    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /v1/emails/test - Test email delivery
 *
 * Sends a test email to verify configuration
 */
app.post('/test', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.to) {
      return c.json({
        error: 'Missing required field: to'
      }, 400);
    }

    // Send test email
    const result = await sendEmail({
      to: body.to,
      subject: 'IRISX Test Email',
      html: '<h1>Test Email</h1><p>This is a test email from IRISX. If you received this, your email configuration is working correctly!</p>',
      text: 'Test Email\n\nThis is a test email from IRISX. If you received this, your email configuration is working correctly!',
      tenantId: null,
      messageId: null
    });

    return c.json({
      success: true,
      message: 'Test email sent successfully',
      ...result
    }, 200);
  } catch (error) {
    console.error('[Email API] Test email failed:', error);

    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default app;
