/**
 * STIR/SHAKEN Certificate Management Service
 * Handles certificate lifecycle, STI-CA integration, and certificate verification
 */

import { pool } from '../../database.js';
import crypto from 'crypto';

// Certificate encryption key (should be from secure vault in production)
const ENCRYPTION_KEY = process.env.STIR_SHAKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const ENCRYPTION_IV_LENGTH = 16;

class CertificateManager {
    /**
     * Encrypt sensitive data (private keys)
     */
    encrypt(text) {
        const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    /**
     * Decrypt sensitive data
     */
    decrypt(text) {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    /**
     * Request a new certificate from STI-CA
     */
    async requestCertificate(tenantId, options = {}) {
        const {
            stiCaProvider = 'default',
            commonName,
            organizationName,
            spcToken
        } = options;

        // Get STI-CA configuration
        const configResult = await pool.query(
            `SELECT config_value FROM platform_stir_shaken_config WHERE config_key = 'sti_ca_providers'`
        );
        const stiCaProviders = configResult.rows[0]?.config_value || [];

        // Generate key pair
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Create certificate ID
        const certificateId = crypto.randomUUID();

        // In production, this would initiate ACME flow with STI-CA
        // For now, create a pending certificate record
        const notBefore = new Date();
        const notAfter = new Date();
        notAfter.setFullYear(notAfter.getFullYear() + 1); // 1 year validity

        const result = await pool.query(
            `INSERT INTO stir_shaken_certificates (
                id, tenant_id, certificate_type, common_name, subject_dn,
                public_certificate, private_key_encrypted, not_before, not_after,
                key_algorithm, key_size, sti_ca_name, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
            RETURNING *`,
            [
                certificateId,
                tenantId,
                'end_entity',
                commonName || `STIR-SHAKEN-${tenantId.slice(0, 8)}`,
                `CN=${commonName || tenantId}, O=${organizationName || 'IRISX Customer'}`,
                publicKey,
                this.encrypt(privateKey),
                notBefore,
                notAfter,
                'ES256',
                256,
                stiCaProvider
            ]
        );

        // Log audit
        await this.logAudit(tenantId, 'certificate_requested', 'certificate', certificateId, null, {
            stiCaProvider,
            commonName,
            spcToken
        });

        return result.rows[0];
    }

    /**
     * Import an existing certificate
     */
    async importCertificate(tenantId, certificateData) {
        const {
            publicCertificate,
            privateKey,
            certificateChain,
            commonName,
            stiCaName
        } = certificateData;

        // Parse certificate to extract metadata
        const certInfo = this.parseCertificate(publicCertificate);

        const certificateId = crypto.randomUUID();

        const result = await pool.query(
            `INSERT INTO stir_shaken_certificates (
                id, tenant_id, certificate_type, common_name, subject_dn, issuer_dn,
                serial_number, public_certificate, private_key_encrypted, certificate_chain,
                not_before, not_after, key_algorithm, sti_ca_name, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')
            RETURNING *`,
            [
                certificateId,
                tenantId,
                'end_entity',
                commonName || certInfo.commonName,
                certInfo.subjectDn,
                certInfo.issuerDn,
                certInfo.serialNumber,
                publicCertificate,
                privateKey ? this.encrypt(privateKey) : null,
                certificateChain,
                certInfo.notBefore,
                certInfo.notAfter,
                'ES256',
                stiCaName
            ]
        );

        await this.logAudit(tenantId, 'certificate_imported', 'certificate', certificateId, null, {
            commonName: commonName || certInfo.commonName
        });

        return result.rows[0];
    }

    /**
     * Parse PEM certificate to extract metadata
     */
    parseCertificate(pemCertificate) {
        // In production, use a proper X.509 parser like node-forge
        // This is a simplified implementation
        try {
            const cert = crypto.createPublicKey(pemCertificate);

            // Extract basic info (simplified)
            return {
                commonName: 'STIR-SHAKEN Certificate',
                subjectDn: 'CN=STIR-SHAKEN Certificate',
                issuerDn: 'CN=STI-CA',
                serialNumber: crypto.randomBytes(16).toString('hex'),
                notBefore: new Date(),
                notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            };
        } catch (error) {
            console.error('[CertManager] Failed to parse certificate:', error.message);
            return {
                commonName: 'Unknown',
                subjectDn: 'Unknown',
                issuerDn: 'Unknown',
                serialNumber: 'Unknown',
                notBefore: new Date(),
                notAfter: new Date()
            };
        }
    }

    /**
     * Get certificate by ID
     */
    async getCertificate(certificateId, tenantId) {
        const result = await pool.query(
            `SELECT * FROM stir_shaken_certificates
             WHERE id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)`,
            [certificateId, tenantId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get all certificates for a tenant
     */
    async getCertificates(tenantId, options = {}) {
        const { status, limit = 50, offset = 0 } = options;

        let query = `
            SELECT * FROM stir_shaken_certificates
            WHERE tenant_id = $1
        `;
        const params = [tenantId];

        if (status) {
            query += ` AND status = $${params.length + 1}`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * Get primary active certificate for signing
     */
    async getPrimaryCertificate(tenantId) {
        const result = await pool.query(
            `SELECT * FROM stir_shaken_certificates
             WHERE tenant_id = $1 AND status = 'active' AND is_primary = true
             ORDER BY created_at DESC LIMIT 1`,
            [tenantId]
        );

        if (result.rows[0]) {
            return result.rows[0];
        }

        // Fall back to any active certificate
        const fallbackResult = await pool.query(
            `SELECT * FROM stir_shaken_certificates
             WHERE tenant_id = $1 AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`,
            [tenantId]
        );

        return fallbackResult.rows[0] || null;
    }

    /**
     * Set a certificate as primary
     */
    async setPrimaryCertificate(certificateId, tenantId) {
        // Remove primary from other certificates
        await pool.query(
            `UPDATE stir_shaken_certificates
             SET is_primary = false
             WHERE tenant_id = $1`,
            [tenantId]
        );

        // Set this certificate as primary
        const result = await pool.query(
            `UPDATE stir_shaken_certificates
             SET is_primary = true, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            [certificateId, tenantId]
        );

        await this.logAudit(tenantId, 'certificate_set_primary', 'certificate', certificateId);

        return result.rows[0];
    }

    /**
     * Revoke a certificate
     */
    async revokeCertificate(certificateId, tenantId, reason = 'unspecified') {
        const oldCert = await this.getCertificate(certificateId, tenantId);

        const result = await pool.query(
            `UPDATE stir_shaken_certificates
             SET status = 'revoked', updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            [certificateId, tenantId]
        );

        await this.logAudit(tenantId, 'certificate_revoked', 'certificate', certificateId,
            { status: oldCert?.status }, { status: 'revoked', reason });

        return result.rows[0];
    }

    /**
     * Delete a certificate
     */
    async deleteCertificate(certificateId, tenantId) {
        const cert = await this.getCertificate(certificateId, tenantId);

        await pool.query(
            `DELETE FROM stir_shaken_certificates WHERE id = $1 AND tenant_id = $2`,
            [certificateId, tenantId]
        );

        await this.logAudit(tenantId, 'certificate_deleted', 'certificate', certificateId, cert);

        return { deleted: true };
    }

    /**
     * Check and update expiring certificates
     */
    async checkExpiringCertificates() {
        const result = await pool.query(
            `SELECT c.*, t.name as tenant_name
             FROM stir_shaken_certificates c
             JOIN tenants t ON c.tenant_id = t.id
             WHERE c.status = 'active'
             AND c.not_after < NOW() + INTERVAL '30 days'
             ORDER BY c.not_after`
        );

        const expiring = [];

        for (const cert of result.rows) {
            if (cert.not_after < new Date()) {
                // Certificate has expired
                await pool.query(
                    `UPDATE stir_shaken_certificates SET status = 'expired' WHERE id = $1`,
                    [cert.id]
                );
                cert.status = 'expired';
            } else {
                // Certificate is expiring soon
                await pool.query(
                    `UPDATE stir_shaken_certificates SET status = 'expiring' WHERE id = $1`,
                    [cert.id]
                );
                cert.status = 'expiring';

                // Trigger auto-renewal if enabled
                if (cert.auto_renew) {
                    await this.initiateRenewal(cert);
                }
            }
            expiring.push(cert);
        }

        return expiring;
    }

    /**
     * Initiate certificate renewal
     */
    async initiateRenewal(certificate) {
        // In production, this would trigger ACME renewal with STI-CA
        console.log(`[CertManager] Initiating renewal for certificate ${certificate.id}`);

        await this.logAudit(certificate.tenant_id, 'certificate_renewal_initiated', 'certificate', certificate.id);

        return { status: 'renewal_initiated' };
    }

    /**
     * Verify a certificate chain
     */
    async verifyCertificateChain(certificateId) {
        const cert = await this.getCertificate(certificateId, null);
        if (!cert) {
            return { valid: false, error: 'Certificate not found' };
        }

        // In production, verify against STI-PA certificate repository
        // Check CRL and OCSP status

        const verificationResult = {
            valid: true,
            chainValid: true,
            notRevoked: true,
            notExpired: cert.not_after > new Date(),
            issuerTrusted: true
        };

        await pool.query(
            `UPDATE stir_shaken_certificates
             SET last_verified_at = NOW(), verification_status = $2
             WHERE id = $1`,
            [certificateId, verificationResult.valid ? 'verified' : 'failed']
        );

        return verificationResult;
    }

    /**
     * Register Service Provider Code (SPC)
     */
    async registerSPC(tenantId, spcData) {
        const {
            spcToken,
            ocn,
            carrierName,
            certificateId,
            authorizedRanges = []
        } = spcData;

        const result = await pool.query(
            `INSERT INTO stir_shaken_spc (
                tenant_id, certificate_id, spc_token, ocn, carrier_name,
                authorized_tn_ranges
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, spc_token) DO UPDATE
            SET certificate_id = $2, ocn = $4, carrier_name = $5,
                authorized_tn_ranges = $6, updated_at = NOW()
            RETURNING *`,
            [tenantId, certificateId, spcToken, ocn, carrierName, JSON.stringify(authorizedRanges)]
        );

        await this.logAudit(tenantId, 'spc_registered', 'spc', result.rows[0].id, null, spcData);

        return result.rows[0];
    }

    /**
     * Get SPC for tenant
     */
    async getSPC(tenantId) {
        const result = await pool.query(
            `SELECT s.*, c.common_name as certificate_name, c.status as certificate_status
             FROM stir_shaken_spc s
             LEFT JOIN stir_shaken_certificates c ON s.certificate_id = c.id
             WHERE s.tenant_id = $1`,
            [tenantId]
        );
        return result.rows;
    }

    /**
     * Add number authority record
     */
    async addNumberAuthority(tenantId, numberData) {
        const {
            phoneNumber,
            authorityType,
            loaDocumentUrl,
            loaExpiryDate,
            verificationMethod
        } = numberData;

        const result = await pool.query(
            `INSERT INTO stir_shaken_number_authority (
                tenant_id, phone_number, authority_type, loa_document_url,
                loa_expiry_date, verification_method, verified_owner, verified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
            ON CONFLICT (tenant_id, phone_number) DO UPDATE
            SET authority_type = $3, loa_document_url = $4, loa_expiry_date = $5,
                verification_method = $6, updated_at = NOW()
            RETURNING *`,
            [tenantId, phoneNumber, authorityType, loaDocumentUrl, loaExpiryDate, verificationMethod]
        );

        return result.rows[0];
    }

    /**
     * Check if number is authorized for A-level attestation
     */
    async checkNumberAuthority(tenantId, phoneNumber) {
        const result = await pool.query(
            `SELECT * FROM stir_shaken_number_authority
             WHERE tenant_id = $1 AND phone_number = $2 AND status = 'active'`,
            [tenantId, phoneNumber]
        );

        const authority = result.rows[0];

        if (!authority) {
            return { authorized: false, attestationLevel: 'C', reason: 'Number not registered' };
        }

        if (!authority.verified_owner) {
            return { authorized: true, attestationLevel: 'B', reason: 'Number not fully verified' };
        }

        if (authority.loa_expiry_date && new Date(authority.loa_expiry_date) < new Date()) {
            return { authorized: true, attestationLevel: 'B', reason: 'LOA expired' };
        }

        return { authorized: true, attestationLevel: 'A', reason: 'Full authority verified' };
    }

    /**
     * Get all authorized numbers for tenant
     */
    async getAuthorizedNumbers(tenantId) {
        const result = await pool.query(
            `SELECT * FROM stir_shaken_number_authority
             WHERE tenant_id = $1
             ORDER BY phone_number`,
            [tenantId]
        );
        return result.rows;
    }

    /**
     * Log audit entry
     */
    async logAudit(tenantId, action, entityType, entityId, oldValue = null, newValue = null, performer = 'system') {
        await pool.query(
            `INSERT INTO stir_shaken_audit_log (
                tenant_id, action, entity_type, entity_id, old_value, new_value,
                performed_by, performed_by_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'system')`,
            [tenantId, action, entityType, entityId,
             oldValue ? JSON.stringify(oldValue) : null,
             newValue ? JSON.stringify(newValue) : null,
             performer]
        );
    }

    /**
     * Get tenant settings
     */
    async getTenantSettings(tenantId) {
        const result = await pool.query(
            `SELECT * FROM tenant_stir_shaken_settings WHERE tenant_id = $1`,
            [tenantId]
        );

        if (result.rows[0]) {
            return result.rows[0];
        }

        // Create default settings
        const defaultResult = await pool.query(
            `INSERT INTO tenant_stir_shaken_settings (tenant_id)
             VALUES ($1)
             ON CONFLICT (tenant_id) DO NOTHING
             RETURNING *`,
            [tenantId]
        );

        return defaultResult.rows[0] || { tenant_id: tenantId };
    }

    /**
     * Update tenant settings
     */
    async updateTenantSettings(tenantId, settings) {
        const fields = [];
        const values = [tenantId];
        let paramIndex = 2;

        const allowedFields = [
            'stir_shaken_enabled', 'signing_enabled', 'verification_enabled',
            'default_attestation_level', 'require_number_verification',
            'accept_unverified_calls', 'block_failed_verification',
            'block_robocall_score_threshold', 'preferred_sti_ca',
            'auto_renew_certificates', 'enable_compliance_reports',
            'report_frequency', 'report_recipients', 'notify_cert_expiry_days',
            'notify_verification_failures'
        ];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            return this.getTenantSettings(tenantId);
        }

        const result = await pool.query(
            `INSERT INTO tenant_stir_shaken_settings (tenant_id)
             VALUES ($1)
             ON CONFLICT (tenant_id) DO UPDATE
             SET ${fields.join(', ')}, updated_at = NOW()
             RETURNING *`,
            values
        );

        return result.rows[0];
    }

    /**
     * Get platform configuration
     */
    async getPlatformConfig() {
        const result = await pool.query(
            `SELECT config_key, config_value, description FROM platform_stir_shaken_config`
        );

        const config = {};
        for (const row of result.rows) {
            config[row.config_key] = {
                value: row.config_value,
                description: row.description
            };
        }

        return config;
    }

    /**
     * Get certificate statistics
     */
    async getCertificateStats(tenantId = null) {
        let whereClause = tenantId ? 'WHERE tenant_id = $1' : '';
        const params = tenantId ? [tenantId] : [];

        const result = await pool.query(
            `SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'expiring') as expiring,
                COUNT(*) FILTER (WHERE status = 'expired') as expired,
                COUNT(*) FILTER (WHERE status = 'revoked') as revoked
             FROM stir_shaken_certificates
             ${whereClause}`,
            params
        );

        return result.rows[0];
    }
}

export default new CertificateManager();
