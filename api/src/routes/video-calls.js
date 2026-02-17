/**
 * Video Calling API Routes
 * Customer-facing endpoints for video calling functionality
 */

import { Hono } from 'hono';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import mediasoupService from '../services/mediasoup.js';
import { pool } from '../database.js';
import crypto from 'crypto';

const videoCalls = new Hono();

// Apply authentication to all routes
videoCalls.use('*', authenticateJWT);

// ============================================
// Room Management
// ============================================

/**
 * Create a new video room
 * POST /v1/video-calls/rooms
 */
videoCalls.post('/rooms', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const userId = user?.userId;

        const body = await c.req.json();
        const { name, roomType, maxParticipants, maxVideoParticipants, settings, scheduledAt } = body;

        // Check tenant video settings
        const tenantSettings = await mediasoupService.getTenantSettings(tenantId);

        if (!tenantSettings.video_enabled) {
            return c.json({ error: 'Video calling is not enabled for your account' }, 403);
        }

        // Check concurrent room limit
        const activeRooms = await pool.query(
            `SELECT COUNT(*) FROM video_rooms WHERE tenant_id = $1 AND status IN ('waiting', 'active')`,
            [tenantId]
        );

        if (parseInt(activeRooms.rows[0].count) >= tenantSettings.max_concurrent_rooms) {
            return c.json({ error: 'Maximum concurrent rooms limit reached' }, 429);
        }

        const room = await mediasoupService.createRoom(tenantId, userId, {
            name,
            roomType: roomType || 'instant',
            maxParticipants: Math.min(maxParticipants || 10, tenantSettings.max_room_participants),
            maxVideoParticipants: maxVideoParticipants || 6,
            settings: {
                ...settings,
                recording_enabled: settings?.recording_enabled && tenantSettings.recording_enabled
            },
            scheduledAt
        });

        return c.json({
            success: true,
            room: {
                id: room.id,
                name: room.name,
                roomCode: room.room_code,
                roomType: room.room_type,
                status: room.status,
                maxParticipants: room.max_participants,
                settings: room.settings,
                scheduledAt: room.scheduled_at,
                createdAt: room.created_at
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Create room error:', error);
        return c.json({ error: 'Failed to create room', message: error.message }, 500);
    }
});

/**
 * Get room details
 * GET /v1/video-calls/rooms/:roomId
 */
videoCalls.get('/rooms/:roomId', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        const participants = await mediasoupService.getRoomParticipants(roomId);

        return c.json({
            room: {
                id: room.id,
                name: room.name,
                roomCode: room.room_code,
                roomType: room.room_type,
                status: room.status,
                maxParticipants: room.max_participants,
                settings: room.settings,
                scheduledAt: room.scheduled_at,
                startedAt: room.started_at,
                endedAt: room.ended_at,
                durationSeconds: room.duration_seconds,
                createdAt: room.created_at
            },
            participants: participants.map(p => ({
                id: p.id,
                displayName: p.display_name,
                role: p.role,
                status: p.status,
                isAudioEnabled: p.is_audio_enabled,
                isVideoEnabled: p.is_video_enabled,
                isScreensharing: p.is_screensharing,
                joinedAt: p.joined_at
            })),
            participantCount: participants.length
        });

    } catch (error) {
        console.error('[VideoAPI] Get room error:', error);
        return c.json({ error: 'Failed to get room', message: error.message }, 500);
    }
});

/**
 * Get room by code (for joining)
 * GET /v1/video-calls/rooms/code/:roomCode
 */
