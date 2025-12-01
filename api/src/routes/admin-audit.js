/**
 * Admin Audit Log Routes
 * Provides audit trail for admin actions
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminAudit = new Hono();

// All routes require admin authentication
adminAudit.use('*', authenticateAdmin);

/**
 * GET /admin/audit-log
 * Get audit logs with filtering and pagination
 */
adminAudit.get('/', async (c) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      admin_id = '',
      action = '',
      resource_type = ''
    } = c.req.query();

    const pageInt = parseInt(page) || 1;
    const limitInt = Math.min(parseInt(limit) || 50, 100);
    const offset = (pageInt - 1) * limitInt;

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (search) {
      conditions.push(`(
        aal.action ILIKE $${paramCount} OR
        aal.resource_type ILIKE $${paramCount} OR
        au.email ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (admin_id) {
      conditions.push(`aal.admin_user_id = $${paramCount}`);
      params.push(admin_id);
      paramCount++;
    }

    if (action) {
      conditions.push(`aal.action = $${paramCount}`);
      params.push(action);
      paramCount++;
    }

    if (resource_type) {
      conditions.push(`aal.resource_type = $${paramCount}`);
      params.push(resource_type);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_audit_log aal
      LEFT JOIN admin_users au ON aal.admin_user_id = au.id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get logs
    const logsQuery = `
      SELECT
        aal.id,
        aal.admin_user_id,
        au.email as admin_email,
        au.first_name || ' ' || au.last_name as admin_name,
        aal.action,
        aal.resource_type,
        aal.resource_id,
        aal.tenant_id,
        aal.changes,
        aal.metadata,
        aal.ip_address,
        aal.user_agent,
        aal.created_at
      FROM admin_audit_log aal
      LEFT JOIN admin_users au ON aal.admin_user_id = au.id
      ${whereClause}
      ORDER BY aal.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limitInt, offset);

    const logsResult = await pool.query(logsQuery, params);

    return c.json({
      logs: logsResult.rows,
      total,
      page: pageInt,
      limit: limitInt,
      totalPages: Math.ceil(total / limitInt)
    });
  } catch (error) {
    console.error('[Admin Audit Log] Error fetching logs:', error);
    return c.json({
      error: 'Failed to fetch audit logs',
      details: error.message
    }, 500);
  }
});

/**
 * GET /admin/audit-log/stats
 * Get audit log statistics
 */
adminAudit.get('/stats', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_actions,
        COUNT(DISTINCT admin_user_id) as active_admins,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE action = 'deleted') as deletions,
        COUNT(*) FILTER (WHERE action = 'suspended') as suspensions
      FROM admin_audit_log
    `);

    const stats = result.rows[0];

    // Get top admins
    const topAdminsResult = await pool.query(`
      SELECT
        au.email,
        au.first_name || ' ' || au.last_name as name,
        COUNT(*) as action_count
      FROM admin_audit_log aal
      LEFT JOIN admin_users au ON aal.admin_user_id = au.id
      WHERE aal.created_at > NOW() - INTERVAL '30 days'
      GROUP BY au.id, au.email, au.first_name, au.last_name
      ORDER BY action_count DESC
      LIMIT 5
    `);

    // Get top actions
    const topActionsResult = await pool.query(`
      SELECT
        action,
        COUNT(*) as count
      FROM admin_audit_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    return c.json({
      stats: {
        totalActions: parseInt(stats.total_actions) || 0,
        activeAdmins: parseInt(stats.active_admins) || 0,
        last24h: parseInt(stats.last_24h) || 0,
        last7d: parseInt(stats.last_7d) || 0,
        deletions: parseInt(stats.deletions) || 0,
        suspensions: parseInt(stats.suspensions) || 0
      },
      topAdmins: topAdminsResult.rows,
      topActions: topActionsResult.rows
    });
  } catch (error) {
    console.error('[Admin Audit Log] Error fetching stats:', error);
    return c.json({
      error: 'Failed to fetch audit log stats',
      details: error.message
    }, 500);
  }
});

/**
 * GET /admin/audit-log/admins
 * Get list of admins for filtering
 */
adminAudit.get('/admins', async (c) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        au.id,
        au.email,
        au.first_name || ' ' || au.last_name as name
      FROM admin_users au
      INNER JOIN admin_audit_log aal ON aal.admin_user_id = au.id
      ORDER BY name
    `);

    return c.json({
      admins: result.rows
    });
  } catch (error) {
    console.error('[Admin Audit Log] Error fetching admins:', error);
    return c.json({
      error: 'Failed to fetch admins',
      details: error.message
    }, 500);
  }
});

export default adminAudit;
