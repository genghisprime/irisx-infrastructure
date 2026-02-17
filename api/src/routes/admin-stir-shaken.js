/**
 * Admin STIR/SHAKEN API Routes
 * Admin portal endpoints for managing STIR/SHAKEN compliance across all tenants
 */

import { Hono } from 'hono';
import pool from '../db/connection.js';
import certificateManager from '../services/stir-shaken/certificate-manager.js';
import attestationService from '../services/stir-shaken/attestation-service.js';

const adminStirShaken = new Hono();

// ==================== PLATFORM OVERVIEW ====================

/**
 * Get platform-wide STIR/SHAKEN statistics
 */
adminStirShaken.get('/stats', async (c) => {
    try {
        // Certificate statistics across all tenants
        const certStats = await certificateManager.getCertificateStats();

        // Attestation statistics (last 24 hours)
        const attestationResult = await pool.query(`
            SELECT
                call_direction,
                attestation_level,
                verification_status,
                COUNT(*) as count
            FROM stir_shaken_attestations
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY call_direction, attestation_level, verification_status
        `);

        const attestationStats = {
            outbound: { total: 0, A: 0, B: 0, C: 0 },
            inbound: { total: 0, verified: 0, failed: 0, no_signature: 0 }
        };

        for (const row of attestationResult.rows) {
            if (row.call_direction === 'outbound') {
                attestationStats.outbound.total += parseInt(row.count);
                if (row.attestation_level) {
                    attestationStats.outbound[row.attestation_level] = parseInt(row.count);
                }
            } else {
                attestationStats.inbound.total += parseInt(row.count);
                if (row.verification_status) {
                    attestationStats.inbound[row.verification_status] = parseInt(row.count);
                }
            }
        }

        // Robocall statistics
        const robocallResult = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE classification = 'known_robocaller') as known_robocallers,
                COUNT(*) FILTER (WHERE classification = 'suspected') as suspected,
                COUNT(*) as total
            FROM stir_shaken_robocall_database
        `);

        // Tenant adoption
        const adoptionResult = await pool.query(`
            SELECT
                COUNT(*) as total_tenants,
                COUNT(*) FILTER (WHERE stir_shaken_enabled = true) as enabled,
                COUNT(*) FILTER (WHERE signing_enabled = true) as signing_enabled,
                COUNT(*) FILTER (WHERE verification_enabled = true) as verification_enabled
            FROM tenant_stir_shaken_settings
        `);

        return c.json({
            success: true,
            stats: {
                certificates: certStats,
                attestations: {
                    period: '24h',
                    ...attestationStats
                },
                robocall: robocallResult.rows[0],
                adoption: adoptionResult.rows[0]
            }
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get stats:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== CERTIFICATE MANAGEMENT ====================

/**
 * List all certificates across tenants
 */
adminStirShaken.get('/certificates', async (c) => {
    const status = c.req.query('status');
    const tenantId = c.req.query('tenantId');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        let query = `
            SELECT c.*, t.name as tenant_name, t.company_name
            FROM stir_shaken_certificates c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND c.status = $${params.length}`;
        }

        if (tenantId) {
            params.push(tenantId);
            query += ` AND c.tenant_id = $${params.length}`;
        }

        query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return c.json({
            success: true,
            certificates: result.rows.map(cert => ({
                id: cert.id,
                tenantId: cert.tenant_id,
                tenantName: cert.tenant_name,
                companyName: cert.company_name,
                status: cert.status,
                commonName: cert.common_name,
                subjectDn: cert.subject_dn,
                issuerDn: cert.issuer_dn,
                notBefore: cert.not_before,
                notAfter: cert.not_after,
                isPrimary: cert.is_primary,
                autoRenew: cert.auto_renew,
                stiCaName: cert.sti_ca_name,
                lastVerifiedAt: cert.last_verified_at,
                verificationStatus: cert.verification_status,
                createdAt: cert.created_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to list certificates:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get expiring certificates
 */
adminStirShaken.get('/certificates/expiring', async (c) => {
    const daysUntilExpiry = parseInt(c.req.query('days')) || 30;

    try {
        const result = await pool.query(`
            SELECT c.*, t.name as tenant_name, t.company_name,
                   EXTRACT(DAY FROM c.not_after - NOW()) as days_until_expiry
            FROM stir_shaken_certificates c
            JOIN tenants t ON c.tenant_id = t.id
            WHERE c.status IN ('active', 'expiring')
            AND c.not_after <= NOW() + INTERVAL '${daysUntilExpiry} days'
            ORDER BY c.not_after ASC
        `);

        return c.json({
            success: true,
            certificates: result.rows.map(cert => ({
                id: cert.id,
                tenantId: cert.tenant_id,
                tenantName: cert.tenant_name,
                companyName: cert.company_name,
                commonName: cert.common_name,
                status: cert.status,
                notAfter: cert.not_after,
                daysUntilExpiry: Math.floor(parseFloat(cert.days_until_expiry)),
                autoRenew: cert.auto_renew
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get expiring certificates:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Trigger certificate expiry check
 */
adminStirShaken.post('/certificates/check-expiry', async (c) => {
    try {
        const expiring = await certificateManager.checkExpiringCertificates();

        return c.json({
            success: true,
            message: `Checked ${expiring.length} certificates`,
            expiring: expiring.map(cert => ({
                id: cert.id,
                tenantId: cert.tenant_id,
                tenantName: cert.tenant_name,
                status: cert.status,
                notAfter: cert.not_after
            }))
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Certificate check failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Update certificate status (admin override)
 */
adminStirShaken.put('/certificates/:certificateId/status', async (c) => {
    const { certificateId } = c.req.param();
    const body = await c.req.json();

    if (!body.status) {
        return c.json({ success: false, error: 'Status is required' }, 400);
    }

    const validStatuses = ['pending', 'active', 'expiring', 'expired', 'revoked', 'failed'];
    if (!validStatuses.includes(body.status)) {
        return c.json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
    }

    try {
        const result = await pool.query(`
            UPDATE stir_shaken_certificates
            SET status = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [certificateId, body.status]);

        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Certificate not found' }, 404);
        }

        return c.json({
            success: true,
            message: 'Certificate status updated',
            certificate: {
                id: result.rows[0].id,
                status: result.rows[0].status
            }
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Status update failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== ATTESTATION ANALYTICS ====================

/**
 * Get attestation analytics
 */
adminStirShaken.get('/attestations/analytics', async (c) => {
    const startDate = c.req.query('startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('endDate') || new Date().toISOString();
    const tenantId = c.req.query('tenantId');

    try {
        let whereClause = `WHERE created_at >= $1 AND created_at < $2`;
        const params = [startDate, endDate];

        if (tenantId) {
            params.push(tenantId);
            whereClause += ` AND tenant_id = $${params.length}`;
        }

        // Daily breakdown
        const dailyResult = await pool.query(`
            SELECT
                DATE(created_at) as date,
                call_direction,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE attestation_level = 'A') as level_a,
                COUNT(*) FILTER (WHERE attestation_level = 'B') as level_b,
                COUNT(*) FILTER (WHERE attestation_level = 'C') as level_c,
                COUNT(*) FILTER (WHERE verification_status = 'verified') as verified,
                COUNT(*) FILTER (WHERE verification_status = 'failed') as failed,
                COUNT(*) FILTER (WHERE verification_status = 'no_signature') as no_signature
            FROM stir_shaken_attestations
            ${whereClause}
            GROUP BY DATE(created_at), call_direction
            ORDER BY date
        `, params);

        // Top tenants by volume
        const tenantResult = await pool.query(`
            SELECT
                a.tenant_id,
                t.name as tenant_name,
                COUNT(*) as total_calls,
                COUNT(*) FILTER (WHERE attestation_level = 'A') as level_a_count,
                ROUND(COUNT(*) FILTER (WHERE attestation_level = 'A')::decimal / NULLIF(COUNT(*), 0) * 100, 2) as level_a_percentage
            FROM stir_shaken_attestations a
            JOIN tenants t ON a.tenant_id = t.id
            ${whereClause}
            GROUP BY a.tenant_id, t.name
            ORDER BY total_calls DESC
            LIMIT 10
        `, params);

        return c.json({
            success: true,
            analytics: {
                period: { startDate, endDate },
                daily: dailyResult.rows,
                topTenants: tenantResult.rows
            }
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Analytics query failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get verification failures
 */
adminStirShaken.get('/attestations/failures', async (c) => {
    const limit = parseInt(c.req.query('limit')) || 100;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        const result = await pool.query(`
            SELECT a.*, t.name as tenant_name
            FROM stir_shaken_attestations a
            JOIN tenants t ON a.tenant_id = t.id
            WHERE a.verification_status IN ('failed', 'invalid_cert', 'expired')
            ORDER BY a.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return c.json({
            success: true,
            failures: result.rows.map(a => ({
                id: a.id,
                tenantId: a.tenant_id,
                tenantName: a.tenant_name,
                callId: a.call_id,
                origTn: a.orig_tn,
                destTn: a.dest_tn,
                verificationStatus: a.verification_status,
                verificationError: a.verification_error,
                createdAt: a.created_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get failures:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== ROBOCALL DATABASE ====================

/**
 * Get robocall database entries
 */
adminStirShaken.get('/robocall', async (c) => {
    const classification = c.req.query('classification');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        let query = `
            SELECT * FROM stir_shaken_robocall_database
            WHERE 1=1
        `;
        const params = [];

        if (classification) {
            params.push(classification);
            query += ` AND classification = $${params.length}`;
        }

        query += ` ORDER BY last_reported_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return c.json({
            success: true,
            entries: result.rows.map(r => ({
                id: r.id,
                phoneNumber: r.phone_number,
                classification: r.classification,
                riskScore: r.risk_score,
                reportSource: r.report_source,
                reportCount: r.report_count,
                reportedName: r.reported_name,
                reportedReason: r.reported_reason,
                autoBlock: r.auto_block,
                firstReportedAt: r.first_reported_at,
                lastReportedAt: r.last_reported_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get robocall database:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Add/update robocall database entry
 */
adminStirShaken.post('/robocall', async (c) => {
    const body = await c.req.json();

    if (!body.phoneNumber) {
        return c.json({ success: false, error: 'Phone number is required' }, 400);
    }

    try {
        const entry = await attestationService.reportRobocaller(body.phoneNumber, {
            ...body,
            reportSource: body.reportSource || 'admin'
        });

        return c.json({
            success: true,
            entry: {
                id: entry.id,
                phoneNumber: entry.phone_number,
                classification: entry.classification,
                riskScore: entry.risk_score
            }
        }, 201);
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to add robocall entry:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Update robocall entry
 */
adminStirShaken.put('/robocall/:entryId', async (c) => {
    const { entryId } = c.req.param();
    const body = await c.req.json();

    try {
        const fields = [];
        const values = [entryId];
        let paramIndex = 2;

        const allowedFields = ['classification', 'risk_score', 'auto_block', 'reported_name', 'reported_reason'];

        for (const [key, value] of Object.entries(body)) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            if (allowedFields.includes(snakeKey)) {
                fields.push(`${snakeKey} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return c.json({ success: false, error: 'No valid fields to update' }, 400);
        }

        const result = await pool.query(`
            UPDATE stir_shaken_robocall_database
            SET ${fields.join(', ')}, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return c.json({ success: false, error: 'Entry not found' }, 404);
        }

        return c.json({
            success: true,
            entry: result.rows[0]
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to update robocall entry:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Delete robocall entry
 */
adminStirShaken.delete('/robocall/:entryId', async (c) => {
    const { entryId } = c.req.param();

    try {
        await pool.query(`DELETE FROM stir_shaken_robocall_database WHERE id = $1`, [entryId]);

        return c.json({
            success: true,
            message: 'Entry deleted'
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to delete robocall entry:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== TENANT SETTINGS ====================

/**
 * Get all tenant settings
 */
adminStirShaken.get('/tenant-settings', async (c) => {
    try {
        const result = await pool.query(`
            SELECT s.*, t.name as tenant_name, t.company_name
            FROM tenant_stir_shaken_settings s
            JOIN tenants t ON s.tenant_id = t.id
            ORDER BY t.name
        `);

        return c.json({
            success: true,
            settings: result.rows.map(s => ({
                tenantId: s.tenant_id,
                tenantName: s.tenant_name,
                companyName: s.company_name,
                stirShakenEnabled: s.stir_shaken_enabled,
                signingEnabled: s.signing_enabled,
                verificationEnabled: s.verification_enabled,
                defaultAttestationLevel: s.default_attestation_level,
                blockRobocallScoreThreshold: s.block_robocall_score_threshold,
                updatedAt: s.updated_at
            }))
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get tenant settings:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Update tenant settings (admin override)
 */
adminStirShaken.put('/tenant-settings/:tenantId', async (c) => {
    const { tenantId } = c.req.param();
    const body = await c.req.json();

    // Convert camelCase to snake_case
    const dbSettings = {};
    const fieldMapping = {
        stirShakenEnabled: 'stir_shaken_enabled',
        signingEnabled: 'signing_enabled',
        verificationEnabled: 'verification_enabled',
        defaultAttestationLevel: 'default_attestation_level',
        requireNumberVerification: 'require_number_verification',
        acceptUnverifiedCalls: 'accept_unverified_calls',
        blockFailedVerification: 'block_failed_verification',
        blockRobocallScoreThreshold: 'block_robocall_score_threshold'
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
        if (body[camelKey] !== undefined) {
            dbSettings[snakeKey] = body[camelKey];
        }
    }

    try {
        const settings = await certificateManager.updateTenantSettings(tenantId, dbSettings);

        return c.json({
            success: true,
            message: 'Tenant settings updated',
            settings
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to update tenant settings:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== PLATFORM CONFIGURATION ====================

/**
 * Get platform configuration
 */
adminStirShaken.get('/config', async (c) => {
    try {
        const config = await certificateManager.getPlatformConfig();

        return c.json({
            success: true,
            config
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get config:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Update platform configuration
 */
adminStirShaken.put('/config/:key', async (c) => {
    const { key } = c.req.param();
    const body = await c.req.json();

    try {
        const result = await pool.query(`
            INSERT INTO platform_stir_shaken_config (config_key, config_value, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (config_key) DO UPDATE
            SET config_value = $2, description = COALESCE($3, platform_stir_shaken_config.description),
                updated_at = NOW()
            RETURNING *
        `, [key, JSON.stringify(body.value), body.description]);

        return c.json({
            success: true,
            config: {
                key: result.rows[0].config_key,
                value: result.rows[0].config_value,
                description: result.rows[0].description
            }
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to update config:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== COMPLIANCE REPORTS ====================

/**
 * Get all compliance reports
 */
adminStirShaken.get('/reports', async (c) => {
    const tenantId = c.req.query('tenantId');
    const reportType = c.req.query('reportType');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        let query = `
            SELECT r.*, t.name as tenant_name
            FROM stir_shaken_compliance_reports r
            JOIN tenants t ON r.tenant_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (tenantId) {
            params.push(tenantId);
            query += ` AND r.tenant_id = $${params.length}`;
        }

        if (reportType) {
            params.push(reportType);
            query += ` AND r.report_type = $${params.length}`;
        }

        query += ` ORDER BY r.generated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return c.json({
            success: true,
            reports: result.rows.map(r => ({
                id: r.id,
                tenantId: r.tenant_id,
                tenantName: r.tenant_name,
                reportType: r.report_type,
                periodStart: r.report_period_start,
                periodEnd: r.report_period_end,
                totalOutboundCalls: r.total_outbound_calls,
                totalInboundCalls: r.total_inbound_calls,
                attestationACount: r.attestation_a_count,
                attestationBCount: r.attestation_b_count,
                attestationCCount: r.attestation_c_count,
                verifiedCount: r.verified_count,
                failedVerificationCount: r.failed_verification_count,
                generatedAt: r.generated_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get reports:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Generate platform-wide compliance report
 */
adminStirShaken.post('/reports/generate', async (c) => {
    const body = await c.req.json();
    const startDate = body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = body.endDate || new Date().toISOString();

    try {
        // Get all tenants with STIR/SHAKEN enabled
        const tenantsResult = await pool.query(`
            SELECT tenant_id FROM tenant_stir_shaken_settings WHERE stir_shaken_enabled = true
        `);

        const reports = [];
        for (const tenant of tenantsResult.rows) {
            const report = await attestationService.generateComplianceReport(
                tenant.tenant_id,
                startDate,
                endDate,
                body.reportType || 'on_demand'
            );
            reports.push(report);
        }

        return c.json({
            success: true,
            message: `Generated ${reports.length} compliance reports`,
            reports: reports.map(r => ({
                id: r.id,
                tenantId: r.tenant_id,
                periodStart: r.report_period_start,
                periodEnd: r.report_period_end
            }))
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Report generation failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== AUDIT LOG ====================

/**
 * Get audit log
 */
adminStirShaken.get('/audit', async (c) => {
    const tenantId = c.req.query('tenantId');
    const action = c.req.query('action');
    const limit = parseInt(c.req.query('limit')) || 100;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        let query = `
            SELECT a.*, t.name as tenant_name
            FROM stir_shaken_audit_log a
            LEFT JOIN tenants t ON a.tenant_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (tenantId) {
            params.push(tenantId);
            query += ` AND a.tenant_id = $${params.length}`;
        }

        if (action) {
            params.push(action);
            query += ` AND a.action = $${params.length}`;
        }

        query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        return c.json({
            success: true,
            auditLog: result.rows.map(a => ({
                id: a.id,
                tenantId: a.tenant_id,
                tenantName: a.tenant_name,
                action: a.action,
                entityType: a.entity_type,
                entityId: a.entity_id,
                oldValue: a.old_value,
                newValue: a.new_value,
                performedBy: a.performed_by,
                performedByType: a.performed_by_type,
                ipAddress: a.ip_address,
                createdAt: a.created_at
            })),
            count: result.rows.length
        });
    } catch (error) {
        console.error('[Admin STIR/SHAKEN] Failed to get audit log:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

export default adminStirShaken;
