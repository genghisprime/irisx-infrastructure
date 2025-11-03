import pool from '../db/connection.js';

/**
 * Usage Tracking Service
 * Records and calculates API usage for billing purposes
 */

class UsageTrackingService {
  /**
   * Record a usage event
   * @param {Object} params - Usage event parameters
   * @param {number} params.tenantId - Tenant ID
   * @param {string} params.channel - Channel type (voice, sms, email, whatsapp)
   * @param {string} params.resourceType - Resource type (call, message, minute, email, mms)
   * @param {string} params.resourceId - ID of the resource (call_id, message_id, etc.)
   * @param {number} params.quantity - Quantity (e.g., minutes for calls, 1 for messages)
   * @param {Object} params.metadata - Additional metadata
   */
  async recordUsage({ tenantId, channel, resourceType, resourceId, quantity, metadata = {} }) {
    try {
      // Get tenant's pricing plan
      const planResult = await pool.query(
        `SELECT t.plan_id, pp.name as plan_name
         FROM tenants t
         LEFT JOIN pricing_plans pp ON t.plan_id = pp.id
         WHERE t.id = $1`,
        [tenantId]
      );

      if (planResult.rows.length === 0) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const { plan_id, plan_name } = planResult.rows[0];

      // Get unit cost from pricing rates
      const rateResult = await pool.query(
        `SELECT unit_price
         FROM pricing_rates
         WHERE plan_id = $1
           AND channel = $2
           AND resource_type = $3
           AND is_active = true
           AND (effective_until IS NULL OR effective_until > CURRENT_DATE)
         ORDER BY effective_from DESC
         LIMIT 1`,
        [plan_id, channel, resourceType]
      );

      const unitCost = rateResult.rows.length > 0 ? parseFloat(rateResult.rows[0].unit_price) : 0;
      const totalCost = quantity * unitCost;

      // Calculate billing period (monthly)
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Insert usage record
      const result = await pool.query(
        `INSERT INTO usage_records
         (tenant_id, channel, resource_type, resource_id, quantity, unit_cost, total_cost, metadata, period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, total_cost`,
        [
          tenantId,
          channel,
          resourceType,
          resourceId,
          quantity,
          unitCost,
          totalCost,
          JSON.stringify(metadata),
          periodStart.toISOString().split('T')[0],
          periodEnd.toISOString().split('T')[0]
        ]
      );

      // Update daily summary (upsert)
      const summaryDate = now.toISOString().split('T')[0];
      await pool.query(
        `INSERT INTO usage_summaries
         (tenant_id, summary_date, channel, resource_type, total_quantity, total_cost, record_count)
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT (tenant_id, summary_date, channel, resource_type)
         DO UPDATE SET
           total_quantity = usage_summaries.total_quantity + $5,
           total_cost = usage_summaries.total_cost + $6,
           record_count = usage_summaries.record_count + 1,
           updated_at = NOW()`,
        [tenantId, summaryDate, channel, resourceType, quantity, totalCost]
      );

      return {
        id: result.rows[0].id,
        cost: result.rows[0].total_cost,
        unit_cost: unitCost
      };
    } catch (error) {
      console.error('Error recording usage:', error);
      throw error;
    }
  }

