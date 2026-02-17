/**
 * Callback Queue Service
 * Manages customer callback requests and scheduling
 */

import pool from '../db/connection.js';

// =============================================================================
// CALLBACK REQUEST MANAGEMENT
// =============================================================================

/**
 * Create a new callback request
 */
export async function createCallbackRequest(tenantId, data) {
  const {
    contact_id,
    phone_number,
    caller_name,
    queue_id,
    original_call_id,
    reason,
    priority = 50,
    requested_time,
    time_zone = 'UTC',
    preferred_time_start,
    preferred_time_end,
    max_attempts = 3,
    source = 'api',
    external_id,
    metadata = {},
  } = data;

  // Estimate wait time if queue specified
  let estimatedWaitMinutes = null;
  if (queue_id) {
    const queueStats = await getQueueWaitTime(tenantId, queue_id);
    estimatedWaitMinutes = queueStats?.average_wait_minutes;
  }

  // Find available slot if requested_time not specified
  let scheduledTime = requested_time;
  if (!scheduledTime) {
    const nextSlot = await findNextAvailableSlot(tenantId, queue_id);
    scheduledTime = nextSlot?.slot_start;
  }

  const result = await pool.query(
    `INSERT INTO callback_requests (
      tenant_id, contact_id, phone_number, caller_name, queue_id,
      original_call_id, reason, priority, requested_time, scheduled_time,
      estimated_wait_minutes, time_zone, preferred_time_start, preferred_time_end,
      max_attempts, source, external_id, metadata, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *`,
    [
      tenantId, contact_id, phone_number, caller_name, queue_id,
      original_call_id, reason, priority, requested_time, scheduledTime,
      estimatedWaitMinutes, time_zone, preferred_time_start, preferred_time_end,
      max_attempts, source, external_id, JSON.stringify(metadata),
      scheduledTime ? 'scheduled' : 'pending'
    ]
  );

  const callback = result.rows[0];

  // Send confirmation notification
  if (callback.status === 'scheduled') {
    await sendCallbackNotification(callback.id, 'confirmation', 'sms');
  }

  return callback;
}

/**
 * Get callback requests with filters
 */
export async function getCallbackRequests(tenantId, options = {}) {
  const {
    status,
    queue_id,
    agent_id,
    phone_number,
    from_date,
    to_date,
    limit = 50,
    offset = 0,
  } = options;

  let query = `
    SELECT
      cr.*,
      c.first_name || ' ' || c.last_name as contact_name,
      q.name as queue_name,
      a.name as assigned_agent_name
    FROM callback_requests cr
    LEFT JOIN contacts c ON cr.contact_id = c.id
    LEFT JOIN queues q ON cr.queue_id = q.id
    LEFT JOIN agents a ON cr.assigned_agent_id = a.id
    WHERE cr.tenant_id = $1
  `;

  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    if (Array.isArray(status)) {
      query += ` AND cr.status = ANY($${paramIndex++})`;
      params.push(status);
    } else {
      query += ` AND cr.status = $${paramIndex++}`;
      params.push(status);
    }
  }

  if (queue_id) {
    query += ` AND cr.queue_id = $${paramIndex++}`;
    params.push(queue_id);
  }

  if (agent_id) {
    query += ` AND cr.assigned_agent_id = $${paramIndex++}`;
    params.push(agent_id);
  }

  if (phone_number) {
    query += ` AND cr.phone_number = $${paramIndex++}`;
    params.push(phone_number);
  }

  if (from_date) {
    query += ` AND cr.scheduled_time >= $${paramIndex++}`;
    params.push(from_date);
  }

  if (to_date) {
    query += ` AND cr.scheduled_time <= $${paramIndex++}`;
    params.push(to_date);
  }

  // Count total
  const countResult = await pool.query(
    query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM').replace(/LEFT JOIN[\s\S]*$/, ''),
    params.slice(0, paramIndex - 1)
  );
  const total = parseInt(countResult.rows[0]?.count || 0);

  // Get paginated results
  query += ` ORDER BY cr.priority DESC, cr.scheduled_time ASC NULLS LAST`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return { callbacks: result.rows, total };
}

/**
 * Get a single callback request
 */
export async function getCallbackRequest(tenantId, callbackId) {
  const result = await pool.query(
    `SELECT
      cr.*,
      c.first_name || ' ' || c.last_name as contact_name,
      c.email as contact_email,
      q.name as queue_name,
      a.name as assigned_agent_name
    FROM callback_requests cr
    LEFT JOIN contacts c ON cr.contact_id = c.id
    LEFT JOIN queues q ON cr.queue_id = q.id
    LEFT JOIN agents a ON cr.assigned_agent_id = a.id
    WHERE cr.tenant_id = $1 AND cr.id = $2`,
    [tenantId, callbackId]
  );

  return result.rows[0] || null;
}

