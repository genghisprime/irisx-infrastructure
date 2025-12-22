/**
 * ClickHouse Data Warehouse Admin API Routes
 *
 * Endpoints for ClickHouse analytics administration and querying
 */

import { Router } from 'express';
import clickhouseService, { TABLES } from '../services/clickhouse.js';

const router = Router();

// ============================================
// Health & Status
// ============================================

/**
 * GET /admin/clickhouse/health
 * Get ClickHouse health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await clickhouseService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Error checking ClickHouse health:', error);
    res.status(500).json({ error: 'Failed to check ClickHouse health' });
  }
});

/**
 * GET /admin/clickhouse/stats
 * Get table statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await clickhouseService.getTableStats();

    if (!stats) {
      return res.status(503).json({
        error: 'ClickHouse unavailable',
        message: 'Data warehouse is not connected'
      });
    }

    res.json({
      tables: TABLES,
      stats
    });
  } catch (error) {
    console.error('Error getting ClickHouse stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// ============================================
// Platform Analytics (Cross-Tenant)
// ============================================

/**
 * GET /admin/clickhouse/platform/overview
 * Get platform-wide metrics overview
 */
router.get('/platform/overview', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const overview = await clickhouseService.getPlatformOverview({
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined
    });

    if (!overview) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json(overview);
  } catch (error) {
    console.error('Error getting platform overview:', error);
    res.status(500).json({ error: 'Failed to get platform overview' });
  }
});

/**
 * GET /admin/clickhouse/platform/top-tenants
 * Get top tenants by usage/revenue
 */
router.get('/platform/top-tenants', async (req, res) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query;

    const topTenants = await clickhouseService.getTopTenants({
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined,
      limit: parseInt(limit)
    });

    if (!topTenants) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ tenants: topTenants });
  } catch (error) {
    console.error('Error getting top tenants:', error);
    res.status(500).json({ error: 'Failed to get top tenants' });
  }
});

/**
 * GET /admin/clickhouse/platform/carrier-quality
 * Get carrier quality rankings
 */
router.get('/platform/carrier-quality', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const quality = await clickhouseService.getCarrierQuality({
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined
    });

    if (!quality) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ carriers: quality });
  } catch (error) {
    console.error('Error getting carrier quality:', error);
    res.status(500).json({ error: 'Failed to get carrier quality' });
  }
});

// ============================================
// Tenant Analytics
// ============================================

/**
 * GET /admin/clickhouse/tenants/:tenantId/calls
 * Get call statistics for a tenant
 */
router.get('/tenants/:tenantId/calls', async (req, res) => {
  try {
    const { start_date, end_date, group_by = 'day' } = req.query;

    const stats = await clickhouseService.getCallStats(req.params.tenantId, {
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined,
      groupBy: group_by
    });

    if (!stats) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ stats });
  } catch (error) {
    console.error('Error getting call stats:', error);
    res.status(500).json({ error: 'Failed to get call statistics' });
  }
});

/**
 * GET /admin/clickhouse/tenants/:tenantId/channels
 * Get channel comparison for a tenant
 */
router.get('/tenants/:tenantId/channels', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const channels = await clickhouseService.getChannelComparison(req.params.tenantId, {
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined
    });

    if (!channels) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ channels });
  } catch (error) {
    console.error('Error getting channel comparison:', error);
    res.status(500).json({ error: 'Failed to get channel comparison' });
  }
});

/**
 * GET /admin/clickhouse/tenants/:tenantId/usage
 * Get usage summary for billing
 */
router.get('/tenants/:tenantId/usage', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const usage = await clickhouseService.getTenantUsageSummary(req.params.tenantId, {
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined
    });

    if (!usage) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ usage });
  } catch (error) {
    console.error('Error getting usage summary:', error);
    res.status(500).json({ error: 'Failed to get usage summary' });
  }
});

/**
 * GET /admin/clickhouse/tenants/:tenantId/api-usage
 * Get API usage patterns for a tenant
 */
router.get('/tenants/:tenantId/api-usage', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const apiUsage = await clickhouseService.getAPIUsagePatterns(req.params.tenantId, {
      startDate: start_date ? new Date(start_date) : undefined,
      endDate: end_date ? new Date(end_date) : undefined
    });

    if (!apiUsage) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ endpoints: apiUsage });
  } catch (error) {
    console.error('Error getting API usage:', error);
    res.status(500).json({ error: 'Failed to get API usage' });
  }
});

/**
 * GET /admin/clickhouse/tenants/:tenantId/realtime
 * Get real-time metrics for a tenant
 */
router.get('/tenants/:tenantId/realtime', async (req, res) => {
  try {
    const metrics = await clickhouseService.getRealTimeMetrics(req.params.tenantId);

    if (!metrics) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ metrics });
  } catch (error) {
    console.error('Error getting real-time metrics:', error);
    res.status(500).json({ error: 'Failed to get real-time metrics' });
  }
});

/**
 * GET /admin/clickhouse/tenants/:tenantId/campaigns/:campaignId
 * Get campaign performance metrics
 */
