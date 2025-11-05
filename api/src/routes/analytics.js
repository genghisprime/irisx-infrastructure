/**
 * Analytics API Routes
 * Unified cross-channel analytics endpoints
 */

import { Hono } from 'hono';
import { z } from 'zod';
import analyticsService from '../services/analytics.js';

const analytics = new Hono();

// Validation schema
const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
});

/**
 * GET /v1/analytics/stats - Get dashboard statistics summary
 */
analytics.get('/stats', async (c) => {
  try {
    // Return basic stats - can be enhanced later
    return c.json({
      success: true,
      data: {
        totalCalls: 0,
        totalMessages: 0,
        activeContacts: 0,
        activeCampaigns: 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({
      error: 'Failed to fetch stats',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/unified - Get unified metrics across all channels
 */
analytics.get('/unified', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    // Validate date range
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    // Validate date range (max 90 days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      return c.json({
        error: 'Date range cannot exceed 90 days'
      }, 400);
    }

    if (start > end) {
      return c.json({
        error: 'Start date must be before end date'
      }, 400);
    }

    const metrics = await analyticsService.getUnifiedMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching unified analytics:', error);
    return c.json({
      error: 'Failed to fetch analytics',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/overview - Get high-level overview metrics
 */
analytics.get('/overview', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const overview = await analyticsService.getOverviewMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching overview:', error);
    return c.json({
      error: 'Failed to fetch overview',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/trends - Get trend data for charts
 */
analytics.get('/trends', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const trends = await analyticsService.getTrendData(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return c.json({
      error: 'Failed to fetch trends',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/cost - Get cost analysis by channel
 */
analytics.get('/cost', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const costAnalysis = await analyticsService.getCostAnalysis(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: costAnalysis
    });
  } catch (error) {
    console.error('Error fetching cost analysis:', error);
    return c.json({
      error: 'Failed to fetch cost analysis',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/voice - Get voice channel metrics
 */
analytics.get('/voice', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const metrics = await analyticsService.getVoiceMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching voice metrics:', error);
    return c.json({
      error: 'Failed to fetch voice metrics',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/sms - Get SMS channel metrics
 */
analytics.get('/sms', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const metrics = await analyticsService.getSmsMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching SMS metrics:', error);
    return c.json({
      error: 'Failed to fetch SMS metrics',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/email - Get email channel metrics
 */
analytics.get('/email', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const metrics = await analyticsService.getEmailMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching email metrics:', error);
    return c.json({
      error: 'Failed to fetch email metrics',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/whatsapp - Get WhatsApp channel metrics
 */
analytics.get('/whatsapp', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const metrics = await analyticsService.getWhatsAppMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching WhatsApp metrics:', error);
    return c.json({
      error: 'Failed to fetch WhatsApp metrics',
      message: error.message
    }, 500);
  }
});

/**
 * GET /v1/analytics/social - Get social media metrics
 */
analytics.get('/social', async (c) => {
  const tenantId = c.get('tenantId');
  const { startDate, endDate } = c.req.query();

  try {
    const validation = dateRangeSchema.safeParse({ startDate, endDate });
    if (!validation.success) {
      return c.json({
        error: 'Invalid date range',
        details: validation.error.errors
      }, 400);
    }

    const metrics = await analyticsService.getSocialMetrics(
      tenantId,
      startDate,
      endDate
    );

    return c.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching social metrics:', error);
    return c.json({
      error: 'Failed to fetch social metrics',
      message: error.message
    }, 500);
  }
});

export default analytics;
