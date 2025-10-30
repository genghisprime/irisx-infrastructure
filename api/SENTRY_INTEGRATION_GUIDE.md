# Sentry Integration Guide - IRISX API Backend

## Quick Start

### 1. Install Dependencies

```bash
cd api
npm install @sentry/node @sentry/profiling-node
```

### 2. Set Environment Variables

Add to your `.env` file:

```bash
SENTRY_DSN_API=https://your-sentry-dsn@sentry.io/project-id
NODE_ENV=production
```

**Get your DSN:**
1. Sign up at https://sentry.io (or use self-hosted)
2. Create new project named "irisx-api"
3. Select "Node.js" platform
4. Copy the DSN from project settings

### 3. Integrate into Main API

Update `src/index.js`:

```javascript
// Add at the TOP of the file (before other imports)
import { initSentry, flushEvents } from './lib/sentry.js';
import { sentryMiddleware, sentryErrorHandler } from './middleware/sentry.js';

// Initialize Sentry FIRST
initSentry();

const app = new Hono();

// Add Sentry middleware EARLY
app.use('*', sentryMiddleware());

// ... your routes ...

// Add error handler LAST
app.onError(sentryErrorHandler());

// Add graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await flushEvents(2000);
  process.exit(0);
});
```

See `src/index-with-sentry.example.js` for a complete working example.

### 4. Test the Integration

Start your API:

```bash
npm run dev
```

Test Sentry is working (development only):

```bash
curl http://localhost:3000/debug/sentry-test
```

Check your Sentry dashboard - you should see the test error appear within seconds.

## Usage Examples

### Capture Exception in Route Handlers

```javascript
import { Sentry, captureException } from '../lib/sentry.js';

app.post('/v1/calls', async (c) => {
  try {
    const callData = await c.req.json();
    const call = await createCall(callData);

    return c.json({ call }, 201);
  } catch (error) {
    // Capture with additional context
    captureException(error, {
      tags: {
        feature: 'call-creation',
        carrier: callData.carrier,
      },
      extra: {
        callData,
        user_id: c.get('user')?.id,
      },
    });

    throw error; // Let error handler format response
  }
});
```

### Add Breadcrumbs for Debugging

```javascript
import { addBreadcrumb } from '../lib/sentry.js';

async function processCall(call) {
  addBreadcrumb({
    category: 'call-processing',
    message: 'Starting call routing',
    level: 'info',
    data: {
      call_uuid: call.uuid,
      from: call.from,
      to: call.to,
    },
  });

  const carrier = await selectCarrier(call);

  addBreadcrumb({
    category: 'call-processing',
    message: 'Carrier selected',
    level: 'info',
    data: {
      carrier: carrier.name,
      cost: carrier.cost,
    },
  });

  // If error occurs, breadcrumbs will show the flow
  await routeToCarrier(call, carrier);
}
```

### Capture Non-Error Events

```javascript
import { captureMessage } from '../lib/sentry.js';

// Warn about unusual behavior
if (call.duration > 3600) {
  captureMessage('Call exceeded 1 hour duration', 'warning', {
    tags: {
      call_uuid: call.uuid,
    },
    extra: {
      duration: call.duration,
      from: call.from,
      to: call.to,
    },
  });
}
```

### Monitor Database Performance

```javascript
import { withDatabaseMonitoring } from '../middleware/sentry.js';

// Wrap slow database queries
const getPendingCalls = withDatabaseMonitoring(
  'getPendingCalls',
  async () => {
    return await db.call.findMany({
      where: { status: 'queued' },
    });
  }
);

// If query takes > 1s, Sentry will alert
const calls = await getPendingCalls();
```

### Monitor External API Calls

```javascript
import { withExternalAPIMonitoring } from '../middleware/sentry.js';

// Wrap Twilio API calls
const sendToTwilio = withExternalAPIMonitoring(
  'Twilio',
  async (callData) => {
    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/...', {
      method: 'POST',
      body: JSON.stringify(callData),
    });

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status}`);
    }

    return response.json();
  }
);

// Failures will be captured with 'service: Twilio' tag
await sendToTwilio(callData);
```

### Set User Context

```javascript
import { setUser } from '../lib/sentry.js';

// In authentication middleware
app.use('*', async (c, next) => {
  const user = await authenticateUser(c);

  if (user) {
    c.set('user', user);

    // Set Sentry user context
    setUser({
      id: user.id,
      email: user.email,
      company_name: user.company_name,
      ip_address: c.req.header('x-forwarded-for'),
    });
  }

  await next();
});
```

## Performance Monitoring

### Track Custom Operations

```javascript
import { startTransaction } from '../lib/sentry.js';

