/**
 * Quality Management API Routes
 * Scorecards, evaluations, coaching, and calibration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as qmService from '../services/quality-management.js';

const qualityManagement = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const scorecardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['general', 'sales', 'support', 'compliance']).optional(),
  passing_score: z.number().min(0).max(100).optional(),
  auto_fail_enabled: z.boolean().optional(),
});

const sectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  sort_order: z.number().optional(),
});

const criteriaSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  criteria_type: z.enum(['rating', 'yes_no', 'scale', 'text']).optional(),
  max_points: z.number().min(0).optional(),
  weight: z.number().min(0).optional(),
  is_auto_fail: z.boolean().optional(),
  is_required: z.boolean().optional(),
  guidance_text: z.string().optional(),
  sort_order: z.number().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.number(),
    description: z.string().optional(),
  })).optional(),
});

const evaluationSchema = z.object({
  scorecard_id: z.number(),
  call_id: z.string().optional(),
  agent_id: z.number(),
  evaluation_type: z.enum(['random', 'targeted', 'calibration', 'self']).optional(),
});

const submitEvaluationSchema = z.object({
  responses: z.array(z.object({
    criteria_id: z.number(),
    score: z.number().optional(),
    selected_option_id: z.number().optional(),
    text_response: z.string().optional(),
    notes: z.string().optional(),
  })),
  feedback: z.string().optional(),
});

const coachingSessionSchema = z.object({
  agent_id: z.number(),
  evaluation_id: z.number().optional(),
  session_type: z.enum(['one_on_one', 'group', 'side_by_side']).optional(),
  title: z.string().max(255).optional(),
  focus_areas: z.array(z.string()).optional(),
  scheduled_at: z.string().optional(),
  notes: z.string().optional(),
});

const calibrationSessionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  scorecard_id: z.number().optional(),
  call_id: z.string().optional(),
  scheduled_at: z.string().optional(),
  participant_ids: z.array(z.number()).optional(),
  notes: z.string().optional(),
});

// =============================================================================
// Middleware
// =============================================================================

qualityManagement.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// =============================================================================
// SCORECARDS
// =============================================================================

/**
 * GET /v1/quality/scorecards
 * List all scorecards
 */
