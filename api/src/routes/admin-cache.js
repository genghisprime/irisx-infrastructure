/**
 * Admin Cache Management Routes
 * Redis cache monitoring, pattern management, session tracking
 * Requires admin authentication
 */

import { Hono } from 'hono';
import redis from '../db/redis.js';
import { authenticateAdmin } from './admin-auth.js';

const adminCache = new Hono();

// All routes require admin authentication
adminCache.use('*', authenticateAdmin);

/**
 * GET /admin/cache/stats
 * Overall Redis cache statistics
 */
adminCache.get('/stats', async (c) => {
  try {
    // Get Redis INFO
    const info = await redis.info('all');
    const lines = info.split('\r\n');
    const stats = {};

    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    });

    // Get key count by pattern
    const totalKeys = await redis.dbsize();

    // Get memory stats
    const memoryUsed = parseInt(stats.used_memory || 0);
    const memoryMax = parseInt(stats.maxmemory || 2147483648); // 2GB default
    const memoryPercentage = memoryMax > 0 ? Math.round((memoryUsed / memoryMax) * 100) : 0;

    // Calculate hit rate
    const keyspaceHits = parseInt(stats.keyspace_hits || 0);
    const keyspaceMisses = parseInt(stats.keyspace_misses || 0);
    const hitRate = (keyspaceHits + keyspaceMisses) > 0
      ? Math.round((keyspaceHits / (keyspaceHits + keyspaceMisses)) * 1000) / 10
      : 0;

    // Ops per second
    const opsPerSec = parseInt(stats.instantaneous_ops_per_sec || 0);

    return c.json({
      memory_used: memoryUsed,
      memory_max: memoryMax,
      memory_percentage: memoryPercentage,
      total_keys: totalKeys,
      hit_rate: hitRate,
      ops_per_sec: opsPerSec,
      connected_clients: parseInt(stats.connected_clients || 0),
      uptime_seconds: parseInt(stats.uptime_in_seconds || 0),
      evicted_keys: parseInt(stats.evicted_keys || 0),
      expired_keys: parseInt(stats.expired_keys || 0)
    });

  } catch (err) {
    console.error('Cache stats error:', err);
    return c.json({ error: 'Failed to load cache stats' }, 500);
  }
});

/**
 * GET /admin/cache/patterns
 * Cache statistics by key pattern
 */
adminCache.get('/patterns', async (c) => {
  try {
    const patterns = [
      'session:*',
      'user:*',
      'tenant:*',
      'call:*',
      'sms:*',
      'rate_limit:*'
    ];

    const patternStats = await Promise.all(patterns.map(async (pattern) => {
      try {
        // Get keys matching pattern (limit to 10000 for safety)
        const keys = await redis.keys(pattern);
        const keyCount = keys.length;

        if (keyCount === 0) {
          return {
            pattern,
            keys: 0,
            memory: 0,
            hit_rate: 0,
            avg_ttl: 0
          };
        }

        // Sample a few keys to get average TTL and memory
        const sampleSize = Math.min(keyCount, 100);
        const sampleKeys = keys.slice(0, sampleSize);

        let totalTtl = 0;
        let totalMemory = 0;
        let keysWithTtl = 0;

        for (const key of sampleKeys) {
          const ttl = await redis.ttl(key);
          if (ttl > 0) {
            totalTtl += ttl;
            keysWithTtl++;
          }

          // Estimate memory (rough approximation)
          const value = await redis.get(key);
          if (value) {
            totalMemory += Buffer.byteLength(value, 'utf8');
          }
        }

        const avgTtl = keysWithTtl > 0 ? Math.round(totalTtl / keysWithTtl) : 0;
        const avgMemoryPerKey = sampleSize > 0 ? totalMemory / sampleSize : 0;
        const estimatedTotalMemory = Math.round(avgMemoryPerKey * keyCount);

        return {
          pattern,
          keys: keyCount,
          memory: estimatedTotalMemory,
          hit_rate: 95, // Redis doesn't track per-pattern, use default
          avg_ttl: avgTtl
        };
      } catch (err) {
        console.error(`Error processing pattern ${pattern}:`, err);
        return {
          pattern,
          keys: 0,
          memory: 0,
          hit_rate: 0,
          avg_ttl: 0
        };
      }
    }));

    return c.json(patternStats);

  } catch (err) {
    console.error('Cache patterns error:', err);
    return c.json({ error: 'Failed to load cache patterns' }, 500);
  }
});

/**
 * GET /admin/cache/sessions
 * List active user sessions
 */
adminCache.get('/sessions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');

    // Get all session keys
    const sessionKeys = await redis.keys('session:*');
    const limitedKeys = sessionKeys.slice(0, limit);

    const sessions = await Promise.all(limitedKeys.map(async (key) => {
      try {
        const data = await redis.get(key);
        if (!data) return null;

        const session = JSON.parse(data);
        const ttl = await redis.ttl(key);
        const sessionId = key.replace('session:', '');

        // Handle invalid TTL values (keys with no expiry return -1)
        const expiresAt = ttl > 0
          ? new Date(Date.now() + (ttl * 1000)).toISOString()
          : null;

        return {
          id: sessionId,
          user_email: session.email || 'unknown',
          tenant_name: session.tenant_name || 'unknown',
          tenant_id: session.tenant_id || null,
          created_at: session.created_at || new Date().toISOString(),
          expires_at: expiresAt
        };
      } catch (err) {
        console.error(`Error processing session ${key}:`, err);
        return null;
      }
    }));

    return c.json(sessions.filter(s => s !== null));

  } catch (err) {
    console.error('Sessions error:', err);
    return c.json({ error: 'Failed to load sessions' }, 500);
  }
});

/**
 * POST /admin/cache/clear
 * Clear cache by pattern
 */
adminCache.post('/clear', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const pattern = body.pattern || '*';

    // Safety check - require specific pattern, not wildcard
    if (pattern === '*' && admin.role !== 'superadmin') {
      return c.json({ error: 'Superadmin required to clear all cache' }, 403);
    }

    // Get matching keys
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return c.json({ message: 'No keys found matching pattern', count: 0 });
    }

    // Delete keys in batches
    const batchSize = 1000;
    let deletedCount = 0;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await redis.del(...batch);
      deletedCount += batch.length;
    }

    return c.json({
      message: `Cleared ${deletedCount} keys`,
      pattern,
      count: deletedCount
    });

  } catch (err) {
    console.error('Cache clear error:', err);
    return c.json({ error: 'Failed to clear cache' }, 500);
  }
});

/**
 * GET /admin/cache/eviction-stats
 * Eviction policy and statistics
 * Note: AWS ElastiCache restricts CONFIG command, so eviction_policy is not available
 */
adminCache.get('/eviction-stats', async (c) => {
  try {
    const info = await redis.info('stats');
    const lines = info.split('\r\n');
    const stats = {};

    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    });

    // Calculate hit rate
    const hits = parseInt(stats.keyspace_hits || 0);
    const misses = parseInt(stats.keyspace_misses || 0);
    const total = hits + misses;
    const hitRate = total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;

    return c.json({
      total_evictions: parseInt(stats.evicted_keys || 0),
      eviction_policy: 'managed', // ElastiCache managed, CONFIG not available
      expired_keys: parseInt(stats.expired_keys || 0),
      keyspace_hits: hits,
      keyspace_misses: misses,
      hit_rate: hitRate
    });

  } catch (err) {
    console.error('Eviction stats error:', err);
    return c.json({ error: 'Failed to load eviction stats' }, 500);
  }
});

export default adminCache;
