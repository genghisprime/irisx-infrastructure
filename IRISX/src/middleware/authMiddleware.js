import authService from '../services/auth.js';
import { query } from '../db/connection.js';

/**
 * Authentication Middleware
 * Verifies JWT tokens and enforces authorization rules
 */

/**
 * Authenticate JWT token from Authorization header
 * Sets c.user with decoded token data
 */
export const authenticateJWT = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No token provided' }, 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = authService.verifyToken(token);

    // Set user context
    c.set('user', {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      email: decoded.email,
      role: decoded.role,
    });

    await next();
  } catch (error) {
    if (error.message === 'Token expired') {
      return c.json({ error: 'Token expired' }, 401);
    } else if (error.message === 'Invalid token') {
      return c.json({ error: 'Invalid token' }, 401);
    }
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

/**
 * Authenticate using API key from x-api-key header
 * Sets c.user and c.tenant with API key owner data
 */
export const authenticateAPIKey = async (c, next) => {
  try {
    const apiKey = c.req.header('x-api-key');

    if (!apiKey) {
      return c.json({ error: 'No API key provided' }, 401);
    }

    // Look up API key
    const result = await query(
      `SELECT ak.id, ak.tenant_id, ak.name, ak.key_type, ak.permissions, ak.rate_limit,
              t.name as tenant_name, t.status as tenant_status
       FROM api_keys ak
       JOIN tenants t ON t.id = ak.tenant_id
       WHERE ak.key_value = $1 AND ak.status = 'active' AND ak.expires_at > NOW()`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Invalid or expired API key' }, 401);
    }

    const apiKeyData = result.rows[0];

    // Check if tenant is active
    if (apiKeyData.tenant_status !== 'active') {
      return c.json({ error: 'Tenant account is inactive' }, 403);
    }

    // Update last used timestamp
    await query(
      'UPDATE api_keys SET last_used_at = NOW(), request_count = request_count + 1 WHERE id = $1',
      [apiKeyData.id]
    );

    // Set tenant context
    c.set('tenant', {
      tenantId: apiKeyData.tenant_id,
      tenantName: apiKeyData.tenant_name,
      apiKeyId: apiKeyData.id,
      apiKeyType: apiKeyData.key_type,
      permissions: apiKeyData.permissions,
      rateLimit: apiKeyData.rate_limit,
    });

    await next();
  } catch (error) {
    console.error('[Auth Middleware] API key authentication error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

/**
 * Require specific role(s)
 * Must be used after authenticateJWT
 */
export const requireRole = (...allowedRoles) => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
};

/**
 * Require admin role
 * Must be used after authenticateJWT
 */
export const requireAdmin = async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
};

/**
 * Require superadmin role (IRISX platform staff)
 * Must be used after authenticateJWT
 */
export const requireSuperAdmin = async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (user.role !== 'superadmin') {
    return c.json({ error: 'Superadmin access required' }, 403);
  }

  await next();
};

/**
 * Ensure request belongs to user's tenant
 * Prevents cross-tenant data access
 */
export const requireTenantAccess = async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Superadmins can access any tenant
  if (user.role === 'superadmin') {
    await next();
    return;
  }

  // Extract tenant_id from request params or query
  const requestedTenantId = c.req.param('tenant_id') || c.req.query('tenant_id');

  if (requestedTenantId && parseInt(requestedTenantId) !== user.tenantId) {
    return c.json({ error: 'Access denied to this tenant' }, 403);
  }

  await next();
};

/**
 * Optional authentication - sets user context if token is present
 * Does not reject if no token is provided
 */
export const optionalAuth = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);

      c.set('user', {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        email: decoded.email,
        role: decoded.role,
      });
    }
  } catch (error) {
    // Silently ignore auth errors for optional auth
  }

  await next();
};

/**
 * Check if user has specific permission
 * Permissions are stored in user.permissions array
 */
export const requirePermission = (permission) => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Superadmins have all permissions
    if (user.role === 'superadmin') {
      await next();
      return;
    }

    // Load user permissions from database
    const result = await query(
      'SELECT permissions FROM users WHERE id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const permissions = result.rows[0].permissions || [];

    if (!permissions.includes(permission)) {
      return c.json({ error: `Permission '${permission}' required` }, 403);
    }

    await next();
  };
};

/**
 * Rate limiting based on user/tenant
 * Uses Redis for distributed rate limiting
 */
export const rateLimitByUser = (maxRequests = 100, windowSeconds = 60) => {
  return async (c, next) => {
    const user = c.get('user');
    const tenant = c.get('tenant');

    if (!user && !tenant) {
      return c.json({ error: 'Authentication required for rate limiting' }, 401);
    }

    const key = user
      ? `ratelimit:user:${user.userId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`
      : `ratelimit:tenant:${tenant.tenantId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    try {
      // This would integrate with Redis
      // For now, just log and continue
      console.log(`[Rate Limit] Checking rate limit for key: ${key}`);
      await next();
    } catch (error) {
      console.error('[Rate Limit] Error:', error);
      return c.json({ error: 'Rate limit check failed' }, 500);
    }
  };
};

/**
 * Validate tenant status is active
 */
export const requireActiveTenant = async (c, next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  // Check tenant status
  const result = await query(
    'SELECT status FROM tenants WHERE id = $1',
    [user.tenantId]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const tenant = result.rows[0];

  if (tenant.status !== 'active') {
    return c.json({ error: 'Tenant account is inactive' }, 403);
  }

  await next();
};

/**
 * Log all authenticated requests for audit
 */
export const auditLog = async (c, next) => {
  const user = c.get('user');
  const tenant = c.get('tenant');

  const startTime = Date.now();

  await next();

  const duration = Date.now() - startTime;

  // Log to audit table
  if (user || tenant) {
    try {
      await query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource, method, path, ip_address, user_agent, status_code, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          user?.tenantId || tenant?.tenantId || null,
          user?.userId || null,
          c.req.method,
          c.req.url,
          c.req.method,
          c.req.path,
          c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
          c.req.header('user-agent') || 'unknown',
          c.res.status || 200,
          duration,
        ]
      );
    } catch (error) {
      console.error('[Audit Log] Failed to log request:', error);
    }
  }
};
