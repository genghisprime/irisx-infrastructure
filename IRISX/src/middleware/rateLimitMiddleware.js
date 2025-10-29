/**
 * Advanced Rate Limiting Middleware
 * Integrates with rate limit service and database rules
 */

import rateLimitService from '../services/rateLimit.js';
import auditLogService from '../services/auditLog.js';

/**
 * Rate limit middleware - applies tenant/user/IP based rate limits
 */
export const rateLimitMiddleware = (options = {}) => {
  const {
    resourceType = 'api_requests',
    skipExemptionCheck = false,
    onLimit = null  // Custom callback when limit exceeded
  } = options;

  return async (c, next) => {
    const user = c.get('user');
    const tenantId = user?.tenant_id || 1;
    const userId = user?.id || null;
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const endpoint = c.req.path;
    const method = c.req.method;

    try {
      // Check if exempted
      if (!skipExemptionCheck) {
        const isExempted = await rateLimitService.isExempted(
          tenantId,
          userId,
          ip,
          resourceType
        );

        if (isExempted) {
          c.set('rateLimitExempted', true);
          return await next();
        }
      }

      // Get applicable rate limit rules
      const rules = await rateLimitService.getRules(tenantId, resourceType, endpoint);

      if (rules.length === 0) {
        // No specific rules, apply default
        const key = `${tenantId}:${resourceType}:${endpoint}`;
        const result = await rateLimitService.checkLimit(key, 100, 60);

        c.header('X-RateLimit-Limit', result.limit.toString());
        c.header('X-RateLimit-Remaining', result.remaining.toString());
        c.header('X-RateLimit-Reset', Math.floor(result.resetAt / 1000).toString());

        if (!result.allowed) {
          return c.json({
            error: 'Rate limit exceeded',
            message: 'Too many requests, please try again later',
            limit: result.limit,
            current: result.current,
            resetAt: new Date(result.resetAt).toISOString()
          }, 429);
        }

        return await next();
      }

      // Apply rules in priority order
      for (const rule of rules) {
        const limitKey = rule.applies_to === 'ip'
          ? `ip:${ip}:${resourceType}`
          : `tenant:${tenantId}:${resourceType}`;

        const result = await rateLimitService.checkLimit(
          limitKey,
          rule.max_requests,
          rule.window_seconds,
          rule.burst_size || 0
        );

        // Set rate limit headers
        c.header('X-RateLimit-Limit', result.limit.toString());
        c.header('X-RateLimit-Remaining', result.remaining.toString());
        c.header('X-RateLimit-Reset', Math.floor(result.resetAt / 1000).toString());
        c.header('X-RateLimit-Rule', rule.rule_name);

        if (!result.allowed) {
          // Log violation
          await rateLimitService.logViolation({
            tenant_id: tenantId,
            user_id: userId,
            ip_address: ip,
            rule_id: rule.id,
            rule_name: rule.rule_name,
            resource_type: resourceType,
            endpoint,
            limit_value: rule.max_requests,
            current_usage: result.current,
            window_seconds: rule.window_seconds,
            http_method: method,
            user_agent: c.req.header('user-agent'),
            request_id: c.req.header('x-request-id'),
            action_taken: 'blocked'
          });

          // Log security event
          await auditLogService.logSecurityEvent({
            tenant_id: tenantId,
            user_id: userId,
            ip_address: ip,
            event_type: 'rate_limit_exceeded',
            severity: 'warning',
            description: `Rate limit exceeded for ${resourceType} on ${endpoint}`,
            metadata: {
              rule: rule.rule_name,
              limit: rule.max_requests,
              window: rule.window_seconds,
              current: result.current
            },
            is_blocked: true,
            detection_method: 'rate_limiter'
          });

          // Call custom callback if provided
          if (onLimit) {
            await onLimit(c, rule, result);
          }

          return c.json({
            error: 'Rate limit exceeded',
            message: `Too many ${resourceType} requests. Please try again in ${rule.window_seconds} seconds.`,
            rule: rule.rule_name,
            limit: result.limit,
            current: result.current,
            resetAt: new Date(result.resetAt).toISOString(),
            retryAfter: Math.ceil(rule.window_seconds)
          }, 429);
        }
      }

      // All checks passed
      return await next();
    } catch (error) {
      console.error('[RateLimit Middleware] Error:', error);
      // Fail open - allow request if rate limiter fails
      return await next();
    }
  };
};

