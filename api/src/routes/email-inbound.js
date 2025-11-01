/**
 * Inbound Email Routes
 * Week 13-14, Phase 1
 *
 * Handles receiving inbound emails from email providers
 * Supports SendGrid, Mailgun, AWS SES, and generic MIME webhooks
 *
 * Endpoints:
 * - POST /v1/email/inbound/webhook/sendgrid   - SendGrid inbound webhook
 * - POST /v1/email/inbound/webhook/mailgun    - Mailgun inbound webhook
 * - POST /v1/email/inbound/webhook/ses        - AWS SES inbound webhook
 * - POST /v1/email/inbound/webhook/generic    - Generic MIME webhook
 * - GET  /v1/email/:id/raw                    - Get raw MIME email from S3
 * - GET  /v1/email/:id/thread                 - Get email conversation thread
 * - POST /v1/email/routing-rules              - Create routing rule
 * - GET  /v1/email/routing-rules              - List routing rules
 * - PUT  /v1/email/routing-rules/:id          - Update routing rule
 * - DELETE /v1/email/routing-rules/:id        - Delete routing rule
 */

import { Hono } from 'hono';
import { query } from '../db/index.js';
import emailParser from '../services/email-parser.js';
import * as conversationService from '../services/conversation-service.js';
import crypto from 'crypto';

const emailInbound = new Hono();

/**
 * SendGrid Inbound Webhook
 * POST /v1/email/inbound/webhook/sendgrid
 *
 * SendGrid sends multipart/form-data with email content
 */
