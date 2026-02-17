/**
 * CRM Integrations Service
 * Handles OAuth, sync, and field mapping for Salesforce, HubSpot, Zendesk
 */

import pool from '../db.js';
import crypto from 'crypto';

// Provider OAuth configurations (would come from env in production)
const PROVIDERS = {
  salesforce: {
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token', 'openid'],
    clientId: process.env.SALESFORCE_CLIENT_ID,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
  },
  hubspot: {
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['contacts', 'content', 'tickets'],
    clientId: process.env.HUBSPOT_CLIENT_ID,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  },
  zendesk: {
    authUrl: 'https://{subdomain}.zendesk.com/oauth/authorizations/new',
    tokenUrl: 'https://{subdomain}.zendesk.com/oauth/tokens',
    scopes: ['read', 'write', 'tickets:read', 'tickets:write'],
    clientId: process.env.ZENDESK_CLIENT_ID,
    clientSecret: process.env.ZENDESK_CLIENT_SECRET,
  },
  intercom: {
    authUrl: 'https://app.intercom.com/oauth',
    tokenUrl: 'https://api.intercom.io/auth/eagle/token',
    scopes: [],
    clientId: process.env.INTERCOM_CLIENT_ID,
    clientSecret: process.env.INTERCOM_CLIENT_SECRET,
  },
};

// =============================================================================
// CONNECTIONS
// =============================================================================

export async function listConnections(tenantId) {
  const result = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM crm_linked_records WHERE connection_id = c.id) as linked_records,
            (SELECT COUNT(*) FROM crm_field_mappings WHERE connection_id = c.id) as mappings_count
     FROM crm_connections c
     WHERE c.tenant_id = $1
     ORDER BY c.provider`,
    [tenantId]
  );
  return result.rows;
}

export async function getConnection(tenantId, connectionId) {
  const result = await pool.query(
    `SELECT * FROM crm_connections WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]
  );
  return result.rows[0];
}

export async function getConnectionByProvider(tenantId, provider) {
  const result = await pool.query(
    `SELECT * FROM crm_connections WHERE tenant_id = $1 AND provider = $2`,
    [tenantId, provider]
  );
  return result.rows[0];
}

export async function updateConnectionStatus(tenantId, connectionId, status, error = null) {
  const result = await pool.query(
    `UPDATE crm_connections SET
       status = $3,
       sync_error = $4,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [connectionId, tenantId, status, error]
  );
  return result.rows[0];
}

export async function disconnectCRM(tenantId, connectionId) {
  await pool.query(
    `UPDATE crm_connections SET
       status = 'disconnected',
       access_token = NULL,
       refresh_token = NULL,
       token_expires_at = NULL,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]
  );
}

// =============================================================================
// OAUTH FLOW
// =============================================================================

export function getOAuthUrl(provider, redirectUri, state) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  let authUrl = config.authUrl;

  // Zendesk requires subdomain
  if (provider === 'zendesk') {
    // Subdomain would be provided in the request
    authUrl = authUrl.replace('{subdomain}', 'your-subdomain');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });

  return `${authUrl}?${params.toString()}`;
}

export async function createOAuthState(tenantId, provider, redirectUri, initiatedBy) {
  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await pool.query(
    `INSERT INTO crm_oauth_states (tenant_id, provider, state_token, redirect_uri, initiated_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, provider, stateToken, redirectUri, initiatedBy, expiresAt]
  );

  return stateToken;
}

export async function validateOAuthState(stateToken) {
  const result = await pool.query(
    `SELECT * FROM crm_oauth_states WHERE state_token = $1 AND expires_at > NOW()`,
    [stateToken]
  );

  if (!result.rows[0]) {
    throw new Error('Invalid or expired OAuth state');
  }

  // Delete used state
  await pool.query('DELETE FROM crm_oauth_states WHERE state_token = $1', [stateToken]);

  return result.rows[0];
}

export async function exchangeOAuthCode(provider, code, redirectUri) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth token exchange failed: ${error}`);
  }

  return response.json();
}

