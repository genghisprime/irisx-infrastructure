/**
 * Admin Dashboard Routes
 * Platform-wide metrics, health monitoring, and system analytics
 * Requires admin authentication
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminDashboard = new Hono();

// All routes require admin authentication
adminDashboard.use('*', authenticateAdmin);

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAuditAction(adminId, action, resourceType, resourceId, changes, req) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id,
        changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        resourceType || null,
        resourceId || null,
        changes ? JSON.stringify(changes) : null,
        req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown',
        req.header('user-agent') || 'unknown'
      ]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/dashboard/overview
 * Platform health overview with key metrics
 */
adminDashboard.get('/overview', async (c) => {
  try {
    const admin = c.get('admin');

    // Get platform health summary from view
    const healthResult = await pool.query(`SELECT * FROM admin_platform_health`);
    const health = healthResult.rows[0] || {};

    // Get recent growth metrics
    const growthResult = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN id END) as new_tenants_7d,
        COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN id END) as new_tenants_30d,
        COUNT(DISTINCT CASE WHEN last_login_at >= NOW() - INTERVAL '24 hours' THEN id END) as active_users_24h
      FROM tenants t
      LEFT JOIN users u ON t.id = u.tenant_id AND u.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
    `);
    const growth = growthResult.rows[0] || {};

    // Get system resource usage (if available)
    const resourceResult = await pool.query(`
      SELECT
        pg_database_size('irisx_prod') as db_size,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
    `);
    const resources = resourceResult.rows[0] || {};

    // Recent errors (if error_logs table exists)
    let recentErrors = [];
    try {
      const errorsResult = await pool.query(`
        SELECT COUNT(*) as error_count
        FROM error_logs
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);
      recentErrors = errorsResult.rows[0] || { error_count: 0 };
    } catch (err) {
      // error_logs table doesn't exist yet
      recentErrors = { error_count: 0 };
    }

    await logAuditAction(admin.id, 'admin.dashboard.view', null, null, null, c.req);

    return c.json({
      health,
      growth,
      resources: {
        database_size_mb: resources.db_size ? Math.round(resources.db_size / 1024 / 1024) : 0,
        active_db_connections: resources.active_connections || 0
      },
      errors: recentErrors
    });

  } catch (err) {
    console.error('Dashboard overview error:', err);
    return c.json({ error: 'Failed to load dashboard' }, 500);
  }
});

/**
 * GET /admin/dashboard/stats
 * Detailed platform statistics with time range
 */
