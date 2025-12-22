import { Hono } from 'hono';
import { z } from 'zod';
import { query, getClient } from '../db/connection.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import crypto from 'crypto';

/**
 * Supervisor Call Monitoring API
 *
 * Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
 *
 * Features:
 * - Monitor: Listen to call, agent can't hear supervisor
 * - Whisper: Coach agent, caller can't hear supervisor
 * - Barge: Join call, everyone hears supervisor
 *
 * FreeSWITCH Integration:
 * - Uses eavesdrop API for monitor/whisper/barge functionality
 * - Three-way conferencing for barge mode
 */

const supervisor = new Hono();

// Supervisor-only middleware - requires supervisor, admin, or superadmin role
// Supports both tenant user tokens (userId) and admin portal tokens (adminId)
const requireSupervisorRole = async (c, next) => {
  const userRole = c.get('role');
  const userId = c.get('userId') || c.get('adminId');

  // Check for valid supervisor-level role
  if (!['supervisor', 'admin', 'superadmin'].includes(userRole)) {
    return c.json({
      error: 'Forbidden',
      message: 'Supervisor role required for this action',
      code: 'SUPERVISOR_ROLE_REQUIRED'
    }, 403);
  }

  // Set userId from adminId if not present (for admin portal users)
  if (!c.get('userId') && c.get('adminId')) {
    c.set('userId', c.get('adminId'));
  }

  await next();
};

// Generate unique session ID for supervisor monitoring
const generateSessionId = () => {
  return 'SUP' + crypto.randomBytes(12).toString('hex');
};

// Helper to log supervisor actions for audit compliance
const logSupervisorAction = async (params) => {
  const {
    tenantId,
    supervisorId,
    agentId,
    callId,
    callSid,
    actionType,
    metadata = {},
    ipAddress,
    userAgent
  } = params;

  try {
    await query(
      `INSERT INTO supervisor_action_log
       (tenant_id, supervisor_id, agent_id, call_id, call_sid, action_type, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [tenantId, supervisorId, agentId, callId, callSid, actionType, JSON.stringify(metadata), ipAddress, userAgent]
    );
  } catch (error) {
    console.error('[Supervisor] Audit log error:', error);
    // Don't fail the request if audit logging fails
  }
};

// Create or update supervisor session
const createSupervisorSession = async (params) => {
  const {
    tenantId,
    supervisorId,
    agentId,
    callId,
    callSid,
    sessionUuid,
    actionType
  } = params;

  try {
    const result = await query(
      `INSERT INTO supervisor_sessions
       (tenant_id, supervisor_id, agent_id, call_id, call_sid, session_uuid, action_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [tenantId, supervisorId, agentId, callId, callSid, sessionUuid, actionType]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('[Supervisor] Session create error:', error);
    return null;
  }
};

// End supervisor session
const endSupervisorSession = async (tenantId, supervisorId, callSid) => {
  try {
    await query(
      `UPDATE supervisor_sessions
       SET status = 'ended', ended_at = NOW()
       WHERE tenant_id = $1 AND supervisor_id = $2 AND call_sid = $3 AND status = 'active'`,
      [tenantId, supervisorId, callSid]
    );
  } catch (error) {
    console.error('[Supervisor] Session end error:', error);
  }
};

// Schema for monitor/whisper/barge requests
const supervisorActionSchema = z.object({
  call_sid: z.string().min(1, 'Call SID is required'),
  agent_id: z.number().int().positive().optional()
});

/**
 * POST /v1/supervisor/calls/:sid/monitor
 *
 * Start monitoring a call - supervisor can listen but agent/caller can't hear
 * FreeSWITCH: uuid_eavesdrop with flags for listen-only
 */
supervisor.post('/calls/:sid/monitor', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const supervisorId = c.get('userId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, u.name as agent_name
       FROM calls c
       LEFT JOIN users u ON c.agent_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found',
        code: 'CALL_NOT_FOUND'
      }, 404);
    }

    const call = callResult.rows[0];

    // Verify tenant access (supervisor must be from same tenant or be superadmin)
    const userRole = c.get('role');
    if (call.tenant_id !== tenantId && userRole !== 'superadmin') {
      return c.json({
        error: 'Forbidden',
        message: 'Cannot monitor calls from other tenants',
        code: 'CROSS_TENANT_NOT_ALLOWED'
      }, 403);
    }

    // Check if call is active
    if (!['ringing', 'in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot monitor call with status: ${call.status}`,
        code: 'INVALID_CALL_STATE'
      }, 400);
    }

    // Check for existing monitor session
    const existingSession = await query(
      `SELECT id FROM supervisor_sessions
       WHERE supervisor_id = $1 AND call_sid = $2 AND status = 'active'`,
      [supervisorId, sid]
    );

    if (existingSession.rows.length > 0) {
      return c.json({
        error: 'Conflict',
        message: 'Already monitoring this call',
        code: 'ALREADY_MONITORING'
      }, 409);
    }

    const sessionId = generateSessionId();
    let freeswitchResult = null;

    // Execute FreeSWITCH eavesdrop command
    if (call.uuid && freeswitch) {
      try {
        // Create a new channel for supervisor and eavesdrop on the call
        // Flags: DTMF='w' for whisper toggle, 'B' for barge toggle
        // For monitor-only: no flags, just listen
        const eavesdropCmd = `uuid_eavesdrop ${call.uuid}`;
        freeswitchResult = await freeswitch.api(eavesdropCmd);
        console.log(`[Supervisor] Monitor started: ${sid} by supervisor ${supervisorId}`);
      } catch (fsError) {
        console.error('[Supervisor] FreeSWITCH eavesdrop error:', fsError);
        // Continue - we'll still log the action for audit purposes
      }
    }

    // Create session record
    await createSupervisorSession({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'monitor'
    });

    // Log audit trail
    await logSupervisorAction({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'monitor',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        freeswitch_result: freeswitchResult
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
    console.error('[Supervisor] Monitor error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to start monitoring',
      code: 'MONITOR_ERROR'
    }, 500);
  }
});

