/**
 * Call Recordings API Routes
 *
 * Endpoints:
 * - GET /v1/recordings - List all recordings
 * - GET /v1/recordings/:id - Get recording details
 * - GET /v1/recordings/:id/download - Get presigned download URL
 * - DELETE /v1/recordings/:id - Soft delete recording
 * - DELETE /v1/recordings/:id/permanent - Permanently delete recording
 * - GET /v1/recordings/call/:call_uuid - Get recordings for a call
 * - GET /v1/recordings/settings - Get tenant recording settings
 * - PUT /v1/recordings/settings - Update tenant recording settings
 * - GET /v1/recordings/stats - Get recording statistics
 */

import { Hono } from 'hono';
import recordingsService from '../services/recordings.js';

const recordings = new Hono();

// List recordings
recordings.get('/', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1; // TODO: Get from auth middleware

    const filters = {
      call_uuid: c.req.query('call_uuid'),
      status: c.req.query('status'),
      start_date: c.req.query('start_date'),
      end_date: c.req.query('end_date'),
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await recordingsService.listRecordings(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[Recordings] Error listing recordings:', error);
    return c.json({ error: 'Failed to list recordings' }, 500);
  }
});

// Get recording by ID
recordings.get('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const recordingId = parseInt(c.req.param('id'));

    const recording = await recordingsService.getRecording(recordingId, tenantId);

    return c.json({ recording });
  } catch (error) {
    console.error('[Recordings] Error getting recording:', error);
    return c.json({ error: error.message }, error.message.includes('not found') ? 404 : 500);
  }
});

// Get download URL for recording
recordings.get('/:id/download', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const recordingId = parseInt(c.req.param('id'));
    const expiresIn = parseInt(c.req.query('expires_in') || '900'); // 15 minutes default

    const downloadInfo = await recordingsService.getDownloadUrl(recordingId, tenantId, expiresIn);

    return c.json(downloadInfo);
  } catch (error) {
    console.error('[Recordings] Error generating download URL:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Soft delete recording
recordings.delete('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const recordingId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));
    const reason = body.reason || 'User requested deletion';

    const result = await recordingsService.deleteRecording(recordingId, tenantId, reason);

    return c.json({
      message: 'Recording deleted successfully',
      recording: result
    });
  } catch (error) {
    console.error('[Recordings] Error deleting recording:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Permanently delete recording
recordings.delete('/:id/permanent', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const recordingId = parseInt(c.req.param('id'));

    const result = await recordingsService.permanentlyDeleteRecording(recordingId, tenantId);

    return c.json({
      message: 'Recording permanently deleted',
      ...result
    });
  } catch (error) {
    console.error('[Recordings] Error permanently deleting recording:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get recordings for a specific call
recordings.get('/call/:call_uuid', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const callUuid = c.req.param('call_uuid');

    const callRecordings = await recordingsService.getRecordingsByCall(callUuid, tenantId);

    return c.json({
      call_uuid: callUuid,
      recordings: callRecordings,
      count: callRecordings.length
    });
  } catch (error) {
    console.error('[Recordings] Error getting call recordings:', error);
    return c.json({ error: 'Failed to get call recordings' }, 500);
  }
});

// Get recording settings
recordings.get('/settings', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const settings = await recordingsService.getRecordingSettings(tenantId);

    return c.json({ settings });
  } catch (error) {
    console.error('[Recordings] Error getting recording settings:', error);
    return c.json({ error: 'Failed to get recording settings' }, 500);
  }
});

// Update recording settings
recordings.put('/settings', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const settings = await c.req.json();

    const updatedSettings = await recordingsService.updateRecordingSettings(tenantId, settings);

    return c.json({
      message: 'Recording settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('[Recordings] Error updating recording settings:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get recording statistics
recordings.get('/stats', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const days = parseInt(c.req.query('days') || '30');

    const stats = await recordingsService.getRecordingStats(tenantId, days);

    return c.json({
      period: `${days} days`,
      stats
    });
  } catch (error) {
    console.error('[Recordings] Error getting recording stats:', error);
    return c.json({ error: 'Failed to get recording statistics' }, 500);
  }
});

export default recordings;