adminDashboard.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const timeRange = c.req.query('timeRange') || '7d'; // 1d, 7d, 30d, 90d, all

    const timeFilters = {
      '1d': "AND created_at >= NOW() - INTERVAL '1 day'",
      '7d': "AND created_at >= NOW() - INTERVAL '7 days'",
      '30d': "AND created_at >= NOW() - INTERVAL '30 days'",
      '90d': "AND created_at >= NOW() - INTERVAL '90 days'",
      'all': ''
    };

    const timeFilter = timeFilters[timeRange] || timeFilters['7d'];

    // Calls statistics
    const callsResult = await pool.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_calls,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_calls,
        COUNT(CASE WHEN status = 'no-answer' THEN 1 END) as no_answer_calls,
        AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_call_duration,
        SUM(duration_seconds) as total_call_duration
      FROM calls
      WHERE 1=1 ${timeFilter.replace('created_at', 'initiated_at')}
    `);

    // SMS statistics
    const smsResult = await pool.query(`
      SELECT
        COUNT(*) as total_sms,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_sms,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_sms,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_sms,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_sms
      FROM sms_messages
      WHERE 1=1 ${timeFilter}
    `);

    // Email statistics
    const emailResult = await pool.query(`
      SELECT
        COUNT(*) as total_emails,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_emails,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_emails,
        COUNT(CASE WHEN status = 'sent' OR status = 'delivered' THEN 1 END) as sent_emails,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_emails
      FROM emails
      WHERE 1=1 ${timeFilter}
    `);

    // WhatsApp statistics
    const whatsappResult = await pool.query(`
      SELECT
        COUNT(*) as total_whatsapp,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_whatsapp,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_whatsapp
      FROM whatsapp_messages
      WHERE 1=1 ${timeFilter}
    `);

    return c.json({
      time_range: timeRange,
      calls: callsResult.rows[0] || {},
      sms: smsResult.rows[0] || {},
      email: emailResult.rows[0] || {},
      whatsapp: whatsappResult.rows[0] || {}
    });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    return c.json({ error: 'Failed to load statistics' }, 500);
  }
});

/**
 * GET /admin/dashboard/charts/daily-activity
 * Daily activity chart data (last 30 days)
 */
adminDashboard.get('/charts/daily-activity', async (c) => {
  try {
    const admin = c.get('admin');
    const channel = c.req.query('channel') || 'all'; // calls, sms, email, whatsapp, all

    const result = await pool.query(`
      WITH dates AS (
        SELECT generate_series(
          NOW() - INTERVAL '30 days',
          NOW(),
          INTERVAL '1 day'
        )::date as date
      )
      SELECT
        d.date,
        COALESCE(c.call_count, 0) as calls,
        COALESCE(s.sms_count, 0) as sms,
        COALESCE(e.email_count, 0) as emails,
        COALESCE(w.whatsapp_count, 0) as whatsapp
      FROM dates d
      LEFT JOIN (
        SELECT DATE(initiated_at) as date, COUNT(*) as call_count
        FROM calls
        WHERE initiated_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(initiated_at)
      ) c ON d.date = c.date
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as sms_count
        FROM sms_messages
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
      ) s ON d.date = s.date
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as email_count
        FROM emails
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
      ) e ON d.date = e.date
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as whatsapp_count
        FROM whatsapp_messages
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
      ) w ON d.date = w.date
      ORDER BY d.date ASC
    `);

    return c.json({
      channel,
      data: result.rows
    });

  } catch (err) {
    console.error('Daily activity chart error:', err);
    return c.json({ error: 'Failed to load chart data' }, 500);
  }
});

/**
 * GET /admin/dashboard/charts/tenant-growth
 * Tenant growth over time
 */
adminDashboard.get('/charts/tenant-growth', async (c) => {
  try {
    const admin = c.get('admin');

    const result = await pool.query(`
      WITH dates AS (
        SELECT generate_series(
          NOW() - INTERVAL '90 days',
          NOW(),
          INTERVAL '1 day'
        )::date as date
      )
      SELECT
        d.date,
        COALESCE(t.new_tenants, 0) as new_tenants,
        SUM(COALESCE(t.new_tenants, 0)) OVER (ORDER BY d.date) as cumulative_tenants
      FROM dates d
      LEFT JOIN (
        SELECT DATE(created_at) as date, COUNT(*) as new_tenants
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '90 days'
          AND deleted_at IS NULL
        GROUP BY DATE(created_at)
      ) t ON d.date = t.date
      ORDER BY d.date ASC
    `);

    return c.json({ data: result.rows });

  } catch (err) {
    console.error('Tenant growth chart error:', err);
    return c.json({ error: 'Failed to load chart data' }, 500);
  }
});

/**
 * GET /admin/dashboard/revenue
 * Revenue overview and MRR tracking
 */
adminDashboard.get('/revenue', async (c) => {
  try {
    const admin = c.get('admin');

    // Overall MRR
    const mrrResult = await pool.query(`
      SELECT
        SUM(mrr) as total_mrr,
        COUNT(*) FILTER (WHERE plan = 'trial') as trial_count,
        COUNT(*) FILTER (WHERE plan = 'starter') as starter_count,
        COUNT(*) FILTER (WHERE plan = 'professional') as professional_count,
        COUNT(*) FILTER (WHERE plan = 'enterprise') as enterprise_count,
        SUM(mrr) FILTER (WHERE plan = 'starter') as starter_mrr,
        SUM(mrr) FILTER (WHERE plan = 'professional') as professional_mrr,
        SUM(mrr) FILTER (WHERE plan = 'enterprise') as enterprise_mrr
      FROM tenants
      WHERE status = 'active' AND deleted_at IS NULL
    `);

    // MRR trend (last 12 months)
    const trendResult = await pool.query(`
      WITH months AS (
        SELECT generate_series(
          NOW() - INTERVAL '12 months',
          NOW(),
          INTERVAL '1 month'
        )::date as month
      )
      SELECT
        TO_CHAR(m.month, 'YYYY-MM') as month,
        COALESCE(SUM(t.mrr), 0) as mrr
      FROM months m
      LEFT JOIN tenants t ON DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', m.month)
        AND t.status = 'active'
        AND t.deleted_at IS NULL
      GROUP BY m.month
      ORDER BY m.month ASC
    `);

    return c.json({
      overview: mrrResult.rows[0] || {},
      trend: trendResult.rows
    });

  } catch (err) {
    console.error('Revenue overview error:', err);
    return c.json({ error: 'Failed to load revenue data' }, 500);
  }
});

/**
 * GET /admin/dashboard/recent-activity
 * Recent platform activity (last 50 events)
 */
adminDashboard.get('/recent-activity', async (c) => {
  try {
    const admin = c.get('admin');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

    const result = await pool.query(`
      SELECT
        'tenant_created' as event_type,
        t.id as resource_id,
        t.name as description,
        t.created_at as timestamp
      FROM tenants t
      WHERE t.created_at >= NOW() - INTERVAL '7 days'
      UNION ALL
      SELECT
        'user_created' as event_type,
        u.id as resource_id,
        CONCAT(u.first_name, ' ', u.last_name, ' joined ', t.name) as description,
        u.created_at as timestamp
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.created_at >= NOW() - INTERVAL '7 days'
      UNION ALL
      SELECT
        'call_completed' as event_type,
        c.id as resource_id,
        CONCAT('Call to ', c.to_number, ' (', c.duration_seconds, 's)') as description,
        c.initiated_at as timestamp
      FROM calls c
      WHERE c.initiated_at >= NOW() - INTERVAL '24 hours'
        AND c.status = 'completed'
      ORDER BY timestamp DESC
      LIMIT $1
    `, [limit]);

    return c.json({ activity: result.rows });

  } catch (err) {
    console.error('Recent activity error:', err);
    return c.json({ error: 'Failed to load recent activity' }, 500);
  }
});

/**
 * GET /admin/dashboard/system-health
 * System health checks and monitoring
 */
adminDashboard.get('/system-health', async (c) => {
  try {
    const admin = c.get('admin');

    // Database health
    const dbResult = await pool.query(`
      SELECT
        pg_database_size('irisx_prod') as db_size,
        (SELECT COUNT(*) FROM pg_stat_activity) as total_connections,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections
    `);

    // Table sizes (top 10)
    const tableSizeResult = await pool.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY size_bytes DESC
      LIMIT 10
    `);

    // Check for long-running queries
    const longQueriesResult = await pool.query(`
      SELECT
        pid,
        usename,
        application_name,
        state,
        EXTRACT(EPOCH FROM (NOW() - query_start)) as duration_seconds,
        LEFT(query, 100) as query_preview
      FROM pg_stat_activity
      WHERE state = 'active'
        AND query NOT LIKE '%pg_stat_activity%'
        AND EXTRACT(EPOCH FROM (NOW() - query_start)) > 10
      ORDER BY duration_seconds DESC
      LIMIT 10
    `);

    return c.json({
      database: dbResult.rows[0] || {},
      table_sizes: tableSizeResult.rows,
      long_running_queries: longQueriesResult.rows,
      checks: {
        database_connected: true,
        api_server: 'healthy' // Could add more health checks here
      }
    });

  } catch (err) {
    console.error('System health error:', err);
    return c.json({
      error: 'Failed to load system health',
      checks: {
        database_connected: false,
        api_server: 'unhealthy'
      }
    }, 500);
  }
});

/**
 * GET /admin/dashboard/audit-log
 * Recent admin actions (audit log)
 */
adminDashboard.get('/audit-log', async (c) => {
  try {
    const admin = c.get('admin');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = (page - 1) * limit;
    const action = c.req.query('action'); // Filter by action type

    let query = `
      SELECT
        al.*,
        au.email as admin_email,
        au.first_name as admin_first_name,
        au.last_name as admin_last_name,
        t.name as tenant_name
      FROM admin_audit_log al
      LEFT JOIN admin_users au ON al.admin_user_id = au.id
      LEFT JOIN tenants t ON al.tenant_id = t.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (action) {
      paramCount++;
      query += ` AND al.action ILIKE $${paramCount}`;
      params.push(`%${action}%`);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM (${query}) as filtered`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    paramCount++;
    query += ` ORDER BY al.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    return c.json({
      audit_log: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Audit log error:', err);
    return c.json({ error: 'Failed to load audit log' }, 500);
  }
});

export default adminDashboard;
