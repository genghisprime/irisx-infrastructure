/**
 * Unsubscribe Service
 * Manage email/SMS unsubscribe preferences and suppression
 */

import pool from '../db/connection.js';
import crypto from 'crypto';

class UnsubscribeService {
  /**
   * Generate a secure unsubscribe token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Create an unsubscribe token for a recipient
   */
  async createToken(tenantId, options) {
    const {
      email,
      phone,
      channel, // email, sms, voice, whatsapp
      category = 'marketing', // marketing, transactional, all
      campaignId = null,
      emailId = null
    } = options;

    const token = this.generateToken();

    await pool.query(
      `INSERT INTO unsubscribe_tokens (tenant_id, token, email, phone, channel, category, campaign_id, email_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, token, email, phone, channel, category, campaignId, emailId]
    );

    return token;
  }

  /**
   * Generate unsubscribe URL
   */
  generateUnsubscribeUrl(token) {
    const baseUrl = process.env.API_URL || 'http://localhost:3000';
    return `${baseUrl}/unsubscribe/${token}`;
  }

  /**
   * Generate List-Unsubscribe header for emails
   */
  async generateListUnsubscribeHeaders(tenantId, email, campaignId = null, emailId = null) {
    const token = await this.createToken(tenantId, {
      email,
      channel: 'email',
      category: 'marketing',
      campaignId,
      emailId
    });

    const url = this.generateUnsubscribeUrl(token);
    const oneClickUrl = `${process.env.API_URL}/unsubscribe/one-click/${token}`;

    return {
      'List-Unsubscribe': `<${url}>, <mailto:unsubscribe@${process.env.EMAIL_DOMAIN}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Unsubscribe-URL': url,
      'X-One-Click-Unsubscribe': oneClickUrl
    };
  }

  /**
   * Process unsubscribe request
   */
  async processUnsubscribe(token, ipAddress = null, userAgent = null, reason = null) {
    const result = await pool.query(
      `SELECT process_unsubscribe($1, $2::inet, $3, $4)`,
      [token, ipAddress, userAgent, reason]
    );

    return result.rows[0]?.process_unsubscribe || { success: false, error: 'Unknown error' };
  }

  /**
   * Process one-click unsubscribe (RFC 8058)
   */
  async processOneClick(token, ipAddress = null) {
    return this.processUnsubscribe(token, ipAddress, 'One-Click-Unsubscribe', null);
  }

  /**
   * Check if recipient is unsubscribed
   */
  async isUnsubscribed(tenantId, email, phone, channel, category) {
    const result = await pool.query(
      `SELECT is_unsubscribed($1, $2, $3, $4, $5)`,
      [tenantId, email, phone, channel, category]
    );

    return result.rows[0]?.is_unsubscribed || false;
  }

  /**
   * Get preferences for a recipient
   */
  async getPreferences(tenantId, email, phone) {
    const result = await pool.query(
      `SELECT * FROM unsubscribe_preferences
       WHERE tenant_id = $1 AND (email = $2 OR phone = $3)`,
      [tenantId, email, phone]
    );

    if (!result.rows[0]) return null;

    const pref = result.rows[0];
    return {
      id: pref.id,
      email: pref.email,
      phone: pref.phone,
      channels: {
        email: {
          marketing: pref.email_marketing,
          transactional: pref.email_transactional
        },
        sms: {
          marketing: pref.sms_marketing,
          transactional: pref.sms_transactional
        },
        voice: {
          marketing: pref.voice_marketing,
          transactional: pref.voice_transactional
        },
        whatsapp: {
          marketing: pref.whatsapp_marketing,
          transactional: pref.whatsapp_transactional
        }
      },
      globalOptout: pref.global_optout,
      unsubscribedAt: pref.unsubscribed_at,
      source: pref.source
    };
  }

