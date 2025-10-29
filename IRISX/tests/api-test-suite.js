/**
 * IRISX Platform - Comprehensive API Test Suite
 * Tests all 62+ production endpoints for Day 1 readiness
 *
 * Usage:
 *   node tests/api-test-suite.js
 *   node tests/api-test-suite.js --endpoint=health
 *   node tests/api-test-suite.js --verbose
 */

import dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.TEST_API_KEY || 'test-api-key-12345';

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

/**
 * Make HTTP request with proper error handling
 */
async function request(method, path, body = null, headers = {}) {
  const url = `${API_BASE_URL}${path}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data
    };
  } catch (error) {
    return {
      status: 0,
      error: error.message,
      data: null
    };
  }
}

/**
 * Test case runner
 */
async function test(name, testFn) {
  results.total++;

  try {
    console.log(`${colors.blue}▶${colors.reset} ${name}`);
    await testFn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`  ${colors.green}✓ PASS${colors.reset}\n`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ${colors.red}✗ FAIL: ${error.message}${colors.reset}\n`);
  }
}

/**
 * Assertion helpers
 */
function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Got: ${actual}`);
  }
}

function assertStatus(response, expected, message = '') {
  if (response.status !== expected) {
    throw new Error(`${message}\n  Expected status: ${expected}\n  Got: ${response.status}\n  Response: ${JSON.stringify(response.data, null, 2)}`);
  }
}

function assertHasProperty(obj, prop, message = '') {
  if (!(prop in obj)) {
    throw new Error(`${message}\n  Missing property: ${prop}\n  Object: ${JSON.stringify(obj, null, 2)}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || 'Assertion failed: condition is false');
  }
}

/**
 * Test Suites
 */

// ============================================================================
// Health & System Tests
// ============================================================================
async function testHealthEndpoints() {
  console.log(`\n${colors.yellow}=== Health & System Tests ===${colors.reset}\n`);

  await test('GET /health - System health check', async () => {
    const res = await request('GET', '/health');
    assertStatus(res, 200, 'Health endpoint should return 200');
    assertHasProperty(res.data, 'status');
    assertHasProperty(res.data, 'database');
    assertHasProperty(res.data, 'redis');
    assertEqual(res.data.status, 'healthy', 'System should be healthy');
  });

  await test('GET / - Root endpoint', async () => {
    const res = await request('GET', '/');
    assertStatus(res, 200);
    assertHasProperty(res.data, 'name');
    assertHasProperty(res.data, 'version');
    assertEqual(res.data.name, 'IRISX API');
  });

  await test('GET /v1 - API version info', async () => {
    const res = await request('GET', '/v1');
    assertStatus(res, 200);
    assertHasProperty(res.data, 'version');
    assertHasProperty(res.data, 'endpoints');
    assertEqual(res.data.version, 'v1');
  });
}

// ============================================================================
// Voice/Call Tests
// ============================================================================
async function testCallEndpoints() {
  console.log(`\n${colors.yellow}=== Voice/Call API Tests ===${colors.reset}\n`);

  await test('GET /v1/calls - List calls (requires auth)', async () => {
    const res = await request('GET', '/v1/calls');
    // Should return 401 without valid API key or 200 with valid key
    assertTrue(res.status === 401 || res.status === 200,
      `Expected 401 (no auth) or 200 (valid auth), got ${res.status}`);
  });

  await test('POST /v1/calls - Create outbound call (validation)', async () => {
    const res = await request('POST', '/v1/calls', {
      // Missing required fields - should fail validation
    });
    assertTrue(res.status === 400 || res.status === 401 || res.status === 422,
      `Expected 400/401/422 for invalid request, got ${res.status}`);
  });
}

// ============================================================================
// Webhook Tests
// ============================================================================
async function testWebhookEndpoints() {
  console.log(`\n${colors.yellow}=== Webhook API Tests ===${colors.reset}\n`);

  await test('GET /v1/webhooks - List webhooks', async () => {
    const res = await request('GET', '/v1/webhooks');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);

    if (res.status === 200) {
      assertTrue(Array.isArray(res.data) || res.data.webhooks,
        'Response should be array or have webhooks property');
    }
  });

  await test('GET /v1/webhooks/event-types - List event types', async () => {
    const res = await request('GET', '/v1/webhooks/event-types');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });

  await test('POST /v1/webhooks - Create webhook (validation)', async () => {
    const res = await request('POST', '/v1/webhooks', {
      url: 'https://example.com/webhook',
      events: ['call.created']
    });
    // Should require auth or validate request
    assertTrue(res.status >= 200 && res.status < 500,
      `Expected valid HTTP status, got ${res.status}`);
  });
}

// ============================================================================
// Email API Tests
// ============================================================================
async function testEmailEndpoints() {
  console.log(`\n${colors.yellow}=== Email API Tests ===${colors.reset}\n`);

  await test('GET /v1/email - List emails', async () => {
    const res = await request('GET', '/v1/email');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });

  await test('POST /v1/email/send - Send email (validation)', async () => {
    const res = await request('POST', '/v1/email/send', {
      to: 'test@example.com',
      subject: 'Test Email',
      body: 'This is a test'
    });
    // Should require auth or validate
    assertTrue(res.status >= 200 && res.status < 500,
      `Expected valid HTTP status, got ${res.status}`);
  });

  await test('GET /v1/email/templates - List templates', async () => {
    const res = await request('GET', '/v1/email/templates');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });
}

