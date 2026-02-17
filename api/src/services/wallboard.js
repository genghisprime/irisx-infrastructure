/**
 * Wallboard Service - Real-time Queue & Agent Metrics
 *
 * Provides aggregated real-time data for call center wallboards:
 * - Queue statistics (waiting, SLA, abandon rate)
 * - Agent status overview (available, busy, offline)
 * - Real-time call metrics
 * - Historical comparisons
 *
 * Based on: IRIS_Agent_Desktop_Supervisor_Tools.md - Real-time Wallboards
 */

import { query } from '../db/connection.js';
import redisClient from '../db/redis.js';
import queueService from './queue.js';

class WallboardService {
  constructor() {
    // SLA targets (can be made configurable per tenant/queue)
    this.slaTargets = {
      answerWithinSeconds: 20,  // 80/20 SLA: 80% answered within 20 seconds
      slaTargetPercent: 80,
      maxWaitTimeWarning: 60,   // Yellow warning threshold
      maxWaitTimeCritical: 120  // Red critical threshold
    };
  }

  // ===== AGGREGATE WALLBOARD DATA =====

  /**
   * Get comprehensive wallboard data for a tenant
   */
  async getWallboardData(tenantId, queueIds = null) {
    try {
      // Get all queues for tenant if not specified
      if (!queueIds || queueIds.length === 0) {
        const queuesResult = await query(
          `SELECT id FROM queues WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'active'`,
          [tenantId]
        );
        queueIds = queuesResult.rows.map(q => q.id);
      }

      // Gather data in parallel
      const [
        queueStats,
        agentStats,
        callStats,
        slaMetrics,
        longestWaiting
      ] = await Promise.all([
        this.getQueueOverview(tenantId, queueIds),
        this.getAgentOverview(tenantId, queueIds),
        this.getCallMetrics(tenantId),
        this.getSLAMetrics(tenantId, queueIds),
        this.getLongestWaitingCalls(tenantId, queueIds, 5)
      ]);

      return {
        timestamp: new Date().toISOString(),
        tenant_id: tenantId,
        queues: queueStats,
        agents: agentStats,
        calls: callStats,
        sla: slaMetrics,
        longest_waiting: longestWaiting,
        alerts: this.generateAlerts(queueStats, agentStats, slaMetrics)
      };
    } catch (error) {
      console.error('[Wallboard] Error getting wallboard data:', error);
      throw error;
    }
  }

  /**
   * Get overview of all queues
   */
  async getQueueOverview(tenantId, queueIds) {
    const queues = [];

    for (const queueId of queueIds) {
      try {
        // Get queue config
        const queueResult = await query(
          `SELECT id, name, description, max_queue_size, max_wait_time
           FROM queues WHERE id = $1 AND tenant_id = $2`,
          [queueId, tenantId]
        );

        if (queueResult.rows.length === 0) continue;

        const queueConfig = queueResult.rows[0];

        // Get real-time stats from Redis
        const stats = await queueService.getQueueStats(tenantId, queueId);

        // Calculate health status
        const healthStatus = this.calculateQueueHealth(stats, queueConfig);

        queues.push({
          id: queueId,
          name: queueConfig.name,
          waiting: stats.waiting,
          available_agents: stats.available_agents,
          calls_offered_today: stats.calls_offered,
          calls_answered_today: stats.calls_answered,
          calls_abandoned_today: stats.calls_abandoned,
          abandon_rate: parseFloat(stats.abandon_rate),
          avg_wait_time: stats.avg_wait_time,
          estimated_wait_time: stats.estimated_wait_time,
          max_queue_size: queueConfig.max_queue_size,
          health_status: healthStatus
        });
      } catch (err) {
        console.error(`[Wallboard] Error getting stats for queue ${queueId}:`, err);
      }
    }

    return {
      total_queues: queues.length,
      total_waiting: queues.reduce((sum, q) => sum + q.waiting, 0),
      total_available_agents: queues.reduce((sum, q) => sum + q.available_agents, 0),
      queues
    };
  }

