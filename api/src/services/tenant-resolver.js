import { query } from '../db/connection.js';

/**
 * Tenant Resolver Service
 * Identifies which tenant a call belongs to based on phone numbers
 */
export class TenantResolverService {
  constructor() {
    this.phoneNumberCache = new Map(); // DID -> tenant_id cache
    this.cacheTTL = 300000; // 5 minutes
  }

  /**
   * Resolve tenant from inbound call
   * Looks up which tenant owns the destination phone number (DID)
   */
  async resolveTenantFromInboundCall(destinationNumber) {
    try {
      // Check cache first
      const cached = this.phoneNumberCache.get(destinationNumber);
      if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
        console.log(`📋 Tenant resolved from cache: ${cached.tenantId} for ${destinationNumber}`);
        return cached.tenantId;
      }

      // Query database for phone number ownership
      const result = await query(
        'SELECT tenant_id, id FROM phone_numbers WHERE phone_number = $1 AND status = $2',
        [destinationNumber, 'active']
      );

      if (result.rows.length === 0) {
        console.warn(`⚠️ No tenant found for inbound number: ${destinationNumber}`);
        return null;
      }

      const tenantId = result.rows[0].tenant_id;
      
      // Cache the result
      this.phoneNumberCache.set(destinationNumber, {
        tenantId,
        timestamp: Date.now()
      });

      console.log(`✅ Tenant resolved: ${tenantId} for ${destinationNumber}`);
      return tenantId;
    } catch (error) {
      console.error('Failed to resolve tenant:', error);
      return null;
    }
  }

  /**
   * Resolve tenant from outbound call
   * Already have tenant_id in call variables from API
   */
  async resolveTenantFromOutboundCall(callUUID) {
    try {
      const result = await query(
        'SELECT tenant_id FROM calls WHERE uuid = $1',
        [callUUID]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].tenant_id;
    } catch (error) {
      console.error('Failed to resolve tenant from call:', error);
      return null;
    }
  }

  /**
   * Get tenant configuration
   */
  async getTenantConfig(tenantId) {
    try {
      const result = await query(
        'SELECT * FROM tenants WHERE id = $1 AND status = $2',
        [tenantId, 'active']
      );

      if (result.rows.length === 0) {
        return null;
      }

      const tenant = result.rows[0];
      
      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        settings: tenant.settings || {},
        defaultIVRMenuId: tenant.settings?.default_ivr_menu_id,
        maxConcurrentCalls: tenant.settings?.max_concurrent_calls || 10,
        recordingEnabled: tenant.settings?.recording_enabled !== false,
        customGreeting: tenant.settings?.custom_greeting
      };
    } catch (error) {
      console.error('Failed to get tenant config:', error);
      return null;
    }
  }

  /**
   * Get default IVR menu for tenant
   */
  async getDefaultIVRMenu(tenantId) {
    try {
      // First try tenant settings
      const tenantConfig = await this.getTenantConfig(tenantId);
      if (tenantConfig?.defaultIVRMenuId) {
        return tenantConfig.defaultIVRMenuId;
      }

      // Otherwise get first active menu
      const result = await query(
        'SELECT id FROM ivr_menus WHERE tenant_id = $1 AND status = $2 ORDER BY created_at ASC LIMIT 1',
        [tenantId, 'active']
      );

      if (result.rows.length === 0) {
        console.warn(`⚠️ No IVR menu found for tenant ${tenantId}`);
        return null;
      }

      return result.rows[0].id;
    } catch (error) {
      console.error('Failed to get default IVR menu:', error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.phoneNumberCache.clear();
    console.log('📋 Tenant resolver cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.phoneNumberCache.size,
      entries: Array.from(this.phoneNumberCache.entries()).map(([number, data]) => ({
        number,
        tenantId: data.tenantId,
        age: Date.now() - data.timestamp
      }))
    };
  }
}

export default TenantResolverService;
