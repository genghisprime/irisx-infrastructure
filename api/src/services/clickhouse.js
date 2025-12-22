/**
 * ClickHouse Data Warehouse Service
 *
 * High-performance analytics database for IRISX platform
 * - Real-time analytics queries
 * - Historical data aggregation
 * - Time-series data storage
 * - Cross-tenant analytics
 */

import { createClient } from '@clickhouse/client';

// ClickHouse client singleton
let clickhouseClient = null;

// Configuration
const CLICKHOUSE_CONFIG = {
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'irisx',
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0,
    max_threads: 8
  }
};

// Table names
const TABLES = {
  CALLS: 'calls',
  CALL_QUALITY: 'call_quality_metrics',
  SMS: 'sms_messages',
  EMAILS: 'email_messages',
  CAMPAIGNS: 'campaign_events',
  ANALYTICS: 'analytics_events',
  API_REQUESTS: 'api_requests',
  BILLING: 'billing_events'
};

// Aggregate views
const MATERIALIZED_VIEWS = {
  HOURLY_CALL_STATS: 'mv_hourly_call_stats',
  DAILY_CHANNEL_STATS: 'mv_daily_channel_stats',
  TENANT_USAGE: 'mv_tenant_usage',
  CARRIER_QUALITY: 'mv_carrier_quality'
};

/**
 * Initialize ClickHouse client
 */
async function initializeClickHouse() {
  if (clickhouseClient) {
    return clickhouseClient;
  }

  try {
    clickhouseClient = createClient(CLICKHOUSE_CONFIG);

    // Test connection
    const result = await clickhouseClient.query({
      query: 'SELECT 1'
    });

    console.log('[ClickHouse] Connected successfully');

    // Initialize tables
    await initializeTables();

    return clickhouseClient;
  } catch (error) {
    console.error('[ClickHouse] Connection failed:', error.message);
    // Don't throw - graceful degradation if ClickHouse is not available
    clickhouseClient = null;
    return null;
  }
}

/**
 * Create database tables and materialized views
 */
