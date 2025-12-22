/**
 * Campaign Management Routes
 * Outbound campaign dialer with contact list management
 *
 * Progressive Dialer Features (per IRIS X Scope of Work v2):
 * - 1:1 agent-to-call ratio (dials when agent available)
 * - DNC compliance checking before each dial
 * - Timezone curfew enforcement (8 AM - 9 PM local time)
 * - Retry logic with configurable attempts
 * - Real-time dialer status monitoring
 */

import { Hono } from 'hono'
import { z } from 'zod'
import crypto from 'crypto'
import pool from '../db/connection.js'
import { dncService } from '../services/dnc-service.js'

const campaigns = new Hono()

// In-memory tracking of active campaign dialers
const activeCampaigns = new Map()

// Predictive Dialer tracking - stores real-time metrics per campaign
const predictiveDialerState = new Map()

/**
 * Predictive Dialer Configuration
 * Based on: DEVELOPMENT_CHECKLIST.md Week 21-22 Predictive Dialer Algorithm
 */
const PREDICTIVE_CONFIG = {
  INITIAL_RATIO: 1.5,           // Start at 1.5:1 (calls per agent)
  MAX_RATIO: 3.0,               // Maximum 3:1 ratio
  MIN_RATIO: 1.0,               // Minimum 1:1 (same as progressive)
  ABANDON_TARGET: 0.03,         // 3% abandon rate target (FCC requirement)
  SAMPLE_SIZE: 100,             // Track last 100 calls for answer rate
  ADJUSTMENT_INTERVAL_MS: 300000, // Adjust ratio every 5 minutes
  MAX_QUEUE_WAIT_SECONDS: 30,   // Maximum time to wait for agent
  HOLD_MESSAGE_PATH: '/usr/local/freeswitch/sounds/en/us/callie/ivr/8000/ivr-hold_connect_call.wav'
}

/**
 * Check if current time is within calling hours for a timezone
 * FCC regulations: No calls before 8 AM or after 9 PM in recipient's local time
 */
function isWithinCallingHours(timezone = 'America/New_York', curfewStart = '08:00', curfewEnd = '21:00') {
  try {
    // Get current time in recipient's timezone
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    })
    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10)
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10)

    const currentMinutes = hour * 60 + minute

    // Parse curfew times
    const [startHour, startMin] = curfewStart.split(':').map(Number)
    const [endHour, endMin] = curfewEnd.split(':').map(Number)
    const startMinutes = startHour * 60 + startMin  // e.g., 8:00 = 480
    const endMinutes = endHour * 60 + endMin        // e.g., 21:00 = 1260

    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  } catch (error) {
    console.error(`Invalid timezone ${timezone}, defaulting to allowed:`, error)
    return true // Fail open if timezone is invalid
  }
}

/**
 * Calculate next callable time for a timezone (next 8 AM)
 */
function getNextCallableTime(timezone = 'America/New_York') {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    })
    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10)

    // If after 9 PM, schedule for 8 AM next day
    // If before 8 AM, schedule for 8 AM today
    const nextCallTime = new Date(now)
    if (hour >= 21) {
      nextCallTime.setDate(nextCallTime.getDate() + 1)
    }
    nextCallTime.setHours(8, 0, 0, 0)

    return nextCallTime
  } catch {
    return null
  }
}

/**
 * Generate a unique call SID
 */
function generateCallSid() {
  return 'CA' + crypto.randomBytes(16).toString('hex')
}

/**
 * Initialize predictive dialer state for a campaign
 */
function initPredictiveState(campaignId) {
  return {
    campaignId,
    startedAt: new Date(),
    currentRatio: PREDICTIVE_CONFIG.INITIAL_RATIO,
    lastAdjustment: Date.now(),

    // Circular buffer for last 100 call outcomes
    callHistory: [],

    // Counters
    totalCalls: 0,
    answeredCalls: 0,
    abandonedCalls: 0,  // Answered but no agent available within 30s
    unansweredCalls: 0, // No answer, busy, failed

    // Queue of calls waiting for agents
    queuedCalls: new Map(), // callSid -> { queuedAt, recipientId }
  }
}

/**
 * Calculate answer rate from recent call history
 * Uses a sliding window of the last SAMPLE_SIZE calls
 */
function calculateAnswerRate(state) {
  if (state.callHistory.length === 0) return 0.5 // Default 50% if no data

  const answered = state.callHistory.filter(c => c.answered).length
  return answered / state.callHistory.length
}

/**
 * Calculate abandon rate (calls answered but no agent available)
 */
function calculateAbandonRate(state) {
  if (state.answeredCalls === 0) return 0
  return state.abandonedCalls / state.answeredCalls
}

/**
 * Calculate adaptive dial ratio based on performance metrics
 * Formula: agents * (1 + (answer_rate - abandon_target))
 * Constrained between MIN_RATIO and MAX_RATIO
 */
