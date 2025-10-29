import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import pool, { query, closePool } from './db/connection.js';
import redis, { closeRedis } from './db/redis.js';
import FreeSWITCHService from './services/freeswitch.js';
import { IVRService } from './services/ivr.js';
import calls from './routes/calls.js';
import dialplan from './routes/dialplan.js';
import webhooks from './routes/webhooks.js';
import email from './routes/email.js';
import analytics from './routes/analytics.js';
import tts from './routes/tts.js';
import ivr from './routes/ivr.js';
import sms from './routes/sms.js';
import contacts from './routes/contacts.js';
import contactLists from './routes/contact-lists.js';
import queues from './routes/queues.js';
import agents from './routes/agents.js';
import campaigns from './routes/campaigns.js';
import billing from './routes/billing.js';
import recordings from './routes/recordings.js';
import phoneNumbers from './routes/phone-numbers.js';
import tenants from './routes/tenants.js';
import notifications from './routes/notifications.js';
import audit from './routes/audit.js';
import rateLimits from './routes/rate-limits.js';
import monitoring from './routes/monitoring.js';

dotenv.config();

const app = new Hono();

// Initialize FreeSWITCH service
const freeswitch = new FreeSWITCHService({
  host: process.env.FREESWITCH_HOST,
  port: parseInt(process.env.FREESWITCH_PORT),
  password: process.env.FREESWITCH_PASSWORD
});

// Initialize IVR service
const ivrService = new IVRService(freeswitch);

// FreeSWITCH event handlers
freeswitch.on('ready', () => {
  console.log('✓ Connected to FreeSWITCH');
});

freeswitch.on('error', (error) => {
  console.error('FreeSWITCH error:', error);
});

freeswitch.on('call:created', async (data) => {
  console.log('📞 Call created:', data);
  
  // Auto-start IVR for inbound calls
  if (data.direction === 'inbound') {
    try {
      await ivrService.startSession(data.uuid, 1, 1); // menu_id=1, tenant_id=1
    } catch (error) {
      console.error('Failed to start IVR:', error);
    }
  }
});

freeswitch.on('call:answered', async (data) => {
  console.log('✅ Call answered:', data);
  await query(
    'UPDATE calls SET status = , answered_at = NOW() WHERE uuid = ',
    ['in-progress', data.uuid]
  ).catch(err => console.error('DB update error:', err));
});

freeswitch.on('call:hungup', async (data) => {
  console.log('📴 Call ended:', data);
  
  // End IVR session if active
  await ivrService.endSession(data.uuid);
  
  // Update database
  await query(
    'UPDATE calls SET status = , ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - answered_at))::INTEGER WHERE uuid = ',
    ['completed', data.uuid]
  ).catch(err => console.error('DB update error:', err));
});

freeswitch.on('call:dtmf', async (data) => {
  console.log('🔢 DTMF received:', data);
  
  // Handle IVR menu navigation
  await ivrService.handleDTMF(data.uuid, data.digit);
});

// Export services for use in routes
app.use('*', async (c, next) => {
  c.set('freeswitch', freeswitch);
  c.set('ivr', ivr);
  await next();
});

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Health check endpoint
app.get('/health', async (c) => {
  try {
    const dbResult = await query('SELECT NOW() as time, version() as version');
    const dbStatus = dbResult.rows.length > 0 ? 'connected' : 'disconnected';
    
    const redisResult = await redis.ping();
    const redisStatus = redisResult === 'PONG' ? 'connected' : 'disconnected';
    
    let freeswitchStatus = 'disconnected';
    try {
      if (freeswitch.connection) {
        const status = await freeswitch.api('status');
        freeswitchStatus = status ? 'connected' : 'disconnected';
      }
    } catch (err) {
      freeswitchStatus = 'error: ' + err.message;
    }
    
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: { status: dbStatus, serverTime: dbResult.rows[0]?.time || null },
      redis: { status: redisStatus },
      freeswitch: { status: freeswitchStatus },
      ivr: { activeSessions: ivrService.activeSessions.size },
      version: '1.0.0'
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 503);
  }
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'IRISX API',
    version: '1.0.0',
    description: 'Multi-channel communications platform API',
    endpoints: {
      health: '/health',
      docs: '/docs',
      openapi: '/openapi.yaml',
      api: '/v1'
    }
  });
});

