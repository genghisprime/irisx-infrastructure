import { Hono } from 'hono';
import { z } from 'zod';
import { query, getClient } from '../db/connection.js';
import { authenticateJWT, authenticateJWT as authenticate } from '../middleware/authMiddleware.js';
import { strictRateLimit } from '../middleware/rateLimit.js';
import crypto from 'crypto';
import { dncService } from '../services/dnc-service.js';

const calls = new Hono();

// Middleware that supports both API Key and JWT authentication
const authenticateBoth = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');

  // Try JWT first if Authorization header present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(c, next);
  }

  // Fall back to API key authentication
  if (apiKey) {
    return authenticate(c, next);
  }

  // No authentication provided
  return c.json({
    error: 'Unauthorized',
    message: 'Missing authentication (Bearer token or X-API-Key)',
    code: 'MISSING_AUTH'
  }, 401);
};

const generateCallSid = () => {
  return 'CA' + crypto.randomBytes(16).toString('hex');
};

const createCallSchema = z.object({
  to: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
  from: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)').optional(),
  record: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
  dry_run: z.boolean().default(false),  // Dry run mode - skip FreeSWITCH for load testing
  skip_dnc_check: z.boolean().default(false)  // Skip DNC check (for system calls)
});

calls.post('/', authenticate, strictRateLimit, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const apiKeyName = c.get('apiKeyName');
    const freeswitch = c.get('freeswitch');
    const body = await c.req.json();
    const validatedData = createCallSchema.parse(body);
    const { to, from, record, metadata, dry_run, skip_dnc_check = false } = validatedData;

    // DNC Compliance Check - Block calls to numbers on DNC list
    if (!skip_dnc_check) {
      const dncCheck = await dncService.checkDNC(tenantId, to);
      if (dncCheck.blocked) {
        console.log(`🚫 Call blocked by DNC: ${to} (tenant ${tenantId}) - ${dncCheck.reason}`);
        return c.json({
          error: 'DNC Violation',
          message: `Call blocked: ${dncCheck.reason}`,
          code: 'DNC_BLOCKED',
          blocked: true,
          contactId: dncCheck.contactId,
          to
        }, 403);
      }
    }

    let callerIdNumber = from;
    if (!callerIdNumber) {
      const defaultNumberResult = await query(
        'SELECT phone_number FROM phone_numbers WHERE tenant_id = $1 AND status = $2 LIMIT 1',
        [tenantId, 'active']
      );

      if (defaultNumberResult.rows.length === 0) {
        return c.json({ error: 'Bad Request', message: 'No active phone number configured', code: 'NO_DEFAULT_NUMBER' }, 400);
      }
      callerIdNumber = defaultNumberResult.rows[0].phone_number;
    } else {
      const numberCheck = await query(
        'SELECT id FROM phone_numbers WHERE tenant_id = $1 AND phone_number = $2 AND status = $3',
        [tenantId, from, 'active']
      );
      if (numberCheck.rows.length === 0) {
        return c.json({ error: 'Forbidden', message: 'Invalid caller ID', code: 'INVALID_CALLER_ID' }, 403);
      }
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const callSid = generateCallSid();
      
      // Create call record in database
      const callResult = await client.query(
        'INSERT INTO calls (tenant_id, call_sid, direction, from_number, to_number, status, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, uuid, call_sid, status, initiated_at, metadata',
        [tenantId, callSid, 'outbound', callerIdNumber, to, 'initiated', metadata ? JSON.stringify(metadata) : null]
      );
      const call = callResult.rows[0];
      
      // Log initiation event
      await client.query(
        'INSERT INTO call_logs (call_id, tenant_id, event_type, raw_event) VALUES ($1, $2, $3, $4)',
        [call.id, tenantId, 'call.initiated', JSON.stringify({ from: callerIdNumber, to: to, api_key: apiKeyName })]
      );
      
      await client.query('COMMIT');

      // **ORIGINATE THE CALL (or simulate if dry_run)**
      if (!dry_run) {
        // REAL CALL - Originate via FreeSWITCH ESL
        try {
          const originateCmd = `originate {origination_caller_id_number=${callerIdNumber},api_call_sid=${callSid},api_tenant_id=${tenantId}}sofia/gateway/twilio/${to} &playback(/usr/local/freeswitch/share/freeswitch/sounds/en/us/callie/ivr/8000/ivr-welcome_to_freeswitch.wav)`;

          console.log(`📞 Originating call via FreeSWITCH: ${callerIdNumber} -> ${to}`);
          const result = await freeswitch.api(originateCmd);

          // Update call status to 'ringing'
          await query('UPDATE calls SET status = $1 WHERE call_sid = $2', ['ringing', callSid]);

          console.log(`✅ Call originated successfully: ${result}`);
        } catch (fsError) {
          console.error('FreeSWITCH origination error:', fsError);

          // Update call to failed status
          await query(
            'UPDATE calls SET status = $1, ended_at = NOW() WHERE call_sid = $2',
            ['failed', callSid]
          );

          return c.json({
            error: 'Call Origination Failed',
            message: 'Failed to initiate call through FreeSWITCH',
            code: 'FREESWITCH_ERROR',
            sid: callSid
          }, 500);
        }
      } else {
        // DRY RUN MODE - Simulate call without FreeSWITCH
        console.log(`🧪 [DRY RUN] Simulated call: ${callerIdNumber} -> ${to} (SID: ${callSid})`);

        // Update to ringing immediately
        await query('UPDATE calls SET status = $1 WHERE call_sid = $2', ['ringing', callSid]);

        // Simulate call completion after random duration (0-5 seconds)
        const simulatedDuration = Math.floor(Math.random() * 5) + 1;
        setTimeout(async () => {
          await query(
            'UPDATE calls SET status = $1, ended_at = NOW(), duration = $2 WHERE call_sid = $3',
            ['completed', simulatedDuration, callSid]
          );
          console.log(`🧪 [DRY RUN] Simulated call completed: ${callSid} (${simulatedDuration}s)`);
        }, simulatedDuration * 1000);
      }
      
      return c.json({ 
        sid: call.call_sid, 
        status: 'ringing', 
        from: callerIdNumber, 
        to: to, 
        initiated_at: call.initiated_at, 
        record: record, 
        metadata: call.metadata 
      }, 201);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation Error', message: 'Invalid request data', code: 'VALIDATION_ERROR', details: error.errors }, 400);
    }
    console.error('Create call error:', error);
    return c.json({ error: 'Internal Server Error', message: 'Failed to create call', code: 'CALL_CREATE_ERROR' }, 500);
  }
});

