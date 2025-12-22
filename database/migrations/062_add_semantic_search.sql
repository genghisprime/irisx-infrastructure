-- Semantic Search with pgvector
-- Migration: 062_add_semantic_search.sql

-- Enable pgvector extension (requires superuser or extension installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings for call transcripts
CREATE TABLE IF NOT EXISTS call_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES cdrs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Content that was embedded
    content_type VARCHAR(50) NOT NULL DEFAULT 'transcript', -- 'transcript', 'summary', 'notes'
    content_text TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0, -- For long transcripts split into chunks

    -- Vector embedding (1536 dimensions for OpenAI ada-002, 384 for smaller models)
    embedding vector(1536),

    -- Metadata
    model VARCHAR(50) DEFAULT 'text-embedding-ada-002',
    token_count INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Embeddings for knowledge base articles
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Source document
    source_type VARCHAR(50) NOT NULL, -- 'article', 'faq', 'script', 'product'
    source_id UUID, -- Reference to source table
    title VARCHAR(255),
    content_text TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0,

    -- Vector embedding
    embedding vector(1536),

    -- Metadata
    model VARCHAR(50) DEFAULT 'text-embedding-ada-002',
    token_count INTEGER,
    tags JSONB DEFAULT '[]',

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Embeddings for contacts/customers (for similarity search)
CREATE TABLE IF NOT EXISTS contact_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Combined profile text used for embedding
    profile_text TEXT NOT NULL,

    -- Vector embedding
    embedding vector(1536),

    model VARCHAR(50) DEFAULT 'text-embedding-ada-002',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(contact_id)
);

-- Search queries log (for analytics and improvement)
CREATE TABLE IF NOT EXISTS semantic_search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),

    query_text TEXT NOT NULL,
    query_embedding vector(1536),

    search_type VARCHAR(50) NOT NULL, -- 'calls', 'knowledge', 'contacts', 'all'
    result_count INTEGER,
    top_result_score FLOAT,

    execution_time_ms INTEGER,
    filters_applied JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create HNSW indexes for fast similarity search
-- HNSW (Hierarchical Navigable Small World) provides faster searches than IVFFlat

-- Index for call embeddings
CREATE INDEX IF NOT EXISTS idx_call_embeddings_vector
ON call_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for knowledge embeddings
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_vector
ON knowledge_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for contact embeddings
CREATE INDEX IF NOT EXISTS idx_contact_embeddings_vector
ON contact_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Regular indexes for filtering
CREATE INDEX IF NOT EXISTS idx_call_embeddings_tenant ON call_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_embeddings_call ON call_embeddings(call_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_tenant ON knowledge_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_source ON knowledge_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_contact_embeddings_tenant ON contact_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_semantic_search_logs_tenant ON semantic_search_logs(tenant_id, created_at);

-- Function to search similar calls
CREATE OR REPLACE FUNCTION search_similar_calls(
    p_tenant_id UUID,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE(
    call_id UUID,
    content_type VARCHAR(50),
    content_text TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.call_id,
        ce.content_type,
        ce.content_text,
        1 - (ce.embedding <=> p_query_embedding) AS similarity
    FROM call_embeddings ce
    WHERE ce.tenant_id = p_tenant_id
        AND (1 - (ce.embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY ce.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search knowledge base
CREATE OR REPLACE FUNCTION search_knowledge_base(
    p_tenant_id UUID,
    p_query_embedding vector(1536),
    p_source_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE(
    id UUID,
    source_type VARCHAR(50),
    source_id UUID,
    title VARCHAR(255),
    content_text TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ke.id,
        ke.source_type,
        ke.source_id,
        ke.title,
        ke.content_text,
        1 - (ke.embedding <=> p_query_embedding) AS similarity
    FROM knowledge_embeddings ke
    WHERE ke.tenant_id = p_tenant_id
        AND ke.is_active = true
        AND (p_source_types IS NULL OR ke.source_type = ANY(p_source_types))
        AND (1 - (ke.embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY ke.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar contacts
CREATE OR REPLACE FUNCTION find_similar_contacts(
    p_tenant_id UUID,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    contact_id UUID,
    profile_text TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.contact_id,
        ce.profile_text,
        1 - (ce.embedding <=> p_query_embedding) AS similarity
    FROM contact_embeddings ce
    WHERE ce.tenant_id = p_tenant_id
    ORDER BY ce.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE call_embeddings IS 'Vector embeddings for call transcripts and summaries';
COMMENT ON TABLE knowledge_embeddings IS 'Vector embeddings for knowledge base articles';
COMMENT ON TABLE contact_embeddings IS 'Vector embeddings for contact profiles';
COMMENT ON TABLE semantic_search_logs IS 'Log of semantic search queries for analytics';
