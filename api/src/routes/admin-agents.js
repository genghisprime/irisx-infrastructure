/**
 * Admin Agents API Routes
 * Manage agents and their SIP extensions
 *
 * Endpoints:
 * - POST   /v1/admin/agents       - Create new agent with auto-provisioning
 * - GET    /v1/admin/agents       - List all agents for tenant
 * - GET    /v1/admin/agents/:id   - Get agent details
 * - PATCH  /v1/admin/agents/:id   - Update agent (suspend/activate)
 * - DELETE /v1/admin/agents/:id   - Delete agent and deprovision extensions
 */

import { Hono } from 'hono'
import { z } from 'zod'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { query } from '../db/connection.js'
import { authenticateJWT } from '../middleware/auth.js'
import {
  provisionExtension,
  deprovisionExtension,
  getFreeSWITCHStatus
} from '../services/freeswitch-provisioning.js'

const router = new Hono()

// ============================================================================
// Validation Schemas
// ============================================================================

const createAgentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['agent', 'supervisor', 'admin']).default('agent'),
  extensions_count: z.number().int().min(1).max(5).default(1),
  send_welcome_email: z.boolean().default(true)
})

const updateAgentSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'suspended']).optional()
})

// ============================================================================
// POST /v1/admin/agents - Create Agent
// ============================================================================

