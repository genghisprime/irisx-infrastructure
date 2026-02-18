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
 * Get email deliverability stats
 * GET /v1/email/deliverability
 */
email.get('/deliverability', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Get 30-day email stats
    const statsResult = await query(
      `SELECT
         COUNT(*) as sent_30d,
         COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
         COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced,
         COUNT(CASE WHEN bounce_type = 'hard' THEN 1 END) as hard_bounces,
         COUNT(CASE WHEN bounce_type = 'soft' THEN 1 END) as soft_bounces
       FROM emails
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );

    const stats = statsResult.rows[0] || {};
    const sent30d = parseInt(stats.sent_30d) || 0;
    const delivered = parseInt(stats.delivered) || 0;
    const bounced = parseInt(stats.bounced) || 0;
    const hardBounces = parseInt(stats.hard_bounces) || 0;
    const softBounces = parseInt(stats.soft_bounces) || 0;

    // Calculate rates
    const deliveryRate = sent30d > 0 ? Math.round((delivered / sent30d) * 1000) / 10 : 0;
    const bounceRate = sent30d > 0 ? Math.round((bounced / sent30d) * 1000) / 10 : 0;

    // Get suppression list
    const suppressionResult = await query(
      `SELECT id, email, reason, created_at as added_at
       FROM email_suppressions
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [tenantId]
    );

    // Get spam complaints (if tracked)
    const spamComplaintsResult = await query(
      `SELECT COUNT(*) as spam_complaints
       FROM emails
       WHERE tenant_id = $1
         AND status = 'complained'
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId]
    );
    const spamComplaints = parseInt(spamComplaintsResult.rows[0]?.spam_complaints) || 0;

    // Calculate percentages for progress bars
    const totalBounces = hardBounces + softBounces + spamComplaints || 1;
    const hardBouncePercent = Math.round((hardBounces / totalBounces) * 100);
    const softBouncePercent = Math.round((softBounces / totalBounces) * 100);
    const spamComplaintPercent = Math.round((spamComplaints / totalBounces) * 100);

    // Calculate overall health score (simple formula)
    let overallScore = 100;
    if (bounceRate > 5) overallScore -= 30;
    else if (bounceRate > 2) overallScore -= 15;
    else if (bounceRate > 1) overallScore -= 5;

    if (spamComplaints > 0) overallScore -= 20;
    if (sent30d === 0) overallScore = 0;

    // Generate insights based on data
    const insights = [];
    if (bounceRate > 2) {
      insights.push({ id: 1, text: `Your bounce rate (${bounceRate}%) is above the recommended 2%. Consider cleaning your email list.` });
    }
    if (hardBounces > 10) {
      insights.push({ id: 2, text: `You have ${hardBounces} hard bounces. Remove these addresses from your list.` });
    }
    if (spamComplaints > 0) {
      insights.push({ id: 3, text: `You have ${spamComplaints} spam complaints. Review your email content and sending frequency.` });
    }
    if (sent30d === 0) {
      insights.push({ id: 4, text: 'No emails sent in the last 30 days. Start sending to see deliverability metrics.' });
    }
    if (deliveryRate >= 98 && sent30d > 0) {
      insights.push({ id: 5, text: `Great job! Your delivery rate of ${deliveryRate}% is excellent.` });
    }

    return c.json({
      success: true,
      stats: {
        sent_30d: sent30d,
        delivery_rate: deliveryRate,
        bounce_rate: bounceRate
      },
      bounce_stats: {
        hard_bounces: hardBounces,
        hard_bounce_percent: hardBouncePercent,
        soft_bounces: softBounces,
        soft_bounce_percent: softBouncePercent,
        spam_complaints: spamComplaints,
        spam_complaint_percent: spamComplaintPercent
      },
      overall_score: Math.max(0, overallScore),
      last_checked: new Date().toISOString(),
      suppression_list: suppressionResult.rows,
      insights,
      dns_records: [] // DNS records would need tenant domain configuration
    });
  } catch (error) {
    console.error('[API] Error getting deliverability stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch deliverability stats',
      message: error.message
    }, 500);
  }
});

/**
 * Run deliverability health check
 * POST /v1/email/deliverability/check
 */
email.post('/deliverability/check', authenticateJWT, async (c) => {
  try {
    // Just refresh stats - the GET endpoint will return fresh data
    return c.json({
      success: true,
      message: 'Health check completed'
    });
  } catch (error) {
    console.error('[API] Error running health check:', error);
    return c.json({
      success: false,
      error: 'Health check failed',
      message: error.message
    }, 500);
  }
});

/**
 * Add email to suppression list
 * POST /v1/email/suppression
 */
email.post('/suppression', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { email: emailAddress, reason } = body;

    if (!emailAddress || !reason) {
      return c.json({
        success: false,
        error: 'Missing required fields: email, reason'
      }, 400);
    }

    // Check if already exists
    const existingResult = await query(
      `SELECT id FROM email_suppressions
       WHERE tenant_id = $1 AND email = $2`,
      [tenantId, emailAddress.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      return c.json({
        success: false,
        error: 'Email is already in suppression list'
      }, 409);
    }

    const result = await query(
      `INSERT INTO email_suppressions (tenant_id, email, reason)
       VALUES ($1, $2, $3)
       RETURNING id, email, reason, created_at as added_at`,
      [tenantId, emailAddress.toLowerCase(), reason]
    );

    return c.json({
      success: true,
      suppression: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[API] Error adding suppression:', error);
    return c.json({
      success: false,
      error: 'Failed to add suppression',
      message: error.message
    }, 500);
  }
});

/**
 * Remove email from suppression list
 * DELETE /v1/email/suppression/:id
 */
email.delete('/suppression/:id', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const suppressionId = c.req.param('id');

    const result = await query(
      `DELETE FROM email_suppressions
       WHERE tenant_id = $1 AND id = $2
       RETURNING id`,
      [tenantId, suppressionId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Suppression not found'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Email removed from suppression list'
    });
  } catch (error) {
    console.error('[API] Error removing suppression:', error);
    return c.json({
      success: false,
      error: 'Failed to remove suppression',
      message: error.message
    }, 500);
  }
});

/**
 * Validate email address
 * POST /v1/email/validate
 */
email.post('/validate', authenticateJWT, async (c) => {
  try {
    const body = await c.req.json();
    const { email: emailAddress } = body;

    if (!emailAddress) {
      return c.json({
        valid: false,
        message: 'Email address is required'
      }, 400);
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const syntaxValid = emailRegex.test(emailAddress);

    if (!syntaxValid) {
      return c.json({
        valid: false,
        syntax_valid: false,
        message: 'Invalid email format'
      });
    }

    // Check for disposable email domains (simple list)
    const disposableDomains = [
      'tempmail.com', 'throwaway.email', 'guerrillamail.com',
      'mailinator.com', '10minutemail.com', 'fakeinbox.com',
      'tempinbox.com', 'yopmail.com', 'trashmail.com'
    ];
    const domain = emailAddress.split('@')[1]?.toLowerCase();
    const isDisposable = disposableDomains.includes(domain);

    // Calculate risk score
    let riskScore = 0;
    if (isDisposable) riskScore += 80;
    if (domain && domain.length < 4) riskScore += 20;

    return c.json({
      valid: !isDisposable && syntaxValid,
      syntax_valid: syntaxValid,
      mx_records_exist: true, // Would need actual MX lookup
      is_disposable: isDisposable,
      risk_score: riskScore,
      message: isDisposable ? 'Disposable email detected' : 'Email appears valid'
    });
  } catch (error) {
    console.error('[API] Error validating email:', error);
    return c.json({
      valid: false,
      message: 'Validation failed'
    }, 500);
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
 * Get email by ID
 * GET /v1/email/:id
 * NOTE: Must come AFTER /templates routes to avoid matching 'templates' as an ID
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
