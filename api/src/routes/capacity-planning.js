/**
 * Capacity Planning & Forecasting API Routes
 *
 * Endpoints for capacity monitoring, forecasting, and scaling recommendations
 */

import { Router } from 'express';
import capacityPlanningService, { RESOURCE_TYPES, FORECAST_HORIZONS } from '../services/capacity-planning.js';

const router = Router();

/**
 * GET /capacity-planning/dashboard
 * Get capacity planning dashboard overview
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await capacityPlanningService.getDashboardData();
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting capacity dashboard:', error);
    res.status(500).json({ error: 'Failed to get capacity dashboard' });
  }
});

/**
 * GET /capacity-planning/status
 * Get current capacity status for all resources
 */
router.get('/status', async (req, res) => {
  try {
    const status = await capacityPlanningService.getCurrentCapacityStatus();
    res.json({ status, resource_types: Object.values(RESOURCE_TYPES) });
  } catch (error) {
    console.error('Error getting capacity status:', error);
    res.status(500).json({ error: 'Failed to get capacity status' });
  }
});

/**
 * GET /capacity-planning/forecast/:resourceType
 * Get capacity forecast for a specific resource
 */
router.get('/forecast/:resourceType', async (req, res) => {
  try {
    const { resourceType } = req.params;
    const { horizon = FORECAST_HORIZONS.MEDIUM } = req.query;

    if (!Object.values(RESOURCE_TYPES).includes(resourceType)) {
      return res.status(400).json({
        error: 'Invalid resource type',
        valid_types: Object.values(RESOURCE_TYPES)
      });
    }

    const forecast = await capacityPlanningService.forecast(resourceType, horizon);
    res.json(forecast);
  } catch (error) {
    console.error('Error getting capacity forecast:', error);
    res.status(500).json({ error: 'Failed to get capacity forecast' });
  }
});

/**
 * GET /capacity-planning/trends/:resourceType
 * Get historical utilization trends
 */
router.get('/trends/:resourceType', async (req, res) => {
  try {
    const { resourceType } = req.params;
    const { days = 30, granularity = 'daily' } = req.query;

    if (!Object.values(RESOURCE_TYPES).includes(resourceType)) {
      return res.status(400).json({
        error: 'Invalid resource type',
        valid_types: Object.values(RESOURCE_TYPES)
      });
    }

    const trends = await capacityPlanningService.getHistoricalTrends(
      resourceType,
      parseInt(days),
      granularity
    );

    res.json(trends);
  } catch (error) {
    console.error('Error getting capacity trends:', error);
    res.status(500).json({ error: 'Failed to get capacity trends' });
  }
});

/**
 * GET /capacity-planning/recommendations
 * Get auto-scaling recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await capacityPlanningService.getAutoScalingRecommendations();
    res.json(recommendations);
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * GET /capacity-planning/cost-projections
 * Get cost projections based on capacity forecasts
 */
router.get('/cost-projections', async (req, res) => {
  try {
    const { horizon = FORECAST_HORIZONS.MEDIUM } = req.query;
    const projections = await capacityPlanningService.getCostProjections(horizon);
    res.json(projections);
  } catch (error) {
    console.error('Error getting cost projections:', error);
    res.status(500).json({ error: 'Failed to get cost projections' });
  }
});

/**
 * GET /capacity-planning/alerts
 * Get capacity alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await capacityPlanningService.checkThresholds();
    res.json({ alerts, count: alerts.length });
  } catch (error) {
    console.error('Error getting capacity alerts:', error);
    res.status(500).json({ error: 'Failed to get capacity alerts' });
  }
});

/**
 * POST /capacity-planning/collect
 * Manually trigger metrics collection
 */
router.post('/collect', async (req, res) => {
  try {
    const result = await capacityPlanningService.collectSystemMetrics();
    res.json(result);
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

/**
 * POST /capacity-planning/metrics
 * Record custom capacity metrics
 */
router.post('/metrics', async (req, res) => {
  try {
    const { metrics } = req.body;

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'Metrics array is required' });
    }

    // Validate metrics
    for (const metric of metrics) {
      if (!metric.resource_type || typeof metric.current_value !== 'number') {
        return res.status(400).json({
          error: 'Each metric must have resource_type and current_value'
        });
      }
    }

    await capacityPlanningService.recordMetrics(metrics);
    res.json({ success: true, recorded: metrics.length });
  } catch (error) {
    console.error('Error recording metrics:', error);
    res.status(500).json({ error: 'Failed to record metrics' });
  }
});

/**
 * POST /capacity-planning/scaling-action
 * Create a scaling action request
 */
