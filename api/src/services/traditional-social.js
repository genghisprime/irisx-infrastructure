/**
 * ============================================================================
 * TRADITIONAL SOCIAL MEDIA SERVICE
 * ============================================================================
 *
 * Unified service for Facebook, Twitter/X, Instagram, and LinkedIn
 *
 * ARCHITECTURE:
 * - IRISX Admin configures OAuth app credentials per platform
 * - Customers connect their own accounts via OAuth in Customer Portal
 * - Customer access tokens stored encrypted per-tenant
 * - All messages route through customer's connected accounts
 *
 * SUPPORTED PLATFORMS:
 * - Facebook Messenger (via Graph API)
 * - Twitter/X DMs (via API v2)
 * - Instagram DMs (via Graph API)
 * - LinkedIn Messages (via API v2)
 */

import pool from '../db/connection.js';
import crypto from 'crypto';
import * as conversationService from './conversation-service.js';

// =============================================================================
// ENCRYPTION HELPERS
// =============================================================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'change-this-key-in-production';

function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

function decrypt(encrypted, iv) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[Social] Decryption failed:', error);
    throw new Error('Failed to decrypt credentials');
  }
}

// =============================================================================
// PLATFORM APP CONFIGURATION (Admin)
// =============================================================================

/**
 * Get platform OAuth app configuration
 */
export async function getPlatformApp(platform) {
  const { rows } = await pool.query(
    `SELECT * FROM social_platform_apps WHERE platform = $1 AND is_enabled = true`,
    [platform]
  );

  if (rows.length === 0) {
    throw new Error(`Platform ${platform} is not enabled`);
  }

  const app = rows[0];

  // Decrypt app secret if present
  if (app.app_secret_encrypted && app.app_secret_iv) {
    app.app_secret = decrypt(app.app_secret_encrypted, app.app_secret_iv);
  }

  return app;
}

/**
 * Update platform OAuth app configuration (Admin only)
 */
export async function updatePlatformApp(platform, config) {
  const { app_id, app_secret, webhook_verify_token, webhook_secret, is_enabled } = config;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (app_id !== undefined) {
    updates.push(`app_id = $${paramIndex++}`);
    values.push(app_id);
  }

  if (app_secret !== undefined) {
    const { encrypted, iv } = encrypt(app_secret);
    updates.push(`app_secret_encrypted = $${paramIndex++}`);
    values.push(encrypted);
    updates.push(`app_secret_iv = $${paramIndex++}`);
    values.push(iv);
  }

  if (webhook_verify_token !== undefined) {
    updates.push(`webhook_verify_token = $${paramIndex++}`);
    values.push(webhook_verify_token);
  }

  if (webhook_secret !== undefined) {
    const { encrypted, iv } = encrypt(webhook_secret);
    updates.push(`webhook_secret_encrypted = $${paramIndex++}`);
    values.push(encrypted);
    updates.push(`webhook_secret_iv = $${paramIndex++}`);
    values.push(iv);
  }

  if (is_enabled !== undefined) {
    updates.push(`is_enabled = $${paramIndex++}`);
    values.push(is_enabled);
  }

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  updates.push(`updated_at = NOW()`);
  values.push(platform);

  await pool.query(
    `UPDATE social_platform_apps SET ${updates.join(', ')} WHERE platform = $${paramIndex}`,
    values
  );

  return { success: true };
}

// =============================================================================
// FACEBOOK MESSENGER
// =============================================================================

/**
 * Send Facebook Messenger message
 */
export async function sendFacebookMessage(pageId, recipientPsid, message, options = {}) {
  const page = await getFacebookPage(pageId);

  const accessToken = decrypt(page.page_access_token_encrypted, page.page_access_token_iv);

  const payload = {
    recipient: { id: recipientPsid },
    message: {},
    messaging_type: options.messaging_type || 'RESPONSE'
  };

  // Text message
  if (typeof message === 'string') {
    payload.message.text = message;
  } else if (message.text) {
    payload.message.text = message.text;
  }

  // Quick replies
  if (options.quick_replies) {
    payload.message.quick_replies = options.quick_replies;
  }

  // Buttons / Templates
  if (message.attachment) {
    payload.message.attachment = message.attachment;
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error('[Facebook] Send message failed:', error);
    throw new Error(error.error?.message || 'Failed to send Facebook message');
  }

  const result = await response.json();

  // Store outbound message
  await storeOutboundMessage({
    tenantId: page.tenant_id,
    platform: 'facebook',
    platformMessageId: result.message_id,
    platformChannelId: recipientPsid,
    textContent: typeof message === 'string' ? message : message.text,
    platformData: result
  });

  return result;
}

