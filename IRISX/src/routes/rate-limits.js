/**
 * Rate Limiting API Routes
 *
 * Endpoints:
 * - GET /v1/rate-limits/rules - List rate limit rules
 * - POST /v1/rate-limits/rules - Create custom rule
 * - PATCH /v1/rate-limits/rules/:id - Update rule
 * - DELETE /v1/rate-limits/rules/:id - Delete rule
 * - GET /v1/rate-limits/violations - List violations
 * - GET /v1/rate-limits/top-violators - Get top violators
 * - GET /v1/rate-limits/quotas - Get quota usage
 * - POST /v1/rate-limits/quotas/reset - Reset expired quotas
 */

import { Hono } from 'hono';
import rateLimitService from '../services/rateLimit.js';

const rateLimits = new Hono();

// List rate limit rules
rateLimits.get('/rules', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const resourceType = c.req.query('resource_type');

    const rules = await rateLimitService.getRules(tenantId, resourceType);

    return c.json({ rules });
  } catch (error) {
    console.error('[RateLimits] Error listing rules:', error);
    return c.json({ error: 'Failed to list rate limit rules' }, 500);
  }
});

// Create custom rate limit rule
rateLimits.post('/rules', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const ruleData = await c.req.json();

    const rule = await rateLimitService.createRule({
      ...ruleData,
      tenant_id: tenantId
    });

    return c.json({
      message: 'Rate limit rule created successfully',
      rule
    }, 201);
  } catch (error) {
    console.error('[RateLimits] Error creating rule:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Update rate limit rule
rateLimits.patch('/rules/:id', async (c) => {
  try {
    const ruleId = parseInt(c.req.param('id'));
    const updates = await c.req.json();

    const rule = await rateLimitService.updateRule(ruleId, updates);

    return c.json({
      message: 'Rate limit rule updated successfully',
      rule
    });
  } catch (error) {
    console.error('[RateLimits] Error updating rule:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Delete rate limit rule
rateLimits.delete('/rules/:id', async (c) => {
  try {
    const ruleId = parseInt(c.req.param('id'));

    await rateLimitService.deleteRule(ruleId);

    return c.json({
      message: 'Rate limit rule deleted successfully'
    });
  } catch (error) {
    console.error('[RateLimits] Error deleting rule:', error);
    return c.json({ error: error.message }, 400);
  }
});

// List violations
rateLimits.get('/violations', async (c) => {
  try {
    const filters = {
      tenant_id: c.get('user')?.tenant_id || 1,
      user_id: c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null,
      ip_address: c.req.query('ip_address'),
      resource_type: c.req.query('resource_type'),
      start_date: c.req.query('start_date'),
      end_date: c.req.query('end_date'),
      limit: parseInt(c.req.query('limit') || '100'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const violations = await rateLimitService.listViolations(filters);

    return c.json({ violations });
  } catch (error) {
    console.error('[RateLimits] Error listing violations:', error);
    return c.json({ error: 'Failed to list violations' }, 500);
  }
});

// Get top violators
rateLimits.get('/top-violators', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');

    const violators = await rateLimitService.getTopViolators(limit);

    return c.json({ top_violators: violators });
  } catch (error) {
    console.error('[RateLimits] Error getting top violators:', error);
    return c.json({ error: 'Failed to get top violators' }, 500);
  }
});

// Get quota usage
rateLimits.get('/quotas', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || null;

    const quotas = await rateLimitService.getQuotaUsageSummary(tenantId);

    return c.json({ quotas });
  } catch (error) {
    console.error('[RateLimits] Error getting quota usage:', error);
    return c.json({ error: 'Failed to get quota usage' }, 500);
  }
});

// Reset expired quotas (admin only)
rateLimits.post('/quotas/reset', async (c) => {
  try {
    const resetCount = await rateLimitService.resetExpiredQuotas();

    return c.json({
      message: 'Expired quotas reset successfully',
      reset_count: resetCount
    });
  } catch (error) {
    console.error('[RateLimits] Error resetting quotas:', error);
    return c.json({ error: 'Failed to reset quotas' }, 500);
  }
});

export default rateLimits;
