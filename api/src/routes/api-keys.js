/**
 * API Keys Routes
 * Handles API key creation, listing, and revocation
 * Created: Week 19 - Voice Testing (Missing Endpoint)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as apiKeysService from '../services/api-keys.js';
import { apiKeyCreationRateLimit } from '../middleware/rate-limit.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const apiKeys = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

// =============================================================================
// Middleware - Extract Tenant ID from JWT
// =============================================================================

/**
 * Middleware to extract tenant_id from JWT token
 * Assumes JWT middleware has already validated and attached user to c.var
 */
async function extractTenantId(c, next) {
  // Check if we have a user from JWT middleware
  const user = c.get('user');

  if (!user || !user.tenantId) {
    return c.json({
      error: 'Unauthorized',
      message: 'Missing or invalid authentication token',
      code: 'MISSING_TENANT_ID'
    }, 401);
  }

  c.set('tenantId', user.tenantId);
  await next();
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /v1/api-keys
 * Create a new API key
 * Rate limited: 10 keys per hour per tenant
 */
apiKeys.post('/', authenticateJWT, apiKeyCreationRateLimit, extractTenantId, async (c) => {
  try {
    const body = await c.req.json();
    const validation = createKeySchema.safeParse(body);

    if (!validation.success) {
      return c.json({
        error: 'Validation error',
        details: validation.error.errors,
      }, 400);
    }

    const { name, description } = validation.data;
    const tenantId = c.get('tenantId');

    const apiKey = await apiKeysService.createApiKey(tenantId, name, description);

    return c.json({
      success: true,
      message: 'API key created successfully',
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key_full, // Full key only shown once
        key_prefix: apiKey.key_prefix,
        created_at: apiKey.created_at,
      },
    }, 201);
  } catch (error) {
    console.error('Error creating API key:', error);
    return c.json({
      error: 'Failed to create API key',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /v1/api-keys
 * List all API keys for the authenticated tenant
 */
apiKeys.get('/', authenticateJWT, extractTenantId, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const keys = await apiKeysService.getApiKeys(tenantId);

    return c.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return c.json({
      error: 'Failed to fetch API keys',
      message: error.message,
    }, 500);
  }
});

/**
 * DELETE /v1/api-keys/:id
 * Revoke (deactivate) an API key
 */
apiKeys.delete('/:id', authenticateJWT, extractTenantId, async (c) => {
  try {
    const keyId = c.req.param('id');
    const tenantId = c.get('tenantId');

    const success = await apiKeysService.revokeApiKey(tenantId, keyId);

    if (!success) {
      return c.json({
        error: 'API key not found',
        message: 'The specified API key does not exist or does not belong to your tenant',
      }, 404);
    }

    return c.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return c.json({
      error: 'Failed to revoke API key',
      message: error.message,
    }, 500);
  }
});

export default apiKeys;
