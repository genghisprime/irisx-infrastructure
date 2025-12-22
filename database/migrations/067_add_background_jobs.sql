-- Migration: 067_add_background_jobs.sql
-- Description: Background job processing system
-- Date: December 16, 2025

-- ===========================================
-- JOB QUEUES
-- ===========================================

CREATE TABLE IF NOT EXISTS job_queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    concurrency INTEGER DEFAULT 5, -- Max concurrent jobs
    retry_limit INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    timeout_seconds INTEGER DEFAULT 300,
    is_paused BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0, -- Higher = more priority
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Default queues
INSERT INTO job_queues (name, description, concurrency, priority) VALUES
    ('default', 'Default job queue', 10, 0),
    ('high', 'High priority jobs', 5, 100),
    ('low', 'Low priority background jobs', 3, -100),
    ('email', 'Email sending jobs', 5, 50),
    ('sms', 'SMS sending jobs', 5, 50),
    ('reports', 'Report generation jobs', 2, 10),
    ('imports', 'Data import jobs', 2, 20),
    ('exports', 'Data export jobs', 2, 10),
    ('webhooks', 'Webhook delivery jobs', 10, 75),
    ('campaigns', 'Campaign processing jobs', 5, 60),
    ('analytics', 'Analytics calculation jobs', 3, 5),
    ('cleanup', 'Cleanup and maintenance jobs', 1, -50)
ON CONFLICT (name) DO NOTHING;

-- ===========================================
-- JOBS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(100) NOT NULL DEFAULT 'default',
    job_type VARCHAR(100) NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled, scheduled
    priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE, -- For delayed/scheduled jobs
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    error_stack TEXT,
    progress INTEGER DEFAULT 0, -- 0-100 for progress tracking
    progress_message TEXT,
    worker_id VARCHAR(100), -- Which worker is processing
    locked_at TIMESTAMP WITH TIME ZONE, -- When worker locked the job
    lock_expires_at TIMESTAMP WITH TIME ZONE, -- When lock expires
    tags TEXT[], -- For filtering/grouping
    idempotency_key VARCHAR(255), -- Prevent duplicate jobs
    parent_job_id UUID REFERENCES jobs(id), -- For job chains
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_queue_status ON jobs(queue_name, status);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX idx_jobs_type ON jobs(job_type);
CREATE INDEX idx_jobs_created ON jobs(created_at);
CREATE INDEX idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_jobs_parent ON jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX idx_jobs_processing ON jobs(status, locked_at) WHERE status = 'processing';
CREATE INDEX idx_jobs_tags ON jobs USING GIN(tags);

-- ===========================================
-- JOB LOGS
-- ===========================================

CREATE TABLE IF NOT EXISTS job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level VARCHAR(20) DEFAULT 'info', -- debug, info, warn, error
    message TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_logs_job ON job_logs(job_id);
CREATE INDEX idx_job_logs_level ON job_logs(level);
CREATE INDEX idx_job_logs_created ON job_logs(created_at);

-- ===========================================
-- RECURRING JOBS (CRON)
-- ===========================================

CREATE TABLE IF NOT EXISTS recurring_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    queue_name VARCHAR(100) DEFAULT 'default',
    job_type VARCHAR(100) NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = system-wide
    cron_expression VARCHAR(100) NOT NULL, -- e.g., "0 * * * *" for hourly
    timezone VARCHAR(50) DEFAULT 'UTC',
    payload JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    last_job_id UUID REFERENCES jobs(id),
    run_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_jobs_next_run ON recurring_jobs(next_run_at) WHERE is_active = true;
CREATE INDEX idx_recurring_jobs_tenant ON recurring_jobs(tenant_id);

-- Default recurring jobs
INSERT INTO recurring_jobs (name, description, job_type, cron_expression, queue_name) VALUES
    ('cleanup_old_jobs', 'Clean up old completed/failed jobs', 'system.cleanup_jobs', '0 3 * * *', 'cleanup'),
    ('cleanup_sessions', 'Clean up expired sessions', 'system.cleanup_sessions', '0 * * * *', 'cleanup'),
    ('calculate_daily_metrics', 'Calculate daily analytics', 'analytics.daily_metrics', '0 1 * * *', 'analytics'),
    ('billing_daily_usage', 'Calculate daily billing usage', 'billing.daily_usage', '0 2 * * *', 'analytics'),
    ('health_snapshot', 'Record provider health snapshots', 'health.provider_snapshot', '*/15 * * * *', 'analytics'),
    ('send_scheduled_reports', 'Send scheduled reports', 'reports.send_scheduled', '0 6 * * *', 'reports'),
    ('process_dunning', 'Process dunning reminders', 'billing.process_dunning', '0 9 * * *', 'email'),
    ('cleanup_streaming_data', 'Clean up old streaming data', 'system.cleanup_streaming', '0 4 * * *', 'cleanup'),
    ('anomaly_detection', 'Run anomaly detection', 'analytics.anomaly_detection', '*/30 * * * *', 'analytics'),
    ('wfm_adherence_check', 'Check WFM adherence', 'wfm.adherence_check', '*/5 * * * *', 'default')
