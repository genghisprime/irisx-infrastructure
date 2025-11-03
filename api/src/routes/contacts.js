/**
 * Contact Management API Routes
 * Week 13-14: Contact Management System
 *
 * Endpoints:
 * - POST   /v1/contacts                 Create contact
 * - GET    /v1/contacts                 List contacts
 * - GET    /v1/contacts/:id             Get contact
 * - PUT    /v1/contacts/:id             Update contact
 * - DELETE /v1/contacts/:id             Delete contact
 * - POST   /v1/contacts/:id/tags        Add tags
 * - DELETE /v1/contacts/:id/tags        Remove tags
 * - GET    /v1/contacts/:id/activity    Get activity timeline
 * - POST   /v1/contacts/import          Bulk import contacts
 * - GET    /v1/contacts/lists/:id       Get contacts in list
 * - POST   /v1/contacts/lists/:id/add   Add contacts to list
 * - DELETE /v1/contacts/lists/:id/remove Remove contacts from list
 */

import { Hono } from 'hono';
import contactService from '../services/contacts.js';
import contactListService from '../services/contact-lists.js';

const contacts = new Hono();

/**
 * @route POST /v1/contacts
 * @desc Create a new contact
 */
contacts.post('/', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const contact = await contactService.createContact(tenantId, body);

    return c.json({ contact }, 201);
  } catch (error) {
    console.error('Error creating contact:', error);
    return c.json({ error: 'Failed to create contact', message: error.message }, 400);
  }
});

/**
 * @route GET /v1/contacts
 * @desc List contacts with filtering and pagination
 */
contacts.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const {
      page = 1,
      limit = 50,
      search,
      tags,
      list_id,
      opt_in_sms,
      opt_in_email,
      opt_in_voice,
      dnc
    } = c.req.query();

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      tags: tags ? tags.split(',') : undefined,
      list_id: list_id ? parseInt(list_id) : undefined,
      opt_in_sms: opt_in_sms !== undefined ? opt_in_sms === 'true' : undefined,
      opt_in_email: opt_in_email !== undefined ? opt_in_email === 'true' : undefined,
      opt_in_voice: opt_in_voice !== undefined ? opt_in_voice === 'true' : undefined,
      dnc: dnc !== undefined ? dnc === 'true' : undefined
    };

    const result = await contactService.listContacts(tenantId, options);

    return c.json(result);
  } catch (error) {
    console.error('Error listing contacts:', error);
    return c.json({ error: 'Failed to list contacts', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/contacts/:id
 * @desc Get contact by ID
 */
contacts.get('/:id', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    const contact = await contactService.getContact(contactId, tenantId);

    if (!contact) {
      return c.json({ error: 'Contact not found' }, 404);
    }

    return c.json({ contact });
  } catch (error) {
    console.error('Error getting contact:', error);
    return c.json({ error: 'Failed to get contact', message: error.message }, 500);
  }
});

/**
 * @route PUT /v1/contacts/:id
 * @desc Update contact
 */
contacts.put('/:id', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const updates = await c.req.json();

    const contact = await contactService.updateContact(contactId, tenantId, updates);

    return c.json({ contact });
  } catch (error) {
    console.error('Error updating contact:', error);
    return c.json({ error: 'Failed to update contact', message: error.message }, 400);
  }
});

/**
 * @route DELETE /v1/contacts/:id
 * @desc Delete contact
 */
contacts.delete('/:id', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    await contactService.deleteContact(contactId, tenantId);

    return c.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return c.json({ error: 'Failed to delete contact', message: error.message }, 400);
  }
});

/**
 * @route POST /v1/contacts/:id/tags
 * @desc Add tags to contact
 */
contacts.post('/:id/tags', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { tags } = await c.req.json();

    if (!Array.isArray(tags) || tags.length === 0) {
      return c.json({ error: 'Tags must be a non-empty array' }, 400);
    }

    const contact = await contactService.addTags(contactId, tenantId, tags);

    return c.json({ contact });
  } catch (error) {
    console.error('Error adding tags:', error);
    return c.json({ error: 'Failed to add tags', message: error.message }, 400);
  }
});

/**
 * @route DELETE /v1/contacts/:id/tags
 * @desc Remove tags from contact
 */
contacts.delete('/:id/tags', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { tags } = await c.req.json();

    if (!Array.isArray(tags) || tags.length === 0) {
      return c.json({ error: 'Tags must be a non-empty array' }, 400);
    }

    const contact = await contactService.removeTags(contactId, tenantId, tags);

    return c.json({ contact });
  } catch (error) {
    console.error('Error removing tags:', error);
    return c.json({ error: 'Failed to remove tags', message: error.message }, 400);
  }
});

/**
 * @route GET /v1/contacts/:id/activity
 * @desc Get contact activity timeline
 */
contacts.get('/:id/activity', async (c) => {
  try {
    const contactId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { limit = 50 } = c.req.query();

    const activity = await contactService.getContactActivity(contactId, tenantId, parseInt(limit));

    return c.json({ activity });
  } catch (error) {
    console.error('Error getting contact activity:', error);
    return c.json({ error: 'Failed to get activity', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/contacts/import
 * @desc Bulk import contacts
 */
contacts.post('/import', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { contacts: contactsData } = await c.req.json();

    if (!Array.isArray(contactsData) || contactsData.length === 0) {
      return c.json({ error: 'Contacts must be a non-empty array' }, 400);
    }

    const results = await contactService.bulkCreateContacts(tenantId, contactsData);

    return c.json({
      message: 'Import completed',
      results
    });
  } catch (error) {
    console.error('Error importing contacts:', error);
    return c.json({ error: 'Failed to import contacts', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/contacts/lists/:id
 * @desc Get contacts in a list
 */
contacts.get('/lists/:id', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { page = 1, limit = 50 } = c.req.query();

    const result = await contactListService.getListMembers(listId, tenantId, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return c.json(result);
  } catch (error) {
    console.error('Error getting list members:', error);
    return c.json({ error: 'Failed to get list members', message: error.message }, 500);
  }
});

/**
 * @route POST /v1/contacts/lists/:id/add
 * @desc Add contacts to a list
 */
contacts.post('/lists/:id/add', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { contact_ids } = await c.req.json();

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return c.json({ error: 'contact_ids must be a non-empty array' }, 400);
    }

    const result = await contactListService.addContactsToList(listId, tenantId, contact_ids);

    return c.json({
      message: 'Contacts added to list',
      ...result
    });
  } catch (error) {
    console.error('Error adding contacts to list:', error);
    return c.json({ error: 'Failed to add contacts', message: error.message }, 400);
  }
});

/**
 * @route DELETE /v1/contacts/lists/:id/remove
 * @desc Remove contacts from a list
 */
contacts.delete('/lists/:id/remove', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const { contact_ids } = await c.req.json();

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return c.json({ error: 'contact_ids must be a non-empty array' }, 400);
    }

    const result = await contactListService.removeContactsFromList(listId, tenantId, contact_ids);

    return c.json({
      message: 'Contacts removed from list',
      ...result
    });
  } catch (error) {
    console.error('Error removing contacts from list:', error);
    return c.json({ error: 'Failed to remove contacts', message: error.message }, 400);
  }
});

export default contacts;
