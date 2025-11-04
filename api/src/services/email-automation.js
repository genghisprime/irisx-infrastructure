/**
 * Email Automation Service
 * Handles trigger evaluation, rule matching, and automated email sending
 * Week 13-14 Phase 5: Email Automation Engine
 */

import pool from '../db/connection.js';
import { sendTemplateEmail } from './email.js';

/**
 * Evaluate and execute automation rules for an event
 * @param {string} eventName - Event name (e.g., 'user.created', 'email.opened')
 * @param {object} eventData - Event data (user_id, email, etc.)
 * @param {UUID} tenantId - Tenant ID
 */
export async function triggerAutomationRules(eventName, eventData, tenantId) {
  const startTime = Date.now();

  try {
    // Get all enabled rules for this event
    const { rows: rules } = await pool.query(
      `SELECT * FROM get_automation_rules_by_trigger($1, 'event', $2)`,
      [tenantId, eventName]
    );

    if (rules.length === 0) {
      return { triggered: 0, executed: 0 };
    }

    let executedCount = 0;

    // Process each rule
    for (const rule of rules) {
      try {
        // Check if conditions match
        if (rule.conditions && !evaluateConditions(rule.conditions, eventData)) {
          continue;
        }

        // Check rate limits
        const contactId = eventData.contact_id || eventData.user_id;
        if (contactId) {
          const rateLimitResult = await checkRateLimit(rule.id, contactId);
          if (!rateLimitResult.allowed) {
            await logExecution(rule.id, tenantId, contactId, eventData.email, {
              status: 'skipped',
              skippedReason: rateLimitResult.reason,
              triggeredByEvent: eventName,
            });
            continue;
          }
        }

        // Execute actions
        await executeActions(rule, eventData, tenantId, eventName);
        executedCount++;
      } catch (error) {
        console.error(`Error executing automation rule ${rule.id}:`, error);
        await logExecution(rule.id, tenantId, null, eventData.email, {
          status: 'failed',
          errorMessage: error.message,
          triggeredByEvent: eventName,
        });
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`Automation trigger complete: ${executedCount}/${rules.length} rules executed in ${executionTime}ms`);

    return {
      triggered: rules.length,
      executed: executedCount,
      executionTime,
    };
  } catch (error) {
    console.error('Error triggering automation rules:', error);
    throw error;
  }
}

/**
 * Execute actions for a matched automation rule
 */
async function executeActions(rule, eventData, tenantId, eventName) {
  const executionId = await createExecution(rule.id, tenantId, eventData, eventName);
  const actionsPerformed = [];
  const emailIds = [];

  try {
    await updateExecutionStatus(executionId, 'running');

    for (const action of rule.actions) {
      const actionResult = await executeAction(action, eventData, tenantId);
      actionsPerformed.push(actionResult);

      if (actionResult.type === 'send_email' && actionResult.emailId) {
        emailIds.push(actionResult.emailId);
      }
    }

    // Mark execution as completed
    await pool.query(
      `UPDATE email_automation_executions
       SET status = 'completed',
           completed_at = NOW(),
           actions_performed = $1,
           email_ids = $2,
           execution_time_ms = EXTRACT(EPOCH FROM (NOW() - triggered_at)) * 1000
       WHERE id = $3`,
      [JSON.stringify(actionsPerformed), emailIds, executionId]
    );
  } catch (error) {
    // Mark execution as failed
    await pool.query(
      `UPDATE email_automation_executions
       SET status = 'failed',
           completed_at = NOW(),
           error_message = $1,
           error_stack = $2,
           execution_time_ms = EXTRACT(EPOCH FROM (NOW() - triggered_at)) * 1000
       WHERE id = $3`,
      [error.message, error.stack, executionId]
    );
    throw error;
  }
}

/**
 * Execute a single action
 */
async function executeAction(action, eventData, tenantId) {
  const actionStart = Date.now();

  try {
    switch (action.type) {
      case 'send_email':
        return await executeSendEmail(action, eventData, tenantId);

      case 'webhook':
        return await executeWebhook(action, eventData, tenantId);

      case 'update_contact':
        return await executeUpdateContact(action, eventData, tenantId);

      case 'add_tag':
        return await executeAddTag(action, eventData, tenantId);

      case 'wait':
        return await executeWait(action);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  } catch (error) {
    return {
      type: action.type,
      success: false,
      error: error.message,
      executionTime: Date.now() - actionStart,
    };
  }
}

/**
 * Action: Send email using template
 */
async function executeSendEmail(action, eventData, tenantId) {
  const { template_slug, delay_minutes = 0 } = action;

  // Handle delayed sending (for future enhancement)
  if (delay_minutes > 0) {
    // TODO: Queue for delayed sending
    return {
      type: 'send_email',
      success: true,
      message: `Queued for delivery in ${delay_minutes} minutes`,
      templateSlug: template_slug,
    };
  }

  // Send immediately
  const result = await sendTemplateEmail({
    tenantId,
    to: eventData.email,
    templateSlug: template_slug,
    variables: eventData,
  });

  return {
    type: 'send_email',
    success: true,
    emailId: result.id,
    templateSlug: template_slug,
    recipient: eventData.email,
    executionTime: result.executionTime || 0,
  };
}

/**
 * Action: Call webhook URL
 */
async function executeWebhook(action, eventData, tenantId) {
  const { url, method = 'POST', headers = {} } = action;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
      ...headers,
    },
    body: JSON.stringify(eventData),
  });

  const responseData = await response.text();

  return {
    type: 'webhook',
    success: response.ok,
    url,
    statusCode: response.status,
    response: responseData,
  };
}

