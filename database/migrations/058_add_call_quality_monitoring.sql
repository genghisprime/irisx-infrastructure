-- Call Quality Monitoring Tables
-- Migration: 058_add_call_quality_monitoring.sql
-- E-Model MOS calculation, RTCP metrics, carrier quality scoring

-- Call quality metrics (time-series data)
CREATE TABLE IF NOT EXISTS call_quality_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- MOS & R-Factor (E-Model ITU-T G.107)
    mos DECIMAL(3,1) NOT NULL CHECK (mos >= 1.0 AND mos <= 5.0),
    r_factor DECIMAL(5,2) NOT NULL CHECK (r_factor >= 0 AND r_factor <= 100),
    quality VARCHAR(20) NOT NULL CHECK (quality IN ('Excellent', 'Good', 'Fair', 'Poor', 'Bad', 'Unacceptable')),

    -- Network metrics from RTCP
    jitter_avg DECIMAL(8,2), -- ms
    jitter_in DECIMAL(8,2),  -- ms (inbound)
    jitter_out DECIMAL(8,2), -- ms (outbound)

    packet_loss_avg DECIMAL(5,2), -- %
    packet_loss_in DECIMAL(5,2),  -- % (inbound)
    packet_loss_out DECIMAL(5,2), -- % (outbound)

    latency DECIMAL(8,2), -- ms (one-way)
    rtt DECIMAL(8,2),     -- ms (round-trip time)

    -- Codec information
    codec VARCHAR(20) NOT NULL DEFAULT 'PCMU',

    -- Packet counts
    packets_sent INTEGER DEFAULT 0,
    packets_received INTEGER DEFAULT 0,
    packets_lost INTEGER DEFAULT 0,

    -- Call metadata for joins/filtering
    carrier_id UUID,
    agent_id UUID REFERENCES users(id),
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound'))
);

-- Call quality summary (one per call, updated at end)
CREATE TABLE IF NOT EXISTS call_quality_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- MOS scores
    avg_mos DECIMAL(3,1),
    min_mos DECIMAL(3,1),
    max_mos DECIMAL(3,1),
    final_quality VARCHAR(20),

    -- R-Factor
    avg_r_factor DECIMAL(5,2),

    -- Network metrics averages
    avg_jitter DECIMAL(8,2),
    max_jitter DECIMAL(8,2),
    avg_packet_loss DECIMAL(5,2),
    max_packet_loss DECIMAL(5,2),
    avg_latency DECIMAL(8,2),
    max_latency DECIMAL(8,2),

    -- Counts
    sample_count INTEGER DEFAULT 0,
    alert_count INTEGER DEFAULT 0,

    -- Call metadata
    carrier_id UUID,
    agent_id UUID REFERENCES users(id),
    codec VARCHAR(20),
    duration_seconds INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quality alerts
CREATE TABLE IF NOT EXISTS call_quality_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Alert details
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN (
        'low_mos', 'high_jitter', 'high_packet_loss', 'high_latency',
        'quality_degradation', 'one_way_audio', 'echo_detected'
    )),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('warning', 'critical')),

    -- Metrics at time of alert
    mos DECIMAL(3,1),
    jitter DECIMAL(8,2),
    packet_loss DECIMAL(5,2),
    latency DECIMAL(8,2),

    -- Alert message
    message TEXT NOT NULL,

    -- Status
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Carrier quality scores (aggregated daily)
CREATE TABLE IF NOT EXISTS carrier_quality_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    carrier_id UUID NOT NULL,
    carrier_name VARCHAR(100),

    -- Quality metrics
    avg_mos DECIMAL(3,2),
    median_mos DECIMAL(3,2),
    min_mos DECIMAL(3,2),
    max_mos DECIMAL(3,2),

    -- Call counts
    total_calls INTEGER DEFAULT 0,
    excellent_calls INTEGER DEFAULT 0,  -- MOS >= 4.3
    good_calls INTEGER DEFAULT 0,       -- MOS 4.0-4.3
    fair_calls INTEGER DEFAULT 0,       -- MOS 3.6-4.0
    poor_calls INTEGER DEFAULT 0,       -- MOS < 3.6

    -- Quality percentage
    quality_percentage DECIMAL(5,2), -- % of calls with MOS >= 4.0

    -- Network metrics
    avg_jitter DECIMAL(8,2),
    avg_packet_loss DECIMAL(5,2),
    avg_latency DECIMAL(8,2),

    -- Cost metrics
    total_cost DECIMAL(12,4),
    avg_cost_per_call DECIMAL(8,4),

    -- Score (composite quality score 0-100)
    quality_score DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(date, tenant_id, carrier_id)
);

