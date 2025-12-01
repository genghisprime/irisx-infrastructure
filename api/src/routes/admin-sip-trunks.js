import { Hono } from 'hono';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';
import freeswitchSync from '../services/freeswitch-sync.js';

const adminSipTrunks = new Hono();

// Apply admin authentication to all routes
adminSipTrunks.use('*', authenticateAdmin);

/**
 * GET /admin/sip-trunks
 * List all SIP trunks across all tenants
 */
adminSipTrunks.get('/', async (c) => {
  try {
    const result = await pool.query(`
      SELECT
        st.id,
        st.tenant_id,
        t.name as tenant_name,
        st.name,
        st.provider,
        st.sip_uri,
        st.username,
        st.max_channels,
        st.active_channels,
        st.codec,
        st.status,
        st.description,
        st.created_at,
        st.updated_at
      FROM sip_trunks st
      LEFT JOIN tenants t ON st.tenant_id = t.id
      WHERE st.deleted_at IS NULL
      ORDER BY st.created_at DESC
    `);

    return c.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch SIP trunks:', err);
    // Return empty array if table doesn't exist
    if (err.code === '42P01') {
      return c.json([]);
    }
    return c.json({ error: 'Failed to load SIP trunks' }, 500);
  }
});

/**
 * GET /admin/sip-trunks/:id
 * Get a specific SIP trunk by ID
 */
adminSipTrunks.get('/:id', async (c) => {
  const { id } = c.req.param();

  try {
    const result = await pool.query(`
      SELECT
        st.*,
        t.name as tenant_name
      FROM sip_trunks st
      LEFT JOIN tenants t ON st.tenant_id = t.id
      WHERE st.id = $1 AND st.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'SIP trunk not found' }, 404);
    }

    return c.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch SIP trunk:', err);
    // Return 404 if table doesn't exist
    if (err.code === '42P01') {
      return c.json({ error: 'SIP trunk not found' }, 404);
    }
    return c.json({ error: 'Failed to load SIP trunk' }, 500);
  }
});

/**
 * POST /admin/sip-trunks
 * Create a new SIP trunk
 */
adminSipTrunks.post('/', async (c) => {
  const admin = c.get('admin');

  // Only admin and superadmin can create SIP trunks
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const { tenant_id, name, provider, sip_uri, username, password, max_channels, codec, description } = body;

    // Validate required fields
    if (!tenant_id || !name || !provider || !sip_uri) {
      return c.json({ error: 'Missing required fields: tenant_id, name, provider, sip_uri' }, 400);
    }

    const result = await pool.query(`
      INSERT INTO sip_trunks (
        tenant_id, name, provider, sip_uri, username, password,
        max_channels, codec, description, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'inactive', NOW())
      RETURNING *
    `, [
      tenant_id,
      name,
      provider,
      sip_uri,
      username || null,
      password || null,
      max_channels || 50,
      codec || 'PCMU,PCMA,G729',
      description || null
    ]);

    const newTrunk = result.rows[0];

    // Sync to FreeSWITCH (async, don't block response)
    freeswitchSync.syncTrunkToFreeSWITCH(newTrunk.id)
      .then(syncResult => {
        console.log('[Admin SIP Trunks] FreeSWITCH sync result:', syncResult);
      })
      .catch(err => {
        console.error('[Admin SIP Trunks] FreeSWITCH sync error:', err);
      });

    return c.json(newTrunk, 201);
  } catch (err) {
    console.error('Failed to create SIP trunk:', err);
    return c.json({ error: 'Failed to create SIP trunk' }, 500);
  }
});

/**
 * PUT /admin/sip-trunks/:id
 * Update an existing SIP trunk
 */
adminSipTrunks.put('/:id', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  // Only admin and superadmin can update SIP trunks
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const body = await c.req.json();
    const { name, provider, sip_uri, username, password, max_channels, codec, status, description } = body;

    const result = await pool.query(`
      UPDATE sip_trunks
      SET
        name = COALESCE($1, name),
        provider = COALESCE($2, provider),
        sip_uri = COALESCE($3, sip_uri),
        username = COALESCE($4, username),
        password = COALESCE($5, password),
        max_channels = COALESCE($6, max_channels),
        codec = COALESCE($7, codec),
        status = COALESCE($8, status),
        description = COALESCE($9, description),
        updated_at = NOW()
      WHERE id = $10 AND deleted_at IS NULL
      RETURNING *
    `, [name, provider, sip_uri, username, password, max_channels, codec, status, description, id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'SIP trunk not found' }, 404);
    }

    const updatedTrunk = result.rows[0];

    // Sync to FreeSWITCH (async, don't block response)
    freeswitchSync.syncTrunkToFreeSWITCH(updatedTrunk.id)
      .then(syncResult => {
        console.log('[Admin SIP Trunks] FreeSWITCH sync result:', syncResult);
      })
      .catch(err => {
        console.error('[Admin SIP Trunks] FreeSWITCH sync error:', err);
      });

    return c.json(updatedTrunk);
  } catch (err) {
    console.error('Failed to update SIP trunk:', err);
    return c.json({ error: 'Failed to update SIP trunk' }, 500);
  }
});

/**
 * DELETE /admin/sip-trunks/:id
 * Soft delete a SIP trunk
 */
adminSipTrunks.delete('/:id', async (c) => {
  const admin = c.get('admin');
  const { id } = c.req.param();

  // Only admin and superadmin can delete SIP trunks
  if (!['admin', 'superadmin'].includes(admin.role)) {
    return c.json({ error: 'Insufficient permissions' }, 403);
  }

  try {
    const result = await pool.query(`
      UPDATE sip_trunks
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'SIP trunk not found' }, 404);
    }

    return c.json({ message: 'SIP trunk deleted successfully' });
  } catch (err) {
    console.error('Failed to delete SIP trunk:', err);
    return c.json({ error: 'Failed to delete SIP trunk' }, 500);
  }
});

/**
 * POST /admin/sip-trunks/:id/test
 * Test a SIP trunk connection
 */
adminSipTrunks.post('/:id/test', async (c) => {
  const { id } = c.req.param();

  try {
    // Get trunk details
    const result = await pool.query(`
      SELECT * FROM sip_trunks WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) {
      return c.json({ error: 'SIP trunk not found' }, 404);
    }

    const trunk = result.rows[0];

    // In a real implementation, this would test the actual SIP connection
    // For now, we'll simulate a test by checking if the trunk has valid configuration
    const isValid = trunk.sip_uri && trunk.provider && trunk.name;

    return c.json({
      success: isValid,
      message: isValid ? 'SIP trunk configuration is valid' : 'SIP trunk configuration is incomplete',
      tested_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to test SIP trunk:', err);
    return c.json({ error: 'Failed to test SIP trunk' }, 500);
  }
});

/**
 * GET /admin/sip-trunks/:id/stats
 * Get statistics for a specific SIP trunk
 */
adminSipTrunks.get('/:id/stats', async (c) => {
  const { id } = c.req.param();

  try {
    // Return zero stats since calls table doesn't exist yet
    return c.json({
      active_calls: 0,
      calls_24h: 0,
      calls_7d: 0,
      avg_duration_24h: null
    });
  } catch (err) {
    console.error('Failed to fetch SIP trunk stats:', err);
    return c.json({ error: 'Failed to load statistics' }, 500);
  }
});

export default adminSipTrunks;
