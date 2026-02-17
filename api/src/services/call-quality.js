/**
 * Call Quality Monitoring Service
 * E-Model MOS calculation, RTCP metrics, carrier quality scoring
 * Based on ITU-T G.107 E-Model specification
 */

import db from '../db/connection.js';

// Codec quality parameters for E-Model calculation
const CODEC_PARAMS = {
  'PCMU': { r0: 93.2, ie_base: 0, name: 'G.711 μ-law' },      // Best quality
  'PCMA': { r0: 93.2, ie_base: 0, name: 'G.711 A-law' },      // Best quality
  'Opus': { r0: 94.0, ie_base: 0, name: 'Opus' },              // Best quality, adaptive
  'G729': { r0: 93.2, ie_base: 11, name: 'G.729' },            // Compressed, lower quality
  'G722': { r0: 93.2, ie_base: 0, name: 'G.722 Wideband' },    // Wideband
  'GSM': { r0: 93.2, ie_base: 20, name: 'GSM-FR' },            // Mobile codec
  'iLBC': { r0: 93.2, ie_base: 10, name: 'iLBC' },             // Internet low bitrate
  'speex': { r0: 93.2, ie_base: 5, name: 'Speex' },            // Variable quality
};

// Default alert thresholds
const DEFAULT_THRESHOLDS = {
  warning: {
    mos: 3.0,
    jitter: 30,      // ms
    packet_loss: 3.0, // %
    latency: 150,    // ms
  },
  critical: {
    mos: 2.5,
    jitter: 50,
    packet_loss: 5.0,
    latency: 200,
  },
};

class CallQualityService {
  // =========================================
  // E-MODEL MOS CALCULATION
  // =========================================

  /**
   * Get codec parameters for E-Model calculation
   */
  getCodecParams(codecName) {
    const normalized = codecName?.toUpperCase() || 'PCMU';
    return CODEC_PARAMS[normalized] || CODEC_PARAMS['PCMU'];
  }

  /**
   * Calculate R-Factor using E-Model (ITU-T G.107)
   *
   * R = R0 - Is - Id - Ie + A
   * Where:
   *   R0 = Basic signal-to-noise ratio (93.2 for G.711)
   *   Is = Impairments occurring simultaneously with voice (0-10)
   *   Id = Impairments caused by delay (0-25)
   *   Ie = Impairments caused by codec + packet loss (0-40)
   *   A  = Advantage factor (0 for wired, 5 for mobile)
   */
  calculateRFactor(params) {
    const { codec, packet_loss, latency, jitter } = params;

    // R0: Basic signal-to-noise ratio
    const R0 = codec.r0;

    // Is: Impairments occurring simultaneously with voice signal
    // (Quantization noise, sidetone, etc.) - typically 0 for VoIP
    const Is = 0;

    // Id: Impairments caused by delay
    // Formula: Id = 0.024*d + 0.11*(d-177.3)*H(d-177.3)
    // where H(x) = 0 if x<0, else 1
    let Id = 0;
    if (latency < 177.3) {
      Id = 0.024 * latency;
    } else {
      Id = 0.024 * latency + 0.11 * (latency - 177.3);
    }

    // Ie: Equipment impairment factor (codec + packet loss)
    // Formula: Ie = Ie_base + (95 - Ie_base) * (packet_loss / (packet_loss + Bpl))
    // Bpl = Packet Loss Robustness Factor (codec-specific, ~25 for most)
    const Bpl = 25;
    const Ie = codec.ie_base + (95 - codec.ie_base) * (packet_loss / (packet_loss + Bpl));

    // A: Advantage factor (0 for landline, 5 for mobile, 10 for satellite)
    const A = 0;

    // Calculate R-Factor
    let R = R0 - Is - Id - Ie + A;

    // Jitter penalty (practical adjustment not in standard E-Model)
    if (jitter > 30) {
      R -= (jitter - 30) * 0.1;
    }

    // Clamp to valid range [0, 100]
    return Math.max(0, Math.min(100, R));
  }

  /**
   * Convert R-Factor to MOS (ITU-T G.107)
   *
   * Formula: MOS = 1 + 0.035*R + 7*10^-6*R*(R-60)*(100-R)
   */
  rFactorToMOS(R) {
    if (R < 0) return 1.0;
    if (R > 100) return 4.5;

    const MOS = 1 + 0.035 * R + 0.000007 * R * (R - 60) * (100 - R);

    // Round to 1 decimal place and clamp
    return Math.max(1.0, Math.min(5.0, Math.round(MOS * 10) / 10));
  }

