/**
 * Admin Contacts Management Routes
 * Cross-tenant contact database management, search, and DNC list administration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import { authenticateAdmin } from './admin-auth.js';

const adminContacts = new Hono();

// All routes require admin authentication
adminContacts.use('*', authenticateAdmin);

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const searchContactsSchema = z.object({
  tenant_id: z.string().optional(),
  search: z.string().optional(),
  tags: z.string().optional(), // Comma-separated
  list_id: z.string().optional(),
  status: z.enum(['active', 'inactive', 'dnc']).optional(),
  page: z.string().default('1'),
  limit: z.string().default('50')
});

const bulkActionSchema = z.object({
  contact_ids: z.array(z.number().int().positive()),
  action: z.enum(['add_tag', 'remove_tag', 'add_to_list', 'remove_from_list', 'mark_dnc', 'delete']),
  tag_name: z.string().optional(),
  list_id: z.number().int().positive().optional()
});

// =====================================================
// GET /admin/contacts
// Search and list contacts across all tenants
// =====================================================
adminContacts.get('/', async (c) => {
  try {
    const admin = c.get('admin');
    const query = c.req.query();
    const params = searchContactsSchema.parse(query);

    const page = parseInt(params.page);
    const limit = parseInt(params.limit);
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (params.tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      values.push(parseInt(params.tenant_id));
    }

    if (params.search) {
      paramCount++;
      conditions.push(`(
        c.first_name ILIKE $${paramCount} OR
        c.last_name ILIKE $${paramCount} OR
        c.email ILIKE $${paramCount} OR
        c.phone ILIKE $${paramCount}
      )`);
      values.push(`%${params.search}%`);
    }

    if (params.status) {
      paramCount++;
      conditions.push(`c.status = $${paramCount}`);
      values.push(params.status);
    }

    // Filter by list membership
    if (params.list_id) {
      paramCount++;
      conditions.push(`EXISTS (
        SELECT 1 FROM contact_list_members clm
        WHERE clm.contact_id = c.id AND clm.list_id = $${paramCount}
      )`);
      values.push(parseInt(params.list_id));
    }

    // Filter by tags (using array column)
    if (params.tags) {
      const tagNames = params.tags.split(',').map(t => t.trim());
      paramCount++;
      conditions.push(`c.tags && $${paramCount}::text[]`);
      values.push(tagNames);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get contacts with tenant info
    paramCount++;
    const limitValue = paramCount;
    paramCount++;
    const offsetValue = paramCount;

    const contactsQuery = `
      SELECT
        c.*,
        t.name as tenant_name,
        (
          SELECT COUNT(*)
          FROM contact_list_members clm
          WHERE clm.contact_id = c.id
        ) as list_count
      FROM contacts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${limitValue} OFFSET $${offsetValue}
    `;

    const contacts = await pool.query(contactsQuery, [...values, limit, offset]);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'admin.contacts.list',
      'contact',
      JSON.stringify({ filters: params, result_count: contacts.rows.length })
    ]);

    return c.json({
      contacts: contacts.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing contacts:', error);
    return c.json({ error: 'Failed to list contacts', message: error.message }, 500);
  }
});

// =====================================================
// POST /admin/contacts/bulk-action
// Perform bulk actions on contacts
// =====================================================
adminContacts.post('/bulk-action', async (c) => {
  try {
    const admin = c.get('admin');
    const body = await c.req.json();
    const data = bulkActionSchema.parse(body);

    let query;
    let params;
    let actionDescription;

    switch (data.action) {
      case 'add_tag':
        if (!data.tag_name) {
          return c.json({ error: 'tag_name required for add_tag action' }, 400);
        }
        query = `
          UPDATE contacts
          SET tags = array_append(tags, $2),
              updated_at = NOW()
          WHERE id = ANY($1::int[])
            AND (tags IS NULL OR NOT ($2 = ANY(tags)))
        `;
        params = [data.contact_ids, data.tag_name];
        actionDescription = `Added tag "${data.tag_name}"`;
        break;

      case 'remove_tag':
        if (!data.tag_name) {
          return c.json({ error: 'tag_name required for remove_tag action' }, 400);
        }
        query = `
          UPDATE contacts
          SET tags = array_remove(tags, $2),
              updated_at = NOW()
          WHERE id = ANY($1::int[])
            AND $2 = ANY(tags)
        `;
        params = [data.contact_ids, data.tag_name];
        actionDescription = `Removed tag "${data.tag_name}"`;
        break;

      case 'add_to_list':
        if (!data.list_id) {
          return c.json({ error: 'list_id required for add_to_list action' }, 400);
        }
        query = `
          INSERT INTO contact_list_members (contact_id, list_id, added_at)
          SELECT unnest($1::int[]), $2, NOW()
          ON CONFLICT (contact_id, list_id) DO NOTHING
        `;
        params = [data.contact_ids, data.list_id];
        actionDescription = `Added to list ${data.list_id}`;
        break;

      case 'remove_from_list':
        if (!data.list_id) {
          return c.json({ error: 'list_id required for remove_from_list action' }, 400);
        }
        query = `
          DELETE FROM contact_list_members
          WHERE contact_id = ANY($1::int[]) AND list_id = $2
        `;
        params = [data.contact_ids, data.list_id];
        actionDescription = `Removed from list ${data.list_id}`;
        break;

      case 'mark_dnc':
        query = `
          UPDATE contacts
          SET status = 'dnc', updated_at = NOW()
          WHERE id = ANY($1::int[])
        `;
        params = [data.contact_ids];
        actionDescription = 'Marked as Do Not Call';
        break;

      case 'delete':
        // Soft delete
        query = `
          UPDATE contacts
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ANY($1::int[]) AND deleted_at IS NULL
        `;
        params = [data.contact_ids];
        actionDescription = 'Deleted contacts';
        break;

      default:
        return c.json({ error: 'Invalid action' }, 400);
    }

    const result = await pool.query(query, params);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      `admin.contacts.bulk_${data.action}`,
      'contact',
      JSON.stringify({
        action: data.action,
        contact_count: data.contact_ids.length,
        affected_rows: result.rowCount
      })
    ]);

    return c.json({
      success: true,
      action: data.action,
      affected: result.rowCount,
      message: `${actionDescription} for ${result.rowCount} contacts`
    });
  } catch (error) {
    console.error('Error performing bulk action:', error);
    return c.json({ error: 'Failed to perform bulk action', message: error.message }, 500);
  }
});

// =====================================================
// GET /admin/contacts/dnc
// Get Do Not Call list
// =====================================================
adminContacts.get('/dnc', async (c) => {
  try {
    const admin = c.get('admin');
    const { tenant_id, page = '1', limit = '50' } = c.req.query();

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['c.status = $1'];
    const values = ['dnc'];
    let paramCount = 1;

    if (tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      values.push(parseInt(tenant_id));
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // Get count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM contacts c
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get DNC contacts
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const dncQuery = `
      SELECT
        c.id,
        c.tenant_id,
        c.phone,
        c.email,
        c.first_name,
        c.last_name,
        c.created_at,
        c.updated_at,
        t.name as tenant_name
      FROM contacts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.updated_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const dncResult = await pool.query(dncQuery, [...values, limitNum, offset]);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'admin.contacts.dnc.list',
      'contact',
      JSON.stringify({ tenant_id, total })
    ]);

    return c.json({
      dnc_contacts: dncResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error getting DNC list:', error);
    return c.json({ error: 'Failed to get DNC list', message: error.message }, 500);
  }
});

// =====================================================
// GET /admin/contacts/stats
// Get contact statistics across tenants
// =====================================================
adminContacts.get('/stats', async (c) => {
  try {
    const admin = c.get('admin');

    const statsQuery = `
      SELECT
        COUNT(*) as total_contacts,
        COUNT(DISTINCT tenant_id) as total_tenants,
        COUNT(*) FILTER (WHERE status = 'active') as active_contacts,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive_contacts,
        COUNT(*) FILTER (WHERE status = 'dnc') as dnc_contacts,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') as active_this_week
      FROM contacts
      WHERE deleted_at IS NULL
    `;

    const statsResult = await pool.query(statsQuery);

    // Top tenants by contact count
    const topTenantsQuery = `
      SELECT
        t.id,
        t.name,
        t.name,
        COUNT(c.id) as contact_count
      FROM tenants t
      LEFT JOIN contacts c ON t.id = c.tenant_id AND c.deleted_at IS NULL
      GROUP BY t.id, t.name, t.name
      ORDER BY contact_count DESC
      LIMIT 10
    `;

    const topTenantsResult = await pool.query(topTenantsQuery);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type)
      VALUES ($1, $2, $3)
    `, [admin.id, 'admin.contacts.stats', 'contact']);

    return c.json({
      stats: statsResult.rows[0],
      top_tenants: topTenantsResult.rows
    });
  } catch (error) {
    console.error('Error getting contact stats:', error);
    return c.json({ error: 'Failed to get contact stats', message: error.message }, 500);
  }
});

// =====================================================
// GET /admin/contacts/lists
// Get all contact lists across tenants
// =====================================================
adminContacts.get('/lists', async (c) => {
  try {
    const admin = c.get('admin');
    const { tenant_id, page = '1', limit = '50' } = c.req.query();

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (tenant_id) {
      paramCount++;
      conditions.push(`cl.tenant_id = $${paramCount}`);
      values.push(parseInt(tenant_id));
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM contact_lists cl
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get lists with contact counts
    paramCount++;
    const limitParam = paramCount;
    paramCount++;
    const offsetParam = paramCount;

    const listsQuery = `
      SELECT
        cl.*,
        t.name as tenant_name,
        (
          SELECT COUNT(*)
          FROM contact_list_members clm
          WHERE clm.list_id = cl.id
        ) as contact_count
      FROM contact_lists cl
      LEFT JOIN tenants t ON cl.tenant_id = t.id
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const listsResult = await pool.query(listsQuery, [...values, limitNum, offset]);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'admin.contacts.lists.list',
      'contact_list',
      JSON.stringify({ tenant_id, total })
    ]);

    return c.json({
      lists: listsResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error getting contact lists:', error);
    return c.json({ error: 'Failed to get contact lists', message: error.message }, 500);
  }
});

// =====================================================
// GET /admin/contacts/export
// Export contacts to CSV
// =====================================================
adminContacts.get('/export', async (c) => {
  try {
    const admin = c.get('admin');
    const { tenant_id, status, list_id } = c.req.query();

    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (tenant_id) {
      paramCount++;
      conditions.push(`c.tenant_id = $${paramCount}`);
      values.push(parseInt(tenant_id));
    }

    if (status) {
      paramCount++;
      conditions.push(`c.status = $${paramCount}`);
      values.push(status);
    }

    if (list_id) {
      paramCount++;
      conditions.push(`EXISTS (
        SELECT 1 FROM contact_list_members clm
        WHERE clm.contact_id = c.id AND clm.list_id = $${paramCount}
      )`);
      values.push(parseInt(list_id));
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const exportQuery = `
      SELECT
        c.id,
        c.tenant_id,
        t.name as tenant_name,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.status,
        c.created_at
      FROM contacts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT 10000
    `;

    const result = await pool.query(exportQuery, values);

    // Convert to CSV
    const headers = ['ID', 'Tenant ID', 'Tenant', 'First Name', 'Last Name', 'Email', 'Phone', 'Status', 'Created At'];
    const csv = [
      headers.join(','),
      ...result.rows.map(row => [
        row.id,
        row.tenant_id,
        row.tenant_name,
        row.first_name || '',
        row.last_name || '',
        row.email || '',
        row.phone || '',
        row.status,
        row.created_at
      ].join(','))
    ].join('\n');

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, changes)
      VALUES ($1, $2, $3, $4)
    `, [
      admin.id,
      'admin.contacts.export',
      'contact',
      JSON.stringify({ filters: { tenant_id, status, list_id }, count: result.rows.length })
    ]);

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="contacts_export_${Date.now()}.csv"`);
    return c.body(csv);
  } catch (error) {
    console.error('Error exporting contacts:', error);
    return c.json({ error: 'Failed to export contacts', message: error.message }, 500);
  }
});

// =====================================================
// GET /admin/contacts/:id
// Get contact details with full activity timeline
// NOTE: This route MUST be last to avoid catching other routes like /stats, /dnc, /lists
// =====================================================
adminContacts.get('/:id', async (c) => {
  try {
    const admin = c.get('admin');
    const contactId = parseInt(c.req.param('id'));

    // Get contact with all details
    const contactQuery = `
      SELECT
        c.*,
        t.name as tenant_name,
        t.name as tenant_company,
        c.tags,
        (
          SELECT json_agg(json_build_object(
            'id', cl.id,
            'name', cl.name,
            'added_at', clm.added_at
          ))
          FROM contact_list_members clm
          JOIN contact_lists cl ON clm.list_id = cl.id
          WHERE clm.contact_id = c.id
        ) as lists
      FROM contacts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = $1
    `;
    const contactResult = await pool.query(contactQuery, [contactId]);

    if (contactResult.rows.length === 0) {
      return c.json({ error: 'Contact not found' }, 404);
    }

    const contact = contactResult.rows[0];

    // Get activity timeline (messages, calls, campaigns)
    const activityQuery = `
      SELECT * FROM (
        -- Messages sent/received
        SELECT
          'message' as activity_type,
          m.id,
          m.direction,
          m.channel,
          m.status,
          m.body as content,
          m.created_at
        FROM messages m
        WHERE m.contact_id = $1

        UNION ALL

        -- Calls
        SELECT
          'call' as activity_type,
          c.id,
          c.direction,
          'voice' as channel,
          c.status,
          c.duration::text as content,
          c.created_at
        FROM calls c
        WHERE c.contact_id = $1

        UNION ALL

        -- Campaign interactions
        SELECT
          'campaign' as activity_type,
          cc.id,
          NULL as direction,
          ca.channel,
          cc.status,
          ca.name as content,
          cc.created_at
        FROM campaign_contacts cc
        JOIN campaigns ca ON cc.campaign_id = ca.id
        WHERE cc.contact_id = $1
      ) activities
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const activityResult = await pool.query(activityQuery, [contactId]);

    // Log audit
    await pool.query(`
      INSERT INTO admin_audit_log (admin_user_id, action, resource_type, resource_id, changes)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      admin.id,
      'admin.contact.view',
      'contact',
      contactId,
      JSON.stringify({ tenant_id: contact.tenant_id })
    ]);

    return c.json({
      contact,
      activity: activityResult.rows
    });
  } catch (error) {
    console.error('Error getting contact:', error);
    return c.json({ error: 'Failed to get contact', message: error.message }, 500);
  }
});

export default adminContacts;
