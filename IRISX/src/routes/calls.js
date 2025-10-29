import { Hono } from 'hono';
import CallsService from '../services/calls.js';
import carrierRouting from '../services/carrierRouting.js';
import { z } from 'zod';

const app = new Hono();

// Validation schemas
const createCallSchema = z.object({
  tenant_id: z.number().int().positive(),
  from_number: z.string().min(10).max(20),
  to_number: z.string().min(10).max(20),
  caller_id: z.string().min(10).max(20).optional(),
  timeout_seconds: z.number().int().min(10).max(300).optional().default(60),
  record: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional().default({}),
});

const updateCallSchema = z.object({
  status: z.enum(['queued', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy', 'cancelled']).optional(),
  duration_seconds: z.number().int().min(0).optional(),
  hangup_cause: z.string().optional(),
});

/**
 * POST /v1/calls
 * Create a new outbound call with automatic carrier selection
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createCallSchema.parse(body);

    const result = await CallsService.createCall(validatedData);

    // Get FreeSWITCH service from context
    const freeswitch = c.get('freeswitch');

    // Execute originate command on FreeSWITCH
    if (freeswitch && freeswitch.connection) {
      try {
        await freeswitch.api(result.freeswitch_command);
        console.log(`[API] FreeSWITCH originate command sent for call ${result.call.uuid}`);
      } catch (fsError) {
        console.error(`[API] FreeSWITCH command failed:`, fsError);
        // Update call as failed
        await CallsService.failCall(result.call.uuid, 'FREESWITCH_ERROR');
        return c.json({
          success: false,
          error: 'Failed to initiate call with FreeSWITCH',
          details: fsError.message,
        }, 500);
      }
    }

    return c.json({
      success: true,
      data: result.call,
      routing: result.routing,
      message: 'Call initiated successfully',
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error creating call:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to create call',
    }, 500);
  }
});

/**
 * GET /v1/calls
 * List calls with filtering and pagination
 */
app.get('/', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));
    const direction = c.req.query('direction');
    const status = c.req.query('status');
    const from_number = c.req.query('from_number');
    const to_number = c.req.query('to_number');
    const carrier_id = c.req.query('carrier_id') ? parseInt(c.req.query('carrier_id')) : undefined;
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');
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
      direction,
      status,
      from_number,
      to_number,
      carrier_id,
      start_date,
      end_date,
    };

    const calls = await CallsService.listCalls(filters, limit, offset);

    return c.json({
      success: true,
      data: calls,
      pagination: {
        limit,
        offset,
        count: calls.length,
      },
    });
  } catch (error) {
    console.error('Error listing calls:', error);
    return c.json({
      success: false,
      error: 'Failed to list calls',
    }, 500);
  }
});

/**
 * GET /v1/calls/:id
 * Get a single call by ID or UUID
 */
app.get('/:id', async (c) => {
  try {
    const identifier = c.req.param('id');

    // Try parsing as number first, otherwise treat as UUID
    const id = isNaN(identifier) ? identifier : parseInt(identifier);

    const call = await CallsService.getCall(id);

    if (!call) {
      return c.json({
        success: false,
        error: 'Call not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error('Error fetching call:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch call',
    }, 500);
  }
});

/**
 * PATCH /v1/calls/:uuid
 * Update call status
 */
app.patch('/:uuid', async (c) => {
  try {
    const uuid = c.req.param('uuid');
    const body = await c.req.json();
    const validatedData = updateCallSchema.parse(body);

    const updates = {};
    if (validatedData.duration_seconds !== undefined) {
      updates.duration_seconds = validatedData.duration_seconds;
    }
    if (validatedData.hangup_cause !== undefined) {
      updates.hangup_cause = validatedData.hangup_cause;
    }

    const call = await CallsService.updateCallStatus(uuid, validatedData.status, updates);

    if (!call) {
      return c.json({
        success: false,
        error: 'Call not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: call,
      message: 'Call updated successfully',
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error updating call:', error);
    return c.json({
      success: false,
      error: 'Failed to update call',
    }, 500);
  }
});

/**
 * POST /v1/calls/:uuid/complete
 * Complete a call and calculate final cost
 */
app.post('/:uuid/complete', async (c) => {
  try {
    const uuid = c.req.param('uuid');
    const body = await c.req.json();

    const { duration_seconds, hangup_cause = 'NORMAL_CLEARING' } = body;

    if (duration_seconds === undefined) {
      return c.json({
        success: false,
        error: 'duration_seconds is required',
      }, 400);
    }

    const call = await CallsService.completeCall(uuid, duration_seconds, hangup_cause);

    return c.json({
      success: true,
      data: call,
      message: 'Call completed successfully',
    });
  } catch (error) {
    console.error('Error completing call:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to complete call',
    }, 500);
  }
});

/**
 * POST /v1/calls/:uuid/fail
 * Mark a call as failed
 */
app.post('/:uuid/fail', async (c) => {
  try {
    const uuid = c.req.param('uuid');
    const body = await c.req.json();

    const { reason = 'CALL_REJECTED' } = body;

    const call = await CallsService.failCall(uuid, reason);

    return c.json({
      success: true,
      data: call,
      message: 'Call marked as failed',
    });
  } catch (error) {
    console.error('Error failing call:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to mark call as failed',
    }, 500);
  }
});

/**
 * GET /v1/calls/stats/summary
 * Get call statistics for a tenant
 */
app.get('/stats/summary', async (c) => {
  try {
    const tenant_id = parseInt(c.req.query('tenant_id'));
    const start_date = c.req.query('start_date');
    const end_date = c.req.query('end_date');

    if (!tenant_id) {
      return c.json({
        success: false,
        error: 'tenant_id is required',
      }, 400);
    }

    const dateRange = {
      start_date,
      end_date,
    };

    const stats = await CallsService.getCallStats(tenant_id, dateRange);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching call stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch call statistics',
    }, 500);
  }
});

