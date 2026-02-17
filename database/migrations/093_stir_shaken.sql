-- STIR/SHAKEN Compliance Migration
-- Implements STIR (Secure Telephony Identity Revisited) and SHAKEN (Signature-based Handling of Asserted information using toKENs)
-- For caller ID authentication and anti-spoofing compliance

-- STIR/SHAKEN Certificates
CREATE TABLE IF NOT EXISTS stir_shaken_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    certificate_type VARCHAR(20) NOT NULL CHECK (certificate_type IN ('root', 'intermediate', 'end_entity')),
    common_name VARCHAR(255) NOT NULL,
    subject_dn VARCHAR(500),
    issuer_dn VARCHAR(500),
    serial_number VARCHAR(100),

    -- Certificate content (PEM encoded)
    public_certificate TEXT NOT NULL,
    private_key_encrypted TEXT, -- Encrypted with tenant-specific key
    certificate_chain TEXT, -- Full chain in PEM format

    -- Certificate metadata
    not_before TIMESTAMP WITH TIME ZONE NOT NULL,
    not_after TIMESTAMP WITH TIME ZONE NOT NULL,
    key_algorithm VARCHAR(50) DEFAULT 'ES256',
    key_size INTEGER DEFAULT 256,

    -- STI-CA information
    sti_ca_name VARCHAR(255), -- STI Certification Authority name
    sti_ca_url VARCHAR(500),
    acme_account_id VARCHAR(100),

    -- Status and management
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expiring', 'expired', 'revoked', 'failed')),
    is_primary BOOLEAN DEFAULT false,
    auto_renew BOOLEAN DEFAULT true,
    renewal_days_before INTEGER DEFAULT 30,

    -- Verification
    last_verified_at TIMESTAMP WITH TIME ZONE,
    verification_status VARCHAR(20) CHECK (verification_status IN ('pending', 'verified', 'failed')),
    verification_error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service Provider Codes (SPC) for STIR/SHAKEN
CREATE TABLE IF NOT EXISTS stir_shaken_spc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    certificate_id UUID REFERENCES stir_shaken_certificates(id) ON DELETE CASCADE,

    spc_token VARCHAR(10) NOT NULL, -- Service Provider Code (4-digit)
    ocn VARCHAR(10), -- Operating Company Number
    carrier_name VARCHAR(255),

    -- Verification with STI-PA
    sti_pa_verified BOOLEAN DEFAULT false,
    sti_pa_verification_date TIMESTAMP WITH TIME ZONE,
    sti_pa_token TEXT, -- Token from STI-PA

    -- Authorized numbers
    authorized_tn_ranges JSONB DEFAULT '[]', -- [{start: "1234567890", end: "1234567899"}]

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, spc_token)
);

-- Call Attestation Records
CREATE TABLE IF NOT EXISTS stir_shaken_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    call_id UUID, -- Reference to calls table

    -- Call identification
    orig_tn VARCHAR(20) NOT NULL, -- Originating telephone number
    dest_tn VARCHAR(20) NOT NULL, -- Destination telephone number
    call_direction VARCHAR(10) NOT NULL CHECK (call_direction IN ('inbound', 'outbound')),

    -- PASSporT token components
    passport_header JSONB, -- {"alg": "ES256", "ppt": "shaken", "typ": "passport", "x5u": "..."}
    passport_payload JSONB, -- {"attest": "A", "dest": {"tn": [...]}, "iat": ..., "orig": {"tn": "..."}, "origid": "..."}
    passport_signature TEXT, -- Base64 encoded signature
    full_identity_header TEXT, -- Complete Identity header value

    -- Attestation details
    attestation_level CHAR(1) NOT NULL CHECK (attestation_level IN ('A', 'B', 'C')),
    -- A: Full Attestation - SP is responsible for origination and has verified caller ID
    -- B: Partial Attestation - SP originated the call but cannot verify caller ID
    -- C: Gateway Attestation - SP received from another network, cannot verify

    orig_id UUID NOT NULL, -- Unique call origination ID
    certificate_id UUID REFERENCES stir_shaken_certificates(id),

    -- Verification (for inbound calls)
    verification_status VARCHAR(20) CHECK (verification_status IN ('pending', 'verified', 'failed', 'no_signature', 'expired', 'invalid_cert')),
    verification_error TEXT,
    verification_code VARCHAR(10), -- STIR verification code (e.g., "TN-Validation-Passed")
    verified_at TIMESTAMP WITH TIME ZONE,

    -- STI-VS (Verification Service) details
    sti_vs_provider VARCHAR(100),
    sti_vs_response JSONB,

    -- Robocall mitigation
    robocall_score INTEGER CHECK (robocall_score >= 0 AND robocall_score <= 100),
    spam_likelihood VARCHAR(20) CHECK (spam_likelihood IN ('low', 'medium', 'high', 'very_high')),
    analytics_insights JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Phone Number Authority Records (for attestation level determination)
