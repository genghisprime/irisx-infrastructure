/**
 * Email Worker
 * Consumes email messages from NATS JetStream and delivers them via email providers
 *
 * Phase 1, Week 4
 */

import natsService from '../services/nats.js';
import { query } from '../db/connection.js';

class EmailWorker {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    console.log('[Email Worker] Starting...');
    this.isRunning = true;

    // Subscribe to email send jobs
    await natsService.subscribe(
      'EMAIL',
      'email.send',
      'email-sender',
      this.handleEmailSend.bind(this)
    );

    console.log('[Email Worker] ✅ Started');
  }

  async handleEmailSend(data, msg) {
    const { emailId, tenantId, provider, apiKey } = data;

    try {
      console.log(`[Email Worker] Processing email ${emailId}`);

      // Get email details
      const emailResult = await query(
        `SELECT * FROM emails WHERE id = $1`,
        [emailId]
      );

      if (emailResult.rows.length === 0) {
        throw new Error('Email not found');
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

      // Send via provider
      let messageId, statusMessage;

      switch (provider) {
        case 'elasticemail':
          ({ messageId, statusMessage } = await this.sendViaElasticEmail(email, attachments, apiKey));
          break;
        case 'sendgrid':
          ({ messageId, statusMessage } = await this.sendViaSendGrid(email, attachments, apiKey));
          break;
        case 'resend':
          ({ messageId, statusMessage } = await this.sendViaResend(email, attachments, apiKey));
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
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

      console.log(`[Email Worker] ✅ Email ${emailId} sent successfully (${messageId})`);
    } catch (error) {
      console.error(`[Email Worker] Error sending email ${emailId}:`, error);

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

      throw error;  // Will cause NATS to retry
    }
  }

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

    if (email.from_name) {
      payload.Content.FromName = email.from_name;
    }

    if (email.reply_to_email) {
      payload.Content.ReplyTo = email.reply_to_email;
    }

    if (email.body_text) {
      payload.Content.Body.push({
        ContentType: 'PlainText',
        Content: email.body_text,
        Charset: 'utf-8'
      });
    }

    if (email.body_html) {
      payload.Content.Body.push({
        ContentType: 'HTML',
        Content: email.body_html,
        Charset: 'utf-8'
      });
    }

    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.Recipients.CC = email.cc_emails;
    }

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

    if (email.body_text) {
      payload.content.push({
        type: 'text/plain',
        value: email.body_text
      });
    }

    if (email.body_html) {
      payload.content.push({
        type: 'text/html',
        value: email.body_html
      });
    }

    if (email.reply_to_email) {
      payload.reply_to = { email: email.reply_to_email };
    }

    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.personalizations[0].cc = email.cc_emails.map(e => ({ email: e }));
    }

    if (email.bcc_emails && email.bcc_emails.length > 0) {
      payload.personalizations[0].bcc = email.bcc_emails.map(e => ({ email: e }));
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

  async sendViaResend(email, attachments, apiKey) {
    const payload = {
      from: email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email,
      to: [email.to_email],
      subject: email.subject
    };

    if (email.body_text) {
      payload.text = email.body_text;
    }

    if (email.body_html) {
      payload.html = email.body_html;
    }

    if (email.reply_to_email) {
      payload.reply_to = email.reply_to_email;
    }

    if (email.cc_emails && email.cc_emails.length > 0) {
      payload.cc = email.cc_emails;
    }

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

  async stop() {
    console.log('[Email Worker] Stopping...');
    this.isRunning = false;
  }
}

const worker = new EmailWorker();
worker.start().catch(err => {
  console.error('[Email Worker] Fatal error:', err);
  process.exit(1);
});

export default worker;
