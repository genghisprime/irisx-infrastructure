/**
 * WhatsApp API Routes
 * Handles webhook events, message sending, and template management
 * Week 15-16 Phase 3: WhatsApp Integration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as whatsappService from '../services/whatsapp.js';
import pool from '../config/database.js';

const whatsapp = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const sendTextSchema = z.object({
  to: z.string().min(10),
  text: z.string().min(1).max(4096),
  context_message_id: z.string().optional(),
});

const sendTemplateSchema = z.object({
  to: z.string().min(10),
  template_name: z.string().min(1),
  language: z.string().default('en_US'),
  components: z.array(z.any()).optional().default([]),
});

const sendMediaSchema = z.object({
  to: z.string().min(10),
  media_url: z.string().url(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  context_message_id: z.string().optional(),
});

const sendButtonSchema = z.object({
  to: z.string().min(10),
  body: z.string().min(1).max(1024),
  buttons: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(1).max(20),
  })).min(1).max(3),
  header: z.string().max(60).optional(),
  footer: z.string().max(60).optional(),
});

const markReadSchema = z.object({
  message_id: z.string().min(1),
});

// =============================================================================
// Middleware: Extract tenant and WhatsApp account
// =============================================================================

whatsapp.use('*', async (c, next) => {
  // Skip middleware for webhook verification (GET request)
  if (c.req.method === 'GET' && c.req.path.endsWith('/webhook')) {
    return await next();
  }

  // Skip middleware for webhook POST (no auth)
  if (c.req.method === 'POST' && c.req.path.endsWith('/webhook')) {
    return await next();
  }

  // Extract tenant_id from JWT token
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized: Missing tenant information' }, 401);
  }

  c.set('tenant_id', tenantId);
  await next();
});

// =============================================================================
// Webhook Routes
// =============================================================================

/**
 * GET /v1/whatsapp/webhook
 * Webhook verification endpoint (Meta requires this)
 */
whatsapp.get('/webhook', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  // Verify the webhook
  if (mode === 'subscribe' && token) {
    // Get verify token from first WhatsApp account (for simplicity)
    // In production, you might want to validate against all accounts
    const { rows } = await pool.query(
      'SELECT webhook_verify_token FROM whatsapp_accounts LIMIT 1'
    );

    if (rows.length > 0 && token === rows[0].webhook_verify_token) {
      console.log('Webhook verified successfully');
      return c.text(challenge);
    } else {
      console.error('Webhook verification failed: Invalid token');
      return c.json({ error: 'Verification failed' }, 403);
    }
  }

  return c.json({ error: 'Bad request' }, 400);
});

/**
 * POST /v1/whatsapp/webhook
 * Receive webhook events from Meta
 */
whatsapp.post('/webhook', async (c) => {
  try {
    const body = await c.req.json();

    // Log webhook for debugging
    console.log('WhatsApp webhook received:', JSON.stringify(body, null, 2));

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'messages') {
          await processMessagesWebhook(change.value);
        }
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    // Always return 200 to Meta, even if processing fails
    return c.json({ success: false, error: error.message });
  }
});

/**
 * Process messages webhook
 */
