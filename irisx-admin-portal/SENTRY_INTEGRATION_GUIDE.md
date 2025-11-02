# Sentry Integration Guide - Customer Portal

## Quick Start

### 1. Install Dependencies

```bash
cd irisx-customer-portal
npm install @sentry/vue
```

### 2. Set Environment Variables

Create or update `.env`:

```bash
VITE_SENTRY_DSN_PORTAL=https://your-sentry-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
```

**Get your DSN:**
1. Sign up at https://sentry.io
2. Create new project named "irisx-customer-portal"
3. Select "Vue" platform
4. Copy the DSN from project settings

### 3. Update main.js

Update `src/main.js`:

```javascript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter } from './router';
import { initSentry } from './plugins/sentry';
import App from './App.vue';

const app = createApp(App);
const pinia = createPinia();
const router = createRouter();

app.use(pinia);
app.use(router);

// Initialize Sentry
initSentry(app, router);

app.mount('#app');
```

### 4. Wrap Your App with Error Boundary

Update `src/App.vue`:

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

### 5. Update Auth Store

Add Sentry user tracking in `src/stores/auth.js`:

```javascript
import { defineStore } from 'pinia';
import { setUser, clearUser } from '../plugins/sentry';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(null);

  async function login(email, password) {
    try {
      const response = await fetch(`${API_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        user.value = data.user;
        token.value = data.token;

        // Set Sentry user context
        setUser({
          id: data.user.id,
          email: data.user.email,
          company_name: data.user.company_name,
        });

        localStorage.setItem('token', data.token);
        return { success: true };
      }

      return { success: false, error: data.error };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  function logout() {
    user.value = null;
    token.value = null;

    // Clear Sentry user context
    clearUser();

    localStorage.removeItem('token');
  }

  return { user, token, login, logout };
});
```

### 6. Test the Integration

Start the development server:

```bash
npm run dev
```

Trigger a test error (development only):

```javascript
// Add a test button to any component
function testSentry() {
  throw new Error('Sentry test error from Customer Portal');
}
```

Check your Sentry dashboard - the error should appear within seconds.

## Usage Examples

### Capture Exception in Components

```vue
<script setup>
import { captureException, addBreadcrumb } from '../plugins/sentry';

