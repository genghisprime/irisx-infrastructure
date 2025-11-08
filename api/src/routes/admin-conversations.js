/**
 * Admin Conversation Management Routes
 * IRISX staff oversight of unified inbox across all tenants
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminConversations = new Hono();

// All routes require admin authentication
adminConversations.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const assignConversationSchema = z.object({
  agent_id: z.number().int().positive()
});

const bulkCloseSchema = z.object({
  conversation_ids: z.array(z.number().int().positive()).min(1).max(100)
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAdminAction(adminId, action, resourceType, resourceId, changes, req) {
  await pool.query(
    `INSERT INTO admin_audit_log (
      admin_user_id, action, resource_type, resource_id, changes, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId,
      action,
      resourceType,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown'
    ]
  );
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /admin/conversations
 * Search conversations across all tenants
 */
adminConversations.get('/', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const tenant_id = c.req.query('tenant_id');
    const channel = c.req.query('channel'); // sms, email, whatsapp, discord, slack, telegram, teams, voice
    const status = c.req.query('status'); // open, pending, closed, snoozed
    const priority = c.req.query('priority'); // urgent, high, normal, low
    const sla_breached = c.req.query('sla_breached'); // true/false
    const search = c.req.query('search'); // search by customer identifier or last message

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = ['c.deleted_at IS NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`c.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (channel) {
      whereConditions.push(`c.channel = $${paramIndex}`);
      queryParams.push(channel);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`c.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (priority) {
      whereConditions.push(`c.priority = $${paramIndex}`);
      queryParams.push(priority);
      paramIndex++;
    }

    if (sla_breached === 'true') {
      whereConditions.push('c.sla_breached = true');
    }

    if (search) {
      whereConditions.push(`(c.customer_identifier ILIKE $${paramIndex} OR c.last_message_preview ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM conversations c
       WHERE ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);

    // Get conversations
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT
        c.id,
        c.tenant_id,
        t.name as tenant_name,
        c.channel,
        c.customer_identifier,
        c.customer_name,
        c.status,
        c.priority,
        c.assigned_agent_id,
        u.first_name || ' ' || u.last_name as assigned_agent_name,
        c.message_count,
        c.unread_count,
        c.last_message_preview,
        c.last_message_at,
        c.sla_due_at,
        c.sla_breached,
        c.first_response_at,
        c.created_at,
        c.updated_at
       FROM conversations c
       JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN users u ON c.assigned_agent_id = u.id
       WHERE ${whereClause}
       ORDER BY c.updated_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.conversations.list', null, null, { filters: { tenant_id, channel, status } }, c.req);

    return c.json({
      conversations: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('List conversations error:', err);
    return c.json({ error: 'Failed to list conversations' }, 500);
  }
});

/**
 * GET /admin/conversations/:id
 * View conversation details and messages
 */
adminConversations.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Get conversation
    const convResult = await pool.query(
      `SELECT
        c.*,
        t.name as tenant_name,
        u.first_name || ' ' || u.last_name as assigned_agent_name,
        u.email as assigned_agent_email
       FROM conversations c
       JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN users u ON c.assigned_agent_id = u.id
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [id]
    );

    if (convResult.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const conversation = convResult.rows[0];

    // Get messages
    const messagesResult = await pool.query(
      `SELECT
        cm.id,
        cm.content,
        cm.direction,
        cm.sender_name,
        cm.is_internal_note,
        cm.attachments,
        cm.status,
        cm.created_at
       FROM conversation_messages cm
       WHERE cm.conversation_id = $1
       ORDER BY cm.created_at ASC`,
      [id]
    );

    await logAdminAction(admin.id, 'admin.conversation.view', 'conversation', id, null, c.req);

    return c.json({
      conversation,
      messages: messagesResult.rows
    });

  } catch (err) {
    console.error('Get conversation error:', err);
    return c.json({ error: 'Failed to get conversation' }, 500);
  }
});

/**
 * PATCH /admin/conversations/:id/assign
 * Reassign conversation to different agent
 */
adminConversations.patch('/:id/assign', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can reassign
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = assignConversationSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { agent_id } = validation.data;

    // Check if conversation exists
    const convCheck = await pool.query(
      'SELECT id, tenant_id, assigned_agent_id FROM conversations WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (convCheck.rows.length === 0) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const conversation = convCheck.rows[0];

    // Check if agent exists and belongs to same tenant
    const agentCheck = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [agent_id, conversation.tenant_id]
    );

    if (agentCheck.rows.length === 0) {
      return c.json({ error: 'Agent not found or does not belong to this tenant' }, 404);
    }

    // Reassign conversation
    await pool.query(
      'UPDATE conversations SET assigned_agent_id = $1, assigned_at = NOW(), assigned_by = $2, updated_at = NOW() WHERE id = $3',
      [agent_id, admin.id, id]
    );

    // Create assignment record
    await pool.query(
      `INSERT INTO conversation_assignments (
        conversation_id, agent_id, assigned_by_id, assignment_method, assigned_at
      ) VALUES ($1, $2, $3, 'manual', NOW())`,
      [id, agent_id, admin.id]
    );

    await logAdminAction(admin.id, 'admin.conversation.reassign', 'conversation', id, {
      old_agent: conversation.assigned_agent_id,
      new_agent: agent_id
    }, c.req);

    return c.json({
      success: true,
      message: 'Conversation reassigned successfully'
    });

  } catch (err) {
    console.error('Reassign conversation error:', err);
    return c.json({ error: 'Failed to reassign conversation' }, 500);
  }
});

/**
 * POST /admin/conversations/bulk-close
 * Bulk close multiple conversations
 */
adminConversations.post('/bulk-close', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can bulk close
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = bulkCloseSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { conversation_ids } = validation.data;

    // Update all conversations to closed
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND deleted_at IS NULL AND status != 'closed'
       RETURNING id`,
      [conversation_ids]
    );

    const closedCount = result.rows.length;

    await logAdminAction(admin.id, 'admin.conversations.bulk_close', null, null, {
      conversation_ids,
      count: closedCount
    }, c.req);

    return c.json({
      success: true,
      message: `${closedCount} conversations closed`,
      closed_ids: result.rows.map(r => r.id)
    });

  } catch (err) {
    console.error('Bulk close conversations error:', err);
    return c.json({ error: 'Failed to bulk close conversations' }, 500);
  }
});

