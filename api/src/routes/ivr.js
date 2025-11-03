/**
 * IVR Management API Routes
 * CRUD operations for IVR menus and options
 *
 * Phase 1, Week 5-6
 */

import { Hono } from 'hono';
import { query } from '../db/connection.js';

const ivr = new Hono();

/**
 * @route GET /v1/ivr/menus
 * @desc List all IVR menus for tenant
 */
ivr.get('/menus', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1; // From auth middleware

    const result = await query(
      `SELECT
        m.*,
        COUNT(DISTINCT o.id) as option_count,
        COUNT(DISTINCT s.call_uuid) as active_sessions
       FROM ivr_menus m
       LEFT JOIN ivr_menu_options o ON m.id = o.menu_id
       LEFT JOIN ivr_sessions s ON m.id = s.current_menu_id AND s.ended_at IS NULL
       WHERE m.tenant_id = $1
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      [tenantId]
    );

    return c.json({
      menus: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing IVR menus:', error);
    return c.json({ error: 'Failed to list menus', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/ivr/menus/:id
 * @desc Get IVR menu details with options
 */
ivr.get('/menus/:id', async (c) => {
  try {
    const menuId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    // Get menu
    const menuResult = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2',
      [menuId, tenantId]
    );

    if (menuResult.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    // Get menu options
    const optionsResult = await query(
      `SELECT * FROM ivr_menu_options
       WHERE menu_id = $1
       ORDER BY digit_pattern`,
      [menuId]
    );

    return c.json({
      menu: menuResult.rows[0],
      options: optionsResult.rows
    });
  } catch (error) {
    console.error('Error getting IVR menu:', error);
    return c.json({ error: 'Failed to get menu', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/ivr/menus
 * @desc Create new IVR menu
 */
ivr.post('/menus', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const {
      name,
      description,
      greeting_text,
      greeting_audio,
      greeting_voice = 'alloy',
      greeting_provider = 'openai',
      invalid_text,
      invalid_audio,
      invalid_voice = 'alloy',
      max_attempts_text,
      max_attempts_audio,
      max_digits = 1,
      digit_timeout_ms = 3000,
      status = 'active'
    } = body;

    // Validation
    if (!name) {
      return c.json({ error: 'Menu name is required' }, 400);
    }

    if (!greeting_text && !greeting_audio) {
      return c.json({ error: 'Either greeting_text or greeting_audio is required' }, 400);
    }

    // Insert menu
    const result = await query(
      `INSERT INTO ivr_menus (
        tenant_id, name, description,
        greeting_text, greeting_audio, greeting_voice, greeting_provider,
        invalid_text, invalid_audio, invalid_voice,
        max_attempts_text, max_attempts_audio,
        max_digits, digit_timeout_ms, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        tenantId, name, description,
        greeting_text, greeting_audio, greeting_voice, greeting_provider,
        invalid_text, invalid_audio, invalid_voice,
        max_attempts_text, max_attempts_audio,
        max_digits, digit_timeout_ms, status
      ]
    );

    return c.json({
      menu: result.rows[0],
      message: 'Menu created successfully'
    }, 201);
  } catch (error) {
    console.error('Error creating IVR menu:', error);
    return c.json({ error: 'Failed to create menu', message: error.message }, 500);
  }
});

/**
 * @route PUT /v1/ivr/menus/:id
 * @desc Update IVR menu
 */