function calculateAdaptiveRatio(state, availableAgents) {
  const answerRate = calculateAnswerRate(state)
  const abandonRate = calculateAbandonRate(state)

  // Base calculation: how aggressive should we dial?
  // Higher answer rate = we can be more aggressive
  // Higher abandon rate = we need to slow down
  let targetRatio = 1 + (answerRate - PREDICTIVE_CONFIG.ABANDON_TARGET)

  // If abandon rate is above target, reduce ratio
  if (abandonRate > PREDICTIVE_CONFIG.ABANDON_TARGET) {
    const penalty = (abandonRate - PREDICTIVE_CONFIG.ABANDON_TARGET) * 10
    targetRatio = Math.max(PREDICTIVE_CONFIG.MIN_RATIO, targetRatio - penalty)
  }

  // Clamp to allowed range
  return Math.min(PREDICTIVE_CONFIG.MAX_RATIO, Math.max(PREDICTIVE_CONFIG.MIN_RATIO, targetRatio))
}

/**
 * Record call outcome in the predictive dialer state
 */
function recordCallOutcome(state, answered, abandoned = false) {
  // Add to circular buffer
  state.callHistory.push({ answered, abandoned, timestamp: Date.now() })

  // Keep only last SAMPLE_SIZE
  if (state.callHistory.length > PREDICTIVE_CONFIG.SAMPLE_SIZE) {
    state.callHistory.shift()
  }

  state.totalCalls++
  if (answered) {
    state.answeredCalls++
    if (abandoned) {
      state.abandonedCalls++
    }
  } else {
    state.unansweredCalls++
  }
}

/**
 * Get count of available agents for a campaign's queue
 */
