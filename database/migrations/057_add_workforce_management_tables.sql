-- Workforce Management Tables
-- Migration: 057_add_workforce_management_tables.sql

-- Shift templates
CREATE TABLE IF NOT EXISTS shift_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER DEFAULT 30,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for UI
    is_overnight BOOLEAN DEFAULT false, -- Shift crosses midnight
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent availability preferences
CREATE TABLE IF NOT EXISTS agent_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    is_available BOOLEAN DEFAULT true,
    preferred_start_time TIME,
    preferred_end_time TIME,
    max_hours INTEGER DEFAULT 8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_id, day_of_week)
);

-- Scheduled shifts
CREATE TABLE IF NOT EXISTS scheduled_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_template_id UUID REFERENCES shift_templates(id),

    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start TIME,
    break_end TIME,

    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),

    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    actual_break_minutes INTEGER,

    notes TEXT,
    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, date, start_time)
);

-- Adherence events
CREATE TABLE IF NOT EXISTS adherence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES scheduled_shifts(id),

    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'shift_start', 'shift_end',
        'break_start', 'break_end',
        'status_change', 'manual_adjustment'
    )),
    scheduled_time TIMESTAMP WITH TIME ZONE,
    actual_time TIMESTAMP WITH TIME ZONE NOT NULL,
    variance_minutes INTEGER DEFAULT 0,

    previous_status VARCHAR(30),
    new_status VARCHAR(30),

    notes TEXT,
    recorded_by UUID REFERENCES users(id), -- NULL = system, otherwise manual entry

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Time-off requests
CREATE TABLE IF NOT EXISTS time_off_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    request_type VARCHAR(30) DEFAULT 'pto' CHECK (request_type IN ('pto', 'sick', 'personal', 'unpaid', 'jury_duty', 'bereavement', 'other')),
    reason TEXT,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,

    hours_requested DECIMAL(5,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staffing requirements (for scheduling algorithm)
CREATE TABLE IF NOT EXISTS staffing_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES queues(id) ON DELETE SET NULL, -- Optional: per-queue requirements

    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    interval_start TIME NOT NULL, -- 30-minute intervals typically
    interval_end TIME NOT NULL,

    required_agents INTEGER NOT NULL DEFAULT 1,
    minimum_agents INTEGER DEFAULT 1,
    skill_requirements JSONB DEFAULT '[]', -- Skills needed for this interval

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, queue_id, day_of_week, interval_start)
);

-- Call volume forecasts
CREATE TABLE IF NOT EXISTS call_volume_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES queues(id),

    forecast_date DATE NOT NULL,
    interval_start TIME NOT NULL,
    interval_end TIME NOT NULL,

    predicted_calls INTEGER NOT NULL,
    predicted_aht_seconds INTEGER, -- Average handle time
    confidence_level DECIMAL(3,2), -- 0.00 to 1.00

    model_version VARCHAR(50) DEFAULT 'v1',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    actual_calls INTEGER, -- Filled in after the fact for model training

    UNIQUE(tenant_id, queue_id, forecast_date, interval_start)
);

-- Scheduling constraints per tenant
CREATE TABLE IF NOT EXISTS scheduling_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    max_hours_per_week INTEGER DEFAULT 40,
    max_hours_per_day INTEGER DEFAULT 12,
    min_hours_between_shifts INTEGER DEFAULT 8,
    max_consecutive_days INTEGER DEFAULT 6,
    min_break_minutes INTEGER DEFAULT 30,
    break_after_hours DECIMAL(3,1) DEFAULT 6.0, -- Must take break after X hours

    overtime_threshold_weekly INTEGER DEFAULT 40,
    overtime_threshold_daily INTEGER DEFAULT 8,

    allow_split_shifts BOOLEAN DEFAULT false,
    allow_overtime_requests BOOLEAN DEFAULT true,
    auto_approve_swaps BOOLEAN DEFAULT false,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id)
);

-- Overtime requests
CREATE TABLE IF NOT EXISTS overtime_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    date DATE NOT NULL,
    requested_hours DECIMAL(4,2) NOT NULL,
    reason TEXT,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
    pay_multiplier DECIMAL(3,2) DEFAULT 1.50,

    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shift swaps
CREATE TABLE IF NOT EXISTS shift_swaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    original_shift_id UUID NOT NULL REFERENCES scheduled_shifts(id),
    requesting_agent_id UUID NOT NULL REFERENCES users(id),
    target_agent_id UUID REFERENCES users(id), -- NULL = open for anyone

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied', 'cancelled', 'approved')),

    accepted_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,

    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily adherence summaries (for reporting)
CREATE TABLE IF NOT EXISTS adherence_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    date DATE NOT NULL,

    scheduled_minutes INTEGER DEFAULT 0,
    worked_minutes INTEGER DEFAULT 0,
    break_minutes INTEGER DEFAULT 0,

    adherent_minutes INTEGER DEFAULT 0,
    adherence_rate DECIMAL(5,2), -- Percentage

    late_arrivals INTEGER DEFAULT 0,
    early_departures INTEGER DEFAULT 0,
    unplanned_breaks INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(agent_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON shift_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_agent ON agent_availability(agent_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_agent_date ON scheduled_shifts(agent_id, date);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_tenant_date ON scheduled_shifts(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_status ON scheduled_shifts(status);
CREATE INDEX IF NOT EXISTS idx_adherence_events_agent_date ON adherence_events(agent_id, DATE(actual_time));
CREATE INDEX IF NOT EXISTS idx_adherence_events_shift ON adherence_events(shift_id);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_agent ON time_off_requests(agent_id, start_date);
CREATE INDEX IF NOT EXISTS idx_time_off_requests_status ON time_off_requests(status);
CREATE INDEX IF NOT EXISTS idx_staffing_requirements_tenant_day ON staffing_requirements(tenant_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_call_volume_forecasts_date ON call_volume_forecasts(tenant_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_adherence_summaries_agent ON adherence_summaries(agent_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_swaps_status ON shift_swaps(status);

COMMENT ON TABLE shift_templates IS 'Reusable shift patterns (9-5, night shift, etc.)';
COMMENT ON TABLE scheduled_shifts IS 'Actual agent schedules';
COMMENT ON TABLE adherence_events IS 'Real-time tracking of schedule compliance';
COMMENT ON TABLE time_off_requests IS 'PTO, sick leave, personal days';
COMMENT ON TABLE staffing_requirements IS 'How many agents needed per interval';
COMMENT ON TABLE call_volume_forecasts IS 'ML-predicted call volumes';
COMMENT ON TABLE scheduling_constraints IS 'Labor law and policy constraints';
