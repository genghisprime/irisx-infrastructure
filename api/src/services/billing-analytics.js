/**
 * Billing Analytics Service
 * MRR, Churn, LTV, and Revenue Analytics
 */

import db from '../db/connection.js';

class BillingAnalyticsService {
  // ===========================================
  // MRR CALCULATIONS
  // ===========================================

  /**
   * Calculate MRR for a specific tenant
   */
  async calculateTenantMRR(tenantId) {
    // Get active subscriptions
    const subscriptions = await db.query(`
      SELECT
        plan_id,
        amount,
        billing_cycle,
        status,
        created_at
      FROM subscriptions
      WHERE tenant_id = $1
        AND status IN ('active', 'trialing')
    `, [tenantId]);

    let mrr = 0;
    for (const sub of subscriptions.rows) {
      if (sub.billing_cycle === 'monthly') {
        mrr += parseFloat(sub.amount);
      } else if (sub.billing_cycle === 'yearly') {
        mrr += parseFloat(sub.amount) / 12;
      } else if (sub.billing_cycle === 'quarterly') {
        mrr += parseFloat(sub.amount) / 3;
      }
    }

    // Add estimated usage-based MRR (average of last 3 months)
    const usageMRR = await db.query(`
      SELECT AVG(amount) as avg_usage
      FROM invoices
      WHERE tenant_id = $1
        AND invoice_type = 'usage'
        AND created_at > NOW() - INTERVAL '3 months'
    `, [tenantId]);

    if (usageMRR.rows[0]?.avg_usage) {
      mrr += parseFloat(usageMRR.rows[0].avg_usage);
    }

    return Math.round(mrr * 100) / 100;
  }

