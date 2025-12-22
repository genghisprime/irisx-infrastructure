/**
 * Tenant Isolation Monitoring Service
 * Security monitoring and enforcement for multi-tenant isolation
 */

import db from '../db.js';

class TenantIsolationService {
  // ===========================================
  // ACCESS VERIFICATION
  // ===========================================

  /**
   * Verify tenant has access to a resource
   */
  async verifyResourceAccess(tenantId, resourceType, resourceId) {
    const result = await db.query(`
      SELECT verify_tenant_resource_access($1, $2, $3) as has_access
    `, [tenantId, resourceType, resourceId]);

    return result.rows[0]?.has_access || false;
  }

  /**
   * Register resource ownership
   */
  async registerResourceOwnership(tenantId, resourceType, resourceId, createdBy = null) {
    await db.query(`
      INSERT INTO resource_ownership (tenant_id, resource_type, resource_id, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (resource_type, resource_id) DO UPDATE SET
        tenant_id = $1,
        created_by = COALESCE($4, resource_ownership.created_by)
    `, [tenantId, resourceType, resourceId, createdBy]);
  }

  /**
   * Share resource with another tenant
   */
  async shareResourceWithTenant(resourceType, resourceId, targetTenantId) {
    await db.query(`
      UPDATE resource_ownership
      SET shared_with_tenants = array_append(
        COALESCE(shared_with_tenants, '{}'),
        $3::UUID
      )
      WHERE resource_type = $1 AND resource_id = $2
        AND NOT ($3 = ANY(COALESCE(shared_with_tenants, '{}')))
    `, [resourceType, resourceId, targetTenantId]);
  }

  /**
   * Revoke resource sharing
   */
  async revokeResourceSharing(resourceType, resourceId, targetTenantId) {
    await db.query(`
      UPDATE resource_ownership
      SET shared_with_tenants = array_remove(shared_with_tenants, $3::UUID)
      WHERE resource_type = $1 AND resource_id = $2
    `, [resourceType, resourceId, targetTenantId]);
  }

  // ===========================================
  // ISOLATION EVENT LOGGING
  // ===========================================

  /**
   * Log an isolation event (access attempt, violation, etc.)
   */
  async logIsolationEvent({
    eventType,
    severity,
    sourceTenantId,
    targetTenantId = null,
    userId = null,
    resourceType = null,
    resourceId = null,
    requestPath = null,
    requestMethod = null,
    ipAddress = null,
    userAgent = null,
    wasBlocked = true,
    blockReason = null,
    details = {}
  }) {
    const result = await db.query(`
      INSERT INTO tenant_isolation_events (
        event_type, severity, source_tenant_id, target_tenant_id, user_id,
        resource_type, resource_id, request_path, request_method,
        ip_address, user_agent, was_blocked, block_reason, details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      eventType, severity, sourceTenantId, targetTenantId, userId,
      resourceType, resourceId, requestPath, requestMethod,
      ipAddress, userAgent, wasBlocked, blockReason, details
    ]);

    const eventId = result.rows[0].id;

    // Update metrics
    await this.updateDailyMetrics(sourceTenantId, {
      isolationEvents: 1,
      blockedAttempts: wasBlocked ? 1 : 0,
      suspicious: severity === 'high' || severity === 'critical' ? 1 : 0
    });

    // Create alert for high/critical
    if (severity === 'high' || severity === 'critical') {
      await this.createAlert(sourceTenantId, {
        alertType: 'violation',
        severity,
        title: `Tenant isolation ${eventType} detected`,
        description: blockReason,
        relatedEvents: [eventId]
      });
    }

    return eventId;
  }

  /**
   * Log data access for audit
   */
  async logDataAccess({
    tenantId,
    userId,
    accessType,
    resourceType,
    resourceId = null,
    resourceCount = 1,
    fieldsAccessed = null,
    containsPii = false,
    requestId = null,
    requestPath = null,
    ipAddress = null,
    success = true,
    errorMessage = null,
    durationMs = null
  }) {
    await db.query(`
      INSERT INTO data_access_log (
        tenant_id, user_id, access_type, resource_type, resource_id,
        resource_count, fields_accessed, contains_pii, request_id,
        request_path, ip_address, success, error_message, duration_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      tenantId, userId, accessType, resourceType, resourceId,
      resourceCount, fieldsAccessed, containsPii, requestId,
      requestPath, ipAddress, success, errorMessage, durationMs
    ]);

    // Update PII access metrics
    if (containsPii) {
      await db.query(`
        INSERT INTO tenant_isolation_metrics (tenant_id, date, pii_access_count, pii_users)
        VALUES ($1, CURRENT_DATE, 1, ARRAY[$2::TEXT])
        ON CONFLICT (tenant_id, date) DO UPDATE SET
          pii_access_count = tenant_isolation_metrics.pii_access_count + 1,
          pii_users = CASE
            WHEN $2::TEXT = ANY(tenant_isolation_metrics.pii_users) THEN tenant_isolation_metrics.pii_users
            ELSE array_append(tenant_isolation_metrics.pii_users, $2::TEXT)
          END
      `, [tenantId, userId]);
    }
  }