/**
 * POST /v1/supervisor/calls/:sid/whisper
 *
 * Start whispering to agent - supervisor can speak to agent, caller can't hear
 * FreeSWITCH: uuid_eavesdrop with whisper flag
 */
supervisor.post('/calls/:sid/whisper', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const supervisorId = c.get('userId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, u.name as agent_name
       FROM calls c
       LEFT JOIN users u ON c.agent_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found',
        code: 'CALL_NOT_FOUND'
      }, 404);
    }

    const call = callResult.rows[0];

    // Verify tenant access
    const userRole = c.get('role');
    if (call.tenant_id !== tenantId && userRole !== 'superadmin') {
      return c.json({
        error: 'Forbidden',
        message: 'Cannot whisper to calls from other tenants',
        code: 'CROSS_TENANT_NOT_ALLOWED'
      }, 403);
    }

    // Check if call is active
    if (!['in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot whisper to call with status: ${call.status}. Call must be answered.`,
        code: 'INVALID_CALL_STATE'
      }, 400);
    }

    const sessionId = generateSessionId();
    let freeswitchResult = null;

    // Execute FreeSWITCH eavesdrop with whisper mode
    if (call.uuid && freeswitch) {
      try {
        // Whisper mode: supervisor audio goes to agent leg only
        // Set channel variable to enable whisper
        await freeswitch.api(`uuid_setvar ${call.uuid} eavesdrop_whisper_bleg true`);
        const eavesdropCmd = `uuid_eavesdrop ${call.uuid}`;
        freeswitchResult = await freeswitch.api(eavesdropCmd);
        console.log(`[Supervisor] Whisper started: ${sid} by supervisor ${supervisorId}`);
      } catch (fsError) {
        console.error('[Supervisor] FreeSWITCH whisper error:', fsError);
      }
    }

    // End any existing session and create new one
    await endSupervisorSession(tenantId, supervisorId, sid);
    await createSupervisorSession({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'whisper'
    });

    // Log audit trail
    await logSupervisorAction({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'whisper',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        freeswitch_result: freeswitchResult
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
    console.error('[Supervisor] Whisper error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to start whisper',
      code: 'WHISPER_ERROR'
    }, 500);
  }
});

