/**
 * Chat Routes
 * Handles live chat widget operations, conversations, and messages
 * Created: Week 24 - Feature 4 (Live Chat Widget)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import chatService from '../services/chat.js';

const chat = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const createWidgetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  widgetPosition: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  greetingMessage: z.string().max(500).optional(),
});

const startConversationSchema = z.object({
  widgetKey: z.string(),
  visitorId: z.string().optional(),
  visitorName: z.string().max(100).optional(),
  visitorEmail: z.string().email().optional(),
  pageUrl: z.string().url().optional(),
  pageTitle: z.string().max(255).optional(),
  referrer: z.string().url().optional(),
});

const sendMessageSchema = z.object({
  conversationId: z.string(),
  senderType: z.enum(['visitor', 'agent']),
  messageText: z.string().max(5000).optional(),
  messageType: z.enum(['text', 'image', 'file', 'system']).default('text'),
  fileUrl: z.string().url().optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.number().int().positive().optional(),
  fileType: z.string().max(100).optional(),
});

const rateConversationSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(1000).optional(),
});

// =============================================================================
// Middleware - Extract Tenant ID from JWT
// =============================================================================

async function extractTenantId(c, next) {
  const user = c.get('user');

  if (!user || !user.tenantId) {
    return c.json({
      error: 'Unauthorized',
      message: 'Missing or invalid authentication token',
      code: 'MISSING_TENANT_ID'
    }, 401);
  }

  c.set('tenantId', user.tenantId);
  c.set('userId', user.userId);
  await next();
}

// =============================================================================
// Public Routes (No Authentication Required)
// =============================================================================

/**
 * GET /v1/chat/widget/:widgetKey
 * Get widget configuration (public endpoint for embedding)
 */
