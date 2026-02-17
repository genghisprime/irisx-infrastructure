/**
 * Translation API Routes
 * Multi-provider language translation services
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateJWT as authenticate, requireRole } from '../middleware/authMiddleware.js';
import translationService from '../services/translation.js';
import db from '../db/connection.js';

const translation = new Hono();

// All routes require authentication
translation.use('*', authenticate);

// =========================================
// TRANSLATION OPERATIONS
// =========================================

/**
 * POST /translation/translate
 * Translate text
 */
translation.post('/translate', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      text: z.string().min(1).max(10000),
      sourceLanguage: z.string().length(2).optional(),
      targetLanguage: z.string().length(2),
      provider: z.string().optional(),
      channel: z.string().optional(),
      skipCache: z.boolean().optional()
    });

    const validated = schema.parse(body);

    const result = await translationService.translate({
      tenantId: user.tenantId,
      text: validated.text,
      sourceLanguage: validated.sourceLanguage,
      targetLanguage: validated.targetLanguage,
      provider: validated.provider,
      channel: validated.channel,
      skipCache: validated.skipCache
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Translate error:', error);
    return c.json({ error: error.message || 'Translation failed' }, 500);
  }
});

/**
 * POST /translation/translate/batch
 * Batch translate multiple texts
 */
translation.post('/translate/batch', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      texts: z.array(z.string().min(1).max(10000)).max(100),
      sourceLanguage: z.string().length(2).optional(),
      targetLanguage: z.string().length(2),
      provider: z.string().optional()
    });

    const validated = schema.parse(body);

    const results = await translationService.translateBatch({
      tenantId: user.tenantId,
      texts: validated.texts,
      sourceLanguage: validated.sourceLanguage,
      targetLanguage: validated.targetLanguage,
      provider: validated.provider
    });

    return c.json({ success: true, results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Batch error:', error);
    return c.json({ error: error.message || 'Batch translation failed' }, 500);
  }
});

/**
 * POST /translation/detect
 * Detect language
 */
translation.post('/detect', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      text: z.string().min(1).max(1000),
      provider: z.string().optional()
    });

    const validated = schema.parse(body);

    const result = await translationService.detectLanguage({
      tenantId: user.tenantId,
      text: validated.text,
      provider: validated.provider
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Detect error:', error);
    return c.json({ error: error.message || 'Language detection failed' }, 500);
  }
});

// =========================================
// CHANNEL-SPECIFIC TRANSLATION
// =========================================

/**
 * POST /translation/sms
 * Translate SMS message
 */
translation.post('/sms', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      text: z.string().min(1),
      customerLanguage: z.string(),
      agentLanguage: z.string().default('en'),
      direction: z.enum(['inbound', 'outbound'])
    });

    const validated = schema.parse(body);

    const result = await translationService.translateSMS({
      tenantId: user.tenantId,
      ...validated
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] SMS error:', error);
    return c.json({ error: error.message || 'SMS translation failed' }, 500);
  }
});

/**
 * POST /translation/chat
 * Translate chat message
 */
translation.post('/chat', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      text: z.string().min(1),
      customerLanguage: z.string(),
      agentLanguage: z.string().default('en'),
      direction: z.enum(['inbound', 'outbound']),
      conversationId: z.string().uuid().optional(),
      messageId: z.string().uuid().optional()
    });

    const validated = schema.parse(body);

    const result = await translationService.translateChat({
      tenantId: user.tenantId,
      ...validated
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Chat error:', error);
    return c.json({ error: error.message || 'Chat translation failed' }, 500);
  }
});

/**
 * POST /translation/email
 * Translate email
 */
translation.post('/email', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      subject: z.string(),
      body: z.string(),
      customerLanguage: z.string(),
      agentLanguage: z.string().default('en'),
      direction: z.enum(['inbound', 'outbound'])
    });

    const validated = schema.parse(body);

    const result = await translationService.translateEmail({
      tenantId: user.tenantId,
      ...validated
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Email error:', error);
    return c.json({ error: error.message || 'Email translation failed' }, 500);
  }
});

// =========================================
// VOICE TRANSLATION
// =========================================

/**
 * POST /translation/voice/start
 * Start voice translation session
 */
