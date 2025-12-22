/**
 * Password Policy Service
 *
 * Enterprise password policies with complexity requirements,
 * history tracking, expiration, and security features
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Common passwords list (subset - would be larger in production)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'abc123', 'monkey', 'master', 'dragon', 'letmein', 'login',
  'admin', 'welcome', 'iloveyou', 'princess', 'sunshine', 'football',
  'baseball', 'passw0rd', 'shadow', 'superman', 'trustno1', 'hello',
  'charlie', 'donald', 'password1!', 'Password1', 'Password123',
  'Qwerty123', 'Admin123', 'Welcome1', 'P@ssw0rd', 'P@ssword1'
]);

// Default policy
const DEFAULT_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  preventCommonPasswords: true,
  preventUsernameInPassword: true,
  passwordHistoryCount: 5,
  maxAgeDays: 90,
  minAgeDays: 1,
  lockoutThreshold: 5,
  lockoutDurationMinutes: 30,
  requireMfa: false,
  sessionTimeoutMinutes: 480
};

/**
 * Password Policy Service
 */
class PasswordPolicyService {
  constructor() {
    this.policyCache = new Map();
  }

  // ============================================
  // Policy Management
  // ============================================

  /**
   * Get password policy for tenant
   */
  async getPolicy(tenantId) {
    // Check cache
    if (this.policyCache.has(tenantId)) {
      return this.policyCache.get(tenantId);
    }

    const result = await query(
      'SELECT * FROM password_policies WHERE tenant_id = $1',
      [tenantId]
    );

    const policy = result.rows[0] || { ...DEFAULT_POLICY, tenant_id: tenantId };

    // Normalize field names
    const normalizedPolicy = {
      tenantId: policy.tenant_id,
      minLength: policy.min_length ?? DEFAULT_POLICY.minLength,
      maxLength: policy.max_length ?? DEFAULT_POLICY.maxLength,
      requireUppercase: policy.require_uppercase ?? DEFAULT_POLICY.requireUppercase,
      requireLowercase: policy.require_lowercase ?? DEFAULT_POLICY.requireLowercase,
      requireNumbers: policy.require_numbers ?? DEFAULT_POLICY.requireNumbers,
      requireSpecialChars: policy.require_special_chars ?? DEFAULT_POLICY.requireSpecialChars,
      specialChars: policy.special_chars ?? DEFAULT_POLICY.specialChars,
      preventCommonPasswords: policy.prevent_common_passwords ?? DEFAULT_POLICY.preventCommonPasswords,
      preventUsernameInPassword: policy.prevent_username_in_password ?? DEFAULT_POLICY.preventUsernameInPassword,
      passwordHistoryCount: policy.password_history_count ?? DEFAULT_POLICY.passwordHistoryCount,
      maxAgeDays: policy.max_age_days ?? DEFAULT_POLICY.maxAgeDays,
      minAgeDays: policy.min_age_days ?? DEFAULT_POLICY.minAgeDays,
      lockoutThreshold: policy.lockout_threshold ?? DEFAULT_POLICY.lockoutThreshold,
      lockoutDurationMinutes: policy.lockout_duration_minutes ?? DEFAULT_POLICY.lockoutDurationMinutes,
      requireMfa: policy.require_mfa ?? DEFAULT_POLICY.requireMfa,
      sessionTimeoutMinutes: policy.session_timeout_minutes ?? DEFAULT_POLICY.sessionTimeoutMinutes
    };

    // Cache for 5 minutes
    this.policyCache.set(tenantId, normalizedPolicy);
    setTimeout(() => this.policyCache.delete(tenantId), 300000);

    return normalizedPolicy;
  }

