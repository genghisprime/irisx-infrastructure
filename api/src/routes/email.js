/**
 * Email API Routes
 * Phase 1, Week 11-12
 *
 * Endpoints:
 * - POST   /v1/email/send              - Send email
 * - POST   /v1/email/send-template     - Send template email
 * - GET    /v1/email/:id               - Get email
 * - GET    /v1/email                   - List emails
 * - GET    /v1/email/stats             - Get email statistics
 * - POST   /v1/email/templates         - Create template
 * - GET    /v1/email/templates         - List templates
 * - GET    /v1/email/templates/:slug   - Get template
 * - PUT    /v1/email/templates/:slug   - Update template
 * - DELETE /v1/email/templates/:slug   - Delete template
 * - POST   /v1/email/webhooks/sendgrid - SendGrid webhook
 * - POST   /v1/email/unsubscribe       - Unsubscribe email
 */

import { Hono } from 'hono';
import { query } from '../db/connection.js';
import emailService from '../services/email.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const email = new Hono();

/**
 * Send an email
 * POST /v1/email/send
 */
email.post('/send', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const result = await emailService.sendEmail({
      tenantId,
      ...body
    });

    return c.json({
      email: result
    }, 201);
  } catch (error) {
    console.error('[API] Error sending email:', error);
    return c.json({
      error: 'Failed to send email',
      message: error.message
    }, 500);
  }
});

/**
 * Send email using template
 * POST /v1/email/send-template
 */
email.post('/send-template', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { templateSlug, variables, to, toName } = body;

    if (!templateSlug || !to) {
      return c.json({
        error: 'Missing required fields: templateSlug, to'
      }, 400);
    }

    const result = await emailService.sendTemplateEmail({
      tenantId,
      templateSlug,
      variables: variables || {},
      to,
      toName,
      ...body
    });

    return c.json({
      email: result
    }, 201);
  } catch (error) {
    console.error('[API] Error sending template email:', error);
    return c.json({
      error: 'Failed to send template email',
      message: error.message
    }, 500);
  }
});

/**
 * Get email statistics
 * GET /v1/email/stats
 * IMPORTANT: Must come BEFORE /:id route to avoid matching stats as an ID
 */
email.get('/stats', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Return basic stats - count all emails for this tenant
    const result = await query(
      `SELECT COUNT(*) as total FROM emails WHERE tenant_id = $1`,
      [tenantId]
    );

    const total = parseInt(result.rows[0]?.total || 0);

    return c.json({
      success: true,
      data: {
        total_sent: total,
        total_delivered: 0,
        total_opened: 0,
        total_failed: 0,
        delivery_rate: 0,
        open_rate: 0
      }
    });
  } catch (error) {
    console.error('[API] Error getting email stats:', error);
    return c.json({
      error: 'Failed to fetch email stats',
      message: error.message
    }, 500);
  }
});

/**
 * Get email by ID
 * GET /v1/email/:id
 */
