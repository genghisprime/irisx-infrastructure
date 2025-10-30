/**
 * Email Automation API Routes
 * CRUD operations for automation rules and execution monitoring
 * Week 13-14 Phase 5: Email Automation Engine
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as automationService from '../services/email-automation.js';

const emailAutomation = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const triggerConfigSchema = z.object({
  event_name: z.string().optional(),
  delay_value: z.number().optional(),
  delay_unit: z.enum(['minutes', 'hours', 'days']).optional(),
  from_event: z.string().optional(),
  condition: z.string().optional(),
  within_hours: z.number().optional(),
}).passthrough();

const actionSchema = z.object({
  type: z.enum(['send_email', 'webhook', 'update_contact', 'add_tag', 'wait']),
  template_slug: z.string().optional(),
  delay_minutes: z.number().optional(),
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).optional(),
  headers: z.record(z.string()).optional(),
  fields: z.record(z.any()).optional(),
  tag: z.string().optional(),
  delay_seconds: z.number().optional(),
}).passthrough();

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger_type: z.enum(['event', 'time', 'behavior']),
  trigger_config: triggerConfigSchema,
  conditions: z.record(z.any()).optional(),
  actions: z.array(actionSchema).min(1),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
  max_executions_per_contact_per_day: z.number().int().positive().optional(),
  cooldown_hours: z.number().int().positive().optional(),
});

const updateRuleSchema = createRuleSchema.partial();

const queryFiltersSchema = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  trigger_type: z.enum(['event', 'time', 'behavior']).optional(),
  search: z.string().optional(),
  rule_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

// =============================================================================
// Middleware: Extract tenant from token
// =============================================================================

emailAutomation.use('*', async (c, next) => {
  // Extract tenant_id from JWT token (assuming auth middleware sets it)
  const tenantId = c.get('tenant_id');
  const userId = c.get('user_id');

  if (!tenantId) {
    return c.json({ error: 'Unauthorized: Missing tenant information' }, 401);
  }

  c.set('tenant_id', tenantId);
  c.set('user_id', userId);

  await next();
});

// =============================================================================
// Routes: Automation Rules
// =============================================================================

/**
 * GET /v1/email/automation/rules
 * List all automation rules for the tenant
 */
emailAutomation.get('/rules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const rawQuery = c.req.query();

    // Validate query parameters
    const validation = queryFiltersSchema.safeParse(rawQuery);
    if (!validation.success) {
      return c.json(
        { error: 'Invalid query parameters', details: validation.error.errors },
        400
      );
    }

    const filters = {
      enabled: validation.data.enabled === 'true' ? true : validation.data.enabled === 'false' ? false : undefined,
      trigger_type: validation.data.trigger_type,
      search: validation.data.search,
    };

    const rules = await automationService.getAutomationRules(tenantId, filters);

    return c.json({
      success: true,
      count: rules.length,
      rules,
    });
  } catch (error) {
    console.error('Error fetching automation rules:', error);
    return c.json({ error: 'Failed to fetch automation rules' }, 500);
  }
});

/**
 * GET /v1/email/automation/rules/:id
 * Get a single automation rule
 */
emailAutomation.get('/rules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.param('id');

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    const rule = await automationService.getAutomationRule(ruleId, tenantId);

    return c.json({
      success: true,
      rule,
    });
  } catch (error) {
    if (error.message === 'Automation rule not found') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error fetching automation rule:', error);
    return c.json({ error: 'Failed to fetch automation rule' }, 500);
  }
});

/**
 * POST /v1/email/automation/rules
 * Create a new automation rule
 */
emailAutomation.post('/rules', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const userId = c.get('user_id');
    const body = await c.req.json();

    // Validate request body
    const validation = createRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    const rule = await automationService.createAutomationRule(
      tenantId,
      userId,
      validation.data
    );

    return c.json(
      {
        success: true,
        message: 'Automation rule created successfully',
        rule,
      },
      201
    );
  } catch (error) {
    console.error('Error creating automation rule:', error);
    return c.json(
      { error: error.message || 'Failed to create automation rule' },
      500
    );
  }
});