/**
 * Update callback request
 */
export async function updateCallbackRequest(tenantId, callbackId, data) {
  const allowedFields = [
    'scheduled_time', 'status', 'priority', 'assigned_agent_id',
    'reason', 'preferred_time_start', 'preferred_time_end', 'metadata'
  ];

  const updates = [];
  const values = [tenantId, callbackId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'metadata') {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return await getCallbackRequest(tenantId, callbackId);
  }

  const result = await pool.query(
    `UPDATE callback_requests
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Cancel a callback request
 */
export async function cancelCallback(tenantId, callbackId, reason = null) {
  const result = await pool.query(
    `UPDATE callback_requests
     SET status = 'cancelled',
         metadata = metadata || $3
     WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'scheduled')
     RETURNING *`,
    [tenantId, callbackId, JSON.stringify({ cancellation_reason: reason })]
  );

  if (result.rows[0]) {
    await sendCallbackNotification(callbackId, 'cancelled', 'sms');
  }

  return result.rows[0];
}

/**
 * Reschedule a callback
 */
export async function rescheduleCallback(tenantId, callbackId, newTime) {
  const result = await pool.query(
    `UPDATE callback_requests
     SET scheduled_time = $3,
         status = 'scheduled'
     WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'scheduled', 'failed')
     RETURNING *`,
    [tenantId, callbackId, newTime]
  );

  if (result.rows[0]) {
    await sendCallbackNotification(callbackId, 'rescheduled', 'sms');
  }

  return result.rows[0];
}

// =============================================================================
// CALLBACK EXECUTION
// =============================================================================

/**
 * Get next callbacks to process
 */
export async function getNextCallbacks(tenantId, limit = 10) {
  const result = await pool.query(
    `SELECT cr.*, q.name as queue_name
     FROM callback_requests cr
     LEFT JOIN queues q ON cr.queue_id = q.id
     WHERE cr.tenant_id = $1
       AND cr.status IN ('scheduled', 'pending')
       AND (cr.scheduled_time IS NULL OR cr.scheduled_time <= NOW())
       AND cr.attempt_count < cr.max_attempts
     ORDER BY cr.priority DESC, cr.scheduled_time ASC NULLS LAST
     LIMIT $2`,
    [tenantId, limit]
  );

  return result.rows;
}

/**
 * Assign callback to agent
 */
export async function assignCallback(tenantId, callbackId, agentId) {
  const result = await pool.query(
    `UPDATE callback_requests
     SET assigned_agent_id = $3, status = 'in_progress'
     WHERE tenant_id = $1 AND id = $2 AND status IN ('pending', 'scheduled')
     RETURNING *`,
    [tenantId, callbackId, agentId]
  );

  return result.rows[0];
}

/**
 * Record callback attempt
 */
export async function recordCallbackAttempt(callbackId, attemptData) {
  const {
    agent_id,
    outcome,
    call_id,
    duration_seconds,
    notes,
  } = attemptData;

  // Get current attempt count
  const current = await pool.query(
    `SELECT attempt_count FROM callback_requests WHERE id = $1`,
    [callbackId]
  );

  const attemptNumber = (current.rows[0]?.attempt_count || 0) + 1;

  // Record the attempt
  await pool.query(
    `INSERT INTO callback_attempts (callback_id, attempt_number, agent_id, outcome, call_id, duration_seconds, notes, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [callbackId, attemptNumber, agent_id, outcome, call_id, duration_seconds, notes]
  );

  // Update the callback request
  let newStatus = 'scheduled'; // Default to retry
  if (outcome === 'answered') {
    newStatus = 'completed';
  } else if (attemptNumber >= (current.rows[0]?.max_attempts || 3)) {
    newStatus = 'failed';
  }

  const result = await pool.query(
    `UPDATE callback_requests
     SET attempt_count = $2,
         last_attempt_at = NOW(),
         status = $3,
         outcome = $4,
         completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END,
         completed_by_agent_id = CASE WHEN $3 = 'completed' THEN $5 ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [callbackId, attemptNumber, newStatus, outcome, agent_id]
  );

  return result.rows[0];
}

/**
 * Get callback attempts history
 */
export async function getCallbackAttempts(callbackId) {
  const result = await pool.query(
    `SELECT ca.*, a.name as agent_name
     FROM callback_attempts ca
     LEFT JOIN agents a ON ca.agent_id = a.id
     WHERE ca.callback_id = $1
     ORDER BY ca.attempt_number ASC`,
    [callbackId]
  );

  return result.rows;
}

// =============================================================================
// SCHEDULING
// =============================================================================

/**
 * Get callback schedules
 */
export async function getCallbackSchedules(tenantId, queueId = null) {
  let query = `
    SELECT cs.*, q.name as queue_name
    FROM callback_schedules cs
    LEFT JOIN queues q ON cs.queue_id = q.id
    WHERE cs.tenant_id = $1
  `;

  const params = [tenantId];

  if (queueId) {
    query += ` AND (cs.queue_id = $2 OR cs.queue_id IS NULL)`;
    params.push(queueId);
  }

  query += ` ORDER BY cs.queue_id NULLS FIRST, cs.name`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create callback schedule
 */
export async function createCallbackSchedule(tenantId, data) {
  const {
    name,
    description,
    queue_id,
    schedule_type = 'weekly',
    time_zone = 'UTC',
    weekly_schedule = [],
    max_concurrent_callbacks = 5,
    slot_duration_minutes = 15,
    buffer_minutes = 5,
  } = data;

  const result = await pool.query(
    `INSERT INTO callback_schedules (
      tenant_id, queue_id, name, description, schedule_type, time_zone,
      weekly_schedule, max_concurrent_callbacks, slot_duration_minutes, buffer_minutes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      tenantId, queue_id, name, description, schedule_type, time_zone,
      JSON.stringify(weekly_schedule), max_concurrent_callbacks, slot_duration_minutes, buffer_minutes
    ]
  );

  return result.rows[0];
}

