/**
 * Admin CDR (Call Detail Records) Management Routes
 *
 * Provides comprehensive CDR viewing, searching, and analysis capabilities
 * for superadmins to monitor call quality, usage, and troubleshoot issues.
 *
 * Endpoints:
 * - GET /admin/cdrs - List/search CDRs with advanced filters
 * - GET /admin/cdrs/stats - Statistics dashboard
 * - GET /admin/cdrs/quality-alerts - Calls with quality issues
 * - GET /admin/cdrs/export - CSV export with filters
 * - GET /admin/cdrs/timeline/:id - Event timeline for specific call
 * - GET /admin/cdrs/:id - Get CDR details (MUST BE LAST)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminCDRs = new Hono();

// All routes require admin authentication
adminCDRs.use('*', authenticateAdmin);

/**
 * GET /admin/cdrs/stats - CDR statistics dashboard
 *
 * Query parameters:
 * - start_date - Start date for stats (ISO 8601, default: 30 days ago)
 * - end_date - End date for stats (ISO 8601, default: now)
 * - tenant_id - Optional tenant filter
 */
adminCDRs.get('/stats', async (c) => {
  try {
    const querySchema = z.object({
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      tenant_id: z.coerce.number().int().positive().optional()
    });

    const filters = querySchema.parse(c.req.query());

    // Default to last 30 days if not specified
    const startDate = filters.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = filters.end_date || new Date().toISOString();

    const conditions = [`c.initiated_at >= $1`, `c.initiated_at <= $2`];
    const params = [startDate, endDate];
    let paramCount = 2;

    if (filters.tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      params.push(filters.tenant_id);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get comprehensive statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE c.status = 'completed') as completed_calls,
        COUNT(*) FILTER (WHERE c.status = 'no-answer') as missed_calls,
        COUNT(*) FILTER (WHERE c.status = 'failed') as failed_calls,
        COUNT(*) FILTER (WHERE c.direction = 'inbound') as inbound_calls,
        COUNT(*) FILTER (WHERE c.direction = 'outbound') as outbound_calls,
        COUNT(*) FILTER (WHERE c.recording_url IS NOT NULL) as recorded_calls,
        COALESCE(SUM(c.duration_seconds), 0) as total_duration_seconds,
        COALESCE(SUM(c.billable_seconds), 0) as total_billable_seconds,
        COALESCE(AVG(c.duration_seconds) FILTER (WHERE c.duration_seconds > 0), 0) as avg_duration_seconds,
        COALESCE(SUM(c.cost_cents), 0) as total_cost_cents,
        COALESCE(AVG(c.mos_score) FILTER (WHERE c.mos_score IS NOT NULL), 0) as avg_mos_score,
        COUNT(*) FILTER (WHERE c.mos_score < 3.5 AND c.mos_score IS NOT NULL) as poor_quality_calls,
        COUNT(DISTINCT c.tenant_id) as active_tenants,
        COUNT(DISTINCT c.from_number) as unique_callers,
        COUNT(DISTINCT c.to_number) as unique_recipients
      FROM calls c
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, params);
    const stats = statsResult.rows[0];

    // Get calls by hour for the last 24 hours
    const hourlyQuery = `
      SELECT
        DATE_TRUNC('hour', c.initiated_at) as hour,
        COUNT(*) as call_count,
        COALESCE(AVG(c.mos_score), 0) as avg_mos
      FROM calls c
      ${whereClause}
        AND c.initiated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY hour
      ORDER BY hour DESC
    `;
    const hourlyResult = await pool.query(hourlyQuery, params);

    // Get top hangup causes
    const hangupQuery = `
      SELECT
        c.hangup_cause,
        COUNT(*) as count
      FROM calls c
      ${whereClause}
        AND c.hangup_cause IS NOT NULL
      GROUP BY c.hangup_cause
      ORDER BY count DESC
      LIMIT 10
    `;
    const hangupResult = await pool.query(hangupQuery, params);

    // Get calls by tenant (top 10)
    const tenantQuery = `
      SELECT
        t.id,
        t.name,
        COUNT(c.id) as call_count,
        COALESCE(SUM(c.cost_cents), 0) as total_cost_cents,
        COALESCE(AVG(c.mos_score), 0) as avg_mos_score
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      GROUP BY t.id, t.name
      ORDER BY call_count DESC
      LIMIT 10
    `;
    const tenantResult = await pool.query(tenantQuery, params);

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'view',
      'cdr_stats',
      null,
      JSON.stringify({ start_date: startDate, end_date: endDate, tenant_id: filters.tenant_id }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      stats,
      calls_by_hour: hourlyResult.rows,
      top_hangup_causes: hangupResult.rows,
      top_tenants: tenantResult.rows,
      date_range: {
        start: startDate,
        end: endDate
      }
    });
  } catch (error) {
    console.error('Error fetching CDR stats:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to fetch CDR statistics' }, 500);
  }
});

