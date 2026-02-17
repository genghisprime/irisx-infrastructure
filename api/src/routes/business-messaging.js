/**
 * Business Messaging Routes
 *
 * Unified API for Apple Business Messages, Google Business Messages, and RCS
 */

import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import appleBusinessService from '../services/business-messaging/apple-business.js';
import googleBusinessService from '../services/business-messaging/google-business.js';
import rcsService from '../services/business-messaging/rcs-service.js';

const router = new Hono();

// Apply auth middleware to all routes
router.use('*', authMiddleware);

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

export default router;
