/**
 * Phone Numbers Service
 * Manages phone number inventory, purchases, and configuration
 */

import { query } from '../db/index.js';

class PhoneNumbersService {
  /**
   * List tenant's phone numbers
   */
  async listPhoneNumbers(tenantId, filters = {}) {
    const { status = 'active', limit = 50, offset = 0 } = filters;

    let sql = `
      SELECT * FROM phone_numbers_with_stats
      WHERE tenant_id = $1 AND status = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await query(sql, [tenantId, status, limit, offset]);

    const countSql = `SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1 AND status = $2`;
    const countResult = await query(countSql, [tenantId, status]);

    return {
      phone_numbers: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get phone number by ID or number
   */
  async getPhoneNumber(identifier, tenantId) {
    let sql;
    if (typeof identifier === 'number') {
      sql = `SELECT * FROM phone_numbers WHERE id = $1 AND tenant_id = $2`;
    } else {
      sql = `SELECT * FROM phone_numbers WHERE phone_number = $1 AND tenant_id = $2`;
    }

    const result = await query(sql, [identifier, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Phone number not found');
    }

    return result.rows[0];
  }

  /**
   * Search available phone numbers
   */
  async searchAvailableNumbers(filters = {}) {
    const { country_code = 'US', region, city, contains, limit = 20 } = filters;

    let sql = `
      SELECT * FROM phone_number_inventory
      WHERE is_available = TRUE AND country_code = $1
    `;
    const params = [country_code];
    let paramIndex = 2;

    if (region) {
      sql += ` AND region = $${paramIndex}`;
      params.push(region);
      paramIndex++;
    }

    if (city) {
      sql += ` AND city ILIKE $${paramIndex}`;
      params.push(`%${city}%`);
      paramIndex++;
    }

    if (contains) {
      sql += ` AND phone_number LIKE $${paramIndex}`;
      params.push(`%${contains}%`);
      paramIndex++;
    }

    sql += ` ORDER BY city, phone_number LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(sql, params);

    return {
      available_numbers: result.rows,
      count: result.rows.length
    };
  }

  /**
   * Purchase/assign a phone number to tenant
   */
  async purchasePhoneNumber(phoneNumber, tenantId, config = {}) {
    // Check if number is available in inventory
    const inventoryCheck = await query(
      `SELECT * FROM phone_number_inventory WHERE phone_number = $1 AND is_available = TRUE`,
      [phoneNumber]
    );

    if (inventoryCheck.rows.length === 0) {
      throw new Error('Phone number not available for purchase');
    }

    const inventoryNumber = inventoryCheck.rows[0];

    // Insert into phone_numbers and mark as assigned
    const sql = `
      INSERT INTO phone_numbers (
        phone_number, friendly_name, country_code, number_type,
        tenant_id, is_assigned, assigned_at,
        voice_enabled, sms_enabled, mms_enabled,
        provider, provider_number_sid,
        monthly_cost_cents, status,
        voice_url, sms_url
      ) VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), $6, $7, $8, $9, $10, $11, 'active', $12, $13)
      RETURNING *
    `;

    const result = await query(sql, [
      phoneNumber,
      config.friendly_name || inventoryNumber.friendly_name,
      inventoryNumber.country_code,
      'local',
      tenantId,
      inventoryNumber.voice_enabled,
      inventoryNumber.sms_enabled,
      inventoryNumber.mms_enabled,
      inventoryNumber.provider,
      inventoryNumber.provider_number_sid,
      inventoryNumber.monthly_cost_cents,
      config.voice_url || null,
      config.sms_url || null
    ]);

    // Mark as unavailable in inventory
    await query(
      `UPDATE phone_number_inventory SET is_available = FALSE WHERE phone_number = $1`,
      [phoneNumber]
    );

    return result.rows[0];
  }

  /**
   * Update phone number configuration
   */
  async updatePhoneNumber(phoneNumberId, tenantId, updates) {
    const {
      friendly_name,
      voice_url,
      voice_fallback_url,
      sms_url,
      sms_fallback_url,
      status_callback_url,
      ivr_menu_id,
      queue_id
    } = updates;

    const updateFields = [];
    const values = [phoneNumberId, tenantId];
    let paramIndex = 3;

    if (friendly_name !== undefined) {
      updateFields.push(`friendly_name = $${paramIndex}`);
      values.push(friendly_name);
      paramIndex++;
    }

    if (voice_url !== undefined) {
      updateFields.push(`voice_url = $${paramIndex}`);
      values.push(voice_url);
      paramIndex++;
    }

    if (voice_fallback_url !== undefined) {
      updateFields.push(`voice_fallback_url = $${paramIndex}`);
      values.push(voice_fallback_url);
      paramIndex++;
    }

    if (sms_url !== undefined) {
      updateFields.push(`sms_url = $${paramIndex}`);
      values.push(sms_url);
      paramIndex++;
    }

    if (sms_fallback_url !== undefined) {
      updateFields.push(`sms_fallback_url = $${paramIndex}`);
      values.push(sms_fallback_url);
      paramIndex++;
    }

    if (status_callback_url !== undefined) {
      updateFields.push(`status_callback_url = $${paramIndex}`);
      values.push(status_callback_url);
      paramIndex++;
    }

    if (ivr_menu_id !== undefined) {
      updateFields.push(`ivr_menu_id = $${paramIndex}`);
      values.push(ivr_menu_id);
      paramIndex++;
    }

    if (queue_id !== undefined) {
      updateFields.push(`queue_id = $${paramIndex}`);
      values.push(queue_id);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    const sql = `
      UPDATE phone_numbers
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      throw new Error('Phone number not found');
    }

    return result.rows[0];
  }

  /**
   * Release/cancel phone number
   */
  async releasePhoneNumber(phoneNumberId, tenantId) {
    const sql = `
      UPDATE phone_numbers
      SET status = 'cancelled', cancelled_at = NOW(), is_assigned = FALSE, tenant_id = NULL
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, [phoneNumberId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Phone number not found');
    }

    // Make available in inventory again
    await query(
      `UPDATE phone_number_inventory SET is_available = TRUE WHERE phone_number = $1`,
      [result.rows[0].phone_number]
    );

    return result.rows[0];
  }

  /**
   * Get phone number usage statistics
   */
  async getPhoneNumberUsage(phoneNumberId, tenantId, days = 30) {
    const sql = `
      SELECT
        SUM(inbound_calls_count) as total_inbound_calls,
        SUM(outbound_calls_count) as total_outbound_calls,
        SUM(inbound_minutes) as total_inbound_minutes,
        SUM(outbound_minutes) as total_outbound_minutes,
        SUM(inbound_sms_count) as total_inbound_sms,
        SUM(outbound_sms_count) as total_outbound_sms,
        SUM(total_cost_cents) as total_cost_cents
      FROM phone_number_usage
      WHERE phone_number_id = $1
        AND tenant_id = $2
        AND usage_date >= CURRENT_DATE - INTERVAL '${days} days'
    `;

    const result = await query(sql, [phoneNumberId, tenantId]);

    const stats = result.rows[0];
    stats.total_cost_dollars = (parseInt(stats.total_cost_cents || 0) / 100).toFixed(2);

    return stats;
  }
}

export default new PhoneNumbersService();
