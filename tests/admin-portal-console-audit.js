const { chromium } = require('playwright');

const PORTAL_URL = 'https://admin.tazzi.com';

async function main() {
  console.log('=== Admin Portal Console Audit ===\n');
  console.log('Target: ' + PORTAL_URL + '\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  const allConsoleMessages = [];
  const allNetworkErrors = [];
  let currentPage = '';

  page.on('console', msg => {
    allConsoleMessages.push({
      page: currentPage,
      type: msg.type(),
      text: msg.text()
    });
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('  [' + msg.type().toUpperCase() + '] ' + msg.text().substring(0, 150));
    }
  });

  page.on('requestfailed', request => {
    allNetworkErrors.push({
      page: currentPage,
      url: request.url(),
      failure: request.failure()?.errorText
    });
    console.log('  [NET ERROR] ' + request.url().substring(0, 80));
  });

  // Test login page
  currentPage = 'Login';
  console.log('\n--- Testing: Login Page ---');
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Login
  console.log('\n--- Performing Login ---');
  currentPage = 'Login Action';
  await page.fill('input#user-identifier', 'admin@irisx.internal');
  await page.fill('input#user-secret', 'Admin1234');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(2000);
  console.log('  Current URL: ' + page.url());

  // Admin pages to test
  const adminPages = [
    { name: 'Dashboard', url: PORTAL_URL + '/dashboard' },
    { name: 'System Health', url: PORTAL_URL + '/dashboard/system-health' },
    { name: 'Audit Log', url: PORTAL_URL + '/dashboard/audit-log' },
    { name: 'Tenants', url: PORTAL_URL + '/tenants' },
    { name: 'Agents', url: PORTAL_URL + '/agents' },
    { name: 'Billing', url: PORTAL_URL + '/billing' },
    { name: 'Invoices', url: PORTAL_URL + '/billing/invoices' },
    { name: 'Analytics', url: PORTAL_URL + '/analytics' },
    { name: 'Phone Numbers', url: PORTAL_URL + '/communications/phone-numbers' },
    { name: 'Recordings', url: PORTAL_URL + '/communications/recordings' },
    { name: 'CDR Viewer', url: PORTAL_URL + '/cdrs' },
    { name: 'SIP Trunks', url: PORTAL_URL + '/sip-trunks' },
    { name: 'Email Service', url: PORTAL_URL + '/email-service' },
    { name: 'System Settings', url: PORTAL_URL + '/settings' },
    { name: 'Feature Flags', url: PORTAL_URL + '/settings/feature-flags' },
    { name: 'Webhooks', url: PORTAL_URL + '/webhooks' },
    { name: 'AI Management', url: PORTAL_URL + '/ai' },
    { name: 'Voice Management', url: PORTAL_URL + '/voice' },
    { name: 'STIR/SHAKEN', url: PORTAL_URL + '/stir-shaken' },
    { name: 'Business Messaging', url: PORTAL_URL + '/business-messaging' },
  ];

  for (const p of adminPages) {
    currentPage = p.name;
    console.log('\n--- Testing: ' + p.name + ' ---');
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log('  Page error: ' + e.message);
    }
  }

  await browser.close();

  // Summary
  console.log('\n\n=== ADMIN PORTAL SUMMARY ===');
  const errors = allConsoleMessages.filter(m => m.type === 'error');
  const warnings = allConsoleMessages.filter(m => m.type === 'warning');
  console.log('\nTotal console errors: ' + errors.length);
  console.log('Total console warnings: ' + warnings.length);
  console.log('Total network errors: ' + allNetworkErrors.length);

  if (errors.length > 0) {
    console.log('\n--- Unique Console Errors ---');
    const uniqueErrors = {};
    errors.forEach(e => {
      const key = e.text.substring(0, 80);
      if (!uniqueErrors[key]) uniqueErrors[key] = { count: 0, pages: new Set() };
      uniqueErrors[key].count++;
      uniqueErrors[key].pages.add(e.page);
    });
    Object.entries(uniqueErrors).slice(0, 15).forEach(([text, info], i) => {
      console.log((i + 1) + '. (' + info.count + 'x) ' + text);
      console.log('   Pages: ' + Array.from(info.pages).join(', '));
    });
  }
}

main().catch(console.error);
