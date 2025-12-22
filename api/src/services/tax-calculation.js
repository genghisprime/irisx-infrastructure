/**
 * Tax Calculation Service
 *
 * Tax calculation with TaxJar integration for
 * automatic sales tax computation
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Tax jurisdictions
const TAX_JURISDICTIONS = {
  US: 'united_states',
  CA: 'canada',
  EU: 'european_union',
  AU: 'australia',
  GB: 'united_kingdom'
};

// Tax-exempt categories
const EXEMPT_CATEGORIES = [
  'government',
  'nonprofit',
  'resale',
  'manufacturing',
  'education'
];

/**
 * Tax Calculation Service
 */
class TaxCalculationService {
  constructor() {
    this.taxjarApiKey = process.env.TAXJAR_API_KEY;
    this.taxjarBaseUrl = 'https://api.taxjar.com/v2';
    this.ratesCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  // ============================================
  // Tax Rate Lookup
  // ============================================

  /**
   * Get tax rate for location
   */
  async getTaxRate(address) {
    const { country, state, city, zip, street } = address;

    // Check cache
    const cacheKey = `${country}:${state}:${zip}`;
    const cached = this.ratesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.rate;
    }

    let rate;

    // Use TaxJar if available
    if (this.taxjarApiKey) {
      rate = await this.getTaxJarRate(address);
    } else {
      // Fallback to simple rate lookup
      rate = await this.getSimpleRate(country, state);
    }

    // Cache the rate
    this.ratesCache.set(cacheKey, { rate, timestamp: Date.now() });

    return rate;
  }

  /**
   * Get tax rate from TaxJar
   */
  async getTaxJarRate(address) {
    const { country, state, city, zip, street } = address;

    try {
      const params = new URLSearchParams({
        country: country || 'US',
        state: state || '',
        city: city || '',
        zip: zip || '',
        street: street || ''
      });

      const response = await fetch(
        `${this.taxjarBaseUrl}/rates/${zip}?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.taxjarApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.error('[Tax] TaxJar API error:', await response.text());
        return this.getSimpleRate(country, state);
      }

      const data = await response.json();
      return {
        combinedRate: parseFloat(data.rate.combined_rate) || 0,
        stateRate: parseFloat(data.rate.state_rate) || 0,
        countyRate: parseFloat(data.rate.county_rate) || 0,
        cityRate: parseFloat(data.rate.city_rate) || 0,
        specialRate: parseFloat(data.rate.special_rate) || 0,
        country: data.rate.country,
        state: data.rate.state,
        county: data.rate.county,
        city: data.rate.city,
        zip: data.rate.zip,
        freightTaxable: data.rate.freight_taxable
      };
    } catch (error) {
      console.error('[Tax] TaxJar error:', error);
      return this.getSimpleRate(country, state);
    }
  }

  /**
   * Simple rate lookup (fallback)
   */
  async getSimpleRate(country, state) {
    // US state tax rates (simplified)
    const usRates = {
      'AL': 0.04, 'AK': 0, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
      'CO': 0.029, 'CT': 0.0635, 'DE': 0, 'FL': 0.06, 'GA': 0.04,
      'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
      'KS': 0.065, 'KY': 0.06, 'LA': 0.0445, 'ME': 0.055, 'MD': 0.06,
      'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.04225,
      'MT': 0, 'NE': 0.055, 'NV': 0.0685, 'NH': 0, 'NJ': 0.06625,
      'NM': 0.05125, 'NY': 0.08, 'NC': 0.0475, 'ND': 0.05, 'OH': 0.0575,
      'OK': 0.045, 'OR': 0, 'PA': 0.06, 'RI': 0.07, 'SC': 0.06,
      'SD': 0.045, 'TN': 0.07, 'TX': 0.0625, 'UT': 0.0485, 'VT': 0.06,
      'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04
    };

    // International VAT rates (simplified)
    const vatRates = {
      'GB': 0.20, 'DE': 0.19, 'FR': 0.20, 'IT': 0.22, 'ES': 0.21,
      'NL': 0.21, 'BE': 0.21, 'AT': 0.20, 'PL': 0.23, 'SE': 0.25,
      'DK': 0.25, 'FI': 0.24, 'IE': 0.23, 'PT': 0.23, 'GR': 0.24,
      'CA': 0.05, 'AU': 0.10
    };

    if (country === 'US' && state) {
      const rate = usRates[state.toUpperCase()] || 0;
      return {
        combinedRate: rate,
        stateRate: rate,
        countyRate: 0,
        cityRate: 0,
        specialRate: 0,
        country,
        state
      };
    }

    const rate = vatRates[country?.toUpperCase()] || 0;
    return {
      combinedRate: rate,
      stateRate: 0,
      countyRate: 0,
      cityRate: 0,
      specialRate: 0,
      country,
      state,
      isVAT: true
    };
  }

  // ============================================
  // Tax Calculation
  // ============================================

  /**
   * Calculate tax for order/invoice
   */
  async calculateTax(tenantId, orderData) {
    const {
      toAddress,
      fromAddress,
      lineItems,
      shipping = 0,
      exemptionType
    } = orderData;

    // Check for exemption
    if (exemptionType && EXEMPT_CATEGORIES.includes(exemptionType)) {
      const exemption = await this.checkExemption(tenantId, exemptionType);
      if (exemption.exempt) {
        return {
          totalTax: 0,
          taxableAmount: 0,
          exemptAmount: lineItems.reduce((sum, item) => sum + (item.amount || 0), 0) + shipping,
          exemptionApplied: exemptionType,
          breakdown: []
        };
      }
    }

    // Use TaxJar calculation if available
    if (this.taxjarApiKey) {
      return this.calculateTaxJar(orderData);
    }

    // Fallback to simple calculation
    return this.calculateSimpleTax(orderData);
  }

  /**
   * Calculate tax using TaxJar API
   */
  async calculateTaxJar(orderData) {
    const {
      toAddress,
      fromAddress,
      lineItems,
      shipping = 0,
      customerId
    } = orderData;

    try {
      const payload = {
        from_country: fromAddress?.country || 'US',
        from_zip: fromAddress?.zip,
        from_state: fromAddress?.state,
        from_city: fromAddress?.city,
        from_street: fromAddress?.street,
        to_country: toAddress.country || 'US',
        to_zip: toAddress.zip,
        to_state: toAddress.state,
        to_city: toAddress.city,
        to_street: toAddress.street,
        amount: lineItems.reduce((sum, item) => sum + (item.amount || 0), 0),
        shipping: shipping,
        customer_id: customerId,
        line_items: lineItems.map((item, index) => ({
          id: item.id || String(index),
          quantity: item.quantity || 1,
          unit_price: item.unitPrice || item.amount,
          product_tax_code: item.taxCode
        }))
      };

      const response = await fetch(`${this.taxjarBaseUrl}/taxes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.taxjarApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('[Tax] TaxJar calculation error:', await response.text());
        return this.calculateSimpleTax(orderData);
      }

      const data = await response.json();

      return {
        totalTax: data.tax.amount_to_collect,
        taxableAmount: data.tax.taxable_amount,
        rate: data.tax.rate,
        shipping: data.tax.shipping,
        hasNexus: data.tax.has_nexus,
        freightTaxable: data.tax.freight_taxable,
        breakdown: data.tax.breakdown ? {
          stateTax: data.tax.breakdown.state_taxable_amount,
          countyTax: data.tax.breakdown.county_taxable_amount,
          cityTax: data.tax.breakdown.city_taxable_amount,
          specialTax: data.tax.breakdown.special_district_taxable_amount,
          lineItems: data.tax.breakdown.line_items
        } : null,
        jurisdictions: data.tax.jurisdictions
      };
    } catch (error) {
      console.error('[Tax] TaxJar calculation error:', error);
      return this.calculateSimpleTax(orderData);
    }
  }

