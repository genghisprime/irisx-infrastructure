/**
 * IRISX API - Main Entry Point with Sentry Integration
 *
 * This is an example of how to integrate Sentry into the main API
 * Copy the relevant parts to your actual src/index.js
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// STEP 1: Import and initialize Sentry FIRST (before anything else)
import { initSentry, flushEvents } from './lib/sentry.js';
import {
  sentryMiddleware,
  sentryErrorHandler,
  performanceMiddleware,
} from './middleware/sentry.js';

// Initialize Sentry immediately
initSentry();

// Import routes
import callsRouter from './routes/calls.js';
import smsRouter from './routes/sms.js';
import emailRouter from './routes/email.js';
import phoneNumbersRouter from './routes/phone-numbers.js';
import webhooksRouter from './routes/webhooks.js';
import analyticsRouter from './routes/analytics.js';
import authRouter from './routes/auth.js';

// Create Hono app
const app = new Hono();

// STEP 2: Add Sentry middleware EARLY (before other middleware)
app.use('*', sentryMiddleware());
app.use('*', performanceMiddleware(2000)); // Alert on requests > 2s

// Other middleware
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use('*', logger());

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
  });
});

// Debug endpoint to test Sentry (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/sentry-test', (c) => {
    throw new Error('Sentry test error - this should appear in your Sentry dashboard');
  });
}

// API routes
app.route('/v1/auth', authRouter);
app.route('/v1/calls', callsRouter);
app.route('/v1/sms', smsRouter);
app.route('/v1/email', emailRouter);
app.route('/v1/phone-numbers', phoneNumbersRouter);
app.route('/v1/webhooks', webhooksRouter);
app.route('/v1/analytics', analyticsRouter);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND',
      path: c.req.path,
    },
  }, 404);
});

// STEP 3: Add Sentry error handler LAST
app.onError(sentryErrorHandler());

// Start server
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`🚀 IRISX API starting...`);
console.log(`📍 Port: ${port}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

const server = serve({
  fetch: app.fetch,
  port,
});

console.log(`✅ Server running on http://localhost:${port}`);

// STEP 4: Graceful shutdown with Sentry flush
process.on('SIGTERM', async () => {
  console.log('📥 SIGTERM received, shutting down gracefully...');

  // Stop accepting new connections
  server.close(() => {
    console.log('🔌 Server closed');
  });

  // Flush Sentry events before exit
  await flushEvents(2000);

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📥 SIGINT received, shutting down gracefully...');

  server.close(() => {
    console.log('🔌 Server closed');
  });

  await flushEvents(2000);

  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);

  // Capture in Sentry
  const { Sentry } = await import('./lib/sentry.js');
  Sentry.captureException(error, {
    tags: { type: 'uncaught_exception' },
  });

  await flushEvents(2000);

  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Promise Rejection:', reason);

  // Capture in Sentry
  const { Sentry } = await import('./lib/sentry.js');
  Sentry.captureException(reason, {
    tags: { type: 'unhandled_rejection' },
  });

  await flushEvents(2000);

  process.exit(1);
});

export default app;
