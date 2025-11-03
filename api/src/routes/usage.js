/**
 * Usage & Billing Routes
 * Handles usage tracking, billing history, and invoice management
 * Created: Week 24 - Feature 3 (Usage & Billing Dashboard)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import usageTracking from '../services/usage-tracking.js';

const usage = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const usageHistorySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

// =============================================================================
// Middleware - Extract Tenant ID from JWT
// =============================================================================

/**
 * Middleware to extract tenant_id from JWT token
 * Assumes JWT middleware has already validated and attached user to c.var
 */
async function extractTenantId(c, next) {
  const user = c.get('user');

  if (!user || !user.tenantId) {
    return c.json({
      error: 'Unauthorized',
      message: 'Missing or invalid authentication token',
      code: 'MISSING_TENANT_ID'
    }, 401);
  }

  c.set('tenantId', user.tenantId);
  await next();
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /v1/usage/current-period
 * Get usage for the current billing period
 */
usage.get('/current-period', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const usageData = await usageTracking.getCurrentPeriodUsage(tenantId);

    return c.json({
      success: true,
      data: usageData
    });
  } catch (error) {
    console.error('Error fetching current period usage:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch usage data',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/usage/history?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * Get usage history for a specific date range
 */
usage.get('/history', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    // Validate query parameters
    const validation = usageHistorySchema.safeParse({
      start_date: startDate,
      end_date: endDate
    });

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Validate date range (max 90 days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

    if (daysDiff > 90) {
      return c.json({
        success: false,
        error: 'Date range too large',
        message: 'Maximum date range is 90 days'
      }, 400);
    }

    if (daysDiff < 0) {
      return c.json({
        success: false,
        error: 'Invalid date range',
        message: 'Start date must be before end date'
      }, 400);
    }

    const history = await usageTracking.getUsageHistory(tenantId, startDate, endDate);

    return c.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching usage history:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch usage history',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/billing/invoices
 * Get list of invoices for the tenant
 * Query params: status, limit, offset
 */
usage.get('/billing/invoices', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const status = c.req.query('status'); // pending, paid, overdue, cancelled
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    // Validate limits
    if (limit > 100) {
      return c.json({
        success: false,
        error: 'Invalid limit',
        message: 'Maximum limit is 100'
      }, 400);
    }

    const invoices = await usageTracking.getInvoices(tenantId, {
      status,
      limit,
      offset
    });

    return c.json({
      success: true,
      data: {
        invoices,
        pagination: {
          limit,
          offset,
          hasMore: invoices.length === limit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch invoices',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/billing/invoice/:id
 * Get specific invoice details
 */
usage.get('/billing/invoice/:id', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const invoiceId = parseInt(c.req.param('id'), 10);

    if (isNaN(invoiceId)) {
      return c.json({
        success: false,
        error: 'Invalid invoice ID',
        message: 'Invoice ID must be a number'
      }, 400);
    }

    const invoice = await usageTracking.getInvoice(tenantId, invoiceId);

    if (!invoice) {
      return c.json({
        success: false,
        error: 'Invoice not found',
        message: `Invoice ${invoiceId} not found or does not belong to this tenant`
      }, 404);
    }

    return c.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch invoice',
      message: error.message
    }, 500);
  }
});

export default usage;
