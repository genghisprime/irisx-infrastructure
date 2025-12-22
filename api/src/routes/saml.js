/**
 * SAML 2.0 SSO API Routes
 *
 * Endpoints for SAML authentication and configuration
 */

import { Router } from 'express';
import samlService from '../services/saml.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ============================================
// SP Metadata Endpoints
// ============================================

/**
 * GET /auth/saml/metadata
 * Get SP metadata XML
 */
router.get('/metadata', (req, res) => {
  const { tenant_id } = req.query;
  const metadata = samlService.generateSPMetadata(tenant_id);

  res.set('Content-Type', 'application/xml');
  res.send(metadata);
});

/**
 * GET /auth/saml/metadata/:tenantId
 * Get SP metadata XML for specific tenant
 */
router.get('/metadata/:tenantId', (req, res) => {
  const metadata = samlService.generateSPMetadata(req.params.tenantId);

  res.set('Content-Type', 'application/xml');
  res.send(metadata);
});

// ============================================
// Login Flow Endpoints
// ============================================

/**
 * GET /auth/saml/login
 * Initiate SAML login (redirect to IdP)
 */
router.get('/login', async (req, res) => {
  try {
    const { tenant_id, domain, relay_state } = req.query;

    let config;

    if (tenant_id) {
      config = await samlService.getTenantSAMLConfig(tenant_id);
    } else if (domain) {
      config = await samlService.getSAMLConfigByDomain(domain);
    }

    if (!config) {
      return res.status(404).json({
        error: 'SAML not configured',
        message: 'SAML SSO is not configured for this tenant or domain'
      });
    }

    if (!config.is_active) {
      return res.status(403).json({
        error: 'SAML disabled',
        message: 'SAML SSO is disabled for this tenant'
      });
    }

    const { url, requestId } = samlService.generateLoginUrl(config, {
      relayState: relay_state || '/'
    });

    // Log the login attempt
    await logSAMLEvent(config.tenant_id, 'login_initiated', {
      request_id: requestId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    res.redirect(url);
  } catch (error) {
    console.error('[SAML] Login error:', error);
    res.status(500).json({ error: 'Failed to initiate SAML login' });
  }
});

/**
 * POST /auth/saml/callback
 * Assertion Consumer Service (ACS) - receive SAML response
 */
router.post('/callback', async (req, res) => {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      return res.status(400).json({ error: 'SAMLResponse is required' });
    }

    // Decode base64 to get XML
    const xml = Buffer.from(SAMLResponse, 'base64').toString('utf8');

    // Find tenant from response (check InResponseTo or extract from issuer)
    // For now, we'll require tenant_id in RelayState
    let tenantId = null;
    if (RelayState) {
      try {
        const relayData = JSON.parse(Buffer.from(RelayState, 'base64').toString('utf8'));
        tenantId = relayData.tenant_id;
      } catch {
        // RelayState might be a simple URL
      }
    }

    // Try to find config from all active configs if tenantId not in relay state
    let config;
    if (tenantId) {
      config = await samlService.getTenantSAMLConfig(tenantId);
    } else {
      // Parse issuer from response to find matching config
      const issuerMatch = xml.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/);
      if (issuerMatch) {
        const { pool } = await import('../db.js');
        const result = await pool.query(
          'SELECT * FROM tenant_saml_config WHERE idp_entity_id = $1 AND is_active = true',
          [issuerMatch[1]]
        );
        config = result.rows[0];
      }
    }

    if (!config) {
      return res.status(400).json({ error: 'Unable to identify SAML configuration' });
    }

    // Parse and validate SAML response
    const { user, responseId } = await samlService.parseSAMLResponse(SAMLResponse, config);

    // Find or create user in database
    const { pool } = await import('../db.js');

    // Check if user exists
    let userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
      [user.email, config.tenant_id]
    );

    let dbUser;
    if (userResult.rows.length === 0) {
      // Create new user (JIT provisioning)
      userResult = await pool.query(`
        INSERT INTO users (
          tenant_id, email, first_name, last_name, role,
          auth_provider, auth_provider_id, email_verified, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'saml', $6, true, NOW())
        RETURNING *
      `, [
        config.tenant_id,
        user.email,
        user.firstName || '',
        user.lastName || '',
        mapSAMLRoleToAppRole(user.role),
        user.nameId
      ]);
      dbUser = userResult.rows[0];

      console.log(`[SAML] Created new user via JIT provisioning: ${user.email}`);
    } else {
      dbUser = userResult.rows[0];

      // Update user attributes if changed
      await pool.query(`
        UPDATE users
        SET first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            last_login_at = NOW()
        WHERE id = $3
      `, [user.firstName, user.lastName, dbUser.id]);
    }

    // Create SAML session for SLO
    const sessionIndex = crypto.randomUUID();
    await pool.query(`
      INSERT INTO saml_sessions (
        user_id, tenant_id, name_id, session_index, idp_entity_id, expires_at
      ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '8 hours')
    `, [dbUser.id, config.tenant_id, user.nameId, sessionIndex, config.idp_entity_id]);

    // Generate JWT token
    const token = jwt.sign({
      user_id: dbUser.id,
      tenant_id: config.tenant_id,
      email: dbUser.email,
      role: dbUser.role,
      auth_method: 'saml',
      saml_session_index: sessionIndex
    }, JWT_SECRET, { expiresIn: '8h' });

    // Log successful login
    await logSAMLEvent(config.tenant_id, 'login_success', {
      user_email: user.email,
      name_id: user.nameId,
      response_id: responseId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    // Redirect with token or return JSON based on Accept header
    const redirectUrl = RelayState && !RelayState.startsWith('{')
      ? `${RelayState}?token=${token}`
      : `${process.env.APP_URL || 'https://app.irisx.io'}?token=${token}`;

    if (req.accepts('html')) {
      res.redirect(redirectUrl);
    } else {
      res.json({
        success: true,
        token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.first_name,
          lastName: dbUser.last_name,
          role: dbUser.role
        }
      });
    }
  } catch (error) {
    console.error('[SAML] Callback error:', error);

    // Log failed login
    await logSAMLEvent(null, 'login_failure', {
      error: error.message,
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    res.status(401).json({
      error: 'SAML authentication failed',
      message: error.message
    });
  }
});

/**
 * GET/POST /auth/saml/logout
 * Single Logout (SLO)
 */
router.all('/logout', async (req, res) => {
  try {
    const { SAMLRequest, SAMLResponse, RelayState } = { ...req.query, ...req.body };

    // If SAMLRequest, this is IdP-initiated logout
    if (SAMLRequest) {
      // Parse logout request and terminate session
      // Send LogoutResponse back to IdP
      res.redirect(RelayState || '/');
      return;
    }

    // SP-initiated logout
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);

    const { pool } = await import('../db.js');

    // Get SAML session
    const sessionResult = await pool.query(`
      SELECT * FROM saml_sessions
      WHERE user_id = $1 AND logged_out_at IS NULL
      ORDER BY login_at DESC
      LIMIT 1
    `, [decoded.user_id]);

    if (sessionResult.rows.length === 0) {
      // No active SAML session, just logout locally
      return res.json({ success: true, message: 'Logged out locally' });
    }

    const session = sessionResult.rows[0];
    const config = await samlService.getTenantSAMLConfig(decoded.tenant_id);

    // Mark session as logged out
    await pool.query(
      'UPDATE saml_sessions SET logged_out_at = NOW() WHERE id = $1',
      [session.id]
    );

    // If IdP supports SLO, redirect to IdP logout
    if (config?.idp_slo_url) {
      const { request } = samlService.generateLogoutRequest(
        config,
        session.name_id,
        session.session_index
      );

      const encoded = Buffer.from(request).toString('base64');
      const url = `${config.idp_slo_url}?SAMLRequest=${encodeURIComponent(encoded)}`;

      // Log logout
      await logSAMLEvent(config.tenant_id, 'logout', {
        user_id: decoded.user_id,
        name_id: session.name_id
      });

      if (req.accepts('html')) {
        res.redirect(url);
      } else {
        res.json({ success: true, redirect_url: url });
      }
    } else {
      res.json({ success: true, message: 'Logged out' });
    }
  } catch (error) {
    console.error('[SAML] Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ============================================
// Admin Configuration Endpoints
// ============================================

/**
 * GET /auth/saml/config/:tenantId
 * Get SAML configuration for a tenant (admin)
 */
router.get('/config/:tenantId', async (req, res) => {
  try {
    const config = await samlService.getTenantSAMLConfig(req.params.tenantId);

    if (!config) {
      return res.json({ configured: false });
    }

    // Don't expose full certificate in response
    res.json({
      configured: true,
      config: {
        ...config,
        idp_certificate: config.idp_certificate ? '[CONFIGURED]' : null
      }
    });
  } catch (error) {
    console.error('[SAML] Error getting config:', error);
    res.status(500).json({ error: 'Failed to get SAML configuration' });
  }
});

/**
 * POST /auth/saml/config/:tenantId
 * Create or update SAML configuration (admin)
 */
router.post('/config/:tenantId', async (req, res) => {
  try {
    const config = await samlService.upsertTenantSAMLConfig(
      req.params.tenantId,
      req.body
    );

    // Log configuration change
    await logSAMLEvent(req.params.tenantId, 'config_change', {
      admin_id: req.admin?.id,
      changes: Object.keys(req.body)
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('[SAML] Error saving config:', error);
    res.status(500).json({ error: error.message || 'Failed to save SAML configuration' });
  }
});

/**
 * DELETE /auth/saml/config/:tenantId
 * Delete SAML configuration (admin)
 */
router.delete('/config/:tenantId', async (req, res) => {
  try {
    await samlService.deleteTenantSAMLConfig(req.params.tenantId);

    await logSAMLEvent(req.params.tenantId, 'config_deleted', {
      admin_id: req.admin?.id
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[SAML] Error deleting config:', error);
    res.status(500).json({ error: 'Failed to delete SAML configuration' });
  }
});

/**
 * POST /auth/saml/config/:tenantId/test
 * Test SAML configuration
 */
router.post('/config/:tenantId/test', async (req, res) => {
  try {
    const results = await samlService.testSAMLConfig(req.body);
    res.json(results);
  } catch (error) {
    console.error('[SAML] Error testing config:', error);
    res.status(500).json({ error: 'Failed to test SAML configuration' });
  }
});

/**
 * POST /auth/saml/config/:tenantId/import-metadata
 * Import configuration from IdP metadata XML
 */
router.post('/config/:tenantId/import-metadata', async (req, res) => {
  try {
    const { metadata_xml, metadata_url } = req.body;

    let xml = metadata_xml;

    // Fetch from URL if provided
    if (metadata_url && !xml) {
      const response = await fetch(metadata_url);
      if (!response.ok) {
        return res.status(400).json({ error: 'Failed to fetch metadata from URL' });
      }
      xml = await response.text();
    }

    if (!xml) {
      return res.status(400).json({ error: 'metadata_xml or metadata_url is required' });
    }

    const parsed = samlService.parseIdPMetadata(xml);

    res.json({
      success: true,
      parsed,
      message: 'Metadata parsed successfully. Review and save configuration.'
    });
  } catch (error) {
    console.error('[SAML] Error importing metadata:', error);
    res.status(400).json({ error: error.message || 'Failed to parse IdP metadata' });
  }
});

/**
 * GET /auth/saml/tenants
 * List all SAML-enabled tenants (admin)
 */
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await samlService.listSAMLTenants();
    res.json({ tenants });
  } catch (error) {
    console.error('[SAML] Error listing tenants:', error);
    res.status(500).json({ error: 'Failed to list SAML tenants' });
  }
});

/**
 * GET /auth/saml/audit/:tenantId
 * Get SAML audit log for a tenant
 */
router.get('/audit/:tenantId', async (req, res) => {
  try {
    const { limit = 100, offset = 0, event_type } = req.query;
    const { pool } = await import('../db.js');

    let query = `
      SELECT * FROM saml_audit_log
      WHERE tenant_id = $1
    `;
    const params = [req.params.tenantId];

    if (event_type) {
      query += ' AND event_type = $2';
      params.push(event_type);
    }

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

    const result = await pool.query(query, params);
    res.json({ events: result.rows });
  } catch (error) {
    console.error('[SAML] Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ============================================
// Helper Functions
// ============================================

async function logSAMLEvent(tenantId, eventType, data) {
  try {
    const { pool } = await import('../db.js');
    await pool.query(`
      INSERT INTO saml_audit_log (
        tenant_id, event_type, user_email, name_id, idp_entity_id,
        request_id, response_id, error_message, ip_address, user_agent, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      tenantId,
      eventType,
      data.user_email,
      data.name_id,
      data.idp_entity_id,
      data.request_id,
      data.response_id,
      data.error,
      data.ip_address,
      data.user_agent,
      JSON.stringify(data)
    ]);
  } catch (error) {
    console.error('[SAML] Error logging event:', error);
  }
}

function mapSAMLRoleToAppRole(samlRole) {
  if (!samlRole) return 'user';

  const roleMapping = {
    'admin': 'admin',
    'administrator': 'admin',
    'supervisor': 'supervisor',
    'manager': 'supervisor',
    'agent': 'agent',
    'user': 'user'
  };

  const lowerRole = samlRole.toLowerCase();
  return roleMapping[lowerRole] || 'user';
}

export default router;
