import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminWhatsApp = new Hono();

adminWhatsApp.use('*', authenticateAdmin);

// Helper to format numbers
const formatNumber = (num) => {
  if (num === null || num === undefined) return 0;
  return parseFloat(num) || 0;
};

// ============================================================================
// GET /admin/whatsapp/stats - Dashboard statistics
// ============================================================================
adminWhatsApp.get('/stats', async (c) => {
  try {
    const [
      accountStats,
      messageStats,
      templateStats,
      recentActivity
    ] = await Promise.all([
      // Account statistics
      pool.query(`
        SELECT
          COUNT(*) as total_accounts,
          COUNT(*) FILTER (WHERE status = 'active') as active_accounts,
          COUNT(*) FILTER (WHERE verified = true) as verified_accounts,
          COUNT(DISTINCT tenant_id) as tenants_with_whatsapp
        FROM whatsapp_accounts
      `),

      // Message statistics (last 30 days)
      pool.query(`
        SELECT
          COUNT(*) as total_messages,
          COUNT(*) FILTER (WHERE direction = 'outbound') as sent_messages,
          COUNT(*) FILTER (WHERE direction = 'inbound') as received_messages,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'read') as read_messages,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_messages,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as messages_24h
        FROM whatsapp_messages
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),

      // Template statistics
      pool.query(`
        SELECT
          COUNT(*) as total_templates,
          COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
          COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
        FROM whatsapp_templates
      `),

      // Recent activity
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM whatsapp_messages WHERE created_at >= NOW() - INTERVAL '1 hour') as messages_last_hour,
          (SELECT COUNT(*) FROM whatsapp_webhooks_log WHERE received_at >= NOW() - INTERVAL '1 hour') as webhooks_last_hour
      `)
    ]);

    const accounts = accountStats.rows[0] || {};
    const messages = messageStats.rows[0] || {};
    const templates = templateStats.rows[0] || {};
    const activity = recentActivity.rows[0] || {};

    // Calculate delivery rate
    const sentCount = parseInt(messages.sent_messages || 0);
    const deliveredCount = parseInt(messages.delivered || 0) + parseInt(messages.read_messages || 0);
    const deliveryRate = sentCount > 0 ? ((deliveredCount / sentCount) * 100).toFixed(1) : 0;

    return c.json({
      accounts: {
        total: parseInt(accounts.total_accounts || 0),
        active: parseInt(accounts.active_accounts || 0),
        verified: parseInt(accounts.verified_accounts || 0),
        tenantsWithWhatsApp: parseInt(accounts.tenants_with_whatsapp || 0)
      },
      messages: {
        total: parseInt(messages.total_messages || 0),
        sent: parseInt(messages.sent_messages || 0),
        received: parseInt(messages.received_messages || 0),
        delivered: parseInt(messages.delivered || 0),
        read: parseInt(messages.read_messages || 0),
        failed: parseInt(messages.failed_messages || 0),
        last24h: parseInt(messages.messages_24h || 0),
        deliveryRate: parseFloat(deliveryRate)
      },
      templates: {
        total: parseInt(templates.total_templates || 0),
        approved: parseInt(templates.approved || 0),
        pending: parseInt(templates.pending || 0),
        rejected: parseInt(templates.rejected || 0)
      },
      activity: {
        messagesLastHour: parseInt(activity.messages_last_hour || 0),
        webhooksLastHour: parseInt(activity.webhooks_last_hour || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp stats:', error);
    return c.json({ error: 'Failed to fetch WhatsApp stats', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/accounts - List all WhatsApp accounts
// ============================================================================
adminWhatsApp.get('/accounts', async (c) => {
  try {
    const { tenant_id, status, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`wa.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`wa.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [accountsResult, countResult] = await Promise.all([
      pool.query(`
        SELECT
          wa.id,
          wa.tenant_id,
          t.name as tenant_name,
          wa.phone_number_id,
          wa.phone_number,
          wa.display_name,
          wa.business_account_id,
          wa.status,
          wa.verified,
          wa.quality_rating,
          wa.messaging_limit,
          wa.daily_conversation_limit,
          wa.created_at,
          wa.last_synced_at,
          (SELECT COUNT(*) FROM whatsapp_messages WHERE whatsapp_account_id = wa.id) as message_count,
          (SELECT COUNT(*) FROM whatsapp_templates WHERE whatsapp_account_id = wa.id AND status = 'APPROVED') as template_count
        FROM whatsapp_accounts wa
        LEFT JOIN tenants t ON wa.tenant_id = t.id
        ${whereClause}
        ORDER BY wa.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),

      pool.query(`
        SELECT COUNT(*) as total
        FROM whatsapp_accounts wa
        ${whereClause}
      `, params)
    ]);

    return c.json({
      accounts: accountsResult.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        phoneNumberId: row.phone_number_id,
        phoneNumber: row.phone_number,
        displayName: row.display_name,
        businessAccountId: row.business_account_id,
        status: row.status,
        verified: row.verified,
        qualityRating: row.quality_rating,
        messagingLimit: row.messaging_limit,
        dailyConversationLimit: row.daily_conversation_limit,
        createdAt: row.created_at,
        lastSyncedAt: row.last_synced_at,
        messageCount: parseInt(row.message_count || 0),
        templateCount: parseInt(row.template_count || 0)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp accounts:', error);
    return c.json({ error: 'Failed to fetch WhatsApp accounts', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/accounts/:id - Get account details
// ============================================================================
adminWhatsApp.get('/accounts/:id', async (c) => {
  try {
    const accountId = c.req.param('id');

    const [accountResult, messagesResult, templatesResult] = await Promise.all([
      pool.query(`
        SELECT
          wa.*,
          t.name as tenant_name
        FROM whatsapp_accounts wa
        LEFT JOIN tenants t ON wa.tenant_id = t.id
        WHERE wa.id = $1
      `, [accountId]),

      // Recent messages
      pool.query(`
        SELECT
          id, direction, status, message_type, text_body, from_number, to_number,
          created_at, delivered_at, read_at
        FROM whatsapp_messages
        WHERE whatsapp_account_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [accountId]),

      // Templates
      pool.query(`
        SELECT
          id, template_name, template_id, language, category, status,
          sent_count, delivered_count, read_count, failed_count,
          created_at, approved_at, last_used_at
        FROM whatsapp_templates
        WHERE whatsapp_account_id = $1
        ORDER BY created_at DESC
      `, [accountId])
    ]);

    if (accountResult.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const account = accountResult.rows[0];

    return c.json({
      account: {
        id: account.id,
        tenantId: account.tenant_id,
        tenantName: account.tenant_name,
        phoneNumberId: account.phone_number_id,
        phoneNumber: account.phone_number,
        displayName: account.display_name,
        businessAccountId: account.business_account_id,
        status: account.status,
        verified: account.verified,
        qualityRating: account.quality_rating,
        messagingLimit: account.messaging_limit,
        dailyConversationLimit: account.daily_conversation_limit,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
        lastSyncedAt: account.last_synced_at
      },
      recentMessages: messagesResult.rows.map(msg => ({
        id: msg.id,
        direction: msg.direction,
        status: msg.status,
        messageType: msg.message_type,
        textBody: msg.text_body?.substring(0, 100),
        fromNumber: msg.from_number,
        toNumber: msg.to_number,
        createdAt: msg.created_at,
        deliveredAt: msg.delivered_at,
        readAt: msg.read_at
      })),
      templates: templatesResult.rows.map(tpl => ({
        id: tpl.id,
        templateName: tpl.template_name,
        templateId: tpl.template_id,
        language: tpl.language,
        category: tpl.category,
        status: tpl.status,
        sentCount: parseInt(tpl.sent_count || 0),
        deliveredCount: parseInt(tpl.delivered_count || 0),
        readCount: parseInt(tpl.read_count || 0),
        failedCount: parseInt(tpl.failed_count || 0),
        createdAt: tpl.created_at,
        approvedAt: tpl.approved_at,
        lastUsedAt: tpl.last_used_at
      }))
    });
  } catch (error) {
    console.error('Error fetching WhatsApp account details:', error);
    return c.json({ error: 'Failed to fetch account details', details: error.message }, 500);
  }
});

// ============================================================================
// PATCH /admin/whatsapp/accounts/:id/status - Update account status
// ============================================================================
adminWhatsApp.patch('/accounts/:id/status', async (c) => {
  try {
    const accountId = c.req.param('id');
    const { status } = await c.req.json();

    if (!['active', 'disabled', 'suspended'].includes(status)) {
      return c.json({ error: 'Invalid status. Must be active, disabled, or suspended' }, 400);
    }

    const result = await pool.query(`
      UPDATE whatsapp_accounts
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status
    `, [status, accountId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({
      success: true,
      account: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating account status:', error);
    return c.json({ error: 'Failed to update account status', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/templates - List all templates
// ============================================================================
adminWhatsApp.get('/templates', async (c) => {
  try {
    const { tenant_id, status, category, page = 1, limit = 20 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`wt.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (status) {
      whereConditions.push(`wt.status = $${paramIndex++}`);
      params.push(status);
    }

    if (category) {
      whereConditions.push(`wt.category = $${paramIndex++}`);
      params.push(category);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [templatesResult, countResult] = await Promise.all([
      pool.query(`
        SELECT
          wt.id,
          wt.tenant_id,
          t.name as tenant_name,
          wa.phone_number,
          wt.template_name,
          wt.template_id,
          wt.language,
          wt.category,
          wt.header_type,
          wt.body_text,
          wt.status,
          wt.quality_score,
          wt.sent_count,
          wt.delivered_count,
          wt.read_count,
          wt.failed_count,
          wt.created_at,
          wt.approved_at,
          wt.last_used_at
        FROM whatsapp_templates wt
        LEFT JOIN tenants t ON wt.tenant_id = t.id
        LEFT JOIN whatsapp_accounts wa ON wt.whatsapp_account_id = wa.id
        ${whereClause}
        ORDER BY wt.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),

      pool.query(`
        SELECT COUNT(*) as total
        FROM whatsapp_templates wt
        ${whereClause}
      `, params)
    ]);

    return c.json({
      templates: templatesResult.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        phoneNumber: row.phone_number,
        templateName: row.template_name,
        templateId: row.template_id,
        language: row.language,
        category: row.category,
        headerType: row.header_type,
        bodyText: row.body_text,
        status: row.status,
        qualityScore: row.quality_score,
        sentCount: parseInt(row.sent_count || 0),
        deliveredCount: parseInt(row.delivered_count || 0),
        readCount: parseInt(row.read_count || 0),
        failedCount: parseInt(row.failed_count || 0),
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        lastUsedAt: row.last_used_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    return c.json({ error: 'Failed to fetch templates', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/messages - List messages across tenants
// ============================================================================
adminWhatsApp.get('/messages', async (c) => {
  try {
    const { tenant_id, account_id, direction, status, message_type, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`wm.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (account_id) {
      whereConditions.push(`wm.whatsapp_account_id = $${paramIndex++}`);
      params.push(account_id);
    }

    if (direction) {
      whereConditions.push(`wm.direction = $${paramIndex++}`);
      params.push(direction);
    }

    if (status) {
      whereConditions.push(`wm.status = $${paramIndex++}`);
      params.push(status);
    }

    if (message_type) {
      whereConditions.push(`wm.message_type = $${paramIndex++}`);
      params.push(message_type);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [messagesResult, countResult] = await Promise.all([
      pool.query(`
        SELECT
          wm.id,
          wm.tenant_id,
          t.name as tenant_name,
          wa.phone_number as account_phone,
          wm.direction,
          wm.status,
          wm.from_number,
          wm.to_number,
          wm.contact_name,
          wm.message_type,
          wm.text_body,
          wm.template_name,
          wm.error_code,
          wm.error_message,
          wm.created_at,
          wm.sent_at,
          wm.delivered_at,
          wm.read_at,
          wm.failed_at
        FROM whatsapp_messages wm
        LEFT JOIN tenants t ON wm.tenant_id = t.id
        LEFT JOIN whatsapp_accounts wa ON wm.whatsapp_account_id = wa.id
        ${whereClause}
        ORDER BY wm.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),

      pool.query(`
        SELECT COUNT(*) as total
        FROM whatsapp_messages wm
        ${whereClause}
      `, params)
    ]);

    return c.json({
      messages: messagesResult.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        accountPhone: row.account_phone,
        direction: row.direction,
        status: row.status,
        fromNumber: row.from_number,
        toNumber: row.to_number,
        contactName: row.contact_name,
        messageType: row.message_type,
        textBody: row.text_body?.substring(0, 200),
        templateName: row.template_name,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
        failedAt: row.failed_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp messages:', error);
    return c.json({ error: 'Failed to fetch messages', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/webhooks - Webhook delivery log
// ============================================================================
adminWhatsApp.get('/webhooks', async (c) => {
  try {
    const { tenant_id, processed, event_type, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`wl.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (processed !== undefined) {
      whereConditions.push(`wl.processed = $${paramIndex++}`);
      params.push(processed === 'true');
    }

    if (event_type) {
      whereConditions.push(`wl.event_type = $${paramIndex++}`);
      params.push(event_type);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [webhooksResult, countResult] = await Promise.all([
      pool.query(`
        SELECT
          wl.id,
          wl.tenant_id,
          t.name as tenant_name,
          wa.phone_number as account_phone,
          wl.event_type,
          wl.phone_number_id,
          wl.processed,
          wl.processed_at,
          wl.processing_error,
          wl.received_at
        FROM whatsapp_webhooks_log wl
        LEFT JOIN tenants t ON wl.tenant_id = t.id
        LEFT JOIN whatsapp_accounts wa ON wl.whatsapp_account_id = wa.id
        ${whereClause}
        ORDER BY wl.received_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),

      pool.query(`
        SELECT COUNT(*) as total
        FROM whatsapp_webhooks_log wl
        ${whereClause}
      `, params)
    ]);

    return c.json({
      webhooks: webhooksResult.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        accountPhone: row.account_phone,
        eventType: row.event_type,
        phoneNumberId: row.phone_number_id,
        processed: row.processed,
        processedAt: row.processed_at,
        processingError: row.processing_error,
        receivedAt: row.received_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp webhooks:', error);
    return c.json({ error: 'Failed to fetch webhooks', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/analytics - Platform analytics
// ============================================================================
adminWhatsApp.get('/analytics', async (c) => {
  try {
    const { period = '30d' } = c.req.query();

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      dailyMessages,
      topTenants,
      messageTypes,
      deliveryStats
    ] = await Promise.all([
      // Daily message trends
      pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) FILTER (WHERE direction = 'outbound') as sent,
          COUNT(*) FILTER (WHERE direction = 'inbound') as received,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM whatsapp_messages
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [startDate]),

      // Top tenants by message volume
      pool.query(`
        SELECT
          wm.tenant_id,
          t.name as tenant_name,
          COUNT(*) as message_count,
          COUNT(*) FILTER (WHERE direction = 'outbound') as sent,
          COUNT(*) FILTER (WHERE direction = 'inbound') as received
        FROM whatsapp_messages wm
        LEFT JOIN tenants t ON wm.tenant_id = t.id
        WHERE wm.created_at >= $1
        GROUP BY wm.tenant_id, t.name
        ORDER BY message_count DESC
        LIMIT 10
      `, [startDate]),

      // Message type breakdown
      pool.query(`
        SELECT
          message_type,
          COUNT(*) as count
        FROM whatsapp_messages
        WHERE created_at >= $1
        GROUP BY message_type
        ORDER BY count DESC
      `, [startDate]),

      // Delivery statistics
      pool.query(`
        SELECT
          status,
          COUNT(*) as count
        FROM whatsapp_messages
        WHERE direction = 'outbound' AND created_at >= $1
        GROUP BY status
      `, [startDate])
    ]);

    return c.json({
      period,
      dailyTrends: dailyMessages.rows.map(row => ({
        date: row.date,
        sent: parseInt(row.sent || 0),
        received: parseInt(row.received || 0),
        failed: parseInt(row.failed || 0)
      })),
      topTenants: topTenants.rows.map(row => ({
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        messageCount: parseInt(row.message_count || 0),
        sent: parseInt(row.sent || 0),
        received: parseInt(row.received || 0)
      })),
      messageTypes: messageTypes.rows.map(row => ({
        type: row.message_type,
        count: parseInt(row.count || 0)
      })),
      deliveryStats: deliveryStats.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count || 0);
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching WhatsApp analytics:', error);
    return c.json({ error: 'Failed to fetch analytics', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/whatsapp/contacts - List WhatsApp contacts
// ============================================================================
adminWhatsApp.get('/contacts', async (c) => {
  try {
    const { tenant_id, account_id, opted_in, page = 1, limit = 50 } = c.req.query();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (tenant_id) {
      whereConditions.push(`wc.tenant_id = $${paramIndex++}`);
      params.push(tenant_id);
    }

    if (account_id) {
      whereConditions.push(`wc.whatsapp_account_id = $${paramIndex++}`);
      params.push(account_id);
    }

    if (opted_in !== undefined) {
      whereConditions.push(`wc.opted_in = $${paramIndex++}`);
      params.push(opted_in === 'true');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [contactsResult, countResult] = await Promise.all([
      pool.query(`
        SELECT
          wc.id,
          wc.tenant_id,
          t.name as tenant_name,
          wa.phone_number as account_phone,
          wc.phone_number,
          wc.whatsapp_name,
          wc.conversation_state,
          wc.opted_in,
          wc.opted_in_at,
          wc.opted_out_at,
          wc.message_count,
          wc.last_message_at,
          wc.last_message_from,
          wc.created_at
        FROM whatsapp_contacts wc
        LEFT JOIN tenants t ON wc.tenant_id = t.id
        LEFT JOIN whatsapp_accounts wa ON wc.whatsapp_account_id = wa.id
        ${whereClause}
        ORDER BY wc.last_message_at DESC NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), offset]),

      pool.query(`
        SELECT COUNT(*) as total
        FROM whatsapp_contacts wc
        ${whereClause}
      `, params)
    ]);

    return c.json({
      contacts: contactsResult.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        accountPhone: row.account_phone,
        phoneNumber: row.phone_number,
        whatsappName: row.whatsapp_name,
        conversationState: row.conversation_state,
        optedIn: row.opted_in,
        optedInAt: row.opted_in_at,
        optedOutAt: row.opted_out_at,
        messageCount: parseInt(row.message_count || 0),
        lastMessageAt: row.last_message_at,
        lastMessageFrom: row.last_message_from,
        createdAt: row.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0]?.total || 0),
        totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp contacts:', error);
    return c.json({ error: 'Failed to fetch contacts', details: error.message }, 500);
  }
});

export default adminWhatsApp;