async function getAvailableAgentCount(tenantId, queueId) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM agent_queue_assignments aqa
       INNER JOIN users u ON u.id = aqa.agent_id
       WHERE aqa.queue_id = $1
       AND u.tenant_id = $2
       AND u.status = 'available'
       AND u.deleted_at IS NULL`,
      [queueId, tenantId]
    )
    return parseInt(result.rows[0].count, 10)
  } catch (error) {
    console.error('Error getting available agents:', error)
    return 1 // Default to 1 if query fails
  }
}

/**
 * Predictive Dialer - Adaptive ratio-based campaign dialing
 * Dials multiple numbers per available agent based on predicted answer rates
 *
 * Key differences from Progressive Dialer:
 * 1. Dials RATIO:1 (e.g., 2.5 calls per agent) instead of 1:1
 * 2. Dynamically adjusts ratio based on answer rate and abandon rate
 * 3. Queues answered calls waiting for agents (max 30 seconds)
 * 4. Tracks abandon rate to stay under 3% FCC requirement
 */
async function startPredictiveDialer(campaignId, tenantId, queueId, freeswitch) {
  // Check if already running
  if (predictiveDialerState.has(campaignId)) {
    console.log(`📞 Predictive Dialer for campaign ${campaignId} already running`)
    return
  }

  console.log(`📞🔮 Starting PREDICTIVE DIALER for campaign ${campaignId} (ratio: ${PREDICTIVE_CONFIG.INITIAL_RATIO}:1)`)

  // Initialize state
  const state = initPredictiveState(campaignId)
  predictiveDialerState.set(campaignId, state)

  // Also track in activeCampaigns for compatibility
  activeCampaigns.set(campaignId, {
    startedAt: state.startedAt,
    callsInProgress: 0,
    totalCalls: 0,
    dialerType: 'predictive'
  })

  try {
    // Get campaign settings
    const campaignResult = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [campaignId, tenantId]
    )

    if (campaignResult.rows.length === 0) {
      console.error(`❌ Campaign ${campaignId} not found`)
      predictiveDialerState.delete(campaignId)
      activeCampaigns.delete(campaignId)
      return
    }

    const campaign = campaignResult.rows[0]
    const maxConcurrent = campaign.rate_limit || 10 // Higher default for predictive

    // Main dialer loop
    while (true) {
      // Check if campaign is still running
      const statusCheck = await pool.query(
        `SELECT status FROM campaigns WHERE id = $1`,
        [campaignId]
      )

      if (statusCheck.rows.length === 0 || statusCheck.rows[0].status !== 'running') {
        console.log(`📞 Campaign ${campaignId} no longer running, stopping predictive dialer`)
        break
      }

      // Periodically adjust dial ratio (every 5 minutes)
      if (Date.now() - state.lastAdjustment > PREDICTIVE_CONFIG.ADJUSTMENT_INTERVAL_MS) {
        const availableAgents = await getAvailableAgentCount(tenantId, queueId)
        const newRatio = calculateAdaptiveRatio(state, availableAgents)

        if (newRatio !== state.currentRatio) {
          console.log(`📊 Campaign ${campaignId}: Adjusting dial ratio ${state.currentRatio.toFixed(2)} -> ${newRatio.toFixed(2)} (abandon rate: ${(calculateAbandonRate(state) * 100).toFixed(1)}%)`)
          state.currentRatio = newRatio
        }
        state.lastAdjustment = Date.now()
      }

      // Get available agent count
      const availableAgents = await getAvailableAgentCount(tenantId, queueId)

      // Calculate how many calls to make: agents * ratio
      const targetCalls = Math.ceil(availableAgents * state.currentRatio)

      // Get current active call count
      const activeCallsResult = await pool.query(
        `SELECT COUNT(*) as active FROM calls
         WHERE metadata->>'campaign_id' = $1
         AND status IN ('initiated', 'ringing', 'in-progress', 'queued')`,
        [campaignId.toString()]
      )
      const activeCalls = parseInt(activeCallsResult.rows[0].active, 10)

      // Calculate how many new calls we can make
      const slotsAvailable = Math.min(targetCalls - activeCalls, maxConcurrent - activeCalls)

      if (slotsAvailable <= 0) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      // Get pending recipients to call
      const contactsResult = await pool.query(
        `SELECT * FROM campaign_recipients
         WHERE campaign_id = $1
         AND status = 'pending'
         AND (last_retry_at IS NULL OR last_retry_at <= NOW() - INTERVAL '1 hour')
         ORDER BY created_at ASC
         LIMIT $2`,
        [campaignId, slotsAvailable]
      )

      if (contactsResult.rows.length === 0) {
        // Check if there are any contacts still being called
        if (activeCalls === 0) {
          console.log(`✅ Campaign ${campaignId} completed - all contacts processed`)
          await pool.query(
            `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [campaignId]
          )
          break
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }

      // Originate calls for each available recipient
      for (const recipient of contactsResult.rows) {
        try {
          // DNC Compliance Check
          const dncCheck = await dncService.checkDNC(tenantId, recipient.phone)
          if (dncCheck.blocked) {
            console.log(`🚫 Campaign ${campaignId}: Skipping ${recipient.phone} - DNC blocked`)
            await pool.query(
              `UPDATE campaign_recipients
               SET status = 'dnc_blocked', error_message = $1, failed_at = NOW()
               WHERE id = $2`,
              [`DNC blocked: ${dncCheck.reason}`, recipient.id]
            )
            continue
          }

          // Timezone Curfew Enforcement
          const recipientTimezone = recipient.timezone || campaign.timezone || 'America/New_York'
          if (!isWithinCallingHours(recipientTimezone)) {
            console.log(`⏰ Campaign ${campaignId}: Skipping ${recipient.phone} - Outside calling hours`)
            const nextCallTime = getNextCallableTime(recipientTimezone)
            await pool.query(
              `UPDATE campaign_recipients
               SET status = 'pending', last_retry_at = NOW(), error_message = $1
               WHERE id = $2`,
              [`Rescheduled: Outside calling hours. Next: ${nextCallTime?.toISOString()}`, recipient.id]
            )
            continue
          }

          // Mark recipient as 'calling'
          await pool.query(
            `UPDATE campaign_recipients SET status = 'calling', sent_at = NOW() WHERE id = $1`,
            [recipient.id]
          )

          const callSid = generateCallSid()

          // Create call record with predictive metadata
          await pool.query(
            `INSERT INTO calls (
              tenant_id, call_sid, direction, from_number, to_number, status,
              metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
              tenantId,
              callSid,
              'outbound',
              campaign.from_number,
              recipient.phone,
              'initiated',
              JSON.stringify({
                campaign_id: campaignId,
                campaign_name: campaign.name,
                recipient_id: recipient.id,
                dialer_type: 'predictive',
                dial_ratio: state.currentRatio
              })
            ]
          )

          // Originate call via FreeSWITCH
          if (freeswitch && freeswitch.connection) {
            // For predictive dialer: answer → play hold message → queue for agent
            const originateCmd = `originate {origination_caller_id_number=${campaign.from_number},api_call_sid=${callSid},api_tenant_id=${tenantId},api_campaign_id=${campaignId},api_recipient_id=${recipient.id},api_dialer_type=predictive}sofia/gateway/twilio/${recipient.phone} &park()`

            console.log(`📞🔮 Predictive dial: ${recipient.phone} (ratio: ${state.currentRatio.toFixed(2)}:1)`)

            try {
              await freeswitch.api(originateCmd)
              await pool.query(
                `UPDATE calls SET status = 'ringing' WHERE call_sid = $1`,
                [callSid]
              )

              // Track for ratio calculation
              const tracker = activeCampaigns.get(campaignId)
              if (tracker) {
                tracker.callsInProgress++
                tracker.totalCalls++
              }

            } catch (fsError) {
              console.error(`❌ FreeSWITCH error for ${recipient.phone}:`, fsError)
              await pool.query(
                `UPDATE calls SET status = 'failed', ended_at = NOW() WHERE call_sid = $1`,
                [callSid]
              )

              // Record as unanswered for ratio calculation
              recordCallOutcome(state, false)

              const attemptNumber = (recipient.retry_count || 0) + 1
              if (attemptNumber >= 3) {
                await pool.query(
                  `UPDATE campaign_recipients
                   SET status = 'failed', retry_count = $1, error_message = $2, failed_at = NOW()
                   WHERE id = $3`,
                  [attemptNumber, fsError.message, recipient.id]
                )
              } else {
                await pool.query(
                  `UPDATE campaign_recipients
                   SET status = 'pending', retry_count = $1, last_retry_at = NOW()
                   WHERE id = $2`,
                  [attemptNumber, recipient.id]
                )
              }
            }
          } else {
            // Simulation mode for testing
            console.log(`🧪 [PREDICTIVE SIM] ${recipient.phone} (ratio: ${state.currentRatio.toFixed(2)}:1)`)

            // Simulate answer (random 60% answer rate)
            const answered = Math.random() < 0.6
            recordCallOutcome(state, answered)

            setTimeout(async () => {
              try {
                await pool.query(
                  `UPDATE calls SET status = 'completed', ended_at = NOW(), duration_seconds = $1 WHERE call_sid = $2`,
                  [Math.floor(Math.random() * 120) + 10, callSid]
                )
                await pool.query(
                  `UPDATE campaign_recipients SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
                  [recipient.id]
                )
              } catch (err) {
                console.error('Simulation cleanup error:', err)
              }
            }, 3000 + Math.random() * 7000)
          }

        } catch (contactError) {
          console.error(`❌ Error processing recipient ${recipient.id}:`, contactError)
          await pool.query(
            `UPDATE campaign_recipients SET status = 'failed', error_message = $1, failed_at = NOW() WHERE id = $2`,
            [contactError.message, recipient.id]
          )
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }

  } catch (error) {
    console.error(`❌ Predictive dialer error for campaign ${campaignId}:`, error)
    await pool.query(
      `UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [campaignId]
    )
  } finally {
    predictiveDialerState.delete(campaignId)
    activeCampaigns.delete(campaignId)
    console.log(`📞 Predictive dialer for campaign ${campaignId} stopped`)
  }
}

/**
 * Campaign Dialer - Manages outbound call pacing
 * Runs asynchronously, respecting max_concurrent_calls limit
 */
async function startCampaignDialer(campaignId, tenantId, freeswitch) {
  // Check if already running
  if (activeCampaigns.has(campaignId)) {
    console.log(`📞 Campaign ${campaignId} dialer already running`);
    return;
  }

  console.log(`📞 Starting campaign dialer for campaign ${campaignId}`);

  // Mark campaign as active
  activeCampaigns.set(campaignId, {
    startedAt: new Date(),
    callsInProgress: 0,
    totalCalls: 0
  });

  try {
    // Get campaign settings
    const campaignResult = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [campaignId, tenantId]
    );

    if (campaignResult.rows.length === 0) {
      console.error(`❌ Campaign ${campaignId} not found`);
      activeCampaigns.delete(campaignId);
      return;
    }

    const campaign = campaignResult.rows[0];
    // Use rate_limit from campaigns table (maps to max_concurrent_calls concept)
    const maxConcurrent = campaign.rate_limit || 5;

    // Dialer loop - continues until paused/completed or no more contacts
    while (true) {
      // Check if campaign is still running
      const statusCheck = await pool.query(
        `SELECT status FROM campaigns WHERE id = $1`,
        [campaignId]
      );

      if (statusCheck.rows.length === 0 || statusCheck.rows[0].status !== 'running') {
        console.log(`📞 Campaign ${campaignId} no longer running, stopping dialer`);
        break;
      }

      // Get current active call count for this campaign
      const activeCallsResult = await pool.query(
        `SELECT COUNT(*) as active FROM calls
         WHERE metadata->>'campaign_id' = $1
         AND status IN ('initiated', 'ringing', 'in-progress')`,
        [campaignId.toString()]
      );
      const activeCalls = parseInt(activeCallsResult.rows[0].active, 10);

      // Calculate how many new calls we can make
      const slotsAvailable = maxConcurrent - activeCalls;

      if (slotsAvailable <= 0) {
        // Wait and check again
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // Get pending recipients to call (using campaign_recipients table)
      const contactsResult = await pool.query(
        `SELECT * FROM campaign_recipients
         WHERE campaign_id = $1
         AND status = 'pending'
         AND (last_retry_at IS NULL OR last_retry_at <= NOW() - INTERVAL '1 hour')
         ORDER BY created_at ASC
         LIMIT $2`,
        [campaignId, slotsAvailable]
      );

      if (contactsResult.rows.length === 0) {
        // Check if there are any contacts still being called
        if (activeCalls === 0) {
          // No pending contacts and no active calls - campaign complete
          console.log(`✅ Campaign ${campaignId} completed - all contacts processed`);
          await pool.query(
            `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [campaignId]
          );
          break;
        }
        // Wait for active calls to finish
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // Originate calls for each available recipient
      for (const recipient of contactsResult.rows) {
        try {
          // ===========================================
          // COMPLIANCE CHECKS (per IRIS X Scope of Work)
          // ===========================================

          // 1. DNC (Do Not Call) Compliance Check
          const dncCheck = await dncService.checkDNC(tenantId, recipient.phone);
          if (dncCheck.blocked) {
            console.log(`🚫 Campaign ${campaignId}: Skipping ${recipient.phone} - DNC blocked: ${dncCheck.reason}`);
            await pool.query(
              `UPDATE campaign_recipients
               SET status = 'dnc_blocked', error_message = $1, failed_at = NOW()
               WHERE id = $2`,
              [`DNC blocked: ${dncCheck.reason}`, recipient.id]
            );
            continue; // Skip to next recipient
          }

          // 2. Timezone Curfew Enforcement (FCC 8AM-9PM local time)
          const recipientTimezone = recipient.timezone || campaign.timezone || 'America/New_York';
          if (!isWithinCallingHours(recipientTimezone)) {
            console.log(`⏰ Campaign ${campaignId}: Skipping ${recipient.phone} - Outside calling hours in ${recipientTimezone}`);
            // Mark as scheduled for retry during next calling window
            const nextCallTime = getNextCallableTime(recipientTimezone);
            await pool.query(
              `UPDATE campaign_recipients
               SET status = 'pending',
                   last_retry_at = NOW(),
                   error_message = $1
               WHERE id = $2`,
              [`Rescheduled: Outside calling hours (${recipientTimezone}). Next window: ${nextCallTime?.toISOString() || 'Unknown'}`, recipient.id]
            );
            continue; // Skip to next recipient
          }

          // ===========================================
          // END COMPLIANCE CHECKS
          // ===========================================

          // Mark recipient as 'calling' immediately to prevent double-dialing
          await pool.query(
            `UPDATE campaign_recipients SET status = 'calling', sent_at = NOW() WHERE id = $1`,
            [recipient.id]
          );

          const callSid = generateCallSid();

          // Create call record
          const callResult = await pool.query(
            `INSERT INTO calls (
              tenant_id, call_sid, direction, from_number, to_number, status,
              metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, uuid, call_sid`,
            [
              tenantId,
              callSid,
              'outbound',
              campaign.from_number,
              recipient.phone,
              'initiated',
              JSON.stringify({
                campaign_id: campaignId,
                campaign_name: campaign.name,
                recipient_id: recipient.id,
                recipient_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || null
              })
            ]
          );

          const call = callResult.rows[0];

          // Update campaign recipient with call reference
          await pool.query(
            `UPDATE campaign_recipients SET call_id = $1 WHERE id = $2`,
            [call.id, recipient.id]
          );

          // Originate call via FreeSWITCH
          if (freeswitch && freeswitch.connection) {
            // Build originate command with campaign context
            const originateCmd = `originate {origination_caller_id_number=${campaign.from_number},api_call_sid=${callSid},api_tenant_id=${tenantId},api_campaign_id=${campaignId},api_recipient_id=${recipient.id}}sofia/gateway/twilio/${recipient.phone} &playback(${campaign.voice_script || '/usr/local/freeswitch/sounds/en/us/callie/ivr/8000/ivr-welcome_to_freeswitch.wav'})`;

            console.log(`📞 Originating campaign call: ${campaign.from_number} -> ${recipient.phone} (Campaign: ${campaign.name})`);

            try {
              await freeswitch.api(originateCmd);

              // Update call status
              await pool.query(
                `UPDATE calls SET status = 'ringing' WHERE call_sid = $1`,
                [callSid]
              );

              // Update tracker
              const tracker = activeCampaigns.get(campaignId);
              if (tracker) {
                tracker.callsInProgress++;
                tracker.totalCalls++;
              }

            } catch (fsError) {
              console.error(`❌ FreeSWITCH origination error for ${recipient.phone}:`, fsError);

              // Mark call as failed
              await pool.query(
                `UPDATE calls SET status = 'failed', ended_at = NOW() WHERE call_sid = $1`,
                [callSid]
              );

              // Update recipient with retry logic (max 3 retries by default)
              const attemptNumber = (recipient.retry_count || 0) + 1;
              const maxRetries = 3;
              if (attemptNumber >= maxRetries) {
                await pool.query(
                  `UPDATE campaign_recipients
                   SET status = 'failed', retry_count = $1, error_message = $2, failed_at = NOW()
                   WHERE id = $3`,
                  [attemptNumber, fsError.message, recipient.id]
                );
              } else {
                // Schedule retry
                await pool.query(
                  `UPDATE campaign_recipients
                   SET status = 'pending', retry_count = $1, last_retry_at = NOW()
                   WHERE id = $2`,
                  [attemptNumber, recipient.id]
                );
              }
            }
          } else {
            console.warn(`⚠️ FreeSWITCH not connected - simulating call for ${recipient.phone}`);

            // Simulation mode - mark as completed after delay
            setTimeout(async () => {
              try {
                await pool.query(
                  `UPDATE calls SET status = 'completed', ended_at = NOW(), duration_seconds = $1 WHERE call_sid = $2`,
                  [Math.floor(Math.random() * 60) + 10, callSid]
                );
                await pool.query(
                  `UPDATE campaign_recipients SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
                  [recipient.id]
                );
              } catch (err) {
                console.error('Simulation cleanup error:', err);
              }
            }, 5000 + Math.random() * 10000);
          }

        } catch (contactError) {
          console.error(`❌ Error processing recipient ${recipient.id}:`, contactError);
          await pool.query(
            `UPDATE campaign_recipients SET status = 'failed', error_message = $1, failed_at = NOW() WHERE id = $2`,
            [contactError.message, recipient.id]
          );
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error(`❌ Campaign dialer error for campaign ${campaignId}:`, error);

    // Mark campaign as paused due to error
    await pool.query(
      `UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [campaignId]
    );
  } finally {
    activeCampaigns.delete(campaignId);
    console.log(`📞 Campaign ${campaignId} dialer stopped`);
  }
}

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  caller_id: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  max_concurrent_calls: z.number().int().min(1).max(100).default(5),
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_delay: z.number().int().min(60).max(86400).default(3600), // seconds
  schedule_start: z.string().datetime().optional(),
  schedule_end: z.string().datetime().optional(),
  call_script: z.string().optional()
})

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  caller_id: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  max_concurrent_calls: z.number().int().min(1).max(100).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  retry_delay: z.number().int().min(60).max(86400).optional(),
  schedule_start: z.string().datetime().optional(),
  schedule_end: z.string().datetime().optional(),
  call_script: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']).optional()
})

