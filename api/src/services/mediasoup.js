/**
 * MediaSoup SFU Service
 * Handles video calling infrastructure with MediaSoup
 * Manages workers, routers, transports, producers, and consumers
 */

import pool from '../db/connection.js';
import crypto from 'crypto';

// MediaSoup will be dynamically imported to handle environments where it's not installed
let mediasoup = null;

// Worker management
const workers = new Map();
const routers = new Map();
const transports = new Map();
const producers = new Map();
const consumers = new Map();

// Configuration defaults
const DEFAULT_WORKER_SETTINGS = {
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    rtcMinPort: 10000,
    rtcMaxPort: 59999
};

const DEFAULT_MEDIA_CODECS = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000
    },
    {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
            'profile-id': 2
        }
    },
    {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1
        }
    }
];

const DEFAULT_WEBRTC_TRANSPORT_OPTIONS = {
    listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    maxIncomingBitrate: 1500000
};

class MediaSoupService {
    constructor() {
        this.initialized = false;
        this.config = null;
    }

    /**
     * Initialize MediaSoup workers
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Dynamically import mediasoup
            const mediasoupModule = await import('mediasoup');
            mediasoup = mediasoupModule.default || mediasoupModule;

            // Load platform configuration
            this.config = await this.loadPlatformConfig();

            // Create workers based on CPU count
            const numWorkers = this.config.numWorkers || 4;
            for (let i = 0; i < numWorkers; i++) {
                await this.createWorker(i);
            }

            this.initialized = true;
            console.log(`[MediaSoup] Initialized with ${workers.size} workers`);
        } catch (error) {
            console.error('[MediaSoup] Failed to initialize:', error.message);
            // Service can still operate in "signaling-only" mode for development
            this.initialized = false;
        }
    }

    /**
     * Load platform video configuration from database
     */
    async loadPlatformConfig() {
        const result = await pool.query(
            `SELECT config_value FROM platform_video_config WHERE config_key = 'mediasoup_settings' AND is_active = true`
        );
        return result.rows[0]?.config_value || {
            numWorkers: 4,
            workerSettings: DEFAULT_WORKER_SETTINGS,
            routerMediaCodecs: DEFAULT_MEDIA_CODECS,
            webRtcTransportOptions: DEFAULT_WEBRTC_TRANSPORT_OPTIONS
        };
    }

    /**
     * Create a MediaSoup worker
     */
    async createWorker(index) {
        if (!mediasoup) return null;

        const workerSettings = this.config?.workerSettings || DEFAULT_WORKER_SETTINGS;

        const worker = await mediasoup.createWorker({
            logLevel: workerSettings.logLevel,
            logTags: workerSettings.logTags,
            rtcMinPort: workerSettings.rtcMinPort,
            rtcMaxPort: workerSettings.rtcMaxPort
        });

        const workerId = `worker-${index}-${crypto.randomBytes(4).toString('hex')}`;

        worker.on('died', async (error) => {
            console.error(`[MediaSoup] Worker ${workerId} died:`, error);
            workers.delete(workerId);
            await this.updateWorkerStatus(workerId, 'dead');
            // Attempt to recreate worker
            setTimeout(() => this.createWorker(index), 2000);
        });

        workers.set(workerId, worker);

        // Register worker in database
        await pool.query(
            `INSERT INTO mediasoup_workers (worker_id, pid, hostname, port, status, rtp_port_range_start, rtp_port_range_end)
             VALUES ($1, $2, $3, $4, 'active', $5, $6)
             ON CONFLICT (worker_id) DO UPDATE SET status = 'active', last_heartbeat_at = NOW()`,
            [workerId, worker.pid, process.env.HOSTNAME || 'localhost', 3000 + index, workerSettings.rtcMinPort, workerSettings.rtcMaxPort]
        );

        return worker;
    }

