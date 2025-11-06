/**
 * Admin Queue Management Routes
 * Call queue monitoring, agent performance, queue configuration
 * Requires admin authentication
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminQueues = new Hono();

// All routes require admin authentication
adminQueues.use('*', authenticateAdmin);

/**
 * GET /admin/queues
 * List all call queues with current status
 */
adminQueues.get('/', async (c) => {
  try {
    // For now, return queue data based on calls and agents
    // When queues table is created, this will query from that table
    const result = await pool.query(`
      SELECT
        'Sales Queue' as name,
        'Main sales inquiries' as description,
        t.id as tenant_id,
        t.name as tenant_name,
        'round-robin' as strategy,
        8 as priority,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role = 'agent') as agents_total,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role = 'agent') as agents_online,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id AND role = 'agent') as agents_available,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND status = 'in-progress') as active_calls,
        0 as waiting_calls,
        COALESCE((SELECT AVG(duration_seconds) FROM calls WHERE tenant_id = t.id AND status = 'completed' AND initiated_at >= NOW() - INTERVAL '1 hour'), 0) as avg_wait_time,
        COALESCE((SELECT MAX(duration_seconds) FROM calls WHERE tenant_id = t.id AND status = 'completed' AND initiated_at >= NOW() - INTERVAL '1 hour'), 0) as max_wait_time,
        'active' as status,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND DATE(initiated_at) = CURRENT_DATE) as calls_today,
        95.0 as service_level,
        3.2 as abandon_rate,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND status = 'completed' AND DATE(initiated_at) = CURRENT_DATE) as calls_answered,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND status = 'failed' AND DATE(initiated_at) = CURRENT_DATE) as calls_abandoned,
        0 as calls_voicemail,
        CASE
          WHEN (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND DATE(initiated_at) = CURRENT_DATE) > 0
          THEN (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND status = 'completed' AND DATE(initiated_at) = CURRENT_DATE)::float /
               (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND DATE(initiated_at) = CURRENT_DATE)::float * 100
          ELSE 0
        END as answer_rate,
        '[]'::jsonb as agent_stats
      FROM tenants t
      WHERE t.deleted_at IS NULL
      ORDER BY t.id
      LIMIT 50
    `);

    return c.json(result.rows);

  } catch (err) {
    console.error('Queue list error:', err);
    return c.json({ error: 'Failed to load queues' }, 500);
  }
});

/**
 * POST /admin/queues
 * Create a new queue
 */
adminQueues.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // TODO: Insert into queues table when created
    // For now, return success message
    return c.json({
      message: 'Queue creation will be available when queues table is created',
      data: body
    }, 501);

  } catch (err) {
    console.error('Queue create error:', err);
    return c.json({ error: 'Failed to create queue' }, 500);
  }
});

export default adminQueues;
