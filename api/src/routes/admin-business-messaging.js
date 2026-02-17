/**
 * Admin Business Messaging Routes
 *
 * Cross-tenant management for Apple Business Messages, Google Business Messages, and RCS
 */

import { Hono } from 'hono';
import { authenticateAdmin, requireAdminRole } from './admin-auth.js';
import db from '../db/connection.js';

const router = new Hono();

// Apply admin auth middleware
router.use('*', authenticateAdmin);

// ============================================
// OVERVIEW & DASHBOARD
// ============================================

// Get business messaging overview
router.get('/overview', async (c) => {
  try {
    // Apple Business Messages stats
    const appleStats = await db.query(`
      SELECT
        COUNT(DISTINCT a.id) as accounts,
        COUNT(DISTINCT c.id) as conversations,
        COUNT(m.id) as total_messages,
        COUNT(m.id) FILTER (WHERE m.created_at > NOW() - INTERVAL '24 hours') as messages_24h
      FROM apple_business_accounts a
      LEFT JOIN apple_business_conversations c ON c.tenant_id = a.tenant_id
      LEFT JOIN apple_business_messages m ON m.conversation_id = c.id
    `);

    // Google Business Messages stats
    const googleStats = await db.query(`
      SELECT
        COUNT(DISTINCT a.id) as agents,
        COUNT(DISTINCT l.id) as locations,
        COUNT(DISTINCT c.id) as conversations,
        COUNT(m.id) as total_messages,
        COUNT(m.id) FILTER (WHERE m.created_at > NOW() - INTERVAL '24 hours') as messages_24h
      FROM google_business_agents a
      LEFT JOIN google_business_locations l ON l.agent_id = a.id
      LEFT JOIN google_business_conversations c ON c.tenant_id = a.tenant_id
      LEFT JOIN google_business_messages m ON m.conversation_id = c.id
    `);

    // RCS stats
    const rcsStats = await db.query(`
      SELECT
        COUNT(DISTINCT a.id) as accounts,
        COUNT(DISTINCT c.id) as conversations,
        COUNT(m.id) as total_messages,
        COUNT(m.id) FILTER (WHERE m.created_at > NOW() - INTERVAL '24 hours') as messages_24h,
        COUNT(m.id) FILTER (WHERE m.delivery_method = 'sms_fallback') as sms_fallback_count
      FROM rcs_accounts a
      LEFT JOIN rcs_conversations c ON c.tenant_id = a.tenant_id
      LEFT JOIN rcs_messages m ON m.conversation_id = c.id
    `);

    // Tenant breakdown
    const tenantBreakdown = await db.query(`
      SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        (SELECT COUNT(*) FROM apple_business_accounts WHERE tenant_id = t.id) as apple_accounts,
        (SELECT COUNT(*) FROM google_business_agents WHERE tenant_id = t.id) as google_agents,
        (SELECT COUNT(*) FROM rcs_accounts WHERE tenant_id = t.id) as rcs_accounts
      FROM tenants t
      WHERE t.status = 'active'
      ORDER BY t.name
    `);

    return c.json({
      apple: appleStats.rows[0],
      google: googleStats.rows[0],
      rcs: rcsStats.rows[0],
      tenants: tenantBreakdown.rows
    });
  } catch (error) {
    console.error('Overview error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// APPLE BUSINESS MESSAGES ADMIN
// ============================================

// List all Apple Business accounts
router.get('/apple/accounts', async (c) => {
  try {
    const { tenantId, status, limit = '50', offset = '0' } = c.req.query();

    let query = `
      SELECT a.*, t.name as tenant_name,
        (SELECT COUNT(*) FROM apple_business_conversations WHERE tenant_id = a.tenant_id) as conversation_count
      FROM apple_business_accounts a
      JOIN tenants t ON t.id = a.tenant_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND a.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    return c.json({ accounts: result.rows });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Update Apple Business account status
router.patch('/apple/accounts/:id/status', requireAdminRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    const result = await db.query(`
      UPDATE apple_business_accounts
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ account: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Apple message analytics
router.get('/apple/analytics', async (c) => {
  try {
    const { startDate, endDate, tenantId } = c.req.query();

    const dateFilter = startDate && endDate
      ? `AND m.created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const tenantFilter = tenantId
      ? `AND m.tenant_id = '${tenantId}'`
      : '';

    // Message volume by day
    const dailyVolume = await db.query(`
      SELECT
        DATE(m.created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE m.direction = 'inbound') as inbound,
        COUNT(*) FILTER (WHERE m.direction = 'outbound') as outbound
      FROM apple_business_messages m
      WHERE 1=1 ${dateFilter} ${tenantFilter}
      GROUP BY DATE(m.created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Message types distribution
    const messageTypes = await db.query(`
      SELECT
        message_type,
        COUNT(*) as count
      FROM apple_business_messages
      WHERE 1=1 ${dateFilter} ${tenantFilter}
      GROUP BY message_type
      ORDER BY count DESC
    `);

    // Delivery status breakdown
    const deliveryStatus = await db.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM apple_business_messages
      WHERE direction = 'outbound' ${dateFilter} ${tenantFilter}
      GROUP BY status
    `);

    return c.json({
      dailyVolume: dailyVolume.rows,
      messageTypes: messageTypes.rows,
      deliveryStatus: deliveryStatus.rows
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// GOOGLE BUSINESS MESSAGES ADMIN
// ============================================

// List all Google Business agents
router.get('/google/agents', async (c) => {
  try {
    const { tenantId, status, limit = '50', offset = '0' } = c.req.query();

    let query = `
      SELECT a.*, t.name as tenant_name,
        (SELECT COUNT(*) FROM google_business_locations WHERE agent_id = a.id) as location_count,
        (SELECT COUNT(*) FROM google_business_conversations WHERE agent_id = a.agent_id) as conversation_count
      FROM google_business_agents a
      JOIN tenants t ON t.id = a.tenant_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND a.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    return c.json({ agents: result.rows });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// List all Google Business locations
router.get('/google/locations', async (c) => {
  try {
    const { agentId, verified, limit = '50', offset = '0' } = c.req.query();

    let query = `
      SELECT l.*, a.display_name as agent_name, t.name as tenant_name
      FROM google_business_locations l
      JOIN google_business_agents a ON a.id = l.agent_id
      JOIN tenants t ON t.id = a.tenant_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (agentId) {
      query += ` AND l.agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    if (verified !== undefined) {
      query += ` AND l.verified = $${paramIndex++}`;
      params.push(verified === 'true');
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    return c.json({ locations: result.rows });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Update Google agent status
router.patch('/google/agents/:id/status', requireAdminRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    const result = await db.query(`
      UPDATE google_business_agents
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    return c.json({ agent: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Verify Google location
router.patch('/google/locations/:id/verify', requireAdminRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const { verified } = await c.req.json();

    const result = await db.query(`
      UPDATE google_business_locations
      SET verified = $1, verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [verified, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Location not found' }, 404);
    }

    return c.json({ location: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Google message analytics
router.get('/google/analytics', async (c) => {
  try {
    const { startDate, endDate, tenantId, agentId } = c.req.query();

    const dateFilter = startDate && endDate
      ? `AND m.created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const tenantFilter = tenantId
      ? `AND m.tenant_id = '${tenantId}'`
      : '';

    const agentFilter = agentId
      ? `AND c.agent_id = '${agentId}'`
      : '';

    // Message volume by day
    const dailyVolume = await db.query(`
      SELECT
        DATE(m.created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE m.direction = 'inbound') as inbound,
        COUNT(*) FILTER (WHERE m.direction = 'outbound') as outbound
      FROM google_business_messages m
      JOIN google_business_conversations c ON c.id = m.conversation_id
      WHERE 1=1 ${dateFilter} ${tenantFilter} ${agentFilter}
      GROUP BY DATE(m.created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Entry points
    const entryPoints = await db.query(`
      SELECT
        entry_point,
        COUNT(*) as count
      FROM google_business_conversations c
      WHERE 1=1 ${dateFilter.replace('m.', 'c.')} ${tenantFilter.replace('m.', 'c.')} ${agentFilter}
      GROUP BY entry_point
      ORDER BY count DESC
    `);

    // Suggestions clicked
    const suggestionsClicked = await db.query(`
      SELECT COUNT(*) as count
      FROM google_business_messages
      WHERE message_type = 'suggestion_response' ${dateFilter} ${tenantFilter}
    `);

    return c.json({
      dailyVolume: dailyVolume.rows,
      entryPoints: entryPoints.rows,
      suggestionsClicked: suggestionsClicked.rows[0]?.count || 0
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// RCS ADMIN
// ============================================

// List all RCS accounts
router.get('/rcs/accounts', async (c) => {
  try {
    const { tenantId, provider, status, limit = '50', offset = '0' } = c.req.query();

    let query = `
      SELECT a.*, t.name as tenant_name,
        (SELECT COUNT(*) FROM rcs_conversations WHERE tenant_id = a.tenant_id) as conversation_count
      FROM rcs_accounts a
      JOIN tenants t ON t.id = a.tenant_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      query += ` AND a.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (provider) {
      query += ` AND a.provider = $${paramIndex++}`;
      params.push(provider);
    }

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    return c.json({ accounts: result.rows });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Update RCS account status
router.patch('/rcs/accounts/:id/status', requireAdminRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    const result = await db.query(`
      UPDATE rcs_accounts
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({ account: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS capability cache stats
router.get('/rcs/capability-stats', async (c) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_cached,
        COUNT(*) FILTER (WHERE rcs_enabled = true) as rcs_enabled_count,
        COUNT(*) FILTER (WHERE rcs_enabled = false) as rcs_disabled_count,
        COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_count,
        MAX(checked_at) as last_check
      FROM rcs_capability_cache
    `);

    return c.json({ stats: stats.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Clear expired RCS capability cache
router.delete('/rcs/capability-cache/expired', requireAdminRole('admin'), async (c) => {
  try {
    const result = await db.query(`
      DELETE FROM rcs_capability_cache
      WHERE expires_at < NOW()
      RETURNING id
    `);

    return c.json({ deleted: result.rowCount });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS fallback stats
router.get('/rcs/fallback-stats', async (c) => {
  try {
    const { startDate, endDate, tenantId } = c.req.query();

    const dateFilter = startDate && endDate
      ? `AND created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const tenantFilter = tenantId
      ? `AND tenant_id = '${tenantId}'`
      : '';

    const stats = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE delivery_method = 'rcs') as rcs_delivered,
        COUNT(*) FILTER (WHERE delivery_method = 'sms_fallback') as sms_fallback,
        ROUND(
          COUNT(*) FILTER (WHERE delivery_method = 'rcs')::numeric /
          NULLIF(COUNT(*), 0) * 100, 2
        ) as rcs_success_rate
      FROM rcs_messages
      WHERE direction = 'outbound' ${dateFilter} ${tenantFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    return c.json({ stats: stats.rows });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS message analytics
router.get('/rcs/analytics', async (c) => {
  try {
    const { startDate, endDate, tenantId, provider } = c.req.query();

    const dateFilter = startDate && endDate
      ? `AND m.created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const tenantFilter = tenantId
      ? `AND m.tenant_id = '${tenantId}'`
      : '';

    const providerFilter = provider
      ? `AND a.provider = '${provider}'`
      : '';

    // Message volume by day
    const dailyVolume = await db.query(`
      SELECT
        DATE(m.created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE m.direction = 'inbound') as inbound,
        COUNT(*) FILTER (WHERE m.direction = 'outbound') as outbound,
        COUNT(*) FILTER (WHERE m.delivery_method = 'sms_fallback') as sms_fallback
      FROM rcs_messages m
      LEFT JOIN rcs_conversations c ON c.id = m.conversation_id
      LEFT JOIN rcs_accounts a ON a.tenant_id = m.tenant_id
      WHERE 1=1 ${dateFilter} ${tenantFilter} ${providerFilter}
      GROUP BY DATE(m.created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Message types distribution
    const messageTypes = await db.query(`
      SELECT
        message_type,
        COUNT(*) as count
      FROM rcs_messages m
      WHERE 1=1 ${dateFilter} ${tenantFilter}
      GROUP BY message_type
      ORDER BY count DESC
    `);

    // Provider breakdown
    const providerBreakdown = await db.query(`
      SELECT
        a.provider,
        COUNT(*) as message_count,
        COUNT(DISTINCT a.tenant_id) as tenant_count
      FROM rcs_accounts a
      JOIN rcs_messages m ON m.tenant_id = a.tenant_id
      WHERE 1=1 ${dateFilter.replace('m.', 'm.')} ${tenantFilter}
      GROUP BY a.provider
      ORDER BY message_count DESC
    `);

    return c.json({
      dailyVolume: dailyVolume.rows,
      messageTypes: messageTypes.rows,
      providerBreakdown: providerBreakdown.rows
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// CROSS-PLATFORM ANALYTICS
// ============================================

// Get unified messaging analytics
router.get('/analytics/unified', async (c) => {
  try {
    const { startDate, endDate, tenantId } = c.req.query();

    const dateFilter = startDate && endDate
      ? `AND created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const tenantFilter = tenantId
      ? `AND tenant_id = '${tenantId}'`
      : '';

    // Apple messages
    const appleMessages = await db.query(`
      SELECT 'apple' as channel, COUNT(*) as count
      FROM apple_business_messages
      WHERE 1=1 ${dateFilter} ${tenantFilter}
    `);

    // Google messages
    const googleMessages = await db.query(`
      SELECT 'google' as channel, COUNT(*) as count
      FROM google_business_messages
      WHERE 1=1 ${dateFilter} ${tenantFilter}
    `);

    // RCS messages
    const rcsMessages = await db.query(`
      SELECT 'rcs' as channel, COUNT(*) as count
      FROM rcs_messages
      WHERE 1=1 ${dateFilter} ${tenantFilter}
    `);

    // Combined daily volume
    const dailyVolume = await db.query(`
      SELECT date, SUM(apple) as apple, SUM(google) as google, SUM(rcs) as rcs
      FROM (
        SELECT DATE(created_at) as date, COUNT(*) as apple, 0 as google, 0 as rcs
        FROM apple_business_messages WHERE 1=1 ${dateFilter} ${tenantFilter}
        GROUP BY DATE(created_at)
        UNION ALL
        SELECT DATE(created_at) as date, 0 as apple, COUNT(*) as google, 0 as rcs
        FROM google_business_messages WHERE 1=1 ${dateFilter} ${tenantFilter}
        GROUP BY DATE(created_at)
        UNION ALL
        SELECT DATE(created_at) as date, 0 as apple, 0 as google, COUNT(*) as rcs
        FROM rcs_messages WHERE 1=1 ${dateFilter} ${tenantFilter}
        GROUP BY DATE(created_at)
      ) combined
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `);

    return c.json({
      channelBreakdown: [
        appleMessages.rows[0],
        googleMessages.rows[0],
        rcsMessages.rows[0]
      ],
      dailyVolume: dailyVolume.rows
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// TEMPLATE MANAGEMENT
// ============================================

// List all templates across platforms
router.get('/templates', async (c) => {
  try {
    const { platform, tenantId, status, limit = '50', offset = '0' } = c.req.query();

    const results = {
      apple: [],
      google: [],
      rcs: []
    };

    const tenantFilter = tenantId ? `AND tenant_id = '${tenantId}'` : '';
    const statusFilter = status ? `AND status = '${status}'` : '';
    const limitOffset = `LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    if (!platform || platform === 'apple') {
      const appleTemplates = await db.query(`
        SELECT *, 'apple' as platform FROM apple_business_templates
        WHERE 1=1 ${tenantFilter} ${statusFilter}
        ORDER BY created_at DESC ${limitOffset}
      `);
      results.apple = appleTemplates.rows;
    }

    if (!platform || platform === 'google') {
      const googleTemplates = await db.query(`
        SELECT *, 'google' as platform FROM google_business_templates
        WHERE 1=1 ${tenantFilter} ${statusFilter}
        ORDER BY created_at DESC ${limitOffset}
      `);
      results.google = googleTemplates.rows;
    }

    if (!platform || platform === 'rcs') {
      const rcsTemplates = await db.query(`
        SELECT *, 'rcs' as platform FROM rcs_templates
        WHERE 1=1 ${tenantFilter} ${statusFilter}
        ORDER BY created_at DESC ${limitOffset}
      `);
      results.rcs = rcsTemplates.rows;
    }

    return c.json({ templates: results });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Approve/reject template
router.patch('/templates/:platform/:id/status', requireAdminRole('admin'), async (c) => {
  try {
    const platform = c.req.param('platform');
    const id = c.req.param('id');
    const { status, rejectionReason } = await c.req.json();

    let tableName;
    switch (platform) {
      case 'apple':
        tableName = 'apple_business_templates';
        break;
      case 'google':
        tableName = 'google_business_templates';
        break;
      case 'rcs':
        tableName = 'rcs_templates';
        break;
      default:
        return c.json({ error: 'Invalid platform' }, 400);
    }

    const result = await db.query(`
      UPDATE ${tableName}
      SET status = $1, rejection_reason = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, rejectionReason || null, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Template not found' }, 404);
    }

    return c.json({ template: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// TENANT SETTINGS
// ============================================

// Get tenant business messaging settings
router.get('/settings/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');

    const result = await db.query(`
      SELECT * FROM business_messaging_tenant_settings
      WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      // Return default settings
      return c.json({
        settings: {
          tenant_id: tenantId,
          apple_enabled: false,
          google_enabled: false,
          rcs_enabled: false,
          sms_fallback_enabled: true
        }
      });
    }

    return c.json({ settings: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Update tenant business messaging settings
router.put('/settings/:tenantId', requireAdminRole('admin'), async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const data = await c.req.json();

    const result = await db.query(`
      INSERT INTO business_messaging_tenant_settings (
        tenant_id, apple_enabled, google_enabled, rcs_enabled,
        sms_fallback_enabled, default_response_timeout,
        auto_close_conversation_hours, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        apple_enabled = $2,
        google_enabled = $3,
        rcs_enabled = $4,
        sms_fallback_enabled = $5,
        default_response_timeout = $6,
        auto_close_conversation_hours = $7,
        settings = $8,
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId,
      data.apple_enabled || false,
      data.google_enabled || false,
      data.rcs_enabled || false,
      data.sms_fallback_enabled !== false,
      data.default_response_timeout || 300,
      data.auto_close_conversation_hours || 24,
      JSON.stringify(data.settings || {})
    ]);

    return c.json({ settings: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// WEBHOOK LOGS
// ============================================

// Get webhook logs
router.get('/webhooks/logs', async (c) => {
  try {
    const { platform, tenantId, eventType, limit = '100', offset = '0' } = c.req.query();

    const results = [];
    const tenantFilter = tenantId ? `AND tenant_id = '${tenantId}'` : '';
    const eventFilter = eventType ? `AND event_type = '${eventType}'` : '';
    const limitOffset = `LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    if (!platform || platform === 'apple') {
      const appleLogs = await db.query(`
        SELECT *, 'apple' as platform FROM apple_business_webhook_logs
        WHERE 1=1 ${tenantFilter} ${eventFilter}
        ORDER BY received_at DESC ${limitOffset}
      `);
      results.push(...appleLogs.rows);
    }

    if (!platform || platform === 'google') {
      const googleLogs = await db.query(`
        SELECT *, 'google' as platform FROM google_business_webhook_logs
        WHERE 1=1 ${tenantFilter} ${eventFilter}
        ORDER BY received_at DESC ${limitOffset}
      `);
      results.push(...googleLogs.rows);
    }

    if (!platform || platform === 'rcs') {
      const rcsLogs = await db.query(`
        SELECT *, 'rcs' as platform FROM rcs_webhook_logs
        WHERE 1=1 ${tenantFilter} ${eventFilter}
        ORDER BY received_at DESC ${limitOffset}
      `);
      results.push(...rcsLogs.rows);
    }

    // Sort combined results by received_at
    results.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

    return c.json({ logs: results.slice(0, parseInt(limit)) });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default router;
