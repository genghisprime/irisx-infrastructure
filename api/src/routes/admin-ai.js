/**
 * Admin AI Engine Routes
 * Platform-level AI provider and credential management
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const router = new Hono();

// ============== Platform Credentials ==============

router.get('/credentials', async (c) => {
  try {
    const db = c.get('db');

    const result = await db.query(`
      SELECT pac.*, ap.name as provider_name, ap.display_name as provider_display_name
      FROM platform_ai_credentials pac
      JOIN ai_providers ap ON pac.provider_id = ap.id
      ORDER BY ap.display_name, pac.is_default DESC
    `);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get platform credentials error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const credentialSchema = z.object({
  providerId: z.number(),
  name: z.string(),
  credentials: z.record(z.any()),
  isDefault: z.boolean().optional()
});

router.post('/credentials', zValidator('json', credentialSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const db = c.get('db');

    // If setting as default, unset other defaults for this provider
    if (body.isDefault) {
      await db.query(`
        UPDATE platform_ai_credentials SET is_default = false
        WHERE provider_id = $1
      `, [body.providerId]);
    }

    const result = await db.query(`
      INSERT INTO platform_ai_credentials (provider_id, name, credentials, is_default)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [body.providerId, body.name, body.credentials, body.isDefault || false]);

    return c.json({
      success: true,
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    console.error('Create platform credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.put('/credentials/:id', zValidator('json', credentialSchema.partial()), async (c) => {
  try {
    const credentialId = c.req.param('id');
    const body = c.req.valid('json');
    const db = c.get('db');

    // Get current credential
    const current = await db.query('SELECT * FROM platform_ai_credentials WHERE id = $1', [credentialId]);
    if (current.rows.length === 0) {
      return c.json({ success: false, error: 'Credential not found' }, 404);
    }

    // If setting as default, unset other defaults for this provider
    if (body.isDefault) {
      await db.query(`
        UPDATE platform_ai_credentials SET is_default = false
        WHERE provider_id = $1 AND id != $2
      `, [current.rows[0].provider_id, credentialId]);
    }

    const updates = [];
    const params = [credentialId];
    let paramIndex = 2;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(body.name);
    }
    if (body.credentials !== undefined) {
      updates.push(`credentials = $${paramIndex++}`);
      params.push(body.credentials);
    }
    if (body.isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      params.push(body.isDefault);
    }

    if (updates.length > 0) {
      await db.query(`
        UPDATE platform_ai_credentials
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1
      `, params);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Update platform credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/credentials/:id', async (c) => {
  try {
    const credentialId = c.req.param('id');
    const db = c.get('db');

    await db.query('DELETE FROM platform_ai_credentials WHERE id = $1', [credentialId]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete platform credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Test credential connectivity
router.post('/credentials/:id/test', async (c) => {
  try {
    const credentialId = c.req.param('id');
    const db = c.get('db');

    const cred = await db.query(`
      SELECT pac.*, ap.name as provider_name
      FROM platform_ai_credentials pac
      JOIN ai_providers ap ON pac.provider_id = ap.id
      WHERE pac.id = $1
    `, [credentialId]);

    if (cred.rows.length === 0) {
      return c.json({ success: false, error: 'Credential not found' }, 404);
    }

    const { provider_name, credentials } = cred.rows[0];

    // Simple connectivity test based on provider
    let testResult = { success: false, message: 'Test not implemented for this provider' };

    try {
      switch (provider_name) {
        case 'openai':
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey: credentials.api_key });
          await openai.models.list();
          testResult = { success: true, message: 'Connection successful' };
          break;

        case 'anthropic':
          // Simple API test
          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': credentials.api_key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }]
            })
          });
          if (anthropicRes.ok) {
            testResult = { success: true, message: 'Connection successful' };
          } else {
            const error = await anthropicRes.json();
            testResult = { success: false, message: error.error?.message || 'Connection failed' };
          }
          break;

        default:
          testResult = { success: true, message: 'Credentials saved (test not available)' };
      }
    } catch (testError) {
      testResult = { success: false, message: testError.message };
    }

    return c.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    console.error('Test credential error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Provider Management ==============

router.get('/providers', async (c) => {
  try {
    const db = c.get('db');

    const result = await db.query(`
      SELECT ap.*,
        (SELECT COUNT(*) FROM ai_models am WHERE am.provider_id = ap.id AND am.is_active = true) as model_count,
        (SELECT COUNT(*) FROM platform_ai_credentials pac WHERE pac.provider_id = ap.id AND pac.is_active = true) as credential_count
      FROM ai_providers ap
      ORDER BY ap.display_name
    `);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get providers error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.put('/providers/:id', async (c) => {
  try {
    const providerId = c.req.param('id');
    const body = await c.req.json();
    const db = c.get('db');

    const updates = [];
    const params = [providerId];
    let paramIndex = 2;

    if (body.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(body.is_active);
    }
    if (body.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(body.display_name);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(body.description);
    }

    if (updates.length > 0) {
      await db.query(`
        UPDATE ai_providers
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1
      `, params);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Update provider error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Model Management ==============

router.get('/models', async (c) => {
  try {
    const db = c.get('db');

    const result = await db.query(`
      SELECT am.*, ap.name as provider_name, ap.display_name as provider_display_name
      FROM ai_models am
      JOIN ai_providers ap ON am.provider_id = ap.id
      ORDER BY ap.display_name, am.display_name
    `);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get models error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const modelSchema = z.object({
  providerId: z.number(),
  modelId: z.string(),
  displayName: z.string(),
  capabilities: z.array(z.string()),
  contextWindow: z.number().optional(),
  costPer1kInput: z.number().optional(),
  costPer1kOutput: z.number().optional(),
  qualityTier: z.enum(['economy', 'balanced', 'premium']).optional()
});

router.post('/models', zValidator('json', modelSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO ai_models (provider_id, model_id, display_name, capabilities, context_window, cost_per_1k_input, cost_per_1k_output, quality_tier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [body.providerId, body.modelId, body.displayName, body.capabilities,
        body.contextWindow, body.costPer1kInput, body.costPer1kOutput, body.qualityTier || 'balanced']);

    return c.json({
      success: true,
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    console.error('Create model error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.put('/models/:id', async (c) => {
  try {
    const modelId = c.req.param('id');
    const body = await c.req.json();
    const db = c.get('db');

    const updates = [];
    const params = [modelId];
    let paramIndex = 2;

    const fields = ['display_name', 'capabilities', 'context_window', 'cost_per_1k_input',
                    'cost_per_1k_output', 'quality_tier', 'is_active'];

    for (const field of fields) {
      const camelCase = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (body[camelCase] !== undefined || body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        params.push(body[camelCase] !== undefined ? body[camelCase] : body[field]);
      }
    }

    if (updates.length > 0) {
      await db.query(`
        UPDATE ai_models
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1
      `, params);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Update model error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/models/:id', async (c) => {
  try {
    const modelId = c.req.param('id');
    const db = c.get('db');

    await db.query('UPDATE ai_models SET is_active = false WHERE id = $1', [modelId]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete model error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== Usage Analytics ==============

router.get('/usage', async (c) => {
  try {
    const db = c.get('db');
    const startDate = c.req.query('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('end_date') || new Date().toISOString();

    // Usage by tenant
    const byTenant = await db.query(`
      SELECT
        t.name as tenant_name,
        COUNT(*) as request_count,
        SUM(aul.input_tokens) as total_input_tokens,
        SUM(aul.output_tokens) as total_output_tokens,
        SUM(aul.total_cost) as total_cost
      FROM ai_usage_log aul
      JOIN tenants t ON aul.tenant_id = t.id
      WHERE aul.created_at BETWEEN $1 AND $2
      GROUP BY t.id, t.name
      ORDER BY total_cost DESC
      LIMIT 20
    `, [startDate, endDate]);

    // Usage by model
    const byModel = await db.query(`
      SELECT
        am.model_id,
        ap.display_name as provider,
        aul.operation_type,
        COUNT(*) as request_count,
        SUM(aul.input_tokens) as total_input_tokens,
        SUM(aul.output_tokens) as total_output_tokens,
        SUM(aul.total_cost) as total_cost,
        AVG(aul.latency_ms) as avg_latency_ms
      FROM ai_usage_log aul
      JOIN ai_models am ON aul.model_id = am.id
      JOIN ai_providers ap ON am.provider_id = ap.id
      WHERE aul.created_at BETWEEN $1 AND $2
      GROUP BY am.model_id, ap.display_name, aul.operation_type
      ORDER BY total_cost DESC
    `, [startDate, endDate]);

    // Daily usage
    const daily = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as request_count,
        SUM(total_cost) as total_cost
      FROM ai_usage_log
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);

    return c.json({
      success: true,
      data: {
        byTenant: byTenant.rows,
        byModel: byModel.rows,
        daily: daily.rows
      }
    });
  } catch (error) {
    console.error('Get admin usage error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Recent activity
router.get('/activity', async (c) => {
  try {
    const db = c.get('db');
    const limit = parseInt(c.req.query('limit') || '50');

    const result = await db.query(`
      SELECT aul.*, t.name as tenant_name, am.model_id
      FROM ai_usage_log aul
      LEFT JOIN tenants t ON aul.tenant_id = t.id
      LEFT JOIN ai_models am ON aul.model_id = am.id
      ORDER BY aul.created_at DESC
      LIMIT $1
    `, [limit]);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get activity error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ============== System Templates ==============

router.get('/templates', async (c) => {
  try {
    const db = c.get('db');

    const result = await db.query(`
      SELECT * FROM ai_prompt_templates
      WHERE tenant_id IS NULL
      ORDER BY use_case, name
    `);

    return c.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get system templates error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

const templateSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  useCase: z.string(),
  systemPrompt: z.string(),
  userPromptTemplate: z.string().optional(),
  variables: z.record(z.any()).optional()
});

router.post('/templates', zValidator('json', templateSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    const db = c.get('db');

    const result = await db.query(`
      INSERT INTO ai_prompt_templates (tenant_id, name, display_name, use_case, system_prompt, user_prompt_template, variables)
      VALUES (NULL, $1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [body.name, body.displayName, body.useCase, body.systemPrompt,
        body.userPromptTemplate, body.variables || {}]);

    return c.json({
      success: true,
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    console.error('Create system template error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.put('/templates/:id', zValidator('json', templateSchema.partial()), async (c) => {
  try {
    const templateId = c.req.param('id');
    const body = c.req.valid('json');
    const db = c.get('db');

    const updates = [];
    const params = [templateId];
    let paramIndex = 2;

    if (body.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(body.displayName);
    }
    if (body.useCase !== undefined) {
      updates.push(`use_case = $${paramIndex++}`);
      params.push(body.useCase);
    }
    if (body.systemPrompt !== undefined) {
      updates.push(`system_prompt = $${paramIndex++}`);
      params.push(body.systemPrompt);
    }
    if (body.userPromptTemplate !== undefined) {
      updates.push(`user_prompt_template = $${paramIndex++}`);
      params.push(body.userPromptTemplate);
    }
    if (body.variables !== undefined) {
      updates.push(`variables = $${paramIndex++}`);
      params.push(body.variables);
    }

    if (updates.length > 0) {
      await db.query(`
        UPDATE ai_prompt_templates
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1 AND tenant_id IS NULL
      `, params);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Update system template error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

router.delete('/templates/:id', async (c) => {
  try {
    const templateId = c.req.param('id');
    const db = c.get('db');

    await db.query(`
      UPDATE ai_prompt_templates SET is_active = false
      WHERE id = $1 AND tenant_id IS NULL
    `, [templateId]);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete system template error:', error);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

export default router;