email.get('/:id', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const emailId = c.req.param('id');

    const result = await query(
      `SELECT
         id, internal_id, message_id,
         from_email, from_name, to_email, to_name,
         cc_emails, bcc_emails, reply_to_email,
         subject, body_text, body_html,
         status, status_message,
         has_attachments, attachment_count,
         email_type, tags,
         open_count, click_count,
         bounce_type, bounce_reason,
         queued_at, sent_at, delivered_at, bounced_at,
         opened_at, clicked_at, failed_at,
         created_at, updated_at
       FROM emails
       WHERE id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Email not found' }, 404);
    }

    // Get events
    const eventsResult = await query(
      `SELECT event_type, event_data, occurred_at
       FROM email_events
       WHERE email_id = $1
       ORDER BY occurred_at DESC`,
      [emailId]
    );

    return c.json({
      email: result.rows[0],
      events: eventsResult.rows
    });
  } catch (error) {
    console.error('[API] Error getting email:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List emails
 * GET /v1/email
 */
email.get('/', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Query parameters
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status');
    const emailType = c.req.query('type');

    let whereClause = 'WHERE tenant_id = $1';
    const params = [tenantId];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (emailType) {
      whereClause += ` AND email_type = $${params.length + 1}`;
      params.push(emailType);
    }

    const result = await query(
      `SELECT
         id, internal_id, message_id,
         from_email, to_email, subject,
         status, email_type, tags,
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

    return c.json({
      emails: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('[API] Error listing emails:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Create email template
 * POST /v1/email/templates
 */
email.post('/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { name, slug, description, subject, bodyText, bodyHtml, variables } = body;

    if (!name || !slug || !subject) {
      return c.json({
        error: 'Missing required fields: name, slug, subject'
      }, 400);
    }

    const result = await query(
      `INSERT INTO email_templates (
        tenant_id, name, slug, description,
        subject, body_text, body_html, variables
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, slug, description, subject, variables, created_at`,
      [
        tenantId,
        name,
        slug,
        description || null,
        subject,
        bodyText || null,
        bodyHtml || null,
        JSON.stringify(variables || [])
      ]
    );

    return c.json({
      template: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[API] Error creating template:', error);

    if (error.code === '23505') { // Unique violation
      return c.json({
        error: 'Template with this slug already exists'
      }, 409);
    }

    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List email templates
 * GET /v1/email/templates
 */
email.get('/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT
         id, name, slug, description,
         subject, variables,
         is_active, times_used, last_used_at,
         created_at, updated_at
       FROM email_templates
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId]
    );

    return c.json({
      templates: result.rows
    });
  } catch (error) {
    console.error('[API] Error listing templates:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Get email template
 * GET /v1/email/templates/:slug
 */
email.get('/templates/:slug', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const slug = c.req.param('slug');

    const result = await query(
      `SELECT * FROM email_templates
       WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, slug]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    return c.json({
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[API] Error getting template:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Update email template
 * PUT /v1/email/templates/:slug
 */
email.put('/templates/:slug', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const slug = c.req.param('slug');
    const body = await c.req.json();

    // Check template exists
    const existingResult = await query(
      `SELECT id FROM email_templates WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, slug]
    );

    if (existingResult.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
    }

    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }

    if (body.subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      values.push(body.subject);
    }

    if (body.bodyText !== undefined) {
      updates.push(`body_text = $${paramIndex++}`);
      values.push(body.bodyText);
    }

    if (body.bodyHtml !== undefined) {
      updates.push(`body_html = $${paramIndex++}`);
      values.push(body.bodyHtml);
    }

    if (body.variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(body.variables));
    }

    if (body.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(body.isActive);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push(`updated_at = NOW()`);

    values.push(tenantId, slug);

    const result = await query(
      `UPDATE email_templates
       SET ${updates.join(', ')}
       WHERE tenant_id = $${paramIndex++} AND slug = $${paramIndex++}
       RETURNING *`,
      values
    );

    return c.json({
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[API] Error updating template:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Delete email template
 * DELETE /v1/email/templates/:slug
 */
email.delete('/templates/:slug', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const slug = c.req.param('slug');

    const result = await query(
      `DELETE FROM email_templates
       WHERE tenant_id = $1 AND slug = $2
       RETURNING id`,
      [tenantId, slug]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    return c.json({
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('[API] Error deleting template:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * SendGrid webhook handler
 * POST /v1/email/webhooks/sendgrid
 */
email.post('/webhooks/sendgrid', async (c) => {
  try {
    const events = await c.req.json();

    console.log(`[Email] Received ${events.length} SendGrid webhook events`);

    for (const event of events) {
      const { sg_message_id, event: eventType, email: toEmail } = event;

      // Find tenant by to_email or message_id
      const emailResult = await query(
        `SELECT tenant_id, id
         FROM emails
         WHERE message_id = $1 OR to_email = $2
         LIMIT 1`,
        [sg_message_id, toEmail]
      );

      if (emailResult.rows.length === 0) {
        console.error(`[Email] Email not found for SendGrid event: ${sg_message_id}`);
        continue;
      }

      const { tenant_id, id } = emailResult.rows[0];

      // Handle event
      await emailService.handleEmailEvent({
        tenantId: tenant_id,
        messageId: sg_message_id,
        eventType,
        eventData: event
      });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('[API] Error processing SendGrid webhook:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Unsubscribe email address
 * POST /v1/email/unsubscribe
 */
email.post('/unsubscribe', async (c) => {
  try {
    const body = await c.req.json();
    const { email: emailAddress, reason } = body;

    if (!emailAddress) {
      return c.json({ error: 'Missing required field: email' }, 400);
    }

    // Find tenant (if authenticated, use tenantId, otherwise allow global unsubscribe)
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await emailService.handleUnsubscribe(tenantId, emailAddress, reason);

    return c.json({
      message: 'Successfully unsubscribed',
      email: emailAddress
    });
  } catch (error) {
    console.error('[API] Error unsubscribing:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default email;
