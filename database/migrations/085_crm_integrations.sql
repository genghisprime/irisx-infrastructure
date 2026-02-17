-- =====================================================
-- Migration: CRM Integrations
-- Description: Tables for CRM platform integrations
-- Supports: Salesforce, HubSpot, Zendesk, Intercom
-- Date: 2026-02-16
-- =====================================================

-- =====================================================
-- 1. CRM Connections (OAuth credentials per tenant)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_connections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- salesforce, hubspot, zendesk, intercom
  status VARCHAR(20) DEFAULT 'disconnected', -- disconnected, connected, error
  instance_url TEXT, -- Salesforce instance URL, Zendesk subdomain, etc.
  access_token TEXT, -- Encrypted OAuth access token
  refresh_token TEXT, -- Encrypted OAuth refresh token
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[], -- OAuth scopes granted
  metadata JSONB DEFAULT '{}', -- Provider-specific metadata
  connected_by INTEGER REFERENCES agents(id),
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX idx_crm_connections_tenant ON crm_connections(tenant_id);
CREATE INDEX idx_crm_connections_provider ON crm_connections(provider);
CREATE INDEX idx_crm_connections_status ON crm_connections(status);

-- =====================================================
-- 2. CRM Object Mappings (map IRISX fields to CRM fields)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  irisx_object VARCHAR(50) NOT NULL, -- contact, call, conversation, ticket
  crm_object VARCHAR(100) NOT NULL, -- Lead, Contact, Account, Case, etc.
  mapping_type VARCHAR(20) DEFAULT 'sync', -- sync, push_only, pull_only
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, irisx_object)
);

CREATE INDEX idx_field_mappings_connection ON crm_field_mappings(connection_id);

