/**
 * Callback Queue API Routes
 * Customer callback request management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as callbackService from '../services/callback-queue.js';

const callbacks = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const createCallbackSchema = z.object({
  contact_id: z.number().optional(),
  phone_number: z.string().min(10).max(20),
  caller_name: z.string().max(255).optional(),
  queue_id: z.number().optional(),
  original_call_id: z.string().max(100).optional(),
  reason: z.string().optional(),
  priority: z.number().min(1).max(100).optional(),
  requested_time: z.string().datetime().optional(),
  time_zone: z.string().max(50).optional(),
  preferred_time_start: z.string().optional(),
  preferred_time_end: z.string().optional(),
  max_attempts: z.number().min(1).max(10).optional(),
  source: z.enum(['ivr', 'web', 'api', 'sms', 'agent']).optional(),
  external_id: z.string().max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateCallbackSchema = z.object({
  scheduled_time: z.string().datetime().optional(),
  status: z.enum(['pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.number().min(1).max(100).optional(),
  assigned_agent_id: z.number().optional(),
  reason: z.string().optional(),
  preferred_time_start: z.string().optional(),
  preferred_time_end: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const recordAttemptSchema = z.object({
  agent_id: z.number().optional(),
  outcome: z.enum(['answered', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled']),
  call_id: z.string().max(100).optional(),
  duration_seconds: z.number().optional(),
  notes: z.string().optional(),
});

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  queue_id: z.number().optional(),
  schedule_type: z.enum(['weekly', 'daily', 'custom']).optional(),
  time_zone: z.string().max(50).optional(),
  weekly_schedule: z.array(z.object({
    day: z.number().min(0).max(6),
    start: z.string(),
    end: z.string(),
    slots_per_hour: z.number().optional(),
  })).optional(),
  max_concurrent_callbacks: z.number().min(1).max(100).optional(),
  slot_duration_minutes: z.number().min(5).max(120).optional(),
  buffer_minutes: z.number().min(0).max(60).optional(),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  queue_id: z.number().optional(),
  conditions: z.record(z.any()).optional(),
  auto_offer_callback: z.boolean().optional(),
  callback_priority_boost: z.number().optional(),
  max_scheduled_ahead_hours: z.number().optional(),
  min_retry_interval_minutes: z.number().optional(),
  offer_message: z.string().optional(),
  confirmation_sms_template: z.string().optional(),
  reminder_sms_template: z.string().optional(),
  reminder_minutes_before: z.number().optional(),
  priority: z.number().optional(),
});

// =============================================================================
// Middleware
// =============================================================================

callbacks.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// =============================================================================
// CALLBACK REQUEST ROUTES
// =============================================================================

/**
 * GET /v1/callbacks
 * List callback requests
 */
