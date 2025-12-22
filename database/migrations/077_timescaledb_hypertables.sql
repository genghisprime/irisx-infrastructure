-- TimescaleDB Hypertables Migration
-- High-performance time-series data storage for analytics

-- Enable TimescaleDB extension (run as superuser if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- Call Quality Metrics Hypertable
-- ============================================

-- Create call quality metrics table for hypertable conversion
CREATE TABLE IF NOT EXISTS call_quality_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    call_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    -- Audio quality
    mos_score DECIMAL(3, 2),
    r_factor DECIMAL(5, 2),
    jitter_ms DECIMAL(10, 4),
    packet_loss_percent DECIMAL(5, 2),
    latency_ms DECIMAL(10, 2),

    -- Network metrics
    rtt_ms DECIMAL(10, 2),
    bitrate_kbps INTEGER,
    codec VARCHAR(20),

    -- Direction
    direction VARCHAR(10) -- 'inbound' or 'outbound'
);

-- Convert to hypertable (if TimescaleDB is enabled)
-- SELECT create_hypertable('call_quality_metrics_ts', 'time',
--     chunk_time_interval => INTERVAL '1 day',
--     if_not_exists => TRUE
-- );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cqm_ts_tenant_time ON call_quality_metrics_ts(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cqm_ts_call ON call_quality_metrics_ts(call_id, time DESC);

-- ============================================
-- Agent Metrics Hypertable
-- ============================================

CREATE TABLE IF NOT EXISTS agent_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    agent_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    -- Activity metrics
    status VARCHAR(20),
    state_duration_seconds INTEGER,
    calls_handled INTEGER DEFAULT 0,
    calls_missed INTEGER DEFAULT 0,

    -- Performance metrics
    avg_handle_time_seconds DECIMAL(10, 2),
    avg_hold_time_seconds DECIMAL(10, 2),
    avg_talk_time_seconds DECIMAL(10, 2),
    avg_wrap_time_seconds DECIMAL(10, 2),

    -- Occupancy
    utilization_percent DECIMAL(5, 2),
    occupancy_percent DECIMAL(5, 2),

    -- Quality
    csat_score DECIMAL(3, 2),
    fcr_rate DECIMAL(5, 2)
);

-- Convert to hypertable
-- SELECT create_hypertable('agent_metrics_ts', 'time',
--     chunk_time_interval => INTERVAL '1 hour',
--     if_not_exists => TRUE
-- );

CREATE INDEX IF NOT EXISTS idx_am_ts_agent_time ON agent_metrics_ts(agent_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_am_ts_tenant_time ON agent_metrics_ts(tenant_id, time DESC);

-- ============================================
-- Queue Metrics Hypertable
-- ============================================

CREATE TABLE IF NOT EXISTS queue_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    queue_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    -- Queue state
    calls_waiting INTEGER DEFAULT 0,
    calls_in_progress INTEGER DEFAULT 0,
    agents_available INTEGER DEFAULT 0,
    agents_on_call INTEGER DEFAULT 0,

    -- Wait times
    avg_wait_time_seconds DECIMAL(10, 2),
    max_wait_time_seconds DECIMAL(10, 2),
    longest_waiting_seconds DECIMAL(10, 2),

    -- Service level
    service_level_percent DECIMAL(5, 2),
    abandon_rate_percent DECIMAL(5, 2),

    -- Volume
    calls_offered INTEGER DEFAULT 0,
    calls_answered INTEGER DEFAULT 0,
    calls_abandoned INTEGER DEFAULT 0
);

-- Convert to hypertable
-- SELECT create_hypertable('queue_metrics_ts', 'time',
--     chunk_time_interval => INTERVAL '5 minutes',
--     if_not_exists => TRUE
-- );

CREATE INDEX IF NOT EXISTS idx_qm_ts_queue_time ON queue_metrics_ts(queue_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_qm_ts_tenant_time ON queue_metrics_ts(tenant_id, time DESC);

-- ============================================
-- API Request Metrics Hypertable
-- ============================================

CREATE TABLE IF NOT EXISTS api_request_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL,

    -- Request info
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,

    -- Performance
    response_time_ms DECIMAL(10, 2),
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,

    -- Rate limiting
    rate_limit_remaining INTEGER,
    rate_limit_reset_at TIMESTAMPTZ,

    -- Errors
    error_code VARCHAR(50),
    error_message TEXT
);

-- Convert to hypertable
-- SELECT create_hypertable('api_request_metrics_ts', 'time',
--     chunk_time_interval => INTERVAL '1 hour',
--     if_not_exists => TRUE
-- );