// Validation schemas for in-call actions
const sayActionSchema = z.object({
  verb: z.literal('say'),
  text: z.string().min(1).max(5000),
  voice: z.string().default('en-US-Neural2-A'),
  language: z.string().default('en-US')
});

const playActionSchema = z.object({
  verb: z.literal('play'),
  url: z.string().url(),
  loop: z.number().int().min(1).max(100).default(1)
});

const gatherActionSchema = z.object({
  verb: z.literal('gather'),
  input: z.array(z.enum(['dtmf', 'speech'])).default(['dtmf']),
  timeout: z.number().int().min(1).max(60).default(5),
  num_digits: z.number().int().min(1).max(20).optional(),
  finish_on_key: z.string().max(1).default('#'),
  speech_model: z.string().default('phone_call'),
  speech_language: z.string().default('en-US'),
  action_url: z.string().url().optional()
});

const dialActionSchema = z.object({
  verb: z.literal('dial'),
  number: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
  timeout: z.number().int().min(5).max(120).default(30),
  caller_id: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  record: z.boolean().default(false),
  recording_status_callback_url: z.string().url().optional()
});

const enqueueActionSchema = z.object({
  verb: z.literal('enqueue'),
  queue_name: z.string().min(1).max(100),
  wait_url: z.string().url().optional(),
  max_wait_time: z.number().int().min(1).max(3600).default(300)
});

