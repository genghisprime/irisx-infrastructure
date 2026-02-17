/**
 * Knowledge Base API Routes
 * Customer-facing routes for knowledge base access
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as kbService from '../services/knowledge-base.js';

const kb = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  description: z.string().optional(),
  icon: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
  parent_id: z.number().optional(),
  sort_order: z.number().optional(),
  is_public: z.boolean().optional(),
  is_internal: z.boolean().optional(),
});

const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().max(500).optional(),
  summary: z.string().optional(),
  content_html: z.string().min(1),
  category_id: z.number().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  is_public: z.boolean().optional(),
  is_internal: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  meta_title: z.string().max(255).optional(),
  meta_description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    type: z.string().optional(),
    size: z.number().optional(),
  })).optional(),
});

const searchSchema = z.object({
  q: z.string().min(1),
  category_id: z.string().optional(),
  limit: z.string().optional(),
});

// =============================================================================
// Middleware
// =============================================================================

kb.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('tenant_id', tenantId);
  await next();
});

// =============================================================================
// CATEGORY ROUTES
// =============================================================================

/**
 * GET /v1/knowledge/categories
 * Get all categories
 */
kb.get('/categories', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const includePrivate = c.req.query('include_private') !== 'false';

    const categories = await kbService.getCategories(tenantId, { includePrivate });

    // Build hierarchy
    const rootCategories = categories.filter(cat => !cat.parent_id);
    const categoryMap = new Map(categories.map(cat => [cat.id, { ...cat, children: [] }]));

    categories.forEach(cat => {
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id).children.push(categoryMap.get(cat.id));
      }
    });

    return c.json({
      success: true,
      categories: rootCategories.map(cat => categoryMap.get(cat.id)),
      total: categories.length,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/knowledge/categories/:idOrSlug
 * Get category by ID or slug
 */
kb.get('/categories/:idOrSlug', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const idOrSlug = c.req.param('idOrSlug');

    const category = await kbService.getCategory(tenantId, idOrSlug);

    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    // Get articles in this category
    const { articles } = await kbService.getArticles(tenantId, {
      categoryId: category.id,
      status: 'published',
      limit: 50,
    });

    return c.json({
      success: true,
      category,
      articles,
    });
  } catch (error) {
    console.error('Get category error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/knowledge/categories
 * Create a category
 */
kb.post('/categories', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const body = await c.req.json();

    const validation = createCategorySchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const category = await kbService.createCategory(tenantId, validation.data, agentId);

    return c.json({
      success: true,
      category,
    }, 201);
  } catch (error) {
    console.error('Create category error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/knowledge/categories/:id
 * Update a category
 */
kb.put('/categories/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const categoryId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const category = await kbService.updateCategory(tenantId, categoryId, body, agentId);

    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error('Update category error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/knowledge/categories/:id
 * Delete a category
 */
kb.delete('/categories/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const categoryId = parseInt(c.req.param('id'));

    const deleted = await kbService.deleteCategory(tenantId, categoryId);

    if (!deleted) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// ARTICLE ROUTES
// =============================================================================

/**
 * GET /v1/knowledge/articles
 * Get articles with filters
 */
kb.get('/articles', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const status = c.req.query('status') || 'published';
    const categoryId = c.req.query('category_id');
    const isPublic = c.req.query('is_public');
    const isFeatured = c.req.query('featured') === 'true';
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const { articles, total } = await kbService.getArticles(tenantId, {
      status,
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      isPublic: isPublic ? isPublic === 'true' : undefined,
      isFeatured,
      search,
      limit,
      offset,
    });

    return c.json({
      success: true,
      articles,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + articles.length < total,
      },
    });
  } catch (error) {
    console.error('Get articles error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/knowledge/articles/popular
 * Get popular articles
 */
kb.get('/articles/popular', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const limit = parseInt(c.req.query('limit') || '10');
    const isPublic = c.req.query('is_public') === 'true';

    const articles = await kbService.getPopularArticles(tenantId, { limit, isPublic });

    return c.json({
      success: true,
      articles,
    });
  } catch (error) {
    console.error('Get popular articles error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/knowledge/articles/:idOrSlug
 * Get article by ID or slug
 */
kb.get('/articles/:idOrSlug', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const idOrSlug = c.req.param('idOrSlug');
    const viewerType = c.get('agent_id') ? 'agent' : 'anonymous';
    const viewerId = c.get('agent_id') || c.get('contact_id');

    const article = await kbService.getArticle(tenantId, idOrSlug, {
      incrementView: true,
      viewerType,
      viewerId,
    });

    if (!article) {
      return c.json({ error: 'Article not found' }, 404);
    }

    // Get related articles
    const relatedArticles = await kbService.getRelatedArticles(tenantId, article.id);

    return c.json({
      success: true,
      article,
      relatedArticles,
    });
  } catch (error) {
    console.error('Get article error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/knowledge/articles
 * Create an article
 */
kb.post('/articles', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');

    if (!agentId) {
      return c.json({ error: 'Agent authentication required' }, 401);
    }

    const body = await c.req.json();

    const validation = createArticleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const article = await kbService.createArticle(tenantId, validation.data, agentId);

    return c.json({
      success: true,
      article,
    }, 201);
  } catch (error) {
    console.error('Create article error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/knowledge/articles/:id
 * Update an article
 */
kb.put('/articles/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const articleId = parseInt(c.req.param('id'));

    if (!agentId) {
      return c.json({ error: 'Agent authentication required' }, 401);
    }

    const body = await c.req.json();

    const article = await kbService.updateArticle(tenantId, articleId, body, agentId);

    return c.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error('Update article error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/knowledge/articles/:id
 * Delete an article
 */
kb.delete('/articles/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const articleId = parseInt(c.req.param('id'));

    const deleted = await kbService.deleteArticle(tenantId, articleId);

    if (!deleted) {
      return c.json({ error: 'Article not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete article error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/knowledge/articles/:id/versions
 * Get article version history
 */
kb.get('/articles/:id/versions', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const articleId = parseInt(c.req.param('id'));

    const versions = await kbService.getArticleVersions(tenantId, articleId);

    return c.json({
      success: true,
      versions,
    });
  } catch (error) {
    console.error('Get article versions error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/knowledge/articles/:id/analytics
 * Get article analytics
 */
kb.get('/articles/:id/analytics', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const articleId = parseInt(c.req.param('id'));
    const days = parseInt(c.req.query('days') || '30');

    const analytics = await kbService.getArticleAnalytics(tenantId, articleId, days);

    return c.json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Get article analytics error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/knowledge/articles/:id/helpful
 * Vote on article helpfulness
 */
kb.post('/articles/:id/helpful', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const articleId = parseInt(c.req.param('id'));
    const { helpful } = await c.req.json();

    const viewerType = c.get('agent_id') ? 'agent' : 'anonymous';
    const viewerId = c.get('agent_id') || c.get('contact_id');

    await kbService.voteHelpful(tenantId, articleId, helpful === true, viewerId, viewerType);

    return c.json({ success: true });
  } catch (error) {
    console.error('Vote helpful error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// SEARCH ROUTES
// =============================================================================

/**
 * GET /v1/knowledge/search
 * Search articles
 */
kb.get('/search', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const query = c.req.query('q');
    const categoryId = c.req.query('category_id');
    const isPublic = c.req.query('is_public');
    const limit = parseInt(c.req.query('limit') || '20');

    if (!query || query.length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    const results = await kbService.searchArticles(tenantId, query, {
      categoryId: categoryId ? parseInt(categoryId) : undefined,
      isPublic: isPublic ? isPublic === 'true' : undefined,
      limit,
      searcherType: c.get('agent_id') ? 'agent' : 'anonymous',
    });

    return c.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// TAGS ROUTES
// =============================================================================

/**
 * GET /v1/knowledge/tags
 * Get all tags
 */
kb.get('/tags', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    const tags = await kbService.getTags(tenantId);

    return c.json({
      success: true,
      tags,
    });
  } catch (error) {
    console.error('Get tags error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default kb;
