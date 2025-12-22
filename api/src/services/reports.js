/**
 * Custom Reports Service
 * Build and export custom reports with various data sources and formats
 *
 * Features:
 * - Custom report builder with flexible queries
 * - Multiple data sources (calls, SMS, emails, campaigns, agents, billing)
 * - Export to CSV, Excel (XLSX), PDF
 * - Scheduled report generation
 * - Report templates
 */

import { query } from '../db/connection.js';
import redis from '../db/redis.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';

// Report data sources and their available fields
const DATA_SOURCES = {
  calls: {
    table: 'calls',
    fields: {
      id: { label: 'Call ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      direction: { label: 'Direction', type: 'string' },
      from_number: { label: 'From Number', type: 'string' },
      to_number: { label: 'To Number', type: 'string' },
      status: { label: 'Status', type: 'string' },
      duration_seconds: { label: 'Duration (seconds)', type: 'number' },
      initiated_at: { label: 'Initiated At', type: 'datetime' },
      answered_at: { label: 'Answered At', type: 'datetime' },
      ended_at: { label: 'Ended At', type: 'datetime' },
      cost: { label: 'Cost', type: 'decimal' },
      recording_url: { label: 'Recording URL', type: 'string' },
      queue_id: { label: 'Queue ID', type: 'uuid' },
      agent_id: { label: 'Agent ID', type: 'uuid' },
      disposition: { label: 'Disposition', type: 'string' }
    },
    defaultFields: ['id', 'direction', 'from_number', 'to_number', 'status', 'duration_seconds', 'initiated_at']
  },
  sms_messages: {
    table: 'sms_messages',
    fields: {
      id: { label: 'SMS ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      from_number: { label: 'From Number', type: 'string' },
      to_number: { label: 'To Number', type: 'string' },
      body: { label: 'Message Body', type: 'string' },
      status: { label: 'Status', type: 'string' },
      direction: { label: 'Direction', type: 'string' },
      segments: { label: 'Segments', type: 'number' },
      cost: { label: 'Cost', type: 'decimal' },
      created_at: { label: 'Created At', type: 'datetime' },
      delivered_at: { label: 'Delivered At', type: 'datetime' }
    },
    defaultFields: ['id', 'from_number', 'to_number', 'status', 'direction', 'segments', 'created_at']
  },
  emails: {
    table: 'emails',
    fields: {
      id: { label: 'Email ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      from_email: { label: 'From Email', type: 'string' },
      to_email: { label: 'To Email', type: 'string' },
      subject: { label: 'Subject', type: 'string' },
      status: { label: 'Status', type: 'string' },
      opened_at: { label: 'Opened At', type: 'datetime' },
      clicked_at: { label: 'Clicked At', type: 'datetime' },
      bounced_at: { label: 'Bounced At', type: 'datetime' },
      cost: { label: 'Cost', type: 'decimal' },
      created_at: { label: 'Created At', type: 'datetime' }
    },
    defaultFields: ['id', 'from_email', 'to_email', 'subject', 'status', 'created_at']
  },
  campaigns: {
    table: 'campaigns',
    fields: {
      id: { label: 'Campaign ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      name: { label: 'Name', type: 'string' },
      type: { label: 'Type', type: 'string' },
      status: { label: 'Status', type: 'string' },
      total_recipients: { label: 'Total Recipients', type: 'number' },
      total_sent: { label: 'Total Sent', type: 'number' },
      total_delivered: { label: 'Total Delivered', type: 'number' },
      total_failed: { label: 'Total Failed', type: 'number' },
      total_opened: { label: 'Total Opened', type: 'number' },
      total_clicked: { label: 'Total Clicked', type: 'number' },
      actual_cost: { label: 'Actual Cost', type: 'decimal' },
      created_at: { label: 'Created At', type: 'datetime' },
      started_at: { label: 'Started At', type: 'datetime' },
      completed_at: { label: 'Completed At', type: 'datetime' }
    },
    defaultFields: ['id', 'name', 'type', 'status', 'total_sent', 'total_delivered', 'started_at']
  },
  agents: {
    table: 'agents',
    fields: {
      id: { label: 'Agent ID', type: 'uuid' },
      user_id: { label: 'User ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      extension: { label: 'Extension', type: 'string' },
      status: { label: 'Status', type: 'string' },
      queues: { label: 'Queues', type: 'json' },
      skills: { label: 'Skills', type: 'json' },
      created_at: { label: 'Created At', type: 'datetime' }
    },
    defaultFields: ['id', 'extension', 'status', 'created_at']
  },
  billing: {
    table: 'invoices',
    fields: {
      id: { label: 'Invoice ID', type: 'uuid' },
      tenant_id: { label: 'Tenant ID', type: 'uuid' },
      invoice_number: { label: 'Invoice Number', type: 'string' },
      amount: { label: 'Amount', type: 'decimal' },
      currency: { label: 'Currency', type: 'string' },
      status: { label: 'Status', type: 'string' },
      due_date: { label: 'Due Date', type: 'date' },
      paid_at: { label: 'Paid At', type: 'datetime' },
      created_at: { label: 'Created At', type: 'datetime' }
    },
    defaultFields: ['id', 'invoice_number', 'amount', 'status', 'due_date', 'created_at']
  }
};

class ReportsService {
  /**
   * Get available data sources and fields
   */
  getDataSources() {
    const sources = {};
    for (const [key, value] of Object.entries(DATA_SOURCES)) {
      sources[key] = {
        name: key,
        fields: Object.entries(value.fields).map(([field, config]) => ({
          field,
          ...config
        })),
        defaultFields: value.defaultFields
      };
    }
    return sources;
  }

  /**
   * Create a new saved report
   */
  async createReport(tenantId, reportData) {
    const {
      name,
      description,
      data_source,
      fields = [],
      filters = [],
      sort_by,
      sort_order = 'DESC',
      group_by,
      aggregations = [],
      date_range = {},
      is_scheduled = false,
      schedule_config = {}
    } = reportData;

    if (!name || !data_source) {
      throw new Error('Name and data_source are required');
    }

    if (!DATA_SOURCES[data_source]) {
      throw new Error(`Invalid data source: ${data_source}`);
    }

    const result = await query(
      `INSERT INTO custom_reports (
        tenant_id, name, description, data_source, fields, filters,
        sort_by, sort_order, group_by, aggregations, date_range,
        is_scheduled, schedule_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        tenantId, name, description, data_source,
        JSON.stringify(fields.length > 0 ? fields : DATA_SOURCES[data_source].defaultFields),
        JSON.stringify(filters),
        sort_by,
        sort_order,
        group_by,
        JSON.stringify(aggregations),
        JSON.stringify(date_range),
        is_scheduled,
        JSON.stringify(schedule_config)
      ]
    );

    return result.rows[0];
  }

  /**
   * Get a saved report by ID
   */
  async getReport(reportId, tenantId) {
    const result = await query(
      'SELECT * FROM custom_reports WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [reportId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return result.rows[0];
  }

  /**
   * List saved reports
   */
  async listReports(tenantId, options = {}) {
    const { page = 1, limit = 50, data_source } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'tenant_id = $1 AND deleted_at IS NULL';
    const values = [tenantId];
    let paramCount = 2;

    if (data_source) {
      whereClause += ` AND data_source = $${paramCount}`;
      values.push(data_source);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT *, COUNT(*) OVER() as total_count
       FROM custom_reports
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      reports: result.rows.map(row => {
        const { total_count, ...report } = row;
        return report;
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Update a saved report
   */
  async updateReport(reportId, tenantId, updates) {
    const allowedFields = [
      'name', 'description', 'fields', 'filters', 'sort_by', 'sort_order',
      'group_by', 'aggregations', 'date_range', 'is_scheduled', 'schedule_config'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(reportId, tenantId);

    const result = await query(
      `UPDATE custom_reports
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return result.rows[0];
  }

  /**
   * Delete a saved report
   */
  async deleteReport(reportId, tenantId) {
    const result = await query(
      'UPDATE custom_reports SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id',
      [reportId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return { success: true };
  }

  /**
   * Execute a report and get results
   */
  async executeReport(reportId, tenantId, options = {}) {
    const report = await this.getReport(reportId, tenantId);
    return this.runQuery(tenantId, {
      data_source: report.data_source,
      fields: report.fields,
      filters: report.filters,
      sort_by: report.sort_by,
      sort_order: report.sort_order,
      group_by: report.group_by,
      aggregations: report.aggregations,
      date_range: options.date_range || report.date_range,
      page: options.page,
      limit: options.limit
    });
  }

  /**
   * Run an ad-hoc query
   */
  async runQuery(tenantId, queryConfig) {
    const {
      data_source,
      fields = [],
      filters = [],
      sort_by,
      sort_order = 'DESC',
      group_by,
      aggregations = [],
      date_range = {},
      page = 1,
      limit = 1000
    } = queryConfig;

    const sourceConfig = DATA_SOURCES[data_source];
    if (!sourceConfig) {
      throw new Error(`Invalid data source: ${data_source}`);
    }

    // Build SELECT clause
    const selectedFields = fields.length > 0 ? fields : sourceConfig.defaultFields;
    const validFields = selectedFields.filter(f => sourceConfig.fields[f]);

    let selectClause = validFields.map(f => `${sourceConfig.table}.${f}`).join(', ');

    // Add aggregations if grouping
    if (group_by && aggregations.length > 0) {
      const aggParts = aggregations.map(agg => {
        const { function: fn, field, alias } = agg;
        return `${fn.toUpperCase()}(${field}) as ${alias || `${fn}_${field}`}`;
      });
      selectClause = `${group_by}, ${aggParts.join(', ')}`;
    }

    // Build WHERE clause
    let whereClause = `${sourceConfig.table}.tenant_id = $1`;
    const values = [tenantId];
    let paramCount = 2;

    // Apply date range filter
    if (date_range.start) {
      whereClause += ` AND ${sourceConfig.table}.created_at >= $${paramCount}`;
      values.push(date_range.start);
      paramCount++;
    }
    if (date_range.end) {
      whereClause += ` AND ${sourceConfig.table}.created_at <= $${paramCount}`;
      values.push(date_range.end);
      paramCount++;
    }

    // Apply custom filters
    for (const filter of filters) {
      const { field, operator, value } = filter;
      if (!sourceConfig.fields[field]) continue;

      switch (operator) {
        case 'eq':
          whereClause += ` AND ${sourceConfig.table}.${field} = $${paramCount}`;
          values.push(value);
          break;
        case 'ne':
          whereClause += ` AND ${sourceConfig.table}.${field} != $${paramCount}`;
          values.push(value);
          break;
        case 'gt':
          whereClause += ` AND ${sourceConfig.table}.${field} > $${paramCount}`;
          values.push(value);
          break;
        case 'gte':
          whereClause += ` AND ${sourceConfig.table}.${field} >= $${paramCount}`;
          values.push(value);
          break;
        case 'lt':
          whereClause += ` AND ${sourceConfig.table}.${field} < $${paramCount}`;
          values.push(value);
          break;
        case 'lte':
          whereClause += ` AND ${sourceConfig.table}.${field} <= $${paramCount}`;
          values.push(value);
          break;
        case 'like':
          whereClause += ` AND ${sourceConfig.table}.${field} ILIKE $${paramCount}`;
          values.push(`%${value}%`);
          break;
        case 'in':
          whereClause += ` AND ${sourceConfig.table}.${field} = ANY($${paramCount})`;
          values.push(Array.isArray(value) ? value : [value]);
          break;
        case 'null':
          whereClause += ` AND ${sourceConfig.table}.${field} IS NULL`;
          paramCount--; // No value needed
          break;
        case 'not_null':
          whereClause += ` AND ${sourceConfig.table}.${field} IS NOT NULL`;
          paramCount--; // No value needed
          break;
        default:
          continue;
      }
      paramCount++;
    }

    // Build GROUP BY clause
    let groupByClause = '';
    if (group_by) {
      groupByClause = `GROUP BY ${group_by}`;
    }

    // Build ORDER BY clause
    let orderByClause = '';
    if (sort_by && sourceConfig.fields[sort_by]) {
      orderByClause = `ORDER BY ${sort_by} ${sort_order}`;
    } else if (!group_by) {
      orderByClause = 'ORDER BY created_at DESC';
    }

    // Build pagination
    const offset = (page - 1) * limit;

    // Execute count query first
    const countQuery = `SELECT COUNT(*) as total FROM ${sourceConfig.table} WHERE ${whereClause}`;
    const countResult = await query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].total);

    // Execute main query
    values.push(limit, offset);
    const mainQuery = `
      SELECT ${selectClause}
      FROM ${sourceConfig.table}
      WHERE ${whereClause}
      ${groupByClause}
      ${orderByClause}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const result = await query(mainQuery, values);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      query_config: {
        data_source,
        fields: validFields,
        filters,
        date_range
      }
    };
  }

  /**
   * Export report data to CSV
   */
  async exportToCSV(tenantId, reportConfig) {
    // Get all data (no pagination for export)
    const result = await this.runQuery(tenantId, {
      ...reportConfig,
      page: 1,
      limit: 100000 // Max export limit
    });

    const sourceConfig = DATA_SOURCES[reportConfig.data_source];
    const fields = reportConfig.fields || sourceConfig.defaultFields;

    // Build CSV header
    const headers = fields.map(f => sourceConfig.fields[f]?.label || f);

    // Build CSV rows
    const rows = result.data.map(row => {
      return fields.map(f => {
        const value = row[f];
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });
    });

    // Generate CSV
    const csv = stringify([headers, ...rows]);

    return {
      content: csv,
      contentType: 'text/csv',
      filename: `report_${reportConfig.data_source}_${Date.now()}.csv`
    };
  }

  /**
   * Export report data to Excel (XLSX)
   */
  async exportToExcel(tenantId, reportConfig) {
    // Get all data
    const result = await this.runQuery(tenantId, {
      ...reportConfig,
      page: 1,
      limit: 100000
    });

    const sourceConfig = DATA_SOURCES[reportConfig.data_source];
    const fields = reportConfig.fields || sourceConfig.defaultFields;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IRISX Reports';
    workbook.created = new Date();

    // Add worksheet
    const worksheet = workbook.addWorksheet('Report Data');

    // Add headers
    const headers = fields.map(f => ({
      header: sourceConfig.fields[f]?.label || f,
      key: f,
      width: 20
    }));
    worksheet.columns = headers;

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    for (const row of result.data) {
      const rowData = {};
      for (const field of fields) {
        let value = row[field];
        if (value instanceof Date) {
          value = value.toISOString();
        } else if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        rowData[field] = value;
      }
      worksheet.addRow(rowData);
    }

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 30 }
    ];
    summarySheet.getRow(1).font = { bold: true };

    summarySheet.addRow({ metric: 'Report Type', value: reportConfig.data_source });
    summarySheet.addRow({ metric: 'Total Records', value: result.pagination.total });
    summarySheet.addRow({ metric: 'Generated At', value: new Date().toISOString() });

    if (reportConfig.date_range?.start) {
      summarySheet.addRow({ metric: 'Date Range Start', value: reportConfig.date_range.start });
    }
    if (reportConfig.date_range?.end) {
      summarySheet.addRow({ metric: 'Date Range End', value: reportConfig.date_range.end });
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return {
      content: buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `report_${reportConfig.data_source}_${Date.now()}.xlsx`
    };
  }

  /**
   * Export report data to PDF
   */
  async exportToPDF(tenantId, reportConfig) {
    // Get data (limited for PDF)
    const result = await this.runQuery(tenantId, {
      ...reportConfig,
      page: 1,
      limit: 1000 // Limit for PDF
    });

    const sourceConfig = DATA_SOURCES[reportConfig.data_source];
    const fields = reportConfig.fields || sourceConfig.defaultFields;

    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            content: buffer,
            contentType: 'application/pdf',
            filename: `report_${reportConfig.data_source}_${Date.now()}.pdf`
          });
        });
        doc.on('error', reject);

        // Title
        doc.fontSize(20).font('Helvetica-Bold').text('IRISX Report', { align: 'center' });
        doc.moveDown();

        // Metadata
        doc.fontSize(10).font('Helvetica');
        doc.text(`Report Type: ${reportConfig.data_source}`);
        doc.text(`Total Records: ${result.pagination.total}`);
        doc.text(`Generated: ${new Date().toISOString()}`);
        if (reportConfig.date_range?.start) {
          doc.text(`Date Range: ${reportConfig.date_range.start} - ${reportConfig.date_range.end || 'Now'}`);
        }
        doc.moveDown();

        // Table headers
        const headers = fields.map(f => sourceConfig.fields[f]?.label || f);
        const colWidth = (doc.page.width - 100) / Math.min(fields.length, 8);

        // Header row
        doc.fontSize(8).font('Helvetica-Bold');
        let x = 50;
        for (let i = 0; i < Math.min(headers.length, 8); i++) {
          doc.text(headers[i].substring(0, 15), x, doc.y, { width: colWidth, align: 'left' });
          x += colWidth;
        }
        doc.moveDown();

        // Draw line
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown(0.5);

        // Data rows
        doc.font('Helvetica');
        const maxRows = Math.min(result.data.length, 50); // Limit rows for PDF

        for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
          const row = result.data[rowIndex];
          x = 50;

          for (let i = 0; i < Math.min(fields.length, 8); i++) {
            let value = row[fields[i]];
            if (value === null || value === undefined) value = '';
            else if (value instanceof Date) value = value.toLocaleDateString();
            else if (typeof value === 'object') value = '[Object]';
            else value = String(value).substring(0, 20);

            doc.text(value, x, doc.y, { width: colWidth, align: 'left' });
            x += colWidth;
          }
          doc.moveDown(0.5);

          // Page break if needed
          if (doc.y > doc.page.height - 100) {
            doc.addPage();
            doc.y = 50;
          }
        }

        if (result.data.length > maxRows) {
          doc.moveDown();
          doc.text(`... and ${result.data.length - maxRows} more records (export to CSV or Excel for full data)`);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Export report in specified format
   */
  async exportReport(tenantId, reportId, format) {
    const report = await this.getReport(reportId, tenantId);

    const config = {
      data_source: report.data_source,
      fields: report.fields,
      filters: report.filters,
      sort_by: report.sort_by,
      sort_order: report.sort_order,
      date_range: report.date_range
    };

    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV(tenantId, config);
      case 'xlsx':
      case 'excel':
        return this.exportToExcel(tenantId, config);
      case 'pdf':
        return this.exportToPDF(tenantId, config);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Schedule a report for recurring generation
   */
  async scheduleReport(reportId, tenantId, scheduleConfig) {
    const {
      frequency = 'daily', // daily, weekly, monthly
      day_of_week, // 0-6 for weekly
      day_of_month, // 1-31 for monthly
      time = '09:00', // HH:MM format
      timezone = 'UTC',
      recipients = [], // email addresses
      format = 'xlsx'
    } = scheduleConfig;

    const result = await query(
      `UPDATE custom_reports
       SET is_scheduled = true,
           schedule_config = $3,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        reportId,
        tenantId,
        JSON.stringify({ frequency, day_of_week, day_of_month, time, timezone, recipients, format })
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return result.rows[0];
  }

  /**
   * Unschedule a report
   */
  async unscheduleReport(reportId, tenantId) {
    const result = await query(
      `UPDATE custom_reports
       SET is_scheduled = false,
           schedule_config = '{}',
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [reportId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return result.rows[0];
  }

  /**
   * Get scheduled reports due for execution
   */
  async getDueScheduledReports() {
    const result = await query(
      `SELECT cr.*, t.name as tenant_name
       FROM custom_reports cr
       INNER JOIN tenants t ON cr.tenant_id = t.id
       WHERE cr.is_scheduled = true
         AND cr.deleted_at IS NULL
         AND t.status = 'active'`
    );

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay();
    const currentDayOfMonth = now.getUTCDate();

    return result.rows.filter(report => {
      const config = report.schedule_config || {};
      const [scheduleHour] = (config.time || '09:00').split(':').map(Number);

      // Check if it's time to run
      if (currentHour !== scheduleHour) return false;

      switch (config.frequency) {
        case 'daily':
          return true;
        case 'weekly':
          return currentDay === (config.day_of_week || 1);
        case 'monthly':
          return currentDayOfMonth === (config.day_of_month || 1);
        default:
          return false;
      }
    });
  }
}

export default new ReportsService();
