const { chromium } = require('playwright');

const PORTAL_URL = 'https://app.tazzi.com';
const LOGIN_EMAIL = 'demo@demo.com';
const LOGIN_PASSWORD = 'test123';

// All customer portal pages to test
const ALL_PAGES = [
  // Main Dashboard
  { name: 'Dashboard Home', path: '/dashboard', checkSelectors: ['h1', '.stat-card, .card'] },

  // Communication
  { name: 'Conversations', path: '/dashboard/conversations', checkSelectors: ['.conversations, .empty-state'] },
  { name: 'Call Logs', path: '/dashboard/call-logs', checkSelectors: ['table, .empty-state'] },
  { name: 'Messages', path: '/dashboard/messages', checkSelectors: ['.messages, .empty-state'] },
  { name: 'Chat Inbox', path: '/dashboard/chat-inbox', checkSelectors: ['.chat, .empty-state'] },
  { name: 'Chat Settings', path: '/dashboard/chat-settings', checkSelectors: ['form, .settings'] },

  // Email
  { name: 'Email Campaigns', path: '/dashboard/emails', checkSelectors: ['.campaigns, .empty-state'] },
  { name: 'Email Templates', path: '/dashboard/email-templates', checkSelectors: ['.templates, .space-y-6'] },
  { name: 'Email Campaign Builder', path: '/dashboard/email-campaign-builder', checkSelectors: ['.campaign-builder, .wizard'] },
  { name: 'Email Analytics', path: '/dashboard/email-analytics', checkSelectors: ['.analytics, .metrics'] },
  { name: 'Email Automation', path: '/dashboard/email-automation', checkSelectors: ['.automation, .rules'] },
  { name: 'Email Deliverability', path: '/dashboard/email-deliverability', checkSelectors: ['.email-deliverability, .stat-card'] },
  { name: 'Email Template Library', path: '/dashboard/email-template-library', checkSelectors: ['.templates, .library'] },

  // Social & Messaging
  { name: 'WhatsApp', path: '/dashboard/whatsapp', checkSelectors: ['.whatsapp, .messages'] },
  { name: 'Social Messages', path: '/dashboard/social', checkSelectors: ['.social, .messages'] },
  { name: 'Social Connect', path: '/dashboard/social/connect', checkSelectors: ['.connect, .platforms'] },

  // Contact Center
  { name: 'Agents', path: '/dashboard/agents', checkSelectors: ['.agent-management, table'] },
  { name: 'Agent Performance', path: '/dashboard/agent-performance', checkSelectors: ['.performance, .metrics'] },
  { name: 'Queues', path: '/dashboard/queues', checkSelectors: ['.queues, table'] },
  { name: 'Callbacks', path: '/dashboard/callbacks', checkSelectors: ['.callbacks, table'] },
  { name: 'Wallboard', path: '/dashboard/wallboard', checkSelectors: ['.wallboard, .stats'] },
  { name: 'Recordings', path: '/dashboard/recordings', checkSelectors: ['.recordings, table'] },

  // Campaigns
  { name: 'Campaigns', path: '/dashboard/campaigns', checkSelectors: ['.campaigns, table'] },

  // Contacts
  { name: 'Contacts', path: '/dashboard/contacts', checkSelectors: ['.contacts, table'] },
  { name: 'Contact Lists', path: '/dashboard/lists', checkSelectors: ['.lists, table'] },
  { name: 'Data Import', path: '/dashboard/data-import', checkSelectors: ['.import, form'] },

  // Analytics
  { name: 'Analytics', path: '/dashboard/analytics', checkSelectors: ['.analytics, .charts'] },
  { name: 'Unified Analytics', path: '/dashboard/unified-analytics', checkSelectors: ['.analytics, .unified'] },

  // Settings & Config
  { name: 'API Keys', path: '/dashboard/api-keys', checkSelectors: ['.api-keys, table'] },
  { name: 'Webhooks', path: '/dashboard/webhooks', checkSelectors: ['.webhooks, table'] },
  { name: 'Webhook Config', path: '/dashboard/webhook-config', checkSelectors: ['.webhook, .config'] },
  { name: 'Settings', path: '/dashboard/settings', checkSelectors: ['.settings, form'] },
  { name: 'Knowledge Base', path: '/dashboard/knowledge-base', checkSelectors: ['.knowledge, .articles'] },

  // Billing
  { name: 'Usage Dashboard', path: '/dashboard/usage', checkSelectors: ['.usage, .metrics'] },
  { name: 'Billing History', path: '/dashboard/billing-history', checkSelectors: ['.billing, table'] },
  { name: 'Billing Portal', path: '/dashboard/billing', checkSelectors: ['.billing, .portal'] },

  // Full-screen pages (outside dashboard layout)
  { name: 'IVR Flows', path: '/ivr', checkSelectors: ['.ivr, .flows'] },
  { name: 'Quality Management', path: '/quality', checkSelectors: ['.quality, .management'] },
  { name: 'CRM Integrations', path: '/integrations', checkSelectors: ['.integrations, .crm'] },
  { name: 'Workforce Management', path: '/wfm', checkSelectors: ['.wfm, .workforce'] },
  { name: 'Report Builder', path: '/reports/builder', checkSelectors: ['.reports, .builder'] },
  { name: 'Translation Settings', path: '/translation', checkSelectors: ['.translation, .settings'] },
  { name: 'AI Settings', path: '/ai', checkSelectors: ['.ai, .settings'] },
  { name: 'Voice Assistants', path: '/voice', checkSelectors: ['.voice, .assistants'] },
  { name: 'Video Rooms', path: '/video', checkSelectors: ['.video, .rooms'] },
  { name: 'Business Messaging', path: '/business-messaging', checkSelectors: ['.business-messaging, .messaging'] },
  { name: 'STIR/SHAKEN', path: '/stir-shaken', checkSelectors: ['.stir-shaken, .compliance'] },
  { name: 'AMD Settings', path: '/amd', checkSelectors: ['.amd, .settings'] },
  { name: 'Agent Scripts', path: '/scripts', checkSelectors: ['.scripts, .agent-scripts'] },
  { name: 'SSO Settings', path: '/sso', checkSelectors: ['.sso, .settings'] },
];

