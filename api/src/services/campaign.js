/**
 * Campaign Service - Bulk messaging campaign management
 */

import { query } from '../db/connection.js';
// import nats from '../queue/nats.js'; // TODO: Add NATS integration

class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(tenantId, campaignData) {
    const {
      name,
      description,
      type, // 'sms', 'email', 'voice'
      contact_list_ids = [],
      filter_criteria = {},
      message_template,
      subject,
      from_number,
      from_email,
      from_name,
      voice_script,
      voice_provider,
      voice_id,
      schedule_type = 'immediate',
      scheduled_at,
      timezone = 'UTC',
      daily_limit,
      hourly_limit,
      rate_limit = 10
    } = campaignData;

    if (!name || !type || !message_template) {
      throw new Error('name, type, and message_template are required');
    }

    if (!['sms', 'email', 'voice'].includes(type)) {
      throw new Error('type must be sms, email, or voice');
    }

    // Get total recipients from contact lists
    let totalRecipients = 0;
    if (contact_list_ids.length > 0) {
      const countResult = await query(
        `SELECT COUNT(DISTINCT c.id) as total
         FROM contacts c
         INNER JOIN contact_list_members clm ON c.id = clm.contact_id
         WHERE clm.list_id = ANY($1) AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
        [contact_list_ids, tenantId]
      );
      totalRecipients = parseInt(countResult.rows[0].total);
    }

    // Create campaign
    const result = await query(
      `INSERT INTO campaigns (
        tenant_id, name, description, type, contact_list_ids, filter_criteria,
        message_template, subject, from_number, from_email, from_name,
        voice_script, voice_provider, voice_id,
        schedule_type, scheduled_at, timezone,
        daily_limit, hourly_limit, rate_limit,
        total_recipients, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'draft')
      RETURNING *`,
      [
        tenantId, name, description, type, contact_list_ids, JSON.stringify(filter_criteria),
        message_template, subject, from_number, from_email, from_name,
        voice_script, voice_provider, voice_id,
        schedule_type, scheduled_at, timezone,
        daily_limit, hourly_limit, rate_limit,
        totalRecipients
      ]
    );

    return result.rows[0];
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId, tenantId) {
    const result = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }

  /**
   * List campaigns
   */
  async listCampaigns(tenantId, options = {}) {
    const { page = 1, limit = 50, status, type } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'tenant_id = $1 AND deleted_at IS NULL';
    const values = [tenantId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (type) {
      whereClause += ` AND type = $${paramCount}`;
      values.push(type);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT *, COUNT(*) OVER() as total_count
       FROM campaigns
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      campaigns: result.rows.map(row => {
        const { total_count, ...campaign } = row;
        return campaign;
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId, tenantId, updates) {
    const allowedFields = [
      'name', 'description', 'message_template', 'subject',
      'from_number', 'from_email', 'from_name',
      'scheduled_at', 'daily_limit', 'hourly_limit', 'rate_limit'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(campaignId, tenantId);

    const result = await query(
      `UPDATE campaigns
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }

  /**
   * Delete campaign (soft delete)
   */
  async deleteCampaign(campaignId, tenantId) {
    const result = await query(
      'UPDATE campaigns SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id',
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return { success: true };
  }

  /**
   * Start/Launch a campaign
   */
  async launchCampaign(campaignId, tenantId) {
    const campaign = await this.getCampaign(campaignId, tenantId);

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new Error('Can only launch draft or paused campaigns');
    }

    // Update campaign status
    await query(
      `UPDATE campaigns
       SET status = 'running', started_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [campaignId, tenantId]
    );

    // Build recipient list
    await this.buildRecipientList(campaignId, tenantId, campaign);

    // Start sending messages
    await this.processCampaign(campaignId, tenantId);

    return { success: true, message: 'Campaign launched' };
  }

  /**
   * Pause a running campaign
   */
  async pauseCampaign(campaignId, tenantId) {
    const result = await query(
      `UPDATE campaigns
       SET status = 'paused', paused_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'running'
       RETURNING id`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found or not running');
    }

    return { success: true };
  }

  /**
   * Build recipient list from contact lists
   */
  async buildRecipientList(campaignId, tenantId, campaign) {
    // Get contacts from lists
    const contacts = await query(
      `SELECT DISTINCT c.id, c.phone, c.email, c.first_name, c.last_name, c.custom_fields
       FROM contacts c
       INNER JOIN contact_list_members clm ON c.id = clm.contact_id
       WHERE clm.list_id = ANY($1)
         AND c.tenant_id = $2
         AND c.deleted_at IS NULL`,
      [campaign.contact_list_ids, tenantId]
    );

    // Filter out unsubscribes
    const type = campaign.type;
    const unsubscribes = await query(
      `SELECT email, phone FROM unsubscribes
       WHERE tenant_id = $1 AND (type = $2 OR type = 'all')`,
      [tenantId, type]
    );

    const unsubscribedEmails = new Set(unsubscribes.rows.map(u => u.email).filter(Boolean));
    const unsubscribedPhones = new Set(unsubscribes.rows.map(u => u.phone).filter(Boolean));

    // Insert recipients
    for (const contact of contacts.rows) {
      // Skip if unsubscribed
      if (type === 'email' && unsubscribedEmails.has(contact.email)) continue;
      if (type === 'sms' && unsubscribedPhones.has(contact.phone)) continue;
      if (type === 'voice' && unsubscribedPhones.has(contact.phone)) continue;

      await query(
        `INSERT INTO campaign_recipients (
          campaign_id, contact_id, phone, email, first_name, last_name, custom_fields, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [campaignId, contact.id, contact.phone, contact.email, contact.first_name, contact.last_name, JSON.stringify(contact.custom_fields)]
      );
    }
  }

  /**
   * Process campaign - send messages to recipients
   */
  async processCampaign(campaignId, tenantId) {
    const campaign = await this.getCampaign(campaignId, tenantId);

    // Get pending recipients
    const recipients = await query(
      `SELECT * FROM campaign_recipients
       WHERE campaign_id = $1 AND status = 'pending'
       ORDER BY id
       LIMIT 100`, // Process in batches
      [campaignId]
    );

    for (const recipient of recipients.rows) {
      try {
        // Render message template with variables
        const message = this.renderTemplate(campaign.message_template, {
          first_name: recipient.first_name,
          last_name: recipient.last_name,
          ...recipient.custom_fields
        });

        // Send based on campaign type
        if (campaign.type === 'sms') {
          await this.sendCampaignSMS(campaign, recipient, message);
        } else if (campaign.type === 'email') {
          await this.sendCampaignEmail(campaign, recipient, message);
        } else if (campaign.type === 'voice') {
          await this.sendCampaignVoice(campaign, recipient, message);
        }

        // Mark as sent
        await query(
          `UPDATE campaign_recipients SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [recipient.id]
        );

      } catch (error) {
        // Mark as failed
        await query(
          `UPDATE campaign_recipients
           SET status = 'failed', failed_at = NOW(), error_message = $1, retry_count = retry_count + 1
           WHERE id = $2`,
          [error.message, recipient.id]
        );
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000 / campaign.rate_limit));
    }

    // Check if campaign is complete
    const pendingCount = await query(
      `SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = $1 AND status = 'pending'`,
      [campaignId]
    );

    if (parseInt(pendingCount.rows[0].count) === 0) {
      await query(
        `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [campaignId]
      );
    }
  }

  /**
   * Send campaign SMS via NATS queue
   */
  async sendCampaignSMS(campaign, recipient, message) {
    await nats.publishSMS({
      tenant_id: campaign.tenant_id,
      to: recipient.phone,
      from: campaign.from_number,
      body: message,
      campaign_id: campaign.id,
      recipient_id: recipient.id
    });
  }

  /**
   * Send campaign email via NATS queue
   */
  async sendCampaignEmail(campaign, recipient, message) {
    await nats.publishEmail({
      tenant_id: campaign.tenant_id,
      to: recipient.email,
      from: campaign.from_email,
      from_name: campaign.from_name,
      subject: campaign.subject,
      body: message,
      campaign_id: campaign.id,
      recipient_id: recipient.id
    });
  }

  /**
   * Send campaign voice call
   */
  async sendCampaignVoice(campaign, recipient, message) {
    // TODO: Integrate with voice/dialer system
    throw new Error('Voice campaigns not yet implemented');
  }

  /**
   * Render message template with variables
   */
  renderTemplate(template, variables) {
    let rendered = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, value || '');
    }

    return rendered;
  }

  /**
   * Get campaign stats/analytics
   */
  async getCampaignStats(campaignId, tenantId) {
    const result = await query(
      `SELECT * FROM campaign_performance WHERE campaign_id = $1 AND tenant_id = $2`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }
}

export default new CampaignService();
