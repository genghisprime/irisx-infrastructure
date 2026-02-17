/**
 * Admin Supervisor Routes
 * Platform admin access to supervisor call monitoring features
 * Uses admin authentication (separate from tenant user authentication)
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';
import crypto from 'crypto';

const adminSupervisor = new Hono();

// All routes require admin authentication
adminSupervisor.use('*', authenticateAdmin);

// Generate unique session ID for supervisor monitoring
const generateSessionId = () => {
  return 'SUP' + crypto.randomBytes(12).toString('hex');
};

// Helper to log supervisor actions for audit compliance
const logSupervisorAction = async (params) => {
  const {
    adminId,
    tenantId,
    agentId,
    callId,
    callSid,
    actionType,
    metadata = {},
    ipAddress,
    userAgent
  } = params;

  try {
    await pool.query(
      `INSERT INTO supervisor_action_log
       (tenant_id, supervisor_id, agent_id, call_id, call_sid, action_type, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [tenantId, adminId, agentId, callId, callSid, actionType, JSON.stringify(metadata), ipAddress, userAgent]
    );
  } catch (error) {
    console.error('[Admin Supervisor] Audit log error:', error);
    // Don't fail the request if audit logging fails
  }
};

// Create or update supervisor session
const createSupervisorSession = async (params) => {
  const {
    tenantId,
    adminId,
    agentId,
    callId,
    callSid,
    sessionUuid,
    actionType
  } = params;

  try {
    const result = await pool.query(
      `INSERT INTO supervisor_sessions
       (tenant_id, supervisor_id, agent_id, call_id, call_sid, session_uuid, action_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [tenantId, adminId, agentId, callId, callSid, sessionUuid, actionType]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('[Admin Supervisor] Session create error:', error);
    return null;
  }
};

// End supervisor session
const endSupervisorSession = async (adminId, callSid) => {
  try {
    await pool.query(
      `UPDATE supervisor_sessions
       SET status = 'ended', ended_at = NOW()
       WHERE supervisor_id = $1 AND call_sid = $2 AND status = 'active'`,
      [adminId, callSid]
    );
  } catch (error) {
    console.error('[Admin Supervisor] Session end error:', error);
  }
};

/**
 * GET /admin/supervisor/active-calls
 * List all active calls across all tenants (admin can see everything)
 */
adminSupervisor.get('/active-calls', async (c) => {
  try {
    const admin = c.get('admin');
    const { tenant_id, queue_id, agent_id } = c.req.query();

    let queryText = `
      SELECT c.id, c.call_sid, c.uuid, c.direction, c.from_number, c.to_number,
             c.status, c.initiated_at, c.answered_at, c.tenant_id,
             u.id as agent_id, CONCAT(u.first_name, ' ', u.last_name) as agent_name, u.email as agent_email,
             t.name as tenant_name,
             (SELECT COUNT(*) FROM supervisor_sessions ss
              WHERE ss.call_sid = c.call_sid AND ss.status = 'active') as active_monitors
      FROM calls c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.status IN ('ringing', 'in-progress', 'answered')
    `;
    const params = [];

    // Optional tenant filter
    if (tenant_id) {
      params.push(parseInt(tenant_id));
      queryText += ` AND c.tenant_id = $${params.length}`;
    }

    // Note: queue_id filter removed - calls table doesn't have queue_id column
    // Queue assignment is handled at a different level

    if (agent_id) {
      params.push(parseInt(agent_id));
      queryText += ` AND c.user_id = $${params.length}`;
    }

    queryText += ' ORDER BY c.initiated_at DESC LIMIT 100';

    const result = await pool.query(queryText, params);

    return c.json({
      active_calls: result.rows.map(call => ({
        call_sid: call.call_sid,
        call_uuid: call.uuid,
        direction: call.direction,
        from: call.from_number,
        to: call.to_number,
        status: call.status,
        initiated_at: call.initiated_at,
        answered_at: call.answered_at,
        duration_seconds: call.answered_at ?
          Math.floor((Date.now() - new Date(call.answered_at).getTime()) / 1000) : 0,
        agent: call.agent_id ? {
          id: call.agent_id,  // This comes from the query alias, not table column
          name: call.agent_name,
          email: call.agent_email
        } : null,
        queue: null /* queue assignment not tracked in calls table */ ? {
          id: null,
          name: call.queue_name
        } : null,
        tenant: {
          id: call.tenant_id,
          name: call.tenant_name
        },
        active_monitors: parseInt(call.active_monitors || 0)
      })),
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Admin Supervisor] Active calls error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to list active calls'
    }, 500);
  }
});

/**
 * GET /admin/supervisor/sessions
 * List active supervisor sessions
 */
