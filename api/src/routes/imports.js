/**
 * Data Import API Routes
 *
 * API-FIRST DESIGN - Customers can integrate these endpoints into their applications
 *
 * Features:
 * - File upload (CSV, Excel) via multipart/form-data
 * - JSON bulk import via POST request (no file needed)
 * - AI-powered field mapping with GPT-4
 * - Duplicate detection with configurable strategies
 * - Webhook callbacks for import status
 * - Reusable field mapping templates
 * - Error reporting and download
 * - Progress tracking
 *
 * API Integration Examples:
 *
 * 1. Simple JSON Bulk Import:
 *    POST /v1/imports/bulk
 *    {
 *      "contacts": [
 *        {"first_name": "John", "email": "john@example.com", "phone": "+1234567890"},
 *        {"first_name": "Jane", "email": "jane@example.com", "phone": "+0987654321"}
 *      ],
 *      "duplicate_strategy": "update",
 *      "webhook_url": "https://your-app.com/webhooks/import-complete"
 *    }
 *
 * 2. File Upload with Auto-Mapping:
 *    POST /v1/imports/upload
 *    Content-Type: multipart/form-data
 *    - file: contacts.csv
 *    - use_ai_mapping: true
 *    - webhook_url: https://your-app.com/webhooks/import-complete
 *
 * 3. Check Import Status:
 *    GET /v1/imports/{job_id}
 *    Returns: {status: "processing", progress_percent: 45, success_count: 450, ...}
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import multer from 'multer';
import { parse as parseCSV } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import {
  broadcastImportProgress,
  broadcastImportComplete,
  broadcastImportFailed
} from '../services/websocket.js';
import {
  generateAuthUrl,
  getTokensFromCode,
  fetchSheetData,
  extractSpreadsheetId
} from '../services/google-sheets.js';

const app = new Hono();

// Middleware that supports both API Key and JWT authentication
const authenticateBoth = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = c.req.header('X-API-Key');

  // Try JWT first if Authorization header present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(c, next);
  }

  // Fall back to API key authentication
  if (apiKey) {
    return authenticate(c, next);
  }

  // No authentication provided
  return c.json({
    error: 'Unauthorized',
    message: 'Missing authentication (Bearer token or X-API-Key)',
    code: 'MISSING_AUTH'
  }, 401);
};

// File upload configuration
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files allowed.'));
    }
  }
});

// OpenAI client for AI field mapping (lazy-loaded when needed)
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

// Validation schemas
const bulkImportSchema = z.object({
  contacts: z.array(z.record(z.any())).min(1).max(10000), // max 10K per request
  list_id: z.string().uuid().optional(),
  duplicate_strategy: z.enum(['skip', 'update', 'create_new']).default('skip'),
  duplicate_match_fields: z.array(z.string()).default(['email', 'phone']),
  webhook_url: z.string().url().optional(),
  webhook_events: z.array(z.string()).default(['completed', 'failed']),
  external_id: z.string().optional(),
  validate_emails: z.boolean().default(true),
  validate_phones: z.boolean().default(true)
});

const fieldMappingSchema = z.object({
  mapping: z.record(z.string()), // {"CSV Column": "db_field"}
  duplicate_strategy: z.enum(['skip', 'update', 'create_new']).default('skip')
});

/**
 * POST /v1/imports/bulk
 * Bulk import contacts via JSON API (no file upload needed)
 *
 * Perfect for:
 * - Syncing from your CRM
 * - Importing from your app's database
 * - Automated imports via cron jobs
 */
