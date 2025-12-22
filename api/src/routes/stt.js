/**
 * Speech-to-Text (STT) API Routes
 * Multi-provider transcription with automatic failover
 *
 * Based on: IRIS_Media_Processing_TTS_STT.md
 */

import { Hono } from 'hono';
import sttService from '../services/stt.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const stt = new Hono();

// All routes require authentication
stt.use('*', authenticateJWT);

// Helper to get tenantId from user context
function getTenantId(c) {
  const user = c.get('user');
  if (user?.tenantId) return user.tenantId;
  if (user?.role === 'superadmin') return null;
  return user?.tenantId || null;
}

/**
 * Transcribe audio file to text
 * POST /v1/stt/transcribe
 *
 * Body: multipart/form-data with 'file' field
 * OR JSON: { audio_url: string }
 *
 * Query params:
 * - provider: openai | deepgram | aws_transcribe (optional)
 * - language: ISO language code (optional, auto-detect if not provided)
 * - timestamps: true | false (optional, include word-level timestamps)
 */
stt.post('/transcribe', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Get query parameters
    const provider = c.req.query('provider');
    const language = c.req.query('language');
    const timestamps = c.req.query('timestamps') === 'true';

    let audio;
    let filename;

    // Check content type
    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await c.req.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return c.json({ error: 'No audio file provided. Include a "file" field in form data.' }, 400);
      }

      filename = file.name;
      audio = Buffer.from(await file.arrayBuffer());

    } else if (contentType.includes('application/json')) {
      // Handle JSON with audio URL
      const body = await c.req.json();

      if (body.audio_url) {
        // Fetch audio from URL
        try {
          const response = await fetch(body.audio_url);
          if (!response.ok) {
            return c.json({ error: `Failed to fetch audio from URL: ${response.status}` }, 400);
          }
          audio = Buffer.from(await response.arrayBuffer());
          filename = body.audio_url.split('/').pop() || 'audio.mp3';
        } catch (error) {
          return c.json({ error: `Failed to fetch audio from URL: ${error.message}` }, 400);
        }
      } else if (body.audio_base64) {
        // Handle base64 encoded audio
        audio = Buffer.from(body.audio_base64, 'base64');
        filename = body.filename || 'audio.mp3';
      } else {
        return c.json({ error: 'Provide either audio_url or audio_base64 in request body' }, 400);
      }
    } else {
      return c.json({
        error: 'Invalid content type. Use multipart/form-data for file upload or application/json for URL/base64.'
      }, 400);
    }

    // Validate audio size
    const fileSizeMB = audio.length / (1024 * 1024);
    if (fileSizeMB > 25) {
      return c.json({
        error: `File size (${fileSizeMB.toFixed(2)} MB) exceeds maximum of 25 MB`
      }, 400);
    }

    // Transcribe
    const result = await sttService.transcribe({
      audio,
      filename,
      provider,
      language,
      tenantId,
      timestamps
    });

    return c.json({
      success: true,
      transcription: {
        text: result.text,
        duration_seconds: result.duration,
        language: result.language,
        provider: result.provider,
        confidence: result.confidence,
        words: result.words,
        segments: result.segments,
        processing_time_ms: result.processingTimeMs,
        cost_cents: result.costCents
      }
    });

  } catch (error) {
    console.error('[STT Routes] Error transcribing:', error);

    if (error.message.includes('Unsupported audio format')) {
      return c.json({ error: error.message }, 400);
    }
    if (error.message.includes('File size')) {
      return c.json({ error: error.message }, 400);
    }
    if (error.message.includes('All STT providers failed')) {
      return c.json({ error: 'Transcription service temporarily unavailable', details: error.message }, 503);
    }

    return c.json({ error: 'Failed to transcribe audio', message: error.message }, 500);
  }
});

/**
 * List available STT providers
 * GET /v1/stt/providers
 */
stt.get('/providers', async (c) => {
  try {
    const providers = sttService.listProviders();
    return c.json({ providers });
  } catch (error) {
    console.error('[STT Routes] Error listing providers:', error);
    return c.json({ error: 'Failed to list providers' }, 500);
  }
});

/**
 * List supported languages
 * GET /v1/stt/languages
 */
stt.get('/languages', async (c) => {
  try {
    const languages = sttService.listLanguages();
    return c.json({ languages });
  } catch (error) {
    console.error('[STT Routes] Error listing languages:', error);
    return c.json({ error: 'Failed to list languages' }, 500);
  }
});

/**
 * Get transcription statistics
 * GET /v1/stt/stats
 *
 * Query params:
 * - period: today | week | month (default: today)
 */
stt.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = getTenantId(c);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const period = c.req.query('period') || 'today';

    const stats = await sttService.getStats(tenantId, period);

    return c.json(stats);
  } catch (error) {
    console.error('[STT Routes] Error getting stats:', error);
    return c.json({ error: 'Failed to get stats', message: error.message }, 500);
  }
});

/**
 * Get supported audio formats
 * GET /v1/stt/formats
 */
stt.get('/formats', async (c) => {
  try {
    return c.json({
      supported_formats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
      max_file_size_mb: 25,
      max_duration_minutes: 120,
      notes: [
        'All providers support the listed formats',
        'OpenAI Whisper has a 25MB file size limit',
        'Deepgram supports files up to 100MB',
        'For longer files, consider chunking the audio'
      ]
    });
  } catch (error) {
    console.error('[STT Routes] Error getting formats:', error);
    return c.json({ error: 'Failed to get formats' }, 500);
  }
});

export default stt;