callbacks.get('/', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const status = c.req.query('status');
    const queue_id = c.req.query('queue_id');
    const agent_id = c.req.query('agent_id');
    const phone_number = c.req.query('phone_number');
    const from_date = c.req.query('from_date');
    const to_date = c.req.query('to_date');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const { callbacks: callbackList, total } = await callbackService.getCallbackRequests(tenantId, {
      status: status ? status.split(',') : undefined,
      queue_id: queue_id ? parseInt(queue_id) : undefined,
      agent_id: agent_id ? parseInt(agent_id) : undefined,
      phone_number,
      from_date,
      to_date,
      limit,
      offset,
    });

    return c.json({
      success: true,
      callbacks: callbackList,
      total,
      pagination: { limit, offset, hasMore: offset + callbackList.length < total },
    });
  } catch (error) {
    console.error('Get callbacks error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks
 * Create a callback request
 */
callbacks.post('/', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = createCallbackSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const callback = await callbackService.createCallbackRequest(tenantId, validation.data);

    return c.json({
      success: true,
      callback,
    }, 201);
  } catch (error) {
    console.error('Create callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/callbacks/next
 * Get next callbacks to process (for dialer/agent)
 */
callbacks.get('/next', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const limit = parseInt(c.req.query('limit') || '10');

    const nextCallbacks = await callbackService.getNextCallbacks(tenantId, limit);

    return c.json({
      success: true,
      callbacks: nextCallbacks,
    });
  } catch (error) {
    console.error('Get next callbacks error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/callbacks/stats
 * Get callback statistics
 */
callbacks.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const queue_id = c.req.query('queue_id');
    const from_date = c.req.query('from_date');
    const to_date = c.req.query('to_date');

    const stats = await callbackService.getCallbackStats(tenantId, {
      queue_id: queue_id ? parseInt(queue_id) : undefined,
      from_date,
      to_date,
    });

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Get callback stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/callbacks/:id
 * Get a specific callback request
 */
callbacks.get('/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const callbackId = parseInt(c.req.param('id'));

    const callback = await callbackService.getCallbackRequest(tenantId, callbackId);

    if (!callback) {
      return c.json({ error: 'Callback not found' }, 404);
    }

    // Get attempts history
    const attempts = await callbackService.getCallbackAttempts(callbackId);

    return c.json({
      success: true,
      callback,
      attempts,
    });
  } catch (error) {
    console.error('Get callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/callbacks/:id
 * Update a callback request
 */
callbacks.put('/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const callbackId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = updateCallbackSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const callback = await callbackService.updateCallbackRequest(tenantId, callbackId, validation.data);

    if (!callback) {
      return c.json({ error: 'Callback not found' }, 404);
    }

    return c.json({
      success: true,
      callback,
    });
  } catch (error) {
    console.error('Update callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/:id/cancel
 * Cancel a callback request
 */
callbacks.post('/:id/cancel', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const callbackId = parseInt(c.req.param('id'));
    const { reason } = await c.req.json().catch(() => ({}));

    const callback = await callbackService.cancelCallback(tenantId, callbackId, reason);

    if (!callback) {
      return c.json({ error: 'Callback not found or already completed' }, 404);
    }

    return c.json({
      success: true,
      callback,
    });
  } catch (error) {
    console.error('Cancel callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/:id/reschedule
 * Reschedule a callback
 */
callbacks.post('/:id/reschedule', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const callbackId = parseInt(c.req.param('id'));
    const { scheduled_time } = await c.req.json();

    if (!scheduled_time) {
      return c.json({ error: 'scheduled_time is required' }, 400);
    }

    const callback = await callbackService.rescheduleCallback(tenantId, callbackId, scheduled_time);

    if (!callback) {
      return c.json({ error: 'Callback not found or cannot be rescheduled' }, 404);
    }

    return c.json({
      success: true,
      callback,
    });
  } catch (error) {
    console.error('Reschedule callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/:id/assign
 * Assign callback to an agent
 */
callbacks.post('/:id/assign', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const callbackId = parseInt(c.req.param('id'));
    const { agent_id } = await c.req.json();

    if (!agent_id) {
      return c.json({ error: 'agent_id is required' }, 400);
    }

    const callback = await callbackService.assignCallback(tenantId, callbackId, agent_id);

    if (!callback) {
      return c.json({ error: 'Callback not found or already in progress' }, 404);
    }

    return c.json({
      success: true,
      callback,
    });
  } catch (error) {
    console.error('Assign callback error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/:id/attempt
 * Record a callback attempt
 */
callbacks.post('/:id/attempt', async (c) => {
  try {
    const callbackId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = recordAttemptSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const callback = await callbackService.recordCallbackAttempt(callbackId, validation.data);

    return c.json({
      success: true,
      callback,
    });
  } catch (error) {
    console.error('Record attempt error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// SCHEDULE ROUTES
// =============================================================================

/**
 * GET /v1/callbacks/schedules
 * Get callback schedules
 */
callbacks.get('/schedules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const queue_id = c.req.query('queue_id');

    const schedules = await callbackService.getCallbackSchedules(
      tenantId,
      queue_id ? parseInt(queue_id) : null
    );

    return c.json({
      success: true,
      schedules,
    });
  } catch (error) {
    console.error('Get schedules error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/schedules
 * Create a callback schedule
 */
callbacks.post('/schedules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = createScheduleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const schedule = await callbackService.createCallbackSchedule(tenantId, validation.data);

    return c.json({
      success: true,
      schedule,
    }, 201);
  } catch (error) {
    console.error('Create schedule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/callbacks/schedules/:id
 * Update a callback schedule
 */
callbacks.put('/schedules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scheduleId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const schedule = await callbackService.updateCallbackSchedule(tenantId, scheduleId, body);

    if (!schedule) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    return c.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('Update schedule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/callbacks/schedules/:id
 * Delete a callback schedule
 */
callbacks.delete('/schedules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scheduleId = parseInt(c.req.param('id'));

    const deleted = await callbackService.deleteCallbackSchedule(tenantId, scheduleId);

    if (!deleted) {
      return c.json({ error: 'Schedule not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete schedule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/schedules/:id/generate-slots
 * Generate callback slots for a schedule
 */
callbacks.post('/schedules/:id/generate-slots', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const scheduleId = parseInt(c.req.param('id'));
    const { start_date, days = 7 } = await c.req.json().catch(() => ({}));

    const startDate = start_date ? new Date(start_date) : new Date();
    const slotsGenerated = await callbackService.generateSlots(tenantId, scheduleId, startDate, days);

    return c.json({
      success: true,
      slots_generated: slotsGenerated,
    });
  } catch (error) {
    console.error('Generate slots error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// SLOTS ROUTES
// =============================================================================

/**
 * GET /v1/callbacks/slots
 * Get available callback slots
 */
callbacks.get('/slots', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const queue_id = c.req.query('queue_id');
    const start_date = c.req.query('start_date') || new Date().toISOString();
    const end_date = c.req.query('end_date');
    const limit = parseInt(c.req.query('limit') || '20');

    // Default end date to 7 days from start
    const endDate = end_date || new Date(new Date(start_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const slots = await callbackService.getAvailableSlots(
      tenantId,
      queue_id ? parseInt(queue_id) : null,
      start_date,
      endDate,
      limit
    );

    return c.json({
      success: true,
      slots,
    });
  } catch (error) {
    console.error('Get slots error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/callbacks/slots/next
 * Get next available slot
 */
callbacks.get('/slots/next', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const queue_id = c.req.query('queue_id');
    const after = c.req.query('after');

    const slot = await callbackService.findNextAvailableSlot(
      tenantId,
      queue_id ? parseInt(queue_id) : null,
      after ? new Date(after) : null
    );

    return c.json({
      success: true,
      slot,
    });
  } catch (error) {
    console.error('Get next slot error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// RULES ROUTES
// =============================================================================

/**
 * GET /v1/callbacks/rules
 * Get callback rules
 */
callbacks.get('/rules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const queue_id = c.req.query('queue_id');

    const rules = await callbackService.getCallbackRules(
      tenantId,
      queue_id ? parseInt(queue_id) : undefined
    );

    return c.json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error('Get rules error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/callbacks/rules
 * Create a callback rule
 */
callbacks.post('/rules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = createRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const rule = await callbackService.createCallbackRule(tenantId, validation.data);

    return c.json({
      success: true,
      rule,
    }, 201);
  } catch (error) {
    console.error('Create rule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/callbacks/rules/:id
 * Update a callback rule
 */
callbacks.put('/rules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const rule = await callbackService.updateCallbackRule(tenantId, ruleId, body);

    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    return c.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('Update rule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/callbacks/rules/:id
 * Delete a callback rule
 */
callbacks.delete('/rules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = parseInt(c.req.param('id'));

    const deleted = await callbackService.deleteCallbackRule(tenantId, ruleId);

    if (!deleted) {
      return c.json({ error: 'Rule not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete rule error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default callbacks;
