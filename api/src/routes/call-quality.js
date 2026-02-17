/**
 * Call Quality Monitoring Routes
 * MOS scoring, RTCP metrics, carrier quality, alerts
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate, requireRole } from '../middleware/authMiddleware.js';
import callQualityService from '../services/call-quality.js';

const callQuality = new Hono();

// All routes require authentication
callQuality.use('*', authenticate);

// =========================================
// CALL QUALITY METRICS
// =========================================

/**
 * POST /call-quality/metrics
 * Store quality metrics for a call (internal/webhook use)
 */
callQuality.post('/metrics', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      call_id: z.string().uuid(),
      jitter_in: z.number().min(0).optional(),
      jitter_out: z.number().min(0).optional(),
      packet_loss_in: z.number().min(0).max(100).optional(),
      packet_loss_out: z.number().min(0).max(100).optional(),
      rtt: z.number().min(0).optional(),
      codec: z.string().optional(),
      packets_sent: z.number().int().min(0).optional(),
      packets_received: z.number().int().min(0).optional(),
      packets_lost: z.number().int().min(0).optional(),
      carrier_id: z.string().uuid().optional(),
      agent_id: z.string().uuid().optional(),
      direction: z.enum(['inbound', 'outbound']).optional(),
    });

    const validated = schema.parse(body);

    // Calculate quality metrics using E-Model
    const metrics = callQualityService.calculateQualityMetrics(validated);

    // Store metrics
    const stored = await callQualityService.storeMetrics(
      validated.call_id,
      user.tenantId,
      metrics,
      {
        carrier_id: validated.carrier_id,
        agent_id: validated.agent_id,
        direction: validated.direction,
      }
    );

    // Check for alerts
    const alerts = await callQualityService.checkAndCreateAlerts(
      validated.call_id,
      user.tenantId,
      metrics
    );

    return c.json({
      success: true,
      data: {
        metrics: stored,
        alerts: alerts.length > 0 ? alerts : null,
      }
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CallQuality] Store metrics error:', error);
    return c.json({ error: error.message || 'Failed to store metrics' }, 500);
  }
});

/**
 * GET /call-quality/calls/:callId
 * Get quality metrics for a specific call
 */
callQuality.get('/calls/:callId', async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');

    const metrics = await callQualityService.getCallMetrics(callId, user.tenantId);
    const summary = await callQualityService.getCallSummary(callId, user.tenantId);
    const alerts = await callQualityService.getCallAlerts(callId, user.tenantId);

    return c.json({
      success: true,
      data: {
        metrics,
        summary,
        alerts,
      }
    });
  } catch (error) {
    console.error('[CallQuality] Get call metrics error:', error);
    return c.json({ error: 'Failed to get call quality' }, 500);
  }
});

/**
 * GET /call-quality/calls/:callId/summary
 * Get quality summary for a call
 */
callQuality.get('/calls/:callId/summary', async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');

    const summary = await callQualityService.getCallSummary(callId, user.tenantId);

    if (!summary) {
      return c.json({ error: 'No quality data for this call' }, 404);
    }

    return c.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[CallQuality] Get summary error:', error);
    return c.json({ error: 'Failed to get quality summary' }, 500);
  }
});

/**
 * POST /call-quality/calls/:callId/finalize
 * Finalize quality summary at end of call
 */
callQuality.post('/calls/:callId/finalize', async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');

    const summary = await callQualityService.updateCallSummary(callId, user.tenantId);

    return c.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[CallQuality] Finalize error:', error);
    return c.json({ error: 'Failed to finalize quality' }, 500);
  }
});

/**
 * GET /call-quality/calls/:callId/diagnostics
 * Get diagnostic analysis for a call
 */
callQuality.get('/calls/:callId/diagnostics', async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');

    const diagnostics = await callQualityService.diagnoseCall(callId, user.tenantId);

    return c.json({
      success: true,
      data: diagnostics
    });
  } catch (error) {
    console.error('[CallQuality] Diagnostics error:', error);
    return c.json({ error: 'Failed to get diagnostics' }, 500);
  }
});

