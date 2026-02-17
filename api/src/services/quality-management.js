/**
 * Quality Management Service
 * Handles scorecards, evaluations, coaching, and calibration
 */

import pool from '../db/connection.js';

// =============================================================================
// SCORECARDS
// =============================================================================

export async function listScorecards(tenantId, { category, active } = {}) {
  let query = `
    SELECT s.*,
           (SELECT COUNT(*) FROM quality_scorecard_sections WHERE scorecard_id = s.id) as section_count,
           (SELECT COUNT(*) FROM quality_evaluations WHERE scorecard_id = s.id AND status = 'completed') as usage_count
    FROM quality_scorecards s
    WHERE s.tenant_id = $1
  `;
  const params = [tenantId];

  if (category) {
    params.push(category);
    query += ` AND s.category = $${params.length}`;
  }

  if (active !== undefined) {
    params.push(active);
    query += ` AND s.is_active = $${params.length}`;
  }

  query += ' ORDER BY s.name';

  const result = await pool.query(query, params);
  return result.rows;
}

export async function getScorecard(tenantId, scorecardId) {
  // Get scorecard
  const scorecardResult = await pool.query(
    `SELECT * FROM quality_scorecards WHERE id = $1 AND tenant_id = $2`,
    [scorecardId, tenantId]
  );

  if (!scorecardResult.rows[0]) return null;

  const scorecard = scorecardResult.rows[0];

  // Get sections with criteria
  const sectionsResult = await pool.query(
    `SELECT * FROM quality_scorecard_sections WHERE scorecard_id = $1 ORDER BY sort_order`,
    [scorecardId]
  );

  for (const section of sectionsResult.rows) {
    const criteriaResult = await pool.query(
      `SELECT c.*, json_agg(o.*) FILTER (WHERE o.id IS NOT NULL) as options
       FROM quality_criteria c
       LEFT JOIN quality_criteria_options o ON c.id = o.criteria_id
       WHERE c.section_id = $1
       GROUP BY c.id
       ORDER BY c.sort_order`,
      [section.id]
    );
    section.criteria = criteriaResult.rows;
  }

  scorecard.sections = sectionsResult.rows;
  return scorecard;
}

export async function createScorecard(tenantId, data, createdBy) {
  const result = await pool.query(
    `INSERT INTO quality_scorecards (tenant_id, name, description, category, passing_score, auto_fail_enabled, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, data.name, data.description, data.category || 'general', data.passing_score || 70, data.auto_fail_enabled || false, createdBy]
  );
  return result.rows[0];
}

export async function updateScorecard(tenantId, scorecardId, data) {
  const result = await pool.query(
    `UPDATE quality_scorecards SET
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       category = COALESCE($5, category),
       passing_score = COALESCE($6, passing_score),
       auto_fail_enabled = COALESCE($7, auto_fail_enabled),
       is_active = COALESCE($8, is_active),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [scorecardId, tenantId, data.name, data.description, data.category, data.passing_score, data.auto_fail_enabled, data.is_active]
  );
  return result.rows[0];
}

export async function deleteScorecard(tenantId, scorecardId) {
  await pool.query(
    `DELETE FROM quality_scorecards WHERE id = $1 AND tenant_id = $2`,
    [scorecardId, tenantId]
  );
}

// =============================================================================
// SECTIONS
// =============================================================================

export async function addSection(tenantId, scorecardId, data) {
  // Verify scorecard belongs to tenant
  const check = await pool.query(
    `SELECT id FROM quality_scorecards WHERE id = $1 AND tenant_id = $2`,
    [scorecardId, tenantId]
  );
  if (!check.rows[0]) throw new Error('Scorecard not found');

  const result = await pool.query(
    `INSERT INTO quality_scorecard_sections (scorecard_id, name, description, weight, sort_order)
     VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quality_scorecard_sections WHERE scorecard_id = $1)))
     RETURNING *`,
    [scorecardId, data.name, data.description, data.weight || 0, data.sort_order]
  );
  return result.rows[0];
}

