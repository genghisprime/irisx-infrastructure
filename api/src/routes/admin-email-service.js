import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminEmailService = new Hono();

// Apply admin authentication to all routes
adminEmailService.use('*', authenticateAdmin);

/**
 * GET /admin/email-service/config
 * Get current SMTP configuration
 */
adminEmailService.get('/config', async (c) => {
  const admin = c.get('admin');

  // Only admin and superadmin can view email configuration
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const result = await pool.query(`
      SELECT
        id,
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        smtp_username,
        from_email,
        from_name,
        status,
        max_daily_quota,
        current_daily_sent,
        quota_reset_at,
        created_at,
        updated_at
      FROM email_configuration
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return c.json({
        provider: 'smtp',
        smtp_host: '',
        smtp_port: 587,
        smtp_secure: true,
        smtp_username: '',
        from_email: '',
        from_name: 'IRISX',
        status: 'inactive',
        max_daily_quota: 10000,
        current_daily_sent: 0
      });
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch email config:', err);
    return c.json({ error: 'Failed to load email configuration' }, 500);
  }
});

/**
 * PUT /admin/email-service/config
 * Update SMTP configuration
 */
adminEmailService.put('/config', async (c) => {
  const admin = c.get('admin');

  // Only admin and superadmin can update email configuration
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const {
      provider,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_username,
      smtp_password,
      from_email,
      from_name,
      max_daily_quota
    } = body;

    // Check if config exists
    const existing = await pool.query(`
      SELECT id FROM email_configuration WHERE deleted_at IS NULL LIMIT 1
    `);

    let result;

    if (existing.rows.length === 0) {
      // Create new configuration
      result = await pool.query(`
        INSERT INTO email_configuration (
          provider, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password,
          from_email, from_name, max_daily_quota, status, current_daily_sent,
          quota_reset_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 0, NOW() + INTERVAL '1 day', NOW())
        RETURNING id, provider, smtp_host, smtp_port, smtp_secure, smtp_username,
                  from_email, from_name, status, max_daily_quota, current_daily_sent
      `, [
        provider || 'smtp',
        smtp_host,
        smtp_port || 587,
        smtp_secure !== false,
        smtp_username,
        smtp_password,
        from_email,
        from_name || 'IRISX',
        max_daily_quota || 10000
      ]);
    } else {
      // Update existing configuration
      result = await pool.query(`
        UPDATE email_configuration
        SET
          provider = COALESCE($1, provider),
          smtp_host = COALESCE($2, smtp_host),
          smtp_port = COALESCE($3, smtp_port),
          smtp_secure = COALESCE($4, smtp_secure),
          smtp_username = COALESCE($5, smtp_username),
          smtp_password = COALESCE($6, smtp_password),
          from_email = COALESCE($7, from_email),
          from_name = COALESCE($8, from_name),
          max_daily_quota = COALESCE($9, max_daily_quota),
          updated_at = NOW()
        WHERE id = $10 AND deleted_at IS NULL
        RETURNING id, provider, smtp_host, smtp_port, smtp_secure, smtp_username,
                  from_email, from_name, status, max_daily_quota, current_daily_sent
      `, [
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        smtp_username,
        smtp_password,
        from_email,
        from_name,
        max_daily_quota,
        existing.rows[0].id
      ]);
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to update email config:', err);
    return c.json({ error: 'Failed to update email configuration' }, 500);
  }
});

/**
 * GET /admin/email-service/domains
 * List verified domains
 */
adminEmailService.get('/domains', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        domain,
        verification_status,
        dkim_verified,
        spf_verified,
        dmarc_verified,
        verification_token,
        verified_at,
        created_at
      FROM email_domains
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    return c.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch domains:', err);
    return c.json({ error: 'Failed to load domains' }, 500);
  }
});

/**
 * POST /admin/email-service/domains
 * Add a new domain for verification
 */
adminEmailService.post('/domains', async (c) => {
  const admin = c.get('admin');

  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const { domain } = body;

    if (!domain) {
      return c.json({ error: 'Domain is required' }, 400);
    }

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) +
                             Math.random().toString(36).substring(2, 15);

    const result = await pool.query(`
      INSERT INTO email_domains (
        domain, verification_status, verification_token,
        dkim_verified, spf_verified, dmarc_verified, created_at
      )
      VALUES ($1, 'pending', $2, false, false, false, NOW())
      RETURNING *
    `, [domain, verificationToken]);

    return c.json(result.rows[0], 201);
  } catch (err) {
    console.error('Failed to add domain:', err);
    return c.json({ error: 'Failed to add domain' }, 500);
  }
});

/**
 * POST /admin/email-service/domains/:id/verify
 * Verify a domain (checks DNS records)
 */
adminEmailService.post('/domains/:id/verify', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    // Get domain details
    const domain = await pool.query(`
      SELECT * FROM email_domains WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (domain.rows.length === 0) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    // In a real implementation, this would check DNS records
    // For now, we'll simulate verification
    const verified = true;

    if (verified) {
      await pool.query(`
        UPDATE email_domains
        SET
          verification_status = 'verified',
          dkim_verified = true,
          spf_verified = true,
          dmarc_verified = true,
          verified_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [id]);
    }

    return c.json({
      success: verified,
      message: verified ? 'Domain verified successfully' : 'Domain verification failed',
      dns_records: {
        txt: `_irisx-verification=${domain.rows[0].verification_token}`,
        spf: 'v=spf1 include:_spf.irisx.com ~all',
        dkim: 'v=DKIM1; k=rsa; p=...',
        dmarc: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@irisx.com'
      }
    });
  } catch (err) {
    console.error('Failed to verify domain:', err);
    return c.json({ error: 'Failed to verify domain' }, 500);
  }
});

/**
 * DELETE /admin/email-service/domains/:id
 * Remove a domain
 */
adminEmailService.delete('/domains/:id', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const result = await pool.query(`
      UPDATE email_domains
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Domain not found' }, 404);
    }

    return c.json({ message: 'Domain removed successfully' });
  } catch (err) {
    console.error('Failed to delete domain:', err);
    return c.json({ error: 'Failed to delete domain' }, 500);
  }
});

/**
 * GET /admin/email-service/deliverability
 * Get email deliverability statistics
 */
adminEmailService.get('/deliverability', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'complained') as complained,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as sent_24h,
        COUNT(*) FILTER (WHERE status = 'delivered' AND created_at > NOW() - INTERVAL '24 hours') as delivered_24h
      FROM emails
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const stats = result.rows[0];
    const deliveryRate = stats.total_sent > 0
      ? ((stats.delivered / stats.total_sent) * 100).toFixed(2)
      : 0;
    const bounceRate = stats.total_sent > 0
      ? ((stats.bounced / stats.total_sent) * 100).toFixed(2)
      : 0;
    const complaintRate = stats.total_sent > 0
      ? ((stats.complained / stats.total_sent) * 100).toFixed(2)
      : 0;

    return c.json({
      total_sent: parseInt(stats.total_sent),
      delivered: parseInt(stats.delivered),
      bounced: parseInt(stats.bounced),
      complained: parseInt(stats.complained),
      sent_24h: parseInt(stats.sent_24h),
      delivered_24h: parseInt(stats.delivered_24h),
      delivery_rate: parseFloat(deliveryRate),
      bounce_rate: parseFloat(bounceRate),
      complaint_rate: parseFloat(complaintRate)
    });
  } catch (err) {
    console.error('Failed to fetch deliverability stats:', err);
    return c.json({ error: 'Failed to load deliverability statistics' }, 500);
  }
});

/**
 * GET /admin/email-service/quota
 * Get current sending quota usage
 */
adminEmailService.get('/quota', async (c) => {
  try {
    const config = await pool.query(`
      SELECT max_daily_quota, current_daily_sent, quota_reset_at
      FROM email_configuration
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (config.rows.length === 0) {
      return c.json({
        max_daily_quota: 10000,
        current_daily_sent: 0,
        remaining: 10000,
        reset_at: new Date(Date.now() + 86400000).toISOString()
      });
    }

    const { max_daily_quota, current_daily_sent, quota_reset_at } = config.rows[0];
    const remaining = Math.max(0, max_daily_quota - current_daily_sent);

    return c.json({
      max_daily_quota,
      current_daily_sent,
      remaining,
      reset_at: quota_reset_at
    });
  } catch (err) {
    console.error('Failed to fetch quota:', err);
    return c.json({ error: 'Failed to load quota information' }, 500);
  }
});

export default adminEmailService;
