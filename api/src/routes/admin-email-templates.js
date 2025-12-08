import { Hono } from 'hono';
import pool from '../db/connection.js';

const adminEmailTemplates = new Hono();

// GET /admin/email-templates/stats - Dashboard statistics
adminEmailTemplates.get('/stats', async (c) => {
  try {
    // Template stats
    const templateStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(DISTINCT tenant_id) as tenants_with_templates,
        COALESCE(SUM(times_used), 0) as total_usage
      FROM email_templates
    `);

    // Email stats (last 24 hours)
    const emailStats24h = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'opened') as opened,
        COALESCE(SUM(cost_cents), 0) / 100.0 as total_cost
      FROM emails
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Unsubscribe stats
    const unsubscribeStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as recent_7d
      FROM email_unsubscribes
    `);

    // Bounce stats
    const bounceStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_suppressed = true) as suppressed,
        COUNT(*) FILTER (WHERE last_bounced_at >= NOW() - INTERVAL '7 days') as recent_7d
      FROM email_bounces
    `);

    // Delivery rate calculation
    const stats24h = emailStats24h.rows[0];
    const deliveryRate = stats24h.total > 0
      ? Math.round((parseInt(stats24h.delivered) / parseInt(stats24h.total)) * 100)
      : 0;

    return c.json({
      templates: {
        total: parseInt(templateStats.rows[0].total),
        active: parseInt(templateStats.rows[0].active),
        tenantsWithTemplates: parseInt(templateStats.rows[0].tenants_with_templates),
        totalUsage: parseInt(templateStats.rows[0].total_usage)
      },
      emails: {
        total24h: parseInt(stats24h.total),
        sent: parseInt(stats24h.sent),
        delivered: parseInt(stats24h.delivered),
        bounced: parseInt(stats24h.bounced),
        failed: parseInt(stats24h.failed),
        opened: parseInt(stats24h.opened),
        totalCost: parseFloat(stats24h.total_cost),
        deliveryRate
      },
      unsubscribes: {
        total: parseInt(unsubscribeStats.rows[0].total),
        recent7d: parseInt(unsubscribeStats.rows[0].recent_7d)
      },
      bounces: {
        total: parseInt(bounceStats.rows[0].total),
        suppressed: parseInt(bounceStats.rows[0].suppressed),
        recent7d: parseInt(bounceStats.rows[0].recent_7d)
      }
    });
  } catch (error) {
    console.error('Failed to get email template stats:', error);
    return c.json({ error: 'Failed to get stats', details: error.message }, 500);
  }
});

// GET /admin/email-templates - List all email templates
adminEmailTemplates.get('/', async (c) => {
  try {
    const { tenant_id, is_active, search, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`et.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (is_active !== undefined && is_active !== '') {
      whereConditions.push(`et.is_active = $${paramIndex++}`);
      params.push(is_active === 'true');
    }

    if (search) {
      whereConditions.push(`(et.name ILIKE $${paramIndex} OR et.slug ILIKE $${paramIndex} OR et.subject ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get templates with tenant info
    const result = await pool.query(`
      SELECT
        et.id,
        et.tenant_id,
        t.name as tenant_name,
        et.name,
        et.slug,
        et.description,
        et.subject,
        et.variables,
        et.is_active,
        et.times_used,
        et.last_used_at,
        et.created_at,
        et.updated_at,
        (SELECT COUNT(*) FROM emails e WHERE e.metadata->>'template_id' = et.id::text) as email_count
      FROM email_templates et
      LEFT JOIN tenants t ON et.tenant_id = t.id
      ${whereClause}
      ORDER BY et.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM email_templates et
      ${whereClause}
    `, params);

    return c.json({
      templates: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Failed to list email templates:', error);
    return c.json({ error: 'Failed to list templates', details: error.message }, 500);
  }
});

// GET /admin/email-templates/unsubscribes/list - List unsubscribes
adminEmailTemplates.get('/unsubscribes/list', async (c) => {
  try {
    const { tenant_id, search, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`eu.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (search) {
      whereConditions.push(`eu.email_address ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        eu.id,
        eu.tenant_id,
        t.name as tenant_name,
        eu.email_address,
        eu.reason,
        eu.unsubscribed_at,
        eu.created_at
      FROM email_unsubscribes eu
      LEFT JOIN tenants t ON eu.tenant_id = t.id
      ${whereClause}
      ORDER BY eu.unsubscribed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM email_unsubscribes eu ${whereClause}
    `, params);

    return c.json({
      unsubscribes: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Failed to list unsubscribes:', error);
    return c.json({ error: 'Failed to list unsubscribes', details: error.message }, 500);
  }
});

// GET /admin/email-templates/bounces/list - List bounces
adminEmailTemplates.get('/bounces/list', async (c) => {
  try {
    const { tenant_id, bounce_type, suppressed, search, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`eb.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (bounce_type) {
      whereConditions.push(`eb.bounce_type = $${paramIndex++}`);
      params.push(bounce_type);
    }

    if (suppressed !== undefined && suppressed !== '') {
      whereConditions.push(`eb.is_suppressed = $${paramIndex++}`);
      params.push(suppressed === 'true');
    }

    if (search) {
      whereConditions.push(`eb.email_address ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        eb.id,
        eb.tenant_id,
        t.name as tenant_name,
        eb.email_address,
        eb.bounce_type,
        eb.bounce_reason,
        eb.bounce_count,
        eb.is_suppressed,
        eb.first_bounced_at,
        eb.last_bounced_at,
        eb.created_at
      FROM email_bounces eb
      LEFT JOIN tenants t ON eb.tenant_id = t.id
      ${whereClause}
      ORDER BY eb.last_bounced_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM email_bounces eb ${whereClause}
    `, params);

    return c.json({
      bounces: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Failed to list bounces:', error);
    return c.json({ error: 'Failed to list bounces', details: error.message }, 500);
  }
});

// GET /admin/email-templates/emails/list - List emails with filters
adminEmailTemplates.get('/emails/list', async (c) => {
  try {
    const { tenant_id, status, email_type, search, from_date, to_date, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`e.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`e.status = $${paramIndex++}`);
      params.push(status);
    }

    if (email_type) {
      whereConditions.push(`e.email_type = $${paramIndex++}`);
      params.push(email_type);
    }

    if (search) {
      whereConditions.push(`(e.to_email ILIKE $${paramIndex} OR e.from_email ILIKE $${paramIndex} OR e.subject ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (from_date) {
      whereConditions.push(`e.created_at >= $${paramIndex++}`);
      params.push(from_date);
    }

    if (to_date) {
      whereConditions.push(`e.created_at <= $${paramIndex++}`);
      params.push(to_date);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        e.id,
        e.tenant_id,
        t.name as tenant_name,
        e.from_email,
        e.from_name,
        e.to_email,
        e.to_name,
        e.subject,
        e.status,
        e.status_message,
        e.email_type,
        e.has_attachments,
        e.attachment_count,
        e.open_count,
        e.click_count,
        e.cost_cents,
        e.queued_at,
        e.sent_at,
        e.delivered_at,
        e.opened_at,
        e.bounced_at,
        e.created_at
      FROM emails e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM emails e ${whereClause}
    `, params);

    return c.json({
      emails: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Failed to list emails:', error);
    return c.json({ error: 'Failed to list emails', details: error.message }, 500);
  }
});

// GET /admin/email-templates/analytics/data - Email analytics
adminEmailTemplates.get('/analytics/data', async (c) => {
  try {
    const { days = 30 } = c.req.query();

    // Overall stats
    const overallStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'opened') as opened,
        COUNT(*) FILTER (WHERE status = 'clicked') as clicked,
        COALESCE(SUM(cost_cents), 0) / 100.0 as total_cost,
        COALESCE(AVG(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) * 100, 0) as delivery_rate,
        COALESCE(AVG(CASE WHEN status IN ('opened', 'clicked') AND status = 'delivered' THEN 1 ELSE 0 END) * 100, 0) as open_rate
      FROM emails
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
    `, [parseInt(days)]);

    // Stats by tenant
    const byTenant = await pool.query(`
      SELECT
        e.tenant_id,
        t.name as tenant_name,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE e.status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE e.status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE e.status = 'opened') as opened,
        COALESCE(SUM(e.cost_cents), 0) / 100.0 as total_cost
      FROM emails e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      WHERE e.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY e.tenant_id, t.name
      ORDER BY total DESC
      LIMIT 20
    `, [parseInt(days)]);

    // Daily trends
    const dailyTrends = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'opened') as opened
      FROM emails
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [parseInt(days)]);

    // By email type
    const byType = await pool.query(`
      SELECT
        email_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COALESCE(SUM(cost_cents), 0) / 100.0 as total_cost
      FROM emails
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY email_type
      ORDER BY total DESC
    `, [parseInt(days)]);

    return c.json({
      overall: overallStats.rows[0],
      byTenant: byTenant.rows,
      dailyTrends: dailyTrends.rows,
      byType: byType.rows,
      period: parseInt(days)
    });
  } catch (error) {
    console.error('Failed to get email analytics:', error);
    return c.json({ error: 'Failed to get analytics', details: error.message }, 500);
  }
});

// GET /admin/email-templates/cost-by-tenant - Cost breakdown by tenant
adminEmailTemplates.get('/cost-by-tenant', async (c) => {
  try {
    const { days = 30 } = c.req.query();

    const result = await pool.query(`
      SELECT
        e.tenant_id,
        t.name as tenant_name,
        COUNT(*) as emails_sent,
        COUNT(*) FILTER (WHERE e.status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE e.status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE e.status = 'failed') as failed,
        COALESCE(SUM(e.cost_cents), 0) / 100.0 as total_cost,
        COUNT(DISTINCT DATE(e.created_at)) as active_days
      FROM emails e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      WHERE e.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY e.tenant_id, t.name
      ORDER BY total_cost DESC
    `, [parseInt(days)]);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => ({
      totalEmails: acc.totalEmails + parseInt(row.emails_sent),
      totalDelivered: acc.totalDelivered + parseInt(row.delivered),
      totalBounced: acc.totalBounced + parseInt(row.bounced),
      totalCost: acc.totalCost + parseFloat(row.total_cost)
    }), { totalEmails: 0, totalDelivered: 0, totalBounced: 0, totalCost: 0 });

    return c.json({
      costs: result.rows,
      totals,
      period: parseInt(days)
    });
  } catch (error) {
    console.error('Failed to get cost by tenant:', error);
    return c.json({ error: 'Failed to get cost breakdown', details: error.message }, 500);
  }
});

// GET /admin/email-templates/events/list - List email events
adminEmailTemplates.get('/events/list', async (c) => {
  try {
    const { tenant_id, event_type, email_id, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`ee.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (event_type) {
      whereConditions.push(`ee.event_type = $${paramIndex++}`);
      params.push(event_type);
    }

    if (email_id) {
      whereConditions.push(`ee.email_id = $${paramIndex++}`);
      params.push(email_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        ee.id,
        ee.email_id,
        ee.tenant_id,
        t.name as tenant_name,
        ee.event_type,
        ee.event_data,
        ee.user_agent,
        ee.ip_address,
        ee.url,
        ee.occurred_at,
        e.to_email,
        e.subject
      FROM email_events ee
      LEFT JOIN tenants t ON ee.tenant_id = t.id
      LEFT JOIN emails e ON ee.email_id = e.id
      ${whereClause}
      ORDER BY ee.occurred_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM email_events ee ${whereClause}
    `, params);

    return c.json({
      events: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Failed to list email events:', error);
    return c.json({ error: 'Failed to list events', details: error.message }, 500);
  }
});

// GET /admin/email-templates/:id - Get template details
// IMPORTANT: This route must be defined LAST to avoid matching other routes like /cost-by-tenant
adminEmailTemplates.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();

    const result = await pool.query(`
      SELECT
        et.*,
        t.name as tenant_name,
        (SELECT COUNT(*) FROM emails e WHERE e.metadata->>'template_id' = et.id::text) as email_count,
        (SELECT COUNT(*) FROM emails e WHERE e.metadata->>'template_id' = et.id::text AND e.status = 'delivered') as delivered_count,
        (SELECT COUNT(*) FROM emails e WHERE e.metadata->>'template_id' = et.id::text AND e.status = 'opened') as opened_count
      FROM email_templates et
      LEFT JOIN tenants t ON et.tenant_id = t.id
      WHERE et.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    // Get recent emails using this template
    const recentEmails = await pool.query(`
      SELECT id, to_email, subject, status, sent_at, opened_at
      FROM emails
      WHERE metadata->>'template_id' = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    return c.json({
      template: result.rows[0],
      recentEmails: recentEmails.rows
    });
  } catch (error) {
    console.error('Failed to get template details:', error);
    return c.json({ error: 'Failed to get template', details: error.message }, 500);
  }
});

export default adminEmailTemplates;
