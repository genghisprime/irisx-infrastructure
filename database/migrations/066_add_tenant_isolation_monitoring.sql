-- Migration: 066_add_tenant_isolation_monitoring.sql
-- Description: Tenant isolation monitoring and security
-- Date: December 16, 2025

-- ===========================================
-- CROSS-TENANT ACCESS ATTEMPTS
-- ===========================================

-- Log all cross-tenant access attempts (potential violations)
CREATE TABLE IF NOT EXISTS tenant_isolation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- access_attempt, data_leak, permission_violation, api_breach
    severity VARCHAR(20) NOT NULL, -- info, warning, high, critical
    source_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    target_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resource_type VARCHAR(50), -- call, contact, campaign, recording, etc.
    resource_id UUID,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    ip_address INET,
    user_agent TEXT,
    was_blocked BOOLEAN DEFAULT true,
    block_reason TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_isolation_events_source ON tenant_isolation_events(source_tenant_id);
CREATE INDEX idx_tenant_isolation_events_target ON tenant_isolation_events(target_tenant_id);
CREATE INDEX idx_tenant_isolation_events_type ON tenant_isolation_events(event_type);
CREATE INDEX idx_tenant_isolation_events_severity ON tenant_isolation_events(severity);
CREATE INDEX idx_tenant_isolation_events_created ON tenant_isolation_events(created_at);
CREATE INDEX idx_tenant_isolation_events_user ON tenant_isolation_events(user_id);

-- ===========================================
-- TENANT SECURITY POLICIES
-- ===========================================

-- Per-tenant security policies
CREATE TABLE IF NOT EXISTS tenant_security_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    -- Access Controls
    enforce_ip_whitelist BOOLEAN DEFAULT false,
    require_mfa BOOLEAN DEFAULT false,
    session_timeout_minutes INTEGER DEFAULT 480, -- 8 hours
    max_concurrent_sessions INTEGER DEFAULT 5,
    -- Data Protection
    data_export_enabled BOOLEAN DEFAULT true,
    api_data_access_level VARCHAR(20) DEFAULT 'full', -- full, limited, restricted
    pii_masking_enabled BOOLEAN DEFAULT false,
    -- Isolation
    isolation_level VARCHAR(20) DEFAULT 'standard', -- standard, enhanced, strict
    cross_tenant_sharing_enabled BOOLEAN DEFAULT false,
    -- Audit
    audit_all_access BOOLEAN DEFAULT false,
    audit_retention_days INTEGER DEFAULT 90,
    -- Alerting
    alert_on_suspicious_activity BOOLEAN DEFAULT true,
    alert_contacts TEXT[], -- Email addresses
    -- Rate Limits
    api_rate_limit_per_minute INTEGER DEFAULT 1000,
    data_export_rate_limit_per_day INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- DATA ACCESS AUDIT LOG
-- ===========================================

-- Detailed log of data access for compliance
CREATE TABLE IF NOT EXISTS data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    access_type VARCHAR(50) NOT NULL, -- read, write, delete, export, bulk_read
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    resource_count INTEGER DEFAULT 1, -- For bulk operations
    fields_accessed TEXT[], -- Which fields were accessed
    contains_pii BOOLEAN DEFAULT false,
    request_id VARCHAR(100),
    request_path VARCHAR(500),
    ip_address INET,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_access_log_tenant ON data_access_log(tenant_id);
CREATE INDEX idx_data_access_log_user ON data_access_log(user_id);
CREATE INDEX idx_data_access_log_type ON data_access_log(access_type);
CREATE INDEX idx_data_access_log_resource ON data_access_log(resource_type, resource_id);
CREATE INDEX idx_data_access_log_created ON data_access_log(created_at);
CREATE INDEX idx_data_access_log_pii ON data_access_log(contains_pii) WHERE contains_pii = true;

-- ===========================================
-- TENANT ISOLATION METRICS
-- ===========================================