videoCalls.get('/rooms/code/:roomCode', async (c) => {
    try {
        const roomCode = c.req.param('roomCode');

        const room = await mediasoupService.getRoomByCode(roomCode);

        if (!room) {
            return c.json({ error: 'Room not found or has ended' }, 404);
        }

        return c.json({
            room: {
                id: room.id,
                name: room.name,
                roomCode: room.room_code,
                status: room.status,
                settings: {
                    waiting_room_enabled: room.settings?.waiting_room_enabled,
                    require_authentication: room.settings?.require_authentication
                }
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Get room by code error:', error);
        return c.json({ error: 'Failed to get room', message: error.message }, 500);
    }
});

/**
 * List rooms
 * GET /v1/video-calls/rooms
 */
videoCalls.get('/rooms', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;

        const status = c.req.query('status');
        const limit = parseInt(c.req.query('limit')) || 50;
        const offset = parseInt(c.req.query('offset')) || 0;

        const rooms = await mediasoupService.listRooms(tenantId, { status, limit, offset });

        return c.json({
            rooms: rooms.map(r => ({
                id: r.id,
                name: r.name,
                roomCode: r.room_code,
                roomType: r.room_type,
                status: r.status,
                participantCount: parseInt(r.participant_count),
                maxParticipants: r.max_participants,
                scheduledAt: r.scheduled_at,
                startedAt: r.started_at,
                endedAt: r.ended_at,
                durationSeconds: r.duration_seconds,
                createdAt: r.created_at
            })),
            total: rooms.length,
            limit,
            offset
        });

    } catch (error) {
        console.error('[VideoAPI] List rooms error:', error);
        return c.json({ error: 'Failed to list rooms', message: error.message }, 500);
    }
});

/**
 * End a room
 * POST /v1/video-calls/rooms/:roomId/end
 */
videoCalls.post('/rooms/:roomId/end', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const userId = user?.userId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        // Only host or co-host can end the room
        const participantCheck = await pool.query(
            `SELECT role FROM video_participants WHERE video_room_id = $1 AND user_id = $2 AND status = 'connected'`,
            [roomId, userId]
        );

        const isHost = room.created_by === userId;
        const isCoHost = participantCheck.rows[0]?.role === 'co-host';

        if (!isHost && !isCoHost) {
            return c.json({ error: 'Only the host can end this room' }, 403);
        }

        await mediasoupService.endRoom(roomId);

        return c.json({ success: true, message: 'Room ended' });

    } catch (error) {
        console.error('[VideoAPI] End room error:', error);
        return c.json({ error: 'Failed to end room', message: error.message }, 500);
    }
});

/**
 * Update room settings
 * PATCH /v1/video-calls/rooms/:roomId
 */
videoCalls.patch('/rooms/:roomId', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const userId = user?.userId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        if (room.created_by !== userId) {
            return c.json({ error: 'Only the host can update room settings' }, 403);
        }

        const body = await c.req.json();
        const { name, settings } = body;

        const updates = [];
        const values = [roomId];
        let paramIndex = 2;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }

        if (settings) {
            updates.push(`settings = settings || $${paramIndex++}`);
            values.push(JSON.stringify(settings));
        }

        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            await pool.query(
                `UPDATE video_rooms SET ${updates.join(', ')} WHERE id = $1`,
                values
            );
        }

        return c.json({ success: true, message: 'Room updated' });

    } catch (error) {
        console.error('[VideoAPI] Update room error:', error);
        return c.json({ error: 'Failed to update room', message: error.message }, 500);
    }
});

// ============================================
// Invitations
// ============================================

/**
 * Create invitation
 * POST /v1/video-calls/rooms/:roomId/invitations
 */
