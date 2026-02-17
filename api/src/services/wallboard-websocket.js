/**
 * Wallboard WebSocket Service
 *
 * Real-time WebSocket connections for wallboard data
 * Supports multiple update frequencies:
 * - Full data: Every 30 seconds
 * - Quick snapshot: Every 5 seconds
 * - Event-driven updates: Immediate
 */

import * as wsModule from 'ws';
const { WebSocketServer } = wsModule;
import jwt from 'jsonwebtoken';
import wallboardService from './wallboard.js';
import redisClient from '../db/redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

let wss = null;
const clientSubscriptions = new Map(); // ws -> { tenantId, queueIds, lastFullUpdate }
const tenantClients = new Map(); // tenantId -> Set<ws>

// Update intervals
const FULL_UPDATE_INTERVAL = 30000;    // 30 seconds
const QUICK_UPDATE_INTERVAL = 5000;    // 5 seconds

/**
 * Initialize Wallboard WebSocket server
 */
export function initWallboardWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/wallboard'
  });

  wss.on('connection', (ws, req) => {
    console.log('[Wallboard WS] Client connected');

    ws.isAlive = true;
    ws.tenantId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await handleMessage(ws, data);
      } catch (error) {
        console.error('[Wallboard WS] Message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
      console.log('[Wallboard WS] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[Wallboard WS] Error:', error);
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

  // Quick snapshot updates every 5 seconds
  const quickUpdateInterval = setInterval(sendQuickSnapshots, QUICK_UPDATE_INTERVAL);

  // Full updates every 30 seconds
  const fullUpdateInterval = setInterval(sendFullUpdates, FULL_UPDATE_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(quickUpdateInterval);
    clearInterval(fullUpdateInterval);
  });

  // Subscribe to Redis pub/sub for real-time events
  subscribeToRedisUpdates();

  console.log('[Wallboard WS] Server initialized on /ws/wallboard');
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
      await handleSubscribe(ws, data);
      break;

    case 'unsubscribe':
      handleUnsubscribe(ws);
      break;

    case 'request_full':
      await sendFullUpdate(ws);
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type'
      }));
  }
}

/**
 * Authenticate WebSocket connection
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

    // Support both tenant user tokens and admin tokens
    const tenantId = decoded.tenantId || null;
    const isAdmin = decoded.adminId && decoded.role;

    if (!tenantId && !isAdmin) {
      throw new Error('Invalid token - no tenant or admin context');
    }

    ws.tenantId = tenantId;
    ws.isAdmin = isAdmin;
    ws.userId = decoded.userId || decoded.adminId;

    ws.send(JSON.stringify({
      type: 'authenticated',
      tenant_id: tenantId,
      is_admin: isAdmin
    }));

    console.log(`[Wallboard WS] Authenticated: tenant=${tenantId}, admin=${isAdmin}`);

  } catch (error) {
    ws.send(JSON.stringify({
      type: 'auth_error',
      message: 'Invalid token'
    }));
  }
}

/**
 * Subscribe to wallboard updates
 */
async function handleSubscribe(ws, data) {
  if (!ws.tenantId && !ws.isAdmin) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Authentication required'
    }));
    return;
  }

  const { queue_ids = [], tenant_id } = data;

  // Admins can subscribe to any tenant
  const targetTenantId = ws.isAdmin && tenant_id ? tenant_id : ws.tenantId;

  if (!targetTenantId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Tenant ID required for admin subscriptions'
    }));
    return;
  }

  // Store subscription
  clientSubscriptions.set(ws, {
    tenantId: targetTenantId,
    queueIds: queue_ids,
    lastFullUpdate: 0
  });

  // Add to tenant clients map
  if (!tenantClients.has(targetTenantId)) {
    tenantClients.set(targetTenantId, new Set());
  }
  tenantClients.get(targetTenantId).add(ws);

  ws.send(JSON.stringify({
    type: 'subscribed',
    tenant_id: targetTenantId,
    queue_ids: queue_ids
  }));

  // Send initial full update
  await sendFullUpdate(ws);

  console.log(`[Wallboard WS] Subscribed to tenant ${targetTenantId}`);
}

/**
 * Unsubscribe from updates
 */
function handleUnsubscribe(ws) {
  const subscription = clientSubscriptions.get(ws);
  if (subscription) {
    const { tenantId } = subscription;
    if (tenantClients.has(tenantId)) {
      tenantClients.get(tenantId).delete(ws);
    }
    clientSubscriptions.delete(ws);
  }

  ws.send(JSON.stringify({
    type: 'unsubscribed'
  }));
}

