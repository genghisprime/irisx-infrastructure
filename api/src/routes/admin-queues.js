/**
 * Admin Queue Management Routes
 * Call queue monitoring, agent performance, queue configuration
 * Requires admin authentication
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

// Validation schemas
const createQueueSchema = z.object({
  tenant_id: z.number().or(z.string().transform(Number)),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  strategy: z.enum(['round-robin', 'ring-all', 'longest-idle', 'least-recent', 'random', 'top-down']).default('round-robin'),
  max_wait_time: z.number().min(0).max(3600).default(300),
  max_queue_size: z.number().min(0).max(1000).default(100),
  moh_sound: z.string().optional().default('local_stream://moh'),
  announcement_frequency: z.number().min(0).max(300).default(30),
  required_skills: z.array(z.string()).optional().default([]),
  priority_enabled: z.boolean().optional().default(false),
  sticky_agent: z.boolean().optional().default(false),
  service_level_threshold: z.number().min(0).max(300).default(30),
  status: z.enum(['active', 'paused', 'inactive']).default('active')
});

const updateQueueSchema = createQueueSchema.partial().omit({ tenant_id: true });

const adminQueues = new Hono();

// All routes require admin authentication
adminQueues.use('*', authenticateAdmin);

/**
 * GET /admin/queues
 * List all call queues with current status
 */
adminQueues.get('/', async (c) => {
  try {
    const { tenant_id, status, limit = '50', page = '1' } = c.req.query();
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ['q.deleted_at IS NULL'];
    const params = [];

    if (tenant_id) {
      params.push(tenant_id);
      conditions.push(`q.tenant_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`q.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM queues q ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get queues with stats
    params.push(limitNum, offset);
    const result = await pool.query(`
      SELECT
        q.id,
        q.uuid,
        q.tenant_id,
        t.name as tenant_name,
        q.name,
        q.description,
        q.strategy,
        q.max_wait_time,
        q.max_queue_size,
        q.moh_sound,
        q.announcement_frequency,
        q.required_skills,
        q.priority_enabled,
        q.sticky_agent,
        q.service_level_threshold,
        q.status,
        q.created_at,
        q.updated_at,
        (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id) as agents_total,
        (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id AND qa.status = 'active') as agents_available,
        (SELECT COUNT(*) FROM queue_members qm WHERE qm.queue_id = q.id AND qm.answered_at IS NULL AND qm.abandoned_at IS NULL) as waiting_calls,
        COALESCE((SELECT AVG(wait_time_seconds)::INTEGER FROM queue_members qm WHERE qm.queue_id = q.id AND DATE(qm.joined_at) = CURRENT_DATE), 0) as avg_wait_time,
        COALESCE((SELECT COUNT(*) FROM queue_members qm WHERE qm.queue_id = q.id AND DATE(qm.joined_at) = CURRENT_DATE), 0) as calls_today
      FROM queues q
      LEFT JOIN tenants t ON q.tenant_id = t.id
      ${whereClause}
      ORDER BY q.tenant_id, q.name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return c.json({
      queues: result.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error('Queue list error:', err);
    return c.json({ error: 'Failed to load queues' }, 500);
  }
});

/**
 * GET /admin/queues/stats
 * Get aggregate statistics across all queues
 */
adminQueues.get('/stats', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_queues,
        COUNT(*) FILTER (WHERE status = 'active') as active_queues,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_queues,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_queues,
        (SELECT COUNT(*) FROM queue_agents) as total_agents,
        (SELECT COUNT(*) FROM queue_agents WHERE status = 'active') as available_agents,
        (SELECT COUNT(*) FROM queue_members WHERE answered_at IS NULL AND abandoned_at IS NULL) as total_waiting
      FROM queues
      WHERE deleted_at IS NULL
    `);

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Queue stats error:', err);
    return c.json({ error: 'Failed to load queue stats' }, 500);
  }
});

/**
 * GET /admin/queues/:id
 * Get a specific queue by ID
 */
adminQueues.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();

    // Check if this is a sub-route first
    if (id === 'stats' || id === 'callers') {
      return c.notFound();
    }

    const result = await pool.query(`
      SELECT
        q.*,
        t.name as tenant_name,
        (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id) as agents_total,
        (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id AND qa.status = 'active') as agents_available,
        (SELECT COUNT(*) FROM queue_members qm WHERE qm.queue_id = q.id AND qm.answered_at IS NULL AND qm.abandoned_at IS NULL) as waiting_calls
      FROM queues q
      LEFT JOIN tenants t ON q.tenant_id = t.id
      WHERE q.id = $1 AND q.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Queue get error:', err);
    return c.json({ error: 'Failed to load queue' }, 500);
  }
});

/**
 * PUT /admin/queues/:id
 * Update a queue
 */
adminQueues.put('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const admin = c.get('admin');

    // Validate input
    const validation = updateQueueSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors
      }, 400);
    }

    const data = validation.data;

    // Check queue exists
    const queueCheck = await pool.query(
      'SELECT * FROM queues WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (queueCheck.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    const oldQueue = queueCheck.rows[0];

    // Check for duplicate name if name is being changed
    if (data.name && data.name !== oldQueue.name) {
      const dupCheck = await pool.query(
        'SELECT id FROM queues WHERE tenant_id = $1 AND name = $2 AND id != $3 AND deleted_at IS NULL',
        [oldQueue.tenant_id, data.name, id]
      );

      if (dupCheck.rows.length > 0) {
        return c.json({ error: 'A queue with this name already exists for this tenant' }, 409);
      }
    }

    // Build SET clause dynamically
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    const updateFields = [
      'name', 'description', 'strategy', 'max_wait_time', 'max_queue_size',
      'moh_sound', 'announcement_frequency', 'priority_enabled', 'sticky_agent',
      'service_level_threshold', 'status'
    ];

    for (const field of updateFields) {
      if (data[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(field === 'required_skills' ? JSON.stringify(data[field]) : data[field]);
        paramIndex++;
      }
    }

    if (data.required_skills !== undefined) {
      setClauses.push(`required_skills = $${paramIndex}`);
      values.push(JSON.stringify(data.required_skills));
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    setClauses.push('updated_at = NOW()');
    values.push(id);

    const result = await pool.query(`
      UPDATE queues
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'update_queue',
      'queue',
      id,
      JSON.stringify({
        previous: oldQueue,
        updated: data
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Queue updated successfully',
      queue: result.rows[0]
    });

  } catch (err) {
    console.error('Queue update error:', err);
    if (err.code === '23505') {
      return c.json({ error: 'A queue with this name already exists for this tenant' }, 409);
    }
    return c.json({ error: 'Failed to update queue' }, 500);
  }
});

