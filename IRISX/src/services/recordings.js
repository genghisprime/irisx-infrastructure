/**
 * Call Recordings Service
 * Handles call recording storage, retrieval, and management with S3 integration
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { query } from '../db/index.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

class RecordingsService {
  constructor() {
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    this.defaultBucket = process.env.S3_RECORDINGS_BUCKET || 'irisx-recordings';
  }

  /**
   * Upload recording file to S3
   * @param {string} filePath - Local file path
   * @param {object} metadata - Recording metadata
   * @returns {Promise<object>} Upload result with S3 URL
   */
  async uploadRecording(filePath, metadata) {
    try {
      const { tenantId, callUuid, fileFormat = 'wav' } = metadata;

      // Get file size
      const stats = await stat(filePath);
      const fileSizeBytes = stats.size;

      // Generate S3 key with tenant isolation
      const s3Key = `recordings/${tenantId}/${callUuid}.${fileFormat}`;

      // Read file stream
      const fileStream = createReadStream(filePath);

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: this.defaultBucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: this.getContentType(fileFormat),
        Metadata: {
          tenant_id: String(tenantId),
          call_uuid: callUuid,
          uploaded_at: new Date().toISOString()
        }
      });

      await this.s3Client.send(uploadCommand);

      // Construct S3 URL
      const s3Url = `https://${this.defaultBucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;

      return {
        s3_url: s3Url,
        s3_bucket: this.defaultBucket,
        s3_key: s3Key,
        file_size_bytes: fileSizeBytes
      };
    } catch (error) {
      console.error('[RecordingsService] Upload error:', error);
      throw new Error(`Failed to upload recording: ${error.message}`);
    }
  }

  /**
   * Create recording record in database
   * @param {object} recordingData - Recording data
   * @returns {Promise<object>} Created recording
   */
  async createRecording(recordingData) {
    const {
      tenant_id,
      call_id,
      call_uuid,
      recording_url,
      s3_bucket,
      s3_key,
      file_format = 'wav',
      duration_seconds,
      file_size_bytes,
      recording_mode = 'full',
      channels = 1,
      sample_rate = 8000,
      retention_days = 90
    } = recordingData;

    // Calculate retention date
    const retentionUntil = new Date();
    retentionUntil.setDate(retentionUntil.getDate() + retention_days);

    const sql = `
      INSERT INTO call_recordings (
        tenant_id, call_id, call_uuid, recording_url, s3_bucket, s3_key,
        file_format, duration_seconds, file_size_bytes, recording_mode,
        channels, sample_rate, status, completed_at, retention_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, call_id, call_uuid, recording_url, s3_bucket, s3_key,
      file_format, duration_seconds, file_size_bytes, recording_mode,
      channels, sample_rate, 'available', retentionUntil.toISOString().split('T')[0]
    ]);

    return result.rows[0];
  }

  /**
   * Get recording by ID
   * @param {number} recordingId - Recording ID
   * @param {number} tenantId - Tenant ID for security
   * @returns {Promise<object>} Recording data
   */
  async getRecording(recordingId, tenantId) {
    const sql = `
      SELECT r.*, c.from_number, c.to_number, c.direction, c.duration_seconds as call_duration
      FROM call_recordings r
      LEFT JOIN calls c ON r.call_id = c.id
      WHERE r.id = $1 AND r.tenant_id = $2 AND r.is_deleted = FALSE
    `;

    const result = await query(sql, [recordingId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Recording not found');
    }

    return result.rows[0];
  }

  /**
   * List recordings with filters
   * @param {number} tenantId - Tenant ID
   * @param {object} filters - Query filters
   * @returns {Promise<object>} List of recordings
   */
  async listRecordings(tenantId, filters = {}) {
    const { call_uuid, status = 'available', limit = 50, offset = 0, start_date, end_date } = filters;

    let sql = `
      SELECT r.*, c.from_number, c.to_number, c.direction
      FROM call_recordings r
      LEFT JOIN calls c ON r.call_id = c.id
      WHERE r.tenant_id = $1 AND r.is_deleted = FALSE
    `;

    const params = [tenantId];
    let paramIndex = 2;

    if (call_uuid) {
      sql += ` AND r.call_uuid = $${paramIndex}`;
      params.push(call_uuid);
      paramIndex++;
    }

    if (status) {
      sql += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (start_date) {
      sql += ` AND r.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      sql += ` AND r.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) FROM call_recordings WHERE tenant_id = $1 AND is_deleted = FALSE`;
    const countParams = [tenantId];
    const countResult = await query(countSql, countParams);

    return {
      recordings: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get recordings for a specific call
   * @param {string} callUuid - Call UUID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of recordings for the call
   */
  async getRecordingsByCall(callUuid, tenantId) {
    const sql = `
      SELECT * FROM call_recordings
      WHERE call_uuid = $1 AND tenant_id = $2 AND is_deleted = FALSE
      ORDER BY created_at ASC
    `;

    const result = await query(sql, [callUuid, tenantId]);
    return result.rows;
  }

  /**
   * Generate presigned download URL
   * @param {number} recordingId - Recording ID
   * @param {number} tenantId - Tenant ID
   * @param {number} expiresIn - URL expiration in seconds (default: 900 = 15 min)
   * @returns {Promise<object>} Presigned URL
   */
  async getDownloadUrl(recordingId, tenantId, expiresIn = 900) {
    const recording = await this.getRecording(recordingId, tenantId);

    if (recording.status !== 'available') {
      throw new Error('Recording is not available for download');
    }

    const command = new GetObjectCommand({
      Bucket: recording.s3_bucket,
      Key: recording.s3_key
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      recording_id: recording.id,
      download_url: presignedUrl,
      expires_in: expiresIn,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      file_format: recording.file_format,
      file_size_bytes: recording.file_size_bytes,
      duration_seconds: recording.duration_seconds
    };
  }

  /**
   * Soft delete recording (mark as deleted)
   * @param {number} recordingId - Recording ID
   * @param {number} tenantId - Tenant ID
   * @param {string} reason - Deletion reason
   * @returns {Promise<object>} Updated recording
   */
  async deleteRecording(recordingId, tenantId, reason = 'User requested deletion') {
    const sql = `
      UPDATE call_recordings
      SET is_deleted = TRUE, deleted_at = NOW(), delete_reason = $3, status = 'deleted'
      WHERE id = $1 AND tenant_id = $2 AND is_deleted = FALSE
      RETURNING *
    `;

    const result = await query(sql, [recordingId, tenantId, reason]);

    if (result.rows.length === 0) {
      throw new Error('Recording not found or already deleted');
    }

    return result.rows[0];
  }

  /**
   * Permanently delete recording from S3
   * @param {number} recordingId - Recording ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<object>} Deletion result
   */
  async permanentlyDeleteRecording(recordingId, tenantId) {
    const recording = await this.getRecording(recordingId, tenantId);

    // Delete from S3
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: recording.s3_bucket,
        Key: recording.s3_key
      });

      await this.s3Client.send(deleteCommand);
    } catch (error) {
      console.error('[RecordingsService] S3 deletion error:', error);
      // Continue even if S3 deletion fails (recording might already be deleted)
    }

    // Delete from database
    const sql = `
      DELETE FROM call_recordings
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
    `;

    const result = await query(sql, [recordingId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Recording not found');
    }

    return { deleted: true, recording_id: recordingId };
  }

  /**
   * Get or create tenant recording settings
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<object>} Recording settings
   */
  async getRecordingSettings(tenantId) {
    let sql = `SELECT * FROM tenant_recording_settings WHERE tenant_id = $1`;
    let result = await query(sql, [tenantId]);

    if (result.rows.length === 0) {
      // Create default settings
      sql = `
        INSERT INTO tenant_recording_settings (tenant_id, record_all_calls, file_format, retention_days)
        VALUES ($1, FALSE, 'wav', 90)
        RETURNING *
      `;
      result = await query(sql, [tenantId]);
    }

    return result.rows[0];
  }

  /**
   * Update tenant recording settings
   * @param {number} tenantId - Tenant ID
   * @param {object} settings - New settings
   * @returns {Promise<object>} Updated settings
   */
  async updateRecordingSettings(tenantId, settings) {
    const {
      record_all_calls,
      record_inbound,
      record_outbound,
      file_format,
      channels,
      sample_rate,
      retention_days,
      auto_delete_after_retention,
      enable_encryption,
      auto_transcribe,
      play_beep
    } = settings;

    const updates = [];
    const values = [tenantId];
    let paramIndex = 2;

    if (record_all_calls !== undefined) {
      updates.push(`record_all_calls = $${paramIndex}`);
      values.push(record_all_calls);
      paramIndex++;
    }

    if (record_inbound !== undefined) {
      updates.push(`record_inbound = $${paramIndex}`);
      values.push(record_inbound);
      paramIndex++;
    }

    if (record_outbound !== undefined) {
      updates.push(`record_outbound = $${paramIndex}`);
      values.push(record_outbound);
      paramIndex++;
    }

    if (file_format) {
      updates.push(`file_format = $${paramIndex}`);
      values.push(file_format);
      paramIndex++;
    }

    if (channels) {
      updates.push(`channels = $${paramIndex}`);
      values.push(channels);
      paramIndex++;
    }

    if (sample_rate) {
      updates.push(`sample_rate = $${paramIndex}`);
      values.push(sample_rate);
      paramIndex++;
    }

    if (retention_days) {
      updates.push(`retention_days = $${paramIndex}`);
      values.push(retention_days);
      paramIndex++;
    }

    if (auto_delete_after_retention !== undefined) {
      updates.push(`auto_delete_after_retention = $${paramIndex}`);
      values.push(auto_delete_after_retention);
      paramIndex++;
    }

    if (enable_encryption !== undefined) {
      updates.push(`enable_encryption = $${paramIndex}`);
      values.push(enable_encryption);
      paramIndex++;
    }

    if (auto_transcribe !== undefined) {
      updates.push(`auto_transcribe = $${paramIndex}`);
      values.push(auto_transcribe);
      paramIndex++;
    }

    if (play_beep !== undefined) {
      updates.push(`play_beep = $${paramIndex}`);
      values.push(play_beep);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No settings to update');
    }

    const sql = `
      UPDATE tenant_recording_settings
      SET ${updates.join(', ')}
      WHERE tenant_id = $1
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      throw new Error('Failed to update recording settings');
    }

    return result.rows[0];
  }

  /**
   * Get recording statistics for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} days - Number of days to include (default: 30)
   * @returns {Promise<object>} Recording statistics
   */
  async getRecordingStats(tenantId, days = 30) {
    const sql = `
      SELECT
        COUNT(*) as total_recordings,
        SUM(duration_seconds) as total_duration_seconds,
        SUM(file_size_bytes) as total_size_bytes,
        COUNT(*) FILTER (WHERE status = 'available') as available_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE is_deleted = TRUE) as deleted_count,
        AVG(duration_seconds) as avg_duration_seconds,
        MAX(file_size_bytes) as largest_file_bytes,
        MIN(created_at) as oldest_recording_date,
        MAX(created_at) as newest_recording_date
      FROM call_recordings
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await query(sql, [tenantId]);

    const stats = result.rows[0];

    // Format bytes to MB
    stats.total_size_mb = stats.total_size_bytes ? (parseInt(stats.total_size_bytes) / 1024 / 1024).toFixed(2) : '0.00';
    stats.largest_file_mb = stats.largest_file_bytes ? (parseInt(stats.largest_file_bytes) / 1024 / 1024).toFixed(2) : '0.00';

    // Format duration to hours
    stats.total_duration_hours = stats.total_duration_seconds ? (parseInt(stats.total_duration_seconds) / 3600).toFixed(2) : '0.00';

    return stats;
  }

  /**
   * Get content type for file format
   * @param {string} format - File format
   * @returns {string} Content type
   */
  getContentType(format) {
    const contentTypes = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      m4a: 'audio/m4a'
    };

    return contentTypes[format] || 'application/octet-stream';
  }
}

export default new RecordingsService();
