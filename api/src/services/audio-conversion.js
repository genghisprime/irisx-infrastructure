/**
 * Audio Conversion Service
 * FFmpeg-based audio format conversion and processing
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import db from '../db/connection.js';

class AudioConversionService {
  constructor() {
    this.tempDir = process.env.AUDIO_TEMP_DIR || path.join(os.tmpdir(), 'irisx-audio');
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create temp directory:', err);
    }
  }

  // ===========================================
  // FORMAT CONVERSION
  // ===========================================

  /**
   * Convert audio between formats
   */
  async convert(inputPath, outputFormat, options = {}) {
    const {
      sampleRate = null,
      channels = null,
      bitrate = null,
      codec = null,
      normalize = false,
      trimStart = null,
      trimDuration = null,
      fadeIn = null,
      fadeOut = null,
      volume = null
    } = options;

    const outputPath = path.join(this.tempDir, `${randomUUID()}.${outputFormat}`);
    const args = ['-i', inputPath];

    // Audio codec
    if (codec) {
      args.push('-c:a', codec);
    } else {
      // Default codecs by format
      const codecMap = {
        'mp3': 'libmp3lame',
        'wav': 'pcm_s16le',
        'ogg': 'libvorbis',
        'opus': 'libopus',
        'aac': 'aac',
        'm4a': 'aac',
        'flac': 'flac',
        'webm': 'libopus'
      };
      if (codecMap[outputFormat]) {
        args.push('-c:a', codecMap[outputFormat]);
      }
    }

    // Sample rate
    if (sampleRate) {
      args.push('-ar', sampleRate.toString());
    }

    // Channels (1=mono, 2=stereo)
    if (channels) {
      args.push('-ac', channels.toString());
    }

    // Bitrate
    if (bitrate) {
      args.push('-b:a', bitrate);
    }

    // Audio filters
    const filters = [];

    // Volume adjustment
    if (volume !== null) {
      filters.push(`volume=${volume}`);
    }

    // Normalization
    if (normalize) {
      filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    // Trim
    if (trimStart !== null) {
      args.push('-ss', trimStart.toString());
    }
    if (trimDuration !== null) {
      args.push('-t', trimDuration.toString());
    }

    // Fade effects
    if (fadeIn !== null) {
      filters.push(`afade=t=in:st=0:d=${fadeIn}`);
    }
    if (fadeOut !== null) {
      // Need to know duration for fade out
      const info = await this.getMediaInfo(inputPath);
      if (info.duration) {
        const fadeStart = info.duration - fadeOut;
        filters.push(`afade=t=out:st=${fadeStart}:d=${fadeOut}`);
      }
    }

    // Apply filters
    if (filters.length > 0) {
      args.push('-af', filters.join(','));
    }

    // Output
    args.push('-y', outputPath);

    await this.runFFmpeg(args);

    return {
      outputPath,
      format: outputFormat,
      originalPath: inputPath
    };
  }

  /**
   * Convert to telephony-optimized format (8kHz mono)
   */
  async convertToTelephony(inputPath, outputFormat = 'wav') {
    return this.convert(inputPath, outputFormat, {
      sampleRate: 8000,
      channels: 1,
      codec: outputFormat === 'wav' ? 'pcm_mulaw' : null, // μ-law for telephony
      bitrate: outputFormat === 'mp3' ? '32k' : null
    });
  }

  /**
   * Convert to high-quality format
   */
  async convertToHighQuality(inputPath, outputFormat = 'wav') {
    return this.convert(inputPath, outputFormat, {
      sampleRate: 44100,
      channels: 2,
      bitrate: outputFormat === 'mp3' ? '320k' : null
    });
  }

  /**
   * Convert to web-optimized format
   */
  async convertToWebOptimized(inputPath) {
    return this.convert(inputPath, 'webm', {
      codec: 'libopus',
      sampleRate: 48000,
      channels: 2,
      bitrate: '128k'
    });
  }

  // ===========================================
  // AUDIO PROCESSING
  // ===========================================

  /**
   * Normalize audio volume
   */
  async normalize(inputPath, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = path.join(this.tempDir, `${randomUUID()}${ext}`);
    }

    // Two-pass normalization
    const args = [
      '-i', inputPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f', 'null',
      '-'
    ];

    await this.runFFmpeg(args);

    // Second pass with actual normalization
    const normalizeArgs = [
      '-i', inputPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-y', outputPath
    ];

    await this.runFFmpeg(normalizeArgs);

    return { outputPath };
  }

  /**
   * Trim audio
   */
  async trim(inputPath, startTime, duration, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = path.join(this.tempDir, `${randomUUID()}${ext}`);
    }

    const args = [
      '-i', inputPath,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-c', 'copy',
      '-y', outputPath
    ];

    await this.runFFmpeg(args);

    return { outputPath, startTime, duration };
  }

  /**
   * Concatenate audio files
   */
  async concatenate(inputPaths, outputPath = null, format = null) {
    if (!format) {
      format = path.extname(inputPaths[0]).slice(1);
    }
    if (!outputPath) {
      outputPath = path.join(this.tempDir, `${randomUUID()}.${format}`);
    }

    // Create concat file
    const concatFile = path.join(this.tempDir, `${randomUUID()}_concat.txt`);
    const concatContent = inputPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(concatFile, concatContent);

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      '-y', outputPath
    ];

    try {
      await this.runFFmpeg(args);
      return { outputPath, inputCount: inputPaths.length };
    } finally {
      // Cleanup concat file
      await fs.unlink(concatFile).catch(() => {});
    }
  }

  /**
   * Split audio into chunks
   */
  async split(inputPath, chunkDuration, outputDir = null) {
    if (!outputDir) {
      outputDir = path.join(this.tempDir, randomUUID());
      await fs.mkdir(outputDir, { recursive: true });
    }

    const ext = path.extname(inputPath);
    const outputPattern = path.join(outputDir, `chunk_%03d${ext}`);

    const args = [
      '-i', inputPath,
      '-f', 'segment',
      '-segment_time', chunkDuration.toString(),
      '-c', 'copy',
      outputPattern
    ];

    await this.runFFmpeg(args);

    // List created chunks
    const files = await fs.readdir(outputDir);
    const chunks = files
      .filter(f => f.startsWith('chunk_'))
      .sort()
      .map(f => path.join(outputDir, f));

    return { chunks, outputDir };
  }

  /**
   * Extract audio from video
   */
  async extractAudioFromVideo(videoPath, outputFormat = 'mp3') {
    const outputPath = path.join(this.tempDir, `${randomUUID()}.${outputFormat}`);

    const args = [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', outputFormat === 'mp3' ? 'libmp3lame' : 'copy',
      '-y', outputPath
    ];

    await this.runFFmpeg(args);

    return { outputPath, format: outputFormat };
  }

  /**
   * Mix multiple audio tracks
   */
  async mixTracks(inputPaths, outputPath = null, volumes = null) {
    if (!outputPath) {
      outputPath = path.join(this.tempDir, `${randomUUID()}.mp3`);
    }

    const inputs = [];
    const filterParts = [];

    inputPaths.forEach((p, i) => {
      inputs.push('-i', p);
      const vol = volumes && volumes[i] !== undefined ? volumes[i] : 1;
      filterParts.push(`[${i}:a]volume=${vol}[a${i}]`);
    });

    const mixInputs = inputPaths.map((_, i) => `[a${i}]`).join('');
    const filter = filterParts.join(';') + `;${mixInputs}amix=inputs=${inputPaths.length}:duration=longest[out]`;

    const args = [
      ...inputs,
      '-filter_complex', filter,
      '-map', '[out]',
      '-y', outputPath
    ];

    await this.runFFmpeg(args);

    return { outputPath };
  }

  /**
   * Apply silence detection and removal
   */
  async removeSilence(inputPath, outputPath = null, threshold = '-50dB', duration = '0.5') {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = path.join(this.tempDir, `${randomUUID()}${ext}`);
    }

    const args = [
      '-i', inputPath,
      '-af', `silenceremove=stop_periods=-1:stop_duration=${duration}:stop_threshold=${threshold}`,
      '-y', outputPath
    ];

    await this.runFFmpeg(args);

    return { outputPath };
  }

  /**
   * Change audio speed/tempo
   */
  async changeSpeed(inputPath, speed, outputPath = null) {
    if (!outputPath) {
      const ext = path.extname(inputPath);
      outputPath = path.join(this.tempDir, `${randomUUID()}${ext}`);
    }

    // atempo filter works best between 0.5 and 2.0
    // For larger changes, chain multiple atempo filters
    let tempoFilter = '';
    let remainingSpeed = speed;

    while (remainingSpeed > 2.0) {
      tempoFilter += 'atempo=2.0,';
      remainingSpeed /= 2.0;
    }
    while (remainingSpeed < 0.5) {
      tempoFilter += 'atempo=0.5,';
      remainingSpeed /= 0.5;
    }
    tempoFilter += `atempo=${remainingSpeed}`;

    const args = [
      '-i', inputPath,
      '-af', tempoFilter,
      '-y', outputPath
    ];

    await this.runFFmpeg(args);

    return { outputPath, speed };
  }

  // ===========================================
  // ANALYSIS
  // ===========================================

  /**
   * Get media information
   */
  async getMediaInfo(filePath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      const proc = spawn(this.ffprobePath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const audioStream = info.streams?.find(s => s.codec_type === 'audio');

          resolve({
            duration: parseFloat(info.format?.duration) || 0,
            size: parseInt(info.format?.size) || 0,
            bitrate: parseInt(info.format?.bit_rate) || 0,
            format: info.format?.format_name,
            codec: audioStream?.codec_name,
            sampleRate: parseInt(audioStream?.sample_rate) || 0,
            channels: audioStream?.channels || 0,
            channelLayout: audioStream?.channel_layout
          });
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
        }
      });
    });
  }

  /**
   * Detect silence periods
   */
  async detectSilence(filePath, threshold = '-50dB', minDuration = '0.5') {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-af', `silencedetect=noise=${threshold}:d=${minDuration}`,
        '-f', 'null',
        '-'
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', () => {
        // Parse silence detection output
        const silences = [];
        const startMatches = stderr.matchAll(/silence_start: ([\d.]+)/g);
        const endMatches = stderr.matchAll(/silence_end: ([\d.]+)/g);

        const starts = [...startMatches].map(m => parseFloat(m[1]));
        const ends = [...endMatches].map(m => parseFloat(m[1]));

        for (let i = 0; i < starts.length; i++) {
          silences.push({
            start: starts[i],
            end: ends[i] || null,
            duration: ends[i] ? ends[i] - starts[i] : null
          });
        }

        resolve({ silences, totalSilence: silences.reduce((sum, s) => sum + (s.duration || 0), 0) });
      });
    });
  }

  /**
   * Get audio waveform data
   */
  async getWaveform(filePath, samples = 100) {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-af', `asetnsamples=${samples},astats=metadata=1:reset=1`,
        '-show_entries', 'frame_tags=lavfi.astats.Overall.Peak_level',
        '-of', 'csv=p=0',
        '-f', 'null',
        '-'
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', () => {
        // Simple peak detection from stderr
        const peaks = [];
        const matches = stderr.matchAll(/peak_level=([\d.-]+)/gi);
        for (const match of matches) {
          peaks.push(parseFloat(match[1]));
        }

        resolve({ samples: peaks.length, waveform: peaks });
      });
    });
  }

  // ===========================================
  // UTILITIES
  // ===========================================

  /**
   * Run FFmpeg command
   */
  async runFFmpeg(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed (code ${code}): ${stderr}`));
        } else {
          resolve({ success: true });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });
    });
  }

  /**
   * Check if FFmpeg is available
   */
  async checkFFmpeg() {
    try {
      await this.runFFmpeg(['-version']);
      return { available: true };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  /**
   * Clean up temp files
   */
  async cleanup(filePath) {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Clean up old temp files (older than maxAge hours)
   */
  async cleanupOldFiles(maxAgeHours = 24) {
    const files = await fs.readdir(this.tempDir);
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(this.tempDir, file);
      try {
        const stat = await fs.stat(filePath);
        if (now - stat.mtime.getTime() > maxAgeMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (err) {
        // Ignore errors
      }
    }

    return { cleaned };
  }

  // ===========================================
  // SUPPORTED FORMATS
  // ===========================================

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return {
      input: ['mp3', 'wav', 'ogg', 'opus', 'aac', 'm4a', 'flac', 'webm', 'wma', 'amr', 'gsm', 'mp4', 'mkv', 'avi'],
      output: ['mp3', 'wav', 'ogg', 'opus', 'aac', 'm4a', 'flac', 'webm'],
      telephony: ['wav', 'gsm', 'mp3'],
      web: ['mp3', 'ogg', 'webm', 'aac']
    };
  }

  /**
   * Get format info
   */
  getFormatInfo(format) {
    const formats = {
      mp3: { name: 'MP3', codec: 'libmp3lame', mime: 'audio/mpeg', lossy: true },
      wav: { name: 'WAV', codec: 'pcm_s16le', mime: 'audio/wav', lossy: false },
      ogg: { name: 'Ogg Vorbis', codec: 'libvorbis', mime: 'audio/ogg', lossy: true },
      opus: { name: 'Opus', codec: 'libopus', mime: 'audio/opus', lossy: true },
      aac: { name: 'AAC', codec: 'aac', mime: 'audio/aac', lossy: true },
      m4a: { name: 'M4A', codec: 'aac', mime: 'audio/mp4', lossy: true },
      flac: { name: 'FLAC', codec: 'flac', mime: 'audio/flac', lossy: false },
      webm: { name: 'WebM', codec: 'libopus', mime: 'audio/webm', lossy: true }
    };

    return formats[format] || null;
  }
}

export default new AudioConversionService();
