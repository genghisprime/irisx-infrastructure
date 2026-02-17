const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORTAL_URL = 'https://dq0rzcazrc3vd.cloudfront.net';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const issues = [];

function logIssue(page, type, description, details = {}) {
  const issue = {
    page,
    type,
    description,
    details,
    timestamp: new Date().toISOString()
  };
  issues.push(issue);
  console.log(`[ISSUE] ${page}: ${type} - ${description}`);
  if (Object.keys(details).length > 0) {
    console.log(`        Details: ${JSON.stringify(details)}`);
  }
}

async function auditPage(page, name, url) {
  console.log(`\n--- Auditing: ${name} (${url}) ---`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    logIssue(name, 'NAVIGATION', `Failed to load page: ${e.message}`);
    return;
  }

  // Take screenshot
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${name.replace(/\//g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  Screenshot saved: ${screenshotPath}`);

  // Check for missing styles (elements without proper styling)
  const bodyBg = await page.evaluate(() => {
    const body = document.body;
    const style = window.getComputedStyle(body);
    return {
      backgroundColor: style.backgroundColor,
      fontFamily: style.fontFamily
    };
  });

  if (bodyBg.backgroundColor === 'rgba(0, 0, 0, 0)' || bodyBg.backgroundColor === 'transparent') {
    logIssue(name, 'STYLING', 'Body has no background color', bodyBg);
  }

  // Check for oversized SVGs
  const svgInfo = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const oversized = [];
    svgs.forEach((svg, index) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 100 || rect.height > 100) {
        oversized.push({
          index,
          width: rect.width,
          height: rect.height,
          className: svg.className.baseVal || '',
          parentTag: svg.parentElement?.tagName || 'unknown'
        });
      }
    });
    return { total: svgs.length, oversized };
  });

  if (svgInfo.oversized.length > 0) {
    logIssue(name, 'OVERSIZED_SVG', `Found ${svgInfo.oversized.length} oversized SVGs (>100px)`, {
      oversized: svgInfo.oversized
    });
  }

  // Check for images without proper sizing
  const imgInfo = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    const issues = [];
    imgs.forEach((img, index) => {
      const rect = img.getBoundingClientRect();
      if (rect.width > 500 || rect.height > 500) {
        issues.push({
          index,
          src: img.src?.substring(0, 100),
          width: rect.width,
          height: rect.height
        });
      }
    });
    return issues;
  });

  if (imgInfo.length > 0) {
    logIssue(name, 'OVERSIZED_IMAGE', `Found ${imgInfo.length} oversized images`, { images: imgInfo });
  }

  // Check for missing form styling
  const formInfo = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input, button, select, textarea');
    const unstyled = [];
    inputs.forEach((el, index) => {
      const style = window.getComputedStyle(el);
      // Check if input has no border and no background (likely unstyled)
      if (el.tagName === 'INPUT' &&
          (style.border === 'none' || style.border === '0px none rgb(0, 0, 0)') &&
          (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent')) {
        unstyled.push({
          index,
          type: el.type || el.tagName,
          className: el.className
        });
      }
    });
    return { total: inputs.length, unstyled };
  });

  if (formInfo.unstyled.length > 0) {
    logIssue(name, 'UNSTYLED_FORM', `Found ${formInfo.unstyled.length} potentially unstyled form elements`, {
      unstyled: formInfo.unstyled
    });
  }

  // Check for layout issues (content overflow)
  const layoutInfo = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyWidth: body.scrollWidth,
      viewportWidth: window.innerWidth,
      hasHorizontalScroll: body.scrollWidth > window.innerWidth,
      bodyHeight: body.scrollHeight
    };
  });

  if (layoutInfo.hasHorizontalScroll) {
    logIssue(name, 'LAYOUT', 'Page has horizontal scroll (content overflow)', layoutInfo);
  }

  // Check for empty containers or missing content
  const contentInfo = await page.evaluate(() => {
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    const text = main.innerText?.trim() || '';
    return {
      hasContent: text.length > 50,
      textLength: text.length,
      hasHeading: !!document.querySelector('h1, h2, h3')
    };
  });

  if (!contentInfo.hasContent) {
    logIssue(name, 'CONTENT', 'Page appears to have little or no content', contentInfo);
  }

  // Check specific styling elements
  const styleCheck = await page.evaluate(() => {
    // Check if Tailwind/CSS framework is loaded
    const hasStylesheets = document.styleSheets.length > 0;

    // Check for common UI issues
    const buttons = document.querySelectorAll('button');
    const unstyledButtons = [];
    buttons.forEach((btn, i) => {
      const style = window.getComputedStyle(btn);
      if (style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
          style.border === 'none' &&
          !btn.className.includes('ghost') &&
          !btn.className.includes('link')) {
        unstyledButtons.push({ index: i, text: btn.innerText?.substring(0, 30) });
      }
    });

    return {
      stylesheetCount: document.styleSheets.length,
      unstyledButtons
    };
  });

  console.log(`  Stylesheets loaded: ${styleCheck.stylesheetCount}`);

  if (styleCheck.unstyledButtons.length > 0) {
    logIssue(name, 'UNSTYLED_BUTTON', `Found ${styleCheck.unstyledButtons.length} potentially unstyled buttons`, {
      buttons: styleCheck.unstyledButtons
    });
  }
}

