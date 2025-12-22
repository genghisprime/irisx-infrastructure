-- Migration: 070_incident_response_system.sql
-- Description: Incident response automation tables
-- Date: 2025-12-16

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(30) NOT NULL DEFAULT 'created',
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_id UUID,
    tenant_id UUID REFERENCES tenants(id),
    affected_services JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES admin_users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incident timeline for tracking all events
CREATE TABLE IF NOT EXISTS incident_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    actor VARCHAR(50) DEFAULT 'system',
    actor_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Escalation policies
CREATE TABLE IF NOT EXISTS escalation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    severity_filter VARCHAR(20),
    service_filters JSONB DEFAULT '[]'::jsonb,
    immediate_actions JSONB DEFAULT '[]'::jsonb,
    escalation_steps JSONB DEFAULT '[]'::jsonb,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Runbooks for automated remediation
CREATE TABLE IF NOT EXISTS runbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    trigger_conditions JSONB DEFAULT '{}'::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Runbook execution history
CREATE TABLE IF NOT EXISTS runbook_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    runbook_id UUID NOT NULL REFERENCES runbooks(id),
    incident_id UUID REFERENCES incidents(id),
    results JSONB DEFAULT '[]'::jsonb,
    executed_by UUID,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- On-call schedules
CREATE TABLE IF NOT EXISTS on_call_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    team_id UUID,
    schedule_type VARCHAR(30) DEFAULT 'rotation', -- rotation, static, follow_the_sun
    rotation_interval_hours INTEGER DEFAULT 168, -- 1 week default
    members JSONB DEFAULT '[]'::jsonb,
    overrides JSONB DEFAULT '[]'::jsonb,
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- On-call assignments (current and scheduled)
CREATE TABLE IF NOT EXISTS on_call_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES on_call_schedules(id),
    user_id UUID NOT NULL,
    user_email VARCHAR(255),
    user_phone VARCHAR(50),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_override BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incident post-mortems
CREATE TABLE IF NOT EXISTS incident_postmortems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    summary TEXT,
    timeline_events JSONB DEFAULT '[]'::jsonb,
    root_cause TEXT,
    contributing_factors JSONB DEFAULT '[]'::jsonb,
    action_items JSONB DEFAULT '[]'::jsonb,
    lessons_learned TEXT,
    preventive_measures TEXT,
    owner_id UUID,
    status VARCHAR(30) DEFAULT 'draft', -- draft, in_review, published
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source, source_id);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident ON incident_timeline(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_timeline_created ON incident_timeline(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_escalation_policies_active ON escalation_policies(is_active, is_default);

CREATE INDEX IF NOT EXISTS idx_runbook_executions_runbook ON runbook_executions(runbook_id);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_incident ON runbook_executions(incident_id);

CREATE INDEX IF NOT EXISTS idx_on_call_assignments_schedule ON on_call_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_on_call_assignments_time ON on_call_assignments(start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_incident_postmortems_incident ON incident_postmortems(incident_id);

-- Insert default escalation policy
INSERT INTO escalation_policies (name, description, severity_filter, is_default, is_active, immediate_actions, escalation_steps)
VALUES (
    'Default Escalation Policy',
    'Default policy for all incidents',
    NULL,
    true,
    true,
    '[
        {"type": "notify_slack", "config": {}}
    ]'::jsonb,
    '[
        {
            "name": "First Response",
            "delay_minutes": 5,
            "actions": [{"type": "notify_email", "config": {"recipients": []}}]
        },
        {
            "name": "Second Escalation",
            "delay_minutes": 15,
            "actions": [{"type": "notify_pagerduty", "config": {}}]
        },
        {
            "name": "Management Escalation",
            "delay_minutes": 30,
            "actions": [{"type": "notify_sms", "config": {"phone_numbers": []}}]
        }
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Insert critical severity policy
INSERT INTO escalation_policies (name, description, severity_filter, is_default, is_active, immediate_actions, escalation_steps)
VALUES (
    'Critical Incident Policy',
    'Immediate escalation for critical incidents',
    'critical',
    false,
    true,
    '[
        {"type": "notify_slack", "config": {}},
        {"type": "notify_pagerduty", "config": {}},
        {"type": "notify_sms", "config": {"phone_numbers": []}}
    ]'::jsonb,
    '[
        {
            "name": "Immediate Auto-Remediation",
            "delay_minutes": 0,
            "actions": [{"type": "auto_remediate", "config": {}}]
        },
        {
            "name": "Leadership Notification",
            "delay_minutes": 5,
            "actions": [{"type": "notify_email", "config": {"recipients": []}}]
        }
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- Insert sample runbook
INSERT INTO runbooks (name, description, trigger_conditions, is_active, steps)
VALUES (
    'High API Error Rate Recovery',
    'Automated recovery steps for high API error rates',
    '{"metric": "api_error_rate", "threshold": 5}'::jsonb,
    true,
    '[
        {
            "name": "Check API Health",
            "type": "check_service",
            "config": {"url": "http://localhost:3000/health", "timeout": 5000},
            "stop_on_failure": false
        },
        {
            "name": "Clear Redis Cache",
            "type": "http_request",
            "config": {"url": "http://localhost:3000/admin/cache/clear", "method": "POST"},
            "stop_on_failure": false
        },
        {
            "name": "Wait for Recovery",
            "type": "delay",
            "config": {"seconds": 30},
            "stop_on_failure": false
        },
        {
            "name": "Verify Health",
            "type": "check_service",
            "config": {"url": "http://localhost:3000/health", "timeout": 5000},
            "stop_on_failure": true
        }
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE incidents IS 'Stores all platform incidents with severity, status, and metadata';
COMMENT ON TABLE incident_timeline IS 'Tracks all events and actions taken during incident lifecycle';
COMMENT ON TABLE escalation_policies IS 'Defines escalation rules and notification chains';
COMMENT ON TABLE runbooks IS 'Automated runbooks for incident remediation';
COMMENT ON TABLE on_call_schedules IS 'On-call rotation schedules for incident response';
COMMENT ON TABLE incident_postmortems IS 'Post-incident review documentation';
