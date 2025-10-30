# Sentry Error Tracking - Setup Complete ✅

## Overview

Sentry error tracking has been successfully integrated across all IRISX applications. This document provides a summary of what was implemented and next steps to activate monitoring.

## What Was Implemented

### 1. API Backend (Node.js/Hono.js)

**Files Created:**
- `api/src/lib/sentry.js` - Core Sentry initialization and utilities
- `api/src/middleware/sentry.js` - Hono.js middleware for automatic error capture
- `api/src/index-with-sentry.example.js` - Example integration in main API file
- `api/SENTRY_INTEGRATION_GUIDE.md` - Complete setup guide

**Features:**
- Automatic error capture with full request context
- Performance monitoring (traces and profiles)
- Database query monitoring
- External API call tracking
- User context tracking
- Breadcrumb trail for debugging
- Sensitive data filtering (API keys, phone numbers)
- Graceful shutdown with event flushing
- Slow request alerting (>2000ms)

### 2. Customer Portal (Vue 3)

**Files Created:**
- `irisx-customer-portal/src/plugins/sentry.js` - Vue 3 Sentry integration
- `irisx-customer-portal/src/components/ErrorBoundary.vue` - Error boundary component
- `irisx-customer-portal/SENTRY_INTEGRATION_GUIDE.md` - Setup guide

**Features:**
- Vue error boundaries for component-level error handling
- Session replay (10% of sessions, 100% of error sessions)
- Router instrumentation for page navigation tracking
- User context tracking after login
- Browser error capture
- Performance monitoring
- Sensitive data filtering
- Beautiful error UI with reload/navigate options

### 3. Agent Desktop (Vue 3)

**Files Created:**
- `irisx-agent-desktop/src/plugins/sentry.js` - Vue 3 Sentry integration
- `irisx-agent-desktop/src/components/ErrorBoundary.vue` - Error boundary component
- `irisx-agent-desktop/SENTRY_INTEGRATION_GUIDE.md` - Setup guide

**Features:**
- Same as Customer Portal
- Additional call-specific error tracking
- Agent status change tracking
- Call disposition error tracking
- WebRTC error monitoring (ready for Phase 3)
- PII scrubbing for customer data

### 4. Documentation

**Files Created:**
- `docs/guides/error-tracking.mdx` - Comprehensive Mintlify documentation (800+ lines)

**Topics Covered:**
- Overview and benefits
- Setup for each application
- Manual error capture examples
- Performance monitoring
- Best practices
- Troubleshooting
- Privacy & compliance (GDPR, PII scrubbing)
- Cost optimization
- Alert configuration

## Integration Status

| Application | Files | Status | Ready to Deploy |
|-------------|-------|--------|-----------------|
| API Backend | ✅ Created | ⏳ Needs DSN | Yes |
| Customer Portal | ✅ Created | ⏳ Needs DSN | Yes |
| Agent Desktop | ✅ Created | ⏳ Needs DSN | Yes |
| Documentation | ✅ Complete | ✅ Ready | Yes |

## Next Steps to Activate

### Step 1: Create Sentry Projects

Sign up at https://sentry.io (or use self-hosted instance) and create 3 projects:

1. **irisx-api** (Node.js platform)
2. **irisx-customer-portal** (Vue platform)
3. **irisx-agent-desktop** (Vue platform)

### Step 2: Get DSN Tokens

From each project's settings, copy the DSN (Data Source Name):

```
https://abc123@o123456.ingest.sentry.io/7654321
```

### Step 3: Set Environment Variables

**API Backend** - Add to `api/.env`:

```bash
SENTRY_DSN_API=https://your-api-dsn@sentry.io/project-id
NODE_ENV=production
```

**Customer Portal** - Add to `irisx-customer-portal/.env`:

```bash
VITE_SENTRY_DSN_PORTAL=https://your-portal-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
```

**Agent Desktop** - Add to `irisx-agent-desktop/.env`:

```bash
VITE_SENTRY_DSN_AGENT=https://your-agent-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
```

### Step 4: Install Dependencies

**API Backend:**

