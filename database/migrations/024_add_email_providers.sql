-- Migration 024: Add Email Providers (Elastic Email + SendGrid)
-- Purpose: Configure multi-provider email with least-cost routing
-- Date: January 2025

-- ============================================
-- INSERT EMAIL PROVIDERS
-- ============================================

-- ELASTIC EMAIL (Priority 1 - Lowest Cost)
INSERT INTO messaging_providers (
  name,
  type,
  provider,
  status,
  priority,
  weight,
  health_score,

  -- API Configuration
  api_key,
  api_endpoint,
  from_email,
  from_name,

  -- Pricing
  email_rate_per_1000,
  email_rate_attachment,

  -- Limits
  daily_limit,
  rate_limit_per_second,
  max_recipients_per_message,

  -- Features
  supports_attachments,
  supports_templates,
  supports_tracking,
  supports_scheduling,

  -- Metadata
  notes
) VALUES (
  'Elastic Email Primary',
  'email',
  'elastic-email',
  'disabled', -- Set to 'active' when you have real API key
  1, -- Highest priority
  100, -- Full weight
  100, -- Perfect health initially

  -- API Configuration
  'YOUR_ELASTIC_EMAIL_API_KEY_HERE', -- REPLACE WITH REAL API KEY
  'https://api.elasticemail.com/v2',
  'noreply@irisx.com', -- REPLACE WITH YOUR FROM EMAIL
  'IRISX',

  -- Pricing
  0.09, -- $0.09 per 1000 emails
  0.00, -- No attachment fees

  -- Limits
  100000, -- 100k daily limit
  10, -- 10 emails per second
  1, -- 1 recipient per message

  -- Features
  true, -- Supports attachments
  true, -- Supports templates
  true, -- Supports tracking
  false, -- No scheduling

  -- Metadata
  'Elastic Email - Primary email provider. Lowest cost at $0.09/1000. Set status to active and add real API key to enable.'
)
ON CONFLICT (name, type) DO UPDATE SET
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  api_endpoint = EXCLUDED.api_endpoint,
  from_email = EXCLUDED.from_email,
  from_name = EXCLUDED.from_name,
  email_rate_per_1000 = EXCLUDED.email_rate_per_1000,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- SENDGRID (Priority 2 - Backup Provider)
INSERT INTO messaging_providers (
  name,
  type,
  provider,
  status,
  priority,
  weight,
  health_score,

  -- API Configuration
  api_key,
  api_endpoint,
  from_email,
  from_name,

  -- Pricing
  email_rate_per_1000,
  email_rate_attachment,

  -- Limits
  daily_limit,
  rate_limit_per_second,
  max_recipients_per_message,

  -- Features
  supports_attachments,
  supports_templates,
  supports_tracking,
  supports_scheduling,

  -- Metadata
  notes
) VALUES (
  'SendGrid Backup',
  'email',
  'sendgrid',
  'disabled', -- Set to 'active' when you have real API key
  2, -- Second priority (backup)
  100, -- Full weight
  100, -- Perfect health initially

  -- API Configuration
  'YOUR_SENDGRID_API_KEY_HERE', -- REPLACE WITH REAL API KEY
  'https://api.sendgrid.com/v3',
  'noreply@irisx.com', -- REPLACE WITH YOUR FROM EMAIL
  'IRISX',

  -- Pricing
  0.10, -- $0.10 per 1000 emails (slightly more expensive)
  0.00, -- No attachment fees

  -- Limits
  100000, -- 100k daily limit
  10, -- 10 emails per second
  1000, -- Supports bulk sending

  -- Features
  true, -- Supports attachments
  true, -- Supports templates
  true, -- Supports tracking
  true, -- Supports scheduling

  -- Metadata
  'SendGrid - Backup email provider via Twilio. $0.10/1000. Set status to active and add real API key to enable.'
)
ON CONFLICT (name, type) DO UPDATE SET
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  api_endpoint = EXCLUDED.api_endpoint,
  from_email = EXCLUDED.from_email,
  from_name = EXCLUDED.from_name,
  email_rate_per_1000 = EXCLUDED.email_rate_per_1000,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- CUSTOM SMTP (Priority 3 - Future Self-Hosted)
