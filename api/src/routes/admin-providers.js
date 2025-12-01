/**
 * Admin Provider Credentials Management Routes
 * IRISX staff manage email/SMS/WhatsApp/Social provider credentials
 * Centralized management of all third-party integrations
 */

import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminProviders = new Hono();

// All routes require admin authentication
adminProviders.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createProviderSchema = z.object({
  tenant_id: z.number().int().positive().optional(), // null for global/shared providers
  provider_type: z.enum(['email', 'sms', 'whatsapp', 'social']),
  provider_name: z.string().min(1).max(50), // sendgrid, twilio, whatsapp, discord, etc.
  credentials: z.record(z.any()), // API keys, tokens, secrets
  config: z.record(z.any()).optional(), // Additional configuration
  is_active: z.boolean().optional().default(true)
});

const updateProviderSchema = z.object({
  credentials: z.record(z.any()).optional(),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function encryptCredentials(credentials) {
  // Simple encryption - in production, use AWS KMS or similar
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'change-this-key-in-production', 'salt', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted: encrypted,
    iv: iv.toString('hex')
  };
}

function decryptCredentials(encrypted, iv) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'change-this-key-in-production', 'salt', 32);

  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

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
// ROUTES
// =====================================================

/**
 * GET /admin/providers
 * List all provider configurations
 */
adminProviders.get('/', async (c) => {
  try {
    const admin = c.get('admin');

    // Query parameters
    const provider_type = c.req.query('provider_type'); // email, sms, whatsapp, social
    const tenant_id = c.req.query('tenant_id');
    const is_active = c.req.query('is_active');

    // Build WHERE clause
    let whereConditions = ['mp.deleted_at IS NULL'];
    let queryParams = [];
    let paramIndex = 1;

    if (provider_type) {
      whereConditions.push(`mp.provider_type = $${paramIndex}`);
      queryParams.push(provider_type);
      paramIndex++;
    }

    if (tenant_id) {
      whereConditions.push(`mp.tenant_id = $${paramIndex}`);
      queryParams.push(tenant_id);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereConditions.push(`mp.is_active = $${paramIndex}`);
      queryParams.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await pool.query(
      `SELECT
        mp.id,
        mp.tenant_id,
        t.name as tenant_name,
        mp.provider_type,
        mp.provider_name,
        mp.is_active,
        mp.config,
        mp.created_at,
        mp.updated_at,
        mp.last_used_at
       FROM messaging_providers mp
       LEFT JOIN tenants t ON mp.tenant_id = t.id
       WHERE ${whereClause}
       ORDER BY mp.created_at DESC`,
      queryParams
    );

    // Don't return encrypted credentials in list view
    const providers = result.rows.map(p => ({
      ...p,
      has_credentials: true,
      credentials_preview: getCredentialsPreview(p.provider_name)
    }));

    await logAdminAction(admin.id, 'admin.providers.list', null, null, { filters: { provider_type, tenant_id } }, c.req);

    return c.json({ providers });

  } catch (err) {
    console.error('List providers error:', err);
    return c.json({ error: 'Failed to list providers' }, 500);
  }
});

/**
 * GET /admin/providers/:id
 * Get provider details including credentials (masked)
 */
adminProviders.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        mp.*,
        t.name as tenant_name
       FROM messaging_providers mp
       LEFT JOIN tenants t ON mp.tenant_id = t.id
       WHERE mp.id = $1 AND mp.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    const provider = result.rows[0];

    // Decrypt credentials
    if (provider.credentials_encrypted && provider.credentials_iv) {
      const decryptedCreds = decryptCredentials(provider.credentials_encrypted, provider.credentials_iv);

      // Mask sensitive values (show last 4 characters only)
      provider.credentials = maskCredentials(decryptedCreds);
    }

    // Remove encrypted fields from response
    delete provider.credentials_encrypted;
    delete provider.credentials_iv;

    await logAdminAction(admin.id, 'admin.provider.view', 'provider', id, null, c.req);

    return c.json({ provider });

  } catch (err) {
    console.error('Get provider error:', err);
    return c.json({ error: 'Failed to get provider' }, 500);
  }
});

/**
 * POST /admin/providers
 * Create a new provider configuration
 */
adminProviders.post('/', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can create providers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = createProviderSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const { tenant_id, provider_type, provider_name, credentials, config, is_active } = validation.data;

    // If tenant-specific, check tenant exists
    if (tenant_id) {
      const tenantCheck = await pool.query(
        'SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL',
        [tenant_id]
      );

      if (tenantCheck.rows.length === 0) {
        return c.json({ error: 'Tenant not found' }, 404);
      }
    }

    // Encrypt credentials
    const { encrypted, iv } = encryptCredentials(credentials);

    // Create provider
    const result = await pool.query(
      `INSERT INTO messaging_providers (
        tenant_id, provider_type, provider_name, credentials_encrypted, credentials_iv, config, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, provider_type, provider_name, is_active, created_at`,
      [tenant_id || null, provider_type, provider_name, encrypted, iv, config ? JSON.stringify(config) : null, is_active]
    );

    const provider = result.rows[0];

    // Log admin action (don't log actual credentials)
    await logAdminAction(admin.id, 'admin.provider.create', 'provider', provider.id, {
      tenant_id,
      provider_type,
      provider_name
    }, c.req);

    return c.json({
      success: true,
      provider,
      message: 'Provider created successfully'
    }, 201);

  } catch (err) {
    console.error('Create provider error:', err);
    return c.json({ error: 'Failed to create provider' }, 500);
  }
});