```bash
cd api
npm install @sentry/node @sentry/profiling-node
```

**Customer Portal:**

```bash
cd irisx-customer-portal
npm install @sentry/vue
```

**Agent Desktop:**

```bash
cd irisx-agent-desktop
npm install @sentry/vue
```

### Step 5: Integrate into Main Files

**API Backend** - Update `api/src/index.js`:

Copy the integration pattern from `api/src/index-with-sentry.example.js`:

```javascript
// Import at top
import { initSentry, flushEvents } from './lib/sentry.js';
import { sentryMiddleware, sentryErrorHandler } from './middleware/sentry.js';

// Initialize immediately
initSentry();

// Add middleware
app.use('*', sentryMiddleware());

// Add error handler
app.onError(sentryErrorHandler());

// Add graceful shutdown
process.on('SIGTERM', async () => {
  await flushEvents(2000);
  process.exit(0);
});
```

**Customer Portal** - Update `irisx-customer-portal/src/main.js`:

```javascript
import { initSentry } from './plugins/sentry';

// After creating app, pinia, router
initSentry(app, router);
```

Update `irisx-customer-portal/src/App.vue`:

```vue
<script setup>
import ErrorBoundary from './components/ErrorBoundary.vue';
</script>

<template>
  <ErrorBoundary>
    <router-view />
  </ErrorBoundary>
</template>
```

Update `irisx-customer-portal/src/stores/auth.js`:

```javascript
import { setUser, clearUser } from '../plugins/sentry';

// In login function, after successful auth:
setUser({
  id: user.id,
  email: user.email,
  company_name: user.company_name,
});

// In logout function:
clearUser();
```

**Agent Desktop** - Same as Customer Portal, but use:
- `irisx-agent-desktop/src/main.js`
- `irisx-agent-desktop/src/App.vue`
- `irisx-agent-desktop/src/stores/auth.js`

### Step 6: Test Integration

**API Backend:**

```bash
cd api
npm run dev

# Test endpoint (development only)
curl http://localhost:3000/debug/sentry-test
```

Check Sentry dashboard for the test error.

**Customer Portal & Agent Desktop:**

```bash
npm run dev
```

Add a test button to any component:

```javascript
function testSentry() {
  throw new Error('Sentry test error');
}
```

Click the button and check Sentry dashboard.

### Step 7: Configure Alerts

In Sentry dashboard for each project:

**High Error Rate Alert:**
- Condition: Error count > 50 in 5 minutes
- Action: Send to Slack #engineering

**Performance Degradation Alert:**
- Condition: P95 response time > 2000ms for 10 minutes
- Action: Send to Slack #devops

**New Error Type Alert:**
- Condition: New error fingerprint detected
- Action: Send to Slack #engineering

### Step 8: Enable Source Maps (Optional but Recommended)

**Frontend Apps:**

Install Sentry Vite plugin:

```bash
npm install --save-dev @sentry/vite-plugin
```

Update `vite.config.js`:

```javascript
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    vue(),
    sentryVitePlugin({
      org: 'irisx',
      project: 'customer-portal',  // or 'agent-desktop'
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: true,
  },
});
```

Get auth token from: https://sentry.io/settings/account/api/auth-tokens/

**Backend API:**

Install Sentry CLI:

```bash
npm install --save-dev @sentry/cli
```

Update `package.json`:

```json
{
  "scripts": {
    "build": "tsc && sentry-cli sourcemaps upload --org=irisx --project=api ./dist"
  }
}
```

## Monitoring Best Practices

### For Developers

1. **Always add breadcrumbs** for important user actions
2. **Set user context** after authentication
3. **Capture exceptions with context** (tags, extra data)
4. **Use tags for filtering** (feature, api_endpoint, carrier)
5. **Filter sensitive data** (phone numbers, API keys, passwords)
6. **Test locally** before deploying to production

### For Operations

1. **Set up Slack alerts** for high error rates
2. **Review Sentry dashboard daily** for new error types
3. **Monitor performance trends** (P95/P99 response times)
4. **Set up PagerDuty integration** for critical errors
5. **Review session replays** for complex bugs
6. **Archive old issues** to keep dashboard clean

