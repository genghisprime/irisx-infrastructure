/**
 * Admin Incidents API Routes
 *
 * Endpoints for incident management, escalation policies, and runbooks
 */

import { Router } from 'express';
import incidentResponseService, { SEVERITY, STATUS } from '../services/incident-response.js';

const router = Router();

/**
 * GET /admin/incidents
 * List all incidents with filtering
 */
router.get('/', async (req, res) => {
  try {
    const { status, severity, tenant_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT i.*, t.company_name as tenant_name
      FROM incidents i
      LEFT JOIN tenants t ON i.tenant_id = t.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status) {
      if (status === 'active') {
        query += ` AND i.status NOT IN ('resolved', 'closed')`;
      } else {
        query += ` AND i.status = $${paramIdx++}`;
        params.push(status);
      }
    }

    if (severity) {
      query += ` AND i.severity = $${paramIdx++}`;
      params.push(severity);
    }

    if (tenant_id) {
      query += ` AND i.tenant_id = $${paramIdx++}`;
      params.push(tenant_id);
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
    params.push(parseInt(limit), parseInt(offset));

    const { pool } = await import('../db.js');
    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM incidents WHERE 1=1`;
    if (status === 'active') {
      countQuery += ` AND status NOT IN ('resolved', 'closed')`;
    }

    const countResult = await pool.query(countQuery);

    res.json({
      incidents: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error listing incidents:', error);
    res.status(500).json({ error: 'Failed to list incidents' });
  }
});

/**
 * GET /admin/incidents/stats
 * Get incident statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await incidentResponseService.getIncidentStats(parseInt(days));

    // Get daily breakdown
    const { pool } = await import('../db.js');
    const dailyResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count,
        severity
      FROM incidents
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at), severity
      ORDER BY date DESC
    `);

    res.json({
      summary: stats,
      daily: dailyResult.rows
    });
  } catch (error) {
    console.error('Error getting incident stats:', error);
    res.status(500).json({ error: 'Failed to get incident stats' });
  }
});

/**
 * GET /admin/incidents/:id
 * Get incident details with timeline
 */
router.get('/:id', async (req, res) => {
  try {
    const incident = await incidentResponseService.getIncident(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json({ incident });
  } catch (error) {
    console.error('Error getting incident:', error);
    res.status(500).json({ error: 'Failed to get incident' });
  }
});

/**
 * POST /admin/incidents
 * Create a new incident manually
 */
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      severity = SEVERITY.MEDIUM,
      tenant_id,
      affected_services = [],
      tags = [],
      metadata = {}
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await incidentResponseService.createIncident({
      title,
      description,
      severity,
      source: 'manual',
      tenant_id,
      affected_services,
      tags,
      metadata
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

/**
 * POST /admin/incidents/:id/acknowledge
 * Acknowledge an incident
 */
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const { note } = req.body;
    const userId = req.admin?.id;

    const incident = await incidentResponseService.acknowledgeIncident(
      req.params.id,
      userId,
      note
    );

    res.json({ incident });
  } catch (error) {
    console.error('Error acknowledging incident:', error);
    res.status(500).json({ error: error.message || 'Failed to acknowledge incident' });
  }
});

/**
 * PATCH /admin/incidents/:id/status
 * Update incident status
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, note } = req.body;
    const userId = req.admin?.id;

    if (!Object.values(STATUS).includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const incident = await incidentResponseService.updateIncidentStatus(
      req.params.id,
      status,
      userId,
      note
    );

    res.json({ incident });
  } catch (error) {
    console.error('Error updating incident status:', error);
    res.status(500).json({ error: error.message || 'Failed to update incident status' });
  }
});

/**
 * POST /admin/incidents/:id/timeline
 * Add a timeline entry to an incident
 */
