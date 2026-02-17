/**
 * STIR/SHAKEN API Routes
 * Customer-facing endpoints for STIR/SHAKEN certificate management and call attestation
 */

import { Hono } from 'hono';
import certificateManager from '../services/stir-shaken/certificate-manager.js';
import attestationService from '../services/stir-shaken/attestation-service.js';

const stirShaken = new Hono();

// ==================== CERTIFICATE MANAGEMENT ====================

/**
 * Request a new STIR/SHAKEN certificate
 */
stirShaken.post('/certificates', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    try {
        const certificate = await certificateManager.requestCertificate(tenantId, body);

        return c.json({
            success: true,
            certificate: {
                id: certificate.id,
                status: certificate.status,
                commonName: certificate.common_name,
                notBefore: certificate.not_before,
                notAfter: certificate.not_after,
                keyAlgorithm: certificate.key_algorithm
            },
            message: 'Certificate request submitted. Await STI-CA approval.'
        }, 201);
    } catch (error) {
        console.error('[STIR/SHAKEN] Certificate request failed:', error.message);
        return c.json({ success: false, error: error.message }, 400);
    }
});

/**
 * Import an existing certificate
 */
stirShaken.post('/certificates/import', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    if (!body.publicCertificate) {
        return c.json({ success: false, error: 'Public certificate is required' }, 400);
    }

    try {
        const certificate = await certificateManager.importCertificate(tenantId, body);

        return c.json({
            success: true,
            certificate: {
                id: certificate.id,
                status: certificate.status,
                commonName: certificate.common_name,
                notBefore: certificate.not_before,
                notAfter: certificate.not_after
            }
        }, 201);
    } catch (error) {
        console.error('[STIR/SHAKEN] Certificate import failed:', error.message);
        return c.json({ success: false, error: error.message }, 400);
    }
});

/**
 * List all certificates
 */