ON CONFLICT (name) DO NOTHING;

-- ===========================================
-- WORKERS
-- ===========================================

CREATE TABLE IF NOT EXISTS job_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id VARCHAR(100) NOT NULL UNIQUE,
    hostname VARCHAR(255),
    pid INTEGER,
    queues TEXT[] DEFAULT '{"default"}', -- Queues this worker handles
    status VARCHAR(20) DEFAULT 'active', -- active, paused, shutdown
    current_job_id UUID REFERENCES jobs(id),
    jobs_processed INTEGER DEFAULT 0,
    jobs_failed INTEGER DEFAULT 0,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    stopped_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_job_workers_status ON job_workers(status);
CREATE INDEX idx_job_workers_heartbeat ON job_workers(last_heartbeat);

-- ===========================================
-- JOB METRICS
-- ===========================================

CREATE TABLE IF NOT EXISTS job_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    queue_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(100),
    -- Counts
    jobs_created INTEGER DEFAULT 0,
    jobs_completed INTEGER DEFAULT 0,
    jobs_failed INTEGER DEFAULT 0,
    jobs_retried INTEGER DEFAULT 0,
    -- Timing
    avg_wait_time_ms INTEGER, -- Time in queue
    avg_execution_time_ms INTEGER,
    max_execution_time_ms INTEGER,
    -- Peak times
    peak_concurrent INTEGER DEFAULT 0,
    peak_queue_depth INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, queue_name, job_type)
);

