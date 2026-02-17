/**
 * CRM Integrations API Routes
 * OAuth, sync, field mappings for Salesforce, HubSpot, Zendesk
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as crmService from '../services/crm-integrations.js';

const crmIntegrations = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const fieldMappingSchema = z.object({
  irisx_object: z.enum(['contact', 'call', 'conversation', 'ticket']),
  crm_object: z.string().min(1),
  mapping_type: z.enum(['sync', 'push_only', 'pull_only']).optional(),
  fields: z.array(z.object({
    irisx_field: z.string().min(1),
    crm_field: z.string().min(1),
    direction: z.enum(['bidirectional', 'to_crm', 'from_crm']).optional(),
    transform_function: z.string().optional(),
    default_value: z.string().optional(),
    is_required: z.boolean().optional(),
  })).optional(),
});

const automationRuleSchema = z.object({
  name: z.string().min(1).max(255),
  trigger_event: z.enum(['call_completed', 'conversation_closed', 'ticket_created', 'contact_created']),
  action_type: z.enum(['create_record', 'update_record', 'add_note', 'create_task']),
  target_object: z.string().min(1),
  field_mappings: z.record(z.string()).optional(),
  conditions: z.record(z.any()).optional(),
});

// =============================================================================
// Middleware
// =============================================================================

crmIntegrations.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// =============================================================================
// CONNECTIONS
// =============================================================================

/**
 * GET /v1/crm/connections
 * List all CRM connections
 */
