/**
 * Messages API Routes
 * Customer-facing message management (SMS, MMS)
 */

import { Hono } from 'hono';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import { query } from '../db/connection.js';
import SMSService from '../services/sms.js';

const messages = new Hono();
const smsService = new SMSService();

/**
 * GET /v1/messages
 * Get paginated list of messages for the authenticated user's tenant
 */
messages.get('/', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { page = 1, limit = 20, direction, status } = c.req.query();

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = ['tenant_id = $1'];
    const params = [tenantId];
    let paramIndex = 2;

    if (direction) {
      whereConditions.push(`direction = $${paramIndex}`);
      params.push(direction);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM sms_messages
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Get messages
    const result = await query(
      `SELECT
        id,
        from_number,
        to_number,
        body,
        direction,
        status,
        num_segments,
        price,
        price_unit,
        error_code,
        error_message,
        created_at,
        updated_at
      FROM sms_messages
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), offset]
    );

    return c.json({
      success: true,
      data: {
        messages: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return c.json({
      error: 'Failed to fetch messages',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/messages/:id
 * Get details of a specific message
 */
messages.get('/:id', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id } = c.req.param();

    const result = await query(
      `SELECT
        id,
        from_number,
        to_number,
        body,
        direction,
        status,
        num_segments,
        price,
        price_unit,
        error_code,
        error_message,
        media_urls,
        created_at,
        updated_at
      FROM sms_messages
      WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({
        error: 'Message not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    return c.json({
      error: 'Failed to fetch message',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/messages
 * Send a new SMS message
 */
messages.post('/', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { from, to, message, mediaUrls = [] } = body;

    // Validation
    if (!from || !to || !message) {
      return c.json({
        error: 'Validation failed',
        message: 'from, to, and message are required'
      }, 400);
    }

    // Send SMS
    const result = await smsService.sendSMS({
      tenantId,
      from,
      to,
      message,
      mediaUrls
    });

    return c.json({
      success: true,
      data: result,
      message: 'Message sent successfully'
    }, 201);
  } catch (error) {
    console.error('Error sending message:', error);
    return c.json({
      error: 'Failed to send message',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/messages/stats
 * Get message statistics for the tenant
 */
messages.get('/stats', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Get counts by status
    const statusResult = await query(
      `SELECT
        status,
        COUNT(*) as count,
        SUM(num_segments) as total_segments
      FROM sms_messages
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY status`,
      [tenantId]
    );

    // Get counts by direction
    const directionResult = await query(
      `SELECT
        direction,
        COUNT(*) as count
      FROM sms_messages
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY direction`,
      [tenantId]
    );

    // Calculate total cost
    const costResult = await query(
      `SELECT
        SUM(price) as total_cost,
        price_unit
      FROM sms_messages
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days' AND price IS NOT NULL
      GROUP BY price_unit`,
      [tenantId]
    );

    return c.json({
      success: true,
      data: {
        by_status: statusResult.rows,
        by_direction: directionResult.rows,
        cost: costResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching message stats:', error);
    return c.json({
      error: 'Failed to fetch message stats',
      message: error.message
    }, 500);
  }
});

export default messages;
