/**
 * Workforce Management Routes
 * Shift scheduling, time-off, adherence, forecasting
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate, requireRole } from '../middleware/authMiddleware.js';
import wfmService from '../services/wfm.js';

const wfm = new Hono();

// All routes require authentication
wfm.use('*', authenticate);

// =========================================
// SHIFT TEMPLATES
// =========================================

/**
 * POST /wfm/templates
 * Create a shift template (supervisor/admin only)
 */
wfm.post('/templates', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      break_minutes: z.number().int().min(0).max(120).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      is_overnight: z.boolean().optional()
    });

    const validated = schema.parse(body);
    const template = await wfmService.createShiftTemplate(user.tenantId, validated);

    return c.json({
      success: true,
      data: template
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Create template error:', error);
    return c.json({ error: error.message || 'Failed to create template' }, 500);
  }
});

/**
 * GET /wfm/templates
 * List shift templates
 */
wfm.get('/templates', async (c) => {
  try {
    const user = c.get('user');
    const templates = await wfmService.listShiftTemplates(user.tenantId);

    return c.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('[WFM] List templates error:', error);
    return c.json({ error: 'Failed to list templates' }, 500);
  }
});

/**
 * PUT /wfm/templates/:id
 * Update a shift template
 */
wfm.put('/templates/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const templateId = c.req.param('id');
    const body = await c.req.json();

    const template = await wfmService.updateShiftTemplate(templateId, user.tenantId, body);

    return c.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('[WFM] Update template error:', error);
    return c.json({ error: error.message || 'Failed to update template' }, 500);
  }
});

/**
 * DELETE /wfm/templates/:id
 * Delete a shift template
 */
wfm.delete('/templates/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const templateId = c.req.param('id');

    await wfmService.deleteShiftTemplate(templateId, user.tenantId);

    return c.json({
      success: true,
      message: 'Template deleted'
    });
  } catch (error) {
    console.error('[WFM] Delete template error:', error);
    return c.json({ error: error.message || 'Failed to delete template' }, 500);
  }
});

// =========================================
// AGENT AVAILABILITY
// =========================================

/**
 * POST /wfm/availability
 * Set agent availability preferences
 */
wfm.post('/availability', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      agent_id: z.string().uuid().optional(), // Supervisors can set for others
      availability: z.array(z.object({
        day_of_week: z.number().int().min(0).max(6),
        is_available: z.boolean().optional(),
        preferred_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
        preferred_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
        max_hours: z.number().int().min(0).max(24).optional()
      }))
    });

    const validated = schema.parse(body);

    // Only supervisors/admins can set availability for others
    let agentId = user.id;
    if (validated.agent_id && validated.agent_id !== user.id) {
      if (!['admin', 'supervisor'].includes(user.role)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      agentId = validated.agent_id;
    }

    const availability = await wfmService.setAgentAvailability(agentId, user.tenantId, validated.availability);

    return c.json({
      success: true,
      data: availability
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Set availability error:', error);
    return c.json({ error: error.message || 'Failed to set availability' }, 500);
  }
});

/**
 * GET /wfm/availability/:agentId?
 * Get agent availability
 */
wfm.get('/availability/:agentId?', async (c) => {
  try {
    const user = c.get('user');
    const agentId = c.req.param('agentId') || user.id;

    const availability = await wfmService.getAgentAvailability(agentId, user.tenantId);

    return c.json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error('[WFM] Get availability error:', error);
    return c.json({ error: 'Failed to get availability' }, 500);
  }
});

// =========================================
// SCHEDULING
// =========================================

/**
 * POST /wfm/shifts
 * Create a shift
 */
wfm.post('/shifts', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      agent_id: z.string().uuid(),
      shift_template_id: z.string().uuid().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
      break_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
      break_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
      notes: z.string().optional()
    });

    const validated = schema.parse(body);
    const shift = await wfmService.createShift(user.tenantId, validated, user.id);

    return c.json({
      success: true,
      data: shift
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Create shift error:', error);
    return c.json({ error: error.message || 'Failed to create shift' }, 500);
  }
});

