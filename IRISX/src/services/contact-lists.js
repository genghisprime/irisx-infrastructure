/**
 * Contact List Management Service
 * Handles list CRUD operations and member management
 *
 * Week 13-14: Contact Management API
 */

import { query } from '../db/connection.js';

class ContactListService {
  /**
   * Create a new contact list
   */
  async createList(tenantId, listData) {
    const {
      name,
      description = null,
      type = 'static',
      filter_criteria = null
    } = listData;

    try {
      const result = await query(
        `INSERT INTO contact_lists (tenant_id, name, description, type, filter_criteria)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, name, description, type, filter_criteria ? JSON.stringify(filter_criteria) : null]
      );

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('List with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Get list by ID
   */
  async getList(listId, tenantId) {
    const result = await query(
      'SELECT * FROM contact_lists WHERE id = $1 AND tenant_id = $2',
      [listId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update list
   */
  async updateList(listId, tenantId, updates) {
    const allowedFields = ['name', 'description', 'type', 'filter_criteria'];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(key === 'filter_criteria' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(listId, tenantId);

    const result = await query(
      `UPDATE contact_lists
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('List not found');
    }

    return result.rows[0];
  }

  /**
   * Delete list
   */
  async deleteList(listId, tenantId) {
    const result = await query(
      'DELETE FROM contact_lists WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [listId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('List not found');
    }

    return true;
  }

  /**
   * List all lists for tenant
   */
  async listLists(tenantId, options = {}) {
    const { page = 1, limit = 50, type } = options;

    let whereClause = 'tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (type) {
      whereClause += ` AND type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM contact_lists
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM contact_lists WHERE ${whereClause}`,
      params
    );

    return {
      lists: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Add contacts to list
   */
  async addContactsToList(listId, tenantId, contactIds) {
    // Verify list exists and belongs to tenant
    const list = await this.getList(listId, tenantId);
    if (!list) {
      throw new Error('List not found');
    }

    const addedCount = 0;
    const errors = [];

    for (const contactId of contactIds) {
      try {
        await query(
          `INSERT INTO contact_list_members (list_id, contact_id)
           VALUES ($1, $2)
           ON CONFLICT (list_id, contact_id) DO NOTHING`,
          [listId, contactId]
        );
      } catch (error) {
        errors.push({ contactId, error: error.message });
      }
    }

    return {
      added: contactIds.length - errors.length,
      errors
    };
  }

  /**
   * Remove contacts from list
   */
  async removeContactsFromList(listId, tenantId, contactIds) {
    // Verify list exists and belongs to tenant
    const list = await this.getList(listId, tenantId);
    if (!list) {
      throw new Error('List not found');
    }

    const result = await query(
      'DELETE FROM contact_list_members WHERE list_id = $1 AND contact_id = ANY($2) RETURNING contact_id',
      [listId, contactIds]
    );

    return {
      removed: result.rows.length
    };
  }

  /**
   * Get list members with pagination
   */
  async getListMembers(listId, tenantId, options = {}) {
    const { page = 1, limit = 50 } = options;

    // Verify list exists and belongs to tenant
    const list = await this.getList(listId, tenantId);
    if (!list) {
      throw new Error('List not found');
    }

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT c.*, clm.added_at
       FROM contacts c
       INNER JOIN contact_list_members clm ON c.id = clm.contact_id
       WHERE clm.list_id = $1 AND c.tenant_id = $2
       ORDER BY clm.added_at DESC
       LIMIT $3 OFFSET $4`,
      [listId, tenantId, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM contact_list_members clm
       INNER JOIN contacts c ON clm.contact_id = c.id
       WHERE clm.list_id = $1 AND c.tenant_id = $2`,
      [listId, tenantId]
    );

    return {
      contacts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Get contact's lists
   */
  async getContactLists(contactId, tenantId) {
    const result = await query(
      `SELECT cl.*, clm.added_at
       FROM contact_lists cl
       INNER JOIN contact_list_members clm ON cl.id = clm.list_id
       WHERE clm.contact_id = $1 AND cl.tenant_id = $2
       ORDER BY clm.added_at DESC`,
      [contactId, tenantId]
    );

    return result.rows;
  }
}

export default new ContactListService();
