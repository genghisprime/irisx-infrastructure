/**
 * Budget Alerts Service
 *
 * Financial analytics with budget tracking, alerts,
 * spending forecasts, and cost optimization recommendations
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Budget types
const BUDGET_TYPES = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUAL: 'annual',
  CAMPAIGN: 'campaign',
  CUSTOM: 'custom'
};

// Budget categories
const BUDGET_CATEGORIES = {
  CALLS: 'calls',
  SMS: 'sms',
  EMAIL: 'email',
  PHONE_NUMBERS: 'phone_numbers',
  STORAGE: 'storage',
  API_CALLS: 'api_calls',
  TOTAL: 'total'
};

// Alert severity levels
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

// Alert types
const ALERT_TYPES = {
  THRESHOLD_EXCEEDED: 'threshold_exceeded',
  THRESHOLD_WARNING: 'threshold_warning',
  ANOMALY_DETECTED: 'anomaly_detected',
  FORECAST_OVERAGE: 'forecast_overage',
  RATE_SPIKE: 'rate_spike',
  BUDGET_EXHAUSTED: 'budget_exhausted'
};

/**
 * Budget Alerts Service
 */
class BudgetAlertsService extends EventEmitter {
  constructor() {
    super();
    this.alertRules = new Map();
  }

  // ============================================
  // Budget Management
  // ============================================

