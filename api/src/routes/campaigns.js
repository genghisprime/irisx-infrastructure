/**
 * Campaign Management Routes
 * Outbound campaign dialer with contact list management
 */

import { Hono } from 'hono'
import { z } from 'zod'
import pool from '../db/connection.js'

const campaigns = new Hono()

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  caller_id: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  max_concurrent_calls: z.number().int().min(1).max(100).default(5),
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_delay: z.number().int().min(60).max(86400).default(3600), // seconds
  schedule_start: z.string().datetime().optional(),
  schedule_end: z.string().datetime().optional(),
  call_script: z.string().optional()
})

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  caller_id: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  max_concurrent_calls: z.number().int().min(1).max(100).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  retry_delay: z.number().int().min(60).max(86400).optional(),
  schedule_start: z.string().datetime().optional(),
  schedule_end: z.string().datetime().optional(),
  call_script: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']).optional()
})

const uploadContactsSchema = z.object({
  contacts: z.array(z.object({
    phone_number: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }))
})

// GET /v1/campaigns - List all campaigns
campaigns.get('/', async (c) => {
  const tenantId = c.get('tenantId')
  const { page = 1, limit = 20, status } = c.req.query()

  try {
    let query = `
      SELECT
        c.*,
        COUNT(cc.id) as total_contacts,
        COUNT(CASE WHEN cc.status = 'pending' THEN 1 END) as pending_contacts,
        COUNT(CASE WHEN cc.status = 'called' THEN 1 END) as called_contacts,
        COUNT(CASE WHEN cc.status = 'completed' THEN 1 END) as completed_contacts,
        COUNT(CASE WHEN cc.status = 'failed' THEN 1 END) as failed_contacts
      FROM campaigns c
      LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
    `
    const params = [tenantId]

    if (status) {
      query += ` AND c.status = $${params.length + 1}`
      params.push(status)
    }

    query += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit))

    const result = await pool.query(query, params)

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaigns WHERE tenant_id = $1 AND deleted_at IS NULL ${status ? 'AND status = $2' : ''}`
    const countParams = status ? [tenantId, status] : [tenantId]
    const countResult = await pool.query(countQuery, countParams)

    return c.json({
      campaigns: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Error fetching campaigns:', error)
    return c.json({ error: 'Failed to fetch campaigns' }, 500)
  }
})

// POST /v1/campaigns - Create new campaign
campaigns.post('/', async (c) => {
  const tenantId = c.get('tenantId')
  const userId = c.get('userId')

  try {
    const body = await c.req.json()
    const data = createCampaignSchema.parse(body)

    const result = await pool.query(
      `INSERT INTO campaigns (
        tenant_id, created_by, name, description, caller_id,
        max_concurrent_calls, max_retries, retry_delay,
        schedule_start, schedule_end, call_script, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
      RETURNING *`,
      [
        tenantId, userId, data.name, data.description, data.caller_id,
        data.max_concurrent_calls, data.max_retries, data.retry_delay,
        data.schedule_start, data.schedule_end, data.call_script
      ]
    )

    return c.json({ campaign: result.rows[0] }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error creating campaign:', error)
    return c.json({ error: 'Failed to create campaign' }, 500)
  }
})

// GET /v1/campaigns/:id - Get campaign details
campaigns.get('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `SELECT
        c.*,
        COUNT(cc.id) as total_contacts,
        COUNT(CASE WHEN cc.status = 'pending' THEN 1 END) as pending_contacts,
        COUNT(CASE WHEN cc.status = 'called' THEN 1 END) as called_contacts,
        COUNT(CASE WHEN cc.status = 'completed' THEN 1 END) as completed_contacts,
        COUNT(CASE WHEN cc.status = 'failed' THEN 1 END) as failed_contacts,
        AVG(CASE WHEN cc.call_duration IS NOT NULL THEN cc.call_duration END) as avg_call_duration
      FROM campaigns c
      LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
      GROUP BY c.id`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ campaign: result.rows[0] })
  } catch (error) {
    console.error('Error fetching campaign:', error)
    return c.json({ error: 'Failed to fetch campaign' }, 500)
  }
})

// PATCH /v1/campaigns/:id - Update campaign
campaigns.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const data = updateCampaignSchema.parse(body)

    // Build dynamic update query
    const updates = []
    const values = []
    let paramCount = 1

    Object.entries(data).forEach(([key, value]) => {
      updates.push(`${key} = $${paramCount}`)
      values.push(value)
      paramCount++
    })

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400)
    }

    updates.push(`updated_at = NOW()`)
    values.push(id, tenantId)

    const query = `
      UPDATE campaigns
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} AND deleted_at IS NULL
      RETURNING *
    `

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ campaign: result.rows[0] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error updating campaign:', error)
    return c.json({ error: 'Failed to update campaign' }, 500)
  }
})

// DELETE /v1/campaigns/:id - Delete campaign (soft delete)
campaigns.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `UPDATE campaigns
       SET deleted_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    return c.json({ message: 'Campaign deleted successfully' })
  } catch (error) {
    console.error('Error deleting campaign:', error)
    return c.json({ error: 'Failed to delete campaign' }, 500)
  }
})

