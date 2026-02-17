/**
 * Tenant Settings API Routes
 * Self-service tenant configuration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db.js';

const tenantSettings = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const profileSchema = z.object({
  company_name: z.string().min(1).max(255),
  industry: z.string().max(100).optional(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().max(20).optional().nullable(),
  website: z.string().url().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  timezone: z.string().max(50).optional(),
});

const brandingSchema = z.object({
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().max(20).optional(),
  secondary_color: z.string().max(20).optional(),
  accent_color: z.string().max(20).optional(),
  custom_domain: z.string().max(255).optional().nullable(),
});

const notificationsSchema = z.object({
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  billing_alerts: z.boolean().optional(),
  usage_warnings: z.boolean().optional(),
  security_alerts: z.boolean().optional(),
  weekly_reports: z.boolean().optional(),
});

const securitySchema = z.object({
  min_password_length: z.number().min(6).max(32).optional(),
  require_special_chars: z.boolean().optional(),
  require_numbers: z.boolean().optional(),
  require_2fa: z.boolean().optional(),
  session_timeout: z.number().min(5).max(1440).optional(),
  allow_multiple_sessions: z.boolean().optional(),
  ip_whitelist_enabled: z.boolean().optional(),
  ip_whitelist: z.string().optional().nullable(),
});

// =============================================================================
// Middleware
// =============================================================================

tenantSettings.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// =============================================================================
// GET ALL SETTINGS
// =============================================================================

/**
 * GET /v1/tenant/settings
 * Get all tenant settings
 */
