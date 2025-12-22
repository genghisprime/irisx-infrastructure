/**
 * CDN Management Routes
 * CloudFront configuration, signed URLs, cache invalidation
 */

import { Hono } from 'hono';
import { z } from 'zod';
import cdnService from '../services/cdn.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const cdn = new Hono();

// =========================================
// PUBLIC/AUTHENTICATED ENDPOINTS
// =========================================

/**
 * GET /cdn/recordings/:recordingId
 * Get signed URL for recording playback
 */
cdn.get('/recordings/:recordingId', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const recordingId = c.req.param('recordingId');
    const expiresIn = parseInt(c.req.query('expires_in') || '3600');

    // Get client IP for restriction (optional)
    const clientIp = c.req.query('restrict_ip') === 'true'
      ? c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip')
      : null;

    const url = cdnService.getRecordingUrl(recordingId, user.tenantId, {
      expiresIn: Math.min(expiresIn, 86400), // Max 24 hours
      ipAddress: clientIp
    });

    return c.json({
      success: true,
      data: {
        url,
        recording_id: recordingId,
        expires_in: expiresIn,
        ip_restricted: !!clientIp
      }
    });
  } catch (error) {
    console.error('[CDN] Recording URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /cdn/tts/:filename
 * Get signed URL for TTS audio file
 */
cdn.get('/tts/:filename', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const filename = c.req.param('filename');
    const expiresIn = parseInt(c.req.query('expires_in') || '86400');

    const url = cdnService.getTTSAudioUrl(user.tenantId, filename, {
      expiresIn: Math.min(expiresIn, 604800) // Max 7 days
    });

    return c.json({
      success: true,
      data: {
        url,
        filename,
        expires_in: expiresIn
      }
    });
  } catch (error) {
    console.error('[CDN] TTS URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /cdn/voicemails/:voicemailId
 * Get signed URL for voicemail playback
 */
cdn.get('/voicemails/:voicemailId', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const voicemailId = c.req.param('voicemailId');
    const expiresIn = parseInt(c.req.query('expires_in') || '7200');

    const url = cdnService.getVoicemailUrl(user.tenantId, voicemailId, {
      expiresIn: Math.min(expiresIn, 86400)
    });

    return c.json({
      success: true,
      data: {
        url,
        voicemail_id: voicemailId,
        expires_in: expiresIn
      }
    });
  } catch (error) {
    console.error('[CDN] Voicemail URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /cdn/transcripts/:callId
 * Get signed URL for transcript file
 */
cdn.get('/transcripts/:callId', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const callId = c.req.param('callId');
    const format = c.req.query('format') || 'json';
    const expiresIn = parseInt(c.req.query('expires_in') || '3600');

    const validFormats = ['json', 'txt', 'srt', 'vtt'];
    if (!validFormats.includes(format)) {
      return c.json({
        success: false,
        error: `Invalid format. Valid formats: ${validFormats.join(', ')}`
      }, 400);
    }

    const url = cdnService.getTranscriptUrl(user.tenantId, callId, format, {
      expiresIn: Math.min(expiresIn, 86400)
    });

    return c.json({
      success: true,
      data: {
        url,
        call_id: callId,
        format,
        expires_in: expiresIn
      }
    });
  } catch (error) {
    console.error('[CDN] Transcript URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /cdn/signed-url
 * Generate signed URL for any S3 path (authenticated)
 */
cdn.post('/signed-url', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
      path: z.string().min(1),
      expires_in: z.number().int().min(60).max(604800).default(3600),
      restrict_ip: z.boolean().default(false)
    });

    const { path, expires_in, restrict_ip } = schema.parse(body);

    // Ensure path includes tenant prefix for security
    const tenantPrefix = `${user.tenantId}/`;
    const securePath = path.includes(tenantPrefix) ? path : `${tenantPrefix}${path}`;

    const clientIp = restrict_ip
      ? c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip')
      : null;

    const url = cdnService.getSignedUrl(securePath, {
      expiresIn: expires_in,
      ipAddress: clientIp
    });

    return c.json({
      success: true,
      data: {
        url,
        path: securePath,
        expires_in,
        ip_restricted: !!clientIp
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CDN] Signed URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// =========================================
// ADMIN ENDPOINTS
// =========================================

/**
 * GET /cdn/admin/status
 * Get CDN/CloudFront distribution status (Admin only)
 */
cdn.get('/admin/status', authenticateAdmin, async (c) => {
  try {
    const status = await cdnService.getDistributionStatus();
    const health = await cdnService.healthCheck();

    return c.json({
      success: true,
      data: {
        distribution: status,
        health
      }
    });
  } catch (error) {
    console.error('[CDN] Status error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /cdn/admin/invalidate
 * Invalidate CloudFront cache (Admin only)
 */
cdn.post('/admin/invalidate', authenticateAdmin, async (c) => {
  try {
    const body = await c.req.json();

    const schema = z.object({
      paths: z.array(z.string().min(1)).min(1).max(20)
    });

    const { paths } = schema.parse(body);

    const result = await cdnService.invalidateCache(paths);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CDN] Invalidation error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /cdn/admin/invalidate/recording/:recordingId
 * Invalidate cache for specific recording (Admin only)
 */
cdn.post('/admin/invalidate/recording/:recordingId', authenticateAdmin, async (c) => {
  try {
    const recordingId = c.req.param('recordingId');
    const tenantId = c.req.query('tenant_id');

    if (!tenantId) {
      return c.json({
        success: false,
        error: 'tenant_id query parameter required'
      }, 400);
    }

    const result = await cdnService.invalidateRecording(recordingId, tenantId);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[CDN] Recording invalidation error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /cdn/admin/invalidate/tts
 * Invalidate TTS cache for tenant (Admin only)
 */
cdn.post('/admin/invalidate/tts', authenticateAdmin, async (c) => {
  try {
    const body = await c.req.json();

    const schema = z.object({
      tenant_id: z.string().uuid(),
      filename: z.string().optional()
    });

    const { tenant_id, filename } = schema.parse(body);

    const result = await cdnService.invalidateTTSCache(tenant_id, filename);

    return c.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CDN] TTS invalidation error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /cdn/admin/health
 * CDN health check (Admin only)
 */
cdn.get('/admin/health', authenticateAdmin, async (c) => {
  try {
    const health = await cdnService.healthCheck();

    return c.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('[CDN] Health check error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /cdn/admin/signed-url
 * Generate signed URL for any path (Admin - no tenant restriction)
 */
cdn.post('/admin/signed-url', authenticateAdmin, async (c) => {
  try {
    const body = await c.req.json();

    const schema = z.object({
      path: z.string().min(1),
      expires_in: z.number().int().min(60).max(604800).default(3600),
      ip_address: z.string().optional()
    });

    const { path, expires_in, ip_address } = schema.parse(body);

    const url = cdnService.getSignedUrl(path, {
      expiresIn: expires_in,
      ipAddress: ip_address
    });

    return c.json({
      success: true,
      data: {
        url,
        path,
        expires_in,
        ip_restricted: !!ip_address
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('[CDN] Admin signed URL error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default cdn;