async function main() {
  console.log('=== Customer Portal UI Audit ===\n');
  console.log(`Target: ${PORTAL_URL}`);
  console.log(`Screenshots will be saved to: ${SCREENSHOTS_DIR}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Pages to audit (public pages first)
  const publicPages = [
    { name: 'login', url: `${PORTAL_URL}/login` },
    { name: 'signup', url: `${PORTAL_URL}/signup` },
  ];

  // Audit public pages
  for (const p of publicPages) {
    await auditPage(page, p.name, p.url);
  }

  // Try to login to test authenticated pages
  console.log('\n--- Attempting login ---');
  await page.goto(`${PORTAL_URL}/login`, { waitUntil: 'networkidle' });

  // Check if we can find login form
  const hasLoginForm = await page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"], input[name="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    return { hasEmail: !!emailInput, hasPassword: !!passwordInput };
  });

  console.log(`  Login form found: email=${hasLoginForm.hasEmail}, password=${hasLoginForm.hasPassword}`);

  if (hasLoginForm.hasEmail && hasLoginForm.hasPassword) {
    // Try logging in with test credentials
    try {
      await page.fill('input[type="email"], input[name="email"]', 'demo@example.com');
      await page.fill('input[type="password"]', 'demo123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      console.log(`  After login attempt, URL: ${currentUrl}`);

      if (currentUrl.includes('dashboard')) {
        console.log('  Login successful! Auditing authenticated pages...');

        // Authenticated pages to audit
        const authPages = [
          { name: 'dashboard', url: `${PORTAL_URL}/dashboard` },
          { name: 'dashboard-conversations', url: `${PORTAL_URL}/dashboard/conversations` },
          { name: 'dashboard-call-logs', url: `${PORTAL_URL}/dashboard/call-logs` },
          { name: 'dashboard-messages', url: `${PORTAL_URL}/dashboard/messages` },
          { name: 'dashboard-agents', url: `${PORTAL_URL}/dashboard/agents` },
          { name: 'dashboard-analytics', url: `${PORTAL_URL}/dashboard/analytics` },
          { name: 'dashboard-settings', url: `${PORTAL_URL}/dashboard/settings` },
          { name: 'business-messaging', url: `${PORTAL_URL}/business-messaging` },
          { name: 'stir-shaken', url: `${PORTAL_URL}/stir-shaken` },
          { name: 'ai', url: `${PORTAL_URL}/ai` },
          { name: 'voice', url: `${PORTAL_URL}/voice` },
          { name: 'video', url: `${PORTAL_URL}/video` },
        ];

        for (const p of authPages) {
          await auditPage(page, p.name, p.url);
        }
      } else {
        console.log('  Login failed or redirected elsewhere. Only public pages audited.');
      }
    } catch (e) {
      console.log(`  Login attempt failed: ${e.message}`);
    }
  }

  await browser.close();

  // Summary
  console.log('\n\n=== AUDIT SUMMARY ===');
  console.log(`Total issues found: ${issues.length}`);

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
    if (Object.keys(issue.details).length > 0) {
      console.log(`   Details: ${JSON.stringify(issue.details, null, 2).split('\n').join('\n   ')}`);
    }
  });

  // Save report
  const reportPath = path.join(SCREENSHOTS_DIR, 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    portal: PORTAL_URL,
    issues,
    summary: byType
  }, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch(console.error);
