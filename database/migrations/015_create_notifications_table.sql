-- Migration 015: Notifications System
-- Manages system notifications, alerts, and user preferences

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Recipients
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

  -- Notification details
  notification_type VARCHAR(50) NOT NULL,  -- spend_alert, system_alert, payment_failed, call_failed, etc.
  severity VARCHAR(20) DEFAULT 'info',  -- info, warning, error, critical
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Delivery channels
  channels JSONB DEFAULT '["in_app"]'::jsonb,  -- in_app, email, sms, webhook

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, sent, failed, read
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB,  -- Additional context data
  action_url TEXT,  -- Link for user action

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications(severity);

-- =====================================================
-- NOTIFICATION PREFERENCES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id BIGSERIAL PRIMARY KEY,

  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

  -- Preference per notification type
  notification_type VARCHAR(50) NOT NULL,

  -- Enabled channels
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  webhook_enabled BOOLEAN DEFAULT FALSE,

  -- Quiet hours (optional)
  quiet_hours_start TIME,
  quiet_hours_end TIME,

  -- Created/updated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_id ON notification_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- =====================================================
-- NOTIFICATION TEMPLATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGSERIAL PRIMARY KEY,

  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system template

  -- Template details
  template_name VARCHAR(100) UNIQUE NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,  -- email, sms, in_app, webhook

  -- Content
  subject_template TEXT,  -- For email
  body_template TEXT NOT NULL,

  -- Variables (for documentation)
  available_variables JSONB,  -- e.g., ["{{tenant_name}}", "{{amount}}"]

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_id ON notification_templates(tenant_id);

-- =====================================================
-- NOTIFICATION DELIVERY LOG
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id BIGSERIAL PRIMARY KEY,

  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,

  -- Delivery details
  channel VARCHAR(20) NOT NULL,  -- email, sms, webhook
  recipient VARCHAR(255) NOT NULL,  -- email address, phone number, webhook URL

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, sent, delivered, failed, bounced
  provider VARCHAR(50),  -- elastic_email, twilio, etc.
  provider_message_id VARCHAR(255),

  -- Response
  response_code INTEGER,
  response_message TEXT,
  error_message TEXT,

  -- Timing
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification_id ON notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_channel ON notification_delivery_log(channel);

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- =====================================================
-- INSERT DEFAULT NOTIFICATION TEMPLATES
-- =====================================================

-- Spend limit alert (80%)
INSERT INTO notification_templates (template_name, notification_type, channel, subject_template, body_template, available_variables) VALUES
(
  'spend_alert_80_email',
  'spend_alert_80',
  'email',
  'Usage Alert: {{tenant_name}} - 80% of spend limit reached',
  'Hello {{tenant_name}},

Your account has reached 80% of its monthly spend limit.

Current spend: ${{current_spend}}
Monthly limit: ${{monthly_limit}}
Remaining: ${{remaining}}

Please review your usage at: {{dashboard_url}}

Best regards,
IRIS Team',
  '["{{tenant_name}}", "{{current_spend}}", "{{monthly_limit}}", "{{remaining}}", "{{dashboard_url}}"]'::jsonb
),
(
  'spend_alert_100_email',
  'spend_alert_100',
  'email',
  'URGENT: {{tenant_name}} - Spend limit reached',
  'Hello {{tenant_name}},

Your account has reached 100% of its monthly spend limit.

Current spend: ${{current_spend}}
Monthly limit: ${{monthly_limit}}

Your account may be temporarily suspended. Please add funds or increase your limit at: {{dashboard_url}}

Best regards,
IRIS Team',
  '["{{tenant_name}}", "{{current_spend}}", "{{monthly_limit}}", "{{dashboard_url}}"]'::jsonb
),
(
  'payment_failed_email',
  'payment_failed',
  'email',
  'Payment Failed: {{tenant_name}}',
  'Hello {{tenant_name}},

We were unable to process your payment of ${{amount}} for invoice #{{invoice_number}}.

Reason: {{failure_reason}}

Please update your payment method at: {{billing_url}}

Best regards,
IRIS Team',
  '["{{tenant_name}}", "{{amount}}", "{{invoice_number}}", "{{failure_reason}}", "{{billing_url}}"]'::jsonb
),
(
  'call_recording_ready_email',
  'call_recording_ready',
  'email',
  'Call Recording Ready: {{call_id}}',
  'Your call recording is now available for download.

Call ID: {{call_id}}
Duration: {{duration}} seconds
Download: {{download_url}}

This link will expire in {{expiration_hours}} hours.

Best regards,
IRIS Team',
  '["{{call_id}}", "{{duration}}", "{{download_url}}", "{{expiration_hours}}"]'::jsonb
);

-- =====================================================
-- INSERT DEFAULT NOTIFICATION PREFERENCES FOR TENANTS
-- =====================================================
INSERT INTO notification_preferences (tenant_id, user_id, notification_type, email_enabled, sms_enabled, in_app_enabled)
SELECT
  t.id,
  NULL,
  type.notification_type,
  TRUE,
  FALSE,
  TRUE
FROM tenants t
CROSS JOIN (
  VALUES
    ('spend_alert_80'),
    ('spend_alert_100'),
    ('payment_failed'),
    ('payment_success'),
    ('call_failed'),
    ('campaign_completed'),
    ('system_maintenance')
) AS type(notification_type)
WHERE t.id NOT IN (SELECT tenant_id FROM notification_preferences WHERE user_id IS NULL)
ON CONFLICT (tenant_id, user_id, notification_type) DO NOTHING;

COMMIT;
