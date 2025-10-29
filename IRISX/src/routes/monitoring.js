/**
 * Health Monitoring & Incident Management API Routes
 *
 * Endpoints:
 * - GET /v1/monitoring/health - System health summary
 * - POST /v1/monitoring/health/check - Perform health checks
 * - GET /v1/monitoring/metrics/:name - Get specific metrics
 * - POST /v1/monitoring/metrics - Record a metric
 * - GET /v1/monitoring/uptime - Get uptime SLA
 * - GET /v1/monitoring/incidents - List incidents
 * - POST /v1/monitoring/incidents - Create incident
 * - GET /v1/monitoring/incidents/:id - Get incident details
 * - PATCH /v1/monitoring/incidents/:id - Update incident
 * - POST /v1/monitoring/incidents/:id/updates - Add incident update
 */

import { Hono } from 'hono';
import healthMonitoringService from '../services/healthMonitoring.js';

const monitoring = new Hono();

// Get system health summary
monitoring.get('/health', async (c) => {
  try {
    const summary = await healthMonitoringService.getSystemHealthSummary();

    const overallStatus = summary.every(comp => comp.status === 'healthy')
      ? 'healthy'
      : summary.some(comp => comp.status === 'unhealthy')
      ? 'unhealthy'
      : 'degraded';

    return c.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components: summary
    });
  } catch (error) {
    console.error('[Monitoring] Error getting health summary:', error);
    return c.json({ error: 'Failed to get health summary' }, 500);
  }
});

// Perform health checks
monitoring.post('/health/check', async (c) => {
  try {
    const result = await healthMonitoringService.performHealthChecks();
    return c.json(result);
  } catch (error) {
    console.error('[Monitoring] Error performing health checks:', error);
    return c.json({ error: 'Failed to perform health checks' }, 500);
  }
});

// Get metrics
monitoring.get('/metrics/:name', async (c) => {
  try {
    const metricName = c.req.param('name');
    const source = c.req.query('source');
    const since = c.req.query('since');
    const limit = parseInt(c.req.query('limit') || '100');

    const metrics = await healthMonitoringService.getMetrics(metricName, source, since, limit);

    return c.json({ metrics });
  } catch (error) {
    console.error('[Monitoring] Error getting metrics:', error);
    return c.json({ error: 'Failed to get metrics' }, 500);
  }
});

// Record a metric
monitoring.post('/metrics', async (c) => {
  try {
    const { metric_name, metric_type, metric_value, metric_unit, source, labels } = await c.req.json();

    const metric = await healthMonitoringService.recordMetric(
      metric_name,
      metric_type,
      metric_value,
      metric_unit,
      source,
      labels
    );

    return c.json({ message: 'Metric recorded successfully', metric }, 201);
  } catch (error) {
    console.error('[Monitoring] Error recording metric:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get uptime SLA
monitoring.get('/uptime', async (c) => {
  try {
    const sla = await healthMonitoringService.getUptimeSLA();
    return c.json({ uptime_sla: sla });
  } catch (error) {
    console.error('[Monitoring] Error getting uptime SLA:', error);
    return c.json({ error: 'Failed to get uptime SLA' }, 500);
  }
});

// List incidents
monitoring.get('/incidents', async (c) => {
  try {
    const filters = {
      status: c.req.query('status'),
      severity: c.req.query('severity'),
      assigned_to: c.req.query('assigned_to') ? parseInt(c.req.query('assigned_to')) : null,
      start_date: c.req.query('start_date'),
      end_date: c.req.query('end_date'),
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const incidents = await healthMonitoringService.listIncidents(filters);

    return c.json({ incidents });
  } catch (error) {
    console.error('[Monitoring] Error listing incidents:', error);
    return c.json({ error: 'Failed to list incidents' }, 500);
  }
});

// Get open incidents
monitoring.get('/incidents/open', async (c) => {
  try {
    const incidents = await healthMonitoringService.getOpenIncidents();
    return c.json({ open_incidents: incidents });
  } catch (error) {
    console.error('[Monitoring] Error getting open incidents:', error);
    return c.json({ error: 'Failed to get open incidents' }, 500);
  }
});

// Create incident
monitoring.post('/incidents', async (c) => {
  try {
    const incidentData = await c.req.json();

    const incident = await healthMonitoringService.createIncident(incidentData);

    return c.json({
      message: 'Incident created successfully',
      incident
    }, 201);
  } catch (error) {
    console.error('[Monitoring] Error creating incident:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get incident details
monitoring.get('/incidents/:id', async (c) => {
  try {
    const incidentId = parseInt(c.req.param('id'));

    const incident = await healthMonitoringService.getIncident(incidentId);

    return c.json({ incident });
  } catch (error) {
    console.error('[Monitoring] Error getting incident:', error);
    return c.json({ error: error.message }, 404);
  }
});

// Update incident
monitoring.patch('/incidents/:id', async (c) => {
  try {
    const incidentId = parseInt(c.req.param('id'));
    const updates = await c.req.json();

    const incident = await healthMonitoringService.updateIncident(incidentId, updates);

    return c.json({
      message: 'Incident updated successfully',
      incident
    });
  } catch (error) {
    console.error('[Monitoring] Error updating incident:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Add incident update
monitoring.post('/incidents/:id/updates', async (c) => {
  try {
    const incidentId = parseInt(c.req.param('id'));
    const userId = c.get('user')?.id || 1;
    const { status, message, is_public = false } = await c.req.json();

    const update = await healthMonitoringService.addIncidentUpdate(
      incidentId,
      status,
      message,
      userId,
      is_public
    );

    return c.json({
      message: 'Incident update added successfully',
      update
    }, 201);
  } catch (error) {
    console.error('[Monitoring] Error adding incident update:', error);
    return c.json({ error: error.message }, 400);
  }
});

export default monitoring;
