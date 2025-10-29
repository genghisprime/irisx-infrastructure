/**
 * Contact Management Service
 * Handles CRUD operations for contacts, lists, and imports
 *
 * Week 13-14: Contact Management API
 */

import { query } from '../db/connection.js';

class ContactService {
  /**
   * Create a new contact
   */
  async createContact(tenantId, contactData) {
    const {
      first_name,
      last_name,
      email,
      phone,
      phone_2,
      company,
      title,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country = 'US',
      custom_fields = {},
      tags = [],
      do_not_call = false,
      do_not_sms = false
    } = contactData;

    try {
      const result = await query(
        `INSERT INTO contacts (
          tenant_id, first_name, last_name, email, phone, phone_2,
          company, title, address_line1, address_line2, city, state, postal_code, country,
          custom_fields, tags, do_not_call, do_not_sms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          tenantId, first_name, last_name, email, phone, phone_2,
          company, title, address_line1, address_line2, city, state, postal_code, country,
          JSON.stringify(custom_fields), tags, do_not_call, do_not_sms
        ]
      );

      await this.logActivity(result.rows[0].id, tenantId, 'contact_created', {});

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Contact with this phone or email already exists');
      }
      throw error;
    }
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId, tenantId) {
    const result = await query(
      'SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2',
      [contactId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update contact
   */
  async updateContact(contactId, tenantId, updates) {
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'phone_2',
      'company', 'title', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country',
      'custom_fields', 'tags', 'do_not_call', 'do_not_sms'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(key === 'custom_fields' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(contactId, tenantId);

    const result = await query(
      `UPDATE contacts
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Contact not found');
    }

    await this.logActivity(contactId, tenantId, 'contact_updated', updates);

    return result.rows[0];
  }

  /**
   * Delete contact
   */
  async deleteContact(contactId, tenantId) {
    const result = await query(
      'DELETE FROM contacts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [contactId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Contact not found');
    }

    return true;
  }

  /**
   * List contacts with pagination and filtering
   */
  async listContacts(tenantId, options = {}) {
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
    } = options;

    let whereClause = 'c.tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    // Search by name, email, or phone
    if (search) {
      whereClause += ` AND (
        c.first_name ILIKE $${paramCount} OR
        c.last_name ILIKE $${paramCount} OR
        c.email ILIKE $${paramCount} OR
        c.phone LIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      whereClause += ` AND c.tags && $${paramCount}`;
      params.push(tags);
      paramCount++;
    }

    // Filter by list membership
    let joinClause = '';
    if (list_id) {
      joinClause = `
        INNER JOIN contact_list_members clm ON c.id = clm.contact_id
      `;
      whereClause += ` AND clm.list_id = $${paramCount}`;
      params.push(list_id);
      paramCount++;
    }

    // Filter by communication preferences
    if (opt_in_sms !== undefined) {
      whereClause += ` AND c.opt_in_sms = $${paramCount}`;
      params.push(opt_in_sms);
      paramCount++;
    }

    if (opt_in_email !== undefined) {
      whereClause += ` AND c.opt_in_email = $${paramCount}`;
      params.push(opt_in_email);
      paramCount++;
    }

    if (opt_in_voice !== undefined) {
      whereClause += ` AND c.opt_in_voice = $${paramCount}`;
      params.push(opt_in_voice);
      paramCount++;
    }

    if (dnc !== undefined) {
      whereClause += ` AND c.dnc = $${paramCount}`;
      params.push(dnc);
      paramCount++;
    }

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT c.* FROM contacts c
       ${joinClause}
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(DISTINCT c.id) as total FROM contacts c
       ${joinClause}
       WHERE ${whereClause}`,
      params
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
   * Add tags to contact
   */
  async addTags(contactId, tenantId, newTags) {
    const result = await query(
      `UPDATE contacts
       SET tags = array(SELECT DISTINCT unnest(tags || $1::varchar[]))
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [newTags, contactId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Contact not found');
    }

    await this.logActivity(contactId, tenantId, 'tags_added', { tags: newTags });

    return result.rows[0];
  }

  /**
   * Remove tags from contact
   */
  async removeTags(contactId, tenantId, tagsToRemove) {
    const result = await query(
      `UPDATE contacts
       SET tags = array(SELECT unnest(tags) EXCEPT SELECT unnest($1::varchar[]))
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [tagsToRemove, contactId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Contact not found');
    }

    await this.logActivity(contactId, tenantId, 'tags_removed', { tags: tagsToRemove });

    return result.rows[0];
  }

  /**
   * Get contact activity timeline
   */
  async getContactActivity(contactId, tenantId, limit = 50) {
    const result = await query(
      `SELECT ca.*,
              c.direction as call_direction, c.status as call_status,
              s.direction as sms_direction, s.status as sms_status,
              e.subject as email_subject, e.status as email_status
       FROM contact_activity ca
       LEFT JOIN calls c ON ca.call_id = c.id
       LEFT JOIN sms_messages s ON ca.sms_id = s.id
       LEFT JOIN emails e ON ca.email_id = e.id
       WHERE ca.contact_id = $1 AND ca.tenant_id = $2
       ORDER BY ca.created_at DESC
       LIMIT $3`,
      [contactId, tenantId, limit]
    );

    return result.rows;
  }

  /**
   * Log contact activity
   */
  async logActivity(contactId, tenantId, activityType, activityData = {}) {
    try {
      await query(
        `INSERT INTO contact_activity (contact_id, tenant_id, activity_type, activity_data)
         VALUES ($1, $2, $3, $4)`,
        [contactId, tenantId, activityType, JSON.stringify(activityData)]
      );
    } catch (error) {
      console.error('Error logging contact activity:', error);
      // Don't throw - activity logging shouldn't break main operations
    }
  }

  /**
   * Update last_contacted_at timestamp
   */
  async updateLastContacted(contactId, tenantId) {
    await query(
      'UPDATE contacts SET last_contacted_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [contactId, tenantId]
    );
  }

  /**
   * Bulk create contacts (for imports)
   */
  async bulkCreateContacts(tenantId, contacts, importId = null) {
    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    for (const contactData of contacts) {
      try {
        // Check if contact exists
        let existingContact = null;
        if (contactData.phone) {
          const phoneCheck = await query(
            'SELECT id FROM contacts WHERE tenant_id = $1 AND phone = $2',
            [tenantId, contactData.phone]
          );
          existingContact = phoneCheck.rows[0];
        } else if (contactData.email) {
          const emailCheck = await query(
            'SELECT id FROM contacts WHERE tenant_id = $1 AND email = $2',
            [tenantId, contactData.email]
          );
          existingContact = emailCheck.rows[0];
        }

        if (existingContact) {
          // Update existing contact
          await this.updateContact(existingContact.id, tenantId, contactData);
          results.updated++;
        } else {
          // Create new contact
          await this.createContact(tenantId, {
            ...contactData,
            source: 'import',
            import_id: importId
          });
          results.imported++;
        }
      } catch (error) {
        results.errors.push({
          contact: contactData,
          error: error.message
        });
      }
    }

    return results;
  }
}

export default new ContactService();