/**
 * GET /admin/conversations/sla-breaches
 * Get SLA breach report
 */
adminConversations.get('/sla-breaches', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const tenant_id = c.req.query('tenant_id');
    const channel = c.req.query('channel');

    let whereConditions = ['c.deleted_at IS NULL', 'c.sla_breached = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`c.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (channel) {
      whereConditions.push(`c.channel = $${paramIndex}`);
      queryParams.push(channel);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await pool.query(
      `SELECT
        c.id,
        c.tenant_id,
        t.name as tenant_name,
        c.channel,
        c.customer_identifier,
        c.customer_name,
        c.status,
        c.priority,
        c.assigned_agent_id,
        u.first_name || ' ' || u.last_name as assigned_agent_name,
        c.sla_due_at,
        c.created_at,
        EXTRACT(EPOCH FROM (NOW() - c.sla_due_at)) as breach_seconds
       FROM conversations c
       JOIN tenants t ON c.tenant_id = t.id
       LEFT JOIN users u ON c.assigned_agent_id = u.id
       WHERE ${whereClause}
       ORDER BY c.sla_due_at ASC
       LIMIT 100`,
      queryParams
    );

    // Get summary stats
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) as total_breaches,
        COUNT(*) FILTER (WHERE status = 'open') as open_breaches,
        COUNT(DISTINCT tenant_id) as affected_tenants,
        AVG(EXTRACT(EPOCH FROM (NOW() - sla_due_at))) as avg_breach_seconds
       FROM conversations
       WHERE deleted_at IS NULL AND sla_breached = true`,
      []
    );

    await logAdminAction(admin.id, 'admin.conversations.sla_breaches', null, null, { filters: { tenant_id, channel } }, c.req);

    return c.json({
      breaches: result.rows,
      summary: statsResult.rows[0]
    });

  } catch (err) {
    console.error('Get SLA breaches error:', err);
    return c.json({ error: 'Failed to get SLA breach report' }, 500);
  }
});

/**
 * GET /admin/conversations/stats
 * Get conversation statistics
 */
adminConversations.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');
    const tenant_id = c.req.query('tenant_id');

    let whereClause = 'deleted_at IS NULL';
    let queryParams = [];

    if (tenant_id) {
      whereClause += ' AND tenant_id = $1';
      queryParams.push(tenant_id);
    }

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE status = 'open') as open_conversations,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_conversations,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_conversations,
        COUNT(*) FILTER (WHERE status = 'snoozed') as snoozed_conversations,
        COUNT(*) FILTER (WHERE sla_breached = true) as sla_breaches,
        COUNT(*) FILTER (WHERE assigned_agent_id IS NULL) as unassigned,
        AVG(message_count) as avg_messages_per_conversation,
        AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) FILTER (WHERE first_response_at IS NOT NULL) as avg_first_response_seconds
       FROM conversations
       WHERE ${whereClause}`,
      queryParams
    );

    // Get by channel
    const channelResult = await pool.query(
      `SELECT
        channel,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'open') as open_count
       FROM conversations
       WHERE ${whereClause}
       GROUP BY channel
       ORDER BY count DESC`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.conversations.stats', null, null, { tenant_id }, c.req);

    return c.json({
      summary: result.rows[0],
      by_channel: channelResult.rows
    });

  } catch (err) {
    console.error('Get conversation stats error:', err);
    return c.json({ error: 'Failed to get conversation stats' }, 500);
  }
});

export default adminConversations;
