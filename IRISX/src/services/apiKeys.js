/**
 * API Key Management Service
 * Enhanced API key generation, validation, and management
 */

import crypto from 'crypto';
import { query } from '../db/index.js';

class ApiKeysService {
  /**
   * Generate a new API key
   */
  generateApiKey(prefix = 'sk') {
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  /**
   * Hash an API key for storage
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Create a new API key
   */
  async createApiKey(keyData) {
    const {
      tenant_id,
      user_id,
      created_by,
      key_name,
      key_prefix = 'sk',
      scopes = ['read'],
      allowed_endpoints = ['*'],
      ip_whitelist = [],
      rate_limit_tier = 'standard',
      custom_rate_limit,
      is_test_mode = false,
      expires_at,
      description,
      metadata = {}
    } = keyData;

    // Generate API key
    const apiKey = this.generateApiKey(key_prefix);
    const keyHash = this.hashApiKey(apiKey);
    const keyHint = apiKey.slice(-4);

    const sql = `
      INSERT INTO api_keys_enhanced (
        tenant_id, user_id, created_by, key_name, key_prefix, key_hash, key_hint,
        scopes, allowed_endpoints, ip_whitelist, rate_limit_tier, custom_rate_limit,
        is_test_mode, expires_at, description, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, uuid, key_name, key_prefix, key_hint, scopes, created_at
    `;

    const result = await query(sql, [
      tenant_id, user_id, created_by, key_name, key_prefix, keyHash, keyHint,
      scopes, allowed_endpoints, ip_whitelist, rate_limit_tier, custom_rate_limit,
      is_test_mode, expires_at, description, JSON.stringify(metadata)
    ]);

    // Return key details including the actual key (only shown once)
    return {
      ...result.rows[0],
      api_key: apiKey,  // Only returned on creation
      warning: 'Save this API key securely. It will not be shown again.'
    };
  }

  /**
   * Validate an API key
   */
  async validateApiKey(apiKey, ip_address = null) {
    const keyHash = this.hashApiKey(apiKey);

    const validationSql = `SELECT * FROM validate_api_key($1)`;
    const result = await query(validationSql, [keyHash]);
    const validation = result.rows[0];

    if (!validation.is_valid) {
      return {
        valid: false,
        reason: validation.reason
      };
    }

    // Get full key details
    const keySql = `SELECT * FROM api_keys_enhanced WHERE key_hash = $1`;
    const keyResult = await query(keySql, [keyHash]);
    const keyDetails = keyResult.rows[0];

    // Check IP whitelist
    if (keyDetails.ip_whitelist && keyDetails.ip_whitelist.length > 0 && ip_address) {
      const ipAllowed = keyDetails.ip_whitelist.some(allowedIp =>
        ip_address === allowedIp || ip_address.startsWith(allowedIp.split('/')[0])
      );

      if (!ipAllowed) {
        return {
          valid: false,
          reason: 'ip_not_whitelisted'
        };
      }
    }

    // Update usage stats
    await this.updateUsageStats(keyHash, ip_address);

    return {
      valid: true,
      api_key_id: keyDetails.id,
      tenant_id: keyDetails.tenant_id,
      user_id: keyDetails.user_id,
      scopes: keyDetails.scopes,
      allowed_endpoints: keyDetails.allowed_endpoints,
      is_test_mode: keyDetails.is_test_mode,
      rate_limit_tier: keyDetails.rate_limit_tier,
      custom_rate_limit: keyDetails.custom_rate_limit
    };
  }

  /**
   * Update API key usage statistics
   */
  async updateUsageStats(keyHash, ipAddress) {
    const sql = `SELECT update_api_key_usage_stats($1, $2)`;
    await query(sql, [keyHash, ipAddress]);
  }

  /**
   * Log API key usage
   */
  async logUsage(usageData) {
    const {
      api_key_id,
      tenant_id,
      endpoint,
      http_method,
      status_code,
      response_time_ms,
      ip_address,
      user_agent,
      referer,
      success = true,
      error_message,
      request_id,
      metadata
    } = usageData;

    const sql = `
      INSERT INTO api_key_usage (
        api_key_id, tenant_id, endpoint, http_method, status_code, response_time_ms,
        ip_address, user_agent, referer, success, error_message, request_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await query(sql, [
      api_key_id, tenant_id, endpoint, http_method, status_code, response_time_ms,
      ip_address, user_agent, referer, success, error_message, request_id,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  }

  /**
   * List API keys for a tenant
   */
  async listApiKeys(tenantId, includeRevoked = false) {
    let sql = `SELECT * FROM api_keys_summary WHERE tenant_id = $1`;

    if (!includeRevoked) {
      sql += ` AND status != 'revoked'`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  /**
   * Get API key by ID
   */
  async getApiKey(keyId, tenantId) {
    const sql = `
      SELECT * FROM api_keys_enhanced
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await query(sql, [keyId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('API key not found');
    }

    return result.rows[0];
  }

  /**
   * Update API key
   */
  async updateApiKey(keyId, tenantId, updates) {
    const allowedFields = [
      'key_name', 'scopes', 'allowed_endpoints', 'ip_whitelist',
      'rate_limit_tier', 'custom_rate_limit', 'is_active', 'expires_at', 'description'
    ];

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(keyId, tenantId);
    const sql = `
      UPDATE api_keys_enhanced
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('API key not found');
    }

    return result.rows[0];
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId, tenantId, revokedBy, reason) {
    const sql = `
      UPDATE api_keys_enhanced
      SET revoked_at = NOW(),
          revoked_by = $1,
          revocation_reason = $2,
          is_active = FALSE
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;

    const result = await query(sql, [revokedBy, reason, keyId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('API key not found');
    }

    return result.rows[0];
  }

  /**
   * Rotate an API key
   */
  async rotateApiKey(oldKeyId, tenantId, initiatedBy, reason, gracePeriodHours = 24) {
    // Get old key details
    const oldKey = await this.getApiKey(oldKeyId, tenantId);

    // Create new key with same configuration
    const newKeyData = await this.createApiKey({
      tenant_id: tenantId,
      user_id: oldKey.user_id,
      created_by: initiatedBy,
      key_name: oldKey.key_name + ' (rotated)',
      key_prefix: oldKey.key_prefix,
      scopes: oldKey.scopes,
      allowed_endpoints: oldKey.allowed_endpoints,
      ip_whitelist: oldKey.ip_whitelist,
      rate_limit_tier: oldKey.rate_limit_tier,
      custom_rate_limit: oldKey.custom_rate_limit,
      is_test_mode: oldKey.is_test_mode,
      description: oldKey.description
    });

    // Record rotation
    const gracePeriodEnds = new Date();
    gracePeriodEnds.setHours(gracePeriodEnds.getHours() + gracePeriodHours);

    const rotationSql = `
      INSERT INTO api_key_rotations (
        old_key_id, new_key_id, tenant_id, rotation_reason, initiated_by, grace_period_ends_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const rotation = await query(rotationSql, [
      oldKeyId, newKeyData.id, tenantId, reason, initiatedBy, gracePeriodEnds
    ]);

    return {
      old_key: oldKey,
      new_key: newKeyData,
      rotation: rotation.rows[0],
      grace_period_ends_at: gracePeriodEnds
    };
  }

  /**
   * Get API key usage statistics
   */
  async getUsageStats(keyId, tenantId, since = null, limit = 100) {
    let sql = `
      SELECT * FROM api_key_usage
      WHERE api_key_id = $1 AND tenant_id = $2
    `;
    const params = [keyId, tenantId];

    if (since) {
      sql += ` AND requested_at >= $3`;
      params.push(since);
    }

    sql += ` ORDER BY requested_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get API keys expiring soon
   */
  async getExpiringKeys(days = 30) {
    const sql = `SELECT * FROM api_keys_expiring_soon WHERE days_until_expiry <= $1`;
    const result = await query(sql, [days]);
    return result.rows;
  }

  /**
   * Get available scopes
   */
  async getAvailableScopes() {
    const sql = `SELECT * FROM api_key_scopes WHERE is_active = TRUE ORDER BY scope_category, scope_name`;
    const result = await query(sql);
    return result.rows;
  }
}

export default new ApiKeysService();