router.post('/:id/timeline', async (req, res) => {
  try {
    const { action, description, metadata = {} } = req.body;
    const userId = req.admin?.id;

    if (!action || !description) {
      return res.status(400).json({ error: 'Action and description are required' });
    }

    const { pool } = await import('../db.js');
    await incidentResponseService.addTimelineEntry(pool, req.params.id, {
      action,
      description,
      actor: 'admin',
      actor_id: userId,
      metadata
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding timeline entry:', error);
    res.status(500).json({ error: 'Failed to add timeline entry' });
  }
});

// ============================================
// Escalation Policies
// ============================================

/**
 * GET /admin/incidents/policies/list
 * List all escalation policies
 */
router.get('/policies/list', async (req, res) => {
  try {
    const policies = await incidentResponseService.listEscalationPolicies();
    res.json({ policies });
  } catch (error) {
    console.error('Error listing escalation policies:', error);
    res.status(500).json({ error: 'Failed to list escalation policies' });
  }
});

/**
 * POST /admin/incidents/policies
 * Create or update an escalation policy
 */
router.post('/policies', async (req, res) => {
  try {
    const policy = await incidentResponseService.upsertEscalationPolicy(req.body);
    res.status(201).json({ policy });
  } catch (error) {
    console.error('Error saving escalation policy:', error);
    res.status(500).json({ error: 'Failed to save escalation policy' });
  }
});

/**
 * DELETE /admin/incidents/policies/:id
 * Delete an escalation policy
 */
router.delete('/policies/:id', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    await pool.query('DELETE FROM escalation_policies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting escalation policy:', error);
    res.status(500).json({ error: 'Failed to delete escalation policy' });
  }
});

// ============================================
// Runbooks
// ============================================

/**
 * GET /admin/incidents/runbooks/list
 * List all runbooks
 */
router.get('/runbooks/list', async (req, res) => {
  try {
    const runbooks = await incidentResponseService.listRunbooks();
    res.json({ runbooks });
  } catch (error) {
    console.error('Error listing runbooks:', error);
    res.status(500).json({ error: 'Failed to list runbooks' });
  }
});

/**
 * POST /admin/incidents/runbooks
 * Create or update a runbook
 */
router.post('/runbooks', async (req, res) => {
  try {
    const runbook = await incidentResponseService.upsertRunbook(req.body);
    res.status(201).json({ runbook });
  } catch (error) {
    console.error('Error saving runbook:', error);
    res.status(500).json({ error: 'Failed to save runbook' });
  }
});

/**
 * POST /admin/incidents/runbooks/:id/execute
 * Manually execute a runbook
 */