qualityManagement.get('/scorecards', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const category = c.req.query('category');
    const active = c.req.query('active') === 'true' ? true : c.req.query('active') === 'false' ? false : undefined;

    const scorecards = await qmService.listScorecards(tenantId, { category, active });

    return c.json({
      success: true,
      scorecards,
    });
  } catch (error) {
    console.error('List scorecards error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/scorecards
 * Create scorecard
 */
qualityManagement.post('/scorecards', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const body = await c.req.json();

    const validation = scorecardSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const scorecard = await qmService.createScorecard(tenantId, validation.data, agentId);

    return c.json({
      success: true,
      scorecard,
    }, 201);
  } catch (error) {
    console.error('Create scorecard error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/quality/scorecards/:id
 * Get scorecard with sections and criteria
 */
qualityManagement.get('/scorecards/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scorecardId = parseInt(c.req.param('id'));

    const scorecard = await qmService.getScorecard(tenantId, scorecardId);

    if (!scorecard) {
      return c.json({ error: 'Scorecard not found' }, 404);
    }

    return c.json({
      success: true,
      scorecard,
    });
  } catch (error) {
    console.error('Get scorecard error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/quality/scorecards/:id
 * Update scorecard
 */
qualityManagement.put('/scorecards/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scorecardId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const scorecard = await qmService.updateScorecard(tenantId, scorecardId, body);

    return c.json({
      success: true,
      scorecard,
    });
  } catch (error) {
    console.error('Update scorecard error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/quality/scorecards/:id
 * Delete scorecard
 */
qualityManagement.delete('/scorecards/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scorecardId = parseInt(c.req.param('id'));

    await qmService.deleteScorecard(tenantId, scorecardId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete scorecard error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// SECTIONS
// =============================================================================

/**
 * POST /v1/quality/scorecards/:id/sections
 * Add section to scorecard
 */
qualityManagement.post('/scorecards/:id/sections', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scorecardId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = sectionSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const section = await qmService.addSection(tenantId, scorecardId, validation.data);

    return c.json({
      success: true,
      section,
    }, 201);
  } catch (error) {
    console.error('Add section error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/quality/sections/:id
 * Update section
 */
qualityManagement.put('/sections/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const sectionId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const section = await qmService.updateSection(tenantId, sectionId, body);

    return c.json({
      success: true,
      section,
    });
  } catch (error) {
    console.error('Update section error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/quality/sections/:id
 * Delete section
 */
qualityManagement.delete('/sections/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const sectionId = parseInt(c.req.param('id'));

    await qmService.deleteSection(tenantId, sectionId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete section error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// CRITERIA
// =============================================================================

/**
 * POST /v1/quality/sections/:id/criteria
 * Add criteria to section
 */
qualityManagement.post('/sections/:id/criteria', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const sectionId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = criteriaSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const criteria = await qmService.addCriteria(tenantId, sectionId, validation.data);

    return c.json({
      success: true,
      criteria,
    }, 201);
  } catch (error) {
    console.error('Add criteria error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/quality/criteria/:id
 * Update criteria
 */
qualityManagement.put('/criteria/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const criteriaId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const criteria = await qmService.updateCriteria(tenantId, criteriaId, body);

    return c.json({
      success: true,
      criteria,
    });
  } catch (error) {
    console.error('Update criteria error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/quality/criteria/:id
 * Delete criteria
 */
qualityManagement.delete('/criteria/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const criteriaId = parseInt(c.req.param('id'));

    await qmService.deleteCriteria(tenantId, criteriaId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete criteria error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// EVALUATIONS
// =============================================================================

/**
 * GET /v1/quality/evaluations
 * List evaluations
 */
qualityManagement.get('/evaluations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.req.query('agent_id') ? parseInt(c.req.query('agent_id')) : undefined;
    const evaluatorId = c.req.query('evaluator_id') ? parseInt(c.req.query('evaluator_id')) : undefined;
    const status = c.req.query('status');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const evaluations = await qmService.listEvaluations(tenantId, {
      agentId, evaluatorId, status, startDate, endDate, limit, offset
    });

    return c.json({
      success: true,
      evaluations,
    });
  } catch (error) {
    console.error('List evaluations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/evaluations
 * Create new evaluation (start evaluating)
 */
qualityManagement.post('/evaluations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const body = await c.req.json();

    const validation = evaluationSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const data = { ...validation.data, evaluator_id: agentId };
    const evaluation = await qmService.createEvaluation(tenantId, data);

    return c.json({
      success: true,
      evaluation,
    }, 201);
  } catch (error) {
    console.error('Create evaluation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/quality/evaluations/:id
 * Get evaluation with responses
 */
qualityManagement.get('/evaluations/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const evaluationId = parseInt(c.req.param('id'));

    const evaluation = await qmService.getEvaluation(tenantId, evaluationId);

    if (!evaluation) {
      return c.json({ error: 'Evaluation not found' }, 404);
    }

    return c.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    console.error('Get evaluation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/evaluations/:id/submit
 * Submit evaluation with scores
 */
qualityManagement.post('/evaluations/:id/submit', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const evaluationId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = submitEvaluationSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const evaluation = await qmService.submitEvaluation(tenantId, evaluationId, validation.data);

    return c.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    console.error('Submit evaluation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/evaluations/:id/dispute
 * Agent disputes evaluation
 */
qualityManagement.post('/evaluations/:id/dispute', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const evaluationId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    if (!body.reason) {
      return c.json({ error: 'Dispute reason required' }, 400);
    }

    const evaluation = await qmService.disputeEvaluation(tenantId, evaluationId, agentId, body.reason);

    if (!evaluation) {
      return c.json({ error: 'Cannot dispute this evaluation' }, 400);
    }

    return c.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    console.error('Dispute evaluation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/evaluations/:id/resolve-dispute
 * Resolve dispute
 */
qualityManagement.post('/evaluations/:id/resolve-dispute', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const evaluationId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    if (!body.status || !['accepted', 'rejected'].includes(body.status)) {
      return c.json({ error: 'Status must be accepted or rejected' }, 400);
    }

    const evaluation = await qmService.resolveDispute(tenantId, evaluationId, agentId, body.status, body.notes || '');

    return c.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// COACHING SESSIONS
// =============================================================================

/**
 * GET /v1/quality/coaching
 * List coaching sessions
 */
qualityManagement.get('/coaching', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.req.query('agent_id') ? parseInt(c.req.query('agent_id')) : undefined;
    const coachId = c.req.query('coach_id') ? parseInt(c.req.query('coach_id')) : undefined;
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const sessions = await qmService.listCoachingSessions(tenantId, {
      agentId, coachId, status, limit, offset
    });

    return c.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('List coaching sessions error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/coaching
 * Create coaching session
 */
qualityManagement.post('/coaching', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const body = await c.req.json();

    const validation = coachingSessionSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const data = { ...validation.data, coach_id: agentId };
    const session = await qmService.createCoachingSession(tenantId, data);

    return c.json({
      success: true,
      session,
    }, 201);
  } catch (error) {
    console.error('Create coaching session error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/quality/coaching/:id
 * Update coaching session
 */
qualityManagement.put('/coaching/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const sessionId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const session = await qmService.updateCoachingSession(tenantId, sessionId, body);

    return c.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Update coaching session error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// CALIBRATION SESSIONS
// =============================================================================

/**
 * GET /v1/quality/calibration
 * List calibration sessions
 */
qualityManagement.get('/calibration', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const sessions = await qmService.listCalibrationSessions(tenantId, { status, limit, offset });

    return c.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('List calibration sessions error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/quality/calibration
 * Create calibration session
 */
qualityManagement.post('/calibration', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const body = await c.req.json();

    const validation = calibrationSessionSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const data = { ...validation.data, facilitator_id: agentId };
    const session = await qmService.createCalibrationSession(tenantId, data);

    return c.json({
      success: true,
      session,
    }, 201);
  } catch (error) {
    console.error('Create calibration session error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * GET /v1/quality/analytics/agent/:agentId
 * Get agent quality stats
 */
qualityManagement.get('/analytics/agent/:agentId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = parseInt(c.req.param('agentId'));
    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end_date') || new Date().toISOString();

    const stats = await qmService.getAgentQualityStats(tenantId, agentId, startDate, endDate);

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Get agent stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/quality/analytics/team
 * Get team quality stats
 */
qualityManagement.get('/analytics/team', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end_date') || new Date().toISOString();

    const stats = await qmService.getTeamQualityStats(tenantId, startDate, endDate);

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Get team stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/quality/analytics/trends
 * Get quality trends
 */
qualityManagement.get('/analytics/trends', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.req.query('agent_id') ? parseInt(c.req.query('agent_id')) : null;
    const period = c.req.query('period') || 'daily';
    const days = parseInt(c.req.query('days') || '30');

    const trends = await qmService.getQualityTrends(tenantId, agentId, period, days);

    return c.json({
      success: true,
      trends,
    });
  } catch (error) {
    console.error('Get trends error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/quality/analytics/criteria/:scorecardId
 * Get criteria performance
 */
qualityManagement.get('/analytics/criteria/:scorecardId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scorecardId = parseInt(c.req.param('scorecardId'));
    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end_date') || new Date().toISOString();

    const performance = await qmService.getCriteriaPerformance(tenantId, scorecardId, startDate, endDate);

    return c.json({
      success: true,
      performance,
    });
  } catch (error) {
    console.error('Get criteria performance error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default qualityManagement;
