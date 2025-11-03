import { getCache, setCache } from '../db/redis.js';

/**
 * Rate limiting middleware using Redis
 * Limits requests per API key per time window
 */
export const rateLimit = (options = {}) => {
  const {
    windowMs = 60000,        // Time window in ms (default: 1 minute)
    maxRequests = 100,       // Max requests per window (default: 100)
    keyPrefix = 'ratelimit'  // Redis key prefix
  } = options;

  return async (c, next) => {
    // Get identifier (API key or IP address)
    const apiKeyId = c.get('apiKeyId');
    const identifier = apiKeyId || c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'anonymous';
    
    const key = `${keyPrefix}:${identifier}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      // Get current count from Redis
      const current = await getCache(key);
      const count = current ? parseInt(current) : 0;

      // Check if limit exceeded
      if (count >= maxRequests) {
        return c.json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowSeconds} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retry_after: windowSeconds
        }, 429);
      }

      // Increment counter
      await setCache(key, count + 1, windowSeconds);

      // Add rate limit headers
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - count - 1).toString());
      c.header('X-RateLimit-Reset', (Date.now() + windowMs).toString());

      await next();

    } catch (error) {
      console.error('Rate limiting error:', error);
      // On Redis error, allow request through (fail open)
      await next();
    }
  };
};

/**
 * Endpoint-specific rate limiting
 * For expensive operations like initiating calls
 */
export const strictRateLimit = rateLimit({
  windowMs: 60000,   // 1 minute
  maxRequests: 10,   // Only 10 requests per minute
  keyPrefix: 'ratelimit:strict'
});

/**
 * Standard rate limiting
 * For normal API operations
 */
export const standardRateLimit = rateLimit({
  windowMs: 60000,   // 1 minute
  maxRequests: 100,  // 100 requests per minute
  keyPrefix: 'ratelimit:standard'
});
