/**
 * Contact Management Routes
 *
 * Handles contact list management for SMS campaigns.
 */

import express from 'express';
import axios from 'axios';

const router = express.Router();

// In-memory storage (use database in production)
const contacts = new Map();
let contactIdCounter = 1;

// IRISX API client
const irisxClient = axios.create({
  baseURL: process.env.IRISX_API_URL || 'https://api.irisx.io',
  headers: {
    'Authorization': `Bearer ${process.env.IRISX_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * List all contacts
 * GET /contacts
 */
router.get('/', (req, res) => {
  try {
    const { tag, opted_in, limit = 100, offset = 0 } = req.query;

    let contactsList = Array.from(contacts.values());

    // Filter by tag
    if (tag) {
      contactsList = contactsList.filter(c =>
        c.tags && c.tags.includes(tag)
      );
    }

    // Filter by opt-in status
    if (opted_in !== undefined) {
      const optedIn = opted_in === 'true';
      contactsList = contactsList.filter(c => c.opted_in === optedIn);
    }

    // Sort by creation date
    contactsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Paginate
    const total = contactsList.length;
    contactsList = contactsList.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      contacts: contactsList,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing contacts:', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

/**
 * Create new contact
 * POST /contacts
 */
router.post('/', (req, res) => {
  try {
    const { phone_number, first_name, last_name, email, tags = [], custom_fields = {} } = req.body;

    // Validation
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    // Check if contact already exists
    const existing = Array.from(contacts.values()).find(c => c.phone_number === phone_number);
    if (existing) {
      return res.status(409).json({ error: 'Contact already exists', contact: existing });
    }

    // Create contact
    const contact = {
      id: contactIdCounter++,
      phone_number,
      first_name: first_name || null,
      last_name: last_name || null,
      email: email || null,
      tags: tags,
      custom_fields,
      opted_in: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    contacts.set(contact.id, contact);
    console.log(`✅ Contact created: ${contact.id} - ${phone_number}`);

    res.status(201).json({ contact });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

/**
 * Get contact by ID
 * GET /contacts/:id
 */
router.get('/:id', (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const contact = contacts.get(contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ contact });
  } catch (error) {
    console.error('Error getting contact:', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

/**
 * Update contact
 * PUT /contacts/:id
 */
router.put('/:id', (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const contact = contacts.get(contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { first_name, last_name, email, tags, custom_fields, opted_in } = req.body;

    // Update fields
    if (first_name !== undefined) contact.first_name = first_name;
    if (last_name !== undefined) contact.last_name = last_name;
    if (email !== undefined) contact.email = email;
    if (tags !== undefined) contact.tags = tags;
    if (custom_fields !== undefined) {
      contact.custom_fields = { ...contact.custom_fields, ...custom_fields };
    }
    if (opted_in !== undefined) contact.opted_in = opted_in;

    contact.updated_at = new Date().toISOString();

    contacts.set(contactId, contact);
    console.log(`✅ Contact updated: ${contactId}`);

    res.json({ contact });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/**
 * Delete contact
 * DELETE /contacts/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    if (!contacts.has(contactId)) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contacts.delete(contactId);
    console.log(`🗑️  Contact deleted: ${contactId}`);

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

/**
 * Import contacts from CSV/JSON
 * POST /contacts/import
 */
router.post('/import', (req, res) => {
  try {
    const { contacts: importContacts } = req.body;

    if (!Array.isArray(importContacts) || importContacts.length === 0) {
      return res.status(400).json({ error: 'contacts array is required' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const contactData of importContacts) {
      if (!contactData.phone_number) {
        errors.push({ contact: contactData, error: 'Missing phone_number' });
        skipped++;
        continue;
      }

      // Check for duplicates
      const existing = Array.from(contacts.values()).find(
        c => c.phone_number === contactData.phone_number
      );

      if (existing) {
        skipped++;
        continue;
      }

      // Create contact
      const contact = {
        id: contactIdCounter++,
        phone_number: contactData.phone_number,
        first_name: contactData.first_name || null,
        last_name: contactData.last_name || null,
        email: contactData.email || null,
        tags: contactData.tags || [],
        custom_fields: contactData.custom_fields || {},
        opted_in: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      contacts.set(contact.id, contact);
      imported++;
    }

    console.log(`📥 Imported ${imported} contacts, skipped ${skipped}`);

    res.json({
      message: 'Import completed',
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing contacts:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

/**
 * Export contacts
 * GET /contacts/export
 */
router.get('/export', (req, res) => {
  try {
    const { format = 'json', tag } = req.query;

    let contactsList = Array.from(contacts.values());

    // Filter by tag if specified
    if (tag) {
      contactsList = contactsList.filter(c =>
        c.tags && c.tags.includes(tag)
      );
    }

    if (format === 'csv') {
      // Generate CSV
      const csv = convertToCSV(contactsList);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', 'attachment; filename=contacts.csv');
      res.send(csv);
    } else {
      // Return JSON
      res.json({ contacts: contactsList });
    }
  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

/**
 * Opt-out contact
 * POST /contacts/:id/opt-out
 */
router.post('/:id/opt-out', (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const contact = contacts.get(contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contact.opted_in = false;
    contact.opted_out_at = new Date().toISOString();
    contact.updated_at = new Date().toISOString();

    contacts.set(contactId, contact);
    console.log(`🚫 Contact opted out: ${contactId}`);

    res.json({
      message: 'Contact opted out successfully',
      contact
    });
  } catch (error) {
    console.error('Error opting out contact:', error);
    res.status(500).json({ error: 'Failed to opt out contact' });
  }
});

/**
 * Opt-in contact
 * POST /contacts/:id/opt-in
 */
router.post('/:id/opt-in', (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const contact = contacts.get(contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contact.opted_in = true;
    contact.opted_out_at = null;
    contact.updated_at = new Date().toISOString();

    contacts.set(contactId, contact);
    console.log(`✅ Contact opted in: ${contactId}`);

    res.json({
      message: 'Contact opted in successfully',
      contact
    });
  } catch (error) {
    console.error('Error opting in contact:', error);
    res.status(500).json({ error: 'Failed to opt in contact' });
  }
});

/**
 * Helper: Convert contacts to CSV
 */
function convertToCSV(contactsList) {
  const headers = ['id', 'phone_number', 'first_name', 'last_name', 'email', 'tags', 'opted_in', 'created_at'];
  const rows = contactsList.map(c => [
    c.id,
    c.phone_number,
    c.first_name || '',
    c.last_name || '',
    c.email || '',
    c.tags.join(';'),
    c.opted_in,
    c.created_at
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  return csv;
}

// Export contacts Map for use in campaign routes
export { contacts };
export default router;
