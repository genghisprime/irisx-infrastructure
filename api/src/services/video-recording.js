/**
 * Video Recording Service
 * Handles video recording storage and processing with S3
 */

import { pool } from '../database.js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined // Use default credentials chain if not explicitly set
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'irisx-video-recordings';
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

class VideoRecordingService {
    /**
     * Start a new recording session
     */
    async startRecording(roomId, tenantId, options = {}) {
        const recordingId = crypto.randomUUID();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const s3Key = `recordings/${tenantId}/${roomId}/${recordingId}_${timestamp}.${options.format || 'mp4'}`;

        const result = await pool.query(
            `INSERT INTO video_recordings (
                id, video_room_id, tenant_id, recording_type, status, format,
                resolution, framerate, bitrate, s3_bucket, s3_key, started_at
            ) VALUES ($1, $2, $3, $4, 'recording', $5, $6, $7, $8, $9, $10, NOW())
            RETURNING *`,
            [
                recordingId,
                roomId,
                tenantId,
                options.recordingType || 'composite',
                options.format || 'mp4',
                options.resolution || '1280x720',
                options.framerate || 30,
                options.bitrate || 2500000,
                BUCKET_NAME,
                s3Key
            ]
        );

        return result.rows[0];
    }

    /**
     * Stop an active recording
     */
    async stopRecording(recordingId) {
        await pool.query(
            `UPDATE video_recordings
             SET status = 'processing', stopped_at = NOW()
             WHERE id = $1`,
            [recordingId]
        );
    }

