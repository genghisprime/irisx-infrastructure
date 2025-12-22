/**
 * WebSocket Handler for Real-time Streaming
 * Handles WebSocket connections for transcripts, events, and metrics
 */

import { randomUUID } from 'crypto';
import realtimeStreaming from '../services/realtime-streaming.js';

class StreamingWebSocketHandler {
  constructor() {
    this.pingInterval = 30000; // 30 seconds
    this.pingTimers = new Map();
  }

  /**
   * Handle WebSocket upgrade
   * @param {WebSocket} ws - WebSocket instance
   * @param {Request} req - HTTP request (for getting query params)
   */
  async handleConnection(ws, req) {
    const connectionId = randomUUID();
    let session = null;

    try {
      // Get session token from query string
      const url = new URL(req.url, 'http://localhost');
      const sessionToken = url.searchParams.get('token');

      if (!sessionToken) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Missing session token',
          code: 'AUTH_REQUIRED'
        }));
        ws.close(4001, 'Missing session token');
        return;
      }

      // Validate and connect session
      session = await realtimeStreaming.connectSession(sessionToken, connectionId, ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        connectionId,
        sessionId: session.id,
        streamTypes: session.streamTypes,
        timestamp: new Date().toISOString()
      }));

      // Start ping timer
      this.startPingTimer(connectionId, ws);

      // Set up message handler
      ws.on('message', async (data) => {
        await this.handleMessage(connectionId, session, data);
      });

      // Set up close handler
      ws.on('close', async () => {
        await this.handleClose(connectionId, sessionToken);
      });

      // Set up error handler
      ws.on('error', (error) => {
        console.error(`WebSocket error for ${connectionId}:`, error.message);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        code: 'CONNECTION_FAILED'
      }));
      ws.close(4002, error.message);
    }
  }

  /**
   * Handle incoming message
   */
  async handleMessage(connectionId, session, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, ...payload } = message;

      switch (type) {
        case 'ping':
          await this.handlePing(connectionId, session);
          break;

        case 'subscribe':
          await this.handleSubscribe(connectionId, session, payload);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(connectionId, session, payload);
          break;

        case 'subscribe_call':
          await this.handleSubscribeCall(connectionId, session, payload);
          break;

        case 'get_transcript':
          await this.handleGetTranscript(connectionId, session, payload);
          break;

        case 'get_quality':
          await this.handleGetQuality(connectionId, session, payload);
          break;

        default:
          this.sendToConnection(connectionId, {
            type: 'error',
            error: `Unknown message type: ${type}`,
            code: 'UNKNOWN_TYPE'
          });
      }
    } catch (error) {
      console.error(`Message handling error for ${connectionId}:`, error.message);
      this.sendToConnection(connectionId, {
        type: 'error',
        error: 'Invalid message format',
        code: 'INVALID_MESSAGE'
      });
    }
  }

  /**
   * Handle ping message
   */
  async handlePing(connectionId, session) {
    const conn = realtimeStreaming.connections.get(connectionId);
    if (conn && conn.ws) {
      conn.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
    }

    // Update heartbeat
    if (session) {
      await realtimeStreaming.heartbeat(session.sessionToken);
    }
  }

  /**
   * Handle subscribe message
   */
  async handleSubscribe(connectionId, session, payload) {
    const { subscription_type, subscription_id, event_types } = payload;

    await realtimeStreaming.subscribe(
      session.id,
      subscription_type,
      subscription_id,
      event_types
    );

    this.sendToConnection(connectionId, {
      type: 'subscribed',
      subscriptionType: subscription_type,
      subscriptionId: subscription_id
    });
  }

  /**
   * Handle unsubscribe message
   */
  async handleUnsubscribe(connectionId, session, payload) {
    const { subscription_type, subscription_id } = payload;

    await realtimeStreaming.unsubscribe(session.id, subscription_type, subscription_id);

    this.sendToConnection(connectionId, {
      type: 'unsubscribed',
      subscriptionType: subscription_type,
      subscriptionId: subscription_id
    });
  }

  /**
   * Handle subscribe to specific call
   */
  async handleSubscribeCall(connectionId, session, payload) {
    const { call_id } = payload;

    await realtimeStreaming.subscribeToCall(session.id, call_id);

    // Send existing transcript chunks
    const chunks = await realtimeStreaming.getTranscriptChunks(call_id);

    this.sendToConnection(connectionId, {
      type: 'call_subscribed',
      callId: call_id,
      existingChunks: chunks.length
    });

    // Stream existing chunks
    for (const chunk of chunks) {
      this.sendToConnection(connectionId, {
        type: 'event',
        eventType: 'transcript.chunk',
        entityType: 'call',
        entityId: call_id,
        payload: {
          chunkId: chunk.id,
          chunkIndex: chunk.chunk_index,
          speaker: chunk.speaker,
          text: chunk.text,
          confidence: chunk.confidence,
          startTimeMs: chunk.start_time_ms,
          endTimeMs: chunk.end_time_ms,
          isFinal: chunk.is_final
        },
        timestamp: chunk.created_at
      });
    }
  }

  /**
   * Handle get transcript request
   */
  async handleGetTranscript(connectionId, session, payload) {
    const { call_id, since } = payload;

    const chunks = await realtimeStreaming.getTranscriptChunks(call_id, {
      since: since ? new Date(since) : null
    });

    this.sendToConnection(connectionId, {
      type: 'transcript',
      callId: call_id,
      chunks
    });
  }

  /**
   * Handle get quality request
   */
  async handleGetQuality(connectionId, session, payload) {
    const { call_id, since_ms } = payload;

    const metrics = await realtimeStreaming.getQualityMetrics(call_id, { since: since_ms });

    this.sendToConnection(connectionId, {
      type: 'quality_metrics',
      callId: call_id,
      metrics
    });
  }

  /**
   * Handle connection close
   */
  async handleClose(connectionId, sessionToken) {
    // Stop ping timer
    this.stopPingTimer(connectionId);

    // Disconnect session
    await realtimeStreaming.disconnectSession(connectionId);

    console.log(`WebSocket disconnected: ${connectionId}`);
  }

  /**
   * Send message to connection
   */
  sendToConnection(connectionId, message) {
    const conn = realtimeStreaming.connections.get(connectionId);
    if (conn && conn.ws && conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start ping timer for connection
   */
  startPingTimer(connectionId, ws) {
    const timer = setInterval(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'server_ping',
          timestamp: new Date().toISOString()
        }));
      } else {
        this.stopPingTimer(connectionId);
      }
    }, this.pingInterval);

    this.pingTimers.set(connectionId, timer);
  }

  /**
   * Stop ping timer for connection
   */
  stopPingTimer(connectionId) {
    const timer = this.pingTimers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.pingTimers.delete(connectionId);
    }
  }
}

export default new StreamingWebSocketHandler();