  /**
   * Create budget
   */
  async createBudget(tenantId, budgetData, createdBy) {
    const {
      name,
      type = BUDGET_TYPES.MONTHLY,
      category = BUDGET_CATEGORIES.TOTAL,
      amount,
      currency = 'USD',
      startDate,
      endDate,
      alertThresholds = [50, 75, 90, 100],
      autoRenew = true,
      metadata = {}
    } = budgetData;

    if (!name || !amount) {
      throw new Error('name and amount are required');
    }

    const budgetId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO budgets (
        id, tenant_id, name, type, category, amount, currency,
        start_date, end_date, alert_thresholds, auto_renew,
        metadata, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      budgetId, tenantId, name, type, category, amount, currency,
      startDate, endDate, JSON.stringify(alertThresholds), autoRenew,
      JSON.stringify(metadata), createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get budget with current spending
   */
  async getBudget(budgetId) {
    const result = await query(`
      SELECT b.*,
        COALESCE(bs.total_spent, 0) as current_spent,
        COALESCE(bs.last_updated, b.created_at) as spending_updated_at
      FROM budgets b
      LEFT JOIN budget_spending bs ON b.id = bs.budget_id
        AND bs.period_start = DATE_TRUNC('month', NOW())
      WHERE b.id = $1
    `, [budgetId]);

    if (result.rows.length === 0) return null;

    const budget = result.rows[0];
    budget.percent_used = budget.amount > 0
      ? ((budget.current_spent / budget.amount) * 100).toFixed(2)
      : 0;
    budget.remaining = budget.amount - budget.current_spent;

    return budget;
  }

  /**
   * Get budgets for tenant
   */
  async getBudgets(tenantId, options = {}) {
    const { category, type, isActive = true, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT b.*,
        COALESCE(bs.total_spent, 0) as current_spent
      FROM budgets b
      LEFT JOIN budget_spending bs ON b.id = bs.budget_id
        AND bs.period_start = DATE_TRUNC('month', NOW())
      WHERE b.tenant_id = $1
    `;
    const params = [tenantId];

    if (category) {
      params.push(category);
      sql += ` AND b.category = $${params.length}`;
    }

    if (type) {
      params.push(type);
      sql += ` AND b.type = $${params.length}`;
    }

    if (isActive) {
      sql += ` AND b.is_active = true`;
    }

    sql += ' ORDER BY b.created_at DESC';
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);

    return result.rows.map(budget => ({
      ...budget,
      percent_used: budget.amount > 0
        ? ((budget.current_spent / budget.amount) * 100).toFixed(2)
        : 0,
      remaining: budget.amount - budget.current_spent
    }));
  }

  /**
   * Update budget
   */
  async updateBudget(budgetId, updates, updatedBy) {
    const allowedFields = ['name', 'amount', 'alert_thresholds', 'auto_renew', 'is_active', 'metadata'];
    const setClauses = [];
    const params = [budgetId];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        params.push(['alert_thresholds', 'metadata'].includes(snakeKey) ? JSON.stringify(value) : value);
        setClauses.push(`${snakeKey} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return this.getBudget(budgetId);
    }

    params.push(updatedBy);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push('updated_at = NOW()');

    await query(`
      UPDATE budgets
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);

    return this.getBudget(budgetId);
  }

  /**
   * Delete budget
   */
  async deleteBudget(budgetId) {
    await query('DELETE FROM budget_alerts WHERE budget_id = $1', [budgetId]);
    await query('DELETE FROM budget_spending WHERE budget_id = $1', [budgetId]);
    await query('DELETE FROM budgets WHERE id = $1', [budgetId]);
    return { deleted: true };
  }

  // ============================================
  // Spending Tracking
  // ============================================

  /**
   * Record spending
   */
  async recordSpending(tenantId, spendingData) {
    const {
      category,
      amount,
      resourceType,
      resourceId,
      description
    } = spendingData;

    // Get matching budgets
    const budgets = await query(`
      SELECT * FROM budgets
      WHERE tenant_id = $1
        AND is_active = true
        AND (category = $2 OR category = 'total')
        AND (end_date IS NULL OR end_date > NOW())
    `, [tenantId, category]);

    const results = [];

    for (const budget of budgets.rows) {
      // Update spending record
      await query(`
        INSERT INTO budget_spending (
          budget_id, period_start, total_spent, last_updated
        ) VALUES ($1, DATE_TRUNC('month', NOW()), $2, NOW())
        ON CONFLICT (budget_id, period_start) DO UPDATE SET
          total_spent = budget_spending.total_spent + $2,
          last_updated = NOW()
      `, [budget.id, amount]);

      // Check thresholds
      await this.checkBudgetThresholds(budget.id);

      results.push({ budgetId: budget.id, budgetName: budget.name, amountAdded: amount });
    }

    // Log spending detail
    await query(`
      INSERT INTO spending_log (
        id, tenant_id, category, amount, resource_type, resource_id,
        description, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [crypto.randomUUID(), tenantId, category, amount, resourceType, resourceId, description]);

    return results;
  }

  /**
   * Get spending history
   */
  async getSpendingHistory(tenantId, options = {}) {
    const { category, startDate, endDate, groupBy = 'day', limit = 100 } = options;

    let dateFormat;
    switch (groupBy) {
      case 'hour': dateFormat = 'YYYY-MM-DD HH24:00'; break;
      case 'day': dateFormat = 'YYYY-MM-DD'; break;
      case 'week': dateFormat = 'IYYY-IW'; break;
      case 'month': dateFormat = 'YYYY-MM'; break;
      default: dateFormat = 'YYYY-MM-DD';
    }

    let sql = `
      SELECT
        TO_CHAR(created_at, '${dateFormat}') as period,
        category,
        SUM(amount) as total_spent,
        COUNT(*) as transaction_count
      FROM spending_log
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND created_at <= $${params.length}`;
    }

    sql += ` GROUP BY period, category ORDER BY period DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get spending summary
   */
  async getSpendingSummary(tenantId, period = 'month') {
    let interval;
    switch (period) {
      case 'day': interval = '1 day'; break;
      case 'week': interval = '7 days'; break;
      case 'month': interval = '30 days'; break;
      case 'quarter': interval = '90 days'; break;
      case 'year': interval = '365 days'; break;
      default: interval = '30 days';
    }

    const result = await query(`
      SELECT
        category,
        SUM(amount) as total_spent,
        COUNT(*) as transactions,
        AVG(amount) as avg_transaction,
        MAX(amount) as max_transaction,
        MIN(amount) as min_transaction
      FROM spending_log
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY category
      ORDER BY total_spent DESC
    `, [tenantId]);

    const totalResult = await query(`
      SELECT SUM(amount) as grand_total
      FROM spending_log
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${interval}'
    `, [tenantId]);

    return {
      period,
      byCategory: result.rows,
      grandTotal: parseFloat(totalResult.rows[0]?.grand_total || 0)
    };
  }

  // ============================================
  // Alert Management
  // ============================================

  /**
   * Check budget thresholds and generate alerts
   */
  async checkBudgetThresholds(budgetId) {
    const budget = await this.getBudget(budgetId);

    if (!budget || !budget.is_active) return;

    const percentUsed = parseFloat(budget.percent_used);
    const thresholds = typeof budget.alert_thresholds === 'string'
      ? JSON.parse(budget.alert_thresholds)
      : budget.alert_thresholds;

    for (const threshold of thresholds.sort((a, b) => b - a)) {
      if (percentUsed >= threshold) {
        // Check if alert already sent for this threshold this period
        const existing = await query(`
          SELECT * FROM budget_alerts
          WHERE budget_id = $1
            AND threshold_percent = $2
            AND created_at >= DATE_TRUNC('month', NOW())
        `, [budgetId, threshold]);

        if (existing.rows.length === 0) {
          await this.createAlert(budget, threshold, percentUsed);
        }
        break; // Only create one alert (highest threshold exceeded)
      }
    }
  }

  /**
   * Create budget alert
   */
  async createAlert(budget, threshold, currentPercent) {
    const severity = this.getSeverityForThreshold(threshold);
    const alertType = threshold >= 100
      ? ALERT_TYPES.BUDGET_EXHAUSTED
      : ALERT_TYPES.THRESHOLD_WARNING;

    const alertId = crypto.randomUUID();

    await query(`
      INSERT INTO budget_alerts (
        id, budget_id, tenant_id, alert_type, severity,
        threshold_percent, current_percent, current_spent,
        budget_amount, message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      alertId, budget.id, budget.tenant_id, alertType, severity,
      threshold, currentPercent, budget.current_spent,
      budget.amount,
      `Budget "${budget.name}" has reached ${currentPercent}% (${threshold}% threshold)`
    ]);

    // Emit event for notifications
    this.emit('alert', {
      alertId,
      budgetId: budget.id,
      tenantId: budget.tenant_id,
      alertType,
      severity,
      threshold,
      currentPercent,
      budgetName: budget.name,
      remaining: budget.remaining
    });

    return alertId;
  }

  /**
   * Get severity for threshold
   */
  getSeverityForThreshold(threshold) {
    if (threshold >= 100) return ALERT_SEVERITY.EMERGENCY;
    if (threshold >= 90) return ALERT_SEVERITY.CRITICAL;
    if (threshold >= 75) return ALERT_SEVERITY.WARNING;
    return ALERT_SEVERITY.INFO;
  }

  /**
   * Get alerts for tenant
   */
  async getAlerts(tenantId, options = {}) {
    const { severity, acknowledged, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT ba.*, b.name as budget_name, b.category
      FROM budget_alerts ba
      JOIN budgets b ON ba.budget_id = b.id
      WHERE ba.tenant_id = $1
    `;
    const params = [tenantId];

    if (severity) {
      params.push(severity);
      sql += ` AND ba.severity = $${params.length}`;
    }

    if (acknowledged !== undefined) {
      params.push(acknowledged);
      sql += ` AND ba.acknowledged = $${params.length}`;
    }

    sql += ' ORDER BY ba.created_at DESC';
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, userId) {
    await query(`
      UPDATE budget_alerts
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
      WHERE id = $2
    `, [userId, alertId]);

    return { acknowledged: true };
  }

  // ============================================
  // Forecasting
  // ============================================

  /**
   * Forecast spending
   */
  async forecastSpending(tenantId, options = {}) {
    const { category, daysAhead = 30 } = options;

    // Get historical spending (last 90 days)
    const history = await query(`
      SELECT
        DATE(created_at) as date,
        category,
        SUM(amount) as daily_total
      FROM spending_log
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '90 days'
        ${category ? 'AND category = $2' : ''}
      GROUP BY DATE(created_at), category
      ORDER BY date
    `, category ? [tenantId, category] : [tenantId]);

    if (history.rows.length < 7) {
      return { error: 'Insufficient data for forecasting (need at least 7 days)' };
    }

    // Calculate averages
    const categoryStats = {};

    for (const row of history.rows) {
      if (!categoryStats[row.category]) {
        categoryStats[row.category] = { total: 0, count: 0, values: [] };
      }
      categoryStats[row.category].total += parseFloat(row.daily_total);
      categoryStats[row.category].count += 1;
      categoryStats[row.category].values.push(parseFloat(row.daily_total));
    }

    const forecasts = {};

    for (const [cat, stats] of Object.entries(categoryStats)) {
      const dailyAvg = stats.total / stats.count;

      // Calculate trend (simple linear regression)
      const n = stats.values.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += stats.values[i];
        sumXY += i * stats.values[i];
        sumX2 += i * i;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

      // Standard deviation for confidence interval
      const mean = sumY / n;
      const variance = stats.values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);

      forecasts[cat] = {
        dailyAverage: dailyAvg,
        trend: slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable',
        trendSlope: slope,
        forecastedTotal: dailyAvg * daysAhead + (slope * daysAhead * (daysAhead - 1) / 2),
        confidenceInterval: {
          low: (dailyAvg - 1.96 * stdDev) * daysAhead,
          high: (dailyAvg + 1.96 * stdDev) * daysAhead
        },
        standardDeviation: stdDev
      };
    }

    // Check against budgets
    const budgets = await this.getBudgets(tenantId, { isActive: true });
    const warnings = [];

    for (const budget of budgets) {
      const forecast = forecasts[budget.category] || forecasts.total;
      if (forecast) {
        const projectedTotal = parseFloat(budget.current_spent) + forecast.forecastedTotal;
        if (projectedTotal > parseFloat(budget.amount)) {
          warnings.push({
            budgetId: budget.id,
            budgetName: budget.name,
            category: budget.category,
            projectedOverage: projectedTotal - parseFloat(budget.amount),
            projectedTotal,
            budgetAmount: parseFloat(budget.amount)
          });
        }
      }
    }

    return {
      daysAhead,
      forecasts,
      budgetWarnings: warnings,
      generatedAt: new Date()
    };
  }

  /**
   * Detect spending anomalies
   */
  async detectAnomalies(tenantId, options = {}) {
    const { category, sensitivityMultiplier = 2 } = options;

    // Get recent spending vs historical average
    const recent = await query(`
      SELECT
        category,
        SUM(amount) as recent_total,
        COUNT(*) as recent_count
      FROM spending_log
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '1 day'
        ${category ? 'AND category = $2' : ''}
      GROUP BY category
    `, category ? [tenantId, category] : [tenantId]);

    const historical = await query(`
      SELECT
        category,
        AVG(daily_total) as avg_daily,
        STDDEV(daily_total) as stddev_daily
      FROM (
        SELECT category, DATE(created_at), SUM(amount) as daily_total
        FROM spending_log
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
          AND created_at < NOW() - INTERVAL '1 day'
          ${category ? 'AND category = $2' : ''}
        GROUP BY category, DATE(created_at)
      ) daily
      GROUP BY category
    `, category ? [tenantId, category] : [tenantId]);

    const historicalMap = {};
    for (const row of historical.rows) {
      historicalMap[row.category] = row;
    }

    const anomalies = [];

    for (const row of recent.rows) {
      const hist = historicalMap[row.category];
      if (hist) {
        const threshold = parseFloat(hist.avg_daily) + sensitivityMultiplier * parseFloat(hist.stddev_daily || 0);
        const recentAmount = parseFloat(row.recent_total);

        if (recentAmount > threshold) {
          anomalies.push({
            category: row.category,
            currentSpending: recentAmount,
            expectedMax: threshold,
            historicalAverage: parseFloat(hist.avg_daily),
            deviation: recentAmount - parseFloat(hist.avg_daily),
            severity: recentAmount > threshold * 1.5 ? 'high' : 'medium'
          });
        }
      }
    }

    // Create alerts for high severity anomalies
    for (const anomaly of anomalies.filter(a => a.severity === 'high')) {
      await query(`
        INSERT INTO budget_alerts (
          id, tenant_id, alert_type, severity, message, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        crypto.randomUUID(), tenantId, ALERT_TYPES.ANOMALY_DETECTED, ALERT_SEVERITY.WARNING,
        `Unusual spending detected in ${anomaly.category}: $${anomaly.currentSpending.toFixed(2)} vs expected $${anomaly.expectedMax.toFixed(2)}`,
        JSON.stringify(anomaly)
      ]);
    }

    return { anomalies, analyzedAt: new Date() };
  }