  /**
   * Get quality label from MOS score
   */
  getQualityLabel(mos) {
    if (mos >= 4.3) return 'Excellent';
    if (mos >= 4.0) return 'Good';
    if (mos >= 3.6) return 'Fair';
    if (mos >= 3.1) return 'Poor';
    if (mos >= 2.6) return 'Bad';
    return 'Unacceptable';
  }

  /**
   * Calculate quality metrics from RTCP stats
   */
  calculateQualityMetrics(rtcpStats) {
    // Calculate averages
    const jitter_avg = ((rtcpStats.jitter_in || 0) + (rtcpStats.jitter_out || 0)) / 2;
    const packet_loss_avg = ((rtcpStats.packet_loss_in || 0) + (rtcpStats.packet_loss_out || 0)) / 2;
    const latency = (rtcpStats.rtt || 0) / 2; // One-way latency

    // Get codec parameters
    const codecParams = this.getCodecParams(rtcpStats.codec);

    // Calculate R-Factor
    const r_factor = this.calculateRFactor({
      codec: codecParams,
      packet_loss: packet_loss_avg,
      latency,
      jitter: jitter_avg,
    });

    // Convert to MOS
    const mos = this.rFactorToMOS(r_factor);

    // Get quality label
    const quality = this.getQualityLabel(mos);

    return {
      mos,
      r_factor: Math.round(r_factor * 100) / 100,
      quality,
      jitter_avg: Math.round(jitter_avg * 100) / 100,
      jitter_in: rtcpStats.jitter_in,
      jitter_out: rtcpStats.jitter_out,
      packet_loss_avg: Math.round(packet_loss_avg * 100) / 100,
      packet_loss_in: rtcpStats.packet_loss_in,
      packet_loss_out: rtcpStats.packet_loss_out,
      latency: Math.round(latency * 100) / 100,
      rtt: rtcpStats.rtt,
      codec: rtcpStats.codec || 'PCMU',
      packets_sent: rtcpStats.packets_sent || 0,
      packets_received: rtcpStats.packets_received || 0,
      packets_lost: rtcpStats.packets_lost || 0,
    };
  }

  // =========================================
  // METRICS STORAGE
  // =========================================