// POST /v1/campaigns/:id/contacts - Upload contacts
campaigns.post('/:id/contacts', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const body = await c.req.json()
    const data = uploadContactsSchema.parse(body)

    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    // Insert contacts in batch
    const values = []
    const placeholders = []
    let paramCount = 1

    data.contacts.forEach((contact, idx) => {
      placeholders.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, $${paramCount + 4})`)
      values.push(
        id,
        contact.phone_number,
        contact.first_name || null,
        contact.last_name || null,
        contact.metadata ? JSON.stringify(contact.metadata) : null
      )
      paramCount += 5
    })

    const query = `
      INSERT INTO campaign_contacts (campaign_id, phone_number, first_name, last_name, metadata)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (campaign_id, phone_number) DO NOTHING
      RETURNING id
    `

    const result = await pool.query(query, values)

    return c.json({
      message: 'Contacts uploaded successfully',
      inserted: result.rows.length,
      duplicates: data.contacts.length - result.rows.length
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400)
    }
    console.error('Error uploading contacts:', error)
    return c.json({ error: 'Failed to upload contacts' }, 500)
  }
})

// GET /v1/campaigns/:id/contacts - List campaign contacts
campaigns.get('/:id/contacts', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()
  const { page = 1, limit = 50, status } = c.req.query()

  try {
    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    let query = 'SELECT * FROM campaign_contacts WHERE campaign_id = $1'
    const params = [id]

    if (status) {
      query += ` AND status = $${params.length + 1}`
      params.push(status)
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit))

    const result = await pool.query(query, params)

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = $1 ${status ? 'AND status = $2' : ''}`
    const countParams = status ? [id, status] : [id]
    const countResult = await pool.query(countQuery, countParams)

    return c.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Error fetching contacts:', error)
    return c.json({ error: 'Failed to fetch contacts' }, 500)
  }
})

// POST /v1/campaigns/:id/start - Start campaign
campaigns.post('/:id/start', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'running', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'scheduled', 'paused') AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found or cannot be started' }, 400)
    }

    // TODO: Trigger campaign dialer worker

    return c.json({ campaign: result.rows[0], message: 'Campaign started successfully' })
  } catch (error) {
    console.error('Error starting campaign:', error)
    return c.json({ error: 'Failed to start campaign' }, 500)
  }
})

// POST /v1/campaigns/:id/pause - Pause campaign
campaigns.post('/:id/pause', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'running' AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId]
    )

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found or not running' }, 400)
    }

    return c.json({ campaign: result.rows[0], message: 'Campaign paused successfully' })
  } catch (error) {
    console.error('Error pausing campaign:', error)
    return c.json({ error: 'Failed to pause campaign' }, 500)
  }
})

// GET /v1/campaigns/:id/stats - Campaign statistics
campaigns.get('/:id/stats', async (c) => {
  const tenantId = c.get('tenantId')
  const { id } = c.req.param()

  try {
    // Verify campaign exists
    const campaignCheck = await pool.query(
      'SELECT id, status FROM campaigns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenantId]
    )

    if (campaignCheck.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    const stats = await pool.query(
      `SELECT
        COUNT(*) as total_contacts,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'called' THEN 1 END) as called,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'no_answer' THEN 1 END) as no_answer,
        COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy,
        AVG(CASE WHEN call_duration IS NOT NULL THEN call_duration END) as avg_duration,
        SUM(CASE WHEN call_duration IS NOT NULL THEN call_duration END) as total_duration
      FROM campaign_contacts
      WHERE campaign_id = $1`,
      [id]
    )

    return c.json({
      campaign_id: id,
      campaign_status: campaignCheck.rows[0].status,
      ...stats.rows[0]
    })
  } catch (error) {
    console.error('Error fetching campaign stats:', error)
    return c.json({ error: 'Failed to fetch campaign statistics' }, 500)
  }
})

export default campaigns
