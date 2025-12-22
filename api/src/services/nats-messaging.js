/**
 * NATS Messaging Service
 *
 * Features:
 * - Campaign job queue management
 * - Async message publishing
 * - Worker subscription handling
 * - JetStream for persistence
 * - Request-reply patterns
 * - Load balancing across workers
 */

// NATS configuration
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const NATS_USER = process.env.NATS_USER;
const NATS_PASS = process.env.NATS_PASS;
const NATS_TOKEN = process.env.NATS_TOKEN;

// Subject/stream names
const SUBJECTS = {
  // Campaign subjects
  CAMPAIGN_START: 'campaign.start',
  CAMPAIGN_PAUSE: 'campaign.pause',
  CAMPAIGN_STOP: 'campaign.stop',
  CAMPAIGN_CONTACT: 'campaign.contact.dial',
  CAMPAIGN_STATUS: 'campaign.status',

  // Call subjects
  CALL_INITIATED: 'call.initiated',
  CALL_ANSWERED: 'call.answered',
  CALL_ENDED: 'call.ended',
  CALL_QUALITY: 'call.quality',

  // SMS subjects
  SMS_SEND: 'sms.send',
  SMS_RECEIVED: 'sms.received',
  SMS_STATUS: 'sms.status',

  // Email subjects
  EMAIL_SEND: 'email.send',
  EMAIL_STATUS: 'email.status',

  // Agent subjects
  AGENT_STATUS: 'agent.status',
  AGENT_ASSIGNMENT: 'agent.assignment',

  // Analytics subjects
  ANALYTICS_EVENT: 'analytics.event',

  // Notifications
  NOTIFICATION_SEND: 'notification.send'
};

// Stream configurations for JetStream
const STREAMS = {
  CAMPAIGNS: {
    name: 'CAMPAIGNS',
    subjects: ['campaign.>'],
    retention: 'limits',
    max_msgs: 1000000,
    max_bytes: 1024 * 1024 * 1024, // 1GB
    max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days in nanoseconds
    storage: 'file',
    replicas: 1
  },
  COMMUNICATIONS: {
    name: 'COMMUNICATIONS',
    subjects: ['call.>', 'sms.>', 'email.>'],
    retention: 'limits',
    max_msgs: 5000000,
    max_bytes: 5 * 1024 * 1024 * 1024, // 5GB
    max_age: 30 * 24 * 60 * 60 * 1000000000, // 30 days
    storage: 'file',
    replicas: 1
  },
  ANALYTICS: {
    name: 'ANALYTICS',
    subjects: ['analytics.>'],
    retention: 'limits',
    max_msgs: 10000000,
    max_bytes: 10 * 1024 * 1024 * 1024, // 10GB
    max_age: 90 * 24 * 60 * 60 * 1000000000, // 90 days
    storage: 'file',
    replicas: 1
  }
};

class NATSMessagingService {
  constructor() {
    this.nc = null;
    this.js = null; // JetStream context
    this.subscriptions = new Map();
    this.consumers = new Map();
    this.isConnected = false;
    this.natsAvailable = false;
  }

  /**
   * Connect to NATS server
   */
  async connect() {
    if (this.isConnected) {
      return this.nc;
    }

    try {
      // Dynamic import of NATS (optional dependency)
      const nats = await import('nats');
      const { connect, StringCodec, JSONCodec } = nats;

      this.StringCodec = StringCodec;
      this.JSONCodec = JSONCodec;
      this.sc = StringCodec();
      this.jc = JSONCodec();

      const connectOptions = {
        servers: NATS_URL.split(','),
        name: 'irisx-api',
        reconnect: true,
        maxReconnectAttempts: -1, // Unlimited
        reconnectTimeWait: 2000,
        pingInterval: 30000
      };

      // Add authentication if configured
      if (NATS_TOKEN) {
        connectOptions.token = NATS_TOKEN;
      } else if (NATS_USER && NATS_PASS) {
        connectOptions.user = NATS_USER;
        connectOptions.pass = NATS_PASS;
      }

      this.nc = await connect(connectOptions);
      this.isConnected = true;
      this.natsAvailable = true;

      console.log(`[NATS] Connected to ${this.nc.getServer()}`);

      // Set up connection event handlers
      this.setupEventHandlers();

      // Initialize JetStream
      await this.initializeJetStream();

      return this.nc;
    } catch (error) {
      console.warn('[NATS] Connection failed (NATS may not be installed):', error.message);
      this.natsAvailable = false;
      return null;
    }
  }

  /**
   * Set up connection event handlers
   */
  setupEventHandlers() {
    if (!this.nc) return;

    // Handle connection closed
    (async () => {
      for await (const status of this.nc.status()) {
        switch (status.type) {
          case 'disconnect':
            console.warn('[NATS] Disconnected from server');
            this.isConnected = false;
            break;
          case 'reconnect':
            console.log('[NATS] Reconnected to server');
            this.isConnected = true;
            break;
          case 'error':
            console.error('[NATS] Error:', status.data);
            break;
          case 'ldm':
            console.log('[NATS] Server is in lame duck mode');
            break;
        }
      }
    })();
  }