/**
 * Process Facebook webhook event
 */
export async function processFacebookWebhook(body) {
  const { object, entry } = body;

  if (object !== 'page') {
    return { success: false, reason: 'Not a page event' };
  }

  for (const pageEntry of entry) {
    const pageId = pageEntry.id;

    // Find page in database
    const page = await getFacebookPageByPlatformId(pageId);
    if (!page) {
      console.warn(`[Facebook] Unknown page: ${pageId}`);
      continue;
    }

    // Process messaging events
    if (pageEntry.messaging) {
      for (const event of pageEntry.messaging) {
        await processFacebookMessagingEvent(page, event);
      }
    }
  }

  return { success: true };
}

async function processFacebookMessagingEvent(page, event) {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;
  const timestamp = event.timestamp;

  // Skip if sender is the page itself (outbound message)
  if (senderId === page.page_id) {
    return;
  }

  // Get or create conversation
  let conversation = await getOrCreateFacebookConversation(page, senderId);

  // Handle message
  if (event.message) {
    const msg = event.message;

    // Determine message type
    let messageType = 'text';
    let attachments = null;

    if (msg.attachments) {
      messageType = msg.attachments[0]?.type || 'attachment';
      attachments = msg.attachments;
    }

    // Store inbound message
    const messageId = await storeInboundMessage({
      tenantId: page.tenant_id,
      platform: 'facebook',
      platformMessageId: msg.mid,
      platformChannelId: senderId,
      fromUserId: senderId,
      messageType,
      textContent: msg.text,
      attachments: attachments ? JSON.stringify(attachments) : null,
      platformData: event
    });

    // Update conversation
    await pool.query(
      `UPDATE facebook_conversations SET
        last_message_at = NOW(),
        last_message_preview = $1,
        last_message_direction = 'inbound',
        unread_count = unread_count + 1,
        updated_at = NOW()
       WHERE id = $2`,
      [msg.text?.substring(0, 255) || '[Attachment]', conversation.id]
    );

    // Create/update unified conversation
    try {
      const conversationId = await conversationService.findOrCreateConversation({
        tenantId: page.tenant_id,
        channel: 'facebook',
        customerIdentifier: senderId,
        customerName: conversation.user_first_name || 'Facebook User',
        subject: `Facebook: ${page.page_name}`,
        lastMessagePreview: msg.text?.substring(0, 255) || '[Attachment]',
        lastMessageDirection: 'inbound',
        channelConversationId: senderId
      });

      await conversationService.addMessageToConversation({
        conversationId,
        direction: 'inbound',
        senderType: 'customer',
        content: msg.text || '',
        channelMessageId: msg.mid,
        status: 'sent'
      });
    } catch (err) {
      console.error('[Facebook] Failed to create unified conversation:', err);
    }
  }

  // Handle postback (button click)
  if (event.postback) {
    console.log(`[Facebook] Postback: ${event.postback.payload}`);
    // Handle button click logic here
  }
}

async function getOrCreateFacebookConversation(page, psid) {
  // Check existing
  const { rows } = await pool.query(
    `SELECT * FROM facebook_conversations WHERE facebook_page_id = $1 AND psid = $2`,
    [page.id, psid]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  // Get user profile from Facebook
  let userProfile = { first_name: 'Facebook', last_name: 'User' };
  try {
    const accessToken = decrypt(page.page_access_token_encrypted, page.page_access_token_iv);
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${accessToken}`
    );
    if (response.ok) {
      userProfile = await response.json();
    }
  } catch (err) {
    console.warn('[Facebook] Could not fetch user profile:', err);
  }

  // Create conversation
  const result = await pool.query(
    `INSERT INTO facebook_conversations (
      tenant_id, facebook_page_id, psid, user_first_name, user_last_name, user_profile_pic
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [page.tenant_id, page.id, psid, userProfile.first_name, userProfile.last_name, userProfile.profile_pic]
  );

  return result.rows[0];
}

// =============================================================================
// TWITTER / X
// =============================================================================

/**
 * Send Twitter DM
 */
export async function sendTwitterDM(accountId, recipientId, text, options = {}) {
  const account = await getTwitterAccount(accountId);

  const accessToken = decrypt(account.access_token_encrypted, account.access_token_iv);

  const payload = {
    dm_conversation_id: options.conversation_id,
    message: { text }
  };

  // If no conversation exists, create a new one
  if (!options.conversation_id) {
    payload.participant_ids = [recipientId];
    delete payload.dm_conversation_id;
  }

  const response = await fetch('https://api.twitter.com/2/dm_conversations/with/:participant_id/messages'.replace(':participant_id', recipientId), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[Twitter] Send DM failed:', error);
    throw new Error(error.detail || 'Failed to send Twitter DM');
  }

  const result = await response.json();

  // Store outbound message
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    platform: 'twitter',
    platformMessageId: result.data?.dm_event_id,
    platformChannelId: recipientId,
    textContent: text,
    platformData: result
  });

  return result;
}