// =========================================
// MOS CALCULATION (Utility)
// =========================================

/**
 * POST /call-quality/calculate-mos
 * Calculate MOS from RTCP metrics (utility endpoint)
 */
callQuality.post('/calculate-mos', async (c) => {
  try {
    const body = await c.req.json();

    const schema = z.object({
      jitter_in: z.number().min(0).default(0),
      jitter_out: z.number().min(0).default(0),
      packet_loss_in: z.number().min(0).max(100).default(0),
      packet_loss_out: z.number().min(0).max(100).default(0),
      rtt: z.number().min(0).default(0),
      codec: z.string().default('PCMU'),
    });

    const validated = schema.parse(body);
    const metrics = callQualityService.calculateQualityMetrics(validated);

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CallQuality] Calculate MOS error:', error);
    return c.json({ error: 'Failed to calculate MOS' }, 500);
  }
});

// =========================================
// ALERTS
// =========================================

/**
 * GET /call-quality/alerts
 * Get unacknowledged quality alerts
 */
callQuality.get('/alerts', async (c) => {
  try {
    const user = c.get('user');
    const { page = '1', limit = '50', severity } = c.req.query();

    const result = await callQualityService.getUnacknowledgedAlerts(user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit),
      severity,
    });

    return c.json({
      success: true,
      data: result.alerts,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[CallQuality] Get alerts error:', error);
    return c.json({ error: 'Failed to get alerts' }, 500);
  }
});

/**
 * POST /call-quality/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
callQuality.post('/alerts/:alertId/acknowledge', async (c) => {
  try {
    const user = c.get('user');
    const alertId = c.req.param('alertId');

    const alert = await callQualityService.acknowledgeAlert(alertId, user.tenantId, user.id);

    return c.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('[CallQuality] Acknowledge error:', error);
    return c.json({ error: error.message || 'Failed to acknowledge alert' }, 500);
  }
});

/**
 * POST /call-quality/calls/:callId/alerts/acknowledge
 * Acknowledge all alerts for a call
 */
callQuality.post('/calls/:callId/alerts/acknowledge', async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');

    const alerts = await callQualityService.acknowledgeCallAlerts(callId, user.tenantId, user.id);

    return c.json({
      success: true,
      data: {
        acknowledged: alerts.length,
        alerts,
      }
    });
  } catch (error) {
    console.error('[CallQuality] Acknowledge call alerts error:', error);
    return c.json({ error: 'Failed to acknowledge alerts' }, 500);
  }
});

// =========================================
// THRESHOLDS
// =========================================

/**
 * GET /call-quality/thresholds
 * Get alert thresholds for tenant
 */
callQuality.get('/thresholds', async (c) => {
  try {
    const user = c.get('user');
    const thresholds = await callQualityService.getAlertThresholds(user.tenantId);

    return c.json({
      success: true,
      data: thresholds
    });
  } catch (error) {
    console.error('[CallQuality] Get thresholds error:', error);
    return c.json({ error: 'Failed to get thresholds' }, 500);
  }
});

/**
 * PUT /call-quality/thresholds
 * Update alert thresholds
 */
callQuality.put('/thresholds', requireRole(['admin']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      warning: z.object({
        mos: z.number().min(1).max(5).optional(),
        jitter: z.number().min(0).optional(),
        packet_loss: z.number().min(0).max(100).optional(),
        latency: z.number().min(0).optional(),
      }).optional(),
      critical: z.object({
        mos: z.number().min(1).max(5).optional(),
        jitter: z.number().min(0).optional(),
        packet_loss: z.number().min(0).max(100).optional(),
        latency: z.number().min(0).optional(),
      }).optional(),
      notifications: z.object({
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        webhook: z.boolean().optional(),
        emails: z.array(z.string().email()).optional(),
      }).optional(),
    });

    const validated = schema.parse(body);
    const thresholds = await callQualityService.updateAlertThresholds(user.tenantId, validated);

    return c.json({
      success: true,
      data: thresholds
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CallQuality] Update thresholds error:', error);
    return c.json({ error: 'Failed to update thresholds' }, 500);
  }
});

