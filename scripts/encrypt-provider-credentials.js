/**
 * Encrypt Email Provider Credentials
 *
 * This script encrypts API credentials for email providers using AES-256-CBC
 * and stores them in the messaging_providers table.
 *
 * Usage:
 *   node encrypt-provider-credentials.js <provider-name> <api-key> [api-secret]
 *
 * Examples:
 *   node encrypt-provider-credentials.js elastic-email "YOUR_API_KEY_HERE"
 *   node encrypt-provider-credentials.js sendgrid "YOUR_SENDGRID_API_KEY"
 *   node encrypt-provider-credentials.js custom-smtp "smtp_user" "smtp_password"
 */

import crypto from 'crypto';
import pool from '../src/db/connection.js';

/**
 * Encrypt credentials using AES-256-CBC
 */
function encryptCredentials(credentials) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.ENCRYPTION_KEY || 'change-this-key-in-production',
      'salt',
      32
    );
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex')
    };
  } catch (error) {
    console.error('[Encrypt] Failed to encrypt credentials:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Update provider credentials in database
 */
async function updateProviderCredentials(providerName, apiKey, apiSecret = null) {
  try {
    console.log(`[Encrypt] Encrypting credentials for ${providerName}...`);

    // Build credentials object based on provider
    let credentials = {};

    switch (providerName) {
      case 'elastic-email':
        credentials = {
          api_key: apiKey,
          from_email: 'noreply@irisx.com',
          from_name: 'IRISX'
        };
        break;

      case 'sendgrid':
        credentials = {
          api_key: apiKey,
          from_email: 'noreply@irisx.com',
          from_name: 'IRISX'
        };
        break;

      case 'custom-smtp':
        credentials = {
          smtp_host: 'mail.irisx.com',
          smtp_port: 587,
          smtp_secure: true,
          smtp_user: apiKey,
          smtp_password: apiSecret || '',
          from_email: 'noreply@irisx.com',
          from_name: 'IRISX'
        };
        break;

      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }

    // Encrypt credentials
    const { encrypted, iv } = encryptCredentials(credentials);

    console.log(`[Encrypt] Updating database record...`);

    // Update database
    const result = await pool.query(
      `UPDATE messaging_providers
       SET credentials_encrypted = $1,
           credentials_iv = $2,
           updated_at = NOW()
       WHERE provider_name = $3
         AND provider_type = 'email'
       RETURNING id, provider_name, config->>'display_name' as display_name`,
      [encrypted, iv, providerName]
    );

    if (result.rows.length === 0) {
      throw new Error(`Provider '${providerName}' not found in database`);
    }

    const provider = result.rows[0];

    console.log(`[Encrypt] ✓ Credentials encrypted and stored successfully!`);
    console.log('');
    console.log('Provider Details:');
    console.log(`  ID: ${provider.id}`);
    console.log(`  Name: ${provider.provider_name}`);
    console.log(`  Display: ${provider.display_name}`);
    console.log('');
    console.log('NEXT STEPS:');
    console.log(`1. Activate provider: UPDATE messaging_providers SET is_active = true WHERE id = ${provider.id};`);
    console.log('2. Test email sending via POST /v1/emails/test');

  } catch (error) {
    console.error('[Encrypt] Failed:', error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node encrypt-provider-credentials.js <provider-name> <api-key> [api-secret]');
    console.error('');
    console.error('Supported providers:');
    console.error('  elastic-email  - Elastic Email provider (requires API key)');
    console.error('  sendgrid       - SendGrid provider (requires API key)');
    console.error('  custom-smtp    - Custom SMTP server (requires username and password)');
    console.error('');
    console.error('Examples:');
    console.error('  node encrypt-provider-credentials.js elastic-email "YOUR_API_KEY"');
    console.error('  node encrypt-provider-credentials.js sendgrid "YOUR_SENDGRID_KEY"');
    console.error('  node encrypt-provider-credentials.js custom-smtp "user@example.com" "password123"');
    process.exit(1);
  }

  const [providerName, apiKey, apiSecret] = args;

  try {
    await updateProviderCredentials(providerName, apiKey, apiSecret);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
