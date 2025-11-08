/**
 * Admin Billing & Payment Management Routes
 * IRISX staff manage subscriptions, invoices, and revenue
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminBilling = new Hono();

// All routes require admin authentication
adminBilling.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createInvoiceSchema = z.object({
  tenant_id: z.number().int().positive(),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  due_date: z.string().datetime().optional(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unit_price: z.number().positive()
  })).optional()
});

const updateSubscriptionSchema = z.object({
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']),
  mrr: z.number().min(0).optional(),
  billing_cycle: z.enum(['monthly', 'annual']).optional()
});

const extendTrialSchema = z.object({
  days: z.number().int().positive().max(90)
});

const refundSchema = z.object({
  invoice_id: z.number().int().positive(),
  amount: z.number().positive(),
  reason: z.string().min(1).max(500)
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
 * GET /admin/billing/invoices
 * List all invoices across all tenants
 */
adminBilling.get('/invoices', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const status = c.req.query('status'); // paid, pending, overdue, cancelled
    const tenant_id = c.req.query('tenant_id');
    const search = c.req.query('search'); // search by tenant name or invoice number

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['1=1'];  // invoices table has no deleted_at column
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`i.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (tenant_id) {
      whereConditions.push(`i.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(t.name ILIKE $${paramIndex} OR i.invoice_number ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM invoices i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get invoices
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        i.id,
        i.tenant_id,
        t.name as tenant_name,
        t.name as company_name,
        i.invoice_number,
        i.amount_cents,
        i.currency,
        i.status,
        i.due_date,
        i.paid_at,
        i.line_items,
        i.period_start,
        i.period_end,
        i.created_at,
        i.updated_at
       FROM invoices i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.invoices.list', null, null, { filters: { status, tenant_id } }, c.req);

    return c.json({
      invoices: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List invoices error:', err);
    return c.json({ error: 'Failed to list invoices' }, 500);
  }
});

/**
 * GET /admin/billing/invoices/:id
 * Get invoice details
 */
adminBilling.get('/invoices/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        i.id,
        i.tenant_id,
        t.name as tenant_name,
        t.name as company_name,
        t.billing_email as tenant_email,
        i.invoice_number,
        i.amount_cents,
        i.currency,
        i.status,
        i.due_date,
        i.paid_at,
        i.line_items,
        i.period_start,
        i.period_end,
        i.created_at,
        i.updated_at,
        i.metadata
       FROM invoices i
       JOIN tenants t ON i.tenant_id = t.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    await logAdminAction(admin.id, 'admin.invoice.view', 'invoice', id, null, c.req);

    return c.json({ invoice: result.rows[0] });

  } catch (err) {
    console.error('Get invoice error:', err);
    return c.json({ error: 'Failed to get invoice' }, 500);
  }
});

/**
 * POST /admin/billing/invoices
 * Create a manual invoice
 */
adminBilling.post('/invoices', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Validate request
    const validation = createInvoiceSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { tenant_id, amount, description, due_date, items } = validation.data;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Generate invoice number (format: INV-YYYY-XXXXXX)
    const year = new Date().getFullYear();
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM invoices WHERE created_at >= $1',
      [`${year}-01-01`]
    );
    const invoiceCount = parseInt(countResult.rows[0].count) + 1;
    const invoiceNumber = `INV-${year}-${String(invoiceCount).padStart(6, '0')}`;

    // Calculate due date (30 days from now if not provided)
    const invoiceDueDate = due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Create invoice
    const result = await pool.query(
      `INSERT INTO invoices (
        tenant_id, invoice_number, amount_cents, currency, due_date, status, line_items, created_by
      ) VALUES ($1, $2, $3, 'USD', $4, 'pending', $5, $6)
      RETURNING id, invoice_number, amount_cents, status, due_date, created_at`,
      [tenant_id, invoiceNumber, Math.round(amount * 100), invoiceDueDate, items ? JSON.stringify(items) : null, admin.id]
    );

    const invoice = result.rows[0];

    // Log admin action
    await logAdminAction(admin.id, 'admin.invoice.create', 'invoice', invoice.id, {
      tenant_id,
      amount,
      invoice_number: invoiceNumber
    }, c.req);

    return c.json({
      success: true,
      invoice
    }, 201);

  } catch (err) {
    console.error('Create invoice error:', err);
    return c.json({ error: 'Failed to create invoice' }, 500);
  }
});