/**
 * POST /wfm/shifts/bulk
 * Create multiple shifts at once
 */
wfm.post('/shifts/bulk', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      shifts: z.array(z.object({
        agent_id: z.string().uuid(),
        shift_template_id: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        notes: z.string().optional()
      }))
    });

    const validated = schema.parse(body);
    const results = await wfmService.createBulkShifts(user.tenantId, validated.shifts, user.id);

    return c.json({
      success: true,
      data: results
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Bulk create shifts error:', error);
    return c.json({ error: error.message || 'Failed to create shifts' }, 500);
  }
});

/**
 * GET /wfm/schedule
 * Get schedule for date range
 */
wfm.get('/schedule', async (c) => {
  try {
    const user = c.get('user');
    const { agent_id, start_date, end_date, status } = c.req.query();

    const schedule = await wfmService.getSchedule(user.tenantId, {
      agent_id,
      start_date,
      end_date,
      status
    });

    return c.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error('[WFM] Get schedule error:', error);
    return c.json({ error: 'Failed to get schedule' }, 500);
  }
});

/**
 * GET /wfm/schedule/my
 * Get current user's schedule
 */
wfm.get('/schedule/my', async (c) => {
  try {
    const user = c.get('user');
    const { start_date, end_date } = c.req.query();

    const schedule = await wfmService.getSchedule(user.tenantId, {
      agent_id: user.id,
      start_date: start_date || new Date().toISOString().split('T')[0],
      end_date
    });

    return c.json({
      success: true,
      data: schedule
    });
  } catch (error) {
    console.error('[WFM] Get my schedule error:', error);
    return c.json({ error: 'Failed to get schedule' }, 500);
  }
});

/**
 * PUT /wfm/shifts/:id
 * Update a shift
 */
wfm.put('/shifts/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const shiftId = c.req.param('id');
    const body = await c.req.json();

    const shift = await wfmService.updateShift(shiftId, user.tenantId, body);

    return c.json({
      success: true,
      data: shift
    });
  } catch (error) {
    console.error('[WFM] Update shift error:', error);
    return c.json({ error: error.message || 'Failed to update shift' }, 500);
  }
});

/**
 * DELETE /wfm/shifts/:id
 * Delete a shift
 */
wfm.delete('/shifts/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const shiftId = c.req.param('id');

    await wfmService.deleteShift(shiftId, user.tenantId);

    return c.json({
      success: true,
      message: 'Shift deleted'
    });
  } catch (error) {
    console.error('[WFM] Delete shift error:', error);
    return c.json({ error: error.message || 'Failed to delete shift' }, 500);
  }
});

// =========================================
// AUTO-SCHEDULING
// =========================================

/**
 * POST /wfm/schedule/generate
 * Generate optimal schedule
 */
wfm.post('/schedule/generate', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });

    const validated = schema.parse(body);
    const result = await wfmService.generateSchedule(user.tenantId, validated);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Generate schedule error:', error);
    return c.json({ error: error.message || 'Failed to generate schedule' }, 500);
  }
});

/**
 * POST /wfm/schedule/apply
 * Apply generated schedule
 */
wfm.post('/schedule/apply', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      shifts: z.array(z.object({
        agent_id: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        start_time: z.string(),
        end_time: z.string(),
        shift_template_id: z.string().uuid().optional()
      }))
    });

    const validated = schema.parse(body);
    const result = await wfmService.applyGeneratedSchedule(user.tenantId, validated.shifts, user.id);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Apply schedule error:', error);
    return c.json({ error: error.message || 'Failed to apply schedule' }, 500);
  }
});

// =========================================
// STAFFING REQUIREMENTS
// =========================================

/**
 * POST /wfm/requirements
 * Set staffing requirements
 */
wfm.post('/requirements', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      requirements: z.array(z.object({
        queue_id: z.string().uuid().optional(),
        day_of_week: z.number().int().min(0).max(6),
        interval_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        interval_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        required_agents: z.number().int().min(0),
        minimum_agents: z.number().int().min(0).optional(),
        skill_requirements: z.array(z.string()).optional()
      }))
    });

    const validated = schema.parse(body);
    const requirements = await wfmService.setStaffingRequirements(user.tenantId, validated.requirements);

    return c.json({
      success: true,
      data: requirements
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Set requirements error:', error);
    return c.json({ error: error.message || 'Failed to set requirements' }, 500);
  }
});