  /**
   * Update preferences for a recipient
   */
  async updatePreferences(tenantId, email, phone, preferences, source = 'api') {
    const {
      emailMarketing,
      emailTransactional,
      smsMarketing,
      smsTransactional,
      voiceMarketing,
      voiceTransactional,
      whatsappMarketing,
      whatsappTransactional,
      globalOptout
    } = preferences;

    const result = await pool.query(
      `INSERT INTO unsubscribe_preferences (
        tenant_id, email, phone, email_marketing, email_transactional,
        sms_marketing, sms_transactional, voice_marketing, voice_transactional,
        whatsapp_marketing, whatsapp_transactional, global_optout, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (tenant_id, email) DO UPDATE SET
        email_marketing = COALESCE($4, unsubscribe_preferences.email_marketing),
        email_transactional = COALESCE($5, unsubscribe_preferences.email_transactional),
        sms_marketing = COALESCE($6, unsubscribe_preferences.sms_marketing),
        sms_transactional = COALESCE($7, unsubscribe_preferences.sms_transactional),
        voice_marketing = COALESCE($8, unsubscribe_preferences.voice_marketing),
        voice_transactional = COALESCE($9, unsubscribe_preferences.voice_transactional),
        whatsapp_marketing = COALESCE($10, unsubscribe_preferences.whatsapp_marketing),
        whatsapp_transactional = COALESCE($11, unsubscribe_preferences.whatsapp_transactional),
        global_optout = COALESCE($12, unsubscribe_preferences.global_optout),
        source = $13,
        updated_at = NOW()
      RETURNING *`,
      [tenantId, email, phone, emailMarketing, emailTransactional,
       smsMarketing, smsTransactional, voiceMarketing, voiceTransactional,
       whatsappMarketing, whatsappTransactional, globalOptout, source]
    );

    // Log event
    await pool.query(
      `INSERT INTO unsubscribe_events (tenant_id, email, phone, event_type, source)
       VALUES ($1, $2, $3, 'update', $4)`,
      [tenantId, email, phone, source]
    );

    return this.getPreferences(tenantId, email, phone);
  }

  /**
   * Resubscribe a recipient
   */
  async resubscribe(tenantId, email, phone, channels = 'all', source = 'api') {
    let updateClause = '';

    if (channels === 'all') {
      updateClause = `
        email_marketing = true, email_transactional = true,
        sms_marketing = true, sms_transactional = true,
        voice_marketing = true, voice_transactional = true,
        whatsapp_marketing = true, whatsapp_transactional = true,
        global_optout = false, resubscribed_at = NOW()
      `;
    } else {
      const channelUpdates = [];
      if (channels.includes('email')) {
        channelUpdates.push('email_marketing = true', 'email_transactional = true');
      }
      if (channels.includes('sms')) {
        channelUpdates.push('sms_marketing = true', 'sms_transactional = true');
      }
      if (channels.includes('voice')) {
        channelUpdates.push('voice_marketing = true', 'voice_transactional = true');
      }
      if (channels.includes('whatsapp')) {
        channelUpdates.push('whatsapp_marketing = true', 'whatsapp_transactional = true');
      }
      updateClause = channelUpdates.join(', ') + ', resubscribed_at = NOW()';
    }

    await pool.query(
      `UPDATE unsubscribe_preferences SET ${updateClause}, updated_at = NOW()
       WHERE tenant_id = $1 AND (email = $2 OR phone = $3)`,
      [tenantId, email, phone]
    );

    // Remove from suppression list
    await pool.query(
      `DELETE FROM suppression_list
       WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
         AND suppression_type NOT IN ('hard_bounce', 'complaint')`,
      [tenantId, email, phone]
    );

    // Log event
    await pool.query(
      `INSERT INTO unsubscribe_events (tenant_id, email, phone, event_type, source, channel)
       VALUES ($1, $2, $3, 'resubscribe', $4, $5)`,
      [tenantId, email, phone, source, channels === 'all' ? 'all' : channels.join(',')]
    );

    return this.getPreferences(tenantId, email, phone);
  }

  /**
   * Add to suppression list
   */
  async addToSuppressionList(tenantId, options) {
    const {
      email,
      phone,
      suppressionType, // hard_bounce, soft_bounce, complaint, manual, global
      channel,
      reason,
      bounceType,
      bounceSubtype,
      providerCode,
      expiresAt = null
    } = options;

    await pool.query(
      `INSERT INTO suppression_list (
        tenant_id, email, phone, suppression_type, channel, reason,
        bounce_type, bounce_subtype, provider_code, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (tenant_id, email, channel) DO UPDATE SET
        suppression_type = $4,
        reason = COALESCE($6, suppression_list.reason),
        bounce_type = COALESCE($7, suppression_list.bounce_type),
        bounce_subtype = COALESCE($8, suppression_list.bounce_subtype),
        provider_code = COALESCE($9, suppression_list.provider_code),
        suppressed_at = NOW()`,
      [tenantId, email, phone, suppressionType, channel, reason,
       bounceType, bounceSubtype, providerCode, expiresAt]
    );
  }

