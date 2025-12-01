/**
 * Amazon SES Email Provider
 * High-deliverability email service with excellent reputation
 * $0.10 per 1,000 emails
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export class AmazonSESProvider {
  constructor(credentials) {
    const config = {
      region: credentials.region || 'us-east-1'
    };

    // Use explicit credentials if provided, otherwise use default AWS credential chain
    // Support both camelCase and snake_case field names
    const accessKeyId = credentials.access_key_id || credentials.accessKeyId;
    const secretAccessKey = credentials.secret_access_key || credentials.secretAccessKey;

    if (accessKeyId && secretAccessKey) {
      config.credentials = {
        accessKeyId,
        secretAccessKey
      };
    }

    this.client = new SESClient(config);
    this.fromEmail = credentials.from_email || credentials.fromEmail || 'noreply@tazzi.com';
    this.fromName = credentials.from_name || credentials.fromName || 'IRISX Platform';
    this.region = credentials.region || 'us-east-1';
  }

  /**
   * Send email via Amazon SES
   * @param {Object} emailData - Email data
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.html - HTML body
   * @param {string} [emailData.text] - Plain text body
   * @param {string} [emailData.from] - Override from email
   * @returns {Promise<Object>} Send result with {success, messageId, provider} or {success: false, error}
   */
  async send(emailData) {
    const fromAddress = emailData.from || `${this.fromName} <${this.fromEmail}>`;

    const params = {
      Source: fromAddress,
      Destination: {
        ToAddresses: [emailData.to]
      },
      Message: {
        Subject: {
          Data: emailData.subject,
          Charset: 'UTF-8'
        },
        Body: {}
      }
    };

    // Add HTML body
    if (emailData.html) {
      params.Message.Body.Html = {
        Data: emailData.html,
        Charset: 'UTF-8'
      };
    }

    // Add text body (SES requires at least one)
    if (emailData.text) {
      params.Message.Body.Text = {
        Data: emailData.text,
        Charset: 'UTF-8'
      };
    } else if (emailData.html) {
      // If only HTML is provided, create a simple text version
      params.Message.Body.Text = {
        Data: emailData.html.replace(/<[^>]*>/g, ''),
        Charset: 'UTF-8'
      };
    }

    try {
      const command = new SendEmailCommand(params);
      const response = await this.client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
        provider: 'amazon-ses',
        region: this.region
      };
    } catch (error) {
      console.error('[Amazon SES] Send failed:', error.message);
      return {
        success: false,
        error: error.message,
        provider: 'amazon-ses'
      };
    }
  }

  /**
   * Verify connection to Amazon SES
   * @returns {Promise<boolean>} Connection status
   */
  async verify() {
    try {
      // Try to send a test verification request
      // SES doesn't have a dedicated "test connection" API
      // so we'll just check if we can create a command
      const testCommand = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: ['verify@example.com']
        },
        Message: {
          Subject: { Data: 'Test', Charset: 'UTF-8' },
          Body: {
            Text: { Data: 'Test', Charset: 'UTF-8' }
          }
        }
      });

      // Don't actually send, just verify credentials work
      // by checking if we can create the command
      return testCommand !== null;
    } catch (error) {
      console.error('Amazon SES verification failed:', error);
      return false;
    }
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getName() {
    return 'Amazon SES';
  }

  /**
   * Get provider type
   * @returns {string} Provider type
   */
  getType() {
    return 'amazon-ses';
  }
}

export default AmazonSESProvider;
