/**
 * Agent Analytics API Routes
 * Week 21: Agent Performance Dashboard
 *
 * Endpoints for agent performance metrics, statistics, and leaderboards
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';

const agentAnalytics = new Hono();

// Middleware: Extract tenant_id from JWT
agentAnalytics.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized: Missing tenant information' }, 401);
  }
  c.set('tenant_id', tenantId);
  await next();
});

/**
 * GET /v1/analytics/agents/overview
 * Get overall agent statistics for the tenant
 */
agentAnalytics.get('/overview', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const timeRange = c.req.query('timeRange') || '24h'; // 24h, 7d, 30d, all

    // Calculate date filter
    const dateFilter = getDateFilter(timeRange);

    // Total calls by all agents
    const totalCallsQuery = `
      SELECT COUNT(*) as total_calls
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        ${dateFilter}
    `;

    // Answered calls
    const answeredCallsQuery = `
      SELECT COUNT(*) as answered_calls
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        AND answered_at IS NOT NULL
        ${dateFilter}
    `;

    // Total talk time
    const talkTimeQuery = `
      SELECT COALESCE(SUM(duration_seconds), 0) as total_talk_time
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        AND answered_at IS NOT NULL
        ${dateFilter}
    `;

    // Average call duration
    const avgDurationQuery = `
      SELECT COALESCE(AVG(duration_seconds), 0) as avg_duration
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        AND answered_at IS NOT NULL
        ${dateFilter}
    `;

    // Missed calls
    const missedCallsQuery = `
      SELECT COUNT(*) as missed_calls
      FROM calls
      WHERE tenant_id = $1
        AND direction = 'inbound'
        AND answered_at IS NULL
        ${dateFilter}
    `;

    // Active agents (have made/received calls)
    const activeAgentsQuery = `
      SELECT COUNT(DISTINCT user_id) as active_agents
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        ${dateFilter}
    `;

    // Execute all queries in parallel
    const [totalCalls, answeredCalls, talkTime, avgDuration, missedCalls, activeAgents] = await Promise.all([
      pool.query(totalCallsQuery, [tenantId]),
      pool.query(answeredCallsQuery, [tenantId]),
      pool.query(talkTimeQuery, [tenantId]),
      pool.query(avgDurationQuery, [tenantId]),
      pool.query(missedCallsQuery, [tenantId]),
      pool.query(activeAgentsQuery, [tenantId])
    ]);

    return c.json({
      success: true,
      timeRange,
      overview: {
        totalCalls: parseInt(totalCalls.rows[0].total_calls),
        answeredCalls: parseInt(answeredCalls.rows[0].answered_calls),
        missedCalls: parseInt(missedCalls.rows[0].missed_calls),
        totalTalkTimeSeconds: parseInt(talkTime.rows[0].total_talk_time),
        avgDurationSeconds: Math.round(parseFloat(avgDuration.rows[0].avg_duration)),
        activeAgents: parseInt(activeAgents.rows[0].active_agents)
      }
    });
  } catch (error) {
    console.error('Error fetching agent overview:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/analytics/agents/list
 * Get list of all agents with their performance metrics
 */
agentAnalytics.get('/list', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const timeRange = c.req.query('timeRange') || '24h';
    const dateFilter = getDateFilter(timeRange);

    const query = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        COALESCE(json_agg(DISTINCT ae.extension) FILTER (WHERE ae.extension IS NOT NULL), '[]'::json) as extensions,
        COUNT(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL ${dateFilter !== '' ? 'AND ' + dateFilter.replace('AND', '') : ''}) as total_calls,
        COUNT(DISTINCT c.id) FILTER (WHERE c.direction = 'inbound' AND c.answered_at IS NOT NULL ${dateFilter !== '' ? 'AND ' + dateFilter.replace('AND', '') : ''}) as inbound_answered,
        COUNT(DISTINCT c.id) FILTER (WHERE c.direction = 'outbound' AND c.answered_at IS NOT NULL ${dateFilter !== '' ? 'AND ' + dateFilter.replace('AND', '') : ''}) as outbound_calls,
        COALESCE(SUM(c.duration_seconds) FILTER (WHERE c.answered_at IS NOT NULL ${dateFilter !== '' ? 'AND ' + dateFilter.replace('AND', '') : ''}), 0) as total_talk_time,
        COALESCE(AVG(c.duration_seconds) FILTER (WHERE c.answered_at IS NOT NULL ${dateFilter !== '' ? 'AND ' + dateFilter.replace('AND', '') : ''}), 0) as avg_call_duration
      FROM users u
      LEFT JOIN agent_extensions ae ON ae.user_id = u.id AND ae.tenant_id = u.tenant_id
      LEFT JOIN calls c ON c.user_id = u.id AND c.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1
        AND u.role IN ('agent', 'supervisor', 'admin')
      GROUP BY u.id, u.email, u.first_name, u.last_name, u.status
      ORDER BY total_calls DESC
    `;

    const { rows } = await pool.query(query, [tenantId]);

    const agents = rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      name: `${row.first_name} ${row.last_name}`,
      status: row.status,
      extensions: row.extensions,
      metrics: {
        totalCalls: parseInt(row.total_calls),
        inboundAnswered: parseInt(row.inbound_answered),
        outboundCalls: parseInt(row.outbound_calls),
        totalTalkTimeSeconds: parseInt(row.total_talk_time),
        avgCallDurationSeconds: Math.round(parseFloat(row.avg_call_duration))
      }
    }));

    return c.json({
      success: true,
      timeRange,
      agents
    });
  } catch (error) {
    console.error('Error fetching agent list:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/analytics/agents/:agentId/details
 * Get detailed performance metrics for a specific agent
 */
agentAnalytics.get('/:agentId/details', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const agentId = c.req.param('agentId');
    const timeRange = c.req.query('timeRange') || '7d';
    const dateFilter = getDateFilter(timeRange);

    // Agent basic info
    const agentQuery = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.status,
        u.created_at,
        json_agg(json_build_object('extension', ae.extension, 'status', ae.status))
          FILTER (WHERE ae.extension IS NOT NULL) as extensions
      FROM users u
      LEFT JOIN agent_extensions ae ON ae.user_id = u.id AND ae.tenant_id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2
      GROUP BY u.id
    `;

    const agentResult = await pool.query(agentQuery, [agentId, tenantId]);

    if (agentResult.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    const agent = agentResult.rows[0];

    // Call statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_calls,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_calls,
        COUNT(*) FILTER (WHERE answered_at IS NOT NULL) as answered_calls,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND answered_at IS NULL) as missed_calls,
        COALESCE(SUM(duration_seconds) FILTER (WHERE answered_at IS NOT NULL), 0) as total_talk_time,
        COALESCE(AVG(duration_seconds) FILTER (WHERE answered_at IS NOT NULL), 0) as avg_duration,
        COALESCE(MAX(duration_seconds), 0) as longest_call,
        COALESCE(MIN(duration_seconds) FILTER (WHERE duration_seconds > 0), 0) as shortest_call
      FROM calls
      WHERE user_id = $1 AND tenant_id = $2
        ${dateFilter}
    `;

    const stats = await pool.query(statsQuery, [agentId, tenantId]);

    // Call trends (calls per day for chart)
    const trendsQuery = `
      SELECT
        DATE(answered_at) as call_date,
        COUNT(*) as call_count,
        COALESCE(AVG(duration_seconds), 0) as avg_duration
      FROM calls
      WHERE user_id = $1 AND tenant_id = $2
        AND answered_at IS NOT NULL
        ${dateFilter}
      GROUP BY DATE(answered_at)
      ORDER BY call_date DESC
      LIMIT 30
    `;

    const trends = await pool.query(trendsQuery, [agentId, tenantId]);

    // Recent calls
    const recentCallsQuery = `
      SELECT
        id,
        call_sid,
        direction,
        from_number,
        to_number,
        status,
        duration_seconds,
        answered_at,
        ended_at
      FROM calls
      WHERE user_id = $1 AND tenant_id = $2
      ORDER BY initiated_at DESC
      LIMIT 20
    `;

    const recentCalls = await pool.query(recentCallsQuery, [agentId, tenantId]);

    return c.json({
      success: true,
      timeRange,
      agent: {
        id: agent.id,
        email: agent.email,
        firstName: agent.first_name,
        lastName: agent.last_name,
        name: `${agent.first_name} ${agent.last_name}`,
        status: agent.status,
        extensions: agent.extensions || [],
        joinedAt: agent.created_at
      },
      statistics: {
        totalCalls: parseInt(stats.rows[0].total_calls),
        inboundCalls: parseInt(stats.rows[0].inbound_calls),
        outboundCalls: parseInt(stats.rows[0].outbound_calls),
        answeredCalls: parseInt(stats.rows[0].answered_calls),
        missedCalls: parseInt(stats.rows[0].missed_calls),
        totalTalkTimeSeconds: parseInt(stats.rows[0].total_talk_time),
        avgDurationSeconds: Math.round(parseFloat(stats.rows[0].avg_duration)),
        longestCallSeconds: parseInt(stats.rows[0].longest_call),
        shortestCallSeconds: parseInt(stats.rows[0].shortest_call)
      },
      trends: trends.rows.map(row => ({
        date: row.call_date,
        callCount: parseInt(row.call_count),
        avgDuration: Math.round(parseFloat(row.avg_duration))
      })),
      recentCalls: recentCalls.rows
    });
  } catch (error) {
    console.error('Error fetching agent details:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/analytics/agents/leaderboard
 * Get top performing agents
 */
agentAnalytics.get('/leaderboard', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const timeRange = c.req.query('timeRange') || '24h';
    const metric = c.req.query('metric') || 'calls'; // calls, duration, answered
    const limit = parseInt(c.req.query('limit') || '10');
    const dateFilter = getDateFilter(timeRange);

    let orderBy = 'total_calls DESC';
    if (metric === 'duration') {
      orderBy = 'total_talk_time DESC';
    } else if (metric === 'answered') {
      orderBy = 'answered_calls DESC';
    }

    const query = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(c.id) as total_calls,
        COUNT(c.id) FILTER (WHERE c.answered_at IS NOT NULL) as answered_calls,
        COALESCE(SUM(c.duration_seconds) FILTER (WHERE c.answered_at IS NOT NULL), 0) as total_talk_time,
        COALESCE(AVG(c.duration_seconds) FILTER (WHERE c.answered_at IS NOT NULL), 0) as avg_duration
      FROM users u
      INNER JOIN calls c ON c.user_id = u.id AND c.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1
        AND u.role IN ('agent', 'supervisor', 'admin')
        ${dateFilter}
      GROUP BY u.id, u.email, u.first_name, u.last_name
      ORDER BY ${orderBy}
      LIMIT $2
    `;

    const { rows } = await pool.query(query, [tenantId, limit]);

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      agentId: row.id,
      agentName: `${row.first_name} ${row.last_name}`,
      email: row.email,
      totalCalls: parseInt(row.total_calls),
      answeredCalls: parseInt(row.answered_calls),
      totalTalkTimeSeconds: parseInt(row.total_talk_time),
      avgDurationSeconds: Math.round(parseFloat(row.avg_duration))
    }));

    return c.json({
      success: true,
      timeRange,
      metric,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/analytics/agents/charts/calls-by-hour
 * Get calls distribution by hour of day
 */
agentAnalytics.get('/charts/calls-by-hour', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const timeRange = c.req.query('timeRange') || '7d';
    const dateFilter = getDateFilter(timeRange);

    const query = `
      SELECT
        EXTRACT(HOUR FROM answered_at) as hour,
        COUNT(*) as call_count
      FROM calls
      WHERE tenant_id = $1
        AND user_id IS NOT NULL
        AND answered_at IS NOT NULL
        ${dateFilter}
      GROUP BY EXTRACT(HOUR FROM answered_at)
      ORDER BY hour
    `;

    const { rows } = await pool.query(query, [tenantId]);

    // Fill in missing hours with 0
    const hourlyData = Array(24).fill(0);
    rows.forEach(row => {
      hourlyData[parseInt(row.hour)] = parseInt(row.call_count);
    });

    return c.json({
      success: true,
      timeRange,
      data: hourlyData.map((count, hour) => ({
        hour,
        callCount: count
      }))
    });
  } catch (error) {
    console.error('Error fetching hourly chart data:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get SQL date filter based on time range
 */
function getDateFilter(timeRange) {
  const filters = {
    '1h': "AND initiated_at >= NOW() - INTERVAL '1 hour'",
    '24h': "AND initiated_at >= NOW() - INTERVAL '24 hours'",
    '7d': "AND initiated_at >= NOW() - INTERVAL '7 days'",
    '30d': "AND initiated_at >= NOW() - INTERVAL '30 days'",
    '90d': "AND initiated_at >= NOW() - INTERVAL '90 days'",
    'all': ''
  };

  return filters[timeRange] || filters['24h'];
}

export default agentAnalytics;