## Privacy & Compliance

### Automatic PII Scrubbing

All integrations automatically scrub:
- Phone numbers (replaced with `[PHONE_REDACTED]`)
- API keys (removed from headers)
- Authentication tokens (removed from breadcrumbs)
- Passwords (filtered from request bodies)

### Session Replay Privacy

- All text is masked
- All inputs are masked
- All media is blocked
- Only visual layout and clicks are recorded

### GDPR Compliance

Users can request data deletion:

```bash
sentry-cli data-management delete-user --email user@example.com
```

### Data Retention

Configure in Sentry project settings:
- Events: 90 days
- Session Replays: 30 days
- Performance Data: 90 days

## Cost Estimates

### Sentry Free Tier
- 5,000 errors/month
- 50 session replays/month
- 10,000 performance units/month
- **Cost:** $0

### Sentry Team Plan
- 50,000 errors/month
- 500 session replays/month
- 100,000 performance units/month
- **Cost:** $26/month

### Estimated Usage (with 10% sampling)

**API Backend:**
- ~2,000 errors/month (20,000 requests × 1% error rate × 10% sampling)
- ~5,000 performance traces/month

**Customer Portal:**
- ~1,000 errors/month
- ~2,000 performance traces/month
- ~100 session replays/month

**Agent Desktop:**
- ~500 errors/month
- ~1,000 performance traces/month
- ~50 session replays/month

**Total:** ~3,500 errors/month, 8,000 traces/month, 150 replays/month

**Recommended Plan:** Sentry Team ($26/month) should be sufficient.

## Troubleshooting

### Errors Not Appearing

1. Check console for initialization message:
   ```
   ✅ Sentry initialized (environment: production, release: irisx-api@1.0.0)
   ```

2. Verify DSN is set:
   ```bash
   echo $SENTRY_DSN_API
   ```

3. Check network requests in DevTools (should see requests to sentry.io)

4. Verify sample rate isn't too low (set to 1.0 for testing)

### Too Many Events

1. Reduce sample rates in `sentry.js`:
   ```javascript
   tracesSampleRate: 0.05,  // 5%
   ```

2. Add more ignored errors:
   ```javascript
   ignoreErrors: ['ValidationError', 'NotFoundError'],
   ```

3. Filter by environment:
   ```javascript
   beforeSend(event) {
     if (event.environment !== 'production') return null;
     return event;
   }
   ```

### Source Maps Not Working

1. Verify source maps are generated:
   ```bash
   ls dist/assets/*.map
   ```

2. Check release version matches:
   ```javascript
   release: 'irisx-api@1.0.0'  // Must match uploaded version
   ```

3. Verify Sentry CLI auth token is valid

## Resources

### Documentation
- [API Backend Guide](api/SENTRY_INTEGRATION_GUIDE.md)
- [Customer Portal Guide](irisx-customer-portal/SENTRY_INTEGRATION_GUIDE.md)
- [Agent Desktop Guide](irisx-agent-desktop/SENTRY_INTEGRATION_GUIDE.md)
- [Full Documentation](docs/guides/error-tracking.mdx)

### External Links
- [Sentry Documentation](https://docs.sentry.io)
- [Sentry Node.js](https://docs.sentry.io/platforms/node/)
- [Sentry Vue](https://docs.sentry.io/platforms/javascript/guides/vue/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)

## Support

Questions or issues?
- Engineering team in #sentry-help Slack channel
- Email: devops@useiris.com
- Sentry support: support@sentry.io

---

## Summary

✅ **All Sentry integration code is complete and ready to deploy**

Next actions:
1. Create 3 Sentry projects and get DSNs
2. Set environment variables in `.env` files
3. Install npm dependencies
4. Integrate into main.js files
5. Test with demo errors
6. Configure Slack alerts
7. Deploy to production

**Estimated setup time:** 30-60 minutes

**Week 11-12 Progress:**
- ✅ Beta onboarding checklist
- ✅ Load testing scripts (k6)
- ✅ Error tracking integration (Sentry)
- ⏳ Next: Beta launch announcement materials
