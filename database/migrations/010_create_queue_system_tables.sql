-- Migration 010: Create Queue System Tables
-- Purpose: Call center queue management, agent presence, and routing
-- Date: 2025-10-29

-- ======================
-- QUEUES TABLE
-- ======================
CREATE TABLE IF NOT EXISTS queues (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Queue Configuration
  strategy VARCHAR(50) DEFAULT 'round-robin', -- 'round-robin', 'longest-idle', 'skills-based', 'priority'
  max_wait_time INTEGER DEFAULT 300, -- seconds before timeout
  max_queue_size INTEGER DEFAULT 100,

  -- Audio Settings
  moh_sound VARCHAR(255) DEFAULT 'local_stream://moh', -- music on hold
  announcement_frequency INTEGER DEFAULT 30, -- announce position every N seconds

  -- Routing Settings
  required_skills JSONB DEFAULT '[]'::jsonb, -- ['spanish', 'technical']
  priority_enabled BOOLEAN DEFAULT false,
  sticky_agent BOOLEAN DEFAULT false, -- route to same agent if available

  -- Service Level Settings
  service_level_threshold INTEGER DEFAULT 30, -- answer within N seconds for SL calculation

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'closed'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_queues_tenant ON queues(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_queues_status ON queues(status) WHERE deleted_at IS NULL;


-- ======================
-- AGENTS TABLE
-- ======================
CREATE TABLE IF NOT EXISTS agents (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Agent Details
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  extension VARCHAR(50), -- SIP extension for routing calls

  -- Skills & Attributes
  skills JSONB DEFAULT '[]'::jsonb, -- ['spanish', 'technical', 'sales']
  max_concurrent_calls INTEGER DEFAULT 1,

  -- Status (maintained in Redis for real-time, PostgreSQL for persistence)
  status VARCHAR(50) DEFAULT 'offline', -- 'available', 'busy', 'away', 'offline'
  status_message VARCHAR(255),
  last_status_change TIMESTAMPTZ,

  -- Statistics
  total_calls_handled INTEGER DEFAULT 0,
  total_calls_missed INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  UNIQUE(tenant_id, extension)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_extension ON agents(extension) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id) WHERE deleted_at IS NULL;


-- ======================
-- QUEUE_AGENTS TABLE (Many-to-Many)
-- ======================
CREATE TABLE IF NOT EXISTS queue_agents (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Priority for this agent in this queue (1-10, higher = higher priority)
  priority INTEGER DEFAULT 5,

  -- Agent-specific queue settings
  max_calls_per_day INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused'

  -- Timestamps
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(queue_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_agents_queue ON queue_agents(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_agents_agent ON queue_agents(agent_id);


-- ======================
-- QUEUE_MEMBERS TABLE (Active callers in queue)
-- ======================
-- Note: This is primarily managed in Redis for real-time performance
-- PostgreSQL table is for history/auditing
CREATE TABLE IF NOT EXISTS queue_members (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  queue_id BIGINT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  call_id BIGINT REFERENCES calls(id) ON DELETE SET NULL,

  -- Caller Info
  caller_id VARCHAR(50) NOT NULL,
  caller_name VARCHAR(255),

  -- Queue Details
  position INTEGER, -- position in queue
  priority INTEGER DEFAULT 5, -- 1-10, higher = higher priority

  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,

  -- Wait Time
  wait_time_seconds INTEGER, -- calculated on answer/abandon

  -- Outcome
  outcome VARCHAR(50), -- 'answered', 'abandoned', 'timeout', 'overflow'
  assigned_agent_id BIGINT REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_members_queue ON queue_members(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_call ON queue_members(call_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_joined ON queue_members(joined_at);
CREATE INDEX IF NOT EXISTS idx_queue_members_outcome ON queue_members(outcome);


-- ======================
-- QUEUE_STATS TABLE (Time-series metrics)
-- ======================
CREATE TABLE IF NOT EXISTS queue_stats (
  id BIGSERIAL PRIMARY KEY,
  queue_id BIGINT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  agent_id BIGINT REFERENCES agents(id) ON DELETE SET NULL,

  -- Time Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  interval VARCHAR(20) NOT NULL, -- '5min', '1hour', '1day'

  -- Queue Metrics
  calls_offered INTEGER DEFAULT 0,
  calls_answered INTEGER DEFAULT 0,
  calls_abandoned INTEGER DEFAULT 0,
  calls_timeout INTEGER DEFAULT 0,

  -- Timing Metrics (in seconds)
  total_wait_time INTEGER DEFAULT 0,
  avg_wait_time DECIMAL(10,2),
  max_wait_time INTEGER DEFAULT 0,

  total_handle_time INTEGER DEFAULT 0,
  avg_handle_time DECIMAL(10,2),

  -- Service Level (% answered within threshold)
  service_level DECIMAL(5,2),

  -- Queue Depth
  max_queue_depth INTEGER DEFAULT 0,
  avg_queue_depth DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_stats_queue ON queue_stats(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_stats_period ON queue_stats(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_queue_stats_interval ON queue_stats(interval);


-- ======================
-- AGENT_ACTIVITY TABLE (Agent state changes)
-- ======================
CREATE TABLE IF NOT EXISTS agent_activity (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Status Change
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  reason VARCHAR(255), -- 'manual', 'system', 'call_start', 'call_end'

  -- Duration of previous status (in seconds)
  duration INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created ON agent_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_activity_status ON agent_activity(new_status);


-- ======================
-- TRIGGERS
-- ======================

-- Update queue updated_at timestamp
CREATE OR REPLACE FUNCTION update_queue_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_queue_updated_at
BEFORE UPDATE ON queues
FOR EACH ROW
EXECUTE FUNCTION update_queue_timestamp();


-- Update agent updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_updated_at
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION update_agent_timestamp();


-- Log agent status changes
CREATE OR REPLACE FUNCTION log_agent_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO agent_activity (agent_id, old_status, new_status, reason, duration)
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'manual',
      EXTRACT(EPOCH FROM (NOW() - OLD.last_status_change))::INTEGER
    );
    NEW.last_status_change = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_agent_status
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION log_agent_status_change();


-- ======================
-- VIEWS
-- ======================

-- Real-time queue stats view
CREATE OR REPLACE VIEW queue_realtime_stats AS
SELECT
  q.id as queue_id,
  q.tenant_id,
  q.name as queue_name,
  COUNT(qm.id) FILTER (WHERE qm.answered_at IS NULL AND qm.abandoned_at IS NULL) as current_waiting,
  AVG(qm.wait_time_seconds) FILTER (WHERE qm.answered_at IS NOT NULL) as avg_wait_time_today,
  COUNT(DISTINCT qa.agent_id) as total_agents,
  COUNT(DISTINCT CASE WHEN a.status = 'available' THEN a.id END) as available_agents,
  COUNT(DISTINCT CASE WHEN a.status = 'busy' THEN a.id END) as busy_agents
FROM queues q
LEFT JOIN queue_members qm ON q.id = qm.queue_id AND qm.joined_at >= CURRENT_DATE
LEFT JOIN queue_agents qa ON q.id = qa.queue_id AND qa.status = 'active'
LEFT JOIN agents a ON qa.agent_id = a.id AND a.deleted_at IS NULL
WHERE q.deleted_at IS NULL
GROUP BY q.id, q.tenant_id, q.name;


-- Agent performance view
CREATE OR REPLACE VIEW agent_performance AS
SELECT
  a.id as agent_id,
  a.tenant_id,
  a.name as agent_name,
  a.status,
  a.total_calls_handled,
  a.total_calls_missed,
  ROUND(
    CASE
      WHEN (a.total_calls_handled + a.total_calls_missed) > 0
      THEN (a.total_calls_handled::DECIMAL / (a.total_calls_handled + a.total_calls_missed)) * 100
      ELSE 0
    END,
    2
  ) as answer_rate_percent,
  COUNT(qm.id) as calls_today,
  AVG(qm.wait_time_seconds) as avg_wait_time_today
FROM agents a
LEFT JOIN queue_members qm ON a.id = qm.assigned_agent_id
  AND qm.answered_at >= CURRENT_DATE
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.tenant_id, a.name, a.status, a.total_calls_handled, a.total_calls_missed;
