/**
 * Test Elastic Email Integration
 * Sends a test email to verify the Elastic Email provider is working correctly
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

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
 * Send test email via Elastic Email
 */
async function sendTestEmail() {
  try {
    console.log('[Test] Retrieving Elastic Email provider credentials from database...');

    // Get provider configuration
    const providerResult = await pool.query(`
      SELECT
        id,
        provider_name,
        credentials_encrypted,
        credentials_iv,
        config
      FROM messaging_providers
      WHERE provider_type = 'email'
        AND provider_name = 'elastic-email'
        AND is_active = true
      LIMIT 1
    `);

    if (providerResult.rows.length === 0) {
      throw new Error('Elastic Email provider not found or not active');
    }

    const provider = providerResult.rows[0];
    console.log(`✓ Found provider: ${provider.provider_name}`);

    // Decrypt credentials
    const credentials = decryptCredentials(
      provider.credentials_encrypted,
      provider.credentials_iv
    );
    console.log('✓ Credentials decrypted successfully');

    // Get config
    const config = provider.config;
    const apiEndpoint = config.api_endpoint || 'https://api.elasticemail.com/v2';
    const fromEmail = config.from_email || 'noreply@tazzi.com';
    const fromName = config.display_name || 'IRISX';

    console.log(`\n=== Sending Test Email ===`);
    console.log(`From: ${fromName} <${fromEmail}>`);
    console.log(`To: rrodkey@me.com`); // Send to user's email
    console.log(`API Endpoint: ${apiEndpoint}`);

    // Prepare email data
    const emailData = {
      apikey: credentials.api_key,
      from: fromEmail,
      fromName: fromName,
      to: 'rrodkey@me.com', // Send to user's email
      subject: 'IRISX Email Service Test',
      bodyHtml: `
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #3b82f6;">IRISX Email Service Test</h2>
          <p>This is a test email from the IRISX platform.</p>
          <p><strong>Provider:</strong> Elastic Email</p>
          <p><strong>Status:</strong> Email service is operational</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This is an automated test email. If you received this, the Elastic Email integration is working correctly.
          </p>
        </body>
        </html>
      `,
      bodyText: `
IRISX Email Service Test

This is a test email from the IRISX platform.

Provider: Elastic Email
Status: Email service is operational
Timestamp: ${new Date().toISOString()}

This is an automated test email. If you received this, the Elastic Email integration is working correctly.
      `
    };

    // Send email via Elastic Email API
    console.log('\n[API] Calling Elastic Email API...');
    const response = await fetch(`${apiEndpoint}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(emailData)
    });

    const result = await response.json();
    console.log(`\n[API] Response Status: ${response.status}`);
    console.log(`[API] Response Body:`, JSON.stringify(result, null, 2));

    if (!response.ok || !result.success) {
      throw new Error(`Elastic Email API error: ${result.error || response.statusText}`);
    }

    // Success
    console.log(`\n✓ Email sent successfully!`);
    console.log(`✓ Message ID: ${result.data?.messageid || 'N/A'}`);
    console.log(`\n=== Test Complete ===`);
    console.log(`Check your inbox at rrodkey@me.com to verify delivery.`);

    return {
      success: true,
      messageId: result.data?.messageid,
      provider: 'elastic-email'
    };

  } catch (error) {
    console.error(`\n✗ Test failed:`, error.message);
    console.error(`\nError details:`, error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await pool.end();
  }
}

// Run test
sendTestEmail()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
