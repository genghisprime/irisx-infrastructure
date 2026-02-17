/**
 * Google Business Messages Service
 * Handles Google Business Messages (formerly Google My Business Messaging) integration
 */

import { pool } from '../../database.js';
import crypto from 'crypto';

class GoogleBusinessService {
    /**
     * Register a new Google Business agent
     */
    async registerAgent(tenantId, agentData) {
        const {
            agentId,
            agentName,
            brandId,
            partnerKey,
            serviceAccountEmail,
            serviceAccountKey,
            logoUrl,
            conversationStarters,
            primaryInteractionUrl,
            phoneNumber,
            privacyPolicyUrl,
            capabilities,
            entryPoints
        } = agentData;

        const result = await pool.query(
            `INSERT INTO google_business_agents (
                tenant_id, agent_id, agent_name, brand_id, partner_key,
                service_account_email, service_account_key_encrypted,
                logo_url, conversation_starters, primary_interaction_url,
                phone_number, privacy_policy_url, capabilities, entry_points
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                tenantId,
                agentId,
                agentName,
                brandId,
                partnerKey,
                serviceAccountEmail,
                serviceAccountKey ? this.encrypt(serviceAccountKey) : null,
                logoUrl,
                JSON.stringify(conversationStarters || []),
                primaryInteractionUrl,
                phoneNumber,
                privacyPolicyUrl,
                JSON.stringify(capabilities || ['rich_cards', 'carousels', 'suggestions']),
                JSON.stringify(entryPoints || ['NON_LOCAL'])
            ]
        );

        return result.rows[0];
    }

    /**
     * Get Google Business agent
     */
    async getAgent(agentDbId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM google_business_agents
             WHERE id = $1 AND tenant_id = $2`,
            [agentDbId, tenantId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all agents for tenant
     */
    async getAgents(tenantId) {
        const result = await pool.query(
            `SELECT * FROM google_business_agents
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            [tenantId]
        );
        return result.rows;
    }

    /**
     * Update agent
     */
    async updateAgent(agentDbId, tenantId, updates) {
        const allowedFields = [
            'agent_name', 'brand_id', 'logo_url', 'conversation_starters',
            'primary_interaction_url', 'phone_number', 'privacy_policy_url',
            'capabilities', 'entry_points', 'status', 'verification_status'
        ];

        const fields = [];
        const values = [agentDbId, tenantId];
        let paramIndex = 3;

        for (const [key, value] of Object.entries(updates)) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            if (allowedFields.includes(snakeKey)) {
                fields.push(`${snakeKey} = $${paramIndex}`);
                const isJsonField = ['conversation_starters', 'capabilities', 'entry_points'].includes(snakeKey);
                values.push(isJsonField ? JSON.stringify(value) : value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return this.getAgent(agentDbId, tenantId);
        }

        const result = await pool.query(
            `UPDATE google_business_agents
             SET ${fields.join(', ')}, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            values
        );

        return result.rows[0];
    }

    /**
     * Add location to agent
     */
    async addLocation(tenantId, agentDbId, locationData) {
        const result = await pool.query(
            `INSERT INTO google_business_locations (
                tenant_id, agent_id, location_id, place_id, location_name,
                address_line1, address_line2, city, state, country_code, postal_code,
                latitude, longitude, business_hours, entry_point_configs
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                tenantId,
                agentDbId,
                locationData.locationId,
                locationData.placeId,
                locationData.locationName,
                locationData.addressLine1,
                locationData.addressLine2,
                locationData.city,
                locationData.state,
                locationData.countryCode,
                locationData.postalCode,
                locationData.latitude,
                locationData.longitude,
                JSON.stringify(locationData.businessHours || {}),
                JSON.stringify(locationData.entryPointConfigs || {})
            ]
        );
        return result.rows[0];
    }

    /**
     * Get locations for agent
     */
    async getLocations(agentDbId) {
        const result = await pool.query(
            `SELECT * FROM google_business_locations
             WHERE agent_id = $1
             ORDER BY location_name`,
            [agentDbId]
        );
        return result.rows;
    }

    /**
     * Handle incoming webhook from Google
     */
    async handleWebhook(agentId, payload) {
        // Find agent by Google agent ID
        const agent = await pool.query(
            `SELECT * FROM google_business_agents WHERE agent_id = $1`,
            [agentId]
        );

        if (!agent.rows[0]) {
            throw new Error('Agent not found');
        }

        const agentData = agent.rows[0];
        const tenantId = agentData.tenant_id;

        // Handle different event types
        if (payload.message) {
            return await this.handleMessage(tenantId, agentData.id, payload);
        } else if (payload.suggestionResponse) {
            return await this.handleSuggestionResponse(tenantId, agentData.id, payload);
        } else if (payload.authenticationResponse) {
            return await this.handleAuthResponse(tenantId, agentData.id, payload);
        } else if (payload.userStatus) {
            return await this.handleUserStatus(tenantId, agentData.id, payload);
        } else if (payload.receipts) {
            return await this.handleReceipts(tenantId, agentData.id, payload);
        } else if (payload.surveyResponse) {
            return await this.handleSurveyResponse(tenantId, agentData.id, payload);
        }

        return { handled: false };
    }

    /**
     * Handle incoming message
     */
    async handleMessage(tenantId, agentDbId, payload) {
        const conversationId = payload.conversationId;

        // Find or create conversation
        let conversation = await this.findConversation(agentDbId, conversationId);

        if (!conversation) {
            conversation = await this.createConversation(tenantId, agentDbId, {
                conversationId,
                entryPoint: payload.context?.entryPoint,
                userDeviceLocale: payload.context?.userInfo?.deviceLocale,
                userTimezone: payload.context?.userInfo?.timezone
            });
        }

        // Determine message type
        let messageType = 'text';
        let content = payload.message.text;
        let attachments = [];

        if (payload.message.image) {
            messageType = 'image';
            attachments = [{
                type: 'image',
                url: payload.message.image.contentInfo?.fileUrl,
                mimeType: payload.message.image.contentInfo?.altText
            }];
        }

        // Store the message
        const message = await this.storeMessage(tenantId, conversation.id, {
            messageId: payload.message.messageId,
            direction: 'inbound',
            senderType: 'user',
            messageType,
            content,
            attachments
        });

        // Update conversation last message time
        await pool.query(
            `UPDATE google_business_conversations
             SET last_message_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [conversation.id]
        );

        return { conversation, message };
    }

    /**
     * Handle suggestion response (button click)
     */
    async handleSuggestionResponse(tenantId, agentDbId, payload) {
        const conversationId = payload.conversationId;
        const conversation = await this.findConversation(agentDbId, conversationId);

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const suggestionResponse = payload.suggestionResponse;
        const messageType = suggestionResponse.type === 'reply' ? 'suggested_reply' : 'suggested_action';

        const message = await this.storeMessage(tenantId, conversation.id, {
            messageId: suggestionResponse.message,
            direction: 'inbound',
            senderType: 'user',
            messageType,
            content: suggestionResponse.text,
            suggestions: [{ postbackData: suggestionResponse.postbackData }]
        });

        await pool.query(
            `UPDATE google_business_conversations
             SET last_message_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [conversation.id]
        );

        return { conversation, message };
    }

    /**
     * Handle authentication response
     */
    async handleAuthResponse(tenantId, agentDbId, payload) {
        const conversationId = payload.conversationId;
        const conversation = await this.findConversation(agentDbId, conversationId);

        if (conversation) {
            await this.storeMessage(tenantId, conversation.id, {
                messageId: crypto.randomUUID(),
                direction: 'inbound',
                senderType: 'user',
                messageType: 'authentication',
                authData: payload.authenticationResponse
            });
        }

        return { handled: true, authResponse: payload.authenticationResponse };
    }

    /**
     * Handle user status (typing, online/offline)
     */
    async handleUserStatus(tenantId, agentDbId, payload) {
        // Emit status event via WebSocket
        console.log(`[Google] User status: ${payload.userStatus.status} for ${payload.conversationId}`);
        return { handled: true };
    }

    /**
     * Handle receipts (delivered, read)
     */
    async handleReceipts(tenantId, agentDbId, payload) {
        for (const receipt of payload.receipts) {
            const status = receipt.receiptType === 'READ' ? 'read' : 'delivered';
            const timeField = receipt.receiptType === 'READ' ? 'read_at' : 'delivered_at';

            await pool.query(
                `UPDATE google_business_messages
                 SET status = $1, ${timeField} = NOW()
                 WHERE message_id = $2`,
                [status, receipt.message]
            );
        }
        return { handled: true };
    }

    /**
     * Handle survey response (CSAT)
     */
    async handleSurveyResponse(tenantId, agentDbId, payload) {
        const conversationId = payload.conversationId;

        await pool.query(
            `UPDATE google_business_conversations
             SET survey_response = $1, updated_at = NOW()
             WHERE agent_id = $2 AND conversation_id = $3`,
            [JSON.stringify(payload.surveyResponse), agentDbId, conversationId]
        );

        return { handled: true };
    }

    /**
     * Find conversation
     */
    async findConversation(agentDbId, conversationId) {
        const result = await pool.query(
            `SELECT * FROM google_business_conversations
             WHERE agent_id = $1 AND conversation_id = $2`,
            [agentDbId, conversationId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create conversation
     */
    async createConversation(tenantId, agentDbId, data) {
        const result = await pool.query(
            `INSERT INTO google_business_conversations (
                tenant_id, agent_id, conversation_id, entry_point,
                user_device_locale, user_timezone
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                tenantId,
                agentDbId,
                data.conversationId,
                data.entryPoint,
                data.userDeviceLocale,
                data.userTimezone
            ]
        );
        return result.rows[0];
    }

    /**
     * Store message
     */
    async storeMessage(tenantId, conversationId, data) {
        const result = await pool.query(
            `INSERT INTO google_business_messages (
                tenant_id, conversation_id, message_id, reply_to_message_id,
                direction, sender_type, message_type, content, attachments,
                rich_card, suggestions, auth_data, event_type, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                tenantId,
                conversationId,
                data.messageId,
                data.replyToMessageId,
                data.direction,
                data.senderType,
                data.messageType,
                data.content,
                JSON.stringify(data.attachments || []),
                data.richCard ? JSON.stringify(data.richCard) : null,
                JSON.stringify(data.suggestions || []),
                data.authData ? JSON.stringify(data.authData) : null,
                data.eventType,
                data.direction === 'inbound' ? 'delivered' : 'pending'
            ]
        );
        return result.rows[0];
    }

    /**
     * Send text message
     */
    async sendTextMessage(agentDbId, conversationId, text, suggestions = [], agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.agent_id as google_agent_id, a.service_account_key_encrypted, a.tenant_id
             FROM google_business_conversations c
             JOIN google_business_agents a ON c.agent_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        // In production, send to Google Business Messages API
        // await this.callGoogleAPI(conv.google_agent_id, conv.conversation_id, {
        //   messageId,
        //   representative: { representativeType: 'HUMAN' },
        //   text,
        //   suggestions
        // });

        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: agentId ? 'agent' : 'bot',
            messageType: 'text',
            content: text,
            suggestions
        });

        await pool.query(
            `UPDATE google_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send rich card
     */
    async sendRichCard(agentDbId, conversationId, richCard, suggestions = [], agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM google_business_conversations c
             JOIN google_business_agents a ON c.agent_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: agentId ? 'agent' : 'bot',
            messageType: 'rich_card',
            richCard,
            suggestions
        });

        await pool.query(
            `UPDATE google_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send carousel
     */
    async sendCarousel(agentDbId, conversationId, cards, agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM google_business_conversations c
             JOIN google_business_agents a ON c.agent_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: agentId ? 'agent' : 'bot',
            messageType: 'carousel',
            richCard: { carouselCard: { cardContents: cards } }
        });

        await pool.query(
            `UPDATE google_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send typing indicator
     */
    async sendTypingIndicator(agentDbId, conversationId, isTyping = true) {
        // In production, send TYPING_STARTED or TYPING_STOPPED event
        console.log(`[Google] Sending typing indicator: ${isTyping}`);
        return { sent: true };
    }

    /**
     * Request authentication
     */
    async requestAuthentication(agentDbId, conversationId, authRequest) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM google_business_conversations c
             JOIN google_business_agents a ON c.agent_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: 'bot',
            messageType: 'authentication',
            authData: authRequest
        });

        return message;
    }

    /**
     * Get conversations for agent
     */
    async getConversations(agentDbId, tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT c.*, l.location_name
            FROM google_business_conversations c
            LEFT JOIN google_business_locations l ON c.location_id = l.id
            WHERE c.agent_id = $1 AND c.tenant_id = $2
        `;
        const params = [agentDbId, tenantId];

        if (status) {
            query += ` AND c.status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Get messages for conversation
     */
    async getMessages(conversationId, options = {}) {
        const { limit = 50, offset = 0 } = options;

        const result = await pool.query(
            `SELECT * FROM google_business_messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [conversationId, limit, offset]
        );

        return result.rows;
    }

    /**
     * Create template
     */
    async createTemplate(tenantId, agentDbId, templateData) {
        const result = await pool.query(
            `INSERT INTO google_business_templates (
                tenant_id, agent_id, name, template_type, content
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                tenantId,
                agentDbId,
                templateData.name,
                templateData.templateType,
                JSON.stringify(templateData.content)
            ]
        );
        return result.rows[0];
    }

    /**
     * Get templates
     */
    async getTemplates(tenantId, agentDbId = null) {
        let query = `SELECT * FROM google_business_templates WHERE tenant_id = $1`;
        const params = [tenantId];

        if (agentDbId) {
            query += ` AND agent_id = $2`;
            params.push(agentDbId);
        }

        query += ` ORDER BY name`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * List agents for tenant (alias for routes)
     */
    async listAgents(tenantId) {
        return this.getAgents(tenantId);
    }

    /**
     * List conversations for tenant
     */
    async listConversations(tenantId, options = {}) {
        const { agentId, status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT c.*, a.agent_name, l.location_name
            FROM google_business_conversations c
            JOIN google_business_agents a ON c.agent_id = a.agent_id
            LEFT JOIN google_business_locations l ON c.location_id = l.id
            WHERE c.tenant_id = $1
        `;
        const params = [tenantId];

        if (agentId) {
            query += ` AND c.agent_id = $${params.length + 1}`;
            params.push(agentId);
        }

        if (status) {
            query += ` AND c.status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * List templates for tenant
     */
    async listTemplates(tenantId, options = {}) {
        const { category, limit = 50, offset = 0 } = options;

        let query = `SELECT * FROM google_business_templates WHERE tenant_id = $1`;
        const params = [tenantId];

        if (category) {
            query += ` AND category = $${params.length + 1}`;
            params.push(category);
        }

        query += ` ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Save template (create or update)
     */
    async saveTemplate(tenantId, data) {
        const { id, name, category, templateType, content, suggestions, variables } = data;

        if (id) {
            const result = await pool.query(
                `UPDATE google_business_templates
                 SET name = $1, category = $2, template_type = $3, content = $4, suggestions = $5, variables = $6, updated_at = NOW()
                 WHERE id = $7 AND tenant_id = $8
                 RETURNING *`,
                [name, category, templateType, JSON.stringify(content), JSON.stringify(suggestions || []), JSON.stringify(variables || []), id, tenantId]
            );
            return result.rows[0];
        } else {
            const result = await pool.query(
                `INSERT INTO google_business_templates (tenant_id, name, category, template_type, content, suggestions, variables)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [tenantId, name, category, templateType, JSON.stringify(content), JSON.stringify(suggestions || []), JSON.stringify(variables || [])]
            );
            return result.rows[0];
        }
    }

    /**
     * Send template message
     */
    async sendTemplate(tenantId, conversationId, templateId, variables = {}) {
        const template = await pool.query(
            `SELECT * FROM google_business_templates WHERE id = $1 AND tenant_id = $2`,
            [templateId, tenantId]
        );

        if (!template.rows[0]) {
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

        // Get agent for conversation
        const conversation = await pool.query(
            `SELECT c.*, a.id as agent_db_id FROM google_business_conversations c
             JOIN google_business_agents a ON c.agent_id = a.agent_id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const agentDbId = conversation.rows[0].agent_db_id;

        // Send based on template type
        switch (tmpl.template_type) {
            case 'text':
                return this.sendTextMessage(agentDbId, conversationId, content.text || content, { suggestions: tmpl.suggestions });
            case 'rich_card':
                return this.sendRichCard(agentDbId, conversationId, content);
            case 'carousel':
                return this.sendCarousel(agentDbId, conversationId, content.cards || []);
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
            ? `AND m.created_at BETWEEN '${startDate}' AND '${endDate}'`
            : '';

        const agentFilter = agentId
            ? `AND c.agent_id = '${agentId}'`
            : '';

        // Message stats
        const messageStats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE m.direction = 'outbound') as sent,
                COUNT(*) FILTER (WHERE m.direction = 'inbound') as received,
                COUNT(*) FILTER (WHERE m.status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE m.status = 'read') as read,
                COUNT(*) FILTER (WHERE m.status = 'failed') as failed
            FROM google_business_messages m
            JOIN google_business_conversations c ON m.conversation_id = c.id
            WHERE m.tenant_id = $1 ${dateFilter} ${agentFilter}
        `, [tenantId]);

        // Conversation stats
        const convStats = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'closed') as closed
            FROM google_business_conversations
            WHERE tenant_id = $1 ${agentFilter}
        `, [tenantId]);

        // Entry point breakdown
        const entryPoints = await pool.query(`
            SELECT
                entry_point,
                COUNT(*) as count
            FROM google_business_conversations
            WHERE tenant_id = $1 ${agentFilter}
            GROUP BY entry_point
            ORDER BY count DESC
        `, [tenantId]);

        // Daily trends
        const trends = await pool.query(`
            SELECT
                DATE(m.created_at) as date,
                COUNT(*) as messages,
                COUNT(*) FILTER (WHERE m.direction = 'outbound') as sent,
                COUNT(*) FILTER (WHERE m.direction = 'inbound') as received
            FROM google_business_messages m
            WHERE m.tenant_id = $1 ${dateFilter}
            GROUP BY DATE(m.created_at)
            ORDER BY date DESC
            LIMIT 30
        `, [tenantId]);

        return {
            messages: messageStats.rows[0],
            conversations: convStats.rows[0],
            entryPoints: entryPoints.rows,
            trends: trends.rows
        };
    }

    /**
     * Encrypt sensitive data
     */
    encrypt(text) {
        const key = process.env.BUSINESS_MESSAGING_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    /**
     * Decrypt sensitive data
     */
    decrypt(text) {
        const key = process.env.BUSINESS_MESSAGING_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
}

export default new GoogleBusinessService();