  /**
   * Get current billing period usage for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Usage summary by channel
   */
  async getCurrentPeriodUsage(tenantId) {
    try {
      // Calculate current billing period
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Get usage using database function
      const result = await pool.query(
        `SELECT * FROM get_tenant_usage($1, $2, $3)`,
        [tenantId, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]]
      );

      // Get tenant plan and credit balance
      const tenantResult = await pool.query(
        `SELECT t.credit_balance, pp.name as plan_name, pp.display_name, pp.included_credits
         FROM tenants t
         LEFT JOIN pricing_plans pp ON t.plan_id = pp.id
         WHERE t.id = $1`,
        [tenantId]
      );

      const tenant = tenantResult.rows[0] || {};

      // Calculate totals
      const totalCost = result.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
      const totalRecords = result.rows.reduce((sum, row) => sum + parseInt(row.record_count || 0, 10), 0);

      // Group by channel
      const byChannel = {};
      result.rows.forEach(row => {
        if (!byChannel[row.channel]) {
          byChannel[row.channel] = {
            channel: row.channel,
            totalCost: 0,
            totalQuantity: 0,
            recordCount: 0,
            resources: []
          };
        }
        byChannel[row.channel].totalCost += parseFloat(row.total_cost || 0);
        byChannel[row.channel].totalQuantity += parseFloat(row.total_quantity || 0);
        byChannel[row.channel].recordCount += parseInt(row.record_count || 0, 10);
        byChannel[row.channel].resources.push({
          resourceType: row.resource_type,
          quantity: parseFloat(row.total_quantity || 0),
          cost: parseFloat(row.total_cost || 0),
          count: parseInt(row.record_count || 0, 10)
        });
      });

      return {
        tenantId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        plan: {
          name: tenant.plan_name,
          displayName: tenant.display_name,
          includedCredits: parseFloat(tenant.included_credits || 0)
        },
        summary: {
          totalCost: totalCost.toFixed(4),
          totalRecords,
          creditBalance: parseFloat(tenant.credit_balance || 0).toFixed(2),
          remainingCredits: Math.max(0, parseFloat(tenant.credit_balance || 0) - totalCost).toFixed(2)
        },
        byChannel: Object.values(byChannel)
      };
    } catch (error) {
      console.error('Error getting current period usage:', error);
      throw error;
    }
  }

  /**
   * Get usage history for a date range
   * @param {number} tenantId - Tenant ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Object} Usage history
   */
  async getUsageHistory(tenantId, startDate, endDate) {
    try {
      // Use daily summaries for faster queries
      const result = await pool.query(
        `SELECT
           summary_date,
           channel,
           resource_type,
           total_quantity,
           total_cost,
           record_count
         FROM usage_summaries
         WHERE tenant_id = $1
           AND summary_date >= $2
           AND summary_date <= $3
         ORDER BY summary_date DESC, channel, resource_type`,
        [tenantId, startDate, endDate]
      );

      // Group by date
      const byDate = {};
      result.rows.forEach(row => {
        const dateKey = row.summary_date.toISOString().split('T')[0];
        if (!byDate[dateKey]) {
          byDate[dateKey] = {
            date: dateKey,
            totalCost: 0,
            totalRecords: 0,
            channels: {}
          };
        }

        if (!byDate[dateKey].channels[row.channel]) {
          byDate[dateKey].channels[row.channel] = {
            channel: row.channel,
            totalCost: 0,
            resources: []
          };
        }

        byDate[dateKey].totalCost += parseFloat(row.total_cost || 0);
        byDate[dateKey].totalRecords += parseInt(row.record_count || 0, 10);

        byDate[dateKey].channels[row.channel].totalCost += parseFloat(row.total_cost || 0);
        byDate[dateKey].channels[row.channel].resources.push({
          resourceType: row.resource_type,
          quantity: parseFloat(row.total_quantity || 0),
          cost: parseFloat(row.total_cost || 0),
          count: parseInt(row.record_count || 0, 10)
        });
      });

      // Convert to array and format
      const history = Object.values(byDate).map(day => ({
        ...day,
        totalCost: day.totalCost.toFixed(4),
        channels: Object.values(day.channels)
      }));

      // Calculate period totals
      const periodTotal = history.reduce((sum, day) => sum + parseFloat(day.totalCost), 0);

      return {
        tenantId,
        startDate,
        endDate,
        summary: {
          totalCost: periodTotal.toFixed(4),
          dayCount: history.length
        },
        history
      };
    } catch (error) {
      console.error('Error getting usage history:', error);
      throw error;
    }
  }

  /**
   * Get invoices for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Array} List of invoices
   */
  async getInvoices(tenantId, options = {}) {
    try {
      const { status, limit = 20, offset = 0 } = options;

      let query = `
        SELECT
          i.*,
          (SELECT json_agg(
            json_build_object(
              'id', ili.id,
              'channel', ili.channel,
              'resourceType', ili.resource_type,
              'description', ili.description,
              'quantity', ili.quantity,
              'unitPrice', ili.unit_price,
              'amount', ili.amount
            )
          )
          FROM invoice_line_items ili
          WHERE ili.invoice_id = i.id) as line_items
        FROM invoices i
        WHERE i.tenant_id = $1
      `;

      const params = [tenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND i.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        subtotal: parseFloat(row.subtotal),
        tax: parseFloat(row.tax),
        totalAmount: parseFloat(row.total_amount),
        currency: row.currency,
        status: row.status,
        dueDate: row.due_date,
        paidAt: row.paid_at,
        paymentMethod: row.payment_method,
        pdfUrl: row.pdf_url,
        lineItems: row.line_items || [],
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Error getting invoices:', error);
      throw error;
    }
  }

  /**
   * Get single invoice by ID
   * @param {number} tenantId - Tenant ID
   * @param {number} invoiceId - Invoice ID
   * @returns {Object} Invoice details
   */
  async getInvoice(tenantId, invoiceId) {
    try {
      const result = await pool.query(
        `SELECT
          i.*,
          (SELECT json_agg(
            json_build_object(
              'id', ili.id,
              'channel', ili.channel,
              'resourceType', ili.resource_type,
              'description', ili.description,
              'quantity', ili.quantity,
              'unitPrice', ili.unit_price,
              'amount', ili.amount
            )
          )
          FROM invoice_line_items ili
          WHERE ili.invoice_id = i.id) as line_items
        FROM invoices i
        WHERE i.id = $1 AND i.tenant_id = $2`,
        [invoiceId, tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        subtotal: parseFloat(row.subtotal),
        tax: parseFloat(row.tax),
        totalAmount: parseFloat(row.total_amount),
        currency: row.currency,
        status: row.status,
        dueDate: row.due_date,
        paidAt: row.paid_at,
        paymentMethod: row.payment_method,
        pdfUrl: row.pdf_url,
        notes: row.notes,
        lineItems: row.line_items || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting invoice:', error);
      throw error;
    }
  }
}

export default new UsageTrackingService();