/**
 * Process Twitter webhook (Account Activity API)
 */
export async function processTwitterWebhook(userId, events) {
  const account = await getTwitterAccountByPlatformId(userId);
  if (!account) {
    console.warn(`[Twitter] Unknown account: ${userId}`);
    return { success: false };
  }

  // Process DM events
  if (events.direct_message_events) {
    for (const event of events.direct_message_events) {
      if (event.type !== 'message_create') continue;

      const senderId = event.message_create.sender_id;

      // Skip outbound messages (from our account)
      if (senderId === userId) continue;

      const msg = event.message_create.message_data;

      // Store inbound message
      await storeInboundMessage({
        tenantId: account.tenant_id,
        platform: 'twitter',
        platformMessageId: event.id,
        platformChannelId: senderId,
        fromUserId: senderId,
        messageType: msg.attachment ? 'attachment' : 'text',
        textContent: msg.text,
        attachments: msg.attachment ? JSON.stringify([msg.attachment]) : null,
        platformData: event
      });

      // Update/create conversation
      await getOrCreateTwitterConversation(account, senderId, msg.text);
    }
  }

  return { success: true };
}

async function getOrCreateTwitterConversation(account, participantId, lastMessage) {
  const { rows } = await pool.query(
    `SELECT * FROM twitter_conversations WHERE twitter_account_id = $1 AND participant_id = $2`,
    [account.id, participantId]
  );

  if (rows.length > 0) {
    await pool.query(
      `UPDATE twitter_conversations SET
        last_message_at = NOW(),
        last_message_preview = $1,
        last_message_direction = 'inbound',
        unread_count = unread_count + 1,
        updated_at = NOW()
       WHERE id = $2`,
      [lastMessage?.substring(0, 255), rows[0].id]
    );
    return rows[0];
  }

  const result = await pool.query(
    `INSERT INTO twitter_conversations (
      tenant_id, twitter_account_id, conversation_id, participant_id,
      last_message_at, last_message_preview, last_message_direction
    ) VALUES ($1, $2, $3, $4, NOW(), $5, 'inbound')
    RETURNING *`,
    [account.tenant_id, account.id, `${account.twitter_user_id}-${participantId}`, participantId, lastMessage?.substring(0, 255)]
  );

  return result.rows[0];
}

// =============================================================================
// INSTAGRAM
// =============================================================================

/**
 * Send Instagram DM
 */
export async function sendInstagramMessage(accountId, recipientIgsid, message, options = {}) {
  const account = await getInstagramAccount(accountId);

  // Instagram uses the linked Facebook Page token
  const page = await getFacebookPage(account.facebook_page_id);
  const accessToken = decrypt(page.page_access_token_encrypted, page.page_access_token_iv);

  const payload = {
    recipient: { id: recipientIgsid },
    message: {}
  };

  if (typeof message === 'string') {
    payload.message.text = message;
  } else {
    payload.message = message;
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${account.instagram_user_id}/messages?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error('[Instagram] Send message failed:', error);
    throw new Error(error.error?.message || 'Failed to send Instagram message');
  }

  const result = await response.json();

  // Store outbound message
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    platform: 'instagram',
    platformMessageId: result.message_id,
    platformChannelId: recipientIgsid,
    textContent: typeof message === 'string' ? message : message.text,
    platformData: result
  });

  return result;
}

/**
 * Process Instagram webhook (via Facebook webhook)
 */
