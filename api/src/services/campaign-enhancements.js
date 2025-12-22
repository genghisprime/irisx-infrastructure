/**
 * Campaign Enhancements Service
 * Recurring campaigns, triggered campaigns, A/B testing, preview dialer, approval workflows
 */

import db from '../db.js';

class CampaignEnhancementsService {
  // =========================================
  // RECURRING CAMPAIGNS (RRULE Support)
  // =========================================

  /**
   * Set recurring schedule for a campaign
   */
  async setRecurringSchedule(campaignId, tenantId, schedule) {
    const { rrule, until, timezone = 'UTC' } = schedule;

    // Calculate next run from RRULE
    const nextRun = this.calculateNextRunFromRRule(rrule, timezone);

    const result = await db.query(`
      UPDATE campaigns
      SET
        is_recurring = true,
        rrule = $1,
        recurring_until = $2,
        next_run_at = $3,
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `, [rrule, until, nextRun, campaignId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }

  /**
   * Remove recurring schedule
   */
  async removeRecurringSchedule(campaignId, tenantId) {
    const result = await db.query(`
      UPDATE campaigns
      SET
        is_recurring = false,
        rrule = NULL,
        recurring_until = NULL,
        next_run_at = NULL,
        updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [campaignId, tenantId]);

    return result.rows[0];
  }

  /**
   * Parse RRULE and calculate next run time
   */
  calculateNextRunFromRRule(rrule, timezone = 'UTC') {
    // Simple RRULE parser (production would use rrule.js library)
    const parts = rrule.split(';').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});

    const now = new Date();
    let nextRun = new Date(now);

    const freq = parts.FREQ;
    const interval = parseInt(parts.INTERVAL) || 1;
    const byday = parts.BYDAY?.split(',') || [];
    const byhour = parts.BYHOUR ? parseInt(parts.BYHOUR) : 9;
    const byminute = parts.BYMINUTE ? parseInt(parts.BYMINUTE) : 0;

    nextRun.setHours(byhour, byminute, 0, 0);

    // If time has passed today, start from tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    switch (freq) {
      case 'DAILY':
        // Already set to tomorrow if needed
        break;

      case 'WEEKLY':
        // Find next valid day of week
        if (byday.length > 0) {
          const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
          const validDays = byday.map(d => dayMap[d]).sort((a, b) => a - b);

          let found = false;
          for (let i = 0; i < 7 && !found; i++) {
            const checkDay = (nextRun.getDay() + i) % 7;
            if (validDays.includes(checkDay)) {
              nextRun.setDate(nextRun.getDate() + i);
              found = true;
            }
          }
        }
        break;

      case 'MONTHLY':
        const bymonthday = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY) : nextRun.getDate();
        nextRun.setDate(bymonthday);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + interval);
        }
        break;
    }

    return nextRun;
  }

  /**
   * Get campaigns due to run
   */
  async getCampaignsDueToRun() {
    const result = await db.query(`
      SELECT * FROM campaigns
      WHERE is_recurring = true
        AND status = 'active'
        AND next_run_at <= NOW()
        AND (recurring_until IS NULL OR recurring_until >= CURRENT_DATE)
    `);

    return result.rows;
  }

  /**
   * Create a campaign run record
   */
  async createCampaignRun(campaignId, tenantId) {
    // Get current run count
    const campaign = await db.query(`
      SELECT run_count FROM campaigns WHERE id = $1
    `, [campaignId]);

    const runNumber = (campaign.rows[0]?.run_count || 0) + 1;

    const result = await db.query(`
      INSERT INTO campaign_runs (
        campaign_id, tenant_id, run_number, scheduled_at, status
      )
      VALUES ($1, $2, $3, NOW(), 'running')
      RETURNING *
    `, [campaignId, tenantId, runNumber]);

    // Update campaign
    await db.query(`
      UPDATE campaigns
      SET run_count = $1, last_run_at = NOW()
      WHERE id = $2
    `, [runNumber, campaignId]);

    return result.rows[0];
  }

  /**
   * Complete a campaign run
   */
  async completeCampaignRun(runId, stats) {
    const result = await db.query(`
      UPDATE campaign_runs
      SET
        status = 'completed',
        completed_at = NOW(),
        total_contacts = $1,
        dialed = $2,
        connected = $3,
        failed = $4
      WHERE id = $5
      RETURNING *
    `, [stats.total_contacts, stats.dialed, stats.connected, stats.failed, runId]);

    // Update next run time
    if (result.rows[0]) {
      const campaign = await db.query(`
        SELECT rrule FROM campaigns WHERE id = $1
      `, [result.rows[0].campaign_id]);

      if (campaign.rows[0]?.rrule) {
        const nextRun = this.calculateNextRunFromRRule(campaign.rows[0].rrule);
        await db.query(`
          UPDATE campaigns SET next_run_at = $1 WHERE id = $2
        `, [nextRun, result.rows[0].campaign_id]);
      }
    }

    return result.rows[0];
  }

  /**
   * Get campaign runs
   */
  async getCampaignRuns(campaignId, tenantId, options = {}) {
    const { page = 1, limit = 50 } = options;

    const result = await db.query(`
      SELECT * FROM campaign_runs
      WHERE campaign_id = $1 AND tenant_id = $2
      ORDER BY scheduled_at DESC
      LIMIT $3 OFFSET $4
    `, [campaignId, tenantId, limit, (page - 1) * limit]);

    return {
      runs: result.rows,
      pagination: { page, limit }
    };
  }

  // =========================================
  // TRIGGERED CAMPAIGNS
  // =========================================

  /**
   * Create a campaign trigger
   */
  async createTrigger(campaignId, tenantId, triggerData) {
    const result = await db.query(`
      INSERT INTO campaign_triggers (
        campaign_id, tenant_id, trigger_type, conditions,
        delay_minutes, delay_until_time, max_triggers_per_contact, cooldown_hours
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      campaignId,
      tenantId,
      triggerData.trigger_type,
      JSON.stringify(triggerData.conditions || []),
      triggerData.delay_minutes || 0,
      triggerData.delay_until_time || null,
      triggerData.max_triggers_per_contact || 1,
      triggerData.cooldown_hours || 24
    ]);

    return result.rows[0];
  }

  /**
   * Get triggers for a campaign
   */
  async getCampaignTriggers(campaignId, tenantId) {
    const result = await db.query(`
      SELECT * FROM campaign_triggers
      WHERE campaign_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC
    `, [campaignId, tenantId]);

    return result.rows;
  }

  /**
   * Update a trigger
   */
  async updateTrigger(triggerId, tenantId, data) {
    const fields = [];
    const values = [triggerId, tenantId];
    let idx = 3;

    const allowedFields = ['trigger_type', 'conditions', 'delay_minutes', 'delay_until_time',
      'max_triggers_per_contact', 'cooldown_hours', 'is_active'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'conditions') {
          fields.push(`${field} = $${idx++}`);
          values.push(JSON.stringify(data[field]));
        } else {
          fields.push(`${field} = $${idx++}`);
          values.push(data[field]);
        }
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);

    const result = await db.query(`
      UPDATE campaign_triggers
      SET ${fields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(triggerId, tenantId) {
    await db.query(`
      DELETE FROM campaign_triggers
      WHERE id = $1 AND tenant_id = $2
    `, [triggerId, tenantId]);
  }

  /**
   * Process an event and fire matching triggers
   */
  async processEvent(tenantId, eventType, contactId, eventData = {}) {
    // Find matching active triggers
    const triggers = await db.query(`
      SELECT ct.*, c.name as campaign_name, c.status as campaign_status
      FROM campaign_triggers ct
      JOIN campaigns c ON c.id = ct.campaign_id
      WHERE ct.tenant_id = $1
        AND ct.trigger_type = $2
        AND ct.is_active = true
        AND c.status = 'active'
    `, [tenantId, eventType]);

    const results = [];

    for (const trigger of triggers.rows) {
      // Check if contact has already triggered too many times
      const triggerCountResult = await db.query(`
        SELECT COUNT(*) FROM campaign_trigger_logs
        WHERE trigger_id = $1 AND contact_id = $2
      `, [trigger.id, contactId]);

      const triggerCount = parseInt(triggerCountResult.rows[0].count);

      if (triggerCount >= trigger.max_triggers_per_contact) {
        results.push({
          trigger_id: trigger.id,
          status: 'skipped',
          reason: 'max_triggers_reached'
        });
        continue;
      }

      // Check cooldown
      const lastTriggerResult = await db.query(`
        SELECT created_at FROM campaign_trigger_logs
        WHERE trigger_id = $1 AND contact_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [trigger.id, contactId]);

      if (lastTriggerResult.rows.length > 0) {
        const lastTrigger = new Date(lastTriggerResult.rows[0].created_at);
        const cooldownEnd = new Date(lastTrigger.getTime() + (trigger.cooldown_hours * 60 * 60 * 1000));

        if (new Date() < cooldownEnd) {
          results.push({
            trigger_id: trigger.id,
            status: 'skipped',
            reason: 'cooldown_active'
          });
          continue;
        }
      }

      // Check conditions
      if (!this.evaluateConditions(trigger.conditions, eventData)) {
        results.push({
          trigger_id: trigger.id,
          status: 'skipped',
          reason: 'conditions_not_met'
        });
        continue;
      }

      // Log the trigger
      const logResult = await db.query(`
        INSERT INTO campaign_trigger_logs (
          trigger_id, campaign_id, tenant_id, contact_id,
          event_type, event_data, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        trigger.id,
        trigger.campaign_id,
        tenantId,
        contactId,
        eventType,
        JSON.stringify(eventData),
        trigger.delay_minutes > 0 ? 'delayed' : 'triggered'
      ]);

      results.push({
        trigger_id: trigger.id,
        log_id: logResult.rows[0].id,
        status: trigger.delay_minutes > 0 ? 'delayed' : 'triggered',
        delay_minutes: trigger.delay_minutes
      });
    }

    return results;
  }

  /**
   * Evaluate trigger conditions against event data
   */
  evaluateConditions(conditions, data) {
    if (!conditions || conditions.length === 0) return true;

    for (const condition of conditions) {
      const value = data[condition.field];

      switch (condition.operator) {
        case 'eq':
        case 'equals':
          if (value !== condition.value) return false;
          break;
        case 'ne':
        case 'not_equals':
          if (value === condition.value) return false;
          break;
        case 'contains':
          if (Array.isArray(value)) {
            if (!value.includes(condition.value)) return false;
          } else if (typeof value === 'string') {
            if (!value.includes(condition.value)) return false;
          } else {
            return false;
          }
          break;
        case 'gt':
          if (value <= condition.value) return false;
          break;
        case 'lt':
          if (value >= condition.value) return false;
          break;
        case 'exists':
          if (value === undefined || value === null) return false;
          break;
        case 'not_exists':
          if (value !== undefined && value !== null) return false;
          break;
      }
    }

    return true;
  }

  // =========================================
  // A/B TEST CAMPAIGNS
  // =========================================

  /**
   * Create an A/B test for a campaign
   */
  async createABTest(campaignId, tenantId, testConfig) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Create the test
      const testResult = await client.query(`
        INSERT INTO campaign_ab_tests (
          campaign_id, tenant_id, test_name, test_type,
          winning_metric, sample_size_percent, test_duration_hours, auto_select_winner
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        campaignId,
        tenantId,
        testConfig.test_name || 'A/B Test',
        testConfig.test_type,
        testConfig.winning_metric || 'conversion_rate',
        testConfig.sample_size_percent || 20,
        testConfig.test_duration_hours || 24,
        testConfig.auto_select_winner !== false
      ]);

      const test = testResult.rows[0];

      // Create variant A
      await client.query(`
        INSERT INTO campaign_ab_variants (ab_test_id, tenant_id, variant, content)
        VALUES ($1, $2, 'A', $3)
      `, [test.id, tenantId, JSON.stringify(testConfig.variant_a)]);

      // Create variant B
      await client.query(`
        INSERT INTO campaign_ab_variants (ab_test_id, tenant_id, variant, content)
        VALUES ($1, $2, 'B', $3)
      `, [test.id, tenantId, JSON.stringify(testConfig.variant_b)]);

      await client.query('COMMIT');

      return this.getABTest(test.id, tenantId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get A/B test with variants
   */
  async getABTest(testId, tenantId) {
    const testResult = await db.query(`
      SELECT * FROM campaign_ab_tests
      WHERE id = $1 AND tenant_id = $2
    `, [testId, tenantId]);

    if (testResult.rows.length === 0) {
      throw new Error('A/B test not found');
    }

    const variantsResult = await db.query(`
      SELECT * FROM campaign_ab_variants
      WHERE ab_test_id = $1
      ORDER BY variant ASC
    `, [testId]);

    return {
      ...testResult.rows[0],
      variants: variantsResult.rows
    };
  }

  /**
   * Get A/B test for a campaign
   */
  async getABTestByCampaign(campaignId, tenantId) {
    const testResult = await db.query(`
      SELECT * FROM campaign_ab_tests
      WHERE campaign_id = $1 AND tenant_id = $2
    `, [campaignId, tenantId]);

    if (testResult.rows.length === 0) {
      return null;
    }

    return this.getABTest(testResult.rows[0].id, tenantId);
  }

  /**
   * Assign a contact to an A/B variant
   */
  async assignVariant(campaignId, contactId) {
    // Simple random assignment (50/50)
    const variant = Math.random() < 0.5 ? 'A' : 'B';

    await db.query(`
      UPDATE campaign_contacts
      SET ab_variant = $1
      WHERE campaign_id = $2 AND contact_id = $3
    `, [variant, campaignId, contactId]);

    return variant;
  }

  /**
   * Update variant statistics
   */
  async updateVariantStats(testId, variant, stats) {
    const fields = [];
    const values = [testId, variant];
    let idx = 3;

    for (const [key, value] of Object.entries(stats)) {
      if (['total_sent', 'delivered', 'opened', 'clicked', 'responded', 'converted', 'connected'].includes(key)) {
        fields.push(`${key} = ${key} + $${idx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    await db.query(`
      UPDATE campaign_ab_variants
      SET ${fields.join(', ')}
      WHERE ab_test_id = $1 AND variant = $2
    `, values);

    // Recalculate rates
    await db.query(`
      UPDATE campaign_ab_variants
      SET
        open_rate = CASE WHEN delivered > 0 THEN (opened::DECIMAL / delivered * 100) ELSE 0 END,
        click_rate = CASE WHEN delivered > 0 THEN (clicked::DECIMAL / delivered * 100) ELSE 0 END,
        response_rate = CASE WHEN delivered > 0 THEN (responded::DECIMAL / delivered * 100) ELSE 0 END,
        conversion_rate = CASE WHEN delivered > 0 THEN (converted::DECIMAL / delivered * 100) ELSE 0 END,
        connect_rate = CASE WHEN total_sent > 0 THEN (connected::DECIMAL / total_sent * 100) ELSE 0 END
      WHERE ab_test_id = $1 AND variant = $2
    `, [testId, variant]);
  }

  /**
   * Select winning variant
   */
  async selectWinner(testId, tenantId, winningVariant = null) {
    const test = await this.getABTest(testId, tenantId);

    // Auto-select winner if not specified
    if (!winningVariant) {
      const variantA = test.variants.find(v => v.variant === 'A');
      const variantB = test.variants.find(v => v.variant === 'B');

      const metricA = variantA[test.winning_metric] || 0;
      const metricB = variantB[test.winning_metric] || 0;

      winningVariant = metricA >= metricB ? 'A' : 'B';
    }

    const result = await db.query(`
      UPDATE campaign_ab_tests
      SET status = 'winner_selected', winning_variant = $1, winner_selected_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [winningVariant, testId, tenantId]);

    return {
      ...result.rows[0],
      variants: test.variants
    };
  }

  // =========================================
  // PREVIEW DIALER
  // =========================================

  /**
   * Queue contacts for preview dialing
   */
  async queueForPreview(campaignId, tenantId, contacts) {
    const results = [];

    for (const contact of contacts) {
      try {
        const result = await db.query(`
          INSERT INTO preview_dialer_queue (
            campaign_id, tenant_id, contact_id, phone_number,
            contact_name, contact_data, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'queued')
          ON CONFLICT (campaign_id, contact_id) DO NOTHING
          RETURNING *
        `, [
          campaignId,
          tenantId,
          contact.id,
          contact.phone_number,
          contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          JSON.stringify(contact)
        ]);

        if (result.rows.length > 0) {
          results.push({ success: true, contact_id: contact.id });
        }
      } catch (error) {
        results.push({ success: false, contact_id: contact.id, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get next preview for agent
   */
  async getNextPreview(campaignId, tenantId, agentId) {
    // First check if agent has an active preview
    const active = await db.query(`
      SELECT * FROM preview_dialer_queue
      WHERE campaign_id = $1 AND assigned_agent_id = $2 AND status = 'previewing'
      LIMIT 1
    `, [campaignId, agentId]);

    if (active.rows.length > 0) {
      return active.rows[0];
    }

    // Get and assign next queued contact
    const result = await db.query(`
      UPDATE preview_dialer_queue
      SET
        status = 'previewing',
        assigned_agent_id = $1,
        assigned_at = NOW(),
        previewed_at = NOW()
      WHERE id = (
        SELECT id FROM preview_dialer_queue
        WHERE campaign_id = $2 AND tenant_id = $3 AND status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `, [agentId, campaignId, tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Agent approves contact for dialing
   */
  async approvePreview(previewId, agentId, notes = null) {
    const result = await db.query(`
      UPDATE preview_dialer_queue
      SET
        status = 'approved',
        notes = $1,
        preview_duration_seconds = EXTRACT(EPOCH FROM (NOW() - previewed_at))::INTEGER,
        updated_at = NOW()
      WHERE id = $2 AND assigned_agent_id = $3 AND status = 'previewing'
      RETURNING *
    `, [notes, previewId, agentId]);

    if (result.rows.length === 0) {
      throw new Error('Preview not found or not assigned to agent');
    }

    return result.rows[0];
  }

  /**
   * Agent skips contact
   */
  async skipPreview(previewId, agentId, reason) {
    const result = await db.query(`
      UPDATE preview_dialer_queue
      SET
        status = 'skipped',
        skip_reason = $1,
        preview_duration_seconds = EXTRACT(EPOCH FROM (NOW() - previewed_at))::INTEGER,
        updated_at = NOW()
      WHERE id = $2 AND assigned_agent_id = $3 AND status = 'previewing'
      RETURNING *
    `, [reason, previewId, agentId]);

    return result.rows[0];
  }

  /**
   * Mark preview as dialing
   */
  async markPreviewDialing(previewId, callId) {
    const result = await db.query(`
      UPDATE preview_dialer_queue
      SET status = 'dialing', call_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [callId, previewId]);

    return result.rows[0];
  }

  /**
   * Complete preview with call result
   */
  async completePreview(previewId, callResult) {
    const result = await db.query(`
      UPDATE preview_dialer_queue
      SET status = 'completed', call_result = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [callResult, previewId]);

    return result.rows[0];
  }

  /**
   * Get preview queue status
   */
  async getPreviewQueueStatus(campaignId, tenantId) {
    const result = await db.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM preview_dialer_queue
      WHERE campaign_id = $1 AND tenant_id = $2
      GROUP BY status
    `, [campaignId, tenantId]);

    const statusMap = {};
    for (const row of result.rows) {
      statusMap[row.status] = parseInt(row.count);
    }

    return statusMap;
  }

  // =========================================
  // CAMPAIGN APPROVAL WORKFLOWS
  // =========================================

  /**
   * Submit campaign for approval
   */
  async submitForApproval(campaignId, tenantId, userId, notes = null) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Create approval request
      const approvalResult = await client.query(`
        INSERT INTO campaign_approvals (
          campaign_id, tenant_id, requested_by, request_notes
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [campaignId, tenantId, userId, notes]);

      // Update campaign status
      await client.query(`
        UPDATE campaigns
        SET requires_approval = true, approval_status = 'pending', updated_at = NOW()
        WHERE id = $1
      `, [campaignId]);

      // Get campaign snapshot
      const campaignResult = await client.query(`
        SELECT * FROM campaigns WHERE id = $1
      `, [campaignId]);

      // Log the submission
      await client.query(`
        INSERT INTO campaign_approval_history (
          approval_id, campaign_id, tenant_id, action, performed_by, campaign_snapshot
        )
        VALUES ($1, $2, $3, 'submitted', $4, $5)
      `, [
        approvalResult.rows[0].id,
        campaignId,
        tenantId,
        userId,
        JSON.stringify(campaignResult.rows[0])
      ]);

      await client.query('COMMIT');

      return approvalResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Review campaign approval
   */
  async reviewApproval(approvalId, tenantId, reviewerId, decision, notes = null, requiredChanges = null) {
    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      throw new Error('Invalid decision');
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Get current approval
      const currentResult = await client.query(`
        SELECT * FROM campaign_approvals WHERE id = $1 AND tenant_id = $2
      `, [approvalId, tenantId]);

      if (currentResult.rows.length === 0) {
        throw new Error('Approval not found');
      }

      const approval = currentResult.rows[0];

      // Update approval
      const approvalResult = await client.query(`
        UPDATE campaign_approvals
        SET
          status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          review_notes = $3,
          required_changes = $4
        WHERE id = $5
        RETURNING *
      `, [decision, reviewerId, notes, requiredChanges, approvalId]);

      // Update campaign status
      const campaignStatus = decision === 'approved' ? 'approved'
        : decision === 'rejected' ? 'rejected'
          : 'pending';

      await client.query(`
        UPDATE campaigns
        SET approval_status = $1, updated_at = NOW()
        WHERE id = $2
      `, [campaignStatus, approval.campaign_id]);

      // Log the review
      await client.query(`
        INSERT INTO campaign_approval_history (
          approval_id, campaign_id, tenant_id, action, performed_by, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [approvalId, approval.campaign_id, tenantId, decision, reviewerId, notes]);

      await client.query('COMMIT');

      return approvalResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pending approvals
   */
  async getPendingApprovals(tenantId, options = {}) {
    const { page = 1, limit = 50 } = options;

    const result = await db.query(`
      SELECT
        ca.*,
        c.name as campaign_name,
        c.type as campaign_type,
        u.name as requested_by_name
      FROM campaign_approvals ca
      JOIN campaigns c ON c.id = ca.campaign_id
      JOIN users u ON u.id = ca.requested_by
      WHERE ca.tenant_id = $1 AND ca.status = 'pending'
      ORDER BY ca.requested_at ASC
      LIMIT $2 OFFSET $3
    `, [tenantId, limit, (page - 1) * limit]);

    return {
      approvals: result.rows,
      pagination: { page, limit }
    };
  }

  /**
   * Get approval history for a campaign
   */
  async getApprovalHistory(campaignId, tenantId) {
    const result = await db.query(`
      SELECT
        cah.*,
        u.name as performed_by_name
      FROM campaign_approval_history cah
      LEFT JOIN users u ON u.id = cah.performed_by
      WHERE cah.campaign_id = $1 AND cah.tenant_id = $2
      ORDER BY cah.created_at DESC
    `, [campaignId, tenantId]);

    return result.rows;
  }

  // =========================================
  // FREQUENCY CAPS
  // =========================================

  /**
   * Get frequency cap settings
   */
  async getFrequencyCapSettings(tenantId) {
    const result = await db.query(`
      SELECT * FROM frequency_cap_settings
      WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      // Return defaults
      return {
        max_calls_per_day: 3,
        max_calls_per_week: 7,
        max_calls_per_month: 15,
        max_sms_per_day: 2,
        max_sms_per_week: 5,
        max_sms_per_month: 10,
        max_emails_per_day: 3,
        max_emails_per_week: 10,
        max_emails_per_month: 30,
        max_total_per_day: 5,
        max_total_per_week: 15,
        min_hours_between_calls: 4,
        min_hours_between_sms: 2,
        min_hours_between_emails: 24,
        enforce_caps: true
      };
    }

    return result.rows[0];
  }

  /**
   * Update frequency cap settings
   */
  async updateFrequencyCapSettings(tenantId, settings) {
    const result = await db.query(`
      INSERT INTO frequency_cap_settings (tenant_id, ${Object.keys(settings).join(', ')})
      VALUES ($1, ${Object.keys(settings).map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (tenant_id)
      DO UPDATE SET ${Object.keys(settings).map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW()
      RETURNING *
    `, [tenantId, ...Object.values(settings)]);

    return result.rows[0];
  }

  /**
   * Check if contact can be contacted
   */
  async checkFrequencyCap(tenantId, contactId, channel) {
    const settings = await this.getFrequencyCapSettings(tenantId);

    if (!settings.enforce_caps) {
      return { allowed: true };
    }

    // Get or create contact cap record
    let capResult = await db.query(`
      SELECT * FROM contact_frequency_caps
      WHERE tenant_id = $1 AND contact_id = $2
    `, [tenantId, contactId]);

    if (capResult.rows.length === 0) {
      // Create new record
      await db.query(`
        INSERT INTO contact_frequency_caps (tenant_id, contact_id)
        VALUES ($1, $2)
      `, [tenantId, contactId]);

      return { allowed: true };
    }

    const caps = capResult.rows[0];

    // Reset counters if needed
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (caps.daily_reset_at !== today) {
      await db.query(`
        UPDATE contact_frequency_caps
        SET calls_today = 0, sms_today = 0, emails_today = 0, total_contacts_today = 0,
            daily_reset_at = $1
        WHERE tenant_id = $2 AND contact_id = $3
      `, [today, tenantId, contactId]);
      caps.calls_today = 0;
      caps.sms_today = 0;
      caps.emails_today = 0;
      caps.total_contacts_today = 0;
    }

    // Check channel-specific caps
    let channelField, maxDay, maxWeek, maxMonth, lastAt, minHours;

    switch (channel) {
      case 'call':
        channelField = 'calls';
        maxDay = settings.max_calls_per_day;
        maxWeek = settings.max_calls_per_week;
        maxMonth = settings.max_calls_per_month;
        lastAt = caps.last_call_at;
        minHours = settings.min_hours_between_calls;
        break;
      case 'sms':
        channelField = 'sms';
        maxDay = settings.max_sms_per_day;
        maxWeek = settings.max_sms_per_week;
        maxMonth = settings.max_sms_per_month;
        lastAt = caps.last_sms_at;
        minHours = settings.min_hours_between_sms;
        break;
      case 'email':
        channelField = 'emails';
        maxDay = settings.max_emails_per_day;
        maxWeek = settings.max_emails_per_week;
        maxMonth = settings.max_emails_per_month;
        lastAt = caps.last_email_at;
        minHours = settings.min_hours_between_emails;
        break;
      default:
        return { allowed: true };
    }

    // Check daily cap
    if (caps[`${channelField}_today`] >= maxDay) {
      return { allowed: false, reason: 'daily_cap_reached', limit: maxDay };
    }

    // Check weekly cap
    if (caps[`${channelField}_this_week`] >= maxWeek) {
      return { allowed: false, reason: 'weekly_cap_reached', limit: maxWeek };
    }

    // Check monthly cap
    if (caps[`${channelField}_this_month`] >= maxMonth) {
      return { allowed: false, reason: 'monthly_cap_reached', limit: maxMonth };
    }

    // Check total daily cap
    if (caps.total_contacts_today >= settings.max_total_per_day) {
      return { allowed: false, reason: 'total_daily_cap_reached', limit: settings.max_total_per_day };
    }

    // Check minimum time between contacts
    if (lastAt) {
      const hoursSinceLast = (now - new Date(lastAt)) / (1000 * 60 * 60);
      if (hoursSinceLast < minHours) {
        return {
          allowed: false,
          reason: 'cooldown_active',
          next_allowed_at: new Date(new Date(lastAt).getTime() + (minHours * 60 * 60 * 1000))
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a contact (increment frequency counters)
   */
  async recordContact(tenantId, contactId, channel) {
    const channelField = channel === 'call' ? 'calls'
      : channel === 'sms' ? 'sms'
        : channel === 'email' ? 'emails'
          : null;

    if (!channelField) return;

    await db.query(`
      INSERT INTO contact_frequency_caps (tenant_id, contact_id, ${channelField}_today, ${channelField}_this_week, ${channelField}_this_month, last_${channel}_at, total_contacts_today)
      VALUES ($1, $2, 1, 1, 1, NOW(), 1)
      ON CONFLICT (tenant_id, contact_id)
      DO UPDATE SET
        ${channelField}_today = contact_frequency_caps.${channelField}_today + 1,
        ${channelField}_this_week = contact_frequency_caps.${channelField}_this_week + 1,
        ${channelField}_this_month = contact_frequency_caps.${channelField}_this_month + 1,
        last_${channel}_at = NOW(),
        total_contacts_today = contact_frequency_caps.total_contacts_today + 1,
        updated_at = NOW()
    `, [tenantId, contactId]);
  }
}

export default new CampaignEnhancementsService();
