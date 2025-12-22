/**
 * Anomaly Detection Routes
 * API for anomaly management and configuration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import anomalyDetection from '../services/anomaly-detection.js';

const router = new Hono();

// ===========================================
// ANOMALY ENDPOINTS
// ===========================================

/**
 * GET /v1/anomalies
 * List anomalies
 */
router.get('/', zValidator('query', z.object({
  status: z.enum(['open', 'acknowledged', 'investigating', 'resolved', 'false_positive']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  metric_type: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const query = c.req.valid('query');

  const result = await anomalyDetection.getAnomalies({
    tenantId: isAdmin ? null : tenantId,
    status: query.status,
    severity: query.severity,
    metricType: query.metric_type,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    limit: query.limit,
    offset: query.offset
  });

  return c.json(result);
});

/**
 * GET /v1/anomalies/summary
 * Get anomaly summary/dashboard
 */
router.get('/summary', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(7)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const { days } = c.req.valid('query');

  const summary = await anomalyDetection.getAnomalySummary(
    isAdmin ? null : tenantId,
    days
  );

  return c.json(summary);
});

/**
 * GET /v1/anomalies/:id
 * Get single anomaly
 */
router.get('/:id', async (c) => {
  const { id } = c.req.param();

  const anomaly = await anomalyDetection.getAnomaly(id);

  if (!anomaly) {
    return c.json({ error: 'Anomaly not found' }, 404);
  }

  return c.json(anomaly);
});

/**
 * PUT /v1/anomalies/:id/status
 * Update anomaly status
 */
router.put('/:id/status', zValidator('json', z.object({
  status: z.enum(['acknowledged', 'investigating', 'resolved', 'false_positive']),
  notes: z.string().optional()
})), async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');
  const { status, notes } = c.req.valid('json');

  const anomaly = await anomalyDetection.updateAnomalyStatus(id, status, userId, notes);

  return c.json(anomaly);
});

// ===========================================
// RULES ENDPOINTS
// ===========================================

/**
 * GET /v1/anomalies/rules
 * List anomaly detection rules
 */
router.get('/rules', async (c) => {
  const tenantId = c.get('tenantId');

  const rules = await anomalyDetection.getRules(tenantId);

  return c.json({ rules });
});

/**
 * POST /v1/anomalies/rules
 * Create anomaly detection rule
 */
router.post('/rules', zValidator('json', z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['usage', 'security', 'billing', 'performance', 'quality']),
  detection_method: z.enum(['zscore', 'iqr', 'threshold']).default('zscore'),
  metric_type: z.string().min(1),
  threshold_type: z.enum(['static', 'dynamic']).default('dynamic'),
  static_threshold: z.number().optional(),
  zscore_threshold: z.number().min(0).max(10).default(3.0),
  iqr_multiplier: z.number().min(0).max(5).default(1.5),
  comparison_period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  lookback_periods: z.number().min(1).max(90).default(30),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  cooldown_minutes: z.number().min(1).max(1440).default(60),
  notify_channels: z.array(z.string()).default(['email']),
  is_active: z.boolean().default(true)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  const rule = await anomalyDetection.upsertRule({
    ...data,
    tenantId,
    detectionMethod: data.detection_method,
    metricType: data.metric_type,
    thresholdType: data.threshold_type,
    staticThreshold: data.static_threshold,
    zscoreThreshold: data.zscore_threshold,
    iqrMultiplier: data.iqr_multiplier,
    comparisonPeriod: data.comparison_period,
    lookbackPeriods: data.lookback_periods,
    cooldownMinutes: data.cooldown_minutes,
    notifyChannels: data.notify_channels,
    isActive: data.is_active
  });

  return c.json(rule, 201);
});

/**
 * PUT /v1/anomalies/rules/:id
 * Update anomaly detection rule
 */
router.put('/rules/:id', zValidator('json', z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.enum(['usage', 'security', 'billing', 'performance', 'quality']).optional(),
  detection_method: z.enum(['zscore', 'iqr', 'threshold']).optional(),
  metric_type: z.string().optional(),
  threshold_type: z.enum(['static', 'dynamic']).optional(),
  static_threshold: z.number().optional(),
  zscore_threshold: z.number().min(0).max(10).optional(),
  iqr_multiplier: z.number().min(0).max(5).optional(),
  comparison_period: z.enum(['hour', 'day', 'week', 'month']).optional(),
  lookback_periods: z.number().min(1).max(90).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  cooldown_minutes: z.number().min(1).max(1440).optional(),
  notify_channels: z.array(z.string()).optional(),
  is_active: z.boolean().optional()
})), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid('json');

  const rule = await anomalyDetection.upsertRule({
    id,
    ...data,
    detectionMethod: data.detection_method,
    metricType: data.metric_type,
    thresholdType: data.threshold_type,
    staticThreshold: data.static_threshold,
    zscoreThreshold: data.zscore_threshold,
    iqrMultiplier: data.iqr_multiplier,
    comparisonPeriod: data.comparison_period,
    lookbackPeriods: data.lookback_periods,
    cooldownMinutes: data.cooldown_minutes,
    notifyChannels: data.notify_channels,
    isActive: data.is_active
  });

  return c.json(rule);
});