  /**
   * Remove from suppression list
   */
  async removeFromSuppressionList(tenantId, email, phone, channel = null) {
    let query = `DELETE FROM suppression_list WHERE tenant_id = $1 AND (email = $2 OR phone = $3)`;
    const params = [tenantId, email, phone];

    if (channel) {
      query += ` AND channel = $4`;
      params.push(channel);
    }

    await pool.query(query, params);
  }

  /**
   * Check if on suppression list
   */
  async isOnSuppressionList(tenantId, email, phone, channel = null) {
    let query = `
      SELECT * FROM suppression_list
      WHERE tenant_id = $1 AND (email = $2 OR phone = $3)
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const params = [tenantId, email, phone];

    if (channel) {
      query += ` AND (channel = $4 OR channel IS NULL)`;
      params.push(channel);
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get suppression list
   */
  async getSuppressionList(tenantId, options = {}) {
    const { type, channel, limit = 100, offset = 0 } = options;

    let query = `
      SELECT * FROM suppression_list
      WHERE tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (type) {
      query += ` AND suppression_type = $${paramIndex++}`;
      params.push(type);
    }

    if (channel) {
      query += ` AND channel = $${paramIndex++}`;
      params.push(channel);
    }

    query += ` ORDER BY suppressed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get tenant settings
   */
  async getSettings(tenantId) {
    const result = await pool.query(
      `SELECT * FROM unsubscribe_settings WHERE tenant_id = $1`,
      [tenantId]
    );

    if (!result.rows[0]) {
      // Create default settings
      await pool.query(
        `INSERT INTO unsubscribe_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [tenantId]
      );
      return this.getSettings(tenantId);
    }

    const s = result.rows[0];
    return {
      pageTitle: s.page_title,
      pageLogoUrl: s.page_logo_url,
      pagePrimaryColor: s.page_primary_color,
      pageBackgroundColor: s.page_background_color,
      confirmationMessage: s.confirmation_message,
      resubscribeMessage: s.resubscribe_message,
      requireConfirmation: s.require_confirmation,
      allowResubscribe: s.allow_resubscribe,
      showPreferenceCenter: s.show_preference_center,
      includeListUnsubscribe: s.include_list_unsubscribe,
      includeOneClickUnsubscribe: s.include_one_click_unsubscribe,
      customFooter: s.custom_footer,
      redirectUrl: s.redirect_url,
      redirectDelaySeconds: s.redirect_delay_seconds
    };
  }

  /**
   * Update tenant settings
   */
  async updateSettings(tenantId, updates) {
    const allowedFields = [
      'page_title', 'page_logo_url', 'page_primary_color', 'page_background_color',
      'confirmation_message', 'resubscribe_message', 'require_confirmation',
      'allow_resubscribe', 'show_preference_center', 'include_list_unsubscribe',
      'include_one_click_unsubscribe', 'custom_footer', 'redirect_url', 'redirect_delay_seconds'
    ];

    const setClauses = [];
    const params = [tenantId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        setClauses.push(`${dbField} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) return this.getSettings(tenantId);

    setClauses.push('updated_at = NOW()');

    await pool.query(
      `UPDATE unsubscribe_settings SET ${setClauses.join(', ')} WHERE tenant_id = $1`,
      params
    );

    return this.getSettings(tenantId);
  }

  /**
   * Get unsubscribe events
   */
  async getEvents(tenantId, options = {}) {
    const { email, phone, eventType, limit = 100, offset = 0 } = options;

    let query = `
      SELECT * FROM unsubscribe_events
      WHERE tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (email) {
      query += ` AND email = $${paramIndex++}`;
      params.push(email);
    }

    if (phone) {
      query += ` AND phone = $${paramIndex++}`;
      params.push(phone);
    }

    if (eventType) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(eventType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get unsubscribe statistics
   */
  async getStats(tenantId, days = 30) {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'unsubscribe') as total_unsubscribes,
         COUNT(*) FILTER (WHERE event_type = 'resubscribe') as total_resubscribes,
         COUNT(*) FILTER (WHERE channel = 'email' AND event_type = 'unsubscribe') as email_unsubscribes,
         COUNT(*) FILTER (WHERE channel = 'sms' AND event_type = 'unsubscribe') as sms_unsubscribes,
         COUNT(DISTINCT email) FILTER (WHERE event_type = 'unsubscribe') as unique_email_unsubscribes,
         COUNT(DISTINCT phone) FILTER (WHERE event_type = 'unsubscribe') as unique_phone_unsubscribes
       FROM unsubscribe_events
       WHERE tenant_id = $1 AND created_at > NOW() - $2::integer * INTERVAL '1 day'`,
      [tenantId, days]
    );

    const prefResult = await pool.query(
      `SELECT
         COUNT(*) as total_preferences,
         COUNT(*) FILTER (WHERE global_optout = true) as global_optouts,
         COUNT(*) FILTER (WHERE email_marketing = false) as email_marketing_optouts,
         COUNT(*) FILTER (WHERE sms_marketing = false) as sms_marketing_optouts
       FROM unsubscribe_preferences
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const suppResult = await pool.query(
      `SELECT
         COUNT(*) as total_suppressed,
         COUNT(*) FILTER (WHERE suppression_type = 'hard_bounce') as hard_bounces,
         COUNT(*) FILTER (WHERE suppression_type = 'complaint') as complaints
       FROM suppression_list
       WHERE tenant_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [tenantId]
    );

    return {
      events: {
        totalUnsubscribes: parseInt(result.rows[0].total_unsubscribes) || 0,
        totalResubscribes: parseInt(result.rows[0].total_resubscribes) || 0,
        emailUnsubscribes: parseInt(result.rows[0].email_unsubscribes) || 0,
        smsUnsubscribes: parseInt(result.rows[0].sms_unsubscribes) || 0,
        uniqueEmailUnsubscribes: parseInt(result.rows[0].unique_email_unsubscribes) || 0,
        uniquePhoneUnsubscribes: parseInt(result.rows[0].unique_phone_unsubscribes) || 0
      },
      preferences: {
        totalPreferences: parseInt(prefResult.rows[0].total_preferences) || 0,
        globalOptouts: parseInt(prefResult.rows[0].global_optouts) || 0,
        emailMarketingOptouts: parseInt(prefResult.rows[0].email_marketing_optouts) || 0,
        smsMarketingOptouts: parseInt(prefResult.rows[0].sms_marketing_optouts) || 0
      },
      suppression: {
        totalSuppressed: parseInt(suppResult.rows[0].total_suppressed) || 0,
        hardBounces: parseInt(suppResult.rows[0].hard_bounces) || 0,
        complaints: parseInt(suppResult.rows[0].complaints) || 0
      }
    };
  }

  /**
   * Inject unsubscribe link into email HTML
   */
  injectUnsubscribeLink(html, unsubscribeUrl, settings = {}) {
    const linkHtml = `
      <div style="text-align: center; padding: 20px; font-size: 12px; color: #666;">
        ${settings.customFooter || ''}
        <p>
          <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">
            Unsubscribe
          </a>
          or
          <a href="${unsubscribeUrl}?preferences=1" style="color: #666; text-decoration: underline;">
            manage your preferences
          </a>
        </p>
      </div>
    `;

    if (html.includes('</body>')) {
      return html.replace('</body>', `${linkHtml}</body>`);
    }

    return html + linkHtml;
  }

  /**
   * Filter recipients by unsubscribe status
   */
  async filterRecipients(tenantId, recipients, channel, category) {
    const allowed = [];
    const filtered = [];

    for (const recipient of recipients) {
      const isUnsub = await this.isUnsubscribed(
        tenantId,
        recipient.email,
        recipient.phone,
        channel,
        category
      );

      if (isUnsub) {
        filtered.push({ ...recipient, reason: 'unsubscribed' });
      } else {
        allowed.push(recipient);
      }
    }

    return { allowed, filtered };
  }
}

export default new UnsubscribeService();
