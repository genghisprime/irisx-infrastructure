/**
 * Unsubscribe Routes
 * Public and authenticated endpoints for managing unsubscriptions
 */

import { Hono } from 'hono';
import { z } from 'zod';
import unsubscribeService from '../services/unsubscribe.js';

const router = new Hono();

// ===== PUBLIC ENDPOINTS =====

// Unsubscribe page (GET shows confirmation, POST processes)
router.get('/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const showPreferences = c.req.query('preferences') === '1';

    // Look up token to get tenant settings
    const result = await c.get('db').query(
      `SELECT t.tenant_id, us.*
       FROM unsubscribe_tokens t
       LEFT JOIN unsubscribe_settings us ON t.tenant_id = us.tenant_id
       WHERE t.token = $1 AND t.expires_at > NOW() AND t.used_at IS NULL`,
      [token]
    );

    if (!result.rows[0]) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>Link Expired</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>Link Expired or Invalid</h1>
          <p>This unsubscribe link has expired or has already been used.</p>
        </body>
        </html>
      `, 400);
    }

    const settings = result.rows[0];
    const primaryColor = settings.page_primary_color || '#6366f1';
    const bgColor = settings.page_background_color || '#f9fafb';
    const title = settings.page_title || 'Manage Your Preferences';
    const logoUrl = settings.page_logo_url;

    // Return unsubscribe confirmation page
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${bgColor};
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            text-align: center;
          }
          .logo { max-height: 60px; margin-bottom: 20px; }
          h1 { color: #111; font-size: 24px; margin-bottom: 10px; }
          p { color: #666; margin-bottom: 30px; }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            text-decoration: none;
            cursor: pointer;
            border: none;
          }
          .btn-primary {
            background: ${primaryColor};
            color: white;
          }
          .btn-secondary {
            background: #e5e7eb;
            color: #374151;
            margin-left: 10px;
          }
          .preferences { text-align: left; margin: 20px 0; }
          .pref-item {
            padding: 15px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .pref-label { font-weight: 500; }
          .pref-desc { font-size: 12px; color: #666; }
          input[type="checkbox"] { width: 20px; height: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : ''}
          <h1>${title}</h1>
          <p>Are you sure you want to unsubscribe from our communications?</p>

          <form method="POST" action="/unsubscribe/${token}">
            ${showPreferences ? `
              <div class="preferences">
                <div class="pref-item">
                  <div>
                    <div class="pref-label">Email Marketing</div>
                    <div class="pref-desc">Promotional emails and newsletters</div>
                  </div>
                  <input type="checkbox" name="email_marketing" checked />
                </div>
                <div class="pref-item">
                  <div>
                    <div class="pref-label">SMS Marketing</div>
                    <div class="pref-desc">Promotional text messages</div>
                  </div>
                  <input type="checkbox" name="sms_marketing" checked />
                </div>
                <div class="pref-item">
                  <div>
                    <div class="pref-label">Phone Calls</div>
                    <div class="pref-desc">Marketing phone calls</div>
                  </div>
                  <input type="checkbox" name="voice_marketing" checked />
                </div>
              </div>
            ` : ''}

            <div style="margin-top: 20px;">
              <input type="hidden" name="reason" id="reason" />
              <button type="submit" class="btn btn-primary">
                ${showPreferences ? 'Save Preferences' : 'Unsubscribe'}
              </button>
              <a href="javascript:history.back()" class="btn btn-secondary">Cancel</a>
            </div>
          </form>

          ${settings.custom_footer ? `<div style="margin-top: 30px; font-size: 12px; color: #999;">${settings.custom_footer}</div>` : ''}
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Unsubscribe page error:', error);
    return c.html('<h1>Error</h1><p>An error occurred. Please try again.</p>', 500);
  }
});

// Process unsubscribe
router.post('/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');
    const body = await c.req.parseBody();
    const reason = body.reason || null;

    const result = await unsubscribeService.processUnsubscribe(token, ipAddress, userAgent, reason);

    if (!result.success) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>Unable to Process</h1>
          <p>${result.error || 'This link has expired or is invalid.'}</p>
        </body>
        </html>
      `, 400);
    }

    // Get settings for confirmation message
    const settings = await c.get('db').query(
      `SELECT * FROM unsubscribe_settings us
       JOIN unsubscribe_tokens ut ON us.tenant_id = ut.tenant_id
       WHERE ut.token = $1`,
      [token]
    );

    const s = settings.rows[0] || {};
    const message = s.confirmation_message || 'You have been successfully unsubscribed.';
    const redirectUrl = s.redirect_url;
    const redirectDelay = s.redirect_delay_seconds || 3;

    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        ${redirectUrl ? `<meta http-equiv="refresh" content="${redirectDelay};url=${redirectUrl}">` : ''}
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f9fafb;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
          }
          .checkmark {
            width: 60px;
            height: 60px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
          }
          .checkmark svg { width: 30px; height: 30px; color: white; }
          h1 { color: #111; font-size: 24px; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1>Unsubscribed</h1>
          <p>${message}</p>
          ${redirectUrl ? `<p style="font-size: 12px; color: #999; margin-top: 20px;">Redirecting in ${redirectDelay} seconds...</p>` : ''}
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Process unsubscribe error:', error);
    return c.html('<h1>Error</h1><p>An error occurred. Please try again.</p>', 500);
  }
});

