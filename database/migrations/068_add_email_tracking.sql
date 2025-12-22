-- Migration: 068_add_email_tracking.sql
-- Description: Email tracking pixels and link tracking
-- Date: December 16, 2025

-- ===========================================
-- EMAIL TRACKING EVENTS
-- ===========================================

-- Track email opens via pixel
CREATE TABLE IF NOT EXISTS email_opens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50), -- desktop, mobile, tablet
    browser VARCHAR(100),
    os VARCHAR(100),
    location_country VARCHAR(100),
    location_city VARCHAR(255),
    is_first_open BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_opens_tenant ON email_opens(tenant_id);
CREATE INDEX idx_email_opens_email ON email_opens(email_id);
CREATE INDEX idx_email_opens_recipient ON email_opens(recipient_email);
CREATE INDEX idx_email_opens_opened_at ON email_opens(opened_at);

-- ===========================================
-- EMAIL LINK CLICKS
-- ===========================================

-- Track link clicks in emails
CREATE TABLE IF NOT EXISTS email_link_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    link_id UUID, -- Reference to tracked link
    original_url TEXT NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    location_country VARCHAR(100),
    location_city VARCHAR(255),
    click_number INTEGER DEFAULT 1, -- nth click by this recipient
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_link_clicks_tenant ON email_link_clicks(tenant_id);
CREATE INDEX idx_email_link_clicks_email ON email_link_clicks(email_id);
CREATE INDEX idx_email_link_clicks_recipient ON email_link_clicks(recipient_email);
CREATE INDEX idx_email_link_clicks_clicked_at ON email_link_clicks(clicked_at);
CREATE INDEX idx_email_link_clicks_link ON email_link_clicks(link_id);

-- ===========================================
-- TRACKED LINKS
-- ===========================================

-- Store tracked links with unique IDs
CREATE TABLE IF NOT EXISTS email_tracked_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    tracking_url TEXT NOT NULL,
    link_text TEXT, -- Anchor text if available
    position_in_email INTEGER, -- Order of link in email
    click_count INTEGER DEFAULT 0,
    unique_click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_tracked_links_tenant ON email_tracked_links(tenant_id);
CREATE INDEX idx_email_tracked_links_email ON email_tracked_links(email_id);

-- ===========================================
-- EMAIL TRACKING TOKENS
-- ===========================================

-- Secure tokens for tracking (prevents enumeration)
CREATE TABLE IF NOT EXISTS email_tracking_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE, -- Short secure token
    token_type VARCHAR(20) NOT NULL, -- 'pixel' or 'link'
    link_id UUID REFERENCES email_tracked_links(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email_id, recipient_email, token_type, link_id)
);

CREATE INDEX idx_email_tracking_tokens_token ON email_tracking_tokens(token);
CREATE INDEX idx_email_tracking_tokens_email ON email_tracking_tokens(email_id);
CREATE INDEX idx_email_tracking_tokens_expires ON email_tracking_tokens(expires_at);

-- ===========================================
-- EMAIL ENGAGEMENT METRICS
-- ===========================================

-- Aggregate engagement metrics per email
CREATE TABLE IF NOT EXISTS email_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email_id UUID NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
    -- Delivery metrics
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    -- Engagement metrics
    total_opens INTEGER DEFAULT 0,
    unique_opens INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    -- Negative signals
    total_unsubscribes INTEGER DEFAULT 0,
    total_spam_reports INTEGER DEFAULT 0,
    -- Rates
    open_rate DECIMAL(5, 2) DEFAULT 0,
    click_rate DECIMAL(5, 2) DEFAULT 0,
    click_to_open_rate DECIMAL(5, 2) DEFAULT 0,
    bounce_rate DECIMAL(5, 2) DEFAULT 0,
    unsubscribe_rate DECIMAL(5, 2) DEFAULT 0,
    spam_rate DECIMAL(5, 2) DEFAULT 0,
    -- Timing
    first_open_at TIMESTAMP WITH TIME ZONE,
    last_open_at TIMESTAMP WITH TIME ZONE,
    first_click_at TIMESTAMP WITH TIME ZONE,
    last_click_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_engagement_metrics_tenant ON email_engagement_metrics(tenant_id);

-- ===========================================
-- CAMPAIGN ENGAGEMENT METRICS
-- ===========================================

