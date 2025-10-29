import { Hono } from 'hono';
import { query } from '../db/connection.js';
import carrierRouting from '../services/carrierRouting.js';
import { z } from 'zod';

const app = new Hono();

/**
 * Carrier Management API
 * Full CRUD operations for managing voice carriers via admin interface
 *
 * Supports: Twilio, Telnyx, Bandwidth, SignalWire, Vonage, Plivo, and custom SIP carriers
 */

// Validation schemas
const createCarrierSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['twilio', 'telnyx', 'bandwidth', 'signalwire', 'vonage', 'plivo', 'custom']),
  status: z.enum(['active', 'disabled', 'testing']).optional().default('testing'),
  priority: z.number().int().min(1).max(100).optional().default(1),
  weight: z.number().int().min(0).max(100).optional().default(100),

  // SIP Configuration
  sip_domain: z.string().min(5).max(255),
  sip_username: z.string().max(255).optional(),
  sip_password: z.string().max(255).optional(),
  sip_proxy: z.string().max(255).optional(),
  sip_port: z.number().int().min(1).max(65535).optional().default(5060),

  // API Credentials (for REST API carriers like Twilio)
  api_key: z.string().max(500).optional(),
  api_secret: z.string().max(500).optional(),
  account_sid: z.string().max(255).optional(),

  // Pricing
  default_rate_per_minute: z.number().min(0).max(10).optional().default(0.01),
  connection_fee: z.number().min(0).max(1).optional().default(0),
  billing_increment_seconds: z.number().int().min(1).max(60).optional().default(6),

  // Capacity and limits
  max_concurrent_calls: z.number().int().min(1).max(10000).optional(),

  // Metadata
  metadata: z.record(z.any()).optional().default({}),
});

const updateCarrierSchema = createCarrierSchema.partial();

const createRateSchema = z.object({
  carrier_id: z.number().int().positive(),
  destination_prefix: z.string().min(1).max(20),
  destination_name: z.string().max(100).optional(),
  rate_per_minute: z.number().min(0).max(10),
  connection_fee: z.number().min(0).max(1).optional().default(0),
  billing_increment_seconds: z.number().int().min(1).max(60).optional().default(6),
  effective_date: z.string().optional(), // ISO date string
  expires_at: z.string().optional(), // ISO date string
});

const bulkRatesSchema = z.object({
  carrier_id: z.number().int().positive(),
  rates: z.array(z.object({
    destination_prefix: z.string().min(1).max(20),
    destination_name: z.string().max(100).optional(),
    rate_per_minute: z.number().min(0).max(10),
    connection_fee: z.number().min(0).max(1).optional().default(0),
  })),
  effective_date: z.string().optional(),
});

/**
 * POST /v1/carriers
 * Create a new carrier
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createCarrierSchema.parse(body);

    // Check if carrier name already exists
    const existingCarrier = await query(
      'SELECT id FROM carriers WHERE name = $1',
      [validatedData.name]
    );

    if (existingCarrier.rows.length > 0) {
      return c.json({
        success: false,
        error: 'Carrier with this name already exists',
      }, 409);
    }

    // Insert carrier
    const result = await query(`
      INSERT INTO carriers (
        name, type, status, priority, weight,
        sip_domain, sip_username, sip_password, sip_proxy, sip_port,
        api_key, api_secret, account_sid,
        default_rate_per_minute, connection_fee, billing_increment_seconds,
        max_concurrent_calls, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      validatedData.name,
      validatedData.type,
      validatedData.status,
      validatedData.priority,
      validatedData.weight,
      validatedData.sip_domain,
      validatedData.sip_username,
      validatedData.sip_password,
      validatedData.sip_proxy,
      validatedData.sip_port,
      validatedData.api_key,
      validatedData.api_secret,
      validatedData.account_sid,
      validatedData.default_rate_per_minute,
      validatedData.connection_fee || 0,
      validatedData.billing_increment_seconds,
      validatedData.max_concurrent_calls,
      JSON.stringify(validatedData.metadata),
    ]);

    const carrier = result.rows[0];

    // Mask sensitive data in response
    const safeCarrier = {
      ...carrier,
      sip_password: carrier.sip_password ? '***MASKED***' : null,
      api_secret: carrier.api_secret ? '***MASKED***' : null,
    };

    return c.json({
      success: true,
      data: safeCarrier,
      message: 'Carrier created successfully',
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error creating carrier:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to create carrier',
    }, 500);
  }
});

/**
 * GET /v1/carriers
 * List all carriers with optional filtering
 */
