/**
 * Sentry Error Tracking for Customer Portal
 * Vue 3 integration with session replay
 */

import * as Sentry from '@sentry/vue';

let sentryInitialized = false;

/**
 * Initialize Sentry for Vue application
 * @param {App} app - Vue app instance
 * @param {Router} router - Vue Router instance
 */
export function initSentry(app, router) {
  if (sentryInitialized) {
    console.warn('⚠️  Sentry already initialized');
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN_PORTAL;

  if (!dsn) {
    console.warn('⚠️  VITE_SENTRY_DSN_PORTAL not configured, error tracking disabled');
    console.warn('   Set VITE_SENTRY_DSN_PORTAL in .env to enable Sentry');
    return;
  }

  const environment = import.meta.env.MODE;
  const version = import.meta.env.VITE_APP_VERSION || 'unknown';

  try {
    Sentry.init({
      app,
      dsn,
      environment,
      release: `irisx-customer-portal@${version}`,

      // Integrations
      integrations: [
        // Router instrumentation for page navigation tracking
        Sentry.browserTracingIntegration({ router }),

        // Session replay - captures user interactions
        Sentry.replayIntegration({
          maskAllText: true,  // Hide all text for privacy
          blockAllMedia: true, // Block images/videos
          maskAllInputs: true, // Hide input values
        }),

        // Browser integrations
        Sentry.browserApiErrorsIntegration(),
        Sentry.breadcrumbsIntegration({
          console: true,
          dom: true,
          fetch: true,
          history: true,
          xhr: true,
        }),
      ],

      // Performance monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

      // Session replay sample rates
      replaysSessionSampleRate: 0.1,  // 10% of normal sessions
      replaysOnErrorSampleRate: 1.0,  // 100% of sessions with errors

      // Filter sensitive data
      beforeSend(event, hint) {
        // Remove tokens from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
            if (breadcrumb.data?.token) {
              breadcrumb.data.token = '[FILTERED]';
            }
            if (breadcrumb.data?.authorization) {
              breadcrumb.data.authorization = '[FILTERED]';
            }
            return breadcrumb;
          });
        }

        // Remove auth headers from request data
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['X-API-Key'];
        }

        // Scrub phone numbers from URLs and messages
        if (event.request?.url) {
          event.request.url = event.request.url.replace(
            /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
            '[PHONE_REDACTED]'
          );
        }

        if (event.message) {
          event.message = event.message.replace(
            /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
            '[PHONE_REDACTED]'
          );
        }

        return event;
      },

      // Ignore expected errors
      ignoreErrors: [
        // Browser extensions
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',

        // Network errors (expected)
        'NetworkError',
        'Failed to fetch',
        'Network request failed',

        // Non-errors
        'Non-Error promise rejection captured',
        'Non-Error exception captured',

        // Authentication (handled by app)
        'Unauthorized',
        '401',

        // User cancelled operations
        'AbortError',
        'The operation was aborted',
      ],

      // Debug in development
      debug: environment === 'development',
    });

    sentryInitialized = true;
    console.log(`✅ Sentry initialized (environment: ${environment}, release: irisx-customer-portal@${version})`);
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error.message);
  }
}

/**
 * Capture exception with context
 */
export function captureException(error, context = {}) {
  if (!sentryInitialized) return;

  Sentry.captureException(error, {
    tags: context.tags || {},
    extra: context.extra || {},
    level: context.level || 'error',
  });
}

/**
 * Capture message
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!sentryInitialized) return;

  Sentry.captureMessage(message, {
    level,
    tags: context.tags || {},
    extra: context.extra || {},
  });
}

/**
 * Add breadcrumb for user actions
 */
export function addBreadcrumb(breadcrumb) {
  if (!sentryInitialized) return;

  Sentry.addBreadcrumb({
    timestamp: Date.now() / 1000,
    ...breadcrumb,
  });
}

/**
 * Set user context
 */
export function setUser(user) {
  if (!sentryInitialized) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.company_name || user.email,
  });
}

/**
 * Clear user context (on logout)
 */
export function clearUser() {
  if (!sentryInitialized) return;
  Sentry.setUser(null);
}

/**
 * Set custom context
 */
export function setContext(name, context) {
  if (!sentryInitialized) return;
  Sentry.setContext(name, context);
}

/**
 * Set tags
 */
export function setTags(tags) {
  if (!sentryInitialized) return;
  Sentry.setTags(tags);
}

/**
 * Start custom span for performance tracking
 */
export function startSpan(context, callback) {
  if (!sentryInitialized) return callback();
  return Sentry.startSpan(context, callback);
}

export { Sentry };