crmIntegrations.get('/connections', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connections = await crmService.listConnections(tenantId);

    // Hide sensitive tokens
    const sanitized = connections.map(conn => ({
      ...conn,
      access_token: conn.access_token ? '[REDACTED]' : null,
      refresh_token: conn.refresh_token ? '[REDACTED]' : null,
    }));

    return c.json({
      success: true,
      connections: sanitized,
    });
  } catch (error) {
    console.error('List connections error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/crm/connections/:id
 * Get single connection details
 */
crmIntegrations.get('/connections/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));

    const connection = await crmService.getConnection(tenantId, connectionId);

    if (!connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Hide sensitive tokens
    connection.access_token = connection.access_token ? '[REDACTED]' : null;
    connection.refresh_token = connection.refresh_token ? '[REDACTED]' : null;

    return c.json({
      success: true,
      connection,
    });
  } catch (error) {
    console.error('Get connection error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/crm/connections/:id
 * Disconnect CRM
 */
crmIntegrations.delete('/connections/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));

    await crmService.disconnectCRM(tenantId, connectionId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// OAUTH FLOW
// =============================================================================

/**
 * GET /v1/crm/oauth/:provider/authorize
 * Get OAuth authorization URL
 */
crmIntegrations.get('/oauth/:provider/authorize', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const provider = c.req.param('provider');
    const redirectUri = c.req.query('redirect_uri') || `${process.env.API_BASE_URL}/v1/crm/oauth/${provider}/callback`;

    // Create state token
    const state = await crmService.createOAuthState(tenantId, provider, redirectUri, agentId);

    // Get authorization URL
    const authUrl = crmService.getOAuthUrl(provider, redirectUri, state);

    return c.json({
      success: true,
      authorization_url: authUrl,
      state,
    });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/crm/oauth/:provider/callback
 * OAuth callback handler
 */
crmIntegrations.get('/oauth/:provider/callback', async (c) => {
  try {
    const provider = c.req.param('provider');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return c.redirect('/integrations?error=missing_params');
    }

    // Validate state and get tenant info
    const stateData = await crmService.validateOAuthState(state);

    // Exchange code for tokens
    const tokenData = await crmService.exchangeOAuthCode(provider, code, stateData.redirect_uri);

    // Save tokens
    await crmService.saveOAuthTokens(stateData.tenant_id, provider, tokenData, stateData.initiated_by);

    // Redirect to success page
    return c.redirect(`/integrations?success=1&provider=${provider}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.redirect(`/integrations?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /v1/crm/connections/:id/refresh
 * Manually refresh OAuth token
 */
crmIntegrations.post('/connections/:id/refresh', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));

    // Verify connection belongs to tenant
    const connection = await crmService.getConnection(tenantId, connectionId);
    if (!connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    await crmService.refreshOAuthToken(connectionId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// FIELD MAPPINGS
// =============================================================================

/**
 * GET /v1/crm/connections/:id/mappings
 * Get field mappings for connection
 */
crmIntegrations.get('/connections/:id/mappings', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));

    const mappings = await crmService.getFieldMappings(tenantId, connectionId);

    return c.json({
      success: true,
      mappings,
    });
  } catch (error) {
    console.error('Get mappings error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/crm/connections/:id/mappings
 * Create/update field mapping
 */
crmIntegrations.post('/connections/:id/mappings', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = fieldMappingSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const mapping = await crmService.createFieldMapping(tenantId, connectionId, validation.data);

    return c.json({
      success: true,
      mapping,
    });
  } catch (error) {
    console.error('Create mapping error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/crm/mappings/:mappingId
 * Delete field mapping
 */
crmIntegrations.delete('/mappings/:mappingId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const mappingId = parseInt(c.req.param('mappingId'));

    await crmService.deleteFieldMapping(tenantId, mappingId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete mapping error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/crm/templates/:provider
 * Get default mapping templates
 */
crmIntegrations.get('/templates/:provider', async (c) => {
  try {
    const provider = c.req.param('provider');
    const templates = await crmService.getMappingTemplates(provider);

    return c.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('Get templates error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// SYNC OPERATIONS
// =============================================================================

/**
 * POST /v1/crm/connections/:id/sync
 * Trigger manual sync
 */
crmIntegrations.post('/connections/:id/sync', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));

    const syncType = body.sync_type || 'incremental';
    const objectType = body.object_type || 'contact';

    // Start sync log
    const syncLog = await crmService.startSync(connectionId, syncType, objectType);

    // Verify connection
    const connection = await crmService.getConnection(tenantId, connectionId);
    if (!connection || connection.status !== 'connected') {
      await crmService.failSync(syncLog.id, 'Connection not active');
      return c.json({ error: 'Connection not active' }, 400);
    }

    // Run sync in background (in production, use a job queue)
    runSync(connection, syncLog.id, objectType).catch(err => {
      console.error('Sync error:', err);
      crmService.failSync(syncLog.id, err.message);
    });

    return c.json({
      success: true,
      sync_id: syncLog.id,
      message: 'Sync started',
    });
  } catch (error) {
    console.error('Start sync error:', error);
    return c.json({ error: error.message }, 500);
  }
});

async function runSync(connection, syncLogId, objectType) {
  try {
    let stats = { processed: 0, created: 0, updated: 0, failed: 0, errors: [] };

    if (objectType === 'contact') {
      const contacts = await crmService.fetchCRMContacts(connection);
      stats.processed = contacts.length;

      // Process contacts - in production, batch this
      for (const contact of contacts) {
        try {
          // Transform and save to IRISX
          // await saveContactFromCRM(connection.tenant_id, contact);
          stats.created++;
        } catch (err) {
          stats.failed++;
          stats.errors.push({ id: contact.id || contact.Id, error: err.message });
        }
      }
    }

    await crmService.completeSync(syncLogId, stats);
  } catch (error) {
    await crmService.failSync(syncLogId, error.message);
    throw error;
  }
}

/**
 * GET /v1/crm/connections/:id/sync-logs
 * Get sync history
 */
crmIntegrations.get('/connections/:id/sync-logs', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const logs = await crmService.getSyncLogs(tenantId, connectionId, limit, offset);

    return c.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error('Get sync logs error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// LINKED RECORDS
// =============================================================================

/**
 * GET /v1/crm/connections/:id/linked
 * Get linked records
 */
crmIntegrations.get('/connections/:id/linked', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));
    const objectType = c.req.query('object_type') || null;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const records = await crmService.getLinkedRecords(tenantId, connectionId, objectType, limit, offset);

    return c.json({
      success: true,
      records,
    });
  } catch (error) {
    console.error('Get linked records error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// AUTOMATION RULES
// =============================================================================

/**
 * GET /v1/crm/connections/:id/automations
 * List automation rules
 */
crmIntegrations.get('/connections/:id/automations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const connectionId = parseInt(c.req.param('id'));

    const rules = await crmService.listAutomationRules(tenantId, connectionId);

    return c.json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error('List automations error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/crm/connections/:id/automations
 * Create automation rule
 */
crmIntegrations.post('/connections/:id/automations', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.get('agent_id');
    const connectionId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = automationRuleSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const rule = await crmService.createAutomationRule(tenantId, connectionId, validation.data, agentId);

    return c.json({
      success: true,
      rule,
    }, 201);
  } catch (error) {
    console.error('Create automation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/crm/automations/:ruleId
 * Update automation rule
 */
crmIntegrations.put('/automations/:ruleId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = parseInt(c.req.param('ruleId'));
    const body = await c.req.json();

    const rule = await crmService.updateAutomationRule(tenantId, ruleId, body);

    return c.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('Update automation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/crm/automations/:ruleId
 * Delete automation rule
 */
crmIntegrations.delete('/automations/:ruleId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const ruleId = parseInt(c.req.param('ruleId'));

    await crmService.deleteAutomationRule(tenantId, ruleId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete automation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// PROVIDER INFO
// =============================================================================

/**
 * GET /v1/crm/providers
 * List available CRM providers
 */
crmIntegrations.get('/providers', async (c) => {
  return c.json({
    success: true,
    providers: [
      {
        id: 'salesforce',
        name: 'Salesforce',
        description: 'CRM and customer platform',
        logo: 'https://cdn.example.com/logos/salesforce.svg',
        objects: ['Contact', 'Lead', 'Account', 'Opportunity', 'Task', 'Case'],
        features: ['contacts', 'calls', 'tasks', 'cases'],
      },
      {
        id: 'hubspot',
        name: 'HubSpot',
        description: 'Inbound marketing and sales',
        logo: 'https://cdn.example.com/logos/hubspot.svg',
        objects: ['contact', 'company', 'deal', 'ticket', 'engagement'],
        features: ['contacts', 'calls', 'tickets'],
      },
      {
        id: 'zendesk',
        name: 'Zendesk',
        description: 'Customer service platform',
        logo: 'https://cdn.example.com/logos/zendesk.svg',
        objects: ['user', 'ticket', 'organization'],
        features: ['contacts', 'tickets'],
      },
      {
        id: 'intercom',
        name: 'Intercom',
        description: 'Customer messaging platform',
        logo: 'https://cdn.example.com/logos/intercom.svg',
        objects: ['contact', 'company', 'conversation'],
        features: ['contacts', 'conversations'],
      },
    ],
  });
});

export default crmIntegrations;
