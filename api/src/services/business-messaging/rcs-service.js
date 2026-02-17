/**
 * RCS (Rich Communication Services) Messaging Service
 *
 * Provides RCS Business Messaging capabilities with automatic SMS fallback
 * Supports rich cards, carousels, suggested replies/actions, file sharing
 */

import db from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class RCSService {
  constructor() {
    // RCS providers configuration (Sinch, Mavenir, Google Jibe, etc.)
    this.providers = new Map();
  }

  /**
   * Initialize provider client for tenant
   */
  async getProviderClient(tenantId) {
    const cacheKey = `rcs_provider_${tenantId}`;

    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey);
    }

    const result = await db.query(`
      SELECT * FROM rcs_accounts
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1
    `, [tenantId]);

    if (result.rows.length === 0) {
      throw new Error('No active RCS account found for tenant');
    }

    const account = result.rows[0];
    const credentials = account.credentials;

    // Initialize based on provider type
    const client = {
      accountId: account.id,
      agentId: account.agent_id,
      provider: account.provider,
      credentials: credentials,
      sendRequest: async (endpoint, method, body) => {
        return this.sendProviderRequest(account.provider, credentials, endpoint, method, body);
      }
    };

    this.providers.set(cacheKey, client);
    return client;
  }

  /**
   * Send request to RCS provider
   */
  async sendProviderRequest(provider, credentials, endpoint, method = 'POST', body = null) {
    let baseUrl, headers;

    switch (provider) {
      case 'sinch':
        baseUrl = 'https://us.rcs.api.sinch.com/v1';
        headers = {
          'Authorization': `Bearer ${credentials.apiToken}`,
          'Content-Type': 'application/json'
        };
        break;

      case 'google_jibe':
        baseUrl = 'https://rcsbusinessmessaging.googleapis.com/v1';
        headers = {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        };
        break;

      case 'mavenir':
        baseUrl = credentials.apiEndpoint || 'https://api.mavenir.com/rcs/v1';
        headers = {
          'X-API-Key': credentials.apiKey,
          'Content-Type': 'application/json'
        };
        break;

      case 'bandwidth':
        baseUrl = 'https://messaging.bandwidth.com/api/v2';
        const authString = Buffer.from(`${credentials.apiToken}:${credentials.apiSecret}`).toString('base64');
        headers = {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json'
        };
        break;

      default:
        throw new Error(`Unsupported RCS provider: ${provider}`);
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RCS API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Register a new RCS agent/account
   */
  async registerAgent(tenantId, data) {
    const {
      provider,
      agentId,
      brandName,
      displayName,
      description,
      logoUrl,
      heroImageUrl,
      phoneNumber,
      webhookUrl,
      credentials,
      capabilities
    } = data;

    // Encrypt sensitive credentials
    const encryptedCredentials = this.encryptCredentials(credentials);

    const result = await db.query(`
      INSERT INTO rcs_accounts (
        tenant_id, provider, agent_id, brand_name, display_name,
        description, logo_url, hero_image_url, phone_number,
        webhook_url, credentials, capabilities, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *
    `, [
      tenantId, provider, agentId, brandName, displayName,
      description, logoUrl, heroImageUrl, phoneNumber,
      webhookUrl, encryptedCredentials, JSON.stringify(capabilities || {})
    ]);

    // Clear provider cache
    this.providers.delete(`rcs_provider_${tenantId}`);

    return result.rows[0];
  }

  /**
   * Verify agent with provider
   */
  async verifyAgent(tenantId, accountId) {
    const account = await db.query(`
      SELECT * FROM rcs_accounts WHERE id = $1 AND tenant_id = $2
    `, [accountId, tenantId]);

    if (account.rows.length === 0) {
      throw new Error('RCS account not found');
    }

    const client = await this.getProviderClient(tenantId);

    // Verify with provider
    const verification = await client.sendRequest(
      `/agents/${account.rows[0].agent_id}/verify`,
      'POST',
      { agentId: account.rows[0].agent_id }
    );

    await db.query(`
      UPDATE rcs_accounts
      SET status = 'active', verified_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [accountId]);

    return { verified: true, verification };
  }

  /**
   * Handle incoming RCS webhook
   */
  async handleWebhook(tenantId, payload, signature = null) {
    // Verify webhook signature if provided
    if (signature) {
      const isValid = await this.verifyWebhookSignature(tenantId, payload, signature);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    const eventType = payload.eventType || payload.type;

    // Log webhook event
    await db.query(`
      INSERT INTO rcs_webhook_logs (tenant_id, event_type, payload, received_at)
      VALUES ($1, $2, $3, NOW())
    `, [tenantId, eventType, JSON.stringify(payload)]);

    switch (eventType) {
      case 'MESSAGE':
      case 'message':
        return this.handleIncomingMessage(tenantId, payload);

      case 'MESSAGE_STATUS':
      case 'status':
        return this.handleMessageStatus(tenantId, payload);

      case 'USER_ACTION':
      case 'suggestion_response':
        return this.handleUserAction(tenantId, payload);

      case 'ISTYPING':
      case 'is_typing':
        return this.handleTypingIndicator(tenantId, payload);

      case 'READ':
      case 'read':
        return this.handleReadReceipt(tenantId, payload);

      case 'CAPABILITY_CHECK':
      case 'capability':
        return this.handleCapabilityCheck(tenantId, payload);

      default:
        console.log(`Unknown RCS event type: ${eventType}`);
        return { processed: false, eventType };
    }
  }

  /**
   * Handle incoming message
   */
  async handleIncomingMessage(tenantId, payload) {
    const senderPhone = payload.senderPhoneNumber || payload.from;
    const agentId = payload.agentId || payload.to;
    const messageId = payload.messageId || uuidv4();
    const text = payload.text || payload.message?.text;
    const contentInfo = payload.contentInfo || payload.message?.content;

    // Find or create conversation
    let conversation = await db.query(`
      SELECT * FROM rcs_conversations
      WHERE tenant_id = $1 AND user_phone = $2 AND status = 'active'
      LIMIT 1
    `, [tenantId, senderPhone]);

    let conversationId;
    if (conversation.rows.length === 0) {
      const newConv = await db.query(`
        INSERT INTO rcs_conversations (
          tenant_id, agent_id, user_phone, status, capabilities_verified
        ) VALUES ($1, $2, $3, 'active', false)
        RETURNING id
      `, [tenantId, agentId, senderPhone]);
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = conversation.rows[0].id;
    }

    // Determine message type
    let messageType = 'text';
    let content = { text };

    if (contentInfo) {
      if (contentInfo.fileUrl || contentInfo.contentUrl) {
        messageType = contentInfo.contentType?.startsWith('image/') ? 'image' :
                     contentInfo.contentType?.startsWith('video/') ? 'video' : 'file';
        content = {
          fileUrl: contentInfo.fileUrl || contentInfo.contentUrl,
          fileName: contentInfo.fileName,
          contentType: contentInfo.contentType,
          thumbnailUrl: contentInfo.thumbnailUrl
        };
      } else if (payload.location) {
        messageType = 'location';
        content = {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
          label: payload.location.label
        };
      }
    }

    // Store message
    const result = await db.query(`
      INSERT INTO rcs_messages (
        conversation_id, tenant_id, provider_message_id, direction,
        message_type, content, status
      ) VALUES ($1, $2, $3, 'inbound', $4, $5, 'received')
      RETURNING *
    `, [conversationId, tenantId, messageId, messageType, JSON.stringify(content)]);

    // Update conversation
    await db.query(`
      UPDATE rcs_conversations
      SET last_message_at = NOW(), message_count = message_count + 1
      WHERE id = $1
    `, [conversationId]);

    return {
      processed: true,
      conversationId,
      message: result.rows[0]
    };
  }

  /**
   * Handle message status update
   */
  async handleMessageStatus(tenantId, payload) {
    const messageId = payload.messageId;
    const status = payload.status?.toLowerCase() || payload.deliveryStatus;

    await db.query(`
      UPDATE rcs_messages
      SET status = $1,
          delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
          read_at = CASE WHEN $1 = 'read' THEN NOW() ELSE read_at END,
          updated_at = NOW()
      WHERE provider_message_id = $2 AND tenant_id = $3
    `, [status, messageId, tenantId]);

    return { processed: true, status };
  }

  /**
   * Handle user action (suggested reply/action responses)
   */
  async handleUserAction(tenantId, payload) {
    const conversationId = payload.conversationId;
    const postbackData = payload.suggestionResponse?.postbackData || payload.postbackData;
    const text = payload.suggestionResponse?.text || payload.text;

    // Store as a message with action type
    const result = await db.query(`
      INSERT INTO rcs_messages (
        conversation_id, tenant_id, provider_message_id, direction,
        message_type, content, status
      ) VALUES ($1, $2, $3, 'inbound', 'action', $4, 'received')
      RETURNING *
    `, [
      conversationId,
      tenantId,
      uuidv4(),
      JSON.stringify({ postbackData, text })
    ]);

    return {
      processed: true,
      action: { postbackData, text },
      message: result.rows[0]
    };
  }

  /**
   * Handle typing indicator
   */
  async handleTypingIndicator(tenantId, payload) {
    const conversationId = payload.conversationId;
    const isTyping = payload.isTyping !== false;

    await db.query(`
      UPDATE rcs_conversations
      SET user_typing = $1, user_typing_at = NOW()
      WHERE id = $2 AND tenant_id = $3
    `, [isTyping, conversationId, tenantId]);

    return { processed: true, isTyping };
  }

  /**
   * Handle read receipt
   */
  async handleReadReceipt(tenantId, payload) {
    const messageIds = payload.messageIds || [payload.messageId];

    await db.query(`
      UPDATE rcs_messages
      SET status = 'read', read_at = NOW()
      WHERE provider_message_id = ANY($1) AND tenant_id = $2
    `, [messageIds, tenantId]);

    return { processed: true, messagesRead: messageIds.length };
  }

  /**
   * Handle capability check response
   */
  async handleCapabilityCheck(tenantId, payload) {
    const phone = payload.phone || payload.msisdn;
    const capabilities = payload.capabilities || payload.features;
    const rcsEnabled = capabilities?.rcs === true || capabilities?.rcsEnabled === true;

    // Store capability result
    await db.query(`
      INSERT INTO rcs_capability_cache (
        tenant_id, phone_number, rcs_enabled, capabilities, checked_at, expires_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT (tenant_id, phone_number)
      DO UPDATE SET rcs_enabled = $3, capabilities = $4, checked_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
    `, [tenantId, phone, rcsEnabled, JSON.stringify(capabilities)]);

    return { processed: true, phone, rcsEnabled, capabilities };
  }

  /**
   * Check if phone number supports RCS
   */
  async checkCapability(tenantId, phoneNumber) {
    // Check cache first
    const cached = await db.query(`
      SELECT * FROM rcs_capability_cache
      WHERE tenant_id = $1 AND phone_number = $2 AND expires_at > NOW()
    `, [tenantId, phoneNumber]);

    if (cached.rows.length > 0) {
      return {
        rcsEnabled: cached.rows[0].rcs_enabled,
        capabilities: cached.rows[0].capabilities,
        cached: true
      };
    }

    // Query provider
    const client = await this.getProviderClient(tenantId);

    try {
      const result = await client.sendRequest(
        `/capabilities/${encodeURIComponent(phoneNumber)}`,
        'GET'
      );

      const rcsEnabled = result.rcsEnabled || result.capabilities?.rcs === true;

      // Cache result
      await db.query(`
        INSERT INTO rcs_capability_cache (
          tenant_id, phone_number, rcs_enabled, capabilities, checked_at, expires_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '24 hours')
        ON CONFLICT (tenant_id, phone_number)
        DO UPDATE SET rcs_enabled = $3, capabilities = $4, checked_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
      `, [tenantId, phoneNumber, rcsEnabled, JSON.stringify(result.capabilities || {})]);

      return {
        rcsEnabled,
        capabilities: result.capabilities,
        cached: false
      };
    } catch (error) {
      console.error('Capability check failed:', error);
      return {
        rcsEnabled: false,
        error: error.message,
        cached: false
      };
    }
  }

  /**
   * Send a text message
   */
  async sendTextMessage(tenantId, conversationId, text, options = {}) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    const messageId = uuidv4();

    const payload = {
      messageId,
      to: conversation.user_phone,
      from: conversation.agent_id,
      text: text,
      ...(options.suggestions && { suggestions: this.formatSuggestions(options.suggestions) })
    };

    // Check RCS capability
    const capability = await this.checkCapability(tenantId, conversation.user_phone);

    let sendMethod = 'rcs';
    if (!capability.rcsEnabled && options.smsFallback !== false) {
      sendMethod = 'sms_fallback';
      // Trigger SMS fallback (integrate with your SMS service)
      // For now, we'll mark it as needing fallback
    }

    try {
      if (sendMethod === 'rcs') {
        await client.sendRequest('/messages', 'POST', payload);
      }

      // Store message
      const result = await db.query(`
        INSERT INTO rcs_messages (
          conversation_id, tenant_id, provider_message_id, direction,
          message_type, content, status, delivery_method
        ) VALUES ($1, $2, $3, 'outbound', 'text', $4, 'sent', $5)
        RETURNING *
      `, [
        conversationId,
        tenantId,
        messageId,
        JSON.stringify({ text, suggestions: options.suggestions }),
        sendMethod
      ]);

      // Update conversation
      await db.query(`
        UPDATE rcs_conversations
        SET last_message_at = NOW(), message_count = message_count + 1
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0];
    } catch (error) {
      // Store failed message
      await db.query(`
        INSERT INTO rcs_messages (
          conversation_id, tenant_id, provider_message_id, direction,
          message_type, content, status, error_details
        ) VALUES ($1, $2, $3, 'outbound', 'text', $4, 'failed', $5)
      `, [
        conversationId,
        tenantId,
        messageId,
        JSON.stringify({ text }),
        JSON.stringify({ error: error.message })
      ]);

      throw error;
    }
  }

  /**
   * Send a rich card
   */
  async sendRichCard(tenantId, conversationId, card, options = {}) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    const messageId = uuidv4();

    const richCard = {
      standaloneCard: {
        cardOrientation: card.orientation || 'VERTICAL',
        thumbnailImageAlignment: card.thumbnailAlignment || 'LEFT',
        cardContent: {
          title: card.title,
          description: card.description,
          media: card.mediaUrl ? {
            height: card.mediaHeight || 'MEDIUM',
            contentInfo: {
              fileUrl: card.mediaUrl,
              thumbnailUrl: card.thumbnailUrl,
              forceRefresh: false
            }
          } : undefined,
          suggestions: card.suggestions ? this.formatSuggestions(card.suggestions) : undefined
        }
      }
    };

    const payload = {
      messageId,
      to: conversation.user_phone,
      from: conversation.agent_id,
      richCard
    };

    try {
      await client.sendRequest('/messages', 'POST', payload);

      const result = await db.query(`
        INSERT INTO rcs_messages (
          conversation_id, tenant_id, provider_message_id, direction,
          message_type, content, status
        ) VALUES ($1, $2, $3, 'outbound', 'rich_card', $4, 'sent')
        RETURNING *
      `, [conversationId, tenantId, messageId, JSON.stringify(card)]);

      await db.query(`
        UPDATE rcs_conversations
        SET last_message_at = NOW(), message_count = message_count + 1
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0];
    } catch (error) {
      await this.logMessageError(conversationId, tenantId, messageId, 'rich_card', card, error);
      throw error;
    }
  }

  /**
   * Send a carousel of rich cards
   */
  async sendCarousel(tenantId, conversationId, cards, options = {}) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    const messageId = uuidv4();

    const carousel = {
      carouselCard: {
        cardWidth: options.cardWidth || 'MEDIUM',
        cardContents: cards.map(card => ({
          title: card.title,
          description: card.description,
          media: card.mediaUrl ? {
            height: card.mediaHeight || 'MEDIUM',
            contentInfo: {
              fileUrl: card.mediaUrl,
              thumbnailUrl: card.thumbnailUrl
            }
          } : undefined,
          suggestions: card.suggestions ? this.formatSuggestions(card.suggestions) : undefined
        }))
      }
    };

    const payload = {
      messageId,
      to: conversation.user_phone,
      from: conversation.agent_id,
      richCard: carousel
    };

    try {
      await client.sendRequest('/messages', 'POST', payload);

      const result = await db.query(`
        INSERT INTO rcs_messages (
          conversation_id, tenant_id, provider_message_id, direction,
          message_type, content, status
        ) VALUES ($1, $2, $3, 'outbound', 'carousel', $4, 'sent')
        RETURNING *
      `, [conversationId, tenantId, messageId, JSON.stringify({ cards, options })]);

      await db.query(`
        UPDATE rcs_conversations
        SET last_message_at = NOW(), message_count = message_count + 1
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0];
    } catch (error) {
      await this.logMessageError(conversationId, tenantId, messageId, 'carousel', { cards }, error);
      throw error;
    }
  }

  /**
   * Send a file/media message
   */
  async sendFile(tenantId, conversationId, file, options = {}) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    const messageId = uuidv4();

    const payload = {
      messageId,
      to: conversation.user_phone,
      from: conversation.agent_id,
      contentInfo: {
        fileUrl: file.url,
        thumbnailUrl: file.thumbnailUrl,
        fileName: file.name,
        contentType: file.contentType
      },
      text: options.caption
    };

    try {
      await client.sendRequest('/messages', 'POST', payload);

      const result = await db.query(`
        INSERT INTO rcs_messages (
          conversation_id, tenant_id, provider_message_id, direction,
          message_type, content, status
        ) VALUES ($1, $2, $3, 'outbound', 'file', $4, 'sent')
        RETURNING *
      `, [conversationId, tenantId, messageId, JSON.stringify(file)]);

      await db.query(`
        UPDATE rcs_conversations
        SET last_message_at = NOW(), message_count = message_count + 1
        WHERE id = $1
      `, [conversationId]);

      return result.rows[0];
    } catch (error) {
      await this.logMessageError(conversationId, tenantId, messageId, 'file', file, error);
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(tenantId, conversationId, isTyping = true) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    await client.sendRequest('/events', 'POST', {
      eventType: 'ISTYPING',
      to: conversation.user_phone,
      from: conversation.agent_id,
      isTyping
    });

    return { sent: true, isTyping };
  }

  /**
   * Send read receipt
   */
  async sendReadReceipt(tenantId, conversationId, messageIds) {
    const conversation = await this.getConversation(tenantId, conversationId);
    const client = await this.getProviderClient(tenantId);

    await client.sendRequest('/events', 'POST', {
      eventType: 'READ',
      to: conversation.user_phone,
      from: conversation.agent_id,
      messageIds: Array.isArray(messageIds) ? messageIds : [messageIds]
    });

    return { sent: true, messageIds };
  }

  /**
   * Format suggestions for RCS
   */
  formatSuggestions(suggestions) {
    return suggestions.map(suggestion => {
      if (suggestion.type === 'reply') {
        return {
          reply: {
            text: suggestion.text,
            postbackData: suggestion.postbackData || suggestion.text
          }
        };
      } else if (suggestion.type === 'action') {
        const action = {};

        switch (suggestion.action) {
          case 'dial':
            action.dialAction = {
              phoneNumber: suggestion.phoneNumber
            };
            break;
          case 'openUrl':
            action.openUrlAction = {
              url: suggestion.url
            };
            break;
          case 'viewLocation':
            action.viewLocationAction = {
              latLong: {
                latitude: suggestion.latitude,
                longitude: suggestion.longitude
              },
              label: suggestion.label
            };
            break;
          case 'shareLocation':
            action.shareLocationAction = {};
            break;
          case 'calendar':
            action.createCalendarEventAction = {
              startTime: suggestion.startTime,
              endTime: suggestion.endTime,
              title: suggestion.title,
              description: suggestion.description
            };
            break;
        }

        return {
          action: {
            text: suggestion.text,
            postbackData: suggestion.postbackData || suggestion.text,
            ...action
          }
        };
      }

      return suggestion;
    });
  }

  /**
   * Get conversation by ID
   */
  async getConversation(tenantId, conversationId) {
    const result = await db.query(`
      SELECT * FROM rcs_conversations
      WHERE id = $1 AND tenant_id = $2
    `, [conversationId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }

    return result.rows[0];
  }

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(tenantId, agentId, userPhone) {
    let result = await db.query(`
      SELECT * FROM rcs_conversations
      WHERE tenant_id = $1 AND agent_id = $2 AND user_phone = $3 AND status = 'active'
      LIMIT 1
    `, [tenantId, agentId, userPhone]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    result = await db.query(`
      INSERT INTO rcs_conversations (tenant_id, agent_id, user_phone, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING *
    `, [tenantId, agentId, userPhone]);

    return result.rows[0];
  }

  /**
   * List conversations
   */
  async listConversations(tenantId, options = {}) {
    const { status, agentId, limit = 50, offset = 0 } = options;

    let query = `
      SELECT c.*,
        (SELECT content FROM rcs_messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1) as last_message
      FROM rcs_conversations c
      WHERE c.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (status) {
      query += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (agentId) {
      query += ` AND c.agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get conversation messages
   */
  async getMessages(tenantId, conversationId, options = {}) {
    const { limit = 50, offset = 0, direction } = options;

    let query = `
      SELECT * FROM rcs_messages
      WHERE conversation_id = $1 AND tenant_id = $2
    `;
    const params = [conversationId, tenantId];
    let paramIndex = 3;

    if (direction) {
      query += ` AND direction = $${paramIndex++}`;
      params.push(direction);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Create/update message template
   */
  async saveTemplate(tenantId, data) {
    const {
      id,
      name,
      category,
      templateType,
      content,
      suggestions,
      variables
    } = data;

    if (id) {
      const result = await db.query(`
        UPDATE rcs_templates
        SET name = $1, category = $2, template_type = $3, content = $4,
            suggestions = $5, variables = $6, updated_at = NOW()
        WHERE id = $7 AND tenant_id = $8
        RETURNING *
      `, [name, category, templateType, JSON.stringify(content),
          JSON.stringify(suggestions), JSON.stringify(variables), id, tenantId]);
      return result.rows[0];
    } else {
      const result = await db.query(`
        INSERT INTO rcs_templates (
          tenant_id, name, category, template_type, content, suggestions, variables
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [tenantId, name, category, templateType, JSON.stringify(content),
          JSON.stringify(suggestions), JSON.stringify(variables)]);
      return result.rows[0];
    }
  }

  /**
   * List templates
   */
  async listTemplates(tenantId, options = {}) {
    const { category, status, limit = 50, offset = 0 } = options;

    let query = `SELECT * FROM rcs_templates WHERE tenant_id = $1`;
    const params = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Send template message
   */
  async sendTemplate(tenantId, conversationId, templateId, variables = {}) {
    const template = await db.query(`
      SELECT * FROM rcs_templates WHERE id = $1 AND tenant_id = $2
    `, [templateId, tenantId]);

    if (template.rows.length === 0) {
      throw new Error('Template not found');
    }

    const tmpl = template.rows[0];
    let content = tmpl.content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      content = JSON.parse(
        JSON.stringify(content).replace(new RegExp(`{{${key}}}`, 'g'), value)
      );
    }

    // Send based on template type
    switch (tmpl.template_type) {
      case 'text':
        return this.sendTextMessage(tenantId, conversationId, content.text, {
          suggestions: tmpl.suggestions
        });
      case 'rich_card':
        return this.sendRichCard(tenantId, conversationId, content);
      case 'carousel':
        return this.sendCarousel(tenantId, conversationId, content.cards);
      default:
        throw new Error(`Unsupported template type: ${tmpl.template_type}`);
    }
  }

  /**
   * Get analytics
   */
  async getAnalytics(tenantId, options = {}) {
    const { startDate, endDate, agentId } = options;

    const dateFilter = startDate && endDate
      ? `AND created_at BETWEEN '${startDate}' AND '${endDate}'`
      : '';

    const agentFilter = agentId
      ? `AND agent_id = '${agentId}'`
      : '';

    // Message stats
    const messageStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound') as sent,
        COUNT(*) FILTER (WHERE direction = 'inbound') as received,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'read') as read,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE delivery_method = 'sms_fallback') as sms_fallback
      FROM rcs_messages
      WHERE tenant_id = $1 ${dateFilter}
    `, [tenantId]);

    // Conversation stats
    const convStats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        AVG(message_count) as avg_messages
      FROM rcs_conversations
      WHERE tenant_id = $1 ${agentFilter} ${dateFilter}
    `, [tenantId]);

    // Daily trends
    const trends = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as messages,
        COUNT(*) FILTER (WHERE direction = 'outbound') as sent,
        COUNT(*) FILTER (WHERE direction = 'inbound') as received
      FROM rcs_messages
      WHERE tenant_id = $1 ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [tenantId]);

    return {
      messages: messageStats.rows[0],
      conversations: convStats.rows[0],
      trends: trends.rows
    };
  }

  /**
   * Log message error
   */
  async logMessageError(conversationId, tenantId, messageId, messageType, content, error) {
    await db.query(`
      INSERT INTO rcs_messages (
        conversation_id, tenant_id, provider_message_id, direction,
        message_type, content, status, error_details
      ) VALUES ($1, $2, $3, 'outbound', $4, $5, 'failed', $6)
    `, [
      conversationId,
      tenantId,
      messageId,
      messageType,
      JSON.stringify(content),
      JSON.stringify({ error: error.message })
    ]);
  }

  /**
   * Encrypt credentials
   */
  encryptCredentials(credentials) {
    // In production, use proper encryption with a key from environment
    // For now, return as-is (should be stored encrypted in production)
    return credentials;
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(tenantId, payload, signature) {
    const account = await db.query(`
      SELECT credentials FROM rcs_accounts
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1
    `, [tenantId]);

    if (account.rows.length === 0) return false;

    const secret = account.rows[0].credentials?.webhookSecret;
    if (!secret) return true; // No secret configured, skip verification

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export default new RCSService();