  /**
   * Store quality metrics for a call
   */
  async storeMetrics(callId, tenantId, metrics, metadata = {}) {
    const result = await db.query(`
      INSERT INTO call_quality_metrics (
        call_id, tenant_id, mos, r_factor, quality,
        jitter_avg, jitter_in, jitter_out,
        packet_loss_avg, packet_loss_in, packet_loss_out,
        latency, rtt, codec,
        packets_sent, packets_received, packets_lost,
        carrier_id, agent_id, direction
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      callId,
      tenantId,
      metrics.mos,
      metrics.r_factor,
      metrics.quality,
      metrics.jitter_avg,
      metrics.jitter_in,
      metrics.jitter_out,
      metrics.packet_loss_avg,
      metrics.packet_loss_in,
      metrics.packet_loss_out,
      metrics.latency,
      metrics.rtt,
      metrics.codec,
      metrics.packets_sent,
      metrics.packets_received,
      metrics.packets_lost,
      metadata.carrier_id || null,
      metadata.agent_id || null,
      metadata.direction || null
    ]);

    return result.rows[0];
  }

  /**
   * Get quality metrics for a call
   */
  async getCallMetrics(callId, tenantId) {
    const result = await db.query(`
      SELECT * FROM call_quality_metrics
      WHERE call_id = $1 AND tenant_id = $2
      ORDER BY time ASC
    `, [callId, tenantId]);

    return result.rows;
  }

  /**
   * Get quality summary for a call
   */
  async getCallSummary(callId, tenantId) {
    // Try to get existing summary
    let result = await db.query(`
      SELECT * FROM call_quality_summary
      WHERE call_id = $1 AND tenant_id = $2
    `, [callId, tenantId]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Calculate summary from metrics
    result = await db.query(`
      SELECT
        AVG(mos) as avg_mos,
        MIN(mos) as min_mos,
        MAX(mos) as max_mos,
        AVG(r_factor) as avg_r_factor,
        AVG(jitter_avg) as avg_jitter,
        MAX(jitter_avg) as max_jitter,
        AVG(packet_loss_avg) as avg_packet_loss,
        MAX(packet_loss_avg) as max_packet_loss,
        AVG(latency) as avg_latency,
        MAX(latency) as max_latency,
        COUNT(*) as sample_count,
        MAX(codec) as codec,
        MAX(carrier_id) as carrier_id,
        MAX(agent_id) as agent_id
      FROM call_quality_metrics
      WHERE call_id = $1 AND tenant_id = $2
    `, [callId, tenantId]);

    if (result.rows.length === 0 || !result.rows[0].avg_mos) {
      return null;
    }

    const summary = result.rows[0];
    summary.final_quality = this.getQualityLabel(parseFloat(summary.avg_mos));

    return summary;
  }

  /**
   * Update or create call quality summary (called at end of call)
   */
  async updateCallSummary(callId, tenantId) {
    const summary = await this.getCallSummary(callId, tenantId);

    if (!summary || !summary.avg_mos) {
      return null;
    }

    // Get alert count
    const alertResult = await db.query(`
      SELECT COUNT(*) as count FROM call_quality_alerts
      WHERE call_id = $1
    `, [callId]);

    const alertCount = parseInt(alertResult.rows[0].count);

    // Upsert summary
    const result = await db.query(`
      INSERT INTO call_quality_summary (
        call_id, tenant_id, avg_mos, min_mos, max_mos, final_quality,
        avg_r_factor, avg_jitter, max_jitter, avg_packet_loss, max_packet_loss,
        avg_latency, max_latency, sample_count, alert_count,
        carrier_id, agent_id, codec
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (call_id)
      DO UPDATE SET
        avg_mos = $3, min_mos = $4, max_mos = $5, final_quality = $6,
        avg_r_factor = $7, avg_jitter = $8, max_jitter = $9,
        avg_packet_loss = $10, max_packet_loss = $11,
        avg_latency = $12, max_latency = $13,
        sample_count = $14, alert_count = $15,
        carrier_id = $16, agent_id = $17, codec = $18,
        updated_at = NOW()
      RETURNING *
    `, [
      callId,
      tenantId,
      summary.avg_mos,
      summary.min_mos,
      summary.max_mos,
      summary.final_quality,
      summary.avg_r_factor,
      summary.avg_jitter,
      summary.max_jitter,
      summary.avg_packet_loss,
      summary.max_packet_loss,
      summary.avg_latency,
      summary.max_latency,
      summary.sample_count,
      alertCount,
      summary.carrier_id,
      summary.agent_id,
      summary.codec
    ]);

    return result.rows[0];
  }

  // =========================================
  // QUALITY ALERTS
  // =========================================

  /**
   * Get alert thresholds for tenant
   */
  async getAlertThresholds(tenantId) {
    const result = await db.query(`
      SELECT * FROM quality_alert_thresholds
      WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      return DEFAULT_THRESHOLDS;
    }

    const row = result.rows[0];
    return {
      warning: {
        mos: parseFloat(row.warning_mos),
        jitter: parseFloat(row.warning_jitter),
        packet_loss: parseFloat(row.warning_packet_loss),
        latency: parseFloat(row.warning_latency),
      },
      critical: {
        mos: parseFloat(row.critical_mos),
        jitter: parseFloat(row.critical_jitter),
        packet_loss: parseFloat(row.critical_packet_loss),
        latency: parseFloat(row.critical_latency),
      },
      notifications: {
        email: row.notify_email,
        sms: row.notify_sms,
        webhook: row.notify_webhook,
        emails: row.notification_emails || [],
      }
    };
  }

  /**
   * Update alert thresholds for tenant
   */
  async updateAlertThresholds(tenantId, thresholds) {
    const result = await db.query(`
      INSERT INTO quality_alert_thresholds (
        tenant_id,
        warning_mos, warning_jitter, warning_packet_loss, warning_latency,
        critical_mos, critical_jitter, critical_packet_loss, critical_latency,
        notify_email, notify_sms, notify_webhook, notification_emails
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        warning_mos = COALESCE($2, quality_alert_thresholds.warning_mos),
        warning_jitter = COALESCE($3, quality_alert_thresholds.warning_jitter),
        warning_packet_loss = COALESCE($4, quality_alert_thresholds.warning_packet_loss),
        warning_latency = COALESCE($5, quality_alert_thresholds.warning_latency),
        critical_mos = COALESCE($6, quality_alert_thresholds.critical_mos),
        critical_jitter = COALESCE($7, quality_alert_thresholds.critical_jitter),
        critical_packet_loss = COALESCE($8, quality_alert_thresholds.critical_packet_loss),
        critical_latency = COALESCE($9, quality_alert_thresholds.critical_latency),
        notify_email = COALESCE($10, quality_alert_thresholds.notify_email),
        notify_sms = COALESCE($11, quality_alert_thresholds.notify_sms),
        notify_webhook = COALESCE($12, quality_alert_thresholds.notify_webhook),
        notification_emails = COALESCE($13, quality_alert_thresholds.notification_emails),
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId,
      thresholds.warning?.mos,
      thresholds.warning?.jitter,
      thresholds.warning?.packet_loss,
      thresholds.warning?.latency,
      thresholds.critical?.mos,
      thresholds.critical?.jitter,
      thresholds.critical?.packet_loss,
      thresholds.critical?.latency,
      thresholds.notifications?.email,
      thresholds.notifications?.sms,
      thresholds.notifications?.webhook,
      thresholds.notifications?.emails
    ]);

    return result.rows[0];
  }

  /**
   * Check metrics against thresholds and create alerts if needed
   */
  async checkAndCreateAlerts(callId, tenantId, metrics) {
    const thresholds = await this.getAlertThresholds(tenantId);
    const alerts = [];

    // Check MOS
    if (metrics.mos < thresholds.critical.mos) {
      alerts.push({
        alert_type: 'low_mos',
        severity: 'critical',
        message: `Critical: MOS score is ${metrics.mos} (below ${thresholds.critical.mos})`,
      });
    } else if (metrics.mos < thresholds.warning.mos) {
      alerts.push({
        alert_type: 'low_mos',
        severity: 'warning',
        message: `Warning: MOS score is ${metrics.mos} (below ${thresholds.warning.mos})`,
      });
    }

    // Check Jitter
    if (metrics.jitter_avg > thresholds.critical.jitter) {
      alerts.push({
        alert_type: 'high_jitter',
        severity: 'critical',
        message: `Critical: Jitter is ${metrics.jitter_avg}ms (above ${thresholds.critical.jitter}ms)`,
      });
    } else if (metrics.jitter_avg > thresholds.warning.jitter) {
      alerts.push({
        alert_type: 'high_jitter',
        severity: 'warning',
        message: `Warning: Jitter is ${metrics.jitter_avg}ms (above ${thresholds.warning.jitter}ms)`,
      });
    }

    // Check Packet Loss
    if (metrics.packet_loss_avg > thresholds.critical.packet_loss) {
      alerts.push({
        alert_type: 'high_packet_loss',
        severity: 'critical',
        message: `Critical: Packet loss is ${metrics.packet_loss_avg}% (above ${thresholds.critical.packet_loss}%)`,
      });
    } else if (metrics.packet_loss_avg > thresholds.warning.packet_loss) {
      alerts.push({
        alert_type: 'high_packet_loss',
        severity: 'warning',
        message: `Warning: Packet loss is ${metrics.packet_loss_avg}% (above ${thresholds.warning.packet_loss}%)`,
      });
    }

    // Check Latency
    if (metrics.latency > thresholds.critical.latency) {
      alerts.push({
        alert_type: 'high_latency',
        severity: 'critical',
        message: `Critical: Latency is ${metrics.latency}ms (above ${thresholds.critical.latency}ms)`,
      });
    } else if (metrics.latency > thresholds.warning.latency) {
      alerts.push({
        alert_type: 'high_latency',
        severity: 'warning',
        message: `Warning: Latency is ${metrics.latency}ms (above ${thresholds.warning.latency}ms)`,
      });
    }

    // Create alerts
    const createdAlerts = [];
    for (const alert of alerts) {
      const result = await this.createAlert(callId, tenantId, {
        ...alert,
        mos: metrics.mos,
        jitter: metrics.jitter_avg,
        packet_loss: metrics.packet_loss_avg,
        latency: metrics.latency,
      });
      createdAlerts.push(result);
    }

    return createdAlerts;
  }

  /**
   * Create a quality alert
   */
  async createAlert(callId, tenantId, alertData) {
    const result = await db.query(`
      INSERT INTO call_quality_alerts (
        call_id, tenant_id, alert_type, severity,
        mos, jitter, packet_loss, latency, message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      callId,
      tenantId,
      alertData.alert_type,
      alertData.severity,
      alertData.mos,
      alertData.jitter,
      alertData.packet_loss,
      alertData.latency,
      alertData.message
    ]);

    return result.rows[0];
  }

  /**
   * Get alerts for a call
   */
  async getCallAlerts(callId, tenantId) {
    const result = await db.query(`
      SELECT * FROM call_quality_alerts
      WHERE call_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `, [callId, tenantId]);

    return result.rows;
  }

  /**
   * Get unacknowledged alerts for tenant
   */
  async getUnacknowledgedAlerts(tenantId, options = {}) {
    const { page = 1, limit = 50, severity } = options;

    let query = `
      SELECT cqa.*, c.from_number, c.to_number
      FROM call_quality_alerts cqa
      LEFT JOIN calls c ON c.id = cqa.call_id
      WHERE cqa.tenant_id = $1 AND cqa.acknowledged = false
    `;
    const values = [tenantId];
    let idx = 2;

    if (severity) {
      query += ` AND cqa.severity = $${idx++}`;
      values.push(severity);
    }

    query += ` ORDER BY cqa.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, (page - 1) * limit);

    const result = await db.query(query, values);

    return {
      alerts: result.rows,
      pagination: { page, limit }
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, tenantId, userId) {
    const result = await db.query(`
      UPDATE call_quality_alerts
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [userId, alertId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Alert not found');
    }

    return result.rows[0];
  }

  /**
   * Acknowledge all alerts for a call
   */
  async acknowledgeCallAlerts(callId, tenantId, userId) {
    const result = await db.query(`
      UPDATE call_quality_alerts
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
      WHERE call_id = $2 AND tenant_id = $3 AND acknowledged = false
      RETURNING *
    `, [userId, callId, tenantId]);

    return result.rows;
  }

  // =========================================
  // CARRIER QUALITY SCORING
  // =========================================

  /**
   * Update carrier quality scores (run daily)
   */
  async updateCarrierScores(tenantId, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get quality metrics by carrier for the day
    const result = await db.query(`
      SELECT
        carrier_id,
        AVG(mos) as avg_mos,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mos) as median_mos,
        MIN(mos) as min_mos,
        MAX(mos) as max_mos,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE mos >= 4.3) as excellent_calls,
        COUNT(*) FILTER (WHERE mos >= 4.0 AND mos < 4.3) as good_calls,
        COUNT(*) FILTER (WHERE mos >= 3.6 AND mos < 4.0) as fair_calls,
        COUNT(*) FILTER (WHERE mos < 3.6) as poor_calls,
        AVG(jitter_avg) as avg_jitter,
        AVG(packet_loss_avg) as avg_packet_loss,
        AVG(latency) as avg_latency
      FROM call_quality_metrics
      WHERE tenant_id = $1
        AND DATE(time) = $2
        AND carrier_id IS NOT NULL
      GROUP BY carrier_id
    `, [tenantId, targetDate]);

    const scores = [];

    for (const row of result.rows) {
      const qualityPercentage = row.total_calls > 0
        ? ((parseInt(row.excellent_calls) + parseInt(row.good_calls)) / parseInt(row.total_calls)) * 100
        : 0;

      // Calculate composite quality score (0-100)
      // Weight: MOS 50%, packet loss 20%, jitter 15%, latency 15%
      const mosScore = Math.min(100, (parseFloat(row.avg_mos) / 5) * 100);
      const packetLossScore = Math.max(0, 100 - (parseFloat(row.avg_packet_loss) * 10));
      const jitterScore = Math.max(0, 100 - (parseFloat(row.avg_jitter) * 2));
      const latencyScore = Math.max(0, 100 - (parseFloat(row.avg_latency) / 2));

      const qualityScore = (mosScore * 0.5) + (packetLossScore * 0.2) + (jitterScore * 0.15) + (latencyScore * 0.15);

      const scoreResult = await db.query(`
        INSERT INTO carrier_quality_scores (
          date, tenant_id, carrier_id,
          avg_mos, median_mos, min_mos, max_mos,
          total_calls, excellent_calls, good_calls, fair_calls, poor_calls,
          quality_percentage, avg_jitter, avg_packet_loss, avg_latency,
          quality_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (date, tenant_id, carrier_id)
        DO UPDATE SET
          avg_mos = $4, median_mos = $5, min_mos = $6, max_mos = $7,
          total_calls = $8, excellent_calls = $9, good_calls = $10, fair_calls = $11, poor_calls = $12,
          quality_percentage = $13, avg_jitter = $14, avg_packet_loss = $15, avg_latency = $16,
          quality_score = $17
        RETURNING *
      `, [
        targetDate,
        tenantId,
        row.carrier_id,
        row.avg_mos,
        row.median_mos,
        row.min_mos,
        row.max_mos,
        row.total_calls,
        row.excellent_calls,
        row.good_calls,
        row.fair_calls,
        row.poor_calls,
        qualityPercentage,
        row.avg_jitter,
        row.avg_packet_loss,
        row.avg_latency,
        qualityScore
      ]);

      scores.push(scoreResult.rows[0]);
    }

    return scores;
  }

  /**
   * Get carrier quality rankings
   */
  async getCarrierRankings(tenantId, options = {}) {
    const { days = 30 } = options;

    const result = await db.query(`
      SELECT
        carrier_id,
        AVG(avg_mos) as avg_mos,
        AVG(median_mos) as median_mos,
        SUM(total_calls) as total_calls,
        SUM(excellent_calls) as excellent_calls,
        SUM(poor_calls) as poor_calls,
        AVG(quality_percentage) as quality_percentage,
        AVG(avg_jitter) as avg_jitter,
        AVG(avg_packet_loss) as avg_packet_loss,
        AVG(avg_latency) as avg_latency,
        AVG(quality_score) as quality_score
      FROM carrier_quality_scores
      WHERE tenant_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY carrier_id
      ORDER BY quality_score DESC
    `, [tenantId]);

    return result.rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }

  /**
   * Get carrier quality trend
   */
  async getCarrierTrend(tenantId, carrierId, options = {}) {
    const { days = 30 } = options;

    const result = await db.query(`
      SELECT
        date,
        avg_mos,
        total_calls,
        quality_percentage,
        avg_jitter,
        avg_packet_loss,
        avg_latency,
        quality_score
      FROM carrier_quality_scores
      WHERE tenant_id = $1 AND carrier_id = $2
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date ASC
    `, [tenantId, carrierId]);

    return result.rows;
  }

  // =========================================
  // AGENT QUALITY SCORING
  // =========================================

  /**
   * Update agent quality scores (run daily)
   */
  async updateAgentScores(tenantId, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await db.query(`
      SELECT
        agent_id,
        AVG(mos) as avg_mos,
        MIN(mos) as min_mos,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE mos >= 4.3) as excellent_calls,
        COUNT(*) FILTER (WHERE mos < 3.0) as poor_calls
      FROM call_quality_metrics
      WHERE tenant_id = $1
        AND DATE(time) = $2
        AND agent_id IS NOT NULL
      GROUP BY agent_id
    `, [tenantId, targetDate]);

    const scores = [];

    for (const row of result.rows) {
      const qualityPercentage = row.total_calls > 0
        ? (parseInt(row.excellent_calls) / parseInt(row.total_calls)) * 100
        : 0;

      const scoreResult = await db.query(`
        INSERT INTO agent_quality_scores (
          date, tenant_id, agent_id,
          avg_mos, min_mos, total_calls, excellent_calls, poor_calls,
          quality_percentage
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (date, tenant_id, agent_id)
        DO UPDATE SET
          avg_mos = $4, min_mos = $5, total_calls = $6,
          excellent_calls = $7, poor_calls = $8, quality_percentage = $9
        RETURNING *
      `, [
        targetDate,
        tenantId,
        row.agent_id,
        row.avg_mos,
        row.min_mos,
        row.total_calls,
        row.excellent_calls,
        row.poor_calls,
        qualityPercentage
      ]);

      scores.push(scoreResult.rows[0]);
    }

    return scores;
  }

  /**
   * Get agent quality report
   */
  async getAgentQualityReport(tenantId, options = {}) {
    const { days = 30, agent_id } = options;

    let query = `
      SELECT
        aqs.agent_id,
        u.name as agent_name,
        u.email as agent_email,
        AVG(aqs.avg_mos) as avg_mos,
        SUM(aqs.total_calls) as total_calls,
        SUM(aqs.excellent_calls) as excellent_calls,
        SUM(aqs.poor_calls) as poor_calls,
        AVG(aqs.quality_percentage) as quality_percentage
      FROM agent_quality_scores aqs
      JOIN users u ON u.id = aqs.agent_id
      WHERE aqs.tenant_id = $1
        AND aqs.date >= CURRENT_DATE - INTERVAL '${days} days'
    `;
    const values = [tenantId];
    let idx = 2;

    if (agent_id) {
      query += ` AND aqs.agent_id = $${idx++}`;
      values.push(agent_id);
    }

    query += ` GROUP BY aqs.agent_id, u.name, u.email ORDER BY avg_mos DESC`;

    const result = await db.query(query, values);

    return result.rows;
  }

  // =========================================
  // DIAGNOSTICS
  // =========================================

  /**
   * Diagnose quality issues for a call
   */
  async diagnoseCall(callId, tenantId) {
    const metrics = await this.getCallMetrics(callId, tenantId);

    if (metrics.length === 0) {
      return { issues: [], message: 'No quality data available for this call' };
    }

    const issues = [];

    // Calculate averages
    const avgMOS = metrics.reduce((sum, m) => sum + parseFloat(m.mos), 0) / metrics.length;
    const avgJitter = metrics.reduce((sum, m) => sum + parseFloat(m.jitter_avg || 0), 0) / metrics.length;
    const avgPacketLoss = metrics.reduce((sum, m) => sum + parseFloat(m.packet_loss_avg || 0), 0) / metrics.length;
    const avgLatency = metrics.reduce((sum, m) => sum + parseFloat(m.latency || 0), 0) / metrics.length;

    // Overall quality check
    if (avgMOS < 3.5) {
      issues.push({
        type: 'low_quality',
        severity: avgMOS < 3.0 ? 'critical' : 'warning',
        message: `Overall call quality was ${avgMOS < 3.0 ? 'poor' : 'below average'} (MOS: ${avgMOS.toFixed(2)})`,
        recommendation: 'Check network conditions, carrier quality, and codec settings',
      });
    }

    // Jitter check
    if (avgJitter > 30) {
      issues.push({
        type: 'high_jitter',
        severity: avgJitter > 50 ? 'critical' : 'warning',
        message: `High jitter detected (${avgJitter.toFixed(1)}ms)`,
        recommendation: 'Check for network congestion, improve QoS settings, or adjust jitter buffer',
      });
    }

    // Packet loss check
    if (avgPacketLoss > 2.0) {
      issues.push({
        type: 'high_packet_loss',
        severity: avgPacketLoss > 5.0 ? 'critical' : 'warning',
        message: `High packet loss (${avgPacketLoss.toFixed(2)}%)`,
        recommendation: 'Check network stability, switch carriers, or investigate routing issues',
      });
    }

    // Latency check
    if (avgLatency > 150) {
      issues.push({
        type: 'high_latency',
        severity: avgLatency > 200 ? 'critical' : 'warning',
        message: `High latency (${avgLatency.toFixed(0)}ms one-way)`,
        recommendation: 'Use geographically closer servers, check for routing inefficiencies',
      });
    }

    // Check for quality degradation during call
    if (metrics.length >= 4) {
      const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
      const secondHalf = metrics.slice(Math.floor(metrics.length / 2));

      const mosFirstHalf = firstHalf.reduce((sum, m) => sum + parseFloat(m.mos), 0) / firstHalf.length;
      const mosSecondHalf = secondHalf.reduce((sum, m) => sum + parseFloat(m.mos), 0) / secondHalf.length;

      if (mosSecondHalf < mosFirstHalf - 0.5) {
        issues.push({
          type: 'quality_degradation',
          severity: 'warning',
          message: `Call quality degraded during the call (MOS dropped from ${mosFirstHalf.toFixed(1)} to ${mosSecondHalf.toFixed(1)})`,
          recommendation: 'Check for network congestion patterns or resource exhaustion',
        });
      }
    }

    // Check for one-way audio indicators
    const hasOneWayAudio = metrics.some(m => {
      const lossIn = parseFloat(m.packet_loss_in || 0);
      const lossOut = parseFloat(m.packet_loss_out || 0);
      return (lossIn > 50 && lossOut < 5) || (lossOut > 50 && lossIn < 5);
    });

    if (hasOneWayAudio) {
      issues.push({
        type: 'one_way_audio',
        severity: 'critical',
        message: 'One-way audio detected (asymmetric packet loss)',
        recommendation: 'Check NAT/firewall settings, SIP ALG, and RTP port forwarding',
      });
    }

    if (issues.length === 0) {
      return {
        issues: [],
        message: 'No quality issues detected - call quality was acceptable',
        summary: {
          avg_mos: avgMOS.toFixed(2),
          avg_jitter: avgJitter.toFixed(1),
          avg_packet_loss: avgPacketLoss.toFixed(2),
          avg_latency: avgLatency.toFixed(0),
        }
      };
    }

    return {
      issues,
      summary: {
        avg_mos: avgMOS.toFixed(2),
        avg_jitter: avgJitter.toFixed(1),
        avg_packet_loss: avgPacketLoss.toFixed(2),
        avg_latency: avgLatency.toFixed(0),
        issue_count: issues.length,
        critical_count: issues.filter(i => i.severity === 'critical').length,
      }
    };
  }

  // =========================================
  // ANALYTICS
  // =========================================

  /**
   * Get quality overview for tenant
   */
  async getQualityOverview(tenantId, options = {}) {
    const { days = 7 } = options;

    const result = await db.query(`
      SELECT
        DATE(time) as date,
        AVG(mos) as avg_mos,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE mos >= 4.0) as good_calls,
        COUNT(*) FILTER (WHERE mos < 3.0) as poor_calls,
        AVG(jitter_avg) as avg_jitter,
        AVG(packet_loss_avg) as avg_packet_loss,
        AVG(latency) as avg_latency
      FROM call_quality_metrics
      WHERE tenant_id = $1
        AND time >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(time)
      ORDER BY date ASC
    `, [tenantId]);

    // Calculate overall stats
    const overall = await db.query(`
      SELECT
        AVG(mos) as avg_mos,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE mos >= 4.0) as good_calls,
        COUNT(*) FILTER (WHERE mos < 3.0) as poor_calls
      FROM call_quality_metrics
      WHERE tenant_id = $1
        AND time >= NOW() - INTERVAL '${days} days'
    `, [tenantId]);

    const stats = overall.rows[0];
    const goodPercentage = stats.total_calls > 0
      ? (parseInt(stats.good_calls) / parseInt(stats.total_calls)) * 100
      : 0;

    return {
      daily: result.rows,
      summary: {
        avg_mos: parseFloat(stats.avg_mos || 0).toFixed(2),
        total_calls: parseInt(stats.total_calls),
        good_calls: parseInt(stats.good_calls),
        poor_calls: parseInt(stats.poor_calls),
        good_percentage: goodPercentage.toFixed(1),
      }
    };
  }

  /**
   * Get quality distribution
   */
  async getQualityDistribution(tenantId, options = {}) {
    const { days = 30 } = options;

    const result = await db.query(`
      SELECT
        CASE
          WHEN mos >= 4.3 THEN 'Excellent'
          WHEN mos >= 4.0 THEN 'Good'
          WHEN mos >= 3.6 THEN 'Fair'
          WHEN mos >= 3.1 THEN 'Poor'
          WHEN mos >= 2.6 THEN 'Bad'
          ELSE 'Unacceptable'
        END as quality,
        COUNT(*) as count
      FROM call_quality_metrics
      WHERE tenant_id = $1
        AND time >= NOW() - INTERVAL '${days} days'
      GROUP BY 1
      ORDER BY
        CASE quality
          WHEN 'Excellent' THEN 1
          WHEN 'Good' THEN 2
          WHEN 'Fair' THEN 3
          WHEN 'Poor' THEN 4
          WHEN 'Bad' THEN 5
          ELSE 6
        END
    `, [tenantId]);

    return result.rows;
  }
}

export default new CallQualityService();
