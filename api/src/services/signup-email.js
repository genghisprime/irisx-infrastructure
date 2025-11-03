/**
 * Signup Email Service
 * Handles email verification for customer self-signup
 */

import pool from '../db/connection.js';

/**
 * Send email verification email to new signup
 * @param {Object} params
 * @param {string} params.email - User email
 * @param {string} params.firstName - User first name
 * @param {string} params.verificationToken - Verification token
 * @param {string} params.companyName - Company name
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail({ email, firstName, verificationToken, companyName }) {
  const verificationLink = `${process.env.CUSTOMER_PORTAL_URL || 'https://app.tazzi.com'}/verify-email/${verificationToken}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Tazzi account</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover {
      background: #5568d3;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 13px;
      padding: 30px;
      background-color: #f9f9f9;
    }
    .features {
      background-color: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .features ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .features li {
      margin: 8px 0;
    }
    .link-box {
      background-color: #f0f0f0;
      padding: 15px;
      border-radius: 6px;
      word-break: break-all;
      font-size: 13px;
      color: #667eea;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Tazzi!</h1>
    </div>

    <div class="content">
      <p style="font-size: 16px;">Hi ${firstName},</p>

      <p>Thanks for signing up for Tazzi! We're excited to have <strong>${companyName}</strong> join our multi-channel communication platform.</p>

      <p>You're one step away from accessing your account. Click the button below to verify your email address:</p>

      <div style="text-align: center;">
        <a href="${verificationLink}" class="button">Verify Email Address</a>
      </div>

      <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
      <div class="link-box">${verificationLink}</div>

      <p style="font-size: 13px; color: #999;">This link expires in 24 hours.</p>

      <div class="features">
        <p style="margin-top: 0; font-weight: 600;">Your 14-day free trial includes:</p>
        <ul>
          <li><strong>Full access</strong> to all communication channels</li>
          <li><strong>Voice calls</strong> with recording and IVR</li>
          <li><strong>SMS & MMS</strong> with delivery tracking</li>
          <li><strong>Email campaigns</strong> with analytics</li>
          <li><strong>WhatsApp Business API</strong> integration</li>
          <li><strong>Social media</strong> messaging (Discord, Slack, Teams, Telegram)</li>
          <li><strong>Up to 5 agents</strong> with full features</li>
          <li><strong>$50 in free credits</strong> (1,000 messages or 100 call minutes)</li>
        </ul>
      </div>

      <p>Once verified, you'll be able to:</p>
      <ul>
        <li>Configure your phone numbers</li>
        <li>Set up agent accounts</li>
        <li>Create your first campaign</li>
        <li>Integrate with your existing tools</li>
      </ul>

      <p>Questions? Just reply to this email or visit our <a href="https://docs.tazzi.com" style="color: #667eea;">documentation</a>.</p>

      <p style="margin-top: 30px;">Best regards,<br><strong>The Tazzi Team</strong></p>
    </div>

    <div class="footer">
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} Tazzi. All rights reserved.</p>
      <p style="margin: 5px 0;">If you didn't create a Tazzi account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
Welcome to Tazzi!

Hi ${firstName},

Thanks for signing up for Tazzi! We're excited to have ${companyName} join our multi-channel communication platform.

You're one step away from accessing your account. Please verify your email address by clicking this link:

${verificationLink}

This link expires in 24 hours.

Your 14-day free trial includes:
- Full access to all communication channels
- Voice calls with recording and IVR
- SMS & MMS with delivery tracking
- Email campaigns with analytics
- WhatsApp Business API integration
- Social media messaging (Discord, Slack, Teams, Telegram)
- Up to 5 agents with full features
- $50 in free credits (1,000 messages or 100 call minutes)

Once verified, you'll be able to configure your phone numbers, set up agent accounts, create your first campaign, and integrate with your existing tools.

Questions? Just reply to this email or visit https://docs.tazzi.com

Best regards,
The Tazzi Team

---
© ${new Date().getFullYear()} Tazzi. All rights reserved.
If you didn't create a Tazzi account, please ignore this email.
  `.trim();

  // Queue email for sending via NATS
  try {
    // Insert into emails table for processing by email worker
    await pool.query(`
      INSERT INTO emails (
        tenant_id,
        to_email,
        to_name,
        from_email,
        from_name,
        subject,
        html_body,
        text_body,
        status,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      null, // No tenant_id for signup emails (system emails)
      email,
      firstName,
      process.env.SYSTEM_EMAIL_FROM || 'noreply@tazzi.com',
      'Tazzi',
      'Verify your Tazzi account',
      htmlBody,
      textBody,
      'queued',
      JSON.stringify({ type: 'signup_verification', verification_token: verificationToken })
    ]);

    console.log(`✅ Verification email queued for ${email}`);
  } catch (error) {
    console.error('❌ Failed to queue verification email:', error);
    throw error;
  }
}

/**
 * Send welcome email after successful verification
 * @param {Object} params
 * @param {string} params.email - User email
 * @param {string} params.firstName - User first name
 * @param {string} params.companyName - Company name
 * @returns {Promise<void>}
 */