/**
 * POST /v1/supervisor/calls/:sid/barge
 *
 * Barge into call - supervisor joins as third party, everyone can hear
 * FreeSWITCH: three-way conference or eavesdrop with barge flag
 */
supervisor.post('/calls/:sid/barge', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const supervisorId = c.get('userId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();

    // Get call details
    const callResult = await query(
      `SELECT c.id, c.uuid, c.status, c.from_number, c.to_number, c.tenant_id,
              u.id as agent_id, u.name as agent_name
       FROM calls c
       LEFT JOIN users u ON c.agent_id = u.id
       WHERE c.call_sid = $1`,
      [sid]
    );

    if (callResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'Call not found',
        code: 'CALL_NOT_FOUND'
      }, 404);
    }

    const call = callResult.rows[0];

    // Verify tenant access
    const userRole = c.get('role');
    if (call.tenant_id !== tenantId && userRole !== 'superadmin') {
      return c.json({
        error: 'Forbidden',
        message: 'Cannot barge into calls from other tenants',
        code: 'CROSS_TENANT_NOT_ALLOWED'
      }, 403);
    }

    // Check if call is active
    if (!['in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot barge into call with status: ${call.status}. Call must be answered.`,
        code: 'INVALID_CALL_STATE'
      }, 400);
    }

    const sessionId = generateSessionId();
    let freeswitchResult = null;

    // Execute FreeSWITCH three-way call / barge
    if (call.uuid && freeswitch) {
      try {
        // Barge mode: create a three-way call where supervisor can be heard by all
        // Option 1: Use uuid_bridge to create conference
        // Option 2: Use eavesdrop with barge flag

        // Enable barge mode (both legs can hear supervisor)
        await freeswitch.api(`uuid_setvar ${call.uuid} eavesdrop_enable_dtmf true`);
        await freeswitch.api(`uuid_setvar ${call.uuid} eavesdrop_whisper_aleg true`);
        await freeswitch.api(`uuid_setvar ${call.uuid} eavesdrop_whisper_bleg true`);

        const eavesdropCmd = `uuid_eavesdrop ${call.uuid}`;
        freeswitchResult = await freeswitch.api(eavesdropCmd);
        console.log(`[Supervisor] Barge started: ${sid} by supervisor ${supervisorId}`);
      } catch (fsError) {
        console.error('[Supervisor] FreeSWITCH barge error:', fsError);
      }
    }

    // End any existing session and create new one
    await endSupervisorSession(tenantId, supervisorId, sid);
    await createSupervisorSession({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      sessionUuid: sessionId,
      actionType: 'barge'
    });

    // Log audit trail
    await logSupervisorAction({
      tenantId,
      supervisorId,
      agentId: call.agent_id,
      callId: call.id,
      callSid: sid,
      actionType: 'barge',
      metadata: {
        from: call.from_number,
        to: call.to_number,
        agent_name: call.agent_name,
        freeswitch_result: freeswitchResult
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
    console.error('[Supervisor] Barge error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to barge into call',
      code: 'BARGE_ERROR'
    }, 500);
  }
});

/**
 * POST /v1/supervisor/calls/:sid/stop
 *
 * Stop monitoring/whisper/barge session
 */
