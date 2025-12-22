/**
 * Billing Analytics Routes
 * MRR, Churn, LTV, Revenue Analytics, Usage Dashboard
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import billingAnalytics from '../services/billing-analytics.js';

const router = new Hono();

// ===========================================
// MRR ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/mrr
 * Get current MRR (platform or tenant-specific)
 */
router.get('/mrr', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  if (isAdmin && !tenantId) {
    // Platform-wide MRR
    const mrr = await billingAnalytics.calculatePlatformMRR();
    return c.json(mrr);
  } else {
    // Tenant MRR
    const mrr = await billingAnalytics.calculateTenantMRR(tenantId);
    return c.json({ mrr, tenantId });
  }
});

/**
 * GET /v1/billing-analytics/mrr/history
 * Get MRR history over time
 */
router.get('/mrr/history', zValidator('query', z.object({
  months: z.coerce.number().min(1).max(24).default(12),
  tenant_id: z.string().uuid().optional()
})), async (c) => {
  const { months, tenant_id } = c.req.valid('query');
  const tenantId = tenant_id || c.get('tenantId');

  const history = await billingAnalytics.getMRRHistory({
    tenantId: c.get('isAdmin') && !tenant_id ? null : tenantId,
    months
  });

  return c.json({ history });
});

/**
 * GET /v1/billing-analytics/mrr/movement
 * Get MRR movement (new, expansion, contraction, churn)
 */
router.get('/mrr/movement', zValidator('query', z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})), async (c) => {
  const { start_date, end_date } = c.req.valid('query');

  const movement = await billingAnalytics.calculateMRRMovement(
    new Date(start_date + 'T00:00:00Z'),
    new Date(end_date + 'T23:59:59Z')
  );

  return c.json(movement);
});

/**
 * POST /v1/billing-analytics/mrr/snapshot
 * Take MRR snapshot (admin only, typically run by cron)
 */
router.post('/mrr/snapshot', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const tenantId = body.tenant_id;

  const snapshot = await billingAnalytics.takeMRRSnapshot(tenantId);
  return c.json(snapshot);
});

// ===========================================
// CHURN ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/churn
 * Get churn rate metrics
 */
router.get('/churn', zValidator('query', z.object({
  months: z.coerce.number().min(1).max(12).default(1)
})), async (c) => {
  const { months } = c.req.valid('query');

  const churn = await billingAnalytics.calculateChurnRate({ months });
  return c.json(churn);
});

/**
 * GET /v1/billing-analytics/churn/reasons
 * Get breakdown of churn reasons
 */
router.get('/churn/reasons', zValidator('query', z.object({
  months: z.coerce.number().min(1).max(12).default(6)
})), async (c) => {
  const { months } = c.req.valid('query');

  const reasons = await billingAnalytics.getChurnReasons(months);
  return c.json({ reasons });
});

/**
 * POST /v1/billing-analytics/churn/event
 * Record a churn event
 */
router.post('/churn/event', zValidator('json', z.object({
  tenant_id: z.string().uuid(),
  event_type: z.enum([
    'subscription_cancelled',
    'subscription_downgraded',
    'subscription_upgraded',
    'subscription_paused',
    'subscription_resumed',
    'account_deactivated',
    'payment_failed_final'
  ]),
  previous_plan: z.string().optional(),
  new_plan: z.string().optional(),
  previous_mrr: z.number().optional(),
  new_mrr: z.number().optional(),
  churn_reason: z.string().optional(),
  churn_reason_detail: z.string().optional()
})), async (c) => {
  const data = c.req.valid('json');

  const event = await billingAnalytics.recordChurnEvent({
    tenantId: data.tenant_id,
    eventType: data.event_type,
    previousPlan: data.previous_plan,
    newPlan: data.new_plan,
    previousMRR: data.previous_mrr,
    newMRR: data.new_mrr,
    churnReason: data.churn_reason,
    churnReasonDetail: data.churn_reason_detail
  });

  return c.json(event, 201);
});

// ===========================================
// COHORT ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/cohorts
 * Get cohort retention matrix
 */
router.get('/cohorts', zValidator('query', z.object({
  months: z.coerce.number().min(1).max(24).default(12)
})), async (c) => {
  const { months } = c.req.valid('query');

  const matrix = await billingAnalytics.getCohortMatrix(months);
  return c.json({ cohorts: matrix });
});

/**
 * POST /v1/billing-analytics/cohorts/calculate
 * Recalculate cohort retention (admin only)
 */
