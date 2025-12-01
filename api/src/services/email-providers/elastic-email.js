/**
 * Elastic Email Provider Adapter
 * Documentation: https://elasticemail.com/developers/api-documentation
 */

export class ElasticEmailProvider {
  constructor(credentials) {
    this.apiKey = credentials.api_key;
    this.apiEndpoint = credentials.api_endpoint || 'https://api.elasticemail.com/v2';
    this.fromEmail = credentials.from_email;
    this.fromName = credentials.from_name || 'IRISX';
  }

  /**
   * Send email via Elastic Email API
   */
  async send(emailData) {
    const { to, subject, html, text, from, replyTo, attachments } = emailData;

    const payload = {
      apikey: this.apiKey,
      from: from || this.fromEmail,
      fromName: this.fromName,
      to: Array.isArray(to) ? to.join(';') : to,
      subject,
      bodyHtml: html,
      bodyText: text,
      replyTo: replyTo || this.fromEmail
    };

    // Add attachments if present
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }

    try {
      const response = await fetch(`${this.apiEndpoint}/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Elastic Email API error');
      }

      return {
        success: true,
        messageId: result.data.messageid,
        provider: 'elastic-email',
        response: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'elastic-email'
      };
    }
  }

  /**
   * Test connection to Elastic Email
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.apiEndpoint}/account/profileoverview?apikey=${this.apiKey}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        return {
          success: false,
          message: result.error || 'Failed to connect to Elastic Email'
        };
      }

      return {
        success: true,
        message: 'Elastic Email connection successful',
        accountInfo: {
          email: result.data.email,
          credit: result.data.credit,
          reputation: result.data.reputation
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
        apikey: this.apiKey,
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      });

      const response = await fetch(`${this.apiEndpoint}/log/summary?${params}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch stats');
      }

      return {
        sent: result.data.sent || 0,
        delivered: result.data.delivered || 0,
        bounced: result.data.bounced || 0,
        opened: result.data.opened || 0,
        clicked: result.data.clicked || 0
      };
    } catch (error) {
      console.error('[Elastic Email] Failed to fetch stats:', error);
      return null;
    }
  }
}

export default ElasticEmailProvider;