router.get('/tenants/:tenantId/campaigns/:campaignId', async (req, res) => {
  try {
    const performance = await clickhouseService.getCampaignPerformance(
      req.params.tenantId,
      req.params.campaignId
    );

    if (!performance) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ events: performance });
  } catch (error) {
    console.error('Error getting campaign performance:', error);
    res.status(500).json({ error: 'Failed to get campaign performance' });
  }
});

// ============================================
// Data Ingestion
// ============================================

/**
 * POST /admin/clickhouse/ingest/call
 * Manually insert a call record
 */
router.post('/ingest/call', async (req, res) => {
  try {
    const result = await clickhouseService.insertCall(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting call:', error);
    res.status(500).json({ error: 'Failed to insert call record' });
  }
});

/**
 * POST /admin/clickhouse/ingest/calls
 * Batch insert call records
 */
router.post('/ingest/calls', async (req, res) => {
  try {
    const { calls } = req.body;

    if (!Array.isArray(calls)) {
      return res.status(400).json({ error: 'calls must be an array' });
    }

    const count = await clickhouseService.insertCallsBatch(calls);

    if (count === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: true, inserted: count });
  } catch (error) {
    console.error('Error inserting calls batch:', error);
    res.status(500).json({ error: 'Failed to insert call records' });
  }
});

/**
 * POST /admin/clickhouse/ingest/quality
 * Insert call quality metrics
 */
router.post('/ingest/quality', async (req, res) => {
  try {
    const result = await clickhouseService.insertCallQuality(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting quality metrics:', error);
    res.status(500).json({ error: 'Failed to insert quality metrics' });
  }
});

/**
 * POST /admin/clickhouse/ingest/sms
 * Insert SMS record
 */
router.post('/ingest/sms', async (req, res) => {
  try {
    const result = await clickhouseService.insertSMS(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting SMS:', error);
    res.status(500).json({ error: 'Failed to insert SMS record' });
  }
});

/**
 * POST /admin/clickhouse/ingest/email
 * Insert email record
 */
router.post('/ingest/email', async (req, res) => {
  try {
    const result = await clickhouseService.insertEmail(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting email:', error);
    res.status(500).json({ error: 'Failed to insert email record' });
  }
});

/**
 * POST /admin/clickhouse/ingest/campaign-event
 * Insert campaign event
 */
router.post('/ingest/campaign-event', async (req, res) => {
  try {
    const result = await clickhouseService.insertCampaignEvent(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting campaign event:', error);
    res.status(500).json({ error: 'Failed to insert campaign event' });
  }
});

/**
 * POST /admin/clickhouse/ingest/analytics-event
 * Insert analytics event
 */
router.post('/ingest/analytics-event', async (req, res) => {
  try {
    const result = await clickhouseService.insertAnalyticsEvent(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting analytics event:', error);
    res.status(500).json({ error: 'Failed to insert analytics event' });
  }
});

/**
 * POST /admin/clickhouse/ingest/billing-event
 * Insert billing event
 */
router.post('/ingest/billing-event', async (req, res) => {
  try {
    const result = await clickhouseService.insertBillingEvent(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting billing event:', error);
    res.status(500).json({ error: 'Failed to insert billing event' });
  }
});

/**
 * POST /admin/clickhouse/ingest/api-request
 * Insert API request for usage tracking
 */
router.post('/ingest/api-request', async (req, res) => {
  try {
    const result = await clickhouseService.insertAPIRequest(req.body);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ success: result });
  } catch (error) {
    console.error('Error inserting API request:', error);
    res.status(500).json({ error: 'Failed to insert API request' });
  }
});

// ============================================
// Data Sync
// ============================================

/**
 * POST /admin/clickhouse/sync/calls
 * Sync calls from PostgreSQL to ClickHouse
 */
router.post('/sync/calls', async (req, res) => {
  try {
    const { batch_size = 1000, start_date } = req.body;
    const { pool } = await import('../db.js');

    const result = await clickhouseService.syncCallsFromPostgres(pool, {
      batchSize: parseInt(batch_size),
      startDate: start_date ? new Date(start_date) : undefined
    });

    res.json(result);
  } catch (error) {
    console.error('Error syncing calls:', error);
    res.status(500).json({ error: 'Failed to sync calls' });
  }
});

// ============================================
// Raw Query (Admin Only - Use with caution)
// ============================================

/**
 * POST /admin/clickhouse/query
 * Execute raw ClickHouse query (admin only)
 */
router.post('/query', async (req, res) => {
  try {
    const { query, params = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Basic safety check - don't allow destructive operations
    const lowerQuery = query.toLowerCase().trim();
    const forbidden = ['drop', 'truncate', 'delete', 'alter', 'create', 'insert'];

    if (forbidden.some(word => lowerQuery.startsWith(word))) {
      return res.status(403).json({
        error: 'Forbidden operation',
        message: 'Only SELECT queries are allowed through this endpoint'
      });
    }

    const result = await clickhouseService.rawQuery(query, params);

    if (result === null) {
      return res.status(503).json({ error: 'ClickHouse unavailable' });
    }

    res.json({ result });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).json({ error: error.message || 'Query execution failed' });
  }
});

export default router;
