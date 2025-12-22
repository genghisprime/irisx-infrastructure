/**
 * Contact Filter Engine Service
 *
 * Dynamic contact list filtering with complex query building,
 * segment management, and real-time list generation
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Filter operators
const OPERATORS = {
  // Comparison
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  GREATER_THAN: 'greater_than',
  GREATER_THAN_OR_EQUALS: 'greater_than_or_equals',
  LESS_THAN: 'less_than',
  LESS_THAN_OR_EQUALS: 'less_than_or_equals',

  // String
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  STARTS_WITH: 'starts_with',
  ENDS_WITH: 'ends_with',
  MATCHES_REGEX: 'matches_regex',

  // Collection
  IN: 'in',
  NOT_IN: 'not_in',

  // Null checks
  IS_NULL: 'is_null',
  IS_NOT_NULL: 'is_not_null',

  // Date
  BEFORE: 'before',
  AFTER: 'after',
  BETWEEN: 'between',
  WITHIN_LAST: 'within_last',
  NOT_WITHIN_LAST: 'not_within_last',

  // Boolean
  IS_TRUE: 'is_true',
  IS_FALSE: 'is_false'
};

// Filter field types
const FIELD_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  JSON: 'json'
};

// Predefined contact fields
const CONTACT_FIELDS = {
  // Core fields
  id: { type: FIELD_TYPES.STRING, column: 'c.id' },
  email: { type: FIELD_TYPES.STRING, column: 'c.email' },
  phone: { type: FIELD_TYPES.STRING, column: 'c.phone' },
  first_name: { type: FIELD_TYPES.STRING, column: 'c.first_name' },
  last_name: { type: FIELD_TYPES.STRING, column: 'c.last_name' },
  company: { type: FIELD_TYPES.STRING, column: 'c.company' },
  title: { type: FIELD_TYPES.STRING, column: 'c.title' },

  // Location
  city: { type: FIELD_TYPES.STRING, column: 'c.city' },
  state: { type: FIELD_TYPES.STRING, column: 'c.state' },
  country: { type: FIELD_TYPES.STRING, column: 'c.country' },
  postal_code: { type: FIELD_TYPES.STRING, column: 'c.postal_code' },
  timezone: { type: FIELD_TYPES.STRING, column: 'c.timezone' },

  // Status
  status: { type: FIELD_TYPES.STRING, column: 'c.status' },
  do_not_contact: { type: FIELD_TYPES.BOOLEAN, column: 'c.do_not_contact' },
  do_not_call: { type: FIELD_TYPES.BOOLEAN, column: 'c.do_not_call' },
  do_not_email: { type: FIELD_TYPES.BOOLEAN, column: 'c.do_not_email' },
  do_not_sms: { type: FIELD_TYPES.BOOLEAN, column: 'c.do_not_sms' },

  // Dates
  created_at: { type: FIELD_TYPES.DATE, column: 'c.created_at' },
  updated_at: { type: FIELD_TYPES.DATE, column: 'c.updated_at' },
  last_contacted_at: { type: FIELD_TYPES.DATE, column: 'c.last_contacted_at' },

  // Engagement
  total_calls: { type: FIELD_TYPES.NUMBER, column: 'c.total_calls' },
  total_emails: { type: FIELD_TYPES.NUMBER, column: 'c.total_emails' },
  total_sms: { type: FIELD_TYPES.NUMBER, column: 'c.total_sms' },

  // Tags and custom
  tags: { type: FIELD_TYPES.ARRAY, column: 'c.tags' },
  custom_fields: { type: FIELD_TYPES.JSON, column: 'c.custom_fields' },
  source: { type: FIELD_TYPES.STRING, column: 'c.source' },

  // Lists
  list_id: { type: FIELD_TYPES.STRING, column: 'cl.list_id', join: 'contact_lists' }
};

/**
 * Contact Filter Engine Service
 */
class ContactFilterEngineService {
  constructor() {
    this.paramIndex = 0;
  }

  // ============================================
  // Filter Building
  // ============================================

