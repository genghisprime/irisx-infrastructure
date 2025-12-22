/**
 * Security Service
 * IP Whitelisting, Email Verification, Account Lockouts, Session Management
 */

import db from '../db.js';
import crypto from 'crypto';

class SecurityService {
  constructor() {
    this.maxLoginAttempts = 5;
    this.lockoutDurationMinutes = 30;
    this.verificationTokenExpiryHours = 24;
    this.passwordHistoryCount = 5;
  }

  // ===========================================
  // IP WHITELISTING
  // ===========================================

  /**
   * Check if IP is whitelisted for tenant
   * Returns true if:
   * 1. IP whitelist is disabled for tenant, OR
   * 2. IP is in the whitelist (exact match or CIDR range)
   */
  async isIPWhitelisted(tenantId, ipAddress) {
    // Check if IP whitelist is enabled for tenant
    const tenant = await db.query(`
      SELECT ip_whitelist_enabled FROM tenants WHERE id = $1
    `, [tenantId]);

    if (!tenant.rows[0]?.ip_whitelist_enabled) {
      return true; // Whitelist not enabled, allow all
    }

    // Check for exact IP match
    const exactMatch = await db.query(`
      SELECT id FROM ip_whitelists
      WHERE tenant_id = $1
        AND ip_address = $2
        AND is_active = true
    `, [tenantId, ipAddress]);

    if (exactMatch.rows.length > 0) {
      return true;
    }

    // Check CIDR ranges
    const cidrRanges = await db.query(`
      SELECT cidr_range FROM ip_whitelists
      WHERE tenant_id = $1
        AND cidr_range IS NOT NULL
        AND is_active = true
    `, [tenantId]);

    for (const row of cidrRanges.rows) {
      if (this.isIPInCIDR(ipAddress, row.cidr_range)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if IP is within CIDR range
   */
  isIPInCIDR(ip, cidr) {
    try {
      const [range, bits] = cidr.split('/');
      const mask = parseInt(bits, 10);

      // Convert IPs to binary
      const ipBinary = this.ipToBinary(ip);
      const rangeBinary = this.ipToBinary(range);

      if (!ipBinary || !rangeBinary) return false;

      // Compare the first 'mask' bits
      return ipBinary.substring(0, mask) === rangeBinary.substring(0, mask);
    } catch (error) {
      console.error('[Security] CIDR check error:', error);
      return false;
    }
  }

  /**
   * Convert IP address to binary string
   */
  ipToBinary(ip) {
    if (ip.includes(':')) {
      // IPv6
      const parts = ip.split(':');
      return parts.map(p => parseInt(p || '0', 16).toString(2).padStart(16, '0')).join('');
    } else {
      // IPv4
      const parts = ip.split('.');
      return parts.map(p => parseInt(p, 10).toString(2).padStart(8, '0')).join('');
    }
  }

  /**
   * Add IP to whitelist
   */
  async addIPToWhitelist(tenantId, ipAddress, options = {}) {
    const { cidrRange, description, createdBy } = options;

    const result = await db.query(`
      INSERT INTO ip_whitelists (
        tenant_id, ip_address, cidr_range, description, created_by
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, ip_address)
      DO UPDATE SET
        cidr_range = EXCLUDED.cidr_range,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = NOW()
      RETURNING *
    `, [tenantId, ipAddress, cidrRange, description, createdBy]);

    await this.logSecurityEvent({
      tenantId,
      userId: createdBy,
      eventType: 'ip_whitelist_added',
      eventDetails: { ipAddress, cidrRange },
      ipAddress
    });

    return result.rows[0];
  }

  /**
   * Remove IP from whitelist
   */
  async removeIPFromWhitelist(tenantId, ipAddress, removedBy) {
    await db.query(`
      UPDATE ip_whitelists
      SET is_active = false, updated_at = NOW()
      WHERE tenant_id = $1 AND ip_address = $2
    `, [tenantId, ipAddress]);

    await this.logSecurityEvent({
      tenantId,
      userId: removedBy,
      eventType: 'ip_whitelist_removed',
      eventDetails: { ipAddress },
      ipAddress
    });
  }

  /**
   * List IP whitelist for tenant
   */
  async listIPWhitelist(tenantId, includeInactive = false) {
    const whereClause = includeInactive ? '' : 'AND is_active = true';

    const result = await db.query(`
      SELECT * FROM ip_whitelists
      WHERE tenant_id = $1 ${whereClause}
      ORDER BY created_at DESC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Enable/disable IP whitelist for tenant
   */
  async setIPWhitelistEnabled(tenantId, enabled) {
    await db.query(`
      UPDATE tenants
      SET ip_whitelist_enabled = $2
      WHERE id = $1
    `, [tenantId, enabled]);

    await this.logSecurityEvent({
      tenantId,
      eventType: enabled ? 'ip_whitelist_enabled' : 'ip_whitelist_disabled',
      eventDetails: {}
    });
  }

  // ===========================================
  // EMAIL VERIFICATION
  // ===========================================

  /**
   * Generate email verification token
   */
  async generateVerificationToken(userId, email, tenantId) {
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.verificationTokenExpiryHours * 60 * 60 * 1000);

    // Invalidate any existing tokens for this user
    await db.query(`
      DELETE FROM email_verifications
      WHERE user_id = $1
    `, [userId]);

    // Create new verification record
    await db.query(`
      INSERT INTO email_verifications (
        user_id, tenant_id, email, token, token_hash, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, tenantId, email, token, tokenHash, expiresAt]);

    await this.logSecurityEvent({
      tenantId,
      userId,
      eventType: 'verification_token_generated',
      eventDetails: { email }
    });

    return {
      token,
      expiresAt
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find verification record
    const result = await db.query(`
      SELECT * FROM email_verifications
      WHERE token_hash = $1
        AND verified_at IS NULL
        AND expires_at > NOW()
    `, [tokenHash]);

    if (result.rows.length === 0) {
      // Check if token exists but expired or used
      const expired = await db.query(`
        SELECT * FROM email_verifications WHERE token_hash = $1
      `, [tokenHash]);

      if (expired.rows.length > 0) {
        if (expired.rows[0].verified_at) {
          return { success: false, error: 'Email already verified' };
        } else {
          return { success: false, error: 'Verification token expired' };
        }
      }

      return { success: false, error: 'Invalid verification token' };
    }

    const verification = result.rows[0];

    // Mark as verified
    await db.query(`
      UPDATE email_verifications
      SET verified_at = NOW()
      WHERE id = $1
    `, [verification.id]);

    // Update user's email_verified status
    await db.query(`
      UPDATE users
      SET email_verified = true, email_verified_at = NOW()
      WHERE id = $1
    `, [verification.user_id]);

    await this.logSecurityEvent({
      tenantId: verification.tenant_id,
      userId: verification.user_id,
      eventType: 'email_verified',
      eventDetails: { email: verification.email }
    });

    return {
      success: true,
      userId: verification.user_id,
      email: verification.email
    };
  }

  /**
   * Check if email verification is required for tenant
   */
  async isEmailVerificationRequired(tenantId) {
    const result = await db.query(`
      SELECT require_email_verification FROM tenants WHERE id = $1
    `, [tenantId]);

    return result.rows[0]?.require_email_verification ?? true;
  }

  /**
   * Resend verification email
   */
  async resendVerificationToken(userId, tenantId) {
    // Get user email
    const user = await db.query(`
      SELECT email, email_verified FROM users WHERE id = $1
    `, [userId]);

    if (!user.rows[0]) {
      return { success: false, error: 'User not found' };
    }

    if (user.rows[0].email_verified) {
      return { success: false, error: 'Email already verified' };
    }

    // Check rate limit (max 3 per hour)
    const recentAttempts = await db.query(`
      SELECT COUNT(*) as count FROM email_verifications
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
    `, [userId]);

    if (parseInt(recentAttempts.rows[0].count) >= 3) {
      return { success: false, error: 'Too many verification attempts. Try again later.' };
    }

    const tokenData = await this.generateVerificationToken(userId, user.rows[0].email, tenantId);

    return {
      success: true,
      token: tokenData.token,
      email: user.rows[0].email,
      expiresAt: tokenData.expiresAt
    };
  }

  // ===========================================
  // LOGIN ATTEMPT TRACKING
  // ===========================================

  /**
   * Record login attempt
   */
  async recordLoginAttempt(data) {
    const {
      email,
      ipAddress,
      userAgent,
      success,
      failureReason,
      userId,
      tenantId
    } = data;

    await db.query(`
      INSERT INTO login_attempts (
        email, ip_address, user_agent, success, failure_reason, user_id, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [email, ipAddress, userAgent, success, failureReason, userId, tenantId]);

    // Check for account lockout
    if (!success) {
      await this.checkAndLockAccount(email, ipAddress);
    }
  }

  /**
   * Check if account should be locked
   */
  async checkAndLockAccount(email, ipAddress) {
    // Count recent failed attempts
    const failedAttempts = await db.query(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE email = $1
        AND success = false
        AND created_at > NOW() - INTERVAL '30 minutes'
    `, [email]);

    const attemptCount = parseInt(failedAttempts.rows[0].count);

    if (attemptCount >= this.maxLoginAttempts) {
      // Check if already locked
      const existingLock = await db.query(`
        SELECT id FROM account_lockouts
        WHERE email = $1 AND locked_until > NOW()
      `, [email]);

      if (existingLock.rows.length === 0) {
        // Create lockout
        const lockedUntil = new Date(Date.now() + this.lockoutDurationMinutes * 60 * 1000);

        await db.query(`
          INSERT INTO account_lockouts (
            email, ip_address, locked_until, failed_attempts
          ) VALUES ($1, $2, $3, $4)
        `, [email, ipAddress, lockedUntil, attemptCount]);

        await this.logSecurityEvent({
          eventType: 'account_locked',
          eventDetails: { email, attemptCount, lockedUntil },
          ipAddress,
          riskLevel: 'high'
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(email) {
    const result = await db.query(`
      SELECT * FROM account_lockouts
      WHERE email = $1 AND locked_until > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [email]);

    if (result.rows.length > 0) {
      return {
        locked: true,
        lockedUntil: result.rows[0].locked_until,
        reason: result.rows[0].lockout_reason
      };
    }

    return { locked: false };
  }

  /**
   * Unlock account manually
   */
  async unlockAccount(email, unlockedBy) {
    await db.query(`
      UPDATE account_lockouts
      SET unlocked_at = NOW(), unlocked_by = $2
      WHERE email = $1 AND locked_until > NOW()
    `, [email, unlockedBy]);

    await this.logSecurityEvent({
      userId: unlockedBy,
      eventType: 'account_unlocked',
      eventDetails: { email }
    });
  }

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================

  /**
   * Create user session
   */
  async createSession(data) {
    const {
      userId,
      tenantId,
      ipAddress,
      userAgent,
      deviceType,
      deviceName,
      expiresIn = 7 * 24 * 60 * 60 * 1000 // 7 days default
    } = data;

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn);

    const result = await db.query(`
      INSERT INTO user_sessions (
        user_id, tenant_id, session_token, refresh_token,
        ip_address, user_agent, device_type, device_name, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [userId, tenantId, sessionToken, refreshToken, ipAddress, userAgent, deviceType, deviceName, expiresAt]);

    await this.logSecurityEvent({
      tenantId,
      userId,
      eventType: 'session_created',
      eventDetails: { deviceType, deviceName },
      ipAddress,
      userAgent
    });

    return {
      sessionToken,
      refreshToken,
      expiresAt,
      session: result.rows[0]
    };
  }

  /**
   * Validate session
   */
  async validateSession(sessionToken) {
    const result = await db.query(`
      SELECT s.*, u.email, u.name, u.role
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = $1
        AND s.is_active = true
        AND s.expires_at > NOW()
    `, [sessionToken]);

    if (result.rows.length === 0) {
      return null;
    }

    // Update last activity
    await db.query(`
      UPDATE user_sessions
      SET last_activity = NOW()
      WHERE session_token = $1
    `, [sessionToken]);

    return result.rows[0];
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionToken, reason = 'logout') {
    const result = await db.query(`
      UPDATE user_sessions
      SET is_active = false, revoked_at = NOW(), revoked_reason = $2
      WHERE session_token = $1
      RETURNING *
    `, [sessionToken, reason]);

    if (result.rows[0]) {
      await this.logSecurityEvent({
        tenantId: result.rows[0].tenant_id,
        userId: result.rows[0].user_id,
        eventType: 'session_revoked',
        eventDetails: { reason }
      });
    }
  }

  /**
   * Revoke all user sessions
   */
  async revokeAllUserSessions(userId, reason = 'security_reset') {
    await db.query(`
      UPDATE user_sessions
      SET is_active = false, revoked_at = NOW(), revoked_reason = $2
      WHERE user_id = $1 AND is_active = true
    `, [userId, reason]);

    await this.logSecurityEvent({
      userId,
      eventType: 'all_sessions_revoked',
      eventDetails: { reason },
      riskLevel: 'medium'
    });
  }

  /**
   * List user sessions
   */
  async listUserSessions(userId) {
    const result = await db.query(`
      SELECT
        id, ip_address, user_agent, device_type, device_name,
        last_activity, expires_at, is_active, created_at
      FROM user_sessions
      WHERE user_id = $1
      ORDER BY last_activity DESC
    `, [userId]);

    return result.rows;
  }

  // ===========================================
  // PASSWORD HISTORY
  // ===========================================

  /**
   * Check if password was recently used
   */
  async wasPasswordRecentlyUsed(userId, passwordHash) {
    const result = await db.query(`
      SELECT password_hash FROM password_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, this.passwordHistoryCount]);

    for (const row of result.rows) {
      // Note: In production, you'd use bcrypt.compare here
      if (row.password_hash === passwordHash) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add password to history
   */
  async addPasswordToHistory(userId, passwordHash) {
    await db.query(`
      INSERT INTO password_history (user_id, password_hash)
      VALUES ($1, $2)
    `, [userId, passwordHash]);

    // Clean up old entries
    await db.query(`
      DELETE FROM password_history
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM password_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        )
    `, [userId, this.passwordHistoryCount]);
  }

  // ===========================================
  // SECURITY AUDIT LOG
  // ===========================================

  /**
   * Log security event
   */
  async logSecurityEvent(data) {
    const {
      tenantId,
      userId,
      eventType,
      eventDetails = {},
      ipAddress,
      userAgent,
      countryCode,
      city,
      riskLevel = 'low',
      isSuspicious = false
    } = data;

    try {
      await db.query(`
        INSERT INTO security_audit_log (
          tenant_id, user_id, event_type, event_details,
          ip_address, user_agent, country_code, city,
          risk_level, is_suspicious
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        tenantId, userId, eventType, JSON.stringify(eventDetails),
        ipAddress, userAgent, countryCode, city,
        riskLevel, isSuspicious
      ]);
    } catch (error) {
      console.error('[Security] Failed to log security event:', error);
    }
  }

  /**
   * Get security audit log
   */
  async getSecurityAuditLog(options = {}) {
    const {
      tenantId,
      userId,
      eventType,
      riskLevel,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereConditions.push(`tenant_id = $${paramIndex++}`);
      params.push(tenantId);
    }
    if (userId) {
      whereConditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }
    if (eventType) {
      whereConditions.push(`event_type = $${paramIndex++}`);
      params.push(eventType);
    }
    if (riskLevel) {
      whereConditions.push(`risk_level = $${paramIndex++}`);
      params.push(riskLevel);
    }
    if (startDate) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await db.query(`
      SELECT * FROM security_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM security_audit_log ${whereClause}
    `, params);

    return {
      events: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }

  /**
   * Get suspicious activity summary
   */
  async getSuspiciousActivitySummary(tenantId = null, days = 7) {
    const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
    const params = tenantId ? [days, tenantId] : [days];

    const result = await db.query(`
      SELECT
        event_type,
        risk_level,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM security_audit_log
      WHERE created_at > NOW() - INTERVAL '$1 days'
        AND (risk_level IN ('high', 'critical') OR is_suspicious = true)
        ${tenantFilter}
      GROUP BY event_type, risk_level
      ORDER BY count DESC
    `, params);

    return result.rows;
  }
}

export default new SecurityService();
