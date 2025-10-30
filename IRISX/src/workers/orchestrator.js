/**
 * Call Orchestrator Worker
 *
 * Purpose: Bridge between API → NATS → FreeSWITCH to make phone calls work
 *
 * Flow:
 * 1. Subscribe to NATS 'calls' stream
 * 2. Receive call request from API
 * 3. Connect to FreeSWITCH ESL (Event Socket Library)
 * 4. Send originate command to FreeSWITCH
 * 5. Handle FreeSWITCH events (ringing, answered, hangup)
 * 6. Update call status in database
 *
 * @module workers/orchestrator
 */

import { connect as natsConnect } from 'nats';
import { query } from '../db/connection.js';
import ESL from 'modesl';
import dotenv from 'dotenv';

dotenv.config();

const NATS_URL = process.env.NATS_URL || 'localhost:4222';
const NATS_TOKEN = process.env.NATS_TOKEN || 'irisx-nats-prod-token-2025';
const FREESWITCH_HOST = process.env.FREESWITCH_HOST || '10.0.1.213';
const FREESWITCH_PORT = parseInt(process.env.FREESWITCH_PORT || '8021');
const FREESWITCH_PASSWORD = process.env.FREESWITCH_PASSWORD || 'ClueCon';

let eslConnection = null;
let isConnectedToFreeSWITCH = false;

/**
 * Connect to FreeSWITCH Event Socket Library
 */
async function connectToFreeSWITCH() {
  return new Promise((resolve, reject) => {
    console.log(`[Orchestrator] Connecting to FreeSWITCH at ${FREESWITCH_HOST}:${FREESWITCH_PORT}...`);

    eslConnection = new ESL.Connection(FREESWITCH_HOST, FREESWITCH_PORT, FREESWITCH_PASSWORD, () => {
      console.log('✓ Connected to FreeSWITCH ESL');
      isConnectedToFreeSWITCH = true;

      // Subscribe to all events for monitoring
      eslConnection.events('json', 'ALL', () => {
        console.log('[Orchestrator] Subscribed to FreeSWITCH events');
      });

      resolve();
    });

    eslConnection.on('error', (error) => {
      console.error('[Orchestrator] FreeSWITCH connection error:', error);
      isConnectedToFreeSWITCH = false;
      reject(error);
    });

    eslConnection.on('end', () => {
      console.log('[Orchestrator] FreeSWITCH connection ended, reconnecting in 5s...');
      isConnectedToFreeSWITCH = false;
      setTimeout(connectToFreeSWITCH, 5000);
    });

    // Handle FreeSWITCH events
    eslConnection.on('esl::event::CHANNEL_CREATE::*', handleChannelCreate);
    eslConnection.on('esl::event::CHANNEL_ANSWER::*', handleChannelAnswer);
    eslConnection.on('esl::event::CHANNEL_HANGUP::*', handleChannelHangup);
    eslConnection.on('esl::event::CHANNEL_PROGRESS::*', handleChannelProgress);
  });
}

/**
 * Handle CHANNEL_CREATE event (call initiated)
 */
function handleChannelCreate(event) {
  const callId = event.getHeader('variable_call_id');
  const uuid = event.getHeader('Unique-ID');

  console.log(`[FreeSWITCH] CHANNEL_CREATE: call_id=${callId}, uuid=${uuid}`);

  if (callId) {
    query(
      'UPDATE calls SET status = $1, freeswitch_uuid = $2 WHERE id = $3',
      ['initiated', uuid, callId]
    ).catch(err => console.error('[DB] Error updating call status:', err));
  }
}

/**
 * Handle CHANNEL_PROGRESS event (ringing)
 */
function handleChannelProgress(event) {
  const callId = event.getHeader('variable_call_id');

  console.log(`[FreeSWITCH] CHANNEL_PROGRESS: call_id=${callId} (ringing)`);

  if (callId) {
    query(
      'UPDATE calls SET status = $1 WHERE id = $2',
      ['ringing', callId]
    ).catch(err => console.error('[DB] Error updating call status:', err));
  }
}

/**
 * Handle CHANNEL_ANSWER event (call answered)
 */
function handleChannelAnswer(event) {
  const callId = event.getHeader('variable_call_id');

  console.log(`[FreeSWITCH] CHANNEL_ANSWER: call_id=${callId}`);

  if (callId) {
    query(
      'UPDATE calls SET status = $1, answered_at = NOW() WHERE id = $2',
      ['in-progress', callId]
    ).catch(err => console.error('[DB] Error updating call status:', err));
  }
}

/**
 * Handle CHANNEL_HANGUP event (call ended)
 */
function handleChannelHangup(event) {
  const callId = event.getHeader('variable_call_id');
  const hangupCause = event.getHeader('Hangup-Cause');
  const duration = parseInt(event.getHeader('variable_duration') || '0');
  const billsec = parseInt(event.getHeader('variable_billsec') || '0');

  console.log(`[FreeSWITCH] CHANNEL_HANGUP: call_id=${callId}, cause=${hangupCause}, duration=${duration}s`);

  if (callId) {
    query(
      `UPDATE calls
       SET status = $1,
           ended_at = NOW(),
           duration_seconds = $2,
           hangup_cause = $3
       WHERE id = $4`,
      ['completed', billsec, hangupCause, callId]
    ).catch(err => console.error('[DB] Error updating call status:', err));
  }
}