router.post('/scaling-action', async (req, res) => {
  try {
    const {
      resource_type,
      action_type,
      new_capacity,
      recommendation_id
    } = req.body;

    if (!resource_type || !action_type || !new_capacity) {
      return res.status(400).json({
        error: 'resource_type, action_type, and new_capacity are required'
      });
    }

    const { pool } = await import('../db.js');

    // Get current capacity
    const currentResult = await pool.query(`
      SELECT current_value FROM capacity_metrics
      WHERE resource_type = $1
      ORDER BY recorded_at DESC
      LIMIT 1
    `, [resource_type]);

    const previousCapacity = currentResult.rows[0]?.current_value || 0;

    // Calculate cost impact (simplified)
    const costPerUnit = {
      database_storage: 0.10,
      s3_storage: 0.023,
      telephony_channels: 50,
      agent_sessions: 10
    };
    const monthlyCostImpact = (new_capacity - previousCapacity) * (costPerUnit[resource_type] || 0);

    const result = await pool.query(`
      INSERT INTO capacity_scaling_actions (
        resource_type, action_type, status, previous_capacity,
        new_capacity, cost_impact_monthly, recommendation_id, created_at
      ) VALUES ($1, $2, 'pending', $3, $4, $5, $6, NOW())
      RETURNING *
    `, [resource_type, action_type, previousCapacity, new_capacity, monthlyCostImpact, recommendation_id]);

    res.status(201).json({ action: result.rows[0] });
  } catch (error) {
    console.error('Error creating scaling action:', error);
    res.status(500).json({ error: 'Failed to create scaling action' });
  }
});

/**
 * GET /capacity-planning/scaling-actions
 * List scaling actions
 */
router.get('/scaling-actions', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    const { pool } = await import('../db.js');

    let query = 'SELECT * FROM capacity_scaling_actions WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)}`;

    const result = await pool.query(query, params);
    res.json({ actions: result.rows });
  } catch (error) {
    console.error('Error listing scaling actions:', error);
    res.status(500).json({ error: 'Failed to list scaling actions' });
  }
});

/**
 * PATCH /capacity-planning/scaling-actions/:id/approve
 * Approve a scaling action
 */
router.patch('/scaling-actions/:id/approve', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    const result = await pool.query(`
      UPDATE capacity_scaling_actions
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [req.admin?.id, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found or already processed' });
    }

    res.json({ action: result.rows[0] });
  } catch (error) {
    console.error('Error approving scaling action:', error);
    res.status(500).json({ error: 'Failed to approve scaling action' });
  }
});

/**
 * PATCH /capacity-planning/scaling-actions/:id/execute
 * Execute an approved scaling action
 */
router.patch('/scaling-actions/:id/execute', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    // Get the action
    const actionResult = await pool.query(
      'SELECT * FROM capacity_scaling_actions WHERE id = $1 AND status = $2',
      [req.params.id, 'approved']
    );

    if (actionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found or not approved' });
    }

    const action = actionResult.rows[0];

    // Mark as executing
    await pool.query(
      'UPDATE capacity_scaling_actions SET status = $1, executed_at = NOW() WHERE id = $2',
      ['executing', req.params.id]
    );

    // In a real implementation, this would trigger actual scaling
    // For now, we simulate success
    console.log(`[Capacity] Would execute scaling: ${action.resource_type} ${action.action_type} to ${action.new_capacity}`);

    // Mark as completed
    await pool.query(
      'UPDATE capacity_scaling_actions SET status = $1, completed_at = NOW() WHERE id = $2',
      ['completed', req.params.id]
    );

    // Record the new capacity as a metric
    await capacityPlanningService.recordMetrics([{
      resource_type: action.resource_type,
      current_value: action.new_capacity,
      max_capacity: action.new_capacity,
      metadata: { scaled_from: action.previous_capacity, action_id: action.id }
    }]);

    res.json({
      success: true,
      action: {
        ...action,
        status: 'completed',
        completed_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error executing scaling action:', error);

    // Mark as failed
    const { pool } = await import('../db.js');
    await pool.query(
      'UPDATE capacity_scaling_actions SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', error.message, req.params.id]
    );

    res.status(500).json({ error: 'Failed to execute scaling action' });
  }
});

/**
 * GET /capacity-planning/resource-types
 * Get list of available resource types
 */
router.get('/resource-types', (req, res) => {
  res.json({
    resource_types: Object.entries(RESOURCE_TYPES).map(([key, value]) => ({
      key,
      value,
      description: getResourceDescription(value)
    })),
    forecast_horizons: Object.entries(FORECAST_HORIZONS).map(([key, value]) => ({
      key,
      value
    }))
  });
});

function getResourceDescription(resourceType) {
  const descriptions = {
    api_requests: 'API requests per minute',
    database_connections: 'Concurrent database connections',
    database_storage: 'Database storage in GB',
    redis_memory: 'Redis cache memory in GB',
    telephony_channels: 'Concurrent telephony channels',
    sip_trunks: 'Total SIP trunk capacity',
    concurrent_calls: 'Concurrent active calls',
    s3_storage: 'S3 storage in GB',
    bandwidth: 'Network bandwidth in Mbps',
    agent_sessions: 'Concurrent agent sessions'
  };
  return descriptions[resourceType] || resourceType;
}

export default router;
