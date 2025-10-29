-- IRISX Sample Data for Testing
-- Run this AFTER migration 001_create_core_tables.sql

-- ============================================
-- 1. SAMPLE TENANT (Test Organization)
-- ============================================

INSERT INTO tenants (
  name,
  slug,
  status,
  plan,
  billing_email,
  max_phone_numbers,
  max_users,
  max_concurrent_calls,
  max_monthly_minutes
) VALUES (
  'Acme Corporation',
  'acme',
  'active',
  'trial',
  'billing@acme.com',
  5,
  10,
  20,
  5000
);

-- Get the tenant_id for use in subsequent inserts
DO $$
DECLARE
  acme_tenant_id BIGINT;
BEGIN
  SELECT id INTO acme_tenant_id FROM tenants WHERE slug = 'acme';

  -- ============================================
  -- 2. SAMPLE USERS
  -- ============================================

  -- Owner/Admin user
  INSERT INTO users (
    tenant_id,
    email,
    password_hash, -- bcrypt hash of "password123"
    email_verified,
    first_name,
    last_name,
    phone,
    role,
    status
  ) VALUES (
    acme_tenant_id,
    'admin@acme.com',
    '$2b$10$YourPasswordHashHere', -- Replace with actual bcrypt hash
    TRUE,
    'John',
    'Admin',
    '+12025551001',
    'owner',
    'active'
  );

  -- Agent user
  INSERT INTO users (
    tenant_id,
    email,
    password_hash,
    email_verified,
    first_name,
    last_name,
    phone,
    role,
    status,
    agent_extension,
    agent_status
  ) VALUES (
    acme_tenant_id,
    'agent@acme.com',
    '$2b$10$YourPasswordHashHere',
    TRUE,
    'Sarah',
    'Agent',
    '+12025551002',
    'agent',
    'active',
    '1001',
    'offline'
  );

  -- ============================================
  -- 3. SAMPLE API KEY
  -- ============================================

  INSERT INTO api_keys (
    tenant_id,
    created_by_user_id,
    name,
    key_prefix,
    key_hash, -- Hash of actual API key
    key_hint,
    scopes,
    status,
    rate_limit_rpm
  ) VALUES (
    acme_tenant_id,
    (SELECT id FROM users WHERE email = 'admin@acme.com' AND tenant_id = acme_tenant_id),
    'Production API Key',
    'sk_live_',
    'hash_of_api_key_here', -- Replace with actual hash
    '1234',
    '["calls:read", "calls:write", "sms:send", "sms:receive"]'::JSONB,
    'active',
    100
  );

  -- ============================================
  -- 4. SAMPLE PHONE NUMBERS
  -- ============================================

  INSERT INTO phone_numbers (
    tenant_id,
    phone_number,
    country_code,
    number_type,
    carrier,
    carrier_sid,
    sms_enabled,
    voice_enabled,
    status,
    friendly_name,
    monthly_cost_cents,
    per_minute_cost_cents,
    assigned_at
  ) VALUES
  (
    acme_tenant_id,
    '+12025551234',
    'US',
    'local',
    'twilio',
    'PN1234567890abcdef',
    TRUE,
    TRUE,
    'active',
    'Main Office Line',
    100,
    1,
    NOW()
  ),
  (
    acme_tenant_id,
    '+18005551234',
    'US',
    'toll-free',
    'twilio',
    'PN0987654321fedcba',
    TRUE,
    TRUE,
    'active',
    'Customer Support Line',
    200,
    2,
    NOW()
  );

  -- ============================================
  -- 5. SAMPLE CONTACTS
  -- ============================================

  INSERT INTO contacts (
    tenant_id,
    created_by_user_id,
    first_name,
    last_name,
    company,
    email,
    phone,
    city,
    state,
    country,
    tags,
    status
  ) VALUES
  (
    acme_tenant_id,
    (SELECT id FROM users WHERE email = 'admin@acme.com' AND tenant_id = acme_tenant_id),
    'Jane',
    'Customer',
    'Widget Inc',
    'jane@widget.com',
    '+13105551234',
    'Los Angeles',
    'CA',
    'US',
    ARRAY['customer', 'vip'],
    'active'
  ),
  (
    acme_tenant_id,
    (SELECT id FROM users WHERE email = 'admin@acme.com' AND tenant_id = acme_tenant_id),
    'Bob',
    'Prospect',
    'Gadget Co',
    'bob@gadget.com',
    '+14155551234',
    'San Francisco',
    'CA',
    'US',
    ARRAY['prospect', 'warm-lead'],
    'active'
  );

  -- ============================================
  -- 6. SAMPLE WEBHOOK
  -- ============================================

  INSERT INTO webhooks (
    tenant_id,
    created_by_user_id,
    url,
    name,
    description,
    events,
    secret_key,
    status
  ) VALUES (
    acme_tenant_id,
    (SELECT id FROM users WHERE email = 'admin@acme.com' AND tenant_id = acme_tenant_id),
    'https://acme.com/webhooks/irisx',
    'Main Webhook Endpoint',
    'Receives all call and SMS events',
    ARRAY['call.initiated', 'call.completed', 'sms.received'],
    'whsec_' || encode(gen_random_bytes(24), 'hex'),
    'active'
  );

  -- ============================================
  -- 7. SAMPLE CALL (Completed call)
  -- ============================================

  INSERT INTO calls (
    tenant_id,
    call_sid,
    direction,
    call_type,
    from_number,
    to_number,
    from_phone_number_id,
    user_id,
    status,
    initiated_at,
    ringing_at,
    answered_at,
    ended_at,
    duration_seconds,
    billable_seconds,
    cost_cents,
    rate_cents_per_minute,
    hangup_cause,
    hangup_by,
    tags
  ) VALUES (
    acme_tenant_id,
    'CA' || encode(gen_random_bytes(16), 'hex'),
    'inbound',
    'voice',
    '+13105551234',
    '+12025551234',
    (SELECT id FROM phone_numbers WHERE phone_number = '+12025551234' AND tenant_id = acme_tenant_id),
    (SELECT id FROM users WHERE email = 'agent@acme.com' AND tenant_id = acme_tenant_id),
    'completed',
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '1 hour' + INTERVAL '2 seconds',
    NOW() - INTERVAL '1 hour' + INTERVAL '5 seconds',
    NOW() - INTERVAL '1 hour' + INTERVAL '5 minutes',
    295, -- 4 min 55 sec
    300, -- 5 min billable (rounded up)
    5, -- $0.05
    1, -- $0.01/min
    'normal_clearing',
    'caller',
    ARRAY['support', 'resolved']
  );

  -- ============================================
  -- 8. SAMPLE CALL LOGS (Events for above call)
  -- ============================================

  INSERT INTO call_logs (
    call_id,
    tenant_id,
    event_type,
    event_timestamp,
    from_status,
    to_status
  ) VALUES
  (
    (SELECT id FROM calls WHERE tenant_id = acme_tenant_id ORDER BY id DESC LIMIT 1),
    acme_tenant_id,
    'initiated',
    NOW() - INTERVAL '1 hour',
    NULL,
    'initiated'
  ),
  (
    (SELECT id FROM calls WHERE tenant_id = acme_tenant_id ORDER BY id DESC LIMIT 1),
    acme_tenant_id,
    'ringing',
    NOW() - INTERVAL '1 hour' + INTERVAL '2 seconds',
    'initiated',
    'ringing'
  ),
  (
    (SELECT id FROM calls WHERE tenant_id = acme_tenant_id ORDER BY id DESC LIMIT 1),
    acme_tenant_id,
    'answered',
    NOW() - INTERVAL '1 hour' + INTERVAL '5 seconds',
    'ringing',
    'in-progress'
  ),
  (
    (SELECT id FROM calls WHERE tenant_id = acme_tenant_id ORDER BY id DESC LIMIT 1),
    acme_tenant_id,
    'ended',
    NOW() - INTERVAL '1 hour' + INTERVAL '5 minutes',
    'in-progress',
    'completed'
  );

END $$;

-- ============================================
-- VERIFICATION
-- ============================================

-- Show created tenant
SELECT id, name, slug, status, plan FROM tenants;

-- Show created users
SELECT id, tenant_id, email, first_name, last_name, role FROM users;

-- Show phone numbers
SELECT id, tenant_id, phone_number, friendly_name, status FROM phone_numbers;

-- Show contacts
SELECT id, tenant_id, first_name, last_name, company, phone FROM contacts;

-- Show calls
SELECT id, tenant_id, call_sid, direction, from_number, to_number, status, duration_seconds FROM calls;

-- ============================================
-- COMPLETED
-- ============================================
-- Sample data inserted successfully!
