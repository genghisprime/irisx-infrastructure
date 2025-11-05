/**
 * Admin Alert Management API
 *
 * Manages email and SMS subscriptions to AWS SNS production alerts.
 * Allows admins to add/remove team members from CloudWatch alarm notifications.
 *
 * Features:
 * - Subscribe emails and phone numbers to SNS topic
 * - Unsubscribe contacts
 * - List all subscriptions
 * - View alert history
 * - Send test alerts
 *
 * SNS Topic: arn:aws:sns:us-east-1:895549500657:IRISX-Production-Alerts
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';
import { SNSClient, SubscribeCommand, UnsubscribeCommand, ListSubscriptionsByTopicCommand, PublishCommand } from '@aws-sdk/client-sns';

const app = new Hono();

// AWS SNS Client
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const SNS_TOPIC_ARN = process.env.SNS_ALERTS_TOPIC_ARN || 'arn:aws:sns:us-east-1:895549500657:IRISX-Production-Alerts';

// Validation schemas
const subscribeEmailSchema = z.object({
  email: z.string().email(),
  notes: z.string().optional()
});

const subscribeSMSSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/), // E.164 format: +1234567890
  notes: z.string().optional()
});

/**
 * POST /admin/alerts/subscriptions/email
 * Subscribe an email address to production alerts
 */
