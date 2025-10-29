/**
 * Text-to-Speech (TTS) Service
 *
 * Multi-provider TTS with:
 * - OpenAI TTS (primary, fast, $0.015/1K chars)
 * - ElevenLabs TTS (premium quality, $0.30/1K chars)
 * - AWS Polly (fallback, $4/1M chars)
 * - Caching layer (reduce API calls)
 * - Automatic failover
 *
 * Phase 1, Week 5-6
 */

import { query } from '../db/index.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class TTSService {
  constructor() {
    this.cacheDir = process.env.TTS_CACHE_DIR || '/tmp/tts-cache';
    this.providers = ['openai', 'elevenlabs', 'aws_polly'];
    this.defaultVoices = {
      openai: 'alloy',
      elevenlabs: 'rachel',
      aws_polly: 'Joanna'
    };

    // Initialize cache directory
    this.initCache();
  }

  async initCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`[TTS] Cache directory initialized: ${this.cacheDir}`);
    } catch (error) {
      console.error('[TTS] Error initializing cache:', error);
    }
  }

  /**
   * Generate speech from text with automatic provider failover
   *
   * @param {Object} params
   * @param {string} params.text - Text to convert to speech
   * @param {string} params.voice - Voice ID (optional)
   * @param {string} params.provider - Preferred provider (optional)
   * @param {number} params.tenantId - Tenant ID for tracking
   * @param {boolean} params.cache - Use cache (default: true)
   * @returns {Promise<Object>} Audio file info
   */
  async generateSpeech({ text, voice, provider, tenantId, cache = true }) {
    try {
      // Input validation
      if (!text || text.trim().length === 0) {
        throw new Error('Text is required');
      }

      if (text.length > 4096) {
        throw new Error('Text exceeds maximum length of 4096 characters');
      }

      // Check cache first
      if (cache) {
        const cachedAudio = await this.getFromCache(text, voice, provider);
        if (cachedAudio) {
          console.log('[TTS] ✅ Cache hit');
          return cachedAudio;
        }
      }

      // Determine provider order
      const providerOrder = provider
        ? [provider, ...this.providers.filter(p => p !== provider)]
        : this.providers;

      let lastError;

      // Try each provider in order
      for (const currentProvider of providerOrder) {
        try {
          console.log(`[TTS] Attempting ${currentProvider}...`);

          const result = await this.generateWithProvider({
            text,
            voice: voice || this.defaultVoices[currentProvider],
            provider: currentProvider,
            tenantId
          });

          // Cache the result
          if (cache) {
            await this.saveToCache(text, voice, provider, result);
          }

          // Track usage
          await this.trackUsage({
            tenantId,
            provider: currentProvider,
            text,
            audioLengthSeconds: result.duration,
            costCents: result.costCents
          });

          console.log(`[TTS] ✅ Success with ${currentProvider}`);
          return result;

        } catch (error) {
          console.error(`[TTS] ${currentProvider} failed:`, error.message);
          lastError = error;
          continue;  // Try next provider
        }
      }

      // All providers failed
      throw new Error(`All TTS providers failed. Last error: ${lastError.message}`);

    } catch (error) {
      console.error('[TTS] Error generating speech:', error);
      throw error;
    }
  }

  /**
   * Generate speech with specific provider
   */
  async generateWithProvider({ text, voice, provider, tenantId }) {
    switch (provider) {
      case 'openai':
        return await this.generateWithOpenAI(text, voice, tenantId);
      case 'elevenlabs':
        return await this.generateWithElevenLabs(text, voice, tenantId);
      case 'aws_polly':
        return await this.generateWithAWSPolly(text, voice, tenantId);
      default:
        throw new Error(`Unknown TTS provider: ${provider}`);
    }
  }

  /**
   * Generate speech with OpenAI TTS
   * Cost: $0.015 per 1,000 characters
   */
  async generateWithOpenAI(text, voice, tenantId) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const payload = {
      model: 'tts-1',  // or tts-1-hd for higher quality
      input: text,
      voice: voice || 'alloy',  // alloy, echo, fable, onyx, nova, shimmer
      response_format: 'mp3',
      speed: 1.0
    };

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI TTS API error: ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filename = `openai_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp3`;
    const filepath = path.join(this.cacheDir, filename);

    await fs.writeFile(filepath, audioBuffer);

    // Estimate duration (rough: ~150 words per minute, 5 chars per word)
    const estimatedDuration = Math.ceil((text.length / 5) / 150 * 60);

    // Calculate cost: $0.015 per 1,000 characters
    const costCents = Math.ceil((text.length / 1000) * 1.5);

    return {
      filepath,
      filename,
      format: 'mp3',
      provider: 'openai',
      voice,
      duration: estimatedDuration,
      sizeBytes: audioBuffer.length,
      costCents,
      text
    };
  }

  /**
   * Generate speech with ElevenLabs TTS
   * Cost: ~$0.30 per 1,000 characters
   */
  async generateWithElevenLabs(text, voice, tenantId) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    // ElevenLabs voice IDs
    const voiceId = voice || '21m00Tcm4TlvDq8ikWAM';  // Rachel (default)

    const payload = {
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    };

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS API error: ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filename = `elevenlabs_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.mp3`;
    const filepath = path.join(this.cacheDir, filename);

    await fs.writeFile(filepath, audioBuffer);

    // Estimate duration
    const estimatedDuration = Math.ceil((text.length / 5) / 150 * 60);

    // Calculate cost: ~$0.30 per 1,000 characters
    const costCents = Math.ceil((text.length / 1000) * 30);

    return {
      filepath,
      filename,
      format: 'mp3',
      provider: 'elevenlabs',
      voice: voiceId,
      duration: estimatedDuration,
      sizeBytes: audioBuffer.length,
      costCents,
      text
    };
  }

  /**
   * Generate speech with AWS Polly
   * Cost: $4.00 per 1 million characters
   */
  async generateWithAWSPolly(text, voice, tenantId) {
    // TODO: Implement AWS Polly integration
    // This would use AWS SDK
    throw new Error('AWS Polly integration not yet implemented');
  }

  /**
   * Get cached audio
   */
  async getFromCache(text, voice, provider) {
    try {
      const cacheKey = this.getCacheKey(text, voice, provider);
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

      const cacheData = await fs.readFile(cacheFile, 'utf8');
      const cached = JSON.parse(cacheData);

      // Check if audio file still exists
      try {
        await fs.access(cached.filepath);
        return cached;
      } catch {
        // Audio file missing, remove cache entry
        await fs.unlink(cacheFile).catch(() => {});
        return null;
      }
    } catch (error) {
      // Cache miss
      return null;
    }
  }

  /**
   * Save to cache
   */
  async saveToCache(text, voice, provider, result) {
    try {
      const cacheKey = this.getCacheKey(text, voice, provider);
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

      await fs.writeFile(cacheFile, JSON.stringify({
        ...result,
        cachedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error('[TTS] Error saving to cache:', error);
    }
  }

  /**
   * Generate cache key
   */
  getCacheKey(text, voice, provider) {
    const data = `${text}|${voice}|${provider}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Track TTS usage for billing
   */
  async trackUsage({ tenantId, provider, text, audioLengthSeconds, costCents }) {
    try {
      await query(
        `INSERT INTO usage_events (
          tenant_id, event_type, event_data, cost_cents
        ) VALUES ($1, $2, $3, $4)`,
        [
          tenantId,
          'tts_generated',
          JSON.stringify({
            provider,
            textLength: text.length,
            audioLengthSeconds
          }),
          costCents
        ]
      );
    } catch (error) {
      console.error('[TTS] Error tracking usage:', error);
    }
  }

  /**
   * List available voices for a provider
   */
  async listVoices(provider = 'openai') {
    const voices = {
      openai: [
        { id: 'alloy', name: 'Alloy', gender: 'neutral' },
        { id: 'echo', name: 'Echo', gender: 'male' },
        { id: 'fable', name: 'Fable', gender: 'male' },
        { id: 'onyx', name: 'Onyx', gender: 'male' },
        { id: 'nova', name: 'Nova', gender: 'female' },
        { id: 'shimmer', name: 'Shimmer', gender: 'female' }
      ],
      elevenlabs: [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male' },
        { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female' }
      ],
      aws_polly: [
        { id: 'Joanna', name: 'Joanna', gender: 'female', language: 'en-US' },
        { id: 'Matthew', name: 'Matthew', gender: 'male', language: 'en-US' },
        { id: 'Ivy', name: 'Ivy', gender: 'female', language: 'en-US' }
      ]
    };

    return voices[provider] || [];
  }

  /**
   * Clean up old cached files (older than 30 days)
   */
  async cleanupCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      let cleanedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filepath);

        if (stats.mtimeMs < thirtyDaysAgo) {
          await fs.unlink(filepath);
          cleanedCount++;
        }
      }

      console.log(`[TTS] Cleaned up ${cleanedCount} old cache files`);
      return cleanedCount;
    } catch (error) {
      console.error('[TTS] Error cleaning cache:', error);
    }
  }
}

// Singleton instance
const ttsService = new TTSService();

// Clean cache daily at 3 AM
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 3 && now.getMinutes() === 0) {
    ttsService.cleanupCache();
  }
}, 60000);

export default ttsService;