  // ============================================
  // Cost Optimization
  // ============================================

  /**
   * Get cost optimization recommendations
   */
  async getOptimizationRecommendations(tenantId) {
    const recommendations = [];

    // Analyze spending patterns
    const spending = await this.getSpendingSummary(tenantId, 'month');

    // Check for underutilized resources
    const phoneNumbers = await query(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN last_used_at < NOW() - INTERVAL '30 days' THEN 1 END) as unused
      FROM phone_numbers
      WHERE tenant_id = $1
    `, [tenantId]);

    if (phoneNumbers.rows[0]?.unused > 0) {
      recommendations.push({
        type: 'unused_resources',
        category: 'phone_numbers',
        title: 'Unused Phone Numbers',
        description: `${phoneNumbers.rows[0].unused} phone numbers haven't been used in 30+ days`,
        potentialSavings: phoneNumbers.rows[0].unused * 1.00, // $1/month per number
        priority: 'medium',
        action: 'Review and release unused phone numbers'
      });
    }

    // Check peak usage times for potential off-peak usage
    const peakAnalysis = await query(`
      SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as call_count,
        SUM(CASE WHEN EXTRACT(HOUR FROM created_at) BETWEEN 9 AND 17 THEN 1 ELSE 0 END) as peak_calls
      FROM calls
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY call_count DESC
    `, [tenantId]);

    // Check for high-cost destinations
    const highCost = await query(`
      SELECT destination_country, COUNT(*) as calls, SUM(cost) as total_cost
      FROM calls
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY destination_country
      ORDER BY total_cost DESC
      LIMIT 5
    `, [tenantId]);

    if (highCost.rows.length > 0) {
      const topDestination = highCost.rows[0];
      if (parseFloat(topDestination.total_cost) > 100) {
        recommendations.push({
          type: 'high_cost_destination',
          category: 'calls',
          title: 'High-Cost Destination',
          description: `${topDestination.calls} calls to ${topDestination.destination_country} cost $${parseFloat(topDestination.total_cost).toFixed(2)}`,
          potentialSavings: parseFloat(topDestination.total_cost) * 0.1,
          priority: 'low',
          action: 'Consider local presence numbers or alternative routing'
        });
      }
    }

    // SMS vs Voice comparison
    const channelCosts = await query(`
      SELECT 'calls' as channel, SUM(cost) as total_cost FROM calls
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      UNION ALL
      SELECT 'sms' as channel, SUM(cost) as total_cost FROM sms_messages
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [tenantId]);

    return {
      recommendations,
      spendingSummary: spending,
      channelCosts: channelCosts.rows,
      generatedAt: new Date()
    };
  }
}

// Singleton instance
const budgetAlertsService = new BudgetAlertsService();

export default budgetAlertsService;
export { BUDGET_TYPES, BUDGET_CATEGORIES, ALERT_SEVERITY, ALERT_TYPES };
