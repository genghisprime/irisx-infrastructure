/**
 * Admin Video Calling Management Routes
 * Platform-level video call administration
 */

import { Hono } from 'hono';
import { authenticateAdmin, requireAdminRole } from './admin-auth.js';
import mediasoupService from '../services/mediasoup.js';
import pool from '../db/connection.js';

// Alias for backwards compatibility with existing code
const requireRole = requireAdminRole;

const adminVideo = new Hono();

// Apply admin authentication to all routes
adminVideo.use('*', authenticateAdmin);

// ============================================
// Platform Statistics
// ============================================

/**
 * Get platform video statistics
 * GET /admin/video/stats
 */
adminVideo.get('/stats', async (c) => {
    try {
        const stats = await mediasoupService.getPlatformStats();

        return c.json({
            stats: {
                activeRooms: parseInt(stats.active_rooms) || 0,
                connectedParticipants: parseInt(stats.connected_participants) || 0,
                activeRecordings: parseInt(stats.active_recordings) || 0,
                activeWorkers: parseInt(stats.active_workers) || 0,
                activeRouters: parseInt(stats.active_routers) || 0,
                roomsLast24h: parseInt(stats.rooms_last_24h) || 0,
                minutesLast24h: Math.round((parseFloat(stats.minutes_last_24h) || 0) / 60)
            }
        });

    } catch (error) {
        console.error('[AdminVideo] Get stats error:', error);
        return c.json({ error: 'Failed to get statistics', message: error.message }, 500);
    }
});

// ============================================
// Active Rooms Management
// ============================================

/**
 * Get all active rooms across all tenants
 * GET /admin/video/rooms
 */