  /**
   * Get agent status overview
   */
  async getAgentOverview(tenantId, queueIds) {
    // Get all agents in the specified queues
    const agentsResult = await query(
      `SELECT DISTINCT a.id, a.name, a.extension, a.status,
              a.last_status_change, a.total_calls_handled
       FROM agents a
       INNER JOIN queue_agents qa ON a.id = qa.agent_id
       WHERE qa.queue_id = ANY($1)
         AND a.tenant_id = $2
         AND a.deleted_at IS NULL`,
      [queueIds, tenantId]
    );

    const agents = agentsResult.rows;

    // Get real-time status from Redis for each agent
    const statusCounts = {
      available: 0,
      busy: 0,
      away: 0,
      offline: 0,
      wrap_up: 0
    };

    const agentDetails = [];

    for (const agent of agents) {
      const redisStatus = await queueService.getAgentStatus(tenantId, agent.id);
      const currentStatus = redisStatus?.status || agent.status || 'offline';

      // Normalize status
      const normalizedStatus = this.normalizeAgentStatus(currentStatus);
      statusCounts[normalizedStatus] = (statusCounts[normalizedStatus] || 0) + 1;

      // Calculate time in current status
      const statusDuration = agent.last_status_change
        ? Math.floor((Date.now() - new Date(agent.last_status_change).getTime()) / 1000)
        : 0;

      agentDetails.push({
        id: agent.id,
        name: agent.name,
        extension: agent.extension,
        status: normalizedStatus,
        status_duration_seconds: statusDuration,
        current_call_uuid: redisStatus?.current_call_uuid || null,
        calls_handled_today: agent.total_calls_handled || 0
      });
    }

    return {
      total_agents: agents.length,
      status_breakdown: statusCounts,
      utilization_rate: agents.length > 0
        ? ((statusCounts.busy / agents.length) * 100).toFixed(1)
        : '0.0',
      agents: agentDetails
    };
  }