/**
 * GET /v1/calls/carriers/list
 * List all active carriers
 */
app.get('/carriers/list', async (c) => {
  try {
    const status = c.req.query('status') || 'active';
    const carriers = await carrierRouting.listCarriers(status);

    return c.json({
      success: true,
      data: carriers,
    });
  } catch (error) {
    console.error('Error listing carriers:', error);
    return c.json({
      success: false,
      error: 'Failed to list carriers',
    }, 500);
  }
});

/**
 * GET /v1/calls/carriers/:id
 * Get carrier details with performance stats
 */
app.get('/carriers/:id', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const carrier = await carrierRouting.getCarrier(carrierId);

    if (!carrier) {
      return c.json({
        success: false,
        error: 'Carrier not found',
      }, 404);
    }

    const stats = await carrierRouting.getCarrierStats(carrierId);

    return c.json({
      success: true,
      data: {
        ...carrier,
        performance: stats[0] || null,
      },
    });
  } catch (error) {
    console.error('Error fetching carrier:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch carrier',
    }, 500);
  }
});

/**
 * GET /v1/calls/carriers/stats/performance
 * Get performance statistics for all carriers
 */
app.get('/carriers/stats/performance', async (c) => {
  try {
    const days = parseInt(c.req.query('days') || '30');
    const stats = await carrierRouting.getCarrierStats(null, days);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching carrier stats:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch carrier statistics',
    }, 500);
  }
});

/**
 * GET /v1/calls/routing/lowest-cost
 * Get lowest cost routes for all destinations
 */
app.get('/routing/lowest-cost', async (c) => {
  try {
    const routes = await carrierRouting.getLowestCostRoutes();

    return c.json({
      success: true,
      data: routes,
    });
  } catch (error) {
    console.error('Error fetching lowest cost routes:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch lowest cost routes',
    }, 500);
  }
});

/**
 * POST /v1/calls/routing/test
 * Test carrier selection for a destination
 */
app.post('/routing/test', async (c) => {
  try {
    const body = await c.req.json();
    const { destination_number } = body;

    if (!destination_number) {
      return c.json({
        success: false,
        error: 'destination_number is required',
      }, 400);
    }

    const routing = await carrierRouting.selectCarrier(destination_number);

    return c.json({
      success: true,
      data: routing,
      message: 'Carrier selection test successful',
    });
  } catch (error) {
    console.error('Error testing carrier selection:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to test carrier selection',
    }, 500);
  }
});

/**
 * POST /v1/calls/carriers/:id/health-test
 * Test carrier health with SIP OPTIONS
 */
app.post('/carriers/:id/health-test', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const result = await carrierRouting.testCarrierHealth(carrierId);

    return c.json({
      success: result.success,
      data: result,
      message: result.success ? 'Carrier health check passed' : 'Carrier health check failed',
    });
  } catch (error) {
    console.error('Error testing carrier health:', error);
    return c.json({
      success: false,
      error: 'Failed to test carrier health',
    }, 500);
  }
});

export default app;
