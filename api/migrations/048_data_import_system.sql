-- Data Import System
-- API-first contact import with AI field mapping, duplicate detection, and webhooks
-- Supports CSV, Excel, JSON bulk imports, and Google Sheets integration

-- Import jobs table - tracks all import operations (file or API-based)
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Source information
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('csv', 'excel', 'json', 'google_sheets', 'api')),
  filename TEXT, -- null for API/JSON imports
  file_size BIGINT, -- bytes
  file_path TEXT, -- local temp file path for processing
  file_url TEXT, -- S3 URL if file uploaded
  original_headers TEXT[], -- original column headers from uploaded file

  -- Import configuration
  target_list_id INTEGER REFERENCES contact_lists(id), -- which list to import into
  field_mapping JSONB NOT NULL, -- {"csv_column": "db_field"} or auto-detected
  duplicate_strategy VARCHAR(20) DEFAULT 'skip' CHECK (duplicate_strategy IN ('skip', 'update', 'create_new')),
  duplicate_match_fields TEXT[] DEFAULT ARRAY['email', 'phone'], -- which fields to check for duplicates

  -- AI field mapping
  ai_mapping_used BOOLEAN DEFAULT false,
  ai_mapping_confidence DECIMAL(5, 2), -- percentage 0-100
  ai_suggestions JSONB, -- AI suggested mappings for review

  -- Progress tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'pending_mapping', 'analyzing', 'mapping', 'processing', 'completed', 'failed', 'cancelled')),
  progress_percent INTEGER DEFAULT 0,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,

  -- Data preview
  preview_data JSONB, -- first 10 rows for UI preview
  raw_headers TEXT[], -- column headers from file

  -- Error handling
  error_details JSONB, -- array of {row: 5, error: "Invalid email", data: {...}}
  error_file_url TEXT, -- S3 URL to downloadable error CSV

  -- Webhook integration for API customers
  webhook_url TEXT, -- callback URL when import completes
  webhook_events TEXT[] DEFAULT ARRAY['completed', 'failed'], -- which events to send
  webhook_attempted_at TIMESTAMPTZ,
  webhook_success BOOLEAN,

  -- API access
  api_key_id UUID, -- which API key was used (for API imports)
  external_id TEXT, -- customer's reference ID

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Metadata
  import_options JSONB, -- additional options: {validate_emails: true, skip_invalid: false, etc}
  created_by INT REFERENCES users(id), -- user who initiated import
  notes TEXT
);

-- Import field mappings - reusable mapping templates
CREATE TABLE import_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Template info
  name VARCHAR(255) NOT NULL, -- "Salesforce Export", "My CRM Format"
  description TEXT,

  -- Mapping configuration
  source_type VARCHAR(50), -- csv, excel, json
  field_mapping JSONB NOT NULL, -- {"First Name": "first_name", "Email Address": "email"}
  is_default BOOLEAN DEFAULT false, -- use this mapping by default

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INT REFERENCES users(id),

  UNIQUE (tenant_id, name)
);

-- Import errors - detailed error log for debugging
CREATE TABLE import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,

  -- Error details
  row_number INTEGER,
  error_type VARCHAR(50), -- validation_error, duplicate, parsing_error, etc
  error_message TEXT NOT NULL,
  field_name VARCHAR(255), -- which field caused the error

  -- Data snapshot
  row_data JSONB, -- the data that failed to import

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_import_jobs_tenant_id ON import_jobs(tenant_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
CREATE INDEX idx_import_jobs_created_at ON import_jobs(created_at DESC);
CREATE INDEX idx_import_jobs_api_key_id ON import_jobs(api_key_id);
CREATE INDEX idx_import_jobs_external_id ON import_jobs(external_id);
CREATE INDEX idx_import_field_mappings_tenant_id ON import_field_mappings(tenant_id);
CREATE INDEX idx_import_field_mappings_is_default ON import_field_mappings(is_default);
CREATE INDEX idx_import_errors_import_job_id ON import_errors(import_job_id);

-- Comments for API documentation
COMMENT ON TABLE import_jobs IS 'Tracks all contact import operations via file upload or API';
COMMENT ON COLUMN import_jobs.source_type IS 'csv, excel, json (API), google_sheets, or api (bulk)';
COMMENT ON COLUMN import_jobs.duplicate_strategy IS 'skip (ignore duplicates), update (overwrite existing), create_new (allow duplicates)';
COMMENT ON COLUMN import_jobs.webhook_url IS 'Customer webhook URL for import completion notifications';
COMMENT ON COLUMN import_jobs.external_id IS 'Customer reference ID for tracking imports in their system';
COMMENT ON COLUMN import_jobs.ai_mapping_used IS 'Whether GPT-4 was used to auto-detect field mappings';

COMMENT ON TABLE import_field_mappings IS 'Reusable field mapping templates for repeat imports';
COMMENT ON TABLE import_errors IS 'Detailed error log for failed import rows';