async function initializeTables() {
  if (!clickhouseClient) return;

  try {
    // Create database if not exists
    await clickhouseClient.exec({
      query: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}`
    });

    // Calls table - main call detail records
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS} (
          id UUID,
          tenant_id UUID,
          call_sid String,
          from_number String,
          to_number String,
          direction Enum8('inbound' = 1, 'outbound' = 2),
          status Enum8('initiated' = 1, 'ringing' = 2, 'in-progress' = 3, 'completed' = 4, 'busy' = 5, 'no-answer' = 6, 'failed' = 7, 'canceled' = 8),
          duration UInt32,
          billable_duration UInt32,
          cost Decimal(10, 4),
          carrier String,
          campaign_id Nullable(UUID),
          agent_id Nullable(UUID),
          queue_id Nullable(UUID),
          disposition String,
          recording_url Nullable(String),
          mos_score Nullable(Float32),
          jitter_ms Nullable(Float32),
          packet_loss_pct Nullable(Float32),
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3),
          answered_at Nullable(DateTime64(3)),
          ended_at Nullable(DateTime64(3))
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, created_at, id)
        TTL created_at + INTERVAL 2 YEAR
      `
    });

    // Call quality metrics - high-frequency sampling
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.CALL_QUALITY} (
          call_id UUID,
          tenant_id UUID,
          timestamp DateTime64(3),
          mos_score Float32,
          r_factor Float32,
          jitter_ms Float32,
          packet_loss_pct Float32,
          latency_ms Float32,
          codec String,
          carrier String
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMMDD(timestamp)
        ORDER BY (tenant_id, call_id, timestamp)
        TTL timestamp + INTERVAL 90 DAY
      `
    });

    // SMS messages
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.SMS} (
          id UUID,
          tenant_id UUID,
          message_sid String,
          from_number String,
          to_number String,
          direction Enum8('inbound' = 1, 'outbound' = 2),
          status Enum8('queued' = 1, 'sending' = 2, 'sent' = 3, 'delivered' = 4, 'failed' = 5, 'undelivered' = 6),
          segments UInt8,
          cost Decimal(10, 4),
          campaign_id Nullable(UUID),
          template_id Nullable(UUID),
          provider String,
          error_code Nullable(String),
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3),
          sent_at Nullable(DateTime64(3)),
          delivered_at Nullable(DateTime64(3))
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, created_at, id)
        TTL created_at + INTERVAL 2 YEAR
      `
    });

    // Email messages
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.EMAILS} (
          id UUID,
          tenant_id UUID,
          message_id String,
          from_email String,
          to_email String,
          subject String,
          status Enum8('queued' = 1, 'sending' = 2, 'sent' = 3, 'delivered' = 4, 'opened' = 5, 'clicked' = 6, 'bounced' = 7, 'complained' = 8, 'failed' = 9),
          opens UInt16,
          clicks UInt16,
          cost Decimal(10, 4),
          campaign_id Nullable(UUID),
          template_id Nullable(UUID),
          provider String,
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3),
          sent_at Nullable(DateTime64(3)),
          opened_at Nullable(DateTime64(3)),
          clicked_at Nullable(DateTime64(3))
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, created_at, id)
        TTL created_at + INTERVAL 2 YEAR
      `
    });

    // Campaign events
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.CAMPAIGNS} (
          tenant_id UUID,
          campaign_id UUID,
          event_type Enum8('started' = 1, 'paused' = 2, 'resumed' = 3, 'completed' = 4, 'contact_dialed' = 5, 'contact_reached' = 6, 'contact_converted' = 7, 'contact_failed' = 8),
          contact_id Nullable(UUID),
          channel Enum8('voice' = 1, 'sms' = 2, 'email' = 3),
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, campaign_id, created_at)
        TTL created_at + INTERVAL 1 YEAR
      `
    });

    // Generic analytics events
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.ANALYTICS} (
          tenant_id UUID,
          event_type String,
          event_category String,
          event_action String,
          event_label Nullable(String),
          event_value Nullable(Float64),
          user_id Nullable(UUID),
          session_id Nullable(String),
          ip_address Nullable(String),
          user_agent Nullable(String),
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, event_type, created_at)
        TTL created_at + INTERVAL 1 YEAR
      `
    });

    // API requests for usage tracking
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.API_REQUESTS} (
          tenant_id UUID,
          endpoint String,
          method Enum8('GET' = 1, 'POST' = 2, 'PUT' = 3, 'PATCH' = 4, 'DELETE' = 5),
          status_code UInt16,
          response_time_ms UInt32,
          request_size UInt32,
          response_size UInt32,
          ip_address String,
          user_agent String,
          user_id Nullable(UUID),
          api_key_id Nullable(UUID),
          created_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMMDD(created_at)
        ORDER BY (tenant_id, created_at)
        TTL created_at + INTERVAL 90 DAY
      `
    });

    // Billing events
    await clickhouseClient.exec({
      query: `
        CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${TABLES.BILLING} (
          tenant_id UUID,
          event_type Enum8('usage' = 1, 'charge' = 2, 'credit' = 3, 'refund' = 4, 'adjustment' = 5),
          resource_type Enum8('voice' = 1, 'sms' = 2, 'email' = 3, 'ai' = 4, 'storage' = 5, 'api' = 6),
          quantity Decimal(10, 4),
          unit_price Decimal(10, 6),
          total_amount Decimal(10, 4),
          currency String DEFAULT 'USD',
          resource_id Nullable(UUID),
          metadata String DEFAULT '{}',
          created_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(created_at)
        ORDER BY (tenant_id, created_at)
        TTL created_at + INTERVAL 5 YEAR
      `
    });

    // Create materialized views for aggregations
    await createMaterializedViews();

    console.log('[ClickHouse] Tables initialized');
  } catch (error) {
    console.error('[ClickHouse] Error initializing tables:', error);
  }
}

/**
 * Create materialized views for pre-aggregated analytics
 */