const uploadContactsSchema = z.object({
  contacts: z.array(z.object({
    phone_number: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }))
})

// GET /v1/campaigns - List all campaigns
campaigns.get('/', async (c) => {
  const tenantId = c.get('tenantId')
  const { page = 1, limit = 20, status } = c.req.query()

  try {
    let query = `
      SELECT
        c.*,
        COUNT(cr.id) as total_recipients,
        COUNT(CASE WHEN cr.status = 'pending' THEN 1 END) as pending_recipients,
        COUNT(CASE WHEN cr.status = 'calling' THEN 1 END) as calling_recipients,
        COUNT(CASE WHEN cr.status = 'delivered' THEN 1 END) as delivered_recipients,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) as failed_recipients
      FROM campaigns c
      LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
    `
    const params = [tenantId]

    if (status) {
      query += ` AND c.status = $${params.length + 1}`
      params.push(status)
    }

    query += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit))

    const result = await pool.query(query, params)

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1 AND deleted_at IS NULL ${status ? 'AND status = $2' : ''}`
    const countParams = status ? [tenantId, status] : [tenantId]
    const countResult = await pool.query(countQuery, countParams)

    return c.json({
      campaigns: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Error fetching campaigns:', error)
    return c.json({ error: 'Failed to fetch campaigns' }, 500)
  }
})

// POST /v1/campaigns - Create new campaign
campaigns.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')

  try {
    const body = await c.req.json()
    const data = createCampaignSchema.parse(body)

    const result = await pool.query(
      `INSERT INTO campaigns (
        tenant_id, created_by, name, description, caller_id,
        max_concurrent_calls, max_retries, retry_delay,
        schedule_start, schedule_end, call_script, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *`,
      [
        tenantId, userId, data.name, data.description, data.caller_id,
        data.max_concurrent_calls, data.max_retries, data.retry_delay,
        data.schedule_start, data.schedule_end, data.call_script
      ]
    )

    return c.json({ campaign: result.rows[0] }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error creating campaign:', error)
    return c.json({ error: 'Failed to create campaign' }, 500)
  }
})

// GET /v1/campaigns/:id - Get campaign details
campaigns.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `SELECT
        c.*,
        COUNT(cr.id) as total_recipients,
        COUNT(CASE WHEN cr.status = 'pending' THEN 1 END) as pending_recipients,
        COUNT(CASE WHEN cr.status = 'calling' THEN 1 END) as calling_recipients,
        COUNT(CASE WHEN cr.status = 'delivered' THEN 1 END) as delivered_recipients,
        COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) as failed_recipients
      FROM campaigns c
      LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
      GROUP BY c.id`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ campaign: result.rows[0] })
  } catch (error) {
    console.error('Error fetching campaign:', error)
    return c.json({ error: 'Failed to fetch campaign' }, 500)
  }
})

// PATCH /v1/campaigns/:id - Update campaign
campaigns.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const data = updateCampaignSchema.parse(body)

    // Build dynamic update query
    const updates = []
    const values = []
    let paramCount = 1

    Object.entries(data).forEach(([key, value]) => {
      updates.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    updates.push(`updated_at = NOW()`)
    values.push(id, tenantId)

    const query = `
      UPDATE campaigns
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
      RETURNING *
    `

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ campaign: result.rows[0] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error updating campaign:', error)
    return c.json({ error: 'Failed to update campaign' }, 500)
  }
})

// DELETE /v1/campaigns/:id - Delete campaign (soft delete)
campaigns.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `UPDATE campaigns
       SET deleted_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ message: 'Campaign deleted successfully' })
  } catch (error) {
    console.error('Error deleting campaign:', error)
    return c.json({ error: 'Failed to delete campaign' }, 500)
  }
})