supervisor.post('/calls/:sid/stop', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const supervisorId = c.get('userId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();

    // Get active session
    const sessionResult = await query(
      `SELECT ss.*, c.uuid as call_uuid
       FROM supervisor_sessions ss
       LEFT JOIN calls c ON ss.call_sid = c.call_sid
       WHERE ss.supervisor_id = $1 AND ss.call_sid = $2 AND ss.status = 'active'`,
      [supervisorId, sid]
    );

    if (sessionResult.rows.length === 0) {
      return c.json({
        error: 'Not Found',
        message: 'No active supervisor session for this call',
        code: 'NO_ACTIVE_SESSION'
      }, 404);
    }

    const session = sessionResult.rows[0];

    // Stop FreeSWITCH eavesdrop if connected
    if (session.session_uuid && freeswitch) {
      try {
        // Kill the eavesdrop session
        await freeswitch.api(`uuid_kill ${session.session_uuid}`);
        console.log(`[Supervisor] Session stopped: ${sid} by supervisor ${supervisorId}`);
      } catch (fsError) {
        console.error('[Supervisor] FreeSWITCH stop error:', fsError);
      }
    }

    // End session in database
    await query(
      `UPDATE supervisor_sessions
       SET status = 'ended', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    // Log audit trail
    await logSupervisorAction({
      tenantId,
      supervisorId,
      agentId: session.agent_id,
      callId: session.call_id,
      callSid: sid,
      actionType: 'stop',
      metadata: {
        previous_action: session.action_type,
        duration_seconds: session.started_at ?
          Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) : null
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
    console.error('[Supervisor] Stop error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to stop session',
      code: 'STOP_ERROR'
    }, 500);
  }
});

/**
 * GET /v1/supervisor/sessions
 *
 * List active supervisor sessions for current supervisor
 */
supervisor.get('/sessions', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const supervisorId = c.get('userId');
    const userRole = c.get('role');

    let queryText = `
      SELECT ss.*,
             c.from_number, c.to_number, c.status as call_status,
             u.name as agent_name, u.email as agent_email
      FROM supervisor_sessions ss
      LEFT JOIN calls c ON ss.call_sid = c.call_sid
      LEFT JOIN users u ON ss.agent_id = u.id
      WHERE ss.status = 'active'
    `;
    const params = [];

    // Non-superadmins can only see their own sessions
    if (userRole !== 'superadmin') {
      params.push(tenantId);
      queryText += ` AND ss.tenant_id = $${params.length}`;

      // Regular supervisors see only their sessions, admins see all tenant sessions
      if (userRole === 'supervisor') {
        params.push(supervisorId);
        queryText += ` AND ss.supervisor_id = $${params.length}`;
      }
    }

    queryText += ' ORDER BY ss.started_at DESC';

    const result = await query(queryText, params);

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
        started_at: s.started_at,
        duration_seconds: s.started_at ?
          Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000) : 0
      })),
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Supervisor] List sessions error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to list sessions',
      code: 'LIST_SESSIONS_ERROR'
    }, 500);
  }
});

/**
 * GET /v1/supervisor/audit-log
 *
 * Get supervisor action audit log (for compliance/reporting)
 */
supervisor.get('/audit-log', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userRole = c.get('role');

    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const actionType = c.req.query('action_type');
    const supervisorIdFilter = c.req.query('supervisor_id');
    const agentIdFilter = c.req.query('agent_id');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    let queryText = `
      SELECT sal.*,
             sup.name as supervisor_name, sup.email as supervisor_email,
             agent.name as agent_name, agent.email as agent_email
      FROM supervisor_action_log sal
      LEFT JOIN users sup ON sal.supervisor_id = sup.id
      LEFT JOIN users agent ON sal.agent_id = agent.id
      WHERE 1=1
    `;
    const params = [];

    // Tenant filtering
    if (userRole !== 'superadmin') {
      params.push(tenantId);
      queryText += ` AND sal.tenant_id = $${params.length}`;
    }

    // Optional filters
    if (actionType) {
      params.push(actionType);
      queryText += ` AND sal.action_type = $${params.length}`;
    }

    if (supervisorIdFilter) {
      params.push(parseInt(supervisorIdFilter));
      queryText += ` AND sal.supervisor_id = $${params.length}`;
    }

    if (agentIdFilter) {
      params.push(parseInt(agentIdFilter));
      queryText += ` AND sal.agent_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      queryText += ` AND sal.created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND sal.created_at <= $${params.length}`;
    }

    // Count total
    const countQuery = queryText.replace('SELECT sal.*,', 'SELECT COUNT(*) as total FROM supervisor_action_log sal WHERE 1=1').split('LEFT JOIN')[0] +
      queryText.split('WHERE 1=1')[1].split('ORDER BY')[0];

    // Add ordering and pagination
    queryText += ' ORDER BY sal.created_at DESC';
    params.push(limit);
    queryText += ` LIMIT $${params.length}`;
    params.push(offset);
    queryText += ` OFFSET $${params.length}`;

    const [result, countResult] = await Promise.all([
      query(queryText, params),
      query(`SELECT COUNT(*) as total FROM supervisor_action_log sal WHERE ${userRole !== 'superadmin' ? 'sal.tenant_id = $1' : '1=1'}`,
        userRole !== 'superadmin' ? [tenantId] : [])
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);

    return c.json({
      audit_log: result.rows.map(r => ({
        id: r.id,
        action_type: r.action_type,
        call_sid: r.call_sid,
        supervisor: {
          id: r.supervisor_id,
          name: r.supervisor_name,
          email: r.supervisor_email
        },
        agent: r.agent_id ? {
          id: r.agent_id,
          name: r.agent_name,
          email: r.agent_email
        } : null,
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
    console.error('[Supervisor] Audit log error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to fetch audit log',
      code: 'AUDIT_LOG_ERROR'
    }, 500);
  }
});

/**
 * GET /v1/supervisor/active-calls
 *
 * List all active calls that can be monitored
 */
supervisor.get('/active-calls', authenticateJWT, requireSupervisorRole, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userRole = c.get('role');

    const queueId = c.req.query('queue_id');
    const agentId = c.req.query('agent_id');

    let queryText = `
      SELECT c.id, c.call_sid, c.uuid, c.direction, c.from_number, c.to_number,
             c.status, c.initiated_at, c.answered_at,
             u.id as agent_id, u.name as agent_name, u.email as agent_email,
             q.id as queue_id, q.name as queue_name,
             (SELECT COUNT(*) FROM supervisor_sessions ss
              WHERE ss.call_sid = c.call_sid AND ss.status = 'active') as active_monitors
      FROM calls c
      LEFT JOIN users u ON c.agent_id = u.id
      LEFT JOIN queues q ON c.queue_id = q.id
      WHERE c.status IN ('ringing', 'in-progress', 'answered')
    `;
    const params = [];

    // Tenant filtering
    if (userRole !== 'superadmin') {
      params.push(tenantId);
      queryText += ` AND c.tenant_id = $${params.length}`;
    }

    // Optional filters
    if (queueId) {
      params.push(parseInt(queueId));
      queryText += ` AND c.queue_id = $${params.length}`;
    }

    if (agentId) {
      params.push(parseInt(agentId));
      queryText += ` AND c.agent_id = $${params.length}`;
    }

    queryText += ' ORDER BY c.initiated_at DESC LIMIT 100';

    const result = await query(queryText, params);

    return c.json({
      active_calls: result.rows.map(c => ({
        call_sid: c.call_sid,
        call_uuid: c.uuid,
        direction: c.direction,
        from: c.from_number,
        to: c.to_number,
        status: c.status,
        initiated_at: c.initiated_at,
        answered_at: c.answered_at,
        duration_seconds: c.answered_at ?
          Math.floor((Date.now() - new Date(c.answered_at).getTime()) / 1000) : 0,
        agent: c.agent_id ? {
          id: c.agent_id,
          name: c.agent_name,
          email: c.agent_email
        } : null,
        queue: c.queue_id ? {
          id: c.queue_id,
          name: c.queue_name
        } : null,
        active_monitors: parseInt(c.active_monitors || 0)
      })),
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Supervisor] Active calls error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to list active calls',
      code: 'ACTIVE_CALLS_ERROR'
    }, 500);
  }
});

export default supervisor;