export async function saveOAuthTokens(tenantId, provider, tokenData, connectedBy) {
  const {
    access_token,
    refresh_token,
    expires_in,
    instance_url,
    ...metadata
  } = tokenData;

  const expiresAt = expires_in
    ? new Date(Date.now() + expires_in * 1000)
    : null;

  const result = await pool.query(
    `INSERT INTO crm_connections (tenant_id, provider, status, instance_url, access_token, refresh_token, token_expires_at, metadata, connected_by, connected_at)
     VALUES ($1, $2, 'connected', $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET
       status = 'connected',
       instance_url = COALESCE($3, crm_connections.instance_url),
       access_token = $4,
       refresh_token = COALESCE($5, crm_connections.refresh_token),
       token_expires_at = $6,
       metadata = crm_connections.metadata || $7,
       connected_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [tenantId, provider, instance_url, access_token, refresh_token, expiresAt, JSON.stringify(metadata), connectedBy]
  );

  return result.rows[0];
}

export async function refreshOAuthToken(connectionId) {
  const connResult = await pool.query(
    `SELECT * FROM crm_connections WHERE id = $1`,
    [connectionId]
  );

  const connection = connResult.rows[0];
  if (!connection || !connection.refresh_token) {
    throw new Error('Cannot refresh: no refresh token');
  }

  const config = PROVIDERS[connection.provider];
  if (!config) throw new Error(`Unknown provider: ${connection.provider}`);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: connection.refresh_token,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    await updateConnectionStatus(connection.tenant_id, connectionId, 'error', 'Token refresh failed');
    throw new Error('Token refresh failed');
  }

  const tokenData = await response.json();

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await pool.query(
    `UPDATE crm_connections SET
       access_token = $2,
       refresh_token = COALESCE($3, refresh_token),
       token_expires_at = $4,
       status = 'connected',
       sync_error = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [connectionId, tokenData.access_token, tokenData.refresh_token, expiresAt]
  );

  return tokenData.access_token;
}

// =============================================================================
// FIELD MAPPINGS
// =============================================================================

export async function getFieldMappings(tenantId, connectionId) {
  const result = await pool.query(
    `SELECT m.*,
            (SELECT json_agg(d.*) FROM crm_field_mapping_details d WHERE d.mapping_id = m.id) as fields
     FROM crm_field_mappings m
     JOIN crm_connections c ON m.connection_id = c.id
     WHERE m.connection_id = $1 AND c.tenant_id = $2
     ORDER BY m.irisx_object`,
    [connectionId, tenantId]
  );
  return result.rows;
}

export async function createFieldMapping(tenantId, connectionId, data) {
  // Verify connection belongs to tenant
  const check = await pool.query(
    `SELECT id FROM crm_connections WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]
  );
  if (!check.rows[0]) throw new Error('Connection not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mappingResult = await client.query(
      `INSERT INTO crm_field_mappings (connection_id, irisx_object, crm_object, mapping_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (connection_id, irisx_object)
       DO UPDATE SET crm_object = $3, mapping_type = $4, updated_at = NOW()
       RETURNING *`,
      [connectionId, data.irisx_object, data.crm_object, data.mapping_type || 'sync']
    );

    const mapping = mappingResult.rows[0];

    // Delete existing field details
    await client.query('DELETE FROM crm_field_mapping_details WHERE mapping_id = $1', [mapping.id]);

    // Insert new field mappings
    if (data.fields && data.fields.length > 0) {
      for (const field of data.fields) {
        await client.query(
          `INSERT INTO crm_field_mapping_details (mapping_id, irisx_field, crm_field, direction, transform_function, default_value, is_required)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [mapping.id, field.irisx_field, field.crm_field, field.direction || 'bidirectional', field.transform_function, field.default_value, field.is_required || false]
        );
      }
    }

    await client.query('COMMIT');
    return mapping;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteFieldMapping(tenantId, mappingId) {
  await pool.query(
    `DELETE FROM crm_field_mappings
     WHERE id = $1
     AND connection_id IN (SELECT id FROM crm_connections WHERE tenant_id = $2)`,
    [mappingId, tenantId]
  );
}

