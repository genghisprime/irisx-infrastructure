/**
 * AI Transcription Service
 * Real-time and batch transcription using Deepgram/OpenAI Whisper
 *
 * Based on: IRIS_AI_Conversation_Intelligence.md
 */

import { query } from '../db/connection.js';
import Sentiment from 'sentiment';

// Initialize sentiment analyzer for real-time analysis
const sentimentAnalyzer = new Sentiment();

// Compliance keywords to detect
const COMPLIANCE_KEYWORDS = {
  profanity: ['fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard', 'crap'],
  unauthorized_promises: [
    'i guarantee',
    'i promise',
    '100% guaranteed',
    'no risk',
    'risk-free',
    'definitely will',
    'absolutely certain'
  ],
  competitor_mentions: [
    'twilio',
    'vonage',
    'plivo',
    'ringcentral',
    'five9',
    'genesys',
    'talkdesk',
    'aircall'
  ],
  payment_info: [
    'credit card',
    'card number',
    'cvv',
    'social security',
    'ssn',
    'bank account',
    'routing number'
  ]
};

class TranscriptionService {
  constructor() {
    this.deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Store a transcript segment (real-time or batch)
   */
  async storeTranscriptSegment(callId, tenantId, segment) {
    try {
      const {
        speaker = 0,
        start_time = 0,
        duration = 0,
        text,
        is_final = true,
        confidence = null,
        language = 'en'
      } = segment;

      // Analyze sentiment in real-time
      const sentimentResult = this.analyzeSentimentRealTime(text);

      // Store segment
      const result = await query(`
        INSERT INTO call_transcript_segments (
          call_id, tenant_id, speaker, start_time, duration,
          text, is_final, sentiment, sentiment_score, confidence, language
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        callId, tenantId, speaker, start_time, duration,
        text, is_final, sentimentResult.sentiment, sentimentResult.score,
        confidence, language
      ]);

      // Check for compliance keywords
      await this.checkCompliance(callId, tenantId, text, start_time);

      return {
        id: result.rows[0].id,
        sentiment: sentimentResult.sentiment,
        sentiment_score: sentimentResult.score
      };
    } catch (error) {
      console.error('[Transcription Service] Error storing segment:', error);
      throw error;
    }
  }

  /**
   * Get full transcript for a call
   */
  async getCallTranscript(callId, tenantId) {
    try {
      const result = await query(`
        SELECT
          speaker,
          start_time,
          duration,
          text,
          sentiment,
          sentiment_score,
          confidence,
          created_at
        FROM call_transcript_segments
        WHERE call_id = $1 AND tenant_id = $2
        ORDER BY start_time ASC
      `, [callId, tenantId]);

      return {
        call_id: callId,
        segments: result.rows,
        total_segments: result.rows.length,
        full_text: result.rows.map(s => `Speaker ${s.speaker}: ${s.text}`).join('\n')
      };
    } catch (error) {
      console.error('[Transcription Service] Error getting transcript:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment in real-time (fast, local)
   */
  analyzeSentimentRealTime(text) {
    const result = sentimentAnalyzer.analyze(text);

    let sentiment;
    if (result.score > 2) sentiment = 'positive';
    else if (result.score < -2) sentiment = 'negative';
    else sentiment = 'neutral';

    return {
      score: result.score,
      sentiment,
      comparative: result.comparative,
      words: {
        positive: result.positive,
        negative: result.negative
      }
    };
  }

  /**
   * Check transcript for compliance keywords
   */
  async checkCompliance(callId, tenantId, text, timestampInCall = 0) {
    const lower = text.toLowerCase();
    const detected = {
      profanity: [],
      unauthorized_promises: [],
      competitor_mentions: [],
      payment_info: []
    };

    for (const [category, keywords] of Object.entries(COMPLIANCE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          detected[category].push(keyword);
        }
      }
    }

    // Create alerts for violations
    const alerts = [];

    if (detected.profanity.length > 0) {
      alerts.push({
        type: 'profanity',
        keywords: detected.profanity,
        severity: 'high'
      });
    }

    if (detected.unauthorized_promises.length > 0) {
      alerts.push({
        type: 'unauthorized_promise',
        keywords: detected.unauthorized_promises,
        severity: 'high'
      });
    }

    if (detected.competitor_mentions.length > 0) {
      alerts.push({
        type: 'competitor_mention',
        keywords: detected.competitor_mentions,
        severity: 'low'
      });
    }

    if (detected.payment_info.length > 0) {
      alerts.push({
        type: 'payment_info',
        keywords: detected.payment_info,
        severity: 'medium'
      });
    }

    // Store alerts
    for (const alert of alerts) {
      try {
        await query(`
          INSERT INTO compliance_alerts (
            call_id, tenant_id, alert_type, keywords_detected,
            severity, transcript_segment, timestamp_in_call
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          callId, tenantId, alert.type,
          JSON.stringify(alert.keywords), alert.severity,
          text, timestampInCall
        ]);
      } catch (error) {
        console.error('[Transcription Service] Error creating compliance alert:', error);
      }
    }

    return detected;
  }

