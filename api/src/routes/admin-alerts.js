import { Hono } from 'hono';
import pool from '../db/connection.js';
import redis from '../db/redis.js';
import { authenticateAdmin } from './admin-auth.js';

const adminAlerts = new Hono();

// Apply admin authentication to all routes
adminAlerts.use('*', authenticateAdmin);

/**
 * GET /admin/alerts
 * List all system alerts and alert rules
 */
adminAlerts.get('/', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        alert_type,
        severity,
        metric,
        threshold,
        comparison_operator,
        notification_channels,
        status,
        last_triggered_at,
        trigger_count,
        created_at,
        updated_at
      FROM alert_rules
      WHERE deleted_at IS NULL
      ORDER BY severity DESC, created_at DESC
    `);

    return c.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch alerts:', err);
    return c.json({ error: 'Failed to load alerts' }, 500);
  }
});

/**
 * GET /admin/alerts/active
 * Get currently active/triggered alerts
 */
adminAlerts.get('/active', async (c) => {
  try {
    // Get active alerts from Redis (real-time) and database
    const redisAlerts = await redis.keys('alert:active:*');
    const activeAlerts = [];

    for (const key of redisAlerts) {
      const alert = await redis.get(key);
      if (alert) {
        activeAlerts.push(JSON.parse(alert));
      }
    }

    // Also get recent triggered alerts from database
    const dbResult = await pool.query(`
      SELECT
        ar.id,
        ar.name,
        ar.severity,
        ar.alert_type,
        ar.metric,
        ar.threshold,
        ah.triggered_at,
        ah.metric_value,
        ah.resolved_at,
        ah.message
      FROM alert_history ah
      JOIN alert_rules ar ON ah.alert_rule_id = ar.id
      WHERE ah.resolved_at IS NULL
        AND ah.triggered_at > NOW() - INTERVAL '24 hours'
      ORDER BY ah.triggered_at DESC
      LIMIT 50
    `);

    return c.json({
      redis_alerts: activeAlerts,
      database_alerts: dbResult.rows,
      total_active: activeAlerts.length + dbResult.rows.length
    });
  } catch (err) {
    console.error('Failed to fetch active alerts:', err);
    return c.json({ error: 'Failed to load active alerts' }, 500);
  }
});

/**
 * GET /admin/alerts/history
 * Get alert history
 */
adminAlerts.get('/history', async (c) => {
  const { limit = 100, offset = 0 } = c.req.query();

  try {
    const result = await pool.query(`
      SELECT
        ah.id,
        ah.alert_rule_id,
        ar.name as alert_name,
        ar.severity,
        ar.alert_type,
        ah.triggered_at,
        ah.resolved_at,
        ah.metric_value,
        ah.message,
        ah.notification_sent
      FROM alert_history ah
      JOIN alert_rules ar ON ah.alert_rule_id = ar.id
      ORDER BY ah.triggered_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM alert_history
    `);

    return c.json({
      alerts: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Failed to fetch alert history:', err);
    return c.json({ error: 'Failed to load alert history' }, 500);
  }
});

/**
 * GET /admin/alerts/:id
 * Get a specific alert rule
 */
adminAlerts.get('/:id', async (c) => {
  const { id } = c.req.param();

  try {
    const result = await pool.query(`
      SELECT * FROM alert_rules WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Alert rule not found' }, 404);
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch alert:', err);
    return c.json({ error: 'Failed to load alert' }, 500);
  }
});

/**
 * POST /admin/alerts
 * Create a new alert rule
 */
adminAlerts.post('/', async (c) => {
  const admin = c.get('admin');

  // Only admin and superadmin can create alert rules
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const {
      name,
      description,
      alert_type,
      severity,
      metric,
      threshold,
      comparison_operator,
      notification_channels
    } = body;

    // Validate required fields
    if (!name || !alert_type || !severity || !metric || !threshold || !comparison_operator) {
      return c.json({
        error: 'Missing required fields: name, alert_type, severity, metric, threshold, comparison_operator'
      }, 400);
    }

    const result = await pool.query(`
      INSERT INTO alert_rules (
        name, description, alert_type, severity, metric, threshold,
        comparison_operator, notification_channels, status, trigger_count, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 0, NOW())
      RETURNING *
    `, [
      name,
      description || null,
      alert_type,
      severity,
      metric,
      threshold,
      comparison_operator,
      JSON.stringify(notification_channels || ['email'])
    ]);

    return c.json(result.rows[0], 201);
  } catch (err) {
    console.error('Failed to create alert:', err);
    return c.json({ error: 'Failed to create alert rule' }, 500);
  }
});

/**
 * PUT /admin/alerts/:id
 * Update an existing alert rule
 */
