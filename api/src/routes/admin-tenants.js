/**
 * Admin Tenant Management Routes
 * Platform admin routes for managing tenants
 * Requires admin authentication
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminTenants = new Hono();

// All routes require admin authentication
adminTenants.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  domain: z.string().min(3).max(100).optional(),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise']).default('trial'),
  trial_days: z.number().int().min(0).max(90).default(14),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1).max(100),
  admin_last_name: z.string().min(1).max(100),
  admin_password: z.string().min(8).max(100).optional(),
  notes: z.string().max(1000).optional()
});

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  domain: z.string().min(3).max(100).optional(),
  status: z.enum(['active', 'suspended', 'trial', 'cancelled']).optional(),
  plan: z.enum(['trial', 'starter', 'professional', 'enterprise']).optional(),
  mrr: z.number().min(0).optional(),
  notes: z.string().max(1000).optional()
});

const suspendTenantSchema = z.object({
  reason: z.string().min(10).max(500)
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAuditAction(adminId, action, resourceType, resourceId, tenantId, changes, req) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id, tenant_id,
        changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        adminId,
        action,
        resourceType || null,
        resourceId || null,
        tenantId || null,
        changes ? JSON.stringify(changes) : null,
        req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown',
        req.header('user-agent') || 'unknown'
      ]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/tenants
 * List all tenants with pagination and filtering
 */
adminTenants.get('/', async (c) => {
  try {
    const admin = c.get('admin');
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    const status = c.req.query('status'); // 'active', 'suspended', 'trial', 'cancelled'
    const plan = c.req.query('plan'); // 'trial', 'starter', 'professional', 'enterprise'
    const search = c.req.query('search'); // Search by name or domain

    let query = `
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.plan,
        t.billing_email,
        t.trial_ends_at,
        t.mrr,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND deleted_at IS NULL) as user_count,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND initiated_at >= NOW() - INTERVAL '30 days') as calls_30d
      FROM tenants t
      WHERE t.deleted_at IS NULL
    `;
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
    }

    if (plan) {
      paramCount++;
      query += ` AND t.plan = $${paramCount}`;
      params.push(plan);
    }

    if (search) {
      paramCount++;
      query += ` AND (t.name ILIKE $${paramCount} OR t.slug ILIKE $${paramCount} OR t.billing_email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM (${query}) as filtered`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    paramCount++;
    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    await logAuditAction(admin.id, 'admin.tenant.list', null, null, null, { page, limit, status, plan, search }, c.req);

    return c.json({
      tenants: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List tenants error:', err);
    return c.json({ error: 'Failed to list tenants' }, 500);
  }
});

/**
 * GET /admin/tenants/:id
 * Get detailed information about a specific tenant
 */
adminTenants.get('/:id', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');

    // Get tenant details
    const tenantResult = await pool.query(
      `SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantResult.rows[0];

    // Get usage stats (last 30 days)
    const statsResult = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND deleted_at IS NULL) as user_count,
        (SELECT COUNT(*) FROM agents WHERE tenant_id = $1 AND deleted_at IS NULL) as agent_count,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = $1 AND initiated_at >= NOW() - INTERVAL '30 days') as calls_30d,
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days') as sms_30d,
        (SELECT COUNT(*) FROM emails WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days') as emails_30d`,
      [tenantId]
    );

    // Add whatsapp count as 0 (table doesn't exist yet)
    statsResult.rows[0].whatsapp_30d = 0;

    const stats = statsResult.rows[0];

    // Get admin users for this tenant
    const usersResult = await pool.query(
      `SELECT id, email, first_name, last_name, role, last_login_at, created_at
       FROM users
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 10`,
      [tenantId]
    );

    await logAuditAction(admin.id, 'admin.tenant.view', 'tenant', tenantId, tenantId, null, c.req);

    return c.json({
      tenant,
      stats,
      users: usersResult.rows
    });

  } catch (err) {
    console.error('Get tenant error:', err);
    return c.json({ error: 'Failed to get tenant' }, 500);
  }
});

/**
 * POST /admin/tenants
 * Create a new tenant (with admin user)
 */
