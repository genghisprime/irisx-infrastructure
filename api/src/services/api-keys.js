/**
 * API Keys Service
 * Handles API key generation, validation, and management
 * Created: Week 19 - Voice Testing (Missing Endpoint)
 */

import crypto from 'crypto';
import pool from '../db/connection.js';

/**
 * Generate a new API key
 * Format: irisx_live_<32_hex_chars> or irisx_test_<32_hex_chars>
 */
export function generateApiKey(mode = 'live') {
  const prefix = mode === 'test' ? 'irisx_test_' : 'irisx_live_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix + randomBytes;
}

/**
 * Hash an API key for storage
 * Uses SHA-256
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Create a new API key
 */
export async function createApiKey(tenantId, name, description = null) {
  const apiKey = generateApiKey('live');
  const hashedKey = hashApiKey(apiKey);
  const keyPrefix = apiKey.substring(0, 20); // Store first 20 chars for display

  const result = await pool.query(
    `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, name, description, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW())
     RETURNING id, tenant_id, key_prefix, name, description, is_active, created_at, last_used_at`,
    [tenantId, hashedKey, keyPrefix, name, description]
  );

  return {
    ...result.rows[0],
    key_full: apiKey, // Only returned on creation
  };
}

/**
 * Get all API keys for a tenant
 */
export async function getApiKeys(tenantId) {
  const result = await pool.query(
    `SELECT id, tenant_id, key_prefix, name, description, is_active, created_at, last_used_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );

  return result.rows.map(row => ({
    ...row,
    key_masked: row.key_prefix + '••••••••••••••••••••••••••••••••••••••••',
  }));
}

/**
 * Revoke (deactivate) an API key
 */
export async function revokeApiKey(tenantId, keyId) {
  const result = await pool.query(
    `UPDATE api_keys
     SET is_active = false
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [keyId, tenantId]
  );

  return result.rows.length > 0;
}

/**
 * Validate an API key (used by middleware)
 */
export async function validateApiKey(apiKey) {
  const hashedKey = hashApiKey(apiKey);

  const result = await pool.query(
    `SELECT id, tenant_id, is_active
     FROM api_keys
     WHERE key_hash = $1 AND is_active = true`,
    [hashedKey]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const key = result.rows[0];

  // Update last_used_at timestamp (async, don't wait)
  pool.query(
    `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
    [key.id]
  ).catch(err => console.error('Failed to update API key last_used_at:', err));

  return {
    id: key.id,
    tenant_id: key.tenant_id,
  };
}
