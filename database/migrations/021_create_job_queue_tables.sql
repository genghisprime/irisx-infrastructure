-- Migration 021: Background Job Queue System
-- Job tracking, scheduling, and monitoring for async processing

-- =====================================================
-- JOBS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Job identification
  job_name VARCHAR(100) NOT NULL,  -- webhook_delivery, send_email, send_sms, etc.
  job_type VARCHAR(50) NOT NULL,  -- delivery, notification, report, cleanup
  queue_name VARCHAR(50) NOT NULL DEFAULT 'default',

  -- Ownership
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,

  -- Job data
  payload JSONB NOT NULL,
  options JSONB,  -- Retry config, priority, etc.

  -- Status tracking
  status VARCHAR(50) DEFAULT 'queued',  -- queued, processing, completed, failed, delayed
  progress INTEGER DEFAULT 0,  -- 0-100 percentage

  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Results
  result JSONB,
  error_message TEXT,
  error_stack TEXT,

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Priority & scheduling
  priority INTEGER DEFAULT 0,  -- Higher = more priority
  scheduled_for TIMESTAMPTZ,  -- Future job scheduling
  delay_ms INTEGER DEFAULT 0,

  -- Performance
  processing_time_ms INTEGER,

  -- Metadata
  worker_id VARCHAR(100),  -- Which worker processed this
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue_name ON jobs(queue_name);
CREATE INDEX IF NOT EXISTS idx_jobs_job_name ON jobs(job_name);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_for ON jobs(scheduled_for) WHERE status = 'delayed';
CREATE INDEX IF NOT EXISTS idx_jobs_next_retry ON jobs(next_retry_at) WHERE status = 'failed' AND attempts < max_attempts;

-- Composite index for queue processing
CREATE INDEX IF NOT EXISTS idx_jobs_queue_processing
  ON jobs(queue_name, status, priority DESC, created_at ASC)
  WHERE status IN ('queued', 'failed');

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION update_jobs_updated_at();

