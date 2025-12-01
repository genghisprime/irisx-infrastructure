/**
 * Email API Routes
 * Send emails with automatic least-cost routing and failover
 */

import { Hono } from 'hono';
import { sendEmail } from '../services/email-service.js';

const app = new Hono();

/**
 * POST /v1/emails - Send email with LCR
 *
 * Request body:
 * {
 *   "to": "user@example.com" or ["user1@example.com", "user2@example.com"],
 *   "subject": "Email subject",
 *   "html": "<p>HTML body</p>",
 *   "text": "Plain text body (optional)",
 *   "from": "custom@sender.com (optional)",
 *   "replyTo": "reply@example.com (optional)",
 *   "attachments": [{ filename, content, type }] (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "provider": "Elastic Email Primary",
 *   "messageId": "abc123",
 *   "deliveryTime": 2,
 *   "attemptedProviders": 1
 * }
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.to) {
      return c.json({
        error: 'Missing required field: to'
      }, 400);
    }

    if (!body.subject) {
      return c.json({
        error: 'Missing required field: subject'
      }, 400);
    }

    if (!body.html && !body.text) {
      return c.json({
        error: 'Missing required field: html or text must be provided'
      }, 400);
    }

    // Extract tenant ID from JWT token (if available)
    const user = c.get('user');
    const tenantId = user?.tenantId || null;

    // Send email with LCR
    const result = await sendEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      from: body.from,
      replyTo: body.replyTo,
      attachments: body.attachments,
      tenantId,
      messageId: null // Can be linked to emails table if needed
    });

    return c.json(result, 200);
  } catch (error) {
    console.error('[Email API] Send failed:', error);

    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /v1/emails/test - Test email delivery
 *
 * Sends a test email to verify configuration
 */
app.post('/test', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.to) {
      return c.json({
        error: 'Missing required field: to'
      }, 400);
    }

    // Send test email
    const result = await sendEmail({
      to: body.to,
      subject: 'IRISX Test Email',
      html: '<h1>Test Email</h1><p>This is a test email from IRISX. If you received this, your email configuration is working correctly!</p>',
      text: 'Test Email\n\nThis is a test email from IRISX. If you received this, your email configuration is working correctly!',
      tenantId: null,
      messageId: null
    });

    return c.json({
      success: true,
      message: 'Test email sent successfully',
      ...result
    }, 200);
  } catch (error) {
    console.error('[Email API] Test email failed:', error);

    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default app;
