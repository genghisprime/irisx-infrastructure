/**
 * Sentry Error Tracking Configuration
 * Monitors production errors and performance
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

let sentryInitialized = false;

export function initSentry() {
  if (sentryInitialized) {
    console.log('⚠️  Sentry already initialized');
    return;
  }

  if (!process.env.SENTRY_DSN_API) {
    console.warn('⚠️  SENTRY_DSN_API not configured, error tracking disabled');
    console.warn('   Set SENTRY_DSN_API environment variable to enable Sentry');
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const version = process.env.npm_package_version || 'unknown';

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN_API,
      environment,
      release: `irisx-api@${version}`,

      // Performance monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      profilesSampleRate: environment === 'production' ? 0.1 : 1.0,

      integrations: [
        nodeProfilingIntegration(),

        // HTTP request tracing
        new Sentry.Integrations.Http({ tracing: true }),

        // Console integration for breadcrumbs
        new Sentry.Integrations.Console(),
      ],

      // Filter sensitive data
      beforeSend(event, hint) {
        // Remove authentication headers
        if (event.request?.headers) {
          delete event.request.headers['x-api-key'];
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
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

        // Remove sensitive data from extra context
        if (event.extra) {
          const sensitiveKeys = ['password', 'token', 'api_key', 'secret'];
          for (const key of sensitiveKeys) {
            if (event.extra[key]) {
              event.extra[key] = '[FILTERED]';
            }
          }
        }

        return event;
      },

      // Ignore expected/handled errors
      ignoreErrors: [
        // Authentication errors (expected)
        'UnauthorizedError',
        'InvalidAPIKeyError',
        'TokenExpiredError',

        // Validation errors (user input errors)
        'ValidationError',
        'InvalidPhoneNumberError',

        // Rate limiting (expected behavior)
        'RateLimitError',
        'TooManyRequestsError',

        // Client errors (not our problem)
        'AbortError',
        'NetworkError',
      ],

      // Debug options
      debug: environment === 'development',
    });

    sentryInitialized = true;
    console.log(`✅ Sentry initialized (environment: ${environment}, release: irisx-api@${version})`);
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error.message);
  }
}

/**
 * Capture exception with additional context
 */
export function captureException(error, context = {}) {
  if (!sentryInitialized) return;

  Sentry.captureException(error, {
    tags: context.tags || {},
    extra: context.extra || {},
    level: context.level || 'error',
    user: context.user || undefined,
  });
}

/**
 * Capture informational message
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
 * Add breadcrumb for tracking user flow
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
    ip_address: user.ip_address,
  });
}

/**
 * Clear user context
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
 * Set tags for filtering
 */
export function setTags(tags) {
  if (!sentryInitialized) return;
  Sentry.setTags(tags);
}

/**
 * Start performance transaction
 */
export function startTransaction(context) {
  if (!sentryInitialized) return null;
  return Sentry.startTransaction(context);
}

/**
 * Flush events (for graceful shutdown)
 */
export async function flushEvents(timeout = 2000) {
  if (!sentryInitialized) return true;

  try {
    await Sentry.close(timeout);
    console.log('✅ Sentry events flushed');
    return true;
  } catch (error) {
    console.error('❌ Failed to flush Sentry events:', error.message);
    return false;
  }
}

export { Sentry };
