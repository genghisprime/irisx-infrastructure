/**
 * Run Migration 024: Add Email Providers
 * Reads and executes 024_add_email_providers_v2.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ES Module workarounds
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import pool using dynamic import
const { default: pool } = await import('./src/db/connection.js');

async function runMigration() {
  try {
    console.log('[Migration] Reading migration file...');

    const migrationPath = path.join(__dirname, 'database/migrations/024_add_email_providers_v2.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('[Migration] Connecting to database...');
    const client = await pool.connect();

    try {
      console.log('[Migration] Starting transaction...');
      await client.query('BEGIN');

      console.log('[Migration] Executing migration SQL...');
      await client.query(migrationSQL);

      console.log('[Migration] Committing transaction...');
      await client.query('COMMIT');

      console.log('[Migration] ✓ Migration completed successfully!');
      console.log('');
      console.log('NEXT STEPS:');
      console.log('1. Update Elastic Email API key in database');
      console.log('2. Update SendGrid API key in database');
      console.log('3. Set provider status to "active" (is_active = true)');
      console.log('4. Test email sending via POST /v1/emails/test');

    } catch (error) {
      console.error('[Migration] Error executing migration, rolling back...');
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[Migration] Failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