app.get('/', async (c) => {
  try {
    const status = c.req.query('status');
    const type = c.req.query('type');
    const includeDisabled = c.req.query('include_disabled') === 'true';

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    } else if (!includeDisabled) {
      conditions.push(`status != 'disabled'`);
    }

    if (type) {
      conditions.push(`type = $${paramCount}`);
      params.push(type);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT
        id, name, type, status, priority, weight,
        sip_domain, sip_username, sip_proxy, sip_port,
        account_sid,
        default_rate_per_minute, connection_fee, billing_increment_seconds,
        health_score, consecutive_failures, total_calls, failed_calls,
        max_concurrent_calls,
        metadata,
        created_at, updated_at,
        last_health_check_at
      FROM carriers
      ${whereClause}
      ORDER BY priority ASC, name ASC
    `, params);

    return c.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
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
 * GET /v1/carriers/:id
 * Get a single carrier by ID
 */
app.get('/:id', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const result = await query(`
      SELECT
        id, name, type, status, priority, weight,
        sip_domain, sip_username, sip_proxy, sip_port,
        account_sid,
        default_rate_per_minute, connection_fee, billing_increment_seconds,
        health_score, consecutive_failures, total_calls, failed_calls,
        max_concurrent_calls,
        metadata,
        created_at, updated_at,
        last_health_check_at
      FROM carriers
      WHERE id = $1
    `, [carrierId]);

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Carrier not found',
      }, 404);
    }

    const carrier = result.rows[0];

    // Get performance stats
    const stats = await carrierRouting.getCarrierStats(carrierId, 30);

    return c.json({
      success: true,
      data: {
        ...carrier,
        performance_30d: stats[0] || null,
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
 * PATCH /v1/carriers/:id
 * Update a carrier
 */
app.patch('/:id', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const validatedData = updateCarrierSchema.parse(body);

    // Build update query dynamically
    const fields = [];
    const params = [carrierId];
    let paramCount = 2;

    const allowedFields = [
      'name', 'type', 'status', 'priority', 'weight',
      'sip_domain', 'sip_username', 'sip_password', 'sip_proxy', 'sip_port',
      'api_key', 'api_secret', 'account_sid',
      'default_rate_per_minute', 'connection_fee', 'billing_increment_seconds',
      'max_concurrent_calls', 'metadata',
    ];

    for (const field of allowedFields) {
      if (validatedData[field] !== undefined) {
        if (field === 'metadata') {
          fields.push(`${field} = $${paramCount}`);
          params.push(JSON.stringify(validatedData[field]));
        } else {
          fields.push(`${field} = $${paramCount}`);
          params.push(validatedData[field]);
        }
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return c.json({
        success: false,
        error: 'No fields to update',
      }, 400);
    }

    fields.push('updated_at = NOW()');

    const result = await query(`
      UPDATE carriers
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Carrier not found',
      }, 404);
    }

    const carrier = result.rows[0];

    // Mask sensitive data
    const safeCarrier = {
      ...carrier,
      sip_password: carrier.sip_password ? '***MASKED***' : null,
      api_secret: carrier.api_secret ? '***MASKED***' : null,
    };

    return c.json({
      success: true,
      data: safeCarrier,
      message: 'Carrier updated successfully',
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error updating carrier:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to update carrier',
    }, 500);
  }
});