CREATE INDEX idx_job_metrics_date ON job_metrics(date);
CREATE INDEX idx_job_metrics_queue ON job_metrics(queue_name);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to enqueue a job
CREATE OR REPLACE FUNCTION enqueue_job(
    p_job_type VARCHAR(100),
    p_payload JSONB DEFAULT '{}',
    p_queue_name VARCHAR(100) DEFAULT 'default',
    p_tenant_id UUID DEFAULT NULL,
    p_priority INTEGER DEFAULT 0,
    p_scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_idempotency_key VARCHAR(255) DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_parent_job_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_status VARCHAR(20);
    v_queue job_queues;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_job_id
        FROM jobs
        WHERE idempotency_key = p_idempotency_key
          AND created_at > NOW() - INTERVAL '24 hours';

        IF v_job_id IS NOT NULL THEN
            RETURN v_job_id; -- Return existing job
        END IF;
    END IF;

    -- Get queue config
    SELECT * INTO v_queue FROM job_queues WHERE name = p_queue_name;
    IF v_queue IS NULL THEN
        p_queue_name := 'default';
        SELECT * INTO v_queue FROM job_queues WHERE name = 'default';
    END IF;

    -- Determine status
    v_status := CASE WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() THEN 'scheduled' ELSE 'pending' END;

    -- Insert job
    INSERT INTO jobs (
        queue_name, job_type, tenant_id, payload, status, priority,
        max_attempts, scheduled_at, idempotency_key, tags, parent_job_id, created_by
    )
    VALUES (
        p_queue_name, p_job_type, p_tenant_id, p_payload, v_status,
        p_priority + v_queue.priority, v_queue.retry_limit,
        p_scheduled_at, p_idempotency_key, p_tags, p_parent_job_id, p_created_by
    )
    RETURNING id INTO v_job_id;

    -- Update metrics
    INSERT INTO job_metrics (date, queue_name, job_type, jobs_created)
    VALUES (CURRENT_DATE, p_queue_name, p_job_type, 1)
    ON CONFLICT (date, queue_name, job_type) DO UPDATE
    SET jobs_created = job_metrics.jobs_created + 1;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to fetch and lock next job
CREATE OR REPLACE FUNCTION fetch_next_job(
    p_worker_id VARCHAR(100),
    p_queues TEXT[] DEFAULT '{"default"}'
)
RETURNS jobs AS $$
DECLARE
    v_job jobs;
    v_lock_duration INTERVAL := '5 minutes';
BEGIN
    -- Find next available job
    SELECT j.* INTO v_job
    FROM jobs j
    JOIN job_queues q ON q.name = j.queue_name
    WHERE j.queue_name = ANY(p_queues)
      AND j.status IN ('pending', 'scheduled')
      AND (j.scheduled_at IS NULL OR j.scheduled_at <= NOW())
      AND q.is_paused = false
      AND (j.locked_at IS NULL OR j.lock_expires_at < NOW())
    ORDER BY j.priority DESC, j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job IS NULL THEN
        RETURN NULL;
    END IF;

    -- Lock the job
    UPDATE jobs
    SET
        status = 'processing',
        worker_id = p_worker_id,
        locked_at = NOW(),
        lock_expires_at = NOW() + v_lock_duration,
        started_at = COALESCE(started_at, NOW()),
        attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = v_job.id;

    -- Refresh and return
    SELECT * INTO v_job FROM jobs WHERE id = v_job.id;
    RETURN v_job;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a job
CREATE OR REPLACE FUNCTION complete_job(
    p_job_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_job jobs;
BEGIN
    SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

    UPDATE jobs
    SET
        status = 'completed',
        result = p_result,
        completed_at = NOW(),
        progress = 100,
        updated_at = NOW()
    WHERE id = p_job_id;

    -- Update metrics
    INSERT INTO job_metrics (date, queue_name, job_type, jobs_completed, avg_execution_time_ms)
    VALUES (
        CURRENT_DATE,
        v_job.queue_name,
        v_job.job_type,
        1,
        EXTRACT(EPOCH FROM (NOW() - v_job.started_at)) * 1000
    )
    ON CONFLICT (date, queue_name, job_type) DO UPDATE
    SET
        jobs_completed = job_metrics.jobs_completed + 1,
        avg_execution_time_ms = (
            COALESCE(job_metrics.avg_execution_time_ms, 0) * job_metrics.jobs_completed +
            EXTRACT(EPOCH FROM (NOW() - v_job.started_at)) * 1000
        ) / (job_metrics.jobs_completed + 1);
END;
$$ LANGUAGE plpgsql;

-- Function to fail a job
CREATE OR REPLACE FUNCTION fail_job(
    p_job_id UUID,
    p_error_message TEXT,
    p_error_stack TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_job jobs;
    v_should_retry BOOLEAN;
BEGIN
    SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

    v_should_retry := v_job.attempts < v_job.max_attempts;

    IF v_should_retry THEN
        -- Schedule retry
        UPDATE jobs
        SET
            status = 'pending',
            error_message = p_error_message,
            error_stack = p_error_stack,
            locked_at = NULL,
            lock_expires_at = NULL,
            worker_id = NULL,
            scheduled_at = NOW() + (INTERVAL '1 second' * (60 * POWER(2, v_job.attempts - 1))), -- Exponential backoff
            updated_at = NOW()
        WHERE id = p_job_id;

        -- Log retry
        INSERT INTO job_logs (job_id, level, message, data)
        VALUES (p_job_id, 'warn', 'Job failed, scheduling retry', jsonb_build_object('attempt', v_job.attempts, 'error', p_error_message));

        -- Update metrics
        INSERT INTO job_metrics (date, queue_name, job_type, jobs_retried)
        VALUES (CURRENT_DATE, v_job.queue_name, v_job.job_type, 1)
        ON CONFLICT (date, queue_name, job_type) DO UPDATE
        SET jobs_retried = job_metrics.jobs_retried + 1;
    ELSE
        -- Mark as failed
        UPDATE jobs
        SET
            status = 'failed',
            error_message = p_error_message,
            error_stack = p_error_stack,
            failed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_job_id;

        -- Log failure
        INSERT INTO job_logs (job_id, level, message, data)
        VALUES (p_job_id, 'error', 'Job failed permanently', jsonb_build_object('attempts', v_job.attempts, 'error', p_error_message));

        -- Update metrics
        INSERT INTO job_metrics (date, queue_name, job_type, jobs_failed)
        VALUES (CURRENT_DATE, v_job.queue_name, v_job.job_type, 1)
        ON CONFLICT (date, queue_name, job_type) DO UPDATE
        SET jobs_failed = job_metrics.jobs_failed + 1;
    END IF;

    RETURN v_should_retry;
END;
$$ LANGUAGE plpgsql;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
    p_job_id UUID,
    p_progress INTEGER,
    p_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE jobs
    SET
        progress = p_progress,
        progress_message = COALESCE(p_message, progress_message),
        lock_expires_at = NOW() + INTERVAL '5 minutes', -- Extend lock
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(
    p_completed_days INTEGER DEFAULT 7,
    p_failed_days INTEGER DEFAULT 30
)
RETURNS TABLE (deleted_completed INTEGER, deleted_failed INTEGER) AS $$
DECLARE
    v_completed INTEGER;
    v_failed INTEGER;
BEGIN
    DELETE FROM jobs
    WHERE status = 'completed'
      AND completed_at < NOW() - (p_completed_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_completed = ROW_COUNT;

    DELETE FROM jobs
    WHERE status = 'failed'
      AND failed_at < NOW() - (p_failed_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_failed = ROW_COUNT;

    RETURN QUERY SELECT v_completed, v_failed;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- NOTIFY TRIGGER
-- ===========================================

CREATE OR REPLACE FUNCTION notify_new_job()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_job', json_build_object(
        'job_id', NEW.id,
        'queue_name', NEW.queue_name,
        'job_type', NEW.job_type
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_new_job
    AFTER INSERT ON jobs
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
    EXECUTE FUNCTION notify_new_job();

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
