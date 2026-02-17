/**
 * Dashboard WebSocket Service
 * Real-time updates for admin analytics dashboard
 *
 * Provides:
 * - Real-time usage metrics (calls, SMS, emails)
 * - Active call/chat counts
 * - Revenue updates
 * - Tenant activity alerts
 * - System health metrics
 */

import pkg from 'ws';
const { WebSocketServer } = pkg;
import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import redis from '../db/redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

let wss = null;
const adminClients = new Map(); // ws -> { adminId, role, subscribedMetrics }
const UPDATE_INTERVAL = 10000; // 10 seconds for dashboard updates
const QUICK_UPDATE_INTERVAL = 5000; // 5 seconds for critical metrics

/**
 * Initialize Dashboard WebSocket server
 */
export function initDashboardWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/dashboard'
  });

  wss.on('connection', (ws, req) => {
    console.log('[Dashboard WS] Admin client connected');

    ws.isAlive = true;
    ws.adminId = null;
    ws.role = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await handleMessage(ws, data);
      } catch (error) {
        console.error('[Dashboard WS] Message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
      console.log('[Dashboard WS] Admin client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[Dashboard WS] Error:', error);
      handleDisconnect(ws);
    });
  });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        handleDisconnect(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Quick metrics updates every 5 seconds
  const quickInterval = setInterval(sendQuickMetrics, QUICK_UPDATE_INTERVAL);

  // Full dashboard updates every 10 seconds
  const dashboardInterval = setInterval(sendDashboardUpdates, UPDATE_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(quickInterval);
    clearInterval(dashboardInterval);
  });

  // Subscribe to Redis pub/sub for real-time events
  subscribeToRedisEvents();

  console.log('[Dashboard WS] Server initialized on /ws/dashboard');
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(ws, data) {
  switch (data.type) {
    case 'authenticate':
      await handleAuthenticate(ws, data);
      break;

    case 'subscribe':
      handleSubscribe(ws, data);
      break;

    case 'unsubscribe':
      handleUnsubscribe(ws, data);
      break;

    case 'request_full':
      await sendFullDashboardUpdate(ws);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type'
      }));
  }
}

/**
 * Authenticate admin WebSocket connection
 */
async function handleAuthenticate(ws, data) {
  const { token } = data;

  if (!token) {
    ws.send(JSON.stringify({
      type: 'auth_error',
      message: 'Token required'
    }));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Must be an admin token
    if (!decoded.adminId || !decoded.role) {
      throw new Error('Admin authentication required');
    }

    ws.adminId = decoded.adminId;
    ws.role = decoded.role;

    // Store in admin clients map with default subscriptions
    adminClients.set(ws, {
      adminId: decoded.adminId,
      role: decoded.role,
      subscribedMetrics: ['overview', 'activity', 'alerts']
    });

    ws.send(JSON.stringify({
      type: 'authenticated',
      admin_id: decoded.adminId,
      role: decoded.role
    }));

    // Send initial full dashboard
    await sendFullDashboardUpdate(ws);

    console.log(`[Dashboard WS] Authenticated admin: ${decoded.adminId}`);

  } catch (error) {
    ws.send(JSON.stringify({
      type: 'auth_error',
      message: 'Invalid admin token'
    }));
  }
}

/**
 * Subscribe to specific metrics
 */
function handleSubscribe(ws, data) {
  if (!ws.adminId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Authentication required'
    }));
    return;
  }

  const { metrics = [] } = data;
  const validMetrics = ['overview', 'activity', 'alerts', 'tenants', 'revenue', 'calls', 'health'];
  const subscribedMetrics = metrics.filter(m => validMetrics.includes(m));

  const clientData = adminClients.get(ws);
  if (clientData) {
    clientData.subscribedMetrics = subscribedMetrics.length > 0 ? subscribedMetrics : validMetrics;
  }

  ws.send(JSON.stringify({
    type: 'subscribed',
    metrics: clientData?.subscribedMetrics || []
  }));
}

/**
 * Unsubscribe from metrics
 */
function handleUnsubscribe(ws, data) {
  const { metrics = [] } = data;
  const clientData = adminClients.get(ws);

  if (clientData && metrics.length > 0) {
    clientData.subscribedMetrics = clientData.subscribedMetrics.filter(m => !metrics.includes(m));
  }

  ws.send(JSON.stringify({
    type: 'unsubscribed',
    metrics: metrics
  }));
}

/**
 * Handle disconnect
 */
function handleDisconnect(ws) {
  adminClients.delete(ws);
}

/**
 * Send full dashboard update to a client
 */