translation.post('/voice/start', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      callId: z.string().uuid(),
      agentLanguage: z.string().default('en'),
      customerLanguage: z.string()
    });

    const validated = schema.parse(body);

    const result = await translationService.startVoiceSession({
      tenantId: user.tenantId,
      callId: validated.callId,
      agentId: user.id,
      agentLanguage: validated.agentLanguage,
      customerLanguage: validated.customerLanguage
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Voice start error:', error);
    return c.json({ error: error.message || 'Failed to start voice translation' }, 500);
  }
});

/**
 * POST /translation/voice/:sessionId/process
 * Process voice segment
 */
translation.post('/voice/:sessionId/process', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();

    const schema = z.object({
      audioData: z.string(), // Base64 encoded audio
      direction: z.enum(['customer', 'agent'])
    });

    const validated = schema.parse(body);

    const result = await translationService.processVoiceSegment({
      sessionId,
      audioData: validated.audioData,
      direction: validated.direction
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Voice process error:', error);
    return c.json({ error: error.message || 'Failed to process voice segment' }, 500);
  }
});

/**
 * POST /translation/voice/:sessionId/end
 * End voice translation session
 */
translation.post('/voice/:sessionId/end', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');

    const result = await translationService.endVoiceSession(sessionId);

    return c.json(result);
  } catch (error) {
    console.error('[Translation] Voice end error:', error);
    return c.json({ error: error.message || 'Failed to end voice session' }, 500);
  }
});

// =========================================
// TENANT SETTINGS
// =========================================

/**
 * GET /translation/settings
 * Get tenant translation settings
 */
translation.get('/settings', async (c) => {
  try {
    const user = c.get('user');

    const result = await db.query(`
      SELECT * FROM tenant_translation_settings
      WHERE tenant_id = $1
    `, [user.tenantId]);

    if (result.rows.length === 0) {
      return c.json({
        success: true,
        data: {
          translation_enabled: false,
          default_language: 'en',
          auto_detect: true,
          provider_priority: ['google', 'aws', 'deepl'],
          channel_settings: {
            sms: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
            chat: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
            email: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: false },
            voice: { enabled: false, real_time_translation: false },
            whatsapp: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true },
            social: { enabled: false, auto_translate_inbound: true, auto_translate_outbound: true }
          }
        }
      });
    }

    return c.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[Translation] Get settings error:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

/**
 * PUT /translation/settings
 * Update tenant translation settings
 */
translation.put('/settings', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      translation_enabled: z.boolean().optional(),
      default_language: z.string().optional(),
      auto_detect: z.boolean().optional(),
      provider_priority: z.array(z.string()).optional(),
      channel_settings: z.object({
        sms: z.object({
          enabled: z.boolean(),
          auto_translate_inbound: z.boolean(),
          auto_translate_outbound: z.boolean()
        }).optional(),
        chat: z.object({
          enabled: z.boolean(),
          auto_translate_inbound: z.boolean(),
          auto_translate_outbound: z.boolean()
        }).optional(),
        email: z.object({
          enabled: z.boolean(),
          auto_translate_inbound: z.boolean(),
          auto_translate_outbound: z.boolean()
        }).optional(),
        voice: z.object({
          enabled: z.boolean(),
          real_time_translation: z.boolean()
        }).optional(),
        whatsapp: z.object({
          enabled: z.boolean(),
          auto_translate_inbound: z.boolean(),
          auto_translate_outbound: z.boolean()
        }).optional(),
        social: z.object({
          enabled: z.boolean(),
          auto_translate_inbound: z.boolean(),
          auto_translate_outbound: z.boolean()
        }).optional()
      }).optional(),
      voice_settings: z.object({
        stt_provider: z.string(),
        tts_provider: z.string(),
        real_time_enabled: z.boolean(),
        transcript_translation: z.boolean()
      }).optional(),
      monthly_budget: z.number().optional()
    });

    const validated = schema.parse(body);

    // Upsert settings
    const result = await db.query(`
      INSERT INTO tenant_translation_settings (
        tenant_id, translation_enabled, default_language, auto_detect,
        provider_priority, channel_settings, voice_settings, monthly_budget
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id) DO UPDATE SET
        translation_enabled = COALESCE(EXCLUDED.translation_enabled, tenant_translation_settings.translation_enabled),
        default_language = COALESCE(EXCLUDED.default_language, tenant_translation_settings.default_language),
        auto_detect = COALESCE(EXCLUDED.auto_detect, tenant_translation_settings.auto_detect),
        provider_priority = COALESCE(EXCLUDED.provider_priority, tenant_translation_settings.provider_priority),
        channel_settings = tenant_translation_settings.channel_settings || COALESCE(EXCLUDED.channel_settings, '{}')::jsonb,
        voice_settings = tenant_translation_settings.voice_settings || COALESCE(EXCLUDED.voice_settings, '{}')::jsonb,
        monthly_budget = COALESCE(EXCLUDED.monthly_budget, tenant_translation_settings.monthly_budget),
        updated_at = NOW()
      RETURNING *
    `, [
      user.tenantId,
      validated.translation_enabled ?? true,
      validated.default_language ?? 'en',
      validated.auto_detect ?? true,
      JSON.stringify(validated.provider_priority || ['google', 'aws', 'deepl']),
      JSON.stringify(validated.channel_settings || {}),
      JSON.stringify(validated.voice_settings || {}),
      validated.monthly_budget || null
    ]);

    return c.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Update settings error:', error);
    return c.json({ error: error.message || 'Failed to update settings' }, 500);
  }
});