export async function sendWelcomeEmail({ email, firstName, companyName }) {
  const dashboardLink = process.env.CUSTOMER_PORTAL_URL || 'https://app.tazzi.com';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Tazzi!</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .content {
      padding: 40px 30px;
    }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 14px 32px;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
    .step {
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
      border-left: 4px solid #667eea;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 13px;
      padding: 30px;
      background-color: #f9f9f9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 You're all set!</h1>
    </div>

    <div class="content">
      <p>Hi ${firstName},</p>

      <p>Your Tazzi account for <strong>${companyName}</strong> is now active! Your 14-day free trial has started.</p>

      <div style="text-align: center;">
        <a href="${dashboardLink}" class="button">Go to Dashboard</a>
      </div>

      <h3>Next Steps:</h3>

      <div class="step">
        <strong>1. Configure Your Phone Numbers</strong><br>
        Purchase or port phone numbers for voice and SMS.
      </div>

      <div class="step">
        <strong>2. Set Up Your Team</strong><br>
        Invite agents and configure their permissions.
      </div>

      <div class="step">
        <strong>3. Send Your First Message</strong><br>
        Try sending an SMS, email, or making a call.
      </div>

      <div class="step">
        <strong>4. Explore Integration Options</strong><br>
        Connect your CRM, helpdesk, or build custom integrations with our API.
      </div>

      <p>Need help? Check out our <a href="https://docs.tazzi.com/guides" style="color: #667eea;">getting started guides</a> or reply to this email.</p>

      <p>Best regards,<br><strong>The Tazzi Team</strong></p>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Tazzi. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const textBody = `
🎉 You're all set!

Hi ${firstName},

Your Tazzi account for ${companyName} is now active! Your 14-day free trial has started.

Go to Dashboard: ${dashboardLink}

Next Steps:

1. Configure Your Phone Numbers
   Purchase or port phone numbers for voice and SMS.

2. Set Up Your Team
   Invite agents and configure their permissions.

3. Send Your First Message
   Try sending an SMS, email, or making a call.

4. Explore Integration Options
   Connect your CRM, helpdesk, or build custom integrations with our API.

Need help? Check out our getting started guides at https://docs.tazzi.com/guides or reply to this email.

Best regards,
The Tazzi Team

---
© ${new Date().getFullYear()} Tazzi. All rights reserved.
  `.trim();

  try {
    await pool.query(`
      INSERT INTO emails (
        tenant_id,
        to_email,
        to_name,
        from_email,
        from_name,
        subject,
        html_body,
        text_body,
        status,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      null,
      email,
      firstName,
      process.env.SYSTEM_EMAIL_FROM || 'noreply@tazzi.com',
      'Tazzi',
      'Welcome to Tazzi - Your account is ready!',
      htmlBody,
      textBody,
      'queued',
      JSON.stringify({ type: 'welcome' })
    ]);

    console.log(`✅ Welcome email queued for ${email}`);
  } catch (error) {
    console.error('❌ Failed to queue welcome email:', error);
    throw error;
  }
}
