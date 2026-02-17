/**
 * Video Signaling WebSocket Server
 * Initializes WebSocket server for video call signaling
 */

import pkg from 'ws';
const { WebSocketServer } = pkg;
import videoSignalingHandler from '../websocket/video-signaling-handler.js';

let wss = null;

/**
 * Initialize video signaling WebSocket server
 * @param {http.Server} server - HTTP server to attach to
 * @param {string} path - WebSocket path
 */
export function initVideoSignalingWebSocket(server, path = '/ws/video') {
    wss = new WebSocketServer({
        server,
        path,
        clientTracking: true,
        perMessageDeflate: {
            zlibDeflateOptions: {
                chunkSize: 1024,
                memLevel: 7,
                level: 3
            },
            zlibInflateOptions: {
                chunkSize: 10 * 1024
            },
            clientNoContextTakeover: true,
            serverNoContextTakeover: true,
            serverMaxWindowBits: 10,
            concurrencyLimit: 10,
            threshold: 1024
        }
    });

    wss.on('connection', async (ws, req) => {
        console.log(`[VideoSignaling] New connection from ${req.socket.remoteAddress}`);

        try {
            await videoSignalingHandler.handleConnection(ws, req);
        } catch (error) {
            console.error('[VideoSignaling] Connection handler error:', error);
            ws.close(4000, 'Internal error');
        }
    });

    wss.on('error', (error) => {
        console.error('[VideoSignaling] WebSocket server error:', error);
    });

    console.log(`[VideoSignaling] WebSocket server initialized on ${path}`);

    return wss;
}

/**
 * Get WebSocket server instance
 */
export function getVideoSignalingWSS() {
    return wss;
}

/**
 * Broadcast message to all connections in a room
 * @param {string} roomId - Room ID
 * @param {object} message - Message to broadcast
 */
export function broadcastToRoom(roomId, message) {
    videoSignalingHandler.broadcastToRoom(roomId, message);
}

/**
 * Get connected client count
 */
export function getConnectedClientCount() {
    return wss?.clients?.size || 0;
}

export default {
    initVideoSignalingWebSocket,
    getVideoSignalingWSS,
    broadcastToRoom,
    getConnectedClientCount
};
