/**
 * Business Messaging Routes
 *
 * Unified API for Apple Business Messages, Google Business Messages, and RCS
 */

import { Hono } from 'hono';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware.js';
import appleBusinessService from '../services/business-messaging/apple-business.js';
import googleBusinessService from '../services/business-messaging/google-business.js';
import rcsService from '../services/business-messaging/rcs-service.js';

const router = new Hono();

// Apply auth middleware to all routes
router.use('*', authenticateJWT);

// ============================================
// WEBHOOKS (No auth required - verified by signature)
// ============================================

// Create a separate router for webhooks without auth
export const webhookRouter = new Hono();

// Apple Business Messages webhook
webhookRouter.post('/apple/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const payload = await c.req.json();
    const signature = c.req.header('X-Apple-Signature');

    const result = await appleBusinessService.handleWebhook(tenantId, payload, signature);
    return c.json(result);
  } catch (error) {
    console.error('Apple webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Google Business Messages webhook
webhookRouter.post('/google/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const payload = await c.req.json();
    const signature = c.req.header('X-Goog-Signature');

    const result = await googleBusinessService.handleWebhook(tenantId, payload, signature);
    return c.json(result);
  } catch (error) {
    console.error('Google webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// RCS webhook
webhookRouter.post('/rcs/:tenantId', async (c) => {
  try {
    const tenantId = c.req.param('tenantId');
    const payload = await c.req.json();
    const signature = c.req.header('X-RCS-Signature');

    const result = await rcsService.handleWebhook(tenantId, payload, signature);
    return c.json(result);
  } catch (error) {
    console.error('RCS webhook error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// APPLE BUSINESS MESSAGES
// ============================================

// Get Apple Business accounts
router.get('/apple/accounts', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const accounts = await appleBusinessService.listAccounts(tenantId);
    return c.json({ accounts });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Register Apple Business account
router.post('/apple/accounts', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const account = await appleBusinessService.registerAccount(tenantId, data);
    return c.json({ account }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Apple conversations
router.get('/apple/conversations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { status, limit, offset } = c.req.query();
    const conversations = await appleBusinessService.listConversations(tenantId, {
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ conversations });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Apple conversation messages
router.get('/apple/conversations/:id/messages', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { limit, offset } = c.req.query();
    const messages = await appleBusinessService.getMessages(tenantId, conversationId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ messages });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Apple text message
router.post('/apple/conversations/:id/messages/text', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { text } = await c.req.json();
    const message = await appleBusinessService.sendTextMessage(tenantId, conversationId, text);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Apple rich link
router.post('/apple/conversations/:id/messages/rich-link', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await appleBusinessService.sendRichLink(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Apple list picker
router.post('/apple/conversations/:id/messages/list-picker', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await appleBusinessService.sendListPicker(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Apple time picker
router.post('/apple/conversations/:id/messages/time-picker', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await appleBusinessService.sendTimePicker(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Request Apple Pay payment
router.post('/apple/conversations/:id/messages/apple-pay', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await appleBusinessService.requestApplePayPayment(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Apple templates
router.get('/apple/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { category, limit, offset } = c.req.query();
    const templates = await appleBusinessService.listTemplates(tenantId, {
      category,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ templates });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Save Apple template
router.post('/apple/templates', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const template = await appleBusinessService.saveTemplate(tenantId, data);
    return c.json({ template }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Apple template message
router.post('/apple/conversations/:id/messages/template', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { templateId, variables } = await c.req.json();
    const message = await appleBusinessService.sendTemplate(tenantId, conversationId, templateId, variables);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Apple analytics
router.get('/apple/analytics', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { startDate, endDate, businessId } = c.req.query();
    const analytics = await appleBusinessService.getAnalytics(tenantId, {
      startDate,
      endDate,
      businessId
    });
    return c.json({ analytics });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// GOOGLE BUSINESS MESSAGES
// ============================================

// Get Google agents
router.get('/google/agents', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const agents = await googleBusinessService.listAgents(tenantId);
    return c.json({ agents });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Register Google agent
router.post('/google/agents', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const agent = await googleBusinessService.registerAgent(tenantId, data);
    return c.json({ agent }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Add location to Google agent
router.post('/google/agents/:agentId/locations', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const agentId = c.req.param('agentId');
    const data = await c.req.json();
    const location = await googleBusinessService.addLocation(tenantId, agentId, data);
    return c.json({ location }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Google conversations
router.get('/google/conversations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { agentId, status, limit, offset } = c.req.query();
    const conversations = await googleBusinessService.listConversations(tenantId, {
      agentId,
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ conversations });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Google conversation messages
router.get('/google/conversations/:id/messages', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { limit, offset } = c.req.query();
    const messages = await googleBusinessService.getMessages(tenantId, conversationId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ messages });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Google text message
router.post('/google/conversations/:id/messages/text', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { text, suggestions } = await c.req.json();
    const message = await googleBusinessService.sendTextMessage(tenantId, conversationId, text, { suggestions });
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Google rich card
router.post('/google/conversations/:id/messages/rich-card', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await googleBusinessService.sendRichCard(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Google carousel
router.post('/google/conversations/:id/messages/carousel', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { cards, cardWidth } = await c.req.json();
    const message = await googleBusinessService.sendCarousel(tenantId, conversationId, cards, { cardWidth });
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Request Google authentication
router.post('/google/conversations/:id/messages/auth', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await googleBusinessService.requestAuthentication(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get Google templates
router.get('/google/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { category, limit, offset } = c.req.query();
    const templates = await googleBusinessService.listTemplates(tenantId, {
      category,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ templates });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Save Google template
router.post('/google/templates', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const template = await googleBusinessService.saveTemplate(tenantId, data);
    return c.json({ template }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send Google template message
router.post('/google/conversations/:id/messages/template', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { templateId, variables } = await c.req.json();
    const message = await googleBusinessService.sendTemplate(tenantId, conversationId, templateId, variables);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Google analytics
router.get('/google/analytics', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { startDate, endDate, agentId } = c.req.query();
    const analytics = await googleBusinessService.getAnalytics(tenantId, {
      startDate,
      endDate,
      agentId
    });
    return c.json({ analytics });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// RCS MESSAGING
// ============================================

// Get RCS accounts
router.get('/rcs/accounts', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const accounts = await rcsService.listAccounts?.(tenantId) || [];
    return c.json({ accounts });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Register RCS agent
router.post('/rcs/agents', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const agent = await rcsService.registerAgent(tenantId, data);
    return c.json({ agent }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Verify RCS agent
router.post('/rcs/agents/:id/verify', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const accountId = c.req.param('id');
    const result = await rcsService.verifyAgent(tenantId, accountId);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Check RCS capability for phone number
router.get('/rcs/capability/:phone', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const phone = c.req.param('phone');
    const capability = await rcsService.checkCapability(tenantId, phone);
    return c.json(capability);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS conversations
router.get('/rcs/conversations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { agentId, status, limit, offset } = c.req.query();
    const conversations = await rcsService.listConversations(tenantId, {
      agentId,
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ conversations });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get or create RCS conversation
router.post('/rcs/conversations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { agentId, userPhone } = await c.req.json();
    const conversation = await rcsService.getOrCreateConversation(tenantId, agentId, userPhone);
    return c.json({ conversation }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS conversation messages
router.get('/rcs/conversations/:id/messages', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { limit, offset, direction } = c.req.query();
    const messages = await rcsService.getMessages(tenantId, conversationId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      direction
    });
    return c.json({ messages });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS text message
router.post('/rcs/conversations/:id/messages/text', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { text, suggestions, smsFallback } = await c.req.json();
    const message = await rcsService.sendTextMessage(tenantId, conversationId, text, {
      suggestions,
      smsFallback
    });
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS rich card
router.post('/rcs/conversations/:id/messages/rich-card', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await rcsService.sendRichCard(tenantId, conversationId, data);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS carousel
router.post('/rcs/conversations/:id/messages/carousel', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { cards, cardWidth } = await c.req.json();
    const message = await rcsService.sendCarousel(tenantId, conversationId, cards, { cardWidth });
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS file
router.post('/rcs/conversations/:id/messages/file', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const data = await c.req.json();
    const message = await rcsService.sendFile(tenantId, conversationId, data.file, { caption: data.caption });
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS typing indicator
router.post('/rcs/conversations/:id/typing', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { isTyping } = await c.req.json();
    const result = await rcsService.sendTypingIndicator(tenantId, conversationId, isTyping);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS read receipt
router.post('/rcs/conversations/:id/read', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { messageIds } = await c.req.json();
    const result = await rcsService.sendReadReceipt(tenantId, conversationId, messageIds);
    return c.json(result);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get RCS templates
router.get('/rcs/templates', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { category, status, limit, offset } = c.req.query();
    const templates = await rcsService.listTemplates(tenantId, {
      category,
      status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    return c.json({ templates });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Save RCS template
router.post('/rcs/templates', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();
    const template = await rcsService.saveTemplate(tenantId, data);
    return c.json({ template }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Send RCS template message
router.post('/rcs/conversations/:id/messages/template', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const conversationId = c.req.param('id');
    const { templateId, variables } = await c.req.json();
    const message = await rcsService.sendTemplate(tenantId, conversationId, templateId, variables);
    return c.json({ message }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// RCS analytics
router.get('/rcs/analytics', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { startDate, endDate, agentId } = c.req.query();
    const analytics = await rcsService.getAnalytics(tenantId, {
      startDate,
      endDate,
      agentId
    });
    return c.json({ analytics });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// BUSINESS MESSAGING SETTINGS
// ============================================

import pool from '../db/connection.js';

// Get tenant business messaging settings and overview
router.get('/settings', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Get tenant settings
    const settingsResult = await pool.query(
      `SELECT * FROM tenant_business_messaging_settings WHERE tenant_id = $1`,
      [tenantId]
    );

    // Get account counts
    const appleCount = await pool.query(
      `SELECT COUNT(*) as count FROM apple_business_accounts WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    const googleCount = await pool.query(
      `SELECT COUNT(*) as count FROM google_business_agents WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    const rcsCount = await pool.query(
      `SELECT COUNT(*) as count FROM rcs_agents WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );

    const settings = settingsResult.rows[0] || {
      tenant_id: tenantId,
      apple_enabled: false,
      google_enabled: false,
      rcs_enabled: false,
      rcs_fallback_to_sms: true
    };

    return c.json({
      settings,
      accounts: {
        apple: parseInt(appleCount.rows[0]?.count || 0),
        google: parseInt(googleCount.rows[0]?.count || 0),
        rcs: parseInt(rcsCount.rows[0]?.count || 0)
      }
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Update tenant business messaging settings
router.put('/settings', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();

    const result = await pool.query(`
      INSERT INTO tenant_business_messaging_settings (
        tenant_id, apple_enabled, google_enabled, rcs_enabled,
        rcs_fallback_to_sms, apple_auto_reply_enabled, apple_auto_reply_message,
        google_auto_reply_enabled, google_auto_reply_message, google_survey_enabled,
        rcs_auto_reply_enabled, rcs_auto_reply_message,
        business_hours, out_of_hours_message, max_response_time_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (tenant_id) DO UPDATE SET
        apple_enabled = EXCLUDED.apple_enabled,
        google_enabled = EXCLUDED.google_enabled,
        rcs_enabled = EXCLUDED.rcs_enabled,
        rcs_fallback_to_sms = EXCLUDED.rcs_fallback_to_sms,
        apple_auto_reply_enabled = EXCLUDED.apple_auto_reply_enabled,
        apple_auto_reply_message = EXCLUDED.apple_auto_reply_message,
        google_auto_reply_enabled = EXCLUDED.google_auto_reply_enabled,
        google_auto_reply_message = EXCLUDED.google_auto_reply_message,
        google_survey_enabled = EXCLUDED.google_survey_enabled,
        rcs_auto_reply_enabled = EXCLUDED.rcs_auto_reply_enabled,
        rcs_auto_reply_message = EXCLUDED.rcs_auto_reply_message,
        business_hours = EXCLUDED.business_hours,
        out_of_hours_message = EXCLUDED.out_of_hours_message,
        max_response_time_minutes = EXCLUDED.max_response_time_minutes,
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId,
      data.apple_enabled || false,
      data.google_enabled || false,
      data.rcs_enabled || false,
      data.rcs_fallback_to_sms !== false,
      data.apple_auto_reply_enabled || false,
      data.apple_auto_reply_message || null,
      data.google_auto_reply_enabled || false,
      data.google_auto_reply_message || null,
      data.google_survey_enabled !== false,
      data.rcs_auto_reply_enabled || false,
      data.rcs_auto_reply_message || null,
      data.business_hours ? JSON.stringify(data.business_hours) : null,
      data.out_of_hours_message || null,
      data.max_response_time_minutes || 60
    ]);

    return c.json({ settings: result.rows[0] });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get unified business messaging overview for tenant
router.get('/overview', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Apple stats
    const appleStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM apple_business_accounts WHERE tenant_id = $1) as accounts,
        (SELECT COUNT(*) FROM apple_business_conversations WHERE tenant_id = $1) as conversations,
        (SELECT COUNT(*) FROM apple_business_messages WHERE tenant_id = $1) as total_messages,
        (SELECT COUNT(*) FROM apple_business_messages WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as messages_24h
    `, [tenantId]);

    // Google stats
    const googleStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM google_business_agents WHERE tenant_id = $1) as agents,
        (SELECT COUNT(*) FROM google_business_locations l JOIN google_business_agents a ON l.agent_id = a.id WHERE a.tenant_id = $1) as locations,
        (SELECT COUNT(*) FROM google_business_conversations WHERE tenant_id = $1) as conversations,
        (SELECT COUNT(*) FROM google_business_messages WHERE tenant_id = $1) as total_messages,
        (SELECT COUNT(*) FROM google_business_messages WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as messages_24h
    `, [tenantId]);

    // RCS stats
    const rcsStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM rcs_agents WHERE tenant_id = $1) as agents,
        (SELECT COUNT(*) FROM rcs_conversations WHERE tenant_id = $1) as conversations,
        (SELECT COUNT(*) FROM rcs_messages WHERE tenant_id = $1) as total_messages,
        (SELECT COUNT(*) FROM rcs_messages WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '24 hours') as messages_24h,
        (SELECT COUNT(*) FROM rcs_messages WHERE tenant_id = $1 AND used_fallback = true) as sms_fallback_count
    `, [tenantId]);

    return c.json({
      apple: appleStats.rows[0],
      google: googleStats.rows[0],
      rcs: rcsStats.rows[0]
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// BUSINESS REGISTRATION REQUESTS
// ============================================

// Submit Apple Business Messages registration request
router.post('/register/apple', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();

    // Create pending Apple Business account
    const result = await pool.query(`
      INSERT INTO apple_business_accounts (
        tenant_id, business_id, business_name, logo_url, icon_url,
        primary_color, webhook_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [
      tenantId,
      data.business_id || `pending-${Date.now()}`,
      data.business_name,
      data.logo_url,
      data.icon_url,
      data.primary_color,
      `${process.env.API_URL || 'https://api.irisx.com'}/webhooks/business-messaging/apple/${tenantId}`
    ]);

    return c.json({
      account: result.rows[0],
      message: 'Apple Business Messages registration submitted. You will be notified once approved by Apple.',
      next_steps: [
        'Complete Apple Business Register enrollment at business.apple.com',
        'Provide your Apple Business ID once registration is complete',
        'Configure your webhook URL in Apple Business Console'
      ]
    }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Submit Google Business Messages registration request
router.post('/register/google', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();

    // Create pending Google Business agent
    const result = await pool.query(`
      INSERT INTO google_business_agents (
        tenant_id, agent_id, agent_name, brand_id, logo_url,
        phone_number, privacy_policy_url, conversation_starters,
        verification_contact_email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *
    `, [
      tenantId,
      data.agent_id || `pending-${Date.now()}`,
      data.agent_name,
      data.brand_id,
      data.logo_url,
      data.phone_number,
      data.privacy_policy_url,
      JSON.stringify(data.conversation_starters || []),
      data.verification_email
    ]);

    return c.json({
      agent: result.rows[0],
      message: 'Google Business Messages registration submitted. Verification required.',
      next_steps: [
        'Register at business.google.com/businessmessages',
        'Complete brand verification with Google',
        'Configure entry points (Maps, Search, etc.)',
        'Add business locations for local messaging'
      ]
    }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Submit RCS registration request
router.post('/register/rcs', requireRole('admin'), async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const data = await c.req.json();

    // Create pending RCS agent
    const result = await pool.query(`
      INSERT INTO rcs_agents (
        tenant_id, agent_id, agent_name, description, provider,
        logo_url, banner_url, primary_color, secondary_color,
        phone_number, website_url, privacy_policy_url, terms_of_service_url,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
      RETURNING *
    `, [
      tenantId,
      data.agent_id || `pending-${Date.now()}`,
      data.agent_name,
      data.description,
      data.provider || 'google_jibe',
      data.logo_url,
      data.banner_url,
      data.primary_color,
      data.secondary_color,
      data.phone_number,
      data.website_url,
      data.privacy_policy_url,
      data.terms_of_service_url
    ]);

    return c.json({
      agent: result.rows[0],
      message: 'RCS agent registration submitted. Provider verification required.',
      next_steps: [
        'Complete business verification with your RCS provider',
        'Upload branding assets (logo, banner)',
        'Configure rich messaging capabilities',
        'Test with RCS-capable devices'
      ]
    }, 201);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Get registration status
router.get('/registration-status', async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const appleAccounts = await pool.query(
      `SELECT id, business_name, business_id, status, verified_at, created_at
       FROM apple_business_accounts WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    const googleAgents = await pool.query(
      `SELECT id, agent_name, agent_id, status, verification_status, created_at
       FROM google_business_agents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    const rcsAgents = await pool.query(
      `SELECT id, agent_name, agent_id, provider, status, verification_status, verified_at, created_at
       FROM rcs_agents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    return c.json({
      apple: appleAccounts.rows,
      google: googleAgents.rows,
      rcs: rcsAgents.rows
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default router;
