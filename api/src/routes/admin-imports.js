import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminImports = new Hono();

// Apply admin authentication to all routes
adminImports.use('*', authenticateAdmin);

/**
 * GET /admin/imports
 * List all import jobs across all tenants
 */
adminImports.get('/', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status'); // filter by status

    let sql = `
      SELECT id, tenant_id, source_type, status, total_rows, success_count, error_count,
             created_at, completed_at, external_id, filename
      FROM import_jobs
    `;
    const params = [];

    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);

    // Get total count
    const countSql = status
      ? `SELECT COUNT(*) as total FROM import_jobs WHERE status = $1`
      : `SELECT COUNT(*) as total FROM import_jobs`;
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countSql, countParams);

    return c.json({
      imports: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    });

  } catch (error) {
    console.error('[Admin Imports] List jobs error:', error);
    return c.json({ error: 'Failed to list import jobs' }, 500);
  }
});

/**
 * GET /admin/imports/:id
 * Get import job details by ID
 */
adminImports.get('/:id', async (c) => {
  try {
    const jobId = c.req.param('id');

    const result = await pool.query(
      `SELECT * FROM import_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Import job not found' }, 404);
    }

    const job = result.rows[0];

    return c.json({
      id: job.id,
      tenant_id: job.tenant_id,
      status: job.status,
      source_type: job.source_type,
      progress_percent: job.progress_percent,
      total_rows: job.total_rows,
      processed_rows: job.processed_rows,
      success_count: job.success_count,
      error_count: job.error_count,
      duplicate_count: job.duplicate_count,
      skipped_count: job.skipped_count,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      external_id: job.external_id,
      filename: job.filename,
      error_details: job.error_count > 0 ? job.error_details : null
    });

  } catch (error) {
    console.error('[Admin Imports] Get job error:', error);
    return c.json({ error: 'Failed to get import job' }, 500);
  }
});

/**
 * GET /admin/imports/stats
 * Get import statistics across all tenants
 */
adminImports.get('/stats', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending_mapping') as pending,
        COALESCE(SUM(total_rows), 0) as total_rows,
        COALESCE(SUM(success_count), 0) as total_success,
        COALESCE(SUM(error_count), 0) as total_errors
      FROM import_jobs
    `);

    return c.json(result.rows[0]);

  } catch (error) {
    console.error('[Admin Imports] Get stats error:', error);
    return c.json({ error: 'Failed to get import statistics' }, 500);
  }
});

/**
 * DELETE /admin/imports/:id
 * Cancel or delete an import job (admin can delete any job)
 */
adminImports.delete('/:id', async (c) => {
  const admin = c.get('admin');

  // Only superadmin can delete import jobs
  if (admin.role !== 'superadmin') {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const jobId = c.req.param('id');

    // Check if job exists
    const checkResult = await pool.query(
      `SELECT status FROM import_jobs WHERE id = $1`,
      [jobId]
    );

    if (checkResult.rows.length === 0) {
      return c.json({ error: 'Import job not found' }, 404);
    }

    const status = checkResult.rows[0].status;

    if (status === 'processing') {
      // Cancel running job
      await pool.query(
        `UPDATE import_jobs SET status = $1, cancelled_at = NOW() WHERE id = $2`,
        ['cancelled', jobId]
      );
      return c.json({ success: true, message: 'Import job cancelled' });
    } else {
      // Delete completed/failed job
      await pool.query(`DELETE FROM import_jobs WHERE id = $1`, [jobId]);
      return c.json({ success: true, message: 'Import job deleted' });
    }

  } catch (error) {
    console.error('[Admin Imports] Delete job error:', error);
    return c.json({ error: 'Failed to delete import job' }, 500);
  }
});

/**
 * GET /admin/imports/:id/errors
 * Get errors for an import job
 */
adminImports.get('/:id/errors', async (c) => {
  try {
    const jobId = c.req.param('id');

    const result = await pool.query(
      `SELECT e.* FROM import_errors e
       WHERE e.import_job_id = $1
       ORDER BY e.row_number
       LIMIT 100`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return c.json({ errors: [], message: 'No errors found for this import' });
    }

    return c.json({
      errors: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Admin Imports] Get errors error:', error);
    return c.json({ error: 'Failed to get import errors' }, 500);
  }
});

/**
 * GET /admin/contact-lists
 * Get contact lists across all tenants (for admin import dropdown)
 */
adminImports.get('/contact-lists', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');

    const result = await pool.query(`
      SELECT
        id,
        tenant_id,
        name,
        description,
        contact_count,
        type,
        created_at
      FROM contact_lists
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return c.json({
      lists: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('[Admin Imports] Get contact lists error:', error);
    return c.json({ error: 'Failed to get contact lists' }, 500);
  }
});

export default adminImports;
