/**
 * Admin Reseller Management API Routes
 *
 * Endpoints for reseller/white-label billing administration
 */

import { Router } from 'express';
import resellerBillingService, { RESELLER_TIERS, COMMISSION_TYPES } from '../services/reseller-billing.js';

const router = Router();

// ============================================
// Reseller CRUD
// ============================================

/**
 * GET /admin/resellers
 * List all resellers
 */
router.get('/', async (req, res) => {
  try {
    const { tier, is_active, parent_reseller_id } = req.query;
    const resellers = await resellerBillingService.listResellers({
      tier,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      parent_reseller_id
    });

    res.json({
      resellers,
      tiers: Object.values(RESELLER_TIERS),
      commission_types: Object.values(COMMISSION_TYPES)
    });
  } catch (error) {
    console.error('Error listing resellers:', error);
    res.status(500).json({ error: 'Failed to list resellers' });
  }
});

/**
 * GET /admin/resellers/:id
 * Get reseller details
 */
router.get('/:id', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      'SELECT * FROM resellers WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    res.json({ reseller: result.rows[0] });
  } catch (error) {
    console.error('Error getting reseller:', error);
    res.status(500).json({ error: 'Failed to get reseller' });
  }
});

/**
 * POST /admin/resellers
 * Create a new reseller
 */
router.post('/', async (req, res) => {
  try {
    const reseller = await resellerBillingService.createReseller(req.body);
    res.status(201).json({ reseller });
  } catch (error) {
    console.error('Error creating reseller:', error);
    res.status(500).json({ error: error.message || 'Failed to create reseller' });
  }
});

/**
 * PATCH /admin/resellers/:id
 * Update reseller
 */
router.patch('/:id', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    const updates = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = [
      'name', 'company_name', 'email', 'tier', 'commission_type',
      'commission_rate', 'custom_pricing', 'branding', 'is_active',
      'contract_start_date', 'contract_end_date', 'metadata'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (['custom_pricing', 'branding', 'metadata'].includes(field)) {
          value = JSON.stringify(value);
        }
        updates.push(`${field} = $${paramIdx++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(`
      UPDATE resellers
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    res.json({ reseller: result.rows[0] });
  } catch (error) {
    console.error('Error updating reseller:', error);
    res.status(500).json({ error: 'Failed to update reseller' });
  }
});

/**
 * DELETE /admin/resellers/:id
 * Delete/deactivate reseller
 */
