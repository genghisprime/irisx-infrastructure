/**
 * Background Job Processor Service
 * Handles job queuing, processing, and scheduling
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class JobProcessorService {
  constructor() {
    this.workers = new Map();
    this.handlers = new Map();
    this.isRunning = false;
    this.workerId = null;
  }

  /**
   * Register a job handler
   */
  registerHandler(jobType, handler) {
    this.handlers.set(jobType, handler);
  }

  /**
   * Enqueue a new job
   */
  async enqueue(tenantId, queueName, jobType, payload, options = {}) {
    const {
      priority = 0,
      scheduledFor = null,
      maxRetries = 3,
      timeoutSeconds = 300,
      idempotencyKey = null
    } = options;

    const result = await pool.query(
      `SELECT enqueue_job($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, queueName, jobType, JSON.stringify(payload), priority, scheduledFor, maxRetries, timeoutSeconds]
    );

    return result.rows[0].enqueue_job;
  }

  /**
   * Enqueue multiple jobs in a batch
   */
  async enqueueBatch(tenantId, jobs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const jobIds = [];
      for (const job of jobs) {
        const result = await client.query(
          `SELECT enqueue_job($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            job.queue || 'default',
            job.type,
            JSON.stringify(job.payload),
            job.priority || 0,
            job.scheduledFor || null,
            job.maxRetries || 3,
            job.timeoutSeconds || 300
          ]
        );
        jobIds.push(result.rows[0].enqueue_job);
      }

      await client.query('COMMIT');
      return jobIds;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    const result = await pool.query(
      `SELECT j.*, jq.name as queue_name, jq.concurrency_limit
       FROM jobs j
       JOIN job_queues jq ON j.queue_id = jq.id
       WHERE j.id = $1`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  /**
   * List jobs with filters
   */
  async listJobs(tenantId, filters = {}) {
    const {
      queue = null,
      status = null,
      jobType = null,
      limit = 50,
      offset = 0
    } = filters;

    let query = `
      SELECT j.*, jq.name as queue_name
      FROM jobs j
      JOIN job_queues jq ON j.queue_id = jq.id
      WHERE j.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (queue) {
      query += ` AND jq.name = $${paramIndex++}`;
      params.push(queue);
    }

    if (status) {
      query += ` AND j.status = $${paramIndex++}`;
      params.push(status);
    }

    if (jobType) {
      query += ` AND j.job_type = $${paramIndex++}`;
      params.push(jobType);
    }

    query += ` ORDER BY j.priority DESC, j.created_at ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId, tenantId) {
    const result = await pool.query(
      `UPDATE jobs
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [jobId, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId, tenantId) {
    const result = await pool.query(
      `UPDATE jobs
       SET status = 'pending',
           attempts = 0,
           error_message = NULL,
           error_details = NULL,
           scheduled_for = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'failed'
       RETURNING *`,
      [jobId, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get job logs
   */
  async getJobLogs(jobId, tenantId) {
    const result = await pool.query(
      `SELECT jl.* FROM job_logs jl
       JOIN jobs j ON jl.job_id = j.id
       WHERE jl.job_id = $1 AND j.tenant_id = $2
       ORDER BY jl.created_at ASC`,
      [jobId, tenantId]
    );
    return result.rows;
  }

  /**
   * Add a log entry to a job
   */
  async addJobLog(jobId, level, message, details = null) {
    await pool.query(
      `INSERT INTO job_logs (job_id, level, message, details)
       VALUES ($1, $2, $3, $4)`,
      [jobId, level, message, details ? JSON.stringify(details) : null]
    );
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId, progress, progressData = null) {
    await pool.query(
      `SELECT update_job_progress($1, $2, $3)`,
      [jobId, progress, progressData ? JSON.stringify(progressData) : null]
    );
  }

  // ===== QUEUE MANAGEMENT =====

  /**
   * List all queues
   */
  async listQueues() {
    const result = await pool.query(
      `SELECT jq.*,
              COUNT(j.id) FILTER (WHERE j.status = 'pending') as pending_count,
              COUNT(j.id) FILTER (WHERE j.status = 'processing') as processing_count,
              COUNT(j.id) FILTER (WHERE j.status = 'completed') as completed_count,
              COUNT(j.id) FILTER (WHERE j.status = 'failed') as failed_count
       FROM job_queues jq
       LEFT JOIN jobs j ON j.queue_id = jq.id
       GROUP BY jq.id
       ORDER BY jq.name`
    );
    return result.rows;
  }

  /**
   * Get queue by name
   */
  async getQueue(name) {
    const result = await pool.query(
      `SELECT jq.*,
              COUNT(j.id) FILTER (WHERE j.status = 'pending') as pending_count,
              COUNT(j.id) FILTER (WHERE j.status = 'processing') as processing_count
       FROM job_queues jq
       LEFT JOIN jobs j ON j.queue_id = jq.id
       WHERE jq.name = $1
       GROUP BY jq.id`,
      [name]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new queue
   */
  async createQueue(name, options = {}) {
    const {
      description = null,
      concurrencyLimit = 5,
      retryDelay = 60,
      maxRetries = 3,
      timeoutSeconds = 300,
      isPaused = false
    } = options;

    const result = await pool.query(
      `INSERT INTO job_queues (name, description, concurrency_limit, retry_delay_seconds, max_retries, timeout_seconds, is_paused)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description, concurrencyLimit, retryDelay, maxRetries, timeoutSeconds, isPaused]
    );
    return result.rows[0];
  }

  /**
   * Update queue settings
   */
  async updateQueue(name, updates) {
    const allowedFields = ['description', 'concurrency_limit', 'retry_delay_seconds', 'max_retries', 'timeout_seconds', 'is_paused'];
    const setClauses = [];
    const params = [name];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) return null;

    const result = await pool.query(
      `UPDATE job_queues SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE name = $1 RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(name) {
    return this.updateQueue(name, { isPaused: true });
  }

  /**
   * Resume a queue
   */
  async resumeQueue(name) {
    return this.updateQueue(name, { isPaused: false });
  }

  /**
   * Clear all pending jobs from a queue
   */
  async clearQueue(name) {
    const result = await pool.query(
      `DELETE FROM jobs
       WHERE queue_id = (SELECT id FROM job_queues WHERE name = $1)
         AND status = 'pending'
       RETURNING id`,
      [name]
    );
    return result.rowCount;
  }

  // ===== RECURRING JOBS =====

  /**
   * List recurring jobs
   */
  async listRecurringJobs() {
    const result = await pool.query(
      `SELECT rj.*, jq.name as queue_name
       FROM recurring_jobs rj
       JOIN job_queues jq ON rj.queue_id = jq.id
       ORDER BY rj.name`
    );
    return result.rows;
  }

  /**
   * Create a recurring job
   */
  async createRecurringJob(name, queueName, jobType, payload, cronExpression, options = {}) {
    const {
      description = null,
      timezone = 'UTC',
      maxRetries = 3,
      timeoutSeconds = 300,
      isEnabled = true
    } = options;

    const result = await pool.query(
      `INSERT INTO recurring_jobs (name, queue_id, job_type, payload, cron_expression, timezone, description, max_retries, timeout_seconds, is_enabled)
       SELECT $1, jq.id, $2, $3, $4, $5, $6, $7, $8, $9
       FROM job_queues jq WHERE jq.name = $10
       RETURNING *`,
      [name, jobType, JSON.stringify(payload), cronExpression, timezone, description, maxRetries, timeoutSeconds, isEnabled, queueName]
    );
    return result.rows[0];
  }

  /**
   * Update a recurring job
   */
  async updateRecurringJob(id, updates) {
    const allowedFields = ['name', 'cron_expression', 'timezone', 'description', 'payload', 'max_retries', 'timeout_seconds', 'is_enabled'];
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(dbField === 'payload' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length === 0) return null;

    const result = await pool.query(
      `UPDATE recurring_jobs SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Delete a recurring job
   */
  async deleteRecurringJob(id) {
    const result = await pool.query(
      `DELETE FROM recurring_jobs WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Enable/disable a recurring job
   */
  async toggleRecurringJob(id, isEnabled) {
    return this.updateRecurringJob(id, { isEnabled });
  }

  /**
   * Trigger a recurring job immediately
   */
  async triggerRecurringJob(id) {
    const job = await pool.query(
      `SELECT rj.*, jq.name as queue_name
       FROM recurring_jobs rj
       JOIN job_queues jq ON rj.queue_id = jq.id
       WHERE rj.id = $1`,
      [id]
    );

    if (!job.rows[0]) return null;

    const rj = job.rows[0];
    const jobId = await this.enqueue(
      null, // System job, no tenant
      rj.queue_name,
      rj.job_type,
      rj.payload,
      {
        maxRetries: rj.max_retries,
        timeoutSeconds: rj.timeout_seconds
      }
    );

    // Update last run time
    await pool.query(
      `UPDATE recurring_jobs SET last_run_at = NOW() WHERE id = $1`,
      [id]
    );

    return jobId;
  }

  // ===== WORKERS =====

  /**
   * Register a worker
   */
  async registerWorker(hostname, queues, pid = null) {
    const result = await pool.query(
      `INSERT INTO job_workers (hostname, queues, pid, started_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [hostname, queues, pid]
    );
    this.workerId = result.rows[0].id;
    return result.rows[0];
  }

  /**
   * Send worker heartbeat
   */
  async workerHeartbeat(workerId, currentJobId = null, memoryUsage = null, cpuUsage = null) {
    await pool.query(
      `UPDATE job_workers
       SET last_heartbeat = NOW(),
           current_job_id = $2,
           memory_usage_mb = $3,
           cpu_usage_percent = $4
       WHERE id = $1`,
      [workerId, currentJobId, memoryUsage, cpuUsage]
    );
  }

  /**
   * List active workers
   */
  async listWorkers() {
    const result = await pool.query(
      `SELECT jw.*,
              j.job_type as current_job_type,
              j.status as current_job_status
       FROM job_workers jw
       LEFT JOIN jobs j ON jw.current_job_id = j.id
       WHERE jw.status = 'active'
         AND jw.last_heartbeat > NOW() - INTERVAL '5 minutes'
       ORDER BY jw.started_at`
    );
    return result.rows;
  }

  /**
   * Shutdown a worker
   */
  async shutdownWorker(workerId) {
    await pool.query(
      `UPDATE job_workers
       SET status = 'stopped', stopped_at = NOW()
       WHERE id = $1`,
      [workerId]
    );
  }

  // ===== METRICS =====

  /**
   * Get job metrics for a queue
   */
  async getQueueMetrics(queueName, period = '1 hour') {
    const result = await pool.query(
      `SELECT
         jm.*
       FROM job_metrics jm
       JOIN job_queues jq ON jm.queue_id = jq.id
       WHERE jq.name = $1
         AND jm.period_start > NOW() - $2::interval
       ORDER BY jm.period_start DESC`,
      [queueName, period]
    );
    return result.rows;
  }

  /**
   * Get aggregate metrics across all queues
   */
  async getAggregateMetrics(period = '24 hours') {
    const result = await pool.query(
      `SELECT
         jq.name as queue_name,
         SUM(jm.jobs_enqueued) as total_enqueued,
         SUM(jm.jobs_completed) as total_completed,
         SUM(jm.jobs_failed) as total_failed,
         AVG(jm.avg_wait_time_seconds) as avg_wait_time,
         AVG(jm.avg_processing_time_seconds) as avg_processing_time,
         MAX(jm.max_wait_time_seconds) as max_wait_time,
         MAX(jm.max_processing_time_seconds) as max_processing_time
       FROM job_metrics jm
       JOIN job_queues jq ON jm.queue_id = jq.id
       WHERE jm.period_start > NOW() - $1::interval
       GROUP BY jq.name
       ORDER BY jq.name`,
      [period]
    );
    return result.rows;
  }

  /**
   * Get job throughput over time
   */
  async getThroughput(queueName = null, interval = '1 hour', periods = 24) {
    let query = `
      SELECT
        date_trunc($1, jm.period_start) as period,
        ${queueName ? '' : 'jq.name as queue_name,'}
        SUM(jm.jobs_completed) as completed,
        SUM(jm.jobs_failed) as failed,
        AVG(jm.avg_processing_time_seconds) as avg_processing_time
      FROM job_metrics jm
      JOIN job_queues jq ON jm.queue_id = jq.id
      WHERE jm.period_start > NOW() - ($2::integer * $1::interval)
    `;
    const params = [interval, periods];

    if (queueName) {
      query += ` AND jq.name = $3`;
      params.push(queueName);
    }

    query += `
      GROUP BY period${queueName ? '' : ', jq.name'}
      ORDER BY period DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ===== JOB PROCESSING =====

  /**
   * Fetch and process the next available job
   */
  async processNext(queueName) {
    const result = await pool.query(
      `SELECT fetch_next_job($1, $2)`,
      [queueName, this.workerId]
    );

    const jobId = result.rows[0]?.fetch_next_job;
    if (!jobId) return null;

    const job = await this.getJob(jobId);
    if (!job) return null;

    // Update worker status
    await this.workerHeartbeat(this.workerId, jobId);

    try {
      // Get handler for this job type
      const handler = this.handlers.get(job.job_type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.job_type}`);
      }

      // Execute the handler
      const startTime = Date.now();
      const result = await handler(job.payload, {
        jobId: job.id,
        tenantId: job.tenant_id,
        attempt: job.attempts,
        updateProgress: (progress, data) => this.updateProgress(job.id, progress, data),
        log: (level, message, details) => this.addJobLog(job.id, level, message, details)
      });

      const duration = Date.now() - startTime;

      // Mark as complete
      await pool.query(
        `SELECT complete_job($1, $2)`,
        [jobId, result ? JSON.stringify(result) : null]
      );

      await this.addJobLog(jobId, 'info', `Job completed in ${duration}ms`, { result });

      return { success: true, jobId, duration };
    } catch (error) {
      // Mark as failed
      await pool.query(
        `SELECT fail_job($1, $2, $3)`,
        [jobId, error.message, JSON.stringify({ stack: error.stack })]
      );

      await this.addJobLog(jobId, 'error', `Job failed: ${error.message}`, { stack: error.stack });

      return { success: false, jobId, error: error.message };
    } finally {
      // Clear worker's current job
      await this.workerHeartbeat(this.workerId, null);
    }
  }

  /**
   * Start the worker loop
   */
  async start(queues = ['default'], options = {}) {
    const {
      pollInterval = 1000,
      hostname = require('os').hostname()
    } = options;

    if (this.isRunning) {
      throw new Error('Worker is already running');
    }

    // Register worker
    await this.registerWorker(hostname, queues, process.pid);
    this.isRunning = true;

    console.log(`Job worker ${this.workerId} started, processing queues: ${queues.join(', ')}`);

    // Main processing loop
    while (this.isRunning) {
      let processed = false;

      for (const queue of queues) {
        const result = await this.processNext(queue);
        if (result) {
          processed = true;
          console.log(`Processed job ${result.jobId}: ${result.success ? 'success' : 'failed'}`);
        }
      }

      // If no jobs were processed, wait before polling again
      if (!processed) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Send heartbeat
      await this.workerHeartbeat(this.workerId);
    }
  }

  /**
   * Stop the worker
   */
  async stop() {
    this.isRunning = false;
    if (this.workerId) {
      await this.shutdownWorker(this.workerId);
    }
    console.log('Job worker stopped');
  }

  // ===== CLEANUP =====

  /**
   * Clean up old jobs
   */
  async cleanup(retentionDays = 30) {
    const result = await pool.query(
      `SELECT cleanup_old_jobs($1)`,
      [retentionDays]
    );
    return result.rows[0]?.cleanup_old_jobs || 0;
  }

  /**
   * Clean up stale workers (no heartbeat for 10 minutes)
   */
  async cleanupStaleWorkers() {
    const result = await pool.query(
      `UPDATE job_workers
       SET status = 'stopped', stopped_at = NOW()
       WHERE status = 'active'
         AND last_heartbeat < NOW() - INTERVAL '10 minutes'
       RETURNING id`
    );
    return result.rowCount;
  }

  /**
   * Requeue stuck jobs (processing but worker is dead)
   */
  async requeueStuckJobs() {
    const result = await pool.query(
      `UPDATE jobs
       SET status = 'pending',
           locked_by = NULL,
           locked_at = NULL,
           started_at = NULL
       WHERE status = 'processing'
         AND locked_at < NOW() - INTERVAL '1 hour'
       RETURNING id`
    );
    return result.rowCount;
  }

  // ===== DASHBOARD =====

  /**
   * Get dashboard stats
   */
  async getDashboard() {
    const [queues, workers, metrics, recentJobs] = await Promise.all([
      this.listQueues(),
      this.listWorkers(),
      this.getAggregateMetrics('24 hours'),
      pool.query(`
        SELECT j.*, jq.name as queue_name
        FROM jobs j
        JOIN job_queues jq ON j.queue_id = jq.id
        WHERE j.created_at > NOW() - INTERVAL '1 hour'
        ORDER BY j.created_at DESC
        LIMIT 20
      `)
    ]);

    const totals = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    for (const queue of queues) {
      totals.pending += parseInt(queue.pending_count || 0);
      totals.processing += parseInt(queue.processing_count || 0);
      totals.completed += parseInt(queue.completed_count || 0);
      totals.failed += parseInt(queue.failed_count || 0);
    }

    return {
      totals,
      queues,
      workers,
      metrics,
      recentJobs: recentJobs.rows
    };
  }
}

module.exports = new JobProcessorService();
