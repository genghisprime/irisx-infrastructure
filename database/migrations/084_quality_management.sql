-- =====================================================
-- Migration: Quality Management System
-- Description: Tables for call evaluation, scorecards, and agent coaching
-- Date: 2026-02-16
-- =====================================================

-- =====================================================
-- 1. Quality Scorecards (evaluation templates)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_scorecards (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general', -- general, sales, support, compliance
  is_active BOOLEAN DEFAULT true,
  passing_score DECIMAL(5,2) DEFAULT 70.00,
  auto_fail_enabled BOOLEAN DEFAULT false, -- If any auto-fail criteria fails, whole evaluation fails
  weight_total DECIMAL(5,2) DEFAULT 100.00,
  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX idx_scorecards_tenant ON quality_scorecards(tenant_id);
CREATE INDEX idx_scorecards_active ON quality_scorecards(tenant_id, is_active);

-- =====================================================
-- 2. Scorecard Sections (grouping of criteria)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_scorecard_sections (
  id SERIAL PRIMARY KEY,
  scorecard_id INTEGER NOT NULL REFERENCES quality_scorecards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  weight DECIMAL(5,2) DEFAULT 0, -- Percentage of total score
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sections_scorecard ON quality_scorecard_sections(scorecard_id);

-- =====================================================
-- 3. Evaluation Criteria (individual scoring items)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_criteria (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES quality_scorecard_sections(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  criteria_type VARCHAR(20) DEFAULT 'rating', -- rating, yes_no, scale, text
  max_points DECIMAL(5,2) DEFAULT 10,
  weight DECIMAL(5,2) DEFAULT 1, -- Weight within section
  is_auto_fail BOOLEAN DEFAULT false, -- If failed, entire evaluation fails
  is_required BOOLEAN DEFAULT true,
  guidance_text TEXT, -- Help text for evaluators
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_criteria_section ON quality_criteria(section_id);

-- =====================================================
-- 4. Criteria Options (for rating/scale types)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_criteria_options (
  id SERIAL PRIMARY KEY,
  criteria_id INTEGER NOT NULL REFERENCES quality_criteria(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  value DECIMAL(5,2) NOT NULL, -- Point value
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_options_criteria ON quality_criteria_options(criteria_id);

-- =====================================================
-- 5. Quality Evaluations (actual evaluations)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_evaluations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scorecard_id INTEGER NOT NULL REFERENCES quality_scorecards(id),
  call_id VARCHAR(100), -- Reference to calls table UUID
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  evaluator_id INTEGER NOT NULL REFERENCES agents(id),
  evaluation_type VARCHAR(20) DEFAULT 'random', -- random, targeted, calibration, self
  status VARCHAR(20) DEFAULT 'draft', -- draft, completed, disputed, reviewed
  total_score DECIMAL(5,2),
  passing_score DECIMAL(5,2),
  passed BOOLEAN,
  auto_failed BOOLEAN DEFAULT false,
  auto_fail_reason TEXT,
  feedback TEXT,
  agent_comments TEXT,
  dispute_reason TEXT,
  dispute_status VARCHAR(20), -- pending, accepted, rejected
  dispute_resolved_at TIMESTAMPTZ,
  dispute_resolved_by INTEGER REFERENCES agents(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evaluations_tenant ON quality_evaluations(tenant_id);
CREATE INDEX idx_evaluations_agent ON quality_evaluations(agent_id);
CREATE INDEX idx_evaluations_evaluator ON quality_evaluations(evaluator_id);
CREATE INDEX idx_evaluations_call ON quality_evaluations(call_id);
CREATE INDEX idx_evaluations_status ON quality_evaluations(tenant_id, status);
CREATE INDEX idx_evaluations_date ON quality_evaluations(tenant_id, created_at);

-- =====================================================
-- 6. Evaluation Responses (individual criteria scores)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_evaluation_responses (
  id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES quality_evaluations(id) ON DELETE CASCADE,
  criteria_id INTEGER NOT NULL REFERENCES quality_criteria(id),
  score DECIMAL(5,2),
  selected_option_id INTEGER REFERENCES quality_criteria_options(id),
  text_response TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responses_evaluation ON quality_evaluation_responses(evaluation_id);

-- =====================================================
-- 7. Calibration Sessions (evaluator alignment)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_calibration_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scorecard_id INTEGER REFERENCES quality_scorecards(id),
  call_id VARCHAR(100),
  facilitator_id INTEGER REFERENCES agents(id),
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed
  target_score DECIMAL(5,2), -- "Correct" score for calibration
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calibration_tenant ON quality_calibration_sessions(tenant_id);
CREATE INDEX idx_calibration_status ON quality_calibration_sessions(status);

-- =====================================================
-- 8. Calibration Participants
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_calibration_participants (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES quality_calibration_sessions(id) ON DELETE CASCADE,
  evaluator_id INTEGER NOT NULL REFERENCES agents(id),
  evaluation_id INTEGER REFERENCES quality_evaluations(id),
  variance_score DECIMAL(5,2), -- Difference from target
  attended BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calibration_participants ON quality_calibration_participants(session_id);

-- =====================================================
-- 9. Agent Coaching Sessions
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_coaching_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  coach_id INTEGER NOT NULL REFERENCES agents(id),
  evaluation_id INTEGER REFERENCES quality_evaluations(id),
  session_type VARCHAR(30) DEFAULT 'one_on_one', -- one_on_one, group, side_by_side
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
  title VARCHAR(255),
  focus_areas TEXT[], -- Array of areas to focus on
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  action_items JSONB DEFAULT '[]', -- [{task, due_date, status}]
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coaching_tenant ON quality_coaching_sessions(tenant_id);
CREATE INDEX idx_coaching_agent ON quality_coaching_sessions(agent_id);
CREATE INDEX idx_coaching_coach ON quality_coaching_sessions(coach_id);
CREATE INDEX idx_coaching_status ON quality_coaching_sessions(status);
CREATE INDEX idx_coaching_scheduled ON quality_coaching_sessions(scheduled_at);

-- =====================================================
-- 10. Coaching Attachments
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_coaching_attachments (
  id SERIAL PRIMARY KEY,
  coaching_session_id INTEGER NOT NULL REFERENCES quality_coaching_sessions(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  file_url TEXT,
  uploaded_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coaching_attachments ON quality_coaching_attachments(coaching_session_id);

-- =====================================================
-- 11. Quality Goals & Targets
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_goals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES agents(id), -- NULL = team goal
  queue_id INTEGER REFERENCES queues(id),
  metric_type VARCHAR(50) NOT NULL, -- avg_score, evaluations_count, pass_rate, improvement_rate
  target_value DECIMAL(10,2) NOT NULL,
  period_type VARCHAR(20) DEFAULT 'monthly', -- daily, weekly, monthly, quarterly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  current_value DECIMAL(10,2) DEFAULT 0,
  achieved BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_tenant ON quality_goals(tenant_id);
CREATE INDEX idx_goals_agent ON quality_goals(agent_id);
CREATE INDEX idx_goals_period ON quality_goals(period_start, period_end);

-- =====================================================
-- 12. Quality Alerts & Notifications
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_alerts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- low_score, auto_fail, dispute, goal_at_risk, trending_down
  severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
  agent_id INTEGER REFERENCES agents(id),
  evaluation_id INTEGER REFERENCES quality_evaluations(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  read_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_tenant ON quality_alerts(tenant_id);
CREATE INDEX idx_alerts_unread ON quality_alerts(tenant_id, is_read) WHERE is_read = false;

-- =====================================================
-- 13. Sample Default Scorecard
-- =====================================================

-- Insert default scorecard for testing
INSERT INTO quality_scorecards (tenant_id, name, description, category, passing_score)
SELECT 1, 'Standard Call Quality', 'Default scorecard for evaluating customer service calls', 'support', 75.00
WHERE NOT EXISTS (SELECT 1 FROM quality_scorecards WHERE tenant_id = 1 AND name = 'Standard Call Quality');

-- Insert sections
INSERT INTO quality_scorecard_sections (scorecard_id, name, weight, sort_order)
SELECT s.id, section_name, weight, sort_order
FROM quality_scorecards s
CROSS JOIN (VALUES
  ('Opening & Greeting', 15.00, 1),
  ('Needs Assessment', 25.00, 2),
  ('Solution & Resolution', 30.00, 3),
  ('Communication Skills', 20.00, 4),
  ('Closing', 10.00, 5)
) AS data(section_name, weight, sort_order)
WHERE s.name = 'Standard Call Quality' AND s.tenant_id = 1
AND NOT EXISTS (
  SELECT 1 FROM quality_scorecard_sections ss
  WHERE ss.scorecard_id = s.id AND ss.name = data.section_name
);

-- Insert sample criteria for Opening section
INSERT INTO quality_criteria (section_id, name, description, criteria_type, max_points, is_auto_fail, guidance_text, sort_order)
SELECT s.id, criteria_name, description, criteria_type, max_points, is_auto_fail, guidance, sort_order
FROM quality_scorecard_sections s
JOIN quality_scorecards sc ON s.scorecard_id = sc.id
CROSS JOIN (VALUES
  ('Professional Greeting', 'Agent answered with proper company greeting', 'yes_no', 5.00, false, 'Agent should state company name and their name', 1),
  ('Identity Verification', 'Agent verified customer identity properly', 'yes_no', 5.00, true, 'Security requirement - auto-fail if not done', 2),
  ('Active Listening', 'Agent demonstrated active listening throughout', 'rating', 5.00, false, 'Look for acknowledgment, paraphrasing, clarifying questions', 3)
) AS data(criteria_name, description, criteria_type, max_points, is_auto_fail, guidance, sort_order)
WHERE s.name = 'Opening & Greeting' AND sc.tenant_id = 1
AND NOT EXISTS (
  SELECT 1 FROM quality_criteria qc WHERE qc.section_id = s.id AND qc.name = data.criteria_name
);

-- =====================================================
-- Views for Reporting
-- =====================================================

CREATE OR REPLACE VIEW quality_agent_summary AS
SELECT
  e.tenant_id,
  e.agent_id,
  a.name as agent_name,
  COUNT(*) as total_evaluations,
  COUNT(*) FILTER (WHERE e.status = 'completed') as completed_evaluations,
  AVG(e.total_score) as avg_score,
  COUNT(*) FILTER (WHERE e.passed = true) as passed_count,
  COUNT(*) FILTER (WHERE e.passed = false) as failed_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE e.passed = true) / NULLIF(COUNT(*) FILTER (WHERE e.status = 'completed'), 0), 2) as pass_rate,
  MIN(e.total_score) as min_score,
  MAX(e.total_score) as max_score,
  COUNT(*) FILTER (WHERE e.auto_failed = true) as auto_fail_count,
  COUNT(*) FILTER (WHERE e.dispute_status = 'pending') as pending_disputes
FROM quality_evaluations e
JOIN agents a ON e.agent_id = a.id
WHERE e.status = 'completed'
GROUP BY e.tenant_id, e.agent_id, a.name;

CREATE OR REPLACE VIEW quality_evaluator_summary AS
SELECT
  e.tenant_id,
  e.evaluator_id,
  a.name as evaluator_name,
  COUNT(*) as total_evaluations,
  AVG(e.total_score) as avg_score_given,
  STDDEV(e.total_score) as score_stddev,
  COUNT(*) FILTER (WHERE e.dispute_status IS NOT NULL) as disputed_count,
  COUNT(*) FILTER (WHERE e.dispute_status = 'accepted') as disputes_accepted
FROM quality_evaluations e
JOIN agents a ON e.evaluator_id = a.id
WHERE e.status = 'completed'
GROUP BY e.tenant_id, e.evaluator_id, a.name;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE quality_scorecards IS 'Evaluation templates with sections and criteria';
COMMENT ON TABLE quality_evaluations IS 'Individual call/interaction evaluations';
COMMENT ON TABLE quality_coaching_sessions IS 'One-on-one and group coaching sessions';
COMMENT ON TABLE quality_calibration_sessions IS 'Calibration sessions for evaluator alignment';
COMMENT ON TABLE quality_goals IS 'Quality targets for agents and teams';
