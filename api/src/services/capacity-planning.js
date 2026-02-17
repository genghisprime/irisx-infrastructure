/**
 * Capacity Planning & Forecasting Service
 *
 * Features:
 * - Resource utilization tracking (API, DB, telephony, storage)
 * - Capacity forecasting using trend analysis
 * - Auto-scaling recommendations
 * - Cost projections
 * - Threshold alerts
 * - Historical trend analysis
 * - Peak load prediction
 */

import pool from '../db/connection.js';

// Resource types being tracked
const RESOURCE_TYPES = {
  API_REQUESTS: 'api_requests',
  DATABASE_CONNECTIONS: 'database_connections',
  DATABASE_STORAGE: 'database_storage',
  REDIS_MEMORY: 'redis_memory',
  TELEPHONY_CHANNELS: 'telephony_channels',
  SIP_TRUNKS: 'sip_trunks',
  CONCURRENT_CALLS: 'concurrent_calls',
  S3_STORAGE: 's3_storage',
  BANDWIDTH: 'bandwidth',
  AGENT_SESSIONS: 'agent_sessions'
};

// Time horizons for forecasting
const FORECAST_HORIZONS = {
  SHORT: '7_days',
  MEDIUM: '30_days',
  LONG: '90_days',
  YEARLY: '365_days'
};

class CapacityPlanningService {
  constructor() {
    this.capacityLimits = {
      [RESOURCE_TYPES.API_REQUESTS]: 100000,        // per minute
      [RESOURCE_TYPES.DATABASE_CONNECTIONS]: 500,   // concurrent
      [RESOURCE_TYPES.DATABASE_STORAGE]: 500,       // GB
      [RESOURCE_TYPES.REDIS_MEMORY]: 16,            // GB
      [RESOURCE_TYPES.TELEPHONY_CHANNELS]: 1000,    // concurrent
      [RESOURCE_TYPES.SIP_TRUNKS]: 50,              // total
      [RESOURCE_TYPES.CONCURRENT_CALLS]: 500,       // concurrent
      [RESOURCE_TYPES.S3_STORAGE]: 5000,            // GB
      [RESOURCE_TYPES.BANDWIDTH]: 10000,            // Mbps
      [RESOURCE_TYPES.AGENT_SESSIONS]: 2000         // concurrent
    };
  }