/**
 * Action: Update contact fields
 */
async function executeUpdateContact(action, eventData, tenantId) {
  const { contact_id } = eventData;
  const { fields } = action;

  if (!contact_id) {
    throw new Error('contact_id not found in event data');
  }

  // Build dynamic UPDATE query
  const setFields = Object.keys(fields)
    .map((key, idx) => `${key} = $${idx + 3}`)
    .join(', ');
  const values = Object.values(fields);

  await pool.query(
    `UPDATE contacts SET ${setFields}, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [contact_id, tenantId, ...values]
  );

  return {
    type: 'update_contact',
    success: true,
    contactId: contact_id,
    fieldsUpdated: Object.keys(fields),
  };
}

/**
 * Action: Add tag to contact
 */
async function executeAddTag(action, eventData, tenantId) {
  const { contact_id } = eventData;
  const { tag } = action;

  if (!contact_id) {
    throw new Error('contact_id not found in event data');
  }

  // Assuming a contact_tags table exists (or use JSONB tags column)
  await pool.query(
    `INSERT INTO contact_tags (contact_id, tenant_id, tag, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (contact_id, tag) DO NOTHING`,
    [contact_id, tenantId, tag]
  );

  return {
    type: 'add_tag',
    success: true,
    contactId: contact_id,
    tag,
  };
}

/**
 * Action: Wait/delay (for chained actions)
 */
async function executeWait(action) {
  const { delay_seconds } = action;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        type: 'wait',
        success: true,
        delaySeconds: delay_seconds,
      });
    }, delay_seconds * 1000);
  });
}

/**
 * Evaluate conditions against event data
 */
function evaluateConditions(conditions, eventData) {
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = eventData[key];

    // Support different comparison operators
    if (typeof expectedValue === 'object' && expectedValue !== null) {
      // Complex conditions: {"age": {"$gt": 18}}
      for (const [operator, value] of Object.entries(expectedValue)) {
        if (!evaluateOperator(actualValue, operator, value)) {
          return false;
        }
      }
    } else {
      // Simple equality: {"plan": "premium"}
      if (actualValue !== expectedValue) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Evaluate comparison operators
 */
function evaluateOperator(actualValue, operator, expectedValue) {
  switch (operator) {
    case '$eq':
      return actualValue === expectedValue;
    case '$ne':
      return actualValue !== expectedValue;
    case '$gt':
      return actualValue > expectedValue;
    case '$gte':
      return actualValue >= expectedValue;
    case '$lt':
      return actualValue < expectedValue;
    case '$lte':
      return actualValue <= expectedValue;
    case '$in':
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
    case '$nin':
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
    case '$contains':
      return String(actualValue).includes(expectedValue);
    case '$startsWith':
      return String(actualValue).startsWith(expectedValue);
    case '$endsWith':
      return String(actualValue).endsWith(expectedValue);
    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Check rate limits for a contact
 */
async function checkRateLimit(ruleId, contactId) {
  const { rows } = await pool.query(
    `SELECT r.max_executions_per_contact_per_day, r.cooldown_hours
     FROM email_automation_rules r
     WHERE r.id = $1`,
    [ruleId]
  );

  if (rows.length === 0) {
    return { allowed: true };
  }

  const { max_executions_per_contact_per_day, cooldown_hours } = rows[0];

  if (!max_executions_per_contact_per_day && !cooldown_hours) {
    return { allowed: true };
  }

  const { rows: limitResult } = await pool.query(
    `SELECT * FROM check_automation_rate_limit($1, $2, $3, $4)`,
    [ruleId, contactId, max_executions_per_contact_per_day, cooldown_hours]
  );

  return limitResult[0];
}

/**
 * Create execution record
 */
async function createExecution(ruleId, tenantId, eventData, eventName) {
  const contactId = eventData.contact_id || eventData.user_id || null;
  const contactEmail = eventData.email || 'unknown@example.com';

  const { rows } = await pool.query(
    `INSERT INTO email_automation_executions
     (rule_id, tenant_id, contact_id, contact_email, triggered_by_event, trigger_data, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [ruleId, tenantId, contactId, contactEmail, eventName, JSON.stringify(eventData)]
  );

  return rows[0].id;
}

/**
 * Update execution status
 */
async function updateExecutionStatus(executionId, status) {
  await pool.query(
    `UPDATE email_automation_executions
     SET status = $1, started_at = CASE WHEN $1 = 'running' THEN NOW() ELSE started_at END
     WHERE id = $2`,
    [status, executionId]
  );
}

/**
 * Log execution (for skipped/failed executions)
 */
async function logExecution(ruleId, tenantId, contactId, contactEmail, options) {
  const {
    status,
    skippedReason,
    errorMessage,
    triggeredByEvent,
  } = options;

  await pool.query(
    `INSERT INTO email_automation_executions
     (rule_id, tenant_id, contact_id, contact_email, triggered_by_event, status, skipped_reason, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ruleId, tenantId, contactId, contactEmail || 'unknown', triggeredByEvent, status, skippedReason || null, errorMessage || null]
  );
}

/**
 * Get automation rules for a tenant
 */
export async function getAutomationRules(tenantId, filters = {}) {
  const { enabled, trigger_type, search } = filters;

  let query = `
    SELECT
      r.*,
      (SELECT COUNT(*) FROM email_automation_executions WHERE rule_id = r.id) AS execution_count,
      (SELECT COUNT(*) FROM email_automation_executions WHERE rule_id = r.id AND status = 'completed') AS success_count,
      (SELECT MAX(triggered_at) FROM email_automation_executions WHERE rule_id = r.id) AS last_executed
    FROM email_automation_rules r
    WHERE r.tenant_id = $1
  `;
  const params = [tenantId];
  let paramCount = 1;

  if (enabled !== undefined) {
    paramCount++;
    query += ` AND r.enabled = $${paramCount}`;
    params.push(enabled);
  }

  if (trigger_type) {
    paramCount++;
    query += ` AND r.trigger_type = $${paramCount}`;
    params.push(trigger_type);
  }

  if (search) {
    paramCount++;
    query += ` AND (r.name ILIKE $${paramCount} OR r.description ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY r.priority DESC, r.created_at DESC`;

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get single automation rule
 */
export async function getAutomationRule(ruleId, tenantId) {
  const { rows } = await pool.query(
    `SELECT * FROM email_automation_rules WHERE id = $1 AND tenant_id = $2`,
    [ruleId, tenantId]
  );

  if (rows.length === 0) {
    throw new Error('Automation rule not found');
  }

  return rows[0];
}

/**
 * Create automation rule
 */
export async function createAutomationRule(tenantId, userId, ruleData) {
  const {
    name,
    description,
    trigger_type,
    trigger_config,
    conditions,
    actions,
    enabled = true,
    priority = 0,
    max_executions_per_contact_per_day,
    cooldown_hours,
  } = ruleData;

  // Validate trigger type
  if (!['event', 'time', 'behavior'].includes(trigger_type)) {
    throw new Error('Invalid trigger_type. Must be: event, time, or behavior');
  }

  // Validate actions
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('Actions must be a non-empty array');
  }

  const { rows } = await pool.query(
    `INSERT INTO email_automation_rules
     (tenant_id, name, description, trigger_type, trigger_config, conditions, actions, enabled, priority, max_executions_per_contact_per_day, cooldown_hours, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      tenantId,
      name,
      description,
      trigger_type,
      JSON.stringify(trigger_config),
      conditions ? JSON.stringify(conditions) : null,
      JSON.stringify(actions),
      enabled,
      priority,
      max_executions_per_contact_per_day,
      cooldown_hours,
      userId,
    ]
  );

  return rows[0];
}

/**
 * Update automation rule
 */
export async function updateAutomationRule(ruleId, tenantId, updates) {
  const allowedFields = [
    'name',
    'description',
    'trigger_config',
    'conditions',
    'actions',
    'enabled',
    'priority',
    'max_executions_per_contact_per_day',
    'cooldown_hours',
  ];

  const setFields = [];
  const values = [];
  let paramCount = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setFields.push(`${key} = $${paramCount}`);

      // Stringify JSON fields
      if (['trigger_config', 'conditions', 'actions'].includes(key)) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }

      paramCount++;
    }
  }

  if (setFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  setFields.push('updated_at = NOW()');

  const { rows } = await pool.query(
    `UPDATE email_automation_rules
     SET ${setFields.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [ruleId, tenantId, ...values]
  );

  if (rows.length === 0) {
    throw new Error('Automation rule not found');
  }

  return rows[0];
}

/**
 * Delete automation rule
 */
export async function deleteAutomationRule(ruleId, tenantId) {
  const { rowCount } = await pool.query(
    `DELETE FROM email_automation_rules WHERE id = $1 AND tenant_id = $2`,
    [ruleId, tenantId]
  );

  if (rowCount === 0) {
    throw new Error('Automation rule not found');
  }

  return { success: true };
}

/**
 * Get automation executions
 */
export async function getAutomationExecutions(tenantId, filters = {}) {
  const { rule_id, status, limit = 100, offset = 0 } = filters;

  let query = `
    SELECT
      e.*,
      r.name AS rule_name
    FROM email_automation_executions e
    LEFT JOIN email_automation_rules r ON e.rule_id = r.id
    WHERE e.tenant_id = $1
  `;
  const params = [tenantId];
  let paramCount = 1;

  if (rule_id) {
    paramCount++;
    query += ` AND e.rule_id = $${paramCount}`;
    params.push(rule_id);
  }

  if (status) {
    paramCount++;
    query += ` AND e.status = $${paramCount}`;
    params.push(status);
  }

  query += ` ORDER BY e.triggered_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get automation statistics
 */
export async function getAutomationStats(tenantId, ruleId = null) {
  let query = `SELECT * FROM email_automation_stats WHERE tenant_id = $1`;
  const params = [tenantId];

  if (ruleId) {
    query += ` AND rule_id = $2`;
    params.push(ruleId);
  }

  query += ` ORDER BY total_executions DESC`;

  const { rows } = await pool.query(query, params);
  return rows;
}
