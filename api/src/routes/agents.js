/**
 * Agent API Routes
 * Endpoints for agent management and presence
 */

import { Hono } from 'hono';
import agentService from '../services/agent.js';
import queueService from '../services/queue.js';

const agents = new Hono();

// Middleware to get tenant_id (replace with actual auth middleware)
agents.use('*', async (c, next) => {
  c.set('tenant_id', 1); // TODO: Get from JWT/session
  await next();
});

/**
 * Create a new agent
 * POST /v1/agents
 */
agents.post('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentData = await c.req.json();

    if (!agentData.name || !agentData.extension) {
      return c.json({ error: 'name and extension are required' }, 400);
    }

    const agent = await agentService.createAgent(tenant_id, agentData);

    return c.json({ agent }, 201);
  } catch (error) {
    console.error('Error creating agent:', error);
    return c.json({ error: 'Failed to create agent', message: error.message }, 500);
  }
});

/**
 * List all agents
 * GET /v1/agents
 */
agents.get('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const status = c.req.query('status');
    const queue_id = c.req.query('queue_id');

    const result = await agentService.listAgents(tenant_id, {
      page,
      limit,
      status,
      queue_id
    });

    return c.json(result);
  } catch (error) {
    console.error('Error listing agents:', error);
    return c.json({ error: 'Failed to list agents' }, 500);
  }
});

/**
 * Get agent by ID
 * GET /v1/agents/:id
 */
agents.get('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');

    const agent = await agentService.getAgent(agentId, tenant_id);

    return c.json({ agent });
  } catch (error) {
    console.error('Error getting agent:', error);
    if (error.message === 'Agent not found') {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({ error: 'Failed to get agent' }, 500);
  }
});

/**
 * Update agent
 * PUT /v1/agents/:id
 */
agents.put('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const updates = await c.req.json();

    const agent = await agentService.updateAgent(agentId, tenant_id, updates);

    return c.json({ agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    if (error.message === 'Agent not found') {
      return c.json({ error: 'Agent not found' }, 404);
    }
    if (error.message === 'No valid fields to update') {
      return c.json({ error: 'No valid fields to update' }, 400);
    }
    return c.json({ error: 'Failed to update agent', message: error.message }, 500);
  }
});

/**
 * Delete agent
 * DELETE /v1/agents/:id
 */
agents.delete('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');

    await agentService.deleteAgent(agentId, tenant_id);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    if (error.message === 'Agent not found') {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({ error: 'Failed to delete agent' }, 500);
  }
});

/**
 * Assign agent to queue
 * POST /v1/agents/:id/queues
 */
agents.post('/:id/queues', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const { queue_id, priority } = await c.req.json();

    if (!queue_id) {
      return c.json({ error: 'queue_id is required' }, 400);
    }

    const assignment = await agentService.assignToQueue(agentId, tenant_id, queue_id, priority);

    return c.json({ assignment });
  } catch (error) {
    console.error('Error assigning agent to queue:', error);
    return c.json({ error: 'Failed to assign agent to queue', message: error.message }, 500);
  }
});

/**
 * Remove agent from queue
 * DELETE /v1/agents/:id/queues/:queue_id
 */
agents.delete('/:id/queues/:queue_id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const queueId = c.req.param('queue_id');

    await agentService.removeFromQueue(agentId, tenant_id, queueId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing agent from queue:', error);
    return c.json({ error: 'Failed to remove agent from queue' }, 500);
  }
});

/**
 * Get agent performance stats
 * GET /v1/agents/:id/stats
 */
agents.get('/:id/stats', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const period = c.req.query('period') || 'today'; // today, week, month

    const stats = await agentService.getAgentStats(agentId, tenant_id, period);

    return c.json({ stats });
  } catch (error) {
    console.error('Error getting agent stats:', error);
    return c.json({ error: 'Failed to get agent stats' }, 500);
  }
});

/**
 * Get agent activity log
 * GET /v1/agents/:id/activity
 */
agents.get('/:id/activity', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50');

    const activity = await agentService.getAgentActivity(agentId, tenant_id, limit);

    return c.json({ activity });
  } catch (error) {
    console.error('Error getting agent activity:', error);
    return c.json({ error: 'Failed to get agent activity' }, 500);
  }
});

/**
 * Agent heartbeat (presence)
 * POST /v1/agents/:id/heartbeat
 */
agents.post('/:id/heartbeat', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const { status } = await c.req.json();

    const result = await queueService.heartbeat(tenant_id, agentId, status);

    return c.json(result);
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    return c.json({ error: 'Failed to process heartbeat' }, 500);
  }
});

/**
 * Set agent status
 * POST /v1/agents/:id/status
 */
agents.post('/:id/status', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');
    const { status } = await c.req.json();

    if (!['available', 'busy', 'away', 'offline'].includes(status)) {
      return c.json({ error: 'Invalid status. Must be: available, busy, away, or offline' }, 400);
    }

    await queueService.setAgentStatus(tenant_id, agentId, status);

    return c.json({ success: true, status });
  } catch (error) {
    console.error('Error setting agent status:', error);
    return c.json({ error: 'Failed to set agent status' }, 500);
  }
});

/**
 * Get agent status
 * GET /v1/agents/:id/status
 */
agents.get('/:id/status', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const agentId = c.req.param('id');

    const status = await queueService.getAgentStatus(tenant_id, agentId);

    if (!status) {
      return c.json({ status: 'offline' });
    }

    return c.json({ status });
  } catch (error) {
    console.error('Error getting agent status:', error);
    return c.json({ error: 'Failed to get agent status' }, 500);
  }
});

export default agents;
