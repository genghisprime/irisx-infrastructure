-- Migration 014: Phone Number Management System
-- Manages phone number inventory, assignments, and routing

-- =====================================================
-- PHONE NUMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS phone_numbers (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Number details
  phone_number VARCHAR(20) UNIQUE NOT NULL,  -- E.164 format: +15551234567
  friendly_name VARCHAR(100),
  country_code VARCHAR(3) DEFAULT 'US',  -- ISO 3166-1 alpha-2
  number_type VARCHAR(20) DEFAULT 'local',  -- local, toll_free, mobile, short_code

  -- Assignment
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  is_assigned BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMPTZ,

  -- Capabilities
  voice_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT TRUE,
  mms_enabled BOOLEAN DEFAULT FALSE,
  fax_enabled BOOLEAN DEFAULT FALSE,

  -- Routing configuration
  voice_url TEXT,  -- Webhook for inbound voice
  voice_fallback_url TEXT,
  sms_url TEXT,  -- Webhook for inbound SMS
  sms_fallback_url TEXT,
  status_callback_url TEXT,

  -- IVR assignment
  ivr_menu_id BIGINT REFERENCES ivr_menus(id) ON DELETE SET NULL,

  -- Queue assignment (for direct-to-queue routing)
  queue_id BIGINT REFERENCES queues(id) ON DELETE SET NULL,

  -- Provider info
  provider VARCHAR(50) DEFAULT 'twilio',  -- twilio, telnyx, bandwidth
  provider_number_sid VARCHAR(100),  -- Provider's number ID
  provider_account_sid VARCHAR(100),

  -- Pricing
  monthly_cost_cents INTEGER DEFAULT 100,  -- $1.00/mo default
  setup_cost_cents INTEGER DEFAULT 0,
  per_minute_cost_cents INTEGER DEFAULT 1,  -- $0.01/min

  -- Status
  status VARCHAR(50) DEFAULT 'active',  -- active, suspended, cancelled, porting
  is_ported BOOLEAN DEFAULT FALSE,
  ported_at TIMESTAMPTZ,

  -- Compliance
  emergency_address_id BIGINT,  -- For E911 registration
  cnam_listing_enabled BOOLEAN DEFAULT FALSE,  -- Caller ID name display

  -- Audit
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_tenant_id ON phone_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_is_assigned ON phone_numbers(is_assigned);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_provider ON phone_numbers(provider);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_country_code ON phone_numbers(country_code);

-- =====================================================
-- PHONE NUMBER SEARCH INVENTORY (Available for purchase)
-- =====================================================
CREATE TABLE IF NOT EXISTS phone_number_inventory (
  id BIGSERIAL PRIMARY KEY,

  phone_number VARCHAR(20) UNIQUE NOT NULL,
  friendly_name VARCHAR(100),
  country_code VARCHAR(3) DEFAULT 'US',
  region VARCHAR(100),  -- State/Province
  city VARCHAR(100),
  lata VARCHAR(10),
  rate_center VARCHAR(100),

  -- Capabilities
  voice_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT TRUE,
  mms_enabled BOOLEAN DEFAULT FALSE,

  -- Provider
  provider VARCHAR(50) DEFAULT 'twilio',
  provider_number_sid VARCHAR(100),

  -- Pricing
  monthly_cost_cents INTEGER DEFAULT 100,
  setup_cost_cents INTEGER DEFAULT 0,

  -- Status
  is_available BOOLEAN DEFAULT TRUE,
  reserved_until TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_number_inventory_country_code ON phone_number_inventory(country_code);
CREATE INDEX IF NOT EXISTS idx_phone_number_inventory_region ON phone_number_inventory(region);
CREATE INDEX IF NOT EXISTS idx_phone_number_inventory_is_available ON phone_number_inventory(is_available);

-- =====================================================
-- EMERGENCY ADDRESSES (E911)
-- =====================================================
CREATE TABLE IF NOT EXISTS emergency_addresses (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Address details
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state_province VARCHAR(50) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  country_code VARCHAR(3) DEFAULT 'US',

  -- Emergency contact
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),

  -- Validation
  is_validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validation_provider VARCHAR(50),  -- twilio, loa, manual

  -- Provider reference
  provider VARCHAR(50) DEFAULT 'twilio',
  provider_address_sid VARCHAR(100),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_addresses_tenant_id ON emergency_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emergency_addresses_is_validated ON emergency_addresses(is_validated);

-- =====================================================
-- PHONE NUMBER USAGE TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS phone_number_usage (
  id BIGSERIAL PRIMARY KEY,

  phone_number_id BIGINT NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Call metrics
  inbound_calls_count INTEGER DEFAULT 0,
  outbound_calls_count INTEGER DEFAULT 0,
  inbound_minutes DECIMAL(12, 2) DEFAULT 0,
  outbound_minutes DECIMAL(12, 2) DEFAULT 0,

  -- SMS metrics
  inbound_sms_count INTEGER DEFAULT 0,
  outbound_sms_count INTEGER DEFAULT 0,
  inbound_mms_count INTEGER DEFAULT 0,
  outbound_mms_count INTEGER DEFAULT 0,

  -- Costs
  call_cost_cents INTEGER DEFAULT 0,
  sms_cost_cents INTEGER DEFAULT 0,
  monthly_fee_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(phone_number_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_phone_number_usage_phone_number_id ON phone_number_usage(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_phone_number_usage_tenant_id ON phone_number_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_number_usage_date ON phone_number_usage(usage_date DESC);

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_phone_number_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phone_numbers_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_number_updated_at();

CREATE TRIGGER phone_number_inventory_updated_at
  BEFORE UPDATE ON phone_number_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_number_updated_at();

CREATE TRIGGER emergency_addresses_updated_at
  BEFORE UPDATE ON emergency_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_number_updated_at();

CREATE TRIGGER phone_number_usage_updated_at
  BEFORE UPDATE ON phone_number_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_number_updated_at();

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Phone numbers with usage stats
CREATE OR REPLACE VIEW phone_numbers_with_stats AS
SELECT
  pn.*,
  COALESCE(SUM(pnu.inbound_calls_count + pnu.outbound_calls_count), 0) as total_calls_30d,
  COALESCE(SUM(pnu.inbound_minutes + pnu.outbound_minutes), 0) as total_minutes_30d,
  COALESCE(SUM(pnu.inbound_sms_count + pnu.outbound_sms_count), 0) as total_sms_30d,
  COALESCE(SUM(pnu.total_cost_cents), 0) as total_cost_cents_30d
FROM phone_numbers pn
LEFT JOIN phone_number_usage pnu ON pn.id = pnu.phone_number_id
  AND pnu.usage_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY pn.id;

-- =====================================================
-- INSERT SAMPLE PHONE NUMBERS FOR TESTING
-- =====================================================
-- Insert a test phone number assigned to tenant 1
INSERT INTO phone_numbers (
  phone_number, friendly_name, country_code, number_type,
  tenant_id, is_assigned, assigned_at,
  voice_enabled, sms_enabled, mms_enabled,
  provider, status, monthly_cost_cents
) VALUES (
  '+15551234567', 'Test Number (US)', 'US', 'local',
  1, TRUE, NOW(),
  TRUE, TRUE, FALSE,
  'twilio', 'active', 100
) ON CONFLICT (phone_number) DO NOTHING;

-- Insert sample available numbers in inventory
INSERT INTO phone_number_inventory (
  phone_number, friendly_name, country_code, region, city,
  voice_enabled, sms_enabled, mms_enabled,
  provider, is_available, monthly_cost_cents
) VALUES
  ('+15559876543', 'New York Local', 'US', 'NY', 'New York', TRUE, TRUE, TRUE, 'twilio', TRUE, 100),
  ('+15559876544', 'Los Angeles Local', 'US', 'CA', 'Los Angeles', TRUE, TRUE, TRUE, 'twilio', TRUE, 100),
  ('+18005551234', 'Toll-Free', 'US', 'US', 'National', TRUE, TRUE, FALSE, 'twilio', TRUE, 200)
ON CONFLICT (phone_number) DO NOTHING;

COMMIT;
