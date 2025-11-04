import twilio from 'twilio';
import { query, getClient } from '../db/connection.js';
import crypto from 'crypto';

/**
 * SMS/MMS Service
 * Handles sending and receiving SMS/MMS messages via Twilio
 */
export class SMSService {
  constructor(config = {}) {
    this.config = {
      accountSid: config.accountSid || process.env.TWILIO_ACCOUNT_SID,
      authToken: config.authToken || process.env.TWILIO_AUTH_TOKEN,
      ...config
    };

    // Initialize Twilio client
    if (this.config.accountSid && this.config.authToken) {
      this.client = twilio(this.config.accountSid, this.config.authToken);
      console.log('✓ Twilio SMS client initialized');
    } else {
      console.warn('⚠️ Twilio credentials not configured');
    }
  }

  /**
   * Generate unique message SID
   */
  generateMessageSid() {
    return 'SM' + crypto.randomBytes(16).toString('hex');
  }

  /**
   * Send SMS/MMS message
   */
  async sendMessage(params) {
    const {
      tenantId,
      to,
      from,
      body,
      mediaUrls = [],
      metadata = {},
      dry_run = false  // Dry run mode for load testing
    } = params;

    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Validate from number belongs to tenant
      const phoneCheck = await client.query(
        'SELECT id FROM phone_numbers WHERE tenant_id = $1 AND phone_number = $2 AND status = $3 AND sms_enabled = true',
        [tenantId, from, 'active']
      );

      if (phoneCheck.rows.length === 0) {
        throw new Error('Invalid sender phone number or SMS not enabled');
      }

      const fromPhoneId = phoneCheck.rows[0].id;
      const messageSid = this.generateMessageSid();
      const numMedia = mediaUrls.length;
      const numSegments = this.estimateSegments(body);

      // Create message record in database
      const messageResult = await client.query(
        `INSERT INTO sms_messages (
          message_sid, tenant_id, direction, from_number, to_number,
          from_phone_number_id, body, media_urls, num_media, num_segments,
          status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, message_sid, status, queued_at`,
        [
          messageSid, tenantId, 'outbound', from, to,
          fromPhoneId, body, JSON.stringify(mediaUrls), numMedia, numSegments,
          'queued', JSON.stringify(metadata)
        ]
      );

      const message = messageResult.rows[0];

      // Log message event
      await client.query(
        'INSERT INTO sms_message_events (message_id, tenant_id, event_type, status) VALUES ($1, $2, $3, $4)',
        [message.id, tenantId, 'queued', 'queued']
      );

      await client.query('COMMIT');

      // Send via Twilio (async) or simulate if dry_run
      if (!dry_run) {
        // REAL SMS - Send via Twilio
        this.sendViaTwilio(message.id, messageSid, from, to, body, mediaUrls)
          .catch(err => console.error('Twilio send error:', err));
        console.log(`📤 SMS queued: ${messageSid} from ${from} to ${to}`);
      } else {
        // DRY RUN MODE - Simulate SMS without Twilio
        console.log(`🧪 [DRY RUN] Simulated SMS: ${messageSid} from ${from} to ${to}`);

        // Simulate sending after short delay
        setTimeout(async () => {
          await query(
            `UPDATE sms_messages
             SET status = $1, sent_at = NOW(), price = $2, price_unit = $3
             WHERE message_sid = $4`,
            ['sent', 0.0075, 'USD', messageSid]
          );
          console.log(`🧪 [DRY RUN] Simulated SMS sent: ${messageSid}`);
        }, Math.random() * 1000); // Random 0-1 sec delay
      }

      return {
        sid: messageSid,
        status: 'queued',
        from,
        to,
        body,
        numMedia,
        numSegments,
        queuedAt: message.queued_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * sendSMS - Alias for sendMessage (for backwards compatibility with routes)
   */
  async sendSMS(params) {
    // Map old parameter names to new ones
    return this.sendMessage({
      ...params,
      body: params.message || params.body  // Support both 'message' and 'body' parameters
    });
  }

  /**
   * Send message via Twilio
   */
  async sendViaTwilio(messageId, messageSid, from, to, body, mediaUrls) {
    try {
      const twilioParams = {
        from,
        to,
        body
      };

      if (mediaUrls && mediaUrls.length > 0) {
        twilioParams.mediaUrl = mediaUrls;
      }

      console.log(`📡 Sending SMS via Twilio: ${messageSid}`);

      const twilioMessage = await this.client.messages.create(twilioParams);

      // Update database with Twilio SID and status
      await query(
        `UPDATE sms_messages 
         SET status = $1, sent_at = NOW(), carrier = $2, price = $3, price_unit = $4
         WHERE id = $5`,
        [twilioMessage.status, 'twilio', twilioMessage.price, twilioMessage.priceUnit, messageId]
      );

      // Log sent event
      await query(
        `INSERT INTO sms_message_events (message_id, tenant_id, event_type, status, raw_event)
         SELECT id, tenant_id, $1, $2, $3 FROM sms_messages WHERE id = $4`,
        ['sent', twilioMessage.status, JSON.stringify(twilioMessage), messageId]
      );

      console.log(`✅ SMS sent via Twilio: ${twilioMessage.sid}`);

      return twilioMessage;

    } catch (error) {
      console.error(`❌ Twilio send failed for message ${messageSid}:`, error);

      // Update message status to failed
      await query(
        `UPDATE sms_messages 
         SET status = $1, failed_at = NOW(), error_code = $2, error_message = $3
         WHERE id = $4`,
        ['failed', error.code, error.message, messageId]
      );

      // Log failure event
      await query(
        `INSERT INTO sms_message_events (message_id, tenant_id, event_type, status, error_message)
         SELECT id, tenant_id, $1, $2, $3 FROM sms_messages WHERE id = $4`,
        ['failed', 'failed', error.message, messageId]
      );

      throw error;
    }
  }

  /**
   * Handle inbound SMS/MMS from Twilio webhook
   */
  async handleInboundMessage(twilioData) {
    try {
      const {
        MessageSid,
        From,
        To,
        Body,
        NumMedia = 0,
        NumSegments = 1
      } = twilioData;

      // Find which tenant owns this phone number
      const phoneResult = await query(
        'SELECT id, tenant_id FROM phone_numbers WHERE phone_number = $1 AND status = $2',
        [To, 'active']
      );

      if (phoneResult.rows.length === 0) {
        console.warn(`⚠️ Inbound SMS to unknown number: ${To}`);
        return null;
      }

      const { id: toPhoneId, tenant_id: tenantId } = phoneResult.rows[0];

      // Extract media URLs if MMS
      const mediaUrls = [];
      for (let i = 0; i < parseInt(NumMedia); i++) {
        const mediaUrl = twilioData[`MediaUrl${i}`];
        if (mediaUrl) {
          mediaUrls.push(mediaUrl);
        }
      }

      // Create inbound message record
      const result = await query(
        `INSERT INTO sms_messages (
          message_sid, tenant_id, direction, from_number, to_number,
          to_phone_number_id, body, media_urls, num_media, num_segments,
          status, carrier, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, message_sid, status, created_at`,
        [
          MessageSid, tenantId, 'inbound', From, To,
          toPhoneId, Body, JSON.stringify(mediaUrls), parseInt(NumMedia), parseInt(NumSegments),
          'received', 'twilio', JSON.stringify(twilioData)
        ]
      );

      const message = result.rows[0];

      // Log received event
      await query(
        'INSERT INTO sms_message_events (message_id, tenant_id, event_type, status, raw_event) VALUES ($1, $2, $3, $4, $5)',
        [message.id, tenantId, 'received', 'received', JSON.stringify(twilioData)]
      );

      console.log(`📥 Inbound SMS received: ${MessageSid} from ${From} to ${To} (tenant ${tenantId})`);

      // TODO: Trigger webhook to tenant's application
      // await this.triggerTenantWebhook(tenantId, 'sms.received', message);

      return message;

    } catch (error) {
      console.error('Handle inbound SMS error:', error);
      throw error;
    }
  }

  /**
   * Handle delivery status webhook from Twilio
   */
  async handleStatusCallback(twilioData) {
    try {
      const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = twilioData;

      // Find message by Twilio SID (need to add provider_message_sid column)
      const messageResult = await query(
        'SELECT id, tenant_id FROM sms_messages WHERE message_sid = $1',
        [MessageSid]
      );

      if (messageResult.rows.length === 0) {
        console.warn(`⚠️ Status callback for unknown message: ${MessageSid}`);
        return null;
      }

      const { id: messageId, tenant_id: tenantId } = messageResult.rows[0];

      // Update message status
      const statusColumn = MessageStatus === 'delivered' ? 'delivered_at' :
                          MessageStatus === 'failed' ? 'failed_at' : null;

      if (statusColumn) {
        await query(
          `UPDATE sms_messages 
           SET status = $1, ${statusColumn} = NOW(), error_code = $2, error_message = $3
           WHERE id = $4`,
          [MessageStatus, ErrorCode, ErrorMessage, messageId]
        );
      } else {
        await query(
          'UPDATE sms_messages SET status = $1 WHERE id = $2',
          [MessageStatus, messageId]
        );
      }

      // Log status event
      await query(
        'INSERT INTO sms_message_events (message_id, tenant_id, event_type, status, error_code, error_message, raw_event) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [messageId, tenantId, MessageStatus, MessageStatus, ErrorCode, ErrorMessage, JSON.stringify(twilioData)]
      );

      console.log(`📊 SMS status update: ${MessageSid} -> ${MessageStatus}`);

      return { messageId, status: MessageStatus };

    } catch (error) {
      console.error('Handle status callback error:', error);
      throw error;
    }
  }

  /**
   * Estimate number of SMS segments
   */
  estimateSegments(body) {
    if (!body) return 0;
    
    const length = body.length;
    
    // GSM-7 encoding (160 chars per segment)
    if (this.isGSM7(body)) {
      if (length <= 160) return 1;
      return Math.ceil(length / 153); // 153 for concatenated messages
    }
    
    // UCS-2 encoding (70 chars per segment) for unicode
    if (length <= 70) return 1;
    return Math.ceil(length / 67); // 67 for concatenated messages
  }

  /**
   * Check if text uses only GSM-7 characters
   */
  isGSM7(text) {
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\^{}\\\[~\]|€]*$/;
    return gsm7Regex.test(text);
  }

  /**
   * Get message by SID
   */
  async getMessage(messageSid, tenantId) {
    const result = await query(
      `SELECT message_sid, direction, from_number, to_number, body, 
              media_urls, num_media, num_segments, status, carrier, 
              price, price_unit, queued_at, sent_at, delivered_at, 
              failed_at, error_code, error_message, metadata
       FROM sms_messages 
       WHERE message_sid = $1 AND tenant_id = $2`,
      [messageSid, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * List messages for tenant
   */
  async listMessages(tenantId, options = {}) {
    const {
      direction,
      status,
      from,
      to,
      limit = 50,
      offset = 0
    } = options;

    let queryText = 'SELECT * FROM sms_messages WHERE tenant_id = $1';
    const params = [tenantId];
    let paramCount = 1;

    if (direction) {
      params.push(direction);
      queryText += ` AND direction = $${++paramCount}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND status = $${++paramCount}`;
    }

    if (from) {
      params.push(from);
      queryText += ` AND from_number = $${++paramCount}`;
    }

    if (to) {
      params.push(to);
      queryText += ` AND to_number = $${++paramCount}`;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const result = await query(queryText, params);
    return result.rows;
  }
}

export default SMSService;
