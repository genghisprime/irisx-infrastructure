/**
 * Knowledge Base Service
 * Handles article management, search, and analytics
 */

import pool from '../db/connection.js';

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Get all categories for a tenant
 */
export async function getCategories(tenantId, options = {}) {
  const { includePrivate = true, parentId = null } = options;

  let query = `
    SELECT
      id, name, slug, description, icon, color,
      parent_id, sort_order, is_public, is_internal,
      article_count, created_at, updated_at
    FROM knowledge_categories
    WHERE tenant_id = $1
  `;
  const params = [tenantId];

  if (!includePrivate) {
    query += ` AND is_public = true`;
  }

  if (parentId !== undefined) {
    if (parentId === null) {
      query += ` AND parent_id IS NULL`;
    } else {
      params.push(parentId);
      query += ` AND parent_id = $${params.length}`;
    }
  }

  query += ` ORDER BY sort_order, name`;

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get category by ID or slug
 */
export async function getCategory(tenantId, idOrSlug) {
  const isNumeric = /^\d+$/.test(String(idOrSlug));

  const { rows } = await pool.query(
    `SELECT * FROM knowledge_categories
     WHERE tenant_id = $1 AND ${isNumeric ? 'id' : 'slug'} = $2`,
    [tenantId, idOrSlug]
  );

  return rows[0] || null;
}

/**
 * Create a category
 */
export async function createCategory(tenantId, data, createdBy) {
  const {
    name, slug, description, icon, color,
    parent_id, sort_order, is_public, is_internal
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO knowledge_categories
     (tenant_id, name, slug, description, icon, color, parent_id, sort_order, is_public, is_internal, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tenantId, name, slug || generateSlug(name), description, icon, color,
      parent_id, sort_order || 0, is_public ?? false, is_internal ?? true, createdBy
    ]
  );

  return rows[0];
}

/**
 * Update a category
 */
export async function updateCategory(tenantId, categoryId, data, updatedBy) {
  const fields = [];
  const values = [tenantId, categoryId];
  let paramCount = 2;

  const allowedFields = ['name', 'slug', 'description', 'icon', 'color', 'parent_id', 'sort_order', 'is_public', 'is_internal'];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      paramCount++;
      fields.push(`${field} = $${paramCount}`);
      values.push(data[field]);
    }
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  paramCount++;
  fields.push(`updated_by = $${paramCount}`);
  values.push(updatedBy);

  fields.push(`updated_at = NOW()`);

  const { rows } = await pool.query(
    `UPDATE knowledge_categories
     SET ${fields.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  return rows[0];
}

/**
 * Delete a category
 */
export async function deleteCategory(tenantId, categoryId) {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_categories WHERE tenant_id = $1 AND id = $2`,
    [tenantId, categoryId]
  );
  return rowCount > 0;
}

// =============================================================================
// ARTICLES
// =============================================================================

/**
 * Get articles with filters
 */
