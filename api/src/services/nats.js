/**
 * NATS JetStream Service
 *
 * Persistent, distributed message queue for:
 * - SMS delivery
 * - Email delivery
 * - Webhook delivery
 * - Call orchestration (future)
 *
 * Phase 1, Week 4 (Backfill)
 */

import { connect, StringCodec } from 'nats';

class NATSService {
  constructor() {
    this.nc = null;
    this.js = null;
    this.sc = StringCodec();
    this.isConnected = false;
  }

  /**
   * Connect to NATS server
   */
  async connect() {
    try {
      if (this.isConnected) {
        console.log('[NATS] Already connected');
        return;
      }

      console.log('[NATS] Connecting to NATS server...');

      this.nc = await connect({
        servers: process.env.NATS_URL || 'nats://localhost:4222',
        token: process.env.NATS_TOKEN || 'irisx-nats-prod-token-2025',
        name: 'irisx-api',
        maxReconnectAttempts: -1,  // Infinite reconnect
        reconnectTimeWait: 2000,    // 2s between attempts
      });

      this.js = this.nc.jetstream();
      this.isConnected = true;

      console.log('[NATS] ✅ Connected to NATS server');

      // Handle connection events
      (async () => {
        for await (const s of this.nc.status()) {
          console.log(`[NATS] ${s.type}: ${s.data || ''}`);
        }
      })().catch(err => {
        console.error('[NATS] Status error:', err);
      });

      // Streams should be created via init-nats-streams.js script
      // NOT by every worker/API process that connects
      // await this.createStreams();
    } catch (error) {
      console.error('[NATS] Connection error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Create JetStream streams
   */
  async createStreams() {
    try {
      const jsm = await this.js.jetstreamManager();

      // SMS Stream - PRODUCTION SCALE: 30GB limit
      await this.createStream(jsm, {
        name: 'SMS',
        subjects: ['sms.send', 'sms.status'],
        retention: 'limits',
        max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days in nanoseconds
        max_msgs: 10000000,  // 10M messages
        max_bytes: 32212254720, // 30GB
        storage: 'file',
        discard: 'old',
      });

      // Email Stream - PRODUCTION SCALE: 40GB limit
      await this.createStream(jsm, {
        name: 'EMAIL',
        subjects: ['email.send', 'email.status'],
        retention: 'limits',
        max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days
        max_msgs: 10000000,  // 10M messages
        max_bytes: 42949672960, // 40GB
        storage: 'file',
        discard: 'old',
      });

      // Webhook Stream - PRODUCTION SCALE: 20GB limit
      await this.createStream(jsm, {
        name: 'WEBHOOKS',
        subjects: ['webhooks.deliver', 'webhooks.retry'],
        retention: 'limits',
        max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days
        max_msgs: 10000000,  // 10M messages
        max_bytes: 21474836480, // 20GB
        storage: 'file',
        discard: 'old',
      });

      console.log('[NATS] ✅ Streams created/verified');
    } catch (error) {
      if (!error.message.includes('stream name already in use')) {
        console.error('[NATS] Error creating streams:', error);
        throw error;
      }
      console.log('[NATS] Streams already exist');
    }
  }

  /**
   * Create or update stream
   */
  async createStream(jsm, config) {
    try {
      await jsm.streams.add(config);
      console.log(`[NATS] Created stream: ${config.name}`);
    } catch (error) {
      if (error.message.includes('stream name already in use')) {
        // Stream exists, update it
        await jsm.streams.update(config.name, config);
        console.log(`[NATS] Updated stream: ${config.name}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Publish message to stream
   */
  async publish(subject, data) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const payload = JSON.stringify(data);
      const ack = await this.js.publish(subject, this.sc.encode(payload));

      console.log(`[NATS] Published to ${subject}, seq: ${ack.seq}`);
      return ack;
    } catch (error) {
      console.error(`[NATS] Publish error on ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to stream with consumer
   */
  async subscribe(streamName, subject, consumerName, callback) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const jsm = await this.js.jetstreamManager();

      // Create durable consumer
      const consumerOpts = {
        durable_name: consumerName,
        ack_policy: 'explicit',
        max_deliver: 5,
        ack_wait: 30000000000, // 30 seconds in nanoseconds
        filter_subject: subject,
      };

      try {
        await jsm.consumers.add(streamName, consumerOpts);
        console.log(`[NATS] Created consumer: ${consumerName} on ${streamName}`);
      } catch (error) {
        if (!error.message.includes('consumer name already in use')) {
          throw error;
        }
        console.log(`[NATS] Consumer ${consumerName} already exists`);
      }

      // Start consuming messages
      const consumer = await this.js.consumers.get(streamName, consumerName);
      const messages = await consumer.consume();

      console.log(`[NATS] 🎧 Listening on ${streamName}.${subject} with ${consumerName}`);

      // Process messages
      (async () => {
        for await (const msg of messages) {
          try {
            const data = JSON.parse(this.sc.decode(msg.data));
            console.log(`[NATS] Received message on ${subject}:`, data.id || data.emailId || data.messageId || 'unknown');

            // Call the callback
            await callback(data, msg);

            // Acknowledge message
            msg.ack();
          } catch (error) {
            console.error(`[NATS] Error processing message on ${subject}:`, error);

            // Negative acknowledge - will be redelivered
            msg.nak();
          }
        }
      })().catch(err => {
        console.error(`[NATS] Consumer error on ${subject}:`, err);
      });

      return messages;
    } catch (error) {
      console.error(`[NATS] Subscribe error on ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Get stream info
   */
  async getStreamInfo(streamName) {
    try {
      const jsm = await this.js.jetstreamManager();
      const info = await jsm.streams.info(streamName);
      return info;
    } catch (error) {
      console.error(`[NATS] Error getting stream info for ${streamName}:`, error);
      throw error;
    }
  }

  /**
   * Get consumer info
   */
  async getConsumerInfo(streamName, consumerName) {
    try {
      const jsm = await this.js.jetstreamManager();
      const info = await jsm.consumers.info(streamName, consumerName);
      return info;
    } catch (error) {
      console.error(`[NATS] Error getting consumer info:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from NATS
   */
  async disconnect() {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.isConnected = false;
      console.log('[NATS] Disconnected');
    }
  }
}

// Singleton instance
const natsService = new NATSService();

// Connect on startup
natsService.connect().catch(err => {
  console.error('[NATS] Failed to connect on startup:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[NATS] Shutting down...');
  await natsService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[NATS] Shutting down...');
  await natsService.disconnect();
  process.exit(0);
});

export default natsService;
