import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
      // Get user with password hash
      const result = await query(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.first_name, u.last_name,
                u.phone, u.role, u.status, u.last_login_at,
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

      console.log(`[Auth] User logged in: ${email}`);

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
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: this.jwtExpiresIn,
        },
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
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
}

export default new AuthService();
