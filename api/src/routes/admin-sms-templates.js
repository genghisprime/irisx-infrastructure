/**
 * Admin SMS Template Management Routes
 * Cross-tenant SMS template listing, usage analytics, opt-out management, and scheduled message monitoring
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';

const adminSMSTemplates = new Hono();

// Middleware to authenticate admin
async function authenticateAdmin(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    if (!decoded.adminId) {
      return c.json({ error: 'Invalid admin token' }, 401);
    }

    c.set('adminId', decoded.adminId);
    c.set('adminRole', decoded.role);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

adminSMSTemplates.use('*', authenticateAdmin);

// =============================================================================
// GET /admin/sms-templates/stats - Dashboard statistics
// =============================================================================
adminSMSTemplates.get('/stats', async (c) => {
  try {
    // Template counts
    const templateStats = await pool.query(`
      SELECT
        COUNT(*) as total_templates,
        COUNT(DISTINCT tenant_id) as tenants_with_templates,
        COUNT(DISTINCT category) as categories
      FROM sms_templates
    `);

    // Message stats (last 24h)
    const messageStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN template_id IS NOT NULL THEN 1 ELSE 0 END) as from_templates,
        COALESCE(SUM(price), 0) as total_cost
      FROM sms_messages
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Opt-out stats
    const optOutStats = await pool.query(`
      SELECT
        COUNT(*) as total_opt_outs,
        COUNT(CASE WHEN opted_out_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_opt_outs
      FROM sms_opt_outs
    `);

    // Scheduled message stats
    const scheduledStats = await pool.query(`
      SELECT
        COUNT(*) as total_scheduled,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM sms_scheduled
    `);

    // Calculate delivery rate
    const msgStats = messageStats.rows[0];
    const deliveryRate = msgStats.total > 0
      ? Math.round((parseInt(msgStats.delivered) / parseInt(msgStats.total)) * 100)
      : 0;

    return c.json({
      templates: {
        total: parseInt(templateStats.rows[0].total_templates) || 0,
        tenantsWithTemplates: parseInt(templateStats.rows[0].tenants_with_templates) || 0,
        categories: parseInt(templateStats.rows[0].categories) || 0
      },
      messages: {
        total24h: parseInt(msgStats.total) || 0,
        delivered: parseInt(msgStats.delivered) || 0,
        sent: parseInt(msgStats.sent) || 0,
        failed: parseInt(msgStats.failed) || 0,
        fromTemplates: parseInt(msgStats.from_templates) || 0,
        totalCost: parseFloat(msgStats.total_cost) || 0,
        deliveryRate
      },
      optOuts: {
        total: parseInt(optOutStats.rows[0].total_opt_outs) || 0,
        recent7Days: parseInt(optOutStats.rows[0].recent_opt_outs) || 0
      },
      scheduled: {
        total: parseInt(scheduledStats.rows[0].total_scheduled) || 0,
        pending: parseInt(scheduledStats.rows[0].pending) || 0,
        sent: parseInt(scheduledStats.rows[0].sent) || 0,
        failed: parseInt(scheduledStats.rows[0].failed) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    return c.json({ error: 'Failed to fetch statistics' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates - List all templates across tenants
// =============================================================================
adminSMSTemplates.get('/', async (c) => {
  try {
    const { tenant_id, category, search, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`st.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (category) {
      whereConditions.push(`st.category = $${paramIndex++}`);
      params.push(category);
    }

    if (search) {
      whereConditions.push(`(st.name ILIKE $${paramIndex} OR st.content ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Get templates with usage stats
    const result = await pool.query(`
      SELECT
        st.id,
        st.tenant_id,
        t.name as tenant_name,
        st.name,
        st.content,
        st.variables,
        st.category,
        st.created_at,
        st.updated_at,
        COALESCE(usage.message_count, 0) as message_count,
        COALESCE(usage.delivered_count, 0) as delivered_count,
        COALESCE(usage.last_used_at, NULL) as last_used_at
      FROM sms_templates st
      LEFT JOIN tenants t ON st.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) as message_count,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
          MAX(created_at) as last_used_at
        FROM sms_messages
        WHERE template_id = st.id
      ) usage ON true
      ${whereClause}
      ORDER BY st.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sms_templates st
      ${whereClause}
    `, params);

    // Get categories for filter
    const categoriesResult = await pool.query(`
      SELECT DISTINCT category FROM sms_templates ORDER BY category
    `);

    return c.json({
      templates: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      },
      categories: categoriesResult.rows.map(r => r.category)
    });
  } catch (error) {
    console.error('Error fetching SMS templates:', error);
    return c.json({ error: 'Failed to fetch templates' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/opt-outs - List opt-outs across tenants
// =============================================================================
adminSMSTemplates.get('/opt-outs/list', async (c) => {
  try {
    const { tenant_id, search, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`o.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (search) {
      whereConditions.push(`o.phone_number ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        o.id,
        o.tenant_id,
        t.name as tenant_name,
        o.phone_number,
        o.reason,
        o.opted_out_at
      FROM sms_opt_outs o
      LEFT JOIN tenants t ON o.tenant_id = t.id
      ${whereClause}
      ORDER BY o.opted_out_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sms_opt_outs o
      ${whereClause}
    `, params);

    return c.json({
      optOuts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching opt-outs:', error);
    return c.json({ error: 'Failed to fetch opt-outs' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/scheduled - List scheduled messages
// =============================================================================
adminSMSTemplates.get('/scheduled/list', async (c) => {
  try {
    const { tenant_id, status, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`s.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`s.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        s.id,
        s.tenant_id,
        t.name as tenant_name,
        s.from_number,
        s.to_number,
        s.message,
        s.template_id,
        st.name as template_name,
        s.scheduled_for,
        s.status,
        s.sent_at,
        s.error_message,
        s.created_at
      FROM sms_scheduled s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      LEFT JOIN sms_templates st ON s.template_id = st.id
      ${whereClause}
      ORDER BY s.scheduled_for DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sms_scheduled s
      ${whereClause}
    `, params);

    return c.json({
      scheduled: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching scheduled messages:', error);
    return c.json({ error: 'Failed to fetch scheduled messages' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/messages - List SMS messages across tenants
// =============================================================================
adminSMSTemplates.get('/messages/list', async (c) => {
  try {
    const { tenant_id, status, direction, template_id, search, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`m.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`m.status = $${paramIndex++}`);
      params.push(status);
    }

    if (direction) {
      whereConditions.push(`m.direction = $${paramIndex++}`);
      params.push(direction);
    }

    if (template_id) {
      whereConditions.push(`m.template_id = $${paramIndex++}`);
      params.push(template_id);
    }

    if (search) {
      whereConditions.push(`(m.to_number ILIKE $${paramIndex} OR m.from_number ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT
        m.id,
        m.uuid,
        m.message_sid,
        m.tenant_id,
        t.name as tenant_name,
        m.direction,
        m.from_number,
        m.to_number,
        m.body,
        m.num_segments,
        m.status,
        m.error_code,
        m.error_message,
        m.price,
        m.template_id,
        st.name as template_name,
        m.carrier,
        m.created_at,
        m.sent_at,
        m.delivered_at
      FROM sms_messages m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN sms_templates st ON m.template_id = st.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM sms_messages m
      ${whereClause}
    `, params);

    return c.json({
      messages: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching SMS messages:', error);
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/analytics - SMS analytics
// =============================================================================
adminSMSTemplates.get('/analytics/data', async (c) => {
  try {
    const { period = '30d' } = c.req.query();

    let interval = '30 days';
    if (period === '7d') interval = '7 days';
    else if (period === '90d') interval = '90 days';

    // Messages by tenant
    const byTenant = await pool.query(`
      SELECT
        m.tenant_id,
        t.name as tenant_name,
        COUNT(*) as total_messages,
        SUM(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN m.status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(m.price), 0) as total_cost
      FROM sms_messages m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      WHERE m.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY m.tenant_id, t.name
      ORDER BY total_messages DESC
      LIMIT 10
    `);

    // Messages by template
    const byTemplate = await pool.query(`
      SELECT
        st.id as template_id,
        st.name as template_name,
        t.name as tenant_name,
        COUNT(m.id) as usage_count,
        SUM(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        ROUND(
          SUM(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END)::numeric /
          NULLIF(COUNT(m.id), 0) * 100, 1
        ) as delivery_rate
      FROM sms_templates st
      LEFT JOIN sms_messages m ON m.template_id = st.id AND m.created_at >= NOW() - INTERVAL '${interval}'
      LEFT JOIN tenants t ON st.tenant_id = t.id
      GROUP BY st.id, st.name, t.name
      HAVING COUNT(m.id) > 0
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    // Daily trends
    const dailyTrends = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(price), 0) as cost
      FROM sms_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Opt-out trends
    const optOutTrends = await pool.query(`
      SELECT
        DATE(opted_out_at) as date,
        COUNT(*) as count
      FROM sms_opt_outs
      WHERE opted_out_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(opted_out_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Status breakdown
    const statusBreakdown = await pool.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM sms_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY status
      ORDER BY count DESC
    `);

    return c.json({
      period,
      byTenant: byTenant.rows,
      byTemplate: byTemplate.rows,
      dailyTrends: dailyTrends.rows,
      optOutTrends: optOutTrends.rows,
      statusBreakdown: statusBreakdown.rows
    });
  } catch (error) {
    console.error('Error fetching SMS analytics:', error);
    return c.json({ error: 'Failed to fetch analytics' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/scheduled/pending-queue - View pending scheduled SMS queue
// Critical for admin visibility into what's about to be sent
// =============================================================================
adminSMSTemplates.get('/scheduled/pending-queue', async (c) => {
  try {
    const { tenant_id, hours = 24, sort = 'scheduled_for', order = 'asc' } = c.req.query();

    let whereConditions = ["s.status = 'pending'", `s.scheduled_for <= NOW() + INTERVAL '${parseInt(hours)} hours'`];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`s.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');
    const orderDirection = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Get pending messages with full details
    const result = await pool.query(`
      SELECT
        s.id,
        s.tenant_id,
        t.name as tenant_name,
        s.from_number,
        s.to_number,
        s.message,
        LENGTH(s.message) as message_length,
        CEIL(LENGTH(s.message) / 160.0) as estimated_segments,
        s.template_id,
        st.name as template_name,
        s.scheduled_for,
        s.created_at,
        s.created_by,
        EXTRACT(EPOCH FROM (s.scheduled_for - NOW())) / 60 as minutes_until_send,
        CASE
          WHEN s.scheduled_for <= NOW() THEN 'overdue'
          WHEN s.scheduled_for <= NOW() + INTERVAL '15 minutes' THEN 'imminent'
          WHEN s.scheduled_for <= NOW() + INTERVAL '1 hour' THEN 'soon'
          ELSE 'scheduled'
        END as urgency
      FROM sms_scheduled s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      LEFT JOIN sms_templates st ON s.template_id = st.id
      ${whereClause}
      ORDER BY
        CASE WHEN s.scheduled_for <= NOW() THEN 0 ELSE 1 END,
        s.scheduled_for ${orderDirection}
      LIMIT 200
    `, params);

    // Get summary stats
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_pending,
        COUNT(CASE WHEN scheduled_for <= NOW() THEN 1 END) as overdue,
        COUNT(CASE WHEN scheduled_for > NOW() AND scheduled_for <= NOW() + INTERVAL '15 minutes' THEN 1 END) as next_15_min,
        COUNT(CASE WHEN scheduled_for > NOW() + INTERVAL '15 minutes' AND scheduled_for <= NOW() + INTERVAL '1 hour' THEN 1 END) as next_hour,
        COUNT(DISTINCT tenant_id) as tenants_with_pending,
        SUM(CEIL(LENGTH(message) / 160.0)) as estimated_total_segments
      FROM sms_scheduled
      WHERE status = 'pending'
    `);

    // Get breakdown by tenant
    const tenantBreakdown = await pool.query(`
      SELECT
        s.tenant_id,
        t.name as tenant_name,
        COUNT(*) as pending_count,
        MIN(s.scheduled_for) as next_scheduled,
        SUM(CEIL(LENGTH(s.message) / 160.0)) as estimated_segments
      FROM sms_scheduled s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      WHERE s.status = 'pending'
      GROUP BY s.tenant_id, t.name
      ORDER BY pending_count DESC
      LIMIT 20
    `);

    return c.json({
      queue: result.rows,
      summary: summaryResult.rows[0],
      byTenant: tenantBreakdown.rows,
      filters: {
        hours: parseInt(hours),
        tenant_id: tenant_id || null
      }
    });
  } catch (error) {
    console.error('Error fetching pending queue:', error);
    return c.json({ error: 'Failed to fetch pending queue' }, 500);
  }
});

// =============================================================================
// DELETE /admin/sms-templates/scheduled/:id - Cancel a scheduled SMS
// Admin emergency operation to prevent message from being sent
// =============================================================================
adminSMSTemplates.delete('/scheduled/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const { reason } = await c.req.json().catch(() => ({ reason: 'Admin cancellation' }));
    const adminId = c.get('adminId');

    // Get the scheduled message
    const messageResult = await pool.query(`
      SELECT s.*, t.name as tenant_name
      FROM sms_scheduled s
      LEFT JOIN tenants t ON s.tenant_id = t.id
      WHERE s.id = $1
    `, [id]);

    if (messageResult.rows.length === 0) {
      return c.json({ error: 'Scheduled message not found' }, 404);
    }

    const message = messageResult.rows[0];

    if (message.status !== 'pending') {
      return c.json({
        error: `Cannot cancel message with status '${message.status}'`,
        current_status: message.status
      }, 400);
    }

    // Cancel the message
    await pool.query(`
      UPDATE sms_scheduled
      SET
        status = 'cancelled',
        error_message = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [`Cancelled by admin: ${reason}`, id]);

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      adminId,
      'cancel_scheduled_sms',
      'sms_scheduled',
      id,
      JSON.stringify({
        tenant_id: message.tenant_id,
        tenant_name: message.tenant_name,
        to_number: message.to_number,
        from_number: message.from_number,
        scheduled_for: message.scheduled_for,
        reason,
        cancelled_at: new Date().toISOString()
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Scheduled SMS cancelled',
      cancelled: {
        id: message.id,
        to_number: message.to_number,
        scheduled_for: message.scheduled_for,
        reason
      }
    });
  } catch (error) {
    console.error('Error cancelling scheduled SMS:', error);
    return c.json({ error: 'Failed to cancel scheduled SMS' }, 500);
  }
});

// =============================================================================
// POST /admin/sms-templates/scheduled/bulk-cancel - Bulk cancel scheduled SMS
// Emergency operation to cancel multiple messages at once
// =============================================================================
adminSMSTemplates.post('/scheduled/bulk-cancel', async (c) => {
  try {
    const { ids, tenant_id, reason } = await c.req.json();
    const adminId = c.get('adminId');

    if (!reason) {
      return c.json({ error: 'Reason is required for audit trail' }, 400);
    }

    let whereConditions = ["status = 'pending'"];
    let params = [];
    let paramIndex = 1;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      whereConditions.push(`id = ANY($${paramIndex++})`);
      params.push(ids);
    } else if (tenant_id) {
      whereConditions.push(`tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    } else {
      return c.json({ error: 'Either ids array or tenant_id is required' }, 400);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Get messages to be cancelled for audit
    const toCancel = await pool.query(`
      SELECT id, tenant_id, to_number, scheduled_for
      FROM sms_scheduled
      ${whereClause}
    `, params);

    if (toCancel.rows.length === 0) {
      return c.json({ error: 'No pending messages found matching criteria' }, 404);
    }

    // Cancel the messages
    await pool.query(`
      UPDATE sms_scheduled
      SET
        status = 'cancelled',
        error_message = $1,
        updated_at = NOW()
      ${whereClause}
    `, [`Bulk cancelled by admin: ${reason}`, ...params]);

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      adminId,
      'bulk_cancel_scheduled_sms',
      'sms_scheduled',
      null,
      JSON.stringify({
        cancelled_count: toCancel.rows.length,
        message_ids: toCancel.rows.map(r => r.id),
        tenant_id: tenant_id || null,
        reason,
        cancelled_at: new Date().toISOString()
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: `${toCancel.rows.length} scheduled SMS messages cancelled`,
      cancelled_count: toCancel.rows.length,
      cancelled_ids: toCancel.rows.map(r => r.id)
    });
  } catch (error) {
    console.error('Error bulk cancelling scheduled SMS:', error);
    return c.json({ error: 'Failed to bulk cancel scheduled SMS' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/cost-by-tenant - Cost breakdown by tenant
// =============================================================================
adminSMSTemplates.get('/cost-by-tenant', async (c) => {
  try {
    const { period = '30d' } = c.req.query();

    let interval = '30 days';
    if (period === '7d') interval = '7 days';
    else if (period === '90d') interval = '90 days';

    const result = await pool.query(`
      SELECT
        m.tenant_id,
        t.name as tenant_name,
        COUNT(*) as message_count,
        SUM(m.num_segments) as total_segments,
        COALESCE(SUM(m.price), 0) as total_cost,
        ROUND(COALESCE(SUM(m.price), 0) / NULLIF(COUNT(*), 0), 4) as avg_cost_per_message
      FROM sms_messages m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      WHERE m.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY m.tenant_id, t.name
      ORDER BY total_cost DESC
    `);

    return c.json({
      period,
      tenants: result.rows
    });
  } catch (error) {
    console.error('Error fetching cost breakdown:', error);
    return c.json({ error: 'Failed to fetch cost breakdown' }, 500);
  }
});

// =============================================================================
// GET /admin/sms-templates/:id - Get template details
// IMPORTANT: This route must be defined LAST to avoid matching other routes
// like /cost-by-tenant, /opt-outs/list, /scheduled/list, etc.
// =============================================================================
adminSMSTemplates.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();

    const result = await pool.query(`
      SELECT
        st.*,
        t.name as tenant_name,
        t.status as tenant_status
      FROM sms_templates st
      LEFT JOIN tenants t ON st.tenant_id = t.id
      WHERE st.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    const template = result.rows[0];

    // Get usage statistics
    const usageStats = await pool.query(`
      SELECT
        COUNT(*) as total_sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(price), 0) as total_cost,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used
      FROM sms_messages
      WHERE template_id = $1
    `, [id]);

    // Get recent messages using this template
    const recentMessages = await pool.query(`
      SELECT
        id,
        to_number,
        status,
        price,
        created_at
      FROM sms_messages
      WHERE template_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    // Get scheduled messages using this template
    const scheduledMessages = await pool.query(`
      SELECT
        id,
        to_number,
        scheduled_for,
        status
      FROM sms_scheduled
      WHERE template_id = $1
      ORDER BY scheduled_for DESC
      LIMIT 10
    `, [id]);

    return c.json({
      template,
      usage: usageStats.rows[0],
      recentMessages: recentMessages.rows,
      scheduledMessages: scheduledMessages.rows
    });
  } catch (error) {
    console.error('Error fetching template details:', error);
    return c.json({ error: 'Failed to fetch template details' }, 500);
  }
});

export default adminSMSTemplates;