router.post('/v1/admin/agents', async (c) => {
  try {
    const body = await c.req.json()
    const data = createAgentSchema.parse(body)
    const tenantId = c.get('tenantId')
    const db = c.get('db')

    console.log(`📞 Creating agent for tenant ${tenantId}: ${data.email}`)

    // 1. Check if email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
      [data.email, tenantId]
    )

    if (existingUser.rows.length > 0) {
      return c.json({
        error: 'Email already exists',
        message: `An agent with email ${data.email} already exists in your account`
      }, 400)
    }

    // 2. Generate temporary password
    const tempPassword = crypto.randomBytes(16).toString('hex')
    const hashedPassword = await bcrypt.hash(tempPassword, 10)

    // 3. Create user account
    const userResult = await db.query(
      `INSERT INTO users (tenant_id, email, password, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role`,
      [tenantId, data.email, hashedPassword, data.first_name, data.last_name, data.role]
    )

    const user = userResult.rows[0]
    console.log(`  ✅ User created: ID ${user.id}`)

    // 4. Find or create available extensions
    const assignedExtensions = []
    const extensionResults = await db.query(
      `SELECT id, extension, sip_password
       FROM agent_extensions
       WHERE tenant_id = $1 AND user_id IS NULL AND status = 'active'
       ORDER BY CAST(extension AS INTEGER) ASC
       LIMIT $2`,
      [tenantId, data.extensions_count]
    )

    let extensions = extensionResults.rows

    // If not enough pre-created extensions, create new ones
    if (extensions.length < data.extensions_count) {
      const needed = data.extensions_count - extensions.length

      // Get next extension number
      const lastExtResult = await db.query(
        `SELECT COALESCE(MAX(CAST(extension AS INTEGER)), $1) as last_ext
         FROM agent_extensions
         WHERE tenant_id = $2`,
        [(tenantId + 1) * 1000 - 1, tenantId]
      )

      let nextExtNum = parseInt(lastExtResult.rows[0].last_ext) + 1

      for (let i = 0; i < needed; i++) {
        // Generate SIP password (will be stored in plaintext for FreeSWITCH)
        const sipPassword = crypto.randomBytes(32).toString('hex')

        const newExtResult = await db.query(
          `INSERT INTO agent_extensions (tenant_id, extension, sip_password, status, created_at)
           VALUES ($1, $2, $3, 'active', NOW())
           RETURNING id, extension, sip_password`,
          [tenantId, nextExtNum.toString(), sipPassword]
        )

        extensions.push(newExtResult.rows[0])
        nextExtNum++
      }
    }

    // 5. Assign extensions to user and provision in FreeSWITCH
    for (const ext of extensions) {
      // Assign to user in database
      await db.query(
        `UPDATE agent_extensions
         SET user_id = $1, assigned_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [user.id, ext.id]
      )

      // Provision in FreeSWITCH
      try {
        await provisionExtension({
          tenantId,
          extension: ext.extension,
          sipPassword: ext.sip_password,
          userName: `${data.first_name} ${data.last_name}`,
          voicemailEnabled: true
        })

        assignedExtensions.push({
          id: ext.id,
          extension: ext.extension
        })

        console.log(`  ✅ Extension ${ext.extension} assigned and provisioned`)

      } catch (provisionError) {
        console.error(`  ❌ Failed to provision extension ${ext.extension}:`, provisionError.message)

        // Rollback assignment in database
        await db.query(
          `UPDATE agent_extensions
           SET user_id = NULL, assigned_at = NULL
           WHERE id = $1`,
          [ext.id]
        )

        throw new Error(`Failed to provision extension ${ext.extension}: ${provisionError.message}`)
      }
    }

    // 6. TODO: Send welcome email (implement email service)
    if (data.send_welcome_email) {
      console.log(`  📧 TODO: Send welcome email to ${data.email}`)
      // await sendAgentWelcomeEmail({ email, tempPassword, extensions })
    }

    console.log(`✅ Agent created successfully: ${user.email}`)

    return c.json({
      success: true,
      agent: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        extensions: assignedExtensions
      },
      temporary_password: tempPassword, // Return to admin for first-time login
      message: `Agent ${user.first_name} ${user.last_name} created successfully with ${assignedExtensions.length} extension(s)`
    }, 201)

  } catch (error) {
    console.error('❌ Agent creation error:', error)

    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Validation failed',
        details: error.errors
      }, 400)
    }

    return c.json({
      error: 'Failed to create agent',
      message: error.message
    }, 500)
  }
})

// ============================================================================
// GET /v1/admin/agents - List Agents
// ============================================================================

router.get('/v1/admin/agents', async (c) => {
  try {
    const tenantId = c.get('tenantId')
    const db = c.get('db')

    // Query parameters for filtering
    const status = c.req.query('status') // active, suspended
    const role = c.req.query('role') // agent, supervisor, admin
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = (page - 1) * limit

    let whereClause = 'WHERE u.tenant_id = $1 AND u.deleted_at IS NULL'
    const params = [tenantId]

    if (status) {
      params.push(status)
      whereClause += ` AND u.status = $${params.length}`
    }

    if (role) {
      params.push(role)
      whereClause += ` AND u.role = $${params.length}`
    }

    // Get agents with their extensions
    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.last_login_at,
        u.created_at,
        json_agg(
          json_build_object(
            'id', ae.id,
            'extension', ae.extension,
            'status', ae.status,
            'last_login_at', ae.last_login_at
          )
        ) FILTER (WHERE ae.id IS NOT NULL) as extensions
      FROM users u
      LEFT JOIN agent_extensions ae ON ae.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.last_login_at, u.created_at
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset])

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      ${whereClause}
    `, params)

    return c.json({
      success: true,
      agents: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    })

  } catch (error) {
    console.error('List agents error:', error)
    return c.json({ error: 'Failed to list agents', message: error.message }, 500)
  }
})

// ============================================================================
// GET /v1/admin/agents/:id - Get Agent Details
// ============================================================================