async function createMaterializedViews() {
  if (!clickhouseClient) return;

  // Hourly call statistics
  await clickhouseClient.exec({
    query: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${MATERIALIZED_VIEWS.HOURLY_CALL_STATS}
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (tenant_id, hour, direction, status)
      AS SELECT
        tenant_id,
        toStartOfHour(created_at) as hour,
        direction,
        status,
        count() as call_count,
        sum(duration) as total_duration,
        sum(billable_duration) as total_billable_duration,
        sum(cost) as total_cost,
        avg(mos_score) as avg_mos,
        avg(jitter_ms) as avg_jitter,
        avg(packet_loss_pct) as avg_packet_loss
      FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
      GROUP BY tenant_id, hour, direction, status
    `
  });

  // Daily channel statistics
  await clickhouseClient.exec({
    query: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${MATERIALIZED_VIEWS.DAILY_CHANNEL_STATS}
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(day)
      ORDER BY (tenant_id, day, channel)
      AS SELECT
        tenant_id,
        toDate(created_at) as day,
        'voice' as channel,
        count() as message_count,
        sum(cost) as total_cost
      FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
      GROUP BY tenant_id, day
      UNION ALL
      SELECT
        tenant_id,
        toDate(created_at) as day,
        'sms' as channel,
        count() as message_count,
        sum(cost) as total_cost
      FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.SMS}
      GROUP BY tenant_id, day
      UNION ALL
      SELECT
        tenant_id,
        toDate(created_at) as day,
        'email' as channel,
        count() as message_count,
        sum(cost) as total_cost
      FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.EMAILS}
      GROUP BY tenant_id, day
    `
  });

  // Carrier quality aggregation
  await clickhouseClient.exec({
    query: `
      CREATE MATERIALIZED VIEW IF NOT EXISTS ${CLICKHOUSE_CONFIG.database}.${MATERIALIZED_VIEWS.CARRIER_QUALITY}
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (carrier, hour)
      AS SELECT
        carrier,
        toStartOfHour(timestamp) as hour,
        count() as sample_count,
        avg(mos_score) as avg_mos,
        avg(r_factor) as avg_r_factor,
        avg(jitter_ms) as avg_jitter,
        avg(packet_loss_pct) as avg_packet_loss,
        avg(latency_ms) as avg_latency
      FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALL_QUALITY}
      GROUP BY carrier, hour
    `
  });
}

/**
 * ClickHouse Data Warehouse Service
 */
