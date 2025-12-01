/**
 * Admin Feature Flags Management Routes
 * IRISX staff manage system-wide and per-tenant feature flags
 * Supports gradual rollouts, percentage-based enabling, and tenant targeting
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminFeatureFlags = new Hono();

// All routes require admin authentication
adminFeatureFlags.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createFlagSchema = z.object({
  key: z.string().min(3).max(100).regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, and underscores only'),
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  enabled: z.boolean().optional().default(false),
  rollout_percentage: z.number().int().min(0).max(100).optional().default(0),
  rollout_tenants: z.array(z.number().int().positive()).optional().default([])
});

const updateFlagSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rollout_percentage: z.number().int().min(0).max(100).optional(),
  rollout_tenants: z.array(z.number().int().positive()).optional()
});

const setTenantOverrideSchema = z.object({
  tenant_id: z.number().int().positive(),
  enabled: z.boolean()
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAdminAction(adminId, action, resourceType, resourceId, changes, req) {
  await pool.query(
    `INSERT INTO admin_audit_log (
      admin_user_id, action, resource_type, resource_id, changes, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId,
      action,
      resourceType,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown'
    ]
  );
}

/**
 * Check if feature is enabled for a specific tenant
 * Priority: Tenant override > Rollout list > Percentage rollout > Global enabled
 */
async function isFeatureEnabledForTenant(featureKey, tenantId) {
  // Get feature flag
  const flagResult = await pool.query(
    'SELECT * FROM feature_flags WHERE key = $1',
    [featureKey]
  );

  if (flagResult.rows.length === 0) {
    return false;
  }

  const flag = flagResult.rows[0];

  // Check for tenant-specific override
  const overrideResult = await pool.query(
    'SELECT enabled FROM tenant_feature_overrides WHERE tenant_id = $1 AND feature_key = $2',
    [tenantId, featureKey]
  );

  if (overrideResult.rows.length > 0) {
    return overrideResult.rows[0].enabled;
  }

  // If globally disabled, return false
  if (!flag.enabled) {
    return false;
  }

  // Check if tenant is in rollout list
  const rolloutTenants = flag.rollout_tenants || [];
  if (rolloutTenants.length > 0 && rolloutTenants.includes(tenantId)) {
    return true;
  }

  // Check percentage-based rollout (deterministic hash)
  if (flag.rollout_percentage < 100) {
    const hash = hashTenantId(tenantId);
    return (hash % 100) < flag.rollout_percentage;
  }

  return true;
}