/**
 * GET /wfm/requirements
 * Get staffing requirements
 */
wfm.get('/requirements', async (c) => {
  try {
    const user = c.get('user');
    const { queue_id } = c.req.query();

    const requirements = await wfmService.getStaffingRequirements(user.tenantId, queue_id);

    return c.json({
      success: true,
      data: requirements
    });
  } catch (error) {
    console.error('[WFM] Get requirements error:', error);
    return c.json({ error: 'Failed to get requirements' }, 500);
  }
});

// =========================================
// ADHERENCE TRACKING
// =========================================

/**
 * POST /wfm/adherence/event
 * Record an adherence event (clock in/out, break start/end)
 */
wfm.post('/adherence/event', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      agent_id: z.string().uuid().optional(),
      event_type: z.enum(['shift_start', 'shift_end', 'break_start', 'break_end', 'status_change', 'manual_adjustment']),
      actual_time: z.string().datetime().optional(),
      previous_status: z.string().optional(),
      new_status: z.string().optional(),
      notes: z.string().optional()
    });

    const validated = schema.parse(body);

    // Only supervisors can record for others
    let agentId = user.id;
    if (validated.agent_id && validated.agent_id !== user.id) {
      if (!['admin', 'supervisor'].includes(user.role)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      agentId = validated.agent_id;
    }

    const event = await wfmService.recordAdherenceEvent(agentId, user.tenantId, validated.event_type, {
      ...validated,
      recorded_by: validated.agent_id ? user.id : null
    });

    return c.json({
      success: true,
      data: event
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Record adherence error:', error);
    return c.json({ error: error.message || 'Failed to record event' }, 500);
  }
});

/**
 * GET /wfm/adherence/:agentId?
 * Get adherence for an agent
 */
wfm.get('/adherence/:agentId?', async (c) => {
  try {
    const user = c.get('user');
    const agentId = c.req.param('agentId') || user.id;
    const { date } = c.req.query();

    const adherence = await wfmService.getAgentAdherence(agentId, user.tenantId, date);

    return c.json({
      success: true,
      data: adherence
    });
  } catch (error) {
    console.error('[WFM] Get adherence error:', error);
    return c.json({ error: 'Failed to get adherence' }, 500);
  }
});

/**
 * GET /wfm/adherence/team/today
 * Get team adherence for today
 */
wfm.get('/adherence/team/today', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const { date } = c.req.query();

    const adherence = await wfmService.getTeamAdherence(user.tenantId, date);

    return c.json({
      success: true,
      data: adherence
    });
  } catch (error) {
    console.error('[WFM] Get team adherence error:', error);
    return c.json({ error: 'Failed to get team adherence' }, 500);
  }
});

// =========================================
// TIME OFF REQUESTS
// =========================================

/**
 * POST /wfm/time-off
 * Create a time-off request
 */
wfm.post('/time-off', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      request_type: z.enum(['pto', 'sick', 'personal', 'unpaid', 'jury_duty', 'bereavement', 'other']).optional(),
      reason: z.string().optional(),
      hours_requested: z.number().positive().optional()
    });

    const validated = schema.parse(body);
    const result = await wfmService.createTimeOffRequest(user.id, user.tenantId, validated);

    return c.json({
      success: true,
      data: result.request,
      conflicts: result.conflicts
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Create time-off error:', error);
    return c.json({ error: error.message || 'Failed to create request' }, 500);
  }
});

/**
 * GET /wfm/time-off
 * List time-off requests
 */
