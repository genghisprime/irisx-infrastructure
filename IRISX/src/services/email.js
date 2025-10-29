/**
 * Email Service
 *
 * Multi-provider email delivery with:
 * - SendGrid, AWS SES, Postmark, Mailgun support
 * - Template rendering with variable substitution
 * - Attachment handling (S3 storage)
 * - Open and click tracking
 * - Bounce and unsubscribe handling
 * - Queue-based delivery (async)
 *
 * Phase 1, Week 11-12
 */

import { query } from '../db/index.js';
import crypto from 'crypto';

class EmailService {
  constructor() {
    this.deliveryQueue = [];
    this.isProcessing = false;
    this.maxConcurrentDeliveries = 5;
  }

  /**
   * Send an email
   * @param {Object} params
   * @param {number} params.tenantId - Tenant ID
   * @param {string} params.to - Recipient email
   * @param {string} params.toName - Recipient name (optional)
   * @param {string} params.from - Sender email (optional, uses tenant default)
   * @param {string} params.fromName - Sender name (optional)
   * @param {string} params.subject - Email subject
   * @param {string} params.bodyText - Plain text body
   * @param {string} params.bodyHtml - HTML body
   * @param {string} params.replyTo - Reply-to email (optional)
   * @param {Array} params.cc - CC recipients (optional)
   * @param {Array} params.bcc - BCC recipients (optional)
   * @param {Array} params.attachments - Attachments (optional)
   * @param {Array} params.tags - Tags for categorization (optional)
   * @param {string} params.emailType - transactional or marketing (default: transactional)
   */
  async sendEmail(params) {
    try {
      const {
        tenantId,
        to,
        toName,
        from,
        fromName,
        subject,
        bodyText,
        bodyHtml,
        replyTo,
        cc,
        bcc,
        attachments,
        tags,
        emailType = 'transactional'
      } = params;

      // Validate required fields
      if (!to || !subject || (!bodyText && !bodyHtml)) {
        throw new Error('Missing required fields: to, subject, and body (text or html)');
      }

      // Check email suppression list
      const canSend = await this.checkSuppressionList(tenantId, to);
      if (!canSend) {
        throw new Error(`Email address ${to} is suppressed (bounced or unsubscribed)`);
      }

      // Get tenant email configuration
      const configResult = await query(
        `SELECT tec.*, ep.provider_name
         FROM tenant_email_config tec
         LEFT JOIN email_providers ep ON ep.id = tec.email_provider_id
         WHERE tec.tenant_id = $1`,
        [tenantId]
      );

      if (configResult.rows.length === 0) {
        throw new Error('Tenant email not configured');
      }

      const config = configResult.rows[0];

      // Use tenant default from if not provided
      const finalFrom = from || config.from_email;
      const finalFromName = fromName || config.from_name;
      const finalReplyTo = replyTo || config.reply_to_email;

      if (!finalFrom) {
        throw new Error('No from email specified');
      }

      // Generate internal message ID
      const internalId = crypto.randomUUID();

      // Create email record
      const emailResult = await query(
        `INSERT INTO emails (
          tenant_id, internal_id, from_email, from_name, to_email, to_name,
          cc_emails, bcc_emails, reply_to_email,
          subject, body_text, body_html,
          status, email_type, tags,
          has_attachments, attachment_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
        [
          tenantId,
          internalId,
          finalFrom,
          finalFromName || null,
          to,
          toName || null,
          cc || [],
          bcc || [],
          finalReplyTo || null,
          subject,
          bodyText || null,
          bodyHtml || null,
          'queued',
          emailType,
          tags || [],
          attachments && attachments.length > 0,
          attachments ? attachments.length : 0
        ]
      );

      const emailId = emailResult.rows[0].id;

      // Handle attachments if provided
      if (attachments && attachments.length > 0) {
        await this.saveAttachments(emailId, tenantId, attachments);
      }

      // Add to delivery queue
      this.deliveryQueue.push({
        emailId,
        tenantId,
        provider: config.provider_name || 'sendgrid',
        apiKey: config.api_key
      });

      // Start processing queue
      this.processQueue();

      return {
        id: emailId,
        internal_id: internalId,
        status: 'queued',
        to,
        subject
      };
    } catch (error) {
      console.error('[Email] Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(params) {
    try {
      const { tenantId, templateSlug, variables, to, toName } = params;

      // Get template
      const templateResult = await query(
        `SELECT subject, body_text, body_html, variables as template_vars
         FROM email_templates
         WHERE tenant_id = $1 AND slug = $2 AND is_active = true`,
        [tenantId, templateSlug]
      );

      if (templateResult.rows.length === 0) {
        throw new Error(`Template ${templateSlug} not found`);
      }

      const template = templateResult.rows[0];

      // Render template with variables
      const subject = this.renderTemplate(template.subject, variables);
      const bodyText = template.body_text ? this.renderTemplate(template.body_text, variables) : null;
      const bodyHtml = template.body_html ? this.renderTemplate(template.body_html, variables) : null;

      // Update template usage stats
      await query(
        `UPDATE email_templates
         SET times_used = times_used + 1, last_used_at = NOW()
         WHERE tenant_id = $1 AND slug = $2`,
        [tenantId, templateSlug]
      );

      // Send email
      return await this.sendEmail({
        ...params,
        subject,
        bodyText,
        bodyHtml
      });
    } catch (error) {
      console.error('[Email] Error sending template email:', error);
      throw error;
    }
  }

  /**
   * Render template with variables
   * Supports {{variable}} syntax
   */
  renderTemplate(template, variables) {
    if (!template) return null;

    let rendered = template;

    for (const [key, value] of Object.entries(variables || {})) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, value);
    }

    return rendered;
  }

  /**
   * Process email delivery queue
   */
  async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.deliveryQueue.length > 0) {
      const batch = this.deliveryQueue.splice(0, this.maxConcurrentDeliveries);

      // Process batch in parallel
      await Promise.all(
        batch.map(item => this.deliverEmail(item))
      );

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
  }

  /**
   * Deliver email via provider
   */
  async deliverEmail({ emailId, tenantId, provider, apiKey }) {
    try {
      // Get email details
      const emailResult = await query(
        `SELECT * FROM emails WHERE id = $1`,
        [emailId]
      );

      if (emailResult.rows.length === 0) {
        console.error(`[Email] Email ${emailId} not found`);
        return;
      }

      const email = emailResult.rows[0];

      // Get attachments if any
      let attachments = [];
      if (email.has_attachments) {
        const attachmentsResult = await query(
          `SELECT * FROM email_attachments WHERE email_id = $1`,
          [emailId]
        );
        attachments = attachmentsResult.rows;
      }

      console.log(`[Email] Delivering email ${emailId} via ${provider}`);

      // Send via provider
      let messageId, statusMessage;

      switch (provider) {
        case 'elasticemail':
          ({ messageId, statusMessage } = await this.sendViaElasticEmail(email, attachments, apiKey));
          break;
        case 'sendgrid':
          ({ messageId, statusMessage } = await this.sendViaSendGrid(email, attachments, apiKey));
          break;
        case 'aws_ses':
          ({ messageId, statusMessage } = await this.sendViaAwsSes(email, attachments, apiKey));
          break;
        case 'postmark':
          ({ messageId, statusMessage } = await this.sendViaPostmark(email, attachments, apiKey));
          break;
        case 'mailgun':
          ({ messageId, statusMessage } = await this.sendViaMailgun(email, attachments, apiKey));
          break;
        case 'resend':
          ({ messageId, statusMessage } = await this.sendViaResend(email, attachments, apiKey));
          break;
        default:
          throw new Error(`Unknown email provider: ${provider}`);
      }

      // Update email status
      await query(
        `UPDATE emails
         SET message_id = $1,
             status = $2,
             status_message = $3,
             sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [messageId, 'sent', statusMessage, emailId]
      );

      console.log(`[Email] ✅ Email ${emailId} sent successfully (${messageId})`);
    } catch (error) {
      console.error(`[Email] Error delivering email ${emailId}:`, error);

      // Update email status to failed
      await query(
        `UPDATE emails
         SET status = $1,
             status_message = $2,
             failed_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        ['failed', error.message, emailId]
      );
    }
  }

  /**
   * Send via SendGrid
   */
  async sendViaSendGrid(email, attachments, apiKey) {
    const payload = {
      personalizations: [{
        to: [{ email: email.to_email, name: email.to_name }],
        subject: email.subject
      }],
      from: {
        email: email.from_email,
        name: email.from_name
      },
      content: []
    };

    // Add text content
    if (email.body_text) {
      payload.content.push({
        type: 'text/plain',
        value: email.body_text
      });
    }

    // Add HTML content
    if (email.body_html) {
      payload.content.push({
        type: 'text/html',
        value: email.body_html
      });
    }

    // Add reply-to
    if (email.reply_to_email) {
      payload.reply_to = { email: email.reply_to_email };
    }

    // Add CC
    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.personalizations[0].cc = email.cc_emails.map(e => ({ email: e }));
    }

    // Add BCC
    if (email.bcc_emails && email.bcc_emails.length > 0) {
      payload.personalizations[0].bcc = email.bcc_emails.map(e => ({ email: e }));
    }

    // Add attachments
    if (attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        content: att.base64_content, // Need to implement base64 encoding
        filename: att.filename,
        type: att.content_type,
        disposition: att.disposition
      }));
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${error}`);
    }

    const messageId = response.headers.get('X-Message-Id') || `sendgrid_${Date.now()}`;

    return {
      messageId,
      statusMessage: 'Sent via SendGrid'
    };
  }

