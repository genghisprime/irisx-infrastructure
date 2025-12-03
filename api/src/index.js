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
// TEMPORARY: Webhook service disabled due to database schema issues
// import webhooks from './routes/webhooks.js';
import email from './routes/email.js';
import emails from './routes/emails.js';
import analytics from './routes/analytics.js';
import tts from './routes/tts.js';
import ivr from './routes/ivr.js';
import sms from './routes/sms.js';
import messages from './routes/messages.js';
import phoneNumbers from './routes/phone-numbers.js';
import contacts from './routes/contacts.js';
import contactLists from './routes/contact-lists.js';
import queues from './routes/queues.js';
import agents from './routes/agents.js';
import campaigns from './routes/campaigns.js';
import billing from './routes/billing.js';
import chat from './routes/chat.js';
import usage from './routes/usage.js';
import apiKeys from './routes/api-keys.js';
// // import recordings from './routes/recordings.js';
// import phoneNumbers from './routes/phone-numbers.js';
// import tenants from './routes/tenants.js';
// import notifications from './routes/notifications.js';
// import audit from './routes/audit.js';
// import rateLimits from './routes/rate-limits.js';
// import monitoring from './routes/monitoring.js';
// import jobs from './routes/jobs.js';
// import webhooksEnhanced from './routes/webhooks-enhanced.js';
// import carriers from './routes/carriers.js';
import auth from './routes/auth.js';
import adminAgents from './routes/admin-agents.js';
import adminAgentsList from './routes/admin-agents-list.js';
import conversations from './routes/conversations.js';
import analyticsAgents from './routes/analytics-agents.js';
import adminAuth from './routes/admin-auth.js';
import adminTenants from './routes/admin-tenants.js';
import adminDashboard from './routes/admin-dashboard.js';
import adminSearch from './routes/admin-search.js';
import adminUsers from './routes/admin-users.js';
import adminBilling from './routes/admin-billing.js';
import adminProviders from './routes/admin-providers.js';
import adminRecordings from './routes/admin-recordings.js';
import adminConversations from './routes/admin-conversations.js';
import adminPhoneNumbers from './routes/admin-phone-numbers.js';
import adminSettings from './routes/admin-settings.js';
import adminDatabase from './routes/admin-database.js';
import adminCache from './routes/admin-cache.js';
import adminQueues from './routes/admin-queues.js';
import adminCampaigns from './routes/admin-campaigns.js';
import adminWebhooks from './routes/admin-webhooks.js';
import adminSipTrunks from './routes/admin-sip-trunks.js';
import adminEmailService from './routes/admin-email-service.js';
import adminAlerts from './routes/admin-alerts.js';
import adminImports from './routes/admin-imports.js';
import adminSystem from './routes/admin-system.js';
import adminAudit from './routes/admin-audit.js';
import adminAnalytics from './routes/admin-analytics.js';
import adminFeatureFlags from './routes/admin-feature-flags.js';
import adminContacts from './routes/admin-contacts.js';
import adminCDRs from './routes/admin-cdrs.js';
import adminIVR from './routes/admin-ivr.js';
import publicSignup from './routes/public-signup.js'; // Temporarily disabled - has parse-time errors
import imports from './routes/imports.js';
import { initWebSocket } from './services/websocket.js';

dotenv.config();

// =====================================================
// SECURITY: Environment Variable Validation
// =====================================================
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'JWT_SECRET',
  'FREESWITCH_HOST',
  'FREESWITCH_PASSWORD',
];

console.log('🔒 Validating environment variables...');

