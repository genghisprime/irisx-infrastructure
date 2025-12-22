/**
 * Agent Wrap-up Service
 *
 * Manages agent wrap-up (After Call Work / ACW) state:
 * - Enter wrap-up state after call ends
 * - Configurable wrap-up time limits per queue/tenant
 * - Automatic transition to available after timeout
 * - Disposition code tracking
 * - Extension requests
 */

import { query } from '../db/connection.js';
import redisClient from '../db/redis.js';
import queueService from './queue.js';

class WrapUpService {
  /**
   * Enter wrap-up state after call ends
   */
  async enterWrapUp(tenantId, agentId, callData = {}) {
    const { call_id, call_uuid, customer_phone, customer_name } = callData;
    const now = Date.now();

    // Get wrap-up settings
    const settings = await this.getWrapUpSettings(tenantId, callData.queue_id);

    if (!settings.wrap_up_enabled) {
      // Wrap-up disabled, go directly to available
      await queueService.setAgentStatus(tenantId, agentId, 'available');
      return { wrap_up_enabled: false };
    }

    // Set agent status to wrap_up
    const agentKey = `agent:${tenantId}:${agentId}:status`;
    await redisClient.hset(agentKey, {
      status: 'wrap_up',
      wrap_up_started_at: now,
      wrap_up_call_id: call_id || '',
      wrap_up_call_uuid: call_uuid || '',
      wrap_up_expires_at: now + (settings.default_wrap_up_time_seconds * 1000),
      extensions: 0,
      last_heartbeat: now
    });
    await redisClient.expire(agentKey, settings.max_wrap_up_time_seconds + 60);

    // Update agent in PostgreSQL
    await query(
      `UPDATE agents
       SET status = 'wrap_up',
           wrap_up_call_id = $1,
           wrap_up_started_at = NOW(),
           wrap_up_extensions = 0
       WHERE id = $2 AND tenant_id = $3`,
      [call_id, agentId, tenantId]
    );

    // Create wrap-up record
    const wrapUpRecord = await query(
      `INSERT INTO call_wrap_ups (
         tenant_id, call_id, call_uuid, agent_id, wrap_up_started_at,
         customer_phone, customer_name
       ) VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       RETURNING id`,
      [tenantId, call_id, call_uuid, agentId, customer_phone, customer_name]
    );

    return {
      wrap_up_id: wrapUpRecord.rows[0]?.id,
      wrap_up_enabled: true,
      wrap_up_time_seconds: settings.default_wrap_up_time_seconds,
      expires_at: new Date(now + (settings.default_wrap_up_time_seconds * 1000)),
      allow_extension: settings.allow_extension,
      max_extensions: settings.max_extensions,
      force_disposition: settings.force_disposition_code
    };
  }

  /**
   * Complete wrap-up and return to available
   */
  async completeWrapUp(tenantId, agentId, wrapUpData = {}) {
    const { wrap_up_code_id, notes, follow_up_required, follow_up_date, follow_up_assigned_to } = wrapUpData;

    // Get wrap-up settings
    const settings = await this.getWrapUpSettings(tenantId);

    // Check if disposition code is required
    if (settings.force_disposition_code && !wrap_up_code_id) {
      throw new Error('Disposition code is required before completing wrap-up');
    }

    // Get current wrap-up state
    const agentKey = `agent:${tenantId}:${agentId}:status`;
    const agentState = await redisClient.hgetall(agentKey);

    if (!agentState || agentState.status !== 'wrap_up') {
      throw new Error('Agent is not in wrap-up state');
    }

    const wrapUpStartedAt = parseInt(agentState.wrap_up_started_at);
    const wrapUpDuration = Math.floor((Date.now() - wrapUpStartedAt) / 1000);

    // Update call_wrap_ups record
    await query(
      `UPDATE call_wrap_ups
       SET wrap_up_code_id = $1,
           notes = $2,
           follow_up_required = $3,
           follow_up_date = $4,
           follow_up_assigned_to = $5,
           wrap_up_ended_at = NOW(),
           auto_completed = false
       WHERE agent_id = $6 AND tenant_id = $7 AND wrap_up_ended_at IS NULL`,
      [wrap_up_code_id, notes, follow_up_required, follow_up_date, follow_up_assigned_to, agentId, tenantId]
    );

    // Set agent to available
    await queueService.setAgentStatus(tenantId, agentId, 'available');

    // Clear wrap-up data from agent
    await query(
      `UPDATE agents
       SET wrap_up_call_id = NULL,
           wrap_up_started_at = NULL,
           wrap_up_extensions = 0
       WHERE id = $1 AND tenant_id = $2`,
      [agentId, tenantId]
    );

    return {
      success: true,
      status: 'available',
      wrap_up_duration_seconds: wrapUpDuration
    };
  }