emailInbound.post('/webhook/sendgrid', async (c) => {
  try {
    const formData = await c.req.formData();

    // Extract SendGrid inbound fields
    const from = formData.get('from');
    const to = formData.get('to');
    const subject = formData.get('subject');
    const text = formData.get('text');
    const html = formData.get('html');
    const senderIp = formData.get('sender_ip');
    const spamScore = parseFloat(formData.get('spam_score')) || 0;
    const envelope = formData.get('envelope'); // JSON string
    const charsets = formData.get('charsets'); // JSON string

    // Parse envelope
    let envelopeData = null;
    try {
      envelopeData = envelope ? JSON.parse(envelope) : null;
    } catch (e) {
      console.warn('[Inbound] Failed to parse envelope:', e.message);
    }

    // Determine tenant from recipient email
    const recipientEmail = to.split(',')[0].trim(); // First recipient
    const tenant = await findTenantByEmail(recipientEmail);

    if (!tenant) {
      console.warn('[Inbound] No tenant found for recipient:', recipientEmail);
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Store email in database
    const emailResult = await query(
      `INSERT INTO emails (
        tenant_id,
        direction,
        from_email,
        to_email,
        subject,
        html_body,
        text_body,
        status,
        provider,
        spam_score,
        is_spam,
        parsed_headers,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id`,
      [
        tenant.id,
        'inbound',
        from,
        to,
        subject,
        html || null,
        text || null,
        'received',
        'sendgrid',
        spamScore,
        spamScore > 5.0, // SendGrid spam score > 5 is likely spam
        JSON.stringify({ sender_ip: senderIp, envelope: envelopeData }),
      ]
    );

    const emailId = emailResult.rows[0].id;

    // Handle attachments if present
    const attachmentCount = parseInt(formData.get('attachments')) || 0;
    if (attachmentCount > 0) {
      await handleSendGridAttachments(formData, emailId, tenant.id);
    }

    // Auto-create or update conversation in Unified Inbox
    try {
      const senderEmail = from.match(/<(.+?)>/) ? from.match(/<(.+?)>/)[1] : from;
      const senderName = from.match(/^(.+?)\s*</) ? from.match(/^(.+?)\s*</)[1].trim() : senderEmail;
      const messagePreview = (text || html || '').substring(0, 255).replace(/<[^>]*>/g, '').trim();

      // Find or create customer ID
      const customerId = await conversationService.findCustomerByIdentifier(
        tenant.id,
        senderEmail,
        'email'
      );

      // Find or create conversation
      const conversationId = await conversationService.findOrCreateConversation({
        tenantId: tenant.id,
        channel: 'email',
        customerIdentifier: senderEmail,
        customerName: senderName,
        subject: subject || '(no subject)',
        lastMessagePreview: messagePreview,
        lastMessageDirection: 'inbound',
        customerId,
        channelConversationId: emailId.toString()
      });

      // Add message to conversation
      await conversationService.addMessageToConversation({
        conversationId,
        direction: 'inbound',
        senderType: 'customer',
        content: text || '',
        contentHtml: html || null,
        channelMessageId: emailId.toString(),
        status: 'received'
      });

      console.log(`  📬 Conversation ${conversationId} updated for email ${emailId}`);
    } catch (convError) {
      console.error('  ⚠️  Failed to create/update conversation:', convError.message);
      // Don't fail email processing if conversation creation fails
    }

    // Process routing rules
    await processRoutingRules(emailId, tenant.id, {
      from,
      to,
      subject,
      body: text,
    });

    console.log(`[Inbound] SendGrid email received: ${emailId}`);

    return c.json({
      success: true,
      email_id: emailId,
      message: 'Email received',
    });
  } catch (error) {
    console.error('[Inbound] SendGrid webhook error:', error);
    return c.json({
      error: 'Failed to process inbound email',
      message: error.message,
    }, 500);
  }
});

/**
 * Mailgun Inbound Webhook
 * POST /v1/email/inbound/webhook/mailgun
 */
emailInbound.post('/webhook/mailgun', async (c) => {
  try {
    const formData = await c.req.formData();

    // Verify Mailgun signature
    const signature = formData.get('signature');
    const timestamp = formData.get('timestamp');
    const token = formData.get('token');

    if (!verifyMailgunSignature(timestamp, token, signature)) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Extract Mailgun fields
    const from = formData.get('from') || formData.get('From');
    const to = formData.get('recipient') || formData.get('To');
    const subject = formData.get('subject') || formData.get('Subject');
    const text = formData.get('body-plain') || formData.get('stripped-text');
    const html = formData.get('body-html') || formData.get('stripped-html');
    const messageId = formData.get('Message-Id');
    const inReplyTo = formData.get('In-Reply-To');

    // Determine tenant
    const tenant = await findTenantByEmail(to);
    if (!tenant) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Store email
    const emailResult = await query(
      `INSERT INTO emails (
        tenant_id,
        direction,
        from_email,
        to_email,
        subject,
        html_body,
        text_body,
        message_id,
        in_reply_to,
        status,
        provider,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        tenant.id,
        'inbound',
        from,
        to,
        subject,
        html || null,
        text || null,
        messageId,
        inReplyTo || null,
        'received',
        'mailgun',
      ]
    );

    const emailId = emailResult.rows[0].id;

    // Handle attachments
    const attachmentCount = parseInt(formData.get('attachment-count')) || 0;
    if (attachmentCount > 0) {
      await handleMailgunAttachments(formData, emailId, tenant.id, attachmentCount);
    }

    // Auto-create or update conversation in Unified Inbox
    try {
      const senderEmail = from.match(/<(.+?)>/) ? from.match(/<(.+?)>/)[1] : from;
      const senderName = from.match(/^(.+?)\s*</) ? from.match(/^(.+?)\s*</)[1].trim() : senderEmail;
      const messagePreview = (text || html || '').substring(0, 255).replace(/<[^>]*>/g, '').trim();

      const customerId = await conversationService.findCustomerByIdentifier(tenant.id, senderEmail, 'email');

      const conversationId = await conversationService.findOrCreateConversation({
        tenantId: tenant.id,
        channel: 'email',
        customerIdentifier: senderEmail,
        customerName: senderName,
        subject: subject || '(no subject)',
        lastMessagePreview: messagePreview,
        lastMessageDirection: 'inbound',
        customerId,
        channelConversationId: emailId.toString()
      });

      await conversationService.addMessageToConversation({
        conversationId,
        direction: 'inbound',
        senderType: 'customer',
        content: text || '',
        contentHtml: html || null,
        channelMessageId: emailId.toString(),
        status: 'received'
      });

      console.log(`  📬 Conversation ${conversationId} updated for email ${emailId}`);
    } catch (convError) {
      console.error('  ⚠️  Failed to create/update conversation:', convError.message);
    }

    // Process routing rules
    await processRoutingRules(emailId, tenant.id, { from, to, subject, body: text });

    return c.json({ success: true, email_id: emailId });
  } catch (error) {
    console.error('[Inbound] Mailgun webhook error:', error);
    return c.json({ error: 'Failed to process email', message: error.message }, 500);
  }
});

/**
 * Generic MIME Webhook
 * POST /v1/email/inbound/webhook/generic
 *
 * Accepts raw MIME email content
 */
emailInbound.post('/webhook/generic', async (c) => {
  try {
    const rawEmail = await c.req.text();

    // Parse MIME email
    const parsed = await emailParser.parseEmail(rawEmail);

    // Determine tenant from recipient
    const recipientEmail = parsed.to[0];
    const tenant = await findTenantByEmail(recipientEmail);

    if (!tenant) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Upload raw email to S3
    const s3Key = await emailParser.uploadRawEmailToS3(rawEmail, tenant.id);

    // Store email in database
    const emailResult = await query(
      `INSERT INTO emails (
        tenant_id,
        direction,
        from_email,
        to_email,
        subject,
        html_body,
        text_body,
        message_id,
        in_reply_to,
        references,
        raw_email_s3_key,
        spam_score,
        is_spam,
        parsed_headers,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING id`,
      [
        tenant.id,
        'inbound',
        parsed.from,
        parsed.to.join(', '),
        parsed.subject,
        parsed.htmlBody,
        parsed.textBody,
        parsed.messageId,
        parsed.inReplyTo,
        parsed.references,
        s3Key,
        parsed.spamScore,
        parsed.isSpam,
        JSON.stringify(parsed.rawHeaders),
        'received',
      ]
    );

    const emailId = emailResult.rows[0].id;

    // Handle attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        const s3Data = await emailParser.uploadAttachmentToS3(attachment, tenant.id, emailId);

        await query(
          `INSERT INTO email_attachments (
            email_id,
            filename,
            content_type,
            size_bytes,
            s3_key,
            virus_scan_status
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [emailId, s3Data.filename, s3Data.contentType, s3Data.size, s3Data.s3Key, 'pending']
        );
      }
    }

    // Auto-create or update conversation in Unified Inbox
    try {
      const senderEmail = parsed.from.match(/<(.+?)>/) ? parsed.from.match(/<(.+?)>/)[1] : parsed.from;
      const senderName = parsed.from.match(/^(.+?)\s*</) ? parsed.from.match(/^(.+?)\s*</)[1].trim() : senderEmail;
      const messagePreview = (parsed.textBody || parsed.htmlBody || '').substring(0, 255).replace(/<[^>]*>/g, '').trim();

      const customerId = await conversationService.findCustomerByIdentifier(tenant.id, senderEmail, 'email');

      const conversationId = await conversationService.findOrCreateConversation({
        tenantId: tenant.id,
        channel: 'email',
        customerIdentifier: senderEmail,
        customerName: senderName,
        subject: parsed.subject || '(no subject)',
        lastMessagePreview: messagePreview,
        lastMessageDirection: 'inbound',
        customerId,
        channelConversationId: emailId.toString()
      });

      await conversationService.addMessageToConversation({
        conversationId,
        direction: 'inbound',
        senderType: 'customer',
        content: parsed.textBody || '',
        contentHtml: parsed.htmlBody || null,
        channelMessageId: emailId.toString(),
        status: 'received'
      });

      console.log(`  📬 Conversation ${conversationId} updated for email ${emailId}`);
    } catch (convError) {
      console.error('  ⚠️  Failed to create/update conversation:', convError.message);
    }

    // Process routing rules
    await processRoutingRules(emailId, tenant.id, {
      from: parsed.from,
      to: parsed.to.join(', '),
      subject: parsed.subject,
      body: parsed.textBody,
    });

    return c.json({ success: true, email_id: emailId });
  } catch (error) {
    console.error('[Inbound] Generic webhook error:', error);
    return c.json({ error: 'Failed to process email', message: error.message }, 500);
  }
});

/**
 * Get raw MIME email
 * GET /v1/email/:id/raw
 */
emailInbound.get('/:id/raw', async (c) => {
  try {
    const emailId = c.req.param('id');
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT raw_email_s3_key, from_email, subject
       FROM emails
       WHERE id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Email not found' }, 404);
    }

    const email = result.rows[0];

    if (!email.raw_email_s3_key) {
      return c.json({ error: 'Raw email not available' }, 404);
    }

    // Generate presigned URL for S3 download
    // TODO: Implement S3 presigned URL generation
    const downloadUrl = `https://s3.amazonaws.com/${process.env.S3_BUCKET_NAME}/${email.raw_email_s3_key}`;

    return c.json({
      email_id: emailId,
      s3_key: email.raw_email_s3_key,
      download_url: downloadUrl,
      from: email.from_email,
      subject: email.subject,
    });
  } catch (error) {
    console.error('[Inbound] Get raw email error:', error);
    return c.json({ error: 'Failed to fetch raw email', message: error.message }, 500);
  }
});

