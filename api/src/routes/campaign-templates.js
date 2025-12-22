/**
 * Campaign Templates Routes
 * Manage reusable templates for campaigns
 */

const { Hono } = require('hono');
const { z } = require('zod');
const templateService = require('../services/campaign-templates');

const router = new Hono();

// ===== TEMPLATE CRUD =====

// Create a new template
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const schema = z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      type: z.enum(['sms', 'email', 'voice']),
      category: z.string().max(100).optional(),
      subject: z.string().max(255).optional(),
      body: z.string().min(1),
      variables: z.array(z.string()).optional(),
      isShared: z.boolean().optional()
    });

    const data = schema.parse(body);
    const tenantId = c.get('tenantId');

    // Validate body
    const errors = templateService.validateBody(data.body, data.type);
    if (errors.length > 0) {
      return c.json({ success: false, errors }, 400);
    }

    const template = await templateService.create(tenantId, data);

    return c.json({
      success: true,
      data: template
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Create template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// List templates
router.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const query = c.req.query();

    const result = await templateService.list(tenantId, {
      type: query.type,
      category: query.category,
      search: query.search,
      isShared: query.isShared === 'true' ? true : query.isShared === 'false' ? false : undefined,
      limit: parseInt(query.limit) || 50,
      offset: parseInt(query.offset) || 0,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    });

    return c.json({
      success: true,
      data: result.templates,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.templates.length < result.total
      }
    });
  } catch (error) {
    console.error('List templates error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get template by ID
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const template = await templateService.getById(id, tenantId);

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update template
router.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const schema = z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      type: z.enum(['sms', 'email', 'voice']).optional(),
      category: z.string().max(100).optional(),
      subject: z.string().max(255).optional(),
      body: z.string().min(1).optional(),
      variables: z.array(z.string()).optional(),
      isShared: z.boolean().optional()
    });

    const data = schema.parse(body);

    // Validate body if provided
    if (data.body) {
      const type = data.type || (await templateService.getById(id, tenantId))?.type;
      const errors = templateService.validateBody(data.body, type);
      if (errors.length > 0) {
        return c.json({ success: false, errors }, 400);
      }
    }

    const template = await templateService.update(id, tenantId, data);

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: template
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Update template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete template
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const template = await templateService.delete(id, tenantId);

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Delete template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== TEMPLATE ACTIONS =====

// Duplicate template
router.post('/:id/duplicate', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');
    const body = await c.req.json().catch(() => ({}));

    const template = await templateService.duplicate(id, tenantId, body.name);

    if (!template) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: template
    }, 201);
  } catch (error) {
    console.error('Duplicate template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Render template with data
router.post('/:id/render', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const rendered = await templateService.render(id, tenantId, body);

    if (!rendered) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: rendered
    });
  } catch (error) {
    console.error('Render template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Preview template with sample data
router.get('/:id/preview', async (c) => {
  try {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const preview = await templateService.preview(id, tenantId);

    if (!preview) {
      return c.json({ success: false, error: 'Template not found' }, 404);
    }

    return c.json({
      success: true,
      data: preview
    });
  } catch (error) {
    console.error('Preview template error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== METADATA ENDPOINTS =====

// Get categories
router.get('/metadata/categories', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const categories = await templateService.getCategories(tenantId);

    return c.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get stats
router.get('/metadata/stats', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const stats = await templateService.getStats(tenantId);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get most used templates
router.get('/metadata/most-used', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit')) || 10;

    const templates = await templateService.getMostUsed(tenantId, limit);

    return c.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get most used error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== IMPORT/EXPORT =====

// Import templates
router.post('/import', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const schema = z.object({
      templates: z.array(z.object({
        name: z.string(),
        type: z.enum(['sms', 'email', 'voice']),
        body: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        subject: z.string().optional(),
        variables: z.array(z.string()).optional(),
        isShared: z.boolean().optional()
      }))
    });

    const data = schema.parse(body);
    const result = await templateService.importTemplates(tenantId, data.templates);

    return c.json({
      success: true,
      data: {
        imported: result.imported.length,
        errors: result.errors
      }
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Import templates error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Export templates
router.get('/export', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const ids = c.req.query('ids')?.split(',').map(Number).filter(n => !isNaN(n));

    const templates = await templateService.exportTemplates(tenantId, ids);

    return c.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Export templates error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

module.exports = router;
