/**
 * Incident Response Automation Service
 *
 * Features:
 * - Automated incident detection from anomalies
 * - Incident lifecycle management (created → acknowledged → investigating → resolved)
 * - Escalation policies and on-call routing
 * - Automated remediation actions
 * - Runbook execution
 * - Notification integrations (Slack, PagerDuty, email)
 * - Post-incident review automation
 */

import pool from '../db.js';

// Incident severity levels
const SEVERITY = {
  CRITICAL: 'critical',    // P1 - Immediate response required
  HIGH: 'high',            // P2 - Response within 15 minutes
  MEDIUM: 'medium',        // P3 - Response within 1 hour
  LOW: 'low',              // P4 - Response within 4 hours
  INFO: 'info'             // P5 - Informational
};

// Incident status
const STATUS = {
  CREATED: 'created',
  ACKNOWLEDGED: 'acknowledged',
  INVESTIGATING: 'investigating',
  IDENTIFIED: 'identified',
  MONITORING: 'monitoring',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

// Escalation actions
const ESCALATION_ACTIONS = {
  NOTIFY_SLACK: 'notify_slack',
  NOTIFY_PAGERDUTY: 'notify_pagerduty',
  NOTIFY_EMAIL: 'notify_email',
  NOTIFY_SMS: 'notify_sms',
  EXECUTE_RUNBOOK: 'execute_runbook',
  AUTO_REMEDIATE: 'auto_remediate',
  SCALE_RESOURCES: 'scale_resources',
  FAILOVER: 'failover'
};

class IncidentResponseService {
  constructor() {
    this.activeIncidents = new Map();
    this.escalationTimers = new Map();
  }

  /**
   * Create a new incident
   */
  async createIncident(data) {
    const {
      title,
      description,
      severity = SEVERITY.MEDIUM,
      source = 'manual',
      source_id = null,
      tenant_id = null,
      affected_services = [],
      tags = [],
      metadata = {}
    } = data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create the incident
      const result = await client.query(`
        INSERT INTO incidents (
          title, description, severity, status, source, source_id,
          tenant_id, affected_services, tags, metadata,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `, [
        title, description, severity, STATUS.CREATED, source, source_id,
        tenant_id, JSON.stringify(affected_services), JSON.stringify(tags),
        JSON.stringify(metadata)
      ]);

      const incident = result.rows[0];

      // Create initial timeline entry
      await this.addTimelineEntry(client, incident.id, {
        action: 'incident_created',
        description: `Incident created: ${title}`,
        actor: 'system',
        metadata: { source, severity }
      });

      // Get applicable escalation policy
      const policy = await this.getEscalationPolicy(client, severity, affected_services);

      if (policy) {
        // Schedule escalation
        await this.scheduleEscalation(incident.id, policy);

        // Execute immediate actions
        await this.executeImmediateActions(client, incident, policy);
      }

      await client.query('COMMIT');

      // Cache active incident
      this.activeIncidents.set(incident.id, incident);

      console.log(`[Incident] Created incident ${incident.id}: ${title} (${severity})`);

      return { incident, policy };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Incident] Error creating incident:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create incident from anomaly detection
   */
  async createFromAnomaly(anomaly) {
    const severityMap = {
      'critical': SEVERITY.CRITICAL,
      'high': SEVERITY.HIGH,
      'warning': SEVERITY.MEDIUM,
      'low': SEVERITY.LOW
    };

    return this.createIncident({
      title: `Anomaly Detected: ${anomaly.metric_name}`,
      description: `Anomaly detected in ${anomaly.metric_name}. ` +
        `Value: ${anomaly.current_value}, Expected: ${anomaly.expected_value}. ` +
        `Deviation: ${anomaly.deviation_percent?.toFixed(1)}%`,
      severity: severityMap[anomaly.severity] || SEVERITY.MEDIUM,
      source: 'anomaly_detection',
      source_id: anomaly.id,
      tenant_id: anomaly.tenant_id,
      affected_services: anomaly.affected_services || [],
      tags: ['anomaly', anomaly.metric_name],
      metadata: {
        anomaly_id: anomaly.id,
        metric_name: anomaly.metric_name,
        current_value: anomaly.current_value,
        expected_value: anomaly.expected_value,
        detection_method: anomaly.detection_method
      }
    });
  }

  /**
   * Acknowledge an incident
   */
  async acknowledgeIncident(incidentId, userId, note = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE incidents
        SET status = $1, acknowledged_at = NOW(), acknowledged_by = $2, updated_at = NOW()
        WHERE id = $3 AND status = $4
        RETURNING *
      `, [STATUS.ACKNOWLEDGED, userId, incidentId, STATUS.CREATED]);

      if (result.rows.length === 0) {
        throw new Error('Incident not found or already acknowledged');
      }

      const incident = result.rows[0];

      await this.addTimelineEntry(client, incidentId, {
        action: 'acknowledged',
        description: `Incident acknowledged${note ? `: ${note}` : ''}`,
        actor_id: userId,
        metadata: { note }
      });

      // Cancel pending escalation notifications
      this.cancelEscalation(incidentId, 'acknowledge');

      await client.query('COMMIT');

      // Update cache
      this.activeIncidents.set(incidentId, incident);

      return incident;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(incidentId, newStatus, userId, note = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates = ['status = $1', 'updated_at = NOW()'];
      const values = [newStatus];
      let paramIdx = 2;

      if (newStatus === STATUS.RESOLVED) {
        updates.push(`resolved_at = NOW()`);
        updates.push(`resolved_by = $${paramIdx++}`);
        values.push(userId);
      }

      values.push(incidentId);

      const result = await client.query(`
        UPDATE incidents
        SET ${updates.join(', ')}
        WHERE id = $${paramIdx}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Incident not found');
      }

      const incident = result.rows[0];

      await this.addTimelineEntry(client, incidentId, {
        action: `status_changed_to_${newStatus}`,
        description: `Status changed to ${newStatus}${note ? `: ${note}` : ''}`,
        actor_id: userId,
        metadata: { new_status: newStatus, note }
      });

      await client.query('COMMIT');

      // Update or remove from cache
      if (newStatus === STATUS.CLOSED) {
        this.activeIncidents.delete(incidentId);
        this.cancelEscalation(incidentId, 'closed');
      } else {
        this.activeIncidents.set(incidentId, incident);
      }

      return incident;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add timeline entry to incident
   */
  async addTimelineEntry(clientOrPool, incidentId, entry) {
    const {
      action,
      description,
      actor = 'system',
      actor_id = null,
      metadata = {}
    } = entry;

    await clientOrPool.query(`
      INSERT INTO incident_timeline (
        incident_id, action, description, actor, actor_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [incidentId, action, description, actor, actor_id, JSON.stringify(metadata)]);
  }

  /**
   * Get escalation policy based on severity and services
   */
  async getEscalationPolicy(clientOrPool, severity, affectedServices) {
    // First try to find a specific policy for the affected services
    let result = await clientOrPool.query(`
      SELECT * FROM escalation_policies
      WHERE is_active = true
        AND (
          $1 = ANY(service_filters)
          OR service_filters IS NULL
          OR service_filters = '[]'::jsonb
        )
      ORDER BY
        CASE severity_filter
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
      LIMIT 1
    `, [affectedServices[0] || null]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Fall back to default policy
    result = await clientOrPool.query(`
      SELECT * FROM escalation_policies
      WHERE is_active = true AND is_default = true
      LIMIT 1
    `);

    return result.rows[0] || null;
  }

  /**
   * Schedule escalation based on policy
   */
  async scheduleEscalation(incidentId, policy) {
    const steps = typeof policy.escalation_steps === 'string'
      ? JSON.parse(policy.escalation_steps)
      : policy.escalation_steps;

    if (!steps || steps.length === 0) return;

    for (const step of steps) {
      const delayMs = (step.delay_minutes || 0) * 60 * 1000;

      const timerId = setTimeout(async () => {
        try {
          // Check if incident is still active
          const incident = this.activeIncidents.get(incidentId);
          if (!incident || incident.status === STATUS.RESOLVED || incident.status === STATUS.CLOSED) {
            return;
          }

          // Execute escalation step
          await this.executeEscalationStep(incidentId, step);
        } catch (error) {
          console.error(`[Incident] Escalation error for ${incidentId}:`, error);
        }
      }, delayMs);

      // Store timer for cancellation
      const timers = this.escalationTimers.get(incidentId) || [];
      timers.push(timerId);
      this.escalationTimers.set(incidentId, timers);
    }
  }

  /**
   * Cancel scheduled escalations
   */
  cancelEscalation(incidentId, reason) {
    const timers = this.escalationTimers.get(incidentId) || [];
    for (const timerId of timers) {
      clearTimeout(timerId);
    }
    this.escalationTimers.delete(incidentId);

    console.log(`[Incident] Cancelled escalation for ${incidentId}: ${reason}`);
  }

  /**
   * Execute immediate actions from policy
   */
  async executeImmediateActions(client, incident, policy) {
    const immediateActions = typeof policy.immediate_actions === 'string'
      ? JSON.parse(policy.immediate_actions)
      : policy.immediate_actions;

    if (!immediateActions || immediateActions.length === 0) return;

    for (const action of immediateActions) {
      try {
        await this.executeAction(client, incident, action);
      } catch (error) {
        console.error(`[Incident] Error executing immediate action ${action.type}:`, error);
      }
    }
  }

  /**
   * Execute escalation step
   */
  async executeEscalationStep(incidentId, step) {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
      if (result.rows.length === 0) return;

      const incident = result.rows[0];

      for (const action of step.actions || []) {
        await this.executeAction(client, incident, action);
      }

      await this.addTimelineEntry(client, incidentId, {
        action: 'escalation_step',
        description: `Escalation step executed: ${step.name || 'Unnamed step'}`,
        metadata: { step }
      });
    } finally {
      client.release();
    }
  }

  /**
   * Execute a single action
   */
  async executeAction(client, incident, action) {
    const actionHandlers = {
      [ESCALATION_ACTIONS.NOTIFY_SLACK]: () => this.notifySlack(incident, action.config),
      [ESCALATION_ACTIONS.NOTIFY_PAGERDUTY]: () => this.notifyPagerDuty(incident, action.config),
      [ESCALATION_ACTIONS.NOTIFY_EMAIL]: () => this.notifyEmail(incident, action.config),
      [ESCALATION_ACTIONS.NOTIFY_SMS]: () => this.notifySMS(incident, action.config),
      [ESCALATION_ACTIONS.EXECUTE_RUNBOOK]: () => this.executeRunbook(client, incident, action.config),
      [ESCALATION_ACTIONS.AUTO_REMEDIATE]: () => this.autoRemediate(client, incident, action.config),
      [ESCALATION_ACTIONS.SCALE_RESOURCES]: () => this.scaleResources(incident, action.config),
      [ESCALATION_ACTIONS.FAILOVER]: () => this.executeFailover(incident, action.config)
    };

    const handler = actionHandlers[action.type];
    if (handler) {
      const result = await handler();
      await this.addTimelineEntry(client, incident.id, {
        action: `action_${action.type}`,
        description: `Action executed: ${action.type}`,
        metadata: { action, result }
      });
      return result;
    }

    console.warn(`[Incident] Unknown action type: ${action.type}`);
  }

  /**
   * Send Slack notification
   */
  async notifySlack(incident, config) {
    const webhookUrl = config?.webhook_url || process.env.SLACK_INCIDENT_WEBHOOK;
    if (!webhookUrl) {
      console.warn('[Incident] Slack webhook not configured');
      return { success: false, reason: 'webhook_not_configured' };
    }

    const severityEmoji = {
      critical: ':rotating_light:',
      high: ':warning:',
      medium: ':large_yellow_circle:',
      low: ':large_blue_circle:',
      info: ':information_source:'
    };

    const message = {
      attachments: [{
        color: this.getSeverityColor(incident.severity),
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmoji[incident.severity] || ':bell:'} Incident: ${incident.title}`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Severity:*\n${incident.severity.toUpperCase()}` },
              { type: 'mrkdwn', text: `*Status:*\n${incident.status}` },
              { type: 'mrkdwn', text: `*ID:*\n${incident.id}` },
              { type: 'mrkdwn', text: `*Source:*\n${incident.source}` }
            ]
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Description:*\n${incident.description}` }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Acknowledge', emoji: true },
                style: 'primary',
                action_id: `acknowledge_incident_${incident.id}`
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Details', emoji: true },
                url: `${process.env.ADMIN_URL || 'https://admin.irisx.io'}/incidents/${incident.id}`
              }
            ]
          }
        ]
      }]
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      return { success: response.ok, status: response.status };
    } catch (error) {
      console.error('[Incident] Slack notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send PagerDuty alert
   */
  async notifyPagerDuty(incident, config) {
    const routingKey = config?.routing_key || process.env.PAGERDUTY_ROUTING_KEY;
    if (!routingKey) {
      console.warn('[Incident] PagerDuty routing key not configured');
      return { success: false, reason: 'not_configured' };
    }

    const severityMap = {
      critical: 'critical',
      high: 'error',
      medium: 'warning',
      low: 'info',
      info: 'info'
    };

    const payload = {
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: `irisx-incident-${incident.id}`,
      payload: {
        summary: incident.title,
        severity: severityMap[incident.severity] || 'warning',
        source: 'IRISX Platform',
        custom_details: {
          incident_id: incident.id,
          description: incident.description,
          status: incident.status,
          affected_services: incident.affected_services,
          tenant_id: incident.tenant_id
        }
      },
      links: [{
        href: `${process.env.ADMIN_URL || 'https://admin.irisx.io'}/incidents/${incident.id}`,
        text: 'View in IRISX'
      }]
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      return { success: response.ok, dedup_key: data.dedup_key };
    } catch (error) {
      console.error('[Incident] PagerDuty notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification
   */
  async notifyEmail(incident, config) {
    const recipients = config?.recipients || [];
    if (recipients.length === 0) {
      console.warn('[Incident] No email recipients configured');
      return { success: false, reason: 'no_recipients' };
    }

    // This would integrate with your email service
    console.log(`[Incident] Would send email to ${recipients.join(', ')} for incident ${incident.id}`);

    return { success: true, recipients };
  }

  /**
   * Send SMS notification
   */
  async notifySMS(incident, config) {
    const phoneNumbers = config?.phone_numbers || [];
    if (phoneNumbers.length === 0) {
      console.warn('[Incident] No SMS recipients configured');
      return { success: false, reason: 'no_recipients' };
    }

    // This would integrate with your SMS service
    console.log(`[Incident] Would send SMS to ${phoneNumbers.join(', ')} for incident ${incident.id}`);

    return { success: true, phone_numbers: phoneNumbers };
  }

  /**
   * Execute a runbook
   */
  async executeRunbook(client, incident, config) {
    const runbookId = config?.runbook_id;
    if (!runbookId) {
      return { success: false, reason: 'no_runbook_id' };
    }

    const result = await client.query(
      'SELECT * FROM runbooks WHERE id = $1 AND is_active = true',
      [runbookId]
    );

    if (result.rows.length === 0) {
      return { success: false, reason: 'runbook_not_found' };
    }

    const runbook = result.rows[0];
    const steps = typeof runbook.steps === 'string'
      ? JSON.parse(runbook.steps)
      : runbook.steps;

    const executionResults = [];

    for (const step of steps) {
      try {
        const stepResult = await this.executeRunbookStep(client, incident, step);
        executionResults.push({ step: step.name, ...stepResult });

        if (!stepResult.success && step.stop_on_failure) {
          break;
        }
      } catch (error) {
        executionResults.push({ step: step.name, success: false, error: error.message });
        if (step.stop_on_failure) break;
      }
    }

    // Record runbook execution
    await client.query(`
      INSERT INTO runbook_executions (
        runbook_id, incident_id, results, executed_at
      ) VALUES ($1, $2, $3, NOW())
    `, [runbookId, incident.id, JSON.stringify(executionResults)]);

    return { success: true, runbook_id: runbookId, results: executionResults };
  }

  /**
   * Execute a single runbook step
   */
  async executeRunbookStep(client, incident, step) {
    switch (step.type) {
      case 'check_service':
        return this.checkServiceHealth(step.config);

      case 'restart_service':
        return this.restartService(step.config);

      case 'scale_service':
        return this.scaleResources(incident, step.config);

      case 'notify':
        return this.notifySlack(incident, step.config);

      case 'database_query':
        return this.executeDatabaseCheck(client, step.config);

      case 'http_request':
        return this.executeHttpRequest(step.config);

      case 'delay':
        await new Promise(resolve => setTimeout(resolve, (step.config?.seconds || 5) * 1000));
        return { success: true };

      default:
        return { success: false, reason: `unknown_step_type: ${step.type}` };
    }
  }

  /**
   * Auto-remediate based on incident type
   */
  async autoRemediate(client, incident, config) {
    const metadata = typeof incident.metadata === 'string'
      ? JSON.parse(incident.metadata)
      : incident.metadata;

    const remediationActions = [];

    // Determine remediation based on incident source and type
    if (incident.source === 'anomaly_detection') {
      const metricName = metadata?.metric_name;

      if (metricName?.includes('api_error_rate')) {
        // High error rate - restart API pods
        remediationActions.push({ type: 'restart_service', service: 'api' });
      }

      if (metricName?.includes('memory_usage')) {
        // High memory - clear caches
        remediationActions.push({ type: 'clear_cache' });
      }

      if (metricName?.includes('queue_depth')) {
        // High queue depth - scale workers
        remediationActions.push({ type: 'scale_workers', direction: 'up' });
      }

      if (metricName?.includes('call_failure_rate')) {
        // High call failure - check carriers
        remediationActions.push({ type: 'failover_carrier' });
      }
    }

    // Execute remediation actions
    const results = [];
    for (const action of remediationActions) {
      try {
        const result = await this.executeRemediationAction(client, incident, action);
        results.push({ action: action.type, ...result });
      } catch (error) {
        results.push({ action: action.type, success: false, error: error.message });
      }
    }

    return { success: true, actions: results };
  }

  /**
   * Execute a remediation action
   */
  async executeRemediationAction(client, incident, action) {
    // These would integrate with your infrastructure
    console.log(`[Incident] Would execute remediation: ${action.type} for incident ${incident.id}`);

    switch (action.type) {
      case 'restart_service':
        // Would call Kubernetes/Docker API
        return { success: true, service: action.service, action: 'restart_scheduled' };

      case 'clear_cache':
        // Would call Redis FLUSHDB or similar
        return { success: true, action: 'cache_cleared' };

      case 'scale_workers':
        // Would call auto-scaling API
        return { success: true, direction: action.direction, action: 'scaling_initiated' };

      case 'failover_carrier':
        // Would update carrier routing
        return { success: true, action: 'failover_initiated' };

      default:
        return { success: false, reason: `unknown_action: ${action.type}` };
    }
  }

  /**
   * Scale resources
   */
  async scaleResources(incident, config) {
    const { service, direction = 'up', amount = 1 } = config || {};

    console.log(`[Incident] Would scale ${service} ${direction} by ${amount} for incident ${incident.id}`);

    // This would integrate with your orchestration platform
    return { success: true, service, direction, amount };
  }

  /**
   * Execute failover
   */
  async executeFailover(incident, config) {
    const { service, target } = config || {};

    console.log(`[Incident] Would failover ${service} to ${target} for incident ${incident.id}`);

    // This would trigger your failover procedures
    return { success: true, service, target };
  }

  /**
   * Check service health
   */
  async checkServiceHealth(config) {
    const { url, timeout = 5000 } = config || {};
    if (!url) return { success: false, reason: 'no_url' };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      return { success: response.ok, status: response.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute database check
   */
  async executeDatabaseCheck(client, config) {
    const { query, expected_result } = config || {};
    if (!query) return { success: false, reason: 'no_query' };

    try {
      const result = await client.query(query);
      const matches = expected_result ? JSON.stringify(result.rows) === JSON.stringify(expected_result) : true;
      return { success: true, rows: result.rows.length, matches };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute HTTP request
   */
  async executeHttpRequest(config) {
    const { url, method = 'GET', headers = {}, body } = config || {};
    if (!url) return { success: false, reason: 'no_url' };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      return { success: response.ok, status: response.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Restart service (placeholder)
   */
  async restartService(config) {
    console.log(`[Incident] Would restart service: ${config?.service}`);
    return { success: true, service: config?.service };
  }

  /**
   * Get severity color for notifications
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '#dc2626',
      high: '#f97316',
      medium: '#eab308',
      low: '#3b82f6',
      info: '#6b7280'
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get active incidents
   */
  async getActiveIncidents(filters = {}) {
    let query = `
      SELECT * FROM incidents
      WHERE status NOT IN ('resolved', 'closed')
    `;
    const params = [];
    let paramIdx = 1;

    if (filters.severity) {
      query += ` AND severity = $${paramIdx++}`;
      params.push(filters.severity);
    }

    if (filters.tenant_id) {
      query += ` AND tenant_id = $${paramIdx++}`;
      params.push(filters.tenant_id);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get incident by ID with timeline
   */
  async getIncident(incidentId) {
    const [incidentResult, timelineResult] = await Promise.all([
      pool.query('SELECT * FROM incidents WHERE id = $1', [incidentId]),
      pool.query('SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at DESC', [incidentId])
    ]);

    if (incidentResult.rows.length === 0) {
      return null;
    }

    return {
      ...incidentResult.rows[0],
      timeline: timelineResult.rows
    };
  }

  /**
   * Get incident statistics
   */
  async getIncidentStats(days = 30) {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_incidents,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
        COUNT(*) FILTER (WHERE severity = 'high') AS high_count,
        COUNT(*) FILTER (WHERE severity = 'medium') AS medium_count,
        COUNT(*) FILTER (WHERE severity = 'low') AS low_count,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60) FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_minutes,
        AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60) FILTER (WHERE acknowledged_at IS NOT NULL) AS avg_acknowledgement_minutes
      FROM incidents
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `);

    return result.rows[0];
  }

  /**
   * Create or update escalation policy
   */
  async upsertEscalationPolicy(data) {
    const {
      id,
      name,
      description,
      severity_filter,
      service_filters,
      immediate_actions,
      escalation_steps,
      is_default = false,
      is_active = true
    } = data;

    if (id) {
      const result = await pool.query(`
        UPDATE escalation_policies
        SET name = $1, description = $2, severity_filter = $3, service_filters = $4,
            immediate_actions = $5, escalation_steps = $6, is_default = $7, is_active = $8,
            updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `, [
        name, description, severity_filter, JSON.stringify(service_filters),
        JSON.stringify(immediate_actions), JSON.stringify(escalation_steps),
        is_default, is_active, id
      ]);
      return result.rows[0];
    }

    const result = await pool.query(`
      INSERT INTO escalation_policies (
        name, description, severity_filter, service_filters,
        immediate_actions, escalation_steps, is_default, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `, [
      name, description, severity_filter, JSON.stringify(service_filters),
      JSON.stringify(immediate_actions), JSON.stringify(escalation_steps),
      is_default, is_active
    ]);

    return result.rows[0];
  }

  /**
   * Create or update runbook
   */
  async upsertRunbook(data) {
    const {
      id,
      name,
      description,
      trigger_conditions,
      steps,
      is_active = true
    } = data;

    if (id) {
      const result = await pool.query(`
        UPDATE runbooks
        SET name = $1, description = $2, trigger_conditions = $3, steps = $4, is_active = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [name, description, JSON.stringify(trigger_conditions), JSON.stringify(steps), is_active, id]);
      return result.rows[0];
    }

    const result = await pool.query(`
      INSERT INTO runbooks (name, description, trigger_conditions, steps, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `, [name, description, JSON.stringify(trigger_conditions), JSON.stringify(steps), is_active]);

    return result.rows[0];
  }

  /**
   * List escalation policies
   */
  async listEscalationPolicies() {
    const result = await pool.query('SELECT * FROM escalation_policies ORDER BY is_default DESC, name');
    return result.rows;
  }

  /**
   * List runbooks
   */
  async listRunbooks() {
    const result = await pool.query('SELECT * FROM runbooks ORDER BY name');
    return result.rows;
  }
}

// Export singleton
const incidentResponseService = new IncidentResponseService();
export default incidentResponseService;

// Named exports
export {
  SEVERITY,
  STATUS,
  ESCALATION_ACTIONS
};