async function processMessagesWebhook(value) {
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId) {
    console.error('No phone number ID in webhook');
    return;
  }

  // Get WhatsApp account
  let account;
  try {
    account = await whatsappService.getWhatsAppAccount(phoneNumberId);
  } catch (error) {
    console.error('WhatsApp account not found:', phoneNumberId);
    return;
  }

  // Log webhook
  await pool.query(
    `INSERT INTO whatsapp_webhooks_log (tenant_id, whatsapp_account_id, event_type, phone_number_id, payload, received_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [account.tenant_id, account.id, 'messages', phoneNumberId, JSON.stringify(value)]
  );

  // Process inbound messages
  if (value.messages && value.messages.length > 0) {
    for (const message of value.messages) {
      try {
        const messageId = await whatsappService.storeInboundMessage(
          value,
          account.tenant_id,
          account.id
        );

        console.log(`Stored inbound WhatsApp message: ${messageId}`);

        // Download media if present
        if (message.type in ['image', 'video', 'audio', 'document'] && message[message.type]?.id) {
          await downloadAndStoreMedia(
            message[message.type].id,
            account.access_token,
            account.tenant_id,
            account.id,
            messageId
          );
        }

        // Auto-mark as read (optional - can be disabled)
        // await whatsappService.markMessageAsRead(phoneNumberId, message.id);
      } catch (error) {
        console.error('Error processing inbound message:', error);
      }
    }
  }

  // Process message status updates
  if (value.statuses && value.statuses.length > 0) {
    for (const status of value.statuses) {
      try {
        await whatsappService.updateMessageStatus(status);
        console.log(`Updated message status: ${status.id} -> ${status.status}`);
      } catch (error) {
        console.error('Error updating message status:', error);
      }
    }
  }
}

/**
 * Download and store media
 */
async function downloadAndStoreMedia(mediaId, accessToken, tenantId, whatsappAccountId, messageId) {
  try {
    // Download from WhatsApp
    const media = await whatsappService.downloadMedia(mediaId, accessToken);

    // Save to S3
    const filename = `${mediaId}.${getExtensionFromMimeType(media.mimeType)}`;
    const s3Result = await whatsappService.saveMediaToS3(
      media.buffer,
      tenantId,
      filename,
      media.mimeType
    );

    // Update message with S3 location
    await pool.query(
      `UPDATE whatsapp_messages
       SET media_s3_key = $1, media_url = $2
       WHERE id = $3`,
      [s3Result.s3_key, s3Result.s3_url, messageId]
    );

    // Store media record
    await pool.query(
      `INSERT INTO whatsapp_media
       (tenant_id, whatsapp_account_id, media_id, message_id, media_type, mime_type, filename, size_bytes, sha256, s3_key, s3_url, download_status, downloaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', NOW())`,
      [
        tenantId,
        whatsappAccountId,
        mediaId,
        messageId,
        getMediaTypeFromMimeType(media.mimeType),
        media.mimeType,
        filename,
        media.fileSize,
        media.sha256,
        s3Result.s3_key,
        s3Result.s3_url,
      ]
    );

    console.log(`Media downloaded and stored: ${mediaId}`);
  } catch (error) {
    console.error('Error downloading media:', error);
  }
}

// =============================================================================
// Message Sending Routes
// =============================================================================

/**
 * POST /v1/whatsapp/send/text
 * Send a text message
 */
