/**
 * Semantic Search Routes
 * Vector-based similarity search API
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import semanticSearch from '../services/semantic-search.js';

const router = new Hono();

// ===========================================
// SEARCH ENDPOINTS
// ===========================================

/**
 * POST /v1/search/calls
 * Search call transcripts semantically
 */
router.post('/calls', zValidator('json', z.object({
  query: z.string().min(3).max(1000),
  limit: z.number().min(1).max(100).default(10),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  agent_id: z.string().uuid().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { query, limit, similarity_threshold, date_from, date_to, agent_id } = c.req.valid('json');

  const results = await semanticSearch.searchCalls(tenantId, query, {
    limit,
    similarityThreshold: similarity_threshold,
    dateFrom: date_from,
    dateTo: date_to,
    agentId: agent_id
  });

  return c.json(results);
});

/**
 * POST /v1/search/knowledge
 * Search knowledge base semantically
 */
router.post('/knowledge', zValidator('json', z.object({
  query: z.string().min(3).max(1000),
  limit: z.number().min(1).max(100).default(10),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  source_types: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { query, limit, similarity_threshold, source_types, tags } = c.req.valid('json');

  const results = await semanticSearch.searchKnowledge(tenantId, query, {
    limit,
    similarityThreshold: similarity_threshold,
    sourceTypes: source_types,
    tags
  });

  return c.json(results);
});

/**
 * POST /v1/search/contacts
 * Find similar contacts semantically
 */
router.post('/contacts', zValidator('json', z.object({
  query: z.string().min(3).max(1000),
  limit: z.number().min(1).max(100).default(10)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { query, limit } = c.req.valid('json');

  const results = await semanticSearch.findSimilarContacts(tenantId, query, { limit });

  return c.json(results);
});

/**
 * POST /v1/search/all
 * Search across all indexed content
 */
router.post('/all', zValidator('json', z.object({
  query: z.string().min(3).max(1000),
  limit: z.number().min(1).max(100).default(10),
  similarity_threshold: z.number().min(0).max(1).default(0.7),
  include_types: z.array(z.enum(['calls', 'knowledge', 'contacts'])).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { query, limit, similarity_threshold, include_types } = c.req.valid('json');

  const results = await semanticSearch.searchAll(tenantId, query, {
    limit,
    similarityThreshold: similarity_threshold,
    includeTypes: include_types || ['calls', 'knowledge', 'contacts']
  });

  return c.json(results);
});

// ===========================================
// INDEXING ENDPOINTS
// ===========================================

/**
 * POST /v1/search/index/call
 * Index a call transcript
 */
router.post('/index/call', zValidator('json', z.object({
  call_id: z.string().uuid(),
  transcript: z.string().min(1),
  summary: z.string().optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { call_id, transcript, summary } = c.req.valid('json');

  const result = await semanticSearch.indexCallTranscript(call_id, tenantId, transcript, summary);

  return c.json(result, 201);
});

/**
 * POST /v1/search/index/knowledge
 * Index a knowledge base article
 */
router.post('/index/knowledge', zValidator('json', z.object({
  source_type: z.enum(['article', 'faq', 'script', 'product']),
  source_id: z.string().uuid().optional(),
  title: z.string().max(255).optional(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { source_type, source_id, title, content, tags } = c.req.valid('json');

  const result = await semanticSearch.indexKnowledgeArticle(tenantId, {
    sourceType: source_type,
    sourceId: source_id,
    title,
    content,
    tags
  });

  return c.json(result, 201);
});

/**
 * POST /v1/search/index/contact
 * Index a contact for similarity search
 */
router.post('/index/contact', zValidator('json', z.object({
  contact_id: z.string().uuid(),
  name: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  industry: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  interests: z.array(z.string()).optional()
})), async (c) => {
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');

  const result = await semanticSearch.indexContact(data.contact_id, tenantId, data);

  return c.json(result, 201);
});

/**
 * DELETE /v1/search/index/knowledge/:sourceId
 * Remove knowledge article from index
 */
router.delete('/index/knowledge/:sourceId', async (c) => {
  const { sourceId } = c.req.param();

  await db.query(`
    UPDATE knowledge_embeddings SET is_active = false WHERE source_id = $1
  `, [sourceId]);

  return c.json({ success: true });
});

// ===========================================
// ANALYTICS & MAINTENANCE
// ===========================================

/**
 * GET /v1/search/analytics
 * Get search analytics
 */
router.get('/analytics', zValidator('query', z.object({
  days: z.coerce.number().min(1).max(90).default(30)
})), async (c) => {
  const tenantId = c.get('tenantId');
  const { days } = c.req.valid('query');

  const analytics = await semanticSearch.getSearchAnalytics(tenantId, { days });

  return c.json(analytics);
});

/**
 * GET /v1/search/stats
 * Get embedding statistics
 */
router.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  const stats = await semanticSearch.getEmbeddingStats(isAdmin ? null : tenantId);

  return c.json(stats);
});

/**
 * POST /v1/search/reindex (admin only)
 * Reindex all content for tenant
 */
router.post('/reindex', async (c) => {
  const tenantId = c.get('tenantId');
  const isAdmin = c.get('isAdmin');

  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const targetTenant = body.tenant_id || tenantId;

  const result = await semanticSearch.reindexTenant(targetTenant);

  return c.json(result);
});

/**
 * POST /v1/search/embedding
 * Generate embedding for text (utility endpoint)
 */
router.post('/embedding', zValidator('json', z.object({
  text: z.string().min(1).max(8191)
})), async (c) => {
  const { text } = c.req.valid('json');

  const result = await semanticSearch.generateEmbedding(text);

  return c.json({
    embedding: result.embedding,
    dimensions: result.embedding.length,
    tokenCount: result.tokenCount
  });
});

// Import db for direct queries
import db from '../db.js';

export default router;