ivr.put('/menus/:id', async (c) => {
  try {
    const menuId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    // Check menu exists
    const existing = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2',
      [menuId, tenantId]
    );

    if (existing.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'name', 'description',
      'greeting_text', 'greeting_audio', 'greeting_voice', 'greeting_provider',
      'invalid_text', 'invalid_audio', 'invalid_voice',
      'max_attempts_text', 'max_attempts_audio',
      'max_digits', 'digit_timeout_ms', 'status'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(menuId, tenantId);

    const result = await query(
      `UPDATE ivr_menus
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    return c.json({
      menu: result.rows[0],
      message: 'Menu updated successfully'
    });
  } catch (error) {
    console.error('Error updating IVR menu:', error);
    return c.json({ error: 'Failed to update menu', message: error.message }, 500);
  }
});

/**
 * @route DELETE /v1/ivr/menus/:id
 * @desc Delete IVR menu
 */
ivr.delete('/menus/:id', async (c) => {
  try {
    const menuId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    // Check for active sessions
    const sessions = await query(
      `SELECT COUNT(*) as count FROM ivr_sessions
       WHERE current_menu_id = $1 AND ended_at IS NULL`,
      [menuId]
    );

    if (parseInt(sessions.rows[0].count) > 0) {
      return c.json({
        error: 'Cannot delete menu with active sessions',
        activeSessions: sessions.rows[0].count
      }, 400);
    }

    // Delete menu options first
    await query(
      'DELETE FROM ivr_menu_options WHERE menu_id = $1',
      [menuId]
    );

    // Delete menu
    const result = await query(
      'DELETE FROM ivr_menus WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [menuId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    return c.json({
      message: 'Menu deleted successfully',
      menu: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting IVR menu:', error);
    return c.json({ error: 'Failed to delete menu', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/ivr/menus/:id/options
 * @desc Add option to IVR menu
 */
ivr.post('/menus/:id/options', async (c) => {
  try {
    const menuId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    // Verify menu exists
    const menu = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2',
      [menuId, tenantId]
    );

    if (menu.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    const {
      digit_pattern,
      description,
      action_type,
      action_value
    } = body;

    // Validation
    if (!digit_pattern || !action_type) {
      return c.json({ error: 'digit_pattern and action_type are required' }, 400);
    }

    const validActions = ['submenu', 'transfer', 'hangup', 'repeat', 'return', 'webhook', 'voicemail'];
    if (!validActions.includes(action_type)) {
      return c.json({ error: `Invalid action_type. Must be one of: ${validActions.join(', ')}` }, 400);
    }

    // Check for duplicate digit pattern
    const duplicate = await query(
      'SELECT * FROM ivr_menu_options WHERE menu_id = $1 AND digit_pattern = $2',
      [menuId, digit_pattern]
    );

    if (duplicate.rows.length > 0) {
      return c.json({ error: 'Digit pattern already exists for this menu' }, 400);
    }

    // Insert option
    const result = await query(
      `INSERT INTO ivr_menu_options (
        menu_id, digit_pattern, description, action_type, action_value
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [menuId, digit_pattern, description, action_type, action_value]
    );

    return c.json({
      option: result.rows[0],
      message: 'Menu option created successfully'
    }, 201);
  } catch (error) {
    console.error('Error creating menu option:', error);
    return c.json({ error: 'Failed to create option', message: error.message }, 500);
  }
});

/**
 * @route PUT /v1/ivr/menus/:menuId/options/:optionId
 * @desc Update menu option
 */
ivr.put('/menus/:menuId/options/:optionId', async (c) => {
  try {
    const menuId = c.req.param('menuId');
    const optionId = c.req.param('optionId');
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    // Verify menu ownership
    const menu = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2',
      [menuId, tenantId]
    );

    if (menu.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    // Build update
    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = ['digit_pattern', 'description', 'action_type', 'action_value'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(optionId, menuId);

    const result = await query(
      `UPDATE ivr_menu_options
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount} AND menu_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Option not found' }, 404);
    }

    return c.json({
      option: result.rows[0],
      message: 'Option updated successfully'
    });
  } catch (error) {
    console.error('Error updating menu option:', error);
    return c.json({ error: 'Failed to update option', message: error.message }, 500);
  }
});

/**
 * @route DELETE /v1/ivr/menus/:menuId/options/:optionId
 * @desc Delete menu option
 */
ivr.delete('/menus/:menuId/options/:optionId', async (c) => {
  try {
    const menuId = c.req.param('menuId');
    const optionId = c.req.param('optionId');
    const tenantId = c.get('tenantId') || 1;

    // Verify menu ownership
    const menu = await query(
      'SELECT * FROM ivr_menus WHERE id = $1 AND tenant_id = $2',
      [menuId, tenantId]
    );

    if (menu.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    const result = await query(
      'DELETE FROM ivr_menu_options WHERE id = $1 AND menu_id = $2 RETURNING *',
      [optionId, menuId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Option not found' }, 404);
    }

    return c.json({
      message: 'Option deleted successfully',
      option: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting menu option:', error);
    return c.json({ error: 'Failed to delete option', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/ivr/sessions
 * @desc List active IVR sessions
 */
ivr.get('/sessions', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;

    const result = await query(
      `SELECT
        s.*,
        m.name as menu_name,
        c.from_number,
        c.to_number
       FROM ivr_sessions s
       JOIN ivr_menus m ON s.current_menu_id = m.id
       LEFT JOIN calls c ON s.call_uuid = c.uuid
       WHERE m.tenant_id = $1 AND s.ended_at IS NULL
       ORDER BY s.started_at DESC`,
      [tenantId]
    );

    return c.json({
      sessions: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing IVR sessions:', error);
    return c.json({ error: 'Failed to list sessions', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/ivr/analytics
 * @desc Get IVR analytics
 */
ivr.get('/analytics', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { startDate, endDate, menuId } = c.req.query();

    let whereClause = 'm.tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (menuId) {
      whereClause += ` AND s.current_menu_id = $${paramCount}`;
      params.push(menuId);
      paramCount++;
    }

    if (startDate) {
      whereClause += ` AND s.started_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      whereClause += ` AND s.started_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    const result = await query(
      `SELECT
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(DISTINCT s.call_uuid) as unique_calls,
        AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) as avg_duration_seconds,
        SUM(s.invalid_input_count) as total_invalid_inputs,
        COUNT(DISTINCT CASE WHEN s.ended_at IS NULL THEN s.id END) as active_sessions
       FROM ivr_sessions s
       JOIN ivr_menus m ON s.current_menu_id = m.id
       WHERE ${whereClause}`,
      params
    );

    // Get popular menu paths
    const pathsResult = await query(
      `SELECT
        menu_history,
        COUNT(*) as count
       FROM ivr_sessions s
       JOIN ivr_menus m ON s.current_menu_id = m.id
       WHERE ${whereClause}
       GROUP BY menu_history
       ORDER BY count DESC
       LIMIT 10`,
      params
    );

    return c.json({
      summary: result.rows[0],
      popularPaths: pathsResult.rows
    });
  } catch (error) {
    console.error('Error getting IVR analytics:', error);
    return c.json({ error: 'Failed to get analytics', message: error.message }, 500);
  }
});

export default ivr;