    /**
     * Get the least loaded worker
     */
    async getLeastLoadedWorker() {
        if (workers.size === 0) {
            throw new Error('No MediaSoup workers available');
        }

        const result = await pool.query(
            `SELECT worker_id FROM mediasoup_workers
             WHERE status = 'active'
             ORDER BY active_routers ASC, last_heartbeat_at DESC
             LIMIT 1`
        );

        const workerId = result.rows[0]?.worker_id;
        return workers.get(workerId) || workers.values().next().value;
    }

    /**
     * Update worker status in database
     */
    async updateWorkerStatus(workerId, status) {
        await pool.query(
            `UPDATE mediasoup_workers SET status = $2, updated_at = NOW() WHERE worker_id = $1`,
            [workerId, status]
        );
    }

    // ============================================
    // Video Room Management
    // ============================================

    /**
     * Create a new video room
     */
    async createRoom(tenantId, userId, options = {}) {
        const roomCode = this.generateRoomCode();

        const result = await pool.query(
            `INSERT INTO video_rooms (tenant_id, created_by, name, room_code, room_type, max_participants, max_video_participants, settings, scheduled_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                tenantId,
                userId,
                options.name || `Video Call ${roomCode}`,
                roomCode,
                options.roomType || 'instant',
                options.maxParticipants || 10,
                options.maxVideoParticipants || 6,
                JSON.stringify(options.settings || {}),
                options.scheduledAt || null
            ]
        );

        const room = result.rows[0];

        // Create MediaSoup router for this room (if MediaSoup is available)
        if (mediasoup) {
            await this.createRouterForRoom(room.id);
        }

        return room;
    }

    /**
     * Generate unique room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 9; i++) {
            if (i === 3 || i === 6) code += '-';
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Get room by ID
     */
    async getRoom(roomId, tenantId = null) {
        let query = `SELECT * FROM video_rooms WHERE id = $1`;
        const params = [roomId];

        if (tenantId) {
            query += ` AND tenant_id = $2`;
            params.push(tenantId);
        }

        const result = await pool.query(query, params);
        return result.rows[0] || null;
    }

    /**
     * Get room by code
     */
    async getRoomByCode(roomCode) {
        const result = await pool.query(
            `SELECT * FROM video_rooms WHERE room_code = $1 AND status IN ('waiting', 'active')`,
            [roomCode]
        );
        return result.rows[0] || null;
    }

    /**
     * List rooms for tenant
     */
    async listRooms(tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `SELECT vr.*,
                     (SELECT COUNT(*) FROM video_participants WHERE video_room_id = vr.id AND status = 'connected') as participant_count
                     FROM video_rooms vr WHERE vr.tenant_id = $1`;
        const params = [tenantId];

        if (status) {
            query += ` AND vr.status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY vr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Update room status
     */
    async updateRoomStatus(roomId, status) {
        const updateFields = { status };

        if (status === 'active') {
            updateFields.started_at = new Date();
        } else if (status === 'ended') {
            updateFields.ended_at = new Date();
            // Calculate duration
            await pool.query(
                `UPDATE video_rooms SET status = $2, ended_at = NOW(),
                 duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
                 WHERE id = $1`,
                [roomId, status]
            );
            return;
        }

        await pool.query(
            `UPDATE video_rooms SET status = $2, updated_at = NOW() WHERE id = $1`,
            [roomId, status]
        );
    }

    /**
     * End a video room
     */
    async endRoom(roomId) {
        // Close all participants
        await pool.query(
            `UPDATE video_participants SET status = 'disconnected', left_at = NOW()
             WHERE video_room_id = $1 AND status = 'connected'`,
            [roomId]
        );

        // Close router
        const routerResult = await pool.query(
            `SELECT router_id FROM mediasoup_routers WHERE video_room_id = $1 AND status = 'active'`,
            [roomId]
        );

        for (const row of routerResult.rows) {
            const router = routers.get(row.router_id);
            if (router) {
                router.close();
                routers.delete(row.router_id);
            }
        }

        await pool.query(
            `UPDATE mediasoup_routers SET status = 'closed', closed_at = NOW() WHERE video_room_id = $1`,
            [roomId]
        );

        await this.updateRoomStatus(roomId, 'ended');
    }

    // ============================================
    // MediaSoup Router Management
    // ============================================

    /**
     * Create a MediaSoup router for a room
     */
    async createRouterForRoom(roomId) {
        if (!mediasoup) return null;

        const worker = await this.getLeastLoadedWorker();
        const mediaCodecs = this.config?.routerMediaCodecs || DEFAULT_MEDIA_CODECS;

        const router = await worker.createRouter({ mediaCodecs });
        const routerId = `router-${crypto.randomBytes(8).toString('hex')}`;

        routers.set(routerId, router);

        // Find worker ID
        let workerId = null;
        for (const [id, w] of workers.entries()) {
            if (w === worker) {
                workerId = id;
                break;
            }
        }

        // Store in database
        const workerResult = await pool.query(
            `SELECT id FROM mediasoup_workers WHERE worker_id = $1`,
            [workerId]
        );

        if (workerResult.rows[0]) {
            await pool.query(
                `INSERT INTO mediasoup_routers (router_id, worker_id, video_room_id, media_codecs)
                 VALUES ($1, $2, $3, $4)`,
                [routerId, workerResult.rows[0].id, roomId, JSON.stringify(mediaCodecs)]
            );

            // Increment worker's active routers
            await pool.query(
                `UPDATE mediasoup_workers SET active_routers = active_routers + 1 WHERE worker_id = $1`,
                [workerId]
            );
        }

        return { router, routerId };
    }

    /**
     * Get router for a room
     */
    async getRouterForRoom(roomId) {
        const result = await pool.query(
            `SELECT router_id FROM mediasoup_routers WHERE video_room_id = $1 AND status = 'active'`,
            [roomId]
        );

        if (!result.rows[0]) return null;

        const routerId = result.rows[0].router_id;
        let router = routers.get(routerId);

        // If router not in memory, room needs to be recreated
        if (!router && mediasoup) {
            const created = await this.createRouterForRoom(roomId);
            return created?.router || null;
        }

        return router;
    }

    // ============================================
    // Participant Management
    // ============================================

    /**
     * Join a video room
     */
    async joinRoom(roomId, userId, tenantId, options = {}) {
        const room = await this.getRoom(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.status === 'ended') {
            throw new Error('Room has ended');
        }

        // Check participant limit
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM video_participants WHERE video_room_id = $1 AND status = 'connected'`,
            [roomId]
        );

        if (parseInt(countResult.rows[0].count) >= room.max_participants) {
            throw new Error('Room is full');
        }

        // Check if user already in room
        const existingResult = await pool.query(
            `SELECT * FROM video_participants WHERE video_room_id = $1 AND user_id = $2 AND status IN ('joining', 'connected')`,
            [roomId, userId]
        );

        if (existingResult.rows[0]) {
            return existingResult.rows[0];
        }

        // Add participant
        const connectionId = crypto.randomBytes(16).toString('hex');
        const result = await pool.query(
            `INSERT INTO video_participants (video_room_id, user_id, tenant_id, display_name, participant_type, role, connection_id, device_info)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                roomId,
                userId,
                tenantId,
                options.displayName || 'Participant',
                options.participantType || 'user',
                options.role || (room.created_by === userId ? 'host' : 'participant'),
                connectionId,
                JSON.stringify(options.deviceInfo || {})
            ]
        );

        const participant = result.rows[0];

        // If this is the first participant, start the room
        if (room.status === 'waiting') {
            await this.updateRoomStatus(roomId, 'active');
        }

        return participant;
    }

