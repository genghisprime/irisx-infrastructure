/**
 * Agent Welcome Email Service
 * Sends onboarding emails to newly created agents
 */

import { query } from '../db/connection.js'

/**
 * Queue agent welcome email
 * @param {Object} params
 * @param {number} params.tenantId - Tenant ID
 * @param {string} params.email - Agent email address
 * @param {string} params.firstName - Agent first name
 * @param {string} params.lastName - Agent last name
 * @param {string} params.tempPassword - Temporary password
 * @param {Array} params.extensions - Array of extension objects
 * @param {string} params.agentDesktopUrl - Agent Desktop URL (default: https://agent.irisx.com)
 */
export async function sendAgentWelcomeEmail({
  tenantId,
  email,
  firstName,
  lastName,
  tempPassword,
  extensions,
  agentDesktopUrl = 'https://agent.irisx.com'
}) {
  try {
    // Get tenant info for branding
    const tenantResult = await query(
      'SELECT name, company_name FROM tenants WHERE id = $1',
      [tenantId]
    )

    const tenantName = tenantResult.rows[0]?.company_name || tenantResult.rows[0]?.name || 'IRISX'

    // Format extensions list
    const extensionsList = extensions.map(ext =>
      `<li><strong>Extension ${ext.extension}</strong></li>`
    ).join('')

    // Build HTML email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${tenantName} Agent Desktop</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
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
    .greeting {
      font-size: 18px;
      color: #333;
      margin-bottom: 20px;
    }
    .credentials-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .credentials-box h3 {
      margin-top: 0;
      color: #667eea;
      font-size: 16px;
    }
    .credential-item {
      margin: 12px 0;
      font-size: 14px;
    }
    .credential-label {
      font-weight: 600;
      color: #666;
      display: inline-block;
      width: 120px;
    }
    .credential-value {
      font-family: 'Courier New', monospace;
      background: #fff;
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid #dee2e6;
      display: inline-block;
    }
    .password-warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 14px;
    }
    .password-warning strong {
      color: #856404;
    }
    .extensions-list {
      list-style: none;
      padding: 0;
      margin: 15px 0;
    }
    .extensions-list li {
      padding: 8px 12px;
      background: #e7f3ff;
      margin: 6px 0;
      border-radius: 4px;
      font-size: 14px;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 32px;
      background: #667eea;
      color: white !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 25px 0;
      text-align: center;
    }
    .cta-button:hover {
      background: #5568d3;
    }
    .steps {
      margin: 30px 0;
    }
    .step {
      margin: 20px 0;
      padding-left: 35px;
      position: relative;
    }
    .step-number {
      position: absolute;
      left: 0;
      top: 0;
      width: 24px;
      height: 24px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }
    .step-title {
      font-weight: 600;
      margin-bottom: 5px;
      color: #333;
    }
    .step-description {
      font-size: 14px;
      color: #666;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      font-size: 13px;
      color: #666;
      border-top: 1px solid #dee2e6;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${tenantName}!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95;">Your Agent Desktop Account is Ready</p>
    </div>

    <div class="content">
      <div class="greeting">
        Hi ${firstName},
      </div>

      <p>Welcome to the team! Your agent account has been created and you're all set to start taking calls.</p>

      <div class="credentials-box">
        <h3>Your Login Credentials</h3>
        <div class="credential-item">
          <span class="credential-label">Email:</span>
          <span class="credential-value">${email}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label">Temporary Password:</span>
          <span class="credential-value">${tempPassword}</span>
        </div>
      </div>

      <div class="password-warning">
        <strong>⚠️ Important:</strong> This is a temporary password. You'll be prompted to change it on your first login for security reasons.
      </div>

      <h3 style="color: #667eea; margin-top: 30px;">Your SIP Extensions</h3>
      <p>You've been assigned the following extension(s) for making and receiving calls:</p>
      <ul class="extensions-list">
        ${extensionsList}
      </ul>
      <p style="font-size: 14px; color: #666;">
        <em>Note: Your SIP credentials will be automatically configured when you log in. You don't need to enter them manually.</em>
      </p>

      <div style="text-align: center;">
        <a href="${agentDesktopUrl}" class="cta-button">Access Agent Desktop</a>
      </div>

      <div class="steps">
        <h3 style="color: #667eea;">Getting Started</h3>

        <div class="step">
          <div class="step-number">1</div>
          <div class="step-title">Log In</div>
          <div class="step-description">
            Click the button above or visit <a href="${agentDesktopUrl}">${agentDesktopUrl}</a>
          </div>
        </div>

        <div class="step">
          <div class="step-number">2</div>
          <div class="step-title">Change Your Password</div>
          <div class="step-description">
            Set a secure password that you'll remember
          </div>
        </div>

        <div class="step">
          <div class="step-number">3</div>
          <div class="step-title">Start Taking Calls</div>
          <div class="step-description">
            Your SIP phone will register automatically - no configuration needed!
          </div>
        </div>
      </div>

      <p style="margin-top: 30px; font-size: 14px; color: #666;">
        If you have any questions or need assistance, please contact your administrator or our support team.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0 0 10px 0; font-weight: 600;">Powered by IRISX</p>
      <p style="margin: 0; opacity: 0.8;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim()

    // Plain text version
    const textBody = `
Welcome to ${tenantName}!
${'='.repeat(50)}

Hi ${firstName},

Welcome to the team! Your agent account has been created and you're all set to start taking calls.

YOUR LOGIN CREDENTIALS
-----------------------
Email: ${email}
Temporary Password: ${tempPassword}

⚠️ IMPORTANT: This is a temporary password. You'll be prompted to change it on your first login for security reasons.

YOUR SIP EXTENSIONS
-------------------
${extensions.map(ext => `• Extension ${ext.extension}`).join('\n')}

Note: Your SIP credentials will be automatically configured when you log in.

GETTING STARTED
---------------
1. Log In
   Visit: ${agentDesktopUrl}

2. Change Your Password
   Set a secure password that you'll remember

3. Start Taking Calls
   Your SIP phone will register automatically - no configuration needed!

Access Agent Desktop: ${agentDesktopUrl}

If you have any questions or need assistance, please contact your administrator or our support team.

---
Powered by IRISX
This is an automated message. Please do not reply to this email.
    `.trim()

    // Queue email in database
    const result = await query(`
      INSERT INTO emails (
        tenant_id,
        from_email,
        from_name,
        to_email,
        to_name,
        subject,
        html_body,
        text_body,
        status,
        priority,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id
    `, [
      tenantId,
      'noreply@irisx.com',
      `${tenantName} Agent Support`,
      email,
      `${firstName} ${lastName}`,
      `Welcome to ${tenantName} - Your Agent Account is Ready`,
      htmlBody,
      textBody,
      'queued',
      'high'
    ])

    const emailId = result.rows[0].id

    console.log(`✅ Welcome email queued for ${email} (email_id: ${emailId})`)

    return {
      success: true,
      emailId,
      message: 'Welcome email queued successfully'
    }

  } catch (error) {
    console.error('❌ Failed to queue welcome email:', error)
    throw error
  }
}

/**
 * Send password reset instructions to agent
 */
export async function sendAgentPasswordReset({
  tenantId,
  email,
  firstName,
  resetToken,
  agentDesktopUrl = 'https://agent.irisx.com'
}) {
  const resetUrl = `${agentDesktopUrl}/reset-password?token=${resetToken}`

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 40px auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reset Your Password</h2>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <p><a href="${resetUrl}" class="button">Reset Password</a></p>
    <p>Or copy this link: ${resetUrl}</p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
  </div>
</body>
</html>
  `

  await query(`
    INSERT INTO emails (tenant_id, from_email, to_email, to_name, subject, html_body, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `, [
    tenantId,
    'noreply@irisx.com',
    email,
    firstName,
    'Reset Your Agent Desktop Password',
    htmlBody,
    'queued'
  ])
}

export default {
  sendAgentWelcomeEmail,
  sendAgentPasswordReset
}
