const { chromium } = require('playwright');

const PORTAL_URL = 'https://agent.tazzi.com';

async function main() {
  console.log('=== Agent Desktop Console Audit ===\n');
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

  // Login with agent credentials
  console.log('\n--- Performing Login ---');
  currentPage = 'Login Action';

  // Try to find and fill login form
  try {
    // Wait for Vue to render the form
    await page.waitForSelector('input#email', { timeout: 5000 });

    await page.fill('input#email', 'demo@demo.com');
    await page.fill('input#password', 'test123');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]')
    ]);
    await page.waitForTimeout(2000);
    console.log('  Current URL: ' + page.url());
  } catch (e) {
    console.log('  Login form not found or error: ' + e.message);
  }

  // Agent desktop pages to test
  const agentPages = [
    { name: 'Dashboard', url: PORTAL_URL + '/dashboard' },
    { name: 'Phone', url: PORTAL_URL + '/phone' },
    { name: 'Conversations', url: PORTAL_URL + '/conversations' },
    { name: 'Contacts', url: PORTAL_URL + '/contacts' },
    { name: 'History', url: PORTAL_URL + '/history' },
    { name: 'Settings', url: PORTAL_URL + '/settings' },
  ];

  for (const p of agentPages) {
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
  console.log('\n\n=== AGENT DESKTOP SUMMARY ===');
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
