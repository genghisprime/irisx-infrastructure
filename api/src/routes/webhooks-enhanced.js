import { Hono } from 'hono';
import WebhooksService from '../services/webhooks.js';
import { z } from 'zod';

const app = new Hono();
const webhooksService = new WebhooksService();

// Validation schemas
const createEndpointSchema = z.object({
  tenant_id: z.number().int().positive(),
  url: z.string().url(),
  description: z.string().max(500).optional(),
  subscribed_events: z.array(z.string()).min(1),
  max_retries: z.number().int().min(0).max(10).optional().default(3),
  retry_delay_seconds: z.number().int().min(1).max(3600).optional().default(60),
  timeout_seconds: z.number().int().min(1).max(60).optional().default(10),
  headers: z.record(z.string()).optional(),
  ip_whitelist: z.array(z.string()).optional(),
  auto_disable_after_failures: z.number().int().min(1).optional().default(10),
});

const updateEndpointSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
  subscribed_events: z.array(z.string()).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  retry_delay_seconds: z.number().int().min(1).max(3600).optional(),
  timeout_seconds: z.number().int().min(1).max(60).optional(),
  headers: z.record(z.string()).optional(),
  ip_whitelist: z.array(z.string()).optional(),
  auto_disable_after_failures: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
});

const testDeliverySchema = z.object({
  event_type: z.string(),
  test_payload: z.record(z.any()).optional(),
});

/**
 * POST /v1/webhooks/endpoints
 * Create a new webhook endpoint
 */
