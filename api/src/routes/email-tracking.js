/**
 * Email Tracking Routes
 * Handles tracking pixels, link clicks, and engagement analytics
 */

const { Hono } = require('hono');
const { z } = require('zod');
const emailTracking = require('../services/email-tracking');

const router = new Hono();

// ===== PUBLIC TRACKING ENDPOINTS =====

// Track email open (returns 1x1 transparent pixel)
router.get('/open/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || '';

    // Record the open (non-blocking)
    emailTracking.recordOpen(token, ipAddress, userAgent).catch(err => {
      console.error('Error recording email open:', err);
    });

    // Return tracking pixel immediately
    const pixel = emailTracking.getTrackingPixel();
    c.header('Content-Type', 'image/gif');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.body(pixel);
  } catch (error) {
    console.error('Tracking pixel error:', error);
    // Still return a pixel even on error
    const pixel = emailTracking.getTrackingPixel();
    c.header('Content-Type', 'image/gif');
    return c.body(pixel);
  }
});

// Track link click (redirects to original URL)
router.get('/click/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || '';

    // Record click and get original URL
    const originalUrl = await emailTracking.recordClick(token, ipAddress, userAgent);

    if (!originalUrl) {
      return c.text('Link expired or invalid', 404);
    }

    // Redirect to original URL
    return c.redirect(originalUrl, 302);
  } catch (error) {
    console.error('Link click error:', error);
    return c.text('Error processing link', 500);
  }
});

// ===== AUTHENTICATED ANALYTICS ENDPOINTS =====

