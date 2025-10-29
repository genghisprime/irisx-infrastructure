-- Migration 012: Billing & Rating Engine
-- Creates tables for cost calculation, invoicing, and payment management

-- Rate tables for call cost calculation
CREATE TABLE IF NOT EXISTS rate_tables (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Destination prefix (E.164 format)
  prefix VARCHAR(20) NOT NULL,
  destination_name VARCHAR(255) NOT NULL, -- "United States", "UK Mobile", etc.

  -- Pricing
  cost_per_minute DECIMAL(10, 6) NOT NULL, -- Cost in USD per minute
  connection_fee DECIMAL(10, 6) DEFAULT 0, -- One-time connection fee
  minimum_duration INTEGER DEFAULT 0, -- Minimum billable seconds
  billing_increment INTEGER DEFAULT 1, -- Round up to nearest N seconds (1, 6, 60)

  -- Provider info
  carrier_name VARCHAR(100), -- "Twilio", "Telnyx", etc.
  carrier_priority INTEGER DEFAULT 100, -- For LCR (lower = preferred)

  -- Validity
  effective_date TIMESTAMPTZ DEFAULT NOW(),
  expiration_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_tables_prefix ON rate_tables(prefix) WHERE is_active = TRUE;
CREATE INDEX idx_rate_tables_effective ON rate_tables(effective_date, expiration_date) WHERE is_active = TRUE;

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Invoice details
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- "INV-2025-01-00001"
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,

  -- Line items (summary)
  subtotal_calls DECIMAL(12, 2) DEFAULT 0, -- Total call costs
  subtotal_sms DECIMAL(12, 2) DEFAULT 0, -- Total SMS costs
  subtotal_email DECIMAL(12, 2) DEFAULT 0, -- Total email costs
  subscription_fee DECIMAL(12, 2) DEFAULT 0, -- Monthly platform fee

  -- Totals
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax_rate DECIMAL(5, 4) DEFAULT 0, -- 0.0825 = 8.25%
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,

  -- Payment
  status VARCHAR(50) DEFAULT 'draft', -- draft, sent, paid, failed, cancelled
  payment_method VARCHAR(50), -- "stripe", "manual", etc.
  paid_at TIMESTAMPTZ,
  stripe_invoice_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),

  -- Metadata
  notes TEXT,
  pdf_url VARCHAR(500), -- S3 URL for PDF invoice

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_period ON invoices(billing_period_start, billing_period_end);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Invoice line items (detailed breakdown)
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Line item details
  item_type VARCHAR(50) NOT NULL, -- "call", "sms", "email", "subscription", "add-on"
  description TEXT NOT NULL,
  quantity DECIMAL(12, 2) NOT NULL, -- minutes, messages, etc.
  unit_price DECIMAL(12, 6) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,

  -- Reference
  reference_id BIGINT, -- CDR ID, SMS ID, etc.
  reference_type VARCHAR(50), -- "call", "sms", "email"

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_invoice_line_items_tenant ON invoice_line_items(tenant_id);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Payment method details
  provider VARCHAR(50) NOT NULL, -- "stripe", "paypal", "ach"
  provider_payment_method_id VARCHAR(255), -- Stripe PM ID

  -- Card/bank info (last 4 digits only)
  type VARCHAR(50), -- "card", "bank_account"
  brand VARCHAR(50), -- "visa", "mastercard", "amex"
  last4 VARCHAR(4),
  exp_month INTEGER,
  exp_year INTEGER,

  -- Status
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_tenant ON payment_methods(tenant_id);
CREATE UNIQUE INDEX idx_payment_methods_default ON payment_methods(tenant_id)
  WHERE is_default = TRUE AND is_active = TRUE;

-- Usage tracking (real-time)
CREATE TABLE IF NOT EXISTS usage_tracking (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Date tracking
  tracking_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Call usage
  total_call_minutes DECIMAL(12, 2) DEFAULT 0,
  total_call_cost DECIMAL(12, 2) DEFAULT 0,
  call_count INTEGER DEFAULT 0,

  -- SMS usage
  total_sms_sent INTEGER DEFAULT 0,
  total_sms_cost DECIMAL(12, 2) DEFAULT 0,

  -- Email usage
  total_emails_sent INTEGER DEFAULT 0,
  total_email_cost DECIMAL(12, 2) DEFAULT 0,

  -- Totals
  total_cost DECIMAL(12, 2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, tracking_date)
);