app.post('/endpoints', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createEndpointSchema.parse(body);

    const endpoint = await webhooksService.createEndpoint(validatedData);

    return c.json({
      success: true,
      data: endpoint,
      message: 'Webhook endpoint created successfully. Save the secret_key securely - it will not be shown again.',
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error creating webhook endpoint:', error);
    return c.json({
      success: false,
      error: 'Failed to create webhook endpoint',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/endpoints
 * List webhook endpoints for a tenant
 */
app.get('/endpoints', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const endpoints = await webhooksService.getEndpoints(tenant_id);

    return c.json({
      success: true,
      data: endpoints,
    });
  } catch (error) {
    console.error('Error listing webhook endpoints:', error);
    return c.json({
      success: false,
      error: 'Failed to list webhook endpoints',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/endpoints/:id
 * Get a single webhook endpoint
 */
app.get('/endpoints/:id', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    const endpoint = await webhooksService.getEndpoint(endpointId);

    if (!endpoint) {
      return c.json({
        success: false,
        error: 'Webhook endpoint not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: endpoint,
    });
  } catch (error) {
    console.error('Error fetching webhook endpoint:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch webhook endpoint',
    }, 500);
  }
});

/**
 * PATCH /v1/webhooks/endpoints/:id
 * Update a webhook endpoint
 */
app.patch('/endpoints/:id', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validatedData = updateEndpointSchema.parse(body);

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    const endpoint = await webhooksService.updateEndpoint(endpointId, validatedData);

    if (!endpoint) {
      return c.json({
        success: false,
        error: 'Webhook endpoint not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: endpoint,
      message: 'Webhook endpoint updated successfully',
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error updating webhook endpoint:', error);
    return c.json({
      success: false,
      error: 'Failed to update webhook endpoint',
    }, 500);
  }
});

/**
 * DELETE /v1/webhooks/endpoints/:id
 * Delete a webhook endpoint
 */
app.delete('/endpoints/:id', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    await webhooksService.deleteEndpoint(endpointId);

    return c.json({
      success: true,
      message: 'Webhook endpoint deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting webhook endpoint:', error);
    return c.json({
      success: false,
      error: 'Failed to delete webhook endpoint',
    }, 500);
  }
});

/**
 * POST /v1/webhooks/endpoints/:id/rotate-secret
 * Rotate the secret key for a webhook endpoint
 */
app.post('/endpoints/:id/rotate-secret', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    const newSecret = await webhooksService.rotateSecret(endpointId);

    return c.json({
      success: true,
      data: {
        endpoint_id: endpointId,
        new_secret_key: newSecret,
      },
      message: 'Secret key rotated successfully. Save the new key securely - it will not be shown again.',
    });
  } catch (error) {
    console.error('Error rotating secret key:', error);
    return c.json({
      success: false,
      error: 'Failed to rotate secret key',
    }, 500);
  }
});

/**
 * POST /v1/webhooks/endpoints/:id/test
 * Test webhook delivery
 */
app.post('/endpoints/:id/test', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const { event_type, test_payload } = testDeliverySchema.parse(body);

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    const delivery = await webhooksService.testDelivery(endpointId, event_type, test_payload);

    return c.json({
      success: true,
      data: delivery,
      message: 'Test webhook queued for delivery',
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error testing webhook:', error);
    return c.json({
      success: false,
      error: 'Failed to test webhook',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/deliveries
 * List webhook deliveries with filtering
 */
app.get('/deliveries', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));
    const webhook_endpoint_id = c.req.query('endpoint_id') ? parseInt(c.req.query('endpoint_id')) : undefined;
    const status = c.req.query('status');
    const event_type = c.req.query('event_type');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const filters = {
      tenant_id,
      webhook_endpoint_id,
      status,
      event_type,
    };

    const deliveries = await webhooksService.getDeliveries(filters, limit, offset);

    return c.json({
      success: true,
      data: deliveries,
      pagination: {
        limit,
        offset,
        count: deliveries.length,
      },
    });
  } catch (error) {
    console.error('Error listing webhook deliveries:', error);
    return c.json({
      success: false,
      error: 'Failed to list webhook deliveries',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/deliveries/:id
 * Get a single webhook delivery
 */
app.get('/deliveries/:id', async (c) => {
  try {
    const deliveryId = parseInt(c.req.param('id'));

    if (!deliveryId) {
      return c.json({
        success: false,
        error: 'Invalid delivery ID',
      }, 400);
    }

    const delivery = await webhooksService.getDelivery(deliveryId);

    if (!delivery) {
      return c.json({
        success: false,
        error: 'Webhook delivery not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: delivery,
    });
  } catch (error) {
    console.error('Error fetching webhook delivery:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch webhook delivery',
    }, 500);
  }
});

/**
 * POST /v1/webhooks/deliveries/:id/retry
 * Manually retry a failed webhook delivery
 */
app.post('/deliveries/:id/retry', async (c) => {
  try {
    const deliveryId = parseInt(c.req.param('id'));

    if (!deliveryId) {
      return c.json({
        success: false,
        error: 'Invalid delivery ID',
      }, 400);
    }

    const delivery = await webhooksService.retryDelivery(deliveryId);

    if (!delivery) {
      return c.json({
        success: false,
        error: 'Webhook delivery not found or cannot be retried',
      }, 404);
    }

    return c.json({
      success: true,
      data: delivery,
      message: 'Webhook delivery queued for retry',
    });
  } catch (error) {
    console.error('Error retrying webhook delivery:', error);
    return c.json({
      success: false,
      error: 'Failed to retry webhook delivery',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/endpoints/:id/stats
 * Get delivery statistics for a webhook endpoint
 */
app.get('/endpoints/:id/stats', async (c) => {
  try {
    const endpointId = parseInt(c.req.param('id'));
    const days = parseInt(c.req.query('days') || '30');

    if (!endpointId) {
      return c.json({
        success: false,
        error: 'Invalid endpoint ID',
      }, 400);
    }

    const stats = await webhooksService.getEndpointStats(endpointId, days);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching endpoint stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch endpoint stats',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/events
 * List all available webhook event types
 */
app.get('/events', async (c) => {
  try {
    const events = await webhooksService.getAvailableEvents();

    return c.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error('Error listing webhook events:', error);
    return c.json({
      success: false,
      error: 'Failed to list webhook events',
    }, 500);
  }
});

/**
 * GET /v1/webhooks/health
 * Get webhook system health overview
 */
app.get('/health', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const health = await webhooksService.getSystemHealth(tenant_id);

    return c.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Error fetching webhook system health:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch system health',
    }, 500);
  }
});

export default app;
