/**
 * Traditional Social Media Routes
 * API routes for Facebook, Twitter, Instagram, and LinkedIn messaging
 * Handles webhooks, message sending, and conversation management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as traditionalSocial from '../services/traditional-social.js';
import pool from '../db/connection.js';
import crypto from 'crypto';

const social = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const sendFacebookMessageSchema = z.object({
  page_id: z.string().min(1),
  recipient_psid: z.string().min(1),
  text: z.string().min(1).max(2000),
  quick_replies: z.array(z.object({
    content_type: z.string(),
    title: z.string(),
    payload: z.string(),
  })).optional(),
});

const sendTwitterDMSchema = z.object({
  account_id: z.string().min(1),
  recipient_id: z.string().min(1),
  text: z.string().min(1).max(10000),
});

const sendInstagramMessageSchema = z.object({
  account_id: z.string().min(1),
  recipient_igsid: z.string().min(1),
  text: z.string().min(1).max(1000),
});

const sendLinkedInMessageSchema = z.object({
  page_id: z.string().min(1),
  recipient_urn: z.string().min(1),
  text: z.string().min(1).max(1000),
});

// =============================================================================
// Middleware
// =============================================================================

social.use('*', async (c, next) => {
  // Skip auth for webhook endpoints
  if (c.req.path.includes('/webhook')) {
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
// Facebook Webhooks
// =============================================================================

/**
 * GET /v1/social/traditional/webhook/facebook
 * Facebook webhook verification
 */
social.get('/webhook/facebook', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  // Get verify token from platform app settings
  const { rows } = await pool.query(
    `SELECT webhook_verify_token FROM social_platform_apps WHERE platform = 'facebook'`
  );

  const verifyToken = rows[0]?.webhook_verify_token || process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Facebook webhook verified');
    return c.text(challenge);
  }

  return c.json({ error: 'Verification failed' }, 403);
});

/**
 * POST /v1/social/traditional/webhook/facebook
 * Handle Facebook/Messenger webhook events
 */
social.post('/webhook/facebook', async (c) => {
  try {
    const body = await c.req.json();

    // Verify signature
    const signature = c.req.header('x-hub-signature-256');
    if (signature && process.env.FACEBOOK_APP_SECRET) {
      const rawBody = JSON.stringify(body);
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Facebook webhook signature mismatch');
        return c.json({ error: 'Invalid signature' }, 401);
      }
    }

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('facebook', $1, $2, NOW())`,
      [body.object, JSON.stringify(body)]
    );

    // Process webhook
    await traditionalSocial.processFacebookWebhook(body);

    return c.json({ success: true });
  } catch (error) {
    console.error('Facebook webhook error:', error);
    return c.json({ success: true }); // Always return 200 to Facebook
  }
});

// =============================================================================
// Twitter Webhooks (Account Activity API)
// =============================================================================

/**
 * GET /v1/social/traditional/webhook/twitter
 * Twitter CRC challenge
 */
social.get('/webhook/twitter', async (c) => {
  const crcToken = c.req.query('crc_token');

  if (!crcToken) {
    return c.json({ error: 'Missing crc_token' }, 400);
  }

  const { rows } = await pool.query(
    `SELECT app_secret FROM social_platform_apps WHERE platform = 'twitter'`
  );

  const consumerSecret = rows[0]?.app_secret || process.env.TWITTER_CONSUMER_SECRET;

  const hmac = crypto.createHmac('sha256', consumerSecret)
    .update(crcToken)
    .digest('base64');

  return c.json({ response_token: `sha256=${hmac}` });
});

/**
 * POST /v1/social/traditional/webhook/twitter
 * Handle Twitter Account Activity events
 */
social.post('/webhook/twitter', async (c) => {
  try {
    const body = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('twitter', 'account_activity', $1, NOW())`,
      [JSON.stringify(body)]
    );

    // Process webhook
    if (body.for_user_id && body.direct_message_events) {
      await traditionalSocial.processTwitterWebhook(body.for_user_id, body.direct_message_events);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Twitter webhook error:', error);
    return c.json({ success: true });
  }
});

// =============================================================================
// Instagram Webhooks (via Facebook/Meta)
// =============================================================================

/**
 * GET /v1/social/traditional/webhook/instagram
 * Instagram webhook verification (same as Facebook)
 */
social.get('/webhook/instagram', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const { rows } = await pool.query(
    `SELECT webhook_verify_token FROM social_platform_apps WHERE platform = 'instagram'`
  );

  const verifyToken = rows[0]?.webhook_verify_token || process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Instagram webhook verified');
    return c.text(challenge);
  }

  return c.json({ error: 'Verification failed' }, 403);
});

