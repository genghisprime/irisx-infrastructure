/**
 * Campaign Scheduler Service
 *
 * Background worker for scheduled campaign execution,
 * recurring campaigns, and automated triggers
 */

import { query } from '../db/connection.js';
import { EventEmitter } from 'events';

// Campaign schedule types
const SCHEDULE_TYPES = {
  ONCE: 'once',
  RECURRING: 'recurring',
  TRIGGERED: 'triggered'
};

// Campaign states
const CAMPAIGN_STATES = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Campaign Scheduler Service
 */
class CampaignSchedulerService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.checkInterval = null;
    this.runningCampaigns = new Map();
  }

  /**
   * Start the scheduler
   */
  start(intervalMs = 60000) {
    if (this.isRunning) {
      console.log('[CampaignScheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[CampaignScheduler] Starting scheduler...');

    // Run immediately, then on interval
    this.checkScheduledCampaigns();
    this.checkInterval = setInterval(() => {
      this.checkScheduledCampaigns();
    }, intervalMs);

    // Also check recurring campaigns
    this.checkRecurringCampaigns();
    setInterval(() => {
      this.checkRecurringCampaigns();
    }, intervalMs * 5); // Check recurring less frequently
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('[CampaignScheduler] Stopped');
  }

  // ============================================
  // Scheduled Campaigns
  // ============================================

  /**
   * Check for campaigns ready to start
   */
  async checkScheduledCampaigns() {
    try {
      // Find campaigns scheduled to start now
      const result = await query(`
        SELECT c.*, cs.scheduled_at, cs.timezone
        FROM campaigns c
        JOIN campaign_schedules cs ON c.id = cs.campaign_id
        WHERE c.status = 'scheduled'
          AND cs.scheduled_at <= NOW()
          AND cs.schedule_type = 'once'
          AND cs.executed_at IS NULL
        ORDER BY cs.scheduled_at ASC
        LIMIT 10
      `);

      for (const campaign of result.rows) {
        await this.executeCampaign(campaign);
      }
    } catch (error) {
      console.error('[CampaignScheduler] Error checking scheduled campaigns:', error);
    }
  }

  /**
   * Schedule a campaign
   */
  async scheduleCampaign(campaignId, scheduleData) {
    const {
      scheduledAt,
      timezone = 'UTC',
      scheduleType = SCHEDULE_TYPES.ONCE,
      recurrenceRule,
      endDate
    } = scheduleData;

    // Validate schedule time is in future
    if (new Date(scheduledAt) <= new Date()) {
      throw new Error('Schedule time must be in the future');
    }

    // Create or update schedule
    await query(`
      INSERT INTO campaign_schedules (
        campaign_id, scheduled_at, timezone, schedule_type,
        recurrence_rule, end_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (campaign_id) DO UPDATE SET
        scheduled_at = $2,
        timezone = $3,
        schedule_type = $4,
        recurrence_rule = $5,
        end_date = $6,
        updated_at = NOW()
    `, [campaignId, scheduledAt, timezone, scheduleType, recurrenceRule, endDate]);

    // Update campaign status
    await query(
      'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2',
      ['scheduled', campaignId]
    );

    return { scheduled: true, scheduledAt };
  }

  /**
   * Cancel scheduled campaign
   */
  async cancelSchedule(campaignId) {
    await query(
      'DELETE FROM campaign_schedules WHERE campaign_id = $1 AND executed_at IS NULL',
      [campaignId]
    );

    await query(
      'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3',
      ['draft', campaignId, 'scheduled']
    );

    return { cancelled: true };
  }

  /**
   * Get scheduled campaigns
   */
  async getScheduledCampaigns(tenantId) {
    const result = await query(`
      SELECT c.*, cs.scheduled_at, cs.timezone, cs.schedule_type, cs.recurrence_rule
      FROM campaigns c
      JOIN campaign_schedules cs ON c.id = cs.campaign_id
      WHERE c.tenant_id = $1
        AND c.status = 'scheduled'
        AND cs.executed_at IS NULL
      ORDER BY cs.scheduled_at ASC
    `, [tenantId]);

    return result.rows;
  }

  // ============================================
  // Recurring Campaigns
  // ============================================

  /**
   * Check recurring campaigns
   */
  async checkRecurringCampaigns() {
    try {
      const result = await query(`
        SELECT c.*, cs.recurrence_rule, cs.last_run_at, cs.next_run_at, cs.end_date
        FROM campaigns c
        JOIN campaign_schedules cs ON c.id = cs.campaign_id
        WHERE c.status IN ('scheduled', 'running')
          AND cs.schedule_type = 'recurring'
          AND cs.next_run_at <= NOW()
          AND (cs.end_date IS NULL OR cs.end_date > NOW())
        ORDER BY cs.next_run_at ASC
        LIMIT 10
      `);

      for (const campaign of result.rows) {
        await this.executeRecurringCampaign(campaign);
      }
    } catch (error) {
      console.error('[CampaignScheduler] Error checking recurring campaigns:', error);
    }
  }

  /**
   * Execute recurring campaign instance
   */
  async executeRecurringCampaign(campaign) {
    try {
      console.log(`[CampaignScheduler] Executing recurring campaign ${campaign.id}`);

      // Execute the campaign
      await this.executeCampaign(campaign);

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(campaign.recurrence_rule);

      // Update schedule
      await query(`
        UPDATE campaign_schedules
        SET last_run_at = NOW(), next_run_at = $1, run_count = COALESCE(run_count, 0) + 1
        WHERE campaign_id = $2
      `, [nextRunAt, campaign.id]);

    } catch (error) {
      console.error(`[CampaignScheduler] Error executing recurring campaign ${campaign.id}:`, error);
    }
  }

  /**
   * Calculate next run time from RRULE
   */
  calculateNextRun(rrule) {
    // Parse RRULE (simplified implementation)
    // Full implementation would use a library like rrule.js
    const parts = rrule.split(';').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});

    const now = new Date();
    let nextRun = new Date(now);

    switch (parts.FREQ) {
      case 'DAILY':
        nextRun.setDate(nextRun.getDate() + (parseInt(parts.INTERVAL) || 1));
        break;
      case 'WEEKLY':
        nextRun.setDate(nextRun.getDate() + 7 * (parseInt(parts.INTERVAL) || 1));
        break;
      case 'MONTHLY':
        nextRun.setMonth(nextRun.getMonth() + (parseInt(parts.INTERVAL) || 1));
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 1);
    }

    // Apply BYHOUR if specified
    if (parts.BYHOUR) {
      nextRun.setHours(parseInt(parts.BYHOUR), 0, 0, 0);
    }

    return nextRun;
  }

  // ============================================
  // Campaign Execution
  // ============================================

  /**
   * Execute a campaign
   */
  async executeCampaign(campaign) {
    const campaignId = campaign.id;

    try {
      console.log(`[CampaignScheduler] Starting campaign ${campaignId}`);

      // Mark as running
      await query(
        'UPDATE campaigns SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['running', campaignId]
      );

      // Mark schedule as executed
      await query(
        'UPDATE campaign_schedules SET executed_at = NOW() WHERE campaign_id = $1',
        [campaignId]
      );

      // Track in memory
      this.runningCampaigns.set(campaignId, {
        startedAt: new Date(),
        campaign
      });

      // Emit event for actual execution
      this.emit('campaign:start', {
        campaignId,
        tenantId: campaign.tenant_id,
        type: campaign.type,
        name: campaign.name
      });

      // Get contacts and start dialing/messaging
      await this.processContacts(campaign);

    } catch (error) {
      console.error(`[CampaignScheduler] Error executing campaign ${campaignId}:`, error);

      await query(
        'UPDATE campaigns SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error.message, campaignId]
      );

      this.emit('campaign:error', { campaignId, error: error.message });
    }
  }

  /**
   * Process campaign contacts
   */
  async processContacts(campaign) {
    // Get contact list
    const contacts = await query(`
      SELECT c.* FROM contacts c
      JOIN campaign_contacts cc ON c.id = cc.contact_id
      WHERE cc.campaign_id = $1
        AND cc.status = 'pending'
        AND c.do_not_contact = false
      ORDER BY cc.priority DESC, cc.created_at ASC
      LIMIT 1000
    `, [campaign.id]);

    console.log(`[CampaignScheduler] Processing ${contacts.rows.length} contacts for campaign ${campaign.id}`);

    // Emit contact processing events
    for (const contact of contacts.rows) {
      this.emit('campaign:contact', {
        campaignId: campaign.id,
        contactId: contact.id,
        phone: contact.phone,
        email: contact.email,
        type: campaign.type
      });
    }
  }

  /**
   * Complete campaign
   */
  async completeCampaign(campaignId) {
    await query(
      'UPDATE campaigns SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2',
      ['completed', campaignId]
    );

    this.runningCampaigns.delete(campaignId);

    this.emit('campaign:complete', { campaignId });

    console.log(`[CampaignScheduler] Campaign ${campaignId} completed`);
  }

  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId) {
    await query(
      'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3',
      ['paused', campaignId, 'running']
    );

    const runningCampaign = this.runningCampaigns.get(campaignId);
    if (runningCampaign) {
      runningCampaign.pausedAt = new Date();
    }

    this.emit('campaign:pause', { campaignId });
  }

  /**
   * Resume campaign
   */
  async resumeCampaign(campaignId) {
    await query(
      'UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3',
      ['running', campaignId, 'paused']
    );

    const runningCampaign = this.runningCampaigns.get(campaignId);
    if (runningCampaign) {
      delete runningCampaign.pausedAt;
    }

    this.emit('campaign:resume', { campaignId });
  }

  // ============================================
  // Status & Monitoring
  // ============================================

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      runningCampaigns: Array.from(this.runningCampaigns.entries()).map(([id, data]) => ({
        campaignId: id,
        startedAt: data.startedAt,
        pausedAt: data.pausedAt,
        name: data.campaign.name
      }))
    };
  }

  /**
   * Get upcoming schedules
   */
  async getUpcomingSchedules(hours = 24) {
    const result = await query(`
      SELECT c.id, c.name, c.type, c.tenant_id,
        cs.scheduled_at, cs.timezone, cs.schedule_type
      FROM campaigns c
      JOIN campaign_schedules cs ON c.id = cs.campaign_id
      WHERE c.status = 'scheduled'
        AND cs.scheduled_at <= NOW() + INTERVAL '1 hour' * $1
        AND cs.executed_at IS NULL
      ORDER BY cs.scheduled_at ASC
    `, [hours]);

    return result.rows;
  }
}

// Singleton instance
const campaignSchedulerService = new CampaignSchedulerService();

export default campaignSchedulerService;
export { SCHEDULE_TYPES, CAMPAIGN_STATES };
