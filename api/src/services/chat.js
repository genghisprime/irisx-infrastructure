import pool from '../db/connection.js';
import crypto from 'crypto';

/**
 * Chat Service
 * Manages chat conversations, messages, and agent assignments
 */

class ChatService {
  /**
   * Create a new chat widget
   * @param {Object} params - Widget configuration
   */
  async createWidget(params) {
    const {
      tenantId,
      name,
      description,
      primaryColor = '#667eea',
      widgetPosition = 'bottom-right',
      greetingMessage = 'Hi! How can we help you today?',
      createdBy
    } = params;

    const widgetKey = 'cw_' + crypto.randomBytes(16).toString('hex');

    const result = await pool.query(
      `INSERT INTO chat_widgets
       (tenant_id, widget_key, name, description, primary_color, widget_position, greeting_message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, widgetKey, name, description, primaryColor, widgetPosition, greetingMessage, createdBy]
    );

    return result.rows[0];
  }

  /**
   * Get widget by key (public method - no auth required)
   * @param {string} widgetKey - Widget key
   */
  async getWidgetByKey(widgetKey) {
    const result = await pool.query(
      `SELECT
         id, widget_key, primary_color, widget_position, greeting_message,
         offline_message, placeholder_text, show_agent_avatars,
         auto_open, auto_open_delay, show_launcher, allow_file_upload,
         max_file_size_mb, require_email, is_active
       FROM chat_widgets
       WHERE widget_key = $1 AND is_active = TRUE`,
      [widgetKey]
    );

    return result.rows[0] || null;
  }

  /**
   * Start a new chat conversation
   * @param {Object} params - Conversation parameters
   */
  async startConversation(params) {
    const {
      widgetId,
      tenantId,
      visitorId,
      visitorName,
      visitorEmail,
      visitorIp,
      visitorUserAgent,
      pageUrl,
      pageTitle,
      referrer
    } = params;

    const conversationId = 'cc_' + crypto.randomBytes(16).toString('hex');

    const result = await pool.query(
      `INSERT INTO chat_conversations
       (tenant_id, widget_id, conversation_id, visitor_id, visitor_name, visitor_email,
        visitor_ip, visitor_user_agent, page_url, page_title, referrer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [tenantId, widgetId, conversationId, visitorId, visitorName, visitorEmail,
       visitorIp, visitorUserAgent, pageUrl, pageTitle, referrer]
    );

    // Try to assign an available agent
    await this.autoAssignAgent(result.rows[0].id, tenantId);

    return result.rows[0];
  }

  /**
   * Auto-assign an available agent to conversation
   * @param {number} conversationId - Conversation ID
   * @param {number} tenantId - Tenant ID
   */
  async autoAssignAgent(conversationId, tenantId) {
    try {
      // Get available agent with lowest workload
      const agentResult = await pool.query(
        'SELECT * FROM get_available_chat_agents($1) LIMIT 1',
        [tenantId]
      );

      if (agentResult.rows.length === 0) {
        console.log('No available agents for auto-assignment');
        return null;
      }

      const agent = agentResult.rows[0];

      // Assign agent to conversation
      await pool.query(
        `UPDATE chat_conversations
         SET assigned_agent_id = $1, assigned_at = NOW()
         WHERE id = $2`,
        [agent.agent_id, conversationId]
      );

      // Update agent's active chat count
      await pool.query(
        `UPDATE chat_agent_presence
         SET active_chats = active_chats + 1, updated_at = NOW()
         WHERE agent_id = $1 AND tenant_id = $2`,
        [agent.agent_id, tenantId]
      );

      return agent;
    } catch (error) {
      console.error('Error auto-assigning agent:', error);
      return null;
    }
  }

  /**
   * Send a message in a conversation
   * @param {Object} params - Message parameters
   */
  async sendMessage(params) {
    const {
      conversationId,
      senderType,
      senderId,
      senderName,
      messageType = 'text',
      messageText,
      fileUrl,
      fileName,
      fileSize,
      fileType
    } = params;

    const messageId = 'cm_' + crypto.randomBytes(16).toString('hex');

    const result = await pool.query(
      `INSERT INTO chat_messages
       (conversation_id, message_id, sender_type, sender_id, sender_name,
        message_type, message_text, file_url, file_name, file_size, file_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [conversationId, messageId, senderType, senderId, senderName,
       messageType, messageText, fileUrl, fileName, fileSize, fileType]
    );

    return result.rows[0];
  }

  /**
   * Get conversation by ID
   * @param {string} conversationId - Conversation ID
   */
  async getConversation(conversationId) {
    const result = await pool.query(
      `SELECT c.*,
        w.widget_key, w.primary_color,
        u.first_name || ' ' || u.last_name as agent_name
       FROM chat_conversations c
       LEFT JOIN chat_widgets w ON c.widget_id = w.id
       LEFT JOIN users u ON c.assigned_agent_id = u.id
       WHERE c.conversation_id = $1`,
      [conversationId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get messages for a conversation
   * @param {number} conversationDbId - Conversation database ID
   * @param {Object} options - Query options
   */
  async getMessages(conversationDbId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await pool.query(
      `SELECT m.*,
        u.first_name || ' ' || u.last_name as sender_full_name
       FROM chat_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationDbId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get active conversations for an agent
   * @param {number} agentId - Agent ID
   * @param {number} tenantId - Tenant ID
   */
  async getAgentConversations(agentId, tenantId) {
    const result = await pool.query(
      `SELECT c.*,
        w.widget_key,
        (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND is_read = FALSE AND sender_type = 'visitor') as unread_count,
        (SELECT message_text FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_conversations c
       JOIN chat_widgets w ON c.widget_id = w.id
       WHERE c.assigned_agent_id = $1
         AND c.tenant_id = $2
         AND c.status = 'active'
       ORDER BY c.last_message_at DESC`,
      [agentId, tenantId]
    );

    return result.rows;
  }

  /**
   * Get unassigned conversations (for queue)
   * @param {number} tenantId - Tenant ID
   */
  async getUnassignedConversations(tenantId) {
    const result = await pool.query(
      `SELECT c.*,
        w.widget_key,
        (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count,
        (SELECT message_text FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_conversations c
       JOIN chat_widgets w ON c.widget_id = w.id
       WHERE c.assigned_agent_id IS NULL
         AND c.tenant_id = $1
         AND c.status = 'active'
       ORDER BY c.created_at ASC`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Mark messages as read
   * @param {number} conversationDbId - Conversation database ID
   * @param {string} senderType - Only mark messages from this sender type
   */
  async markMessagesAsRead(conversationDbId, senderType) {
    await pool.query(
      `UPDATE chat_messages
       SET is_read = TRUE, read_at = NOW()
       WHERE conversation_id = $1
         AND sender_type = $2
         AND is_read = FALSE`,
      [conversationDbId, senderType]
    );
  }

  /**
   * Close a conversation
   * @param {string} conversationId - Conversation ID
   */
  async closeConversation(conversationId) {
    const result = await pool.query(
      `UPDATE chat_conversations
       SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE conversation_id = $1
       RETURNING *`,
      [conversationId]
    );

    if (result.rows.length > 0 && result.rows[0].assigned_agent_id) {
      // Decrement agent's active chat count
      await pool.query(
        `UPDATE chat_agent_presence
         SET active_chats = GREATEST(active_chats - 1, 0), updated_at = NOW()
         WHERE agent_id = $1`,
        [result.rows[0].assigned_agent_id]
      );
    }

    return result.rows[0] || null;
  }

  /**
   * Rate a conversation
   * @param {string} conversationId - Conversation ID
   * @param {number} rating - Rating (1-5)
   * @param {string} feedback - Optional feedback text
   */
  async rateConversation(conversationId, rating, feedback) {
    const result = await pool.query(
      `UPDATE chat_conversations
       SET rating = $1, feedback = $2, rated_at = NOW(), updated_at = NOW()
       WHERE conversation_id = $3
       RETURNING *`,
      [rating, feedback, conversationId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update agent presence status
   * @param {number} agentId - Agent ID
   * @param {number} tenantId - Tenant ID
   * @param {string} status - Status (online, away, busy, offline)
   * @param {string} socketId - WebSocket connection ID
   */
  async updateAgentPresence(agentId, tenantId, status, socketId = null) {
    const result = await pool.query(
      `INSERT INTO chat_agent_presence (tenant_id, agent_id, status, socket_id, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, agent_id)
       DO UPDATE SET
         status = $3,
         socket_id = $4,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [tenantId, agentId, status, socketId]
    );

    return result.rows[0];
  }

  /**
   * Set typing indicator
   * @param {number} conversationDbId - Conversation database ID
   * @param {string} senderType - 'visitor' or 'agent'
   * @param {number} senderId - Agent ID (null for visitors)
   */
  async setTypingIndicator(conversationDbId, senderType, senderId = null) {
    await pool.query(
      `INSERT INTO chat_typing_indicators (conversation_id, sender_type, sender_id, is_typing, started_at, expires_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW() + INTERVAL '10 seconds')`,
      [conversationDbId, senderType, senderId]
    );

    // Clean up old indicators
    await pool.query('SELECT cleanup_expired_typing_indicators()');
  }

  /**
   * Get typing indicators for a conversation
   * @param {number} conversationDbId - Conversation database ID
   */
  async getTypingIndicators(conversationDbId) {
    const result = await pool.query(
      `SELECT sender_type, sender_id
       FROM chat_typing_indicators
       WHERE conversation_id = $1
         AND expires_at > NOW()`,
      [conversationDbId]
    );

    return result.rows;
  }

  /**
   * Get chat statistics for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async getChatStats(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_conversations,
         COUNT(*) FILTER (WHERE status = 'closed') as closed_conversations,
         COUNT(*) FILTER (WHERE rating IS NOT NULL) as rated_conversations,
         AVG(rating) FILTER (WHERE rating IS NOT NULL) as average_rating,
         AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) FILTER (WHERE first_response_at IS NOT NULL) as avg_first_response_seconds,
         AVG(EXTRACT(EPOCH FROM (closed_at - created_at))) FILTER (WHERE closed_at IS NOT NULL) as avg_resolution_seconds,
         SUM(message_count) as total_messages
       FROM chat_conversations
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at < $3 + INTERVAL '1 day'`,
      [tenantId, startDate, endDate]
    );

    return result.rows[0];
  }
}

export default new ChatService();
