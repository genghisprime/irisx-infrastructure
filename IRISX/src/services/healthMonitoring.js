/**
 * Health Monitoring & Incident Management Service
 * Tracks system health, metrics, and incidents
 */

import { query } from '../db/index.js';
import redis from '../db/redis.js';
import pool from '../db/connection.js';

class HealthMonitoringService {
  /**
   * Record a health check
   */
  async recordHealthCheck(componentName, componentType, status, responseTimeMs, message = null, errorMessage = null, metadata = null) {
    const sql = `
      SELECT record_health_check($1, $2, $3, $4, $5, $6, $7) as check_id
    `;

    const result = await query(sql, [
      componentName,
      componentType,
      status,
      responseTimeMs,
      message,
      errorMessage,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0].check_id;
  }

  /**
   * Get latest health checks for all components
   */
  async getSystemHealthSummary() {
    const sql = `SELECT * FROM system_health_summary ORDER BY component_name`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Perform comprehensive health checks on all components
   */
  async performHealthChecks() {
    const results = [];
    const startTime = Date.now();

    // Check PostgreSQL
    try {
      const dbStart = Date.now();
      await query('SELECT NOW()');
      const dbTime = Date.now() - dbStart;

      await this.recordHealthCheck('database', 'database', 'healthy', dbTime, 'PostgreSQL connection successful');
      results.push({ component: 'database', status: 'healthy', responseTime: dbTime });
    } catch (error) {
      await this.recordHealthCheck('database', 'database', 'unhealthy', null, null, error.message);
      results.push({ component: 'database', status: 'unhealthy', error: error.message });
    }

    // Check Redis
    try {
      const redisStart = Date.now();
      await redis.ping();
      const redisTime = Date.now() - redisStart;

      await this.recordHealthCheck('redis', 'cache', 'healthy', redisTime, 'Redis responding');
      results.push({ component: 'redis', status: 'healthy', responseTime: redisTime });
    } catch (error) {
      await this.recordHealthCheck('redis', 'cache', 'unhealthy', null, null, error.message);
      results.push({ component: 'redis', status: 'unhealthy', error: error.message });
    }

    return {
      overallStatus: results.every(r => r.status === 'healthy') ? 'healthy' : 'degraded',
      checks: results,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    };
  }

  /**
   * Record a system metric
   */
  async recordMetric(metricName, metricType, metricValue, metricUnit, source = null, labels = {}) {
    const sql = `
      INSERT INTO system_metrics (metric_name, metric_type, metric_value, metric_unit, source, labels)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await query(sql, [
      metricName,
      metricType,
      metricValue,
      metricUnit,
      source,
      JSON.stringify(labels)
    ]);

    return result.rows[0];
  }

  /**
   * Get metrics for a specific metric name
   */
  async getMetrics(metricName, source = null, since = null, limit = 100) {
    let sql = `
      SELECT * FROM system_metrics
      WHERE metric_name = $1
    `;
    const params = [metricName];
    let paramIndex = 2;

    if (source) {
      sql += ` AND source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    if (since) {
      sql += ` AND recorded_at >= $${paramIndex}`;
      params.push(since);
      paramIndex++;
    }

    sql += ` ORDER BY recorded_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Create an incident
   */
  async createIncident(incidentData) {
    const {
      title,
      description,
      severity,
      status = 'open',
      affected_components = [],
      impact_level,
      customers_affected = 0,
      started_at = new Date(),
      detected_at = new Date(),
      assigned_to,
      metadata
    } = incidentData;

    const sql = `
      INSERT INTO incidents (
        title, description, severity, status, affected_components,
        impact_level, customers_affected, started_at, detected_at,
        assigned_to, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await query(sql, [
      title,
      description,
      severity,
      status,
      affected_components,
      impact_level,
      customers_affected,
      started_at,
      detected_at,
      assigned_to,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  }

  /**
   * Update incident
   */
  async updateIncident(incidentId, updates) {
    const allowedFields = [
      'title', 'description', 'status', 'severity', 'impact_level',
      'customers_affected', 'assigned_to', 'resolved_by', 'resolved_at',
      'root_cause', 'resolution_notes', 'public_message', 'is_public'
    ];

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(incidentId);
    const sql = `
      UPDATE incidents
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Incident not found');
    }

    return result.rows[0];
  }

  /**
   * Add incident update
   */
  async addIncidentUpdate(incidentId, status, message, authorId, isPublic = false) {
    const sql = `
      INSERT INTO incident_updates (incident_id, status, message, author_id, is_public)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(sql, [incidentId, status, message, authorId, isPublic]);

    // Also update the incident status
    await this.updateIncident(incidentId, { status });

    return result.rows[0];
  }

  /**
   * Get open incidents
   */
  async getOpenIncidents() {
    const sql = `SELECT * FROM open_incidents_summary`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Get incident by ID with updates
   */
  async getIncident(incidentId) {
    const incidentSql = `SELECT * FROM incidents WHERE id = $1`;
    const updatesSql = `
      SELECT * FROM incident_updates
      WHERE incident_id = $1
      ORDER BY created_at DESC
    `;

    const incidentResult = await query(incidentSql, [incidentId]);
    const updatesResult = await query(updatesSql, [incidentId]);

    if (incidentResult.rows.length === 0) {
      throw new Error('Incident not found');
    }

    return {
      ...incidentResult.rows[0],
      updates: updatesResult.rows
    };
  }

  /**
   * Calculate uptime for a component
   */
  async calculateUptime(componentName, periodStart, periodEnd) {
    const sql = `SELECT * FROM calculate_uptime($1, $2, $3)`;
    const result = await query(sql, [componentName, periodStart, periodEnd]);
    return result.rows[0];
  }

  /**
   * Get uptime SLA (last 30 days)
   */
  async getUptimeSLA() {
    const sql = `SELECT * FROM uptime_sla_30days`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Record uptime for a period
   */
  async recordUptimePeriod(componentName, periodType, periodStart, periodEnd, uptimeData) {
    const {
      total_checks,
      successful_checks,
      failed_checks,
      avg_response_time_ms,
      min_response_time_ms,
      max_response_time_ms,
      p95_response_time_ms,
      p99_response_time_ms,
      total_downtime_seconds
    } = uptimeData;

    const sql = `
      INSERT INTO uptime_records (
        component_name, period_type, period_start, period_end,
        total_checks, successful_checks, failed_checks,
        avg_response_time_ms, min_response_time_ms, max_response_time_ms,
        p95_response_time_ms, p99_response_time_ms, total_downtime_seconds
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (component_name, period_type, period_start)
      DO UPDATE SET
        total_checks = EXCLUDED.total_checks,
        successful_checks = EXCLUDED.successful_checks,
        failed_checks = EXCLUDED.failed_checks,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms
      RETURNING *
    `;

    const result = await query(sql, [
      componentName, periodType, periodStart, periodEnd,
      total_checks, successful_checks, failed_checks,
      avg_response_time_ms, min_response_time_ms, max_response_time_ms,
      p95_response_time_ms, p99_response_time_ms, total_downtime_seconds
    ]);

    return result.rows[0];
  }

  /**
   * Get health check history
   */
  async getHealthCheckHistory(componentName, since = null, limit = 100) {
    let sql = `
      SELECT * FROM health_checks
      WHERE component_name = $1
    `;
    const params = [componentName];

    if (since) {
      sql += ` AND checked_at >= $2`;
      params.push(since);
    }

    sql += ` ORDER BY checked_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * List incidents
   */
  async listIncidents(filters = {}) {
    const {
      status,
      severity,
      assigned_to,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM incidents WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      sql += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (assigned_to) {
      sql += ` AND assigned_to = $${paramIndex}`;
      params.push(assigned_to);
      paramIndex++;
    }

    if (start_date) {
      sql += ` AND started_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      sql += ` AND started_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    sql += ` ORDER BY started_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }
}

export default new HealthMonitoringService();
