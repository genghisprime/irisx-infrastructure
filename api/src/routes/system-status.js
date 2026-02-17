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
 * Format matches what the Admin Portal SystemHealth.vue expects
 */
app.get('/health', authenticateAdmin, async (c) => {
  const startTime = Date.now();

  // Initialize health response with expected structure
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    overview: {
      totalRegions: 1,
      activeRegions: 1,
      totalInstances: 3,
      healthyInstances: 0
    },
    components: {},
    regions: {}
  };

  // Check Database
  let dbStatus = 'unknown';
  let dbResponseTime = 0;
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    dbResponseTime = Date.now() - dbStart;

    const connResult = await pool.query('SELECT count(*) as count FROM pg_stat_activity WHERE datname = $1', [process.env.DATABASE_NAME || 'irisx_prod']);
    const connections = parseInt(connResult.rows[0].count);

    const maxConnResult = await pool.query("SELECT setting::int as max FROM pg_settings WHERE name = 'max_connections'");
    const maxConnections = maxConnResult.rows[0].max;

    dbStatus = 'healthy';
    health.components.database = {
      status: 'healthy',
      responseTime: dbResponseTime,
      connections: {
        current: connections,
        max: maxConnections,
        percentage: Math.round((connections / maxConnections) * 100)
      }
    };
  } catch (error) {
    health.status = 'unhealthy';
    dbStatus = 'unhealthy';
    health.components.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check Redis
  let redisStatus = 'unknown';
  let redisResponseTime = 0;
  try {
    const redisStart = Date.now();
    await redis.ping();
    redisResponseTime = Date.now() - redisStart;

    const redisInfo = await redis.info('memory');
    const usedMemory = redisInfo.match(/used_memory_human:(.+)/)?.[1] || 'unknown';
    const maxMemory = redisInfo.match(/maxmemory_human:(.+)/)?.[1] || 'unknown';

    redisStatus = 'healthy';
    health.components.redis = {
      status: 'healthy',
      responseTime: redisResponseTime,
      memory: {
        used: usedMemory,
        max: maxMemory
      }
    };
  } catch (error) {
    health.status = 'degraded';
    redisStatus = 'unhealthy';
    health.components.redis = {
      status: 'unhealthy',
      error: error.message,
      responseTime: 0
    };
  }

  // Check FreeSWITCH (via database - check recent calls)
  let fsStatus = 'unknown';
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

    fsStatus = successRate >= 95 ? 'healthy' : successRate >= 80 ? 'degraded' : 'unhealthy';
    health.components.freeswitch = {
      status: fsStatus,
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

  // Check Mail Server (self-hosted Postfix)
  let mailStatus = 'unknown';
  let mailServerHealth = null;
  try {
    mailServerHealth = await getMailServerHealth(pool);
    mailStatus = mailServerHealth.status;

    health.components.mailServer = {
      status: mailServerHealth.status,
      server: mailServerHealth.server?.hostname || 'mail.tazzi.com',
      instance: mailServerHealth.instance?.status || 'unknown',
      services: {
        postfix: mailServerHealth.services?.postfix?.status || 'unknown',
        opendkim: mailServerHealth.services?.opendkim?.status || 'unknown'
      },
      queue: mailServerHealth.queue?.size || 0,
      delivery: mailServerHealth.delivery?.deliveryRate || '100%',
      certificate: mailServerHealth.certificate?.daysUntilExpiry !== null
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

  // Build regions data structure for the UI
  // Count healthy instances
  let healthyCount = 0;
  if (dbStatus === 'healthy') healthyCount++;
  if (fsStatus === 'healthy') healthyCount++;
  if (mailStatus === 'healthy') healthyCount++;
  health.overview.healthyInstances = healthyCount;

  // Build US-East-1 region structure
  health.regions['us-east-1'] = {
    name: 'US East (N. Virginia)',
    primary: true,
    status: healthyCount >= 2 ? 'healthy' : healthyCount >= 1 ? 'degraded' : 'unhealthy',
    availabilityZones: {
      'us-east-1a': {
        name: 'us-east-1a',
        apiServers: [{
          instanceId: 'i-032d6844d393bdef4',
          status: dbStatus === 'healthy' ? 'healthy' : 'stopped',
          ip: '3.211.106.196',
          privateIp: '10.0.1.240',
          serviceStatus: dbStatus === 'healthy' ? 'active' : 'inactive'
        }],
        freeswitchServers: [{
          instanceId: 'i-00b4b8ad65f1f32c1',
          status: fsStatus === 'healthy' ? 'healthy' : fsStatus === 'unknown' ? 'unknown' : 'stopped',
          ip: '54.160.220.243',
          privateIp: '10.0.1.213',
          serviceStatus: fsStatus === 'healthy' ? 'active' : 'unknown'
        }],
        mailServers: [{
          instanceId: 'i-03c2c04c25ceaf029',
          hostname: 'mail.tazzi.com',
          status: mailStatus === 'healthy' ? 'healthy' : mailStatus === 'unknown' ? 'unknown' : 'stopped',
          ip: '54.85.183.55',
          privateIp: '10.0.1.63',
          serviceStatus: mailStatus === 'healthy' ? 'active' : 'unknown'
        }]
      }
    },
    loadBalancers: [{
      service: 'API',
      status: 'healthy',
      dns: 'api.tazzi.com',
      type: 'Application',
      targets: {
        healthy: healthyCount,
        total: 3
      }
    }],
    cloudwatchAlarms: [
      { name: 'API-CPU-High', service: 'API Server', status: 'healthy' },
      { name: 'API-Memory-High', service: 'API Server', status: 'healthy' },
      { name: 'FreeSWITCH-CPU-High', service: 'FreeSWITCH', status: fsStatus === 'healthy' ? 'healthy' : 'unknown' },
      { name: 'RDS-CPU-High', service: 'Database', status: dbStatus === 'healthy' ? 'healthy' : 'unhealthy' }
    ]
  };

  // Overall health status
  const componentStatuses = Object.values(health.components).map(c => c.status);
  if (componentStatuses.includes('unhealthy')) {
    health.status = 'unhealthy';
  } else if (componentStatuses.includes('degraded')) {
    health.status = 'degraded';
  }

  // Response time
  health.metrics = {
    responseTime: Date.now() - startTime
  };

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
    `, [process.env.DATABASE_NAME || 'irisx_prod']);

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

    // Get successful calls count
    const successfulCallsResult = await pool.query(`
      SELECT COUNT(*) as successful
      FROM calls
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND status IN ('completed', 'answered')
    `);

    // Get database size in bytes
    const dbSizeBytesResult = await pool.query(`
      SELECT pg_database_size($1) as size_bytes
    `, [process.env.DATABASE_NAME || 'irisx_prod']);

    return c.json({
      // Flat format expected by SystemHealth.vue
      activeTenants: parseInt(metrics.active_tenants),
      totalTenants: parseInt(metrics.total_tenants),
      totalUsers: parseInt(metrics.total_users),
      activeTenants24h: parseInt(metrics.active_tenants_24h),
      communications: {
        voice: {
          total: parseInt(metrics.calls_24h),
          successful: parseInt(successfulCallsResult.rows[0].successful || 0),
          lastHour: parseInt(metrics.calls_1h),
          avgDuration: metrics.avg_call_duration ? Math.round(parseFloat(metrics.avg_call_duration)) : 0
        },
        sms: {
          total: 0
        },
        email: {
          total: 0
        }
      },
      database: {
        totalSize: parseInt(dbSizeBytesResult.rows[0].size_bytes || 0),
        sizeFormatted: dbSizeResult.rows[0].size,
        tables: tablesResult.rows.length,
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
    `, [process.env.DATABASE_NAME || 'irisx_prod']);

    // Connection pool capacity
    const connectionResult = await pool.query(`
      SELECT
        count(*) as current,
        setting::int as max
      FROM pg_stat_activity, pg_settings
      WHERE pg_settings.name = 'max_connections'
        AND pg_stat_activity.datname = $1
      GROUP BY setting
    `, [process.env.DATABASE_NAME || 'irisx_prod']);

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

    // Get 30-day availability
    const availability30dResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('completed', 'delivered', 'sent', 'answered')) as successful
      FROM calls
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const avail30d = availability30dResult.rows[0];
    const total30d = parseInt(avail30d.total);
    const successful30d = parseInt(avail30d.successful);
    const availability30dPercentage = total30d > 0 ? (successful30d / total30d) * 100 : 100;

    return c.json({
      uptime: {
        milliseconds: uptimeMs,
        hours: uptimeHours % 24,
        days: uptimeDays,
        minutes: Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60)),
        formatted: `${uptimeDays}d ${uptimeHours % 24}h`
      },
      availability: {
        last7Days: parseFloat(availabilityPercentage),
        last30Days: availability30dPercentage,
        totalOperations: total,
        successfulOperations: successful,
        failedOperations: parseInt(availability.failed),
        period: '7 days'
      },
      sla: {
        target: 99.9,
        current: parseFloat(availabilityPercentage),
        status: parseFloat(availabilityPercentage) >= 99.9 ? 'met' : 'below_target'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch uptime metrics', details: error.message }, 500);
  }
});

export default app;