export async function updateSection(tenantId, sectionId, data) {
  const result = await pool.query(
    `UPDATE quality_scorecard_sections SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       weight = COALESCE($4, weight),
       sort_order = COALESCE($5, sort_order)
     WHERE id = $1
     AND scorecard_id IN (SELECT id FROM quality_scorecards WHERE tenant_id = $6)
     RETURNING *`,
    [sectionId, data.name, data.description, data.weight, data.sort_order, tenantId]
  );
  return result.rows[0];
}

export async function deleteSection(tenantId, sectionId) {
  await pool.query(
    `DELETE FROM quality_scorecard_sections
     WHERE id = $1
     AND scorecard_id IN (SELECT id FROM quality_scorecards WHERE tenant_id = $2)`,
    [sectionId, tenantId]
  );
}

// =============================================================================
// CRITERIA
// =============================================================================

export async function addCriteria(tenantId, sectionId, data) {
  // Verify section belongs to tenant's scorecard
  const check = await pool.query(
    `SELECT s.id FROM quality_scorecard_sections s
     JOIN quality_scorecards sc ON s.scorecard_id = sc.id
     WHERE s.id = $1 AND sc.tenant_id = $2`,
    [sectionId, tenantId]
  );
  if (!check.rows[0]) throw new Error('Section not found');

  const result = await pool.query(
    `INSERT INTO quality_criteria (section_id, name, description, criteria_type, max_points, weight, is_auto_fail, is_required, guidance_text, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quality_criteria WHERE section_id = $1)))
     RETURNING *`,
    [sectionId, data.name, data.description, data.criteria_type || 'rating', data.max_points || 10, data.weight || 1, data.is_auto_fail || false, data.is_required !== false, data.guidance_text, data.sort_order]
  );

  // Add options if provided
  if (data.options && data.options.length > 0) {
    for (let i = 0; i < data.options.length; i++) {
      const opt = data.options[i];
      await pool.query(
        `INSERT INTO quality_criteria_options (criteria_id, label, value, description, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [result.rows[0].id, opt.label, opt.value, opt.description, i + 1]
      );
    }
  }

  return result.rows[0];
}

export async function updateCriteria(tenantId, criteriaId, data) {
  const result = await pool.query(
    `UPDATE quality_criteria SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       criteria_type = COALESCE($4, criteria_type),
       max_points = COALESCE($5, max_points),
       weight = COALESCE($6, weight),
       is_auto_fail = COALESCE($7, is_auto_fail),
       is_required = COALESCE($8, is_required),
       guidance_text = COALESCE($9, guidance_text),
       sort_order = COALESCE($10, sort_order)
     WHERE id = $1
     AND section_id IN (
       SELECT s.id FROM quality_scorecard_sections s
       JOIN quality_scorecards sc ON s.scorecard_id = sc.id
       WHERE sc.tenant_id = $11
     )
     RETURNING *`,
    [criteriaId, data.name, data.description, data.criteria_type, data.max_points, data.weight, data.is_auto_fail, data.is_required, data.guidance_text, data.sort_order, tenantId]
  );
  return result.rows[0];
}

export async function deleteCriteria(tenantId, criteriaId) {
  await pool.query(
    `DELETE FROM quality_criteria
     WHERE id = $1
     AND section_id IN (
       SELECT s.id FROM quality_scorecard_sections s
       JOIN quality_scorecards sc ON s.scorecard_id = sc.id
       WHERE sc.tenant_id = $2
     )`,
    [criteriaId, tenantId]
  );
}

// =============================================================================
// EVALUATIONS
// =============================================================================

export async function listEvaluations(tenantId, { agentId, evaluatorId, status, startDate, endDate, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT e.*,
           sc.name as scorecard_name,
           a.name as agent_name,
           ev.name as evaluator_name
    FROM quality_evaluations e
    JOIN quality_scorecards sc ON e.scorecard_id = sc.id
    JOIN agents a ON e.agent_id = a.id
    JOIN agents ev ON e.evaluator_id = ev.id
    WHERE e.tenant_id = $1
  `;
  const params = [tenantId];

  if (agentId) {
    params.push(agentId);
    query += ` AND e.agent_id = $${params.length}`;
  }

  if (evaluatorId) {
    params.push(evaluatorId);
    query += ` AND e.evaluator_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    query += ` AND e.status = $${params.length}`;
  }

  if (startDate) {
    params.push(startDate);
    query += ` AND e.created_at >= $${params.length}`;
  }

  if (endDate) {
    params.push(endDate);
    query += ` AND e.created_at <= $${params.length}`;
  }

  params.push(limit, offset);
  query += ` ORDER BY e.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

export async function getEvaluation(tenantId, evaluationId) {
  const evalResult = await pool.query(
    `SELECT e.*,
            sc.name as scorecard_name,
            a.name as agent_name,
            ev.name as evaluator_name
     FROM quality_evaluations e
     JOIN quality_scorecards sc ON e.scorecard_id = sc.id
     JOIN agents a ON e.agent_id = a.id
     JOIN agents ev ON e.evaluator_id = ev.id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [evaluationId, tenantId]
  );

  if (!evalResult.rows[0]) return null;

  const evaluation = evalResult.rows[0];

  // Get responses
  const responsesResult = await pool.query(
    `SELECT r.*, c.name as criteria_name, c.criteria_type, c.max_points, c.is_auto_fail,
            s.name as section_name
     FROM quality_evaluation_responses r
     JOIN quality_criteria c ON r.criteria_id = c.id
     JOIN quality_scorecard_sections s ON c.section_id = s.id
     WHERE r.evaluation_id = $1
     ORDER BY s.sort_order, c.sort_order`,
    [evaluationId]
  );

  evaluation.responses = responsesResult.rows;
  return evaluation;
}

export async function createEvaluation(tenantId, data) {
  const result = await pool.query(
    `INSERT INTO quality_evaluations (tenant_id, scorecard_id, call_id, agent_id, evaluator_id, evaluation_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, data.scorecard_id, data.call_id, data.agent_id, data.evaluator_id, data.evaluation_type || 'random']
  );
  return result.rows[0];
}

export async function submitEvaluation(tenantId, evaluationId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get evaluation and scorecard
    const evalResult = await client.query(
      `SELECT e.*, sc.passing_score, sc.auto_fail_enabled
       FROM quality_evaluations e
       JOIN quality_scorecards sc ON e.scorecard_id = sc.id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [evaluationId, tenantId]
    );

    if (!evalResult.rows[0]) {
      throw new Error('Evaluation not found');
    }

    const evaluation = evalResult.rows[0];

    // Save responses
    let totalScore = 0;
    let maxScore = 0;
    let autoFailed = false;
    let autoFailReason = null;

    for (const response of data.responses) {
      // Get criteria details
      const criteriaResult = await client.query(
        `SELECT * FROM quality_criteria WHERE id = $1`,
        [response.criteria_id]
      );
      const criteria = criteriaResult.rows[0];

      if (!criteria) continue;

      maxScore += criteria.max_points * criteria.weight;

      // Check auto-fail
      if (criteria.is_auto_fail && response.score === 0) {
        autoFailed = true;
        autoFailReason = `Failed auto-fail criteria: ${criteria.name}`;
      }

      // Calculate weighted score
      totalScore += (response.score || 0) * criteria.weight;

      // Insert response
      await client.query(
        `INSERT INTO quality_evaluation_responses (evaluation_id, criteria_id, score, selected_option_id, text_response, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [evaluationId, response.criteria_id, response.score, response.selected_option_id, response.text_response, response.notes]
      );
    }

    // Calculate final score percentage
    const finalScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const passed = !autoFailed && finalScore >= evaluation.passing_score;

    // Update evaluation
    await client.query(
      `UPDATE quality_evaluations SET
         status = 'completed',
         total_score = $3,
         passing_score = $4,
         passed = $5,
         auto_failed = $6,
         auto_fail_reason = $7,
         feedback = $8,
         completed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [evaluationId, tenantId, finalScore, evaluation.passing_score, passed, autoFailed, autoFailReason, data.feedback]
    );

    await client.query('COMMIT');

    return getEvaluation(tenantId, evaluationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function disputeEvaluation(tenantId, evaluationId, agentId, reason) {
  const result = await pool.query(
    `UPDATE quality_evaluations SET
       dispute_reason = $3,
       dispute_status = 'pending',
       agent_comments = COALESCE(agent_comments || E'\n\n', '') || $3,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND agent_id = $4 AND status = 'completed'
     RETURNING *`,
    [evaluationId, tenantId, reason, agentId]
  );
  return result.rows[0];
}

export async function resolveDispute(tenantId, evaluationId, resolverId, status, notes) {
  const result = await pool.query(
    `UPDATE quality_evaluations SET
       dispute_status = $3,
       dispute_resolved_at = NOW(),
       dispute_resolved_by = $4,
       feedback = COALESCE(feedback || E'\n\n', '') || 'Dispute Resolution: ' || $5,
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND dispute_status = 'pending'
     RETURNING *`,
    [evaluationId, tenantId, status, resolverId, notes]
  );
  return result.rows[0];
}

// =============================================================================
// COACHING SESSIONS
// =============================================================================

export async function listCoachingSessions(tenantId, { agentId, coachId, status, limit = 50, offset = 0 } = {}) {
  let query = `
    SELECT cs.*,
           a.name as agent_name,
           c.name as coach_name,
           e.total_score as evaluation_score
    FROM quality_coaching_sessions cs
    JOIN agents a ON cs.agent_id = a.id
    JOIN agents c ON cs.coach_id = c.id
    LEFT JOIN quality_evaluations e ON cs.evaluation_id = e.id
    WHERE cs.tenant_id = $1
  `;
  const params = [tenantId];

  if (agentId) {
    params.push(agentId);
    query += ` AND cs.agent_id = $${params.length}`;
  }

  if (coachId) {
    params.push(coachId);
    query += ` AND cs.coach_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    query += ` AND cs.status = $${params.length}`;
  }

  params.push(limit, offset);
  query += ` ORDER BY cs.scheduled_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

export async function createCoachingSession(tenantId, data) {
  const result = await pool.query(
    `INSERT INTO quality_coaching_sessions (tenant_id, agent_id, coach_id, evaluation_id, session_type, title, focus_areas, scheduled_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [tenantId, data.agent_id, data.coach_id, data.evaluation_id, data.session_type || 'one_on_one', data.title, data.focus_areas || [], data.scheduled_at, data.notes]
  );
  return result.rows[0];
}

export async function updateCoachingSession(tenantId, sessionId, data) {
  const result = await pool.query(
    `UPDATE quality_coaching_sessions SET
       status = COALESCE($3, status),
       title = COALESCE($4, title),
       focus_areas = COALESCE($5, focus_areas),
       scheduled_at = COALESCE($6, scheduled_at),
       completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
       duration_minutes = COALESCE($7, duration_minutes),
       notes = COALESCE($8, notes),
       action_items = COALESCE($9, action_items),
       follow_up_date = COALESCE($10, follow_up_date),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [sessionId, tenantId, data.status, data.title, data.focus_areas, data.scheduled_at, data.duration_minutes, data.notes, JSON.stringify(data.action_items || []), data.follow_up_date]
  );
  return result.rows[0];
}

// =============================================================================
// CALIBRATION SESSIONS
// =============================================================================

export async function listCalibrationSessions(tenantId, { status, limit = 20, offset = 0 } = {}) {
  let query = `
    SELECT cs.*,
           sc.name as scorecard_name,
           f.name as facilitator_name,
           (SELECT COUNT(*) FROM quality_calibration_participants WHERE session_id = cs.id) as participant_count
    FROM quality_calibration_sessions cs
    LEFT JOIN quality_scorecards sc ON cs.scorecard_id = sc.id
    LEFT JOIN agents f ON cs.facilitator_id = f.id
    WHERE cs.tenant_id = $1
  `;
  const params = [tenantId];

  if (status) {
    params.push(status);
    query += ` AND cs.status = $${params.length}`;
  }

  params.push(limit, offset);
  query += ` ORDER BY cs.scheduled_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

export async function createCalibrationSession(tenantId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `INSERT INTO quality_calibration_sessions (tenant_id, name, description, scorecard_id, call_id, facilitator_id, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, data.name, data.description, data.scorecard_id, data.call_id, data.facilitator_id, data.scheduled_at, data.notes]
    );

    const session = sessionResult.rows[0];

    // Add participants
    if (data.participant_ids && data.participant_ids.length > 0) {
      for (const participantId of data.participant_ids) {
        await client.query(
          `INSERT INTO quality_calibration_participants (session_id, evaluator_id) VALUES ($1, $2)`,
          [session.id, participantId]
        );
      }
    }

    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// ANALYTICS
// =============================================================================

export async function getAgentQualityStats(tenantId, agentId, startDate, endDate) {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_evaluations,
       AVG(total_score) as avg_score,
       MIN(total_score) as min_score,
       MAX(total_score) as max_score,
       COUNT(*) FILTER (WHERE passed = true) as passed_count,
       COUNT(*) FILTER (WHERE passed = false) as failed_count,
       ROUND(100.0 * COUNT(*) FILTER (WHERE passed = true) / NULLIF(COUNT(*), 0), 2) as pass_rate,
       COUNT(*) FILTER (WHERE auto_failed = true) as auto_fail_count
     FROM quality_evaluations
     WHERE tenant_id = $1 AND agent_id = $2 AND status = 'completed'
     AND created_at >= $3 AND created_at <= $4`,
    [tenantId, agentId, startDate, endDate]
  );
  return result.rows[0];
}

export async function getTeamQualityStats(tenantId, startDate, endDate) {
  const result = await pool.query(
    `SELECT
       e.agent_id,
       a.name as agent_name,
       COUNT(*) as evaluations,
       AVG(e.total_score) as avg_score,
       ROUND(100.0 * COUNT(*) FILTER (WHERE e.passed = true) / NULLIF(COUNT(*), 0), 2) as pass_rate,
       COUNT(*) FILTER (WHERE e.auto_failed = true) as auto_fails
     FROM quality_evaluations e
     JOIN agents a ON e.agent_id = a.id
     WHERE e.tenant_id = $1 AND e.status = 'completed'
     AND e.created_at >= $2 AND e.created_at <= $3
     GROUP BY e.agent_id, a.name
     ORDER BY avg_score DESC`,
    [tenantId, startDate, endDate]
  );
  return result.rows;
}

export async function getQualityTrends(tenantId, agentId, period = 'daily', days = 30) {
  const result = await pool.query(
    `SELECT
       DATE_TRUNC($3, created_at) as period,
       COUNT(*) as evaluations,
       AVG(total_score) as avg_score,
       ROUND(100.0 * COUNT(*) FILTER (WHERE passed = true) / NULLIF(COUNT(*), 0), 2) as pass_rate
     FROM quality_evaluations
     WHERE tenant_id = $1
     AND ($2::integer IS NULL OR agent_id = $2)
     AND status = 'completed'
     AND created_at >= NOW() - ($4 || ' days')::interval
     GROUP BY DATE_TRUNC($3, created_at)
     ORDER BY period`,
    [tenantId, agentId, period === 'weekly' ? 'week' : 'day', days]
  );
  return result.rows;
}

export async function getCriteriaPerformance(tenantId, scorecardId, startDate, endDate) {
  const result = await pool.query(
    `SELECT
       c.id as criteria_id,
       c.name as criteria_name,
       s.name as section_name,
       AVG(r.score) as avg_score,
       c.max_points,
       ROUND(100.0 * AVG(r.score) / c.max_points, 2) as score_percentage,
       COUNT(*) as response_count
     FROM quality_evaluation_responses r
     JOIN quality_criteria c ON r.criteria_id = c.id
     JOIN quality_scorecard_sections s ON c.section_id = s.id
     JOIN quality_evaluations e ON r.evaluation_id = e.id
     WHERE e.tenant_id = $1 AND e.scorecard_id = $2
     AND e.status = 'completed'
     AND e.created_at >= $3 AND e.created_at <= $4
     GROUP BY c.id, c.name, s.name, c.max_points, s.sort_order, c.sort_order
     ORDER BY s.sort_order, c.sort_order`,
    [tenantId, scorecardId, startDate, endDate]
  );
  return result.rows;
}
