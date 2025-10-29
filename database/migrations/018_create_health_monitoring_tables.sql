-- Migration 018: Health Check & Monitoring System
-- Comprehensive system health monitoring and incident tracking

-- =====================================================
-- HEALTH CHECKS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS health_checks (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Component details
  component_name VARCHAR(100) NOT NULL,  -- api, database, redis, freeswitch, nats, s3, etc.
  component_type VARCHAR(50) NOT NULL,  -- service, database, cache, storage, queue
  endpoint VARCHAR(255),  -- URL or connection string (sanitized)

  -- Health status
  status VARCHAR(50) NOT NULL,  -- healthy, degraded, unhealthy, unknown
  response_time_ms INTEGER,  -- Response time in milliseconds

  -- Details
  message TEXT,
  error_message TEXT,
  metadata JSONB,  -- Additional diagnostic info

  -- Thresholds
  warning_threshold_ms INTEGER DEFAULT 1000,
  critical_threshold_ms INTEGER DEFAULT 5000,

  -- Timestamp
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_component_name ON health_checks(component_name);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_component_status ON health_checks(component_name, status, checked_at DESC);

-- =====================================================
-- SYSTEM METRICS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS system_metrics (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Metric details
  metric_name VARCHAR(100) NOT NULL,  -- cpu_usage, memory_usage, disk_usage, etc.
  metric_type VARCHAR(50) NOT NULL,  -- gauge, counter, histogram
  metric_value NUMERIC NOT NULL,
  metric_unit VARCHAR(20),  -- percent, bytes, milliseconds, count

  -- Source
  source VARCHAR(100),  -- api-server, freeswitch-server, worker-1
  host VARCHAR(255),

  -- Labels/Tags
  labels JSONB DEFAULT '{}'::jsonb,

  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_source ON system_metrics(source);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_source_time ON system_metrics(metric_name, source, recorded_at DESC);

-- Partition by month for performance
-- CREATE TABLE IF NOT EXISTS system_metrics_2025_01 PARTITION OF system_metrics
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- =====================================================
-- INCIDENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Incident details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(50) NOT NULL,  -- critical, major, minor, informational
  status VARCHAR(50) DEFAULT 'open',  -- open, investigating, identified, monitoring, resolved

  -- Affected components
  affected_components TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Impact
  impact_level VARCHAR(50),  -- complete_outage, partial_outage, degraded_performance, minor
  customers_affected INTEGER DEFAULT 0,

  -- Timeline
  started_at TIMESTAMPTZ DEFAULT NOW(),
  detected_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at - started_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  -- Assignment
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Root cause
  root_cause TEXT,
  resolution_notes TEXT,

  -- External communication
  public_message TEXT,
  is_public BOOLEAN DEFAULT FALSE,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to ON incidents(assigned_to);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_incidents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_incidents_updated_at
BEFORE UPDATE ON incidents
FOR EACH ROW
EXECUTE FUNCTION update_incidents_updated_at();

-- =====================================================
-- INCIDENT UPDATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS incident_updates (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Incident reference
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

  -- Update details
  status VARCHAR(50) NOT NULL,  -- investigating, identified, monitoring, resolved
  message TEXT NOT NULL,

  -- Author
  author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  author_name VARCHAR(255),

  -- Visibility
  is_public BOOLEAN DEFAULT FALSE,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_id ON incident_updates(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_updates_created_at ON incident_updates(created_at DESC);

-- =====================================================
-- UPTIME TRACKING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS uptime_records (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Component
  component_name VARCHAR(100) NOT NULL,

  -- Period
  period_type VARCHAR(50) NOT NULL,  -- hourly, daily, weekly, monthly
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Uptime metrics
  total_checks INTEGER NOT NULL DEFAULT 0,
  successful_checks INTEGER NOT NULL DEFAULT 0,
  failed_checks INTEGER NOT NULL DEFAULT 0,
  uptime_percent NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN total_checks > 0 THEN (successful_checks::NUMERIC / total_checks * 100)
      ELSE 100
    END
  ) STORED,

  -- Response times
  avg_response_time_ms NUMERIC,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,
  p95_response_time_ms INTEGER,
  p99_response_time_ms INTEGER,

  -- Downtime
  total_downtime_seconds INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uptime_records_component_name ON uptime_records(component_name);
CREATE INDEX IF NOT EXISTS idx_uptime_records_period ON uptime_records(period_type, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uptime_records_unique
  ON uptime_records(component_name, period_type, period_start);

-- =====================================================
-- ALERT RULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Rule details
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Condition
  metric_name VARCHAR(100) NOT NULL,
  condition_operator VARCHAR(10) NOT NULL,  -- >, <, >=, <=, ==, !=
  threshold_value NUMERIC NOT NULL,
  duration_seconds INTEGER DEFAULT 60,  -- Alert if condition persists for N seconds

  -- Actions
  severity VARCHAR(50) DEFAULT 'warning',  -- info, warning, critical
  notification_channels TEXT[] DEFAULT ARRAY['email']::TEXT[],
  notify_users BIGINT[] DEFAULT ARRAY[]::BIGINT[],

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_metric_name ON alert_rules(metric_name);
CREATE INDEX IF NOT EXISTS idx_alert_rules_is_active ON alert_rules(is_active);

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- Current system health summary
CREATE OR REPLACE VIEW system_health_summary AS
SELECT
  component_name,
  component_type,
  status,
  response_time_ms,
  message,
  checked_at,
  CASE
    WHEN checked_at < NOW() - INTERVAL '5 minutes' THEN 'stale'
    ELSE 'fresh'
  END as data_freshness
FROM (
  SELECT DISTINCT ON (component_name)
    component_name,
    component_type,
    status,
    response_time_ms,
    message,
    checked_at
  FROM health_checks
  ORDER BY component_name, checked_at DESC
) latest_checks;

-- Open incidents summary
CREATE OR REPLACE VIEW open_incidents_summary AS
SELECT
  i.id,
  i.uuid,
  i.title,
  i.severity,
  i.status,
  i.impact_level,
  i.customers_affected,
  i.started_at,
  EXTRACT(EPOCH FROM (NOW() - i.started_at))::INTEGER as duration_seconds,
  u.email as assigned_to_email,
  ARRAY_LENGTH(i.affected_components, 1) as num_affected_components
FROM incidents i
LEFT JOIN users u ON i.assigned_to = u.id
WHERE i.status != 'resolved'
ORDER BY
  CASE i.severity
    WHEN 'critical' THEN 1
    WHEN 'major' THEN 2
    WHEN 'minor' THEN 3
    ELSE 4
  END,
  i.started_at DESC;

-- Uptime SLA (last 30 days)
CREATE OR REPLACE VIEW uptime_sla_30days AS
SELECT
  component_name,
  AVG(uptime_percent) as avg_uptime_percent,
  MIN(uptime_percent) as min_uptime_percent,
  SUM(total_downtime_seconds) as total_downtime_seconds,
  COUNT(*) as num_periods
FROM uptime_records
WHERE period_start > NOW() - INTERVAL '30 days'
  AND period_type = 'daily'
GROUP BY component_name
ORDER BY avg_uptime_percent ASC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to record health check
CREATE OR REPLACE FUNCTION record_health_check(
  p_component_name VARCHAR,
  p_component_type VARCHAR,
  p_status VARCHAR,
  p_response_time_ms INTEGER,
  p_message TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_check_id BIGINT;
BEGIN
  INSERT INTO health_checks (
    component_name,
    component_type,
    status,
    response_time_ms,
    message,
    error_message,
    metadata
  ) VALUES (
    p_component_name,
    p_component_type,
    p_status,
    p_response_time_ms,
    p_message,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_check_id;

  RETURN v_check_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate uptime for a period
CREATE OR REPLACE FUNCTION calculate_uptime(
  p_component_name VARCHAR,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
) RETURNS TABLE(
  total_checks INTEGER,
  successful_checks INTEGER,
  failed_checks INTEGER,
  uptime_percent NUMERIC,
  avg_response_time NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_checks,
    COUNT(*) FILTER (WHERE status = 'healthy')::INTEGER as successful_checks,
    COUNT(*) FILTER (WHERE status != 'healthy')::INTEGER as failed_checks,
    ROUND((COUNT(*) FILTER (WHERE status = 'healthy')::NUMERIC / COUNT(*) * 100), 2) as uptime_percent,
    ROUND(AVG(response_time_ms), 2) as avg_response_time
  FROM health_checks
  WHERE component_name = p_component_name
    AND checked_at >= p_period_start
    AND checked_at < p_period_end;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Sample health checks
INSERT INTO health_checks (component_name, component_type, status, response_time_ms, message)
VALUES
  ('api', 'service', 'healthy', 45, 'API server responding normally'),
  ('database', 'database', 'healthy', 12, 'PostgreSQL connection successful'),
  ('redis', 'cache', 'healthy', 5, 'Redis responding'),
  ('freeswitch', 'service', 'healthy', 150, 'FreeSWITCH ESL connected');

-- Sample alert rules
INSERT INTO alert_rules (rule_name, description, metric_name, condition_operator, threshold_value, severity)
VALUES
  ('high_api_response_time', 'Alert when API response time exceeds threshold', 'api_response_time_ms', '>', 2000, 'warning'),
  ('low_disk_space', 'Alert when disk space falls below threshold', 'disk_usage_percent', '>', 90, 'critical'),
  ('high_error_rate', 'Alert when error rate is too high', 'error_rate_percent', '>', 5, 'warning'),
  ('database_connection_errors', 'Alert on database connection failures', 'database_errors', '>', 0, 'critical');

COMMIT;