CREATE INDEX idx_usage_tracking_tenant_date ON usage_tracking(tenant_id, tracking_date DESC);

-- Spend limits and alerts
CREATE TABLE IF NOT EXISTS spend_limits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Limits
  monthly_limit DECIMAL(12, 2), -- NULL = unlimited
  daily_limit DECIMAL(12, 2),

  -- Alert thresholds (percentage of monthly_limit)
  alert_threshold_1 INTEGER DEFAULT 80, -- Alert at 80%
  alert_threshold_2 INTEGER DEFAULT 100, -- Alert at 100%

  -- Alert status
  alert_1_sent_at TIMESTAMPTZ,
  alert_2_sent_at TIMESTAMPTZ,
  alert_reset_at TIMESTAMPTZ, -- Reset on 1st of month

  -- Action when limit exceeded
  action_on_exceed VARCHAR(50) DEFAULT 'alert', -- "alert", "block_calls", "block_all"

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_spend_limits_tenant ON spend_limits(tenant_id);

-- Add cost fields to CDR table (if not already present)
DO $$
BEGIN
  -- Add cost_per_minute column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdr' AND column_name = 'cost_per_minute'
  ) THEN
    ALTER TABLE cdr ADD COLUMN cost_per_minute DECIMAL(10, 6);
  END IF;

  -- Add total_cost column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdr' AND column_name = 'total_cost'
  ) THEN
    ALTER TABLE cdr ADD COLUMN total_cost DECIMAL(10, 4);
  END IF;

  -- Add rate_table_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cdr' AND column_name = 'rate_table_id'
  ) THEN
    ALTER TABLE cdr ADD COLUMN rate_table_id BIGINT REFERENCES rate_tables(id);
  END IF;
END $$;

-- Create index on CDR for billing queries
CREATE INDEX IF NOT EXISTS idx_cdr_billing ON cdr(tenant_id, end_time) WHERE total_cost IS NOT NULL;

-- Function to calculate call cost
CREATE OR REPLACE FUNCTION calculate_call_cost()
RETURNS TRIGGER AS $$
DECLARE
  v_rate rate_tables%ROWTYPE;
  v_billable_seconds INTEGER;
  v_billable_minutes DECIMAL(10, 4);
  v_cost DECIMAL(10, 4);
BEGIN
  -- Only calculate if call has ended
  IF NEW.end_time IS NULL OR NEW.duration_seconds IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find rate for destination
  SELECT * INTO v_rate
  FROM rate_tables
  WHERE NEW.destination_number LIKE (prefix || '%')
    AND is_active = TRUE
    AND effective_date <= NEW.start_time
    AND (expiration_date IS NULL OR expiration_date >= NEW.start_time)
  ORDER BY LENGTH(prefix) DESC, carrier_priority ASC
  LIMIT 1;

  -- If no rate found, skip cost calculation
  IF v_rate.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Apply minimum duration
  v_billable_seconds := GREATEST(NEW.duration_seconds, v_rate.minimum_duration);

  -- Apply billing increment (round up)
  IF v_rate.billing_increment > 1 THEN
    v_billable_seconds := CEIL(v_billable_seconds::DECIMAL / v_rate.billing_increment) * v_rate.billing_increment;
  END IF;

  -- Calculate cost
  v_billable_minutes := v_billable_seconds / 60.0;
  v_cost := (v_billable_minutes * v_rate.cost_per_minute) + v_rate.connection_fee;

  -- Update CDR
  NEW.cost_per_minute := v_rate.cost_per_minute;
  NEW.total_cost := v_cost;
  NEW.rate_table_id := v_rate.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate cost when CDR is inserted/updated
DROP TRIGGER IF EXISTS trigger_calculate_call_cost ON cdr;
CREATE TRIGGER trigger_calculate_call_cost
  BEFORE INSERT OR UPDATE ON cdr
  FOR EACH ROW
  WHEN (NEW.end_time IS NOT NULL AND NEW.total_cost IS NULL)
  EXECUTE FUNCTION calculate_call_cost();