// =========================================
// GLOSSARY MANAGEMENT
// =========================================

/**
 * GET /translation/glossary
 * Get tenant glossary terms
 */
translation.get('/glossary', async (c) => {
  try {
    const user = c.get('user');

    const result = await db.query(`
      SELECT * FROM translation_glossary
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY source_language, target_language, source_term
    `, [user.tenantId]);

    return c.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[Translation] Get glossary error:', error);
    return c.json({ error: 'Failed to get glossary' }, 500);
  }
});

/**
 * POST /translation/glossary
 * Add glossary term
 */
translation.post('/glossary', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      source_term: z.string().min(1).max(500),
      source_language: z.string().length(2),
      target_term: z.string().min(1).max(500),
      target_language: z.string().length(2),
      category: z.string().max(100).optional(),
      case_sensitive: z.boolean().optional()
    });

    const validated = schema.parse(body);

    const result = await db.query(`
      INSERT INTO translation_glossary (
        tenant_id, source_term, source_language, target_term, target_language,
        category, case_sensitive
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, source_term, source_language, target_language)
      DO UPDATE SET
        target_term = EXCLUDED.target_term,
        category = EXCLUDED.category,
        case_sensitive = EXCLUDED.case_sensitive,
        updated_at = NOW()
      RETURNING *
    `, [
      user.tenantId,
      validated.source_term,
      validated.source_language,
      validated.target_term,
      validated.target_language,
      validated.category || null,
      validated.case_sensitive || false
    ]);

    return c.json({ success: true, data: result.rows[0] }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Add glossary error:', error);
    return c.json({ error: error.message || 'Failed to add glossary term' }, 500);
  }
});

/**
 * DELETE /translation/glossary/:id
 * Delete glossary term
 */
translation.delete('/glossary/:id', requireRole(['admin', 'supervisor']), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    await db.query(`
      UPDATE translation_glossary
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [id, user.tenantId]);

    return c.json({ success: true, message: 'Glossary term deleted' });
  } catch (error) {
    console.error('[Translation] Delete glossary error:', error);
    return c.json({ error: 'Failed to delete glossary term' }, 500);
  }
});

// =========================================
// USAGE & ANALYTICS
// =========================================

/**
 * GET /translation/usage
 * Get translation usage statistics
 */
translation.get('/usage', async (c) => {
  try {
    const user = c.get('user');
    const days = parseInt(c.req.query('days') || '30');

    const result = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as translations,
        SUM(source_text_length) as total_characters,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
        SUM(cost_cents) / 100.0 as total_cost,
        AVG(latency_ms) as avg_latency,
        provider,
        channel
      FROM translation_log
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
        AND success = true
      GROUP BY DATE(created_at), provider, channel
      ORDER BY date DESC
    `, [user.tenantId]);

    // Summary
    const summary = await db.query(`
      SELECT
        COUNT(*) as total_translations,
        SUM(source_text_length) as total_characters,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100 as cache_hit_rate,
        SUM(cost_cents) / 100.0 as total_cost
      FROM translation_log
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
        AND success = true
    `, [user.tenantId]);

    return c.json({
      success: true,
      data: {
        summary: summary.rows[0],
        breakdown: result.rows
      }
    });
  } catch (error) {
    console.error('[Translation] Usage error:', error);
    return c.json({ error: 'Failed to get usage statistics' }, 500);
  }
});