-- Aggregate metrics for email campaigns
CREATE TABLE IF NOT EXISTS campaign_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Volume
    emails_sent INTEGER DEFAULT 0,
    emails_delivered INTEGER DEFAULT 0,
    emails_bounced INTEGER DEFAULT 0,
    -- Engagement
    total_opens INTEGER DEFAULT 0,
    unique_opens INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    -- Negative signals
    unsubscribes INTEGER DEFAULT 0,
    spam_reports INTEGER DEFAULT 0,
    -- Calculated rates
    delivery_rate DECIMAL(5, 2) DEFAULT 0,
    open_rate DECIMAL(5, 2) DEFAULT 0,
    click_rate DECIMAL(5, 2) DEFAULT 0,
    click_to_open_rate DECIMAL(5, 2) DEFAULT 0,
    -- Heatmap data
    opens_by_hour JSONB DEFAULT '{}',
    clicks_by_hour JSONB DEFAULT '{}',
    top_links JSONB DEFAULT '[]',
    device_breakdown JSONB DEFAULT '{}',
    geo_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, date)
);

CREATE INDEX idx_campaign_engagement_metrics_tenant ON campaign_engagement_metrics(tenant_id);
CREATE INDEX idx_campaign_engagement_metrics_campaign ON campaign_engagement_metrics(campaign_id);
CREATE INDEX idx_campaign_engagement_metrics_date ON campaign_engagement_metrics(date);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Generate tracking token
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Record email open
CREATE OR REPLACE FUNCTION record_email_open(
    p_token VARCHAR(64),
    p_ip_address INET,
    p_user_agent TEXT
)
RETURNS UUID AS $$
DECLARE
    v_token_record RECORD;
    v_is_first_open BOOLEAN;
    v_open_id UUID;