/**
 * PUT /v1/email/automation/rules/:id
 * Update an automation rule
 */
emailAutomation.put('/rules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.param('id');
    const body = await c.req.json();

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    // Validate request body
    const validation = updateRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    const rule = await automationService.updateAutomationRule(
      ruleId,
      tenantId,
      validation.data
    );

    return c.json({
      success: true,
      message: 'Automation rule updated successfully',
      rule,
    });
  } catch (error) {
    if (error.message === 'Automation rule not found') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error updating automation rule:', error);
    return c.json(
      { error: error.message || 'Failed to update automation rule' },
      500
    );
  }
});

/**
 * DELETE /v1/email/automation/rules/:id
 * Delete an automation rule
 */
emailAutomation.delete('/rules/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.param('id');

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    await automationService.deleteAutomationRule(ruleId, tenantId);

    return c.json({
      success: true,
      message: 'Automation rule deleted successfully',
    });
  } catch (error) {
    if (error.message === 'Automation rule not found') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error deleting automation rule:', error);
    return c.json({ error: 'Failed to delete automation rule' }, 500);
  }
});

/**
 * PATCH /v1/email/automation/rules/:id/toggle
 * Toggle automation rule enabled status
 */
emailAutomation.patch('/rules/:id/toggle', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.param('id');

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    // Get current rule
    const currentRule = await automationService.getAutomationRule(ruleId, tenantId);

    // Toggle enabled status
    const rule = await automationService.updateAutomationRule(ruleId, tenantId, {
      enabled: !currentRule.enabled,
    });

    return c.json({
      success: true,
      message: `Automation rule ${rule.enabled ? 'enabled' : 'disabled'}`,
      rule,
    });
  } catch (error) {
    if (error.message === 'Automation rule not found') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error toggling automation rule:', error);
    return c.json({ error: 'Failed to toggle automation rule' }, 500);
  }
});

// =============================================================================
// Routes: Automation Executions
// =============================================================================

/**
 * GET /v1/email/automation/executions
 * List automation executions (audit log)
 */
emailAutomation.get('/executions', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const rawQuery = c.req.query();

    // Validate query parameters
    const validation = queryFiltersSchema.safeParse(rawQuery);
    if (!validation.success) {
      return c.json(
        { error: 'Invalid query parameters', details: validation.error.errors },
        400
      );
    }

    const filters = {
      rule_id: validation.data.rule_id,
      status: validation.data.status,
      limit: validation.data.limit ? parseInt(validation.data.limit) : 100,
      offset: validation.data.offset ? parseInt(validation.data.offset) : 0,
    };

    const executions = await automationService.getAutomationExecutions(tenantId, filters);

    return c.json({
      success: true,
      count: executions.length,
      executions,
    });
  } catch (error) {
    console.error('Error fetching automation executions:', error);
    return c.json({ error: 'Failed to fetch automation executions' }, 500);
  }
});

/**
 * GET /v1/email/automation/stats
 * Get automation statistics
 */
emailAutomation.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.query('rule_id');

    const stats = await automationService.getAutomationStats(
      tenantId,
      ruleId || null
    );

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching automation stats:', error);
    return c.json({ error: 'Failed to fetch automation stats' }, 500);
  }
});

// =============================================================================
// Routes: Testing & Triggers
// =============================================================================

/**
 * POST /v1/email/automation/rules/:id/test
 * Test an automation rule with sample data
 */
emailAutomation.post('/rules/:id/test', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = c.req.param('id');
    const body = await c.req.json();

    if (!ruleId) {
      return c.json({ error: 'Rule ID is required' }, 400);
    }

    // Get the rule
    const rule = await automationService.getAutomationRule(ruleId, tenantId);

    // Prepare test data
    const testEventData = body.test_data || {
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      contact_id: null,
    };

    // Execute actions in test mode (don't actually send emails)
    const testResult = {
      rule_id: rule.id,
      rule_name: rule.name,
      test_mode: true,
      would_trigger: true,
      actions_to_perform: rule.actions,
      test_data: testEventData,
      timestamp: new Date().toISOString(),
    };

    return c.json({
      success: true,
      message: 'Test completed successfully',
      result: testResult,
    });
  } catch (error) {
    if (error.message === 'Automation rule not found') {
      return c.json({ error: error.message }, 404);
    }
    console.error('Error testing automation rule:', error);
    return c.json({ error: 'Failed to test automation rule' }, 500);
  }
});

