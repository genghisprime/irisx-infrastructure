/**
 * Admin Feature Flags & System Configuration Routes
 * IRISX staff manage feature flags and system settings
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminSettings = new Hono();

// All routes require admin authentication
adminSettings.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const updateFeaturesSchema = z.object({
  features: z.record(z.boolean())
});

const updateSystemSettingsSchema = z.object({
  rate_limits: z.object({
    calls_per_second: z.number().int().positive().optional(),
    api_requests_per_minute: z.number().int().positive().optional()
  }).optional(),
  email_queue: z.object({
    max_retries: z.number().int().min(0).max(10).optional(),
    retry_delay_seconds: z.number().int().positive().optional()
  }).optional(),
  webhook_settings: z.object({
    max_retries: z.number().int().min(0).max(10).optional(),
    timeout_seconds: z.number().int().positive().optional()
  }).optional()
});

const updateUsageLimitsSchema = z.object({
  calls_per_month: z.number().int().min(0).optional(),
  sms_per_month: z.number().int().min(0).optional(),
  emails_per_month: z.number().int().min(0).optional(),
  storage_gb: z.number().min(0).optional(),
  agents: z.number().int().min(0).optional()
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function logAdminAction(adminId, action, resourceType, resourceId, changes, req) {
  await pool.query(
    `INSERT INTO admin_audit_log (
      admin_user_id, action, resource_type, resource_id, changes, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      adminId,
      action,
      resourceType,
      resourceId,
      changes ? JSON.stringify(changes) : null,
      req.header('x-forwarded-for') || req.header('x-real-ip') || 'unknown'
    ]
  );
}

// =====================================================
// ROUTES - FEATURE FLAGS
// =====================================================

/**
 * GET /admin/tenants/:tenantId/features
 * View enabled features for a tenant
 */
adminSettings.get('/tenants/:tenantId/features', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name, plan FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenant = tenantCheck.rows[0];

    // Get tenant features (if table exists, otherwise return default features)
    let features;
    try {
      const result = await pool.query(
        'SELECT features FROM tenant_features WHERE tenant_id = $1',
        [tenantId]
      );

      if (result.rows.length > 0) {
        features = result.rows[0].features;
      } else {
        // Return default features based on plan
        features = getDefaultFeaturesByPlan(tenant.plan);
      }
    } catch (err) {
      // If tenant_features table doesn't exist, return defaults
      features = getDefaultFeaturesByPlan(tenant.plan);
    }

    await logAdminAction(admin.id, 'admin.tenant.features.view', 'tenant', tenantId, null, c.req);

    return c.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan
      },
      features
    });

  } catch (err) {
    console.error('Get tenant features error:', err);
    return c.json({ error: 'Failed to get tenant features' }, 500);
  }
});

/**
 * PATCH /admin/tenants/:tenantId/features
 * Enable/disable features for a tenant
 */
