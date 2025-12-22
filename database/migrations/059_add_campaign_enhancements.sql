-- Campaign Enhancements
-- Migration: 059_add_campaign_enhancements.sql
-- Recurring campaigns, triggered campaigns, A/B testing, preview dialer, approval workflows

-- =========================================
-- RECURRING CAMPAIGNS (RRULE Support)
-- =========================================

-- Add recurring schedule columns to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS rrule TEXT; -- iCal RRULE format
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recurring_until DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;

-- Recurring campaign runs (each execution of a recurring campaign)
CREATE TABLE IF NOT EXISTS campaign_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    run_number INTEGER NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    -- Statistics for this run
    total_contacts INTEGER DEFAULT 0,
    dialed INTEGER DEFAULT 0,
    connected INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,

    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================
-- TRIGGERED CAMPAIGNS (Event-based)
-- =========================================

CREATE TABLE IF NOT EXISTS campaign_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Trigger type and configuration
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
        'contact_created', 'contact_updated', 'contact_tag_added',
        'form_submitted', 'webhook_received', 'call_completed',
        'sms_received', 'email_opened', 'email_clicked',
        'custom_event'
    )),

    -- Conditions (JSON array of conditions)
    conditions JSONB DEFAULT '[]',
    -- Example: [{"field": "tags", "operator": "contains", "value": "hot-lead"}]

    -- Delay before triggering (optional)
    delay_minutes INTEGER DEFAULT 0,
    delay_until_time TIME, -- Only trigger at specific time

    -- Limit triggers
    max_triggers_per_contact INTEGER DEFAULT 1, -- How many times can same contact trigger
    cooldown_hours INTEGER DEFAULT 24, -- Hours before same contact can trigger again

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track triggered campaign executions
CREATE TABLE IF NOT EXISTS campaign_trigger_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_id UUID NOT NULL REFERENCES campaign_triggers(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,

    contact_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',

    -- Execution status
    status VARCHAR(20) DEFAULT 'triggered' CHECK (status IN ('triggered', 'delayed', 'executed', 'skipped', 'failed')),
    executed_at TIMESTAMP WITH TIME ZONE,
    skip_reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================
-- A/B TEST CAMPAIGNS
-- =========================================

CREATE TABLE IF NOT EXISTS campaign_ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Test configuration
    test_name VARCHAR(255),
    test_type VARCHAR(50) NOT NULL CHECK (test_type IN (
        'message', 'subject', 'call_script', 'send_time', 'caller_id'
    )),

    -- Winning criteria
    winning_metric VARCHAR(50) DEFAULT 'conversion_rate' CHECK (winning_metric IN (
        'open_rate', 'click_rate', 'response_rate', 'conversion_rate', 'connect_rate'
    )),

    -- Test parameters
    sample_size_percent INTEGER DEFAULT 20, -- % of contacts for test
    test_duration_hours INTEGER DEFAULT 24, -- How long to run test before selecting winner
    auto_select_winner BOOLEAN DEFAULT TRUE,

    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'testing', 'winner_selected', 'completed')),
    winning_variant CHAR(1), -- 'A' or 'B'
    winner_selected_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_ab_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ab_test_id UUID NOT NULL REFERENCES campaign_ab_tests(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,

    variant CHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),

    -- Variant content (depends on test_type)
    content JSONB NOT NULL,
    -- For message: {"body": "...", "template_id": "..."}
    -- For subject: {"subject": "..."}
    -- For call_script: {"script": "...", "ivr_flow": "..."}
    -- For send_time: {"time": "09:00", "timezone": "America/New_York"}
    -- For caller_id: {"caller_id": "+1234567890"}

    -- Statistics
    total_sent INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0,
    opened INTEGER DEFAULT 0,
    clicked INTEGER DEFAULT 0,
    responded INTEGER DEFAULT 0,
    converted INTEGER DEFAULT 0,
    connected INTEGER DEFAULT 0, -- For calls

    -- Calculated rates
    open_rate DECIMAL(5,2),
    click_rate DECIMAL(5,2),
    response_rate DECIMAL(5,2),
    conversion_rate DECIMAL(5,2),
    connect_rate DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(ab_test_id, variant)
);

-- Track which variant each contact received
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS ab_variant CHAR(1);

-- =========================================
-- PREVIEW DIALER MODE
-- =========================================

-- Preview queue for agents to review before dialing
CREATE TABLE IF NOT EXISTS preview_dialer_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,

    -- Contact information (denormalized for fast preview)
    phone_number VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    contact_data JSONB DEFAULT '{}',

    -- Agent assignment
    assigned_agent_id UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE,

    -- Preview status
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN (
        'queued', 'previewing', 'approved', 'skipped', 'dialing', 'completed', 'failed'
    )),

    -- Agent decision
    previewed_at TIMESTAMP WITH TIME ZONE,
    preview_duration_seconds INTEGER,
    skip_reason TEXT,
    notes TEXT,

    -- Call result (if dialed)
    call_id UUID,
    call_result VARCHAR(50),

    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(campaign_id, contact_id)
);

