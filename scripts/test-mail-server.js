/**
 * Test Custom SMTP Mail Server
 * Sends a test email via the self-hosted Postfix server
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Database connection
const pool = new Pool({
  host: 'irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: 'irisx_prod',
  user: 'irisx_admin',
  password: '5cdce73ae642767beb8bac7085ad2bf2',
  ssl: {
    rejectUnauthorized: false
  }
});

// Encryption settings (must match backend)
const ENCRYPTION_PASSWORD = process.env.ENCRYPTION_KEY || 'change-this-key-in-production';
const ALGORITHM = 'aes-256-cbc';

/**
 * Decrypt credentials
 */
function decryptCredentials(encryptedData, iv) {
  // Derive 32-byte key from password using scrypt (same as backend)
  const key = crypto.scryptSync(ENCRYPTION_PASSWORD, 'salt', 32);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

/**
 * Send test email via Custom SMTP (mail server)
 */
async function testMailServer() {
  try {
    console.log('=== Testing IRISX Self-Hosted Mail Server ===\n');

    // Fetch custom-smtp provider from database
    const result = await pool.query(
      `SELECT * FROM messaging_providers WHERE provider_name = 'custom-smtp' AND provider_type = 'email' LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw new Error('Custom SMTP provider not found in database');
    }

    const provider = result.rows[0];
    console.log(`✓ Found provider: ${provider.config.display_name}`);
    console.log(`  Status: ${provider.is_active ? 'Active' : 'Inactive'}`);

    // Decrypt credentials
    const credentials = decryptCredentials(provider.credentials, provider.credentials_iv);
    console.log(`✓ Decrypted credentials`);
    console.log(`  SMTP Host: ${credentials.smtp_host}`);
    console.log(`  SMTP Port: ${credentials.smtp_port}`);
    console.log(`  SMTP User: ${credentials.smtp_user}`);
    console.log(`  SMTP Secure: ${credentials.smtp_secure}`);

    // Get config
    const config = provider.config;
    const fromEmail = config.from_email || 'noreply@tazzi.com';
    const fromName = config.from_name || 'IRISX Platform';

    console.log(`\n=== Creating SMTP Transport ===`);

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: credentials.smtp_host,
      port: credentials.smtp_port,
      secure: credentials.smtp_secure, // false for port 587 (STARTTLS)
      auth: {
        user: credentials.smtp_user,
        pass: credentials.smtp_password
      },
      tls: {
        rejectUnauthorized: true // Verify SSL certificate
      }
    });

    // Verify connection
    console.log(`Verifying SMTP connection...`);
    await transporter.verify();
    console.log(`✓ SMTP connection verified!\n`);

    // Prepare email
    console.log(`=== Sending Test Email ===`);
    console.log(`From: ${fromName} <${fromEmail}>`);
    console.log(`To: rrodkey@me.com`);
    console.log(`Subject: IRISX Self-Hosted Mail Server Test`);

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: 'rrodkey@me.com',
      subject: 'IRISX Self-Hosted Mail Server Test',
      text: `This is a test email from the IRISX platform's self-hosted mail server.

Mail Server: ${credentials.smtp_host}
Region: US East (Virginia)
Provider: Custom SMTP (Postfix)
Status: Operational

This email was sent directly from IRISX's own mail infrastructure (mail-va.tazzi.com) running on EC2.

Authentication:
- SPF: Configured
- DKIM: Configured and signing
- DMARC: Configured
- TLS: STARTTLS on port 587

If you're seeing this, your mail server is working correctly!`,
      html: `
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #3b82f6; margin-top: 0;">IRISX Self-Hosted Mail Server Test</h2>
            <p style="color: #333; line-height: 1.6;">This is a test email from the IRISX platform's self-hosted mail server.</p>

            <div style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
              <p style="margin: 0; color: #1e40af;"><strong>Mail Server:</strong> ${credentials.smtp_host}</p>
              <p style="margin: 5px 0 0 0; color: #1e40af;"><strong>Region:</strong> US East (Virginia)</p>
              <p style="margin: 5px 0 0 0; color: #1e40af;"><strong>Provider:</strong> Custom SMTP (Postfix)</p>
              <p style="margin: 5px 0 0 0; color: #1e40af;"><strong>Status:</strong> <span style="color: #16a34a;">Operational</span></p>
            </div>

            <p style="color: #333; line-height: 1.6;">This email was sent directly from IRISX's own mail infrastructure running on EC2.</p>

            <h3 style="color: #3b82f6; margin-top: 30px;">Authentication</h3>
            <ul style="color: #333; line-height: 1.8;">
              <li><strong>SPF:</strong> Configured ✓</li>
              <li><strong>DKIM:</strong> Configured and signing ✓</li>
              <li><strong>DMARC:</strong> Configured ✓</li>
              <li><strong>TLS:</strong> STARTTLS on port 587 ✓</li>
            </ul>

            <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #16a34a; margin-top: 20px;">
              <p style="margin: 0; color: #15803d;"><strong>✓ Success!</strong></p>
              <p style="margin: 5px 0 0 0; color: #15803d;">If you're seeing this, your mail server is working correctly!</p>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
              IRISX Platform - Unified Communications System<br>
              Mail Server: mail-va.tazzi.com
            </p>
          </div>
        </body>
        </html>
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log(`\n✓ Email sent successfully!`);
    console.log(`✓ Message ID: ${info.messageId}`);
    console.log(`✓ Response: ${info.response}`);
    console.log(`\n=== Test Complete ===`);
    console.log(`Check your inbox at rrodkey@me.com to verify delivery.`);
    console.log(`\nNote: Check spam folder if not in inbox within 2 minutes.`);
    console.log(`      Without PTR record, some providers may delay or filter email.`);

    return {
      success: true,
      messageId: info.messageId,
      provider: 'custom-smtp'
    };

  } catch (error) {
    console.error('\n✗ Error testing mail server:');
    console.error(error.message);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    throw error;
  } finally {
    await pool.end();
  }
}

// Run test
testMailServer()
  .then(() => {
    console.log('\nMail server test completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMail server test failed.');
    process.exit(1);
  });