    /**
     * Leave a video room
     */
    async leaveRoom(participantId) {
        const participantResult = await pool.query(
            `SELECT * FROM video_participants WHERE id = $1`,
            [participantId]
        );

        const participant = participantResult.rows[0];
        if (!participant) return;

        // Close all transports for this participant
        const transportResult = await pool.query(
            `SELECT transport_id FROM mediasoup_transports WHERE participant_id = $1 AND status != 'closed'`,
            [participantId]
        );

        for (const row of transportResult.rows) {
            const transport = transports.get(row.transport_id);
            if (transport) {
                transport.close();
                transports.delete(row.transport_id);
            }
        }

        await pool.query(
            `UPDATE mediasoup_transports SET status = 'closed', closed_at = NOW() WHERE participant_id = $1`,
            [participantId]
        );

        // Update participant status
        await pool.query(
            `UPDATE video_participants SET status = 'disconnected', left_at = NOW() WHERE id = $1`,
            [participantId]
        );

        // Check if room is empty
        const remainingResult = await pool.query(
            `SELECT COUNT(*) FROM video_participants WHERE video_room_id = $1 AND status = 'connected'`,
            [participant.video_room_id]
        );

        if (parseInt(remainingResult.rows[0].count) === 0) {
            // End room if empty
            await this.endRoom(participant.video_room_id);
        }
    }

