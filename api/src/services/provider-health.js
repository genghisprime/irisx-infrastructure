/**
 * Provider Health Scoring Service
 * Monitor and score carrier/provider health
 */

import db from '../db.js';

class ProviderHealthService {
  // ===========================================
  // METRIC RECORDING
  // ===========================================

  /**
   * Record a health metric for a provider
   */
  async recordMetric(providerId, metricType, metricValue, sampleSize = 1) {
    // Get thresholds
    const thresholds = await this.getThresholds(providerId, metricType);
    let status = 'normal';

    if (thresholds) {
      const { warning_threshold, critical_threshold, comparison_operator } = thresholds;

      if (comparison_operator === 'lt') {
        if (metricValue < critical_threshold) status = 'critical';
        else if (metricValue < warning_threshold) status = 'warning';
      } else if (comparison_operator === 'gt') {
        if (metricValue > critical_threshold) status = 'critical';
        else if (metricValue > warning_threshold) status = 'warning';
      }
    }

    await db.query(`
      INSERT INTO provider_health_metrics (
        provider_id, metric_type, metric_value, status, sample_size,
        threshold_warning, threshold_critical
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      providerId, metricType, metricValue, status, sampleSize,
      thresholds?.warning_threshold, thresholds?.critical_threshold
    ]);

    // Check if alert needed
    if (status === 'critical' || status === 'warning') {
      await this.createAlertIfNeeded(providerId, metricType, metricValue, status, thresholds);
    }

    return { metricType, metricValue, status };
  }

  /**
   * Record multiple metrics at once (batch)
   */
  async recordMetrics(providerId, metrics) {
    const results = [];
    for (const { metricType, metricValue, sampleSize } of metrics) {
      const result = await this.recordMetric(providerId, metricType, metricValue, sampleSize);
      results.push(result);
    }

    // Recalculate health score
    await this.calculateHealthScore(providerId);

    return results;
  }

  /**
   * Record metrics from a completed call
   */
  async recordCallMetrics(providerId, callData) {
    const metrics = [];

    if (callData.answered !== undefined) {
      // Record for ASR calculation (will aggregate)
      metrics.push({
        metricType: 'asr',
        metricValue: callData.answered ? 100 : 0,
        sampleSize: 1
      });
    }

    if (callData.duration) {
      metrics.push({
        metricType: 'acd',
        metricValue: callData.duration,
        sampleSize: 1
      });
    }

    if (callData.pdd) {
      metrics.push({
        metricType: 'pdd',
        metricValue: callData.pdd,
        sampleSize: 1
      });
    }

    if (callData.mos) {
      metrics.push({
        metricType: 'mos',
        metricValue: callData.mos,
        sampleSize: 1
      });
    }

    if (callData.latency) {
      metrics.push({
        metricType: 'latency',
        metricValue: callData.latency,
        sampleSize: 1
      });
    }

    if (metrics.length > 0) {
      await this.recordMetrics(providerId, metrics);
    }
  }

  // ===========================================
  // HEALTH SCORE CALCULATION
  // ===========================================

  /**
   * Calculate and update provider health score
   */
  async calculateHealthScore(providerId) {
    // Get recent metrics (last hour)
    const result = await db.query(`
      SELECT
        AVG(CASE WHEN metric_type = 'asr' THEN metric_value END) as avg_asr,
        AVG(CASE WHEN metric_type = 'mos' THEN metric_value END) as avg_mos,
        AVG(CASE WHEN metric_type = 'pdd' THEN metric_value END) as avg_pdd,
        AVG(CASE WHEN metric_type = 'error_rate' THEN metric_value END) as avg_error_rate,
        AVG(CASE WHEN metric_type = 'latency' THEN metric_value END) as avg_latency,
        AVG(CASE WHEN metric_type = 'ner' THEN metric_value END) as avg_ner,
        COUNT(*) as sample_count
      FROM provider_health_metrics
      WHERE provider_id = $1
        AND recorded_at > NOW() - INTERVAL '1 hour'
    `, [providerId]);

    const metrics = result.rows[0];

    // Calculate component scores
    const reliabilityScore = Math.max(0, 100 - (parseFloat(metrics.avg_error_rate) || 0) * 5);
    const qualityScore = metrics.avg_mos ? (parseFloat(metrics.avg_mos) - 1) * 25 : 100;
    const performanceScore =
      (parseFloat(metrics.avg_asr) || 100) * 0.7 +
      Math.max(0, 100 - (parseFloat(metrics.avg_pdd) || 0) * 5) * 0.3;

    // Overall score (weighted average)
    const overallScore =
      reliabilityScore * 0.4 +
      qualityScore * 0.3 +
      performanceScore * 0.3;

    // Determine status
    let status = 'healthy';
    if (overallScore < 50) status = 'critical';
    else if (overallScore < 70) status = 'degraded';
    else if (overallScore < 85) status = 'warning';

    // Get previous score for trend
    const prevResult = await db.query(`
      SELECT overall_score FROM provider_health_scores WHERE provider_id = $1
    `, [providerId]);
    const prevScore = prevResult.rows[0]?.overall_score || overallScore;

    let trend = 'stable';
    if (overallScore > prevScore + 5) trend = 'improving';
    else if (overallScore < prevScore - 5) trend = 'declining';

    // Update scores
    await db.query(`
      INSERT INTO provider_health_scores (
        provider_id, overall_score, reliability_score, quality_score, performance_score, status, trend
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (provider_id) DO UPDATE SET
        overall_score = $2,
        reliability_score = $3,
        quality_score = $4,
        performance_score = $5,
        status = $6,
        trend = $7,
        updated_at = NOW()
    `, [providerId, overallScore, reliabilityScore, qualityScore, performanceScore, status, trend]);

    return {
      providerId,
      overallScore,
      reliabilityScore,
      qualityScore,
      performanceScore,
      status,
      trend
    };
  }

  /**
   * Get health score for a provider
   */
  async getHealthScore(providerId) {
    const result = await db.query(`
      SELECT * FROM provider_health_scores WHERE provider_id = $1
    `, [providerId]);

    return result.rows[0] || null;
  }

  /**
   * Get all provider health scores
   */
  async getAllHealthScores({ status = null, minScore = null, maxScore = null } = {}) {
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`phs.status = $${paramIndex++}`);
      params.push(status);
    }

    if (minScore !== null) {
      whereConditions.push(`phs.overall_score >= $${paramIndex++}`);
      params.push(minScore);
    }

    if (maxScore !== null) {
      whereConditions.push(`phs.overall_score <= $${paramIndex++}`);
      params.push(maxScore);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await db.query(`
      SELECT
        phs.*,
        p.name as provider_name,
        p.provider_type
      FROM provider_health_scores phs
      LEFT JOIN providers p ON p.id = phs.provider_id
      ${whereClause}
      ORDER BY phs.overall_score DESC
    `, params);

    return result.rows;
  }

  // ===========================================
  // THRESHOLDS
  // ===========================================

  /**
   * Get thresholds for a metric
   */
  async getThresholds(providerId, metricType) {
    // First try provider-specific, then global
    const result = await db.query(`
      SELECT * FROM provider_health_thresholds
      WHERE metric_type = $1 AND (provider_id = $2 OR provider_id IS NULL)
      ORDER BY provider_id NULLS LAST
      LIMIT 1
    `, [metricType, providerId]);

    return result.rows[0] || null;
  }

  /**
   * Set thresholds for a provider/metric
   */
  async setThreshold(providerId, metricType, warningThreshold, criticalThreshold, comparisonOperator = 'lt') {
    await db.query(`
      INSERT INTO provider_health_thresholds (
        provider_id, metric_type, warning_threshold, critical_threshold, comparison_operator
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (provider_id, metric_type) DO UPDATE SET
        warning_threshold = $3,
        critical_threshold = $4,
        comparison_operator = $5
    `, [providerId, metricType, warningThreshold, criticalThreshold, comparisonOperator]);
  }

  // ===========================================
  // ALERTS
  // ===========================================

  /**
   * Create alert if not recently created
   */
  async createAlertIfNeeded(providerId, metricType, currentValue, severity, thresholds) {
    // Check if similar alert exists in last 5 minutes
    const existing = await db.query(`
      SELECT id FROM provider_health_alerts
      WHERE provider_id = $1
        AND metric_type = $2
        AND severity = $3
        AND resolved = false
        AND created_at > NOW() - INTERVAL '5 minutes'
    `, [providerId, metricType, severity]);

    if (existing.rows.length > 0) return null;

    const result = await db.query(`
      INSERT INTO provider_health_alerts (
        provider_id, alert_type, severity, metric_type, current_value, threshold_value, message
      )
      VALUES ($1, 'threshold_breach', $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      providerId,
      severity === 'critical' ? 'critical' : 'warning',
      metricType,
      currentValue,
      severity === 'critical' ? thresholds.critical_threshold : thresholds.warning_threshold,
      `${metricType} ${severity}: ${currentValue.toFixed(2)} (threshold: ${severity === 'critical' ? thresholds.critical_threshold : thresholds.warning_threshold})`
    ]);

    return result.rows[0];
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(providerId = null, { severity = null, limit = 100 } = {}) {
    let whereConditions = ['resolved = false'];
    let params = [];
    let paramIndex = 1;

    if (providerId) {
      whereConditions.push(`provider_id = $${paramIndex++}`);
      params.push(providerId);
    }

    if (severity) {
      whereConditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    const result = await db.query(`
      SELECT
        pha.*,
        p.name as provider_name
      FROM provider_health_alerts pha
      LEFT JOIN providers p ON p.id = pha.provider_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY pha.created_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows;
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, userId) {
    await db.query(`
      UPDATE provider_health_alerts
      SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
      WHERE id = $1
    `, [alertId, userId]);
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId) {
    await db.query(`
      UPDATE provider_health_alerts
      SET resolved = true, resolved_at = NOW()
      WHERE id = $1
    `, [alertId]);
  }

  // ===========================================
  // INCIDENTS
  // ===========================================

  /**
   * Create incident
   */
  async createIncident(providerId, {
    incidentType,
    severity,
    title,
    description = null,
    impact = null,
    affectedRoutes = null,
    startedAt = new Date(),
    autoDetected = false
  }) {
    const result = await db.query(`
      INSERT INTO provider_incidents (
        provider_id, incident_type, severity, title, description,
        impact, affected_routes, started_at, auto_detected
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      providerId, incidentType, severity, title, description,
      impact, affectedRoutes, startedAt, autoDetected
    ]);

    // Update provider status
    if (severity === 'critical') {
      await db.query(`
        UPDATE provider_health_scores
        SET status = 'critical', last_incident_at = NOW()
        WHERE provider_id = $1
      `, [providerId]);
    }

    return result.rows[0];
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(incidentId, status, message, userId = null) {
    await db.query(`
      UPDATE provider_incidents SET status = $2, acknowledged_at = CASE WHEN $2 = 'investigating' THEN NOW() ELSE acknowledged_at END, acknowledged_by = $3
      WHERE id = $1
    `, [incidentId, status, userId]);

    await db.query(`
      INSERT INTO provider_incident_updates (incident_id, status, message, created_by)
      VALUES ($1, $2, $3, $4)
    `, [incidentId, status, message, userId]);
  }

  /**
   * Resolve incident
   */
  async resolveIncident(incidentId, resolutionNotes, userId) {
    await db.query(`
      UPDATE provider_incidents
      SET status = 'resolved', resolved_at = NOW(), resolved_by = $2, resolution_notes = $3
      WHERE id = $1
    `, [incidentId, userId, resolutionNotes]);

    await db.query(`
      INSERT INTO provider_incident_updates (incident_id, status, message, created_by)
      VALUES ($1, 'resolved', $2, $3)
    `, [incidentId, resolutionNotes, userId]);
  }

  /**
   * Get incidents
   */
  async getIncidents(providerId = null, { status = null, severity = null, limit = 50 } = {}) {
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (providerId) {
      whereConditions.push(`pi.provider_id = $${paramIndex++}`);
      params.push(providerId);
    }

    if (status) {
      whereConditions.push(`pi.status = $${paramIndex++}`);
      params.push(status);
    }

    if (severity) {
      whereConditions.push(`pi.severity = $${paramIndex++}`);
      params.push(severity);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await db.query(`
      SELECT
        pi.*,
        p.name as provider_name,
        (SELECT COUNT(*) FROM provider_incident_updates WHERE incident_id = pi.id) as update_count
      FROM provider_incidents pi
      LEFT JOIN providers p ON p.id = pi.provider_id
      ${whereClause}
      ORDER BY pi.started_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows;
  }

  // ===========================================
  // HISTORY & TRENDS
  // ===========================================

  /**
   * Record health snapshot for all providers
   */
  async recordHealthSnapshot() {
    const result = await db.query(`
      INSERT INTO provider_health_history (
        provider_id, overall_score, reliability_score, quality_score, performance_score, status
      )
      SELECT provider_id, overall_score, reliability_score, quality_score, performance_score, status
      FROM provider_health_scores
      RETURNING provider_id
    `);

    return result.rowCount;
  }

  /**
   * Get health history for a provider
   */
  async getHealthHistory(providerId, { days = 7, interval = 'hour' } = {}) {
    const result = await db.query(`
      SELECT
        date_trunc($3, recorded_at) as period,
        AVG(overall_score) as avg_score,
        AVG(reliability_score) as avg_reliability,
        AVG(quality_score) as avg_quality,
        AVG(performance_score) as avg_performance,
        SUM(call_volume) as total_calls,
        SUM(error_count) as total_errors
      FROM provider_health_history
      WHERE provider_id = $1
        AND recorded_at > NOW() - ($2 || ' days')::INTERVAL
      GROUP BY date_trunc($3, recorded_at)
      ORDER BY period
    `, [providerId, days, interval]);

    return result.rows;
  }

  // ===========================================
  // ROUTE SCORING
  // ===========================================

  /**
   * Update route score for a provider
   */
  async updateRouteScore(providerId, routePrefix, callStats) {
    const { totalCalls, successfulCalls, asr, avgAcd, avgPdd, avgMos, avgCost } = callStats;

    // Calculate scores
    const qualityScore = avgMos ? (avgMos - 1) * 25 : 50;
    const costScore = avgCost ? Math.max(0, 100 - avgCost * 100) : 50; // Lower cost = higher score
    const overallScore = asr * 0.4 + qualityScore * 0.3 + costScore * 0.3;

    await db.query(`
      INSERT INTO provider_route_scores (
        provider_id, route_prefix, total_calls, successful_calls,
        asr, avg_acd, avg_pdd, avg_mos, avg_cost_per_minute,
        quality_score, cost_score, overall_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (provider_id, route_prefix) DO UPDATE SET
        total_calls = provider_route_scores.total_calls + $3,
        successful_calls = provider_route_scores.successful_calls + $4,
        asr = $5,
        avg_acd = $6,
        avg_pdd = $7,
        avg_mos = $8,
        avg_cost_per_minute = $9,
        quality_score = $10,
        cost_score = $11,
        overall_score = $12,
        updated_at = NOW()
    `, [
      providerId, routePrefix, totalCalls, successfulCalls,
      asr, avgAcd, avgPdd, avgMos, avgCost,
      qualityScore, costScore, overallScore
    ]);

    // Update rankings for this route
    await this.updateRouteRankings(routePrefix);
  }

  /**
   * Update rankings for a route
   */
  async updateRouteRankings(routePrefix) {
    await db.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY overall_score DESC) as new_rank
        FROM provider_route_scores
        WHERE route_prefix = $1
      )
      UPDATE provider_route_scores prs
      SET rank = r.new_rank
      FROM ranked r
      WHERE prs.id = r.id
    `, [routePrefix]);
  }

  /**
   * Get best provider for a route
   */
  async getBestProviderForRoute(routePrefix) {
    const result = await db.query(`
      SELECT
        prs.*,
        p.name as provider_name,
        phs.status as health_status
      FROM provider_route_scores prs
      JOIN providers p ON p.id = prs.provider_id
      LEFT JOIN provider_health_scores phs ON phs.provider_id = prs.provider_id
      WHERE prs.route_prefix = $1
        AND (phs.status IS NULL OR phs.status != 'critical')
      ORDER BY prs.rank ASC
      LIMIT 1
    `, [routePrefix]);

    return result.rows[0] || null;
  }

  /**
   * Get route rankings
   */
  async getRouteRankings(routePrefix) {
    const result = await db.query(`
      SELECT
        prs.*,
        p.name as provider_name,
        phs.status as health_status,
        phs.overall_score as health_score
      FROM provider_route_scores prs
      JOIN providers p ON p.id = prs.provider_id
      LEFT JOIN provider_health_scores phs ON phs.provider_id = prs.provider_id
      WHERE prs.route_prefix = $1
      ORDER BY prs.rank ASC
    `, [routePrefix]);

    return result.rows;
  }

  // ===========================================
  // FAILOVER
  // ===========================================

  /**
   * Check and trigger failover if needed
   */
  async checkFailover(providerId) {
    // Get failover rules for this provider
    const rules = await db.query(`
      SELECT * FROM provider_failover_rules
      WHERE primary_provider_id = $1 AND is_active = true
    `, [providerId]);

    if (rules.rows.length === 0) return null;

    // Get current health
    const health = await this.getHealthScore(providerId);
    if (!health || health.status !== 'critical') return null;

    const triggeredRules = [];

    for (const rule of rules.rows) {
      const conditions = rule.trigger_conditions || {};

      // Check if conditions met
      let shouldTrigger = health.status === 'critical';

      if (conditions.asr_below) {
        const metrics = await db.query(`
          SELECT AVG(metric_value) as avg_asr FROM provider_health_metrics
          WHERE provider_id = $1 AND metric_type = 'asr' AND recorded_at > NOW() - INTERVAL '5 minutes'
        `, [providerId]);
        if (metrics.rows[0]?.avg_asr < conditions.asr_below) shouldTrigger = true;
      }

      if (shouldTrigger) {
        // Update rule
        await db.query(`
          UPDATE provider_failover_rules
          SET last_triggered_at = NOW(), trigger_count = trigger_count + 1
          WHERE id = $1
        `, [rule.id]);

        triggeredRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          failoverProviders: rule.failover_providers
        });
      }
    }

    return triggeredRules.length > 0 ? triggeredRules : null;
  }

  // ===========================================
  // DASHBOARD
  // ===========================================

  /**
   * Get provider health dashboard data
   */
  async getDashboard() {
    // Overall stats
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_providers,
        COUNT(*) FILTER (WHERE status = 'healthy') as healthy_count,
        COUNT(*) FILTER (WHERE status = 'degraded') as degraded_count,
        COUNT(*) FILTER (WHERE status = 'critical') as critical_count,
        AVG(overall_score) as avg_score
      FROM provider_health_scores
    `);

    // Active alerts
    const alertsResult = await db.query(`
      SELECT severity, COUNT(*) as count
      FROM provider_health_alerts
      WHERE resolved = false
      GROUP BY severity
    `);

    // Open incidents
    const incidentsResult = await db.query(`
      SELECT severity, COUNT(*) as count
      FROM provider_incidents
      WHERE status != 'resolved'
      GROUP BY severity
    `);

    // Top issues
    const topIssuesResult = await db.query(`
      SELECT
        p.name as provider_name,
        phs.status,
        phs.overall_score,
        (SELECT COUNT(*) FROM provider_health_alerts WHERE provider_id = phs.provider_id AND resolved = false) as active_alerts
      FROM provider_health_scores phs
      JOIN providers p ON p.id = phs.provider_id
      WHERE phs.status IN ('critical', 'degraded')
      ORDER BY phs.overall_score ASC
      LIMIT 5
    `);

    return {
      stats: statsResult.rows[0],
      alertsBySeveity: alertsResult.rows,
      incidentsBySeverity: incidentsResult.rows,
      topIssues: topIssuesResult.rows
    };
  }
}

export default new ProviderHealthService();
