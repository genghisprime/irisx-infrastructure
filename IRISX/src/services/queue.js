/**
 * Queue Service - Redis-based call queue management
 *
 * Redis Data Structures:
 * - queue:{tenant_id}:{queue_id}:waiting - ZSET (score = timestamp, member = call_uuid)
 * - queue:{tenant_id}:{queue_id}:member:{call_uuid} - HASH (caller_id, priority, joined_at, etc.)
 * - agent:{tenant_id}:{agent_id}:status - HASH (status, last_heartbeat, current_call_uuid)
 * - queue:{tenant_id}:{queue_id}:agents:available - SET (agent_ids that are available)
 * - queue:{tenant_id}:{queue_id}:stats - HASH (calls_offered, calls_answered, etc.)
 */

import { query } from '../db/connection.js';
import redisClient from '../db/redis.js';

class QueueService {
  /**
   * Add caller to queue
   */
  async enqueue(tenantId, queueId, callData) {
    const {
      call_uuid,
      caller_id,
      caller_name = '',
      priority = 5, // 1-10, higher = more important
      call_id = null
    } = callData;

    const now = Date.now();
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;
    const memberKey = `queue:${tenantId}:${queueId}:member:${call_uuid}`;

    // Check queue size limit
    const queueConfig = await this.getQueueConfig(queueId, tenantId);
    const currentSize = await redisClient.zcard(queueKey);

    if (currentSize >= queueConfig.max_queue_size) {
      throw new Error('Queue is full');
    }

    // Store member data
    await redisClient.hset(memberKey, {
      call_uuid,
      caller_id,
      caller_name,
      priority,
      call_id: call_id || '',
      joined_at: now,
      status: 'waiting'
    });

    // Add to sorted set (score = priority * 1000000 + timestamp for FIFO within priority)
    const score = (10 - priority) * 1000000000000 + now; // Invert priority so higher priority = lower score
    await redisClient.zadd(queueKey, score, call_uuid);

    // Set TTL for member data (2 hours)
    await redisClient.expire(memberKey, 7200);

    // Update stats
    await redisClient.hincrby(`queue:${tenantId}:${queueId}:stats`, 'calls_offered', 1);

    // Log to PostgreSQL
    await query(
      `INSERT INTO queue_members (queue_id, call_id, caller_id, caller_name, position, priority, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
      [queueId, call_id, caller_id, caller_name, currentSize + 1, priority, now]
    );

    return {
      position: currentSize + 1,
      estimated_wait_time: await this.calculateEWT(tenantId, queueId),
      queue_depth: currentSize + 1
    };
  }

  /**
   * Remove caller from queue and assign to agent
   */
  async dequeue(tenantId, queueId, strategy = 'round-robin') {
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;

    // Get next caller (lowest score = highest priority / earliest arrival)
    const callers = await redisClient.zrange(queueKey, 0, 0);

    if (callers.length === 0) {
      return null; // Queue is empty
    }

    const call_uuid = callers[0];
    const memberKey = `queue:${tenantId}:${queueId}:member:${call_uuid}`;

    // Get caller data
    const callerData = await redisClient.hgetall(memberKey);

    if (!callerData || !callerData.call_uuid) {
      // Stale entry, remove and try again
      await redisClient.zrem(queueKey, call_uuid);
      return this.dequeue(tenantId, queueId, strategy);
    }

    // Find available agent
    const agent = await this.findAvailableAgent(tenantId, queueId, strategy, callerData);

    if (!agent) {
      return null; // No agents available
    }

    // Remove from queue
    await redisClient.zrem(queueKey, call_uuid);

    // Update member status
    await redisClient.hset(memberKey, {
      status: 'answered',
      answered_at: Date.now(),
      assigned_agent_id: agent.id
    });

    // Mark agent as busy
    await this.setAgentStatus(tenantId, agent.id, 'busy', call_uuid);

    // Calculate wait time
    const waitTime = Math.floor((Date.now() - parseInt(callerData.joined_at)) / 1000);

    // Update PostgreSQL
    await query(
      `UPDATE queue_members
       SET answered_at = NOW(),
           wait_time_seconds = $1,
           outcome = 'answered',
           assigned_agent_id = $2
       WHERE queue_id = $3 AND caller_id = $4 AND answered_at IS NULL AND abandoned_at IS NULL`,
      [waitTime, agent.id, queueId, callerData.caller_id]
    );

    // Update stats
    await redisClient.hincrby(`queue:${tenantId}:${queueId}:stats`, 'calls_answered', 1);
    await redisClient.hincrby(`queue:${tenantId}:${queueId}:stats`, 'total_wait_time', waitTime);

    // Update agent stats
    await query(
      'UPDATE agents SET total_calls_handled = total_calls_handled + 1 WHERE id = $1',
      [agent.id]
    );

    return {
      call_uuid,
      caller_id: callerData.caller_id,
      caller_name: callerData.caller_name,
      agent,
      wait_time: waitTime
    };
  }

  /**
   * Get caller position in queue
   */
  async getPosition(tenantId, queueId, call_uuid) {
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;
    const rank = await redisClient.zrank(queueKey, call_uuid);

    if (rank === null) {
      return null; // Not in queue
    }

    return {
      position: rank + 1, // Convert 0-based index to 1-based position
      queue_depth: await redisClient.zcard(queueKey),
      estimated_wait_time: await this.calculateEWT(tenantId, queueId)
    };
  }

  /**
   * Get queue length
   */
  async getQueueLength(tenantId, queueId) {
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;
    return await redisClient.zcard(queueKey);
  }

  /**
   * Remove caller from queue (abandoned, timeout, etc.)
   */
  async removeFromQueue(tenantId, queueId, call_uuid, reason = 'abandoned') {
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;
    const memberKey = `queue:${tenantId}:${queueId}:member:${call_uuid}`;

    // Get caller data
    const callerData = await redisClient.hgetall(memberKey);

    if (!callerData || !callerData.call_uuid) {
      return; // Already removed
    }

    // Calculate wait time
    const waitTime = Math.floor((Date.now() - parseInt(callerData.joined_at)) / 1000);

    // Remove from queue
    await redisClient.zrem(queueKey, call_uuid);
    await redisClient.del(memberKey);

    // Update PostgreSQL
    await query(
      `UPDATE queue_members
       SET abandoned_at = NOW(),
           wait_time_seconds = $1,
           outcome = $2
       WHERE queue_id = $3 AND caller_id = $4 AND answered_at IS NULL AND abandoned_at IS NULL`,
      [waitTime, reason, queueId, callerData.caller_id]
    );

    // Update stats
    await redisClient.hincrby(`queue:${tenantId}:${queueId}:stats`, 'calls_abandoned', 1);
  }

  /**
   * Find available agent based on routing strategy
   */
  async findAvailableAgent(tenantId, queueId, strategy, callerData = {}) {
    // Get all agents for this queue
    const agents = await query(
      `SELECT a.id, a.name, a.extension, a.status, a.skills, qa.priority
       FROM agents a
       INNER JOIN queue_agents qa ON a.id = qa.agent_id
       WHERE qa.queue_id = $1
         AND a.tenant_id = $2
         AND a.deleted_at IS NULL
         AND qa.status = 'active'
         AND a.status = 'available'
       ORDER BY qa.priority DESC, a.last_status_change ASC`,
      [queueId, tenantId]
    );

    if (agents.rows.length === 0) {
      return null;
    }

    // Check Redis for real-time status
    const availableAgents = [];
    for (const agent of agents.rows) {
      const agentStatus = await this.getAgentStatus(tenantId, agent.id);
      if (agentStatus && agentStatus.status === 'available' && !agentStatus.current_call_uuid) {
        availableAgents.push(agent);
      }
    }

    if (availableAgents.length === 0) {
      return null;
    }

    // Apply routing strategy
    switch (strategy) {
      case 'round-robin':
        return availableAgents[0]; // Already sorted by last_status_change ASC

      case 'longest-idle':
        return availableAgents[0]; // Already sorted by last_status_change ASC

      case 'skills-based':
        // TODO: Implement skills matching
        return availableAgents[0];

      default:
        return availableAgents[0];
    }
  }

  /**
   * Calculate Estimated Wait Time (EWT)
   */
  async calculateEWT(tenantId, queueId) {
    // Get average handle time from last 10 calls
    const result = await query(
      `SELECT AVG(wait_time_seconds) as avg_wait
       FROM queue_members
       WHERE queue_id = $1 AND answered_at IS NOT NULL AND answered_at >= NOW() - INTERVAL '1 hour'
       LIMIT 10`,
      [queueId]
    );

    const avgWait = result.rows[0]?.avg_wait || 30; // Default 30 seconds
    const queueDepth = await this.getQueueLength(tenantId, queueId);
    const availableAgents = await this.getAvailableAgentCount(tenantId, queueId);

    if (availableAgents === 0) {
      return Math.ceil(avgWait * queueDepth);
    }

    return Math.ceil((avgWait * queueDepth) / availableAgents);
  }

  /**
   * Get available agent count
   */
  async getAvailableAgentCount(tenantId, queueId) {
    const agents = await query(
      `SELECT a.id
       FROM agents a
       INNER JOIN queue_agents qa ON a.id = qa.agent_id
       WHERE qa.queue_id = $1 AND a.tenant_id = $2 AND a.status = 'available' AND a.deleted_at IS NULL`,
      [queueId, tenantId]
    );

    let count = 0;
    for (const agent of agents.rows) {
      const status = await this.getAgentStatus(tenantId, agent.id);
      if (status && status.status === 'available') {
        count++;
      }
    }

    return count;
  }

  /**
   * Set agent status in Redis
   */
  async setAgentStatus(tenantId, agentId, status, currentCallUuid = null) {
    const agentKey = `agent:${tenantId}:${agentId}:status`;

    await redisClient.hset(agentKey, {
      status,
      last_heartbeat: Date.now(),
      current_call_uuid: currentCallUuid || ''
    });

    // Set TTL (5 minutes)
    await redisClient.expire(agentKey, 300);

    // Update PostgreSQL
    await query(
      'UPDATE agents SET status = $1 WHERE id = $2 AND tenant_id = $3',
      [status, agentId, tenantId]
    );
  }

  /**
   * Get agent status from Redis
   */
  async getAgentStatus(tenantId, agentId) {
    const agentKey = `agent:${tenantId}:${agentId}:status`;
    const data = await redisClient.hgetall(agentKey);

    if (!data || !data.status) {
      return null;
    }

    // Check if heartbeat is stale (> 2 minutes)
    const lastHeartbeat = parseInt(data.last_heartbeat);
    if (Date.now() - lastHeartbeat > 120000) {
      // Mark as offline
      await this.setAgentStatus(tenantId, agentId, 'offline');
      return { status: 'offline' };
    }

    return data;
  }

  /**
   * Agent heartbeat (called periodically by agent)
   */
  async heartbeat(tenantId, agentId, status = 'available') {
    const agentKey = `agent:${tenantId}:${agentId}:status`;

    await redisClient.hset(agentKey, {
      status,
      last_heartbeat: Date.now()
    });

    await redisClient.expire(agentKey, 300);

    return { success: true };
  }

  /**
   * Get queue configuration from PostgreSQL
   */
  async getQueueConfig(queueId, tenantId) {
    const result = await query(
      'SELECT * FROM queues WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [queueId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Queue not found');
    }

    return result.rows[0];
  }

  /**
   * Get real-time queue stats
   */
  async getQueueStats(tenantId, queueId) {
    const queueKey = `queue:${tenantId}:${queueId}:waiting`;
    const statsKey = `queue:${tenantId}:${queueId}:stats`;

    const [waiting, stats, ewt, availableAgents] = await Promise.all([
      redisClient.zcard(queueKey),
      redisClient.hgetall(statsKey),
      this.calculateEWT(tenantId, queueId),
      this.getAvailableAgentCount(tenantId, queueId)
    ]);

    const callsOffered = parseInt(stats.calls_offered) || 0;
    const callsAnswered = parseInt(stats.calls_answered) || 0;
    const callsAbandoned = parseInt(stats.calls_abandoned) || 0;
    const totalWaitTime = parseInt(stats.total_wait_time) || 0;

    return {
      waiting,
      calls_offered: callsOffered,
      calls_answered: callsAnswered,
      calls_abandoned: callsAbandoned,
      abandon_rate: callsOffered > 0 ? ((callsAbandoned / callsOffered) * 100).toFixed(2) : '0.00',
      avg_wait_time: callsAnswered > 0 ? Math.floor(totalWaitTime / callsAnswered) : 0,
      estimated_wait_time: ewt,
      available_agents: availableAgents
    };
  }

  /**
   * Reset daily stats (called by cron job at midnight)
   */
  async resetDailyStats(tenantId, queueId) {
    const statsKey = `queue:${tenantId}:${queueId}:stats`;
    await redisClient.del(statsKey);
  }
}

export default new QueueService();