whatsapp.post('/send/text', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendTextSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Send message
    const result = await whatsappService.sendTextMessage(
      account.phone_number_id,
      validation.data.to,
      validation.data.text,
      {
        context_message_id: validation.data.context_message_id,
      }
    );

    return c.json({
      success: true,
      message_id: result.id,
      whatsapp_message_id: result.whatsapp_message_id,
    });
  } catch (error) {
    console.error('Error sending text message:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/whatsapp/send/template
 * Send a template message
 */
whatsapp.post('/send/template', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendTemplateSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Send template message
    const result = await whatsappService.sendTemplateMessage(
      account.phone_number_id,
      validation.data.to,
      validation.data.template_name,
      validation.data.language,
      validation.data.components
    );

    return c.json({
      success: true,
      message_id: result.id,
      whatsapp_message_id: result.whatsapp_message_id,
    });
  } catch (error) {
    console.error('Error sending template message:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/whatsapp/send/image
 * Send an image message
 */
whatsapp.post('/send/image', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendMediaSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Send image
    const result = await whatsappService.sendImageMessage(
      account.phone_number_id,
      validation.data.to,
      validation.data.media_url,
      validation.data.caption,
      {
        context_message_id: validation.data.context_message_id,
      }
    );

    return c.json({
      success: true,
      message_id: result.id,
      whatsapp_message_id: result.whatsapp_message_id,
    });
  } catch (error) {
    console.error('Error sending image message:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/whatsapp/send/document
 * Send a document message
 */
whatsapp.post('/send/document', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendMediaSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    if (!validation.data.filename) {
      return c.json({ error: 'filename is required for documents' }, 400);
    }

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Send document
    const result = await whatsappService.sendDocumentMessage(
      account.phone_number_id,
      validation.data.to,
      validation.data.media_url,
      validation.data.filename,
      validation.data.caption,
      {
        context_message_id: validation.data.context_message_id,
      }
    );

    return c.json({
      success: true,
      message_id: result.id,
      whatsapp_message_id: result.whatsapp_message_id,
    });
  } catch (error) {
    console.error('Error sending document message:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/whatsapp/send/buttons
 * Send an interactive button message
 */
whatsapp.post('/send/buttons', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    // Validate
    const validation = sendButtonSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        { error: 'Validation failed', details: validation.error.errors },
        400
      );
    }

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Send button message
    const result = await whatsappService.sendButtonMessage(
      account.phone_number_id,
      validation.data.to,
      validation.data.body,
      validation.data.buttons,
      {
        header: validation.data.header,
        footer: validation.data.footer,
      }
    );

    return c.json({
      success: true,
      message_id: result.id,
      whatsapp_message_id: result.whatsapp_message_id,
    });
  } catch (error) {
    console.error('Error sending button message:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/whatsapp/messages/:id/read
 * Mark message as read
 */
whatsapp.post('/messages/:id/read', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const messageId = c.req.param('id');

    // Get WhatsApp account
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Mark as read
    await whatsappService.markMessageAsRead(account.phone_number_id, messageId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Message Retrieval Routes
// =============================================================================

/**
 * GET /v1/whatsapp/messages
 * Get all WhatsApp messages for tenant
 */
whatsapp.get('/messages', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const phoneNumber = c.req.query('phone_number');

    let query = `
      SELECT wm.*, wc.whatsapp_name, wc.profile_pic_url
      FROM whatsapp_messages wm
      LEFT JOIN whatsapp_contacts wc ON (
        (wm.from_number = wc.phone_number OR wm.to_number = wc.phone_number)
        AND wc.tenant_id = wm.tenant_id
      )
      WHERE wm.tenant_id = $1
    `;
    const params = [tenantId];

    if (phoneNumber) {
      query += ` AND (wm.from_number = $${params.length + 1} OR wm.to_number = $${params.length + 1})`;
      params.push(phoneNumber);
    }

    query += ` ORDER BY wm.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    return c.json({
      success: true,
      messages: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/whatsapp/conversations/:phone_number
 * Get conversation with specific phone number
 */
whatsapp.get('/conversations/:phone_number', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const phoneNumber = c.req.param('phone_number');
    const limit = parseInt(c.req.query('limit') || '100');

    const messages = await whatsappService.getConversationMessages(
      tenantId,
      phoneNumber,
      limit
    );

    return c.json({
      success: true,
      phone_number: phoneNumber,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/whatsapp/contacts
 * Get all WhatsApp contacts
 */
whatsapp.get('/contacts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const { rows } = await pool.query(
      `SELECT * FROM whatsapp_contacts
       WHERE tenant_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [tenantId]
    );

    return c.json({
      success: true,
      contacts: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Template Routes
// =============================================================================

/**
 * GET /v1/whatsapp/templates
 * Get all message templates
 */
whatsapp.get('/templates', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const { rows } = await pool.query(
      `SELECT * FROM whatsapp_templates
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return c.json({
      success: true,
      templates: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/whatsapp/account
 * Get WhatsApp account info
 */
whatsapp.get('/account', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const account = await whatsappService.getWhatsAppAccountByTenant(tenantId);

    // Don't expose access token
    const { access_token, ...accountData } = account;

    return c.json({
      success: true,
      account: accountData,
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/whatsapp/stats
 * Get WhatsApp statistics
 */
whatsapp.get('/stats', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const { rows } = await pool.query(
      'SELECT * FROM whatsapp_stats WHERE tenant_id = $1',
      [tenantId]
    );

    return c.json({
      success: true,
      stats: rows[0] || {},
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

function getExtensionFromMimeType(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return map[mimeType] || 'bin';
}

function getMediaTypeFromMimeType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export default whatsapp;
