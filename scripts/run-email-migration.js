/**
 * Run Email Providers Migration
 * Executes migration 024_add_email_providers.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './src/db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('[Migration] Reading migration file...');

    const migrationPath = path.join(__dirname, '024_add_email_providers.sql');
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
      console.log('3. Set provider status to "active"');
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
