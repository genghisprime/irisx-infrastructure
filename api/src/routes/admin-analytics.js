/**
 * Admin Analytics Routes
 * System-wide usage metrics and analytics
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminAnalytics = new Hono();

// All routes require admin authentication
adminAnalytics.use('*', authenticateAdmin);

/**
 * GET /admin/analytics/usage
 * Get system-wide usage analytics
 */
adminAnalytics.get('/usage', async (c) => {
  try {
    const { timeRange = '30d' } = c.req.query();

    // Parse time range into interval
    const intervalMap = {
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days'
    };
    const interval = intervalMap[timeRange] || '30 days';

    // Get calls analytics
    const callsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(duration_seconds) / 60.0, 0) as total_minutes
      FROM calls
      WHERE initiated_at > NOW() - INTERVAL '${interval}'
    `);

    const calls = {
      total: parseInt(callsResult.rows[0]?.total || 0),
      total_minutes: parseFloat(callsResult.rows[0]?.total_minutes || 0)
    };

    // Get SMS analytics
    const smsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered
      FROM sms_messages
      WHERE created_at > NOW() - INTERVAL '${interval}'
    `);

    const smsTotal = parseInt(smsResult.rows[0]?.total || 0);
    const smsDelivered = parseInt(smsResult.rows[0]?.delivered || 0);

    const sms = {
      total: smsTotal,
      delivered: smsTotal > 0 ? Math.round((smsDelivered / smsTotal) * 100) : 0
    };

    // Get email analytics
    const emailResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened
      FROM emails
      WHERE created_at > NOW() - INTERVAL '${interval}'
    `);

    const emailTotal = parseInt(emailResult.rows[0]?.total || 0);
    const emailOpened = parseInt(emailResult.rows[0]?.opened || 0);

    const emails = {
      total: emailTotal,
      open_rate: emailTotal > 0 ? Math.round((emailOpened / emailTotal) * 100) : 0
    };

    // Get storage analytics
    const storageResult = await pool.query(`
      SELECT
        pg_database_size(current_database()) as total_bytes,
        (SELECT COUNT(*) FROM tenants) as tenant_count
    `);

    const storage = {
      total_bytes: parseInt(storageResult.rows[0]?.total_bytes || 0),
      tenant_count: parseInt(storageResult.rows[0]?.tenant_count || 0)
    };

    // Get API usage (based on calls as proxy)
    const apiResult = await pool.query(`
      SELECT
        COUNT(*) as total_requests,
        0 as avg_response_ms,
        COALESCE(
          (COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*), 0)) * 100,
          0
        ) as error_rate
      FROM calls
      WHERE initiated_at > NOW() - INTERVAL '${interval}'
    `);

    const api = {
      total_requests: parseInt(apiResult.rows[0]?.total_requests || 0),
      avg_response_ms: parseFloat(apiResult.rows[0]?.avg_response_ms || 0),
      error_rate: parseFloat(apiResult.rows[0]?.error_rate || 0)
    };

    // Get resource usage (placeholder - would need system metrics)
    const resources = {
      cpu_percent: 0,
      memory_percent: 0,
      bandwidth_bytes: 0
    };

    // Get top tenants by usage
    const topTenantsResult = await pool.query(`
      SELECT
        t.id,
        t.name,
        t.billing_email,
        COUNT(DISTINCT c.id) as call_count,
        COALESCE(SUM(c.duration_seconds) / 60.0, 0) as total_minutes,
        COUNT(DISTINCT s.id) as sms_count,
        COUNT(DISTINCT e.id) as email_count
      FROM tenants t
      LEFT JOIN calls c ON c.tenant_id = t.id AND c.initiated_at > NOW() - INTERVAL '${interval}'
      LEFT JOIN sms_messages s ON s.tenant_id = t.id AND s.created_at > NOW() - INTERVAL '${interval}'
      LEFT JOIN emails e ON e.tenant_id = t.id AND e.created_at > NOW() - INTERVAL '${interval}'
      WHERE t.status = 'active'
      GROUP BY t.id, t.name, t.billing_email
      ORDER BY (COUNT(DISTINCT c.id) + COUNT(DISTINCT s.id) + COUNT(DISTINCT e.id)) DESC
      LIMIT 10
    `);

    const top_tenants = topTenantsResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      company_name: row.name,
      email: row.billing_email,
      calls: parseInt(row.call_count || 0),
      sms: parseInt(row.sms_count || 0),
      emails: parseInt(row.email_count || 0),
      storage_bytes: 0,
      total_cost: 0,
      usage: {
        calls: parseInt(row.call_count || 0),
        minutes: parseFloat(row.total_minutes || 0)
      }
    }));

    return c.json({
      calls: {
        total: calls.total || 0,
        total_minutes: calls.total_minutes || 0
      },
      sms: {
        total: sms.total || 0,
        delivered: sms.delivered || 0
      },
      emails: {
        total: emails.total || 0,
        open_rate: emails.open_rate || 0
      },
      storage: {
        total_bytes: storage.total_bytes || 0,
        tenant_count: storage.tenant_count || 0
      },
      api: {
        total_requests: api.total_requests || 0,
        avg_response_ms: api.avg_response_ms || 0,
        error_rate: api.error_rate || 0
      },
      resources: {
        cpu_percent: resources.cpu_percent || 0,
        memory_percent: resources.memory_percent || 0,
        bandwidth_bytes: resources.bandwidth_bytes || 0
      },
      top_tenants: top_tenants || [],
      timeRange,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Analytics] Error:', error);
    return c.json({
      error: 'Failed to fetch analytics',
      details: error.message
    }, 500);
  }
});

/**
 * GET /admin/analytics/charts
 * Get time-series data for charts
 */
adminAnalytics.get('/charts', async (c) => {
  try {
    const { timeRange = '7d', metric = 'calls' } = c.req.query();

    const intervalMap = {
      '24h': { interval: '1 hour', format: 'HH24:00' },
      '7d': { interval: '1 day', format: 'YYYY-MM-DD' },
      '30d': { interval: '1 day', format: 'YYYY-MM-DD' },
      '90d': { interval: '1 week', format: 'YYYY-"W"IW' }
    };

    const config = intervalMap[timeRange] || intervalMap['7d'];

    // Get time-series data for calls
    const interval = timeRange === '24h' ? '24 hours' : timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days';

    const chartResult = await pool.query(`
      SELECT
        date_trunc('hour', initiated_at) as time_bucket,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'completed') as successful,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM calls
      WHERE initiated_at > NOW() - INTERVAL '${interval}'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `);

    const chartData = chartResult.rows.map(row => ({
      timestamp: row.time_bucket,
      total: parseInt(row.count),
      successful: parseInt(row.successful),
      failed: parseInt(row.failed)
    }));

    return c.json({
      metric,
      timeRange,
      data: chartData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Analytics Charts] Error:', error);
    return c.json({
      error: 'Failed to fetch chart data',
      details: error.message
    }, 500);
  }
});

export default adminAnalytics;
