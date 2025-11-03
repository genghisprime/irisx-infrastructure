/**
 * Cross-Channel Analytics Service
 * Aggregates metrics across voice, SMS, email, WhatsApp, and social channels
 */

import pool from '../db/connection.js';

class AnalyticsService {
  /**
   * Get unified dashboard metrics across all channels
   */
  async getUnifiedMetrics(tenantId, startDate, endDate) {
    try {
      const metrics = {
        overview: await this.getOverviewMetrics(tenantId, startDate, endDate),
        voice: await this.getVoiceMetrics(tenantId, startDate, endDate),
        sms: await this.getSmsMetrics(tenantId, startDate, endDate),
        email: await this.getEmailMetrics(tenantId, startDate, endDate),
        whatsapp: await this.getWhatsAppMetrics(tenantId, startDate, endDate),
        social: await this.getSocialMetrics(tenantId, startDate, endDate),
        trends: await this.getTrendData(tenantId, startDate, endDate)
      };

      return metrics;
    } catch (error) {
      console.error('Error getting unified metrics:', error);
      throw error;
    }
  }

  /**
   * Get high-level overview metrics
   */
  async getOverviewMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        -- Voice stats
        (SELECT COUNT(*) FROM calls WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as total_calls,
        (SELECT SUM(duration_seconds) FROM calls WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND status = 'completed') as total_call_minutes,
        (SELECT AVG(duration_seconds) FROM calls WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND status = 'completed') as avg_call_duration,

        -- SMS stats
        (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'sms') as total_sms,
        (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'sms' AND status = 'delivered') as delivered_sms,

        -- Email stats
        (SELECT COUNT(*) FROM email_messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as total_emails,
        (SELECT COUNT(*) FROM email_messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND status = 'delivered') as delivered_emails,
        (SELECT SUM(opens) FROM email_messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as email_opens,
        (SELECT SUM(clicks) FROM email_messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as email_clicks,

        -- WhatsApp stats
        (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'whatsapp') as total_whatsapp,
        (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'whatsapp' AND status = 'delivered') as delivered_whatsapp,

        -- Social stats
        (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel IN ('discord', 'slack', 'teams', 'telegram')) as total_social,

        -- Conversation stats
        (SELECT COUNT(*) FROM conversations WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3) as total_conversations,
        (SELECT COUNT(*) FROM conversations WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND status = 'closed') as closed_conversations
      `,
      [tenantId, startDate, endDate]
    );

    const row = result.rows[0];

    return {
      totalCalls: parseInt(row.total_calls) || 0,
      totalCallMinutes: Math.round((parseFloat(row.total_call_minutes) || 0) / 60),
      avgCallDuration: Math.round(parseFloat(row.avg_call_duration) || 0),

      totalSms: parseInt(row.total_sms) || 0,
      deliveredSms: parseInt(row.delivered_sms) || 0,
      smsDeliveryRate: this.calculateRate(row.delivered_sms, row.total_sms),

      totalEmails: parseInt(row.total_emails) || 0,
      deliveredEmails: parseInt(row.delivered_emails) || 0,
      emailDeliveryRate: this.calculateRate(row.delivered_emails, row.total_emails),
      emailOpens: parseInt(row.email_opens) || 0,
      emailClicks: parseInt(row.email_clicks) || 0,
      emailOpenRate: this.calculateRate(row.email_opens, row.total_emails),
      emailClickRate: this.calculateRate(row.email_clicks, row.total_emails),

      totalWhatsApp: parseInt(row.total_whatsapp) || 0,
      deliveredWhatsApp: parseInt(row.delivered_whatsapp) || 0,
      whatsappDeliveryRate: this.calculateRate(row.delivered_whatsapp, row.total_whatsapp),

      totalSocial: parseInt(row.total_social) || 0,

      totalConversations: parseInt(row.total_conversations) || 0,
      closedConversations: parseInt(row.closed_conversations) || 0
    };
  }

  /**
   * Get voice channel metrics
   */
  async getVoiceMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        status,
        COUNT(*) as count,
        SUM(duration_seconds) as total_duration,
        AVG(duration_seconds) as avg_duration
      FROM calls
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY status
      ORDER BY count DESC`,
      [tenantId, startDate, endDate]
    );

    const statusBreakdown = result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      totalDuration: parseFloat(row.total_duration) || 0,
      avgDuration: parseFloat(row.avg_duration) || 0
    }));