BEGIN
    -- Look up token
    SELECT * INTO v_token_record
    FROM email_tracking_tokens
    WHERE token = p_token
      AND token_type = 'pixel'
      AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Check if first open
    SELECT COUNT(*) = 0 INTO v_is_first_open
    FROM email_opens
    WHERE email_id = v_token_record.email_id
      AND recipient_email = v_token_record.recipient_email;

    -- Insert open record
    INSERT INTO email_opens (
        tenant_id, email_id, recipient_email, ip_address, user_agent, is_first_open
    ) VALUES (
        v_token_record.tenant_id, v_token_record.email_id,
        v_token_record.recipient_email, p_ip_address, p_user_agent, v_is_first_open
    ) RETURNING id INTO v_open_id;

    -- Update engagement metrics
    INSERT INTO email_engagement_metrics (tenant_id, email_id, total_opens, unique_opens, first_open_at, last_open_at)
    VALUES (
        v_token_record.tenant_id, v_token_record.email_id,
        1, CASE WHEN v_is_first_open THEN 1 ELSE 0 END,
        CASE WHEN v_is_first_open THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (email_id) DO UPDATE SET
        total_opens = email_engagement_metrics.total_opens + 1,
        unique_opens = email_engagement_metrics.unique_opens +
            CASE WHEN v_is_first_open THEN 1 ELSE 0 END,
        first_open_at = COALESCE(email_engagement_metrics.first_open_at, NOW()),
        last_open_at = NOW(),
        updated_at = NOW();

    RETURN v_open_id;
END;
$$ LANGUAGE plpgsql;

-- Record link click
CREATE OR REPLACE FUNCTION record_link_click(
    p_token VARCHAR(64),
    p_ip_address INET,
    p_user_agent TEXT
)
RETURNS TEXT AS $$ -- Returns original URL
DECLARE
    v_token_record RECORD;
    v_click_number INTEGER;
    v_is_unique BOOLEAN;
    v_original_url TEXT;
BEGIN
    -- Look up token
    SELECT t.*, l.original_url INTO v_token_record
    FROM email_tracking_tokens t
    LEFT JOIN email_tracked_links l ON t.link_id = l.id
    WHERE t.token = p_token
      AND t.token_type = 'link'
      AND t.expires_at > NOW();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_original_url := v_token_record.original_url;

    -- Get click number for this recipient
    SELECT COALESCE(MAX(click_number), 0) + 1 INTO v_click_number
    FROM email_link_clicks
    WHERE email_id = v_token_record.email_id
      AND recipient_email = v_token_record.recipient_email
      AND link_id = v_token_record.link_id;

    v_is_unique := v_click_number = 1;

    -- Insert click record
    INSERT INTO email_link_clicks (
        tenant_id, email_id, recipient_email, link_id, original_url,
        ip_address, user_agent, click_number
    ) VALUES (
        v_token_record.tenant_id, v_token_record.email_id,
        v_token_record.recipient_email, v_token_record.link_id, v_original_url,
        p_ip_address, p_user_agent, v_click_number
    );

    -- Update tracked link stats
    UPDATE email_tracked_links
    SET click_count = click_count + 1,
        unique_click_count = unique_click_count + CASE WHEN v_is_unique THEN 1 ELSE 0 END
    WHERE id = v_token_record.link_id;

    -- Update engagement metrics
    INSERT INTO email_engagement_metrics (
        tenant_id, email_id, total_clicks, unique_clicks, first_click_at, last_click_at
    )
    VALUES (
        v_token_record.tenant_id, v_token_record.email_id,
        1, CASE WHEN v_is_unique THEN 1 ELSE 0 END,
        CASE WHEN v_is_unique THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (email_id) DO UPDATE SET
        total_clicks = email_engagement_metrics.total_clicks + 1,
        unique_clicks = email_engagement_metrics.unique_clicks +
            CASE WHEN v_is_unique THEN 1 ELSE 0 END,
        first_click_at = COALESCE(email_engagement_metrics.first_click_at, NOW()),
        last_click_at = NOW(),
        updated_at = NOW();

    RETURN v_original_url;
END;
$$ LANGUAGE plpgsql;

-- Create tracking token for email
CREATE OR REPLACE FUNCTION create_email_tracking(
    p_tenant_id UUID,
    p_email_id UUID,
    p_recipient_email VARCHAR(255)
)
RETURNS VARCHAR(64) AS $$
DECLARE
    v_token VARCHAR(64);
BEGIN
    v_token := generate_tracking_token();

    INSERT INTO email_tracking_tokens (
        tenant_id, email_id, recipient_email, token, token_type
    ) VALUES (
        p_tenant_id, p_email_id, p_recipient_email, v_token, 'pixel'
    )
    ON CONFLICT (email_id, recipient_email, token_type, link_id) DO UPDATE
    SET token = EXCLUDED.token
    RETURNING token INTO v_token;

    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Calculate engagement rates
CREATE OR REPLACE FUNCTION update_email_engagement_rates(p_email_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE email_engagement_metrics
    SET open_rate = CASE WHEN total_sent > 0
            THEN ROUND((unique_opens::DECIMAL / total_sent) * 100, 2)
            ELSE 0 END,
        click_rate = CASE WHEN total_sent > 0
            THEN ROUND((unique_clicks::DECIMAL / total_sent) * 100, 2)
            ELSE 0 END,
        click_to_open_rate = CASE WHEN unique_opens > 0
            THEN ROUND((unique_clicks::DECIMAL / unique_opens) * 100, 2)
            ELSE 0 END,
        bounce_rate = CASE WHEN total_sent > 0
            THEN ROUND((total_bounced::DECIMAL / total_sent) * 100, 2)
            ELSE 0 END,
        unsubscribe_rate = CASE WHEN total_delivered > 0
            THEN ROUND((total_unsubscribes::DECIMAL / total_delivered) * 100, 2)
            ELSE 0 END,
        spam_rate = CASE WHEN total_delivered > 0
            THEN ROUND((total_spam_reports::DECIMAL / total_delivered) * 100, 2)
            ELSE 0 END,
        updated_at = NOW()
    WHERE email_id = p_email_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- VIEWS
-- ===========================================

-- Email engagement summary view
CREATE OR REPLACE VIEW email_engagement_summary AS
SELECT
    e.id as email_id,
    e.tenant_id,
    e.subject,
    e.recipient_email,
    e.status,
    e.sent_at,
    COALESCE(m.total_opens, 0) as total_opens,
    COALESCE(m.unique_opens, 0) as unique_opens,
    COALESCE(m.total_clicks, 0) as total_clicks,
    COALESCE(m.unique_clicks, 0) as unique_clicks,
    m.open_rate,
    m.click_rate,
    m.click_to_open_rate,
    m.first_open_at,
    m.last_open_at,
    m.first_click_at,
    m.last_click_at
FROM emails e
LEFT JOIN email_engagement_metrics m ON e.id = m.email_id;

-- ===========================================
-- CLEANUP
-- ===========================================

-- Cleanup expired tokens (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_tracking_tokens()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM email_tracking_tokens
    WHERE expires_at < NOW();

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
