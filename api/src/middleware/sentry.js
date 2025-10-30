/**
 * Sentry Middleware for Hono.js
 * Automatic error tracking and performance monitoring
 */

import { Sentry, addBreadcrumb, setUser, setContext, setTags } from '../lib/sentry.js';

/**
 * Main Sentry middleware
 * Tracks requests, sets context, and captures errors
 */
export function sentryMiddleware() {
  return async (c, next) => {
    // Only run if Sentry is initialized
    if (!Sentry.isEnabled()) {
      await next();
      return;
    }

    // Start transaction for request tracing
    const transaction = Sentry.startTransaction({
      op: 'http.server',
      name: `${c.req.method} ${c.req.path}`,
      data: {
        method: c.req.method,
        url: c.req.url,
      },
    });

    // Set request context
    setContext('request', {
      method: c.req.method,
      url: c.req.url,
      path: c.req.path,
      query: c.req.query(),
      headers: {
        'user-agent': c.req.header('user-agent'),
        'content-type': c.req.header('content-type'),
        'x-forwarded-for': c.req.header('x-forwarded-for'),
      },
    });

    // Set user context if authenticated
    const user = c.get('user');
    if (user) {
      setUser({
        id: user.id,
        email: user.email,
        company_name: user.company_name,
        ip_address: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      });
    }

    // Add breadcrumb for request
    addBreadcrumb({
      category: 'http',
      message: `${c.req.method} ${c.req.path}`,
      level: 'info',
      data: {
        method: c.req.method,
        url: c.req.path,
      },
    });

    try {
      // Process request
      await next();

      // Set response status tag
      setTags({
        'http.status_code': c.res.status,
      });
    } catch (error) {
      // Capture the error with full context
      Sentry.captureException(error, {
        tags: {
          route: c.req.path,
          method: c.req.method,
          status_code: error.status || 500,
        },
        extra: {
          params: c.req.param(),
          query: c.req.query(),
          body: await getRequestBody(c),
          user_id: user?.id,
        },
        level: getErrorLevel(error),
      });

      // Re-throw to let error handler deal with response
      throw error;
    } finally {
      // Finish transaction
      transaction.setHttpStatus(c.res.status);
      transaction.finish();
    }
  };
}

/**
 * Global error handler
 * Formats error responses and ensures Sentry capture
 */
export function sentryErrorHandler() {
  return async (err, c) => {
    console.error('❌ Unhandled error:', err);

    // Determine status code
    const statusCode = err.status || err.statusCode || 500;

    // Determine if this is a client error (4xx) or server error (5xx)
    const isClientError = statusCode >= 400 && statusCode < 500;
    const isServerError = statusCode >= 500;

    // Format error response
    const errorResponse = {
      error: {
        message: isServerError && process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'An error occurred',
        code: err.code || 'INTERNAL_ERROR',
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' && {
          stack: err.stack,
        }),
      },
    };

    // Add validation errors if present
    if (err.errors) {
      errorResponse.error.validation_errors = err.errors;
    }

    return c.json(errorResponse, statusCode);
  };
}

/**
 * Performance monitoring middleware
 * Tracks slow endpoints
 */
export function performanceMiddleware(slowThresholdMs = 2000) {
  return async (c, next) => {
    const startTime = Date.now();

    await next();

    const duration = Date.now() - startTime;

    // Log slow requests
    if (duration > slowThresholdMs) {
      addBreadcrumb({
        category: 'performance',
        message: `Slow request: ${c.req.method} ${c.req.path}`,
        level: 'warning',
        data: {
          duration_ms: duration,
          threshold_ms: slowThresholdMs,
        },
      });

      // Capture slow request as message
      Sentry.captureMessage(
        `Slow API request: ${c.req.method} ${c.req.path} (${duration}ms)`,
        'warning',
        {
          tags: {
            route: c.req.path,
            method: c.req.method,
          },
          extra: {
            duration_ms: duration,
            threshold_ms: slowThresholdMs,
          },
        }
      );
    }
  };
}

/**
 * Helper: Safely get request body
 */
async function getRequestBody(c) {
  try {
    // Don't parse body for GET requests
    if (c.req.method === 'GET') return null;

    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      return await c.req.json();
    }

    return null;
  } catch (error) {
    return { _error: 'Could not parse request body' };
  }
}

/**
 * Helper: Determine error severity level
 */
function getErrorLevel(error) {
  const status = error.status || error.statusCode || 500;

  if (status >= 500) return 'error';
  if (status === 429) return 'warning';  // Rate limit
  if (status >= 400) return 'info';      // Client errors
  return 'error';
}

/**
 * Database query monitoring
 * Wrap database calls to track performance
 */
export function withDatabaseMonitoring(queryName, queryFn) {
  return async function (...args) {
    const span = Sentry.startSpan(
      {
        op: 'db.query',
        name: queryName,
      },
      async () => {
        const startTime = Date.now();

        try {
          const result = await queryFn(...args);
          const duration = Date.now() - startTime;

          // Log slow queries
          if (duration > 1000) {
            addBreadcrumb({
              category: 'database',
              message: `Slow query: ${queryName}`,
              level: 'warning',
              data: {
                duration_ms: duration,
                query: queryName,
              },
            });
          }

          return result;
        } catch (error) {
          // Capture database errors
          Sentry.captureException(error, {
            tags: {
              query: queryName,
            },
            extra: {
              query_name: queryName,
              arguments: args,
            },
          });

          throw error;
        }
      }
    );

    return span;
  };
}

/**
 * External API call monitoring
 * Wrap external API calls to track failures
 */
export function withExternalAPIMonitoring(serviceName, apiFn) {
  return async function (...args) {
    const span = Sentry.startSpan(
      {
        op: 'http.client',
        name: `${serviceName} API Call`,
      },
      async () => {
        addBreadcrumb({
          category: 'external-api',
          message: `Calling ${serviceName} API`,
          level: 'info',
        });

        try {
          return await apiFn(...args);
        } catch (error) {
          // Capture external API failures
          Sentry.captureException(error, {
            tags: {
              service: serviceName,
              api_call: 'external',
            },
            extra: {
              service_name: serviceName,
              error_message: error.message,
            },
          });

          throw error;
        }
      }
    );

    return span;
  };
}
