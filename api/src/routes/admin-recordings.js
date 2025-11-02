/**
 * Admin Call Recording Management Routes
 * IRISX staff manage call recordings across all tenants
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminRecordings = new Hono();

// All routes require admin authentication
adminRecordings.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const listRecordingsSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  tenant_id: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAdminAction(adminId, action, resourceType, resourceId, changes, req) {
  await pool.query(
    `INSERT INTO admin_audit_log (
      admin_user_id, action, resource_type, resource_id, changes, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId,
      action,
      resourceType,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown'
    ]
  );
}

async function generatePresignedUrl(s3Key) {
  // TODO: Implement S3 presigned URL generation
  // For now, return a placeholder
  const bucketName = process.env.S3_RECORDINGS_BUCKET || 'irisx-recordings';
  return `https://${bucketName}.s3.amazonaws.com/${s3Key}?expires=3600`;
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/recordings
 * List all call recordings with filters
 */
adminRecordings.get('/recordings', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const tenant_id = c.req.query('tenant_id');
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');
    const search = c.req.query('search'); // search by phone number or call sid

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['cr.deleted_at IS NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`c.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (start_date) {
      whereConditions.push(`cr.created_at >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`cr.created_at <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(c.from_number ILIKE $${paramIndex} OR c.to_number ILIKE $${paramIndex} OR c.call_sid ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM call_recordings cr
       JOIN calls c ON cr.call_id = c.id
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get recordings
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        cr.id,
        cr.call_id,
        c.call_sid,
        c.tenant_id,
        t.name as tenant_name,
        c.from_number,
        c.to_number,
        c.direction,
        cr.duration,
        cr.file_size,
        cr.s3_key,
        cr.s3_bucket,
        cr.format,
        cr.channels,
        cr.created_at,
        c.start_time,
        c.end_time
       FROM call_recordings cr
       JOIN calls c ON cr.call_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE ${whereClause}
       ORDER BY cr.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.recordings.list', null, null, { filters: { tenant_id, start_date, end_date } }, c.req);

    return c.json({
      recordings: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List recordings error:', err);
    return c.json({ error: 'Failed to list recordings' }, 500);
  }
});

/**
 * GET /admin/calls/:callId/recordings
 * Get all recordings for a specific call
 */
adminRecordings.get('/calls/:callId/recordings', async (c) => {
  try {
    const { callId } = c.req.param();
    const admin = c.get('admin');

    // Check if call exists
    const callCheck = await pool.query(
      `SELECT c.id, c.call_sid, c.tenant_id, t.name as tenant_name
       FROM calls c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1`,
      [callId]
    );

    if (callCheck.rows.length === 0) {
      return c.json({ error: 'Call not found' }, 404);
    }

    const call = callCheck.rows[0];

    // Get recordings for this call
    const result = await pool.query(
      `SELECT
        cr.id,
        cr.call_id,
        cr.duration,
        cr.file_size,
        cr.s3_key,
        cr.s3_bucket,
        cr.format,
        cr.channels,
        cr.created_at
       FROM call_recordings cr
       WHERE cr.call_id = $1 AND cr.deleted_at IS NULL
       ORDER BY cr.created_at DESC`,
      [callId]
    );

    await logAdminAction(admin.id, 'admin.call.recordings.view', 'call', callId, null, c.req);

    return c.json({
      call: {
        id: call.id,
        call_sid: call.call_sid,
        tenant_id: call.tenant_id,
        tenant_name: call.tenant_name
      },
      recordings: result.rows
    });

  } catch (err) {
    console.error('Get call recordings error:', err);
    return c.json({ error: 'Failed to get call recordings' }, 500);
  }
});

/**
 * GET /admin/recordings/:id/presigned-url
 * Generate presigned URL for recording playback
 */
adminRecordings.get('/recordings/:id/presigned-url', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Get recording
    const result = await pool.query(
      `SELECT
        cr.id,
        cr.s3_key,
        cr.s3_bucket,
        cr.format,
        c.tenant_id,
        t.name as tenant_name
       FROM call_recordings cr
       JOIN calls c ON cr.call_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE cr.id = $1 AND cr.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Recording not found' }, 404);
    }

    const recording = result.rows[0];

    // Generate presigned URL (expires in 1 hour)
    const presignedUrl = await generatePresignedUrl(recording.s3_key);

    // Update last_accessed_at
    await pool.query(
      'UPDATE call_recordings SET last_accessed_at = NOW() WHERE id = $1',
      [id]
    );

    await logAdminAction(admin.id, 'admin.recording.access', 'recording', id, {
      tenant_id: recording.tenant_id
    }, c.req);

    return c.json({
      url: presignedUrl,
      expires_in: 3600, // 1 hour
      format: recording.format,
      tenant_name: recording.tenant_name
    });

  } catch (err) {
    console.error('Get presigned URL error:', err);
    return c.json({ error: 'Failed to generate playback URL' }, 500);
  }
});

/**
 * DELETE /admin/recordings/:id
 * Delete a call recording (superadmin only)
 */
adminRecordings.delete('/recordings/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Only superadmin can delete recordings
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete recordings' }, 403);
    }

    // Get recording info
    const recordingCheck = await pool.query(
      `SELECT
        cr.id,
        cr.s3_key,
        cr.call_id,
        c.tenant_id
       FROM call_recordings cr
       JOIN calls c ON cr.call_id = c.id
       WHERE cr.id = $1 AND cr.deleted_at IS NULL`,
      [id]
    );

    if (recordingCheck.rows.length === 0) {
      return c.json({ error: 'Recording not found' }, 404);
    }

    const recording = recordingCheck.rows[0];

    // Soft delete recording
    await pool.query(
      'UPDATE call_recordings SET deleted_at = NOW() WHERE id = $1',
      [id]
    );

    // TODO: Delete from S3 (implement S3 deletion)
    // await deleteFromS3(recording.s3_key);

    await logAdminAction(admin.id, 'admin.recording.delete', 'recording', id, {
      call_id: recording.call_id,
      tenant_id: recording.tenant_id,
      s3_key: recording.s3_key
    }, c.req);

    return c.json({
      success: true,
      message: 'Recording deleted successfully'
    });

  } catch (err) {
    console.error('Delete recording error:', err);
    return c.json({ error: 'Failed to delete recording' }, 500);
  }
});

/**
 * GET /admin/recordings/stats
 * Get recording statistics
 */
adminRecordings.get('/recordings/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const tenant_id = c.req.query('tenant_id');

    let whereClause = 'cr.deleted_at IS NULL';
    let queryParams = [];

    if (tenant_id) {
      whereClause += ' AND c.tenant_id = $1';
      queryParams.push(tenant_id);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_recordings,
        SUM(cr.duration) as total_duration_seconds,
        SUM(cr.file_size) as total_storage_bytes,
        AVG(cr.duration) as avg_duration_seconds,
        COUNT(DISTINCT c.tenant_id) as tenants_with_recordings
       FROM call_recordings cr
       JOIN calls c ON cr.call_id = c.id
       WHERE ${whereClause}`,
      queryParams
    );

    const stats = result.rows[0];

    // Convert to human-readable format
    const humanStats = {
      total_recordings: parseInt(stats.total_recordings),
      total_duration: {
        seconds: parseInt(stats.total_duration_seconds || 0),
        hours: Math.floor((stats.total_duration_seconds || 0) / 3600),
        formatted: formatDuration(stats.total_duration_seconds || 0)
      },
      total_storage: {
        bytes: parseInt(stats.total_storage_bytes || 0),
        mb: Math.round((stats.total_storage_bytes || 0) / 1024 / 1024),
        gb: ((stats.total_storage_bytes || 0) / 1024 / 1024 / 1024).toFixed(2)
      },
      avg_duration_seconds: Math.round(parseFloat(stats.avg_duration_seconds || 0)),
      tenants_with_recordings: parseInt(stats.tenants_with_recordings || 0)
    };

    await logAdminAction(admin.id, 'admin.recordings.stats', null, null, { tenant_id }, c.req);

    return c.json({ stats: humanStats });

  } catch (err) {
    console.error('Get recording stats error:', err);
    return c.json({ error: 'Failed to get recording stats' }, 500);
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default adminRecordings;