const recordActionSchema = z.object({
  verb: z.literal('record'),
  action: z.enum(['start', 'stop']).default('start'),
  max_duration: z.number().int().min(1).max(3600).default(3600),
  beep: z.boolean().default(true)
});

const hangupActionSchema = z.object({
  verb: z.literal('hangup'),
  reason: z.string().optional()
});

const holdActionSchema = z.object({
  verb: z.literal('hold'),
  music_url: z.string().url().optional()
});

const muteActionSchema = z.object({
  verb: z.literal('mute'),
  direction: z.enum(['inbound', 'outbound', 'both']).default('both')
});

const unmuteActionSchema = z.object({
  verb: z.literal('unmute'),
  direction: z.enum(['inbound', 'outbound', 'both']).default('both')
});

// In-Call Actions API - Execute actions on active calls
// POST /v1/calls/:sid/actions
calls.post('/:sid/actions', authenticate, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();
    const body = await c.req.json();

    // Verify call exists and belongs to tenant
    const callResult = await query(
      'SELECT id, uuid, status, from_number, to_number FROM calls WHERE call_sid = $1 AND tenant_id = $2',
      [sid, tenantId]
    );

    if (callResult.rows.length === 0) {
      return c.json({ error: 'Not Found', message: 'Call not found', code: 'CALL_NOT_FOUND' }, 404);
    }

    const call = callResult.rows[0];

    // Check if call is in a state that allows actions
    if (!['ringing', 'in-progress', 'answered'].includes(call.status)) {
      return c.json({
        error: 'Bad Request',
        message: `Cannot execute action on call with status: ${call.status}`,
        code: 'INVALID_CALL_STATE'
      }, 400);
    }

    // Validate action/verb
    const { verb } = body;
    if (!verb) {
      return c.json({
        error: 'Validation Error',
        message: 'Action verb is required',
        code: 'MISSING_VERB'
      }, 400);
    }

    let actionResult;

    switch (verb) {
      case 'say': {
        const action = sayActionSchema.parse(body);
        // TTS playback via FreeSWITCH
        const ttsCmd = `uuid_broadcast ${call.uuid} 'say:${action.language}:${action.text}'`;
        if (call.uuid) {
          await freeswitch.api(ttsCmd);
        }
        actionResult = { verb: 'say', status: 'executed', text: action.text };
        break;
      }

      case 'play': {
        const action = playActionSchema.parse(body);
        // Audio playback via FreeSWITCH
        const playCmd = action.loop > 1
          ? `uuid_broadcast ${call.uuid} 'playback_loop:${action.loop}:${action.url}'`
          : `uuid_broadcast ${call.uuid} '${action.url}'`;
        if (call.uuid) {
          await freeswitch.api(playCmd);
        }
        actionResult = { verb: 'play', status: 'executed', url: action.url, loop: action.loop };
        break;
      }

      case 'gather': {
        const action = gatherActionSchema.parse(body);
        // DTMF/Speech collection via FreeSWITCH
        const gatherOpts = [];
        if (action.num_digits) gatherOpts.push(`max_digits=${action.num_digits}`);
        gatherOpts.push(`timeout=${action.timeout * 1000}`);
        if (action.finish_on_key) gatherOpts.push(`terminators=${action.finish_on_key}`);

        if (call.uuid) {
          await freeswitch.api(`uuid_setvar ${call.uuid} gather_timeout ${action.timeout}`);
          await freeswitch.api(`uuid_setvar ${call.uuid} gather_num_digits ${action.num_digits || 1}`);
        }
        actionResult = {
          verb: 'gather',
          status: 'started',
          input: action.input,
          timeout: action.timeout,
          num_digits: action.num_digits
        };
        break;
      }

      case 'dial': {
        const action = dialActionSchema.parse(body);
        // Bridge/transfer to another number
        const dialCmd = `uuid_transfer ${call.uuid} ${action.number}`;
        if (call.uuid) {
          await freeswitch.api(dialCmd);
        }
        actionResult = {
          verb: 'dial',
          status: 'initiated',
          number: action.number,
          timeout: action.timeout
        };
        break;
      }

      case 'enqueue': {
        const action = enqueueActionSchema.parse(body);
        // Add call to queue via FreeSWITCH mod_callcenter
        if (call.uuid) {
          await freeswitch.api(`callcenter_config queue add ${action.queue_name}`);
          await freeswitch.api(`uuid_transfer ${call.uuid} callcenter_queue::${action.queue_name}`);
        }
        actionResult = {
          verb: 'enqueue',
          status: 'queued',
          queue_name: action.queue_name,
          max_wait_time: action.max_wait_time
        };
        break;
      }

      case 'record': {
        const action = recordActionSchema.parse(body);
        const recordingPath = `/var/lib/freeswitch/recordings/${tenantId}/${sid}_${Date.now()}.wav`;

        if (action.action === 'start') {
          if (call.uuid) {
            await freeswitch.api(`uuid_record ${call.uuid} start ${recordingPath}`);
          }
          // Update call record with recording path
          await query(
            'UPDATE calls SET recording_url = $1 WHERE call_sid = $2',
            [recordingPath, sid]
          );
          actionResult = { verb: 'record', status: 'recording_started', path: recordingPath };
        } else {
          if (call.uuid) {
            await freeswitch.api(`uuid_record ${call.uuid} stop all`);
          }
          actionResult = { verb: 'record', status: 'recording_stopped' };
        }
        break;
      }

      case 'hangup': {
        const action = hangupActionSchema.parse(body);
        if (call.uuid) {
          await freeswitch.hangup(call.uuid, action.reason || 'NORMAL_CLEARING');
        }
        await query(
          'UPDATE calls SET status = $1, ended_at = NOW() WHERE call_sid = $2',
          ['completed', sid]
        );
        actionResult = { verb: 'hangup', status: 'completed', reason: action.reason || 'NORMAL_CLEARING' };
        break;
      }

      case 'hold': {
        const action = holdActionSchema.parse(body);
        if (call.uuid) {
          await freeswitch.api(`uuid_hold ${call.uuid}`);
          if (action.music_url) {
            await freeswitch.api(`uuid_broadcast ${call.uuid} '${action.music_url}' aleg`);
          }
        }
        actionResult = { verb: 'hold', status: 'held', music_url: action.music_url };
        break;
      }

      case 'mute': {
        const action = muteActionSchema.parse(body);
        if (call.uuid) {
          const leg = action.direction === 'both' ? '' : action.direction === 'inbound' ? 'read' : 'write';
          await freeswitch.api(`uuid_audio ${call.uuid} start ${leg} mute`);
        }
        actionResult = { verb: 'mute', status: 'muted', direction: action.direction };
        break;
      }

      case 'unmute': {
        const action = unmuteActionSchema.parse(body);
        if (call.uuid) {
          const leg = action.direction === 'both' ? '' : action.direction === 'inbound' ? 'read' : 'write';
          await freeswitch.api(`uuid_audio ${call.uuid} stop ${leg} mute`);
        }
        actionResult = { verb: 'unmute', status: 'unmuted', direction: action.direction };
        break;
      }

      default:
        return c.json({
          error: 'Validation Error',
          message: `Unknown verb: ${verb}. Supported verbs: say, play, gather, dial, enqueue, record, hangup, hold, mute, unmute`,
          code: 'UNKNOWN_VERB'
        }, 400);
    }

    // Log the action
    await query(
      'INSERT INTO call_logs (call_id, tenant_id, event_type, raw_event) VALUES ($1, $2, $3, $4)',
      [call.id, tenantId, `action.${verb}`, JSON.stringify({ action: body, result: actionResult })]
    );

    console.log(`🎬 Call action executed: ${sid} -> ${verb}`);

    return c.json({
      sid,
      action: actionResult,
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Validation Error',
        message: 'Invalid action parameters',
        code: 'VALIDATION_ERROR',
        details: error.errors
      }, 400);
    }
    console.error('Call action error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Failed to execute call action',
      code: 'CALL_ACTION_ERROR'
    }, 500);
  }
});