export async function processInstagramWebhook(body) {
  const { object, entry } = body;

  if (object !== 'instagram') {
    return { success: false, reason: 'Not an Instagram event' };
  }

  for (const igEntry of entry) {
    const igUserId = igEntry.id;

    const account = await getInstagramAccountByPlatformId(igUserId);
    if (!account) {
      console.warn(`[Instagram] Unknown account: ${igUserId}`);
      continue;
    }

    // Process messaging events
    if (igEntry.messaging) {
      for (const event of igEntry.messaging) {
        await processInstagramMessagingEvent(account, event);
      }
    }
  }

  return { success: true };
}

async function processInstagramMessagingEvent(account, event) {
  const senderId = event.sender.id;

  // Skip outbound
  if (senderId === account.instagram_user_id) return;

  if (event.message) {
    const msg = event.message;

    await storeInboundMessage({
      tenantId: account.tenant_id,
      platform: 'instagram',
      platformMessageId: msg.mid,
      platformChannelId: senderId,
      fromUserId: senderId,
      messageType: msg.attachments ? 'attachment' : 'text',
      textContent: msg.text,
      attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
      platformData: event
    });

    // Update conversation
    await getOrCreateInstagramConversation(account, senderId, msg.text);
  }
}

async function getOrCreateInstagramConversation(account, igsid, lastMessage) {
  const { rows } = await pool.query(
    `SELECT * FROM instagram_conversations WHERE instagram_account_id = $1 AND igsid = $2`,
    [account.id, igsid]
  );

  if (rows.length > 0) {
    await pool.query(
      `UPDATE instagram_conversations SET
        last_message_at = NOW(),
        last_message_preview = $1,
        last_message_direction = 'inbound',
        unread_count = unread_count + 1,
        updated_at = NOW()
       WHERE id = $2`,
      [lastMessage?.substring(0, 255), rows[0].id]
    );
    return rows[0];
  }

  const result = await pool.query(
    `INSERT INTO instagram_conversations (
      tenant_id, instagram_account_id, igsid, last_message_at, last_message_preview, last_message_direction
    ) VALUES ($1, $2, $3, NOW(), $4, 'inbound')
    RETURNING *`,
    [account.tenant_id, account.id, igsid, lastMessage?.substring(0, 255)]
  );

  return result.rows[0];
}

// =============================================================================
// LINKEDIN
// =============================================================================

/**
 * Send LinkedIn message (Organization messaging)
 */
export async function sendLinkedInMessage(pageId, recipientUrn, message) {
  const page = await getLinkedInPage(pageId);

  const accessToken = decrypt(page.access_token_encrypted, page.access_token_iv);

  // LinkedIn messaging API
  const payload = {
    recipients: [recipientUrn],
    message: {
      subject: message.subject || '',
      body: message.body || message
    }
  };

  const response = await fetch('https://api.linkedin.com/v2/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[LinkedIn] Send message failed:', error);
    throw new Error(error.message || 'Failed to send LinkedIn message');
  }

  const result = await response.json();

  await storeOutboundMessage({
    tenantId: page.tenant_id,
    platform: 'linkedin',
    platformMessageId: result.id,
    platformChannelId: recipientUrn,
    textContent: typeof message === 'string' ? message : message.body,
    platformData: result
  });

  return result;
}

// =============================================================================
// DATABASE HELPERS
// =============================================================================

async function getFacebookPage(id) {
  const { rows } = await pool.query(
    'SELECT * FROM facebook_pages WHERE id = $1 AND is_active = true',
    [id]
  );
  if (rows.length === 0) throw new Error('Facebook page not found');
  return rows[0];
}

