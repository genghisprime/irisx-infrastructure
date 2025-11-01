/**
 * Conversations API Routes - Unified Inbox
 * Cross-channel conversation management for SMS, Email, WhatsApp, Social
 *
 * Endpoints:
 * - GET    /v1/conversations         - List conversations (inbox)
 * - GET    /v1/conversations/:id     - Get conversation details + messages
 * - POST   /v1/conversations/:id/messages - Send message/reply
 * - PATCH  /v1/conversations/:id/assign   - Assign to agent
 * - PATCH  /v1/conversations/:id/status   - Update status
 * - PATCH  /v1/conversations/:id          - Update conversation (priority, tags, etc.)
 * - DELETE /v1/conversations/:id          - Delete/archive conversation
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { query } from '../db/connection.js'
import { authenticateJWT } from '../middleware/authMiddleware.js'

const router = new Hono()

// ============================================================================
// Validation Schemas
// ============================================================================

const listConversationsSchema = z.object({
  channel: z.enum(['sms', 'email', 'whatsapp', 'discord', 'slack', 'telegram', 'teams', 'voice', 'all']).optional(),
  status: z.enum(['open', 'pending', 'closed', 'snoozed', 'all']).optional().default('open'),
  priority: z.enum(['urgent', 'high', 'normal', 'low', 'all']).optional(),
  assigned_to: z.enum(['me', 'unassigned', 'all']).optional().default('me'),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(50),
  search: z.string().optional()
})

const sendMessageSchema = z.object({
  content: z.string().min(1),
  content_type: z.enum(['text', 'image', 'file', 'audio', 'video']).optional().default('text'),
  is_internal_note: z.boolean().optional().default(false),
  attachments: z.array(z.object({
    url: z.string(),
    filename: z.string(),
    type: z.string(),
    size: z.number()
  })).optional()
})

const assignConversationSchema = z.object({
  agent_id: z.number().int().positive().nullable()
})

const updateStatusSchema = z.object({
  status: z.enum(['open', 'pending', 'closed', 'snoozed']),
  snoozed_until: z.string().datetime().optional()
})

const updateConversationSchema = z.object({
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  subject: z.string().max(500).optional()
})

// ============================================================================
// GET /v1/conversations - List Conversations (Inbox)
// ============================================================================

router.get('/', authenticateJWT, async (c) => {
  try {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')

    // Parse and validate query parameters
    const params = {
      channel: c.req.query('channel') || 'all',
      status: c.req.query('status') || 'open',
      priority: c.req.query('priority') || 'all',
      assigned_to: c.req.query('assigned_to') || 'me',
      page: parseInt(c.req.query('page') || '1'),
      limit: parseInt(c.req.query('limit') || '50'),
      search: c.req.query('search')
    }

    const validated = listConversationsSchema.parse(params)

    // Build WHERE clause
    const conditions = ['c.tenant_id = $1', 'c.deleted_at IS NULL']
    const queryParams = [tenantId]
    let paramCount = 1

    // Filter by channel
    if (validated.channel !== 'all') {
      paramCount++
      conditions.push(`c.channel = $${paramCount}`)
      queryParams.push(validated.channel)
    }

    // Filter by status
    if (validated.status === 'all') {
      conditions.push(`c.status IN ('open', 'pending', 'closed')`)
    } else {
      paramCount++
      conditions.push(`c.status = $${paramCount}`)
      queryParams.push(validated.status)
    }

    // Filter by priority
    if (validated.priority !== 'all') {
      paramCount++
      conditions.push(`c.priority = $${paramCount}`)
      queryParams.push(validated.priority)
    }

    // Filter by assignment
    if (validated.assigned_to === 'me') {
      paramCount++
      conditions.push(`c.assigned_agent_id = $${paramCount}`)
      queryParams.push(userId)
    } else if (validated.assigned_to === 'unassigned') {
      conditions.push(`c.assigned_agent_id IS NULL`)
    }
    // 'all' = no filter

    // Search filter
    if (validated.search) {
      paramCount++
      conditions.push(`(
        c.subject ILIKE $${paramCount} OR
        c.customer_name ILIKE $${paramCount} OR
        c.customer_identifier ILIKE $${paramCount} OR
        c.last_message_preview ILIKE $${paramCount}
      )`)
      queryParams.push(`%${validated.search}%`)
    }

    const whereClause = conditions.join(' AND ')

    // Pagination
    const offset = (validated.page - 1) * validated.limit
    paramCount++
    const limitParam = paramCount
    paramCount++
    const offsetParam = paramCount
    queryParams.push(validated.limit, offset)

    // Get conversations
    const conversationsQuery = `
      SELECT
        c.id,
        c.uuid,
        c.channel,
        c.customer_identifier,
        c.customer_name,
        c.assigned_agent_id,
        CONCAT(u.first_name, ' ', u.last_name) as assigned_agent_name,
        c.status,
        c.priority,
        c.subject,
        c.last_message_at,
        c.last_message_preview,
        c.last_message_direction,
        c.message_count,
        c.unread_count,
        c.tags,
        c.category,
        c.sla_due_at,
        c.sla_breached,
        c.created_at,
        c.updated_at,
        EXTRACT(EPOCH FROM (NOW() - c.last_message_at))::INTEGER as seconds_since_last_message,
        CASE
          WHEN c.sla_due_at IS NOT NULL AND c.sla_due_at < NOW() AND c.sla_breached = false
          THEN true
          ELSE false
        END as is_overdue
      FROM conversations c
      LEFT JOIN users u ON c.assigned_agent_id = u.id
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN c.status = 'open' AND c.unread_count > 0 THEN 0 ELSE 1 END,
        c.priority DESC,
        c.updated_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `

    const conversations = await query(conversationsQuery, queryParams)

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM conversations c
      WHERE ${whereClause}
    `
    const countResult = await query(countQuery, queryParams.slice(0, -2)) // Remove limit/offset

    return c.json({
      success: true,
      conversations: conversations.rows,
      pagination: {
        page: validated.page,
        limit: validated.limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / validated.limit)
      }
    })

  } catch (error) {
    console.error('List conversations error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid query parameters', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to list conversations', message: error.message }, 500)
  }
})

// ============================================================================
// GET /v1/conversations/:id - Get Conversation Details + Messages
// ============================================================================

router.get('/:id', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')

    // Get conversation details
    const conversationQuery = `
      SELECT
        c.*,
        CONCAT(u.first_name, ' ', u.last_name) as assigned_agent_name,
        u.email as assigned_agent_email
      FROM conversations c
      LEFT JOIN users u ON c.assigned_agent_id = u.id
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
    `

    const conversationResult = await query(conversationQuery, [conversationId, tenantId])

    if (conversationResult.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    const conversation = conversationResult.rows[0]

    // Get messages
    const messagesQuery = `
      SELECT
        id,
        uuid,
        direction,
        sender_type,
        sender_name,
        sender_identifier,
        content_type,
        content,
        content_html,
        attachments,
        status,
        read_by_agent,
        read_by_agent_at,
        is_internal_note,
        created_at
      FROM conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `

    const messagesResult = await query(messagesQuery, [conversationId])

    // Mark unread messages as read by agent
    const userId = c.get('userId')
    if (conversation.assigned_agent_id === userId && conversation.unread_count > 0) {
      await query(`
        UPDATE conversation_messages
        SET read_by_agent = true, read_by_agent_at = NOW()
        WHERE conversation_id = $1
          AND direction = 'inbound'
          AND read_by_agent = false
      `, [conversationId])

      // Note: Trigger will auto-update unread_count in conversations table
    }

    return c.json({
      success: true,
      conversation,
      messages: messagesResult.rows
    })

  } catch (error) {
    console.error('Get conversation error:', error)
    return c.json({ error: 'Failed to get conversation', message: error.message }, 500)
  }
})

// ============================================================================
// POST /v1/conversations/:id/messages - Send Message/Reply
// ============================================================================

router.post('/:id/messages', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')

    const body = await c.req.json()
    const data = sendMessageSchema.parse(body)

    // Verify conversation exists and belongs to tenant
    const conversationResult = await query(
      'SELECT id, channel, customer_identifier FROM conversations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [conversationId, tenantId]
    )

    if (conversationResult.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    const conversation = conversationResult.rows[0]

    // Get user details
    const userResult = await query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [userId]
    )
    const user = userResult.rows[0]
    const senderName = `${user.first_name} ${user.last_name}`

    // Insert message
    const insertResult = await query(`
      INSERT INTO conversation_messages (
        conversation_id,
        direction,
        sender_type,
        sender_id,
        sender_name,
        sender_identifier,
        content_type,
        content,
        attachments,
        is_internal_note,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `, [
      conversationId,
      data.is_internal_note ? 'outbound' : 'outbound',
      data.is_internal_note ? 'system' : 'agent',
      userId,
      senderName,
      user.email,
      data.content_type,
      data.content,
      data.attachments ? JSON.stringify(data.attachments) : null,
      data.is_internal_note,
      data.is_internal_note ? 'sent' : 'queued' // Internal notes are instant, external queued for delivery
    ])

    const message = insertResult.rows[0]

    // If not internal note, send via channel (TODO: implement channel-specific sending)
    if (!data.is_internal_note) {
      // TODO: Queue message for channel-specific delivery
      // - SMS: Queue in sms_messages table
      // - Email: Queue in emails table
      // - WhatsApp: Queue in whatsapp_messages table
      // etc.

      console.log(`📤 TODO: Send message via ${conversation.channel} to ${conversation.customer_identifier}`)
    }

    return c.json({
      success: true,
      message,
      note: data.is_internal_note ? 'Internal note added' : 'Message queued for delivery'
    }, 201)

  } catch (error) {
    console.error('Send message error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to send message', message: error.message }, 500)
  }
})

// ============================================================================
// PATCH /v1/conversations/:id/assign - Assign to Agent
// ============================================================================

router.patch('/:id/assign', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')
    const assignedById = c.get('userId')

    const body = await c.req.json()
    const data = assignConversationSchema.parse(body)

    // Verify conversation exists
    const conversationCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [conversationId, tenantId]
    )

    if (conversationCheck.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    // If assigning to an agent, verify agent exists and belongs to tenant
    if (data.agent_id !== null) {
      const agentCheck = await query(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [data.agent_id, tenantId]
      )

      if (agentCheck.rows.length === 0) {
        return c.json({ error: 'Agent not found' }, 404)
      }
    }

    // Update assignment (trigger will log assignment change)
    const result = await query(`
      UPDATE conversations
      SET
        assigned_agent_id = $1,
        assigned_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END,
        assigned_by = 'manual',
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [data.agent_id, conversationId])

    return c.json({
      success: true,
      conversation: result.rows[0],
      message: data.agent_id ? 'Conversation assigned' : 'Conversation unassigned'
    })

  } catch (error) {
    console.error('Assign conversation error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to assign conversation', message: error.message }, 500)
  }
})

// ============================================================================
// PATCH /v1/conversations/:id/status - Update Status
// ============================================================================

router.patch('/:id/status', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')

    const body = await c.req.json()
    const data = updateStatusSchema.parse(body)

    // Verify conversation exists
    const conversationCheck = await query(
      'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [conversationId, tenantId]
    )

    if (conversationCheck.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    // Update status
    const result = await query(`
      UPDATE conversations
      SET
        status = $1,
        closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE NULL END,
        snoozed_until = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [data.status, data.snoozed_until || null, conversationId])

    return c.json({
      success: true,
      conversation: result.rows[0],
      message: `Conversation status updated to ${data.status}`
    })

  } catch (error) {
    console.error('Update status error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to update status', message: error.message }, 500)
  }
})

// ============================================================================
// PATCH /v1/conversations/:id - Update Conversation
// ============================================================================

router.patch('/:id', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')

    const body = await c.req.json()
    const data = updateConversationSchema.parse(body)

    // Build update query dynamically
    const updates = []
    const values = []
    let paramCount = 1

    if (data.priority) {
      updates.push(`priority = $${paramCount}`)
      values.push(data.priority)
      paramCount++
    }

    if (data.tags) {
      updates.push(`tags = $${paramCount}`)
      values.push(data.tags)
      paramCount++
    }

    if (data.category) {
      updates.push(`category = $${paramCount}`)
      values.push(data.category)
      paramCount++
    }

    if (data.subject) {
      updates.push(`subject = $${paramCount}`)
      values.push(data.subject)
      paramCount++
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    updates.push(`updated_at = NOW()`)
    values.push(conversationId, tenantId)

    const result = await query(`
      UPDATE conversations
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
      RETURNING *
    `, values)

    if (result.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    return c.json({
      success: true,
      conversation: result.rows[0],
      message: 'Conversation updated'
    })

  } catch (error) {
    console.error('Update conversation error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to update conversation', message: error.message }, 500)
  }
})

// ============================================================================
// DELETE /v1/conversations/:id - Delete/Archive Conversation
// ============================================================================

router.delete('/:id', authenticateJWT, async (c) => {
  try {
    const conversationId = c.req.param('id')
    const tenantId = c.get('tenantId')

    // Soft delete (set deleted_at timestamp)
    const result = await query(`
      UPDATE conversations
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      RETURNING id, customer_identifier
    `, [conversationId, tenantId])

    if (result.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    return c.json({
      success: true,
      message: 'Conversation deleted'
    })

  } catch (error) {
    console.error('Delete conversation error:', error)
    return c.json({ error: 'Failed to delete conversation', message: error.message }, 500)
  }
})

export default router
