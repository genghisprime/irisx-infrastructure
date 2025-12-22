-- Migration: 065_add_provider_health_scoring.sql
-- Description: Provider health scoring and monitoring
-- Date: December 16, 2025

-- ===========================================
-- PROVIDER TYPES
-- ===========================================

-- Extend providers table if needed
DO $$ BEGIN
  -- Add provider type if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'providers' AND column_name = 'provider_type') THEN
    ALTER TABLE providers ADD COLUMN provider_type VARCHAR(50) DEFAULT 'voice';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'providers' AND column_name = 'is_active') THEN
    ALTER TABLE providers ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- ===========================================
-- PROVIDER HEALTH METRICS
-- ===========================================

-- Store real-time health metrics per provider
CREATE TABLE IF NOT EXISTS provider_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- asr, acd, pdd, ner, mos, latency, capacity
    metric_value DECIMAL(10, 4) NOT NULL,
    threshold_warning DECIMAL(10, 4),
    threshold_critical DECIMAL(10, 4),
    status VARCHAR(20) DEFAULT 'normal', -- normal, warning, critical, degraded, offline
    sample_size INTEGER DEFAULT 0, -- Number of calls/transactions in sample
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_health_metrics_provider ON provider_health_metrics(provider_id);
CREATE INDEX idx_provider_health_metrics_type ON provider_health_metrics(metric_type);
CREATE INDEX idx_provider_health_metrics_recorded ON provider_health_metrics(recorded_at);
CREATE INDEX idx_provider_health_metrics_status ON provider_health_metrics(status);

-- ===========================================
-- PROVIDER HEALTH SCORES
-- ===========================================

-- Aggregated health scores
CREATE TABLE IF NOT EXISTS provider_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL UNIQUE,
    overall_score DECIMAL(5, 2) DEFAULT 100.00, -- 0-100 score
    reliability_score DECIMAL(5, 2) DEFAULT 100.00, -- Based on uptime, error rates
    quality_score DECIMAL(5, 2) DEFAULT 100.00, -- Based on MOS, latency, jitter
    performance_score DECIMAL(5, 2) DEFAULT 100.00, -- Based on ASR, ACD, PDD
    cost_efficiency_score DECIMAL(5, 2) DEFAULT 100.00, -- Based on cost per minute
    status VARCHAR(20) DEFAULT 'healthy', -- healthy, degraded, critical, offline
    trend VARCHAR(20) DEFAULT 'stable', -- improving, stable, declining
    last_incident_at TIMESTAMP WITH TIME ZONE,
    consecutive_healthy_checks INTEGER DEFAULT 0,
    consecutive_unhealthy_checks INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_health_scores_status ON provider_health_scores(status);
CREATE INDEX idx_provider_health_scores_score ON provider_health_scores(overall_score);

-- ===========================================
-- PROVIDER HEALTH HISTORY
-- ===========================================

-- Historical scores for trending
CREATE TABLE IF NOT EXISTS provider_health_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    overall_score DECIMAL(5, 2),
    reliability_score DECIMAL(5, 2),
    quality_score DECIMAL(5, 2),
    performance_score DECIMAL(5, 2),
    status VARCHAR(20),
    call_volume INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    avg_mos DECIMAL(3, 2),
    avg_asr DECIMAL(5, 2),
    avg_acd DECIMAL(10, 2),
    avg_pdd DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_health_history_provider ON provider_health_history(provider_id);
CREATE INDEX idx_provider_health_history_recorded ON provider_health_history(recorded_at);
CREATE INDEX idx_provider_health_history_provider_date ON provider_health_history(provider_id, recorded_at);

-- ===========================================
-- PROVIDER INCIDENTS
-- ===========================================

-- Track provider incidents and outages
CREATE TABLE IF NOT EXISTS provider_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    incident_type VARCHAR(50) NOT NULL, -- outage, degradation, high_error_rate, quality_drop, capacity_issue
    severity VARCHAR(20) NOT NULL, -- minor, major, critical
    status VARCHAR(20) DEFAULT 'open', -- open, investigating, identified, monitoring, resolved
    title VARCHAR(255) NOT NULL,
    description TEXT,
    impact VARCHAR(100), -- call_failures, quality_degradation, increased_latency
    affected_routes TEXT[], -- List of affected destinations/routes
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    resolution_notes TEXT,
    auto_detected BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_incidents_provider ON provider_incidents(provider_id);
CREATE INDEX idx_provider_incidents_status ON provider_incidents(status);
CREATE INDEX idx_provider_incidents_severity ON provider_incidents(severity);
CREATE INDEX idx_provider_incidents_started ON provider_incidents(started_at);

-- ===========================================
-- PROVIDER INCIDENT UPDATES
-- ===========================================

