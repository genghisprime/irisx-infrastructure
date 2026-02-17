/**
 * Agent Script Routes
 * Call scripts and guided workflows for agents
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate, requireRole } from '../middleware/authMiddleware.js';
import db from '../db/connection.js';

const scripts = new Hono();

// All routes require authentication
scripts.use('*', authenticate);

// =========================================
// SCRIPT MANAGEMENT
// =========================================

/**
 * GET /scripts
 * List all scripts for tenant
 */
scripts.get('/', async (c) => {
  try {
    const user = c.get('user');

    const result = await db.query(`
      SELECT
        s.*,
        creator.name as created_by_name,
        q.name as queue_name,
        camp.name as campaign_name
      FROM agent_scripts s
      LEFT JOIN users creator ON creator.id = s.created_by
      LEFT JOIN queues q ON q.id = s.queue_id
      LEFT JOIN campaigns camp ON camp.id = s.campaign_id
      WHERE s.tenant_id = $1 AND s.is_active = true
      ORDER BY s.name ASC
    `, [user.tenantId]);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[Scripts] List error:', error);
    return c.json({ error: 'Failed to list scripts' }, 500);
  }
});

/**
 * GET /scripts/default
 * Get default script for tenant
 */
scripts.get('/default', async (c) => {
  try {
    const user = c.get('user');

    const result = await db.query(`
      SELECT * FROM agent_scripts
      WHERE tenant_id = $1 AND is_default = true AND is_active = true
      LIMIT 1
    `, [user.tenantId]);

    if (result.rows.length === 0) {
      // Return a demo script
      return c.json({
        success: true,
        name: 'Default Call Script',
        steps: getDemoScriptSteps()
      });
    }

    return c.json({
      success: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('[Scripts] Get default error:', error);
    return c.json({ error: 'Failed to get default script' }, 500);
  }
});

/**
 * GET /scripts/campaign/:campaignId
 * Get script for a specific campaign
 */
scripts.get('/campaign/:campaignId', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('campaignId');

    const result = await db.query(`
      SELECT * FROM agent_scripts
      WHERE tenant_id = $1 AND campaign_id = $2 AND is_active = true
      LIMIT 1
    `, [user.tenantId, campaignId]);

    if (result.rows.length === 0) {
      // Fall back to default
      return c.redirect('/v1/scripts/default');
    }

    return c.json({
      success: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('[Scripts] Get campaign script error:', error);
    return c.json({ error: 'Failed to get campaign script' }, 500);
  }
});

/**
 * GET /scripts/queue/:queueId
 * Get script for a specific queue
 */
scripts.get('/queue/:queueId', async (c) => {
  try {
    const user = c.get('user');
    const queueId = c.req.param('queueId');

    const result = await db.query(`
      SELECT * FROM agent_scripts
      WHERE tenant_id = $1 AND queue_id = $2 AND is_active = true
      LIMIT 1
    `, [user.tenantId, queueId]);

    if (result.rows.length === 0) {
      // Fall back to default
      return c.redirect('/v1/scripts/default');
    }

    return c.json({
      success: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('[Scripts] Get queue script error:', error);
    return c.json({ error: 'Failed to get queue script' }, 500);
  }
});

/**
 * GET /scripts/:id
 * Get specific script by ID
 */
scripts.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const scriptId = c.req.param('id');

    const result = await db.query(`
      SELECT * FROM agent_scripts
      WHERE id = $1 AND tenant_id = $2
    `, [scriptId, user.tenantId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Script not found' }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[Scripts] Get error:', error);
    return c.json({ error: 'Failed to get script' }, 500);
  }
});

/**
 * POST /scripts
 * Create a new script
 */
scripts.post('/', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      steps: z.array(z.object({
        id: z.union([z.string(), z.number()]),
        type: z.string(),
        text: z.string(),
        responses: z.array(z.object({
          label: z.string(),
          value: z.string(),
          next: z.union([z.string(), z.number()]).optional()
        })).optional(),
        requiresInput: z.boolean().optional(),
        inputLabel: z.string().optional(),
        inputPlaceholder: z.string().optional(),
        canSkip: z.boolean().optional()
      })),
      queue_id: z.string().uuid().optional(),
      campaign_id: z.string().uuid().optional(),
      is_default: z.boolean().optional()
    });

    const validated = schema.parse(body);

    // If setting as default, unset other defaults
    if (validated.is_default) {
      await db.query(`
        UPDATE agent_scripts SET is_default = false WHERE tenant_id = $1
      `, [user.tenantId]);
    }

    const result = await db.query(`
      INSERT INTO agent_scripts (
        tenant_id, name, description, steps, queue_id, campaign_id, is_default, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      user.tenantId,
      validated.name,
      validated.description || null,
      JSON.stringify(validated.steps),
      validated.queue_id || null,
      validated.campaign_id || null,
      validated.is_default || false,
      user.id
    ]);

    return c.json({
      success: true,
      data: result.rows[0]
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Scripts] Create error:', error);
    return c.json({ error: error.message || 'Failed to create script' }, 500);
  }
});

/**
 * PUT /scripts/:id
 * Update a script
 */
scripts.put('/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const scriptId = c.req.param('id');
    const body = await c.req.json();

    const fields = [];
    const values = [scriptId, user.tenantId];
    let idx = 3;

    const allowedFields = ['name', 'description', 'steps', 'queue_id', 'campaign_id', 'is_default', 'is_active'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'steps') {
          fields.push(`${field} = $${idx++}::jsonb`);
          values.push(JSON.stringify(body[field]));
        } else {
          fields.push(`${field} = $${idx++}`);
          values.push(body[field]);
        }
      }
    }

    if (fields.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    // If setting as default, unset other defaults
    if (body.is_default) {
      await db.query(`
        UPDATE agent_scripts SET is_default = false WHERE tenant_id = $1 AND id != $2
      `, [user.tenantId, scriptId]);
    }

    fields.push(`updated_at = NOW()`);

    const result = await db.query(`
      UPDATE agent_scripts
      SET ${fields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return c.json({ error: 'Script not found' }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[Scripts] Update error:', error);
    return c.json({ error: error.message || 'Failed to update script' }, 500);
  }
});

/**
 * DELETE /scripts/:id
 * Delete (soft) a script
 */
scripts.delete('/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const scriptId = c.req.param('id');

    await db.query(`
      UPDATE agent_scripts
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [scriptId, user.tenantId]);

    return c.json({
      success: true,
      message: 'Script deleted'
    });
  } catch (error) {
    console.error('[Scripts] Delete error:', error);
    return c.json({ error: 'Failed to delete script' }, 500);
  }
});

// =========================================
// OBJECTION HANDLERS
// =========================================

/**
 * GET /scripts/:id/objections
 * Get objection handlers for a script
 */
scripts.get('/:id/objections', async (c) => {
  try {
    const user = c.get('user');
    const scriptId = c.req.param('id');

    const result = await db.query(`
      SELECT * FROM script_objection_handlers
      WHERE script_id = $1 AND tenant_id = $2 AND is_active = true
      ORDER BY display_order ASC
    `, [scriptId, user.tenantId]);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[Scripts] Get objections error:', error);
    return c.json({ error: 'Failed to get objection handlers' }, 500);
  }
});

/**
 * POST /scripts/:id/objections
 * Add objection handler to a script
 */
scripts.post('/:id/objections', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const scriptId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      objection: z.string().min(1).max(500),
      response: z.string().min(1),
      category: z.string().optional(),
      display_order: z.number().int().min(0).optional()
    });

    const validated = schema.parse(body);

    const result = await db.query(`
      INSERT INTO script_objection_handlers (
        tenant_id, script_id, objection, response, category, display_order
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      user.tenantId,
      scriptId,
      validated.objection,
      validated.response,
      validated.category || 'general',
      validated.display_order || 0
    ]);

    return c.json({
      success: true,
      data: result.rows[0]
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Scripts] Add objection error:', error);
    return c.json({ error: 'Failed to add objection handler' }, 500);
  }
});