/**
 * DELETE /v1/anomalies/rules/:id
 * Delete anomaly detection rule
 */
router.delete('/rules/:id', async (c) => {
  const { id } = c.req.param();

  await db.query(`DELETE FROM anomaly_rules WHERE id = $1`, [id]);

  return c.json({ success: true });
});

// ===========================================
// METRIC ENDPOINTS
// ===========================================

/**
 * POST /v1/anomalies/metrics
 * Record a custom metric
 */
router.post('/metrics', zValidator('json', z.object({
  metric_type: z.string().min(1),
  metric_value: z.number(),
  dimension: z.string().optional(),
  dimension_value: z.string().optional(),
  timestamp: z.string().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { metric_type, metric_value, dimension, dimension_value, timestamp } = c.req.valid('json');

  await anomalyDetection.recordMetric({
    tenantId,
    metricType: metric_type,
    metricValue: metric_value,
    dimension,
    dimensionValue: dimension_value,
    timestamp: timestamp ? new Date(timestamp) : new Date()
  });

  return c.json({ success: true });
});

/**
 * POST /v1/anomalies/collect
 * Trigger metric collection (admin/cron)
 */
router.post('/collect', async (c) => {
  const isAdmin = c.get('isAdmin');
  const tenantId = c.get('tenantId');

  const body = await c.req.json().catch(() => ({}));
  const targetTenant = body.tenant_id || tenantId;

  if (!isAdmin && targetTenant !== tenantId) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const metrics = await anomalyDetection.collectTenantMetrics(targetTenant);

  return c.json({ metrics, collected: metrics.length });
});

/**
 * GET /v1/anomalies/baselines
 * Get metric baselines
 */
router.get('/baselines', zValidator('query', z.object({
  metric_type: z.string().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { metric_type } = c.req.valid('query');

  let whereConditions = ['tenant_id = $1'];
  let params = [tenantId];

  if (metric_type) {
    whereConditions.push('metric_type = $2');
    params.push(metric_type);
  }

  const result = await db.query(`
    SELECT * FROM metric_baselines
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY metric_type, period_type
  `, params);

  return c.json({ baselines: result.rows });
});

// ===========================================
// REMEDIATION ENDPOINTS
// ===========================================

/**
 * GET /v1/anomalies/remediations
 * List remediation executions
 */
router.get('/remediations', zValidator('query', z.object({
  status: z.enum(['pending', 'approved', 'executed', 'failed', 'rejected']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');
  const { status, limit } = c.req.valid('query');

  let whereConditions = [];
  let params = [];
  let paramIndex = 1;

  if (!isAdmin) {
    whereConditions.push(`tenant_id = $${paramIndex++}`);
    params.push(tenantId);
  }

  if (status) {
    whereConditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  const result = await db.query(`
    SELECT
      re.*,
      rr.name as rule_name,
      a.description as anomaly_description
    FROM remediation_executions re
    JOIN remediation_rules rr ON rr.id = re.rule_id
    JOIN anomalies a ON a.id = re.anomaly_id
    ${whereClause}
    ORDER BY re.created_at DESC
    LIMIT $${paramIndex}
  `, [...params, limit]);

  return c.json({ remediations: result.rows });
});

/**
 * PUT /v1/anomalies/remediations/:id/approve
 * Approve remediation execution
 */
router.put('/remediations/:id/approve', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  await db.query(`
    UPDATE remediation_executions
    SET status = 'approved', approved_by = $2, approved_at = NOW()
    WHERE id = $1 AND status = 'pending'
  `, [id, userId]);

  return c.json({ success: true });
});

/**
 * PUT /v1/anomalies/remediations/:id/reject
 * Reject remediation execution
 */
router.put('/remediations/:id/reject', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  await db.query(`
    UPDATE remediation_executions
    SET status = 'rejected', approved_by = $2, approved_at = NOW()
    WHERE id = $1 AND status = 'pending'
  `, [id, userId]);

  return c.json({ success: true });
});

// Import db for direct queries
import db from '../db.js';

export default router;
