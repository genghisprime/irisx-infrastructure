/**
 * Migration 007: SMS Management Tables
 * Creates tables for SMS templates, scheduling, and opt-outs
 *
 * Phase 1, Week 3-4
 */

-- SMS Templates Table
CREATE TABLE IF NOT EXISTS sms_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  category VARCHAR(100) DEFAULT 'general',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_sms_templates_tenant ON sms_templates(tenant_id);
CREATE INDEX idx_sms_templates_category ON sms_templates(category);

COMMENT ON TABLE sms_templates IS 'SMS message templates with variable substitution';
COMMENT ON COLUMN sms_templates.variables IS 'Array of variable names found in content';

-- SMS Scheduled Messages Table
CREATE TABLE IF NOT EXISTS sms_scheduled (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  media_urls JSONB DEFAULT '[]'::jsonb,
  template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, cancelled
  sent_at TIMESTAMP,
  message_id VARCHAR(255), -- Twilio SID after sent
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sms_scheduled_tenant ON sms_scheduled(tenant_id);
CREATE INDEX idx_sms_scheduled_status ON sms_scheduled(status);
CREATE INDEX idx_sms_scheduled_for ON sms_scheduled(scheduled_for);
CREATE INDEX idx_sms_scheduled_pending ON sms_scheduled(scheduled_for, status) WHERE status = 'pending';

COMMENT ON TABLE sms_scheduled IS 'Scheduled SMS messages for future delivery';
COMMENT ON INDEX idx_sms_scheduled_pending IS 'Optimized index for scheduler to find pending messages';

-- SMS Opt-Outs Table
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  reason VARCHAR(255) DEFAULT 'user_request',
  opted_out_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, phone_number)
);

CREATE INDEX idx_sms_opt_outs_tenant ON sms_opt_outs(tenant_id);
CREATE INDEX idx_sms_opt_outs_phone ON sms_opt_outs(phone_number);

COMMENT ON TABLE sms_opt_outs IS 'Phone numbers that have opted out of SMS messages';

-- Function to check if number is opted out
CREATE OR REPLACE FUNCTION is_opted_out(p_tenant_id INTEGER, p_phone_number VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM sms_opt_outs
    WHERE tenant_id = p_tenant_id
    AND phone_number = p_phone_number
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_opted_out IS 'Check if a phone number has opted out of SMS';

-- Update trigger for sms_templates
CREATE OR REPLACE FUNCTION update_sms_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sms_template_timestamp
BEFORE UPDATE ON sms_templates
FOR EACH ROW
EXECUTE FUNCTION update_sms_template_timestamp();

-- Update trigger for sms_scheduled
CREATE OR REPLACE FUNCTION update_sms_scheduled_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sms_scheduled_timestamp
BEFORE UPDATE ON sms_scheduled
FOR EACH ROW
EXECUTE FUNCTION update_sms_scheduled_timestamp();

-- Sample SMS templates
INSERT INTO sms_templates (tenant_id, name, content, variables, category) VALUES
  (1, 'Welcome Message', 'Welcome to {{company_name}}! Thank you for signing up, {{customer_name}}.', '["company_name", "customer_name"]'::jsonb, 'onboarding'),
  (1, 'Appointment Reminder', 'Hi {{customer_name}}, this is a reminder of your appointment on {{date}} at {{time}}. Reply CONFIRM to confirm or CANCEL to cancel.', '["customer_name", "date", "time"]'::jsonb, 'appointments'),
  (1, 'Order Confirmation', 'Your order #{{order_number}} has been confirmed. Estimated delivery: {{delivery_date}}. Track your order: {{tracking_link}}', '["order_number", "delivery_date", "tracking_link"]'::jsonb, 'orders'),
  (1, 'Payment Received', 'Payment of ${{amount}} received. Thank you for your business!', '["amount"]'::jsonb, 'billing'),
  (1, 'Account Alert', 'ALERT: {{alert_message}}. If this wasn''t you, please contact us immediately.', '["alert_message"]'::jsonb, 'security')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Add template_id column to sms_messages if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN template_id INTEGER REFERENCES sms_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_messages_template ON sms_messages(template_id) WHERE template_id IS NOT NULL;

-- Grant permissions (adjust as needed for your security model)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sms_templates TO irisx_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sms_scheduled TO irisx_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sms_opt_outs TO irisx_api_user;
-- GRANT USAGE, SELECT ON SEQUENCE sms_templates_id_seq TO irisx_api_user;
-- GRANT USAGE, SELECT ON SEQUENCE sms_scheduled_id_seq TO irisx_api_user;
-- GRANT USAGE, SELECT ON SEQUENCE sms_opt_outs_id_seq TO irisx_api_user;
