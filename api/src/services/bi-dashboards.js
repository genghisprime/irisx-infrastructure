/**
 * Business Intelligence Dashboards Service
 *
 * Advanced BI dashboards with KPIs, custom widgets,
 * real-time metrics, and executive reporting
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Dashboard types
const DASHBOARD_TYPES = {
  EXECUTIVE: 'executive',
  OPERATIONS: 'operations',
  SALES: 'sales',
  SUPPORT: 'support',
  AGENT: 'agent',
  CUSTOM: 'custom'
};

// Widget types
const WIDGET_TYPES = {
  KPI: 'kpi',
  LINE_CHART: 'line_chart',
  BAR_CHART: 'bar_chart',
  PIE_CHART: 'pie_chart',
  TABLE: 'table',
  GAUGE: 'gauge',
  MAP: 'map',
  FUNNEL: 'funnel',
  HEATMAP: 'heatmap',
  SPARKLINE: 'sparkline',
  COUNTER: 'counter',
  PROGRESS: 'progress',
  LIST: 'list'
};

// KPI categories
const KPI_CATEGORIES = {
  CALLS: 'calls',
  SMS: 'sms',
  EMAIL: 'email',
  AGENTS: 'agents',
  QUEUES: 'queues',
  CAMPAIGNS: 'campaigns',
  FINANCIAL: 'financial',
  QUALITY: 'quality',
  CUSTOMER: 'customer'
};

// Predefined KPIs
const PREDEFINED_KPIS = {
  // Call KPIs
  total_calls: {
    name: 'Total Calls',
    category: KPI_CATEGORIES.CALLS,
    query: `SELECT COUNT(*) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'number'
  },
  average_call_duration: {
    name: 'Avg Call Duration',
    category: KPI_CATEGORIES.CALLS,
    query: `SELECT AVG(duration_seconds) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2 AND status = 'completed'`,
    format: 'duration'
  },
  call_answer_rate: {
    name: 'Answer Rate',
    category: KPI_CATEGORIES.CALLS,
    query: `SELECT (COUNT(CASE WHEN status = 'completed' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'percent'
  },
  calls_per_hour: {
    name: 'Calls/Hour',
    category: KPI_CATEGORIES.CALLS,
    query: `SELECT COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - $2)) / 3600, 1) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'decimal'
  },

  // SMS KPIs
  total_sms: {
    name: 'Total SMS',
    category: KPI_CATEGORIES.SMS,
    query: `SELECT COUNT(*) as value FROM sms_messages WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'number'
  },
  sms_delivery_rate: {
    name: 'SMS Delivery Rate',
    category: KPI_CATEGORIES.SMS,
    query: `SELECT (COUNT(CASE WHEN status = 'delivered' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100) as value FROM sms_messages WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'percent'
  },

  // Agent KPIs
  active_agents: {
    name: 'Active Agents',
    category: KPI_CATEGORIES.AGENTS,
    query: `SELECT COUNT(*) as value FROM agent_sessions WHERE tenant_id = $1 AND status = 'active'`,
    format: 'number'
  },
  avg_agent_utilization: {
    name: 'Agent Utilization',
    category: KPI_CATEGORIES.AGENTS,
    query: `SELECT AVG(utilization_percent) as value FROM agent_metrics WHERE tenant_id = $1 AND recorded_at >= $2`,
    format: 'percent'
  },
  avg_handle_time: {
    name: 'Avg Handle Time',
    category: KPI_CATEGORIES.AGENTS,
    query: `SELECT AVG(handle_time_seconds) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2 AND agent_id IS NOT NULL`,
    format: 'duration'
  },

  // Queue KPIs
  current_queue_size: {
    name: 'Queue Size',
    category: KPI_CATEGORIES.QUEUES,
    query: `SELECT COUNT(*) as value FROM queue_entries WHERE tenant_id = $1 AND status = 'waiting'`,
    format: 'number'
  },
  avg_wait_time: {
    name: 'Avg Wait Time',
    category: KPI_CATEGORIES.QUEUES,
    query: `SELECT AVG(wait_time_seconds) as value FROM queue_entries WHERE tenant_id = $1 AND created_at >= $2 AND answered_at IS NOT NULL`,
    format: 'duration'
  },
  service_level: {
    name: 'Service Level',
    category: KPI_CATEGORIES.QUEUES,
    query: `SELECT (COUNT(CASE WHEN wait_time_seconds <= 20 AND answered_at IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(CASE WHEN answered_at IS NOT NULL THEN 1 END), 0) * 100) as value FROM queue_entries WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'percent'
  },
  abandonment_rate: {
    name: 'Abandonment Rate',
    category: KPI_CATEGORIES.QUEUES,
    query: `SELECT (COUNT(CASE WHEN status = 'abandoned' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100) as value FROM queue_entries WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'percent'
  },

  // Campaign KPIs
  active_campaigns: {
    name: 'Active Campaigns',
    category: KPI_CATEGORIES.CAMPAIGNS,
    query: `SELECT COUNT(*) as value FROM campaigns WHERE tenant_id = $1 AND status = 'running'`,
    format: 'number'
  },
  campaign_conversion_rate: {
    name: 'Conversion Rate',
    category: KPI_CATEGORIES.CAMPAIGNS,
    query: `SELECT (COUNT(CASE WHEN outcome = 'converted' THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100) as value FROM campaign_contacts WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = $1) AND updated_at >= $2`,
    format: 'percent'
  },

  // Financial KPIs
  total_revenue: {
    name: 'Total Revenue',
    category: KPI_CATEGORIES.FINANCIAL,
    query: `SELECT SUM(amount) as value FROM billing_transactions WHERE tenant_id = $1 AND created_at >= $2 AND type = 'charge'`,
    format: 'currency'
  },
  total_cost: {
    name: 'Total Cost',
    category: KPI_CATEGORIES.FINANCIAL,
    query: `SELECT SUM(cost) as value FROM (SELECT cost FROM calls WHERE tenant_id = $1 AND created_at >= $2 UNION ALL SELECT cost FROM sms_messages WHERE tenant_id = $1 AND created_at >= $2) costs`,
    format: 'currency'
  },
  avg_cost_per_call: {
    name: 'Cost/Call',
    category: KPI_CATEGORIES.FINANCIAL,
    query: `SELECT AVG(cost) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2`,
    format: 'currency'
  },

  // Quality KPIs
  avg_csat: {
    name: 'Avg CSAT',
    category: KPI_CATEGORIES.QUALITY,
    query: `SELECT AVG(score) as value FROM customer_surveys WHERE tenant_id = $1 AND created_at >= $2 AND type = 'csat'`,
    format: 'decimal'
  },
  avg_nps: {
    name: 'NPS Score',
    category: KPI_CATEGORIES.QUALITY,
    query: `SELECT AVG(score) as value FROM customer_surveys WHERE tenant_id = $1 AND created_at >= $2 AND type = 'nps'`,
    format: 'decimal'
  },
  first_call_resolution: {
    name: 'FCR Rate',
    category: KPI_CATEGORIES.QUALITY,
    query: `SELECT (COUNT(CASE WHEN first_call_resolution = true THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100) as value FROM calls WHERE tenant_id = $1 AND created_at >= $2 AND direction = 'inbound'`,
    format: 'percent'
  }
};

/**
 * BI Dashboards Service
 */