/**
 * GET /admin/cdrs/quality-alerts - Get calls with quality issues
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 50)
 * - min_mos (default: 3.5 - industry standard for "poor" quality)
 * - start_date - Filter calls after this date
 * - end_date - Filter calls before this date
 * - tenant_id - Optional tenant filter
 */
adminCDRs.get('/quality-alerts', async (c) => {
  try {
    const querySchema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(500).default(50),
      min_mos: z.coerce.number().min(1.0).max(5.0).default(3.5),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      tenant_id: z.coerce.number().int().positive().optional()
    });

    const filters = querySchema.parse(c.req.query());
    const offset = (filters.page - 1) * filters.limit;

    const conditions = [`c.mos_score < $1`, `c.mos_score IS NOT NULL`];
    const params = [filters.min_mos];
    let paramCount = 1;

    if (filters.start_date) {
      paramCount++;
      conditions.push(`c.initiated_at >= $${paramCount}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      conditions.push(`c.initiated_at <= $${paramCount}`);
      params.push(filters.end_date);
    }

    if (filters.tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      params.push(filters.tenant_id);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM calls c
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get poor quality calls
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;
    params.push(filters.limit, offset);

    const alertsQuery = `
      SELECT
        c.id,
        c.call_sid,
        c.tenant_id,
        t.name as tenant_name,
        c.from_number,
        c.to_number,
        c.direction,
        c.initiated_at,
        c.duration_seconds,
        c.mos_score,
        c.jitter_ms,
        c.packet_loss_percent,
        c.hangup_cause,
        c.recording_url
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.mos_score ASC, c.initiated_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const alertsResult = await pool.query(alertsQuery, params);

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'view',
      'cdr_quality_alerts',
      null,
      JSON.stringify({ filters, results_count: alertsResult.rows.length }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      alerts: alertsResult.rows,
      total,
      page: filters.page,
      limit: filters.limit,
      total_pages: Math.ceil(total / filters.limit),
      threshold_mos: filters.min_mos
    });
  } catch (error) {
    console.error('Error fetching quality alerts:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to fetch quality alerts' }, 500);
  }
});

/**
 * GET /admin/cdrs/export - Export CDRs to CSV
 *
 * Accepts same filters as GET /admin/cdrs
 * Returns CSV file with comprehensive CDR data
 */
