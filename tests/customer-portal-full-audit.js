const { chromium } = require('playwright');

const PORTAL_URL = 'https://app.tazzi.com';

async function main() {
  console.log('=== Customer Portal Full Console Audit ===\n');
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

  // Collect ALL console messages (not just errors)
  page.on('console', msg => {
    allConsoleMessages.push({
      page: currentPage,
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });

    // Print errors and warnings immediately
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log('  [' + msg.type().toUpperCase() + '] ' + msg.text().substring(0, 150));
    }
  });

  // Collect network failures
  page.on('requestfailed', request => {
    allNetworkErrors.push({
      page: currentPage,
      url: request.url(),
      failure: request.failure()?.errorText
    });
    console.log('  [NET ERROR] ' + request.url().substring(0, 80) + ' - ' + (request.failure()?.errorText || 'unknown'));
  });

  // Test login page
  currentPage = 'Login';
  console.log('\n--- Testing: Login Page ---');
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Actually login
  console.log('\n--- Performing Login ---');
  currentPage = 'Login Action';

  await page.fill('input#email', 'demo@demo.com');
  await page.fill('input#password', 'test123');

  // Click and wait for navigation
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);

  await page.waitForTimeout(2000);
  console.log('  Current URL: ' + page.url());

  // Check if we're on dashboard
  if (page.url().includes('/dashboard')) {
    console.log('  Login successful!');
  } else {
    console.log('  Login may have failed, checking for errors...');
    const errorText = await page.textContent('.text-red-600').catch(() => null);
    if (errorText) {
      console.log('  Error shown: ' + errorText);
    }
  }

  // Dashboard pages to test
  const dashboardPages = [
    { name: 'Dashboard Home', url: PORTAL_URL + '/dashboard' },
    { name: 'Conversations', url: PORTAL_URL + '/dashboard/conversations' },
    { name: 'Call Logs', url: PORTAL_URL + '/dashboard/call-logs' },
    { name: 'Messages', url: PORTAL_URL + '/dashboard/messages' },
    { name: 'Agents', url: PORTAL_URL + '/dashboard/agents' },
    { name: 'Queues', url: PORTAL_URL + '/dashboard/queues' },
    { name: 'Analytics', url: PORTAL_URL + '/dashboard/analytics' },
    { name: 'Settings', url: PORTAL_URL + '/dashboard/settings' },
    { name: 'Business Messaging', url: PORTAL_URL + '/business-messaging' },
    { name: 'STIR/SHAKEN', url: PORTAL_URL + '/stir-shaken' },
    { name: 'AI Settings', url: PORTAL_URL + '/ai' },
    { name: 'Voice Assistants', url: PORTAL_URL + '/voice' },
    { name: 'Video Rooms', url: PORTAL_URL + '/video' },
    { name: 'AMD Settings', url: PORTAL_URL + '/amd' },
    { name: 'Agent Scripts', url: PORTAL_URL + '/scripts' },
    { name: 'SSO Settings', url: PORTAL_URL + '/sso' },
  ];

  for (const p of dashboardPages) {
    currentPage = p.name;
    console.log('\n--- Testing: ' + p.name + ' ---');

    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Check for Vue warnings in page content
      const pageContent = await page.content();
      if (pageContent.includes('[Vue warn]')) {
        console.log('  [VUE WARN] Found Vue warning in page');
      }

    } catch (e) {
      console.log('  Page error: ' + e.message);
    }
  }

  await browser.close();

  // Summary
  console.log('\n\n=== FULL SUMMARY ===');

  const errors = allConsoleMessages.filter(m => m.type === 'error');
  const warnings = allConsoleMessages.filter(m => m.type === 'warning');

  console.log('\nTotal console errors: ' + errors.length);
  console.log('Total console warnings: ' + warnings.length);
  console.log('Total network errors: ' + allNetworkErrors.length);

  if (errors.length > 0) {
    console.log('\n--- Console Errors ---');
    const uniqueErrors = {};
    errors.forEach(e => {
      const key = e.text.substring(0, 80);
      if (!uniqueErrors[key]) {
        uniqueErrors[key] = { count: 0, pages: new Set() };
      }
      uniqueErrors[key].count++;
      uniqueErrors[key].pages.add(e.page);
    });

    Object.entries(uniqueErrors).forEach(([text, info], i) => {
      console.log('\n' + (i + 1) + '. (' + info.count + 'x) ' + text);
      console.log('   Pages: ' + Array.from(info.pages).join(', '));
    });
  }

  if (warnings.length > 0) {
    console.log('\n--- Console Warnings ---');
    const uniqueWarnings = {};
    warnings.forEach(w => {
      const key = w.text.substring(0, 80);
      if (!uniqueWarnings[key]) {
        uniqueWarnings[key] = { count: 0, pages: new Set() };
      }
      uniqueWarnings[key].count++;
      uniqueWarnings[key].pages.add(w.page);
    });

    Object.entries(uniqueWarnings).slice(0, 10).forEach(([text, info], i) => {
      console.log('\n' + (i + 1) + '. (' + info.count + 'x) ' + text);
      console.log('   Pages: ' + Array.from(info.pages).join(', '));
    });

    if (Object.keys(uniqueWarnings).length > 10) {
      console.log('\n... and ' + (Object.keys(uniqueWarnings).length - 10) + ' more unique warnings');
    }
  }

  if (allNetworkErrors.length > 0) {
    console.log('\n--- Network Errors ---');
    allNetworkErrors.forEach((e, i) => {
      console.log((i + 1) + '. [' + e.page + '] ' + e.url.substring(0, 80));
    });
  }
}

main().catch(console.error);
