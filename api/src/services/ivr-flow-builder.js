/**
 * IVR Flow Builder Service
 * Visual drag-and-drop IVR flow creation
 */

import pool from '../db.js';

// =============================================================================
// FLOW MANAGEMENT
// =============================================================================

/**
 * Create a new IVR flow
 */
export async function createFlow(tenantId, data, createdBy) {
  const {
    name,
    description,
    phone_number_id,
    queue_id,
    default_language = 'en-US',
    timeout_seconds = 10,
    max_retries = 3,
    invalid_input_message,
    timeout_message,
  } = data;

  // Generate slug
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const result = await pool.query(
    `INSERT INTO ivr_flows (
      tenant_id, name, description, slug, phone_number_id, queue_id,
      default_language, timeout_seconds, max_retries,
      invalid_input_message, timeout_message, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      tenantId, name, description, slug, phone_number_id, queue_id,
      default_language, timeout_seconds, max_retries,
      invalid_input_message, timeout_message, createdBy
    ]
  );

  return result.rows[0];
}

/**
 * Get all flows for a tenant
 */
export async function getFlows(tenantId, options = {}) {
  const { status, search, limit = 50, offset = 0 } = options;

  let query = `
    SELECT f.*,
           pn.number as phone_number,
           q.name as queue_name,
           a.name as created_by_name
    FROM ivr_flows f
    LEFT JOIN phone_numbers pn ON f.phone_number_id = pn.id
    LEFT JOIN queues q ON f.queue_id = q.id
    LEFT JOIN agents a ON f.created_by = a.id
    WHERE f.tenant_id = $1
  `;

  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND f.status = $${paramIndex++}`;
    params.push(status);
  }

  if (search) {
    query += ` AND (f.name ILIKE $${paramIndex} OR f.description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Count total
  const countResult = await pool.query(
    query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM'),
    params
  );
  const total = parseInt(countResult.rows[0]?.count || 0);

  // Get paginated results
  query += ` ORDER BY f.updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return { flows: result.rows, total };
}

/**
 * Get a single flow with full details
 */
export async function getFlow(tenantId, flowId) {
  const flowResult = await pool.query(
    `SELECT f.*,
            pn.number as phone_number,
            q.name as queue_name
     FROM ivr_flows f
     LEFT JOIN phone_numbers pn ON f.phone_number_id = pn.id
     LEFT JOIN queues q ON f.queue_id = q.id
     WHERE f.tenant_id = $1 AND f.id = $2`,
    [tenantId, flowId]
  );

  if (!flowResult.rows[0]) {
    return null;
  }

  const flow = flowResult.rows[0];

  // Get nodes
  const nodesResult = await pool.query(
    `SELECT * FROM ivr_flow_nodes WHERE flow_id = $1 ORDER BY created_at`,
    [flowId]
  );

  // Get connections
  const connectionsResult = await pool.query(
    `SELECT * FROM ivr_flow_connections WHERE flow_id = $1`,
    [flowId]
  );

  // Get variables
  const variablesResult = await pool.query(
    `SELECT * FROM ivr_variables WHERE flow_id = $1 ORDER BY is_system DESC, variable_name`,
    [flowId]
  );

  return {
    ...flow,
    nodes: nodesResult.rows,
    connections: connectionsResult.rows,
    variables: variablesResult.rows,
  };
}

/**
 * Update flow metadata
 */
export async function updateFlow(tenantId, flowId, data) {
  const allowedFields = [
    'name', 'description', 'phone_number_id', 'queue_id',
    'default_language', 'timeout_seconds', 'max_retries',
    'invalid_input_message', 'timeout_message', 'entry_node_id', 'flow_data'
  ];

  const updates = [];
  const values = [tenantId, flowId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'flow_data') {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }
  }

  if (updates.length === 0) {
    return await getFlow(tenantId, flowId);
  }

  const result = await pool.query(
    `UPDATE ivr_flows
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete a flow
 */
export async function deleteFlow(tenantId, flowId) {
  const result = await pool.query(
    `DELETE FROM ivr_flows WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, flowId]
  );

  return result.rowCount > 0;
}

