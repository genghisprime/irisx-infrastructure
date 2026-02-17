/**
 * Answering Machine Detection (AMD) Service
 * Detects whether a call is answered by a human or machine
 */

import { db } from '../database/connection.js';

/**
 * AMD Detection Modes
 */
export const AMD_MODES = {
  SYNC: 'sync',   // Block until detection complete
  ASYNC: 'async', // Return immediately, callback with result
};

/**
 * AMD Results
 */
export const AMD_RESULTS = {
  HUMAN: 'human',
  MACHINE: 'machine',
  UNCERTAIN: 'uncertain',
  SILENCE: 'silence',
  NOTSURE: 'notsure',
  HANGUP: 'hangup',
};

/**
 * AMD Actions
 */
export const AMD_ACTIONS = {
  CONNECT: 'connect',
  HANGUP: 'hangup',
  VOICEMAIL: 'voicemail',
  TRANSFER: 'transfer',
  CALLBACK: 'callback',
  IVR: 'ivr',
};

class AMDService {
  constructor() {
    this.defaultConfig = {
      initialSilenceMs: 2500,
      greetingMaxMs: 1500,
      afterGreetingSilenceMs: 800,
      totalAnalysisMs: 5000,
      minWordLengthMs: 100,
      betweenWordsSilenceMs: 50,
      maxNumberOfWords: 3,
      machineGreetingMinMs: 1500,
      beepDetectionEnabled: true,
      beepFrequencyMin: 350,
      beepFrequencyMax: 950,
      beepDurationMinMs: 200,
    };
  }

  /**
   * Get AMD configuration for tenant/campaign
   */
  async getConfiguration(tenantId, campaignId = null) {
    let config;

    if (campaignId) {
      // Try campaign-specific config first
      const result = await db.query(
        `SELECT * FROM amd_configurations
         WHERE tenant_id = $1 AND campaign_id = $2 AND enabled = true
         LIMIT 1`,
        [tenantId, campaignId]
      );
      config = result.rows[0];
    }

    if (!config) {
      // Fall back to tenant default
      const result = await db.query(
        `SELECT * FROM amd_configurations
         WHERE tenant_id = $1 AND campaign_id IS NULL AND enabled = true
         LIMIT 1`,
        [tenantId]
      );
      config = result.rows[0];
    }

    return config || this.defaultConfig;
  }

  /**
   * Create AMD configuration
   */
  async createConfiguration(tenantId, data) {
    const result = await db.query(
      `INSERT INTO amd_configurations (
        tenant_id, campaign_id, name, enabled,
        detection_mode, initial_silence_ms, greeting_max_ms,
        after_greeting_silence_ms, total_analysis_ms,
        min_word_length_ms, between_words_silence_ms, max_number_of_words,
        machine_greeting_min_ms, beep_detection_enabled,
        beep_frequency_min, beep_frequency_max, beep_duration_min_ms,
        human_action, machine_action, uncertain_action,
        human_transfer_to, machine_transfer_to, voicemail_audio_id,
        adaptive_enabled, learning_rate, min_samples_for_adaptation
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      ) RETURNING *`,
      [
        tenantId,
        data.campaign_id || null,
        data.name,
        data.enabled !== false,
        data.detection_mode || 'async',
        data.initial_silence_ms || 2500,
        data.greeting_max_ms || 1500,
        data.after_greeting_silence_ms || 800,
        data.total_analysis_ms || 5000,
        data.min_word_length_ms || 100,
        data.between_words_silence_ms || 50,
        data.max_number_of_words || 3,
        data.machine_greeting_min_ms || 1500,
        data.beep_detection_enabled !== false,
        data.beep_frequency_min || 350,
        data.beep_frequency_max || 950,
        data.beep_duration_min_ms || 200,
        data.human_action || 'connect',
        data.machine_action || 'voicemail',
        data.uncertain_action || 'connect',
        data.human_transfer_to || null,
        data.machine_transfer_to || null,
        data.voicemail_audio_id || null,
        data.adaptive_enabled !== false,
        data.learning_rate || 0.05,
        data.min_samples_for_adaptation || 100,
      ]
    );

    return result.rows[0];
  }