-- Add preview mode to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS dialer_mode VARCHAR(20) DEFAULT 'progressive'
    CHECK (dialer_mode IN ('progressive', 'predictive', 'preview', 'power'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS preview_timeout_seconds INTEGER DEFAULT 60;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS preview_required_fields TEXT[]; -- Fields agent must review

-- =========================================
-- CAMPAIGN APPROVAL WORKFLOWS
-- =========================================

CREATE TABLE IF NOT EXISTS campaign_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Approval workflow
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'changes_requested'
    )),

    -- Request details
    requested_by UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_notes TEXT,

    -- Review details
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,

    -- For changes_requested status
    required_changes TEXT,

    -- Approval level (for multi-level approval)
    approval_level INTEGER DEFAULT 1,
    required_level INTEGER DEFAULT 1 -- How many levels needed
);

-- Approval history
CREATE TABLE IF NOT EXISTS campaign_approval_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES campaign_approvals(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    action VARCHAR(30) NOT NULL CHECK (action IN (
        'submitted', 'approved', 'rejected', 'changes_requested',
        'resubmitted', 'escalated', 'auto_approved'
    )),
    performed_by UUID REFERENCES users(id),
    notes TEXT,

    -- Snapshot of campaign at this point
    campaign_snapshot JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add approval requirement to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'));

-- =========================================
-- FREQUENCY CAPS
-- =========================================

CREATE TABLE IF NOT EXISTS contact_frequency_caps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,

    -- Channel-specific caps
    calls_today INTEGER DEFAULT 0,
    calls_this_week INTEGER DEFAULT 0,
    calls_this_month INTEGER DEFAULT 0,
    last_call_at TIMESTAMP WITH TIME ZONE,

    sms_today INTEGER DEFAULT 0,
    sms_this_week INTEGER DEFAULT 0,
    sms_this_month INTEGER DEFAULT 0,
    last_sms_at TIMESTAMP WITH TIME ZONE,

    emails_today INTEGER DEFAULT 0,
    emails_this_week INTEGER DEFAULT 0,
    emails_this_month INTEGER DEFAULT 0,
    last_email_at TIMESTAMP WITH TIME ZONE,

    -- Overall caps
    total_contacts_today INTEGER DEFAULT 0,
    total_contacts_this_week INTEGER DEFAULT 0,

    -- Reset timestamps
    daily_reset_at DATE DEFAULT CURRENT_DATE,
    weekly_reset_at DATE DEFAULT DATE_TRUNC('week', CURRENT_DATE)::DATE,
    monthly_reset_at DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, contact_id)
);

-- Frequency cap settings per tenant
CREATE TABLE IF NOT EXISTS frequency_cap_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

    -- Call limits
    max_calls_per_day INTEGER DEFAULT 3,
    max_calls_per_week INTEGER DEFAULT 7,
    max_calls_per_month INTEGER DEFAULT 15,

    -- SMS limits
    max_sms_per_day INTEGER DEFAULT 2,
    max_sms_per_week INTEGER DEFAULT 5,
    max_sms_per_month INTEGER DEFAULT 10,

    -- Email limits
    max_emails_per_day INTEGER DEFAULT 3,
    max_emails_per_week INTEGER DEFAULT 10,
    max_emails_per_month INTEGER DEFAULT 30,

    -- Overall limits
    max_total_per_day INTEGER DEFAULT 5,
    max_total_per_week INTEGER DEFAULT 15,

    -- Minimum time between contacts (hours)
    min_hours_between_calls INTEGER DEFAULT 4,
    min_hours_between_sms INTEGER DEFAULT 2,
    min_hours_between_emails INTEGER DEFAULT 24,

    -- Enforcement
    enforce_caps BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================
-- INDEXES
-- =========================================

CREATE INDEX IF NOT EXISTS idx_campaign_runs_campaign ON campaign_runs(campaign_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_status ON campaign_runs(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_campaign_triggers_campaign ON campaign_triggers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_triggers_type ON campaign_triggers(trigger_type, is_active);

CREATE INDEX IF NOT EXISTS idx_trigger_logs_trigger ON campaign_trigger_logs(trigger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_contact ON campaign_trigger_logs(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ab_variants_test ON campaign_ab_variants(ab_test_id);

CREATE INDEX IF NOT EXISTS idx_preview_queue_campaign ON preview_dialer_queue(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_preview_queue_agent ON preview_dialer_queue(assigned_agent_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_approvals_campaign ON campaign_approvals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_approvals_status ON campaign_approvals(status, tenant_id);

CREATE INDEX IF NOT EXISTS idx_frequency_caps_contact ON contact_frequency_caps(tenant_id, contact_id);

-- =========================================
-- COMMENTS
-- =========================================

COMMENT ON TABLE campaign_runs IS 'Individual runs of recurring campaigns';
COMMENT ON TABLE campaign_triggers IS 'Event-based campaign triggers';
COMMENT ON TABLE campaign_ab_tests IS 'A/B test configuration for campaigns';
COMMENT ON TABLE campaign_ab_variants IS 'A/B test variant content and statistics';
COMMENT ON TABLE preview_dialer_queue IS 'Queue for preview dialer mode';
COMMENT ON TABLE campaign_approvals IS 'Campaign approval workflow';
COMMENT ON TABLE contact_frequency_caps IS 'Per-contact frequency cap tracking';
COMMENT ON COLUMN campaigns.rrule IS 'iCal RRULE format for recurring schedule';
