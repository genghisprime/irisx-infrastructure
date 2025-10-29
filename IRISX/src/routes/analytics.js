/**
 * Analytics API Routes
 * Real-time metrics and reporting for admin dashboard
 *
 * Endpoints:
 * - GET /v1/analytics/dashboard       - Dashboard overview stats
 * - GET /v1/analytics/calls           - Call analytics
 * - GET /v1/analytics/sms             - SMS analytics
 * - GET /v1/analytics/email           - Email analytics
 * - GET /v1/analytics/usage           - Usage & billing
 * - GET /v1/analytics/webhooks        - Webhook delivery stats
 */

import { Hono } from 'hono';
import { query } from '../db/index.js';

const analytics = new Hono();

/**
 * Dashboard overview - all key metrics
 * GET /v1/analytics/dashboard
 */
analytics.get('/dashboard', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days') || '30');

    // Get call stats
    const callStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_calls,
         COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_calls,
         COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
         COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
         SUM(duration_seconds) FILTER (WHERE status = 'completed') as total_minutes,
         AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration
       FROM calls
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'`,
      [tenantId]
    );

    // Get SMS stats
    const smsStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'outbound') as sms_sent,
         COUNT(*) FILTER (WHERE direction = 'inbound') as sms_received,
         COUNT(*) FILTER (WHERE status = 'delivered') as sms_delivered,
         COUNT(*) FILTER (WHERE status = 'failed') as sms_failed
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'`,
      [tenantId]
    );

    // Get email stats
    const emailStats = await query(
      `SELECT
         COUNT(*) as emails_sent,
         COUNT(*) FILTER (WHERE status = 'delivered') as emails_delivered,
         COUNT(*) FILTER (WHERE status = 'opened') as emails_opened,
         COUNT(*) FILTER (WHERE status = 'clicked') as emails_clicked,
         COUNT(*) FILTER (WHERE status = 'bounced') as emails_bounced
       FROM emails
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'`,
      [tenantId]
    );

    // Get webhook stats
    const webhookStats = await query(
      `SELECT
         COUNT(*) as total_deliveries,
         COUNT(*) FILTER (WHERE status = 'success') as successful_deliveries,
         COUNT(*) FILTER (WHERE status = 'failed') as failed_deliveries,
         AVG(duration_ms) FILTER (WHERE status = 'success') as avg_delivery_time
       FROM webhook_deliveries
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'`,
      [tenantId]
    );

    // Get usage summary
    const usageStats = await query(
      `SELECT
         SUM(cost_total_cents) as total_cost_cents,
         SUM(calls_inbound_count + calls_outbound_count) as total_calls,
         SUM(sms_sent_count) as total_sms,
         SUM(call_minutes_total) as total_call_minutes
       FROM tenant_usage
       WHERE tenant_id = $1
         AND usage_date >= CURRENT_DATE - INTERVAL '${days} days'`,
      [tenantId]
    );

    return c.json({
      period: `${days} days`,
      calls: {
        inbound: parseInt(callStats.rows[0].inbound_calls) || 0,
        outbound: parseInt(callStats.rows[0].outbound_calls) || 0,
        completed: parseInt(callStats.rows[0].completed_calls) || 0,
        failed: parseInt(callStats.rows[0].failed_calls) || 0,
        total_minutes: parseFloat(callStats.rows[0].total_minutes) || 0,
        avg_duration_seconds: parseFloat(callStats.rows[0].avg_duration) || 0
      },
      sms: {
        sent: parseInt(smsStats.rows[0].sms_sent) || 0,
        received: parseInt(smsStats.rows[0].sms_received) || 0,
        delivered: parseInt(smsStats.rows[0].sms_delivered) || 0,
        failed: parseInt(smsStats.rows[0].sms_failed) || 0,
        delivery_rate: smsStats.rows[0].sms_sent > 0
          ? (parseInt(smsStats.rows[0].sms_delivered) / parseInt(smsStats.rows[0].sms_sent) * 100).toFixed(2)
          : 0
      },
      email: {
        sent: parseInt(emailStats.rows[0].emails_sent) || 0,
        delivered: parseInt(emailStats.rows[0].emails_delivered) || 0,
        opened: parseInt(emailStats.rows[0].emails_opened) || 0,
        clicked: parseInt(emailStats.rows[0].emails_clicked) || 0,
        bounced: parseInt(emailStats.rows[0].emails_bounced) || 0,
        open_rate: emailStats.rows[0].emails_delivered > 0
          ? (parseInt(emailStats.rows[0].emails_opened) / parseInt(emailStats.rows[0].emails_delivered) * 100).toFixed(2)
          : 0,
        click_rate: emailStats.rows[0].emails_delivered > 0
          ? (parseInt(emailStats.rows[0].emails_clicked) / parseInt(emailStats.rows[0].emails_delivered) * 100).toFixed(2)
          : 0
      },
      webhooks: {
        total: parseInt(webhookStats.rows[0].total_deliveries) || 0,
        successful: parseInt(webhookStats.rows[0].successful_deliveries) || 0,
        failed: parseInt(webhookStats.rows[0].failed_deliveries) || 0,
        avg_delivery_ms: parseFloat(webhookStats.rows[0].avg_delivery_time) || 0,
        success_rate: webhookStats.rows[0].total_deliveries > 0
          ? (parseInt(webhookStats.rows[0].successful_deliveries) / parseInt(webhookStats.rows[0].total_deliveries) * 100).toFixed(2)
          : 0
      },
      usage: {
        total_cost_cents: parseInt(usageStats.rows[0].total_cost_cents) || 0,
        total_cost_dollars: ((parseInt(usageStats.rows[0].total_cost_cents) || 0) / 100).toFixed(2),
        total_calls: parseInt(usageStats.rows[0].total_calls) || 0,
        total_sms: parseInt(usageStats.rows[0].total_sms) || 0,
        total_call_minutes: parseFloat(usageStats.rows[0].total_call_minutes) || 0
      }
    });
  } catch (error) {
    console.error('[Analytics] Error getting dashboard stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Call analytics with time series
 * GET /v1/analytics/calls
 */
analytics.get('/calls', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days') || '30');
    const groupBy = c.req.query('groupBy') || 'day'; // day, hour

    let dateFormat;
    if (groupBy === 'hour') {
      dateFormat = 'YYYY-MM-DD HH24:00:00';
    } else {
      dateFormat = 'YYYY-MM-DD';
    }

    // Time series data
    const timeSeries = await query(
      `SELECT
         TO_CHAR(created_at, '${dateFormat}') as period,
         COUNT(*) as total_calls,
         COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
         COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         SUM(duration_seconds) FILTER (WHERE status = 'completed') as total_duration
       FROM calls
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY period
       ORDER BY period ASC`,
      [tenantId]
    );

    // Top destinations
    const topDestinations = await query(
      `SELECT
         to_number,
         COUNT(*) as call_count,
         SUM(duration_seconds) as total_duration
       FROM calls
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
         AND direction = 'outbound'
       GROUP BY to_number
       ORDER BY call_count DESC
       LIMIT 10`,
      [tenantId]
    );

    // Failure reasons
    const failureReasons = await query(
      `SELECT
         hangup_cause,
         COUNT(*) as count
       FROM calls
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
         AND status = 'failed'
       GROUP BY hangup_cause
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    return c.json({
      time_series: timeSeries.rows,
      top_destinations: topDestinations.rows,
      failure_reasons: failureReasons.rows
    });
  } catch (error) {
    console.error('[Analytics] Error getting call analytics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * SMS analytics
 * GET /v1/analytics/sms
 */
analytics.get('/sms', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days') || '30');

    // Time series
    const timeSeries = await query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM-DD') as period,
         COUNT(*) FILTER (WHERE direction = 'outbound') as sent,
         COUNT(*) FILTER (WHERE direction = 'inbound') as received,
         COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
         COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY period
       ORDER BY period ASC`,
      [tenantId]
    );

    // Top recipients
    const topRecipients = await query(
      `SELECT
         to_number,
         COUNT(*) as message_count
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
         AND direction = 'outbound'
       GROUP BY to_number
       ORDER BY message_count DESC
       LIMIT 10`,
      [tenantId]
    );

    // Segment distribution
    const segmentStats = await query(
      `SELECT
         segments,
         COUNT(*) as count
       FROM sms_messages
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY segments
       ORDER BY segments ASC`,
      [tenantId]
    );

    return c.json({
      time_series: timeSeries.rows,
      top_recipients: topRecipients.rows,
      segment_distribution: segmentStats.rows
    });
  } catch (error) {
    console.error('[Analytics] Error getting SMS analytics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Email analytics
 * GET /v1/analytics/email
 */
analytics.get('/email', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days') || '30');

    // Time series
    const timeSeries = await query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM-DD') as period,
         COUNT(*) as sent,
         COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
         COUNT(*) FILTER (WHERE status = 'opened') as opened,
         COUNT(*) FILTER (WHERE status = 'clicked') as clicked,
         COUNT(*) FILTER (WHERE status = 'bounced') as bounced
       FROM emails
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY period
       ORDER BY period ASC`,
      [tenantId]
    );

    // Email type breakdown
    const typeStats = await query(
      `SELECT
         email_type,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
         COUNT(*) FILTER (WHERE status = 'opened') as opened
       FROM emails
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY email_type`,
      [tenantId]
    );

    // Top domains
    const topDomains = await query(
      `SELECT
         SUBSTRING(to_email FROM '@(.*)$') as domain,
         COUNT(*) as count
       FROM emails
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY domain
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    return c.json({
      time_series: timeSeries.rows,
      type_breakdown: typeStats.rows,
      top_domains: topDomains.rows
    });
  } catch (error) {
    console.error('[Analytics] Error getting email analytics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Usage and billing analytics
 * GET /v1/analytics/usage
 */
analytics.get('/usage', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const months = parseInt(c.req.query('months') || '6');

    // Monthly usage
    const monthlyUsage = await query(
      `SELECT
         TO_CHAR(usage_date, 'YYYY-MM') as month,
         SUM(calls_inbound_count + calls_outbound_count) as total_calls,
         SUM(call_minutes_total) as total_minutes,
         SUM(sms_sent_count) as total_sms,
         SUM(recordings_count) as total_recordings,
         SUM(cost_total_cents) as total_cost_cents
       FROM tenant_usage
       WHERE tenant_id = $1
         AND usage_date >= CURRENT_DATE - INTERVAL '${months} months'
       GROUP BY month
       ORDER BY month ASC`,
      [tenantId]
    );

    // Cost breakdown
    const costBreakdown = await query(
      `SELECT
         SUM(call_minutes_total * 1.5) as call_costs_cents,
         SUM(sms_sent_count * 0.5) as sms_costs_cents,
         SUM(recordings_count * 5) as recording_costs_cents
       FROM tenant_usage
       WHERE tenant_id = $1
         AND usage_date >= CURRENT_DATE - INTERVAL '30 days'`,
      [tenantId]
    );

    return c.json({
      monthly_usage: monthlyUsage.rows.map(row => ({
        ...row,
        total_cost_dollars: (parseInt(row.total_cost_cents) / 100).toFixed(2)
      })),
      cost_breakdown: {
        calls_cents: parseInt(costBreakdown.rows[0].call_costs_cents) || 0,
        sms_cents: parseInt(costBreakdown.rows[0].sms_costs_cents) || 0,
        recordings_cents: parseInt(costBreakdown.rows[0].recording_costs_cents) || 0
      }
    });
  } catch (error) {
    console.error('[Analytics] Error getting usage analytics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Webhook delivery analytics
 * GET /v1/analytics/webhooks
 */
analytics.get('/webhooks', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days') || '30');

    // Time series
    const timeSeries = await query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM-DD') as period,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'success') as successful,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration
       FROM webhook_deliveries
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY period
       ORDER BY period ASC`,
      [tenantId]
    );

    // Event type breakdown
    const eventTypes = await query(
      `SELECT
         event_type,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE status = 'success') as successful
       FROM webhook_deliveries
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY event_type
       ORDER BY count DESC`,
      [tenantId]
    );

    // Webhook performance
    const webhookPerformance = await query(
      `SELECT
         w.id,
         w.url,
         COUNT(wd.*) as total_deliveries,
         COUNT(*) FILTER (WHERE wd.status = 'success') as successful,
         AVG(wd.duration_ms) FILTER (WHERE wd.status = 'success') as avg_duration
       FROM webhooks w
       LEFT JOIN webhook_deliveries wd ON wd.webhook_id = w.id
         AND wd.created_at >= NOW() - INTERVAL '${days} days'
       WHERE w.tenant_id = $1
       GROUP BY w.id, w.url
       ORDER BY total_deliveries DESC`,
      [tenantId]
    );

    return c.json({
      time_series: timeSeries.rows,
      event_types: eventTypes.rows,
      webhook_performance: webhookPerformance.rows
    });
  } catch (error) {
    console.error('[Analytics] Error getting webhook analytics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default analytics;