adminVideo.get('/rooms', async (c) => {
    try {
        const status = c.req.query('status') || 'active';
        const tenantId = c.req.query('tenantId');
        const limit = parseInt(c.req.query('limit')) || 100;
        const offset = parseInt(c.req.query('offset')) || 0;

        let query = `
            SELECT vr.*, t.name as tenant_name, t.subdomain as tenant_subdomain,
                   u.email as host_email, u.name as host_name,
                   (SELECT COUNT(*) FROM video_participants WHERE video_room_id = vr.id AND status = 'connected') as participant_count
            FROM video_rooms vr
            JOIN tenants t ON vr.tenant_id = t.id
            LEFT JOIN users u ON vr.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            params.push(status);
            query += ` AND vr.status = $${params.length}`;
        }

        if (tenantId) {
            params.push(tenantId);
            query += ` AND vr.tenant_id = $${params.length}`;
        }

        query += ` ORDER BY vr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM video_rooms WHERE 1=1`;
        const countParams = [];

        if (status && status !== 'all') {
            countParams.push(status);
            countQuery += ` AND status = $${countParams.length}`;
        }

        if (tenantId) {
            countParams.push(tenantId);
            countQuery += ` AND tenant_id = $${countParams.length}`;
        }

        const countResult = await pool.query(countQuery, countParams);

        return c.json({
            rooms: result.rows.map(r => ({
                id: r.id,
                name: r.name,
                roomCode: r.room_code,
                roomType: r.room_type,
                status: r.status,
                tenant: {
                    id: r.tenant_id,
                    name: r.tenant_name,
                    subdomain: r.tenant_subdomain
                },
                host: {
                    email: r.host_email,
                    name: r.host_name
                },
                participantCount: parseInt(r.participant_count),
                maxParticipants: r.max_participants,
                startedAt: r.started_at,
                createdAt: r.created_at
            })),
            total: parseInt(countResult.rows[0].count),
            limit,
            offset
        });

    } catch (error) {
        console.error('[AdminVideo] Get rooms error:', error);
        return c.json({ error: 'Failed to get rooms', message: error.message }, 500);
    }
});

/**
 * Force end a room
 * POST /admin/video/rooms/:roomId/end
 */
adminVideo.post('/rooms/:roomId/end', requireRole(['superadmin', 'admin']), async (c) => {
    try {
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        await mediasoupService.endRoom(roomId);

        return c.json({ success: true, message: 'Room ended' });

    } catch (error) {
        console.error('[AdminVideo] Force end room error:', error);
        return c.json({ error: 'Failed to end room', message: error.message }, 500);
    }
});

/**
 * Get room details with full participant info
 * GET /admin/video/rooms/:roomId
 */
adminVideo.get('/rooms/:roomId', async (c) => {
    try {
        const roomId = c.req.param('roomId');

        const room = await mediasoupService.getRoom(roomId);

        if (!room) {
            return c.json({ error: 'Room not found' }, 404);
        }

        const participants = await mediasoupService.getRoomParticipants(roomId);
        const analytics = await mediasoupService.getRoomAnalytics(roomId);
        const recordings = await pool.query(
            `SELECT id, status, format, duration_seconds, started_at FROM video_recordings WHERE video_room_id = $1`,
            [roomId]
        );

        return c.json({
            room: {
                id: room.id,
                name: room.name,
                roomCode: room.room_code,
                roomType: room.room_type,
                status: room.status,
                settings: room.settings,
                maxParticipants: room.max_participants,
                tenantId: room.tenant_id,
                createdBy: room.created_by,
                startedAt: room.started_at,
                endedAt: room.ended_at,
                durationSeconds: room.duration_seconds,
                createdAt: room.created_at
            },
            participants: participants.map(p => ({
                id: p.id,
                userId: p.user_id,
                displayName: p.display_name,
                email: p.email,
                role: p.role,
                status: p.status,
                isAudioEnabled: p.is_audio_enabled,
                isVideoEnabled: p.is_video_enabled,
                isScreensharing: p.is_screensharing,
                networkQuality: p.network_quality,
                joinedAt: p.joined_at,
                leftAt: p.left_at
            })),
            analytics,
            recordings: recordings.rows
        });

    } catch (error) {
        console.error('[AdminVideo] Get room details error:', error);
        return c.json({ error: 'Failed to get room details', message: error.message }, 500);
    }
});

// ============================================
// Worker Management
// ============================================

/**
 * Get MediaSoup worker status
 * GET /admin/video/workers
 */
adminVideo.get('/workers', async (c) => {
    try {
        const workers = await mediasoupService.getWorkerStatus();

        return c.json({
            workers: workers.map(w => ({
                id: w.id,
                workerId: w.worker_id,
                pid: w.pid,
                hostname: w.hostname,
                port: w.port,
                status: w.status,
                cpuUsage: w.cpu_usage,
                memoryUsage: w.memory_usage,
                activeRouters: w.active_routers,
                maxRouters: w.max_routers,
                rtpPortRange: `${w.rtp_port_range_start}-${w.rtp_port_range_end}`,
                lastHeartbeatAt: w.last_heartbeat_at,
                createdAt: w.created_at
            }))
        });

    } catch (error) {
        console.error('[AdminVideo] Get workers error:', error);
        return c.json({ error: 'Failed to get workers', message: error.message }, 500);
    }
});

// ============================================
// Platform Configuration
// ============================================

/**
 * Get platform video configuration
 * GET /admin/video/config
 */
adminVideo.get('/config', async (c) => {
    try {
        const result = await pool.query(
            `SELECT config_key, config_value, description, is_active, updated_at FROM platform_video_config ORDER BY config_key`
        );

        return c.json({
            config: result.rows.reduce((acc, row) => {
                acc[row.config_key] = {
                    value: row.config_value,
                    description: row.description,
                    isActive: row.is_active,
                    updatedAt: row.updated_at
                };
                return acc;
            }, {})
        });

    } catch (error) {
        console.error('[AdminVideo] Get config error:', error);
        return c.json({ error: 'Failed to get configuration', message: error.message }, 500);
    }
});

/**
 * Update platform video configuration
 * PATCH /admin/video/config/:configKey
 */
adminVideo.patch('/config/:configKey', requireRole(['superadmin']), async (c) => {
    try {
        const configKey = c.req.param('configKey');
        const body = await c.req.json();

        const result = await mediasoupService.updatePlatformConfig(configKey, body.value);

        if (!result) {
            return c.json({ error: 'Configuration key not found' }, 404);
        }

        return c.json({ success: true, config: result });

    } catch (error) {
        console.error('[AdminVideo] Update config error:', error);
        return c.json({ error: 'Failed to update configuration', message: error.message }, 500);
    }
});

// ============================================
// Tenant Video Settings
// ============================================

/**
 * Get all tenant video settings
 * GET /admin/video/tenants
 */
adminVideo.get('/tenants', async (c) => {
    try {
        const result = await pool.query(
            `SELECT tvs.*, t.name as tenant_name, t.subdomain
             FROM tenant_video_settings tvs
             JOIN tenants t ON tvs.tenant_id = t.id
             ORDER BY t.name`
        );

        return c.json({
            tenants: result.rows.map(t => ({
                tenantId: t.tenant_id,
                tenantName: t.tenant_name,
                subdomain: t.subdomain,
                videoEnabled: t.video_enabled,
                maxConcurrentRooms: t.max_concurrent_rooms,
                maxRoomParticipants: t.max_room_participants,
                recordingEnabled: t.recording_enabled,
                updatedAt: t.updated_at
            }))
        });

    } catch (error) {
        console.error('[AdminVideo] Get tenant settings error:', error);
        return c.json({ error: 'Failed to get tenant settings', message: error.message }, 500);
    }
});

/**
 * Update tenant video settings
 * PATCH /admin/video/tenants/:tenantId
 */
adminVideo.patch('/tenants/:tenantId', requireRole(['superadmin', 'admin']), async (c) => {
    try {
        const tenantId = c.req.param('tenantId');
        const body = await c.req.json();

        const settings = await mediasoupService.updateTenantSettings(tenantId, body);

        return c.json({ success: true, settings });

    } catch (error) {
        console.error('[AdminVideo] Update tenant settings error:', error);
        return c.json({ error: 'Failed to update tenant settings', message: error.message }, 500);
    }
});

// ============================================
// Recordings Management
// ============================================

/**
 * Get all recordings
 * GET /admin/video/recordings
 */
adminVideo.get('/recordings', async (c) => {
    try {
        const status = c.req.query('status');
        const tenantId = c.req.query('tenantId');
        const limit = parseInt(c.req.query('limit')) || 50;
        const offset = parseInt(c.req.query('offset')) || 0;

        let query = `
            SELECT vr.*, t.name as tenant_name, room.name as room_name, room.room_code
            FROM video_recordings vr
            JOIN tenants t ON vr.tenant_id = t.id
            JOIN video_rooms room ON vr.video_room_id = room.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND vr.status = $${params.length}`;
        }

        if (tenantId) {
            params.push(tenantId);
            query += ` AND vr.tenant_id = $${params.length}`;
        }

        query += ` ORDER BY vr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return c.json({
            recordings: result.rows.map(r => ({
                id: r.id,
                roomId: r.video_room_id,
                roomName: r.room_name,
                roomCode: r.room_code,
                tenantId: r.tenant_id,
                tenantName: r.tenant_name,
                recordingType: r.recording_type,
                status: r.status,
                format: r.format,
                resolution: r.resolution,
                durationSeconds: r.duration_seconds,
                fileSize: r.file_size,
                startedAt: r.started_at,
                stoppedAt: r.stopped_at,
                createdAt: r.created_at
            })),
            total: result.rows.length,
            limit,
            offset
        });

    } catch (error) {
        console.error('[AdminVideo] Get recordings error:', error);
        return c.json({ error: 'Failed to get recordings', message: error.message }, 500);
    }
});