CREATE TABLE IF NOT EXISTS stir_shaken_number_authority (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,

    -- Authority type
    authority_type VARCHAR(20) NOT NULL CHECK (authority_type IN ('owned', 'ported', 'allocated', 'delegated', 'toll_free')),

    -- Supporting documentation
    loa_document_url TEXT, -- Letter of Authorization
    loa_expiry_date DATE,
    carrier_verification JSONB, -- Carrier verification details

    -- For A-level attestation eligibility
    verified_owner BOOLEAN DEFAULT false,
    verification_method VARCHAR(50), -- 'carrier_api', 'loa_manual', 'port_confirmation', 'allocation_record'
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(100),

    -- Delegation chain (for delegated numbers)
    delegated_from UUID REFERENCES stir_shaken_number_authority(id),
    delegation_expiry TIMESTAMP WITH TIME ZONE,

    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, phone_number)
);

-- SHAKEN Verification Service Configuration
CREATE TABLE IF NOT EXISTS stir_shaken_verification_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    provider_name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('sti_vs', 'analytics', 'combined')),

    -- API Configuration
    api_endpoint VARCHAR(500) NOT NULL,
    api_key_encrypted TEXT,
    api_version VARCHAR(20),

    -- Features
    supports_realtime BOOLEAN DEFAULT true,
    supports_batch BOOLEAN DEFAULT false,
    supports_robocall_analytics BOOLEAN DEFAULT false,

    -- Performance
    avg_response_time_ms INTEGER,
    success_rate DECIMAL(5,2),
    last_health_check TIMESTAMP WITH TIME ZONE,

    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STI-PA (Policy Administrator) Integration
CREATE TABLE IF NOT EXISTS stir_shaken_sti_pa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- STI-PA Provider
    provider_name VARCHAR(100) NOT NULL,
    provider_url VARCHAR(500) NOT NULL,

    -- Certificate repository
    certificate_repository_url VARCHAR(500),
    crl_url VARCHAR(500), -- Certificate Revocation List
    ocsp_url VARCHAR(500), -- Online Certificate Status Protocol

    -- API access
    api_endpoint VARCHAR(500),
    api_credentials_encrypted TEXT,

    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Reports
CREATE TABLE IF NOT EXISTS stir_shaken_compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'on_demand', 'fcc_filing')),
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,

    -- Attestation statistics
    total_outbound_calls INTEGER DEFAULT 0,
    attestation_a_count INTEGER DEFAULT 0,
    attestation_b_count INTEGER DEFAULT 0,
    attestation_c_count INTEGER DEFAULT 0,
    no_attestation_count INTEGER DEFAULT 0,

    -- Verification statistics (inbound)
    total_inbound_calls INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    failed_verification_count INTEGER DEFAULT 0,
    no_signature_count INTEGER DEFAULT 0,

    -- Robocall analytics
    suspected_robocalls INTEGER DEFAULT 0,
    blocked_calls INTEGER DEFAULT 0,

    -- Certificate status
    certificates_active INTEGER DEFAULT 0,
    certificates_expiring INTEGER DEFAULT 0,

    -- Report content
    report_data JSONB,
    report_file_url TEXT,

    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    generated_by VARCHAR(100)
);

-- Audit trail for compliance
CREATE TABLE IF NOT EXISTS stir_shaken_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,

    -- Action details
    old_value JSONB,
    new_value JSONB,

    -- Actor
    performed_by VARCHAR(100),
    performed_by_type VARCHAR(20) CHECK (performed_by_type IN ('admin', 'system', 'api')),
    ip_address INET,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Robocall Mitigation Database
CREATE TABLE IF NOT EXISTS stir_shaken_robocall_database (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    phone_number VARCHAR(20) NOT NULL,

    -- Classification
    classification VARCHAR(30) NOT NULL CHECK (classification IN ('known_robocaller', 'suspected', 'legitimate', 'unknown')),
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),

    -- Source information
    report_source VARCHAR(50), -- 'fcc', 'ftc', 'carrier', 'user_report', 'analytics'
    first_reported_at TIMESTAMP WITH TIME ZONE,
    last_reported_at TIMESTAMP WITH TIME ZONE,
    report_count INTEGER DEFAULT 1,

    -- Details
    reported_name VARCHAR(255),
    reported_reason TEXT,

    -- Actions
    auto_block BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(phone_number)
);