  // ===========================================
  // SECURITY POLICIES
  // ===========================================

  /**
   * Get security policy for a tenant
   */
  async getSecurityPolicy(tenantId) {
    const result = await db.query(`
      SELECT * FROM tenant_security_policies WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      // Create default policy
      const insertResult = await db.query(`
        INSERT INTO tenant_security_policies (tenant_id)
        VALUES ($1)
        RETURNING *
      `, [tenantId]);
      return insertResult.rows[0];
    }

    return result.rows[0];
  }

  /**
   * Update security policy
   */
  async updateSecurityPolicy(tenantId, updates) {
    const allowedFields = [
      'enforce_ip_whitelist', 'require_mfa', 'session_timeout_minutes',
      'max_concurrent_sessions', 'data_export_enabled', 'api_data_access_level',
      'pii_masking_enabled', 'isolation_level', 'cross_tenant_sharing_enabled',
      'audit_all_access', 'audit_retention_days', 'alert_on_suspicious_activity',
      'alert_contacts', 'api_rate_limit_per_minute', 'data_export_rate_limit_per_day'
    ];

    const setClauses = [];
    const values = [tenantId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE tenant_security_policies
      SET ${setClauses.join(', ')}
      WHERE tenant_id = $1
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Check if action is allowed by policy
   */
  async checkPolicyAllows(tenantId, action, context = {}) {
    const policy = await this.getSecurityPolicy(tenantId);

    switch (action) {
      case 'data_export':
        if (!policy.data_export_enabled) {
          return { allowed: false, reason: 'Data export is disabled for this tenant' };
        }
        // Check rate limit
        const exportCount = await this.getDailyExportCount(tenantId);
        if (exportCount >= policy.data_export_rate_limit_per_day) {
          return { allowed: false, reason: 'Daily data export limit reached' };
        }
        break;

      case 'cross_tenant_access':
        if (!policy.cross_tenant_sharing_enabled) {
          return { allowed: false, reason: 'Cross-tenant access is disabled' };
        }
        break;

      case 'bulk_read':
        if (policy.api_data_access_level === 'restricted') {
          return { allowed: false, reason: 'Bulk data access is restricted' };
        }
        break;

      case 'pii_access':
        if (policy.pii_masking_enabled && !context.hasExplicitPermission) {
          return { allowed: true, masked: true, reason: 'PII will be masked' };
        }
        break;
    }

    return { allowed: true };
  }

  /**
   * Get daily export count
   */
  async getDailyExportCount(tenantId) {
    const result = await db.query(`
      SELECT data_exports FROM tenant_isolation_metrics
      WHERE tenant_id = $1 AND date = CURRENT_DATE
    `, [tenantId]);

    return result.rows[0]?.data_exports || 0;
  }

  // ===========================================
  // METRICS & SCORING
  // ===========================================

  /**
   * Update daily metrics
   */
  async updateDailyMetrics(tenantId, updates) {
    const { isolationEvents = 0, blockedAttempts = 0, suspicious = 0, apiRequests = 0, dataExports = 0, bulkOps = 0 } = updates;

    await db.query(`
      INSERT INTO tenant_isolation_metrics (
        tenant_id, date, total_isolation_events, blocked_access_attempts,
        suspicious_activities, total_api_requests, data_exports, bulk_operations
      )
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, date) DO UPDATE SET
        total_isolation_events = tenant_isolation_metrics.total_isolation_events + $2,
        blocked_access_attempts = tenant_isolation_metrics.blocked_access_attempts + $3,
        suspicious_activities = tenant_isolation_metrics.suspicious_activities + $4,
        total_api_requests = tenant_isolation_metrics.total_api_requests + $5,
        data_exports = tenant_isolation_metrics.data_exports + $6,
        bulk_operations = tenant_isolation_metrics.bulk_operations + $7
    `, [tenantId, isolationEvents, blockedAttempts, suspicious, apiRequests, dataExports, bulkOps]);
  }

  /**
   * Calculate security score for tenant
   */
  async calculateSecurityScore(tenantId) {
    const result = await db.query(`
      SELECT calculate_tenant_security_score($1) as score
    `, [tenantId]);

    return parseFloat(result.rows[0]?.score) || 100;
  }

  /**
   * Get isolation metrics
   */
  async getMetrics(tenantId, { days = 7 } = {}) {
    const result = await db.query(`
      SELECT * FROM tenant_isolation_metrics
      WHERE tenant_id = $1 AND date >= CURRENT_DATE - $2::INTEGER
      ORDER BY date DESC
    `, [tenantId, days]);

    return result.rows;
  }

  /**
   * Get current risk level
   */
  async getRiskLevel(tenantId) {
    const result = await db.query(`
      SELECT security_score, risk_level
      FROM tenant_isolation_metrics
      WHERE tenant_id = $1 AND date = CURRENT_DATE
    `, [tenantId]);

    if (result.rows.length === 0) {
      return { securityScore: 100, riskLevel: 'low' };
    }

    return {
      securityScore: parseFloat(result.rows[0].security_score),
      riskLevel: result.rows[0].risk_level
    };
  }

  // ===========================================
  // ALERTS
  // ===========================================

  /**
   * Create alert
   */
  async createAlert(tenantId, {
    alertType,
    severity,
    title,
    description = null,
    relatedEvents = [],
    metrics = {}
  }) {
    const result = await db.query(`
      INSERT INTO tenant_isolation_alerts (
        tenant_id, alert_type, severity, title, description, related_events, metrics
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, alertType, severity, title, description, relatedEvents, metrics]);

