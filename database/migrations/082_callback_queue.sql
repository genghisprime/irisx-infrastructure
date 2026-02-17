-- =====================================================
-- CALLBACK QUEUE SYSTEM
-- Customer callback scheduling and management
-- =====================================================

-- Callback Requests
-- Main table for callback requests
CREATE TABLE IF NOT EXISTS callback_requests (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Contact Information
  contact_id INTEGER REFERENCES contacts(id),
  phone_number VARCHAR(20) NOT NULL,
  caller_name VARCHAR(255),

  -- Request Details
  queue_id INTEGER REFERENCES queues(id),
  original_call_id VARCHAR(100),         -- If callback was requested during a call
  reason TEXT,                            -- Why they want a callback
  priority INTEGER DEFAULT 50,            -- 1-100, higher = more urgent

  -- Scheduling
  requested_time TIMESTAMPTZ,             -- When they want the callback (null = ASAP)
  scheduled_time TIMESTAMPTZ,             -- When we plan to call
  estimated_wait_minutes INTEGER,         -- Estimated wait at request time
  time_zone VARCHAR(50) DEFAULT 'UTC',

  -- Preferences
  preferred_time_start TIME,              -- Preferred callback window start
  preferred_time_end TIME,                -- Preferred callback window end
  max_attempts INTEGER DEFAULT 3,
  attempt_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(30) DEFAULT 'pending',   -- pending, scheduled, in_progress, completed, failed, cancelled, expired
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome VARCHAR(50),                    -- answered, no_answer, busy, voicemail, wrong_number, cancelled_by_customer

  -- Assignment
  assigned_agent_id INTEGER REFERENCES agents(id),
  completed_by_agent_id INTEGER REFERENCES agents(id),

  -- Integration
  source VARCHAR(30) DEFAULT 'ivr',       -- ivr, web, api, sms, agent
  external_id VARCHAR(100),
  metadata JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback Schedules
-- Defines available callback time slots
CREATE TABLE IF NOT EXISTS callback_schedules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  queue_id INTEGER REFERENCES queues(id),

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Schedule Definition (cron-like or explicit)
  schedule_type VARCHAR(20) DEFAULT 'weekly',  -- weekly, daily, custom
  time_zone VARCHAR(50) DEFAULT 'UTC',

  -- Weekly schedule (JSON array of day configs)
  -- Example: [{"day": 1, "start": "09:00", "end": "17:00", "slots_per_hour": 4}]
  weekly_schedule JSONB DEFAULT '[]',

  -- Capacity
  max_concurrent_callbacks INTEGER DEFAULT 5,
  slot_duration_minutes INTEGER DEFAULT 15,
  buffer_minutes INTEGER DEFAULT 5,           -- Buffer between slots

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback Slots
-- Pre-generated available time slots
CREATE TABLE IF NOT EXISTS callback_slots (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_id INTEGER REFERENCES callback_schedules(id) ON DELETE CASCADE,
  queue_id INTEGER REFERENCES queues(id),

  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,

  capacity INTEGER DEFAULT 1,                 -- How many callbacks can be scheduled
  booked_count INTEGER DEFAULT 0,             -- How many are currently booked

  is_available BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback Attempts
-- Tracks each attempt to reach the customer
CREATE TABLE IF NOT EXISTS callback_attempts (
  id SERIAL PRIMARY KEY,
  callback_id INTEGER NOT NULL REFERENCES callback_requests(id) ON DELETE CASCADE,

  attempt_number INTEGER NOT NULL,
  agent_id INTEGER REFERENCES agents(id),

  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  outcome VARCHAR(50) NOT NULL,               -- answered, no_answer, busy, voicemail, failed, cancelled
  call_id VARCHAR(100),                       -- Reference to actual call if made

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback Rules
-- Configurable rules for callback behavior
CREATE TABLE IF NOT EXISTS callback_rules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  queue_id INTEGER REFERENCES queues(id),     -- Null means applies to all queues

  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Conditions (when this rule applies)
  conditions JSONB DEFAULT '{}',              -- e.g., {"wait_time_gt": 300, "queue_size_gt": 10}

  -- Actions
  auto_offer_callback BOOLEAN DEFAULT false,  -- Automatically offer callback
  callback_priority_boost INTEGER DEFAULT 0,  -- Add to priority when conditions met
  max_scheduled_ahead_hours INTEGER DEFAULT 72,
  min_retry_interval_minutes INTEGER DEFAULT 30,

  -- Messaging
  offer_message TEXT,                         -- TTS message to offer callback
  confirmation_sms_template TEXT,
  reminder_sms_template TEXT,
  reminder_minutes_before INTEGER DEFAULT 15,

  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,                 -- Rule evaluation order

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback Notifications
-- Tracks notifications sent to customers
CREATE TABLE IF NOT EXISTS callback_notifications (
  id SERIAL PRIMARY KEY,
  callback_id INTEGER NOT NULL REFERENCES callback_requests(id) ON DELETE CASCADE,

  notification_type VARCHAR(30) NOT NULL,     -- confirmation, reminder, rescheduled, cancelled
  channel VARCHAR(20) NOT NULL,               -- sms, email, push

  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,

  content TEXT,
  status VARCHAR(20) DEFAULT 'sent',          -- sent, delivered, failed
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Callback Requests
CREATE INDEX IF NOT EXISTS idx_callback_requests_tenant ON callback_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_callback_requests_status ON callback_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_callback_requests_scheduled ON callback_requests(tenant_id, scheduled_time) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_callback_requests_queue ON callback_requests(queue_id, status);
CREATE INDEX IF NOT EXISTS idx_callback_requests_contact ON callback_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_callback_requests_phone ON callback_requests(phone_number);

-- Callback Slots
CREATE INDEX IF NOT EXISTS idx_callback_slots_tenant ON callback_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_callback_slots_available ON callback_slots(tenant_id, slot_start, is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_callback_slots_schedule ON callback_slots(schedule_id);

-- Callback Attempts
CREATE INDEX IF NOT EXISTS idx_callback_attempts_callback ON callback_attempts(callback_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_callback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_callback_requests_timestamp
  BEFORE UPDATE ON callback_requests
  FOR EACH ROW EXECUTE FUNCTION update_callback_timestamp();

CREATE TRIGGER update_callback_schedules_timestamp
  BEFORE UPDATE ON callback_schedules
  FOR EACH ROW EXECUTE FUNCTION update_callback_timestamp();

CREATE TRIGGER update_callback_rules_timestamp
  BEFORE UPDATE ON callback_rules
  FOR EACH ROW EXECUTE FUNCTION update_callback_timestamp();

-- Update slot booked count when callback is scheduled
CREATE OR REPLACE FUNCTION update_slot_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- If a callback is being scheduled to a slot
  IF NEW.status = 'scheduled' AND OLD.status != 'scheduled' THEN
    UPDATE callback_slots
    SET booked_count = booked_count + 1,
        is_available = (booked_count + 1) < capacity
    WHERE slot_start <= NEW.scheduled_time
      AND slot_end > NEW.scheduled_time
      AND tenant_id = NEW.tenant_id;
  END IF;

  -- If a callback is being unscheduled
  IF OLD.status = 'scheduled' AND NEW.status != 'scheduled' THEN
    UPDATE callback_slots
    SET booked_count = GREATEST(0, booked_count - 1),
        is_available = true
    WHERE slot_start <= OLD.scheduled_time
      AND slot_end > OLD.scheduled_time
      AND tenant_id = OLD.tenant_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_slot_booking
  AFTER UPDATE ON callback_requests
  FOR EACH ROW EXECUTE FUNCTION update_slot_booking();

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Insert a default callback schedule for testing
-- INSERT INTO callback_schedules (tenant_id, queue_id, name, weekly_schedule)
-- SELECT 1, NULL, 'Default Business Hours',
--        '[
--          {"day": 1, "start": "09:00", "end": "17:00", "slots_per_hour": 4},
--          {"day": 2, "start": "09:00", "end": "17:00", "slots_per_hour": 4},
--          {"day": 3, "start": "09:00", "end": "17:00", "slots_per_hour": 4},
--          {"day": 4, "start": "09:00", "end": "17:00", "slots_per_hour": 4},
--          {"day": 5, "start": "09:00", "end": "17:00", "slots_per_hour": 4}
--        ]'::jsonb
-- WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 1);