// =========================================
// CARRIER QUALITY
// =========================================

/**
 * GET /call-quality/carriers
 * Get carrier quality rankings
 */
callQuality.get('/carriers', async (c) => {
  try {
    const user = c.get('user');
    const { days = '30' } = c.req.query();

    const rankings = await callQualityService.getCarrierRankings(user.tenantId, {
      days: parseInt(days),
    });

    return c.json({
      success: true,
      data: rankings
    });
  } catch (error) {
    console.error('[CallQuality] Get carrier rankings error:', error);
    return c.json({ error: 'Failed to get carrier rankings' }, 500);
  }
});

/**
 * GET /call-quality/carriers/:carrierId/trend
 * Get carrier quality trend
 */
callQuality.get('/carriers/:carrierId/trend', async (c) => {
  try {
    const user = c.get('user');
    const carrierId = c.req.param('carrierId');
    const { days = '30' } = c.req.query();

    const trend = await callQualityService.getCarrierTrend(user.tenantId, carrierId, {
      days: parseInt(days),
    });

    return c.json({
      success: true,
      data: trend
    });
  } catch (error) {
    console.error('[CallQuality] Get carrier trend error:', error);
    return c.json({ error: 'Failed to get carrier trend' }, 500);
  }
});

/**
 * POST /call-quality/carriers/update-scores
 * Manually trigger carrier score update (admin)
 */
callQuality.post('/carriers/update-scores', requireRole(['admin']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const scores = await callQualityService.updateCarrierScores(user.tenantId, body.date);

    return c.json({
      success: true,
      data: {
        updated: scores.length,
        scores,
      }
    });
  } catch (error) {
    console.error('[CallQuality] Update carrier scores error:', error);
    return c.json({ error: 'Failed to update carrier scores' }, 500);
  }
});

// =========================================
// AGENT QUALITY
// =========================================

/**
 * GET /call-quality/agents
 * Get agent quality report
 */
callQuality.get('/agents', async (c) => {
  try {
    const user = c.get('user');
    const { days = '30', agent_id } = c.req.query();

    const report = await callQualityService.getAgentQualityReport(user.tenantId, {
      days: parseInt(days),
      agent_id,
    });

    return c.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[CallQuality] Get agent report error:', error);
    return c.json({ error: 'Failed to get agent report' }, 500);
  }
});

/**
 * POST /call-quality/agents/update-scores
 * Manually trigger agent score update (admin)
 */
callQuality.post('/agents/update-scores', requireRole(['admin']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const scores = await callQualityService.updateAgentScores(user.tenantId, body.date);

    return c.json({
      success: true,
      data: {
        updated: scores.length,
        scores,
      }
    });
  } catch (error) {
    console.error('[CallQuality] Update agent scores error:', error);
    return c.json({ error: 'Failed to update agent scores' }, 500);
  }
});

// =========================================
// ANALYTICS
// =========================================

/**
 * GET /call-quality/overview
 * Get quality overview for tenant
 */
callQuality.get('/overview', async (c) => {
  try {
    const user = c.get('user');
    const { days = '7' } = c.req.query();

    const overview = await callQualityService.getQualityOverview(user.tenantId, {
      days: parseInt(days),
    });

    return c.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('[CallQuality] Get overview error:', error);
    return c.json({ error: 'Failed to get overview' }, 500);
  }
});

/**
 * GET /call-quality/distribution
 * Get quality score distribution
 */
callQuality.get('/distribution', async (c) => {
  try {
    const user = c.get('user');
    const { days = '30' } = c.req.query();

    const distribution = await callQualityService.getQualityDistribution(user.tenantId, {
      days: parseInt(days),
    });

    return c.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('[CallQuality] Get distribution error:', error);
    return c.json({ error: 'Failed to get distribution' }, 500);
  }
});

export default callQuality;