  /**
   * Get call metrics for today
   */
  async getCallMetrics(tenantId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_calls,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_calls,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
        COUNT(*) FILTER (WHERE status = 'no-answer') as missed_calls,
        AVG(duration) FILTER (WHERE duration > 0) as avg_duration,
        SUM(duration) as total_talk_time
       FROM cdrs
       WHERE tenant_id = $1
         AND started_at >= $2`,
      [tenantId, today]
    );

    const metrics = result.rows[0];

    return {
      total_calls: parseInt(metrics.total_calls) || 0,
      inbound_calls: parseInt(metrics.inbound_calls) || 0,
      outbound_calls: parseInt(metrics.outbound_calls) || 0,
      completed_calls: parseInt(metrics.completed_calls) || 0,
      missed_calls: parseInt(metrics.missed_calls) || 0,
      avg_call_duration: Math.round(parseFloat(metrics.avg_duration) || 0),
      total_talk_time: Math.round(parseFloat(metrics.total_talk_time) || 0),
      answer_rate: metrics.total_calls > 0
        ? ((metrics.completed_calls / metrics.total_calls) * 100).toFixed(1)
        : '0.0'
    };
  }

  /**
   * Calculate SLA metrics
   */
  async getSLAMetrics(tenantId, queueIds) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get calls answered within SLA target
    const result = await query(
      `SELECT
        COUNT(*) as total_answered,
        COUNT(*) FILTER (WHERE wait_time_seconds <= $3) as within_sla,
        AVG(wait_time_seconds) as avg_wait,
        MAX(wait_time_seconds) as max_wait
       FROM queue_members
       WHERE queue_id = ANY($1)
         AND answered_at >= $2
         AND answered_at IS NOT NULL`,
      [queueIds, today, this.slaTargets.answerWithinSeconds]
    );

    const metrics = result.rows[0];
    const totalAnswered = parseInt(metrics.total_answered) || 0;
    const withinSla = parseInt(metrics.within_sla) || 0;
    const slaPercent = totalAnswered > 0 ? (withinSla / totalAnswered) * 100 : 100;

    return {
      target_percent: this.slaTargets.slaTargetPercent,
      target_seconds: this.slaTargets.answerWithinSeconds,
      current_percent: parseFloat(slaPercent.toFixed(1)),
      calls_within_sla: withinSla,
      total_answered: totalAnswered,
      avg_speed_of_answer: Math.round(parseFloat(metrics.avg_wait) || 0),
      max_wait_time: Math.round(parseFloat(metrics.max_wait) || 0),
      status: slaPercent >= this.slaTargets.slaTargetPercent ? 'meeting' : 'below_target'
    };
  }

  /**
   * Get longest waiting calls
   */
  async getLongestWaitingCalls(tenantId, queueIds, limit = 5) {
    const waitingCalls = [];

    for (const queueId of queueIds) {
      const queueKey = `queue:${tenantId}:${queueId}:waiting`;

      // Get all waiting calls
      const callUuids = await redisClient.zrange(queueKey, 0, -1);

      for (const callUuid of callUuids) {
        const memberKey = `queue:${tenantId}:${queueId}:member:${callUuid}`;
        const data = await redisClient.hgetall(memberKey);

        if (data && data.joined_at) {
          const waitTime = Math.floor((Date.now() - parseInt(data.joined_at)) / 1000);

          waitingCalls.push({
            call_uuid: callUuid,
            queue_id: queueId,
            caller_id: data.caller_id,
            caller_name: data.caller_name,
            wait_time_seconds: waitTime,
            priority: parseInt(data.priority) || 5,
            alert_level: this.getWaitTimeAlertLevel(waitTime)
          });
        }
      }
    }

    // Sort by wait time descending
    waitingCalls.sort((a, b) => b.wait_time_seconds - a.wait_time_seconds);

    return waitingCalls.slice(0, limit);
  }

  // ===== HELPER METHODS =====

  normalizeAgentStatus(status) {
    const statusMap = {
      'available': 'available',
      'on_call': 'busy',
      'busy': 'busy',
      'in_call': 'busy',
      'away': 'away',
      'break': 'away',
      'lunch': 'away',
      'meeting': 'away',
      'wrap_up': 'wrap_up',
      'acw': 'wrap_up',
      'after_call': 'wrap_up',
      'offline': 'offline',
      'logged_out': 'offline'
    };

    return statusMap[status.toLowerCase()] || 'offline';
  }

  calculateQueueHealth(stats, config) {
    // Health based on multiple factors
    const factors = {
      waiting_ratio: config.max_queue_size > 0
        ? stats.waiting / config.max_queue_size
        : 0,
      abandon_rate: parseFloat(stats.abandon_rate) / 100,
      agent_availability: stats.available_agents > 0 ? 1 : 0,
      wait_time_factor: config.max_wait_time > 0
        ? stats.estimated_wait_time / config.max_wait_time
        : 0
    };

    // Calculate weighted score (0-100)
    const score = 100 - (
      (factors.waiting_ratio * 30) +
      (factors.abandon_rate * 30) +
      ((1 - factors.agent_availability) * 25) +
      (factors.wait_time_factor * 15)
    );

    if (score >= 80) return 'healthy';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  getWaitTimeAlertLevel(waitTimeSeconds) {
    if (waitTimeSeconds >= this.slaTargets.maxWaitTimeCritical) return 'critical';
    if (waitTimeSeconds >= this.slaTargets.maxWaitTimeWarning) return 'warning';
    return 'normal';
  }

  generateAlerts(queueStats, agentStats, slaMetrics) {
    const alerts = [];

    // Check for critical queue conditions
    for (const queue of queueStats.queues) {
      if (queue.health_status === 'critical') {
        alerts.push({
          type: 'queue_critical',
          queue_id: queue.id,
          queue_name: queue.name,
          message: `Queue "${queue.name}" is in critical state`,
          severity: 'high'
        });
      }

      if (queue.waiting > 0 && queue.available_agents === 0) {
        alerts.push({
          type: 'no_agents',
          queue_id: queue.id,
          queue_name: queue.name,
          message: `Queue "${queue.name}" has ${queue.waiting} waiting calls but no available agents`,
          severity: 'high'
        });
      }
    }

    // Check SLA
    if (slaMetrics.status === 'below_target') {
      alerts.push({
        type: 'sla_breach',
        message: `SLA is below target: ${slaMetrics.current_percent}% vs ${slaMetrics.target_percent}% target`,
        severity: 'medium'
      });
    }

    // Check agent availability
    if (agentStats.status_breakdown.available === 0 && agentStats.total_agents > 0) {
      alerts.push({
        type: 'no_available_agents',
        message: 'No agents are currently available',
        severity: 'high'
      });
    }

    return alerts;
  }

  // ===== REAL-TIME UPDATES =====

  /**
   * Get lightweight snapshot for frequent updates
   */
  async getQuickSnapshot(tenantId, queueIds = null) {
    // Get all queues for tenant if not specified
    if (!queueIds || queueIds.length === 0) {
      const queuesResult = await query(
        `SELECT id FROM queues WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'active'`,
        [tenantId]
      );
      queueIds = queuesResult.rows.map(q => q.id);
    }

    let totalWaiting = 0;
    let totalAvailable = 0;
    const queueSnapshots = [];

    for (const queueId of queueIds) {
      try {
        const queueKey = `queue:${tenantId}:${queueId}:waiting`;
        const waiting = await redisClient.zcard(queueKey);
        const available = await queueService.getAvailableAgentCount(tenantId, queueId);

        totalWaiting += waiting;
        totalAvailable += available;

        queueSnapshots.push({
          queue_id: queueId,
          waiting,
          available_agents: available
        });
      } catch (err) {
        // Skip erroring queues
      }
    }

    return {
      timestamp: Date.now(),
      total_waiting: totalWaiting,
      total_available_agents: totalAvailable,
      queues: queueSnapshots
    };
  }

  /**
   * Subscribe key for Redis pub/sub wallboard updates
   */
  getWallboardChannel(tenantId) {
    return `wallboard:${tenantId}:updates`;
  }

  /**
   * Publish wallboard update (call when queue/agent state changes)
   */
  async publishUpdate(tenantId, updateType, data) {
    const channel = this.getWallboardChannel(tenantId);

    const message = JSON.stringify({
      type: updateType,
      timestamp: Date.now(),
      data
    });

    await redisClient.publish(channel, message);
  }

  /**
   * Get historical trend data for wallboard charts
   */
  async getTrendData(tenantId, queueIds = null, hours = 12) {
    try {
      // Build queue filter
      let queueFilter = '';
      const params = [tenantId];
      let paramCount = 2;

      if (queueIds && queueIds.length > 0) {
        queueFilter = ` AND queue_id = ANY($${paramCount})`;
        params.push(queueIds);
        paramCount++;
      }

      // Hourly call volume
      const hourlyResult = await query(`
        SELECT
          DATE_TRUNC('hour', initiated_at) as hour,
          TO_CHAR(DATE_TRUNC('hour', initiated_at), 'HH24:00') as label,
          COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound,
          COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as answered,
          COUNT(CASE WHEN status = 'abandoned' THEN 1 END) as abandoned
        FROM calls
        WHERE tenant_id = $1
          AND initiated_at >= NOW() - INTERVAL '${hours} hours'
          ${queueFilter}
        GROUP BY DATE_TRUNC('hour', initiated_at)
        ORDER BY hour ASC
      `, params);

      // Service level trend (hourly)
      const slResult = await query(`
        SELECT
          DATE_TRUNC('hour', initiated_at) as hour,
          TO_CHAR(DATE_TRUNC('hour', initiated_at), 'HH24:00') as label,
          ROUND(
            100.0 * COUNT(CASE WHEN wait_time <= 20 THEN 1 END) / NULLIF(COUNT(*), 0),
            1
          ) as value
        FROM calls
        WHERE tenant_id = $1
          AND initiated_at >= NOW() - INTERVAL '${hours} hours'
          AND status IN ('completed', 'abandoned')
          ${queueFilter}
        GROUP BY DATE_TRUNC('hour', initiated_at)
        ORDER BY hour ASC
      `, params);

      // Channel distribution (today)
      const channelResult = await query(`
        SELECT
          COALESCE(SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END), 0) as voice,
          COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END), 0) as sms,
          COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN 1 ELSE 0 END), 0) as email
        FROM (SELECT 1) dummy
        LEFT JOIN calls c ON c.tenant_id = $1 AND c.initiated_at >= CURRENT_DATE
        LEFT JOIN sms_messages s ON s.tenant_id = $1 AND s.created_at >= CURRENT_DATE
        LEFT JOIN emails e ON e.tenant_id = $1 AND e.created_at >= CURRENT_DATE
      `, [tenantId]);

      // Get channel counts individually for accuracy
      const voiceCount = await query(`
        SELECT COUNT(*) as count FROM calls WHERE tenant_id = $1 AND initiated_at >= CURRENT_DATE
      `, [tenantId]);

      const smsCount = await query(`
        SELECT COUNT(*) as count FROM sms_messages WHERE tenant_id = $1 AND created_at >= CURRENT_DATE
      `, [tenantId]);

      const emailCount = await query(`
        SELECT COUNT(*) as count FROM emails WHERE tenant_id = $1 AND created_at >= CURRENT_DATE
      `, [tenantId]);

      // Agent utilization (last 4 hours)
      const utilizationResult = await query(`
        SELECT
          DATE_TRUNC('hour', al.created_at) as hour,
          TO_CHAR(DATE_TRUNC('hour', al.created_at), 'HH24:00') as label,
          ROUND(AVG(
            CASE
              WHEN al.status IN ('on_call', 'wrap_up') THEN 100
              WHEN al.status = 'available' THEN 50
              ELSE 0
            END
          ), 0) as utilization,
          ROUND(AVG(
            CASE
              WHEN al.status = 'on_call' THEN 100
              WHEN al.status = 'wrap_up' THEN 75
              ELSE 0
            END
          ), 0) as occupancy
        FROM agent_activity_logs al
        JOIN agents a ON a.id = al.agent_id
        WHERE a.tenant_id = $1
          AND al.created_at >= NOW() - INTERVAL '4 hours'
        GROUP BY DATE_TRUNC('hour', al.created_at)
        ORDER BY hour ASC
      `, [tenantId]);

      return {
        hourly: hourlyResult.rows,
        service_level_trend: slResult.rows.map(r => ({
          ...r,
          value: parseFloat(r.value) || 0
        })),
        channel_distribution: {
          voice: parseInt(voiceCount.rows[0]?.count) || 0,
          sms: parseInt(smsCount.rows[0]?.count) || 0,
          email: parseInt(emailCount.rows[0]?.count) || 0,
          chat: 0,
          social: 0
        },
        utilization: utilizationResult.rows.map(r => ({
          ...r,
          utilization: parseInt(r.utilization) || 0,
          occupancy: parseInt(r.occupancy) || 0
        }))
      };
    } catch (error) {
      console.error('[Wallboard] Error getting trend data:', error);
      throw error;
    }
  }
}

export default new WallboardService();
