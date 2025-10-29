-- IRISX Database Migration #001
-- Create core tables for Phase 0-1
-- Run this on: irisx-prod-rds-postgres

-- ============================================
-- 1. TENANTS (Organizations/Customers)
-- ============================================

CREATE TABLE tenants (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  plan VARCHAR(50) NOT NULL DEFAULT 'trial',

  -- Billing
  stripe_customer_id VARCHAR(255),
  billing_email VARCHAR(255),

  -- Limits
  max_phone_numbers INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 5,
  max_concurrent_calls INTEGER DEFAULT 10,
  max_monthly_minutes INTEGER DEFAULT 1000,

  -- Usage tracking
  current_phone_numbers INTEGER DEFAULT 0,
  current_users INTEGER DEFAULT 0,
  current_monthly_minutes INTEGER DEFAULT 0,

  -- Metadata
  settings JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_stripe_customer_id ON tenants(stripe_customer_id);

-- ============================================
-- 2. USERS (Login accounts)
-- ============================================

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Authentication
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP WITH TIME ZONE,

  -- Profile
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  avatar_url TEXT,

  -- Role & Permissions
  role VARCHAR(50) NOT NULL DEFAULT 'agent',
  permissions JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP WITH TIME ZONE,

  -- Agent-specific
  agent_extension VARCHAR(20),
  agent_status VARCHAR(20) DEFAULT 'offline',

  -- Metadata
  settings JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_uuid ON users(uuid);
CREATE INDEX idx_users_role ON users(tenant_id, role);
CREATE INDEX idx_users_status ON users(status);

-- ============================================
-- 3. API KEYS (Programmatic access)
-- ============================================

CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Key details
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  key_hint VARCHAR(20) NOT NULL,

  -- Permissions
  scopes JSONB DEFAULT '[]',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Rate limiting
  rate_limit_rpm INTEGER DEFAULT 100,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(key_hash)
);

CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- ============================================
-- 4. PHONE NUMBERS (DID inventory)
-- ============================================

CREATE TABLE phone_numbers (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,

  -- Number details
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  country_code VARCHAR(3) NOT NULL,
  number_type VARCHAR(20) NOT NULL,

  -- Carrier
  carrier VARCHAR(50) NOT NULL DEFAULT 'twilio',
  carrier_sid VARCHAR(100),

  -- Capabilities
  sms_enabled BOOLEAN DEFAULT TRUE,
  voice_enabled BOOLEAN DEFAULT TRUE,
  mms_enabled BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Routing
  inbound_call_webhook_url TEXT,
  inbound_sms_webhook_url TEXT,
  fallback_webhook_url TEXT,

  -- Pricing
  monthly_cost_cents INTEGER DEFAULT 100,
  per_minute_cost_cents INTEGER DEFAULT 1,

  -- Metadata
  friendly_name VARCHAR(255),
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_phone_numbers_tenant_id ON phone_numbers(tenant_id);
CREATE INDEX idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX idx_phone_numbers_carrier ON phone_numbers(carrier);

-- ============================================
-- 5. CALLS (Call records)
-- ============================================

CREATE TABLE calls (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Call identifiers
  call_sid VARCHAR(100) UNIQUE NOT NULL,
  parent_call_sid VARCHAR(100),
  carrier_call_sid VARCHAR(100),

  -- Direction & Type
  direction VARCHAR(20) NOT NULL,
  call_type VARCHAR(20) NOT NULL DEFAULT 'voice',

  -- Participants
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  from_phone_number_id BIGINT REFERENCES phone_numbers(id),
  to_phone_number_id BIGINT REFERENCES phone_numbers(id),

  -- User/Agent
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'initiated',

  -- Timing
  initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ringing_at TIMESTAMP WITH TIME ZONE,
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  billable_seconds INTEGER,

  -- Quality metrics
  mos_score DECIMAL(3,2),
  jitter_ms INTEGER,
  packet_loss_percent DECIMAL(5,2),

  -- Recording
  recording_url TEXT,
  recording_duration_seconds INTEGER,
  recording_sid VARCHAR(100),

  -- Transcription
  transcription_text TEXT,
  transcription_confidence DECIMAL(5,2),

  -- Pricing
  cost_cents INTEGER,
  rate_cents_per_minute INTEGER,

  -- Hang up
  hangup_cause VARCHAR(50),
  hangup_by VARCHAR(20),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags VARCHAR(255)[],

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calls_tenant_id ON calls(tenant_id);
CREATE INDEX idx_calls_uuid ON calls(uuid);
CREATE INDEX idx_calls_call_sid ON calls(call_sid);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_direction ON calls(direction);
CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_calls_from_number ON calls(from_number);
CREATE INDEX idx_calls_to_number ON calls(to_number);
CREATE INDEX idx_calls_initiated_at ON calls(initiated_at DESC);
CREATE INDEX idx_calls_tenant_initiated ON calls(tenant_id, initiated_at DESC);

-- ============================================
-- 6. CALL LOGS (CDR events)
-- ============================================

CREATE TABLE call_logs (
  id BIGSERIAL PRIMARY KEY,
  call_id BIGINT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Event data
  from_status VARCHAR(20),
  to_status VARCHAR(20),

  -- Context
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',

  -- Raw data
  raw_event JSONB,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_logs_call_id ON call_logs(call_id);
CREATE INDEX idx_call_logs_tenant_id ON call_logs(tenant_id);
CREATE INDEX idx_call_logs_event_timestamp ON call_logs(event_timestamp DESC);

-- ============================================
-- 7. WEBHOOKS (Customer webhook endpoints)
-- ============================================

CREATE TABLE webhooks (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Webhook details
  url TEXT NOT NULL,
  name VARCHAR(255),
  description TEXT,

  -- Events
  events VARCHAR(50)[],

  -- Authentication
  secret_key VARCHAR(255) NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  -- Retry
  max_retries INTEGER DEFAULT 3,
  retry_backoff_seconds INTEGER DEFAULT 60,

  -- Stats
  total_deliveries INTEGER DEFAULT 0,
  successful_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  last_delivery_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_failure_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
CREATE INDEX idx_webhooks_status ON webhooks(status);

-- ============================================
-- 8. WEBHOOK DELIVERIES (Audit log)
-- ============================================

CREATE TABLE webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Delivery details
  event_type VARCHAR(50) NOT NULL,
  event_id UUID NOT NULL,

  -- Request
  request_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'POST',
  request_headers JSONB,
  request_body JSONB,
  request_signature VARCHAR(255),

  -- Response
  response_status_code INTEGER,
  response_headers JSONB,
  response_body TEXT,
  response_time_ms INTEGER,

  -- Status
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  attempt_number INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_tenant_id ON webhook_deliveries(tenant_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

-- ============================================
-- 9. CONTACTS (Address book)
-- ============================================

CREATE TABLE contacts (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Contact details
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  phone_2 VARCHAR(20),

  -- Additional
  title VARCHAR(100),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(3),

  -- Segmentation
  tags VARCHAR(255)[],
  lists BIGINT[],

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  do_not_call BOOLEAN DEFAULT FALSE,
  do_not_sms BOOLEAN DEFAULT FALSE,

  -- Metadata
  custom_fields JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_status ON contacts(status);

-- ============================================
-- 10. SESSIONS (User login sessions)
-- ============================================

CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Session details
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE,

  -- Device
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50),

  -- Status
  status VARCHAR(20) DEFAULT 'active',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMPLETED
-- ============================================
-- Migration 001: Core tables created successfully
