/**
 * Audit Logging Service
 * Comprehensive audit trail for security, compliance, and debugging
 */

import { query } from '../db/index.js';

class AuditLogService {
  /**
   * Log a general audit event
   */
  async logEvent(eventData) {
    const {
      tenant_id,
      user_id,
      actor_type = 'user',
      actor_identifier,
      action,
      resource_type,
      resource_id,
      resource_name,
      description,
      changes,
      metadata,
      severity = 'info',
      is_sensitive = false,
      http_method,
      endpoint,
      request_id,
      ip_address,
      user_agent,
      status = 'success',
      error_message
    } = eventData;

    const sql = `
      INSERT INTO audit_logs (
        tenant_id, user_id, actor_type, actor_identifier,
        action, resource_type, resource_id, resource_name,
        description, changes, metadata, severity, is_sensitive,
        http_method, endpoint, request_id, ip_address, user_agent,
        status, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, user_id, actor_type, actor_identifier,
      action, resource_type, resource_id, resource_name,
      description,
      changes ? JSON.stringify(changes) : null,
      metadata ? JSON.stringify(metadata) : null,
      severity, is_sensitive,
      http_method, endpoint, request_id, ip_address, user_agent,
      status, error_message
    ]);

    return result.rows[0];
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(eventData) {
    const {
      tenant_id,
      user_id,
      ip_address,
      event_type,
      severity = 'warning',
      description,
      metadata,
      is_blocked = false,
      detection_method
    } = eventData;

    const sql = `
      INSERT INTO security_events (
        tenant_id, user_id, ip_address, event_type, severity,
        description, metadata, is_blocked, detection_method
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, user_id, ip_address, event_type, severity,
      description,
      metadata ? JSON.stringify(metadata) : null,
      is_blocked, detection_method
    ]);