CREATE INDEX IF NOT EXISTS idx_arm_ts_tenant_time ON api_request_metrics_ts(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_arm_ts_endpoint ON api_request_metrics_ts(endpoint, time DESC);

-- ============================================
-- Billing Events Hypertable
-- ============================================

CREATE TABLE IF NOT EXISTS billing_events_ts (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL,

    -- Event info
    event_type VARCHAR(50),
    resource_type VARCHAR(50),
    resource_id UUID,

    -- Amounts
    quantity DECIMAL(15, 4),
    unit_cost DECIMAL(10, 6),
    total_cost DECIMAL(15, 6),
    currency VARCHAR(3) DEFAULT 'USD',

    -- Metadata
    description TEXT,
    metadata JSONB
);

-- Convert to hypertable
-- SELECT create_hypertable('billing_events_ts', 'time',
--     chunk_time_interval => INTERVAL '1 day',
--     if_not_exists => TRUE
-- );

CREATE INDEX IF NOT EXISTS idx_be_ts_tenant_time ON billing_events_ts(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_be_ts_resource ON billing_events_ts(resource_type, resource_id, time DESC);

-- ============================================
-- System Metrics Hypertable
-- ============================================

CREATE TABLE IF NOT EXISTS system_metrics_ts (
    time TIMESTAMPTZ NOT NULL,
    host VARCHAR(100),
    service VARCHAR(100),

    -- CPU
    cpu_usage_percent DECIMAL(5, 2),
    cpu_load_1min DECIMAL(5, 2),
    cpu_load_5min DECIMAL(5, 2),

    -- Memory
    memory_used_bytes BIGINT,
    memory_free_bytes BIGINT,
    memory_percent DECIMAL(5, 2),

    -- Disk
    disk_used_bytes BIGINT,
    disk_free_bytes BIGINT,
    disk_percent DECIMAL(5, 2),

    -- Network
    network_in_bytes BIGINT,
    network_out_bytes BIGINT,

    -- Application
    active_connections INTEGER,
    request_rate DECIMAL(10, 2),
    error_rate DECIMAL(10, 2)
);

-- Convert to hypertable
-- SELECT create_hypertable('system_metrics_ts', 'time',
--     chunk_time_interval => INTERVAL '10 minutes',
--     if_not_exists => TRUE
-- );

CREATE INDEX IF NOT EXISTS idx_sm_ts_host_time ON system_metrics_ts(host, time DESC);
CREATE INDEX IF NOT EXISTS idx_sm_ts_service_time ON system_metrics_ts(service, time DESC);

-- ============================================
-- Continuous Aggregates (Materialized Views)
-- ============================================

-- Hourly call quality aggregate
-- CREATE MATERIALIZED VIEW IF NOT EXISTS call_quality_hourly
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 hour', time) AS bucket,
--     tenant_id,
--     AVG(mos_score) AS avg_mos,
--     AVG(jitter_ms) AS avg_jitter,
--     AVG(packet_loss_percent) AS avg_packet_loss,
--     AVG(latency_ms) AS avg_latency,
--     COUNT(*) AS sample_count
-- FROM call_quality_metrics_ts
-- GROUP BY bucket, tenant_id
-- WITH NO DATA;

-- Daily agent performance aggregate
-- CREATE MATERIALIZED VIEW IF NOT EXISTS agent_performance_daily
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 day', time) AS bucket,
--     agent_id,
--     tenant_id,
--     SUM(calls_handled) AS total_calls_handled,
--     AVG(avg_handle_time_seconds) AS avg_handle_time,
--     AVG(utilization_percent) AS avg_utilization,
--     AVG(csat_score) AS avg_csat
-- FROM agent_metrics_ts
-- GROUP BY bucket, agent_id, tenant_id
-- WITH NO DATA;

-- Hourly queue performance aggregate
-- CREATE MATERIALIZED VIEW IF NOT EXISTS queue_performance_hourly
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 hour', time) AS bucket,
--     queue_id,
--     tenant_id,
--     AVG(avg_wait_time_seconds) AS avg_wait_time,
--     AVG(service_level_percent) AS avg_service_level,
--     SUM(calls_offered) AS total_offered,
--     SUM(calls_answered) AS total_answered,
--     SUM(calls_abandoned) AS total_abandoned
-- FROM queue_metrics_ts
-- GROUP BY bucket, queue_id, tenant_id
-- WITH NO DATA;

-- Daily billing summary
-- CREATE MATERIALIZED VIEW IF NOT EXISTS billing_daily
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 day', time) AS bucket,
--     tenant_id,
--     resource_type,
--     SUM(quantity) AS total_quantity,
--     SUM(total_cost) AS total_cost,
--     COUNT(*) AS event_count
-- FROM billing_events_ts
-- GROUP BY bucket, tenant_id, resource_type
-- WITH NO DATA;

-- ============================================
-- Compression Policies
-- ============================================

-- Enable compression after 7 days for high-frequency tables
-- ALTER TABLE call_quality_metrics_ts SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'tenant_id',
--     timescaledb.compress_orderby = 'time DESC'
-- );
-- SELECT add_compression_policy('call_quality_metrics_ts', INTERVAL '7 days');

-- ALTER TABLE agent_metrics_ts SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'tenant_id, agent_id',
--     timescaledb.compress_orderby = 'time DESC'
-- );
-- SELECT add_compression_policy('agent_metrics_ts', INTERVAL '7 days');

