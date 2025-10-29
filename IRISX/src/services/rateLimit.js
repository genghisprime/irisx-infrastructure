/**
 * Advanced Rate Limiting Service
 * Redis-backed rate limiting with multiple strategies
 */

import redis from '../db/redis.js';
import { query } from '../db/index.js';

class RateLimitService {
  /**
   * Check if request is allowed (sliding window algorithm)
   * @param {string} key - Rate limit key (tenant:resource, ip:endpoint, etc.)
   * @param {number} maxRequests - Maximum requests allowed
   * @param {number} windowSeconds - Time window in seconds
   * @param {number} burst - Optional burst allowance
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
   */
  async checkLimit(key, maxRequests, windowSeconds, burst = 0) {
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const redisKey = `ratelimit:${key}`;

    try {
      // Remove old entries outside the window
      await redis.zremrangebyscore(redisKey, 0, windowStart);

      // Count requests in current window
      const requestCount = await redis.zcard(redisKey);

      // Check if limit exceeded (considering burst)
      const effectiveLimit = maxRequests + burst;
      const allowed = requestCount < effectiveLimit;

      if (allowed) {
        // Add current request to sorted set
        await redis.zadd(redisKey, now, `${now}-${Math.random()}`);

        // Set expiration
        await redis.expire(redisKey, windowSeconds);
      }

      // Calculate remaining and reset time
      const remaining = Math.max(0, effectiveLimit - requestCount - 1);
      const resetAt = now + (windowSeconds * 1000);

      return {
        allowed,
        remaining,
        resetAt,
        limit: effectiveLimit,
        current: requestCount + (allowed ? 1 : 0)
      };
    } catch (error) {
      console.error('[RateLimit] Redis error, allowing request:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: now + (windowSeconds * 1000),
        limit: maxRequests,
        current: 0
      };
    }
  }

  /**
   * Check rate limit using token bucket algorithm
   * Better for handling bursts of traffic
   */
  async checkTokenBucket(key, refillRate, bucketSize, tokensRequired = 1) {
    const now = Date.now();
    const redisKey = `tokenbucket:${key}`;

    try {
      // Get current bucket state
      const bucketData = await redis.get(redisKey);
      let tokens, lastRefill;

      if (bucketData) {
        const data = JSON.parse(bucketData);
        tokens = data.tokens;
        lastRefill = data.lastRefill;

        // Calculate tokens to add since last refill
        const timePassed = (now - lastRefill) / 1000;  // seconds
        const tokensToAdd = Math.floor(timePassed * refillRate);
        tokens = Math.min(bucketSize, tokens + tokensToAdd);
        lastRefill = now;
      } else {
        // First request - initialize bucket
        tokens = bucketSize;
        lastRefill = now;
      }

      // Check if enough tokens
      const allowed = tokens >= tokensRequired;

      if (allowed) {
        tokens -= tokensRequired;
      }

      // Save bucket state
      await redis.set(redisKey, JSON.stringify({ tokens, lastRefill }), 'EX', 3600);

      return {
        allowed,
        remaining: tokens,
        bucketSize,
        tokensRequired
      };
    } catch (error) {
      console.error('[RateLimit] Token bucket error:', error);
      return { allowed: true, remaining: bucketSize };
    }
  }