-- Track updates to incidents
CREATE TABLE IF NOT EXISTS provider_incident_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES provider_incidents(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false, -- Visible to tenants
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_incident_updates_incident ON provider_incident_updates(incident_id);

-- ===========================================
-- PROVIDER HEALTH THRESHOLDS
-- ===========================================

-- Configurable thresholds per metric
CREATE TABLE IF NOT EXISTS provider_health_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID, -- NULL = global default
    metric_type VARCHAR(50) NOT NULL,
    warning_threshold DECIMAL(10, 4) NOT NULL,
    critical_threshold DECIMAL(10, 4) NOT NULL,
    comparison_operator VARCHAR(10) DEFAULT 'lt', -- lt, gt, lte, gte
    window_minutes INTEGER DEFAULT 5, -- Rolling window for evaluation
    min_sample_size INTEGER DEFAULT 10, -- Minimum samples before alerting
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, metric_type)
);

-- Insert default thresholds
INSERT INTO provider_health_thresholds (provider_id, metric_type, warning_threshold, critical_threshold, comparison_operator) VALUES
  -- ASR (Answer Seizure Ratio) - Higher is better
  (NULL, 'asr', 60.00, 40.00, 'lt'),
  -- ACD (Average Call Duration) - Lower might indicate issues
  (NULL, 'acd', 30.00, 10.00, 'lt'),
  -- PDD (Post Dial Delay) - Lower is better
  (NULL, 'pdd', 5.00, 10.00, 'gt'),
  -- NER (Network Effectiveness Ratio) - Higher is better
  (NULL, 'ner', 95.00, 90.00, 'lt'),
  -- MOS (Mean Opinion Score) - Higher is better
  (NULL, 'mos', 3.5, 3.0, 'lt'),
  -- Latency - Lower is better
  (NULL, 'latency', 200.00, 400.00, 'gt'),
  -- Error Rate - Lower is better
  (NULL, 'error_rate', 5.00, 15.00, 'gt'),
  -- Capacity Utilization - Higher might indicate strain
  (NULL, 'capacity', 80.00, 95.00, 'gt')
ON CONFLICT (provider_id, metric_type) DO NOTHING;

-- ===========================================
-- PROVIDER HEALTH ALERTS
-- ===========================================

-- Alerts triggered by health issues
CREATE TABLE IF NOT EXISTS provider_health_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- threshold_breach, incident, status_change
    severity VARCHAR(20) NOT NULL, -- info, warning, critical
    metric_type VARCHAR(50),
    current_value DECIMAL(10, 4),
    threshold_value DECIMAL(10, 4),
    message TEXT NOT NULL,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_health_alerts_provider ON provider_health_alerts(provider_id);
CREATE INDEX idx_provider_health_alerts_type ON provider_health_alerts(alert_type);
CREATE INDEX idx_provider_health_alerts_severity ON provider_health_alerts(severity);
CREATE INDEX idx_provider_health_alerts_acknowledged ON provider_health_alerts(acknowledged);

-- ===========================================
-- PROVIDER COMPARISON
-- ===========================================

-- Provider ranking by route/destination
CREATE TABLE IF NOT EXISTS provider_route_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL,
    route_prefix VARCHAR(20) NOT NULL, -- E.g., '1', '44', '91' for country codes
    route_name VARCHAR(100), -- E.g., 'US', 'UK', 'India'
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    asr DECIMAL(5, 2),
    avg_acd DECIMAL(10, 2),
    avg_pdd DECIMAL(10, 2),
    avg_mos DECIMAL(3, 2),
    avg_cost_per_minute DECIMAL(10, 6),
    quality_score DECIMAL(5, 2),
    cost_score DECIMAL(5, 2),
    overall_score DECIMAL(5, 2),
    rank INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, route_prefix)
);

CREATE INDEX idx_provider_route_scores_provider ON provider_route_scores(provider_id);
CREATE INDEX idx_provider_route_scores_route ON provider_route_scores(route_prefix);
CREATE INDEX idx_provider_route_scores_score ON provider_route_scores(overall_score);

-- ===========================================
-- FAILOVER CONFIGURATION
-- ===========================================

-- Provider failover rules
CREATE TABLE IF NOT EXISTS provider_failover_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    route_prefix VARCHAR(20), -- NULL = all routes
    primary_provider_id UUID NOT NULL,
    failover_providers UUID[] NOT NULL, -- Ordered list of failover providers
    trigger_conditions JSONB DEFAULT '{}', -- {"asr_below": 50, "mos_below": 3.0}
    cooldown_minutes INTEGER DEFAULT 15, -- Wait before re-enabling primary
    auto_failback BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_failover_rules_primary ON provider_failover_rules(primary_provider_id);