wfm.get('/time-off', async (c) => {
  try {
    const user = c.get('user');
    const { agent_id, status, start_date, end_date, page = '1', limit = '50' } = c.req.query();

    // Non-supervisors can only see their own
    let filterAgentId = agent_id;
    if (!['admin', 'supervisor'].includes(user.role)) {
      filterAgentId = user.id;
    }

    const result = await wfmService.listTimeOffRequests(user.tenantId, {
      agent_id: filterAgentId,
      status,
      start_date,
      end_date,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.requests,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[WFM] List time-off error:', error);
    return c.json({ error: 'Failed to list requests' }, 500);
  }
});

/**
 * PUT /wfm/time-off/:id/review
 * Review (approve/deny) a time-off request
 */
wfm.put('/time-off/:id/review', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const requestId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      decision: z.enum(['approved', 'denied']),
      notes: z.string().optional()
    });

    const validated = schema.parse(body);
    const request = await wfmService.reviewTimeOffRequest(
      requestId,
      user.tenantId,
      user.id,
      validated.decision,
      validated.notes
    );

    return c.json({
      success: true,
      data: request
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Review time-off error:', error);
    return c.json({ error: error.message || 'Failed to review request' }, 500);
  }
});

/**
 * DELETE /wfm/time-off/:id
 * Cancel a pending time-off request
 */
wfm.delete('/time-off/:id', async (c) => {
  try {
    const user = c.get('user');
    const requestId = c.req.param('id');

    const request = await wfmService.cancelTimeOffRequest(requestId, user.id, user.tenantId);

    return c.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('[WFM] Cancel time-off error:', error);
    return c.json({ error: error.message || 'Failed to cancel request' }, 500);
  }
});

// =========================================
// FORECASTING
// =========================================

/**
 * POST /wfm/forecast/generate
 * Generate call volume forecast
 */
wfm.post('/forecast/generate', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const schema = z.object({
      forecast_days: z.number().int().min(1).max(90).optional(),
      queue_id: z.string().uuid().optional()
    });

    const validated = schema.parse(body);
    const forecast = await wfmService.generateForecast(user.tenantId, validated);

    return c.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Generate forecast error:', error);
    return c.json({ error: error.message || 'Failed to generate forecast' }, 500);
  }
});

/**
 * GET /wfm/forecast
 * Get existing forecast
 */
wfm.get('/forecast', async (c) => {
  try {
    const user = c.get('user');
    const { start_date, end_date, queue_id } = c.req.query();

    const forecast = await wfmService.getForecast(user.tenantId, {
      start_date,
      end_date,
      queue_id
    });

    return c.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    console.error('[WFM] Get forecast error:', error);
    return c.json({ error: 'Failed to get forecast' }, 500);
  }
});

// =========================================
// CONSTRAINTS
// =========================================

/**
 * GET /wfm/constraints
 * Get scheduling constraints
 */
wfm.get('/constraints', async (c) => {
  try {
    const user = c.get('user');
    const constraints = await wfmService.getSchedulingConstraints(user.tenantId);

    return c.json({
      success: true,
      data: constraints
    });
  } catch (error) {
    console.error('[WFM] Get constraints error:', error);
    return c.json({ error: 'Failed to get constraints' }, 500);
  }
});

/**
 * PUT /wfm/constraints
 * Update scheduling constraints
 */
wfm.put('/constraints', requireRole(['admin']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      max_hours_per_week: z.number().int().min(1).max(168).optional(),
      max_hours_per_day: z.number().int().min(1).max(24).optional(),
      min_hours_between_shifts: z.number().int().min(0).max(24).optional(),
      max_consecutive_days: z.number().int().min(1).max(14).optional(),
      min_break_minutes: z.number().int().min(0).max(120).optional(),
      break_after_hours: z.number().min(0).max(12).optional(),
      overtime_threshold_weekly: z.number().int().min(0).optional(),
      overtime_threshold_daily: z.number().int().min(0).optional(),
      allow_split_shifts: z.boolean().optional(),
      allow_overtime_requests: z.boolean().optional(),
      auto_approve_swaps: z.boolean().optional()
    });

    const validated = schema.parse(body);
    const constraints = await wfmService.updateSchedulingConstraints(user.tenantId, validated);

    return c.json({
      success: true,
      data: constraints
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Update constraints error:', error);
    return c.json({ error: error.message || 'Failed to update constraints' }, 500);
  }
});