// Get email engagement metrics
router.get('/emails/:emailId/metrics', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');

    const metrics = await emailTracking.getEmailMetrics(emailId, tenantId);

    if (!metrics) {
      return c.json({
        success: true,
        data: {
          totalSent: 0,
          totalDelivered: 0,
          totalOpens: 0,
          uniqueOpens: 0,
          totalClicks: 0,
          uniqueClicks: 0,
          openRate: 0,
          clickRate: 0,
          clickToOpenRate: 0
        }
      });
    }

    return c.json({
      success: true,
      data: {
        totalSent: metrics.total_sent,
        totalDelivered: metrics.total_delivered,
        totalBounced: metrics.total_bounced,
        totalOpens: metrics.total_opens,
        uniqueOpens: metrics.unique_opens,
        totalClicks: metrics.total_clicks,
        uniqueClicks: metrics.unique_clicks,
        totalUnsubscribes: metrics.total_unsubscribes,
        totalSpamReports: metrics.total_spam_reports,
        openRate: parseFloat(metrics.open_rate) || 0,
        clickRate: parseFloat(metrics.click_rate) || 0,
        clickToOpenRate: parseFloat(metrics.click_to_open_rate) || 0,
        bounceRate: parseFloat(metrics.bounce_rate) || 0,
        unsubscribeRate: parseFloat(metrics.unsubscribe_rate) || 0,
        spamRate: parseFloat(metrics.spam_rate) || 0,
        firstOpenAt: metrics.first_open_at,
        lastOpenAt: metrics.last_open_at,
        firstClickAt: metrics.first_click_at,
        lastClickAt: metrics.last_click_at
      }
    });
  } catch (error) {
    console.error('Get email metrics error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get email opens
router.get('/emails/:emailId/opens', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    const opens = await emailTracking.getEmailOpens(emailId, tenantId, { limit, offset });

    return c.json({
      success: true,
      data: opens.map(o => ({
        id: o.id,
        recipientEmail: o.recipient_email,
        openedAt: o.opened_at,
        ipAddress: o.ip_address,
        deviceType: o.device_type,
        browser: o.browser,
        os: o.os,
        locationCountry: o.location_country,
        locationCity: o.location_city,
        isFirstOpen: o.is_first_open
      }))
    });
  } catch (error) {
    console.error('Get email opens error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get email clicks
router.get('/emails/:emailId/clicks', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    const clicks = await emailTracking.getEmailClicks(emailId, tenantId, { limit, offset });

    return c.json({
      success: true,
      data: clicks.map(c => ({
        id: c.id,
        recipientEmail: c.recipient_email,
        clickedAt: c.clicked_at,
        originalUrl: c.original_url,
        linkText: c.link_text,
        ipAddress: c.ip_address,
        deviceType: c.device_type,
        browser: c.browser,
        os: c.os,
        clickNumber: c.click_number
      }))
    });
  } catch (error) {
    console.error('Get email clicks error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get link performance
router.get('/emails/:emailId/links', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');

    const links = await emailTracking.getEmailLinkPerformance(emailId, tenantId);

    return c.json({
      success: true,
      data: links.map(l => ({
        id: l.id,
        originalUrl: l.original_url,
        linkText: l.link_text,
        position: l.position_in_email,
        totalClicks: l.click_count,
        uniqueClicks: l.unique_click_count
      }))
    });
  } catch (error) {
    console.error('Get link performance error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get device breakdown
router.get('/emails/:emailId/devices', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');

    const devices = await emailTracking.getDeviceBreakdown(emailId, tenantId);

    return c.json({
      success: true,
      data: devices.map(d => ({
        deviceType: d.device_type || 'unknown',
        count: parseInt(d.count),
        uniqueRecipients: parseInt(d.unique_recipients)
      }))
    });
  } catch (error) {
    console.error('Get device breakdown error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get engagement by hour
router.get('/emails/:emailId/engagement-by-hour', async (c) => {
  try {
    const emailId = c.req.param('emailId');
    const tenantId = c.get('tenantId');

    const hourly = await emailTracking.getEngagementByHour(emailId, tenantId);

    // Fill in missing hours with zeros
    const fullHourly = Array.from({ length: 24 }, (_, i) => {
      const found = hourly.find(h => parseInt(h.hour) === i);
      return {
        hour: i,
        opens: found ? parseInt(found.opens) : 0,
        uniqueOpens: found ? parseInt(found.unique_opens) : 0
      };
    });

    return c.json({
      success: true,
      data: fullHourly
    });
  } catch (error) {
    console.error('Get engagement by hour error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== CAMPAIGN ANALYTICS =====

// Get campaign metrics
router.get('/campaigns/:campaignId/metrics', async (c) => {
  try {
    const campaignId = c.req.param('campaignId');
    const tenantId = c.get('tenantId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const metrics = await emailTracking.getCampaignMetrics(campaignId, tenantId, { startDate, endDate });

    return c.json({
      success: true,
      data: metrics.map(m => ({
        date: m.date,
        emailsSent: m.emails_sent,
        emailsDelivered: m.emails_delivered,
        emailsBounced: m.emails_bounced,
        totalOpens: m.total_opens,
        uniqueOpens: m.unique_opens,
        totalClicks: m.total_clicks,
        uniqueClicks: m.unique_clicks,
        unsubscribes: m.unsubscribes,
        spamReports: m.spam_reports,
        deliveryRate: parseFloat(m.delivery_rate) || 0,
        openRate: parseFloat(m.open_rate) || 0,
        clickRate: parseFloat(m.click_rate) || 0,
        clickToOpenRate: parseFloat(m.click_to_open_rate) || 0,
        opensByHour: m.opens_by_hour,
        clicksByHour: m.clicks_by_hour,
        topLinks: m.top_links,
        deviceBreakdown: m.device_breakdown,
        geoBreakdown: m.geo_breakdown
      }))
    });
  } catch (error) {
    console.error('Get campaign metrics error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get campaign summary
router.get('/campaigns/:campaignId/summary', async (c) => {
  try {
    const campaignId = c.req.param('campaignId');
    const tenantId = c.get('tenantId');

    const summary = await emailTracking.getCampaignSummary(campaignId, tenantId);

    if (!summary) {
      return c.json({
        success: true,
        data: {
          totalSent: 0,
          totalDelivered: 0,
          totalOpens: 0,
          uniqueOpens: 0,
          totalClicks: 0,
          uniqueClicks: 0
        }
      });
    }

    return c.json({
      success: true,
      data: {
        totalSent: parseInt(summary.total_sent) || 0,
        totalDelivered: parseInt(summary.total_delivered) || 0,
        totalBounced: parseInt(summary.total_bounced) || 0,
        totalOpens: parseInt(summary.total_opens) || 0,
        uniqueOpens: parseInt(summary.unique_opens) || 0,
        totalClicks: parseInt(summary.total_clicks) || 0,
        uniqueClicks: parseInt(summary.unique_clicks) || 0,
        totalUnsubscribes: parseInt(summary.total_unsubscribes) || 0,
        totalSpamReports: parseInt(summary.total_spam_reports) || 0,
        avgDeliveryRate: parseFloat(summary.avg_delivery_rate) || 0,
        avgOpenRate: parseFloat(summary.avg_open_rate) || 0,
        avgClickRate: parseFloat(summary.avg_click_rate) || 0,
        avgClickToOpenRate: parseFloat(summary.avg_click_to_open_rate) || 0
      }
    });
  } catch (error) {
    console.error('Get campaign summary error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== TOP PERFORMERS =====

// Get top performing emails
router.get('/top-performing', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit')) || 10;
    const metric = c.req.query('metric') || 'open_rate';
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const emails = await emailTracking.getTopPerformingEmails(tenantId, {
      limit,
      metric,
      startDate,
      endDate
    });

    return c.json({
      success: true,
      data: emails.map(e => ({
        id: e.id,
        subject: e.subject,
        sentAt: e.sent_at,
        totalSent: e.total_sent,
        uniqueOpens: e.unique_opens,
        uniqueClicks: e.unique_clicks,
        openRate: parseFloat(e.open_rate) || 0,
        clickRate: parseFloat(e.click_rate) || 0,
        clickToOpenRate: parseFloat(e.click_to_open_rate) || 0
      }))
    });
  } catch (error) {
    console.error('Get top performing emails error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== MAINTENANCE =====

// Cleanup expired tokens (admin only)
router.post('/maintenance/cleanup', async (c) => {
  try {
    const deleted = await emailTracking.cleanupExpiredTokens();

    return c.json({
      success: true,
      data: {
        deletedTokens: deleted
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

module.exports = router;
