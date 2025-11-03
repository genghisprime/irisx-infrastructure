import usageTracking from './usage-tracking.js';
import pool from '../db/connection.js';

/**
 * Usage Recorder Service
 * Automatically records usage events based on API activity
 * Integrates with existing API endpoints via event hooks
 */

class UsageRecorder {
  /**
   * Record voice call usage
   * Called when a call completes
   * @param {Object} callData - Call data from database
   */
  async recordCallUsage(callData) {
    try {
      const { id, tenant_id, call_sid, duration_seconds, from_number, to_number } = callData;

      if (!duration_seconds || duration_seconds <= 0) {
        console.log(`Skipping usage recording for call ${call_sid}: no duration`);
        return null;
      }

      // Convert seconds to minutes for billing
      const minutes = parseFloat((duration_seconds / 60).toFixed(4));

      const usageResult = await usageTracking.recordUsage({
        tenantId: tenant_id,
        channel: 'voice',
        resourceType: 'minute',
        resourceId: call_sid,
        quantity: minutes,
        metadata: {
          call_id: id,
          from: from_number,
          to: to_number,
          duration_seconds
        }
      });

      console.log(`📊 Recorded voice usage: ${minutes} minutes ($${usageResult.cost}) for call ${call_sid}`);

      return usageResult;
    } catch (error) {
      console.error('Error recording call usage:', error);
      // Don't throw - usage recording shouldn't break the main flow
      return null;
    }
  }

  /**
   * Record SMS/MMS usage
   * Called when a message is sent
   * @param {Object} messageData - Message data from database
   */
  async recordMessageUsage(messageData) {
    try {
      const { id, tenant_id, message_sid, direction, from_number, to_number, media_urls } = messageData;

      // Only record outbound messages (customer-initiated)
      if (direction !== 'outbound') {
        return null;
      }

      // Determine if it's MMS (has media) or SMS
      const hasMMS = media_urls && (Array.isArray(media_urls) ? media_urls.length > 0 : media_urls !== '[]');
      const resourceType = hasMMS ? 'mms' : 'message';

      const usageResult = await usageTracking.recordUsage({
        tenantId: tenant_id,
        channel: 'sms',
        resourceType,
        resourceId: message_sid,
        quantity: 1,
        metadata: {
          message_id: id,
          from: from_number,
          to: to_number,
          type: hasMMS ? 'mms' : 'sms'
        }
      });

      console.log(`📊 Recorded ${resourceType.toUpperCase()} usage: 1 message ($${usageResult.cost}) - ${message_sid}`);

      return usageResult;
    } catch (error) {
      console.error('Error recording message usage:', error);
      return null;
    }
  }

  /**
   * Record email usage
   * Called when an email is sent
   * @param {Object} emailData - Email data from database
   */
  async recordEmailUsage(emailData) {
    try {
      const { id, tenant_id, message_id, from_email, to_emails, subject } = emailData;

      // Count number of recipients
      const recipientCount = Array.isArray(to_emails) ? to_emails.length : 1;

      const usageResult = await usageTracking.recordUsage({
        tenantId: tenant_id,
        channel: 'email',
        resourceType: 'message',
        resourceId: message_id,
        quantity: recipientCount,
        metadata: {
          email_id: id,
          from: from_email,
          to_count: recipientCount,
          subject: subject?.substring(0, 100)
        }
      });

      console.log(`📊 Recorded email usage: ${recipientCount} messages ($${usageResult.cost}) - ${message_id}`);

      return usageResult;
    } catch (error) {
      console.error('Error recording email usage:', error);
      return null;
    }
  }

  /**
   * Record WhatsApp usage
   * Called when a WhatsApp message is sent
   * @param {Object} whatsappData - WhatsApp message data
   */
  async recordWhatsAppUsage(whatsappData) {
    try {
      const { id, tenant_id, message_sid, direction, from_number, to_number } = whatsappData;

      // Only record outbound messages
      if (direction !== 'outbound') {
        return null;
      }

      const usageResult = await usageTracking.recordUsage({
        tenantId: tenant_id,
        channel: 'whatsapp',
        resourceType: 'message',
        resourceId: message_sid,
        quantity: 1,
        metadata: {
          message_id: id,
          from: from_number,
          to: to_number
        }
      });

      console.log(`📊 Recorded WhatsApp usage: 1 message ($${usageResult.cost}) - ${message_sid}`);

      return usageResult;
    } catch (error) {
      console.error('Error recording WhatsApp usage:', error);
      return null;
    }
  }

  /**
   * Batch record usage from call completion webhook
   * This is called by FreeSWITCH CDR webhook
   * @param {Object} cdrData - CDR (Call Detail Record) from FreeSWITCH
   */
  async recordCallFromCDR(cdrData) {
    try {
      const { call_sid, duration_seconds } = cdrData;

      if (!call_sid) {
        console.error('CDR missing call_sid');
        return null;
      }

      // Fetch call from database
      const result = await pool.query(
        'SELECT id, tenant_id, call_sid, duration_seconds, from_number, to_number FROM calls WHERE call_sid = $1',
        [call_sid]
      );

      if (result.rows.length === 0) {
        console.error(`Call not found in database: ${call_sid}`);
        return null;
      }

      const call = result.rows[0];

      // Update duration if provided in CDR and not already set
      if (duration_seconds && !call.duration_seconds) {
        await pool.query(
          'UPDATE calls SET duration_seconds = $1, updated_at = NOW() WHERE call_sid = $2',
          [duration_seconds, call_sid]
        );
        call.duration_seconds = duration_seconds;
      }

      return await this.recordCallUsage(call);
    } catch (error) {
      console.error('Error recording usage from CDR:', error);
      return null;
    }
  }

  /**
   * Setup database triggers to auto-record usage
   * This is called on app startup to ensure triggers exist
   */
  async setupDatabaseTriggers() {
    try {
      // Note: These triggers would be created in a migration
      // This is just a placeholder to document the approach
      console.log('Usage recorder initialized - manual recording mode');
      console.log('For automatic recording, run migration to add database triggers');

      // In a real setup, we'd create PostgreSQL triggers like:
      // CREATE TRIGGER after_call_complete
      // AFTER UPDATE ON calls
      // WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
      // EXECUTE FUNCTION record_call_usage();

      return true;
    } catch (error) {
      console.error('Error setting up database triggers:', error);
      return false;
    }
  }

  /**
   * Backfill usage records for existing data
   * Use this to populate usage for historical calls/messages
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async backfillUsage(startDate, endDate) {
    try {
      console.log(`Starting usage backfill from ${startDate} to ${endDate}...`);
      let totalRecorded = 0;

      // Backfill calls
      const calls = await pool.query(
        `SELECT id, tenant_id, call_sid, duration_seconds, from_number, to_number
         FROM calls
         WHERE status = 'completed'
           AND duration_seconds > 0
           AND created_at >= $1
           AND created_at < $2 + INTERVAL '1 day'
           AND NOT EXISTS (
             SELECT 1 FROM usage_records
             WHERE resource_id = calls.call_sid
           )`,
        [startDate, endDate]
      );

      for (const call of calls.rows) {
        await this.recordCallUsage(call);
        totalRecorded++;
      }

      console.log(`✅ Backfill complete: ${totalRecorded} usage records created`);

      return { success: true, recordsCreated: totalRecorded };
    } catch (error) {
      console.error('Error during usage backfill:', error);
      throw error;
    }
  }
}

export default new UsageRecorder();
