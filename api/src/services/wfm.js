/**
 * Workforce Management Service
 * Shift scheduling, forecasting, adherence tracking
 */

import db from '../db.js';

class WFMService {
  // =========================================
  // SHIFT TEMPLATES
  // =========================================

  async createShiftTemplate(tenantId, data) {
    const result = await db.query(`
      INSERT INTO shift_templates (
        tenant_id, name, description, start_time, end_time,
        break_minutes, color, is_overnight
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tenantId,
      data.name,
      data.description || null,
      data.start_time,
      data.end_time,
      data.break_minutes || 30,
      data.color || '#3B82F6',
      data.is_overnight || false
    ]);

    return result.rows[0];
  }

  async listShiftTemplates(tenantId) {
    const result = await db.query(`
      SELECT * FROM shift_templates
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY start_time ASC
    `, [tenantId]);

    return result.rows;
  }

  async updateShiftTemplate(templateId, tenantId, data) {
    const fields = [];
    const values = [templateId, tenantId];
    let idx = 3;

    const allowedFields = ['name', 'description', 'start_time', 'end_time', 'break_minutes', 'color', 'is_overnight', 'is_active'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);

    const result = await db.query(`
      UPDATE shift_templates
      SET ${fields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Shift template not found');
    }

    return result.rows[0];
  }

  async deleteShiftTemplate(templateId, tenantId) {
    // Soft delete - just deactivate
    await db.query(`
      UPDATE shift_templates
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [templateId, tenantId]);
  }

  // =========================================
  // AGENT AVAILABILITY
  // =========================================

  async setAgentAvailability(agentId, tenantId, availability) {
    // Upsert availability for each day
    for (const day of availability) {
      await db.query(`
        INSERT INTO agent_availability (
          agent_id, tenant_id, day_of_week, is_available,
          preferred_start_time, preferred_end_time, max_hours
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (agent_id, day_of_week)
        DO UPDATE SET
          is_available = $4,
          preferred_start_time = $5,
          preferred_end_time = $6,
          max_hours = $7,
          updated_at = NOW()
      `, [
        agentId,
        tenantId,
        day.day_of_week,
        day.is_available !== false,
        day.preferred_start_time || null,
        day.preferred_end_time || null,
        day.max_hours || 8
      ]);
    }

    return this.getAgentAvailability(agentId, tenantId);
  }

  async getAgentAvailability(agentId, tenantId) {
    const result = await db.query(`
      SELECT * FROM agent_availability
      WHERE agent_id = $1 AND tenant_id = $2
      ORDER BY day_of_week ASC
    `, [agentId, tenantId]);

    return result.rows;
  }

  // =========================================
  // SCHEDULING
  // =========================================

  async createShift(tenantId, data, createdBy) {
    const result = await db.query(`
      INSERT INTO scheduled_shifts (
        agent_id, tenant_id, shift_template_id, date,
        start_time, end_time, break_start, break_end,
        status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.agent_id,
      tenantId,
      data.shift_template_id || null,
      data.date,
      data.start_time,
      data.end_time,
      data.break_start || null,
      data.break_end || null,
      'scheduled',
      data.notes || null,
      createdBy
    ]);

    return result.rows[0];
  }

  async createBulkShifts(tenantId, shifts, createdBy) {
    const results = [];

    for (const shift of shifts) {
      try {
        const result = await this.createShift(tenantId, shift, createdBy);
        results.push({ success: true, shift: result });
      } catch (error) {
        results.push({ success: false, error: error.message, data: shift });
      }
    }

    return results;
  }

  async getSchedule(tenantId, options = {}) {
    const { agent_id, start_date, end_date, status } = options;

    let query = `
      SELECT
        ss.*,
        u.name as agent_name,
        u.email as agent_email,
        st.name as template_name,
        st.color as template_color
      FROM scheduled_shifts ss
      LEFT JOIN users u ON u.id = ss.agent_id
      LEFT JOIN shift_templates st ON st.id = ss.shift_template_id
      WHERE ss.tenant_id = $1
    `;
    const values = [tenantId];
    let idx = 2;

    if (agent_id) {
      query += ` AND ss.agent_id = $${idx++}`;
      values.push(agent_id);
    }

    if (start_date) {
      query += ` AND ss.date >= $${idx++}`;
      values.push(start_date);
    }

    if (end_date) {
      query += ` AND ss.date <= $${idx++}`;
      values.push(end_date);
    }

    if (status) {
      query += ` AND ss.status = $${idx++}`;
      values.push(status);
    }

    query += ` ORDER BY ss.date ASC, ss.start_time ASC`;

    const result = await db.query(query, values);
    return result.rows;
  }

  async updateShift(shiftId, tenantId, data) {
    const fields = [];
    const values = [shiftId, tenantId];
    let idx = 3;

    const allowedFields = ['date', 'start_time', 'end_time', 'break_start', 'break_end', 'status', 'notes', 'actual_start', 'actual_end', 'actual_break_minutes'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);

    const result = await db.query(`
      UPDATE scheduled_shifts
      SET ${fields.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Shift not found');
    }

    return result.rows[0];
  }

  async deleteShift(shiftId, tenantId) {
    const result = await db.query(`
      DELETE FROM scheduled_shifts
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
    `, [shiftId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Shift not found');
    }
  }

  // =========================================
  // AUTO-SCHEDULING
  // =========================================

  async generateSchedule(tenantId, options) {
    const { start_date, end_date } = options;

    // Get constraints
    const constraintsResult = await db.query(`
      SELECT * FROM scheduling_constraints WHERE tenant_id = $1
    `, [tenantId]);

    const constraints = constraintsResult.rows[0] || {
      max_hours_per_week: 40,
      max_hours_per_day: 12,
      min_hours_between_shifts: 8,
      max_consecutive_days: 6
    };

    // Get staffing requirements
    const requirementsResult = await db.query(`
      SELECT * FROM staffing_requirements WHERE tenant_id = $1
      ORDER BY day_of_week, interval_start
    `, [tenantId]);

    const requirements = requirementsResult.rows;

    // Get available agents
    const agentsResult = await db.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        aa.day_of_week,
        aa.is_available,
        aa.preferred_start_time,
        aa.preferred_end_time,
        aa.max_hours
      FROM users u
      LEFT JOIN agent_availability aa ON aa.agent_id = u.id
      WHERE u.tenant_id = $1 AND u.role IN ('agent', 'user')
      ORDER BY u.name
    `, [tenantId]);

    // Group availability by agent
    const agents = {};
    for (const row of agentsResult.rows) {
      if (!agents[row.id]) {
        agents[row.id] = {
          id: row.id,
          name: row.name,
          email: row.email,
          availability: {}
        };
      }
      if (row.day_of_week !== null) {
        agents[row.id].availability[row.day_of_week] = {
          is_available: row.is_available,
          preferred_start_time: row.preferred_start_time,
          preferred_end_time: row.preferred_end_time,
          max_hours: row.max_hours
        };
      }
    }

    // Get existing shifts to avoid conflicts
    const existingResult = await db.query(`
      SELECT agent_id, date, start_time, end_time
      FROM scheduled_shifts
      WHERE tenant_id = $1 AND date >= $2 AND date <= $3
        AND status != 'cancelled'
    `, [tenantId, start_date, end_date]);

    const existingShifts = existingResult.rows;

    // Get shift templates
    const templates = await this.listShiftTemplates(tenantId);

    // Generate schedule using greedy algorithm
    const generatedShifts = [];
    const agentWeeklyHours = {};

    // Loop through each day
    const currentDate = new Date(start_date);
    const endDateObj = new Date(end_date);

    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();

      // Get requirements for this day
      const dayRequirements = requirements.filter(r => r.day_of_week === dayOfWeek);

      // For each requirement interval, find best shift template
      for (const req of dayRequirements) {
        // Find agents needed
        const neededAgents = req.required_agents;

        // Find suitable template
        const suitableTemplate = templates.find(t => {
          const templateStart = t.start_time;
          const templateEnd = t.end_time;
          return templateStart <= req.interval_start && templateEnd >= req.interval_end;
        }) || templates[0];

        if (!suitableTemplate) continue;

        // Find available agents for this slot
        const availableAgents = Object.values(agents).filter(agent => {
          // Check day availability
          const dayAvail = agent.availability[dayOfWeek];
          if (dayAvail && !dayAvail.is_available) return false;

          // Check not already scheduled
          const hasConflict = existingShifts.some(s =>
            s.agent_id === agent.id &&
            s.date.toISOString().split('T')[0] === dateStr
          );
          if (hasConflict) return false;

          // Check generated shifts
          const hasGeneratedConflict = generatedShifts.some(s =>
            s.agent_id === agent.id && s.date === dateStr
          );
          if (hasGeneratedConflict) return false;

          // Check weekly hours
          const weekStart = this.getWeekStart(currentDate);
          const weekKey = weekStart.toISOString().split('T')[0];
          const currentWeekHours = agentWeeklyHours[`${agent.id}-${weekKey}`] || 0;
          const shiftHours = this.calculateShiftHours(suitableTemplate.start_time, suitableTemplate.end_time);

          if (currentWeekHours + shiftHours > constraints.max_hours_per_week) {
            return false;
          }

          return true;
        });

        // Sort by preference and fairness (agents with fewer hours first)
        availableAgents.sort((a, b) => {
          const weekKey = this.getWeekStart(currentDate).toISOString().split('T')[0];
          const aHours = agentWeeklyHours[`${a.id}-${weekKey}`] || 0;
          const bHours = agentWeeklyHours[`${b.id}-${weekKey}`] || 0;
          return aHours - bHours;
        });

        // Assign agents
        for (let i = 0; i < Math.min(neededAgents, availableAgents.length); i++) {
          const agent = availableAgents[i];
          const shiftHours = this.calculateShiftHours(suitableTemplate.start_time, suitableTemplate.end_time);

          const weekKey = this.getWeekStart(currentDate).toISOString().split('T')[0];
          agentWeeklyHours[`${agent.id}-${weekKey}`] = (agentWeeklyHours[`${agent.id}-${weekKey}`] || 0) + shiftHours;

          generatedShifts.push({
            agent_id: agent.id,
            agent_name: agent.name,
            date: dateStr,
            start_time: suitableTemplate.start_time,
            end_time: suitableTemplate.end_time,
            shift_template_id: suitableTemplate.id,
            template_name: suitableTemplate.name
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      generated_shifts: generatedShifts,
      total_shifts: generatedShifts.length,
      coverage_analysis: this.analyzeCoverage(generatedShifts, requirements, start_date, end_date)
    };
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }

  calculateShiftHours(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let hours = endH - startH + (endM - startM) / 60;
    if (hours < 0) hours += 24; // Overnight shift

    return hours;
  }

  analyzeCoverage(shifts, requirements, startDate, endDate) {
    // Simple coverage analysis
    const coverage = {
      total_required: 0,
      total_scheduled: shifts.length,
      coverage_percentage: 0,
      gaps: []
    };

    // Count unique requirement slots
    const dayCount = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

    for (const req of requirements) {
      coverage.total_required += req.required_agents * Math.ceil(dayCount / 7);
    }

    coverage.coverage_percentage = coverage.total_required > 0
      ? Math.round((coverage.total_scheduled / coverage.total_required) * 100)
      : 100;

    return coverage;
  }

  async applyGeneratedSchedule(tenantId, shifts, createdBy) {
    const results = await this.createBulkShifts(tenantId, shifts, createdBy);

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      created: successful,
      failed: failed,
      details: results
    };
  }

  // =========================================
  // STAFFING REQUIREMENTS
  // =========================================

  async setStaffingRequirements(tenantId, requirements) {
    for (const req of requirements) {
      await db.query(`
        INSERT INTO staffing_requirements (
          tenant_id, queue_id, day_of_week, interval_start, interval_end,
          required_agents, minimum_agents, skill_requirements
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, queue_id, day_of_week, interval_start)
        DO UPDATE SET
          interval_end = $5,
          required_agents = $6,
          minimum_agents = $7,
          skill_requirements = $8,
          updated_at = NOW()
      `, [
        tenantId,
        req.queue_id || null,
        req.day_of_week,
        req.interval_start,
        req.interval_end,
        req.required_agents,
        req.minimum_agents || 1,
        JSON.stringify(req.skill_requirements || [])
      ]);
    }

    return this.getStaffingRequirements(tenantId);
  }

  async getStaffingRequirements(tenantId, queueId = null) {
    let query = `
      SELECT * FROM staffing_requirements
      WHERE tenant_id = $1
    `;
    const values = [tenantId];

    if (queueId) {
      query += ` AND (queue_id = $2 OR queue_id IS NULL)`;
      values.push(queueId);
    }

    query += ` ORDER BY day_of_week, interval_start`;

    const result = await db.query(query, values);
    return result.rows;
  }

  // =========================================
  // ADHERENCE TRACKING
  // =========================================

  async recordAdherenceEvent(agentId, tenantId, eventType, data = {}) {
    // Get current shift
    const shiftResult = await db.query(`
      SELECT * FROM scheduled_shifts
      WHERE agent_id = $1 AND tenant_id = $2 AND date = CURRENT_DATE
        AND status IN ('scheduled', 'confirmed', 'in_progress')
      ORDER BY start_time ASC
      LIMIT 1
    `, [agentId, tenantId]);

    const shift = shiftResult.rows[0];
    let scheduledTime = null;
    let varianceMinutes = 0;

    if (shift) {
      // Determine scheduled time based on event type
      if (eventType === 'shift_start') {
        scheduledTime = new Date(`${shift.date.toISOString().split('T')[0]}T${shift.start_time}`);
      } else if (eventType === 'shift_end') {
        scheduledTime = new Date(`${shift.date.toISOString().split('T')[0]}T${shift.end_time}`);
      } else if (eventType === 'break_start' && shift.break_start) {
        scheduledTime = new Date(`${shift.date.toISOString().split('T')[0]}T${shift.break_start}`);
      } else if (eventType === 'break_end' && shift.break_end) {
        scheduledTime = new Date(`${shift.date.toISOString().split('T')[0]}T${shift.break_end}`);
      }

      if (scheduledTime) {
        const actualTime = data.actual_time ? new Date(data.actual_time) : new Date();
        varianceMinutes = Math.round((actualTime - scheduledTime) / 60000);
      }
    }

    const result = await db.query(`
      INSERT INTO adherence_events (
        agent_id, tenant_id, shift_id, event_type,
        scheduled_time, actual_time, variance_minutes,
        previous_status, new_status, notes, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      agentId,
      tenantId,
      shift?.id || null,
      eventType,
      scheduledTime,
      data.actual_time || new Date(),
      varianceMinutes,
      data.previous_status || null,
      data.new_status || null,
      data.notes || null,
      data.recorded_by || null
    ]);

    // Update shift status if relevant
    if (shift) {
      if (eventType === 'shift_start') {
        await db.query(`
          UPDATE scheduled_shifts SET status = 'in_progress', actual_start = $1, updated_at = NOW()
          WHERE id = $2
        `, [data.actual_time || new Date(), shift.id]);
      } else if (eventType === 'shift_end') {
        await db.query(`
          UPDATE scheduled_shifts SET status = 'completed', actual_end = $1, updated_at = NOW()
          WHERE id = $2
        `, [data.actual_time || new Date(), shift.id]);
      }
    }

    return result.rows[0];
  }

  async getAgentAdherence(agentId, tenantId, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Get scheduled shift
    const shiftResult = await db.query(`
      SELECT * FROM scheduled_shifts
      WHERE agent_id = $1 AND tenant_id = $2 AND date = $3
      ORDER BY start_time ASC
    `, [agentId, tenantId, targetDate]);

    if (shiftResult.rows.length === 0) {
      return {
        agent_id: agentId,
        date: targetDate,
        is_scheduled: false,
        message: 'Agent not scheduled for this date'
      };
    }

    const shift = shiftResult.rows[0];

    // Get adherence events
    const eventsResult = await db.query(`
      SELECT * FROM adherence_events
      WHERE agent_id = $1 AND tenant_id = $2 AND DATE(actual_time) = $3
      ORDER BY actual_time ASC
    `, [agentId, tenantId, targetDate]);

    // Calculate adherence
    const scheduledMinutes = this.calculateShiftHours(shift.start_time, shift.end_time) * 60;
    let adherentMinutes = scheduledMinutes;
    let totalVariance = 0;

    for (const event of eventsResult.rows) {
      totalVariance += Math.abs(event.variance_minutes || 0);
    }

    adherentMinutes = Math.max(0, scheduledMinutes - totalVariance);
    const adherenceRate = scheduledMinutes > 0 ? (adherentMinutes / scheduledMinutes) * 100 : 100;

    return {
      agent_id: agentId,
      date: targetDate,
      is_scheduled: true,
      shift: shift,
      events: eventsResult.rows,
      metrics: {
        scheduled_minutes: scheduledMinutes,
        adherent_minutes: Math.round(adherentMinutes),
        variance_minutes: totalVariance,
        adherence_rate: Math.round(adherenceRate * 100) / 100
      }
    };
  }

  async getTeamAdherence(tenantId, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const result = await db.query(`
      SELECT
        ss.agent_id,
        u.name as agent_name,
        ss.date,
        ss.status,
        ss.start_time,
        ss.end_time,
        ss.actual_start,
        ss.actual_end,
        EXTRACT(EPOCH FROM (ss.end_time - ss.start_time))/60 as scheduled_minutes,
        CASE
          WHEN ss.actual_start IS NOT NULL AND ss.actual_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (ss.actual_end - ss.actual_start))/60
          ELSE NULL
        END as worked_minutes
      FROM scheduled_shifts ss
      JOIN users u ON u.id = ss.agent_id
      WHERE ss.tenant_id = $1 AND ss.date = $2
      ORDER BY u.name
    `, [tenantId, targetDate]);

    const agents = result.rows;
    let totalScheduled = 0;
    let totalAdherent = 0;

    for (const agent of agents) {
      totalScheduled += agent.scheduled_minutes || 0;

      // Simple adherence calculation
      if (agent.actual_start && agent.actual_end) {
        const expectedStart = new Date(`${targetDate}T${agent.start_time}`);
        const actualStart = new Date(agent.actual_start);
        const lateMinutes = Math.max(0, (actualStart - expectedStart) / 60000);

        totalAdherent += Math.max(0, (agent.scheduled_minutes || 0) - lateMinutes);
      }
    }

    return {
      date: targetDate,
      agents: agents,
      summary: {
        total_agents: agents.length,
        total_scheduled_minutes: Math.round(totalScheduled),
        total_adherent_minutes: Math.round(totalAdherent),
        team_adherence_rate: totalScheduled > 0
          ? Math.round((totalAdherent / totalScheduled) * 10000) / 100
          : 100
      }
    };
  }

  // =========================================
  // TIME OFF REQUESTS
  // =========================================

  async createTimeOffRequest(agentId, tenantId, data) {
    // Check for conflicts with scheduled shifts
    const conflictsResult = await db.query(`
      SELECT * FROM scheduled_shifts
      WHERE agent_id = $1 AND tenant_id = $2
        AND date >= $3 AND date <= $4
        AND status NOT IN ('cancelled')
    `, [agentId, tenantId, data.start_date, data.end_date]);

    const result = await db.query(`
      INSERT INTO time_off_requests (
        agent_id, tenant_id, start_date, end_date,
        request_type, reason, hours_requested
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      agentId,
      tenantId,
      data.start_date,
      data.end_date,
      data.request_type || 'pto',
      data.reason || null,
      data.hours_requested || null
    ]);

    return {
      request: result.rows[0],
      conflicts: conflictsResult.rows.length > 0 ? conflictsResult.rows : null
    };
  }

  async listTimeOffRequests(tenantId, options = {}) {
    const { agent_id, status, start_date, end_date, page = 1, limit = 50 } = options;

    let query = `
      SELECT
        tor.*,
        u.name as agent_name,
        u.email as agent_email,
        reviewer.name as reviewer_name
      FROM time_off_requests tor
      JOIN users u ON u.id = tor.agent_id
      LEFT JOIN users reviewer ON reviewer.id = tor.reviewed_by
      WHERE tor.tenant_id = $1
    `;
    const values = [tenantId];
    let idx = 2;

    if (agent_id) {
      query += ` AND tor.agent_id = $${idx++}`;
      values.push(agent_id);
    }

    if (status) {
      query += ` AND tor.status = $${idx++}`;
      values.push(status);
    }

    if (start_date) {
      query += ` AND tor.end_date >= $${idx++}`;
      values.push(start_date);
    }

    if (end_date) {
      query += ` AND tor.start_date <= $${idx++}`;
      values.push(end_date);
    }

    const countResult = await db.query(
      query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM'),
      values
    );

    query += ` ORDER BY tor.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, (page - 1) * limit);

    const result = await db.query(query, values);

    return {
      requests: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    };
  }

  async reviewTimeOffRequest(requestId, tenantId, reviewerId, decision, notes = null) {
    if (!['approved', 'denied'].includes(decision)) {
      throw new Error('Decision must be approved or denied');
    }

    const result = await db.query(`
      UPDATE time_off_requests
      SET
        status = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        review_notes = $3,
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `, [decision, reviewerId, notes, requestId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Request not found');
    }

    // If approved, cancel any conflicting shifts
    if (decision === 'approved') {
      const request = result.rows[0];

      await db.query(`
        UPDATE scheduled_shifts
        SET status = 'cancelled', notes = 'Cancelled due to approved time-off request', updated_at = NOW()
        WHERE agent_id = $1 AND tenant_id = $2
          AND date >= $3 AND date <= $4
          AND status = 'scheduled'
      `, [request.agent_id, tenantId, request.start_date, request.end_date]);
    }

    return result.rows[0];
  }

  async cancelTimeOffRequest(requestId, agentId, tenantId) {
    const result = await db.query(`
      UPDATE time_off_requests
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND agent_id = $2 AND tenant_id = $3 AND status = 'pending'
      RETURNING *
    `, [requestId, agentId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error('Request not found or cannot be cancelled');
    }

    return result.rows[0];
  }

  // =========================================
  // FORECASTING
  // =========================================

  async generateForecast(tenantId, options = {}) {
    const { forecast_days = 30, queue_id = null } = options;

    // Get historical call data
    let historicalQuery = `
      SELECT
        DATE(created_at) as date,
        EXTRACT(DOW FROM created_at) as day_of_week,
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as calls
      FROM calls
      WHERE tenant_id = $1
        AND created_at >= NOW() - INTERVAL '90 days'
    `;
    const values = [tenantId];

    if (queue_id) {
      historicalQuery += ` AND queue_id = $2`;
      values.push(queue_id);
    }

    historicalQuery += `
      GROUP BY DATE(created_at), EXTRACT(DOW FROM created_at), EXTRACT(HOUR FROM created_at)
      ORDER BY date, hour
    `;

    const historicalResult = await db.query(historicalQuery, values);

    // Simple averaging forecast (in production, would use ML)
    const dayOfWeekAverages = {};

    for (const row of historicalResult.rows) {
      const key = `${row.day_of_week}-${row.hour}`;
      if (!dayOfWeekAverages[key]) {
        dayOfWeekAverages[key] = { total: 0, count: 0 };
      }
      dayOfWeekAverages[key].total += parseInt(row.calls);
      dayOfWeekAverages[key].count += 1;
    }

    // Generate forecast
    const forecasts = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    for (let d = 0; d < forecast_days; d++) {
      const forecastDate = new Date(startDate);
      forecastDate.setDate(forecastDate.getDate() + d);
      const dayOfWeek = forecastDate.getDay();

      for (let hour = 0; hour < 24; hour++) {
        const key = `${dayOfWeek}-${hour}`;
        const avg = dayOfWeekAverages[key];
        const predictedCalls = avg ? Math.round(avg.total / avg.count) : 0;

        forecasts.push({
          forecast_date: forecastDate.toISOString().split('T')[0],
          interval_start: `${hour.toString().padStart(2, '0')}:00`,
          interval_end: `${(hour + 1).toString().padStart(2, '0')}:00`,
          predicted_calls: predictedCalls,
          confidence_level: avg ? Math.min(0.95, 0.5 + (avg.count / 90) * 0.45) : 0.3
        });
      }
    }

    // Store forecasts
    for (const forecast of forecasts) {
      await db.query(`
        INSERT INTO call_volume_forecasts (
          tenant_id, queue_id, forecast_date, interval_start, interval_end,
          predicted_calls, confidence_level
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, queue_id, forecast_date, interval_start)
        DO UPDATE SET
          predicted_calls = $6,
          confidence_level = $7,
          generated_at = NOW()
      `, [
        tenantId,
        queue_id,
        forecast.forecast_date,
        forecast.interval_start,
        forecast.interval_end,
        forecast.predicted_calls,
        forecast.confidence_level
      ]);
    }

    return {
      forecasts: forecasts,
      summary: {
        forecast_days: forecast_days,
        total_intervals: forecasts.length,
        avg_confidence: Math.round(forecasts.reduce((sum, f) => sum + f.confidence_level, 0) / forecasts.length * 100) / 100
      }
    };
  }

  async getForecast(tenantId, options = {}) {
    const { start_date, end_date, queue_id } = options;

    let query = `
      SELECT * FROM call_volume_forecasts
      WHERE tenant_id = $1
    `;
    const values = [tenantId];
    let idx = 2;

    if (queue_id) {
      query += ` AND (queue_id = $${idx++} OR queue_id IS NULL)`;
      values.push(queue_id);
    }

    if (start_date) {
      query += ` AND forecast_date >= $${idx++}`;
      values.push(start_date);
    }

    if (end_date) {
      query += ` AND forecast_date <= $${idx++}`;
      values.push(end_date);
    }

    query += ` ORDER BY forecast_date, interval_start`;

    const result = await db.query(query, values);
    return result.rows;
  }

  // =========================================
  // CONSTRAINTS
  // =========================================

  async getSchedulingConstraints(tenantId) {
    const result = await db.query(`
      SELECT * FROM scheduling_constraints WHERE tenant_id = $1
    `, [tenantId]);

    if (result.rows.length === 0) {
      // Return defaults
      return {
        tenant_id: tenantId,
        max_hours_per_week: 40,
        max_hours_per_day: 12,
        min_hours_between_shifts: 8,
        max_consecutive_days: 6,
        min_break_minutes: 30,
        break_after_hours: 6.0,
        overtime_threshold_weekly: 40,
        overtime_threshold_daily: 8,
        allow_split_shifts: false,
        allow_overtime_requests: true,
        auto_approve_swaps: false
      };
    }

    return result.rows[0];
  }

  async updateSchedulingConstraints(tenantId, data) {
    const result = await db.query(`
      INSERT INTO scheduling_constraints (
        tenant_id, max_hours_per_week, max_hours_per_day, min_hours_between_shifts,
        max_consecutive_days, min_break_minutes, break_after_hours,
        overtime_threshold_weekly, overtime_threshold_daily,
        allow_split_shifts, allow_overtime_requests, auto_approve_swaps
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        max_hours_per_week = COALESCE($2, scheduling_constraints.max_hours_per_week),
        max_hours_per_day = COALESCE($3, scheduling_constraints.max_hours_per_day),
        min_hours_between_shifts = COALESCE($4, scheduling_constraints.min_hours_between_shifts),
        max_consecutive_days = COALESCE($5, scheduling_constraints.max_consecutive_days),
        min_break_minutes = COALESCE($6, scheduling_constraints.min_break_minutes),
        break_after_hours = COALESCE($7, scheduling_constraints.break_after_hours),
        overtime_threshold_weekly = COALESCE($8, scheduling_constraints.overtime_threshold_weekly),
        overtime_threshold_daily = COALESCE($9, scheduling_constraints.overtime_threshold_daily),
        allow_split_shifts = COALESCE($10, scheduling_constraints.allow_split_shifts),
        allow_overtime_requests = COALESCE($11, scheduling_constraints.allow_overtime_requests),
        auto_approve_swaps = COALESCE($12, scheduling_constraints.auto_approve_swaps),
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId,
      data.max_hours_per_week,
      data.max_hours_per_day,
      data.min_hours_between_shifts,
      data.max_consecutive_days,
      data.min_break_minutes,
      data.break_after_hours,
      data.overtime_threshold_weekly,
      data.overtime_threshold_daily,
      data.allow_split_shifts,
      data.allow_overtime_requests,
      data.auto_approve_swaps
    ]);

    return result.rows[0];
  }

  // =========================================
  // SHIFT SWAPS
  // =========================================

  async requestShiftSwap(tenantId, agentId, shiftId, targetAgentId = null, notes = null) {
    // Verify shift belongs to agent
    const shiftResult = await db.query(`
      SELECT * FROM scheduled_shifts
      WHERE id = $1 AND agent_id = $2 AND tenant_id = $3 AND status = 'scheduled'
    `, [shiftId, agentId, tenantId]);

    if (shiftResult.rows.length === 0) {
      throw new Error('Shift not found or cannot be swapped');
    }

    const result = await db.query(`
      INSERT INTO shift_swaps (
        tenant_id, original_shift_id, requesting_agent_id, target_agent_id, notes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tenantId, shiftId, agentId, targetAgentId, notes]);

    return result.rows[0];
  }

  async acceptShiftSwap(swapId, acceptingAgentId, tenantId) {
    // Get swap request
    const swapResult = await db.query(`
      SELECT ss.*, sch.agent_id as original_agent, sch.date, sch.start_time, sch.end_time
      FROM shift_swaps ss
      JOIN scheduled_shifts sch ON sch.id = ss.original_shift_id
      WHERE ss.id = $1 AND ss.tenant_id = $2 AND ss.status = 'pending'
        AND (ss.target_agent_id IS NULL OR ss.target_agent_id = $3)
    `, [swapId, tenantId, acceptingAgentId]);

    if (swapResult.rows.length === 0) {
      throw new Error('Swap request not found or not available');
    }

    const swap = swapResult.rows[0];

    // Cannot accept own swap
    if (swap.original_agent === acceptingAgentId) {
      throw new Error('Cannot accept your own swap request');
    }

    await db.query(`
      UPDATE shift_swaps
      SET status = 'accepted', target_agent_id = $1, accepted_at = NOW()
      WHERE id = $2
    `, [acceptingAgentId, swapId]);

    // Check if auto-approve is enabled
    const constraints = await this.getSchedulingConstraints(tenantId);

    if (constraints.auto_approve_swaps) {
      return this.approveShiftSwap(swapId, tenantId, null); // null = system approved
    }

    return db.query(`SELECT * FROM shift_swaps WHERE id = $1`, [swapId]).then(r => r.rows[0]);
  }

  async approveShiftSwap(swapId, tenantId, approverId) {
    const swapResult = await db.query(`
      SELECT * FROM shift_swaps WHERE id = $1 AND tenant_id = $2 AND status = 'accepted'
    `, [swapId, tenantId]);

    if (swapResult.rows.length === 0) {
      throw new Error('Swap not found or not ready for approval');
    }

    const swap = swapResult.rows[0];

    // Update the shift to new agent
    await db.query(`
      UPDATE scheduled_shifts
      SET agent_id = $1, notes = CONCAT(COALESCE(notes, ''), ' [Swapped via request ', $2::text, ']'), updated_at = NOW()
      WHERE id = $3
    `, [swap.target_agent_id, swapId, swap.original_shift_id]);

    // Update swap status
    await db.query(`
      UPDATE shift_swaps
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE id = $2
    `, [approverId, swapId]);

    return db.query(`SELECT * FROM shift_swaps WHERE id = $1`, [swapId]).then(r => r.rows[0]);
  }

  async listShiftSwaps(tenantId, options = {}) {
    const { agent_id, status, page = 1, limit = 50 } = options;

    let query = `
      SELECT
        ss.*,
        req.name as requesting_agent_name,
        tgt.name as target_agent_name,
        sch.date as shift_date,
        sch.start_time,
        sch.end_time
      FROM shift_swaps ss
      JOIN users req ON req.id = ss.requesting_agent_id
      LEFT JOIN users tgt ON tgt.id = ss.target_agent_id
      JOIN scheduled_shifts sch ON sch.id = ss.original_shift_id
      WHERE ss.tenant_id = $1
    `;
    const values = [tenantId];
    let idx = 2;

    if (agent_id) {
      query += ` AND (ss.requesting_agent_id = $${idx} OR ss.target_agent_id = $${idx})`;
      values.push(agent_id);
      idx++;
    }

    if (status) {
      query += ` AND ss.status = $${idx++}`;
      values.push(status);
    }

    query += ` ORDER BY ss.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, (page - 1) * limit);

    const result = await db.query(query, values);

    return {
      swaps: result.rows,
      pagination: { page, limit }
    };
  }
}

export default new WFMService();