router.get('/v1/admin/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id')
    const tenantId = c.get('tenantId')
    const db = c.get('db')

    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        json_agg(
          json_build_object(
            'id', ae.id,
            'extension', ae.extension,
            'status', ae.status,
            'voicemail_enabled', ae.voicemail_enabled,
            'assigned_at', ae.assigned_at,
            'last_login_at', ae.last_login_at
          )
        ) FILTER (WHERE ae.id IS NOT NULL) as extensions
      FROM users u
      LEFT JOIN agent_extensions ae ON ae.user_id = u.id
      WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL
      GROUP BY u.id
    `, [agentId, tenantId])

    if (result.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    return c.json({
      success: true,
      agent: result.rows[0]
    })

  } catch (error) {
    console.error('Get agent error:', error)
    return c.json({ error: 'Failed to get agent', message: error.message }, 500)
  }
})

// ============================================================================
// PATCH /v1/admin/agents/:id - Update Agent
// ============================================================================

router.patch('/v1/admin/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id')
    const tenantId = c.get('tenantId')
    const db = c.get('db')

    const body = await c.req.json()
    const data = updateAgentSchema.parse(body)

    // Build UPDATE query dynamically
    const updates = []
    const values = []
    let paramCounter = 1

    if (data.first_name) {
      updates.push(`first_name = $${paramCounter}`)
      values.push(data.first_name)
      paramCounter++
    }

    if (data.last_name) {
      updates.push(`last_name = $${paramCounter}`)
      values.push(data.last_name)
      paramCounter++
    }

    if (data.email) {
      updates.push(`email = $${paramCounter}`)
      values.push(data.email)
      paramCounter++
    }

    if (data.status) {
      updates.push(`status = $${paramCounter}`)
      values.push(data.status)
      paramCounter++

      // Also update extension status
      await db.query(
        `UPDATE agent_extensions
         SET status = $1
         WHERE user_id = $2 AND tenant_id = $3`,
        [data.status, agentId, tenantId]
      )
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    updates.push(`updated_at = NOW()`)
    values.push(agentId, tenantId)

    const result = await db.query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter} AND tenant_id = $${paramCounter + 1} AND deleted_at IS NULL
      RETURNING id, email, first_name, last_name, role, status
    `, values)

    if (result.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    return c.json({
      success: true,
      agent: result.rows[0],
      message: 'Agent updated successfully'
    })

  } catch (error) {
    console.error('Update agent error:', error)

    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }

    return c.json({ error: 'Failed to update agent', message: error.message }, 500)
  }
})

// ============================================================================
// DELETE /v1/admin/agents/:id - Delete Agent
// ============================================================================

router.delete('/v1/admin/agents/:id', async (c) => {
  try {
    const agentId = c.req.param('id')
    const tenantId = c.get('tenantId')
    const db = c.get('db')

    console.log(`🗑️  Deleting agent ${agentId}...`)

    // 1. Get agent's extensions
    const extResult = await db.query(
      `SELECT id, extension FROM agent_extensions
       WHERE user_id = $1 AND tenant_id = $2`,
      [agentId, tenantId]
    )

    // 2. Deprovision extensions from FreeSWITCH
    for (const ext of extResult.rows) {
      try {
        await deprovisionExtension(ext.extension)
        console.log(`  ✅ Extension ${ext.extension} deprovisioned`)
      } catch (error) {
        console.warn(`  ⚠️  Failed to deprovision extension ${ext.extension}:`, error.message)
        // Continue anyway
      }
    }

    // 3. Unassign extensions (return to pool)
    await db.query(
      `UPDATE agent_extensions
       SET user_id = NULL, assigned_at = NULL, status = 'active', updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [agentId, tenantId]
    )

    // 4. Soft delete user
    const result = await db.query(
      `UPDATE users
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, email`,
      [agentId, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    console.log(`✅ Agent deleted: ${result.rows[0].email}`)

    return c.json({
      success: true,
      message: `Agent ${result.rows[0].email} deleted successfully`,
      extensions_returned: extResult.rows.length
    })

  } catch (error) {
    console.error('Delete agent error:', error)
    return c.json({ error: 'Failed to delete agent', message: error.message }, 500)
  }
})

// ============================================================================
// GET /v1/admin/freeswitch/status - FreeSWITCH Server Status
// ============================================================================

router.get('/v1/admin/freeswitch/status', async (c) => {
  try {
    const status = await getFreeSWITCHStatus()
    return c.json(status)
  } catch (error) {
    console.error('FreeSWITCH status error:', error)
    return c.json({
      success: false,
      error: 'Failed to get FreeSWITCH status',
      message: error.message
    }, 500)
  }
})

export default router