/**
 * Publish a flow
 */
export async function publishFlow(tenantId, flowId, publishedBy) {
  // Validate flow has required nodes
  const flow = await getFlow(tenantId, flowId);
  if (!flow) {
    throw new Error('Flow not found');
  }

  if (!flow.entry_node_id && (!flow.nodes || flow.nodes.length === 0)) {
    throw new Error('Flow must have at least one node');
  }

  const result = await pool.query(
    `UPDATE ivr_flows
     SET status = 'published', is_draft = false, published_by = $3
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, flowId, publishedBy]
  );

  return result.rows[0];
}

/**
 * Duplicate a flow
 */
export async function duplicateFlow(tenantId, flowId, newName, createdBy) {
  const original = await getFlow(tenantId, flowId);
  if (!original) {
    throw new Error('Flow not found');
  }

  // Create new flow
  const newFlow = await createFlow(tenantId, {
    name: newName || `${original.name} (Copy)`,
    description: original.description,
    default_language: original.default_language,
    timeout_seconds: original.timeout_seconds,
    max_retries: original.max_retries,
    invalid_input_message: original.invalid_input_message,
    timeout_message: original.timeout_message,
  }, createdBy);

  // Copy nodes
  for (const node of original.nodes) {
    await pool.query(
      `INSERT INTO ivr_flow_nodes (flow_id, node_id, node_type, position_x, position_y, config, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newFlow.id, node.node_id, node.node_type, node.position_x, node.position_y, node.config, node.label]
    );
  }

  // Copy connections
  for (const conn of original.connections) {
    await pool.query(
      `INSERT INTO ivr_flow_connections (flow_id, connection_id, source_node_id, target_node_id, condition_type, condition_value, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newFlow.id, conn.connection_id, conn.source_node_id, conn.target_node_id, conn.condition_type, conn.condition_value, conn.label]
    );
  }

  // Copy variables
  for (const variable of original.variables.filter(v => !v.is_system)) {
    await pool.query(
      `INSERT INTO ivr_variables (flow_id, variable_name, variable_type, default_value, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [newFlow.id, variable.variable_name, variable.variable_type, variable.default_value, variable.description]
    );
  }

  // Set entry node
  await pool.query(
    `UPDATE ivr_flows SET entry_node_id = $2 WHERE id = $1`,
    [newFlow.id, original.entry_node_id]
  );

  return await getFlow(tenantId, newFlow.id);
}

// =============================================================================
// NODE MANAGEMENT
// =============================================================================

/**
 * Add a node to a flow
 */
