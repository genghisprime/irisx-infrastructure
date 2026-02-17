/**
 * Provider Health Routes
 * API for provider health monitoring and scoring
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import providerHealth from '../services/provider-health.js';
import db from '../db/connection.js';

const router = new Hono();

// ===========================================
// HEALTH SCORES
// ===========================================

/**
 * GET /v1/provider-health/scores
 * Get all provider health scores
 */
router.get('/scores', zValidator('query', z.object({
  status: z.enum(['healthy', 'degraded', 'critical', 'offline']).optional(),
  min_score: z.coerce.number().min(0).max(100).optional(),
  max_score: z.coerce.number().min(0).max(100).optional()
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { status, min_score, max_score } = c.req.valid('query');

  const scores = await providerHealth.getAllHealthScores({
    status,
    minScore: min_score,
    maxScore: max_score
  });

  return c.json({ scores });
});

/**
 * GET /v1/provider-health/scores/:providerId
 * Get health score for specific provider
 */
router.get('/scores/:providerId', async (c) => {
  const { providerId } = c.req.param();

  const score = await providerHealth.getHealthScore(providerId);

  if (!score) {
    return c.json({ error: 'Provider health score not found' }, 404);
  }

  return c.json(score);
});

/**
 * POST /v1/provider-health/scores/:providerId/recalculate
 * Force recalculation of health score
 */
router.post('/scores/:providerId/recalculate', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { providerId } = c.req.param();

  const score = await providerHealth.calculateHealthScore(providerId);

  return c.json(score);
});

// ===========================================
// METRICS
// ===========================================

/**
 * POST /v1/provider-health/metrics
 * Record health metrics
 */
router.post('/metrics', zValidator('json', z.object({
  provider_id: z.string().uuid(),
  metrics: z.array(z.object({
    metric_type: z.enum(['asr', 'acd', 'pdd', 'ner', 'mos', 'latency', 'error_rate', 'capacity']),
    metric_value: z.number(),
    sample_size: z.number().int().min(1).default(1)
  }))
})), async (c) => {
  const { provider_id, metrics } = c.req.valid('json');

  const results = await providerHealth.recordMetrics(provider_id, metrics.map(m => ({
    metricType: m.metric_type,
    metricValue: m.metric_value,
    sampleSize: m.sample_size
  })));

  return c.json({ results });
});

/**
 * POST /v1/provider-health/metrics/call
 * Record metrics from a completed call
 */
router.post('/metrics/call', zValidator('json', z.object({
  provider_id: z.string().uuid(),
  answered: z.boolean(),
  duration: z.number().optional(),
  pdd: z.number().optional(),
  mos: z.number().min(1).max(5).optional(),
  latency: z.number().optional()
})), async (c) => {
  const { provider_id, ...callData } = c.req.valid('json');

  await providerHealth.recordCallMetrics(provider_id, callData);

  return c.json({ success: true });
});

/**
 * GET /v1/provider-health/metrics/:providerId
 * Get recent metrics for a provider
 */
router.get('/metrics/:providerId', zValidator('query', z.object({
  metric_type: z.string().optional(),
  hours: z.coerce.number().min(1).max(168).default(24),
  limit: z.coerce.number().min(1).max(1000).default(100)
})), async (c) => {
  const { providerId } = c.req.param();
  const { metric_type, hours, limit } = c.req.valid('query');

  let query = `
    SELECT * FROM provider_health_metrics
    WHERE provider_id = $1 AND recorded_at > NOW() - ($2 || ' hours')::INTERVAL
  `;
  const params = [providerId, hours];

  if (metric_type) {
    query += ` AND metric_type = $3`;
    params.push(metric_type);
  }

  query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);

  return c.json({ metrics: result.rows });
});

// ===========================================
// ALERTS
// ===========================================

/**
 * GET /v1/provider-health/alerts
 * Get active alerts
 */