/**
 * DELETE /admin/queues/:id
 * Soft delete a queue
 */
adminQueues.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Check queue exists
    const queueCheck = await pool.query(
      'SELECT * FROM queues WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (queueCheck.rows.length === 0) {
      return c.json({ error: 'Queue not found' }, 404);
    }

    const queue = queueCheck.rows[0];

    // Check if queue has waiting callers
    const waitingCheck = await pool.query(
      'SELECT COUNT(*) FROM queue_members WHERE queue_id = $1 AND status = \'waiting\'',
      [id]
    );

    if (parseInt(waitingCheck.rows[0].count) > 0) {
      return c.json({
        error: 'Cannot delete queue with waiting callers. Clear the queue first.',
        waiting_callers: parseInt(waitingCheck.rows[0].count)
      }, 400);
    }

    // Soft delete
    await pool.query(
      'UPDATE queues SET deleted_at = NOW(), status = \'inactive\' WHERE id = $1',
      [id]
    );

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'delete_queue',
      'queue',
      id,
      JSON.stringify({
        queue_name: queue.name,
        tenant_id: queue.tenant_id
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Queue deleted successfully'
    });

  } catch (err) {
    console.error('Queue delete error:', err);
    return c.json({ error: 'Failed to delete queue' }, 500);
  }
});

/**
 * POST /admin/queues
 * Create a new queue
 */
