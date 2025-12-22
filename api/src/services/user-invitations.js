/**
 * User Invitations Service
 *
 * Complete user invitation system with email delivery,
 * role assignment, and team membership
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Invitation expiration time (7 days)
const INVITATION_EXPIRY_DAYS = 7;
const MAX_RESEND_COUNT = 5;

/**
 * User Invitations Service
 */
class UserInvitationService {
  constructor() {
    this.emailService = null; // Injected
  }

  /**
   * Set email service for sending invitations
   */
  setEmailService(emailService) {
    this.emailService = emailService;
  }

  // ============================================
  // Invitation Management
  // ============================================

  /**
   * Create and send invitation
   */
  async createInvitation(tenantId, invitationData, invitedBy) {
    const {
      email,
      roleIds = [],
      teamIds = [],
      firstName,
      lastName,
      customMessage,
      expiresInDays = INVITATION_EXPIRY_DAYS
    } = invitationData;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      [email.toLowerCase(), tenantId]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('A user with this email already exists');
    }

    // Check for existing pending invitation
    const existingInvite = await query(`
      SELECT id, resent_count FROM user_invitations
      WHERE email = $1 AND tenant_id = $2 AND accepted_at IS NULL AND expires_at > NOW()
    `, [email.toLowerCase(), tenantId]);