adminSupervisor.get('/sessions', async (c) => {
  try {
    const admin = c.get('admin');

    const result = await pool.query(`
      SELECT ss.*,
             c.from_number, c.to_number, c.status as call_status,
             u.name as agent_name, u.email as agent_email,
             t.name as tenant_name
      FROM supervisor_sessions ss
      LEFT JOIN calls c ON ss.call_sid = c.call_sid
      LEFT JOIN users u ON ss.agent_id = u.id
      LEFT JOIN tenants t ON ss.tenant_id = t.id
      WHERE ss.status = 'active' AND ss.supervisor_id = $1
      ORDER BY ss.started_at DESC
    `, [admin.id]);

    return c.json({
      sessions: result.rows.map(s => ({
        id: s.id,
        call_sid: s.call_sid,
        action_type: s.action_type,
        agent: {
          id: s.agent_id,
          name: s.agent_name,
          email: s.agent_email
        },
        call: {
          from: s.from_number,
          to: s.to_number,
          status: s.call_status
        },
        tenant: {
          id: s.tenant_id,
          name: s.tenant_name
        },
        started_at: s.started_at,
        duration_seconds: s.started_at ?
          Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000) : 0
      })),
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Admin Supervisor] List sessions error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to list sessions'
    }, 500);
  }
});

/**
 * GET /admin/supervisor/audit-log
 * Get supervisor action audit log (for compliance/reporting)
 */
adminSupervisor.get('/audit-log', async (c) => {
  try {
    const admin = c.get('admin');

    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const actionType = c.req.query('action_type');
    const tenantId = c.req.query('tenant_id');

    let queryText = `
      SELECT sal.*,
             t.name as tenant_name,
             agent.name as agent_name, agent.email as agent_email
      FROM supervisor_action_log sal
      LEFT JOIN tenants t ON sal.tenant_id = t.id
      LEFT JOIN users agent ON sal.agent_id = agent.id
      WHERE 1=1
    `;
    const params = [];

    if (actionType) {
      params.push(actionType);
      queryText += ` AND sal.action_type = $${params.length}`;
    }

    if (tenantId) {
      params.push(parseInt(tenantId));
      queryText += ` AND sal.tenant_id = $${params.length}`;
    }

    queryText += ' ORDER BY sal.created_at DESC';
    params.push(limit);
    queryText += ` LIMIT $${params.length}`;
    params.push(offset);
    queryText += ` OFFSET $${params.length}`;

    const result = await pool.query(queryText, params);

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM supervisor_action_log');
    const total = parseInt(countResult.rows[0]?.total || 0);

    return c.json({
      audit_log: result.rows.map(r => ({
        id: r.id,
        action_type: r.action_type,
        call_sid: r.call_sid,
        supervisor: {
          id: r.supervisor_id,
          name: 'Admin'  // Admin users don't have names in users table
        },
        agent: r.agent_id ? {
          id: r.agent_id,
          name: r.agent_name,
          email: r.agent_email
        } : null,
        tenant: {
          id: r.tenant_id,
          name: r.tenant_name
        },
        metadata: r.metadata,
        ip_address: r.ip_address,
        created_at: r.created_at
      })),
      pagination: {
        total,
        limit,
        offset,
        has_more: (offset + limit) < total
      }
    });

  } catch (error) {
    console.error('[Admin Supervisor] Audit log error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch audit log'
    }, 500);
  }
});

/**
 * POST /admin/supervisor/calls/:sid/monitor
 * Start monitoring a call
 */
adminSupervisor.post('/calls/:sid/monitor', async (c) => {
  try {
    const admin = c.get('admin');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await pool.query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, CONCAT(u.first_name, ' ', u.last_name) as agent_name
       FROM calls c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found'
      }, 404);
    }

    const call = callResult.rows[0];

    // Check if call is active
    if (!['ringing', 'in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot monitor call with status: ${call.status}`
      }, 400);
    }

    // Check for existing monitor session
    const existingSession = await pool.query(
      `SELECT id FROM supervisor_sessions
       WHERE supervisor_id = $1 AND call_sid = $2 AND status = 'active'`,
      [admin.id, sid]
    );

    if (existingSession.rows.length > 0) {
      return c.json({
        error: 'Conflict',
        message: 'Already monitoring this call'
      }, 409);
    }

    const sessionId = generateSessionId();

    // Create session record
    await createSupervisorSession({
      tenantId: call.tenant_id,
      adminId: admin.id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'monitor'
    });

    // Log audit trail
    await logSupervisorAction({
      adminId: admin.id,
      tenantId: call.tenant_id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'monitor',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        admin_email: admin.email
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent')
    });

    return c.json({
      status: 'monitoring',
      session_id: sessionId,
      call_sid: sid,
      call_uuid: call.uuid,
      agent_id: call.agent_id,
      agent_name: call.agent_name,
      started_at: new Date().toISOString(),
      capabilities: {
        can_whisper: true,
        can_barge: true,
        can_stop: true
      }
    });

  } catch (error) {
    console.error('[Admin Supervisor] Monitor error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to start monitoring'
    }, 500);
  }
});

