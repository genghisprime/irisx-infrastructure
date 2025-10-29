/**
 * Audit Logging API Routes
 *
 * Endpoints:
 * - GET /v1/audit/logs - List audit logs
 * - GET /v1/audit/logs/stats - Get audit statistics
 * - GET /v1/audit/security-events - List security events
 * - POST /v1/audit/security-events/:id/resolve - Resolve security event
 * - GET /v1/audit/data-access - List data access logs
 * - GET /v1/audit/admin-activity - List admin activity logs
 * - GET /v1/audit/failed-logins - Get failed login attempts
 * - GET /v1/audit/sensitive-access - Get sensitive data access summary
 * - GET /v1/audit/admin-pending - Get admin actions requiring review
 */

import { Hono } from 'hono';
import auditLogService from '../services/auditLog.js';

const audit = new Hono();

// List audit logs
audit.get('/logs', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const filters = {
      user_id: c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null,
      action: c.req.query('action'),
      resource_type: c.req.query('resource_type'),
      resource_id: c.req.query('resource_id'),
      severity: c.req.query('severity'),
      status: c.req.query('status'),
      start_date: c.req.query('start_date'),
      end_date: c.req.query('end_date'),
      limit: parseInt(c.req.query('limit') || '100'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await auditLogService.listAuditLogs(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[Audit] Error listing audit logs:', error);
    return c.json({ error: 'Failed to list audit logs' }, 500);
  }
});

// Get audit statistics
audit.get('/logs/stats', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const days = parseInt(c.req.query('days') || '30');

    const stats = await auditLogService.getAuditStats(tenantId, days);

    return c.json({ stats });
  } catch (error) {
    console.error('[Audit] Error getting audit stats:', error);
    return c.json({ error: 'Failed to get audit statistics' }, 500);
  }
});

// List security events
audit.get('/security-events', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const filters = {
      user_id: c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null,
      event_type: c.req.query('event_type'),
      severity: c.req.query('severity'),
      is_resolved: c.req.query('is_resolved') ? c.req.query('is_resolved') === 'true' : undefined,
      limit: parseInt(c.req.query('limit') || '100'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await auditLogService.listSecurityEvents(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[Audit] Error listing security events:', error);
    return c.json({ error: 'Failed to list security events' }, 500);
  }
});

// Resolve security event
audit.post('/security-events/:id/resolve', async (c) => {
  try {
    const eventId = parseInt(c.req.param('id'));
    const userId = c.get('user')?.id || 1;
    const body = await c.req.json();
    const { resolution_notes } = body;

    const event = await auditLogService.resolveSecurityEvent(
      eventId,
      userId,
      resolution_notes
    );

    return c.json({
      message: 'Security event resolved successfully',
      event
    });
  } catch (error) {
    console.error('[Audit] Error resolving security event:', error);
    return c.json({ error: error.message }, 400);
  }
});

// List data access logs
audit.get('/data-access', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const filters = {
      user_id: c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null,
      data_type: c.req.query('data_type'),
      resource_id: c.req.query('resource_id'),
      access_type: c.req.query('access_type'),
      limit: parseInt(c.req.query('limit') || '100'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await auditLogService.listDataAccessLogs(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[Audit] Error listing data access logs:', error);
    return c.json({ error: 'Failed to list data access logs' }, 500);
  }
});

// List admin activity logs
audit.get('/admin-activity', async (c) => {
  try {
    const filters = {
      admin_user_id: c.req.query('admin_user_id') ? parseInt(c.req.query('admin_user_id')) : null,
      target_tenant_id: c.req.query('target_tenant_id') ? parseInt(c.req.query('target_tenant_id')) : null,
      action: c.req.query('action'),
      requires_approval: c.req.query('requires_approval') ? c.req.query('requires_approval') === 'true' : undefined,
      limit: parseInt(c.req.query('limit') || '100'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await auditLogService.listAdminActivityLogs(filters);

    return c.json(result);
  } catch (error) {
    console.error('[Audit] Error listing admin activity logs:', error);
    return c.json({ error: 'Failed to list admin activity logs' }, 500);
  }
});

// Get failed login attempts
audit.get('/failed-logins', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');

    const attempts = await auditLogService.getFailedLoginAttempts(limit);

    return c.json({ failed_login_attempts: attempts });
  } catch (error) {
    console.error('[Audit] Error getting failed login attempts:', error);
    return c.json({ error: 'Failed to get failed login attempts' }, 500);
  }
});

// Get sensitive data access summary
audit.get('/sensitive-access', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const limit = parseInt(c.req.query('limit') || '10');

    const summary = await auditLogService.getSensitiveDataAccessSummary(tenantId, limit);

    return c.json({ sensitive_data_access_summary: summary });
  } catch (error) {
    console.error('[Audit] Error getting sensitive data access summary:', error);
    return c.json({ error: 'Failed to get sensitive data access summary' }, 500);
  }
});

// Get admin actions requiring review
audit.get('/admin-pending', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');

    const actions = await auditLogService.getAdminActionsForReview(limit);

    return c.json({ admin_actions_pending: actions });
  } catch (error) {
    console.error('[Audit] Error getting admin pending actions:', error);
    return c.json({ error: 'Failed to get admin pending actions' }, 500);
  }
});

export default audit;
