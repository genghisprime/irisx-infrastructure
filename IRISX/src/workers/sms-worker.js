/**
 * SMS Worker
 * Consumes SMS messages from NATS JetStream and delivers them via Twilio
 *
 * Phase 1, Week 4
 */

import natsService from '../services/nats.js';
import { query } from '../db/index.js';

class SMSWorker {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    console.log('[SMS Worker] Starting...');
    this.isRunning = true;

    // Subscribe to SMS send jobs
    await natsService.subscribe(
      'SMS',
      'sms.send',
      'sms-sender',
      this.handleSMSSend.bind(this)
    );

    console.log('[SMS Worker] ✅ Started');
  }

  async handleSMSSend(data, msg) {
    const { messageId, tenantId, from, to, body, mediaUrls } = data;

    try {
      console.log(`[SMS Worker] Processing SMS ${messageId}`);

      // Get tenant Twilio config
      const configResult = await query(
        `SELECT twilio_account_sid, twilio_auth_token
         FROM tenant_sms_config
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (configResult.rows.length === 0) {
        throw new Error('Tenant SMS not configured');
      }

      const config = configResult.rows[0];

      // Send via Twilio
      const twilio = await this.getTwilioClient(
        config.twilio_account_sid,
        config.twilio_auth_token
      );

      const messageData = {
        from,
        to,
        body
      };

      if (mediaUrls && mediaUrls.length > 0) {
        messageData.mediaUrl = mediaUrls;
      }

      const message = await twilio.messages.create(messageData);

      // Update database
      await query(
        `UPDATE sms_messages
         SET status = $1,
             provider_message_id = $2,
             sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        ['sent', message.sid, messageId]
      );

      console.log(`[SMS Worker] ✅ SMS ${messageId} sent successfully (${message.sid})`);
    } catch (error) {
      console.error(`[SMS Worker] Error sending SMS ${messageId}:`, error);

      // Update database with error
      await query(
        `UPDATE sms_messages
         SET status = $1,
             error_message = $2,
             failed_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        ['failed', error.message, messageId]
      );

      throw error;  // Will cause NATS to retry
    }
  }

  async getTwilioClient(accountSid, authToken) {
    // Lazy load Twilio (avoid loading if not needed)
    const twilio = (await import('twilio')).default;
    return twilio(accountSid, authToken);
  }

  async stop() {
    console.log('[SMS Worker] Stopping...');
    this.isRunning = false;
  }
}

const worker = new SMSWorker();
worker.start().catch(err => {
  console.error('[SMS Worker] Fatal error:', err);
  process.exit(1);
});

export default worker;