-- =====================================================
-- 3. CRM Field Mapping Details
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_field_mapping_details (
  id SERIAL PRIMARY KEY,
  mapping_id INTEGER NOT NULL REFERENCES crm_field_mappings(id) ON DELETE CASCADE,
  irisx_field VARCHAR(100) NOT NULL,
  crm_field VARCHAR(100) NOT NULL,
  direction VARCHAR(20) DEFAULT 'bidirectional', -- bidirectional, to_crm, from_crm
  transform_function VARCHAR(100), -- Optional transformation
  default_value TEXT,
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mapping_details ON crm_field_mapping_details(mapping_id);

-- =====================================================
-- 4. CRM Sync Logs (track sync operations)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_sync_logs (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  sync_type VARCHAR(20) NOT NULL, -- full, incremental, push, pull
  direction VARCHAR(10) NOT NULL, -- inbound, outbound
  object_type VARCHAR(50) NOT NULL, -- contact, call, etc.
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_details JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'running', -- running, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_connection ON crm_sync_logs(connection_id);
CREATE INDEX idx_sync_logs_status ON crm_sync_logs(status);
CREATE INDEX idx_sync_logs_date ON crm_sync_logs(started_at);

-- =====================================================
-- 5. CRM Linked Records (track which IRISX records are linked to CRM)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_linked_records (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  irisx_object VARCHAR(50) NOT NULL,
  irisx_id VARCHAR(100) NOT NULL, -- ID in IRISX
  crm_object VARCHAR(100) NOT NULL,
  crm_id VARCHAR(100) NOT NULL, -- ID in CRM
  sync_status VARCHAR(20) DEFAULT 'synced', -- synced, pending, conflict, error
  last_synced_at TIMESTAMPTZ,
  irisx_updated_at TIMESTAMPTZ,
  crm_updated_at TIMESTAMPTZ,
  conflict_data JSONB, -- Data when conflict detected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, irisx_object, irisx_id)
);

CREATE INDEX idx_linked_records_connection ON crm_linked_records(connection_id);
CREATE INDEX idx_linked_records_irisx ON crm_linked_records(irisx_object, irisx_id);
CREATE INDEX idx_linked_records_crm ON crm_linked_records(crm_id);

-- =====================================================
-- 6. CRM Webhook Events (incoming webhooks from CRM)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_webhook_events (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  crm_object VARCHAR(100),
  crm_id VARCHAR(100),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_connection ON crm_webhook_events(connection_id);
CREATE INDEX idx_webhook_events_processed ON crm_webhook_events(processed) WHERE processed = false;

-- =====================================================
-- 7. CRM Automation Rules (auto-create tickets, log calls, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  trigger_event VARCHAR(50) NOT NULL, -- call_completed, conversation_closed, ticket_created
  action_type VARCHAR(50) NOT NULL, -- create_record, update_record, add_note
  target_object VARCHAR(100) NOT NULL, -- CRM object to create/update
  field_mappings JSONB DEFAULT '{}', -- Dynamic field mappings
  conditions JSONB DEFAULT '{}', -- Conditions for rule to fire
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_rules_connection ON crm_automation_rules(connection_id);
CREATE INDEX idx_automation_rules_trigger ON crm_automation_rules(trigger_event);

-- =====================================================
-- 8. CRM OAuth State (for OAuth flow)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_oauth_states (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  state_token VARCHAR(255) NOT NULL UNIQUE,
  redirect_uri TEXT,
  initiated_by INTEGER REFERENCES agents(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_states_token ON crm_oauth_states(state_token);
CREATE INDEX idx_oauth_states_expires ON crm_oauth_states(expires_at);

-- Clean up expired states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM crm_oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. Default Field Mappings Template
-- =====================================================

-- Store default mappings that can be used as templates
CREATE TABLE IF NOT EXISTS crm_mapping_templates (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  irisx_object VARCHAR(50) NOT NULL,
  crm_object VARCHAR(100) NOT NULL,
  field_mappings JSONB NOT NULL, -- Default field mappings
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default templates for common mappings
INSERT INTO crm_mapping_templates (provider, irisx_object, crm_object, field_mappings, description)
VALUES
-- Salesforce Contact
('salesforce', 'contact', 'Contact', '{
  "first_name": "FirstName",
  "last_name": "LastName",
  "email": "Email",
  "phone": "Phone",
  "mobile_phone": "MobilePhone",
  "company": "Account.Name",
  "title": "Title"
}', 'Default Salesforce Contact mapping'),

-- Salesforce Call Activity
('salesforce', 'call', 'Task', '{
  "call_id": "CallObject",
  "direction": "CallType",
  "duration_seconds": "CallDurationInSeconds",
  "agent_name": "Description",
  "caller_id": "Subject"
}', 'Default Salesforce Call Activity mapping'),

-- HubSpot Contact
('hubspot', 'contact', 'contact', '{
  "first_name": "firstname",
  "last_name": "lastname",
  "email": "email",
  "phone": "phone",
  "company": "company",
  "title": "jobtitle"
}', 'Default HubSpot Contact mapping'),

-- Zendesk Ticket
('zendesk', 'conversation', 'ticket', '{
  "subject": "subject",
  "description": "description",
  "contact_email": "requester.email",
  "priority": "priority",
  "status": "status"
}', 'Default Zendesk Ticket mapping')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Views
-- =====================================================

CREATE OR REPLACE VIEW crm_connection_summary AS
SELECT
  c.id,
  c.tenant_id,
  c.provider,
  c.status,
  c.instance_url,
  c.connected_at,
  c.last_sync_at,
  t.name as tenant_name,
  (SELECT COUNT(*) FROM crm_linked_records WHERE connection_id = c.id) as linked_records,
  (SELECT COUNT(*) FROM crm_sync_logs WHERE connection_id = c.id AND status = 'completed') as successful_syncs,
  (SELECT COUNT(*) FROM crm_sync_logs WHERE connection_id = c.id AND status = 'failed') as failed_syncs
FROM crm_connections c
JOIN tenants t ON c.tenant_id = t.id;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE crm_connections IS 'OAuth connections to CRM platforms';
COMMENT ON TABLE crm_field_mappings IS 'Object-level field mappings between IRISX and CRM';
COMMENT ON TABLE crm_linked_records IS 'Track which records are synced between systems';
COMMENT ON TABLE crm_sync_logs IS 'Audit log of all sync operations';
COMMENT ON TABLE crm_automation_rules IS 'Rules for automatically creating/updating CRM records';