    /**
     * Update participant status
     */
    async updateParticipantStatus(participantId, updates) {
        const fields = [];
        const values = [participantId];
        let paramIndex = 2;

        const allowedFields = ['status', 'is_audio_enabled', 'is_video_enabled', 'is_screensharing', 'is_hand_raised', 'network_quality'];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return;

        fields.push('updated_at = NOW()');

        await pool.query(
            `UPDATE video_participants SET ${fields.join(', ')} WHERE id = $1`,
            values
        );
    }

    /**
     * Get participants in a room
     */
    async getRoomParticipants(roomId) {
        const result = await pool.query(
            `SELECT vp.*, u.email, u.name as user_name
             FROM video_participants vp
             LEFT JOIN users u ON vp.user_id = u.id
             WHERE vp.video_room_id = $1 AND vp.status IN ('joining', 'connected', 'reconnecting')
             ORDER BY vp.joined_at ASC`,
            [roomId]
        );
        return result.rows;
    }

    // ============================================
    // WebRTC Transport Management
    // ============================================

    /**
     * Create WebRTC transport for a participant
     */
    async createTransport(roomId, participantId, direction) {
        if (!mediasoup) {
            // Return mock transport params for development
            return this.getMockTransportParams(direction);
        }

        const router = await this.getRouterForRoom(roomId);
        if (!router) {
            throw new Error('Router not available');
        }

        const transportOptions = this.config?.webRtcTransportOptions || DEFAULT_WEBRTC_TRANSPORT_OPTIONS;

        // Get announced IP from environment or use auto-detection
        const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || null;
        const listenIps = transportOptions.listenIps.map(ip => ({
            ...ip,
            announcedIp: announcedIp || ip.announcedIp
        }));

        const transport = await router.createWebRtcTransport({
            ...transportOptions,
            listenIps,
            enableSctp: true,
            numSctpStreams: { OS: 1024, MIS: 1024 }
        });

        const transportId = `transport-${crypto.randomBytes(8).toString('hex')}`;
        transports.set(transportId, transport);

        // Get router ID from database
        const routerResult = await pool.query(
            `SELECT id FROM mediasoup_routers WHERE video_room_id = $1 AND status = 'active'`,
            [roomId]
        );

        // Store in database
        await pool.query(
            `INSERT INTO mediasoup_transports (transport_id, router_id, participant_id, transport_type, direction, ice_parameters, ice_candidates, dtls_parameters, sctp_parameters)
             VALUES ($1, $2, $3, 'webrtc', $4, $5, $6, $7, $8)`,
            [
                transportId,
                routerResult.rows[0]?.id,
                participantId,
                direction,
                JSON.stringify(transport.iceParameters),
                JSON.stringify(transport.iceCandidates),
                JSON.stringify(transport.dtlsParameters),
                JSON.stringify(transport.sctpParameters)
            ]
        );

        // Handle transport events
        transport.on('dtlsstatechange', async (dtlsState) => {
            if (dtlsState === 'closed') {
                transport.close();
                transports.delete(transportId);
                await pool.query(
                    `UPDATE mediasoup_transports SET status = 'closed', dtls_state = $2, closed_at = NOW() WHERE transport_id = $1`,
                    [transportId, dtlsState]
                );
            } else {
                await pool.query(
                    `UPDATE mediasoup_transports SET dtls_state = $2 WHERE transport_id = $1`,
                    [transportId, dtlsState]
                );
            }
        });

        return {
            transportId,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters
        };
    }