  /**
   * Create or update password policy
   */
  async upsertPolicy(tenantId, policyData) {
    const {
      minLength,
      maxLength,
      requireUppercase,
      requireLowercase,
      requireNumbers,
      requireSpecialChars,
      specialChars,
      preventCommonPasswords,
      preventUsernameInPassword,
      passwordHistoryCount,
      maxAgeDays,
      minAgeDays,
      lockoutThreshold,
      lockoutDurationMinutes,
      requireMfa,
      sessionTimeoutMinutes
    } = policyData;

    const result = await query(`
      INSERT INTO password_policies (
        tenant_id, min_length, max_length, require_uppercase, require_lowercase,
        require_numbers, require_special_chars, special_chars,
        prevent_common_passwords, prevent_username_in_password,
        password_history_count, max_age_days, min_age_days,
        lockout_threshold, lockout_duration_minutes, require_mfa,
        session_timeout_minutes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        min_length = COALESCE($2, password_policies.min_length),
        max_length = COALESCE($3, password_policies.max_length),
        require_uppercase = COALESCE($4, password_policies.require_uppercase),
        require_lowercase = COALESCE($5, password_policies.require_lowercase),
        require_numbers = COALESCE($6, password_policies.require_numbers),
        require_special_chars = COALESCE($7, password_policies.require_special_chars),
        special_chars = COALESCE($8, password_policies.special_chars),
        prevent_common_passwords = COALESCE($9, password_policies.prevent_common_passwords),
        prevent_username_in_password = COALESCE($10, password_policies.prevent_username_in_password),
        password_history_count = COALESCE($11, password_policies.password_history_count),
        max_age_days = COALESCE($12, password_policies.max_age_days),
        min_age_days = COALESCE($13, password_policies.min_age_days),
        lockout_threshold = COALESCE($14, password_policies.lockout_threshold),
        lockout_duration_minutes = COALESCE($15, password_policies.lockout_duration_minutes),
        require_mfa = COALESCE($16, password_policies.require_mfa),
        session_timeout_minutes = COALESCE($17, password_policies.session_timeout_minutes),
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId, minLength, maxLength, requireUppercase, requireLowercase,
      requireNumbers, requireSpecialChars, specialChars,
      preventCommonPasswords, preventUsernameInPassword,
      passwordHistoryCount, maxAgeDays, minAgeDays,
      lockoutThreshold, lockoutDurationMinutes, requireMfa,
      sessionTimeoutMinutes
    ]);

    // Clear cache
    this.policyCache.delete(tenantId);

    return result.rows[0];
  }

  // ============================================
  // Password Validation
  // ============================================

  /**
   * Validate password against policy
   */
  async validatePassword(tenantId, password, username = null) {
    const policy = await this.getPolicy(tenantId);
    const errors = [];

    // Length check
    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters`);
    }

    if (password.length > policy.maxLength) {
      errors.push(`Password must be at most ${policy.maxLength} characters`);
    }

    // Uppercase check
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Lowercase check
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Number check
    if (policy.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Special character check
    if (policy.requireSpecialChars) {
      const specialRegex = new RegExp(`[${this.escapeRegex(policy.specialChars)}]`);
      if (!specialRegex.test(password)) {
        errors.push(`Password must contain at least one special character (${policy.specialChars})`);
      }
    }

    // Common password check
    if (policy.preventCommonPasswords) {
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        errors.push('Password is too common. Please choose a more unique password');
      }
    }

    // Username in password check
    if (policy.preventUsernameInPassword && username) {
      if (password.toLowerCase().includes(username.toLowerCase())) {
        errors.push('Password cannot contain your username');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      strength: this.calculateStrength(password, policy)
    };
  }