app.post('/subscriptions/email', authenticateAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const validated = subscribeEmailSchema.parse(body);
    const adminId = c.get('admin').adminId;

    // Check if already subscribed
    const existing = await query(
      'SELECT * FROM alert_subscriptions WHERE subscription_type = $1 AND contact_value = $2',
      ['email', validated.email]
    );

    if (existing.rows.length > 0) {
      return c.json({ error: 'Email already subscribed' }, 400);
    }

    // Subscribe to SNS topic
    const subscribeCommand = new SubscribeCommand({
      TopicArn: SNS_TOPIC_ARN,
      Protocol: 'email',
      Endpoint: validated.email,
      ReturnSubscriptionArn: true
    });

    const snsResponse = await snsClient.send(subscribeCommand);
    const subscriptionArn = snsResponse.SubscriptionArn;

    // Store in database
    const result = await query(
      `INSERT INTO alert_subscriptions
       (subscription_type, contact_value, sns_subscription_arn, sns_topic_arn, status, added_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        'email',
        validated.email,
        subscriptionArn === 'pending confirmation' ? null : subscriptionArn,
        SNS_TOPIC_ARN,
        'pending_confirmation',
        adminId,
        validated.notes || null
      ]
    );

    console.log(`[ALERTS] Email subscription created: ${validated.email} (pending confirmation)`);

    return c.json({
      success: true,
      message: 'Confirmation email sent. Please check inbox and click the confirmation link.',
      subscription: result.rows[0]
    }, 201);

  } catch (error) {
    console.error('[ALERTS] Error subscribing email:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid email address', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to subscribe email', details: error.message }, 500);
  }
});

/**
 * POST /admin/alerts/subscriptions/sms
 * Subscribe a phone number to production alerts via SMS
 */
app.post('/subscriptions/sms', authenticateAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const validated = subscribeSMSSchema.parse(body);
    const adminId = c.get('admin').adminId;

    // Check if already subscribed
    const existing = await query(
      'SELECT * FROM alert_subscriptions WHERE subscription_type = $1 AND contact_value = $2',
      ['sms', validated.phone]
    );

    if (existing.rows.length > 0) {
      return c.json({ error: 'Phone number already subscribed' }, 400);
    }

    // Subscribe to SNS topic
    const subscribeCommand = new SubscribeCommand({
      TopicArn: SNS_TOPIC_ARN,
      Protocol: 'sms',
      Endpoint: validated.phone,
      ReturnSubscriptionArn: true
    });

    const snsResponse = await snsClient.send(subscribeCommand);
    const subscriptionArn = snsResponse.SubscriptionArn;

    // Store in database
    const result = await query(
      `INSERT INTO alert_subscriptions
       (subscription_type, contact_value, sns_subscription_arn, sns_topic_arn, status, added_by, confirmed_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       RETURNING *`,
      [
        'sms',
        validated.phone,
        subscriptionArn,
        SNS_TOPIC_ARN,
        'active', // SMS subscriptions are auto-confirmed
        adminId,
        validated.notes || null
      ]
    );

    console.log(`[ALERTS] SMS subscription created: ${validated.phone}`);

    return c.json({
      success: true,
      message: 'Phone number subscribed successfully. Will receive SMS alerts.',
      subscription: result.rows[0]
    }, 201);

  } catch (error) {
    console.error('[ALERTS] Error subscribing SMS:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid phone number (must be E.164 format: +1234567890)', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to subscribe SMS', details: error.message }, 500);
  }
});

/**
 * GET /admin/alerts/subscriptions
 * List all alert subscriptions (email and SMS)
 */
app.get('/subscriptions', authenticateAdmin, async (c) => {
  try {
    const result = await query(
      `SELECT
        s.*,
        a.email as added_by_email,
        a.name as added_by_name
       FROM alert_subscriptions s
       LEFT JOIN admin_users a ON s.added_by = a.id
       WHERE s.status != 'unsubscribed'
       ORDER BY s.added_at DESC`
    );

    // Also fetch live SNS subscriptions to check sync
    const listCommand = new ListSubscriptionsByTopicCommand({
      TopicArn: SNS_TOPIC_ARN
    });
    const snsSubscriptions = await snsClient.send(listCommand);

    return c.json({
      subscriptions: result.rows,
      total: result.rows.length,
      email_count: result.rows.filter(s => s.subscription_type === 'email').length,
      sms_count: result.rows.filter(s => s.subscription_type === 'sms').length,
      sns_subscriptions: snsSubscriptions.Subscriptions.length // for verification
    });

  } catch (error) {
    console.error('[ALERTS] Error fetching subscriptions:', error);
    return c.json({ error: 'Failed to fetch subscriptions', details: error.message }, 500);
  }
});

/**
 * DELETE /admin/alerts/subscriptions/:id
 * Unsubscribe from production alerts
 */
app.delete('/subscriptions/:id', authenticateAdmin, async (c) => {
  try {
    const id = c.req.param('id');

    // Get subscription details
    const subscription = await query(
      'SELECT * FROM alert_subscriptions WHERE id = $1',
      [id]
    );

    if (subscription.rows.length === 0) {
      return c.json({ error: 'Subscription not found' }, 404);
    }

    const sub = subscription.rows[0];

    // Unsubscribe from SNS if we have an ARN
    if (sub.sns_subscription_arn) {
      try {
        const unsubscribeCommand = new UnsubscribeCommand({
          SubscriptionArn: sub.sns_subscription_arn
        });
        await snsClient.send(unsubscribeCommand);
        console.log(`[ALERTS] Unsubscribed from SNS: ${sub.contact_value}`);
      } catch (snsError) {
        console.error('[ALERTS] SNS unsubscribe error (continuing anyway):', snsError.message);
      }
    }

    // Mark as unsubscribed in database
    await query(
      'UPDATE alert_subscriptions SET status = $1, unsubscribed_at = NOW() WHERE id = $2',
      ['unsubscribed', id]
    );

    console.log(`[ALERTS] Subscription removed: ${sub.subscription_type} ${sub.contact_value}`);

    return c.json({
      success: true,
      message: `${sub.subscription_type === 'email' ? 'Email' : 'Phone number'} unsubscribed successfully`
    });

  } catch (error) {
    console.error('[ALERTS] Error unsubscribing:', error);
    return c.json({ error: 'Failed to unsubscribe', details: error.message }, 500);
  }
});

/**
 * POST /admin/alerts/test
 * Send a test alert to all subscribers
 */
app.post('/test', authenticateAdmin, async (c) => {
  try {
    const admin = c.get('admin');

    const publishCommand = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: '[TEST] IRISX Production Alert Test',
      Message: `This is a TEST alert from IRISX Platform.\n\nTriggered by: ${admin.email}\nTime: ${new Date().toISOString()}\n\nIf you received this, your alert subscription is working correctly.\n\nNo action needed - this is only a test.`
    });

    const response = await snsClient.send(publishCommand);

    console.log(`[ALERTS] Test alert sent by ${admin.email}, MessageId: ${response.MessageId}`);

    return c.json({
      success: true,
      message: 'Test alert sent to all subscribers',
      messageId: response.MessageId
    });

  } catch (error) {
    console.error('[ALERTS] Error sending test alert:', error);
    return c.json({ error: 'Failed to send test alert', details: error.message }, 500);
  }
});

/**
 * GET /admin/alerts/history
 * View recent CloudWatch alarm history
 */
app.get('/history', authenticateAdmin, async (c) => {
  try {
    const hours = parseInt(c.req.query('hours') || '168'); // Default 7 days

    const result = await query(
      `SELECT * FROM alert_history
       WHERE state_changed_at > NOW() - INTERVAL '${hours} hours'
       ORDER BY state_changed_at DESC
       LIMIT 100`
    );

    return c.json({
      alerts: result.rows,
      total: result.rows.length,
      timeRange: `${hours} hours`
    });

  } catch (error) {
    console.error('[ALERTS] Error fetching alert history:', error);
    return c.json({ error: 'Failed to fetch alert history', details: error.message }, 500);
  }
});

/**
 * GET /admin/alerts/stats
 * Alert statistics (how many alerts fired, success rate, etc.)
 */
app.get('/stats', authenticateAdmin, async (c) => {
  try {
    // Count subscriptions by type and status
    const subStats = await query(`
      SELECT
        subscription_type,
        status,
        COUNT(*) as count
      FROM alert_subscriptions
      GROUP BY subscription_type, status
    `);

    // Count alerts fired in last 7 days
    const alertStats = await query(`
      SELECT
        alarm_state,
        COUNT(*) as count
      FROM alert_history
      WHERE state_changed_at > NOW() - INTERVAL '7 days'
      GROUP BY alarm_state
    `);

    return c.json({
      subscriptions: subStats.rows,
      alerts_last_7_days: alertStats.rows,
      sns_topic_arn: SNS_TOPIC_ARN
    });

  } catch (error) {
    console.error('[ALERTS] Error fetching stats:', error);
    return c.json({ error: 'Failed to fetch stats', details: error.message }, 500);
  }
});

export default app;
