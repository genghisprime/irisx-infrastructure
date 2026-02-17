/**
 * Wallboard Routes
 * REST API endpoints for wallboard data
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate } from '../middleware/authMiddleware.js';
import wallboardService from '../services/wallboard.js';

const wallboard = new Hono();

// All routes require authentication
wallboard.use('*', authenticate);

/**
 * GET /wallboard
 * Get full wallboard data for tenant
 */
wallboard.get('/', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getWallboardData(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting wallboard data:', error);
    return c.json({ error: 'Failed to get wallboard data' }, 500);
  }
});

/**
 * GET /wallboard/queues
 * Get queue overview for wallboard
 */
wallboard.get('/queues', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getQueueOverview(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting queue overview:', error);
    return c.json({ error: 'Failed to get queue overview' }, 500);
  }
});

/**
 * GET /wallboard/agents
 * Get agent overview for wallboard
 */
wallboard.get('/agents', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getAgentOverview(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting agent overview:', error);
    return c.json({ error: 'Failed to get agent overview' }, 500);
  }
});

/**
 * GET /wallboard/calls
 * Get call metrics for wallboard
 */
wallboard.get('/calls', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getCallMetrics(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting call metrics:', error);
    return c.json({ error: 'Failed to get call metrics' }, 500);
  }
});

/**
 * GET /wallboard/sla
 * Get SLA metrics for wallboard
 */
wallboard.get('/sla', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getSLAMetrics(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting SLA metrics:', error);
    return c.json({ error: 'Failed to get SLA metrics' }, 500);
  }
});

/**
 * GET /wallboard/waiting
 * Get longest waiting calls
 */
wallboard.get('/waiting', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids, limit = '10' } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getLongestWaitingCalls(
      tenantId,
      queueIds,
      parseInt(limit)
    );

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting waiting calls:', error);
    return c.json({ error: 'Failed to get waiting calls' }, 500);
  }
});

/**
 * GET /wallboard/alerts
 * Get wallboard alerts
 */
wallboard.get('/alerts', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];

    // Get full data to generate alerts from
    const wallboardData = await wallboardService.getWallboardData(tenantId, queueIds);
    const alerts = wallboardService.generateAlerts(wallboardData);

    return c.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('[Wallboard] Error getting alerts:', error);
    return c.json({ error: 'Failed to get alerts' }, 500);
  }
});

/**
 * GET /wallboard/trends
 * Get historical trend data for charts
 */
wallboard.get('/trends', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids, hours = '12' } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getTrendData(tenantId, queueIds, parseInt(hours));

    return c.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting trend data:', error);
    return c.json({ error: 'Failed to get trend data' }, 500);
  }
});

/**
 * GET /wallboard/snapshot
 * Get quick snapshot for frequent polling
 */
wallboard.get('/snapshot', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user.tenantId;
    const { queue_ids } = c.req.query();

    const queueIds = queue_ids ? queue_ids.split(',') : [];
    const data = await wallboardService.getQuickSnapshot(tenantId, queueIds);

    return c.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[Wallboard] Error getting snapshot:', error);
    return c.json({ error: 'Failed to get snapshot' }, 500);
  }
});

export default wallboard;
