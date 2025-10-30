/**
 * WhatsApp Cloud API Service
 * Handles sending/receiving messages, media, and templates via Meta's WhatsApp Business API
 * Week 15-16 Phase 2: WhatsApp Integration
 */

import pool from '../config/database.js';
import fetch from 'node-fetch';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Get WhatsApp account by phone number ID
 */
export async function getWhatsAppAccount(phoneNumberId) {
  const { rows } = await pool.query(
    'SELECT * FROM whatsapp_accounts WHERE phone_number_id = $1 AND status = $2',
    [phoneNumberId, 'active']
  );

  if (rows.length === 0) {
    throw new Error(`WhatsApp account not found: ${phoneNumberId}`);
  }

  return rows[0];
}

/**
 * Get WhatsApp account by tenant
 */
export async function getWhatsAppAccountByTenant(tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM whatsapp_accounts WHERE tenant_id = $1 AND status = $2 LIMIT 1',
    [tenantId, 'active']
  );

  if (rows.length === 0) {
    throw new Error('No active WhatsApp account found for tenant');
  }

  return rows[0];
}

/**
 * Send a text message
 */
export async function sendTextMessage(phoneNumberId, to, text, options = {}) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''), // Remove non-digits
    type: 'text',
    text: {
      preview_url: options.preview_url || false,
      body: text,
    },
  };

  // Add context (reply) if provided
  if (options.context_message_id) {
    payload.context = {
      message_id: options.context_message_id,
    };
  }

  const response = await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Store message in database
  const messageId = await storeOutboundMessage({
    tenantId: account.tenant_id,
    whatsappAccountId: account.id,
    to,
    messageType: 'text',
    textBody: text,
    messageId: response.messages?.[0]?.id,
    contextMessageId: options.context_message_id,
  });

  return {
    id: messageId,
    whatsapp_message_id: response.messages?.[0]?.id,
    success: true,
  };
}

/**
 * Send a template message
 */
export async function sendTemplateMessage(phoneNumberId, to, templateName, language, components = []) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: language,
      },
      components: components,
    },
  };

  const response = await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Store message in database
  const messageId = await storeOutboundMessage({
    tenantId: account.tenant_id,
    whatsappAccountId: account.id,
    to,
    messageType: 'template',
    templateName,
    templateLanguage: language,
    templateParams: { components },
    messageId: response.messages?.[0]?.id,
  });

  return {
    id: messageId,
    whatsapp_message_id: response.messages?.[0]?.id,
    success: true,
  };
}

/**
 * Send an image message
 */
export async function sendImageMessage(phoneNumberId, to, imageUrl, caption = null, options = {}) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'image',
    image: {
      link: imageUrl,
    },
  };

  if (caption) {
    payload.image.caption = caption;
  }

  if (options.context_message_id) {
    payload.context = {
      message_id: options.context_message_id,
    };
  }

  const response = await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Store message in database
  const messageId = await storeOutboundMessage({
    tenantId: account.tenant_id,
    whatsappAccountId: account.id,
    to,
    messageType: 'image',
    caption,
    mediaUrl: imageUrl,
    messageId: response.messages?.[0]?.id,
    contextMessageId: options.context_message_id,
  });

  return {
    id: messageId,
    whatsapp_message_id: response.messages?.[0]?.id,
    success: true,
  };
}

/**
 * Send a document message
 */
export async function sendDocumentMessage(phoneNumberId, to, documentUrl, filename, caption = null, options = {}) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'document',
    document: {
      link: documentUrl,
      filename: filename,
    },
  };

  if (caption) {
    payload.document.caption = caption;
  }

  if (options.context_message_id) {
    payload.context = {
      message_id: options.context_message_id,
    };
  }

  const response = await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Store message in database
  const messageId = await storeOutboundMessage({
    tenantId: account.tenant_id,
    whatsappAccountId: account.id,
    to,
    messageType: 'document',
    caption,
    mediaUrl: documentUrl,
    mediaFilename: filename,
    messageId: response.messages?.[0]?.id,
    contextMessageId: options.context_message_id,
  });

  return {
    id: messageId,
    whatsapp_message_id: response.messages?.[0]?.id,
    success: true,
  };
}

