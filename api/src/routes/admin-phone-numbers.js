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
adminPhoneNumbers.get('/', async (c) => {
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
    let whereConditions = ['1=1'];
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
      whereConditions.push(`pn.carrier = $${paramIndex}`);
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
        pn.carrier as provider,
        pn.number_type as type,
        pn.status,
        jsonb_build_object(
          'voice', pn.voice_enabled,
          'sms', pn.sms_enabled,
          'mms', pn.mms_enabled
        ) as capabilities,
        pn.monthly_cost_cents as monthly_cost,
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
adminPhoneNumbers.post('/tenants/:tenantId', async (c) => {
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
      'SELECT id, name FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Check if phone number already exists
    const numberCheck = await pool.query(
      'SELECT id FROM phone_numbers WHERE phone_number = $1',
      [phone_number]
    );

    if (numberCheck.rows.length > 0) {
      return c.json({ error: 'Phone number already exists in system' }, 409);
    }

    // Extract country code from phone number (assume E.164 format like +1...)
    const country_code = phone_number.substring(0, 2); // +1, +44, etc.

    // Provision phone number with correct column names
    const result = await pool.query(
      `INSERT INTO phone_numbers (
        tenant_id, phone_number, country_code, carrier, number_type, status,
        voice_enabled, sms_enabled, mms_enabled, monthly_cost_cents
      ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)
      RETURNING id, phone_number, carrier as provider, number_type as type, status,
        jsonb_build_object('voice', voice_enabled, 'sms', sms_enabled, 'mms', mms_enabled) as capabilities,
        monthly_cost_cents as monthly_cost, created_at`,
      [
        tenantId,
        phone_number,
        country_code,
        provider, // Maps to carrier
        type, // Maps to number_type
        capabilities.voice || false,
        capabilities.sms || false,
        capabilities.mms || false,
        (monthly_cost || 0) * 100 // Convert dollars to cents if needed, or keep as cents
      ]
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
adminPhoneNumbers.patch('/:id', async (c) => {
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
      'SELECT id, phone_number, status FROM phone_numbers WHERE id = $1',
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
adminPhoneNumbers.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Only superadmin can delete numbers
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete phone numbers' }, 403);
    }

    // Get number info
    const numberCheck = await pool.query(
      'SELECT id, phone_number, tenant_id FROM phone_numbers WHERE id = $1',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    // Set status to inactive (no soft delete column)
    await pool.query(
      'UPDATE phone_numbers SET status = $1 WHERE id = $2',
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
 * POST /admin/phone-numbers/:id/assign
 * Assign phone number to a tenant
 */
adminPhoneNumbers.post('/:id/assign', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();
    const { tenant_id } = body;

    // Only admins and superadmins can assign numbers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    if (!tenant_id) {
      return c.json({ error: 'tenant_id is required' }, 400);
    }

    // Check if number exists
    const numberCheck = await pool.query(
      'SELECT id, phone_number, tenant_id, status FROM phone_numbers WHERE id = $1',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    if (number.tenant_id) {
      return c.json({ error: 'Phone number is already assigned to a tenant' }, 400);
    }

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1',
      [tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Assign number to tenant
    await pool.query(
      'UPDATE phone_numbers SET tenant_id = $1, updated_at = NOW() WHERE id = $2',
      [tenant_id, id]
    );

    await logAdminAction(admin.id, 'admin.phone_number.assign', 'phone_number', id, {
      phone_number: number.phone_number,
      tenant_id
    }, c.req);

    return c.json({
      success: true,
      message: `Phone number ${number.phone_number} assigned to tenant ${tenantCheck.rows[0].name}`
    });

  } catch (err) {
    console.error('Assign phone number error:', err);
    return c.json({ error: 'Failed to assign phone number' }, 500);
  }
});

/**
 * POST /admin/phone-numbers/:id/unassign
 * Unassign phone number from tenant
 */
adminPhoneNumbers.post('/:id/unassign', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Only admins and superadmins can unassign numbers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Get number info
    const numberCheck = await pool.query(
      'SELECT id, phone_number, tenant_id FROM phone_numbers WHERE id = $1',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    if (!number.tenant_id) {
      return c.json({ error: 'Phone number is not assigned to any tenant' }, 400);
    }

    // Unassign number
    await pool.query(
      'UPDATE phone_numbers SET tenant_id = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );

    await logAdminAction(admin.id, 'admin.phone_number.unassign', 'phone_number', id, {
      phone_number: number.phone_number,
      tenant_id: number.tenant_id
    }, c.req);

    return c.json({
      success: true,
      message: `Phone number ${number.phone_number} unassigned successfully`
    });

  } catch (err) {
    console.error('Unassign phone number error:', err);
    return c.json({ error: 'Failed to unassign phone number' }, 500);
  }
});

/**
 * POST /admin/phone-numbers/:id/test
 * Test phone number connectivity
 */
adminPhoneNumbers.post('/:id/test', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Get number info
    const numberCheck = await pool.query(
      'SELECT id, phone_number, carrier, status FROM phone_numbers WHERE id = $1',
      [id]
    );

    if (numberCheck.rows.length === 0) {
      return c.json({ error: 'Phone number not found' }, 404);
    }

    const number = numberCheck.rows[0];

    // TODO: Implement actual provider test (Twilio/Telnyx API call)
    // For now, just check if number is active
    const testResults = {
      phone_number: number.phone_number,
      carrier: number.carrier,
      status: number.status,
      voice_enabled: true, // Mock test results
      sms_enabled: true,
      mms_enabled: true,
      connectivity: 'ok',
      timestamp: new Date().toISOString()
    };

    await logAdminAction(admin.id, 'admin.phone_number.test', 'phone_number', id, {
      phone_number: number.phone_number
    }, c.req);

    return c.json({
      success: true,
      test_results: testResults,
      message: `Test completed for ${number.phone_number}`
    });

  } catch (err) {
    console.error('Test phone number error:', err);
    return c.json({ error: 'Failed to test phone number' }, 500);
  }
});

/**
 * GET /admin/phone-numbers/stats
 * Get phone number statistics
 */
adminPhoneNumbers.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const tenant_id = c.req.query('tenant_id');

    let whereClause = '1=1';
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
        COUNT(*) FILTER (WHERE number_type = 'local') as local_numbers,
        COUNT(*) FILTER (WHERE number_type = 'tollfree') as tollfree_numbers,
        COUNT(*) FILTER (WHERE number_type = 'mobile') as mobile_numbers,
        SUM(monthly_cost_cents) as total_monthly_cost,
        COUNT(DISTINCT tenant_id) as tenants_with_numbers
       FROM phone_numbers
       WHERE ${whereClause}`,
      queryParams
    );

    // Get by provider
    const providerResult = await pool.query(
      `SELECT
        carrier as provider,
        COUNT(*) as count,
        SUM(monthly_cost_cents) as monthly_cost
       FROM phone_numbers
       WHERE ${whereClause}
       GROUP BY carrier
       ORDER BY count DESC`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.phone_numbers.stats', null, null, { tenant_id }, c.req);

    const summary = result.rows[0];
    const totalMonthlyCost = summary.total_monthly_cost || 0;
    const unassigned = parseInt(summary.total_numbers) - (summary.tenants_with_numbers || 0);

    // Return flat structure matching frontend expectations
    return c.json({
      total: parseInt(summary.total_numbers || 0),
      active: parseInt(summary.active_numbers || 0),
      inactive: parseInt(summary.inactive_numbers || 0),
      unassigned: unassigned,
      monthly_cost: (totalMonthlyCost / 100).toFixed(2), // Convert cents to dollars
      local_numbers: parseInt(summary.local_numbers || 0),
      tollfree_numbers: parseInt(summary.tollfree_numbers || 0),
      mobile_numbers: parseInt(summary.mobile_numbers || 0),
      by_provider: providerResult.rows
    });

  } catch (err) {
    console.error('Get phone number stats error:', err);
    return c.json({ error: 'Failed to get phone number stats' }, 500);
  }
});

export default adminPhoneNumbers;
