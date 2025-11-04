/**
 * Social Media Service
 * Unified service for Discord, Slack, Microsoft Teams, and Telegram
 * Week 17-18: Social Media Integration
 */

import pool from '../db/connection.js';
import fetch from 'node-fetch';
import * as conversationService from './conversation-service.js';

// =============================================================================
// Discord Integration
// =============================================================================

/**
 * Send Discord message
 */
export async function sendDiscordMessage(accountId, channelId, content, options = {}) {
  const account = await getSocialAccount(accountId);

  if (account.platform !== 'discord') {
    throw new Error('Account is not a Discord account');
  }

  const payload = {
    content: content,
  };

  // Add embeds if provided
  if (options.embeds) {
    payload.embeds = options.embeds;
  }

  // Add attachments/files
  if (options.files) {
    payload.files = options.files;
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${account.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Discord API error: ${error.message}`);
  }

  const message = await response.json();

  // Store in database
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'discord',
    platformMessageId: message.id,
    platformChannelId: channelId,
    messageType: 'text',
    textContent: content,
    platformData: message,
  });

  return message;
}

/**
 * Process Discord webhook event
 */
export async function processDiscordEvent(event) {
  const { t: type, d: data } = event;

  switch (type) {
    case 'MESSAGE_CREATE':
      return await processDiscordMessage(data);

    case 'MESSAGE_UPDATE':
      return await updateDiscordMessage(data);

    case 'MESSAGE_DELETE':
      return await deleteDiscordMessage(data);

    case 'GUILD_CREATE':
      return await syncDiscordGuild(data);

    default:
      console.log(`Unhandled Discord event: ${type}`);
      return null;
  }
}

async function processDiscordMessage(message) {
  // Ignore bot messages
  if (message.author.bot) return null;

  // Find account by guild ID
  const account = await getSocialAccountByPlatform('discord', message.guild_id);
  if (!account) return null;

  // Get or create user
  await pool.query(
    'SELECT get_or_create_social_user($1, $2, $3, $4, $5, $6, $7)',
    [
      account.tenant_id,
      'discord',
      message.author.id,
      message.author.username,
      message.author.global_name || message.author.username,
      message.author.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png` : null,
      false,
    ]
  );

  // Store message
  const messageId = await storeInboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'discord',
    platformMessageId: message.id,
    platformChannelId: message.channel_id,
    platformThreadId: message.thread_id,
    fromUserId: message.author.id,
    fromUsername: message.author.username,
    fromAvatarUrl: message.author.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png` : null,
    messageType: message.attachments?.length > 0 ? 'file' : 'text',
    textContent: message.content,
    attachments: message.attachments,
    embeds: message.embeds,
    mentions: message.mentions,
    replyToMessageId: message.referenced_message?.id,
    platformData: message,
  });

  // Auto-create or update conversation in Unified Inbox
  try {
    const customerIdentifier = `${message.author.username}@discord`;
    const customerName = message.author.global_name || message.author.username;
    const messagePreview = message.content || '[Discord message]';

    const conversationId = await conversationService.findOrCreateConversation({
      tenantId: account.tenant_id,
      channel: 'discord',
      customerIdentifier,
      customerName,
      subject: `Discord: #${message.channel_id}`,
      lastMessagePreview: messagePreview.substring(0, 255),
      lastMessageDirection: 'inbound',
      customerId: null,
      channelConversationId: message.channel_id
    });

    await conversationService.addMessageToConversation({
      conversationId,
      direction: 'inbound',
      senderType: 'customer',
      content: message.content || '',
      channelMessageId: messageId.toString(),
      status: 'sent'
    });

    console.log(`  📬 Conversation ${conversationId} updated for Discord message ${messageId}`);
  } catch (convError) {
    console.error('  ⚠️  Failed to create/update conversation:', convError.message);
  }

  return { success: true };
}

// =============================================================================
// Slack Integration
// =============================================================================

/**
 * Send Slack message
 */
export async function sendSlackMessage(accountId, channelId, text, options = {}) {
  const account = await getSocialAccount(accountId);

  if (account.platform !== 'slack') {
    throw new Error('Account is not a Slack account');
  }

  const payload = {
    channel: channelId,
    text: text,
  };

  // Add blocks for rich formatting
  if (options.blocks) {
    payload.blocks = options.blocks;
  }

  // Add thread_ts for threaded reply
  if (options.thread_ts) {
    payload.thread_ts = options.thread_ts;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  // Store in database
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'slack',
    platformMessageId: data.ts,
    platformChannelId: channelId,
    platformThreadId: options.thread_ts,
    messageType: 'text',
    textContent: text,
    platformData: data,
  });

  return data;
}

/**
 * Process Slack event
 */
