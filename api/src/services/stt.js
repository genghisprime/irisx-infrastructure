/**
 * Speech-to-Text (STT) Service
 * Multi-provider transcription service with automatic failover
 *
 * Providers:
 * - OpenAI Whisper (primary) - $0.006 per minute
 * - Deepgram - $0.0043 per minute
 * - AWS Transcribe - $0.024 per minute
 *
 * Based on: IRIS_Media_Processing_TTS_STT.md
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class STTService {
  constructor() {
    this.tempDir = process.env.STT_TEMP_DIR || '/tmp/stt-uploads';
    this.providers = ['openai', 'deepgram', 'aws_transcribe'];
    this.supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
    this.maxFileSizeMB = 25; // OpenAI Whisper limit

    // Initialize temp directory
    this.initTempDir();
  }

  async initTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`[STT] Temp directory initialized: ${this.tempDir}`);
    } catch (error) {
      console.error('[STT] Error initializing temp directory:', error);
    }
  }

  /**
   * Transcribe audio file to text
   *
   * @param {Object} params
   * @param {Buffer|string} params.audio - Audio file buffer or filepath
   * @param {string} params.filename - Original filename (for format detection)
   * @param {string} params.provider - Preferred provider (optional)
   * @param {string} params.language - Language code (optional, auto-detect if not provided)
   * @param {number} params.tenantId - Tenant ID for tracking
   * @param {boolean} params.timestamps - Include word-level timestamps (optional)
   * @returns {Promise<Object>} Transcription result
   */
  async transcribe({ audio, filename, provider, language, tenantId, timestamps = false }) {
    try {
      // Input validation
      if (!audio) {
        throw new Error('Audio is required');
      }

      // Determine file format
      const format = this.getFileFormat(filename);
      if (!this.supportedFormats.includes(format)) {
        throw new Error(`Unsupported audio format: ${format}. Supported formats: ${this.supportedFormats.join(', ')}`);
      }

      // Save audio to temp file if it's a buffer
      let audioPath;
      let shouldCleanup = false;

      if (Buffer.isBuffer(audio)) {
        audioPath = path.join(this.tempDir, `${crypto.randomBytes(16).toString('hex')}.${format}`);
        await fs.writeFile(audioPath, audio);
        shouldCleanup = true;
      } else {
        audioPath = audio;
      }

      // Check file size
      const stats = await fs.stat(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > this.maxFileSizeMB) {
        if (shouldCleanup) await fs.unlink(audioPath).catch(() => {});
        throw new Error(`File size (${fileSizeMB.toFixed(2)} MB) exceeds maximum of ${this.maxFileSizeMB} MB`);
      }

      // Determine provider order
      const providerOrder = provider
        ? [provider, ...this.providers.filter(p => p !== provider)]
        : this.providers;

      let lastError;

      // Try each provider in order
      for (const currentProvider of providerOrder) {
        try {
          console.log(`[STT] Attempting ${currentProvider}...`);

          const startTime = Date.now();
          const result = await this.transcribeWithProvider({
            audioPath,
            format,
            provider: currentProvider,
            language,
            timestamps
          });
          const processingTime = Date.now() - startTime;

          // Track usage
          await this.trackUsage({
            tenantId,
            provider: currentProvider,
            audioDurationSeconds: result.duration,
            costCents: result.costCents,
            processingTimeMs: processingTime
          });

          // Cleanup temp file
          if (shouldCleanup) {
            await fs.unlink(audioPath).catch(() => {});
          }

          console.log(`[STT] Success with ${currentProvider}`);
          return {
            ...result,
            provider: currentProvider,
            processingTimeMs: processingTime
          };

        } catch (error) {
          console.error(`[STT] ${currentProvider} failed:`, error.message);
          lastError = error;
          continue;
        }
      }

      // Cleanup on failure
      if (shouldCleanup) {
        await fs.unlink(audioPath).catch(() => {});
      }

      // All providers failed
      throw new Error(`All STT providers failed. Last error: ${lastError.message}`);

    } catch (error) {
      console.error('[STT] Error transcribing audio:', error);
      throw error;
    }
  }

  /**
   * Transcribe with specific provider
   */
  async transcribeWithProvider({ audioPath, format, provider, language, timestamps }) {
    switch (provider) {
      case 'openai':
        return await this.transcribeWithOpenAI(audioPath, format, language, timestamps);
      case 'deepgram':
        return await this.transcribeWithDeepgram(audioPath, format, language, timestamps);
      case 'aws_transcribe':
        return await this.transcribeWithAWSTranscribe(audioPath, format, language);
      default:
        throw new Error(`Unknown STT provider: ${provider}`);
    }
  }

  /**
   * Transcribe with OpenAI Whisper
   * Cost: $0.006 per minute
   */
  async transcribeWithOpenAI(audioPath, format, language, timestamps) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Read file
    const audioData = await fs.readFile(audioPath);

    // Create form data
    const formData = new FormData();
    formData.append('file', new Blob([audioData]), `audio.${format}`);
    formData.append('model', 'whisper-1');

    if (language) {
      formData.append('language', language);
    }

    if (timestamps) {
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');
    } else {
      formData.append('response_format', 'json');
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Whisper API error: ${error}`);
    }

    const result = await response.json();

    // Estimate duration from file size (rough: 1 MB = ~1 minute for MP3)
    const stats = await fs.stat(audioPath);
    const estimatedDuration = Math.ceil(stats.size / (1024 * 1024) * 60);

    // Calculate cost: $0.006 per minute
    const costCents = Math.ceil((estimatedDuration / 60) * 0.6);

    return {
      text: result.text,
      duration: result.duration || estimatedDuration,
      language: result.language || language || 'en',
      words: timestamps && result.words ? result.words : null,
      segments: timestamps && result.segments ? result.segments : null,
      costCents
    };
  }

  /**
   * Transcribe with Deepgram
   * Cost: $0.0043 per minute (Nova-2 model)
   */
  async transcribeWithDeepgram(audioPath, format, language, timestamps) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    // Read file
    const audioData = await fs.readFile(audioPath);

    // Build query params
    const params = new URLSearchParams({
      model: 'nova-2',
      smart_format: 'true',
      punctuate: 'true',
      diarize: 'false'
    });

    if (language) {
      params.set('language', language);
    } else {
      params.set('detect_language', 'true');
    }

    if (timestamps) {
      params.set('utterances', 'true');
    }

    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': `audio/${format}`
      },
      body: audioData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deepgram API error: ${error}`);
    }

    const result = await response.json();
    const channel = result.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      throw new Error('No transcription result from Deepgram');
    }

    // Get duration from metadata or estimate
    const duration = result.metadata?.duration || 0;

    // Calculate cost: $0.0043 per minute
    const costCents = Math.ceil((duration / 60) * 0.43);

    return {
      text: alternative.transcript,
      duration: Math.round(duration),
      language: result.metadata?.detected_language || language || 'en',
      words: timestamps && alternative.words ? alternative.words : null,
      confidence: alternative.confidence,
      costCents
    };
  }

  /**
   * Transcribe with AWS Transcribe
   * Cost: $0.024 per minute
   *
   * AWS Transcribe Features:
   * - Automatic language detection
   * - Speaker diarization (identify speakers)
   * - Custom vocabulary support
   * - Medical and call analytics transcription
   * - Real-time streaming transcription
   *
   * Process:
   * 1. Upload audio to S3 (temporary)
   * 2. Start transcription job
   * 3. Poll for completion
   * 4. Retrieve results
   * 5. Clean up S3 file
   */
  async transcribeWithAWSTranscribe(audioPath, format, language) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';
    const bucket = process.env.AWS_S3_BUCKET || 'irisx-media';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    // Generate unique job name
    const jobName = `transcribe_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const s3Key = `transcribe-temp/${jobName}.${format}`;

    // Read audio file
    const audioData = await fs.readFile(audioPath);

    // 1. Upload to S3
    await this.uploadToS3(audioData, bucket, s3Key, format, accessKeyId, secretAccessKey, region);

    try {
      // 2. Start transcription job
      await this.startTranscriptionJob({
        jobName,
        s3Uri: `s3://${bucket}/${s3Key}`,
        format,
        language,
        accessKeyId,
        secretAccessKey,
        region
      });

      // 3. Poll for completion (max 5 minutes)
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const pollInterval = 5000; // 5 seconds
      const startTime = Date.now();

      let jobStatus = 'IN_PROGRESS';
      let transcriptUri = null;

      while (jobStatus === 'IN_PROGRESS' && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const status = await this.getTranscriptionJobStatus(jobName, accessKeyId, secretAccessKey, region);
        jobStatus = status.TranscriptionJob?.TranscriptionJobStatus;
        transcriptUri = status.TranscriptionJob?.Transcript?.TranscriptFileUri;

        console.log(`[STT] AWS Transcribe job ${jobName}: ${jobStatus}`);

        if (jobStatus === 'FAILED') {
          throw new Error(`Transcription failed: ${status.TranscriptionJob?.FailureReason}`);
        }
      }

      if (jobStatus !== 'COMPLETED') {
        throw new Error('Transcription timed out');
      }

      // 4. Retrieve results
      const transcriptResponse = await fetch(transcriptUri);
      if (!transcriptResponse.ok) {
        throw new Error('Failed to fetch transcript');
      }

      const transcriptData = await transcriptResponse.json();
      const transcript = transcriptData.results?.transcripts?.[0]?.transcript || '';
      const items = transcriptData.results?.items || [];

      // Get audio duration from items
      let duration = 0;
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        duration = Math.ceil(parseFloat(lastItem.end_time || 0));
      } else {
        // Estimate from file size
        const stats = await fs.stat(audioPath);
        duration = Math.ceil(stats.size / (1024 * 1024) * 60);
      }

      // Calculate cost: $0.024 per minute
      const costCents = Math.ceil((duration / 60) * 2.4);

      return {
        text: transcript,
        duration,
        language: language || 'en-US',
        words: items.filter(i => i.type === 'pronunciation').map(i => ({
          word: i.alternatives?.[0]?.content || '',
          start_time: parseFloat(i.start_time),
          end_time: parseFloat(i.end_time),
          confidence: parseFloat(i.alternatives?.[0]?.confidence || 0)
        })),
        costCents
      };

    } finally {
      // 5. Clean up S3 file
      await this.deleteFromS3(bucket, s3Key, accessKeyId, secretAccessKey, region).catch(err => {
        console.error('[STT] Failed to cleanup S3 file:', err);
      });
    }
  }

  /**
   * Upload file to S3
   */
  async uploadToS3(data, bucket, key, format, accessKeyId, secretAccessKey, region) {
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.slice(0, 8);
    const service = 's3';

    const payloadHash = crypto.createHash('sha256').update(data).digest('hex');

    const canonicalHeaders = [
      `content-type:audio/${format}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${timestamp}`
    ].join('\n') + '\n';

    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      '/' + key,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': `audio/${format}`,
        'Host': host,
        'X-Amz-Date': timestamp,
        'X-Amz-Content-Sha256': payloadHash,
        'Authorization': authorization
      },
      body: data
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`S3 upload failed: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFromS3(bucket, key, accessKeyId, secretAccessKey, region) {
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.slice(0, 8);
    const service = 's3';

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    const canonicalHeaders = [
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${timestamp}`
    ].join('\n') + '\n';

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'DELETE',
      '/' + key,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    await fetch(`https://${host}/${key}`, {
      method: 'DELETE',
      headers: {
        'Host': host,
        'X-Amz-Date': timestamp,
        'X-Amz-Content-Sha256': payloadHash,
        'Authorization': authorization
      }
    });
  }

  /**
   * Start AWS Transcribe job
   */
  async startTranscriptionJob({ jobName, s3Uri, format, language, accessKeyId, secretAccessKey, region }) {
    const host = `transcribe.${region}.amazonaws.com`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.slice(0, 8);
    const service = 'transcribe';

    const mediaFormat = {
      'mp3': 'mp3',
      'mp4': 'mp4',
      'wav': 'wav',
      'flac': 'flac',
      'ogg': 'ogg-opus',
      'webm': 'webm'
    }[format] || 'mp3';

    const payload = {
      TranscriptionJobName: jobName,
      Media: {
        MediaFileUri: s3Uri
      },
      MediaFormat: mediaFormat,
      LanguageCode: language || 'en-US',
      Settings: {
        ShowSpeakerLabels: false,
        ShowAlternatives: false
      }
    };

    const payloadString = JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    const canonicalHeaders = [
      'content-type:application/x-amz-json-1.1',
      `host:${host}`,
      `x-amz-date:${timestamp}`,
      'x-amz-target:Transcribe.StartTranscriptionJob'
    ].join('\n') + '\n';

    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';

    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'Host': host,
        'X-Amz-Date': timestamp,
        'X-Amz-Target': 'Transcribe.StartTranscriptionJob',
        'Authorization': authorization
      },
      body: payloadString
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AWS Transcribe start job failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get AWS Transcribe job status
   */
  async getTranscriptionJobStatus(jobName, accessKeyId, secretAccessKey, region) {
    const host = `transcribe.${region}.amazonaws.com`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.slice(0, 8);
    const service = 'transcribe';

    const payload = {
      TranscriptionJobName: jobName
    };

    const payloadString = JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

    const canonicalHeaders = [
      'content-type:application/x-amz-json-1.1',
      `host:${host}`,
      `x-amz-date:${timestamp}`,
      'x-amz-target:Transcribe.GetTranscriptionJob'
    ].join('\n') + '\n';

    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';

    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const signingKey = this.getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'Host': host,
        'X-Amz-Date': timestamp,
        'X-Amz-Target': 'Transcribe.GetTranscriptionJob',
        'Authorization': authorization
      },
      body: payloadString
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AWS Transcribe get status failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Generate AWS Signature V4 signing key
   */
  getSigningKey(key, dateStamp, regionName, serviceName) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  /**
   * Get file format from filename
   */
  getFileFormat(filename) {
    if (!filename) return 'mp3';
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || 'mp3';
  }

  /**
   * Track STT usage for billing
   */
  async trackUsage({ tenantId, provider, audioDurationSeconds, costCents, processingTimeMs }) {
    try {
      await query(
        `INSERT INTO usage_events (
          tenant_id, event_type, duration_seconds, cost_cents, metadata
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          'stt_transcription',
          audioDurationSeconds,
          costCents,
          JSON.stringify({
            provider,
            processingTimeMs
          })
        ]
      );
    } catch (error) {
      console.error('[STT] Error tracking usage:', error);
    }
  }

  /**
   * List available STT providers
   */
  listProviders() {
    return [
      {
        id: 'openai',
        name: 'OpenAI Whisper',
        cost_per_minute_cents: 0.6,
        quality: 'high',
        speed: 'fast',
        max_file_size_mb: 25,
        supported_formats: this.supportedFormats,
        features: ['language_detection', 'word_timestamps', 'multilingual'],
        recommended: true
      },
      {
        id: 'deepgram',
        name: 'Deepgram Nova-2',
        cost_per_minute_cents: 0.43,
        quality: 'high',
        speed: 'fastest',
        max_file_size_mb: 100,
        supported_formats: this.supportedFormats,
        features: ['language_detection', 'word_timestamps', 'diarization', 'real_time'],
        recommended: false
      },
      {
        id: 'aws_transcribe',
        name: 'AWS Transcribe',
        cost_per_minute_cents: 2.4,
        quality: 'good',
        speed: 'medium',
        max_file_size_mb: 500,
        supported_formats: ['mp3', 'mp4', 'wav', 'flac', 'ogg'],
        features: ['language_detection', 'speaker_diarization', 'custom_vocabulary'],
        recommended: false
      }
    ];
  }

  /**
   * List supported languages
   */
  listLanguages() {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'nl', name: 'Dutch' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'pl', name: 'Polish' },
      { code: 'tr', name: 'Turkish' }
    ];
  }

  /**
   * Get transcription job status (for batch processing)
   */
  async getJobStatus(jobId, tenantId) {
    try {
      const result = await query(
        `SELECT * FROM transcription_jobs WHERE id = $1 AND tenant_id = $2`,
        [jobId, tenantId]
      );

      if (result.rows.length === 0) {
        throw new Error('Job not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('[STT] Error getting job status:', error);
      throw error;
    }
  }

  /**
   * Get transcription stats for a tenant
   */
  async getStats(tenantId, period = 'today') {
    try {
      let dateFilter;
      switch (period) {
        case 'today':
          dateFilter = "event_timestamp >= CURRENT_DATE";
          break;
        case 'week':
          dateFilter = "event_timestamp >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case 'month':
          dateFilter = "event_timestamp >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        default:
          dateFilter = "event_timestamp >= CURRENT_DATE";
      }

      // Build where clause
      let whereClause = dateFilter;
      const params = [];

      if (tenantId) {
        params.push(tenantId);
        whereClause += ` AND tenant_id = $${params.length}`;
      }

      const result = await query(`
        SELECT
          COUNT(*) as total_transcriptions,
          COALESCE(SUM(cost_cents), 0) as total_cost_cents,
          COALESCE(SUM(duration_seconds), 0) as total_duration_seconds
        FROM usage_events
        WHERE event_type = 'stt_transcription' AND ${whereClause}
      `, params);

      // Get provider breakdown
      const providerBreakdown = await query(`
        SELECT
          metadata->>'provider' as provider,
          COUNT(*) as count,
          COALESCE(SUM(cost_cents), 0) as cost_cents
        FROM usage_events
        WHERE event_type = 'stt_transcription' AND ${whereClause}
        GROUP BY metadata->>'provider'
      `, params);

      return {
        period,
        stats: result.rows[0],
        providers: providerBreakdown.rows
      };
    } catch (error) {
      console.error('[STT] Error getting stats:', error);
      throw error;
    }
  }
}

// Singleton instance
const sttService = new STTService();

export default sttService;