for (const varName of REQUIRED_ENV_VARS) {
  if (!process.env[varName]) {
    console.error(`❌ FATAL: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

// Validate production secrets
if (process.env.NODE_ENV === 'production') {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.includes('change-this') ||
    process.env.JWT_SECRET.includes('your-') ||
    process.env.JWT_SECRET.length < 32
  ) {
    console.error('❌ FATAL: Insecure JWT_SECRET detected in production!');
    console.error('   JWT_SECRET must be set to a secure random value (min 32 chars)');
    process.exit(1);
  }

  console.log('✅ Environment variables validated successfully');
  console.log('✅ Production security checks passed');
} else {
  console.log('✅ Environment variables validated (development mode)');
}

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
    'UPDATE calls SET status = $1, answered_at = NOW() WHERE uuid = $2',
    ['in-progress', data.uuid]
  ).catch(err => console.error('DB update error:', err));
});

freeswitch.on('call:hungup', async (data) => {
  console.log('📴 Call ended:', data);
  
  // End IVR session if active
  await ivrService.endSession(data.uuid);
  
  // Update database
  await query(
    'UPDATE calls SET status = $1, ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - answered_at))::INTEGER WHERE uuid = $2',
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

// CORS Configuration - Security Enhanced
const ALLOWED_ORIGINS = [
  // S3 Website URLs (temporary)
  'http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com',
  'http://tazzi-admin-portal-prod.s3-website-us-east-1.amazonaws.com',
  'http://tazzi-customer-portal-prod.s3-website-us-east-1.amazonaws.com',
  // Tazzi.com custom domains (will work after DNS propagation)
  'https://agent.tazzi.com',
  'https://admin.tazzi.com',
  'https://app.tazzi.com',
  // Development
  'http://localhost:5173', // Admin Portal dev
  'http://localhost:5174', // Customer Portal dev
  'http://localhost:5175', // Agent Desktop dev
  // Environment variables
  process.env.ADMIN_PORTAL_URL,
  process.env.CUSTOMER_PORTAL_URL,
  process.env.AGENT_DESKTOP_URL,
].filter(Boolean);

app.use('*', cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return '*';

    // Check if origin is in whitelist
    if (ALLOWED_ORIGINS.includes(origin)) return origin;

    // Log rejected origins in development
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`CORS: Rejected origin: ${origin}`);
    }

    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
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
// TEMPORARY: Webhook service disabled due to database schema issues
// app.route('/v1/webhooks', webhooks);
app.route('/v1/email', email);
app.route('/v1/emails', emails); // Email with LCR (Least-Cost Routing)
app.route('/v1/analytics', analytics);
app.route('/v1/tts', tts);
app.route('/v1/ivr', ivr);
app.route('/v1/sms', sms);
app.route('/v1/messages', messages);
app.route('/v1/phone-numbers', phoneNumbers);
app.route('/v1/contacts', contacts);
app.route('/v1/lists', contactLists);
app.route('/v1/contact-lists', contactLists); // Alias for contact lists
app.route('/v1/queues', queues);
app.route('/v1/agents', agents);
app.route('/v1/campaigns', campaigns);
app.route('/v1/billing', billing);
app.route('/v1/chat', chat); // Live Chat (Week 24-25)
app.route('/v1/usage', usage); // Usage & Billing Dashboard (Week 24-25)
app.route('/v1/api-keys', apiKeys); // API Key Management
// app.route('/v1/recordings', recordings);
// app.route('/v1/phone-numbers', phoneNumbers);
// app.route('/v1/tenants', tenants);
// app.route('/v1/notifications', notifications);
// app.route('/v1/audit', audit);
// app.route('/v1/rate-limits', rateLimits);
// app.route('/v1/monitoring', monitoring);
// app.route('/v1/jobs', jobs);
// app.route('/v1/webhooks', webhooksEnhanced); // Enhanced webhook management with full CRUD
// app.route('/v1/carriers', carriers); // Carrier management for multi-carrier routing
app.route('/v1/auth', auth); // Authentication API (register, login, refresh, logout)
app.route('/v1/admin', adminAgents); // Agent provisioning and management
app.route('/v1/conversations', conversations); // Unified Inbox - Cross-channel conversations
app.route('/v1/analytics/agents', analyticsAgents); // Agent Performance Analytics
app.route('/admin/auth', adminAuth);
app.route('/admin/tenants', adminTenants); // Tenant Management
app.route('/admin/dashboard', adminDashboard); // Platform Dashboard
app.route('/admin/search', adminSearch); // Global Search
app.route('/admin/users', adminUsers); // User Management (tenant users)
app.route('/admin/billing', adminBilling); // Billing & Subscriptions
app.route('/admin/providers', adminProviders); // Provider Credential Management
app.route('/admin/recordings', adminRecordings); // Call Recordings
app.route('/admin/conversations', adminConversations); // Conversation Oversight
app.route('/admin/phone-numbers', adminPhoneNumbers); // Phone Number Provisioning
app.route('/admin/settings', adminSettings); // Feature Flags & System Config
app.route('/admin/database', adminDatabase); // Database Management (SuperAdmin)
app.route('/admin/cache', adminCache); // Redis Cache Management
app.route('/admin/queues', adminQueues); // Queue Management
app.route('/admin/campaigns', adminCampaigns); // Campaign Monitoring
app.route('/admin/webhooks', adminWebhooks); // Webhook Management
app.route('/admin/sip-trunks', adminSipTrunks); // SIP Trunk Configuration
app.route('/admin/email-service', adminEmailService); // Email Service Management
app.route('/admin/alerts', adminAlerts); // Alert Management
app.route('/admin/imports', adminImports); // Data Import Management (Admin view)
app.route('/admin/system', adminSystem);
app.route('/admin/audit-log', adminAudit); // Audit Log
app.route('/admin/analytics', adminAnalytics); // Usage Analytics
app.route('/admin/feature-flags', adminFeatureFlags); // Feature Flags Management
app.route('/admin/contacts', adminContacts); // Contact Management
app.route('/admin/cdrs', adminCDRs); // CDR Viewer (Call Detail Records)
app.route('/admin/ivr', adminIVR); // IVR Management (Menu Configuration)
app.route('/admin/agents', adminAgentsList); // Agent Management (Admin view)
app.route('/public', publicSignup); // Temporarily disabled - has parse-time errors
app.route('/v1/imports', imports); // Data Import System (Week 28)
app.route('/v1/exports', imports); // Data Export System (Week 28)

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

const server = serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log('✓ Server running at http://localhost:' + info.port);

  // Initialize WebSocket server for real-time import progress
  initWebSocket(server);
  console.log('✓ WebSocket server initialized on /ws/imports');
});
