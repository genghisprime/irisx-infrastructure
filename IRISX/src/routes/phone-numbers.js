/**
 * Phone Numbers API Routes
 *
 * Endpoints:
 * - GET /v1/phone-numbers - List tenant's phone numbers
 * - GET /v1/phone-numbers/search - Search available numbers for purchase
 * - POST /v1/phone-numbers/purchase - Purchase a phone number
 * - GET /v1/phone-numbers/:id - Get phone number details
 * - PUT /v1/phone-numbers/:id - Update phone number configuration
 * - DELETE /v1/phone-numbers/:id - Release/cancel phone number
 * - GET /v1/phone-numbers/:id/usage - Get usage statistics
 */

import { Hono } from 'hono';
import phoneNumbersService from '../services/phoneNumbers.js';

const phoneNumbers = new Hono();

// List tenant's phone numbers
phoneNumbers.get('/', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const filters = {
      status: c.req.query('status') || 'active',
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await phoneNumbersService.listPhoneNumbers(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[PhoneNumbers] Error listing phone numbers:', error);
    return c.json({ error: 'Failed to list phone numbers' }, 500);
  }
});

// Search available phone numbers
phoneNumbers.get('/search', async (c) => {
  try {
    const filters = {
      country_code: c.req.query('country_code') || 'US',
      region: c.req.query('region'),
      city: c.req.query('city'),
      contains: c.req.query('contains'),
      limit: parseInt(c.req.query('limit') || '20')
    };

    const result = await phoneNumbersService.searchAvailableNumbers(filters);

    return c.json(result);
  } catch (error) {
    console.error('[PhoneNumbers] Error searching available numbers:', error);
    return c.json({ error: 'Failed to search phone numbers' }, 500);
  }
});

// Purchase/assign phone number
phoneNumbers.post('/purchase', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const body = await c.req.json();

    const { phone_number, friendly_name, voice_url, sms_url } = body;

    if (!phone_number) {
      return c.json({ error: 'phone_number is required' }, 400);
    }

    const purchasedNumber = await phoneNumbersService.purchasePhoneNumber(
      phone_number,
      tenantId,
      { friendly_name, voice_url, sms_url }
    );

    return c.json({
      message: 'Phone number purchased successfully',
      phone_number: purchasedNumber
    }, 201);
  } catch (error) {
    console.error('[PhoneNumbers] Error purchasing phone number:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get phone number details
phoneNumbers.get('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const phoneNumberId = parseInt(c.req.param('id'));

    const phoneNumber = await phoneNumbersService.getPhoneNumber(phoneNumberId, tenantId);

    return c.json({ phone_number: phoneNumber });
  } catch (error) {
    console.error('[PhoneNumbers] Error getting phone number:', error);
    return c.json({ error: error.message }, error.message.includes('not found') ? 404 : 500);
  }
});

// Update phone number configuration
phoneNumbers.put('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const phoneNumberId = parseInt(c.req.param('id'));
    const updates = await c.req.json();

    const updatedNumber = await phoneNumbersService.updatePhoneNumber(
      phoneNumberId,
      tenantId,
      updates
    );

    return c.json({
      message: 'Phone number updated successfully',
      phone_number: updatedNumber
    });
  } catch (error) {
    console.error('[PhoneNumbers] Error updating phone number:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Release/cancel phone number
phoneNumbers.delete('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const phoneNumberId = parseInt(c.req.param('id'));

    const releasedNumber = await phoneNumbersService.releasePhoneNumber(phoneNumberId, tenantId);

    return c.json({
      message: 'Phone number released successfully',
      phone_number: releasedNumber
    });
  } catch (error) {
    console.error('[PhoneNumbers] Error releasing phone number:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get phone number usage statistics
phoneNumbers.get('/:id/usage', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const phoneNumberId = parseInt(c.req.param('id'));
    const days = parseInt(c.req.query('days') || '30');

    const usage = await phoneNumbersService.getPhoneNumberUsage(phoneNumberId, tenantId, days);

    return c.json({
      phone_number_id: phoneNumberId,
      period: `${days} days`,
      usage
    });
  } catch (error) {
    console.error('[PhoneNumbers] Error getting phone number usage:', error);
    return c.json({ error: 'Failed to get phone number usage' }, 500);
  }
});

export default phoneNumbers;