  /**
   * Extend wrap-up time
   */
  async extendWrapUp(tenantId, agentId) {
    // Get wrap-up settings
    const settings = await this.getWrapUpSettings(tenantId);

    if (!settings.allow_extension) {
      throw new Error('Wrap-up extension is not allowed');
    }

    // Get current wrap-up state
    const agentKey = `agent:${tenantId}:${agentId}:status`;
    const agentState = await redisClient.hgetall(agentKey);

    if (!agentState || agentState.status !== 'wrap_up') {
      throw new Error('Agent is not in wrap-up state');
    }

    const currentExtensions = parseInt(agentState.extensions || 0);

    if (currentExtensions >= settings.max_extensions) {
      throw new Error(`Maximum extensions (${settings.max_extensions}) reached`);
    }

    const newExtensions = currentExtensions + 1;
    const newExpiresAt = Date.now() + (settings.extension_time_seconds * 1000);

    // Update Redis
    await redisClient.hset(agentKey, {
      wrap_up_expires_at: newExpiresAt,
      extensions: newExtensions
    });

    // Update PostgreSQL
    await query(
      `UPDATE agents SET wrap_up_extensions = $1 WHERE id = $2 AND tenant_id = $3`,
      [newExtensions, agentId, tenantId]
    );

    // Update wrap-up record
    await query(
      `UPDATE call_wrap_ups
       SET was_extended = true
       WHERE agent_id = $1 AND tenant_id = $2 AND wrap_up_ended_at IS NULL`,
      [agentId, tenantId]
    );

    return {
      success: true,
      extension_number: newExtensions,
      extensions_remaining: settings.max_extensions - newExtensions,
      new_expires_at: new Date(newExpiresAt),
      extension_time_seconds: settings.extension_time_seconds
    };
  }

  /**
   * Check and auto-complete expired wrap-ups
   * (Called periodically by background job)
   */
  async checkExpiredWrapUps(tenantId) {
    const now = Date.now();
    const expiredAgents = [];

    // Get all agents in wrap-up state for this tenant
    const agents = await query(
      `SELECT id, wrap_up_started_at, wrap_up_extensions
       FROM agents
       WHERE tenant_id = $1 AND status = 'wrap_up' AND wrap_up_started_at IS NOT NULL`,
      [tenantId]
    );

    for (const agent of agents.rows) {
      const agentKey = `agent:${tenantId}:${agent.id}:status`;
      const agentState = await redisClient.hgetall(agentKey);

      if (!agentState || agentState.status !== 'wrap_up') {
        continue;
      }

      const expiresAt = parseInt(agentState.wrap_up_expires_at || 0);

      if (now >= expiresAt) {
        // Wrap-up expired
        const settings = await this.getWrapUpSettings(tenantId);

        if (settings.auto_available_after_timeout) {
          // Auto-complete wrap-up
          await this.autoCompleteWrapUp(tenantId, agent.id);
          expiredAgents.push(agent.id);
        }
      }
    }

    return { expired_count: expiredAgents.length, agent_ids: expiredAgents };
  }

