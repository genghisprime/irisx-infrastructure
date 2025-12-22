/**
 * Security Routes
 * IP Whitelisting, Email Verification, Sessions, Audit Log
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import securityService from '../services/security.js';

const router = new Hono();

// ===========================================
// IP WHITELISTING
// ===========================================

/**
 * GET /v1/security/ip-whitelist
 * List IP whitelist for tenant
 */
router.get('/ip-whitelist', async (c) => {
  const tenantId = c.get('tenantId');
  const includeInactive = c.req.query('include_inactive') === 'true';

  const whitelist = await securityService.listIPWhitelist(tenantId, includeInactive);
  return c.json({ whitelist });
});

/**
 * POST /v1/security/ip-whitelist
 * Add IP to whitelist
 */
router.post('/ip-whitelist', zValidator('json', z.object({
  ip_address: z.string().min(7).max(45),
  cidr_range: z.string().optional(),
  description: z.string().max(255).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { ip_address, cidr_range, description } = c.req.valid('json');

  const entry = await securityService.addIPToWhitelist(tenantId, ip_address, {
    cidrRange: cidr_range,
    description,
    createdBy: userId
  });

  return c.json(entry, 201);
});

/**
 * DELETE /v1/security/ip-whitelist/:ipAddress
 * Remove IP from whitelist
 */
router.delete('/ip-whitelist/:ipAddress', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { ipAddress } = c.req.param();

  await securityService.removeIPFromWhitelist(tenantId, ipAddress, userId);
  return c.json({ success: true });
});

/**
 * PUT /v1/security/ip-whitelist/settings
 * Enable/disable IP whitelist for tenant
 */
router.put('/ip-whitelist/settings', zValidator('json', z.object({
  enabled: z.boolean()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { enabled } = c.req.valid('json');

  await securityService.setIPWhitelistEnabled(tenantId, enabled);
  return c.json({ success: true, ip_whitelist_enabled: enabled });
});

/**
 * POST /v1/security/ip-whitelist/check
 * Check if an IP is whitelisted
 */
router.post('/ip-whitelist/check', zValidator('json', z.object({
  ip_address: z.string()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { ip_address } = c.req.valid('json');

  const whitelisted = await securityService.isIPWhitelisted(tenantId, ip_address);
  return c.json({ ip_address, whitelisted });
});

// ===========================================
// EMAIL VERIFICATION
// ===========================================

/**
 * POST /v1/security/email/verify
 * Verify email with token
 */
router.post('/email/verify', zValidator('json', z.object({
  token: z.string().min(32)
})), async (c) => {
  const { token } = c.req.valid('json');

  const result = await securityService.verifyEmail(token);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({
    success: true,
    message: 'Email verified successfully',
    email: result.email
  });
});

/**
 * POST /v1/security/email/resend
 * Resend verification email
 */
router.post('/email/resend', async (c) => {
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');

  const result = await securityService.resendVerificationToken(userId, tenantId);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  // In production, you would send an email here with the verification link
  // For now, return the token (remove in production)
  return c.json({
    success: true,
    message: 'Verification email sent',
    email: result.email,
    expiresAt: result.expiresAt,
    // Remove this in production - only for testing
    _debug_token: process.env.NODE_ENV === 'development' ? result.token : undefined
  });
});

/**
 * GET /v1/security/email/status
 * Get email verification status
 */
router.get('/email/status', async (c) => {
  const userId = c.get('userId');

  const result = await db.query(`
    SELECT email, email_verified, email_verified_at FROM users WHERE id = $1
  `, [userId]);

  if (!result.rows[0]) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    email: result.rows[0].email,
    verified: result.rows[0].email_verified,
    verifiedAt: result.rows[0].email_verified_at
  });
});

// ===========================================
// SESSION MANAGEMENT
// ===========================================

/**
 * GET /v1/security/sessions
 * List active sessions for current user
 */
router.get('/sessions', async (c) => {
  const userId = c.get('userId');

  const sessions = await securityService.listUserSessions(userId);
  return c.json({ sessions });
});

/**
 * DELETE /v1/security/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', async (c) => {
  const userId = c.get('userId');
  const { sessionId } = c.req.param();

  // Verify session belongs to user
  const session = await db.query(`
    SELECT session_token FROM user_sessions WHERE id = $1 AND user_id = $2
  `, [sessionId, userId]);

  if (session.rows.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await securityService.revokeSession(session.rows[0].session_token, 'user_revoked');
  return c.json({ success: true });
});

/**
 * DELETE /v1/security/sessions
 * Revoke all sessions except current
 */
router.delete('/sessions', async (c) => {
  const userId = c.get('userId');
  const currentToken = c.req.header('Authorization')?.replace('Bearer ', '');

  // Revoke all except current
  await db.query(`
    UPDATE user_sessions
    SET is_active = false, revoked_at = NOW(), revoked_reason = 'user_revoked_all'
    WHERE user_id = $1 AND session_token != $2 AND is_active = true
  `, [userId, currentToken]);

  return c.json({ success: true, message: 'All other sessions revoked' });
});

// ===========================================
// ACCOUNT LOCKOUT
// ===========================================

/**
 * GET /v1/security/lockout/status
 * Check if account is locked
 */
router.get('/lockout/status', zValidator('query', z.object({
  email: z.string().email()
})), async (c) => {
  const { email } = c.req.valid('query');

  const status = await securityService.isAccountLocked(email);
  return c.json(status);
});

/**
 * POST /v1/security/lockout/unlock (admin only)
 * Manually unlock an account
 */
router.post('/lockout/unlock', zValidator('json', z.object({
  email: z.string().email()
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const userId = c.get('userId');
  const { email } = c.req.valid('json');

  await securityService.unlockAccount(email, userId);
  return c.json({ success: true, message: 'Account unlocked' });
});

// ===========================================
// SECURITY AUDIT LOG
// ===========================================

/**
 * GET /v1/security/audit-log
 * Get security audit log
 */
router.get('/audit-log', zValidator('query', z.object({
  user_id: z.string().uuid().optional(),
  event_type: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const query = c.req.valid('query');

  const result = await securityService.getSecurityAuditLog({
    tenantId: isAdmin ? null : tenantId,
    userId: query.user_id,
    eventType: query.event_type,
    riskLevel: query.risk_level,
    startDate: query.start_date,
    endDate: query.end_date,
    limit: query.limit,
    offset: query.offset
  });

  return c.json(result);
});

/**
 * GET /v1/security/audit-log/suspicious
 * Get suspicious activity summary
 */
router.get('/audit-log/suspicious', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const { days } = c.req.valid('query');

  const summary = await securityService.getSuspiciousActivitySummary(
    isAdmin ? null : tenantId,
    days
  );

  return c.json({ summary, days });
});

// ===========================================
// LOGIN ATTEMPTS
// ===========================================

/**
 * GET /v1/security/login-attempts
 * Get recent login attempts
 */
router.get('/login-attempts', zValidator('query', z.object({
  email: z.string().email().optional(),
  limit: z.coerce.number().min(1).max(100).default(50)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const { email, limit } = c.req.valid('query');

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (!isAdmin) {
    whereConditions.push(`tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  if (email) {
    whereConditions.push(`email = $${paramIndex++}`);
    params.push(email);
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  const result = await db.query(`
    SELECT
      id, email, ip_address, user_agent, success, failure_reason, created_at
    FROM login_attempts
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex}
  `, [...params, limit]);

  return c.json({ attempts: result.rows });
});

// ===========================================
// SECURITY DASHBOARD
// ===========================================

/**
 * GET /v1/security/dashboard
 * Get security dashboard overview
 */
router.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  const tenantFilter = isAdmin ? '' : 'AND tenant_id = $1';
  const params = isAdmin ? [] : [tenantId];

  // Get login stats (last 24 hours)
  const loginStats = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE success = true) as successful_logins,
      COUNT(*) FILTER (WHERE success = false) as failed_logins,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM login_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ${tenantFilter}
  `, params);

  // Get active lockouts
  const activeLockouts = await db.query(`
    SELECT COUNT(*) as count
    FROM account_lockouts
    WHERE locked_until > NOW()
  `);

  // Get unverified users
  const unverifiedUsers = await db.query(`
    SELECT COUNT(*) as count
    FROM users
    WHERE email_verified = false
    ${isAdmin ? '' : 'AND tenant_id = $1'}
  `, params);

  // Get high-risk events (last 7 days)
  const highRiskEvents = await db.query(`
    SELECT COUNT(*) as count
    FROM security_audit_log
    WHERE risk_level IN ('high', 'critical')
      AND created_at > NOW() - INTERVAL '7 days'
    ${tenantFilter}
  `, params);

  // Get active sessions
  const activeSessions = await db.query(`
    SELECT COUNT(*) as count
    FROM user_sessions
    WHERE is_active = true AND expires_at > NOW()
    ${tenantFilter}
  `, params);

  return c.json({
    loginStats: loginStats.rows[0],
    activeLockouts: parseInt(activeLockouts.rows[0].count),
    unverifiedUsers: parseInt(unverifiedUsers.rows[0].count),
    highRiskEvents: parseInt(highRiskEvents.rows[0].count),
    activeSessions: parseInt(activeSessions.rows[0].count)
  });
});

// Import db for direct queries
import db from '../db.js';

export default router;
