import { query } from '../db/connection.js';

/**
 * DNC (Do Not Call/Contact) Enforcement Service
 *
 * Provides compliance checking against the DNC list before outbound
 * SMS messages and voice calls are initiated.
 *
 * Based on: IRIS_Compliance_Legal_Guide.md
 * - Federal DNC Registry compliance
 * - Internal DNC list management
 * - Multi-tenant isolation
 */
export class DNCService {
  constructor() {
    this.cache = new Map(); // In-memory cache for frequent lookups
    this.cacheTTL = 60000;  // 60 second cache TTL
    console.log('✓ DNC Enforcement Service initialized');
  }

  /**
   * Check if a phone number is on the DNC list for a tenant
   * @param {string|number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number to check (E.164 format)
   * @returns {Promise<{blocked: boolean, reason?: string, contactId?: number}>}
   */
  async checkDNC(tenantId, phoneNumber) {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
    const cacheKey = `${tenantId}:${normalizedNumber}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    try {
      // Check contacts table for DNC status
      const result = await query(
        `SELECT id, status, dnc_reason, dnc_added_at
         FROM contacts
         WHERE tenant_id = $1
         AND phone = $2
         AND (status = 'dnc' OR do_not_contact = true)
         LIMIT 1`,
        [tenantId, normalizedNumber]
      );

      let dncResult;

      if (result.rows.length > 0) {
        const contact = result.rows[0];
        dncResult = {
          blocked: true,
          reason: contact.dnc_reason || 'Contact is on DNC list',
          contactId: contact.id,
          addedAt: contact.dnc_added_at
        };
      } else {
        dncResult = {
          blocked: false
        };
      }

      // Cache the result
      this.cache.set(cacheKey, {
        result: dncResult,
        timestamp: Date.now()
      });

      return dncResult;

    } catch (error) {
      console.error('DNC check error:', error);
      // On error, fail open but log the issue
      // In strict compliance mode, you might want to fail closed instead
      return {
        blocked: false,
        warning: 'DNC check failed - proceeding with caution'
      };
    }
  }

  /**
   * Check multiple phone numbers against DNC list (batch operation)
   * @param {string|number} tenantId - Tenant ID
   * @param {string[]} phoneNumbers - Array of phone numbers
   * @returns {Promise<Map<string, {blocked: boolean, reason?: string}>>}
   */
  async checkDNCBatch(tenantId, phoneNumbers) {
    const normalizedNumbers = phoneNumbers.map(p => this.normalizePhoneNumber(p));
    const results = new Map();
    const uncachedNumbers = [];

    // Check cache first for each number
    for (const number of normalizedNumbers) {
      const cacheKey = `${tenantId}:${number}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        results.set(number, cached.result);
      } else {
        uncachedNumbers.push(number);
      }
    }

    // Query database for uncached numbers
    if (uncachedNumbers.length > 0) {
      try {
        const placeholders = uncachedNumbers.map((_, i) => `$${i + 2}`).join(', ');
        const dbResult = await query(
          `SELECT phone, id, status, dnc_reason, dnc_added_at
           FROM contacts
           WHERE tenant_id = $1
           AND phone IN (${placeholders})
           AND (status = 'dnc' OR do_not_contact = true)`,
          [tenantId, ...uncachedNumbers]
        );

        // Create a lookup map from DB results
        const dncContacts = new Map();
        for (const row of dbResult.rows) {
          dncContacts.set(row.phone, row);
        }

        // Process all uncached numbers
        for (const number of uncachedNumbers) {
          const contact = dncContacts.get(number);
          const dncResult = contact
            ? {
                blocked: true,
                reason: contact.dnc_reason || 'Contact is on DNC list',
                contactId: contact.id
              }
            : { blocked: false };

          results.set(number, dncResult);

          // Cache the result
          const cacheKey = `${tenantId}:${number}`;
          this.cache.set(cacheKey, {
            result: dncResult,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('DNC batch check error:', error);
        // On error, mark all uncached as not blocked but with warning
        for (const number of uncachedNumbers) {
          results.set(number, {
            blocked: false,
            warning: 'DNC check failed'
          });
        }
      }
    }

    return results;
  }

  /**
   * Add a phone number to the DNC list
   * @param {string|number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number to add
   * @param {string} reason - Reason for adding to DNC
   * @param {string} source - Source of DNC request (e.g., 'user_request', 'complaint', 'legal')
   */
  async addToDNC(tenantId, phoneNumber, reason = 'User requested removal', source = 'manual') {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

    try {
      // Check if contact exists
      const existing = await query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND phone = $2',
        [tenantId, normalizedNumber]
      );

      if (existing.rows.length > 0) {
        // Update existing contact to DNC status
        await query(
          `UPDATE contacts
           SET status = 'dnc',
               do_not_contact = true,
               dnc_reason = $3,
               dnc_source = $4,
               dnc_added_at = NOW(),
               updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [existing.rows[0].id, tenantId, reason, source]
        );
      } else {
        // Create new DNC entry as a contact
        await query(
          `INSERT INTO contacts (tenant_id, phone, status, do_not_contact, dnc_reason, dnc_source, dnc_added_at)
           VALUES ($1, $2, 'dnc', true, $3, $4, NOW())`,
          [tenantId, normalizedNumber, reason, source]
        );
      }

      // Log the DNC action for audit
      await this.logDNCAction(tenantId, normalizedNumber, 'add', reason, source);

      // Invalidate cache
      const cacheKey = `${tenantId}:${normalizedNumber}`;
      this.cache.delete(cacheKey);

      return { success: true, phoneNumber: normalizedNumber };

    } catch (error) {
      console.error('Add to DNC error:', error);
      throw error;
    }
  }

  /**
   * Remove a phone number from the DNC list
   * @param {string|number} tenantId - Tenant ID
   * @param {string} phoneNumber - Phone number to remove
   * @param {string} reason - Reason for removal
   */
  async removeFromDNC(tenantId, phoneNumber, reason = 'Manual removal') {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

    try {
      await query(
        `UPDATE contacts
         SET status = 'active',
             do_not_contact = false,
             dnc_removed_at = NOW(),
             dnc_removal_reason = $3,
             updated_at = NOW()
         WHERE tenant_id = $1 AND phone = $2`,
        [tenantId, normalizedNumber, reason]
      );

      // Log the DNC action for audit
      await this.logDNCAction(tenantId, normalizedNumber, 'remove', reason, 'manual');

      // Invalidate cache
      const cacheKey = `${tenantId}:${normalizedNumber}`;
      this.cache.delete(cacheKey);

      return { success: true, phoneNumber: normalizedNumber };

    } catch (error) {
      console.error('Remove from DNC error:', error);
      throw error;
    }
  }

  /**
   * Log DNC actions for compliance audit trail
   */
  async logDNCAction(tenantId, phoneNumber, action, reason, source) {
    try {
      await query(
        `INSERT INTO dnc_audit_log (tenant_id, phone_number, action, reason, source, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [tenantId, phoneNumber, action, reason, source]
      );
    } catch (error) {
      // Log to console if audit table doesn't exist yet
      console.log(`[DNC AUDIT] Tenant ${tenantId}: ${action} ${phoneNumber} - ${reason} (${source})`);
    }
  }

  /**
   * Get DNC statistics for a tenant
   */
  async getDNCStats(tenantId) {
    try {
      const result = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'dnc' OR do_not_contact = true) as total_dnc,
           COUNT(*) FILTER (WHERE dnc_added_at > NOW() - INTERVAL '24 hours') as added_24h,
           COUNT(*) FILTER (WHERE dnc_added_at > NOW() - INTERVAL '7 days') as added_7d,
           COUNT(*) FILTER (WHERE dnc_source = 'complaint') as from_complaints,
           COUNT(*) FILTER (WHERE dnc_source = 'user_request') as from_user_request
         FROM contacts
         WHERE tenant_id = $1`,
        [tenantId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Get DNC stats error:', error);
      return {
        total_dnc: 0,
        added_24h: 0,
        added_7d: 0,
        from_complaints: 0,
        from_user_request: 0
      };
    }
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';

    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // If it starts with 1 and is 11 digits, it's likely US/Canada
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return '+' + cleaned;
    }

    // If 10 digits, assume US/Canada and add +1
    if (cleaned.length === 10) {
      return '+1' + cleaned;
    }

    // Otherwise, ensure it starts with +
    return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  }

  /**
   * Clear the in-memory cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Clear cached entry for a specific tenant/number
   */
  invalidateCache(tenantId, phoneNumber) {
    const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
    const cacheKey = `${tenantId}:${normalizedNumber}`;
    this.cache.delete(cacheKey);
  }
}

// Export singleton instance
export const dncService = new DNCService();
export default DNCService;