export async function getMappingTemplates(provider) {
  const result = await pool.query(
    `SELECT * FROM crm_mapping_templates WHERE provider = $1`,
    [provider]
  );
  return result.rows;
}

// =============================================================================
// SYNC OPERATIONS
// =============================================================================

export async function startSync(connectionId, syncType, objectType) {
  const result = await pool.query(
    `INSERT INTO crm_sync_logs (connection_id, sync_type, direction, object_type, started_at)
     VALUES ($1, $2, 'outbound', $3, NOW())
     RETURNING *`,
    [connectionId, syncType, objectType]
  );
  return result.rows[0];
}

export async function completeSync(syncLogId, stats) {
  await pool.query(
    `UPDATE crm_sync_logs SET
       status = 'completed',
       records_processed = $2,
       records_created = $3,
       records_updated = $4,
       records_failed = $5,
       error_details = $6,
       completed_at = NOW()
     WHERE id = $1`,
    [syncLogId, stats.processed, stats.created, stats.updated, stats.failed, JSON.stringify(stats.errors || [])]
  );
}

export async function failSync(syncLogId, error) {
  await pool.query(
    `UPDATE crm_sync_logs SET
       status = 'failed',
       error_details = $2,
       completed_at = NOW()
     WHERE id = $1`,
    [syncLogId, JSON.stringify([{ message: error }])]
  );
}

export async function getSyncLogs(tenantId, connectionId, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT s.*
     FROM crm_sync_logs s
     JOIN crm_connections c ON s.connection_id = c.id
     WHERE s.connection_id = $1 AND c.tenant_id = $2
     ORDER BY s.started_at DESC
     LIMIT $3 OFFSET $4`,
    [connectionId, tenantId, limit, offset]
  );
  return result.rows;
}

// =============================================================================
// LINKED RECORDS
// =============================================================================

export async function getLinkedRecord(connectionId, irisxObject, irisxId) {
  const result = await pool.query(
    `SELECT * FROM crm_linked_records
     WHERE connection_id = $1 AND irisx_object = $2 AND irisx_id = $3`,
    [connectionId, irisxObject, irisxId]
  );
  return result.rows[0];
}

export async function linkRecord(connectionId, irisxObject, irisxId, crmObject, crmId) {
  const result = await pool.query(
    `INSERT INTO crm_linked_records (connection_id, irisx_object, irisx_id, crm_object, crm_id, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (connection_id, irisx_object, irisx_id)
     DO UPDATE SET crm_id = $5, last_synced_at = NOW(), sync_status = 'synced', updated_at = NOW()
     RETURNING *`,
    [connectionId, irisxObject, irisxId, crmObject, crmId]
  );
  return result.rows[0];
}

export async function getLinkedRecords(tenantId, connectionId, irisxObject, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT lr.*
     FROM crm_linked_records lr
     JOIN crm_connections c ON lr.connection_id = c.id
     WHERE lr.connection_id = $1 AND c.tenant_id = $2
     AND ($3::varchar IS NULL OR lr.irisx_object = $3)
     ORDER BY lr.last_synced_at DESC
     LIMIT $4 OFFSET $5`,
    [connectionId, tenantId, irisxObject, limit, offset]
  );
  return result.rows;
}

// =============================================================================
// AUTOMATION RULES
// =============================================================================

export async function listAutomationRules(tenantId, connectionId) {
  const result = await pool.query(
    `SELECT r.*
     FROM crm_automation_rules r
     JOIN crm_connections c ON r.connection_id = c.id
     WHERE r.connection_id = $1 AND c.tenant_id = $2
     ORDER BY r.name`,
    [connectionId, tenantId]
  );
  return result.rows;
}

