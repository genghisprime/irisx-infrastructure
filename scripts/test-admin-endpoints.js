#!/usr/bin/env node

/**
 * Comprehensive Admin Endpoint Testing Script
 * Tests ALL admin endpoints with real authentication
 * Captures actual errors and provides detailed reports
 */

import axios from 'axios';
import { Pool } from 'pg';
import Redis from 'ioredis';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com',
  port: 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '5cdce73ae642767beb8bac7085ad2bf2',
  database: process.env.DB_NAME || 'irisx',
  ssl: false
};

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'irisx-prod-redis.k6gtlb.ng.0001.use1.cache.amazonaws.com',
  port: 6379
};

const pool = new Pool(DB_CONFIG);
const redis = new Redis(REDIS_CONFIG);

// Test results
const results = {
  passed: [],
  failed: [],
  skipped: []
};

// Admin credentials
const ADMIN_EMAIL = 'admin@irisx.internal';
const ADMIN_PASSWORD = 'SuperSecure123!Admin';

let adminToken = null;

/**
 * Get admin authentication token
 */
async function getAdminToken() {
  try {
    console.log('\n📝 Authenticating as admin...');
    const response = await axios.post(`${API_URL}/admin/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (response.data.token) {
      console.log('✓ Admin authentication successful');
      return response.data.token;
    }

    throw new Error('No token in response');
  } catch (err) {
    console.error('✗ Admin authentication failed:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Test an endpoint
 */
async function testEndpoint(name, method, path, options = {}) {
  const {
    params = {},
    data = null,
    expectedStatus = 200,
    skipAuth = false,
    description = ''
  } = options;

  try {
    console.log(`\n🔍 Testing: ${name}`);
    if (description) {
      console.log(`   ${description}`);
    }
    console.log(`   ${method.toUpperCase()} ${path}`);
    if (Object.keys(params).length > 0) {
      console.log(`   Params: ${JSON.stringify(params)}`);
    }

    const config = {
      method,
      url: `${API_URL}${path}`,
      params,
      headers: {}
    };

    if (!skipAuth && adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    if (response.status === expectedStatus) {
      console.log(`   ✓ PASS (${response.status})`);
      console.log(`   Response keys: ${Object.keys(response.data).join(', ')}`);
      results.passed.push({ name, method, path, status: response.status });
      return { success: true, data: response.data };
    } else {
      console.log(`   ✗ FAIL (expected ${expectedStatus}, got ${response.status})`);
      results.failed.push({
        name,
        method,
        path,
        expected: expectedStatus,
        actual: response.status,
        error: 'Unexpected status code'
      });
      return { success: false, status: response.status };
    }
  } catch (err) {
    const status = err.response?.status || 'ERROR';
    const errorData = err.response?.data || err.message;

    console.log(`   ✗ FAIL (${status})`);
    console.log(`   Error: ${JSON.stringify(errorData)}`);

    results.failed.push({
      name,
      method,
      path,
      status,
      error: errorData
    });

    return { success: false, status, error: errorData };
  }
}

/**
 * Test all admin endpoints
 */
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  IRISX Admin Endpoint Comprehensive Test Suite');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`API URL: ${API_URL}`);
  console.log(`Database: ${DB_CONFIG.host}`);
  console.log(`Redis: ${REDIS_CONFIG.host}`);

  try {
    // Get admin token
    adminToken = await getAdminToken();

    console.log('\n\n━━━ RECORDINGS ENDPOINTS ━━━');
    await testEndpoint(
      'Recordings - List',
      'GET',
      '/admin/recordings',
      {
        params: { page: 1, limit: 20, search: '', date_from: '', date_to: '' },
        description: 'List all recordings with pagination'
      }
    );

    await testEndpoint(
      'Recordings - Stats',
      'GET',
      '/admin/recordings/stats',
      {
        description: 'Get recording statistics'
      }
    );

    console.log('\n\n━━━ CONVERSATIONS ENDPOINTS ━━━');
    await testEndpoint(
      'Conversations - List',
      'GET',
      '/admin/conversations',
      {
        params: { page: 1, limit: 20 },
        description: 'List all conversations'
      }
    );

    await testEndpoint(
      'Conversations - Stats',
      'GET',
      '/admin/conversations/stats',
      {
        description: 'Get conversation statistics'
      }
    );

    await testEndpoint(
      'Conversations - SLA Breaches',
      'GET',
      '/admin/conversations/sla-breaches',
      {
        description: 'Get SLA breach report'
      }
    );

    console.log('\n\n━━━ TENANT ENDPOINTS ━━━');
    await testEndpoint(
      'Tenants - List',
      'GET',
      '/admin/tenants',
      {
        params: { page: 1, limit: 20 },
        description: 'List all tenants'
      }
    );

    console.log('\n\n━━━ DASHBOARD ENDPOINTS ━━━');
    await testEndpoint(
      'Dashboard - Stats',
      'GET',
      '/admin/dashboard/stats',
      {
        description: 'Get dashboard statistics'
      }
    );

    await testEndpoint(
      'Dashboard - Health',
      'GET',
      '/admin/dashboard/health',
      {
        description: 'Get system health metrics'
      }
    );

    console.log('\n\n━━━ BILLING ENDPOINTS ━━━');
    await testEndpoint(
      'Billing - Revenue Report',
      'GET',
      '/admin/billing/revenue',
      {
        params: {
          start_date: '2025-10-01',
          end_date: '2025-11-08',
          report_type: 'mrr'
        },
        description: 'Get revenue report'
      }
    );

    await testEndpoint(
      'Billing - Invoices',
      'GET',
      '/admin/billing/invoices',
      {
        params: { page: 1, limit: 20 },
        description: 'List invoices'
      }
    );

    console.log('\n\n━━━ PROVIDERS ENDPOINTS ━━━');
    await testEndpoint(
      'Providers - List',
      'GET',
      '/admin/providers',
      {
        description: 'List all communication providers'
      }
    );

    console.log('\n\n━━━ PHONE NUMBERS ENDPOINTS ━━━');
    await testEndpoint(
      'Phone Numbers - List',
      'GET',
      '/admin/phone-numbers',
      {
        params: { page: 1, limit: 20 },
        description: 'List phone numbers'
      }
    );

    await testEndpoint(
      'Phone Numbers - Stats',
      'GET',
      '/admin/phone-numbers/stats',
      {
        description: 'Get phone number statistics'
      }
    );

    console.log('\n\n━━━ USERS ENDPOINTS ━━━');
    await testEndpoint(
      'Users - List by Tenant',
      'GET',
      '/admin/tenants/7/users',
      {
        params: { page: 1, limit: 20 },
        description: 'List users for tenant 7'
      }
    );

    console.log('\n\n━━━ AGENTS ENDPOINTS ━━━');
    await testEndpoint(
      'Agents - List',
      'GET',
      '/admin/agents',
      {
        params: { page: 1, limit: 20 },
        description: 'List all agents'
      }
    );

    console.log('\n\n━━━ QUEUES ENDPOINTS ━━━');
    await testEndpoint(
      'Queues - List',
      'GET',
      '/admin/queues',
      {
        description: 'List all queues'
      }
    );

    console.log('\n\n━━━ CAMPAIGNS ENDPOINTS ━━━');
    await testEndpoint(
      'Campaigns - List',
      'GET',
      '/admin/campaigns',
      {
        params: { page: 1, limit: 20 },
        description: 'List all campaigns'
      }
    );

    console.log('\n\n━━━ DATABASE ENDPOINTS ━━━');
    await testEndpoint(
      'Database - Stats',
      'GET',
      '/admin/database/stats',
      {
        description: 'Get database statistics'
      }
    );

    await testEndpoint(
      'Database - Connections',
      'GET',
      '/admin/database/connections',
      {
        description: 'Get active database connections'
      }
    );

    console.log('\n\n━━━ CACHE ENDPOINTS ━━━');
    await testEndpoint(
      'Cache - Stats',
      'GET',
      '/admin/cache/stats',
      {
        description: 'Get Redis cache statistics'
      }
    );

    console.log('\n\n━━━ AUDIT LOG ENDPOINTS ━━━');
    await testEndpoint(
      'Audit Log - List',
      'GET',
      '/admin/audit-log',
      {
        params: { page: 1, limit: 20 },
        description: 'Get audit log entries'
      }
    );

    await testEndpoint(
      'Audit Log - Stats',
      'GET',
      '/admin/audit-log/stats',
      {
        description: 'Get audit log statistics'
      }
    );

  } catch (err) {
    console.error('\n\n✗ Test suite failed:', err.message);
  } finally {
    // Print summary
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✓ Passed: ${results.passed.length}`);
    console.log(`✗ Failed: ${results.failed.length}`);
    console.log(`⊘ Skipped: ${results.skipped.length}`);
    console.log(`  Total: ${results.passed.length + results.failed.length + results.skipped.length}`);

    if (results.failed.length > 0) {
      console.log('\n\n━━━ FAILED TESTS ━━━');
      results.failed.forEach(test => {
        console.log(`\n✗ ${test.name}`);
        console.log(`  ${test.method} ${test.path}`);
        console.log(`  Status: ${test.status}`);
        console.log(`  Error: ${JSON.stringify(test.error, null, 2)}`);
      });
    }

    // Cleanup
    await pool.end();
    await redis.quit();

    // Exit with error code if tests failed
    process.exit(results.failed.length > 0 ? 1 : 0);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