adminCDRs.get('/export', async (c) => {
  try {
    // Use same validation as main CDR list endpoint
    const querySchema = z.object({
      tenant_id: z.coerce.number().int().positive().optional(),
      from_number: z.string().optional(),
      to_number: z.string().optional(),
      direction: z.enum(['inbound', 'outbound']).optional(),
      status: z.string().optional(),
      min_duration: z.coerce.number().int().nonnegative().optional(),
      max_duration: z.coerce.number().int().nonnegative().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      has_recording: z.enum(['true', 'false']).optional(),
      min_mos: z.coerce.number().min(1.0).max(5.0).optional(),
      max_mos: z.coerce.number().min(1.0).max(5.0).optional(),
      hangup_cause: z.string().optional(),
      search: z.string().optional()
    });

    const filters = querySchema.parse(c.req.query());

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (filters.tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      params.push(filters.tenant_id);
    }

    if (filters.from_number) {
      paramCount++;
      conditions.push(`c.from_number = $${paramCount}`);
      params.push(filters.from_number);
    }

    if (filters.to_number) {
      paramCount++;
      conditions.push(`c.to_number = $${paramCount}`);
      params.push(filters.to_number);
    }

    if (filters.direction) {
      paramCount++;
      conditions.push(`c.direction = $${paramCount}`);
      params.push(filters.direction);
    }

    if (filters.status) {
      paramCount++;
      conditions.push(`c.status = $${paramCount}`);
      params.push(filters.status);
    }

    if (filters.min_duration !== undefined) {
      paramCount++;
      conditions.push(`c.duration_seconds >= $${paramCount}`);
      params.push(filters.min_duration);
    }

    if (filters.max_duration !== undefined) {
      paramCount++;
      conditions.push(`c.duration_seconds <= $${paramCount}`);
      params.push(filters.max_duration);
    }

    if (filters.start_date) {
      paramCount++;
      conditions.push(`c.initiated_at >= $${paramCount}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      conditions.push(`c.initiated_at <= $${paramCount}`);
      params.push(filters.end_date);
    }

    if (filters.has_recording === 'true') {
      conditions.push(`c.recording_url IS NOT NULL`);
    } else if (filters.has_recording === 'false') {
      conditions.push(`c.recording_url IS NULL`);
    }

    if (filters.min_mos !== undefined) {
      paramCount++;
      conditions.push(`c.mos_score >= $${paramCount}`);
      params.push(filters.min_mos);
    }

    if (filters.max_mos !== undefined) {
      paramCount++;
      conditions.push(`c.mos_score <= $${paramCount}`);
      params.push(filters.max_mos);
    }

    if (filters.hangup_cause) {
      paramCount++;
      conditions.push(`c.hangup_cause = $${paramCount}`);
      params.push(filters.hangup_cause);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(
        c.from_number ILIKE $${paramCount} OR
        c.to_number ILIKE $${paramCount} OR
        c.call_sid ILIKE $${paramCount}
      )`);
      params.push(`%${filters.search}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get CDRs for export (limit to 10000 rows for safety)
    const exportQuery = `
      SELECT
        c.call_sid,
        t.name as tenant_name,
        c.direction,
        c.call_type,
        c.from_number,
        c.to_number,
        c.status,
        c.initiated_at,
        c.answered_at,
        c.ended_at,
        c.duration_seconds,
        c.billable_seconds,
        c.mos_score,
        c.jitter_ms,
        c.packet_loss_percent,
        CASE WHEN c.recording_url IS NOT NULL THEN 'Yes' ELSE 'No' END as has_recording,
        c.hangup_cause,
        c.hangup_by,
        CAST(c.cost_cents AS DECIMAL) / 100 as cost_dollars,
        CAST(c.rate_cents_per_minute AS DECIMAL) / 100 as rate_dollars_per_minute
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.initiated_at DESC
      LIMIT 10000
    `;

    const result = await pool.query(exportQuery, params);

    // Convert to CSV
    const headers = [
      'Call SID',
      'Tenant',
      'Direction',
      'Type',
      'From Number',
      'To Number',
      'Status',
      'Initiated At',
      'Answered At',
      'Ended At',
      'Duration (sec)',
      'Billable (sec)',
      'MOS Score',
      'Jitter (ms)',
      'Packet Loss (%)',
      'Has Recording',
      'Hangup Cause',
      'Hangup By',
      'Cost ($)',
      'Rate ($/min)'
    ];

    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const values = [
        row.call_sid || '',
        row.tenant_name || '',
        row.direction || '',
        row.call_type || '',
        row.from_number || '',
        row.to_number || '',
        row.status || '',
        row.initiated_at || '',
        row.answered_at || '',
        row.ended_at || '',
        row.duration_seconds || '0',
        row.billable_seconds || '0',
        row.mos_score || '',
        row.jitter_ms || '',
        row.packet_loss_percent || '',
        row.has_recording || 'No',
        row.hangup_cause || '',
        row.hangup_by || '',
        row.cost_dollars || '0.00',
        row.rate_dollars_per_minute || '0.00'
      ];

      // Escape values that contain commas or quotes
      const escapedValues = values.map(val => {
        const strVal = String(val);
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      });

      csvRows.push(escapedValues.join(','));
    }

    const csv = csvRows.join('\n');

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'export',
      'cdrs',
      null,
      JSON.stringify({ filters, rows_exported: result.rows.length }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    // Set headers for CSV download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="cdrs-export-${timestamp}.csv"`);
    return c.body(csv);
  } catch (error) {
    console.error('Error exporting CDRs:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to export CDRs' }, 500);
  }
});