// Serve OpenAPI documentation (Swagger UI)
app.get('/docs', (c) => {
  try {
    const htmlPath = join(__dirname, '../public/swagger.html');
    const html = readFileSync(htmlPath, 'utf-8');
    return c.html(html);
  } catch (error) {
    return c.text('API Documentation not available', 500);
  }
});

// Serve OpenAPI spec
app.get('/openapi.yaml', (c) => {
  try {
    const yamlPath = join(__dirname, '../openapi.yaml');
    const yaml = readFileSync(yamlPath, 'utf-8');
    c.header('Content-Type', 'application/x-yaml');
    return c.text(yaml);
  } catch (error) {
    return c.text('OpenAPI specification not found', 404);
  }
});

// API v1 routes
app.get('/v1', (c) => {
  return c.json({
    version: 'v1',
    message: 'IRISX API v1',
    endpoints: {
      calls: {
        create: 'POST /v1/calls',
        get: 'GET /v1/calls/:sid',
        list: 'GET /v1/calls'
      },
      sms: {
        send: 'POST /v1/sms (coming soon)'
      },
      email: {
        send: 'POST /v1/email/send',
        sendTemplate: 'POST /v1/email/send-template',
        list: 'GET /v1/email',
        get: 'GET /v1/email/:id'
      },
      webhooks: {
        create: 'POST /v1/webhooks',
        list: 'GET /v1/webhooks',
        get: 'GET /v1/webhooks/:id',
        update: 'PUT /v1/webhooks/:id',
        delete: 'DELETE /v1/webhooks/:id'
      },
      analytics: {
        dashboard: 'GET /v1/analytics/dashboard',
        calls: 'GET /v1/analytics/calls',
        sms: 'GET /v1/analytics/sms',
        email: 'GET /v1/analytics/email'
      },
      tts: {
        generate: 'POST /v1/tts/generate',
        voices: 'GET /v1/tts/voices',
        providers: 'GET /v1/tts/providers'
      },
      phoneNumbers: {
        list: 'GET /v1/phone-numbers (coming soon)'
      }
    },
    authentication: 'Required: X-API-Key header'
  });
});

// Mount API routes
app.route('/v1/calls', calls);
app.route('/v1/dialplan', dialplan);
app.route('/v1/webhooks', webhooks);
app.route('/v1/email', email);
app.route('/v1/analytics', analytics);
app.route('/v1/tts', tts);
app.route('/v1/ivr', ivr);
app.route('/v1/sms', sms);
app.route('/v1/contacts', contacts);
app.route('/v1/lists', contactLists);
app.route('/v1/queues', queues);
app.route('/v1/agents', agents);
app.route('/v1/campaigns', campaigns);
app.route('/v1/billing', billing);
app.route('/v1/recordings', recordings);
app.route('/v1/phone-numbers', phoneNumbers);
app.route('/v1/tenants', tenants);
app.route('/v1/notifications', notifications);
app.route('/v1/audit', audit);
app.route('/v1/rate-limits', rateLimits);
app.route('/v1/monitoring', monitoring);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: c.req.path
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  }, 500);
});

// Connect to FreeSWITCH
freeswitch.connect().catch(err => {
  console.error('Failed to connect to FreeSWITCH:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  freeswitch.disconnect();
  await closePool();
  await closeRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  freeswitch.disconnect();
  await closePool();
  await closeRedis();
  process.exit(0);
});

// Start server
const port = parseInt(process.env.PORT || '3000');
console.log('🚀 Starting IRISX API server...');
console.log('📍 Port:', port);
console.log('🗄️ Database:', process.env.DB_HOST);
console.log('💾 Redis:', process.env.REDIS_HOST || 'pending');
console.log('📞 FreeSWITCH:', process.env.FREESWITCH_HOST);

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log('✓ Server running at http://localhost:' + info.port);
});