/**
 * POST /v1/social/traditional/webhook/instagram
 * Handle Instagram webhook events
 */
social.post('/webhook/instagram', async (c) => {
  try {
    const body = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('instagram', $1, $2, NOW())`,
      [body.object, JSON.stringify(body)]
    );

    // Process webhook
    await traditionalSocial.processInstagramWebhook(body);

    return c.json({ success: true });
  } catch (error) {
    console.error('Instagram webhook error:', error);
    return c.json({ success: true });
  }
});

// =============================================================================
// LinkedIn Webhooks
// =============================================================================

/**
 * POST /v1/social/traditional/webhook/linkedin
 * Handle LinkedIn webhook events
 */
social.post('/webhook/linkedin', async (c) => {
  try {
    const body = await c.req.json();

    // Log webhook
    await pool.query(
      `INSERT INTO social_webhooks_log (platform, event_type, payload, received_at)
       VALUES ('linkedin', 'notification', $1, NOW())`,
      [JSON.stringify(body)]
    );

    // LinkedIn webhooks are primarily for page mentions and comments
    // DMs are handled differently through the API

    return c.json({ success: true });
  } catch (error) {
    console.error('LinkedIn webhook error:', error);
    return c.json({ success: true });
  }
});

// =============================================================================
// Facebook Messaging Routes
// =============================================================================

/**
 * POST /v1/social/traditional/facebook/send
 * Send a message via Facebook Messenger
 */
social.post('/facebook/send', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = sendFacebookMessageSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const { page_id, recipient_psid, text, quick_replies } = validation.data;

    // Verify page belongs to tenant
    const { rows: pageRows } = await pool.query(
      `SELECT id FROM facebook_pages WHERE tenant_id = $1 AND id = $2`,
      [tenantId, page_id]
    );

    if (pageRows.length === 0) {
      return c.json({ error: 'Page not found or not authorized' }, 404);
    }

    const result = await traditionalSocial.sendFacebookMessage(
      page_id,
      recipient_psid,
      text,
      { quick_replies }
    );

    return c.json({
      success: true,
      message_id: result.message_id,
    });
  } catch (error) {
    console.error('Send Facebook message error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/facebook/pages
 * Get connected Facebook pages for tenant
 */
social.get('/facebook/pages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const pages = await traditionalSocial.listFacebookPages(tenantId);

    return c.json({
      success: true,
      pages,
      count: pages.length,
    });
  } catch (error) {
    console.error('Get Facebook pages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/facebook/conversations
 * Get Facebook Messenger conversations
 */
social.get('/facebook/conversations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const pageId = c.req.query('page_id');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT fc.*, fp.page_name
      FROM facebook_conversations fc
      JOIN facebook_pages fp ON fc.page_id = fp.id
      WHERE fp.tenant_id = $1
    `;
    const params = [tenantId];

    if (pageId) {
      query += ` AND fc.page_id = $2`;
      params.push(pageId);
    }

    query += ` ORDER BY fc.last_message_at DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      conversations: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get Facebook conversations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Twitter Messaging Routes
// =============================================================================

/**
 * POST /v1/social/traditional/twitter/send
 * Send a Twitter DM
 */
social.post('/twitter/send', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = sendTwitterDMSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const { account_id, recipient_id, text } = validation.data;

    // Verify account belongs to tenant
    const { rows: accountRows } = await pool.query(
      `SELECT id FROM twitter_accounts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, account_id]
    );

    if (accountRows.length === 0) {
      return c.json({ error: 'Account not found or not authorized' }, 404);
    }

    const result = await traditionalSocial.sendTwitterDM(
      account_id,
      recipient_id,
      text
    );

    return c.json({
      success: true,
      message_id: result.dm_id,
    });
  } catch (error) {
    console.error('Send Twitter DM error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/twitter/accounts
 * Get connected Twitter accounts for tenant
 */
social.get('/twitter/accounts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const accounts = await traditionalSocial.listTwitterAccounts(tenantId);

    return c.json({
      success: true,
      accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error('Get Twitter accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/twitter/conversations
 * Get Twitter DM conversations
 */
social.get('/twitter/conversations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const accountId = c.req.query('account_id');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT tc.*, ta.username
      FROM twitter_conversations tc
      JOIN twitter_accounts ta ON tc.account_id = ta.id
      WHERE ta.tenant_id = $1
    `;
    const params = [tenantId];

    if (accountId) {
      query += ` AND tc.account_id = $2`;
      params.push(accountId);
    }

    query += ` ORDER BY tc.last_message_at DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      conversations: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get Twitter conversations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Instagram Messaging Routes
// =============================================================================

/**
 * POST /v1/social/traditional/instagram/send
 * Send an Instagram DM
 */
social.post('/instagram/send', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = sendInstagramMessageSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const { account_id, recipient_igsid, text } = validation.data;

    // Verify account belongs to tenant
    const { rows: accountRows } = await pool.query(
      `SELECT id FROM instagram_accounts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, account_id]
    );

    if (accountRows.length === 0) {
      return c.json({ error: 'Account not found or not authorized' }, 404);
    }

    const result = await traditionalSocial.sendInstagramMessage(
      account_id,
      recipient_igsid,
      text
    );

    return c.json({
      success: true,
      message_id: result.message_id,
    });
  } catch (error) {
    console.error('Send Instagram message error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/instagram/accounts
 * Get connected Instagram accounts for tenant
 */
social.get('/instagram/accounts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const accounts = await traditionalSocial.listInstagramAccounts(tenantId);

    return c.json({
      success: true,
      accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error('Get Instagram accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/instagram/conversations
 * Get Instagram DM conversations
 */
social.get('/instagram/conversations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const accountId = c.req.query('account_id');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT ic.*, ia.username
      FROM instagram_conversations ic
      JOIN instagram_accounts ia ON ic.account_id = ia.id
      WHERE ia.tenant_id = $1
    `;
    const params = [tenantId];

    if (accountId) {
      query += ` AND ic.account_id = $2`;
      params.push(accountId);
    }

    query += ` ORDER BY ic.last_message_at DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      conversations: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get Instagram conversations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// LinkedIn Messaging Routes
// =============================================================================

/**
 * POST /v1/social/traditional/linkedin/send
 * Send a LinkedIn message
 */
social.post('/linkedin/send', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = sendLinkedInMessageSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const { page_id, recipient_urn, text } = validation.data;

    // Verify page belongs to tenant
    const { rows: pageRows } = await pool.query(
      `SELECT id FROM linkedin_pages WHERE tenant_id = $1 AND id = $2`,
      [tenantId, page_id]
    );

    if (pageRows.length === 0) {
      return c.json({ error: 'Page not found or not authorized' }, 404);
    }

    const result = await traditionalSocial.sendLinkedInMessage(
      page_id,
      recipient_urn,
      text
    );

    return c.json({
      success: true,
      message_id: result.message_id,
    });
  } catch (error) {
    console.error('Send LinkedIn message error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/linkedin/pages
 * Get connected LinkedIn pages for tenant
 */
social.get('/linkedin/pages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const pages = await traditionalSocial.listLinkedInPages(tenantId);

    return c.json({
      success: true,
      pages,
      count: pages.length,
    });
  } catch (error) {
    console.error('Get LinkedIn pages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Unified Social Stats
// =============================================================================

/**
 * GET /v1/social/traditional/stats
 * Get statistics for all traditional social accounts
 */
social.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const accounts = await traditionalSocial.getTenantSocialAccounts(tenantId);

    // Get message counts
    const messageStats = await pool.query(`
      SELECT
        'facebook' AS platform,
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h
      FROM social_messages sm
      JOIN facebook_pages fp ON sm.social_account_id::text = fp.page_id
      WHERE fp.tenant_id = $1 AND sm.platform = 'facebook'

      UNION ALL

      SELECT
        'twitter' AS platform,
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h
      FROM social_messages sm
      JOIN twitter_accounts ta ON sm.social_account_id::text = ta.user_id
      WHERE ta.tenant_id = $1 AND sm.platform = 'twitter'

      UNION ALL

      SELECT
        'instagram' AS platform,
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h
      FROM social_messages sm
      JOIN instagram_accounts ia ON sm.social_account_id::text = ia.ig_user_id
      WHERE ia.tenant_id = $1 AND sm.platform = 'instagram'

      UNION ALL

      SELECT
        'linkedin' AS platform,
        COUNT(*) AS total_messages,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) AS inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) AS outbound,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS last_24h
      FROM social_messages sm
      JOIN linkedin_pages lp ON sm.social_account_id::text = lp.organization_id
      WHERE lp.tenant_id = $1 AND sm.platform = 'linkedin'
    `, [tenantId]);

    return c.json({
      success: true,
      accounts,
      messages: messageStats.rows,
    });
  } catch (error) {
    console.error('Get social stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/traditional/messages
 * Get all messages across traditional social platforms
 */
social.get('/messages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const platform = c.req.query('platform');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = `
      SELECT sm.*
      FROM social_messages sm
      WHERE sm.tenant_id = $1
        AND sm.platform IN ('facebook', 'twitter', 'instagram', 'linkedin')
    `;
    const params = [tenantId];

    if (platform) {
      query += ` AND sm.platform = $2`;
      params.push(platform);
    }

    query += ` ORDER BY sm.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      messages: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default social;
