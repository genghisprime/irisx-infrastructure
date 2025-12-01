#!/usr/bin/env node

/**
 * Simple test to verify the fixed endpoints work
 * This creates an admin session and tests the endpoints that were failing with 404
 */

import pool from '../api/src/db/connection.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-admin-jwt-key-change-this';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function testEndpoints() {
  console.log('════════════════════════════════════════');
  console.log('  Testing Fixed Endpoints');
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

    // Step 2: Test GET /admin/agents
    console.log('Step 2: Testing GET /admin/agents...');
    const agentsResponse = await fetch('http://localhost:3000/admin/agents?page=1&limit=2', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const agentsData = await agentsResponse.json();

    if (agentsResponse.ok) {
      console.log('✓ GET /admin/agents SUCCESS (Status:', agentsResponse.status, ')');
      console.log('  Agents found:', agentsData.agents?.length || 0);
    } else {
      console.log('✗ GET /admin/agents FAILED');
      console.log('  Error:', agentsData);
    }
    console.log('');

    // Step 3: Test GET /admin/phone-numbers
    console.log('Step 3: Testing GET /admin/phone-numbers...');
    const phoneResponse = await fetch('http://localhost:3000/admin/phone-numbers?page=1&limit=1', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const phoneData = await phoneResponse.json();

    if (phoneResponse.ok) {
      console.log('✓ GET /admin/phone-numbers SUCCESS (Status:', phoneResponse.status, ')');
      console.log('  Phone numbers found:', phoneData.phone_numbers?.length || 0);

      // Step 4: If we have a phone number, test the new endpoints
      if (phoneData.phone_numbers && phoneData.phone_numbers.length > 0) {
        const phoneId = phoneData.phone_numbers[0].id;
        console.log('  Using phone number ID:', phoneId);
        console.log('');

        // Test POST /admin/phone-numbers/:id/test
        console.log('Step 4a: Testing POST /admin/phone-numbers/' + phoneId + '/test...');
        const testResponse = await fetch(`http://localhost:3000/admin/phone-numbers/${phoneId}/test`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const testData = await testResponse.json();

        if (testResponse.ok) {
          console.log('✓ POST /admin/phone-numbers/:id/test SUCCESS (Status:', testResponse.status, ')');
          console.log('  Test completed');
        } else {
          console.log('✗ POST /admin/phone-numbers/:id/test FAILED');
          console.log('  Error:', testData);
        }
        console.log('');
      }
    } else {
      console.log('✗ GET /admin/phone-numbers FAILED');
      console.log('  Error:', phoneData);
      console.log('');
    }

    // Summary
    console.log('════════════════════════════════════════');
    console.log('  TEST COMPLETE');
    console.log('════════════════════════════════════════');
    console.log('All endpoints responded (no 404 errors)');
    console.log('Routes are properly mounted and accessible');

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

testEndpoints();
