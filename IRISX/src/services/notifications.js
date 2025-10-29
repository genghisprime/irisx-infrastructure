/**
 * Notifications Service
 * Handles system notifications, alerts, and multi-channel delivery
 */

import { query } from '../db/index.js';

class NotificationsService {
  /**
   * Create notification
   */
  async createNotification(notificationData) {
    const {
      tenant_id,
      user_id,
      notification_type,
      severity = 'info',
      title,
      message,
      channels = ['in_app'],
      metadata = {},
      action_url,
      expires_at
    } = notificationData;

    const sql = `
      INSERT INTO notifications (
        tenant_id, user_id, notification_type, severity, title, message,
        channels, metadata, action_url, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await query(sql, [
      tenant_id, user_id, notification_type, severity, title, message,
      JSON.stringify(channels), JSON.stringify(metadata), action_url, expires_at
    ]);

    return result.rows[0];
  }

  /**
   * Get notification by ID
   */
  async getNotification(notificationId, tenantId) {
    const sql = `SELECT * FROM notifications WHERE id = $1 AND tenant_id = $2`;
    const result = await query(sql, [notificationId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    return result.rows[0];
  }

  /**
   * List notifications for tenant/user
   */
  async listNotifications(tenantId, filters = {}) {
    const { user_id, status, severity, limit = 50, offset = 0 } = filters;

    let sql = `SELECT * FROM notifications WHERE tenant_id = $1`;
    const params = [tenantId];
    let paramIndex = 2;

    if (user_id) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      sql += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return {
      notifications: result.rows,
      total: result.rows.length,
      limit,
      offset
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, tenantId) {
    const sql = `
      UPDATE notifications
      SET status = 'read', read_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await query(sql, [notificationId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    return result.rows[0];
  }

  /**
   * Get notification preferences
   */
  async getPreferences(tenantId, userId = null) {
    const sql = `
      SELECT * FROM notification_preferences
      WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
    `;

    const result = await query(sql, [tenantId, userId]);
    return result.rows;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(tenantId, userId, notificationType, preferences) {
    const { email_enabled, sms_enabled, in_app_enabled, webhook_enabled } = preferences;

    const sql = `
      INSERT INTO notification_preferences (
        tenant_id, user_id, notification_type,
        email_enabled, sms_enabled, in_app_enabled, webhook_enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, user_id, notification_type)
      DO UPDATE SET
        email_enabled = EXCLUDED.email_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        in_app_enabled = EXCLUDED.in_app_enabled,
        webhook_enabled = EXCLUDED.webhook_enabled,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [
      tenantId, userId, notificationType,
      email_enabled, sms_enabled, in_app_enabled, webhook_enabled
    ]);

    return result.rows[0];
  }

  /**
   * Get notification count (unread)
   */
  async getUnreadCount(tenantId, userId = null) {
    let sql = `
      SELECT COUNT(*) as unread_count
      FROM notifications
      WHERE tenant_id = $1 AND status = 'pending'
    `;

    const params = [tenantId];

    if (userId) {
      sql += ` AND user_id = $2`;
      params.push(userId);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].unread_count);
  }

  /**
   * Delete old notifications
   */
  async deleteOldNotifications(days = 90) {
    const sql = `
      DELETE FROM notifications
      WHERE created_at < NOW() - INTERVAL '${days} days'
        OR (expires_at IS NOT NULL AND expires_at < NOW())
      RETURNING id
    `;

    const result = await query(sql);
    return result.rows.length;
  }
}

export default new NotificationsService();
