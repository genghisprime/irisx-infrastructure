/**
 * Real-time Streaming Service
 * WebSocket-based streaming for transcripts, events, and metrics
 */

import db from '../db.js';
import { randomUUID } from 'crypto';

class RealtimeStreamingService {
  constructor() {
    this.connections = new Map(); // connectionId -> WebSocket
    this.sessions = new Map(); // sessionToken -> sessionInfo
    this.subscriptions = new Map(); // sessionId -> Set of subscription keys
    this.listeners = []; // PostgreSQL LISTEN connections
  }

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================

  /**
   * Create a new streaming session
   */
  async createSession(tenantId, userId, streamTypes = ['transcript'], clientInfo = {}) {
    const sessionToken = randomUUID();

    const result = await db.query(`
      INSERT INTO streaming_sessions (
        tenant_id, user_id, session_token, stream_types, client_info
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tenantId, userId, sessionToken, streamTypes, clientInfo]);

    const session = result.rows[0];
    this.sessions.set(sessionToken, {
      id: session.id,
      tenantId,
      userId,
      streamTypes,
      callId: null
    });

    return {
      sessionId: session.id,
      sessionToken,
      streamTypes
    };
  }

  /**
   * Validate session token
   */
  async validateSession(sessionToken) {
    // Check memory cache first
    if (this.sessions.has(sessionToken)) {
      return this.sessions.get(sessionToken);
    }

    // Check database
    const result = await db.query(`
      SELECT id, tenant_id, user_id, stream_types, call_id, status
      FROM streaming_sessions
      WHERE session_token = $1 AND status = 'connected'
    `, [sessionToken]);

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    const sessionInfo = {
      id: session.id,
      tenantId: session.tenant_id,
      userId: session.user_id,
      streamTypes: session.stream_types,
      callId: session.call_id
    };

    this.sessions.set(sessionToken, sessionInfo);
    return sessionInfo;
  }

  /**
   * Connect WebSocket to session
   */
  async connectSession(sessionToken, connectionId, ws) {
    const session = await this.validateSession(sessionToken);
    if (!session) {
      throw new Error('Invalid session token');
    }

    // Store connection
    this.connections.set(connectionId, {
      ws,
      sessionId: session.id,
      sessionToken,
      tenantId: session.tenantId,
      userId: session.userId
    });

    // Update database
    await db.query(`
      UPDATE streaming_sessions
      SET connection_id = $1, status = 'connected', last_heartbeat = NOW()
      WHERE session_token = $2
    `, [connectionId, sessionToken]);

    return session;
  }

  /**
   * Disconnect session
   */
  async disconnectSession(connectionId) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    // Update database
    await db.query(`
      UPDATE streaming_sessions
      SET status = 'disconnected', disconnected_at = NOW()
      WHERE connection_id = $1
    `, [connectionId]);

    // Remove from memory
    this.sessions.delete(conn.sessionToken);
    this.connections.delete(connectionId);
    this.subscriptions.delete(conn.sessionId);
  }

  /**
   * Update heartbeat
   */
  async heartbeat(sessionToken) {
    await db.query(`
      UPDATE streaming_sessions
      SET last_heartbeat = NOW()
      WHERE session_token = $1
    `, [sessionToken]);
  }

  // ===========================================
  // SUBSCRIPTIONS
  // ===========================================

  /**
   * Subscribe to events
   */
  async subscribe(sessionId, subscriptionType, subscriptionId = null, eventTypes = null) {
    await db.query(`
      INSERT INTO streaming_subscriptions (session_id, subscription_type, subscription_id, event_types)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [sessionId, subscriptionType, subscriptionId, eventTypes]);

    // Update memory cache
    if (!this.subscriptions.has(sessionId)) {
      this.subscriptions.set(sessionId, new Set());
    }
    const key = `${subscriptionType}:${subscriptionId || '*'}`;
    this.subscriptions.get(sessionId).add(key);

    return { subscribed: true, type: subscriptionType, id: subscriptionId };
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(sessionId, subscriptionType, subscriptionId = null) {
    if (subscriptionId) {
      await db.query(`
        DELETE FROM streaming_subscriptions
        WHERE session_id = $1 AND subscription_type = $2 AND subscription_id = $3
      `, [sessionId, subscriptionType, subscriptionId]);
    } else {
      await db.query(`
        DELETE FROM streaming_subscriptions
        WHERE session_id = $1 AND subscription_type = $2
      `, [sessionId, subscriptionType]);
    }

    // Update memory cache
    if (this.subscriptions.has(sessionId)) {
      const key = `${subscriptionType}:${subscriptionId || '*'}`;
      this.subscriptions.get(sessionId).delete(key);
    }

    return { unsubscribed: true };
  }

  /**
   * Subscribe to a specific call's transcript
   */
  async subscribeToCall(sessionId, callId) {
    await this.subscribe(sessionId, 'call', callId, ['transcript.chunk', 'quality.update', 'call.ended']);

    // Update session with call_id
    await db.query(`
      UPDATE streaming_sessions SET call_id = $1 WHERE id = $2
    `, [callId, sessionId]);

    return { subscribed: true, callId };
  }

  // ===========================================
  // TRANSCRIPT STREAMING
  // ===========================================

  /**
   * Record and broadcast transcript chunk
   */
  async recordTranscriptChunk(callId, tenantId, {
    speaker = 'unknown',
    text,
    confidence = 0.95,
    startTimeMs,
    endTimeMs,
    isFinal = false,
    wordTimestamps = null,
    language = 'en-US'
  }) {
    // Get next chunk index
    const indexResult = await db.query(`
      SELECT COALESCE(MAX(chunk_index), -1) + 1 as next_index
      FROM transcript_chunks WHERE call_id = $1
    `, [callId]);
    const chunkIndex = indexResult.rows[0].next_index;

    // Insert chunk
    const result = await db.query(`
      INSERT INTO transcript_chunks (
        call_id, tenant_id, chunk_index, speaker, text, confidence,
        start_time_ms, end_time_ms, is_final, word_timestamps, language
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      callId, tenantId, chunkIndex, speaker, text, confidence,
      startTimeMs, endTimeMs, isFinal, wordTimestamps, language
    ]);

    const chunk = result.rows[0];

    // Publish event
    await this.publishEvent(tenantId, 'transcript.chunk', 'call', callId, {
      chunkId: chunk.id,
      chunkIndex,
      speaker,
      text,
      confidence,
      startTimeMs,
      endTimeMs,
      isFinal,
      language
    }, 'normal', 'call');

    return chunk;
  }

  /**
   * Get transcript chunks for a call
   */
  async getTranscriptChunks(callId, { since = null, limit = 100 } = {}) {
    let query = `
      SELECT * FROM transcript_chunks
      WHERE call_id = $1
    `;
    const params = [callId];

    if (since) {
      query += ` AND created_at > $2`;
      params.push(since);
    }

    query += ` ORDER BY chunk_index ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get full transcript for a call
   */
  async getFullTranscript(callId) {
    const result = await db.query(`
      SELECT * FROM transcript_chunks
      WHERE call_id = $1 AND is_final = true
      ORDER BY chunk_index ASC
    `, [callId]);

    const chunks = result.rows;
    const fullText = chunks.map(c => `[${c.speaker}]: ${c.text}`).join('\n');

    return {
      callId,
      chunkCount: chunks.length,
      fullText,
      chunks,
      duration: chunks.length > 0
        ? chunks[chunks.length - 1].end_time_ms
        : 0
    };
  }

  // ===========================================
  // EVENT PUBLISHING
  // ===========================================

  /**
   * Publish streaming event
   */
  async publishEvent(tenantId, eventType, entityType, entityId, payload, priority = 'normal', broadcastScope = 'tenant', targetUsers = null) {
    const result = await db.query(`
      INSERT INTO streaming_events (
        tenant_id, event_type, entity_type, entity_id, payload,
        priority, broadcast_scope, target_users
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [tenantId, eventType, entityType, entityId, payload, priority, broadcastScope, targetUsers]);

    const eventId = result.rows[0].id;

    // Broadcast to connected clients
    await this.broadcastEvent({
      id: eventId,
      tenantId,
      eventType,
      entityType,
      entityId,
      payload,
      priority,
      broadcastScope,
      targetUsers
    });

    return eventId;
  }

  /**
   * Broadcast event to connected clients
   */
  async broadcastEvent(event) {
    const { tenantId, eventType, entityType, entityId, payload, broadcastScope, targetUsers } = event;

    const message = JSON.stringify({
      type: 'event',
      eventType,
      entityType,
      entityId,
      payload,
      timestamp: new Date().toISOString()
    });

    let sent = 0;

    for (const [connectionId, conn] of this.connections) {
      // Check if this connection should receive the event
      if (!this.shouldReceiveEvent(conn, event)) {
        continue;
      }

      try {
        if (conn.ws && conn.ws.readyState === 1) { // WebSocket.OPEN
          conn.ws.send(message);
          sent++;
        }
      } catch (err) {
        console.error(`Failed to send to ${connectionId}:`, err.message);
      }
    }

    // Update analytics
    if (sent > 0) {
      await this.updateAnalytics(tenantId, { messages: sent, bytes: message.length * sent });
    }

    return { sent };
  }

  /**
   * Check if connection should receive event
   */
  shouldReceiveEvent(conn, event) {
    const { tenantId, broadcastScope, targetUsers, entityType, entityId } = event;

    // Global events go to everyone
    if (broadcastScope === 'global') return true;

    // Tenant scope - must match tenant
    if (broadcastScope === 'tenant' && conn.tenantId !== tenantId) return false;

    // User scope - must be in target users
    if (broadcastScope === 'user') {
      if (!targetUsers || !targetUsers.includes(conn.userId)) return false;
    }

    // Entity scope (call, queue, etc.) - must be subscribed
    if (broadcastScope === 'call' || broadcastScope === 'queue') {
      const subs = this.subscriptions.get(conn.sessionId);
      if (!subs) return false;

      const hasSubscription =
        subs.has(`${entityType}:${entityId}`) ||
        subs.has(`${entityType}:*`);

      if (!hasSubscription) return false;
    }

    return true;
  }

  // ===========================================
  // QUALITY METRICS STREAMING
  // ===========================================

  /**
   * Record and broadcast quality metrics
   */
  async recordQualityMetrics(callId, tenantId, {
    timestampMs,
    jitterMs,
    packetLossPct,
    rttMs,
    mosScore,
    bitrateKbps,
    audioLevelDb,
    silencePct
  }) {
    await db.query(`
      INSERT INTO quality_metrics_stream (
        call_id, tenant_id, timestamp_ms, jitter_ms, packet_loss_pct,
        rtt_ms, mos_score, bitrate_kbps, audio_level_db, silence_pct
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      callId, tenantId, timestampMs, jitterMs, packetLossPct,
      rttMs, mosScore, bitrateKbps, audioLevelDb, silencePct
    ]);

    // Broadcast quality update
    await this.publishEvent(tenantId, 'quality.update', 'call', callId, {
      timestampMs,
      jitterMs,
      packetLossPct,
      rttMs,
      mosScore,
      bitrateKbps,
      audioLevelDb
    }, 'low', 'call');
  }

  /**
   * Get quality metrics for a call
   */
  async getQualityMetrics(callId, { since = null } = {}) {
    let query = `
      SELECT * FROM quality_metrics_stream
      WHERE call_id = $1
    `;
    const params = [callId];

    if (since) {
      query += ` AND timestamp_ms > $2`;
      params.push(since);
    }

    query += ` ORDER BY timestamp_ms ASC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // ===========================================
  // AGENT STATUS STREAMING
  // ===========================================

  /**
   * Record and broadcast agent status change
   */
  async recordAgentStatusChange(tenantId, agentId, {
    previousStatus,
    newStatus,
    statusReason = null,
    callId = null,
    queueId = null,
    durationPreviousMs = null
  }) {
    await db.query(`
      INSERT INTO agent_status_stream (
        tenant_id, agent_id, previous_status, new_status,
        status_reason, call_id, queue_id, duration_previous_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      tenantId, agentId, previousStatus, newStatus,
      statusReason, callId, queueId, durationPreviousMs
    ]);

    // Broadcast status change
    await this.publishEvent(tenantId, 'agent.status', 'agent', agentId, {
      previousStatus,
      newStatus,
      statusReason,
      callId,
      queueId
    }, 'normal', 'tenant');
  }

  /**
   * Get current agent statuses for tenant
   */
  async getAgentStatuses(tenantId) {
    const result = await db.query(`
      SELECT DISTINCT ON (agent_id)
        agent_id, new_status as status, status_reason, call_id, queue_id, created_at
      FROM agent_status_stream
      WHERE tenant_id = $1
      ORDER BY agent_id, created_at DESC
    `, [tenantId]);

    return result.rows;
  }

  // ===========================================
  // CALL EVENTS
  // ===========================================

  /**
   * Broadcast call started event
   */
  async callStarted(tenantId, callId, callInfo) {
    await this.publishEvent(tenantId, 'call.started', 'call', callId, {
      callId,
      direction: callInfo.direction,
      from: callInfo.from,
      to: callInfo.to,
      agentId: callInfo.agentId,
      queueId: callInfo.queueId,
      startedAt: new Date().toISOString()
    }, 'high', 'tenant');
  }

  /**
   * Broadcast call ended event
   */
  async callEnded(tenantId, callId, callInfo) {
    await this.publishEvent(tenantId, 'call.ended', 'call', callId, {
      callId,
      duration: callInfo.duration,
      disposition: callInfo.disposition,
      endReason: callInfo.endReason,
      endedAt: new Date().toISOString()
    }, 'high', 'tenant');
  }

  // ===========================================
  // ANALYTICS
  // ===========================================

  /**
   * Update streaming analytics
   */
  async updateAnalytics(tenantId, { messages = 0, bytes = 0, transcriptChunks = 0, qualityUpdates = 0, eventUpdates = 0 }) {
    await db.query(`
      INSERT INTO streaming_analytics (tenant_id, date, total_messages, total_bytes, transcript_chunks_streamed, quality_updates_streamed, event_updates_streamed)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, date) DO UPDATE SET
        total_messages = streaming_analytics.total_messages + $2,
        total_bytes = streaming_analytics.total_bytes + $3,
        transcript_chunks_streamed = streaming_analytics.transcript_chunks_streamed + $4,
        quality_updates_streamed = streaming_analytics.quality_updates_streamed + $5,
        event_updates_streamed = streaming_analytics.event_updates_streamed + $6,
        updated_at = NOW()
    `, [tenantId, messages, bytes, transcriptChunks, qualityUpdates, eventUpdates]);
  }

  /**
   * Get streaming analytics
   */
  async getAnalytics(tenantId, { days = 7 } = {}) {
    const result = await db.query(`
      SELECT * FROM streaming_analytics
      WHERE tenant_id = $1 AND date >= CURRENT_DATE - $2::INTEGER
      ORDER BY date DESC
    `, [tenantId, days]);

    // Current connections count
    const connectionCount = Array.from(this.connections.values())
      .filter(c => c.tenantId === tenantId).length;

    return {
      currentConnections: connectionCount,
      dailyStats: result.rows
    };
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(tenantId = null) {
    let query = `
      SELECT
        ss.*,
        u.email as user_email,
        u.full_name as user_name
      FROM streaming_sessions ss
      JOIN users u ON u.id = ss.user_id
      WHERE ss.status = 'connected'
    `;
    const params = [];

    if (tenantId) {
      query += ` AND ss.tenant_id = $1`;
      params.push(tenantId);
    }

    query += ` ORDER BY ss.connected_at DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  /**
   * Clean up stale sessions (no heartbeat for 5 minutes)
   */
  async cleanupStaleSessions() {
    const result = await db.query(`
      UPDATE streaming_sessions
      SET status = 'disconnected', disconnected_at = NOW()
      WHERE status = 'connected'
        AND last_heartbeat < NOW() - INTERVAL '5 minutes'
      RETURNING session_token
    `);

    // Remove from memory
    for (const row of result.rows) {
      this.sessions.delete(row.session_token);

      // Find and remove connection
      for (const [connId, conn] of this.connections) {
        if (conn.sessionToken === row.session_token) {
          this.connections.delete(connId);
          break;
        }
      }
    }

    return { cleaned: result.rowCount };
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(retentionDays = 7) {
    const result = await db.query(`SELECT * FROM cleanup_streaming_data($1)`, [retentionDays]);
    return result.rows[0];
  }
}

export default new RealtimeStreamingService();
