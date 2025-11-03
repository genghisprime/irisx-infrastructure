/**
 * Contact Lists API Routes
 * Week 13-14: Contact Management System
 *
 * Endpoints:
 * - POST   /v1/lists          Create list
 * - GET    /v1/lists          List all lists
 * - GET    /v1/lists/:id      Get list
 * - PUT    /v1/lists/:id      Update list
 * - DELETE /v1/lists/:id      Delete list
 */

import { Hono } from 'hono';
import contactListService from '../services/contact-lists.js';

const lists = new Hono();

/**
 * @route POST /v1/lists
 * @desc Create a new contact list
 */
lists.post('/', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const body = await c.req.json();

    const list = await contactListService.createList(tenantId, body);

    return c.json({ list }, 201);
  } catch (error) {
    console.error('Error creating list:', error);
    return c.json({ error: 'Failed to create list', message: error.message }, 400);
  }
});

/**
 * @route GET /v1/lists
 * @desc List all contact lists
 */
lists.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId') || 1;
    const { page = 1, limit = 50, type } = c.req.query();

    const result = await contactListService.listLists(tenantId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type
    });

    return c.json(result);
  } catch (error) {
    console.error('Error listing lists:', error);
    return c.json({ error: 'Failed to list lists', message: error.message }, 500);
  }
});

/**
 * @route GET /v1/lists/:id
 * @desc Get list by ID
 */
lists.get('/:id', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    const list = await contactListService.getList(listId, tenantId);

    if (!list) {
      return c.json({ error: 'List not found' }, 404);
    }

    return c.json({ list });
  } catch (error) {
    console.error('Error getting list:', error);
    return c.json({ error: 'Failed to get list', message: error.message }, 500);
  }
});

/**
 * @route PUT /v1/lists/:id
 * @desc Update list
 */
lists.put('/:id', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;
    const updates = await c.req.json();

    const list = await contactListService.updateList(listId, tenantId, updates);

    return c.json({ list });
  } catch (error) {
    console.error('Error updating list:', error);
    return c.json({ error: 'Failed to update list', message: error.message }, 400);
  }
});

/**
 * @route DELETE /v1/lists/:id
 * @desc Delete list
 */
lists.delete('/:id', async (c) => {
  try {
    const listId = c.req.param('id');
    const tenantId = c.get('tenantId') || 1;

    await contactListService.deleteList(listId, tenantId);

    return c.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    return c.json({ error: 'Failed to delete list', message: error.message }, 400);
  }
});

export default lists;