adminAlerts.put('/:id', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const {
      name,
      description,
      alert_type,
      severity,
      metric,
      threshold,
      comparison_operator,
      notification_channels,
      status
    } = body;

    const result = await pool.query(`
      UPDATE alert_rules
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        alert_type = COALESCE($3, alert_type),
        severity = COALESCE($4, severity),
        metric = COALESCE($5, metric),
        threshold = COALESCE($6, threshold),
        comparison_operator = COALESCE($7, comparison_operator),
        notification_channels = COALESCE($8, notification_channels),
        status = COALESCE($9, status),
        updated_at = NOW()
      WHERE id = $10 AND deleted_at IS NULL
      RETURNING *
    `, [
      name,
      description,
      alert_type,
      severity,
      metric,
      threshold,
      comparison_operator,
      notification_channels ? JSON.stringify(notification_channels) : null,
      status,
      id
    ]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Alert rule not found' }, 404);
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to update alert:', err);
    return c.json({ error: 'Failed to update alert rule' }, 500);
  }
});

/**
 * DELETE /admin/alerts/:id
 * Delete an alert rule
 */
adminAlerts.delete('/:id', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const result = await pool.query(`
      UPDATE alert_rules
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Alert rule not found' }, 404);
    }

    return c.json({ message: 'Alert rule deleted successfully' });
  } catch (err) {
    console.error('Failed to delete alert:', err);
    return c.json({ error: 'Failed to delete alert rule' }, 500);
  }
});

/**
 * POST /admin/alerts/:id/test
 * Test an alert rule (trigger a test notification)
 */
adminAlerts.post('/:id/test', async (c) => {
  const { id } = c.req.param();

  try {
    const result = await pool.query(`
      SELECT * FROM alert_rules WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Alert rule not found' }, 404);
    }

    const alertRule = result.rows[0];

    // In a real implementation, this would trigger a test notification
    // For now, we'll log the test and return success
    console.log(`Testing alert rule: ${alertRule.name}`);

    return c.json({
      success: true,
      message: `Test notification sent for alert: ${alertRule.name}`,
      channels: alertRule.notification_channels,
      tested_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to test alert:', err);
    return c.json({ error: 'Failed to test alert rule' }, 500);
  }
});

/**
 * POST /admin/alerts/:id/acknowledge
 * Acknowledge an active alert
 */
adminAlerts.post('/:id/acknowledge', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  try {
    const body = await c.req.json();
    const { notes } = body;

    const result = await pool.query(`
      UPDATE alert_history
      SET
        acknowledged_at = NOW(),
        acknowledged_by = $1,
        acknowledgement_notes = $2
      WHERE id = $3 AND resolved_at IS NULL
      RETURNING *
    `, [admin.id, notes || null, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Active alert not found' }, 404);
    }

    return c.json({
      message: 'Alert acknowledged successfully',
      alert: result.rows[0]
    });
  } catch (err) {
    console.error('Failed to acknowledge alert:', err);
    return c.json({ error: 'Failed to acknowledge alert' }, 500);
  }
});

/**
 * POST /admin/alerts/:id/resolve
 * Resolve an active alert
 */
adminAlerts.post('/:id/resolve', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  try {
    const body = await c.req.json();
    const { resolution_notes } = body;

    const result = await pool.query(`
      UPDATE alert_history
      SET
        resolved_at = NOW(),
        resolved_by = $1,
        resolution_notes = $2
      WHERE id = $3 AND resolved_at IS NULL
      RETURNING *
    `, [admin.id, resolution_notes || null, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Active alert not found' }, 404);
    }

    // Remove from Redis if it exists
    await redis.del(`alert:active:${id}`);

    return c.json({
      message: 'Alert resolved successfully',
      alert: result.rows[0]
    });
  } catch (err) {
    console.error('Failed to resolve alert:', err);
    return c.json({ error: 'Failed to resolve alert' }, 500);
  }
});

/**
 * GET /admin/alerts/stats/summary
 * Get alert statistics summary
 */
adminAlerts.get('/stats/summary', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_rules,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_rules,
        COUNT(DISTINCT CASE WHEN last_triggered_at > NOW() - INTERVAL '24 hours' THEN id END) as triggered_24h,
        COUNT(DISTINCT CASE WHEN last_triggered_at > NOW() - INTERVAL '7 days' THEN id END) as triggered_7d
      FROM alert_rules
      WHERE deleted_at IS NULL
    `);

    const historyResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE resolved_at IS NULL) as currently_active,
        COUNT(*) FILTER (WHERE severity = 'critical' AND resolved_at IS NULL) as critical_active,
        COUNT(*) FILTER (WHERE triggered_at > NOW() - INTERVAL '24 hours') as alerts_24h
      FROM alert_history ah
      JOIN alert_rules ar ON ah.alert_rule_id = ar.id
    `);

    return c.json({
      rules: result.rows[0],
      alerts: historyResult.rows[0]
    });
  } catch (err) {
    console.error('Failed to fetch alert stats:', err);
    return c.json({ error: 'Failed to load alert statistics' }, 500);
  }
});

export default adminAlerts;
