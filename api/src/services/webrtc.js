/**
 * WebRTC Token Service
 * Provides SIP credentials and WebSocket connection info for Agent Desktop WebRTC clients
 *
 * Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// FreeSWITCH WebSocket server configuration
const FREESWITCH_HOST = process.env.FREESWITCH_HOST || '54.160.220.243';
const FREESWITCH_WS_PORT = process.env.FREESWITCH_WS_PORT || '8066';
const FREESWITCH_WSS_PORT = process.env.FREESWITCH_WSS_PORT || '7443';

class WebRTCService {
  constructor() {
    this.websocketUrl = process.env.FREESWITCH_WEBSOCKET_URL || `wss://${FREESWITCH_HOST}:${FREESWITCH_WSS_PORT}`;
    this.realm = process.env.FREESWITCH_REALM || FREESWITCH_HOST;
  }

  /**
   * Get WebRTC credentials for an agent
   * Returns SIP extension info and WebSocket URL for Agent Desktop
   *
   * @param {number} userId - User ID from JWT token
   * @param {number} tenantId - Tenant ID from JWT token
   * @returns {Object} SIP credentials and config
   */
  async getAgentCredentials(userId, tenantId) {
    try {
      // Get user's agent profile with extensions
      const result = await query(`
        SELECT
          a.id as agent_id,
          a.name as agent_name,
          a.extension,
          a.sip_password,
          a.status as agent_status,
          u.email,
          u.first_name,
          u.last_name
        FROM agents a
        JOIN users u ON u.id = a.user_id
        WHERE a.user_id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL
        ORDER BY a.created_at ASC
      `, [userId, tenantId]);

      if (result.rows.length === 0) {
        // User has no agent profile - check if they need one created
        return {
          extensions: [],
          sipConfig: null,
          message: 'No agent profile found. Contact your administrator to provision an extension.'
        };
      }

      // Build extensions array
      const extensions = result.rows.map(agent => ({
        agent_id: agent.agent_id,
        extension: agent.extension,
        sip_password: agent.sip_password,
        name: agent.agent_name || `${agent.first_name} ${agent.last_name}`,
        status: agent.agent_status
      }));

      // SIP configuration for WebRTC client
      const sipConfig = {
        websocketUrl: this.websocketUrl,
        realm: this.realm,
        stunServers: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ],
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };

      return {
        extensions,
        sipConfig,
        user: {
          id: userId,
          tenant_id: tenantId,
          email: result.rows[0].email,
          first_name: result.rows[0].first_name,
          last_name: result.rows[0].last_name
        }
      };
    } catch (error) {
      console.error('[WebRTC Service] Error getting agent credentials:', error);
      throw error;
    }
  }

  /**
   * Generate a time-limited WebRTC session token
   * This can be used for additional security when connecting to FreeSWITCH
   *
   * @param {number} agentId - Agent ID
   * @param {string} extension - SIP extension
   * @param {number} expiresInMinutes - Token validity period
   * @returns {Object} Session token info
   */
  async generateSessionToken(agentId, extension, expiresInMinutes = 60) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      // Store token in database for validation
      await query(`
        INSERT INTO webrtc_session_tokens (agent_id, extension, token, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (agent_id, extension)
        DO UPDATE SET token = $3, expires_at = $4, created_at = NOW()
      `, [agentId, extension, token, expiresAt]);

      return {
        token,
        expires_at: expiresAt.toISOString(),
        extension
      };
    } catch (error) {
      console.error('[WebRTC Service] Error generating session token:', error);
      throw error;
    }
  }

  /**
   * Validate a WebRTC session token
   *
   * @param {string} token - Session token to validate
   * @param {string} extension - SIP extension
   * @returns {boolean} Token validity
   */
  async validateSessionToken(token, extension) {
    try {
      const result = await query(`
        SELECT agent_id FROM webrtc_session_tokens
        WHERE token = $1 AND extension = $2 AND expires_at > NOW()
      `, [token, extension]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('[WebRTC Service] Error validating session token:', error);
      return false;
    }
  }

  /**
   * Get FreeSWITCH connection status for an extension
   * Checks if the extension is registered and active
   *
   * @param {string} extension - SIP extension to check
   * @returns {Object} Registration status
   */
  async getRegistrationStatus(extension) {
    // This would typically query FreeSWITCH via ESL
    // For now, return placeholder info
    return {
      extension,
      registered: false,
      status: 'unknown',
      message: 'Registration status check requires FreeSWITCH ESL connection'
    };
  }

  /**
   * Provision a new SIP extension for an agent
   * Creates the extension in FreeSWITCH and stores credentials
   *
   * @param {number} tenantId - Tenant ID
   * @param {number} agentId - Agent ID
   * @param {string} requestedExtension - Optional preferred extension
   * @returns {Object} Provisioned extension info
   */
  async provisionExtension(tenantId, agentId, requestedExtension = null) {
    try {
      // Generate secure SIP password
      const sipPassword = this.generateSipPassword();

      // Get or assign extension number
      let extension = requestedExtension;
      if (!extension) {
        extension = await this.getNextAvailableExtension(tenantId);
      }

      // Update agent record with SIP credentials
      const result = await query(`
        UPDATE agents
        SET extension = $1, sip_password = $2, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4
        RETURNING id, extension, name
      `, [extension, sipPassword, agentId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Agent not found');
      }

      // Note: Full FreeSWITCH provisioning (XML config) would be done
      // by freeswitch-provisioning.js service

      return {
        agent_id: result.rows[0].id,
        extension,
        sip_password: sipPassword,
        name: result.rows[0].name,
        provisioned_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('[WebRTC Service] Error provisioning extension:', error);
      throw error;
    }
  }

  /**
   * Generate a secure SIP password
   */
  generateSipPassword(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      password += chars[randomBytes[i] % chars.length];
    }
    return password;
  }

  /**
   * Get next available extension number for a tenant
   */
  async getNextAvailableExtension(tenantId) {
    // Extension range: tenant_id * 1000 + 1000 to tenant_id * 1000 + 1999
    const baseExtension = (tenantId + 1) * 1000;

    const result = await query(`
      SELECT MAX(CAST(extension AS INTEGER)) as max_ext
      FROM agents
      WHERE tenant_id = $1
        AND extension IS NOT NULL
        AND extension ~ '^[0-9]+$'
        AND CAST(extension AS INTEGER) >= $2
        AND CAST(extension AS INTEGER) < $3
    `, [tenantId, baseExtension, baseExtension + 1000]);

    const maxExt = result.rows[0]?.max_ext || baseExtension - 1;
    return String(maxExt + 1);
  }

  /**
   * Revoke/reset SIP credentials for an agent
   *
   * @param {number} tenantId - Tenant ID
   * @param {number} agentId - Agent ID
   */
  async revokeCredentials(tenantId, agentId) {
    try {
      // Generate new password to invalidate old one
      const newPassword = this.generateSipPassword();

      await query(`
        UPDATE agents
        SET sip_password = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `, [newPassword, agentId, tenantId]);

      // Clear any active session tokens
      await query(`
        DELETE FROM webrtc_session_tokens WHERE agent_id = $1
      `, [agentId]);

      return { success: true, message: 'Credentials revoked' };
    } catch (error) {
      console.error('[WebRTC Service] Error revoking credentials:', error);
      throw error;
    }
  }
}

export default new WebRTCService();