videoCalls.post('/rooms/:roomId/invitations', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const userId = user?.userId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        const body = await c.req.json();
        const { email, phone, invitedUserId, message, expiresInHours } = body;

        if (!email && !phone && !invitedUserId) {
            return c.json({ error: 'Must provide email, phone, or user ID' }, 400);
        }

        const invitation = await mediasoupService.createInvitation(roomId, userId, {
            email,
            phone,
            invitedUserId,
            message,
            expiresInHours: expiresInHours || 24,
            type: email ? 'email' : phone ? 'sms' : 'internal'
        });

        // Generate join URL
        const baseUrl = process.env.APP_URL || 'https://app.irisx.com';
        const joinUrl = `${baseUrl}/video/join?token=${invitation.token}`;

        return c.json({
            success: true,
            invitation: {
                id: invitation.id,
                token: invitation.token,
                joinUrl,
                expiresAt: invitation.expires_at
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Create invitation error:', error);
        return c.json({ error: 'Failed to create invitation', message: error.message }, 500);
    }
});

/**
 * Validate invitation token
 * GET /v1/video-calls/invitations/:token
 */
videoCalls.get('/invitations/:token', async (c) => {
    try {
        const token = c.req.param('token');

        const invitation = await mediasoupService.validateInvitation(token);

        if (!invitation) {
            return c.json({ error: 'Invalid or expired invitation' }, 404);
        }

        return c.json({
            valid: true,
            roomId: invitation.video_room_id,
            roomName: invitation.room_name,
            roomCode: invitation.room_code,
            roomStatus: invitation.room_status
        });

    } catch (error) {
        console.error('[VideoAPI] Validate invitation error:', error);
        return c.json({ error: 'Failed to validate invitation', message: error.message }, 500);
    }
});

// ============================================
// Recordings
// ============================================

/**
 * Start recording
 * POST /v1/video-calls/rooms/:roomId/recording/start
 */
videoCalls.post('/rooms/:roomId/recording/start', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        if (room.status !== 'active') {
            return c.json({ error: 'Room is not active' }, 400);
        }

        // Check if recording is enabled
        const tenantSettings = await mediasoupService.getTenantSettings(tenantId);

        if (!tenantSettings.recording_enabled) {
            return c.json({ error: 'Recording is not enabled for your account' }, 403);
        }

        const body = await c.req.json().catch(() => ({}));

        const recording = await mediasoupService.startRecording(roomId, tenantId, {
            recordingType: body.recordingType || 'composite',
            format: body.format || 'mp4',
            resolution: body.resolution || '1280x720'
        });

        return c.json({
            success: true,
            recording: {
                id: recording.id,
                status: recording.status,
                startedAt: recording.started_at
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Start recording error:', error);
        return c.json({ error: 'Failed to start recording', message: error.message }, 500);
    }
});

/**
 * Stop recording
 * POST /v1/video-calls/rooms/:roomId/recording/stop
 */
videoCalls.post('/rooms/:roomId/recording/stop', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const roomId = c.req.param('roomId');

        // Find active recording
        const recordingResult = await pool.query(
            `SELECT id FROM video_recordings WHERE video_room_id = $1 AND tenant_id = $2 AND status = 'recording' ORDER BY started_at DESC LIMIT 1`,
            [roomId, tenantId]
        );

        if (!recordingResult.rows[0]) {
            return c.json({ error: 'No active recording found' }, 404);
        }

        await mediasoupService.stopRecording(recordingResult.rows[0].id);

        return c.json({ success: true, message: 'Recording stopped' });

    } catch (error) {
        console.error('[VideoAPI] Stop recording error:', error);
        return c.json({ error: 'Failed to stop recording', message: error.message }, 500);
    }
});

/**
 * Get room recordings
 * GET /v1/video-calls/rooms/:roomId/recordings
 */
videoCalls.get('/rooms/:roomId/recordings', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const roomId = c.req.param('roomId');

        const recordings = await mediasoupService.getRoomRecordings(roomId, tenantId);

        return c.json({
            recordings: recordings.map(r => ({
                id: r.id,
                recordingType: r.recording_type,
                status: r.status,
                format: r.format,
                resolution: r.resolution,
                durationSeconds: r.duration_seconds,
                fileSize: r.file_size,
                thumbnailUrl: r.thumbnail_url,
                startedAt: r.started_at,
                stoppedAt: r.stopped_at
            }))
        });

    } catch (error) {
        console.error('[VideoAPI] Get recordings error:', error);
        return c.json({ error: 'Failed to get recordings', message: error.message }, 500);
    }
});

/**
 * Get recording download URL
 * GET /v1/video-calls/recordings/:recordingId/download
 */
videoCalls.get('/recordings/:recordingId/download', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const recordingId = c.req.param('recordingId');

        const result = await pool.query(
            `SELECT * FROM video_recordings WHERE id = $1 AND tenant_id = $2`,
            [recordingId, tenantId]
        );

        if (!result.rows[0]) {
            return c.json({ error: 'Recording not found' }, 404);
        }

        const recording = result.rows[0];

        if (recording.status !== 'completed') {
            return c.json({ error: 'Recording is not ready for download' }, 400);
        }

        // Check if presigned URL is still valid
        if (recording.presigned_url && recording.presigned_url_expires_at > new Date()) {
            return c.json({ downloadUrl: recording.presigned_url, expiresAt: recording.presigned_url_expires_at });
        }

        // Generate new presigned URL (would integrate with S3)
        // For now, return the S3 URL directly
        return c.json({ downloadUrl: recording.s3_url });

    } catch (error) {
        console.error('[VideoAPI] Get download URL error:', error);
        return c.json({ error: 'Failed to get download URL', message: error.message }, 500);
    }
});

// ============================================
// Tenant Settings
// ============================================

/**
 * Get video settings
 * GET /v1/video-calls/settings
 */