/**
 * GET /admin/cdrs/timeline/:id - Get detailed event timeline for a specific call
 *
 * Returns event-by-event progression of a call with timestamps
 * Useful for debugging call flow issues
 */
adminCDRs.get('/timeline/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid CDR ID' }, 400);
    }

    // Get CDR
    const cdrResult = await pool.query('SELECT * FROM calls WHERE id = $1', [id]);

    if (cdrResult.rows.length === 0) {
      return c.json({ error: 'CDR not found' }, 404);
    }

    const cdr = cdrResult.rows[0];

    // Build detailed timeline with calculated intervals
    const timeline = [];
    let lastTimestamp = null;

    const addEvent = (timestamp, event, description, metadata = null) => {
      if (!timestamp) return;

      const intervalMs = lastTimestamp
        ? new Date(timestamp) - new Date(lastTimestamp)
        : 0;

      timeline.push({
        timestamp,
        event,
        description,
        interval_ms: intervalMs,
        metadata
      });

      lastTimestamp = timestamp;
    };

    addEvent(cdr.initiated_at, 'call_initiated', `Call initiated from ${cdr.from_number} to ${cdr.to_number}`, {
      direction: cdr.direction,
      call_type: cdr.call_type
    });

    addEvent(cdr.ringing_at, 'call_ringing', 'Destination ringing');

    addEvent(cdr.answered_at, 'call_answered', 'Call answered and connected', {
      time_to_answer_ms: cdr.ringing_at
        ? new Date(cdr.answered_at) - new Date(cdr.ringing_at)
        : null
    });

    addEvent(cdr.ended_at, 'call_ended', `Call ended: ${cdr.hangup_cause || 'normal'}`, {
      hangup_by: cdr.hangup_by,
      hangup_cause: cdr.hangup_cause,
      duration_seconds: cdr.duration_seconds,
      quality_metrics: {
        mos_score: cdr.mos_score,
        jitter_ms: cdr.jitter_ms,
        packet_loss_percent: cdr.packet_loss_percent
      }
    });

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'view',
      'cdr_timeline',
      id,
      JSON.stringify({ call_sid: cdr.call_sid }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      call_sid: cdr.call_sid,
      timeline,
      summary: {
        total_duration_ms: timeline.length > 0
          ? new Date(timeline[timeline.length - 1].timestamp) - new Date(timeline[0].timestamp)
          : 0,
        events_count: timeline.length
      }
    });
  } catch (error) {
    console.error('Error fetching CDR timeline:', error);
    return c.json({ error: 'Failed to fetch CDR timeline' }, 500);
  }
});