/**
 * Send an interactive button message
 */
export async function sendButtonMessage(phoneNumberId, to, bodyText, buttons, options = {}) {
  const account = await getWhatsAppAccount(phoneNumberId);

  // Format buttons for WhatsApp API
  const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
    type: 'reply',
    reply: {
      id: btn.id || `button_${index}`,
      title: btn.text.substring(0, 20), // Max 20 chars
    },
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to.replace(/\D/g, ''),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText,
      },
      action: {
        buttons: formattedButtons,
      },
    },
  };

  if (options.header) {
    payload.interactive.header = {
      type: 'text',
      text: options.header,
    };
  }

  if (options.footer) {
    payload.interactive.footer = {
      text: options.footer,
    };
  }

  const response = await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Store message in database
  const messageId = await storeOutboundMessage({
    tenantId: account.tenant_id,
    whatsappAccountId: account.id,
    to,
    messageType: 'interactive',
    textBody: bodyText,
    interactiveType: 'button',
    interactiveData: { buttons: formattedButtons, header: options.header, footer: options.footer },
    messageId: response.messages?.[0]?.id,
  });

  return {
    id: messageId,
    whatsapp_message_id: response.messages?.[0]?.id,
    success: true,
  };
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(phoneNumberId, messageId) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  await sendWhatsAppRequest(
    account.access_token,
    `/${phoneNumberId}/messages`,
    'POST',
    payload
  );

  // Update in database
  await pool.query(
    `UPDATE whatsapp_messages
     SET status = 'read', read_at = NOW()
     WHERE wamid = $1 OR message_id = $1`,
    [messageId]
  );

  return { success: true };
}

/**
 * Download media from WhatsApp
 */
export async function downloadMedia(mediaId, accessToken) {
  // Step 1: Get media URL from WhatsApp
  const mediaInfo = await sendWhatsAppRequest(
    accessToken,
    `/${mediaId}`,
    'GET'
  );

  if (!mediaInfo.url) {
    throw new Error('Media URL not found');
  }

  // Step 2: Download media file
  const response = await fetch(mediaInfo.url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.statusText}`);
  }

  const buffer = await response.buffer();

  return {
    buffer,
    mimeType: mediaInfo.mime_type,
    sha256: mediaInfo.sha256,
    fileSize: mediaInfo.file_size,
  };
}

/**
 * Upload media to WhatsApp (for sending)
 */
export async function uploadMedia(phoneNumberId, fileBuffer, mimeType) {
  const account = await getWhatsAppAccount(phoneNumberId);

  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', new Blob([fileBuffer], { type: mimeType }));
  formData.append('type', mimeType);

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/media`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to upload media: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return {
    media_id: data.id,
  };
}

/**
 * Save media to S3
 */
