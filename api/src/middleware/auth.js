import { query } from '../db/connection.js';
import crypto from 'crypto';

export const hashApiKey = (apiKey) => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

export const authenticate = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
      code: 'MISSING_API_KEY'
    }, 401);
  }

  try {
    const keyHash = hashApiKey(apiKey);

    const result = await query(
      'SELECT ak.id, ak.tenant_id, ak.name, ak.status, ak.last_used_at, t.status as tenant_status, t.name as tenant_name FROM api_keys ak JOIN tenants t ON ak.tenant_id = t.id WHERE ak.key_hash = $1',
      [keyHash]
    );

    if (result.rows.length === 0) {
      return c.json({
        error: 'Unauthorized',
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      }, 401);
    }

    const apiKeyData = result.rows[0];

    if (apiKeyData.status !== 'active') {
      return c.json({
        error: 'Forbidden',
        message: 'API key is ' + apiKeyData.status,
        code: 'API_KEY_INACTIVE'
      }, 403);
    }

    if (apiKeyData.tenant_status !== 'active') {
      return c.json({
        error: 'Forbidden',
        message: 'Tenant account is not active',
        code: 'TENANT_INACTIVE'
      }, 403);
    }

    query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [apiKeyData.id]
    ).catch(err => console.error('Failed to update last_used_at:', err));

    c.set('tenantId', apiKeyData.tenant_id);
    c.set('apiKeyId', apiKeyData.id);
    c.set('apiKeyName', apiKeyData.name);
    c.set('tenantName', apiKeyData.tenant_name);

    await next();

  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    }, 500);
  }
};