/**
 * Quota middleware - checks tenant quotas before allowing request
 */
export const quotaMiddleware = (resourceType, amountNeeded = 1) => {
  return async (c, next) => {
    const user = c.get('user');
    const tenantId = user?.tenant_id || 1;

    try {
      // Check quota
      const quotaCheck = await rateLimitService.checkQuota(tenantId, resourceType, amountNeeded);

      // Set quota headers
      if (!quotaCheck.unlimited) {
        c.header('X-Quota-Limit', quotaCheck.quota_limit?.toString() || 'unlimited');
        c.header('X-Quota-Used', quotaCheck.quota_used?.toString() || '0');
        c.header('X-Quota-Remaining', quotaCheck.quota_remaining?.toString() || 'unlimited');
      }

      if (!quotaCheck.allowed) {
        return c.json({
          error: 'Quota exceeded',
          message: `Your ${resourceType} quota has been exceeded. Please upgrade your plan or wait for quota reset.`,
          quota_limit: quotaCheck.quota_limit,
          quota_used: quotaCheck.quota_used,
          usage_percent: Math.round(quotaCheck.usage_percent)
        }, 403);
      }

      // Store quota info in context for later increment
      c.set('quotaInfo', { tenantId, resourceType, amountNeeded });

      return await next();
    } catch (error) {
      console.error('[Quota Middleware] Error:', error);
      // Fail open - allow request if quota check fails
      return await next();
    }
  };
};

/**
 * Increment quota after successful request
 * Use this middleware AFTER the main handler
 */
export const incrementQuotaMiddleware = () => {
  return async (c, next) => {
    await next();

    // Only increment if request was successful
    if (c.res.status < 400) {
      const quotaInfo = c.get('quotaInfo');
      if (quotaInfo) {
        const { tenantId, resourceType, amountNeeded } = quotaInfo;
        try {
          await rateLimitService.incrementQuota(tenantId, resourceType, amountNeeded);
        } catch (error) {
          console.error('[Increment Quota] Error:', error);
        }
      }
    }
  };
};

/**
 * Special rate limiter for login attempts (prevents brute force)
 */
export const loginRateLimiter = async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const key = `login:${ip}`;

  try {
    // Very strict: 5 attempts per minute, 20 per hour
    const perMinute = await rateLimitService.checkLimit(key + ':minute', 5, 60);
    const perHour = await rateLimitService.checkLimit(key + ':hour', 20, 3600);

    c.header('X-RateLimit-Remaining-Minute', perMinute.remaining.toString());
    c.header('X-RateLimit-Remaining-Hour', perHour.remaining.toString());

    if (!perMinute.allowed || !perHour.allowed) {
      // Log security event
      await auditLogService.logSecurityEvent({
        tenant_id: null,
        user_id: null,
        ip_address: ip,
        event_type: 'login_rate_limit_exceeded',
        severity: 'warning',
        description: `Excessive login attempts from ${ip}`,
        metadata: {
          attempts_per_minute: perMinute.current,
          attempts_per_hour: perHour.current
        },
        is_blocked: true,
        detection_method: 'rate_limiter'
      });

      return c.json({
        error: 'Too many login attempts',
        message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again later.',
        retryAfter: 300  // 5 minutes
      }, 429);
    }

    return await next();
  } catch (error) {
    console.error('[Login Rate Limiter] Error:', error);
    return await next();
  }
};