-- Daily metrics for tenant isolation health
CREATE TABLE IF NOT EXISTS tenant_isolation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Violation Counts
    total_isolation_events INTEGER DEFAULT 0,
    blocked_access_attempts INTEGER DEFAULT 0,
    suspicious_activities INTEGER DEFAULT 0,
    -- Access Patterns
    unique_users INTEGER DEFAULT 0,
    unique_ips INTEGER DEFAULT 0,
    total_api_requests INTEGER DEFAULT 0,
    data_exports INTEGER DEFAULT 0,
    bulk_operations INTEGER DEFAULT 0,
    -- PII Access
    pii_access_count INTEGER DEFAULT 0,
    pii_users TEXT[], -- Users who accessed PII
    -- Security Score
    security_score DECIMAL(5, 2) DEFAULT 100.00, -- 0-100
    risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high, critical
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, date)
);

CREATE INDEX idx_tenant_isolation_metrics_tenant_date ON tenant_isolation_metrics(tenant_id, date);
CREATE INDEX idx_tenant_isolation_metrics_risk ON tenant_isolation_metrics(risk_level);

-- ===========================================
-- RESOURCE OWNERSHIP
-- ===========================================

-- Track resource ownership for isolation verification
CREATE TABLE IF NOT EXISTS resource_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    shared_with_tenants UUID[], -- For allowed cross-tenant sharing
    access_level VARCHAR(20) DEFAULT 'owner', -- owner, shared_read, shared_write
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_type, resource_id)
);

CREATE INDEX idx_resource_ownership_tenant ON resource_ownership(tenant_id);
CREATE INDEX idx_resource_ownership_resource ON resource_ownership(resource_type, resource_id);
CREATE INDEX idx_resource_ownership_shared ON resource_ownership USING GIN(shared_with_tenants);

-- ===========================================
-- ISOLATION ALERTS
-- ===========================================

CREATE TABLE IF NOT EXISTS tenant_isolation_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- violation, anomaly, threshold_breach, pattern_detected
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    related_events UUID[], -- IDs from tenant_isolation_events
    metrics JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_isolation_alerts_tenant ON tenant_isolation_alerts(tenant_id);
