/**
 * SAML 2.0 SSO Service
 *
 * Features:
 * - SAML 2.0 Service Provider (SP) implementation
 * - Identity Provider (IdP) metadata management
 * - Assertion Consumer Service (ACS)
 * - Single Logout (SLO)
 * - Attribute mapping
 * - Multi-tenant IdP configuration
 * - SAML response validation
 */

import { SignedXml, xpath } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import zlib from 'zlib';
import crypto from 'crypto';
import pool from '../db/connection.js';

// SAML constants
const SAML_NAMESPACES = {
  saml: 'urn:oasis:names:tc:SAML:2.0:assertion',
  samlp: 'urn:oasis:names:tc:SAML:2.0:protocol',
  ds: 'http://www.w3.org/2000/09/xmldsig#'
};

const SAML_BINDINGS = {
  HTTP_REDIRECT: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
  HTTP_POST: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
};

class SAMLService {
  constructor() {
    this.spEntityId = process.env.SAML_SP_ENTITY_ID || 'https://api.irisx.io/saml';
    this.spAcsUrl = process.env.SAML_ACS_URL || 'https://api.irisx.io/auth/saml/callback';
    this.spSloUrl = process.env.SAML_SLO_URL || 'https://api.irisx.io/auth/saml/logout';
    this.spPrivateKey = process.env.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, '\n');
    this.spCertificate = process.env.SAML_SP_CERTIFICATE?.replace(/\\n/g, '\n');
  }

  /**
   * Get SAML configuration for a tenant
   */
  async getTenantSAMLConfig(tenantId) {
    const result = await pool.query(`
      SELECT * FROM tenant_saml_config
      WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Get SAML config by domain (for IdP-initiated SSO)
   */
  async getSAMLConfigByDomain(domain) {
    const result = await pool.query(`
      SELECT tsc.* FROM tenant_saml_config tsc
      JOIN tenants t ON tsc.tenant_id = t.id
      WHERE $1 = ANY(tsc.email_domains)
        AND tsc.is_active = true
    `, [domain]);

    return result.rows[0] || null;
  }

  /**
   * Create or update tenant SAML configuration
   */
  async upsertTenantSAMLConfig(tenantId, config) {
    const {
      idp_entity_id,
      idp_sso_url,
      idp_slo_url,
      idp_certificate,
      email_domains = [],
      attribute_mapping = {},
      name_id_format = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      sign_requests = true,
      want_assertions_signed = true,
      is_active = true
    } = config;

    // Validate IdP certificate
    if (idp_certificate) {
      try {
        this.validateCertificate(idp_certificate);
      } catch (error) {
        throw new Error(`Invalid IdP certificate: ${error.message}`);
      }
    }

    const result = await pool.query(`
      INSERT INTO tenant_saml_config (
        tenant_id, idp_entity_id, idp_sso_url, idp_slo_url, idp_certificate,
        email_domains, attribute_mapping, name_id_format,
        sign_requests, want_assertions_signed, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        idp_entity_id = $2, idp_sso_url = $3, idp_slo_url = $4, idp_certificate = $5,
        email_domains = $6, attribute_mapping = $7, name_id_format = $8,
        sign_requests = $9, want_assertions_signed = $10, is_active = $11,
        updated_at = NOW()
      RETURNING *
    `, [
      tenantId, idp_entity_id, idp_sso_url, idp_slo_url, idp_certificate,
      JSON.stringify(email_domains), JSON.stringify(attribute_mapping), name_id_format,
      sign_requests, want_assertions_signed, is_active
    ]);

    return result.rows[0];
  }

  /**
   * Generate SP metadata XML
   */
  generateSPMetadata(tenantId = null) {
    const entityId = tenantId ? `${this.spEntityId}/${tenantId}` : this.spEntityId;

    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="true"
                      WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${this.cleanCertificate(this.spCertificate)}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:KeyDescriptor use="encryption">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${this.cleanCertificate(this.spCertificate)}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleLogoutService Binding="${SAML_BINDINGS.HTTP_POST}"
                            Location="${this.spSloUrl}"/>
    <md:SingleLogoutService Binding="${SAML_BINDINGS.HTTP_REDIRECT}"
                            Location="${this.spSloUrl}"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:AssertionConsumerService Binding="${SAML_BINDINGS.HTTP_POST}"
                                 Location="${this.spAcsUrl}"
                                 index="0"
                                 isDefault="true"/>
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">IRISX Platform</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">IRISX</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">https://irisx.io</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;
  }

  /**
   * Generate SAML AuthnRequest
   */
  generateAuthnRequest(config, options = {}) {
    const requestId = `_${crypto.randomBytes(16).toString('hex')}`;
    const issueInstant = new Date().toISOString();
    const { relayState, forceAuthn = false } = options;

    const request = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${requestId}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    Destination="${config.idp_sso_url}"
                    AssertionConsumerServiceURL="${this.spAcsUrl}"
                    ProtocolBinding="${SAML_BINDINGS.HTTP_POST}"
                    ${forceAuthn ? 'ForceAuthn="true"' : ''}>
  <saml:Issuer>${this.spEntityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="${config.name_id_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}"
                      AllowCreate="true"/>
</samlp:AuthnRequest>`;

    // Store request ID for validation
    this.storeRequestId(requestId, config.tenant_id);

    return {
      requestId,
      request: config.sign_requests ? this.signRequest(request) : request,
      relayState
    };
  }

  /**
   * Generate login URL (HTTP-Redirect binding)
   */
  generateLoginUrl(config, options = {}) {
    const { request, requestId, relayState } = this.generateAuthnRequest(config, options);

    // Deflate and base64 encode
    const deflated = zlib.deflateRawSync(request);
    const encoded = deflated.toString('base64');

    let url = `${config.idp_sso_url}?SAMLRequest=${encodeURIComponent(encoded)}`;

    if (relayState) {
      url += `&RelayState=${encodeURIComponent(relayState)}`;
    }

    // Sign if required
    if (config.sign_requests && this.spPrivateKey) {
      const sigAlg = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
      const toSign = `SAMLRequest=${encodeURIComponent(encoded)}&SigAlg=${encodeURIComponent(sigAlg)}`;

      const sign = crypto.createSign('RSA-SHA256');
      sign.update(toSign);
      const signature = sign.sign(this.spPrivateKey, 'base64');

      url += `&SigAlg=${encodeURIComponent(sigAlg)}&Signature=${encodeURIComponent(signature)}`;
    }

    return { url, requestId };
  }

  /**
   * Parse and validate SAML Response
   */
  async parseSAMLResponse(samlResponse, config) {
    const xml = Buffer.from(samlResponse, 'base64').toString('utf8');
    const doc = new DOMParser().parseFromString(xml);

    // Extract response attributes
    const responseElement = doc.getElementsByTagNameNS(SAML_NAMESPACES.samlp, 'Response')[0];
    if (!responseElement) {
      throw new Error('Invalid SAML response: Response element not found');
    }

    const responseId = responseElement.getAttribute('ID');
    const inResponseTo = responseElement.getAttribute('InResponseTo');
    const statusCode = this.getStatusCode(doc);

    if (statusCode !== 'urn:oasis:names:tc:SAML:2.0:status:Success') {
      throw new Error(`SAML authentication failed: ${statusCode}`);
    }

    // Validate InResponseTo if we have a stored request ID
    if (inResponseTo) {
      const valid = await this.validateRequestId(inResponseTo, config.tenant_id);
      if (!valid) {
        throw new Error('Invalid SAML response: InResponseTo does not match any pending request');
      }
    }

    // Verify signature
    if (config.want_assertions_signed) {
      const signatureValid = this.verifySignature(xml, config.idp_certificate);
      if (!signatureValid) {
        throw new Error('Invalid SAML response: Signature verification failed');
      }
    }

    // Extract assertion
    const assertion = doc.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'Assertion')[0];
    if (!assertion) {
      throw new Error('Invalid SAML response: Assertion not found');
    }

    // Validate conditions (time, audience)
    this.validateConditions(assertion, config);

    // Extract user attributes
    const user = this.extractUserAttributes(assertion, config);

    return {
      responseId,
      inResponseTo,
      user,
      raw: xml
    };
  }

  /**
   * Get status code from response
   */
  getStatusCode(doc) {
    const statusCode = doc.getElementsByTagNameNS(SAML_NAMESPACES.samlp, 'StatusCode')[0];
    return statusCode ? statusCode.getAttribute('Value') : 'Unknown';
  }

  /**
   * Validate assertion conditions
   */
  validateConditions(assertion, config) {
    const conditions = assertion.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'Conditions')[0];
    if (!conditions) return;

    const now = new Date();
    const notBefore = conditions.getAttribute('NotBefore');
    const notOnOrAfter = conditions.getAttribute('NotOnOrAfter');

    // Allow 5 minute clock skew
    const skewMs = 5 * 60 * 1000;

    if (notBefore && new Date(notBefore).getTime() - skewMs > now.getTime()) {
      throw new Error('SAML assertion is not yet valid');
    }

    if (notOnOrAfter && new Date(notOnOrAfter).getTime() + skewMs < now.getTime()) {
      throw new Error('SAML assertion has expired');
    }

    // Validate audience restriction
    const audienceElements = assertion.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'Audience');
    if (audienceElements.length > 0) {
      let audienceValid = false;
      for (let i = 0; i < audienceElements.length; i++) {
        const audience = audienceElements[i].textContent;
        if (audience === this.spEntityId || audience === `${this.spEntityId}/${config.tenant_id}`) {
          audienceValid = true;
          break;
        }
      }
      if (!audienceValid) {
        throw new Error('SAML assertion audience restriction not satisfied');
      }
    }
  }

  /**
   * Extract user attributes from assertion
   */
  extractUserAttributes(assertion, config) {
    const attributeMapping = typeof config.attribute_mapping === 'string'
      ? JSON.parse(config.attribute_mapping)
      : config.attribute_mapping || {};

    // Default attribute names
    const mapping = {
      email: attributeMapping.email || ['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', 'email', 'Email', 'mail'],
      firstName: attributeMapping.firstName || ['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname', 'firstName', 'givenName', 'first_name'],
      lastName: attributeMapping.lastName || ['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname', 'lastName', 'surname', 'last_name', 'sn'],
      role: attributeMapping.role || ['role', 'Role', 'groups', 'memberOf'],
      department: attributeMapping.department || ['department', 'Department']
    };

    // Extract NameID
    const nameId = assertion.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'NameID')[0];
    const nameIdValue = nameId ? nameId.textContent : null;

    // Extract attributes
    const attributes = {};
    const attributeStatements = assertion.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'AttributeStatement');

    if (attributeStatements.length > 0) {
      const attrs = attributeStatements[0].getElementsByTagNameNS(SAML_NAMESPACES.saml, 'Attribute');

      for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        const name = attr.getAttribute('Name');
        const valueElements = attr.getElementsByTagNameNS(SAML_NAMESPACES.saml, 'AttributeValue');
        const values = [];

        for (let j = 0; j < valueElements.length; j++) {
          values.push(valueElements[j].textContent);
        }

        attributes[name] = values.length === 1 ? values[0] : values;
      }
    }

    // Map to user object
    const user = {
      nameId: nameIdValue,
      email: this.findAttributeValue(attributes, mapping.email) || nameIdValue,
      firstName: this.findAttributeValue(attributes, mapping.firstName),
      lastName: this.findAttributeValue(attributes, mapping.lastName),
      role: this.findAttributeValue(attributes, mapping.role),
      department: this.findAttributeValue(attributes, mapping.department),
      rawAttributes: attributes
    };

    if (!user.email) {
      throw new Error('SAML response missing email attribute');
    }

    return user;
  }

  /**
   * Find attribute value using multiple possible names
   */
  findAttributeValue(attributes, possibleNames) {
    for (const name of possibleNames) {
      if (attributes[name]) {
        return Array.isArray(attributes[name]) ? attributes[name][0] : attributes[name];
      }
    }
    return null;
  }

  /**
   * Verify XML signature
   */
  verifySignature(xml, certificate) {
    try {
      const doc = new DOMParser().parseFromString(xml);
      const signature = xpath(doc, "//*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']")[0];

      if (!signature) {
        console.warn('[SAML] No signature found in response');
        return false;
      }

      const sig = new SignedXml();
      sig.keyInfoProvider = {
        getKey: () => this.cleanCertificate(certificate, true)
      };

      sig.loadSignature(signature);
      return sig.checkSignature(xml);
    } catch (error) {
      console.error('[SAML] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Sign XML request
   */
  signRequest(xml) {
    if (!this.spPrivateKey) {
      return xml;
    }

    try {
      const sig = new SignedXml();
      sig.signingKey = this.spPrivateKey;
      sig.addReference("//*[local-name(.)='AuthnRequest']",
        ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
        'http://www.w3.org/2001/04/xmlenc#sha256');
      sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
      sig.computeSignature(xml);
      return sig.getSignedXml();
    } catch (error) {
      console.error('[SAML] Error signing request:', error);
      return xml;
    }
  }

  /**
   * Store request ID for validation
   */
  async storeRequestId(requestId, tenantId) {
    await pool.query(`
      INSERT INTO saml_request_ids (request_id, tenant_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
    `, [requestId, tenantId]);
  }

  /**
   * Validate and consume request ID
   */
  async validateRequestId(requestId, tenantId) {
    const result = await pool.query(`
      DELETE FROM saml_request_ids
      WHERE request_id = $1 AND tenant_id = $2 AND expires_at > NOW()
      RETURNING *
    `, [requestId, tenantId]);

    return result.rows.length > 0;
  }

  /**
   * Generate Single Logout Request
   */
  generateLogoutRequest(config, nameId, sessionIndex) {
    const requestId = `_${crypto.randomBytes(16).toString('hex')}`;
    const issueInstant = new Date().toISOString();

    const request = `<?xml version="1.0"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                     xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                     ID="${requestId}"
                     Version="2.0"
                     IssueInstant="${issueInstant}"
                     Destination="${config.idp_slo_url}">
  <saml:Issuer>${this.spEntityId}</saml:Issuer>
  <saml:NameID>${nameId}</saml:NameID>
  ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ''}
</samlp:LogoutRequest>`;

    return {
      requestId,
      request: config.sign_requests ? this.signRequest(request) : request
    };
  }

  /**
   * Parse IdP metadata XML and extract configuration
   */
  parseIdPMetadata(metadataXml) {
    const doc = new DOMParser().parseFromString(metadataXml);

    const entityDescriptor = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'EntityDescriptor')[0];
    if (!entityDescriptor) {
      throw new Error('Invalid IdP metadata: EntityDescriptor not found');
    }

    const entityId = entityDescriptor.getAttribute('entityID');

    const idpSsoDescriptor = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'IDPSSODescriptor')[0];
    if (!idpSsoDescriptor) {
      throw new Error('Invalid IdP metadata: IDPSSODescriptor not found');
    }

    // Find SSO URL (prefer HTTP-POST, then HTTP-Redirect)
    const ssoServices = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'SingleSignOnService');
    let ssoUrl = null;

    for (let i = 0; i < ssoServices.length; i++) {
      const binding = ssoServices[i].getAttribute('Binding');
      if (binding === SAML_BINDINGS.HTTP_POST || binding === SAML_BINDINGS.HTTP_REDIRECT) {
        ssoUrl = ssoServices[i].getAttribute('Location');
        if (binding === SAML_BINDINGS.HTTP_POST) break; // Prefer POST
      }
    }

    // Find SLO URL
    const sloServices = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'SingleLogoutService');
    let sloUrl = null;

    for (let i = 0; i < sloServices.length; i++) {
      sloUrl = sloServices[i].getAttribute('Location');
      break;
    }

    // Find signing certificate
    const keyDescriptors = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'KeyDescriptor');
    let certificate = null;

    for (let i = 0; i < keyDescriptors.length; i++) {
      const use = keyDescriptors[i].getAttribute('use');
      if (!use || use === 'signing') {
        const x509Cert = keyDescriptors[i].getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0];
        if (x509Cert) {
          certificate = x509Cert.textContent.replace(/\s/g, '');
          break;
        }
      }
    }

    return {
      idp_entity_id: entityId,
      idp_sso_url: ssoUrl,
      idp_slo_url: sloUrl,
      idp_certificate: certificate
    };
  }

  /**
   * Clean certificate for use
   */
  cleanCertificate(cert, wrapPem = false) {
    if (!cert) return null;

    // Remove PEM headers and whitespace
    let cleaned = cert
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');

    if (wrapPem) {
      cleaned = `-----BEGIN CERTIFICATE-----\n${cleaned}\n-----END CERTIFICATE-----`;
    }

    return cleaned;
  }

  /**
   * Validate certificate format
   */
  validateCertificate(cert) {
    const cleaned = this.cleanCertificate(cert);
    if (!cleaned || cleaned.length < 100) {
      throw new Error('Certificate too short');
    }

    // Try to parse as base64
    try {
      Buffer.from(cleaned, 'base64');
    } catch (e) {
      throw new Error('Invalid base64 encoding');
    }

    return true;
  }

  /**
   * Get list of SAML-enabled tenants
   */
  async listSAMLTenants() {
    const result = await pool.query(`
      SELECT
        tsc.*,
        t.company_name as tenant_name
      FROM tenant_saml_config tsc
      JOIN tenants t ON tsc.tenant_id = t.id
      ORDER BY t.company_name
    `);

    return result.rows;
  }

  /**
   * Delete tenant SAML configuration
   */
  async deleteTenantSAMLConfig(tenantId) {
    await pool.query('DELETE FROM tenant_saml_config WHERE tenant_id = $1', [tenantId]);
  }

  /**
   * Test SAML configuration
   */
  async testSAMLConfig(config) {
    const results = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!config.idp_entity_id) {
      results.errors.push('IdP Entity ID is required');
      results.valid = false;
    }

    if (!config.idp_sso_url) {
      results.errors.push('IdP SSO URL is required');
      results.valid = false;
    }

    if (!config.idp_certificate) {
      results.errors.push('IdP Certificate is required');
      results.valid = false;
    } else {
      try {
        this.validateCertificate(config.idp_certificate);
      } catch (e) {
        results.errors.push(`Invalid IdP Certificate: ${e.message}`);
        results.valid = false;
      }
    }

    // Check SSO URL accessibility (optional)
    if (config.idp_sso_url) {
      try {
        const response = await fetch(config.idp_sso_url, { method: 'HEAD' });
        if (!response.ok) {
          results.warnings.push(`IdP SSO URL returned status ${response.status}`);
        }
      } catch (e) {
        results.warnings.push(`Cannot reach IdP SSO URL: ${e.message}`);
      }
    }

    // Check SP configuration
    if (!this.spPrivateKey) {
      results.warnings.push('SP private key not configured - request signing disabled');
    }

    if (!this.spCertificate) {
      results.warnings.push('SP certificate not configured');
    }

    return results;
  }
}

// Export singleton
const samlService = new SAMLService();
export default samlService;
