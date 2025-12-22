/**
 * NATS Messaging API Routes
 *
 * Endpoints for NATS messaging administration and monitoring
 */

import { Router } from 'express';
import natsService, { SUBJECTS, STREAMS } from '../services/nats-messaging.js';

const router = Router();

/**
 * GET /nats/health
 * Get NATS connection health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await natsService.healthCheck();
    res.json(health);
  } catch (error) {
    console.error('Error checking NATS health:', error);
    res.status(500).json({ error: 'Failed to check NATS health' });
  }
});

/**
 * GET /nats/subjects
 * Get list of available subjects
 */
router.get('/subjects', (req, res) => {
  res.json({
    subjects: SUBJECTS,
    streams: Object.keys(STREAMS)
  });
});

/**
 * POST /nats/connect
 * Manually connect to NATS
 */
router.post('/connect', async (req, res) => {
  try {
    await natsService.connect();
    const health = await natsService.healthCheck();
    res.json({ success: true, ...health });
  } catch (error) {
    console.error('Error connecting to NATS:', error);
    res.status(500).json({ error: error.message || 'Failed to connect to NATS' });
  }
});

/**
 * POST /nats/publish
 * Publish a message to a subject
 */
router.post('/publish', async (req, res) => {
  try {
    const { subject, data, persistent = false } = req.body;

    if (!subject || !data) {
      return res.status(400).json({ error: 'subject and data are required' });
    }

    let result;
    if (persistent) {
      result = await natsService.publishJS(subject, data);
    } else {
      result = await natsService.publish(subject, data);
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing message:', error);
    res.status(500).json({ error: error.message || 'Failed to publish message' });
  }
});

/**
 * POST /nats/request
 * Send a request-reply message
 */
router.post('/request', async (req, res) => {
  try {
    const { subject, data, timeout = 5000 } = req.body;

    if (!subject || !data) {
      return res.status(400).json({ error: 'subject and data are required' });
    }

    const response = await natsService.request(subject, data, timeout);
    res.json({ response });
  } catch (error) {
    console.error('Error sending request:', error);
    res.status(500).json({ error: error.message || 'Failed to send request' });
  }
});

// ============================================
// Campaign Messaging Endpoints
// ============================================

/**
 * POST /nats/campaigns/:id/start
 * Publish campaign start event
 */
router.post('/campaigns/:id/start', async (req, res) => {
  try {
    const { tenant_id, options = {} } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await natsService.publishCampaignStart(
      req.params.id,
      tenant_id,
      options
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing campaign start:', error);
    res.status(500).json({ error: 'Failed to publish campaign start' });
  }
});

/**
 * POST /nats/campaigns/:id/pause
 * Publish campaign pause event
 */
router.post('/campaigns/:id/pause', async (req, res) => {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await natsService.publishCampaignPause(req.params.id, tenant_id);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing campaign pause:', error);
    res.status(500).json({ error: 'Failed to publish campaign pause' });
  }
});

/**
 * POST /nats/campaigns/:id/stop
 * Publish campaign stop event
 */
router.post('/campaigns/:id/stop', async (req, res) => {
  try {
    const { tenant_id, reason } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await natsService.publishCampaignStop(req.params.id, tenant_id, reason);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing campaign stop:', error);
    res.status(500).json({ error: 'Failed to publish campaign stop' });
  }
});

/**
 * POST /nats/campaigns/:id/queue-contact
 * Queue a contact for dialing
 */
router.post('/campaigns/:id/queue-contact', async (req, res) => {
  try {
    const { tenant_id, contact } = req.body;

    if (!tenant_id || !contact) {
      return res.status(400).json({ error: 'tenant_id and contact are required' });
    }

    const result = await natsService.queueContactForDialing(
      req.params.id,
      tenant_id,
      contact
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error queuing contact:', error);
    res.status(500).json({ error: 'Failed to queue contact' });
  }
});

/**
 * POST /nats/campaigns/:id/queue-batch
 * Queue multiple contacts for dialing
 */
router.post('/campaigns/:id/queue-batch', async (req, res) => {
  try {
    const { tenant_id, contacts } = req.body;

    if (!tenant_id || !contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'tenant_id and contacts array are required' });
    }

    const results = [];
    for (const contact of contacts) {
      const result = await natsService.queueContactForDialing(
        req.params.id,
        tenant_id,
        contact
      );
      results.push(result);
    }

    res.json({ success: true, queued: results.length });
  } catch (error) {
    console.error('Error queuing contacts:', error);
    res.status(500).json({ error: 'Failed to queue contacts' });
  }
});

// ============================================
// Call Messaging Endpoints
// ============================================

/**
 * POST /nats/calls/initiated
 * Publish call initiated event
 */
router.post('/calls/initiated', async (req, res) => {
  try {
    const result = await natsService.publishCallInitiated(req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing call initiated:', error);
    res.status(500).json({ error: 'Failed to publish call initiated' });
  }
});

/**
 * POST /nats/calls/:id/answered
 * Publish call answered event
 */
router.post('/calls/:id/answered', async (req, res) => {
  try {
    const result = await natsService.publishCallAnswered(req.params.id, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing call answered:', error);
    res.status(500).json({ error: 'Failed to publish call answered' });
  }
});

/**
 * POST /nats/calls/:id/ended
 * Publish call ended event
 */
router.post('/calls/:id/ended', async (req, res) => {
  try {
    const result = await natsService.publishCallEnded(req.params.id, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing call ended:', error);
    res.status(500).json({ error: 'Failed to publish call ended' });
  }
});

/**
 * POST /nats/calls/:id/quality
 * Publish call quality metrics
 */
router.post('/calls/:id/quality', async (req, res) => {
  try {
    const result = await natsService.publishCallQuality(req.params.id, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing call quality:', error);
    res.status(500).json({ error: 'Failed to publish call quality' });
  }
});

// ============================================
// SMS/Email Queue Endpoints
// ============================================

/**
 * POST /nats/sms/queue
 * Queue SMS for sending
 */
router.post('/sms/queue', async (req, res) => {
  try {
    const result = await natsService.queueSMS(req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error queuing SMS:', error);
    res.status(500).json({ error: 'Failed to queue SMS' });
  }
});

/**
 * POST /nats/email/queue
 * Queue email for sending
 */
router.post('/email/queue', async (req, res) => {
  try {
    const result = await natsService.queueEmail(req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error queuing email:', error);
    res.status(500).json({ error: 'Failed to queue email' });
  }
});

// ============================================
// Analytics Endpoints
// ============================================

/**
 * POST /nats/analytics/event
 * Publish analytics event
 */
router.post('/analytics/event', async (req, res) => {
  try {
    const { event_type, ...eventData } = req.body;

    if (!event_type) {
      return res.status(400).json({ error: 'event_type is required' });
    }

    const result = await natsService.publishAnalyticsEvent(event_type, eventData);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error publishing analytics event:', error);
    res.status(500).json({ error: 'Failed to publish analytics event' });
  }
});

export default router;