  /**
   * Initialize JetStream and create streams
   */
  async initializeJetStream() {
    if (!this.nc) return;

    try {
      this.js = this.nc.jetstream();
      const jsm = await this.nc.jetstreamManager();

      // Create streams if they don't exist
      for (const [name, config] of Object.entries(STREAMS)) {
        try {
          await jsm.streams.info(config.name);
          console.log(`[NATS] Stream ${config.name} exists`);
        } catch (error) {
          if (error.code === '404') {
            await jsm.streams.add(config);
            console.log(`[NATS] Created stream ${config.name}`);
          } else {
            console.error(`[NATS] Error checking stream ${config.name}:`, error);
          }
        }
      }

      console.log('[NATS] JetStream initialized');
    } catch (error) {
      console.warn('[NATS] JetStream not available (using core NATS):', error.message);
      this.js = null;
    }
  }

  /**
   * Publish a message (core NATS)
   */
  async publish(subject, data) {
    if (!this.natsAvailable) {
      console.log(`[NATS] Not available - would publish to ${subject}:`, data);
      return { simulated: true, subject, data };
    }

    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.nc) {
      return { simulated: true, subject, data };
    }

    const payload = typeof data === 'string' ? this.sc.encode(data) : this.jc.encode(data);
    this.nc.publish(subject, payload);