export async function getArticles(tenantId, options = {}) {
  const {
    status = 'published',
    categoryId,
    isPublic,
    isFeatured,
    search,
    limit = 20,
    offset = 0
  } = options;

  let query = `
    SELECT
      ka.id, ka.title, ka.slug, ka.summary,
      ka.status, ka.published_at,
      ka.is_public, ka.is_internal, ka.is_featured,
      ka.view_count, ka.helpful_yes, ka.helpful_no,
      ka.version, ka.created_at, ka.updated_at,
      kc.id AS category_id, kc.name AS category_name, kc.slug AS category_slug,
      a.name AS author_name
    FROM knowledge_articles ka
    LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
    LEFT JOIN agents a ON ka.author_id = a.id
    WHERE ka.tenant_id = $1
  `;
  const params = [tenantId];
  let paramCount = 1;

  if (status && status !== 'all') {
    paramCount++;
    query += ` AND ka.status = $${paramCount}`;
    params.push(status);
  }

  if (categoryId) {
    paramCount++;
    query += ` AND ka.category_id = $${paramCount}`;
    params.push(categoryId);
  }

  if (isPublic !== undefined) {
    paramCount++;
    query += ` AND ka.is_public = $${paramCount}`;
    params.push(isPublic);
  }

  if (isFeatured) {
    query += ` AND ka.is_featured = true`;
  }

  if (search) {
    paramCount++;
    query += ` AND (
      ka.title ILIKE $${paramCount} OR
      ka.summary ILIKE $${paramCount} OR
      ka.content_text ILIKE $${paramCount}
    )`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY ka.updated_at DESC`;
  query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const { rows } = await pool.query(query, params);

  // Get total count
  let countQuery = `SELECT COUNT(*) FROM knowledge_articles ka WHERE tenant_id = $1`;
  const countParams = [tenantId];

  if (status && status !== 'all') {
    countQuery += ` AND status = $2`;
    countParams.push(status);
  }

  const countResult = await pool.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].count);

  return { articles: rows, total };
}

/**
 * Get article by ID or slug
 */
export async function getArticle(tenantId, idOrSlug, options = {}) {
  const { incrementView = false, viewerType, viewerId } = options;
  const isNumeric = /^\d+$/.test(String(idOrSlug));

  const { rows } = await pool.query(
    `SELECT
      ka.*,
      kc.name AS category_name, kc.slug AS category_slug,
      a.name AS author_name
     FROM knowledge_articles ka
     LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
     LEFT JOIN agents a ON ka.author_id = a.id
     WHERE ka.tenant_id = $1 AND ${isNumeric ? 'ka.id' : 'ka.slug'} = $2`,
    [tenantId, idOrSlug]
  );

  const article = rows[0];

  if (article && incrementView) {
    // Increment view count
    await pool.query(
      `UPDATE knowledge_articles SET view_count = view_count + 1 WHERE id = $1`,
      [article.id]
    );

    // Log view
    await pool.query(
      `INSERT INTO knowledge_article_views (article_id, tenant_id, viewer_type, viewer_id)
       VALUES ($1, $2, $3, $4)`,
      [article.id, tenantId, viewerType || 'anonymous', viewerId]
    );
  }

  return article;
}

/**
 * Create an article
 */
export async function createArticle(tenantId, data, authorId) {
  const {
    title, slug, summary, content_html, content_text,
    category_id, status, is_public, is_internal, is_featured,
    meta_title, meta_description, keywords, attachments
  } = data;

  const articleSlug = slug || generateSlug(title);

  const { rows } = await pool.query(
    `INSERT INTO knowledge_articles
     (tenant_id, category_id, title, slug, summary, content_html, content_text,
      status, is_public, is_internal, is_featured,
      meta_title, meta_description, keywords, attachments,
      author_id, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      tenantId, category_id, title, articleSlug, summary, content_html, content_text || stripHtml(content_html),
      status || 'draft', is_public ?? false, is_internal ?? true, is_featured ?? false,
      meta_title, meta_description, keywords || [], JSON.stringify(attachments || []),
      authorId, status === 'published' ? new Date() : null
    ]
  );

  const article = rows[0];

  // Create initial version
  await pool.query(
    `INSERT INTO knowledge_article_versions
     (article_id, tenant_id, version_number, title, summary, content_html, content_text, change_summary, created_by)
     VALUES ($1, $2, 1, $3, $4, $5, $6, 'Initial version', $7)`,
    [article.id, tenantId, title, summary, content_html, content_text || stripHtml(content_html), authorId]
  );

  return article;
}

/**
 * Update an article
 */
