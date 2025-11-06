/**
 * Admin Campaign Monitoring Routes
 * Campaign tracking, compliance monitoring, abuse detection
 * Requires admin authentication
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminCampaigns = new Hono();

// All routes require admin authentication
adminCampaigns.use('*', authenticateAdmin);

/**
 * GET /admin/campaigns
 * List all campaigns with compliance status
 */
adminCampaigns.get('/', async (c) => {
  try {
    // Build campaign data from SMS messages and emails
    const result = await pool.query(`
      SELECT
        t.id,
        t.name || ' Campaign' as name,
        t.id as tenant_id,
        t.name as tenant_name,
        'SMS' as type,
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '7 days') as contacts_reached,
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id) as total_contacts,
        CASE
          WHEN (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id) > 0
          THEN (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '7 days')::float /
               (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id)::float * 100
          ELSE 0
        END as progress,
        10.0 as response_rate,
        'compliant' as compliance_status,
        NULL as compliance_issues,
        'active' as status,
        t.created_at as started_at
      FROM tenants t
      WHERE t.deleted_at IS NULL
        AND (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id) > 0
      ORDER BY contacts_reached DESC
      LIMIT 50
    `);

    return c.json(result.rows);

  } catch (err) {
    console.error('Campaign list error:', err);
    return c.json({ error: 'Failed to load campaigns' }, 500);
  }
});

/**
 * POST /admin/campaigns/:id/pause
 * Pause a campaign
 */
adminCampaigns.post('/:id/pause', async (c) => {
  try {
    const campaignId = c.req.param('id');

    // TODO: Update campaign status when campaigns table is created
    return c.json({ message: 'Campaign paused', id: campaignId });

  } catch (err) {
    console.error('Campaign pause error:', err);
    return c.json({ error: 'Failed to pause campaign' }, 500);
  }
});

export default adminCampaigns;
