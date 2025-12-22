-- Billing Analytics Tables
-- Migration: 060_add_billing_analytics.sql

-- Monthly Recurring Revenue (MRR) tracking
CREATE TABLE IF NOT EXISTS mrr_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    snapshot_date DATE NOT NULL,
    snapshot_month VARCHAR(7) NOT NULL, -- '2025-12' format

    -- MRR Components
    new_mrr DECIMAL(12,2) DEFAULT 0, -- New customers this month
    expansion_mrr DECIMAL(12,2) DEFAULT 0, -- Upgrades
    contraction_mrr DECIMAL(12,2) DEFAULT 0, -- Downgrades
    churn_mrr DECIMAL(12,2) DEFAULT 0, -- Cancelled customers
    reactivation_mrr DECIMAL(12,2) DEFAULT 0, -- Reactivated customers

    -- Net MRR
    net_new_mrr DECIMAL(12,2) GENERATED ALWAYS AS (new_mrr + expansion_mrr + reactivation_mrr - contraction_mrr - churn_mrr) STORED,
    total_mrr DECIMAL(12,2) NOT NULL DEFAULT 0,

    -- Customer counts
    active_customers INTEGER DEFAULT 0,
    new_customers INTEGER DEFAULT 0,
    churned_customers INTEGER DEFAULT 0,

    -- ARPU (Average Revenue Per User)
    arpu DECIMAL(10,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, snapshot_date)
);

-- Platform-wide MRR (for master admin)
CREATE TABLE IF NOT EXISTS platform_mrr_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    snapshot_date DATE NOT NULL,
    snapshot_month VARCHAR(7) NOT NULL,

    -- MRR Components
    new_mrr DECIMAL(14,2) DEFAULT 0,
    expansion_mrr DECIMAL(14,2) DEFAULT 0,
    contraction_mrr DECIMAL(14,2) DEFAULT 0,
    churn_mrr DECIMAL(14,2) DEFAULT 0,
    reactivation_mrr DECIMAL(14,2) DEFAULT 0,

    net_new_mrr DECIMAL(14,2) GENERATED ALWAYS AS (new_mrr + expansion_mrr + reactivation_mrr - contraction_mrr - churn_mrr) STORED,
    total_mrr DECIMAL(14,2) NOT NULL DEFAULT 0,

    -- ARR (Annual Recurring Revenue)
    arr DECIMAL(14,2) GENERATED ALWAYS AS (total_mrr * 12) STORED,

    -- Customer metrics
    total_tenants INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    new_tenants INTEGER DEFAULT 0,
    churned_tenants INTEGER DEFAULT 0,

    -- Platform ARPU
    arpu DECIMAL(10,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(snapshot_date)
);

-- Churn tracking
CREATE TABLE IF NOT EXISTS churn_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'subscription_cancelled',
        'subscription_downgraded',
        'subscription_upgraded',
        'subscription_paused',
        'subscription_resumed',
        'account_deactivated',
        'payment_failed_final'
    )),

    previous_plan VARCHAR(100),
    new_plan VARCHAR(100),
    previous_mrr DECIMAL(12,2),
    new_mrr DECIMAL(12,2),
    mrr_change DECIMAL(12,2),

    churn_reason VARCHAR(100), -- e.g., 'too_expensive', 'competitor', 'not_needed', 'poor_support'
    churn_reason_detail TEXT,

    effective_date DATE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer cohorts for retention analysis
CREATE TABLE IF NOT EXISTS customer_cohorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    cohort_month VARCHAR(7) NOT NULL, -- Month customer started: '2025-01'
    signup_date DATE NOT NULL,
    first_payment_date DATE,

    initial_plan VARCHAR(100),
    initial_mrr DECIMAL(12,2),

    current_status VARCHAR(30) DEFAULT 'active' CHECK (current_status IN (
        'active', 'churned', 'paused', 'trial', 'delinquent'
    )),
    churned_date DATE,

    lifetime_value DECIMAL(14,2) DEFAULT 0, -- Total revenue from this customer
    months_active INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id)
);

-- Monthly cohort retention (for cohort analysis chart)
CREATE TABLE IF NOT EXISTS cohort_retention (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cohort_month VARCHAR(7) NOT NULL, -- Starting cohort
    retention_month INTEGER NOT NULL, -- 0, 1, 2, 3... months after signup

    starting_customers INTEGER NOT NULL,
    retained_customers INTEGER NOT NULL,
    retention_rate DECIMAL(5,2), -- Percentage

    starting_mrr DECIMAL(14,2),
    retained_mrr DECIMAL(14,2),
    mrr_retention_rate DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(cohort_month, retention_month)
);

