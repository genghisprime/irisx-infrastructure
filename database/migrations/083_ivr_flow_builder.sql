-- =====================================================
-- VISUAL IVR FLOW BUILDER
-- Drag-and-drop IVR flow creation and management
-- =====================================================

-- IVR Flows (main container)
CREATE TABLE IF NOT EXISTS ivr_flows (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(255),

  -- Version control
  version INTEGER DEFAULT 1,
  is_draft BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ,
  published_by INTEGER REFERENCES agents(id),

  -- Assignment
  phone_number_id INTEGER REFERENCES phone_numbers(id),
  queue_id INTEGER REFERENCES queues(id),

  -- Flow configuration
  entry_node_id VARCHAR(100),           -- UUID of the starting node
  flow_data JSONB DEFAULT '{}',         -- Complete flow structure for UI

  -- Settings
  default_language VARCHAR(10) DEFAULT 'en-US',
  timeout_seconds INTEGER DEFAULT 10,
  max_retries INTEGER DEFAULT 3,
  invalid_input_message TEXT,
  timeout_message TEXT,

  -- Analytics
  total_executions INTEGER DEFAULT 0,
  avg_completion_rate DECIMAL(5,2),

  -- Status
  status VARCHAR(20) DEFAULT 'draft',   -- draft, published, archived

  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVR Flow Nodes (individual steps in the flow)
CREATE TABLE IF NOT EXISTS ivr_flow_nodes (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,

  node_id VARCHAR(100) NOT NULL,        -- UUID for frontend reference
  node_type VARCHAR(50) NOT NULL,       -- menu, play, input, transfer, voicemail, webhook, condition, etc.

  -- Position for visual editor
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,

  -- Node configuration (varies by type)
  config JSONB DEFAULT '{}',

  -- For menu nodes
  label VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(flow_id, node_id)
);

-- IVR Flow Connections (edges between nodes)
CREATE TABLE IF NOT EXISTS ivr_flow_connections (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,

  connection_id VARCHAR(100) NOT NULL,  -- UUID for frontend
  source_node_id VARCHAR(100) NOT NULL,
  target_node_id VARCHAR(100) NOT NULL,

  -- Condition for this path (e.g., DTMF digit, speech result, timeout)
  condition_type VARCHAR(50),           -- dtmf, speech, timeout, default, expression
  condition_value VARCHAR(255),         -- "1", "sales", etc.

  label VARCHAR(100),                   -- Display label on edge

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(flow_id, connection_id)
);

-- IVR Audio Assets (TTS or uploaded audio)
CREATE TABLE IF NOT EXISTS ivr_audio_assets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Asset type
  asset_type VARCHAR(20) NOT NULL,      -- tts, upload, url

  -- For TTS
  tts_text TEXT,
  tts_voice VARCHAR(100),
  tts_provider VARCHAR(50),             -- openai, elevenlabs, aws

  -- For uploads
  file_url TEXT,
  file_size INTEGER,
  duration_seconds INTEGER,

  -- Language
  language VARCHAR(10) DEFAULT 'en-US',

  -- Cache
  cached_audio_url TEXT,
  cached_at TIMESTAMPTZ,

  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVR Variables (session state during execution)
CREATE TABLE IF NOT EXISTS ivr_variables (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,

  variable_name VARCHAR(100) NOT NULL,
  variable_type VARCHAR(30) NOT NULL,   -- string, number, boolean, array, object
  default_value TEXT,
  description TEXT,

  is_system BOOLEAN DEFAULT false,      -- System variables like caller_id, call_time

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(flow_id, variable_name)
);

-- IVR Flow Executions (call session tracking)
CREATE TABLE IF NOT EXISTS ivr_flow_executions (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,
  flow_version INTEGER NOT NULL,

  call_id VARCHAR(100),
  caller_id VARCHAR(50),
  called_number VARCHAR(50),

  -- Execution tracking
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Path taken
  nodes_visited JSONB DEFAULT '[]',     -- Array of {node_id, entered_at, exited_at, input}
  current_node_id VARCHAR(100),

  -- Variables state
  variables JSONB DEFAULT '{}',

  -- Outcome
  status VARCHAR(30) DEFAULT 'in_progress',  -- in_progress, completed, transferred, abandoned, error
  exit_reason VARCHAR(50),              -- completed, transfer, hangup, timeout, error
  exit_node_id VARCHAR(100),

  -- Transfer details
  transferred_to VARCHAR(100),          -- queue, agent, external number
  transfer_type VARCHAR(30),            -- queue, agent, external

  -- Error tracking
  error_message TEXT,
  error_node_id VARCHAR(100),

  -- Metrics
  total_duration_seconds INTEGER,
  input_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0
);

-- IVR Flow Node Analytics (per-node metrics)
CREATE TABLE IF NOT EXISTS ivr_flow_node_analytics (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,

  -- Time period
  date DATE NOT NULL,
  hour INTEGER,                         -- NULL for daily aggregates

  -- Metrics
  entries INTEGER DEFAULT 0,
  exits INTEGER DEFAULT 0,
  timeouts INTEGER DEFAULT 0,
  invalid_inputs INTEGER DEFAULT 0,
  avg_time_in_node_seconds DECIMAL(10,2),

  -- Input distribution (for menu nodes)
  input_distribution JSONB DEFAULT '{}',  -- {"1": 150, "2": 80, "3": 45}

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(flow_id, node_id, date, hour)
);

-- IVR Templates (pre-built flow templates)
CREATE TABLE IF NOT EXISTS ivr_templates (
  id SERIAL PRIMARY KEY,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),                 -- support, sales, general, custom

  -- Template data
  flow_data JSONB NOT NULL,
  thumbnail_url TEXT,

  -- Metadata
  is_system BOOLEAN DEFAULT false,      -- Built-in templates
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL for system templates

  -- Stats
  usage_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ivr_flows_tenant ON ivr_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ivr_flows_status ON ivr_flows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ivr_flows_phone ON ivr_flows(phone_number_id);

CREATE INDEX IF NOT EXISTS idx_ivr_flow_nodes_flow ON ivr_flow_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_ivr_flow_nodes_type ON ivr_flow_nodes(flow_id, node_type);

CREATE INDEX IF NOT EXISTS idx_ivr_flow_connections_flow ON ivr_flow_connections(flow_id);
CREATE INDEX IF NOT EXISTS idx_ivr_flow_connections_source ON ivr_flow_connections(flow_id, source_node_id);

CREATE INDEX IF NOT EXISTS idx_ivr_audio_assets_tenant ON ivr_audio_assets(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ivr_executions_flow ON ivr_flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_ivr_executions_call ON ivr_flow_executions(call_id);
CREATE INDEX IF NOT EXISTS idx_ivr_executions_date ON ivr_flow_executions(flow_id, started_at);

CREATE INDEX IF NOT EXISTS idx_ivr_node_analytics_flow ON ivr_flow_node_analytics(flow_id, date);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_ivr_flow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ivr_flows_timestamp
  BEFORE UPDATE ON ivr_flows
  FOR EACH ROW EXECUTE FUNCTION update_ivr_flow_timestamp();

CREATE TRIGGER update_ivr_flow_nodes_timestamp
  BEFORE UPDATE ON ivr_flow_nodes
  FOR EACH ROW EXECUTE FUNCTION update_ivr_flow_timestamp();

CREATE TRIGGER update_ivr_audio_assets_timestamp
  BEFORE UPDATE ON ivr_audio_assets
  FOR EACH ROW EXECUTE FUNCTION update_ivr_flow_timestamp();

-- Increment version on publish
CREATE OR REPLACE FUNCTION increment_ivr_flow_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.version = OLD.version + 1;
    NEW.published_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ivr_flow_version_increment
  BEFORE UPDATE ON ivr_flows
  FOR EACH ROW EXECUTE FUNCTION increment_ivr_flow_version();

-- =====================================================
-- SAMPLE TEMPLATES
-- =====================================================

INSERT INTO ivr_templates (name, description, category, is_system, flow_data) VALUES
(
  'Basic Menu',
  'Simple main menu with department routing',
  'general',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "play", "config": {"text": "Welcome to our company. "}, "position": {"x": 100, "y": 100}},
      {"id": "menu1", "type": "menu", "config": {"text": "Press 1 for Sales, 2 for Support, or 3 for Billing.", "timeout": 10}, "position": {"x": 100, "y": 200}},
      {"id": "sales", "type": "transfer", "config": {"target": "queue:sales", "announce": "Transferring to Sales."}, "position": {"x": 0, "y": 300}},
      {"id": "support", "type": "transfer", "config": {"target": "queue:support", "announce": "Transferring to Support."}, "position": {"x": 200, "y": 300}},
      {"id": "billing", "type": "transfer", "config": {"target": "queue:billing", "announce": "Transferring to Billing."}, "position": {"x": 400, "y": 300}}
    ],
    "connections": [
      {"id": "c1", "source": "start", "target": "menu1", "condition": {"type": "default"}},
      {"id": "c2", "source": "menu1", "target": "sales", "condition": {"type": "dtmf", "value": "1"}},
      {"id": "c3", "source": "menu1", "target": "support", "condition": {"type": "dtmf", "value": "2"}},
      {"id": "c4", "source": "menu1", "target": "billing", "condition": {"type": "dtmf", "value": "3"}}
    ],
    "entryNode": "start"
  }'::jsonb
),
(
  'After Hours',
  'Voicemail collection during off-hours',
  'general',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "play", "config": {"text": "Thank you for calling. Our office is currently closed."}, "position": {"x": 100, "y": 100}},
      {"id": "hours", "type": "play", "config": {"text": "Our business hours are Monday through Friday, 9 AM to 5 PM."}, "position": {"x": 100, "y": 200}},
      {"id": "voicemail", "type": "voicemail", "config": {"text": "Please leave a message after the tone and we will return your call.", "maxDuration": 120}, "position": {"x": 100, "y": 300}},
      {"id": "goodbye", "type": "play", "config": {"text": "Thank you for your message. Goodbye."}, "position": {"x": 100, "y": 400}},
      {"id": "hangup", "type": "hangup", "config": {}, "position": {"x": 100, "y": 500}}
    ],
    "connections": [
      {"id": "c1", "source": "start", "target": "hours", "condition": {"type": "default"}},
      {"id": "c2", "source": "hours", "target": "voicemail", "condition": {"type": "default"}},
      {"id": "c3", "source": "voicemail", "target": "goodbye", "condition": {"type": "default"}},
      {"id": "c4", "source": "goodbye", "target": "hangup", "condition": {"type": "default"}}
    ],
    "entryNode": "start"
  }'::jsonb
),
(
  'Callback Option',
  'Offer callback when queue is busy',
  'support',
  true,
  '{
    "nodes": [
      {"id": "start", "type": "play", "config": {"text": "Thank you for calling support."}, "position": {"x": 100, "y": 100}},
      {"id": "check_queue", "type": "condition", "config": {"variable": "queue_wait_time", "operator": "gt", "value": 300}, "position": {"x": 100, "y": 200}},
      {"id": "offer_callback", "type": "menu", "config": {"text": "Current wait time is over 5 minutes. Press 1 to request a callback, or press 2 to continue waiting."}, "position": {"x": 0, "y": 300}},
      {"id": "collect_number", "type": "input", "config": {"text": "Please enter your callback number followed by the pound key.", "inputType": "phone"}, "position": {"x": -100, "y": 400}},
      {"id": "confirm", "type": "play", "config": {"text": "We will call you back within 30 minutes. Goodbye."}, "position": {"x": -100, "y": 500}},
      {"id": "transfer", "type": "transfer", "config": {"target": "queue:support"}, "position": {"x": 200, "y": 300}}
    ],
    "connections": [
      {"id": "c1", "source": "start", "target": "check_queue", "condition": {"type": "default"}},
      {"id": "c2", "source": "check_queue", "target": "offer_callback", "condition": {"type": "expression", "value": "true"}},
      {"id": "c3", "source": "check_queue", "target": "transfer", "condition": {"type": "expression", "value": "false"}},
      {"id": "c4", "source": "offer_callback", "target": "collect_number", "condition": {"type": "dtmf", "value": "1"}},
      {"id": "c5", "source": "offer_callback", "target": "transfer", "condition": {"type": "dtmf", "value": "2"}},
      {"id": "c6", "source": "collect_number", "target": "confirm", "condition": {"type": "default"}}
    ],
    "entryNode": "start"
  }'::jsonb
)
ON CONFLICT DO NOTHING;