stirShaken.get('/certificates', async (c) => {
    const tenantId = c.get('tenantId');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        const certificates = await certificateManager.getCertificates(tenantId, { status, limit, offset });

        return c.json({
            success: true,
            certificates: certificates.map(cert => ({
                id: cert.id,
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
                createdAt: cert.created_at
            })),
            count: certificates.length
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to list certificates:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get certificate by ID
 */
stirShaken.get('/certificates/:certificateId', async (c) => {
    const tenantId = c.get('tenantId');
    const { certificateId } = c.req.param();

    try {
        const certificate = await certificateManager.getCertificate(certificateId, tenantId);

        if (!certificate) {
            return c.json({ success: false, error: 'Certificate not found' }, 404);
        }

        return c.json({
            success: true,
            certificate: {
                id: certificate.id,
                status: certificate.status,
                commonName: certificate.common_name,
                subjectDn: certificate.subject_dn,
                issuerDn: certificate.issuer_dn,
                serialNumber: certificate.serial_number,
                notBefore: certificate.not_before,
                notAfter: certificate.not_after,
                keyAlgorithm: certificate.key_algorithm,
                isPrimary: certificate.is_primary,
                autoRenew: certificate.auto_renew,
                stiCaName: certificate.sti_ca_name,
                publicCertificate: certificate.public_certificate,
                certificateChain: certificate.certificate_chain,
                lastVerifiedAt: certificate.last_verified_at,
                verificationStatus: certificate.verification_status,
                createdAt: certificate.created_at
            }
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get certificate:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Set certificate as primary
 */
stirShaken.post('/certificates/:certificateId/set-primary', async (c) => {
    const tenantId = c.get('tenantId');
    const { certificateId } = c.req.param();

    try {
        const certificate = await certificateManager.setPrimaryCertificate(certificateId, tenantId);

        if (!certificate) {
            return c.json({ success: false, error: 'Certificate not found' }, 404);
        }

        return c.json({
            success: true,
            message: 'Certificate set as primary',
            certificate: {
                id: certificate.id,
                isPrimary: certificate.is_primary
            }
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to set primary certificate:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Verify a certificate
 */
stirShaken.post('/certificates/:certificateId/verify', async (c) => {
    const tenantId = c.get('tenantId');
    const { certificateId } = c.req.param();

    try {
        const result = await certificateManager.verifyCertificateChain(certificateId);

        return c.json({
            success: true,
            verification: result
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Certificate verification failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Revoke a certificate
 */
stirShaken.post('/certificates/:certificateId/revoke', async (c) => {
    const tenantId = c.get('tenantId');
    const { certificateId } = c.req.param();
    const body = await c.req.json().catch(() => ({}));

    try {
        const certificate = await certificateManager.revokeCertificate(certificateId, tenantId, body.reason);

        if (!certificate) {
            return c.json({ success: false, error: 'Certificate not found' }, 404);
        }

        return c.json({
            success: true,
            message: 'Certificate revoked',
            certificate: {
                id: certificate.id,
                status: certificate.status
            }
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Certificate revocation failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Delete a certificate
 */
stirShaken.delete('/certificates/:certificateId', async (c) => {
    const tenantId = c.get('tenantId');
    const { certificateId } = c.req.param();

    try {
        await certificateManager.deleteCertificate(certificateId, tenantId);

        return c.json({
            success: true,
            message: 'Certificate deleted'
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Certificate deletion failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== SERVICE PROVIDER CODES ====================

/**
 * Register Service Provider Code
 */
stirShaken.post('/spc', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    if (!body.spcToken) {
        return c.json({ success: false, error: 'SPC token is required' }, 400);
    }

    try {
        const spc = await certificateManager.registerSPC(tenantId, body);

        return c.json({
            success: true,
            spc: {
                id: spc.id,
                spcToken: spc.spc_token,
                ocn: spc.ocn,
                carrierName: spc.carrier_name,
                status: spc.status
            }
        }, 201);
    } catch (error) {
        console.error('[STIR/SHAKEN] SPC registration failed:', error.message);
        return c.json({ success: false, error: error.message }, 400);
    }
});

/**
 * Get SPC records
 */
stirShaken.get('/spc', async (c) => {
    const tenantId = c.get('tenantId');

    try {
        const spcRecords = await certificateManager.getSPC(tenantId);

        return c.json({
            success: true,
            spc: spcRecords.map(s => ({
                id: s.id,
                spcToken: s.spc_token,
                ocn: s.ocn,
                carrierName: s.carrier_name,
                certificateId: s.certificate_id,
                certificateName: s.certificate_name,
                certificateStatus: s.certificate_status,
                stiPaVerified: s.sti_pa_verified,
                authorizedRanges: s.authorized_tn_ranges,
                status: s.status
            }))
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get SPC:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== NUMBER AUTHORITY ====================

/**
 * Add number authority record
 */
stirShaken.post('/numbers', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    if (!body.phoneNumber) {
        return c.json({ success: false, error: 'Phone number is required' }, 400);
    }

    try {
        const authority = await certificateManager.addNumberAuthority(tenantId, body);

        return c.json({
            success: true,
            number: {
                id: authority.id,
                phoneNumber: authority.phone_number,
                authorityType: authority.authority_type,
                verifiedOwner: authority.verified_owner,
                status: authority.status
            }
        }, 201);
    } catch (error) {
        console.error('[STIR/SHAKEN] Number registration failed:', error.message);
        return c.json({ success: false, error: error.message }, 400);
    }
});

/**
 * Get authorized numbers
 */
stirShaken.get('/numbers', async (c) => {
    const tenantId = c.get('tenantId');

    try {
        const numbers = await certificateManager.getAuthorizedNumbers(tenantId);

        return c.json({
            success: true,
            numbers: numbers.map(n => ({
                id: n.id,
                phoneNumber: n.phone_number,
                authorityType: n.authority_type,
                verifiedOwner: n.verified_owner,
                verificationMethod: n.verification_method,
                verifiedAt: n.verified_at,
                loaExpiryDate: n.loa_expiry_date,
                status: n.status
            }))
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get numbers:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Check number attestation eligibility
 */
stirShaken.get('/numbers/:phoneNumber/eligibility', async (c) => {
    const tenantId = c.get('tenantId');
    const { phoneNumber } = c.req.param();

    try {
        const eligibility = await certificateManager.checkNumberAuthority(tenantId, phoneNumber);

        return c.json({
            success: true,
            eligibility
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Number eligibility check failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== ATTESTATION ====================

/**
 * Sign an outbound call
 */
stirShaken.post('/sign', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    if (!body.origTn || !body.destTn) {
        return c.json({ success: false, error: 'origTn and destTn are required' }, 400);
    }

    try {
        const result = await attestationService.signOutboundCall(tenantId, body);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({
            success: true,
            attestation: {
                id: result.attestation.id,
                attestationLevel: result.attestationLevel,
                reason: result.reason
            },
            identityHeader: result.identityHeader,
            passport: result.passport
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Call signing failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Verify an inbound call
 */
stirShaken.post('/verify', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    if (!body.origTn || !body.destTn) {
        return c.json({ success: false, error: 'origTn and destTn are required' }, 400);
    }

    try {
        let result;

        if (body.identityHeader) {
            result = await attestationService.verifyInboundCall(tenantId, body);
        } else {
            result = await attestationService.handleNoSignature(tenantId, body.callId, body.origTn, body.destTn);
        }

        return c.json({
            success: result.success,
            verification: {
                id: result.attestation?.id,
                status: result.status,
                attestationLevel: result.attestationLevel,
                error: result.error,
                shouldBlock: result.shouldBlock,
                reason: result.reason
            },
            robocallCheck: result.robocallCheck
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Call verification failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get attestation statistics
 */
stirShaken.get('/stats', async (c) => {
    const tenantId = c.get('tenantId');
    const startDate = c.req.query('startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = c.req.query('endDate') || new Date().toISOString();

    try {
        const stats = await attestationService.getAttestationStats(tenantId, startDate, endDate);

        return c.json({
            success: true,
            period: { startDate, endDate },
            stats
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get stats:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get recent attestations
 */
stirShaken.get('/attestations', async (c) => {
    const tenantId = c.get('tenantId');
    const direction = c.req.query('direction');
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit')) || 50;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        const attestations = await attestationService.getRecentAttestations(tenantId, {
            direction, status, limit, offset
        });

        return c.json({
            success: true,
            attestations: attestations.map(a => ({
                id: a.id,
                callId: a.call_id,
                origTn: a.orig_tn,
                destTn: a.dest_tn,
                direction: a.call_direction,
                attestationLevel: a.attestation_level,
                verificationStatus: a.verification_status,
                verificationError: a.verification_error,
                robocallScore: a.robocall_score,
                spamLikelihood: a.spam_likelihood,
                createdAt: a.created_at
            })),
            count: attestations.length
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get attestations:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== ROBOCALL MANAGEMENT ====================

/**
 * Report a robocaller
 */
stirShaken.post('/robocall/report', async (c) => {
    const body = await c.req.json();

    if (!body.phoneNumber) {
        return c.json({ success: false, error: 'Phone number is required' }, 400);
    }

    try {
        const report = await attestationService.reportRobocaller(body.phoneNumber, body);

        return c.json({
            success: true,
            report: {
                phoneNumber: report.phone_number,
                classification: report.classification,
                riskScore: report.risk_score,
                reportCount: report.report_count
            }
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Robocall report failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Check a number against robocall database
 */
stirShaken.get('/robocall/check/:phoneNumber', async (c) => {
    const { phoneNumber } = c.req.param();

    try {
        const check = await attestationService.checkRobocallDatabase(phoneNumber);

        return c.json({
            success: true,
            result: check
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Robocall check failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== COMPLIANCE REPORTS ====================

/**
 * Generate compliance report
 */
stirShaken.post('/reports', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    const startDate = body.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = body.endDate || new Date().toISOString();
    const reportType = body.reportType || 'on_demand';

    try {
        const report = await attestationService.generateComplianceReport(tenantId, startDate, endDate, reportType);

        return c.json({
            success: true,
            report: {
                id: report.id,
                reportType: report.report_type,
                periodStart: report.report_period_start,
                periodEnd: report.report_period_end,
                outbound: {
                    total: report.total_outbound_calls,
                    attestationA: report.attestation_a_count,
                    attestationB: report.attestation_b_count,
                    attestationC: report.attestation_c_count
                },
                inbound: {
                    total: report.total_inbound_calls,
                    verified: report.verified_count,
                    failed: report.failed_verification_count,
                    noSignature: report.no_signature_count
                },
                robocall: {
                    suspected: report.suspected_robocalls,
                    blocked: report.blocked_calls
                },
                certificates: {
                    active: report.certificates_active,
                    expiring: report.certificates_expiring
                },
                generatedAt: report.generated_at
            }
        }, 201);
    } catch (error) {
        console.error('[STIR/SHAKEN] Report generation failed:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get compliance reports
 */
stirShaken.get('/reports', async (c) => {
    const tenantId = c.get('tenantId');
    const reportType = c.req.query('reportType');
    const limit = parseInt(c.req.query('limit')) || 20;
    const offset = parseInt(c.req.query('offset')) || 0;

    try {
        const reports = await attestationService.getComplianceReports(tenantId, {
            reportType, limit, offset
        });

        return c.json({
            success: true,
            reports: reports.map(r => ({
                id: r.id,
                reportType: r.report_type,
                periodStart: r.report_period_start,
                periodEnd: r.report_period_end,
                totalOutboundCalls: r.total_outbound_calls,
                totalInboundCalls: r.total_inbound_calls,
                generatedAt: r.generated_at
            })),
            count: reports.length
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get reports:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

// ==================== SETTINGS ====================

/**
 * Get tenant STIR/SHAKEN settings
 */
stirShaken.get('/settings', async (c) => {
    const tenantId = c.get('tenantId');

    try {
        const settings = await certificateManager.getTenantSettings(tenantId);

        return c.json({
            success: true,
            settings: {
                stirShakenEnabled: settings.stir_shaken_enabled,
                signingEnabled: settings.signing_enabled,
                verificationEnabled: settings.verification_enabled,
                defaultAttestationLevel: settings.default_attestation_level,
                requireNumberVerification: settings.require_number_verification,
                acceptUnverifiedCalls: settings.accept_unverified_calls,
                blockFailedVerification: settings.block_failed_verification,
                blockRobocallScoreThreshold: settings.block_robocall_score_threshold,
                preferredStiCa: settings.preferred_sti_ca,
                autoRenewCertificates: settings.auto_renew_certificates,
                enableComplianceReports: settings.enable_compliance_reports,
                reportFrequency: settings.report_frequency,
                reportRecipients: settings.report_recipients,
                notifyCertExpiryDays: settings.notify_cert_expiry_days,
                notifyVerificationFailures: settings.notify_verification_failures
            }
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get settings:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Update tenant STIR/SHAKEN settings
 */
stirShaken.put('/settings', async (c) => {
    const tenantId = c.get('tenantId');
    const body = await c.req.json();

    // Convert camelCase to snake_case for database
    const dbSettings = {};
    const fieldMapping = {
        stirShakenEnabled: 'stir_shaken_enabled',
        signingEnabled: 'signing_enabled',
        verificationEnabled: 'verification_enabled',
        defaultAttestationLevel: 'default_attestation_level',
        requireNumberVerification: 'require_number_verification',
        acceptUnverifiedCalls: 'accept_unverified_calls',
        blockFailedVerification: 'block_failed_verification',
        blockRobocallScoreThreshold: 'block_robocall_score_threshold',
        preferredStiCa: 'preferred_sti_ca',
        autoRenewCertificates: 'auto_renew_certificates',
        enableComplianceReports: 'enable_compliance_reports',
        reportFrequency: 'report_frequency',
        reportRecipients: 'report_recipients',
        notifyCertExpiryDays: 'notify_cert_expiry_days',
        notifyVerificationFailures: 'notify_verification_failures'
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
            message: 'Settings updated',
            settings
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to update settings:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Get certificate statistics
 */
stirShaken.get('/certificates/stats', async (c) => {
    const tenantId = c.get('tenantId');

    try {
        const stats = await certificateManager.getCertificateStats(tenantId);

        return c.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('[STIR/SHAKEN] Failed to get certificate stats:', error.message);
        return c.json({ success: false, error: error.message }, 500);
    }
});

export default stirShaken;
