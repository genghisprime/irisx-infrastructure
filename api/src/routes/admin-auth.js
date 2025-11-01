/**
 * Admin Authentication Routes
 * Handles login, logout, session management for IRISX platform administrators
 * SEPARATE from tenant user authentication for security
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

const adminAuth = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-admin-jwt-key-change-this';
const TOKEN_EXPIRY = '4h'; // Admin tokens expire after 4 hours (shorter than tenant tokens)

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const changePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(8).max(100)
});

// =====================================================
// MIDDLEWARE: Authenticate Admin JWT
// =====================================================

export async function authenticateAdmin(c, next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.adminId || !decoded.role) {
      return c.json({ error: 'Invalid admin token' }, 401);
    }

    // Check if session exists and is not revoked
    const sessionResult = await pool.query(
      `SELECT id, admin_user_id, revoked_at, expires_at
       FROM admin_sessions
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({ error: 'Session not found or revoked' }, 401);
    }

    const session = sessionResult.rows[0];

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'Session expired' }, 401);
    }

    // Get admin user details
    const adminResult = await pool.query(
      `SELECT id, email, first_name, last_name, role, status
       FROM admin_users
       WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [decoded.adminId]
    );

    if (adminResult.rows.length === 0) {
      return c.json({ error: 'Admin user not found or inactive' }, 401);
    }

    // Attach admin user to context
    c.set('admin', adminResult.rows[0]);
    c.set('adminToken', token);

    await next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return c.json({ error: 'Token expired' }, 401);
    }
    if (err.name === 'JsonWebTokenError') {
      return c.json({ error: 'Invalid token' }, 401);
    }
    console.error('Admin auth error:', err);
    return c.json({ error: 'Authentication failed' }, 401);
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(admin) {
  return jwt.sign(
    {
      adminId: admin.id,
      email: admin.email,
      role: admin.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

async function logAuditAction(adminId, action, resourceType, resourceId, changes, req) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id,
        changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        resourceType || null,
        resourceId || null,
        changes ? JSON.stringify(changes) : null,
        req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown',
        req.header('user-agent') || 'unknown'
      ]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

// =====================================================
// ROUTES
// =====================================================

/**
 * POST /admin/auth/login
 * Login as admin user
 */
adminAuth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { email, password } = validation.data;

    // Get admin user
    const adminResult = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, role, status,
              two_factor_enabled, two_factor_secret
       FROM admin_users
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (adminResult.rows.length === 0) {
      // Don't reveal if user exists
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const admin = adminResult.rows[0];

    // Check if account is suspended
    if (admin.status !== 'active') {
      return c.json({ error: 'Account is suspended' }, 403);
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      await logAuditAction(admin.id, 'admin.login_failed', 'admin_user', admin.id, null, c.req);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Check if 2FA is enabled
    if (admin.two_factor_enabled) {
      // TODO: Implement 2FA verification
      // For now, just require the user to disable 2FA manually
      return c.json({
        error: '2FA verification required',
        requires_2fa: true
      }, 403);
    }

    // Generate JWT token
    const token = generateToken(admin);
    const tokenHash = hashToken(token);

    // Create session
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

    await pool.query(
      `INSERT INTO admin_sessions (
        admin_user_id, token_hash, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.id,
        tokenHash,
        c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        c.req.header('user-agent') || 'unknown',
        expiresAt
      ]
    );

    // Update last login
    await pool.query(
      `UPDATE admin_users
       SET last_login_at = NOW(),
           last_login_ip = $1
       WHERE id = $2`,
      [c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown', admin.id]
    );

    // Log successful login
    await logAuditAction(admin.id, 'admin.login', 'admin_user', admin.id, null, c.req);

    return c.json({
      success: true,
      token,
      expires_at: expiresAt.toISOString(),
      admin: {
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role
      }
    });

  } catch (err) {
    console.error('Admin login error:', err);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * POST /admin/auth/logout
 * Logout current admin session
 */
adminAuth.post('/logout', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const token = c.get('adminToken');
    const tokenHash = hashToken(token);

    // Revoke session
    await pool.query(
      `UPDATE admin_sessions
       SET revoked_at = NOW()
       WHERE token_hash = $1`,
      [tokenHash]
    );

    await logAuditAction(admin.id, 'admin.logout', 'admin_user', admin.id, null, c.req);

    return c.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Admin logout error:', err);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * GET /admin/auth/me
 * Get current admin user profile
 */
adminAuth.get('/me', authenticateAdmin, async (c) => {
  const admin = c.get('admin');

  return c.json({
    admin: {
      id: admin.id,
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      role: admin.role,
      status: admin.status
    }
  });
});

/**
 * POST /admin/auth/change-password
 * Change admin password
 */
adminAuth.post('/change-password', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const validation = changePasswordSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { current_password, new_password } = validation.data;

    // Get current password hash
    const adminResult = await pool.query(
      `SELECT password_hash FROM admin_users WHERE id = $1`,
      [admin.id]
    );

    if (adminResult.rows.length === 0) {
      return c.json({ error: 'Admin not found' }, 404);
    }

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, adminResult.rows[0].password_hash);

    if (!validPassword) {
      await logAuditAction(admin.id, 'admin.password_change_failed', 'admin_user', admin.id, null, c.req);
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 10);

    // Update password
    await pool.query(
      `UPDATE admin_users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, admin.id]
    );

    // Revoke all other sessions (force re-login everywhere)
    const tokenHash = hashToken(c.get('adminToken'));
    await pool.query(
      `UPDATE admin_sessions
       SET revoked_at = NOW()
       WHERE admin_user_id = $1 AND token_hash != $2 AND revoked_at IS NULL`,
      [admin.id, tokenHash]
    );

    await logAuditAction(admin.id, 'admin.password_changed', 'admin_user', admin.id, null, c.req);

    return c.json({
      success: true,
      message: 'Password changed successfully. Other sessions have been revoked.'
    });

  } catch (err) {
    console.error('Change password error:', err);
    return c.json({ error: 'Password change failed' }, 500);
  }
});

/**
 * GET /admin/auth/sessions
 * List all active sessions for current admin
 */
adminAuth.get('/sessions', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT id, ip_address, user_agent, created_at, expires_at
       FROM admin_sessions
       WHERE admin_user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [admin.id]
    );

    return c.json({
      sessions: result.rows.map(s => ({
        id: s.id,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        created_at: s.created_at,
        expires_at: s.expires_at
      }))
    });
  } catch (err) {
    console.error('List sessions error:', err);
    return c.json({ error: 'Failed to list sessions' }, 500);
  }
});

/**
 * DELETE /admin/auth/sessions/:id
 * Revoke a specific session
 */
adminAuth.delete('/sessions/:id', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const sessionId = c.req.param('id');

    await pool.query(
      `UPDATE admin_sessions
       SET revoked_at = NOW()
       WHERE id = $1 AND admin_user_id = $2`,
      [sessionId, admin.id]
    );

    await logAuditAction(admin.id, 'admin.session_revoked', 'admin_session', sessionId, null, c.req);

    return c.json({ success: true, message: 'Session revoked' });
  } catch (err) {
    console.error('Revoke session error:', err);
    return c.json({ error: 'Failed to revoke session' }, 500);
  }
});

export default adminAuth;
