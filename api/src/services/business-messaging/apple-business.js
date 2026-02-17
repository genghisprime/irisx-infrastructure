/**
 * Apple Business Messages Service
 * Handles Apple Business Chat/Messages integration
 */

import pool from '../../db/connection.js';
import crypto from 'crypto';

class AppleBusinessService {
    /**
     * Register a new Apple Business account
     */
    async registerAccount(tenantId, accountData) {
        const {
            businessId,
            businessName,
            mspId,
            apiKey,
            sharedSecret,
            webhookUrl,
            logoUrl,
            iconUrl,
            primaryColor,
            capabilities = ['messaging', 'rich_links', 'list_picker', 'time_picker']
        } = accountData;

        const result = await pool.query(
            `INSERT INTO apple_business_accounts (
                tenant_id, business_id, business_name, msp_id,
                api_key_encrypted, shared_secret_encrypted, webhook_url,
                logo_url, icon_url, primary_color, capabilities, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
            RETURNING *`,
            [
                tenantId,
                businessId,
                businessName,
                mspId,
                apiKey ? this.encrypt(apiKey) : null,
                sharedSecret ? this.encrypt(sharedSecret) : null,
                webhookUrl,
                logoUrl,
                iconUrl,
                primaryColor,
                JSON.stringify(capabilities)
            ]
        );

        return result.rows[0];
    }