  /**
   * Send via Elastic Email (PRIMARY PROVIDER)
   */
  async sendViaElasticEmail(email, attachments, apiKey) {
    const payload = {
      Recipients: {
        To: [email.to_email]
      },
      Content: {
        Body: [],
        From: email.from_email,
        Subject: email.subject
      }
    };

    // Add from name if provided
    if (email.from_name) {
      payload.Content.FromName = email.from_name;
    }

    // Add reply-to
    if (email.reply_to_email) {
      payload.Content.ReplyTo = email.reply_to_email;
    }

    // Add text content
    if (email.body_text) {
      payload.Content.Body.push({
        ContentType: 'PlainText',
        Content: email.body_text,
        Charset: 'utf-8'
      });
    }

    // Add HTML content
    if (email.body_html) {
      payload.Content.Body.push({
        ContentType: 'HTML',
        Content: email.body_html,
        Charset: 'utf-8'
      });
    }

    // Add CC
    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.Recipients.CC = email.cc_emails;
    }

    // Add BCC
    if (email.bcc_emails && email.bcc_emails.length > 0) {
      payload.Recipients.BCC = email.bcc_emails;
    }

    const response = await fetch('https://api.elasticemail.com/v4/emails', {
      method: 'POST',
      headers: {
        'X-ElasticEmail-ApiKey': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Elastic Email API error: ${error}`);
    }

    const result = await response.json();
    const messageId = result.TransactionID || `elasticemail_${Date.now()}`;

    return {
      messageId,
      statusMessage: 'Sent via Elastic Email'
    };
  }

  /**
   * Send via Resend
   */
  async sendViaResend(email, attachments, apiKey) {
    const payload = {
      from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
      to: [email.to_email],
      subject: email.subject
    };

    // Add text content
    if (email.body_text) {
      payload.text = email.body_text;
    }

    // Add HTML content
    if (email.body_html) {
      payload.html = email.body_html;
    }

    // Add reply-to
    if (email.reply_to_email) {
      payload.reply_to = email.reply_to_email;
    }

    // Add CC
    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.cc = email.cc_emails;
    }

    // Add BCC
    if (email.bcc_emails && email.bcc_emails.length > 0) {
      payload.bcc = email.bcc_emails;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }

    const result = await response.json();
    const messageId = result.id || `resend_${Date.now()}`;

    return {
      messageId,
      statusMessage: 'Sent via Resend'
    };
  }

  /**
   * Send via AWS SES (placeholder)
   */
  async sendViaAwsSes(email, attachments, apiKey) {
    // TODO: Implement AWS SES integration
    throw new Error('AWS SES integration not yet implemented');
  }

  /**
   * Send via Postmark (placeholder)
   */
  async sendViaPostmark(email, attachments, apiKey) {
    // TODO: Implement Postmark integration
    throw new Error('Postmark integration not yet implemented');
  }

  /**
   * Send via Mailgun (placeholder)
   */
  async sendViaMailgun(email, attachments, apiKey) {
    // TODO: Implement Mailgun integration
    throw new Error('Mailgun integration not yet implemented');
  }

  /**
   * Check if email is in suppression list
   */
  async checkSuppressionList(tenantId, email) {
    const result = await query(
      `SELECT check_email_suppression($1, $2) as can_send`,
      [tenantId, email]
    );

    return result.rows[0].can_send;
  }

  /**
   * Save email attachments
   */
  async saveAttachments(emailId, tenantId, attachments) {
    for (const attachment of attachments) {
      await query(
        `INSERT INTO email_attachments (
          email_id, tenant_id, filename, content_type, size_bytes,
          storage_path, storage_url, disposition, content_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          emailId,
          tenantId,
          attachment.filename,
          attachment.content_type || 'application/octet-stream',
          attachment.size_bytes || 0,
          attachment.storage_path || null,
          attachment.storage_url || null,
          attachment.disposition || 'attachment',
          attachment.content_id || null
        ]
      );
    }
  }

