/**
 * Conversation Service
 * Auto-creates and manages conversations across all channels
 * Part of Unified Inbox implementation
 */

import pool from '../config/database.js';

/**
 * Find or create a conversation for an inbound message
 * @param {Object} params - Conversation parameters
 * @param {number} params.tenantId - Tenant ID
 * @param {string} params.channel - Channel name (sms, email, whatsapp, discord, slack, telegram, teams, voice)
 * @param {string} params.customerIdentifier - Customer phone, email, or username
 * @param {string} params.customerName - Customer display name (optional)
 * @param {string} params.subject - Conversation subject (optional)
 * @param {string} params.lastMessagePreview - Preview of last message
 * @param {string} params.lastMessageDirection - 'inbound' or 'outbound'
 * @param {number} params.customerId - Contact ID if exists (optional)
 * @param {string} params.channelConversationId - External conversation ID (optional)
 * @returns {Promise<number>} Conversation ID
 */
export async function findOrCreateConversation({
  tenantId,
  channel,
  customerIdentifier,
  customerName = null,
  subject = null,
  lastMessagePreview,
  lastMessageDirection = 'inbound',
  customerId = null,
  channelConversationId = null
}) {
  try {
    // Try to find existing open/pending conversation for this customer on this channel
    const findQuery = `
      SELECT id
      FROM conversations
      WHERE tenant_id = $1
        AND channel = $2
        AND customer_identifier = $3
        AND status IN ('open', 'pending', 'snoozed')
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const { rows: existingConversations } = await pool.query(findQuery, [
      tenantId,
      channel,
      customerIdentifier
    ]);

    if (existingConversations.length > 0) {
      const conversationId = existingConversations[0].id;

      // Update conversation with latest message info
      await pool.query(
        `UPDATE conversations
         SET last_message_at = NOW(),
             last_message_preview = $1,
             last_message_direction = $2,
             message_count = message_count + 1,
             customer_message_count = customer_message_count + CASE WHEN $2 = 'inbound' THEN 1 ELSE 0 END,
             unread_count = unread_count + CASE WHEN $2 = 'inbound' THEN 1 ELSE 0 END,
             updated_at = NOW()
         WHERE id = $3`,
        [lastMessagePreview, lastMessageDirection, conversationId]
      );

      console.log(`  ✅ Updated existing conversation ${conversationId} for ${channel}:${customerIdentifier}`);
      return conversationId;
    }

    // No existing conversation found, create new one
    const insertQuery = `
      INSERT INTO conversations (
        tenant_id,
        channel,
        customer_id,
        customer_identifier,
        customer_name,
        subject,
        channel_conversation_id,
        status,
        priority,
        last_message_at,
        last_message_preview,
        last_message_direction,
        message_count,
        customer_message_count,
        unread_count,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', 'normal', NOW(), $8, $9, 1, 1, 1, NOW(), NOW())
      RETURNING id
    `;

    const { rows: newConversation } = await pool.query(insertQuery, [
      tenantId,
      channel,
      customerId,
      customerIdentifier,
      customerName || customerIdentifier,
      subject || `${channel.charAt(0).toUpperCase() + channel.slice(1)} conversation`,
      channelConversationId,
      lastMessagePreview,
      lastMessageDirection
    ]);

    const conversationId = newConversation[0].id;

    console.log(`  ✨ Created new conversation ${conversationId} for ${channel}:${customerIdentifier}`);

    // Auto-assign to agent using round-robin
    try {
      await autoAssignConversation(conversationId, tenantId, channel);
    } catch (error) {
      console.error(`  ⚠️  Failed to auto-assign conversation ${conversationId}:`, error.message);
      // Don't fail the conversation creation if assignment fails
    }

    return conversationId;
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    throw error;
  }
}

/**
 * Add a message to a conversation
 * @param {Object} params - Message parameters
 * @param {number} params.conversationId - Conversation ID
 * @param {string} params.direction - 'inbound' or 'outbound'
 * @param {string} params.senderType - 'customer', 'agent', 'system', 'bot'
 * @param {string} params.content - Message text content
 * @param {string} params.contentHtml - Message HTML content (optional)
 * @param {Array} params.attachments - Array of attachment objects (optional)
 * @param {string} params.channelMessageId - Link to channel-specific message ID
 * @param {string} params.status - Message status (optional)
 * @param {boolean} params.isInternalNote - Internal note flag (optional)
 * @returns {Promise<number>} Message ID
 */
export async function addMessageToConversation({
  conversationId,
  direction,
  senderType = 'customer',
  content,
  contentHtml = null,
  attachments = null,
  channelMessageId = null,
  status = 'delivered',
  isInternalNote = false
}) {
  try {
    const insertQuery = `
      INSERT INTO conversation_messages (
        conversation_id,
        direction,
        sender_type,
        content,
        content_html,
        attachments,
        channel_message_id,
        status,
        is_internal_note,
        read_by_agent,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
      RETURNING id
    `;

    const attachmentsJson = attachments ? JSON.stringify(attachments) : null;

    const { rows } = await pool.query(insertQuery, [
      conversationId,
      direction,
      senderType,
      content,
      contentHtml,
      attachmentsJson,
      channelMessageId,
      status,
      isInternalNote
    ]);

    const messageId = rows[0].id;

    console.log(`  💬 Added message ${messageId} to conversation ${conversationId} (${direction})`);

    return messageId;
  } catch (error) {
    console.error('Error in addMessageToConversation:', error);
    throw error;
  }
}

/**
 * Auto-assign conversation to an agent using round-robin
 * @param {number} conversationId - Conversation ID
 * @param {number} tenantId - Tenant ID
 * @param {string} channel - Channel name
 * @returns {Promise<void>}
 */
async function autoAssignConversation(conversationId, tenantId, channel) {
  try {
    // Try to get next agent using the database function
    const { rows } = await pool.query(
      `SELECT get_next_round_robin_agent($1, $2) AS agent_id`,
      [tenantId, channel]
    );

    const agentId = rows[0]?.agent_id;

    if (agentId) {
      // Assign conversation to agent
      await pool.query(
        `UPDATE conversations
         SET assigned_agent_id = $1,
             assigned_at = NOW(),
             assigned_by = 'round-robin'
         WHERE id = $2`,
        [agentId, conversationId]
      );

      console.log(`  👤 Auto-assigned conversation ${conversationId} to agent ${agentId}`);
    } else {
      console.log(`  ⚠️  No available agents for auto-assignment (tenant: ${tenantId}, channel: ${channel})`);
    }
  } catch (error) {
    console.error('Error in autoAssignConversation:', error);
    throw error;
  }
}

/**
 * Close a conversation
 * @param {number} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export async function closeConversation(conversationId) {
  await pool.query(
    `UPDATE conversations
     SET status = 'closed',
         closed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  console.log(`  ✅ Closed conversation ${conversationId}`);
}

/**
 * Reopen a conversation
 * @param {number} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export async function reopenConversation(conversationId) {
  await pool.query(
    `UPDATE conversations
     SET status = 'open',
         closed_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  console.log(`  ✅ Reopened conversation ${conversationId}`);
}

/**
 * Update conversation priority
 * @param {number} conversationId - Conversation ID
 * @param {string} priority - Priority level ('urgent', 'high', 'normal', 'low')
 * @returns {Promise<void>}
 */
export async function updateConversationPriority(conversationId, priority) {
  await pool.query(
    `UPDATE conversations
     SET priority = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [priority, conversationId]
  );

  console.log(`  🔥 Updated conversation ${conversationId} priority to ${priority}`);
}

/**
 * Find customer ID by identifier (phone, email, username)
 * @param {number} tenantId - Tenant ID
 * @param {string} identifier - Customer identifier
 * @param {string} channel - Channel name
 * @returns {Promise<number|null>} Customer ID or null
 */
export async function findCustomerByIdentifier(tenantId, identifier, channel) {
  try {
    // Try to find in contacts table based on channel
    let query;
    let params;

    if (channel === 'sms' || channel === 'whatsapp' || channel === 'voice') {
      // Search by phone number
      query = `
        SELECT id
        FROM contacts
        WHERE tenant_id = $1
          AND phone = $2
        LIMIT 1
      `;
      params = [tenantId, identifier];
    } else if (channel === 'email') {
      // Search by email
      query = `
        SELECT id
        FROM contacts
        WHERE tenant_id = $1
          AND email = $2
        LIMIT 1
      `;
      params = [tenantId, identifier];
    } else {
      // For social channels, search in metadata or by name
      return null; // Not implemented yet
    }

    const { rows } = await pool.query(query, params);

    if (rows.length > 0) {
      return rows[0].id;
    }

    return null;
  } catch (error) {
    console.error('Error finding customer:', error);
    return null;
  }
}
