/**
 * WebRTC Token API Routes
 * Provides SIP credentials and WebSocket connection info for Agent Desktop WebRTC clients
 *
 * Based on: IRIS_Agent_Desktop_Supervisor_Tools.md
 */

import { Hono } from 'hono';
import webrtcService from '../services/webrtc.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const webrtc = new Hono();

// All routes require authentication
webrtc.use('*', authenticateJWT);

/**
 * Get WebRTC credentials for the authenticated agent
 * Returns SIP extension info and WebSocket URL for Agent Desktop
 *
 * GET /v1/webrtc/credentials
 */
webrtc.get('/credentials', async (c) => {
  try {
    const user = c.get('user');
    const userId = user?.userId;
    const tenantId = user?.tenantId;

    if (!userId || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const credentials = await webrtcService.getAgentCredentials(userId, tenantId);

    return c.json(credentials);
  } catch (error) {
    console.error('[WebRTC Routes] Error getting credentials:', error);
    return c.json({ error: 'Failed to get WebRTC credentials', message: error.message }, 500);
  }
});

/**
 * Generate a time-limited session token for WebRTC connection
 * Optional extra security layer for FreeSWITCH WebSocket auth
 *
 * POST /v1/webrtc/session-token
 * Body: { extension: "1001", expires_minutes: 60 }
 */
webrtc.post('/session-token', async (c) => {
  try {
    const user = c.get('user');
    const userId = user?.userId;
    const tenantId = user?.tenantId;

    if (!userId || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const body = await c.req.json();
    const { extension, expires_minutes = 60 } = body;

    if (!extension) {
      return c.json({ error: 'Extension is required' }, 400);
    }

    // Verify the agent owns this extension
    const credentials = await webrtcService.getAgentCredentials(userId, tenantId);
    const agentExtension = credentials.extensions?.find(e => e.extension === extension);

    if (!agentExtension) {
      return c.json({ error: 'Extension not found or not authorized' }, 403);
    }

    const token = await webrtcService.generateSessionToken(
      agentExtension.agent_id,
      extension,
      Math.min(expires_minutes, 480) // Max 8 hours
    );

    return c.json(token);
  } catch (error) {
    console.error('[WebRTC Routes] Error generating session token:', error);
    return c.json({ error: 'Failed to generate session token', message: error.message }, 500);
  }
});

/**
 * Validate a session token
 * Used by FreeSWITCH or middleware to verify WebRTC connection
 *
 * POST /v1/webrtc/validate-token
 * Body: { token: "...", extension: "1001" }
 */
webrtc.post('/validate-token', async (c) => {
  try {
    const body = await c.req.json();
    const { token, extension } = body;

    if (!token || !extension) {
      return c.json({ error: 'Token and extension are required' }, 400);
    }

    const isValid = await webrtcService.validateSessionToken(token, extension);

    return c.json({ valid: isValid });
  } catch (error) {
    console.error('[WebRTC Routes] Error validating token:', error);
    return c.json({ error: 'Failed to validate token' }, 500);
  }
});

/**
 * Get registration status for an extension
 * Checks if extension is registered with FreeSWITCH
 *
 * GET /v1/webrtc/status/:extension
 */
webrtc.get('/status/:extension', async (c) => {
  try {
    const user = c.get('user');
    const userId = user?.userId;
    const tenantId = user?.tenantId;

    if (!userId || !tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const extension = c.req.param('extension');

    // Verify the agent owns this extension
    const credentials = await webrtcService.getAgentCredentials(userId, tenantId);
    const agentExtension = credentials.extensions?.find(e => e.extension === extension);

    if (!agentExtension) {
      return c.json({ error: 'Extension not found or not authorized' }, 403);
    }

    const status = await webrtcService.getRegistrationStatus(extension);

    return c.json(status);
  } catch (error) {
    console.error('[WebRTC Routes] Error getting registration status:', error);
    return c.json({ error: 'Failed to get registration status' }, 500);
  }
});

/**
 * Provision a new SIP extension for an agent
 * Admin/supervisor only endpoint
 *
 * POST /v1/webrtc/provision
 * Body: { agent_id: 123, extension: "1001" } // extension is optional
 */
webrtc.post('/provision', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const role = user?.role;

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Only admins and supervisors can provision extensions
    if (!['admin', 'supervisor'].includes(role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const body = await c.req.json();
    const { agent_id, extension } = body;

    if (!agent_id) {
      return c.json({ error: 'agent_id is required' }, 400);
    }

    const result = await webrtcService.provisionExtension(tenantId, agent_id, extension);

    return c.json(result, 201);
  } catch (error) {
    console.error('[WebRTC Routes] Error provisioning extension:', error);
    if (error.message === 'Agent not found') {
      return c.json({ error: 'Agent not found' }, 404);
    }
    return c.json({ error: 'Failed to provision extension', message: error.message }, 500);
  }
});

/**
 * Revoke/reset SIP credentials for an agent
 * Admin/supervisor only endpoint
 *
 * POST /v1/webrtc/revoke
 * Body: { agent_id: 123 }
 */
webrtc.post('/revoke', async (c) => {
  try {
    const user = c.get('user');
    const tenantId = user?.tenantId;
    const role = user?.role;

    if (!tenantId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Only admins and supervisors can revoke credentials
    if (!['admin', 'supervisor'].includes(role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    const body = await c.req.json();
    const { agent_id } = body;

    if (!agent_id) {
      return c.json({ error: 'agent_id is required' }, 400);
    }

    const result = await webrtcService.revokeCredentials(tenantId, agent_id);

    return c.json(result);
  } catch (error) {
    console.error('[WebRTC Routes] Error revoking credentials:', error);
    return c.json({ error: 'Failed to revoke credentials', message: error.message }, 500);
  }
});

/**
 * Get SIP server configuration
 * Returns WebSocket URL and STUN/TURN servers without credentials
 *
 * GET /v1/webrtc/config
 */
webrtc.get('/config', async (c) => {
  try {
    // Return public SIP config (no credentials)
    const config = {
      websocketUrl: process.env.FREESWITCH_WEBSOCKET_URL || 'wss://54.160.220.243:7443',
      realm: process.env.FREESWITCH_REALM || '54.160.220.243',
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      // Optional TURN server config (if configured)
      turnServers: process.env.TURN_SERVERS ? JSON.parse(process.env.TURN_SERVERS) : []
    };

    return c.json({ config });
  } catch (error) {
    console.error('[WebRTC Routes] Error getting config:', error);
    return c.json({ error: 'Failed to get WebRTC config' }, 500);
  }
});

export default webrtc;