    return result.rows[0];
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(tenantId = null, { severity = null, limit = 100 } = {}) {
    let whereConditions = ['resolved = false'];
    let params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereConditions.push(`tenant_id = $${paramIndex++}`);
      params.push(tenantId);
    }

    if (severity) {
      whereConditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    const result = await db.query(`
      SELECT
        tia.*,
        t.name as tenant_name
      FROM tenant_isolation_alerts tia
      LEFT JOIN tenants t ON t.id = tia.tenant_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY tia.created_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    return result.rows;
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, userId) {
    await db.query(`
      UPDATE tenant_isolation_alerts
      SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
      WHERE id = $1
    `, [alertId, userId]);
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId) {
    await db.query(`
      UPDATE tenant_isolation_alerts
      SET resolved = true, resolved_at = NOW()
      WHERE id = $1
    `, [alertId]);
  }

  // ===========================================
  // EVENTS QUERY
  // ===========================================

  /**
   * Get isolation events
   */
  async getEvents({
    tenantId = null,
    eventType = null,
    severity = null,
    dateFrom = null,
    dateTo = null,
    limit = 100,
    offset = 0
  } = {}) {
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereConditions.push(`source_tenant_id = $${paramIndex++}`);
      params.push(tenantId);
    }

    if (eventType) {
      whereConditions.push(`event_type = $${paramIndex++}`);
      params.push(eventType);
    }

    if (severity) {
      whereConditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    if (dateFrom) {
      whereConditions.push(`created_at >= $${paramIndex++}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push(`created_at <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await db.query(`
      SELECT
        tie.*,
        st.name as source_tenant_name,
        tt.name as target_tenant_name,
        u.email as user_email
      FROM tenant_isolation_events tie
      LEFT JOIN tenants st ON st.id = tie.source_tenant_id
      LEFT JOIN tenants tt ON tt.id = tie.target_tenant_id
      LEFT JOIN users u ON u.id = tie.user_id
      ${whereClause}
      ORDER BY tie.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM tenant_isolation_events ${whereClause}
    `, params);

    return {
      events: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  }

  // ===========================================
  // DASHBOARD
  // ===========================================

  /**
   * Get isolation dashboard data
   */
  async getDashboard(tenantId = null) {
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    // Overall stats
    const statsResult = await db.query(`
      SELECT
        COUNT(DISTINCT tenant_id) as total_tenants,
        SUM(total_isolation_events) as total_events,
        SUM(blocked_access_attempts) as total_blocked,
        SUM(suspicious_activities) as total_suspicious,
        AVG(security_score) as avg_security_score
      FROM tenant_isolation_metrics
      WHERE date = CURRENT_DATE
      ${tenantId ? 'AND tenant_id = $1' : ''}
    `, params);

    // By risk level
    const riskResult = await db.query(`
      SELECT risk_level, COUNT(*) as count
      FROM tenant_isolation_metrics
      WHERE date = CURRENT_DATE ${tenantId ? 'AND tenant_id = $1' : ''}
      GROUP BY risk_level
    `, params);

    // Recent events (last 24 hours)
    const eventsResult = await db.query(`
      SELECT event_type, severity, COUNT(*) as count
      FROM tenant_isolation_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ${tenantId ? 'AND source_tenant_id = $1' : ''}
      GROUP BY event_type, severity
      ORDER BY count DESC
      LIMIT 10
    `, params);

    // Active alerts
    const alertsResult = await db.query(`
      SELECT severity, COUNT(*) as count
      FROM tenant_isolation_alerts
      WHERE resolved = false ${tenantId ? 'AND tenant_id = $1' : ''}
      GROUP BY severity
    `, params);

    return {
      stats: statsResult.rows[0],
      byRiskLevel: riskResult.rows,
      recentEventTypes: eventsResult.rows,
      activeAlertsBySeverity: alertsResult.rows
    };
  }

  /**
   * Get tenants at risk
   */
  async getTenantsAtRisk(minRiskLevel = 'medium') {
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const minIndex = riskLevels.indexOf(minRiskLevel);
    const includedLevels = riskLevels.slice(minIndex);

    const result = await db.query(`
      SELECT
        tim.*,
        t.name as tenant_name,
        tsp.isolation_level
      FROM tenant_isolation_metrics tim
      JOIN tenants t ON t.id = tim.tenant_id
      LEFT JOIN tenant_security_policies tsp ON tsp.tenant_id = tim.tenant_id
      WHERE tim.date = CURRENT_DATE
        AND tim.risk_level = ANY($1)
      ORDER BY
        CASE tim.risk_level
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        tim.security_score ASC
    `, [includedLevels]);

    return result.rows;
  }
}

export default new TenantIsolationService();
