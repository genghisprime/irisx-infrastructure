/**
 * WFM Intraday SMS Offers Service
 *
 * Workforce Management service for sending intraday shift offers
 * via SMS to agents, handling VTO (Voluntary Time Off) and
 * OT (Overtime) offers with automated scheduling
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import smsService from './sms.js';

// Offer types
const OFFER_TYPES = {
  VTO: 'vto',           // Voluntary Time Off
  OT: 'overtime',       // Overtime
  SHIFT_SWAP: 'shift_swap',
  EXTRA_SHIFT: 'extra_shift',
  EARLY_RELEASE: 'early_release',
  LATE_START: 'late_start'
};

// Offer status
const OFFER_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

// Response methods
const RESPONSE_METHODS = {
  SMS_REPLY: 'sms_reply',
  WEB_LINK: 'web_link',
  PHONE_IVR: 'phone_ivr'
};

/**
 * WFM SMS Offers Service
 */
class WFMSMSOffersService extends EventEmitter {
  constructor() {
    super();
    this.activeOffers = new Map();
    this.responseKeywords = {
      accept: ['YES', 'ACCEPT', 'Y', '1'],
      decline: ['NO', 'DECLINE', 'N', '0']
    };
  }

  // ============================================
  // Offer Creation
  // ============================================

  /**
   * Create shift offer
   */
  async createOffer(tenantId, offerData, createdBy) {
    const {
      type,
      agentIds,
      skillIds,
      queueIds,
      shiftDate,
      startTime,
      endTime,
      payMultiplier = 1.0,
      maxAcceptances,
      expiresAt,
      priority = 'normal',
      message,
      metadata = {}
    } = offerData;

    if (!type || (!agentIds && !skillIds && !queueIds)) {
      throw new Error('type and target agents (agentIds, skillIds, or queueIds) are required');
    }

    const offerId = crypto.randomUUID();

    // Determine target agents
    let targetAgents = [];

    if (agentIds && agentIds.length > 0) {
      const agentResult = await query(`
        SELECT u.id, u.phone, u.first_name, u.last_name, u.email
        FROM users u
        WHERE u.id = ANY($1) AND u.tenant_id = $2 AND u.is_active = true
      `, [agentIds, tenantId]);
      targetAgents = agentResult.rows;
    } else if (skillIds && skillIds.length > 0) {
      // Get agents with specified skills
      const agentResult = await query(`
        SELECT DISTINCT u.id, u.phone, u.first_name, u.last_name, u.email
        FROM users u
        JOIN agent_skills ask ON u.id = ask.agent_id
        WHERE ask.skill_id = ANY($1) AND u.tenant_id = $2 AND u.is_active = true
      `, [skillIds, tenantId]);
      targetAgents = agentResult.rows;
    } else if (queueIds && queueIds.length > 0) {
      // Get agents assigned to specified queues
      const agentResult = await query(`
        SELECT DISTINCT u.id, u.phone, u.first_name, u.last_name, u.email
        FROM users u
        JOIN queue_agents qa ON u.id = qa.agent_id
        WHERE qa.queue_id = ANY($1) AND u.tenant_id = $2 AND u.is_active = true
      `, [queueIds, tenantId]);
      targetAgents = agentResult.rows;
    }

    if (targetAgents.length === 0) {
      throw new Error('No eligible agents found for this offer');
    }

    // Create main offer record
    const result = await query(`
      INSERT INTO wfm_shift_offers (
        id, tenant_id, type, shift_date, start_time, end_time,
        pay_multiplier, max_acceptances, expires_at, priority,
        message, metadata, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *
    `, [
      offerId, tenantId, type, shiftDate, startTime, endTime,
      payMultiplier, maxAcceptances, expiresAt, priority,
      message, JSON.stringify(metadata), createdBy
    ]);

    // Create individual agent offers
    for (const agent of targetAgents) {
      const responseCode = this.generateResponseCode();

      await query(`
        INSERT INTO wfm_agent_offers (
          id, offer_id, agent_id, tenant_id, response_code, status, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL)
      `, [crypto.randomUUID(), offerId, agent.id, tenantId, responseCode, OFFER_STATUS.PENDING]);
    }

    const offer = result.rows[0];
    offer.targetAgentCount = targetAgents.length;

    return offer;
  }

