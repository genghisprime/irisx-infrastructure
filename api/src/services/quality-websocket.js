/**
 * Quality WebSocket Service
 * Real-time call quality metrics streaming for live graphs
 *
 * Features:
 * - Live MOS score updates during calls
 * - Jitter, packet loss, latency graphs
 * - Per-call and aggregate quality streaming
 * - Quality alerts in real-time
 * - Historical quality comparison
 */

import * as wsModule from 'ws';
const { WebSocketServer } = wsModule;
import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import callQualityService from './call-quality.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

let wss = null;
const clients = new Map(); // ws -> { tenantId, userId, subscriptions }
const callSubscriptions = new Map(); // callId -> Set of ws clients

const QUALITY_UPDATE_INTERVAL = 2000; // 2 seconds for real-time quality
const AGGREGATE_UPDATE_INTERVAL = 10000; // 10 seconds for aggregates

/**
 * Initialize Quality WebSocket server
 */
export function initQualityWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/quality'
  });

  wss.on('connection', (ws, req) => {
    console.log('[Quality WS] Client connected');

    ws.isAlive = true;
    ws.tenantId = null;
    ws.userId = null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await handleMessage(ws, data);
      } catch (error) {
        console.error('[Quality WS] Message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
      console.log('[Quality WS] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[Quality WS] Error:', error);
      handleDisconnect(ws);
    });
  });

  // Heartbeat
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

  // Aggregate quality updates
  const aggregateInterval = setInterval(sendAggregateUpdates, AGGREGATE_UPDATE_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(aggregateInterval);
  });

  console.log('[Quality WS] Server initialized on /ws/quality');
}

/**
 * Handle incoming messages
 */
async function handleMessage(ws, data) {
  switch (data.type) {
    case 'authenticate':
      await handleAuthenticate(ws, data);
      break;

    case 'subscribe_call':
      handleSubscribeCall(ws, data);
      break;

    case 'unsubscribe_call':
      handleUnsubscribeCall(ws, data);
      break;

    case 'subscribe_aggregate':
      handleSubscribeAggregate(ws, data);
      break;

    case 'get_call_quality':
      await sendCallQuality(ws, data.call_id);
      break;

    case 'get_quality_history':
      await sendQualityHistory(ws, data);
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
    const tenantId = decoded.tenantId || decoded.tenant_id;
    const userId = decoded.userId || decoded.adminId || decoded.user_id;

    if (!tenantId && !decoded.adminId) {
      throw new Error('Invalid token - no tenant or admin ID');
    }

    ws.tenantId = tenantId;
    ws.userId = userId;
    ws.isAdmin = !!decoded.adminId;

    clients.set(ws, {
      tenantId,
      userId,
      isAdmin: ws.isAdmin,
      subscriptions: {
        calls: new Set(),
        aggregate: false,
        carriers: new Set(),
        agents: new Set()
      }
    });

    ws.send(JSON.stringify({
      type: 'authenticated',
      tenant_id: tenantId,
      is_admin: ws.isAdmin
    }));

    console.log(`[Quality WS] Authenticated: tenant=${tenantId}, admin=${ws.isAdmin}`);

  } catch (error) {
    ws.send(JSON.stringify({
      type: 'auth_error',
      message: 'Invalid token'
    }));
  }
}

/**
 * Subscribe to call quality updates
 */
function handleSubscribeCall(ws, data) {
  if (!ws.tenantId && !ws.isAdmin) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Authentication required'
    }));
    return;
  }

  const { call_id } = data;
  if (!call_id) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'call_id required'
    }));
    return;
  }

  const clientData = clients.get(ws);
  if (clientData) {
    clientData.subscriptions.calls.add(call_id);
  }

  if (!callSubscriptions.has(call_id)) {
    callSubscriptions.set(call_id, new Set());
  }
  callSubscriptions.get(call_id).add(ws);

  ws.send(JSON.stringify({
    type: 'subscribed',
    call_id,
    message: `Subscribed to quality updates for call ${call_id}`
  }));
}

/**
 * Unsubscribe from call quality updates
 */
function handleUnsubscribeCall(ws, data) {
  const { call_id } = data;
  if (!call_id) return;

  const clientData = clients.get(ws);
  if (clientData) {
    clientData.subscriptions.calls.delete(call_id);
  }

  if (callSubscriptions.has(call_id)) {
    callSubscriptions.get(call_id).delete(ws);
    if (callSubscriptions.get(call_id).size === 0) {
      callSubscriptions.delete(call_id);
    }
  }

  ws.send(JSON.stringify({
    type: 'unsubscribed',
    call_id
  }));
}

/**
 * Subscribe to aggregate quality updates
 */
function handleSubscribeAggregate(ws, data) {
  if (!ws.tenantId && !ws.isAdmin) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Authentication required'
    }));
    return;
  }

  const clientData = clients.get(ws);
  if (clientData) {
    clientData.subscriptions.aggregate = true;
    if (data.carriers) {
      data.carriers.forEach(c => clientData.subscriptions.carriers.add(c));
    }
    if (data.agents) {
      data.agents.forEach(a => clientData.subscriptions.agents.add(a));
    }
  }

  ws.send(JSON.stringify({
    type: 'subscribed_aggregate',
    message: 'Subscribed to aggregate quality updates'
  }));
}

