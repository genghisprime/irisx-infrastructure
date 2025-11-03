-- Migration 025: Usage Tracking & Billing System
-- Enables usage monitoring, cost calculation, and invoice generation

-- Create usage_records table for tracking all API usage
CREATE TABLE IF NOT EXISTS usage_records (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL, -- 'voice', 'sms', 'email', 'whatsapp', 'social'
  resource_type VARCHAR(50) NOT NULL, -- 'call', 'message', 'minute', 'email', 'mms'
  resource_id VARCHAR(255), -- ID of the call/message/etc
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 0, -- e.g., minutes for calls, 1 for messages
  unit_cost DECIMAL(10, 6) NOT NULL DEFAULT 0, -- Cost per unit
  total_cost DECIMAL(10, 4) NOT NULL DEFAULT 0, -- quantity * unit_cost
  metadata JSONB, -- Additional data (from_number, to_number, duration, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  period_start DATE NOT NULL, -- Billing period start (for aggregation)
  period_end DATE NOT NULL -- Billing period end
);

-- Indexes for usage_records
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_id ON usage_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_channel ON usage_records(channel);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_resource ON usage_records(resource_id);

-- Create usage_summary table for pre-aggregated daily summaries
CREATE TABLE IF NOT EXISTS usage_summaries (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  channel VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  total_quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, summary_date, channel, resource_type)
);

-- Indexes for usage_summaries
CREATE INDEX IF NOT EXISTS idx_usage_summaries_tenant_date ON usage_summaries(tenant_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_usage_summaries_channel ON usage_summaries(channel);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'INV-2025-11-001'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'draft', -- draft, pending, paid, overdue, cancelled
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50), -- 'credit_card', 'bank_transfer', 'stripe', 'paypal'
  payment_reference VARCHAR(255), -- Stripe charge ID, PayPal transaction ID, etc.
  pdf_url TEXT, -- S3 URL to invoice PDF
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Create invoice_line_items table
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL, -- e.g., "Voice Calls - 150 minutes"
  quantity DECIMAL(10, 4) NOT NULL,
  unit_price DECIMAL(10, 6) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL, -- quantity * unit_price
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for invoice_line_items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);

-- Create pricing_plans table (for future plan management)
CREATE TABLE IF NOT EXISTS pricing_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE, -- 'free', 'starter', 'professional', 'enterprise'
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_base_fee DECIMAL(10, 2) DEFAULT 0,
  included_credits DECIMAL(10, 2) DEFAULT 0, -- e.g., $50 free credits
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing plans
INSERT INTO pricing_plans (name, display_name, description, monthly_base_fee, included_credits) VALUES
  ('free_trial', 'Free Trial', '14-day free trial with $50 credits', 0, 50.00),
  ('starter', 'Starter Plan', 'Perfect for small businesses', 29.00, 10.00),
  ('professional', 'Professional Plan', 'For growing businesses', 99.00, 50.00),
  ('enterprise', 'Enterprise Plan', 'Custom pricing for large organizations', 499.00, 200.00)
ON CONFLICT (name) DO NOTHING;

-- Create pricing_rates table (cost per unit for each channel)
CREATE TABLE IF NOT EXISTS pricing_rates (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES pricing_plans(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  unit_price DECIMAL(10, 6) NOT NULL, -- e.g., 0.015 for voice per minute
  currency VARCHAR(3) DEFAULT 'USD',
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, channel, resource_type, effective_from)
);

-- Insert default pricing rates for free trial plan
INSERT INTO pricing_rates (plan_id, channel, resource_type, unit_price) VALUES
  ((SELECT id FROM pricing_plans WHERE name = 'free_trial'), 'voice', 'minute', 0.015),
  ((SELECT id FROM pricing_plans WHERE name = 'free_trial'), 'sms', 'message', 0.0075),
  ((SELECT id FROM pricing_plans WHERE name = 'free_trial'), 'sms', 'mms', 0.02),
  ((SELECT id FROM pricing_plans WHERE name = 'free_trial'), 'email', 'message', 0.001),
  ((SELECT id FROM pricing_plans WHERE name = 'free_trial'), 'whatsapp', 'message', 0.005)
ON CONFLICT DO NOTHING;

-- Add pricing plan columns to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES pricing_plans(id),
  ADD COLUMN IF NOT EXISTS billing_cycle_start DATE,
  ADD COLUMN IF NOT EXISTS billing_cycle_day INTEGER DEFAULT 1, -- Day of month for billing
  ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(10, 2) DEFAULT 0, -- Remaining credits
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_method_id VARCHAR(255); -- Stripe payment method ID

-- Update existing tenants to use free trial plan
UPDATE tenants
SET plan_id = (SELECT id FROM pricing_plans WHERE name = 'free_trial'),
    billing_cycle_start = CURRENT_DATE,
    credit_balance = 50.00
WHERE plan_id IS NULL;

-- Create function to calculate current period usage
CREATE OR REPLACE FUNCTION get_tenant_usage(
  p_tenant_id INTEGER,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  channel VARCHAR,
  resource_type VARCHAR,
  total_quantity DECIMAL,
  total_cost DECIMAL,
  record_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ur.channel,
    ur.resource_type,
    SUM(ur.quantity) as total_quantity,
    SUM(ur.total_cost) as total_cost,
    COUNT(*)::BIGINT as record_count
  FROM usage_records ur
  WHERE ur.tenant_id = p_tenant_id
    AND ur.created_at >= p_start_date
    AND ur.created_at < p_end_date + INTERVAL '1 day'
  GROUP BY ur.channel, ur.resource_type
  ORDER BY ur.channel, ur.resource_type;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  v_year TEXT;
  v_month TEXT;
  v_count INTEGER;
  v_invoice_number TEXT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month := TO_CHAR(CURRENT_DATE, 'MM');

  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || v_year || '-' || v_month || '-%';

  v_invoice_number := 'INV-' || v_year || '-' || v_month || '-' || LPAD(v_count::TEXT, 4, '0');

  RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE usage_records IS 'Records every API usage event for billing purposes';
COMMENT ON TABLE usage_summaries IS 'Pre-aggregated daily usage summaries for faster reporting';
COMMENT ON TABLE invoices IS 'Monthly invoices generated for each tenant';
COMMENT ON TABLE invoice_line_items IS 'Line items breakdown for each invoice';
COMMENT ON TABLE pricing_plans IS 'Available pricing plans (free, starter, pro, enterprise)';
COMMENT ON TABLE pricing_rates IS 'Per-unit pricing rates for each channel and plan';

COMMENT ON FUNCTION get_tenant_usage IS 'Calculate total usage for a tenant in a date range';
COMMENT ON FUNCTION generate_invoice_number IS 'Generate unique invoice number (INV-YYYY-MM-NNNN)';
