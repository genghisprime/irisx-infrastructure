/**
 * IVR Flow Builder API Routes
 * Visual drag-and-drop IVR flow editor
 */

import { Hono } from 'hono';
import { z } from 'zod';
import * as ivrService from '../services/ivr-flow-builder.js';

const ivrFlowBuilder = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const createFlowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const updateFlowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const nodeSchema = z.object({
  node_id: z.string().min(1).max(100),
  node_type: z.enum(['start', 'menu', 'play', 'input', 'transfer', 'voicemail', 'webhook', 'condition', 'set_variable', 'goto', 'end']),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  config: z.object({}).passthrough().optional(),
  label: z.string().max(100).optional(),
});

const connectionSchema = z.object({
  connection_id: z.string().min(1).max(100),
  source_node_id: z.string().min(1).max(100),
  source_port: z.string().max(50).optional(),
  target_node_id: z.string().min(1).max(100),
  target_port: z.string().max(50).optional(),
  condition: z.string().optional(),
  label: z.string().max(100).optional(),
});

const flowStateSchema = z.object({
  nodes: z.array(z.object({
    node_id: z.string(),
    node_type: z.string(),
    position_x: z.number().optional(),
    position_y: z.number().optional(),
    config: z.object({}).passthrough().optional(),
    label: z.string().optional(),
  })),
  connections: z.array(z.object({
    connection_id: z.string(),
    source_node_id: z.string(),
    source_port: z.string().optional(),
    target_node_id: z.string(),
    target_port: z.string().optional(),
    condition: z.string().optional(),
    label: z.string().optional(),
  })),
  entryNodeId: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
});

const audioAssetSchema = z.object({
  name: z.string().min(1).max(255),
  audio_type: z.enum(['upload', 'tts', 'recording']),
  text_content: z.string().optional(),
  tts_voice: z.string().max(100).optional(),
  tts_provider: z.enum(['openai', 'elevenlabs', 'aws_polly', 'google']).optional(),
});

const variableSchema = z.object({
  name: z.string().min(1).max(100),
  variable_type: z.enum(['string', 'number', 'boolean', 'date', 'array']),
  default_value: z.string().optional(),
  description: z.string().optional(),
});

// =============================================================================
// Middleware
// =============================================================================