/**
 * POST /admin/supervisor/calls/:sid/whisper
 * Start whispering to agent
 */
adminSupervisor.post('/calls/:sid/whisper', async (c) => {
  try {
    const admin = c.get('admin');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await pool.query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, CONCAT(u.first_name, ' ', u.last_name) as agent_name
       FROM calls c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found'
      }, 404);
    }

    const call = callResult.rows[0];

    // Check if call is active
    if (!['in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot whisper to call with status: ${call.status}. Call must be answered.`
      }, 400);
    }

    const sessionId = generateSessionId();

    // End any existing session and create new one
    await endSupervisorSession(admin.id, sid);
    await createSupervisorSession({
      tenantId: call.tenant_id,
      adminId: admin.id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'whisper'
    });

    // Log audit trail
    await logSupervisorAction({
      adminId: admin.id,
      tenantId: call.tenant_id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'whisper',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        admin_email: admin.email
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent')
    });

    return c.json({
      status: 'whispering',
      session_id: sessionId,
      call_sid: sid,
      call_uuid: call.uuid,
      agent_id: call.agent_id,
      agent_name: call.agent_name,
      started_at: new Date().toISOString(),
      description: 'You can now speak to the agent. The caller cannot hear you.',
      capabilities: {
        can_barge: true,
        can_stop: true
      }
    });

  } catch (error) {
    console.error('[Admin Supervisor] Whisper error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to start whisper'
    }, 500);
  }
});

/**
 * POST /admin/supervisor/calls/:sid/barge
 * Barge into call
 */
adminSupervisor.post('/calls/:sid/barge', async (c) => {
  try {
    const admin = c.get('admin');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await pool.query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, CONCAT(u.first_name, ' ', u.last_name) as agent_name
       FROM calls c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found'
      }, 404);
    }

    const call = callResult.rows[0];

    // Check if call is active
    if (!['in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot barge into call with status: ${call.status}. Call must be answered.`
      }, 400);
    }

    const sessionId = generateSessionId();

    // End any existing session and create new one
    await endSupervisorSession(admin.id, sid);
    await createSupervisorSession({
      tenantId: call.tenant_id,
      adminId: admin.id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'barge'
    });

    // Log audit trail
    await logSupervisorAction({
      adminId: admin.id,
      tenantId: call.tenant_id,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'barge',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        admin_email: admin.email
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent')
    });

    return c.json({
      status: 'barged',
      session_id: sessionId,
      call_sid: sid,
      call_uuid: call.uuid,
      agent_id: call.agent_id,
      agent_name: call.agent_name,
      started_at: new Date().toISOString(),
      description: 'You are now in a three-way call. Both the agent and caller can hear you.',
      capabilities: {
        can_stop: true
      }
    });

  } catch (error) {
    console.error('[Admin Supervisor] Barge error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to barge into call'
    }, 500);
  }
});

/**
 * POST /admin/supervisor/calls/:sid/stop
 * Stop monitoring/whisper/barge session
 */
adminSupervisor.post('/calls/:sid/stop', async (c) => {
  try {
    const admin = c.get('admin');
    const { sid } = c.req.param();

    // Get active session
    const sessionResult = await pool.query(
      `SELECT ss.*, c.uuid as call_uuid
       FROM supervisor_sessions ss
       LEFT JOIN calls c ON ss.call_sid = c.call_sid
       WHERE ss.supervisor_id = $1 AND ss.call_sid = $2 AND ss.status = 'active'`,
      [admin.id, sid]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'No active supervisor session for this call'
      }, 404);
    }

    const session = sessionResult.rows[0];

    // End session in database
    await pool.query(
      `UPDATE supervisor_sessions
       SET status = 'ended', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    // Log audit trail
    await logSupervisorAction({
      adminId: admin.id,
      tenantId: session.tenant_id,
      agentId: session.agent_id,
      callId: session.call_id,
      callSid: sid,
      actionType: 'stop',
      metadata: {
        previous_action: session.action_type,
        duration_seconds: session.started_at ?
          Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) : null,
        admin_email: admin.email
      },
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent')
    });

    return c.json({
      status: 'stopped',
      call_sid: sid,
      previous_action: session.action_type,
      stopped_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Admin Supervisor] Stop error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to stop session'
    }, 500);
  }
});

export default adminSupervisor;