// One-click unsubscribe (RFC 8058)
router.post('/one-click/:token', async (c) => {
  try {
    const token = c.req.param('token');
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0] || c.req.header('x-real-ip');

    const result = await unsubscribeService.processOneClick(token, ipAddress);

    if (!result.success) {
      return c.text('Unsubscribe failed', 400);
    }

    return c.text('Unsubscribed successfully', 200);
  } catch (error) {
    console.error('One-click unsubscribe error:', error);
    return c.text('Error', 500);
  }
});

// ===== AUTHENTICATED ENDPOINTS =====

// Get preferences for a recipient
router.get('/api/preferences', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const email = c.req.query('email');
    const phone = c.req.query('phone');

    if (!email && !phone) {
      return c.json({ success: false, error: 'Email or phone required' }, 400);
    }

    const prefs = await unsubscribeService.getPreferences(tenantId, email, phone);

    return c.json({
      success: true,
      data: prefs
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update preferences
router.put('/api/preferences', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const schema = z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      emailMarketing: z.boolean().optional(),
      emailTransactional: z.boolean().optional(),
      smsMarketing: z.boolean().optional(),
      smsTransactional: z.boolean().optional(),
      voiceMarketing: z.boolean().optional(),
      voiceTransactional: z.boolean().optional(),
      whatsappMarketing: z.boolean().optional(),
      whatsappTransactional: z.boolean().optional(),
      globalOptout: z.boolean().optional()
    });

    const data = schema.parse(body);

    if (!data.email && !data.phone) {
      return c.json({ success: false, error: 'Email or phone required' }, 400);
    }

    const prefs = await unsubscribeService.updatePreferences(tenantId, data.email, data.phone, data);

    return c.json({
      success: true,
      data: prefs
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Update preferences error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Check if unsubscribed
router.get('/api/check', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const email = c.req.query('email');
    const phone = c.req.query('phone');
    const channel = c.req.query('channel') || 'email';
    const category = c.req.query('category') || 'marketing';

    const isUnsub = await unsubscribeService.isUnsubscribed(tenantId, email, phone, channel, category);

    return c.json({
      success: true,
      data: { unsubscribed: isUnsub }
    });
  } catch (error) {
    console.error('Check unsubscribe error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Resubscribe
router.post('/api/resubscribe', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const { email, phone, channels } = body;

    if (!email && !phone) {
      return c.json({ success: false, error: 'Email or phone required' }, 400);
    }

    const prefs = await unsubscribeService.resubscribe(tenantId, email, phone, channels || 'all');

    return c.json({
      success: true,
      data: prefs
    });
  } catch (error) {
    console.error('Resubscribe error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== SUPPRESSION LIST =====

// Add to suppression list
router.post('/api/suppression', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const schema = z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      suppressionType: z.enum(['hard_bounce', 'soft_bounce', 'complaint', 'manual', 'global']),
      channel: z.string().optional(),
      reason: z.string().optional()
    });

    const data = schema.parse(body);

    await unsubscribeService.addToSuppressionList(tenantId, data);

    return c.json({ success: true });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({ success: false, error: 'Validation error', details: error.errors }, 400);
    }
    console.error('Add to suppression error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Remove from suppression list
router.delete('/api/suppression', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const email = c.req.query('email');
    const phone = c.req.query('phone');
    const channel = c.req.query('channel');

    await unsubscribeService.removeFromSuppressionList(tenantId, email, phone, channel);

    return c.json({ success: true });
  } catch (error) {
    console.error('Remove from suppression error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get suppression list
router.get('/api/suppression', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const list = await unsubscribeService.getSuppressionList(tenantId, {
      type: c.req.query('type'),
      channel: c.req.query('channel'),
      limit: parseInt(c.req.query('limit')) || 100,
      offset: parseInt(c.req.query('offset')) || 0
    });

    return c.json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('Get suppression list error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== SETTINGS =====

// Get settings
router.get('/api/settings', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const settings = await unsubscribeService.getSettings(tenantId);

    return c.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update settings
router.put('/api/settings', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const settings = await unsubscribeService.updateSettings(tenantId, body);

    return c.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== EVENTS & STATS =====

// Get events
router.get('/api/events', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const events = await unsubscribeService.getEvents(tenantId, {
      email: c.req.query('email'),
      phone: c.req.query('phone'),
      eventType: c.req.query('type'),
      limit: parseInt(c.req.query('limit')) || 100,
      offset: parseInt(c.req.query('offset')) || 0
    });

    return c.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get events error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get stats
router.get('/api/stats', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const days = parseInt(c.req.query('days')) || 30;

    const stats = await unsubscribeService.getStats(tenantId, days);

    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default router;
