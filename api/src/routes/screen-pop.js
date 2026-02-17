/**
 * Screen Pop Routes
 * API endpoints for customer lookup and context during calls
 */

import { Hono } from 'hono';
import { z } from 'zod';
import screenPopService from '../services/screen-pop.js';

const app = new Hono();

// Validation schemas
const lookupSchema = z.object({
  phone: z.string().min(1)
});

const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  company: z.string().max(200).optional(),
  phone: z.string().min(1)
});

const noteSchema = z.object({
  contact_id: z.string().or(z.number()),
  call_sid: z.string().optional(),
  text: z.string().min(1).max(5000)
});

const interactionSchema = z.object({
  contact_id: z.string().or(z.number()),
  type: z.enum(['call', 'email', 'chat', 'sms', 'ticket', 'note']),
  summary: z.string().min(1).max(1000),
  call_sid: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Look up customer by phone number
 * GET /v1/screen-pop/lookup?phone=+15551234567
 */
app.get('/lookup', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const phone = c.req.query('phone');

    if (!phone) {
      return c.json({ success: false, error: 'Phone number required' }, 400);
    }

    const customer = await screenPopService.lookupByPhone(tenantId, phone);

    return c.json({
      success: true,
      found: !!customer,
      customer
    });
  } catch (error) {
    console.error('Error looking up customer:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Quick create contact from screen pop
 * POST /v1/screen-pop/contacts
 */
app.post('/contacts', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const agentId = c.get('agentId') || c.get('userId');
    const body = await c.req.json();
    const data = createContactSchema.parse(body);

    const contact = await screenPopService.createQuickContact(tenantId, agentId, data);

    return c.json({
      success: true,
      contact
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error creating contact:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Add note to contact during call
 * POST /v1/screen-pop/notes
 */
app.post('/notes', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const agentId = c.get('agentId') || c.get('userId');
    const agentName = c.get('agentName') || 'Agent';
    const body = await c.req.json();
    const data = noteSchema.parse(body);

    const note = await screenPopService.addCallNote(
      tenantId,
      data.contact_id,
      agentId,
      agentName,
      data.call_sid,
      data.text
    );

    return c.json({
      success: true,
      note
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error adding note:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Log an interaction
 * POST /v1/screen-pop/interactions
 */
app.post('/interactions', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const agentId = c.get('agentId') || c.get('userId');
    const agentName = c.get('agentName') || 'Agent';
    const body = await c.req.json();
    const data = interactionSchema.parse(body);

    const interaction = await screenPopService.logInteraction(tenantId, data.contact_id, {
      type: data.type,
      summary: data.summary,
      agentId,
      agentName,
      callSid: data.call_sid,
      metadata: data.metadata
    });

    return c.json({
      success: true,
      interaction
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error logging interaction:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Get full interaction history for a contact
 * GET /v1/screen-pop/contacts/:id/history
 */
app.get('/contacts/:id/history', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const contactId = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const type = c.req.query('type');

    const interactions = await screenPopService.getInteractionHistory(tenantId, contactId, {
      limit,
      offset,
      type
    });

    return c.json({
      success: true,
      interactions
    });
  } catch (error) {
    console.error('Error getting interaction history:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