/**
 * Delete recording
 * DELETE /admin/video/recordings/:recordingId
 */
adminVideo.delete('/recordings/:recordingId', requireRole(['superadmin', 'admin']), async (c) => {
    try {
        const recordingId = c.req.param('recordingId');

        // Get recording info for S3 cleanup
        const result = await pool.query(
            `SELECT s3_key, s3_bucket FROM video_recordings WHERE id = $1`,
            [recordingId]
        );

        if (!result.rows[0]) {
            return c.json({ error: 'Recording not found' }, 404);
        }

        // TODO: Delete from S3

        // Delete from database
        await pool.query(`DELETE FROM video_recordings WHERE id = $1`, [recordingId]);

        return c.json({ success: true, message: 'Recording deleted' });

    } catch (error) {
        console.error('[AdminVideo] Delete recording error:', error);
        return c.json({ error: 'Failed to delete recording', message: error.message }, 500);
    }
});

// ============================================
// Quality Alerts
// ============================================

/**
 * Get quality alerts
 * GET /admin/video/alerts
 */
adminVideo.get('/alerts', async (c) => {
    try {
        const severity = c.req.query('severity');
        const resolved = c.req.query('resolved');
        const limit = parseInt(c.req.query('limit')) || 100;

        let query = `
            SELECT qa.*, vr.name as room_name, vr.room_code, t.name as tenant_name
            FROM video_quality_alerts qa
            JOIN video_rooms vr ON qa.video_room_id = vr.id
            JOIN tenants t ON qa.tenant_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (severity) {
            params.push(severity);
            query += ` AND qa.severity = $${params.length}`;
        }

        if (resolved === 'true') {
            query += ` AND qa.resolved_at IS NOT NULL`;
        } else if (resolved === 'false') {
            query += ` AND qa.resolved_at IS NULL`;
        }

        query += ` ORDER BY qa.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await pool.query(query, params);

        return c.json({
            alerts: result.rows.map(a => ({
                id: a.id,
                roomId: a.video_room_id,
                roomName: a.room_name,
                roomCode: a.room_code,
                tenantName: a.tenant_name,
                alertType: a.alert_type,
                severity: a.severity,
                message: a.message,
                metricName: a.metric_name,
                metricValue: a.metric_value,
                thresholdValue: a.threshold_value,
                resolvedAt: a.resolved_at,
                createdAt: a.created_at
            }))
        });

    } catch (error) {
        console.error('[AdminVideo] Get alerts error:', error);
        return c.json({ error: 'Failed to get alerts', message: error.message }, 500);
    }
});