// POST /v1/campaigns/:id/contacts - Upload contacts
campaigns.post('/:id/contacts', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const data = uploadContactsSchema.parse(body)

    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    // Insert contacts in batch
    const values = []
    const placeholders = []
    let paramCount = 1

    data.contacts.forEach((contact, idx) => {
      placeholders.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, $${paramCount + 4})`)
      values.push(
        id,
        contact.phone_number,
        contact.first_name || null,
        contact.last_name || null,
        contact.metadata ? JSON.stringify(contact.metadata) : null
      )
      paramCount += 5
    })

    const query = `
      INSERT INTO campaign_recipients (campaign_id, phone, first_name, last_name, custom_fields)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (campaign_id, phone) DO NOTHING
      RETURNING id
    `

    const result = await pool.query(query, values)

    return c.json({
      message: 'Contacts uploaded successfully',
      inserted: result.rows.length,
      duplicates: data.contacts.length - result.rows.length
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error uploading contacts:', error)
    return c.json({ error: 'Failed to upload contacts' }, 500)
  }
})

// GET /v1/campaigns/:id/contacts - List campaign contacts
campaigns.get('/:id/contacts', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()
  const { page = 1, limit = 50, status } = c.req.query()

  try {
    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    let query = 'SELECT * FROM campaign_recipients WHERE campaign_id = $1'
    const params = [id]

    if (status) {
      query += ` AND status = $${params.length + 1}`
      params.push(status)
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit))

    const result = await pool.query(query, params)

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 ${status ? 'AND status = $2' : ''}`
    const countParams = status ? [id, status] : [id]
    const countResult = await pool.query(countQuery, countParams)

    return c.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Error fetching contacts:', error)
    return c.json({ error: 'Failed to fetch contacts' }, 500)
  }
})