  /**
   * Generate unique response code
   */
  generateResponseCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  // ============================================
  // Offer Distribution
  // ============================================

  /**
   * Send offer to all targeted agents
   */
  async sendOffer(offerId) {
    // Get offer details
    const offerResult = await query(
      'SELECT * FROM wfm_shift_offers WHERE id = $1',
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      throw new Error('Offer not found');
    }

    const offer = offerResult.rows[0];

    // Get pending agent offers
    const agentOffers = await query(`
      SELECT ao.*, u.phone, u.first_name, u.last_name
      FROM wfm_agent_offers ao
      JOIN users u ON ao.agent_id = u.id
      WHERE ao.offer_id = $1 AND ao.status = 'pending'
    `, [offerId]);

    const results = [];

    for (const agentOffer of agentOffers.rows) {
      if (!agentOffer.phone) {
        results.push({
          agentId: agentOffer.agent_id,
          success: false,
          error: 'Agent has no phone number'
        });
        continue;
      }

      try {
        // Build message
        const message = this.buildOfferMessage(offer, agentOffer);

        // Send SMS
        const smsResult = await smsService.send({
          to: agentOffer.phone,
          message,
          tenantId: offer.tenant_id
        });

        // Update agent offer status
        await query(`
          UPDATE wfm_agent_offers
          SET status = 'sent', sent_at = NOW(), sms_sid = $1
          WHERE id = $2
        `, [smsResult.sid || smsResult.id, agentOffer.id]);

        results.push({
          agentId: agentOffer.agent_id,
          agentName: `${agentOffer.first_name} ${agentOffer.last_name}`,
          success: true,
          smsSid: smsResult.sid || smsResult.id
        });

      } catch (error) {
        results.push({
          agentId: agentOffer.agent_id,
          success: false,
          error: error.message
        });
      }
    }

    // Update offer status
    await query(`
      UPDATE wfm_shift_offers
      SET status = 'sent', sent_at = NOW()
      WHERE id = $1
    `, [offerId]);

    return {
      offerId,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Build offer message
   */
  buildOfferMessage(offer, agentOffer) {
    const typeLabels = {
      [OFFER_TYPES.VTO]: 'VTO (Voluntary Time Off)',
      [OFFER_TYPES.OT]: 'Overtime',
      [OFFER_TYPES.SHIFT_SWAP]: 'Shift Swap',
      [OFFER_TYPES.EXTRA_SHIFT]: 'Extra Shift',
      [OFFER_TYPES.EARLY_RELEASE]: 'Early Release',
      [OFFER_TYPES.LATE_START]: 'Late Start'
    };

    const offerLabel = typeLabels[offer.type] || offer.type;
    const date = new Date(offer.shift_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    let message = `${offerLabel} Available!\n`;
    message += `Date: ${date}\n`;

    if (offer.start_time && offer.end_time) {
      message += `Time: ${offer.start_time} - ${offer.end_time}\n`;
    }

    if (offer.pay_multiplier > 1) {
      message += `Pay: ${offer.pay_multiplier}x\n`;
    }

    if (offer.message) {
      message += `\n${offer.message}\n`;
    }

    message += `\nReply YES to accept or NO to decline.`;
    message += `\nRef: ${agentOffer.response_code}`;

    if (offer.expires_at) {
      const expiry = new Date(offer.expires_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
      message += `\nExpires: ${expiry}`;
    }

    return message;
  }

  // ============================================
  // Response Handling
  // ============================================

  /**
   * Process agent response
   */
  async processResponse(tenantId, fromPhone, responseText) {
    const normalizedResponse = responseText.trim().toUpperCase();

    // Extract response code if present
    const codeMatch = responseText.match(/[A-F0-9]{6}/i);
    const responseCode = codeMatch ? codeMatch[0].toUpperCase() : null;

    // Find pending offer for this phone number
    let agentOfferQuery = `
      SELECT ao.*, so.*, ao.id as agent_offer_id, so.id as offer_id
      FROM wfm_agent_offers ao
      JOIN wfm_shift_offers so ON ao.offer_id = so.id
      JOIN users u ON ao.agent_id = u.id
      WHERE u.phone = $1 AND ao.tenant_id = $2 AND ao.status = 'sent'
    `;
    const params = [fromPhone, tenantId];

    if (responseCode) {
      agentOfferQuery += ' AND ao.response_code = $3';
      params.push(responseCode);
    }

    agentOfferQuery += ' ORDER BY ao.sent_at DESC LIMIT 1';

    const agentOfferResult = await query(agentOfferQuery, params);

    if (agentOfferResult.rows.length === 0) {
      return {
        success: false,
        error: 'No pending offer found',
        message: 'Sorry, we could not find a pending offer for you. The offer may have expired.'
      };
    }

    const agentOffer = agentOfferResult.rows[0];

    // Check if expired
    if (agentOffer.expires_at && new Date(agentOffer.expires_at) < new Date()) {
      await query(
        'UPDATE wfm_agent_offers SET status = $1, updated_at = NOW() WHERE id = $2',
        [OFFER_STATUS.EXPIRED, agentOffer.agent_offer_id]
      );
      return {
        success: false,
        error: 'Offer expired',
        message: 'Sorry, this offer has expired.'
      };
    }

    // Determine response type
    const isAccept = this.responseKeywords.accept.some(k => normalizedResponse.includes(k));
    const isDecline = this.responseKeywords.decline.some(k => normalizedResponse.includes(k));

    if (!isAccept && !isDecline) {
      return {
        success: false,
        error: 'Invalid response',
        message: 'Please reply YES to accept or NO to decline.'
      };
    }

    if (isAccept) {
      return this.acceptOffer(agentOffer.agent_offer_id);
    } else {
      return this.declineOffer(agentOffer.agent_offer_id);
    }
  }

  /**
   * Accept offer
   */
  async acceptOffer(agentOfferId) {
    // Get offer details
    const offerResult = await query(`
      SELECT ao.*, so.*, ao.id as agent_offer_id, so.id as offer_id,
             u.first_name, u.last_name
      FROM wfm_agent_offers ao
      JOIN wfm_shift_offers so ON ao.offer_id = so.id
      JOIN users u ON ao.agent_id = u.id
      WHERE ao.id = $1
    `, [agentOfferId]);

    if (offerResult.rows.length === 0) {
      return { success: false, error: 'Offer not found' };
    }

    const offer = offerResult.rows[0];

    // Check max acceptances
    if (offer.max_acceptances) {
      const acceptedCount = await query(
        'SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = $1 AND status = $2',
        [offer.offer_id, OFFER_STATUS.ACCEPTED]
      );

      if (parseInt(acceptedCount.rows[0].count) >= offer.max_acceptances) {
        await query(
          'UPDATE wfm_agent_offers SET status = $1, updated_at = NOW() WHERE id = $2',
          [OFFER_STATUS.EXPIRED, agentOfferId]
        );
        return {
          success: false,
          error: 'Offer filled',
          message: 'Sorry, this offer has been filled. Better luck next time!'
        };
      }
    }

    // Accept the offer
    await query(`
      UPDATE wfm_agent_offers
      SET status = $1, responded_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [OFFER_STATUS.ACCEPTED, agentOfferId]);

    // Log acceptance
    await this.logOfferActivity(offer.tenant_id, offer.offer_id, offer.agent_id, 'accepted');

    // Emit event
    this.emit('offer:accepted', {
      offerId: offer.offer_id,
      agentId: offer.agent_id,
      agentName: `${offer.first_name} ${offer.last_name}`,
      type: offer.type,
      shiftDate: offer.shift_date
    });

    // Check if offer is now filled
    await this.checkOfferFilled(offer.offer_id);

    return {
      success: true,
      status: OFFER_STATUS.ACCEPTED,
      message: `Great! You're confirmed for ${offer.type === OFFER_TYPES.VTO ? 'VTO' : 'the shift'} on ${new Date(offer.shift_date).toLocaleDateString()}.`
    };
  }

  /**
   * Decline offer
   */
  async declineOffer(agentOfferId) {
    await query(`
      UPDATE wfm_agent_offers
      SET status = $1, responded_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [OFFER_STATUS.DECLINED, agentOfferId]);

    const offerResult = await query(`
      SELECT ao.*, so.tenant_id, so.type
      FROM wfm_agent_offers ao
      JOIN wfm_shift_offers so ON ao.offer_id = so.id
      WHERE ao.id = $1
    `, [agentOfferId]);

    const offer = offerResult.rows[0];

    // Log decline
    await this.logOfferActivity(offer.tenant_id, offer.offer_id, offer.agent_id, 'declined');

    return {
      success: true,
      status: OFFER_STATUS.DECLINED,
      message: 'Got it. You declined this offer.'
    };
  }

  /**
   * Check if offer is filled and close if needed
   */
  async checkOfferFilled(offerId) {
    const result = await query(`
      SELECT so.max_acceptances,
        (SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = $1 AND status = 'accepted') as accepted_count
      FROM wfm_shift_offers so
      WHERE so.id = $1
    `, [offerId]);

    const offer = result.rows[0];

    if (offer.max_acceptances && offer.accepted_count >= offer.max_acceptances) {
      // Cancel remaining pending offers
      await query(`
        UPDATE wfm_agent_offers
        SET status = 'cancelled', updated_at = NOW()
        WHERE offer_id = $1 AND status IN ('pending', 'sent')
      `, [offerId]);

      // Mark offer as filled
      await query(`
        UPDATE wfm_shift_offers
        SET status = 'filled', updated_at = NOW()
        WHERE id = $1
      `, [offerId]);

      this.emit('offer:filled', { offerId });
    }
  }

  // ============================================
  // Offer Management
  // ============================================

  /**
   * Get offer status
   */
  async getOfferStatus(offerId) {
    const offerResult = await query(
      'SELECT * FROM wfm_shift_offers WHERE id = $1',
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      throw new Error('Offer not found');
    }

    const offer = offerResult.rows[0];

    // Get agent responses
    const responsesResult = await query(`
      SELECT ao.*, u.first_name, u.last_name, u.email
      FROM wfm_agent_offers ao
      JOIN users u ON ao.agent_id = u.id
      WHERE ao.offer_id = $1
      ORDER BY ao.responded_at DESC NULLS LAST
    `, [offerId]);

    offer.responses = responsesResult.rows;
    offer.stats = {
      total: responsesResult.rows.length,
      pending: responsesResult.rows.filter(r => r.status === OFFER_STATUS.PENDING).length,
      sent: responsesResult.rows.filter(r => r.status === OFFER_STATUS.SENT).length,
      accepted: responsesResult.rows.filter(r => r.status === OFFER_STATUS.ACCEPTED).length,
      declined: responsesResult.rows.filter(r => r.status === OFFER_STATUS.DECLINED).length,
      expired: responsesResult.rows.filter(r => r.status === OFFER_STATUS.EXPIRED).length
    };

    return offer;
  }

  /**
   * Get offers for tenant
   */
  async getOffers(tenantId, options = {}) {
    const { status, type, startDate, endDate, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT so.*,
        (SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = so.id AND status = 'accepted') as accepted_count,
        (SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = so.id) as total_sent
      FROM wfm_shift_offers so
      WHERE so.tenant_id = $1
    `;
    const params = [tenantId];

    if (status) {
      params.push(status);
      sql += ` AND so.status = $${params.length}`;
    }

    if (type) {
      params.push(type);
      sql += ` AND so.type = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND so.shift_date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND so.shift_date <= $${params.length}`;
    }

    sql += ' ORDER BY so.created_at DESC';
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Cancel offer
   */
  async cancelOffer(offerId, reason = null) {
    // Update main offer
    await query(`
      UPDATE wfm_shift_offers
      SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1, updated_at = NOW()
      WHERE id = $2
    `, [reason, offerId]);

    // Cancel all agent offers
    await query(`
      UPDATE wfm_agent_offers
      SET status = 'cancelled', updated_at = NOW()
      WHERE offer_id = $1 AND status IN ('pending', 'sent')
    `, [offerId]);

    this.emit('offer:cancelled', { offerId, reason });

    return { cancelled: true };
  }

  /**
   * Expire old offers
   */
  async expireOldOffers() {
    // Expire agent offers
    const expiredAgentOffers = await query(`
      UPDATE wfm_agent_offers ao
      SET status = 'expired', updated_at = NOW()
      FROM wfm_shift_offers so
      WHERE ao.offer_id = so.id
        AND ao.status IN ('pending', 'sent')
        AND so.expires_at < NOW()
      RETURNING ao.offer_id
    `);

    // Expire main offers
    await query(`
      UPDATE wfm_shift_offers
      SET status = 'expired', updated_at = NOW()
      WHERE status IN ('pending', 'sent') AND expires_at < NOW()
    `);

    return { expired: expiredAgentOffers.rows.length };
  }

  // ============================================
  // Activity Logging
  // ============================================

  /**
   * Log offer activity
   */
  async logOfferActivity(tenantId, offerId, agentId, action, details = null) {
    await query(`
      INSERT INTO wfm_offer_activity_log (
        id, tenant_id, offer_id, agent_id, action, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [crypto.randomUUID(), tenantId, offerId, agentId, action, details]);
  }

  /**
   * Get offer activity log
   */
  async getOfferActivityLog(offerId) {
    const result = await query(`
      SELECT oal.*, u.first_name, u.last_name
      FROM wfm_offer_activity_log oal
      LEFT JOIN users u ON oal.agent_id = u.id
      WHERE oal.offer_id = $1
      ORDER BY oal.created_at DESC
    `, [offerId]);

    return result.rows;
  }

  // ============================================
  // Analytics
  // ============================================

  /**
   * Get offer analytics
   */
  async getOfferAnalytics(tenantId, options = {}) {
    const { startDate, endDate } = options;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Overall stats
    const statsResult = await query(`
      SELECT
        COUNT(*) as total_offers,
        COUNT(CASE WHEN status = 'filled' THEN 1 END) as filled_offers,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_offers,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_offers,
        AVG(
          EXTRACT(EPOCH FROM (
            (SELECT MIN(responded_at) FROM wfm_agent_offers WHERE offer_id = so.id AND status = 'accepted')
            - so.sent_at
          )) / 60
        ) as avg_response_time_minutes
      FROM wfm_shift_offers so
      WHERE so.tenant_id = $1 AND so.created_at BETWEEN $2 AND $3
    `, [tenantId, start, end]);

    // By type
    const byTypeResult = await query(`
      SELECT
        type,
        COUNT(*) as offer_count,
        SUM((SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = so.id AND status = 'accepted')) as accepted_count,
        SUM((SELECT COUNT(*) FROM wfm_agent_offers WHERE offer_id = so.id)) as total_sent
      FROM wfm_shift_offers so
      WHERE so.tenant_id = $1 AND so.created_at BETWEEN $2 AND $3
      GROUP BY type
    `, [tenantId, start, end]);

    // Top responding agents
    const topAgentsResult = await query(`
      SELECT
        u.id, u.first_name, u.last_name,
        COUNT(*) as offers_received,
        COUNT(CASE WHEN ao.status = 'accepted' THEN 1 END) as offers_accepted,
        AVG(EXTRACT(EPOCH FROM (ao.responded_at - ao.sent_at)) / 60) as avg_response_time_minutes
      FROM wfm_agent_offers ao
      JOIN users u ON ao.agent_id = u.id
      WHERE ao.tenant_id = $1 AND ao.sent_at BETWEEN $2 AND $3
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY offers_accepted DESC
      LIMIT 10
    `, [tenantId, start, end]);

    return {
      period: { start, end },
      overall: statsResult.rows[0],
      byType: byTypeResult.rows,
      topAgents: topAgentsResult.rows
    };
  }
}

// Singleton instance
const wfmSMSOffersService = new WFMSMSOffersService();

export default wfmSMSOffersService;
export { OFFER_TYPES, OFFER_STATUS, RESPONSE_METHODS };