  /**
   * Record resource utilization metrics
   */
  async recordMetrics(metrics) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const metric of metrics) {
        await client.query(`
          INSERT INTO capacity_metrics (
            resource_type, current_value, max_capacity,
            utilization_percent, tenant_id, metadata, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          metric.resource_type,
          metric.current_value,
          metric.max_capacity || this.capacityLimits[metric.resource_type],
          metric.utilization_percent || (metric.current_value / (metric.max_capacity || this.capacityLimits[metric.resource_type]) * 100),
          metric.tenant_id,
          JSON.stringify(metric.metadata || {})
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get current capacity status for all resources
   */
  async getCurrentCapacityStatus() {
    const result = await pool.query(`
      WITH latest_metrics AS (
        SELECT DISTINCT ON (resource_type)
          resource_type,
          current_value,
          max_capacity,
          utilization_percent,
          recorded_at
        FROM capacity_metrics
        WHERE recorded_at >= NOW() - INTERVAL '1 hour'
        ORDER BY resource_type, recorded_at DESC
      )
      SELECT * FROM latest_metrics
    `);

    const status = {};
    for (const row of result.rows) {
      status[row.resource_type] = {
        current: row.current_value,
        max: row.max_capacity,
        utilization: parseFloat(row.utilization_percent),
        status: this.getUtilizationStatus(row.utilization_percent),
        lastUpdated: row.recorded_at
      };
    }

    // Add any missing resource types with defaults
    for (const [type, limit] of Object.entries(this.capacityLimits)) {
      if (!status[type]) {
        status[type] = {
          current: 0,
          max: limit,
          utilization: 0,
          status: 'healthy',
          lastUpdated: null
        };
      }
    }

    return status;
  }

  /**
   * Get utilization status label
   */
  getUtilizationStatus(utilization) {
    if (utilization >= 90) return 'critical';
    if (utilization >= 75) return 'warning';
    if (utilization >= 50) return 'elevated';
    return 'healthy';
  }

  /**
   * Forecast future capacity needs
   */
  async forecast(resourceType, horizon = FORECAST_HORIZONS.MEDIUM) {
    const daysMap = {
      [FORECAST_HORIZONS.SHORT]: 7,
      [FORECAST_HORIZONS.MEDIUM]: 30,
      [FORECAST_HORIZONS.LONG]: 90,
      [FORECAST_HORIZONS.YEARLY]: 365
    };

    const forecastDays = daysMap[horizon] || 30;
    const lookbackDays = Math.max(forecastDays * 2, 30); // Look back at least as much as we're forecasting

    // Get historical data
    const result = await pool.query(`
      SELECT
        DATE(recorded_at) as date,
        AVG(current_value) as avg_value,
        MAX(current_value) as peak_value,
        AVG(utilization_percent) as avg_utilization
      FROM capacity_metrics
      WHERE resource_type = $1
        AND recorded_at >= NOW() - INTERVAL '${lookbackDays} days'
      GROUP BY DATE(recorded_at)
      ORDER BY date
    `, [resourceType]);

    if (result.rows.length < 7) {
      return {
        error: 'Insufficient historical data for forecasting',
        minimum_required_days: 7,
        available_days: result.rows.length
      };
    }

    const historicalData = result.rows.map(r => ({
      date: r.date,
      value: parseFloat(r.avg_value),
      peak: parseFloat(r.peak_value),
      utilization: parseFloat(r.avg_utilization)
    }));

    // Calculate trend using linear regression
    const trend = this.calculateLinearTrend(historicalData.map(d => d.value));

    // Calculate seasonality (weekly pattern)
    const weeklyPattern = this.calculateWeeklyPattern(historicalData);

    // Generate forecast
    const forecast = [];
    const lastValue = historicalData[historicalData.length - 1].value;
    const maxCapacity = this.capacityLimits[resourceType] || historicalData[0]?.peak || 1000;

    for (let i = 1; i <= forecastDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();

      // Projected value = last value + (daily growth * days) * weekly seasonality factor
      const trendValue = lastValue + (trend.dailyGrowth * i);
      const seasonalFactor = weeklyPattern[dayOfWeek] || 1;
      const projectedValue = trendValue * seasonalFactor;

      const utilization = (projectedValue / maxCapacity) * 100;

      forecast.push({
        date: date.toISOString().split('T')[0],
        projected_value: Math.round(projectedValue),
        projected_utilization: Math.round(utilization * 100) / 100,
        confidence_low: Math.round(projectedValue * 0.85),
        confidence_high: Math.round(projectedValue * 1.15),
        status: this.getUtilizationStatus(utilization)
      });
    }

    // Find when capacity will be exceeded
    const capacityExceededDate = forecast.find(f => f.projected_utilization >= 100);
    const warningDate = forecast.find(f => f.projected_utilization >= 80);

    // Calculate recommendations
    const recommendations = this.generateCapacityRecommendations(
      resourceType,
      historicalData,
      forecast,
      trend,
      maxCapacity
    );

    return {
      resource_type: resourceType,
      current_capacity: maxCapacity,
      current_utilization: historicalData[historicalData.length - 1]?.utilization || 0,
      trend: {
        direction: trend.dailyGrowth > 0 ? 'increasing' : trend.dailyGrowth < 0 ? 'decreasing' : 'stable',
        daily_growth_rate: trend.dailyGrowth,
        weekly_growth_rate: trend.dailyGrowth * 7,
        monthly_growth_rate: trend.dailyGrowth * 30
      },
      forecast,
      warnings: {
        capacity_exceeded_date: capacityExceededDate?.date || null,
        warning_threshold_date: warningDate?.date || null,
        days_until_capacity_exceeded: capacityExceededDate
          ? Math.ceil((new Date(capacityExceededDate.date) - new Date()) / (1000 * 60 * 60 * 24))
          : null
      },
      recommendations,
      weekly_pattern: weeklyPattern
    };
  }

  /**
   * Calculate linear trend from data
   */
  calculateLinearTrend(values) {
    if (values.length < 2) {
      return { dailyGrowth: 0, intercept: values[0] || 0 };
    }

    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return {
      dailyGrowth: slope || 0,
      intercept
    };
  }

  /**
   * Calculate weekly seasonality pattern
   */
  calculateWeeklyPattern(data) {
    const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    for (const d of data) {
      const dayOfWeek = new Date(d.date).getDay();
      dayTotals[dayOfWeek] += d.value;
      dayCounts[dayOfWeek]++;
    }

    const dayAverages = dayTotals.map((total, i) => dayCounts[i] > 0 ? total / dayCounts[i] : 0);
    const overallAverage = dayAverages.reduce((a, b) => a + b, 0) / 7;

    // Return factors relative to overall average
    return dayAverages.map(avg => overallAverage > 0 ? avg / overallAverage : 1);
  }

  /**
   * Generate capacity recommendations
   */
  generateCapacityRecommendations(resourceType, historical, forecast, trend, currentCapacity) {
    const recommendations = [];

    const peakForecast = Math.max(...forecast.map(f => f.projected_value));
    const peakUtilization = Math.max(...forecast.map(f => f.projected_utilization));

    // Check if capacity increase needed
    if (peakUtilization >= 80) {
      const recommendedCapacity = Math.ceil(peakForecast * 1.5); // 50% headroom

      recommendations.push({
        priority: peakUtilization >= 95 ? 'critical' : 'high',
        type: 'scale_up',
        resource: resourceType,
        description: `Increase ${resourceType} capacity from ${currentCapacity} to ${recommendedCapacity}`,
        details: {
          current_capacity: currentCapacity,
          recommended_capacity: recommendedCapacity,
          projected_peak: peakForecast,
          increase_percent: Math.round((recommendedCapacity - currentCapacity) / currentCapacity * 100)
        }
      });
    }

    // Check for declining trend (potential scale down)
    if (trend.dailyGrowth < -0.5 && peakUtilization < 30) {
      const recommendedCapacity = Math.max(
        Math.ceil(peakForecast * 2), // 100% headroom
        Math.floor(currentCapacity * 0.5) // At least 50% reduction
      );

      recommendations.push({
        priority: 'low',
        type: 'scale_down',
        resource: resourceType,
        description: `Consider reducing ${resourceType} capacity to optimize costs`,
        details: {
          current_capacity: currentCapacity,
          recommended_capacity: recommendedCapacity,
          projected_peak: peakForecast,
          savings_percent: Math.round((currentCapacity - recommendedCapacity) / currentCapacity * 100)
        }
      });
    }

    // Resource-specific recommendations
    if (resourceType === RESOURCE_TYPES.DATABASE_CONNECTIONS && peakUtilization >= 70) {
      recommendations.push({
        priority: 'medium',
        type: 'optimization',
        resource: resourceType,
        description: 'Implement connection pooling to reduce database connection usage',
        details: {
          expected_reduction: '30-50%',
          implementation: 'Use PgBouncer or similar connection pooler'
        }
      });
    }

    if (resourceType === RESOURCE_TYPES.S3_STORAGE && trend.dailyGrowth > 1) {
      recommendations.push({
        priority: 'medium',
        type: 'optimization',
        resource: resourceType,
        description: 'Implement lifecycle policies for S3 storage',
        details: {
          expected_savings: '20-40%',
          actions: [
            'Move older recordings to S3 Glacier',
            'Set retention policies for temp files',
            'Enable S3 Intelligent Tiering'
          ]
        }
      });
    }

    return recommendations;
  }

  /**
   * Get historical utilization trends
   */
  async getHistoricalTrends(resourceType, days = 30, granularity = 'daily') {
    let timeGrouping, interval;

    switch (granularity) {
      case 'hourly':
        timeGrouping = `DATE_TRUNC('hour', recorded_at)`;
        interval = 'hour';
        break;
      case 'weekly':
        timeGrouping = `DATE_TRUNC('week', recorded_at)`;
        interval = 'week';
        break;
      default:
        timeGrouping = `DATE_TRUNC('day', recorded_at)`;
        interval = 'day';
    }

    const result = await pool.query(`
      SELECT
        ${timeGrouping} as time_bucket,
        AVG(current_value) as avg_value,
        MAX(current_value) as max_value,
        MIN(current_value) as min_value,
        AVG(utilization_percent) as avg_utilization,
        MAX(utilization_percent) as peak_utilization
      FROM capacity_metrics
      WHERE resource_type = $1
        AND recorded_at >= NOW() - INTERVAL '${days} days'
      GROUP BY ${timeGrouping}
      ORDER BY time_bucket
    `, [resourceType]);

    return {
      resource_type: resourceType,
      granularity,
      days,
      data_points: result.rows.map(r => ({
        timestamp: r.time_bucket,
        avg_value: parseFloat(r.avg_value),
        max_value: parseFloat(r.max_value),
        min_value: parseFloat(r.min_value),
        avg_utilization: parseFloat(r.avg_utilization),
        peak_utilization: parseFloat(r.peak_utilization)
      }))
    };
  }

  /**
   * Get cost projections based on capacity forecast
   */
  async getCostProjections(horizon = FORECAST_HORIZONS.MEDIUM) {
    const resourceCosts = {
      [RESOURCE_TYPES.API_REQUESTS]: 0.001,          // per 1000 requests
      [RESOURCE_TYPES.DATABASE_STORAGE]: 0.10,       // per GB/month
      [RESOURCE_TYPES.REDIS_MEMORY]: 50,             // per GB/month
      [RESOURCE_TYPES.TELEPHONY_CHANNELS]: 50,       // per channel/month
      [RESOURCE_TYPES.S3_STORAGE]: 0.023,            // per GB/month
      [RESOURCE_TYPES.BANDWIDTH]: 0.09,              // per GB transferred
      [RESOURCE_TYPES.AGENT_SESSIONS]: 10            // per seat/month
    };

    const projections = [];

    for (const resourceType of Object.keys(resourceCosts)) {
      try {
        const forecast = await this.forecast(resourceType, horizon);
        if (forecast.error) continue;

        const avgProjectedValue = forecast.forecast.reduce((sum, f) => sum + f.projected_value, 0) / forecast.forecast.length;
        const costPerUnit = resourceCosts[resourceType];
        const projectedMonthlyCost = avgProjectedValue * costPerUnit;

        projections.push({
          resource_type: resourceType,
          current_monthly_cost: forecast.current_utilization * (this.capacityLimits[resourceType] || 1000) / 100 * costPerUnit,
          projected_monthly_cost: projectedMonthlyCost,
          cost_change_percent: forecast.trend.monthly_growth_rate,
          cost_per_unit: costPerUnit,
          recommendations: forecast.recommendations.filter(r => r.type === 'optimization' || r.type === 'scale_down')
        });
      } catch (error) {
        console.error(`Error projecting costs for ${resourceType}:`, error);
      }
    }

    const totalCurrentCost = projections.reduce((sum, p) => sum + p.current_monthly_cost, 0);
    const totalProjectedCost = projections.reduce((sum, p) => sum + p.projected_monthly_cost, 0);

    return {
      horizon,
      current_monthly_total: totalCurrentCost,
      projected_monthly_total: totalProjectedCost,
      change_percent: totalCurrentCost > 0 ? ((totalProjectedCost - totalCurrentCost) / totalCurrentCost) * 100 : 0,
      breakdown: projections
    };
  }

  /**
   * Get auto-scaling recommendations
   */
  async getAutoScalingRecommendations() {
    const allRecommendations = [];

    for (const resourceType of Object.values(RESOURCE_TYPES)) {
      try {
        const forecast = await this.forecast(resourceType, FORECAST_HORIZONS.SHORT);
        if (forecast.recommendations) {
          allRecommendations.push(...forecast.recommendations);
        }
      } catch (error) {
        // Skip if insufficient data
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allRecommendations.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));

    return {
      total_recommendations: allRecommendations.length,
      critical_count: allRecommendations.filter(r => r.priority === 'critical').length,
      high_count: allRecommendations.filter(r => r.priority === 'high').length,
      recommendations: allRecommendations
    };
  }

  /**
   * Check capacity thresholds and generate alerts
   */
  async checkThresholds() {
    const status = await this.getCurrentCapacityStatus();
    const alerts = [];

    for (const [resourceType, data] of Object.entries(status)) {
      if (data.status === 'critical') {
        alerts.push({
          severity: 'critical',
          resource_type: resourceType,
          message: `${resourceType} utilization at ${data.utilization.toFixed(1)}% - immediate action required`,
          current_value: data.current,
          threshold: data.max * 0.9
        });
      } else if (data.status === 'warning') {
        alerts.push({
          severity: 'warning',
          resource_type: resourceType,
          message: `${resourceType} utilization at ${data.utilization.toFixed(1)}% - approaching capacity`,
          current_value: data.current,
          threshold: data.max * 0.75
        });
      }
    }

    return alerts;
  }

  /**
   * Record actual metrics from system (call periodically)
   */
  async collectSystemMetrics() {
    // This would integrate with actual monitoring systems
    // For now, we'll create placeholder logic

    const metrics = [];

    // API metrics (from request logs)
    const apiResult = await pool.query(`
      SELECT COUNT(*) as count FROM api_requests
      WHERE created_at >= NOW() - INTERVAL '1 minute'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    metrics.push({
      resource_type: RESOURCE_TYPES.API_REQUESTS,
      current_value: parseInt(apiResult.rows[0].count) || 0,
      max_capacity: this.capacityLimits[RESOURCE_TYPES.API_REQUESTS]
    });

    // Database connections
    const dbConnResult = await pool.query(`
      SELECT COUNT(*) as count FROM pg_stat_activity
      WHERE datname = current_database()
    `).catch(() => ({ rows: [{ count: 0 }] }));

    metrics.push({
      resource_type: RESOURCE_TYPES.DATABASE_CONNECTIONS,
      current_value: parseInt(dbConnResult.rows[0].count) || 0,
      max_capacity: this.capacityLimits[RESOURCE_TYPES.DATABASE_CONNECTIONS]
    });

    // Concurrent calls
    const callsResult = await pool.query(`
      SELECT COUNT(*) as count FROM calls
      WHERE status = 'in-progress'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    metrics.push({
      resource_type: RESOURCE_TYPES.CONCURRENT_CALLS,
      current_value: parseInt(callsResult.rows[0].count) || 0,
      max_capacity: this.capacityLimits[RESOURCE_TYPES.CONCURRENT_CALLS]
    });

    // Agent sessions
    const agentsResult = await pool.query(`
      SELECT COUNT(*) as count FROM agent_sessions
      WHERE status = 'active' AND ended_at IS NULL
    `).catch(() => ({ rows: [{ count: 0 }] }));

    metrics.push({
      resource_type: RESOURCE_TYPES.AGENT_SESSIONS,
      current_value: parseInt(agentsResult.rows[0].count) || 0,
      max_capacity: this.capacityLimits[RESOURCE_TYPES.AGENT_SESSIONS]
    });

    // Database storage (approximate)
    const storageResult = await pool.query(`
      SELECT pg_database_size(current_database()) / (1024 * 1024 * 1024) as size_gb
    `).catch(() => ({ rows: [{ size_gb: 0 }] }));

    metrics.push({
      resource_type: RESOURCE_TYPES.DATABASE_STORAGE,
      current_value: parseFloat(storageResult.rows[0].size_gb) || 0,
      max_capacity: this.capacityLimits[RESOURCE_TYPES.DATABASE_STORAGE]
    });

    await this.recordMetrics(metrics);

    return { collected: metrics.length, timestamp: new Date().toISOString() };
  }

  /**
   * Get capacity planning dashboard data
   */
  async getDashboardData() {
    const [status, alerts, recommendations, costProjections] = await Promise.all([
      this.getCurrentCapacityStatus(),
      this.checkThresholds(),
      this.getAutoScalingRecommendations(),
      this.getCostProjections(FORECAST_HORIZONS.MEDIUM)
    ]);

    return {
      timestamp: new Date().toISOString(),
      overall_health: alerts.filter(a => a.severity === 'critical').length > 0 ? 'critical' :
        alerts.filter(a => a.severity === 'warning').length > 0 ? 'warning' : 'healthy',
      resource_status: status,
      active_alerts: alerts,
      recommendations: recommendations.recommendations.slice(0, 5), // Top 5
      cost_projection: {
        current_monthly: costProjections.current_monthly_total,
        projected_monthly: costProjections.projected_monthly_total,
        change_percent: costProjections.change_percent
      }
    };
  }
}

// Export singleton
const capacityPlanningService = new CapacityPlanningService();
export default capacityPlanningService;

// Named exports
export {
  RESOURCE_TYPES,
  FORECAST_HORIZONS
};