/**
 * GET /admin/cdrs - List/search CDRs with advanced filters
 *
 * Query parameters (all optional):
 * - page (default: 1)
 * - limit (default: 50, max: 500)
 * - tenant_id - Filter by tenant
 * - from_number - Filter by caller
 * - to_number - Filter by recipient
 * - direction - Filter by direction (inbound/outbound)
 * - status - Filter by call status
 * - min_duration - Minimum call duration in seconds
 * - max_duration - Maximum call duration in seconds
 * - start_date - Filter calls after this date (ISO 8601)
 * - end_date - Filter calls before this date (ISO 8601)
 * - has_recording - Filter by recording presence (true/false)
 * - min_mos - Minimum MOS score (1.0-5.0)
 * - max_mos - Maximum MOS score (1.0-5.0)
 * - hangup_cause - Filter by hangup cause
 * - search - Search in from_number, to_number, call_sid
 * - sort_by - Field to sort by (default: initiated_at)
 * - sort_order - asc or desc (default: desc)
 */
adminCDRs.get('/', async (c) => {
  try {
    // Validation schema
    const querySchema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(500).default(50),
      tenant_id: z.coerce.number().int().positive().optional(),
      from_number: z.string().optional(),
      to_number: z.string().optional(),
      direction: z.enum(['inbound', 'outbound']).optional(),
      status: z.string().optional(),
      min_duration: z.coerce.number().int().nonnegative().optional(),
      max_duration: z.coerce.number().int().nonnegative().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      has_recording: z.enum(['true', 'false']).optional(),
      min_mos: z.coerce.number().min(1.0).max(5.0).optional(),
      max_mos: z.coerce.number().min(1.0).max(5.0).optional(),
      hangup_cause: z.string().optional(),
      search: z.string().optional(),
      sort_by: z.enum([
        'initiated_at', 'duration_seconds', 'mos_score',
        'cost_cents', 'from_number', 'to_number'
      ]).default('initiated_at'),
      sort_order: z.enum(['asc', 'desc']).default('desc')
    });

    const filters = querySchema.parse(c.req.query());
    const offset = (filters.page - 1) * filters.limit;

    // Build dynamic WHERE clause
    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (filters.tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      params.push(filters.tenant_id);
    }

    if (filters.from_number) {
      paramCount++;
      conditions.push(`c.from_number = $${paramCount}`);
      params.push(filters.from_number);
    }

    if (filters.to_number) {
      paramCount++;
      conditions.push(`c.to_number = $${paramCount}`);
      params.push(filters.to_number);
    }

    if (filters.direction) {
      paramCount++;
      conditions.push(`c.direction = $${paramCount}`);
      params.push(filters.direction);
    }

    if (filters.status) {
      paramCount++;
      conditions.push(`c.status = $${paramCount}`);
      params.push(filters.status);
    }

    if (filters.min_duration !== undefined) {
      paramCount++;
      conditions.push(`c.duration_seconds >= $${paramCount}`);
      params.push(filters.min_duration);
    }

    if (filters.max_duration !== undefined) {
      paramCount++;
      conditions.push(`c.duration_seconds <= $${paramCount}`);
      params.push(filters.max_duration);
    }

    if (filters.start_date) {
      paramCount++;
      conditions.push(`c.initiated_at >= $${paramCount}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      conditions.push(`c.initiated_at <= $${paramCount}`);
      params.push(filters.end_date);
    }

    if (filters.has_recording === 'true') {
      conditions.push(`c.recording_url IS NOT NULL`);
    } else if (filters.has_recording === 'false') {
      conditions.push(`c.recording_url IS NULL`);
    }

    if (filters.min_mos !== undefined) {
      paramCount++;
      conditions.push(`c.mos_score >= $${paramCount}`);
      params.push(filters.min_mos);
    }

    if (filters.max_mos !== undefined) {
      paramCount++;
      conditions.push(`c.mos_score <= $${paramCount}`);
      params.push(filters.max_mos);
    }

    if (filters.hangup_cause) {
      paramCount++;
      conditions.push(`c.hangup_cause = $${paramCount}`);
      params.push(filters.hangup_cause);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(
        c.from_number ILIKE $${paramCount} OR
        c.to_number ILIKE $${paramCount} OR
        c.call_sid ILIKE $${paramCount}
      )`);
      params.push(`%${filters.search}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM calls c
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get CDRs with tenant info
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;
    params.push(filters.limit, offset);

    const cdrsQuery = `
      SELECT
        c.id,
        c.uuid,
        c.call_sid,
        c.tenant_id,
        t.name as tenant_name,
        c.direction,
        c.call_type,
        c.from_number,
        c.to_number,
        c.status,
        c.initiated_at,
        c.answered_at,
        c.ended_at,
        c.duration_seconds,
        c.billable_seconds,
        c.mos_score,
        c.jitter_ms,
        c.packet_loss_percent,
        c.recording_url,
        c.recording_duration_seconds,
        c.hangup_cause,
        c.hangup_by,
        c.cost_cents,
        c.rate_cents_per_minute,
        c.metadata,
        c.created_at
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.${filters.sort_by} ${filters.sort_order.toUpperCase()}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const cdrsResult = await pool.query(cdrsQuery, params);

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'view',
      'cdrs',
      null,
      JSON.stringify({ filters, results_count: cdrsResult.rows.length }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      cdrs: cdrsResult.rows,
      total,
      page: filters.page,
      limit: filters.limit,
      total_pages: Math.ceil(total / filters.limit)
    });
  } catch (error) {
    console.error('Error fetching CDRs:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid query parameters', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to fetch CDRs' }, 500);
  }
});

