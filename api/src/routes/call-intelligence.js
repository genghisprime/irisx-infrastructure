/**
 * Call Intelligence API Routes
 * AI-powered transcription, analysis, and compliance monitoring
 *
 * Based on: IRIS_AI_Conversation_Intelligence.md
 */

import { Hono } from 'hono';
import transcriptionService from '../services/transcription.js';
import callAnalysisService from '../services/call-analysis.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const callIntelligence = new Hono();

// All routes require authentication
callIntelligence.use('*', authenticateJWT);

// Helper to get tenantId from user or admin context
function getTenantId(c) {
  const user = c.get('user');
  // For tenant users, return their tenantId
  if (user?.tenantId) return user.tenantId;
  // For superadmin, allow all tenants (return null to query across all)
  if (user?.role === 'superadmin') return null;
  // For admin users, they may have a tenantId
  return user?.tenantId || null;
}

// === Transcript Endpoints ===

/**
 * Get transcript for a call
 * GET /v1/calls/:callId/transcript
 */
callIntelligence.get('/calls/:callId/transcript', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const callId = c.req.param('callId');

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const transcript = await transcriptionService.getCallTranscript(callId, tenantId);

    return c.json(transcript);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting transcript:', error);
    return c.json({ error: 'Failed to get transcript', message: error.message }, 500);
  }
});

/**
 * Store a transcript segment (for real-time transcription)
 * POST /v1/calls/:callId/transcript/segment
 */
callIntelligence.post('/calls/:callId/transcript/segment', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);
    const callId = c.req.param('callId');
    const segment = await c.req.json();

    if (!user || !tenantId) {
      return c.json({ error: 'Authentication required (tenant context needed)' }, 401);
    }

    const result = await transcriptionService.storeTranscriptSegment(callId, tenantId, segment);

    return c.json(result, 201);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error storing segment:', error);
    return c.json({ error: 'Failed to store segment', message: error.message }, 500);
  }
});

// === Analysis Endpoints ===

/**
 * Get analysis for a call
 * GET /v1/calls/:callId/analysis
 */
callIntelligence.get('/calls/:callId/analysis', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const callId = c.req.param('callId');

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const analysis = await callAnalysisService.getCallAnalysis(callId, tenantId);

    if (!analysis) {
      return c.json({ error: 'Analysis not found. Call may not have been analyzed yet.' }, 404);
    }

    return c.json({ analysis });
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting analysis:', error);
    return c.json({ error: 'Failed to get analysis', message: error.message }, 500);
  }
});

/**
 * Trigger analysis for a call
 * POST /v1/calls/:callId/analyze
 */
callIntelligence.post('/calls/:callId/analyze', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const callId = c.req.param('callId');

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await callAnalysisService.analyzeCall(callId, tenantId);

    return c.json(result);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error analyzing call:', error);
    if (error.message.includes('OpenAI not configured')) {
      return c.json({ error: 'AI analysis not available. OPENAI_API_KEY not configured.' }, 503);
    }
    if (error.message.includes('No transcript found')) {
      return c.json({ error: 'No transcript found for this call. Transcribe first.' }, 400);
    }
    return c.json({ error: 'Failed to analyze call', message: error.message }, 500);
  }
});

/**
 * Search calls by topic/content
 * GET /v1/calls/search
 */
callIntelligence.get('/calls/search', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const searchQuery = c.req.query('q');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const sentiment = c.req.query('sentiment');
    const outcome = c.req.query('outcome');

    const results = await callAnalysisService.searchCalls(tenantId, searchQuery, {
      page, limit, sentiment, outcome
    });

    return c.json(results);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error searching calls:', error);
    return c.json({ error: 'Failed to search calls', message: error.message }, 500);
  }
});

// === Compliance Endpoints ===

/**
 * Get compliance alerts for a call
 * GET /v1/calls/:callId/compliance
 */
callIntelligence.get('/calls/:callId/compliance', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const callId = c.req.param('callId');

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const alerts = await transcriptionService.getComplianceAlerts(callId, tenantId);

    return c.json({ alerts });
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting compliance alerts:', error);
    return c.json({ error: 'Failed to get compliance alerts', message: error.message }, 500);
  }
});

