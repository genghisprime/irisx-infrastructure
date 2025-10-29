import { query } from '../db/connection.js';
import carrierRouting from './carrierRouting.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Calls Service
 * Manages voice call creation, routing, and lifecycle with multi-carrier support
 *
 * Features:
 * - Automatic carrier selection using LCR
 * - Call cost calculation and tracking
 * - FreeSWITCH integration
 * - Complete call history
 * - Carrier performance tracking
 */
class CallsService {
  /**
   * Create a new outbound call with automatic carrier selection
   * @param {object} callData - Call parameters
   * @returns {object} - Created call with routing information
   */
  async createCall(callData) {
    const {
      tenant_id,
      from_number,
      to_number,
      caller_id,
      timeout_seconds = 60,
      record = false,
      metadata = {},
    } = callData;

    const startTime = Date.now();

    try {
      // Step 1: Select best carrier using LCR
      console.log(`[Calls] Creating call from ${from_number} to ${to_number}`);

      const routing = await carrierRouting.selectCarrier(to_number, {
        preferCost: true, // Use least-cost routing
        minimumHealthScore: 30,
      });

      if (!routing.primary) {
        throw new Error('No healthy carriers available for destination');
      }

      console.log(`[Calls] Selected carrier: ${routing.primary.name} ($${routing.primary.rate_per_minute}/min)`);

      // Step 2: Generate UUID for FreeSWITCH
      const callUuid = uuidv4();

      // Step 3: Create call record in database
      const callResult = await query(`
        INSERT INTO calls (
          uuid, tenant_id, direction, from_number, to_number, caller_id,
          status, carrier_id, carrier_rate, timeout_seconds, record, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        callUuid,
        tenant_id,
        'outbound',
        from_number,
        to_number,
        caller_id || from_number,
        'queued',
        routing.primary.id,
        routing.primary.rate_per_minute,
        timeout_seconds,
        record,
        JSON.stringify(metadata),
      ]);

      const call = callResult.rows[0];

      // Step 4: Log routing decision for analytics
      await carrierRouting.logRoutingDecision(
        call.id,
        tenant_id,
        to_number,
        routing
      );

      // Step 5: Build FreeSWITCH originate command
      const originateCommand = this.buildOriginateCommand({
        uuid: callUuid,
        to: to_number,
        from: caller_id || from_number,
        carrier: routing.primary,
        timeout: timeout_seconds,
        record,
      });

      const responseTime = Date.now() - startTime;

      return {
        call: {
          ...call,
          carrier_name: routing.primary.name,
          estimated_rate: routing.primary.rate_per_minute,
        },
        routing: {
          primary_carrier: routing.primary.name,
          backup_carriers: routing.alternates.map(c => c.name),
          selection_reason: routing.selection_reason,
          routing_duration_ms: routing.routing_duration_ms,
        },
        freeswitch_command: originateCommand,
        response_time_ms: responseTime,
      };
    } catch (error) {
      console.error(`[Calls] Error creating call:`, error);
      throw error;
    }
  }

  /**
   * Build FreeSWITCH originate command
   * @param {object} params - Command parameters
   * @returns {string} - FreeSWITCH originate command
   */
  buildOriginateCommand({ uuid, to, from, carrier, timeout, record }) {
    const vars = [
      `origination_uuid=${uuid}`,
      `origination_caller_id_number=${from}`,
      `origination_caller_id_name=${from}`,
      `carrier_id=${carrier.id}`,
      `carrier_name=${carrier.name}`,
    ];

    if (record) {
      vars.push(`RECORD_STEREO=true`);
      vars.push(`recording_follow_transfer=true`);
    }

    // Build gateway string based on carrier type
    let gatewayStr;
    if (carrier.type === 'twilio') {
      gatewayStr = `sofia/gateway/twilio/${to}`;
    } else if (carrier.type === 'telnyx') {
      gatewayStr = `sofia/gateway/telnyx/${to}`;
    } else if (carrier.type === 'bandwidth') {
      gatewayStr = `sofia/gateway/bandwidth/${to}`;
    } else {
      gatewayStr = `sofia/gateway/${carrier.gateway}/${to}`;
    }

    const command = `originate {${vars.join(',')}}${gatewayStr} &park()`;
    return command;
  }

  /**
   * Get a single call by UUID or ID
   * @param {string|number} identifier - Call UUID or database ID
   * @returns {object} - Call details with carrier info
   */
  async getCall(identifier) {
    const isUuid = typeof identifier === 'string' && identifier.includes('-');

    const sql = `
      SELECT
        c.*,
        car.name as carrier_name,
        car.type as carrier_type,
        car.health_score as carrier_health_score,
        CASE
          WHEN c.answered_at IS NOT NULL AND c.ended_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (c.ended_at - c.answered_at))::INTEGER
          ELSE c.duration_seconds
        END as actual_duration
      FROM calls c
      LEFT JOIN carriers car ON car.id = c.carrier_id
      WHERE ${isUuid ? 'c.uuid' : 'c.id'} = $1
    `;

    const result = await query(sql, [identifier]);

    if (result.rows.length === 0) {
      return null;
    }

    const call = result.rows[0];

    // Calculate cost if call is completed
    if (call.status === 'completed' && call.actual_duration > 0) {
      const cost = carrierRouting.calculateCallCost(
        call.actual_duration,
        parseFloat(call.carrier_rate)
      );
      call.cost_breakdown = cost;
    }

    return call;
  }

  /**
   * List calls with filtering and pagination
   * @param {object} filters - Filter criteria
   * @param {number} limit - Results limit
   * @param {number} offset - Results offset
   * @returns {array} - Array of calls
   */
  async listCalls(filters = {}, limit = 50, offset = 0) {
    const {
      tenant_id,
      direction,
      status,
      from_number,
      to_number,
      carrier_id,
      start_date,
      end_date,
    } = filters;

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (tenant_id) {
      conditions.push(`c.tenant_id = $${paramCount}`);
      params.push(tenant_id);
      paramCount++;
    }

    if (direction) {
      conditions.push(`c.direction = $${paramCount}`);
      params.push(direction);
      paramCount++;
    }

    if (status) {
      conditions.push(`c.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (from_number) {
      conditions.push(`c.from_number LIKE $${paramCount}`);
      params.push(`%${from_number}%`);
      paramCount++;
    }

    if (to_number) {
      conditions.push(`c.to_number LIKE $${paramCount}`);
      params.push(`%${to_number}%`);
      paramCount++;
    }

    if (carrier_id) {
      conditions.push(`c.carrier_id = $${paramCount}`);
      params.push(carrier_id);
      paramCount++;
    }

    if (start_date) {
      conditions.push(`c.created_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      conditions.push(`c.created_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        c.id,
        c.uuid,
        c.tenant_id,
        c.direction,
        c.from_number,
        c.to_number,
        c.status,
        c.created_at,
        c.answered_at,
        c.ended_at,
        c.duration_seconds,
        c.carrier_rate,
        c.carrier_cost,
        car.name as carrier_name,
        car.type as carrier_type
      FROM calls c
      LEFT JOIN carriers car ON car.id = c.carrier_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Update call status
   * @param {string} uuid - Call UUID
   * @param {string} status - New status
   * @param {object} updates - Additional fields to update
   * @returns {object} - Updated call
   */
  async updateCallStatus(uuid, status, updates = {}) {
    const fields = ['status = $2'];
    const params = [uuid, status];
    let paramCount = 3;

    if (updates.answered_at !== undefined) {
      fields.push(`answered_at = $${paramCount}`);
      params.push(updates.answered_at);
      paramCount++;
    }

    if (updates.ended_at !== undefined) {
      fields.push(`ended_at = $${paramCount}`);
      params.push(updates.ended_at);
      paramCount++;
    }

    if (updates.duration_seconds !== undefined) {
      fields.push(`duration_seconds = $${paramCount}`);
      params.push(updates.duration_seconds);
      paramCount++;
    }

    if (updates.hangup_cause !== undefined) {
      fields.push(`hangup_cause = $${paramCount}`);
      params.push(updates.hangup_cause);
      paramCount++;
    }

    const sql = `
      UPDATE calls
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE uuid = $1
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0];
  }

  /**
   * Complete a call and calculate final cost
   * @param {string} uuid - Call UUID
   * @param {number} durationSeconds - Actual call duration
   * @param {string} hangupCause - FreeSWITCH hangup cause
   * @returns {object} - Updated call with cost
   */
  async completeCall(uuid, durationSeconds, hangupCause = 'NORMAL_CLEARING') {
    // Get call details
    const call = await this.getCall(uuid);

    if (!call) {
      throw new Error(`Call ${uuid} not found`);
    }

    // Calculate final cost
    const cost = carrierRouting.calculateCallCost(
      durationSeconds,
      parseFloat(call.carrier_rate)
    );

    // Update call with final details
    const result = await query(`
      UPDATE calls
      SET
        status = 'completed',
        ended_at = NOW(),
        duration_seconds = $2,
        carrier_cost = $3,
        hangup_cause = $4,
        metadata = metadata || jsonb_build_object(
          'billed_duration_seconds', $5,
          'billed_minutes', $6,
          'rate_per_minute', $7
        ),
        updated_at = NOW()
      WHERE uuid = $1
      RETURNING *
    `, [
      uuid,
      durationSeconds,
      cost.total_cost,
      hangupCause,
      cost.billed_duration_seconds,
      cost.billed_minutes,
      cost.rate_per_minute,
    ]);

    const updatedCall = result.rows[0];

    // Update carrier health based on call success
    const callSuccess = hangupCause === 'NORMAL_CLEARING' && durationSeconds > 0;
    await carrierRouting.updateCarrierHealth(call.carrier_id, callSuccess);

    console.log(`[Calls] Call ${uuid} completed: ${durationSeconds}s, $${cost.total_cost} (carrier: ${call.carrier_name})`);

    return {
      ...updatedCall,
      cost_breakdown: cost,
    };
  }

  /**
   * Fail a call and update carrier health
   * @param {string} uuid - Call UUID
   * @param {string} reason - Failure reason
   * @returns {object} - Updated call
   */
  async failCall(uuid, reason = 'CALL_REJECTED') {
    const call = await this.getCall(uuid);

    if (!call) {
      throw new Error(`Call ${uuid} not found`);
    }

    const result = await query(`
      UPDATE calls
      SET
        status = 'failed',
        ended_at = NOW(),
        hangup_cause = $2,
        updated_at = NOW()
      WHERE uuid = $1
      RETURNING *
    `, [uuid, reason]);

    // Update carrier health (failure)
    if (call.carrier_id) {
      await carrierRouting.updateCarrierHealth(call.carrier_id, false);
    }

    console.log(`[Calls] Call ${uuid} failed: ${reason} (carrier: ${call.carrier_name})`);

    return result.rows[0];
  }

  /**
   * Get call statistics for a tenant
   * @param {number} tenant_id - Tenant ID
   * @param {object} dateRange - Date range filter
   * @returns {object} - Call statistics
   */
  async getCallStats(tenant_id, dateRange = {}) {
    const { start_date, end_date } = dateRange;
    const conditions = ['tenant_id = $1'];
    const params = [tenant_id];
    let paramCount = 2;

    if (start_date) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(end_date);
      paramCount++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const sql = `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
        COUNT(*) FILTER (WHERE status = 'no-answer') as no_answer_calls,
        SUM(duration_seconds) FILTER (WHERE status = 'completed') as total_duration_seconds,
        SUM(carrier_cost) as total_cost,
        AVG(carrier_cost) FILTER (WHERE carrier_cost IS NOT NULL) as avg_cost_per_call,
        AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration_seconds
      FROM calls
      ${whereClause}
    `;

    const result = await query(sql, params);
    return result.rows[0];
  }
}

export default new CallsService();
