/**
 * Notifications API Routes
 *
 * Endpoints:
 * - POST /v1/notifications - Create notification
 * - GET /v1/notifications - List notifications
 * - GET /v1/notifications/:id - Get notification
 * - POST /v1/notifications/:id/read - Mark as read
 * - GET /v1/notifications/unread/count - Get unread count
 * - GET /v1/notifications/preferences - Get preferences
 * - PUT /v1/notifications/preferences - Update preferences
 */

import { Hono } from 'hono';
import notificationsService from '../services/notifications.js';

const notifications = new Hono();

// Create notification
notifications.post('/', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const body = await c.req.json();

    const notification = await notificationsService.createNotification({
      ...body,
      tenant_id: tenantId
    });

    return c.json({
      message: 'Notification created successfully',
      notification
    }, 201);
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error);
    return c.json({ error: error.message }, 400);
  }
});

// List notifications
notifications.get('/', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;

    const filters = {
      user_id: c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null,
      status: c.req.query('status'),
      severity: c.req.query('severity'),
      limit: parseInt(c.req.query('limit') || '50'),
      offset: parseInt(c.req.query('offset') || '0')
    };

    const result = await notificationsService.listNotifications(tenantId, filters);

    return c.json(result);
  } catch (error) {
    console.error('[Notifications] Error listing notifications:', error);
    return c.json({ error: 'Failed to list notifications' }, 500);
  }
});

// Get notification
notifications.get('/:id', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const notificationId = parseInt(c.req.param('id'));

    const notification = await notificationsService.getNotification(notificationId, tenantId);

    return c.json({ notification });
  } catch (error) {
    console.error('[Notifications] Error getting notification:', error);
    return c.json({ error: error.message }, error.message.includes('not found') ? 404 : 500);
  }
});

// Mark as read
notifications.post('/:id/read', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const notificationId = parseInt(c.req.param('id'));

    const notification = await notificationsService.markAsRead(notificationId, tenantId);

    return c.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('[Notifications] Error marking notification as read:', error);
    return c.json({ error: error.message }, 400);
  }
});

// Get unread count
notifications.get('/unread/count', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const userId = c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null;

    const count = await notificationsService.getUnreadCount(tenantId, userId);

    return c.json({ unread_count: count });
  } catch (error) {
    console.error('[Notifications] Error getting unread count:', error);
    return c.json({ error: 'Failed to get unread count' }, 500);
  }
});

// Get preferences
notifications.get('/preferences', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const userId = c.req.query('user_id') ? parseInt(c.req.query('user_id')) : null;

    const preferences = await notificationsService.getPreferences(tenantId, userId);

    return c.json({ preferences });
  } catch (error) {
    console.error('[Notifications] Error getting preferences:', error);
    return c.json({ error: 'Failed to get notification preferences' }, 500);
  }
});

// Update preferences
notifications.put('/preferences', async (c) => {
  try {
    const tenantId = c.get('user')?.tenant_id || 1;
    const body = await c.req.json();
    const { user_id, notification_type, ...preferences } = body;

    const updated = await notificationsService.updatePreferences(
      tenantId,
      user_id,
      notification_type,
      preferences
    );

    return c.json({
      message: 'Preferences updated successfully',
      preferences: updated
    });
  } catch (error) {
    console.error('[Notifications] Error updating preferences:', error);
    return c.json({ error: error.message }, 400);
  }
});

export default notifications;
