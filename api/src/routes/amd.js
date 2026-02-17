/**
 * AMD (Answering Machine Detection) Routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { amdService, AMD_RESULTS, AMD_ACTIONS } from '../services/amd.js';

const app = new Hono();

// Validation schemas
const configurationSchema = z.object({
  name: z.string().min(1).max(100),
  campaign_id: z.number().optional(),
  enabled: z.boolean().optional(),
  detection_mode: z.enum(['sync', 'async']).optional(),
  initial_silence_ms: z.number().min(500).max(10000).optional(),
  greeting_max_ms: z.number().min(500).max(5000).optional(),
  after_greeting_silence_ms: z.number().min(100).max(2000).optional(),
  total_analysis_ms: z.number().min(2000).max(15000).optional(),
  min_word_length_ms: z.number().min(50).max(500).optional(),
  between_words_silence_ms: z.number().min(20).max(200).optional(),
  max_number_of_words: z.number().min(1).max(10).optional(),
  machine_greeting_min_ms: z.number().min(500).max(5000).optional(),
  beep_detection_enabled: z.boolean().optional(),
  beep_frequency_min: z.number().min(200).max(500).optional(),
  beep_frequency_max: z.number().min(500).max(1500).optional(),
  beep_duration_min_ms: z.number().min(100).max(500).optional(),
  human_action: z.enum(['connect', 'transfer', 'ivr']).optional(),
  machine_action: z.enum(['hangup', 'voicemail', 'callback']).optional(),
  uncertain_action: z.enum(['connect', 'hangup', 'transfer']).optional(),
  human_transfer_to: z.string().max(100).optional().nullable(),
  machine_transfer_to: z.string().max(100).optional().nullable(),
  voicemail_audio_id: z.number().optional().nullable(),
  adaptive_enabled: z.boolean().optional(),
  learning_rate: z.number().min(0.001).max(0.5).optional(),
  min_samples_for_adaptation: z.number().min(10).max(1000).optional(),
});

const analyzeSchema = z.object({
  call_id: z.string().min(1),
  campaign_id: z.number().optional(),
  phone_number: z.string().optional(),
  audio_url: z.string().url().optional(),
  audio_data: z.object({
    samples: z.array(z.number()).optional(),
    sampleRate: z.number().optional(),
    duration: z.number().optional(),
  }).optional(),
});

const verifySchema = z.object({
  verified_result: z.enum(['human', 'machine']),
});

// Get all AMD configurations
app.get('/configurations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const configurations = await amdService.getConfigurations(tenantId);

    return c.json({
      success: true,
      configurations,
    });
  } catch (error) {
    console.error('Error getting AMD configurations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single configuration
app.get('/configurations/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const configId = parseInt(c.req.param('id'));
    const campaignId = c.req.query('campaign_id') ? parseInt(c.req.query('campaign_id')) : null;

    const config = await amdService.getConfiguration(tenantId, campaignId);

    if (!config) {
      return c.json({ success: false, error: 'Configuration not found' }, 404);
    }

    return c.json({
      success: true,
      configuration: config,
    });
  } catch (error) {
    console.error('Error getting AMD configuration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create AMD configuration
app.post('/configurations', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();
    const data = configurationSchema.parse(body);

    const configuration = await amdService.createConfiguration(tenantId, data);

    return c.json({
      success: true,
      configuration,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error creating AMD configuration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update AMD configuration
app.put('/configurations/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const configId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const data = configurationSchema.partial().parse(body);

    const configuration = await amdService.updateConfiguration(tenantId, configId, data);

    if (!configuration) {
      return c.json({ success: false, error: 'Configuration not found' }, 404);
    }

    return c.json({
      success: true,
      configuration,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error updating AMD configuration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete AMD configuration
app.delete('/configurations/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const configId = parseInt(c.req.param('id'));

    await amdService.deleteConfiguration(tenantId, configId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting AMD configuration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Analyze call for AMD (sync or async)
app.post('/analyze', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();
    const data = analyzeSchema.parse(body);

    // Get configuration
    const config = await amdService.getConfiguration(tenantId, data.campaign_id);

    // Prepare audio data (in production, would fetch from audio_url)
    const audioData = data.audio_data || {
      samples: [],
      sampleRate: 8000,
      duration: 0,
    };

    // Run analysis
    const analysis = await amdService.analyzeAudio(audioData, config);
    analysis.phoneNumber = data.phone_number;

    // Determine action
    const action = amdService.getActionForResult(analysis.result, config);

    // Record result
    const result = await amdService.recordResult(
      tenantId,
      data.call_id,
      analysis,
      config,
      action
    );

    return c.json({
      success: true,
      result: {
        id: result.id,
        call_id: data.call_id,
        detection: analysis.result,
        confidence: analysis.confidence,
        detection_time_ms: analysis.detectionTimeMs,
        action,
        details: {
          initial_silence_ms: analysis.initialSilenceMs,
          greeting_duration_ms: analysis.greetingDurationMs,
          words_detected: analysis.wordsDetected,
          beep_detected: analysis.beepDetected,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error analyzing call:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get AMD analytics
app.get('/analytics', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const campaignId = c.req.query('campaign_id') ? parseInt(c.req.query('campaign_id')) : null;
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const groupBy = c.req.query('group_by') || 'hour';

    const analytics = await amdService.getAnalytics(tenantId, {
      campaignId,
      startDate,
      endDate,
      groupBy,
    });

    // Calculate summary
    const summary = analytics.reduce((acc, row) => {
      acc.total_calls += parseInt(row.total_calls) || 0;
      acc.human_count += parseInt(row.human_count) || 0;
      acc.machine_count += parseInt(row.machine_count) || 0;
      acc.uncertain_count += parseInt(row.uncertain_count) || 0;
      return acc;
    }, { total_calls: 0, human_count: 0, machine_count: 0, uncertain_count: 0 });

    if (summary.total_calls > 0) {
      summary.human_rate = ((summary.human_count / summary.total_calls) * 100).toFixed(2);
      summary.machine_rate = ((summary.machine_count / summary.total_calls) * 100).toFixed(2);
    }

    return c.json({
      success: true,
      summary,
      timeline: analytics,
    });
  } catch (error) {
    console.error('Error getting AMD analytics:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get results for verification
app.get('/verification-queue', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit') || '50');

    const results = await amdService.getResultsForVerification(tenantId, limit);

    return c.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error getting verification queue:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Verify AMD result
app.post('/results/:id/verify', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const resultId = parseInt(c.req.param('id'));
    const agentId = c.get('agentId') || c.get('userId');
    const body = await c.req.json();
    const data = verifySchema.parse(body);

    const result = await amdService.verifyResult(
      tenantId,
      resultId,
      data.verified_result,
      agentId
    );

    if (!result) {
      return c.json({ success: false, error: 'Result not found' }, 404);
    }

    return c.json({
      success: true,
      result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Error verifying AMD result:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get AMD result types and actions (for UI dropdowns)
app.get('/options', async (c) => {
  return c.json({
    success: true,
    results: Object.values(AMD_RESULTS),
    actions: Object.values(AMD_ACTIONS),
    detection_modes: ['sync', 'async'],
  });
});

export default app;
