/**
 * Phone Numbers API Routes
 * Customer-facing phone number management
 */

import { Hono } from 'hono';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import { query } from '../db/connection.js';

const phoneNumbers = new Hono();

/**
 * GET /v1/phone-numbers
 * Get all phone numbers for the authenticated user's tenant
 */
phoneNumbers.get('/', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT
        id,
        phone_number,
        friendly_name,
        country_code,
        status,
        carrier,
        sms_enabled,
        voice_enabled,
        mms_enabled,
        created_at
      FROM phone_numbers
      WHERE tenant_id = $1 AND status = 'active'
      ORDER BY created_at DESC`,
      [tenantId]
    );

    return c.json({
      success: true,
      data: {
        phone_numbers: result.rows,
        total: result.rows.length
      }
    });
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    return c.json({
      error: 'Failed to fetch phone numbers',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/phone-numbers/:id
 * Get details of a specific phone number
 */
phoneNumbers.get('/:id', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id } = c.req.param();

    const result = await query(
      `SELECT
        id,
        phone_number,
        friendly_name,
        country_code,
        status,
        carrier,
        sms_enabled,
        voice_enabled,
        mms_enabled,
        inbound_sms_webhook_url,
        inbound_call_webhook_url,
        created_at,
        updated_at
      FROM phone_numbers
      WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({
        error: 'Phone number not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching phone number:', error);
    return c.json({
      error: 'Failed to fetch phone number',
      message: error.message
    }, 500);
  }
});

export default phoneNumbers;
