/**
 * Campaign Management Routes
 *
 * Handles SMS campaign creation, sending, and analytics.
 */

import express from 'express';
import axios from 'axios';
import { contacts } from './contacts.js';

const router = express.Router();

// In-memory storage (use database in production)
const campaigns = new Map();
const campaignMessages = new Map(); // Track sent messages per campaign
let campaignIdCounter = 1;

// IRISX API client
const irisxClient = axios.create({
  baseURL: process.env.IRISX_API_URL || 'https://api.irisx.io',
  headers: {
    'Authorization': `Bearer ${process.env.IRISX_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * List all campaigns
 * GET /campaigns
 */
router.get('/', (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let campaignsList = Array.from(campaigns.values());

    // Filter by status
    if (status) {
      campaignsList = campaignsList.filter(c => c.status === status);
    }

    // Sort by creation date
    campaignsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Paginate
    const total = campaignsList.length;
    campaignsList = campaignsList.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      campaigns: campaignsList,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

/**
 * Create new campaign
 * POST /campaigns
 */
router.post('/', (req, res) => {
  try {
    const {
      name,
      message_template,
      from_number,
      tags = [],
      scheduled_at,
      rate_limit_per_minute = 60
    } = req.body;

    // Validation
    if (!name || !message_template || !from_number) {
      return res.status(400).json({
        error: 'name, message_template, and from_number are required'
      });
    }

    // Validate template variables
    const variables = extractVariables(message_template);

    // Create campaign
    const campaign = {
      id: campaignIdCounter++,
      name,
      message_template,
      from_number,
      tags,
      variables,
      scheduled_at: scheduled_at || null,
      rate_limit_per_minute,
      status: 'draft',
      stats: {
        total_recipients: 0,
        sent: 0,
        delivered: 0,
        failed: 0
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sent_at: null,
      completed_at: null
    };

    campaigns.set(campaign.id, campaign);
    console.log(`✅ Campaign created: ${campaign.id} - ${name}`);

    res.status(201).json({ campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * Get campaign by ID
 * GET /campaigns/:id
 */
router.get('/:id', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Error getting campaign:', error);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

/**
 * Update campaign
 * PUT /campaigns/:id
 */
router.put('/:id', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Can only update draft campaigns
    if (campaign.status !== 'draft') {
      return res.status(400).json({
        error: 'Cannot update campaign in status: ' + campaign.status
      });
    }

    const { name, message_template, from_number, tags, scheduled_at, rate_limit_per_minute } = req.body;

    // Update fields
    if (name) campaign.name = name;
    if (message_template) {
      campaign.message_template = message_template;
      campaign.variables = extractVariables(message_template);
    }
    if (from_number) campaign.from_number = from_number;
    if (tags) campaign.tags = tags;
    if (scheduled_at !== undefined) campaign.scheduled_at = scheduled_at;
    if (rate_limit_per_minute) campaign.rate_limit_per_minute = rate_limit_per_minute;

    campaign.updated_at = new Date().toISOString();

    campaigns.set(campaignId, campaign);
    console.log(`✅ Campaign updated: ${campaignId}`);

    res.json({ campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/**
 * Delete campaign
 * DELETE /campaigns/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Can only delete draft campaigns
    if (campaign.status !== 'draft') {
      return res.status(400).json({
        error: 'Cannot delete campaign in status: ' + campaign.status
      });
    }

    campaigns.delete(campaignId);
    console.log(`🗑️  Campaign deleted: ${campaignId}`);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

/**
 * Send campaign
 * POST /campaigns/:id/send
 */
router.post('/:id/send', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Can only send draft campaigns
    if (campaign.status !== 'draft') {
      return res.status(400).json({
        error: 'Campaign already sent or in progress'
      });
    }

    // Get recipients
    const recipients = getRecipients(campaign.tags);

    if (recipients.length === 0) {
      return res.status(400).json({
        error: 'No recipients found matching campaign criteria'
      });
    }

    // Update campaign status
    campaign.status = 'sending';
    campaign.sent_at = new Date().toISOString();
    campaign.stats.total_recipients = recipients.length;
    campaigns.set(campaignId, campaign);

    // Send messages asynchronously
    console.log(`📤 Sending campaign ${campaignId} to ${recipients.length} recipients...`);

    // Start sending in background
    sendCampaignMessages(campaign, recipients).catch(error => {
      console.error(`❌ Campaign ${campaignId} failed:`, error);
      campaign.status = 'failed';
      campaigns.set(campaignId, campaign);
    });

    res.json({
      message: 'Campaign sending started',
      campaign: {
        ...campaign,
        recipients_count: recipients.length
      }
    });
  } catch (error) {
    console.error('Error sending campaign:', error);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

/**
 * Get campaign statistics
 * GET /campaigns/:id/stats
 */
router.get('/:id/stats', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get detailed message stats
    const messages = campaignMessages.get(campaignId) || [];

    const stats = {
      ...campaign.stats,
      delivery_rate: campaign.stats.sent > 0
        ? ((campaign.stats.delivered / campaign.stats.sent) * 100).toFixed(2) + '%'
        : '0%',
      failure_rate: campaign.stats.sent > 0
        ? ((campaign.stats.failed / campaign.stats.sent) * 100).toFixed(2) + '%'
        : '0%',
      messages: messages.length,
      campaign_duration: campaign.completed_at
        ? Math.round((new Date(campaign.completed_at) - new Date(campaign.sent_at)) / 1000) + 's'
        : null
    };

    res.json({ stats });
  } catch (error) {
    console.error('Error getting campaign stats:', error);
    res.status(500).json({ error: 'Failed to get campaign statistics' });
  }
});

/**
 * Get campaign messages
 * GET /campaigns/:id/messages
 */
router.get('/:id/messages', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = campaigns.get(campaignId);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const messages = campaignMessages.get(campaignId) || [];

    res.json({
      messages,
      total: messages.length
    });
  } catch (error) {
    console.error('Error getting campaign messages:', error);
    res.status(500).json({ error: 'Failed to get campaign messages' });
  }
});

/**
 * Helper: Extract template variables from message
 */
function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];

  return matches.map(m => m.replace(/\{\{|\}\}/g, ''));
}

/**
 * Helper: Get recipients matching campaign criteria
 */
function getRecipients(tags) {
  let recipients = Array.from(contacts.values());

  // Filter by opted-in status
  recipients = recipients.filter(c => c.opted_in);

  // Filter by tags if specified
  if (tags && tags.length > 0) {
    recipients = recipients.filter(c =>
      c.tags && tags.some(tag => c.tags.includes(tag))
    );
  }

  return recipients;
}

/**
 * Helper: Render message with contact data
 */
function renderMessage(template, contact) {
  let message = template;

  // Replace common variables
  const replacements = {
    first_name: contact.first_name || 'there',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone_number: contact.phone_number,
    ...contact.custom_fields
  };

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    message = message.replace(regex, value);
  }

  return message;
}

/**
 * Helper: Send campaign messages with rate limiting
 */
async function sendCampaignMessages(campaign, recipients) {
  const campaignId = campaign.id;
  const messages = [];
  const delayMs = (60 * 1000) / campaign.rate_limit_per_minute; // Delay between messages

  console.log(`📤 Starting campaign ${campaignId}: ${recipients.length} messages at ${campaign.rate_limit_per_minute}/min`);

  for (let i = 0; i < recipients.length; i++) {
    const contact = recipients[i];

    try {
      // Render message with contact data
      const message = renderMessage(campaign.message_template, contact);

      // Send SMS via IRISX API
      const response = await irisxClient.post('/v1/sms/send', {
        from: campaign.from_number,
        to: contact.phone_number,
        message,
        metadata: {
          campaign_id: campaignId,
          contact_id: contact.id
        }
      });

      // Track message
      const messageRecord = {
        contact_id: contact.id,
        phone_number: contact.phone_number,
        message,
        status: 'sent',
        sent_at: new Date().toISOString(),
        irisx_message_id: response.data.sms?.id
      };

      messages.push(messageRecord);
      campaign.stats.sent++;

      console.log(`  ✅ [${i + 1}/${recipients.length}] Sent to ${contact.phone_number}`);

      // Rate limiting delay
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`  ❌ [${i + 1}/${recipients.length}] Failed to send to ${contact.phone_number}:`, error.message);

      messages.push({
        contact_id: contact.id,
        phone_number: contact.phone_number,
        message: renderMessage(campaign.message_template, contact),
        status: 'failed',
        error: error.message,
        failed_at: new Date().toISOString()
      });

      campaign.stats.failed++;
    }

    // Update campaign progress
    campaigns.set(campaignId, campaign);
  }

  // Store messages
  campaignMessages.set(campaignId, messages);

  // Mark campaign as completed
  campaign.status = 'completed';
  campaign.completed_at = new Date().toISOString();
  campaigns.set(campaignId, campaign);

  console.log(`✅ Campaign ${campaignId} completed: ${campaign.stats.sent} sent, ${campaign.stats.failed} failed`);
}

export default router;