// =========================================
// ADMIN ROUTES (Platform Level)
// =========================================

/**
 * GET /translation/providers
 * List all translation providers
 */
translation.get('/providers', async (c) => {
  try {
    const providers = await translationService.getProviders();
    return c.json({ success: true, data: providers });
  } catch (error) {
    console.error('[Translation] Get providers error:', error);
    return c.json({ error: 'Failed to get providers' }, 500);
  }
});

/**
 * GET /translation/credentials
 * Get platform credentials (admin only)
 */
translation.get('/credentials', requireRole(['admin']), async (c) => {
  try {
    const credentials = await translationService.getPlatformCredentials();

    // Mask sensitive data
    const maskedCredentials = credentials.map(cred => ({
      ...cred,
      credentials: '***ENCRYPTED***'
    }));

    return c.json({ success: true, data: maskedCredentials });
  } catch (error) {
    console.error('[Translation] Get credentials error:', error);
    return c.json({ error: 'Failed to get credentials' }, 500);
  }
});

/**
 * POST /translation/credentials
 * Add platform credentials (admin only)
 */
translation.post('/credentials', requireRole(['admin']), async (c) => {
  try {
    const body = await c.req.json();

    const schema = z.object({
      name: z.string().min(1).max(100),
      provider: z.string(),
      credentials: z.object({}).passthrough(),
      monthly_limit: z.number().int().min(0).optional(),
      is_default: z.boolean().optional()
    });

    const validated = schema.parse(body);

    const result = await translationService.addPlatformCredentials({
      name: validated.name,
      providerName: validated.provider,
      credentials: validated.credentials,
      monthlyLimit: validated.monthly_limit || 0,
      isDefault: validated.is_default || false
    });

    return c.json({
      success: true,
      data: { ...result, credentials: '***ENCRYPTED***' }
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[Translation] Add credentials error:', error);
    return c.json({ error: error.message || 'Failed to add credentials' }, 500);
  }
});

/**
 * POST /translation/credentials/:id/test
 * Test credentials
 */
translation.post('/credentials/:id/test', requireRole(['admin']), async (c) => {
  try {
    const id = c.req.param('id');

    const result = await translationService.testCredentials(id);

    return c.json(result);
  } catch (error) {
    console.error('[Translation] Test credentials error:', error);
    return c.json({ success: false, error: error.message || 'Test failed' }, 500);
  }
});

/**
 * DELETE /translation/credentials/:id
 * Delete credentials
 */
translation.delete('/credentials/:id', requireRole(['admin']), async (c) => {
  try {
    const id = c.req.param('id');

    await db.query(`
      DELETE FROM platform_translation_credentials WHERE id = $1
    `, [id]);

    return c.json({ success: true, message: 'Credentials deleted' });
  } catch (error) {
    console.error('[Translation] Delete credentials error:', error);
    return c.json({ error: 'Failed to delete credentials' }, 500);
  }
});

/**
 * GET /translation/health
 * Get provider health status
 */
translation.get('/health', async (c) => {
  try {
    const result = await db.query(`
      SELECT
        pc.id,
        pc.name,
        tp.name as provider_name,
        tp.display_name,
        pc.health_status,
        pc.last_health_check,
        pc.avg_latency_ms,
        pc.error_rate
      FROM platform_translation_credentials pc
      JOIN translation_providers tp ON tp.id = pc.provider_id
      WHERE pc.is_active = true
    `);

    return c.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[Translation] Health error:', error);
    return c.json({ error: 'Failed to get health status' }, 500);
  }
});

/**
 * GET /translation/usage/admin
 * Get platform-wide usage statistics (admin only)
 */
translation.get('/usage/admin', requireRole(['admin']), async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '30');
    const groupBy = c.req.query('groupBy') || 'provider';

    const stats = await translationService.getUsageStats({ days, groupBy });

    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Translation] Admin usage error:', error);
    return c.json({ error: 'Failed to get usage statistics' }, 500);
  }
});

export default translation;