/**
 * Update callback schedule
 */
export async function updateCallbackSchedule(tenantId, scheduleId, data) {
  const allowedFields = [
    'name', 'description', 'queue_id', 'schedule_type', 'time_zone',
    'weekly_schedule', 'max_concurrent_callbacks', 'slot_duration_minutes',
    'buffer_minutes', 'is_active'
  ];

  const updates = [];
  const values = [tenantId, scheduleId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'weekly_schedule') {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return await getCallbackSchedule(tenantId, scheduleId);
  }

  const result = await pool.query(
    `UPDATE callback_schedules
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete callback schedule
 */
export async function deleteCallbackSchedule(tenantId, scheduleId) {
  const result = await pool.query(
    `DELETE FROM callback_schedules WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, scheduleId]
  );

  return result.rowCount > 0;
}

/**
 * Find next available callback slot
 */
export async function findNextAvailableSlot(tenantId, queueId = null, afterTime = null) {
  const startTime = afterTime || new Date();

  // First check pre-generated slots
  const slotResult = await pool.query(
    `SELECT * FROM callback_slots
     WHERE tenant_id = $1
       AND ($2::INTEGER IS NULL OR queue_id = $2 OR queue_id IS NULL)
       AND slot_start > $3
       AND is_available = true
     ORDER BY slot_start ASC
     LIMIT 1`,
    [tenantId, queueId, startTime]
  );

  if (slotResult.rows[0]) {
    return slotResult.rows[0];
  }

  // If no pre-generated slots, calculate based on schedule
  const schedules = await getCallbackSchedules(tenantId, queueId);

  if (schedules.length === 0) {
    // No schedules defined, allow ASAP callback
    return { slot_start: startTime };
  }

  // Find next available time based on schedule
  // This is a simplified version - production would need more complex logic
  const schedule = schedules.find(s => s.is_active) || schedules[0];

  if (!schedule.weekly_schedule || schedule.weekly_schedule.length === 0) {
    return { slot_start: startTime };
  }

  // Find next matching day/time slot
  const now = new Date(startTime);
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dayOfWeek = checkDate.getDay();

    const dayConfig = schedule.weekly_schedule.find(d => d.day === dayOfWeek);
    if (!dayConfig) continue;

    const slotStart = new Date(checkDate);
    const [startHour, startMin] = dayConfig.start.split(':').map(Number);
    slotStart.setHours(startHour, startMin, 0, 0);

    if (slotStart > now) {
      return { slot_start: slotStart };
    }

    // If today, check if current time is within schedule
    if (dayOffset === 0) {
      const [endHour, endMin] = dayConfig.end.split(':').map(Number);
      const slotEnd = new Date(checkDate);
      slotEnd.setHours(endHour, endMin, 0, 0);

      if (now < slotEnd) {
        // Round up to next slot
        const slotDuration = schedule.slot_duration_minutes || 15;
        const minutesSinceStart = Math.floor((now - slotStart) / 60000);
        const nextSlotMinutes = Math.ceil(minutesSinceStart / slotDuration) * slotDuration;
        const nextSlotTime = new Date(slotStart.getTime() + nextSlotMinutes * 60000);

        if (nextSlotTime < slotEnd) {
          return { slot_start: nextSlotTime };
        }
      }
    }
  }

  return null;
}