// New endpoint: Hangup a call
calls.post('/:sid/hangup', authenticate, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const freeswitch = c.get('freeswitch');
    const { sid } = c.req.param();
    
    // Get call from database
    const result = await query(
      'SELECT id, uuid, status FROM calls WHERE call_sid = $1 AND tenant_id = $2',
      [sid, tenantId]
    );
    
    if (result.rows.length === 0) {
      return c.json({ error: 'Not Found', message: 'Call not found', code: 'CALL_NOT_FOUND' }, 404);
    }
    
    const call = result.rows[0];
    
    // Check if call is already ended
    if (call.status === 'completed' || call.status === 'failed') {
      return c.json({ 
        sid: sid, 
        status: call.status,
        message: 'Call already ended' 
      });
    }
    
    // Hangup via FreeSWITCH ESL
    try {
      if (call.uuid) {
        await freeswitch.hangup(call.uuid, 'NORMAL_CLEARING');
        console.log(`📴 Call ${sid} hung up successfully`);
      }
      
      // Update database
      await query(
        'UPDATE calls SET status = $1, ended_at = NOW() WHERE call_sid = $2',
        ['completed', sid]
      );
      
      return c.json({ sid: sid, status: 'completed' });
    } catch (fsError) {
      console.error('FreeSWITCH hangup error:', fsError);
      
      // Still update database even if FreeSWITCH command failed
      await query(
        'UPDATE calls SET status = $1, ended_at = NOW() WHERE call_sid = $2',
        ['completed', sid]
      );
      
      return c.json({ sid: sid, status: 'completed', warning: 'Call ended but FreeSWITCH command failed' });
    }
  } catch (error) {
    console.error('Hangup call error:', error);
    return c.json({ error: 'Internal Server Error', message: 'Failed to hangup call', code: 'CALL_HANGUP_ERROR' }, 500);
  }
});

