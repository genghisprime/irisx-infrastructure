-- Migration: Add Drip Campaign Tables
-- Date: 2025-12-16
-- Description: Multi-step automated campaign sequences with conditional branching

-- ======================
-- DRIP CAMPAIGNS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS drip_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Campaign Details
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Trigger Configuration
    trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
    -- Options: manual, event, signup, tag_added, list_added, purchase, form_submit
    trigger_config JSONB DEFAULT '{}',

    -- Target Audience
    contact_list_ids UUID[] DEFAULT '{}',
    filter_criteria JSONB DEFAULT '{}',

    -- Goal Tracking
    goal_type VARCHAR(50),
    -- Options: conversion, reply, click, open, purchase, tag_added
    goal_config JSONB DEFAULT '{}',

    -- Settings
    timezone VARCHAR(100) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'draft',
    -- Status: draft, active, paused, completed, archived

    -- Statistics
    total_enrolled INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    total_converted INTEGER DEFAULT 0,

    -- Timestamps
    activated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_drip_campaigns_tenant ON drip_campaigns(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_status ON drip_campaigns(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_active ON drip_campaigns(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_trigger ON drip_campaigns(trigger_type);

-- ======================
-- DRIP CAMPAIGN STEPS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS drip_campaign_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drip_campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,

    -- Step Order
    step_order INTEGER NOT NULL DEFAULT 1,

    -- Step Type
    step_type VARCHAR(50) NOT NULL DEFAULT 'message',
    -- Options: message, wait, condition, goal_check, branch

    -- Channel (for message steps)
    channel VARCHAR(50) DEFAULT 'email',
    -- Options: email, sms, voice

    -- Delay before this step executes
    delay_amount INTEGER DEFAULT 0,
    delay_unit VARCHAR(20) DEFAULT 'days',
    -- Options: minutes, hours, days, weeks

    -- Email Content
    subject VARCHAR(500),
    message_template TEXT,

    -- SMS/Voice Content
    from_number VARCHAR(50),
    from_email VARCHAR(255),
    from_name VARCHAR(255),
    voice_script TEXT,
    voice_provider VARCHAR(50),
    voice_id VARCHAR(100),

    -- Condition Configuration (for condition steps)
    condition_type VARCHAR(50),
    -- Options: opened, clicked, replied, not_opened, not_clicked, tag_has, tag_missing
    condition_config JSONB DEFAULT '{}',

    -- A/B Testing
    ab_test_enabled BOOLEAN DEFAULT FALSE,
    ab_variants JSONB DEFAULT '[]',
    -- Format: [{ "name": "A", "weight": 50, "subject": "...", "message_template": "..." }, ...]

    -- Statistics
    execution_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_steps_campaign ON drip_campaign_steps(drip_campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_steps_order ON drip_campaign_steps(drip_campaign_id, step_order);

-- ======================
-- DRIP CAMPAIGN ENROLLMENTS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS drip_campaign_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drip_campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Current Position
    current_step_id UUID REFERENCES drip_campaign_steps(id) ON DELETE SET NULL,
    steps_completed INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(50) DEFAULT 'active',
    -- Options: active, paused, completed, removed, failed

    -- Enrollment Details
    enrollment_source VARCHAR(100) DEFAULT 'manual',
    -- Options: manual, list_import, trigger, api, form
    trigger_data JSONB DEFAULT '{}',

    -- Scheduling
    next_step_at TIMESTAMP WITH TIME ZONE,

    -- Completion
    completed_at TIMESTAMP WITH TIME ZONE,
    completion_reason VARCHAR(100),
    -- Reasons: completed, goal_achieved, unsubscribed, removed, contact_deleted

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_enrollments_campaign ON drip_campaign_enrollments(drip_campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_contact ON drip_campaign_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_tenant ON drip_campaign_enrollments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_status ON drip_campaign_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_next_step ON drip_campaign_enrollments(next_step_at)
    WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_drip_enrollments_unique_active
    ON drip_campaign_enrollments(drip_campaign_id, contact_id) WHERE status = 'active';

-- ======================
-- DRIP CAMPAIGN STEP EXECUTIONS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS drip_campaign_step_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES drip_campaign_enrollments(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES drip_campaign_steps(id) ON DELETE CASCADE,

    -- Execution Details
    channel VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    message_content TEXT,
    subject VARCHAR(500),

    -- A/B Test Variant Used
    ab_variant_name VARCHAR(100),

    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    -- Options: pending, sent, delivered, failed, bounced

    -- Tracking
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,

    -- Error Details
    error_message TEXT,

    -- External IDs
    email_id UUID,
    sms_id UUID,
    call_id UUID,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_drip_executions_enrollment ON drip_campaign_step_executions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_drip_executions_step ON drip_campaign_step_executions(step_id);
CREATE INDEX IF NOT EXISTS idx_drip_executions_status ON drip_campaign_step_executions(status);
CREATE INDEX IF NOT EXISTS idx_drip_executions_channel ON drip_campaign_step_executions(channel);

-- ======================
-- TRIGGERS
-- ======================

-- Update drip campaign timestamp
CREATE OR REPLACE FUNCTION update_drip_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drip_campaign_updated_at
BEFORE UPDATE ON drip_campaigns
FOR EACH ROW
EXECUTE FUNCTION update_drip_campaign_timestamp();

-- Update enrollment statistics on drip campaigns
CREATE OR REPLACE FUNCTION update_drip_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- On new enrollment
    IF TG_OP = 'INSERT' THEN
        UPDATE drip_campaigns SET total_enrolled = total_enrolled + 1 WHERE id = NEW.drip_campaign_id;
    END IF;

    -- On status change to completed
    IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE drip_campaigns SET total_completed = total_completed + 1 WHERE id = NEW.drip_campaign_id;
    END IF;

    -- On goal achieved
    IF TG_OP = 'UPDATE' AND NEW.completion_reason = 'goal_achieved' AND OLD.completion_reason IS DISTINCT FROM 'goal_achieved' THEN
        UPDATE drip_campaigns SET total_converted = total_converted + 1 WHERE id = NEW.drip_campaign_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drip_enrollment_stats
AFTER INSERT OR UPDATE ON drip_campaign_enrollments
FOR EACH ROW
EXECUTE FUNCTION update_drip_campaign_stats();

-- ======================
-- COMMENTS
-- ======================
COMMENT ON TABLE drip_campaigns IS 'Multi-step automated campaign sequences';
COMMENT ON TABLE drip_campaign_steps IS 'Individual steps within a drip campaign';
COMMENT ON TABLE drip_campaign_enrollments IS 'Contacts enrolled in drip campaigns';
COMMENT ON TABLE drip_campaign_step_executions IS 'Record of each step execution for tracking';
COMMENT ON COLUMN drip_campaigns.trigger_type IS 'How contacts get enrolled: manual, event, signup, tag_added, list_added, purchase, form_submit';
COMMENT ON COLUMN drip_campaign_steps.step_type IS 'Type of step: message (send communication), wait (delay), condition (branch), goal_check';
COMMENT ON COLUMN drip_campaign_enrollments.completion_reason IS 'Why enrollment ended: completed (all steps done), goal_achieved, unsubscribed, removed, contact_deleted';