class ClickHouseService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Connect to ClickHouse
   */
  async connect() {
    this.client = await initializeClickHouse();
    this.isConnected = this.client !== null;
    return this.isConnected;
  }

  /**
   * Check if ClickHouse is available
   */
  async isAvailable() {
    if (!this.client) {
      await this.connect();
    }
    return this.isConnected;
  }

  // ============================================
  // Data Ingestion Methods
  // ============================================

  /**
   * Insert call record
   */
  async insertCall(callData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}`,
        values: [this.formatCallData(callData)],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting call:', error);
      return false;
    }
  }

  /**
   * Insert multiple call records (batch)
   */
  async insertCallsBatch(calls) {
    if (!await this.isAvailable()) return null;

    try {
      const values = calls.map(call => this.formatCallData(call));
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}`,
        values,
        format: 'JSONEachRow'
      });
      return calls.length;
    } catch (error) {
      console.error('[ClickHouse] Error inserting calls batch:', error);
      return 0;
    }
  }

  /**
   * Insert call quality metrics
   */
  async insertCallQuality(qualityData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.CALL_QUALITY}`,
        values: [{
          call_id: qualityData.call_id,
          tenant_id: qualityData.tenant_id,
          timestamp: new Date(),
          mos_score: qualityData.mos_score || 0,
          r_factor: qualityData.r_factor || 0,
          jitter_ms: qualityData.jitter_ms || 0,
          packet_loss_pct: qualityData.packet_loss_pct || 0,
          latency_ms: qualityData.latency_ms || 0,
          codec: qualityData.codec || 'G.711',
          carrier: qualityData.carrier || 'unknown'
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting quality metrics:', error);
      return false;
    }
  }

  /**
   * Insert SMS record
   */
  async insertSMS(smsData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.SMS}`,
        values: [{
          id: smsData.id,
          tenant_id: smsData.tenant_id,
          message_sid: smsData.message_sid || smsData.id,
          from_number: smsData.from_number,
          to_number: smsData.to_number,
          direction: smsData.direction || 'outbound',
          status: smsData.status || 'queued',
          segments: smsData.segments || 1,
          cost: smsData.cost || 0,
          campaign_id: smsData.campaign_id,
          template_id: smsData.template_id,
          provider: smsData.provider || 'twilio',
          error_code: smsData.error_code,
          metadata: JSON.stringify(smsData.metadata || {}),
          created_at: new Date(smsData.created_at || Date.now()),
          sent_at: smsData.sent_at ? new Date(smsData.sent_at) : null,
          delivered_at: smsData.delivered_at ? new Date(smsData.delivered_at) : null
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting SMS:', error);
      return false;
    }
  }

  /**
   * Insert email record
   */
  async insertEmail(emailData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.EMAILS}`,
        values: [{
          id: emailData.id,
          tenant_id: emailData.tenant_id,
          message_id: emailData.message_id || emailData.id,
          from_email: emailData.from_email,
          to_email: emailData.to_email,
          subject: emailData.subject || '',
          status: emailData.status || 'queued',
          opens: emailData.opens || 0,
          clicks: emailData.clicks || 0,
          cost: emailData.cost || 0,
          campaign_id: emailData.campaign_id,
          template_id: emailData.template_id,
          provider: emailData.provider || 'ses',
          metadata: JSON.stringify(emailData.metadata || {}),
          created_at: new Date(emailData.created_at || Date.now()),
          sent_at: emailData.sent_at ? new Date(emailData.sent_at) : null,
          opened_at: emailData.opened_at ? new Date(emailData.opened_at) : null,
          clicked_at: emailData.clicked_at ? new Date(emailData.clicked_at) : null
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting email:', error);
      return false;
    }
  }

  /**
   * Insert campaign event
   */
  async insertCampaignEvent(eventData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.CAMPAIGNS}`,
        values: [{
          tenant_id: eventData.tenant_id,
          campaign_id: eventData.campaign_id,
          event_type: eventData.event_type,
          contact_id: eventData.contact_id,
          channel: eventData.channel || 'voice',
          metadata: JSON.stringify(eventData.metadata || {}),
          created_at: new Date()
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting campaign event:', error);
      return false;
    }
  }

  /**
   * Insert analytics event
   */
  async insertAnalyticsEvent(eventData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.ANALYTICS}`,
        values: [{
          tenant_id: eventData.tenant_id,
          event_type: eventData.event_type,
          event_category: eventData.category || 'general',
          event_action: eventData.action || eventData.event_type,
          event_label: eventData.label,
          event_value: eventData.value,
          user_id: eventData.user_id,
          session_id: eventData.session_id,
          ip_address: eventData.ip_address,
          user_agent: eventData.user_agent,
          metadata: JSON.stringify(eventData.metadata || {}),
          created_at: new Date()
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting analytics event:', error);
      return false;
    }
  }

  /**
   * Insert API request for usage tracking
   */
  async insertAPIRequest(requestData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.API_REQUESTS}`,
        values: [{
          tenant_id: requestData.tenant_id,
          endpoint: requestData.endpoint,
          method: requestData.method,
          status_code: requestData.status_code,
          response_time_ms: requestData.response_time_ms,
          request_size: requestData.request_size || 0,
          response_size: requestData.response_size || 0,
          ip_address: requestData.ip_address || '',
          user_agent: requestData.user_agent || '',
          user_id: requestData.user_id,
          api_key_id: requestData.api_key_id,
          created_at: new Date()
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting API request:', error);
      return false;
    }
  }

  /**
   * Insert billing event
   */
  async insertBillingEvent(billingData) {
    if (!await this.isAvailable()) return null;

    try {
      await this.client.insert({
        table: `${CLICKHOUSE_CONFIG.database}.${TABLES.BILLING}`,
        values: [{
          tenant_id: billingData.tenant_id,
          event_type: billingData.event_type || 'usage',
          resource_type: billingData.resource_type,
          quantity: billingData.quantity,
          unit_price: billingData.unit_price,
          total_amount: billingData.total_amount,
          currency: billingData.currency || 'USD',
          resource_id: billingData.resource_id,
          metadata: JSON.stringify(billingData.metadata || {}),
          created_at: new Date()
        }],
        format: 'JSONEachRow'
      });
      return true;
    } catch (error) {
      console.error('[ClickHouse] Error inserting billing event:', error);
      return false;
    }
  }

  // ============================================
  // Query Methods - Analytics
  // ============================================

  /**
   * Get call statistics for a tenant
   */
  async getCallStats(tenantId, options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      groupBy = 'day'
    } = options;

    const groupByClause = groupBy === 'hour'
      ? 'toStartOfHour(created_at)'
      : groupBy === 'month'
        ? 'toStartOfMonth(created_at)'
        : 'toDate(created_at)';

    try {
      const result = await this.client.query({
        query: `
          SELECT
            ${groupByClause} as period,
            count() as total_calls,
            countIf(status = 'completed') as completed_calls,
            countIf(status = 'failed') as failed_calls,
            countIf(direction = 'inbound') as inbound_calls,
            countIf(direction = 'outbound') as outbound_calls,
            sum(duration) as total_duration,
            sum(billable_duration) as total_billable,
            sum(cost) as total_cost,
            avg(mos_score) as avg_mos,
            avg(jitter_ms) as avg_jitter,
            avg(packet_loss_pct) as avg_packet_loss
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
          GROUP BY period
          ORDER BY period
        `,
        query_params: {
          tenantId,
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting call stats:', error);
      return [];
    }
  }

  /**
   * Get channel comparison statistics
   */
  async getChannelComparison(tenantId, options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            'voice' as channel,
            count() as total_messages,
            sum(cost) as total_cost,
            countIf(status = 'completed') / count() * 100 as success_rate
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
          UNION ALL
          SELECT
            'sms' as channel,
            count() as total_messages,
            sum(cost) as total_cost,
            countIf(status = 'delivered') / count() * 100 as success_rate
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.SMS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
          UNION ALL
          SELECT
            'email' as channel,
            count() as total_messages,
            sum(cost) as total_cost,
            countIf(status IN ('delivered', 'opened', 'clicked')) / count() * 100 as success_rate
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.EMAILS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
        `,
        query_params: {
          tenantId,
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting channel comparison:', error);
      return [];
    }
  }

  /**
   * Get campaign performance metrics
   */
  async getCampaignPerformance(tenantId, campaignId, options = {}) {
    if (!await this.isAvailable()) return null;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            event_type,
            count() as event_count,
            uniq(contact_id) as unique_contacts
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CAMPAIGNS}
          WHERE tenant_id = {tenantId:UUID}
            AND campaign_id = {campaignId:UUID}
          GROUP BY event_type
        `,
        query_params: {
          tenantId,
          campaignId
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting campaign performance:', error);
      return [];
    }
  }

  /**
   * Get carrier quality rankings
   */
  async getCarrierQuality(options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            carrier,
            count() as sample_count,
            avg(mos_score) as avg_mos,
            avg(r_factor) as avg_r_factor,
            avg(jitter_ms) as avg_jitter,
            avg(packet_loss_pct) as avg_packet_loss,
            avg(latency_ms) as avg_latency,
            quantile(0.95)(jitter_ms) as p95_jitter,
            quantile(0.95)(packet_loss_pct) as p95_packet_loss
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALL_QUALITY}
          WHERE timestamp >= {startDate:DateTime64(3)}
            AND timestamp <= {endDate:DateTime64(3)}
          GROUP BY carrier
          ORDER BY avg_mos DESC
        `,
        query_params: {
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting carrier quality:', error);
      return [];
    }
  }

  /**
   * Get tenant usage summary for billing
   */
  async getTenantUsageSummary(tenantId, options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            resource_type,
            sum(quantity) as total_quantity,
            sum(total_amount) as total_amount,
            count() as event_count
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.BILLING}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
            AND event_type = 'usage'
          GROUP BY resource_type
        `,
        query_params: {
          tenantId,
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting usage summary:', error);
      return [];
    }
  }

  /**
   * Get API usage patterns
   */
  async getAPIUsagePatterns(tenantId, options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            endpoint,
            method,
            count() as request_count,
            avg(response_time_ms) as avg_response_time,
            quantile(0.95)(response_time_ms) as p95_response_time,
            countIf(status_code >= 400) as error_count,
            countIf(status_code >= 400) / count() * 100 as error_rate
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.API_REQUESTS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
          GROUP BY endpoint, method
          ORDER BY request_count DESC
          LIMIT 50
        `,
        query_params: {
          tenantId,
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting API usage:', error);
      return [];
    }
  }

  /**
   * Get real-time metrics (last hour)
   */
  async getRealTimeMetrics(tenantId) {
    if (!await this.isAvailable()) return null;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
      const result = await this.client.query({
        query: `
          SELECT
            toStartOfMinute(created_at) as minute,
            count() as calls,
            countIf(status = 'in-progress') as active_calls,
            avg(mos_score) as avg_mos
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
          WHERE tenant_id = {tenantId:UUID}
            AND created_at >= {startDate:DateTime64(3)}
          GROUP BY minute
          ORDER BY minute
        `,
        query_params: {
          tenantId,
          startDate: oneHourAgo
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting real-time metrics:', error);
      return [];
    }
  }

  /**
   * Cross-tenant analytics (admin only)
   */
  async getPlatformOverview(options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            uniq(tenant_id) as active_tenants,
            count() as total_calls,
            sum(duration) as total_duration,
            sum(cost) as total_revenue,
            avg(mos_score) as platform_avg_mos
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
          WHERE created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
        `,
        query_params: {
          startDate,
          endDate
        },
        format: 'JSONEachRow'
      });

      return (await result.json())[0] || {};
    } catch (error) {
      console.error('[ClickHouse] Error getting platform overview:', error);
      return {};
    }
  }

  /**
   * Get top tenants by usage
   */
  async getTopTenants(options = {}) {
    if (!await this.isAvailable()) return null;

    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      limit = 10
    } = options;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            tenant_id,
            count() as total_calls,
            sum(duration) as total_duration,
            sum(cost) as total_cost,
            avg(mos_score) as avg_mos
          FROM ${CLICKHOUSE_CONFIG.database}.${TABLES.CALLS}
          WHERE created_at >= {startDate:DateTime64(3)}
            AND created_at <= {endDate:DateTime64(3)}
          GROUP BY tenant_id
          ORDER BY total_cost DESC
          LIMIT {limit:UInt32}
        `,
        query_params: {
          startDate,
          endDate,
          limit
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting top tenants:', error);
      return [];
    }
  }

  // ============================================
  // Data Sync Methods
  // ============================================

  /**
   * Sync calls from PostgreSQL to ClickHouse
   */
  async syncCallsFromPostgres(pool, options = {}) {
    if (!await this.isAvailable()) return { synced: 0 };

    const {
      batchSize = 1000,
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    } = options;

    try {
      // Get calls from PostgreSQL
      const result = await pool.query(`
        SELECT * FROM calls
        WHERE created_at >= $1
        ORDER BY created_at
        LIMIT $2
      `, [startDate, batchSize]);

      if (result.rows.length === 0) {
        return { synced: 0 };
      }

      // Insert into ClickHouse
      const synced = await this.insertCallsBatch(result.rows);
      console.log(`[ClickHouse] Synced ${synced} calls from PostgreSQL`);

      return { synced };
    } catch (error) {
      console.error('[ClickHouse] Error syncing calls:', error);
      return { synced: 0, error: error.message };
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Format call data for ClickHouse insertion
   */
  formatCallData(call) {
    return {
      id: call.id,
      tenant_id: call.tenant_id,
      call_sid: call.call_sid || call.id,
      from_number: call.from_number,
      to_number: call.to_number,
      direction: call.direction || 'outbound',
      status: call.status || 'completed',
      duration: call.duration || 0,
      billable_duration: call.billable_duration || call.duration || 0,
      cost: call.cost || 0,
      carrier: call.carrier || 'unknown',
      campaign_id: call.campaign_id,
      agent_id: call.agent_id,
      queue_id: call.queue_id,
      disposition: call.disposition || '',
      recording_url: call.recording_url,
      mos_score: call.mos_score,
      jitter_ms: call.jitter_ms,
      packet_loss_pct: call.packet_loss_pct,
      metadata: JSON.stringify(call.metadata || {}),
      created_at: new Date(call.created_at || Date.now()),
      answered_at: call.answered_at ? new Date(call.answered_at) : null,
      ended_at: call.ended_at ? new Date(call.ended_at) : null
    };
  }

  /**
   * Execute raw query (admin only)
   */
  async rawQuery(query, params = {}) {
    if (!await this.isAvailable()) return null;

    try {
      const result = await this.client.query({
        query,
        query_params: params,
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error executing query:', error);
      throw error;
    }
  }

  /**
   * Get table row counts
   */
  async getTableStats() {
    if (!await this.isAvailable()) return null;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            table,
            formatReadableSize(sum(bytes_on_disk)) as disk_size,
            sum(rows) as row_count,
            count() as part_count
          FROM system.parts
          WHERE database = {database:String}
            AND active
          GROUP BY table
          ORDER BY sum(bytes_on_disk) DESC
        `,
        query_params: {
          database: CLICKHOUSE_CONFIG.database
        },
        format: 'JSONEachRow'
      });

      return await result.json();
    } catch (error) {
      console.error('[ClickHouse] Error getting table stats:', error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!await this.isAvailable()) {
        return { status: 'disconnected', error: 'ClickHouse not available' };
      }

      const result = await this.client.query({
        query: 'SELECT version() as version, uptime() as uptime_seconds'
      });
      const data = (await result.json())[0];

      return {
        status: 'healthy',
        version: data?.version,
        uptimeSeconds: data?.uptime_seconds
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.isConnected = false;
    }
  }
}

// Singleton instance
const clickhouseService = new ClickHouseService();

export default clickhouseService;
export { TABLES, MATERIALIZED_VIEWS };
