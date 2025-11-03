-- Migration 014: Customer Signup System
-- Enables self-service customer registration with email verification

-- Add email verification columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;

-- Add trial tracking columns to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signup_source VARCHAR(50) DEFAULT 'website';

-- Create public signups tracking table
CREATE TABLE IF NOT EXISTS public_signups (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  tenant_id INTEGER REFERENCES tenants(id),
  user_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, verified, activated
  verification_token VARCHAR(255) UNIQUE,
  signup_ip VARCHAR(50),
  utm_source VARCHAR(100),
  utm_campaign VARCHAR(100),
  utm_medium VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  UNIQUE(email)
);

-- Create indexes for public_signups
CREATE INDEX IF NOT EXISTS idx_public_signups_email ON public_signups(email);
CREATE INDEX IF NOT EXISTS idx_public_signups_status ON public_signups(status);
CREATE INDEX IF NOT EXISTS idx_public_signups_tenant ON public_signups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_public_signups_token ON public_signups(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token);

-- Create view for signup analytics
CREATE OR REPLACE VIEW signup_analytics AS
SELECT
  DATE(created_at) as signup_date,
  COUNT(*) as total_signups,
  COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_count,
  COUNT(CASE WHEN status = 'activated' THEN 1 END) as activated_count,
  COUNT(CASE WHEN status = 'pending' AND created_at < NOW() - INTERVAL '24 hours' THEN 1 END) as abandoned_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (verified_at - created_at)) / 60), 2) as avg_verification_time_minutes,
  utm_source,
  utm_campaign
FROM public_signups
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at), utm_source, utm_campaign
ORDER BY signup_date DESC;

-- Comment on tables
COMMENT ON TABLE public_signups IS 'Tracks all public signup attempts for analytics and verification';
COMMENT ON COLUMN users.email_verified IS 'Whether user has verified their email address';
COMMENT ON COLUMN users.email_verification_token IS 'Token sent via email for verification';
COMMENT ON COLUMN tenants.trial_ends_at IS 'When the 14-day free trial expires';
COMMENT ON COLUMN tenants.onboarding_completed IS 'Whether tenant has completed onboarding steps';
