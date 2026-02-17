/**
 * Streaming WebSocket Service
 * Initializes WebSocket server for real-time transcript and event streaming
 */

import pkg from 'ws';
const { WebSocketServer } = pkg;
import streamingHandler from '../websocket/streaming-handler.js';

let wss = null;

/**
 * Initialize WebSocket server for streaming
 */
export function initStreamingWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/streaming'
  });

  wss.on('connection', async (ws, req) => {
    try {
      await streamingHandler.handleConnection(ws, req);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(4000, 'Connection failed');
    }
  });

  wss.on('error', (error) => {
    console.error('Streaming WebSocket server error:', error);
  });

  // Cleanup stale sessions every minute
  setInterval(async () => {
    try {
      const { default: realtimeStreaming } = await import('./realtime-streaming.js');
      await realtimeStreaming.cleanupStaleSessions();
    } catch (error) {
      console.error('Stale session cleanup error:', error);
    }
  }, 60000);

  console.log('✓ Streaming WebSocket server ready');

  return wss;
}

/**
 * Get WebSocket server instance
 */
export function getStreamingWSS() {
  return wss;
}

/**
 * Broadcast message to all connected clients
 */
export function broadcastToAll(message) {
  if (!wss) return;

  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(messageStr);
    }
  });
}

/**
 * Get connection count
 */
export function getConnectionCount() {
  return wss ? wss.clients.size : 0;
}

export default {
  initStreamingWebSocket,
  getStreamingWSS,
  broadcastToAll,
  getConnectionCount
};