router.post('/runbooks/:id/execute', async (req, res) => {
  try {
    const { incident_id } = req.body;

    const { pool } = await import('../db.js');
    const client = await pool.connect();

    try {
      // Get runbook
      const runbookResult = await client.query(
        'SELECT * FROM runbooks WHERE id = $1',
        [req.params.id]
      );

      if (runbookResult.rows.length === 0) {
        return res.status(404).json({ error: 'Runbook not found' });
      }

      // Get incident if provided
      let incident = null;
      if (incident_id) {
        const incidentResult = await client.query(
          'SELECT * FROM incidents WHERE id = $1',
          [incident_id]
        );
        incident = incidentResult.rows[0];
      }

      // Execute runbook
      const runbook = runbookResult.rows[0];
      const steps = typeof runbook.steps === 'string'
        ? JSON.parse(runbook.steps)
        : runbook.steps;

      const results = [];
      for (const step of steps) {
        const stepResult = await incidentResponseService.executeRunbookStep(
          client,
          incident || { id: 'manual' },
          step
        );
        results.push({ step: step.name, ...stepResult });

        if (!stepResult.success && step.stop_on_failure) {
          break;
        }
      }

      // Record execution
      await client.query(`
        INSERT INTO runbook_executions (runbook_id, incident_id, results, executed_by, executed_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [req.params.id, incident_id, JSON.stringify(results), req.admin?.id]);

      res.json({ success: true, results });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error executing runbook:', error);
    res.status(500).json({ error: 'Failed to execute runbook' });
  }
});

/**
 * DELETE /admin/incidents/runbooks/:id
 * Delete a runbook
 */
router.delete('/runbooks/:id', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    await pool.query('DELETE FROM runbooks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting runbook:', error);
    res.status(500).json({ error: 'Failed to delete runbook' });
  }
});

// ============================================
// On-Call Schedules
// ============================================

/**
 * GET /admin/incidents/oncall
 * Get current on-call assignments
 */
router.get('/oncall', async (req, res) => {
  try {
    const { pool } = await import('../db.js');

    const result = await pool.query(`
      SELECT
        ocs.name as schedule_name,
        oca.user_email,
        oca.user_phone,
        oca.start_time,
        oca.end_time,
        oca.is_override
      FROM on_call_assignments oca
      JOIN on_call_schedules ocs ON oca.schedule_id = ocs.id
      WHERE NOW() BETWEEN oca.start_time AND oca.end_time
        AND ocs.is_active = true
      ORDER BY oca.is_override DESC, ocs.name
    `);

    res.json({ oncall: result.rows });
  } catch (error) {
    console.error('Error getting on-call assignments:', error);
    res.status(500).json({ error: 'Failed to get on-call assignments' });
  }
});

/**
 * GET /admin/incidents/oncall/schedules
 * List all on-call schedules
 */
router.get('/oncall/schedules', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query('SELECT * FROM on_call_schedules ORDER BY name');
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error('Error listing on-call schedules:', error);
    res.status(500).json({ error: 'Failed to list on-call schedules' });
  }
});

/**
 * POST /admin/incidents/oncall/schedules
 * Create or update an on-call schedule
 */
router.post('/oncall/schedules', async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      schedule_type = 'rotation',
      rotation_interval_hours = 168,
      members = [],
      timezone = 'UTC',
      is_active = true
    } = req.body;

    const { pool } = await import('../db.js');

    let result;
    if (id) {
      result = await pool.query(`
        UPDATE on_call_schedules
        SET name = $1, description = $2, schedule_type = $3, rotation_interval_hours = $4,
            members = $5, timezone = $6, is_active = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [name, description, schedule_type, rotation_interval_hours, JSON.stringify(members), timezone, is_active, id]);
    } else {
      result = await pool.query(`
        INSERT INTO on_call_schedules (name, description, schedule_type, rotation_interval_hours, members, timezone, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [name, description, schedule_type, rotation_interval_hours, JSON.stringify(members), timezone, is_active]);
    }

    res.status(201).json({ schedule: result.rows[0] });
  } catch (error) {
    console.error('Error saving on-call schedule:', error);
    res.status(500).json({ error: 'Failed to save on-call schedule' });
  }
});

// ============================================
// Post-Mortems
// ============================================

/**
 * GET /admin/incidents/:id/postmortem
 * Get post-mortem for an incident
 */
router.get('/:id/postmortem', async (req, res) => {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      'SELECT * FROM incident_postmortems WHERE incident_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.json({ postmortem: null });
    }

    res.json({ postmortem: result.rows[0] });
  } catch (error) {
    console.error('Error getting post-mortem:', error);
    res.status(500).json({ error: 'Failed to get post-mortem' });
  }
});

/**
 * POST /admin/incidents/:id/postmortem
 * Create or update post-mortem for an incident
 */
router.post('/:id/postmortem', async (req, res) => {
  try {
    const {
      summary,
      root_cause,
      contributing_factors = [],
      action_items = [],
      lessons_learned,
      preventive_measures,
      status = 'draft'
    } = req.body;

    const { pool } = await import('../db.js');

    // Check if postmortem exists
    const existing = await pool.query(
      'SELECT id FROM incident_postmortems WHERE incident_id = $1',
      [req.params.id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(`
        UPDATE incident_postmortems
        SET summary = $1, root_cause = $2, contributing_factors = $3, action_items = $4,
            lessons_learned = $5, preventive_measures = $6, status = $7, owner_id = $8,
            updated_at = NOW(),
            published_at = CASE WHEN $7 = 'published' THEN NOW() ELSE published_at END
        WHERE incident_id = $9
        RETURNING *
      `, [
        summary, root_cause, JSON.stringify(contributing_factors), JSON.stringify(action_items),
        lessons_learned, preventive_measures, status, req.admin?.id, req.params.id
      ]);
    } else {
      result = await pool.query(`
        INSERT INTO incident_postmortems (
          incident_id, summary, root_cause, contributing_factors, action_items,
          lessons_learned, preventive_measures, status, owner_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *
      `, [
        req.params.id, summary, root_cause, JSON.stringify(contributing_factors),
        JSON.stringify(action_items), lessons_learned, preventive_measures, status, req.admin?.id
      ]);
    }

    res.status(201).json({ postmortem: result.rows[0] });
  } catch (error) {
    console.error('Error saving post-mortem:', error);
    res.status(500).json({ error: 'Failed to save post-mortem' });
  }
});

export default router;
