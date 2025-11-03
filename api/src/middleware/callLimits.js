import { query } from '../db/connection.js';

/**
 * Middleware to enforce per-tenant concurrent call limits
 */
export const checkConcurrentCallLimit = async (c, next) => {
  try {
    const tenantId = c.get('tenantId');
    
    if (\!tenantId) {
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Tenant ID not found',
        code: 'MISSING_TENANT' 
      }, 401);
    }

    // Get tenant configuration
    const tenantResult = await query(
      'SELECT settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return c.json({ 
        error: 'Not Found', 
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND' 
      }, 404);
    }

    const settings = tenantResult.rows[0].settings || {};
    const maxConcurrentCalls = settings.max_concurrent_calls || 10;

    // Count active calls for this tenant
    const activeCallsResult = await query(
      'SELECT COUNT(*) as count FROM calls WHERE tenant_id = $1 AND status IN ($2, $3, $4)',
      [tenantId, 'initiated', 'ringing', 'in-progress']
    );

    const activeCalls = parseInt(activeCallsResult.rows[0].count);

    console.log(`📊 Tenant ${tenantId}: ${activeCalls}/${maxConcurrentCalls} concurrent calls`);

    // Check if limit exceeded
    if (activeCalls >= maxConcurrentCalls) {
      return c.json({
        error: 'Resource Limit Exceeded',
        message: `Concurrent call limit reached (${maxConcurrentCalls} calls)`,
        code: 'CONCURRENT_CALL_LIMIT',
        limit: maxConcurrentCalls,
        current: activeCalls
      }, 429);
    }

    // Add metadata to context for logging
    c.set('concurrentCallStats', {
      current: activeCalls,
      limit: maxConcurrentCalls,
      available: maxConcurrentCalls - activeCalls
    });

    await next();
  } catch (error) {
    console.error('Concurrent call limit check failed:', error);
    return c.json({ 
      error: 'Internal Server Error',
      message: 'Failed to check call limits',
      code: 'LIMIT_CHECK_ERROR'
    }, 500);
  }
};

/**
 * Get current concurrent call stats for a tenant
 */
export const getConcurrentCallStats = async (tenantId) => {
  try {
    // Get tenant limit
    const tenantResult = await query(
      'SELECT settings FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return null;
    }

    const settings = tenantResult.rows[0].settings || {};
    const maxConcurrentCalls = settings.max_concurrent_calls || 10;

    // Count active calls
    const activeCallsResult = await query(
      'SELECT COUNT(*) as count FROM calls WHERE tenant_id = $1 AND status IN ($2, $3, $4)',
      [tenantId, 'initiated', 'ringing', 'in-progress']
    );

    const activeCalls = parseInt(activeCallsResult.rows[0].count);

    return {
      tenantId,
      limit: maxConcurrentCalls,
      current: activeCalls,
      available: maxConcurrentCalls - activeCalls,
      utilizationPercent: Math.round((activeCalls / maxConcurrentCalls) * 100)
    };
  } catch (error) {
    console.error('Failed to get concurrent call stats:', error);
    return null;
  }
};

export default { checkConcurrentCallLimit, getConcurrentCallStats };