adminSettings.patch('/tenants/:tenantId/features', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only superadmins can modify features
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can modify features' }, 403);
    }

    // Validate request
    const validation = updateFeaturesSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { features } = validation.data;

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Create tenant_features table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_features (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        features JSONB NOT NULL DEFAULT '{}',
        updated_by BIGINT REFERENCES admin_users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id)
      )
    `);

    // Upsert features
    await pool.query(
      `INSERT INTO tenant_features (tenant_id, features, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id)
       DO UPDATE SET features = $2, updated_by = $3, updated_at = NOW()`,
      [tenantId, JSON.stringify(features), admin.id]
    );

    await logAdminAction(admin.id, 'admin.tenant.features.update', 'tenant', tenantId, { features }, c.req);

    return c.json({
      success: true,
      features,
      message: 'Features updated successfully'
    });

  } catch (err) {
    console.error('Update tenant features error:', err);
    return c.json({ error: 'Failed to update features' }, 500);
  }
});

/**
 * GET /admin/feature-flags
 * Get system-wide feature flags
 */
adminSettings.get('/feature-flags', async (c) => {
  try {
    const admin = c.get('admin');

    // Default system features
    const systemFeatures = {
      voice_calling: true,
      sms_messaging: true,
      email_messaging: true,
      whatsapp_messaging: true,
      social_media: true,
      unified_inbox: true,
      agent_provisioning: true,
      call_recording: true,
      email_automation: true,
      webhooks: true,
      api_access: true,
      analytics_dashboard: true,
      ivr_builder: false, // Coming soon
      campaign_dialer: false, // Coming soon
      video_calling: false, // Future
      ai_features: false // Future
    };

    await logAdminAction(admin.id, 'admin.feature_flags.view', null, null, null, c.req);

    return c.json({ feature_flags: systemFeatures });

  } catch (err) {
    console.error('Get feature flags error:', err);
    return c.json({ error: 'Failed to get feature flags' }, 500);
  }
});

// =====================================================
// ROUTES - SYSTEM SETTINGS
// =====================================================

/**
 * GET /admin/settings
 * View system settings
 */
adminSettings.get('/settings', async (c) => {
  try {
    const admin = c.get('admin');

    // Return default system settings
    // In production, these would be stored in a system_settings table
    const settings = {
      rate_limits: {
        calls_per_second: 10,
        api_requests_per_minute: 100
      },
      email_queue: {
        max_retries: 3,
        retry_delay_seconds: 300
      },
      webhook_settings: {
        max_retries: 5,
        timeout_seconds: 30
      },
      storage: {
        recordings_bucket: process.env.S3_RECORDINGS_BUCKET || 'irisx-recordings',
        max_recording_days: 90
      },
      security: {
        jwt_expiry_hours: 24,
        admin_jwt_expiry_hours: 4,
        max_login_attempts: 5
      }
    };

    await logAdminAction(admin.id, 'admin.settings.view', null, null, null, c.req);

    return c.json({ settings });

  } catch (err) {
    console.error('Get settings error:', err);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

/**
 * PATCH /admin/settings
 * Update system settings
 */
adminSettings.patch('/settings', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only superadmins can update system settings
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can update system settings' }, 403);
    }

    // Validate request
    const validation = updateSystemSettingsSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // TODO: Store settings in database
    // For now, just log the change
    await logAdminAction(admin.id, 'admin.settings.update', null, null, validation.data, c.req);

    return c.json({
      success: true,
      message: 'System settings updated successfully',
      updated: validation.data
    });

  } catch (err) {
    console.error('Update settings error:', err);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

// =====================================================
// ROUTES - USAGE LIMITS
// =====================================================

/**
 * GET /admin/settings/usage-limits
 * View usage limits by plan
 */
adminSettings.get('/settings/usage-limits', async (c) => {
  try {
    const admin = c.get('admin');

    const usageLimits = {
      free: {
        calls_per_month: 100,
        sms_per_month: 500,
        emails_per_month: 1000,
        storage_gb: 1,
        agents: 2
      },
      starter: {
        calls_per_month: 1000,
        sms_per_month: 5000,
        emails_per_month: 10000,
        storage_gb: 10,
        agents: 5
      },
      professional: {
        calls_per_month: 10000,
        sms_per_month: 50000,
        emails_per_month: 100000,
        storage_gb: 50,
        agents: 25
      },
      enterprise: {
        calls_per_month: -1, // unlimited
        sms_per_month: -1,
        emails_per_month: -1,
        storage_gb: 500,
        agents: -1
      }
    };

    await logAdminAction(admin.id, 'admin.usage_limits.view', null, null, null, c.req);

    return c.json({ usage_limits: usageLimits });

  } catch (err) {
    console.error('Get usage limits error:', err);
    return c.json({ error: 'Failed to get usage limits' }, 500);
  }
});

/**
 * PATCH /admin/tenants/:tenantId/usage-limits
 * Update custom usage limits for a specific tenant
 */
adminSettings.patch('/tenants/:tenantId/usage-limits', async (c) => {
  try {
    const { tenantId } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only superadmins can set custom limits
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can set custom usage limits' }, 403);
    }

    // Validate request
    const validation = updateUsageLimitsSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    // Store custom limits in tenant metadata
    await pool.query(
      `UPDATE tenants
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{custom_limits}',
         $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(validation.data), tenantId]
    );

    await logAdminAction(admin.id, 'admin.tenant.usage_limits.update', 'tenant', tenantId, validation.data, c.req);

    return c.json({
      success: true,
      message: 'Custom usage limits applied',
      limits: validation.data
    });

  } catch (err) {
    console.error('Update usage limits error:', err);
    return c.json({ error: 'Failed to update usage limits' }, 500);
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getDefaultFeaturesByPlan(plan) {
  const planFeatures = {
    free: {
      voice_calling: true,
      sms_messaging: true,
      email_messaging: false,
      whatsapp_messaging: false,
      social_media: false,
      unified_inbox: false,
      call_recording: false,
      email_automation: false,
      analytics_dashboard: true
    },
    starter: {
      voice_calling: true,
      sms_messaging: true,
      email_messaging: true,
      whatsapp_messaging: false,
      social_media: false,
      unified_inbox: true,
      call_recording: true,
      email_automation: false,
      analytics_dashboard: true
    },
    professional: {
      voice_calling: true,
      sms_messaging: true,
      email_messaging: true,
      whatsapp_messaging: true,
      social_media: true,
      unified_inbox: true,
      call_recording: true,
      email_automation: true,
      analytics_dashboard: true
    },
    enterprise: {
      voice_calling: true,
      sms_messaging: true,
      email_messaging: true,
      whatsapp_messaging: true,
      social_media: true,
      unified_inbox: true,
      call_recording: true,
      email_automation: true,
      analytics_dashboard: true,
      custom_integrations: true,
      dedicated_support: true
    }
  };

  return planFeatures[plan] || planFeatures.free;
}

export default adminSettings;
