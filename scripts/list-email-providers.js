/**
 * List Email Providers
 * Shows all email providers in the messaging_providers table
 */

import pool from '../src/db/connection.js';

async function listProviders() {
  try {
    console.log('[List] Querying email providers...');
    console.log('');

    const result = await pool.query(
      `SELECT
        id,
        provider_name,
        provider_type,
        is_active,
        config->>'display_name' as display_name,
        config->>'priority' as priority,
        config->>'health_score' as health_score,
        config->>'email_rate_per_1000' as rate_per_1000,
        CASE
          WHEN credentials_encrypted = 'PLACEHOLDER_ENCRYPT_LATER' THEN 'Not configured'
          ELSE 'Configured'
        END as credentials_status,
        created_at,
        updated_at
      FROM messaging_providers
      WHERE provider_type = 'email'
      ORDER BY (config->>'priority')::integer ASC`
    );

    if (result.rows.length === 0) {
      console.log('No email providers found in database.');
      console.log('');
      console.log('Run the migration first:');
      console.log('  node scripts/run-email-migration.js');
      return;
    }

    console.log(`Found ${result.rows.length} email provider(s):`);
    console.log('');

    result.rows.forEach((provider, index) => {
      console.log(`${index + 1}. ${provider.display_name || provider.provider_name}`);
      console.log(`   ID: ${provider.id}`);
      console.log(`   Provider: ${provider.provider_name}`);
      console.log(`   Active: ${provider.is_active ? 'Yes' : 'No'}`);
      console.log(`   Priority: ${provider.priority}`);
      console.log(`   Health Score: ${provider.health_score}/100`);
      console.log(`   Rate: $${provider.rate_per_1000}/1000 emails`);
      console.log(`   Credentials: ${provider.credentials_status}`);
      console.log(`   Created: ${provider.created_at}`);
      console.log('');
    });

    console.log('NEXT STEPS:');
    console.log('');
    console.log('To add credentials for a provider:');
    console.log('  node scripts/encrypt-provider-credentials.js <provider-name> <api-key>');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/encrypt-provider-credentials.js elastic-email "YOUR_API_KEY"');
    console.log('  node scripts/encrypt-provider-credentials.js sendgrid "YOUR_API_KEY"');
    console.log('');
    console.log('To activate a provider:');
    console.log('  PGPASSWORD="$DB_PASSWORD" psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \\');
    console.log('    "UPDATE messaging_providers SET is_active = true WHERE id = <ID>;"');

  } catch (error) {
    console.error('[List] Failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

listProviders();