  /**
   * Build SQL from filter definition
   */
  buildFilterQuery(tenantId, filters, options = {}) {
    this.paramIndex = 0;
    const params = [tenantId];

    const {
      limit = 1000,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'DESC',
      countOnly = false,
      includeMetadata = false
    } = options;

    // Determine required joins
    const joins = this.determineJoins(filters);

    // Build WHERE clause
    const whereClause = this.buildWhereClause(filters, params);

    // Build SELECT
    let selectClause;
    if (countOnly) {
      selectClause = 'SELECT COUNT(DISTINCT c.id) as total';
    } else if (includeMetadata) {
      selectClause = `
        SELECT DISTINCT c.*,
          (SELECT COUNT(*) FROM calls WHERE contact_id = c.id) as call_count,
          (SELECT COUNT(*) FROM sms_messages WHERE contact_id = c.id) as sms_count,
          (SELECT MAX(created_at) FROM calls WHERE contact_id = c.id) as last_call_at
      `;
    } else {
      selectClause = 'SELECT DISTINCT c.*';
    }

    // Build query
    let sql = `
      ${selectClause}
      FROM contacts c
      ${joins.map(j => j.sql).join('\n')}
      WHERE c.tenant_id = $1
    `;

    if (whereClause) {
      sql += ` AND ${whereClause}`;
    }

    if (!countOnly) {
      // Validate order by field
      const validOrderFields = ['created_at', 'updated_at', 'last_contacted_at', 'first_name', 'last_name', 'email', 'company'];
      const safeOrderBy = validOrderFields.includes(orderBy) ? orderBy : 'created_at';
      const safeOrderDir = orderDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      sql += ` ORDER BY c.${safeOrderBy} ${safeOrderDir}`;

      params.push(limit);
      sql += ` LIMIT $${params.length}`;

      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }

    return { sql, params };
  }

  /**
   * Determine required table joins
   */
  determineJoins(filters) {
    const joins = new Set();

    const checkFilter = (filter) => {
      if (filter.field) {
        const fieldDef = CONTACT_FIELDS[filter.field];
        if (fieldDef?.join) {
          joins.add(fieldDef.join);
        }
      }
      if (filter.conditions) {
        filter.conditions.forEach(checkFilter);
      }
    };

    if (filters.conditions) {
      filters.conditions.forEach(checkFilter);
    } else if (filters.field) {
      checkFilter(filters);
    }

    const joinSql = {
      contact_lists: {
        sql: 'LEFT JOIN contact_list_members cl ON c.id = cl.contact_id',
        alias: 'cl'
      },
      campaigns: {
        sql: 'LEFT JOIN campaign_contacts cc ON c.id = cc.contact_id',
        alias: 'cc'
      },
      calls: {
        sql: 'LEFT JOIN calls calls ON c.id = calls.contact_id',
        alias: 'calls'
      }
    };

    return Array.from(joins).map(j => joinSql[j]).filter(Boolean);
  }

  /**
   * Build WHERE clause from filters
   */
  buildWhereClause(filters, params) {
    if (!filters || (!filters.conditions && !filters.field)) {
      return '';
    }

    // Handle group (AND/OR)
    if (filters.conditions) {
      const operator = filters.operator?.toUpperCase() === 'OR' ? ' OR ' : ' AND ';
      const clauses = filters.conditions
        .map(f => this.buildWhereClause(f, params))
        .filter(c => c);

      if (clauses.length === 0) return '';
      if (clauses.length === 1) return clauses[0];
      return `(${clauses.join(operator)})`;
    }

    // Handle single condition
    return this.buildCondition(filters, params);
  }