/**
 * PATCH /admin/tenants/:tenantId/subscription
 * Update tenant subscription plan
 */
adminBilling.patch('/tenants/:tenantId/subscription', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Validate request
    const validation = updateSubscriptionSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { plan, mrr, billing_cycle } = validation.data;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name, plan FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantCheck.rows[0];
    const oldPlan = tenant.plan;

    // Get or create subscription
    let subscription = await pool.query(
      'SELECT id, plan, status FROM subscriptions WHERE tenant_id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    let subscriptionId;

    if (subscription.rows.length === 0) {
      // Create new subscription
      const newSub = await pool.query(
        `INSERT INTO subscriptions (tenant_id, plan, mrr, billing_cycle, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [tenantId, plan, mrr || 0, billing_cycle || 'monthly']
      );
      subscriptionId = newSub.rows[0].id;
    } else {
      // Update existing subscription
      subscriptionId = subscription.rows[0].id;

      const updates = ['plan = $1'];
      const values = [plan];
      let paramIndex = 2;

      if (mrr !== undefined) {
        updates.push(`mrr = $${paramIndex}`);
        values.push(mrr);
        paramIndex++;
      }

      if (billing_cycle) {
        updates.push(`billing_cycle = $${paramIndex}`);
        values.push(billing_cycle);
        paramIndex++;
      }

      values.push(subscriptionId);

      await pool.query(
        `UPDATE subscriptions
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex}`,
        values
      );
    }

    // Update tenant plan
    await pool.query(
      'UPDATE tenants SET plan = $1, updated_at = NOW() WHERE id = $2',
      [plan, tenantId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.subscription.update', 'subscription', subscriptionId, {
      tenant_id: tenantId,
      old_plan: oldPlan,
      new_plan: plan,
      mrr,
      billing_cycle
    }, c.req);

    return c.json({
      success: true,
      message: `Subscription updated from ${oldPlan} to ${plan}`,
      subscription: {
        id: subscriptionId,
        plan,
        mrr: mrr || 0,
        billing_cycle: billing_cycle || 'monthly'
      }
    });

  } catch (err) {
    console.error('Update subscription error:', err);
    return c.json({ error: 'Failed to update subscription' }, 500);
  }
});

/**
 * POST /admin/tenants/:tenantId/extend-trial
 * Extend trial period for a tenant
 */
adminBilling.post('/tenants/:tenantId/extend-trial', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Validate request
    const validation = extendTrialSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { days } = validation.data;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name, trial_ends_at FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantCheck.rows[0];
    const currentTrialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();

    // If trial already ended, start from now
    const baseDate = currentTrialEnd > new Date() ? currentTrialEnd : new Date();
    const newTrialEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    // Update trial end date
    await pool.query(
      'UPDATE tenants SET trial_ends_at = $1, updated_at = NOW() WHERE id = $2',
      [newTrialEnd, tenantId]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.trial.extend', 'tenant', tenantId, {
      days_added: days,
      old_trial_end: tenant.trial_ends_at,
      new_trial_end: newTrialEnd
    }, c.req);

    return c.json({
      success: true,
      message: `Trial extended by ${days} days`,
      trial_ends_at: newTrialEnd
    });

  } catch (err) {
    console.error('Extend trial error:', err);
    return c.json({ error: 'Failed to extend trial' }, 500);
  }
});

/**
 * POST /admin/billing/refunds
 * Issue a refund (superadmin only)
 */
adminBilling.post('/refunds', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only superadmin can issue refunds
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can issue refunds' }, 403);
    }

    // Validate request
    const validation = refundSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { invoice_id, amount, reason } = validation.data;

    // Check if invoice exists
    const invoiceCheck = await pool.query(
      'SELECT id, tenant_id, amount_cents, status FROM invoices WHERE id = $1',
      [invoice_id]
    );

    if (invoiceCheck.rows.length === 0) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    const invoice = invoiceCheck.rows[0];

    if (invoice.status !== 'paid') {
      return c.json({ error: 'Cannot refund unpaid invoice' }, 400);
    }

    // Convert amount to cents for comparison
    const amountCents = Math.round(amount * 100);

    if (amountCents > invoice.amount_cents) {
      return c.json({ error: 'Refund amount exceeds invoice amount' }, 400);
    }

    // Create refund record (you'll need to create this table)
    // For now, just update invoice metadata
    await pool.query(
      `UPDATE invoices
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{refunds}',
         COALESCE(metadata->'refunds', '[]'::jsonb) || jsonb_build_object(
           'amount_cents', $1,
           'reason', $2,
           'issued_by', $3,
           'issued_at', NOW()
         )
       ),
       updated_at = NOW()
       WHERE id = $4`,
      [amountCents, reason, admin.id, invoice_id]
    );

    // If full refund, mark invoice as refunded
    if (amountCents === invoice.amount_cents) {
      await pool.query(
        'UPDATE invoices SET status = $1 WHERE id = $2',
        ['refunded', invoice_id]
      );
    }

    // Log admin action
    await logAdminAction(admin.id, 'admin.refund.issue', 'invoice', invoice_id, {
      amount,
      reason,
      tenant_id: invoice.tenant_id
    }, c.req);

    return c.json({
      success: true,
      message: amountCents === invoice.amount_cents ? 'Full refund issued' : 'Partial refund issued',
      refund: {
        invoice_id,
        amount,
        amount_cents: amountCents,
        reason,
        issued_at: new Date()
      }
    });

  } catch (err) {
    console.error('Issue refund error:', err);
    return c.json({ error: 'Failed to issue refund' }, 500);
  }
});

/**
 * GET /admin/billing/revenue
 * Get revenue reports
 */
adminBilling.get('/revenue', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters - support both formats
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const reportType = c.req.query('report_type') || 'mrr';
    const period = c.req.query('period') || '30d';
    const groupBy = c.req.query('groupBy') || 'month';

    // Build date filter based on parameters
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND i.created_at >= '${startDate}' AND i.created_at <= '${endDate}'`;
    } else {
      switch (period) {
        case '7d':
          dateFilter = "AND i.created_at >= NOW() - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND i.created_at >= NOW() - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND i.created_at >= NOW() - INTERVAL '90 days'";
          break;
        case '1y':
          dateFilter = "AND i.created_at >= NOW() - INTERVAL '1 year'";
          break;
        default:
          dateFilter = '';
      }
    }

    // Total revenue
    const totalResult = await pool.query(
      `SELECT
        SUM(amount_cents) as total_revenue,
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_invoices,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_invoices,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_invoices
       FROM invoices i
       WHERE 1=1 ${dateFilter}`
    );

    // Revenue by tenant
    const tenantResult = await pool.query(
      `SELECT
        t.id,
        t.name,
        t.plan,
        COUNT(DISTINCT i.id) as invoice_count,
        SUM(i.amount_cents) as total_revenue
       FROM tenants t
       LEFT JOIN invoices i ON t.id = i.tenant_id AND i.status = 'paid'
       WHERE t.deleted_at IS NULL AND t.status = 'active'
       GROUP BY t.id, t.name, t.plan
       ORDER BY total_revenue DESC NULLS LAST
       LIMIT 10`
    );

    // Monthly revenue trend
    const monthlyResult = await pool.query(
      `SELECT
        DATE_TRUNC('month', i.created_at) as month,
        SUM(i.amount_cents) as total_revenue,
        COUNT(*) as invoice_count
       FROM invoices i
       WHERE i.status = 'paid' ${dateFilter}
       GROUP BY DATE_TRUNC('month', i.created_at)
       ORDER BY month DESC
       LIMIT 12`
    );

    return c.json({
      summary: totalResult.rows[0],
      by_tenant: tenantResult.rows,
      monthly_trend: monthlyResult.rows
    });

  } catch (err) {
    console.error('Get revenue error:', err);
    return c.json({ error: 'Failed to get revenue data' }, 500);
  }
});

export default adminBilling;
