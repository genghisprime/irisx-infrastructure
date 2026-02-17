/**
 * Custom Reports Routes
 * Report builder and export API
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate } from '../middleware/authMiddleware.js';
import reportsService from '../services/reports.js';

const reports = new Hono();

// All routes require authentication
reports.use('*', authenticate);

// Validation schemas
const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  data_source: z.enum(['calls', 'sms_messages', 'emails', 'campaigns', 'agents', 'billing']),
  fields: z.array(z.string()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'null', 'not_null']),
    value: z.any().optional()
  })).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['ASC', 'DESC']).optional(),
  group_by: z.string().optional(),
  aggregations: z.array(z.object({
    function: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    field: z.string(),
    alias: z.string().optional()
  })).optional(),
  date_range: z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).optional(),
  is_scheduled: z.boolean().optional(),
  schedule_config: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
    day_of_week: z.number().min(0).max(6).optional(),
    day_of_month: z.number().min(1).max(31).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    timezone: z.string().optional(),
    recipients: z.array(z.string().email()).optional(),
    format: z.enum(['csv', 'xlsx', 'pdf']).optional()
  }).optional()
});

const querySchema = z.object({
  data_source: z.enum(['calls', 'sms_messages', 'emails', 'campaigns', 'agents', 'billing']),
  fields: z.array(z.string()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'in', 'null', 'not_null']),
    value: z.any().optional()
  })).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['ASC', 'DESC']).optional(),
  group_by: z.string().optional(),
  aggregations: z.array(z.object({
    function: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    field: z.string(),
    alias: z.string().optional()
  })).optional(),
  date_range: z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(10000).optional()
});

// =========================================
// DATA SOURCES
// =========================================

/**
 * GET /reports/sources
 * Get available data sources and their fields
 */
reports.get('/sources', async (c) => {
  try {
    const sources = reportsService.getDataSources();

    return c.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('[Reports] Get sources error:', error);
    return c.json({ error: 'Failed to get data sources' }, 500);
  }
});

// =========================================
// REPORT CRUD
// =========================================

/**
 * POST /reports
 * Create a new saved report
 */
reports.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validated = createReportSchema.parse(body);
    const report = await reportsService.createReport(user.tenantId, validated);

    return c.json({
      success: true,
      data: report
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Reports] Create error:', error);
    return c.json({ error: error.message || 'Failed to create report' }, 500);
  }
});

/**
 * GET /reports
 * List saved reports
 */
reports.get('/', async (c) => {
  try {
    const user = c.get('user');
    const { page = '1', limit = '50', data_source } = c.req.query();

    const result = await reportsService.listReports(user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit),
      data_source
    });

    return c.json({
      success: true,
      data: result.reports,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[Reports] List error:', error);
    return c.json({ error: 'Failed to list reports' }, 500);
  }
});

/**
 * GET /reports/:id
 * Get a specific report
 */
reports.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');

    const report = await reportsService.getReport(reportId, user.tenantId);

    return c.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[Reports] Get error:', error);
    return c.json({ error: error.message || 'Failed to get report' }, 404);
  }
});

/**
 * PUT /reports/:id
 * Update a report
 */
reports.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');
    const body = await c.req.json();

    const validated = createReportSchema.partial().parse(body);
    const report = await reportsService.updateReport(reportId, user.tenantId, validated);

    return c.json({
      success: true,
      data: report
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Reports] Update error:', error);
    return c.json({ error: error.message || 'Failed to update report' }, 500);
  }
});

/**
 * DELETE /reports/:id
 * Delete a report
 */
reports.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');

    await reportsService.deleteReport(reportId, user.tenantId);

    return c.json({
      success: true,
      message: 'Report deleted'
    });
  } catch (error) {
    console.error('[Reports] Delete error:', error);
    return c.json({ error: error.message || 'Failed to delete report' }, 500);
  }
});

// =========================================
// REPORT EXECUTION
// =========================================

/**
 * POST /reports/:id/execute
 * Execute a saved report and get results
 */
reports.post('/:id/execute', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const result = await reportsService.executeReport(reportId, user.tenantId, {
      date_range: body.date_range,
      page: body.page || 1,
      limit: body.limit || 1000
    });

    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      query_config: result.query_config
    });
  } catch (error) {
    console.error('[Reports] Execute error:', error);
    return c.json({ error: error.message || 'Failed to execute report' }, 500);
  }
});

/**
 * POST /reports/query
 * Run an ad-hoc query
 */
reports.post('/query', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validated = querySchema.parse(body);
    const result = await reportsService.runQuery(user.tenantId, validated);

    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      query_config: result.query_config
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Reports] Query error:', error);
    return c.json({ error: error.message || 'Failed to run query' }, 500);
  }
});

// =========================================
// EXPORTS
// =========================================

/**
 * GET /reports/:id/export/:format
 * Export a saved report
 */
reports.get('/:id/export/:format', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');
    const format = c.req.param('format');

    const result = await reportsService.exportReport(reportId, user.tenantId, format);

    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);

    return c.body(result.content);
  } catch (error) {
    console.error('[Reports] Export error:', error);
    return c.json({ error: error.message || 'Failed to export report' }, 500);
  }
});

/**
 * POST /reports/export
 * Export ad-hoc query results
 */
reports.post('/export', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const { format = 'xlsx', ...queryConfig } = body;
    const validated = querySchema.parse(queryConfig);

    let result;
    switch (format.toLowerCase()) {
      case 'csv':
        result = await reportsService.exportToCSV(user.tenantId, validated);
        break;
      case 'xlsx':
      case 'excel':
        result = await reportsService.exportToExcel(user.tenantId, validated);
        break;
      case 'pdf':
        result = await reportsService.exportToPDF(user.tenantId, validated);
        break;
      default:
        return c.json({ error: `Unsupported format: ${format}` }, 400);
    }

    c.header('Content-Type', result.contentType);
    c.header('Content-Disposition', `attachment; filename="${result.filename}"`);

    return c.body(result.content);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Reports] Export error:', error);
    return c.json({ error: error.message || 'Failed to export' }, 500);
  }
});

// =========================================
// SCHEDULING
// =========================================

/**
 * POST /reports/:id/schedule
 * Schedule a report for recurring generation
 */
reports.post('/:id/schedule', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');
    const body = await c.req.json();

    const scheduleSchema = z.object({
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      day_of_week: z.number().min(0).max(6).optional(),
      day_of_month: z.number().min(1).max(31).optional(),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().default('UTC'),
      recipients: z.array(z.string().email()).min(1),
      format: z.enum(['csv', 'xlsx', 'pdf']).default('xlsx')
    });

    const validated = scheduleSchema.parse(body);
    const report = await reportsService.scheduleReport(reportId, user.tenantId, validated);

    return c.json({
      success: true,
      data: report
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Reports] Schedule error:', error);
    return c.json({ error: error.message || 'Failed to schedule report' }, 500);
  }
});

/**
 * DELETE /reports/:id/schedule
 * Remove schedule from a report
 */
reports.delete('/:id/schedule', async (c) => {
  try {
    const user = c.get('user');
    const reportId = c.req.param('id');

    const report = await reportsService.unscheduleReport(reportId, user.tenantId);

    return c.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[Reports] Unschedule error:', error);
    return c.json({ error: error.message || 'Failed to unschedule report' }, 500);
  }
});

export default reports;
