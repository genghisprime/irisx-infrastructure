/**
 * Job Queue Service
 * Bull + Redis for async job processing with retry logic
 */

import { query } from '../db/index.js';

class JobQueueService {
  constructor() {
    this.queues = new Map();
    this.workers = new Map();
  }

  /**
   * Create a new job
   */
  async createJob(jobData) {
    const {
      tenant_id,
      job_name,
      job_type,
      queue_name = 'default',
      payload,
      options = {},
      priority = 0,
      scheduled_for = null,
      delay_ms = 0,
      max_attempts = 3
    } = jobData;

    const sql = `
      INSERT INTO jobs (
        tenant_id, job_name, job_type, queue_name, payload, options,
        priority, scheduled_for, delay_ms, max_attempts, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const status = scheduled_for || delay_ms > 0 ? 'delayed' : 'queued';

    const result = await query(sql, [
      tenant_id, job_name, job_type, queue_name,
      JSON.stringify(payload),
      JSON.stringify(options),
      priority, scheduled_for, delay_ms, max_attempts, status
    ]);

    return result.rows[0];
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    const sql = `SELECT * FROM jobs WHERE id = $1`;
    const result = await query(sql, [jobId]);

    if (result.rows.length === 0) {
      throw new Error('Job not found');
    }

    return result.rows[0];
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, updateData = {}) {
    const fields = ['status = $2'];
    const params = [jobId, status];
    let paramIndex = 3;

    if (status === 'processing') {
      fields.push(`started_at = NOW()`);
      if (updateData.worker_id) {
        fields.push(`worker_id = $${paramIndex}`);
        params.push(updateData.worker_id);
        paramIndex++;
      }
    } else if (status === 'completed') {
      fields.push(`completed_at = NOW()`);
      fields.push(`processing_time_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000`);
      if (updateData.result) {
        fields.push(`result = $${paramIndex}`);
        params.push(JSON.stringify(updateData.result));
        paramIndex++;
      }
      if (updateData.progress !== undefined) {
        fields.push(`progress = $${paramIndex}`);
        params.push(100);
        paramIndex++;
      }
    } else if (status === 'failed') {
      fields.push(`failed_at = NOW()`);
      fields.push(`attempts = attempts + 1`);
      if (updateData.error_message) {
        fields.push(`error_message = $${paramIndex}`);
        params.push(updateData.error_message);
        paramIndex++;
      }
      if (updateData.error_stack) {
        fields.push(`error_stack = $${paramIndex}`);
        params.push(updateData.error_stack);
        paramIndex++;
      }
    }

    const sql = `
      UPDATE jobs
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, params);
    return result.rows[0];
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, result = null) {
    const sql = `SELECT complete_job($1, $2)`;
    await query(sql, [jobId, result ? JSON.stringify(result) : null]);

    return await this.getJob(jobId);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, errorMessage, errorStack = null) {
    const sql = `SELECT fail_job($1, $2, $3)`;
    await query(sql, [jobId, errorMessage, errorStack]);

    return await this.getJob(jobId);
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId, progress) {
    const sql = `
      UPDATE jobs
      SET progress = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(sql, [jobId, progress]);
    return result.rows[0];
  }

  /**
   * Get next job from queue
   */
  async getNextJob(queueName) {
    const sql = `
      SELECT * FROM jobs
      WHERE queue_name = $1
        AND status IN ('queued', 'failed')
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const result = await query(sql, [queueName]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * List jobs by status
   */
  async listJobs(filters = {}) {
    const {
      tenant_id,
      queue_name,
      status,
      job_name,
      limit = 100,
      offset = 0
    } = filters;

    let sql = `SELECT * FROM jobs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (tenant_id) {
      sql += ` AND tenant_id = $${paramIndex}`;
      params.push(tenant_id);
      paramIndex++;
    }

    if (queue_name) {
      sql += ` AND queue_name = $${paramIndex}`;
      params.push(queue_name);
      paramIndex++;
    }

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (job_name) {
      sql += ` AND job_name = $${paramIndex}`;
      params.push(job_name);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName = null) {
    let sql = `SELECT * FROM job_queue_stats`;

    if (queueName) {
      sql += ` WHERE queue_name = $1`;
      const result = await query(sql, [queueName]);
      return result.rows[0] || null;
    }

    const result = await query(sql);
    return result.rows;
  }

  /**
   * Get failed jobs requiring retry
   */
  async getFailedJobsForRetry() {
    const sql = `SELECT * FROM failed_jobs_requiring_attention LIMIT 100`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Get job performance metrics
   */
  async getPerformanceMetrics(hours = 24) {
    const sql = `SELECT * FROM job_performance_24h`;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId) {
    const sql = `
      UPDATE jobs
      SET status = 'queued',
          next_retry_at = NULL,
          error_message = NULL,
          error_stack = NULL
      WHERE id = $1
        AND status = 'failed'
        AND attempts < max_attempts
      RETURNING *
    `;

    const result = await query(sql, [jobId]);

    if (result.rows.length === 0) {
      throw new Error('Job cannot be retried');
    }

    return result.rows[0];
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    const sql = `
      UPDATE jobs
      SET status = 'failed',
          failed_at = NOW(),
          error_message = 'Job cancelled by user'
      WHERE id = $1
        AND status IN ('queued', 'delayed')
      RETURNING *
    `;

    const result = await query(sql, [jobId]);

    if (result.rows.length === 0) {
      throw new Error('Job cannot be cancelled');
    }

    return result.rows[0];
  }

  /**
   * Create scheduled job
   */
  async createScheduledJob(scheduledJobData) {
    const {
      job_name,
      description,
      job_type,
      queue_name = 'scheduled',
      cron_expression,
      schedule_type,
      interval_seconds,
      payload_template
    } = scheduledJobData;

    const sql = `
      INSERT INTO scheduled_jobs (
        job_name, description, job_type, queue_name,
        cron_expression, schedule_type, interval_seconds, payload_template
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await query(sql, [
      job_name, description, job_type, queue_name,
      cron_expression, schedule_type, interval_seconds,
      JSON.stringify(payload_template)
    ]);

    return result.rows[0];
  }

  /**
   * Get scheduled jobs
   */
  async getScheduledJobs(isActive = true) {
    let sql = `SELECT * FROM scheduled_jobs`;

    if (isActive !== null) {
      sql += ` WHERE is_active = $1`;
      const result = await query(sql, [isActive]);
      return result.rows;
    }

    const result = await query(sql);
    return result.rows;
  }

  /**
   * Update scheduled job
   */
  async updateScheduledJob(jobName, updates) {
    const allowedFields = [
      'description', 'cron_expression', 'interval_seconds',
      'payload_template', 'is_active'
    ];

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(jobName);
    const sql = `
      UPDATE scheduled_jobs
      SET ${updateFields.join(', ')}
      WHERE job_name = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error('Scheduled job not found');
    }

    return result.rows[0];
  }

  /**
   * Cleanup old completed jobs
   */
  async cleanupOldJobs(retentionDays = 30) {
    const sql = `SELECT cleanup_old_jobs($1) as deleted_count`;
    const result = await query(sql, [retentionDays]);
    return result.rows[0].deleted_count;
  }

  /**
   * Get job dependencies
   */
  async getJobDependencies(jobId) {
    const sql = `
      SELECT j.*
      FROM job_dependencies jd
      JOIN jobs j ON jd.depends_on_job_id = j.id
      WHERE jd.job_id = $1
    `;

    const result = await query(sql, [jobId]);
    return result.rows;
  }

  /**
   * Add job dependency
   */
  async addJobDependency(jobId, dependsOnJobId) {
    const sql = `
      INSERT INTO job_dependencies (job_id, depends_on_job_id)
      VALUES ($1, $2)
      RETURNING *
    `;

    const result = await query(sql, [jobId, dependsOnJobId]);
    return result.rows[0];
  }
}

export default new JobQueueService();