CREATE INDEX idx_provider_failover_rules_route ON provider_failover_rules(route_prefix);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to calculate provider health score
CREATE OR REPLACE FUNCTION calculate_provider_health_score(p_provider_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_reliability_score DECIMAL(5, 2);
    v_quality_score DECIMAL(5, 2);
    v_performance_score DECIMAL(5, 2);
    v_overall_score DECIMAL(5, 2);
    v_metrics RECORD;
BEGIN
    -- Get recent metrics (last hour)
    SELECT
        AVG(CASE WHEN metric_type = 'asr' THEN metric_value END) as avg_asr,
        AVG(CASE WHEN metric_type = 'mos' THEN metric_value END) as avg_mos,
        AVG(CASE WHEN metric_type = 'pdd' THEN metric_value END) as avg_pdd,
        AVG(CASE WHEN metric_type = 'error_rate' THEN metric_value END) as avg_error_rate,
        AVG(CASE WHEN metric_type = 'latency' THEN metric_value END) as avg_latency
    INTO v_metrics
    FROM provider_health_metrics
    WHERE provider_id = p_provider_id
      AND recorded_at > NOW() - INTERVAL '1 hour';

    -- Calculate reliability score (based on error rate)
    v_reliability_score := GREATEST(0, 100 - COALESCE(v_metrics.avg_error_rate, 0) * 5);

    -- Calculate quality score (based on MOS, scale 1-5 to 0-100)
    v_quality_score := COALESCE((v_metrics.avg_mos - 1) * 25, 100);

    -- Calculate performance score (based on ASR and PDD)
    v_performance_score := COALESCE(v_metrics.avg_asr, 100) * 0.7 +
                          GREATEST(0, 100 - COALESCE(v_metrics.avg_pdd, 0) * 5) * 0.3;

    -- Overall score (weighted average)
    v_overall_score := v_reliability_score * 0.4 +
                       v_quality_score * 0.3 +
                       v_performance_score * 0.3;

    -- Update scores table
    INSERT INTO provider_health_scores (provider_id, overall_score, reliability_score, quality_score, performance_score)
    VALUES (p_provider_id, v_overall_score, v_reliability_score, v_quality_score, v_performance_score)
    ON CONFLICT (provider_id) DO UPDATE SET
        overall_score = v_overall_score,
        reliability_score = v_reliability_score,
        quality_score = v_quality_score,
        performance_score = v_performance_score,
        updated_at = NOW();

    RETURN v_overall_score;
END;
$$ LANGUAGE plpgsql;

-- Function to check provider health and create alerts
CREATE OR REPLACE FUNCTION check_provider_health(p_provider_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_threshold RECORD;
    v_metric RECORD;
    v_breach_count INTEGER := 0;
    v_status TEXT := 'healthy';
BEGIN
    -- Check each metric against thresholds
    FOR v_threshold IN
        SELECT * FROM provider_health_thresholds
        WHERE (provider_id = p_provider_id OR provider_id IS NULL) AND is_active = true
    LOOP
        -- Get latest metric value
        SELECT * INTO v_metric
        FROM provider_health_metrics
        WHERE provider_id = p_provider_id AND metric_type = v_threshold.metric_type
        ORDER BY recorded_at DESC LIMIT 1;

        IF v_metric IS NOT NULL THEN
            -- Check threshold breach
            IF (v_threshold.comparison_operator = 'lt' AND v_metric.metric_value < v_threshold.critical_threshold) OR
               (v_threshold.comparison_operator = 'gt' AND v_metric.metric_value > v_threshold.critical_threshold) THEN
                -- Critical breach
                v_breach_count := v_breach_count + 1;
                v_status := 'critical';

                -- Create alert if not recently created
                INSERT INTO provider_health_alerts (provider_id, alert_type, severity, metric_type, current_value, threshold_value, message)
                SELECT p_provider_id, 'threshold_breach', 'critical', v_threshold.metric_type, v_metric.metric_value, v_threshold.critical_threshold,
                       format('%s metric critical: %.2f (threshold: %.2f)', v_threshold.metric_type, v_metric.metric_value, v_threshold.critical_threshold)
                WHERE NOT EXISTS (
                    SELECT 1 FROM provider_health_alerts
                    WHERE provider_id = p_provider_id
                      AND metric_type = v_threshold.metric_type
                      AND severity = 'critical'
                      AND resolved = false
                      AND created_at > NOW() - INTERVAL '5 minutes'
                );
            ELSIF (v_threshold.comparison_operator = 'lt' AND v_metric.metric_value < v_threshold.warning_threshold) OR
                  (v_threshold.comparison_operator = 'gt' AND v_metric.metric_value > v_threshold.warning_threshold) THEN
                -- Warning breach
                IF v_status = 'healthy' THEN v_status := 'degraded'; END IF;
            END IF;
        END IF;
    END LOOP;

    -- Update provider status
    UPDATE provider_health_scores SET status = v_status, updated_at = NOW()
    WHERE provider_id = p_provider_id;

    RETURN v_status;
END;
$$ LANGUAGE plpgsql;

-- Function to record provider health snapshot
CREATE OR REPLACE FUNCTION record_provider_health_snapshot()
RETURNS INTEGER AS $$
DECLARE
    v_provider RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_provider IN
        SELECT DISTINCT provider_id FROM provider_health_scores
    LOOP
        INSERT INTO provider_health_history (
            provider_id, overall_score, reliability_score, quality_score, performance_score, status
        )
        SELECT provider_id, overall_score, reliability_score, quality_score, performance_score, status
        FROM provider_health_scores WHERE provider_id = v_provider.provider_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