chat.get('/widget/:widgetKey', async (c) => {
  try {
    const { widgetKey } = c.req.param();

    const widget = await chatService.getWidgetByKey(widgetKey);

    if (!widget) {
      return c.json({
        success: false,
        error: 'Widget not found',
        code: 'WIDGET_NOT_FOUND'
      }, 404);
    }

    return c.json({
      success: true,
      data: widget
    });
  } catch (error) {
    console.error('Error fetching widget:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch widget',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/conversation/start
 * Start a new chat conversation (public endpoint)
 */
chat.post('/conversation/start', async (c) => {
  try {
    const body = await c.req.json();
    const validation = startConversationSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { widgetKey, ...conversationData } = validation.data;

    // Get widget to verify it exists and get tenant_id
    const widget = await chatService.getWidgetByKey(widgetKey);

    if (!widget) {
      return c.json({
        success: false,
        error: 'Invalid widget key',
        code: 'INVALID_WIDGET_KEY'
      }, 400);
    }

    // Get visitor IP from request
    const visitorIp = c.req.header('x-forwarded-for') ||
                      c.req.header('x-real-ip') ||
                      'unknown';
    const visitorUserAgent = c.req.header('user-agent') || 'unknown';

    const conversation = await chatService.startConversation({
      widgetId: widget.id,
      tenantId: widget.tenant_id,
      visitorIp,
      visitorUserAgent,
      ...conversationData
    });

    return c.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Error starting conversation:', error);
    return c.json({
      success: false,
      error: 'Failed to start conversation',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/message/send
 * Send a message (public endpoint for visitor messages)
 */
chat.post('/message/send', async (c) => {
  try {
    const body = await c.req.json();
    const validation = sendMessageSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { conversationId, senderType, ...messageData } = validation.data;

    // Get conversation to get database ID
    const conversation = await chatService.getConversation(conversationId);

    if (!conversation) {
      return c.json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      }, 404);
    }

    // For agent messages, require authentication
    if (senderType === 'agent') {
      const user = c.get('user');
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required for agent messages',
          code: 'AUTH_REQUIRED'
        }, 401);
      }
      messageData.senderId = user.userId;
      messageData.senderName = user.firstName + ' ' + user.lastName;
    }

    const message = await chatService.sendMessage({
      conversationId: conversation.id,
      senderType,
      ...messageData
    });

    return c.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return c.json({
      success: false,
      error: 'Failed to send message',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/chat/conversation/:conversationId/messages
 * Get messages for a conversation (public endpoint)
 */
chat.get('/conversation/:conversationId/messages', async (c) => {
  try {
    const { conversationId } = c.req.param();
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const conversation = await chatService.getConversation(conversationId);

    if (!conversation) {
      return c.json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      }, 404);
    }

    const messages = await chatService.getMessages(conversation.id, { limit, offset });

    return c.json({
      success: true,
      data: {
        conversation,
        messages
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch messages',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/conversation/:conversationId/rate
 * Rate a conversation (public endpoint)
 */
chat.post('/conversation/:conversationId/rate', async (c) => {
  try {
    const { conversationId } = c.req.param();
    const body = await c.req.json();
    const validation = rateConversationSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { rating, feedback } = validation.data;

    const conversation = await chatService.rateConversation(conversationId, rating, feedback);

    if (!conversation) {
      return c.json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      }, 404);
    }

    return c.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Error rating conversation:', error);
    return c.json({
      success: false,
      error: 'Failed to rate conversation',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/conversation/:conversationId/close
 * Close a conversation (can be called by visitor or agent)
 */
chat.post('/conversation/:conversationId/close', async (c) => {
  try {
    const { conversationId } = c.req.param();

    const conversation = await chatService.closeConversation(conversationId);

    if (!conversation) {
      return c.json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      }, 404);
    }

    return c.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Error closing conversation:', error);
    return c.json({
      success: false,
      error: 'Failed to close conversation',
      message: error.message
    }, 500);
  }
});

// =============================================================================
// Authenticated Routes (Require JWT)
// =============================================================================

/**
 * POST /v1/chat/widgets
 * Create a new chat widget (authenticated)
 */
chat.post('/widgets', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const body = await c.req.json();

    const validation = createWidgetSchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const widget = await chatService.createWidget({
      tenantId,
      createdBy: userId,
      ...validation.data
    });

    return c.json({
      success: true,
      data: widget
    });
  } catch (error) {
    console.error('Error creating widget:', error);
    return c.json({
      success: false,
      error: 'Failed to create widget',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/chat/agent/conversations
 * Get active conversations for logged-in agent
 */
chat.get('/agent/conversations', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');

    const conversations = await chatService.getAgentConversations(userId, tenantId);

    return c.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Error fetching agent conversations:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch conversations',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/chat/queue
 * Get unassigned conversations (queue)
 */
chat.get('/queue', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    const conversations = await chatService.getUnassignedConversations(tenantId);

    return c.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch queue',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/agent/presence
 * Update agent presence status
 */
chat.post('/agent/presence', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const { status, socketId } = await c.req.json();

    const presence = await chatService.updateAgentPresence(userId, tenantId, status, socketId);

    return c.json({
      success: true,
      data: presence
    });
  } catch (error) {
    console.error('Error updating presence:', error);
    return c.json({
      success: false,
      error: 'Failed to update presence',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/chat/stats
 * Get chat statistics for tenant
 */
chat.get('/stats', extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = c.req.query('end_date') || new Date().toISOString().split('T')[0];

    const stats = await chatService.getChatStats(tenantId, startDate, endDate);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch stats',
      message: error.message
    }, 500);
  }
});

/**
 * POST /v1/chat/conversation/:conversationId/read
 * Mark messages as read
 */
chat.post('/conversation/:conversationId/read', extractTenantId, async (c) => {
  try {
    const { conversationId } = c.req.param();
    const { senderType } = await c.req.json();

    const conversation = await chatService.getConversation(conversationId);

    if (!conversation) {
      return c.json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      }, 404);
    }

    await chatService.markMessagesAsRead(conversation.id, senderType);

    return c.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return c.json({
      success: false,
      error: 'Failed to mark messages as read',
      message: error.message
    }, 500);
  }
});

export default chat;
