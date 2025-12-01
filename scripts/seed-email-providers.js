/**
 * Seed Email Providers
 * Inserts Elastic Email, SendGrid, and Custom SMTP providers with placeholder credentials
 * Run this once, then update real credentials via the admin UI
 */

import pool from '../src/db/connection.js';

async function seedProviders() {
  try {
    console.log('[Seed] Inserting email providers with placeholder credentials...');
    console.log('');

    // Insert Elastic Email
    const elasticResult = await pool.query(
      `INSERT INTO messaging_providers (
        provider_type,
        provider_name,
        credentials_encrypted,
        credentials_iv,
        config,
        is_active
      ) VALUES (
        'email',
        'elastic-email',
        'PLACEHOLDER_ENCRYPT_LATER',
        'placeholder-iv',
        jsonb_build_object(
          'priority', 1,
          'display_name', 'Elastic Email',
          'cost_per_1000', 0.09,
          'from_email', 'noreply@irisx.com',
          'from_name', 'IRISX',
          'api_endpoint', 'https://api.elasticemail.com/v2',
          'health_score', 100,
          'daily_limit', 100000,
          'supports_attachments', true,
          'supports_templates', true,
          'supports_tracking', true
        ),
        false
      )
      ON CONFLICT DO NOTHING
      RETURNING id, provider_name`
    );

    if (elasticResult.rows.length > 0) {
      console.log(`✓ Inserted Elastic Email (ID: ${elasticResult.rows[0].id})`);
    } else {
      console.log('○ Elastic Email already exists');
    }

    // Insert SendGrid
    const sendgridResult = await pool.query(
      `INSERT INTO messaging_providers (
        provider_type,
        provider_name,
        credentials_encrypted,
        credentials_iv,
        config,
        is_active
      ) VALUES (
        'email',
        'sendgrid',
        'PLACEHOLDER_ENCRYPT_LATER',
        'placeholder-iv',
        jsonb_build_object(
          'priority', 2,
          'display_name', 'SendGrid',
          'cost_per_1000', 0.10,
          'from_email', 'noreply@irisx.com',
          'from_name', 'IRISX',
          'api_endpoint', 'https://api.sendgrid.com/v3',
          'health_score', 100,
          'daily_limit', 100000,
          'supports_attachments', true,
          'supports_templates', true,
          'supports_tracking', true,
          'supports_scheduling', true
        ),
        false
      )
      ON CONFLICT DO NOTHING
      RETURNING id, provider_name`
    );

    if (sendgridResult.rows.length > 0) {
      console.log(`✓ Inserted SendGrid (ID: ${sendgridResult.rows[0].id})`);
    } else {
      console.log('○ SendGrid already exists');
    }

    // Insert Custom SMTP
    const smtpResult = await pool.query(
      `INSERT INTO messaging_providers (
        provider_type,
        provider_name,
        credentials_encrypted,
        credentials_iv,
        config,
        is_active
      ) VALUES (
        'email',
        'custom-smtp',
        'PLACEHOLDER_ENCRYPT_LATER',
        'placeholder-iv',
        jsonb_build_object(
          'priority', 3,
          'display_name', 'Custom SMTP',
          'cost_per_1000', 0.00,
          'from_email', 'noreply@irisx.com',
          'from_name', 'IRISX',
          'health_score', 100,
          'daily_limit', null,
          'supports_attachments', true,
          'supports_templates', false,
          'supports_tracking', false
        ),
        false
      )
      ON CONFLICT DO NOTHING
      RETURNING id, provider_name`
    );

    if (smtpResult.rows.length > 0) {
      console.log(`✓ Inserted Custom SMTP (ID: ${smtpResult.rows[0].id})`);
    } else {
      console.log('○ Custom SMTP already exists');
    }

    console.log('');
    console.log('=== Current Email Providers ===');
    const listResult = await pool.query(
      `SELECT
        id,
        provider_name,
        (config->>'display_name') as display_name,
        (config->>'priority')::integer as priority,
        (config->>'cost_per_1000')::numeric as cost_per_1000,
        is_active,
        CASE
          WHEN credentials_encrypted = 'PLACEHOLDER_ENCRYPT_LATER' THEN 'PLACEHOLDER'
          ELSE 'SET'
        END as credentials_status
      FROM messaging_providers
      WHERE provider_type = 'email'
      ORDER BY (config->>'priority')::integer ASC`
    );

    console.table(listResult.rows);

    console.log('');
    console.log('✓ Seeding complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Go to https://admin.tazzi.com/dashboard/email-service');
    console.log('2. Click on each provider to update credentials');
    console.log('3. Activate the providers you want to use');
    console.log('4. Test email sending');

  } catch (error) {
    console.error('[Seed] Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedProviders().catch(console.error);
