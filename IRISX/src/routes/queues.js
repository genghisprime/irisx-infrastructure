/**
 * Queue API Routes
 * Endpoints for queue management and real-time operations
 */

import { Hono } from 'hono';
import { query } from '../db/connection.js';
import queueService from '../services/queue.js';

const queues = new Hono();

// Middleware to get tenant_id (replace with actual auth middleware)
queues.use('*', async (c, next) => {
  c.set('tenant_id', 1); // TODO: Get from JWT/session
  await next();
});

/**
 * Create a new queue
 * POST /v1/queues
 */
queues.post('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const {
      name,
      description,
      strategy = 'round-robin',
      max_wait_time = 300,
      max_queue_size = 100,
      moh_sound = 'local_stream://moh',
      announcement_frequency = 30,
      required_skills = [],
      priority_enabled = false,
      sticky_agent = false,
      service_level_threshold = 30
    } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Queue name is required' }, 400);
    }

    const result = await query(
      `INSERT INTO queues (
        tenant_id, name, description, strategy, max_wait_time, max_queue_size,
        moh_sound, announcement_frequency, required_skills, priority_enabled,
        sticky_agent, service_level_threshold, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
      RETURNING *`,
      [
        tenant_id, name, description, strategy, max_wait_time, max_queue_size,
        moh_sound, announcement_frequency, JSON.stringify(required_skills),
        priority_enabled, sticky_agent, service_level_threshold
      ]
    );

    return c.json({ queue: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating queue:', error);
    return c.json({ error: 'Failed to create queue', message: error.message }, 500);
  }
});

/**
 * List all queues
 * GET /v1/queues
 */
queues.get('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const status = c.req.query('status');

    const offset = (page - 1) * limit;
    let whereClause = 'tenant_id = $1 AND deleted_at IS NULL';
    const values = [tenant_id];

    if (status) {
      whereClause += ' AND status = $2';
      values.push(status);
    }

    values.push(limit, offset);
    const paramCount = values.length - 1;

    const result = await query(
      `SELECT *, COUNT(*) OVER() as total_count
       FROM queues
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return c.json({
      queues: result.rows.map(row => {
        const { total_count, ...queue } = row;
        return queue;
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error listing queues:', error);
    return c.json({ error: 'Failed to list queues' }, 500);
  }
});

/**
 * Get queue by ID
 * GET /v1/queues/:id
 */
queues.get('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');

    const result = await query(
      'SELECT * FROM queues WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [queueId, tenant_id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    // Get real-time stats
    const stats = await queueService.getQueueStats(tenant_id, queueId);

    return c.json({
      queue: result.rows[0],
      realtime_stats: stats
    });
  } catch (error) {
    console.error('Error getting queue:', error);
    return c.json({ error: 'Failed to get queue' }, 500);
  }
});

/**
 * Update queue
 * PUT /v1/queues/:id
 */
queues.put('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');
    const updates = await c.req.json();

    const allowedFields = [
      'name', 'description', 'strategy', 'max_wait_time', 'max_queue_size',
      'moh_sound', 'announcement_frequency', 'required_skills', 'priority_enabled',
      'sticky_agent', 'service_level_threshold', 'status'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(key === 'required_skills' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    values.push(queueId, tenant_id);

    const result = await query(
      `UPDATE queues
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    return c.json({ queue: result.rows[0] });
  } catch (error) {
    console.error('Error updating queue:', error);
    return c.json({ error: 'Failed to update queue', message: error.message }, 500);
  }
});

/**
 * Delete queue
 * DELETE /v1/queues/:id
 */
queues.delete('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');

    const result = await query(
      'UPDATE queues SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id',
      [queueId, tenant_id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting queue:', error);
    return c.json({ error: 'Failed to delete queue' }, 500);
  }
});

/**
 * Get queue stats
 * GET /v1/queues/:id/stats
 */
queues.get('/:id/stats', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');

    const stats = await queueService.getQueueStats(tenant_id, queueId);

    return c.json({ stats });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return c.json({ error: 'Failed to get queue stats' }, 500);
  }
});

/**
 * Get queue members (current waiting callers)
 * GET /v1/queues/:id/members
 */
queues.get('/:id/members', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');

    const queueKey = `queue:${tenant_id}:${queueId}:waiting`;
    const queueLength = await queueService.getQueueLength(tenant_id, queueId);

    return c.json({
      queue_id: queueId,
      waiting: queueLength,
      estimated_wait_time: await queueService.calculateEWT(tenant_id, queueId)
    });
  } catch (error) {
    console.error('Error getting queue members:', error);
    return c.json({ error: 'Failed to get queue members' }, 500);
  }
});

/**
 * Enqueue a call (add to queue)
 * POST /v1/queues/:id/enqueue
 */
queues.post('/:id/enqueue', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');
    const { call_uuid, caller_id, caller_name, priority, call_id } = await c.req.json();

    if (!call_uuid || !caller_id) {
      return c.json({ error: 'call_uuid and caller_id are required' }, 400);
    }

    const result = await queueService.enqueue(tenant_id, queueId, {
      call_uuid,
      caller_id,
      caller_name,
      priority,
      call_id
    });

    return c.json(result);
  } catch (error) {
    console.error('Error enqueuing call:', error);
    return c.json({ error: 'Failed to enqueue call', message: error.message }, 500);
  }
});

/**
 * Dequeue next caller (assign to agent)
 * POST /v1/queues/:id/dequeue
 */
queues.post('/:id/dequeue', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');
    const { strategy } = await c.req.json();

    const result = await queueService.dequeue(tenant_id, queueId, strategy);

    if (!result) {
      return c.json({ message: 'No callers in queue or no agents available' }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error dequeuing call:', error);
    return c.json({ error: 'Failed to dequeue call', message: error.message }, 500);
  }
});

/**
 * Get caller position in queue
 * GET /v1/queues/:id/position/:call_uuid
 */
queues.get('/:id/position/:call_uuid', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');
    const call_uuid = c.req.param('call_uuid');

    const position = await queueService.getPosition(tenant_id, queueId, call_uuid);

    if (!position) {
      return c.json({ error: 'Caller not found in queue' }, 404);
    }

    return c.json(position);
  } catch (error) {
    console.error('Error getting position:', error);
    return c.json({ error: 'Failed to get position' }, 500);
  }
});

/**
 * Remove caller from queue
 * DELETE /v1/queues/:id/remove/:call_uuid
 */
queues.delete('/:id/remove/:call_uuid', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const queueId = c.req.param('id');
    const call_uuid = c.req.param('call_uuid');
    const reason = c.req.query('reason') || 'abandoned';

    await queueService.removeFromQueue(tenant_id, queueId, call_uuid, reason);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing from queue:', error);
    return c.json({ error: 'Failed to remove from queue' }, 500);
  }
});

export default queues;