async function processCallQueue() {
  const transaction = startTransaction({
    op: 'task',
    name: 'Process Call Queue',
  });

  try {
    // Step 1: Fetch calls
    const fetchSpan = transaction.startChild({
      op: 'db',
      description: 'Fetch queued calls',
    });

    const calls = await db.call.findMany({
      where: { status: 'queued' },
    });

    fetchSpan.finish();

    // Step 2: Process each call
    for (const call of calls) {
      const processSpan = transaction.startChild({
        op: 'call.process',
        description: `Process call ${call.uuid}`,
      });

      await processCall(call);

      processSpan.finish();
    }
  } finally {
    transaction.finish();
  }
}
```

## Troubleshooting

### Errors Not Appearing in Sentry

**Check console logs:**

```
✅ Sentry initialized (environment: production, release: irisx-api@1.0.0)
```

If you see:

```
⚠️  SENTRY_DSN_API not configured, error tracking disabled
```

Then add `SENTRY_DSN_API` to your `.env` file.

**Verify DSN is valid:**

```bash
curl -X POST 'https://sentry.io/api/0/projects/{org}/{project}/keys/' \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Check network connectivity:**

```bash
# Test if Sentry endpoint is reachable
curl -I https://sentry.io
```

### Too Many Events

If you're hitting Sentry event limits:

1. **Reduce sample rate** (src/lib/sentry.js):

```javascript
tracesSampleRate: 0.05,  // Only 5% of requests
profilesSampleRate: 0.01, // Only 1% of requests
```

2. **Add more ignored errors**:

```javascript
ignoreErrors: [
  'UnauthorizedError',
  'ValidationError',
  'RateLimitError',
  'NotFoundError',  // Add this
  'BadRequestError', // Add this
],
```

3. **Filter by environment**:

```javascript
beforeSend(event) {
  // Don't send dev/staging errors
  if (event.environment !== 'production') {
    return null;
  }
  return event;
}
```

### Source Maps Not Working

Enable source maps in your build:

```json
// package.json
{
  "scripts": {
    "build": "tsc && sentry-cli sourcemaps upload --org=irisx --project=api ./dist"
  }
}
```

Install Sentry CLI:

```bash
npm install --save-dev @sentry/cli
```

Add to `.env`:

```bash
SENTRY_AUTH_TOKEN=your_auth_token
SENTRY_ORG=irisx
SENTRY_PROJECT=api
```

## Environment-Specific Configuration

### Development

```bash
SENTRY_DSN_API=https://dev-dsn@sentry.io/dev-project
NODE_ENV=development
```

- All events captured (100% sample rate)
- Debug mode enabled
- Test endpoint available

### Staging

```bash
SENTRY_DSN_API=https://staging-dsn@sentry.io/staging-project
NODE_ENV=staging
```

- 50% sample rate
- Test endpoint available
- Full error details

### Production

```bash
SENTRY_DSN_API=https://prod-dsn@sentry.io/prod-project
NODE_ENV=production
```

- 10% sample rate
- Test endpoint disabled
- Sensitive data filtered
- Minimal error details to client

## Best Practices

### ✅ DO

- Initialize Sentry at the TOP of your entry file
- Add Sentry middleware BEFORE other middleware
- Use breadcrumbs to track user flow
- Set user context after authentication
- Filter sensitive data (phone numbers, API keys)
- Use tags for filtering (environment, feature, carrier)
- Capture expected warnings (rate limits, unusual behavior)
- Monitor slow database queries
- Track external API failures
- Flush events on graceful shutdown

### ❌ DON'T

- Don't initialize Sentry multiple times
- Don't capture validation errors (400 Bad Request)
- Don't capture authentication errors (401/403)
- Don't send passwords, tokens, or API keys
- Don't capture every single event (use sampling)
- Don't block application startup if Sentry fails
- Don't rely on Sentry for real-time alerting (use dedicated monitoring)

## Alerts Setup

Configure alerts in Sentry dashboard:

### High Error Rate

```
Alert when: Error count > 50 in 5 minutes
Actions:
  - Send to Slack #engineering
  - Email on-call engineer
  - Create PagerDuty incident (critical only)
```

### Performance Degradation

```
Alert when: P95 response time > 2000ms for 10 minutes
Actions:
  - Send to Slack #devops
  - Email engineering lead
```

### New Error Type

```
Alert when: New error fingerprint detected
Actions:
  - Send to Slack #engineering
```

## Cost Optimization

Sentry pricing is based on events/month:

- **Free:** 5,000 events/month
- **Team:** 50,000 events/month - $26/month
- **Business:** 100,000+ events/month - $80/month

To stay within limits:

1. Use sampling (10% production, 100% dev)
2. Ignore known errors (validation, auth)
3. Filter by environment
4. Use fingerprinting to group similar errors
5. Set max breadcrumbs to 50

## Resources

- [Full Documentation](../docs/guides/error-tracking.mdx)
- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Sentry Performance](https://docs.sentry.io/product/performance/)
- [Hono.js Middleware](https://hono.dev/docs/guides/middleware)

## Support

Questions? Contact:
- Engineering team in #sentry-help Slack channel
- Email: devops@useiris.com