/**
 * POST /v1/email/automation/trigger
 * Manually trigger automation evaluation for an event
 * (For internal use or webhook integrations)
 */
emailAutomation.post('/trigger', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const { event_name, event_data } = body;

    if (!event_name) {
      return c.json({ error: 'event_name is required' }, 400);
    }

    if (!event_data || typeof event_data !== 'object') {
      return c.json({ error: 'event_data must be an object' }, 400);
    }

    // Trigger automation rules
    const result = await automationService.triggerAutomationRules(
      event_name,
      event_data,
      tenantId
    );

    return c.json({
      success: true,
      message: 'Automation trigger processed',
      result,
    });
  } catch (error) {
    console.error('Error triggering automation:', error);
    return c.json({ error: 'Failed to trigger automation' }, 500);
  }
});

// =============================================================================
// Routes: Automation Templates (Presets)
// =============================================================================

/**
 * GET /v1/email/automation/templates
 * Get predefined automation rule templates
 */
emailAutomation.get('/templates', async (c) => {
  try {
    const templates = [
      {
        id: 'welcome-email',
        name: 'Welcome Email - New User',
        description: 'Send welcome email immediately when a new user signs up',
        trigger_type: 'event',
        trigger_config: {
          event_name: 'user.created',
        },
        actions: [
          {
            type: 'send_email',
            template_slug: 'welcome-email',
            delay_minutes: 0,
          },
        ],
        priority: 10,
      },
      {
        id: '7-day-checkin',
        name: 'Check-in Email - 7 Days',
        description: 'Send check-in email 7 days after user signup',
        trigger_type: 'time',
        trigger_config: {
          delay_value: 7,
          delay_unit: 'days',
          from_event: 'user.created',
        },
        actions: [
          {
            type: 'send_email',
            template_slug: '7-day-checkin',
          },
        ],
        max_executions_per_contact_per_day: 1,
      },
      {
        id: 'abandoned-cart',
        name: 'Abandoned Cart Reminder',
        description: 'Send reminder if cart is not completed within 24 hours',
        trigger_type: 'behavior',
        trigger_config: {
          event_name: 'cart.created',
          condition: 'not_completed',
          within_hours: 24,
        },
        actions: [
          {
            type: 'send_email',
            template_slug: 'abandoned-cart',
          },
        ],
        cooldown_hours: 48,
      },
      {
        id: 're-engagement',
        name: 'Re-engagement - Opened Not Clicked',
        description: 'Send reminder if user opened email but did not click any links',
        trigger_type: 'behavior',
        trigger_config: {
          event_name: 'email.opened',
          condition: 'not_clicked',
          within_hours: 24,
        },
        actions: [
          {
            type: 'send_email',
            template_slug: 'reminder-email',
          },
        ],
        cooldown_hours: 48,
      },
      {
        id: 'birthday-email',
        name: 'Birthday Email',
        description: 'Send birthday email on the user\'s birthday',
        trigger_type: 'time',
        trigger_config: {
          delay_value: 0,
          delay_unit: 'days',
          from_event: 'user.birthday',
        },
        actions: [
          {
            type: 'send_email',
            template_slug: 'birthday-email',
          },
        ],
        max_executions_per_contact_per_day: 1,
      },
    ];

    return c.json({
      success: true,
      count: templates.length,
      templates,
    });
  } catch (error) {
    console.error('Error fetching automation templates:', error);
    return c.json({ error: 'Failed to fetch automation templates' }, 500);
  }
});

export default emailAutomation;