app.post('/bulk', authenticateBoth, async (c) => {
  try {
    const body = await c.req.json();
    const validated = bulkImportSchema.parse(body);
    const tenantId = c.get('tenantId');

    // Create import job
    const jobResult = await query(
      `INSERT INTO import_jobs (
        tenant_id, source_type, total_rows, status, duplicate_strategy,
        duplicate_match_fields, webhook_url, webhook_events, external_id,
        field_mapping, import_options
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        tenantId,
        'json',
        validated.contacts.length,
        'processing',
        validated.duplicate_strategy,
        validated.duplicate_match_fields,
        validated.webhook_url || null,
        validated.webhook_events,
        validated.external_id || null,
        JSON.stringify({}), // no mapping needed for JSON
        JSON.stringify({
          validate_emails: validated.validate_emails,
          validate_phones: validated.validate_phones
        })
      ]
    );

    const job = jobResult.rows[0];

    // Process import asynchronously (don't block response)
    processJSONImport(job.id, validated.contacts, validated).catch(err => {
      console.error(`[IMPORT] Job ${job.id} failed:`, err);
    });

    return c.json({
      success: true,
      job_id: job.id,
      status: 'processing',
      message: `Importing ${validated.contacts.length} contacts. Check status at GET /v1/imports/${job.id}`,
      estimated_time_seconds: Math.ceil(validated.contacts.length / 100) // ~100 contacts/sec
    }, 202); // 202 Accepted

  } catch (error) {
    console.error('[IMPORT] Bulk import error:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to start import', details: error.message }, 500);
  }
});

/**
 * POST /v1/imports/upload
 * Upload CSV or Excel file for import
 *
 * Multipart form fields:
 * - file: CSV or Excel file
 * - use_ai_mapping: true/false (use GPT-4 to auto-detect fields)
 * - list_id: UUID of contact list
 * - duplicate_strategy: skip/update/create_new
 * - webhook_url: callback URL for completion
 */
app.post('/upload', authenticateBoth, async (c) => {
  try {
    const tenantId = c.get('tenantId');

    // Get the raw Node.js request object
    const req = c.req.raw;

    // Parse multipart form data using multer
    const uploadResult = await new Promise((resolve, reject) => {
      const multerUpload = upload.single('file');

      // Create mock response object for multer
      const res = {
        status: () => res,
        json: () => res,
        end: () => res
      };

      multerUpload(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            file: req.file,
            body: req.body
          });
        }
      });
    });

    const uploadedFile = uploadResult.file;
    const formData = uploadResult.body;

    if (!uploadedFile) {
      return c.json({ error: 'No file uploaded. Please provide a file with field name "file"' }, 400);
    }

    // Parse form fields
    const useAIMapping = formData.use_ai_mapping === 'true';
    const listId = formData.list_id ? parseInt(formData.list_id) : null;
    const duplicateStrategy = formData.duplicate_strategy || 'skip';
    const webhookUrl = formData.webhook_url || null;
    const externalId = formData.external_id || null;

    // Parse file based on type
    const fileData = await parseUploadedFile(uploadedFile);

    if (!fileData.success) {
      return c.json({ error: fileData.error }, 400);
    }

    const { headers, rows, totalRows } = fileData;

    // Generate preview (first 10 rows)
    const preview = rows.slice(0, 10);

    // Use AI to suggest field mappings if requested
    let suggestedMapping = null;
    let aiConfidence = null;

    if (useAIMapping && headers.length > 0) {
      const aiResult = await generateAIFieldMapping(headers, preview);
      suggestedMapping = aiResult.mapping;
      aiConfidence = aiResult.confidence;
    }

    // Create import job in 'pending_mapping' state
    const jobResult = await query(
      `INSERT INTO import_jobs (
        tenant_id, source_type, filename, file_size, total_rows, status,
        duplicate_strategy, webhook_url, external_id, target_list_id,
        ai_mapping_used, ai_mapping_confidence, preview_data,
        file_path, original_headers
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        tenantId,
        uploadedFile.mimetype.includes('excel') || uploadedFile.originalname.match(/\.xlsx?$/) ? 'excel' : 'csv',
        uploadedFile.originalname,
        uploadedFile.size,
        totalRows,
        'pending_mapping',
        duplicateStrategy,
        webhookUrl,
        externalId,
        listId,
        useAIMapping,
        aiConfidence,
        JSON.stringify(preview),
        uploadedFile.path,
        JSON.stringify(headers)
      ]
    );

    const job = jobResult.rows[0];

    return c.json({
      success: true,
      job_id: job.id,
      status: 'pending_mapping',
      message: 'File uploaded successfully. Submit field mapping to start import.',
      file_info: {
        filename: uploadedFile.originalname,
        size: uploadedFile.size,
        total_rows: totalRows
      },
      headers: headers,
      preview: preview,
      suggested_mapping: suggestedMapping,
      ai_confidence: aiConfidence,
      next_step: {
        endpoint: `POST /v1/imports/${job.id}/map`,
        description: 'Submit field mapping to start import',
        example_payload: {
          mapping: suggestedMapping || {
            'Email': 'email',
            'First Name': 'first_name',
            'Last Name': 'last_name',
            'Phone': 'phone'
          }
        }
      }
    });

  } catch (error) {
    console.error('[IMPORT] Upload error:', error);
    return c.json({ error: 'File upload failed', details: error.message }, 500);
  }
});

/**
 * GET /v1/imports/:id
 * Get import job status and progress
 *
 * Returns real-time progress for polling
 */
app.get('/:id', authenticateBoth, async (c) => {
  try {
    const jobId = c.req.param('id');
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT * FROM import_jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Import job not found' }, 404);
    }

    const job = result.rows[0];

    return c.json({
      id: job.id,
      status: job.status,
      source_type: job.source_type,
      progress_percent: job.progress_percent,
      total_rows: job.total_rows,
      processed_rows: job.processed_rows,
      success_count: job.success_count,
      error_count: job.error_count,
      duplicate_count: job.duplicate_count,
      skipped_count: job.skipped_count,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      external_id: job.external_id,
      error_details: job.error_count > 0 ? job.error_details : null
    });

  } catch (error) {
    console.error('[IMPORT] Get job error:', error);
    return c.json({ error: 'Failed to get import job' }, 500);
  }
});

/**
 * GET /v1/imports
 * List all import jobs for tenant
 */
