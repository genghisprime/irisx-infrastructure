import { query } from '../db/connection.js';

class BillingService {
  // ===== RATE TABLES =====

  async createRate(rateData) {
    const sql = `
      INSERT INTO rate_tables (
        prefix, destination_name, cost_per_minute, connection_fee,
        minimum_duration, billing_increment, carrier_name, carrier_priority,
        effective_date, expiration_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await query(sql, [
      rateData.prefix,
      rateData.destination_name,
      rateData.cost_per_minute,
      rateData.connection_fee || 0,
      rateData.minimum_duration || 0,
      rateData.billing_increment || 1,
      rateData.carrier_name || null,
      rateData.carrier_priority || 100,
      rateData.effective_date || new Date(),
      rateData.expiration_date || null
    ]);

    return result.rows[0];
  }

  async listRates(filters = {}) {
    let sql = 'SELECT * FROM rate_tables WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.prefix) {
      sql += ` AND prefix = $${paramIndex}`;
      params.push(filters.prefix);
      paramIndex++;
    }

    if (filters.carrier_name) {
      sql += ` AND carrier_name = $${paramIndex}`;
      params.push(filters.carrier_name);
      paramIndex++;
    }

    if (filters.is_active !== undefined) {
      sql += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    sql += ' ORDER BY prefix ASC, carrier_priority ASC';

    if (filters.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    const result = await query(sql, params);
    return result.rows;
  }

  async getRate(rateId) {
    const sql = 'SELECT * FROM rate_tables WHERE id = $1';
    const result = await query(sql, [rateId]);
    return result.rows[0];
  }

  async updateRate(rateId, updates) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
      'destination_name', 'cost_per_minute', 'connection_fee',
      'minimum_duration', 'billing_increment', 'carrier_name',
      'carrier_priority', 'effective_date', 'expiration_date', 'is_active'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        params.push(updates[field]);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = $${paramIndex}`);
    params.push(new Date());
    paramIndex++;

    params.push(rateId);

