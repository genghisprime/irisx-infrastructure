-- Migration: Add DNC (Do Not Call/Contact) columns and audit table
-- Based on: IRIS_Compliance_Legal_Guide.md

-- Add DNC-related columns to contacts table if they don't exist
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_reason TEXT,
  ADD COLUMN IF NOT EXISTS dnc_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dnc_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dnc_removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dnc_removal_reason TEXT;

-- Create index for faster DNC lookups
CREATE INDEX IF NOT EXISTS idx_contacts_dnc ON contacts(tenant_id, phone)
  WHERE status = 'dnc' OR do_not_contact = true;

-- Create DNC audit log table for compliance tracking
CREATE TABLE IF NOT EXISTS dnc_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  phone_number VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'remove', 'check', 'violation')),
  reason TEXT,
  source VARCHAR(50), -- 'manual', 'user_request', 'complaint', 'legal', 'api', 'campaign'
  blocked_channel VARCHAR(20), -- 'sms', 'call', 'email'
  blocked_by VARCHAR(100), -- Service/endpoint that blocked the communication
  user_id INTEGER, -- Admin user who made the change (if applicable)
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_dnc_audit_tenant ON dnc_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dnc_audit_phone ON dnc_audit_log(phone_number, created_at DESC);

-- Comment for documentation
COMMENT ON TABLE dnc_audit_log IS 'Audit trail for DNC list changes - required for TCPA compliance';
COMMENT ON COLUMN dnc_audit_log.action IS 'add=added to DNC, remove=removed from DNC, check=DNC check performed, violation=attempted communication blocked';
COMMENT ON COLUMN dnc_audit_log.source IS 'How the number was added: manual, user_request, complaint, legal, api, campaign';
