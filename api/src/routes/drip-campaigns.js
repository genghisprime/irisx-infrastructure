/**
 * Drip Campaign Routes
 * Multi-step automated campaign management API
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate } from '../middleware/authMiddleware.js';
import dripCampaignService from '../services/drip-campaign.js';

const dripCampaigns = new Hono();

// All routes require authentication
dripCampaigns.use('*', authenticate);

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger_type: z.enum(['manual', 'event', 'signup', 'tag_added', 'list_added', 'purchase', 'form_submit']).optional(),
  trigger_config: z.record(z.any()).optional(),
  contact_list_ids: z.array(z.string().uuid()).optional(),
  filter_criteria: z.record(z.any()).optional(),
  goal_type: z.enum(['conversion', 'reply', 'click', 'open', 'purchase', 'tag_added']).nullable().optional(),
  goal_config: z.record(z.any()).optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional()
});

const addStepSchema = z.object({
  step_order: z.number().int().positive().optional(),
  step_type: z.enum(['message', 'wait', 'condition', 'goal_check']).optional(),
  channel: z.enum(['email', 'sms', 'voice']).optional(),
  delay_amount: z.number().int().min(0).optional(),
  delay_unit: z.enum(['minutes', 'hours', 'days', 'weeks']).optional(),
  subject: z.string().max(500).optional(),
  message_template: z.string().optional(),
  from_number: z.string().optional(),
  from_email: z.string().email().optional(),
  from_name: z.string().optional(),
  voice_script: z.string().optional(),
  voice_provider: z.string().optional(),
  voice_id: z.string().optional(),
  condition_type: z.enum(['opened', 'clicked', 'replied', 'not_opened', 'not_clicked', 'tag_has', 'tag_missing']).optional(),
  condition_config: z.record(z.any()).optional(),
  ab_test_enabled: z.boolean().optional(),
  ab_variants: z.array(z.object({
    name: z.string(),
    weight: z.number(),
    subject: z.string().optional(),
    message_template: z.string().optional()
  })).optional()
});

// =========================================
// CAMPAIGN CRUD
// =========================================

/**
 * POST /drip-campaigns
 * Create a new drip campaign
 */
dripCampaigns.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validated = createCampaignSchema.parse(body);
    const campaign = await dripCampaignService.createDripCampaign(user.tenantId, validated);

    return c.json({
      success: true,
      data: campaign
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Drip Campaigns] Create error:', error);
    return c.json({ error: error.message || 'Failed to create campaign' }, 500);
  }
});

/**
 * GET /drip-campaigns
 * List all drip campaigns
 */
dripCampaigns.get('/', async (c) => {
  try {
    const user = c.get('user');
    const { page = '1', limit = '50', status, is_active } = c.req.query();

    const result = await dripCampaignService.listDripCampaigns(user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });

    return c.json({
      success: true,
      data: result.campaigns,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[Drip Campaigns] List error:', error);
    return c.json({ error: 'Failed to list campaigns' }, 500);
  }
});

/**
 * GET /drip-campaigns/:id
 * Get a specific drip campaign
 */
dripCampaigns.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const campaign = await dripCampaignService.getDripCampaign(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('[Drip Campaigns] Get error:', error);
    return c.json({ error: error.message || 'Failed to get campaign' }, 404);
  }
});

/**
 * PUT /drip-campaigns/:id
 * Update a drip campaign
 */
dripCampaigns.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const validated = createCampaignSchema.partial().parse(body);
    const campaign = await dripCampaignService.updateDripCampaign(campaignId, user.tenantId, validated);

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Drip Campaigns] Update error:', error);
    return c.json({ error: error.message || 'Failed to update campaign' }, 500);
  }
});

/**
 * DELETE /drip-campaigns/:id
 * Delete a drip campaign
 */
dripCampaigns.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    await dripCampaignService.deleteDripCampaign(campaignId, user.tenantId);

    return c.json({
      success: true,
      message: 'Campaign deleted'
    });
  } catch (error) {
    console.error('[Drip Campaigns] Delete error:', error);
    return c.json({ error: error.message || 'Failed to delete campaign' }, 500);
  }
});

// =========================================
// CAMPAIGN ACTIVATION
// =========================================

/**
 * POST /drip-campaigns/:id/activate
 * Activate a drip campaign
 */
dripCampaigns.post('/:id/activate', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const campaign = await dripCampaignService.activateCampaign(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('[Drip Campaigns] Activate error:', error);
    return c.json({ error: error.message || 'Failed to activate campaign' }, 500);
  }
});

/**
 * POST /drip-campaigns/:id/deactivate
 * Deactivate a drip campaign
 */
dripCampaigns.post('/:id/deactivate', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const campaign = await dripCampaignService.deactivateCampaign(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('[Drip Campaigns] Deactivate error:', error);
    return c.json({ error: error.message || 'Failed to deactivate campaign' }, 500);
  }
});

// =========================================
// CAMPAIGN STEPS
// =========================================

/**
 * POST /drip-campaigns/:id/steps
 * Add a step to a campaign
 */
dripCampaigns.post('/:id/steps', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const validated = addStepSchema.parse(body);
    const step = await dripCampaignService.addStep(campaignId, user.tenantId, validated);

    return c.json({
      success: true,
      data: step
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Drip Campaigns] Add step error:', error);
    return c.json({ error: error.message || 'Failed to add step' }, 500);
  }
});

/**
 * GET /drip-campaigns/:id/steps
 * Get all steps for a campaign
 */
dripCampaigns.get('/:id/steps', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const steps = await dripCampaignService.getSteps(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: steps
    });
  } catch (error) {
    console.error('[Drip Campaigns] Get steps error:', error);
    return c.json({ error: error.message || 'Failed to get steps' }, 500);
  }
});