adminQueues.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const admin = c.get('admin');

    // Validate input
    const validation = createQueueSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors
      }, 400);
    }

    const data = validation.data;

    // Verify tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [data.tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Check for duplicate queue name within tenant
    const dupCheck = await pool.query(
      'SELECT id FROM queues WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL',
      [data.tenant_id, data.name]
    );

    if (dupCheck.rows.length > 0) {
      return c.json({ error: 'A queue with this name already exists for this tenant' }, 409);
    }

    // Insert new queue
    const result = await pool.query(`
      INSERT INTO queues (
        tenant_id,
        name,
        description,
        strategy,
        max_wait_time,
        max_queue_size,
        moh_sound,
        announcement_frequency,
        required_skills,
        priority_enabled,
        sticky_agent,
        service_level_threshold,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      data.tenant_id,
      data.name,
      data.description || null,
      data.strategy,
      data.max_wait_time,
      data.max_queue_size,
      data.moh_sound,
      data.announcement_frequency,
      JSON.stringify(data.required_skills),
      data.priority_enabled,
      data.sticky_agent,
      data.service_level_threshold,
      data.status
    ]);

    const queue = result.rows[0];

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'create_queue',
      'queue',
      queue.id,
      JSON.stringify({
        tenant_id: data.tenant_id,
        tenant_name: tenantCheck.rows[0].name,
        queue_name: data.name,
        strategy: data.strategy
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Queue created successfully',
      queue
    }, 201);

  } catch (err) {
    console.error('Queue create error:', err);
    if (err.code === '23505') {
      return c.json({ error: 'A queue with this name already exists for this tenant' }, 409);
    }
    return c.json({ error: 'Failed to create queue' }, 500);
  }
});

/**
 * GET /admin/queues/:id/callers
 * List all callers waiting in a specific queue
 * Provides admin visibility into queue state
 */
adminQueues.get('/:id/callers', async (c) => {
  try {
    const { id } = c.req.param();

    // Get calls waiting in this queue
    const result = await pool.query(`
      SELECT
        c.id,
        c.call_sid,
        c.tenant_id,
        t.name as tenant_name,
        c.from_number,
        c.to_number,
        c.status,
        c.initiated_at,
        EXTRACT(EPOCH FROM (NOW() - c.initiated_at))::INTEGER as wait_time_seconds,
        c.metadata->>'queue_position' as position,
        c.metadata->>'priority' as priority,
        c.metadata->>'caller_name' as caller_name
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.queue_id = $1
        AND c.status IN ('queued', 'ringing')
      ORDER BY
        (c.metadata->>'priority')::int DESC NULLS LAST,
        c.initiated_at ASC
    `, [id]);

    // Get queue summary
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_waiting,
        AVG(EXTRACT(EPOCH FROM (NOW() - c.initiated_at)))::INTEGER as avg_wait_seconds,
        MAX(EXTRACT(EPOCH FROM (NOW() - c.initiated_at)))::INTEGER as max_wait_seconds
      FROM calls c
      WHERE c.queue_id = $1
        AND c.status IN ('queued', 'ringing')
    `, [id]);

    return c.json({
      queue_id: parseInt(id),
      callers: result.rows,
      summary: summaryResult.rows[0]
    });
  } catch (err) {
    console.error('Queue callers error:', err);
    return c.json({ error: 'Failed to get queue callers' }, 500);
  }
});

/**
 * DELETE /admin/queues/:id/callers/:callerId
 * Remove a caller from the queue (ADMIN EMERGENCY OPERATION)
 * This terminates the call for the waiting caller
 */