-- Agent quality scores (aggregated daily)
CREATE TABLE IF NOT EXISTS agent_quality_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Quality metrics
    avg_mos DECIMAL(3,2),
    min_mos DECIMAL(3,2),

    -- Call counts
    total_calls INTEGER DEFAULT 0,
    excellent_calls INTEGER DEFAULT 0,
    poor_calls INTEGER DEFAULT 0,

    -- Quality percentage
    quality_percentage DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(date, tenant_id, agent_id)
);

-- Quality alert thresholds (per tenant configurable)
CREATE TABLE IF NOT EXISTS quality_alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

    -- Warning thresholds
    warning_mos DECIMAL(3,1) DEFAULT 3.0,
    warning_jitter DECIMAL(8,2) DEFAULT 30.0,
    warning_packet_loss DECIMAL(5,2) DEFAULT 3.0,
    warning_latency DECIMAL(8,2) DEFAULT 150.0,

    -- Critical thresholds
    critical_mos DECIMAL(3,1) DEFAULT 2.5,
    critical_jitter DECIMAL(8,2) DEFAULT 50.0,
    critical_packet_loss DECIMAL(5,2) DEFAULT 5.0,
    critical_latency DECIMAL(8,2) DEFAULT 200.0,

    -- Notification settings
    notify_email BOOLEAN DEFAULT TRUE,
    notify_sms BOOLEAN DEFAULT FALSE,
    notify_webhook BOOLEAN DEFAULT TRUE,
    notification_emails TEXT[], -- Array of email addresses

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cqm_call_id ON call_quality_metrics(call_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cqm_tenant_time ON call_quality_metrics(tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_cqm_carrier_time ON call_quality_metrics(carrier_id, time DESC) WHERE carrier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cqm_agent_time ON call_quality_metrics(agent_id, time DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cqm_mos ON call_quality_metrics(mos, time DESC);

CREATE INDEX IF NOT EXISTS idx_cqs_call ON call_quality_summary(call_id);
CREATE INDEX IF NOT EXISTS idx_cqs_tenant ON call_quality_summary(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cqa_tenant ON call_quality_alerts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cqa_call ON call_quality_alerts(call_id);
CREATE INDEX IF NOT EXISTS idx_cqa_unack ON call_quality_alerts(tenant_id) WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_cqa_severity ON call_quality_alerts(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_carrier_scores_date ON carrier_quality_scores(date, tenant_id);
CREATE INDEX IF NOT EXISTS idx_carrier_scores_carrier ON carrier_quality_scores(carrier_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_agent_scores_date ON agent_quality_scores(date, tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_quality_scores(agent_id, date DESC);

-- Comments
COMMENT ON TABLE call_quality_metrics IS 'Real-time RTCP metrics with E-Model MOS calculation';
COMMENT ON TABLE call_quality_summary IS 'Aggregated quality summary per call';
COMMENT ON TABLE call_quality_alerts IS 'Quality alerts when thresholds exceeded';
COMMENT ON TABLE carrier_quality_scores IS 'Daily carrier quality rankings';
COMMENT ON TABLE agent_quality_scores IS 'Daily agent quality metrics';
COMMENT ON COLUMN call_quality_metrics.mos IS 'Mean Opinion Score (1.0-5.0) calculated using E-Model';
COMMENT ON COLUMN call_quality_metrics.r_factor IS 'R-Factor (0-100) from E-Model calculation';