INSERT INTO messaging_providers (
  name,
  type,
  provider,
  status,
  priority,
  weight,
  health_score,

  -- API Configuration (stored in metadata for SMTP)
  api_key, -- Used as placeholder, actual config in metadata
  from_email,
  from_name,

  -- Pricing
  email_rate_per_1000,
  email_rate_attachment,

  -- Limits
  daily_limit,
  rate_limit_per_second,
  max_recipients_per_message,

  -- Features
  supports_attachments,
  supports_templates,
  supports_tracking,
  supports_scheduling,

  -- Metadata (SMTP configuration stored here)
  metadata,
  notes
) VALUES (
  'Custom SMTP Server',
  'email',
  'custom-smtp',
  'disabled', -- Will be enabled when self-hosted server is ready
  3, -- Lowest priority initially, will increase as reputation builds
  0, -- Zero weight - not used yet
  100, -- Perfect health initially

  -- API Configuration
  'placeholder', -- SMTP doesn't use API key
  'noreply@irisx.com', -- REPLACE WITH YOUR FROM EMAIL
  'IRISX',

  -- Pricing
  0.00, -- Free (self-hosted)
  0.00, -- No fees

  -- Limits
  NULL, -- No daily limit (self-hosted)
  5, -- 5 emails per second initially
  1,

  -- Features
  true, -- Supports attachments
  false, -- No templates (basic SMTP)
  false, -- No tracking (basic SMTP)
  false, -- No scheduling

  -- Metadata
  jsonb_build_object(
    'smtp_host', 'smtp.example.com',
    'smtp_port', 587,
    'smtp_secure', false,
    'smtp_user', 'smtp_username',
    'smtp_password', 'smtp_password'
  ),
  'Custom SMTP Server - Future self-hosted email server. Will gradually build reputation and become primary provider. Currently disabled.'
)
ON CONFLICT (name, type) DO UPDATE SET
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  from_email = EXCLUDED.from_email,
  from_name = EXCLUDED.from_name,
  email_rate_per_1000 = EXCLUDED.email_rate_per_1000,
  metadata = EXCLUDED.metadata,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- ============================================
-- VERIFICATION
-- ============================================

-- Show inserted providers
SELECT
  id,
  name,
  provider,
  status,
  priority,
  health_score,
  email_rate_per_1000,
  from_email,
  notes
FROM messaging_providers
WHERE type = 'email'
ORDER BY priority ASC;

-- ============================================
-- POST-MIGRATION INSTRUCTIONS
-- ============================================

/*

IMPORTANT: After running this migration, you MUST:

1. Update Elastic Email API Key:
   UPDATE messaging_providers
   SET api_key = 'your_real_elastic_email_api_key',
       status = 'active'
   WHERE name = 'Elastic Email Primary';

2. Update SendGrid API Key:
   UPDATE messaging_providers
   SET api_key = 'your_real_sendgrid_api_key',
       status = 'active'
   WHERE name = 'SendGrid Backup';

3. Update FROM email addresses:
   UPDATE messaging_providers
   SET from_email = 'your_verified_sender@yourdomain.com'
   WHERE type = 'email';

4. Test provider connections:
   -- Use the API endpoint: POST /admin/providers/:id/test
   -- Or use email service testProviderConnection() function

5. Verify LCR is working:
   -- Send a test email: POST /v1/emails/test
   -- Check message_routing_logs table to see which provider was selected
   -- Verify Elastic Email is selected first (lowest cost + highest priority)

6. Monitor health scores:
   -- Check messaging_provider_performance view
   -- Ensure health scores update after email deliveries

7. Custom SMTP (Future):
   -- When ready to deploy self-hosted email server:
   -- Update metadata with real SMTP configuration
   -- Set status to 'testing' first
   -- Gradually increase priority as reputation builds
   -- Eventually make it priority 1 (free self-hosted)

*/
