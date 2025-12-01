/**
 * Check messaging_providers table schema
 */

import pool from './src/db/connection.js';

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'messaging_providers'
      ORDER BY ordinal_position
    `);

    console.log('=== messaging_providers table schema ===');
    if (result.rows.length === 0) {
      console.log('Table does not exist!');
    } else {
      console.table(result.rows);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
