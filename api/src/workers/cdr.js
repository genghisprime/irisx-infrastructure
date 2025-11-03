/**
 * CDR (Call Detail Record) Worker
 *
 * Purpose: Collect call records from FreeSWITCH for billing and analytics
 *
 * Flow:
 * 1. Connect to FreeSWITCH ESL (Event Socket Library)
 * 2. Subscribe to CHANNEL_HANGUP events
 * 3. Parse CDR data from event headers
 * 4. Write to database 'cdr' table (partitioned by month)
 * 5. Publish to NATS 'events' stream for real-time analytics
 *
 * @module workers/cdr
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
let natsConnection = null;
let jetstream = null;

/**
 * Connect to FreeSWITCH Event Socket Library
 */
async function connectToFreeSWITCH() {
  return new Promise((resolve, reject) => {
    console.log(`[CDR] Connecting to FreeSWITCH at ${FREESWITCH_HOST}:${FREESWITCH_PORT}...`);

    eslConnection = new ESL.Connection(FREESWITCH_HOST, FREESWITCH_PORT, FREESWITCH_PASSWORD, () => {
      console.log('✓ Connected to FreeSWITCH ESL');

      // Subscribe only to CHANNEL_HANGUP events (CDR collection)
      eslConnection.events('json', 'CHANNEL_HANGUP', () => {
        console.log('[CDR] Subscribed to CHANNEL_HANGUP events');
      });

      resolve();
    });

    eslConnection.on('error', (error) => {
      console.error('[CDR] FreeSWITCH connection error:', error);
      reject(error);
    });

    eslConnection.on('end', () => {
      console.log('[CDR] FreeSWITCH connection ended, reconnecting in 5s...');
      setTimeout(connectToFreeSWITCH, 5000);
    });

    // Handle CHANNEL_HANGUP events
    eslConnection.on('esl::event::CHANNEL_HANGUP::*', handleChannelHangup);
  });
}

/**
 * Connect to NATS for publishing CDR events
 */
async function connectToNATS() {
  console.log(`[CDR] Connecting to NATS at ${NATS_URL}...`);
  natsConnection = await natsConnect({ servers: NATS_URL, token: NATS_TOKEN });
  jetstream = natsConnection.jetstream();
  console.log('✓ Connected to NATS');

  // Create or get 'events' stream for analytics
  try {
    await jetstream.streams.add({
      name: 'events',
      subjects: ['events.>'],
      retention: 'limits',
      storage: 'file',
      max_age: 7 * 24 * 3600 * 1e9, // 7 days in nanoseconds
      max_msgs: 1000000, // Keep last 1M messages
    });
    console.log('✓ NATS stream "events" ready');
  } catch (err) {
    console.log('ℹ NATS stream "events" already exists');
  }
}

/**
 * Parse CDR data from FreeSWITCH CHANNEL_HANGUP event
 */
function parseCDR(event) {
  const getHeader = (name) => event.getHeader(name) || null;
  const getInt = (name) => parseInt(getHeader(name) || '0');
  const getFloat = (name) => parseFloat(getHeader(name) || '0');

  return {
    // Call identification
    call_id: getHeader('variable_call_id'),
    freeswitch_uuid: getHeader('Unique-ID'),
    tenant_id: getInt('variable_tenant_id'),
    carrier_id: getInt('variable_carrier_id'),

    // Numbers
    from_number: getHeader('Caller-Caller-ID-Number'),
    to_number: getHeader('Caller-Destination-Number'),

    // Timing
    start_time: getHeader('Caller-Channel-Created-Time'),
    answer_time: getHeader('Caller-Channel-Answered-Time'),
    end_time: getHeader('Caller-Channel-Hangup-Time'),
    duration_seconds: getInt('variable_duration'),
    billable_seconds: getInt('variable_billsec'),
    ring_duration_seconds: getInt('variable_progresssec'),

    // Call outcome
    hangup_cause: getHeader('Hangup-Cause'),
    hangup_disposition: getHeader('variable_hangup_disposition'),
    sip_hangup_cause: getHeader('variable_sip_hangup_cause'),

    // Audio quality
    audio_codec: getHeader('variable_read_codec'),
    audio_rate: getInt('variable_read_rate'),
    rtp_audio_in_mos: getFloat('variable_rtp_audio_in_mos'),
    rtp_audio_in_quality_percentage: getFloat('variable_rtp_audio_in_quality_percentage'),
    rtp_audio_in_jitter_min_variance: getFloat('variable_rtp_audio_in_jitter_min_variance'),
    rtp_audio_in_jitter_max_variance: getFloat('variable_rtp_audio_in_jitter_max_variance'),
    rtp_audio_in_packet_count: getInt('variable_rtp_audio_in_packet_count'),
    rtp_audio_in_packet_loss: getInt('variable_rtp_audio_in_skip_packet_count'),

    // Billing
    cost: getFloat('variable_carrier_cost'),
    carrier_rate: getFloat('variable_carrier_rate'),

    // Direction
    direction: getHeader('Call-Direction') === 'inbound' ? 'inbound' : 'outbound',

    // Recording
    recording_url: getHeader('variable_recording_url'),

    // Raw event data (for debugging)
    raw_event_data: JSON.stringify({
      uuid: getHeader('Unique-ID'),
      cause: getHeader('Hangup-Cause'),
      duration: getInt('variable_duration'),
      billsec: getInt('variable_billsec'),
    }),
  };
}

/**
 * Calculate call cost based on carrier rate and duration
 */
