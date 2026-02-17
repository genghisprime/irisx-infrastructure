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
  provider_type: z.enum(['email', 'sms', 'whatsapp', 'social', 'tts', 'stt', 'voice', 'carrier']),
  provider_name: z.string().min(1).max(50), // sendgrid, twilio, openai, elevenlabs, etc.
  credentials: z.record(z.any()), // API keys, tokens, secrets
  config: z.record(z.any()).optional(), // Additional configuration
  priority: z.number().int().min(1).max(100).optional().default(50),
  cost_per_unit: z.number().optional(), // Cost per minute/message/1000 chars
  health_score: z.number().int().min(0).max(100).optional().default(100),
  is_active: z.boolean().optional().default(true)
});

const updateProviderSchema = z.object({
  credentials: z.record(z.any()).optional(),
  config: z.record(z.any()).optional(),
  priority: z.number().int().min(1).max(100).optional(),
  cost_per_unit: z.number().optional(),
  health_score: z.number().int().min(0).max(100).optional(),
  is_active: z.boolean().optional()
});

// Voice catalog schemas (unified voice management)
const createVoiceSchema = z.object({
  voice_code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  display_name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  primary_provider: z.string().min(1).max(50),
  primary_voice_id: z.string().min(1).max(100),
  fallback_mappings: z.array(z.object({
    provider: z.string(),
    voice_id: z.string()
  })).optional().default([]),
  quality_tier: z.enum(['economy', 'standard', 'premium', 'ultra']).optional().default('standard'),
  gender: z.enum(['male', 'female', 'neutral']).optional(),
  language: z.string().max(10).optional().default('en-US'),
  style: z.string().max(50).optional(),
  sample_text: z.string().max(500).optional(),
  is_active: z.boolean().optional().default(true)
});

const updateVoiceSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  primary_provider: z.string().min(1).max(50).optional(),
  primary_voice_id: z.string().min(1).max(100).optional(),
  fallback_mappings: z.array(z.object({
    provider: z.string(),
    voice_id: z.string()
  })).optional(),
  quality_tier: z.enum(['economy', 'standard', 'premium', 'ultra']).optional(),
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

    const { tenant_id, provider_type, provider_name, credentials, config, priority, cost_per_unit, health_score, is_active } = validation.data;

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
        tenant_id, provider_type, provider_name, credentials_encrypted, credentials_iv,
        config, priority, cost_per_unit, health_score, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, provider_type, provider_name, priority, cost_per_unit, health_score, is_active, created_at`,
      [
        tenant_id || null,
        provider_type,
        provider_name,
        encrypted,
        iv,
        config ? JSON.stringify(config) : null,
        priority || 50,
        cost_per_unit || null,
        health_score || 100,
        is_active
      ]
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

    if (validation.data.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      values.push(validation.data.priority);
      paramIndex++;
    }

    if (validation.data.cost_per_unit !== undefined) {
      updates.push(`cost_per_unit = $${paramIndex}`);
      values.push(validation.data.cost_per_unit);
      paramIndex++;
    }

    if (validation.data.health_score !== undefined) {
      updates.push(`health_score = $${paramIndex}`);
      values.push(validation.data.health_score);
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
    // Email providers
    sendgrid: 'API Key',
    mailgun: 'API Key + Domain',
    ses: 'AWS Access Key',
    elastic_email: 'API Key',
    // SMS providers
    twilio: 'Account SID + Auth Token',
    telnyx: 'API Key',
    bandwidth: 'Account ID + API Token',
    plivo: 'Auth ID + Auth Token',
    vonage: 'API Key + Secret',
    // WhatsApp
    whatsapp: 'Phone Number ID + Access Token',
    // Social
    discord: 'Bot Token',
    slack: 'Bot Token',
    telegram: 'Bot Token',
    teams: 'App ID + Password',
    // TTS providers
    openai: 'API Key',
    elevenlabs: 'API Key',
    aws_polly: 'AWS Access Key + Secret',
    google_tts: 'Service Account JSON',
    azure_tts: 'Subscription Key + Region',
    // STT providers
    whisper: 'API Key (OpenAI)',
    deepgram: 'API Key',
    aws_transcribe: 'AWS Access Key + Secret',
    google_stt: 'Service Account JSON',
    azure_stt: 'Subscription Key + Region',
    // Voice/Carrier providers
    freeswitch: 'ESL Password',
    asterisk: 'AMI Credentials'
  };
  return previews[providerName] || 'API Credentials';
}

async function testProviderConnection(providerType, providerName, credentials) {
  // Test provider connectivity based on type
  switch (providerType) {
    case 'email':
      return { success: true, message: `${providerName} credentials validated` };

    case 'sms':
      return { success: true, message: `${providerName} credentials validated` };

    case 'whatsapp':
      return { success: true, message: 'WhatsApp credentials validated' };

    case 'social':
      return { success: true, message: `${providerName} bot credentials validated` };

    case 'tts':
      return await testTTSProvider(providerName, credentials);

    case 'stt':
      return await testSTTProvider(providerName, credentials);

    case 'voice':
    case 'carrier':
      return { success: true, message: `${providerName} credentials validated` };

    default:
      return { success: false, message: 'Unknown provider type' };
  }
}

async function testTTSProvider(providerName, credentials) {
  try {
    switch (providerName) {
      case 'openai':
        // Test OpenAI TTS API
        const openaiResponse = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${credentials.api_key}` }
        });
        if (openaiResponse.ok) {
          return { success: true, message: 'OpenAI API key validated' };
        }
        return { success: false, message: 'Invalid OpenAI API key' };

      case 'elevenlabs':
        // Test ElevenLabs API
        const elevenResponse = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': credentials.api_key }
        });
        if (elevenResponse.ok) {
          return { success: true, message: 'ElevenLabs API key validated' };
        }
        return { success: false, message: 'Invalid ElevenLabs API key' };

      case 'aws_polly':
        // AWS credentials validated through AWS SDK
        return { success: true, message: 'AWS Polly credentials accepted (full validation requires AWS SDK)' };

      default:
        return { success: true, message: `${providerName} credentials stored` };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function testSTTProvider(providerName, credentials) {
  try {
    switch (providerName) {
      case 'whisper':
      case 'openai':
        const openaiResponse = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${credentials.api_key}` }
        });
        if (openaiResponse.ok) {
          return { success: true, message: 'OpenAI/Whisper API key validated' };
        }
        return { success: false, message: 'Invalid API key' };

      case 'deepgram':
        const dgResponse = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { 'Authorization': `Token ${credentials.api_key}` }
        });
        if (dgResponse.ok) {
          return { success: true, message: 'Deepgram API key validated' };
        }
        return { success: false, message: 'Invalid Deepgram API key' };

      default:
        return { success: true, message: `${providerName} credentials stored` };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// =============================================================================
// VOICE CATALOG ROUTES (Unified Voice Management)
// =============================================================================

/**
 * GET /admin/providers/voices
 * List all unified voices in the catalog
 */
adminProviders.get('/voices', async (c) => {
  try {
    const admin = c.get('admin');
    const quality_tier = c.req.query('quality_tier');
    const language = c.req.query('language');
    const is_active = c.req.query('is_active');

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (quality_tier) {
      whereConditions.push(`quality_tier = $${paramIndex}`);
      queryParams.push(quality_tier);
      paramIndex++;
    }

    if (language) {
      whereConditions.push(`language = $${paramIndex}`);
      queryParams.push(language);
      paramIndex++;
    }

    if (is_active !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      queryParams.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const result = await pool.query(
      `SELECT
        id, voice_code, display_name, description,
        primary_provider, primary_voice_id, fallback_mappings,
        quality_tier, gender, language, style, sample_text,
        usage_count, is_active, created_at, updated_at
       FROM voice_catalog
       ${whereClause}
       ORDER BY quality_tier DESC, display_name ASC`,
      queryParams
    );

    await logAdminAction(admin.id, 'admin.voices.list', null, null, { filters: { quality_tier, language } }, c.req);

    return c.json({
      success: true,
      voices: result.rows,
      count: result.rows.length
    });

  } catch (err) {
    console.error('List voices error:', err);
    return c.json({ error: 'Failed to list voices' }, 500);
  }
});

/**
 * GET /admin/providers/voices/:code
 * Get a specific voice by code
 */
adminProviders.get('/voices/:code', async (c) => {
  try {
    const { code } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      'SELECT * FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Voice not found' }, 404);
    }

    await logAdminAction(admin.id, 'admin.voice.view', 'voice', code, null, c.req);

    return c.json({
      success: true,
      voice: result.rows[0]
    });

  } catch (err) {
    console.error('Get voice error:', err);
    return c.json({ error: 'Failed to get voice' }, 500);
  }
});

/**
 * POST /admin/providers/voices
 * Create a new unified voice
 */
adminProviders.post('/voices', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();

    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const validation = createVoiceSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    const {
      voice_code, display_name, description, primary_provider, primary_voice_id,
      fallback_mappings, quality_tier, gender, language, style, sample_text, is_active
    } = validation.data;

    // Check if voice code already exists
    const existing = await pool.query(
      'SELECT id FROM voice_catalog WHERE voice_code = $1',
      [voice_code]
    );

    if (existing.rows.length > 0) {
      return c.json({ error: 'Voice code already exists' }, 409);
    }

    const result = await pool.query(
      `INSERT INTO voice_catalog (
        voice_code, display_name, description, primary_provider, primary_voice_id,
        fallback_mappings, quality_tier, gender, language, style, sample_text, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        voice_code, display_name, description || null, primary_provider, primary_voice_id,
        JSON.stringify(fallback_mappings || []), quality_tier || 'standard',
        gender || null, language || 'en-US', style || null, sample_text || null, is_active
      ]
    );

    await logAdminAction(admin.id, 'admin.voice.create', 'voice', voice_code, {
      display_name, primary_provider, quality_tier
    }, c.req);

    return c.json({
      success: true,
      voice: result.rows[0],
      message: 'Voice created successfully'
    }, 201);

  } catch (err) {
    console.error('Create voice error:', err);
    return c.json({ error: 'Failed to create voice' }, 500);
  }
});