/**
 * Get email conversation thread
 * GET /v1/email/:id/thread
 */
emailInbound.get('/:id/thread', async (c) => {
  try {
    const emailId = c.req.param('id');
    const tenantId = c.get('tenantId');

    // Use database function to get thread
    const result = await query(`SELECT * FROM get_email_thread($1)`, [emailId]);

    // Verify tenant ownership
    const threadEmails = result.rows;
    if (threadEmails.length > 0 && threadEmails[0].tenant_id !== tenantId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    return c.json({
      email_id: emailId,
      thread_count: threadEmails.length,
      emails: threadEmails,
    });
  } catch (error) {
    console.error('[Inbound] Get thread error:', error);
    return c.json({ error: 'Failed to fetch thread', message: error.message }, 500);
  }
});

/**
 * Create routing rule
 * POST /v1/email/routing-rules
 */
emailInbound.post('/routing-rules', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const result = await query(
      `INSERT INTO email_routing_rules (
        tenant_id,
        name,
        description,
        from_pattern,
        to_pattern,
        subject_pattern,
        body_pattern,
        webhook_url,
        forward_to_email,
        auto_response_template_id,
        tag,
        enabled,
        priority,
        stop_processing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        tenantId,
        body.name,
        body.description || null,
        body.from_pattern || null,
        body.to_pattern || null,
        body.subject_pattern || null,
        body.body_pattern || null,
        body.webhook_url || null,
        body.forward_to_email || null,
        body.auto_response_template_id || null,
        body.tag || null,
        body.enabled !== false,
        body.priority || 0,
        body.stop_processing || false,
      ]
    );

    return c.json({ routing_rule: result.rows[0] }, 201);
  } catch (error) {
    console.error('[Inbound] Create routing rule error:', error);
    return c.json({ error: 'Failed to create routing rule', message: error.message }, 500);
  }
});

/**
 * List routing rules
 * GET /v1/email/routing-rules
 */
emailInbound.get('/routing-rules', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT * FROM email_routing_rules
       WHERE tenant_id = $1
       ORDER BY priority DESC, created_at DESC`,
      [tenantId]
    );

    return c.json({
      routing_rules: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[Inbound] List routing rules error:', error);
    return c.json({ error: 'Failed to list routing rules', message: error.message }, 500);
  }
});

/**
 * Update routing rule
 * PUT /v1/email/routing-rules/:id
 */
emailInbound.put('/routing-rules/:id', async (c) => {
  try {
    const ruleId = c.req.param('id');
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const result = await query(
      `UPDATE email_routing_rules
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           from_pattern = COALESCE($3, from_pattern),
           to_pattern = COALESCE($4, to_pattern),
           subject_pattern = COALESCE($5, subject_pattern),
           webhook_url = COALESCE($6, webhook_url),
           forward_to_email = COALESCE($7, forward_to_email),
           enabled = COALESCE($8, enabled),
           priority = COALESCE($9, priority),
           updated_at = NOW()
       WHERE id = $10 AND tenant_id = $11
       RETURNING *`,
      [
        body.name,
        body.description,
        body.from_pattern,
        body.to_pattern,
        body.subject_pattern,
        body.webhook_url,
        body.forward_to_email,
        body.enabled,
        body.priority,
        ruleId,
        tenantId,
      ]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Routing rule not found' }, 404);
    }

    return c.json({ routing_rule: result.rows[0] });
  } catch (error) {
    console.error('[Inbound] Update routing rule error:', error);
    return c.json({ error: 'Failed to update routing rule', message: error.message }, 500);
  }
});

/**
 * Delete routing rule
 * DELETE /v1/email/routing-rules/:id
 */
emailInbound.delete('/routing-rules/:id', async (c) => {
  try {
    const ruleId = c.req.param('id');
    const tenantId = c.get('tenantId');

    const result = await query(
      `DELETE FROM email_routing_rules
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [ruleId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Routing rule not found' }, 404);
    }

    return c.json({ success: true, message: 'Routing rule deleted' });
  } catch (error) {
    console.error('[Inbound] Delete routing rule error:', error);
    return c.json({ error: 'Failed to delete routing rule', message: error.message }, 500);
  }
});

/**
 * Helper: Find tenant by recipient email
 */
async function findTenantByEmail(email) {
  // Check if email matches tenant's inbound email pattern
  // For now, simple lookup by domain or specific email
  const result = await query(
    `SELECT t.id, t.company_name
     FROM tenants t
     JOIN phone_numbers pn ON pn.tenant_id = t.id
     WHERE pn.email_address = $1
     LIMIT 1`,
    [email]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Fallback: extract domain and find tenant
  const domain = email.split('@')[1];
  const domainResult = await query(
    `SELECT t.id, t.company_name
     FROM tenants t
     WHERE t.domain = $1
     LIMIT 1`,
    [domain]
  );

  return domainResult.rows.length > 0 ? domainResult.rows[0] : null;
}

/**
 * Helper: Process routing rules for an email
 */
async function processRoutingRules(emailId, tenantId, emailData) {
  try {
    // Get all active rules for tenant
    const rulesResult = await query(
      `SELECT * FROM email_routing_rules
       WHERE tenant_id = $1 AND enabled = true
       ORDER BY priority DESC`,
      [tenantId]
    );

    for (const rule of rulesResult.rows) {
      let matched = true;

      // Check from pattern
      if (rule.from_pattern && !matchesPattern(emailData.from, rule.from_pattern)) {
        matched = false;
      }

      // Check to pattern
      if (rule.to_pattern && !matchesPattern(emailData.to, rule.to_pattern)) {
        matched = false;
      }

      // Check subject pattern
      if (rule.subject_pattern && !matchesPattern(emailData.subject, rule.subject_pattern)) {
        matched = false;
      }

      // Check body pattern
      if (rule.body_pattern && !matchesPattern(emailData.body, rule.body_pattern)) {
        matched = false;
      }

      if (matched) {
        // Execute rule actions
        await executeRuleActions(rule, emailId, emailData);

        // Log execution
        await query(
          `INSERT INTO email_routing_executions (rule_id, email_id, action_taken, success)
           VALUES ($1, $2, $3, $4)`,
          [rule.id, emailId, 'matched', true]
        );

        // Stop processing if rule says so
        if (rule.stop_processing) {
          break;
        }
      }
    }
  } catch (error) {
    console.error('[Inbound] Routing rules error:', error);
  }
}

/**
 * Helper: Check if text matches pattern (regex)
 */
function matchesPattern(text, pattern) {
  if (!text || !pattern) return false;
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(text);
  } catch (e) {
    console.error('[Inbound] Invalid regex pattern:', pattern, e.message);
    return false;
  }
}

/**
 * Helper: Execute routing rule actions
 */
async function executeRuleActions(rule, emailId, emailData) {
  // Webhook
  if (rule.webhook_url) {
    try {
      await fetch(rule.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: emailId,
          from: emailData.from,
          to: emailData.to,
          subject: emailData.subject,
          body: emailData.body,
        }),
      });
    } catch (error) {
      console.error('[Inbound] Webhook failed:', error);
    }
  }

  // Forward email (TODO: Implement forwarding)
  if (rule.forward_to_email) {
    console.log('[Inbound] Forward email to:', rule.forward_to_email);
  }

  // Auto-response (TODO: Implement auto-response)
  if (rule.auto_response_template_id) {
    console.log('[Inbound] Send auto-response template:', rule.auto_response_template_id);
  }

  // Tag email
  if (rule.tag) {
    await query(`UPDATE emails SET tags = array_append(tags, $1) WHERE id = $2`, [rule.tag, emailId]);
  }
}

/**
 * Helper: Verify Mailgun signature
 */
function verifyMailgunSignature(timestamp, token, signature) {
  const signingKey = process.env.MAILGUN_SIGNING_KEY;
  if (!signingKey) return true; // Skip verification if key not configured

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(timestamp + token);
  const calculatedSignature = hmac.digest('hex');

  return calculatedSignature === signature;
}

/**
 * Helper: Handle SendGrid attachments
 */
async function handleSendGridAttachments(formData, emailId, tenantId) {
  // SendGrid sends attachments as attachment1, attachment2, etc.
  const attachmentCount = parseInt(formData.get('attachments')) || 0;

  for (let i = 1; i <= attachmentCount; i++) {
    const file = formData.get(`attachment${i}`);
    if (file) {
      // Upload to S3 and store in database
      // TODO: Implement attachment handling
      console.log(`[Inbound] Attachment ${i}:`, file.name);
    }
  }
}

/**
 * Helper: Handle Mailgun attachments
 */
async function handleMailgunAttachments(formData, emailId, tenantId, count) {
  for (let i = 1; i <= count; i++) {
    const file = formData.get(`attachment-${i}`);
    if (file) {
      console.log(`[Inbound] Mailgun attachment ${i}:`, file.name);
    }
  }
}

export default emailInbound;
