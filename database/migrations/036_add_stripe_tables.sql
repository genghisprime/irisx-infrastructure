-- Migration: Add Stripe Integration Tables
-- Description: Tables for Stripe payment processing, subscriptions, and events

-- Add stripe_customer_id to tenants if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE tenants ADD COLUMN stripe_customer_id VARCHAR(255);
    CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);
  END IF;
END $$;

-- Tenant Subscriptions table
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'inactive', -- active, past_due, canceled, trialing, etc.
  plan_type VARCHAR(50) DEFAULT 'standard', -- standard, pro, enterprise
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_stripe_id ON tenant_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);

-- Payment Events table (audit trail for all payment activity)
CREATE TABLE IF NOT EXISTS payment_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL, -- payment_success, payment_failed, invoice_paid, subscription_updated, etc.
  event_data JSONB NOT NULL DEFAULT '{}',
  stripe_event_id VARCHAR(255), -- For deduplication
  processed BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_stripe_event ON payment_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at);

-- Add stripe_invoice_id and stripe_payment_intent_id to invoices if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'stripe_invoice_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN stripe_invoice_id VARCHAR(255);
    CREATE INDEX idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN stripe_payment_intent_id VARCHAR(255);
    CREATE INDEX idx_invoices_stripe_pi ON invoices(stripe_payment_intent_id);
  END IF;
END $$;

-- Add provider info to payment_methods if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_methods' AND column_name = 'provider'
  ) THEN
    ALTER TABLE payment_methods ADD COLUMN provider VARCHAR(50) DEFAULT 'stripe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_methods' AND column_name = 'provider_payment_method_id'
  ) THEN
    ALTER TABLE payment_methods ADD COLUMN provider_payment_method_id VARCHAR(255);
    CREATE INDEX idx_payment_methods_provider_id ON payment_methods(provider_payment_method_id);
  END IF;
END $$;

-- Grant permissions
GRANT ALL ON tenant_subscriptions TO irisx_admin;
GRANT ALL ON payment_events TO irisx_admin;
GRANT USAGE, SELECT ON SEQUENCE tenant_subscriptions_id_seq TO irisx_admin;
GRANT USAGE, SELECT ON SEQUENCE payment_events_id_seq TO irisx_admin;

-- Comments
COMMENT ON TABLE tenant_subscriptions IS 'Tracks Stripe subscription status for each tenant';
COMMENT ON TABLE payment_events IS 'Audit trail for all payment-related events from Stripe';
COMMENT ON COLUMN tenants.stripe_customer_id IS 'Stripe Customer ID for this tenant';
COMMENT ON COLUMN invoices.stripe_invoice_id IS 'Corresponding Stripe Invoice ID';
COMMENT ON COLUMN invoices.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for successful payment';
