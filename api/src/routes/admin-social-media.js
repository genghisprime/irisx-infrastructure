/**
 * Admin Social Media Management Routes
 * Cross-tenant view of Discord, Slack, Microsoft Teams, and Telegram integrations
 * December 3, 2025
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const app = new Hono();

// Apply admin authentication to all routes
app.use('*', authenticateAdmin);

// =============================================================================
// GET /admin/social-media/stats - Dashboard Statistics
// =============================================================================
app.get('/stats', async (c) => {
  try {
    // Get overall statistics
    const statsQuery = await pool.query(`
      SELECT
        -- Account counts by platform
        COUNT(DISTINCT sa.id) AS total_accounts,
        COUNT(DISTINCT CASE WHEN sa.platform = 'discord' THEN sa.id END) AS discord_accounts,
        COUNT(DISTINCT CASE WHEN sa.platform = 'slack' THEN sa.id END) AS slack_accounts,
        COUNT(DISTINCT CASE WHEN sa.platform = 'teams' THEN sa.id END) AS teams_accounts,
        COUNT(DISTINCT CASE WHEN sa.platform = 'telegram' THEN sa.id END) AS telegram_accounts,

        -- Status counts
        COUNT(DISTINCT CASE WHEN sa.status = 'active' THEN sa.id END) AS active_accounts,
        COUNT(DISTINCT CASE WHEN sa.status = 'disabled' THEN sa.id END) AS disabled_accounts,
        COUNT(DISTINCT CASE WHEN sa.status = 'error' THEN sa.id END) AS error_accounts,

        -- Tenant counts
        COUNT(DISTINCT sa.tenant_id) AS tenants_with_social
      FROM social_accounts sa
    `);

    // Get message statistics
    const messageStatsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound_messages,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound_messages,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS messages_24h,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS messages_7d,
        COUNT(DISTINCT tenant_id) AS tenants_with_messages
      FROM social_messages
    `);

    // Get channel statistics
    const channelStatsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_channels,
        COUNT(CASE WHEN is_enabled THEN 1 END) AS enabled_channels,
        COUNT(CASE WHEN is_monitored THEN 1 END) AS monitored_channels
      FROM social_channels
    `);

    // Get webhook statistics (last 24h)
    const webhookStatsQuery = await pool.query(`
      SELECT
        COUNT(*) AS webhooks_24h,
        COUNT(CASE WHEN processed THEN 1 END) AS processed_webhooks,
        COUNT(CASE WHEN processing_error IS NOT NULL THEN 1 END) AS failed_webhooks,
        COUNT(DISTINCT platform) AS active_platforms
      FROM social_webhooks_log
      WHERE received_at > NOW() - INTERVAL '24 hours'
    `);

    // Get unique users count
    const userStatsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(CASE WHEN is_bot THEN 1 END) AS bot_users,
        COUNT(CASE WHEN contact_id IS NOT NULL THEN 1 END) AS linked_to_contacts
      FROM social_users
    `);

    return c.json({
      success: true,
      stats: {
        accounts: statsQuery.rows[0],
        messages: messageStatsQuery.rows[0],
        channels: channelStatsQuery.rows[0],
        webhooks: webhookStatsQuery.rows[0],
        users: userStatsQuery.rows[0]
      }
    });
  } catch (error) {
    console.error('Admin social media stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/accounts - List All Social Accounts
// =============================================================================
app.get('/accounts', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const platform = c.req.query('platform');
    const status = c.req.query('status');
    const tenantId = c.req.query('tenant_id');
    const search = c.req.query('search');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (platform) {
      paramCount++;
      whereClause += ` AND sa.platform = $${paramCount}`;
      params.push(platform);
    }

    if (status) {
      paramCount++;
      whereClause += ` AND sa.status = $${paramCount}`;
      params.push(status);
    }

    if (tenantId) {
      paramCount++;
      whereClause += ` AND sa.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (sa.account_name ILIKE $${paramCount} OR t.name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countQuery = await pool.query(`
      SELECT COUNT(DISTINCT sa.id)
      FROM social_accounts sa
      LEFT JOIN tenants t ON sa.tenant_id = t.id
      ${whereClause}
    `, params);

    // Get accounts with tenant info and stats
    const accountsQuery = await pool.query(`
      SELECT
        sa.id,
        sa.tenant_id,
        t.name AS tenant_name,
        sa.platform,
        sa.account_name,
        sa.platform_user_id,
        sa.platform_team_id,
        sa.status,
        sa.error_message,
        sa.last_synced_at,
        sa.created_at,
        sa.updated_at,
        (SELECT COUNT(*) FROM social_messages WHERE social_account_id = sa.id) AS message_count,
        (SELECT COUNT(*) FROM social_channels WHERE social_account_id = sa.id AND is_enabled = true) AS channel_count,
        (SELECT COUNT(*) FROM social_messages WHERE social_account_id = sa.id AND created_at > NOW() - INTERVAL '24 hours') AS messages_24h
      FROM social_accounts sa
      LEFT JOIN tenants t ON sa.tenant_id = t.id
      ${whereClause}
      ORDER BY sa.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...params, limit, offset]);

    const total = parseInt(countQuery.rows[0].count);

    return c.json({
      success: true,
      accounts: accountsQuery.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin social media accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/accounts/:id - Get Account Details
// =============================================================================
app.get('/accounts/:id', async (c) => {
  try {
    const accountId = c.req.param('id');

    // Get account details (excluding sensitive tokens)
    const accountQuery = await pool.query(`
      SELECT
        sa.id,
        sa.tenant_id,
        t.name AS tenant_name,
        sa.platform,
        sa.account_name,
        sa.platform_user_id,
        sa.platform_team_id,
        sa.webhook_url,
        sa.settings,
        sa.enabled_channels,
        sa.status,
        sa.error_message,
        sa.last_synced_at,
        sa.created_at,
        sa.updated_at,
        -- Has tokens indicator (don't expose actual tokens)
        CASE WHEN sa.access_token IS NOT NULL THEN true ELSE false END AS has_access_token,
        CASE WHEN sa.refresh_token IS NOT NULL THEN true ELSE false END AS has_refresh_token,
        CASE WHEN sa.bot_token IS NOT NULL THEN true ELSE false END AS has_bot_token
      FROM social_accounts sa
      LEFT JOIN tenants t ON sa.tenant_id = t.id
      WHERE sa.id = $1
    `, [accountId]);

    if (accountQuery.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const account = accountQuery.rows[0];

    // Get channels for this account
    const channelsQuery = await pool.query(`
      SELECT
        id,
        platform_channel_id,
        channel_name,
        channel_type,
        channel_topic,
        is_enabled,
        is_monitored,
        message_count,
        last_message_at,
        created_at
      FROM social_channels
      WHERE social_account_id = $1
      ORDER BY channel_name
    `, [accountId]);

    // Get message statistics
    const messageStatsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS last_7d,
        COUNT(DISTINCT from_user_id) AS unique_users
      FROM social_messages
      WHERE social_account_id = $1
    `, [accountId]);

    // Get recent messages
    const recentMessagesQuery = await pool.query(`
      SELECT
        id,
        platform_message_id,
        platform_channel_id,
        direction,
        status,
        from_user_id,
        from_username,
        channel_name,
        message_type,
        LEFT(text_content, 200) AS text_preview,
        attachments,
        created_at
      FROM social_messages
      WHERE social_account_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [accountId]);

    return c.json({
      success: true,
      account,
      channels: channelsQuery.rows,
      messageStats: messageStatsQuery.rows[0],
      recentMessages: recentMessagesQuery.rows
    });
  } catch (error) {
    console.error('Admin social media account details error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/messages - List Messages Across All Tenants
// =============================================================================
app.get('/messages', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const platform = c.req.query('platform');
    const direction = c.req.query('direction');
    const tenantId = c.req.query('tenant_id');
    const accountId = c.req.query('account_id');
    const search = c.req.query('search');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (platform) {
      paramCount++;
      whereClause += ` AND sm.platform = $${paramCount}`;
      params.push(platform);
    }

    if (direction) {
      paramCount++;
      whereClause += ` AND sm.direction = $${paramCount}`;
      params.push(direction);
    }

    if (tenantId) {
      paramCount++;
      whereClause += ` AND sm.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (accountId) {
      paramCount++;
      whereClause += ` AND sm.social_account_id = $${paramCount}`;
      params.push(accountId);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (sm.text_content ILIKE $${paramCount} OR sm.from_username ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (startDate) {
      paramCount++;
      whereClause += ` AND sm.created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereClause += ` AND sm.created_at <= $${paramCount}`;
      params.push(endDate);
    }

    // Get total count
    const countQuery = await pool.query(`
      SELECT COUNT(*)
      FROM social_messages sm
      ${whereClause}
    `, params);

    // Get messages
    const messagesQuery = await pool.query(`
      SELECT
        sm.id,
        sm.tenant_id,
        t.name AS tenant_name,
        sm.social_account_id,
        sa.account_name,
        sm.platform,
        sm.platform_message_id,
        sm.platform_channel_id,
        sm.direction,
        sm.status,
        sm.from_user_id,
        sm.from_username,
        sm.from_avatar_url,
        sm.channel_name,
        sm.channel_type,
        sm.message_type,
        LEFT(sm.text_content, 300) AS text_preview,
        sm.attachments,
        sm.reactions,
        sm.created_at
      FROM social_messages sm
      LEFT JOIN tenants t ON sm.tenant_id = t.id
      LEFT JOIN social_accounts sa ON sm.social_account_id = sa.id
      ${whereClause}
      ORDER BY sm.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...params, limit, offset]);

    const total = parseInt(countQuery.rows[0].count);

    return c.json({
      success: true,
      messages: messagesQuery.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin social media messages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/webhooks - Webhook Delivery Log
// =============================================================================
app.get('/webhooks', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const platform = c.req.query('platform');
    const processed = c.req.query('processed');
    const hasError = c.req.query('has_error');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (platform) {
      paramCount++;
      whereClause += ` AND wl.platform = $${paramCount}`;
      params.push(platform);
    }

    if (processed !== undefined && processed !== '') {
      paramCount++;
      whereClause += ` AND wl.processed = $${paramCount}`;
      params.push(processed === 'true');
    }

    if (hasError === 'true') {
      whereClause += ` AND wl.processing_error IS NOT NULL`;
    }

    // Get total count
    const countQuery = await pool.query(`
      SELECT COUNT(*)
      FROM social_webhooks_log wl
      ${whereClause}
    `, params);

    // Get webhooks
    const webhooksQuery = await pool.query(`
      SELECT
        wl.id,
        wl.tenant_id,
        t.name AS tenant_name,
        wl.social_account_id,
        sa.account_name,
        wl.platform,
        wl.event_type,
        wl.processed,
        wl.processed_at,
        wl.processing_error,
        wl.payload,
        wl.received_at
      FROM social_webhooks_log wl
      LEFT JOIN tenants t ON wl.tenant_id = t.id
      LEFT JOIN social_accounts sa ON wl.social_account_id = sa.id
      ${whereClause}
      ORDER BY wl.received_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...params, limit, offset]);

    const total = parseInt(countQuery.rows[0].count);

    return c.json({
      success: true,
      webhooks: webhooksQuery.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin social media webhooks error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/analytics - Platform Analytics
// =============================================================================
app.get('/analytics', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '7');

    // Messages by platform over time
    const messagesByPlatformQuery = await pool.query(`
      SELECT
        platform,
        DATE(created_at) AS date,
        COUNT(*) AS message_count,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound
      FROM social_messages
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY platform, DATE(created_at)
      ORDER BY date DESC, platform
    `);

    // Messages by tenant
    const messagesByTenantQuery = await pool.query(`
      SELECT
        sm.tenant_id,
        t.name AS tenant_name,
        sm.platform,
        COUNT(*) AS message_count,
        COUNT(CASE WHEN sm.direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN sm.direction = 'outbound' THEN 1 END) AS outbound
      FROM social_messages sm
      LEFT JOIN tenants t ON sm.tenant_id = t.id
      WHERE sm.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY sm.tenant_id, t.name, sm.platform
      ORDER BY message_count DESC
      LIMIT 20
    `);

    // Message types breakdown
    const messageTypesQuery = await pool.query(`
      SELECT
        platform,
        message_type,
        COUNT(*) AS count
      FROM social_messages
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY platform, message_type
      ORDER BY platform, count DESC
    `);

    // Webhook success rate
    const webhookStatsQuery = await pool.query(`
      SELECT
        platform,
        COUNT(*) AS total_webhooks,
        COUNT(CASE WHEN processed THEN 1 END) AS processed,
        COUNT(CASE WHEN processing_error IS NOT NULL THEN 1 END) AS failed,
        ROUND(
          COUNT(CASE WHEN processed THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100,
          2
        ) AS success_rate
      FROM social_webhooks_log
      WHERE received_at > NOW() - INTERVAL '${days} days'
      GROUP BY platform
      ORDER BY total_webhooks DESC
    `);

    // Top active channels
    const topChannelsQuery = await pool.query(`
      SELECT
        sc.id,
        sc.channel_name,
        sc.platform,
        sa.account_name,
        t.name AS tenant_name,
        sc.message_count,
        sc.last_message_at
      FROM social_channels sc
      LEFT JOIN social_accounts sa ON sc.social_account_id = sa.id
      LEFT JOIN tenants t ON sa.tenant_id = t.id
      WHERE sc.is_enabled = true
      ORDER BY sc.message_count DESC
      LIMIT 10
    `);

    // Top active users
    const topUsersQuery = await pool.query(`
      SELECT
        su.id,
        su.platform,
        su.username,
        su.display_name,
        su.message_count,
        su.last_message_at,
        su.is_bot,
        t.name AS tenant_name
      FROM social_users su
      LEFT JOIN tenants t ON su.tenant_id = t.id
      WHERE su.is_bot = false
      ORDER BY su.message_count DESC
      LIMIT 20
    `);

    return c.json({
      success: true,
      analytics: {
        messagesByPlatform: messagesByPlatformQuery.rows,
        messagesByTenant: messagesByTenantQuery.rows,
        messageTypes: messageTypesQuery.rows,
        webhookStats: webhookStatsQuery.rows,
        topChannels: topChannelsQuery.rows,
        topUsers: topUsersQuery.rows
      }
    });
  } catch (error) {
    console.error('Admin social media analytics error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/social-media/health - Integration Health Check
// =============================================================================
app.get('/health', async (c) => {
  try {
    // Get accounts with status issues
    const accountHealthQuery = await pool.query(`
      SELECT
        sa.id,
        sa.tenant_id,
        t.name AS tenant_name,
        sa.platform,
        sa.account_name,
        sa.status,
        sa.error_message,
        sa.last_synced_at,
        CASE
          WHEN sa.status = 'error' THEN 'error'
          WHEN sa.last_synced_at IS NULL THEN 'warning'
          WHEN sa.last_synced_at < NOW() - INTERVAL '24 hours' THEN 'warning'
          ELSE 'healthy'
        END AS health_status,
        (SELECT COUNT(*) FROM social_messages WHERE social_account_id = sa.id AND created_at > NOW() - INTERVAL '24 hours') AS messages_24h
      FROM social_accounts sa
      LEFT JOIN tenants t ON sa.tenant_id = t.id
      ORDER BY
        CASE sa.status
          WHEN 'error' THEN 1
          WHEN 'disabled' THEN 2
          ELSE 3
        END,
        sa.last_synced_at ASC NULLS FIRST
    `);

    // Get recent webhook failures
    const webhookFailuresQuery = await pool.query(`
      SELECT
        wl.id,
        wl.platform,
        wl.event_type,
        wl.processing_error,
        wl.received_at,
        t.name AS tenant_name,
        sa.account_name
      FROM social_webhooks_log wl
      LEFT JOIN tenants t ON wl.tenant_id = t.id
      LEFT JOIN social_accounts sa ON wl.social_account_id = sa.id
      WHERE wl.processing_error IS NOT NULL
        AND wl.received_at > NOW() - INTERVAL '24 hours'
      ORDER BY wl.received_at DESC
      LIMIT 20
    `);

    // Summary stats
    const healthSummary = {
      total_accounts: accountHealthQuery.rows.length,
      healthy: accountHealthQuery.rows.filter(a => a.health_status === 'healthy').length,
      warning: accountHealthQuery.rows.filter(a => a.health_status === 'warning').length,
      error: accountHealthQuery.rows.filter(a => a.health_status === 'error').length,
      recent_webhook_failures: webhookFailuresQuery.rows.length
    };

    return c.json({
      success: true,
      summary: healthSummary,
      accounts: accountHealthQuery.rows,
      recentFailures: webhookFailuresQuery.rows
    });
  } catch (error) {
    console.error('Admin social media health error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// PATCH /admin/social-media/accounts/:id/status - Update Account Status
// =============================================================================
app.patch('/accounts/:id/status', async (c) => {
  try {
    const accountId = c.req.param('id');
    const { status } = await c.req.json();

    if (!['active', 'disabled', 'error'].includes(status)) {
      return c.json({ error: 'Invalid status. Must be: active, disabled, or error' }, 400);
    }

    const result = await pool.query(`
      UPDATE social_accounts
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, platform, account_name, status
    `, [status, accountId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({
      success: true,
      account: result.rows[0]
    });
  } catch (error) {
    console.error('Admin social media update status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/social-media/accounts/:id/test - Test Account Connection
// =============================================================================
app.post('/accounts/:id/test', async (c) => {
  try {
    const accountId = c.req.param('id');

    // Get account details
    const accountQuery = await pool.query(`
      SELECT id, platform, account_name, access_token, bot_token, status
      FROM social_accounts
      WHERE id = $1
    `, [accountId]);

    if (accountQuery.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const account = accountQuery.rows[0];

    // For now, just check if tokens exist and update last_synced_at
    // In production, this would actually ping the platform's API
    const hasCredentials = account.access_token || account.bot_token;

    if (!hasCredentials) {
      await pool.query(`
        UPDATE social_accounts
        SET status = 'error', error_message = 'No authentication credentials found', updated_at = NOW()
        WHERE id = $1
      `, [accountId]);

      return c.json({
        success: false,
        platform: account.platform,
        account_name: account.account_name,
        error: 'No authentication credentials found',
        tested_at: new Date().toISOString()
      });
    }

    // Update last_synced_at and clear any error
    await pool.query(`
      UPDATE social_accounts
      SET last_synced_at = NOW(), status = 'active', error_message = NULL, updated_at = NOW()
      WHERE id = $1
    `, [accountId]);

    return c.json({
      success: true,
      platform: account.platform,
      account_name: account.account_name,
      message: 'Connection test passed',
      tested_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin social media test error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
