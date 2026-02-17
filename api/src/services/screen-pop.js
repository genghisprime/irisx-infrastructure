/**
 * Screen Pop Service
 * Handles customer lookup and context for incoming calls
 */

import pool from '../db/connection.js';

/**
 * Look up a contact by phone number
 */
export async function lookupByPhone(tenantId, phoneNumber) {
  // Normalize phone number (remove non-digits, handle country codes)
  const normalizedPhone = normalizePhone(phoneNumber);

  const client = await pool.connect();
  try {
    // First, check contacts table
    const contactResult = await client.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.company,
        c.title,
        c.vip,
        c.tier,
        c.tags,
        c.custom_fields,
        c.created_at,
        c.updated_at
      FROM contacts c
      WHERE c.tenant_id = $1
        AND (
          c.phone = $2
          OR c.phone = $3
          OR c.mobile = $2
          OR c.mobile = $3
        )
      LIMIT 1
    `, [tenantId, phoneNumber, normalizedPhone]);

    if (contactResult.rows.length === 0) {
      return null;
    }

    const contact = contactResult.rows[0];

    // Get interaction counts
    const statsResult = await client.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN type = 'call' THEN id END) as total_calls,
        COUNT(DISTINCT CASE WHEN type = 'call' AND created_at > NOW() - INTERVAL '30 days' THEN id END) as recent_calls
      FROM interactions
      WHERE tenant_id = $1 AND contact_id = $2
    `, [tenantId, contact.id]);

    // Get open tickets
    const ticketsResult = await client.query(`
      SELECT id, subject, priority, status, created_at
      FROM tickets
      WHERE tenant_id = $1
        AND contact_id = $2
        AND status NOT IN ('closed', 'resolved')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT 5
    `, [tenantId, contact.id]);

    // Get recent interactions
    const interactionsResult = await client.query(`
      SELECT
        id,
        type,
        summary,
        created_at as timestamp,
        agent_name as agent
      FROM interactions
      WHERE tenant_id = $1 AND contact_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [tenantId, contact.id]);

    // Get recent notes
    const notesResult = await client.query(`
      SELECT id, content as text, created_at as timestamp, agent_name as agent
      FROM contact_notes
      WHERE tenant_id = $1 AND contact_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `, [tenantId, contact.id]);

    // Get CRM link if exists
    const crmResult = await client.query(`
      SELECT
        crm_type as source,
        external_id as crm_id,
        external_url as crm_url
      FROM crm_contact_mappings
      WHERE tenant_id = $1 AND contact_id = $2
      LIMIT 1
    `, [tenantId, contact.id]);

    // Calculate sentiment from recent interactions
    const sentiment = await calculateSentiment(client, tenantId, contact.id);

    // Get lifetime value if available
    const valueResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total_spend
      FROM transactions
      WHERE tenant_id = $1 AND contact_id = $2 AND status = 'completed'
    `, [tenantId, contact.id]);

    const stats = statsResult.rows[0] || {};
    const crm = crmResult.rows[0] || {};

    return {
      id: contact.id,
      name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown',
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      title: contact.title,
      vip: contact.vip || false,
      tier: contact.tier,
      tags: contact.tags || [],
      customFields: formatCustomFields(contact.custom_fields),
      totalCalls: parseInt(stats.total_calls) || 0,
      recentCalls: parseInt(stats.recent_calls) || 0,
      openTickets: ticketsResult.rows.length,
      tickets: ticketsResult.rows,
      interactions: interactionsResult.rows,
      notes: notesResult.rows,
      sentiment: sentiment,
      totalSpend: parseFloat(valueResult.rows[0]?.total_spend) || 0,
      crmId: crm.crm_id,
      crmSource: crm.source,
      crmUrl: crm.crm_url,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at
    };
  } finally {
    client.release();
  }
}

/**
 * Create a new contact from screen pop
 */
export async function createQuickContact(tenantId, agentId, data) {
  const { name, email, company, phone } = data;

  // Parse name into first/last
  const nameParts = (name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const result = await pool.query(`
    INSERT INTO contacts (
      tenant_id, first_name, last_name, email, company, phone,
      source, created_by, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'screen_pop', $7, NOW(), NOW())
    RETURNING *
  `, [tenantId, firstName, lastName, email, company, phone, agentId]);

  const contact = result.rows[0];

  return {
    id: contact.id,
    name: `${contact.first_name} ${contact.last_name}`.trim(),
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    totalCalls: 1,
    openTickets: 0,
    interactions: [],
    notes: []
  };
}

/**
 * Add a note to a contact during a call
 */
export async function addCallNote(tenantId, contactId, agentId, agentName, callSid, noteText) {
  const result = await pool.query(`
    INSERT INTO contact_notes (
      tenant_id, contact_id, agent_id, agent_name, call_sid, content, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, content as text, created_at as timestamp
  `, [tenantId, contactId, agentId, agentName, callSid, noteText]);

  return {
    ...result.rows[0],
    agent: agentName
  };
}

/**
 * Log an interaction
 */
export async function logInteraction(tenantId, contactId, data) {
  const { type, summary, agentId, agentName, callSid, metadata } = data;

  const result = await pool.query(`
    INSERT INTO interactions (
      tenant_id, contact_id, type, summary,
      agent_id, agent_name, call_sid, metadata, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, type, summary, created_at as timestamp, agent_name as agent
  `, [tenantId, contactId, type, summary, agentId, agentName, callSid, JSON.stringify(metadata || {})]);

  return result.rows[0];
}

/**
 * Get full interaction history for a contact
 */
export async function getInteractionHistory(tenantId, contactId, options = {}) {
  const { limit = 50, offset = 0, type } = options;

  let query = `
    SELECT
      id, type, summary, created_at as timestamp,
      agent_name as agent, call_sid, metadata
    FROM interactions
    WHERE tenant_id = $1 AND contact_id = $2
  `;
  const params = [tenantId, contactId];

  if (type) {
    query += ` AND type = $${params.length + 1}`;
    params.push(type);
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

// Helper functions

function normalizePhone(phone) {
  if (!phone) return '';
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  // Remove leading 1 for US numbers
  if (digits.length === 11 && digits[0] === '1') {
    digits = digits.slice(1);
  }
  return digits;
}

function formatCustomFields(customFields) {
  if (!customFields || typeof customFields !== 'object') return [];
  return Object.entries(customFields).map(([name, value]) => ({
    name,
    value: String(value)
  }));
}

async function calculateSentiment(client, tenantId, contactId) {
  // Get sentiment from recent call analyses
  const result = await client.query(`
    SELECT
      AVG(CASE
        WHEN sentiment = 'positive' THEN 1
        WHEN sentiment = 'negative' THEN -1
        ELSE 0
      END) as avg_sentiment
    FROM call_analyses ca
    JOIN calls c ON c.id = ca.call_id
    WHERE c.tenant_id = $1
      AND c.contact_id = $2
      AND ca.created_at > NOW() - INTERVAL '90 days'
  `, [tenantId, contactId]);

  const avgSentiment = parseFloat(result.rows[0]?.avg_sentiment) || 0;

  if (avgSentiment > 0.3) return 'Positive';
  if (avgSentiment < -0.3) return 'Negative';
  return 'Neutral';
}

export default {
  lookupByPhone,
  createQuickContact,
  addCallNote,
  logInteraction,
  getInteractionHistory
};
