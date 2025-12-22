/**
 * Real-time Streaming Routes
 * REST API for streaming session management and WebSocket upgrade
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import realtimeStreaming from '../services/realtime-streaming.js';
import db from '../db.js';

const router = new Hono();

// ===========================================
// SESSION ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/sessions
 * Create a new streaming session
 */
router.post('/sessions', zValidator('json', z.object({
  stream_types: z.array(z.enum(['transcript', 'metrics', 'events', 'quality', 'agent_status'])).default(['transcript']),
  call_id: z.string().uuid().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { stream_types, call_id } = c.req.valid('json');

  const clientInfo = {
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP')
  };

  const session = await realtimeStreaming.createSession(tenantId, userId, stream_types, clientInfo);

  // If call_id provided, auto-subscribe
  if (call_id) {
    await realtimeStreaming.subscribeToCall(session.sessionId, call_id);
  }

  return c.json({
    session_id: session.sessionId,
    session_token: session.sessionToken,
    stream_types: session.streamTypes,
    websocket_url: `/v1/streaming/ws?token=${session.sessionToken}`
  }, 201);
});

/**
 * GET /v1/streaming/sessions
 * List active streaming sessions
 */
router.get('/sessions', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  const sessions = await realtimeStreaming.getActiveSessions(isAdmin ? null : tenantId);

  return c.json({ sessions });
});

/**
 * GET /v1/streaming/sessions/:id
 * Get session details
 */
router.get('/sessions/:id', async (c) => {
  const { id } = c.req.param();

  const result = await db.query(`
    SELECT
      ss.*,
      u.email as user_email,
      u.full_name as user_name,
      (SELECT COUNT(*) FROM streaming_subscriptions WHERE session_id = ss.id) as subscription_count
    FROM streaming_sessions ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json(result.rows[0]);
});

/**
 * DELETE /v1/streaming/sessions/:id
 * Terminate a streaming session
 */
router.delete('/sessions/:id', async (c) => {
  const { id } = c.req.param();
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  // Get session to find connection_id
  const session = await db.query(`
    SELECT connection_id, tenant_id FROM streaming_sessions WHERE id = $1
  `, [id]);

  if (session.rows.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }

  // Check tenant access
  if (!isAdmin && session.rows[0].tenant_id !== tenantId) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  if (session.rows[0].connection_id) {
    await realtimeStreaming.disconnectSession(session.rows[0].connection_id);
  } else {
    await db.query(`
      UPDATE streaming_sessions SET status = 'disconnected', disconnected_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  return c.json({ success: true });
});

// ===========================================
// SUBSCRIPTION ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/subscriptions
 * Subscribe to events
 */
router.post('/subscriptions', zValidator('json', z.object({
  session_id: z.string().uuid(),
  subscription_type: z.enum(['call', 'queue', 'agent', 'campaign', 'tenant']),
  subscription_id: z.string().uuid().optional(),
  event_types: z.array(z.string()).optional()
})), async (c) => {
  const { session_id, subscription_type, subscription_id, event_types } = c.req.valid('json');

  const result = await realtimeStreaming.subscribe(
    session_id,
    subscription_type,
    subscription_id,
    event_types
  );

  return c.json(result, 201);
});

/**
 * DELETE /v1/streaming/subscriptions
 * Unsubscribe from events
 */
router.delete('/subscriptions', zValidator('json', z.object({
  session_id: z.string().uuid(),
  subscription_type: z.enum(['call', 'queue', 'agent', 'campaign', 'tenant']),
  subscription_id: z.string().uuid().optional()
})), async (c) => {
  const { session_id, subscription_type, subscription_id } = c.req.valid('json');

  const result = await realtimeStreaming.unsubscribe(session_id, subscription_type, subscription_id);

  return c.json(result);
});

/**
 * POST /v1/streaming/subscribe/call/:callId
 * Quick subscribe to a specific call's transcript
 */
router.post('/subscribe/call/:callId', zValidator('json', z.object({
  session_id: z.string().uuid()
})), async (c) => {
  const { callId } = c.req.param();
  const { session_id } = c.req.valid('json');

  const result = await realtimeStreaming.subscribeToCall(session_id, callId);

  return c.json(result);
});

// ===========================================
// TRANSCRIPT ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/transcript/chunk
 * Record a transcript chunk (called by STT service)
 */
router.post('/transcript/chunk', zValidator('json', z.object({
  call_id: z.string().uuid(),
  speaker: z.enum(['agent', 'customer', 'unknown']).default('unknown'),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.95),
  start_time_ms: z.number().int().min(0),
  end_time_ms: z.number().int().min(0),
  is_final: z.boolean().default(false),
  word_timestamps: z.array(z.object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number().optional()
  })).optional(),
  language: z.string().default('en-US')
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  const chunk = await realtimeStreaming.recordTranscriptChunk(data.call_id, tenantId, {
    speaker: data.speaker,
    text: data.text,
    confidence: data.confidence,
    startTimeMs: data.start_time_ms,
    endTimeMs: data.end_time_ms,
    isFinal: data.is_final,
    wordTimestamps: data.word_timestamps,
    language: data.language
  });

  return c.json(chunk, 201);
});

/**
 * GET /v1/streaming/transcript/:callId
 * Get transcript chunks for a call
 */
router.get('/transcript/:callId', zValidator('query', z.object({
  since: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100)
})), async (c) => {
  const { callId } = c.req.param();
  const { since, limit } = c.req.valid('query');

  const chunks = await realtimeStreaming.getTranscriptChunks(callId, {
    since: since ? new Date(since) : null,
    limit
  });

  return c.json({ chunks });
});

