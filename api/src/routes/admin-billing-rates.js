/**
 * Admin Billing Rates Management Routes
 * Cross-tenant rate table management for voice calls
 * December 3, 2025
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const app = new Hono();

// Apply admin authentication to all routes
app.use('*', authenticateAdmin);

// =============================================================================
// GET /admin/billing-rates/stats - Dashboard Statistics
// =============================================================================
app.get('/stats', async (c) => {
  try {
    // Get overall rate statistics
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_rates,
        COUNT(CASE WHEN is_active THEN 1 END) AS active_rates,
        COUNT(CASE WHEN NOT is_active THEN 1 END) AS inactive_rates,
        COUNT(DISTINCT carrier_name) AS unique_carriers,
        COUNT(DISTINCT prefix) AS unique_prefixes,
        COUNT(DISTINCT destination_name) AS unique_destinations,
        ROUND(AVG(cost_per_minute)::numeric, 6) AS avg_cost_per_minute,
        ROUND(MIN(cost_per_minute)::numeric, 6) AS min_cost_per_minute,
        ROUND(MAX(cost_per_minute)::numeric, 6) AS max_cost_per_minute,
        COUNT(CASE WHEN effective_date > NOW() THEN 1 END) AS scheduled_rates,
        COUNT(CASE WHEN expiration_date IS NOT NULL AND expiration_date < NOW() THEN 1 END) AS expired_rates
      FROM rate_tables
    `);

    // Get rates by carrier
    const byCarrierQuery = await pool.query(`
      SELECT
        COALESCE(carrier_name, 'Default') AS carrier,
        COUNT(*) AS rate_count,
        ROUND(AVG(cost_per_minute)::numeric, 6) AS avg_cost,
        COUNT(CASE WHEN is_active THEN 1 END) AS active_count
      FROM rate_tables
      GROUP BY carrier_name
      ORDER BY rate_count DESC
      LIMIT 10
    `);

    // Get rates by destination prefix (top countries)
    const byDestinationQuery = await pool.query(`
      SELECT
        LEFT(prefix, 2) AS country_code,
        destination_name,
        COUNT(*) AS rate_count,
        ROUND(MIN(cost_per_minute)::numeric, 6) AS min_cost,
        ROUND(MAX(cost_per_minute)::numeric, 6) AS max_cost
      FROM rate_tables
      WHERE is_active = true
      GROUP BY LEFT(prefix, 2), destination_name
      ORDER BY rate_count DESC
      LIMIT 15
    `);

    // Get recently added rates
    const recentQuery = await pool.query(`
      SELECT COUNT(*) AS added_7d
      FROM rate_tables
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    // Get recently modified rates
    const modifiedQuery = await pool.query(`
      SELECT COUNT(*) AS modified_7d
      FROM rate_tables
      WHERE updated_at > NOW() - INTERVAL '7 days'
        AND updated_at != created_at
    `);

    return c.json({
      success: true,
      stats: {
        ...statsQuery.rows[0],
        added_7d: recentQuery.rows[0].added_7d,
        modified_7d: modifiedQuery.rows[0].modified_7d
      },
      byCarrier: byCarrierQuery.rows,
      byDestination: byDestinationQuery.rows
    });
  } catch (error) {
    console.error('Admin billing rates stats error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/billing-rates - List All Rates
// =============================================================================
app.get('/', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 500);
    const offset = (page - 1) * limit;
    const search = c.req.query('search');
    const carrier = c.req.query('carrier');
    const isActive = c.req.query('is_active');
    const sortBy = c.req.query('sort_by') || 'prefix';
    const sortOrder = c.req.query('sort_order') || 'asc';

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereClause += ` AND (prefix ILIKE $${paramCount} OR destination_name ILIKE $${paramCount} OR carrier_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (carrier) {
      paramCount++;
      whereClause += ` AND carrier_name = $${paramCount}`;
      params.push(carrier);
    }

    if (isActive !== undefined && isActive !== '') {
      paramCount++;
      whereClause += ` AND is_active = $${paramCount}`;
      params.push(isActive === 'true');
    }

    // Validate sort column
    const validSortColumns = ['prefix', 'destination_name', 'cost_per_minute', 'carrier_name', 'effective_date', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'prefix';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Get total count
    const countQuery = await pool.query(`
      SELECT COUNT(*)
      FROM rate_tables
      ${whereClause}
    `, params);

    // Get rates
    const ratesQuery = await pool.query(`
      SELECT
        id,
        uuid,
        prefix,
        destination_name,
        cost_per_minute,
        connection_fee,
        minimum_duration,
        billing_increment,
        carrier_name,
        carrier_priority,
        effective_date,
        expiration_date,
        is_active,
        created_at,
        updated_at
      FROM rate_tables
      ${whereClause}
      ORDER BY ${sortColumn} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...params, limit, offset]);

    const total = parseInt(countQuery.rows[0].count);

    return c.json({
      success: true,
      rates: ratesQuery.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin billing rates list error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/billing-rates/:id - Get Rate Details
// =============================================================================
app.get('/:id', async (c) => {
  try {
    const rateId = c.req.param('id');

    const rateQuery = await pool.query(`
      SELECT
        id,
        uuid,
        prefix,
        destination_name,
        cost_per_minute,
        connection_fee,
        minimum_duration,
        billing_increment,
        carrier_name,
        carrier_priority,
        effective_date,
        expiration_date,
        is_active,
        created_at,
        updated_at
      FROM rate_tables
      WHERE id = $1 OR uuid::text = $1
    `, [rateId]);

    if (rateQuery.rows.length === 0) {
      return c.json({ error: 'Rate not found' }, 404);
    }

    const rate = rateQuery.rows[0];

    // Get similar rates (same prefix or destination)
    const similarQuery = await pool.query(`
      SELECT
        id,
        prefix,
        destination_name,
        cost_per_minute,
        carrier_name,
        is_active
      FROM rate_tables
      WHERE (prefix = $1 OR destination_name = $2)
        AND id != $3
        AND is_active = true
      ORDER BY cost_per_minute ASC
      LIMIT 10
    `, [rate.prefix, rate.destination_name, rate.id]);

    // Get rate history (if we had a history table, for now just return basic info)
    const historyInfo = {
      created_at: rate.created_at,
      last_updated: rate.updated_at,
      days_active: rate.effective_date ? Math.floor((new Date() - new Date(rate.effective_date)) / (1000 * 60 * 60 * 24)) : null
    };

    return c.json({
      success: true,
      rate,
      similarRates: similarQuery.rows,
      history: historyInfo
    });
  } catch (error) {
    console.error('Admin billing rate details error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/billing-rates - Create New Rate
// =============================================================================
app.post('/', async (c) => {
  try {
    const adminId = c.get('admin')?.id;
    const body = await c.req.json();

    const {
      prefix,
      destination_name,
      cost_per_minute,
      connection_fee = 0,
      minimum_duration = 0,
      billing_increment = 1,
      carrier_name,
      carrier_priority = 100,
      effective_date,
      expiration_date,
      is_active = true
    } = body;

    // Validate required fields
    if (!prefix || !destination_name || cost_per_minute === undefined) {
      return c.json({ error: 'prefix, destination_name, and cost_per_minute are required' }, 400);
    }

    // Validate cost_per_minute is a positive number
    if (isNaN(cost_per_minute) || cost_per_minute < 0) {
      return c.json({ error: 'cost_per_minute must be a positive number' }, 400);
    }

    const result = await pool.query(`
      INSERT INTO rate_tables (
        prefix,
        destination_name,
        cost_per_minute,
        connection_fee,
        minimum_duration,
        billing_increment,
        carrier_name,
        carrier_priority,
        effective_date,
        expiration_date,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `, [
      prefix,
      destination_name,
      cost_per_minute,
      connection_fee,
      minimum_duration,
      billing_increment,
      carrier_name,
      carrier_priority,
      effective_date || 'NOW()',
      expiration_date,
      is_active
    ]);

    return c.json({
      success: true,
      rate: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('Admin billing rate create error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// PATCH /admin/billing-rates/:id - Update Rate
// =============================================================================
app.patch('/:id', async (c) => {
  try {
    const rateId = c.req.param('id');
    const body = await c.req.json();

    // Check if rate exists
    const existsQuery = await pool.query(
      'SELECT id FROM rate_tables WHERE id = $1 OR uuid::text = $1',
      [rateId]
    );

    if (existsQuery.rows.length === 0) {
      return c.json({ error: 'Rate not found' }, 404);
    }

    const actualId = existsQuery.rows[0].id;

    // Build update query dynamically
    const allowedFields = [
      'prefix', 'destination_name', 'cost_per_minute', 'connection_fee',
      'minimum_duration', 'billing_increment', 'carrier_name', 'carrier_priority',
      'effective_date', 'expiration_date', 'is_active'
    ];

    const updates = [];
    const values = [];
    let paramCount = 0;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    values.push(actualId);

    const result = await pool.query(`
      UPDATE rate_tables
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    return c.json({
      success: true,
      rate: result.rows[0]
    });
  } catch (error) {
    console.error('Admin billing rate update error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// DELETE /admin/billing-rates/:id - Delete Rate
// =============================================================================
app.delete('/:id', async (c) => {
  try {
    const rateId = c.req.param('id');
    const hardDelete = c.req.query('hard') === 'true';

    if (hardDelete) {
      // Hard delete
      const result = await pool.query(`
        DELETE FROM rate_tables
        WHERE id = $1 OR uuid::text = $1
        RETURNING id, prefix, destination_name
      `, [rateId]);

      if (result.rows.length === 0) {
        return c.json({ error: 'Rate not found' }, 404);
      }

      return c.json({
        success: true,
        message: 'Rate permanently deleted',
        deleted: result.rows[0]
      });
    } else {
      // Soft delete (deactivate)
      const result = await pool.query(`
        UPDATE rate_tables
        SET is_active = false, updated_at = NOW()
        WHERE id = $1 OR uuid::text = $1
        RETURNING id, prefix, destination_name, is_active
      `, [rateId]);

      if (result.rows.length === 0) {
        return c.json({ error: 'Rate not found' }, 404);
      }

      return c.json({
        success: true,
        message: 'Rate deactivated',
        rate: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Admin billing rate delete error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/billing-rates/bulk - Bulk Create/Update Rates
// =============================================================================
app.post('/bulk', async (c) => {
  try {
    const body = await c.req.json();
    const { rates, mode = 'create' } = body;

    if (!Array.isArray(rates) || rates.length === 0) {
      return c.json({ error: 'rates array is required' }, 400);
    }

    if (rates.length > 1000) {
      return c.json({ error: 'Maximum 1000 rates per bulk operation' }, 400);
    }

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const rate of rates) {
      try {
        if (!rate.prefix || !rate.destination_name || rate.cost_per_minute === undefined) {
          results.failed++;
          results.errors.push({ rate, error: 'Missing required fields' });
          continue;
        }

        if (mode === 'upsert') {
          // Try to update existing rate by prefix and carrier, or insert new
          const upsertResult = await pool.query(`
            INSERT INTO rate_tables (
              prefix, destination_name, cost_per_minute, connection_fee,
              minimum_duration, billing_increment, carrier_name, carrier_priority,
              effective_date, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            ON CONFLICT (uuid) DO UPDATE SET
              cost_per_minute = EXCLUDED.cost_per_minute,
              connection_fee = EXCLUDED.connection_fee,
              destination_name = EXCLUDED.destination_name,
              updated_at = NOW()
            RETURNING id, (xmax = 0) AS inserted
          `, [
            rate.prefix,
            rate.destination_name,
            rate.cost_per_minute,
            rate.connection_fee || 0,
            rate.minimum_duration || 0,
            rate.billing_increment || 1,
            rate.carrier_name,
            rate.carrier_priority || 100,
            rate.effective_date || new Date(),
            rate.is_active !== false
          ]);

          if (upsertResult.rows[0]?.inserted) {
            results.created++;
          } else {
            results.updated++;
          }
        } else {
          // Create only mode
          await pool.query(`
            INSERT INTO rate_tables (
              prefix, destination_name, cost_per_minute, connection_fee,
              minimum_duration, billing_increment, carrier_name, carrier_priority,
              effective_date, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          `, [
            rate.prefix,
            rate.destination_name,
            rate.cost_per_minute,
            rate.connection_fee || 0,
            rate.minimum_duration || 0,
            rate.billing_increment || 1,
            rate.carrier_name,
            rate.carrier_priority || 100,
            rate.effective_date || new Date(),
            rate.is_active !== false
          ]);
          results.created++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ rate: { prefix: rate.prefix }, error: err.message });
      }
    }

    return c.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Admin billing rates bulk error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/billing-rates/import - Import Rates from CSV
// =============================================================================
app.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const { csv_data, has_header = true, mode = 'create' } = body;

    if (!csv_data) {
      return c.json({ error: 'csv_data is required' }, 400);
    }

    // Parse CSV
    const lines = csv_data.split('\n').filter(line => line.trim());
    const startIndex = has_header ? 1 : 0;

    if (lines.length <= startIndex) {
      return c.json({ error: 'No data rows found in CSV' }, 400);
    }

    const rates = [];
    for (let i = startIndex; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));

      // Expected format: prefix, destination_name, cost_per_minute, carrier_name, connection_fee
      if (values.length >= 3) {
        rates.push({
          prefix: values[0],
          destination_name: values[1],
          cost_per_minute: parseFloat(values[2]),
          carrier_name: values[3] || null,
          connection_fee: values[4] ? parseFloat(values[4]) : 0
        });
      }
    }

    if (rates.length === 0) {
      return c.json({ error: 'No valid rates found in CSV' }, 400);
    }

    // Use bulk import logic
    const results = {
      total_rows: rates.length,
      created: 0,
      failed: 0,
      errors: []
    };

    for (const rate of rates) {
      try {
        await pool.query(`
          INSERT INTO rate_tables (
            prefix, destination_name, cost_per_minute, connection_fee,
            carrier_name, is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        `, [
          rate.prefix,
          rate.destination_name,
          rate.cost_per_minute,
          rate.connection_fee,
          rate.carrier_name
        ]);
        results.created++;
      } catch (err) {
        results.failed++;
        if (results.errors.length < 10) {
          results.errors.push({ prefix: rate.prefix, error: err.message });
        }
      }
    }

    return c.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Admin billing rates import error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/billing-rates/export - Export Rates to CSV
// =============================================================================
app.get('/export', async (c) => {
  try {
    const carrier = c.req.query('carrier');
    const isActive = c.req.query('is_active');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (carrier) {
      paramCount++;
      whereClause += ` AND carrier_name = $${paramCount}`;
      params.push(carrier);
    }

    if (isActive !== undefined && isActive !== '') {
      paramCount++;
      whereClause += ` AND is_active = $${paramCount}`;
      params.push(isActive === 'true');
    }

    const ratesQuery = await pool.query(`
      SELECT
        prefix,
        destination_name,
        cost_per_minute,
        connection_fee,
        minimum_duration,
        billing_increment,
        carrier_name,
        carrier_priority,
        effective_date,
        expiration_date,
        is_active
      FROM rate_tables
      ${whereClause}
      ORDER BY prefix ASC
    `, params);

    // Build CSV
    const headers = [
      'prefix', 'destination_name', 'cost_per_minute', 'connection_fee',
      'minimum_duration', 'billing_increment', 'carrier_name', 'carrier_priority',
      'effective_date', 'expiration_date', 'is_active'
    ];

    let csv = headers.join(',') + '\n';

    for (const rate of ratesQuery.rows) {
      const row = headers.map(h => {
        const val = rate[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val;
      });
      csv += row.join(',') + '\n';
    }

    return c.json({
      success: true,
      csv_data: csv,
      total_rates: ratesQuery.rows.length,
      filename: `rates_export_${new Date().toISOString().split('T')[0]}.csv`
    });
  } catch (error) {
    console.error('Admin billing rates export error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// POST /admin/billing-rates/lookup - LCR Lookup
// =============================================================================
app.post('/lookup', async (c) => {
  try {
    const { destination_number } = await c.req.json();

    if (!destination_number) {
      return c.json({ error: 'destination_number is required' }, 400);
    }

    // Clean up the number (remove spaces, dashes, etc.)
    const cleanNumber = destination_number.replace(/[\s\-\(\)]/g, '');

    // Find matching rates using longest prefix match
    const ratesQuery = await pool.query(`
      SELECT
        id,
        prefix,
        destination_name,
        cost_per_minute,
        connection_fee,
        minimum_duration,
        billing_increment,
        carrier_name,
        carrier_priority,
        effective_date,
        LENGTH(prefix) AS prefix_length
      FROM rate_tables
      WHERE is_active = true
        AND $1 LIKE prefix || '%'
        AND (effective_date IS NULL OR effective_date <= NOW())
        AND (expiration_date IS NULL OR expiration_date > NOW())
      ORDER BY LENGTH(prefix) DESC, carrier_priority ASC, cost_per_minute ASC
    `, [cleanNumber]);

    if (ratesQuery.rows.length === 0) {
      return c.json({
        success: true,
        found: false,
        message: 'No matching rate found for this destination'
      });
    }

    // Group by prefix length and return best rates
    const bestMatch = ratesQuery.rows[0];
    const allMatches = ratesQuery.rows;

    // Calculate estimated cost for a 1-minute call
    const estimatedCost = parseFloat(bestMatch.cost_per_minute) + parseFloat(bestMatch.connection_fee || 0);

    return c.json({
      success: true,
      found: true,
      destination_number: cleanNumber,
      best_rate: bestMatch,
      estimated_cost_1min: estimatedCost.toFixed(6),
      all_rates: allMatches.slice(0, 10), // Return top 10 matches
      total_matching_rates: allMatches.length
    });
  } catch (error) {
    console.error('Admin billing rates lookup error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// GET /admin/billing-rates/carriers - List All Carriers
// =============================================================================
app.get('/carriers', async (c) => {
  try {
    const carriersQuery = await pool.query(`
      SELECT
        carrier_name,
        COUNT(*) AS rate_count,
        COUNT(CASE WHEN is_active THEN 1 END) AS active_count,
        ROUND(AVG(cost_per_minute)::numeric, 6) AS avg_cost,
        ROUND(MIN(cost_per_minute)::numeric, 6) AS min_cost,
        ROUND(MAX(cost_per_minute)::numeric, 6) AS max_cost,
        MIN(created_at) AS first_rate_added,
        MAX(updated_at) AS last_updated
      FROM rate_tables
      WHERE carrier_name IS NOT NULL
      GROUP BY carrier_name
      ORDER BY rate_count DESC
    `);

    return c.json({
      success: true,
      carriers: carriersQuery.rows
    });
  } catch (error) {
    console.error('Admin billing rates carriers error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
