# Sentry Integration Guide - Agent Desktop

## Quick Start

### 1. Install Dependencies

```bash
cd irisx-agent-desktop
npm install @sentry/vue
```

### 2. Set Environment Variables

Create or update `.env`:

```bash
VITE_SENTRY_DSN_AGENT=https://your-sentry-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
```

**Get your DSN:**
1. Sign up at https://sentry.io
2. Create new project named "irisx-agent-desktop"
3. Select "Vue" platform
4. Copy the DSN from project settings

### 3. Update main.js

Update `src/main.js`:

```javascript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import { initSentry } from './plugins/sentry';
import App from './App.vue';

const app = createApp(App);
const pinia = createPinia();

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
    // ... existing login logic ...

    if (response.ok) {
      user.value = data.user;
      token.value = data.token;

      // Set Sentry user context
      setUser({
        id: data.user.id,
        email: data.user.email,
        role: 'agent',
      });

      localStorage.setItem('token', data.token);
      return { success: true };
    }

    return { success: false, error: data.error };
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
  throw new Error('Sentry test error from Agent Desktop');
}
```

Check your Sentry dashboard - the error should appear within seconds.

## Usage Examples

### Track Call Errors in Softphone

Update `src/components/Softphone.vue`:

```vue
<script setup>
import { addBreadcrumb, captureCallError } from '../plugins/sentry';

function handleCall() {
  addBreadcrumb({
    category: 'call',
    message: 'Agent initiated call',
    data: {
      number: displayNumber.value,
    },
  });

  try {
    // In DEMO mode
    console.log('DEMO: Initiating call to', displayNumber.value);
    callStatus.value = 'dialing';

    // Simulate call progression
    setTimeout(() => {
      callStatus.value = 'ringing';
      addBreadcrumb({
        category: 'call',
        message: 'Call ringing',
        level: 'info',
      });
    }, 1000);

    setTimeout(() => {
      callStatus.value = 'connected';
      startCallTimer();
      addBreadcrumb({
        category: 'call',
        message: 'Call connected',
        level: 'info',
      });
      emit('call-started', { number: displayNumber.value });
    }, 3000);
  } catch (error) {
    captureCallError(error, {
      uuid: generateCallUUID(),
      direction: 'outbound',
      status: callStatus.value,
      duration: callDuration.value,
    });

    console.error('Call failed:', error);
  }
}

function handleHangup() {
  addBreadcrumb({
    category: 'call',
    message: 'Agent ended call',
    data: {
      duration: callDuration.value,
    },
  });

  // ... existing hangup logic ...
}
</script>
```

### Track Disposition Form Errors

Update `src/components/CallDispositionModal.vue`:

```vue
<script setup>
import { captureException, addBreadcrumb } from '../plugins/sentry';

async function handleSubmit() {
  addBreadcrumb({
    category: 'disposition',
    message: 'Agent submitting call disposition',
    data: {
      outcome: formData.outcome,
      has_notes: !!formData.notes,
    },
  });

  try {
    // Validate
    if (!formData.outcome) {
      throw new Error('Outcome is required');
    }

    // In production, send to API
    if (import.meta.env.PROD) {
      const response = await fetch(`${API_URL}/v1/calls/${props.callData.uuid}/disposition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
    }

    emit('submitted', formData);
    emit('close');
  } catch (error) {
    captureException(error, {
      tags: {
        feature: 'call-disposition',
        outcome: formData.outcome,
      },
      extra: {
        call_uuid: props.callData.uuid,
        formData,
      },
    });

    console.error('Failed to save disposition:', error);
  }
}
</script>
```

### Track Agent Status Changes

Update `src/components/AgentStatusSelector.vue`:

```vue
<script setup>
import { addBreadcrumb } from '../plugins/sentry';

function selectStatus(status) {
  const previousStatus = currentStatus.value;

  addBreadcrumb({
    category: 'agent-status',
    message: `Agent changed status: ${previousStatus} → ${status}`,
    data: {
      from: previousStatus,
      to: status,
      agent_id: user.value?.id,
    },
  });

  currentStatus.value = status;

  // In production, sync with Firebase
  if (import.meta.env.PROD) {
    // ... Firebase sync code ...
  }
}
</script>
```

### Monitor Dashboard Performance

Update `src/views/agent/AgentDashboard.vue`:

```vue
<script setup>
import { startSpan } from '../plugins/sentry';

onMounted(async () => {
  await startSpan(
    {
      name: 'LoadAgentDashboard',
      op: 'ui.load',
    },
    async () => {
      // Load dashboard data
      await loadCallHistory();
      await loadAgentStats();
    }
  );
});