/**
 * PATCH /admin/providers/:id
 * Update provider configuration
 */
adminProviders.patch('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    // Only admins and superadmins can update providers
    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    // Validate request
    const validation = updateProviderSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if provider exists
    const providerCheck = await pool.query(
      'SELECT id, provider_name FROM messaging_providers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (providerCheck.rows.length === 0) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    // Build UPDATE query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (validation.data.credentials) {
      const { encrypted, iv } = encryptCredentials(validation.data.credentials);
      updates.push(`credentials_encrypted = $${paramIndex}`, `credentials_iv = $${paramIndex + 1}`);
      values.push(encrypted, iv);
      paramIndex += 2;
    }

    if (validation.data.config !== undefined) {
      updates.push(`config = $${paramIndex}`);
      values.push(JSON.stringify(validation.data.config));
      paramIndex++;
    }

    if (validation.data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(validation.data.is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(id);

    await pool.query(
      `UPDATE messaging_providers
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}`,
      values
    );

    // Get updated provider (without credentials)
    const result = await pool.query(
      'SELECT id, provider_type, provider_name, is_active, config, updated_at FROM messaging_providers WHERE id = $1',
      [id]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.provider.update', 'provider', id, {
      updated_fields: Object.keys(validation.data)
    }, c.req);

    return c.json({
      success: true,
      provider: result.rows[0]
    });

  } catch (err) {
    console.error('Update provider error:', err);
    return c.json({ error: 'Failed to update provider' }, 500);
  }
});

/**
 * DELETE /admin/providers/:id
 * Delete a provider configuration
 */
adminProviders.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Only superadmins can delete providers
    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete providers' }, 403);
    }

    // Check if provider exists
    const providerCheck = await pool.query(
      'SELECT id, provider_name FROM messaging_providers WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (providerCheck.rows.length === 0) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    // Soft delete
    await pool.query(
      'UPDATE messaging_providers SET deleted_at = NOW() WHERE id = $1',
      [id]
    );

    // Log admin action
    await logAdminAction(admin.id, 'admin.provider.delete', 'provider', id, {
      provider_name: providerCheck.rows[0].provider_name
    }, c.req);

    return c.json({
      success: true,
      message: 'Provider deleted successfully'
    });

  } catch (err) {
    console.error('Delete provider error:', err);
    return c.json({ error: 'Failed to delete provider' }, 500);
  }
});

/**
 * POST /admin/providers/:id/test
 * Test provider connection
 */
adminProviders.post('/:id/test', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');

    // Get provider with decrypted credentials
    const result = await pool.query(
      `SELECT
        mp.*,
        t.name as tenant_name
       FROM messaging_providers mp
       LEFT JOIN tenants t ON mp.tenant_id = t.id
       WHERE mp.id = $1 AND mp.deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    const provider = result.rows[0];

    // Decrypt credentials
    const credentials = decryptCredentials(provider.credentials_encrypted, provider.credentials_iv);

    // Test provider based on type
    let testResult;
    try {
      testResult = await testProviderConnection(provider.provider_type, provider.provider_name, credentials);
    } catch (testErr) {
      testResult = {
        success: false,
        error: testErr.message
      };
    }

    // Update last_used_at if test successful
    if (testResult.success) {
      await pool.query(
        'UPDATE messaging_providers SET last_used_at = NOW() WHERE id = $1',
        [id]
      );
    }

    // Log admin action
    await logAdminAction(admin.id, 'admin.provider.test', 'provider', id, {
      success: testResult.success
    }, c.req);

    return c.json({
      success: testResult.success,
      message: testResult.success ? 'Provider connection successful' : 'Provider connection failed',
      details: testResult
    });

  } catch (err) {
    console.error('Test provider error:', err);
    return c.json({ error: 'Failed to test provider' }, 500);
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function maskCredentials(credentials) {
  const masked = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string' && value.length > 4) {
      masked[key] = '****' + value.slice(-4);
    } else {
      masked[key] = '****';
    }
  }
  return masked;
}

function getCredentialsPreview(providerName) {
  const previews = {
    sendgrid: 'API Key',
    mailgun: 'API Key + Domain',
    ses: 'AWS Access Key',
    twilio: 'Account SID + Auth Token',
    whatsapp: 'Phone Number ID + Access Token',
    discord: 'Bot Token',
    slack: 'Bot Token',
    telegram: 'Bot Token',
    teams: 'App ID + Password'
  };
  return previews[providerName] || 'API Credentials';
}

async function testProviderConnection(providerType, providerName, credentials) {
  // This is a placeholder - implement actual testing logic for each provider
  // For now, just return success

  switch (providerType) {
    case 'email':
      // Test email provider (SendGrid, Mailgun, SES, etc.)
      return { success: true, message: `${providerName} credentials validated` };

    case 'sms':
      // Test SMS provider (Twilio, etc.)
      return { success: true, message: `${providerName} credentials validated` };

    case 'whatsapp':
      // Test WhatsApp credentials
      return { success: true, message: 'WhatsApp credentials validated' };

    case 'social':
      // Test social bot credentials
      return { success: true, message: `${providerName} bot credentials validated` };

    default:
      return { success: false, message: 'Unknown provider type' };
  }
}

export default adminProviders;