/**
 * Originate call via FreeSWITCH
 */
async function originateCall(callData) {
  if (!isConnectedToFreeSWITCH) {
    throw new Error('Not connected to FreeSWITCH');
  }

  const {
    id: callId,
    to_number,
    from_number,
    carrier_id,
    gateway,
    url,
    method = 'POST',
  } = callData;

  console.log(`[Orchestrator] Originating call ${callId}: ${from_number} → ${to_number} via gateway ${gateway}`);

  // Build FreeSWITCH originate command
  // Format: originate {vars}sofia/gateway/name/number &park
  const channelVars = [
    `origination_caller_id_number=${from_number}`,
    `origination_caller_id_name=${from_number}`,
    `call_id=${callId}`,
    `carrier_id=${carrier_id}`,
    `webhook_url=${url}`,
    `webhook_method=${method}`,
    'ignore_early_media=true',
  ].join(',');

  const dialString = `{${channelVars}}sofia/gateway/${gateway}/${to_number}`;
  const application = '&park'; // Park the call initially, application will control it

  const originateCommand = `originate ${dialString} ${application}`;

  return new Promise((resolve, reject) => {
    eslConnection.api('originate', originateCommand, (res) => {
      const response = res.getBody();

      console.log(`[Orchestrator] Originate response for call ${callId}:`, response);

      if (response.startsWith('+OK')) {
        // Extract UUID from response: +OK <uuid>
        const uuid = response.replace('+OK ', '').trim();

        // Update call with FreeSWITCH UUID
        query(
          'UPDATE calls SET status = $1, freeswitch_uuid = $2 WHERE id = $3',
          ['initiated', uuid, callId]
        ).catch(err => console.error('[DB] Error updating call:', err));

        resolve({ success: true, uuid });
      } else {
        // Originate failed
        const errorMsg = response.replace('-ERR ', '');

        query(
          'UPDATE calls SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', errorMsg, callId]
        ).catch(err => console.error('[DB] Error updating call:', err));

        reject(new Error(errorMsg));
      }
    });
  });
}

/**
 * Process call request from NATS queue
 */
async function processCallRequest(msg) {
  try {
    const callData = JSON.parse(msg.data);
    console.log(`[Orchestrator] Processing call request:`, callData);

    // Originate the call
    await originateCall(callData);

    // Acknowledge message
    msg.ack();
  } catch (error) {
    console.error('[Orchestrator] Error processing call request:', error);

    // Update call as failed
    try {
      const callData = JSON.parse(msg.data);
      await query(
        'UPDATE calls SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', error.message, callData.id]
      );
    } catch (dbError) {
      console.error('[DB] Error updating failed call:', dbError);
    }

    // Acknowledge message (don't retry - call already marked as failed)
    msg.ack();
  }
}

/**
 * Main orchestrator function
 */
async function startOrchestrator() {
  console.log('🚀 Starting Call Orchestrator Worker...');

  try {
    // Connect to FreeSWITCH
    await connectToFreeSWITCH();

    // Connect to NATS
    console.log(`[Orchestrator] Connecting to NATS at ${NATS_URL}...`);
    const nc = await natsConnect({ servers: NATS_URL, token: NATS_TOKEN });
    console.log('✓ Connected to NATS');

    // Get JetStream context
    const js = nc.jetstream();

    // Create or get the 'calls' stream
    try {
      await js.streams.add({
        name: 'calls',
        subjects: ['calls.>'],
        retention: 'workqueue', // Messages deleted after ack
        storage: 'file',
        max_age: 3600 * 1e9, // 1 hour in nanoseconds
      });
      console.log('✓ NATS stream "calls" ready');
    } catch (err) {
      // Stream might already exist
      console.log('ℹ NATS stream "calls" already exists');
    }

    // Subscribe to call requests (pull-based, durable consumer)
    const sub = js.pullSubscribe('calls.>',{
      config: {
        durable_name: 'orchestrator',
        ack_policy: 'explicit',
        max_deliver: 3,
        ack_wait: 30 * 1e9,
      }
    });

    console.log('✓ NATS consumer "orchestrator" ready');
    console.log('✓ Orchestrator is ready and listening for call requests...\n');

    // Continuously fetch and process messages
    while (true) {
      const messages = await sub.fetch({ batch: 10, expires: 5000 });
      for await (const msg of messages) {
        await processCallRequest(msg);
      }
    }
  } catch (error) {
    console.error('[Orchestrator] Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Orchestrator] Shutting down gracefully...');
  if (eslConnection) {
    eslConnection.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Orchestrator] Shutting down gracefully...');
  if (eslConnection) {
    eslConnection.disconnect();
  }
  process.exit(0);
});

// Start the orchestrator
startOrchestrator().catch(error => {
  console.error('[Orchestrator] Failed to start:', error);
  process.exit(1);
});
