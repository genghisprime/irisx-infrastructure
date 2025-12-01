/**
 * System Status API Routes
 * Provides real-time system health and metrics
 * Used by Admin Portal, Customer Portal, and monitoring systems
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import redis from '../db/redis.js';
import { authenticateAdmin } from './admin-auth.js';
import { z } from 'zod';
import { getMailServerHealth } from '../services/mail-server-monitor.js';

const app = new Hono();

/**
 * GET /admin/system/health
 * Comprehensive system health check
 * Returns status of all critical components
 */
app.get('/health', authenticateAdmin, async (c) => {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: {},
    metrics: {}
  };

  // Check Database
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const dbTime = Date.now() - dbStart;

    const connResult = await pool.query('SELECT count(*) as count FROM pg_stat_activity WHERE datname = $1', [process.env.DATABASE_NAME || 'irisx_production']);
    const connections = parseInt(connResult.rows[0].count);

    const maxConnResult = await pool.query("SELECT setting::int as max FROM pg_settings WHERE name = 'max_connections'");
    const maxConnections = maxConnResult.rows[0].max;

    health.components.database = {
      status: 'healthy',
      responseTime: dbTime,
      connections: {
        current: connections,
        max: maxConnections,
        percentage: Math.round((connections / maxConnections) * 100)
      }
    };
  } catch (error) {
    health.status = 'unhealthy';
    health.components.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    await redis.ping();
    const redisTime = Date.now() - redisStart;

    const redisInfo = await redis.info('memory');
    const usedMemory = redisInfo.match(/used_memory_human:(.+)/)?.[1] || 'unknown';
    const maxMemory = redisInfo.match(/maxmemory_human:(.+)/)?.[1] || 'unknown';

    health.components.redis = {
      status: 'healthy',
      responseTime: redisTime,
      memory: {
        used: usedMemory,
        max: maxMemory
      }
    };
  } catch (error) {
    health.status = 'degraded';
    health.components.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check FreeSWITCH (via database - check recent calls)
  try {
    const fsResult = await pool.query(`
      SELECT
        COUNT(*) as total_calls_last_hour,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_calls,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_calls
      FROM calls
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const row = fsResult.rows[0];
    const totalCalls = parseInt(row.total_calls_last_hour);
    const successRate = totalCalls > 0 ? Math.round((parseInt(row.successful_calls) / totalCalls) * 100) : 100;

    health.components.freeswitch = {
      status: successRate >= 95 ? 'healthy' : successRate >= 80 ? 'degraded' : 'unhealthy',
      callsLastHour: totalCalls,
      successRate: `${successRate}%`,
      failedCalls: parseInt(row.failed_calls)
    };
  } catch (error) {
    health.components.freeswitch = {
      status: 'unknown',
      error: error.message
    };
  }

  // Check Workers (via database - check recent message processing)
  try {
    // Workers check disabled - sms_messages and emails tables don't exist yet
    const workersResult = { rows: [{ queued: 0, failed: 0, successful: 0 }] };

    const row = workersResult.rows[0];
    const queued = parseInt(row.queued);
    const failed = parseInt(row.failed);

    health.components.workers = {
      status: queued > 1000 ? 'degraded' : failed > 100 ? 'degraded' : 'healthy',
      queuedMessages: queued,
      failedMessages: failed,
      successfulMessages: parseInt(row.successful)
    };
  } catch (error) {
    health.components.workers = {
      status: 'unknown',
      error: error.message
    };
  }

  // Check Mail Server (self-hosted Postfix)
  try {
    const mailServerHealth = await getMailServerHealth(pool);

    health.components.mailServer = {
      status: mailServerHealth.status,
      server: mailServerHealth.server.hostname,
      instance: mailServerHealth.instance.status,
      services: {
        postfix: mailServerHealth.services.postfix?.status || 'unknown',
        opendkim: mailServerHealth.services.opendkim?.status || 'unknown'
      },
      queue: mailServerHealth.queue.size,
      delivery: mailServerHealth.delivery.deliveryRate || '100%',
      certificate: mailServerHealth.certificate.daysUntilExpiry !== null
        ? `${mailServerHealth.certificate.daysUntilExpiry}d`
        : 'unknown'
    };

    if (mailServerHealth.status === 'degraded') {
      health.status = 'degraded';
    } else if (mailServerHealth.status === 'unhealthy') {
      health.status = 'unhealthy';
    }
  } catch (error) {
    health.components.mailServer = {
      status: 'unknown',
      error: error.message
    };
  }

  // Overall health status
  const componentStatuses = Object.values(health.components).map(c => c.status);
  if (componentStatuses.includes('unhealthy')) {
    health.status = 'unhealthy';
  } else if (componentStatuses.includes('degraded')) {
    health.status = 'degraded';
  }

  // Response time
  health.metrics.responseTime = Date.now() - startTime;

  return c.json(health);
});

/**
 * GET /admin/system/metrics
 * Platform-wide metrics and statistics
 */
app.get('/metrics', authenticateAdmin, async (c) => {
  try {
    // Get overall platform metrics (safely check for existing tables)
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND deleted_at IS NULL) as active_tenants,
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) as total_tenants,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
        (SELECT COUNT(*) FROM calls WHERE created_at > NOW() - INTERVAL '24 hours') as calls_24h,
        (SELECT COUNT(*) FROM calls WHERE created_at > NOW() - INTERVAL '1 hour') as calls_1h,
        0 as avg_call_duration,
        (SELECT COUNT(DISTINCT tenant_id) FROM calls WHERE created_at > NOW() - INTERVAL '24 hours') as active_tenants_24h
    `);

    const metrics = result.rows[0];

    // Get database size
    const dbSizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size($1)) as size
    `, [process.env.DATABASE_NAME || 'irisx_production']);

    // Get top tables by size
    const tablesResult = await pool.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY size_bytes DESC
      LIMIT 10
    `);

    return c.json({
      platform: {
        activeTenants: parseInt(metrics.active_tenants),
        totalTenants: parseInt(metrics.total_tenants),
        totalUsers: parseInt(metrics.total_users),
        activeTenants24h: parseInt(metrics.active_tenants_24h)
      },
      communications: {
        calls: {
          last24Hours: parseInt(metrics.calls_24h),
          lastHour: parseInt(metrics.calls_1h),
          avgDuration: metrics.avg_call_duration ? Math.round(parseFloat(metrics.avg_call_duration)) : 0
        },
        sms: {
          last24Hours: 0
        },
        emails: {
          last24Hours: 0
        }
      },
      database: {
        size: dbSizeResult.rows[0].size,
        topTables: tablesResult.rows.map(row => ({
          table: row.tablename,
          size: row.size
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[System Status] Metrics error:', error);
    return c.json({ error: 'Failed to fetch metrics', details: error.message }, 500);
  }
});

/**
 * GET /admin/system/performance
 * System performance metrics
 */
app.get('/performance', authenticateAdmin, async (c) => {
  try {
    // Get slow queries (queries taking > 1 second)
    const slowQueriesResult = await pool.query(`
      SELECT
        query,
        mean_exec_time,
        calls,
        total_exec_time
      FROM pg_stat_statements
      WHERE mean_exec_time > 1000
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `).catch(() => ({ rows: [] })); // pg_stat_statements might not be enabled

    // Get table statistics
    const tableStatsResult = await pool.query(`
      SELECT
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC
      LIMIT 10
    `);

    // Get index usage
    const indexUsageResult = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
      LIMIT 10
    `);

    // Get cache hit ratio
    const cacheHitResult = await pool.query(`
      SELECT
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
      FROM pg_statio_user_tables
    `);

    const cacheHitRatio = cacheHitResult.rows[0].ratio ? parseFloat(cacheHitResult.rows[0].ratio) * 100 : 0;

    return c.json({
      performance: {
        cacheHitRatio: `${cacheHitRatio.toFixed(2)}%`,
        slowQueries: slowQueriesResult.rows.length,
        slowQueriesList: slowQueriesResult.rows.map(row => ({
          query: row.query.substring(0, 100) + '...',
          avgTime: `${Math.round(row.mean_exec_time)}ms`,
          calls: parseInt(row.calls),
          totalTime: `${Math.round(parseFloat(row.total_exec_time))}ms`
        }))
      },
      tables: {
        mostActive: tableStatsResult.rows.map(row => ({
          table: row.tablename,
          inserts: parseInt(row.inserts),
          updates: parseInt(row.updates),
          deletes: parseInt(row.deletes),
          liveRows: parseInt(row.live_rows)
        }))
      },
      indexes: {
        mostUsed: indexUsageResult.rows.map(row => ({
          table: row.tablename,
          index: row.indexname,
          scans: parseInt(row.scans),
          tuplesRead: parseInt(row.tuples_read)
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch performance metrics', details: error.message }, 500);
  }
});

/**
 * GET /admin/system/errors
 * Recent system errors and issues
 */
app.get('/errors', authenticateAdmin, async (c) => {
  try {
    const { hours = 24 } = c.req.query();
    const hoursInt = parseInt(hours);

    // Get failed calls (no error_message column in schema yet)
    const failedCallsResult = await pool.query(`
      SELECT
        id,
        to_number,
        from_number,
        status,
        created_at,
        tenant_id
      FROM calls
      WHERE status = 'failed'
        AND created_at > NOW() - INTERVAL '${hoursInt} hours'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Get error summary (only from calls table)
    const errorSummaryResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed') as total_errors,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour') as errors_last_hour,
        COUNT(DISTINCT tenant_id) FILTER (WHERE status = 'failed') as affected_tenants
      FROM calls
      WHERE created_at > NOW() - INTERVAL '${hoursInt} hours'
    `);

    const summary = errorSummaryResult.rows[0];

    return c.json({
      summary: {
        totalErrors: parseInt(summary.total_errors),
        errorsLastHour: parseInt(summary.errors_last_hour),
        affectedTenants: parseInt(summary.affected_tenants),
        timeRange: `${hoursInt} hours`
      },
      errors: {
        calls: failedCallsResult.rows.map(row => ({
          id: row.id,
          to: row.to_number,
          from: row.from_number,
          error: 'Call failed',
          timestamp: row.created_at,
          tenantId: row.tenant_id
        })),
        sms: [],
        emails: []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[System Status] Errors endpoint error:', error);
    return c.json({ error: 'Failed to fetch errors', details: error.message }, 500);
  }
});

/**
 * GET /admin/system/capacity
 * System capacity and resource utilization
 */
app.get('/capacity', authenticateAdmin, async (c) => {
  try {
    // Database capacity
    const dbCapacityResult = await pool.query(`
      SELECT
        pg_database_size($1) as current_size,
        setting::bigint as max_size
      FROM pg_settings
      WHERE name = 'shared_buffers'
    `, [process.env.DATABASE_NAME || 'irisx_production']);

    // Connection pool capacity
    const connectionResult = await pool.query(`
      SELECT
        count(*) as current,
        setting::int as max
      FROM pg_stat_activity, pg_settings
      WHERE pg_settings.name = 'max_connections'
        AND pg_stat_activity.datname = $1
      GROUP BY setting
    `, [process.env.DATABASE_NAME || 'irisx_production']);

    // Get tenant count and growth
    const tenantGrowthResult = await pool.query(`
      SELECT
        COUNT(*) as total_tenants,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_last_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_last_month
      FROM tenants
      WHERE deleted_at IS NULL
    `);

    // Get user count and growth
    const userGrowthResult = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_last_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_last_month
      FROM users
      WHERE deleted_at IS NULL
    `);

    const dbSize = parseInt(dbCapacityResult.rows[0].current_size);
    const connections = connectionResult.rows[0] || { current: 0, max: 100 };
    const tenantGrowth = tenantGrowthResult.rows[0];
    const userGrowth = userGrowthResult.rows[0];

    return c.json({
      database: {
        size: {
          current: `${(dbSize / 1024 / 1024 / 1024).toFixed(2)} GB`,
          bytes: dbSize
        },
        connections: {
          current: parseInt(connections.current),
          max: parseInt(connections.max),
          percentage: Math.round((parseInt(connections.current) / parseInt(connections.max)) * 100)
        }
      },
      tenants: {
        total: parseInt(tenantGrowth.total_tenants),
        newLastWeek: parseInt(tenantGrowth.new_last_week),
        newLastMonth: parseInt(tenantGrowth.new_last_month),
        growthRate: parseInt(tenantGrowth.total_tenants) > 0
          ? `${Math.round((parseInt(tenantGrowth.new_last_month) / parseInt(tenantGrowth.total_tenants)) * 100)}%`
          : '0%'
      },
      users: {
        total: parseInt(userGrowth.total_users),
        newLastWeek: parseInt(userGrowth.new_last_week),
        newLastMonth: parseInt(userGrowth.new_last_month),
        growthRate: parseInt(userGrowth.total_users) > 0
          ? `${Math.round((parseInt(userGrowth.new_last_month) / parseInt(userGrowth.total_users)) * 100)}%`
          : '0%'
      },
      recommendations: []
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch capacity metrics', details: error.message }, 500);
  }
});

/**
 * GET /admin/system/uptime
 * System uptime and availability metrics
 */
app.get('/uptime', authenticateAdmin, async (c) => {
  try {
    // Calculate uptime based on oldest active session or call
    const uptimeResult = await pool.query(`
      SELECT
        MIN(created_at) as oldest_session
      FROM (
        SELECT created_at FROM sessions WHERE created_at > NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT created_at FROM calls WHERE created_at > NOW() - INTERVAL '7 days'
      ) combined
    `);

    const oldestSession = uptimeResult.rows[0].oldest_session;
    const uptimeMs = oldestSession ? Date.now() - new Date(oldestSession).getTime() : 0;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeDays = Math.floor(uptimeHours / 24);

    // Get availability percentage (based on failed vs successful operations)
    // Only check calls table (sms_messages and emails don't exist yet)
    const availabilityResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('completed', 'delivered', 'sent')) as successful,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM calls
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    const availability = availabilityResult.rows[0];
    const total = parseInt(availability.total);
    const successful = parseInt(availability.successful);
    const availabilityPercentage = total > 0 ? ((successful / total) * 100).toFixed(2) : 100;

    return c.json({
      uptime: {
        milliseconds: uptimeMs,
        hours: uptimeHours,
        days: uptimeDays,
        formatted: `${uptimeDays}d ${uptimeHours % 24}h`
      },
      availability: {
        percentage: `${availabilityPercentage}%`,
        totalOperations: total,
        successfulOperations: successful,
        failedOperations: parseInt(availability.failed),
        period: '7 days'
      },
      sla: {
        target: '99.9%',
        current: `${availabilityPercentage}%`,
        status: parseFloat(availabilityPercentage) >= 99.9 ? 'met' : 'below_target'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch uptime metrics', details: error.message }, 500);
  }
});

export default app;