// Helper function for demo script
function getDemoScriptSteps() {
  return [
    {
      id: 1,
      type: 'greeting',
      text: 'Good {{timeOfDay}}, my name is {{agentName}} calling from {{companyName}}. Am I speaking with {{customerName}}?',
      responses: [
        { label: 'Yes, speaking', value: 'confirmed', next: 2 },
        { label: 'No, not available', value: 'not_available', next: 'end' },
        { label: 'Wrong number', value: 'wrong_number', next: 'end' }
      ]
    },
    {
      id: 2,
      type: 'question',
      text: 'Great! I\'m reaching out because we noticed you could benefit from our services. Do you have a few minutes to discuss how we can help?',
      responses: [
        { label: 'Yes, go ahead', value: 'interested', next: 3 },
        { label: 'Not right now', value: 'callback', next: 'schedule' },
        { label: 'Not interested', value: 'not_interested', next: 'objection' }
      ]
    },
    {
      id: 3,
      type: 'discovery',
      text: 'To better understand your needs, could you tell me about your current challenges?',
      requiresInput: true,
      inputLabel: 'Customer Pain Points',
      inputPlaceholder: 'Enter what the customer mentions...'
    },
    {
      id: 4,
      type: 'pitch',
      text: 'Based on what you\'ve shared, I believe our solution can help you significantly. Would you like to hear more about how this works?',
      responses: [
        { label: 'Yes, tell me more', value: 'continue', next: 5 },
        { label: 'What\'s the cost?', value: 'pricing', next: 6 },
        { label: 'Need to think about it', value: 'hesitant', next: 'objection' }
      ]
    },
    {
      id: 5,
      type: 'demo',
      text: 'I\'d like to schedule a brief 15-minute demonstration. What day works best for you this week?',
      requiresInput: true,
      inputLabel: 'Appointment Date/Time',
      inputPlaceholder: 'Enter scheduled date and time...'
    },
    {
      id: 6,
      type: 'closing',
      text: 'Thank you for your time today, {{customerName}}. I\'ll send you a confirmation email with the details we discussed. Is there anything else I can help you with?',
      canSkip: false
    }
  ];
}

export default scripts;