    return { statusBreakdown };
  }

  /**
   * Get SMS channel metrics
   */
  async getSmsMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        status,
        COUNT(*) as count
      FROM messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'sms'
      GROUP BY status
      ORDER BY count DESC`,
      [tenantId, startDate, endDate]
    );

    const statusBreakdown = result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    }));

    return { statusBreakdown };
  }

  /**
   * Get email channel metrics
   */
  async getEmailMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        status,
        COUNT(*) as count,
        SUM(opens) as total_opens,
        SUM(clicks) as total_clicks,
        SUM(bounces) as total_bounces,
        SUM(complaints) as total_complaints
      FROM email_messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY status
      ORDER BY count DESC`,
      [tenantId, startDate, endDate]
    );

    const statusBreakdown = result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      totalOpens: parseInt(row.total_opens) || 0,
      totalClicks: parseInt(row.total_clicks) || 0,
      totalBounces: parseInt(row.total_bounces) || 0,
      totalComplaints: parseInt(row.total_complaints) || 0
    }));

    return { statusBreakdown };
  }

  /**
   * Get WhatsApp channel metrics
   */
  async getWhatsAppMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        status,
        COUNT(*) as count
      FROM messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel = 'whatsapp'
      GROUP BY status
      ORDER BY count DESC`,
      [tenantId, startDate, endDate]
    );

    const statusBreakdown = result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count)
    }));

    return { statusBreakdown };
  }

  /**
   * Get social media metrics
   */
  async getSocialMetrics(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        channel,
        COUNT(*) as count,
        COUNT(CASE WHEN direction = 'inbound' THEN 1 END) as inbound,
        COUNT(CASE WHEN direction = 'outbound' THEN 1 END) as outbound
      FROM messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
        AND channel IN ('discord', 'slack', 'teams', 'telegram')
      GROUP BY channel
      ORDER BY count DESC`,
      [tenantId, startDate, endDate]
    );

    const channelBreakdown = result.rows.map(row => ({
      channel: row.channel,
      count: parseInt(row.count),
      inbound: parseInt(row.inbound),
      outbound: parseInt(row.outbound)
    }));

    return { channelBreakdown };
  }

  /**
   * Get trend data for charts (daily aggregation)
   */
  async getTrendData(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        DATE(created_at) as date,
        'voice' as channel,
        COUNT(*) as count
      FROM calls
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY DATE(created_at)

      UNION ALL

      SELECT
        DATE(created_at) as date,
        channel,
        COUNT(*) as count
      FROM messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND channel IN ('sms', 'whatsapp')
      GROUP BY DATE(created_at), channel

      UNION ALL

      SELECT
        DATE(created_at) as date,
        'email' as channel,
        COUNT(*) as count
      FROM email_messages
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY DATE(created_at)

      ORDER BY date ASC, channel`,
      [tenantId, startDate, endDate]
    );

    // Group by date
    const trends = {};
    result.rows.forEach(row => {
      const dateKey = row.date.toISOString().split('T')[0];
      if (!trends[dateKey]) {
        trends[dateKey] = { date: dateKey, voice: 0, sms: 0, email: 0, whatsapp: 0 };
      }
      trends[dateKey][row.channel] = parseInt(row.count);
    });

    return Object.values(trends);
  }

  /**
   * Get cost analysis by channel
   */
  async getCostAnalysis(tenantId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
        channel,
        resource_type,
        SUM(quantity) as total_quantity,
        SUM(total_cost) as total_cost
      FROM usage_records
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY channel, resource_type
      ORDER BY total_cost DESC`,
      [tenantId, startDate, endDate]
    );

    const costByChannel = result.rows.map(row => ({
      channel: row.channel,
      resourceType: row.resource_type,
      totalQuantity: parseFloat(row.total_quantity),
      totalCost: parseFloat(row.total_cost)
    }));

    // Calculate totals
    const totals = {};
    costByChannel.forEach(item => {
      if (!totals[item.channel]) {
        totals[item.channel] = 0;
      }
      totals[item.channel] += item.totalCost;
    });

    return {
      breakdown: costByChannel,
      totals: Object.entries(totals).map(([channel, cost]) => ({
        channel,
        totalCost: cost
      })).sort((a, b) => b.totalCost - a.totalCost)
    };
  }

  /**
   * Calculate percentage rate
   */
  calculateRate(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return parseFloat(((parseInt(numerator) / parseInt(denominator)) * 100).toFixed(2));
  }
}

export default new AnalyticsService();
