/**
 * Admin Dunning Routes
 * Management of failed payment recovery system
 */

import { Hono } from 'hono';
import { authenticateAdmin } from './admin-auth.js';
import dunningService from '../services/dunning.js';

const adminDunning = new Hono();

// All routes require admin authentication
adminDunning.use('*', authenticateAdmin);

/**
 * GET /admin/dunning/stats
 * Get dunning system statistics
 */
adminDunning.get('/stats', async (c) => {
  try {
    const stats = await dunningService.getDunningStats();

    return c.json({
      success: true,
      data: {
        active_dunning: parseInt(stats.active_dunning) || 0,
        suspended_accounts: parseInt(stats.suspended_accounts) || 0,
        resolved_last_30_days: parseInt(stats.resolved_last_30_days) || 0,
        total_outstanding: parseFloat(stats.total_outstanding) || 0,
        recovered_last_30_days: parseFloat(stats.recovered_last_30_days) || 0,
        avg_days_to_recover: parseFloat(stats.avg_days_to_recover)?.toFixed(1) || null
      }
    });
  } catch (error) {
    console.error('[Admin Dunning] Stats error:', error);
    return c.json({ error: 'Failed to get dunning stats' }, 500);
  }
});

/**
 * GET /admin/dunning
 * List all dunning records with filtering
 */
adminDunning.get('/', async (c) => {
  try {
    const { status, tenant_id, limit = 50, offset = 0 } = c.req.query();

    const records = await dunningService.listDunningRecords({
      status,
      tenant_id,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return c.json({
      success: true,
      data: records,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[Admin Dunning] List error:', error);
    return c.json({ error: 'Failed to list dunning records' }, 500);
  }
});

/**
 * GET /admin/dunning/:id
 * Get specific dunning record details
 */
adminDunning.get('/:id', async (c) => {
  try {
    const dunningId = c.req.param('id');
    const record = await dunningService.getDunningById(dunningId);

    if (!record) {
      return c.json({ error: 'Dunning record not found' }, 404);
    }

    return c.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('[Admin Dunning] Get error:', error);
    return c.json({ error: 'Failed to get dunning record' }, 500);
  }
});

/**
 * POST /admin/dunning/:id/retry
 * Manually trigger payment retry
 */
adminDunning.post('/:id/retry', async (c) => {
  try {
    const admin = c.get('admin');
    const dunningId = c.req.param('id');

    const result = await dunningService.retryPayment(dunningId);

    return c.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    console.error('[Admin Dunning] Retry error:', error);
    return c.json({ error: error.message || 'Failed to retry payment' }, 500);
  }
});

/**
 * POST /admin/dunning/:id/mark-paid
 * Mark payment as received (manual payment, bank transfer, etc.)
 */
adminDunning.post('/:id/mark-paid', async (c) => {
  try {
    const admin = c.get('admin');
    const dunningId = c.req.param('id');
    const body = await c.req.json();

    const result = await dunningService.markPaymentReceived(dunningId, {
      ...body,
      admin_id: admin.id
    });

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Admin Dunning] Mark paid error:', error);
    return c.json({ error: error.message || 'Failed to mark payment received' }, 500);
  }
});

/**
 * POST /admin/dunning/:id/cancel
 * Cancel dunning record (write off debt)
 */
adminDunning.post('/:id/cancel', async (c) => {
  try {
    const admin = c.get('admin');
    const dunningId = c.req.param('id');
    const body = await c.req.json();

    if (!body.reason) {
      return c.json({ error: 'Reason is required' }, 400);
    }

    const result = await dunningService.cancelDunning(dunningId, body.reason, admin.id);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Admin Dunning] Cancel error:', error);
    return c.json({ error: error.message || 'Failed to cancel dunning' }, 500);
  }
});

/**
 * POST /admin/dunning/:id/suspend
 * Manually suspend tenant account
 */
adminDunning.post('/:id/suspend', async (c) => {
  try {
    const dunningId = c.req.param('id');
    const record = await dunningService.getDunningById(dunningId);

    if (!record) {
      return c.json({ error: 'Dunning record not found' }, 404);
    }

    const result = await dunningService.suspendTenant(record.tenant_id, dunningId);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Admin Dunning] Suspend error:', error);
    return c.json({ error: error.message || 'Failed to suspend tenant' }, 500);
  }
});

/**
 * POST /admin/dunning/:id/reactivate
 * Manually reactivate suspended tenant
 */
adminDunning.post('/:id/reactivate', async (c) => {
  try {
    const dunningId = c.req.param('id');
    const record = await dunningService.getDunningById(dunningId);

    if (!record) {
      return c.json({ error: 'Dunning record not found' }, 404);
    }

    const result = await dunningService.reactivateTenant(record.tenant_id);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Admin Dunning] Reactivate error:', error);
    return c.json({ error: error.message || 'Failed to reactivate tenant' }, 500);
  }
});

/**
 * POST /admin/dunning/process/retries
 * Manually trigger processing of all due payment retries
 */
adminDunning.post('/process/retries', async (c) => {
  try {
    const results = await dunningService.processPaymentRetries();

    return c.json({
      success: true,
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('[Admin Dunning] Process retries error:', error);
    return c.json({ error: 'Failed to process payment retries' }, 500);
  }
});

/**
 * POST /admin/dunning/process/reminders
 * Manually trigger processing of all due reminder emails
 */
adminDunning.post('/process/reminders', async (c) => {
  try {
    const results = await dunningService.processReminderEmails();

    return c.json({
      success: true,
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('[Admin Dunning] Process reminders error:', error);
    return c.json({ error: 'Failed to process reminders' }, 500);
  }
});

/**
 * POST /admin/dunning/process/suspensions
 * Manually trigger processing of account suspensions
 */
adminDunning.post('/process/suspensions', async (c) => {
  try {
    const results = await dunningService.processAccountSuspensions();

    return c.json({
      success: true,
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('[Admin Dunning] Process suspensions error:', error);
    return c.json({ error: 'Failed to process suspensions' }, 500);
  }
});

export default adminDunning;