  /**
   * Calculate platform-wide MRR
   */
  async calculatePlatformMRR() {
    const result = await db.query(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN billing_cycle = 'monthly' THEN amount
            WHEN billing_cycle = 'yearly' THEN amount / 12
            WHEN billing_cycle = 'quarterly' THEN amount / 3
            ELSE 0
          END
        ), 0) as total_mrr,
        COUNT(DISTINCT tenant_id) as active_tenants
      FROM subscriptions
      WHERE status IN ('active', 'trialing')
    `);

    return {
      mrr: parseFloat(result.rows[0]?.total_mrr || 0),
      arr: parseFloat(result.rows[0]?.total_mrr || 0) * 12,
      activeTenants: parseInt(result.rows[0]?.active_tenants || 0)
    };
  }

  /**
   * Calculate MRR movement (new, expansion, contraction, churn)
   */
  async calculateMRRMovement(startDate, endDate) {
    // New MRR - subscriptions started in period
    const newMRR = await db.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN billing_cycle = 'monthly' THEN amount
          WHEN billing_cycle = 'yearly' THEN amount / 12
          WHEN billing_cycle = 'quarterly' THEN amount / 3
        END
      ), 0) as new_mrr,
      COUNT(DISTINCT tenant_id) as new_customers
      FROM subscriptions
      WHERE created_at BETWEEN $1 AND $2
        AND status IN ('active', 'trialing')
    `, [startDate, endDate]);

    // Expansion MRR - upgrades
    const expansionMRR = await db.query(`
      SELECT COALESCE(SUM(mrr_change), 0) as expansion_mrr
      FROM churn_events
      WHERE event_type = 'subscription_upgraded'
        AND effective_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    // Contraction MRR - downgrades
    const contractionMRR = await db.query(`
      SELECT COALESCE(SUM(ABS(mrr_change)), 0) as contraction_mrr
      FROM churn_events
      WHERE event_type = 'subscription_downgraded'
        AND effective_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    // Churn MRR - cancelled subscriptions
    const churnMRR = await db.query(`
      SELECT COALESCE(SUM(ABS(previous_mrr)), 0) as churn_mrr,
             COUNT(*) as churned_customers
      FROM churn_events
      WHERE event_type IN ('subscription_cancelled', 'account_deactivated', 'payment_failed_final')
        AND effective_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    // Reactivation MRR
    const reactivationMRR = await db.query(`
      SELECT COALESCE(SUM(new_mrr), 0) as reactivation_mrr
      FROM churn_events
      WHERE event_type = 'subscription_resumed'
        AND effective_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    return {
      newMRR: parseFloat(newMRR.rows[0]?.new_mrr || 0),
      newCustomers: parseInt(newMRR.rows[0]?.new_customers || 0),
      expansionMRR: parseFloat(expansionMRR.rows[0]?.expansion_mrr || 0),
      contractionMRR: parseFloat(contractionMRR.rows[0]?.contraction_mrr || 0),
      churnMRR: parseFloat(churnMRR.rows[0]?.churn_mrr || 0),
      churnedCustomers: parseInt(churnMRR.rows[0]?.churned_customers || 0),
      reactivationMRR: parseFloat(reactivationMRR.rows[0]?.reactivation_mrr || 0)
    };
  }

  /**
   * Take daily MRR snapshot
   */
  async takeMRRSnapshot(tenantId = null) {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);

    if (tenantId) {
      // Tenant-specific snapshot
      const mrr = await this.calculateTenantMRR(tenantId);
      const movement = await this.calculateMRRMovement(
        new Date(today + 'T00:00:00Z'),
        new Date(today + 'T23:59:59Z')
      );

      await db.query(`
        INSERT INTO mrr_snapshots (
          tenant_id, snapshot_date, snapshot_month,
          new_mrr, expansion_mrr, contraction_mrr, churn_mrr, reactivation_mrr,
          total_mrr, active_customers, new_customers, churned_customers
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11)
        ON CONFLICT (tenant_id, snapshot_date)
        DO UPDATE SET
          new_mrr = EXCLUDED.new_mrr,
          expansion_mrr = EXCLUDED.expansion_mrr,
          contraction_mrr = EXCLUDED.contraction_mrr,
          churn_mrr = EXCLUDED.churn_mrr,
          reactivation_mrr = EXCLUDED.reactivation_mrr,
          total_mrr = EXCLUDED.total_mrr
      `, [
        tenantId, today, month,
        movement.newMRR, movement.expansionMRR, movement.contractionMRR,
        movement.churnMRR, movement.reactivationMRR, mrr,
        movement.newCustomers, movement.churnedCustomers
      ]);

      return { tenantId, date: today, mrr };
    } else {
      // Platform-wide snapshot
      const platform = await this.calculatePlatformMRR();
      const movement = await this.calculateMRRMovement(
        new Date(today + 'T00:00:00Z'),
        new Date(today + 'T23:59:59Z')
      );

      const arpu = platform.activeTenants > 0
        ? platform.mrr / platform.activeTenants
        : 0;

      await db.query(`
        INSERT INTO platform_mrr_snapshots (
          snapshot_date, snapshot_month,
          new_mrr, expansion_mrr, contraction_mrr, churn_mrr, reactivation_mrr,
          total_mrr, total_tenants, active_tenants, new_tenants, churned_tenants, arpu
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (snapshot_date)
        DO UPDATE SET
          new_mrr = EXCLUDED.new_mrr,
          expansion_mrr = EXCLUDED.expansion_mrr,
          contraction_mrr = EXCLUDED.contraction_mrr,
          churn_mrr = EXCLUDED.churn_mrr,
          reactivation_mrr = EXCLUDED.reactivation_mrr,
          total_mrr = EXCLUDED.total_mrr,
          active_tenants = EXCLUDED.active_tenants,
          arpu = EXCLUDED.arpu
      `, [
        today, month,
        movement.newMRR, movement.expansionMRR, movement.contractionMRR,
        movement.churnMRR, movement.reactivationMRR, platform.mrr,
        platform.activeTenants, platform.activeTenants,
        movement.newCustomers, movement.churnedCustomers, arpu
      ]);

      return { date: today, ...platform, movement };
    }
  }

  /**
   * Get MRR history
   */
  async getMRRHistory(options = {}) {
    const { tenantId, months = 12 } = options;

    if (tenantId) {
      const result = await db.query(`
        SELECT
          snapshot_month,
          MAX(total_mrr) as mrr,
          SUM(new_mrr) as new_mrr,
          SUM(expansion_mrr) as expansion_mrr,
          SUM(contraction_mrr) as contraction_mrr,
          SUM(churn_mrr) as churn_mrr,
          MAX(net_new_mrr) as net_new_mrr
        FROM mrr_snapshots
        WHERE tenant_id = $1
          AND snapshot_date > NOW() - INTERVAL '${months} months'
        GROUP BY snapshot_month
        ORDER BY snapshot_month DESC
      `, [tenantId]);

      return result.rows;
    } else {
      const result = await db.query(`
        SELECT
          snapshot_month,
          MAX(total_mrr) as mrr,
          MAX(arr) as arr,
          SUM(new_mrr) as new_mrr,
          SUM(expansion_mrr) as expansion_mrr,
          SUM(contraction_mrr) as contraction_mrr,
          SUM(churn_mrr) as churn_mrr,
          MAX(net_new_mrr) as net_new_mrr,
          MAX(active_tenants) as active_tenants,
          MAX(arpu) as arpu
        FROM platform_mrr_snapshots
        WHERE snapshot_date > NOW() - INTERVAL '${months} months'
        GROUP BY snapshot_month
        ORDER BY snapshot_month DESC
      `);

      return result.rows;
    }
  }

  // ===========================================
  // CHURN CALCULATIONS
  // ===========================================

  /**
   * Record a churn event
   */
  async recordChurnEvent(data) {
    const {
      tenantId,
      eventType,
      previousPlan,
      newPlan,
      previousMRR,
      newMRR,
      churnReason,
      churnReasonDetail
    } = data;

    const mrrChange = (newMRR || 0) - (previousMRR || 0);

    const result = await db.query(`
      INSERT INTO churn_events (
        tenant_id, event_type, previous_plan, new_plan,
        previous_mrr, new_mrr, mrr_change,
        churn_reason, churn_reason_detail, effective_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
      RETURNING *
    `, [
      tenantId, eventType, previousPlan, newPlan,
      previousMRR, newMRR, mrrChange,
      churnReason, churnReasonDetail
    ]);

    // Update cohort status
    if (['subscription_cancelled', 'account_deactivated'].includes(eventType)) {
      await db.query(`
        UPDATE customer_cohorts
        SET current_status = 'churned',
            churned_date = CURRENT_DATE,
            updated_at = NOW()
        WHERE tenant_id = $1
      `, [tenantId]);
    }

    return result.rows[0];
  }

  /**
   * Calculate churn rate
   */
  async calculateChurnRate(options = {}) {
    const { months = 1 } = options;

    // Customer churn rate
    const customerChurn = await db.query(`
      WITH start_customers AS (
        SELECT COUNT(DISTINCT tenant_id) as count
        FROM subscriptions
        WHERE status IN ('active', 'trialing')
          AND created_at < NOW() - INTERVAL '${months} months'
      ),
      churned AS (
        SELECT COUNT(DISTINCT tenant_id) as count
        FROM churn_events
        WHERE event_type IN ('subscription_cancelled', 'account_deactivated', 'payment_failed_final')
          AND effective_date > NOW() - INTERVAL '${months} months'
      )
      SELECT
        start_customers.count as starting_customers,
        churned.count as churned_customers,
        CASE WHEN start_customers.count > 0
          THEN (churned.count::float / start_customers.count) * 100
          ELSE 0
        END as churn_rate
      FROM start_customers, churned
    `);

    // Revenue churn rate (MRR churn)
    const revenueChurn = await db.query(`
      WITH start_mrr AS (
        SELECT COALESCE(total_mrr, 0) as mrr
        FROM platform_mrr_snapshots
        WHERE snapshot_date = (
          SELECT MAX(snapshot_date)
          FROM platform_mrr_snapshots
          WHERE snapshot_date <= NOW() - INTERVAL '${months} months'
        )
      ),
      churned_mrr AS (
        SELECT COALESCE(SUM(ABS(previous_mrr)), 0) as mrr
        FROM churn_events
        WHERE event_type IN ('subscription_cancelled', 'account_deactivated', 'payment_failed_final')
          AND effective_date > NOW() - INTERVAL '${months} months'
      )
      SELECT
        start_mrr.mrr as starting_mrr,
        churned_mrr.mrr as churned_mrr,
        CASE WHEN start_mrr.mrr > 0
          THEN (churned_mrr.mrr / start_mrr.mrr) * 100
          ELSE 0
        END as revenue_churn_rate
      FROM start_mrr, churned_mrr
    `);

    // Net Revenue Retention (NRR)
    const nrr = await db.query(`
      WITH start_mrr AS (
        SELECT COALESCE(total_mrr, 0) as mrr
        FROM platform_mrr_snapshots
        WHERE snapshot_date = (
          SELECT MAX(snapshot_date)
          FROM platform_mrr_snapshots
          WHERE snapshot_date <= NOW() - INTERVAL '${months} months'
        )
      ),
      changes AS (
        SELECT
          COALESCE(SUM(CASE WHEN event_type = 'subscription_upgraded' THEN mrr_change ELSE 0 END), 0) as expansion,
          COALESCE(SUM(CASE WHEN event_type = 'subscription_downgraded' THEN ABS(mrr_change) ELSE 0 END), 0) as contraction,
          COALESCE(SUM(CASE WHEN event_type IN ('subscription_cancelled', 'account_deactivated') THEN ABS(previous_mrr) ELSE 0 END), 0) as churn
        FROM churn_events
        WHERE effective_date > NOW() - INTERVAL '${months} months'
      )
      SELECT
        start_mrr.mrr as starting_mrr,
        changes.expansion,
        changes.contraction,
        changes.churn,
        CASE WHEN start_mrr.mrr > 0
          THEN ((start_mrr.mrr + changes.expansion - changes.contraction - changes.churn) / start_mrr.mrr) * 100
          ELSE 100
        END as net_revenue_retention
      FROM start_mrr, changes
    `);

    return {
      customerChurnRate: parseFloat(customerChurn.rows[0]?.churn_rate || 0),
      startingCustomers: parseInt(customerChurn.rows[0]?.starting_customers || 0),
      churnedCustomers: parseInt(customerChurn.rows[0]?.churned_customers || 0),
      revenueChurnRate: parseFloat(revenueChurn.rows[0]?.revenue_churn_rate || 0),
      churnedMRR: parseFloat(revenueChurn.rows[0]?.churned_mrr || 0),
      netRevenueRetention: parseFloat(nrr.rows[0]?.net_revenue_retention || 100),
      expansion: parseFloat(nrr.rows[0]?.expansion || 0),
      contraction: parseFloat(nrr.rows[0]?.contraction || 0)
    };
  }

  /**
   * Get churn reasons breakdown
   */
  async getChurnReasons(months = 6) {
    const result = await db.query(`
      SELECT
        churn_reason,
        COUNT(*) as count,
        SUM(ABS(previous_mrr)) as mrr_lost,
        ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 2) as percentage
      FROM churn_events
      WHERE event_type IN ('subscription_cancelled', 'account_deactivated')
        AND effective_date > NOW() - INTERVAL '${months} months'
        AND churn_reason IS NOT NULL
      GROUP BY churn_reason
      ORDER BY count DESC
    `);

    return result.rows;
  }

  // ===========================================
  // COHORT ANALYSIS
  // ===========================================

  /**
   * Create or update customer cohort
   */
  async upsertCustomerCohort(tenantId, data = {}) {
    const existing = await db.query(`
      SELECT * FROM customer_cohorts WHERE tenant_id = $1
    `, [tenantId]);

    if (existing.rows.length > 0) {
      // Update
      const updates = [];
      const values = [tenantId];
      let idx = 2;

      if (data.currentStatus) {
        updates.push(`current_status = $${idx++}`);
        values.push(data.currentStatus);
      }
      if (data.churnedDate) {
        updates.push(`churned_date = $${idx++}`);
        values.push(data.churnedDate);
      }
      if (data.lifetimeValue !== undefined) {
        updates.push(`lifetime_value = $${idx++}`);
        values.push(data.lifetimeValue);
      }
      if (data.monthsActive !== undefined) {
        updates.push(`months_active = $${idx++}`);
        values.push(data.monthsActive);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        await db.query(`
          UPDATE customer_cohorts
          SET ${updates.join(', ')}
          WHERE tenant_id = $1
        `, values);
      }
    } else {
      // Create
      const tenant = await db.query(`
        SELECT created_at FROM tenants WHERE id = $1
      `, [tenantId]);

      const signupDate = tenant.rows[0]?.created_at || new Date();
      const cohortMonth = signupDate.toISOString().substring(0, 7);

      await db.query(`
        INSERT INTO customer_cohorts (
          tenant_id, cohort_month, signup_date,
          initial_plan, initial_mrr, current_status
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        tenantId, cohortMonth, signupDate,
        data.initialPlan || 'free',
        data.initialMRR || 0,
        data.currentStatus || 'active'
      ]);
    }
  }

  /**
   * Calculate cohort retention
   */
  async calculateCohortRetention() {
    // Get all cohorts
    const cohorts = await db.query(`
      SELECT DISTINCT cohort_month
      FROM customer_cohorts
      ORDER BY cohort_month DESC
      LIMIT 12
    `);

    const results = [];

    for (const cohort of cohorts.rows) {
      const cohortMonth = cohort.cohort_month;

      // Get starting count and MRR
      const starting = await db.query(`
        SELECT
          COUNT(*) as customers,
          SUM(initial_mrr) as mrr
        FROM customer_cohorts
        WHERE cohort_month = $1
      `, [cohortMonth]);

      const startingCustomers = parseInt(starting.rows[0]?.customers || 0);
      const startingMRR = parseFloat(starting.rows[0]?.mrr || 0);

      // Calculate retention for each month since cohort start
      const cohortDate = new Date(cohortMonth + '-01');
      const monthsSince = Math.floor(
        (Date.now() - cohortDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
      );

      for (let m = 0; m <= Math.min(monthsSince, 12); m++) {
        const checkDate = new Date(cohortDate);
        checkDate.setMonth(checkDate.getMonth() + m);

        const retained = await db.query(`
          SELECT COUNT(*) as customers
          FROM customer_cohorts
          WHERE cohort_month = $1
            AND current_status = 'active'
            AND (churned_date IS NULL OR churned_date > $2)
        `, [cohortMonth, checkDate]);

        const retainedCustomers = parseInt(retained.rows[0]?.customers || 0);
        const retentionRate = startingCustomers > 0
          ? (retainedCustomers / startingCustomers) * 100
          : 0;

        await db.query(`
          INSERT INTO cohort_retention (
            cohort_month, retention_month,
            starting_customers, retained_customers, retention_rate,
            starting_mrr, retained_mrr, mrr_retention_rate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (cohort_month, retention_month)
          DO UPDATE SET
            retained_customers = EXCLUDED.retained_customers,
            retention_rate = EXCLUDED.retention_rate,
            retained_mrr = EXCLUDED.retained_mrr,
            mrr_retention_rate = EXCLUDED.mrr_retention_rate
        `, [
          cohortMonth, m,
          startingCustomers, retainedCustomers, retentionRate,
          startingMRR, 0, 0 // MRR retention would need more complex calculation
        ]);

        results.push({
          cohortMonth,
          retentionMonth: m,
          startingCustomers,
          retainedCustomers,
          retentionRate
        });
      }
    }

    return results;
  }

  /**
   * Get cohort retention matrix
   */
  async getCohortMatrix(months = 12) {
    const result = await db.query(`
      SELECT
        cohort_month,
        retention_month,
        starting_customers,
        retained_customers,
        retention_rate
      FROM cohort_retention
      WHERE cohort_month > (CURRENT_DATE - INTERVAL '${months} months')::text
      ORDER BY cohort_month, retention_month
    `);

    // Transform into matrix format
    const matrix = {};
    for (const row of result.rows) {
      if (!matrix[row.cohort_month]) {
        matrix[row.cohort_month] = {
          cohort: row.cohort_month,
          startingCustomers: row.starting_customers,
          retention: []
        };
      }
      matrix[row.cohort_month].retention.push({
        month: row.retention_month,
        retained: row.retained_customers,
        rate: parseFloat(row.retention_rate)
      });
    }

    return Object.values(matrix);
  }

  // ===========================================
  // LTV CALCULATIONS
  // ===========================================

  /**
   * Calculate customer LTV
   */
  async calculateLTV(tenantId) {
    // Get historical revenue
    const revenue = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_revenue
      FROM invoices
      WHERE tenant_id = $1
        AND status = 'paid'
    `, [tenantId]);

    const actualLTV = parseFloat(revenue.rows[0]?.total_revenue || 0);

    // Get cohort info
    const cohort = await db.query(`
      SELECT cohort_month, months_active, initial_mrr
      FROM customer_cohorts
      WHERE tenant_id = $1
    `, [tenantId]);

    // Calculate predicted LTV based on cohort averages
    let predictedLTV = actualLTV;
    let predictedLifetimeMonths = 24;

    if (cohort.rows.length > 0) {
      const cohortMonth = cohort.rows[0].cohort_month;

      // Get average lifetime from same cohort
      const cohortAvg = await db.query(`
        SELECT
          AVG(lifetime_value) as avg_ltv,
          AVG(months_active) as avg_months
        FROM customer_cohorts
        WHERE cohort_month = $1
          AND current_status = 'churned'
      `, [cohortMonth]);

      if (cohortAvg.rows[0]?.avg_ltv) {
        predictedLifetimeMonths = Math.round(parseFloat(cohortAvg.rows[0].avg_months) || 24);
        predictedLTV = parseFloat(cohortAvg.rows[0].avg_ltv);
      }
    }

    // Simple churn probability based on engagement (placeholder)
    const churnProbability = 0.05; // Default 5% monthly churn

    // Health score calculation (0-100)
    const healthFactors = await this.calculateHealthScore(tenantId);

    await db.query(`
      INSERT INTO ltv_predictions (
        tenant_id, prediction_date,
        actual_ltv, predicted_ltv, predicted_lifetime_months,
        churn_probability, health_score, health_factors
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, prediction_date)
      DO UPDATE SET
        actual_ltv = EXCLUDED.actual_ltv,
        predicted_ltv = EXCLUDED.predicted_ltv,
        health_score = EXCLUDED.health_score,
        health_factors = EXCLUDED.health_factors
    `, [
      tenantId, actualLTV, predictedLTV, predictedLifetimeMonths,
      churnProbability, healthFactors.score, JSON.stringify(healthFactors.factors)
    ]);

    return {
      actualLTV,
      predictedLTV,
      predictedLifetimeMonths,
      churnProbability,
      healthScore: healthFactors.score,
      healthFactors: healthFactors.factors
    };
  }

  /**
   * Calculate customer health score
   */
  async calculateHealthScore(tenantId) {
    const factors = {};
    let score = 100;

    // Check recent activity (last 7 days)
    const activity = await db.query(`
      SELECT COUNT(*) as api_calls
      FROM api_logs
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '7 days'
    `, [tenantId]);

    factors.recentActivity = parseInt(activity.rows[0]?.api_calls || 0);
    if (factors.recentActivity < 10) score -= 20;
    else if (factors.recentActivity < 50) score -= 10;

    // Check payment history
    const payments = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'paid') as paid,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM invoices
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '6 months'
    `, [tenantId]);

    factors.paidInvoices = parseInt(payments.rows[0]?.paid || 0);
    factors.failedPayments = parseInt(payments.rows[0]?.failed || 0);
    if (factors.failedPayments > 0) score -= 15 * factors.failedPayments;

    // Check usage trend
    const usageTrend = await db.query(`
      SELECT
        AVG(CASE WHEN trend_date > NOW() - INTERVAL '30 days' THEN total_spend ELSE NULL END) as recent,
        AVG(CASE WHEN trend_date BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN total_spend ELSE NULL END) as previous
      FROM usage_trends
      WHERE tenant_id = $1
    `, [tenantId]);

    const recent = parseFloat(usageTrend.rows[0]?.recent || 0);
    const previous = parseFloat(usageTrend.rows[0]?.previous || 1);
    factors.usageGrowth = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

    if (factors.usageGrowth < -20) score -= 20;
    else if (factors.usageGrowth < 0) score -= 10;
    else if (factors.usageGrowth > 20) score += 10;

    // Check support tickets
    const tickets = await db.query(`
      SELECT COUNT(*) as open_tickets
      FROM support_tickets
      WHERE tenant_id = $1
        AND status = 'open'
    `, [tenantId]);

    factors.openTickets = parseInt(tickets.rows[0]?.open_tickets || 0);
    if (factors.openTickets > 3) score -= 15;
    else if (factors.openTickets > 1) score -= 5;

    return {
      score: Math.max(0, Math.min(100, score)),
      factors
    };
  }

  // ===========================================
  // USAGE DASHBOARD
  // ===========================================

  /**
   * Record daily usage for tenant
   */
  async recordDailyUsage(tenantId, date = null) {
    const trendDate = date || new Date().toISOString().split('T')[0];

    // Get call usage
    const calls = await db.query(`
      SELECT
        COUNT(*) as total_calls,
        COALESCE(SUM(duration_seconds) / 60.0, 0) as call_minutes,
        COALESCE(SUM(cost), 0) as call_spend
      FROM cdrs
      WHERE tenant_id = $1
        AND DATE(start_time) = $2
    `, [tenantId, trendDate]);

    // Get SMS usage
    const sms = await db.query(`
      SELECT
        COUNT(*) as total_sms,
        COALESCE(SUM(cost), 0) as sms_spend
      FROM sms_logs
      WHERE tenant_id = $1
        AND DATE(created_at) = $2
    `, [tenantId, trendDate]);

    // Get email usage
    const emails = await db.query(`
      SELECT
        COUNT(*) as total_emails,
        COALESCE(SUM(cost), 0) as email_spend
      FROM email_logs
      WHERE tenant_id = $1
        AND DATE(created_at) = $2
    `, [tenantId, trendDate]);

    // Get phone number count
    const numbers = await db.query(`
      SELECT COUNT(*) as active_numbers
      FROM phone_numbers
      WHERE tenant_id = $1
        AND status = 'active'
    `, [tenantId]);

    // Get AI usage
    const ai = await db.query(`
      SELECT
        COALESCE(SUM(duration_seconds) / 60.0, 0) as ai_minutes,
        COALESCE(SUM(cost), 0) as ai_spend
      FROM ai_usage_logs
      WHERE tenant_id = $1
        AND DATE(created_at) = $2
    `, [tenantId, trendDate]);

    const totalSpend =
      parseFloat(calls.rows[0]?.call_spend || 0) +
      parseFloat(sms.rows[0]?.sms_spend || 0) +
      parseFloat(emails.rows[0]?.email_spend || 0) +
      parseFloat(ai.rows[0]?.ai_spend || 0);

    await db.query(`
      INSERT INTO usage_trends (
        tenant_id, trend_date,
        total_calls, call_minutes, call_spend,
        total_sms, sms_spend,
        total_emails, email_spend,
        active_numbers,
        ai_minutes, ai_spend,
        total_spend
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (tenant_id, trend_date)
      DO UPDATE SET
        total_calls = EXCLUDED.total_calls,
        call_minutes = EXCLUDED.call_minutes,
        call_spend = EXCLUDED.call_spend,
        total_sms = EXCLUDED.total_sms,
        sms_spend = EXCLUDED.sms_spend,
        total_emails = EXCLUDED.total_emails,
        email_spend = EXCLUDED.email_spend,
        active_numbers = EXCLUDED.active_numbers,
        ai_minutes = EXCLUDED.ai_minutes,
        ai_spend = EXCLUDED.ai_spend,
        total_spend = EXCLUDED.total_spend
    `, [
      tenantId, trendDate,
      parseInt(calls.rows[0]?.total_calls || 0),
      parseFloat(calls.rows[0]?.call_minutes || 0),
      parseFloat(calls.rows[0]?.call_spend || 0),
      parseInt(sms.rows[0]?.total_sms || 0),
      parseFloat(sms.rows[0]?.sms_spend || 0),
      parseInt(emails.rows[0]?.total_emails || 0),
      parseFloat(emails.rows[0]?.email_spend || 0),
      parseInt(numbers.rows[0]?.active_numbers || 0),
      parseFloat(ai.rows[0]?.ai_minutes || 0),
      parseFloat(ai.rows[0]?.ai_spend || 0),
      totalSpend
    ]);

    return { tenantId, date: trendDate, totalSpend };
  }

  /**
   * Get usage trends for customer dashboard
   */
  async getUsageTrends(tenantId, options = {}) {
    const { days = 30 } = options;

    const result = await db.query(`
      SELECT
        trend_date,
        total_calls,
        call_minutes,
        call_spend,
        total_sms,
        sms_spend,
        total_emails,
        email_spend,
        active_numbers,
        ai_minutes,
        ai_spend,
        total_spend
      FROM usage_trends
      WHERE tenant_id = $1
        AND trend_date > CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY trend_date DESC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Get usage summary for billing period
   */
  async getUsageSummary(tenantId, options = {}) {
    const { startDate, endDate } = options;

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const result = await db.query(`
      SELECT
        SUM(total_calls) as total_calls,
        SUM(call_minutes) as total_minutes,
        SUM(call_spend) as call_cost,
        SUM(total_sms) as total_sms,
        SUM(sms_spend) as sms_cost,
        SUM(total_emails) as total_emails,
        SUM(email_spend) as email_cost,
        MAX(active_numbers) as active_numbers,
        SUM(ai_minutes) as ai_minutes,
        SUM(ai_spend) as ai_cost,
        SUM(total_spend) as total_cost
      FROM usage_trends
      WHERE tenant_id = $1
        AND trend_date BETWEEN $2 AND $3
    `, [tenantId, start, end]);

    // Get plan limits
    const plan = await db.query(`
      SELECT
        p.included_minutes,
        p.included_sms,
        p.included_emails
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = $1
        AND s.status IN ('active', 'trialing')
      LIMIT 1
    `, [tenantId]);

    const summary = result.rows[0] || {};
    const limits = plan.rows[0] || {};

    return {
      periodStart: start,
      periodEnd: end,
      calls: {
        used: parseInt(summary.total_calls || 0),
        minutes: parseFloat(summary.total_minutes || 0),
        cost: parseFloat(summary.call_cost || 0),
        included: limits.included_minutes || 0
      },
      sms: {
        sent: parseInt(summary.total_sms || 0),
        cost: parseFloat(summary.sms_cost || 0),
        included: limits.included_sms || 0
      },
      email: {
        sent: parseInt(summary.total_emails || 0),
        cost: parseFloat(summary.email_cost || 0),
        included: limits.included_emails || 0
      },
      phoneNumbers: parseInt(summary.active_numbers || 0),
      ai: {
        minutes: parseFloat(summary.ai_minutes || 0),
        cost: parseFloat(summary.ai_cost || 0)
      },
      totalCost: parseFloat(summary.total_cost || 0)
    };
  }

  // ===========================================
  // REVENUE ANALYTICS
  // ===========================================

  /**
   * Calculate revenue breakdown
   */
  async calculateRevenueBreakdown(options = {}) {
    const { tenantId, startDate, endDate } = options;

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const end = endDate || new Date().toISOString();

    let query = `
      SELECT
        SUM(CASE WHEN invoice_type = 'subscription' THEN amount ELSE 0 END) as subscription_revenue,
        SUM(CASE WHEN invoice_type = 'usage' THEN amount ELSE 0 END) as usage_revenue,
        SUM(CASE WHEN invoice_type = 'overage' THEN amount ELSE 0 END) as overage_revenue,
        SUM(CASE WHEN invoice_type = 'one_time' THEN amount ELSE 0 END) as one_time_revenue,
        SUM(amount) as total_revenue
      FROM invoices
      WHERE status = 'paid'
        AND created_at BETWEEN $1 AND $2
    `;

    const params = [start, end];

    if (tenantId) {
      query += ` AND tenant_id = $3`;
      params.push(tenantId);
    }

    const result = await db.query(query, params);

    return {
      subscription: parseFloat(result.rows[0]?.subscription_revenue || 0),
      usage: parseFloat(result.rows[0]?.usage_revenue || 0),
      overage: parseFloat(result.rows[0]?.overage_revenue || 0),
      oneTime: parseFloat(result.rows[0]?.one_time_revenue || 0),
      total: parseFloat(result.rows[0]?.total_revenue || 0)
    };
  }

  /**
   * Get platform financial overview
   */
  async getPlatformFinancials() {
    // Current MRR/ARR
    const mrr = await this.calculatePlatformMRR();

    // Churn metrics
    const churn = await this.calculateChurnRate({ months: 1 });

    // Revenue this month
    const revenue = await this.calculateRevenueBreakdown({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      endDate: new Date().toISOString()
    });

    // MRR trend (last 6 months)
    const mrrHistory = await this.getMRRHistory({ months: 6 });

    return {
      mrr: mrr.mrr,
      arr: mrr.arr,
      activeTenants: mrr.activeTenants,
      arpu: mrr.activeTenants > 0 ? mrr.mrr / mrr.activeTenants : 0,
      customerChurnRate: churn.customerChurnRate,
      revenueChurnRate: churn.revenueChurnRate,
      netRevenueRetention: churn.netRevenueRetention,
      revenueThisMonth: revenue.total,
      revenueBreakdown: revenue,
      mrrHistory
    };
  }
}

export default new BillingAnalyticsService();