ivrFlowBuilder.use('*', async (c, next) => {
  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// =============================================================================
// FLOW CRUD
// =============================================================================

/**
 * GET /v1/ivr/flows
 * List all IVR flows for tenant
 */
ivrFlowBuilder.get('/flows', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const status = c.req.query('status');
    const search = c.req.query('search');

    const flows = await ivrService.listFlows(tenantId, { status, search });

    return c.json({
      success: true,
      flows,
    });
  } catch (error) {
    console.error('List flows error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows
 * Create new IVR flow
 */
ivrFlowBuilder.post('/flows', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = createFlowSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const flow = await ivrService.createFlow(tenantId, validation.data);

    return c.json({
      success: true,
      flow,
    }, 201);
  } catch (error) {
    console.error('Create flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/ivr/flows/:id
 * Get single IVR flow with nodes and connections
 */
ivrFlowBuilder.get('/flows/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));

    const flow = await ivrService.getFlow(tenantId, flowId);

    if (!flow) {
      return c.json({ error: 'Flow not found' }, 404);
    }

    return c.json({
      success: true,
      flow,
    });
  } catch (error) {
    console.error('Get flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/ivr/flows/:id
 * Update IVR flow metadata
 */
ivrFlowBuilder.put('/flows/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = updateFlowSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const flow = await ivrService.updateFlow(tenantId, flowId, validation.data);

    return c.json({
      success: true,
      flow,
    });
  } catch (error) {
    console.error('Update flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/ivr/flows/:id
 * Delete IVR flow
 */
ivrFlowBuilder.delete('/flows/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));

    await ivrService.deleteFlow(tenantId, flowId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows/:id/publish
 * Publish IVR flow (make it active)
 */
ivrFlowBuilder.post('/flows/:id/publish', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));

    const flow = await ivrService.publishFlow(tenantId, flowId);

    return c.json({
      success: true,
      flow,
    });
  } catch (error) {
    console.error('Publish flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows/:id/duplicate
 * Duplicate IVR flow
 */
ivrFlowBuilder.post('/flows/:id/duplicate', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));

    const newName = body.name || null;
    const flow = await ivrService.duplicateFlow(tenantId, flowId, newName);

    return c.json({
      success: true,
      flow,
    }, 201);
  } catch (error) {
    console.error('Duplicate flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// FLOW STATE (Bulk Save)
// =============================================================================

/**
 * PUT /v1/ivr/flows/:id/state
 * Save entire flow state (nodes + connections)
 */
ivrFlowBuilder.put('/flows/:id/state', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = flowStateSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const flow = await ivrService.saveFlowState(tenantId, flowId, validation.data);

    return c.json({
      success: true,
      flow,
    });
  } catch (error) {
    console.error('Save flow state error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// NODE CRUD
// =============================================================================

/**
 * POST /v1/ivr/flows/:id/nodes
 * Add node to flow
 */
ivrFlowBuilder.post('/flows/:id/nodes', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = nodeSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const node = await ivrService.addNode(tenantId, flowId, validation.data);

    return c.json({
      success: true,
      node,
    }, 201);
  } catch (error) {
    console.error('Add node error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * PUT /v1/ivr/flows/:flowId/nodes/:nodeId
 * Update node
 */
ivrFlowBuilder.put('/flows/:flowId/nodes/:nodeId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('flowId'));
    const nodeId = c.req.param('nodeId');
    const body = await c.req.json();

    const node = await ivrService.updateNode(tenantId, flowId, nodeId, body);

    return c.json({
      success: true,
      node,
    });
  } catch (error) {
    console.error('Update node error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/ivr/flows/:flowId/nodes/:nodeId
 * Delete node
 */
ivrFlowBuilder.delete('/flows/:flowId/nodes/:nodeId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('flowId'));
    const nodeId = c.req.param('nodeId');

    await ivrService.deleteNode(tenantId, flowId, nodeId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete node error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// CONNECTION CRUD
// =============================================================================

/**
 * POST /v1/ivr/flows/:id/connections
 * Add connection between nodes
 */
ivrFlowBuilder.post('/flows/:id/connections', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = connectionSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const connection = await ivrService.addConnection(tenantId, flowId, validation.data);

    return c.json({
      success: true,
      connection,
    }, 201);
  } catch (error) {
    console.error('Add connection error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/ivr/flows/:flowId/connections/:connectionId
 * Delete connection
 */
ivrFlowBuilder.delete('/flows/:flowId/connections/:connectionId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('flowId'));
    const connectionId = c.req.param('connectionId');

    await ivrService.deleteConnection(tenantId, flowId, connectionId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete connection error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// AUDIO ASSETS
// =============================================================================

/**
 * GET /v1/ivr/audio
 * List audio assets
 */
ivrFlowBuilder.get('/audio', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const audioType = c.req.query('type');

    const assets = await ivrService.listAudioAssets(tenantId, audioType);

    return c.json({
      success: true,
      assets,
    });
  } catch (error) {
    console.error('List audio assets error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/audio
 * Create audio asset
 */
ivrFlowBuilder.post('/audio', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const body = await c.req.json();

    const validation = audioAssetSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const asset = await ivrService.createAudioAsset(tenantId, validation.data);

    return c.json({
      success: true,
      asset,
    }, 201);
  } catch (error) {
    console.error('Create audio asset error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/ivr/audio/:id
 * Delete audio asset
 */
ivrFlowBuilder.delete('/audio/:id', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const assetId = parseInt(c.req.param('id'));

    await ivrService.deleteAudioAsset(tenantId, assetId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete audio asset error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/audio/:id/generate-tts
 * Generate TTS audio
 */
ivrFlowBuilder.post('/audio/:id/generate-tts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const assetId = parseInt(c.req.param('id'));

    const asset = await ivrService.generateTTS(tenantId, assetId);

    return c.json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error('Generate TTS error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// VARIABLES
// =============================================================================

/**
 * GET /v1/ivr/flows/:id/variables
 * List flow variables
 */
ivrFlowBuilder.get('/flows/:id/variables', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));

    const variables = await ivrService.listVariables(tenantId, flowId);

    return c.json({
      success: true,
      variables,
    });
  } catch (error) {
    console.error('List variables error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows/:id/variables
 * Create flow variable
 */
ivrFlowBuilder.post('/flows/:id/variables', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json();

    const validation = variableSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.errors }, 400);
    }

    const variable = await ivrService.createVariable(tenantId, flowId, validation.data);

    return c.json({
      success: true,
      variable,
    }, 201);
  } catch (error) {
    console.error('Create variable error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/ivr/flows/:flowId/variables/:variableId
 * Delete flow variable
 */
ivrFlowBuilder.delete('/flows/:flowId/variables/:variableId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('flowId'));
    const variableId = parseInt(c.req.param('variableId'));

    await ivrService.deleteVariable(tenantId, flowId, variableId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Delete variable error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// TEMPLATES
// =============================================================================

/**
 * GET /v1/ivr/templates
 * List available templates
 */
ivrFlowBuilder.get('/templates', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const category = c.req.query('category');

    const templates = await ivrService.listTemplates(category);

    return c.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('List templates error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows/from-template/:templateId
 * Create flow from template
 */
ivrFlowBuilder.post('/flows/from-template/:templateId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const templateId = parseInt(c.req.param('templateId'));
    const body = await c.req.json().catch(() => ({}));

    const flowName = body.name || null;
    const flow = await ivrService.createFromTemplate(tenantId, templateId, flowName);

    return c.json({
      success: true,
      flow,
    }, 201);
  } catch (error) {
    console.error('Create from template error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * GET /v1/ivr/flows/:id/analytics
 * Get flow analytics
 */
ivrFlowBuilder.get('/flows/:id/analytics', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    const analytics = await ivrService.getFlowAnalytics(tenantId, flowId, startDate, endDate);

    return c.json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Get flow analytics error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/ivr/flows/:id/executions
 * Get recent flow executions
 */
ivrFlowBuilder.get('/flows/:id/executions', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const executions = await ivrService.getFlowExecutions(tenantId, flowId, limit, offset);

    return c.json({
      success: true,
      executions,
    });
  } catch (error) {
    console.error('Get flow executions error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * POST /v1/ivr/flows/:id/validate
 * Validate flow structure
 */
ivrFlowBuilder.post('/flows/:id/validate', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));

    const validation = await ivrService.validateFlow(tenantId, flowId);

    return c.json({
      success: true,
      validation,
    });
  } catch (error) {
    console.error('Validate flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /v1/ivr/flows/:id/test
 * Test flow with simulated call
 */
ivrFlowBuilder.post('/flows/:id/test', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const flowId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));

    const testResult = await ivrService.testFlow(tenantId, flowId, body);

    return c.json({
      success: true,
      result: testResult,
    });
  } catch (error) {
    console.error('Test flow error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default ivrFlowBuilder;