/**
 * DELETE /v1/carriers/:id
 * Delete a carrier
 */
app.delete('/:id', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    // Check if carrier has active calls
    const activeCalls = await query(
      `SELECT COUNT(*) as count FROM calls
       WHERE carrier_id = $1 AND status IN ('queued', 'ringing', 'in-progress')`,
      [carrierId]
    );

    if (parseInt(activeCalls.rows[0].count) > 0) {
      return c.json({
        success: false,
        error: 'Cannot delete carrier with active calls. Disable it instead.',
      }, 409);
    }

    const result = await query(
      'DELETE FROM carriers WHERE id = $1 RETURNING id, name',
      [carrierId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Carrier not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Carrier deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting carrier:', error);
    return c.json({
      success: false,
      error: 'Failed to delete carrier',
    }, 500);
  }
});

/**
 * POST /v1/carriers/:id/test-connection
 * Test carrier connectivity (SIP OPTIONS ping)
 */
app.post('/:id/test-connection', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const result = await carrierRouting.testCarrierHealth(carrierId);

    return c.json({
      success: result.success,
      data: result,
      message: result.success ? 'Connection test successful' : 'Connection test failed',
    }, result.success ? 200 : 503);
  } catch (error) {
    console.error('Error testing carrier connection:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to test carrier connection',
    }, 500);
  }
});

/**
 * POST /v1/carriers/:id/reset-health
 * Reset carrier health score to 100
 */
app.post('/:id/reset-health', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const result = await query(`
      UPDATE carriers
      SET
        health_score = 100,
        consecutive_failures = 0,
        last_health_check_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, health_score
    `, [carrierId]);

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Carrier not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Carrier health reset successfully',
    });
  } catch (error) {
    console.error('Error resetting carrier health:', error);
    return c.json({
      success: false,
      error: 'Failed to reset carrier health',
    }, 500);
  }
});

/**
 * GET /v1/carriers/:id/rates
 * Get all rates for a carrier
 */
app.get('/:id/rates', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));

    const result = await query(`
      SELECT
        id, carrier_id, destination_prefix, destination_name,
        rate_per_minute, connection_fee, billing_increment_seconds,
        effective_date, expires_at,
        created_at, updated_at
      FROM carrier_rates
      WHERE carrier_id = $1
        AND (expires_at IS NULL OR expires_at > CURRENT_DATE)
      ORDER BY destination_prefix ASC
    `, [carrierId]);

    return c.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching carrier rates:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch carrier rates',
    }, 500);
  }
});

/**
 * POST /v1/carriers/:id/rates
 * Add a single rate to a carrier
 */