-- =====================================================
-- JOB QUEUES TABLE (Queue configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS job_queues (
  id BIGSERIAL PRIMARY KEY,

  -- Queue configuration
  queue_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,

  -- Processing limits
  max_concurrent_jobs INTEGER DEFAULT 5,
  rate_limit_per_minute INTEGER DEFAULT 100,

  -- Retry configuration
  default_max_attempts INTEGER DEFAULT 3,
  default_backoff_ms INTEGER DEFAULT 5000,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_paused BOOLEAN DEFAULT FALSE,

  -- Stats (cached)
  total_jobs_processed BIGINT DEFAULT 0,
  total_jobs_failed BIGINT DEFAULT 0,
  avg_processing_time_ms INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queues_is_active ON job_queues(is_active);

-- =====================================================
-- SCHEDULED JOBS TABLE (Recurring jobs)
-- =====================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Job configuration
  job_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  job_type VARCHAR(50) NOT NULL,
  queue_name VARCHAR(50) NOT NULL DEFAULT 'scheduled',

  -- Scheduling
  cron_expression VARCHAR(100),  -- e.g., '0 0 * * *' for daily at midnight
  schedule_type VARCHAR(50) NOT NULL,  -- cron, interval, once

  -- For interval-based jobs
  interval_seconds INTEGER,

  -- Job payload template
  payload_template JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,

  -- Stats
  total_runs INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_is_active ON scheduled_jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = TRUE;

-- =====================================================
-- JOB DEPENDENCIES TABLE (Job chains)
-- =====================================================
CREATE TABLE IF NOT EXISTS job_dependencies (
  id BIGSERIAL PRIMARY KEY,

  -- Job relationships
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  depends_on_job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Status
  is_completed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent circular dependencies
  CONSTRAINT no_self_dependency CHECK (job_id != depends_on_job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_job_id ON job_dependencies(job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_depends_on ON job_dependencies(depends_on_job_id);

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- Queue statistics
CREATE OR REPLACE VIEW job_queue_stats AS
SELECT
  queue_name,
  COUNT(*) FILTER (WHERE status = 'queued') as queued_count,
  COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'delayed') as delayed_count,
  ROUND(AVG(processing_time_ms), 2) as avg_processing_time_ms,
  MAX(created_at) as last_job_added
FROM jobs
GROUP BY queue_name;

-- Failed jobs requiring attention
CREATE OR REPLACE VIEW failed_jobs_requiring_attention AS
SELECT
  j.id,
  j.uuid,
  j.job_name,
  j.queue_name,
  j.attempts,
  j.max_attempts,
  j.error_message,
  j.failed_at,
  j.next_retry_at
FROM jobs j
WHERE j.status = 'failed'
  AND j.attempts < j.max_attempts
  AND (j.next_retry_at IS NULL OR j.next_retry_at <= NOW())
ORDER BY j.priority DESC, j.created_at ASC;

-- Job processing performance (last 24 hours)
CREATE OR REPLACE VIEW job_performance_24h AS
SELECT
  job_name,
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(AVG(processing_time_ms), 2) as avg_time_ms,
  ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as success_rate
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY job_name
ORDER BY total_jobs DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Calculate next retry time with exponential backoff
CREATE OR REPLACE FUNCTION calculate_job_retry_time(
  p_attempts INTEGER,
  p_backoff_ms INTEGER DEFAULT 5000
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  -- Exponential backoff: backoff_ms * (2 ^ attempts)
  -- Capped at 1 hour
  RETURN NOW() + INTERVAL '1 millisecond' * LEAST(
    p_backoff_ms * POWER(2, p_attempts),
    3600000  -- Max 1 hour
  );
END;
$$ LANGUAGE plpgsql;

-- Mark job as completed
CREATE OR REPLACE FUNCTION complete_job(
  p_job_id BIGINT,
  p_result JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE jobs
  SET status = 'completed',
      completed_at = NOW(),
      result = p_result,
      processing_time_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000
  WHERE id = p_job_id;

  -- Mark dependent jobs as ready
  UPDATE job_dependencies
  SET is_completed = TRUE
  WHERE depends_on_job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Mark job as failed
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id BIGINT,
  p_error_message TEXT,
  p_error_stack TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_job RECORD;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF v_job.attempts + 1 < v_job.max_attempts THEN
    -- Can retry
    UPDATE jobs
    SET status = 'failed',
        failed_at = NOW(),
        error_message = p_error_message,
        error_stack = p_error_stack,
        attempts = attempts + 1,
        next_retry_at = calculate_job_retry_time(attempts + 1)
    WHERE id = p_job_id;
  ELSE
    -- Max attempts reached
    UPDATE jobs
    SET status = 'failed',
        failed_at = NOW(),
        error_message = p_error_message,
        error_stack = p_error_stack,
        attempts = attempts + 1
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old completed jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM jobs
  WHERE status = 'completed'
    AND completed_at < NOW() - MAKE_INTERVAL(days := retention_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DEFAULT QUEUES
-- =====================================================
INSERT INTO job_queues (queue_name, description, max_concurrent_jobs, rate_limit_per_minute) VALUES
  ('default', 'Default job queue', 10, 100),
  ('webhooks', 'Webhook delivery queue', 20, 200),
  ('emails', 'Email sending queue', 15, 150),
  ('sms', 'SMS sending queue', 15, 150),
  ('reports', 'Report generation queue', 5, 50),
  ('cleanup', 'Cleanup and maintenance tasks', 3, 30),
  ('scheduled', 'Scheduled/recurring jobs', 5, 50);

-- =====================================================
-- DEFAULT SCHEDULED JOBS
-- =====================================================
INSERT INTO scheduled_jobs (job_name, description, job_type, schedule_type, cron_expression, payload_template) VALUES
  ('cleanup_old_jobs', 'Clean up old completed jobs', 'cleanup', 'cron', '0 0 * * *', '{"retention_days": 30}'::jsonb),
  ('cleanup_old_audit_logs', 'Clean up old audit logs', 'cleanup', 'cron', '0 1 * * *', '{"retention_days": 365}'::jsonb),
  ('reset_expired_quotas', 'Reset expired usage quotas', 'maintenance', 'cron', '0 * * * *', '{}'::jsonb),
  ('check_expiring_api_keys', 'Check for expiring API keys', 'notification', 'cron', '0 9 * * *', '{"days_threshold": 30}'::jsonb);

COMMIT;