    /**
     * Connect transport (complete DTLS handshake)
     */
    async connectTransport(transportId, dtlsParameters) {
        const transport = transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }

        await transport.connect({ dtlsParameters });

        await pool.query(
            `UPDATE mediasoup_transports SET status = 'connected', connected_at = NOW() WHERE transport_id = $1`,
            [transportId]
        );

        return { connected: true };
    }

    /**
     * Get mock transport params for development without MediaSoup
     */
    getMockTransportParams(direction) {
        return {
            transportId: `mock-transport-${crypto.randomBytes(8).toString('hex')}`,
            iceParameters: {
                usernameFragment: crypto.randomBytes(12).toString('base64'),
                password: crypto.randomBytes(24).toString('base64'),
                iceLite: true
            },
            iceCandidates: [
                {
                    foundation: 'udpcandidate',
                    priority: 1078862079,
                    ip: '0.0.0.0',
                    port: 10000 + Math.floor(Math.random() * 1000),
                    type: 'host',
                    protocol: 'udp'
                }
            ],
            dtlsParameters: {
                role: 'auto',
                fingerprints: [
                    {
                        algorithm: 'sha-256',
                        value: crypto.randomBytes(32).toString('hex').match(/.{2}/g).join(':').toUpperCase()
                    }
                ]
            },
            sctpParameters: {
                port: 5000,
                OS: 1024,
                MIS: 1024,
                maxMessageSize: 262144
            }
        };
    }

    // ============================================
    // Producer/Consumer Management
    // ============================================

    /**
     * Create a producer (send media)
     */
    async createProducer(transportId, participantId, kind, rtpParameters, mediaType = 'camera') {
        if (!mediasoup) {
            return { producerId: `mock-producer-${crypto.randomBytes(8).toString('hex')}` };
        }

        const transport = transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }

        const producer = await transport.produce({
            kind,
            rtpParameters,
            appData: { mediaType }
        });

        const producerId = `producer-${crypto.randomBytes(8).toString('hex')}`;
        producers.set(producerId, producer);

        // Get transport DB ID
        const transportResult = await pool.query(
            `SELECT id FROM mediasoup_transports WHERE transport_id = $1`,
            [transportId]
        );

        await pool.query(
            `INSERT INTO mediasoup_producers (producer_id, transport_id, participant_id, kind, rtp_parameters, media_type, codec)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                producerId,
                transportResult.rows[0]?.id,
                participantId,
                kind,
                JSON.stringify(rtpParameters),
                mediaType,
                rtpParameters.codecs?.[0]?.mimeType
            ]
        );

        // Update participant media state
        if (mediaType === 'camera') {
            await this.updateParticipantStatus(participantId, { is_video_enabled: true });
        } else if (mediaType === 'screenshare') {
            await this.updateParticipantStatus(participantId, { is_screensharing: true });
        } else if (kind === 'audio') {
            await this.updateParticipantStatus(participantId, { is_audio_enabled: true });
        }

        producer.on('score', (score) => {
            // Could store producer score for quality monitoring
        });

        return { producerId, kind, mediaType };
    }

    /**
     * Create a consumer (receive media)
     */
    async createConsumer(transportId, producerId, rtpCapabilities, participantId) {
        if (!mediasoup) {
            return { consumerId: `mock-consumer-${crypto.randomBytes(8).toString('hex')}` };
        }

        const transport = transports.get(transportId);
        const producer = producers.get(producerId);

        if (!transport || !producer) {
            throw new Error('Transport or producer not found');
        }

        // Get router to check capabilities
        const routerResult = await pool.query(
            `SELECT mr.router_id FROM mediasoup_routers mr
             JOIN mediasoup_transports mt ON mt.router_id = mr.id
             WHERE mt.transport_id = $1`,
            [transportId]
        );

        const router = routers.get(routerResult.rows[0]?.router_id);
        if (!router || !router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            throw new Error('Cannot consume this producer');
        }

        const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true // Start paused, client will resume
        });

        const consumerId = `consumer-${crypto.randomBytes(8).toString('hex')}`;
        consumers.set(consumerId, consumer);

        // Get IDs from database
        const transportDbResult = await pool.query(
            `SELECT id FROM mediasoup_transports WHERE transport_id = $1`,
            [transportId]
        );
        const producerDbResult = await pool.query(
            `SELECT id FROM mediasoup_producers WHERE producer_id = $1`,
            [producerId]
        );

        await pool.query(
            `INSERT INTO mediasoup_consumers (consumer_id, transport_id, producer_id, participant_id, kind, rtp_parameters)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                consumerId,
                transportDbResult.rows[0]?.id,
                producerDbResult.rows[0]?.id,
                participantId,
                consumer.kind,
                JSON.stringify(consumer.rtpParameters)
            ]
        );

        return {
            consumerId,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
        };
    }

    /**
     * Resume a consumer
     */
    async resumeConsumer(consumerId) {
        const consumer = consumers.get(consumerId);
        if (consumer) {
            await consumer.resume();
        }
        return { resumed: true };
    }

    /**
     * Pause/unpause a producer
     */
    async setProducerPaused(producerId, paused) {
        const producer = producers.get(producerId);
        if (producer) {
            if (paused) {
                await producer.pause();
            } else {
                await producer.resume();
            }
        }

        await pool.query(
            `UPDATE mediasoup_producers SET is_paused = $2 WHERE producer_id = $1`,
            [producerId, paused]
        );

        return { paused };
    }

    /**
     * Close a producer
     */
    async closeProducer(producerId, participantId) {
        const producer = producers.get(producerId);
        if (producer) {
            producer.close();
            producers.delete(producerId);
        }

        const result = await pool.query(
            `UPDATE mediasoup_producers SET closed_at = NOW() WHERE producer_id = $1 RETURNING media_type, kind`,
            [producerId]
        );

        // Update participant media state
        if (result.rows[0]) {
            const { media_type, kind } = result.rows[0];
            if (media_type === 'camera') {
                await this.updateParticipantStatus(participantId, { is_video_enabled: false });
            } else if (media_type === 'screenshare') {
                await this.updateParticipantStatus(participantId, { is_screensharing: false });
            } else if (kind === 'audio') {
                await this.updateParticipantStatus(participantId, { is_audio_enabled: false });
            }
        }

        return { closed: true };
    }

    /**
     * Get router RTP capabilities
     */
    async getRouterRtpCapabilities(roomId) {
        const router = await this.getRouterForRoom(roomId);

        if (router) {
            return router.rtpCapabilities;
        }

        // Return default capabilities for development
        return {
            codecs: DEFAULT_MEDIA_CODECS,
            headerExtensions: []
        };
    }

    // ============================================
    // Recording Management
    // ============================================

    /**
     * Start recording a room
     */
    async startRecording(roomId, tenantId, options = {}) {
        const result = await pool.query(
            `INSERT INTO video_recordings (video_room_id, tenant_id, recording_type, format, resolution, framerate, bitrate, s3_bucket)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                roomId,
                tenantId,
                options.recordingType || 'composite',
                options.format || 'mp4',
                options.resolution || '1280x720',
                options.framerate || 30,
                options.bitrate || 2500000,
                process.env.AWS_S3_BUCKET || 'irisx-recordings'
            ]
        );

        return result.rows[0];
    }

    /**
     * Stop recording
     */
    async stopRecording(recordingId) {
        await pool.query(
            `UPDATE video_recordings SET status = 'processing', stopped_at = NOW() WHERE id = $1`,
            [recordingId]
        );
    }

    /**
     * Get recordings for a room
     */
    async getRoomRecordings(roomId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM video_recordings WHERE video_room_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
            [roomId, tenantId]
        );
        return result.rows;
    }

    // ============================================
    // Invitations
    // ============================================

    /**
     * Create invitation
     */
    async createInvitation(roomId, invitedBy, options = {}) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + (options.expiresInHours || 24) * 60 * 60 * 1000);

        const result = await pool.query(
            `INSERT INTO video_invitations (video_room_id, invited_by, invited_user_id, invited_email, invited_phone, invitation_type, token, message, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                roomId,
                invitedBy,
                options.invitedUserId || null,
                options.email || null,
                options.phone || null,
                options.type || 'email',
                token,
                options.message || null,
                expiresAt
            ]
        );

        return result.rows[0];
    }

    /**
     * Validate invitation token
     */
    async validateInvitation(token) {
        const result = await pool.query(
            `SELECT vi.*, vr.room_code, vr.name as room_name, vr.status as room_status
             FROM video_invitations vi
             JOIN video_rooms vr ON vi.video_room_id = vr.id
             WHERE vi.token = $1 AND vi.expires_at > NOW() AND vi.status = 'pending'`,
            [token]
        );

        if (!result.rows[0]) {
            return null;
        }

        // Mark as viewed
        await pool.query(
            `UPDATE video_invitations SET viewed_at = COALESCE(viewed_at, NOW()) WHERE id = $1`,
            [result.rows[0].id]
        );

        return result.rows[0];
    }

    // ============================================
    // Statistics & Analytics
    // ============================================

    /**
     * Record stream statistics
     */
    async recordStats(roomId, participantId, tenantId, stats) {
        await pool.query(
            `INSERT INTO video_stream_stats (video_room_id, participant_id, tenant_id, stat_type, kind, codec, bitrate, packets_sent, packets_received, packets_lost, bytes_sent, bytes_received, jitter_ms, round_trip_time_ms, frame_width, frame_height, frames_per_second)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            [
                roomId,
                participantId,
                tenantId,
                stats.type || 'outbound',
                stats.kind || 'video',
                stats.codec,
                stats.bitrate,
                stats.packetsSent || 0,
                stats.packetsReceived || 0,
                stats.packetsLost || 0,
                stats.bytesSent || 0,
                stats.bytesReceived || 0,
                stats.jitter,
                stats.roundTripTime,
                stats.frameWidth,
                stats.frameHeight,
                stats.framesPerSecond
            ]
        );
    }

    /**
     * Get room analytics
     */
    async getRoomAnalytics(roomId) {
        const result = await pool.query(
            `SELECT
                COUNT(DISTINCT participant_id) as total_participants,
                AVG(bitrate) as avg_bitrate,
                AVG(jitter_ms) as avg_jitter,
                AVG(round_trip_time_ms) as avg_rtt,
                SUM(packets_lost) as total_packets_lost,
                SUM(packets_sent + packets_received) as total_packets
             FROM video_stream_stats
             WHERE video_room_id = $1`,
            [roomId]
        );

        return result.rows[0];
    }

    /**
     * Get tenant video usage
     */
    async getTenantUsage(tenantId, startDate, endDate) {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total_rooms,
                SUM(duration_seconds) as total_duration_seconds,
                COUNT(DISTINCT created_by) as unique_hosts,
                (SELECT COUNT(*) FROM video_participants WHERE tenant_id = $1 AND joined_at BETWEEN $2 AND $3) as total_participants,
                (SELECT COUNT(*) FROM video_recordings WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as total_recordings
             FROM video_rooms
             WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
            [tenantId, startDate, endDate]
        );

        return result.rows[0];
    }

    // ============================================
    // Tenant Settings
    // ============================================

    /**
     * Get tenant video settings
     */
    async getTenantSettings(tenantId) {
        const result = await pool.query(
            `SELECT * FROM tenant_video_settings WHERE tenant_id = $1`,
            [tenantId]
        );

        if (!result.rows[0]) {
            // Create default settings
            const insertResult = await pool.query(
                `INSERT INTO tenant_video_settings (tenant_id) VALUES ($1) RETURNING *`,
                [tenantId]
            );
            return insertResult.rows[0];
        }

        return result.rows[0];
    }

    /**
     * Update tenant video settings
     */
    async updateTenantSettings(tenantId, settings) {
        const fields = [];
        const values = [tenantId];
        let paramIndex = 2;

        const allowedFields = [
            'video_enabled', 'max_concurrent_rooms', 'max_room_participants',
            'max_room_duration_minutes', 'default_video_quality', 'simulcast_enabled',
            'recording_enabled', 'recording_retention_days', 'transcription_enabled',
            'ai_summary_enabled', 'branding', 'ice_servers', 'turn_servers'
        ];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(typeof value === 'object' ? JSON.stringify(value) : value);
                paramIndex++;
            }
        }

        if (fields.length === 0) return null;

        fields.push('updated_at = NOW()');

        const result = await pool.query(
            `UPDATE tenant_video_settings SET ${fields.join(', ')} WHERE tenant_id = $1 RETURNING *`,
            values
        );

        return result.rows[0];
    }

    // ============================================
    // Admin Functions
    // ============================================

    /**
     * Get all active rooms (admin)
     */
    async getAllActiveRooms() {
        const result = await pool.query(
            `SELECT vr.*, t.name as tenant_name,
                    (SELECT COUNT(*) FROM video_participants WHERE video_room_id = vr.id AND status = 'connected') as participant_count
             FROM video_rooms vr
             JOIN tenants t ON vr.tenant_id = t.id
             WHERE vr.status = 'active'
             ORDER BY vr.started_at DESC`
        );
        return result.rows;
    }

    /**
     * Get worker status (admin)
     */
    async getWorkerStatus() {
        const result = await pool.query(
            `SELECT * FROM mediasoup_workers ORDER BY created_at ASC`
        );
        return result.rows;
    }

    /**
     * Get platform video stats (admin)
     */
    async getPlatformStats() {
        const result = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM video_rooms WHERE status = 'active') as active_rooms,
                (SELECT COUNT(*) FROM video_participants WHERE status = 'connected') as connected_participants,
                (SELECT COUNT(*) FROM video_recordings WHERE status = 'recording') as active_recordings,
                (SELECT COUNT(*) FROM mediasoup_workers WHERE status = 'active') as active_workers,
                (SELECT SUM(active_routers) FROM mediasoup_workers WHERE status = 'active') as active_routers,
                (SELECT COUNT(*) FROM video_rooms WHERE created_at > NOW() - INTERVAL '24 hours') as rooms_last_24h,
                (SELECT SUM(duration_seconds) FROM video_rooms WHERE ended_at > NOW() - INTERVAL '24 hours') as minutes_last_24h`
        );
        return result.rows[0];
    }

    /**
     * Update platform video config (admin)
     */
    async updatePlatformConfig(configKey, configValue) {
        const result = await pool.query(
            `UPDATE platform_video_config SET config_value = $2, updated_at = NOW() WHERE config_key = $1 RETURNING *`,
            [configKey, JSON.stringify(configValue)]
        );
        return result.rows[0];
    }

    /**
     * Get ICE servers configuration
     */
    async getIceServers(tenantId = null) {
        // First check tenant settings
        if (tenantId) {
            const tenantResult = await pool.query(
                `SELECT ice_servers, turn_servers FROM tenant_video_settings WHERE tenant_id = $1`,
                [tenantId]
            );

            if (tenantResult.rows[0]?.turn_servers?.length > 0) {
                return [
                    ...tenantResult.rows[0].ice_servers,
                    ...tenantResult.rows[0].turn_servers
                ];
            }
        }

        // Fall back to platform config
        const result = await pool.query(
            `SELECT config_value FROM platform_video_config WHERE config_key = 'ice_servers'`
        );

        const config = result.rows[0]?.config_value || {};
        return [...(config.stun || []), ...(config.turn || [])];
    }
}

export default new MediaSoupService();
