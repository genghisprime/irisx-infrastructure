/**
 * SMS Management API Routes
 * Complete SMS operations with templates, scheduling, and bulk messaging
 *
 * Phase 1, Week 3-4
 */

import { Hono } from 'hono';
import { query } from '../db/connection.js';
import SMSService from '../services/sms.js';

const sms = new Hono();
const smsService = new SMSService();

/**
 * @route POST /v1/sms/send
 * @desc Send single SMS message
 */
sms.post('/send', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { from, to, message, mediaUrls = [] } = body;

    // Validation
    if (!from || !to || !message) {
      return c.json({ error: 'from, to, and message are required' }, 400);
    }

    // Send SMS
    const result = await smsService.sendSMS({
      tenantId,
      from,
      to,
      message,
      mediaUrls
    });

    return c.json({
      message: 'SMS sent successfully',
      sms: result
    }, 201);
  } catch (error) {
    console.error('Error sending SMS:', error);
    return c.json({ error: 'Failed to send SMS', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/sms/send-bulk
 * @desc Send SMS to multiple recipients
 */
sms.post('/send-bulk', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { from, recipients, message, mediaUrls = [] } = body;

    // Validation
    if (!from || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return c.json({ error: 'from and recipients array are required' }, 400);
    }

    if (!message) {
      return c.json({ error: 'message is required' }, 400);
    }

    if (recipients.length > 1000) {
      return c.json({ error: 'Maximum 1000 recipients per bulk send' }, 400);
    }

    // Send to all recipients
    const results = await Promise.allSettled(
      recipients.map(to =>
        smsService.sendSMS({
          tenantId,
          from,
          to,
          message,
          mediaUrls
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return c.json({
      message: 'Bulk SMS send completed',
      total: recipients.length,
      successful,
      failed,
      results: results.map((r, i) => ({
        recipient: recipients[i],
        status: r.status,
        sms: r.status === 'fulfilled' ? r.value : null,
        error: r.status === 'rejected' ? r.reason.message : null
      }))
    }, 201);
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    return c.json({ error: 'Failed to send bulk SMS', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms
 * @desc List SMS messages
 */
sms.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { page = 1, limit = 50, direction, status } = c.req.query();

    let whereClause = 'tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (direction) {
      whereClause += ` AND direction = $${paramCount}`;
      params.push(direction);
      paramCount++;
    }

    if (status) {
      whereClause += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM sms_messages
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM sms_messages WHERE ${whereClause}`,
      params
    );

    return c.json({
      messages: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing SMS:', error);
    return c.json({ error: 'Failed to list messages', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/sms/templates
 * @desc Create SMS template
 */
sms.post('/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { name, content, variables = [], category = 'general' } = body;

    // Validation
    if (!name || !content) {
      return c.json({ error: 'name and content are required' }, 400);
    }

    // Extract variables from content {{variable}}
    const extractedVars = [...content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);

    const result = await query(
      `INSERT INTO sms_templates (tenant_id, name, content, variables, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, content, JSON.stringify(extractedVars), category]
    );

    return c.json({
      message: 'Template created successfully',
      template: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('Error creating SMS template:', error);
    return c.json({ error: 'Failed to create template', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms/templates
 * @desc List SMS templates
 */
sms.get('/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { category } = c.req.query();

    let whereClause = 'tenant_id = $1';
    const params = [tenantId];

    if (category) {
      whereClause += ' AND category = $2';
      params.push(category);
    }

    const result = await query(
      `SELECT * FROM sms_templates
       WHERE ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    return c.json({
      templates: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing SMS templates:', error);
    return c.json({ error: 'Failed to list templates', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/sms/send-template
 * @desc Send SMS using template
 */
sms.post('/send-template', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { templateId, from, to, variables = {} } = body;

    // Validation
    if (!templateId || !from || !to) {
      return c.json({ error: 'templateId, from, and to are required' }, 400);
    }

    // Get template
    const templateResult = await query(
      'SELECT * FROM sms_templates WHERE id = $1 AND tenant_id = $2',
      [templateId, tenantId]
    );

    if (templateResult.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    const template = templateResult.rows[0];

    // Replace variables in content
    let message = template.content;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Check for unreplaced variables
    const unreplaced = message.match(/\{\{\w+\}\}/g);
    if (unreplaced) {
      return c.json({
        error: 'Missing variables',
        unreplacedVariables: unreplaced
      }, 400);
    }

    // Send SMS
    const result = await smsService.sendSMS({
      tenantId,
      from,
      to,
      message,
      templateId
    });

    return c.json({
      message: 'Template SMS sent successfully',
      sms: result,
      renderedMessage: message
    }, 201);
  } catch (error) {
    console.error('Error sending template SMS:', error);
    return c.json({ error: 'Failed to send template SMS', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/sms/schedule
 * @desc Schedule SMS for future delivery
 */
sms.post('/schedule', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { from, to, message, mediaUrls = [], scheduledFor } = body;

    // Validation
    if (!from || !to || !message || !scheduledFor) {
      return c.json({ error: 'from, to, message, and scheduledFor are required' }, 400);
    }

    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      return c.json({ error: 'scheduledFor must be in the future' }, 400);
    }

    // Create scheduled message
    const result = await query(
      `INSERT INTO sms_scheduled (
        tenant_id, from_number, to_number, message, media_urls, scheduled_for, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [tenantId, from, to, message, JSON.stringify(mediaUrls), scheduledFor, 'pending']
    );

    return c.json({
      message: 'SMS scheduled successfully',
      scheduled: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('Error scheduling SMS:', error);
    return c.json({ error: 'Failed to schedule SMS', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms/scheduled
 * @desc List scheduled SMS messages
 */
sms.get('/scheduled', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { status = 'pending' } = c.req.query();

    const result = await query(
      `SELECT * FROM sms_scheduled
       WHERE tenant_id = $1 AND status = $2
       ORDER BY scheduled_for ASC`,
      [tenantId, status]
    );

    return c.json({
      scheduled: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing scheduled SMS:', error);
    return c.json({ error: 'Failed to list scheduled messages', message: error.message }, 500);
  }
});

/**
 * @route DELETE /v1/sms/scheduled/:id
 * @desc Cancel scheduled SMS
 */
sms.delete('/scheduled/:id', async (c) => {
  try {
    const scheduledId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    const result = await query(
      `UPDATE sms_scheduled
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [scheduledId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Scheduled message not found or already sent' }, 404);
    }

    return c.json({
      message: 'Scheduled SMS cancelled',
      scheduled: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelling scheduled SMS:', error);
    return c.json({ error: 'Failed to cancel scheduled SMS', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms/stats
 * @desc Get SMS statistics
 */
sms.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { startDate, endDate } = c.req.query();

    let whereClause = 'tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (startDate) {
      whereClause += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    const result = await query(
      `SELECT
        COUNT(*) as total_messages,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as sent,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as received,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN media_urls IS NOT NULL AND media_urls != '[]' THEN 1 END) as mms_messages,
        SUM(segments) as total_segments
       FROM sms_messages
       WHERE ${whereClause}`,
      params
    );

    return c.json({
      stats: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting SMS stats:', error);
    return c.json({ error: 'Failed to get statistics', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/sms/opt-out
 * @desc Handle opt-out request
 */
sms.post('/opt-out', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const { phoneNumber, reason = 'user_request' } = body;

    if (!phoneNumber) {
      return c.json({ error: 'phoneNumber is required' }, 400);
    }

    // Add to opt-out list
    const result = await query(
      `INSERT INTO sms_opt_outs (tenant_id, phone_number, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, phone_number) DO UPDATE
       SET opted_out_at = NOW(), reason = $3
       RETURNING *`,
      [tenantId, phoneNumber, reason]
    );

    return c.json({
      message: 'Phone number opted out successfully',
      optOut: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('Error processing opt-out:', error);
    return c.json({ error: 'Failed to process opt-out', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms/opt-outs
 * @desc List opt-out phone numbers
 */
sms.get('/opt-outs', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;

    const result = await query(
      `SELECT * FROM sms_opt_outs
       WHERE tenant_id = $1
       ORDER BY opted_out_at DESC`,
      [tenantId]
    );

    return c.json({
      optOuts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing opt-outs:', error);
    return c.json({ error: 'Failed to list opt-outs', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/sms/:id
 * @desc Get SMS message details
 */
sms.get('/:id', async (c) => {
  try {
    const messageId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    const result = await query(
      'SELECT * FROM sms_messages WHERE id = $1 AND tenant_id = $2',
      [messageId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Message not found' }, 404);
    }

    return c.json({ message: result.rows[0] });
  } catch (error) {
    console.error('Error getting SMS:', error);
    return c.json({ error: 'Failed to get message', message: error.message }, 500);
  }
});

export default sms;