  /**
   * Auto-complete wrap-up due to timeout
   */
  async autoCompleteWrapUp(tenantId, agentId) {
    // Update wrap-up record
    await query(
      `UPDATE call_wrap_ups
       SET wrap_up_ended_at = NOW(),
           auto_completed = true
       WHERE agent_id = $1 AND tenant_id = $2 AND wrap_up_ended_at IS NULL`,
      [agentId, tenantId]
    );

    // Set agent to available
    await queueService.setAgentStatus(tenantId, agentId, 'available');

    // Clear wrap-up data from agent
    await query(
      `UPDATE agents
       SET wrap_up_call_id = NULL,
           wrap_up_started_at = NULL,
           wrap_up_extensions = 0
       WHERE id = $1 AND tenant_id = $2`,
      [agentId, tenantId]
    );

    return { success: true, auto_completed: true };
  }

  /**
   * Get wrap-up settings for tenant/queue
   */
  async getWrapUpSettings(tenantId, queueId = null) {
    // Try queue-specific settings first
    if (queueId) {
      const queueSettings = await query(
        `SELECT * FROM agent_wrap_up_settings
         WHERE tenant_id = $1 AND queue_id = $2`,
        [tenantId, queueId]
      );

      if (queueSettings.rows.length > 0) {
        return queueSettings.rows[0];
      }
    }

    // Fall back to tenant-wide settings
    const tenantSettings = await query(
      `SELECT * FROM agent_wrap_up_settings
       WHERE tenant_id = $1 AND queue_id IS NULL`,
      [tenantId]
    );

    if (tenantSettings.rows.length > 0) {
      return tenantSettings.rows[0];
    }

    // Return defaults if no settings exist
    return {
      wrap_up_enabled: true,
      default_wrap_up_time_seconds: 60,
      max_wrap_up_time_seconds: 300,
      allow_extension: true,
      extension_time_seconds: 30,
      max_extensions: 3,
      auto_available_after_timeout: true,
      force_disposition_code: false
    };
  }

  /**
   * Get wrap-up status for agent
   */
  async getWrapUpStatus(tenantId, agentId) {
    const agentKey = `agent:${tenantId}:${agentId}:status`;
    const agentState = await redisClient.hgetall(agentKey);

    if (!agentState || agentState.status !== 'wrap_up') {
      return { in_wrap_up: false };
    }

    const now = Date.now();
    const wrapUpStartedAt = parseInt(agentState.wrap_up_started_at);
    const expiresAt = parseInt(agentState.wrap_up_expires_at);
    const extensions = parseInt(agentState.extensions || 0);

    const settings = await this.getWrapUpSettings(tenantId);

    return {
      in_wrap_up: true,
      wrap_up_started_at: new Date(wrapUpStartedAt),
      expires_at: new Date(expiresAt),
      time_remaining_seconds: Math.max(0, Math.floor((expiresAt - now) / 1000)),
      time_elapsed_seconds: Math.floor((now - wrapUpStartedAt) / 1000),
      extensions_used: extensions,
      extensions_remaining: settings.max_extensions - extensions,
      can_extend: settings.allow_extension && extensions < settings.max_extensions,
      call_id: agentState.wrap_up_call_id || null,
      call_uuid: agentState.wrap_up_call_uuid || null
    };
  }

  // === Wrap-up Codes Management ===

