/**
 * WebSocket Service for Real-Time Import Progress
 *
 * Provides real-time updates for import job progress
 * Clients connect and subscribe to specific job IDs
 */

import * as wsModule from 'ws';
const { WebSocketServer } = wsModule;

let wss = null;

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/imports'
  });

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');

    ws.isAlive = true;
    ws.subscribedJobs = new Set();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'subscribe' && data.jobId) {
          ws.subscribedJobs.add(data.jobId);
          console.log(`[WebSocket] Client subscribed to job ${data.jobId}`);

          // Send acknowledgment
          ws.send(JSON.stringify({
            type: 'subscribed',
            jobId: data.jobId
          }));
        }

        if (data.type === 'unsubscribe' && data.jobId) {
          ws.subscribedJobs.delete(data.jobId);
          console.log(`[WebSocket] Client unsubscribed from job ${data.jobId}`);
        }
      } catch (error) {
        console.error('[WebSocket] Message parse error:', error);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  // Heartbeat to detect dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // Every 30 seconds

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  console.log('[WebSocket] Server initialized on /ws/imports');
}

/**
 * Broadcast import progress update to subscribed clients
 */
export function broadcastImportProgress(jobId, progressData) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'progress',
    jobId,
    data: progressData
  });

  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.subscribedJobs?.has(jobId)) {
      client.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    console.log(`[WebSocket] Broadcast to ${sentCount} clients for job ${jobId}`);
  }
}

/**
 * Broadcast import completion
 */
export function broadcastImportComplete(jobId, finalData) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'completed',
    jobId,
    data: finalData
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.subscribedJobs?.has(jobId)) {
      client.send(message);
    }
  });

  console.log(`[WebSocket] Broadcast completion for job ${jobId}`);
}

/**
 * Broadcast import failure
 */
export function broadcastImportFailed(jobId, error) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'failed',
    jobId,
    error
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.subscribedJobs?.has(jobId)) {
      client.send(message);
    }
  });

  console.log(`[WebSocket] Broadcast failure for job ${jobId}`);
}

export default {
  initWebSocket,
  broadcastImportProgress,
  broadcastImportComplete,
  broadcastImportFailed
};
