/**
 * Admin User Management Routes
 * IRISX staff manage tenant users (password resets, suspensions, etc.)
 * SEPARATE from admin-tenants.js (which manages tenant accounts)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminUsers = new Hono();

// All routes require admin authentication
adminUsers.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  role: z.enum(['admin', 'agent', 'readonly']),
  phone: z.string().optional(),
  send_welcome_email: z.boolean().optional().default(false)
});

const updateUserSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'agent', 'readonly']).optional(),
  phone: z.string().optional(),
  status: z.enum(['active', 'suspended']).optional()
});

const resetPasswordSchema = z.object({
  send_email: z.boolean().optional().default(true)
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function generateTempPassword() {
  const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  const randomWord = words[Math.floor(Math.random() * words.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${randomWord}${randomNum}!`;
}

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

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/tenants/:tenantId/users
 * List all users for a specific tenant
 */
adminUsers.get('/tenants/:tenantId/users', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const status = c.req.query('status'); // active, suspended
    const role = c.req.query('role'); // admin, agent, readonly
    const search = c.req.query('search'); // search by name or email

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['u.tenant_id = $1', 'u.deleted_at IS NULL'];
    let queryParams = [tenantId];
    let paramIndex = 2;

    if (status) {
      whereConditions.push(`u.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`u.role = $${paramIndex}`);
      queryParams.push(role);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM users u
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get users
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.phone,
        u.email_verified,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        (SELECT COUNT(*) FROM agent_extensions WHERE user_id = u.id) as extension_count,
        (SELECT COUNT(*) FROM calls WHERE user_id = u.id) as total_calls
       FROM users u
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.users.list', 'tenant', tenantId, null, c.req);

    return c.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List tenant users error:', err);
    return c.json({ error: 'Failed to list users' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/users
 * Create a new user for a tenant
 */
adminUsers.post('/tenants/:tenantId/users', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Validate request
    const validation = createUserSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { email, first_name, last_name, role, phone, send_welcome_email } = validation.data;

    // Check if tenant exists
    const tenantResult = await pool.query(
      'SELECT id, name, status FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantResult.rows[0];

    if (tenant.status === 'suspended') {
      return c.json({ error: 'Cannot create users for suspended tenant' }, 403);
    }

    // Check if email already exists
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );

    if (emailCheck.rows.length > 0) {
      return c.json({ error: 'Email already exists' }, 409);
    }

    // Generate temporary password
    const tempPassword = await generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (
        tenant_id, email, password_hash, first_name, last_name, role, phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING id, email, first_name, last_name, role, status, phone, created_at`,
      [tenantId, email.toLowerCase(), passwordHash, first_name, last_name, role, phone || null]
    );

    const user = userResult.rows[0];

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.create', 'user', user.id, {
      tenant_id: tenantId,
      email,
      role
    }, c.req);

    // TODO: Send welcome email if requested
    // if (send_welcome_email) {
    //   await sendUserWelcomeEmail(user, tenant, tempPassword);
    // }

    return c.json({
      success: true,
      user,
      temp_password: tempPassword,
      message: send_welcome_email
        ? 'User created and welcome email sent'
        : 'User created. Share temporary password securely.'
    }, 201);

  } catch (err) {
    console.error('Create tenant user error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

/**
 * PATCH /admin/tenants/:tenantId/users/:userId
 * Update a user
 */
adminUsers.patch('/tenants/:tenantId/users/:userId', async (c) => {
  try {
    const { tenantId, userId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Validate request
    const validation = updateUserSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if user exists and belongs to tenant
    const userCheck = await pool.query(
      'SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userCheck.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Build UPDATE query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['first_name', 'last_name', 'email', 'role', 'phone', 'status'];

    for (const field of allowedFields) {
      if (validation.data[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(field === 'email' ? validation.data[field].toLowerCase() : validation.data[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(userId, tenantId);

    // If email is being changed, check for conflicts
    if (validation.data.email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [validation.data.email.toLowerCase(), userId]
      );

      if (emailCheck.rows.length > 0) {
        return c.json({ error: 'Email already in use' }, 409);
      }
    }

    // Update user
    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING id, email, first_name, last_name, role, status, phone, updated_at`,
      values
    );

    const user = result.rows[0];

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.update', 'user', userId, validation.data, c.req);

    return c.json({
      success: true,
      user
    });

  } catch (err) {
    console.error('Update tenant user error:', err);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/users/:userId/reset-password
 * Reset a user's password
 */
adminUsers.post('/tenants/:tenantId/users/:userId/reset-password', async (c) => {
  try {
    const { tenantId, userId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { send_email } = validation.data;

    // Check if user exists
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, t.name as tenant_name
       FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
      [userId, tenantId]
    );

    if (userResult.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = userResult.rows[0];

    // Generate new temporary password
    const tempPassword = await generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    // Revoke all existing sessions for this user (security)
    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.reset_password', 'user', userId, {
      email_sent: send_email
    }, c.req);

    // TODO: Send password reset email if requested
    // if (send_email) {
    //   await sendPasswordResetEmail(user, tempPassword);
    // }

    return c.json({
      success: true,
      temp_password: tempPassword,
      message: send_email
        ? 'Password reset and email sent to user'
        : 'Password reset. Share temporary password securely.'
    });

  } catch (err) {
    console.error('Reset password error:', err);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/users/:userId/suspend
 * Suspend a user
 */
adminUsers.post('/tenants/:tenantId/users/:userId/suspend', async (c) => {
  try {
    const { tenantId, userId } = c.req.param();
    const admin = c.get('admin');

    // Only admins and superadmins can suspend
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, email, status FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userCheck.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = userCheck.rows[0];

    if (user.status === 'suspended') {
      return c.json({ error: 'User already suspended' }, 400);
    }

    // Suspend user
    await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['suspended', userId]
    );

    // Revoke all active sessions
    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.suspend', 'user', userId, {
      previous_status: user.status
    }, c.req);

    return c.json({
      success: true,
      message: 'User suspended and all sessions revoked'
    });

  } catch (err) {
    console.error('Suspend user error:', err);
    return c.json({ error: 'Failed to suspend user' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/users/:userId/reactivate
 * Reactivate a suspended user
 */
adminUsers.post('/tenants/:tenantId/users/:userId/reactivate', async (c) => {
  try {
    const { tenantId, userId } = c.req.param();
    const admin = c.get('admin');

    // Only admins and superadmins can reactivate
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, email, status FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userCheck.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = userCheck.rows[0];

    if (user.status !== 'suspended') {
      return c.json({ error: 'User is not suspended' }, 400);
    }

    // Reactivate user
    await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['active', userId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.reactivate', 'user', userId, {
      previous_status: user.status
    }, c.req);

    return c.json({
      success: true,
      message: 'User reactivated successfully'
    });

  } catch (err) {
    console.error('Reactivate user error:', err);
    return c.json({ error: 'Failed to reactivate user' }, 500);
  }
});

/**
 * DELETE /admin/tenants/:tenantId/users/:userId
 * Soft delete a user (superadmin only)
 */
adminUsers.delete('/tenants/:tenantId/users/:userId', async (c) => {
  try {
    const { tenantId, userId } = c.req.param();
    const admin = c.get('admin');

    // Only superadmin can delete users
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete users' }, 403);
    }

    // Check if user exists
    const userCheck = await pool.query(
      'SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [userId, tenantId]
    );

    if (userCheck.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const user = userCheck.rows[0];

    // Soft delete user
    await pool.query(
      'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Revoke all sessions
    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.user.delete', 'user', userId, {
      email: user.email
    }, c.req);

    return c.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (err) {
    console.error('Delete user error:', err);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

export default adminUsers;
