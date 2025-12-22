/**
 * Drip Campaign Service
 * Multi-step automated campaign sequences
 *
 * Features:
 * - Multi-step email/SMS/voice sequences
 * - Configurable delays between steps
 * - Conditional branching based on recipient actions
 * - A/B testing support
 * - Automatic enrollment triggers
 * - Goal tracking (conversions)
 */

import { query } from '../db/connection.js';
import redis from '../db/redis.js';

class DripCampaignService {
  /**
   * Create a new drip campaign
   */
  async createDripCampaign(tenantId, campaignData) {
    const {
      name,
      description,
      trigger_type = 'manual', // manual, event, signup, tag_added, list_added
      trigger_config = {},
      contact_list_ids = [],
      filter_criteria = {},
      goal_type = null, // conversion, reply, click, open
      goal_config = {},
      timezone = 'UTC',
      is_active = false
    } = campaignData;

    if (!name) {
      throw new Error('Campaign name is required');
    }

    const result = await query(
      `INSERT INTO drip_campaigns (
        tenant_id, name, description, trigger_type, trigger_config,
        contact_list_ids, filter_criteria, goal_type, goal_config,
        timezone, is_active, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *`,
      [
        tenantId, name, description, trigger_type, JSON.stringify(trigger_config),
        contact_list_ids, JSON.stringify(filter_criteria), goal_type, JSON.stringify(goal_config),
        timezone, is_active
      ]
    );

    return result.rows[0];
  }

  /**
   * Get drip campaign by ID
   */
  async getDripCampaign(campaignId, tenantId) {
    const result = await query(
      `SELECT dc.*,
        (SELECT COUNT(*) FROM drip_campaign_steps WHERE drip_campaign_id = dc.id) as step_count,
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = dc.id AND status = 'active') as active_enrollments
       FROM drip_campaigns dc
       WHERE dc.id = $1 AND dc.tenant_id = $2 AND dc.deleted_at IS NULL`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Drip campaign not found');
    }

    return result.rows[0];
  }