export async function processSlackEvent(event, teamId) {
  const { type, user, text, ts, channel, thread_ts, files } = event;

  // Find account by team ID
  const account = await getSocialAccountByPlatform('slack', teamId);
  if (!account) {
    console.error(`Slack account not found for team: ${teamId}`);
    return null;
  }

  // Ignore bot messages
  if (event.bot_id || event.subtype === 'bot_message') {
    return null;
  }

  // Get user info
  const userInfo = await getSlackUserInfo(account.access_token, user);

  // Get or create user
  await pool.query(
    'SELECT get_or_create_social_user($1, $2, $3, $4, $5, $6, $7)',
    [
      account.tenant_id,
      'slack',
      user,
      userInfo.name,
      userInfo.real_name || userInfo.name,
      userInfo.profile?.image_72,
      false,
    ]
  );

  // Store message
  await storeInboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'slack',
    platformMessageId: ts,
    platformChannelId: channel,
    platformThreadId: thread_ts,
    fromUserId: user,
    fromUsername: userInfo.name,
    fromAvatarUrl: userInfo.profile?.image_72,
    messageType: files?.length > 0 ? 'file' : 'text',
    textContent: text,
    attachments: files,
    platformData: event,
  });

  return { success: true };
}

async function getSlackUserInfo(accessToken, userId) {
  const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  return data.ok ? data.user : { name: 'Unknown', real_name: 'Unknown' };
}

// =============================================================================
// Microsoft Teams Integration
// =============================================================================

/**
 * Send Teams message
 */
