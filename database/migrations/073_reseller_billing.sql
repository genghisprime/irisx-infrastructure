-- Migration: 073_reseller_billing.sql
-- Description: Reseller/white-label billing system
-- Date: 2025-12-16

-- Resellers table
CREATE TABLE IF NOT EXISTS resellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'bronze', -- bronze, silver, gold, platinum
    parent_reseller_id UUID REFERENCES resellers(id),
    commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- percentage, fixed, tiered
    commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    custom_pricing JSONB DEFAULT '{}'::jsonb,
    branding JSONB DEFAULT '{}'::jsonb,
    contract_start_date DATE,
    contract_end_date DATE,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add reseller_id to tenants if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'reseller_id'
    ) THEN
        ALTER TABLE tenants ADD COLUMN reseller_id UUID REFERENCES resellers(id);
        CREATE INDEX IF NOT EXISTS idx_tenants_reseller ON tenants(reseller_id);
    END IF;
END $$;

-- Reseller balances
CREATE TABLE IF NOT EXISTS reseller_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
    balance_cents BIGINT NOT NULL DEFAULT 0,
    pending_payout_cents BIGINT NOT NULL DEFAULT 0,
    total_earned_cents BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reseller_id)
);

-- Reseller transactions
CREATE TABLE IF NOT EXISTS reseller_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES resellers(id),
    tenant_id UUID REFERENCES tenants(id),
    transaction_type VARCHAR(30) NOT NULL, -- commission, adjustment, bonus
    amount_cents BIGINT NOT NULL,
    commission_cents BIGINT NOT NULL DEFAULT 0,
    usage_type VARCHAR(50), -- calls, sms, agents, etc.
    usage_quantity DECIMAL(15, 4),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reseller payouts
CREATE TABLE IF NOT EXISTS reseller_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES resellers(id),
    amount_cents BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    payment_method VARCHAR(30), -- bank_transfer, paypal, stripe
    payment_details JSONB DEFAULT '{}'::jsonb,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- White-label invoices generated for tenants
CREATE TABLE IF NOT EXISTS reseller_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    reseller_id UUID REFERENCES resellers(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal_cents BIGINT NOT NULL,
    tax_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    branding JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, overdue, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reseller pricing overrides (per-tenant custom pricing)
CREATE TABLE IF NOT EXISTS reseller_pricing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID NOT NULL REFERENCES resellers(id),
    tenant_id UUID REFERENCES tenants(id), -- NULL means applies to all tenants
    pricing_key VARCHAR(100) NOT NULL,
    price_cents BIGINT NOT NULL,
    effective_from DATE,
    effective_until DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_resellers_tier ON resellers(tier);
CREATE INDEX IF NOT EXISTS idx_resellers_parent ON resellers(parent_reseller_id);
CREATE INDEX IF NOT EXISTS idx_resellers_active ON resellers(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_reseller_transactions_reseller ON reseller_transactions(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_transactions_tenant ON reseller_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reseller_transactions_created ON reseller_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_payouts_reseller ON reseller_payouts(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_payouts_status ON reseller_payouts(status);

CREATE INDEX IF NOT EXISTS idx_reseller_invoices_tenant ON reseller_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reseller_invoices_reseller ON reseller_invoices(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_invoices_status ON reseller_invoices(status);

CREATE INDEX IF NOT EXISTS idx_reseller_pricing_overrides_reseller ON reseller_pricing_overrides(reseller_id);

-- Insert sample reseller tiers (for reference)
COMMENT ON COLUMN resellers.tier IS 'bronze: 10% margin, silver: 15% margin, gold: 20% margin, platinum: 25% margin';
COMMENT ON COLUMN resellers.branding IS 'JSON object with: company_name, logo_url, primary_color, support_email, address, invoice_prefix';
COMMENT ON COLUMN resellers.custom_pricing IS 'JSON object with per-service price overrides in cents';

COMMENT ON TABLE resellers IS 'Reseller accounts for white-label billing';
COMMENT ON TABLE reseller_balances IS 'Current balance and earnings for each reseller';
COMMENT ON TABLE reseller_transactions IS 'All commission transactions for resellers';
COMMENT ON TABLE reseller_payouts IS 'Payout requests and processing status';
COMMENT ON TABLE reseller_invoices IS 'White-label invoices generated for tenant billing';
