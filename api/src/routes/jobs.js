import { Hono } from 'hono';
import JobQueueService from '../services/jobQueue.js';
import { z } from 'zod';

const app = new Hono();
const jobQueueService = new JobQueueService();

// Validation schemas
const createJobSchema = z.object({
  tenant_id: z.number().int().positive(),
  job_name: z.string().min(1).max(100),
  job_type: z.string().min(1).max(50),
  queue_name: z.string().max(50).optional().default('default'),
  payload: z.record(z.any()),
  priority: z.number().int().min(0).max(10).optional().default(0),
  scheduled_for: z.string().datetime().optional(),
  delay_ms: z.number().int().min(0).optional(),
  max_attempts: z.number().int().min(1).max(10).optional().default(3),
});

const updateJobSchema = z.object({
  status: z.enum(['queued', 'delayed', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  progress: z.number().min(0).max(100).optional(),
});

const retryJobSchema = z.object({
  reset_attempts: z.boolean().optional().default(false),
});

const createScheduledJobSchema = z.object({
  job_name: z.string().min(1).max(100),
  job_type: z.string().min(1).max(50),
  queue_name: z.string().max(50).optional().default('default'),
  schedule_type: z.enum(['cron', 'interval']),
  cron_expression: z.string().optional(),
  interval_seconds: z.number().int().positive().optional(),
  payload_template: z.record(z.any()).optional(),
  enabled: z.boolean().optional().default(true),
});

/**
 * POST /v1/jobs
 * Create a new job
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createJobSchema.parse(body);

    const job = await jobQueueService.createJob(validatedData);

    return c.json({
      success: true,
      data: job,
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error creating job:', error);
    return c.json({
      success: false,
      error: 'Failed to create job',
    }, 500);
  }
});

/**
 * GET /v1/jobs
 * List jobs with filtering
 */
app.get('/', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));
    const queue_name = c.req.query('queue_name');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const filters = {
      tenant_id,
      queue_name,
      status,
    };

    const jobs = await jobQueueService.listJobs(filters, limit, offset);

    return c.json({
      success: true,
      data: jobs,
      pagination: {
        limit,
        offset,
        count: jobs.length,
      },
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    return c.json({
      success: false,
      error: 'Failed to list jobs',
    }, 500);
  }
});

/**
 * GET /v1/jobs/:id
 * Get a single job by ID
 */
app.get('/:id', async (c) => {
  try {
    const jobId = parseInt(c.req.param('id'));

    if (!jobId) {
      return c.json({
        success: false,
        error: 'Invalid job ID',
      }, 400);
    }

    const job = await jobQueueService.getJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch job',
    }, 500);
  }
});

/**
 * PATCH /v1/jobs/:id
 * Update job status or progress
 */
app.patch('/:id', async (c) => {
  try {
    const jobId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validatedData = updateJobSchema.parse(body);

    if (!jobId) {
      return c.json({
        success: false,
        error: 'Invalid job ID',
      }, 400);
    }

    const job = await jobQueueService.updateJobStatus(jobId, validatedData.status, validatedData.progress);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: job,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error updating job:', error);
    return c.json({
      success: false,
      error: 'Failed to update job',
    }, 500);
  }
});

/**
 * POST /v1/jobs/:id/retry
 * Retry a failed job
 */
app.post('/:id/retry', async (c) => {
  try {
    const jobId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    const { reset_attempts } = retryJobSchema.parse(body);

    if (!jobId) {
      return c.json({
        success: false,
        error: 'Invalid job ID',
      }, 400);
    }

    const job = await jobQueueService.retryJob(jobId, reset_attempts);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found or cannot be retried',
      }, 404);
    }

    return c.json({
      success: true,
      data: job,
      message: 'Job queued for retry',
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error retrying job:', error);
    return c.json({
      success: false,
      error: 'Failed to retry job',
    }, 500);
  }
});

/**
 * POST /v1/jobs/:id/cancel
 * Cancel a job
 */
