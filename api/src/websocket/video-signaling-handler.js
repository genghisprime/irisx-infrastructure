/**
 * WebSocket Handler for Video Call Signaling
 * Handles WebRTC signaling for MediaSoup-based video calls
 */

import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import mediasoupService from '../services/mediasoup.js';
import { pool } from '../database.js';

class VideoSignalingHandler {
    constructor() {
        this.pingInterval = 30000; // 30 seconds
        this.pingTimers = new Map();
        this.connections = new Map(); // connectionId -> { ws, userId, tenantId, roomId, participantId }
        this.roomConnections = new Map(); // roomId -> Set<connectionId>
    }

    /**
     * Handle WebSocket upgrade for video signaling
     * @param {WebSocket} ws - WebSocket instance
     * @param {Request} req - HTTP request
     */
    async handleConnection(ws, req) {
        const connectionId = randomUUID();

        try {
            // Get auth token from query string
            const url = new URL(req.url, 'http://localhost');
            const token = url.searchParams.get('token');
            const roomId = url.searchParams.get('roomId');

            if (!token) {
                this.sendError(ws, 'Missing authentication token', 'AUTH_REQUIRED');
                ws.close(4001, 'Missing authentication token');
                return;
            }

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId;
            const tenantId = decoded.tenantId;

            if (!userId || !tenantId) {
                this.sendError(ws, 'Invalid token', 'INVALID_TOKEN');
                ws.close(4001, 'Invalid token');
                return;
            }

            // Store connection info
            this.connections.set(connectionId, {
                ws,
                userId,
                tenantId,
                roomId: null,
                participantId: null
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'connected',
                connectionId,
                userId,
                timestamp: new Date().toISOString()
            }));

            // Start ping timer
            this.startPingTimer(connectionId, ws);

            // Set up message handler
            ws.on('message', async (data) => {
                await this.handleMessage(connectionId, data);
            });

            // Set up close handler
            ws.on('close', async () => {
                await this.handleClose(connectionId);
            });

            // Set up error handler
            ws.on('error', (error) => {
                console.error(`[VideoSignaling] WebSocket error for ${connectionId}:`, error.message);
            });

            // If roomId was provided, auto-join
            if (roomId) {
                await this.handleJoinRoom(connectionId, { roomId });
            }

        } catch (error) {
            console.error('[VideoSignaling] Connection error:', error.message);
            this.sendError(ws, error.message, 'CONNECTION_FAILED');
            ws.close(4002, error.message);
        }
    }

    /**
     * Handle incoming WebSocket message
     */
    async handleMessage(connectionId, data) {
        const conn = this.connections.get(connectionId);
        if (!conn) return;

        try {
            const message = JSON.parse(data.toString());
            const { type, ...payload } = message;

            switch (type) {
                case 'ping':
                    this.handlePing(connectionId);
                    break;

                case 'joinRoom':
                    await this.handleJoinRoom(connectionId, payload);
                    break;

                case 'leaveRoom':
                    await this.handleLeaveRoom(connectionId);
                    break;

                case 'getRouterRtpCapabilities':
                    await this.handleGetRouterCapabilities(connectionId);
                    break;

                case 'createTransport':
                    await this.handleCreateTransport(connectionId, payload);
                    break;

                case 'connectTransport':
                    await this.handleConnectTransport(connectionId, payload);
                    break;

                case 'produce':
                    await this.handleProduce(connectionId, payload);
                    break;

                case 'consume':
                    await this.handleConsume(connectionId, payload);
                    break;

                case 'resumeConsumer':
                    await this.handleResumeConsumer(connectionId, payload);
                    break;

                case 'pauseProducer':
                    await this.handlePauseProducer(connectionId, payload);
                    break;

                case 'resumeProducer':
                    await this.handleResumeProducer(connectionId, payload);
                    break;

                case 'closeProducer':
                    await this.handleCloseProducer(connectionId, payload);
                    break;

                case 'updateMediaState':
                    await this.handleUpdateMediaState(connectionId, payload);
                    break;

                case 'raiseHand':
                    await this.handleRaiseHand(connectionId, payload);
                    break;

                case 'chat':
                    await this.handleChat(connectionId, payload);
                    break;

                case 'kickParticipant':
                    await this.handleKickParticipant(connectionId, payload);
                    break;

                case 'stats':
                    await this.handleStats(connectionId, payload);
                    break;

                default:
                    this.send(connectionId, {
                        type: 'error',
                        error: `Unknown message type: ${type}`,
                        code: 'UNKNOWN_MESSAGE'
                    });
            }
        } catch (error) {
            console.error('[VideoSignaling] Message handling error:', error.message);
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'MESSAGE_ERROR'
            });
        }
    }

    /**
     * Handle joining a video room
     */
    async handleJoinRoom(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn) return;

        const { roomId, displayName, deviceInfo } = payload;

        try {
            // Join the room
            const participant = await mediasoupService.joinRoom(
                roomId,
                conn.userId,
                conn.tenantId,
                {
                    displayName: displayName || 'Participant',
                    deviceInfo
                }
            );

            // Update connection
            conn.roomId = roomId;
            conn.participantId = participant.id;

            // Add to room connections
            if (!this.roomConnections.has(roomId)) {
                this.roomConnections.set(roomId, new Set());
            }
            this.roomConnections.get(roomId).add(connectionId);

            // Get room info and participants
            const room = await mediasoupService.getRoom(roomId);
            const participants = await mediasoupService.getRoomParticipants(roomId);
            const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities(roomId);

            // Update participant as connected
            await mediasoupService.updateParticipantStatus(participant.id, {
                status: 'connected',
                joined_at: new Date()
            });

            // Notify the joining participant
            this.send(connectionId, {
                type: 'joinedRoom',
                roomId,
                participantId: participant.id,
                room: {
                    id: room.id,
                    name: room.name,
                    roomCode: room.room_code,
                    settings: room.settings,
                    createdBy: room.created_by
                },
                participants: participants.map(p => ({
                    id: p.id,
                    displayName: p.display_name,
                    role: p.role,
                    isAudioEnabled: p.is_audio_enabled,
                    isVideoEnabled: p.is_video_enabled,
                    isScreensharing: p.is_screensharing,
                    isHandRaised: p.is_hand_raised
                })),
                rtpCapabilities
            });

            // Notify other participants
            this.broadcastToRoom(roomId, {
                type: 'participantJoined',
                participant: {
                    id: participant.id,
                    displayName: participant.display_name,
                    role: participant.role,
                    isAudioEnabled: participant.is_audio_enabled,
                    isVideoEnabled: participant.is_video_enabled
                }
            }, connectionId);

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'JOIN_FAILED'
            });
        }
    }

    /**
     * Handle leaving a room
     */
    async handleLeaveRoom(connectionId) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { roomId, participantId } = conn;

        try {
            // Leave the room
            await mediasoupService.leaveRoom(participantId);

            // Remove from room connections
            const roomConns = this.roomConnections.get(roomId);
            if (roomConns) {
                roomConns.delete(connectionId);
                if (roomConns.size === 0) {
                    this.roomConnections.delete(roomId);
                }
            }

            // Notify other participants
            this.broadcastToRoom(roomId, {
                type: 'participantLeft',
                participantId
            }, connectionId);

            // Update connection
            conn.roomId = null;
            conn.participantId = null;

            this.send(connectionId, {
                type: 'leftRoom',
                roomId
            });

        } catch (error) {
            console.error('[VideoSignaling] Leave room error:', error.message);
        }
    }

    /**
     * Get router RTP capabilities
     */
    async handleGetRouterCapabilities(connectionId) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) {
            this.send(connectionId, { type: 'error', error: 'Not in a room', code: 'NOT_IN_ROOM' });
            return;
        }

        const rtpCapabilities = await mediasoupService.getRouterRtpCapabilities(conn.roomId);

        this.send(connectionId, {
            type: 'routerRtpCapabilities',
            rtpCapabilities
        });
    }

    /**
     * Create WebRTC transport
     */
    async handleCreateTransport(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) {
            this.send(connectionId, { type: 'error', error: 'Not in a room', code: 'NOT_IN_ROOM' });
            return;
        }

        const { direction } = payload;

        try {
            const transport = await mediasoupService.createTransport(
                conn.roomId,
                conn.participantId,
                direction
            );

            this.send(connectionId, {
                type: 'transportCreated',
                direction,
                ...transport
            });

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'TRANSPORT_CREATE_FAILED'
            });
        }
    }

    /**
     * Connect transport (DTLS handshake)
     */
    async handleConnectTransport(connectionId, payload) {
        const { transportId, dtlsParameters } = payload;

        try {
            await mediasoupService.connectTransport(transportId, dtlsParameters);

            this.send(connectionId, {
                type: 'transportConnected',
                transportId
            });

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'TRANSPORT_CONNECT_FAILED'
            });
        }
    }

    /**
     * Handle produce (send media)
     */
    async handleProduce(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) {
            this.send(connectionId, { type: 'error', error: 'Not in a room', code: 'NOT_IN_ROOM' });
            return;
        }

        const { transportId, kind, rtpParameters, mediaType } = payload;

        try {
            const producer = await mediasoupService.createProducer(
                transportId,
                conn.participantId,
                kind,
                rtpParameters,
                mediaType
            );

            this.send(connectionId, {
                type: 'produced',
                ...producer
            });

            // Notify other participants about new producer
            this.broadcastToRoom(conn.roomId, {
                type: 'newProducer',
                participantId: conn.participantId,
                producerId: producer.producerId,
                kind,
                mediaType
            }, connectionId);

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'PRODUCE_FAILED'
            });
        }
    }

    /**
     * Handle consume (receive media)
     */
    async handleConsume(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) {
            this.send(connectionId, { type: 'error', error: 'Not in a room', code: 'NOT_IN_ROOM' });
            return;
        }

        const { transportId, producerId, rtpCapabilities } = payload;

        try {
            const consumer = await mediasoupService.createConsumer(
                transportId,
                producerId,
                rtpCapabilities,
                conn.participantId
            );

            this.send(connectionId, {
                type: 'consumed',
                ...consumer
            });

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'CONSUME_FAILED'
            });
        }
    }

    /**
     * Resume consumer
     */
    async handleResumeConsumer(connectionId, payload) {
        const { consumerId } = payload;

        try {
            await mediasoupService.resumeConsumer(consumerId);

            this.send(connectionId, {
                type: 'consumerResumed',
                consumerId
            });

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'RESUME_FAILED'
            });
        }
    }

    /**
     * Pause producer
     */
    async handlePauseProducer(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        const { producerId } = payload;

        try {
            await mediasoupService.setProducerPaused(producerId, true);

            this.send(connectionId, {
                type: 'producerPaused',
                producerId
            });

            // Notify others
            if (conn?.roomId) {
                this.broadcastToRoom(conn.roomId, {
                    type: 'producerPaused',
                    participantId: conn.participantId,
                    producerId
                }, connectionId);
            }

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'PAUSE_FAILED'
            });
        }
    }

    /**
     * Resume producer
     */
    async handleResumeProducer(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        const { producerId } = payload;

        try {
            await mediasoupService.setProducerPaused(producerId, false);

            this.send(connectionId, {
                type: 'producerResumed',
                producerId
            });

            // Notify others
            if (conn?.roomId) {
                this.broadcastToRoom(conn.roomId, {
                    type: 'producerResumed',
                    participantId: conn.participantId,
                    producerId
                }, connectionId);
            }

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'RESUME_FAILED'
            });
        }
    }

    /**
     * Close producer
     */
    async handleCloseProducer(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        const { producerId } = payload;

        try {
            await mediasoupService.closeProducer(producerId, conn?.participantId);

            this.send(connectionId, {
                type: 'producerClosed',
                producerId
            });

            // Notify others
            if (conn?.roomId) {
                this.broadcastToRoom(conn.roomId, {
                    type: 'producerClosed',
                    participantId: conn.participantId,
                    producerId
                }, connectionId);
            }

        } catch (error) {
            this.send(connectionId, {
                type: 'error',
                error: error.message,
                code: 'CLOSE_FAILED'
            });
        }
    }

    /**
     * Update media state (mute/unmute, camera on/off)
     */
    async handleUpdateMediaState(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { isAudioEnabled, isVideoEnabled, isScreensharing } = payload;
        const updates = {};

        if (isAudioEnabled !== undefined) updates.is_audio_enabled = isAudioEnabled;
        if (isVideoEnabled !== undefined) updates.is_video_enabled = isVideoEnabled;
        if (isScreensharing !== undefined) updates.is_screensharing = isScreensharing;

        await mediasoupService.updateParticipantStatus(conn.participantId, updates);

        // Broadcast to room
        this.broadcastToRoom(conn.roomId, {
            type: 'mediaStateChanged',
            participantId: conn.participantId,
            ...payload
        });
    }

    /**
     * Handle raise/lower hand
     */
    async handleRaiseHand(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { raised } = payload;

        await mediasoupService.updateParticipantStatus(conn.participantId, {
            is_hand_raised: raised
        });

        this.broadcastToRoom(conn.roomId, {
            type: 'handRaised',
            participantId: conn.participantId,
            raised
        });
    }

    /**
     * Handle in-call chat
     */
    async handleChat(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { message, privateToId } = payload;

        // Store chat message
        const result = await pool.query(
            `INSERT INTO video_chat_messages (video_room_id, participant_id, content, is_private, private_to_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [conn.roomId, conn.participantId, message, !!privateToId, privateToId || null]
        );

        const chatMessage = result.rows[0];

        // Get sender info
        const participantResult = await pool.query(
            `SELECT display_name FROM video_participants WHERE id = $1`,
            [conn.participantId]
        );

        const chatPayload = {
            type: 'chatMessage',
            messageId: chatMessage.id,
            participantId: conn.participantId,
            displayName: participantResult.rows[0]?.display_name,
            message,
            timestamp: chatMessage.created_at
        };

        if (privateToId) {
            // Send only to target participant
            const targetConn = this.findConnectionByParticipantId(privateToId);
            if (targetConn) {
                this.send(targetConn, { ...chatPayload, isPrivate: true });
            }
            // Also send to sender
            this.send(connectionId, { ...chatPayload, isPrivate: true });
        } else {
            // Broadcast to room
            this.broadcastToRoom(conn.roomId, chatPayload);
        }
    }

    /**
     * Handle kick participant (host only)
     */
    async handleKickParticipant(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { participantId, reason } = payload;

        // Verify host permission
        const hostCheck = await pool.query(
            `SELECT role FROM video_participants WHERE id = $1`,
            [conn.participantId]
        );

        if (!['host', 'co-host'].includes(hostCheck.rows[0]?.role)) {
            this.send(connectionId, {
                type: 'error',
                error: 'Only hosts can kick participants',
                code: 'PERMISSION_DENIED'
            });
            return;
        }

        // Update participant
        await pool.query(
            `UPDATE video_participants SET status = 'kicked', kick_reason = $2, left_at = NOW() WHERE id = $1`,
            [participantId, reason || 'Removed by host']
        );

        // Find and disconnect the kicked participant
        const kickedConn = this.findConnectionByParticipantId(participantId);
        if (kickedConn) {
            const kickedConnData = this.connections.get(kickedConn);
            this.send(kickedConn, {
                type: 'kicked',
                reason: reason || 'You have been removed from the call'
            });

            // Clean up their connection
            await this.handleLeaveRoom(kickedConn);
        }

        // Notify room
        this.broadcastToRoom(conn.roomId, {
            type: 'participantKicked',
            participantId
        });
    }

    /**
     * Handle stats reporting
     */
    async handleStats(connectionId, payload) {
        const conn = this.connections.get(connectionId);
        if (!conn || !conn.roomId) return;

        const { stats } = payload;

        for (const stat of stats) {
            await mediasoupService.recordStats(
                conn.roomId,
                conn.participantId,
                conn.tenantId,
                stat
            );
        }
    }

    /**
     * Handle WebSocket close
     */
    async handleClose(connectionId) {
        const conn = this.connections.get(connectionId);

        if (conn) {
            // Leave room if in one
            if (conn.roomId) {
                await this.handleLeaveRoom(connectionId);
            }

            // Clear ping timer
            this.stopPingTimer(connectionId);

            // Remove connection
            this.connections.delete(connectionId);
        }

        console.log(`[VideoSignaling] Connection closed: ${connectionId}`);
    }

    /**
     * Handle ping
     */
    handlePing(connectionId) {
        this.send(connectionId, { type: 'pong', timestamp: new Date().toISOString() });
    }

    /**
     * Start ping timer
     */
    startPingTimer(connectionId, ws) {
        const timer = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                ws.ping();
            } else {
                this.stopPingTimer(connectionId);
            }
        }, this.pingInterval);

        this.pingTimers.set(connectionId, timer);
    }

    /**
     * Stop ping timer
     */
    stopPingTimer(connectionId) {
        const timer = this.pingTimers.get(connectionId);
        if (timer) {
            clearInterval(timer);
            this.pingTimers.delete(connectionId);
        }
    }

    /**
     * Send message to a specific connection
     */
    send(connectionId, message) {
        const conn = this.connections.get(connectionId);
        if (conn?.ws?.readyState === 1) { // OPEN
            conn.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Send error message
     */
    sendError(ws, error, code) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'error', error, code }));
        }
    }

    /**
     * Broadcast to all participants in a room
     */
    broadcastToRoom(roomId, message, excludeConnectionId = null) {
        const roomConns = this.roomConnections.get(roomId);
        if (!roomConns) return;

        for (const connId of roomConns) {
            if (connId !== excludeConnectionId) {
                this.send(connId, message);
            }
        }
    }

    /**
     * Find connection by participant ID
     */
    findConnectionByParticipantId(participantId) {
        for (const [connId, conn] of this.connections.entries()) {
            if (conn.participantId === participantId) {
                return connId;
            }
        }
        return null;
    }

    /**
     * Get room participant count
     */
    getRoomParticipantCount(roomId) {
        return this.roomConnections.get(roomId)?.size || 0;
    }
}

export default new VideoSignalingHandler();
