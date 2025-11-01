/**
 * Admin Global Search Routes
 * Search across all tenants, users, calls, messages, etc.
 * Requires admin authentication
 */

import { Hono } from 'hono';
import { pool } from '../config/database.js';
import { authenticateAdmin } from './admin-auth.js';

const adminSearch = new Hono();

// All routes require admin authentication
adminSearch.use('*', authenticateAdmin);

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAuditAction(adminId, action, resourceType, resourceId, changes, req) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (
        admin_user_id, action, resource_type, resource_id,
        changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        resourceType || null,
        resourceId || null,
        changes ? JSON.stringify(changes) : null,
        req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown',
        req.header('user-agent') || 'unknown'
      ]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/search
 * Global search across multiple resource types
 * Query params:
 *  - q: search query (required)
 *  - type: resource type filter (optional: tenant, user, agent, call, sms, email, all)
 *  - limit: max results per type (default: 10, max: 50)
 */
adminSearch.get('/', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query('q');
    const type = c.req.query('type') || 'all';
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);

    if (!query || query.length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    const searchPattern = `%${query}%`;
    const results = {};

    // Search tenants
    if (type === 'all' || type === 'tenant') {
      const tenantResult = await pool.query(
        `SELECT id, name, domain, status, plan, created_at
         FROM tenants
         WHERE (name ILIKE $1 OR domain ILIKE $1)
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.tenants = tenantResult.rows;
    }

    // Search users
    if (type === 'all' || type === 'user') {
      const userResult = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
                u.tenant_id, t.name as tenant_name, u.created_at
         FROM users u
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE (u.email ILIKE $1
            OR u.first_name ILIKE $1
            OR u.last_name ILIKE $1)
           AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.users = userResult.rows;
    }

    // Search agents
    if (type === 'all' || type === 'agent') {
      const agentResult = await pool.query(
        `SELECT a.id, a.first_name, a.last_name, a.email, a.status,
                a.tenant_id, t.name as tenant_name,
                array_agg(e.extension) as extensions
         FROM agents a
         LEFT JOIN tenants t ON a.tenant_id = t.id
         LEFT JOIN agent_extensions e ON a.id = e.agent_id
         WHERE (a.email ILIKE $1
            OR a.first_name ILIKE $1
            OR a.last_name ILIKE $1)
           AND a.deleted_at IS NULL
         GROUP BY a.id, a.first_name, a.last_name, a.email, a.status, a.tenant_id, t.name
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.agents = agentResult.rows;
    }

    // Search calls (by phone number or call ID)
    if (type === 'all' || type === 'call') {
      const callResult = await pool.query(
        `SELECT c.id, c.to_number, c.from_number, c.status, c.direction,
                c.duration_seconds, c.initiated_at,
                c.tenant_id, t.name as tenant_name
         FROM calls c
         LEFT JOIN tenants t ON c.tenant_id = t.id
         WHERE (c.to_number ILIKE $1
            OR c.from_number ILIKE $1
            OR c.id::text ILIKE $1)
         ORDER BY c.initiated_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.calls = callResult.rows;
    }

    // Search SMS messages (by phone number or content)
    if (type === 'all' || type === 'sms') {
      const smsResult = await pool.query(
        `SELECT s.id, s.to_number, s.from_number, s.body, s.status, s.direction,
                s.created_at, s.tenant_id, t.name as tenant_name
         FROM sms_messages s
         LEFT JOIN tenants t ON s.tenant_id = t.id
         WHERE (s.to_number ILIKE $1
            OR s.from_number ILIKE $1
            OR s.body ILIKE $1
            OR s.id::text ILIKE $1)
         ORDER BY s.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.sms = smsResult.rows.map(row => ({
        ...row,
        body: row.body ? row.body.substring(0, 100) : null // Truncate for preview
      }));
    }

    // Search emails (by address or subject)
    if (type === 'all' || type === 'email') {
      const emailResult = await pool.query(
        `SELECT e.id, e.from_address, e.to_address, e.subject, e.status, e.direction,
                e.created_at, e.tenant_id, t.name as tenant_name
         FROM emails e
         LEFT JOIN tenants t ON e.tenant_id = t.id
         WHERE (e.from_address ILIKE $1
            OR e.to_address ILIKE $1
            OR e.subject ILIKE $1
            OR e.id::text ILIKE $1)
         ORDER BY e.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.emails = emailResult.rows;
    }

    // Search WhatsApp messages
    if (type === 'all' || type === 'whatsapp') {
      const whatsappResult = await pool.query(
        `SELECT w.id, w.from_number, w.to_number, w.type, w.status, w.direction,
                w.created_at, w.tenant_id, t.name as tenant_name
         FROM whatsapp_messages w
         LEFT JOIN tenants t ON w.tenant_id = t.id
         WHERE (w.from_number ILIKE $1
            OR w.to_number ILIKE $1
            OR w.id::text ILIKE $1)
         ORDER BY w.created_at DESC
         LIMIT $2`,
        [searchPattern, limit]
      );
      results.whatsapp = whatsappResult.rows;
    }

    // Log search action
    await logAuditAction(
      admin.id,
      'admin.search',
      null,
      null,
      { query, type, results_count: Object.values(results).reduce((sum, arr) => sum + arr.length, 0) },
      c.req
    );

    return c.json({
      query,
      type,
      results
    });

  } catch (err) {
    console.error('Global search error:', err);
    return c.json({ error: 'Search failed' }, 500);
  }
});

/**
 * GET /admin/search/tenants
 * Search tenants only (with more details)
 */
adminSearch.get('/tenants', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query('q');
    const status = c.req.query('status'); // active, suspended, trial, cancelled
    const plan = c.req.query('plan'); // trial, starter, professional, enterprise
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

    if (!query || query.length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    let queryString = `
      SELECT * FROM admin_tenant_summary
      WHERE (name ILIKE $1 OR domain ILIKE $1)
    `;
    const params = [` %${query}%`];
    let paramCount = 1;

    if (status) {
      paramCount++;
      queryString += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (plan) {
      paramCount++;
      queryString += ` AND plan = $${paramCount}`;
      params.push(plan);
    }

    paramCount++;
    queryString += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(queryString, params);

    await logAuditAction(admin.id, 'admin.search.tenants', null, null, { query, status, plan }, c.req);

    return c.json({
      query,
      tenants: result.rows
    });

  } catch (err) {
    console.error('Tenant search error:', err);
    return c.json({ error: 'Tenant search failed' }, 500);
  }
});

/**
 * GET /admin/search/users
 * Search users across all tenants
 */
adminSearch.get('/users', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query('q');
    const tenantId = c.req.query('tenant_id'); // Filter by tenant
    const role = c.req.query('role'); // admin, agent, user
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

    if (!query || query.length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    let queryString = `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status,
             u.last_login_at, u.created_at,
             u.tenant_id, t.name as tenant_name, t.domain as tenant_domain
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      WHERE (u.email ILIKE $1
         OR u.first_name ILIKE $1
         OR u.last_name ILIKE $1)
        AND u.deleted_at IS NULL
    `;
    const params = [`%${query}%`];
    let paramCount = 1;

    if (tenantId) {
      paramCount++;
      queryString += ` AND u.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (role) {
      paramCount++;
      queryString += ` AND u.role = $${paramCount}`;
      params.push(role);
    }

    paramCount++;
    queryString += ` ORDER BY u.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(queryString, params);

    await logAuditAction(admin.id, 'admin.search.users', null, null, { query, tenant_id: tenantId, role }, c.req);

    return c.json({
      query,
      users: result.rows
    });

  } catch (err) {
    console.error('User search error:', err);
    return c.json({ error: 'User search failed' }, 500);
  }
});

/**
 * GET /admin/search/calls
 * Search calls by phone number, call ID, or date range
 */
adminSearch.get('/calls', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query('q');
    const tenantId = c.req.query('tenant_id');
    const status = c.req.query('status'); // completed, failed, no-answer, busy
    const dateFrom = c.req.query('date_from'); // YYYY-MM-DD
    const dateTo = c.req.query('date_to'); // YYYY-MM-DD
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

    if (!query || query.length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    let queryString = `
      SELECT c.id, c.to_number, c.from_number, c.direction, c.status,
             c.duration_seconds, c.initiated_at, c.answered_at, c.ended_at,
             c.tenant_id, t.name as tenant_name
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE (c.to_number ILIKE $1
         OR c.from_number ILIKE $1
         OR c.id::text ILIKE $1)
    `;
    const params = [`%${query}%`];
    let paramCount = 1;

    if (tenantId) {
      paramCount++;
      queryString += ` AND c.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (status) {
      paramCount++;
      queryString += ` AND c.status = $${paramCount}`;
      params.push(status);
    }

    if (dateFrom) {
      paramCount++;
      queryString += ` AND c.initiated_at >= $${paramCount}::date`;
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      queryString += ` AND c.initiated_at < $${paramCount}::date + INTERVAL '1 day'`;
      params.push(dateTo);
    }

    paramCount++;
    queryString += ` ORDER BY c.initiated_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(queryString, params);

    await logAuditAction(
      admin.id,
      'admin.search.calls',
      null,
      null,
      { query, tenant_id: tenantId, status, date_from: dateFrom, date_to: dateTo },
      c.req
    );

    return c.json({
      query,
      calls: result.rows
    });

  } catch (err) {
    console.error('Call search error:', err);
    return c.json({ error: 'Call search failed' }, 500);
  }
});

/**
 * GET /admin/search/suggestions
 * Get search suggestions based on partial query
 */
adminSearch.get('/suggestions', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query('q');
    const type = c.req.query('type') || 'all'; // tenant, user, phone

    if (!query || query.length < 2) {
      return c.json({ suggestions: [] });
    }

    const searchPattern = `${query}%`; // Prefix match for suggestions
    const suggestions = [];

    // Tenant name suggestions
    if (type === 'all' || type === 'tenant') {
      const tenantResult = await pool.query(
        `SELECT DISTINCT name as value, 'tenant' as type
         FROM tenants
         WHERE name ILIKE $1 AND deleted_at IS NULL
         LIMIT 5`,
        [searchPattern]
      );
      suggestions.push(...tenantResult.rows);
    }

    // User email suggestions
    if (type === 'all' || type === 'user') {
      const userResult = await pool.query(
        `SELECT DISTINCT email as value, 'user' as type
         FROM users
         WHERE email ILIKE $1 AND deleted_at IS NULL
         LIMIT 5`,
        [searchPattern]
      );
      suggestions.push(...userResult.rows);
    }

    // Phone number suggestions
    if (type === 'all' || type === 'phone') {
      const phoneResult = await pool.query(
        `SELECT DISTINCT to_number as value, 'phone' as type
         FROM calls
         WHERE to_number ILIKE $1
         LIMIT 5`,
        [searchPattern]
      );
      suggestions.push(...phoneResult.rows);
    }

    return c.json({ suggestions: suggestions.slice(0, 10) });

  } catch (err) {
    console.error('Search suggestions error:', err);
    return c.json({ suggestions: [] });
  }
});

export default adminSearch;