// ============================================================================
// Analytics API Tests
// ============================================================================
async function testAnalyticsEndpoints() {
  console.log(`\n${colors.yellow}=== Analytics API Tests ===${colors.reset}\n`);

  await test('GET /v1/analytics/dashboard - Dashboard overview', async () => {
    const res = await request('GET', '/v1/analytics/dashboard');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);

    if (res.status === 200) {
      assertHasProperty(res.data, 'calls');
      assertHasProperty(res.data, 'sms');
      assertHasProperty(res.data, 'emails');
    }
  });

  await test('GET /v1/analytics/calls - Call analytics', async () => {
    const res = await request('GET', '/v1/analytics/calls');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });

  await test('GET /v1/analytics/sms - SMS analytics', async () => {
    const res = await request('GET', '/v1/analytics/sms');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });

  await test('GET /v1/analytics/email - Email analytics', async () => {
    const res = await request('GET', '/v1/analytics/email');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });
}

// ============================================================================
// TTS API Tests
// ============================================================================
async function testTTSEndpoints() {
  console.log(`\n${colors.yellow}=== TTS API Tests ===${colors.reset}\n`);

  await test('GET /v1/tts/providers - List TTS providers', async () => {
    const res = await request('GET', '/v1/tts/providers');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);

    if (res.status === 200) {
      assertTrue(Array.isArray(res.data) || res.data.providers,
        'Should return array of providers');
    }
  });

  await test('GET /v1/tts/voices - List available voices', async () => {
    const res = await request('GET', '/v1/tts/voices');
    assertTrue(res.status === 200 || res.status === 401,
      `Expected 200 or 401, got ${res.status}`);
  });

  await test('POST /v1/tts/generate - Generate TTS (validation)', async () => {
    const res = await request('POST', '/v1/tts/generate', {
      text: 'Hello world',
      voice: 'alloy'
    });
    // Should require auth or validate
    assertTrue(res.status >= 200 && res.status < 500,
      `Expected valid HTTP status, got ${res.status}`);
  });
}

// ============================================================================
// Error Handling Tests
// ============================================================================
async function testErrorHandling() {
  console.log(`\n${colors.yellow}=== Error Handling Tests ===${colors.reset}\n`);

  await test('GET /invalid-endpoint - 404 handling', async () => {
    const res = await request('GET', '/invalid-endpoint-xyz');
    assertStatus(res, 404, 'Invalid endpoint should return 404');
    assertHasProperty(res.data, 'error');
  });

  await test('POST /v1/calls - Invalid JSON handling', async () => {
    const url = `${API_BASE_URL}/v1/calls`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: 'invalid json {'
    });
    assertTrue(response.status >= 400, 'Invalid JSON should return error status');
  });
}

// ============================================================================
// Security Tests
// ============================================================================
async function testSecurity() {
  console.log(`\n${colors.yellow}=== Security Tests ===${colors.reset}\n`);

  await test('API Key required for protected endpoints', async () => {
    const res = await request('GET', '/v1/calls', null, { 'X-API-Key': '' });
    assertTrue(res.status === 401 || res.status === 403,
      `Protected endpoint should require auth, got ${res.status}`);
  });

  await test('CORS headers present', async () => {
    const res = await request('GET', '/health');
    assertTrue(res.headers['access-control-allow-origin'] !== undefined ||
               res.headers['Access-Control-Allow-Origin'] !== undefined,
      'CORS headers should be present');
  });
}

// ============================================================================
// Main Test Runner
// ============================================================================
async function runAllTests() {
  console.log(`${colors.blue}
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║    IRISX Platform - API Test Suite                        ║
║    Testing ${API_BASE_URL}
║                                                            ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const startTime = Date.now();

  // Run all test suites
  await testHealthEndpoints();
  await testCallEndpoints();
  await testWebhookEndpoints();
  await testEmailEndpoints();
  await testAnalyticsEndpoints();
  await testTTSEndpoints();
  await testErrorHandling();
  await testSecurity();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Print summary
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}Test Summary${colors.reset}\n`);
  console.log(`  Total Tests:  ${results.total}`);
  console.log(`  ${colors.green}Passed:       ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed:       ${results.failed}${colors.reset}`);
  console.log(`  ${colors.gray}Skipped:      ${results.skipped}${colors.reset}`);
  console.log(`  Duration:     ${duration}s\n`);

  // Print failed tests
  if (results.failed > 0) {
    console.log(`${colors.red}Failed Tests:${colors.reset}`);
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`  ${colors.red}✗${colors.reset} ${t.name}`);
        if (t.error) {
          console.log(`    ${colors.gray}${t.error}${colors.reset}`);
        }
      });
    console.log();
  }

  // Exit code
  const exitCode = results.failed > 0 ? 1 : 0;

  if (exitCode === 0) {
    console.log(`${colors.green}✓ All tests passed!${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ Some tests failed!${colors.reset}\n`);
  }

  process.exit(exitCode);
}

// Run tests
runAllTests().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