calls.get('/:sid', authenticateBoth, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { sid } = c.req.param();
    const result = await query(
      'SELECT call_sid, direction, from_number, to_number, status, duration_seconds, recording_url, answered_at, ended_at, initiated_at, metadata FROM calls WHERE call_sid = $1 AND tenant_id = $2',
      [sid, tenantId]
    );
    if (result.rows.length === 0) {
      return c.json({ error: 'Not Found', message: 'Call not found', code: 'CALL_NOT_FOUND' }, 404);
    }
    const call = result.rows[0];
    return c.json({ sid: call.call_sid, direction: call.direction, from: call.from_number, to: call.to_number, status: call.status, duration: call.duration_seconds, recording_url: call.recording_url, answered_at: call.answered_at, ended_at: call.ended_at, initiated_at: call.initiated_at, metadata: call.metadata });
  } catch (error) {
    console.error('Get call error:', error);
    return c.json({ error: 'Internal Server Error', message: 'Failed to retrieve call', code: 'CALL_RETRIEVE_ERROR' }, 500);
  }
});

calls.get('/', authenticateBoth, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status');
    let queryText = 'SELECT call_sid, direction, from_number, to_number, status, duration_seconds, answered_at, ended_at, initiated_at FROM calls WHERE tenant_id = $1';
    const params = [tenantId];
    if (status) {
      params.push(status);
      queryText += ' AND status = $' + params.length;
    }
    queryText += ' ORDER BY initiated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    const result = await query(queryText, params);
    let countQuery = 'SELECT COUNT(*) as total FROM calls WHERE tenant_id = $1';
    const countParams = [tenantId];
    if (status) {
      countParams.push(status);
      countQuery += ' AND status = $2';
    }
    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    return c.json({
      calls: result.rows.map(call => ({ sid: call.call_sid, direction: call.direction, from: call.from_number, to: call.to_number, status: call.status, duration: call.duration_seconds, answered_at: call.answered_at, ended_at: call.ended_at, initiated_at: call.initiated_at })),
      pagination: { total, limit, offset, has_more: (offset + limit) < total }
    });
  } catch (error) {
    console.error('List calls error:', error);
    return c.json({ error: 'Internal Server Error', message: 'Failed to list calls', code: 'CALL_LIST_ERROR' }, 500);
  }
});

export default calls;
