/**
 * Migration 009: Contact Management System
 * Creates tables for contacts, lists, custom fields, and tags
 *
 * Features:
 * - Contact storage with standard fields (name, phone, email)
 * - Custom fields (extensible schema per tenant)
 * - Contact lists for segmentation
 * - Tags for flexible categorization
 * - Import tracking
 * - DNC (Do Not Call) / DND (Do Not Disturb) support
 */

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Standard Fields
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  phone_secondary VARCHAR(20),

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(2) DEFAULT 'US',

  -- Business Info
  company VARCHAR(255),
  title VARCHAR(100),

  -- Metadata
  custom_fields JSONB DEFAULT '{}'::jsonb,
  tags VARCHAR(255)[], -- Array of tags
  notes TEXT,

  -- Communication Preferences
  opt_in_sms BOOLEAN DEFAULT true,
  opt_in_email BOOLEAN DEFAULT true,
  opt_in_voice BOOLEAN DEFAULT true,
  dnc BOOLEAN DEFAULT false, -- Do Not Call

  -- Tracking
  source VARCHAR(100), -- 'import', 'api', 'webform', 'manual'
  import_id INTEGER, -- Reference to import batch
  last_contacted_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(tenant_id, phone),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_custom_fields ON contacts USING GIN(custom_fields);
CREATE INDEX idx_contacts_dnc ON contacts(tenant_id, dnc) WHERE dnc = true;

COMMENT ON TABLE contacts IS 'Customer/contact database for multi-channel campaigns';
COMMENT ON COLUMN contacts.custom_fields IS 'JSON object for tenant-specific custom fields';
COMMENT ON COLUMN contacts.tags IS 'Array of tag strings for flexible categorization';

-- ============================================================================
-- CONTACT LISTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_lists (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- List Type
  type VARCHAR(50) DEFAULT 'static', -- 'static', 'dynamic', 'smart'

  -- For Dynamic Lists (filter-based)
  filter_criteria JSONB, -- Stores query criteria for dynamic lists

  -- Metadata
  contact_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_contact_lists_tenant ON contact_lists(tenant_id);
CREATE INDEX idx_contact_lists_type ON contact_lists(type);

COMMENT ON TABLE contact_lists IS 'Contact list management for campaign targeting';
COMMENT ON COLUMN contact_lists.type IS 'static=manual, dynamic=filter-based, smart=AI-generated';

-- ============================================================================
-- CONTACT LIST MEMBERS (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_list_members (
  id SERIAL PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by INTEGER, -- User ID who added (future feature)

  UNIQUE(list_id, contact_id)
);

CREATE INDEX idx_contact_list_members_list ON contact_list_members(list_id);
CREATE INDEX idx_contact_list_members_contact ON contact_list_members(contact_id);

COMMENT ON TABLE contact_list_members IS 'Join table for contacts and lists (many-to-many)';

-- ============================================================================
-- CUSTOM FIELD DEFINITIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_custom_fields (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'date', 'boolean', 'select'
  field_options JSONB, -- For 'select' type: ["option1", "option2"]
  required BOOLEAN DEFAULT false,
  default_value TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, field_name)
);

CREATE INDEX idx_contact_custom_fields_tenant ON contact_custom_fields(tenant_id);

COMMENT ON TABLE contact_custom_fields IS 'Defines custom field schema per tenant';

-- ============================================================================
-- IMPORT BATCHES (Track bulk imports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_imports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename VARCHAR(255),
  source VARCHAR(100), -- 'csv', 'excel', 'api', 'zapier'

  -- Stats
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  error_log JSONB, -- Array of error messages

  -- Mapping (CSV column -> contact field)
  field_mapping JSONB,

  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_contact_imports_tenant ON contact_imports(tenant_id);
CREATE INDEX idx_contact_imports_status ON contact_imports(status);

COMMENT ON TABLE contact_imports IS 'Tracks CSV/Excel import batches and stats';

-- ============================================================================
-- CONTACT ACTIVITY LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_activity (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Activity Details
  activity_type VARCHAR(50) NOT NULL, -- 'call', 'sms', 'email', 'note', 'tag_added', 'list_added'
  activity_data JSONB,

  -- Related Records
  call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
  sms_id INTEGER REFERENCES sms_messages(id) ON DELETE SET NULL,
  email_id INTEGER REFERENCES emails(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contact_activity_contact ON contact_activity(contact_id);
CREATE INDEX idx_contact_activity_tenant ON contact_activity(tenant_id);
CREATE INDEX idx_contact_activity_type ON contact_activity(activity_type);
CREATE INDEX idx_contact_activity_created ON contact_activity(created_at DESC);

COMMENT ON TABLE contact_activity IS 'Timeline of all contact interactions across channels';

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Update contact updated_at timestamp
CREATE OR REPLACE FUNCTION update_contact_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contact_timestamp
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_contact_timestamp();

-- Update contact_lists updated_at timestamp
CREATE TRIGGER trigger_update_contact_list_timestamp
BEFORE UPDATE ON contact_lists
FOR EACH ROW
EXECUTE FUNCTION update_contact_timestamp();

-- Update list contact_count when members change
CREATE OR REPLACE FUNCTION update_list_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE contact_lists SET contact_count = contact_count + 1 WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE contact_lists SET contact_count = contact_count - 1 WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_list_count_insert
AFTER INSERT ON contact_list_members
FOR EACH ROW
EXECUTE FUNCTION update_list_count();

CREATE TRIGGER trigger_update_list_count_delete
AFTER DELETE ON contact_list_members
FOR EACH ROW
EXECUTE FUNCTION update_list_count();

-- ============================================================================
-- SAMPLE DATA (Optional - for development/testing)
-- ============================================================================

-- Uncomment to insert sample custom fields for tenant 1
/*
INSERT INTO contact_custom_fields (tenant_id, field_name, field_label, field_type, display_order)
VALUES
  (1, 'customer_id', 'Customer ID', 'text', 1),
  (1, 'account_value', 'Account Value', 'number', 2),
  (1, 'signup_date', 'Signup Date', 'date', 3),
  (1, 'is_vip', 'VIP Customer', 'boolean', 4),
  (1, 'preferred_contact', 'Preferred Contact Method', 'select', 5);

UPDATE contact_custom_fields
SET field_options = '["Phone", "Email", "SMS"]'::jsonb
WHERE field_name = 'preferred_contact';
*/
