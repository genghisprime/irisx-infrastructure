/**
 * Text-to-Speech API Routes
 * Phase 1, Week 5-6
 *
 * Endpoints:
 * - POST /v1/tts/generate     - Generate speech from text
 * - GET  /v1/tts/voices       - List available voices
 * - GET  /v1/tts/providers    - List TTS providers
 */

import { Hono } from 'hono';
import ttsService from '../services/tts.js';

const tts = new Hono();

/**
 * Generate speech from text
 * POST /v1/tts/generate
 */
tts.post('/generate', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { text, voice, provider, cache } = body;

    // Validate input
    if (!text) {
      return c.json({ error: 'Missing required field: text' }, 400);
    }

    if (text.length > 4096) {
      return c.json({ error: 'Text exceeds maximum length of 4096 characters' }, 400);
    }

    // Generate speech
    const result = await ttsService.generateSpeech({
      text,
      voice,
      provider,
      tenantId,
      cache: cache !== false  // Default to true
    });

    return c.json({
      audio: {
        filepath: result.filepath,
        filename: result.filename,
        format: result.format,
        provider: result.provider,
        voice: result.voice,
        duration_seconds: result.duration,
        size_bytes: result.sizeBytes,
        cost_cents: result.costCents,
        cached: result.cachedAt ? true : false
      }
    });
  } catch (error) {
    console.error('[API] Error generating TTS:', error);
    return c.json({
      error: 'Failed to generate speech',
      message: error.message
    }, 500);
  }
});

/**
 * List available voices for a provider
 * GET /v1/tts/voices
 */
tts.get('/voices', async (c) => {
  try {
    const provider = c.req.query('provider') || 'openai';

    const voices = await ttsService.listVoices(provider);

    return c.json({
      provider,
      voices
    });
  } catch (error) {
    console.error('[API] Error listing voices:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * List TTS providers
 * GET /v1/tts/providers
 */
tts.get('/providers', async (c) => {
  try {
    const providers = [
      {
        id: 'openai',
        name: 'OpenAI TTS',
        cost_per_1k_chars: 1.5,  // $0.015
        quality: 'high',
        speed: 'fast',
        default_voice: 'alloy',
        recommended: true
      },
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        cost_per_1k_chars: 30,  // $0.30
        quality: 'premium',
        speed: 'medium',
        default_voice: 'rachel',
        recommended: false
      },
      {
        id: 'aws_polly',
        name: 'AWS Polly',
        cost_per_1k_chars: 0.4,  // $0.004
        quality: 'good',
        speed: 'fast',
        default_voice: 'Joanna',
        recommended: false
      }
    ];

    return c.json({ providers });
  } catch (error) {
    console.error('[API] Error listing providers:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default tts;