    if (existingInvite.rows.length > 0) {
      // Return existing invitation
      return {
        id: existingInvite.rows[0].id,
        exists: true,
        message: 'An invitation already exists for this email. Use resend to send again.'
      };
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Create invitation
    const result = await query(`
      INSERT INTO user_invitations (
        tenant_id, email, token, role_ids, team_ids, invited_by,
        expires_at, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [
      tenantId,
      email.toLowerCase(),
      token,
      roleIds,
      teamIds,
      invitedBy,
      expiresAt,
      JSON.stringify({ firstName, lastName, customMessage })
    ]);

    const invitation = result.rows[0];

    // Send invitation email
    await this.sendInvitationEmail(invitation, tenantId);

    return {
      id: invitation.id,
      email: invitation.email,
      expires_at: invitation.expires_at,
      roles: roleIds,
      teams: teamIds
    };
  }

  /**
   * Get all invitations for tenant
   */
  async getInvitations(tenantId, options = {}) {
    const { status = 'all', limit = 50, offset = 0 } = options;

    let sql = `
      SELECT i.*,
        u.email as inviter_email,
        u.first_name as inviter_first_name,
        u.last_name as inviter_last_name,
        au.email as accepted_by_email
      FROM user_invitations i
      LEFT JOIN users u ON i.invited_by = u.id
      LEFT JOIN users au ON i.accepted_user_id = au.id
      WHERE i.tenant_id = $1
    `;

    const params = [tenantId];

    if (status === 'pending') {
      sql += ' AND i.accepted_at IS NULL AND i.expires_at > NOW()';
    } else if (status === 'expired') {
      sql += ' AND i.accepted_at IS NULL AND i.expires_at <= NOW()';
    } else if (status === 'accepted') {
      sql += ' AND i.accepted_at IS NOT NULL';
    }

    sql += ` ORDER BY i.created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token) {
    const result = await query(`
      SELECT i.*, t.name as tenant_name, t.subdomain
      FROM user_invitations i
      JOIN tenants t ON i.tenant_id = t.id
      WHERE i.token = $1
    `, [token]);

    return result.rows[0] || null;
  }

  /**
   * Get invitation by ID
   */
  async getInvitation(invitationId, tenantId) {
    const result = await query(`
      SELECT i.*,
        u.email as inviter_email,
        ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL) as role_names,
        ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as team_names
      FROM user_invitations i
      LEFT JOIN users u ON i.invited_by = u.id
      LEFT JOIN roles r ON r.id = ANY(i.role_ids)
      LEFT JOIN teams t ON t.id = ANY(i.team_ids)
      WHERE i.id = $1 AND i.tenant_id = $2
      GROUP BY i.id, u.email
    `, [invitationId, tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Resend invitation
   */
  async resendInvitation(invitationId, tenantId) {
    const invitation = await this.getInvitation(invitationId, tenantId);

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.accepted_at) {
      throw new Error('Invitation has already been accepted');
    }

    if (invitation.resent_count >= MAX_RESEND_COUNT) {
      throw new Error(`Maximum resend limit (${MAX_RESEND_COUNT}) reached`);
    }

    // Generate new token and extend expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await query(`
      UPDATE user_invitations
      SET token = $1, expires_at = $2, resent_count = resent_count + 1, last_resent_at = NOW()
      WHERE id = $3
    `, [newToken, newExpiry, invitationId]);

    // Resend email
    await this.sendInvitationEmail({ ...invitation, token: newToken }, tenantId);

    return {
      success: true,
      new_expires_at: newExpiry,
      resent_count: invitation.resent_count + 1
    };
  }

  /**
   * Cancel invitation
   */
  async cancelInvitation(invitationId, tenantId) {
    const result = await query(`
      DELETE FROM user_invitations
      WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL
      RETURNING id
    `, [invitationId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Invitation not found or already accepted');
    }

    return { deleted: true };
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(token, userData) {
    const {
      password,
      firstName,
      lastName
    } = userData;

    // Get invitation
    const invitation = await this.getInvitationByToken(token);

    if (!invitation) {
      throw new Error('Invalid invitation token');
    }

    if (invitation.accepted_at) {
      throw new Error('Invitation has already been accepted');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw new Error('Invitation has expired');
    }

    // Create user
    const userId = crypto.randomUUID();
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 10);

    // Parse metadata for pre-filled values
    const metadata = typeof invitation.metadata === 'string'
      ? JSON.parse(invitation.metadata)
      : invitation.metadata || {};

    await query(`
      INSERT INTO users (
        id, tenant_id, email, password_hash, first_name, last_name,
        email_verified, password_changed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
    `, [
      userId,
      invitation.tenant_id,
      invitation.email,
      passwordHash,
      firstName || metadata.firstName || '',
      lastName || metadata.lastName || ''
    ]);

    // Assign roles
    if (invitation.role_ids && invitation.role_ids.length > 0) {
      for (const roleId of invitation.role_ids) {
        await query(`
          INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_by, assigned_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT DO NOTHING
        `, [userId, roleId, invitation.tenant_id, invitation.invited_by]);
      }
    }

    // Assign teams
    if (invitation.team_ids && invitation.team_ids.length > 0) {
      for (const teamId of invitation.team_ids) {
        await query(`
          INSERT INTO team_members (team_id, user_id, tenant_id, added_by, added_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT DO NOTHING
        `, [teamId, userId, invitation.tenant_id, invitation.invited_by]);
      }
    }

    // Mark invitation as accepted
    await query(`
      UPDATE user_invitations
      SET accepted_at = NOW(), accepted_user_id = $1
      WHERE id = $2
    `, [userId, invitation.id]);

    return {
      user_id: userId,
      email: invitation.email,
      tenant_id: invitation.tenant_id,
      tenant_name: invitation.tenant_name
    };
  }

  /**
   * Bulk invite users
   */
  async bulkInvite(tenantId, invitations, invitedBy) {
    const results = {
      successful: [],
      failed: []
    };

    for (const invite of invitations) {
      try {
        const result = await this.createInvitation(tenantId, invite, invitedBy);
        results.successful.push({
          email: invite.email,
          invitation_id: result.id
        });
      } catch (error) {
        results.failed.push({
          email: invite.email,
          error: error.message
        });
      }
    }

    return results;
  }

  // ============================================
  // Email Sending
  // ============================================

  /**
   * Send invitation email
   */
  async sendInvitationEmail(invitation, tenantId) {
    // Get tenant info
    const tenantResult = await query(
      'SELECT name, subdomain FROM tenants WHERE id = $1',
      [tenantId]
    );
    const tenant = tenantResult.rows[0];

    // Get inviter info
    let inviterName = 'An administrator';
    if (invitation.invited_by) {
      const inviterResult = await query(
        'SELECT first_name, last_name, email FROM users WHERE id = $1',
        [invitation.invited_by]
      );
      if (inviterResult.rows[0]) {
        const inviter = inviterResult.rows[0];
        inviterName = `${inviter.first_name} ${inviter.last_name}`.trim() || inviter.email;
      }
    }

    // Build invitation URL
    const baseUrl = process.env.APP_URL || 'https://app.irisx.io';
    const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

    // Parse metadata
    const metadata = typeof invitation.metadata === 'string'
      ? JSON.parse(invitation.metadata)
      : invitation.metadata || {};

    // Send email (if email service available)
    if (this.emailService) {
      await this.emailService.send({
        to: invitation.email,
        subject: `You've been invited to join ${tenant?.name || 'IRISX'}`,
        template: 'user-invitation',
        data: {
          inviterName,
          tenantName: tenant?.name || 'IRISX',
          inviteUrl,
          expiresAt: invitation.expires_at,
          customMessage: metadata.customMessage
        }
      });
    } else {
      console.log(`[Invitations] Email would be sent to ${invitation.email}`);
      console.log(`[Invitations] Invite URL: ${inviteUrl}`);
    }

    return true;
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Clean up expired invitations
   */
  async cleanupExpired() {
    const result = await query(`
      DELETE FROM user_invitations
      WHERE accepted_at IS NULL AND expires_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);

    return { deleted: result.rows.length };
  }

  /**
   * Get invitation statistics for tenant
   */
  async getStats(tenantId) {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE accepted_at IS NULL AND expires_at > NOW()) as pending,
        COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) as accepted,
        COUNT(*) FILTER (WHERE accepted_at IS NULL AND expires_at <= NOW()) as expired,
        COUNT(*) as total
      FROM user_invitations
      WHERE tenant_id = $1
    `, [tenantId]);

    return result.rows[0];
  }
}

// Singleton instance
const userInvitationService = new UserInvitationService();

export default userInvitationService;
