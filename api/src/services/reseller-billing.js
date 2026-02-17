/**
 * Reseller/White-Label Billing Service
 *
 * Features:
 * - Multi-tier reseller hierarchy
 * - Custom pricing per reseller
 * - Margin/markup management
 * - White-label invoice generation
 * - Reseller commission tracking
 * - Usage rollup to parent
 * - Custom branding per reseller
 */

import pool from '../db/connection.js';

// Reseller tiers
const RESELLER_TIERS = {
  BRONZE: 'bronze',      // Basic reseller
  SILVER: 'silver',      // Mid-tier with more features
  GOLD: 'gold',          // Premium with full white-label
  PLATINUM: 'platinum'   // Enterprise with custom terms
};

// Commission types
const COMMISSION_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
  TIERED: 'tiered'
};

class ResellerBillingService {
  constructor() {
    this.defaultMargins = {
      [RESELLER_TIERS.BRONZE]: 10,    // 10% margin
      [RESELLER_TIERS.SILVER]: 15,    // 15% margin
      [RESELLER_TIERS.GOLD]: 20,      // 20% margin
      [RESELLER_TIERS.PLATINUM]: 25   // 25% margin
    };
  }

  /**
   * Create a new reseller
   */
  async createReseller(data) {
    const {
      name,
      company_name,
      email,
      tier = RESELLER_TIERS.BRONZE,
      parent_reseller_id = null,
      commission_type = COMMISSION_TYPES.PERCENTAGE,
      commission_rate = null,
      custom_pricing = {},
      branding = {},
      contract_start_date = new Date(),
      contract_end_date = null,
      metadata = {}
    } = data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate commission rate based on tier if not provided
      const rate = commission_rate !== null ? commission_rate : this.defaultMargins[tier];

      // Create reseller
      const result = await client.query(`
        INSERT INTO resellers (
          name, company_name, email, tier, parent_reseller_id,
          commission_type, commission_rate, custom_pricing, branding,
          contract_start_date, contract_end_date, metadata,
          is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
        RETURNING *
      `, [
        name, company_name, email, tier, parent_reseller_id,
        commission_type, rate, JSON.stringify(custom_pricing), JSON.stringify(branding),
        contract_start_date, contract_end_date, JSON.stringify(metadata)
      ]);

      const reseller = result.rows[0];

      // Create initial balance record
      await client.query(`
        INSERT INTO reseller_balances (reseller_id, balance_cents, pending_payout_cents, total_earned_cents)
        VALUES ($1, 0, 0, 0)
      `, [reseller.id]);

      await client.query('COMMIT');

      console.log(`[Reseller] Created reseller ${reseller.id}: ${company_name} (${tier})`);

      return reseller;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Reseller] Error creating reseller:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign tenant to reseller
   */
  async assignTenantToReseller(tenantId, resellerId) {
    // Verify reseller exists
    const resellerResult = await pool.query(
      'SELECT * FROM resellers WHERE id = $1 AND is_active = true',
      [resellerId]
    );

    if (resellerResult.rows.length === 0) {
      throw new Error('Reseller not found or inactive');
    }

    // Update tenant
    const result = await pool.query(`
      UPDATE tenants
      SET reseller_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [resellerId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.rows[0];
  }

  /**
   * Get pricing for a tenant considering reseller markup
   */
  async getTenantPricing(tenantId) {
    // Get tenant with reseller info
    const result = await pool.query(`
      SELECT t.*, r.id as reseller_id, r.commission_rate, r.custom_pricing, r.tier
      FROM tenants t
      LEFT JOIN resellers r ON t.reseller_id = r.id
      WHERE t.id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = result.rows[0];

    // If no reseller, return base pricing
    if (!tenant.reseller_id) {
      return this.getBasePricing();
    }

    // Apply reseller markup
    const basePricing = this.getBasePricing();
    const customPricing = typeof tenant.custom_pricing === 'string'
      ? JSON.parse(tenant.custom_pricing)
      : tenant.custom_pricing || {};

    const markup = 1 + (tenant.commission_rate / 100);

    const tenantPricing = {};
    for (const [key, value] of Object.entries(basePricing)) {
      // Use custom price if set, otherwise apply markup
      tenantPricing[key] = customPricing[key] || Math.ceil(value * markup);
    }

    return tenantPricing;
  }

  /**
   * Get base platform pricing
   */
  getBasePricing() {
    return {
      call_per_minute_cents: 1,        // $0.01/min
      sms_per_message_cents: 1,        // $0.01/message
      mms_per_message_cents: 3,        // $0.03/message
      phone_number_monthly_cents: 100, // $1.00/month
      recording_per_minute_cents: 0.5, // $0.005/min
      transcription_per_minute_cents: 2, // $0.02/min
      tts_per_1000_chars_cents: 1,     // $0.01/1000 chars
      agent_seat_monthly_cents: 2000,  // $20/seat/month
      storage_per_gb_cents: 10         // $0.10/GB
    };
  }

  /**
   * Calculate reseller commission for a transaction
   */
  async calculateCommission(resellerId, transactionAmountCents, usageType) {
    const resellerResult = await pool.query(
      'SELECT * FROM resellers WHERE id = $1',
      [resellerId]
    );

    if (resellerResult.rows.length === 0) {
      return { commission_cents: 0, rate: 0 };
    }

    const reseller = resellerResult.rows[0];
    let commissionCents = 0;

    switch (reseller.commission_type) {
      case COMMISSION_TYPES.PERCENTAGE:
        commissionCents = Math.floor(transactionAmountCents * (reseller.commission_rate / 100));
        break;

      case COMMISSION_TYPES.FIXED:
        commissionCents = reseller.commission_rate; // Fixed amount per transaction
        break;

      case COMMISSION_TYPES.TIERED:
        // Tiered commission based on monthly volume
        const monthlyVolume = await this.getResellerMonthlyVolume(resellerId);
        const tierRate = this.getTieredRate(monthlyVolume, reseller.custom_pricing?.tiers);
        commissionCents = Math.floor(transactionAmountCents * (tierRate / 100));
        break;
    }

    return {
      commission_cents: commissionCents,
      rate: reseller.commission_rate,
      type: reseller.commission_type
    };
  }

  /**
   * Get tiered commission rate based on volume
   */
  getTieredRate(monthlyVolume, tiers) {
    if (!tiers || !Array.isArray(tiers)) {
      return 15; // Default 15%
    }

    // Tiers: [{ min: 0, rate: 10 }, { min: 10000, rate: 15 }, { min: 50000, rate: 20 }]
    let rate = tiers[0]?.rate || 10;

    for (const tier of tiers) {
      if (monthlyVolume >= tier.min) {
        rate = tier.rate;
      }
    }

    return rate;
  }

  /**
   * Get reseller's monthly transaction volume
   */
  async getResellerMonthlyVolume(resellerId) {
    const result = await pool.query(`
      SELECT COALESCE(SUM(amount_cents), 0) as volume
      FROM reseller_transactions
      WHERE reseller_id = $1
        AND created_at >= DATE_TRUNC('month', NOW())
    `, [resellerId]);

    return parseInt(result.rows[0].volume);
  }

  /**
   * Record a reseller transaction
   */
  async recordTransaction(data) {
    const {
      reseller_id,
      tenant_id,
      transaction_type,
      amount_cents,
      commission_cents,
      usage_type,
      usage_quantity,
      description,
      metadata = {}
    } = data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record transaction
      const result = await client.query(`
        INSERT INTO reseller_transactions (
          reseller_id, tenant_id, transaction_type, amount_cents,
          commission_cents, usage_type, usage_quantity, description,
          metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [
        reseller_id, tenant_id, transaction_type, amount_cents,
        commission_cents, usage_type, usage_quantity, description,
        JSON.stringify(metadata)
      ]);

      // Update reseller balance
      await client.query(`
        UPDATE reseller_balances
        SET balance_cents = balance_cents + $1,
            total_earned_cents = total_earned_cents + $1,
            updated_at = NOW()
        WHERE reseller_id = $2
      `, [commission_cents, reseller_id]);

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Reseller] Error recording transaction:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate white-label invoice for tenant
   */
  async generateWhiteLabelInvoice(tenantId, period) {
    const { start_date, end_date } = period;

    // Get tenant with reseller
    const tenantResult = await pool.query(`
      SELECT t.*, r.company_name as reseller_company, r.branding, r.custom_pricing
      FROM tenants t
      LEFT JOIN resellers r ON t.reseller_id = r.id
      WHERE t.id = $1
    `, [tenantId]);

    if (tenantResult.rows.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = tenantResult.rows[0];
    const branding = typeof tenant.branding === 'string'
      ? JSON.parse(tenant.branding)
      : tenant.branding || {};

    // Get usage for period
    const usageResult = await pool.query(`
      SELECT
        COALESCE(SUM(call_duration_seconds), 0) as total_call_seconds,
        COALESCE(SUM(sms_count), 0) as total_sms,
        COALESCE(SUM(mms_count), 0) as total_mms,
        COALESCE(SUM(recording_duration_seconds), 0) as total_recording_seconds,
        COALESCE(SUM(transcription_duration_seconds), 0) as total_transcription_seconds,
        COALESCE(SUM(tts_characters), 0) as total_tts_chars,
        COALESCE(COUNT(DISTINCT active_phone_numbers), 0) as phone_numbers,
        COALESCE(COUNT(DISTINCT agent_id), 0) as agent_seats
      FROM tenant_usage_daily
      WHERE tenant_id = $1
        AND usage_date >= $2
        AND usage_date <= $3
    `, [tenantId, start_date, end_date]);

    const usage = usageResult.rows[0];
    const pricing = await this.getTenantPricing(tenantId);

    // Calculate line items
    const lineItems = [];
    let subtotalCents = 0;

    // Calls
    if (usage.total_call_seconds > 0) {
      const callMinutes = Math.ceil(usage.total_call_seconds / 60);
      const amount = callMinutes * pricing.call_per_minute_cents;
      lineItems.push({
        description: 'Voice Calls',
        quantity: callMinutes,
        unit: 'minutes',
        unit_price_cents: pricing.call_per_minute_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // SMS
    if (usage.total_sms > 0) {
      const amount = usage.total_sms * pricing.sms_per_message_cents;
      lineItems.push({
        description: 'SMS Messages',
        quantity: usage.total_sms,
        unit: 'messages',
        unit_price_cents: pricing.sms_per_message_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // MMS
    if (usage.total_mms > 0) {
      const amount = usage.total_mms * pricing.mms_per_message_cents;
      lineItems.push({
        description: 'MMS Messages',
        quantity: usage.total_mms,
        unit: 'messages',
        unit_price_cents: pricing.mms_per_message_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // Phone Numbers
    if (usage.phone_numbers > 0) {
      const amount = usage.phone_numbers * pricing.phone_number_monthly_cents;
      lineItems.push({
        description: 'Phone Numbers',
        quantity: usage.phone_numbers,
        unit: 'numbers',
        unit_price_cents: pricing.phone_number_monthly_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // Agent Seats
    if (usage.agent_seats > 0) {
      const amount = usage.agent_seats * pricing.agent_seat_monthly_cents;
      lineItems.push({
        description: 'Agent Seats',
        quantity: usage.agent_seats,
        unit: 'seats',
        unit_price_cents: pricing.agent_seat_monthly_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // Recordings
    if (usage.total_recording_seconds > 0) {
      const recordingMinutes = Math.ceil(usage.total_recording_seconds / 60);
      const amount = recordingMinutes * pricing.recording_per_minute_cents;
      lineItems.push({
        description: 'Call Recordings',
        quantity: recordingMinutes,
        unit: 'minutes',
        unit_price_cents: pricing.recording_per_minute_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // Transcription
    if (usage.total_transcription_seconds > 0) {
      const transcriptionMinutes = Math.ceil(usage.total_transcription_seconds / 60);
      const amount = transcriptionMinutes * pricing.transcription_per_minute_cents;
      lineItems.push({
        description: 'Transcription',
        quantity: transcriptionMinutes,
        unit: 'minutes',
        unit_price_cents: pricing.transcription_per_minute_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // TTS
    if (usage.total_tts_chars > 0) {
      const ttsUnits = Math.ceil(usage.total_tts_chars / 1000);
      const amount = ttsUnits * pricing.tts_per_1000_chars_cents;
      lineItems.push({
        description: 'Text-to-Speech',
        quantity: ttsUnits,
        unit: '1000 chars',
        unit_price_cents: pricing.tts_per_1000_chars_cents,
        amount_cents: amount
      });
      subtotalCents += amount;
    }

    // Generate invoice
    const invoiceNumber = `${branding.invoice_prefix || 'INV'}-${Date.now()}`;

    const invoice = {
      invoice_number: invoiceNumber,
      tenant_id: tenantId,
      tenant_name: tenant.company_name,
      reseller_id: tenant.reseller_id,
      period: { start_date, end_date },
      line_items: lineItems,
      subtotal_cents: subtotalCents,
      tax_cents: 0, // Would calculate based on location
      total_cents: subtotalCents,
      currency: 'USD',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      branding: {
        company_name: branding.company_name || tenant.reseller_company || 'IRISX',
        logo_url: branding.logo_url,
        primary_color: branding.primary_color || '#3B82F6',
        support_email: branding.support_email,
        address: branding.address
      },
      status: 'pending',
      created_at: new Date()
    };

    // Store invoice
    const result = await pool.query(`
      INSERT INTO reseller_invoices (
        invoice_number, tenant_id, reseller_id, period_start, period_end,
        line_items, subtotal_cents, tax_cents, total_cents, currency,
        due_date, branding, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      invoice.invoice_number, tenantId, tenant.reseller_id, start_date, end_date,
      JSON.stringify(lineItems), subtotalCents, 0, subtotalCents, 'USD',
      invoice.due_date, JSON.stringify(invoice.branding), 'pending'
    ]);

    return { ...invoice, id: result.rows[0].id };
  }

  /**
   * Get reseller dashboard data
   */
  async getResellerDashboard(resellerId) {
    const [
      resellerResult,
      balanceResult,
      tenantsResult,
      revenueResult,
      topTenantsResult
    ] = await Promise.all([
      // Reseller info
      pool.query('SELECT * FROM resellers WHERE id = $1', [resellerId]),

      // Balance
      pool.query('SELECT * FROM reseller_balances WHERE reseller_id = $1', [resellerId]),

      // Tenant count
      pool.query('SELECT COUNT(*) as count FROM tenants WHERE reseller_id = $1', [resellerId]),

      // Monthly revenue
      pool.query(`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          SUM(amount_cents) as revenue,
          SUM(commission_cents) as commission
        FROM reseller_transactions
        WHERE reseller_id = $1
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `, [resellerId]),

      // Top tenants
      pool.query(`
        SELECT
          t.company_name,
          SUM(rt.amount_cents) as total_revenue,
          SUM(rt.commission_cents) as total_commission
        FROM reseller_transactions rt
        JOIN tenants t ON rt.tenant_id = t.id
        WHERE rt.reseller_id = $1
          AND rt.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY t.id, t.company_name
        ORDER BY total_revenue DESC
        LIMIT 10
      `, [resellerId])
    ]);

    return {
      reseller: resellerResult.rows[0],
      balance: balanceResult.rows[0] || { balance_cents: 0, pending_payout_cents: 0, total_earned_cents: 0 },
      tenant_count: parseInt(tenantsResult.rows[0].count),
      monthly_revenue: revenueResult.rows,
      top_tenants: topTenantsResult.rows
    };
  }

  /**
   * Request payout
   */
  async requestPayout(resellerId, amountCents) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current balance
      const balanceResult = await client.query(
        'SELECT * FROM reseller_balances WHERE reseller_id = $1 FOR UPDATE',
        [resellerId]
      );

      if (balanceResult.rows.length === 0) {
        throw new Error('Reseller balance not found');
      }

      const balance = balanceResult.rows[0];

      if (balance.balance_cents < amountCents) {
        throw new Error('Insufficient balance');
      }

      // Create payout request
      const payoutResult = await client.query(`
        INSERT INTO reseller_payouts (
          reseller_id, amount_cents, status, created_at
        ) VALUES ($1, $2, 'pending', NOW())
        RETURNING *
      `, [resellerId, amountCents]);

      // Update balance
      await client.query(`
        UPDATE reseller_balances
        SET balance_cents = balance_cents - $1,
            pending_payout_cents = pending_payout_cents + $1,
            updated_at = NOW()
        WHERE reseller_id = $2
      `, [amountCents, resellerId]);

      await client.query('COMMIT');

      return payoutResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process payout (admin)
   */
  async processPayout(payoutId, status, paymentDetails = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get payout
      const payoutResult = await client.query(
        'SELECT * FROM reseller_payouts WHERE id = $1 FOR UPDATE',
        [payoutId]
      );

      if (payoutResult.rows.length === 0) {
        throw new Error('Payout not found');
      }

      const payout = payoutResult.rows[0];

      if (payout.status !== 'pending') {
        throw new Error('Payout already processed');
      }

      // Update payout
      await client.query(`
        UPDATE reseller_payouts
        SET status = $1, payment_details = $2, processed_at = NOW()
        WHERE id = $3
      `, [status, JSON.stringify(paymentDetails), payoutId]);

      // Update balance
      if (status === 'completed') {
        await client.query(`
          UPDATE reseller_balances
          SET pending_payout_cents = pending_payout_cents - $1,
              updated_at = NOW()
          WHERE reseller_id = $2
        `, [payout.amount_cents, payout.reseller_id]);
      } else if (status === 'failed' || status === 'cancelled') {
        // Return funds to balance
        await client.query(`
          UPDATE reseller_balances
          SET pending_payout_cents = pending_payout_cents - $1,
              balance_cents = balance_cents + $1,
              updated_at = NOW()
          WHERE reseller_id = $2
        `, [payout.amount_cents, payout.reseller_id]);
      }

      await client.query('COMMIT');

      return { success: true, status };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get reseller hierarchy (for multi-tier)
   */
  async getResellerHierarchy(resellerId) {
    // Get parent chain
    const parentsResult = await pool.query(`
      WITH RECURSIVE parents AS (
        SELECT id, name, company_name, parent_reseller_id, tier, 0 as level
        FROM resellers
        WHERE id = $1

        UNION ALL

        SELECT r.id, r.name, r.company_name, r.parent_reseller_id, r.tier, p.level + 1
        FROM resellers r
        JOIN parents p ON r.id = p.parent_reseller_id
      )
      SELECT * FROM parents ORDER BY level DESC
    `, [resellerId]);

    // Get children
    const childrenResult = await pool.query(`
      WITH RECURSIVE children AS (
        SELECT id, name, company_name, parent_reseller_id, tier, 0 as level
        FROM resellers
        WHERE parent_reseller_id = $1

        UNION ALL

        SELECT r.id, r.name, r.company_name, r.parent_reseller_id, r.tier, c.level + 1
        FROM resellers r
        JOIN children c ON r.parent_reseller_id = c.id
      )
      SELECT * FROM children ORDER BY level, name
    `, [resellerId]);

    return {
      parents: parentsResult.rows,
      children: childrenResult.rows
    };
  }

  /**
   * Update reseller branding
   */
  async updateBranding(resellerId, branding) {
    const result = await pool.query(`
      UPDATE resellers
      SET branding = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(branding), resellerId]);

    return result.rows[0];
  }

  /**
   * List resellers
   */
  async listResellers(filters = {}) {
    let query = `
      SELECT r.*, rb.balance_cents, rb.total_earned_cents,
             COUNT(t.id) as tenant_count
      FROM resellers r
      LEFT JOIN reseller_balances rb ON r.id = rb.reseller_id
      LEFT JOIN tenants t ON r.id = t.reseller_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (filters.tier) {
      query += ` AND r.tier = $${paramIdx++}`;
      params.push(filters.tier);
    }

    if (filters.is_active !== undefined) {
      query += ` AND r.is_active = $${paramIdx++}`;
      params.push(filters.is_active);
    }

    if (filters.parent_reseller_id) {
      query += ` AND r.parent_reseller_id = $${paramIdx++}`;
      params.push(filters.parent_reseller_id);
    }

    query += ' GROUP BY r.id, rb.balance_cents, rb.total_earned_cents ORDER BY r.company_name';

    const result = await pool.query(query, params);
    return result.rows;
  }
}

// Export singleton
const resellerBillingService = new ResellerBillingService();
export default resellerBillingService;

// Named exports
export {
  RESELLER_TIERS,
  COMMISSION_TYPES
};
