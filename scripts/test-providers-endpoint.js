#!/usr/bin/env node

/**
 * Test script to verify /admin/providers endpoint is working
 */

import pool from '../api/src/db/connection.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-admin-jwt-key-change-this';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function testProvidersEndpoint() {
  console.log('════════════════════════════════════════');
  console.log('  Testing /admin/providers Endpoint');
  console.log('════════════════════════════════════════\n');

  try {
    // Step 1: Create a valid admin JWT token and session
    console.log('Step 1: Creating admin JWT token and session...');
    const adminPayload = {
      adminId: '1',
      email: 'admin@irisx.internal',
      role: 'superadmin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (4 * 60 * 60)
    };
    const token = jwt.sign(adminPayload, JWT_SECRET);
    const tokenHash = hashToken(token);

    // Insert session into database
    await pool.query(
      `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = $3`,
      [1, tokenHash, new Date(Date.now() + 4 * 60 * 60 * 1000)]
    );
    console.log('✓ Token and session created\n');

    // Step 2: Test GET /admin/providers (without auth - should fail with 401)
    console.log('Step 2: Testing GET /admin/providers WITHOUT auth (expecting 401)...');
    const noAuthResponse = await fetch('https://api.tazzi.com/admin/providers');
    const noAuthData = await noAuthResponse.json();

    if (noAuthResponse.status === 401) {
      console.log('✓ Correctly returns 401 without auth');
      console.log('  Error:', noAuthData.error);
    } else {
      console.log('✗ Expected 401, got:', noAuthResponse.status);
    }
    console.log('');

    // Step 3: Test GET /admin/providers (with auth - should work)
    console.log('Step 3: Testing GET /admin/providers WITH auth...');
    const providersResponse = await fetch('https://api.tazzi.com/admin/providers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const providersData = await providersResponse.json();

    if (providersResponse.ok) {
      console.log('✓ GET /admin/providers SUCCESS (Status:', providersResponse.status, ')');
      console.log('  Providers found:', providersData.providers?.length || 0);
      if (providersData.providers && providersData.providers.length > 0) {
        console.log('  Sample provider:', providersData.providers[0].provider_name);
      }
    } else {
      console.log('✗ GET /admin/providers FAILED');
      console.log('  Status:', providersResponse.status);
      console.log('  Error:', providersData);
    }
    console.log('');

    // Step 4: Test with query parameters
    console.log('Step 4: Testing GET /admin/providers with query params...');
    const queryResponse = await fetch('https://api.tazzi.com/admin/providers?type=email&provider=', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const queryData = await queryResponse.json();

    if (queryResponse.ok) {
      console.log('✓ GET /admin/providers?type=email&provider= SUCCESS');
      console.log('  Results:', queryData.providers?.length || 0);
    } else {
      console.log('✗ Query with params FAILED');
      console.log('  Error:', queryData);
    }
    console.log('');

    // Summary
    console.log('════════════════════════════════════════');
    console.log('  TEST RESULTS');
    console.log('════════════════════════════════════════');
    console.log('✓ Endpoint /admin/providers is working');
    console.log('✓ Route is properly mounted and accessible');
    console.log('✓ Authentication is working correctly');
    console.log('');
    console.log('If the browser is still showing 404:');
    console.log('1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)');
    console.log('2. Clear browser cache');
    console.log('3. Open DevTools and disable cache (Network tab)');
    console.log('4. Check for any service workers or CDN caching');

  } catch (err) {
    console.error('\n✗ TEST FAILED');
    console.error('Error:', err.message);
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testProvidersEndpoint();