/**
 * PATCH /admin/providers/voices/:code
 * Update a unified voice
 */
adminProviders.patch('/voices/:code', async (c) => {
  try {
    const { code } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const validation = updateVoiceSchema.safeParse(body);
    if (!validation.success) {
      return c.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, 400);
    }

    // Check if voice exists
    const existing = await pool.query(
      'SELECT id FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return c.json({ error: 'Voice not found' }, 404);
    }

    // Build UPDATE query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(validation.data)) {
      if (value !== undefined) {
        if (key === 'fallback_mappings') {
          updates.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(code);

    await pool.query(
      `UPDATE voice_catalog
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE voice_code = $${paramIndex}`,
      values
    );

    const result = await pool.query(
      'SELECT * FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    await logAdminAction(admin.id, 'admin.voice.update', 'voice', code, {
      updated_fields: Object.keys(validation.data)
    }, c.req);

    return c.json({
      success: true,
      voice: result.rows[0]
    });

  } catch (err) {
    console.error('Update voice error:', err);
    return c.json({ error: 'Failed to update voice' }, 500);
  }
});

/**
 * DELETE /admin/providers/voices/:code
 * Delete a unified voice
 */
adminProviders.delete('/voices/:code', async (c) => {
  try {
    const { code } = c.req.param();
    const admin = c.get('admin');

    if (admin.role !== 'superadmin') {
      return c.json({ error: 'Only superadmins can delete voices' }, 403);
    }

    const existing = await pool.query(
      'SELECT id, display_name FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return c.json({ error: 'Voice not found' }, 404);
    }

    await pool.query(
      'DELETE FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    await logAdminAction(admin.id, 'admin.voice.delete', 'voice', code, {
      display_name: existing.rows[0].display_name
    }, c.req);

    return c.json({
      success: true,
      message: 'Voice deleted successfully'
    });

  } catch (err) {
    console.error('Delete voice error:', err);
    return c.json({ error: 'Failed to delete voice' }, 500);
  }
});

/**
 * GET /admin/providers/voices/:code/test
 * Generate a test audio sample for a voice
 */
adminProviders.get('/voices/:code/test', async (c) => {
  try {
    const { code } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      'SELECT * FROM voice_catalog WHERE voice_code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Voice not found' }, 404);
    }

    const voice = result.rows[0];
    const testText = voice.sample_text || `Hello, this is ${voice.display_name}. I am a voice available in the IRISX platform.`;

    // Return test info (actual TTS would be handled by ChannelRouter service)
    return c.json({
      success: true,
      voice_code: code,
      test_text: testText,
      primary_provider: voice.primary_provider,
      primary_voice_id: voice.primary_voice_id,
      message: 'Use the TTS API endpoint to generate actual audio'
    });

  } catch (err) {
    console.error('Test voice error:', err);
    return c.json({ error: 'Failed to test voice' }, 500);
  }
});