async function loadCallHistory() {
  await startSpan(
    {
      name: 'LoadCallHistory',
      op: 'http.client',
    },
    async () => {
      // In production, fetch from API
      if (import.meta.env.PROD) {
        const response = await fetch(`${API_URL}/v1/calls?agent_id=${user.id}`);
        const data = await response.json();
        callHistory.value = data.calls;
      }
    }
  );
}
</script>
```

## WebRTC Error Tracking

When you integrate WebRTC (Phase 3), add comprehensive error tracking:

```javascript
import { captureException, addBreadcrumb } from '../plugins/sentry';

// SIP connection errors
ua.on('registrationFailed', (error) => {
  captureException(new Error('SIP registration failed'), {
    tags: {
      feature: 'webrtc',
      error_type: 'registration',
    },
    extra: {
      cause: error.cause,
      response: error.response,
    },
  });
});

// Call failed errors
session.on('failed', (error) => {
  captureException(new Error('WebRTC call failed'), {
    tags: {
      feature: 'webrtc',
      error_type: 'call_failed',
      call_direction: session.direction,
    },
    extra: {
      cause: error.cause,
      remote_uri: session.remote_identity.uri.toString(),
    },
  });
});

// ICE connection errors
peerConnection.addEventListener('iceconnectionstatechange', () => {
  const state = peerConnection.iceConnectionState;

  addBreadcrumb({
    category: 'webrtc',
    message: `ICE connection state: ${state}`,
    level: state === 'failed' ? 'error' : 'info',
  });

  if (state === 'failed') {
    captureException(new Error('WebRTC ICE connection failed'), {
      tags: {
        feature: 'webrtc',
        error_type: 'ice_failed',
      },
    });
  }
});
```

## Best Practices for Agent Desktop

### ✅ DO

- Track all call lifecycle events (dial, ring, connect, hangup)
- Capture WebRTC connection failures
- Monitor agent status changes
- Track disposition form submissions
- Add breadcrumbs for agent actions
- Scrub customer phone numbers from errors
- Set agent context after login
- Use tags to filter by feature (call, sms, disposition)

### ❌ DON'T

- Don't send customer personal information (PII)
- Don't capture every single WebRTC negotiation event
- Don't send audio/video data to Sentry
- Don't capture expected network reconnection attempts
- Don't block UI if Sentry fails

## Environment-Specific Configuration

### Development (.env.development)

```bash
VITE_SENTRY_DSN_AGENT=https://dev-dsn@sentry.io/dev-project
VITE_APP_VERSION=1.0.0-dev
```

- 100% sample rate
- Debug mode enabled
- Full error details

### Production (.env.production)

```bash
VITE_SENTRY_DSN_AGENT=https://prod-dsn@sentry.io/prod-project
VITE_APP_VERSION=1.0.0
```

- 10% sample rate
- Debug mode disabled
- PII scrubbed

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
      project: 'agent-desktop',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],

  build: {
    sourcemap: true,
  },
});
```

Install plugin:

```bash
npm install --save-dev @sentry/vite-plugin
```

Add to `.env`:

```bash
SENTRY_AUTH_TOKEN=your_auth_token
```

## Troubleshooting

### Errors Not Appearing

**Check console:**

```
✅ Sentry initialized (environment: production, release: irisx-agent-desktop@1.0.0)
```

If missing:
1. Verify `.env` has `VITE_SENTRY_DSN_AGENT`
2. Restart dev server after changing `.env`
3. Check browser DevTools → Network for Sentry requests

### Too Many WebRTC Events

WebRTC generates many events. Filter aggressively:

```javascript
// In sentry.js
ignoreErrors: [
  'RTCPeerConnection',
  'ICE failed',
  'ICE gathering',
  'DTLS handshake',
  'WebSocket connection failed', // Temporary disconnects
],
```

Add breadcrumb filtering:

```javascript
beforeSend(event) {
  // Filter noisy WebRTC breadcrumbs
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(
      b => b.category !== 'webrtc' || b.level === 'error'
    );
  }
  return event;
}
```

## Cost Optimization

Reduce Sentry usage for Agent Desktop:

1. **Sample only errors:**

```javascript
tracesSampleRate: 0.05,  // 5% of page loads
replaysSessionSampleRate: 0,  // Disable session replay for agents
replaysOnErrorSampleRate: 0.5,  // Only 50% of error replays
```

2. **Filter WebRTC noise:**

```javascript
ignoreErrors: [
  'RTCPeerConnection',
  'ICE',
  'DTLS',
  'WebSocket',
],
```

3. **Limit breadcrumbs:**

```javascript
Sentry.init({
  maxBreadcrumbs: 30,  // Reduce from default 100
  // ...
});
```

## Resources

- [Full Documentation](../docs/guides/error-tracking.mdx)
- [Sentry Vue Docs](https://docs.sentry.io/platforms/javascript/guides/vue/)
- [WebRTC Debugging](https://webrtc.org/getting-started/testing)
- [SIP.js Documentation](https://sipjs.com/guides/)

## Support

Questions? Contact:
- Engineering team in #sentry-help Slack channel
- Email: devops@useiris.com
