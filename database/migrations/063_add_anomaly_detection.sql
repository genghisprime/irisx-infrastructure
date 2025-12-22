-- Anomaly Detection Tables
-- Migration: 063_add_anomaly_detection.sql

-- Anomaly detection rules
CREATE TABLE IF NOT EXISTS anomaly_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform-wide

    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'usage', 'security', 'billing', 'performance', 'quality'

    -- Detection method
    detection_method VARCHAR(50) NOT NULL DEFAULT 'zscore', -- 'zscore', 'iqr', 'threshold', 'ml'

    -- Metric to monitor
    metric_type VARCHAR(100) NOT NULL, -- e.g., 'call_volume', 'api_calls', 'failed_logins', 'spend'
    metric_query TEXT, -- SQL query to get metric value

    -- Thresholds
    threshold_type VARCHAR(20) DEFAULT 'dynamic', -- 'static', 'dynamic'
    static_threshold DECIMAL(14,2),
    zscore_threshold DECIMAL(4,2) DEFAULT 3.0,
    iqr_multiplier DECIMAL(4,2) DEFAULT 1.5,

    -- Comparison period
    comparison_period VARCHAR(20) DEFAULT 'day', -- 'hour', 'day', 'week', 'month'
    lookback_periods INTEGER DEFAULT 30,

    -- Alert settings
    severity VARCHAR(20) DEFAULT 'warning', -- 'info', 'warning', 'critical'
    cooldown_minutes INTEGER DEFAULT 60,
    notify_channels JSONB DEFAULT '["email"]', -- 'email', 'sms', 'slack', 'webhook'

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical metrics for baseline calculation
CREATE TABLE IF NOT EXISTS metric_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    metric_type VARCHAR(100) NOT NULL,
    metric_value DECIMAL(14,4) NOT NULL,
    metric_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Additional context
    dimension VARCHAR(100), -- e.g., 'agent_id', 'queue_id', 'carrier_id'
    dimension_value VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Detected anomalies
CREATE TABLE IF NOT EXISTS anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES anomaly_rules(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- Anomaly details
    metric_type VARCHAR(100) NOT NULL,
    metric_value DECIMAL(14,4) NOT NULL,
    expected_value DECIMAL(14,4),
    deviation_score DECIMAL(6,2), -- Z-score or IQR-based score

    -- Context
    dimension VARCHAR(100),
    dimension_value VARCHAR(255),
    detection_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Analysis
    severity VARCHAR(20) NOT NULL,
    description TEXT,
    possible_causes JSONB DEFAULT '[]',
    recommended_actions JSONB DEFAULT '[]',

    -- Status
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'acknowledged', 'investigating', 'resolved', 'false_positive'
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Anomaly notifications
CREATE TABLE IF NOT EXISTS anomaly_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id UUID NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,

    channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'slack', 'webhook'
    recipient VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metric baselines (calculated periodically)
CREATE TABLE IF NOT EXISTS metric_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    metric_type VARCHAR(100) NOT NULL,
    dimension VARCHAR(100),
    dimension_value VARCHAR(255),

    -- Statistical values
    period_type VARCHAR(20) NOT NULL, -- 'hour', 'day', 'week'
    period_value INTEGER, -- 0-23 for hour, 0-6 for day_of_week

    mean_value DECIMAL(14,4),
    std_dev DECIMAL(14,4),
    min_value DECIMAL(14,4),
    max_value DECIMAL(14,4),
    percentile_25 DECIMAL(14,4),
    percentile_50 DECIMAL(14,4),
    percentile_75 DECIMAL(14,4),
    sample_count INTEGER,

    last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, metric_type, dimension, dimension_value, period_type, period_value)
);

-- Auto-remediation rules
CREATE TABLE IF NOT EXISTS remediation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES anomaly_rules(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Trigger conditions
    severity_threshold VARCHAR(20) DEFAULT 'critical',
    consecutive_anomalies INTEGER DEFAULT 3,

    -- Action
    action_type VARCHAR(50) NOT NULL, -- 'scale_up', 'block_ip', 'rate_limit', 'alert_escalate', 'webhook'
    action_config JSONB DEFAULT '{}',

    -- Safety
    require_approval BOOLEAN DEFAULT true,
    max_executions_per_hour INTEGER DEFAULT 3,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remediation execution log
CREATE TABLE IF NOT EXISTS remediation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES remediation_rules(id),
    anomaly_id UUID NOT NULL REFERENCES anomalies(id),
    tenant_id UUID REFERENCES tenants(id),

    action_type VARCHAR(50) NOT NULL,
    action_config JSONB,

    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'executed', 'failed', 'rejected'
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,

    execution_result JSONB,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_anomaly_rules_tenant ON anomaly_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_rules_category ON anomaly_rules(category);
CREATE INDEX IF NOT EXISTS idx_metric_history_tenant ON metric_history(tenant_id, metric_type, metric_timestamp);
CREATE INDEX IF NOT EXISTS idx_metric_history_timestamp ON metric_history(metric_timestamp);
CREATE INDEX IF NOT EXISTS idx_anomalies_rule ON anomalies(rule_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON anomalies(tenant_id, detection_timestamp);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomaly_notifications_anomaly ON anomaly_notifications(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_metric_baselines_lookup ON metric_baselines(tenant_id, metric_type, period_type);
CREATE INDEX IF NOT EXISTS idx_remediation_executions_anomaly ON remediation_executions(anomaly_id);

-- Insert default anomaly rules
INSERT INTO anomaly_rules (name, description, category, metric_type, threshold_type, zscore_threshold, severity)
VALUES
    ('High Call Volume Spike', 'Detect unusual spikes in call volume', 'usage', 'call_volume', 'dynamic', 3.0, 'warning'),
    ('API Rate Anomaly', 'Detect unusual API usage patterns', 'usage', 'api_calls', 'dynamic', 3.0, 'warning'),
    ('Failed Login Surge', 'Detect potential brute force attacks', 'security', 'failed_logins', 'dynamic', 2.5, 'critical'),
    ('Spend Anomaly', 'Detect unusual spending patterns', 'billing', 'daily_spend', 'dynamic', 2.5, 'warning'),
    ('Call Quality Degradation', 'Detect MOS score drops', 'quality', 'avg_mos_score', 'dynamic', 2.0, 'critical'),
    ('Response Time Spike', 'Detect API response time increases', 'performance', 'avg_response_time', 'dynamic', 2.5, 'warning'),
    ('Error Rate Spike', 'Detect increased error rates', 'performance', 'error_rate', 'dynamic', 2.5, 'critical')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE anomaly_rules IS 'Configuration for anomaly detection rules';
COMMENT ON TABLE metric_history IS 'Historical metric values for baseline calculation';
COMMENT ON TABLE anomalies IS 'Detected anomalies and their status';
COMMENT ON TABLE metric_baselines IS 'Calculated baselines for metric comparison';
COMMENT ON TABLE remediation_rules IS 'Auto-remediation rules for critical anomalies';
