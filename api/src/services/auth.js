import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { query } from '../db/connection.js';

/**
 * Authentication Service
 * Handles user authentication, JWT generation, password hashing
 */
class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
    this.bcryptRounds = 10;
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, this.bcryptRounds);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    });
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiresIn,
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Register new tenant with admin user
   */
  async register({ companyName, email, password, firstName, lastName, phone }) {
    try {
      // Check if email already exists
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);

      // Start transaction
      await query('BEGIN');

      // Create tenant with slug (convert company name to URL-friendly slug)
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const tenantResult = await query(
        `INSERT INTO tenants (name, slug, status, plan)
         VALUES ($1, $2, 'active', 'trial')
         RETURNING id, name, slug, status, plan, created_at`,
        [companyName, slug]
      );

      const tenant = tenantResult.rows[0];

      // Create admin user
      const userResult = await query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, phone, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'active')
         RETURNING id, tenant_id, email, first_name, last_name, phone, role, status, created_at`,
        [tenant.id, email, passwordHash, firstName, lastName, phone]
      );

      const user = userResult.rows[0];

      // Commit transaction
      await query('COMMIT');

      // Generate tokens
      const accessToken = this.generateAccessToken({
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = this.generateRefreshToken({
        userId: user.id,
        tenantId: user.tenant_id,
      });

      // Store refresh token
      await this.storeRefreshToken(user.id, refreshToken);

      console.log(`[Auth] User registered: ${email} (tenant: ${tenant.name})`);

      return {
        user: {
          id: user.id,
          tenant_id: user.tenant_id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          plan: tenant.plan,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: this.jwtExpiresIn,
        },
      };
    } catch (error) {
      await query('ROLLBACK');
      console.error('[Auth] Registration error:', error);
      throw error;
    }
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      // Get user with password hash and 2FA status
      const result = await query(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.first_name, u.last_name,
                u.phone, u.role, u.status, u.last_login_at,
                u.two_factor_enabled, u.two_factor_secret,
                t.name as tenant_name, t.status as tenant_status
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE u.email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Check if user is active
      if (user.status !== 'active') {
        throw new Error('User account is inactive');
      }

      // Check if tenant is active
      if (user.tenant_status !== 'active') {
        throw new Error('Tenant account is inactive');
      }

      // Verify password
      const isValidPassword = await this.comparePassword(password, user.password_hash);

      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Check if 2FA is enabled
      if (user.two_factor_enabled) {
        // Generate a pending 2FA token (valid for 5 minutes)
        const pendingToken = this.generate2FAPendingToken(user);

        console.log(`[Auth] 2FA required for user: ${email}`);

        return {
          requires_2fa: true,
          pending_token: pendingToken,
          message: 'Please provide your 2FA code to complete login',
        };
      }

      // No 2FA - proceed with full login
      return this.completeLogin(user);
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  }

  /**
   * Generate 2FA pending token (short-lived)
   */
  generate2FAPendingToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        pending_2fa: true,
      },
      this.jwtSecret,
      { expiresIn: '5m' }
    );
  }

  /**
   * Complete login after password (and optionally 2FA) verification
   */
  async completeLogin(user) {
    // Generate tokens
    const accessToken = this.generateAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.generateRefreshToken({
      userId: user.id,
      tenantId: user.tenant_id,
    });

    // Store refresh token
    await this.storeRefreshToken(user.id, refreshToken);

    // Update last login
    await query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    console.log(`[Auth] User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        tenant_name: user.tenant_name,
        two_factor_enabled: user.two_factor_enabled || false,
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: this.jwtExpiresIn,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyToken(refreshToken);

      // Check if refresh token exists in database
      const result = await query(
        `SELECT user_id FROM refresh_tokens
         WHERE token = $1 AND user_id = $2 AND revoked = false AND expires_at > NOW()`,
        [refreshToken, decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid or expired refresh token');
      }

      // Get user data
      const userResult = await query(
        `SELECT id, tenant_id, email, role, status FROM users WHERE id = $1`,
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      if (user.status !== 'active') {
        throw new Error('User account is inactive');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken({
        userId: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role,
      });

      console.log(`[Auth] Token refreshed for user: ${user.email}`);

      return {
        access_token: accessToken,
        expires_in: this.jwtExpiresIn,
      };
    } catch (error) {
      console.error('[Auth] Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(userId, refreshToken) {
    try {
      await query(
        `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND token = $2`,
        [userId, refreshToken]
      );

      console.log(`[Auth] User logged out: ${userId}`);
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      throw error;
    }
  }

  /**
   * Store refresh token in database
   */
  async storeRefreshToken(userId, token) {
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, token) DO NOTHING`,
      [userId, token, expiresAt]
    );
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(email) {
    try {
      // Check if user exists
      const result = await query(
        'SELECT id, first_name FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        // Don't reveal if email exists
        console.log(`[Auth] Password reset requested for non-existent email: ${email}`);
        return { success: true };
      }

      const user = result.rows[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      // Store reset token
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, resetTokenHash, expiresAt]
      );

      console.log(`[Auth] Password reset token generated for: ${email}`);

      // In production, send email here
      // For now, return token (DO NOT do this in production!)
      return {
        success: true,
        reset_token: resetToken, // Only for development
        user_id: user.id,
      };
    } catch (error) {
      console.error('[Auth] Password reset token generation error:', error);
      throw error;
    }
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(resetToken, newPassword) {
    try {
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Find valid reset token
      const result = await query(
        `SELECT user_id FROM password_reset_tokens
         WHERE token_hash = $1 AND expires_at > NOW() AND used = false`,
        [resetTokenHash]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid or expired reset token');
      }

      const userId = result.rows[0].user_id;

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update password
      await query('BEGIN');

      await query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      // Mark reset token as used
      await query(
        'UPDATE password_reset_tokens SET used = true WHERE token_hash = $1',
        [resetTokenHash]
      );

      // Revoke all refresh tokens for security
      await query(
        'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
        [userId]
      );

      await query('COMMIT');

      console.log(`[Auth] Password reset successful for user: ${userId}`);

      return { success: true };
    } catch (error) {
      await query('ROLLBACK');
      console.error('[Auth] Password reset error:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const result = await query(
      `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, u.phone,
              u.role, u.status, u.created_at, u.last_login_at,
              t.name as tenant_name, t.status as tenant_status, t.plan
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    return {
      id: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        status: user.tenant_status,
        plan: user.plan,
      },
    };
  }

  /**
   * Change user password (authenticated user)
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get current password hash
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      // Verify current password
      const isValidPassword = await this.comparePassword(currentPassword, user.password_hash);

      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const passwordHash = await this.hashPassword(newPassword);

      // Update password
      await query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      console.log(`[Auth] Password changed for user: ${userId}`);

      return { success: true };
    } catch (error) {
      console.error('[Auth] Password change error:', error);
      throw error;
    }
  }

  // =====================================================
  // TWO-FACTOR AUTHENTICATION (2FA) METHODS
  // =====================================================

  /**
   * Setup 2FA - Generate secret and return QR code URL
   */
  async setup2FA(userId) {
    try {
      // Check if 2FA is already enabled
      const checkResult = await query(
        `SELECT email, two_factor_enabled FROM users WHERE id = $1`,
        [userId]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = checkResult.rows[0];

      if (user.two_factor_enabled) {
        throw new Error('2FA is already enabled. Disable it first to set up again.');
      }

      // Generate a new TOTP secret
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(user.email, 'IRISX', secret);

      // Store the secret temporarily (not enabled yet until verified)
      await query(
        `UPDATE users
         SET two_factor_secret = $1, updated_at = NOW()
         WHERE id = $2`,
        [secret, userId]
      );

      console.log(`[Auth] 2FA setup started for user: ${userId}`);

      return {
        secret,
        otpauth_url: otpauth,
        message: 'Scan this QR code with your authenticator app, then verify with a code to enable 2FA',
      };
    } catch (error) {
      console.error('[Auth] 2FA setup error:', error);
      throw error;
    }
  }

  /**
   * Enable 2FA - Verify code and enable
   */
  async enable2FA(userId, totpCode) {
    try {
      // Get the user's secret
      const result = await query(
        `SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      if (!user.two_factor_secret) {
        throw new Error('No 2FA secret found. Call setup first.');
      }

      if (user.two_factor_enabled) {
        throw new Error('2FA is already enabled');
      }

      // Verify the TOTP code
      const isValid = authenticator.verify({
        token: totpCode,
        secret: user.two_factor_secret,
      });

      if (!isValid) {
        throw new Error('Invalid 2FA code. Please try again.');
      }

      // Enable 2FA
      await query(
        `UPDATE users
         SET two_factor_enabled = true, updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      console.log(`[Auth] 2FA enabled for user: ${userId}`);

      return {
        success: true,
        message: '2FA has been enabled successfully',
      };
    } catch (error) {
      console.error('[Auth] 2FA enable error:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA - Requires password and current 2FA code
   */
  async disable2FA(userId, password, totpCode) {
    try {
      // Get user with password hash and 2FA info
      const result = await query(
        `SELECT password_hash, two_factor_secret, two_factor_enabled
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      if (!user.two_factor_enabled) {
        throw new Error('2FA is not enabled');
      }

      // Verify password
      const validPassword = await this.comparePassword(password, user.password_hash);
      if (!validPassword) {
        throw new Error('Invalid password');
      }

      // Verify the 2FA code
      const isValid = authenticator.verify({
        token: totpCode,
        secret: user.two_factor_secret,
      });

      if (!isValid) {
        throw new Error('Invalid 2FA code');
      }

      // Disable 2FA
      await query(
        `UPDATE users
         SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW()
         WHERE id = $1`,
        [userId]
      );

      console.log(`[Auth] 2FA disabled for user: ${userId}`);

      return {
        success: true,
        message: '2FA has been disabled successfully',
      };
    } catch (error) {
      console.error('[Auth] 2FA disable error:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code and complete login
   */
  async verify2FALogin(pendingToken, totpCode) {
    try {
      // Verify the pending token
      let decoded;
      try {
        decoded = this.verifyToken(pendingToken);
      } catch (err) {
        if (err.message === 'Token expired') {
          throw new Error('2FA verification window expired. Please login again.');
        }
        throw new Error('Invalid pending token');
      }

      // Ensure this is a pending 2FA token
      if (!decoded.pending_2fa) {
        throw new Error('Invalid token type');
      }

      // Get the user with their 2FA secret
      const result = await query(
        `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name,
                u.phone, u.role, u.status, u.two_factor_secret, u.two_factor_enabled,
                t.name as tenant_name, t.status as tenant_status
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = $1 AND u.two_factor_enabled = true`,
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found or 2FA not enabled');
      }

      const user = result.rows[0];

      if (user.status !== 'active') {
        throw new Error('User account is inactive');
      }

      if (user.tenant_status !== 'active') {
        throw new Error('Tenant account is inactive');
      }

      // Verify the TOTP code
      const isValid = authenticator.verify({
        token: totpCode,
        secret: user.two_factor_secret,
      });

      if (!isValid) {
        throw new Error('Invalid 2FA code');
      }

      // 2FA verified - complete login
      console.log(`[Auth] 2FA verified for user: ${user.email}`);

      return this.completeLogin(user);
    } catch (error) {
      console.error('[Auth] 2FA verification error:', error);
      throw error;
    }
  }

  /**
   * Get 2FA status for a user
   */
  async get2FAStatus(userId) {
    const result = await query(
      `SELECT two_factor_enabled FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return {
      enabled: result.rows[0].two_factor_enabled || false,
    };
  }
}

export default new AuthService();