// ============================================
// Analytics
// ============================================

/**
 * Get platform-wide video analytics
 * GET /admin/video/analytics
 */
adminVideo.get('/analytics', async (c) => {
    try {
        const startDate = c.req.query('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = c.req.query('endDate') || new Date().toISOString();

        // Overall stats
        const overallResult = await pool.query(
            `SELECT
                COUNT(*) as total_rooms,
                SUM(duration_seconds) as total_duration,
                COUNT(DISTINCT tenant_id) as active_tenants,
                COUNT(DISTINCT created_by) as unique_hosts
             FROM video_rooms
             WHERE created_at BETWEEN $1 AND $2`,
            [startDate, endDate]
        );

        // Participant stats
        const participantResult = await pool.query(
            `SELECT COUNT(*) as total_participants
             FROM video_participants
             WHERE joined_at BETWEEN $1 AND $2`,
            [startDate, endDate]
        );

        // Recording stats
        const recordingResult = await pool.query(
            `SELECT
                COUNT(*) as total_recordings,
                SUM(file_size) as total_storage_bytes,
                SUM(duration_seconds) as total_recording_duration
             FROM video_recordings
             WHERE created_at BETWEEN $1 AND $2`,
            [startDate, endDate]
        );

        // Daily breakdown
        const dailyResult = await pool.query(
            `SELECT
                DATE(created_at) as date,
                COUNT(*) as rooms,
                SUM(duration_seconds) as duration
             FROM video_rooms
             WHERE created_at BETWEEN $1 AND $2
             GROUP BY DATE(created_at)
             ORDER BY date`,
            [startDate, endDate]
        );

        // Top tenants by usage
        const topTenantsResult = await pool.query(
            `SELECT
                t.id, t.name,
                COUNT(vr.id) as room_count,
                SUM(vr.duration_seconds) as total_duration
             FROM tenants t
             LEFT JOIN video_rooms vr ON t.id = vr.tenant_id AND vr.created_at BETWEEN $1 AND $2
             GROUP BY t.id, t.name
             HAVING COUNT(vr.id) > 0
             ORDER BY total_duration DESC NULLS LAST
             LIMIT 10`,
            [startDate, endDate]
        );

        const overall = overallResult.rows[0];
        const participants = participantResult.rows[0];
        const recordings = recordingResult.rows[0];

        return c.json({
            analytics: {
                overview: {
                    totalRooms: parseInt(overall.total_rooms) || 0,
                    totalMinutes: Math.round((parseFloat(overall.total_duration) || 0) / 60),
                    activeTenants: parseInt(overall.active_tenants) || 0,
                    uniqueHosts: parseInt(overall.unique_hosts) || 0,
                    totalParticipants: parseInt(participants.total_participants) || 0,
                    totalRecordings: parseInt(recordings.total_recordings) || 0,
                    totalStorageGB: ((parseInt(recordings.total_storage_bytes) || 0) / (1024 * 1024 * 1024)).toFixed(2),
                    totalRecordingMinutes: Math.round((parseFloat(recordings.total_recording_duration) || 0) / 60)
                },
                daily: dailyResult.rows.map(d => ({
                    date: d.date,
                    rooms: parseInt(d.rooms),
                    minutes: Math.round((parseFloat(d.duration) || 0) / 60)
                })),
                topTenants: topTenantsResult.rows.map(t => ({
                    id: t.id,
                    name: t.name,
                    roomCount: parseInt(t.room_count),
                    totalMinutes: Math.round((parseFloat(t.total_duration) || 0) / 60)
                }))
            },
            period: { startDate, endDate }
        });

    } catch (error) {
        console.error('[AdminVideo] Get analytics error:', error);
        return c.json({ error: 'Failed to get analytics', message: error.message }, 500);
    }
});

export default adminVideo;
