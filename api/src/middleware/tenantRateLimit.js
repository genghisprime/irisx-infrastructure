import redis from '../db/redis.js';
import { query } from '../db/connection.js';

/**
 * Per-tenant rate limiting middleware
 * Uses Redis for high-performance rate limit tracking
 */
export const tenantRateLimit = (options = {}) => {
  return async (c, next) => {
    try {
      const tenantId = c.get('tenantId');
      
      if (\!tenantId) {
        return c.json({ 
          error: 'Unauthorized', 
          message: 'Tenant ID not found',
          code: 'MISSING_TENANT' 
        }, 401);
      }

      // Get tenant rate limit from settings
      const tenantResult = await query(
        'SELECT settings FROM tenants WHERE id = $1',
        [tenantId]
      );

      if (tenantResult.rows.length === 0) {
        return c.json({ 
          error: 'Not Found', 
          message: 'Tenant not found',
          code: 'TENANT_NOT_FOUND' 
        }, 404);
      }

      const settings = tenantResult.rows[0].settings || {};
      const requestsPerMinute = settings.rate_limit_calls_per_minute || 60;
      const requestsPerHour = settings.rate_limit_calls_per_hour || 1000;

      // Check minute limit
      const minuteKey = `ratelimit:tenant:${tenantId}:minute:${getMinuteTimestamp()}`;
      const minuteCount = await redis.incr(minuteKey);
      
      if (minuteCount === 1) {
        await redis.expire(minuteKey, 60); // Expire after 60 seconds
      }

      if (minuteCount > requestsPerMinute) {
        const resetTime = 60 - (Date.now() / 1000 % 60);
        
        return c.json({
          error: 'Rate Limit Exceeded',
          message: `Too many requests. Limit: ${requestsPerMinute}/minute`,
          code: 'RATE_LIMIT_MINUTE',
          limit: requestsPerMinute,
          current: minuteCount,
          resetIn: Math.ceil(resetTime)
        }, 429, {
          'X-RateLimit-Limit': requestsPerMinute.toString(),
          'X-RateLimit-Remaining': Math.max(0, requestsPerMinute - minuteCount).toString(),
          'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + resetTime).toString()
        });
      }

      // Check hour limit
      const hourKey = `ratelimit:tenant:${tenantId}:hour:${getHourTimestamp()}`;
      const hourCount = await redis.incr(hourKey);
      
      if (hourCount === 1) {
        await redis.expire(hourKey, 3600); // Expire after 1 hour
      }

      if (hourCount > requestsPerHour) {
        const resetTime = 3600 - (Date.now() / 1000 % 3600);
        
        return c.json({
          error: 'Rate Limit Exceeded',
          message: `Too many requests. Limit: ${requestsPerHour}/hour`,
          code: 'RATE_LIMIT_HOUR',
          limit: requestsPerHour,
          current: hourCount,
          resetIn: Math.ceil(resetTime)
        }, 429);
      }

      // Add rate limit headers
      c.header('X-RateLimit-Limit-Minute', requestsPerMinute.toString());
      c.header('X-RateLimit-Remaining-Minute', Math.max(0, requestsPerMinute - minuteCount).toString());
      c.header('X-RateLimit-Limit-Hour', requestsPerHour.toString());
      c.header('X-RateLimit-Remaining-Hour', Math.max(0, requestsPerHour - hourCount).toString());

      console.log(`🚦 Tenant ${tenantId} rate limit: ${minuteCount}/${requestsPerMinute}/min, ${hourCount}/${requestsPerHour}/hr`);

      await next();
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // On error, allow request through (fail open)
      await next();
    }
  };
};

/**
 * Get current timestamp rounded to the minute
 */
function getMinuteTimestamp() {
  return Math.floor(Date.now() / 60000);
}

/**
 * Get current timestamp rounded to the hour
 */
function getHourTimestamp() {
  return Math.floor(Date.now() / 3600000);
}

/**
 * Get rate limit stats for a tenant
 */
export const getTenantRateLimitStats = async (tenantId) => {
  try {
    // Get tenant limits
    const tenantResult = await query(
      'SELECT settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return null;
    }

    const settings = tenantResult.rows[0].settings || {};
    const requestsPerMinute = settings.rate_limit_calls_per_minute || 60;
    const requestsPerHour = settings.rate_limit_calls_per_hour || 1000;

    // Get current usage
    const minuteKey = `ratelimit:tenant:${tenantId}:minute:${getMinuteTimestamp()}`;
    const hourKey = `ratelimit:tenant:${tenantId}:hour:${getHourTimestamp()}`;

    const minuteCount = parseInt(await redis.get(minuteKey) || 0);
    const hourCount = parseInt(await redis.get(hourKey) || 0);

    return {
      tenantId,
      limits: {
        perMinute: requestsPerMinute,
        perHour: requestsPerHour
      },
      current: {
        thisMinute: minuteCount,
        thisHour: hourCount
      },
      remaining: {
        thisMinute: Math.max(0, requestsPerMinute - minuteCount),
        thisHour: Math.max(0, requestsPerHour - hourCount)
      }
    };
  } catch (error) {
    console.error('Failed to get rate limit stats:', error);
    return null;
  }
};

export default { tenantRateLimit, getTenantRateLimitStats };