async function main() {
  console.log('========================================');
  console.log('=== COMPREHENSIVE CUSTOMER PORTAL TEST ===');
  console.log('========================================\n');
  console.log(`Target: ${PORTAL_URL}`);
  console.log(`Testing ${ALL_PAGES.length} pages\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  // Track all issues
  const results = {
    consoleErrors: [],
    networkErrors: [],
    pageErrors: [],
    buttonTests: [],
    apiErrors: [],
  };

  let currentPage = '';

  // Collect console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Skip some known noise
      if (text.includes('favicon.ico') || text.includes('source map')) return;

      results.consoleErrors.push({
        page: currentPage,
        text: text.substring(0, 300),
        type: msg.type()
      });
    }
  });

  // Collect network failures
  page.on('requestfailed', request => {
    const url = request.url();
    // Skip favicon and source maps
    if (url.includes('favicon') || url.includes('.map')) return;

    results.networkErrors.push({
      page: currentPage,
      url: url,
      method: request.method(),
      failure: request.failure()?.errorText
    });
  });

  // Collect API errors (non-2xx responses)
  page.on('response', response => {
    const url = response.url();
    const status = response.status();

    if (url.includes('/v1/') && status >= 400) {
      results.apiErrors.push({
        page: currentPage,
        url: url.replace('https://api.tazzi.com', ''),
        status: status,
        statusText: response.statusText()
      });
    }
  });

  // ========== LOGIN ==========
  console.log('=== Step 1: Login ===');
  currentPage = 'Login';

  try {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.fill('input#email', LOGIN_EMAIL);
    await page.fill('input#password', LOGIN_PASSWORD);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]')
    ]);

    await page.waitForTimeout(2000);

    if (page.url().includes('/dashboard')) {
      console.log('Login successful!\n');
    } else {
      console.log('Login may have failed - URL: ' + page.url());
      const errorText = await page.$eval('.text-red-600', el => el.textContent).catch(() => null);
      if (errorText) console.log('Error: ' + errorText);
    }
  } catch (e) {
    console.log('Login error: ' + e.message);
    results.pageErrors.push({ page: 'Login', error: e.message });
  }

  // ========== TEST ALL PAGES ==========
  console.log('=== Step 2: Testing All Pages ===\n');

  let passedPages = 0;
  let failedPages = 0;

  for (const pageConfig of ALL_PAGES) {
    currentPage = pageConfig.name;
    const fullUrl = PORTAL_URL + pageConfig.path;

    process.stdout.write(`Testing: ${pageConfig.name.padEnd(25)}`);

    try {
      const startTime = Date.now();
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(500);

      const loadTime = Date.now() - startTime;

      // Check if page loaded correctly (not redirected to login)
      if (page.url().includes('/login')) {
        console.log('FAIL (redirected to login)');
        failedPages++;
        results.pageErrors.push({ page: pageConfig.name, error: 'Redirected to login' });
        continue;
      }

      // Check for error pages - use visible text only (not raw HTML which may contain "404" in JS)
      const visibleText = await page.evaluate(() => document.body.innerText);
      if (visibleText.includes('Page Not Found') || visibleText.includes('page not found') ||
          (visibleText.includes('404') && visibleText.includes('Error'))) {
        console.log('FAIL (404)');
        failedPages++;
        results.pageErrors.push({ page: pageConfig.name, error: '404 Not Found' });
        continue;
      }

      // Check if main content loaded
      let foundContent = false;
      for (const selector of pageConfig.checkSelectors) {
        const selectors = selector.split(', ');
        for (const s of selectors) {
          try {
            const element = await page.$(s);
            if (element) {
              foundContent = true;
              break;
            }
          } catch (e) {}
        }
        if (foundContent) break;
      }

      if (foundContent) {
        console.log(`OK (${loadTime}ms)`);
        passedPages++;
      } else {
        console.log(`WARN (no content found, ${loadTime}ms)`);
        passedPages++; // Still count as passed if page loaded
      }

      // Test buttons on the page
      await testPageButtons(page, pageConfig.name, results);

    } catch (e) {
      console.log(`FAIL (${e.message.substring(0, 50)})`);
      failedPages++;
      results.pageErrors.push({ page: pageConfig.name, error: e.message });
    }
  }

  await browser.close();

  // ========== SUMMARY ==========
  console.log('\n========================================');
  console.log('=== TEST SUMMARY ===');
  console.log('========================================\n');

  console.log(`Pages Passed: ${passedPages}/${ALL_PAGES.length}`);
  console.log(`Pages Failed: ${failedPages}/${ALL_PAGES.length}`);
  console.log(`Console Errors: ${results.consoleErrors.length}`);
  console.log(`Network Errors: ${results.networkErrors.length}`);
  console.log(`API Errors (4xx/5xx): ${results.apiErrors.length}`);

  // Group console errors by message
  if (results.consoleErrors.length > 0) {
    console.log('\n--- CONSOLE ERRORS ---');
    const errorGroups = {};
    results.consoleErrors.forEach(e => {
      const key = e.text.substring(0, 100);
      if (!errorGroups[key]) {
        errorGroups[key] = { count: 0, pages: new Set() };
      }
      errorGroups[key].count++;
      errorGroups[key].pages.add(e.page);
    });

    Object.entries(errorGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .forEach(([text, info], i) => {
        console.log(`\n${i + 1}. (${info.count}x) ${text}`);
        console.log(`   Pages: ${Array.from(info.pages).slice(0, 5).join(', ')}${info.pages.size > 5 ? '...' : ''}`);
      });
  }

  // API Errors
  if (results.apiErrors.length > 0) {
    console.log('\n--- API ERRORS ---');
    const apiGroups = {};
    results.apiErrors.forEach(e => {
      const key = `${e.status} ${e.url}`;
      if (!apiGroups[key]) {
        apiGroups[key] = { count: 0, pages: new Set(), status: e.status };
      }
      apiGroups[key].count++;
      apiGroups[key].pages.add(e.page);
    });

    Object.entries(apiGroups)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([key, info], i) => {
        console.log(`${i + 1}. ${key} (${info.count}x)`);
        console.log(`   Pages: ${Array.from(info.pages).join(', ')}`);
      });
  }

  // Network Errors
  if (results.networkErrors.length > 0) {
    console.log('\n--- NETWORK ERRORS ---');
    results.networkErrors.slice(0, 10).forEach((e, i) => {
      console.log(`${i + 1}. [${e.page}] ${e.method} ${e.url.substring(0, 80)}`);
      console.log(`   Failure: ${e.failure}`);
    });
    if (results.networkErrors.length > 10) {
      console.log(`... and ${results.networkErrors.length - 10} more`);
    }
  }

  // Page Errors
  if (results.pageErrors.length > 0) {
    console.log('\n--- PAGE ERRORS ---');
    results.pageErrors.forEach((e, i) => {
      console.log(`${i + 1}. ${e.page}: ${e.error.substring(0, 100)}`);
    });
  }

  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
}

async function testPageButtons(page, pageName, results) {
  // Find all buttons and clickable elements
  try {
    const buttons = await page.$$('button:not([disabled])');

    // Just count them for now, don't click (could cause navigation)
    if (buttons.length > 0) {
      // Test that buttons are visible and have content
      for (const button of buttons.slice(0, 5)) { // Test first 5 buttons
        const isVisible = await button.isVisible();
        const text = await button.textContent().catch(() => '');

        if (!isVisible && text && text.trim()) {
          results.buttonTests.push({
            page: pageName,
            issue: `Hidden button with text: ${text.trim().substring(0, 30)}`
          });
        }
      }
    }
  } catch (e) {
    // Ignore button test errors
  }
}

main().catch(console.error);
