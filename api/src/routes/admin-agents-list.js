/**
 * Admin Agents List Routes (Admin Panel view)
 * This is a wrapper around the existing agents routes to make them available at /admin/agents
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminAgentsList = new Hono();

// All routes require admin authentication
adminAgentsList.use('*', authenticateAdmin);

// Helper function for audit logging
async function logAdminAction(adminId, action, resourceType, resourceId, changes, req) {
  await pool.query(
    `INSERT INTO admin_audit_log (
      admin_user_id, action, resource_type, resource_id, changes, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId,
      action,
      resourceType,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown'
    ]
  );
}

/**
 * GET /admin/agents
 * List all agents across all tenants (Admin portal view)
 */
adminAgentsList.get('/', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const tenant_id = c.req.query('tenant_id');
    const status = c.req.query('status'); // active, suspended
    const role = c.req.query('role'); // agent, supervisor, admin
    const search = c.req.query('search'); // search by name or email

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['u.deleted_at IS NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`u.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`u.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`u.role = $${paramIndex}`);
      queryParams.push(role);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM users u
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get agents with their extensions and tenant info
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        u.id,
        u.tenant_id,
        t.name as tenant_name,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.last_login_at,
        u.created_at,
        json_agg(
          json_build_object(
            'id', ae.id,
            'extension', ae.extension,
            'status', ae.status,
            'last_login_at', ae.last_login_at
          )
        ) FILTER (WHERE ae.id IS NOT NULL) as extensions,
        COUNT(ae.id) as extension_count
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       LEFT JOIN agent_extensions ae ON ae.user_id = u.id
       WHERE ${whereClause}
       GROUP BY u.id, u.tenant_id, t.name, u.email, u.first_name, u.last_name, u.role, u.status, u.last_login_at, u.created_at
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.agents.list', null, null, { filters: { tenant_id, status, role, search } }, c.req);

    return c.json({
      agents: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List agents error:', err);
    return c.json({ error: 'Failed to list agents' }, 500);
  }
});

/**
 * POST /admin/agents/bulk-import
 * Bulk import agents
 */
adminAgentsList.post('/bulk-import', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const { agents } = body;

    if (!Array.isArray(agents) || agents.length === 0) {
      return c.json({ error: 'agents array is required and must not be empty' }, 400);
    }

    if (agents.length > 100) {
      return c.json({ error: 'Maximum 100 agents can be imported at once' }, 400);
    }

    // TODO: Implement bulk import logic
    // For now, return a placeholder response

    await logAdminAction(admin.id, 'admin.agents.bulk_import', null, null, { count: agents.length }, c.req);

    return c.json({
      success: true,
      message: `Bulk import initiated for ${agents.length} agents`,
      results: {
        success: [],
        failed: [],
        total: agents.length
      }
    });

  } catch (err) {
    console.error('Bulk import agents error:', err);
    return c.json({ error: 'Failed to bulk import agents' }, 500);
  }
});

export default adminAgentsList;
