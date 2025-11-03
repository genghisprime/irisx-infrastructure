/**
 * Rate Limiting Middleware
 * Protects API endpoints from brute force attacks and abuse
 * Uses Redis for distributed rate limiting
 */

import redis from '../db/redis.js';

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limiting configuration
 * @param {number} options.points - Number of requests allowed
 * @param {number} options.duration - Time window in seconds
 * @param {string} options.keyPrefix - Redis key prefix for this limiter
 * @param {Function} options.keyGenerator - Custom key generator function
 */
export function rateLimit(options = {}) {
  const {
    points = 10,
    duration = 60,
    keyPrefix = 'rl',
    keyGenerator = (c) => {
      // Default: Use IP address
      return c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    },
  } = options;

  return async (c, next) => {
    try {
      const identifier = keyGenerator(c);
      const key = `${keyPrefix}:${identifier}`;

      // Get current count
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= points) {
        // Rate limit exceeded
        const ttl = await redis.ttl(key);

        return c.json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
          retry_after: ttl > 0 ? ttl : duration,
        }, 429);
      }

      // Increment counter
      const multi = redis.multi();
      multi.incr(key);

      // Set expiry on first request
      if (count === 0) {
        multi.expire(key, duration);
      }

      await multi.exec();

      // Add rate limit headers
      c.header('X-RateLimit-Limit', points.toString());
      c.header('X-RateLimit-Remaining', (points - count - 1).toString());
      c.header('X-RateLimit-Reset', (Math.floor(Date.now() / 1000) + duration).toString());

      await next();
    } catch (err) {
      console.error('Rate limit error:', err);
      // Don't fail the request if rate limiting fails
      await next();
    }
  };
}

/**
 * Stricter rate limiter for authentication endpoints
 * Prevents brute force attacks on login
 */
export const authRateLimit = rateLimit({
  points: 5, // 5 attempts
  duration: 15 * 60, // per 15 minutes
  keyPrefix: 'rl:auth',
  keyGenerator: (c) => {
    // Rate limit by IP + email combination
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    return ip;
  },
});

/**
 * Rate limiter for API key creation
 * Prevents abuse of API key generation
 */
export const apiKeyCreationRateLimit = rateLimit({
  points: 10, // 10 keys
  duration: 60 * 60, // per hour
  keyPrefix: 'rl:apikey',
  keyGenerator: (c) => {
    // Rate limit by tenant ID (from authenticated user)
    const user = c.get('user');
    return user?.tenantId || 'unknown';
  },
});

/**
 * General API rate limiter
 * Protects against general API abuse
 */
export const generalRateLimit = rateLimit({
  points: 100, // 100 requests
  duration: 60, // per minute
  keyPrefix: 'rl:api',
});

/**
 * Stricter rate limiter for expensive operations
 * (e.g., sending emails, making calls)
 */
export const expensiveOperationRateLimit = rateLimit({
  points: 30, // 30 operations
  duration: 60, // per minute
  keyPrefix: 'rl:expensive',
  keyGenerator: (c) => {
    // Rate limit by tenant ID
    const user = c.get('user');
    return user?.tenantId || 'unknown';
  },
});