function calculateCost(cdr) {
  if (!cdr.carrier_rate || !cdr.billable_seconds) {
    return 0;
  }

  // Convert rate per minute to per second, then multiply by billable seconds
  const ratePerSecond = cdr.carrier_rate / 60;
  const cost = ratePerSecond * cdr.billable_seconds;

  return Math.round(cost * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Handle CHANNEL_HANGUP event - write CDR to database
 */
async function handleChannelHangup(event) {
  try {
    const cdr = parseCDR(event);

    // Skip if no call_id (internal call)
    if (!cdr.call_id) {
      console.log('[CDR] Skipping CDR with no call_id (internal call)');
      return;
    }

    // Calculate cost if not provided
    if (!cdr.cost && cdr.carrier_rate) {
      cdr.cost = calculateCost(cdr);
    }

    console.log(`[CDR] Processing hangup: call_id=${cdr.call_id}, duration=${cdr.duration_seconds}s, billable=${cdr.billable_seconds}s, cause=${cdr.hangup_cause}`);

    // Write to database
    await writeCDRToDatabase(cdr);

    // Publish to NATS events stream for real-time analytics
    await publishCDREvent(cdr);

    console.log(`✓ CDR written for call ${cdr.call_id}`);
  } catch (error) {
    console.error('[CDR] Error processing CHANNEL_HANGUP:', error);
  }
}

/**
 * Write CDR to database (partitioned by month)
 */
async function writeCDRToDatabase(cdr) {
  try {
    const result = await query(
      `INSERT INTO cdr (
        call_id,
        freeswitch_uuid,
        tenant_id,
        carrier_id,
        from_number,
        to_number,
        start_time,
        answer_time,
        end_time,
        duration_seconds,
        billable_seconds,
        ring_duration_seconds,
        hangup_cause,
        hangup_disposition,
        sip_hangup_cause,
        audio_codec,
        audio_rate,
        rtp_audio_in_mos,
        rtp_audio_in_quality_percentage,
        rtp_audio_in_jitter_min_variance,
        rtp_audio_in_jitter_max_variance,
        rtp_audio_in_packet_count,
        rtp_audio_in_packet_loss,
        cost,
        carrier_rate,
        direction,
        recording_url,
        raw_event_data,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, NOW()
      )
      RETURNING id`,
      [
        cdr.call_id,
        cdr.freeswitch_uuid,
        cdr.tenant_id,
        cdr.carrier_id,
        cdr.from_number,
        cdr.to_number,
        cdr.start_time,
        cdr.answer_time,
        cdr.end_time,
        cdr.duration_seconds,
        cdr.billable_seconds,
        cdr.ring_duration_seconds,
        cdr.hangup_cause,
        cdr.hangup_disposition,
        cdr.sip_hangup_cause,
        cdr.audio_codec,
        cdr.audio_rate,
        cdr.rtp_audio_in_mos,
        cdr.rtp_audio_in_quality_percentage,
        cdr.rtp_audio_in_jitter_min_variance,
        cdr.rtp_audio_in_jitter_max_variance,
        cdr.rtp_audio_in_packet_count,
        cdr.rtp_audio_in_packet_loss,
        cdr.cost,
        cdr.carrier_rate,
        cdr.direction,
        cdr.recording_url,
        cdr.raw_event_data,
      ]
    );

    const cdrId = result.rows[0].id;
    console.log(`[CDR] Written to database with ID ${cdrId}`);

    // Also update the calls table with final status
    await query(
      `UPDATE calls
       SET status = $1,
           duration_seconds = $2,
           cost = $3,
           hangup_cause = $4,
           ended_at = NOW()
       WHERE id = $5`,
      ['completed', cdr.billable_seconds, cdr.cost, cdr.hangup_cause, cdr.call_id]
    );
  } catch (error) {
    console.error('[CDR] Database write error:', error);
    throw error;
  }
}

/**
 * Publish CDR event to NATS for real-time analytics
 */
async function publishCDREvent(cdr) {
  if (!jetstream) {
    console.log('[CDR] NATS not connected, skipping event publish');
    return;
  }

  try {
    const event = {
      type: 'cdr.completed',
      timestamp: new Date().toISOString(),
      data: {
        call_id: cdr.call_id,
        tenant_id: cdr.tenant_id,
        duration_seconds: cdr.duration_seconds,
        billable_seconds: cdr.billable_seconds,
        cost: cdr.cost,
        hangup_cause: cdr.hangup_cause,
        direction: cdr.direction,
        audio_quality: {
          mos: cdr.rtp_audio_in_mos,
          quality_percentage: cdr.rtp_audio_in_quality_percentage,
          packet_loss: cdr.rtp_audio_in_packet_loss,
        },
      },
    };

    await jetstream.publish('events.cdr.completed', JSON.stringify(event));
    console.log(`[CDR] Published event to NATS for call ${cdr.call_id}`);
  } catch (error) {
    console.error('[CDR] NATS publish error:', error);
    // Don't throw - CDR is already in database
  }
}

/**
 * Main CDR worker function
 */
async function startCDRWorker() {
  console.log('🚀 Starting CDR Worker...');

  try {
    // Connect to FreeSWITCH
    await connectToFreeSWITCH();

    // Connect to NATS
    await connectToNATS();

    console.log('✓ CDR Worker is ready and listening for CHANNEL_HANGUP events...\n');

    // Keep process alive
    await new Promise(() => {}); // Never resolves
  } catch (error) {
    console.error('[CDR] Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[CDR] Shutting down gracefully...');
  if (eslConnection) {
    eslConnection.disconnect();
  }
  if (natsConnection) {
    await natsConnection.drain();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[CDR] Shutting down gracefully...');
  if (eslConnection) {
    eslConnection.disconnect();
  }
  if (natsConnection) {
    await natsConnection.drain();
  }
  process.exit(0);
});

// Start the CDR worker
startCDRWorker().catch(error => {
  console.error('[CDR] Failed to start:', error);
  process.exit(1);
});
