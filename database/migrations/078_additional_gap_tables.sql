-- Additional Tables for Gap Analysis Completion
-- Dynamic lists, budgets, dashboards, ML models, WFM SMS offers

-- ============================================
-- Dynamic Contact Lists
-- ============================================

CREATE TABLE IF NOT EXISTS dynamic_contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    filter_definition JSONB NOT NULL,
    auto_refresh BOOLEAN DEFAULT true,
    refresh_interval_minutes INTEGER DEFAULT 60,
    last_refreshed_at TIMESTAMPTZ,
    last_contact_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dynamic_list_contacts (
    list_id UUID NOT NULL REFERENCES dynamic_contact_lists(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (list_id, contact_id)
);

CREATE TABLE IF NOT EXISTS contact_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    filter_definition JSONB NOT NULL,
    color VARCHAR(20),
    is_global BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- ============================================
-- Budget Management
-- ============================================

CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'monthly',
    category VARCHAR(50) DEFAULT 'total',
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    start_date DATE,
    end_date DATE,
    alert_thresholds JSONB DEFAULT '[50, 75, 90, 100]',
    auto_renew BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS budget_spending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    total_spent DECIMAL(15, 4) DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (budget_id, period_start)
);

CREATE TABLE IF NOT EXISTS spending_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 6) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning',
    threshold_percent DECIMAL(5, 2),
    current_percent DECIMAL(5, 2),
    current_spent DECIMAL(15, 2),
    budget_amount DECIMAL(15, 2),
    message TEXT,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BI Dashboards
-- ============================================

CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'custom',
    description TEXT,
    layout JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT false,
    is_shared BOOLEAN DEFAULT false,
    refresh_interval INTEGER DEFAULT 60,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    kpi_id VARCHAR(100),
    custom_query TEXT,
    config JSONB DEFAULT '{}',
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    width INTEGER DEFAULT 4,
    height INTEGER DEFAULT 3,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- ============================================
-- ML Models
-- ============================================

CREATE TABLE IF NOT EXISTS ml_models (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_type VARCHAR(50) NOT NULL,
    metadata JSONB,
    trained_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (tenant_id, model_type)
);

-- ============================================
-- Template Partials
-- ============================================

CREATE TABLE IF NOT EXISTS template_partials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS message_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT,
    html_content TEXT,
    text_content TEXT,
    subject VARCHAR(500),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WFM SMS Offers
-- ============================================

CREATE TABLE IF NOT EXISTS wfm_shift_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    shift_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    pay_multiplier DECIMAL(4, 2) DEFAULT 1.0,
    max_acceptances INTEGER,
    expires_at TIMESTAMPTZ,
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(50) DEFAULT 'pending',
    message TEXT,
    metadata JSONB,
    sent_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wfm_agent_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES wfm_shift_offers(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    response_code VARCHAR(10),
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    sms_sid VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS wfm_offer_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES wfm_shift_offers(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- Dynamic lists
CREATE INDEX IF NOT EXISTS idx_dynamic_lists_tenant ON dynamic_contact_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_list_contacts_list ON dynamic_list_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_segments_tenant ON contact_segments(tenant_id);

-- Budgets
CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_spending_budget ON budget_spending(budget_id);
CREATE INDEX IF NOT EXISTS idx_spending_log_tenant ON spending_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_tenant ON budget_alerts(tenant_id, created_at DESC);

-- Dashboards
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);

-- ML models
CREATE INDEX IF NOT EXISTS idx_ml_models_tenant ON ml_models(tenant_id);

-- WFM
CREATE INDEX IF NOT EXISTS idx_wfm_offers_tenant ON wfm_shift_offers(tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_wfm_agent_offers_agent ON wfm_agent_offers(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_wfm_agent_offers_offer ON wfm_agent_offers(offer_id);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE dynamic_contact_lists IS 'Dynamic contact lists with filter-based membership';
COMMENT ON TABLE contact_segments IS 'Saved contact filter segments';
COMMENT ON TABLE budgets IS 'Tenant budget definitions';
COMMENT ON TABLE budget_spending IS 'Budget spending by period';
COMMENT ON TABLE budget_alerts IS 'Budget threshold alerts';
COMMENT ON TABLE dashboards IS 'Custom BI dashboards';
COMMENT ON TABLE dashboard_widgets IS 'Dashboard widget configurations';
COMMENT ON TABLE ml_models IS 'Trained ML models metadata';
COMMENT ON TABLE wfm_shift_offers IS 'WFM shift offers (VTO, OT, etc.)';
COMMENT ON TABLE wfm_agent_offers IS 'Individual agent offer tracking';