export async function sendTeamsMessage(accountId, conversationId, text, options = {}) {
  const account = await getSocialAccount(accountId);

  if (account.platform !== 'teams') {
    throw new Error('Account is not a Teams account');
  }

  // Get access token (may need refresh)
  const accessToken = await getTeamsAccessToken(account);

  const payload = {
    body: {
      content: text,
      contentType: 'text',
    },
  };

  // Add attachments
  if (options.attachments) {
    payload.attachments = options.attachments;
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${account.platform_team_id}/channels/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Teams API error: ${error.error?.message || response.statusText}`);
  }

  const message = await response.json();

  // Store in database
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'teams',
    platformMessageId: message.id,
    platformChannelId: conversationId,
    messageType: 'text',
    textContent: text,
    platformData: message,
  });

  return message;
}

/**
 * Process Teams activity
 */
export async function processTeamsActivity(activity, tenantId) {
  const { type, from, text, id, conversation, channelData } = activity;

  if (type !== 'message') {
    return null;
  }

  // Find account
  const account = await getSocialAccountByTenant(tenantId, 'teams');
  if (!account) return null;

  // Store message
  await storeInboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'teams',
    platformMessageId: id,
    platformChannelId: conversation?.id,
    fromUserId: from?.id,
    fromUsername: from?.name,
    messageType: 'text',
    textContent: text,
    platformData: activity,
  });

  return { success: true };
}

async function getTeamsAccessToken(account) {
  // TODO: Implement token refresh logic if needed
  return account.access_token;
}

// =============================================================================
// Telegram Integration
// =============================================================================

/**
 * Send Telegram message
 */
export async function sendTelegramMessage(accountId, chatId, text, options = {}) {
  const account = await getSocialAccount(accountId);

  if (account.platform !== 'telegram') {
    throw new Error('Account is not a Telegram account');
  }

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
  };

  // Add reply_to_message_id for replies
  if (options.reply_to_message_id) {
    payload.reply_to_message_id = options.reply_to_message_id;
  }

  // Add inline keyboard
  if (options.reply_markup) {
    payload.reply_markup = options.reply_markup;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${account.bot_token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  // Store in database
  await storeOutboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'telegram',
    platformMessageId: String(data.result.message_id),
    platformChannelId: String(chatId),
    messageType: 'text',
    textContent: text,
    platformData: data.result,
  });

  return data.result;
}

/**
 * Process Telegram update
 */
export async function processTelegramUpdate(update, botToken) {
  const { message, edited_message } = update;
  const msg = message || edited_message;

  if (!msg) return null;

  // Find account by bot token
  const account = await getSocialAccountByToken('telegram', botToken);
  if (!account) {
    console.error('Telegram account not found for bot token');
    return null;
  }

  // Ignore bot messages
  if (msg.from.is_bot) return null;

  // Get or create user
  await pool.query(
    'SELECT get_or_create_social_user($1, $2, $3, $4, $5, $6, $7)',
    [
      account.tenant_id,
      'telegram',
      String(msg.from.id),
      msg.from.username || msg.from.first_name,
      `${msg.from.first_name} ${msg.from.last_name || ''}`.trim(),
      null, // Telegram doesn't provide avatar URL in updates
      false,
    ]
  );

  // Determine message type
  let messageType = 'text';
  let attachments = null;

  if (msg.photo) {
    messageType = 'image';
    attachments = msg.photo;
  } else if (msg.document) {
    messageType = 'file';
    attachments = [msg.document];
  } else if (msg.video) {
    messageType = 'video';
    attachments = [msg.video];
  } else if (msg.audio || msg.voice) {
    messageType = 'audio';
    attachments = [msg.audio || msg.voice];
  } else if (msg.sticker) {
    messageType = 'sticker';
    attachments = [msg.sticker];
  }

  // Store message
  await storeInboundMessage({
    tenantId: account.tenant_id,
    accountId: account.id,
    platform: 'telegram',
    platformMessageId: String(msg.message_id),
    platformChannelId: String(msg.chat.id),
    fromUserId: String(msg.from.id),
    fromUsername: msg.from.username || msg.from.first_name,
    messageType,
    textContent: msg.text || msg.caption,
    attachments: attachments ? JSON.stringify(attachments) : null,
    replyToMessageId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : null,
    platformData: msg,
  });

  return { success: true };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get social account by ID
 */
export async function getSocialAccount(accountId) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE id = $1 AND status = $2',
    [accountId, 'active']
  );

  if (rows.length === 0) {
    throw new Error('Social account not found');
  }

  return rows[0];
}

/**
 * Get social account by platform and team ID
 */
export async function getSocialAccountByPlatform(platform, teamId) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE platform = $1 AND platform_team_id = $2 AND status = $3',
    [platform, teamId, 'active']
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get social account by platform and tenant
 */
export async function getSocialAccountByTenant(tenantId, platform) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE tenant_id = $1 AND platform = $2 AND status = $3 LIMIT 1',
    [tenantId, platform, 'active']
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get social account by bot token
 */
export async function getSocialAccountByToken(platform, token) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE platform = $1 AND bot_token = $2 AND status = $3',
    [platform, token, 'active']
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Store outbound message
 */
async function storeOutboundMessage(data) {
  const {
    tenantId,
    accountId,
    platform,
    platformMessageId,
    platformChannelId,
    platformThreadId = null,
    messageType,
    textContent,
    attachments = null,
    embeds = null,
    platformData,
  } = data;

  await pool.query(
    `INSERT INTO social_messages (
      tenant_id, social_account_id, platform, platform_message_id, platform_channel_id, platform_thread_id,
      direction, status, message_type, text_content, attachments, embeds, platform_data, sent_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'outbound', 'sent', $7, $8, $9, $10, $11, NOW(), NOW())`,
    [
      tenantId,
      accountId,
      platform,
      platformMessageId,
      platformChannelId,
      platformThreadId,
      messageType,
      textContent,
      attachments ? JSON.stringify(attachments) : null,
      embeds ? JSON.stringify(embeds) : null,
      JSON.stringify(platformData),
    ]
  );
}

/**
 * Store inbound message
 */
async function storeInboundMessage(data) {
  const {
    tenantId,
    accountId,
    platform,
    platformMessageId,
    platformChannelId,
    platformThreadId = null,
    fromUserId,
    fromUsername,
    fromAvatarUrl = null,
    messageType,
    textContent,
    attachments = null,
    embeds = null,
    mentions = null,
    replyToMessageId = null,
    platformData,
  } = data;

  const result = await pool.query(
    `INSERT INTO social_messages (
      tenant_id, social_account_id, platform, platform_message_id, platform_channel_id, platform_thread_id,
      direction, status, from_user_id, from_username, from_avatar_url,
      message_type, text_content, attachments, embeds, mentions, reply_to_message_id,
      platform_data, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'inbound', 'sent', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    RETURNING id`,
    [
      tenantId,
      accountId,
      platform,
      platformMessageId,
      platformChannelId,
      platformThreadId,
      fromUserId,
      fromUsername,
      fromAvatarUrl,
      messageType,
      textContent,
      attachments ? JSON.stringify(attachments) : null,
      embeds ? JSON.stringify(embeds) : null,
      mentions ? JSON.stringify(mentions) : null,
      replyToMessageId,
      JSON.stringify(platformData),
    ]
  );

  return result.rows[0].id;
}

/**
 * Get messages for a channel
 */
export async function getChannelMessages(tenantId, platform, channelId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT sm.*, su.display_name, su.avatar_url
     FROM social_messages sm
     LEFT JOIN social_users su ON (sm.from_user_id = su.platform_user_id AND su.platform = sm.platform)
     WHERE sm.tenant_id = $1
       AND sm.platform = $2
       AND sm.platform_channel_id = $3
     ORDER BY sm.created_at DESC
     LIMIT $4`,
    [tenantId, platform, channelId, limit]
  );

  return rows.reverse(); // Return in chronological order
}

/**
 * Get social accounts for tenant
 */
export async function getSocialAccounts(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM social_accounts WHERE tenant_id = $1 ORDER BY platform, created_at',
    [tenantId]
  );

  return rows;
}

/**
 * Get social channels for account
 */
export async function getSocialChannels(accountId) {
  const { rows } = await pool.query(
    'SELECT * FROM social_channels WHERE social_account_id = $1 AND is_enabled = true ORDER BY channel_name',
    [accountId]
  );

  return rows;
}