    /**
     * Get Apple Business account
     */
    async getAccount(accountId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM apple_business_accounts
             WHERE id = $1 AND tenant_id = $2`,
            [accountId, tenantId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all accounts for tenant
     */
    async getAccounts(tenantId) {
        const result = await pool.query(
            `SELECT * FROM apple_business_accounts
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            [tenantId]
        );
        return result.rows;
    }

    /**
     * Update account
     */
    async updateAccount(accountId, tenantId, updates) {
        const allowedFields = [
            'business_name', 'msp_id', 'webhook_url', 'logo_url',
            'icon_url', 'primary_color', 'capabilities', 'status'
        ];

        const fields = [];
        const values = [accountId, tenantId];
        let paramIndex = 3;

        for (const [key, value] of Object.entries(updates)) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            if (allowedFields.includes(snakeKey)) {
                fields.push(`${snakeKey} = $${paramIndex}`);
                values.push(snakeKey === 'capabilities' ? JSON.stringify(value) : value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return this.getAccount(accountId, tenantId);
        }

        const result = await pool.query(
            `UPDATE apple_business_accounts
             SET ${fields.join(', ')}, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            values
        );

        return result.rows[0];
    }

    /**
     * Handle incoming webhook from Apple
     */
    async handleWebhook(accountId, payload) {
        const account = await pool.query(
            `SELECT * FROM apple_business_accounts WHERE id = $1`,
            [accountId]
        );

        if (!account.rows[0]) {
            throw new Error('Account not found');
        }

        const tenantId = account.rows[0].tenant_id;

        // Handle different message types
        if (payload.type === 'interactive') {
            return await this.handleInteractiveMessage(tenantId, accountId, payload);
        } else if (payload.type === 'text') {
            return await this.handleTextMessage(tenantId, accountId, payload);
        } else if (payload.type === 'typing') {
            return await this.handleTypingIndicator(tenantId, accountId, payload);
        } else if (payload.type === 'read') {
            return await this.handleReadReceipt(tenantId, accountId, payload);
        }

        return { handled: false };
    }

    /**
     * Handle incoming text message
     */
    async handleTextMessage(tenantId, accountId, payload) {
        // Find or create conversation
        let conversation = await this.findConversation(accountId, payload.conversationId);

        if (!conversation) {
            conversation = await this.createConversation(tenantId, accountId, {
                conversationId: payload.conversationId,
                sourceId: payload.sourceId,
                intent: payload.intent,
                customerId: payload.customerId,
                customerLocale: payload.locale,
                customerDeviceType: payload.deviceType
            });
        }

        // Store the message
        const message = await this.storeMessage(tenantId, conversation.id, {
            messageId: payload.id,
            direction: 'inbound',
            senderType: 'customer',
            senderId: payload.customerId,
            messageType: 'text',
            content: payload.body
        });

        // Update conversation last message time
        await pool.query(
            `UPDATE apple_business_conversations
             SET last_message_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [conversation.id]
        );

        return { conversation, message };
    }

    /**
     * Handle interactive message (list picker response, etc.)
     */
    async handleInteractiveMessage(tenantId, accountId, payload) {
        const conversation = await this.findConversation(accountId, payload.conversationId);

        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const message = await this.storeMessage(tenantId, conversation.id, {
            messageId: payload.id,
            direction: 'inbound',
            senderType: 'customer',
            senderId: payload.customerId,
            messageType: 'interactive',
            content: payload.interactiveData?.data?.listPicker?.item?.title || payload.body,
            interactiveData: payload.interactiveData
        });

        await pool.query(
            `UPDATE apple_business_conversations
             SET last_message_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [conversation.id]
        );

        return { conversation, message };
    }

    /**
     * Handle typing indicator
     */
    async handleTypingIndicator(tenantId, accountId, payload) {
        // Emit typing event via WebSocket (would integrate with WS service)
        console.log(`[Apple] Typing indicator from ${payload.conversationId}: ${payload.typing}`);
        return { handled: true };
    }

    /**
     * Handle read receipt
     */
    async handleReadReceipt(tenantId, accountId, payload) {
        if (payload.messageId) {
            await pool.query(
                `UPDATE apple_business_messages
                 SET status = 'read', read_at = NOW()
                 WHERE message_id = $1`,
                [payload.messageId]
            );
        }
        return { handled: true };
    }

    /**
     * Find conversation
     */
    async findConversation(accountId, conversationId) {
        const result = await pool.query(
            `SELECT * FROM apple_business_conversations
             WHERE account_id = $1 AND conversation_id = $2`,
            [accountId, conversationId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create conversation
     */
    async createConversation(tenantId, accountId, data) {
        const result = await pool.query(
            `INSERT INTO apple_business_conversations (
                tenant_id, account_id, conversation_id, source_id, intent,
                customer_id, customer_locale, customer_device_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                tenantId,
                accountId,
                data.conversationId,
                data.sourceId,
                data.intent,
                data.customerId,
                data.customerLocale,
                data.customerDeviceType
            ]
        );
        return result.rows[0];
    }

    /**
     * Store message
     */
    async storeMessage(tenantId, conversationId, data) {
        const result = await pool.query(
            `INSERT INTO apple_business_messages (
                tenant_id, conversation_id, message_id, source_id,
                direction, sender_type, sender_id, message_type,
                content, attachments, interactive_data, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                tenantId,
                conversationId,
                data.messageId,
                data.sourceId,
                data.direction,
                data.senderType,
                data.senderId,
                data.messageType,
                data.content,
                JSON.stringify(data.attachments || []),
                data.interactiveData ? JSON.stringify(data.interactiveData) : null,
                data.direction === 'inbound' ? 'delivered' : 'pending'
            ]
        );
        return result.rows[0];
    }

    /**
     * Send text message
     */
    async sendTextMessage(accountId, conversationId, text, agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.business_id, a.api_key_encrypted, a.tenant_id
             FROM apple_business_conversations c
             JOIN apple_business_accounts a ON c.account_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        // In production, send to Apple Business Messages API
        // const apiKey = this.decrypt(conv.api_key_encrypted);
        // await this.callAppleAPI(apiKey, conv.conversation_id, { type: 'text', body: text });

        // Store outbound message
        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: agentId ? 'agent' : 'bot',
            senderId: agentId,
            messageType: 'text',
            content: text
        });

        // Update message status to sent
        await pool.query(
            `UPDATE apple_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send rich link
     */
    async sendRichLink(accountId, conversationId, richLink, agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM apple_business_conversations c
             JOIN apple_business_accounts a ON c.account_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        // Store outbound message
        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: agentId ? 'agent' : 'bot',
            senderId: agentId,
            messageType: 'rich_link',
            content: richLink.title,
            interactiveData: richLink
        });

        await pool.query(
            `UPDATE apple_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send list picker
     */
    async sendListPicker(accountId, conversationId, listPicker, agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM apple_business_conversations c
             JOIN apple_business_accounts a ON c.account_id = a.id
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
            senderId: agentId,
            messageType: 'list_picker',
            content: listPicker.receivedMessage?.title || 'Please select',
            interactiveData: { listPicker }
        });

        await pool.query(
            `UPDATE apple_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Send time picker
     */
    async sendTimePicker(accountId, conversationId, timePicker, agentId = null) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM apple_business_conversations c
             JOIN apple_business_accounts a ON c.account_id = a.id
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
            senderId: agentId,
            messageType: 'time_picker',
            content: timePicker.receivedMessage?.title || 'Select a time',
            interactiveData: { timePicker }
        });

        await pool.query(
            `UPDATE apple_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Get conversations for account
     */
    async getConversations(accountId, tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT * FROM apple_business_conversations
            WHERE account_id = $1 AND tenant_id = $2
        `;
        const params = [accountId, tenantId];

        if (status) {
            query += ` AND status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
            `SELECT * FROM apple_business_messages
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
    async createTemplate(tenantId, accountId, templateData) {
        const result = await pool.query(
            `INSERT INTO apple_business_templates (
                tenant_id, account_id, name, template_type, content
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                tenantId,
                accountId,
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
    async getTemplates(tenantId, accountId = null) {
        let query = `SELECT * FROM apple_business_templates WHERE tenant_id = $1`;
        const params = [tenantId];

        if (accountId) {
            query += ` AND account_id = $2`;
            params.push(accountId);
        }

        query += ` ORDER BY name`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * List accounts for tenant (alias for routes)
     */
    async listAccounts(tenantId) {
        return this.getAccounts(tenantId);
    }

    /**
     * List conversations for tenant
     */
    async listConversations(tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT c.*, a.business_name
            FROM apple_business_conversations c
            JOIN apple_business_accounts a ON c.account_id = a.id
            WHERE c.tenant_id = $1
        `;
        const params = [tenantId];

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

        let query = `SELECT * FROM apple_business_templates WHERE tenant_id = $1`;
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
        const { id, name, category, templateType, content, variables } = data;

        if (id) {
            const result = await pool.query(
                `UPDATE apple_business_templates
                 SET name = $1, category = $2, template_type = $3, content = $4, variables = $5, updated_at = NOW()
                 WHERE id = $6 AND tenant_id = $7
                 RETURNING *`,
                [name, category, templateType, JSON.stringify(content), JSON.stringify(variables || []), id, tenantId]
            );
            return result.rows[0];
        } else {
            const result = await pool.query(
                `INSERT INTO apple_business_templates (tenant_id, name, category, template_type, content, variables)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [tenantId, name, category, templateType, JSON.stringify(content), JSON.stringify(variables || [])]
            );
            return result.rows[0];
        }
    }

    /**
     * Send template message
     */
    async sendTemplate(tenantId, conversationId, templateId, variables = {}) {
        const template = await pool.query(
            `SELECT * FROM apple_business_templates WHERE id = $1 AND tenant_id = $2`,
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

        // Send based on template type
        const conversation = await pool.query(
            `SELECT account_id FROM apple_business_conversations WHERE id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const accountId = conversation.rows[0].account_id;

        switch (tmpl.template_type) {
            case 'text':
                return this.sendTextMessage(accountId, conversationId, content.text || content);
            case 'rich_link':
                return this.sendRichLink(accountId, conversationId, content);
            case 'list_picker':
                return this.sendListPicker(accountId, conversationId, content);
            case 'time_picker':
                return this.sendTimePicker(accountId, conversationId, content);
            default:
                throw new Error(`Unsupported template type: ${tmpl.template_type}`);
        }
    }

    /**
     * Request Apple Pay payment
     */
    async requestApplePayPayment(tenantId, conversationId, paymentData) {
        const conversation = await pool.query(
            `SELECT c.*, a.tenant_id FROM apple_business_conversations c
             JOIN apple_business_accounts a ON c.account_id = a.id
             WHERE c.id = $1`,
            [conversationId]
        );

        if (!conversation.rows[0]) {
            throw new Error('Conversation not found');
        }

        const conv = conversation.rows[0];
        const messageId = crypto.randomUUID();

        const applePayRequest = {
            type: 'apple_pay',
            merchantIdentifier: paymentData.merchantIdentifier,
            supportedNetworks: paymentData.supportedNetworks || ['amex', 'discover', 'masterCard', 'visa'],
            merchantCapabilities: paymentData.merchantCapabilities || ['supports3DS', 'supportsCredit', 'supportsDebit'],
            countryCode: paymentData.countryCode || 'US',
            currencyCode: paymentData.currencyCode || 'USD',
            paymentSummaryItems: paymentData.items,
            requiredBillingContactFields: paymentData.requiredBillingFields || [],
            requiredShippingContactFields: paymentData.requiredShippingFields || []
        };

        const message = await this.storeMessage(conv.tenant_id, conversationId, {
            messageId,
            direction: 'outbound',
            senderType: 'bot',
            senderId: null,
            messageType: 'apple_pay',
            content: `Payment request: ${paymentData.currencyCode || 'USD'} ${paymentData.total}`,
            interactiveData: applePayRequest
        });

        await pool.query(
            `UPDATE apple_business_messages SET status = 'sent' WHERE id = $1`,
            [message.id]
        );

        return message;
    }

    /**
     * Get analytics
     */
    async getAnalytics(tenantId, options = {}) {
        const { startDate, endDate, businessId } = options;

        const dateFilter = startDate && endDate
            ? `AND m.created_at BETWEEN '${startDate}' AND '${endDate}'`
            : '';

        const businessFilter = businessId
            ? `AND a.business_id = '${businessId}'`
            : '';

        // Message stats
        const messageStats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE m.direction = 'outbound') as sent,
                COUNT(*) FILTER (WHERE m.direction = 'inbound') as received,
                COUNT(*) FILTER (WHERE m.status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE m.status = 'read') as read,
                COUNT(*) FILTER (WHERE m.status = 'failed') as failed
            FROM apple_business_messages m
            JOIN apple_business_conversations c ON m.conversation_id = c.id
            JOIN apple_business_accounts a ON c.account_id = a.id
            WHERE m.tenant_id = $1 ${dateFilter} ${businessFilter}
        `, [tenantId]);

        // Conversation stats
        const convStats = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE c.status = 'active') as active,
                COUNT(*) FILTER (WHERE c.status = 'closed') as closed
            FROM apple_business_conversations c
            JOIN apple_business_accounts a ON c.account_id = a.id
            WHERE c.tenant_id = $1 ${businessFilter}
        `, [tenantId]);

        // Daily trends
        const trends = await pool.query(`
            SELECT
                DATE(m.created_at) as date,
                COUNT(*) as messages,
                COUNT(*) FILTER (WHERE m.direction = 'outbound') as sent,
                COUNT(*) FILTER (WHERE m.direction = 'inbound') as received
            FROM apple_business_messages m
            WHERE m.tenant_id = $1 ${dateFilter}
            GROUP BY DATE(m.created_at)
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

export default new AppleBusinessService();
