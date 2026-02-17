const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORTAL_URL = 'https://dq0rzcazrc3vd.cloudfront.net';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'dashboard');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const issues = [];

function logIssue(page, type, description, details = {}) {
  const issue = { page, type, description, details, timestamp: new Date().toISOString() };
  issues.push(issue);
  console.log(`[ISSUE] ${page}: ${type} - ${description}`);
  if (Object.keys(details).length > 0) {
    console.log(`        Details: ${JSON.stringify(details)}`);
  }
}

async function auditPage(page, name, url) {
  console.log(`\n--- Auditing: ${name} ---`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    // Try with shorter timeout
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e2) {
      logIssue(name, 'NAVIGATION', `Failed to load page: ${e2.message}`);
      return;
    }
  }

  await page.waitForTimeout(1000);

  // Take screenshot
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${name.replace(/[\/\\:]/g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Screenshot: ${screenshotPath}`);

  // Check for oversized SVGs
  const svgInfo = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const oversized = [];
    svgs.forEach((svg, index) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 100 || rect.height > 100) {
        const parent = svg.parentElement;
        oversized.push({
          index,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          className: svg.className?.baseVal || svg.getAttribute('class') || '',
          parentClass: parent?.className || '',
          parentTag: parent?.tagName || 'unknown'
        });
      }
    });
    return { total: svgs.length, oversized };
  });

  if (svgInfo.oversized.length > 0) {
    logIssue(name, 'OVERSIZED_SVG', `Found ${svgInfo.oversized.length} oversized SVGs (>100px)`, {
      oversized: svgInfo.oversized
    });
  } else {
    console.log(`  SVGs: ${svgInfo.total} total, all properly sized`);
  }

  // Check for layout issues
  const layoutInfo = await page.evaluate(() => {
    return {
      hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });

  if (layoutInfo.hasHorizontalScroll) {
    logIssue(name, 'LAYOUT', 'Page has horizontal scroll', layoutInfo);
  }

  // Check if page seems empty or broken
  const contentCheck = await page.evaluate(() => {
    const text = document.body.innerText?.trim() || '';
    const hasMainContent = document.querySelector('main, [role="main"], .dashboard, .content');
    return {
      textLength: text.length,
      hasMainContent: !!hasMainContent,
      pageTitle: document.title
    };
  });

  if (contentCheck.textLength < 100) {
    logIssue(name, 'CONTENT', 'Page appears to have little content', contentCheck);
  }

  console.log(`  Content check: ${contentCheck.textLength} chars, title: "${contentCheck.pageTitle}"`);
}

async function main() {
  console.log('=== Customer Portal Dashboard Audit ===\n');
  console.log(`Target: ${PORTAL_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // First, set up fake authentication by injecting localStorage
  // This simulates a logged-in state so we can access dashboard pages
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

  // Create a fake JWT token (won't work for API calls but will pass client-side auth check)
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwidGVuYW50SWQiOiIxIiwiZW1haWwiOiJkZW1vQGRlbW8uY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzM5ODAwMDAwLCJleHAiOjE4NzE4MDAwMDB9.fake';

  await page.evaluate((token) => {
    localStorage.setItem('token', token);
  }, fakeToken);

  // Dashboard pages to audit
  const dashboardPages = [
    { name: 'dashboard-home', url: `${PORTAL_URL}/dashboard` },
    { name: 'dashboard-conversations', url: `${PORTAL_URL}/dashboard/conversations` },
    { name: 'dashboard-call-logs', url: `${PORTAL_URL}/dashboard/call-logs` },
    { name: 'dashboard-messages', url: `${PORTAL_URL}/dashboard/messages` },
    { name: 'dashboard-agents', url: `${PORTAL_URL}/dashboard/agents` },
    { name: 'dashboard-queues', url: `${PORTAL_URL}/dashboard/queues` },
    { name: 'dashboard-analytics', url: `${PORTAL_URL}/dashboard/analytics` },
    { name: 'dashboard-settings', url: `${PORTAL_URL}/dashboard/settings` },
    { name: 'business-messaging', url: `${PORTAL_URL}/business-messaging` },
    { name: 'stir-shaken', url: `${PORTAL_URL}/stir-shaken` },
    { name: 'ai-settings', url: `${PORTAL_URL}/ai` },
    { name: 'voice-assistants', url: `${PORTAL_URL}/voice` },
    { name: 'video-rooms', url: `${PORTAL_URL}/video` },
    { name: 'amd-settings', url: `${PORTAL_URL}/amd` },
    { name: 'agent-scripts', url: `${PORTAL_URL}/scripts` },
    { name: 'sso-settings', url: `${PORTAL_URL}/sso` },
  ];

  for (const p of dashboardPages) {
    await auditPage(page, p.name, p.url);
  }

  await browser.close();

  // Summary
  console.log('\n\n=== AUDIT SUMMARY ===');
  console.log(`Total issues found: ${issues.length}`);

  if (issues.length > 0) {
    const byType = {};
    issues.forEach(i => {
      byType[i.type] = (byType[i.type] || 0) + 1;
    });

    console.log('\nIssues by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log('\nAll issues:');
    issues.forEach((issue, i) => {
      console.log(`\n${i + 1}. [${issue.type}] ${issue.page}`);
      console.log(`   ${issue.description}`);
    });
  } else {
    console.log('\nNo issues found! All pages look good.');
  }

  // Save report
  const reportPath = path.join(SCREENSHOTS_DIR, 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    portal: PORTAL_URL,
    issues,
    pagesAudited: dashboardPages.length
  }, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);
}

main().catch(console.error);