  /**
   * Get rate limit rules for a tenant/resource
   */
  async getRules(tenantId, resourceType, endpoint = null) {
    let sql = `
      SELECT * FROM rate_limit_rules
      WHERE is_active = TRUE
        AND (tenant_id IS NULL OR tenant_id = $1)
        AND resource_type = $2
    `;
    const params = [tenantId, resourceType];

    if (endpoint) {
      sql += ` AND ($3 ~ endpoint_pattern OR endpoint_pattern IS NULL)`;
      params.push(endpoint);
    }

    sql += ` ORDER BY priority ASC, tenant_id DESC NULLS LAST`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Check if user/tenant/IP is exempted
   */
  async isExempted(tenantId, userId, ipAddress, resourceType) {
    const sql = `
      SELECT * FROM rate_limit_exemptions
      WHERE is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (
          (tenant_id = $1)
          OR (user_id = $2)
          OR (ip_address = $3)
        )
        AND (
          resource_types = ARRAY[]::TEXT[]
          OR $4 = ANY(resource_types)
        )
      LIMIT 1
    `;

    const result = await query(sql, [tenantId, userId, ipAddress, resourceType]);
    return result.rows.length > 0;
  }

  /**
   * Log a rate limit violation
   */
  async logViolation(violationData) {
    const {
      tenant_id,
      user_id,
      ip_address,
      api_key_id,
      rule_id,
      rule_name,
      resource_type,
      endpoint,
      limit_value,
      current_usage,
      window_seconds,
      http_method,
      user_agent,
      request_id,
      action_taken = 'blocked',
      penalty_until,
      metadata
    } = violationData;

    const sql = `
      INSERT INTO rate_limit_violations (
        tenant_id, user_id, ip_address, api_key_id,
        rule_id, rule_name, resource_type, endpoint,
        limit_value, current_usage, window_seconds,
        http_method, user_agent, request_id,
        action_taken, penalty_until, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, user_id, ip_address, api_key_id,
      rule_id, rule_name, resource_type, endpoint,
      limit_value, current_usage, window_seconds,
      http_method, user_agent, request_id,
      action_taken, penalty_until,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0];
  }

  /**
   * Increment quota usage
   */
  async incrementQuota(tenantId, resourceType, amount = 1) {
    const sql = `SELECT increment_quota_usage($1, $2, $3) as result`;
    const result = await query(sql, [tenantId, resourceType, amount]);
    return result.rows[0].result;
  }

  /**
   * Check quota availability
   */
  async checkQuota(tenantId, resourceType, amountNeeded = 1) {
    const sql = `
      SELECT * FROM rate_limit_quotas
      WHERE tenant_id = $1
        AND resource_type = $2
        AND is_active = TRUE
        AND period_end > NOW()
      LIMIT 1
    `;

    const result = await query(sql, [tenantId, resourceType]);

    if (result.rows.length === 0) {
      return { allowed: true, unlimited: true };
    }

    const quota = result.rows[0];
    const allowed = (quota.quota_used + amountNeeded) <= quota.quota_limit;

    return {
      allowed,
      quota_limit: quota.quota_limit,
      quota_used: quota.quota_used,
      quota_remaining: quota.quota_remaining,
      usage_percent: (quota.quota_used / quota.quota_limit) * 100,
      is_exceeded: !allowed
    };
  }

  /**
   * Get quota for a tenant
   */
  async getQuota(tenantId, resourceType) {
    const sql = `
      SELECT * FROM rate_limit_quotas
      WHERE tenant_id = $1
        AND resource_type = $2
        AND is_active = TRUE
      ORDER BY period_start DESC
      LIMIT 1
    `;

    const result = await query(sql, [tenantId, resourceType]);
    return result.rows[0] || null;
  }

  /**
   * List violations
   */
  async listViolations(filters = {}) {
    const {
      tenant_id,
      user_id,
      ip_address,
      resource_type,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM rate_limit_violations WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (tenant_id) {
      sql += ` AND tenant_id = $${paramIndex}`;
      params.push(tenant_id);
      paramIndex++;
    }

    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (ip_address) {
      sql += ` AND ip_address = $${paramIndex}`;
      params.push(ip_address);
      paramIndex++;
    }

    if (resource_type) {
      sql += ` AND resource_type = $${paramIndex}`;
      params.push(resource_type);
      paramIndex++;
    }

    if (start_date) {
      sql += ` AND violated_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      sql += ` AND violated_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    sql += ` ORDER BY violated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get top violators
   */
  async getTopViolators(limit = 10) {
    const sql = `SELECT * FROM rate_limit_top_violators LIMIT $1`;
    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Get quota usage summary
   */
  async getQuotaUsageSummary(tenantId = null) {
    let sql = `SELECT * FROM rate_limit_quota_usage`;
    const params = [];

    if (tenantId) {
      sql += ` WHERE tenant_id = $1`;
      params.push(tenantId);
    }

    sql += ` ORDER BY usage_percent DESC`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Create custom rate limit rule
   */
  async createRule(ruleData) {
    const {
      tenant_id,
      rule_name,
      description,
      resource_type,
      endpoint_pattern,
      limit_type = 'requests',
      max_requests,
      window_seconds,
      burst_size = 0,
      penalty_seconds = 0,
      applies_to = 'tenant',
      priority = 100
    } = ruleData;

    const sql = `
      INSERT INTO rate_limit_rules (
        tenant_id, rule_name, description, resource_type, endpoint_pattern,
        limit_type, max_requests, window_seconds, burst_size, penalty_seconds,
        applies_to, priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, rule_name, description, resource_type, endpoint_pattern,
      limit_type, max_requests, window_seconds, burst_size, penalty_seconds,
      applies_to, priority
    ]);

    return result.rows[0];
  }

  /**
   * Update rate limit rule
   */
  async updateRule(ruleId, updates) {
    const allowedFields = [
      'rule_name', 'description', 'max_requests', 'window_seconds',
      'burst_size', 'penalty_seconds', 'is_active', 'priority'
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

    params.push(ruleId);
    const sql = `
      UPDATE rate_limit_rules
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Rate limit rule not found');
    }

    return result.rows[0];
  }

  /**
   * Delete rate limit rule
   */
  async deleteRule(ruleId) {
    const sql = `DELETE FROM rate_limit_rules WHERE id = $1 RETURNING *`;
    const result = await query(sql, [ruleId]);

    if (result.rows.length === 0) {
      throw new Error('Rate limit rule not found');
    }

    return result.rows[0];
  }

  /**
   * Reset expired quotas (call from cron)
   */
  async resetExpiredQuotas() {
    const sql = `SELECT reset_expired_quotas() as reset_count`;
    const result = await query(sql);
    return result.rows[0].reset_count;
  }
}

export default new RateLimitService();