export async function updateArticle(tenantId, articleId, data, editorId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current article
    const currentResult = await client.query(
      `SELECT * FROM knowledge_articles WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, articleId]
    );

    if (currentResult.rows.length === 0) {
      throw new Error('Article not found');
    }

    const current = currentResult.rows[0];
    const newVersion = current.version + 1;

    // Build update
    const fields = [];
    const values = [tenantId, articleId];
    let paramCount = 2;

    const allowedFields = [
      'title', 'slug', 'summary', 'content_html', 'content_text',
      'category_id', 'status', 'is_public', 'is_internal', 'is_featured',
      'meta_title', 'meta_description', 'keywords', 'attachments'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        paramCount++;
        if (field === 'attachments') {
          fields.push(`${field} = $${paramCount}::jsonb`);
          values.push(JSON.stringify(data[field]));
        } else if (field === 'keywords') {
          fields.push(`${field} = $${paramCount}`);
          values.push(data[field]);
        } else {
          fields.push(`${field} = $${paramCount}`);
          values.push(data[field]);
        }
      }
    }

    // Handle content_text
    if (data.content_html && !data.content_text) {
      paramCount++;
      fields.push(`content_text = $${paramCount}`);
      values.push(stripHtml(data.content_html));
    }

    // Handle published_at
    if (data.status === 'published' && current.status !== 'published') {
      fields.push(`published_at = NOW()`);
    }

    // Version and editor
    paramCount++;
    fields.push(`version = $${paramCount}`);
    values.push(newVersion);

    paramCount++;
    fields.push(`last_editor_id = $${paramCount}`);
    values.push(editorId);

    fields.push(`updated_at = NOW()`);

    const { rows } = await client.query(
      `UPDATE knowledge_articles
       SET ${fields.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    const article = rows[0];

    // Create version history
    await client.query(
      `INSERT INTO knowledge_article_versions
       (article_id, tenant_id, version_number, title, summary, content_html, content_text, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        articleId, tenantId, newVersion,
        article.title, article.summary, article.content_html, article.content_text,
        data.change_summary || `Updated by editor`,
        editorId
      ]
    );

    await client.query('COMMIT');
    return article;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete an article
 */
export async function deleteArticle(tenantId, articleId) {
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_articles WHERE tenant_id = $1 AND id = $2`,
    [tenantId, articleId]
  );
  return rowCount > 0;
}

/**
 * Search articles using full-text search
 */
export async function searchArticles(tenantId, query, options = {}) {
  const { isPublic, categoryId, limit = 20 } = options;

  const { rows } = await pool.query(
    `SELECT * FROM search_knowledge_articles($1, $2, $3, $4, $5)`,
    [tenantId, query, isPublic, categoryId, limit]
  );

  // Log search
  await pool.query(
    `INSERT INTO knowledge_search_log (tenant_id, query, results_count, searcher_type)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, query, rows.length, options.searcherType || 'anonymous']
  );

  return rows;
}

/**
 * Record helpfulness vote
 */
export async function voteHelpful(tenantId, articleId, isHelpful, viewerId, viewerType) {
  // Update article counts
  if (isHelpful) {
    await pool.query(
      `UPDATE knowledge_articles SET helpful_yes = helpful_yes + 1 WHERE tenant_id = $1 AND id = $2`,
      [tenantId, articleId]
    );
  } else {
    await pool.query(
      `UPDATE knowledge_articles SET helpful_no = helpful_no + 1 WHERE tenant_id = $1 AND id = $2`,
      [tenantId, articleId]
    );
  }

  // Update view record if exists
  await pool.query(
    `UPDATE knowledge_article_views
     SET was_helpful = $1
     WHERE article_id = $2 AND viewer_id = $3 AND viewer_type = $4
       AND was_helpful IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [isHelpful, articleId, viewerId, viewerType]
  );

  return true;
}

/**
 * Get article versions
 */
export async function getArticleVersions(tenantId, articleId) {
  const { rows } = await pool.query(
    `SELECT kav.*, a.name AS editor_name
     FROM knowledge_article_versions kav
     LEFT JOIN agents a ON kav.created_by = a.id
     WHERE kav.tenant_id = $1 AND kav.article_id = $2
     ORDER BY kav.version_number DESC`,
    [tenantId, articleId]
  );
  return rows;
}

/**
 * Get related articles
 */
export async function getRelatedArticles(tenantId, articleId, limit = 5) {
  const { rows } = await pool.query(
    `SELECT
      ka.id, ka.title, ka.slug, ka.summary, ka.view_count,
      kra.relation_type
     FROM knowledge_related_articles kra
     JOIN knowledge_articles ka ON kra.related_article_id = ka.id
     WHERE kra.article_id = $1 AND ka.tenant_id = $2 AND ka.status = 'published'
     ORDER BY kra.sort_order
     LIMIT $3`,
    [articleId, tenantId, limit]
  );
  return rows;
}

/**
 * Get popular articles
 */
export async function getPopularArticles(tenantId, options = {}) {
  const { limit = 10, isPublic, days = 30 } = options;

  const { rows } = await pool.query(
    `SELECT
      ka.id, ka.title, ka.slug, ka.summary, ka.view_count,
      ka.helpful_yes, ka.helpful_no,
      kc.name AS category_name
     FROM knowledge_articles ka
     LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
     WHERE ka.tenant_id = $1
       AND ka.status = 'published'
       AND ($2 IS NULL OR ka.is_public = $2)
     ORDER BY ka.view_count DESC
     LIMIT $3`,
    [tenantId, isPublic, limit]
  );
  return rows;
}

/**
 * Get article analytics
 */
export async function getArticleAnalytics(tenantId, articleId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
      DATE(created_at) AS date,
      COUNT(*) AS views,
      COUNT(CASE WHEN was_helpful = true THEN 1 END) AS helpful_yes,
      COUNT(CASE WHEN was_helpful = false THEN 1 END) AS helpful_no,
      AVG(read_time_seconds)::INTEGER AS avg_read_time
     FROM knowledge_article_views
     WHERE article_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    [articleId, tenantId]
  );
  return rows;
}

// =============================================================================
// TAGS
// =============================================================================

/**
 * Get all tags
 */
export async function getTags(tenantId) {
  const { rows } = await pool.query(
    `SELECT * FROM knowledge_tags WHERE tenant_id = $1 ORDER BY name`,
    [tenantId]
  );
  return rows;
}

/**
 * Add tags to article
 */
export async function addTagsToArticle(tenantId, articleId, tagNames) {
  for (const name of tagNames) {
    const slug = generateSlug(name);

    // Create or get tag
    const { rows } = await pool.query(
      `INSERT INTO knowledge_tags (tenant_id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET name = $2
       RETURNING id`,
      [tenantId, name, slug]
    );

    // Link to article
    await pool.query(
      `INSERT INTO knowledge_article_tags (article_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [articleId, rows[0].id]
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  // Categories
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,

  // Articles
  getArticles,
  getArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  searchArticles,
  voteHelpful,
  getArticleVersions,
  getRelatedArticles,
  getPopularArticles,
  getArticleAnalytics,

  // Tags
  getTags,
  addTagsToArticle,
};
