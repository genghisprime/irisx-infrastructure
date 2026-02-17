/**
 * Admin AI Voice Management Routes
 * Platform-level voice provider and credential management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import pool from '../db/connection.js';

const adminAIVoice = new Hono();

// ============================================
// Voice Providers Management
// ============================================
adminAIVoice.get('/providers', async (c) => {
    try {
        const result = await pool.query(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM ai_voice_platform_credentials pc WHERE pc.provider_id = p.id) as credential_count,
                   (SELECT COUNT(*) FROM ai_voice_tenant_credentials tc WHERE tc.provider_id = p.id) as tenant_credential_count,
                   (SELECT COUNT(*) FROM ai_voice_assistants a WHERE a.tts_provider_id = p.id OR a.stt_provider_id = p.id) as usage_count
            FROM ai_voice_providers p
            ORDER BY p.display_name
        `);
        return c.json({ providers: result.rows });
    } catch (error) {
        console.error('List voice providers error:', error);
        return c.json({ error: 'Failed to list providers' }, 500);
    }
});

const createProviderSchema = z.object({
    provider_name: z.string().min(1).max(50),
    display_name: z.string().min(1).max(100),
    provider_type: z.enum(['tts', 'stt', 'both']),
    api_endpoint: z.string().url().optional(),
    supported_languages: z.array(z.string()).optional(),
    supported_voices: z.array(z.any()).optional(),
    features: z.any().optional(),
    pricing_model: z.any().optional()
});

adminAIVoice.post('/providers', zValidator('json', createProviderSchema), async (c) => {
    try {
        const data = c.req.valid('json');

        const result = await pool.query(`
            INSERT INTO ai_voice_providers (
                provider_name, display_name, provider_type, api_endpoint,
                supported_languages, supported_voices, features, pricing_model
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            data.provider_name, data.display_name, data.provider_type, data.api_endpoint,
            JSON.stringify(data.supported_languages || []),
            JSON.stringify(data.supported_voices || []),
            JSON.stringify(data.features || {}),
            JSON.stringify(data.pricing_model || {})
        ]);

        return c.json({ provider: result.rows[0] }, 201);
    } catch (error) {
        console.error('Create voice provider error:', error);
        return c.json({ error: 'Failed to create provider' }, 500);
    }
});

adminAIVoice.put('/providers/:id', zValidator('json', createProviderSchema.partial()), async (c) => {
    try {
        const providerId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const updates = [];
        const values = [providerId];
        let paramCount = 1;

        for (const [key, value] of Object.entries(data)) {
            paramCount++;
            const dbValue = typeof value === 'object' ? JSON.stringify(value) : value;
            updates.push(`${key} = $${paramCount}`);
            values.push(dbValue);
        }

        if (updates.length === 0) {
            return c.json({ error: 'No updates provided' }, 400);
        }

        updates.push('updated_at = NOW()');

        const result = await pool.query(`
            UPDATE ai_voice_providers SET ${updates.join(', ')} WHERE id = $1 RETURNING *
        `, values);

        return c.json({ provider: result.rows[0] });
    } catch (error) {
        console.error('Update voice provider error:', error);
        return c.json({ error: 'Failed to update provider' }, 500);
    }
});

adminAIVoice.patch('/providers/:id/toggle', async (c) => {
    try {
        const providerId = parseInt(c.req.param('id'));

        const result = await pool.query(`
            UPDATE ai_voice_providers SET is_active = NOT is_active, updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [providerId]);

        return c.json({ provider: result.rows[0] });
    } catch (error) {
        console.error('Toggle voice provider error:', error);
        return c.json({ error: 'Failed to toggle provider' }, 500);
    }
});

// ============================================
// Platform Credentials
// ============================================
adminAIVoice.get('/providers/:id/credentials', async (c) => {
    try {
        const providerId = parseInt(c.req.param('id'));

        const result = await pool.query(`
            SELECT id, credential_key, environment, is_active, created_at, updated_at
            FROM ai_voice_platform_credentials
            WHERE provider_id = $1
            ORDER BY credential_key
        `, [providerId]);

        // Don't return actual values for security
        return c.json({ credentials: result.rows });
    } catch (error) {
        console.error('List credentials error:', error);
        return c.json({ error: 'Failed to list credentials' }, 500);
    }
});

const saveCredentialSchema = z.object({
    credential_key: z.string().min(1).max(100),
    credential_value: z.string().min(1),
    environment: z.enum(['production', 'staging', 'development']).optional()
});

adminAIVoice.post('/providers/:id/credentials', zValidator('json', saveCredentialSchema), async (c) => {
    try {
        const providerId = parseInt(c.req.param('id'));
        const { credential_key, credential_value, environment } = c.req.valid('json');

        const result = await pool.query(`
            INSERT INTO ai_voice_platform_credentials (provider_id, credential_key, credential_value, environment)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (provider_id, credential_key, environment) DO UPDATE SET
                credential_value = $3, updated_at = NOW()
            RETURNING id, credential_key, environment, is_active, created_at, updated_at
        `, [providerId, credential_key, credential_value, environment || 'production']);

        return c.json({ credential: result.rows[0] }, 201);
    } catch (error) {
        console.error('Save credential error:', error);
        return c.json({ error: 'Failed to save credential' }, 500);
    }
});

adminAIVoice.delete('/credentials/:id', async (c) => {
    try {
        const credentialId = parseInt(c.req.param('id'));

        await pool.query(`DELETE FROM ai_voice_platform_credentials WHERE id = $1`, [credentialId]);
        return c.json({ success: true });
    } catch (error) {
        console.error('Delete credential error:', error);
        return c.json({ error: 'Failed to delete credential' }, 500);
    }
});

// ============================================
// All Assistants (Cross-Tenant)
// ============================================
adminAIVoice.get('/assistants', async (c) => {
    try {
        const { tenant_id, status, limit, offset } = c.req.query();

        let query = `
            SELECT a.*, t.name as tenant_name,
                   tp.display_name as tts_provider_name,
                   sp.display_name as stt_provider_name,
                   (SELECT COUNT(*) FROM ai_voice_conversations vc WHERE vc.assistant_id = a.id) as conversation_count
            FROM ai_voice_assistants a
            LEFT JOIN tenants t ON a.tenant_id = t.id
            LEFT JOIN ai_voice_providers tp ON a.tts_provider_id = tp.id
            LEFT JOIN ai_voice_providers sp ON a.stt_provider_id = sp.id
            WHERE 1=1
        `;
        const params = [];

        if (tenant_id) {
            params.push(parseInt(tenant_id));
            query += ` AND a.tenant_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND a.status = $${params.length}`;
        }

        query += ' ORDER BY a.created_at DESC';

        if (limit) {
            params.push(parseInt(limit));
            query += ` LIMIT $${params.length}`;
        }
        if (offset) {
            params.push(parseInt(offset));
            query += ` OFFSET $${params.length}`;
        }

        const result = await pool.query(query, params);
        return c.json({ assistants: result.rows });
    } catch (error) {
        console.error('List all assistants error:', error);
        return c.json({ error: 'Failed to list assistants' }, 500);
    }
});

// ============================================
// All Conversations (Cross-Tenant)
// ============================================
adminAIVoice.get('/conversations', async (c) => {
    try {
        const { tenant_id, assistant_id, status, start_date, end_date, limit, offset } = c.req.query();

        let query = `
            SELECT vc.*, t.name as tenant_name, a.name as assistant_name
            FROM ai_voice_conversations vc
            LEFT JOIN tenants t ON vc.tenant_id = t.id
            LEFT JOIN ai_voice_assistants a ON vc.assistant_id = a.id
            WHERE 1=1
        `;
        const params = [];

        if (tenant_id) {
            params.push(parseInt(tenant_id));
            query += ` AND vc.tenant_id = $${params.length}`;
        }
        if (assistant_id) {
            params.push(parseInt(assistant_id));
            query += ` AND vc.assistant_id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND vc.status = $${params.length}`;
        }
        if (start_date) {
            params.push(start_date);
            query += ` AND vc.started_at >= $${params.length}`;
        }
        if (end_date) {
            params.push(end_date);
            query += ` AND vc.started_at <= $${params.length}`;
        }

        query += ' ORDER BY vc.started_at DESC';

        if (limit) {
            params.push(parseInt(limit));
            query += ` LIMIT $${params.length}`;
        }
        if (offset) {
            params.push(parseInt(offset));
            query += ` OFFSET $${params.length}`;
        }

        const result = await pool.query(query, params);
        return c.json({ conversations: result.rows });
    } catch (error) {
        console.error('List all conversations error:', error);
        return c.json({ error: 'Failed to list conversations' }, 500);
    }
});

// ============================================
// Usage Analytics (Platform-Wide)
// ============================================
adminAIVoice.get('/usage', async (c) => {
    try {
        const { start_date, end_date, tenant_id } = c.req.query();

        const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = end_date || new Date().toISOString().split('T')[0];

        let query = `
            SELECT
                usage_date,
                SUM(tts_characters) as tts_characters,
                SUM(stt_seconds) as stt_seconds,
                SUM(llm_tokens) as llm_tokens,
                SUM(total_calls) as total_calls,
                SUM(successful_calls) as successful_calls,
                SUM(total_cost) as total_cost
            FROM ai_voice_usage
            WHERE usage_date BETWEEN $1 AND $2
        `;
        const params = [startDate, endDate];

        if (tenant_id) {
            params.push(parseInt(tenant_id));
            query += ` AND tenant_id = $${params.length}`;
        }

        query += ' GROUP BY usage_date ORDER BY usage_date';

        const result = await pool.query(query, params);

        // Also get totals
        let totalsQuery = `
            SELECT
                SUM(tts_characters) as total_tts_characters,
                SUM(stt_seconds) as total_stt_seconds,
                SUM(llm_tokens) as total_llm_tokens,
                SUM(total_calls) as total_calls,
                SUM(successful_calls) as total_successful_calls,
                SUM(total_cost) as total_cost
            FROM ai_voice_usage
            WHERE usage_date BETWEEN $1 AND $2
        `;
        if (tenant_id) {
            totalsQuery += ` AND tenant_id = $3`;
        }

        const totals = await pool.query(totalsQuery, params);

        return c.json({
            daily: result.rows,
            totals: totals.rows[0]
        });
    } catch (error) {
        console.error('Get platform usage error:', error);
        return c.json({ error: 'Failed to get usage' }, 500);
    }
});

// ============================================
// Analytics Summary
// ============================================
adminAIVoice.get('/analytics/summary', async (c) => {
    try {
        // Get overall stats
        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM ai_voice_assistants WHERE status = 'active') as active_assistants,
                (SELECT COUNT(*) FROM ai_voice_assistants) as total_assistants,
                (SELECT COUNT(*) FROM ai_voice_conversations WHERE started_at >= NOW() - INTERVAL '24 hours') as conversations_24h,
                (SELECT COUNT(*) FROM ai_voice_conversations WHERE started_at >= NOW() - INTERVAL '7 days') as conversations_7d,
                (SELECT COUNT(*) FROM ai_voice_conversations WHERE status = 'completed' AND started_at >= NOW() - INTERVAL '24 hours') as completed_24h,
                (SELECT COUNT(*) FROM ai_voice_conversations WHERE status = 'transferred' AND started_at >= NOW() - INTERVAL '24 hours') as transferred_24h,
                (SELECT AVG(duration_seconds) FROM ai_voice_conversations WHERE started_at >= NOW() - INTERVAL '24 hours') as avg_duration_24h
        `);

        // Top assistants by usage
        const topAssistants = await pool.query(`
            SELECT a.id, a.name, a.tenant_id, t.name as tenant_name,
                   COUNT(vc.id) as conversation_count
            FROM ai_voice_assistants a
            LEFT JOIN ai_voice_conversations vc ON a.id = vc.assistant_id AND vc.started_at >= NOW() - INTERVAL '7 days'
            LEFT JOIN tenants t ON a.tenant_id = t.id
            GROUP BY a.id, a.name, a.tenant_id, t.name
            ORDER BY conversation_count DESC
            LIMIT 10
        `);

        // Provider usage breakdown
        const providerUsage = await pool.query(`
            SELECT p.display_name, p.provider_type,
                   SUM(CASE WHEN u.tts_provider_id = p.id THEN u.tts_characters ELSE 0 END) as tts_characters,
                   SUM(CASE WHEN u.stt_provider_id = p.id THEN u.stt_seconds ELSE 0 END) as stt_seconds
            FROM ai_voice_providers p
            LEFT JOIN ai_voice_usage u ON u.tts_provider_id = p.id OR u.stt_provider_id = p.id
            WHERE u.usage_date >= NOW() - INTERVAL '7 days'
            GROUP BY p.id, p.display_name, p.provider_type
        `);

        return c.json({
            stats: stats.rows[0],
            top_assistants: topAssistants.rows,
            provider_usage: providerUsage.rows
        });
    } catch (error) {
        console.error('Get analytics summary error:', error);
        return c.json({ error: 'Failed to get analytics' }, 500);
    }
});

// ============================================
// Prompt Templates Management
// ============================================
adminAIVoice.get('/prompt-templates', async (c) => {
    try {
        const result = await pool.query(`
            SELECT * FROM ai_voice_prompt_templates
            WHERE is_system = true
            ORDER BY template_category, template_name
        `);
        return c.json({ templates: result.rows });
    } catch (error) {
        console.error('List system templates error:', error);
        return c.json({ error: 'Failed to list templates' }, 500);
    }
});

const systemTemplateSchema = z.object({
    template_name: z.string().min(1).max(100),
    template_category: z.enum(['greeting', 'clarification', 'confirmation', 'error', 'transfer', 'goodbye', 'hold', 'callback', 'custom']),
    template_text: z.string().min(1),
    variables: z.array(z.string()).optional(),
    language: z.string().optional()
});

adminAIVoice.post('/prompt-templates', zValidator('json', systemTemplateSchema), async (c) => {
    try {
        const data = c.req.valid('json');

        const result = await pool.query(`
            INSERT INTO ai_voice_prompt_templates (
                tenant_id, template_name, template_category, template_text, variables, language, is_system
            ) VALUES (NULL, $1, $2, $3, $4, $5, true)
            RETURNING *
        `, [data.template_name, data.template_category, data.template_text, JSON.stringify(data.variables || []), data.language || 'en-US']);

        return c.json({ template: result.rows[0] }, 201);
    } catch (error) {
        console.error('Create system template error:', error);
        return c.json({ error: 'Failed to create template' }, 500);
    }
});

adminAIVoice.put('/prompt-templates/:id', zValidator('json', systemTemplateSchema.partial()), async (c) => {
    try {
        const templateId = parseInt(c.req.param('id'));
        const data = c.req.valid('json');

        const updates = [];
        const values = [templateId];
        let paramCount = 1;

        for (const [key, value] of Object.entries(data)) {
            paramCount++;
            const dbValue = Array.isArray(value) ? JSON.stringify(value) : value;
            updates.push(`${key} = $${paramCount}`);
            values.push(dbValue);
        }

        if (updates.length === 0) {
            return c.json({ error: 'No updates provided' }, 400);
        }

        updates.push('updated_at = NOW()');

        const result = await pool.query(`
            UPDATE ai_voice_prompt_templates SET ${updates.join(', ')}
            WHERE id = $1 AND is_system = true
            RETURNING *
        `, values);

        return c.json({ template: result.rows[0] });
    } catch (error) {
        console.error('Update system template error:', error);
        return c.json({ error: 'Failed to update template' }, 500);
    }
});

export default adminAIVoice;
