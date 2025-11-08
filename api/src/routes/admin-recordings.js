/**
 * Admin Recording Management Routes
 * IRISX staff oversight of call recordings across all tenants
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminRecordings = new Hono();

// All routes require admin authentication
adminRecordings.use('*', authenticateAdmin);

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

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/recordings/stats
 * Get recording statistics across all tenants
 */
adminRecordings.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const tenant_id = c.req.query('tenant_id');

    let whereClause = 'recording_url IS NOT NULL';
    let queryParams = [];

    if (tenant_id) {
      whereClause += ' AND tenant_id = $1';
      queryParams.push(tenant_id);
    }

    // Get summary statistics
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_recordings,
        SUM(recording_duration_seconds) as total_duration_seconds,
        SUM(recording_size_bytes) as total_size_bytes,
        AVG(recording_duration_seconds) as avg_duration_seconds,
        COUNT(*) FILTER (WHERE recording_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE recording_status = 'in-progress') as in_progress,
        COUNT(*) FILTER (WHERE recording_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE transcription_text IS NOT NULL) as transcribed,
        AVG(transcription_confidence) FILTER (WHERE transcription_confidence IS NOT NULL) as avg_transcription_confidence
       FROM calls
       WHERE ${whereClause}`,
      queryParams
    );

    // Get recordings by tenant (top 10)
    const tenantResult = await pool.query(
      `SELECT
        c.tenant_id,
        t.name as tenant_name,
        COUNT(*) as recording_count,
        SUM(c.recording_duration_seconds) as total_duration_seconds,
        SUM(c.recording_size_bytes) as total_size_bytes
       FROM calls c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE ${whereClause}
       GROUP BY c.tenant_id, t.name
       ORDER BY recording_count DESC
       LIMIT 10`,
      queryParams
    );

    // Get recordings by status
    const statusResult = await pool.query(
      `SELECT
        recording_status,
        COUNT(*) as count
       FROM calls
       WHERE ${whereClause}
       GROUP BY recording_status
       ORDER BY count DESC`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.recordings.stats', null, null, { tenant_id }, c.req);

    return c.json({
      summary: statsResult.rows[0],
      by_tenant: tenantResult.rows,
      by_status: statusResult.rows
    });

  } catch (err) {
    console.error('Get recording stats error:', err);
    return c.json({ error: 'Failed to get recording stats' }, 500);
  }
});

/**
 * GET /admin/recordings
 * List all call recordings with filters
 */
adminRecordings.get('/', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const tenant_id = c.req.query('tenant_id');
    const search = c.req.query('search');
    const date_from = c.req.query('date_from');
    const date_to = c.req.query('date_to');
    const status = c.req.query('status'); // recording_status filter

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['c.recording_url IS NOT NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`c.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(c.from_number ILIKE $${paramIndex} OR c.to_number ILIKE $${paramIndex} OR c.recording_sid ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      whereConditions.push(`c.recording_started_at >= $${paramIndex}`);
      queryParams.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereConditions.push(`c.recording_started_at <= $${paramIndex}`);
      queryParams.push(date_to);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`c.recording_status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM calls c
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get recordings
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        c.id,
        c.tenant_id,
        t.name as tenant_name,
        c.from_number,
        c.to_number,
        c.direction,
        c.status as call_status,
        c.duration_seconds,
        c.recording_url,
        c.recording_duration_seconds,
        c.recording_sid,
        c.recording_status,
        c.recording_started_at,
        c.recording_size_bytes,
        c.transcription_text,
        c.transcription_confidence,
        c.user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email,
        c.start_time,
        c.end_time,
        c.created_at
       FROM calls c
       JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${whereClause}
       ORDER BY c.recording_started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.recordings.list', null, null, {
      filters: { tenant_id, search, date_from, date_to, status }
    }, c.req);

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
 * GET /admin/recordings/:id
 * Get detailed information about a specific recording
 */
adminRecordings.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        c.*,
        t.name as tenant_name,
        t.domain as tenant_domain,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
       FROM calls c
       JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = $1 AND c.recording_url IS NOT NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Recording not found' }, 404);
    }

    await logAdminAction(admin.id, 'admin.recording.view', 'recording', id, null, c.req);

    return c.json({ recording: result.rows[0] });

  } catch (err) {
    console.error('Get recording error:', err);
    return c.json({ error: 'Failed to get recording' }, 500);
  }
});

export default adminRecordings;