app.get('/', authenticateBoth, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const status = c.req.query('status'); // filter by status

    let sql = `
      SELECT id, source_type, status, total_rows, success_count, error_count,
             created_at, completed_at, external_id, filename
      FROM import_jobs
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM import_jobs WHERE tenant_id = $1`,
      [tenantId]
    );

    return c.json({
      imports: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    });

  } catch (error) {
    console.error('[IMPORT] List jobs error:', error);
    return c.json({ error: 'Failed to list import jobs' }, 500);
  }
});

/**
 * DELETE /v1/imports/:id
 * Cancel or delete an import job
 */
app.delete('/:id', authenticateBoth, async (c) => {
  try {
    const jobId = c.req.param('id');
    const tenantId = c.get('tenantId');

    // Check if job exists and is owned by tenant
    const checkResult = await query(
      `SELECT status FROM import_jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return c.json({ error: 'Import job not found' }, 404);
    }

    const status = checkResult.rows[0].status;

    if (status === 'processing') {
      // Cancel running job
      await query(
        `UPDATE import_jobs SET status = $1, cancelled_at = NOW() WHERE id = $2`,
        ['cancelled', jobId]
      );
      return c.json({ success: true, message: 'Import job cancelled' });
    } else {
      // Delete completed/failed job
      await query(`DELETE FROM import_jobs WHERE id = $1`, [jobId]);
      return c.json({ success: true, message: 'Import job deleted' });
    }

  } catch (error) {
    console.error('[IMPORT] Delete job error:', error);
    return c.json({ error: 'Failed to delete import job' }, 500);
  }
});

/**
 * POST /v1/imports/:id/map
 * Submit field mapping and start processing uploaded file
 */
app.post('/:id/map', authenticateBoth, async (c) => {
  try {
    const jobId = c.req.param('id');
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    // Validate mapping
    const validated = fieldMappingSchema.parse(body);

    // Get job
    const jobResult = await query(
      `SELECT * FROM import_jobs WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    if (jobResult.rows.length === 0) {
      return c.json({ error: 'Import job not found' }, 404);
    }

    const job = jobResult.rows[0];

    if (job.status !== 'pending_mapping') {
      return c.json({ error: 'Job is not in pending_mapping state' }, 400);
    }

    // Update job with mapping and start processing
    await query(
      `UPDATE import_jobs SET
        field_mapping = $1,
        duplicate_strategy = $2,
        status = $3,
        started_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(validated.mapping), validated.duplicate_strategy, 'processing', jobId]
    );

    // Start processing file asynchronously
    processFileImport(jobId).catch(err => {
      console.error(`[IMPORT] Job ${jobId} processing failed:`, err);
    });

    return c.json({
      success: true,
      job_id: jobId,
      status: 'processing',
      message: `Processing ${job.total_rows} rows. Check status at GET /v1/imports/${jobId}`,
      estimated_time_seconds: Math.ceil(job.total_rows / 100)
    }, 202);

  } catch (error) {
    console.error('[IMPORT] Map submission error:', error);
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to submit mapping', details: error.message }, 500);
  }
});

/**
 * GET /v1/imports/:id/errors
 * Download errors as CSV
 */
app.get('/:id/errors', authenticateBoth, async (c) => {
  try {
    const jobId = c.req.param('id');
    const tenantId = c.get('tenantId');

    const result = await query(
      `SELECT e.* FROM import_errors e
       JOIN import_jobs j ON e.import_job_id = j.id
       WHERE j.id = $1 AND j.tenant_id = $2
       ORDER BY e.row_number`,
      [jobId, tenantId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'No errors found for this import' }, 404);
    }

    // Convert to CSV
    const errors = result.rows;
    const csv = convertErrorsToCSV(errors);

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="import-errors-${jobId}.csv"`);
    return c.body(csv);

  } catch (error) {
    console.error('[IMPORT] Get errors error:', error);
    return c.json({ error: 'Failed to get import errors' }, 500);
  }
});

/**
 * GET /v1/exports/contacts?format=csv&list_id=123
 * Export contacts to CSV, Excel, or JSON
 */
app.get('/exports/contacts', authenticateBoth, async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const format = c.req.query('format') || 'csv'; // csv, excel, json
    const listId = c.req.query('list_id');
    const limit = parseInt(c.req.query('limit') || '10000');

    // Build query
    let sql = `SELECT c.* FROM contacts c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`;
    const params = [tenantId];

    if (listId) {
      sql = `SELECT c.* FROM contacts c
             JOIN contact_list_members clm ON c.id = clm.contact_id
             WHERE c.tenant_id = $1 AND clm.list_id = $2 AND c.deleted_at IS NULL`;
      params.push(listId);
    }

    sql += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    const contacts = result.rows;

    if (contacts.length === 0) {
      return c.json({ error: 'No contacts found' }, 404);
    }

    // Export based on format
    if (format === 'json') {
      c.header('Content-Type', 'application/json');
      c.header('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.json"`);
      return c.json(contacts);
    }

    if (format === 'csv') {
      const csv = convertContactsToCSV(contacts);
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.csv"`);
      return c.body(csv);
    }

    if (format === 'excel') {
      const excelBuffer = convertContactsToExcel(contacts);
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      c.header('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.xlsx"`);
      return c.body(excelBuffer);
    }

    return c.json({ error: 'Invalid format. Use csv, excel, or json' }, 400);

  } catch (error) {
    console.error('[EXPORT] Export contacts error:', error);
    return c.json({ error: 'Failed to export contacts', details: error.message }, 500);
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Process JSON bulk import
 */
async function processJSONImport(jobId, contacts, options) {
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;

  try {
    // Update job status
    await query(
      `UPDATE import_jobs SET status = $1, started_at = NOW() WHERE id = $2`,
      ['processing', jobId]
    );

    // Get job details
    const jobResult = await query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      try {
        // Check for duplicates
        if (job.duplicate_strategy !== 'create_new') {
          const isDuplicate = await checkDuplicate(
            job.tenant_id,
            contact,
            job.duplicate_match_fields
          );

          if (isDuplicate) {
            duplicateCount++;
            if (job.duplicate_strategy === 'skip') {
              skippedCount++;
              continue; // Skip this contact
            }
            // If 'update', we'll upsert below
          }
        }

        // Insert or update contact
        await upsertContact(job.tenant_id, contact, job.target_list_id);
        successCount++;

      } catch (error) {
        errorCount++;
        // Log error to import_errors table
        await query(
          `INSERT INTO import_errors (import_job_id, row_number, error_type, error_message, row_data)
           VALUES ($1, $2, $3, $4, $5)`,
          [jobId, i + 1, 'processing_error', error.message, JSON.stringify(contact)]
        );
      }

      // Update progress every 100 contacts
      if ((i + 1) % 100 === 0) {
        const progress = Math.floor(((i + 1) / contacts.length) * 100);
        await query(
          `UPDATE import_jobs SET
            progress_percent = $1,
            processed_rows = $2,
            success_count = $3,
            error_count = $4,
            duplicate_count = $5,
            skipped_count = $6
           WHERE id = $7`,
          [progress, i + 1, successCount, errorCount, duplicateCount, skippedCount, jobId]
        );

        // Broadcast WebSocket progress update
        broadcastImportProgress(jobId, {
          progress_percent: progress,
          processed_rows: i + 1,
          total_rows: contacts.length,
          success_count: successCount,
          error_count: errorCount,
          duplicate_count: duplicateCount,
          skipped_count: skippedCount
        });
      }
    }

    // Mark as completed
    await query(
      `UPDATE import_jobs SET
        status = $1,
        progress_percent = 100,
        processed_rows = $2,
        success_count = $3,
        error_count = $4,
        duplicate_count = $5,
        skipped_count = $6,
        completed_at = NOW()
       WHERE id = $7`,
      ['completed', contacts.length, successCount, errorCount, duplicateCount, skippedCount, jobId]
    );

    // Broadcast WebSocket completion
    broadcastImportComplete(jobId, {
      status: 'completed',
      total_rows: contacts.length,
      success_count: successCount,
      error_count: errorCount,
      duplicate_count: duplicateCount,
      skipped_count: skippedCount,
      duration_ms: Date.now() - startTime
    });

    // Send webhook if configured
    if (job.webhook_url) {
      await sendWebhook(job.webhook_url, {
        event: 'import.completed',
        job_id: jobId,
        external_id: job.external_id,
        total_rows: contacts.length,
        success_count: successCount,
        error_count: errorCount,
        duplicate_count: duplicateCount,
        duration_ms: Date.now() - startTime
      });
    }

    console.log(`[IMPORT] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    console.error(`[IMPORT] Job ${jobId} fatal error:`, error);

    // Mark as failed
    await query(
      `UPDATE import_jobs SET status = $1, error_details = $2, completed_at = NOW() WHERE id = $3`,
      ['failed', JSON.stringify({ error: error.message }), jobId]
    );

    // Broadcast WebSocket failure
    broadcastImportFailed(jobId, {
      error: error.message,
      status: 'failed'
    });

    // Send failure webhook
    const jobResult = await query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];

    if (job.webhook_url) {
      await sendWebhook(job.webhook_url, {
        event: 'import.failed',
        job_id: jobId,
        external_id: job.external_id,
        error: error.message
      });
    }
  }
}

/**
 * Check if contact is duplicate
 */
async function checkDuplicate(tenantId, contact, matchFields) {
  const conditions = [];
  const params = [tenantId];

  for (const field of matchFields) {
    if (contact[field]) {
      params.push(contact[field]);
      conditions.push(`${field} = $${params.length}`);
    }
  }

  if (conditions.length === 0) return false;

  const sql = `
    SELECT id FROM contacts
    WHERE tenant_id = $1 AND (${conditions.join(' OR ')})
    LIMIT 1
  `;

  const result = await query(sql, params);
  return result.rows.length > 0;
}

/**
 * Insert or update contact
 */
async function upsertContact(tenantId, contact, listId) {
  // Map common field variations to actual DB columns
  const mappedContact = {
    first_name: contact.first_name || contact.firstName || contact.name?.split(' ')[0] || null,
    last_name: contact.last_name || contact.lastName || contact.name?.split(' ').slice(1).join(' ') || null,
    email: contact.email?.toLowerCase()?.trim() || null,
    phone: contact.phone || contact.phone_number || null,
    phone_2: contact.phone_2 || contact.phone2 || null,
    company: contact.company || contact.organization || null,
    title: contact.title || contact.job_title || null,
    address_line1: contact.address || contact.address_line1 || null,
    address_line2: contact.address_line2 || null,
    city: contact.city || null,
    state: contact.state || null,
    postal_code: contact.postal_code || contact.zip_code || contact.zip || null,
    country: contact.country || null,
    tags: contact.tags ? (Array.isArray(contact.tags) ? contact.tags : [contact.tags]) : null
  };

  // Separate custom fields (anything not in standard schema)
  const standardFields = [
    'first_name', 'last_name', 'email', 'phone', 'phone_2', 'company', 'title',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'tags'
  ];
  const customFields = {};
  for (const [key, value] of Object.entries(contact)) {
    if (!standardFields.includes(key) && value !== null && value !== undefined) {
      customFields[key] = value;
    }
  }

  // Validate email format if provided
  if (mappedContact.email && !mappedContact.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    throw new Error(`Invalid email format: ${mappedContact.email}`);
  }

  // Check if contact exists by email or phone
  let existingContact = null;
  if (mappedContact.email) {
    const emailCheck = await query(
      `SELECT id FROM contacts WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL LIMIT 1`,
      [tenantId, mappedContact.email]
    );
    if (emailCheck.rows.length > 0) {
      existingContact = emailCheck.rows[0];
    }
  }

  if (!existingContact && mappedContact.phone) {
    const phoneCheck = await query(
      `SELECT id FROM contacts WHERE tenant_id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
      [tenantId, mappedContact.phone]
    );
    if (phoneCheck.rows.length > 0) {
      existingContact = phoneCheck.rows[0];
    }
  }

  let contactId;

  if (existingContact) {
    // Update existing contact
    await query(
      `UPDATE contacts SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        phone_2 = COALESCE($5, phone_2),
        company = COALESCE($6, company),
        title = COALESCE($7, title),
        address_line1 = COALESCE($8, address_line1),
        address_line2 = COALESCE($9, address_line2),
        city = COALESCE($10, city),
        state = COALESCE($11, state),
        postal_code = COALESCE($12, postal_code),
        country = COALESCE($13, country),
        tags = COALESCE($14, tags),
        custom_fields = custom_fields || $15::jsonb,
        updated_at = NOW()
       WHERE id = $16`,
      [
        mappedContact.first_name,
        mappedContact.last_name,
        mappedContact.email,
        mappedContact.phone,
        mappedContact.phone_2,
        mappedContact.company,
        mappedContact.title,
        mappedContact.address_line1,
        mappedContact.address_line2,
        mappedContact.city,
        mappedContact.state,
        mappedContact.postal_code,
        mappedContact.country,
        mappedContact.tags,
        JSON.stringify(customFields),
        existingContact.id
      ]
    );
    contactId = existingContact.id;
  } else {
    // Insert new contact
    const result = await query(
      `INSERT INTO contacts (
        tenant_id, first_name, last_name, email, phone, phone_2, company, title,
        address_line1, address_line2, city, state, postal_code, country, tags, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        tenantId,
        mappedContact.first_name,
        mappedContact.last_name,
        mappedContact.email,
        mappedContact.phone,
        mappedContact.phone_2,
        mappedContact.company,
        mappedContact.title,
        mappedContact.address_line1,
        mappedContact.address_line2,
        mappedContact.city,
        mappedContact.state,
        mappedContact.postal_code,
        mappedContact.country,
        mappedContact.tags,
        JSON.stringify(customFields)
      ]
    );
    contactId = result.rows[0].id;
  }

  // Add to list if specified
  if (listId && contactId) {
    await query(
      `INSERT INTO contact_list_members (list_id, contact_id)
       VALUES ($1, $2)
       ON CONFLICT (list_id, contact_id) DO NOTHING`,
      [listId, contactId]
    );
  }

  return contactId;
}

/**
 * Send webhook notification
 */
async function sendWebhook(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'IRISX-Import-Service/1.0'
      },
      body: JSON.stringify(payload)
    });

    console.log(`[IMPORT] Webhook sent to ${url}: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`[IMPORT] Webhook failed:`, error.message);
    return false;
  }
}

/**
 * Convert errors to CSV format
 */
function convertErrorsToCSV(errors) {
  const headers = ['Row Number', 'Error Type', 'Error Message', 'Field', 'Data'];
  const rows = errors.map(e => [
    e.row_number,
    e.error_type,
    e.error_message,
    e.field_name || '',
    JSON.stringify(e.row_data)
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * Convert contacts to CSV format
 */
function convertContactsToCSV(contacts) {
  if (contacts.length === 0) return '';

  const headers = [
    'First Name', 'Last Name', 'Email', 'Phone', 'Phone 2',
    'Company', 'Title', 'Address Line 1', 'Address Line 2',
    'City', 'State', 'Postal Code', 'Country', 'Tags', 'Status', 'Created At'
  ];

  const rows = contacts.map(c => [
    c.first_name || '',
    c.last_name || '',
    c.email || '',
    c.phone || '',
    c.phone_2 || '',
    c.company || '',
    c.title || '',
    c.address_line1 || '',
    c.address_line2 || '',
    c.city || '',
    c.state || '',
    c.postal_code || '',
    c.country || '',
    (c.tags || []).join(';'),
    c.status || '',
    c.created_at || ''
  ].map(field => `"${String(field).replace(/"/g, '""')}"`)); // Escape quotes

  return [headers.map(h => `"${h}"`), ...rows].map(row => row.join(',')).join('\n');
}

/**
 * Convert contacts to Excel format
 */
function convertContactsToExcel(contacts) {
  const data = contacts.map(c => ({
    'First Name': c.first_name || '',
    'Last Name': c.last_name || '',
    'Email': c.email || '',
    'Phone': c.phone || '',
    'Phone 2': c.phone_2 || '',
    'Company': c.company || '',
    'Title': c.title || '',
    'Address Line 1': c.address_line1 || '',
    'Address Line 2': c.address_line2 || '',
    'City': c.city || '',
    'State': c.state || '',
    'Postal Code': c.postal_code || '',
    'Country': c.country || '',
    'Tags': (c.tags || []).join(';'),
    'Status': c.status || '',
    'Created At': c.created_at || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parse uploaded CSV or Excel file
 */
async function parseUploadedFile(file) {
  try {
    const fs = await import('fs');
    const fileContent = fs.readFileSync(file.path);

    let headers = [];
    let rows = [];
    let totalRows = 0;

    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      // Parse CSV
      const records = parseCSV(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      if (records.length === 0) {
        return { success: false, error: 'CSV file is empty or invalid' };
      }

      headers = Object.keys(records[0]);
      rows = records;
      totalRows = records.length;

    } else if (file.mimetype.includes('spreadsheet') || file.originalname.match(/\.xlsx?$/)) {
      // Parse Excel
      const workbook = XLSX.read(fileContent, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        return { success: false, error: 'Excel file is empty or invalid' };
      }

      headers = Object.keys(jsonData[0]);
      rows = jsonData;
      totalRows = jsonData.length;

    } else {
      return { success: false, error: 'Unsupported file format' };
    }

    return {
      success: true,
      headers,
      rows,
      totalRows
    };

  } catch (error) {
    console.error('[IMPORT] File parsing error:', error);
    return {
      success: false,
      error: `Failed to parse file: ${error.message}`
    };
  }
}

/**
 * Use GPT-4 to suggest field mappings
 */
async function generateAIFieldMapping(headers, preview) {
  try {
    const openai = getOpenAIClient();

    if (!openai) {
      console.warn('[IMPORT] OpenAI API key not configured, skipping AI mapping');
      return { mapping: {}, confidence: 0 };
    }

    const prompt = `You are a data mapping expert. Given CSV/Excel column headers and sample data, map them to contact database fields.

Available database fields:
- first_name (person's first name)
- last_name (person's last name)
- email (email address)
- phone (primary phone number, any format)
- phone_2 (secondary phone number)
- company (company/organization name)
- title (job title/position - note: field is "title" not "job_title")
- address_line1 (street address line 1)
- address_line2 (street address line 2)
- city
- state
- postal_code (ZIP/postal code)
- country
- tags (array of tags/categories)

IMPORTANT: Use "title" not "job_title" for job titles.
For any fields that don't match above, include them as-is and they will be stored in custom_fields automatically.

CSV Headers:
${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

Sample Data (first 3 rows):
${JSON.stringify(preview.slice(0, 3), null, 2)}

Return a JSON object mapping CSV headers to database fields. Only include confident matches (>70% confidence).
Format: {"CSV Header": "db_field"}

Also include an overall confidence score (0-100).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a data mapping expert. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const responseText = completion.choices[0].message.content.trim();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[IMPORT] AI response not JSON:', responseText);
      return { mapping: {}, confidence: 0 };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Extract mapping and confidence
    const mapping = {};
    let confidence = 80; // default

    for (const [key, value] of Object.entries(result)) {
      if (key === 'confidence' || key === 'confidence_score') {
        confidence = parseInt(value);
      } else {
        mapping[key] = value;
      }
    }

    console.log(`[IMPORT] AI mapping generated with ${confidence}% confidence:`, mapping);

    return { mapping, confidence };

  } catch (error) {
    console.error('[IMPORT] AI mapping error:', error);
    return { mapping: {}, confidence: 0 };
  }
}

/**
 * Process file import (called after mapping submitted)
 */
async function processFileImport(jobId) {
  const fs = await import('fs');
  let successCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;

  try {
    // Get job details
    const jobResult = await query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];

    // Parse file again
    const fileContent = fs.readFileSync(job.file_path);
    const fileData = await parseUploadedFile({
      path: job.file_path,
      mimetype: job.source_type === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: job.filename
    });

    if (!fileData.success) {
      throw new Error(fileData.error);
    }

    const { rows } = fileData;
    const mapping = JSON.parse(job.field_mapping);

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Map CSV columns to database fields
        const mappedContact = {};
        for (const [csvHeader, dbField] of Object.entries(mapping)) {
          if (row[csvHeader] !== undefined && row[csvHeader] !== null && row[csvHeader] !== '') {
            mappedContact[dbField] = row[csvHeader];
          }
        }

        // Skip rows with no email or phone
        if (!mappedContact.email && !mappedContact.phone) {
          skippedCount++;
          continue;
        }

        // Check for duplicates
        if (job.duplicate_strategy !== 'create_new') {
          const isDuplicate = await checkDuplicate(
            job.tenant_id,
            mappedContact,
            job.duplicate_match_fields || ['email', 'phone']
          );

          if (isDuplicate) {
            duplicateCount++;
            if (job.duplicate_strategy === 'skip') {
              skippedCount++;
              continue;
            }
          }
        }

        // Insert/update contact
        await upsertContact(job.tenant_id, mappedContact, job.target_list_id);
        successCount++;

      } catch (error) {
        errorCount++;
        await query(
          `INSERT INTO import_errors (import_job_id, row_number, error_type, error_message, row_data)
           VALUES ($1, $2, $3, $4, $5)`,
          [jobId, i + 1, 'processing_error', error.message, JSON.stringify(row)]
        );
      }

      // Update progress every 100 rows
      if ((i + 1) % 100 === 0) {
        const progress = Math.floor(((i + 1) / rows.length) * 100);
        await query(
          `UPDATE import_jobs SET
            progress_percent = $1,
            processed_rows = $2,
            success_count = $3,
            error_count = $4,
            duplicate_count = $5,
            skipped_count = $6
           WHERE id = $7`,
          [progress, i + 1, successCount, errorCount, duplicateCount, skippedCount, jobId]
        );

        // Broadcast WebSocket progress update
        broadcastImportProgress(jobId, {
          progress_percent: progress,
          processed_rows: i + 1,
          total_rows: rows.length,
          success_count: successCount,
          error_count: errorCount,
          duplicate_count: duplicateCount,
          skipped_count: skippedCount
        });
      }
    }

    // Mark as completed
    await query(
      `UPDATE import_jobs SET
        status = $1,
        progress_percent = 100,
        processed_rows = $2,
        success_count = $3,
        error_count = $4,
        duplicate_count = $5,
        skipped_count = $6,
        completed_at = NOW()
       WHERE id = $7`,
      ['completed', rows.length, successCount, errorCount, duplicateCount, skippedCount, jobId]
    );

    // Broadcast WebSocket completion
    broadcastImportComplete(jobId, {
      status: 'completed',
      total_rows: rows.length,
      success_count: successCount,
      error_count: errorCount,
      duplicate_count: duplicateCount,
      skipped_count: skippedCount
    });

    // Clean up uploaded file
    try {
      fs.unlinkSync(job.file_path);
    } catch (err) {
      console.error('[IMPORT] Failed to delete temp file:', err);
    }

    // Send webhook
    if (job.webhook_url) {
      await sendWebhook(job.webhook_url, {
        event: 'import.completed',
        job_id: jobId,
        external_id: job.external_id,
        total_rows: rows.length,
        success_count: successCount,
        error_count: errorCount,
        duplicate_count: duplicateCount
      });
    }

    console.log(`[IMPORT] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    console.error(`[IMPORT] Job ${jobId} fatal error:`, error);

    await query(
      `UPDATE import_jobs SET status = $1, error_details = $2, completed_at = NOW() WHERE id = $3`,
      ['failed', JSON.stringify({ error: error.message }), jobId]
    );

    // Broadcast WebSocket failure
    broadcastImportFailed(jobId, {
      error: error.message,
      status: 'failed'
    });

    const jobResult = await query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];

    if (job.webhook_url) {
      await sendWebhook(job.webhook_url, {
        event: 'import.failed',
        job_id: jobId,
        external_id: job.external_id,
        error: error.message
      });
    }
  }
}

/**
 * Google Sheets OAuth Routes
 */

/**
 * GET /v1/imports/google/auth
 * Initiate Google Sheets OAuth flow
 */
app.get('/google/auth', authenticateBoth, async (c) => {
  try {
    const user = c.get('user');

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return c.json({
        error: 'Google Sheets integration not configured',
        message: 'Administrator must configure Google OAuth credentials'
      }, 503);
    }

    const authUrl = generateAuthUrl(user.tenantId, user.userId);

    return c.json({
      auth_url: authUrl,
      message: 'Redirect user to this URL to authorize Google Sheets access'
    });
  } catch (error) {
    console.error('[Google Sheets] Auth error:', error);
    return c.json({ error: 'Failed to generate auth URL', details: error.message }, 500);
  }
});

/**
 * GET /v1/imports/google/callback
 * OAuth callback - exchange code for tokens
 */
app.get('/google/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.html(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
    }

    if (!code) {
      return c.json({ error: 'Missing authorization code' }, 400);
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    // Decode state to get tenant and user info
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());

    // Store tokens in database associated with user
    await query(
      `INSERT INTO google_oauth_tokens (tenant_id, user_id, access_token, refresh_token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour', NOW())
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [
        stateData.tenantId,
        stateData.userId,
        tokens.access_token,
        tokens.refresh_token || null
      ]
    );

    return c.html(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center; }
            .success { color: #22c55e; font-size: 48px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="success">✓</div>
          <h1>Authorization Successful!</h1>
          <p>You can now import data from Google Sheets.</p>
          <p>You may close this window and return to the application.</p>
          <script>
            // Close window after 3 seconds
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[Google Sheets] Callback error:', error);
    return c.html(`
      <html>
        <body>
          <h1>Authorization Error</h1>
          <p>${error.message}</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  }
});

/**
 * POST /v1/imports/google/sheet
 * Import from Google Sheets
 *
 * Body: {
 *   sheet_url: "https://docs.google.com/spreadsheets/d/{id}/edit",
 *   range: "Sheet1!A1:Z1000" (optional),
 *   use_ai_mapping: true,
 *   duplicate_strategy: "skip"
 * }
 */
app.post('/google/sheet', authenticateBoth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const { sheet_url, range, use_ai_mapping, duplicate_strategy, list_id } = body;

    if (!sheet_url) {
      return c.json({ error: 'sheet_url is required' }, 400);
    }

    // Extract spreadsheet ID from URL
    const spreadsheetId = extractSpreadsheetId(sheet_url);
    if (!spreadsheetId) {
      return c.json({ error: 'Invalid Google Sheets URL' }, 400);
    }

    // Get user's stored tokens
    const tokenResult = await query(
      `SELECT access_token, refresh_token FROM google_oauth_tokens
       WHERE tenant_id = $1 AND user_id = $2 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.tenantId, user.userId]
    );

    if (tokenResult.rows.length === 0) {
      return c.json({
        error: 'Not authorized',
        message: 'Please authorize Google Sheets access first',
        auth_required: true
      }, 401);
    }

    const tokens = {
      access_token: tokenResult.rows[0].access_token,
      refresh_token: tokenResult.rows[0].refresh_token
    };

    // Fetch sheet data
    const sheetRange = range || 'A1:ZZ10000'; // Default to first 10k rows
    const sheetData = await fetchSheetData(spreadsheetId, sheetRange, tokens);

    if (!sheetData.success) {
      return c.json({ error: sheetData.error }, 400);
    }

    // AI field mapping if requested
    let fieldMapping = null;
    let aiConfidence = null;

    if (use_ai_mapping) {
      const aiResult = await performAIFieldMapping(sheetData.headers);
      if (aiResult.success) {
        fieldMapping = aiResult.mapping;
        aiConfidence = aiResult.confidence;
      }
    }

    // Create import job
    const jobResult = await query(
      `INSERT INTO import_jobs (
        tenant_id, user_id, source_type, status, filename, total_rows,
        duplicate_strategy, duplicate_match_fields, target_list_id,
        field_mapping, ai_confidence, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING id`,
      [
        user.tenantId,
        user.userId,
        'google_sheets',
        fieldMapping ? 'pending_confirmation' : 'pending',
        `Google Sheets: ${spreadsheetId}`,
        sheetData.totalRows,
        duplicate_strategy || 'skip',
        ['email', 'phone'],
        list_id || null,
        fieldMapping ? JSON.stringify(fieldMapping) : null,
        aiConfidence
      ]
    );

    const jobId = jobResult.rows[0].id;

    // Store sheet data temporarily for processing
    // We'll process it after field mapping is confirmed
    const tempData = {
      spreadsheetId,
      range: sheetRange,
      headers: sheetData.headers,
      rows: sheetData.rows,
      totalRows: sheetData.totalRows
    };

    // Store in a temporary table or cache (for now, we'll use a JSON column)
    await query(
      `UPDATE import_jobs SET file_info = $1 WHERE id = $2`,
      [JSON.stringify(tempData), jobId]
    );

    if (fieldMapping) {
      // Return job with suggested mapping for confirmation
      return c.json({
        job_id: jobId,
        status: 'pending_confirmation',
        file_info: {
          filename: `Google Sheets: ${spreadsheetId}`,
          total_rows: sheetData.totalRows
        },
        headers: sheetData.headers,
        preview_rows: sheetData.rows.slice(0, 10),
        suggested_mapping: fieldMapping,
        ai_confidence: aiConfidence,
        message: 'Please confirm field mapping before importing'
      }, 200);
    } else {
      // Return for manual field mapping
      return c.json({
        job_id: jobId,
        status: 'pending',
        file_info: {
          filename: `Google Sheets: ${spreadsheetId}`,
          total_rows: sheetData.totalRows
        },
        headers: sheetData.headers,
        preview_rows: sheetData.rows.slice(0, 10),
        message: 'Please map fields to continue'
      }, 200);
    }
  } catch (error) {
    console.error('[Google Sheets] Import error:', error);
    return c.json({ error: 'Failed to import from Google Sheets', details: error.message }, 500);
  }
});

export default app;