videoCalls.get('/settings', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;

        const settings = await mediasoupService.getTenantSettings(tenantId);

        return c.json({
            settings: {
                videoEnabled: settings.video_enabled,
                maxConcurrentRooms: settings.max_concurrent_rooms,
                maxRoomParticipants: settings.max_room_participants,
                maxRoomDurationMinutes: settings.max_room_duration_minutes,
                defaultVideoQuality: settings.default_video_quality,
                simulcastEnabled: settings.simulcast_enabled,
                recordingEnabled: settings.recording_enabled,
                recordingRetentionDays: settings.recording_retention_days,
                transcriptionEnabled: settings.transcription_enabled,
                aiSummaryEnabled: settings.ai_summary_enabled,
                branding: settings.branding
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Get settings error:', error);
        return c.json({ error: 'Failed to get settings', message: error.message }, 500);
    }
});

/**
 * Update video settings
 * PATCH /v1/video-calls/settings
 */
videoCalls.patch('/settings', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;

        const body = await c.req.json();

        const settings = await mediasoupService.updateTenantSettings(tenantId, {
            video_enabled: body.videoEnabled,
            max_concurrent_rooms: body.maxConcurrentRooms,
            max_room_participants: body.maxRoomParticipants,
            max_room_duration_minutes: body.maxRoomDurationMinutes,
            default_video_quality: body.defaultVideoQuality,
            simulcast_enabled: body.simulcastEnabled,
            recording_enabled: body.recordingEnabled,
            recording_retention_days: body.recordingRetentionDays,
            transcription_enabled: body.transcriptionEnabled,
            ai_summary_enabled: body.aiSummaryEnabled,
            branding: body.branding
        });

        return c.json({ success: true, settings });

    } catch (error) {
        console.error('[VideoAPI] Update settings error:', error);
        return c.json({ error: 'Failed to update settings', message: error.message }, 500);
    }
});

// ============================================
// Analytics
// ============================================

/**
 * Get video usage analytics
 * GET /v1/video-calls/analytics
 */
videoCalls.get('/analytics', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;

        const startDate = c.req.query('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = c.req.query('endDate') || new Date().toISOString();

        const usage = await mediasoupService.getTenantUsage(tenantId, startDate, endDate);

        return c.json({
            analytics: {
                totalRooms: parseInt(usage.total_rooms) || 0,
                totalDurationMinutes: Math.round((parseFloat(usage.total_duration_seconds) || 0) / 60),
                uniqueHosts: parseInt(usage.unique_hosts) || 0,
                totalParticipants: parseInt(usage.total_participants) || 0,
                totalRecordings: parseInt(usage.total_recordings) || 0
            },
            period: { startDate, endDate }
        });

    } catch (error) {
        console.error('[VideoAPI] Get analytics error:', error);
        return c.json({ error: 'Failed to get analytics', message: error.message }, 500);
    }
});

/**
 * Get room analytics
 * GET /v1/video-calls/rooms/:roomId/analytics
 */
videoCalls.get('/rooms/:roomId/analytics', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId, tenantId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        const analytics = await mediasoupService.getRoomAnalytics(roomId);

        return c.json({
            analytics: {
                totalParticipants: parseInt(analytics.total_participants) || 0,
                avgBitrate: Math.round(parseFloat(analytics.avg_bitrate) || 0),
                avgJitterMs: parseFloat(analytics.avg_jitter) || 0,
                avgRttMs: parseFloat(analytics.avg_rtt) || 0,
                packetsLost: parseInt(analytics.total_packets_lost) || 0,
                totalPackets: parseInt(analytics.total_packets) || 0,
                packetLossRate: analytics.total_packets > 0
                    ? ((analytics.total_packets_lost / analytics.total_packets) * 100).toFixed(2)
                    : 0
            }
        });

    } catch (error) {
        console.error('[VideoAPI] Get room analytics error:', error);
        return c.json({ error: 'Failed to get analytics', message: error.message }, 500);
    }
});

// ============================================
// ICE Servers
// ============================================

/**
 * Get ICE servers configuration
 * GET /v1/video-calls/ice-servers
 */
videoCalls.get('/ice-servers', async (c) => {
    try {
        const user = c.get('user');
        const tenantId = user?.tenantId;

        const iceServers = await mediasoupService.getIceServers(tenantId);

        return c.json({ iceServers });

    } catch (error) {
        console.error('[VideoAPI] Get ICE servers error:', error);
        return c.json({ error: 'Failed to get ICE servers', message: error.message }, 500);
    }
});

export default videoCalls;
