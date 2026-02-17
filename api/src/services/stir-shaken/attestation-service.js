/**
 * STIR/SHAKEN Call Attestation Service
 * Handles PASSporT token generation, signing, and verification
 */

import pool from '../../db/connection.js';
import crypto from 'crypto';
import certificateManager from './certificate-manager.js';

class AttestationService {
    /**
     * Generate PASSporT header
     */
    generatePassportHeader(certificateUrl) {
        return {
            alg: 'ES256',
            ppt: 'shaken',
            typ: 'passport',
            x5u: certificateUrl
        };
    }

    /**
     * Generate PASSporT payload
     */
    generatePassportPayload(origTn, destTn, attestationLevel, origId) {
        return {
            attest: attestationLevel,
            dest: {
                tn: Array.isArray(destTn) ? destTn : [destTn]
            },
            iat: Math.floor(Date.now() / 1000),
            orig: {
                tn: origTn
            },
            origid: origId
        };
    }

    /**
     * Sign PASSporT token
     */
    async signPassport(tenantId, header, payload, privateKeyPem) {
        const headerB64 = this.base64UrlEncode(JSON.stringify(header));
        const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));
        const signingInput = `${headerB64}.${payloadB64}`;

        // Decrypt private key if encrypted
        let privateKey = privateKeyPem;
        if (privateKeyPem.includes(':')) {
            privateKey = certificateManager.decrypt(privateKeyPem);
        }

        // Sign with ES256 (ECDSA with P-256 and SHA-256)
        const sign = crypto.createSign('SHA256');
        sign.update(signingInput);
        const signature = sign.sign({
            key: privateKey,
            dsaEncoding: 'ieee-p1363' // Required for JWT/PASSporT compatibility
        });

        const signatureB64 = this.base64UrlEncode(signature);

        return {
            token: `${signingInput}.${signatureB64}`,
            header: headerB64,
            payload: payloadB64,
            signature: signatureB64
        };
    }

    /**
     * Base64 URL encoding
     */
    base64UrlEncode(data) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return buffer.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Base64 URL decoding
     */
    base64UrlDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = str.length % 4;
        if (pad) {
            str += '='.repeat(4 - pad);
        }
        return Buffer.from(str, 'base64');
    }

    /**
     * Create Identity header for SIP
     */
    createIdentityHeader(passport, info = 'ident') {
        return `${passport.token};info=<${info}>;alg=ES256;ppt=shaken`;
    }

    /**
     * Determine attestation level for a call
     */
    async determineAttestationLevel(tenantId, origTn, callOrigin = 'direct') {
        // Check tenant settings
        const settings = await certificateManager.getTenantSettings(tenantId);

        // If STIR/SHAKEN is disabled, return null
        if (!settings.stir_shaken_enabled || !settings.signing_enabled) {
            return { level: null, reason: 'STIR/SHAKEN signing disabled' };
        }

        // Check number authority
        const authority = await certificateManager.checkNumberAuthority(tenantId, origTn);

        if (authority.attestationLevel === 'A') {
            return { level: 'A', reason: 'Full authority over originating number' };
        }

        if (authority.attestationLevel === 'B') {
            return { level: 'B', reason: authority.reason || 'Partial authority - number origin verified but not caller ID' };
        }

        // For gateway/SIP trunk originated calls
        if (callOrigin === 'gateway' || callOrigin === 'sip_trunk') {
            return { level: 'C', reason: 'Gateway attestation - received from external network' };
        }

        // Default to tenant setting or B
        return {
            level: settings.default_attestation_level || 'B',
            reason: 'Default attestation level applied'
        };
    }

    /**
     * Sign an outbound call
     */
    async signOutboundCall(tenantId, callDetails) {
        const {
            origTn,
            destTn,
            callId,
            callOrigin = 'direct'
        } = callDetails;

        // Get primary certificate
        const certificate = await certificateManager.getPrimaryCertificate(tenantId);
        if (!certificate) {
            return {
                success: false,
                error: 'No active certificate available',
                attestation: null
            };
        }

        // Determine attestation level
        const { level, reason } = await this.determineAttestationLevel(tenantId, origTn, callOrigin);

        if (!level) {
            return {
                success: false,
                error: reason,
                attestation: null
            };
        }

        // Generate unique origination ID
        const origId = crypto.randomUUID();

        // Generate PASSporT components
        const certificateUrl = certificate.sti_ca_url || `https://certs.irisx.io/${certificate.id}`;
        const header = this.generatePassportHeader(certificateUrl);
        const payload = this.generatePassportPayload(origTn, destTn, level, origId);

        // Sign the PASSporT
        const passport = await this.signPassport(
            tenantId,
            header,
            payload,
            certificate.private_key_encrypted
        );

        // Create Identity header
        const identityHeader = this.createIdentityHeader(passport);

        // Store attestation record
        const attestationResult = await pool.query(
            `INSERT INTO stir_shaken_attestations (
                tenant_id, call_id, orig_tn, dest_tn, call_direction,
                passport_header, passport_payload, passport_signature,
                full_identity_header, attestation_level, orig_id, certificate_id
            ) VALUES ($1, $2, $3, $4, 'outbound', $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                tenantId,
                callId,
                origTn,
                destTn,
                JSON.stringify(header),
                JSON.stringify(payload),
                passport.signature,
                identityHeader,
                level,
                origId,
                certificate.id
            ]
        );

        return {
            success: true,
            attestation: attestationResult.rows[0],
            identityHeader,
            passport: {
                header,
                payload,
                token: passport.token
            },
            attestationLevel: level,
            reason
        };
    }

    /**
     * Verify an inbound call's Identity header
     */
    async verifyInboundCall(tenantId, verificationData) {
        const {
            identityHeader,
            origTn,
            destTn,
            callId
        } = verificationData;

        // Parse Identity header
        const parsedIdentity = this.parseIdentityHeader(identityHeader);
        if (!parsedIdentity) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'failed',
                error: 'Invalid Identity header format'
            });
        }

        // Decode PASSporT
        const passport = this.decodePassport(parsedIdentity.token);
        if (!passport) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'failed',
                error: 'Invalid PASSporT format'
            });
        }

        // Check PASSporT freshness (within 60 seconds)
        const ttlConfig = await this.getConfigValue('passport_ttl_seconds');
        const ttl = ttlConfig?.value || 60;
        const now = Math.floor(Date.now() / 1000);

        if (now - passport.payload.iat > ttl) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'expired',
                error: 'PASSporT token expired',
                passport
            });
        }

        // Verify number match
        if (passport.payload.orig.tn !== origTn) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'failed',
                error: 'Originating TN mismatch',
                passport
            });
        }

        // Fetch and verify certificate
        const certVerification = await this.verifyCertificateFromUrl(passport.header.x5u);
        if (!certVerification.valid) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'invalid_cert',
                error: certVerification.error,
                passport
            });
        }

        // Verify signature
        const signatureValid = await this.verifySignature(
            parsedIdentity.token,
            certVerification.publicKey
        );

        if (!signatureValid) {
            return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
                status: 'failed',
                error: 'Signature verification failed',
                passport
            });
        }

        // Check robocall database
        const robocallCheck = await this.checkRobocallDatabase(origTn);

        return await this.recordVerificationResult(tenantId, callId, origTn, destTn, {
            status: 'verified',
            passport,
            attestationLevel: passport.payload.attest,
            robocallCheck
        });
    }

    /**
     * Parse SIP Identity header
     */
    parseIdentityHeader(identityHeader) {
        try {
            // Format: token;info=<url>;alg=ES256;ppt=shaken
            const parts = identityHeader.split(';');
            const token = parts[0].trim();

            const params = {};
            for (let i = 1; i < parts.length; i++) {
                const [key, value] = parts[i].split('=');
                params[key.trim()] = value?.trim().replace(/[<>]/g, '');
            }

            return {
                token,
                info: params.info,
                alg: params.alg,
                ppt: params.ppt
            };
        } catch (error) {
            console.error('[Attestation] Failed to parse Identity header:', error.message);
            return null;
        }
    }

    /**
     * Decode PASSporT token
     */
    decodePassport(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }

            return {
                header: JSON.parse(this.base64UrlDecode(parts[0]).toString()),
                payload: JSON.parse(this.base64UrlDecode(parts[1]).toString()),
                signature: parts[2]
            };
        } catch (error) {
            console.error('[Attestation] Failed to decode PASSporT:', error.message);
            return null;
        }
    }

    /**
     * Verify certificate from URL
     */
    async verifyCertificateFromUrl(certUrl) {
        // In production, fetch and verify certificate from STI-CA repository
        // Check against CRL and OCSP
        // For now, return mock verification

        try {
            // Would fetch: const response = await fetch(certUrl);
            // const certPem = await response.text();

            return {
                valid: true,
                publicKey: null, // Would extract from fetched certificate
                issuer: 'STI-CA',
                notExpired: true,
                notRevoked: true
            };
        } catch (error) {
            return {
                valid: false,
                error: `Failed to fetch certificate: ${error.message}`
            };
        }
    }

    /**
     * Verify PASSporT signature
     */
    async verifySignature(token, publicKey) {
        try {
            const parts = token.split('.');
            const signingInput = `${parts[0]}.${parts[1]}`;
            const signature = this.base64UrlDecode(parts[2]);

            if (!publicKey) {
                // Mock verification for development
                return true;
            }

            const verify = crypto.createVerify('SHA256');
            verify.update(signingInput);

            return verify.verify({
                key: publicKey,
                dsaEncoding: 'ieee-p1363'
            }, signature);
        } catch (error) {
            console.error('[Attestation] Signature verification error:', error.message);
            return false;
        }
    }

    /**
     * Check robocall database
     */
    async checkRobocallDatabase(phoneNumber) {
        const result = await pool.query(
            `SELECT * FROM stir_shaken_robocall_database WHERE phone_number = $1`,
            [phoneNumber]
        );

        if (result.rows[0]) {
            return {
                found: true,
                classification: result.rows[0].classification,
                riskScore: result.rows[0].risk_score,
                autoBlock: result.rows[0].auto_block
            };
        }

        return {
            found: false,
            classification: 'unknown',
            riskScore: 0,
            autoBlock: false
        };
    }

    /**
     * Record verification result
     */
    async recordVerificationResult(tenantId, callId, origTn, destTn, result) {
        const {
            status,
            error,
            passport,
            attestationLevel,
            robocallCheck
        } = result;

        const attestationResult = await pool.query(
            `INSERT INTO stir_shaken_attestations (
                tenant_id, call_id, orig_tn, dest_tn, call_direction,
                passport_header, passport_payload, attestation_level,
                orig_id, verification_status, verification_error,
                verified_at, robocall_score, spam_likelihood
            ) VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
            RETURNING *`,
            [
                tenantId,
                callId,
                origTn,
                destTn,
                passport?.header ? JSON.stringify(passport.header) : null,
                passport?.payload ? JSON.stringify(passport.payload) : null,
                attestationLevel || passport?.payload?.attest,
                passport?.payload?.origid || crypto.randomUUID(),
                status,
                error,
                robocallCheck?.riskScore || null,
                robocallCheck?.classification || null
            ]
        );

        return {
            success: status === 'verified',
            attestation: attestationResult.rows[0],
            status,
            error,
            attestationLevel: attestationLevel || passport?.payload?.attest,
            robocallCheck
        };
    }

    /**
     * Handle calls without Identity header
     */
    async handleNoSignature(tenantId, callId, origTn, destTn) {
        const settings = await certificateManager.getTenantSettings(tenantId);
        const robocallCheck = await this.checkRobocallDatabase(origTn);

        // Record as no_signature
        const attestationResult = await pool.query(
            `INSERT INTO stir_shaken_attestations (
                tenant_id, call_id, orig_tn, dest_tn, call_direction,
                attestation_level, orig_id, verification_status,
                robocall_score, spam_likelihood
            ) VALUES ($1, $2, $3, $4, 'inbound', NULL, $5, 'no_signature', $6, $7)
            RETURNING *`,
            [
                tenantId,
                callId,
                origTn,
                destTn,
                crypto.randomUUID(),
                robocallCheck.riskScore,
                robocallCheck.classification
            ]
        );

        // Determine if call should be blocked
        const shouldBlock = robocallCheck.autoBlock ||
            (robocallCheck.riskScore >= (settings.block_robocall_score_threshold || 80));

        return {
            success: settings.accept_unverified_calls && !shouldBlock,
            attestation: attestationResult.rows[0],
            status: 'no_signature',
            shouldBlock,
            robocallCheck,
            reason: shouldBlock ? 'Call blocked due to robocall risk' : 'Call accepted without STIR/SHAKEN'
        };
    }

    /**
     * Get attestation statistics
     */
    async getAttestationStats(tenantId, startDate, endDate) {
        const result = await pool.query(
            `SELECT
                call_direction,
                attestation_level,
                verification_status,
                COUNT(*) as count
             FROM stir_shaken_attestations
             WHERE tenant_id = $1
             AND created_at >= $2
             AND created_at < $3
             GROUP BY call_direction, attestation_level, verification_status`,
            [tenantId, startDate, endDate]
        );

        const stats = {
            outbound: { total: 0, A: 0, B: 0, C: 0 },
            inbound: { total: 0, verified: 0, failed: 0, no_signature: 0 }
        };

        for (const row of result.rows) {
            if (row.call_direction === 'outbound') {
                stats.outbound.total += parseInt(row.count);
                if (row.attestation_level) {
                    stats.outbound[row.attestation_level] = (stats.outbound[row.attestation_level] || 0) + parseInt(row.count);
                }
            } else {
                stats.inbound.total += parseInt(row.count);
                if (row.verification_status) {
                    stats.inbound[row.verification_status] = (stats.inbound[row.verification_status] || 0) + parseInt(row.count);
                }
            }
        }

        return stats;
    }

    /**
     * Get recent attestations
     */
    async getRecentAttestations(tenantId, options = {}) {
        const { direction, status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT * FROM stir_shaken_attestations
            WHERE tenant_id = $1
        `;
        const params = [tenantId];

        if (direction) {
            query += ` AND call_direction = $${params.length + 1}`;
            params.push(direction);
        }

        if (status) {
            query += ` AND verification_status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Get config value from platform config
     */
    async getConfigValue(key) {
        const result = await pool.query(
            `SELECT config_value FROM platform_stir_shaken_config WHERE config_key = $1`,
            [key]
        );
        return result.rows[0]?.config_value;
    }

    /**
     * Add number to robocall database
     */
    async reportRobocaller(phoneNumber, reportData) {
        const {
            classification = 'suspected',
            riskScore = 50,
            reportSource = 'user_report',
            reportedName,
            reportedReason
        } = reportData;

        const result = await pool.query(
            `INSERT INTO stir_shaken_robocall_database (
                phone_number, classification, risk_score, report_source,
                first_reported_at, last_reported_at, report_count,
                reported_name, reported_reason
            ) VALUES ($1, $2, $3, $4, NOW(), NOW(), 1, $5, $6)
            ON CONFLICT (phone_number) DO UPDATE
            SET classification = CASE
                    WHEN EXCLUDED.risk_score > stir_shaken_robocall_database.risk_score
                    THEN EXCLUDED.classification
                    ELSE stir_shaken_robocall_database.classification
                END,
                risk_score = GREATEST(stir_shaken_robocall_database.risk_score, EXCLUDED.risk_score),
                last_reported_at = NOW(),
                report_count = stir_shaken_robocall_database.report_count + 1,
                updated_at = NOW()
            RETURNING *`,
            [phoneNumber, classification, riskScore, reportSource, reportedName, reportedReason]
        );

        return result.rows[0];
    }

    /**
     * Generate compliance report
     */
    async generateComplianceReport(tenantId, startDate, endDate, reportType = 'on_demand') {
        const stats = await this.getAttestationStats(tenantId, startDate, endDate);
        const certStats = await certificateManager.getCertificateStats(tenantId);

        // Get robocall statistics
        const robocallResult = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE robocall_score >= 80) as suspected_robocalls,
                COUNT(*) FILTER (WHERE verification_status = 'failed' OR
                                      (verification_status = 'no_signature' AND robocall_score >= 80)) as blocked_calls
             FROM stir_shaken_attestations
             WHERE tenant_id = $1
             AND call_direction = 'inbound'
             AND created_at >= $2
             AND created_at < $3`,
            [tenantId, startDate, endDate]
        );

        const robocallStats = robocallResult.rows[0];

        const reportData = {
            period: { start: startDate, end: endDate },
            outbound: stats.outbound,
            inbound: stats.inbound,
            certificates: certStats,
            robocall: {
                suspected: parseInt(robocallStats.suspected_robocalls) || 0,
                blocked: parseInt(robocallStats.blocked_calls) || 0
            }
        };

        const result = await pool.query(
            `INSERT INTO stir_shaken_compliance_reports (
                tenant_id, report_type, report_period_start, report_period_end,
                total_outbound_calls, attestation_a_count, attestation_b_count, attestation_c_count,
                total_inbound_calls, verified_count, failed_verification_count, no_signature_count,
                suspected_robocalls, blocked_calls, certificates_active, certificates_expiring,
                report_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [
                tenantId,
                reportType,
                startDate,
                endDate,
                stats.outbound.total,
                stats.outbound.A || 0,
                stats.outbound.B || 0,
                stats.outbound.C || 0,
                stats.inbound.total,
                stats.inbound.verified || 0,
                stats.inbound.failed || 0,
                stats.inbound.no_signature || 0,
                reportData.robocall.suspected,
                reportData.robocall.blocked,
                parseInt(certStats.active) || 0,
                parseInt(certStats.expiring) || 0,
                JSON.stringify(reportData)
            ]
        );

        return result.rows[0];
    }

    /**
     * Get compliance reports
     */
    async getComplianceReports(tenantId, options = {}) {
        const { reportType, limit = 20, offset = 0 } = options;

        let query = `
            SELECT * FROM stir_shaken_compliance_reports
            WHERE tenant_id = $1
        `;
        const params = [tenantId];

        if (reportType) {
            query += ` AND report_type = $${params.length + 1}`;
            params.push(reportType);
        }

        query += ` ORDER BY generated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }
}

export default new AttestationService();