  /**
   * Check password against history
   */
  async checkPasswordHistory(userId, tenantId, newPasswordHash) {
    const policy = await this.getPolicy(tenantId);

    if (policy.passwordHistoryCount === 0) {
      return { allowed: true };
    }

    const result = await query(`
      SELECT password_hash FROM password_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, policy.passwordHistoryCount]);

    // Check if new password matches any in history
    // Note: In production, this would compare hashes properly
    for (const row of result.rows) {
      if (row.password_hash === newPasswordHash) {
        return {
          allowed: false,
          message: `Cannot reuse any of your last ${policy.passwordHistoryCount} passwords`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record password in history
   */
  async recordPasswordHistory(userId, passwordHash) {
    await query(`
      INSERT INTO password_history (user_id, password_hash, created_at)
      VALUES ($1, $2, NOW())
    `, [userId, passwordHash]);
  }

  /**
   * Check if password is expired
   */
  async isPasswordExpired(userId, tenantId) {
    const policy = await this.getPolicy(tenantId);

    if (!policy.maxAgeDays) {
      return { expired: false };
    }

    const result = await query(`
      SELECT password_changed_at FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return { expired: false };
    }

    const passwordChangedAt = result.rows[0].password_changed_at;
    if (!passwordChangedAt) {
      return { expired: true, reason: 'Password has never been changed' };
    }

    const daysSinceChange = Math.floor(
      (Date.now() - new Date(passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceChange >= policy.maxAgeDays) {
      return {
        expired: true,
        reason: `Password expired ${daysSinceChange - policy.maxAgeDays} days ago`,
        daysSinceChange,
        maxAgeDays: policy.maxAgeDays
      };
    }

    return {
      expired: false,
      daysUntilExpiry: policy.maxAgeDays - daysSinceChange
    };
  }

  /**
   * Check if password can be changed (min age)
   */
  async canChangePassword(userId, tenantId) {
    const policy = await this.getPolicy(tenantId);

    if (!policy.minAgeDays) {
      return { allowed: true };
    }

    const result = await query(`
      SELECT password_changed_at FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0 || !result.rows[0].password_changed_at) {
      return { allowed: true };
    }

    const daysSinceChange = Math.floor(
      (Date.now() - new Date(result.rows[0].password_changed_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceChange < policy.minAgeDays) {
      return {
        allowed: false,
        reason: `Password can only be changed after ${policy.minAgeDays} days`,
        daysRemaining: policy.minAgeDays - daysSinceChange
      };
    }

    return { allowed: true };
  }

  // ============================================
  // Password Strength
  // ============================================

  /**
   * Calculate password strength score (0-100)
   */
  calculateStrength(password, policy) {
    let score = 0;
    let maxScore = 0;

    // Length (up to 30 points)
    maxScore += 30;
    const lengthScore = Math.min(30, (password.length / 16) * 30);
    score += lengthScore;

    // Character variety (up to 40 points)
    maxScore += 40;
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;

    // Bonus for mixed case, numbers, and special chars together (up to 20 points)
    maxScore += 20;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    score += varietyCount * 5;

    // Penalty for common patterns (up to -20 points)
    if (/^[a-z]+$/.test(password)) score -= 10;
    if (/^[A-Z]+$/.test(password)) score -= 10;
    if (/^[0-9]+$/.test(password)) score -= 15;
    if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated chars
    if (/^(012|123|234|345|456|567|678|789|890)+$/.test(password)) score -= 15; // Sequential numbers
    if (COMMON_PASSWORDS.has(password.toLowerCase())) score -= 30;

    // Normalize to 0-100
    const normalizedScore = Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));

    let label;
    if (normalizedScore < 25) label = 'weak';
    else if (normalizedScore < 50) label = 'fair';
    else if (normalizedScore < 75) label = 'good';
    else label = 'strong';

    return {
      score: normalizedScore,
      label,
      meetsPolicy: this.meetsMinimumPolicy(password, policy)
    };
  }

  /**
   * Check if password meets minimum policy requirements
   */
  meetsMinimumPolicy(password, policy) {
    if (password.length < policy.minLength) return false;
    if (policy.requireUppercase && !/[A-Z]/.test(password)) return false;
    if (policy.requireLowercase && !/[a-z]/.test(password)) return false;
    if (policy.requireNumbers && !/[0-9]/.test(password)) return false;
    if (policy.requireSpecialChars) {
      const specialRegex = new RegExp(`[${this.escapeRegex(policy.specialChars)}]`);
      if (!specialRegex.test(password)) return false;
    }
    return true;
  }

  /**
   * Generate a policy-compliant random password
   */
  async generatePassword(tenantId) {
    const policy = await this.getPolicy(tenantId);

    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = policy.specialChars;

    let chars = '';
    let password = '';

    // Ensure minimum requirements
    if (policy.requireLowercase) {
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      chars += lowercase;
    }
    if (policy.requireUppercase) {
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      chars += uppercase;
    }
    if (policy.requireNumbers) {
      password += numbers[Math.floor(Math.random() * numbers.length)];
      chars += numbers;
    }
    if (policy.requireSpecialChars) {
      password += special[Math.floor(Math.random() * special.length)];
      chars += special;
    }

    // Fill remaining length with random chars
    const targetLength = Math.max(policy.minLength, 12);
    while (password.length < targetLength) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }

    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    return password;
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear cache for tenant
   */
  clearCache(tenantId) {
    this.policyCache.delete(tenantId);
  }
}

// Singleton instance
const passwordPolicyService = new PasswordPolicyService();

export default passwordPolicyService;
export { DEFAULT_POLICY, COMMON_PASSWORDS };