// =========================================
// SHIFT SWAPS
// =========================================

/**
 * POST /wfm/swaps
 * Request a shift swap
 */
wfm.post('/swaps', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      shift_id: z.string().uuid(),
      target_agent_id: z.string().uuid().optional(),
      notes: z.string().optional()
    });

    const validated = schema.parse(body);
    const swap = await wfmService.requestShiftSwap(
      user.tenantId,
      user.id,
      validated.shift_id,
      validated.target_agent_id,
      validated.notes
    );

    return c.json({
      success: true,
      data: swap
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Create swap error:', error);
    return c.json({ error: error.message || 'Failed to create swap request' }, 500);
  }
});

/**
 * GET /wfm/swaps
 * List swap requests
 */
wfm.get('/swaps', async (c) => {
  try {
    const user = c.get('user');
    const { status, page = '1', limit = '50' } = c.req.query();

    // Non-supervisors only see swaps involving them
    const agentId = ['admin', 'supervisor'].includes(user.role) ? null : user.id;

    const result = await wfmService.listShiftSwaps(user.tenantId, {
      agent_id: agentId,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.swaps,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[WFM] List swaps error:', error);
    return c.json({ error: 'Failed to list swaps' }, 500);
  }
});

/**
 * POST /wfm/swaps/:id/accept
 * Accept a swap request
 */
wfm.post('/swaps/:id/accept', async (c) => {
  try {
    const user = c.get('user');
    const swapId = c.req.param('id');

    const swap = await wfmService.acceptShiftSwap(swapId, user.id, user.tenantId);

    return c.json({
      success: true,
      data: swap
    });
  } catch (error) {
    console.error('[WFM] Accept swap error:', error);
    return c.json({ error: error.message || 'Failed to accept swap' }, 500);
  }
});

/**
 * POST /wfm/swaps/:id/approve
 * Approve an accepted swap (supervisor)
 */
wfm.post('/swaps/:id/approve', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const swapId = c.req.param('id');

    const swap = await wfmService.approveShiftSwap(swapId, user.tenantId, user.id);

    return c.json({
      success: true,
      data: swap
    });
  } catch (error) {
    console.error('[WFM] Approve swap error:', error);
    return c.json({ error: error.message || 'Failed to approve swap' }, 500);
  }
});

// =========================================
// AGENT PREFERENCES
// =========================================

/**
 * POST /wfm/preferences/shifts
 * Set agent shift type preferences
 */
wfm.post('/preferences/shifts', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      morning: z.enum(['preferred', 'acceptable', 'avoid']).optional(),
      day: z.enum(['preferred', 'acceptable', 'avoid']).optional(),
      evening: z.enum(['preferred', 'acceptable', 'avoid']).optional(),
      night: z.enum(['preferred', 'acceptable', 'avoid']).optional(),
      weekend: z.enum(['preferred', 'acceptable', 'avoid']).optional()
    });

    const validated = schema.parse(body);
    const preferences = await wfmService.setAgentShiftPreferences(user.id, user.tenantId, validated);

    return c.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Set shift preferences error:', error);
    return c.json({ error: error.message || 'Failed to set preferences' }, 500);
  }
});

/**
 * GET /wfm/preferences/shifts
 * Get agent shift type preferences
 */
wfm.get('/preferences/shifts', async (c) => {
  try {
    const user = c.get('user');
    const preferences = await wfmService.getAgentShiftPreferences(user.id, user.tenantId);

    return c.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('[WFM] Get shift preferences error:', error);
    return c.json({ error: 'Failed to get preferences' }, 500);
  }
});

/**
 * POST /wfm/preferences/hours
 * Set agent weekly hours preferences
 */
wfm.post('/preferences/hours', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      target: z.number().int().min(8).max(60),
      maximum: z.number().int().min(8).max(60),
      overtimeAvailable: z.boolean().optional()
    });

    const validated = schema.parse(body);
    const preferences = await wfmService.setAgentHoursPreferences(user.id, user.tenantId, validated);

    return c.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Set hours preferences error:', error);
    return c.json({ error: error.message || 'Failed to set preferences' }, 500);
  }
});

