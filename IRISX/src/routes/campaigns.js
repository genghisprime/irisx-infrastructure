/**
 * Campaign API Routes
 * Endpoints for bulk messaging campaign management
 */

import { Hono } from 'hono';
import campaignService from '../services/campaign.js';

const campaigns = new Hono();

// Middleware to get tenant_id (replace with actual auth middleware)
campaigns.use('*', async (c, next) => {
  c.set('tenant_id', 1); // TODO: Get from JWT/session
  await next();
});

/**
 * Create a new campaign
 * POST /v1/campaigns
 */
campaigns.post('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignData = await c.req.json();

    const campaign = await campaignService.createCampaign(tenant_id, campaignData);

    return c.json({ campaign }, 201);
  } catch (error) {
    console.error('Error creating campaign:', error);
    return c.json({ error: 'Failed to create campaign', message: error.message }, 500);
  }
});

/**
 * List all campaigns
 * GET /v1/campaigns
 */
campaigns.get('/', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const status = c.req.query('status');
    const type = c.req.query('type');

    const result = await campaignService.listCampaigns(tenant_id, {
      page,
      limit,
      status,
      type
    });

    return c.json(result);
  } catch (error) {
    console.error('Error listing campaigns:', error);
    return c.json({ error: 'Failed to list campaigns' }, 500);
  }
});

/**
 * Get campaign by ID
 * GET /v1/campaigns/:id
 */
campaigns.get('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');

    const campaign = await campaignService.getCampaign(campaignId, tenant_id);

    return c.json({ campaign });
  } catch (error) {
    console.error('Error getting campaign:', error);
    if (error.message === 'Campaign not found') {
      return c.json({ error: 'Campaign not found' }, 404);
    }
    return c.json({ error: 'Failed to get campaign' }, 500);
  }
});

/**
 * Update campaign
 * PUT /v1/campaigns/:id
 */
campaigns.put('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');
    const updates = await c.req.json();

    const campaign = await campaignService.updateCampaign(campaignId, tenant_id, updates);

    return c.json({ campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    if (error.message === 'Campaign not found') {
      return c.json({ error: 'Campaign not found' }, 404);
    }
    if (error.message === 'No valid fields to update') {
      return c.json({ error: 'No valid fields to update' }, 400);
    }
    return c.json({ error: 'Failed to update campaign', message: error.message }, 500);
  }
});

/**
 * Delete campaign
 * DELETE /v1/campaigns/:id
 */
campaigns.delete('/:id', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');

    await campaignService.deleteCampaign(campaignId, tenant_id);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    if (error.message === 'Campaign not found') {
      return c.json({ error: 'Campaign not found' }, 404);
    }
    return c.json({ error: 'Failed to delete campaign' }, 500);
  }
});

/**
 * Launch campaign (start sending)
 * POST /v1/campaigns/:id/launch
 */
campaigns.post('/:id/launch', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');

    const result = await campaignService.launchCampaign(campaignId, tenant_id);

    return c.json(result);
  } catch (error) {
    console.error('Error launching campaign:', error);
    return c.json({ error: 'Failed to launch campaign', message: error.message }, 500);
  }
});

/**
 * Pause campaign
 * POST /v1/campaigns/:id/pause
 */
campaigns.post('/:id/pause', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');

    const result = await campaignService.pauseCampaign(campaignId, tenant_id);

    return c.json(result);
  } catch (error) {
    console.error('Error pausing campaign:', error);
    return c.json({ error: 'Failed to pause campaign', message: error.message }, 500);
  }
});

/**
 * Get campaign statistics
 * GET /v1/campaigns/:id/stats
 */
campaigns.get('/:id/stats', async (c) => {
  try {
    const tenant_id = c.get('tenant_id');
    const campaignId = c.req.param('id');

    const stats = await campaignService.getCampaignStats(campaignId, tenant_id);

    return c.json({ stats });
  } catch (error) {
    console.error('Error getting campaign stats:', error);
    if (error.message === 'Campaign not found') {
      return c.json({ error: 'Campaign not found' }, 404);
    }
    return c.json({ error: 'Failed to get campaign stats' }, 500);
  }
});

export default campaigns;