-- ALTER TABLE queue_metrics_ts SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'tenant_id, queue_id',
--     timescaledb.compress_orderby = 'time DESC'
-- );
-- SELECT add_compression_policy('queue_metrics_ts', INTERVAL '7 days');

-- ALTER TABLE api_request_metrics_ts SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'tenant_id',
--     timescaledb.compress_orderby = 'time DESC'
-- );
-- SELECT add_compression_policy('api_request_metrics_ts', INTERVAL '7 days');

-- ============================================
-- Retention Policies
-- ============================================

-- Keep raw data for 30 days, aggregates for longer
-- SELECT add_retention_policy('call_quality_metrics_ts', INTERVAL '30 days');
-- SELECT add_retention_policy('agent_metrics_ts', INTERVAL '30 days');
-- SELECT add_retention_policy('queue_metrics_ts', INTERVAL '30 days');
-- SELECT add_retention_policy('api_request_metrics_ts', INTERVAL '30 days');
-- SELECT add_retention_policy('system_metrics_ts', INTERVAL '30 days');
-- SELECT add_retention_policy('billing_events_ts', INTERVAL '365 days');

-- ============================================
-- Helper Functions
-- ============================================

-- Function to get time-bucketed call quality
CREATE OR REPLACE FUNCTION get_call_quality_buckets(
    p_tenant_id UUID,
    p_interval INTERVAL,
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    bucket TIMESTAMPTZ,
    avg_mos DECIMAL,
    avg_jitter DECIMAL,
    avg_packet_loss DECIMAL,
    sample_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('hour', time) AS bucket,
        AVG(mos_score)::DECIMAL AS avg_mos,
        AVG(jitter_ms)::DECIMAL AS avg_jitter,
        AVG(packet_loss_percent)::DECIMAL AS avg_packet_loss,
        COUNT(*) AS sample_count
    FROM call_quality_metrics_ts
    WHERE tenant_id = p_tenant_id
        AND time BETWEEN p_start_time AND p_end_time
    GROUP BY date_trunc('hour', time)
    ORDER BY bucket;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent metrics over time
CREATE OR REPLACE FUNCTION get_agent_metrics_trend(
    p_agent_id UUID,
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days',
    p_end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    bucket TIMESTAMPTZ,
    total_calls INTEGER,
    avg_handle_time DECIMAL,
    utilization DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('day', time) AS bucket,
        SUM(calls_handled)::INTEGER AS total_calls,
        AVG(avg_handle_time_seconds)::DECIMAL AS avg_handle_time,
        AVG(utilization_percent)::DECIMAL AS utilization
    FROM agent_metrics_ts
    WHERE agent_id = p_agent_id
        AND time BETWEEN p_start_time AND p_end_time
    GROUP BY date_trunc('day', time)
    ORDER BY bucket;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate service level over time
CREATE OR REPLACE FUNCTION get_service_level_trend(
    p_queue_id UUID,
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    bucket TIMESTAMPTZ,
    service_level DECIMAL,
    abandon_rate DECIMAL,
    avg_wait_time DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('hour', time) AS bucket,
        AVG(service_level_percent)::DECIMAL AS service_level,
        AVG(abandon_rate_percent)::DECIMAL AS abandon_rate,
        AVG(avg_wait_time_seconds)::DECIMAL AS avg_wait_time
    FROM queue_metrics_ts
    WHERE queue_id = p_queue_id
        AND time BETWEEN p_start_time AND p_end_time
    GROUP BY date_trunc('hour', time)
    ORDER BY bucket;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Table Comments
-- ============================================

COMMENT ON TABLE call_quality_metrics_ts IS 'Time-series call quality metrics (TimescaleDB hypertable)';
COMMENT ON TABLE agent_metrics_ts IS 'Time-series agent performance metrics (TimescaleDB hypertable)';
COMMENT ON TABLE queue_metrics_ts IS 'Time-series queue metrics (TimescaleDB hypertable)';
COMMENT ON TABLE api_request_metrics_ts IS 'Time-series API request metrics (TimescaleDB hypertable)';
COMMENT ON TABLE billing_events_ts IS 'Time-series billing events (TimescaleDB hypertable)';
COMMENT ON TABLE system_metrics_ts IS 'Time-series system/infrastructure metrics (TimescaleDB hypertable)';
