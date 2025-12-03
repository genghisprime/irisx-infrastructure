import { Hono } from 'hono';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'irisx',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const app = new Hono();

// ============================================================================
// GET /admin/ivr/stats - Overall IVR statistics
// ============================================================================
app.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get date range (default: last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Query stats
    const statsQuery = `
      SELECT
        COUNT(DISTINCT m.id) as total_menus,
        COUNT(DISTINCT m.tenant_id) as active_tenants,
        COUNT(DISTINCT CASE WHEN m.status = 'active' THEN m.id END) as active_menus,
        COUNT(DISTINCT CASE WHEN m.status = 'inactive' THEN m.id END) as inactive_menus,
        COUNT(DISTINCT o.id) as total_options,
        AVG(option_counts.option_count) as avg_options_per_menu,
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(DISTINCT CASE WHEN s.ended_at IS NULL THEN s.id END) as active_sessions,
        AVG(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at))) as avg_session_duration_seconds,
        AVG(s.invalid_input_count) as avg_invalid_inputs
      FROM ivr_menus m
      LEFT JOIN ivr_menu_options o ON m.id = o.menu_id
      LEFT JOIN ivr_sessions s ON m.id = s.current_menu_id
        AND s.started_at >= $1
        AND s.started_at <= $2
      LEFT JOIN (
        SELECT menu_id, COUNT(*) as option_count
        FROM ivr_menu_options
        GROUP BY menu_id
      ) option_counts ON m.id = option_counts.menu_id
      WHERE m.deleted_at IS NULL
    `;

    const statsResult = await pool.query(statsQuery, [startDate, endDate]);
    const stats = statsResult.rows[0];

    // Get action type distribution
    const actionQuery = `
      SELECT
        action_type,
        COUNT(*) as count
      FROM ivr_menu_options
      WHERE deleted_at IS NULL
      GROUP BY action_type
      ORDER BY count DESC
    `;
    const actionResult = await pool.query(actionQuery);

    // Get top menus by usage
    const topMenusQuery = `
      SELECT
        m.id,
        m.name,
        m.tenant_id,
        t.name as tenant_name,
        COUNT(DISTINCT s.id) as session_count,
        AVG(s.invalid_input_count) as avg_invalid_inputs,
        AVG(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at))) as avg_duration_seconds
      FROM ivr_menus m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN ivr_sessions s ON m.id = s.current_menu_id
        AND s.started_at >= $1
        AND s.started_at <= $2
      WHERE m.deleted_at IS NULL
      GROUP BY m.id, m.name, m.tenant_id, t.name
      ORDER BY session_count DESC
      LIMIT 10
    `;
    const topMenusResult = await pool.query(topMenusQuery, [startDate, endDate]);

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'view',
      'ivr_stats',
      JSON.stringify({ date_range: { start: startDate, end: endDate } })
    ]);

    return c.json({
      stats: {
        total_menus: parseInt(stats.total_menus) || 0,
        active_menus: parseInt(stats.active_menus) || 0,
        inactive_menus: parseInt(stats.inactive_menus) || 0,
        active_tenants: parseInt(stats.active_tenants) || 0,
        total_options: parseInt(stats.total_options) || 0,
        avg_options_per_menu: parseFloat(stats.avg_options_per_menu) || 0,
        total_sessions: parseInt(stats.total_sessions) || 0,
        active_sessions: parseInt(stats.active_sessions) || 0,
        avg_session_duration_seconds: parseFloat(stats.avg_session_duration_seconds) || 0,
        avg_invalid_inputs: parseFloat(stats.avg_invalid_inputs) || 0
      },
      action_distribution: actionResult.rows.map(row => ({
        action_type: row.action_type,
        count: parseInt(row.count)
      })),
      top_menus: topMenusResult.rows.map(row => ({
        id: parseInt(row.id),
        name: row.name,
        tenant_id: parseInt(row.tenant_id),
        tenant_name: row.tenant_name,
        session_count: parseInt(row.session_count) || 0,
        avg_invalid_inputs: parseFloat(row.avg_invalid_inputs) || 0,
        avg_duration_seconds: parseFloat(row.avg_duration_seconds) || 0
      })),
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching IVR stats:', error);
    return c.json({ error: 'Failed to fetch IVR stats', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/ivr/menus - List all IVR menus (cross-tenant)
// ============================================================================
app.get('/menus', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Pagination
    const page = parseInt(c.req.query('page')) || 1;
    const limit = Math.min(parseInt(c.req.query('limit')) || 50, 100);
    const offset = (page - 1) * limit;

    // Filters
    const search = c.req.query('search') || '';
    const status = c.req.query('status') || '';
    const tenantId = c.req.query('tenant_id') || '';
    const sortBy = c.req.query('sort_by') || 'created_at';
    const sortOrder = c.req.query('sort_order') || 'desc';

    // Build query
    let whereConditions = ['m.deleted_at IS NULL'];
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereConditions.push(`(m.name ILIKE $${paramCount} OR m.description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`m.status = $${paramCount}`);
      params.push(status);
    }

    if (tenantId) {
      paramCount++;
      whereConditions.push(`m.tenant_id = $${paramCount}`);
      params.push(tenantId);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count total
    const countQuery = `
      SELECT COUNT(*)
      FROM ivr_menus m
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get menus with option counts and session counts
    const validSortColumns = ['created_at', 'updated_at', 'name', 'status'];
    const finalSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const menusQuery = `
      SELECT
        m.id,
        m.tenant_id,
        t.name as tenant_name,
        m.name,
        m.description,
        m.greeting_text,
        m.greeting_audio,
        m.greeting_voice,
        m.greeting_provider,
        m.invalid_text,
        m.invalid_audio,
        m.max_attempts_text,
        m.max_attempts_audio,
        m.max_digits,
        m.digit_timeout_ms,
        m.status,
        m.created_at,
        m.updated_at,
        COUNT(DISTINCT o.id) as option_count,
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT CASE WHEN s.ended_at IS NULL THEN s.id END) as active_session_count
      FROM ivr_menus m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN ivr_menu_options o ON m.id = o.menu_id AND o.deleted_at IS NULL
      LEFT JOIN ivr_sessions s ON m.id = s.current_menu_id
        AND s.started_at >= NOW() - INTERVAL '7 days'
      WHERE ${whereClause}
      GROUP BY m.id, t.name
      ORDER BY m.${finalSortBy} ${finalSortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const menusResult = await pool.query(menusQuery, [...params, limit, offset]);

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'view',
      'ivr_menus',
      JSON.stringify({ filters: { search, status, tenantId }, page, limit })
    ]);

    return c.json({
      menus: menusResult.rows.map(row => ({
        id: parseInt(row.id),
        tenant_id: parseInt(row.tenant_id),
        tenant_name: row.tenant_name,
        name: row.name,
        description: row.description,
        greeting: {
          text: row.greeting_text,
          audio: row.greeting_audio,
          voice: row.greeting_voice,
          provider: row.greeting_provider
        },
        invalid_input: {
          text: row.invalid_text,
          audio: row.invalid_audio
        },
        max_attempts: {
          text: row.max_attempts_text,
          audio: row.max_attempts_audio
        },
        settings: {
          max_digits: row.max_digits,
          digit_timeout_ms: row.digit_timeout_ms
        },
        status: row.status,
        option_count: parseInt(row.option_count) || 0,
        session_count: parseInt(row.session_count) || 0,
        active_session_count: parseInt(row.active_session_count) || 0,
        created_at: row.created_at,
        updated_at: row.updated_at
      })),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching IVR menus:', error);
    return c.json({ error: 'Failed to fetch IVR menus', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/ivr/menus/:id - Get menu details with full option tree
// ============================================================================
app.get('/menus/:id', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const menuId = c.req.param('id');

    // Get menu details
    const menuQuery = `
      SELECT
        m.*,
        t.name as tenant_name,
        t.id as tenant_id
      FROM ivr_menus m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      WHERE m.id = $1 AND m.deleted_at IS NULL
    `;
    const menuResult = await pool.query(menuQuery, [menuId]);

    if (menuResult.rows.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    const menu = menuResult.rows[0];

    // Get all options for this menu
    const optionsQuery = `
      SELECT
        o.*,
        CASE
          WHEN o.action_type = 'submenu' THEN sm.name
          ELSE NULL
        END as submenu_name
      FROM ivr_menu_options o
      LEFT JOIN ivr_menus sm ON o.action_type = 'submenu'
        AND o.action_value = sm.id::text
        AND sm.deleted_at IS NULL
      WHERE o.menu_id = $1 AND o.deleted_at IS NULL
      ORDER BY o.digit_pattern
    `;
    const optionsResult = await pool.query(optionsQuery, [menuId]);

    // Get recent sessions (last 100)
    const sessionsQuery = `
      SELECT
        s.id,
        s.call_uuid,
        s.current_menu_id,
        s.menu_history,
        s.invalid_input_count,
        s.started_at,
        s.ended_at,
        c.from_number,
        c.to_number,
        c.status as call_status
      FROM ivr_sessions s
      LEFT JOIN calls c ON s.call_uuid = c.uuid
      WHERE s.current_menu_id = $1
      ORDER BY s.started_at DESC
      LIMIT 100
    `;
    const sessionsResult = await pool.query(sessionsQuery, [menuId]);

    // Get session analytics
    const analyticsQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN ended_at IS NOT NULL THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN ended_at IS NULL THEN 1 END) as active_sessions,
        AVG(invalid_input_count) as avg_invalid_inputs,
        MAX(invalid_input_count) as max_invalid_inputs,
        AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) as avg_duration_seconds
      FROM ivr_sessions
      WHERE current_menu_id = $1
        AND started_at >= NOW() - INTERVAL '30 days'
    `;
    const analyticsResult = await pool.query(analyticsQuery, [menuId]);

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      admin.id,
      'view',
      'ivr_menu',
      menuId,
      JSON.stringify({ menu_name: menu.name })
    ]);

    return c.json({
      menu: {
        id: parseInt(menu.id),
        tenant_id: parseInt(menu.tenant_id),
        tenant_name: menu.tenant_name,
        name: menu.name,
        description: menu.description,
        greeting: {
          text: menu.greeting_text,
          audio: menu.greeting_audio,
          voice: menu.greeting_voice,
          provider: menu.greeting_provider
        },
        invalid_input: {
          text: menu.invalid_text,
          audio: menu.invalid_audio,
          voice: menu.invalid_voice
        },
        max_attempts: {
          text: menu.max_attempts_text,
          audio: menu.max_attempts_audio
        },
        settings: {
          max_digits: menu.max_digits,
          digit_timeout_ms: menu.digit_timeout_ms
        },
        status: menu.status,
        created_at: menu.created_at,
        updated_at: menu.updated_at
      },
      options: optionsResult.rows.map(row => ({
        id: parseInt(row.id),
        digit_pattern: row.digit_pattern,
        description: row.description,
        action_type: row.action_type,
        action_value: row.action_value,
        submenu_name: row.submenu_name,
        created_at: row.created_at
      })),
      recent_sessions: sessionsResult.rows.map(row => ({
        id: parseInt(row.id),
        call_uuid: row.call_uuid,
        from_number: row.from_number,
        to_number: row.to_number,
        call_status: row.call_status,
        menu_history: row.menu_history,
        invalid_input_count: row.invalid_input_count,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_seconds: row.ended_at
          ? Math.floor((new Date(row.ended_at) - new Date(row.started_at)) / 1000)
          : null
      })),
      analytics: {
        total_sessions: parseInt(analyticsResult.rows[0].total_sessions) || 0,
        completed_sessions: parseInt(analyticsResult.rows[0].completed_sessions) || 0,
        active_sessions: parseInt(analyticsResult.rows[0].active_sessions) || 0,
        avg_invalid_inputs: parseFloat(analyticsResult.rows[0].avg_invalid_inputs) || 0,
        max_invalid_inputs: parseInt(analyticsResult.rows[0].max_invalid_inputs) || 0,
        avg_duration_seconds: parseFloat(analyticsResult.rows[0].avg_duration_seconds) || 0
      }
    });

  } catch (error) {
    console.error('Error fetching menu details:', error);
    return c.json({ error: 'Failed to fetch menu details', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/ivr/sessions - List active/recent IVR sessions (cross-tenant)
// ============================================================================
app.get('/sessions', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Pagination
    const page = parseInt(c.req.query('page')) || 1;
    const limit = Math.min(parseInt(c.req.query('limit')) || 50, 100);
    const offset = (page - 1) * limit;

    // Filters
    const activeOnly = c.req.query('active_only') === 'true';
    const menuId = c.req.query('menu_id') || '';
    const tenantId = c.req.query('tenant_id') || '';
    const startDate = c.req.query('start_date') || '';
    const endDate = c.req.query('end_date') || '';

    // Build query
    let whereConditions = [];
    const params = [];
    let paramCount = 0;

    if (activeOnly) {
      whereConditions.push('s.ended_at IS NULL');
    }

    if (menuId) {
      paramCount++;
      whereConditions.push(`s.current_menu_id = $${paramCount}`);
      params.push(menuId);
    }

    if (tenantId) {
      paramCount++;
      whereConditions.push(`m.tenant_id = $${paramCount}`);
      params.push(tenantId);
    }

    if (startDate) {
      paramCount++;
      whereConditions.push(`s.started_at >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      whereConditions.push(`s.started_at <= $${paramCount}`);
      params.push(endDate);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Count total
    const countQuery = `
      SELECT COUNT(*)
      FROM ivr_sessions s
      LEFT JOIN ivr_menus m ON s.current_menu_id = m.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get sessions
    const sessionsQuery = `
      SELECT
        s.id,
        s.call_uuid,
        s.current_menu_id,
        s.menu_history,
        s.invalid_input_count,
        s.started_at,
        s.ended_at,
        m.name as menu_name,
        m.tenant_id,
        t.name as tenant_name,
        c.from_number,
        c.to_number,
        c.status as call_status,
        c.direction
      FROM ivr_sessions s
      LEFT JOIN ivr_menus m ON s.current_menu_id = m.id
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN calls c ON s.call_uuid = c.uuid
      ${whereClause}
      ORDER BY s.started_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const sessionsResult = await pool.query(sessionsQuery, [...params, limit, offset]);

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'view',
      'ivr_sessions',
      JSON.stringify({ filters: { activeOnly, menuId, tenantId }, page, limit })
    ]);

    return c.json({
      sessions: sessionsResult.rows.map(row => ({
        id: parseInt(row.id),
        call_uuid: row.call_uuid,
        menu_id: parseInt(row.current_menu_id),
        menu_name: row.menu_name,
        tenant_id: parseInt(row.tenant_id),
        tenant_name: row.tenant_name,
        from_number: row.from_number,
        to_number: row.to_number,
        call_status: row.call_status,
        direction: row.direction,
        menu_history: row.menu_history,
        invalid_input_count: row.invalid_input_count,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_seconds: row.ended_at
          ? Math.floor((new Date(row.ended_at) - new Date(row.started_at)) / 1000)
          : null,
        is_active: !row.ended_at
      })),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching IVR sessions:', error);
    return c.json({ error: 'Failed to fetch IVR sessions', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/ivr/analytics - Cross-tenant IVR analytics
// ============================================================================
app.get('/analytics', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Date range (default: last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const tenantId = c.req.query('tenant_id') || '';

    // Build tenant filter
    let tenantFilter = '';
    const params = [startDate, endDate];
    if (tenantId) {
      tenantFilter = 'AND m.tenant_id = $3';
      params.push(tenantId);
    }

    // Session completion rates
    const completionQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN s.ended_at IS NOT NULL THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN s.ended_at IS NULL THEN 1 END) as abandoned_sessions,
        AVG(CASE WHEN s.ended_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at))
        END) as avg_completed_duration,
        AVG(s.invalid_input_count) as avg_invalid_inputs,
        SUM(s.invalid_input_count) as total_invalid_inputs
      FROM ivr_sessions s
      LEFT JOIN ivr_menus m ON s.current_menu_id = m.id
      WHERE s.started_at >= $1 AND s.started_at <= $2
      ${tenantFilter}
    `;
    const completionResult = await pool.query(completionQuery, params);

    // Drop-off points (menus with highest abandonment)
    const dropoffQuery = `
      SELECT
        m.id as menu_id,
        m.name as menu_name,
        m.tenant_id,
        t.name as tenant_name,
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN s.ended_at IS NULL THEN 1 END) as abandoned_count,
        ROUND(
          COUNT(CASE WHEN s.ended_at IS NULL THEN 1 END)::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100,
          2
        ) as abandonment_rate
      FROM ivr_sessions s
      LEFT JOIN ivr_menus m ON s.current_menu_id = m.id
      LEFT JOIN tenants t ON m.tenant_id = t.id
      WHERE s.started_at >= $1 AND s.started_at <= $2
      ${tenantFilter}
      GROUP BY m.id, m.name, m.tenant_id, t.name
      HAVING COUNT(*) >= 5
      ORDER BY abandonment_rate DESC
      LIMIT 10
    `;
    const dropoffResult = await pool.query(dropoffQuery, params);

    // Most used options
    const optionsQuery = `
      SELECT
        o.id,
        o.digit_pattern,
        o.description,
        o.action_type,
        m.name as menu_name,
        m.tenant_id,
        t.name as tenant_name,
        COUNT(CASE
          WHEN s.menu_history::text LIKE '%' || o.digit_pattern || '%'
          THEN 1
        END) as usage_count
      FROM ivr_menu_options o
      LEFT JOIN ivr_menus m ON o.menu_id = m.id
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN ivr_sessions s ON m.id = s.current_menu_id
        AND s.started_at >= $1
        AND s.started_at <= $2
      WHERE o.deleted_at IS NULL
      ${tenantFilter}
      GROUP BY o.id, o.digit_pattern, o.description, o.action_type, m.name, m.tenant_id, t.name
      ORDER BY usage_count DESC
      LIMIT 20
    `;
    const optionsResult = await pool.query(optionsQuery, params);

    // Daily session trends
    const trendsQuery = `
      SELECT
        DATE(s.started_at) as date,
        COUNT(*) as session_count,
        COUNT(CASE WHEN s.ended_at IS NOT NULL THEN 1 END) as completed_count,
        COUNT(CASE WHEN s.ended_at IS NULL THEN 1 END) as abandoned_count,
        AVG(s.invalid_input_count) as avg_invalid_inputs
      FROM ivr_sessions s
      LEFT JOIN ivr_menus m ON s.current_menu_id = m.id
      WHERE s.started_at >= $1 AND s.started_at <= $2
      ${tenantFilter}
      GROUP BY DATE(s.started_at)
      ORDER BY date DESC
    `;
    const trendsResult = await pool.query(trendsQuery, params);

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'view',
      'ivr_analytics',
      JSON.stringify({ date_range: { start: startDate, end: endDate }, tenant_id: tenantId })
    ]);

    return c.json({
      completion_stats: {
        total_sessions: parseInt(completionResult.rows[0].total_sessions) || 0,
        completed_sessions: parseInt(completionResult.rows[0].completed_sessions) || 0,
        abandoned_sessions: parseInt(completionResult.rows[0].abandoned_sessions) || 0,
        completion_rate: completionResult.rows[0].total_sessions > 0
          ? Math.round((completionResult.rows[0].completed_sessions / completionResult.rows[0].total_sessions) * 100)
          : 0,
        avg_completed_duration: parseFloat(completionResult.rows[0].avg_completed_duration) || 0,
        avg_invalid_inputs: parseFloat(completionResult.rows[0].avg_invalid_inputs) || 0,
        total_invalid_inputs: parseInt(completionResult.rows[0].total_invalid_inputs) || 0
      },
      dropoff_points: dropoffResult.rows.map(row => ({
        menu_id: parseInt(row.menu_id),
        menu_name: row.menu_name,
        tenant_id: parseInt(row.tenant_id),
        tenant_name: row.tenant_name,
        total_sessions: parseInt(row.total_sessions),
        abandoned_count: parseInt(row.abandoned_count),
        abandonment_rate: parseFloat(row.abandonment_rate)
      })),
      popular_options: optionsResult.rows.map(row => ({
        option_id: parseInt(row.id),
        digit_pattern: row.digit_pattern,
        description: row.description,
        action_type: row.action_type,
        menu_name: row.menu_name,
        tenant_id: parseInt(row.tenant_id),
        tenant_name: row.tenant_name,
        usage_count: parseInt(row.usage_count) || 0
      })),
      daily_trends: trendsResult.rows.map(row => ({
        date: row.date,
        session_count: parseInt(row.session_count),
        completed_count: parseInt(row.completed_count),
        abandoned_count: parseInt(row.abandoned_count),
        avg_invalid_inputs: parseFloat(row.avg_invalid_inputs) || 0
      })),
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching IVR analytics:', error);
    return c.json({ error: 'Failed to fetch IVR analytics', details: error.message }, 500);
  }
});

// ============================================================================
// GET /admin/ivr/menus/:id/flow - Get menu flow visualization data
// ============================================================================
app.get('/menus/:id/flow', async (c) => {
  try {
    const admin = c.get('admin');
    if (!admin) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const menuId = c.req.param('id');

    // Get menu with all options recursively
    const flowQuery = `
      WITH RECURSIVE menu_tree AS (
        -- Base case: root menu
        SELECT
          m.id,
          m.name,
          m.description,
          m.tenant_id,
          0 as depth,
          ARRAY[m.id] as path
        FROM ivr_menus m
        WHERE m.id = $1 AND m.deleted_at IS NULL

        UNION ALL

        -- Recursive case: submenus
        SELECT
          sm.id,
          sm.name,
          sm.description,
          sm.tenant_id,
          mt.depth + 1,
          mt.path || sm.id
        FROM menu_tree mt
        JOIN ivr_menu_options o ON mt.id = o.menu_id
          AND o.action_type = 'submenu'
          AND o.deleted_at IS NULL
        JOIN ivr_menus sm ON o.action_value = sm.id::text
          AND sm.deleted_at IS NULL
          AND NOT sm.id = ANY(mt.path) -- Prevent circular references
        WHERE mt.depth < 10 -- Limit recursion depth
      )
      SELECT * FROM menu_tree;
    `;

    const flowResult = await pool.query(flowQuery, [menuId]);

    // Get all options for discovered menus
    const menuIds = flowResult.rows.map(r => r.id);

    if (menuIds.length === 0) {
      return c.json({ error: 'Menu not found' }, 404);
    }

    const optionsQuery = `
      SELECT
        o.*,
        CASE
          WHEN o.action_type = 'submenu' THEN sm.name
          ELSE NULL
        END as submenu_name
      FROM ivr_menu_options o
      LEFT JOIN ivr_menus sm ON o.action_type = 'submenu'
        AND o.action_value = sm.id::text
        AND sm.deleted_at IS NULL
      WHERE o.menu_id = ANY($1)
        AND o.deleted_at IS NULL
      ORDER BY o.menu_id, o.digit_pattern
    `;
    const optionsResult = await pool.query(optionsQuery, [menuIds]);

    // Build flow tree structure
    const nodes = flowResult.rows.map(row => ({
      id: parseInt(row.id),
      name: row.name,
      description: row.description,
      depth: row.depth,
      options: optionsResult.rows
        .filter(o => parseInt(o.menu_id) === parseInt(row.id))
        .map(o => ({
          digit_pattern: o.digit_pattern,
          description: o.description,
          action_type: o.action_type,
          action_value: o.action_value,
          submenu_name: o.submenu_name,
          target_menu_id: o.action_type === 'submenu' ? parseInt(o.action_value) : null
        }))
    }));

    // Audit log
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      admin.id,
      'view',
      'ivr_flow',
      menuId,
      JSON.stringify({ menu_id: menuId })
    ]);

    return c.json({
      flow: {
        root_menu_id: parseInt(menuId),
        total_menus: nodes.length,
        max_depth: Math.max(...nodes.map(n => n.depth)),
        nodes
      }
    });

  } catch (error) {
    console.error('Error fetching IVR flow:', error);
    return c.json({ error: 'Failed to fetch IVR flow', details: error.message }, 500);
  }
});

export default app;
