-- Migration: 008_email_automation.sql
-- Description: Email automation rules and execution tracking
-- Created: October 30, 2025
-- Phase: Week 13-14 Phase 5 - Email Automation Engine

-- =============================================================================
-- Email Automation Rules Table
-- =============================================================================
-- Stores automation rules that trigger emails based on events, time, or behavior

CREATE TABLE email_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Trigger configuration
  trigger_type VARCHAR(50) NOT NULL, -- 'event', 'time', 'behavior'
  trigger_config JSONB NOT NULL,
  -- Examples:
  -- event: {"event_name": "user.created", "filters": {"plan": "premium"}}
  -- time: {"delay_value": 7, "delay_unit": "days", "from_event": "user.created"}
  -- behavior: {"event_name": "email.opened", "email_id": "xxx", "action": "not_clicked", "within_hours": 24}

  -- Conditions (optional additional filters)
  conditions JSONB,
  -- Example: {"user_plan": "premium", "user_country": "US"}

  -- Actions to perform when triggered
  actions JSONB NOT NULL,
  -- Example: [{"type": "send_email", "template_id": "xxx"}, {"type": "webhook", "url": "https://..."}]

  -- Status and priority
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 0, -- Higher priority rules execute first

  -- Rate limiting
  max_executions_per_contact_per_day INT DEFAULT NULL, -- NULL = unlimited
  cooldown_hours INT DEFAULT NULL, -- Minimum hours between executions for same contact

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Statistics
  total_executions INT DEFAULT 0,
  successful_executions INT DEFAULT 0,
  failed_executions INT DEFAULT 0,
  last_executed_at TIMESTAMP
);

-- Index for finding active rules by trigger type
CREATE INDEX idx_email_automation_rules_tenant_trigger
  ON email_automation_rules(tenant_id, trigger_type, enabled)
  WHERE enabled = true;

-- Index for priority ordering
CREATE INDEX idx_email_automation_rules_priority
  ON email_automation_rules(tenant_id, priority DESC, created_at);

-- =============================================================================
-- Email Automation Executions Table
-- =============================================================================
-- Audit log for automation rule executions

CREATE TABLE email_automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES email_automation_rules(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Contact information
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  contact_email VARCHAR(255) NOT NULL,

  -- Trigger information
  triggered_by_event VARCHAR(100), -- Event name that triggered this
  trigger_data JSONB, -- Data associated with the trigger

  -- Execution details
  triggered_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'skipped'

  -- Results
  actions_performed JSONB, -- Array of actions and their results
  email_ids UUID[], -- IDs of emails sent by this execution
  webhook_responses JSONB, -- Responses from webhook calls

  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  retry_count INT DEFAULT 0,

  -- Metadata
  execution_time_ms INT, -- How long it took to execute
  skipped_reason TEXT -- Why it was skipped (rate limit, cooldown, etc.)
);

-- Index for finding executions by rule
CREATE INDEX idx_email_automation_executions_rule
  ON email_automation_executions(rule_id, triggered_at DESC);

-- Index for finding recent executions by contact (for rate limiting)
CREATE INDEX idx_email_automation_executions_contact
  ON email_automation_executions(rule_id, contact_id, triggered_at DESC)
  WHERE status IN ('completed', 'running');

-- Index for monitoring failed executions
CREATE INDEX idx_email_automation_executions_failed
  ON email_automation_executions(tenant_id, status, triggered_at DESC)
  WHERE status = 'failed';

-- =============================================================================
-- Email Automation Statistics View
-- =============================================================================
-- Aggregated statistics per automation rule

CREATE OR REPLACE VIEW email_automation_stats AS
SELECT
  r.id AS rule_id,
  r.tenant_id,
  r.name AS rule_name,
  r.enabled,
  r.trigger_type,

  -- Execution counts
  COUNT(e.id) AS total_executions,
  COUNT(CASE WHEN e.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN e.status = 'failed' THEN 1 END) AS failed_count,
  COUNT(CASE WHEN e.status = 'skipped' THEN 1 END) AS skipped_count,

  -- Success rate
  ROUND(
    100.0 * COUNT(CASE WHEN e.status = 'completed' THEN 1 END) /
    NULLIF(COUNT(CASE WHEN e.status IN ('completed', 'failed') THEN 1 END), 0),
    2
  ) AS success_rate_percent,

  -- Timing
  AVG(e.execution_time_ms) AS avg_execution_time_ms,
  MAX(e.triggered_at) AS last_triggered_at,

  -- Emails sent
  SUM(COALESCE(array_length(e.email_ids, 1), 0)) AS total_emails_sent,

  -- Recent activity (last 24 hours)
  COUNT(CASE WHEN e.triggered_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS executions_last_24h,

  -- Error analysis
  COUNT(CASE WHEN e.retry_count > 0 THEN 1 END) AS executions_with_retries

FROM email_automation_rules r
LEFT JOIN email_automation_executions e ON r.id = e.rule_id
GROUP BY r.id, r.tenant_id, r.name, r.enabled, r.trigger_type;

-- =============================================================================
-- Trigger Function: Update automation rule statistics
-- =============================================================================

CREATE OR REPLACE FUNCTION update_automation_rule_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the rule's statistics when an execution completes or fails
  IF NEW.status IN ('completed', 'failed') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'failed')) THEN
    UPDATE email_automation_rules
    SET
      total_executions = total_executions + 1,
      successful_executions = CASE
        WHEN NEW.status = 'completed' THEN successful_executions + 1
        ELSE successful_executions
      END,
      failed_executions = CASE
        WHEN NEW.status = 'failed' THEN failed_executions + 1
        ELSE failed_executions
      END,
      last_executed_at = NEW.completed_at,
      updated_at = NOW()
    WHERE id = NEW.rule_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update rule stats
