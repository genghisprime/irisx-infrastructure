/**
 * Custom SMTP Provider Adapter
 * For your future self-hosted email server
 * Uses nodemailer for SMTP transport
 */

import nodemailer from 'nodemailer';

export class CustomSMTPProvider {
  constructor(credentials) {
    this.host = credentials.smtp_host;
    this.port = credentials.smtp_port || 587;
    this.secure = credentials.smtp_secure || false; // true for 465, false for other ports
    this.user = credentials.smtp_user;
    this.password = credentials.smtp_password;
    this.fromEmail = credentials.from_email;
    this.fromName = credentials.from_name || 'IRISX';

    // Create reusable transporter
    this.transporter = nodemailer.createTransporter({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: {
        user: this.user,
        pass: this.password
      },
      pool: true, // Use pooled connections
      maxConnections: 5,
      maxMessages: 100
    });
  }

  /**
   * Send email via custom SMTP server
   */
  async send(emailData) {
    const { to, subject, html, text, from, replyTo, attachments } = emailData;

    const mailOptions = {
      from: `"${this.fromName}" <${from || this.fromEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
      replyTo: replyTo || this.fromEmail
    };

    // Add attachments
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.type
      }));
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: 'custom-smtp',
        response: info
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'custom-smtp'
      };
    }
  }

  /**
   * Test connection to SMTP server
   */
  async testConnection() {
    try {
      await this.transporter.verify();

      return {
        success: true,
        message: 'Custom SMTP connection successful',
        serverInfo: {
          host: this.host,
          port: this.port,
          secure: this.secure
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection failed: ${error.message}`
      };
    }
  }

  /**
   * Get provider statistics (not available for basic SMTP)
   */
  async getStats(startDate, endDate) {
    // Custom SMTP servers don't typically provide stats via API
    // You would need to implement this by querying your own database
    return null;
  }

  /**
   * Close the transporter pool
   */
  close() {
    this.transporter.close();
  }
}

export default CustomSMTPProvider;