async function sendFullDashboardUpdate(ws) {
  if (!ws.adminId || ws.readyState !== 1) return;

  const clientData = adminClients.get(ws);
  if (!clientData) return;

  try {
    const dashboardData = await fetchDashboardMetrics(clientData.subscribedMetrics);

    ws.send(JSON.stringify({
      type: 'full_update',
      timestamp: new Date().toISOString(),
      data: dashboardData
    }));

  } catch (error) {
    console.error('[Dashboard WS] Full update error:', error);
  }
}

/**
 * Send quick metrics (active calls, chats)
 */
async function sendQuickMetrics() {
  if (adminClients.size === 0) return;

  try {
    const quickData = await fetchQuickMetrics();
    const message = JSON.stringify({
      type: 'quick_update',
      timestamp: new Date().toISOString(),
      data: quickData
    });

    for (const [ws] of adminClients) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  } catch (error) {
    console.error('[Dashboard WS] Quick metrics error:', error);
  }
}

/**
 * Send dashboard updates to all subscribed admins
 */
async function sendDashboardUpdates() {
  for (const [ws, clientData] of adminClients) {
    if (ws.readyState !== 1) continue;

    try {
      const dashboardData = await fetchDashboardMetrics(clientData.subscribedMetrics);

      ws.send(JSON.stringify({
        type: 'dashboard_update',
        timestamp: new Date().toISOString(),
        data: dashboardData
      }));

    } catch (error) {
      console.error(`[Dashboard WS] Update error for admin ${clientData.adminId}:`, error);
    }
  }
}

/**
 * Fetch quick metrics (minimal DB queries)
 */
async function fetchQuickMetrics() {
  const [activeCalls, activeChats, queuedCalls] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) as count FROM calls
      WHERE status = 'in-progress'
        OR (start_time > NOW() - INTERVAL '5 minutes' AND end_time IS NULL)
    `).catch(() => ({ rows: [{ count: 0 }] })),

    pool.query(`
      SELECT COUNT(*) as count FROM chat_conversations
      WHERE status IN ('open', 'active')
    `).catch(() => ({ rows: [{ count: 0 }] })),

    pool.query(`
      SELECT COUNT(*) as count FROM calls
      WHERE status = 'queued'
    `).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  return {
    activeCalls: parseInt(activeCalls.rows[0]?.count || 0),
    activeChats: parseInt(activeChats.rows[0]?.count || 0),
    queuedCalls: parseInt(queuedCalls.rows[0]?.count || 0),
    timestamp: Date.now()
  };
}

/**
 * Fetch full dashboard metrics
 */
async function fetchDashboardMetrics(subscribedMetrics) {
  const metrics = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Overview metrics
  if (subscribedMetrics.includes('overview')) {
    const [tenantStats, usageToday] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_tenants,
          COUNT(*) FILTER (WHERE status = 'active') as active_tenants,
          COUNT(*) FILTER (WHERE created_at >= $1) as new_today
        FROM tenants WHERE deleted_at IS NULL
      `, [today]),

      pool.query(`
        SELECT
          COALESCE(SUM(call_count), 0) as calls_today,
          COALESCE(SUM(total_sms_sent), 0) as sms_today,
          COALESCE(SUM(total_emails_sent), 0) as emails_today,
          COALESCE(SUM(total_cost), 0) as cost_today
        FROM usage_tracking
        WHERE tracking_date = CURRENT_DATE
      `)
    ]);

    metrics.overview = {
      tenants: {
        total: parseInt(tenantStats.rows[0]?.total_tenants || 0),
        active: parseInt(tenantStats.rows[0]?.active_tenants || 0),
        newToday: parseInt(tenantStats.rows[0]?.new_today || 0)
      },
      todayUsage: {
        calls: parseInt(usageToday.rows[0]?.calls_today || 0),
        sms: parseInt(usageToday.rows[0]?.sms_today || 0),
        emails: parseInt(usageToday.rows[0]?.emails_today || 0),
        cost: parseFloat(usageToday.rows[0]?.cost_today || 0)
      }
    };
  }

  // Activity metrics - last hour
  if (subscribedMetrics.includes('activity')) {
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const [recentCalls, recentSMS, recentEmails] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as count FROM calls WHERE created_at >= $1
      `, [lastHour]),

      pool.query(`
        SELECT COUNT(*) as count FROM sms_messages WHERE created_at >= $1
      `, [lastHour]).catch(() => ({ rows: [{ count: 0 }] })),

      pool.query(`
        SELECT COUNT(*) as count FROM emails WHERE created_at >= $1
      `, [lastHour]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    metrics.activity = {
      lastHour: {
        calls: parseInt(recentCalls.rows[0]?.count || 0),
        sms: parseInt(recentSMS.rows[0]?.count || 0),
        emails: parseInt(recentEmails.rows[0]?.count || 0)
      }
    };
  }

  // Alert metrics
  if (subscribedMetrics.includes('alerts')) {
    const alerts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical,
        COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'active') as warning,
        COUNT(*) FILTER (WHERE status = 'active') as total_active
      FROM alerts
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `).catch(() => ({ rows: [{ critical: 0, warning: 0, total_active: 0 }] }));

    metrics.alerts = {
      critical: parseInt(alerts.rows[0]?.critical || 0),
      warning: parseInt(alerts.rows[0]?.warning || 0),
      totalActive: parseInt(alerts.rows[0]?.total_active || 0)
    };
  }

  // Revenue metrics
  if (subscribedMetrics.includes('revenue')) {
    const [todayRevenue, monthRevenue] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(amount_cents) / 100.0, 0) as revenue
        FROM invoices
        WHERE created_at >= $1 AND status = 'paid'
      `, [today]),

      pool.query(`
        SELECT COALESCE(SUM(amount_cents) / 100.0, 0) as revenue
        FROM invoices
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND status = 'paid'
      `)
    ]);

    metrics.revenue = {
      today: parseFloat(todayRevenue.rows[0]?.revenue || 0),
      thisMonth: parseFloat(monthRevenue.rows[0]?.revenue || 0)
    };
  }

  // Call metrics
  if (subscribedMetrics.includes('calls')) {
    const callStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'in-progress') as active,
        AVG(duration_seconds) FILTER (WHERE duration_seconds > 0) as avg_duration
      FROM calls
      WHERE created_at >= CURRENT_DATE
    `);

    metrics.calls = {
      total: parseInt(callStats.rows[0]?.total || 0),
      completed: parseInt(callStats.rows[0]?.completed || 0),
      failed: parseInt(callStats.rows[0]?.failed || 0),
      active: parseInt(callStats.rows[0]?.active || 0),
      avgDuration: parseFloat(callStats.rows[0]?.avg_duration || 0).toFixed(1)
    };
  }

  // System health metrics
  if (subscribedMetrics.includes('health')) {
    const [dbHealth, redisHealth] = await Promise.all([
      pool.query('SELECT 1').then(() => 'healthy').catch(() => 'unhealthy'),
      redis.ping().then(() => 'healthy').catch(() => 'unhealthy')
    ]);

    metrics.health = {
      database: dbHealth,
      redis: redisHealth,
      wsConnections: adminClients.size,
      timestamp: Date.now()
    };
  }

  return metrics;
}