    return result.rows[0];
  }

  /**
   * Log data access (for PII/PHI compliance)
   */
  async logDataAccess(accessData) {
    const {
      tenant_id,
      user_id,
      actor_identifier,
      data_type,
      resource_id,
      access_type,
      purpose,
      justification,
      ip_address,
      user_agent,
      request_id
    } = accessData;

    const sql = `
      INSERT INTO data_access_logs (
        tenant_id, user_id, actor_identifier, data_type, resource_id,
        access_type, purpose, justification, ip_address, user_agent, request_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, user_id, actor_identifier, data_type, resource_id,
      access_type, purpose, justification, ip_address, user_agent, request_id
    ]);

    return result.rows[0];
  }

  /**
   * Log admin activity (privileged actions)
   */
  async logAdminActivity(activityData) {
    const {
      admin_user_id,
      admin_email,
      target_tenant_id,
      target_user_id,
      action,
      action_category = 'general',
      description,
      changes,
      reason,
      ticket_reference,
      requires_approval = false,
      approved_by,
      approved_at,
      ip_address,
      user_agent
    } = activityData;

    const sql = `
      INSERT INTO admin_activity_logs (
        admin_user_id, admin_email, target_tenant_id, target_user_id,
        action, action_category, description, changes, reason, ticket_reference,
        requires_approval, approved_by, approved_at, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await query(sql, [
      admin_user_id, admin_email, target_tenant_id, target_user_id,
      action, action_category, description,
      changes ? JSON.stringify(changes) : null,
      reason, ticket_reference, requires_approval, approved_by, approved_at,
      ip_address, user_agent
    ]);

    return result.rows[0];
  }

  /**
   * List audit logs with filtering
   */
  async listAuditLogs(tenantId, filters = {}) {
    const {
      user_id,
      action,
      resource_type,
      resource_id,
      severity,
      status,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM audit_logs WHERE tenant_id = $1`;
    const params = [tenantId];
    let paramIndex = 2;

    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (action) {
      sql += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (resource_type) {
      sql += ` AND resource_type = $${paramIndex}`;
      params.push(resource_type);
      paramIndex++;
    }

    if (resource_id) {
      sql += ` AND resource_id = $${paramIndex}`;
      params.push(resource_id);
      paramIndex++;
    }

    if (severity) {
      sql += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (start_date) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`;
    const countParams = [tenantId];
    let countIndex = 2;

    if (user_id) {
      countSql += ` AND user_id = $${countIndex}`;
      countParams.push(user_id);
      countIndex++;
    }
    if (action) {
      countSql += ` AND action = $${countIndex}`;
      countParams.push(action);
      countIndex++;
    }
    // Add other filters to count query as needed

    const countResult = await query(countSql, countParams);

    return {
      audit_logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * List security events
   */
  async listSecurityEvents(tenantId, filters = {}) {
    const {
      user_id,
      event_type,
      severity,
      is_resolved,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM security_events WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      sql += ` AND tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (event_type) {
      sql += ` AND event_type = $${paramIndex}`;
      params.push(event_type);
      paramIndex++;
    }

    if (severity) {
      sql += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (is_resolved !== undefined) {
      sql += ` AND is_resolved = $${paramIndex}`;
      params.push(is_resolved);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      security_events: result.rows,
      total: result.rows.length,
      limit,
      offset
    };
  }

  /**
   * Resolve a security event
   */
  async resolveSecurityEvent(eventId, resolvedBy, resolutionNotes) {
    const sql = `
      UPDATE security_events
      SET is_resolved = TRUE,
          resolved_at = NOW(),
          resolved_by = $1,
          resolution_notes = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await query(sql, [resolvedBy, resolutionNotes, eventId]);

    if (result.rows.length === 0) {
      throw new Error('Security event not found');
    }

    return result.rows[0];
  }

  /**
   * List data access logs
   */
  async listDataAccessLogs(tenantId, filters = {}) {
    const {
      user_id,
      data_type,
      resource_id,
      access_type,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM data_access_logs WHERE tenant_id = $1`;
    const params = [tenantId];
    let paramIndex = 2;

    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (data_type) {
      sql += ` AND data_type = $${paramIndex}`;
      params.push(data_type);
      paramIndex++;
    }

    if (resource_id) {
      sql += ` AND resource_id = $${paramIndex}`;
      params.push(resource_id);
      paramIndex++;
    }

    if (access_type) {
      sql += ` AND access_type = $${paramIndex}`;
      params.push(access_type);
      paramIndex++;
    }

    sql += ` ORDER BY accessed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      data_access_logs: result.rows,
      total: result.rows.length,
      limit,
      offset
    };
  }

  /**
   * List admin activity logs
   */
  async listAdminActivityLogs(filters = {}) {
    const {
      admin_user_id,
      target_tenant_id,
      action,
      requires_approval,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM admin_activity_logs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (admin_user_id) {
      sql += ` AND admin_user_id = $${paramIndex}`;
      params.push(admin_user_id);
      paramIndex++;
    }

    if (target_tenant_id) {
      sql += ` AND target_tenant_id = $${paramIndex}`;
      params.push(target_tenant_id);
      paramIndex++;
    }

    if (action) {
      sql += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (requires_approval !== undefined) {
      sql += ` AND requires_approval = $${paramIndex}`;
      params.push(requires_approval);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      admin_activity_logs: result.rows,
      total: result.rows.length,
      limit,
      offset
    };
  }

  /**
   * Get audit statistics for a tenant
   */
  async getAuditStats(tenantId, days = 30) {
    const sql = `
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_events,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_events,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT resource_type) as unique_resource_types
      FROM audit_logs
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '${days} days'
    `;

    const result = await query(sql, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get failed login attempts (potential brute force)
   */
  async getFailedLoginAttempts(limit = 10) {
    const sql = `SELECT * FROM failed_login_attempts LIMIT $1`;
    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Get sensitive data access summary
   */
  async getSensitiveDataAccessSummary(tenantId, limit = 10) {
    const sql = `
      SELECT * FROM sensitive_data_access_summary
      WHERE tenant_id = $1
      ORDER BY access_count DESC
      LIMIT $2
    `;
    const result = await query(sql, [tenantId, limit]);
    return result.rows;
  }

  /**
   * Get admin actions requiring review
   */
  async getAdminActionsForReview(limit = 10) {
    const sql = `SELECT * FROM admin_actions_for_review LIMIT $1`;
    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Cleanup old audit logs (should be run by cron job)
   */
  async cleanupOldLogs(retentionDays = 365) {
    const sql = `SELECT cleanup_old_audit_logs($1) as deleted_count`;
    const result = await query(sql, [retentionDays]);
    return result.rows[0].deleted_count;
  }
}

export default new AuditLogService();
