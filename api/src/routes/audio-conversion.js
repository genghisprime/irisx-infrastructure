/**
 * Audio Conversion Routes
 * API for audio format conversion and processing
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import audioConversion from '../services/audio-conversion.js';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import os from 'os';

const router = new Hono();

// Temp directory for uploads
const uploadDir = process.env.AUDIO_UPLOAD_DIR || path.join(os.tmpdir(), 'irisx-audio-uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(() => {});

// ===========================================
// CONVERSION ENDPOINTS
// ===========================================

/**
 * POST /v1/audio/convert
 * Convert audio file to different format
 */
router.post('/convert', zValidator('json', z.object({
  input_url: z.string().url().optional(),
  input_path: z.string().optional(),
  output_format: z.enum(['mp3', 'wav', 'ogg', 'opus', 'aac', 'm4a', 'flac', 'webm']),
  sample_rate: z.number().int().min(8000).max(192000).optional(),
  channels: z.number().int().min(1).max(2).optional(),
  bitrate: z.string().optional(),
  normalize: z.boolean().optional(),
  trim_start: z.number().min(0).optional(),
  trim_duration: z.number().min(0).optional(),
  fade_in: z.number().min(0).optional(),
  fade_out: z.number().min(0).optional(),
  volume: z.number().min(0).max(10).optional()
})), async (c) => {
  const data = c.req.valid('json');

  if (!data.input_url && !data.input_path) {
    return c.json({ error: 'Either input_url or input_path is required' }, 400);
  }

  let inputPath = data.input_path;

  // Download from URL if provided
  if (data.input_url) {
    const response = await fetch(data.input_url);
    if (!response.ok) {
      return c.json({ error: 'Failed to download audio file' }, 400);
    }
    const buffer = await response.arrayBuffer();
    inputPath = path.join(uploadDir, `${randomUUID()}_input`);
    await fs.writeFile(inputPath, Buffer.from(buffer));
  }

  try {
    const result = await audioConversion.convert(inputPath, data.output_format, {
      sampleRate: data.sample_rate,
      channels: data.channels,
      bitrate: data.bitrate,
      normalize: data.normalize,
      trimStart: data.trim_start,
      trimDuration: data.trim_duration,
      fadeIn: data.fade_in,
      fadeOut: data.fade_out,
      volume: data.volume
    });

    // Get output file info
    const info = await audioConversion.getMediaInfo(result.outputPath);

    return c.json({
      success: true,
      output_path: result.outputPath,
      format: data.output_format,
      duration: info.duration,
      size: info.size,
      sample_rate: info.sampleRate,
      channels: info.channels
    });
  } finally {
    // Clean up downloaded file
    if (data.input_url && inputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
  }
});

/**
 * POST /v1/audio/convert/telephony
 * Convert to telephony-optimized format
 */
router.post('/convert/telephony', zValidator('json', z.object({
  input_url: z.string().url().optional(),
  input_path: z.string().optional(),
  output_format: z.enum(['wav', 'gsm', 'mp3']).default('wav')
})), async (c) => {
  const data = c.req.valid('json');

  if (!data.input_url && !data.input_path) {
    return c.json({ error: 'Either input_url or input_path is required' }, 400);
  }

  let inputPath = data.input_path;

  if (data.input_url) {
    const response = await fetch(data.input_url);
    if (!response.ok) {
      return c.json({ error: 'Failed to download audio file' }, 400);
    }
    const buffer = await response.arrayBuffer();
    inputPath = path.join(uploadDir, `${randomUUID()}_input`);
    await fs.writeFile(inputPath, Buffer.from(buffer));
  }

  try {
    const result = await audioConversion.convertToTelephony(inputPath, data.output_format);
    const info = await audioConversion.getMediaInfo(result.outputPath);

    return c.json({
      success: true,
      output_path: result.outputPath,
      format: data.output_format,
      sample_rate: 8000,
      channels: 1,
      duration: info.duration,
      size: info.size
    });
  } finally {
    if (data.input_url && inputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
  }
});

/**
 * POST /v1/audio/convert/web
 * Convert to web-optimized format
 */
router.post('/convert/web', zValidator('json', z.object({
  input_url: z.string().url().optional(),
  input_path: z.string().optional()
})), async (c) => {
  const data = c.req.valid('json');

  if (!data.input_url && !data.input_path) {
    return c.json({ error: 'Either input_url or input_path is required' }, 400);
  }

  let inputPath = data.input_path;

  if (data.input_url) {
    const response = await fetch(data.input_url);
    if (!response.ok) {
      return c.json({ error: 'Failed to download audio file' }, 400);
    }
    const buffer = await response.arrayBuffer();
    inputPath = path.join(uploadDir, `${randomUUID()}_input`);
    await fs.writeFile(inputPath, Buffer.from(buffer));
  }

  try {
    const result = await audioConversion.convertToWebOptimized(inputPath);
    const info = await audioConversion.getMediaInfo(result.outputPath);

    return c.json({
      success: true,
      output_path: result.outputPath,
      format: 'webm',
      duration: info.duration,
      size: info.size
    });
  } finally {
    if (data.input_url && inputPath) {
      await fs.unlink(inputPath).catch(() => {});
    }
  }
});

// ===========================================
// PROCESSING ENDPOINTS
// ===========================================

/**
 * POST /v1/audio/normalize
 * Normalize audio volume
 */
router.post('/normalize', zValidator('json', z.object({
  input_path: z.string()
})), async (c) => {
  const { input_path } = c.req.valid('json');

  const result = await audioConversion.normalize(input_path);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/trim
 * Trim audio file
 */
router.post('/trim', zValidator('json', z.object({
  input_path: z.string(),
  start_time: z.number().min(0),
  duration: z.number().min(0)
})), async (c) => {
  const { input_path, start_time, duration } = c.req.valid('json');

  const result = await audioConversion.trim(input_path, start_time, duration);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    start_time: result.startTime,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/concatenate
 * Concatenate multiple audio files
 */
router.post('/concatenate', zValidator('json', z.object({
  input_paths: z.array(z.string()).min(2),
  output_format: z.string().optional()
})), async (c) => {
  const { input_paths, output_format } = c.req.valid('json');

  const result = await audioConversion.concatenate(input_paths, null, output_format);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    input_count: result.inputCount,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/split
 * Split audio into chunks
 */
router.post('/split', zValidator('json', z.object({
  input_path: z.string(),
  chunk_duration: z.number().min(1) // seconds
})), async (c) => {
  const { input_path, chunk_duration } = c.req.valid('json');

  const result = await audioConversion.split(input_path, chunk_duration);

  return c.json({
    success: true,
    chunks: result.chunks,
    chunk_count: result.chunks.length,
    output_dir: result.outputDir
  });
});

/**
 * POST /v1/audio/extract-from-video
 * Extract audio from video file
 */
router.post('/extract-from-video', zValidator('json', z.object({
  input_path: z.string(),
  output_format: z.enum(['mp3', 'wav', 'aac', 'ogg']).default('mp3')
})), async (c) => {
  const { input_path, output_format } = c.req.valid('json');

  const result = await audioConversion.extractAudioFromVideo(input_path, output_format);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    format: output_format,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/mix
 * Mix multiple audio tracks
 */
router.post('/mix', zValidator('json', z.object({
  input_paths: z.array(z.string()).min(2),
  volumes: z.array(z.number().min(0).max(2)).optional()
})), async (c) => {
  const { input_paths, volumes } = c.req.valid('json');

  const result = await audioConversion.mixTracks(input_paths, null, volumes);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/remove-silence
 * Remove silence from audio
 */
router.post('/remove-silence', zValidator('json', z.object({
  input_path: z.string(),
  threshold: z.string().default('-50dB'),
  min_duration: z.string().default('0.5')
})), async (c) => {
  const { input_path, threshold, min_duration } = c.req.valid('json');

  const result = await audioConversion.removeSilence(input_path, null, threshold, min_duration);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    duration: info.duration,
    size: info.size
  });
});

/**
 * POST /v1/audio/change-speed
 * Change audio speed/tempo
 */
router.post('/change-speed', zValidator('json', z.object({
  input_path: z.string(),
  speed: z.number().min(0.25).max(4.0)
})), async (c) => {
  const { input_path, speed } = c.req.valid('json');

  const result = await audioConversion.changeSpeed(input_path, speed);
  const info = await audioConversion.getMediaInfo(result.outputPath);

  return c.json({
    success: true,
    output_path: result.outputPath,
    speed: result.speed,
    duration: info.duration,
    size: info.size
  });
});

// ===========================================
// ANALYSIS ENDPOINTS
// ===========================================

/**
 * GET /v1/audio/info
 * Get audio file information
 */
router.get('/info', zValidator('query', z.object({
  path: z.string()
})), async (c) => {
  const { path: filePath } = c.req.valid('query');

  const info = await audioConversion.getMediaInfo(filePath);

  return c.json(info);
});

/**
 * POST /v1/audio/detect-silence
 * Detect silence periods in audio
 */
router.post('/detect-silence', zValidator('json', z.object({
  input_path: z.string(),
  threshold: z.string().default('-50dB'),
  min_duration: z.string().default('0.5')
})), async (c) => {
  const { input_path, threshold, min_duration } = c.req.valid('json');

  const result = await audioConversion.detectSilence(input_path, threshold, min_duration);

  return c.json({
    silences: result.silences,
    total_silence: result.totalSilence,
    silence_count: result.silences.length
  });
});

/**
 * POST /v1/audio/waveform
 * Get waveform data for visualization
 */
router.post('/waveform', zValidator('json', z.object({
  input_path: z.string(),
  samples: z.number().int().min(10).max(1000).default(100)
})), async (c) => {
  const { input_path, samples } = c.req.valid('json');

  const result = await audioConversion.getWaveform(input_path, samples);

  return c.json(result);
});

// ===========================================
// UTILITY ENDPOINTS
// ===========================================

/**
 * GET /v1/audio/formats
 * Get supported formats
 */
router.get('/formats', (c) => {
  const formats = audioConversion.getSupportedFormats();
  return c.json(formats);
});

/**
 * GET /v1/audio/format/:format
 * Get format details
 */
router.get('/format/:format', (c) => {
  const { format } = c.req.param();
  const info = audioConversion.getFormatInfo(format);

  if (!info) {
    return c.json({ error: 'Unknown format' }, 404);
  }

  return c.json(info);
});

/**
 * GET /v1/audio/status
 * Check FFmpeg availability
 */
router.get('/status', async (c) => {
  const status = await audioConversion.checkFFmpeg();
  return c.json(status);
});

/**
 * POST /v1/audio/cleanup
 * Clean up temp files
 */
router.post('/cleanup', zValidator('json', z.object({
  max_age_hours: z.number().int().min(1).max(168).default(24)
})), async (c) => {
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const { max_age_hours } = c.req.valid('json');
  const result = await audioConversion.cleanupOldFiles(max_age_hours);

  return c.json({ cleaned: result.cleaned });
});

/**
 * DELETE /v1/audio/file
 * Delete a specific converted file
 */
router.delete('/file', zValidator('json', z.object({
  path: z.string()
})), async (c) => {
  const { path: filePath } = c.req.valid('json');

  // Security: only allow deletion from temp directory
  const tempDir = process.env.AUDIO_TEMP_DIR || path.join(os.tmpdir(), 'irisx-audio');
  if (!filePath.startsWith(tempDir)) {
    return c.json({ error: 'Cannot delete files outside temp directory' }, 403);
  }

  const result = await audioConversion.cleanup(filePath);
  return c.json(result);
});

export default router;