app.post('/:id/cancel', async (c) => {
  try {
    const jobId = parseInt(c.req.param('id'));

    if (!jobId) {
      return c.json({
        success: false,
        error: 'Invalid job ID',
      }, 400);
    }

    const job = await jobQueueService.cancelJob(jobId);

    if (!job) {
      return c.json({
        success: false,
        error: 'Job not found or already completed',
      }, 404);
    }

    return c.json({
      success: true,
      data: job,
      message: 'Job cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return c.json({
      success: false,
      error: 'Failed to cancel job',
    }, 500);
  }
});

/**
 * GET /v1/jobs/queues/:queueName/stats
 * Get queue statistics
 */
app.get('/queues/:queueName/stats', async (c) => {
  try {
    const queueName = c.req.param('queueName');
    const tenant_id = parseInt(c.req.query('tenant_id'));

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const stats = await jobQueueService.getQueueStats(queueName, tenant_id);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch queue stats',
    }, 500);
  }
});

/**
 * GET /v1/jobs/queues/stats
 * Get all queue statistics for a tenant
 */
app.get('/queues/stats', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const stats = await jobQueueService.getAllQueueStats(tenant_id);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching all queue stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch queue stats',
    }, 500);
  }
});

/**
 * GET /v1/jobs/performance/metrics
 * Get performance metrics (last 24 hours)
 */
app.get('/performance/metrics', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));
    const queue_name = c.req.query('queue_name');

    const metrics = await jobQueueService.getPerformanceMetrics(tenant_id, queue_name);

    return c.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch performance metrics',
    }, 500);
  }
});

/**
 * POST /v1/jobs/scheduled
 * Create a scheduled job (recurring)
 */
app.post('/scheduled', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createScheduledJobSchema.parse(body);

    // Validate cron expression or interval
    if (validatedData.schedule_type === 'cron' && !validatedData.cron_expression) {
      return c.json({
        success: false,
        error: 'cron_expression is required for cron schedule type',
      }, 400);
    }

    if (validatedData.schedule_type === 'interval' && !validatedData.interval_seconds) {
      return c.json({
        success: false,
        error: 'interval_seconds is required for interval schedule type',
      }, 400);
    }

    const scheduledJob = await jobQueueService.createScheduledJob(validatedData);

    return c.json({
      success: true,
      data: scheduledJob,
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error creating scheduled job:', error);
    return c.json({
      success: false,
      error: 'Failed to create scheduled job',
    }, 500);
  }
});

/**
 * GET /v1/jobs/scheduled
 * List scheduled jobs
 */
app.get('/scheduled', async (c) => {
  try {
    const scheduledJobs = await jobQueueService.getScheduledJobs();

    return c.json({
      success: true,
      data: scheduledJobs,
    });
  } catch (error) {
    console.error('Error listing scheduled jobs:', error);
    return c.json({
      success: false,
      error: 'Failed to list scheduled jobs',
    }, 500);
  }
});

/**
 * DELETE /v1/jobs/scheduled/:id
 * Delete a scheduled job
 */
app.delete('/scheduled/:id', async (c) => {
  try {
    const scheduledJobId = parseInt(c.req.param('id'));

    if (!scheduledJobId) {
      return c.json({
        success: false,
        error: 'Invalid scheduled job ID',
      }, 400);
    }

    await jobQueueService.deleteScheduledJob(scheduledJobId);

    return c.json({
      success: true,
      message: 'Scheduled job deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting scheduled job:', error);
    return c.json({
      success: false,
      error: 'Failed to delete scheduled job',
    }, 500);
  }
});

/**
 * POST /v1/jobs/cleanup
 * Cleanup old completed jobs (admin endpoint)
 */
app.post('/cleanup', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '30');

    const deletedCount = await jobQueueService.cleanupOldJobs(days);

    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} old jobs`,
      deleted_count: deletedCount,
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    return c.json({
      success: false,
      error: 'Failed to cleanup jobs',
    }, 500);
  }
});

export default app;