/**
 * Handle client disconnect
 */
function handleDisconnect(ws) {
  const subscription = clientSubscriptions.get(ws);
  if (subscription) {
    const { tenantId } = subscription;
    if (tenantClients.has(tenantId)) {
      tenantClients.get(tenantId).delete(ws);
    }
    clientSubscriptions.delete(ws);
  }
}

/**
 * Send full wallboard data to a client
 */
async function sendFullUpdate(ws) {
  const subscription = clientSubscriptions.get(ws);
  if (!subscription) return;

  try {
    const { tenantId, queueIds } = subscription;
    const wallboardData = await wallboardService.getWallboardData(tenantId, queueIds);

    ws.send(JSON.stringify({
      type: 'full_update',
      data: wallboardData
    }));

    subscription.lastFullUpdate = Date.now();
  } catch (error) {
    console.error('[Wallboard WS] Full update error:', error);
  }
}

/**
 * Send full updates to all subscribed clients
 */
async function sendFullUpdates() {
  for (const [ws, subscription] of clientSubscriptions) {
    if (ws.readyState === 1) {
      await sendFullUpdate(ws);
    }
  }
}

/**
 * Send quick snapshots to all subscribed clients
 */
async function sendQuickSnapshots() {
  const tenantSnapshots = new Map();

  for (const [ws, subscription] of clientSubscriptions) {
    if (ws.readyState !== 1) continue;

    const { tenantId, queueIds } = subscription;

    try {
      // Cache snapshots per tenant to avoid duplicate queries
      let snapshot;
      if (tenantSnapshots.has(tenantId)) {
        snapshot = tenantSnapshots.get(tenantId);
      } else {
        snapshot = await wallboardService.getQuickSnapshot(tenantId, queueIds);
        tenantSnapshots.set(tenantId, snapshot);
      }

      ws.send(JSON.stringify({
        type: 'snapshot',
        data: snapshot
      }));
    } catch (error) {
      console.error(`[Wallboard WS] Snapshot error for tenant ${tenantId}:`, error);
    }
  }
}

/**
 * Subscribe to Redis pub/sub for real-time event updates
 */
async function subscribeToRedisUpdates() {
  try {
    // Create a subscriber client
    const subscriber = redisClient.duplicate();
    await subscriber.connect();

    // Subscribe to wallboard update patterns
    await subscriber.pSubscribe('wallboard:*:updates', (message, channel) => {
      try {
        const tenantId = channel.split(':')[1];
        const data = JSON.parse(message);

        // Broadcast to all clients subscribed to this tenant
        const clients = tenantClients.get(tenantId);
        if (clients) {
          const broadcast = JSON.stringify({
            type: 'event',
            data
          });

          for (const ws of clients) {
            if (ws.readyState === 1) {
              ws.send(broadcast);
            }
          }
        }
      } catch (error) {
        console.error('[Wallboard WS] Redis message error:', error);
      }
    });

    console.log('[Wallboard WS] Subscribed to Redis pub/sub');
  } catch (error) {
    console.error('[Wallboard WS] Redis subscription error:', error);
  }
}

/**
 * Broadcast an event to all clients of a specific tenant
 */
export function broadcastToTenant(tenantId, eventType, data) {
  const clients = tenantClients.get(tenantId);
  if (!clients) return;

  const message = JSON.stringify({
    type: 'event',
    event: eventType,
    data
  });

  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast queue update
 */
export function broadcastQueueUpdate(tenantId, queueId, queueData) {
  broadcastToTenant(tenantId, 'queue_update', {
    queue_id: queueId,
    ...queueData
  });
}

/**
 * Broadcast agent status change
 */
export function broadcastAgentStatusChange(tenantId, agentId, status) {
  broadcastToTenant(tenantId, 'agent_status', {
    agent_id: agentId,
    status
  });
}

/**
 * Get connection stats
 */
export function getConnectionStats() {
  const stats = {
    total_connections: wss ? wss.clients.size : 0,
    subscribed_connections: clientSubscriptions.size,
    tenants_with_subscribers: tenantClients.size
  };

  return stats;
}

export default {
  initWallboardWebSocket,
  broadcastToTenant,
  broadcastQueueUpdate,
  broadcastAgentStatusChange,
  getConnectionStats
};