/**
 * Subscribe to Redis pub/sub for real-time events
 */
async function subscribeToRedisEvents() {
  try {
    const subscriber = redis.duplicate();
    await subscriber.connect();

    // Subscribe to system events
    await subscriber.pSubscribe('system:*', (message, channel) => {
      broadcastEvent('system', channel, message);
    });

    // Subscribe to alert events
    await subscriber.pSubscribe('alerts:*', (message, channel) => {
      broadcastEvent('alert', channel, message);
    });

    // Subscribe to usage events
    await subscriber.pSubscribe('usage:*', (message, channel) => {
      broadcastEvent('usage', channel, message);
    });

    console.log('[Dashboard WS] Subscribed to Redis pub/sub events');
  } catch (error) {
    console.error('[Dashboard WS] Redis subscription error:', error);
  }
}

/**
 * Broadcast event to all connected admins
 */
function broadcastEvent(eventType, channel, message) {
  if (adminClients.size === 0) return;

  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    const broadcast = JSON.stringify({
      type: 'event',
      eventType,
      channel,
      data,
      timestamp: new Date().toISOString()
    });

    for (const [ws] of adminClients) {
      if (ws.readyState === 1) {
        ws.send(broadcast);
      }
    }
  } catch (error) {
    console.error('[Dashboard WS] Broadcast error:', error);
  }
}

/**
 * Manually broadcast an alert to all connected admins
 */
export function broadcastAlert(severity, message, data = {}) {
  if (adminClients.size === 0) return;

  const broadcast = JSON.stringify({
    type: 'alert',
    severity,
    message,
    data,
    timestamp: new Date().toISOString()
  });

  for (const [ws] of adminClients) {
    if (ws.readyState === 1) {
      ws.send(broadcast);
    }
  }
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  const stats = {
    total_connections: wss ? wss.clients.size : 0,
    admin_connections: adminClients.size,
    admins: []
  };

  for (const [, clientData] of adminClients) {
    stats.admins.push({
      adminId: clientData.adminId,
      role: clientData.role,
      subscriptions: clientData.subscribedMetrics
    });
  }

  return stats;
}

export default {
  initDashboardWebSocket,
  broadcastAlert,
  getConnectionStats
};