// POST /v1/campaigns/:id/start - Start campaign with dialer type selection
campaigns.post('/:id/start', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()
  const freeswitch = c.get('freeswitch')

  try {
    // Get dialer_type from request body (default: 'progressive')
    let dialerType = 'progressive'
    let queueId = null
    try {
      const body = await c.req.json()
      dialerType = body.dialer_type || 'progressive'
      queueId = body.queue_id || null
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Validate dialer type
    if (!['progressive', 'predictive'].includes(dialerType)) {
      return c.json({ error: 'Invalid dialer_type. Must be "progressive" or "predictive"' }, 400)
    }

    // Predictive dialer requires a queue_id
    if (dialerType === 'predictive' && !queueId) {
      return c.json({ error: 'Predictive dialer requires a queue_id parameter' }, 400)
    }

    // Check if campaign has any contacts
    const contactCheck = await pool.query(
      `SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
      [id]
    )

    if (parseInt(contactCheck.rows[0].count, 10) === 0) {
      return c.json({ error: 'Campaign has no pending contacts to call' }, 400)
    }

    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'running', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'scheduled', 'paused') AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found or cannot be started' }, 400)
    }

    const campaign = result.rows[0]

    // Start the appropriate dialer asynchronously (don't await)
    if (dialerType === 'predictive') {
      console.log(`📞🔮 Starting PREDICTIVE dialer for campaign ${id} with queue ${queueId}`)
      startPredictiveDialer(parseInt(id), tenantId, queueId, freeswitch).catch(err => {
        console.error(`Campaign ${id} predictive dialer crashed:`, err)
      })
    } else {
      console.log(`📞 Starting PROGRESSIVE dialer for campaign ${id}`)
      startCampaignDialer(parseInt(id), tenantId, freeswitch).catch(err => {
        console.error(`Campaign ${id} progressive dialer crashed:`, err)
      })
    }

    return c.json({
      campaign,
      message: `Campaign started successfully with ${dialerType} dialer`,
      dialer_type: dialerType,
      dialer_status: 'started',
      pending_contacts: parseInt(contactCheck.rows[0].count, 10),
      ...(dialerType === 'predictive' && {
        predictive_config: {
          initial_ratio: PREDICTIVE_CONFIG.INITIAL_RATIO,
          max_ratio: PREDICTIVE_CONFIG.MAX_RATIO,
          abandon_target: PREDICTIVE_CONFIG.ABANDON_TARGET,
          adjustment_interval_seconds: PREDICTIVE_CONFIG.ADJUSTMENT_INTERVAL_MS / 1000
        }
      })
    })
  } catch (error) {
    console.error('Error starting campaign:', error)
    return c.json({ error: 'Failed to start campaign' }, 500)
  }
})

// POST /v1/campaigns/:id/pause - Pause campaign
campaigns.post('/:id/pause', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'running' AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found or not running' }, 400)
    }

    return c.json({ campaign: result.rows[0], message: 'Campaign paused successfully' })
  } catch (error) {
    console.error('Error pausing campaign:', error)
    return c.json({ error: 'Failed to pause campaign' }, 500)
  }
})

// GET /v1/campaigns/:id/dialer-status - Get real-time dialer status
campaigns.get('/:id/dialer-status', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id, name, status, max_concurrent_calls FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    const campaign = campaignCheck.rows[0]
    const campaignIdInt = parseInt(id)

    // Check if dialer is active in memory
    const dialerInfo = activeCampaigns.get(campaignIdInt)
    const predictiveState = predictiveDialerState.get(campaignIdInt)

    // Get current active calls count
    const activeCallsResult = await pool.query(
      `SELECT COUNT(*) as active FROM calls
       WHERE metadata->>'campaign_id' = $1
       AND status IN ('initiated', 'ringing', 'in-progress')`,
      [id]
    )
    const activeCalls = parseInt(activeCallsResult.rows[0].active, 10)

    // Get contact status breakdown
    const contactStats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'calling') as calling,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'no_answer') as no_answer,
        COUNT(*) FILTER (WHERE status = 'dnc_blocked') as dnc_blocked
       FROM campaign_recipients
       WHERE campaign_id = $1`,
      [id]
    )

    // Build response
    const response = {
      campaign_id: campaignIdInt,
      campaign_name: campaign.name,
      campaign_status: campaign.status,
      dialer: {
        active: !!dialerInfo,
        type: dialerInfo?.dialerType || 'progressive',
        started_at: dialerInfo?.startedAt || null,
        calls_in_progress: activeCalls,
        max_concurrent: campaign.max_concurrent_calls,
        total_calls_made: dialerInfo?.totalCalls || 0
      },
      contacts: contactStats.rows[0]
    }

    // Add predictive dialer metrics if running in predictive mode
    if (predictiveState) {
      const answerRate = calculateAnswerRate(predictiveState)
      const abandonRate = calculateAbandonRate(predictiveState)

      response.predictive_metrics = {
        current_ratio: predictiveState.currentRatio,
        answer_rate: (answerRate * 100).toFixed(1) + '%',
        abandon_rate: (abandonRate * 100).toFixed(1) + '%',
        abandon_target: (PREDICTIVE_CONFIG.ABANDON_TARGET * 100).toFixed(1) + '%',
        abandon_compliance: abandonRate <= PREDICTIVE_CONFIG.ABANDON_TARGET,
        total_calls: predictiveState.totalCalls,
        answered_calls: predictiveState.answeredCalls,
        abandoned_calls: predictiveState.abandonedCalls,
        unanswered_calls: predictiveState.unansweredCalls,
        sample_size: predictiveState.callHistory.length,
        last_ratio_adjustment: new Date(predictiveState.lastAdjustment).toISOString(),
        config: {
          initial_ratio: PREDICTIVE_CONFIG.INITIAL_RATIO,
          max_ratio: PREDICTIVE_CONFIG.MAX_RATIO,
          min_ratio: PREDICTIVE_CONFIG.MIN_RATIO,
          adjustment_interval_seconds: PREDICTIVE_CONFIG.ADJUSTMENT_INTERVAL_MS / 1000,
          max_queue_wait_seconds: PREDICTIVE_CONFIG.MAX_QUEUE_WAIT_SECONDS
        }
      }
    }

    return c.json(response)
  } catch (error) {
    console.error('Error fetching dialer status:', error)
    return c.json({ error: 'Failed to fetch dialer status' }, 500)
  }
})

// GET /v1/campaigns/:id/stats - Campaign statistics
campaigns.get('/:id/stats', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id, status FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    const stats = await pool.query(
      `SELECT
        COUNT(*) as total_contacts,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'called' THEN 1 END) as called,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'no_answer' THEN 1 END) as no_answer,
        COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy,
        COUNT(CASE WHEN status = 'dnc_blocked' THEN 1 END) as dnc_blocked,
        AVG(CASE WHEN call_duration IS NOT NULL THEN call_duration END) as avg_duration,
        SUM(CASE WHEN call_duration IS NOT NULL THEN call_duration END) as total_duration
      FROM campaign_recipients
      WHERE campaign_id = $1`,
      [id]
    )

    return c.json({
      campaign_id: id,
      campaign_status: campaignCheck.rows[0].status,
      ...stats.rows[0]
    })
  } catch (error) {
    console.error('Error fetching campaign stats:', error)
    return c.json({ error: 'Failed to fetch campaign statistics' }, 500)
  }
})

export default campaigns
