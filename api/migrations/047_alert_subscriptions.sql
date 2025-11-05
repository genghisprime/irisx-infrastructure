-- Alert Subscriptions System
-- Manages email and SMS subscriptions to AWS SNS alerts
-- Allows admins to add/remove team members from production alerts

CREATE TABLE alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact information
  subscription_type VARCHAR(10) NOT NULL CHECK (subscription_type IN ('email', 'sms')),
  contact_value VARCHAR(255) NOT NULL, -- email address or phone number

  -- AWS SNS integration
  sns_subscription_arn VARCHAR(500), -- ARN returned by SNS subscribe
  sns_topic_arn VARCHAR(500) DEFAULT 'arn:aws:sns:us-east-1:895549500657:IRISX-Production-Alerts',

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'active', 'unsubscribed', 'failed')),

  -- Audit trail
  added_by INT REFERENCES admin_users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  last_notification_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,

  UNIQUE (subscription_type, contact_value)
);

-- Alert history table (tracks when alarms fire)
CREATE TABLE alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert details
  alarm_name VARCHAR(255) NOT NULL,
  alarm_state VARCHAR(50) NOT NULL, -- OK, ALARM, INSUFFICIENT_DATA
  alarm_reason TEXT,
  metric_name VARCHAR(255),
  metric_namespace VARCHAR(255),
  threshold DECIMAL(10, 2),

  -- Timestamp
  state_changed_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  -- SNS message details
  sns_message_id VARCHAR(255),
  sns_subject TEXT,
  sns_message TEXT,

  -- Recipients
  notification_count INT DEFAULT 0 -- how many people were notified
);

-- Indexes
CREATE INDEX idx_alert_subscriptions_type ON alert_subscriptions(subscription_type);
CREATE INDEX idx_alert_subscriptions_status ON alert_subscriptions(status);
CREATE INDEX idx_alert_subscriptions_added_by ON alert_subscriptions(added_by);
CREATE INDEX idx_alert_history_alarm_name ON alert_history(alarm_name);
CREATE INDEX idx_alert_history_state_changed_at ON alert_history(state_changed_at DESC);

-- Comments
COMMENT ON TABLE alert_subscriptions IS 'Tracks email and SMS subscriptions to production alerts via AWS SNS';
COMMENT ON TABLE alert_history IS 'Historical record of all CloudWatch alarms that fired';
COMMENT ON COLUMN alert_subscriptions.subscription_type IS 'email or sms';
COMMENT ON COLUMN alert_subscriptions.contact_value IS 'Email address (for email) or E.164 phone number (for SMS)';
COMMENT ON COLUMN alert_subscriptions.sns_subscription_arn IS 'AWS SNS subscription ARN (null until confirmed)';
COMMENT ON COLUMN alert_subscriptions.status IS 'pending_confirmation (waiting for user to confirm), active (receiving alerts), unsubscribed (removed), failed (delivery failed)';