/**
 * Get available slots for a date range
 */
export async function getAvailableSlots(tenantId, queueId, startDate, endDate, limit = 20) {
  const result = await pool.query(
    `SELECT * FROM callback_slots
     WHERE tenant_id = $1
       AND ($2::INTEGER IS NULL OR queue_id = $2 OR queue_id IS NULL)
       AND slot_start >= $3
       AND slot_start <= $4
       AND is_available = true
     ORDER BY slot_start ASC
     LIMIT $5`,
    [tenantId, queueId, startDate, endDate, limit]
  );

  return result.rows;
}

/**
 * Generate slots for a schedule
 */
export async function generateSlots(tenantId, scheduleId, startDate, days = 7) {
  const schedule = await pool.query(
    `SELECT * FROM callback_schedules WHERE tenant_id = $1 AND id = $2`,
    [tenantId, scheduleId]
  );

  if (!schedule.rows[0]) {
    throw new Error('Schedule not found');
  }

  const scheduleConfig = schedule.rows[0];
  const slots = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayOffset);
    const dayOfWeek = date.getDay();

    const dayConfig = scheduleConfig.weekly_schedule?.find(d => d.day === dayOfWeek);
    if (!dayConfig) continue;

    const [startHour, startMin] = dayConfig.start.split(':').map(Number);
    const [endHour, endMin] = dayConfig.end.split(':').map(Number);

    const slotDuration = scheduleConfig.slot_duration_minutes || 15;
    const bufferMinutes = scheduleConfig.buffer_minutes || 5;
    const totalSlotMinutes = slotDuration + bufferMinutes;

    let slotTime = new Date(date);
    slotTime.setHours(startHour, startMin, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(endHour, endMin, 0, 0);

    while (slotTime < endTime) {
      const slotEnd = new Date(slotTime.getTime() + slotDuration * 60000);

      if (slotEnd <= endTime) {
        slots.push({
          tenant_id: tenantId,
          schedule_id: scheduleId,
          queue_id: scheduleConfig.queue_id,
          slot_start: new Date(slotTime),
          slot_end: slotEnd,
          capacity: dayConfig.slots_per_hour || scheduleConfig.max_concurrent_callbacks,
        });
      }

      slotTime = new Date(slotTime.getTime() + totalSlotMinutes * 60000);
    }
  }

  // Batch insert slots
  if (slots.length > 0) {
    const values = slots.flatMap(s => [s.tenant_id, s.schedule_id, s.queue_id, s.slot_start, s.slot_end, s.capacity]);
    const placeholders = slots.map((_, i) => {
      const base = i * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    }).join(', ');

    await pool.query(
      `INSERT INTO callback_slots (tenant_id, schedule_id, queue_id, slot_start, slot_end, capacity)
       VALUES ${placeholders}
       ON CONFLICT DO NOTHING`,
      values
    );
  }

  return slots.length;
}

// =============================================================================
// RULES
// =============================================================================

/**
 * Get callback rules
 */