app.post('/:id/rates', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validatedData = createRateSchema.parse({
      ...body,
      carrier_id: carrierId,
    });

    const result = await query(`
      INSERT INTO carrier_rates (
        carrier_id, destination_prefix, destination_name,
        rate_per_minute, connection_fee, billing_increment_seconds,
        effective_date, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      carrierId,
      validatedData.destination_prefix,
      validatedData.destination_name,
      validatedData.rate_per_minute,
      validatedData.connection_fee,
      validatedData.billing_increment_seconds,
      validatedData.effective_date || null,
      validatedData.expires_at || null,
    ]);

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Rate added successfully',
    }, 201);
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error adding carrier rate:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to add carrier rate',
    }, 500);
  }
});

/**
 * POST /v1/carriers/:id/rates/bulk
 * Bulk import rates for a carrier
 */
app.post('/:id/rates/bulk', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validatedData = bulkRatesSchema.parse({
      ...body,
      carrier_id: carrierId,
    });

    const { rates, effective_date } = validatedData;

    // Start transaction
    await query('BEGIN');

    try {
      const insertedRates = [];

      for (const rate of rates) {
        const result = await query(`
          INSERT INTO carrier_rates (
            carrier_id, destination_prefix, destination_name,
            rate_per_minute, connection_fee, effective_date
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (carrier_id, destination_prefix)
          DO UPDATE SET
            rate_per_minute = EXCLUDED.rate_per_minute,
            connection_fee = EXCLUDED.connection_fee,
            effective_date = EXCLUDED.effective_date,
            updated_at = NOW()
          RETURNING *
        `, [
          carrierId,
          rate.destination_prefix,
          rate.destination_name,
          rate.rate_per_minute,
          rate.connection_fee || 0,
          effective_date || null,
        ]);

        insertedRates.push(result.rows[0]);
      }

      await query('COMMIT');

      return c.json({
        success: true,
        data: {
          imported_count: insertedRates.length,
          rates: insertedRates,
        },
        message: `Successfully imported ${insertedRates.length} rates`,
      }, 201);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    console.error('Error bulk importing rates:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to bulk import rates',
    }, 500);
  }
});

/**
 * DELETE /v1/carriers/:id/rates/:rateId
 * Delete a specific rate
 */
app.delete('/:id/rates/:rateId', async (c) => {
  try {
    const carrierId = parseInt(c.req.param('id'));
    const rateId = parseInt(c.req.param('rateId'));

    const result = await query(
      'DELETE FROM carrier_rates WHERE id = $1 AND carrier_id = $2 RETURNING *',
      [rateId, carrierId]
    );

    if (result.rows.length === 0) {
      return c.json({
        success: false,
        error: 'Rate not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: result.rows[0],
      message: 'Rate deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting rate:', error);
    return c.json({
      success: false,
      error: 'Failed to delete rate',
    }, 500);
  }
});

/**
 * GET /v1/carriers/templates
 * Get carrier configuration templates
 */
app.get('/templates/list', async (c) => {
  const templates = {
    twilio: {
      name: 'Twilio',
      type: 'twilio',
      sip_domain: 'yourapp.pstn.twilio.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'sip_username', 'sip_password', 'account_sid', 'api_key', 'api_secret'],
      documentation: 'https://www.twilio.com/docs/voice/sip',
      default_rate_per_minute: 0.0085,
    },
    telnyx: {
      name: 'Telnyx',
      type: 'telnyx',
      sip_domain: 'sip.telnyx.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'sip_username', 'sip_password', 'api_key'],
      documentation: 'https://developers.telnyx.com/docs/v2/call-control',
      default_rate_per_minute: 0.004,
    },
    bandwidth: {
      name: 'Bandwidth',
      type: 'bandwidth',
      sip_domain: 'sip.bandwidth.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'sip_username', 'sip_password', 'account_sid', 'api_key', 'api_secret'],
      documentation: 'https://www.bandwidth.com/voice/',
      default_rate_per_minute: 0.005,
    },
    signalwire: {
      name: 'SignalWire',
      type: 'signalwire',
      sip_domain: 'yourspace.signalwire.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'sip_username', 'sip_password', 'api_key'],
      documentation: 'https://developer.signalwire.com/',
      default_rate_per_minute: 0.007,
    },
    vonage: {
      name: 'Vonage (Nexmo)',
      type: 'vonage',
      sip_domain: 'sip.nexmo.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'api_key', 'api_secret'],
      documentation: 'https://developer.vonage.com/voice/voice-api/overview',
      default_rate_per_minute: 0.006,
    },
    plivo: {
      name: 'Plivo',
      type: 'plivo',
      sip_domain: 'sip.plivo.com',
      sip_port: 5060,
      required_fields: ['sip_domain', 'sip_username', 'sip_password', 'api_key', 'api_secret'],
      documentation: 'https://www.plivo.com/docs/voice/getting-started/',
      default_rate_per_minute: 0.0055,
    },
    custom: {
      name: 'Custom SIP Carrier',
      type: 'custom',
      required_fields: ['name', 'sip_domain'],
      documentation: 'Custom SIP carrier - configure manually',
      default_rate_per_minute: 0.01,
    },
  };

  return c.json({
    success: true,
    data: templates,
  });
});

export default app;
