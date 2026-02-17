/**
 * Admin Authentication Routes
 * Handles login, logout, session management for IRISX platform administrators
 * SEPARATE from tenant user authentication for security
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import pool from '../db/connection.js';
import { authRateLimit } from '../middleware/rate-limit.js';

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

const verify2FASchema = z.object({
  pending_token: z.string(),
  totp_code: z.string().length(6)
});

const setup2FASchema = z.object({
  totp_code: z.string().length(6)
});

// =====================================================
// MIDDLEWARE: Authenticate Admin JWT
// =====================================================

/**
 * Require specific admin role(s)
 * Must be used after authenticateAdmin middleware
 */
export const requireAdminRole = (allowedRoles) => {
  // Handle both array and single string
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (c, next) => {
    const admin = c.get('admin');

    if (!admin) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    if (!roles.includes(admin.role)) {
      return c.json({ error: 'Insufficient admin permissions' }, 403);
    }

    await next();
  };
};

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

function generate2FAPendingToken(admin) {
  return jwt.sign(
    {
      adminId: admin.id,
      email: admin.email,
      pending_2fa: true
    },
    JWT_SECRET,
    { expiresIn: '5m' } // 2FA pending tokens only valid for 5 minutes
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
 * Rate limited: 5 attempts per 15 minutes per IP
 */
adminAuth.post('/login', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();

    console.log('[LOGIN] Request received:', {
      email: body.email,
      passwordLength: body.password?.length,
      hasPassword: !!body.password
    });

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

    // Verify password - with detailed error logging
    console.log('[LOGIN DEBUG] Attempting password verification');
    console.log('[LOGIN DEBUG] Password hash length:', admin.password_hash?.length);
    console.log('[LOGIN DEBUG] Password hash prefix:', admin.password_hash?.substring(0, 10));

    let validPassword;
    try {
      validPassword = await bcrypt.compare(password, admin.password_hash);
      console.log('[LOGIN DEBUG] bcrypt.compare result:', validPassword);
    } catch (bcryptError) {
      console.error('[LOGIN ERROR] bcrypt.compare exception:', bcryptError);
      console.error('[LOGIN ERROR] Password hash value:', admin.password_hash);
      console.error('[LOGIN ERROR] Password hash type:', typeof admin.password_hash);
      return c.json({ error: 'Authentication system error' }, 500);
    }

    if (!validPassword) {
      await logAuditAction(admin.id, 'admin.login_failed', 'admin_user', admin.id, null, c.req);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Check if 2FA is enabled
    if (admin.two_factor_enabled) {
      // Generate a pending 2FA token (valid for 5 minutes)
      const pendingToken = generate2FAPendingToken(admin);

      await logAuditAction(admin.id, 'admin.2fa_required', 'admin_user', admin.id, null, c.req);

      return c.json({
        requires_2fa: true,
        pending_token: pendingToken,
        message: 'Please provide your 2FA code to complete login'
      });
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

// =====================================================
// 2FA ROUTES
// =====================================================

/**
 * POST /admin/auth/verify-2fa
 * Verify 2FA code and complete login
 */
adminAuth.post('/verify-2fa', authRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const validation = verify2FASchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { pending_token, totp_code } = validation.data;

    // Verify the pending token
    let decoded;
    try {
      decoded = jwt.verify(pending_token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return c.json({ error: '2FA verification window expired. Please login again.' }, 401);
      }
      return c.json({ error: 'Invalid pending token' }, 401);
    }

    // Ensure this is a pending 2FA token
    if (!decoded.pending_2fa) {
      return c.json({ error: 'Invalid token type' }, 401);
    }

    // Get the admin user with their 2FA secret
    const adminResult = await pool.query(
      `SELECT id, email, first_name, last_name, role, status, two_factor_secret
       FROM admin_users
       WHERE id = $1 AND two_factor_enabled = true AND deleted_at IS NULL`,
      [decoded.adminId]
    );

    if (adminResult.rows.length === 0) {
      return c.json({ error: 'Admin not found or 2FA not enabled' }, 401);
    }

    const admin = adminResult.rows[0];

    if (admin.status !== 'active') {
      return c.json({ error: 'Account is suspended' }, 403);
    }

    // Verify the TOTP code
    const isValid = authenticator.verify({
      token: totp_code,
      secret: admin.two_factor_secret
    });

    if (!isValid) {
      await logAuditAction(admin.id, 'admin.2fa_failed', 'admin_user', admin.id, null, c.req);
      return c.json({ error: 'Invalid 2FA code' }, 401);
    }

    // 2FA verified - generate full session token
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

    await logAuditAction(admin.id, 'admin.login_2fa', 'admin_user', admin.id, null, c.req);

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
    console.error('2FA verification error:', err);
    return c.json({ error: '2FA verification failed' }, 500);
  }
});

/**
 * GET /admin/auth/2fa/setup
 * Generate 2FA secret for setup (requires authenticated admin)
 */
adminAuth.get('/2fa/setup', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');

    // Check if 2FA is already enabled
    const checkResult = await pool.query(
      `SELECT two_factor_enabled FROM admin_users WHERE id = $1`,
      [admin.id]
    );

    if (checkResult.rows[0]?.two_factor_enabled) {
      return c.json({ error: '2FA is already enabled. Disable it first to set up again.' }, 400);
    }

    // Generate a new secret
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(admin.email, 'Tazzi Admin', secret);

    // Store the secret temporarily (not enabled yet until verified)
    await pool.query(
      `UPDATE admin_users
       SET two_factor_secret = $1, updated_at = NOW()
       WHERE id = $2`,
      [secret, admin.id]
    );

    await logAuditAction(admin.id, 'admin.2fa_setup_started', 'admin_user', admin.id, null, c.req);

    return c.json({
      secret,
      otpauth_url: otpauth,
      message: 'Scan this QR code with your authenticator app, then verify with a code to enable 2FA'
    });

  } catch (err) {
    console.error('2FA setup error:', err);
    return c.json({ error: '2FA setup failed' }, 500);
  }
});

/**
 * POST /admin/auth/2fa/enable
 * Enable 2FA after verifying the code (requires authenticated admin)
 */
adminAuth.post('/2fa/enable', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const validation = setup2FASchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { totp_code } = validation.data;

    // Get the secret
    const adminResult = await pool.query(
      `SELECT two_factor_secret, two_factor_enabled FROM admin_users WHERE id = $1`,
      [admin.id]
    );

    if (!adminResult.rows[0]?.two_factor_secret) {
      return c.json({ error: 'No 2FA secret found. Call GET /admin/auth/2fa/setup first.' }, 400);
    }

    if (adminResult.rows[0]?.two_factor_enabled) {
      return c.json({ error: '2FA is already enabled' }, 400);
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: totp_code,
      secret: adminResult.rows[0].two_factor_secret
    });

    if (!isValid) {
      return c.json({ error: 'Invalid 2FA code. Please try again.' }, 400);
    }

    // Enable 2FA
    await pool.query(
      `UPDATE admin_users
       SET two_factor_enabled = true, updated_at = NOW()
       WHERE id = $1`,
      [admin.id]
    );

    await logAuditAction(admin.id, 'admin.2fa_enabled', 'admin_user', admin.id, null, c.req);

    return c.json({
      success: true,
      message: '2FA has been enabled successfully'
    });

  } catch (err) {
    console.error('2FA enable error:', err);
    return c.json({ error: '2FA enable failed' }, 500);
  }
});