  /**
   * Simple tax calculation (fallback)
   */
  async calculateSimpleTax(orderData) {
    const {
      toAddress,
      lineItems,
      shipping = 0
    } = orderData;

    const rate = await this.getTaxRate(toAddress);
    const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const taxableAmount = subtotal + (rate.freightTaxable ? shipping : 0);
    const totalTax = taxableAmount * rate.combinedRate;

    return {
      totalTax: Math.round(totalTax * 100) / 100,
      taxableAmount,
      rate: rate.combinedRate,
      shipping: rate.freightTaxable ? shipping * rate.combinedRate : 0,
      breakdown: {
        stateTax: subtotal * rate.stateRate,
        countyTax: subtotal * rate.countyRate,
        cityTax: subtotal * rate.cityRate,
        specialTax: subtotal * rate.specialRate
      }
    };
  }

  // ============================================
  // Tax Exemptions
  // ============================================

  /**
   * Check if tenant has exemption
   */
  async checkExemption(tenantId, exemptionType) {
    const result = await query(`
      SELECT * FROM tax_exemptions
      WHERE tenant_id = $1
        AND exemption_type = $2
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [tenantId, exemptionType]);

    if (result.rows.length === 0) {
      return { exempt: false };
    }

    return {
      exempt: true,
      exemption: result.rows[0]
    };
  }

  /**
   * Add tax exemption
   */
  async addExemption(tenantId, exemptionData, createdBy) {
    const {
      exemptionType,
      certificateNumber,
      issuingState,
      expiresAt,
      documentUrl
    } = exemptionData;

    if (!EXEMPT_CATEGORIES.includes(exemptionType)) {
      throw new Error(`Invalid exemption type. Valid types: ${EXEMPT_CATEGORIES.join(', ')}`);
    }

    const exemptionId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO tax_exemptions (
        id, tenant_id, exemption_type, certificate_number, issuing_state,
        expires_at, document_url, is_active, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW())
      RETURNING *
    `, [
      exemptionId, tenantId, exemptionType, certificateNumber, issuingState,
      expiresAt, documentUrl, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get tenant exemptions
   */
  async getExemptions(tenantId) {
    const result = await query(`
      SELECT te.*,
        u.email as created_by_email
      FROM tax_exemptions te
      LEFT JOIN users u ON te.created_by = u.id
      WHERE te.tenant_id = $1
      ORDER BY te.created_at DESC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Revoke exemption
   */
  async revokeExemption(exemptionId, tenantId) {
    await query(`
      UPDATE tax_exemptions
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [exemptionId, tenantId]);

    return { revoked: true };
  }

  // ============================================
  // Tax Reporting
  // ============================================

  /**
   * Create tax transaction record
   */
  async recordTransaction(tenantId, transactionData) {
    const {
      orderId,
      invoiceId,
      transactionDate,
      toAddress,
      amount,
      shipping,
      taxAmount,
      taxRate,
      breakdown,
      exemptionApplied
    } = transactionData;

    const transactionId = crypto.randomUUID();

    await query(`
      INSERT INTO tax_transactions (
        id, tenant_id, order_id, invoice_id, transaction_date,
        to_country, to_state, to_city, to_zip,
        amount, shipping, tax_amount, tax_rate,
        breakdown, exemption_applied, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
    `, [
      transactionId, tenantId, orderId, invoiceId, transactionDate,
      toAddress.country, toAddress.state, toAddress.city, toAddress.zip,
      amount, shipping, taxAmount, taxRate,
      JSON.stringify(breakdown), exemptionApplied
    ]);

    return transactionId;
  }

  /**
   * Get tax summary for period
   */
  async getTaxSummary(tenantId, startDate, endDate) {
    const result = await query(`
      SELECT
        to_country,
        to_state,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        SUM(tax_amount) as total_tax,
        AVG(tax_rate) as avg_rate
      FROM tax_transactions
      WHERE tenant_id = $1
        AND transaction_date >= $2
        AND transaction_date <= $3
      GROUP BY to_country, to_state
      ORDER BY total_tax DESC
    `, [tenantId, startDate, endDate]);

    return result.rows;
  }

  /**
   * Generate tax report (for filing)
   */
  async generateTaxReport(tenantId, startDate, endDate, jurisdiction) {
    const transactions = await query(`
      SELECT * FROM tax_transactions
      WHERE tenant_id = $1
        AND transaction_date >= $2
        AND transaction_date <= $3
        AND ($4::text IS NULL OR to_state = $4)
      ORDER BY transaction_date
    `, [tenantId, startDate, endDate, jurisdiction]);

    const summary = await this.getTaxSummary(tenantId, startDate, endDate);

    return {
      period: { start: startDate, end: endDate },
      jurisdiction,
      transactions: transactions.rows,
      summary,
      totals: {
        transactionCount: transactions.rows.length,
        totalAmount: transactions.rows.reduce((sum, t) => sum + parseFloat(t.amount), 0),
        totalTax: transactions.rows.reduce((sum, t) => sum + parseFloat(t.tax_amount), 0)
      }
    };
  }

  // ============================================
  // Nexus Tracking
  // ============================================

  /**
   * Check economic nexus thresholds
   */
  async checkNexus(tenantId, state) {
    // Economic nexus thresholds (simplified - varies by state)
    const nexusThresholds = {
      'CA': { revenue: 500000, transactions: null },
      'TX': { revenue: 500000, transactions: null },
      'NY': { revenue: 500000, transactions: 100 },
      'FL': { revenue: 100000, transactions: null },
      // Default for most states
      'DEFAULT': { revenue: 100000, transactions: 200 }
    };

    const threshold = nexusThresholds[state] || nexusThresholds['DEFAULT'];

    // Get YTD totals for state
    const year = new Date().getFullYear();
    const result = await query(`
      SELECT
        COUNT(*) as transactions,
        COALESCE(SUM(amount), 0) as revenue
      FROM tax_transactions
      WHERE tenant_id = $1
        AND to_state = $2
        AND EXTRACT(YEAR FROM transaction_date) = $3
    `, [tenantId, state, year]);

    const ytd = result.rows[0];
    const hasNexus = (
      (threshold.revenue && parseFloat(ytd.revenue) >= threshold.revenue) ||
      (threshold.transactions && parseInt(ytd.transactions) >= threshold.transactions)
    );

    return {
      state,
      hasNexus,
      ytdRevenue: parseFloat(ytd.revenue),
      ytdTransactions: parseInt(ytd.transactions),
      threshold,
      revenuePercentage: threshold.revenue
        ? (parseFloat(ytd.revenue) / threshold.revenue) * 100
        : null,
      transactionPercentage: threshold.transactions
        ? (parseInt(ytd.transactions) / threshold.transactions) * 100
        : null
    };
  }

  /**
   * Get nexus status for all states
   */
  async getNexusOverview(tenantId) {
    const states = ['CA', 'TX', 'NY', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'NJ'];
    const nexusStatus = [];

    for (const state of states) {
      const status = await this.checkNexus(tenantId, state);
      if (status.ytdRevenue > 0 || status.ytdTransactions > 0) {
        nexusStatus.push(status);
      }
    }

    return nexusStatus.sort((a, b) => b.ytdRevenue - a.ytdRevenue);
  }
}

// Singleton instance
const taxCalculationService = new TaxCalculationService();

export default taxCalculationService;
export { TAX_JURISDICTIONS, EXEMPT_CATEGORIES };
