/**
 * Social Media API Routes
 * Unified routes for Discord, Slack, Microsoft Teams, and Telegram
 * Week 17-18: Social Media Integration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as socialService from '../services/social-media.js';
import pool from '../config/database.js';
import crypto from 'crypto';

const social = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const sendMessageSchema = z.object({
  platform: z.enum(['discord', 'slack', 'teams', 'telegram']),
  channel_id: z.string().min(1),
  text: z.string().min(1).max(4000),
  options: z.object({
    embeds: z.array(z.any()).optional(),
    blocks: z.array(z.any()).optional(),
    thread_ts: z.string().optional(),
    reply_to_message_id: z.number().optional(),
  }).optional(),
});

// =============================================================================
// Middleware
// =============================================================================

social.use('*', async (c, next) => {
  // Skip auth for webhook endpoints
  if (c.req.path.includes('/webhook/')) {
    return await next();
  }

  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('tenant_id', tenantId);
  await next();
});

// =============================================================================
// Discord Webhook
// =============================================================================

/**
 * POST /v1/social/webhook/discord
 * Discord gateway events
 */
social.post('/webhook/discord', async (c) => {
  try {
    const event = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('discord', $1, $2, NOW())`,
      [event.t, JSON.stringify(event)]
    );

    // Process event
    await socialService.processDiscordEvent(event);

    return c.json({ success: true });
  } catch (error) {
    console.error('Discord webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Slack Webhooks
// =============================================================================

/**
 * POST /v1/social/webhook/slack
 * Slack Events API
 */
social.post('/webhook/slack', async (c) => {
  try {
    const body = await c.req.json();

    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      return c.json({ challenge: body.challenge });
    }

    // Verify Slack signature
    const slackSignature = c.req.header('x-slack-signature');
    const timestamp = c.req.header('x-slack-request-timestamp');
    const rawBody = await c.req.text();

    // TODO: Verify signature in production
    // const isValid = verifySlackSignature(slackSignature, timestamp, rawBody);
    // if (!isValid) {
    //   return c.json({ error: 'Invalid signature' }, 401);
    // }

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('slack', $1, $2, NOW())`,
      [body.event?.type, JSON.stringify(body)]
    );

    // Process event
    if (body.event) {
      await socialService.processSlackEvent(body.event, body.team_id);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Slack webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/social/webhook/slack/interactive
 * Slack interactive components (buttons, menus)
 */
social.post('/webhook/slack/interactive', async (c) => {
  try {
    const formData = await c.req.parseBody();
    const payload = JSON.parse(formData.payload);

    // Log interaction
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('slack', 'interactive', $1, NOW())`,
      [JSON.stringify(payload)]
    );

    // TODO: Handle interactive actions

    return c.json({ success: true });
  } catch (error) {
    console.error('Slack interactive error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Microsoft Teams Webhook
// =============================================================================

/**
 * POST /v1/social/webhook/teams
 * Teams Bot Framework activities
 */
social.post('/webhook/teams', async (c) => {
  try {
    const activity = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('teams', $1, $2, NOW())`,
      [activity.type, JSON.stringify(activity)]
    );

    // Get tenant from conversation (stored during bot setup)
    const tenantId = activity.channelData?.tenant?.id;

    if (activity.type === 'message') {
      await socialService.processTeamsActivity(activity, tenantId);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Teams webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Telegram Webhook
// =============================================================================

/**
 * POST /v1/social/webhook/telegram/:bot_token
 * Telegram bot updates
 */
social.post('/webhook/telegram/:bot_token', async (c) => {
  try {
    const botToken = c.req.param('bot_token');
    const update = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('telegram', 'update', $1, NOW())`,
      [JSON.stringify(update)]
    );

    // Process update
    await socialService.processTelegramUpdate(update, botToken);

    return c.json({ success: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Message Sending Routes
// =============================================================================

/**
 * POST /v1/social/send
 * Send message to any platform
 */
social.post('/send', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendMessageSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    const { platform, channel_id, text, options = {} } = validation.data;

    // Get account
    const account = await socialService.getSocialAccountByTenant(tenantId, platform);
    if (!account) {
      return c.json({ error: `No ${platform} account found` }, 404);
    }

    // Send message based on platform
    let result;
    switch (platform) {
      case 'discord':
        result = await socialService.sendDiscordMessage(account.id, channel_id, text, options);
        break;

      case 'slack':
        result = await socialService.sendSlackMessage(account.id, channel_id, text, options);
        break;

      case 'teams':
        result = await socialService.sendTeamsMessage(account.id, channel_id, text, options);
        break;

      case 'telegram':
        result = await socialService.sendTelegramMessage(account.id, channel_id, text, options);
        break;

      default:
        return c.json({ error: 'Unsupported platform' }, 400);
    }

    return c.json({
      success: true,
      platform,
      message: result,
    });
  } catch (error) {
    console.error('Send message error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Data Retrieval Routes
// =============================================================================

/**
 * GET /v1/social/accounts
 * Get all social media accounts for tenant
 */
social.get('/accounts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const accounts = await socialService.getSocialAccounts(tenantId);

    // Don't expose tokens
    const sanitized = accounts.map(acc => ({
      ...acc,
      access_token: undefined,
      refresh_token: undefined,
      bot_token: undefined,
    }));

    return c.json({
      success: true,
      accounts: sanitized,
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/accounts/:id/channels
 * Get channels for a social account
 */
social.get('/accounts/:id/channels', async (c) => {
  try {
    const accountId = c.req.param('id');
    const channels = await socialService.getSocialChannels(accountId);

    return c.json({
      success: true,
      channels,
    });
  } catch (error) {
    console.error('Get channels error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/messages
 * Get messages (with platform and channel filters)
 */
social.get('/messages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const platform = c.req.query('platform');
    const channelId = c.req.query('channel_id');
    const limit = parseInt(c.req.query('limit') || '100');

    let query = `
      SELECT sm.*, su.display_name, su.avatar_url
      FROM social_messages sm
      LEFT JOIN social_users su ON (sm.from_user_id = su.platform_user_id AND su.platform = sm.platform)
      WHERE sm.tenant_id = $1
    `;
    const params = [tenantId];
    let paramCount = 1;

    if (platform) {
      paramCount++;
      query += ` AND sm.platform = $${paramCount}`;
      params.push(platform);
    }

    if (channelId) {
      paramCount++;
      query += ` AND sm.platform_channel_id = $${paramCount}`;
      params.push(channelId);
    }

    query += ` ORDER BY sm.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      messages: rows.reverse(),
      count: rows.length,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/channels/:platform/:channel_id/messages
 * Get messages for specific channel
 */
social.get('/channels/:platform/:channel_id/messages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const platform = c.req.param('platform');
    const channelId = c.req.param('channel_id');
    const limit = parseInt(c.req.query('limit') || '100');

    const messages = await socialService.getChannelMessages(
      tenantId,
      platform,
      channelId,
      limit
    );

    return c.json({
      success: true,
      platform,
      channel_id: channelId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error('Get channel messages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/stats
 * Get statistics for all social accounts
 */
social.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const { rows } = await pool.query(
      'SELECT * FROM social_stats WHERE tenant_id = $1',
      [tenantId]
    );

    return c.json({
      success: true,
      stats: rows,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/users
 * Get social media users (contacts)
 */
social.get('/users', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const platform = c.req.query('platform');

    let query = 'SELECT * FROM social_users WHERE tenant_id = $1';
    const params = [tenantId];

    if (platform) {
      query += ' AND platform = $2';
      params.push(platform);
    }

    query += ' ORDER BY last_message_at DESC NULLS LAST';

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      users: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get users error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

function verifySlackSignature(signature, timestamp, body) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // Skip in development

  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    return false; // Timestamp too old
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

export default social;