/**
 * GET /v1/streaming/transcript/:callId/full
 * Get full transcript for a call
 */
router.get('/transcript/:callId/full', async (c) => {
  const { callId } = c.req.param();

  const transcript = await realtimeStreaming.getFullTranscript(callId);

  return c.json(transcript);
});

// ===========================================
// QUALITY METRICS ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/quality
 * Record quality metrics
 */
router.post('/quality', zValidator('json', z.object({
  call_id: z.string().uuid(),
  timestamp_ms: z.number().int().min(0),
  jitter_ms: z.number().optional(),
  packet_loss_pct: z.number().min(0).max(100).optional(),
  rtt_ms: z.number().optional(),
  mos_score: z.number().min(1).max(5).optional(),
  bitrate_kbps: z.number().int().optional(),
  audio_level_db: z.number().optional(),
  silence_pct: z.number().min(0).max(100).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  await realtimeStreaming.recordQualityMetrics(data.call_id, tenantId, {
    timestampMs: data.timestamp_ms,
    jitterMs: data.jitter_ms,
    packetLossPct: data.packet_loss_pct,
    rttMs: data.rtt_ms,
    mosScore: data.mos_score,
    bitrateKbps: data.bitrate_kbps,
    audioLevelDb: data.audio_level_db,
    silencePct: data.silence_pct
  });

  return c.json({ success: true });
});

/**
 * GET /v1/streaming/quality/:callId
 * Get quality metrics for a call
 */
router.get('/quality/:callId', zValidator('query', z.object({
  since_ms: z.coerce.number().optional()
})), async (c) => {
  const { callId } = c.req.param();
  const { since_ms } = c.req.valid('query');

  const metrics = await realtimeStreaming.getQualityMetrics(callId, { since: since_ms });

  return c.json({ metrics });
});

// ===========================================
// AGENT STATUS ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/agent/status
 * Record agent status change
 */
router.post('/agent/status', zValidator('json', z.object({
  agent_id: z.string().uuid(),
  previous_status: z.string().optional(),
  new_status: z.enum(['available', 'busy', 'away', 'offline', 'on_call', 'wrap_up']),
  status_reason: z.string().optional(),
  call_id: z.string().uuid().optional(),
  queue_id: z.string().uuid().optional(),
  duration_previous_ms: z.number().int().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  await realtimeStreaming.recordAgentStatusChange(tenantId, data.agent_id, {
    previousStatus: data.previous_status,
    newStatus: data.new_status,
    statusReason: data.status_reason,
    callId: data.call_id,
    queueId: data.queue_id,
    durationPreviousMs: data.duration_previous_ms
  });

  return c.json({ success: true });
});

/**
 * GET /v1/streaming/agent/statuses
 * Get current agent statuses
 */
router.get('/agent/statuses', async (c) => {
  const tenantId = c.get('tenantId');

  const statuses = await realtimeStreaming.getAgentStatuses(tenantId);

  return c.json({ statuses });
});

// ===========================================
// EVENT PUBLISHING ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/events
 * Publish a custom event
 */
router.post('/events', zValidator('json', z.object({
  event_type: z.string().min(1).max(100),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  payload: z.record(z.any()).default({}),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  broadcast_scope: z.enum(['tenant', 'user', 'call', 'queue', 'global']).default('tenant'),
  target_users: z.array(z.string().uuid()).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  const eventId = await realtimeStreaming.publishEvent(
    tenantId,
    data.event_type,
    data.entity_type,
    data.entity_id,
    data.payload,
    data.priority,
    data.broadcast_scope,
    data.target_users
  );

  return c.json({ event_id: eventId }, 201);
});

/**
 * GET /v1/streaming/events
 * Get recent events (for polling fallback)
 */
router.get('/events', zValidator('query', z.object({
  since: z.string().optional(),
  event_type: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { since, event_type, entity_type, entity_id, limit } = c.req.valid('query');

  let whereConditions = ['tenant_id = $1', 'expires_at > NOW()'];
  let params = [tenantId];
  let paramIndex = 2;

  if (since) {
    whereConditions.push(`created_at > $${paramIndex++}`);
    params.push(since);
  }
  if (event_type) {
    whereConditions.push(`event_type = $${paramIndex++}`);
    params.push(event_type);
  }
  if (entity_type) {
    whereConditions.push(`entity_type = $${paramIndex++}`);
    params.push(entity_type);
  }
  if (entity_id) {
    whereConditions.push(`entity_id = $${paramIndex++}`);
    params.push(entity_id);
  }

  const result = await db.query(`
    SELECT * FROM streaming_events
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex}
  `, [...params, limit]);

  return c.json({ events: result.rows });
});

// ===========================================
// CALL LIFECYCLE ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/call/started
 * Broadcast call started event
 */
router.post('/call/started', zValidator('json', z.object({
  call_id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  from: z.string(),
  to: z.string(),
  agent_id: z.string().uuid().optional(),
  queue_id: z.string().uuid().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  await realtimeStreaming.callStarted(tenantId, data.call_id, {
    direction: data.direction,
    from: data.from,
    to: data.to,
    agentId: data.agent_id,
    queueId: data.queue_id
  });

  return c.json({ success: true });
});

/**
 * POST /v1/streaming/call/ended
 * Broadcast call ended event
 */
router.post('/call/ended', zValidator('json', z.object({
  call_id: z.string().uuid(),
  duration: z.number().int().min(0),
  disposition: z.string().optional(),
  end_reason: z.string().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  await realtimeStreaming.callEnded(tenantId, data.call_id, {
    duration: data.duration,
    disposition: data.disposition,
    endReason: data.end_reason
  });

  return c.json({ success: true });
});

// ===========================================
// ANALYTICS ENDPOINTS
// ===========================================

/**
 * GET /v1/streaming/analytics
 * Get streaming analytics
 */
router.get('/analytics', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { days } = c.req.valid('query');

  const analytics = await realtimeStreaming.getAnalytics(tenantId, { days });

  return c.json(analytics);
});

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

/**
 * POST /v1/streaming/admin/cleanup
 * Clean up stale sessions (admin/cron)
 */
router.post('/admin/cleanup', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const staleSessions = await realtimeStreaming.cleanupStaleSessions();
  const oldData = await realtimeStreaming.cleanupOldData();

  return c.json({
    staleSessions,
    oldData
  });
});

/**
 * GET /v1/streaming/admin/stats
 * Get global streaming stats (admin)
 */
router.get('/admin/stats', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  // Current connections
  const connectionsResult = await db.query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT tenant_id) as tenants
    FROM streaming_sessions WHERE status = 'connected'
  `);

  // Today's stats
  const todayResult = await db.query(`
    SELECT
      SUM(total_messages) as total_messages,
      SUM(total_bytes) as total_bytes,
      SUM(total_sessions) as total_sessions,
      SUM(transcript_chunks_streamed) as transcript_chunks,
      SUM(quality_updates_streamed) as quality_updates
    FROM streaming_analytics
    WHERE date = CURRENT_DATE
  `);

  // Events by type (last hour)
  const eventsResult = await db.query(`
    SELECT event_type, COUNT(*) as count
    FROM streaming_events
    WHERE created_at > NOW() - INTERVAL '1 hour'
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 10
  `);

  return c.json({
    connections: connectionsResult.rows[0],
    today: todayResult.rows[0],
    recentEventTypes: eventsResult.rows
  });
});

export default router;
