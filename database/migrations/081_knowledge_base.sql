-- Migration: 081_knowledge_base.sql
-- Description: Knowledge Base System for agent support and customer self-service
-- Date: 2026-02-16
--
-- Features:
-- - Article management with rich text content
-- - Category organization (hierarchical)
-- - Full-text search
-- - Article versioning
-- - View/helpfulness analytics
-- - Agent-facing and customer-facing support

-- =============================================================================
-- KNOWLEDGE BASE CATEGORIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Category Info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),                 -- Icon name (e.g., 'book', 'help-circle')
  color VARCHAR(20),                 -- Hex color for UI

  -- Hierarchy
  parent_id INTEGER REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,

  -- Visibility
  is_public BOOLEAN DEFAULT false,   -- Visible to customers
  is_internal BOOLEAN DEFAULT true,  -- Visible to agents

  -- Metadata
  article_count INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES agents(id),
  updated_by INTEGER REFERENCES agents(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_knowledge_categories_tenant ON knowledge_categories(tenant_id);
CREATE INDEX idx_knowledge_categories_parent ON knowledge_categories(parent_id);
CREATE INDEX idx_knowledge_categories_public ON knowledge_categories(tenant_id, is_public) WHERE is_public = true;

-- =============================================================================
-- KNOWLEDGE BASE ARTICLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES knowledge_categories(id) ON DELETE SET NULL,

  -- Article Identity
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  summary TEXT,                      -- Short description/excerpt

  -- Content
  content_html TEXT NOT NULL,        -- Rich text HTML content
  content_text TEXT,                 -- Plain text for search

  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- draft, published, archived
  published_at TIMESTAMPTZ,

  -- Visibility
  is_public BOOLEAN DEFAULT false,   -- Visible to customers
  is_internal BOOLEAN DEFAULT true,  -- Visible to agents
  is_featured BOOLEAN DEFAULT false, -- Highlight on home

  -- SEO & Search
  meta_title VARCHAR(255),
  meta_description TEXT,
  keywords TEXT[],                   -- Array of keywords

  -- Attachments
  attachments JSONB DEFAULT '[]',    -- [{name, url, type, size}]

  -- Analytics
  view_count INTEGER DEFAULT 0,
  helpful_yes INTEGER DEFAULT 0,
  helpful_no INTEGER DEFAULT 0,
  avg_read_time_seconds INTEGER,

  -- Versioning
  version INTEGER DEFAULT 1,
  current_version_id INTEGER,        -- Points to knowledge_article_versions

  -- Author/Editor
  author_id INTEGER REFERENCES agents(id),
  last_editor_id INTEGER REFERENCES agents(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_knowledge_articles_tenant ON knowledge_articles(tenant_id);
CREATE INDEX idx_knowledge_articles_category ON knowledge_articles(category_id);
CREATE INDEX idx_knowledge_articles_status ON knowledge_articles(tenant_id, status);
CREATE INDEX idx_knowledge_articles_public ON knowledge_articles(tenant_id, is_public, status) WHERE is_public = true AND status = 'published';
CREATE INDEX idx_knowledge_articles_featured ON knowledge_articles(tenant_id, is_featured) WHERE is_featured = true;

-- Full-text search index
CREATE INDEX idx_knowledge_articles_search ON knowledge_articles
  USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, '') || ' ' || coalesce(summary, '')));

-- =============================================================================
-- ARTICLE VERSIONS (History)
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_article_versions (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Version Info
  version_number INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  content_html TEXT NOT NULL,
  content_text TEXT,

  -- Changes
  change_summary TEXT,               -- Brief description of changes

  -- Author
  created_by INTEGER REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(article_id, version_number)
);

CREATE INDEX idx_knowledge_article_versions_article ON knowledge_article_versions(article_id);