router.delete('/:id', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    // Soft delete (deactivate)
    const result = await pool.query(`
      UPDATE resellers
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    res.json({ success: true, reseller: result.rows[0] });
  } catch (error) {
    console.error('Error deleting reseller:', error);
    res.status(500).json({ error: 'Failed to delete reseller' });
  }
});

// ============================================
// Dashboard & Analytics
// ============================================

/**
 * GET /admin/resellers/:id/dashboard
 * Get reseller dashboard data
 */
router.get('/:id/dashboard', async (req, res) => {
  try {
    const dashboard = await resellerBillingService.getResellerDashboard(req.params.id);
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting reseller dashboard:', error);
    res.status(500).json({ error: 'Failed to get reseller dashboard' });
  }
});

/**
 * GET /admin/resellers/:id/hierarchy
 * Get reseller hierarchy (parents and children)
 */
router.get('/:id/hierarchy', async (req, res) => {
  try {
    const hierarchy = await resellerBillingService.getResellerHierarchy(req.params.id);
    res.json(hierarchy);
  } catch (error) {
    console.error('Error getting reseller hierarchy:', error);
    res.status(500).json({ error: 'Failed to get reseller hierarchy' });
  }
});

// ============================================
// Tenant Management
// ============================================

/**
 * GET /admin/resellers/:id/tenants
 * Get tenants assigned to reseller
 */
router.get('/:id/tenants', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(`
      SELECT t.*,
             COALESCE(SUM(rt.amount_cents), 0) as total_revenue,
             COALESCE(SUM(rt.commission_cents), 0) as total_commission
      FROM tenants t
      LEFT JOIN reseller_transactions rt ON t.id = rt.tenant_id
      WHERE t.reseller_id = $1
      GROUP BY t.id
      ORDER BY t.company_name
    `, [req.params.id]);

    res.json({ tenants: result.rows });
  } catch (error) {
    console.error('Error getting reseller tenants:', error);
    res.status(500).json({ error: 'Failed to get reseller tenants' });
  }
});

/**
 * POST /admin/resellers/:id/tenants/:tenantId
 * Assign tenant to reseller
 */
router.post('/:id/tenants/:tenantId', async (req, res) => {
  try {
    const tenant = await resellerBillingService.assignTenantToReseller(
      req.params.tenantId,
      req.params.id
    );
    res.json({ success: true, tenant });
  } catch (error) {
    console.error('Error assigning tenant:', error);
    res.status(500).json({ error: error.message || 'Failed to assign tenant' });
  }
});

/**
 * DELETE /admin/resellers/:id/tenants/:tenantId
 * Remove tenant from reseller
 */
router.delete('/:id/tenants/:tenantId', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    await pool.query(
      'UPDATE tenants SET reseller_id = NULL, updated_at = NOW() WHERE id = $1 AND reseller_id = $2',
      [req.params.tenantId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing tenant:', error);
    res.status(500).json({ error: 'Failed to remove tenant from reseller' });
  }
});

// ============================================
// Transactions & Commissions
// ============================================

/**
 * GET /admin/resellers/:id/transactions
 * Get reseller transactions
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const { limit = 100, offset = 0, start_date, end_date } = req.query;
    const { pool } = await import('../db.js');

    let query = `
      SELECT rt.*, t.company_name as tenant_name
      FROM reseller_transactions rt
      LEFT JOIN tenants t ON rt.tenant_id = t.id
      WHERE rt.reseller_id = $1
    `;
    const params = [req.params.id];
    let paramIdx = 2;

    if (start_date) {
      query += ` AND rt.created_at >= $${paramIdx++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND rt.created_at <= $${paramIdx++}`;
      params.push(end_date);
    }

    query += ` ORDER BY rt.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const result = await pool.query(query, params);
    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

/**
 * POST /admin/resellers/:id/transactions
 * Record a manual transaction (adjustment/bonus)
 */
router.post('/:id/transactions', async (req, res) => {
  try {
    const { transaction_type, amount_cents, description, tenant_id } = req.body;

    if (!transaction_type || !amount_cents) {
      return res.status(400).json({ error: 'transaction_type and amount_cents are required' });
    }

    const transaction = await resellerBillingService.recordTransaction({
      reseller_id: req.params.id,
      tenant_id,
      transaction_type,
      amount_cents,
      commission_cents: amount_cents, // For manual transactions, commission = amount
      description,
      metadata: { created_by: req.admin?.id, manual: true }
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Error recording transaction:', error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

// ============================================
// Payouts
// ============================================

/**
 * GET /admin/resellers/:id/payouts
 * Get reseller payout history
 */
router.get('/:id/payouts', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(`
      SELECT * FROM reseller_payouts
      WHERE reseller_id = $1
      ORDER BY created_at DESC
    `, [req.params.id]);

    res.json({ payouts: result.rows });
  } catch (error) {
    console.error('Error getting payouts:', error);
    res.status(500).json({ error: 'Failed to get payouts' });
  }
});

/**
 * POST /admin/resellers/:id/payouts
 * Request a payout (reseller action)
 */
router.post('/:id/payouts', async (req, res) => {
  try {
    const { amount_cents } = req.body;

    if (!amount_cents || amount_cents <= 0) {
      return res.status(400).json({ error: 'Valid amount_cents is required' });
    }

    const payout = await resellerBillingService.requestPayout(req.params.id, amount_cents);
    res.status(201).json({ payout });
  } catch (error) {
    console.error('Error requesting payout:', error);
    res.status(500).json({ error: error.message || 'Failed to request payout' });
  }
});

/**
 * PATCH /admin/resellers/payouts/:payoutId/process
 * Process a payout (admin action)
 */
router.patch('/payouts/:payoutId/process', async (req, res) => {
  try {
    const { status, payment_details } = req.body;

    if (!['processing', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await resellerBillingService.processPayout(
      req.params.payoutId,
      status,
      payment_details || {}
    );

    res.json(result);
  } catch (error) {
    console.error('Error processing payout:', error);
    res.status(500).json({ error: error.message || 'Failed to process payout' });
  }
});

/**
 * GET /admin/resellers/payouts/pending
 * Get all pending payouts (admin view)
 */
router.get('/payouts/pending', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(`
      SELECT p.*, r.company_name as reseller_company, r.email as reseller_email
      FROM reseller_payouts p
      JOIN resellers r ON p.reseller_id = r.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at ASC
    `);

    res.json({ payouts: result.rows });
  } catch (error) {
    console.error('Error getting pending payouts:', error);
    res.status(500).json({ error: 'Failed to get pending payouts' });
  }
});

// ============================================
// Invoices
// ============================================

/**
 * GET /admin/resellers/:id/invoices
 * Get reseller's white-label invoices
 */
router.get('/:id/invoices', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(`
      SELECT ri.*, t.company_name as tenant_name
      FROM reseller_invoices ri
      JOIN tenants t ON ri.tenant_id = t.id
      WHERE ri.reseller_id = $1
      ORDER BY ri.created_at DESC
    `, [req.params.id]);

    res.json({ invoices: result.rows });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

/**
 * POST /admin/resellers/:resellerId/invoices/:tenantId
 * Generate white-label invoice for a tenant
 */
router.post('/:resellerId/invoices/:tenantId', async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    const invoice = await resellerBillingService.generateWhiteLabelInvoice(
      req.params.tenantId,
      { start_date, end_date }
    );

    res.status(201).json({ invoice });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to generate invoice' });
  }
});

// ============================================
// Branding
// ============================================

/**
 * PATCH /admin/resellers/:id/branding
 * Update reseller branding
 */
router.patch('/:id/branding', async (req, res) => {
  try {
    const reseller = await resellerBillingService.updateBranding(req.params.id, req.body);
    res.json({ reseller });
  } catch (error) {
    console.error('Error updating branding:', error);
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

// ============================================
// Pricing
// ============================================

/**
 * GET /admin/resellers/:id/pricing
 * Get reseller's pricing configuration
 */
router.get('/:id/pricing', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    // Get reseller
    const resellerResult = await pool.query(
      'SELECT * FROM resellers WHERE id = $1',
      [req.params.id]
    );

    if (resellerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    const reseller = resellerResult.rows[0];
    const basePricing = resellerBillingService.getBasePricing();
    const markup = 1 + (reseller.commission_rate / 100);

    // Calculate effective pricing
    const effectivePricing = {};
    const customPricing = typeof reseller.custom_pricing === 'string'
      ? JSON.parse(reseller.custom_pricing)
      : reseller.custom_pricing || {};

    for (const [key, basePrice] of Object.entries(basePricing)) {
      effectivePricing[key] = {
        base_price_cents: basePrice,
        custom_price_cents: customPricing[key] || null,
        effective_price_cents: customPricing[key] || Math.ceil(basePrice * markup),
        markup_percent: customPricing[key] ? null : reseller.commission_rate
      };
    }

    res.json({
      base_pricing: basePricing,
      commission_rate: reseller.commission_rate,
      custom_pricing: customPricing,
      effective_pricing: effectivePricing
    });
  } catch (error) {
    console.error('Error getting pricing:', error);
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

/**
 * PATCH /admin/resellers/:id/pricing
 * Update reseller's custom pricing
 */
router.patch('/:id/pricing', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const { custom_pricing } = req.body;

    const result = await pool.query(`
      UPDATE resellers
      SET custom_pricing = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(custom_pricing), req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller not found' });
    }

    res.json({ reseller: result.rows[0] });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

export default router;