/**
 * GET /admin/cdrs/:id - Get detailed CDR information
 *
 * Returns comprehensive call details including:
 * - All CDR fields
 * - Tenant information
 * - Related calls (if part of a call chain)
 * - Activity timeline
 *
 * IMPORTANT: This route MUST be last to avoid catching /stats, /quality-alerts, /export, /timeline
 */
adminCDRs.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid CDR ID' }, 400);
    }

    // Get CDR details
    const cdrQuery = `
      SELECT
        c.*,
        t.name as tenant_name,
        t.status as tenant_status
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = $1
    `;
    const cdrResult = await pool.query(cdrQuery, [id]);

    if (cdrResult.rows.length === 0) {
      return c.json({ error: 'CDR not found' }, 404);
    }

    const cdr = cdrResult.rows[0];

    // Get related calls (same parent_call_sid or child calls)
    const relatedQuery = `
      SELECT
        id,
        call_sid,
        direction,
        from_number,
        to_number,
        status,
        initiated_at,
        duration_seconds,
        mos_score
      FROM calls
      WHERE (
        parent_call_sid = $1 OR
        call_sid = $2 OR
        parent_call_sid = $2
      ) AND id != $3
      ORDER BY initiated_at ASC
    `;
    const relatedResult = await pool.query(relatedQuery, [
      cdr.call_sid,
      cdr.parent_call_sid,
      id
    ]);

    // Get activity timeline from CDR data
    const timeline = [];

    if (cdr.initiated_at) {
      timeline.push({
        timestamp: cdr.initiated_at,
        event: 'call_initiated',
        description: `Call initiated from ${cdr.from_number} to ${cdr.to_number}`
      });
    }

    if (cdr.ringing_at) {
      timeline.push({
        timestamp: cdr.ringing_at,
        event: 'call_ringing',
        description: 'Call ringing'
      });
    }

    if (cdr.answered_at) {
      timeline.push({
        timestamp: cdr.answered_at,
        event: 'call_answered',
        description: 'Call answered'
      });
    }

    if (cdr.ended_at) {
      timeline.push({
        timestamp: cdr.ended_at,
        event: 'call_ended',
        description: `Call ended - ${cdr.hangup_cause || 'normal'}`,
        metadata: {
          hangup_by: cdr.hangup_by,
          hangup_cause: cdr.hangup_cause
        }
      });
    }

    // Log audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      c.get('admin').id,
      'view',
      'cdr_detail',
      id,
      JSON.stringify({ call_sid: cdr.call_sid }),
      c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      cdr,
      related_calls: relatedResult.rows,
      timeline
    });
  } catch (error) {
    console.error('Error fetching CDR details:', error);
    return c.json({ error: 'Failed to fetch CDR details' }, 500);
  }
});

export default adminCDRs;