/**
 * POST /admin/auth/2fa/disable
 * Disable 2FA (requires current password and 2FA code)
 */
adminAuth.post('/2fa/disable', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    const { password, totp_code } = body;

    if (!password || !totp_code) {
      return c.json({ error: 'Password and 2FA code are required' }, 400);
    }

    // Get admin with password hash and 2FA secret
    const adminResult = await pool.query(
      `SELECT password_hash, two_factor_secret, two_factor_enabled
       FROM admin_users WHERE id = $1`,
      [admin.id]
    );

    if (!adminResult.rows[0]?.two_factor_enabled) {
      return c.json({ error: '2FA is not enabled' }, 400);
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, adminResult.rows[0].password_hash);
    if (!validPassword) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    // Verify the 2FA code
    const isValid = authenticator.verify({
      token: totp_code,
      secret: adminResult.rows[0].two_factor_secret
    });

    if (!isValid) {
      return c.json({ error: 'Invalid 2FA code' }, 401);
    }

    // Disable 2FA
    await pool.query(
      `UPDATE admin_users
       SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW()
       WHERE id = $1`,
      [admin.id]
    );

    await logAuditAction(admin.id, 'admin.2fa_disabled', 'admin_user', admin.id, null, c.req);

    return c.json({
      success: true,
      message: '2FA has been disabled successfully'
    });

  } catch (err) {
    console.error('2FA disable error:', err);
    return c.json({ error: '2FA disable failed' }, 500);
  }
});