  /**
   * Handle email event (webhook from provider)
   */
  async handleEmailEvent({ tenantId, messageId, eventType, eventData }) {
    try {
      // Find email by message_id
      const emailResult = await query(
        `SELECT id FROM emails WHERE message_id = $1 AND tenant_id = $2`,
        [messageId, tenantId]
      );

      if (emailResult.rows.length === 0) {
        console.error(`[Email] Email not found for message_id: ${messageId}`);
        return;
      }

      const emailId = emailResult.rows[0].id;

      // Record event
      await query(
        `INSERT INTO email_events (
          email_id, tenant_id, event_type, event_data, occurred_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [emailId, tenantId, eventType, JSON.stringify(eventData)]
      );

      // Update email status based on event
      let newStatus = null;
      let updateFields = {};

      switch (eventType) {
        case 'delivered':
          newStatus = 'delivered';
          updateFields.delivered_at = 'NOW()';
          break;
        case 'bounced':
          newStatus = 'bounced';
          updateFields.bounced_at = 'NOW()';
          updateFields.bounce_type = eventData.bounce_type || 'unknown';
          updateFields.bounce_reason = eventData.reason || null;
          await this.addToBounceList(tenantId, emailResult.rows[0].to_email, eventData);
          break;
        case 'opened':
          newStatus = 'opened';
          updateFields.opened_at = 'NOW()';
          updateFields.open_count = 'open_count + 1';
          break;
        case 'clicked':
          newStatus = 'clicked';
          updateFields.clicked_at = 'NOW()';
          updateFields.click_count = 'click_count + 1';
          break;
      }

      if (newStatus) {
        const setClause = Object.entries(updateFields)
          .map(([key, value]) => `${key} = ${value}`)
          .join(', ');

        await query(
          `UPDATE emails SET status = $1, ${setClause}, updated_at = NOW() WHERE id = $2`,
          [newStatus, emailId]
        );
      }

      console.log(`[Email] Event ${eventType} recorded for email ${emailId}`);
    } catch (error) {
      console.error('[Email] Error handling email event:', error);
    }
  }

  /**
   * Add email to bounce list
   */
  async addToBounceList(tenantId, email, bounceData) {
    try {
      await query(
        `INSERT INTO email_bounces (
          tenant_id, email_address, bounce_type, bounce_reason, is_suppressed
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, email_address)
        DO UPDATE SET
          bounce_count = email_bounces.bounce_count + 1,
          last_bounced_at = NOW(),
          bounce_type = EXCLUDED.bounce_type,
          bounce_reason = EXCLUDED.bounce_reason,
          is_suppressed = EXCLUDED.is_suppressed`,
        [
          tenantId,
          email,
          bounceData.bounce_type || 'hard',
          bounceData.reason || null,
          bounceData.bounce_type === 'hard' // Only suppress hard bounces
        ]
      );

      console.log(`[Email] Added ${email} to bounce list`);
    } catch (error) {
      console.error('[Email] Error adding to bounce list:', error);
    }
  }

  /**
   * Handle unsubscribe
   */
  async handleUnsubscribe(tenantId, email, reason = null) {
    try {
      await query(
        `INSERT INTO email_unsubscribes (tenant_id, email_address, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, email_address) DO NOTHING`,
        [tenantId, email, reason]
      );

      console.log(`[Email] Unsubscribed ${email}`);
      return { success: true };
    } catch (error) {
      console.error('[Email] Error handling unsubscribe:', error);
      throw error;
    }
  }

  /**
   * Get email statistics
   */
  async getEmailStats(tenantId, dateRange = 30) {
    try {
      const result = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
           COUNT(*) FILTER (WHERE status = 'delivered') as total_delivered,
           COUNT(*) FILTER (WHERE status = 'bounced') as total_bounced,
           COUNT(*) FILTER (WHERE status = 'opened') as total_opened,
           COUNT(*) FILTER (WHERE status = 'clicked') as total_clicked,
           COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
           ROUND(AVG(CASE WHEN status = 'delivered' THEN 100.0 ELSE 0 END), 2) as delivery_rate,
           ROUND(AVG(CASE WHEN status = 'opened' THEN 100.0 ELSE 0 END), 2) as open_rate,
           ROUND(AVG(CASE WHEN status = 'clicked' THEN 100.0 ELSE 0 END), 2) as click_rate
         FROM emails
         WHERE tenant_id = $1
           AND created_at >= NOW() - INTERVAL '${dateRange} days'`,
        [tenantId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[Email] Error getting email stats:', error);
      throw error;
    }
  }
}

// Singleton instance
const emailService = new EmailService();

export default emailService;
