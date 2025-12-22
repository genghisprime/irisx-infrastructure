/**
 * Dunning Service - Failed Payment Recovery
 *
 * Handles automatic recovery of failed payments:
 * - Tracks payment failure attempts
 * - Sends reminder emails at configured intervals
 * - Retries payment collection
 * - Suspends/cancels accounts after max retries
 *
 * Based on: IRIS_Billing_Payments.md - Dunning & Failed Payment Recovery
 */

import { query } from '../db/connection.js';
import stripeService from './stripe.js';

// Dunning schedule configuration
const DUNNING_CONFIG = {
  // Days after initial failure for each retry attempt
  retrySchedule: [1, 3, 7, 14],
  // Days after initial failure for each reminder email
  reminderSchedule: [0, 3, 7, 10, 14],
  // Max days before account suspension
  suspendAfterDays: 14,
  // Max days before account cancellation (after suspension)
  cancelAfterDays: 30,
  // Grace period days where account remains active
  gracePeriodDays: 7
};

class DunningService {
  constructor() {
    this.config = DUNNING_CONFIG;
  }

  // ===== DUNNING RECORD MANAGEMENT =====

  /**
   * Create or update dunning record for a failed payment
   */
  async createDunningRecord(tenantId, options = {}) {
    try {
      const {
        invoice_id = null,
        stripe_invoice_id = null,
        amount = 0,
        currency = 'usd',
        failure_reason = null
      } = options;

      // Check if there's an existing active dunning record
      const existingResult = await query(
        `SELECT id, attempt_count FROM dunning_records
         WHERE tenant_id = $1 AND status IN ('pending', 'in_progress')
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      );

      if (existingResult.rows.length > 0) {
        // Update existing record
        const existing = existingResult.rows[0];
        const newAttemptCount = existing.attempt_count + 1;

        await query(
          `UPDATE dunning_records
           SET attempt_count = $1,
               last_attempt_at = NOW(),
               last_failure_reason = $2,
               status = 'in_progress',
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [newAttemptCount, failure_reason, existing.id]
        );

        await this.logDunningEvent(existing.id, 'payment_retry_failed', {
          attempt_count: newAttemptCount,
          failure_reason
        });

        return { id: existing.id, new_record: false };
      }

      // Create new dunning record
      const result = await query(
        `INSERT INTO dunning_records (
          tenant_id, invoice_id, stripe_invoice_id,
          amount, currency, status, attempt_count,
          first_failed_at, last_attempt_at, last_failure_reason,
          next_retry_at, next_reminder_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', 1, NOW(), NOW(), $6, $7, NOW())
        RETURNING id`,
        [
          tenantId,
          invoice_id,
          stripe_invoice_id,
          amount,
          currency,
          failure_reason,
          this.calculateNextRetryDate(1)
        ]
      );

      const dunningId = result.rows[0].id;

      await this.logDunningEvent(dunningId, 'dunning_started', {
        invoice_id,
        stripe_invoice_id,
        amount,
        currency,
        failure_reason
      });

      // Send initial failure notification
      await this.sendDunningEmail(tenantId, 'payment_failed', {
        amount,
        currency,
        failure_reason
      });

      return { id: dunningId, new_record: true };

    } catch (error) {
      console.error('[Dunning] Error creating dunning record:', error);
      throw error;
    }
  }

  /**
   * Get active dunning record for a tenant
   */
  async getActiveDunning(tenantId) {
    const result = await query(
      `SELECT dr.*, t.name as tenant_name, t.billing_email
       FROM dunning_records dr
       JOIN tenants t ON t.id = dr.tenant_id
       WHERE dr.tenant_id = $1 AND dr.status IN ('pending', 'in_progress')
       ORDER BY dr.created_at DESC LIMIT 1`,
      [tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all dunning records due for retry
   */
  async getDunningRecordsDueForRetry() {
    const result = await query(
      `SELECT dr.*, t.name as tenant_name, t.stripe_customer_id
       FROM dunning_records dr
       JOIN tenants t ON t.id = dr.tenant_id
       WHERE dr.status IN ('pending', 'in_progress')
         AND dr.next_retry_at <= NOW()
         AND dr.attempt_count < $1
       ORDER BY dr.next_retry_at ASC`,
      [this.config.retrySchedule.length]
    );

    return result.rows;
  }

  /**
   * Get all dunning records due for reminder email
   */
  async getDunningRecordsDueForReminder() {
    const result = await query(
      `SELECT dr.*, t.name as tenant_name, t.billing_email
       FROM dunning_records dr
       JOIN tenants t ON t.id = dr.tenant_id
       WHERE dr.status IN ('pending', 'in_progress')
         AND dr.next_reminder_at <= NOW()
         AND dr.reminder_count < $1
       ORDER BY dr.next_reminder_at ASC`,
      [this.config.reminderSchedule.length]
    );

    return result.rows;
  }

  /**
   * Get tenants due for suspension
   */
  async getTenantsDueForSuspension() {
    const suspendThreshold = new Date();
    suspendThreshold.setDate(suspendThreshold.getDate() - this.config.suspendAfterDays);

    const result = await query(
      `SELECT DISTINCT dr.tenant_id, dr.id as dunning_id, t.name as tenant_name
       FROM dunning_records dr
       JOIN tenants t ON t.id = dr.tenant_id
       WHERE dr.status = 'in_progress'
         AND dr.first_failed_at <= $1
         AND t.status = 'active'
       ORDER BY dr.first_failed_at ASC`,
      [suspendThreshold]
    );

    return result.rows;
  }

  // ===== PAYMENT RETRY =====

  /**
   * Retry payment collection for a dunning record
   */
  async retryPayment(dunningId) {
    try {
      const dunning = await this.getDunningById(dunningId);
      if (!dunning) {
        throw new Error('Dunning record not found');
      }

      if (dunning.status === 'resolved' || dunning.status === 'canceled') {
        throw new Error('Dunning record is already closed');
      }

      console.log(`[Dunning] Retrying payment for tenant ${dunning.tenant_id}, attempt ${dunning.attempt_count + 1}`);

      // Try to charge via Stripe
      let paymentResult;
      try {
        if (dunning.stripe_invoice_id) {
          // Retry Stripe invoice
          paymentResult = await stripeService.payInvoice(dunning.stripe_invoice_id);
        } else {
          // Direct charge
          paymentResult = await stripeService.chargeCustomer(
            dunning.tenant_id,
            dunning.amount,
            dunning.currency,
            {
              description: `Payment retry - Dunning ID: ${dunningId}`,
              invoice_id: dunning.invoice_id
            }
          );
        }

        // Payment succeeded!
        await this.resolveDunning(dunningId, 'payment_succeeded');

        return {
          success: true,
          payment_intent_id: paymentResult.id,
          message: 'Payment successfully collected'
        };

      } catch (paymentError) {
        // Payment failed again
        const newAttemptCount = dunning.attempt_count + 1;
        const isMaxRetries = newAttemptCount >= this.config.retrySchedule.length;

        await query(
          `UPDATE dunning_records
           SET attempt_count = $1,
               last_attempt_at = NOW(),
               last_failure_reason = $2,
               next_retry_at = $3,
               status = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [
            newAttemptCount,
            paymentError.message,
            isMaxRetries ? null : this.calculateNextRetryDate(newAttemptCount),
            isMaxRetries ? 'max_retries' : 'in_progress',
            dunningId
          ]
        );

        await this.logDunningEvent(dunningId, 'payment_retry_failed', {
          attempt_count: newAttemptCount,
          failure_reason: paymentError.message
        });

        return {
          success: false,
          attempt_count: newAttemptCount,
          is_max_retries: isMaxRetries,
          error: paymentError.message
        };
      }

    } catch (error) {
      console.error('[Dunning] Error retrying payment:', error);
      throw error;
    }
  }

  /**
   * Process all pending payment retries (called by scheduler)
   */
  async processPaymentRetries() {
    const dueRecords = await this.getDunningRecordsDueForRetry();
    const results = [];

    console.log(`[Dunning] Processing ${dueRecords.length} payment retries`);

    for (const record of dueRecords) {
      try {
        const result = await this.retryPayment(record.id);
        results.push({ dunning_id: record.id, ...result });
      } catch (error) {
        results.push({
          dunning_id: record.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // ===== REMINDER EMAILS =====

  /**
   * Send dunning reminder email
   */
  async sendDunningEmail(tenantId, emailType, data = {}) {
    try {
      // Get tenant details
      const tenantResult = await query(
        `SELECT name, billing_email, email FROM tenants WHERE id = $1`,
        [tenantId]
      );

      if (tenantResult.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenantResult.rows[0];
      const email = tenant.billing_email || tenant.email;

      // Email templates based on type
      const templates = {
        payment_failed: {
          subject: 'Action Required: Payment Failed - IRISX',
          template: 'dunning_payment_failed'
        },
        reminder_1: {
          subject: 'Reminder: Payment Overdue - IRISX',
          template: 'dunning_reminder_first'
        },
        reminder_2: {
          subject: 'Second Reminder: Payment Overdue - IRISX',
          template: 'dunning_reminder_second'
        },
        reminder_final: {
          subject: 'Final Notice: Account Suspension Warning - IRISX',
          template: 'dunning_reminder_final'
        },
        account_suspended: {
          subject: 'Account Suspended: Payment Required - IRISX',
          template: 'dunning_account_suspended'
        },
        account_will_cancel: {
          subject: 'Account Cancellation Warning - IRISX',
          template: 'dunning_account_will_cancel'
        }
      };

      const templateInfo = templates[emailType] || templates.payment_failed;

      // TODO: Integrate with actual email service
      // For now, log the email that would be sent
      console.log(`[Dunning] Would send email to ${email}:`, {
        type: emailType,
        subject: templateInfo.subject,
        tenant: tenant.name,
        data
      });

      // Log the email event
      await query(
        `INSERT INTO dunning_emails (tenant_id, email_type, recipient, sent_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [tenantId, emailType, email]
      );

      return {
        success: true,
        email_type: emailType,
        recipient: email
      };

    } catch (error) {
      console.error('[Dunning] Error sending dunning email:', error);
      throw error;
    }
  }

  /**
   * Process reminder emails due (called by scheduler)
   */
  async processReminderEmails() {
    const dueRecords = await this.getDunningRecordsDueForReminder();
    const results = [];

    console.log(`[Dunning] Processing ${dueRecords.length} reminder emails`);

    for (const record of dueRecords) {
      try {
        // Determine which reminder to send based on count
        const reminderTypes = ['reminder_1', 'reminder_2', 'reminder_final'];
        const reminderType = reminderTypes[Math.min(record.reminder_count, reminderTypes.length - 1)];

        await this.sendDunningEmail(record.tenant_id, reminderType, {
          amount: record.amount,
          currency: record.currency,
          days_overdue: this.calculateDaysOverdue(record.first_failed_at)
        });

        // Update reminder tracking
        const newReminderCount = record.reminder_count + 1;
        const nextReminderAt = this.calculateNextReminderDate(newReminderCount);

        await query(
          `UPDATE dunning_records
           SET reminder_count = $1,
               last_reminder_at = NOW(),
               next_reminder_at = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [newReminderCount, nextReminderAt, record.id]
        );

        await this.logDunningEvent(record.id, 'reminder_sent', {
          reminder_type: reminderType,
          reminder_count: newReminderCount
        });

        results.push({
          dunning_id: record.id,
          success: true,
          reminder_type: reminderType
        });

      } catch (error) {
        results.push({
          dunning_id: record.id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // ===== ACCOUNT ACTIONS =====

  /**
   * Suspend tenant account due to non-payment
   */
  async suspendTenant(tenantId, dunningId) {
    try {
      // Update tenant status
      await query(
        `UPDATE tenants
         SET status = 'suspended',
             suspended_at = NOW(),
             suspension_reason = 'payment_failure',
             updated_at = NOW()
         WHERE id = $1`,
        [tenantId]
      );

      // Update dunning record
      if (dunningId) {
        await query(
          `UPDATE dunning_records
           SET status = 'suspended',
               account_suspended_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [dunningId]
        );

        await this.logDunningEvent(dunningId, 'account_suspended', {
          tenant_id: tenantId
        });
      }

      // Send suspension email
      await this.sendDunningEmail(tenantId, 'account_suspended', {});

      console.log(`[Dunning] Suspended tenant ${tenantId} for non-payment`);

      return { success: true, action: 'suspended' };

    } catch (error) {
      console.error('[Dunning] Error suspending tenant:', error);
      throw error;
    }
  }

  /**
   * Reactivate tenant after payment
   */
  async reactivateTenant(tenantId) {
    try {
      await query(
        `UPDATE tenants
         SET status = 'active',
             suspended_at = NULL,
             suspension_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [tenantId]
      );

      console.log(`[Dunning] Reactivated tenant ${tenantId}`);

      return { success: true };

    } catch (error) {
      console.error('[Dunning] Error reactivating tenant:', error);
      throw error;
    }
  }

  /**
   * Resolve dunning record (payment succeeded or manually resolved)
   */
  async resolveDunning(dunningId, resolution = 'payment_succeeded') {
    try {
      const dunning = await this.getDunningById(dunningId);
      if (!dunning) {
        throw new Error('Dunning record not found');
      }

      await query(
        `UPDATE dunning_records
         SET status = 'resolved',
             resolution = $1,
             resolved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [resolution, dunningId]
      );

      await this.logDunningEvent(dunningId, 'dunning_resolved', {
        resolution
      });

      // If tenant was suspended, reactivate
      if (dunning.account_suspended_at) {
        await this.reactivateTenant(dunning.tenant_id);
      }

      // Update invoice status if applicable
      if (dunning.invoice_id) {
        await query(
          `UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE id = $1`,
          [dunning.invoice_id]
        );
      }

      console.log(`[Dunning] Resolved dunning ${dunningId} - ${resolution}`);

      return { success: true, resolution };

    } catch (error) {
      console.error('[Dunning] Error resolving dunning:', error);
      throw error;
    }
  }

  /**
   * Process account suspensions (called by scheduler)
   */
  async processAccountSuspensions() {
    const dueForSuspension = await this.getTenantsDueForSuspension();
    const results = [];

    console.log(`[Dunning] Processing ${dueForSuspension.length} account suspensions`);

    for (const record of dueForSuspension) {
      try {
        const result = await this.suspendTenant(record.tenant_id, record.dunning_id);
        results.push({ tenant_id: record.tenant_id, ...result });
      } catch (error) {
        results.push({
          tenant_id: record.tenant_id,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // ===== MANUAL OPERATIONS =====

  /**
   * Manually mark payment as received (e.g., bank transfer)
   */
  async markPaymentReceived(dunningId, paymentDetails = {}) {
    try {
      await this.resolveDunning(dunningId, 'manual_payment');

      await this.logDunningEvent(dunningId, 'manual_payment_recorded', {
        ...paymentDetails,
        recorded_by: paymentDetails.admin_id
      });

      return { success: true, resolution: 'manual_payment' };

    } catch (error) {
      console.error('[Dunning] Error marking payment received:', error);
      throw error;
    }
  }

  /**
   * Cancel dunning (write off debt)
   */
  async cancelDunning(dunningId, reason, adminId) {
    try {
      await query(
        `UPDATE dunning_records
         SET status = 'canceled',
             resolution = $1,
             resolved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [reason, dunningId]
      );

      await this.logDunningEvent(dunningId, 'dunning_canceled', {
        reason,
        canceled_by: adminId
      });

      return { success: true };

    } catch (error) {
      console.error('[Dunning] Error canceling dunning:', error);
      throw error;
    }
  }

  // ===== ANALYTICS & REPORTING =====

  /**
   * Get dunning statistics for admin dashboard
   */
  async getDunningStats() {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) as active_dunning,
        COUNT(*) FILTER (WHERE status = 'suspended') as suspended_accounts,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days') as resolved_last_30_days,
        SUM(amount) FILTER (WHERE status IN ('pending', 'in_progress')) as total_outstanding,
        SUM(amount) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days') as recovered_last_30_days,
        AVG(EXTRACT(EPOCH FROM (resolved_at - first_failed_at))/86400)
          FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL) as avg_days_to_recover
      FROM dunning_records
    `);

    return result.rows[0];
  }

  /**
   * Get dunning records with filtering
   */
  async listDunningRecords(filters = {}) {
    const { status, tenant_id, limit = 50, offset = 0 } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND dr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (tenant_id) {
      whereClause += ` AND dr.tenant_id = $${paramIndex}`;
      params.push(tenant_id);
      paramIndex++;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT dr.*, t.name as tenant_name, t.billing_email
       FROM dunning_records dr
       JOIN tenants t ON t.id = dr.tenant_id
       ${whereClause}
       ORDER BY dr.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return result.rows;
  }

  // ===== HELPER METHODS =====

  async getDunningById(dunningId) {
    const result = await query(
      `SELECT * FROM dunning_records WHERE id = $1`,
      [dunningId]
    );
    return result.rows[0] || null;
  }

  calculateNextRetryDate(attemptCount) {
    const daysOffset = this.config.retrySchedule[attemptCount - 1] || this.config.retrySchedule[this.config.retrySchedule.length - 1];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysOffset);
    return nextDate;
  }

  calculateNextReminderDate(reminderCount) {
    if (reminderCount >= this.config.reminderSchedule.length) {
      return null;
    }
    const daysOffset = this.config.reminderSchedule[reminderCount];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysOffset);
    return nextDate;
  }

  calculateDaysOverdue(firstFailedAt) {
    const now = new Date();
    const failed = new Date(firstFailedAt);
    return Math.floor((now - failed) / (1000 * 60 * 60 * 24));
  }

  async logDunningEvent(dunningId, eventType, data) {
    try {
      await query(
        `INSERT INTO dunning_events (dunning_record_id, event_type, event_data)
         VALUES ($1, $2, $3)`,
        [dunningId, eventType, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('[Dunning] Error logging event:', error);
    }
  }
}

export default new DunningService();