// =====================================================
// TENANT USER IMPERSONATION ROUTES
// =====================================================

/**
 * POST /admin/auth/impersonate
 * Impersonate a tenant user (for support/debugging)
 * Only super_admin and support roles can impersonate
 * Generates a special token that grants access as the tenant user
 */
adminAuth.post('/impersonate', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const { user_id, reason } = body;

    // Only super_admin and support roles can impersonate
    if (!['super_admin', 'support'].includes(admin.role)) {
      await logAuditAction(admin.id, 'admin.impersonation_denied', 'user', user_id,
        { reason: 'Insufficient role', admin_role: admin.role }, c.req);
      return c.json({ error: 'Only super_admin and support roles can impersonate users' }, 403);
    }

    if (!user_id) {
      return c.json({ error: 'user_id is required' }, 400);
    }

    if (!reason || reason.length < 5) {
      return c.json({ error: 'reason is required (min 5 characters) for audit purposes' }, 400);
    }

    // Get the target user
    const userResult = await pool.query(
      `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, u.phone,
              u.role, u.status,
              t.name as tenant_name, t.status as tenant_status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const targetUser = userResult.rows[0];

    if (targetUser.status !== 'active') {
      return c.json({ error: 'Cannot impersonate inactive user' }, 400);
    }

    if (targetUser.tenant_status !== 'active') {
      return c.json({ error: 'Cannot impersonate user from inactive tenant' }, 400);
    }

    // Generate an impersonation token
    // This token contains both the admin info and the target user info
    const impersonationToken = jwt.sign(
      {
        // Target user claims (for API access)
        userId: targetUser.id,
        tenantId: targetUser.tenant_id,
        email: targetUser.email,
        role: targetUser.role,
        // Impersonation metadata
        impersonation: true,
        impersonatedBy: {
          adminId: admin.id,
          adminEmail: admin.email,
          adminRole: admin.role
        },
        reason: reason
      },
      JWT_SECRET,
      { expiresIn: '2h' } // Impersonation sessions are shorter for security
    );

    // Log the impersonation start
    await logAuditAction(admin.id, 'admin.impersonation_started', 'user', targetUser.id, {
      reason,
      target_user_email: targetUser.email,
      target_tenant: targetUser.tenant_name
    }, c.req);

    // Also log in a dedicated impersonation log if the table exists
    try {
      await pool.query(
        `INSERT INTO admin_impersonation_log (
          admin_user_id, target_user_id, target_tenant_id,
          reason, ip_address, user_agent, started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id`,
        [
          admin.id,
          targetUser.id,
          targetUser.tenant_id,
          reason,
          c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
          c.req.header('user-agent') || 'unknown'
        ]
      );
    } catch (tableErr) {
      // Table might not exist yet, that's okay
      console.log('[Impersonation] Impersonation log table not found, skipping detailed log');
    }

    return c.json({
      success: true,
      impersonation_token: impersonationToken,
      expires_in: '2h',
      target_user: {
        id: targetUser.id,
        email: targetUser.email,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        role: targetUser.role,
        tenant_id: targetUser.tenant_id,
        tenant_name: targetUser.tenant_name
      },
      notice: 'You are now impersonating this user. All API calls with this token will be logged. Use /admin/auth/impersonate/end to stop.'
    });

  } catch (err) {
    console.error('Impersonation error:', err);
    return c.json({ error: 'Impersonation failed' }, 500);
  }
});

/**
 * GET /admin/auth/impersonate/check
 * Check if current request is an impersonation session
 * Can be called with either admin or tenant user token
 */
adminAuth.get('/impersonate/check', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.substring(7);
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    if (decoded.impersonation) {
      return c.json({
        is_impersonation: true,
        impersonated_user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role
        },
        impersonated_by: decoded.impersonatedBy,
        reason: decoded.reason
      });
    }

    return c.json({
      is_impersonation: false
    });

  } catch (err) {
    console.error('Impersonation check error:', err);
    return c.json({ error: 'Check failed' }, 500);
  }
});

/**
 * POST /admin/auth/impersonate/end
 * End impersonation session (just for audit logging)
 * The impersonation token can simply be discarded
 */
adminAuth.post('/impersonate/end', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.substring(7);
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    if (!decoded.impersonation) {
      return c.json({ error: 'Not an impersonation session' }, 400);
    }

    // Log the impersonation end
    await logAuditAction(
      decoded.impersonatedBy.adminId,
      'admin.impersonation_ended',
      'user',
      decoded.userId,
      {
        reason: decoded.reason,
        target_user_email: decoded.email
      },
      c.req
    );

    // Update the impersonation log if exists
    try {
      await pool.query(
        `UPDATE admin_impersonation_log
         SET ended_at = NOW()
         WHERE admin_user_id = $1 AND target_user_id = $2 AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`,
        [decoded.impersonatedBy.adminId, decoded.userId]
      );
    } catch (tableErr) {
      // Table might not exist
    }

    return c.json({
      success: true,
      message: 'Impersonation session ended. Please discard the impersonation token.'
    });

  } catch (err) {
    console.error('End impersonation error:', err);
    return c.json({ error: 'End impersonation failed' }, 500);
  }
});

/**
 * GET /admin/auth/impersonate/history
 * Get impersonation history (for auditing)
 * Only super_admin can view full history
 */
adminAuth.get('/impersonate/history', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');
    const { tenant_id, user_id, admin_id, limit = 50, offset = 0 } = c.req.query();

    // Only super_admin can view all history
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (admin.role !== 'super_admin') {
      // Non-super_admin can only see their own impersonation history
      whereClause = `WHERE il.admin_user_id = $${paramIndex}`;
      params.push(admin.id);
      paramIndex++;
    } else {
      // Super admin can filter
      const conditions = [];

      if (tenant_id) {
        conditions.push(`il.target_tenant_id = $${paramIndex}`);
        params.push(tenant_id);
        paramIndex++;
      }

      if (user_id) {
        conditions.push(`il.target_user_id = $${paramIndex}`);
        params.push(user_id);
        paramIndex++;
      }

      if (admin_id) {
        conditions.push(`il.admin_user_id = $${paramIndex}`);
        params.push(admin_id);
        paramIndex++;
      }

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
    }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const result = await pool.query(
      `SELECT
        il.id,
        il.admin_user_id,
        au.email as admin_email,
        au.first_name as admin_first_name,
        au.last_name as admin_last_name,
        il.target_user_id,
        u.email as target_user_email,
        u.first_name as target_first_name,
        u.last_name as target_last_name,
        il.target_tenant_id,
        t.name as tenant_name,
        il.reason,
        il.ip_address,
        il.started_at,
        il.ended_at
       FROM admin_impersonation_log il
       JOIN admin_users au ON au.id = il.admin_user_id
       JOIN users u ON u.id = il.target_user_id
       JOIN tenants t ON t.id = il.target_tenant_id
       ${whereClause}
       ORDER BY il.started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return c.json({
      impersonation_history: result.rows,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (err) {
    if (err.code === '42P01') {
      // Table doesn't exist yet
      return c.json({
        impersonation_history: [],
        notice: 'Impersonation log table not created yet. Run migration first.'
      });
    }
    console.error('Impersonation history error:', err);
    return c.json({ error: 'Failed to fetch impersonation history' }, 500);
  }
});

export default adminAuth;