/**
 * PUT /drip-campaigns/:id/steps/:stepId
 * Update a step
 */
dripCampaigns.put('/:id/steps/:stepId', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const stepId = c.req.param('stepId');
    const body = await c.req.json();

    const validated = addStepSchema.partial().parse(body);
    const step = await dripCampaignService.updateStep(stepId, campaignId, user.tenantId, validated);

    return c.json({
      success: true,
      data: step
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Drip Campaigns] Update step error:', error);
    return c.json({ error: error.message || 'Failed to update step' }, 500);
  }
});

/**
 * DELETE /drip-campaigns/:id/steps/:stepId
 * Delete a step
 */
dripCampaigns.delete('/:id/steps/:stepId', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const stepId = c.req.param('stepId');

    await dripCampaignService.deleteStep(stepId, campaignId, user.tenantId);

    return c.json({
      success: true,
      message: 'Step deleted'
    });
  } catch (error) {
    console.error('[Drip Campaigns] Delete step error:', error);
    return c.json({ error: error.message || 'Failed to delete step' }, 500);
  }
});

/**
 * PUT /drip-campaigns/:id/steps/reorder
 * Reorder steps
 */
dripCampaigns.put('/:id/steps/reorder', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const steps = await dripCampaignService.reorderSteps(campaignId, user.tenantId, body.step_orders);

    return c.json({
      success: true,
      data: steps
    });
  } catch (error) {
    console.error('[Drip Campaigns] Reorder steps error:', error);
    return c.json({ error: error.message || 'Failed to reorder steps' }, 500);
  }
});

// =========================================
// ENROLLMENTS
// =========================================

/**
 * POST /drip-campaigns/:id/enroll
 * Enroll a contact in the campaign
 */
dripCampaigns.post('/:id/enroll', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const { contact_id, source = 'manual', trigger_data = {} } = body;

    if (!contact_id) {
      return c.json({ error: 'contact_id is required' }, 400);
    }

    const enrollment = await dripCampaignService.enrollContact(
      campaignId,
      user.tenantId,
      contact_id,
      { source, trigger_data }
    );

    return c.json({
      success: true,
      data: enrollment
    }, 201);
  } catch (error) {
    console.error('[Drip Campaigns] Enroll error:', error);
    return c.json({ error: error.message || 'Failed to enroll contact' }, 500);
  }
});

/**
 * POST /drip-campaigns/:id/enroll-list
 * Bulk enroll contacts from a list
 */
dripCampaigns.post('/:id/enroll-list', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const { list_id } = body;

    if (!list_id) {
      return c.json({ error: 'list_id is required' }, 400);
    }

    const result = await dripCampaignService.enrollFromList(campaignId, user.tenantId, list_id);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Drip Campaigns] Bulk enroll error:', error);
    return c.json({ error: error.message || 'Failed to enroll contacts' }, 500);
  }
});

/**
 * POST /drip-campaigns/:id/unenroll
 * Remove a contact from the campaign
 */
dripCampaigns.post('/:id/unenroll', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const body = await c.req.json();

    const { contact_id, reason = 'manual' } = body;

    if (!contact_id) {
      return c.json({ error: 'contact_id is required' }, 400);
    }

    await dripCampaignService.unenrollContact(campaignId, user.tenantId, contact_id, reason);

    return c.json({
      success: true,
      message: 'Contact unenrolled'
    });
  } catch (error) {
    console.error('[Drip Campaigns] Unenroll error:', error);
    return c.json({ error: error.message || 'Failed to unenroll contact' }, 500);
  }
});

/**
 * GET /drip-campaigns/:id/enrollments
 * List enrollments for a campaign
 */
dripCampaigns.get('/:id/enrollments', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const { page = '1', limit = '50', status } = c.req.query();

    const result = await dripCampaignService.listEnrollments(campaignId, user.tenantId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    });

    return c.json({
      success: true,
      data: result.enrollments,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[Drip Campaigns] List enrollments error:', error);
    return c.json({ error: error.message || 'Failed to list enrollments' }, 500);
  }
});

/**
 * GET /drip-campaigns/:id/enrollments/:contactId
 * Get enrollment status for a specific contact
 */
dripCampaigns.get('/:id/enrollments/:contactId', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');
    const contactId = c.req.param('contactId');

    const enrollment = await dripCampaignService.getEnrollmentStatus(
      campaignId,
      user.tenantId,
      contactId
    );

    if (!enrollment) {
      return c.json({ error: 'Enrollment not found' }, 404);
    }

    return c.json({
      success: true,
      data: enrollment
    });
  } catch (error) {
    console.error('[Drip Campaigns] Get enrollment error:', error);
    return c.json({ error: error.message || 'Failed to get enrollment' }, 500);
  }
});

// =========================================
// STATISTICS
// =========================================

/**
 * GET /drip-campaigns/:id/stats
 * Get campaign statistics
 */
dripCampaigns.get('/:id/stats', async (c) => {
  try {
    const user = c.get('user');
    const campaignId = c.req.param('id');

    const stats = await dripCampaignService.getCampaignStats(campaignId, user.tenantId);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[Drip Campaigns] Stats error:', error);
    return c.json({ error: error.message || 'Failed to get stats' }, 500);
  }
});

// =========================================
// STEP PROCESSING (Admin/System)
// =========================================

/**
 * POST /drip-campaigns/process
 * Process due step executions (called by background job/cron)
 */
dripCampaigns.post('/process', async (c) => {
  try {
    // This should be restricted to internal/admin calls
    const results = await dripCampaignService.processDueSteps();

    return c.json({
      success: true,
      data: {
        processed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('[Drip Campaigns] Process error:', error);
    return c.json({ error: 'Failed to process steps' }, 500);
  }
});

export default dripCampaigns;
