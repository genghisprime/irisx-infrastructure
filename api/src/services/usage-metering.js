import { query } from ../db/connection.js;

/**
 * Usage Metering Service
 * Tracks usage for billing and analytics
 */
export class UsageMeteringService {
  constructor() {
    this.pendingEvents = [];
    this.flushInterval = 30000; // Flush every 30 seconds
    this.maxPendingEvents = 100; //  Flush when we hit 100 events
    
    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Record usage event
   */
  async recordEvent(event) {
    try {
      const usageEvent = {
        tenant_id: event.tenantId,
        event_type: event.eventType,
        event_timestamp: event.timestamp || new Date(),
        call_id: event.callId || null,
        recording_id: event.recordingId || null,
        sms_id: event.smsId || null,
        api_key_id: event.apiKeyId || null,
        duration_seconds: event.durationSeconds || null,
        size_bytes: event.sizeBytes || null,
        cost_cents: event.costCents || null,
        metadata: event.metadata || {}
      };

      // Add to pending queue
      this.pendingEvents.push(usageEvent);

      console.log(`📊 Usage event queued: ${event.eventType} for tenant ${event.tenantId}`);

      // Flush if we hit the max pending events
      if (this.pendingEvents.length >= this.maxPendingEvents) {
        await this.flush();
      }

      return usageEvent;
    } catch (error) {
      console.error(Failed to record usage event:, error);
      throw error;
    }
  }

  /**
   * Flush pending events to database
   */
  async flush() {
    if (this.pendingEvents.length === 0) {
      return;
    }

    const eventsToFlush = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      console.log(`💾 Flushing ${eventsToFlush.length} usage events to database`);

      // Batch insert events
      for (const event of eventsToFlush) {
        await query(
          `INSERT INTO usage_events (tenant_id, event_type, event_timestamp, call_id, recording_id, sms_id, api_key_id, duration_seconds, size_bytes, cost_cents, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            event.tenant_id,
            event.event_type,
            event.event_timestamp,
            event.call_id,
            event.recording_id,
            event.sms_id,
            event.api_key_id,
            event.duration_seconds,
            event.size_bytes,
            event.cost_cents,
            JSON.stringify(event.metadata)
          ]
        );
      }

      console.log(`✅ Flushed ${eventsToFlush.length} usage events`);
    } catch (error) {
      console.error(Failed to flush usage events:, error);
      // Put events back in queue
      this.pendingEvents = [...eventsToFlush, ...this.pendingEvents];
    }
  }

  /**
   * Start periodic flush timer
   */
  startPeriodicFlush() {
    setInterval(async () => {
      await this.flush();
    }, this.flushInterval);
  }

  /**
   * Aggregate usage for a tenant on a specific date
   */
  async aggregateUsageForDate(tenantId, date) {
    try {
      console.log(`📈 Aggregating usage for tenant ${tenantId} on ${date}`);

      // Get call stats
      const callStats = await query(
        `SELECT 
          COUNT(*) FILTER (WHERE direction = inbound) as inbound_count,
          COUNT(*) FILTER (WHERE direction = outbound) as outbound_count,
          COALESCE(SUM(duration_seconds) FILTER (WHERE direction = inbound), 0) / 60.0 as inbound_minutes,
          COALESCE(SUM(duration_seconds) FILTER (WHERE direction = outbound), 0) / 60.0 as outbound_minutes
        FROM calls
        WHERE tenant_id = $1 AND DATE(initiated_at) = $2`,
        [tenantId, date]
      );

      // Get recording stats
      const recordingStats = await query(
        `SELECT 
          COUNT(*) as count,
          COALESCE(SUM(recording_size_bytes), 0) as total_bytes,
          COALESCE(SUM(duration_seconds), 0) / 60.0 as total_minutes
        FROM calls
        WHERE tenant_id = $1 AND DATE(initiated_at) = $2 AND recording_url IS NOT NULL`,
        [tenantId, date]
      );

      // Get active phone numbers
      const phoneNumberStats = await query(
        `SELECT COUNT(*) as count
        FROM phone_numbers
        WHERE tenant_id = $1 AND status = active`,
        [tenantId]
      );

      const calls = callStats.rows[0];
      const recordings = recordingStats.rows[0];
      const phoneNumbers = phoneNumberStats.rows[0];

      const totalMinutes = parseFloat(calls.inbound_minutes) + parseFloat(calls.outbound_minutes);

      // Calculate costs (example pricing)
      const callCostCents = Math.ceil(totalMinutes * 1.5); // $0.015/min
      const recordingCostCents = Math.ceil(parseInt(recordings.count) * 5); // $0.05/recording
      const phoneNumberCostCents = parseInt(phoneNumbers.count) * 100; // $1/number/day

      // Upsert usage record
      await query(
        `INSERT INTO tenant_usage (
          tenant_id, usage_date,
          calls_inbound_count, calls_outbound_count,
          call_minutes_inbound, call_minutes_outbound, call_minutes_total,
          recordings_count, recordings_size_bytes, recordings_duration_minutes,
          phone_numbers_active,
          cost_calls_cents, cost_recordings_cents, cost_phone_numbers_cents, cost_total_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (tenant_id, usage_date)
        DO UPDATE SET
          calls_inbound_count = EXCLUDED.calls_inbound_count,
          calls_outbound_count = EXCLUDED.calls_outbound_count,
          call_minutes_inbound = EXCLUDED.call_minutes_inbound,
          call_minutes_outbound = EXCLUDED.call_minutes_outbound,
          call_minutes_total = EXCLUDED.call_minutes_total,
          recordings_count = EXCLUDED.recordings_count,
          recordings_size_bytes = EXCLUDED.recordings_size_bytes,
          recordings_duration_minutes = EXCLUDED.recordings_duration_minutes,
          phone_numbers_active = EXCLUDED.phone_numbers_active,
          cost_calls_cents = EXCLUDED.cost_calls_cents,
          cost_recordings_cents = EXCLUDED.cost_recordings_cents,
          cost_phone_numbers_cents = EXCLUDED.cost_phone_numbers_cents,
          cost_total_cents = EXCLUDED.cost_total_cents,
          updated_at = NOW()`,
        [
          tenantId, date,
          parseInt(calls.inbound_count), parseInt(calls.outbound_count),
          parseFloat(calls.inbound_minutes), parseFloat(calls.outbound_minutes), totalMinutes,
          parseInt(recordings.count), parseInt(recordings.total_bytes), parseFloat(recordings.total_minutes),
          parseInt(phoneNumbers.count),
          callCostCents, recordingCostCents, phoneNumberCostCents,
          callCostCents + recordingCostCents + phoneNumberCostCents
        ]
      );

      console.log(`✅ Usage aggregated for tenant ${tenantId} on ${date}`);

      return {
        tenantId,
        date,
        calls: {
          inbound: parseInt(calls.inbound_count),
          outbound: parseInt(calls.outbound_count),
          minutes: totalMinutes
        },
        recordings: {
          count: parseInt(recordings.count),
          bytes: parseInt(recordings.total_bytes)
        },
        costs: {
          calls: callCostCents,
          recordings: recordingCostCents,
          phoneNumbers: phoneNumberCostCents,
          total: callCostCents + recordingCostCents + phoneNumberCostCents
        }
      };
    } catch (error) {
      console.error(Failed to aggregate usage:, error);
      throw error;
    }
  }

  /**
   * Get usage summary for a tenant
   */
  async getUsageSummary(tenantId, startDate, endDate) {
    try {
      const result = await query(
        `SELECT 
          usage_date,
          calls_inbound_count + calls_outbound_count as total_calls,
          call_minutes_total,
          recordings_count,
          cost_total_cents
        FROM tenant_usage
        WHERE tenant_id = $1 AND usage_date BETWEEN $2 AND $3
        ORDER BY usage_date DESC`,
        [tenantId, startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      console.error(Failed to get usage summary:, error);
      throw error;
    }
  }
}

export default UsageMeteringService;
