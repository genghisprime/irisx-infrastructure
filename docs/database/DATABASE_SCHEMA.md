# IRISX Database Schema Design

## Philosophy: Multi-Tenant, Scalable, Audit-Ready

**Database:** PostgreSQL 16.6
**Strategy:** Multi-tenant with `tenant_id` on every table
**Timezone:** All timestamps in UTC
**IDs:** UUIDs for public-facing, BigSerial for internal

---

## Core Tables (Phase 0-1)

### 1. Tenants (Organizations/Customers)

```sql
CREATE TABLE tenants (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL, -- URL-safe identifier
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, suspended, cancelled
  plan VARCHAR(50) NOT NULL DEFAULT 'trial', -- trial, starter, growth, enterprise

  -- Billing
  stripe_customer_id VARCHAR(255),
  billing_email VARCHAR(255),

  -- Limits (based on plan)
  max_phone_numbers INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 5,
  max_concurrent_calls INTEGER DEFAULT 10,
  max_monthly_minutes INTEGER DEFAULT 1000,

  -- Usage tracking
  current_phone_numbers INTEGER DEFAULT 0,
  current_users INTEGER DEFAULT 0,
  current_monthly_minutes INTEGER DEFAULT 0,

  -- Metadata
  settings JSONB DEFAULT '{}', -- tenant-specific settings
  metadata JSONB DEFAULT '{}', -- custom fields

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE -- soft delete
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_stripe_customer_id ON tenants(stripe_customer_id);
```

---

### 2. Users (Login accounts)

```sql
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
  role VARCHAR(50) NOT NULL DEFAULT 'agent', -- owner, admin, manager, agent, api
  permissions JSONB DEFAULT '[]', -- array of permission strings

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, suspended
  last_login_at TIMESTAMP WITH TIME ZONE,

  -- Agent-specific (if role = agent)
  agent_extension VARCHAR(20), -- internal extension number
  agent_status VARCHAR(20) DEFAULT 'offline', -- online, busy, away, offline

  -- Metadata
  settings JSONB DEFAULT '{}', -- user preferences
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
```

---

### 3. API Keys (Programmatic access)

```sql
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Key details
  name VARCHAR(255) NOT NULL, -- "Production API Key"
  key_prefix VARCHAR(20) NOT NULL, -- "sk_live_" or "sk_test_"
  key_hash VARCHAR(255) NOT NULL, -- hashed API key
  key_hint VARCHAR(20) NOT NULL, -- last 4 chars (for display)

  -- Permissions
  scopes JSONB DEFAULT '[]', -- ["calls:read", "calls:write", "sms:send"]

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, revoked
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Rate limiting
  rate_limit_rpm INTEGER DEFAULT 100, -- requests per minute

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
```

---

### 4. Phone Numbers (DID inventory)

```sql
CREATE TABLE phone_numbers (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL, -- NULL = available in pool

  -- Number details
  phone_number VARCHAR(20) NOT NULL UNIQUE, -- E.164 format: +12025551234
  country_code VARCHAR(3) NOT NULL, -- US, CA, GB
  number_type VARCHAR(20) NOT NULL, -- local, toll-free, mobile

  -- Carrier
  carrier VARCHAR(50) NOT NULL DEFAULT 'twilio', -- twilio, telnyx
  carrier_sid VARCHAR(100), -- carrier's identifier for this number

  -- Capabilities
  sms_enabled BOOLEAN DEFAULT TRUE,
  voice_enabled BOOLEAN DEFAULT TRUE,
  mms_enabled BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, released, porting

  -- Routing (for inbound)
  inbound_call_webhook_url TEXT,
  inbound_sms_webhook_url TEXT,
  fallback_webhook_url TEXT,

  -- Pricing
  monthly_cost_cents INTEGER DEFAULT 100, -- $1.00/mo
  per_minute_cost_cents INTEGER DEFAULT 1, -- $0.01/min

  -- Metadata
  friendly_name VARCHAR(255), -- "Main Office Line"
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE, -- when assigned to tenant
  released_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_phone_numbers_tenant_id ON phone_numbers(tenant_id);
CREATE INDEX idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX idx_phone_numbers_carrier ON phone_numbers(carrier);
```

---

### 5. Calls (Call records)