/**
 * Handle disconnect
 */
function handleDisconnect(ws) {
  const clientData = clients.get(ws);
  if (clientData) {
    // Remove from all call subscriptions
    clientData.subscriptions.calls.forEach(callId => {
      if (callSubscriptions.has(callId)) {
        callSubscriptions.get(callId).delete(ws);
        if (callSubscriptions.get(callId).size === 0) {
          callSubscriptions.delete(callId);
        }
      }
    });
  }
  clients.delete(ws);
}

/**
 * Send call quality data
 */
async function sendCallQuality(ws, callId) {
  if (!callId) return;

  try {
    const tenantId = ws.isAdmin ? null : ws.tenantId;

    // Get latest quality metrics
    const result = await pool.query(`
      SELECT
        cqm.*,
        c.status as call_status,
        c.direction,
        c.from_number,
        c.to_number
      FROM call_quality_metrics cqm
      JOIN calls c ON cqm.call_id = c.id
      WHERE cqm.call_id = $1
      ${tenantId ? 'AND cqm.tenant_id = $2' : ''}
      ORDER BY cqm.recorded_at DESC
      LIMIT 100
    `, tenantId ? [callId, tenantId] : [callId]);

    // Get summary
    const summaryResult = await pool.query(`
      SELECT
        AVG(mos) as avg_mos,
        MIN(mos) as min_mos,
        MAX(mos) as max_mos,
        AVG(jitter_avg) as avg_jitter,
        MAX(jitter_avg) as max_jitter,
        AVG(packet_loss_avg) as avg_packet_loss,
        MAX(packet_loss_avg) as max_packet_loss,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        COUNT(*) as sample_count
      FROM call_quality_metrics
      WHERE call_id = $1
      ${tenantId ? 'AND tenant_id = $2' : ''}
    `, tenantId ? [callId, tenantId] : [callId]);

    ws.send(JSON.stringify({
      type: 'call_quality',
      call_id: callId,
      metrics: result.rows.map(m => ({
        recorded_at: m.recorded_at,
        mos: parseFloat(m.mos),
        r_factor: parseFloat(m.r_factor),
        quality_label: m.quality_label,
        jitter: parseFloat(m.jitter_avg),
        packet_loss: parseFloat(m.packet_loss_avg),
        latency: parseFloat(m.latency),
        codec: m.codec
      })),
      summary: summaryResult.rows[0] ? {
        avg_mos: parseFloat(summaryResult.rows[0].avg_mos) || 0,
        min_mos: parseFloat(summaryResult.rows[0].min_mos) || 0,
        max_mos: parseFloat(summaryResult.rows[0].max_mos) || 0,
        avg_jitter: parseFloat(summaryResult.rows[0].avg_jitter) || 0,
        max_jitter: parseFloat(summaryResult.rows[0].max_jitter) || 0,
        avg_packet_loss: parseFloat(summaryResult.rows[0].avg_packet_loss) || 0,
        max_packet_loss: parseFloat(summaryResult.rows[0].max_packet_loss) || 0,
        avg_latency: parseFloat(summaryResult.rows[0].avg_latency) || 0,
        max_latency: parseFloat(summaryResult.rows[0].max_latency) || 0,
        sample_count: parseInt(summaryResult.rows[0].sample_count) || 0
      } : null,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('[Quality WS] Get call quality error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to fetch call quality'
    }));
  }
}

/**
 * Send quality history for graphing
 */
async function sendQualityHistory(ws, data) {
  const { period = '24h', granularity = '5m' } = data;

  try {
    const tenantId = ws.isAdmin ? null : ws.tenantId;

    // Calculate time range
    const periodHours = {
      '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720
    }[period] || 24;

    const granularityMinutes = {
      '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 1440
    }[granularity] || 5;

    const result = await pool.query(`
      SELECT
        DATE_TRUNC('minute', recorded_at) -
          (EXTRACT(MINUTE FROM recorded_at)::INT % $3) * INTERVAL '1 minute' as time_bucket,
        AVG(mos) as avg_mos,
        MIN(mos) as min_mos,
        MAX(mos) as max_mos,
        AVG(jitter_avg) as avg_jitter,
        AVG(packet_loss_avg) as avg_packet_loss,
        AVG(latency) as avg_latency,
        COUNT(*) as sample_count,
        COUNT(DISTINCT call_id) as call_count
      FROM call_quality_metrics
      WHERE recorded_at >= NOW() - INTERVAL '${periodHours} hours'
      ${tenantId ? 'AND tenant_id = $1' : ''}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `, tenantId ? [tenantId, periodHours, granularityMinutes] : [periodHours, granularityMinutes]);

    ws.send(JSON.stringify({
      type: 'quality_history',
      period,
      granularity,
      data: result.rows.map(r => ({
        time: r.time_bucket,
        avg_mos: parseFloat(r.avg_mos) || 0,
        min_mos: parseFloat(r.min_mos) || 0,
        max_mos: parseFloat(r.max_mos) || 0,
        avg_jitter: parseFloat(r.avg_jitter) || 0,
        avg_packet_loss: parseFloat(r.avg_packet_loss) || 0,
        avg_latency: parseFloat(r.avg_latency) || 0,
        sample_count: parseInt(r.sample_count) || 0,
        call_count: parseInt(r.call_count) || 0
      })),
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('[Quality WS] Quality history error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to fetch quality history'
    }));
  }
}

/**
 * Send aggregate quality updates
 */
async function sendAggregateUpdates() {
  for (const [ws, clientData] of clients) {
    if (ws.readyState !== 1 || !clientData.subscriptions.aggregate) continue;

    try {
      const tenantId = ws.isAdmin ? null : ws.tenantId;

      // Get current quality overview
      const overview = await pool.query(`
        SELECT
          COUNT(DISTINCT call_id) as active_calls,
          AVG(mos) as avg_mos,
          MIN(mos) as min_mos,
          COUNT(*) FILTER (WHERE mos < 3.0) as poor_quality_count,
          COUNT(*) FILTER (WHERE mos >= 4.0) as good_quality_count,
          AVG(jitter_avg) as avg_jitter,
          AVG(packet_loss_avg) as avg_packet_loss,
          AVG(latency) as avg_latency
        FROM call_quality_metrics
        WHERE recorded_at >= NOW() - INTERVAL '5 minutes'
        ${tenantId ? 'AND tenant_id = $1' : ''}
      `, tenantId ? [tenantId] : []);

      // Get quality distribution
      const distribution = await pool.query(`
        SELECT
          CASE
            WHEN mos >= 4.3 THEN 'Excellent'
            WHEN mos >= 4.0 THEN 'Good'
            WHEN mos >= 3.6 THEN 'Fair'
            WHEN mos >= 3.1 THEN 'Poor'
            ELSE 'Bad'
          END as quality,
          COUNT(*) as count
        FROM call_quality_metrics
        WHERE recorded_at >= NOW() - INTERVAL '1 hour'
        ${tenantId ? 'AND tenant_id = $1' : ''}
        GROUP BY quality
        ORDER BY count DESC
      `, tenantId ? [tenantId] : []);

      // Get active alerts
      const alerts = await pool.query(`
        SELECT severity, COUNT(*) as count
        FROM call_quality_alerts
        WHERE created_at >= NOW() - INTERVAL '1 hour'
          AND status = 'active'
        ${tenantId ? 'AND tenant_id = $1' : ''}
        GROUP BY severity
      `, tenantId ? [tenantId] : []);

      ws.send(JSON.stringify({
        type: 'aggregate_update',
        overview: overview.rows[0] ? {
          active_calls: parseInt(overview.rows[0].active_calls) || 0,
          avg_mos: parseFloat(overview.rows[0].avg_mos) || 0,
          min_mos: parseFloat(overview.rows[0].min_mos) || 0,
          poor_quality_count: parseInt(overview.rows[0].poor_quality_count) || 0,
          good_quality_count: parseInt(overview.rows[0].good_quality_count) || 0,
          avg_jitter: parseFloat(overview.rows[0].avg_jitter) || 0,
          avg_packet_loss: parseFloat(overview.rows[0].avg_packet_loss) || 0,
          avg_latency: parseFloat(overview.rows[0].avg_latency) || 0
        } : null,
        distribution: distribution.rows.map(d => ({
          quality: d.quality,
          count: parseInt(d.count)
        })),
        alerts: alerts.rows.map(a => ({
          severity: a.severity,
          count: parseInt(a.count)
        })),
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('[Quality WS] Aggregate update error:', error);
    }
  }
}

/**
 * Broadcast quality update for a specific call
 * Called when new quality metrics are recorded
 */
export function broadcastCallQuality(callId, metrics) {
  const subscribers = callSubscriptions.get(callId);
  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify({
    type: 'quality_update',
    call_id: callId,
    metrics: {
      recorded_at: new Date().toISOString(),
      mos: metrics.mos,
      r_factor: metrics.r_factor,
      quality_label: metrics.quality_label,
      jitter: metrics.jitter_avg,
      packet_loss: metrics.packet_loss_avg,
      latency: metrics.latency,
      codec: metrics.codec
    }
  });

  for (const ws of subscribers) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast quality alert
 */
export function broadcastQualityAlert(tenantId, alert) {
  const message = JSON.stringify({
    type: 'quality_alert',
    alert: {
      id: alert.id,
      call_id: alert.call_id,
      severity: alert.severity,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      message: alert.message,
      created_at: alert.created_at
    }
  });

  for (const [ws, clientData] of clients) {
    if (ws.readyState !== 1) continue;
    if (!ws.isAdmin && clientData.tenantId !== tenantId) continue;

    ws.send(message);
  }
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  return {
    total_connections: wss ? wss.clients.size : 0,
    authenticated_clients: clients.size,
    active_call_subscriptions: callSubscriptions.size
  };
}

export default {
  initQualityWebSocket,
  broadcastCallQuality,
  broadcastQualityAlert,
  getConnectionStats
};
