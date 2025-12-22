/**
 * Email Tracking Service
 * Handles tracking pixels, link tracking, and engagement metrics
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class EmailTrackingService {
  constructor() {
    // 1x1 transparent GIF pixel
    this.TRACKING_PIXEL = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
  }

  /**
   * Generate a secure tracking token
   */
  generateToken() {
    return crypto.randomBytes(24).toString('base64url');
  }

  /**
   * Create tracking pixel token for an email
   */
  async createPixelTracking(tenantId, emailId, recipientEmail) {
    const token = this.generateToken();

    await pool.query(
      `INSERT INTO email_tracking_tokens (tenant_id, email_id, recipient_email, token, token_type)
       VALUES ($1, $2, $3, $4, 'pixel')
       ON CONFLICT (email_id, recipient_email, token_type, link_id)
       DO UPDATE SET token = EXCLUDED.token, expires_at = NOW() + INTERVAL '90 days'
       RETURNING token`,
      [tenantId, emailId, recipientEmail, token]
    );

    return token;
  }

  /**
   * Create tracked link
   */
  async createTrackedLink(tenantId, emailId, recipientEmail, originalUrl, linkText = null, position = null) {
    const token = this.generateToken();

    // First, create the tracked link record
    const linkResult = await pool.query(
      `INSERT INTO email_tracked_links (tenant_id, email_id, original_url, tracking_url, link_text, position_in_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [tenantId, emailId, originalUrl, `${process.env.API_URL}/track/click/${token}`, linkText, position]
    );

    const linkId = linkResult.rows[0].id;

    // Create the tracking token
    await pool.query(
      `INSERT INTO email_tracking_tokens (tenant_id, email_id, recipient_email, token, token_type, link_id)
       VALUES ($1, $2, $3, $4, 'link', $5)
       ON CONFLICT (email_id, recipient_email, token_type, link_id)
       DO UPDATE SET token = EXCLUDED.token`,
      [tenantId, emailId, recipientEmail, token, linkId]
    );

    return {
      linkId,
      token,
      trackingUrl: `${process.env.API_URL}/track/click/${token}`
    };
  }

  /**
   * Process HTML and replace links with tracked versions
   */
  async processEmailHtml(tenantId, emailId, recipientEmail, html) {
    // Find all links in the HTML
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']([^>]*)>(.*?)<\/a>/gi;
    let match;
    let processedHtml = html;
    let position = 0;

    const links = [];
    while ((match = linkRegex.exec(html)) !== null) {
      const originalUrl = match[1];
      const attributes = match[2];
      const linkText = match[3];

      // Skip mailto: and tel: links
      if (originalUrl.startsWith('mailto:') || originalUrl.startsWith('tel:') || originalUrl.startsWith('#')) {
        continue;
      }

      links.push({
        full: match[0],
        originalUrl,
        attributes,
        linkText,
        position: position++
      });
    }

    // Replace links with tracked versions
    for (const link of links) {
      const tracked = await this.createTrackedLink(
        tenantId,
        emailId,
        recipientEmail,
        link.originalUrl,
        link.linkText.replace(/<[^>]*>/g, ''), // Strip HTML from link text
        link.position
      );

      const newLink = `<a href="${tracked.trackingUrl}"${link.attributes}>${link.linkText}</a>`;
      processedHtml = processedHtml.replace(link.full, newLink);
    }

    // Add tracking pixel before closing body tag
    const pixelToken = await this.createPixelTracking(tenantId, emailId, recipientEmail);
    const pixelUrl = `${process.env.API_URL}/track/open/${pixelToken}`;
    const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;

    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', `${pixelHtml}</body>`);
    } else {
      processedHtml += pixelHtml;
    }

    return {
      html: processedHtml,
      pixelToken,
      trackedLinks: links.length
    };
  }

  /**
   * Record email open
   */
  async recordOpen(token, ipAddress, userAgent) {
    // Parse user agent
    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const browser = parser.getBrowser();
    const os = parser.getOS();

    const deviceType = device.type || 'desktop';
    const browserName = browser.name || 'Unknown';
    const osName = os.name || 'Unknown';

    const result = await pool.query(
      `SELECT record_email_open($1, $2::inet, $3)`,
      [token, ipAddress, userAgent]
    );

    const openId = result.rows[0]?.record_email_open;
    if (!openId) {
      return null;
    }

    // Update with parsed device info
    await pool.query(
      `UPDATE email_opens
       SET device_type = $2, browser = $3, os = $4
       WHERE id = $1`,
      [openId, deviceType, browserName, osName]
    );

    return openId;
  }

  /**
   * Record link click and return original URL for redirect
   */
  async recordClick(token, ipAddress, userAgent) {
    // Parse user agent
    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const browser = parser.getBrowser();
    const os = parser.getOS();

    const deviceType = device.type || 'desktop';
    const browserName = browser.name || 'Unknown';
    const osName = os.name || 'Unknown';

    const result = await pool.query(
      `SELECT record_link_click($1, $2::inet, $3)`,
      [token, ipAddress, userAgent]
    );

    const originalUrl = result.rows[0]?.record_link_click;
    if (!originalUrl) {
      return null;
    }

    // Update latest click with device info
    await pool.query(
      `UPDATE email_link_clicks
       SET device_type = $2, browser = $3, os = $4
       WHERE id = (
         SELECT id FROM email_link_clicks
         WHERE tenant_id = (SELECT tenant_id FROM email_tracking_tokens WHERE token = $1)
         ORDER BY created_at DESC
         LIMIT 1
       )`,
      [token, deviceType, browserName, osName]
    );

    return originalUrl;
  }

  /**
   * Get tracking pixel image
   */
  getTrackingPixel() {
    return this.TRACKING_PIXEL;
  }

  /**
   * Get email engagement metrics
   */
  async getEmailMetrics(emailId, tenantId) {
    const result = await pool.query(
      `SELECT * FROM email_engagement_metrics
       WHERE email_id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get detailed open events for an email
   */
  async getEmailOpens(emailId, tenantId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await pool.query(
      `SELECT * FROM email_opens
       WHERE email_id = $1 AND tenant_id = $2
       ORDER BY opened_at DESC
       LIMIT $3 OFFSET $4`,
      [emailId, tenantId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get detailed click events for an email
   */
  async getEmailClicks(emailId, tenantId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await pool.query(
      `SELECT c.*, l.original_url, l.link_text
       FROM email_link_clicks c
       JOIN email_tracked_links l ON c.link_id = l.id
       WHERE c.email_id = $1 AND c.tenant_id = $2
       ORDER BY c.clicked_at DESC
       LIMIT $3 OFFSET $4`,
      [emailId, tenantId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get link performance for an email
   */
  async getEmailLinkPerformance(emailId, tenantId) {
    const result = await pool.query(
      `SELECT
         id,
         original_url,
         link_text,
         position_in_email,
         click_count,
         unique_click_count
       FROM email_tracked_links
       WHERE email_id = $1 AND tenant_id = $2
       ORDER BY click_count DESC`,
      [emailId, tenantId]
    );

    return result.rows;
  }

  /**
   * Get campaign engagement metrics
   */
  async getCampaignMetrics(campaignId, tenantId, options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT * FROM campaign_engagement_metrics
      WHERE campaign_id = $1 AND tenant_id = $2
    `;
    const params = [campaignId, tenantId];

    if (startDate) {
      query += ` AND date >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND date <= $${params.length + 1}`;
      params.push(endDate);
    }

    query += ` ORDER BY date DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get aggregate campaign metrics
   */
  async getCampaignSummary(campaignId, tenantId) {
    const result = await pool.query(
      `SELECT
         SUM(emails_sent) as total_sent,
         SUM(emails_delivered) as total_delivered,
         SUM(emails_bounced) as total_bounced,
         SUM(total_opens) as total_opens,
         SUM(unique_opens) as unique_opens,
         SUM(total_clicks) as total_clicks,
         SUM(unique_clicks) as unique_clicks,
         SUM(unsubscribes) as total_unsubscribes,
         SUM(spam_reports) as total_spam_reports,
         AVG(delivery_rate) as avg_delivery_rate,
         AVG(open_rate) as avg_open_rate,
         AVG(click_rate) as avg_click_rate,
         AVG(click_to_open_rate) as avg_click_to_open_rate
       FROM campaign_engagement_metrics
       WHERE campaign_id = $1 AND tenant_id = $2`,
      [campaignId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get engagement by device
   */
  async getDeviceBreakdown(emailId, tenantId) {
    const result = await pool.query(
      `SELECT
         device_type,
         COUNT(*) as count,
         COUNT(DISTINCT recipient_email) as unique_recipients
       FROM email_opens
       WHERE email_id = $1 AND tenant_id = $2
       GROUP BY device_type
       ORDER BY count DESC`,
      [emailId, tenantId]
    );

    return result.rows;
  }

  /**
   * Get engagement by hour of day
   */
  async getEngagementByHour(emailId, tenantId) {
    const result = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM opened_at) as hour,
         COUNT(*) as opens,
         COUNT(DISTINCT recipient_email) as unique_opens
       FROM email_opens
       WHERE email_id = $1 AND tenant_id = $2
       GROUP BY hour
       ORDER BY hour`,
      [emailId, tenantId]
    );

    return result.rows;
  }

  /**
   * Get top performing emails
   */
  async getTopPerformingEmails(tenantId, options = {}) {
    const { limit = 10, metric = 'open_rate', startDate, endDate } = options;

    let query = `
      SELECT
        e.id,
        e.subject,
        e.sent_at,
        m.total_sent,
        m.unique_opens,
        m.unique_clicks,
        m.open_rate,
        m.click_rate,
        m.click_to_open_rate
      FROM emails e
      JOIN email_engagement_metrics m ON e.id = m.email_id
      WHERE e.tenant_id = $1
        AND m.total_sent > 0
    `;
    const params = [tenantId];

    if (startDate) {
      query += ` AND e.sent_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND e.sent_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    const validMetrics = ['open_rate', 'click_rate', 'click_to_open_rate', 'unique_opens', 'unique_clicks'];
    const orderBy = validMetrics.includes(metric) ? metric : 'open_rate';

    query += ` ORDER BY ${orderBy} DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update email sent count
   */
  async recordEmailSent(emailId, tenantId) {
    await pool.query(
      `INSERT INTO email_engagement_metrics (tenant_id, email_id, total_sent)
       VALUES ($1, $2, 1)
       ON CONFLICT (email_id) DO UPDATE
       SET total_sent = email_engagement_metrics.total_sent + 1,
           updated_at = NOW()`,
      [tenantId, emailId]
    );
  }

  /**
   * Update delivery status
   */
  async recordEmailDelivered(emailId, tenantId) {
    await pool.query(
      `UPDATE email_engagement_metrics
       SET total_delivered = total_delivered + 1,
           updated_at = NOW()
       WHERE email_id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    await pool.query(`SELECT update_email_engagement_rates($1)`, [emailId]);
  }

  /**
   * Record bounce
   */
  async recordEmailBounced(emailId, tenantId) {
    await pool.query(
      `UPDATE email_engagement_metrics
       SET total_bounced = total_bounced + 1,
           updated_at = NOW()
       WHERE email_id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    await pool.query(`SELECT update_email_engagement_rates($1)`, [emailId]);
  }

  /**
   * Record unsubscribe
   */
  async recordUnsubscribe(emailId, tenantId) {
    await pool.query(
      `UPDATE email_engagement_metrics
       SET total_unsubscribes = total_unsubscribes + 1,
           updated_at = NOW()
       WHERE email_id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    await pool.query(`SELECT update_email_engagement_rates($1)`, [emailId]);
  }

  /**
   * Record spam report
   */
  async recordSpamReport(emailId, tenantId) {
    await pool.query(
      `UPDATE email_engagement_metrics
       SET total_spam_reports = total_spam_reports + 1,
           updated_at = NOW()
       WHERE email_id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );

    await pool.query(`SELECT update_email_engagement_rates($1)`, [emailId]);
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens() {
    const result = await pool.query(
      `DELETE FROM email_tracking_tokens WHERE expires_at < NOW() RETURNING id`
    );
    return result.rowCount;
  }
}

module.exports = new EmailTrackingService();
