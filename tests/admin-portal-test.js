/**
 * Admin Portal Comprehensive Test
 * Tests all pages and captures any errors
 */

const { chromium } = require('playwright');

const BASE_URL = 'https://admin.tazzi.com';
const TEST_EMAIL = 'admin@irisx.internal';
const TEST_PASSWORD = 'Admin1234';

// All admin routes to test
const ROUTES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/dashboard/system-health', name: 'System Health' },
  { path: '/dashboard/audit-log', name: 'Audit Log' },
  { path: '/dashboard/usage-analytics', name: 'Usage Analytics' },
  { path: '/dashboard/tenants', name: 'Tenant List' },
  { path: '/dashboard/tenants/create', name: 'Tenant Create' },
  { path: '/dashboard/billing/invoices', name: 'Invoice List' },
  { path: '/dashboard/billing/revenue', name: 'Revenue Reports' },
  { path: '/dashboard/billing/rates', name: 'Billing Rates' },
  { path: '/dashboard/conversations', name: 'Conversation Oversight' },
  { path: '/dashboard/recordings', name: 'Recording Management' },
  { path: '/dashboard/phone-numbers', name: 'Phone Number Provisioning' },
  { path: '/dashboard/agents', name: 'Agent List' },
  { path: '/dashboard/supervisor', name: 'Supervisor Dashboard' },
  { path: '/dashboard/providers', name: 'Provider Credentials' },
  { path: '/dashboard/queues', name: 'Queue Management' },
  { path: '/dashboard/campaigns', name: 'Campaign Monitoring' },
  { path: '/dashboard/contacts', name: 'Contact Management' },
  { path: '/dashboard/cdrs', name: 'CDR Viewer' },
  { path: '/dashboard/ivr', name: 'IVR Management' },
  { path: '/dashboard/social-media', name: 'Social Media Hub' },
  { path: '/dashboard/analytics/overview', name: 'Analytics Overview' },
  { path: '/dashboard/whatsapp', name: 'WhatsApp Management' },
  { path: '/dashboard/sms-templates', name: 'SMS Templates' },
  { path: '/dashboard/email-templates', name: 'Email Templates' },
  { path: '/dashboard/sip-trunks', name: 'SIP Trunk Config' },
  { path: '/dashboard/email-service', name: 'Email Service' },
  { path: '/dashboard/webhooks', name: 'Webhook Management' },
  { path: '/dashboard/database', name: 'Database Management' },
  { path: '/dashboard/cache', name: 'Cache Management' },
  { path: '/dashboard/settings/features', name: 'Feature Flags' },
  { path: '/dashboard/settings/system', name: 'System Settings' },
  { path: '/dashboard/alerts', name: 'Alert Management' },
  { path: '/dashboard/data-import', name: 'Data Import' },
  { path: '/dashboard/api-keys', name: 'API Key Management' },
];

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const errors = [];
  const consoleErrors = [];
  const networkErrors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        page: page.url(),
        message: msg.text()
      });
    }
  });

  // Capture network errors
  page.on('requestfailed', request => {
    networkErrors.push({
      page: page.url(),
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });

  // Capture page errors
  page.on('pageerror', error => {
    errors.push({
      page: page.url(),
      error: error.message
    });
  });

  console.log('Starting Admin Portal Tests...\n');
  console.log('=' .repeat(60));

  // Step 1: Login
  console.log('\n1. Testing Login...');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[name="user-identifier"]', TEST_EMAIL);
    await page.fill('input[name="user-secret"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('   ✓ Login successful');
  } catch (e) {
    console.log(`   ✗ Login failed: ${e.message}`);
    errors.push({ page: 'Login', error: e.message });
  }

  // Step 2: Test each route
  console.log('\n2. Testing All Routes...\n');

  for (const route of ROUTES) {
    process.stdout.write(`   Testing ${route.name.padEnd(30)}`);

    try {
      const startTime = Date.now();
      const response = await page.goto(`${BASE_URL}${route.path}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      const loadTime = Date.now() - startTime;

      // Check for HTTP errors
      if (response && response.status() >= 400) {
        console.log(`✗ HTTP ${response.status()}`);
        errors.push({
          page: route.name,
          path: route.path,
          error: `HTTP ${response.status()}`
        });
        continue;
      }

      // Wait a bit for Vue to render
      await page.waitForTimeout(500);

      // Check for visible error messages on page
      const errorElements = await page.$$('text=/error|failed|exception/i');
      const visibleErrors = [];
      for (const el of errorElements) {
        if (await el.isVisible()) {
          const text = await el.textContent();
          if (text && !text.includes('error_outline') && text.length < 200) {
            visibleErrors.push(text.trim());
          }
        }
      }

      // Check if page has meaningful content
      const content = await page.textContent('body');
      const hasContent = content && content.trim().length > 100;

      if (visibleErrors.length > 0) {
        console.log(`⚠ Errors visible (${loadTime}ms)`);
        errors.push({
          page: route.name,
          path: route.path,
          error: visibleErrors.join('; ').substring(0, 100)
        });
      } else if (!hasContent) {
        console.log(`⚠ Empty page (${loadTime}ms)`);
        errors.push({
          page: route.name,
          path: route.path,
          error: 'Page appears empty'
        });
      } else {
        console.log(`✓ OK (${loadTime}ms)`);
      }
    } catch (e) {
      console.log(`✗ ${e.message.substring(0, 50)}`);
      errors.push({
        page: route.name,
        path: route.path,
        error: e.message
      });
    }
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('\nTEST SUMMARY\n');

  console.log(`Total Routes Tested: ${ROUTES.length}`);
  console.log(`Page Errors: ${errors.length}`);
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`Network Errors: ${networkErrors.length}`);

  if (errors.length > 0) {
    console.log('\n--- PAGE ERRORS ---');
    errors.forEach(e => {
      console.log(`\n  ${e.page} (${e.path || ''})`);
      console.log(`    Error: ${e.error}`);
    });
  }

  if (consoleErrors.length > 0) {
    console.log('\n--- CONSOLE ERRORS (first 20) ---');
    const uniqueErrors = [...new Set(consoleErrors.map(e => e.message))];
    uniqueErrors.slice(0, 20).forEach(msg => {
      console.log(`  - ${msg.substring(0, 150)}`);
    });
  }

  if (networkErrors.length > 0) {
    console.log('\n--- NETWORK ERRORS (first 10) ---');
    const uniqueNetErrors = [];
    networkErrors.forEach(e => {
      const key = `${e.url} - ${e.failure}`;
      if (!uniqueNetErrors.find(x => x.key === key)) {
        uniqueNetErrors.push({ ...e, key });
      }
    });
    uniqueNetErrors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.url.substring(0, 80)}`);
      console.log(`    Failure: ${e.failure}`);
    });
  }

  await browser.close();

  // Return exit code based on errors
  const hasErrors = errors.length > 0 || consoleErrors.filter(e => !e.message.includes('favicon')).length > 0;
  console.log('\n' + (hasErrors ? '❌ TESTS FAILED' : '✅ ALL TESTS PASSED'));

  return { errors, consoleErrors, networkErrors };
}

runTests().catch(console.error);