async function sendSMS() {
  try {
    addBreadcrumb({
      category: 'user-action',
      message: 'User clicked send SMS',
      data: { to: phoneNumber.value },
    });

    const response = await fetch(`${API_URL}/v1/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: phoneNumber.value,
        from: selectedNumber.value,
        body: message.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    toast.success('Message sent!');
  } catch (error) {
    // Capture error with context
    captureException(error, {
      tags: {
        feature: 'sms-send',
        api_endpoint: '/v1/sms/send',
      },
      extra: {
        phoneNumber: phoneNumber.value,
        messageLength: message.value.length,
      },
    });

    toast.error('Failed to send message');
  }
}
</script>
```

### Track User Navigation

```vue
<script setup>
import { addBreadcrumb } from '../plugins/sentry';

function navigateToCalls() {
  addBreadcrumb({
    category: 'navigation',
    message: 'User navigated to calls page',
    level: 'info',
  });

  router.push('/calls');
}
</script>
```

### Track Form Submissions

```vue
<script setup>
import { addBreadcrumb, captureException } from '../plugins/sentry';

async function updateProfile(formData) {
  addBreadcrumb({
    category: 'form',
    message: 'User submitted profile update',
    data: {
      fields_changed: Object.keys(formData),
    },
  });

  try {
    await api.updateProfile(formData);
    toast.success('Profile updated');
  } catch (error) {
    captureException(error, {
      tags: { feature: 'profile-update' },
      extra: { formData },
    });

    toast.error('Failed to update profile');
  }
}
</script>
```

### Monitor API Performance

```vue
<script setup>
import { startSpan } from '../plugins/sentry';

async function loadCallHistory() {
  await startSpan(
    {
      name: 'LoadCallHistory',
      op: 'http.client',
    },
    async () => {
      const response = await fetch(`${API_URL}/v1/calls?limit=50`);
      const data = await response.json();
      calls.value = data.calls;
    }
  );
}
</script>
```

## Error Boundary Usage

Wrap critical sections of your app:

```vue
<template>
  <div class="dashboard">
    <Header />

    <!-- Wrap main content -->
    <ErrorBoundary>
      <main>
        <router-view />
      </main>
    </ErrorBoundary>

    <Footer />
  </div>
</template>
```

Or wrap individual components:

```vue
<template>
  <div class="calls-page">
    <h1>Call History</h1>

    <!-- Wrap data table -->
    <ErrorBoundary>
      <CallsTable :calls="calls" />
    </ErrorBoundary>

    <!-- Wrap chart -->
    <ErrorBoundary>
      <CallsChart :data="chartData" />
    </ErrorBoundary>
  </div>
</template>
```

## Session Replay

Session replay captures user interactions leading to errors. It's automatically enabled and will:

- Record 10% of normal sessions
- Record 100% of sessions with errors
- Mask all text, inputs, and media for privacy

### Disable Replay for Sensitive Pages

```javascript
import { Sentry } from '../plugins/sentry';

// In component setup
onMounted(() => {
  // Stop replay on sensitive pages
  if (route.path.includes('/billing')) {
    Sentry.getCurrentScope().setTag('replay', 'disabled');
  }
});
```

## Environment-Specific Configuration

### Development (.env.development)

```bash
VITE_SENTRY_DSN_PORTAL=https://dev-dsn@sentry.io/dev-project
VITE_APP_VERSION=1.0.0-dev
```

- 100% sample rate
- Debug mode enabled
- Full error details

### Production (.env.production)

```bash
VITE_SENTRY_DSN_PORTAL=https://prod-dsn@sentry.io/prod-project
VITE_APP_VERSION=1.0.0
```

- 10% sample rate
- Debug mode disabled
- Sensitive data filtered

## Source Maps

Enable source maps for production debugging:

**vite.config.js:**

```javascript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    vue(),

    // Upload source maps to Sentry on build
    sentryVitePlugin({
      org: 'irisx',
      project: 'customer-portal',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],

  build: {
    sourcemap: true, // Generate source maps
  },
});
```

**Install plugin:**

```bash
npm install --save-dev @sentry/vite-plugin
```

**Add to .env:**

```bash
SENTRY_AUTH_TOKEN=your_auth_token
```

Get auth token from: https://sentry.io/settings/account/api/auth-tokens/

## Best Practices

### ✅ DO

- Initialize Sentry in main.js before mounting app
- Use ErrorBoundary to catch component errors
- Set user context after login
- Clear user context on logout
- Add breadcrumbs for important user actions
- Capture exceptions with relevant context
- Use tags for filtering (feature, page, api_endpoint)
- Track API performance with startSpan
- Filter sensitive data (phone numbers, passwords)

### ❌ DON'T

- Don't capture validation errors (show user-friendly message instead)
- Don't send passwords, tokens, or credit card data
- Don't capture every single error (use ignoreErrors)
- Don't block app startup if Sentry fails
- Don't rely on Sentry for real-time user notifications

## Troubleshooting

### Errors Not Appearing

**Check console:**

```
✅ Sentry initialized (environment: production, release: irisx-customer-portal@1.0.0)
```

If missing, verify:
1. `.env` file has `VITE_SENTRY_DSN_PORTAL`
2. Environment variable starts with `VITE_` (required for Vite)
3. Restart dev server after changing .env

**Check network:**

Open DevTools → Network tab, look for requests to `sentry.io`.

### Too Many Events

Reduce sample rates in `src/plugins/sentry.js`:

```javascript
tracesSampleRate: 0.05,  // Only 5% of page loads
replaysSessionSampleRate: 0.05,  // Only 5% of sessions
```

Add more ignored errors:

```javascript
ignoreErrors: [
  'ResizeObserver loop limit exceeded',
  'NetworkError',
  'Failed to fetch',
  'ChunkLoadError',  // Add this (webpack lazy loading)
  'Loading chunk',    // Add this
],
```

### Source Maps Not Working

1. Verify source maps are generated:

```bash
npm run build
ls -la dist/assets/*.map  # Should exist
```

2. Check Sentry CLI upload:

```bash
npm install --save-dev @sentry/cli

# Test upload
npx sentry-cli releases files <version> upload-sourcemaps ./dist/assets
```

3. Verify release matches:

```javascript
// In sentry.js
release: `irisx-customer-portal@${import.meta.env.VITE_APP_VERSION}`,
```

Should match uploaded release name.

## Cost Optimization

Sentry pricing is based on events/month:

- **Free:** 5,000 errors + 50 replays/month
- **Team:** 50,000 errors + 500 replays/month - $26/month
- **Business:** 100,000+ errors - $80/month

To reduce usage:

1. **Lower sample rates:**

```javascript
tracesSampleRate: 0.05,  // 5%
replaysSessionSampleRate: 0.05,  // 5%
```

2. **Ignore common errors:**

```javascript
ignoreErrors: [
  'ResizeObserver loop limit exceeded',
  'Failed to fetch',
  'ChunkLoadError',
  'NetworkError',
],
```

3. **Filter by environment:**

```javascript
beforeSend(event) {
  // Only send production errors
  if (import.meta.env.MODE !== 'production') {
    return null;
  }
  return event;
}
```

## Resources

- [Full Documentation](../docs/guides/error-tracking.mdx)
- [Sentry Vue Docs](https://docs.sentry.io/platforms/javascript/guides/vue/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)
- [Vite Plugin](https://www.npmjs.com/package/@sentry/vite-plugin)

## Support

Questions? Contact:
- Engineering team in #sentry-help Slack channel
- Email: devops@useiris.com
