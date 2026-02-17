/**
 * Semantic Search Service
 * Vector-based similarity search using pgvector and OpenAI embeddings
 */

import db from '../db/connection.js';

class SemanticSearchService {
  constructor() {
    this.embeddingModel = 'text-embedding-ada-002';
    this.embeddingDimensions = 1536;
    this.chunkSize = 8000; // Characters per chunk
    this.chunkOverlap = 200;
    this.defaultSimilarityThreshold = 0.7;
  }

  // ===========================================
  // EMBEDDING GENERATION
  // ===========================================

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Clean and truncate text
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    const truncatedText = cleanedText.substring(0, 8191); // OpenAI limit

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: truncatedText,
        model: this.embeddingModel
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${error}`);
    }

    const result = await response.json();
    return {
      embedding: result.data[0].embedding,
      tokenCount: result.usage.total_tokens
    };
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Clean texts
    const cleanedTexts = texts.map(t => t.replace(/\s+/g, ' ').trim().substring(0, 8191));

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: cleanedTexts,
        model: this.embeddingModel
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${error}`);
    }

    const result = await response.json();
    return result.data.map((d, i) => ({
      text: cleanedTexts[i],
      embedding: d.embedding,
      index: d.index
    }));
  }

  /**
   * Split text into chunks for embedding
   */
  chunkText(text) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > start + this.chunkSize / 2) {
          end = breakPoint + 1;
        }
      }

      chunks.push({
        text: text.substring(start, end).trim(),
        startIndex: start,
        endIndex: end
      });

      start = end - this.chunkOverlap;
    }

    return chunks;
  }

  // ===========================================
  // CALL TRANSCRIPT EMBEDDINGS
  // ===========================================

  /**
   * Index a call transcript for semantic search
   */
  async indexCallTranscript(callId, tenantId, transcript, summary = null) {
    try {
      // Delete existing embeddings for this call
      await db.query(`
        DELETE FROM call_embeddings WHERE call_id = $1
      `, [callId]);

      const embeddings = [];

      // Embed transcript (chunked if long)
      const chunks = this.chunkText(transcript);

      for (let i = 0; i < chunks.length; i++) {
        const { embedding, tokenCount } = await this.generateEmbedding(chunks[i].text);

        const result = await db.query(`
          INSERT INTO call_embeddings (
            call_id, tenant_id, content_type, content_text, chunk_index,
            embedding, model, token_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          callId, tenantId, 'transcript', chunks[i].text, i,
          `[${embedding.join(',')}]`, this.embeddingModel, tokenCount
        ]);

        embeddings.push(result.rows[0].id);
      }

      // Embed summary if provided
      if (summary) {
        const { embedding, tokenCount } = await this.generateEmbedding(summary);

        const result = await db.query(`
          INSERT INTO call_embeddings (
            call_id, tenant_id, content_type, content_text, chunk_index,
            embedding, model, token_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          callId, tenantId, 'summary', summary, 0,
          `[${embedding.join(',')}]`, this.embeddingModel, tokenCount
        ]);

        embeddings.push(result.rows[0].id);
      }

      console.log(`[SemanticSearch] Indexed call ${callId} with ${embeddings.length} embeddings`);
      return { callId, embeddingIds: embeddings, chunks: chunks.length };

    } catch (error) {
      console.error(`[SemanticSearch] Error indexing call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Search call transcripts
   */
  async searchCalls(tenantId, query, options = {}) {
    const {
      limit = 10,
      similarityThreshold = this.defaultSimilarityThreshold,
      dateFrom,
      dateTo,
      agentId
    } = options;

    const startTime = Date.now();

    // Generate query embedding
    const { embedding } = await this.generateEmbedding(query);
    const embeddingString = `[${embedding.join(',')}]`;

    // Build query with optional filters
    let filterConditions = '';
    const params = [tenantId, embeddingString, similarityThreshold, limit];
    let paramIndex = 5;

    if (dateFrom) {
      filterConditions += ` AND c.start_time >= $${paramIndex++}`;
      params.push(dateFrom);
    }
    if (dateTo) {
      filterConditions += ` AND c.start_time <= $${paramIndex++}`;
      params.push(dateTo);
    }
    if (agentId) {
      filterConditions += ` AND c.agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    const result = await db.query(`
      SELECT
        ce.call_id,
        ce.content_type,
        ce.content_text,
        ce.chunk_index,
        1 - (ce.embedding <=> $2::vector) AS similarity,
        c.start_time,
        c.direction,
        c.from_number,
        c.to_number,
        c.duration_seconds
      FROM call_embeddings ce
      JOIN cdrs c ON c.id = ce.call_id
      WHERE ce.tenant_id = $1
        AND (1 - (ce.embedding <=> $2::vector)) >= $3
        ${filterConditions}
      ORDER BY ce.embedding <=> $2::vector
      LIMIT $4
    `, params);

    const executionTime = Date.now() - startTime;

    // Log the search
    await this.logSearch(tenantId, null, query, embeddingString, 'calls', result.rows.length, executionTime, options);

    return {
      results: result.rows,
      query,
      totalResults: result.rows.length,
      executionTimeMs: executionTime
    };
  }

  // ===========================================
  // KNOWLEDGE BASE EMBEDDINGS
  // ===========================================

  /**
   * Index a knowledge base article
   */
  async indexKnowledgeArticle(tenantId, data) {
    const {
      sourceType,
      sourceId,
      title,
      content,
      tags = []
    } = data;

    try {
      // Delete existing embeddings for this source
      if (sourceId) {
        await db.query(`
          DELETE FROM knowledge_embeddings WHERE source_id = $1
        `, [sourceId]);
      }

      const embeddings = [];

      // Combine title and content for better search
      const fullText = title ? `${title}\n\n${content}` : content;
      const chunks = this.chunkText(fullText);

      for (let i = 0; i < chunks.length; i++) {
        const { embedding, tokenCount } = await this.generateEmbedding(chunks[i].text);

        const result = await db.query(`
          INSERT INTO knowledge_embeddings (
            tenant_id, source_type, source_id, title, content_text, chunk_index,
            embedding, model, token_count, tags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          tenantId, sourceType, sourceId, title, chunks[i].text, i,
          `[${embedding.join(',')}]`, this.embeddingModel, tokenCount, JSON.stringify(tags)
        ]);

        embeddings.push(result.rows[0].id);
      }

      return { sourceId, embeddingIds: embeddings, chunks: chunks.length };

    } catch (error) {
      console.error(`[SemanticSearch] Error indexing knowledge:`, error);
      throw error;
    }
  }

  /**
   * Search knowledge base
   */
  async searchKnowledge(tenantId, query, options = {}) {
    const {
      limit = 10,
      similarityThreshold = this.defaultSimilarityThreshold,
      sourceTypes,
      tags
    } = options;

    const startTime = Date.now();

    // Generate query embedding
    const { embedding } = await this.generateEmbedding(query);
    const embeddingString = `[${embedding.join(',')}]`;

    // Build query with optional filters
    let filterConditions = '';
    const params = [tenantId, embeddingString, similarityThreshold, limit];
    let paramIndex = 5;

    if (sourceTypes && sourceTypes.length > 0) {
      filterConditions += ` AND source_type = ANY($${paramIndex++})`;
      params.push(sourceTypes);
    }
    if (tags && tags.length > 0) {
      filterConditions += ` AND tags ?| $${paramIndex++}`;
      params.push(tags);
    }

    const result = await db.query(`
      SELECT
        id,
        source_type,
        source_id,
        title,
        content_text,
        chunk_index,
        tags,
        1 - (embedding <=> $2::vector) AS similarity
      FROM knowledge_embeddings
      WHERE tenant_id = $1
        AND is_active = true
        AND (1 - (embedding <=> $2::vector)) >= $3
        ${filterConditions}
      ORDER BY embedding <=> $2::vector
      LIMIT $4
    `, params);

    const executionTime = Date.now() - startTime;

    // Log the search
    await this.logSearch(tenantId, null, query, embeddingString, 'knowledge', result.rows.length, executionTime, options);

    return {
      results: result.rows,
      query,
      totalResults: result.rows.length,
      executionTimeMs: executionTime
    };
  }

  // ===========================================
  // CONTACT EMBEDDINGS
  // ===========================================

  /**
   * Index a contact for similarity search
   */
  async indexContact(contactId, tenantId, profileData) {
    try {
      // Build profile text from contact data
      const profileText = this.buildContactProfileText(profileData);

      const { embedding, tokenCount } = await this.generateEmbedding(profileText);

      await db.query(`
        INSERT INTO contact_embeddings (
          contact_id, tenant_id, profile_text, embedding, model
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (contact_id)
        DO UPDATE SET
          profile_text = EXCLUDED.profile_text,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `, [
        contactId, tenantId, profileText,
        `[${embedding.join(',')}]`, this.embeddingModel
      ]);

      return { contactId, indexed: true };

    } catch (error) {
      console.error(`[SemanticSearch] Error indexing contact ${contactId}:`, error);
      throw error;
    }
  }

  /**
   * Build profile text for contact embedding
   */
  buildContactProfileText(data) {
    const parts = [];

    if (data.name) parts.push(`Name: ${data.name}`);
    if (data.company) parts.push(`Company: ${data.company}`);
    if (data.title) parts.push(`Title: ${data.title}`);
    if (data.industry) parts.push(`Industry: ${data.industry}`);
    if (data.tags && data.tags.length) parts.push(`Tags: ${data.tags.join(', ')}`);
    if (data.notes) parts.push(`Notes: ${data.notes}`);
    if (data.interests && data.interests.length) parts.push(`Interests: ${data.interests.join(', ')}`);

    return parts.join('\n');
  }

  /**
   * Find similar contacts
   */
  async findSimilarContacts(tenantId, query, options = {}) {
    const { limit = 10 } = options;

    const startTime = Date.now();

    // Generate query embedding
    const { embedding } = await this.generateEmbedding(query);
    const embeddingString = `[${embedding.join(',')}]`;

    const result = await db.query(`
      SELECT
        ce.contact_id,
        ce.profile_text,
        1 - (ce.embedding <=> $2::vector) AS similarity,
        c.name,
        c.email,
        c.phone,
        c.company
      FROM contact_embeddings ce
      JOIN contacts c ON c.id = ce.contact_id
      WHERE ce.tenant_id = $1
      ORDER BY ce.embedding <=> $2::vector
      LIMIT $3
    `, [tenantId, embeddingString, limit]);

    const executionTime = Date.now() - startTime;

    return {
      results: result.rows,
      query,
      executionTimeMs: executionTime
    };
  }

  // ===========================================
  // UNIFIED SEARCH
  // ===========================================

  /**
   * Search across all indexed content
   */
  async searchAll(tenantId, query, options = {}) {
    const {
      limit = 10,
      similarityThreshold = this.defaultSimilarityThreshold,
      includeTypes = ['calls', 'knowledge', 'contacts']
    } = options;

    const startTime = Date.now();
    const results = {};

    // Generate query embedding once
    const { embedding } = await this.generateEmbedding(query);

    // Search each type in parallel
    const searches = [];

    if (includeTypes.includes('calls')) {
      searches.push(
        this.searchCalls(tenantId, query, { ...options, limit: Math.ceil(limit / includeTypes.length) })
          .then(r => { results.calls = r.results; })
      );
    }

    if (includeTypes.includes('knowledge')) {
      searches.push(
        this.searchKnowledge(tenantId, query, { ...options, limit: Math.ceil(limit / includeTypes.length) })
          .then(r => { results.knowledge = r.results; })
      );
    }

    if (includeTypes.includes('contacts')) {
      searches.push(
        this.findSimilarContacts(tenantId, query, { limit: Math.ceil(limit / includeTypes.length) })
          .then(r => { results.contacts = r.results; })
      );
    }

    await Promise.all(searches);

    const executionTime = Date.now() - startTime;

    // Log unified search
    await this.logSearch(
      tenantId, null, query, `[${embedding.join(',')}]`,
      'all', Object.values(results).flat().length, executionTime, options
    );

    return {
      results,
      query,
      executionTimeMs: executionTime
    };
  }

  // ===========================================
  // SEARCH LOGGING & ANALYTICS
  // ===========================================

  /**
   * Log a search query
   */
  async logSearch(tenantId, userId, queryText, queryEmbedding, searchType, resultCount, executionTime, filters = {}) {
    try {
      const topScore = resultCount > 0 ? 1.0 : null; // Would need to track actual top score

      await db.query(`
        INSERT INTO semantic_search_logs (
          tenant_id, user_id, query_text, query_embedding,
          search_type, result_count, top_result_score,
          execution_time_ms, filters_applied
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        tenantId, userId, queryText, queryEmbedding,
        searchType, resultCount, topScore,
        executionTime, JSON.stringify(filters)
      ]);
    } catch (error) {
      console.error('[SemanticSearch] Error logging search:', error);
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(tenantId, options = {}) {
    const { days = 30 } = options;

    // Popular queries
    const popularQueries = await db.query(`
      SELECT
        query_text,
        COUNT(*) as search_count,
        AVG(result_count) as avg_results,
        AVG(execution_time_ms) as avg_execution_time
      FROM semantic_search_logs
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY query_text
      ORDER BY search_count DESC
      LIMIT 20
    `, [tenantId]);

    // Search volume by type
    const volumeByType = await db.query(`
      SELECT
        search_type,
        COUNT(*) as count,
        AVG(result_count) as avg_results
      FROM semantic_search_logs
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY search_type
    `, [tenantId]);

    // Zero result queries (opportunities for improvement)
    const zeroResults = await db.query(`
      SELECT
        query_text,
        COUNT(*) as occurrences
      FROM semantic_search_logs
      WHERE tenant_id = $1
        AND result_count = 0
        AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY query_text
      ORDER BY occurrences DESC
      LIMIT 20
    `, [tenantId]);

    return {
      popularQueries: popularQueries.rows,
      volumeByType: volumeByType.rows,
      zeroResultQueries: zeroResults.rows,
      periodDays: days
    };
  }

  // ===========================================
  // MAINTENANCE
  // ===========================================

  /**
   * Reindex all content for a tenant
   */
  async reindexTenant(tenantId) {
    console.log(`[SemanticSearch] Starting reindex for tenant ${tenantId}`);

    // Get all calls with transcripts
    const calls = await db.query(`
      SELECT id, transcript, summary FROM call_transcripts
      WHERE tenant_id = $1 AND transcript IS NOT NULL
    `, [tenantId]);

    let callsIndexed = 0;
    for (const call of calls.rows) {
      try {
        await this.indexCallTranscript(call.id, tenantId, call.transcript, call.summary);
        callsIndexed++;
      } catch (error) {
        console.error(`[SemanticSearch] Failed to index call ${call.id}:`, error);
      }
    }

    console.log(`[SemanticSearch] Reindexed ${callsIndexed} calls for tenant ${tenantId}`);
    return { callsIndexed };
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats(tenantId = null) {
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    const callStats = await db.query(`
      SELECT COUNT(*) as count, SUM(token_count) as total_tokens
      FROM call_embeddings ${tenantFilter}
    `, params);

    const knowledgeStats = await db.query(`
      SELECT COUNT(*) as count, SUM(token_count) as total_tokens
      FROM knowledge_embeddings ${tenantFilter}
    `, params);

    const contactStats = await db.query(`
      SELECT COUNT(*) as count
      FROM contact_embeddings ${tenantFilter}
    `, params);

    return {
      calls: {
        embeddings: parseInt(callStats.rows[0].count),
        totalTokens: parseInt(callStats.rows[0].total_tokens || 0)
      },
      knowledge: {
        embeddings: parseInt(knowledgeStats.rows[0].count),
        totalTokens: parseInt(knowledgeStats.rows[0].total_tokens || 0)
      },
      contacts: {
        embeddings: parseInt(contactStats.rows[0].count)
      }
    };
  }
}

export default new SemanticSearchService();