export async function getCallbackRules(tenantId, queueId = null) {
  let query = `
    SELECT cr.*, q.name as queue_name
    FROM callback_rules cr
    LEFT JOIN queues q ON cr.queue_id = q.id
    WHERE cr.tenant_id = $1
  `;

  const params = [tenantId];

  if (queueId !== undefined) {
    query += ` AND (cr.queue_id = $2 OR cr.queue_id IS NULL)`;
    params.push(queueId);
  }

  query += ` ORDER BY cr.priority DESC, cr.id`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create callback rule
 */
export async function createCallbackRule(tenantId, data) {
  const {
    name,
    description,
    queue_id,
    conditions = {},
    auto_offer_callback = false,
    callback_priority_boost = 0,
    max_scheduled_ahead_hours = 72,
    min_retry_interval_minutes = 30,
    offer_message,
    confirmation_sms_template,
    reminder_sms_template,
    reminder_minutes_before = 15,
    priority = 0,
  } = data;

  const result = await pool.query(
    `INSERT INTO callback_rules (
      tenant_id, queue_id, name, description, conditions, auto_offer_callback,
      callback_priority_boost, max_scheduled_ahead_hours, min_retry_interval_minutes,
      offer_message, confirmation_sms_template, reminder_sms_template, reminder_minutes_before, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      tenantId, queue_id, name, description, JSON.stringify(conditions), auto_offer_callback,
      callback_priority_boost, max_scheduled_ahead_hours, min_retry_interval_minutes,
      offer_message, confirmation_sms_template, reminder_sms_template, reminder_minutes_before, priority
    ]
  );

  return result.rows[0];
}

/**
 * Update callback rule
 */
export async function updateCallbackRule(tenantId, ruleId, data) {
  const allowedFields = [
    'name', 'description', 'queue_id', 'conditions', 'auto_offer_callback',
    'callback_priority_boost', 'max_scheduled_ahead_hours', 'min_retry_interval_minutes',
    'offer_message', 'confirmation_sms_template', 'reminder_sms_template',
    'reminder_minutes_before', 'is_active', 'priority'
  ];

  const updates = [];
  const values = [tenantId, ruleId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'conditions') {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return null;
  }

  const result = await pool.query(
    `UPDATE callback_rules
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete callback rule
 */
export async function deleteCallbackRule(tenantId, ruleId) {
  const result = await pool.query(
    `DELETE FROM callback_rules WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, ruleId]
  );

  return result.rowCount > 0;
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * Send callback notification
 */
export async function sendCallbackNotification(callbackId, notificationType, channel) {
  const callback = await pool.query(
    `SELECT cr.*, cs.confirmation_sms_template, cs.reminder_sms_template
     FROM callback_requests cr
     LEFT JOIN callback_rules cs ON cs.tenant_id = cr.tenant_id AND (cs.queue_id = cr.queue_id OR cs.queue_id IS NULL)
     WHERE cr.id = $1`,
    [callbackId]
  );

  if (!callback.rows[0]) return null;

  const cb = callback.rows[0];
  let content = '';

  // Generate content based on type
  switch (notificationType) {
    case 'confirmation':
      content = cb.confirmation_sms_template ||
        `Your callback has been scheduled for ${new Date(cb.scheduled_time).toLocaleString()}. We will call you at ${cb.phone_number}.`;
      break;
    case 'reminder':
      content = cb.reminder_sms_template ||
        `Reminder: You have a scheduled callback in ${cb.reminder_minutes_before || 15} minutes.`;
      break;
    case 'rescheduled':
      content = `Your callback has been rescheduled to ${new Date(cb.scheduled_time).toLocaleString()}.`;
      break;
    case 'cancelled':
      content = `Your callback request has been cancelled. Please contact us if you need assistance.`;
      break;
  }

  // Record the notification
  const result = await pool.query(
    `INSERT INTO callback_notifications (callback_id, notification_type, channel, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [callbackId, notificationType, channel, content]
  );

  // TODO: Actually send via SMS/email service
  // This would integrate with the existing SMS/email services

  return result.rows[0];
}

// =============================================================================
// ANALYTICS & HELPERS
// =============================================================================

/**
 * Get queue wait time estimate
 */
async function getQueueWaitTime(tenantId, queueId) {
  const result = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as average_wait_minutes
     FROM callback_requests
     WHERE tenant_id = $1 AND queue_id = $2 AND status = 'completed'
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [tenantId, queueId]
  );

  return result.rows[0];
}

/**
 * Get callback statistics
 */
export async function getCallbackStats(tenantId, options = {}) {
  const { queue_id, from_date, to_date } = options;

  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (from_date) {
    dateFilter += ` AND created_at >= $${paramIndex++}`;
    params.push(from_date);
  }

  if (to_date) {
    dateFilter += ` AND created_at <= $${paramIndex++}`;
    params.push(to_date);
  }

  if (queue_id) {
    dateFilter += ` AND queue_id = $${paramIndex++}`;
    params.push(queue_id);
  }

  const result = await pool.query(
    `SELECT
      COUNT(*) as total_callbacks,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      AVG(attempt_count) FILTER (WHERE status = 'completed') as avg_attempts,
      AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) FILTER (WHERE status = 'completed') as avg_resolution_minutes
     FROM callback_requests
     WHERE tenant_id = $1 ${dateFilter}`,
    params
  );

  return result.rows[0];
}

/**
 * Get callbacks due for reminder
 */
export async function getCallbacksDueForReminder(tenantId, minutesBefore = 15) {
  const result = await pool.query(
    `SELECT cr.*
     FROM callback_requests cr
     WHERE cr.tenant_id = $1
       AND cr.status = 'scheduled'
       AND cr.scheduled_time BETWEEN NOW() AND NOW() + INTERVAL '${minutesBefore} minutes'
       AND NOT EXISTS (
         SELECT 1 FROM callback_notifications cn
         WHERE cn.callback_id = cr.id AND cn.notification_type = 'reminder'
       )`,
    [tenantId]
  );

  return result.rows;
}