    console.log(`[NATS] Published to ${subject}`);
    return { success: true, subject };
  }

  /**
   * Publish to JetStream (persistent)
   */
  async publishJS(subject, data, options = {}) {
    if (!this.natsAvailable) {
      console.log(`[NATS] Not available - would publish to JetStream ${subject}:`, data);
      return { simulated: true, subject, data };
    }

    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.js) {
      // Fall back to core NATS
      return this.publish(subject, data);
    }

    const payload = typeof data === 'string' ? this.sc.encode(data) : this.jc.encode(data);

    const pubAck = await this.js.publish(subject, payload, {
      msgID: options.msgId || `${subject}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...options
    });

    console.log(`[NATS] Published to JetStream ${subject}, seq: ${pubAck.seq}`);
    return pubAck;
  }

  /**
   * Subscribe to a subject (core NATS)
   */
  async subscribe(subject, handler, options = {}) {
    if (!this.natsAvailable) {
      console.log(`[NATS] Not available - subscription to ${subject} simulated`);
      return { simulated: true, subject };
    }

    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.nc) {
      return { simulated: true, subject };
    }

    const sub = this.nc.subscribe(subject, {
      queue: options.queue, // For load balancing
      max: options.max
    });

    this.subscriptions.set(subject, sub);

    // Process messages
    (async () => {
      for await (const msg of sub) {
        try {
          const data = this.decodeMessage(msg);
          await handler(data, msg);
        } catch (error) {
          console.error(`[NATS] Error processing message on ${subject}:`, error);
        }
      }
    })();

    console.log(`[NATS] Subscribed to ${subject}${options.queue ? ` (queue: ${options.queue})` : ''}`);
    return sub;
  }

  /**
   * Create a durable consumer (JetStream)
   */
  async createConsumer(streamName, consumerName, filterSubject, handler, options = {}) {
    if (!this.natsAvailable || !this.js) {
      console.log(`[NATS] JetStream not available - consumer ${consumerName} simulated`);
      return this.subscribe(filterSubject, handler, { queue: consumerName });
    }

    try {
      const { AckPolicy, DeliverPolicy } = await import('nats');
      const jsm = await this.nc.jetstreamManager();

      // Create or get consumer
      const consumerConfig = {
        durable_name: consumerName,
        filter_subject: filterSubject,
        ack_policy: options.ackPolicy || AckPolicy.Explicit,
        deliver_policy: options.deliverPolicy || DeliverPolicy.All,
        max_deliver: options.maxDeliver || 3,
        ack_wait: options.ackWait || 30000000000, // 30 seconds in nanoseconds
        ...options
      };

      try {
        await jsm.consumers.add(streamName, consumerConfig);
        console.log(`[NATS] Created consumer ${consumerName} on stream ${streamName}`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }

      // Create pull subscription
      const consumer = await this.js.consumers.get(streamName, consumerName);
      const messages = await consumer.consume();

      this.consumers.set(consumerName, consumer);

      // Process messages
      (async () => {
        for await (const msg of messages) {
          try {
            const data = this.decodeMessage(msg);
            await handler(data, msg);
            msg.ack();
          } catch (error) {
            console.error(`[NATS] Error processing message on ${filterSubject}:`, error);
            // NAK will cause redelivery
            msg.nak();
          }
        }
      })();

      console.log(`[NATS] Consumer ${consumerName} started on ${filterSubject}`);
      return consumer;
    } catch (error) {
      console.error(`[NATS] Error creating consumer ${consumerName}:`, error);
      throw error;
    }
  }

  /**
   * Request-reply pattern
   */
  async request(subject, data, timeout = 5000) {
    if (!this.natsAvailable) {
      console.log(`[NATS] Not available - request to ${subject} simulated`);
      return { simulated: true, subject, data };
    }

    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.nc) {
      return { simulated: true, subject, data };
    }

    const payload = typeof data === 'string' ? this.sc.encode(data) : this.jc.encode(data);

    try {
      const response = await this.nc.request(subject, payload, { timeout });
      return this.decodeMessage(response);
    } catch (error) {
      if (error.code === 'TIMEOUT') {
        throw new Error(`Request to ${subject} timed out`);
      }
      throw error;
    }
  }

  /**
   * Decode message based on content type
   */
  decodeMessage(msg) {
    try {
      return this.jc.decode(msg.data);
    } catch {
      return this.sc.decode(msg.data);
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.nc) {
      await this.nc.drain();
      this.isConnected = false;
      console.log('[NATS] Connection closed');
    }
  }

  // ============================================
  // Campaign-specific methods
  // ============================================

  /**
   * Publish campaign start event
   */
  async publishCampaignStart(campaignId, tenantId, options = {}) {
    return this.publishJS(SUBJECTS.CAMPAIGN_START, {
      campaign_id: campaignId,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      ...options
    });
  }

  /**
   * Publish campaign pause event
   */
  async publishCampaignPause(campaignId, tenantId) {
    return this.publishJS(SUBJECTS.CAMPAIGN_PAUSE, {
      campaign_id: campaignId,
      tenant_id: tenantId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish campaign stop event
   */
  async publishCampaignStop(campaignId, tenantId, reason = null) {
    return this.publishJS(SUBJECTS.CAMPAIGN_STOP, {
      campaign_id: campaignId,
      tenant_id: tenantId,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Queue contact for dialing
   */
  async queueContactForDialing(campaignId, tenantId, contact) {
    return this.publishJS(SUBJECTS.CAMPAIGN_CONTACT, {
      campaign_id: campaignId,
      tenant_id: tenantId,
      contact,
      queued_at: new Date().toISOString()
    });
  }

  /**
   * Publish campaign status update
   */
  async publishCampaignStatus(campaignId, status, stats = {}) {
    return this.publish(SUBJECTS.CAMPAIGN_STATUS, {
      campaign_id: campaignId,
      status,
      stats,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // Call-specific methods
  // ============================================

  /**
   * Publish call initiated event
   */
  async publishCallInitiated(callData) {
    return this.publishJS(SUBJECTS.CALL_INITIATED, {
      ...callData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish call answered event
   */
  async publishCallAnswered(callId, callData) {
    return this.publish(SUBJECTS.CALL_ANSWERED, {
      call_id: callId,
      ...callData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish call ended event
   */
  async publishCallEnded(callId, callData) {
    return this.publishJS(SUBJECTS.CALL_ENDED, {
      call_id: callId,
      ...callData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Publish call quality metrics
   */
  async publishCallQuality(callId, metrics) {
    return this.publish(SUBJECTS.CALL_QUALITY, {
      call_id: callId,
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // SMS-specific methods
  // ============================================

  /**
   * Queue SMS for sending
   */
  async queueSMS(smsData) {
    return this.publishJS(SUBJECTS.SMS_SEND, {
      ...smsData,
      queued_at: new Date().toISOString()
    });
  }

  /**
   * Publish SMS received event
   */
  async publishSMSReceived(smsData) {
    return this.publishJS(SUBJECTS.SMS_RECEIVED, {
      ...smsData,
      received_at: new Date().toISOString()
    });
  }

  // ============================================
  // Email-specific methods
  // ============================================

  /**
   * Queue email for sending
   */
  async queueEmail(emailData) {
    return this.publishJS(SUBJECTS.EMAIL_SEND, {
      ...emailData,
      queued_at: new Date().toISOString()
    });
  }

  // ============================================
  // Analytics methods
  // ============================================

  /**
   * Publish analytics event
   */
  async publishAnalyticsEvent(eventType, eventData) {
    return this.publishJS(SUBJECTS.ANALYTICS_EVENT, {
      event_type: eventType,
      ...eventData,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // Health check
  // ============================================

  async healthCheck() {
    return {
      available: this.natsAvailable,
      connected: this.isConnected,
      server: this.nc?.getServer() || null,
      jetstream: !!this.js,
      subscriptions: this.subscriptions.size,
      consumers: this.consumers.size
    };
  }
}

// Export singleton
const natsMessagingService = new NATSMessagingService();
export default natsMessagingService;

// Named exports
export {
  SUBJECTS,
  STREAMS
};
