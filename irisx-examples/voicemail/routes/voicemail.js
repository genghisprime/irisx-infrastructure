/**
 * Voicemail Routes and Logic
 *
 * Handles voicemail recording, retrieval, transcription, and management.
 */

import express from 'express';
import axios from 'axios';

const router = express.Router();

// In-memory storage for demo (use database in production)
const voicemails = new Map();
let messageIdCounter = 1;

// IRISX API client
const irisxClient = axios.create({
  baseURL: process.env.IRISX_API_URL || 'https://api.irisx.io',
  headers: {
    'Authorization': `Bearer ${process.env.IRISX_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Webhook endpoint - handles incoming calls for voicemail
 * POST /voicemail/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    const {
      call_uuid,
      event,
      from_number,
      to_number,
      recording_url,
      recording_duration,
      transcription
    } = req.body;

    console.log(`📞 Voicemail webhook: ${event} | Call: ${call_uuid}`);

    switch (event) {
      case 'call.answered':
        // Call answered, play greeting and start recording
        return res.json(handleCallAnswered(to_number));

      case 'recording.complete':
        // Recording finished, save voicemail
        return res.json(await handleRecordingComplete({
          call_uuid,
          from_number,
          to_number,
          recording_url,
          recording_duration,
          transcription
        }));

      case 'call.completed':
        // Call ended
        console.log(`✅ Call ${call_uuid} completed`);
        return res.json({ status: 'ok' });

      default:
        console.log(`ℹ️  Unhandled event: ${event}`);
        return res.json({ status: 'ok' });
    }
  } catch (error) {
    console.error('❌ Voicemail webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Handle call answered - play greeting and record
 */
function handleCallAnswered(toNumber) {
  const greeting = getGreeting(toNumber);

  return {
    actions: [
      {
        action: 'say',
        text: greeting,
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'record',
        maxLength: 180, // 3 minutes max
        finishOnKey: '#',
        transcribe: true,
        transcribeCallback: `${process.env.BASE_URL}/voicemail/webhook`,
        playBeep: true
      },
      {
        action: 'say',
        text: 'Thank you for your message. Goodbye.',
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'hangup'
      }
    ]
  };
}

/**
 * Handle recording complete - save voicemail
 */
async function handleRecordingComplete(data) {
  const {
    call_uuid,
    from_number,
    to_number,
    recording_url,
    recording_duration,
    transcription
  } = data;

  // Create voicemail message
  const message = {
    id: messageIdCounter++,
    call_uuid,
    from_number,
    to_number,
    recording_url,
    duration_seconds: recording_duration,
    transcription: transcription || null,
    status: 'new',
    created_at: new Date().toISOString(),
    read_at: null
  };

  // Store voicemail (use database in production)
  voicemails.set(message.id, message);

  console.log(`💾 Voicemail saved: ID ${message.id} from ${from_number}`);

  // Send notification (optional)
  await sendNotification(message);

  return {
    status: 'ok',
    message: 'Voicemail saved successfully',
    voicemail_id: message.id
  };
}

/**
 * Get customized greeting message
 */
function getGreeting(phoneNumber) {
  // Customize greetings per phone number
  const greetings = {
    default: "You have reached our voicemail. Please leave a detailed message after the beep, and we will get back to you as soon as possible. Press pound when you are finished."
  };

  return greetings[phoneNumber] || greetings.default;
}

/**
 * Send notification for new voicemail
 */
async function sendNotification(message) {
  try {
    // Example: Send email notification
    const emailAddress = process.env.NOTIFICATION_EMAIL;

    if (!emailAddress) {
      console.log('⚠️  No notification email configured');
      return;
    }

    console.log(`📧 Sending notification to ${emailAddress}`);

    // In production, integrate with your email service
    // await sendEmail({
    //   to: emailAddress,
    //   subject: `New Voicemail from ${message.from_number}`,
    //   body: `You have a new voicemail...\n\nTranscription: ${message.transcription}`
    // });

    console.log('✅ Notification sent');
  } catch (error) {
    console.error('❌ Failed to send notification:', error.message);
  }
}

/**
 * List all voicemails
 * GET /voicemail/messages
 */
router.get('/messages', (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let messages = Array.from(voicemails.values());

    // Filter by status
    if (status) {
      messages = messages.filter(m => m.status === status);
    }

    // Sort by date (newest first)
    messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Paginate
    const total = messages.length;
    messages = messages.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      messages,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error listing voicemails:', error);
    res.status(500).json({ error: 'Failed to list voicemails' });
  }
});

/**
 * Get specific voicemail
 * GET /voicemail/messages/:id
 */
router.get('/messages/:id', (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = voicemails.get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    res.json({ message });
  } catch (error) {
    console.error('❌ Error getting voicemail:', error);
    res.status(500).json({ error: 'Failed to get voicemail' });
  }
});

/**
 * Mark voicemail as read
 * PATCH /voicemail/messages/:id/read
 */
router.patch('/messages/:id/read', (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = voicemails.get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    message.status = 'read';
    message.read_at = new Date().toISOString();
    voicemails.set(messageId, message);

    console.log(`👁️  Voicemail ${messageId} marked as read`);

    res.json({
      message: 'Voicemail marked as read',
      voicemail: message
    });
  } catch (error) {
    console.error('❌ Error marking voicemail as read:', error);
    res.status(500).json({ error: 'Failed to update voicemail' });
  }
});

/**
 * Delete voicemail
 * DELETE /voicemail/messages/:id
 */
router.delete('/messages/:id', async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = voicemails.get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    // In production, also delete recording from S3
    // await deleteRecordingFromS3(message.recording_url);

    voicemails.delete(messageId);
    console.log(`🗑️  Voicemail ${messageId} deleted`);

    res.json({ message: 'Voicemail deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting voicemail:', error);
    res.status(500).json({ error: 'Failed to delete voicemail' });
  }
});

/**
 * Get voicemail recording URL
 * GET /voicemail/messages/:id/recording
 */
router.get('/messages/:id/recording', async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = voicemails.get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    // Get presigned URL from IRISX API (valid for 15 minutes)
    const recordingUrl = message.recording_url;

    res.json({
      recording_url: recordingUrl,
      duration_seconds: message.duration_seconds,
      expires_in: 900 // 15 minutes
    });
  } catch (error) {
    console.error('❌ Error getting recording URL:', error);
    res.status(500).json({ error: 'Failed to get recording URL' });
  }
});

/**
 * Get voicemail transcription
 * GET /voicemail/messages/:id/transcription
 */
router.get('/messages/:id/transcription', (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = voicemails.get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Voicemail not found' });
    }

    if (!message.transcription) {
      return res.status(404).json({ error: 'Transcription not available' });
    }

    res.json({
      transcription: message.transcription,
      confidence: message.transcription_confidence || null
    });
  } catch (error) {
    console.error('❌ Error getting transcription:', error);
    res.status(500).json({ error: 'Failed to get transcription' });
  }
});

/**
 * Get voicemail statistics
 * GET /voicemail/stats
 */
router.get('/stats', (req, res) => {
  try {
    const messages = Array.from(voicemails.values());

    const stats = {
      total: messages.length,
      new: messages.filter(m => m.status === 'new').length,
      read: messages.filter(m => m.status === 'read').length,
      total_duration: messages.reduce((sum, m) => sum + (m.duration_seconds || 0), 0),
      average_duration: messages.length > 0
        ? Math.round(messages.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) / messages.length)
        : 0,
      transcribed: messages.filter(m => m.transcription).length
    };

    res.json({ stats });
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Bulk operations - mark multiple as read
 * POST /voicemail/bulk/mark-read
 */
router.post('/bulk/mark-read', (req, res) => {
  try {
    const { message_ids } = req.body;

    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({ error: 'message_ids array is required' });
    }

    let updated = 0;
    const timestamp = new Date().toISOString();

    for (const id of message_ids) {
      const message = voicemails.get(id);
      if (message) {
        message.status = 'read';
        message.read_at = timestamp;
        voicemails.set(id, message);
        updated++;
      }
    }

    console.log(`👁️  Marked ${updated} voicemails as read`);

    res.json({
      message: `${updated} voicemails marked as read`,
      updated
    });
  } catch (error) {
    console.error('❌ Error in bulk operation:', error);
    res.status(500).json({ error: 'Bulk operation failed' });
  }
});

/**
 * Bulk operations - delete multiple voicemails
 * DELETE /voicemail/bulk/delete
 */
router.delete('/bulk/delete', (req, res) => {
  try {
    const { message_ids } = req.body;

    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({ error: 'message_ids array is required' });
    }

    let deleted = 0;

    for (const id of message_ids) {
      if (voicemails.has(id)) {
        voicemails.delete(id);
        deleted++;
      }
    }

    console.log(`🗑️  Deleted ${deleted} voicemails`);

    res.json({
      message: `${deleted} voicemails deleted`,
      deleted
    });
  } catch (error) {
    console.error('❌ Error in bulk delete:', error);
    res.status(500).json({ error: 'Bulk delete failed' });
  }
});

export default router;
