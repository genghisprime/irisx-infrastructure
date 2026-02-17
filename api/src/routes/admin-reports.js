/**
 * Admin Platform Reports Routes
 * System-wide reporting across all tenants
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';

const adminReports = new Hono();

/**
 * GET /admin-api/v1/reports/platform
 * Get platform-wide report data
 */
adminReports.get('/platform', async (c) => {
  try {
    const reportType = c.req.query('report_type');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const tenantId = c.req.query('tenant_id');

    if (!reportType) {
      return c.json({ success: false, error: 'Report type required' }, 400);
    }

    let data = [];
    let stats = {};

    const client = await pool.connect();
    try {
      switch (reportType) {
        case 'usage':
          data = await getUsageReport(client, startDate, endDate, tenantId);
          break;
        case 'revenue':
          data = await getRevenueReport(client, startDate, endDate, tenantId);
          break;
        case 'volume':
          data = await getVolumeReport(client, startDate, endDate, tenantId);
          break;
        case 'agents':
          data = await getAgentReport(client, startDate, endDate, tenantId);
          break;
        case 'campaigns':
          data = await getCampaignReport(client, startDate, endDate, tenantId);
          break;
        case 'sla':
          data = await getSLAReport(client, startDate, endDate, tenantId);
          break;
        default:
          return c.json({ success: false, error: 'Invalid report type' }, 400);
      }

      // Calculate summary stats
      stats = calculateStats(data, reportType);
    } finally {
      client.release();
    }

    return c.json({
      success: true,
      data,
      stats
    });
  } catch (error) {
    console.error('[Admin Reports] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /admin-api/v1/reports/platform/export
 * Export platform report
 */
adminReports.get('/platform/export', async (c) => {
  try {
    const reportType = c.req.query('report_type');
    const format = c.req.query('format') || 'xlsx';
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const tenantId = c.req.query('tenant_id');

    if (!reportType) {
      return c.json({ success: false, error: 'Report type required' }, 400);
    }

    const client = await pool.connect();
    let data = [];
    try {
      switch (reportType) {
        case 'usage':
          data = await getUsageReport(client, startDate, endDate, tenantId);
          break;
        case 'revenue':
          data = await getRevenueReport(client, startDate, endDate, tenantId);
          break;
        case 'volume':
          data = await getVolumeReport(client, startDate, endDate, tenantId);
          break;
        case 'agents':
          data = await getAgentReport(client, startDate, endDate, tenantId);
          break;
        case 'campaigns':
          data = await getCampaignReport(client, startDate, endDate, tenantId);
          break;
        case 'sla':
          data = await getSLAReport(client, startDate, endDate, tenantId);
          break;
        default:
          return c.json({ success: false, error: 'Invalid report type' }, 400);
      }
    } finally {
      client.release();
    }

    if (format === 'csv') {
      const csv = exportToCSV(data);
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="platform_report_${reportType}_${Date.now()}.csv"`);
      return c.body(csv);
    } else {
      const buffer = await exportToExcel(data, reportType);
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      c.header('Content-Disposition', `attachment; filename="platform_report_${reportType}_${Date.now()}.xlsx"`);
      return c.body(buffer);
    }
  } catch (error) {
    console.error('[Admin Reports] Export error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Report Query Functions

async function getUsageReport(client, startDate, endDate, tenantId) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND c.initiated_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND c.initiated_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND t.id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      t.name as tenant_name,
      COUNT(DISTINCT c.id) as total_calls,
      COUNT(DISTINCT s.id) as total_sms,
      COUNT(DISTINCT e.id) as total_emails,
      COALESCE(SUM(c.cost), 0) + COALESCE(SUM(s.cost), 0) + COALESCE(SUM(e.cost), 0) as total_cost
    FROM tenants t
    LEFT JOIN calls c ON c.tenant_id = t.id ${startDate ? 'AND c.initiated_at >= $1' : ''} ${endDate ? `AND c.initiated_at <= $${startDate ? 2 : 1}` : ''}
    LEFT JOIN sms_messages s ON s.tenant_id = t.id
    LEFT JOIN emails e ON e.tenant_id = t.id
    WHERE t.status = 'active'
    ${tenantId ? `AND t.id = $${paramCount - 1}` : ''}
    GROUP BY t.id, t.name
    ORDER BY total_calls DESC
  `, tenantId ? [tenantId] : []);

  return result.rows;
}

async function getRevenueReport(client, startDate, endDate, tenantId) {
  let whereClause = "WHERE i.status != 'draft'";
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND i.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND i.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND i.tenant_id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      t.name as tenant_name,
      SUM(i.amount) as total_revenue,
      COUNT(i.id) as invoice_count,
      SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN i.status IN ('pending', 'overdue') THEN i.amount ELSE 0 END) as outstanding
    FROM invoices i
    JOIN tenants t ON t.id = i.tenant_id
    ${whereClause}
    GROUP BY t.id, t.name
    ORDER BY total_revenue DESC
  `, params);

  return result.rows;
}

async function getVolumeReport(client, startDate, endDate, tenantId) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND initiated_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND initiated_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND tenant_id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      DATE(initiated_at) as date,
      COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound_calls,
      COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound_calls,
      COUNT(*) as total_calls,
      ROUND(AVG(duration_seconds)::numeric, 0) as avg_duration
    FROM calls
    ${whereClause}
    GROUP BY DATE(initiated_at)
    ORDER BY date DESC
  `, params);

  return result.rows;
}

async function getAgentReport(client, startDate, endDate, tenantId) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND c.initiated_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND c.initiated_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND a.tenant_id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      COALESCE(u.name, 'Unknown') as agent_name,
      t.name as tenant_name,
      COUNT(c.id) as calls_handled,
      ROUND(AVG(c.duration_seconds)::numeric, 0) as avg_handle_time,
      ROUND((COUNT(c.id)::numeric / NULLIF(COUNT(DISTINCT DATE(c.initiated_at)), 0) * 100), 0) as utilization
    FROM agents a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN tenants t ON t.id = a.tenant_id
    LEFT JOIN calls c ON c.agent_id = a.id
    ${whereClause}
    GROUP BY a.id, u.name, t.name
    ORDER BY calls_handled DESC
  `, params);

  return result.rows;
}

async function getCampaignReport(client, startDate, endDate, tenantId) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND c.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND c.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND c.tenant_id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      c.name as campaign_name,
      t.name as tenant_name,
      c.type,
      COALESCE(c.total_sent, 0) as total_sent,
      COALESCE(c.total_delivered, 0) as delivered,
      CASE
        WHEN c.total_sent > 0
        THEN ROUND((c.total_delivered::numeric / c.total_sent * 100), 1)
        ELSE 0
      END as delivery_rate
    FROM campaigns c
    JOIN tenants t ON t.id = c.tenant_id
    ${whereClause}
    ORDER BY c.created_at DESC
  `, params);

  return result.rows;
}

async function getSLAReport(client, startDate, endDate, tenantId) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (startDate) {
    whereClause += ` AND c.initiated_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    whereClause += ` AND c.initiated_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (tenantId) {
    whereClause += ` AND q.tenant_id = $${paramCount}`;
    params.push(tenantId);
    paramCount++;
  }

  const result = await client.query(`
    SELECT
      q.name as queue_name,
      t.name as tenant_name,
      COUNT(c.id) as total_calls,
      COUNT(CASE WHEN c.wait_time <= q.sla_target THEN 1 END) as answered_in_sla,
      ROUND((COUNT(CASE WHEN c.wait_time <= q.sla_target THEN 1 END)::numeric / NULLIF(COUNT(c.id), 0) * 100), 1) as sla_percent,
      COUNT(CASE WHEN c.status = 'abandoned' THEN 1 END) as abandoned
    FROM queues q
    JOIN tenants t ON t.id = q.tenant_id
    LEFT JOIN calls c ON c.queue_id = q.id
    ${whereClause}
    GROUP BY q.id, q.name, t.name
    ORDER BY sla_percent DESC
  `, params);

  return result.rows;
}

// Helper Functions

function calculateStats(data, reportType) {
  if (!data || data.length === 0) {
    return {
      totalRecords: 0,
      totalValue: 0,
      activeTenants: 0,
      avgPerTenant: 0
    };
  }

  const valueFields = {
    usage: 'total_calls',
    revenue: 'total_revenue',
    volume: 'total_calls',
    agents: 'calls_handled',
    campaigns: 'total_sent',
    sla: 'sla_percent'
  };

  const valueField = valueFields[reportType] || 'total';
  const totalValue = data.reduce((sum, row) => sum + (parseFloat(row[valueField]) || 0), 0);
  const uniqueTenants = new Set(data.map(row => row.tenant_name || row.tenant_id)).size;

  return {
    totalRecords: data.length,
    totalValue: Math.round(totalValue * 100) / 100,
    activeTenants: uniqueTenants || data.length,
    avgPerTenant: uniqueTenants ? Math.round((totalValue / uniqueTenants) * 100) / 100 : totalValue
  };
}

function exportToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => row[h] ?? ''));
  return stringify([headers, ...rows]);
}

async function exportToExcel(data, reportType) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IRISX Admin';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Report Data');

  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    worksheet.columns = headers.map(h => ({
      header: h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      key: h,
      width: 20
    }));

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    data.forEach(row => worksheet.addRow(row));
  }

  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 30 }
  ];
  summarySheet.getRow(1).font = { bold: true };

  summarySheet.addRow({ metric: 'Report Type', value: reportType });
  summarySheet.addRow({ metric: 'Total Records', value: data.length });
  summarySheet.addRow({ metric: 'Generated At', value: new Date().toISOString() });

  return workbook.xlsx.writeBuffer();
}

export default adminReports;
