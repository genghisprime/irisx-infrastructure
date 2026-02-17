/**
 * Campaign Enhancements Routes
 * Recurring campaigns, triggered campaigns, A/B testing, preview dialer, approval workflows
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate, requireRole } from '../middleware/authMiddleware.js';
import campaignEnhancementsService from '../services/campaign-enhancements.js';

const campaignEnhancements = new Hono();

// All routes require authentication
campaignEnhancements.use('*', authenticate);

// =========================================
// RECURRING CAMPAIGNS
// =========================================

/**
 * POST /campaigns/:id/recurring
 * Set recurring schedule for a campaign
 */
campaignEnhancements.post('/:id/recurring', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      rrule: z.string().min(1), // e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=9;BYMINUTE=0"
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      timezone: z.string().default('UTC')
    });

    const validated = schema.parse(body);
    const campaign = await campaignEnhancementsService.setRecurringSchedule(
      campaignId,
      user.tenantId,
      validated
    );

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Set recurring error:', error);
    return c.json({ error: error.message || 'Failed to set recurring schedule' }, 500);
  }
});

/**
 * DELETE /campaigns/:id/recurring
 * Remove recurring schedule
 */
campaignEnhancements.delete('/:id/recurring', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const campaign = await campaignEnhancementsService.removeRecurringSchedule(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Remove recurring error:', error);
    return c.json({ error: 'Failed to remove recurring schedule' }, 500);
  }
});

/**
 * GET /campaigns/:id/runs
 * Get campaign run history
 */
campaignEnhancements.get('/:id/runs', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const { page = '1', limit = '50' } = c.req.query();

    const result = await campaignEnhancementsService.getCampaignRuns(campaignId, user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.runs,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get runs error:', error);
    return c.json({ error: 'Failed to get campaign runs' }, 500);
  }
});

// =========================================
// TRIGGERED CAMPAIGNS
// =========================================

/**
 * POST /campaigns/:id/triggers
 * Create a trigger for a campaign
 */
campaignEnhancements.post('/:id/triggers', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      trigger_type: z.enum([
        'contact_created', 'contact_updated', 'contact_tag_added',
        'form_submitted', 'webhook_received', 'call_completed',
        'sms_received', 'email_opened', 'email_clicked', 'custom_event'
      ]),
      conditions: z.array(z.object({
        field: z.string(),
        operator: z.enum(['eq', 'equals', 'ne', 'not_equals', 'contains', 'gt', 'lt', 'exists', 'not_exists']),
        value: z.any().optional()
      })).optional(),
      delay_minutes: z.number().int().min(0).optional(),
      delay_until_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      max_triggers_per_contact: z.number().int().min(1).optional(),
      cooldown_hours: z.number().int().min(0).optional()
    });

    const validated = schema.parse(body);
    const trigger = await campaignEnhancementsService.createTrigger(campaignId, user.tenantId, validated);

    return c.json({
      success: true,
      data: trigger
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Create trigger error:', error);
    return c.json({ error: error.message || 'Failed to create trigger' }, 500);
  }
});

/**
 * GET /campaigns/:id/triggers
 * Get triggers for a campaign
 */
campaignEnhancements.get('/:id/triggers', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const triggers = await campaignEnhancementsService.getCampaignTriggers(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: triggers
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get triggers error:', error);
    return c.json({ error: 'Failed to get triggers' }, 500);
  }
});

/**
 * PUT /triggers/:triggerId
 * Update a trigger
 */
campaignEnhancements.put('/triggers/:triggerId', async (c) => {
  try {
    const user = c.get('user');
    const triggerId = c.req.param('triggerId');
    const body = await c.req.json();

    const trigger = await campaignEnhancementsService.updateTrigger(triggerId, user.tenantId, body);

    return c.json({
      success: true,
      data: trigger
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Update trigger error:', error);
    return c.json({ error: error.message || 'Failed to update trigger' }, 500);
  }
});

/**
 * DELETE /triggers/:triggerId
 * Delete a trigger
 */
campaignEnhancements.delete('/triggers/:triggerId', async (c) => {
  try {
    const user = c.get('user');
    const triggerId = c.req.param('triggerId');

    await campaignEnhancementsService.deleteTrigger(triggerId, user.tenantId);

    return c.json({
      success: true,
      message: 'Trigger deleted'
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Delete trigger error:', error);
    return c.json({ error: 'Failed to delete trigger' }, 500);
  }
});

/**
 * POST /triggers/fire
 * Fire triggers for an event (internal/webhook use)
 */
campaignEnhancements.post('/triggers/fire', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      event_type: z.string(),
      contact_id: z.string().uuid(),
      event_data: z.record(z.any()).optional()
    });

    const validated = schema.parse(body);
    const results = await campaignEnhancementsService.processEvent(
      user.tenantId,
      validated.event_type,
      validated.contact_id,
      validated.event_data || {}
    );

    return c.json({
      success: true,
      data: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Fire triggers error:', error);
    return c.json({ error: 'Failed to fire triggers' }, 500);
  }
});

// =========================================
// A/B TESTING
// =========================================

/**
 * POST /campaigns/:id/ab-test
 * Create an A/B test for a campaign
 */
campaignEnhancements.post('/:id/ab-test', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      test_name: z.string().optional(),
      test_type: z.enum(['message', 'subject', 'call_script', 'send_time', 'caller_id']),
      winning_metric: z.enum(['open_rate', 'click_rate', 'response_rate', 'conversion_rate', 'connect_rate']).optional(),
      sample_size_percent: z.number().int().min(1).max(50).optional(),
      test_duration_hours: z.number().int().min(1).optional(),
      auto_select_winner: z.boolean().optional(),
      variant_a: z.record(z.any()),
      variant_b: z.record(z.any())
    });

    const validated = schema.parse(body);
    const test = await campaignEnhancementsService.createABTest(campaignId, user.tenantId, validated);

    return c.json({
      success: true,
      data: test
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Create A/B test error:', error);
    return c.json({ error: error.message || 'Failed to create A/B test' }, 500);
  }
});

