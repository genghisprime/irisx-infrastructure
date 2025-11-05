import { Hono } from 'hono';
import { z } from 'zod';
import { query, getClient } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import { strictRateLimit } from '../middleware/rateLimit.js';
import crypto from 'crypto';

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
  dry_run: z.boolean().default(false)  // Dry run mode - skip FreeSWITCH for load testing
});

calls.post('/', authenticate, strictRateLimit, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const apiKeyName = c.get('apiKeyName');
    const freeswitch = c.get('freeswitch');
    const body = await c.req.json();
    const validatedData = createCallSchema.parse(body);
    const { to, from, record, metadata, dry_run } = validatedData;

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