export async function saveMediaToS3(buffer, tenantId, filename, mimeType) {
  const key = `whatsapp/${tenantId}/${Date.now()}_${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  // Generate presigned URL (valid for 7 days)
  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }),
    { expiresIn: 7 * 24 * 60 * 60 }
  );

  return {
    s3_key: key,
    s3_url: url,
  };
}

/**
 * Get message templates
 */
export async function getMessageTemplates(businessAccountId, accessToken) {
  const response = await sendWhatsAppRequest(
    accessToken,
    `/${businessAccountId}/message_templates`,
    'GET',
    null,
    { fields: 'name,status,category,language,components' }
  );

  return response.data || [];
}

/**
 * Create message template
 */
export async function createMessageTemplate(businessAccountId, accessToken, templateData) {
  const payload = {
    name: templateData.name,
    language: templateData.language,
    category: templateData.category,
    components: templateData.components,
  };

  const response = await sendWhatsAppRequest(
    accessToken,
    `/${businessAccountId}/message_templates`,
    'POST',
    payload
  );

  return response;
}

/**
 * Helper: Send request to WhatsApp API
 */
async function sendWhatsAppRequest(accessToken, endpoint, method = 'GET', body = null, queryParams = {}) {
  const url = new URL(`${WHATSAPP_API_BASE}${endpoint}`);

  // Add query parameters
  Object.keys(queryParams).forEach(key => {
    url.searchParams.append(key, queryParams[key]);
  });

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `WhatsApp API error: ${error.error?.message || response.statusText} (${response.status})`
    );
  }

  return await response.json();
}

/**
 * Helper: Store outbound message in database
 */
async function storeOutboundMessage(data) {
  const {
    tenantId,
    whatsappAccountId,
    to,
    messageType,
    textBody = null,
    caption = null,
    templateName = null,
    templateLanguage = null,
    templateParams = null,
    mediaUrl = null,
    mediaFilename = null,
    interactiveType = null,
    interactiveData = null,
    messageId = null,
    contextMessageId = null,
  } = data;

  // Get WhatsApp account phone number
  const account = await pool.query(
    'SELECT phone_number FROM whatsapp_accounts WHERE id = $1',
    [whatsappAccountId]
  );

  const { rows } = await pool.query(
    `INSERT INTO whatsapp_messages (
      tenant_id,
      whatsapp_account_id,
      message_id,
      direction,
      status,
      from_number,
      to_number,
      message_type,
      text_body,
      caption,
      template_name,
      template_language,
      template_params,
      media_url,
      media_filename,
      interactive_type,
      interactive_data,
      context_message_id,
      sent_at,
      created_at
    ) VALUES (
      $1, $2, $3, 'outbound', 'sent', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
    )
    RETURNING id`,
    [
      tenantId,
      whatsappAccountId,
      messageId,
      account.rows[0].phone_number,
      to,
      messageType,
      textBody,
      caption,
      templateName,
      templateLanguage,
      templateParams ? JSON.stringify(templateParams) : null,
      mediaUrl,
      mediaFilename,
      interactiveType,
      interactiveData ? JSON.stringify(interactiveData) : null,
      contextMessageId,
    ]
  );

  return rows[0].id;
}

/**
 * Helper: Store inbound message in database
 */
export async function storeInboundMessage(webhookData, tenantId, whatsappAccountId) {
  const message = webhookData.messages?.[0];
  if (!message) return null;

  // Get or create WhatsApp contact
  const contactName = webhookData.contacts?.[0]?.profile?.name;
  await pool.query(
    'SELECT get_or_create_whatsapp_contact($1, $2, $3, $4)',
    [tenantId, whatsappAccountId, message.from, contactName]
  );

  // Extract message data based on type
  const messageData = extractMessageData(message);

  const { rows } = await pool.query(
    `INSERT INTO whatsapp_messages (
      tenant_id,
      whatsapp_account_id,
      wamid,
      direction,
      status,
      from_number,
      to_number,
      contact_name,
      message_type,
      text_body,
      caption,
      media_id,
      media_url,
      media_mime_type,
      media_filename,
      media_sha256,
      media_size_bytes,
      location_latitude,
      location_longitude,
      location_name,
      location_address,
      interactive_type,
      interactive_data,
      reaction_emoji,
      reaction_message_id,
      context_message_id,
      raw_webhook_data,
      created_at
    ) VALUES (
      $1, $2, $3, 'inbound', 'received', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW()
    )
    RETURNING id`,
    [
      tenantId,
      whatsappAccountId,
      message.id,
      message.from,
      webhookData.metadata?.phone_number_id,
      contactName,
      message.type,
      messageData.textBody,
      messageData.caption,
      messageData.mediaId,
      messageData.mediaUrl,
      messageData.mediaMimeType,
      messageData.mediaFilename,
      messageData.mediaSha256,
      messageData.mediaSizeBytes,
      messageData.locationLatitude,
      messageData.locationLongitude,
      messageData.locationName,
      messageData.locationAddress,
      messageData.interactiveType,
      messageData.interactiveData ? JSON.stringify(messageData.interactiveData) : null,
      messageData.reactionEmoji,
      messageData.reactionMessageId,
      message.context?.id || null,
      JSON.stringify(webhookData),
    ]
  );

  return rows[0].id;
}

/**
 * Helper: Extract message data based on type
 */
function extractMessageData(message) {
  const data = {
    textBody: null,
    caption: null,
    mediaId: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaFilename: null,
    mediaSha256: null,
    mediaSizeBytes: null,
    locationLatitude: null,
    locationLongitude: null,
    locationName: null,
    locationAddress: null,
    interactiveType: null,
    interactiveData: null,
    reactionEmoji: null,
    reactionMessageId: null,
  };

  switch (message.type) {
    case 'text':
      data.textBody = message.text?.body;
      break;

    case 'image':
      data.mediaId = message.image?.id;
      data.mediaMimeType = message.image?.mime_type;
      data.mediaSha256 = message.image?.sha256;
      data.caption = message.image?.caption;
      break;

    case 'video':
      data.mediaId = message.video?.id;
      data.mediaMimeType = message.video?.mime_type;
      data.mediaSha256 = message.video?.sha256;
      data.caption = message.video?.caption;
      break;

    case 'audio':
      data.mediaId = message.audio?.id;
      data.mediaMimeType = message.audio?.mime_type;
      data.mediaSha256 = message.audio?.sha256;
      break;

    case 'document':
      data.mediaId = message.document?.id;
      data.mediaMimeType = message.document?.mime_type;
      data.mediaSha256 = message.document?.sha256;
      data.mediaFilename = message.document?.filename;
      data.caption = message.document?.caption;
      break;

    case 'location':
      data.locationLatitude = message.location?.latitude;
      data.locationLongitude = message.location?.longitude;
      data.locationName = message.location?.name;
      data.locationAddress = message.location?.address;
      break;

    case 'interactive':
      data.interactiveType = message.interactive?.type;
      data.interactiveData = message.interactive;
      break;

    case 'reaction':
      data.reactionEmoji = message.reaction?.emoji;
      data.reactionMessageId = message.reaction?.message_id;
      break;
  }

  return data;
}

/**
 * Update message status from webhook
 */
export async function updateMessageStatus(statusUpdate) {
  const status = statusUpdate.status; // 'sent', 'delivered', 'read', 'failed'
  const messageId = statusUpdate.id;
  const timestamp = new Date(statusUpdate.timestamp * 1000);

  const statusColumn = status === 'sent' ? 'sent_at' :
                       status === 'delivered' ? 'delivered_at' :
                       status === 'read' ? 'read_at' :
                       status === 'failed' ? 'failed_at' : null;

  if (!statusColumn) return;

  const updates = [`status = $1`, `${statusColumn} = $2`];
  const values = [status, timestamp, messageId];

  // Add error info if failed
  if (status === 'failed' && statusUpdate.errors) {
    updates.push('error_code = $4', 'error_message = $5');
    values.push(
      statusUpdate.errors[0]?.code,
      statusUpdate.errors[0]?.title,
      messageId // for WHERE clause
    );
  }

  await pool.query(
    `UPDATE whatsapp_messages
     SET ${updates.join(', ')}
     WHERE message_id = $3`,
    values
  );
}

/**
 * Get conversation messages
 */
export async function getConversationMessages(tenantId, phoneNumber, limit = 50) {
  const { rows } = await pool.query(
    `SELECT wm.*, wc.whatsapp_name, wc.profile_pic_url
     FROM whatsapp_messages wm
     LEFT JOIN whatsapp_contacts wc ON (wm.from_number = wc.phone_number OR wm.to_number = wc.phone_number)
       AND wc.tenant_id = $1
     WHERE wm.tenant_id = $1
       AND (wm.from_number = $2 OR wm.to_number = $2)
     ORDER BY wm.created_at DESC
     LIMIT $3`,
    [tenantId, phoneNumber, limit]
  );

  return rows.reverse(); // Return in chronological order
}
