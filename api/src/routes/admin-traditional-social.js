/**
 * Admin Traditional Social Media Routes
 * Admin management of Facebook, Twitter, Instagram, LinkedIn platform settings
 * Admins configure OAuth app credentials here; customers connect accounts in Customer Portal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';
import crypto from 'crypto';

const app = new Hono();

// Apply admin authentication
app.use('*', authenticateAdmin);

// =============================================================================
// Encryption Helpers (for storing secrets)
// =============================================================================

const ENCRYPTION_KEY = process.env.SOCIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-this-in-production-32-chars!';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const cipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let decrypted = cipher.update(parts[1], 'hex', 'utf8');
    decrypted += cipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

// =============================================================================
// Validation Schemas
// =============================================================================

const platformConfigSchema = z.object({
  app_id: z.string().min(1),
  app_secret: z.string().min(1),
  webhook_verify_token: z.string().optional(),
  oauth_scopes: z.array(z.string()).optional(),
  is_enabled: z.boolean().optional(),
  settings: z.object({}).passthrough().optional(),
});

// =============================================================================
// Platform Configuration Routes
// =============================================================================

/**
 * GET /admin/traditional-social/platforms
 * Get all platform configurations
 */
app.get('/platforms', async (c) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        platform,
        app_id,
        -- Don't expose app_secret, just indicate if it's set
        CASE WHEN app_secret IS NOT NULL THEN true ELSE false END AS has_app_secret,
        webhook_url,
        webhook_verify_token,
        oauth_scopes,
        is_enabled,
        settings,
        created_at,
        updated_at
      FROM social_platform_apps
      ORDER BY platform
    `);

    return c.json({
      success: true,
      platforms: rows,
    });
  } catch (error) {
    console.error('Get platforms error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /admin/traditional-social/platforms/:platform
 * Get specific platform configuration
 */
app.get('/platforms/:platform', async (c) => {
  try {
    const platform = c.req.param('platform');

    const { rows } = await pool.query(`
      SELECT
        id,
        platform,
        app_id,
        CASE WHEN app_secret IS NOT NULL THEN true ELSE false END AS has_app_secret,
        webhook_url,
        webhook_verify_token,
        oauth_scopes,
        is_enabled,
        settings,
        created_at,
        updated_at
      FROM social_platform_apps
      WHERE platform = $1
    `, [platform]);

    if (rows.length === 0) {
      return c.json({ error: 'Platform not found' }, 404);
    }

    return c.json({
      success: true,
      platform: rows[0],
    });
  } catch (error) {
    console.error('Get platform error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /admin/traditional-social/platforms/:platform
 * Update platform configuration (OAuth app credentials)
 */
app.put('/platforms/:platform', async (c) => {
  try {
    const platform = c.req.param('platform');
    const body = await c.req.json();

    const validation = platformConfigSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const { app_id, app_secret, webhook_verify_token, oauth_scopes, is_enabled, settings } = validation.data;

    // Encrypt app_secret before storing
    const encryptedSecret = encrypt(app_secret);

    const result = await pool.query(`
      UPDATE social_platform_apps
      SET
        app_id = $1,
        app_secret = $2,
        webhook_verify_token = COALESCE($3, webhook_verify_token),
        oauth_scopes = COALESCE($4, oauth_scopes),
        is_enabled = COALESCE($5, is_enabled),
        settings = COALESCE($6, settings),
        updated_at = NOW()
      WHERE platform = $7
      RETURNING id, platform, app_id, is_enabled, updated_at
    `, [app_id, encryptedSecret, webhook_verify_token, oauth_scopes, is_enabled, settings, platform]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Platform not found' }, 404);
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, details, created_at)
       VALUES ($1, 'update_social_platform', 'social_platform', $2, $3, NOW())`,
      [c.get('admin_id'), platform, JSON.stringify({ app_id, is_enabled })]
    );

    return c.json({
      success: true,
      platform: result.rows[0],
      message: `${platform} configuration updated successfully`,
    });
  } catch (error) {
    console.error('Update platform error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PATCH /admin/traditional-social/platforms/:platform/toggle
 * Enable/disable a platform
 */
app.patch('/platforms/:platform/toggle', async (c) => {
  try {
    const platform = c.req.param('platform');
    const { is_enabled } = await c.req.json();

    const result = await pool.query(`
      UPDATE social_platform_apps
      SET is_enabled = $1, updated_at = NOW()
      WHERE platform = $2
      RETURNING id, platform, is_enabled
    `, [is_enabled, platform]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Platform not found' }, 404);
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, 'social_platform', $3, $4, NOW())`,
      [c.get('admin_id'), is_enabled ? 'enable_social_platform' : 'disable_social_platform', platform, JSON.stringify({ is_enabled })]
    );

    return c.json({
      success: true,
      platform: result.rows[0],
      message: `${platform} ${is_enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    console.error('Toggle platform error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Cross-Tenant Statistics
// =============================================================================

/**
 * GET /admin/traditional-social/stats
 * Get statistics across all tenants for traditional social
 */
app.get('/stats', async (c) => {
  try {
    // Account counts by platform
    const accountStats = await pool.query(`
      SELECT
        'facebook' AS platform,
        COUNT(*) AS total_accounts,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_accounts
      FROM facebook_pages

      UNION ALL

      SELECT
        'twitter' AS platform,
        COUNT(*) AS total_accounts,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_accounts
      FROM twitter_accounts

      UNION ALL

      SELECT
        'instagram' AS platform,
        COUNT(*) AS total_accounts,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_accounts
      FROM instagram_accounts

      UNION ALL

      SELECT
        'linkedin' AS platform,
        COUNT(*) AS total_accounts,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_accounts
      FROM linkedin_pages
    `);

    // Message counts
    const messageStats = await pool.query(`
      SELECT
        platform,
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS last_7d
      FROM social_messages
      WHERE platform IN ('facebook', 'twitter', 'instagram', 'linkedin')
      GROUP BY platform
    `);

    // Webhook stats
    const webhookStats = await pool.query(`
      SELECT
        platform,
        COUNT(*) AS total_webhooks,
        COUNT(CASE WHEN processed THEN 1 END) AS processed,
        COUNT(CASE WHEN processing_error IS NOT NULL THEN 1 END) AS failed,
        COUNT(CASE WHEN received_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h
      FROM social_webhooks_log
      WHERE platform IN ('facebook', 'twitter', 'instagram', 'linkedin')
      GROUP BY platform
    `);

    // Tenants with accounts
    const tenantStats = await pool.query(`
      SELECT
        COUNT(DISTINCT tenant_id) AS tenants_with_facebook
      FROM facebook_pages

      UNION ALL

      SELECT COUNT(DISTINCT tenant_id) FROM twitter_accounts

      UNION ALL

      SELECT COUNT(DISTINCT tenant_id) FROM instagram_accounts

      UNION ALL

      SELECT COUNT(DISTINCT tenant_id) FROM linkedin_pages
    `);

    return c.json({
      success: true,
      stats: {
        accounts: accountStats.rows,
        messages: messageStats.rows,
        webhooks: webhookStats.rows,
        tenants: {
          facebook: parseInt(tenantStats.rows[0]?.tenants_with_facebook || 0),
          twitter: parseInt(tenantStats.rows[1]?.tenants_with_facebook || 0),
          instagram: parseInt(tenantStats.rows[2]?.tenants_with_facebook || 0),
          linkedin: parseInt(tenantStats.rows[3]?.tenants_with_facebook || 0),
        },
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /admin/traditional-social/accounts
 * List all connected accounts across tenants
 */
app.get('/accounts', async (c) => {
  try {
    const platform = c.req.query('platform');
    const tenantId = c.req.query('tenant_id');
    const status = c.req.query('status');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    // Build unified query for all platforms
    let queries = [];
    const params = [];
    let paramCount = 0;

    const buildWhereClause = (tableAlias) => {
      let where = 'WHERE 1=1';
      if (tenantId) {
        paramCount++;
        where += ` AND ${tableAlias}.tenant_id = $${paramCount}`;
        params.push(tenantId);
      }
      if (status) {
        paramCount++;
        where += ` AND ${tableAlias}.status = $${paramCount}`;
        params.push(status);
      }
      return where;
    };

    if (!platform || platform === 'facebook') {
      queries.push(`
        SELECT
          fp.id,
          fp.tenant_id,
          t.name AS tenant_name,
          'facebook' AS platform,
          fp.page_name AS account_name,
          fp.page_id AS platform_id,
          fp.profile_picture_url,
          fp.status,
          fp.created_at,
          fp.updated_at
        FROM facebook_pages fp
        LEFT JOIN tenants t ON fp.tenant_id = t.id
        ${buildWhereClause('fp')}
      `);
    }

    if (!platform || platform === 'twitter') {
      queries.push(`
        SELECT
          ta.id,
          ta.tenant_id,
          t.name AS tenant_name,
          'twitter' AS platform,
          ta.username AS account_name,
          ta.user_id AS platform_id,
          ta.profile_image_url AS profile_picture_url,
          ta.status,
          ta.created_at,
          ta.updated_at
        FROM twitter_accounts ta
        LEFT JOIN tenants t ON ta.tenant_id = t.id
        ${buildWhereClause('ta')}
      `);
    }

    if (!platform || platform === 'instagram') {
      queries.push(`
        SELECT
          ia.id,
          ia.tenant_id,
          t.name AS tenant_name,
          'instagram' AS platform,
          ia.username AS account_name,
          ia.ig_user_id AS platform_id,
          ia.profile_picture_url,
          ia.status,
          ia.created_at,
          ia.updated_at
        FROM instagram_accounts ia
        LEFT JOIN tenants t ON ia.tenant_id = t.id
        ${buildWhereClause('ia')}
      `);
    }

    if (!platform || platform === 'linkedin') {
      queries.push(`
        SELECT
          lp.id,
          lp.tenant_id,
          t.name AS tenant_name,
          'linkedin' AS platform,
          lp.organization_name AS account_name,
          lp.organization_id AS platform_id,
          lp.logo_url AS profile_picture_url,
          lp.status,
          lp.created_at,
          lp.updated_at
        FROM linkedin_pages lp
        LEFT JOIN tenants t ON lp.tenant_id = t.id
        ${buildWhereClause('lp')}
      `);
    }

    const combinedQuery = `
      SELECT * FROM (${queries.join(' UNION ALL ')}) AS combined
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(combinedQuery, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM (${queries.join(' UNION ALL ')}) AS combined
    `;
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await pool.query(countQuery.replace(/LIMIT.*$/, ''), countParams);
    const total = parseInt(countResult.rows[0]?.count || 0);

    return c.json({
      success: true,
      accounts: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /admin/traditional-social/accounts/:platform/:id
 * Get specific account details
 */
app.get('/accounts/:platform/:id', async (c) => {
  try {
    const platform = c.req.param('platform');
    const id = c.req.param('id');

    let query;
    switch (platform) {
      case 'facebook':
        query = `
          SELECT fp.*, t.name AS tenant_name
          FROM facebook_pages fp
          LEFT JOIN tenants t ON fp.tenant_id = t.id
          WHERE fp.id = $1
        `;
        break;
      case 'twitter':
        query = `
          SELECT ta.*, t.name AS tenant_name
          FROM twitter_accounts ta
          LEFT JOIN tenants t ON ta.tenant_id = t.id
          WHERE ta.id = $1
        `;
        break;
      case 'instagram':
        query = `
          SELECT ia.*, t.name AS tenant_name
          FROM instagram_accounts ia
          LEFT JOIN tenants t ON ia.tenant_id = t.id
          WHERE ia.id = $1
        `;
        break;
      case 'linkedin':
        query = `
          SELECT lp.*, t.name AS tenant_name
          FROM linkedin_pages lp
          LEFT JOIN tenants t ON lp.tenant_id = t.id
          WHERE lp.id = $1
        `;
        break;
      default:
        return c.json({ error: 'Invalid platform' }, 400);
    }

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Remove sensitive token data
    const account = rows[0];
    delete account.access_token_encrypted;
    delete account.refresh_token_encrypted;
    delete account.page_access_token_encrypted;

    return c.json({
      success: true,
      account,
    });
  } catch (error) {
    console.error('Get account error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PATCH /admin/traditional-social/accounts/:platform/:id/status
 * Update account status
 */
app.patch('/accounts/:platform/:id/status', async (c) => {
  try {
    const platform = c.req.param('platform');
    const id = c.req.param('id');
    const { status } = await c.req.json();

    if (!['active', 'disabled', 'error'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    let table;
    switch (platform) {
      case 'facebook':
        table = 'facebook_pages';
        break;
      case 'twitter':
        table = 'twitter_accounts';
        break;
      case 'instagram':
        table = 'instagram_accounts';
        break;
      case 'linkedin':
        table = 'linkedin_pages';
        break;
      default:
        return c.json({ error: 'Invalid platform' }, 400);
    }

    const result = await pool.query(`
      UPDATE ${table}
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status
    `, [status, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({
      success: true,
      account: result.rows[0],
    });
  } catch (error) {
    console.error('Update account status error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /admin/traditional-social/webhooks
 * Get recent webhook logs for traditional social
 */
app.get('/webhooks', async (c) => {
  try {
    const platform = c.req.query('platform');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    let whereClause = `WHERE platform IN ('facebook', 'twitter', 'instagram', 'linkedin')`;
    const params = [];

    if (platform) {
      params.push(platform);
      whereClause += ` AND platform = $${params.length}`;
    }

    const { rows } = await pool.query(`
      SELECT
        id,
        platform,
        event_type,
        tenant_id,
        social_account_id,
        processed,
        processed_at,
        processing_error,
        received_at
      FROM social_webhooks_log
      ${whereClause}
      ORDER BY received_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM social_webhooks_log ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].count);

    return c.json({
      success: true,
      webhooks: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get webhooks error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /admin/traditional-social/health
 * Health check for traditional social integrations
 */
app.get('/health', async (c) => {
  try {
    // Get platform status
    const { rows: platforms } = await pool.query(`
      SELECT platform, is_enabled, app_id IS NOT NULL AS has_app_id, app_secret IS NOT NULL AS has_app_secret
      FROM social_platform_apps
      WHERE platform IN ('facebook', 'twitter', 'instagram', 'linkedin')
    `);

    // Get recent webhook success rate
    const { rows: webhookHealth } = await pool.query(`
      SELECT
        platform,
        COUNT(*) AS total,
        COUNT(CASE WHEN processed THEN 1 END) AS success,
        COUNT(CASE WHEN processing_error IS NOT NULL THEN 1 END) AS failed
      FROM social_webhooks_log
      WHERE platform IN ('facebook', 'twitter', 'instagram', 'linkedin')
        AND received_at > NOW() - INTERVAL '24 hours'
      GROUP BY platform
    `);

    // Check for accounts with errors
    const { rows: errorAccounts } = await pool.query(`
      SELECT 'facebook' AS platform, COUNT(*) AS error_count FROM facebook_pages WHERE status = 'error'
      UNION ALL
      SELECT 'twitter', COUNT(*) FROM twitter_accounts WHERE status = 'error'
      UNION ALL
      SELECT 'instagram', COUNT(*) FROM instagram_accounts WHERE status = 'error'
      UNION ALL
      SELECT 'linkedin', COUNT(*) FROM linkedin_pages WHERE status = 'error'
    `);

    return c.json({
      success: true,
      health: {
        platforms: platforms.map(p => ({
          ...p,
          configured: p.has_app_id && p.has_app_secret,
        })),
        webhooks: webhookHealth,
        errors: errorAccounts,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