-- Function to update usage tracking
CREATE OR REPLACE FUNCTION update_usage_tracking()
RETURNS TRIGGER AS $$
BEGIN
  -- Update daily usage when CDR has cost
  IF NEW.total_cost IS NOT NULL AND NEW.total_cost > 0 THEN
    INSERT INTO usage_tracking (
      tenant_id,
      tracking_date,
      total_call_minutes,
      total_call_cost,
      call_count,
      total_cost
    ) VALUES (
      NEW.tenant_id,
      DATE(NEW.end_time),
      NEW.duration_seconds / 60.0,
      NEW.total_cost,
      1,
      NEW.total_cost
    )
    ON CONFLICT (tenant_id, tracking_date) DO UPDATE SET
      total_call_minutes = usage_tracking.total_call_minutes + EXCLUDED.total_call_minutes,
      total_call_cost = usage_tracking.total_call_cost + EXCLUDED.total_call_cost,
      call_count = usage_tracking.call_count + 1,
      total_cost = usage_tracking.total_cost + EXCLUDED.total_cost,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update usage tracking from CDR
DROP TRIGGER IF EXISTS trigger_update_usage_tracking ON cdr;
CREATE TRIGGER trigger_update_usage_tracking
  AFTER INSERT OR UPDATE ON cdr
  FOR EACH ROW
  WHEN (NEW.total_cost IS NOT NULL)
  EXECUTE FUNCTION update_usage_tracking();

-- Insert sample US rate data (Twilio-based pricing)
INSERT INTO rate_tables (prefix, destination_name, cost_per_minute, connection_fee, billing_increment, carrier_name, carrier_priority) VALUES
  -- US & Canada
  ('1', 'United States & Canada', 0.0085, 0, 1, 'Twilio', 100),

  -- UK
  ('44', 'United Kingdom', 0.0120, 0, 1, 'Twilio', 100),
  ('447', 'United Kingdom Mobile', 0.0240, 0, 1, 'Twilio', 100),

  -- Popular international destinations
  ('61', 'Australia', 0.0160, 0, 1, 'Twilio', 100),
  ('91', 'India', 0.0070, 0, 1, 'Twilio', 100),
  ('86', 'China', 0.0180, 0, 1, 'Twilio', 100),
  ('81', 'Japan', 0.0320, 0, 1, 'Twilio', 100),
  ('49', 'Germany', 0.0130, 0, 1, 'Twilio', 100),
  ('33', 'France', 0.0160, 0, 1, 'Twilio', 100),
  ('52', 'Mexico', 0.0240, 0, 1, 'Twilio', 100)
ON CONFLICT DO NOTHING;

-- Create view for monthly billing summary
CREATE OR REPLACE VIEW monthly_billing_summary AS
SELECT
  tenant_id,
  DATE_TRUNC('month', tracking_date) AS billing_month,
  SUM(total_call_minutes) AS total_call_minutes,
  SUM(total_call_cost) AS total_call_cost,
  SUM(call_count) AS total_calls,
  SUM(total_sms_sent) AS total_sms_sent,
  SUM(total_sms_cost) AS total_sms_cost,
  SUM(total_emails_sent) AS total_emails_sent,
  SUM(total_email_cost) AS total_email_cost,
  SUM(total_cost) AS total_cost
FROM usage_tracking
GROUP BY tenant_id, DATE_TRUNC('month', tracking_date);

COMMENT ON TABLE rate_tables IS 'Rate deck for call cost calculation with LCR support';
COMMENT ON TABLE invoices IS 'Monthly invoices for tenant billing';
COMMENT ON TABLE invoice_line_items IS 'Detailed breakdown of invoice charges';
COMMENT ON TABLE payment_methods IS 'Stored payment methods (Stripe, etc.)';
COMMENT ON TABLE usage_tracking IS 'Daily usage tracking for real-time cost monitoring';
COMMENT ON TABLE spend_limits IS 'Spend limits and alert thresholds per tenant';
COMMENT ON VIEW monthly_billing_summary IS 'Aggregated monthly usage and costs per tenant';
