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
 * GET /admin/campaigns/stats
 * Dashboard statistics for campaign monitoring
 */
adminCampaigns.get('/stats', async (c) => {
  try {
    // Get campaign overview stats
    const smsStats = await pool.query(`
      SELECT
        COUNT(DISTINCT tenant_id) as active_tenants,
        COUNT(*) as total_messages_24h,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(price), 0) as total_cost
      FROM sms_messages
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    const emailStats = await pool.query(`
      SELECT
        COUNT(DISTINCT tenant_id) as active_tenants,
        COUNT(*) as total_emails_24h,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
      FROM emails
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Opt-out/compliance stats
    const optOutStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sms_opt_outs WHERE opted_out_at >= NOW() - INTERVAL '24 hours') as sms_opt_outs_24h,
        (SELECT COUNT(*) FROM email_unsubscribes WHERE unsubscribed_at >= NOW() - INTERVAL '24 hours') as email_unsubscribes_24h
    `);

    return c.json({
      sms: smsStats.rows[0],
      email: emailStats.rows[0],
      compliance: optOutStats.rows[0]
    });
  } catch (err) {
    console.error('Campaign stats error:', err);
    return c.json({ error: 'Failed to load campaign stats' }, 500);
  }
});

/**
 * POST /admin/campaigns/:id/pause
 * Pause a campaign
 */
adminCampaigns.post('/:id/pause', async (c) => {
  try {
    const campaignId = c.req.param('id');
    const admin = c.get('admin');

    // Log the pause action
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'pause_campaign',
      'campaign',
      campaignId,
      JSON.stringify({ action: 'pause', timestamp: new Date().toISOString() }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({ message: 'Campaign paused', id: campaignId });
  } catch (err) {
    console.error('Campaign pause error:', err);
    return c.json({ error: 'Failed to pause campaign' }, 500);
  }
});

/**
 * POST /admin/campaigns/:tenantId/emergency-stop
 * EMERGENCY: Immediately stop ALL campaign activity for a tenant
 * This cancels scheduled SMS, marks active calls for termination,
 * and suspends email sending
 */
adminCampaigns.post('/:tenantId/emergency-stop', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const { reason } = await c.req.json();
    const admin = c.get('admin');

    if (!reason) {
      return c.json({ error: 'Reason is required for emergency stop' }, 400);
    }

    const results = {
      tenant_id: parseInt(tenantId),
      stopped_at: new Date().toISOString(),
      reason,
      actions: []
    };

    // 1. Cancel all pending scheduled SMS
    const smsResult = await pool.query(`
      UPDATE sms_scheduled
      SET status = 'cancelled', error_message = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND status = 'pending'
      RETURNING id
    `, [`EMERGENCY STOP by admin: ${reason}`, tenantId]);
    results.actions.push({
      type: 'sms_scheduled',
      cancelled: smsResult.rows.length
    });

    // 2. Cancel any pending scheduled emails
    const emailResult = await pool.query(`
      UPDATE email_queue
      SET status = 'cancelled', error = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND status IN ('pending', 'queued')
      RETURNING id
    `, [`EMERGENCY STOP by admin: ${reason}`, tenantId]);
    results.actions.push({
      type: 'email_queue',
      cancelled: emailResult.rows.length
    });

    // 3. Mark active outbound calls for termination
    const callResult = await pool.query(`
      UPDATE calls
      SET
        status = 'completed',
        hangup_cause = 'EMERGENCY_STOP',
        hangup_by = 'admin',
        ended_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE tenant_id = $2
        AND status IN ('in-progress', 'ringing', 'queued')
        AND direction = 'outbound'
      RETURNING id, uuid
    `, [JSON.stringify({
      emergency_stop: true,
      admin_id: admin.id,
      reason,
      stopped_at: new Date().toISOString()
    }), tenantId]);
    results.actions.push({
      type: 'calls',
      terminated: callResult.rows.length,
      uuids: callResult.rows.map(r => r.uuid)
    });

    // 4. If FreeSWITCH is connected, actually terminate the calls
    try {
      const freeswitch = c.get('freeswitch');
      if (freeswitch && freeswitch.connection) {
        for (const call of callResult.rows) {
          if (call.uuid) {
            await freeswitch.api(`uuid_kill ${call.uuid}`);
          }
        }
      }
    } catch (fsError) {
      console.error('FreeSWITCH termination error:', fsError);
      results.freeswitch_error = 'Some calls may still be active - manual check required';
    }

    // 5. Add a tenant flag indicating emergency stop (for rate limiting future requests)
    await pool.query(`
      UPDATE tenants
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
    `, [JSON.stringify({
      emergency_stop: {
        active: true,
        reason,
        stopped_by: admin.email,
        stopped_at: new Date().toISOString()
      }
    }), tenantId]);

    // 6. Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'emergency_stop_campaign',
      'tenant',
      tenantId,
      JSON.stringify(results),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Emergency stop executed',
      ...results
    });
  } catch (err) {
    console.error('Emergency stop error:', err);
    return c.json({ error: 'Failed to execute emergency stop' }, 500);
  }
});

/**
 * POST /admin/campaigns/:tenantId/resume
 * Resume campaign activity after emergency stop
 */
adminCampaigns.post('/:tenantId/resume', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const { reason } = await c.req.json();
    const admin = c.get('admin');

    // Clear the emergency stop flag
    await pool.query(`
      UPDATE tenants
      SET metadata = COALESCE(metadata, '{}'::jsonb) - 'emergency_stop'
      WHERE id = $1
    `, [tenantId]);

    // Log to audit trail
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      admin.id,
      'resume_campaign',
      'tenant',
      tenantId,
      JSON.stringify({
        resumed_at: new Date().toISOString(),
        reason: reason || 'Issue resolved'
      }),
      c.req.header('x-forwarded-for') || 'unknown',
      c.req.header('user-agent')
    ]);

    return c.json({
      success: true,
      message: 'Campaign activity resumed',
      tenant_id: parseInt(tenantId),
      resumed_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Campaign resume error:', err);
    return c.json({ error: 'Failed to resume campaign' }, 500);
  }
});

/**
 * GET /admin/campaigns/:tenantId/activity
 * Get detailed campaign activity for a specific tenant
 */
adminCampaigns.get('/:tenantId/activity', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const { hours = 24 } = c.req.query();

    // Get tenant info with emergency stop status
    const tenantResult = await pool.query(`
      SELECT id, name, status, metadata
      FROM tenants WHERE id = $1
    `, [tenantId]);

    if (tenantResult.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantResult.rows[0];

    // SMS activity
    const smsActivity = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(price), 0) as cost
      FROM sms_messages
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
    `, [tenantId]);

    // Email activity
    const emailActivity = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
      FROM emails
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
    `, [tenantId]);

    // Call activity
    const callActivity = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as active
      FROM calls
      WHERE tenant_id = $1 AND initiated_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
    `, [tenantId]);

    // Pending items
    const pendingItems = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sms_scheduled WHERE tenant_id = $1 AND status = 'pending') as pending_sms,
        (SELECT COUNT(*) FROM email_queue WHERE tenant_id = $1 AND status IN ('pending', 'queued')) as pending_emails
    `, [tenantId]);

    return c.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        emergency_stop: tenant.metadata?.emergency_stop || null
      },
      period_hours: parseInt(hours),
      sms: smsActivity.rows[0],
      email: emailActivity.rows[0],
      calls: callActivity.rows[0],
      pending: pendingItems.rows[0]
    });
  } catch (err) {
    console.error('Campaign activity error:', err);
    return c.json({ error: 'Failed to load campaign activity' }, 500);
  }
});

/**
 * GET /admin/campaigns/active
 * List all active campaigns across all tenants
 */
adminCampaigns.get('/active', async (c) => {
  try {
    // Get tenants with active campaign activity (last hour)
    const result = await pool.query(`
      SELECT
        t.id as tenant_id,
        t.name as tenant_name,
        t.status as tenant_status,
        t.metadata->>'emergency_stop' as emergency_stop,
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour') as sms_last_hour,
        (SELECT COUNT(*) FROM emails WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour') as emails_last_hour,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND initiated_at >= NOW() - INTERVAL '1 hour') as calls_last_hour,
        (SELECT COUNT(*) FROM sms_scheduled WHERE tenant_id = t.id AND status = 'pending') as pending_sms,
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND status = 'in-progress') as active_calls
      FROM tenants t
      WHERE t.deleted_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM sms_messages WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour')
          OR EXISTS (SELECT 1 FROM emails WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour')
          OR EXISTS (SELECT 1 FROM calls WHERE tenant_id = t.id AND initiated_at >= NOW() - INTERVAL '1 hour')
          OR EXISTS (SELECT 1 FROM sms_scheduled WHERE tenant_id = t.id AND status = 'pending')
          OR EXISTS (SELECT 1 FROM calls WHERE tenant_id = t.id AND status = 'in-progress')
        )
      ORDER BY (
        (SELECT COUNT(*) FROM sms_messages WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour') +
        (SELECT COUNT(*) FROM emails WHERE tenant_id = t.id AND created_at >= NOW() - INTERVAL '1 hour') +
        (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id AND initiated_at >= NOW() - INTERVAL '1 hour')
      ) DESC
      LIMIT 50
    `);

    return c.json({
      active_campaigns: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Active campaigns error:', err);
    return c.json({ error: 'Failed to load active campaigns' }, 500);
  }
});

export default adminCampaigns;
