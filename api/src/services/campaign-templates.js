/**
 * Campaign Templates Service
 * Manage reusable campaign templates for SMS, Email, Voice
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class CampaignTemplatesService {
  /**
   * Create a new template
   */
  async create(tenantId, templateData) {
    const {
      name,
      description,
      type, // sms, email, voice
      category,
      subject,
      body,
      variables = [],
      isShared = false
    } = templateData;

    // Extract variables from body if not provided
    const extractedVars = this.extractVariables(body);
    const allVariables = [...new Set([...variables, ...extractedVars])];

    const result = await pool.query(
      `INSERT INTO campaign_templates (
        tenant_id, name, description, type, category, subject, body, variables, is_shared
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [tenantId, name, description, type, category, subject, body, JSON.stringify(allVariables), isShared]
    );

    return this.formatTemplate(result.rows[0]);
  }

  /**
   * Get template by ID
   */
  async getById(id, tenantId) {
    const result = await pool.query(
      `SELECT * FROM campaign_templates
       WHERE (id = $1 OR uuid = $1::text::uuid) AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );

    return result.rows[0] ? this.formatTemplate(result.rows[0]) : null;
  }

  /**
   * List templates with filters
   */
  async list(tenantId, filters = {}) {
    const {
      type,
      category,
      search,
      isShared,
      limit = 50,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = filters;

    let query = `
      SELECT ct.*,
             (SELECT COUNT(*) FROM campaigns c WHERE c.template_id = ct.id) as campaign_count
      FROM campaign_templates ct
      WHERE ct.tenant_id = $1 AND ct.deleted_at IS NULL
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (type) {
      query += ` AND ct.type = $${paramIndex++}`;
      params.push(type);
    }

    if (category) {
      query += ` AND ct.category = $${paramIndex++}`;
      params.push(category);
    }

    if (search) {
      query += ` AND (ct.name ILIKE $${paramIndex} OR ct.description ILIKE $${paramIndex} OR ct.body ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (isShared !== undefined) {
      query += ` AND ct.is_shared = $${paramIndex++}`;
      params.push(isShared);
    }

    // Validate sort column
    const validSortColumns = ['name', 'created_at', 'updated_at', 'usage_count', 'type', 'category'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ct.${sortColumn} ${order}`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM campaign_templates WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    return {
      templates: result.rows.map(t => this.formatTemplate(t)),
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Update a template
   */
  async update(id, tenantId, updates) {
    const allowedFields = ['name', 'description', 'type', 'category', 'subject', 'body', 'variables', 'is_shared'];
    const setClauses = [];
    const params = [id, tenantId];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(dbField === 'variables' ? JSON.stringify(value) : value);
      }
    }

    if (setClauses.length === 0) return null;

    // If body is updated, re-extract variables
    if (updates.body) {
      const extractedVars = this.extractVariables(updates.body);
      const existingVars = updates.variables || [];
      const allVariables = [...new Set([...existingVars, ...extractedVars])];
      setClauses.push(`variables = $${paramIndex++}`);
      params.push(JSON.stringify(allVariables));
    }

    setClauses.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE campaign_templates
       SET ${setClauses.join(', ')}
       WHERE (id = $1 OR uuid = $1::text::uuid) AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    return result.rows[0] ? this.formatTemplate(result.rows[0]) : null;
  }

  /**
   * Delete a template (soft delete)
   */
  async delete(id, tenantId) {
    const result = await pool.query(
      `UPDATE campaign_templates
       SET deleted_at = NOW()
       WHERE (id = $1 OR uuid = $1::text::uuid) AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    );

    return result.rows[0] ? this.formatTemplate(result.rows[0]) : null;
  }

  /**
   * Duplicate a template
   */
  async duplicate(id, tenantId, newName) {
    const template = await this.getById(id, tenantId);
    if (!template) return null;

    return this.create(tenantId, {
      name: newName || `${template.name} (Copy)`,
      description: template.description,
      type: template.type,
      category: template.category,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      isShared: false
    });
  }

  /**
   * Increment usage count
   */
  async incrementUsage(id, tenantId) {
    await pool.query(
      `UPDATE campaign_templates
       SET usage_count = usage_count + 1
       WHERE (id = $1 OR uuid = $1::text::uuid) AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  /**
   * Render template with variables
   */
  async render(id, tenantId, data) {
    const template = await this.getById(id, tenantId);
    if (!template) return null;

    let renderedBody = template.body;
    let renderedSubject = template.subject || '';

    // Replace all variables
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      renderedBody = renderedBody.replace(regex, value || '');
      renderedSubject = renderedSubject.replace(regex, value || '');
    }

    // Remove any unreplaced variables
    renderedBody = renderedBody.replace(/{{[^}]+}}/g, '');
    renderedSubject = renderedSubject.replace(/{{[^}]+}}/g, '');

    return {
      subject: renderedSubject,
      body: renderedBody,
      variables: template.variables,
      providedData: data
    };
  }

  /**
   * Preview template with sample data
   */
  async preview(id, tenantId) {
    const template = await this.getById(id, tenantId);
    if (!template) return null;

    // Generate sample data based on common variable names
    const sampleData = {};
    for (const variable of template.variables) {
      sampleData[variable] = this.getSampleValue(variable);
    }

    return this.render(id, tenantId, sampleData);
  }

  /**
   * Validate template body
   */
  validateBody(body, type) {
    const errors = [];

    if (!body || body.trim().length === 0) {
      errors.push('Template body cannot be empty');
    }

    if (type === 'sms' && body.length > 1600) {
      errors.push('SMS template body exceeds maximum length of 1600 characters');
    }

    // Check for balanced variable syntax
    const openBraces = (body.match(/{{/g) || []).length;
    const closeBraces = (body.match(/}}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push('Template has unbalanced variable syntax ({{ and }})');
    }

    return errors;
  }

  /**
   * Get template categories
   */
  async getCategories(tenantId) {
    const result = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as count
       FROM campaign_templates
       WHERE tenant_id = $1 AND deleted_at IS NULL AND category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Get template statistics
   */
  async getStats(tenantId) {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_templates,
         COUNT(*) FILTER (WHERE type = 'sms') as sms_templates,
         COUNT(*) FILTER (WHERE type = 'email') as email_templates,
         COUNT(*) FILTER (WHERE type = 'voice') as voice_templates,
         SUM(usage_count) as total_usage,
         AVG(usage_count)::DECIMAL(10,2) as avg_usage
       FROM campaign_templates
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    return {
      totalTemplates: parseInt(result.rows[0].total_templates) || 0,
      smsTemplates: parseInt(result.rows[0].sms_templates) || 0,
      emailTemplates: parseInt(result.rows[0].email_templates) || 0,
      voiceTemplates: parseInt(result.rows[0].voice_templates) || 0,
      totalUsage: parseInt(result.rows[0].total_usage) || 0,
      avgUsage: parseFloat(result.rows[0].avg_usage) || 0
    };
  }

  /**
   * Get most used templates
   */
  async getMostUsed(tenantId, limit = 10) {
    const result = await pool.query(
      `SELECT * FROM campaign_templates
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY usage_count DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map(t => this.formatTemplate(t));
  }

  /**
   * Import templates from JSON
   */
  async importTemplates(tenantId, templates) {
    const imported = [];
    const errors = [];

    for (const template of templates) {
      try {
        const created = await this.create(tenantId, template);
        imported.push(created);
      } catch (error) {
        errors.push({
          template: template.name,
          error: error.message
        });
      }
    }

    return { imported, errors };
  }

  /**
   * Export templates to JSON
   */
  async exportTemplates(tenantId, ids = null) {
    let query = `
      SELECT name, description, type, category, subject, body, variables, is_shared
      FROM campaign_templates
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `;
    const params = [tenantId];

    if (ids && ids.length > 0) {
      query += ` AND id = ANY($2)`;
      params.push(ids);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ===== HELPER METHODS =====

  /**
   * Extract variables from template body
   */
  extractVariables(body) {
    const matches = body.match(/{{([^}]+)}}/g) || [];
    return matches.map(m => m.replace(/[{}]/g, '').trim());
  }

  /**
   * Get sample value for variable name
   */
  getSampleValue(variable) {
    const samples = {
      first_name: 'John',
      last_name: 'Smith',
      full_name: 'John Smith',
      email: 'john@example.com',
      phone: '+1 (555) 123-4567',
      company: 'Acme Inc.',
      company_name: 'Acme Inc.',
      amount: '$99.99',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      agent_name: 'Sarah Wilson',
      link: 'https://example.com/action',
      unsubscribe: 'https://example.com/unsubscribe',
      code: 'ABC123',
      order_number: '#12345',
      tracking_number: 'TRK123456789'
    };

    return samples[variable.toLowerCase()] || `[${variable}]`;
  }

  /**
   * Format template for API response
   */
  formatTemplate(row) {
    return {
      id: row.id,
      uuid: row.uuid,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      type: row.type,
      category: row.category,
      subject: row.subject,
      body: row.body,
      variables: row.variables || [],
      usageCount: row.usage_count,
      isShared: row.is_shared,
      campaignCount: row.campaign_count ? parseInt(row.campaign_count) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = new CampaignTemplatesService();