function hashTenantId(tenantId) {
  const str = String(tenantId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/feature-flags
 * List all feature flags
 */
adminFeatureFlags.get('/', async (c) => {
  try {
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        ff.id,
        ff.key,
        ff.name,
        ff.description,
        ff.enabled,
        ff.rollout_percentage,
        ff.rollout_tenants,
        ff.created_at,
        ff.updated_at,
        COUNT(tfo.id) as override_count
       FROM feature_flags ff
       LEFT JOIN tenant_feature_overrides tfo ON ff.key = tfo.feature_key
       GROUP BY ff.id
       ORDER BY ff.created_at DESC`
    );

    await logAdminAction(admin.id, 'admin.feature_flags.list', null, null, null, c.req);

    return c.json({
      flags: result.rows,
      total: result.rows.length
    });

  } catch (err) {
    console.error('List feature flags error:', err);
    return c.json({ error: 'Failed to list feature flags' }, 500);
  }
});

/**
 * GET /admin/feature-flags/:key
 * Get feature flag details including enabled tenants
 */
adminFeatureFlags.get('/:key', async (c) => {
  try {
    const { key } = c.req.param();
    const admin = c.get('admin');

    // Get flag details
    const flagResult = await pool.query(
      `SELECT * FROM feature_flags WHERE key = $1`,
      [key]
    );

    if (flagResult.rows.length === 0) {
      return c.json({ error: 'Feature flag not found' }, 404);
    }

    const flag = flagResult.rows[0];

    // Get tenant overrides
    const overridesResult = await pool.query(
      `SELECT
        tfo.tenant_id,
        t.name as tenant_name,
        tfo.enabled,
        tfo.created_at
       FROM tenant_feature_overrides tfo
       JOIN tenants t ON tfo.tenant_id = t.id
       WHERE tfo.feature_key = $1
       ORDER BY t.name`,
      [key]
    );

    // Get rollout tenant details
    const rolloutTenants = flag.rollout_tenants || [];
    let rolloutTenantsDetails = [];
    if (rolloutTenants.length > 0) {
      const tenantsResult = await pool.query(
        `SELECT id, name FROM tenants WHERE id = ANY($1) ORDER BY name`,
        [rolloutTenants]
      );
      rolloutTenantsDetails = tenantsResult.rows;
    }

    await logAdminAction(admin.id, 'admin.feature_flag.view', 'feature_flag', key, null, c.req);

    return c.json({
      flag: {
        ...flag,
        rollout_tenants_details: rolloutTenantsDetails
      },
      overrides: overridesResult.rows
    });

  } catch (err) {
    console.error('Get feature flag error:', err);
    return c.json({ error: 'Failed to get feature flag' }, 500);
  }
});

/**
 * POST /admin/feature-flags
 * Create a new feature flag
 */
adminFeatureFlags.post('/', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only superadmins can create feature flags
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can create feature flags' }, 403);
    }

    // Validate request
    const validation = createFlagSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { key, name, description, enabled, rollout_percentage, rollout_tenants } = validation.data;

    // Check if key already exists
    const existingResult = await pool.query(
      'SELECT id FROM feature_flags WHERE key = $1',
      [key]
    );

    if (existingResult.rows.length > 0) {
      return c.json({ error: 'Feature flag with this key already exists' }, 409);
    }

    // Create flag
    const result = await pool.query(
      `INSERT INTO feature_flags (
        key, name, description, enabled, rollout_percentage, rollout_tenants, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [key, name, description || null, enabled, rollout_percentage, JSON.stringify(rollout_tenants), admin.id]
    );

    const flag = result.rows[0];

    await logAdminAction(admin.id, 'admin.feature_flag.create', 'feature_flag', key, {
      name,
      enabled,
      rollout_percentage
    }, c.req);

    return c.json({
      success: true,
      flag,
      message: 'Feature flag created successfully'
    }, 201);

  } catch (err) {
    console.error('Create feature flag error:', err);
    return c.json({ error: 'Failed to create feature flag' }, 500);
  }
});

/**
 * PATCH /admin/feature-flags/:key
 * Update feature flag configuration
 */
adminFeatureFlags.patch('/:key', async (c) => {
  try {
    const { key } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can update flags
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = updateFlagSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if flag exists
    const flagCheck = await pool.query(
      'SELECT id FROM feature_flags WHERE key = $1',
      [key]
    );

    if (flagCheck.rows.length === 0) {
      return c.json({ error: 'Feature flag not found' }, 404);
    }

    // Build UPDATE query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (validation.data.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(validation.data.name);
      paramIndex++;
    }

    if (validation.data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(validation.data.description);
      paramIndex++;
    }

    if (validation.data.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex}`);
      values.push(validation.data.enabled);
      paramIndex++;
    }

    if (validation.data.rollout_percentage !== undefined) {
      updates.push(`rollout_percentage = $${paramIndex}`);
      values.push(validation.data.rollout_percentage);
      paramIndex++;
    }

    if (validation.data.rollout_tenants !== undefined) {
      updates.push(`rollout_tenants = $${paramIndex}`);
      values.push(JSON.stringify(validation.data.rollout_tenants));
      paramIndex++;
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(key);

    await pool.query(
      `UPDATE feature_flags
       SET ${updates.join(', ')}
       WHERE key = $${paramIndex}`,
      values
    );

    // Get updated flag
    const result = await pool.query(
      'SELECT * FROM feature_flags WHERE key = $1',
      [key]
    );

    await logAdminAction(admin.id, 'admin.feature_flag.update', 'feature_flag', key, {
      updated_fields: Object.keys(validation.data)
    }, c.req);

    return c.json({
      success: true,
      flag: result.rows[0]
    });

  } catch (err) {
    console.error('Update feature flag error:', err);
    return c.json({ error: 'Failed to update feature flag' }, 500);
  }
});

/**
 * DELETE /admin/feature-flags/:key
 * Delete a feature flag
 */
adminFeatureFlags.delete('/:key', async (c) => {
  try {
    const { key } = c.req.param();
    const admin = c.get('admin');

    // Only superadmins can delete feature flags
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete feature flags' }, 403);
    }

    // Check if flag exists
    const flagCheck = await pool.query(
      'SELECT id, name FROM feature_flags WHERE key = $1',
      [key]
    );

    if (flagCheck.rows.length === 0) {
      return c.json({ error: 'Feature flag not found' }, 404);
    }

    // Delete flag (cascades to tenant overrides)
    await pool.query(
      'DELETE FROM feature_flags WHERE key = $1',
      [key]
    );

    await logAdminAction(admin.id, 'admin.feature_flag.delete', 'feature_flag', key, {
      name: flagCheck.rows[0].name
    }, c.req);

    return c.json({
      success: true,
      message: 'Feature flag deleted successfully'
    });

  } catch (err) {
    console.error('Delete feature flag error:', err);
    return c.json({ error: 'Failed to delete feature flag' }, 500);
  }
});

/**
 * GET /admin/feature-flags/:key/tenants
 * Get all tenants and their feature status
 */
adminFeatureFlags.get('/:key/tenants', async (c) => {
  try {
    const { key } = c.req.param();
    const admin = c.get('admin');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    // Get flag
    const flagResult = await pool.query(
      'SELECT * FROM feature_flags WHERE key = $1',
      [key]
    );

    if (flagResult.rows.length === 0) {
      return c.json({ error: 'Feature flag not found' }, 404);
    }

    const flag = flagResult.rows[0];

    // Get all tenants with their feature status
    const result = await pool.query(
      `SELECT
        t.id,
        t.name,
        t.email,
        t.status,
        tfo.enabled as override_enabled,
        CASE
          WHEN tfo.enabled IS NOT NULL THEN tfo.enabled
          ELSE false
        END as is_enabled
       FROM tenants t
       LEFT JOIN tenant_feature_overrides tfo ON t.id = tfo.tenant_id AND tfo.feature_key = $1
       WHERE t.deleted_at IS NULL
       ORDER BY t.name
       LIMIT $2 OFFSET $3`,
      [key, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL'
    );

    // Calculate which tenants would be enabled based on flag config
    const tenantsWithStatus = result.rows.map(tenant => {
      let computedEnabled = false;

      if (tenant.override_enabled !== null) {
        computedEnabled = tenant.override_enabled;
      } else if (flag.enabled) {
        const rolloutTenants = flag.rollout_tenants || [];
        if (rolloutTenants.includes(tenant.id)) {
          computedEnabled = true;
        } else if (flag.rollout_percentage < 100) {
          const hash = hashTenantId(tenant.id);
          computedEnabled = (hash % 100) < flag.rollout_percentage;
        } else {
          computedEnabled = true;
        }
      }

      return {
        ...tenant,
        computed_enabled: computedEnabled,
        has_override: tenant.override_enabled !== null
      };
    });

    await logAdminAction(admin.id, 'admin.feature_flag.tenants_view', 'feature_flag', key, null, c.req);

    return c.json({
      flag: flag,
      tenants: tenantsWithStatus,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count)
      }
    });

  } catch (err) {
    console.error('Get feature flag tenants error:', err);
    return c.json({ error: 'Failed to get feature flag tenants' }, 500);
  }
});

/**
 * POST /admin/feature-flags/:key/tenants/:tenantId/override
 * Set tenant-specific feature override
 */
adminFeatureFlags.post('/:key/tenants/:tenantId/override', async (c) => {
  try {
    const { key, tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can set overrides
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate enabled boolean
    if (typeof body.enabled !== 'boolean') {
      return c.json({ error: 'enabled must be a boolean' }, 400);
    }

    // Check if flag exists
    const flagCheck = await pool.query(
      'SELECT id FROM feature_flags WHERE key = $1',
      [key]
    );

    if (flagCheck.rows.length === 0) {
      return c.json({ error: 'Feature flag not found' }, 404);
    }

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Upsert override
    await pool.query(
      `INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, feature_key)
       DO UPDATE SET enabled = $3, updated_at = NOW()`,
      [tenantId, key, body.enabled, admin.id]
    );

    await logAdminAction(admin.id, 'admin.feature_flag.override_set', 'feature_flag', key, {
      tenant_id: tenantId,
      tenant_name: tenantCheck.rows[0].name,
      enabled: body.enabled
    }, c.req);

    return c.json({
      success: true,
      message: `Feature override set for tenant ${tenantCheck.rows[0].name}`
    });

  } catch (err) {
    console.error('Set feature override error:', err);
    return c.json({ error: 'Failed to set feature override' }, 500);
  }
});

/**
 * DELETE /admin/feature-flags/:key/tenants/:tenantId/override
 * Remove tenant-specific feature override
 */
adminFeatureFlags.delete('/:key/tenants/:tenantId/override', async (c) => {
  try {
    const { key, tenantId } = c.req.param();
    const admin = c.get('admin');

    // Only admins and superadmins can remove overrides
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Get tenant name for logging
    const tenantResult = await pool.query(
      'SELECT name FROM tenants WHERE id = $1',
      [tenantId]
    );

    // Delete override
    const result = await pool.query(
      'DELETE FROM tenant_feature_overrides WHERE tenant_id = $1 AND feature_key = $2 RETURNING *',
      [tenantId, key]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Override not found' }, 404);
    }

    await logAdminAction(admin.id, 'admin.feature_flag.override_remove', 'feature_flag', key, {
      tenant_id: tenantId,
      tenant_name: tenantResult.rows.length > 0 ? tenantResult.rows[0].name : 'Unknown'
    }, c.req);

    return c.json({
      success: true,
      message: 'Feature override removed'
    });

  } catch (err) {
    console.error('Remove feature override error:', err);
    return c.json({ error: 'Failed to remove feature override' }, 500);
  }
});

/**
 * GET /admin/feature-flags/:key/check/:tenantId
 * Check if feature is enabled for a specific tenant
 */
adminFeatureFlags.get('/:key/check/:tenantId', async (c) => {
  try {
    const { key, tenantId } = c.req.param();
    const admin = c.get('admin');

    const enabled = await isFeatureEnabledForTenant(key, parseInt(tenantId));

    return c.json({
      feature_key: key,
      tenant_id: parseInt(tenantId),
      enabled
    });

  } catch (err) {
    console.error('Check feature flag error:', err);
    return c.json({ error: 'Failed to check feature flag' }, 500);
  }
});

export default adminFeatureFlags;