  /**
   * List wrap-up codes for tenant
   */
  async listWrapUpCodes(tenantId, options = {}) {
    const { category, active_only = true, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (active_only) {
      whereClause += ' AND is_active = true';
    }

    if (category) {
      whereClause += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT *, COUNT(*) OVER() as total_count
       FROM wrap_up_codes
       WHERE ${whereClause}
       ORDER BY sort_order ASC, name ASC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      params
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      codes: result.rows.map(row => {
        const { total_count, ...code } = row;
        return code;
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Create wrap-up code
   */
  async createWrapUpCode(tenantId, codeData) {
    const {
      code,
      name,
      description = null,
      category = null,
      color = '#6366f1',
      requires_notes = false,
      requires_followup = false,
      is_default = false,
      sort_order = 0
    } = codeData;

    // If setting as default, unset other defaults
    if (is_default) {
      await query(
        'UPDATE wrap_up_codes SET is_default = false WHERE tenant_id = $1 AND is_default = true',
        [tenantId]
      );
    }

    const result = await query(
      `INSERT INTO wrap_up_codes (
         tenant_id, code, name, description, category, color,
         requires_notes, requires_followup, is_default, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tenantId, code, name, description, category, color, requires_notes, requires_followup, is_default, sort_order]
    );

    return result.rows[0];
  }

  /**
   * Update wrap-up code
   */
  async updateWrapUpCode(tenantId, codeId, updates) {
    const allowedFields = [
      'name', 'description', 'category', 'color',
      'requires_notes', 'requires_followup', 'is_default', 'is_active', 'sort_order'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    // If setting as default, unset other defaults
    if (updates.is_default === true) {
      await query(
        'UPDATE wrap_up_codes SET is_default = false WHERE tenant_id = $1 AND is_default = true',
        [tenantId]
      );
    }

    setClauses.push('updated_at = NOW()');
    values.push(codeId, tenantId);

    const result = await query(
      `UPDATE wrap_up_codes
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Wrap-up code not found');
    }

    return result.rows[0];
  }

  /**
   * Delete wrap-up code
   */
  async deleteWrapUpCode(tenantId, codeId) {
    const result = await query(
      'DELETE FROM wrap_up_codes WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [codeId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wrap-up code not found');
    }

    return { success: true };
  }

  /**
   * Get wrap-up statistics for tenant
   */
  async getWrapUpStats(tenantId, period = 'today') {
    let dateFilter = "created_at >= CURRENT_DATE";

    if (period === 'week') {
      dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
    }

    // Overall stats
    const overallStats = await query(
      `SELECT
         COUNT(*) as total_wrap_ups,
         AVG(wrap_up_duration_seconds) as avg_duration,
         COUNT(*) FILTER (WHERE auto_completed = true) as auto_completed_count,
         COUNT(*) FILTER (WHERE was_extended = true) as extended_count,
         COUNT(*) FILTER (WHERE follow_up_required = true) as follow_up_count
       FROM call_wrap_ups
       WHERE tenant_id = $1 AND ${dateFilter}`,
      [tenantId]
    );

    // Stats by disposition code
    const codeStats = await query(
      `SELECT
         wc.code,
         wc.name,
         wc.category,
         COUNT(*) as count,
         AVG(cw.wrap_up_duration_seconds) as avg_duration
       FROM call_wrap_ups cw
       INNER JOIN wrap_up_codes wc ON cw.wrap_up_code_id = wc.id
       WHERE cw.tenant_id = $1 AND cw.${dateFilter}
       GROUP BY wc.id, wc.code, wc.name, wc.category
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    // Stats by agent
    const agentStats = await query(
      `SELECT
         a.id as agent_id,
         a.name as agent_name,
         COUNT(*) as total_wrap_ups,
         AVG(cw.wrap_up_duration_seconds) as avg_duration,
         COUNT(*) FILTER (WHERE cw.auto_completed = true) as auto_completed_count
       FROM call_wrap_ups cw
       INNER JOIN agents a ON cw.agent_id = a.id
       WHERE cw.tenant_id = $1 AND cw.${dateFilter}
       GROUP BY a.id, a.name
       ORDER BY total_wrap_ups DESC
       LIMIT 10`,
      [tenantId]
    );

    return {
      overall: overallStats.rows[0],
      by_code: codeStats.rows,
      by_agent: agentStats.rows,
      period
    };
  }
}

export default new WrapUpService();
