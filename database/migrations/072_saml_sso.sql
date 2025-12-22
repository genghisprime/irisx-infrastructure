-- Migration: 072_saml_sso.sql
-- Description: SAML 2.0 SSO tables for enterprise authentication
-- Date: 2025-12-16

-- SAML configuration per tenant
CREATE TABLE IF NOT EXISTS tenant_saml_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    idp_entity_id VARCHAR(500) NOT NULL,
    idp_sso_url VARCHAR(1000) NOT NULL,
    idp_slo_url VARCHAR(1000),
    idp_certificate TEXT NOT NULL,
    email_domains JSONB DEFAULT '[]'::jsonb,
    attribute_mapping JSONB DEFAULT '{}'::jsonb,
    name_id_format VARCHAR(200) DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    sign_requests BOOLEAN DEFAULT true,
    want_assertions_signed BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- SAML request IDs for replay attack prevention
CREATE TABLE IF NOT EXISTS saml_request_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL,
    tenant_id UUID REFERENCES tenants(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SAML sessions for SLO (Single Logout)
CREATE TABLE IF NOT EXISTS saml_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_id UUID REFERENCES tenants(id),
    name_id VARCHAR(500) NOT NULL,
    session_index VARCHAR(500),
    idp_entity_id VARCHAR(500),
    login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    logged_out_at TIMESTAMP WITH TIME ZONE
);

-- SAML audit log
CREATE TABLE IF NOT EXISTS saml_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    event_type VARCHAR(50) NOT NULL, -- login_success, login_failure, logout, config_change
    user_email VARCHAR(255),
    name_id VARCHAR(500),
    idp_entity_id VARCHAR(500),
    request_id VARCHAR(100),
    response_id VARCHAR(100),
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_saml_config_tenant ON tenant_saml_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_saml_config_active ON tenant_saml_config(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_saml_request_ids_lookup ON saml_request_ids(request_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_saml_request_ids_expires ON saml_request_ids(expires_at);

CREATE INDEX IF NOT EXISTS idx_saml_sessions_user ON saml_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_saml_sessions_tenant ON saml_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saml_sessions_name_id ON saml_sessions(name_id);

CREATE INDEX IF NOT EXISTS idx_saml_audit_tenant ON saml_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saml_audit_created ON saml_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saml_audit_event ON saml_audit_log(event_type);

-- Function to clean up expired SAML request IDs
CREATE OR REPLACE FUNCTION cleanup_expired_saml_requests()
RETURNS void AS $$
BEGIN
  DELETE FROM saml_request_ids WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old SAML sessions
CREATE OR REPLACE FUNCTION cleanup_old_saml_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM saml_sessions
  WHERE (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '7 days')
     OR (logged_out_at IS NOT NULL AND logged_out_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE tenant_saml_config IS 'SAML 2.0 IdP configuration per tenant for enterprise SSO';
COMMENT ON TABLE saml_request_ids IS 'Temporary storage for SAML AuthnRequest IDs to prevent replay attacks';
COMMENT ON TABLE saml_sessions IS 'Active SAML sessions for Single Logout support';
COMMENT ON TABLE saml_audit_log IS 'Audit trail for all SAML authentication events';
