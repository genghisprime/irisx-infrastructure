const { chromium } = require('playwright');

const PORTAL_URL = 'https://app.tazzi.com';

async function main() {
  console.log('=== Customer Portal Console Error Audit ===\n');
  console.log('Target: ' + PORTAL_URL + '\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  // Collect console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        text: msg.text(),
        location: msg.location()
      });
    }
  });

  // Collect network failures
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });

  // Pages to test
  const publicPages = [
    { name: 'Login', url: PORTAL_URL },
    { name: 'Signup', url: PORTAL_URL + '/signup' },
  ];

  const allErrors = {};

  // Test public pages first
  for (const p of publicPages) {
    console.log('\n--- Testing: ' + p.name + ' ---');
    consoleErrors.length = 0;
    networkErrors.length = 0;

    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      if (consoleErrors.length > 0) {
        console.log('  Console Errors (' + consoleErrors.length + '):');
        consoleErrors.forEach((err, i) => {
          console.log('    ' + (i + 1) + '. ' + err.text.substring(0, 200));
          const key = err.text.substring(0, 100);
          if (!allErrors[key]) {
            allErrors[key] = { count: 0, pages: [] };
          }
          allErrors[key].count++;
          allErrors[key].pages.push(p.name);
        });
      } else {
        console.log('  No console errors');
      }

      if (networkErrors.length > 0) {
        console.log('  Network Errors (' + networkErrors.length + '):');
        networkErrors.forEach((err, i) => {
          console.log('    ' + (i + 1) + '. ' + err.url + ' - ' + err.failure);
        });
      }
    } catch (e) {
      console.log('  Page load error: ' + e.message);
    }
  }

  // Now login and test dashboard pages
  console.log('\n--- Logging in to test dashboard pages ---');

  try {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"], input[id="email"]', 'demo@demo.com');
    await page.fill('input[type="password"], input[id="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('  Current URL after login: ' + page.url());
  } catch (e) {
    console.log('  Login failed: ' + e.message);
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
    console.log('\n--- Testing: ' + p.name + ' ---');
    consoleErrors.length = 0;
    networkErrors.length = 0;

    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      if (consoleErrors.length > 0) {
        console.log('  Console Errors (' + consoleErrors.length + '):');
        consoleErrors.forEach((err, i) => {
          console.log('    ' + (i + 1) + '. ' + err.text.substring(0, 200));
          const key = err.text.substring(0, 100);
          if (!allErrors[key]) {
            allErrors[key] = { count: 0, pages: [] };
          }
          allErrors[key].count++;
          allErrors[key].pages.push(p.name);
        });
      } else {
        console.log('  No console errors');
      }

      if (networkErrors.length > 0) {
        console.log('  Network Errors (' + networkErrors.length + '):');
        networkErrors.forEach((err, i) => {
          console.log('    ' + (i + 1) + '. ' + err.url.substring(0, 100) + ' - ' + err.failure);
        });
      }
    } catch (e) {
      console.log('  Page error: ' + e.message);
    }
  }

  await browser.close();

  // Summary
  console.log('\n\n=== ERROR SUMMARY ===');
  const errorKeys = Object.keys(allErrors);
  if (errorKeys.length > 0) {
    console.log('\nUnique errors found: ' + errorKeys.length);
    errorKeys.forEach((key, i) => {
      console.log('\n' + (i + 1) + '. (' + allErrors[key].count + 'x) ' + key);
      console.log('   Pages: ' + allErrors[key].pages.join(', '));
    });
  } else {
    console.log('\nNo console errors found across all pages!');
  }
}

main().catch(console.error);
