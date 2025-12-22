/**
 * Template Engine Service
 *
 * Handlebars-based template rendering for emails, SMS,
 * documents, and dynamic content generation
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';
import Handlebars from 'handlebars';

// Template types
const TEMPLATE_TYPES = {
  EMAIL: 'email',
  SMS: 'sms',
  VOICE: 'voice',
  DOCUMENT: 'document',
  NOTIFICATION: 'notification',
  WEBHOOK_PAYLOAD: 'webhook_payload'
};

// Template categories
const TEMPLATE_CATEGORIES = {
  TRANSACTIONAL: 'transactional',
  MARKETING: 'marketing',
  NOTIFICATION: 'notification',
  SYSTEM: 'system',
  CUSTOM: 'custom'
};

/**
 * Template Engine Service
 */
class TemplateEngineService {
  constructor() {
    this.compiledTemplates = new Map();
    this.registerHelpers();
  }

  // ============================================
  // Handlebars Configuration
  // ============================================

  /**
   * Register custom Handlebars helpers
   */
  registerHelpers() {
    // Date formatting
    Handlebars.registerHelper('formatDate', (date, format) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';

      const options = {
        short: { month: 'short', day: 'numeric', year: 'numeric' },
        long: { month: 'long', day: 'numeric', year: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit' },
        datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' },
        iso: null
      };

      if (format === 'iso') {
        return d.toISOString();
      }

      return d.toLocaleDateString('en-US', options[format] || options.short);
    });

    // Number formatting
    Handlebars.registerHelper('formatNumber', (number, decimals = 0) => {
      if (number === null || number === undefined) return '';
      return Number(number).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    });

    // Currency formatting
    Handlebars.registerHelper('formatCurrency', (amount, currency = 'USD') => {
      if (amount === null || amount === undefined) return '';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    });

    // Phone formatting
    Handlebars.registerHelper('formatPhone', (phone) => {
      if (!phone) return '';
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      if (cleaned.length === 11 && cleaned[0] === '1') {
        return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
      }
      return phone;
    });

    // String manipulation
    Handlebars.registerHelper('uppercase', (str) => str?.toString().toUpperCase() || '');
    Handlebars.registerHelper('lowercase', (str) => str?.toString().toLowerCase() || '');
    Handlebars.registerHelper('capitalize', (str) => {
      if (!str) return '';
      return str.toString().charAt(0).toUpperCase() + str.toString().slice(1).toLowerCase();
    });
    Handlebars.registerHelper('titleCase', (str) => {
      if (!str) return '';
      return str.toString().replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
    });

    // Truncate text
    Handlebars.registerHelper('truncate', (str, length, suffix = '...') => {
      if (!str) return '';
      str = str.toString();
      if (str.length <= length) return str;
      return str.substring(0, length) + suffix;
    });

    // Default value
    Handlebars.registerHelper('default', (value, defaultValue) => {
      return value || defaultValue;
    });

    // Conditional helpers
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifNotEquals', function(arg1, arg2, options) {
      return (arg1 !== arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifGreaterThan', function(arg1, arg2, options) {
      return (arg1 > arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifLessThan', function(arg1, arg2, options) {
      return (arg1 < arg2) ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifContains', function(array, value, options) {
      if (Array.isArray(array) && array.includes(value)) {
        return options.fn(this);
      }
      return options.inverse(this);
    });

    // Math helpers
    Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
    Handlebars.registerHelper('subtract', (a, b) => Number(a) - Number(b));
    Handlebars.registerHelper('multiply', (a, b) => Number(a) * Number(b));
    Handlebars.registerHelper('divide', (a, b) => b !== 0 ? Number(a) / Number(b) : 0);
    Handlebars.registerHelper('percent', (value, total) => {
      if (!total) return '0%';
      return ((value / total) * 100).toFixed(1) + '%';
    });

    // Array helpers
    Handlebars.registerHelper('first', (array) => Array.isArray(array) ? array[0] : null);
    Handlebars.registerHelper('last', (array) => Array.isArray(array) ? array[array.length - 1] : null);
    Handlebars.registerHelper('count', (array) => Array.isArray(array) ? array.length : 0);
    Handlebars.registerHelper('join', (array, separator = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    // JSON helper
    Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));

    // URL encoding
    Handlebars.registerHelper('urlencode', (str) => encodeURIComponent(str || ''));

    // Pluralize
    Handlebars.registerHelper('pluralize', (count, singular, plural) => {
      return count === 1 ? singular : (plural || singular + 's');
    });

    // Time ago
    Handlebars.registerHelper('timeAgo', (date) => {
      if (!date) return '';
      const seconds = Math.floor((new Date() - new Date(date)) / 1000);
      const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
      };
      for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
          return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
      }
      return 'just now';
    });
  }

  // ============================================
  // Template Management
  // ============================================

  /**
   * Create template
   */
  async createTemplate(tenantId, templateData, createdBy) {
    const {
      name,
      type,
      category = TEMPLATE_CATEGORIES.CUSTOM,
      subject,
      content,
      htmlContent,
      textContent,
      metadata = {},
      variables = [],
      isActive = true
    } = templateData;

    if (!name || !type || !content) {
      throw new Error('name, type, and content are required');
    }

    // Validate template compiles
    this.validateTemplate(content);
    if (htmlContent) this.validateTemplate(htmlContent);
    if (textContent) this.validateTemplate(textContent);
    if (subject) this.validateTemplate(subject);

    const templateId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO message_templates (
        id, tenant_id, name, type, category, subject,
        content, html_content, text_content, metadata,
        variables, is_active, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      templateId, tenantId, name, type, category, subject,
      content, htmlContent, textContent, JSON.stringify(metadata),
      JSON.stringify(variables), isActive, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId) {
    const result = await query(
      'SELECT * FROM message_templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0];
  }

  /**
   * Get templates by tenant
   */
  async getTemplates(tenantId, options = {}) {
    const { type, category, isActive, limit = 50, offset = 0 } = options;

    let sql = 'SELECT * FROM message_templates WHERE tenant_id = $1';
    const params = [tenantId];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (isActive !== undefined) {
      params.push(isActive);
      sql += ` AND is_active = $${params.length}`;
    }

    sql += ' ORDER BY name ASC';
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Update template
   */
  async updateTemplate(templateId, updates, updatedBy) {
    const allowedFields = ['name', 'type', 'category', 'subject', 'content',
                          'html_content', 'text_content', 'metadata', 'variables', 'is_active'];
    const setClauses = [];
    const params = [templateId];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        // Validate template content
        if (['content', 'html_content', 'text_content', 'subject'].includes(snakeKey) && value) {
          this.validateTemplate(value);
        }

        params.push(['metadata', 'variables'].includes(snakeKey) ? JSON.stringify(value) : value);
        setClauses.push(`${snakeKey} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return this.getTemplate(templateId);
    }

    params.push(updatedBy);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push('updated_at = NOW()');
    setClauses.push('version = version + 1');

    await query(`
      UPDATE message_templates
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);

    // Clear cached compiled template
    this.compiledTemplates.delete(templateId);

    return this.getTemplate(templateId);
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateId) {
    await query('DELETE FROM message_templates WHERE id = $1', [templateId]);
    this.compiledTemplates.delete(templateId);
    return { deleted: true };
  }

  // ============================================
  // Template Rendering
  // ============================================

  /**
   * Validate template syntax
   */
  validateTemplate(templateContent) {
    try {
      Handlebars.compile(templateContent);
      return { valid: true };
    } catch (error) {
      throw new Error(`Invalid template syntax: ${error.message}`);
    }
  }

  /**
   * Compile template (with caching)
   */
  compileTemplate(templateId, content) {
    if (!this.compiledTemplates.has(templateId)) {
      this.compiledTemplates.set(templateId, Handlebars.compile(content));
    }
    return this.compiledTemplates.get(templateId);
  }

  /**
   * Render template with data
   */
  render(template, data, options = {}) {
    const { strict = false } = options;

    try {
      const compiled = typeof template === 'string'
        ? Handlebars.compile(template, { strict })
        : template;

      return compiled(data);
    } catch (error) {
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  /**
   * Render template by ID
   */
  async renderTemplate(templateId, data, options = {}) {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.is_active && !options.allowInactive) {
      throw new Error('Template is inactive');
    }

    const result = {
      templateId,
      templateName: template.name,
      type: template.type
    };

    // Render content
    result.content = this.render(template.content, data, options);

    // Render subject if exists
    if (template.subject) {
      result.subject = this.render(template.subject, data, options);
    }

    // Render HTML content if exists
    if (template.html_content) {
      result.htmlContent = this.render(template.html_content, data, options);
    }

    // Render text content if exists
    if (template.text_content) {
      result.textContent = this.render(template.text_content, data, options);
    }

    // Track usage
    await this.trackUsage(templateId);

    return result;
  }

  /**
   * Preview template with sample data
   */
  async previewTemplate(templateId, sampleData = null) {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    // Use provided sample data or generate from variables
    const data = sampleData || this.generateSampleData(template.variables);

    return this.renderTemplate(templateId, data, { allowInactive: true });
  }

  /**
   * Render inline template (no database lookup)
   */
  renderInline(templateContent, data, options = {}) {
    return this.render(templateContent, data, options);
  }

  /**
   * Batch render template for multiple recipients
   */
  async batchRender(templateId, recipients, commonData = {}) {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    const results = [];

    for (const recipient of recipients) {
      try {
        const data = { ...commonData, ...recipient };
        const rendered = {
          recipientId: recipient.id || recipient.email || recipient.phone,
          content: this.render(template.content, data),
          subject: template.subject ? this.render(template.subject, data) : null
        };

        if (template.html_content) {
          rendered.htmlContent = this.render(template.html_content, data);
        }

        results.push({ success: true, ...rendered });
      } catch (error) {
        results.push({
          success: false,
          recipientId: recipient.id || recipient.email || recipient.phone,
          error: error.message
        });
      }
    }

    return results;
  }

  // ============================================
  // Variable Management
  // ============================================

  /**
   * Extract variables from template
   */
  extractVariables(templateContent) {
    const variables = new Set();

    // Match {{variable}} patterns
    const simpleVars = templateContent.match(/\{\{[^}#/]+\}\}/g) || [];
    simpleVars.forEach(v => {
      const clean = v.replace(/\{\{|\}\}/g, '').trim();
      // Exclude helpers (they have spaces or parameters)
      if (!clean.includes(' ') && !clean.startsWith('#') && !clean.startsWith('/')) {
        variables.add(clean);
      }
    });

    // Match {{variable.nested}} patterns
    const nestedVars = templateContent.match(/\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g) || [];
    nestedVars.forEach(v => {
      const clean = v.replace(/\{\{|\}\}/g, '').trim();
      variables.add(clean.split('.')[0]);
    });

    return Array.from(variables);
  }

  /**
   * Generate sample data from variable definitions
   */
  generateSampleData(variables) {
    if (!Array.isArray(variables)) {
      return {};
    }

    const data = {};

    for (const variable of variables) {
      const name = variable.name || variable;
      const type = variable.type || 'string';

      switch (type) {
        case 'string':
          data[name] = variable.sample || `Sample ${name}`;
          break;
        case 'number':
          data[name] = variable.sample || 123;
          break;
        case 'date':
          data[name] = variable.sample || new Date().toISOString();
          break;
        case 'boolean':
          data[name] = variable.sample !== undefined ? variable.sample : true;
          break;
        case 'array':
          data[name] = variable.sample || ['Item 1', 'Item 2', 'Item 3'];
          break;
        case 'object':
          data[name] = variable.sample || { key: 'value' };
          break;
        default:
          data[name] = `Sample ${name}`;
      }
    }

    return data;
  }

  // ============================================
  // Usage Tracking
  // ============================================

  /**
   * Track template usage
   */
  async trackUsage(templateId) {
    await query(`
      UPDATE message_templates
      SET usage_count = COALESCE(usage_count, 0) + 1,
          last_used_at = NOW()
      WHERE id = $1
    `, [templateId]);
  }

  /**
   * Get template usage stats
   */
  async getTemplateStats(tenantId, options = {}) {
    const { days = 30 } = options;

    const result = await query(`
      SELECT
        id, name, type, category,
        usage_count, last_used_at,
        created_at
      FROM message_templates
      WHERE tenant_id = $1
      ORDER BY usage_count DESC NULLS LAST
      LIMIT 20
    `, [tenantId]);

    return result.rows;
  }

  // ============================================
  // Template Versioning
  // ============================================

  /**
   * Get template version history
   */
  async getTemplateVersions(templateId) {
    const result = await query(`
      SELECT * FROM message_template_versions
      WHERE template_id = $1
      ORDER BY version DESC
    `, [templateId]);

    return result.rows;
  }

  /**
   * Restore template version
   */
  async restoreTemplateVersion(templateId, version, restoredBy) {
    const versionResult = await query(
      'SELECT * FROM message_template_versions WHERE template_id = $1 AND version = $2',
      [templateId, version]
    );

    if (versionResult.rows.length === 0) {
      throw new Error('Version not found');
    }

    const versionData = versionResult.rows[0];

    return this.updateTemplate(templateId, {
      content: versionData.content,
      htmlContent: versionData.html_content,
      textContent: versionData.text_content,
      subject: versionData.subject
    }, restoredBy);
  }

  // ============================================
  // Partials (Reusable Snippets)
  // ============================================

  /**
   * Register partial template
   */
  async registerPartial(tenantId, partialData, createdBy) {
    const { name, content, description } = partialData;

    const partialId = crypto.randomUUID();

    await query(`
      INSERT INTO template_partials (
        id, tenant_id, name, content, description, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [partialId, tenantId, name, content, description, createdBy]);

    // Register with Handlebars
    Handlebars.registerPartial(name, content);

    return { id: partialId, name, content };
  }

  /**
   * Load tenant partials
   */
  async loadTenantPartials(tenantId) {
    const result = await query(
      'SELECT * FROM template_partials WHERE tenant_id = $1',
      [tenantId]
    );

    for (const partial of result.rows) {
      Handlebars.registerPartial(partial.name, partial.content);
    }

    return result.rows;
  }

  /**
   * Get available helpers
   */
  getAvailableHelpers() {
    return [
      { name: 'formatDate', description: 'Format date (short, long, time, datetime, iso)', example: '{{formatDate date "short"}}' },
      { name: 'formatNumber', description: 'Format number with decimals', example: '{{formatNumber amount 2}}' },
      { name: 'formatCurrency', description: 'Format as currency', example: '{{formatCurrency price "USD"}}' },
      { name: 'formatPhone', description: 'Format phone number', example: '{{formatPhone phone}}' },
      { name: 'uppercase', description: 'Convert to uppercase', example: '{{uppercase name}}' },
      { name: 'lowercase', description: 'Convert to lowercase', example: '{{lowercase name}}' },
      { name: 'capitalize', description: 'Capitalize first letter', example: '{{capitalize name}}' },
      { name: 'titleCase', description: 'Convert to title case', example: '{{titleCase name}}' },
      { name: 'truncate', description: 'Truncate text', example: '{{truncate description 100 "..."}}' },
      { name: 'default', description: 'Provide default value', example: '{{default name "Unknown"}}' },
      { name: 'ifEquals', description: 'Conditional equality', example: '{{#ifEquals status "active"}}Active{{/ifEquals}}' },
      { name: 'add', description: 'Add numbers', example: '{{add price tax}}' },
      { name: 'subtract', description: 'Subtract numbers', example: '{{subtract total discount}}' },
      { name: 'multiply', description: 'Multiply numbers', example: '{{multiply quantity price}}' },
      { name: 'divide', description: 'Divide numbers', example: '{{divide total count}}' },
      { name: 'percent', description: 'Calculate percentage', example: '{{percent completed total}}' },
      { name: 'join', description: 'Join array', example: '{{join tags ", "}}' },
      { name: 'count', description: 'Count array items', example: '{{count items}}' },
      { name: 'json', description: 'Output as JSON', example: '{{json data}}' },
      { name: 'urlencode', description: 'URL encode string', example: '{{urlencode query}}' },
      { name: 'pluralize', description: 'Pluralize word', example: '{{count items}} {{pluralize (count items) "item"}}' },
      { name: 'timeAgo', description: 'Relative time', example: '{{timeAgo createdAt}}' }
    ];
  }
}

// Singleton instance
const templateEngineService = new TemplateEngineService();

export default templateEngineService;
export { TEMPLATE_TYPES, TEMPLATE_CATEGORIES };