CREATE INDEX idx_tenant_isolation_alerts_type ON tenant_isolation_alerts(alert_type);
CREATE INDEX idx_tenant_isolation_alerts_severity ON tenant_isolation_alerts(severity);
CREATE INDEX idx_tenant_isolation_alerts_acknowledged ON tenant_isolation_alerts(acknowledged);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to verify tenant ownership of a resource
CREATE OR REPLACE FUNCTION verify_tenant_resource_access(
    p_tenant_id UUID,
    p_resource_type VARCHAR(50),
    p_resource_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_owner_tenant_id UUID;
    v_shared_tenants UUID[];
BEGIN
    -- Check resource_ownership table
    SELECT tenant_id, shared_with_tenants
    INTO v_owner_tenant_id, v_shared_tenants
    FROM resource_ownership
    WHERE resource_type = p_resource_type AND resource_id = p_resource_id;

    -- If no ownership record, try to infer from tenant_id column
    IF v_owner_tenant_id IS NULL THEN
        -- Resource doesn't exist in ownership table
        RETURN false;
    END IF;

    -- Check if tenant owns the resource
    IF v_owner_tenant_id = p_tenant_id THEN
        RETURN true;
    END IF;

    -- Check if resource is shared with this tenant
    IF v_shared_tenants IS NOT NULL AND p_tenant_id = ANY(v_shared_tenants) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to log isolation event
CREATE OR REPLACE FUNCTION log_tenant_isolation_event(
    p_event_type VARCHAR(50),
    p_severity VARCHAR(20),
    p_source_tenant_id UUID,
    p_target_tenant_id UUID,
    p_user_id UUID,
    p_resource_type VARCHAR(50),
    p_resource_id UUID,
    p_request_path VARCHAR(500),
    p_request_method VARCHAR(10),
    p_ip_address INET,
    p_was_blocked BOOLEAN,
    p_block_reason TEXT,
    p_details JSONB
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO tenant_isolation_events (
        event_type, severity, source_tenant_id, target_tenant_id, user_id,
        resource_type, resource_id, request_path, request_method,
        ip_address, was_blocked, block_reason, details
    )
    VALUES (
        p_event_type, p_severity, p_source_tenant_id, p_target_tenant_id, p_user_id,
        p_resource_type, p_resource_id, p_request_path, p_request_method,
        p_ip_address, p_was_blocked, p_block_reason, p_details
    )
    RETURNING id INTO v_event_id;

    -- Update daily metrics
    INSERT INTO tenant_isolation_metrics (tenant_id, date, total_isolation_events, blocked_access_attempts, suspicious_activities)
    VALUES (
        p_source_tenant_id,
        CURRENT_DATE,
        1,
        CASE WHEN p_was_blocked THEN 1 ELSE 0 END,
        CASE WHEN p_severity IN ('high', 'critical') THEN 1 ELSE 0 END
    )
    ON CONFLICT (tenant_id, date) DO UPDATE SET
        total_isolation_events = tenant_isolation_metrics.total_isolation_events + 1,
        blocked_access_attempts = tenant_isolation_metrics.blocked_access_attempts +
            CASE WHEN p_was_blocked THEN 1 ELSE 0 END,
        suspicious_activities = tenant_isolation_metrics.suspicious_activities +
            CASE WHEN p_severity IN ('high', 'critical') THEN 1 ELSE 0 END;

    -- Create alert if severity is high or critical
    IF p_severity IN ('high', 'critical') THEN
        INSERT INTO tenant_isolation_alerts (
            tenant_id, alert_type, severity, title, description, related_events
        )
        VALUES (
            p_source_tenant_id,
            'violation',
            p_severity,
            format('Tenant isolation %s detected', p_event_type),
            p_block_reason,
            ARRAY[v_event_id]
        );
    END IF;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate tenant security score
CREATE OR REPLACE FUNCTION calculate_tenant_security_score(p_tenant_id UUID)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    v_score DECIMAL(5, 2) := 100.00;
    v_violations INTEGER;
    v_policy RECORD;
BEGIN
    -- Get recent violations (last 7 days)
    SELECT COUNT(*) INTO v_violations
    FROM tenant_isolation_events
    WHERE source_tenant_id = p_tenant_id
      AND created_at > NOW() - INTERVAL '7 days'
      AND severity IN ('high', 'critical');

    -- Deduct points for violations
    v_score := v_score - (v_violations * 5);

    -- Get tenant policy
    SELECT * INTO v_policy FROM tenant_security_policies WHERE tenant_id = p_tenant_id;

    -- Bonus points for security measures
    IF v_policy IS NOT NULL THEN
        IF v_policy.enforce_ip_whitelist THEN v_score := v_score + 5; END IF;
        IF v_policy.require_mfa THEN v_score := v_score + 5; END IF;
        IF v_policy.pii_masking_enabled THEN v_score := v_score + 3; END IF;
        IF v_policy.audit_all_access THEN v_score := v_score + 2; END IF;
    END IF;

    -- Ensure score is between 0 and 100
    v_score := GREATEST(0, LEAST(100, v_score));

    -- Update metrics
    UPDATE tenant_isolation_metrics
    SET security_score = v_score,
        risk_level = CASE
            WHEN v_score >= 80 THEN 'low'
            WHEN v_score >= 60 THEN 'medium'
            WHEN v_score >= 40 THEN 'high'
            ELSE 'critical'
        END
    WHERE tenant_id = p_tenant_id AND date = CURRENT_DATE;

    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DEFAULT POLICIES
-- ===========================================

-- Create default policy for existing tenants
INSERT INTO tenant_security_policies (tenant_id)
SELECT id FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_security_policies)
ON CONFLICT DO NOTHING;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