async function getFacebookPageByPlatformId(pageId) {
  const { rows } = await pool.query(
    'SELECT * FROM facebook_pages WHERE page_id = $1 AND is_active = true',
    [pageId]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getTwitterAccount(id) {
  const { rows } = await pool.query(
    'SELECT * FROM twitter_accounts WHERE id = $1 AND is_active = true',
    [id]
  );
  if (rows.length === 0) throw new Error('Twitter account not found');
  return rows[0];
}

async function getTwitterAccountByPlatformId(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM twitter_accounts WHERE twitter_user_id = $1 AND is_active = true',
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getInstagramAccount(id) {
  const { rows } = await pool.query(
    'SELECT * FROM instagram_accounts WHERE id = $1 AND is_active = true',
    [id]
  );
  if (rows.length === 0) throw new Error('Instagram account not found');
  return rows[0];
}

async function getInstagramAccountByPlatformId(igUserId) {
  const { rows } = await pool.query(
    'SELECT * FROM instagram_accounts WHERE instagram_user_id = $1 AND is_active = true',
    [igUserId]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getLinkedInPage(id) {
  const { rows } = await pool.query(
    'SELECT * FROM linkedin_pages WHERE id = $1 AND is_active = true',
    [id]
  );
  if (rows.length === 0) throw new Error('LinkedIn page not found');
  return rows[0];
}

// =============================================================================
// MESSAGE STORAGE
// =============================================================================

async function storeOutboundMessage(data) {
  const {
    tenantId, platform, platformMessageId, platformChannelId,
    textContent, attachments, platformData
  } = data;

  await pool.query(
    `INSERT INTO social_messages (
      tenant_id, platform, platform_message_id, platform_channel_id,
      direction, status, message_type, text_content, attachments, platform_data, sent_at, created_at
    ) VALUES ($1, $2, $3, $4, 'outbound', 'sent', 'text', $5, $6, $7, NOW(), NOW())`,
    [tenantId, platform, platformMessageId, platformChannelId, textContent, attachments, JSON.stringify(platformData)]
  );
}

async function storeInboundMessage(data) {
  const {
    tenantId, platform, platformMessageId, platformChannelId,
    fromUserId, messageType, textContent, attachments, platformData
  } = data;

  const result = await pool.query(
    `INSERT INTO social_messages (
      tenant_id, platform, platform_message_id, platform_channel_id,
      direction, status, from_user_id, message_type, text_content, attachments, platform_data, created_at
    ) VALUES ($1, $2, $3, $4, 'inbound', 'sent', $5, $6, $7, $8, $9, NOW())
    RETURNING id`,
    [tenantId, platform, platformMessageId, platformChannelId, fromUserId, messageType, textContent, attachments, JSON.stringify(platformData)]
  );

  return result.rows[0].id;
}

// =============================================================================
// TENANT ACCOUNT MANAGEMENT
// =============================================================================

/**
 * Get all connected social accounts for a tenant
 */
export async function getTenantSocialAccounts(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM get_tenant_social_accounts($1)',
    [tenantId]
  );
  return rows;
}

/**
 * List tenant's Facebook pages
 */
export async function listFacebookPages(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, page_id, page_name, page_username, page_category, page_picture_url,
            messaging_enabled, is_active, follower_count, message_count, last_synced_at
     FROM facebook_pages WHERE tenant_id = $1 ORDER BY page_name`,
    [tenantId]
  );
  return rows;
}

/**
 * List tenant's Twitter accounts
 */
export async function listTwitterAccounts(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, twitter_user_id, username, display_name, profile_image_url, verified,
            dm_enabled, posting_enabled, is_active, follower_count, last_synced_at
     FROM twitter_accounts WHERE tenant_id = $1 ORDER BY username`,
    [tenantId]
  );
  return rows;
}

/**
 * List tenant's Instagram accounts
 */
export async function listInstagramAccounts(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, instagram_user_id, username, display_name, profile_picture_url, account_type,
            messaging_enabled, is_active, follower_count, last_synced_at
     FROM instagram_accounts WHERE tenant_id = $1 ORDER BY username`,
    [tenantId]
  );
  return rows;
}

/**
 * List tenant's LinkedIn pages
 */
export async function listLinkedInPages(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, organization_id, organization_name, vanity_name, logo_url,
            messaging_enabled, posting_enabled, is_active, follower_count, last_synced_at
     FROM linkedin_pages WHERE tenant_id = $1 ORDER BY organization_name`,
    [tenantId]
  );
  return rows;
}

export default {
  // Platform Config
  getPlatformApp,
  updatePlatformApp,

  // Facebook
  sendFacebookMessage,
  processFacebookWebhook,
  listFacebookPages,

  // Twitter
  sendTwitterDM,
  processTwitterWebhook,
  listTwitterAccounts,

  // Instagram
  sendInstagramMessage,
  processInstagramWebhook,
  listInstagramAccounts,

  // LinkedIn
  sendLinkedInMessage,
  listLinkedInPages,

  // Tenant
  getTenantSocialAccounts
};