  /**
   * Update AMD configuration
   */
  async updateConfiguration(tenantId, configId, data) {
    const fields = [];
    const values = [tenantId, configId];
    let paramIndex = 3;

    const allowedFields = [
      'name', 'enabled', 'detection_mode',
      'initial_silence_ms', 'greeting_max_ms', 'after_greeting_silence_ms',
      'total_analysis_ms', 'min_word_length_ms', 'between_words_silence_ms',
      'max_number_of_words', 'machine_greeting_min_ms', 'beep_detection_enabled',
      'beep_frequency_min', 'beep_frequency_max', 'beep_duration_min_ms',
      'human_action', 'machine_action', 'uncertain_action',
      'human_transfer_to', 'machine_transfer_to', 'voicemail_audio_id',
      'adaptive_enabled', 'learning_rate', 'min_samples_for_adaptation',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        values.push(data[field]);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push('updated_at = NOW()');

    const result = await db.query(
      `UPDATE amd_configurations SET ${fields.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Analyze audio for AMD detection
   * This is a simplified algorithm - production would use ML models
   */
  async analyzeAudio(audioData, config) {
    const startTime = Date.now();
    const analysis = {
      result: AMD_RESULTS.UNCERTAIN,
      confidence: 0.5,
      detectionTimeMs: 0,
      initialSilenceMs: 0,
      greetingDurationMs: 0,
      wordsDetected: 0,
      avgWordDurationMs: 0,
      beepDetected: false,
      beepFrequency: null,
      energyLevel: 0,
      zeroCrossingRate: 0,
      voiceActivityRatio: 0,
    };

    try {
      // Analyze initial silence
      analysis.initialSilenceMs = this.detectInitialSilence(audioData, config);

      // Too much initial silence - likely machine or dead air
      if (analysis.initialSilenceMs > config.initial_silence_ms) {
        analysis.result = AMD_RESULTS.SILENCE;
        analysis.confidence = 0.8;
        analysis.detectionTimeMs = Date.now() - startTime;
        return analysis;
      }

      // Detect voice activity
      const voiceSegments = this.detectVoiceActivity(audioData, config);
      analysis.voiceActivityRatio = voiceSegments.totalDuration / audioData.duration;

      // Count words (voice segments)
      analysis.wordsDetected = voiceSegments.segments.length;
      analysis.greetingDurationMs = voiceSegments.totalDuration;

      if (voiceSegments.segments.length > 0) {
        analysis.avgWordDurationMs = voiceSegments.totalDuration / voiceSegments.segments.length;
      }

      // Detect beep (answering machine indicator)
      if (config.beep_detection_enabled) {
        const beepResult = this.detectBeep(audioData, config);
        analysis.beepDetected = beepResult.detected;
        analysis.beepFrequency = beepResult.frequency;

        if (beepResult.detected) {
          analysis.result = AMD_RESULTS.MACHINE;
          analysis.confidence = 0.95;
          analysis.detectionTimeMs = Date.now() - startTime;
          return analysis;
        }
      }

      // Calculate energy level
      analysis.energyLevel = this.calculateEnergy(audioData);
      analysis.zeroCrossingRate = this.calculateZeroCrossingRate(audioData);

      // Apply decision logic
      const decision = this.makeDecision(analysis, config);
      analysis.result = decision.result;
      analysis.confidence = decision.confidence;

    } catch (error) {
      console.error('AMD analysis error:', error);
      analysis.result = AMD_RESULTS.NOTSURE;
      analysis.confidence = 0.0;
    }

    analysis.detectionTimeMs = Date.now() - startTime;
    return analysis;
  }

  /**
   * Detect initial silence duration
   */
  detectInitialSilence(audioData, config) {
    const threshold = 0.01; // Silence threshold
    let silenceMs = 0;

    if (!audioData.samples || audioData.samples.length === 0) {
      return config.initial_silence_ms + 1; // Assume silence
    }

    const samplesPerMs = audioData.sampleRate / 1000;

    for (let i = 0; i < audioData.samples.length; i++) {
      if (Math.abs(audioData.samples[i]) > threshold) {
        break;
      }
      silenceMs = i / samplesPerMs;
    }

    return Math.floor(silenceMs);
  }

  /**
   * Detect voice activity segments
   */
  detectVoiceActivity(audioData, config) {
    const threshold = 0.02;
    const minSegmentMs = config.min_word_length_ms;
    const minGapMs = config.between_words_silence_ms;
    const segments = [];
    let totalDuration = 0;

    if (!audioData.samples || audioData.samples.length === 0) {
      return { segments, totalDuration };
    }

    const samplesPerMs = audioData.sampleRate / 1000;
    let segmentStart = null;
    let lastVoice = 0;

    for (let i = 0; i < audioData.samples.length; i++) {
      const isVoice = Math.abs(audioData.samples[i]) > threshold;
      const currentMs = i / samplesPerMs;

      if (isVoice) {
        if (segmentStart === null) {
          segmentStart = currentMs;
        }
        lastVoice = currentMs;
      } else if (segmentStart !== null) {
        // Check if gap is long enough to end segment
        if (currentMs - lastVoice > minGapMs) {
          const duration = lastVoice - segmentStart;
          if (duration >= minSegmentMs) {
            segments.push({ start: segmentStart, end: lastVoice, duration });
            totalDuration += duration;
          }
          segmentStart = null;
        }
      }
    }

    // Handle last segment
    if (segmentStart !== null) {
      const duration = lastVoice - segmentStart;
      if (duration >= minSegmentMs) {
        segments.push({ start: segmentStart, end: lastVoice, duration });
        totalDuration += duration;
      }
    }

    return { segments, totalDuration };
  }

  /**
   * Detect answering machine beep
   */
  detectBeep(audioData, config) {
    const result = { detected: false, frequency: null };

    if (!audioData.samples || audioData.samples.length === 0) {
      return result;
    }

    // Simple frequency detection using zero-crossing rate
    // In production, use FFT for accurate frequency detection
    const sampleRate = audioData.sampleRate;
    const windowSize = Math.floor(sampleRate * (config.beep_duration_min_ms / 1000));

    // Analyze last portion of audio (where beep typically occurs)
    const startIndex = Math.max(0, audioData.samples.length - windowSize * 2);

    let zeroCrossings = 0;
    for (let i = startIndex + 1; i < audioData.samples.length; i++) {
      if ((audioData.samples[i] >= 0) !== (audioData.samples[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }

    const duration = (audioData.samples.length - startIndex) / sampleRate;
    const estimatedFrequency = zeroCrossings / (2 * duration);

    if (estimatedFrequency >= config.beep_frequency_min &&
        estimatedFrequency <= config.beep_frequency_max) {
      // Check if energy is consistent (beep characteristic)
      const windowEnergy = this.calculateWindowEnergy(
        audioData.samples.slice(startIndex),
        windowSize
      );

      if (windowEnergy.variance < 0.1) { // Low variance = consistent tone
        result.detected = true;
        result.frequency = Math.round(estimatedFrequency);
      }
    }

    return result;
  }

  /**
   * Calculate audio energy level
   */
  calculateEnergy(audioData) {
    if (!audioData.samples || audioData.samples.length === 0) {
      return 0;
    }

    let sumSquares = 0;
    for (const sample of audioData.samples) {
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / audioData.samples.length);
  }

  /**
   * Calculate energy in windows
   */
  calculateWindowEnergy(samples, windowSize) {
    const energies = [];

    for (let i = 0; i < samples.length; i += windowSize) {
      const window = samples.slice(i, i + windowSize);
      let sumSquares = 0;
      for (const sample of window) {
        sumSquares += sample * sample;
      }
      energies.push(Math.sqrt(sumSquares / window.length));
    }

    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / energies.length;

    return { mean, variance, energies };
  }

  /**
   * Calculate zero-crossing rate
   */
  calculateZeroCrossingRate(audioData) {
    if (!audioData.samples || audioData.samples.length < 2) {
      return 0;
    }

    let crossings = 0;
    for (let i = 1; i < audioData.samples.length; i++) {
      if ((audioData.samples[i] >= 0) !== (audioData.samples[i - 1] >= 0)) {
        crossings++;
      }
    }

    return crossings / audioData.samples.length;
  }

  /**
   * Make AMD decision based on analysis
   */
  makeDecision(analysis, config) {
    let result = AMD_RESULTS.UNCERTAIN;
    let confidence = 0.5;

    // Rule-based decision tree
    // In production, this would be an ML model

    // Long greeting = likely machine
    if (analysis.greetingDurationMs > config.machine_greeting_min_ms) {
      result = AMD_RESULTS.MACHINE;
      confidence = Math.min(0.9, 0.6 + (analysis.greetingDurationMs / 5000) * 0.3);
    }
    // Many words in greeting = likely machine
    else if (analysis.wordsDetected > config.max_number_of_words) {
      result = AMD_RESULTS.MACHINE;
      confidence = Math.min(0.85, 0.5 + (analysis.wordsDetected / 10) * 0.35);
    }
    // Short greeting with few words = likely human
    else if (analysis.greetingDurationMs <= config.greeting_max_ms &&
             analysis.wordsDetected <= config.max_number_of_words &&
             analysis.wordsDetected > 0) {
      result = AMD_RESULTS.HUMAN;
      confidence = 0.75 + (1 - analysis.greetingDurationMs / config.greeting_max_ms) * 0.15;
    }
    // Very short or no greeting
    else if (analysis.wordsDetected === 0 && analysis.initialSilenceMs < config.initial_silence_ms) {
      result = AMD_RESULTS.UNCERTAIN;
      confidence = 0.4;
    }

    // Adjust confidence based on voice activity ratio
    if (analysis.voiceActivityRatio > 0.8) {
      // High continuous voice = likely machine
      if (result === AMD_RESULTS.UNCERTAIN) {
        result = AMD_RESULTS.MACHINE;
      }
      confidence = Math.min(1.0, confidence + 0.1);
    }

    return { result, confidence };
  }

  /**
   * Record AMD result
   */
  async recordResult(tenantId, callId, analysis, config, actionTaken = null) {
    const result = await db.query(
      `INSERT INTO amd_results (
        tenant_id, call_id, campaign_id, configuration_id,
        result, confidence,
        detection_time_ms, initial_silence_ms, greeting_duration_ms, total_audio_ms,
        words_detected, avg_word_duration_ms, beep_detected, beep_frequency,
        energy_level, zero_crossing_rate, voice_activity_ratio,
        action_taken, phone_number, call_started_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
      ) RETURNING *`,
      [
        tenantId,
        callId,
        config.campaign_id || null,
        config.id || null,
        analysis.result,
        analysis.confidence,
        analysis.detectionTimeMs,
        analysis.initialSilenceMs,
        analysis.greetingDurationMs,
        analysis.totalAudioMs || null,
        analysis.wordsDetected,
        analysis.avgWordDurationMs,
        analysis.beepDetected,
        analysis.beepFrequency,
        analysis.energyLevel,
        analysis.zeroCrossingRate,
        analysis.voiceActivityRatio,
        actionTaken,
        analysis.phoneNumber || null,
      ]
    );

    // Update analytics
    await this.updateAnalytics(tenantId, config.campaign_id, config.id, analysis, actionTaken);

    return result.rows[0];
  }

  /**
   * Update hourly analytics
   */
  async updateAnalytics(tenantId, campaignId, configId, analysis, actionTaken) {
    const hourBucket = new Date();
    hourBucket.setMinutes(0, 0, 0);

    await db.query(
      `INSERT INTO amd_analytics (
        tenant_id, campaign_id, configuration_id, hour_bucket,
        total_calls, human_count, machine_count, uncertain_count, silence_count, hangup_count,
        avg_detection_time_ms, avg_confidence,
        connected_count, voicemail_count, hangup_action_count
      ) VALUES (
        $1, $2, $3, $4,
        1,
        CASE WHEN $5 = 'human' THEN 1 ELSE 0 END,
        CASE WHEN $5 = 'machine' THEN 1 ELSE 0 END,
        CASE WHEN $5 = 'uncertain' THEN 1 ELSE 0 END,
        CASE WHEN $5 = 'silence' THEN 1 ELSE 0 END,
        CASE WHEN $5 = 'hangup' THEN 1 ELSE 0 END,
        $6, $7,
        CASE WHEN $8 = 'connect' THEN 1 ELSE 0 END,
        CASE WHEN $8 = 'voicemail' THEN 1 ELSE 0 END,
        CASE WHEN $8 = 'hangup' THEN 1 ELSE 0 END
      )
      ON CONFLICT (tenant_id, campaign_id, configuration_id, hour_bucket)
      DO UPDATE SET
        total_calls = amd_analytics.total_calls + 1,
        human_count = amd_analytics.human_count + CASE WHEN $5 = 'human' THEN 1 ELSE 0 END,
        machine_count = amd_analytics.machine_count + CASE WHEN $5 = 'machine' THEN 1 ELSE 0 END,
        uncertain_count = amd_analytics.uncertain_count + CASE WHEN $5 = 'uncertain' THEN 1 ELSE 0 END,
        silence_count = amd_analytics.silence_count + CASE WHEN $5 = 'silence' THEN 1 ELSE 0 END,
        hangup_count = amd_analytics.hangup_count + CASE WHEN $5 = 'hangup' THEN 1 ELSE 0 END,
        avg_detection_time_ms = (amd_analytics.avg_detection_time_ms * amd_analytics.total_calls + $6) / (amd_analytics.total_calls + 1),
        avg_confidence = (amd_analytics.avg_confidence * amd_analytics.total_calls + $7) / (amd_analytics.total_calls + 1),
        connected_count = amd_analytics.connected_count + CASE WHEN $8 = 'connect' THEN 1 ELSE 0 END,
        voicemail_count = amd_analytics.voicemail_count + CASE WHEN $8 = 'voicemail' THEN 1 ELSE 0 END,
        hangup_action_count = amd_analytics.hangup_action_count + CASE WHEN $8 = 'hangup' THEN 1 ELSE 0 END`,
      [
        tenantId,
        campaignId,
        configId,
        hourBucket,
        analysis.result,
        analysis.detectionTimeMs,
        analysis.confidence,
        actionTaken,
      ]
    );
  }

  /**
   * Get AMD analytics
   */
  async getAnalytics(tenantId, options = {}) {
    const { campaignId, startDate, endDate, groupBy = 'hour' } = options;

    let dateFilter = '';
    const params = [tenantId];
    let paramIndex = 2;

    if (campaignId) {
      dateFilter += ` AND campaign_id = $${paramIndex}`;
      params.push(campaignId);
      paramIndex++;
    }

    if (startDate) {
      dateFilter += ` AND hour_bucket >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      dateFilter += ` AND hour_bucket <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    let groupClause = 'hour_bucket';
    if (groupBy === 'day') {
      groupClause = 'DATE(hour_bucket)';
    }

    const result = await db.query(
      `SELECT
        ${groupClause} as period,
        SUM(total_calls) as total_calls,
        SUM(human_count) as human_count,
        SUM(machine_count) as machine_count,
        SUM(uncertain_count) as uncertain_count,
        SUM(silence_count) as silence_count,
        ROUND(AVG(avg_detection_time_ms)::numeric, 2) as avg_detection_time_ms,
        ROUND(AVG(avg_confidence)::numeric, 4) as avg_confidence,
        SUM(connected_count) as connected_count,
        SUM(voicemail_count) as voicemail_count,
        ROUND(
          CASE WHEN SUM(total_calls) > 0
          THEN SUM(human_count)::numeric / SUM(total_calls) * 100
          ELSE 0 END, 2
        ) as human_rate,
        ROUND(
          CASE WHEN SUM(total_calls) > 0
          THEN SUM(machine_count)::numeric / SUM(total_calls) * 100
          ELSE 0 END, 2
        ) as machine_rate
       FROM amd_analytics
       WHERE tenant_id = $1 ${dateFilter}
       GROUP BY ${groupClause}
       ORDER BY ${groupClause} DESC
       LIMIT 168`, // 7 days of hourly data
      params
    );

    return result.rows;
  }

  /**
   * Get recent AMD results for verification
   */
  async getResultsForVerification(tenantId, limit = 50) {
    const result = await db.query(
      `SELECT r.*, c.name as campaign_name
       FROM amd_results r
       LEFT JOIN campaigns c ON r.campaign_id = c.id
       WHERE r.tenant_id = $1
         AND r.verified_result IS NULL
         AND r.result IN ('uncertain', 'notsure')
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows;
  }

  /**
   * Verify AMD result (for training)
   */
  async verifyResult(tenantId, resultId, verifiedResult, agentId) {
    const result = await db.query(
      `UPDATE amd_results
       SET verified_result = $3, verified_by = $4, verified_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, resultId, verifiedResult, agentId]
    );

    // Update accuracy analytics
    if (result.rows[0]) {
      await this.updateAccuracyStats(tenantId, result.rows[0]);
    }

    return result.rows[0];
  }

  /**
   * Update accuracy statistics based on verification
   */
  async updateAccuracyStats(tenantId, verifiedResult) {
    const hourBucket = new Date(verifiedResult.created_at);
    hourBucket.setMinutes(0, 0, 0);

    const isCorrectHuman = verifiedResult.result === 'human' && verifiedResult.verified_result === 'human';
    const isCorrectMachine = verifiedResult.result === 'machine' && verifiedResult.verified_result === 'machine';
    const isFalsePositiveHuman = verifiedResult.result === 'human' && verifiedResult.verified_result === 'machine';
    const isFalseNegativeHuman = verifiedResult.result === 'machine' && verifiedResult.verified_result === 'human';

    await db.query(
      `UPDATE amd_analytics SET
        verified_count = verified_count + 1,
        correct_human = correct_human + $3,
        correct_machine = correct_machine + $4,
        false_positive_human = false_positive_human + $5,
        false_negative_human = false_negative_human + $6
       WHERE tenant_id = $1
         AND campaign_id IS NOT DISTINCT FROM $7
         AND hour_bucket = $2`,
      [
        tenantId,
        hourBucket,
        isCorrectHuman ? 1 : 0,
        isCorrectMachine ? 1 : 0,
        isFalsePositiveHuman ? 1 : 0,
        isFalseNegativeHuman ? 1 : 0,
        verifiedResult.campaign_id,
      ]
    );
  }

  /**
   * Determine action based on AMD result
   */
  getActionForResult(result, config) {
    switch (result) {
      case AMD_RESULTS.HUMAN:
        return config.human_action || AMD_ACTIONS.CONNECT;
      case AMD_RESULTS.MACHINE:
        return config.machine_action || AMD_ACTIONS.VOICEMAIL;
      case AMD_RESULTS.UNCERTAIN:
      case AMD_RESULTS.NOTSURE:
        return config.uncertain_action || AMD_ACTIONS.CONNECT;
      case AMD_RESULTS.SILENCE:
      case AMD_RESULTS.HANGUP:
        return AMD_ACTIONS.HANGUP;
      default:
        return AMD_ACTIONS.CONNECT;
    }
  }

  /**
   * Get all configurations for tenant
   */
  async getConfigurations(tenantId) {
    const result = await db.query(
      `SELECT ac.*, c.name as campaign_name
       FROM amd_configurations ac
       LEFT JOIN campaigns c ON ac.campaign_id = c.id
       WHERE ac.tenant_id = $1
       ORDER BY ac.campaign_id NULLS FIRST, ac.name`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Delete configuration
   */
  async deleteConfiguration(tenantId, configId) {
    await db.query(
      'DELETE FROM amd_configurations WHERE tenant_id = $1 AND id = $2',
      [tenantId, configId]
    );
  }
}

export const amdService = new AMDService();
export default amdService;
