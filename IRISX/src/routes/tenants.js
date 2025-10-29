/**
 * Tenants & Users Management API Routes
 *
 * Tenant Endpoints:
 * - POST /v1/tenants - Create new tenant
 * - GET /v1/tenants - List all tenants
 * - GET /v1/tenants/:id - Get tenant details
 * - PUT /v1/tenants/:id - Update tenant
 * - DELETE /v1/tenants/:id - Delete tenant (soft)
 * - POST /v1/tenants/:id/regenerate-key - Regenerate API key
 * - GET /v1/tenants/:id/stats - Get tenant statistics
 *
 * User Endpoints:
 * - POST /v1/tenants/:tenant_id/users - Create user
 * - GET /v1/tenants/:tenant_id/users - List users
 * - GET /v1/users/:id - Get user details
 * - PUT /v1/users/:id - Update user
 * - DELETE /v1/users/:id - Delete user
 */

import { Hono } from 'hono';
import tenantsService from '../services/tenants.js';
import { query } from '../db/index.js';
import crypto from 'crypto';

const tenants = new Hono();

// ========== TENANT ENDPOINTS ==========

// Create tenant
tenants.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { name, slug, email, plan } = body;

    if (!name || !email) {
      return c.json({ error: 'name and email are required' }, 400);
    }

    const tenant = await tenantsService.createTenant({ name, slug, email, plan });

    return c.json({
      message: 'Tenant created successfully',
      tenant
    }, 201);
  } catch (error) {
    console.error('[Tenants] Error creating tenant:', error);
    return c.json({ error: error.message }, 400);
  }
});

// List tenants
tenants.get('/', async (c) => {
  try {
    const filters = {
      status: c.req.query('status'),
      plan: c.req.query('plan'),
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await tenantsService.listTenants(filters);

    return c.json(result);
  } catch (error) {
    console.error('[Tenants] Error listing tenants:', error);
    return c.json({ error: 'Failed to list tenants' }, 500);
  }
});

// Get tenant
tenants.get('/:id', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('id'));
    const tenant = await tenantsService.getTenant(tenantId);

    return c.json({ tenant });
  } catch (error) {
    console.error('[Tenants] Error getting tenant:', error);
    return c.json({ error: error.message }, error.message.includes('not found') ? 404 : 500);
  }
});

// Update tenant
tenants.put('/:id', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('id'));
    const updates = await c.req.json();

    const tenant = await tenantsService.updateTenant(tenantId, updates);

    return c.json({
      message: 'Tenant updated successfully',
      tenant
    });
  } catch (error) {
    console.error('[Tenants] Error updating tenant:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Delete tenant
tenants.delete('/:id', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('id'));
    const tenant = await tenantsService.deleteTenant(tenantId);

    return c.json({
      message: 'Tenant deleted successfully',
      tenant
    });
  } catch (error) {
    console.error('[Tenants] Error deleting tenant:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Regenerate API key
tenants.post('/:id/regenerate-key', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('id'));
    const tenant = await tenantsService.regenerateApiKey(tenantId);

    return c.json({
      message: 'API key regenerated successfully',
      api_key: tenant.api_key
    });
  } catch (error) {
    console.error('[Tenants] Error regenerating API key:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get tenant statistics
tenants.get('/:id/stats', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('id'));
    const stats = await tenantsService.getTenantStats(tenantId);

    return c.json({ stats });
  } catch (error) {
    console.error('[Tenants] Error getting tenant stats:', error);
    return c.json({ error: 'Failed to get tenant statistics' }, 500);
  }
});

// ========== USER ENDPOINTS ==========

// Create user
tenants.post('/:tenant_id/users', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('tenant_id'));
    const body = await c.req.json();
    const { email, first_name, last_name, role = 'user', password } = body;

    if (!email || !first_name || !last_name) {
      return c.json({ error: 'email, first_name, and last_name are required' }, 400);
    }

    // Hash password (simplified - in production use bcrypt)
    const passwordHash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;

    const sql = `
      INSERT INTO users (tenant_id, email, first_name, last_name, role, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, uuid, tenant_id, email, first_name, last_name, role, created_at
    `;

    const result = await query(sql, [tenantId, email, first_name, last_name, role, passwordHash]);

    return c.json({
      message: 'User created successfully',
      user: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[Tenants] Error creating user:', error);
    return c.json({ error: error.message }, 400);
  }
});

// List users
tenants.get('/:tenant_id/users', async (c) => {
  try {
    const tenantId = parseInt(c.req.param('tenant_id'));
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const sql = `
      SELECT id, uuid, tenant_id, email, first_name, last_name, role, is_active, created_at
      FROM users
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [tenantId, limit, offset]);

    const countSql = `SELECT COUNT(*) FROM users WHERE tenant_id = $1`;
    const countResult = await query(countSql, [tenantId]);

    return c.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('[Tenants] Error listing users:', error);
    return c.json({ error: 'Failed to list users' }, 500);
  }
});

export default tenants;
