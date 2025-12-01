-- Migration 024: Add Email Providers for LCR
-- Adds Elastic Email, SendGrid, and Custom SMTP providers to messaging_providers table
-- Schema: provider_type, provider_name, credentials_encrypted, credentials_iv, config, is_active

-- NOTE: Replace ENCRYPTION placeholders with actual encrypted credentials before running

-- Provider 1: Elastic Email (Priority 1 - Lowest Cost $0.09/1000)
INSERT INTO messaging_providers (
  tenant_id,
  provider_type,
  provider_name,
  credentials_encrypted,
  credentials_iv,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  NULL, -- Global provider (available to all tenants)
  'email',
  'elastic-email',
  'REPLACE_WITH_ENCRYPTED_ELASTIC_EMAIL_CREDENTIALS', -- Will be updated after insertion
  'REPLACE_WITH_ELASTIC_EMAIL_IV', -- Will be updated after insertion
  jsonb_build_object(
    'display_name', 'Elastic Email Primary',
    'priority', 1,
    'weight', 100,
    'health_score', 100,
    'email_rate_per_1000', 0.09,
    'daily_limit', 100000,
    'rate_limit_per_second', 10,
    'supports_attachments', true,
    'supports_templates', true,
    'supports_tracking', true,
    'api_endpoint', 'https://api.elasticemail.com/v2',
    'from_email', 'noreply@irisx.com',
    'from_name', 'IRISX',
    'notes', 'Elastic Email - Primary email provider. Lowest cost at $0.09/1000.'
  ),
  false -- Start disabled until credentials are added
);

-- Provider 2: SendGrid (Priority 2 - Backup Provider $0.10/1000)
INSERT INTO messaging_providers (
  tenant_id,
  provider_type,
  provider_name,
  credentials_encrypted,
  credentials_iv,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  NULL, -- Global provider (available to all tenants)
  'email',
  'sendgrid',
  'REPLACE_WITH_ENCRYPTED_SENDGRID_CREDENTIALS', -- Will be updated after insertion
  'REPLACE_WITH_SENDGRID_IV', -- Will be updated after insertion
  jsonb_build_object(
    'display_name', 'SendGrid Backup',
    'priority', 2,
    'weight', 100,
    'health_score', 100,
    'email_rate_per_1000', 0.10,
    'daily_limit', 100000,
    'rate_limit_per_second', 10,
    'supports_attachments', true,
    'supports_templates', true,
    'supports_tracking', true,
    'supports_scheduling', true,
    'api_endpoint', 'https://api.sendgrid.com/v3',
    'from_email', 'noreply@irisx.com',
    'from_name', 'IRISX',
    'notes', 'SendGrid - Backup email provider via Twilio. $0.10/1000.'
  ),
  false -- Start disabled until credentials are added
);

-- Provider 3: Custom SMTP (Priority 3 - Future Self-Hosted $0.00/1000)
INSERT INTO messaging_providers (
  tenant_id,
  provider_type,
  provider_name,
  credentials_encrypted,
  credentials_iv,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  NULL, -- Global provider (available to all tenants)
  'email',
  'custom-smtp',
  'REPLACE_WITH_ENCRYPTED_SMTP_CREDENTIALS', -- Will be updated after insertion
  'REPLACE_WITH_SMTP_IV', -- Will be updated after insertion
  jsonb_build_object(
    'display_name', 'Custom SMTP Server',
    'priority', 3,
    'weight', 100,
    'health_score', 100,
    'email_rate_per_1000', 0.00,
    'daily_limit', 1000000,
    'rate_limit_per_second', 100,
    'supports_attachments', true,
    'supports_templates', false,
    'supports_tracking', false,
    'smtp_host', 'mail.irisx.com',
    'smtp_port', 587,
    'smtp_secure', true,
    'from_email', 'noreply@irisx.com',
    'from_name', 'IRISX',
    'notes', 'Custom SMTP - Future self-hosted email server. No cost.'
  ),
  false -- Start disabled until configured
);

-- Print success message
DO $$
BEGIN
  RAISE NOTICE 'Email providers added successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Update credentials using encryption script';
  RAISE NOTICE '2. Set is_active = true for providers you want to use';
  RAISE NOTICE '3. Test email sending via POST /v1/emails/test';
END $$;