  /**
   * Build single condition SQL
   */
  buildCondition(filter, params) {
    const { field, operator, value, value2 } = filter;

    // Get field definition
    const fieldDef = CONTACT_FIELDS[field];
    if (!fieldDef) {
      // Handle custom fields
      if (field.startsWith('custom.')) {
        const customField = field.replace('custom.', '');
        return this.buildCustomFieldCondition(customField, operator, value, params);
      }
      throw new Error(`Unknown field: ${field}`);
    }

    const column = fieldDef.column;

    switch (operator) {
      // Comparison operators
      case OPERATORS.EQUALS:
        params.push(value);
        return `${column} = $${params.length}`;

      case OPERATORS.NOT_EQUALS:
        params.push(value);
        return `${column} != $${params.length}`;

      case OPERATORS.GREATER_THAN:
        params.push(value);
        return `${column} > $${params.length}`;

      case OPERATORS.GREATER_THAN_OR_EQUALS:
        params.push(value);
        return `${column} >= $${params.length}`;

      case OPERATORS.LESS_THAN:
        params.push(value);
        return `${column} < $${params.length}`;

      case OPERATORS.LESS_THAN_OR_EQUALS:
        params.push(value);
        return `${column} <= $${params.length}`;

      // String operators
      case OPERATORS.CONTAINS:
        params.push(`%${value}%`);
        return `${column} ILIKE $${params.length}`;

      case OPERATORS.NOT_CONTAINS:
        params.push(`%${value}%`);
        return `${column} NOT ILIKE $${params.length}`;

      case OPERATORS.STARTS_WITH:
        params.push(`${value}%`);
        return `${column} ILIKE $${params.length}`;

      case OPERATORS.ENDS_WITH:
        params.push(`%${value}`);
        return `${column} ILIKE $${params.length}`;

      case OPERATORS.MATCHES_REGEX:
        params.push(value);
        return `${column} ~ $${params.length}`;

      // Collection operators
      case OPERATORS.IN:
        if (!Array.isArray(value) || value.length === 0) {
          return '1=0'; // No matches
        }
        const inPlaceholders = value.map((v, i) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${column} IN (${inPlaceholders.join(', ')})`;

      case OPERATORS.NOT_IN:
        if (!Array.isArray(value) || value.length === 0) {
          return '1=1'; // All match
        }
        const notInPlaceholders = value.map((v, i) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${column} NOT IN (${notInPlaceholders.join(', ')})`;

      // Null operators
      case OPERATORS.IS_NULL:
        return `${column} IS NULL`;

      case OPERATORS.IS_NOT_NULL:
        return `${column} IS NOT NULL`;

      // Date operators
      case OPERATORS.BEFORE:
        params.push(value);
        return `${column} < $${params.length}`;

      case OPERATORS.AFTER:
        params.push(value);
        return `${column} > $${params.length}`;

      case OPERATORS.BETWEEN:
        params.push(value);
        params.push(value2);
        return `${column} BETWEEN $${params.length - 1} AND $${params.length}`;

      case OPERATORS.WITHIN_LAST:
        // value is like "7 days", "30 days", "1 month"
        return `${column} >= NOW() - INTERVAL '${this.sanitizeInterval(value)}'`;

      case OPERATORS.NOT_WITHIN_LAST:
        return `${column} < NOW() - INTERVAL '${this.sanitizeInterval(value)}'`;

      // Boolean operators
      case OPERATORS.IS_TRUE:
        return `${column} = true`;

      case OPERATORS.IS_FALSE:
        return `${column} = false`;

      // Array operators (for tags)
      default:
        if (fieldDef.type === FIELD_TYPES.ARRAY) {
          if (operator === 'contains') {
            params.push(value);
            return `$${params.length} = ANY(${column})`;
          }
          if (operator === 'contains_all') {
            params.push(value);
            return `${column} @> $${params.length}`;
          }
          if (operator === 'contains_any') {
            params.push(value);
            return `${column} && $${params.length}`;
          }
        }
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Build condition for custom JSONB fields
   */
  buildCustomFieldCondition(fieldName, operator, value, params) {
    const jsonPath = `c.custom_fields->>'${fieldName}'`;

    switch (operator) {
      case OPERATORS.EQUALS:
        params.push(value);
        return `${jsonPath} = $${params.length}`;

      case OPERATORS.NOT_EQUALS:
        params.push(value);
        return `${jsonPath} != $${params.length}`;

      case OPERATORS.CONTAINS:
        params.push(`%${value}%`);
        return `${jsonPath} ILIKE $${params.length}`;

      case OPERATORS.IS_NULL:
        return `${jsonPath} IS NULL`;

      case OPERATORS.IS_NOT_NULL:
        return `${jsonPath} IS NOT NULL`;

      default:
        params.push(value);
        return `${jsonPath} = $${params.length}`;
    }
  }

  /**
   * Sanitize interval string
   */
  sanitizeInterval(interval) {
    // Allow formats like "7 days", "30 days", "1 month", "1 year"
    const match = interval.match(/^(\d+)\s+(day|days|week|weeks|month|months|year|years)$/i);
    if (!match) {
      return '30 days'; // Default
    }
    return `${match[1]} ${match[2].toLowerCase()}`;
  }

  // ============================================
  // Dynamic Lists
  // ============================================

  /**
   * Create dynamic contact list
   */
  async createDynamicList(tenantId, listData, createdBy) {
    const {
      name,
      description,
      filters,
      autoRefresh = true,
      refreshIntervalMinutes = 60
    } = listData;

    if (!name || !filters) {
      throw new Error('name and filters are required');
    }

    // Validate filters by building query
    this.buildFilterQuery(tenantId, filters, { countOnly: true });

    const listId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO dynamic_contact_lists (
        id, tenant_id, name, description, filter_definition,
        auto_refresh, refresh_interval_minutes, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [
      listId, tenantId, name, description, JSON.stringify(filters),
      autoRefresh, refreshIntervalMinutes, createdBy
    ]);

    // Initial population
    await this.refreshDynamicList(listId);

    return result.rows[0];
  }

  /**
   * Get dynamic list with count
   */
  async getDynamicList(listId) {
    const result = await query(`
      SELECT dl.*,
        (SELECT COUNT(*) FROM dynamic_list_contacts WHERE list_id = dl.id) as contact_count
      FROM dynamic_contact_lists dl
      WHERE dl.id = $1
    `, [listId]);

    return result.rows[0];
  }

  /**
   * Get dynamic lists for tenant
   */
  async getDynamicLists(tenantId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await query(`
      SELECT dl.*,
        (SELECT COUNT(*) FROM dynamic_list_contacts WHERE list_id = dl.id) as contact_count
      FROM dynamic_contact_lists dl
      WHERE dl.tenant_id = $1
      ORDER BY dl.created_at DESC
      LIMIT $2 OFFSET $3
    `, [tenantId, limit, offset]);

    return result.rows;
  }

  /**
   * Refresh dynamic list membership
   */
  async refreshDynamicList(listId) {
    // Get list definition
    const listResult = await query(
      'SELECT * FROM dynamic_contact_lists WHERE id = $1',
      [listId]
    );

    if (listResult.rows.length === 0) {
      throw new Error('List not found');
    }

    const list = listResult.rows[0];
    const filters = typeof list.filter_definition === 'string'
      ? JSON.parse(list.filter_definition)
      : list.filter_definition;

    // Get matching contacts
    const { sql, params } = this.buildFilterQuery(list.tenant_id, filters, {
      limit: 100000 // Max contacts per list
    });

    const contacts = await query(sql, params);

    // Clear current membership
    await query('DELETE FROM dynamic_list_contacts WHERE list_id = $1', [listId]);

    // Insert new membership
    if (contacts.rows.length > 0) {
      const values = contacts.rows.map((c, i) => `($1, $${i + 2})`).join(', ');
      const contactIds = contacts.rows.map(c => c.id);

      await query(`
        INSERT INTO dynamic_list_contacts (list_id, contact_id)
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `, [listId, ...contactIds]);
    }

    // Update last refresh time
    await query(`
      UPDATE dynamic_contact_lists
      SET last_refreshed_at = NOW(), last_contact_count = $1
      WHERE id = $2
    `, [contacts.rows.length, listId]);

    return {
      listId,
      contactCount: contacts.rows.length,
      refreshedAt: new Date()
    };
  }

  /**
   * Get contacts from dynamic list
   */
  async getDynamicListContacts(listId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const result = await query(`
      SELECT c.* FROM contacts c
      JOIN dynamic_list_contacts dlc ON c.id = dlc.contact_id
      WHERE dlc.list_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `, [listId, limit, offset]);

    return result.rows;
  }

  /**
   * Update dynamic list
   */
  async updateDynamicList(listId, updates, updatedBy) {
    const allowedFields = ['name', 'description', 'filter_definition', 'auto_refresh', 'refresh_interval_minutes'];
    const setClauses = [];
    const params = [listId];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        params.push(key === 'filter_definition' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(updatedBy);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push('updated_at = NOW()');

    await query(`
      UPDATE dynamic_contact_lists
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);

    // Refresh if filters changed
    if (updates.filter_definition) {
      await this.refreshDynamicList(listId);
    }

    return this.getDynamicList(listId);
  }

  /**
   * Delete dynamic list
   */
  async deleteDynamicList(listId) {
    await query('DELETE FROM dynamic_list_contacts WHERE list_id = $1', [listId]);
    await query('DELETE FROM dynamic_contact_lists WHERE id = $1', [listId]);
    return { deleted: true };
  }

  // ============================================
  // Segments
  // ============================================

  /**
   * Create segment (saved filter)
   */
  async createSegment(tenantId, segmentData, createdBy) {
    const {
      name,
      description,
      filters,
      color,
      isGlobal = false
    } = segmentData;

    const segmentId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO contact_segments (
        id, tenant_id, name, description, filter_definition,
        color, is_global, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [
      segmentId, tenantId, name, description, JSON.stringify(filters),
      color, isGlobal, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get segments for tenant
   */
  async getSegments(tenantId) {
    const result = await query(`
      SELECT * FROM contact_segments
      WHERE tenant_id = $1 OR is_global = true
      ORDER BY name ASC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Apply segment filter
   */
  async applySegment(tenantId, segmentId, options = {}) {
    const segmentResult = await query(
      'SELECT * FROM contact_segments WHERE id = $1',
      [segmentId]
    );

    if (segmentResult.rows.length === 0) {
      throw new Error('Segment not found');
    }

    const segment = segmentResult.rows[0];
    const filters = typeof segment.filter_definition === 'string'
      ? JSON.parse(segment.filter_definition)
      : segment.filter_definition;

    const { sql, params } = this.buildFilterQuery(tenantId, filters, options);
    const result = await query(sql, params);

    return result.rows;
  }

  // ============================================
  // Query Execution
  // ============================================

  /**
   * Execute filter query
   */
  async executeFilter(tenantId, filters, options = {}) {
    const { sql, params } = this.buildFilterQuery(tenantId, filters, options);
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Count matching contacts
   */
  async countMatching(tenantId, filters) {
    const { sql, params } = this.buildFilterQuery(tenantId, filters, { countOnly: true });
    const result = await query(sql, params);
    return parseInt(result.rows[0]?.total || 0);
  }

  /**
   * Preview filter results
   */
  async previewFilter(tenantId, filters, limit = 10) {
    const contacts = await this.executeFilter(tenantId, filters, { limit, includeMetadata: true });
    const total = await this.countMatching(tenantId, filters);

    return {
      preview: contacts,
      total,
      filters
    };
  }

  // ============================================
  // Background Refresh
  // ============================================

  /**
   * Refresh all auto-refresh lists
   */
  async refreshAllLists() {
    const lists = await query(`
      SELECT id FROM dynamic_contact_lists
      WHERE auto_refresh = true
        AND (last_refreshed_at IS NULL OR
             last_refreshed_at < NOW() - (refresh_interval_minutes || ' minutes')::INTERVAL)
    `);

    const results = [];
    for (const list of lists.rows) {
      try {
        const result = await this.refreshDynamicList(list.id);
        results.push({ listId: list.id, success: true, ...result });
      } catch (error) {
        results.push({ listId: list.id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get available fields for filtering
   */
  getAvailableFields() {
    return Object.entries(CONTACT_FIELDS).map(([name, def]) => ({
      name,
      type: def.type,
      operators: this.getOperatorsForType(def.type)
    }));
  }

  /**
   * Get valid operators for field type
   */
  getOperatorsForType(type) {
    const commonOperators = [OPERATORS.EQUALS, OPERATORS.NOT_EQUALS, OPERATORS.IS_NULL, OPERATORS.IS_NOT_NULL];

    switch (type) {
      case FIELD_TYPES.STRING:
        return [...commonOperators, OPERATORS.CONTAINS, OPERATORS.NOT_CONTAINS,
                OPERATORS.STARTS_WITH, OPERATORS.ENDS_WITH, OPERATORS.IN, OPERATORS.NOT_IN];
      case FIELD_TYPES.NUMBER:
        return [...commonOperators, OPERATORS.GREATER_THAN, OPERATORS.GREATER_THAN_OR_EQUALS,
                OPERATORS.LESS_THAN, OPERATORS.LESS_THAN_OR_EQUALS, OPERATORS.BETWEEN];
      case FIELD_TYPES.DATE:
        return [...commonOperators, OPERATORS.BEFORE, OPERATORS.AFTER, OPERATORS.BETWEEN,
                OPERATORS.WITHIN_LAST, OPERATORS.NOT_WITHIN_LAST];
      case FIELD_TYPES.BOOLEAN:
        return [OPERATORS.IS_TRUE, OPERATORS.IS_FALSE, OPERATORS.IS_NULL, OPERATORS.IS_NOT_NULL];
      case FIELD_TYPES.ARRAY:
        return ['contains', 'contains_all', 'contains_any', OPERATORS.IS_NULL, OPERATORS.IS_NOT_NULL];
      default:
        return commonOperators;
    }
  }
}

// Singleton instance
const contactFilterEngineService = new ContactFilterEngineService();

export default contactFilterEngineService;
export { OPERATORS, FIELD_TYPES, CONTACT_FIELDS };
