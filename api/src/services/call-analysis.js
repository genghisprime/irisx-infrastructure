/**
 * Call Analysis Service
 * GPT-4 powered post-call analysis with summarization, sentiment, and coaching insights
 *
 * Based on: IRIS_AI_Conversation_Intelligence.md
 */

import { query } from '../db/connection.js';
import OpenAI from 'openai';

class CallAnalysisService {
  constructor() {
    this.openai = null;
    this.modelId = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    this.initOpenAI();
  }

  initOpenAI() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('[Call Analysis Service] OpenAI initialized');
    } else {
      console.warn('[Call Analysis Service] OPENAI_API_KEY not set - analysis features disabled');
    }
  }

  /**
   * Analyze a call using GPT-4
   */
  async analyzeCall(callId, tenantId) {
    if (!this.openai) {
      throw new Error('OpenAI not configured. Set OPENAI_API_KEY environment variable.');
    }

    const startTime = Date.now();

    try {
      // Get transcript
      const segments = await query(`
        SELECT speaker, text, start_time
        FROM call_transcript_segments
        WHERE call_id = $1 AND tenant_id = $2
        ORDER BY start_time ASC
      `, [callId, tenantId]);

      if (segments.rows.length === 0) {
        throw new Error('No transcript found for this call');
      }

      // Combine into full transcript
      const transcript = segments.rows
        .map(s => `Speaker ${s.speaker}: ${s.text}`)
        .join('\n');

      // Get call metadata if available
      let callMeta = { direction: 'unknown', duration: 0, tags: [] };
      try {
        const callResult = await query(`
          SELECT direction, duration, tags
          FROM calls
          WHERE id::text = $1 OR id = $1::integer
        `, [callId]);
        if (callResult.rows.length > 0) {
          callMeta = callResult.rows[0];
        }
      } catch (e) {
        // Continue without call metadata
      }

      // Prepare GPT-4 prompt
      const prompt = this.buildAnalysisPrompt(transcript, callMeta);

      // Call GPT-4
      const response = await this.openai.chat.completions.create({
        model: this.modelId,
        messages: [
          {
            role: 'system',
            content: 'You are an expert call analyst specializing in sales and customer support conversations. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      const tokensUsed = response.usage?.total_tokens || 0;
      const processingTime = Date.now() - startTime;

      // Store analysis
      await this.storeAnalysis(callId, tenantId, analysis, tokensUsed, processingTime);

      // Update call record
      await this.updateCallRecord(callId, analysis);

      return {
        call_id: callId,
        analysis,
        processing_time_ms: processingTime,
        tokens_used: tokensUsed
      };
    } catch (error) {
      console.error('[Call Analysis Service] Error analyzing call:', error);
      throw error;
    }
  }

  /**
   * Build the GPT-4 analysis prompt
   */
  buildAnalysisPrompt(transcript, callMeta) {
    return `
Analyze the following ${callMeta.direction || 'phone'} call transcript and provide detailed insights.

Call Duration: ${callMeta.duration || 'unknown'} seconds
Direction: ${callMeta.direction || 'unknown'}
Tags: ${callMeta.tags?.join(', ') || 'None'}

TRANSCRIPT:
${transcript}

Provide a JSON response with the following structure:
{
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": 0.0 to 1.0,
  "topics": ["topic1", "topic2"],
  "key_moments": [
    { "timestamp": 0, "description": "...", "importance": "high|medium|low" }
  ],
  "action_items": [
    { "speaker": 0, "text": "I'll call you back tomorrow", "timestamp": 45 }
  ],
  "questions_asked": [
    { "speaker": 0, "question": "What's your pricing?", "answered": true }
  ],
  "objections": ["objection1", "objection2"],
  "competitor_mentions": ["CompanyX", "ProductY"],
  "pain_points": ["pain1", "pain2"],
  "talk_ratio": {
    "speaker_0": 0.6,
    "speaker_1": 0.4
  },
  "call_outcome": "successful" | "unsuccessful" | "follow_up_needed",
  "predicted_csat": 1-5,
  "coaching_insights": [
    { "agent_speaker": 0, "insight": "...", "category": "active_listening|closing|objection_handling|empathy|product_knowledge" }
  ]
}
`.trim();
  }

  /**
   * Store analysis in database
   */
  async storeAnalysis(callId, tenantId, analysis, tokensUsed, processingTime) {
    try {
      await query(`
        INSERT INTO call_analyses (
          call_id, tenant_id, summary, sentiment, sentiment_score,
          topics, key_moments, action_items, questions_asked,
          objections, competitor_mentions, pain_points,
          talk_ratio, call_outcome, predicted_csat, coaching_insights,
          model_used, tokens_used, processing_time_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (call_id) DO UPDATE SET
          summary = EXCLUDED.summary,
          sentiment = EXCLUDED.sentiment,
          sentiment_score = EXCLUDED.sentiment_score,
          topics = EXCLUDED.topics,
          key_moments = EXCLUDED.key_moments,
          action_items = EXCLUDED.action_items,
          questions_asked = EXCLUDED.questions_asked,
          objections = EXCLUDED.objections,
          competitor_mentions = EXCLUDED.competitor_mentions,
          pain_points = EXCLUDED.pain_points,
          talk_ratio = EXCLUDED.talk_ratio,
          call_outcome = EXCLUDED.call_outcome,
          predicted_csat = EXCLUDED.predicted_csat,
          coaching_insights = EXCLUDED.coaching_insights,
          model_used = EXCLUDED.model_used,
          tokens_used = EXCLUDED.tokens_used,
          processing_time_ms = EXCLUDED.processing_time_ms,
          updated_at = NOW()
      `, [
        callId, tenantId, analysis.summary, analysis.sentiment, analysis.sentiment_score,
        JSON.stringify(analysis.topics || []),
        JSON.stringify(analysis.key_moments || []),
        JSON.stringify(analysis.action_items || []),
        JSON.stringify(analysis.questions_asked || []),
        JSON.stringify(analysis.objections || []),
        JSON.stringify(analysis.competitor_mentions || []),
        JSON.stringify(analysis.pain_points || []),
        JSON.stringify(analysis.talk_ratio || {}),
        analysis.call_outcome || 'unknown',
        analysis.predicted_csat,
        JSON.stringify(analysis.coaching_insights || []),
        this.modelId, tokensUsed, processingTime
      ]);
    } catch (error) {
      console.error('[Call Analysis Service] Error storing analysis:', error);
      throw error;
    }
  }

  /**
   * Update call record with analysis summary
   */
  async updateCallRecord(callId, analysis) {
    try {
      await query(`
        UPDATE calls
        SET
          has_analysis = TRUE,
          ai_sentiment = $1,
          ai_predicted_csat = $2
        WHERE id::text = $3 OR id = $3::integer
      `, [analysis.sentiment, analysis.predicted_csat, callId]);
    } catch (error) {
      console.error('[Call Analysis Service] Error updating call record:', error);
      // Non-fatal error, continue
    }
  }

  /**
   * Get analysis for a call
   */
  async getCallAnalysis(callId, tenantId) {
    try {
      const result = await query(`
        SELECT * FROM call_analyses
        WHERE call_id = $1 AND tenant_id = $2
      `, [callId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Call Analysis Service] Error getting analysis:', error);
      throw error;
    }
  }

  /**
   * Search calls by topic/content (semantic search placeholder)
   */
  async searchCalls(tenantId, searchQuery, options = {}) {
    const { page = 1, limit = 50, sentiment = null, outcome = null } = options;
    const offset = (page - 1) * limit;

    try {
      let whereClause = 'tenant_id = $1';
      const params = [tenantId];

      // Text search on summary and topics
      if (searchQuery) {
        params.push(`%${searchQuery}%`);
        whereClause += ` AND (
          summary ILIKE $${params.length}
          OR topics::text ILIKE $${params.length}
          OR pain_points::text ILIKE $${params.length}
        )`;
      }

      if (sentiment) {
        params.push(sentiment);
        whereClause += ` AND sentiment = $${params.length}`;
      }

      if (outcome) {
        params.push(outcome);
        whereClause += ` AND call_outcome = $${params.length}`;
      }

      const result = await query(`
        SELECT
          call_id,
          summary,
          sentiment,
          sentiment_score,
          topics,
          call_outcome,
          predicted_csat,
          created_at
        FROM call_analyses
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);

      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM call_analyses
        WHERE ${whereClause}
      `, params);

      return {
        calls: result.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      };
    } catch (error) {
      console.error('[Call Analysis Service] Error searching calls:', error);
      throw error;
    }
  }

  /**
   * Get analysis statistics for a tenant
   */
  async getAnalysisStats(tenantId, period = 'today') {
    try {
      let dateFilter;
      switch (period) {
        case 'today':
          dateFilter = "created_at >= CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "created_at >= CURRENT_DATE";
      }

      const result = await query(`
        SELECT
          COUNT(*) as total_analyzed,
          AVG(sentiment_score) as avg_sentiment,
          AVG(predicted_csat) as avg_csat,
          COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_calls,
          COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_calls,
          COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_calls,
          COUNT(*) FILTER (WHERE call_outcome = 'successful') as successful_calls,
          COUNT(*) FILTER (WHERE call_outcome = 'unsuccessful') as unsuccessful_calls,
          COUNT(*) FILTER (WHERE call_outcome = 'follow_up_needed') as follow_up_calls,
          SUM(tokens_used) as total_tokens,
          AVG(processing_time_ms) as avg_processing_time
        FROM call_analyses
        WHERE tenant_id = $1 AND ${dateFilter}
      `, [tenantId]);

      // Get top topics
      const topicsResult = await query(`
        SELECT
          topic,
          COUNT(*) as count
        FROM call_analyses,
        LATERAL jsonb_array_elements_text(topics) as topic
        WHERE tenant_id = $1 AND ${dateFilter}
        GROUP BY topic
        ORDER BY count DESC
        LIMIT 10
      `, [tenantId]);

      // Get coaching area distribution
      const coachingResult = await query(`
        SELECT
          insight->>'category' as category,
          COUNT(*) as count
        FROM call_analyses,
        LATERAL jsonb_array_elements(coaching_insights) as insight
        WHERE tenant_id = $1 AND ${dateFilter}
        GROUP BY category
        ORDER BY count DESC
      `, [tenantId]);

      return {
        period,
        summary: result.rows[0],
        top_topics: topicsResult.rows,
        coaching_areas: coachingResult.rows
      };
    } catch (error) {
      console.error('[Call Analysis Service] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Get agent performance metrics from AI analysis
   */
  async getAgentPerformance(tenantId, agentId = null, period = 'week') {
    try {
      let dateFilter;
      switch (period) {
        case 'today':
          dateFilter = "ca.created_at >= CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '7 days'";
      }

      // Build WHERE conditions with proper handling for superadmin (null tenantId)
      let whereConditions = [dateFilter];
      const params = [];

      if (tenantId) {
        params.push(tenantId);
        whereConditions.push(`ca.tenant_id = $${params.length}`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Simplified query that doesn't depend on agent_id in calls table
      // This provides aggregate stats from call_analyses without agent grouping
      const result = await query(`
        SELECT
          COUNT(ca.id) as total_calls,
          AVG(ca.sentiment_score) as avg_sentiment,
          AVG(ca.predicted_csat) as avg_csat,
          COUNT(*) FILTER (WHERE ca.call_outcome = 'successful') as successful_calls,
          COUNT(*) FILTER (WHERE ca.call_outcome = 'unsuccessful') as unsuccessful_calls,
          COUNT(*) FILTER (WHERE ca.call_outcome = 'follow_up_needed') as follow_up_calls,
          AVG((ca.talk_ratio->>'speaker_0')::numeric) as avg_agent_talk_ratio
        FROM call_analyses ca
        WHERE ${whereClause}
      `, params);

      return {
        period,
        summary: result.rows[0] || {
          total_calls: 0,
          avg_sentiment: null,
          avg_csat: null,
          successful_calls: 0,
          unsuccessful_calls: 0,
          follow_up_calls: 0,
          avg_agent_talk_ratio: null
        },
        agents: [] // Agent-level breakdown requires agent_id in calls table
      };
    } catch (error) {
      console.error('[Call Analysis Service] Error getting agent performance:', error);
      throw error;
    }
  }

  /**
   * Generate coaching report for an agent
   */
  async generateCoachingReport(tenantId, agentId, period = 'week') {
    try {
      let dateFilter;
      switch (period) {
        case 'today':
          dateFilter = "ca.created_at >= CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "ca.created_at >= CURRENT_DATE - INTERVAL '7 days'";
      }

      // Get all coaching insights for this agent
      const insightsResult = await query(`
        SELECT
          insight->>'category' as category,
          insight->>'insight' as insight,
          ca.call_id,
          ca.created_at
        FROM call_analyses ca
        LEFT JOIN calls c ON c.id::text = ca.call_id OR c.id = ca.call_id::integer,
        LATERAL jsonb_array_elements(ca.coaching_insights) as insight
        WHERE ca.tenant_id = $1
          AND c.agent_id = $2
          AND ${dateFilter}
        ORDER BY ca.created_at DESC
      `, [tenantId, agentId]);

      // Group by category
      const categoryGroups = {};
      for (const row of insightsResult.rows) {
        if (!categoryGroups[row.category]) {
          categoryGroups[row.category] = [];
        }
        categoryGroups[row.category].push({
          insight: row.insight,
          call_id: row.call_id,
          date: row.created_at
        });
      }

      // Get summary stats
      const statsResult = await query(`
        SELECT
          COUNT(ca.id) as total_calls,
          AVG(ca.sentiment_score) as avg_sentiment,
          AVG(ca.predicted_csat) as avg_csat,
          COUNT(*) FILTER (WHERE ca.call_outcome = 'successful') as successful_calls
        FROM call_analyses ca
        LEFT JOIN calls c ON c.id::text = ca.call_id OR c.id = ca.call_id::integer
        WHERE ca.tenant_id = $1
          AND c.agent_id = $2
          AND ${dateFilter}
      `, [tenantId, agentId]);

      // Top areas for improvement (most frequent categories)
      const topAreas = Object.entries(categoryGroups)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5)
        .map(([category, insights]) => ({
          category,
          count: insights.length,
          recent_examples: insights.slice(0, 3)
        }));

      return {
        agent_id: agentId,
        period,
        summary: statsResult.rows[0],
        top_improvement_areas: topAreas,
        all_insights: categoryGroups
      };
    } catch (error) {
      console.error('[Call Analysis Service] Error generating coaching report:', error);
      throw error;
    }
  }
}

export default new CallAnalysisService();