-- Revenue analytics (detailed breakdown)
CREATE TABLE IF NOT EXISTS revenue_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for platform-wide

    analytics_date DATE NOT NULL,
    analytics_month VARCHAR(7) NOT NULL,

    -- Revenue by type
    subscription_revenue DECIMAL(12,2) DEFAULT 0,
    usage_revenue DECIMAL(12,2) DEFAULT 0,
    overage_revenue DECIMAL(12,2) DEFAULT 0,
    one_time_revenue DECIMAL(12,2) DEFAULT 0,

    total_revenue DECIMAL(12,2) GENERATED ALWAYS AS (
        subscription_revenue + usage_revenue + overage_revenue + one_time_revenue
    ) STORED,

    -- Usage breakdown
    call_revenue DECIMAL(12,2) DEFAULT 0,
    sms_revenue DECIMAL(12,2) DEFAULT 0,
    email_revenue DECIMAL(12,2) DEFAULT 0,
    phone_number_revenue DECIMAL(12,2) DEFAULT 0,
    storage_revenue DECIMAL(12,2) DEFAULT 0,
    ai_revenue DECIMAL(12,2) DEFAULT 0,

    -- Cost tracking
    total_cost DECIMAL(12,2) DEFAULT 0,
    gross_margin DECIMAL(12,2) DEFAULT 0,
    gross_margin_percent DECIMAL(5,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, analytics_date)
);

-- LTV (Lifetime Value) predictions
CREATE TABLE IF NOT EXISTS ltv_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    prediction_date DATE NOT NULL,

    -- Historical LTV
    actual_ltv DECIMAL(14,2) DEFAULT 0, -- Total paid so far

    -- Predicted LTV (based on cohort analysis)
    predicted_ltv DECIMAL(14,2),
    predicted_lifetime_months INTEGER,

    -- Churn probability
    churn_probability DECIMAL(5,4), -- 0.0000 to 1.0000
    predicted_churn_month VARCHAR(7),

    -- Health score (0-100)
    health_score INTEGER,
    health_factors JSONB DEFAULT '{}',

    model_version VARCHAR(50) DEFAULT 'v1',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, prediction_date)
);

-- Usage trends for dashboard
CREATE TABLE IF NOT EXISTS usage_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    trend_date DATE NOT NULL,

    -- Call usage
    total_calls INTEGER DEFAULT 0,
    call_minutes DECIMAL(12,2) DEFAULT 0,
    call_spend DECIMAL(12,2) DEFAULT 0,

    -- SMS usage
    total_sms INTEGER DEFAULT 0,
    sms_spend DECIMAL(12,2) DEFAULT 0,

    -- Email usage
    total_emails INTEGER DEFAULT 0,
    email_spend DECIMAL(12,2) DEFAULT 0,

    -- Phone numbers
    active_numbers INTEGER DEFAULT 0,
    number_spend DECIMAL(12,2) DEFAULT 0,

    -- AI usage
    ai_minutes DECIMAL(12,2) DEFAULT 0,
    ai_spend DECIMAL(12,2) DEFAULT 0,

    -- Storage
    storage_gb DECIMAL(10,4) DEFAULT 0,
    storage_spend DECIMAL(12,2) DEFAULT 0,

    total_spend DECIMAL(12,2) DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, trend_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mrr_snapshots_tenant ON mrr_snapshots(tenant_id, snapshot_month);
CREATE INDEX IF NOT EXISTS idx_platform_mrr_month ON platform_mrr_snapshots(snapshot_month);
CREATE INDEX IF NOT EXISTS idx_churn_events_tenant ON churn_events(tenant_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_churn_events_type ON churn_events(event_type);
CREATE INDEX IF NOT EXISTS idx_customer_cohorts_month ON customer_cohorts(cohort_month);
CREATE INDEX IF NOT EXISTS idx_cohort_retention_month ON cohort_retention(cohort_month);
CREATE INDEX IF NOT EXISTS idx_revenue_analytics_tenant ON revenue_analytics(tenant_id, analytics_month);
CREATE INDEX IF NOT EXISTS idx_ltv_predictions_tenant ON ltv_predictions(tenant_id, prediction_date);
CREATE INDEX IF NOT EXISTS idx_usage_trends_tenant ON usage_trends(tenant_id, trend_date);

COMMENT ON TABLE mrr_snapshots IS 'Daily MRR tracking per tenant';
COMMENT ON TABLE platform_mrr_snapshots IS 'Platform-wide MRR for master admin';
COMMENT ON TABLE churn_events IS 'Track subscription changes and churn';
COMMENT ON TABLE customer_cohorts IS 'Cohort tracking for retention analysis';
COMMENT ON TABLE cohort_retention IS 'Monthly retention rates per cohort';
COMMENT ON TABLE revenue_analytics IS 'Detailed revenue breakdown';
COMMENT ON TABLE ltv_predictions IS 'Customer lifetime value predictions';
COMMENT ON TABLE usage_trends IS 'Daily usage tracking for customer dashboard';
