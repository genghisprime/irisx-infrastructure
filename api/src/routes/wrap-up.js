/**
 * Agent Wrap-up API Routes
 *
 * Endpoints for managing agent wrap-up (After Call Work / ACW) state:
 * - Enter/exit wrap-up state
 * - Extend wrap-up time
 * - Submit disposition codes
 * - Manage wrap-up code definitions
 */

import { Hono } from 'hono';
import wrapUpService from '../services/wrap-up.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const wrapUp = new Hono();

// Auth middleware - get tenant_id and agent_id from JWT
wrapUp.use('*', authenticateJWT);

// === Agent Wrap-up State Management ===

/**
 * Enter wrap-up state after call ends
 * POST /v1/wrap-up/enter
 */
wrapUp.post('/enter', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const agentId = user?.userId;
    const callData = await c.req.json();

    if (!agentId) {
      return c.json({ error: 'Agent ID is required' }, 400);
    }

    const result = await wrapUpService.enterWrapUp(tenantId, agentId, callData);

    return c.json(result);
  } catch (error) {
    console.error('Error entering wrap-up:', error);
    return c.json({ error: 'Failed to enter wrap-up', message: error.message }, 500);
  }
});

/**
 * Complete wrap-up and return to available
 * POST /v1/wrap-up/complete
 */
wrapUp.post('/complete', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const agentId = user?.userId;
    const wrapUpData = await c.req.json();

    if (!agentId) {
      return c.json({ error: 'Agent ID is required' }, 400);
    }

    const result = await wrapUpService.completeWrapUp(tenantId, agentId, wrapUpData);

    return c.json(result);
  } catch (error) {
    console.error('Error completing wrap-up:', error);
    if (error.message.includes('required')) {
      return c.json({ error: error.message }, 400);
    }
    if (error.message.includes('not in wrap-up')) {
      return c.json({ error: error.message }, 409);
    }
    return c.json({ error: 'Failed to complete wrap-up', message: error.message }, 500);
  }
});

/**
 * Extend wrap-up time
 * POST /v1/wrap-up/extend
 */
wrapUp.post('/extend', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const agentId = user?.userId;

    if (!agentId) {
      return c.json({ error: 'Agent ID is required' }, 400);
    }

    const result = await wrapUpService.extendWrapUp(tenantId, agentId);

    return c.json(result);
  } catch (error) {
    console.error('Error extending wrap-up:', error);
    if (error.message.includes('not allowed') || error.message.includes('Maximum extensions')) {
      return c.json({ error: error.message }, 400);
    }
    if (error.message.includes('not in wrap-up')) {
      return c.json({ error: error.message }, 409);
    }
    return c.json({ error: 'Failed to extend wrap-up', message: error.message }, 500);
  }
});

/**
 * Get current wrap-up status
 * GET /v1/wrap-up/status
 */
wrapUp.get('/status', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const agentId = user?.userId;

    if (!agentId) {
      return c.json({ error: 'Agent ID is required' }, 400);
    }

    const status = await wrapUpService.getWrapUpStatus(tenantId, agentId);

    return c.json(status);
  } catch (error) {
    console.error('Error getting wrap-up status:', error);
    return c.json({ error: 'Failed to get wrap-up status' }, 500);
  }
});

/**
 * Get wrap-up settings for tenant
 * GET /v1/wrap-up/settings
 */
wrapUp.get('/settings', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const queueId = c.req.query('queue_id');

    const settings = await wrapUpService.getWrapUpSettings(tenantId, queueId);

    return c.json({ settings });
  } catch (error) {
    console.error('Error getting wrap-up settings:', error);
    return c.json({ error: 'Failed to get wrap-up settings' }, 500);
  }
});

// === Wrap-up Codes Management ===

/**
 * List wrap-up codes
 * GET /v1/wrap-up/codes
 */
wrapUp.get('/codes', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const category = c.req.query('category');
    const active_only = c.req.query('active_only') !== 'false';

    const result = await wrapUpService.listWrapUpCodes(tenantId, {
      page,
      limit,
      category,
      active_only
    });

    return c.json(result);
  } catch (error) {
    console.error('Error listing wrap-up codes:', error);
    return c.json({ error: 'Failed to list wrap-up codes' }, 500);
  }
});

/**
 * Create wrap-up code
 * POST /v1/wrap-up/codes
 */
wrapUp.post('/codes', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const codeData = await c.req.json();

    if (!codeData.code || !codeData.name) {
      return c.json({ error: 'code and name are required' }, 400);
    }

    const code = await wrapUpService.createWrapUpCode(tenantId, codeData);

    return c.json({ code }, 201);
  } catch (error) {
    console.error('Error creating wrap-up code:', error);
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return c.json({ error: 'Wrap-up code already exists' }, 409);
    }
    return c.json({ error: 'Failed to create wrap-up code', message: error.message }, 500);
  }
});

/**
 * Update wrap-up code
 * PUT /v1/wrap-up/codes/:id
 */
wrapUp.put('/codes/:id', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const codeId = c.req.param('id');
    const updates = await c.req.json();

    const code = await wrapUpService.updateWrapUpCode(tenantId, codeId, updates);

    return c.json({ code });
  } catch (error) {
    console.error('Error updating wrap-up code:', error);
    if (error.message === 'Wrap-up code not found') {
      return c.json({ error: 'Wrap-up code not found' }, 404);
    }
    if (error.message === 'No valid fields to update') {
      return c.json({ error: error.message }, 400);
    }
    return c.json({ error: 'Failed to update wrap-up code', message: error.message }, 500);
  }
});

/**
 * Delete wrap-up code
 * DELETE /v1/wrap-up/codes/:id
 */
wrapUp.delete('/codes/:id', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const codeId = c.req.param('id');

    await wrapUpService.deleteWrapUpCode(tenantId, codeId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting wrap-up code:', error);
    if (error.message === 'Wrap-up code not found') {
      return c.json({ error: 'Wrap-up code not found' }, 404);
    }
    return c.json({ error: 'Failed to delete wrap-up code' }, 500);
  }
});

/**
 * Get wrap-up statistics
 * GET /v1/wrap-up/stats
 */
wrapUp.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const period = c.req.query('period') || 'today'; // today, week, month

    const stats = await wrapUpService.getWrapUpStats(tenantId, period);

    return c.json(stats);
  } catch (error) {
    console.error('Error getting wrap-up stats:', error);
    return c.json({ error: 'Failed to get wrap-up stats' }, 500);
  }
});

export default wrapUp;
