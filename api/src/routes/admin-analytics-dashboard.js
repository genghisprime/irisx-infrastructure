import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminAnalytics = new Hono();

adminAnalytics.use('*', authenticateAdmin);

// Helper to format numbers
const formatNumber = (num) => {
  if (num === null || num === undefined) return 0;
  return parseFloat(num) || 0;
};

// ============================================================================
// GET /admin/analytics/overview - Dashboard summary statistics
// ============================================================================
adminAnalytics.get('/overview', async (c) => {
  try {
    const { period = '30d' } = c.req.query();

    // Calculate date range
    let startDate;
    const endDate = new Date();

    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'ytd':
        startDate = new Date(new Date().getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get aggregate statistics
    const [
      tenantStats,
      usageStats,
      revenueStats,
      activityStats
    ] = await Promise.all([
      // Tenant statistics
      pool.query(`
        SELECT
          COUNT(*) as total_tenants,
          COUNT(*) FILTER (WHERE status = 'active') as active_tenants,
          COUNT(*) FILTER (WHERE created_at >= $1) as new_tenants
        FROM tenants
        WHERE deleted_at IS NULL
      `, [startDate]),

      // Usage tracking statistics (from usage_tracking table)
      pool.query(`
        SELECT
          COALESCE(SUM(total_call_minutes), 0) as total_call_minutes,
          COALESCE(SUM(call_count), 0) as total_calls,
          COALESCE(SUM(total_sms_sent), 0) as total_sms,
          COALESCE(SUM(total_emails_sent), 0) as total_emails,
          COALESCE(SUM(total_cost), 0) as total_cost
        FROM usage_tracking
        WHERE tracking_date >= $1 AND tracking_date <= $2
      `, [startDate, endDate]),

      // Revenue statistics from invoices (amount_cents / 100 = dollars)
      pool.query(`
        SELECT
          COALESCE(SUM(amount_cents) / 100.0, 0) as total_revenue,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) / 100.0, 0) as collected_revenue,
          COALESCE(SUM(CASE WHEN status IN ('pending', 'sent', 'draft') THEN amount_cents ELSE 0 END) / 100.0, 0) as pending_revenue,
          COUNT(*) as total_invoices,
          COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices
        FROM invoices
        WHERE created_at >= $1 AND created_at <= $2
      `, [startDate, endDate]),

      // Recent activity counts
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM calls WHERE created_at >= $1) as recent_calls,
          (SELECT COUNT(*) FROM chat_conversations WHERE created_at >= $1) as recent_conversations
      `, [startDate])
    ]);

    return c.json({
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      tenants: {
        total: parseInt(tenantStats.rows[0]?.total_tenants || 0),
        active: parseInt(tenantStats.rows[0]?.active_tenants || 0),
        newThisPeriod: parseInt(tenantStats.rows[0]?.new_tenants || 0)
      },
      usage: {
        totalCallMinutes: formatNumber(usageStats.rows[0]?.total_call_minutes),
        totalCalls: parseInt(usageStats.rows[0]?.total_calls || 0),
        totalSMS: parseInt(usageStats.rows[0]?.total_sms || 0),
        totalEmails: parseInt(usageStats.rows[0]?.total_emails || 0),
        totalCost: formatNumber(usageStats.rows[0]?.total_cost)
      },
      revenue: {
        total: formatNumber(revenueStats.rows[0]?.total_revenue),
        collected: formatNumber(revenueStats.rows[0]?.collected_revenue),
        pending: formatNumber(revenueStats.rows[0]?.pending_revenue),
        invoiceCount: parseInt(revenueStats.rows[0]?.total_invoices || 0),
        paidInvoiceCount: parseInt(revenueStats.rows[0]?.paid_invoices || 0)
      },
      activity: {
        recentCalls: parseInt(activityStats.rows[0]?.recent_calls || 0),
        recentConversations: parseInt(activityStats.rows[0]?.recent_conversations || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    return c.json({ error: 'Failed to fetch analytics overview', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/channel-comparison - Compare usage across channels
// ============================================================================
adminAnalytics.get('/channel-comparison', async (c) => {
  try {
    const { period = '30d' } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get channel comparison from usage_tracking
    const usageResult = await pool.query(`
      SELECT
        COALESCE(SUM(call_count), 0) as voice_count,
        COALESCE(SUM(total_call_cost), 0) as voice_cost,
        COALESCE(SUM(total_sms_sent), 0) as sms_count,
        COALESCE(SUM(total_sms_cost), 0) as sms_cost,
        COALESCE(SUM(total_emails_sent), 0) as email_count,
        COALESCE(SUM(total_email_cost), 0) as email_cost
      FROM usage_tracking
      WHERE tracking_date >= $1
    `, [startDate]);

    // Get WhatsApp and social media counts from their tables
    const [whatsappResult, socialResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) as count
        FROM whatsapp_messages
        WHERE created_at >= $1
      `, [startDate]).catch(() => ({ rows: [{ count: 0 }] })),

      pool.query(`
        SELECT COUNT(*) as count
        FROM social_media_messages
        WHERE created_at >= $1
      `, [startDate]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    const usage = usageResult.rows[0] || {};

    const channels = [
      {
        channel: 'voice',
        label: 'Voice Calls',
        count: parseInt(usage.voice_count || 0),
        cost: formatNumber(usage.voice_cost),
        icon: 'phone'
      },
      {
        channel: 'sms',
        label: 'SMS Messages',
        count: parseInt(usage.sms_count || 0),
        cost: formatNumber(usage.sms_cost),
        icon: 'message'
      },
      {
        channel: 'email',
        label: 'Emails',
        count: parseInt(usage.email_count || 0),
        cost: formatNumber(usage.email_cost),
        icon: 'mail'
      },
      {
        channel: 'whatsapp',
        label: 'WhatsApp',
        count: parseInt(whatsappResult.rows[0]?.count || 0),
        cost: 0, // Would need to calculate from rates
        icon: 'whatsapp'
      },
      {
        channel: 'social',
        label: 'Social Media',
        count: parseInt(socialResult.rows[0]?.count || 0),
        cost: 0,
        icon: 'share'
      }
    ];

    const totalCount = channels.reduce((sum, ch) => sum + ch.count, 0);
    const totalCost = channels.reduce((sum, ch) => sum + ch.cost, 0);

    // Calculate percentages
    const channelsWithPercentage = channels.map(ch => ({
      ...ch,
      percentage: totalCount > 0 ? ((ch.count / totalCount) * 100).toFixed(1) : 0,
      costPercentage: totalCost > 0 ? ((ch.cost / totalCost) * 100).toFixed(1) : 0
    }));

    return c.json({
      period,
      channels: channelsWithPercentage,
      totals: {
        count: totalCount,
        cost: totalCost
      }
    });
  } catch (error) {
    console.error('Error fetching channel comparison:', error);
    return c.json({ error: 'Failed to fetch channel comparison', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/usage-trends - Daily/weekly usage trends
// ============================================================================
adminAnalytics.get('/usage-trends', async (c) => {
  try {
    const { period = '30d', granularity = 'daily' } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    let dateFormat, groupBy;
    if (granularity === 'weekly') {
      dateFormat = "TO_CHAR(DATE_TRUNC('week', tracking_date), 'YYYY-MM-DD')";
      groupBy = "DATE_TRUNC('week', tracking_date)";
    } else {
      dateFormat = "TO_CHAR(tracking_date, 'YYYY-MM-DD')";
      groupBy = "tracking_date";
    }

    const result = await pool.query(`
      SELECT
        ${dateFormat} as date,
        COALESCE(SUM(call_count), 0) as calls,
        COALESCE(SUM(total_call_minutes), 0) as call_minutes,
        COALESCE(SUM(total_sms_sent), 0) as sms,
        COALESCE(SUM(total_emails_sent), 0) as emails,
        COALESCE(SUM(total_cost), 0) as cost,
        COUNT(DISTINCT tenant_id) as active_tenants
      FROM usage_tracking
      WHERE tracking_date >= $1
      GROUP BY ${groupBy}
      ORDER BY ${groupBy}
    `, [startDate]);

    return c.json({
      period,
      granularity,
      trends: result.rows.map(row => ({
        date: row.date,
        calls: parseInt(row.calls || 0),
        callMinutes: formatNumber(row.call_minutes),
        sms: parseInt(row.sms || 0),
        emails: parseInt(row.emails || 0),
        cost: formatNumber(row.cost),
        activeTenants: parseInt(row.active_tenants || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching usage trends:', error);
    return c.json({ error: 'Failed to fetch usage trends', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/top-tenants - Top tenants by usage/revenue
// ============================================================================
adminAnalytics.get('/top-tenants', async (c) => {
  try {
    const { period = '30d', sortBy = 'cost', limit = 10 } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    let orderBy;
    switch (sortBy) {
      case 'calls':
        orderBy = 'total_calls DESC';
        break;
      case 'sms':
        orderBy = 'total_sms DESC';
        break;
      case 'emails':
        orderBy = 'total_emails DESC';
        break;
      case 'cost':
      default:
        orderBy = 'total_cost DESC';
        break;
    }

    const result = await pool.query(`
      SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        t.status,
        COALESCE(SUM(u.call_count), 0) as total_calls,
        COALESCE(SUM(u.total_call_minutes), 0) as total_call_minutes,
        COALESCE(SUM(u.total_sms_sent), 0) as total_sms,
        COALESCE(SUM(u.total_emails_sent), 0) as total_emails,
        COALESCE(SUM(u.total_cost), 0) as total_cost
      FROM tenants t
      LEFT JOIN usage_tracking u ON t.id = u.tenant_id AND u.tracking_date >= $1
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, t.name, t.status
      HAVING SUM(u.total_cost) > 0 OR SUM(u.call_count) > 0 OR SUM(u.total_sms_sent) > 0
      ORDER BY ${orderBy}
      LIMIT $2
    `, [startDate, parseInt(limit)]);

    return c.json({
      period,
      sortBy,
      tenants: result.rows.map((row, index) => ({
        rank: index + 1,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        status: row.status,
        totalCalls: parseInt(row.total_calls || 0),
        totalCallMinutes: formatNumber(row.total_call_minutes),
        totalSMS: parseInt(row.total_sms || 0),
        totalEmails: parseInt(row.total_emails || 0),
        totalCost: formatNumber(row.total_cost)
      }))
    });
  } catch (error) {
    console.error('Error fetching top tenants:', error);
    return c.json({ error: 'Failed to fetch top tenants', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/cost-breakdown - Cost breakdown by tenant
// ============================================================================
adminAnalytics.get('/cost-breakdown', async (c) => {
  try {
    const { period = '30d', tenant_id } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    let query, params;

    if (tenant_id) {
      // Cost breakdown for specific tenant
      query = `
        SELECT
          'voice' as channel,
          COALESCE(SUM(total_call_cost), 0) as cost,
          COALESCE(SUM(call_count), 0) as quantity
        FROM usage_tracking
        WHERE tenant_id = $1 AND tracking_date >= $2
        UNION ALL
        SELECT
          'sms' as channel,
          COALESCE(SUM(total_sms_cost), 0) as cost,
          COALESCE(SUM(total_sms_sent), 0) as quantity
        FROM usage_tracking
        WHERE tenant_id = $1 AND tracking_date >= $2
        UNION ALL
        SELECT
          'email' as channel,
          COALESCE(SUM(total_email_cost), 0) as cost,
          COALESCE(SUM(total_emails_sent), 0) as quantity
        FROM usage_tracking
        WHERE tenant_id = $1 AND tracking_date >= $2
      `;
      params = [tenant_id, startDate];
    } else {
      // Cost breakdown across all tenants
      query = `
        SELECT
          t.id as tenant_id,
          t.name as tenant_name,
          COALESCE(SUM(u.total_call_cost), 0) as voice_cost,
          COALESCE(SUM(u.total_sms_cost), 0) as sms_cost,
          COALESCE(SUM(u.total_email_cost), 0) as email_cost,
          COALESCE(SUM(u.total_cost), 0) as total_cost
        FROM tenants t
        LEFT JOIN usage_tracking u ON t.id = u.tenant_id AND u.tracking_date >= $1
        WHERE t.deleted_at IS NULL
        GROUP BY t.id, t.name
        HAVING SUM(u.total_cost) > 0
        ORDER BY total_cost DESC
        LIMIT 20
      `;
      params = [startDate];
    }

    const result = await pool.query(query, params);

    if (tenant_id) {
      const breakdown = result.rows.reduce((acc, row) => {
        acc[row.channel] = {
          cost: formatNumber(row.cost),
          quantity: parseInt(row.quantity || 0)
        };
        return acc;
      }, {});

      return c.json({
        period,
        tenantId: tenant_id,
        breakdown,
        totalCost: Object.values(breakdown).reduce((sum, ch) => sum + ch.cost, 0)
      });
    }

    return c.json({
      period,
      tenants: result.rows.map(row => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        voiceCost: formatNumber(row.voice_cost),
        smsCost: formatNumber(row.sms_cost),
        emailCost: formatNumber(row.email_cost),
        totalCost: formatNumber(row.total_cost)
      }))
    });
  } catch (error) {
    console.error('Error fetching cost breakdown:', error);
    return c.json({ error: 'Failed to fetch cost breakdown', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/revenue-trends - Revenue trends over time
// ============================================================================
adminAnalytics.get('/revenue-trends', async (c) => {
  try {
    const { period = '12m' } = c.req.query();

    let startDate, granularity;
    switch (period) {
      case '3m':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        granularity = 'week';
        break;
      case '6m':
        startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        granularity = 'month';
        break;
      case '12m':
      default:
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        granularity = 'month';
        break;
    }

    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC($1, created_at), 'YYYY-MM-DD') as period,
        COALESCE(SUM(amount_cents) / 100.0, 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) / 100.0, 0) as collected,
        COUNT(*) as invoice_count
      FROM invoices
      WHERE created_at >= $2
      GROUP BY DATE_TRUNC($1, created_at)
      ORDER BY DATE_TRUNC($1, created_at)
    `, [granularity, startDate]);

    return c.json({
      period,
      granularity,
      trends: result.rows.map(row => ({
        period: row.period,
        totalRevenue: formatNumber(row.total_revenue),
        collected: formatNumber(row.collected),
        invoiceCount: parseInt(row.invoice_count || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching revenue trends:', error);
    return c.json({ error: 'Failed to fetch revenue trends', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/real-time - Real-time usage stats (last 24 hours)
// ============================================================================
adminAnalytics.get('/real-time', async (c) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const [
      hourlyStats,
      activeCallsResult,
      activeChatsResult
    ] = await Promise.all([
      // Hourly breakdown for last 24 hours
      pool.query(`
        SELECT
          DATE_TRUNC('hour', tracking_date + (EXTRACT(HOUR FROM NOW())::int * INTERVAL '1 hour')) as hour,
          COALESCE(SUM(call_count), 0) as calls,
          COALESCE(SUM(total_sms_sent), 0) as sms,
          COALESCE(SUM(total_emails_sent), 0) as emails
        FROM usage_tracking
        WHERE tracking_date >= $1::date
        GROUP BY DATE_TRUNC('hour', tracking_date + (EXTRACT(HOUR FROM NOW())::int * INTERVAL '1 hour'))
        ORDER BY hour DESC
        LIMIT 24
      `, [last24h]),

      // Active calls (in progress)
      pool.query(`
        SELECT COUNT(*) as count
        FROM calls
        WHERE status = 'in-progress' OR (start_time >= $1 AND end_time IS NULL)
      `, [lastHour]).catch(() => ({ rows: [{ count: 0 }] })),

      // Active chats
      pool.query(`
        SELECT COUNT(*) as count
        FROM chat_conversations
        WHERE status = 'open' OR status = 'active'
      `).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    return c.json({
      timestamp: new Date().toISOString(),
      activeCalls: parseInt(activeCallsResult.rows[0]?.count || 0),
      activeChats: parseInt(activeChatsResult.rows[0]?.count || 0),
      hourlyBreakdown: hourlyStats.rows.map(row => ({
        hour: row.hour,
        calls: parseInt(row.calls || 0),
        sms: parseInt(row.sms || 0),
        emails: parseInt(row.emails || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching real-time stats:', error);
    return c.json({ error: 'Failed to fetch real-time stats', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/analytics/tenant/:id - Detailed analytics for specific tenant
// ============================================================================
adminAnalytics.get('/tenant/:id', async (c) => {
  try {
    const tenantId = c.req.param('id');
    const { period = '30d' } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [tenantInfo, usageStats, dailyTrends] = await Promise.all([
      // Tenant info
      pool.query(`
        SELECT id, name, status, plan_id, credit_balance, created_at
        FROM tenants
        WHERE id = $1 AND deleted_at IS NULL
      `, [tenantId]),

      // Usage stats
      pool.query(`
        SELECT
          COALESCE(SUM(call_count), 0) as total_calls,
          COALESCE(SUM(total_call_minutes), 0) as total_call_minutes,
          COALESCE(SUM(total_call_cost), 0) as total_call_cost,
          COALESCE(SUM(total_sms_sent), 0) as total_sms,
          COALESCE(SUM(total_sms_cost), 0) as total_sms_cost,
          COALESCE(SUM(total_emails_sent), 0) as total_emails,
          COALESCE(SUM(total_email_cost), 0) as total_email_cost,
          COALESCE(SUM(total_cost), 0) as total_cost
        FROM usage_tracking
        WHERE tenant_id = $1 AND tracking_date >= $2
      `, [tenantId, startDate]),

      // Daily trends
      pool.query(`
        SELECT
          TO_CHAR(tracking_date, 'YYYY-MM-DD') as date,
          COALESCE(call_count, 0) as calls,
          COALESCE(total_sms_sent, 0) as sms,
          COALESCE(total_emails_sent, 0) as emails,
          COALESCE(total_cost, 0) as cost
        FROM usage_tracking
        WHERE tenant_id = $1 AND tracking_date >= $2
        ORDER BY tracking_date
      `, [tenantId, startDate])
    ]);

    if (tenantInfo.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantInfo.rows[0];
    const usage = usageStats.rows[0] || {};

    return c.json({
      period,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        planId: tenant.plan_id,
        creditBalance: formatNumber(tenant.credit_balance),
        createdAt: tenant.created_at
      },
      usage: {
        totalCalls: parseInt(usage.total_calls || 0),
        totalCallMinutes: formatNumber(usage.total_call_minutes),
        totalCallCost: formatNumber(usage.total_call_cost),
        totalSMS: parseInt(usage.total_sms || 0),
        totalSMSCost: formatNumber(usage.total_sms_cost),
        totalEmails: parseInt(usage.total_emails || 0),
        totalEmailCost: formatNumber(usage.total_email_cost),
        totalCost: formatNumber(usage.total_cost)
      },
      dailyTrends: dailyTrends.rows.map(row => ({
        date: row.date,
        calls: parseInt(row.calls || 0),
        sms: parseInt(row.sms || 0),
        emails: parseInt(row.emails || 0),
        cost: formatNumber(row.cost)
      }))
    });
  } catch (error) {
    console.error('Error fetching tenant analytics:', error);
    return c.json({ error: 'Failed to fetch tenant analytics', details: error.message }, 500);
  }
});

export default adminAnalytics;
