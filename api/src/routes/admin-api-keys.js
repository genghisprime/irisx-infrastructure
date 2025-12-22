/**
 * Admin API Keys Management Routes
 * Cross-tenant visibility and management of API keys
 * Created: December 8, 2025 - Critical Security Gap Closure
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';

const adminApiKeys = new Hono();

// =============================================================================
// GET /admin/api-keys/stats - Dashboard statistics
// =============================================================================
adminApiKeys.get('/stats', async (c) => {
  try {
    // Overall stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_keys,
        COUNT(*) FILTER (WHERE status = 'active') as active_keys,
        COUNT(*) FILTER (WHERE status = 'revoked') as revoked_keys,
        COUNT(DISTINCT tenant_id) as tenants_with_keys,
        COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '24 hours') as keys_used_24h,
        COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '7 days') as keys_used_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as keys_created_24h,
        COUNT(*) FILTER (WHERE revoked_at > NOW() - INTERVAL '24 hours') as keys_revoked_24h
      FROM api_keys
    `);

    // Keys by tenant (top 10)
    const keysByTenant = await pool.query(`
      SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        COUNT(*) as total_keys,
        COUNT(*) FILTER (WHERE ak.status = 'active') as active_keys,
        MAX(ak.last_used_at) as last_used_at
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      GROUP BY t.id, t.name
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);

    // Recently created keys
    const recentKeys = await pool.query(`
      SELECT
        ak.id,
        ak.name,
        ak.key_prefix,
        ak.status,
        ak.created_at,
        ak.last_used_at,
        t.name as tenant_name
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      ORDER BY ak.created_at DESC
      LIMIT 5
    `);

    return c.json({
      success: true,
      stats: stats.rows[0],
      keysByTenant: keysByTenant.rows,
      recentKeys: recentKeys.rows
    });
  } catch (error) {
    console.error('Failed to get API keys stats:', error);
    return c.json({ error: 'Failed to get stats', details: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/api-keys - List all API keys across tenants
// =============================================================================
adminApiKeys.get('/', async (c) => {
  try {
    const { tenant_id, status, search, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`ak.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`ak.status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      whereConditions.push(`(ak.name ILIKE $${paramIndex} OR ak.key_prefix ILIKE $${paramIndex} OR t.name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      ${whereClause}
    `, params);

    // Get keys with pagination
    const keysResult = await pool.query(`
      SELECT
        ak.id,
        ak.tenant_id,
        t.name as tenant_name,
        ak.name,
        ak.key_prefix,
        ak.key_hint,
        ak.status,
        ak.created_at,
        ak.last_used_at,
        ak.revoked_at
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      ${whereClause}
      ORDER BY ak.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    return c.json({
      success: true,
      keys: keysResult.rows.map(row => ({
        ...row,
        key_masked: row.key_prefix + '••••••••' + (row.key_hint || '••••')
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Failed to list API keys:', error);
    return c.json({ error: 'Failed to list keys', details: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/api-keys/:id - Get API key details
// =============================================================================
adminApiKeys.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();

    const keyResult = await pool.query(`
      SELECT
        ak.*,
        t.name as tenant_name,
        t.status as tenant_status
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      WHERE ak.id = $1
    `, [id]);

    if (keyResult.rows.length === 0) {
      return c.json({ error: 'API key not found' }, 404);
    }

    const key = keyResult.rows[0];

    // Get usage history (mock - would need api_key_usage table for real tracking)
    // For now, we'll return what we have
    const usageStats = {
      total_requests: 0, // Would need request logging
      last_24h: 0,
      last_7d: 0,
      last_30d: 0
    };

    return c.json({
      success: true,
      key: {
        ...key,
        key_masked: key.key_prefix + '••••••••' + (key.key_hint || '••••'),
        key_hash: undefined // Don't expose hash
      },
      usage: usageStats
    });
  } catch (error) {
    console.error('Failed to get API key details:', error);
    return c.json({ error: 'Failed to get key details', details: error.message }, 500);
  }
});

// =============================================================================
// DELETE /admin/api-keys/:id - Admin revoke API key (CRITICAL SECURITY FEATURE)
// =============================================================================
adminApiKeys.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const { reason } = await c.req.json().catch(() => ({}));

    // Get key info before revoking for audit
    const keyInfo = await pool.query(`
      SELECT ak.*, t.name as tenant_name
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      WHERE ak.id = $1
    `, [id]);

    if (keyInfo.rows.length === 0) {
      return c.json({ error: 'API key not found' }, 404);
    }

    const key = keyInfo.rows[0];

    if (key.status === 'revoked') {
      return c.json({ error: 'API key already revoked' }, 400);
    }

    // Revoke the key
    await pool.query(`
      UPDATE api_keys
      SET
        status = 'revoked',
        revoked_at = NOW()
      WHERE id = $1
    `, [id]);

    // Log to audit trail
    try {
      await pool.query(`
        INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details, created_at)
        VALUES ($1, 'api_key_revoked', 'api_key', $2, $3, NOW())
      `, [admin?.id || 1, id, JSON.stringify({
        key_name: key.name,
        tenant_id: key.tenant_id,
        tenant_name: key.tenant_name,
        reason: reason || 'Admin revocation'
      })]);
    } catch (auditError) {
      console.error('Failed to log audit entry:', auditError);
      // Don't fail the revocation if audit logging fails
    }

    return c.json({
      success: true,
      message: 'API key revoked successfully',
      revoked: {
        id: key.id,
        name: key.name,
        tenant_name: key.tenant_name,
        revoked_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    return c.json({ error: 'Failed to revoke key', details: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/api-keys/usage/summary - API usage analytics
// =============================================================================
adminApiKeys.get('/usage/summary', async (c) => {
  try {
    const { period = '7d' } = c.req.query();

    let interval;
    switch (period) {
      case '24h': interval = '24 hours'; break;
      case '7d': interval = '7 days'; break;
      case '30d': interval = '30 days'; break;
      default: interval = '7 days';
    }

    // Keys by activity
    const activityStats = await pool.query(`
      SELECT
        CASE
          WHEN last_used_at > NOW() - INTERVAL '24 hours' THEN 'active_24h'
          WHEN last_used_at > NOW() - INTERVAL '7 days' THEN 'active_7d'
          WHEN last_used_at > NOW() - INTERVAL '30 days' THEN 'active_30d'
          WHEN last_used_at IS NOT NULL THEN 'inactive'
          ELSE 'never_used'
        END as activity_status,
        COUNT(*) as count
      FROM api_keys
      WHERE status = 'active'
      GROUP BY 1
    `);

    // Tenants with most active keys
    const topTenants = await pool.query(`
      SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        COUNT(*) FILTER (WHERE ak.status = 'active') as active_keys,
        COUNT(*) FILTER (WHERE ak.last_used_at > NOW() - INTERVAL '${interval}') as recently_used
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      GROUP BY t.id, t.name
      HAVING COUNT(*) FILTER (WHERE ak.status = 'active') > 0
      ORDER BY COUNT(*) FILTER (WHERE ak.last_used_at > NOW() - INTERVAL '${interval}') DESC
      LIMIT 10
    `);

    // Stale keys (active but not used in 30 days)
    const staleKeys = await pool.query(`
      SELECT
        ak.id,
        ak.name,
        ak.key_prefix,
        ak.created_at,
        ak.last_used_at,
        t.name as tenant_name
      FROM api_keys ak
      JOIN tenants t ON ak.tenant_id = t.id
      WHERE ak.status = 'active'
        AND (ak.last_used_at IS NULL OR ak.last_used_at < NOW() - INTERVAL '30 days')
      ORDER BY COALESCE(ak.last_used_at, ak.created_at) ASC
      LIMIT 20
    `);

    return c.json({
      success: true,
      period,
      activityStats: activityStats.rows,
      topTenants: topTenants.rows,
      staleKeys: staleKeys.rows
    });
  } catch (error) {
    console.error('Failed to get API key usage summary:', error);
    return c.json({ error: 'Failed to get usage summary', details: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/api-keys/bulk-revoke - Bulk revoke multiple keys
// =============================================================================
adminApiKeys.post('/bulk-revoke', async (c) => {
  try {
    const { key_ids, reason } = await c.req.json();
    const admin = c.get('admin');

    if (!key_ids || !Array.isArray(key_ids) || key_ids.length === 0) {
      return c.json({ error: 'key_ids array is required' }, 400);
    }

    if (key_ids.length > 100) {
      return c.json({ error: 'Maximum 100 keys can be revoked at once' }, 400);
    }

    // Revoke all keys
    const result = await pool.query(`
      UPDATE api_keys
      SET status = 'revoked', revoked_at = NOW()
      WHERE id = ANY($1) AND status = 'active'
      RETURNING id, name, tenant_id
    `, [key_ids]);

    // Log to audit trail
    try {
      await pool.query(`
        INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details, created_at)
        VALUES ($1, 'api_keys_bulk_revoked', 'api_key', $2, $3, NOW())
      `, [admin?.id || 1, null, JSON.stringify({
        key_ids: key_ids,
        revoked_count: result.rows.length,
        reason: reason || 'Bulk admin revocation'
      })]);
    } catch (auditError) {
      console.error('Failed to log bulk revoke audit:', auditError);
    }

    return c.json({
      success: true,
      message: `${result.rows.length} API keys revoked`,
      revoked: result.rows
    });
  } catch (error) {
    console.error('Failed to bulk revoke API keys:', error);
    return c.json({ error: 'Failed to bulk revoke', details: error.message }, 500);
  }
});

export default adminApiKeys;