/**
 * GET /campaigns/:id/ab-test
 * Get A/B test for a campaign
 */
campaignEnhancements.get('/:id/ab-test', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const test = await campaignEnhancementsService.getABTestByCampaign(campaignId, user.tenantId);

    if (!test) {
      return c.json({ error: 'No A/B test found for this campaign' }, 404);
    }

    return c.json({
      success: true,
      data: test
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get A/B test error:', error);
    return c.json({ error: 'Failed to get A/B test' }, 500);
  }
});

/**
 * POST /ab-tests/:testId/select-winner
 * Select winning variant
 */
campaignEnhancements.post('/ab-tests/:testId/select-winner', async (c) => {
  try {
    const user = c.get('user');
    const testId = c.req.param('testId');
    const body = await c.req.json().catch(() => ({}));

    const test = await campaignEnhancementsService.selectWinner(
      testId,
      user.tenantId,
      body.winning_variant
    );

    return c.json({
      success: true,
      data: test
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Select winner error:', error);
    return c.json({ error: error.message || 'Failed to select winner' }, 500);
  }
});

/**
 * POST /ab-tests/:testId/variants/:variant/stats
 * Update variant statistics
 */
campaignEnhancements.post('/ab-tests/:testId/variants/:variant/stats', async (c) => {
  try {
    const user = c.get('user');
    const testId = c.req.param('testId');
    const variant = c.req.param('variant');
    const body = await c.req.json();

    await campaignEnhancementsService.updateVariantStats(testId, variant, body);

    return c.json({
      success: true,
      message: 'Stats updated'
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Update stats error:', error);
    return c.json({ error: 'Failed to update stats' }, 500);
  }
});

// =========================================
// PREVIEW DIALER
// =========================================

/**
 * POST /campaigns/:id/preview-queue
 * Queue contacts for preview dialing
 */
campaignEnhancements.post('/:id/preview-queue', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const schema = z.object({
      contacts: z.array(z.object({
        id: z.string().uuid(),
        phone_number: z.string(),
        name: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional()
      }))
    });

    const validated = schema.parse(body);
    const results = await campaignEnhancementsService.queueForPreview(
      campaignId,
      user.tenantId,
      validated.contacts
    );

    return c.json({
      success: true,
      data: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Queue preview error:', error);
    return c.json({ error: 'Failed to queue contacts' }, 500);
  }
});

/**
 * GET /campaigns/:id/preview-queue/status
 * Get preview queue status
 */
campaignEnhancements.get('/:id/preview-queue/status', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const status = await campaignEnhancementsService.getPreviewQueueStatus(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get preview status error:', error);
    return c.json({ error: 'Failed to get status' }, 500);
  }
});

/**
 * GET /campaigns/:id/preview/next
 * Get next preview for agent
 */
campaignEnhancements.get('/:id/preview/next', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const preview = await campaignEnhancementsService.getNextPreview(campaignId, user.tenantId, user.id);

    if (!preview) {
      return c.json({
        success: true,
        data: null,
        message: 'No contacts in queue'
      });
    }

    return c.json({
      success: true,
      data: preview
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get next preview error:', error);
    return c.json({ error: 'Failed to get next preview' }, 500);
  }
});

/**
 * POST /preview/:previewId/approve
 * Approve contact for dialing
 */
campaignEnhancements.post('/preview/:previewId/approve', async (c) => {
  try {
    const user = c.get('user');
    const previewId = c.req.param('previewId');
    const body = await c.req.json().catch(() => ({}));

    const preview = await campaignEnhancementsService.approvePreview(previewId, user.id, body.notes);

    return c.json({
      success: true,
      data: preview
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Approve preview error:', error);
    return c.json({ error: error.message || 'Failed to approve' }, 500);
  }
});

/**
 * POST /preview/:previewId/skip
 * Skip contact
 */
campaignEnhancements.post('/preview/:previewId/skip', async (c) => {
  try {
    const user = c.get('user');
    const previewId = c.req.param('previewId');
    const body = await c.req.json();

    const preview = await campaignEnhancementsService.skipPreview(previewId, user.id, body.reason);

    return c.json({
      success: true,
      data: preview
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Skip preview error:', error);
    return c.json({ error: 'Failed to skip' }, 500);
  }
});

// =========================================
// APPROVAL WORKFLOWS
// =========================================

/**
 * POST /campaigns/:id/submit-approval
 * Submit campaign for approval
 */
campaignEnhancements.post('/:id/submit-approval', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const approval = await campaignEnhancementsService.submitForApproval(
      campaignId,
      user.tenantId,
      user.id,
      body.notes
    );

    return c.json({
      success: true,
      data: approval
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Submit approval error:', error);
    return c.json({ error: error.message || 'Failed to submit' }, 500);
  }
});

/**
 * GET /approvals/pending
 * Get pending approvals
 */
campaignEnhancements.get('/approvals/pending', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const { page = '1', limit = '50' } = c.req.query();

    const result = await campaignEnhancementsService.getPendingApprovals(user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json({
      success: true,
      data: result.approvals,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get pending approvals error:', error);
    return c.json({ error: 'Failed to get approvals' }, 500);
  }
});

/**
 * POST /approvals/:approvalId/review
 * Review a campaign approval
 */
campaignEnhancements.post('/approvals/:approvalId/review', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const approvalId = c.req.param('approvalId');
    const body = await c.req.json();

    const schema = z.object({
      decision: z.enum(['approved', 'rejected', 'changes_requested']),
      notes: z.string().optional(),
      required_changes: z.string().optional()
    });

    const validated = schema.parse(body);
    const approval = await campaignEnhancementsService.reviewApproval(
      approvalId,
      user.tenantId,
      user.id,
      validated.decision,
      validated.notes,
      validated.required_changes
    );

    return c.json({
      success: true,
      data: approval
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Review approval error:', error);
    return c.json({ error: error.message || 'Failed to review' }, 500);
  }
});

/**
 * GET /campaigns/:id/approval-history
 * Get approval history for a campaign
 */
campaignEnhancements.get('/:id/approval-history', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const history = await campaignEnhancementsService.getApprovalHistory(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get approval history error:', error);
    return c.json({ error: 'Failed to get history' }, 500);
  }
});

// =========================================
// FREQUENCY CAPS
// =========================================

/**
 * GET /frequency-caps/settings
 * Get frequency cap settings
 */
campaignEnhancements.get('/frequency-caps/settings', async (c) => {
  try {
    const user = c.get('user');
    const settings = await campaignEnhancementsService.getFrequencyCapSettings(user.tenantId);

    return c.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Get frequency caps error:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

/**
 * PUT /frequency-caps/settings
 * Update frequency cap settings
 */
campaignEnhancements.put('/frequency-caps/settings', requireRole(['admin']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      max_calls_per_day: z.number().int().min(0).optional(),
      max_calls_per_week: z.number().int().min(0).optional(),
      max_calls_per_month: z.number().int().min(0).optional(),
      max_sms_per_day: z.number().int().min(0).optional(),
      max_sms_per_week: z.number().int().min(0).optional(),
      max_sms_per_month: z.number().int().min(0).optional(),
      max_emails_per_day: z.number().int().min(0).optional(),
      max_emails_per_week: z.number().int().min(0).optional(),
      max_emails_per_month: z.number().int().min(0).optional(),
      max_total_per_day: z.number().int().min(0).optional(),
      max_total_per_week: z.number().int().min(0).optional(),
      min_hours_between_calls: z.number().int().min(0).optional(),
      min_hours_between_sms: z.number().int().min(0).optional(),
      min_hours_between_emails: z.number().int().min(0).optional(),
      enforce_caps: z.boolean().optional()
    });

    const validated = schema.parse(body);
    const settings = await campaignEnhancementsService.updateFrequencyCapSettings(user.tenantId, validated);

    return c.json({
      success: true,
      data: settings
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CampaignEnhancements] Update frequency caps error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

/**
 * GET /frequency-caps/check
 * Check if contact can be contacted
 */
campaignEnhancements.get('/frequency-caps/check', async (c) => {
  try {
    const user = c.get('user');
    const { contact_id, channel } = c.req.query();

    if (!contact_id || !channel) {
      return c.json({ error: 'contact_id and channel required' }, 400);
    }

    const result = await campaignEnhancementsService.checkFrequencyCap(user.tenantId, contact_id, channel);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[CampaignEnhancements] Check frequency cap error:', error);
    return c.json({ error: 'Failed to check' }, 500);
  }
});

export default campaignEnhancements;