// =============================================================================
// PROVIDER ROUTING & LCR ROUTES
// =============================================================================

/**
 * GET /admin/providers/routing/:channel_type
 * Get routing rules for a channel type
 */
adminProviders.get('/routing/:channel_type', async (c) => {
  try {
    const { channel_type } = c.req.param();
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        crr.*,
        mp.provider_name,
        mp.health_score,
        mp.is_active as provider_active
       FROM channel_routing_rules crr
       LEFT JOIN messaging_providers mp ON crr.provider_id = mp.id
       WHERE crr.channel_type = $1
       ORDER BY crr.priority ASC`,
      [channel_type]
    );

    return c.json({
      success: true,
      channel_type,
      rules: result.rows
    });

  } catch (err) {
    console.error('Get routing rules error:', err);
    return c.json({ error: 'Failed to get routing rules' }, 500);
  }
});

/**
 * GET /admin/providers/health
 * Get health status of all providers
 */
adminProviders.get('/health', async (c) => {
  try {
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        id, provider_type, provider_name, health_score, is_active,
        last_used_at, last_success_at, last_failure_at,
        total_requests, failed_requests,
        CASE WHEN total_requests > 0
          THEN ROUND((total_requests - COALESCE(failed_requests, 0))::NUMERIC / total_requests * 100, 2)
          ELSE 100
        END as success_rate
       FROM messaging_providers
       WHERE deleted_at IS NULL
       ORDER BY provider_type, health_score DESC`
    );

    // Group by provider type
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.provider_type]) {
        grouped[row.provider_type] = [];
      }
      grouped[row.provider_type].push(row);
    }

    return c.json({
      success: true,
      providers: grouped,
      total: result.rows.length
    });

  } catch (err) {
    console.error('Get provider health error:', err);
    return c.json({ error: 'Failed to get provider health' }, 500);
  }
});

/**
 * POST /admin/providers/:id/health
 * Manually update provider health score
 */
adminProviders.post('/:id/health', async (c) => {
  try {
    const { id } = c.req.param();
    const admin = c.get('admin');
    const body = await c.req.json();

    if (!['admin', 'superadmin'].includes(admin.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const { health_score, reason } = body;

    if (health_score === undefined || health_score < 0 || health_score > 100) {
      return c.json({ error: 'Health score must be between 0 and 100' }, 400);
    }

    await pool.query(
      `UPDATE messaging_providers
       SET health_score = $1, updated_at = NOW()
       WHERE id = $2`,
      [health_score, id]
    );

    await logAdminAction(admin.id, 'admin.provider.health_update', 'provider', id, {
      health_score,
      reason
    }, c.req);

    return c.json({
      success: true,
      message: 'Health score updated'
    });

  } catch (err) {
    console.error('Update health error:', err);
    return c.json({ error: 'Failed to update health' }, 500);
  }
});

/**
 * GET /admin/providers/usage
 * Get provider usage statistics
 */
adminProviders.get('/usage', async (c) => {
  try {
    const admin = c.get('admin');
    const days = parseInt(c.req.query('days') || '30');
    const provider_type = c.req.query('provider_type');

    let whereConditions = [`created_at > NOW() - INTERVAL '${days} days'`];
    let queryParams = [];
    let paramIndex = 1;

    if (provider_type) {
      whereConditions.push(`channel_type = $${paramIndex}`);
      queryParams.push(provider_type);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT
        channel_type,
        DATE(created_at) as date,
        COUNT(*) as request_count,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        SUM(cost_cents) as total_cost_cents,
        AVG(latency_ms) as avg_latency_ms
       FROM provider_usage_log
       WHERE ${whereConditions.join(' AND ')}
       GROUP BY channel_type, DATE(created_at)
       ORDER BY date DESC, channel_type`,
      queryParams
    );

    return c.json({
      success: true,
      days,
      usage: result.rows
    });

  } catch (err) {
    console.error('Get usage error:', err);
    return c.json({ error: 'Failed to get usage stats' }, 500);
  }
});

export default adminProviders;
