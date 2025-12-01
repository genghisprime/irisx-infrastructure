-- Migration: Create SIP Trunks Table
-- Description: Infrastructure-level SIP trunk management for IRISX platform
-- Date: 2025-11-09

-- Table: sip_trunks
-- Stores configuration for SIP trunk providers (Twilio, Bandwidth, Telnyx, etc.)
-- These are infrastructure-level trunks used by the platform, not tenant-specific

CREATE TABLE IF NOT EXISTS sip_trunks (
  id SERIAL PRIMARY KEY,

  -- Association (nullable for shared/global infrastructure trunks)
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,

  -- Provider Information
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- twilio, bandwidth, telnyx, etc.
  description TEXT,

  -- SIP Configuration
  sip_uri VARCHAR(255) NOT NULL, -- techradiumfs.pstn.twilio.com
  username VARCHAR(100),
  password VARCHAR(255), -- Encrypted in production

  -- Capacity
  max_channels INTEGER NOT NULL DEFAULT 50,
  active_channels INTEGER NOT NULL DEFAULT 0,

  -- Codec Priority
  codec VARCHAR(100) DEFAULT 'PCMU,PCMA,G729',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'inactive', -- inactive, registered, unregistered, failed

  -- FreeSWITCH Integration
  freeswitch_gateway_name VARCHAR(50), -- Gateway name in FreeSWITCH (e.g., 'twilio')
  freeswitch_profile VARCHAR(50) DEFAULT 'external', -- SIP profile (internal, external)

  -- Phone Numbers Associated
  phone_numbers TEXT[], -- Array of phone numbers provisioned on this trunk

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  last_used_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_sip_trunks_tenant ON sip_trunks(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sip_trunks_provider ON sip_trunks(provider) WHERE deleted_at IS NULL;
CREATE INDEX idx_sip_trunks_status ON sip_trunks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sip_trunks_deleted ON sip_trunks(deleted_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_sip_trunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sip_trunks_updated_at
  BEFORE UPDATE ON sip_trunks
  FOR EACH ROW
  EXECUTE FUNCTION update_sip_trunks_updated_at();

-- Insert existing Twilio trunk from FreeSWITCH
INSERT INTO sip_trunks (
  tenant_id,
  name,
  provider,
  description,
  sip_uri,
  username,
  password,
  max_channels,
  active_channels,
  codec,
  status,
  freeswitch_gateway_name,
  freeswitch_profile,
  phone_numbers,
  created_at
) VALUES (
  NULL, -- Global infrastructure trunk
  'FreeSWITCH-IRISX',
  'Twilio',
  'Primary Twilio SIP trunk for IRISX platform telephony',
  'techradiumfs.pstn.twilio.com',
  NULL, -- IP-based auth (no username)
  NULL, -- IP-based auth (no password)
  50,
  0,
  'PCMU,PCMA,G729',
  'registered',
  'twilio',
  'external',
  ARRAY['+18326378414'], -- Phone number provisioned on this trunk
  NOW()
) ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE sip_trunks IS 'Infrastructure-level SIP trunk providers for platform telephony';
COMMENT ON COLUMN sip_trunks.tenant_id IS 'NULL for shared infrastructure trunks, or tenant ID for dedicated trunks';
COMMENT ON COLUMN sip_trunks.provider IS 'SIP trunk provider: twilio, bandwidth, telnyx, etc.';
COMMENT ON COLUMN sip_trunks.freeswitch_gateway_name IS 'Gateway name in FreeSWITCH configuration files';
COMMENT ON COLUMN sip_trunks.phone_numbers IS 'Array of phone numbers provisioned on this trunk';