adminQueues.delete('/:id/callers/:callerId', async (c) => {
  try {
    const { id, callerId } = c.req.param();
    const { reason } = await c.req.json().catch(() => ({ reason: 'Admin removal' }));
    const admin = c.get('admin');

    // Get the call
    const callResult = await pool.query(`
      SELECT c.*, t.name as tenant_name
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = $1 AND c.queue_id = $2 AND c.status IN ('queued', 'ringing')
    `, [callerId, id]);

    if (callResult.rows.length === 0) {
      return c.json({ error: 'Caller not found in queue or already handled' }, 404);
    }

    const call = callResult.rows[0];

    // Attempt to hangup via FreeSWITCH
    let freeswitchSuccess = false;
    try {
      const freeswitch = c.get('freeswitch');
      if (freeswitch && freeswitch.connection && call.uuid) {
        await freeswitch.api(`uuid_kill ${call.uuid}`);
        freeswitchSuccess = true;
      }
    } catch (fsError) {
      console.error('FreeSWITCH hangup failed:', fsError);
    }

    // Update call status
    await pool.query(`
      UPDATE calls
      SET
        status = 'completed',
        ended_at = NOW(),
        hangup_cause = 'ADMIN_REMOVED_FROM_QUEUE',
        hangup_by = 'admin',
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
    `, [JSON.stringify({
      admin_removed: true,
      admin_id: admin.id,
      admin_email: admin.email,
      removal_reason: reason,
      removed_from_queue_id: id,
      removed_at: new Date().toISOString()
    }), callerId]);

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'remove_from_queue',
      'call',
      callerId,
      JSON.stringify({
        queue_id: id,
        call_sid: call.call_sid,
        from_number: call.from_number,
        reason,
        freeswitch_success: freeswitchSuccess
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Caller removed from queue',
      call: {
        id: call.id,
        call_sid: call.call_sid,
        from_number: call.from_number,
        removed_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Queue caller removal error:', err);
    return c.json({ error: 'Failed to remove caller from queue' }, 500);
  }
});

/**
 * POST /admin/queues/:id/callers/:callerId/move
 * Move a caller to a different position in the queue or to another queue
 */
adminQueues.post('/:id/callers/:callerId/move', async (c) => {
  try {
    const { id, callerId } = c.req.param();
    const { target_queue_id, priority, reason } = await c.req.json();
    const admin = c.get('admin');

    // Get the call
    const callResult = await pool.query(`
      SELECT c.*, t.name as tenant_name
      FROM calls c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = $1 AND c.queue_id = $2 AND c.status IN ('queued', 'ringing')
    `, [callerId, id]);

    if (callResult.rows.length === 0) {
      return c.json({ error: 'Caller not found in queue' }, 404);
    }

    const call = callResult.rows[0];
    const changes = {};

    // Update queue if moving to different queue
    if (target_queue_id && target_queue_id !== parseInt(id)) {
      changes.previous_queue_id = id;
      changes.new_queue_id = target_queue_id;
      await pool.query(`UPDATE calls SET queue_id = $1 WHERE id = $2`, [target_queue_id, callerId]);
    }

    // Update priority if specified
    if (priority !== undefined) {
      changes.previous_priority = call.metadata?.priority;
      changes.new_priority = priority;
      await pool.query(`
        UPDATE calls
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify({ priority }), callerId]);
    }

    changes.reason = reason || 'Admin repositioning';
    changes.moved_at = new Date().toISOString();

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'move_in_queue',
      'call',
      callerId,
      JSON.stringify(changes),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Caller repositioned successfully',
      changes
    });
  } catch (err) {
    console.error('Queue caller move error:', err);
    return c.json({ error: 'Failed to move caller' }, 500);
  }
});

/**
 * POST /admin/queues/:id/clear
 * Clear all callers from a queue (EMERGENCY OPERATION)
 */
adminQueues.post('/:id/clear', async (c) => {
  try {
    const { id } = c.req.param();
    const { reason } = await c.req.json();
    const admin = c.get('admin');

    if (!reason) {
      return c.json({ error: 'Reason is required for audit trail' }, 400);
    }

    // Get all waiting callers
    const callsResult = await pool.query(`
      SELECT id, call_sid, uuid, from_number
      FROM calls
      WHERE queue_id = $1 AND status IN ('queued', 'ringing')
    `, [id]);

    const calls = callsResult.rows;
    const freeswitch = c.get('freeswitch');

    // Terminate each call
    for (const call of calls) {
      try {
        if (freeswitch && freeswitch.connection && call.uuid) {
          await freeswitch.api(`uuid_kill ${call.uuid}`);
        }
      } catch (fsError) {
        console.error(`Failed to kill call ${call.uuid}:`, fsError);
      }

      await pool.query(`
        UPDATE calls
        SET
          status = 'completed',
          ended_at = NOW(),
          hangup_cause = 'QUEUE_CLEARED_BY_ADMIN',
          hangup_by = 'admin',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
      `, [JSON.stringify({
        queue_cleared: true,
        admin_id: admin.id,
        admin_email: admin.email,
        clear_reason: reason
      }), call.id]);
    }

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'clear_queue',
      'queue',
      id,
      JSON.stringify({
        calls_cleared: calls.length,
        call_sids: calls.map(c => c.call_sid),
        reason
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: `Queue cleared - ${calls.length} callers removed`,
      calls_cleared: calls.length
    });
  } catch (err) {
    console.error('Queue clear error:', err);
    return c.json({ error: 'Failed to clear queue' }, 500);
  }
});

export default adminQueues;
