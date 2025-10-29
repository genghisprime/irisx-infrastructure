-- Migration: Update Email Providers - Add Elastic Email as Primary
-- Date: October 29, 2025

-- Clear existing providers
DELETE FROM email_providers;

-- Insert email providers with Elastic Email as primary
INSERT INTO email_providers (provider_name, capabilities, is_active) VALUES
  -- Elastic Email as PRIMARY (best pricing)
  ('elasticemail', '{"transactional": true, "marketing": true, "webhooks": true, "pricing": "0.09 per 1000 emails"}'::jsonb, true),

  -- SendGrid (popular, good for high volume)
  ('sendgrid', '{"transactional": true, "marketing": true, "webhooks": true, "pricing": "19.95/mo for 50k"}'::jsonb, true),

  -- AWS SES (cheap, AWS integration)
  ('aws_ses', '{"transactional": true, "marketing": false, "webhooks": true, "pricing": "0.10 per 1000 emails"}'::jsonb, true),

  -- Postmark (transactional focus, excellent delivery)
  ('postmark', '{"transactional": true, "marketing": false, "webhooks": true, "pricing": "1.25 per 1000 emails"}'::jsonb, true),

  -- Mailgun (flexible, good API)
  ('mailgun', '{"transactional": true, "marketing": true, "webhooks": true, "pricing": "8/mo for 5k"}'::jsonb, true),

  -- Resend (modern, developer-friendly)
  ('resend', '{"transactional": true, "marketing": false, "webhooks": true, "pricing": "20/mo for 50k"}'::jsonb, true);

-- Add is_default column to track default provider
ALTER TABLE tenant_email_config ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT true;

-- Add priority column for fallback ordering
ALTER TABLE email_providers ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- Set priorities (lower = higher priority)
UPDATE email_providers SET priority = 1 WHERE provider_name = 'elasticemail';
UPDATE email_providers SET priority = 2 WHERE provider_name = 'sendgrid';
UPDATE email_providers SET priority = 3 WHERE provider_name = 'aws_ses';
UPDATE email_providers SET priority = 4 WHERE provider_name = 'postmark';
UPDATE email_providers SET priority = 5 WHERE provider_name = 'mailgun';
UPDATE email_providers SET priority = 6 WHERE provider_name = 'resend';

-- Add index on priority
CREATE INDEX IF NOT EXISTS idx_email_providers_priority ON email_providers(priority);

COMMENT ON COLUMN email_providers.priority IS 'Lower number = higher priority for provider selection';
COMMENT ON COLUMN tenant_email_config.is_default IS 'Whether this is the default email config for the tenant';