  /**
   * Get compliance alerts for a call
   */
  async getComplianceAlerts(callId, tenantId) {
    try {
      const result = await query(`
        SELECT
          id,
          alert_type,
          keywords_detected,
          severity,
          transcript_segment,
          timestamp_in_call,
          acknowledged,
          acknowledged_by,
          acknowledged_at,
          notes,
          created_at
        FROM compliance_alerts
        WHERE call_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC
      `, [callId, tenantId]);

      return result.rows;
    } catch (error) {
      console.error('[Transcription Service] Error getting compliance alerts:', error);
      throw error;
    }
  }

  /**
   * Get unacknowledged compliance alerts for a tenant
   */
  async getUnacknowledgedAlerts(tenantId, options = {}) {
    const { page = 1, limit = 50, severity = null } = options;
    const offset = (page - 1) * limit;

    try {
      // Build WHERE clause with table alias for compliance_alerts
      let whereConditions = ['ca.acknowledged = FALSE'];
      const params = [];

      // Only filter by tenant if provided (superadmin may query all)
      if (tenantId) {
        params.push(tenantId);
        whereConditions.push(`ca.tenant_id = $${params.length}`);
      }

      if (severity) {
        params.push(severity);
        whereConditions.push(`ca.severity = $${params.length}`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get alerts
      const result = await query(`
        SELECT
          ca.*,
          c.from_number,
          c.to_number
        FROM compliance_alerts ca
        LEFT JOIN calls c ON c.id::text = ca.call_id
        WHERE ${whereClause}
        ORDER BY ca.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);

      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM compliance_alerts ca
        WHERE ${whereClause}
      `, params);

      return {
        alerts: result.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].total),
          total_pages: Math.ceil(countResult.rows[0].total / limit)
        }
      };
    } catch (error) {
      console.error('[Transcription Service] Error getting unacknowledged alerts:', error);
      throw error;
    }
  }

  /**
   * Acknowledge a compliance alert
   */
  async acknowledgeAlert(alertId, userId, notes = null) {
    try {
      const result = await query(`
        UPDATE compliance_alerts
        SET
          acknowledged = TRUE,
          acknowledged_by = $1,
          acknowledged_at = NOW(),
          notes = COALESCE($2, notes)
        WHERE id = $3
        RETURNING *
      `, [userId, notes, alertId]);

      if (result.rows.length === 0) {
        throw new Error('Alert not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Transcription Service] Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Create a transcription job for batch processing
   */
  async createTranscriptionJob(callId, tenantId, recordingUrl, jobType = 'both') {
    try {
      const result = await query(`
        INSERT INTO transcription_jobs (
          call_id, tenant_id, recording_url, job_type, status
        )
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING *
      `, [callId, tenantId, recordingUrl, jobType]);

      return result.rows[0];
    } catch (error) {
      console.error('[Transcription Service] Error creating transcription job:', error);
      throw error;
    }
  }

  /**
   * Get transcription job status
   */
  async getJobStatus(jobId) {
    try {
      const result = await query(`
        SELECT * FROM transcription_jobs WHERE id = $1
      `, [jobId]);

      if (result.rows.length === 0) {
        throw new Error('Job not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Transcription Service] Error getting job status:', error);
      throw error;
    }
  }

  /**
   * Get pending transcription jobs
   */
  async getPendingJobs(limit = 10) {
    try {
      const result = await query(`
        SELECT * FROM transcription_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error('[Transcription Service] Error getting pending jobs:', error);
      throw error;
    }
  }

  /**
   * Update transcription job status
   */
  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const updates = {
        status,
        ...(status === 'processing' ? { started_at: 'NOW()' } : {}),
        ...(status === 'completed' || status === 'failed' ? { completed_at: 'NOW()' } : {}),
        ...(errorMessage ? { error_message: errorMessage } : {})
      };

      const setClauses = [];
      const params = [];

      if (status === 'processing') {
        setClauses.push('started_at = NOW()');
      }
      if (status === 'completed' || status === 'failed') {
        setClauses.push('completed_at = NOW()');
      }
      if (errorMessage) {
        params.push(errorMessage);
        setClauses.push(`error_message = $${params.length}`);
      }

      params.push(status);
      setClauses.push(`status = $${params.length}`);

      params.push(jobId);

      const result = await query(`
        UPDATE transcription_jobs
        SET ${setClauses.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
      `, params);

      return result.rows[0];
    } catch (error) {
      console.error('[Transcription Service] Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Get transcription stats for a tenant
   */
  async getTranscriptionStats(tenantId, period = 'today') {
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

      // Get job stats
      const jobStats = await query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
          SUM(transcription_cost) as total_transcription_cost,
          SUM(analysis_cost) as total_analysis_cost
        FROM transcription_jobs
        WHERE tenant_id = $1 AND ${dateFilter}
      `, [tenantId]);

      // Get compliance alert stats
      const alertStats = await query(`
        SELECT
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE acknowledged = FALSE) as unacknowledged,
          COUNT(*) FILTER (WHERE severity = 'high' OR severity = 'critical') as high_severity,
          COUNT(*) FILTER (WHERE alert_type = 'profanity') as profanity_alerts,
          COUNT(*) FILTER (WHERE alert_type = 'unauthorized_promise') as promise_alerts,
          COUNT(*) FILTER (WHERE alert_type = 'competitor_mention') as competitor_alerts
        FROM compliance_alerts
        WHERE tenant_id = $1 AND ${dateFilter}
      `, [tenantId]);

      // Get transcript stats
      const transcriptStats = await query(`
        SELECT
          COUNT(DISTINCT call_id) as calls_transcribed,
          COUNT(*) as total_segments,
          AVG(sentiment_score) as avg_sentiment_score,
          COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_segments,
          COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_segments,
          COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_segments
        FROM call_transcript_segments
        WHERE tenant_id = $1 AND ${dateFilter}
      `, [tenantId]);

      return {
        period,
        jobs: jobStats.rows[0],
        alerts: alertStats.rows[0],
        transcripts: transcriptStats.rows[0]
      };
    } catch (error) {
      console.error('[Transcription Service] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Mark call as having transcript
   */
  async markCallTranscribed(callId) {
    try {
      await query(`
        UPDATE calls
        SET has_transcript = TRUE
        WHERE id::text = $1 OR id = $1::integer
      `, [callId]);
    } catch (error) {
      console.error('[Transcription Service] Error marking call transcribed:', error);
      // Non-fatal error, continue
    }
  }
}

export default new TranscriptionService();