tenantSettings.get('/', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    // Get tenant basic info
    const tenantResult = await pool.query(
      `SELECT
        id, name, slug, industry, contact_email, contact_phone,
        website, address, city, state, country, timezone,
        logo_url, primary_color, secondary_color, accent_color, custom_domain,
        settings, created_at
       FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (!tenantResult.rows[0]) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantResult.rows[0];
    const settings = tenant.settings || {};

    return c.json({
      success: true,
      profile: {
        company_name: tenant.name,
        industry: tenant.industry,
        contact_email: tenant.contact_email,
        contact_phone: tenant.contact_phone,
        website: tenant.website,
        address: tenant.address,
        city: tenant.city,
        state: tenant.state,
        country: tenant.country,
        timezone: tenant.timezone || 'UTC',
      },
      branding: {
        logo_url: tenant.logo_url,
        primary_color: tenant.primary_color || '#3B82F6',
        secondary_color: tenant.secondary_color || '#10B981',
        accent_color: tenant.accent_color || '#F59E0B',
        custom_domain: tenant.custom_domain,
      },
      notifications: settings.notifications || {
        email_enabled: true,
        sms_enabled: false,
        billing_alerts: true,
        usage_warnings: true,
        security_alerts: true,
        weekly_reports: false,
      },
      security: settings.security || {
        min_password_length: 8,
        require_special_chars: true,
        require_numbers: true,
        require_2fa: false,
        session_timeout: 60,
        allow_multiple_sessions: true,
        ip_whitelist_enabled: false,
        ip_whitelist: '',
      },
    });
  } catch (error) {
    console.error('Get tenant settings error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// UPDATE PROFILE
// =============================================================================

/**
 * PUT /v1/tenant/settings/profile
 * Update company profile
 */
tenantSettings.put('/profile', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = profileSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const data = validation.data;

    const result = await pool.query(
      `UPDATE tenants SET
        name = COALESCE($2, name),
        industry = $3,
        contact_email = $4,
        contact_phone = $5,
        website = $6,
        address = $7,
        city = $8,
        state = $9,
        country = $10,
        timezone = COALESCE($11, timezone),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        tenantId,
        data.company_name,
        data.industry,
        data.contact_email,
        data.contact_phone,
        data.website,
        data.address,
        data.city,
        data.state,
        data.country,
        data.timezone,
      ]
    );

    return c.json({
      success: true,
      profile: {
        company_name: result.rows[0].name,
        industry: result.rows[0].industry,
        contact_email: result.rows[0].contact_email,
        contact_phone: result.rows[0].contact_phone,
        website: result.rows[0].website,
        address: result.rows[0].address,
        city: result.rows[0].city,
        state: result.rows[0].state,
        country: result.rows[0].country,
        timezone: result.rows[0].timezone,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// UPDATE BRANDING
// =============================================================================

/**
 * PUT /v1/tenant/settings/branding
 * Update branding settings
 */
tenantSettings.put('/branding', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = brandingSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const data = validation.data;

    const result = await pool.query(
      `UPDATE tenants SET
        logo_url = COALESCE($2, logo_url),
        primary_color = COALESCE($3, primary_color),
        secondary_color = COALESCE($4, secondary_color),
        accent_color = COALESCE($5, accent_color),
        custom_domain = $6,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        tenantId,
        data.logo_url,
        data.primary_color,
        data.secondary_color,
        data.accent_color,
        data.custom_domain,
      ]
    );

    return c.json({
      success: true,
      branding: {
        logo_url: result.rows[0].logo_url,
        primary_color: result.rows[0].primary_color,
        secondary_color: result.rows[0].secondary_color,
        accent_color: result.rows[0].accent_color,
        custom_domain: result.rows[0].custom_domain,
      },
    });
  } catch (error) {
    console.error('Update branding error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// UPDATE NOTIFICATIONS
// =============================================================================

/**
 * PUT /v1/tenant/settings/notifications
 * Update notification preferences
 */
tenantSettings.put('/notifications', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = notificationsSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    // Get current settings
    const current = await pool.query(
      `SELECT settings FROM tenants WHERE id = $1`,
      [tenantId]
    );

    const settings = current.rows[0]?.settings || {};
    settings.notifications = { ...settings.notifications, ...validation.data };

    await pool.query(
      `UPDATE tenants SET settings = $2, updated_at = NOW() WHERE id = $1`,
      [tenantId, JSON.stringify(settings)]
    );

    return c.json({
      success: true,
      notifications: settings.notifications,
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// UPDATE SECURITY
// =============================================================================

/**
 * PUT /v1/tenant/settings/security
 * Update security settings
 */
tenantSettings.put('/security', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = securitySchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    // Validate IP whitelist format if provided
    if (validation.data.ip_whitelist) {
      const ips = validation.data.ip_whitelist.split('\n').map(ip => ip.trim()).filter(Boolean);
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
      const invalidIps = ips.filter(ip => !ipRegex.test(ip));
      if (invalidIps.length > 0) {
        return c.json({ error: `Invalid IP format: ${invalidIps.join(', ')}` }, 400);
      }
    }

    // Get current settings
    const current = await pool.query(
      `SELECT settings FROM tenants WHERE id = $1`,
      [tenantId]
    );

    const settings = current.rows[0]?.settings || {};
    settings.security = { ...settings.security, ...validation.data };

    await pool.query(
      `UPDATE tenants SET settings = $2, updated_at = NOW() WHERE id = $1`,
      [tenantId, JSON.stringify(settings)]
    );

    return c.json({
      success: true,
      security: settings.security,
    });
  } catch (error) {
    console.error('Update security error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// LOGO UPLOAD
// =============================================================================

/**
 * POST /v1/tenant/settings/logo
 * Upload company logo
 */
tenantSettings.post('/logo', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    // Parse multipart form data
    const body = await c.req.parseBody();
    const logoFile = body['logo'];

    if (!logoFile || typeof logoFile === 'string') {
      return c.json({ error: 'No logo file provided' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'];
    if (!allowedTypes.includes(logoFile.type)) {
      return c.json({ error: 'Invalid file type. Allowed: PNG, JPG, SVG, GIF' }, 400);
    }

    // Validate file size (2MB max)
    if (logoFile.size > 2 * 1024 * 1024) {
      return c.json({ error: 'File too large. Max 2MB' }, 400);
    }

    // In production, upload to S3/CloudFront
    // For now, generate a placeholder URL
    const logoUrl = `/uploads/logos/${tenantId}-${Date.now()}.${logoFile.type.split('/')[1]}`;

    // Update tenant with new logo URL
    await pool.query(
      `UPDATE tenants SET logo_url = $2, updated_at = NOW() WHERE id = $1`,
      [tenantId, logoUrl]
    );

    return c.json({
      success: true,
      url: logoUrl,
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// INTEGRATIONS
// =============================================================================

/**
 * GET /v1/tenant/settings/integrations
 * Get connected integrations
 */
tenantSettings.get('/integrations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    // Get integration connections for this tenant
    const result = await pool.query(
      `SELECT
        id, provider, status, connected_at, metadata
       FROM tenant_integrations
       WHERE tenant_id = $1
       ORDER BY provider`,
      [tenantId]
    );

    return c.json({
      success: true,
      integrations: result.rows,
    });
  } catch (error) {
    console.error('Get integrations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/tenant/settings/integrations/:provider
 * Disconnect an integration
 */
tenantSettings.delete('/integrations/:provider', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const provider = c.req.param('provider');

    await pool.query(
      `UPDATE tenant_integrations
       SET status = 'disconnected', disconnected_at = NOW()
       WHERE tenant_id = $1 AND provider = $2`,
      [tenantId, provider]
    );

    return c.json({ success: true });
  } catch (error) {
    console.error('Disconnect integration error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default tenantSettings;
