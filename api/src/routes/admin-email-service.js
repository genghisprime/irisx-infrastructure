/**
 * Admin Email Service Management Routes
 * Multi-Provider LCR System
 *
 * Manages email providers with least-cost routing, health tracking,
 * automatic failover, and encrypted credential storage.
 */

import { Hono } from 'hono';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';
import { sendEmail } from '../services/email-service.js';

const adminEmailService = new Hono();

// Apply admin authentication to all routes
adminEmailService.use('*', authenticateAdmin);

/**
 * Encrypt credentials using AES-256-CBC
 */
function encryptCredentials(credentials) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.ENCRYPTION_KEY || 'change-this-key-in-production',
      'salt',
      32
    );
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex')
    };
  } catch (error) {
    console.error('[Encrypt] Failed to encrypt credentials:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt credentials using AES-256-CBC
 */
function decryptCredentials(encryptedData, ivHex) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(
      process.env.ENCRYPTION_KEY || 'change-this-key-in-production',
      'salt',
      32
    );
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[Decrypt] Failed to decrypt credentials:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * GET /admin/email-service/providers
 * List all email providers with health scores and configuration
 */
adminEmailService.get('/providers', async (c) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        provider_name,
        provider_type,
        is_active,
        config,
        CASE
          WHEN credentials_encrypted = 'PLACEHOLDER_ENCRYPT_LATER' THEN false
          ELSE true
        END as has_credentials,
        created_at,
        updated_at
      FROM messaging_providers
      WHERE provider_type = 'email'
      ORDER BY (config->>'priority')::integer ASC`
    );

    // Format response to include parsed config fields
    const providers = result.rows.map(provider => ({
      id: provider.id,
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      is_active: provider.is_active,
      has_credentials: provider.has_credentials,
      display_name: provider.config.display_name,
      priority: parseInt(provider.config.priority),
      health_score: parseInt(provider.config.health_score),
      cost_per_1000: parseFloat(provider.config.email_rate_per_1000),
      currency: provider.config.currency || 'USD',
      max_retry_attempts: parseInt(provider.config.max_retry_attempts || '3'),
      retry_delay_seconds: parseInt(provider.config.retry_delay_seconds || '60'),
      created_at: provider.created_at,
      updated_at: provider.updated_at
    }));

    return c.json({
      success: true,
      providers
    });
  } catch (error) {
    console.error('[Admin Email] Failed to list providers:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /admin/email-service/providers/:id
 * Get detailed information about a specific provider
 * Includes decrypted credentials for superadmin
 */
adminEmailService.get('/providers/:id', async (c) => {
  try {
    const providerId = c.req.param('id');
    const admin = c.get('admin');

    const result = await pool.query(
      `SELECT
        id,
        provider_name,
        provider_type,
        is_active,
        config,
        credentials_encrypted,
        credentials_iv,
        created_at,
        updated_at
      FROM messaging_providers
      WHERE id = $1 AND provider_type = 'email'`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Provider not found'
      }, 404);
    }

    const provider = result.rows[0];

    // Basic provider info
    const response = {
      id: provider.id,
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      is_active: provider.is_active,
      display_name: provider.config.display_name,
      priority: parseInt(provider.config.priority),
      health_score: parseInt(provider.config.health_score),
      cost_per_1000: parseFloat(provider.config.cost_per_1000 || provider.config.email_rate_per_1000 || '0'),
      currency: provider.config.currency || 'USD',
      max_retry_attempts: parseInt(provider.config.max_retry_attempts || '3'),
      retry_delay_seconds: parseInt(provider.config.retry_delay_seconds || '60'),
      from_email: provider.config.from_email || '',
      from_name: provider.config.from_name || '',
      has_credentials: provider.credentials_encrypted !== 'PLACEHOLDER_ENCRYPT_LATER',
      created_at: provider.created_at,
      updated_at: provider.updated_at
    };

    // Only decrypt credentials for superadmin
    if (admin?.role === 'superadmin' && response.has_credentials) {
      try {
        const decrypted = decryptCredentials(
          provider.credentials_encrypted,
          provider.credentials_iv
        );
        response.credentials = decrypted;
      } catch (error) {
        console.error('[Admin Email] Failed to decrypt credentials:', error);
        response.credentials_error = 'Failed to decrypt credentials';
      }
    }

    return c.json({
      success: true,
      provider: response
    });
  } catch (error) {
    console.error('[Admin Email] Failed to get provider:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /admin/email-service/providers
 * Create a new email provider
 * Superadmin only
 */
adminEmailService.post('/providers', async (c) => {
  try {
    const body = await c.req.json();
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    // Validate required fields
    const { provider_name, from_email, credentials, display_name, priority, cost_per_1000, max_retry_attempts, retry_delay_seconds, from_name } = body;

    if (!provider_name || !from_email || !credentials) {
      return c.json({
        success: false,
        error: 'Missing required fields: provider_name, from_email, credentials'
      }, 400);
    }

    // Validate provider_name
    const validProviders = ['elastic-email', 'sendgrid', 'custom-smtp', 'amazon-ses'];
    if (!validProviders.includes(provider_name)) {
      return c.json({
        success: false,
        error: `Invalid provider_name. Must be one of: ${validProviders.join(', ')}`
      }, 400);
    }

    // Encrypt credentials
    const { encrypted, iv } = encryptCredentials(credentials);

    // Build config based on provider type
    let config = {
      display_name: display_name || provider_name,
      priority: priority || 1,
      health_score: 100,
      cost_per_1000: cost_per_1000 || 0,
      email_rate_per_1000: cost_per_1000 || 0,
      currency: 'USD',
      max_retry_attempts: max_retry_attempts || 3,
      retry_delay_seconds: retry_delay_seconds || 60,
      from_email: from_email,
      from_name: from_name || 'IRISX'
    };

    // Add provider-specific config
    if (provider_name === 'elastic-email') {
      config.api_endpoint = 'https://api.elasticemail.com/v2';
      config.supports_html = true;
      config.supports_attachments = true;
      config.supports_templates = true;
      config.daily_limit = 200;
    } else if (provider_name === 'sendgrid') {
      config.api_endpoint = 'https://api.sendgrid.com/v3';
      config.supports_html = true;
      config.supports_attachments = true;
      config.supports_templates = true;
      config.daily_limit = 100;
    } else if (provider_name === 'custom-smtp') {
      config.supports_html = true;
      config.supports_attachments = false;
      config.supports_templates = false;
      config.daily_limit = null;
    } else if (provider_name === 'amazon-ses') {
      config.api_endpoint = 'https://email.us-east-1.amazonaws.com';
      config.supports_html = true;
      config.supports_attachments = true;
      config.supports_templates = false;
      config.daily_limit = null;
    }

    // Insert into database
    const result = await pool.query(
      `INSERT INTO messaging_providers (
        provider_name,
        provider_type,
        credentials_encrypted,
        credentials_iv,
        config,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, provider_name, provider_type, is_active, config, created_at`,
      [provider_name, 'email', encrypted, iv, config, false]
    );

    const newProvider = result.rows[0];

    return c.json({
      success: true,
      message: 'Email provider created successfully',
      provider: {
        id: newProvider.id,
        provider_name: newProvider.provider_name,
        provider_type: newProvider.provider_type,
        is_active: newProvider.is_active,
        display_name: newProvider.config.display_name,
        priority: parseInt(newProvider.config.priority),
        health_score: parseInt(newProvider.config.health_score),
        cost_per_1000: parseFloat(newProvider.config.cost_per_1000),
        currency: newProvider.config.currency,
        max_retry_attempts: parseInt(newProvider.config.max_retry_attempts),
        retry_delay_seconds: parseInt(newProvider.config.retry_delay_seconds),
        from_email: newProvider.config.from_email,
        from_name: newProvider.config.from_name,
        created_at: newProvider.created_at
      }
    }, 201);
  } catch (error) {
    console.error('[Admin Email] Failed to create provider:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * PUT /admin/email-service/providers/:id
 * Update provider configuration (not credentials)
 * Superadmin only
 */
adminEmailService.put('/providers/:id', async (c) => {
  try {
    const providerId = c.req.param('id');
    const body = await c.req.json();
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    // Get current config
    const current = await pool.query(
      'SELECT config FROM messaging_providers WHERE id = $1',
      [providerId]
    );

    if (current.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Provider not found'
      }, 404);
    }

    // Merge config updates
    const currentConfig = current.rows[0].config;
    const updatedConfig = {
      ...currentConfig,
      ...(body.display_name && { display_name: body.display_name }),
      ...(body.priority !== undefined && { priority: body.priority.toString() }),
      ...(body.cost_per_1000 !== undefined && { email_rate_per_1000: body.cost_per_1000.toString() }),
      ...(body.max_retry_attempts !== undefined && { max_retry_attempts: body.max_retry_attempts.toString() }),
      ...(body.retry_delay_seconds !== undefined && { retry_delay_seconds: body.retry_delay_seconds.toString() })
    };

    // Update database
    const result = await pool.query(
      `UPDATE messaging_providers
       SET config = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, provider_name, config, updated_at`,
      [JSON.stringify(updatedConfig), providerId]
    );

    return c.json({
      success: true,
      provider: {
        id: result.rows[0].id,
        provider_name: result.rows[0].provider_name,
        config: result.rows[0].config,
        updated_at: result.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('[Admin Email] Failed to update provider:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * PUT /admin/email-service/providers/:id/credentials
 * Update provider credentials (encrypted)
 * Superadmin only
 */
adminEmailService.put('/providers/:id/credentials', async (c) => {
  try {
    const providerId = c.req.param('id');
    const body = await c.req.json();
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    // Validate credentials object exists
    if (!body.credentials || typeof body.credentials !== 'object') {
      return c.json({
        success: false,
        error: 'Missing or invalid credentials object'
      }, 400);
    }

    // Encrypt credentials
    const { encrypted, iv } = encryptCredentials(body.credentials);

    // Update database
    const result = await pool.query(
      `UPDATE messaging_providers
       SET credentials_encrypted = $1,
           credentials_iv = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, provider_name, updated_at`,
      [encrypted, iv, providerId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Provider not found'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Credentials updated successfully',
      provider: {
        id: result.rows[0].id,
        provider_name: result.rows[0].provider_name,
        updated_at: result.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('[Admin Email] Failed to update credentials:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /admin/email-service/providers/:id/activate
 * Activate a provider
 * Superadmin only
 */
adminEmailService.post('/providers/:id/activate', async (c) => {
  try {
    const providerId = c.req.param('id');
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    // Check if provider has credentials
    const check = await pool.query(
      `SELECT credentials_encrypted FROM messaging_providers WHERE id = $1`,
      [providerId]
    );

    if (check.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Provider not found'
      }, 404);
    }

    if (check.rows[0].credentials_encrypted === 'PLACEHOLDER_ENCRYPT_LATER') {
      return c.json({
        success: false,
        error: 'Cannot activate provider without credentials'
      }, 400);
    }

    // Activate provider
    const result = await pool.query(
      `UPDATE messaging_providers
       SET is_active = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, provider_name, is_active, updated_at`,
      [providerId]
    );

    return c.json({
      success: true,
      message: 'Provider activated successfully',
      provider: result.rows[0]
    });
  } catch (error) {
    console.error('[Admin Email] Failed to activate provider:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /admin/email-service/providers/:id/deactivate
 * Deactivate a provider
 * Superadmin only
 */
adminEmailService.post('/providers/:id/deactivate', async (c) => {
  try {
    const providerId = c.req.param('id');
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    const result = await pool.query(
      `UPDATE messaging_providers
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, provider_name, is_active, updated_at`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Provider not found'
      }, 404);
    }

    return c.json({
      success: true,
      message: 'Provider deactivated successfully',
      provider: result.rows[0]
    });
  } catch (error) {
    console.error('[Admin Email] Failed to deactivate provider:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /admin/email-service/stats
 * Get email routing statistics from message_routing_logs
 */
adminEmailService.get('/stats', async (c) => {
  try {
    const { timeframe = '24h' } = c.req.query();

    // Parse timeframe
    let intervalSQL = "NOW() - INTERVAL '24 hours'";
    if (timeframe === '7d') {
      intervalSQL = "NOW() - INTERVAL '7 days'";
    } else if (timeframe === '30d') {
      intervalSQL = "NOW() - INTERVAL '30 days'";
    }

    // Get routing statistics
    const stats = await pool.query(
      `SELECT
        COUNT(*) as total_emails,
        COUNT(DISTINCT selected_provider_id) as providers_used,
        SUM(CASE WHEN provider_selection_reason = 'lcr_selected' THEN 1 ELSE 0 END) as lcr_routes,
        SUM(CASE WHEN provider_selection_reason LIKE '%failover%' THEN 1 ELSE 0 END) as failover_routes,
        AVG(routing_duration_ms) as avg_delivery_time,
        MAX(routing_duration_ms) as max_delivery_time,
        MIN(routing_duration_ms) as min_delivery_time
      FROM message_routing_logs
      WHERE created_at >= ${intervalSQL}
        AND message_type = 'email'`
    );

    // Get per-provider statistics
    const providerStats = await pool.query(
      `SELECT
        mp.id,
        mp.provider_name,
        mp.config->>'display_name' as display_name,
        COUNT(mrl.id) as emails_sent,
        AVG(mrl.routing_duration_ms) as avg_delivery_time,
        SUM(CASE WHEN mrl.provider_selection_reason = 'lcr_selected' THEN 1 ELSE 0 END) as lcr_selections,
        SUM(CASE WHEN mrl.provider_selection_reason LIKE '%failover%' THEN 1 ELSE 0 END) as failover_selections,
        mp.config->>'health_score' as current_health_score
      FROM messaging_providers mp
      LEFT JOIN message_routing_logs mrl ON mp.id = mrl.selected_provider_id
        AND mrl.created_at >= ${intervalSQL}
        AND mrl.message_type = 'email'
      WHERE mp.provider_type = 'email'
      GROUP BY mp.id, mp.provider_name, mp.config
      ORDER BY emails_sent DESC`
    );

    return c.json({
      success: true,
      timeframe,
      overall: {
        total_emails: parseInt(stats.rows[0].total_emails),
        providers_used: parseInt(stats.rows[0].providers_used),
        lcr_routes: parseInt(stats.rows[0].lcr_routes),
        failover_routes: parseInt(stats.rows[0].failover_routes),
        avg_delivery_time_ms: Math.round(parseFloat(stats.rows[0].avg_delivery_time || 0)),
        max_delivery_time_ms: parseInt(stats.rows[0].max_delivery_time || 0),
        min_delivery_time_ms: parseInt(stats.rows[0].min_delivery_time || 0)
      },
      by_provider: providerStats.rows.map(p => ({
        id: p.id,
        provider_name: p.provider_name,
        display_name: p.display_name,
        emails_sent: parseInt(p.emails_sent),
        avg_delivery_time_ms: Math.round(parseFloat(p.avg_delivery_time || 0)),
        lcr_selections: parseInt(p.lcr_selections),
        failover_selections: parseInt(p.failover_selections),
        current_health_score: parseInt(p.current_health_score)
      }))
    });
  } catch (error) {
    console.error('[Admin Email] Failed to get stats:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /admin/email-service/recent-deliveries
 * Get recent email delivery logs
 */
adminEmailService.get('/recent-deliveries', async (c) => {
  try {
    const { limit = '50' } = c.req.query();

    const result = await pool.query(
      `SELECT
        mrl.id,
        mrl.message_type,
        mrl.selected_provider_id,
        mp.config->>'display_name' as provider_name,
        mrl.provider_selection_reason,
        mrl.routing_duration_ms,
        mrl.created_at
      FROM message_routing_logs mrl
      JOIN messaging_providers mp ON mrl.selected_provider_id = mp.id
      WHERE mrl.message_type = 'email'
      ORDER BY mrl.created_at DESC
      LIMIT $1`,
      [parseInt(limit)]
    );

    return c.json({
      success: true,
      deliveries: result.rows.map(d => ({
        id: d.id,
        provider_name: d.provider_name,
        routing_reason: d.provider_selection_reason,
        delivery_time_ms: d.routing_duration_ms,
        created_at: d.created_at
      }))
    });
  } catch (error) {
    console.error('[Admin Email] Failed to get recent deliveries:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * POST /admin/email-service/test
 * Send a test email via LCR system
 * Superadmin only
 */
adminEmailService.post('/test', async (c) => {
  try {
    const body = await c.req.json();
    const admin = c.get('admin');

    if (admin?.role !== 'superadmin') {
      return c.json({
        success: false,
        error: 'Superadmin access required'
      }, 403);
    }

    if (!body.to) {
      return c.json({
        success: false,
        error: 'Missing required field: to'
      }, 400);
    }

    // Send test email via LCR system
    const result = await sendEmail({
      to: body.to,
      subject: body.subject || 'IRISX Email System Test',
      html: body.html || '<h1>Test Email</h1><p>This is a test email from the IRISX multi-provider LCR email system. If you received this, the system is working correctly!</p>',
      text: body.text || 'Test Email\n\nThis is a test email from the IRISX multi-provider LCR email system. If you received this, the system is working correctly!',
      tenantId: null,
      messageId: null
    });

    return c.json({
      success: true,
      message: 'Test email sent successfully',
      ...result
    });
  } catch (error) {
    console.error('[Admin Email] Test email failed:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

/**
 * GET /admin/email-service/health
 * Get overall email system health
 */
adminEmailService.get('/health', async (c) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_providers,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_providers,
        SUM(CASE WHEN credentials_encrypted != 'PLACEHOLDER_ENCRYPT_LATER' THEN 1 ELSE 0 END) as configured_providers,
        AVG((config->>'health_score')::integer) as avg_health_score,
        MIN((config->>'health_score')::integer) as min_health_score,
        MAX((config->>'health_score')::integer) as max_health_score
      FROM messaging_providers
      WHERE provider_type = 'email'`
    );

    const health = result.rows[0];

    // Determine system status
    let status = 'healthy';
    if (parseInt(health.active_providers) === 0) {
      status = 'critical';
    } else if (parseFloat(health.avg_health_score) < 50) {
      status = 'degraded';
    } else if (parseInt(health.active_providers) === 1) {
      status = 'warning'; // No failover available
    }

    return c.json({
      success: true,
      status,
      providers: {
        total: parseInt(health.total_providers),
        active: parseInt(health.active_providers),
        configured: parseInt(health.configured_providers)
      },
      health_scores: {
        average: Math.round(parseFloat(health.avg_health_score || 0)),
        minimum: parseInt(health.min_health_score || 0),
        maximum: parseInt(health.max_health_score || 0)
      }
    });
  } catch (error) {
    console.error('[Admin Email] Failed to get health:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default adminEmailService;
