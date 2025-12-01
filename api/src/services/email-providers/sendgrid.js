/**
 * SendGrid (Twilio) Provider Adapter
 * Documentation: https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */

export class SendGridProvider {
  constructor(credentials) {
    this.apiKey = credentials.api_key;
    this.apiEndpoint = credentials.api_endpoint || 'https://api.sendgrid.com/v3';
    this.fromEmail = credentials.from_email;
    this.fromName = credentials.from_name || 'IRISX';
  }

  /**
   * Send email via SendGrid API
   */
  async send(emailData) {
    const { to, subject, html, text, from, replyTo, attachments } = emailData;

    // Build SendGrid payload
    const payload = {
      personalizations: [{
        to: Array.isArray(to)
          ? to.map(email => ({ email }))
          : [{ email: to }]
      }],
      from: {
        email: from || this.fromEmail,
        name: this.fromName
      },
      subject,
      content: []
    };

    // Add content
    if (text) {
      payload.content.push({
        type: 'text/plain',
        value: text
      });
    }

    if (html) {
      payload.content.push({
        type: 'text/html',
        value: html
      });
    }

    // Add reply-to
    if (replyTo) {
      payload.reply_to = { email: replyTo };
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        content: att.content,
        filename: att.filename,
        type: att.type || 'application/octet-stream',
        disposition: att.disposition || 'attachment'
      }));
    }

    try {
      const response = await fetch(`${this.apiEndpoint}/mail/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // SendGrid returns 202 on success with no body
      if (response.status === 202) {
        return {
          success: true,
          messageId: response.headers.get('x-message-id'),
          provider: 'sendgrid',
          response: { status: 202 }
        };
      }

      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return {
        success: false,
        error: errorData.errors?.[0]?.message || errorData.message || 'SendGrid API error',
        provider: 'sendgrid'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'sendgrid'
      };
    }
  }

  /**
   * Test connection to SendGrid
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.apiEndpoint}/scopes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `SendGrid connection failed: ${errorText}`
        };
      }

      const scopes = await response.json();

      return {
        success: true,
        message: 'SendGrid connection successful',
        accountInfo: {
          scopes: scopes.scopes || [],
          scopeCount: (scopes.scopes || []).length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get provider statistics
   */
  async getStats(startDate, endDate) {
    try {
      const params = new URLSearchParams({
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        aggregated_by: 'day'
      });

      const response = await fetch(`${this.apiEndpoint}/stats?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch SendGrid stats');
      }

      const stats = await response.json();

      // Aggregate stats across all dates
      const totals = stats.reduce((acc, day) => {
        const metrics = day.stats[0]?.metrics || {};
        return {
          sent: acc.sent + (metrics.requests || 0),
          delivered: acc.delivered + (metrics.delivered || 0),
          bounced: acc.bounced + (metrics.bounces || 0),
          opened: acc.opened + (metrics.unique_opens || 0),
          clicked: acc.clicked + (metrics.unique_clicks || 0)
        };
      }, { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0 });

      return totals;
    } catch (error) {
      console.error('[SendGrid] Failed to fetch stats:', error);
      return null;
    }
  }
}

export default SendGridProvider;