router.post('/cohorts/calculate', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const results = await billingAnalytics.calculateCohortRetention();
  return c.json({ calculated: results.length, results });
});

// ===========================================
// LTV ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/ltv/:tenantId
 * Get LTV for a specific tenant
 */
router.get('/ltv/:tenantId', async (c) => {
  const { tenantId } = c.req.param();
  const requestingTenant = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  // Only allow access to own LTV or admin
  if (!isAdmin && tenantId !== requestingTenant) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const ltv = await billingAnalytics.calculateLTV(tenantId);
  return c.json(ltv);
});

/**
 * GET /v1/billing-analytics/health/:tenantId
 * Get health score for a tenant
 */
router.get('/health/:tenantId', async (c) => {
  const { tenantId } = c.req.param();
  const requestingTenant = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  if (!isAdmin && tenantId !== requestingTenant) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const health = await billingAnalytics.calculateHealthScore(tenantId);
  return c.json(health);
});

// ===========================================
// USAGE DASHBOARD ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/usage/trends
 * Get usage trends for customer dashboard
 */
router.get('/usage/trends', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(30),
  tenant_id: z.string().uuid().optional()
})), async (c) => {
  const { days, tenant_id } = c.req.valid('query');
  const tenantId = tenant_id || c.get('tenantId');

  const trends = await billingAnalytics.getUsageTrends(tenantId, { days });
  return c.json({ trends });
});

/**
 * GET /v1/billing-analytics/usage/summary
 * Get usage summary for current billing period
 */
router.get('/usage/summary', zValidator('query', z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tenant_id: z.string().uuid().optional()
})), async (c) => {
  const { start_date, end_date, tenant_id } = c.req.valid('query');
  const tenantId = tenant_id || c.get('tenantId');

  const summary = await billingAnalytics.getUsageSummary(tenantId, {
    startDate: start_date,
    endDate: end_date
  });

  return c.json(summary);
});

/**
 * POST /v1/billing-analytics/usage/record
 * Record daily usage (admin/cron job)
 */
router.post('/usage/record', zValidator('json', z.object({
  tenant_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})), async (c) => {
  const { tenant_id, date } = c.req.valid('json');

  const result = await billingAnalytics.recordDailyUsage(tenant_id, date);
  return c.json(result);
});

// ===========================================
// REVENUE ANALYTICS ENDPOINTS
// ===========================================

/**
 * GET /v1/billing-analytics/revenue/breakdown
 * Get revenue breakdown by type
 */
router.get('/revenue/breakdown', zValidator('query', z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tenant_id: z.string().uuid().optional()
})), async (c) => {
  const { start_date, end_date, tenant_id } = c.req.valid('query');

  const breakdown = await billingAnalytics.calculateRevenueBreakdown({
    tenantId: tenant_id,
    startDate: start_date,
    endDate: end_date
  });

  return c.json(breakdown);
});

/**
 * GET /v1/billing-analytics/platform/overview
 * Get platform-wide financial overview (admin only)
 */
router.get('/platform/overview', async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const overview = await billingAnalytics.getPlatformFinancials();
  return c.json(overview);
});

/**
 * GET /v1/billing-analytics/dashboard
 * Get comprehensive dashboard data for customer portal
 */
router.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId');

  // Fetch all dashboard data in parallel
  const [usageSummary, usageTrends, ltv] = await Promise.all([
    billingAnalytics.getUsageSummary(tenantId, {}),
    billingAnalytics.getUsageTrends(tenantId, { days: 30 }),
    billingAnalytics.calculateLTV(tenantId)
  ]);

  // Calculate spend by category for pie chart
  const spendByCategory = {
    calls: usageSummary.calls.cost,
    sms: usageSummary.sms.cost,
    email: usageSummary.email.cost,
    ai: usageSummary.ai.cost
  };

  // Calculate daily averages
  const daysInPeriod = trends.length || 1;
  const dailyAverages = {
    calls: Math.round(usageSummary.calls.used / daysInPeriod),
    sms: Math.round(usageSummary.sms.sent / daysInPeriod),
    email: Math.round(usageSummary.email.sent / daysInPeriod),
    spend: Math.round((usageSummary.totalCost / daysInPeriod) * 100) / 100
  };

  return c.json({
    summary: usageSummary,
    trends: usageTrends,
    spendByCategory,
    dailyAverages,
    healthScore: ltv.healthScore,
    healthFactors: ltv.healthFactors
  });
});

export default router;
