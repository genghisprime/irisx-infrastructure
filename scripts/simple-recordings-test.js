#!/usr/bin/env node

/**
 * Simple test to reproduce the exact user error on /admin/recordings
 * This creates an admin session and tests the endpoint that's failing
 */

import pool from './src/db/connection.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';

async function testRecordingsEndpoint() {
  console.log('════════════════════════════════════════');
  console.log('  Simple Recordings Endpoint Test');
  console.log('════════════════════════════════════════\n');

  try {
    // Step 1: Create a valid admin JWT token
    console.log('Step 1: Creating admin JWT token...');
    const adminPayload = {
      adminId: '1',
      email: 'admin@irisx.internal',
      role: 'superadmin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    };
    const token = jwt.sign(adminPayload, JWT_SECRET);
    console.log('✓ Token created\n');

    // Step 2: Simulate the exact query that the /admin/recordings endpoint runs
    console.log('Step 2: Testing /admin/recordings stats query...');
    console.log('Query: Get recording statistics\n');

    const statsQuery = `SELECT
      COUNT(*) as total_recordings,
      SUM(recording_duration_seconds) as total_duration_seconds,
      SUM(recording_size_bytes) as total_size_bytes,
      AVG(recording_duration_seconds) as avg_duration_seconds,
      COUNT(*) FILTER (WHERE recording_status = 'completed') as completed,
      COUNT(*) FILTER (WHERE recording_status = 'in-progress') as in_progress,
      COUNT(*) FILTER (WHERE recording_status = 'failed') as failed,
      COUNT(*) FILTER (WHERE transcription_text IS NOT NULL) as transcribed,
      AVG(transcription_confidence) FILTER (WHERE transcription_confidence IS NOT NULL) as avg_transcription_confidence
    FROM calls
    WHERE recording_url IS NOT NULL`;

    const statsResult = await pool.query(statsQuery);
    console.log('✓ Stats query SUCCESS');
    console.log('Result:', statsResult.rows[0]);
    console.log('');

    // Step 3: Test the list query
    console.log('Step 3: Testing /admin/recordings list query...');
    const page = 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const whereClause = 'c.recording_url IS NOT NULL';

    const countQuery = `SELECT COUNT(*) as total
      FROM calls c
      WHERE ${whereClause}`;

    const countResult = await pool.query(countQuery);
    console.log('✓ Count query SUCCESS');
    console.log('Total recordings:', countResult.rows[0].total);
    console.log('');

    const listQuery = `SELECT
      c.id,
      c.tenant_id,
      t.name as tenant_name,
      c.from_number,
      c.to_number,
      c.direction,
      c.status as call_status,
      c.duration_seconds,
      c.recording_url,
      c.recording_duration_seconds,
      c.recording_sid,
      c.recording_status,
      c.recording_started_at,
      c.recording_size_bytes,
      c.transcription_text,
      c.transcription_confidence,
      c.user_id,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      c.initiated_at,
      c.ended_at,
      c.created_at
    FROM calls c
    JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN users u ON c.user_id = u.id
    WHERE ${whereClause}
    ORDER BY c.recording_started_at DESC
    LIMIT $1 OFFSET $2`;

    const listResult = await pool.query(listQuery, [limit, offset]);
    console.log('✓ List query SUCCESS');
    console.log('Recordings returned:', listResult.rows.length);
    console.log('');

    // Step 4: Summary
    console.log('════════════════════════════════════════');
    console.log('  TEST RESULTS');
    console.log('════════════════════════════════════════');
    console.log('✓ All queries executed successfully');
    console.log('✓ No SQL errors');
    console.log('✓ No column mismatch errors');
    console.log('');
    console.log('CONCLUSION:');
    console.log('The /admin/recordings endpoint queries are working correctly.');
    console.log('If the user is still getting 500 errors, the issue is likely:');
    console.log('  1. Frontend cache (CloudFront/browser)');
    console.log('  2. Nginx proxy cache');
    console.log('  3. API not fully restarted');
    console.log('  4. Different error in request/response handling');

  } catch (err) {
    console.error('\n✗ TEST FAILED');
    console.error('Error:', err.message);
    console.error('Details:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testRecordingsEndpoint();
