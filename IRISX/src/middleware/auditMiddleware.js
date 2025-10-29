/**
 * Audit Middleware
 * Automatically logs API requests for audit trail
 */

import auditLogService from '../services/auditLog.js';

/**
 * Middleware to automatically log API requests
 * Add this to routes that need audit logging
 */
export const auditMiddleware = (options = {}) => {
  const {
    action = null,  // Override action (default: inferred from HTTP method)
    resource_type = null,  // Override resource type (default: inferred from path)
    severity = 'info',
    is_sensitive = false
  } = options;

  return async (c, next) => {
    const startTime = Date.now();
    const user = c.get('user');
    const tenantId = user?.tenant_id || 1;
    const userId = user?.id || null;

    // Extract request details
    const method = c.req.method;
    const path = c.req.path;
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();

    // Infer action from HTTP method if not provided
    const inferredAction = action || {
      'GET': 'read',
      'POST': 'create',
      'PUT': 'update',
      'PATCH': 'update',
      'DELETE': 'delete'
    }[method] || 'unknown';

    // Infer resource type from path if not provided
    const inferredResourceType = resource_type || path.split('/')[2] || 'unknown';

    let status = 'success';
    let errorMessage = null;

    try {
      // Execute the route handler
      await next();

      // Check response status
      if (c.res.status >= 400) {
        status = 'failed';
      }
    } catch (error) {
      status = 'error';
      errorMessage = error.message;
      throw error;  // Re-throw to let error handler deal with it
    } finally {
      // Log the audit event asynchronously (don't block response)
      const duration = Date.now() - startTime;

      auditLogService.logEvent({
        tenant_id: tenantId,
        user_id: userId,
        actor_type: user ? 'user' : 'api_key',
        actor_identifier: user?.email || c.req.header('x-api-key')?.substring(0, 10) + '...',
        action: inferredAction,
        resource_type: inferredResourceType,
        resource_id: c.req.param('id') || null,
        description: `${method} ${path}`,
        metadata: { duration_ms: duration },
        severity,
        is_sensitive,
        http_method: method,
        endpoint: path,
        request_id: requestId,
        ip_address: ip,
        user_agent: userAgent,
        status,
        error_message: errorMessage
      }).catch(err => {
        console.error('[Audit Middleware] Failed to log audit event:', err);
      });
    }
  };
};

/**
 * Log security event (for authentication failures, etc.)
 */
export const logSecurityEvent = async (eventData) => {
  try {
    await auditLogService.logSecurityEvent(eventData);
  } catch (error) {
    console.error('[Audit] Failed to log security event:', error);
  }
};

/**
 * Log data access (for PII/PHI compliance)
 */
export const logDataAccess = async (accessData) => {
  try {
    await auditLogService.logDataAccess(accessData);
  } catch (error) {
    console.error('[Audit] Failed to log data access:', error);
  }
};

/**
 * Log admin activity (for privileged actions)
 */
export const logAdminActivity = async (activityData) => {
  try {
    await auditLogService.logAdminActivity(activityData);
  } catch (error) {
    console.error('[Audit] Failed to log admin activity:', error);
  }
};