adminTenants.post('/', async (c) => {
  const client = await pool.connect();

  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const validation = createTenantSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const data = validation.data;

    // Generate password if not provided
    const tempPassword = data.admin_password || generateRandomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Start transaction
    await client.query('BEGIN');

    // Calculate trial end date
    const trialEndsAt = new Date(Date.now() + data.trial_days * 24 * 60 * 60 * 1000);

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (
        name, domain, plan, status, trial_ends_at, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
      [
        data.name,
        data.domain || `${data.name.toLowerCase().replace(/\s+/g, '-')}.irisx.local`,
        data.plan,
        data.plan === 'trial' ? 'trial' : 'active',
        data.plan === 'trial' ? trialEndsAt : null,
        data.notes || null
      ]
    );

    const tenant = tenantResult.rows[0];

    // Create admin user for this tenant
    const userResult = await client.query(
      `INSERT INTO users (
        tenant_id, email, password_hash, first_name, last_name, role, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id, email, first_name, last_name`,
      [
        tenant.id,
        data.admin_email.toLowerCase(),
        passwordHash,
        data.admin_first_name,
        data.admin_last_name,
        'admin' // Tenant admin role
      ]
    );

    const user = userResult.rows[0];

    // Commit transaction
    await client.query('COMMIT');

    await logAuditAction(
      admin.id,
      'admin.tenant.create',
      'tenant',
      tenant.id,
      tenant.id,
      { tenant_name: data.name, admin_email: data.admin_email },
      c.req
    );

    return c.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        plan: tenant.plan,
        status: tenant.status,
        trial_ends_at: tenant.trial_ends_at
      },
      admin_user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        temp_password: data.admin_password ? undefined : tempPassword
      }
    }, 201);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create tenant error:', err);

    if (err.code === '23505') { // Unique violation
      return c.json({ error: 'Tenant domain or admin email already exists' }, 409);
    }

    return c.json({ error: 'Failed to create tenant' }, 500);
  } finally {
    client.release();
  }
});

/**
 * PATCH /admin/tenants/:id
 * Update tenant information
 */
adminTenants.patch('/:id', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');
    const body = await c.req.json();
    const validation = updateTenantSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const data = validation.data;

    // Get current tenant data for audit log
    const currentResult = await pool.query(
      `SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    if (currentResult.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const currentTenant = currentResult.rows[0];

    // Build update query
    const updates = [];
    const params = [tenantId];
    let paramCount = 1;

    if (data.name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(data.name);
    }

    if (data.domain !== undefined) {
      paramCount++;
      updates.push(`domain = $${paramCount}`);
      params.push(data.domain);
    }

    if (data.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(data.status);
    }

    if (data.plan !== undefined) {
      paramCount++;
      updates.push(`plan = $${paramCount}`);
      params.push(data.plan);
    }

    if (data.mrr !== undefined) {
      paramCount++;
      updates.push(`mrr = $${paramCount}`);
      params.push(data.mrr);
    }

    if (data.notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(data.notes);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = NOW()');

    const query = `
      UPDATE tenants
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, params);

    await logAuditAction(
      admin.id,
      'admin.tenant.update',
      'tenant',
      tenantId,
      tenantId,
      { before: currentTenant, after: data },
      c.req
    );

    return c.json({ success: true, tenant: result.rows[0] });

  } catch (err) {
    console.error('Update tenant error:', err);
    return c.json({ error: 'Failed to update tenant' }, 500);
  }
});

/**
 * POST /admin/tenants/:id/suspend
 * Suspend a tenant
 */
adminTenants.post('/:id/suspend', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');
    const body = await c.req.json();
    const validation = suspendTenantSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { reason } = validation.data;

    // Use the database function
    await pool.query(
      `SELECT suspend_tenant($1, $2, $3)`,
      [tenantId, reason, admin.id]
    );

    return c.json({
      success: true,
      message: 'Tenant suspended successfully'
    });

  } catch (err) {
    console.error('Suspend tenant error:', err);
    return c.json({ error: 'Failed to suspend tenant' }, 500);
  }
});

/**
 * POST /admin/tenants/:id/reactivate
 * Reactivate a suspended tenant
 */
adminTenants.post('/:id/reactivate', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');

    // Use the database function
    await pool.query(
      `SELECT reactivate_tenant($1, $2)`,
      [tenantId, admin.id]
    );

    return c.json({
      success: true,
      message: 'Tenant reactivated successfully'
    });

  } catch (err) {
    console.error('Reactivate tenant error:', err);
    return c.json({ error: 'Failed to reactivate tenant' }, 500);
  }
});

/**
 * DELETE /admin/tenants/:id
 * Soft delete a tenant
 */
adminTenants.delete('/:id', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');

    // Only superadmins can delete tenants
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete tenants' }, 403);
    }

    await pool.query(
      `UPDATE tenants
       SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [tenantId]
    );

    await logAuditAction(
      admin.id,
      'admin.tenant.delete',
      'tenant',
      tenantId,
      tenantId,
      null,
      c.req
    );

    return c.json({
      success: true,
      message: 'Tenant deleted successfully (soft delete)'
    });

  } catch (err) {
    console.error('Delete tenant error:', err);
    return c.json({ error: 'Failed to delete tenant' }, 500);
  }
});

/**
 * GET /admin/tenants/:id/audit-log
 * Get audit log for a specific tenant
 */
adminTenants.get('/:id/audit-log', async (c) => {
  try {
    const admin = c.get('admin');
    const tenantId = c.req.param('id');
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);

    const result = await pool.query(
      `SELECT
        al.*,
        au.email as admin_email,
        au.first_name as admin_first_name,
        au.last_name as admin_last_name
       FROM admin_audit_log al
       LEFT JOIN admin_users au ON al.admin_user_id = au.id
       WHERE al.tenant_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return c.json({ audit_log: result.rows });

  } catch (err) {
    console.error('Get audit log error:', err);
    return c.json({ error: 'Failed to get audit log' }, 500);
  }
});

export default adminTenants;