/**
 * Get unacknowledged compliance alerts
 * GET /v1/compliance/alerts
 */
callIntelligence.get('/compliance/alerts', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const severity = c.req.query('severity');

    const result = await transcriptionService.getUnacknowledgedAlerts(tenantId, {
      page, limit, severity
    });

    return c.json(result);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting alerts:', error);
    return c.json({ error: 'Failed to get alerts', message: error.message }, 500);
  }
});

/**
 * Acknowledge a compliance alert
 * POST /v1/compliance/alerts/:alertId/acknowledge
 */
callIntelligence.post('/compliance/alerts/:alertId/acknowledge', async (c) => {
  try {
    const user = c.get('user');
    const userId = user?.userId;
    const alertId = c.req.param('alertId');
    const body = await c.req.json().catch(() => ({}));

    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const result = await transcriptionService.acknowledgeAlert(alertId, userId, body.notes);

    return c.json({ alert: result });
  } catch (error) {
    console.error('[Call Intelligence Routes] Error acknowledging alert:', error);
    if (error.message === 'Alert not found') {
      return c.json({ error: 'Alert not found' }, 404);
    }
    return c.json({ error: 'Failed to acknowledge alert', message: error.message }, 500);
  }
});

// === Statistics Endpoints ===

/**
 * Get transcription and analysis stats
 * GET /v1/intelligence/stats
 */
callIntelligence.get('/intelligence/stats', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const period = c.req.query('period') || 'today';

    const [transcriptionStats, analysisStats] = await Promise.all([
      transcriptionService.getTranscriptionStats(tenantId, period),
      callAnalysisService.getAnalysisStats(tenantId, period)
    ]);

    return c.json({
      period,
      transcription: transcriptionStats,
      analysis: analysisStats
    });
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting stats:', error);
    return c.json({ error: 'Failed to get stats', message: error.message }, 500);
  }
});

// === Agent Performance Endpoints ===

/**
 * Get agent performance from AI analysis
 * GET /v1/intelligence/agents
 */
callIntelligence.get('/intelligence/agents', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const period = c.req.query('period') || 'week';
    const agentId = c.req.query('agent_id');

    const result = await callAnalysisService.getAgentPerformance(tenantId, agentId, period);

    return c.json(result);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting agent performance:', error);
    return c.json({ error: 'Failed to get agent performance', message: error.message }, 500);
  }
});

/**
 * Get coaching report for an agent
 * GET /v1/intelligence/agents/:agentId/coaching
 */
callIntelligence.get('/intelligence/agents/:agentId/coaching', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const agentId = c.req.param('agentId');

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const period = c.req.query('period') || 'week';

    const report = await callAnalysisService.generateCoachingReport(tenantId, agentId, period);

    return c.json(report);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error generating coaching report:', error);
    return c.json({ error: 'Failed to generate coaching report', message: error.message }, 500);
  }
});

// === Transcription Jobs Endpoints ===

/**
 * Create a transcription job (batch processing)
 * POST /v1/transcription/jobs
 */
callIntelligence.post('/transcription/jobs', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const body = await c.req.json();

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { call_id, recording_url, job_type = 'both' } = body;

    if (!call_id) {
      return c.json({ error: 'call_id is required' }, 400);
    }

    const job = await transcriptionService.createTranscriptionJob(
      call_id, tenantId, recording_url, job_type
    );

    return c.json({ job }, 201);
  } catch (error) {
    console.error('[Call Intelligence Routes] Error creating job:', error);
    return c.json({ error: 'Failed to create transcription job', message: error.message }, 500);
  }
});

/**
 * Get transcription job status
 * GET /v1/transcription/jobs/:jobId
 */
callIntelligence.get('/transcription/jobs/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');

    const job = await transcriptionService.getJobStatus(jobId);

    return c.json({ job });
  } catch (error) {
    console.error('[Call Intelligence Routes] Error getting job status:', error);
    if (error.message === 'Job not found') {
      return c.json({ error: 'Job not found' }, 404);
    }
    return c.json({ error: 'Failed to get job status', message: error.message }, 500);
  }
});

export default callIntelligence;