```sql
CREATE TABLE calls (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Call SIDs (external identifiers)
  call_sid VARCHAR(100) UNIQUE NOT NULL, -- our internal call ID
  parent_call_sid VARCHAR(100), -- for child calls (transfers, conferences)
  carrier_call_sid VARCHAR(100), -- Twilio/Telnyx call ID

  -- Direction & Type
  direction VARCHAR(20) NOT NULL, -- inbound, outbound, internal
  call_type VARCHAR(20) NOT NULL DEFAULT 'voice', -- voice, voicemail, conference

  -- Participants
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  from_phone_number_id BIGINT REFERENCES phone_numbers(id),
  to_phone_number_id BIGINT REFERENCES phone_numbers(id),

  -- User/Agent (if applicable)
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'initiated',
  -- initiated, ringing, in-progress, completed, busy, no-answer, failed, cancelled

  -- Timing
  initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ringing_at TIMESTAMP WITH TIME ZONE,
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER, -- total call duration
  billable_seconds INTEGER, -- rounded up to nearest 6-second increment

  -- Quality metrics
  mos_score DECIMAL(3,2), -- Mean Opinion Score (1.0-5.0)
  jitter_ms INTEGER,
  packet_loss_percent DECIMAL(5,2),

  -- Routing
  queue_id BIGINT, -- if routed through queue (add later)
  campaign_id BIGINT, -- if part of campaign (add later)

  -- Recording
  recording_url TEXT,
  recording_duration_seconds INTEGER,
  recording_sid VARCHAR(100),

  -- Transcription (if enabled)
  transcription_text TEXT,
  transcription_confidence DECIMAL(5,2),

  -- Pricing
  cost_cents INTEGER, -- total cost in cents
  rate_cents_per_minute INTEGER, -- rate charged

  -- Hang up reason
  hangup_cause VARCHAR(50), -- normal_clearing, user_busy, no_answer, etc.
  hangup_by VARCHAR(20), -- caller, callee, system

  -- Metadata
  metadata JSONB DEFAULT '{}',
  tags VARCHAR(255)[], -- searchable tags

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
```

---

### 6. Call Logs (CDR - Call Detail Records)

```sql
CREATE TABLE call_logs (
  id BIGSERIAL PRIMARY KEY,
  call_id BIGINT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- initiated, ringing, answered, transferred, hold, ended
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Event data
  from_status VARCHAR(20), -- state before event
  to_status VARCHAR(20), -- state after event

  -- Additional context
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',

  -- Raw data (for debugging)
  raw_event JSONB,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_logs_call_id ON call_logs(call_id);
CREATE INDEX idx_call_logs_tenant_id ON call_logs(tenant_id);
CREATE INDEX idx_call_logs_event_timestamp ON call_logs(event_timestamp DESC);
```

---

### 7. Webhooks (Customer webhook endpoints)

```sql
CREATE TABLE webhooks (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Webhook details
  url TEXT NOT NULL,
  name VARCHAR(255),
  description TEXT,

  -- Events to subscribe to
  events VARCHAR(50)[], -- ["call.initiated", "call.completed", "sms.received"]

  -- Authentication
  secret_key VARCHAR(255) NOT NULL, -- for HMAC signature verification

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, paused, failed

  -- Retry configuration
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
```

---

### 8. Webhook Deliveries (Audit log)

```sql
CREATE TABLE webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id BIGINT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Delivery details
  event_type VARCHAR(50) NOT NULL,
  event_id UUID NOT NULL, -- ID of the event (call.uuid, sms.uuid, etc.)

  -- Request
  request_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'POST',
  request_headers JSONB,
  request_body JSONB,
  request_signature VARCHAR(255), -- HMAC signature

  -- Response
  response_status_code INTEGER,
  response_headers JSONB,
  response_body TEXT,
  response_time_ms INTEGER,

  -- Status
  status VARCHAR(20) NOT NULL, -- pending, success, failed
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

-- Partition this table by created_at (monthly) for better performance
```

---

### 9. Contacts (Address book)

```sql
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
  phone VARCHAR(20), -- primary phone
  phone_2 VARCHAR(20), -- alternate phone

  -- Additional fields
  title VARCHAR(100),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(3),

  -- Segmentation
  tags VARCHAR(255)[],
  lists BIGINT[], -- array of list IDs they belong to

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, unsubscribed, bounced
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
```

---

## Helper Tables

### 10. Sessions (User login sessions)

```sql
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Session details
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE,

  -- Device/Client info
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50), -- web, mobile, api

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, expired, revoked

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

## Database Functions & Triggers

### Auto-update `updated_at` timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
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
```

---

## Summary

### Tables Created (Phase 0-1):
1. ✅ **tenants** - Organizations/customers
2. ✅ **users** - Login accounts (owners, admins, agents)
3. ✅ **api_keys** - Programmatic access
4. ✅ **phone_numbers** - DID inventory
5. ✅ **calls** - Call records (main table)
6. ✅ **call_logs** - CDR events
7. ✅ **webhooks** - Customer webhook endpoints
8. ✅ **webhook_deliveries** - Webhook audit log
9. ✅ **contacts** - Address book
10. ✅ **sessions** - User sessions

### Phase 2+ Tables (Add Later):
- **queues** - Call queue management
- **queue_members** - Agents assigned to queues
- **campaigns** - Outbound campaign management
- **campaign_contacts** - Contacts in campaigns
- **sms_messages** - SMS/MMS messages
- **emails** - Email messages
- **recordings** - Call recording metadata
- **transcriptions** - Call transcription results
- **ivr_flows** - IVR flow builder
- **schedules** - Business hours, holidays
- **teams** - Agent teams/groups

---

## Next Steps

1. Create migration files using node-pg-migrate or Prisma
2. Run migrations on RDS PostgreSQL
3. Seed with sample data for testing
4. Create database connection module in backend

**Database schema ready for Phase 0-1! 🚀**