-- Tenant STIR/SHAKEN Settings
CREATE TABLE IF NOT EXISTS tenant_stir_shaken_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- Enable/disable
    stir_shaken_enabled BOOLEAN DEFAULT true,
    signing_enabled BOOLEAN DEFAULT true,
    verification_enabled BOOLEAN DEFAULT true,

    -- Default attestation behavior
    default_attestation_level CHAR(1) DEFAULT 'B' CHECK (default_attestation_level IN ('A', 'B', 'C')),
    require_number_verification BOOLEAN DEFAULT true,

    -- Verification settings
    accept_unverified_calls BOOLEAN DEFAULT true,
    block_failed_verification BOOLEAN DEFAULT false,
    block_robocall_score_threshold INTEGER DEFAULT 80,

    -- Certificate preferences
    preferred_sti_ca VARCHAR(100),
    auto_renew_certificates BOOLEAN DEFAULT true,

    -- Reporting
    enable_compliance_reports BOOLEAN DEFAULT true,
    report_frequency VARCHAR(20) DEFAULT 'weekly',
    report_recipients JSONB DEFAULT '[]',

    -- Notification preferences
    notify_cert_expiry_days INTEGER DEFAULT 30,
    notify_verification_failures BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform-wide STIR/SHAKEN Configuration
CREATE TABLE IF NOT EXISTS platform_stir_shaken_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stir_shaken_certs_tenant ON stir_shaken_certificates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_certs_status ON stir_shaken_certificates(status);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_certs_expiry ON stir_shaken_certificates(not_after);

CREATE INDEX IF NOT EXISTS idx_stir_shaken_attestations_tenant ON stir_shaken_attestations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_attestations_call ON stir_shaken_attestations(call_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_attestations_orig ON stir_shaken_attestations(orig_tn);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_attestations_created ON stir_shaken_attestations(created_at);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_attestations_level ON stir_shaken_attestations(attestation_level);

CREATE INDEX IF NOT EXISTS idx_stir_shaken_number_auth_tenant ON stir_shaken_number_authority(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_number_auth_phone ON stir_shaken_number_authority(phone_number);

CREATE INDEX IF NOT EXISTS idx_stir_shaken_robocall_phone ON stir_shaken_robocall_database(phone_number);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_robocall_class ON stir_shaken_robocall_database(classification);

CREATE INDEX IF NOT EXISTS idx_stir_shaken_audit_tenant ON stir_shaken_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_audit_created ON stir_shaken_audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_stir_shaken_reports_tenant ON stir_shaken_compliance_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stir_shaken_reports_period ON stir_shaken_compliance_reports(report_period_start, report_period_end);

-- Insert default platform configuration
INSERT INTO platform_stir_shaken_config (config_key, config_value, description) VALUES
    ('sti_ca_providers', '[
        {"name": "Neustar", "url": "https://www.neustar.biz/", "acme_endpoint": "https://acme.neustar.biz/"},
        {"name": "TransNexus", "url": "https://transnexus.com/", "acme_endpoint": "https://acme.transnexus.com/"},
        {"name": "Peeringhub", "url": "https://www.peeringhub.io/", "acme_endpoint": "https://acme.peeringhub.io/"},
        {"name": "Sansay", "url": "https://www.sansay.com/", "acme_endpoint": "https://acme.sansay.com/"}
    ]', 'List of authorized STI Certification Authorities'),

    ('sti_pa_config', '{
        "provider": "STI-PA",
        "repository_url": "https://authenticate.iconectiv.com/",
        "crl_url": "https://authenticate.iconectiv.com/crl",
        "ocsp_url": "https://authenticate.iconectiv.com/ocsp"
    }', 'STI Policy Administrator configuration'),

    ('default_signing_algorithm', '{"algorithm": "ES256", "key_size": 256}', 'Default signing algorithm for PASSporT'),

    ('passport_ttl_seconds', '{"value": 60}', 'PASSporT token validity period'),

    ('verification_cache_ttl', '{"value": 3600}', 'Certificate cache TTL in seconds'),

    ('robocall_sources', '[
        {"name": "FCC Robocall Database", "url": "https://consumercomplaints.fcc.gov/"},
        {"name": "FTC Do Not Call", "url": "https://www.ftc.gov/"},
        {"name": "Call Analytics", "enabled": true}
    ]', 'Robocall mitigation data sources'),

    ('compliance_requirements', '{
        "fcc_mandate_date": "2021-06-30",
        "robocall_mitigation_required": true,
        "attestation_required_for_toll_free": true,
        "small_provider_exemption_threshold": 100000
    }', 'FCC compliance requirements')
ON CONFLICT (config_key) DO NOTHING;
