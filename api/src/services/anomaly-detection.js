/**
 * Anomaly Detection Service
 * Statistical anomaly detection with auto-remediation
 */

import db from '../db.js';

class AnomalyDetectionService {
  constructor() {
    this.detectionMethods = ['zscore', 'iqr', 'threshold', 'ml'];
    this.severityLevels = ['info', 'warning', 'critical'];
  }

  // ===========================================
  // METRIC COLLECTION
  // ===========================================

  /**
   * Record a metric value
   */
  async recordMetric(data) {
    const {
      tenantId,
      metricType,
      metricValue,
      dimension,
      dimensionValue,
      timestamp = new Date()
    } = data;

    await db.query(`
      INSERT INTO metric_history (
        tenant_id, metric_type, metric_value, metric_timestamp,
        dimension, dimension_value
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, metricType, metricValue, timestamp, dimension, dimensionValue]);

    // Check for anomalies
    await this.checkForAnomalies(tenantId, metricType, metricValue, dimension, dimensionValue);
  }

  /**
   * Collect common metrics for a tenant
   */
  async collectTenantMetrics(tenantId) {
    const timestamp = new Date();
    const metrics = [];

    // Call volume (last hour)
    const callVolume = await db.query(`
      SELECT COUNT(*) as count
      FROM cdrs
      WHERE tenant_id = $1 AND start_time > NOW() - INTERVAL '1 hour'
    `, [tenantId]);
    metrics.push({ type: 'call_volume', value: parseInt(callVolume.rows[0].count) });

    // API calls (last hour)
    const apiCalls = await db.query(`
      SELECT COUNT(*) as count
      FROM api_logs
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
    `, [tenantId]);
    metrics.push({ type: 'api_calls', value: parseInt(apiCalls.rows[0].count) });

    // Failed logins (last hour)
    const failedLogins = await db.query(`
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE tenant_id = $1 AND success = false AND created_at > NOW() - INTERVAL '1 hour'
    `, [tenantId]);
    metrics.push({ type: 'failed_logins', value: parseInt(failedLogins.rows[0].count) });

    // Daily spend
    const spend = await db.query(`
      SELECT COALESCE(SUM(cost), 0) as total
      FROM usage_events
      WHERE tenant_id = $1 AND created_at > CURRENT_DATE
    `, [tenantId]);
    metrics.push({ type: 'daily_spend', value: parseFloat(spend.rows[0].total) });

    // Average MOS score (last hour)
    const mosScore = await db.query(`
      SELECT AVG(mos_score) as avg_mos
      FROM call_quality_metrics
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
    `, [tenantId]);
    if (mosScore.rows[0].avg_mos) {
      metrics.push({ type: 'avg_mos_score', value: parseFloat(mosScore.rows[0].avg_mos) });
    }

    // Record all metrics
    for (const metric of metrics) {
      await this.recordMetric({
        tenantId,
        metricType: metric.type,
        metricValue: metric.value,
        timestamp
      });
    }

    return metrics;
  }

  // ===========================================
  // ANOMALY DETECTION
  // ===========================================

  /**
   * Check if a metric value is anomalous
   */
  async checkForAnomalies(tenantId, metricType, metricValue, dimension = null, dimensionValue = null) {
    // Get applicable rules
    const rules = await db.query(`
      SELECT * FROM anomaly_rules
      WHERE is_active = true
        AND metric_type = $1
        AND (tenant_id IS NULL OR tenant_id = $2)
    `, [metricType, tenantId]);

    for (const rule of rules.rows) {
      // Check cooldown
      const recentAnomaly = await db.query(`
        SELECT id FROM anomalies
        WHERE rule_id = $1
          AND (tenant_id = $2 OR $2 IS NULL)
          AND created_at > NOW() - INTERVAL '${rule.cooldown_minutes} minutes'
        LIMIT 1
      `, [rule.id, tenantId]);

      if (recentAnomaly.rows.length > 0) {
        continue; // Skip if in cooldown
      }

      const isAnomaly = await this.detectAnomaly(rule, tenantId, metricValue, dimension, dimensionValue);

      if (isAnomaly.detected) {
        await this.createAnomaly({
          ruleId: rule.id,
          tenantId,
          metricType,
          metricValue,
          expectedValue: isAnomaly.expected,
          deviationScore: isAnomaly.score,
          dimension,
          dimensionValue,
          severity: rule.severity,
          possibleCauses: isAnomaly.possibleCauses,
          recommendedActions: isAnomaly.recommendedActions
        });
      }
    }
  }

  /**
   * Detect anomaly using configured method
   */
  async detectAnomaly(rule, tenantId, metricValue, dimension, dimensionValue) {
    switch (rule.detection_method) {
      case 'zscore':
        return await this.detectWithZScore(rule, tenantId, metricValue, dimension, dimensionValue);
      case 'iqr':
        return await this.detectWithIQR(rule, tenantId, metricValue, dimension, dimensionValue);
      case 'threshold':
        return this.detectWithThreshold(rule, metricValue);
      default:
        return { detected: false };
    }
  }

  /**
   * Z-Score based anomaly detection
   */
  async detectWithZScore(rule, tenantId, metricValue, dimension, dimensionValue) {
    // Get baseline statistics
    const baseline = await this.getBaseline(tenantId, rule.metric_type, dimension, dimensionValue, rule.comparison_period);

    if (!baseline || baseline.sampleCount < 10) {
      // Not enough data for baseline
      return { detected: false };
    }

    // Calculate Z-score
    const zscore = (metricValue - baseline.mean) / baseline.stdDev;
    const threshold = rule.zscore_threshold || 3.0;

    if (Math.abs(zscore) > threshold) {
      return {
        detected: true,
        score: zscore,
        expected: baseline.mean,
        possibleCauses: this.inferCauses(rule.metric_type, zscore > 0 ? 'high' : 'low'),
        recommendedActions: this.getRecommendedActions(rule.metric_type, zscore > 0 ? 'high' : 'low')
      };
    }

    return { detected: false };
  }

  /**
   * IQR (Interquartile Range) based anomaly detection
   */
  async detectWithIQR(rule, tenantId, metricValue, dimension, dimensionValue) {
    // Get baseline with percentiles
    const baseline = await this.getBaseline(tenantId, rule.metric_type, dimension, dimensionValue, rule.comparison_period);

    if (!baseline || baseline.sampleCount < 10) {
      return { detected: false };
    }

    const iqr = baseline.percentile75 - baseline.percentile25;
    const multiplier = rule.iqr_multiplier || 1.5;

    const lowerBound = baseline.percentile25 - (multiplier * iqr);
    const upperBound = baseline.percentile75 + (multiplier * iqr);

    if (metricValue < lowerBound || metricValue > upperBound) {
      const deviation = metricValue > upperBound
        ? (metricValue - upperBound) / iqr
        : (lowerBound - metricValue) / iqr;

      return {
        detected: true,
        score: deviation,
        expected: baseline.median,
        possibleCauses: this.inferCauses(rule.metric_type, metricValue > baseline.median ? 'high' : 'low'),
        recommendedActions: this.getRecommendedActions(rule.metric_type, metricValue > baseline.median ? 'high' : 'low')
      };
    }

    return { detected: false };
  }

  /**
   * Static threshold based detection
   */
  detectWithThreshold(rule, metricValue) {
    if (rule.static_threshold === null) {
      return { detected: false };
    }

    if (metricValue > rule.static_threshold) {
      return {
        detected: true,
        score: (metricValue - rule.static_threshold) / rule.static_threshold,
        expected: rule.static_threshold,
        possibleCauses: this.inferCauses(rule.metric_type, 'high'),
        recommendedActions: this.getRecommendedActions(rule.metric_type, 'high')
      };
    }

    return { detected: false };
  }

  /**
   * Get or calculate baseline for a metric
   */
  async getBaseline(tenantId, metricType, dimension, dimensionValue, periodType) {
    // Try to get cached baseline
    const cached = await db.query(`
      SELECT * FROM metric_baselines
      WHERE tenant_id = $1
        AND metric_type = $2
        AND (dimension = $3 OR ($3 IS NULL AND dimension IS NULL))
        AND (dimension_value = $4 OR ($4 IS NULL AND dimension_value IS NULL))
        AND period_type = $5
        AND last_calculated > NOW() - INTERVAL '1 hour'
      LIMIT 1
    `, [tenantId, metricType, dimension, dimensionValue, periodType]);

    if (cached.rows.length > 0) {
      return {
        mean: parseFloat(cached.rows[0].mean_value),
        stdDev: parseFloat(cached.rows[0].std_dev),
        min: parseFloat(cached.rows[0].min_value),
        max: parseFloat(cached.rows[0].max_value),
        percentile25: parseFloat(cached.rows[0].percentile_25),
        median: parseFloat(cached.rows[0].percentile_50),
        percentile75: parseFloat(cached.rows[0].percentile_75),
        sampleCount: cached.rows[0].sample_count
      };
    }

    // Calculate baseline from history
    return await this.calculateBaseline(tenantId, metricType, dimension, dimensionValue, periodType);
  }

  /**
   * Calculate baseline statistics from historical data
   */
  async calculateBaseline(tenantId, metricType, dimension, dimensionValue, periodType) {
    const lookbackDays = periodType === 'hour' ? 7 : (periodType === 'day' ? 30 : 90);

    let dimensionFilter = '';
    const params = [tenantId, metricType, lookbackDays];

    if (dimension && dimensionValue) {
      dimensionFilter = ' AND dimension = $4 AND dimension_value = $5';
      params.push(dimension, dimensionValue);
    }

    const result = await db.query(`
      SELECT
        AVG(metric_value) as mean,
        STDDEV(metric_value) as std_dev,
        MIN(metric_value) as min_value,
        MAX(metric_value) as max_value,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY metric_value) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY metric_value) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY metric_value) as p75,
        COUNT(*) as sample_count
      FROM metric_history
      WHERE tenant_id = $1
        AND metric_type = $2
        AND metric_timestamp > NOW() - INTERVAL '${lookbackDays} days'
        ${dimensionFilter}
    `, params);

    if (result.rows.length === 0 || result.rows[0].sample_count < 10) {
      return null;
    }

    const baseline = {
      mean: parseFloat(result.rows[0].mean) || 0,
      stdDev: parseFloat(result.rows[0].std_dev) || 1,
      min: parseFloat(result.rows[0].min_value) || 0,
      max: parseFloat(result.rows[0].max_value) || 0,
      percentile25: parseFloat(result.rows[0].p25) || 0,
      median: parseFloat(result.rows[0].p50) || 0,
      percentile75: parseFloat(result.rows[0].p75) || 0,
      sampleCount: parseInt(result.rows[0].sample_count)
    };

    // Cache the baseline
    await db.query(`
      INSERT INTO metric_baselines (
        tenant_id, metric_type, dimension, dimension_value, period_type,
        mean_value, std_dev, min_value, max_value,
        percentile_25, percentile_50, percentile_75, sample_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (tenant_id, metric_type, dimension, dimension_value, period_type, period_value)
      DO UPDATE SET
        mean_value = EXCLUDED.mean_value,
        std_dev = EXCLUDED.std_dev,
        min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value,
        percentile_25 = EXCLUDED.percentile_25,
        percentile_50 = EXCLUDED.percentile_50,
        percentile_75 = EXCLUDED.percentile_75,
        sample_count = EXCLUDED.sample_count,
        last_calculated = NOW()
    `, [
      tenantId, metricType, dimension, dimensionValue, periodType,
      baseline.mean, baseline.stdDev, baseline.min, baseline.max,
      baseline.percentile25, baseline.median, baseline.percentile75, baseline.sampleCount
    ]);

    return baseline;
  }

  // ===========================================
  // ANOMALY MANAGEMENT
  // ===========================================

  /**
   * Create anomaly record
   */
  async createAnomaly(data) {
    const {
      ruleId,
      tenantId,
      metricType,
      metricValue,
      expectedValue,
      deviationScore,
      dimension,
      dimensionValue,
      severity,
      possibleCauses,
      recommendedActions
    } = data;

    const description = this.generateDescription(metricType, metricValue, expectedValue, severity);

    const result = await db.query(`
      INSERT INTO anomalies (
        rule_id, tenant_id, metric_type, metric_value, expected_value,
        deviation_score, dimension, dimension_value, detection_timestamp,
        severity, description, possible_causes, recommended_actions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
      RETURNING *
    `, [
      ruleId, tenantId, metricType, metricValue, expectedValue,
      deviationScore, dimension, dimensionValue,
      severity, description, JSON.stringify(possibleCauses || []), JSON.stringify(recommendedActions || [])
    ]);

    const anomaly = result.rows[0];

    // Send notifications
    await this.sendAnomalyNotifications(anomaly);

    // Check for auto-remediation
    await this.checkAutoRemediation(anomaly);

    console.log(`[AnomalyDetection] Detected anomaly: ${metricType} = ${metricValue} (expected ~${expectedValue})`);

    return anomaly;
  }

  /**
   * Generate human-readable description
   */
  generateDescription(metricType, actual, expected, severity) {
    const direction = actual > expected ? 'higher' : 'lower';
    const percentage = Math.abs(((actual - expected) / expected) * 100).toFixed(1);

    const metricNames = {
      'call_volume': 'Call volume',
      'api_calls': 'API call rate',
      'failed_logins': 'Failed login attempts',
      'daily_spend': 'Daily spend',
      'avg_mos_score': 'Average call quality (MOS)',
      'avg_response_time': 'API response time',
      'error_rate': 'Error rate'
    };

    const name = metricNames[metricType] || metricType;

    return `${severity.toUpperCase()}: ${name} is ${percentage}% ${direction} than expected (${actual.toFixed(2)} vs expected ${expected.toFixed(2)})`;
  }

  /**
   * Infer possible causes for anomaly
   */
  inferCauses(metricType, direction) {
    const causes = {
      'call_volume': {
        high: ['Marketing campaign launch', 'Service outage causing callbacks', 'Seasonal spike', 'Emergency event'],
        low: ['System outage', 'Network issues', 'Holiday period', 'Carrier problems']
      },
      'api_calls': {
        high: ['Client implementation bug', 'Integration testing', 'Automated system issue', 'DDoS attempt'],
        low: ['Client system down', 'API integration issue', 'Authentication problems']
      },
      'failed_logins': {
        high: ['Brute force attack', 'Credential stuffing', 'Password policy change', 'User confusion'],
        low: ['Improved security awareness', 'Reduced user activity']
      },
      'daily_spend': {
        high: ['Campaign increase', 'Premium service usage', 'Billing error', 'Fraud'],
        low: ['Reduced activity', 'Service issues', 'Contract changes']
      },
      'avg_mos_score': {
        high: ['Network improvements', 'Carrier upgrades'],
        low: ['Network congestion', 'Carrier issues', 'Equipment problems', 'Geographic issues']
      }
    };

    return causes[metricType]?.[direction] || ['Unknown cause'];
  }

  /**
   * Get recommended actions for anomaly
   */
  getRecommendedActions(metricType, direction) {
    const actions = {
      'call_volume': {
        high: ['Scale up agent capacity', 'Enable overflow routing', 'Check for service issues'],
        low: ['Investigate system health', 'Check carrier status', 'Review recent changes']
      },
      'api_calls': {
        high: ['Enable rate limiting', 'Contact client if known', 'Check for abuse'],
        low: ['Check client health', 'Review API changes', 'Test integrations']
      },
      'failed_logins': {
        high: ['Enable IP blocking', 'Review security logs', 'Notify affected users', 'Consider 2FA enforcement'],
        low: []
      },
      'daily_spend': {
        high: ['Review usage breakdown', 'Check for anomalous activity', 'Enable spend alerts'],
        low: ['Check service delivery', 'Review customer feedback']
      },
      'avg_mos_score': {
        high: [],
        low: ['Check carrier quality', 'Review network metrics', 'Enable quality routing', 'Contact carrier support']
      }
    };

    return actions[metricType]?.[direction] || ['Investigate further'];
  }

  /**
   * Send notifications for anomaly
   */
  async sendAnomalyNotifications(anomaly) {
    // Get notification channels from rule
    const rule = await db.query(`
      SELECT notify_channels FROM anomaly_rules WHERE id = $1
    `, [anomaly.rule_id]);

    const channels = rule.rows[0]?.notify_channels || ['email'];

    for (const channel of channels) {
      await db.query(`
        INSERT INTO anomaly_notifications (anomaly_id, channel, status)
        VALUES ($1, $2, 'pending')
      `, [anomaly.id, channel]);

      // In production, actually send the notification here
      // For now, just log it
      console.log(`[AnomalyDetection] Would send ${channel} notification for anomaly ${anomaly.id}`);
    }
  }

  /**
   * Check and trigger auto-remediation
   */
  async checkAutoRemediation(anomaly) {
    // Get applicable remediation rules
    const rules = await db.query(`
      SELECT * FROM remediation_rules
      WHERE rule_id = $1
        AND is_active = true
        AND severity_threshold = $2
    `, [anomaly.rule_id, anomaly.severity]);

    for (const rule of rules.rows) {
      // Check consecutive anomalies
      const consecutiveCount = await db.query(`
        SELECT COUNT(*) as count
        FROM anomalies
        WHERE rule_id = $1
          AND (tenant_id = $2 OR $2 IS NULL)
          AND created_at > NOW() - INTERVAL '1 hour'
      `, [anomaly.rule_id, anomaly.tenant_id]);

      if (parseInt(consecutiveCount.rows[0].count) >= rule.consecutive_anomalies) {
        // Check rate limit
        const recentExecutions = await db.query(`
          SELECT COUNT(*) as count
          FROM remediation_executions
          WHERE rule_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
        `, [rule.id]);

        if (parseInt(recentExecutions.rows[0].count) < rule.max_executions_per_hour) {
          await this.createRemediationExecution(rule, anomaly);
        }
      }
    }
  }

  /**
   * Create remediation execution
   */
  async createRemediationExecution(rule, anomaly) {
    await db.query(`
      INSERT INTO remediation_executions (
        rule_id, anomaly_id, tenant_id, action_type, action_config, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      rule.id, anomaly.id, anomaly.tenant_id,
      rule.action_type, JSON.stringify(rule.action_config),
      rule.require_approval ? 'pending' : 'approved'
    ]);

    console.log(`[AnomalyDetection] Created remediation execution for anomaly ${anomaly.id}`);
  }

  // ===========================================
  // API METHODS
  // ===========================================

  /**
   * Get anomalies list
   */
  async getAnomalies(options = {}) {
    const {
      tenantId,
      status,
      severity,
      metricType,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0
    } = options;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereConditions.push(`a.tenant_id = $${paramIndex++}`);
      params.push(tenantId);
    }
    if (status) {
      whereConditions.push(`a.status = $${paramIndex++}`);
      params.push(status);
    }
    if (severity) {
      whereConditions.push(`a.severity = $${paramIndex++}`);
      params.push(severity);
    }
    if (metricType) {
      whereConditions.push(`a.metric_type = $${paramIndex++}`);
      params.push(metricType);
    }
    if (dateFrom) {
      whereConditions.push(`a.detection_timestamp >= $${paramIndex++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      whereConditions.push(`a.detection_timestamp <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await db.query(`
      SELECT
        a.*,
        r.name as rule_name,
        r.category as rule_category
      FROM anomalies a
      JOIN anomaly_rules r ON r.id = a.rule_id
      ${whereClause}
      ORDER BY a.detection_timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM anomalies a ${whereClause}
    `, params);

    return {
      anomalies: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }

  /**
   * Update anomaly status
   */
  async updateAnomalyStatus(anomalyId, status, userId, notes = null) {
    const updates = ['status = $2'];
    const params = [anomalyId, status];
    let paramIndex = 3;

    if (status === 'acknowledged') {
      updates.push(`acknowledged_by = $${paramIndex++}`);
      params.push(userId);
      updates.push(`acknowledged_at = NOW()`);
    } else if (status === 'resolved') {
      updates.push(`resolved_at = NOW()`);
      if (notes) {
        updates.push(`resolution_notes = $${paramIndex++}`);
        params.push(notes);
      }
    }

    await db.query(`
      UPDATE anomalies SET ${updates.join(', ')} WHERE id = $1
    `, params);

    return this.getAnomaly(anomalyId);
  }

  /**
   * Get single anomaly
   */
  async getAnomaly(anomalyId) {
    const result = await db.query(`
      SELECT
        a.*,
        r.name as rule_name,
        r.category as rule_category,
        r.description as rule_description
      FROM anomalies a
      JOIN anomaly_rules r ON r.id = a.rule_id
      WHERE a.id = $1
    `, [anomalyId]);

    return result.rows[0];
  }

  /**
   * Get anomaly summary/dashboard
   */
  async getAnomalySummary(tenantId = null, days = 7) {
    const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
    const params = tenantId ? [days, tenantId] : [days];

    // By severity
    const bySeverity = await db.query(`
      SELECT
        severity,
        COUNT(*) as count
      FROM anomalies
      WHERE detection_timestamp > NOW() - INTERVAL '${days} days'
        ${tenantFilter}
      GROUP BY severity
    `, params);

    // By status
    const byStatus = await db.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM anomalies
      WHERE detection_timestamp > NOW() - INTERVAL '${days} days'
        ${tenantFilter}
      GROUP BY status
    `, params);

    // By category
    const byCategory = await db.query(`
      SELECT
        r.category,
        COUNT(*) as count
      FROM anomalies a
      JOIN anomaly_rules r ON r.id = a.rule_id
      WHERE a.detection_timestamp > NOW() - INTERVAL '${days} days'
        ${tenantId ? 'AND a.tenant_id = $2' : ''}
      GROUP BY r.category
    `, params);

    // Trend (daily)
    const trend = await db.query(`
      SELECT
        DATE(detection_timestamp) as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical
      FROM anomalies
      WHERE detection_timestamp > NOW() - INTERVAL '${days} days'
        ${tenantFilter}
      GROUP BY DATE(detection_timestamp)
      ORDER BY date
    `, params);

    return {
      bySeverity: bySeverity.rows,
      byStatus: byStatus.rows,
      byCategory: byCategory.rows,
      trend: trend.rows,
      periodDays: days
    };
  }

  /**
   * Get anomaly rules
   */
  async getRules(tenantId = null) {
    const result = await db.query(`
      SELECT * FROM anomaly_rules
      WHERE tenant_id IS NULL OR tenant_id = $1
      ORDER BY category, name
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Create or update anomaly rule
   */
  async upsertRule(data) {
    const {
      id,
      tenantId,
      name,
      description,
      category,
      detectionMethod,
      metricType,
      thresholdType,
      staticThreshold,
      zscoreThreshold,
      iqrMultiplier,
      comparisonPeriod,
      lookbackPeriods,
      severity,
      cooldownMinutes,
      notifyChannels,
      isActive
    } = data;

    if (id) {
      // Update
      await db.query(`
        UPDATE anomaly_rules SET
          name = $2, description = $3, category = $4, detection_method = $5,
          metric_type = $6, threshold_type = $7, static_threshold = $8,
          zscore_threshold = $9, iqr_multiplier = $10, comparison_period = $11,
          lookback_periods = $12, severity = $13, cooldown_minutes = $14,
          notify_channels = $15, is_active = $16, updated_at = NOW()
        WHERE id = $1
      `, [
        id, name, description, category, detectionMethod,
        metricType, thresholdType, staticThreshold,
        zscoreThreshold, iqrMultiplier, comparisonPeriod,
        lookbackPeriods, severity, cooldownMinutes,
        JSON.stringify(notifyChannels), isActive
      ]);

      return this.getRule(id);
    } else {
      // Create
      const result = await db.query(`
        INSERT INTO anomaly_rules (
          tenant_id, name, description, category, detection_method,
          metric_type, threshold_type, static_threshold,
          zscore_threshold, iqr_multiplier, comparison_period,
          lookback_periods, severity, cooldown_minutes, notify_channels, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        tenantId, name, description, category, detectionMethod,
        metricType, thresholdType, staticThreshold,
        zscoreThreshold, iqrMultiplier, comparisonPeriod,
        lookbackPeriods, severity, cooldownMinutes,
        JSON.stringify(notifyChannels), isActive
      ]);

      return result.rows[0];
    }
  }

  async getRule(ruleId) {
    const result = await db.query(`SELECT * FROM anomaly_rules WHERE id = $1`, [ruleId]);
    return result.rows[0];
  }
}

export default new AnomalyDetectionService();
