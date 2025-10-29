/**
 * Tenants Service
 * Manages tenant accounts, settings, and subscriptions
 */

import { query } from '../db/index.js';
import crypto from 'crypto';

class TenantsService {
  /**
   * Create new tenant
   */
  async createTenant(tenantData) {
    const {
      name,
      slug,
      email,
      plan = 'starter',
      status = 'active'
    } = tenantData;

    // Generate API key
    const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    const sql = `
      INSERT INTO tenants (name, slug, email, plan, status, api_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await query(sql, [name, slug, email, plan, status, apiKey]);
    return result.rows[0];
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId) {
    const sql = `SELECT * FROM tenants WHERE id = $1`;
    const result = await query(sql, [tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.rows[0];
  }

  /**
   * List all tenants
   */
  async listTenants(filters = {}) {
    const { status, plan, limit = 50, offset = 0 } = filters;

    let sql = `SELECT * FROM tenants WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (plan) {
      sql += ` AND plan = $${paramIndex}`;
      params.push(plan);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countSql = `SELECT COUNT(*) FROM tenants`;
    const countResult = await query(countSql);

    return {
      tenants: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId, updates) {
    const {
      name,
      email,
      plan,
      status,
      max_concurrent_calls,
      max_phone_numbers
    } = updates;

    const updateFields = [];
    const values = [tenantId];
    let paramIndex = 2;

    if (name) {
      updateFields.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (email) {
      updateFields.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }

    if (plan) {
      updateFields.push(`plan = $${paramIndex}`);
      values.push(plan);
      paramIndex++;
    }

    if (status) {
      updateFields.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (max_concurrent_calls !== undefined) {
      updateFields.push(`max_concurrent_calls = $${paramIndex}`);
      values.push(max_concurrent_calls);
      paramIndex++;
    }

    if (max_phone_numbers !== undefined) {
      updateFields.push(`max_phone_numbers = $${paramIndex}`);
      values.push(max_phone_numbers);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE tenants
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.rows[0];
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(tenantId) {
    const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    const sql = `
      UPDATE tenants
      SET api_key = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [tenantId, apiKey]);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.rows[0];
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as user_count,
        (SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1 AND status = 'active') as phone_number_count,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days') as calls_last_30_days,
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days') as sms_last_30_days,
        (SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1) as campaign_count,
        (SELECT COUNT(*) FROM contacts WHERE tenant_id = $1) as contact_count
    `;

    const result = await query(sql, [tenantId]);
    return result.rows[0];
  }

  /**
   * Delete tenant (soft delete)
   */
  async deleteTenant(tenantId) {
    const sql = `
      UPDATE tenants
      SET status = 'deleted', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.rows[0];
  }
}

export default new TenantsService();