-- =============================================================================
-- ARTICLE TAGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_tags (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  article_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS knowledge_article_tags (
  article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES knowledge_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- =============================================================================
-- ARTICLE ANALYTICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_article_views (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Viewer Info
  viewer_type VARCHAR(20) NOT NULL,  -- 'agent', 'customer', 'anonymous'
  viewer_id INTEGER,                 -- agent_id or contact_id
  session_id VARCHAR(100),

  -- Context
  source VARCHAR(50),                -- 'search', 'category', 'related', 'direct'
  search_query TEXT,                 -- If found via search
  referrer_url TEXT,

  -- Engagement
  read_time_seconds INTEGER,
  scroll_depth_percent INTEGER,
  was_helpful BOOLEAN,               -- null = not voted, true/false = voted

  -- Metadata
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_article_views_article ON knowledge_article_views(article_id);
CREATE INDEX idx_knowledge_article_views_date ON knowledge_article_views(tenant_id, created_at);

-- =============================================================================
-- RELATED ARTICLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_related_articles (
  article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  related_article_id INTEGER NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  relation_type VARCHAR(20) DEFAULT 'related', -- related, see_also, prerequisite
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY (article_id, related_article_id)
);

-- =============================================================================
-- SEARCH HISTORY (for analytics and suggestions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_search_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  searcher_type VARCHAR(20),         -- 'agent', 'customer', 'anonymous'
  searcher_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_search_log_tenant ON knowledge_search_log(tenant_id, created_at);
CREATE INDEX idx_knowledge_search_log_query ON knowledge_search_log(tenant_id, query);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Update article count in categories
CREATE OR REPLACE FUNCTION update_category_article_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE knowledge_categories
    SET article_count = (
      SELECT COUNT(*) FROM knowledge_articles
      WHERE category_id = NEW.category_id AND status = 'published'
    )
    WHERE id = NEW.category_id;
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    UPDATE knowledge_categories
    SET article_count = (
      SELECT COUNT(*) FROM knowledge_articles
      WHERE category_id = OLD.category_id AND status = 'published'
    )
    WHERE id = OLD.category_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_category_article_count
AFTER INSERT OR UPDATE OR DELETE ON knowledge_articles
FOR EACH ROW EXECUTE FUNCTION update_category_article_count();

-- Full-text search function
CREATE OR REPLACE FUNCTION search_knowledge_articles(
  p_tenant_id INTEGER,
  p_query TEXT,
  p_is_public BOOLEAN DEFAULT NULL,
  p_category_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id INTEGER,
  title VARCHAR(500),
  slug VARCHAR(500),
  summary TEXT,
  category_name VARCHAR(255),
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ka.id,
    ka.title,
    ka.slug,
    ka.summary,
    kc.name AS category_name,
    ts_rank(
      to_tsvector('english', coalesce(ka.title, '') || ' ' || coalesce(ka.content_text, '') || ' ' || coalesce(ka.summary, '')),
      plainto_tsquery('english', p_query)
    ) AS rank
  FROM knowledge_articles ka
  LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
  WHERE ka.tenant_id = p_tenant_id
    AND ka.status = 'published'
    AND (p_is_public IS NULL OR ka.is_public = p_is_public)
    AND (p_category_id IS NULL OR ka.category_id = p_category_id)
    AND to_tsvector('english', coalesce(ka.title, '') || ' ' || coalesce(ka.content_text, '') || ' ' || coalesce(ka.summary, ''))
        @@ plainto_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DEFAULT CATEGORIES
-- =============================================================================

-- Note: Categories are per-tenant, so no default inserts here
-- Each tenant creates their own category structure

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE knowledge_categories IS 'Hierarchical categories for organizing knowledge base articles';
COMMENT ON TABLE knowledge_articles IS 'Knowledge base articles with rich text content';
COMMENT ON TABLE knowledge_article_versions IS 'Version history for knowledge base articles';
COMMENT ON TABLE knowledge_tags IS 'Tags for labeling and filtering articles';
COMMENT ON TABLE knowledge_article_views IS 'Article view analytics and helpfulness votes';
COMMENT ON TABLE knowledge_search_log IS 'Search query logging for analytics and suggestions';

-- =============================================================================
-- Migration Complete
-- =============================================================================
-- Tables: 7
-- Functions: 2
-- Triggers: 1