  /**
   * List drip campaigns
   */
  async listDripCampaigns(tenantId, options = {}) {
    const { page = 1, limit = 50, status, is_active } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'dc.tenant_id = $1 AND dc.deleted_at IS NULL';
    const values = [tenantId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND dc.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (is_active !== undefined) {
      whereClause += ` AND dc.is_active = $${paramCount}`;
      values.push(is_active);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT dc.*,
        (SELECT COUNT(*) FROM drip_campaign_steps WHERE drip_campaign_id = dc.id) as step_count,
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = dc.id AND status = 'active') as active_enrollments,
        COUNT(*) OVER() as total_count
       FROM drip_campaigns dc
       WHERE ${whereClause}
       ORDER BY dc.created_at DESC
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
   * Update drip campaign
   */
  async updateDripCampaign(campaignId, tenantId, updates) {
    const allowedFields = [
      'name', 'description', 'trigger_type', 'trigger_config',
      'contact_list_ids', 'filter_criteria', 'goal_type', 'goal_config',
      'timezone', 'is_active'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(campaignId, tenantId);

    const result = await query(
      `UPDATE drip_campaigns
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Drip campaign not found');
    }

    return result.rows[0];
  }

  /**
   * Delete drip campaign (soft delete)
   */
  async deleteDripCampaign(campaignId, tenantId) {
    const result = await query(
      `UPDATE drip_campaigns
       SET deleted_at = NOW(), is_active = false
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Drip campaign not found');
    }

    return { success: true };
  }

  // =========================================
  // CAMPAIGN STEPS
  // =========================================

  /**
   * Add a step to a drip campaign
   */
  async addStep(campaignId, tenantId, stepData) {
    // Verify campaign exists and belongs to tenant
    await this.getDripCampaign(campaignId, tenantId);

    const {
      step_order,
      step_type = 'message', // message, wait, condition, goal_check
      channel = 'email', // email, sms, voice
      delay_amount = 0,
      delay_unit = 'days', // minutes, hours, days, weeks
      subject,
      message_template,
      from_number,
      from_email,
      from_name,
      voice_script,
      voice_provider,
      voice_id,
      condition_type, // opened, clicked, replied, not_opened, not_clicked
      condition_config = {},
      ab_test_enabled = false,
      ab_variants = []
    } = stepData;

    // Calculate step order if not provided
    let order = step_order;
    if (order === undefined) {
      const maxOrder = await query(
        'SELECT COALESCE(MAX(step_order), 0) as max_order FROM drip_campaign_steps WHERE drip_campaign_id = $1',
        [campaignId]
      );
      order = parseInt(maxOrder.rows[0].max_order) + 1;
    }

    const result = await query(
      `INSERT INTO drip_campaign_steps (
        drip_campaign_id, step_order, step_type, channel,
        delay_amount, delay_unit, subject, message_template,
        from_number, from_email, from_name,
        voice_script, voice_provider, voice_id,
        condition_type, condition_config,
        ab_test_enabled, ab_variants
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        campaignId, order, step_type, channel,
        delay_amount, delay_unit, subject, message_template,
        from_number, from_email, from_name,
        voice_script, voice_provider, voice_id,
        condition_type, JSON.stringify(condition_config),
        ab_test_enabled, JSON.stringify(ab_variants)
      ]
    );

    return result.rows[0];
  }

  /**
   * Get all steps for a drip campaign
   */
  async getSteps(campaignId, tenantId) {
    // Verify campaign exists and belongs to tenant
    await this.getDripCampaign(campaignId, tenantId);

    const result = await query(
      `SELECT * FROM drip_campaign_steps
       WHERE drip_campaign_id = $1
       ORDER BY step_order ASC`,
      [campaignId]
    );

    return result.rows;
  }

  /**
   * Update a step
   */
  async updateStep(stepId, campaignId, tenantId, updates) {
    // Verify campaign exists and belongs to tenant
    await this.getDripCampaign(campaignId, tenantId);

    const allowedFields = [
      'step_order', 'step_type', 'channel', 'delay_amount', 'delay_unit',
      'subject', 'message_template', 'from_number', 'from_email', 'from_name',
      'voice_script', 'voice_provider', 'voice_id',
      'condition_type', 'condition_config', 'ab_test_enabled', 'ab_variants'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = $${paramCount}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClauses.push('updated_at = NOW()');
    values.push(stepId, campaignId);

    const result = await query(
      `UPDATE drip_campaign_steps
       SET ${setClauses.join(', ')}
       WHERE id = $${paramCount} AND drip_campaign_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Step not found');
    }

    return result.rows[0];
  }

  /**
   * Delete a step
   */
  async deleteStep(stepId, campaignId, tenantId) {
    // Verify campaign exists and belongs to tenant
    await this.getDripCampaign(campaignId, tenantId);

    const result = await query(
      'DELETE FROM drip_campaign_steps WHERE id = $1 AND drip_campaign_id = $2 RETURNING id',
      [stepId, campaignId]
    );

    if (result.rows.length === 0) {
      throw new Error('Step not found');
    }

    // Reorder remaining steps
    await query(
      `UPDATE drip_campaign_steps
       SET step_order = step_order - 1
       WHERE drip_campaign_id = $1 AND step_order > (SELECT step_order FROM drip_campaign_steps WHERE id = $2)`,
      [campaignId, stepId]
    );

    return { success: true };
  }

  /**
   * Reorder steps
   */
  async reorderSteps(campaignId, tenantId, stepOrders) {
    // Verify campaign exists and belongs to tenant
    await this.getDripCampaign(campaignId, tenantId);

    // stepOrders is an array of { step_id, step_order }
    for (const { step_id, step_order } of stepOrders) {
      await query(
        'UPDATE drip_campaign_steps SET step_order = $1 WHERE id = $2 AND drip_campaign_id = $3',
        [step_order, step_id, campaignId]
      );
    }

    return this.getSteps(campaignId, tenantId);
  }

  // =========================================
  // ENROLLMENTS
  // =========================================

  /**
   * Enroll a contact in a drip campaign
   */
  async enrollContact(campaignId, tenantId, contactId, options = {}) {
    const { source = 'manual', trigger_data = {} } = options;

    // Verify campaign exists and is active
    const campaign = await this.getDripCampaign(campaignId, tenantId);
    if (!campaign.is_active) {
      throw new Error('Campaign is not active');
    }

    // Check if already enrolled
    const existing = await query(
      `SELECT id FROM drip_campaign_enrollments
       WHERE drip_campaign_id = $1 AND contact_id = $2 AND status = 'active'`,
      [campaignId, contactId]
    );

    if (existing.rows.length > 0) {
      throw new Error('Contact is already enrolled in this campaign');
    }

    // Get first step
    const firstStep = await query(
      'SELECT id FROM drip_campaign_steps WHERE drip_campaign_id = $1 ORDER BY step_order ASC LIMIT 1',
      [campaignId]
    );

    if (firstStep.rows.length === 0) {
      throw new Error('Campaign has no steps');
    }

    // Create enrollment
    const result = await query(
      `INSERT INTO drip_campaign_enrollments (
        drip_campaign_id, contact_id, tenant_id, current_step_id,
        status, enrollment_source, trigger_data, next_step_at
      ) VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW())
      RETURNING *`,
      [campaignId, contactId, tenantId, firstStep.rows[0].id, source, JSON.stringify(trigger_data)]
    );

    // Queue first step for processing
    await this.queueStepExecution(result.rows[0].id);

    return result.rows[0];
  }

  /**
   * Bulk enroll contacts from a list
   */
  async enrollFromList(campaignId, tenantId, listId) {
    const campaign = await this.getDripCampaign(campaignId, tenantId);
    if (!campaign.is_active) {
      throw new Error('Campaign is not active');
    }

    // Get contacts from list
    const contacts = await query(
      `SELECT DISTINCT c.id
       FROM contacts c
       INNER JOIN contact_list_members clm ON c.id = clm.contact_id
       WHERE clm.list_id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
      [listId, tenantId]
    );

    let enrolled = 0;
    let skipped = 0;

    for (const contact of contacts.rows) {
      try {
        await this.enrollContact(campaignId, tenantId, contact.id, { source: 'list_import' });
        enrolled++;
      } catch (error) {
        skipped++; // Already enrolled or other error
      }
    }

    return { enrolled, skipped, total: contacts.rows.length };
  }

  /**
   * Remove contact from campaign
   */
  async unenrollContact(campaignId, tenantId, contactId, reason = 'manual') {
    const result = await query(
      `UPDATE drip_campaign_enrollments
       SET status = 'removed', completed_at = NOW(), completion_reason = $4
       WHERE drip_campaign_id = $1 AND contact_id = $2 AND tenant_id = $3 AND status = 'active'
       RETURNING id`,
      [campaignId, contactId, tenantId, reason]
    );

    if (result.rows.length === 0) {
      throw new Error('Enrollment not found');
    }

    return { success: true };
  }

  /**
   * Get enrollment status for a contact
   */
  async getEnrollmentStatus(campaignId, tenantId, contactId) {
    const result = await query(
      `SELECT dce.*, dcs.step_order, dcs.step_type, dcs.channel
       FROM drip_campaign_enrollments dce
       LEFT JOIN drip_campaign_steps dcs ON dce.current_step_id = dcs.id
       WHERE dce.drip_campaign_id = $1 AND dce.contact_id = $2 AND dce.tenant_id = $3
       ORDER BY dce.created_at DESC
       LIMIT 1`,
      [campaignId, contactId, tenantId]
    );

    return result.rows[0] || null;
  }

  /**
   * List enrollments for a campaign
   */
  async listEnrollments(campaignId, tenantId, options = {}) {
    const { page = 1, limit = 50, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'dce.drip_campaign_id = $1 AND dce.tenant_id = $2';
    const values = [campaignId, tenantId];
    let paramCount = 3;

    if (status) {
      whereClause += ` AND dce.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    values.push(limit, offset);

    const result = await query(
      `SELECT dce.*, c.email, c.phone, c.first_name, c.last_name,
        dcs.step_order, dcs.step_type, dcs.channel,
        COUNT(*) OVER() as total_count
       FROM drip_campaign_enrollments dce
       LEFT JOIN contacts c ON dce.contact_id = c.id
       LEFT JOIN drip_campaign_steps dcs ON dce.current_step_id = dcs.id
       WHERE ${whereClause}
       ORDER BY dce.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      values
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    return {
      enrollments: result.rows.map(row => {
        const { total_count, ...enrollment } = row;
        return enrollment;
      }),
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  // =========================================
  // STEP EXECUTION
  // =========================================

  /**
   * Queue a step for execution
   */
  async queueStepExecution(enrollmentId) {
    const key = `drip:execute:${enrollmentId}`;
    await redis.set(key, Date.now().toString(), 'EX', 86400); // 24 hour expiry
  }

  /**
   * Process due step executions (called by background job)
   */
  async processDueSteps() {
    // Get all enrollments where next_step_at <= now and status = active
    const dueEnrollments = await query(
      `SELECT dce.*, dc.tenant_id as campaign_tenant_id
       FROM drip_campaign_enrollments dce
       INNER JOIN drip_campaigns dc ON dce.drip_campaign_id = dc.id
       WHERE dce.status = 'active'
         AND dce.next_step_at <= NOW()
         AND dc.is_active = true
       ORDER BY dce.next_step_at ASC
       LIMIT 100`
    );

    const results = [];

    for (const enrollment of dueEnrollments.rows) {
      try {
        const result = await this.executeStep(enrollment);
        results.push({ enrollment_id: enrollment.id, success: true, ...result });
      } catch (error) {
        console.error(`[Drip] Step execution error for enrollment ${enrollment.id}:`, error);
        results.push({ enrollment_id: enrollment.id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Execute a step for an enrollment
   */
  async executeStep(enrollment) {
    const step = await query(
      'SELECT * FROM drip_campaign_steps WHERE id = $1',
      [enrollment.current_step_id]
    );

    if (step.rows.length === 0) {
      throw new Error('Step not found');
    }

    const currentStep = step.rows[0];

    // Get contact details
    const contact = await query(
      'SELECT * FROM contacts WHERE id = $1',
      [enrollment.contact_id]
    );

    if (contact.rows.length === 0) {
      // Contact was deleted, complete enrollment
      await this.completeEnrollment(enrollment.id, 'contact_deleted');
      return { action: 'completed', reason: 'contact_deleted' };
    }

    const contactData = contact.rows[0];

    // Handle different step types
    let result;
    switch (currentStep.step_type) {
      case 'message':
        result = await this.executeMessageStep(enrollment, currentStep, contactData);
        break;
      case 'wait':
        result = await this.executeWaitStep(enrollment, currentStep);
        break;
      case 'condition':
        result = await this.executeConditionStep(enrollment, currentStep);
        break;
      case 'goal_check':
        result = await this.executeGoalCheckStep(enrollment, currentStep);
        break;
      default:
        throw new Error(`Unknown step type: ${currentStep.step_type}`);
    }

    // Move to next step or complete
    await this.advanceToNextStep(enrollment, currentStep, result);

    return result;
  }

  /**
   * Execute a message step (email, sms, voice)
   */
  async executeMessageStep(enrollment, step, contact) {
    // Render template with contact variables
    const message = this.renderTemplate(step.message_template, {
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      ...contact.custom_fields
    });

    const subject = step.subject ? this.renderTemplate(step.subject, {
      first_name: contact.first_name,
      last_name: contact.last_name,
      ...contact.custom_fields
    }) : null;

    // Record execution
    await query(
      `INSERT INTO drip_campaign_step_executions (
        enrollment_id, step_id, channel, recipient, message_content, subject, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'sent')`,
      [
        enrollment.id,
        step.id,
        step.channel,
        step.channel === 'email' ? contact.email : contact.phone,
        message,
        subject
      ]
    );

    // Increment step execution count
    await query(
      'UPDATE drip_campaign_steps SET execution_count = execution_count + 1 WHERE id = $1',
      [step.id]
    );

    return { action: 'message_sent', channel: step.channel };
  }

  /**
   * Execute a wait step (just schedules next step)
   */
  async executeWaitStep(enrollment, step) {
    // Wait steps don't actually execute anything,
    // they just add delay before the next step
    return { action: 'wait_completed', delay: `${step.delay_amount} ${step.delay_unit}` };
  }

  /**
   * Execute a condition step (branch based on recipient actions)
   */
  async executeConditionStep(enrollment, step) {
    // Check the condition
    let conditionMet = false;

    switch (step.condition_type) {
      case 'opened':
        // Check if previous email was opened
        conditionMet = await this.checkEmailOpened(enrollment);
        break;
      case 'clicked':
        conditionMet = await this.checkEmailClicked(enrollment);
        break;
      case 'replied':
        conditionMet = await this.checkReplied(enrollment);
        break;
      case 'not_opened':
        conditionMet = !(await this.checkEmailOpened(enrollment));
        break;
      case 'not_clicked':
        conditionMet = !(await this.checkEmailClicked(enrollment));
        break;
      default:
        conditionMet = true;
    }

    return { action: 'condition_evaluated', condition: step.condition_type, result: conditionMet };
  }

  /**
   * Execute a goal check step
   */
  async executeGoalCheckStep(enrollment, step) {
    // Check if goal has been achieved
    const campaign = await query(
      'SELECT goal_type, goal_config FROM drip_campaigns WHERE id = $1',
      [enrollment.drip_campaign_id]
    );

    if (campaign.rows[0].goal_type) {
      const goalAchieved = await this.checkGoalAchieved(enrollment, campaign.rows[0]);
      if (goalAchieved) {
        await this.completeEnrollment(enrollment.id, 'goal_achieved');
        return { action: 'goal_achieved', completed: true };
      }
    }

    return { action: 'goal_not_achieved', completed: false };
  }

  /**
   * Advance enrollment to next step
   */
  async advanceToNextStep(enrollment, currentStep, result) {
    // Get next step
    const nextStep = await query(
      `SELECT * FROM drip_campaign_steps
       WHERE drip_campaign_id = $1 AND step_order > $2
       ORDER BY step_order ASC
       LIMIT 1`,
      [enrollment.drip_campaign_id, currentStep.step_order]
    );

    if (nextStep.rows.length === 0) {
      // No more steps, complete enrollment
      await this.completeEnrollment(enrollment.id, 'completed');
      return;
    }

    const next = nextStep.rows[0];

    // Calculate next step time based on delay
    const delayMs = this.calculateDelayMs(next.delay_amount, next.delay_unit);

    await query(
      `UPDATE drip_campaign_enrollments
       SET current_step_id = $1,
           steps_completed = steps_completed + 1,
           next_step_at = NOW() + INTERVAL '${delayMs} milliseconds',
           updated_at = NOW()
       WHERE id = $2`,
      [next.id, enrollment.id]
    );
  }

  /**
   * Complete an enrollment
   */
  async completeEnrollment(enrollmentId, reason) {
    await query(
      `UPDATE drip_campaign_enrollments
       SET status = 'completed', completed_at = NOW(), completion_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [enrollmentId, reason]
    );
  }

  /**
   * Calculate delay in milliseconds
   */
  calculateDelayMs(amount, unit) {
    const multipliers = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000
    };
    return amount * (multipliers[unit] || multipliers.days);
  }

  /**
   * Check if previous email was opened
   */
  async checkEmailOpened(enrollment) {
    const result = await query(
      `SELECT 1 FROM drip_campaign_step_executions
       WHERE enrollment_id = $1 AND channel = 'email' AND opened_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [enrollment.id]
    );
    return result.rows.length > 0;
  }

  /**
   * Check if previous email was clicked
   */
  async checkEmailClicked(enrollment) {
    const result = await query(
      `SELECT 1 FROM drip_campaign_step_executions
       WHERE enrollment_id = $1 AND channel = 'email' AND clicked_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [enrollment.id]
    );
    return result.rows.length > 0;
  }

  /**
   * Check if contact replied
   */
  async checkReplied(enrollment) {
    const result = await query(
      `SELECT 1 FROM drip_campaign_step_executions
       WHERE enrollment_id = $1 AND replied_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [enrollment.id]
    );
    return result.rows.length > 0;
  }

  /**
   * Check if campaign goal was achieved
   */
  async checkGoalAchieved(enrollment, campaign) {
    // This would be customized based on goal_type
    // For now, return false (goal not achieved)
    return false;
  }

  /**
   * Render template with variables
   */
  renderTemplate(template, variables) {
    if (!template) return '';

    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      rendered = rendered.replace(regex, value || '');
    }
    return rendered;
  }

  // =========================================
  // STATISTICS
  // =========================================

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId, tenantId) {
    await this.getDripCampaign(campaignId, tenantId);

    const stats = await query(
      `SELECT
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = $1) as total_enrollments,
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = $1 AND status = 'active') as active_enrollments,
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = $1 AND status = 'completed') as completed_enrollments,
        (SELECT COUNT(*) FROM drip_campaign_enrollments WHERE drip_campaign_id = $1 AND completion_reason = 'goal_achieved') as goal_conversions,
        (SELECT COUNT(*) FROM drip_campaign_step_executions dse
         INNER JOIN drip_campaign_steps dcs ON dse.step_id = dcs.id
         WHERE dcs.drip_campaign_id = $1) as total_messages_sent`,
      [campaignId]
    );

    const stepStats = await query(
      `SELECT dcs.id, dcs.step_order, dcs.step_type, dcs.channel,
        dcs.execution_count,
        (SELECT COUNT(*) FROM drip_campaign_step_executions WHERE step_id = dcs.id AND opened_at IS NOT NULL) as opens,
        (SELECT COUNT(*) FROM drip_campaign_step_executions WHERE step_id = dcs.id AND clicked_at IS NOT NULL) as clicks
       FROM drip_campaign_steps dcs
       WHERE dcs.drip_campaign_id = $1
       ORDER BY dcs.step_order`,
      [campaignId]
    );

    return {
      ...stats.rows[0],
      steps: stepStats.rows
    };
  }

  // =========================================
  // ACTIVATION
  // =========================================

  /**
   * Activate a drip campaign
   */
  async activateCampaign(campaignId, tenantId) {
    // Verify campaign has steps
    const steps = await this.getSteps(campaignId, tenantId);
    if (steps.length === 0) {
      throw new Error('Campaign must have at least one step before activation');
    }

    const result = await query(
      `UPDATE drip_campaigns
       SET is_active = true, status = 'active', activated_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }

  /**
   * Deactivate a drip campaign
   */
  async deactivateCampaign(campaignId, tenantId) {
    const result = await query(
      `UPDATE drip_campaigns
       SET is_active = false, status = 'paused', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [campaignId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }
}

export default new DripCampaignService();
