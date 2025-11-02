/**
 * Admin Phone Number Management Routes
 * IRISX staff provision and manage phone numbers across tenants
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminPhoneNumbers = new Hono();

// All routes require admin authentication
adminPhoneNumbers.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const provisionNumberSchema = z.object({
  phone_number: z.string().regex(/^\+\d{10,15}$/),
  provider: z.string().min(1),
  type: z.enum(['local', 'tollfree', 'mobile']),
  capabilities: z.object({
    voice: z.boolean(),
    sms: z.boolean(),
    mms: z.boolean()
  }),
  monthly_cost: z.number().min(0).optional()
});

const updateNumberSchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  friendly_name: z.string().max(100).optional()
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

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

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/phone-numbers
 * List all phone numbers across tenants
 */
adminPhoneNumbers.get('/phone-numbers', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const tenant_id = c.req.query('tenant_id');
    const status = c.req.query('status'); // active, inactive
    const provider = c.req.query('provider'); // twilio, telnyx, etc.
    const search = c.req.query('search'); // search by phone number

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['pn.deleted_at IS NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`pn.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`pn.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (provider) {
      whereConditions.push(`pn.provider = $${paramIndex}`);
      queryParams.push(provider);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`pn.phone_number ILIKE $${paramIndex}`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM phone_numbers pn
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get phone numbers
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        pn.id,
        pn.tenant_id,
        t.name as tenant_name,
        pn.phone_number,
        pn.friendly_name,
        pn.provider,
        pn.type,
        pn.status,
        pn.capabilities,
        pn.monthly_cost,
        pn.provisioned_at,
        pn.created_at,
        (SELECT COUNT(*) FROM calls WHERE from_number = pn.phone_number OR to_number = pn.phone_number) as total_calls
       FROM phone_numbers pn
       LEFT JOIN tenants t ON pn.tenant_id = t.id
       WHERE ${whereClause}
       ORDER BY pn.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.phone_numbers.list', null, null, { filters: { tenant_id, status, provider } }, c.req);

    return c.json({
      phone_numbers: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List phone numbers error:', err);
    return c.json({ error: 'Failed to list phone numbers' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/phone-numbers
 * Provision a new phone number for a tenant
 */
adminPhoneNumbers.post('/tenants/:tenantId/phone-numbers', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can provision numbers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = provisionNumberSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { phone_number, provider, type, capabilities, monthly_cost } = validation.data;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Check if phone number already exists
    const numberCheck = await pool.query(
      'SELECT id FROM phone_numbers WHERE phone_number = $1 AND deleted_at IS NULL',
      [phone_number]
    );

    if (numberCheck.rows.length > 0) {
      return c.json({ error: 'Phone number already exists in system' }, 409);
    }

    // Provision phone number
    const result = await pool.query(
      `INSERT INTO phone_numbers (
        tenant_id, phone_number, provider, type, status, capabilities, monthly_cost, provisioned_at
      ) VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW())
      RETURNING id, phone_number, provider, type, status, capabilities, monthly_cost, provisioned_at`,
      [tenantId, phone_number, provider, type, JSON.stringify(capabilities), monthly_cost || 0]
    );

    const number = result.rows[0];

    await logAdminAction(admin.id, 'admin.phone_number.provision', 'phone_number', number.id, {
      tenant_id: tenantId,
      phone_number,
      provider
    }, c.req);

    return c.json({
      success: true,
      phone_number: number,
      message: 'Phone number provisioned successfully'
    }, 201);

  } catch (err) {
    console.error('Provision phone number error:', err);
    return c.json({ error: 'Failed to provision phone number' }, 500);
  }
});

/**
 * PATCH /admin/phone-numbers/:id
 * Update phone number configuration
 */
adminPhoneNumbers.patch('/phone-numbers/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can update numbers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = updateNumberSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if number exists
    const numberCheck = await pool.query(
      'SELECT id, phone_number, status FROM phone_numbers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    // Build UPDATE query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (validation.data.status) {
      updates.push(`status = $${paramIndex}`);
      values.push(validation.data.status);
      paramIndex++;
    }

    if (validation.data.friendly_name !== undefined) {
      updates.push(`friendly_name = $${paramIndex}`);
      values.push(validation.data.friendly_name);
      paramIndex++;
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(id);

    await pool.query(
      `UPDATE phone_numbers
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}`,
      values
    );

    // Get updated number
    const result = await pool.query(
      'SELECT * FROM phone_numbers WHERE id = $1',
      [id]
    );

    await logAdminAction(admin.id, 'admin.phone_number.update', 'phone_number', id, {
      phone_number: number.phone_number,
      changes: validation.data
    }, c.req);

    return c.json({
      success: true,
      phone_number: result.rows[0]
    });

  } catch (err) {
    console.error('Update phone number error:', err);
    return c.json({ error: 'Failed to update phone number' }, 500);
  }
});

/**
 * DELETE /admin/phone-numbers/:id
 * Deactivate/release a phone number
 */
adminPhoneNumbers.delete('/phone-numbers/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Only superadmin can delete numbers
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete phone numbers' }, 403);
    }

    // Get number info
    const numberCheck = await pool.query(
      'SELECT id, phone_number, tenant_id FROM phone_numbers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    // Soft delete
    await pool.query(
      'UPDATE phone_numbers SET deleted_at = NOW(), status = $1 WHERE id = $2',
      ['inactive', id]
    );

    // TODO: Release number from provider (Twilio/Telnyx API call)

    await logAdminAction(admin.id, 'admin.phone_number.delete', 'phone_number', id, {
      phone_number: number.phone_number,
      tenant_id: number.tenant_id
    }, c.req);

    return c.json({
      success: true,
      message: 'Phone number deactivated successfully'
    });

  } catch (err) {
    console.error('Delete phone number error:', err);
    return c.json({ error: 'Failed to delete phone number' }, 500);
  }
});

/**
 * GET /admin/phone-numbers/stats
 * Get phone number statistics
 */
adminPhoneNumbers.get('/phone-numbers/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const tenant_id = c.req.query('tenant_id');

    let whereClause = 'deleted_at IS NULL';
    let queryParams = [];

    if (tenant_id) {
      whereClause += ' AND tenant_id = $1';
      queryParams.push(tenant_id);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_numbers,
        COUNT(*) FILTER (WHERE status = 'active') as active_numbers,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_numbers,
        COUNT(*) FILTER (WHERE type = 'local') as local_numbers,
        COUNT(*) FILTER (WHERE type = 'tollfree') as tollfree_numbers,
        COUNT(*) FILTER (WHERE type = 'mobile') as mobile_numbers,
        SUM(monthly_cost) as total_monthly_cost,
        COUNT(DISTINCT tenant_id) as tenants_with_numbers
       FROM phone_numbers
       WHERE ${whereClause}`,
      queryParams
    );

    // Get by provider
    const providerResult = await pool.query(
      `SELECT
        provider,
        COUNT(*) as count,
        SUM(monthly_cost) as monthly_cost
       FROM phone_numbers
       WHERE ${whereClause}
       GROUP BY provider
       ORDER BY count DESC`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.phone_numbers.stats', null, null, { tenant_id }, c.req);

    return c.json({
      summary: result.rows[0],
      by_provider: providerResult.rows
    });

  } catch (err) {
    console.error('Get phone number stats error:', err);
    return c.json({ error: 'Failed to get phone number stats' }, 500);
  }
});

export default adminPhoneNumbers;