router.get('/alerts', zValidator('query', z.object({
  provider_id: z.string().uuid().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  limit: z.coerce.number().min(1).max(500).default(100)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { provider_id, severity, limit } = c.req.valid('query');

  const alerts = await providerHealth.getActiveAlerts(provider_id, { severity, limit });

  return c.json({ alerts });
});

/**
 * PUT /v1/provider-health/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.put('/alerts/:id/acknowledge', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { id } = c.req.param();
  const userId = c.get('userId');

  await providerHealth.acknowledgeAlert(id, userId);

  return c.json({ success: true });
});

/**
 * PUT /v1/provider-health/alerts/:id/resolve
 * Resolve an alert
 */
router.put('/alerts/:id/resolve', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { id } = c.req.param();

  await providerHealth.resolveAlert(id);

  return c.json({ success: true });
});

// ===========================================
// INCIDENTS
// ===========================================

/**
 * GET /v1/provider-health/incidents
 * Get incidents
 */
router.get('/incidents', zValidator('query', z.object({
  provider_id: z.string().uuid().optional(),
  status: z.enum(['open', 'investigating', 'identified', 'monitoring', 'resolved']).optional(),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  limit: z.coerce.number().min(1).max(200).default(50)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { provider_id, status, severity, limit } = c.req.valid('query');

  const incidents = await providerHealth.getIncidents(provider_id, { status, severity, limit });

  return c.json({ incidents });
});

/**
 * POST /v1/provider-health/incidents
 * Create incident
 */
router.post('/incidents', zValidator('json', z.object({
  provider_id: z.string().uuid(),
  incident_type: z.enum(['outage', 'degradation', 'high_error_rate', 'quality_drop', 'capacity_issue']),
  severity: z.enum(['minor', 'major', 'critical']),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  impact: z.string().optional(),
  affected_routes: z.array(z.string()).optional(),
  started_at: z.string().optional()
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const data = c.req.valid('json');

  const incident = await providerHealth.createIncident(data.provider_id, {
    incidentType: data.incident_type,
    severity: data.severity,
    title: data.title,
    description: data.description,
    impact: data.impact,
    affectedRoutes: data.affected_routes,
    startedAt: data.started_at ? new Date(data.started_at) : new Date(),
    autoDetected: false
  });

  return c.json(incident, 201);
});

/**
 * GET /v1/provider-health/incidents/:id
 * Get incident details
 */
router.get('/incidents/:id', async (c) => {
  const { id } = c.req.param();

  const incidentResult = await db.query(`
    SELECT
      pi.*,
      p.name as provider_name
    FROM provider_incidents pi
    LEFT JOIN providers p ON p.id = pi.provider_id
    WHERE pi.id = $1
  `, [id]);

  if (incidentResult.rows.length === 0) {
    return c.json({ error: 'Incident not found' }, 404);
  }

  const updatesResult = await db.query(`
    SELECT * FROM provider_incident_updates
    WHERE incident_id = $1
    ORDER BY created_at ASC
  `, [id]);

  return c.json({
    ...incidentResult.rows[0],
    updates: updatesResult.rows
  });
});

/**
 * PUT /v1/provider-health/incidents/:id/status
 * Update incident status
 */
router.put('/incidents/:id/status', zValidator('json', z.object({
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
  message: z.string().min(1)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { id } = c.req.param();
  const userId = c.get('userId');
  const { status, message } = c.req.valid('json');

  if (status === 'resolved') {
    await providerHealth.resolveIncident(id, message, userId);
  } else {
    await providerHealth.updateIncidentStatus(id, status, message, userId);
  }

  return c.json({ success: true });
});

// ===========================================
// HISTORY & TRENDS
// ===========================================

/**
 * GET /v1/provider-health/history/:providerId
 * Get health history for a provider
 */
router.get('/history/:providerId', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7),
  interval: z.enum(['hour', 'day']).default('hour')
})), async (c) => {
  const { providerId } = c.req.param();
  const { days, interval } = c.req.valid('query');

  const history = await providerHealth.getHealthHistory(providerId, { days, interval });

  return c.json({ history });
});

/**
 * POST /v1/provider-health/snapshot
 * Record health snapshot (cron job)
 */
router.post('/snapshot', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const count = await providerHealth.recordHealthSnapshot();

  return c.json({ recorded: count });
});

// ===========================================
// ROUTE SCORING
// ===========================================

/**
 * GET /v1/provider-health/routes/:routePrefix
 * Get route rankings
 */
router.get('/routes/:routePrefix', async (c) => {
  const { routePrefix } = c.req.param();

  const rankings = await providerHealth.getRouteRankings(routePrefix);

  return c.json({ rankings });
});

/**
 * GET /v1/provider-health/routes/:routePrefix/best
 * Get best provider for route
 */
router.get('/routes/:routePrefix/best', async (c) => {
  const { routePrefix } = c.req.param();

  const bestProvider = await providerHealth.getBestProviderForRoute(routePrefix);

  if (!bestProvider) {
    return c.json({ error: 'No healthy providers for this route' }, 404);
  }

  return c.json(bestProvider);
});

/**
 * POST /v1/provider-health/routes/update
 * Update route score (called after calls)
 */
router.post('/routes/update', zValidator('json', z.object({
  provider_id: z.string().uuid(),
  route_prefix: z.string().min(1).max(20),
  total_calls: z.number().int().min(0),
  successful_calls: z.number().int().min(0),
  asr: z.number().min(0).max(100),
  avg_acd: z.number().optional(),
  avg_pdd: z.number().optional(),
  avg_mos: z.number().min(1).max(5).optional(),
  avg_cost: z.number().optional()
})), async (c) => {
  const data = c.req.valid('json');

  await providerHealth.updateRouteScore(data.provider_id, data.route_prefix, {
    totalCalls: data.total_calls,
    successfulCalls: data.successful_calls,
    asr: data.asr,
    avgAcd: data.avg_acd,
    avgPdd: data.avg_pdd,
    avgMos: data.avg_mos,
    avgCost: data.avg_cost
  });

  return c.json({ success: true });
});

// ===========================================
// THRESHOLDS
// ===========================================

/**
 * GET /v1/provider-health/thresholds
 * Get all thresholds
 */
router.get('/thresholds', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const result = await db.query(`
    SELECT
      pht.*,
      p.name as provider_name
    FROM provider_health_thresholds pht
    LEFT JOIN providers p ON p.id = pht.provider_id
    ORDER BY pht.metric_type, pht.provider_id NULLS FIRST
  `);

  return c.json({ thresholds: result.rows });
});

/**
 * PUT /v1/provider-health/thresholds
 * Set threshold
 */
router.put('/thresholds', zValidator('json', z.object({
  provider_id: z.string().uuid().optional(),
  metric_type: z.enum(['asr', 'acd', 'pdd', 'ner', 'mos', 'latency', 'error_rate', 'capacity']),
  warning_threshold: z.number(),
  critical_threshold: z.number(),
  comparison_operator: z.enum(['lt', 'gt', 'lte', 'gte']).default('lt')
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { provider_id, metric_type, warning_threshold, critical_threshold, comparison_operator } = c.req.valid('json');

  await providerHealth.setThreshold(
    provider_id || null,
    metric_type,
    warning_threshold,
    critical_threshold,
    comparison_operator
  );

  return c.json({ success: true });
});

// ===========================================
// FAILOVER
// ===========================================

/**
 * GET /v1/provider-health/failover/rules
 * Get failover rules
 */
router.get('/failover/rules', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const result = await db.query(`
    SELECT
      pfr.*,
      p.name as primary_provider_name
    FROM provider_failover_rules pfr
    LEFT JOIN providers p ON p.id = pfr.primary_provider_id
    ORDER BY pfr.created_at DESC
  `);

  return c.json({ rules: result.rows });
});

/**
 * POST /v1/provider-health/failover/rules
 * Create failover rule
 */
router.post('/failover/rules', zValidator('json', z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  route_prefix: z.string().optional(),
  primary_provider_id: z.string().uuid(),
  failover_providers: z.array(z.string().uuid()).min(1),
  trigger_conditions: z.record(z.number()).optional(),
  cooldown_minutes: z.number().int().min(1).max(1440).default(15),
  auto_failback: z.boolean().default(true)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const data = c.req.valid('json');

  const result = await db.query(`
    INSERT INTO provider_failover_rules (
      name, description, route_prefix, primary_provider_id, failover_providers,
      trigger_conditions, cooldown_minutes, auto_failback
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    data.name, data.description, data.route_prefix, data.primary_provider_id,
    data.failover_providers, data.trigger_conditions || {}, data.cooldown_minutes, data.auto_failback
  ]);

  return c.json(result.rows[0], 201);
});

/**
 * POST /v1/provider-health/failover/check/:providerId
 * Check if failover should trigger
 */
router.post('/failover/check/:providerId', async (c) => {
  const { providerId } = c.req.param();

  const triggered = await providerHealth.checkFailover(providerId);

  return c.json({
    triggered: triggered !== null,
    rules: triggered || []
  });
});

// ===========================================
// DASHBOARD
// ===========================================

/**
 * GET /v1/provider-health/dashboard
 * Get health dashboard
 */
router.get('/dashboard', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const dashboard = await providerHealth.getDashboard();

  return c.json(dashboard);
});

export default router;