export async function createAutomationRule(tenantId, connectionId, data, createdBy) {
  const check = await pool.query(
    `SELECT id FROM crm_connections WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]
  );
  if (!check.rows[0]) throw new Error('Connection not found');

  const result = await pool.query(
    `INSERT INTO crm_automation_rules (connection_id, name, trigger_event, action_type, target_object, field_mappings, conditions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [connectionId, data.name, data.trigger_event, data.action_type, data.target_object, JSON.stringify(data.field_mappings || {}), JSON.stringify(data.conditions || {}), createdBy]
  );
  return result.rows[0];
}

export async function updateAutomationRule(tenantId, ruleId, data) {
  const result = await pool.query(
    `UPDATE crm_automation_rules SET
       name = COALESCE($3, name),
       trigger_event = COALESCE($4, trigger_event),
       action_type = COALESCE($5, action_type),
       target_object = COALESCE($6, target_object),
       field_mappings = COALESCE($7, field_mappings),
       conditions = COALESCE($8, conditions),
       is_active = COALESCE($9, is_active),
       updated_at = NOW()
     WHERE id = $1
     AND connection_id IN (SELECT id FROM crm_connections WHERE tenant_id = $2)
     RETURNING *`,
    [ruleId, tenantId, data.name, data.trigger_event, data.action_type, data.target_object, data.field_mappings ? JSON.stringify(data.field_mappings) : null, data.conditions ? JSON.stringify(data.conditions) : null, data.is_active]
  );
  return result.rows[0];
}

export async function deleteAutomationRule(tenantId, ruleId) {
  await pool.query(
    `DELETE FROM crm_automation_rules
     WHERE id = $1
     AND connection_id IN (SELECT id FROM crm_connections WHERE tenant_id = $2)`,
    [ruleId, tenantId]
  );
}

// =============================================================================
// CRM API HELPERS (provider-specific implementations)
// =============================================================================

async function getValidToken(connection) {
  // Check if token needs refresh
  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    return refreshOAuthToken(connection.id);
  }
  return connection.access_token;
}

export async function fetchCRMContacts(connection, limit = 100) {
  const token = await getValidToken(connection);

  switch (connection.provider) {
    case 'salesforce':
      return fetchSalesforceContacts(connection.instance_url, token, limit);
    case 'hubspot':
      return fetchHubSpotContacts(token, limit);
    case 'zendesk':
      return fetchZendeskUsers(connection.instance_url, token, limit);
    default:
      throw new Error(`Fetch not implemented for ${connection.provider}`);
  }
}

async function fetchSalesforceContacts(instanceUrl, token, limit) {
  const query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title, Account.Name FROM Contact LIMIT ${limit}`;
  const response = await fetch(
    `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) throw new Error('Salesforce API error');
  const data = await response.json();
  return data.records;
}

async function fetchHubSpotContacts(token, limit) {
  const response = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,phone,company`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) throw new Error('HubSpot API error');
  const data = await response.json();
  return data.results;
}

async function fetchZendeskUsers(instanceUrl, token, limit) {
  const response = await fetch(
    `${instanceUrl}/api/v2/users.json?per_page=${limit}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) throw new Error('Zendesk API error');
  const data = await response.json();
  return data.users;
}

export async function pushContactToCRM(connection, contact) {
  const token = await getValidToken(connection);

  switch (connection.provider) {
    case 'salesforce':
      return pushToSalesforce(connection.instance_url, token, 'Contact', contact);
    case 'hubspot':
      return pushToHubSpot(token, 'contacts', contact);
    default:
      throw new Error(`Push not implemented for ${connection.provider}`);
  }
}

async function pushToSalesforce(instanceUrl, token, objectType, data) {
  const response = await fetch(
    `${instanceUrl}/services/data/v58.0/sobjects/${objectType}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error[0]?.message || 'Salesforce create failed');
  }

  return response.json();
}

async function pushToHubSpot(token, objectType, data) {
  const response = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: data }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'HubSpot create failed');
  }

  return response.json();
}
