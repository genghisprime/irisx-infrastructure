/**
 * Agent Service - Agent management and CRUD operations
 */

import { query } from '../db/connection.js';
import queueService from './queue.js';

class AgentService {
  /**
   * Create a new agent
   */
  async createAgent(tenantId, agentData) {
    const {
      name,
      email,
      extension,
      user_id = null,
      skills = [],
      max_concurrent_calls = 1
    } = agentData;

    const result = await query(
      `INSERT INTO agents (tenant_id, name, email, extension, user_id, skills, max_concurrent_calls, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'offline')
       RETURNING *`,
      [tenantId, name, email, extension, user_id, JSON.stringify(skills), max_concurrent_calls]
    );

    return result.rows[0];
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId, tenantId) {
    const result = await query(
      'SELECT * FROM agents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [agentId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    // Get real-time status from Redis
    const realtimeStatus = await queueService.getAgentStatus(tenantId, agentId);

    return {
      ...result.rows[0],
      realtime_status: realtimeStatus
    };
  }

  /**
   * List all agents for a tenant
   */
  async listAgents(tenantId, options = {}) {
    const { page = 1, limit = 50, status, queue_id } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'a.tenant_id = $1 AND a.deleted_at IS NULL';
    const values = [tenantId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND a.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    let joinClause = '';
    if (queue_id) {
      joinClause = 'INNER JOIN queue_agents qa ON a.id = qa.agent_id';
      whereClause += ` AND qa.queue_id = $${paramCount} AND qa.status = 'active'`;
      values.push(queue_id);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT a.*, COUNT(*) OVER() as total_count
       FROM agents a
       ${joinClause}
       WHERE ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      agents: result.rows.map(row => {
        const { total_count, ...agent } = row;
        return agent;
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
   * Update agent
   */
  async updateAgent(agentId, tenantId, updates) {
    const allowedFields = ['name', 'email', 'extension', 'skills', 'max_concurrent_calls', 'status', 'status_message'];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(key === 'skills' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(agentId, tenantId);

    const result = await query(
      `UPDATE agents
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    // Update Redis status if status was changed
    if (updates.status) {
      await queueService.setAgentStatus(tenantId, agentId, updates.status);
    }

    return result.rows[0];
  }

  /**
   * Delete agent (soft delete)
   */
  async deleteAgent(agentId, tenantId) {
    const result = await query(
      'UPDATE agents SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id',
      [agentId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }

    // Set agent as offline in Redis
    await queueService.setAgentStatus(tenantId, agentId, 'offline');

    return { success: true };
  }

  /**
   * Assign agent to queue
   */
  async assignToQueue(agentId, tenantId, queueId, priority = 5) {
    // Verify agent exists
    await this.getAgent(agentId, tenantId);

    // Verify queue exists
    const queueResult = await query(
      'SELECT id FROM queues WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [queueId, tenantId]
    );

    if (queueResult.rows.length === 0) {
      throw new Error('Queue not found');
    }

    // Assign
    const result = await query(
      `INSERT INTO queue_agents (queue_id, agent_id, priority, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (queue_id, agent_id)
       DO UPDATE SET priority = $3, status = 'active'
       RETURNING *`,
      [queueId, agentId, priority]
    );

    return result.rows[0];
  }

  /**
   * Remove agent from queue
   */
  async removeFromQueue(agentId, tenantId, queueId) {
    await query(
      `DELETE FROM queue_agents
       WHERE agent_id = $1 AND queue_id = $2
       AND EXISTS (SELECT 1 FROM agents WHERE id = $1 AND tenant_id = $3)`,
      [agentId, queueId, tenantId]
    );

    return { success: true };
  }

  /**
   * Get agent performance stats
   */
  async getAgentStats(agentId, tenantId, period = 'today') {
    let dateFilter = "qm.answered_at >= CURRENT_DATE";

    if (period === 'week') {
      dateFilter = "qm.answered_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "qm.answered_at >= CURRENT_DATE - INTERVAL '30 days'";
    }

    const result = await query(
      `SELECT
         COUNT(*) as calls_handled,
         AVG(qm.wait_time_seconds) as avg_wait_time,
         SUM(EXTRACT(EPOCH FROM (c.ended_at - c.answered_at))) as total_talk_time,
         AVG(EXTRACT(EPOCH FROM (c.ended_at - c.answered_at))) as avg_talk_time
       FROM queue_members qm
       INNER JOIN calls c ON qm.call_id = c.id
       WHERE qm.assigned_agent_id = $1
         AND c.tenant_id = $2
         AND ${dateFilter}`,
      [agentId, tenantId]
    );

    return result.rows[0];
  }

  /**
   * Get agent activity log
   */
  async getAgentActivity(agentId, tenantId, limit = 50) {
    const result = await query(
      `SELECT * FROM agent_activity
       WHERE agent_id = $1
       AND EXISTS (SELECT 1 FROM agents WHERE id = $1 AND tenant_id = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [agentId, tenantId, limit]
    );

    return result.rows;
  }
}

export default new AgentService();