    /**
     * Upload recording data to S3
     */
    async uploadRecording(recordingId, buffer, contentType = 'video/mp4') {
        // Get recording info
        const recordingResult = await pool.query(
            `SELECT * FROM video_recordings WHERE id = $1`,
            [recordingId]
        );

        const recording = recordingResult.rows[0];
        if (!recording) {
            throw new Error('Recording not found');
        }

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: recording.s3_key,
            Body: buffer,
            ContentType: contentType,
            Metadata: {
                'recording-id': recordingId,
                'room-id': recording.video_room_id,
                'tenant-id': recording.tenant_id
            }
        }));

        // Calculate duration from video metadata or room duration
        const roomResult = await pool.query(
            `SELECT duration_seconds FROM video_rooms WHERE id = $1`,
            [recording.video_room_id]
        );

        const durationSeconds = roomResult.rows[0]?.duration_seconds || 0;

        // Update recording with S3 URL and file info
        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${recording.s3_key}`;

        await pool.query(
            `UPDATE video_recordings
             SET status = 'completed', s3_url = $2, file_size = $3,
                 duration_seconds = $4, processed_at = NOW()
             WHERE id = $1`,
            [recordingId, s3Url, buffer.length, durationSeconds]
        );

        return {
            s3Url,
            fileSize: buffer.length,
            durationSeconds
        };
    }

    /**
     * Upload recording segment (for individual participant recordings)
     */
    async uploadSegment(recordingId, participantId, segmentType, buffer, contentType = 'video/webm') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const s3Key = `segments/${recordingId}/${participantId}_${segmentType}_${timestamp}.webm`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: buffer,
            ContentType: contentType
        }));

        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

        await pool.query(
            `INSERT INTO video_recording_segments (
                recording_id, participant_id, segment_type, s3_key, s3_url, file_size
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [recordingId, participantId, segmentType, s3Key, s3Url, buffer.length]
        );

        return { s3Key, s3Url };
    }

    /**
     * Generate presigned URL for download
     */
    async getPresignedDownloadUrl(recordingId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM video_recordings WHERE id = $1 AND tenant_id = $2`,
            [recordingId, tenantId]
        );

        const recording = result.rows[0];
        if (!recording) {
            throw new Error('Recording not found');
        }

        if (recording.status !== 'completed') {
            throw new Error('Recording not ready for download');
        }

        // Check if existing presigned URL is still valid
        if (recording.presigned_url && recording.presigned_url_expires_at > new Date()) {
            return {
                url: recording.presigned_url,
                expiresAt: recording.presigned_url_expires_at
            };
        }

        // Generate new presigned URL
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: recording.s3_key
        });

        const presignedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: PRESIGNED_URL_EXPIRY
        });

        const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY * 1000);

        // Store presigned URL
        await pool.query(
            `UPDATE video_recordings
             SET presigned_url = $2, presigned_url_expires_at = $3
             WHERE id = $1`,
            [recordingId, presignedUrl, expiresAt]
        );

        return {
            url: presignedUrl,
            expiresAt
        };
    }

    /**
     * Generate thumbnail from recording
     */
    async generateThumbnail(recordingId) {
        const result = await pool.query(
            `SELECT * FROM video_recordings WHERE id = $1`,
            [recordingId]
        );

        const recording = result.rows[0];
        if (!recording) {
            throw new Error('Recording not found');
        }

        // In production, this would use FFmpeg or a video processing service
        // For now, we'll just mark that thumbnail generation was requested
        const thumbnailKey = recording.s3_key.replace(/\.[^.]+$/, '_thumb.jpg');
        const thumbnailUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${thumbnailKey}`;

        await pool.query(
            `UPDATE video_recordings SET thumbnail_url = $2 WHERE id = $1`,
            [recordingId, thumbnailUrl]
        );

        return thumbnailUrl;
    }

    /**
     * Delete a recording
     */
    async deleteRecording(recordingId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM video_recordings WHERE id = $1 AND tenant_id = $2`,
            [recordingId, tenantId]
        );

        const recording = result.rows[0];
        if (!recording) {
            throw new Error('Recording not found');
        }

        // Delete from S3
        if (recording.s3_key) {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: recording.s3_key
                }));
            } catch (error) {
                console.error(`[VideoRecording] Failed to delete S3 object: ${error.message}`);
            }
        }

        // Delete thumbnail if exists
        if (recording.thumbnail_url) {
            const thumbnailKey = recording.s3_key.replace(/\.[^.]+$/, '_thumb.jpg');
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: thumbnailKey
                }));
            } catch (error) {
                // Thumbnail might not exist
            }
        }

        // Delete segments
        const segmentsResult = await pool.query(
            `SELECT s3_key FROM video_recording_segments WHERE recording_id = $1`,
            [recordingId]
        );

        for (const segment of segmentsResult.rows) {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: segment.s3_key
                }));
            } catch (error) {
                // Continue even if segment deletion fails
            }
        }

        // Delete from database
        await pool.query(`DELETE FROM video_recording_segments WHERE recording_id = $1`, [recordingId]);
        await pool.query(`DELETE FROM video_recordings WHERE id = $1`, [recordingId]);

        return { deleted: true };
    }

    /**
     * Get recording by ID
     */
    async getRecording(recordingId, tenantId) {
        const result = await pool.query(
            `SELECT vr.*, vrm.name as room_name, vrm.room_code
             FROM video_recordings vr
             JOIN video_rooms vrm ON vr.video_room_id = vrm.id
             WHERE vr.id = $1 AND vr.tenant_id = $2`,
            [recordingId, tenantId]
        );

        return result.rows[0] || null;
    }

    /**
     * List recordings for a room
     */
    async getRecordingsForRoom(roomId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM video_recordings
             WHERE video_room_id = $1 AND tenant_id = $2
             ORDER BY created_at DESC`,
            [roomId, tenantId]
        );

        return result.rows;
    }

    /**
     * List recordings for a tenant
     */
    async getRecordingsForTenant(tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT vr.*, vrm.name as room_name, vrm.room_code
            FROM video_recordings vr
            JOIN video_rooms vrm ON vr.video_room_id = vrm.id
            WHERE vr.tenant_id = $1
        `;
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
     * Apply retention policy - delete old recordings
     */
    async applyRetentionPolicy(tenantId) {
        // Get tenant settings
        const settingsResult = await pool.query(
            `SELECT recording_retention_days FROM tenant_video_settings WHERE tenant_id = $1`,
            [tenantId]
        );

        const retentionDays = settingsResult.rows[0]?.recording_retention_days || 90;

        // Find recordings older than retention period
        const oldRecordingsResult = await pool.query(
            `SELECT id FROM video_recordings
             WHERE tenant_id = $1 AND created_at < NOW() - INTERVAL '${retentionDays} days'
             AND status = 'completed'`,
            [tenantId]
        );

        let deletedCount = 0;
        for (const recording of oldRecordingsResult.rows) {
            try {
                await this.deleteRecording(recording.id, tenantId);
                deletedCount++;
            } catch (error) {
                console.error(`[VideoRecording] Failed to delete old recording ${recording.id}:`, error.message);
            }
        }

        return { deletedCount };
    }

    /**
     * Get storage usage for tenant
     */
    async getStorageUsage(tenantId) {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total_recordings,
                SUM(file_size) as total_bytes,
                SUM(duration_seconds) as total_duration_seconds
             FROM video_recordings
             WHERE tenant_id = $1 AND status = 'completed'`,
            [tenantId]
        );

        const row = result.rows[0];
        return {
            totalRecordings: parseInt(row.total_recordings) || 0,
            totalBytes: parseInt(row.total_bytes) || 0,
            totalDurationSeconds: parseFloat(row.total_duration_seconds) || 0,
            totalGB: ((parseInt(row.total_bytes) || 0) / (1024 * 1024 * 1024)).toFixed(2)
        };
    }

    /**
     * Initiate transcription for a recording
     */
    async initiateTranscription(recordingId) {
        // Mark recording as pending transcription
        await pool.query(
            `UPDATE video_recordings SET transcription_status = 'pending' WHERE id = $1`,
            [recordingId]
        );

        // In production, this would send the recording to a transcription service
        // For now, we'll simulate the process

        return { status: 'pending', message: 'Transcription initiated' };
    }

    /**
     * Update transcription result
     */
    async updateTranscription(recordingId, transcriptionText) {
        await pool.query(
            `UPDATE video_recordings
             SET transcription_status = 'completed', transcription_text = $2
             WHERE id = $1`,
            [recordingId, transcriptionText]
        );
    }
}

export default new VideoRecordingService();
