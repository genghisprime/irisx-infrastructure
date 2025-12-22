-- Migration: Add Custom Reports Tables
-- Date: 2025-12-16
-- Description: Custom report builder with export and scheduling

-- ======================
-- CUSTOM REPORTS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS custom_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Report Details
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Data Configuration
    data_source VARCHAR(50) NOT NULL,
    -- Options: calls, sms_messages, emails, campaigns, agents, billing
    fields JSONB DEFAULT '[]',
    filters JSONB DEFAULT '[]',
    sort_by VARCHAR(100),
    sort_order VARCHAR(10) DEFAULT 'DESC',
    group_by VARCHAR(100),
    aggregations JSONB DEFAULT '[]',
    date_range JSONB DEFAULT '{}',

    -- Scheduling
    is_scheduled BOOLEAN DEFAULT FALSE,
    schedule_config JSONB DEFAULT '{}',
    -- Config: { frequency: 'daily'|'weekly'|'monthly', time: 'HH:MM', day_of_week: 0-6, day_of_month: 1-31, recipients: [], format: 'xlsx' }
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,

    -- Statistics
    run_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_tenant ON custom_reports(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_reports_source ON custom_reports(data_source);
CREATE INDEX IF NOT EXISTS idx_custom_reports_scheduled ON custom_reports(is_scheduled) WHERE is_scheduled = true AND deleted_at IS NULL;

-- ======================
-- REPORT EXECUTIONS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS report_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Execution Details
    triggered_by VARCHAR(50) DEFAULT 'manual',
    -- Options: manual, scheduled, api
    executed_by UUID, -- user_id if manual

    -- Parameters Used
    date_range JSONB DEFAULT '{}',
    filters_applied JSONB DEFAULT '[]',

    -- Results
    status VARCHAR(50) DEFAULT 'pending',
    -- Options: pending, running, completed, failed
    record_count INTEGER,
    execution_time_ms INTEGER,
    error_message TEXT,

    -- Export Info
    export_format VARCHAR(20),
    export_file_url TEXT,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_executions_report ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_tenant ON report_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status);
CREATE INDEX IF NOT EXISTS idx_report_executions_created ON report_executions(created_at);

-- ======================
-- REPORT TEMPLATES TABLE
-- ======================
CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    -- NULL tenant_id means global template

    -- Template Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    -- Categories: call_analytics, sms_performance, email_metrics, campaign_results, billing_summary, agent_performance

    -- Configuration
    data_source VARCHAR(50) NOT NULL,
    fields JSONB DEFAULT '[]',
    filters JSONB DEFAULT '[]',
    aggregations JSONB DEFAULT '[]',
    recommended_date_range VARCHAR(50),
    -- Options: today, yesterday, last_7_days, last_30_days, this_month, last_month, custom

    -- Visibility
    is_global BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,

    -- Statistics
    usage_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant ON report_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_global ON report_templates(is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_report_templates_category ON report_templates(category);

-- ======================
-- INSERT DEFAULT TEMPLATES
-- ======================
INSERT INTO report_templates (name, description, category, data_source, fields, is_global, is_featured) VALUES
-- Call Analytics Templates
(
    'Daily Call Summary',
    'Overview of all calls for a given day including duration, status, and cost',
    'call_analytics',
    'calls',
    '["id", "direction", "from_number", "to_number", "status", "duration_seconds", "cost", "initiated_at"]',
    true,
    true
),
(
    'Agent Call Performance',
    'Call metrics grouped by agent including total calls and average duration',
    'call_analytics',
    'calls',
    '["agent_id", "status", "duration_seconds", "initiated_at"]',
    true,
    true
),
-- SMS Performance Templates
(
    'SMS Delivery Report',
    'SMS message delivery status and performance metrics',
    'sms_performance',
    'sms_messages',
    '["id", "from_number", "to_number", "status", "segments", "cost", "created_at", "delivered_at"]',
    true,
    true
),
-- Email Metrics Templates
(
    'Email Engagement Report',
    'Email opens, clicks, and bounce rates',
    'email_metrics',
    'emails',
    '["id", "to_email", "subject", "status", "opened_at", "clicked_at", "bounced_at", "created_at"]',
    true,
    true
),
-- Campaign Results Templates
(
    'Campaign Performance Summary',
    'High-level campaign metrics including delivery and engagement rates',
    'campaign_results',
    'campaigns',
    '["id", "name", "type", "status", "total_sent", "total_delivered", "total_opened", "total_clicked", "started_at", "completed_at"]',
    true,
    true
),
-- Billing Templates
(
    'Invoice Summary',
    'List of invoices with amounts and payment status',
    'billing_summary',
    'billing',
    '["id", "invoice_number", "amount", "currency", "status", "due_date", "paid_at"]',
    true,
    false
)
ON CONFLICT DO NOTHING;

-- ======================
-- TRIGGERS
-- ======================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_custom_report_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_custom_report_updated_at
BEFORE UPDATE ON custom_reports
FOR EACH ROW
EXECUTE FUNCTION update_custom_report_timestamp();

-- Increment run count on execution completion
CREATE OR REPLACE FUNCTION update_report_run_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        UPDATE custom_reports
        SET run_count = run_count + 1,
            last_run_at = NEW.completed_at
        WHERE id = NEW.report_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_report_run_stats
AFTER UPDATE ON report_executions
FOR EACH ROW
EXECUTE FUNCTION update_report_run_stats();

-- ======================
-- COMMENTS
-- ======================
COMMENT ON TABLE custom_reports IS 'User-defined custom reports with flexible queries and scheduling';
COMMENT ON TABLE report_executions IS 'History of report executions for audit and debugging';
COMMENT ON TABLE report_templates IS 'Pre-built report templates (global and tenant-specific)';
COMMENT ON COLUMN custom_reports.data_source IS 'The database table to query: calls, sms_messages, emails, campaigns, agents, billing';
COMMENT ON COLUMN custom_reports.schedule_config IS 'JSON config for scheduled reports: { frequency, time, day_of_week, day_of_month, recipients, format }';