    const sql = `
      UPDATE rate_tables
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0];
  }

  async deleteRate(rateId) {
    const sql = 'UPDATE rate_tables SET is_active = FALSE WHERE id = $1 RETURNING *';
    const result = await query(sql, [rateId]);
    return result.rows[0];
  }

  // Find rate for destination (LCR - Least Cost Routing)
  async findRateForDestination(destinationNumber) {
    const sql = `
      SELECT * FROM rate_tables
      WHERE $1 LIKE (prefix || '%')
        AND is_active = TRUE
        AND effective_date <= NOW()
        AND (expiration_date IS NULL OR expiration_date >= NOW())
      ORDER BY LENGTH(prefix) DESC, carrier_priority ASC
      LIMIT 1
    `;

    const result = await query(sql, [destinationNumber]);
    return result.rows[0];
  }

  // Calculate cost for a call
  calculateCallCost(durationSeconds, rate) {
    if (!rate) return 0;

    // Apply minimum duration
    let billableSeconds = Math.max(durationSeconds, rate.minimum_duration);

    // Apply billing increment (round up)
    if (rate.billing_increment > 1) {
      billableSeconds = Math.ceil(billableSeconds / rate.billing_increment) * rate.billing_increment;
    }

    // Calculate cost
    const billableMinutes = billableSeconds / 60;
    const cost = (billableMinutes * parseFloat(rate.cost_per_minute)) + parseFloat(rate.connection_fee || 0);

    return Math.round(cost * 10000) / 10000; // Round to 4 decimal places
  }

  // ===== USAGE TRACKING =====

  async getUsageTracking(tenantId, startDate, endDate) {
    const sql = `
      SELECT *
      FROM usage_tracking
      WHERE tenant_id = $1
        AND tracking_date >= $2
        AND tracking_date <= $3
      ORDER BY tracking_date DESC
    `;

    const result = await query(sql, [tenantId, startDate, endDate]);
    return result.rows;
  }

  async getCurrentMonthUsage(tenantId) {
    const sql = `
      SELECT
        SUM(total_call_minutes) AS total_call_minutes,
        SUM(total_call_cost) AS total_call_cost,
        SUM(call_count) AS total_calls,
        SUM(total_sms_sent) AS total_sms_sent,
        SUM(total_sms_cost) AS total_sms_cost,
        SUM(total_emails_sent) AS total_emails_sent,
        SUM(total_email_cost) AS total_email_cost,
        SUM(total_cost) AS total_cost
      FROM usage_tracking
      WHERE tenant_id = $1
        AND tracking_date >= DATE_TRUNC('month', CURRENT_DATE)
    `;

    const result = await query(sql, [tenantId]);
    return result.rows[0];
  }

  async getTodayUsage(tenantId) {
    const sql = `
      SELECT *
      FROM usage_tracking
      WHERE tenant_id = $1
        AND tracking_date = CURRENT_DATE
    `;

    const result = await query(sql, [tenantId]);
    return result.rows[0] || {
      total_call_minutes: 0,
      total_call_cost: 0,
      call_count: 0,
      total_sms_sent: 0,
      total_sms_cost: 0,
      total_emails_sent: 0,
      total_email_cost: 0,
      total_cost: 0
    };
  }

  // ===== SPEND LIMITS =====

  async createSpendLimit(tenantId, limitData) {
    const sql = `
      INSERT INTO spend_limits (
        tenant_id, monthly_limit, daily_limit,
        alert_threshold_1, alert_threshold_2, action_on_exceed
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id) DO UPDATE SET
        monthly_limit = EXCLUDED.monthly_limit,
        daily_limit = EXCLUDED.daily_limit,
        alert_threshold_1 = EXCLUDED.alert_threshold_1,
        alert_threshold_2 = EXCLUDED.alert_threshold_2,
        action_on_exceed = EXCLUDED.action_on_exceed,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [
      tenantId,
      limitData.monthly_limit || null,
      limitData.daily_limit || null,
      limitData.alert_threshold_1 || 80,
      limitData.alert_threshold_2 || 100,
      limitData.action_on_exceed || 'alert'
    ]);

    return result.rows[0];
  }

  async getSpendLimit(tenantId) {
    const sql = 'SELECT * FROM spend_limits WHERE tenant_id = $1';
    const result = await query(sql, [tenantId]);
    return result.rows[0];
  }

  async checkSpendLimit(tenantId) {
    const limit = await this.getSpendLimit(tenantId);
    if (!limit || !limit.is_active) {
      return { exceeded: false, action: 'allow' };
    }

    const usage = await this.getCurrentMonthUsage(tenantId);
    const currentSpend = parseFloat(usage.total_cost || 0);

    // Check monthly limit
    if (limit.monthly_limit) {
      const monthlyPercent = (currentSpend / parseFloat(limit.monthly_limit)) * 100;

      if (monthlyPercent >= limit.alert_threshold_2) {
        return {
          exceeded: true,
          action: limit.action_on_exceed,
          currentSpend,
          limit: parseFloat(limit.monthly_limit),
          percent: monthlyPercent
        };
      }

      if (monthlyPercent >= limit.alert_threshold_1) {
        return {
          exceeded: false,
          action: 'alert',
          warning: true,
          currentSpend,
          limit: parseFloat(limit.monthly_limit),
          percent: monthlyPercent
        };
      }
    }

    // Check daily limit
    if (limit.daily_limit) {
      const todayUsage = await this.getTodayUsage(tenantId);
      const todaySpend = parseFloat(todayUsage.total_cost || 0);

      if (todaySpend >= parseFloat(limit.daily_limit)) {
        return {
          exceeded: true,
          action: limit.action_on_exceed,
          currentSpend: todaySpend,
          limit: parseFloat(limit.daily_limit),
          period: 'daily'
        };
      }
    }

    return {
      exceeded: false,
      action: 'allow',
      currentSpend,
      limit: limit.monthly_limit ? parseFloat(limit.monthly_limit) : null
    };
  }

  // ===== INVOICES =====

  async createInvoice(invoiceData) {
    // Generate invoice number
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const countSql = `
      SELECT COUNT(*) as count
      FROM invoices
      WHERE invoice_number LIKE $1
    `;
    const countResult = await query(countSql, [`INV-${year}-${month}-%`]);
    const invoiceNum = String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0');
    const invoiceNumber = `INV-${year}-${month}-${invoiceNum}`;

    const sql = `
      INSERT INTO invoices (
        tenant_id, invoice_number, billing_period_start, billing_period_end,
        subtotal_calls, subtotal_sms, subtotal_email, subscription_fee,
        subtotal, tax_rate, tax_amount, total_amount, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const subtotal = parseFloat(invoiceData.subtotal_calls || 0) +
                     parseFloat(invoiceData.subtotal_sms || 0) +
                     parseFloat(invoiceData.subtotal_email || 0) +
                     parseFloat(invoiceData.subscription_fee || 0);

    const taxAmount = subtotal * parseFloat(invoiceData.tax_rate || 0);
    const totalAmount = subtotal + taxAmount;

    const result = await query(sql, [
      invoiceData.tenant_id,
      invoiceNumber,
      invoiceData.billing_period_start,
      invoiceData.billing_period_end,
      invoiceData.subtotal_calls || 0,
      invoiceData.subtotal_sms || 0,
      invoiceData.subtotal_email || 0,
      invoiceData.subscription_fee || 0,
      subtotal,
      invoiceData.tax_rate || 0,
      taxAmount,
      totalAmount,
      'draft'
    ]);

    return result.rows[0];
  }

  async listInvoices(tenantId, filters = {}) {
    let sql = 'SELECT * FROM invoices WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (filters.status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  async getInvoice(invoiceId, tenantId) {
    const sql = 'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2';
    const result = await query(sql, [invoiceId, tenantId]);
    return result.rows[0];
  }

  async updateInvoiceStatus(invoiceId, status, updates = {}) {
    const fields = ['status = $2', 'updated_at = NOW()'];
    const params = [invoiceId, status];
    let paramIndex = 3;

    if (updates.stripe_invoice_id) {
      fields.push(`stripe_invoice_id = $${paramIndex}`);
      params.push(updates.stripe_invoice_id);
      paramIndex++;
    }

    if (updates.stripe_payment_intent_id) {
      fields.push(`stripe_payment_intent_id = $${paramIndex}`);
      params.push(updates.stripe_payment_intent_id);
      paramIndex++;
    }

    if (status === 'paid' && !updates.paid_at) {
      fields.push('paid_at = NOW()');
    } else if (updates.paid_at) {
      fields.push(`paid_at = $${paramIndex}`);
      params.push(updates.paid_at);
      paramIndex++;
    }

    const sql = `
      UPDATE invoices
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0];
  }

  // Generate invoice for previous month
  async generateMonthlyInvoice(tenantId, year, month) {
    // Get billing period
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    // Get usage summary from monthly_billing_summary view
    const usageSql = `
      SELECT *
      FROM monthly_billing_summary
      WHERE tenant_id = $1
        AND billing_month = $2
    `;

    const usageResult = await query(usageSql, [
      tenantId,
      `${year}-${String(month).padStart(2, '0')}-01`
    ]);

    const usage = usageResult.rows[0] || {};

    // Create invoice
    const invoice = await this.createInvoice({
      tenant_id: tenantId,
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      subtotal_calls: usage.total_call_cost || 0,
      subtotal_sms: usage.total_sms_cost || 0,
      subtotal_email: usage.total_email_cost || 0,
      subscription_fee: 29.99, // Base platform fee
      tax_rate: 0 // TODO: Calculate tax based on tenant location
    });

    // Create line items
    if (usage.total_calls > 0) {
      await this.createInvoiceLineItem({
        invoice_id: invoice.id,
        tenant_id: tenantId,
        item_type: 'call',
        description: `Voice calls (${usage.total_call_minutes} minutes)`,
        quantity: usage.total_call_minutes,
        unit_price: usage.total_call_cost / usage.total_call_minutes,
        amount: usage.total_call_cost
      });
    }

    if (usage.total_sms_sent > 0) {
      await this.createInvoiceLineItem({
        invoice_id: invoice.id,
        tenant_id: tenantId,
        item_type: 'sms',
        description: `SMS messages (${usage.total_sms_sent} sent)`,
        quantity: usage.total_sms_sent,
        unit_price: usage.total_sms_cost / usage.total_sms_sent,
        amount: usage.total_sms_cost
      });
    }

    if (usage.total_emails_sent > 0) {
      await this.createInvoiceLineItem({
        invoice_id: invoice.id,
        tenant_id: tenantId,
        item_type: 'email',
        description: `Email messages (${usage.total_emails_sent} sent)`,
        quantity: usage.total_emails_sent,
        unit_price: usage.total_email_cost / usage.total_emails_sent,
        amount: usage.total_email_cost
      });
    }

    // Platform subscription fee
    await this.createInvoiceLineItem({
      invoice_id: invoice.id,
      tenant_id: tenantId,
      item_type: 'subscription',
      description: 'Monthly platform subscription',
      quantity: 1,
      unit_price: 29.99,
      amount: 29.99
    });

    return invoice;
  }

  async createInvoiceLineItem(itemData) {
    const sql = `
      INSERT INTO invoice_line_items (
        invoice_id, tenant_id, item_type, description,
        quantity, unit_price, amount, reference_id, reference_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(sql, [
      itemData.invoice_id,
      itemData.tenant_id,
      itemData.item_type,
      itemData.description,
      itemData.quantity,
      itemData.unit_price,
      itemData.amount,
      itemData.reference_id || null,
      itemData.reference_type || null
    ]);

    return result.rows[0];
  }

  async getInvoiceLineItems(invoiceId) {
    const sql = `
      SELECT *
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY created_at ASC
    `;

    const result = await query(sql, [invoiceId]);
    return result.rows;
  }

  // ===== PAYMENT METHODS =====

  async createPaymentMethod(tenantId, methodData) {
    const sql = `
      INSERT INTO payment_methods (
        tenant_id, provider, provider_payment_method_id,
        type, brand, last4, exp_month, exp_year, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(sql, [
      tenantId,
      methodData.provider,
      methodData.provider_payment_method_id,
      methodData.type,
      methodData.brand || null,
      methodData.last4 || null,
      methodData.exp_month || null,
      methodData.exp_year || null,
      methodData.is_default || false
    ]);

    // If this is the default, unset other defaults
    if (methodData.is_default) {
      await query(`
        UPDATE payment_methods
        SET is_default = FALSE
        WHERE tenant_id = $1 AND id != $2
      `, [tenantId, result.rows[0].id]);
    }

    return result.rows[0];
  }

  async listPaymentMethods(tenantId) {
    const sql = `
      SELECT *
      FROM payment_methods
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC, created_at DESC
    `;

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  async getPaymentMethod(methodId, tenantId) {
    const sql = `
      SELECT *
      FROM payment_methods
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await query(sql, [methodId, tenantId]);
    return result.rows[0];
  }

  async setDefaultPaymentMethod(methodId, tenantId) {
    // Unset all defaults
    await query(`
      UPDATE payment_methods
      SET is_default = FALSE
      WHERE tenant_id = $1
    `, [tenantId]);

    // Set new default
    const sql = `
      UPDATE payment_methods
      SET is_default = TRUE, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, [methodId, tenantId]);
    return result.rows[0];
  }

  async deletePaymentMethod(methodId, tenantId) {
    const sql = `
      UPDATE payment_methods
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, [methodId, tenantId]);
    return result.rows[0];
  }
}

export default new BillingService();