export async function addNode(flowId, nodeData) {
  const {
    node_id,
    node_type,
    position_x = 0,
    position_y = 0,
    config = {},
    label,
  } = nodeData;

  const result = await pool.query(
    `INSERT INTO ivr_flow_nodes (flow_id, node_id, node_type, position_x, position_y, config, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [flowId, node_id, node_type, position_x, position_y, JSON.stringify(config), label]
  );

  return result.rows[0];
}

/**
 * Update a node
 */
export async function updateNode(flowId, nodeId, data) {
  const allowedFields = ['node_type', 'position_x', 'position_y', 'config', 'label'];

  const updates = [];
  const values = [flowId, nodeId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'config') {
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
    `UPDATE ivr_flow_nodes
     SET ${updates.join(', ')}
     WHERE flow_id = $1 AND node_id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete a node (and its connections)
 */
export async function deleteNode(flowId, nodeId) {
  // Delete connections first
  await pool.query(
    `DELETE FROM ivr_flow_connections
     WHERE flow_id = $1 AND (source_node_id = $2 OR target_node_id = $2)`,
    [flowId, nodeId]
  );

  const result = await pool.query(
    `DELETE FROM ivr_flow_nodes WHERE flow_id = $1 AND node_id = $2 RETURNING id`,
    [flowId, nodeId]
  );

  return result.rowCount > 0;
}

/**
 * Bulk update nodes (for drag operations)
 */
export async function bulkUpdateNodes(flowId, nodes) {
  const results = [];

  for (const node of nodes) {
    if (node.node_id) {
      const result = await updateNode(flowId, node.node_id, node);
      if (result) results.push(result);
    }
  }

  return results;
}

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

/**
 * Add a connection between nodes
 */
export async function addConnection(flowId, connectionData) {
  const {
    connection_id,
    source_node_id,
    target_node_id,
    condition_type,
    condition_value,
    label,
  } = connectionData;

  const result = await pool.query(
    `INSERT INTO ivr_flow_connections (flow_id, connection_id, source_node_id, target_node_id, condition_type, condition_value, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [flowId, connection_id, source_node_id, target_node_id, condition_type, condition_value, label]
  );

  return result.rows[0];
}

/**
 * Update a connection
 */
export async function updateConnection(flowId, connectionId, data) {
  const allowedFields = ['source_node_id', 'target_node_id', 'condition_type', 'condition_value', 'label'];

  const updates = [];
  const values = [flowId, connectionId];
  let paramIndex = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(data[field]);
    }
  }

  if (updates.length === 0) {
    return null;
  }

  const result = await pool.query(
    `UPDATE ivr_flow_connections
     SET ${updates.join(', ')}
     WHERE flow_id = $1 AND connection_id = $2
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Delete a connection
 */
export async function deleteConnection(flowId, connectionId) {
  const result = await pool.query(
    `DELETE FROM ivr_flow_connections WHERE flow_id = $1 AND connection_id = $2 RETURNING id`,
    [flowId, connectionId]
  );

  return result.rowCount > 0;
}

// =============================================================================
// SAVE FULL FLOW (from visual editor)
// =============================================================================

/**
 * Save complete flow state from visual editor
 */
export async function saveFlowState(tenantId, flowId, flowState) {
  const { nodes, connections, entryNodeId, metadata } = flowState;

  // Start transaction
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update flow metadata
    if (metadata) {
      await client.query(
        `UPDATE ivr_flows SET
          name = COALESCE($3, name),
          description = COALESCE($4, description),
          entry_node_id = $5,
          flow_data = $6
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, flowId, metadata.name, metadata.description, entryNodeId, JSON.stringify(flowState)]
      );
    }

    // Delete existing nodes and connections
    await client.query(`DELETE FROM ivr_flow_connections WHERE flow_id = $1`, [flowId]);
    await client.query(`DELETE FROM ivr_flow_nodes WHERE flow_id = $1`, [flowId]);

    // Insert new nodes
    for (const node of nodes) {
      await client.query(
        `INSERT INTO ivr_flow_nodes (flow_id, node_id, node_type, position_x, position_y, config, label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          flowId,
          node.id,
          node.type,
          node.position?.x || 0,
          node.position?.y || 0,
          JSON.stringify(node.config || node.data || {}),
          node.label || node.data?.label
        ]
      );
    }

    // Insert new connections
    for (const conn of connections) {
      await client.query(
        `INSERT INTO ivr_flow_connections (flow_id, connection_id, source_node_id, target_node_id, condition_type, condition_value, label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          flowId,
          conn.id,
          conn.source,
          conn.target,
          conn.condition?.type || 'default',
          conn.condition?.value,
          conn.label
        ]
      );
    }

    await client.query('COMMIT');

    return await getFlow(tenantId, flowId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// AUDIO ASSETS
// =============================================================================

/**
 * Get audio assets
 */
export async function getAudioAssets(tenantId, options = {}) {
  const { asset_type, language, search, limit = 50, offset = 0 } = options;

  let query = `SELECT * FROM ivr_audio_assets WHERE tenant_id = $1`;
  const params = [tenantId];
  let paramIndex = 2;

  if (asset_type) {
    query += ` AND asset_type = $${paramIndex++}`;
    params.push(asset_type);
  }

  if (language) {
    query += ` AND language = $${paramIndex++}`;
    params.push(language);
  }

  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY name LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create audio asset
 */
export async function createAudioAsset(tenantId, data, createdBy) {
  const {
    name,
    description,
    asset_type,
    tts_text,
    tts_voice,
    tts_provider,
    file_url,
    file_size,
    duration_seconds,
    language = 'en-US',
  } = data;

  const result = await pool.query(
    `INSERT INTO ivr_audio_assets (
      tenant_id, name, description, asset_type,
      tts_text, tts_voice, tts_provider,
      file_url, file_size, duration_seconds,
      language, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      tenantId, name, description, asset_type,
      tts_text, tts_voice, tts_provider,
      file_url, file_size, duration_seconds,
      language, createdBy
    ]
  );

  return result.rows[0];
}

/**
 * Delete audio asset
 */
export async function deleteAudioAsset(tenantId, assetId) {
  const result = await pool.query(
    `DELETE FROM ivr_audio_assets WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, assetId]
  );

  return result.rowCount > 0;
}

// =============================================================================
// TEMPLATES
// =============================================================================

/**
 * Get available templates
 */
export async function getTemplates(tenantId, category = null) {
  let query = `
    SELECT * FROM ivr_templates
    WHERE (tenant_id IS NULL OR tenant_id = $1)
  `;
  const params = [tenantId];

  if (category) {
    query += ` AND category = $2`;
    params.push(category);
  }

  query += ` ORDER BY is_system DESC, usage_count DESC, name`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create flow from template
 */
export async function createFromTemplate(tenantId, templateId, name, createdBy) {
  const templateResult = await pool.query(
    `SELECT * FROM ivr_templates WHERE id = $1`,
    [templateId]
  );

  if (!templateResult.rows[0]) {
    throw new Error('Template not found');
  }

  const template = templateResult.rows[0];

  // Create the flow
  const flow = await createFlow(tenantId, {
    name: name || template.name,
    description: template.description,
  }, createdBy);

  // Parse template flow data
  const flowData = template.flow_data;

  // Create nodes
  for (const node of flowData.nodes || []) {
    await addNode(flow.id, {
      node_id: node.id,
      node_type: node.type,
      position_x: node.position?.x || 0,
      position_y: node.position?.y || 0,
      config: node.config || {},
      label: node.label,
    });
  }

  // Create connections
  for (const conn of flowData.connections || []) {
    await addConnection(flow.id, {
      connection_id: conn.id,
      source_node_id: conn.source,
      target_node_id: conn.target,
      condition_type: conn.condition?.type || 'default',
      condition_value: conn.condition?.value,
      label: conn.label,
    });
  }

  // Set entry node
  if (flowData.entryNode) {
    await pool.query(
      `UPDATE ivr_flows SET entry_node_id = $2, flow_data = $3 WHERE id = $1`,
      [flow.id, flowData.entryNode, JSON.stringify(flowData)]
    );
  }

  // Increment template usage
  await pool.query(
    `UPDATE ivr_templates SET usage_count = usage_count + 1 WHERE id = $1`,
    [templateId]
  );

  return await getFlow(tenantId, flow.id);
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Get flow analytics
 */
export async function getFlowAnalytics(tenantId, flowId, options = {}) {
  const { from_date, to_date, granularity = 'day' } = options;

  const fromDate = from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to_date || new Date().toISOString();

  // Overall metrics
  const metricsResult = await pool.query(
    `SELECT
      COUNT(*) as total_executions,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'transferred') as transferred,
      COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
      AVG(total_duration_seconds) as avg_duration,
      AVG(input_count) as avg_inputs
     FROM ivr_flow_executions
     WHERE flow_id = $1 AND started_at BETWEEN $2 AND $3`,
    [flowId, fromDate, toDate]
  );

  // Node-level analytics
  const nodeAnalyticsResult = await pool.query(
    `SELECT
      node_id,
      SUM(entries) as total_entries,
      SUM(exits) as total_exits,
      SUM(timeouts) as total_timeouts,
      SUM(invalid_inputs) as total_invalid,
      AVG(avg_time_in_node_seconds) as avg_time
     FROM ivr_flow_node_analytics
     WHERE flow_id = $1 AND date BETWEEN $2 AND $3
     GROUP BY node_id`,
    [flowId, fromDate, toDate]
  );

  // Time series
  let timeSeriesQuery;
  if (granularity === 'hour') {
    timeSeriesQuery = `
      SELECT
        date_trunc('hour', started_at) as period,
        COUNT(*) as executions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM ivr_flow_executions
      WHERE flow_id = $1 AND started_at BETWEEN $2 AND $3
      GROUP BY period
      ORDER BY period
    `;
  } else {
    timeSeriesQuery = `
      SELECT
        date_trunc('day', started_at) as period,
        COUNT(*) as executions,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM ivr_flow_executions
      WHERE flow_id = $1 AND started_at BETWEEN $2 AND $3
      GROUP BY period
      ORDER BY period
    `;
  }

  const timeSeriesResult = await pool.query(timeSeriesQuery, [flowId, fromDate, toDate]);

  return {
    metrics: metricsResult.rows[0],
    nodeAnalytics: nodeAnalyticsResult.rows,
    timeSeries: timeSeriesResult.rows,
  };
}

// =============================================================================
// EXECUTION (for runtime)
// =============================================================================

/**
 * Start a flow execution
 */
export async function startExecution(flowId, callData) {
  const { call_id, caller_id, called_number } = callData;

  // Get flow version
  const flowResult = await pool.query(
    `SELECT version FROM ivr_flows WHERE id = $1`,
    [flowId]
  );

  const result = await pool.query(
    `INSERT INTO ivr_flow_executions (flow_id, flow_version, call_id, caller_id, called_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [flowId, flowResult.rows[0]?.version || 1, call_id, caller_id, called_number]
  );

  // Increment flow execution count
  await pool.query(
    `UPDATE ivr_flows SET total_executions = total_executions + 1 WHERE id = $1`,
    [flowId]
  );

  return result.rows[0];
}

/**
 * Update execution state
 */
export async function updateExecution(executionId, data) {
  const allowedFields = ['current_node_id', 'nodes_visited', 'variables', 'status', 'exit_reason', 'exit_node_id', 'transferred_to', 'transfer_type', 'error_message', 'error_node_id', 'input_count', 'retry_count'];

  const updates = [];
  const values = [executionId];
  let paramIndex = 2;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === 'nodes_visited' || field === 'variables') {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(JSON.stringify(data[field]));
      } else {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field]);
      }
    }
  }

  // Calculate duration if ending
  if (data.status && ['completed', 'transferred', 'abandoned', 'error'].includes(data.status)) {
    updates.push(`ended_at = NOW()`);
    updates.push(`total_duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))`);
  }

  if (updates.length === 0) {
    return null;
  }

  const result = await pool.query(
    `UPDATE ivr_flow_executions
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Get flow for execution (runtime)
 */
export async function getFlowForExecution(phoneNumberId) {
  const result = await pool.query(
    `SELECT f.*, json_agg(DISTINCT n.*) as nodes, json_agg(DISTINCT c.*) as connections
     FROM ivr_flows f
     LEFT JOIN ivr_flow_nodes n ON f.id = n.flow_id
     LEFT JOIN ivr_flow_connections c ON f.id = c.flow_id
     WHERE f.phone_number_id = $1 AND f.status = 'published'
     GROUP BY f.id
     LIMIT 1`,
    [phoneNumberId]
  );

  return result.rows[0];
}
