/**
 * Tenant Isolation Routes
 * API for tenant isolation monitoring and security
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import tenantIsolation from '../services/tenant-isolation.js';
import db from '../db.js';

const router = new Hono();

// ===========================================
// SECURITY POLICIES
// ===========================================

/**
 * GET /v1/tenant-isolation/policy
 * Get security policy for current tenant
 */
router.get('/policy', async (c) => {
  const tenantId = c.get('tenantId');

  const policy = await tenantIsolation.getSecurityPolicy(tenantId);

  return c.json(policy);
});

/**
 * GET /v1/tenant-isolation/policy/:tenantId
 * Get security policy for specific tenant (admin only)
 */
router.get('/policy/:tenantId', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { tenantId } = c.req.param();
  const policy = await tenantIsolation.getSecurityPolicy(tenantId);

  return c.json(policy);
});

/**
 * PUT /v1/tenant-isolation/policy
 * Update security policy for current tenant
 */
router.put('/policy', zValidator('json', z.object({
  enforce_ip_whitelist: z.boolean().optional(),
  require_mfa: z.boolean().optional(),
  session_timeout_minutes: z.number().int().min(15).max(1440).optional(),
  max_concurrent_sessions: z.number().int().min(1).max(100).optional(),
  data_export_enabled: z.boolean().optional(),
  api_data_access_level: z.enum(['full', 'limited', 'restricted']).optional(),
  pii_masking_enabled: z.boolean().optional(),
  isolation_level: z.enum(['standard', 'enhanced', 'strict']).optional(),
  cross_tenant_sharing_enabled: z.boolean().optional(),
  audit_all_access: z.boolean().optional(),
  audit_retention_days: z.number().int().min(30).max(365).optional(),
  alert_on_suspicious_activity: z.boolean().optional(),
  alert_contacts: z.array(z.string().email()).optional(),
  api_rate_limit_per_minute: z.number().int().min(10).max(10000).optional(),
  data_export_rate_limit_per_day: z.number().int().min(1).max(100).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const updates = c.req.valid('json');

  const policy = await tenantIsolation.updateSecurityPolicy(tenantId, updates);

  return c.json(policy);
});

/**
 * PUT /v1/tenant-isolation/policy/:tenantId
 * Update security policy for specific tenant (admin only)
 */
router.put('/policy/:tenantId', zValidator('json', z.object({
  enforce_ip_whitelist: z.boolean().optional(),
  require_mfa: z.boolean().optional(),
  session_timeout_minutes: z.number().int().min(15).max(1440).optional(),
  max_concurrent_sessions: z.number().int().min(1).max(100).optional(),
  data_export_enabled: z.boolean().optional(),
  api_data_access_level: z.enum(['full', 'limited', 'restricted']).optional(),
  pii_masking_enabled: z.boolean().optional(),
  isolation_level: z.enum(['standard', 'enhanced', 'strict']).optional(),
  cross_tenant_sharing_enabled: z.boolean().optional(),
  audit_all_access: z.boolean().optional(),
  audit_retention_days: z.number().int().min(30).max(365).optional(),
  alert_on_suspicious_activity: z.boolean().optional(),
  alert_contacts: z.array(z.string().email()).optional(),
  api_rate_limit_per_minute: z.number().int().min(10).max(10000).optional(),
  data_export_rate_limit_per_day: z.number().int().min(1).max(100).optional()
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { tenantId } = c.req.param();
  const updates = c.req.valid('json');

  const policy = await tenantIsolation.updateSecurityPolicy(tenantId, updates);

  return c.json(policy);
});

// ===========================================
// METRICS & SCORING
// ===========================================

/**
 * GET /v1/tenant-isolation/metrics
 * Get isolation metrics for current tenant
 */
router.get('/metrics', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { days } = c.req.valid('query');

  const metrics = await tenantIsolation.getMetrics(tenantId, { days });

  return c.json({ metrics });
});

/**
 * GET /v1/tenant-isolation/metrics/:tenantId
 * Get isolation metrics for specific tenant (admin)
 */
router.get('/metrics/:tenantId', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { tenantId } = c.req.param();
  const { days } = c.req.valid('query');

  const metrics = await tenantIsolation.getMetrics(tenantId, { days });

  return c.json({ metrics });
});

/**
 * GET /v1/tenant-isolation/risk-level
 * Get current risk level
 */
router.get('/risk-level', async (c) => {
  const tenantId = c.get('tenantId');

  const risk = await tenantIsolation.getRiskLevel(tenantId);

  return c.json(risk);
});

/**
 * POST /v1/tenant-isolation/recalculate-score
 * Recalculate security score
 */
router.post('/recalculate-score', async (c) => {
  const tenantId = c.get('tenantId');

  const score = await tenantIsolation.calculateSecurityScore(tenantId);

  return c.json({ security_score: score });
});

// ===========================================
// EVENTS
// ===========================================

/**
 * GET /v1/tenant-isolation/events
 * Get isolation events
 */
router.get('/events', zValidator('query', z.object({
  event_type: z.string().optional(),
  severity: z.enum(['info', 'warning', 'high', 'critical']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const query = c.req.valid('query');

  const result = await tenantIsolation.getEvents({
    tenantId: isAdmin ? null : tenantId,
    eventType: query.event_type,
    severity: query.severity,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    limit: query.limit,
    offset: query.offset
  });

  return c.json(result);
});

/**
 * GET /v1/tenant-isolation/events/:id
 * Get specific event
 */
router.get('/events/:id', async (c) => {
  const { id } = c.req.param();

  const result = await db.query(`
    SELECT
      tie.*,
      st.name as source_tenant_name,
      tt.name as target_tenant_name,
      u.email as user_email
    FROM tenant_isolation_events tie
    LEFT JOIN tenants st ON st.id = tie.source_tenant_id
    LEFT JOIN tenants tt ON tt.id = tie.target_tenant_id
    LEFT JOIN users u ON u.id = tie.user_id
    WHERE tie.id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return c.json({ error: 'Event not found' }, 404);
  }

  return c.json(result.rows[0]);
});

// ===========================================
// ALERTS
// ===========================================

/**
 * GET /v1/tenant-isolation/alerts
 * Get active alerts
 */
router.get('/alerts', zValidator('query', z.object({
  severity: z.enum(['info', 'warning', 'high', 'critical']).optional(),
  limit: z.coerce.number().min(1).max(200).default(100)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const { severity, limit } = c.req.valid('query');

  const alerts = await tenantIsolation.getActiveAlerts(
    isAdmin ? null : tenantId,
    { severity, limit }
  );

  return c.json({ alerts });
});

/**
 * PUT /v1/tenant-isolation/alerts/:id/acknowledge
 * Acknowledge alert
 */
router.put('/alerts/:id/acknowledge', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  await tenantIsolation.acknowledgeAlert(id, userId);

  return c.json({ success: true });
});

/**
 * PUT /v1/tenant-isolation/alerts/:id/resolve
 * Resolve alert
 */
router.put('/alerts/:id/resolve', async (c) => {
  const { id } = c.req.param();

  await tenantIsolation.resolveAlert(id);

  return c.json({ success: true });
});

// ===========================================
// RESOURCE OWNERSHIP
// ===========================================

/**
 * POST /v1/tenant-isolation/resources/register
 * Register resource ownership
 */
router.post('/resources/register', zValidator('json', z.object({
  resource_type: z.string().min(1).max(50),
  resource_id: z.string().uuid()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { resource_type, resource_id } = c.req.valid('json');

  await tenantIsolation.registerResourceOwnership(tenantId, resource_type, resource_id, userId);

  return c.json({ success: true });
});

/**
 * POST /v1/tenant-isolation/resources/share
 * Share resource with another tenant
 */
router.post('/resources/share', zValidator('json', z.object({
  resource_type: z.string().min(1).max(50),
  resource_id: z.string().uuid(),
  target_tenant_id: z.string().uuid()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { resource_type, resource_id, target_tenant_id } = c.req.valid('json');

  // Check policy allows sharing
  const policyCheck = await tenantIsolation.checkPolicyAllows(tenantId, 'cross_tenant_access');
  if (!policyCheck.allowed) {
    return c.json({ error: policyCheck.reason }, 403);
  }

  // Verify ownership
  const hasAccess = await tenantIsolation.verifyResourceAccess(tenantId, resource_type, resource_id);
  if (!hasAccess) {
    return c.json({ error: 'You do not own this resource' }, 403);
  }

  await tenantIsolation.shareResourceWithTenant(resource_type, resource_id, target_tenant_id);

  return c.json({ success: true });
});

/**
 * POST /v1/tenant-isolation/resources/revoke
 * Revoke resource sharing
 */
router.post('/resources/revoke', zValidator('json', z.object({
  resource_type: z.string().min(1).max(50),
  resource_id: z.string().uuid(),
  target_tenant_id: z.string().uuid()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { resource_type, resource_id, target_tenant_id } = c.req.valid('json');

  // Verify ownership
  const hasAccess = await tenantIsolation.verifyResourceAccess(tenantId, resource_type, resource_id);
  if (!hasAccess) {
    return c.json({ error: 'You do not own this resource' }, 403);
  }

  await tenantIsolation.revokeResourceSharing(resource_type, resource_id, target_tenant_id);

  return c.json({ success: true });
});

/**
 * POST /v1/tenant-isolation/resources/verify
 * Verify resource access
 */
router.post('/resources/verify', zValidator('json', z.object({
  resource_type: z.string().min(1).max(50),
  resource_id: z.string().uuid()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { resource_type, resource_id } = c.req.valid('json');

  const hasAccess = await tenantIsolation.verifyResourceAccess(tenantId, resource_type, resource_id);

  return c.json({ has_access: hasAccess });
});

// ===========================================
// DATA ACCESS LOG
// ===========================================

/**
 * GET /v1/tenant-isolation/data-access-log
 * Get data access log
 */
router.get('/data-access-log', zValidator('query', z.object({
  access_type: z.string().optional(),
  resource_type: z.string().optional(),
  contains_pii: z.enum(['true', 'false']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const query = c.req.valid('query');

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (!isAdmin) {
    whereConditions.push(`tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  if (query.access_type) {
    whereConditions.push(`access_type = $${paramIndex++}`);
    params.push(query.access_type);
  }

  if (query.resource_type) {
    whereConditions.push(`resource_type = $${paramIndex++}`);
    params.push(query.resource_type);
  }

  if (query.contains_pii !== undefined) {
    whereConditions.push(`contains_pii = $${paramIndex++}`);
    params.push(query.contains_pii === 'true');
  }

  if (query.date_from) {
    whereConditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.date_from);
  }

  if (query.date_to) {
    whereConditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.date_to);
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  const result = await db.query(`
    SELECT
      dal.*,
      u.email as user_email
    FROM data_access_log dal
    LEFT JOIN users u ON u.id = dal.user_id
    ${whereClause}
    ORDER BY dal.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, query.limit, query.offset]);

  return c.json({ logs: result.rows });
});

// ===========================================
// DASHBOARD
// ===========================================

/**
 * GET /v1/tenant-isolation/dashboard
 * Get isolation dashboard
 */
router.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  const dashboard = await tenantIsolation.getDashboard(isAdmin ? null : tenantId);

  return c.json(dashboard);
});

/**
 * GET /v1/tenant-isolation/at-risk
 * Get tenants at risk (admin only)
 */
router.get('/at-risk', zValidator('query', z.object({
  min_risk_level: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { min_risk_level } = c.req.valid('query');

  const tenants = await tenantIsolation.getTenantsAtRisk(min_risk_level);

  return c.json({ tenants });
});

// ===========================================
// ALL POLICIES (Admin)
// ===========================================

/**
 * GET /v1/tenant-isolation/policies
 * Get all tenant security policies (admin only)
 */
router.get('/policies', zValidator('query', z.object({
  isolation_level: z.enum(['standard', 'enhanced', 'strict']).optional(),
  limit: z.coerce.number().min(1).max(500).default(100)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { isolation_level, limit } = c.req.valid('query');

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (isolation_level) {
    whereConditions.push(`tsp.isolation_level = $${paramIndex++}`);
    params.push(isolation_level);
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  const result = await db.query(`
    SELECT
      tsp.*,
      t.name as tenant_name,
      tim.security_score,
      tim.risk_level
    FROM tenant_security_policies tsp
    JOIN tenants t ON t.id = tsp.tenant_id
    LEFT JOIN tenant_isolation_metrics tim ON tim.tenant_id = tsp.tenant_id AND tim.date = CURRENT_DATE
    ${whereClause}
    ORDER BY tim.security_score ASC NULLS LAST
    LIMIT $${paramIndex}
  `, [...params, limit]);

  return c.json({ policies: result.rows });
});

export default router;
