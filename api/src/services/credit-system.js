/**
 * Credit System Service
 *
 * Advanced credit management with expiration, types,
 * promotional credits, and usage tracking
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Credit types
const CREDIT_TYPES = {
  STANDARD: 'standard',
  PROMOTIONAL: 'promotional',
  BONUS: 'bonus',
  REFERRAL: 'referral',
  COMPENSATION: 'compensation'
};

// Credit sources
const CREDIT_SOURCES = {
  PURCHASE: 'purchase',
  PROMOTION: 'promotion',
  REFERRAL: 'referral',
  SIGNUP_BONUS: 'signup_bonus',
  LOYALTY: 'loyalty',
  COMPENSATION: 'compensation',
  TRANSFER: 'transfer',
  ADMIN: 'admin'
};

/**
 * Credit System Service
 */
class CreditSystemService {
  // ============================================
  // Credit Balance Management
  // ============================================

  /**
   * Get credit balance for tenant
   */
  async getBalance(tenantId) {
    const result = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN remaining_amount ELSE 0 END), 0) as available,
        COALESCE(SUM(remaining_amount), 0) as total,
        COALESCE(SUM(CASE WHEN expires_at <= NOW() THEN remaining_amount ELSE 0 END), 0) as expired
      FROM credits
      WHERE tenant_id = $1 AND remaining_amount > 0
    `, [tenantId]);

    const balanceByType = await query(`
      SELECT
        credit_type,
        COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN remaining_amount ELSE 0 END), 0) as amount
      FROM credits
      WHERE tenant_id = $1 AND remaining_amount > 0
      GROUP BY credit_type
    `, [tenantId]);

    return {
      available: parseFloat(result.rows[0]?.available || 0),
      total: parseFloat(result.rows[0]?.total || 0),
      expired: parseFloat(result.rows[0]?.expired || 0),
      byType: balanceByType.rows.reduce((acc, row) => {
        acc[row.credit_type] = parseFloat(row.amount);
        return acc;
      }, {})
    };
  }

  /**
   * Get detailed credit breakdown
   */
  async getCreditDetails(tenantId, options = {}) {
    const { includeExpired = false, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT c.*,
        u.email as created_by_email
      FROM credits c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.tenant_id = $1
    `;

    if (!includeExpired) {
      sql += ' AND (c.expires_at IS NULL OR c.expires_at > NOW())';
    }

    sql += ' AND c.remaining_amount > 0';
    sql += ' ORDER BY c.expires_at ASC NULLS LAST, c.created_at DESC';
    sql += ` LIMIT $2 OFFSET $3`;

    const result = await query(sql, [tenantId, limit, offset]);
    return result.rows;
  }

  // ============================================
  // Credit Operations
  // ============================================

  /**
   * Add credits to tenant account
   */
  async addCredits(tenantId, creditData, createdBy = null) {
    const {
      amount,
      creditType = CREDIT_TYPES.STANDARD,
      source = CREDIT_SOURCES.ADMIN,
      expiresAt,
      expiresInDays,
      description,
      referenceId,
      metadata = {}
    } = creditData;

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // Calculate expiration
    let expiry = expiresAt ? new Date(expiresAt) : null;
    if (!expiry && expiresInDays) {
      expiry = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    const creditId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO credits (
        id, tenant_id, amount, remaining_amount, credit_type, source,
        expires_at, description, reference_id, metadata, created_by, created_at
      ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `, [
      creditId, tenantId, amount, creditType, source,
      expiry, description, referenceId, JSON.stringify(metadata), createdBy
    ]);

    // Log transaction
    await this.logTransaction(tenantId, {
      type: 'credit',
      creditId,
      amount,
      creditType,
      source,
      description,
      createdBy
    });

    return result.rows[0];
  }

  /**
   * Use credits (deduct from balance)
   */
  async useCredits(tenantId, amount, usageData = {}) {
    const {
      description,
      resourceType,
      resourceId,
      preferredType
    } = usageData;

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // Get available balance
    const balance = await this.getBalance(tenantId);
    if (balance.available < amount) {
      throw new Error(`Insufficient credits. Available: ${balance.available}, Requested: ${amount}`);
    }

    // Get credits ordered by priority (expiring first, then by type)
    let creditsSql = `
      SELECT * FROM credits
      WHERE tenant_id = $1
        AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at > NOW())
    `;

    // Prefer specific type if requested
    if (preferredType) {
      creditsSql += ` ORDER BY CASE WHEN credit_type = '${preferredType}' THEN 0 ELSE 1 END, expires_at ASC NULLS LAST`;
    } else {
      // Default: use expiring credits first, then promotional, then standard
      creditsSql += ` ORDER BY expires_at ASC NULLS LAST,
        CASE credit_type
          WHEN 'promotional' THEN 0
          WHEN 'bonus' THEN 1
          WHEN 'referral' THEN 2
          ELSE 3
        END`;
    }

    const credits = await query(creditsSql, [tenantId]);

    let remaining = amount;
    const usedCredits = [];

    // Deduct from credits
    for (const credit of credits.rows) {
      if (remaining <= 0) break;

      const deductAmount = Math.min(remaining, parseFloat(credit.remaining_amount));

      await query(`
        UPDATE credits
        SET remaining_amount = remaining_amount - $1, updated_at = NOW()
        WHERE id = $2
      `, [deductAmount, credit.id]);

      usedCredits.push({
        creditId: credit.id,
        creditType: credit.credit_type,
        amount: deductAmount
      });

      remaining -= deductAmount;
    }

    // Log transaction
    const transactionId = await this.logTransaction(tenantId, {
      type: 'debit',
      amount,
      usedCredits,
      description,
      resourceType,
      resourceId
    });

    return {
      transactionId,
      amount,
      usedCredits,
      newBalance: balance.available - amount
    };
  }

  /**
   * Refund credits
   */
  async refundCredits(tenantId, refundData, createdBy = null) {
    const {
      amount,
      originalTransactionId,
      description,
      creditType = CREDIT_TYPES.STANDARD
    } = refundData;

    // Add as new credit
    const credit = await this.addCredits(tenantId, {
      amount,
      creditType,
      source: 'refund',
      description: description || `Refund for transaction ${originalTransactionId}`,
      referenceId: originalTransactionId,
      metadata: { refund: true, originalTransaction: originalTransactionId }
    }, createdBy);

    return credit;
  }

  /**
   * Transfer credits between tenants
   */
  async transferCredits(fromTenantId, toTenantId, amount, description, createdBy = null) {
    // Deduct from source
    const debit = await this.useCredits(fromTenantId, amount, {
      description: `Transfer to tenant ${toTenantId}: ${description}`
    });

    // Add to destination
    const credit = await this.addCredits(toTenantId, {
      amount,
      creditType: CREDIT_TYPES.STANDARD,
      source: CREDIT_SOURCES.TRANSFER,
      description: `Transfer from tenant ${fromTenantId}: ${description}`,
      referenceId: debit.transactionId
    }, createdBy);

    return {
      fromTransaction: debit.transactionId,
      toCredit: credit.id,
      amount
    };
  }

  // ============================================
  // Promotional Credits
  // ============================================

  /**
   * Create promotional credit campaign
   */
  async createPromotion(promotionData, createdBy) {
    const {
      tenantId,
      name,
      code,
      amount,
      expiresInDays,
      maxRedemptions,
      perUserLimit = 1,
      minPurchase,
      validFrom,
      validUntil,
      description
    } = promotionData;

    const promotionId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO credit_promotions (
        id, tenant_id, name, code, amount, expires_in_days,
        max_redemptions, per_user_limit, min_purchase,
        valid_from, valid_until, description, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      promotionId, tenantId, name, code.toUpperCase(), amount, expiresInDays,
      maxRedemptions, perUserLimit, minPurchase,
      validFrom, validUntil, description, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Redeem promotional code
   */
  async redeemPromoCode(tenantId, userId, code) {
    // Get promotion
    const promoResult = await query(`
      SELECT * FROM credit_promotions
      WHERE code = $1 AND is_active = true
        AND (valid_from IS NULL OR valid_from <= NOW())
        AND (valid_until IS NULL OR valid_until >= NOW())
    `, [code.toUpperCase()]);

    if (promoResult.rows.length === 0) {
      throw new Error('Invalid or expired promotion code');
    }

    const promo = promoResult.rows[0];

    // Check max redemptions
    if (promo.max_redemptions) {
      const redemptionCount = await query(
        'SELECT COUNT(*) FROM credit_promotion_redemptions WHERE promotion_id = $1',
        [promo.id]
      );
      if (parseInt(redemptionCount.rows[0].count) >= promo.max_redemptions) {
        throw new Error('Promotion has reached maximum redemptions');
      }
    }

    // Check per-user limit
    if (promo.per_user_limit) {
      const userRedemptions = await query(
        'SELECT COUNT(*) FROM credit_promotion_redemptions WHERE promotion_id = $1 AND user_id = $2',
        [promo.id, userId]
      );
      if (parseInt(userRedemptions.rows[0].count) >= promo.per_user_limit) {
        throw new Error('You have already redeemed this promotion');
      }
    }

    // Add credits
    const credit = await this.addCredits(tenantId, {
      amount: promo.amount,
      creditType: CREDIT_TYPES.PROMOTIONAL,
      source: CREDIT_SOURCES.PROMOTION,
      expiresInDays: promo.expires_in_days,
      description: `Promotion: ${promo.name}`,
      referenceId: promo.id
    });

    // Record redemption
    await query(`
      INSERT INTO credit_promotion_redemptions (
        promotion_id, tenant_id, user_id, credit_id, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [promo.id, tenantId, userId, credit.id]);

    return {
      creditId: credit.id,
      amount: promo.amount,
      expiresAt: credit.expires_at,
      promotionName: promo.name
    };
  }

  // ============================================
  // Transaction Logging
  // ============================================

  /**
   * Log credit transaction
   */
  async logTransaction(tenantId, transactionData) {
    const {
      type,
      creditId,
      amount,
      creditType,
      source,
      description,
      resourceType,
      resourceId,
      usedCredits,
      createdBy
    } = transactionData;

    const transactionId = crypto.randomUUID();

    await query(`
      INSERT INTO credit_transactions (
        id, tenant_id, type, credit_id, amount, credit_type, source,
        description, resource_type, resource_id, metadata, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    `, [
      transactionId, tenantId, type, creditId, amount, creditType, source,
      description, resourceType, resourceId,
      JSON.stringify({ usedCredits }), createdBy
    ]);

    return transactionId;
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(tenantId, options = {}) {
    const { type, limit = 50, offset = 0, startDate, endDate } = options;

    let sql = `
      SELECT t.*,
        u.email as created_by_email
      FROM credit_transactions t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.tenant_id = $1
    `;
    const params = [tenantId];

    if (type) {
      params.push(type);
      sql += ` AND t.type = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND t.created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND t.created_at <= $${params.length}`;
    }

    sql += ' ORDER BY t.created_at DESC';
    sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  // ============================================
  // Expiration Management
  // ============================================

  /**
   * Get expiring credits
   */
  async getExpiringCredits(tenantId, daysAhead = 7) {
    const result = await query(`
      SELECT * FROM credits
      WHERE tenant_id = $1
        AND remaining_amount > 0
        AND expires_at IS NOT NULL
        AND expires_at <= NOW() + INTERVAL '1 day' * $2
        AND expires_at > NOW()
      ORDER BY expires_at ASC
    `, [tenantId, daysAhead]);

    return result.rows;
  }

  /**
   * Process expired credits
   */
  async processExpiredCredits() {
    // Mark expired credits
    const result = await query(`
      UPDATE credits
      SET updated_at = NOW()
      WHERE remaining_amount > 0
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      RETURNING tenant_id, id, remaining_amount
    `);

    // Log expirations
    for (const credit of result.rows) {
      await this.logTransaction(credit.tenant_id, {
        type: 'expiration',
        creditId: credit.id,
        amount: credit.remaining_amount,
        description: 'Credit expired'
      });
    }

    return { processed: result.rows.length };
  }

  /**
   * Send expiration warnings
   */
  async sendExpirationWarnings(daysAhead = 7) {
    const warnings = await query(`
      SELECT DISTINCT ON (c.tenant_id)
        c.tenant_id,
        t.name as tenant_name,
        SUM(c.remaining_amount) as expiring_amount,
        MIN(c.expires_at) as earliest_expiry
      FROM credits c
      JOIN tenants t ON c.tenant_id = t.id
      WHERE c.remaining_amount > 0
        AND c.expires_at IS NOT NULL
        AND c.expires_at <= NOW() + INTERVAL '1 day' * $1
        AND c.expires_at > NOW()
      GROUP BY c.tenant_id, t.name
      HAVING SUM(c.remaining_amount) > 0
    `, [daysAhead]);

    // Would send notification emails here
    return warnings.rows;
  }
}

// Singleton instance
const creditSystemService = new CreditSystemService();

export default creditSystemService;
export { CREDIT_TYPES, CREDIT_SOURCES };