/**
 * GET /wfm/preferences/hours
 * Get agent weekly hours preferences
 */
wfm.get('/preferences/hours', async (c) => {
  try {
    const user = c.get('user');
    const preferences = await wfmService.getAgentHoursPreferences(user.id, user.tenantId);

    return c.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('[WFM] Get hours preferences error:', error);
    return c.json({ error: 'Failed to get preferences' }, 500);
  }
});

// =========================================
// SHIFT OFFERS
// =========================================

/**
 * POST /wfm/offers
 * Create a shift offer (give away or trade)
 */
wfm.post('/offers', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      shift_id: z.string().uuid(),
      offer_type: z.enum(['giveaway', 'trade']),
      preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      notes: z.string().optional()
    });

    const validated = schema.parse(body);
    const offer = await wfmService.createShiftOffer(
      user.tenantId,
      user.id,
      validated.shift_id,
      validated.offer_type,
      validated.preferred_date,
      validated.notes
    );

    return c.json({
      success: true,
      data: offer
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[WFM] Create offer error:', error);
    return c.json({ error: error.message || 'Failed to create offer' }, 500);
  }
});

/**
 * GET /wfm/offers
 * List shift offers
 */
wfm.get('/offers', async (c) => {
  try {
    const user = c.get('user');
    const { status = 'open', page = '1', limit = '50' } = c.req.query();

    const result = await wfmService.listShiftOffers(user.tenantId, {
      status,
      exclude_agent_id: user.id, // Don't show own offers
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.offers,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[WFM] List offers error:', error);
    return c.json({ error: 'Failed to list offers' }, 500);
  }
});

/**
 * GET /wfm/offers/my
 * List my shift offers
 */
wfm.get('/offers/my', async (c) => {
  try {
    const user = c.get('user');
    const { status, page = '1', limit = '50' } = c.req.query();

    const result = await wfmService.listShiftOffers(user.tenantId, {
      agent_id: user.id,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.offers,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[WFM] List my offers error:', error);
    return c.json({ error: 'Failed to list offers' }, 500);
  }
});

/**
 * POST /wfm/offers/:id/claim
 * Claim a shift offer
 */
wfm.post('/offers/:id/claim', async (c) => {
  try {
    const user = c.get('user');
    const offerId = c.req.param('id');

    const offer = await wfmService.claimShiftOffer(offerId, user.id, user.tenantId);

    return c.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('[WFM] Claim offer error:', error);
    return c.json({ error: error.message || 'Failed to claim offer' }, 500);
  }
});

/**
 * POST /wfm/offers/:id/approve
 * Approve a claimed shift offer (supervisor)
 */
wfm.post('/offers/:id/approve', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const offerId = c.req.param('id');

    const offer = await wfmService.approveShiftOffer(offerId, user.tenantId, user.id);

    return c.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('[WFM] Approve offer error:', error);
    return c.json({ error: error.message || 'Failed to approve offer' }, 500);
  }
});

/**
 * DELETE /wfm/offers/:id
 * Cancel a shift offer
 */
wfm.delete('/offers/:id', async (c) => {
  try {
    const user = c.get('user');
    const offerId = c.req.param('id');

    await wfmService.cancelShiftOffer(offerId, user.id, user.tenantId);

    return c.json({
      success: true,
      message: 'Offer cancelled'
    });
  } catch (error) {
    console.error('[WFM] Cancel offer error:', error);
    return c.json({ error: error.message || 'Failed to cancel offer' }, 500);
  }
});

/**
 * POST /wfm/swaps/:id/decline
 * Decline a swap request
 */
wfm.post('/swaps/:id/decline', async (c) => {
  try {
    const user = c.get('user');
    const swapId = c.req.param('id');

    const swap = await wfmService.declineShiftSwap(swapId, user.id, user.tenantId);

    return c.json({
      success: true,
      data: swap
    });
  } catch (error) {
    console.error('[WFM] Decline swap error:', error);
    return c.json({ error: error.message || 'Failed to decline swap' }, 500);
  }
});

export default wfm;