class BIDashboardsService {
  // ============================================
  // Dashboard Management
  // ============================================

  /**
   * Create dashboard
   */
  async createDashboard(tenantId, dashboardData, createdBy) {
    const {
      name,
      type = DASHBOARD_TYPES.CUSTOM,
      description,
      layout = {},
      isDefault = false,
      isShared = false,
      refreshInterval = 60
    } = dashboardData;

    if (!name) {
      throw new Error('name is required');
    }

    const dashboardId = crypto.randomUUID();

    // If setting as default, unset other defaults
    if (isDefault) {
      await query(
        'UPDATE dashboards SET is_default = false WHERE tenant_id = $1 AND type = $2',
        [tenantId, type]
      );
    }

    const result = await query(`
      INSERT INTO dashboards (
        id, tenant_id, name, type, description, layout,
        is_default, is_shared, refresh_interval, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `, [
      dashboardId, tenantId, name, type, description, JSON.stringify(layout),
      isDefault, isShared, refreshInterval, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Get dashboard with widgets
   */
  async getDashboard(dashboardId) {
    const dashboardResult = await query(
      'SELECT * FROM dashboards WHERE id = $1',
      [dashboardId]
    );

    if (dashboardResult.rows.length === 0) return null;

    const dashboard = dashboardResult.rows[0];

    // Get widgets
    const widgetsResult = await query(`
      SELECT * FROM dashboard_widgets
      WHERE dashboard_id = $1
      ORDER BY position_y, position_x
    `, [dashboardId]);

    dashboard.widgets = widgetsResult.rows;

    return dashboard;
  }

  /**
   * Get dashboards for tenant
   */
  async getDashboards(tenantId, options = {}) {
    const { type, userId, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT d.*,
        (SELECT COUNT(*) FROM dashboard_widgets WHERE dashboard_id = d.id) as widget_count
      FROM dashboards d
      WHERE d.tenant_id = $1
        AND (d.is_shared = true OR d.created_by = $2)
    `;
    const params = [tenantId, userId || tenantId];

    if (type) {
      params.push(type);
      sql += ` AND d.type = $${params.length}`;
    }

    sql += ' ORDER BY d.is_default DESC, d.name ASC';
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Update dashboard
   */
  async updateDashboard(dashboardId, updates, updatedBy) {
    const allowedFields = ['name', 'description', 'layout', 'is_default', 'is_shared', 'refresh_interval'];
    const setClauses = [];
    const params = [dashboardId];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        params.push(snakeKey === 'layout' ? JSON.stringify(value) : value);
        setClauses.push(`${snakeKey} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return this.getDashboard(dashboardId);
    }

    params.push(updatedBy);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push('updated_at = NOW()');

    await query(`
      UPDATE dashboards
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);

    return this.getDashboard(dashboardId);
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId) {
    await query('DELETE FROM dashboard_widgets WHERE dashboard_id = $1', [dashboardId]);
    await query('DELETE FROM dashboards WHERE id = $1', [dashboardId]);
    return { deleted: true };
  }

  // ============================================
  // Widget Management
  // ============================================

  /**
   * Add widget to dashboard
   */
  async addWidget(dashboardId, widgetData, createdBy) {
    const {
      name,
      type,
      kpiId,
      customQuery,
      config = {},
      positionX = 0,
      positionY = 0,
      width = 4,
      height = 3
    } = widgetData;

    if (!name || !type) {
      throw new Error('name and type are required');
    }

    const widgetId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO dashboard_widgets (
        id, dashboard_id, name, type, kpi_id, custom_query,
        config, position_x, position_y, width, height,
        created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, [
      widgetId, dashboardId, name, type, kpiId, customQuery,
      JSON.stringify(config), positionX, positionY, width, height, createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Update widget
   */
  async updateWidget(widgetId, updates, updatedBy) {
    const allowedFields = ['name', 'config', 'position_x', 'position_y', 'width', 'height'];
    const setClauses = [];
    const params = [widgetId];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        params.push(snakeKey === 'config' ? JSON.stringify(value) : value);
        setClauses.push(`${snakeKey} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return query('SELECT * FROM dashboard_widgets WHERE id = $1', [widgetId]).then(r => r.rows[0]);
    }

    params.push(updatedBy);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push('updated_at = NOW()');

    await query(`
      UPDATE dashboard_widgets
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `, params);

    const result = await query('SELECT * FROM dashboard_widgets WHERE id = $1', [widgetId]);
    return result.rows[0];
  }

  /**
   * Delete widget
   */
  async deleteWidget(widgetId) {
    await query('DELETE FROM dashboard_widgets WHERE id = $1', [widgetId]);
    return { deleted: true };
  }

  /**
   * Reorder widgets
   */
  async reorderWidgets(dashboardId, positions) {
    for (const pos of positions) {
      await query(`
        UPDATE dashboard_widgets
        SET position_x = $1, position_y = $2, width = $3, height = $4, updated_at = NOW()
        WHERE id = $5 AND dashboard_id = $6
      `, [pos.x, pos.y, pos.width, pos.height, pos.widgetId, dashboardId]);
    }

    return { success: true };
  }

  // ============================================
  // KPI & Data Retrieval
  // ============================================

  /**
   * Get KPI value
   */
  async getKPIValue(tenantId, kpiId, options = {}) {
    const { startDate, endDate, compareWith } = options;

    const kpi = PREDEFINED_KPIS[kpiId];
    if (!kpi) {
      throw new Error(`Unknown KPI: ${kpiId}`);
    }

    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    const result = await query(kpi.query, [tenantId, start]);
    let value = parseFloat(result.rows[0]?.value || 0);

    // Format value
    const formatted = this.formatKPIValue(value, kpi.format);

    // Get comparison if requested
    let comparison = null;
    if (compareWith) {
      const comparisonStart = new Date(start.getTime() - (start.getTime() - new Date(compareWith).getTime()));
      const compResult = await query(kpi.query, [tenantId, comparisonStart]);
      const compValue = parseFloat(compResult.rows[0]?.value || 0);

      if (compValue !== 0) {
        comparison = {
          previousValue: compValue,
          change: value - compValue,
          changePercent: ((value - compValue) / compValue) * 100
        };
      }
    }

    return {
      kpiId,
      name: kpi.name,
      category: kpi.category,
      value,
      formatted,
      comparison,
      timestamp: new Date()
    };
  }

  /**
   * Get multiple KPIs
   */
  async getKPIs(tenantId, kpiIds, options = {}) {
    const results = [];

    for (const kpiId of kpiIds) {
      try {
        const kpiValue = await this.getKPIValue(tenantId, kpiId, options);
        results.push(kpiValue);
      } catch (error) {
        results.push({ kpiId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get all available KPIs
   */
  getAvailableKPIs() {
    return Object.entries(PREDEFINED_KPIS).map(([id, kpi]) => ({
      id,
      name: kpi.name,
      category: kpi.category,
      format: kpi.format
    }));
  }

  /**
   * Format KPI value
   */
  formatKPIValue(value, format) {
    if (value === null || value === undefined || isNaN(value)) {
      return '-';
    }

    switch (format) {
      case 'number':
        return Math.round(value).toLocaleString();
      case 'decimal':
        return value.toFixed(2);
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'currency':
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      case 'duration':
        const mins = Math.floor(value / 60);
        const secs = Math.round(value % 60);
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      default:
        return value.toString();
    }
  }

  /**
   * Execute widget query
   */
  async executeWidgetQuery(tenantId, widget, options = {}) {
    const { startDate, endDate, filters = {} } = options;

    // If using predefined KPI
    if (widget.kpi_id) {
      return this.getKPIValue(tenantId, widget.kpi_id, { startDate, endDate });
    }

    // If using custom query
    if (widget.custom_query) {
      const result = await query(widget.custom_query, [tenantId, startDate || new Date(0)]);
      return {
        widgetId: widget.id,
        data: result.rows,
        timestamp: new Date()
      };
    }

    // Generate data based on widget type
    return this.generateWidgetData(tenantId, widget, options);
  }

  /**
   * Generate widget data based on type
   */
  async generateWidgetData(tenantId, widget, options = {}) {
    const { startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), endDate = new Date() } = options;
    const config = typeof widget.config === 'string' ? JSON.parse(widget.config) : widget.config;

    switch (widget.type) {
      case WIDGET_TYPES.LINE_CHART:
      case WIDGET_TYPES.BAR_CHART:
        return this.getTimeSeriesData(tenantId, config, startDate, endDate);

      case WIDGET_TYPES.PIE_CHART:
        return this.getDistributionData(tenantId, config, startDate, endDate);

      case WIDGET_TYPES.TABLE:
        return this.getTableData(tenantId, config, startDate, endDate);

      case WIDGET_TYPES.GAUGE:
        return this.getGaugeData(tenantId, config, startDate, endDate);

      default:
        return { widgetId: widget.id, data: [], timestamp: new Date() };
    }
  }

  /**
   * Get time series data for charts
   */
  async getTimeSeriesData(tenantId, config, startDate, endDate) {
    const { metric = 'calls', groupBy = 'day' } = config;

    let dateFormat;
    switch (groupBy) {
      case 'hour': dateFormat = 'YYYY-MM-DD HH24:00'; break;
      case 'day': dateFormat = 'YYYY-MM-DD'; break;
      case 'week': dateFormat = 'IYYY-IW'; break;
      case 'month': dateFormat = 'YYYY-MM'; break;
      default: dateFormat = 'YYYY-MM-DD';
    }

    let table, countField;
    switch (metric) {
      case 'sms': table = 'sms_messages'; countField = '*'; break;
      case 'emails': table = 'emails'; countField = '*'; break;
      default: table = 'calls'; countField = '*';
    }

    const result = await query(`
      SELECT
        TO_CHAR(created_at, '${dateFormat}') as period,
        COUNT(${countField}) as count
      FROM ${table}
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY period
      ORDER BY period
    `, [tenantId, startDate, endDate]);

    return {
      labels: result.rows.map(r => r.period),
      datasets: [{
        label: metric,
        data: result.rows.map(r => parseInt(r.count))
      }],
      timestamp: new Date()
    };
  }

  /**
   * Get distribution data for pie charts
   */
  async getDistributionData(tenantId, config, startDate, endDate) {
    const { dimension = 'status', metric = 'calls' } = config;

    let table;
    switch (metric) {
      case 'sms': table = 'sms_messages'; break;
      case 'emails': table = 'emails'; break;
      default: table = 'calls';
    }

    const result = await query(`
      SELECT ${dimension}, COUNT(*) as count
      FROM ${table}
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY ${dimension}
      ORDER BY count DESC
    `, [tenantId, startDate, endDate]);

    return {
      labels: result.rows.map(r => r[dimension] || 'Unknown'),
      data: result.rows.map(r => parseInt(r.count)),
      timestamp: new Date()
    };
  }

  /**
   * Get table data
   */
  async getTableData(tenantId, config, startDate, endDate) {
    const { source = 'calls', columns = ['id', 'created_at', 'status'], limit = 20 } = config;

    let table;
    switch (source) {
      case 'sms': table = 'sms_messages'; break;
      case 'agents': table = 'agent_sessions'; break;
      default: table = 'calls';
    }

    const safeColumns = columns.filter(c => /^[a-z_]+$/.test(c));
    const result = await query(`
      SELECT ${safeColumns.join(', ')}
      FROM ${table}
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      ORDER BY created_at DESC
      LIMIT $4
    `, [tenantId, startDate, endDate, limit]);

    return {
      columns: safeColumns,
      rows: result.rows,
      timestamp: new Date()
    };
  }

  /**
   * Get gauge data
   */
  async getGaugeData(tenantId, config, startDate, endDate) {
    const { kpi = 'call_answer_rate', min = 0, max = 100, thresholds = [50, 75] } = config;

    const kpiData = await this.getKPIValue(tenantId, kpi, { startDate });

    return {
      value: kpiData.value,
      formatted: kpiData.formatted,
      min,
      max,
      thresholds,
      zones: [
        { from: min, to: thresholds[0], color: '#ff4444' },
        { from: thresholds[0], to: thresholds[1], color: '#ffbb33' },
        { from: thresholds[1], to: max, color: '#00C851' }
      ],
      timestamp: new Date()
    };
  }

  // ============================================
  // Dashboard Data Loading
  // ============================================

  /**
   * Load full dashboard with data
   */
  async loadDashboardWithData(dashboardId, tenantId, options = {}) {
    const dashboard = await this.getDashboard(dashboardId);

    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    // Load data for each widget
    const widgetsWithData = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        try {
          const data = await this.executeWidgetQuery(tenantId, widget, options);
          return { ...widget, data };
        } catch (error) {
          return { ...widget, data: null, error: error.message };
        }
      })
    );

    dashboard.widgets = widgetsWithData;
    dashboard.loadedAt = new Date();

    return dashboard;
  }

  // ============================================
  // Dashboard Templates
  // ============================================

  /**
   * Create dashboard from template
   */
  async createFromTemplate(tenantId, templateId, options, createdBy) {
    const templates = {
      executive: {
        name: 'Executive Overview',
        type: DASHBOARD_TYPES.EXECUTIVE,
        widgets: [
          { name: 'Total Calls', type: WIDGET_TYPES.KPI, kpiId: 'total_calls', x: 0, y: 0, w: 3, h: 2 },
          { name: 'Answer Rate', type: WIDGET_TYPES.GAUGE, kpiId: 'call_answer_rate', x: 3, y: 0, w: 3, h: 2 },
          { name: 'Revenue', type: WIDGET_TYPES.KPI, kpiId: 'total_revenue', x: 6, y: 0, w: 3, h: 2 },
          { name: 'Active Agents', type: WIDGET_TYPES.KPI, kpiId: 'active_agents', x: 9, y: 0, w: 3, h: 2 },
          { name: 'Call Volume', type: WIDGET_TYPES.LINE_CHART, config: { metric: 'calls', groupBy: 'day' }, x: 0, y: 2, w: 8, h: 4 },
          { name: 'Call Status', type: WIDGET_TYPES.PIE_CHART, config: { dimension: 'status' }, x: 8, y: 2, w: 4, h: 4 }
        ]
      },
      operations: {
        name: 'Operations Dashboard',
        type: DASHBOARD_TYPES.OPERATIONS,
        widgets: [
          { name: 'Queue Size', type: WIDGET_TYPES.KPI, kpiId: 'current_queue_size', x: 0, y: 0, w: 3, h: 2 },
          { name: 'Wait Time', type: WIDGET_TYPES.KPI, kpiId: 'avg_wait_time', x: 3, y: 0, w: 3, h: 2 },
          { name: 'Service Level', type: WIDGET_TYPES.GAUGE, kpiId: 'service_level', x: 6, y: 0, w: 3, h: 2 },
          { name: 'Abandon Rate', type: WIDGET_TYPES.KPI, kpiId: 'abandonment_rate', x: 9, y: 0, w: 3, h: 2 },
          { name: 'Agent Utilization', type: WIDGET_TYPES.GAUGE, kpiId: 'avg_agent_utilization', x: 0, y: 2, w: 4, h: 3 },
          { name: 'Calls by Hour', type: WIDGET_TYPES.BAR_CHART, config: { metric: 'calls', groupBy: 'hour' }, x: 4, y: 2, w: 8, h: 3 }
        ]
      },
      agent: {
        name: 'Agent Performance',
        type: DASHBOARD_TYPES.AGENT,
        widgets: [
          { name: 'My Calls', type: WIDGET_TYPES.KPI, kpiId: 'total_calls', x: 0, y: 0, w: 4, h: 2 },
          { name: 'Avg Handle Time', type: WIDGET_TYPES.KPI, kpiId: 'avg_handle_time', x: 4, y: 0, w: 4, h: 2 },
          { name: 'FCR Rate', type: WIDGET_TYPES.GAUGE, kpiId: 'first_call_resolution', x: 8, y: 0, w: 4, h: 2 }
        ]
      }
    };

    const template = templates[templateId];
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }

    // Create dashboard
    const dashboard = await this.createDashboard(tenantId, {
      name: options?.name || template.name,
      type: template.type,
      description: `Created from ${templateId} template`
    }, createdBy);

    // Add widgets
    for (const widget of template.widgets) {
      await this.addWidget(dashboard.id, {
        name: widget.name,
        type: widget.type,
        kpiId: widget.kpiId,
        config: widget.config || {},
        positionX: widget.x,
        positionY: widget.y,
        width: widget.w,
        height: widget.h
      }, createdBy);
    }

    return this.getDashboard(dashboard.id);
  }

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return [
      { id: 'executive', name: 'Executive Overview', description: 'High-level KPIs for executives' },
      { id: 'operations', name: 'Operations Dashboard', description: 'Real-time operational metrics' },
      { id: 'agent', name: 'Agent Performance', description: 'Individual agent metrics' }
    ];
  }
}

// Singleton instance
const biDashboardsService = new BIDashboardsService();

export default biDashboardsService;
export { DASHBOARD_TYPES, WIDGET_TYPES, KPI_CATEGORIES, PREDEFINED_KPIS };