CREATE TRIGGER trigger_update_automation_rule_stats
  AFTER INSERT OR UPDATE OF status ON email_automation_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rule_stats();

-- =============================================================================
-- Helper Function: Check rate limit for contact
-- =============================================================================

CREATE OR REPLACE FUNCTION check_automation_rate_limit(
  p_rule_id UUID,
  p_contact_id UUID,
  p_max_per_day INT,
  p_cooldown_hours INT
)
RETURNS TABLE(
  allowed BOOLEAN,
  reason TEXT,
  executions_today INT,
  last_execution_at TIMESTAMP
) AS $$
DECLARE
  v_executions_today INT;
  v_last_execution TIMESTAMP;
  v_hours_since_last NUMERIC;
BEGIN
  -- Count executions today
  SELECT COUNT(*), MAX(triggered_at)
  INTO v_executions_today, v_last_execution
  FROM email_automation_executions
  WHERE rule_id = p_rule_id
    AND contact_id = p_contact_id
    AND triggered_at > NOW() - INTERVAL '24 hours'
    AND status IN ('completed', 'running');

  -- Check daily limit
  IF p_max_per_day IS NOT NULL AND v_executions_today >= p_max_per_day THEN
    RETURN QUERY SELECT
      false,
      'Daily execution limit reached'::TEXT,
      v_executions_today,
      v_last_execution;
    RETURN;
  END IF;

  -- Check cooldown
  IF p_cooldown_hours IS NOT NULL AND v_last_execution IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_execution)) / 3600;

    IF v_hours_since_last < p_cooldown_hours THEN
      RETURN QUERY SELECT
        false,
        format('Cooldown period active (%s hours remaining)',
               ROUND((p_cooldown_hours - v_hours_since_last)::NUMERIC, 1))::TEXT,
        v_executions_today,
        v_last_execution;
      RETURN;
    END IF;
  END IF;

  -- Allowed to execute
  RETURN QUERY SELECT
    true,
    'Allowed'::TEXT,
    v_executions_today,
    v_last_execution;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper Function: Get automation rules by trigger type
-- =============================================================================

CREATE OR REPLACE FUNCTION get_automation_rules_by_trigger(
  p_tenant_id UUID,
  p_trigger_type VARCHAR(50),
  p_event_name VARCHAR(100) DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  name VARCHAR(255),
  trigger_config JSONB,
  conditions JSONB,
  actions JSONB,
  priority INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.trigger_config,
    r.conditions,
    r.actions,
    r.priority
  FROM email_automation_rules r
  WHERE r.tenant_id = p_tenant_id
    AND r.trigger_type = p_trigger_type
    AND r.enabled = true
    AND (
      p_event_name IS NULL
      OR r.trigger_config->>'event_name' = p_event_name
    )
  ORDER BY r.priority DESC, r.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Sample automation rules (for testing)
-- =============================================================================

-- Example 1: Welcome email when user is created
INSERT INTO email_automation_rules (
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  actions,
  priority
) VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Welcome Email - New User',
  'Send welcome email immediately when a new user signs up',
  'event',
  '{"event_name": "user.created"}',
  '[{"type": "send_email", "template_slug": "welcome-email", "delay_minutes": 0}]',
  10
);

-- Example 2: Follow-up email 7 days after signup
INSERT INTO email_automation_rules (
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  actions,
  max_executions_per_contact_per_day
) VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Check-in Email - 7 Days',
  'Send check-in email 7 days after user signup',
  'time',
  '{"delay_value": 7, "delay_unit": "days", "from_event": "user.created"}',
  '[{"type": "send_email", "template_slug": "7-day-checkin"}]',
  1
);

-- Example 3: Re-engagement for opened but not clicked
INSERT INTO email_automation_rules (
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  actions,
  cooldown_hours
) VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Re-engagement - Opened Not Clicked',
  'Send reminder if user opened email but did not click any links within 24 hours',
  'behavior',
  '{"event_name": "email.opened", "condition": "not_clicked", "within_hours": 24}',
  '[{"type": "send_email", "template_slug": "reminder-email"}]',
  48
);

-- =============================================================================
-- Comments and Notes
-- =============================================================================

COMMENT ON TABLE email_automation_rules IS 'Automation rules for trigger-based email campaigns';
COMMENT ON TABLE email_automation_executions IS 'Audit log of automation rule executions';
COMMENT ON VIEW email_automation_stats IS 'Aggregated statistics for automation rules';

COMMENT ON COLUMN email_automation_rules.trigger_type IS 'Type of trigger: event (immediate), time (delayed), behavior (conditional)';
COMMENT ON COLUMN email_automation_rules.trigger_config IS 'JSON configuration for the trigger (event name, delay, conditions)';
COMMENT ON COLUMN email_automation_rules.actions IS 'Array of actions to perform: send_email, webhook, update_contact';
COMMENT ON COLUMN email_automation_rules.max_executions_per_contact_per_day IS 'Rate limit: max executions per contact per day';
COMMENT ON COLUMN email_automation_rules.cooldown_hours IS 'Rate limit: minimum hours between executions for same contact';

COMMENT ON COLUMN email_automation_executions.status IS 'Execution status: pending, running, completed, failed, skipped';
COMMENT ON COLUMN email_automation_executions.skipped_reason IS 'Reason for skipping (rate limit, cooldown, condition not met)';

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Tables: 2
-- Views: 1
-- Functions: 3
-- Triggers: 1
-- Sample data: 3 automation rules
