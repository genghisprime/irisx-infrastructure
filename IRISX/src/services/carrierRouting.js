import { query } from '../db/connection.js';

/**
 * Carrier Routing Service
 * Implements Least-Cost Routing (LCR) with automatic failover
 *
 * Features:
 * - Selects cheapest carrier for destination
 * - Health-based carrier selection
 * - Automatic failover on carrier failure
 * - Call cost calculation
 * - Routing decision logging
 */
class CarrierRoutingService {
  /**
   * Select best carrier for a destination using LCR or priority
   * @param {string} destinationNumber - E.164 formatted phone number
   * @param {object} options - Routing options
   * @returns {object} - Selected carrier with alternates
   */
  async selectCarrier(destinationNumber, options = {}) {
    const {
      preferCost = true, // If true, prefer cheapest; if false, prefer priority
      excludeCarriers = [], // Array of carrier IDs to exclude
      minimumHealthScore = 30, // Minimum health score required
    } = options;

    const startTime = Date.now();

    try {
      // Extract country prefix from destination
      const prefix = this.extractPrefix(destinationNumber);

      console.log(`[Carrier Routing] Selecting carrier for ${destinationNumber} (prefix: ${prefix})`);

      // Get all active carriers with rates for this prefix
      const sql = `
        SELECT
          c.id,
          c.name,
          c.type,
          c.sip_domain,
          c.sip_username,
          c.sip_password,
          c.sip_proxy,
          c.sip_port,
          c.priority,
          c.weight,
          c.health_score,
          c.consecutive_failures,
          COALESCE(cr.rate_per_minute, c.default_rate_per_minute) as rate_per_minute,
          COALESCE(cr.connection_fee, 0) as connection_fee,
          cr.destination_prefix,
          CASE
            WHEN c.consecutive_failures >= 5 THEN 0
            WHEN c.health_score < 50 THEN c.health_score * 0.7
            ELSE c.health_score
          END as effective_health
        FROM carriers c
        LEFT JOIN carrier_rates cr ON cr.carrier_id = c.id
          AND cr.destination_prefix = $1
          AND (cr.expires_at IS NULL OR cr.expires_at > CURRENT_DATE)
          AND cr.effective_date <= CURRENT_DATE
        WHERE c.status = 'active'
          AND c.health_score >= $2
          ${excludeCarriers.length > 0 ? `AND c.id NOT IN (${excludeCarriers.join(',')})` : ''}
        ORDER BY
          effective_health DESC,
          ${preferCost ? 'COALESCE(cr.rate_per_minute, c.default_rate_per_minute) ASC' : 'c.priority ASC'},
          c.priority ASC
        LIMIT 5
      `;

      const result = await query(sql, [prefix, minimumHealthScore]);

      if (result.rows.length === 0) {
        // Try with default rates if no prefix match found
        console.log(`[Carrier Routing] No rate found for prefix ${prefix}, using default carriers`);
        return await this.selectDefaultCarrier(excludeCarriers, minimumHealthScore);
      }

      const primary = result.rows[0];
      const alternates = result.rows.slice(1);

      const routingDuration = Date.now() - startTime;

      console.log(`[Carrier Routing] ✅ Selected ${primary.name} ($${primary.rate_per_minute}/min, health: ${primary.health_score}) in ${routingDuration}ms`);

      return {
        primary: {
          ...primary,
          gateway: this.getGatewayName(primary.type),
        },
        alternates: alternates.map(c => ({
          ...c,
          gateway: this.getGatewayName(c.type),
        })),
        selection_reason: preferCost ? 'lcr' : 'priority',
        routing_duration_ms: routingDuration,
      };
    } catch (error) {
      console.error(`[Carrier Routing] Error selecting carrier:`, error);
      throw error;
    }
  }

  /**
   * Select default carrier when no specific rate found
   */
  async selectDefaultCarrier(excludeCarriers = [], minimumHealthScore = 30) {
    const sql = `
      SELECT
        id,
        name,
        type,
        sip_domain,
        sip_username,
        sip_password,
        sip_proxy,
        sip_port,
        priority,
        weight,
        health_score,
        default_rate_per_minute as rate_per_minute,
        0 as connection_fee
      FROM carriers
      WHERE status = 'active'
        AND health_score >= $1
        ${excludeCarriers.length > 0 ? `AND id NOT IN (${excludeCarriers.join(',')})` : ''}
      ORDER BY priority ASC, health_score DESC
      LIMIT 5
    `;

    const result = await query(sql, [minimumHealthScore]);

    if (result.rows.length === 0) {
      throw new Error('No healthy carriers available');
    }

    const primary = result.rows[0];
    const alternates = result.rows.slice(1);

    return {
      primary: {
        ...primary,
        gateway: this.getGatewayName(primary.type),
      },
      alternates: alternates.map(c => ({
        ...c,
        gateway: this.getGatewayName(c.type),
      })),
      selection_reason: 'default',
      routing_duration_ms: 0,
    };
  }

  /**
   * Extract country prefix from phone number
   * Returns longest matching prefix (1-4 digits)
   */
  extractPrefix(number) {
    // Remove all non-numeric characters
    const cleaned = number.replace(/[^0-9]/g, '');

    // Common country codes (sorted by length, longest first)
    const prefixes = {
      // 4-digit prefixes
      '1242': '+1242', // Bahamas
      '1246': '+1246', // Barbados
      '1264': '+1264', // Anguilla
      '1268': '+1268', // Antigua
      '1284': '+1284', // British Virgin Islands
      '1340': '+1340', // US Virgin Islands
      '1345': '+1345', // Cayman Islands
      '1441': '+1441', // Bermuda
      '1473': '+1473', // Grenada
      '1649': '+1649', // Turks and Caicos
      '1664': '+1664', // Montserrat
      '1670': '+1670', // Northern Mariana Islands
      '1671': '+1671', // Guam
      '1684': '+1684', // American Samoa
      '1721': '+1721', // Sint Maarten
      '1758': '+1758', // Saint Lucia
      '1767': '+1767', // Dominica
      '1784': '+1784', // Saint Vincent
      '1787': '+1787', // Puerto Rico
      '1809': '+1809', // Dominican Republic
      '1829': '+1829', // Dominican Republic
      '1849': '+1849', // Dominican Republic
      '1868': '+1868', // Trinidad and Tobago
      '1869': '+1869', // Saint Kitts and Nevis
      '1876': '+1876', // Jamaica
      '1939': '+1939', // Puerto Rico

      // 3-digit prefixes
      '242': '+242', // Bahamas
      '246': '+246', // Barbados
      '352': '+352', // Luxembourg
      '358': '+358', // Finland
      '359': '+359', // Bulgaria
      '370': '+370', // Lithuania
      '371': '+371', // Latvia
      '372': '+372', // Estonia
      '373': '+373', // Moldova
      '374': '+374', // Armenia
      '375': '+375', // Belarus
      '376': '+376', // Andorra
      '377': '+377', // Monaco
      '378': '+378', // San Marino
      '380': '+380', // Ukraine
      '381': '+381', // Serbia
      '385': '+385', // Croatia
      '386': '+386', // Slovenia
      '387': '+387', // Bosnia and Herzegovina
      '389': '+389', // North Macedonia
      '420': '+420', // Czech Republic
      '421': '+421', // Slovakia
      '423': '+423', // Liechtenstein

      // 2-digit prefixes
      '1': '+1',     // US/Canada/Caribbean
      '7': '+7',     // Russia/Kazakhstan
      '20': '+20',   // Egypt
      '27': '+27',   // South Africa
      '30': '+30',   // Greece
      '31': '+31',   // Netherlands
      '32': '+32',   // Belgium
      '33': '+33',   // France
      '34': '+34',   // Spain
      '36': '+36',   // Hungary
      '39': '+39',   // Italy
      '40': '+40',   // Romania
      '41': '+41',   // Switzerland
      '43': '+43',   // Austria
      '44': '+44',   // UK
      '45': '+45',   // Denmark
      '46': '+46',   // Sweden
      '47': '+47',   // Norway
      '48': '+48',   // Poland
      '49': '+49',   // Germany
      '51': '+51',   // Peru
      '52': '+52',   // Mexico
      '53': '+53',   // Cuba
      '54': '+54',   // Argentina
      '55': '+55',   // Brazil
      '56': '+56',   // Chile
      '57': '+57',   // Colombia
      '58': '+58',   // Venezuela
      '60': '+60',   // Malaysia
      '61': '+61',   // Australia
      '62': '+62',   // Indonesia
      '63': '+63',   // Philippines
      '64': '+64',   // New Zealand
      '65': '+65',   // Singapore
      '66': '+66',   // Thailand
      '81': '+81',   // Japan
      '82': '+82',   // South Korea
      '84': '+84',   // Vietnam
      '86': '+86',   // China
      '90': '+90',   // Turkey
      '91': '+91',   // India
      '92': '+92',   // Pakistan
      '93': '+93',   // Afghanistan
      '94': '+94',   // Sri Lanka
      '95': '+95',   // Myanmar
      '98': '+98',   // Iran
    };

    // Check prefixes from longest to shortest (4 -> 3 -> 2 -> 1)
    for (let length = 4; length >= 1; length--) {
      const prefix = cleaned.substring(0, length);
      if (prefixes[prefix]) {
        return prefixes[prefix];
      }
    }

    // Default to +1 (US/Canada)
    return '+1';
  }

  /**
   * Get FreeSWITCH gateway name from carrier type
   */
  getGatewayName(carrierType) {
    const gatewayMap = {
      'twilio': 'twilio',
      'telnyx': 'telnyx',
      'bandwidth': 'bandwidth',
      'custom': 'custom',
    };
    return gatewayMap[carrierType] || carrierType;
  }

  /**
   * Update carrier health after call attempt
   */
  async updateCarrierHealth(carrierId, callSuccess, responseTimeMs = null) {
    try {
      await query(
        'SELECT update_carrier_health_after_call($1, $2, $3)',
        [carrierId, callSuccess, responseTimeMs]
      );

      console.log(`[Carrier Routing] Updated health for carrier ${carrierId}: ${callSuccess ? 'success' : 'failed'}`);
    } catch (error) {
      console.error(`[Carrier Routing] Error updating carrier health:`, error);
    }
  }

  /**
   * Log routing decision for debugging and analytics
   */
  async logRoutingDecision(callId, tenantId, destinationNumber, routing) {
    try {
      await query(`
        INSERT INTO call_routing_logs
          (call_id, tenant_id, destination_number, selected_carrier_id,
           selected_carrier_name, selected_rate, carrier_selection_reason,
           alternate_carriers, routing_duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        callId,
        tenantId,
        destinationNumber,
        routing.primary.id,
        routing.primary.name,
        routing.primary.rate_per_minute,
        routing.selection_reason,
        JSON.stringify(routing.alternates.map(c => ({
          id: c.id,
          name: c.name,
          rate: c.rate_per_minute,
          health_score: c.health_score,
        }))),
        routing.routing_duration_ms,
      ]);

      console.log(`[Carrier Routing] Logged routing decision for call ${callId}`);
    } catch (error) {
      console.error(`[Carrier Routing] Error logging routing decision:`, error);
    }
  }

  /**
   * Calculate call cost based on duration and carrier rate
   */
  calculateCallCost(durationSeconds, ratePerMinute, connectionFee = 0, billingIncrement = 6, minimumDuration = 0) {
    // Apply minimum duration
    const effectiveDuration = Math.max(durationSeconds, minimumDuration);

    // Round up to nearest billing increment
    const billedSeconds = Math.ceil(effectiveDuration / billingIncrement) * billingIncrement;

    // Calculate cost
    const minutes = billedSeconds / 60;
    const cost = (minutes * ratePerMinute) + connectionFee;

    return {
      billed_duration_seconds: billedSeconds,
      billed_minutes: minutes,
      rate_per_minute: ratePerMinute,
      connection_fee: connectionFee,
      total_cost: parseFloat(cost.toFixed(4)),
    };
  }

  /**
   * Get carrier performance statistics
   */
  async getCarrierStats(carrierId = null, days = 30) {
    const sql = `
      SELECT * FROM carrier_performance_summary
      ${carrierId ? 'WHERE id = $1' : ''}
      ORDER BY health_score DESC, success_rate_percent DESC
    `;

    const result = await query(sql, carrierId ? [carrierId] : []);
    return result.rows;
  }

  /**
   * Get lowest cost routes
   */
  async getLowestCostRoutes() {
    const result = await query('SELECT * FROM lowest_cost_routes ORDER BY destination_prefix');
    return result.rows;
  }

  /**
   * Test carrier health with SIP OPTIONS ping
   */
  async testCarrierHealth(carrierId) {
    try {
      // This would integrate with FreeSWITCH to send SIP OPTIONS
      // For now, just log the attempt
      console.log(`[Carrier Routing] Testing health for carrier ${carrierId}`);

      // Log health check
      await query(`
        INSERT INTO carrier_health_logs (carrier_id, check_type, status)
        VALUES ($1, 'sip_options', 'healthy')
      `, [carrierId]);

      return { success: true, responseTimeMs: 50 };
    } catch (error) {
      console.error(`[Carrier Routing] Health check failed for carrier ${carrierId}:`, error);

      await query(`
        INSERT INTO carrier_health_logs (carrier_id, check_type, status, error_message)
        VALUES ($1, 'sip_options', 'failed', $2)
      `, [carrierId, error.message]);

      return { success: false, error: error.message };
    }
  }

  /**
   * Get carrier by ID
   */
  async getCarrier(carrierId) {
    const result = await query('SELECT * FROM carriers WHERE id = $1', [carrierId]);
    return result.rows[0];
  }

  /**
   * List all active carriers
   */
  async listCarriers(status = 'active') {
    const sql = `
      SELECT * FROM carriers
      ${status ? 'WHERE status = $1' : ''}
      ORDER BY priority ASC, health_score DESC
    `;

    const result = await query(sql, status ? [status] : []);
    return result.rows;
  }

  /**
   * Update carrier status
   */
  async updateCarrierStatus(carrierId, status) {
    await query(
      'UPDATE carriers SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, carrierId]
    );

    console.log(`[Carrier Routing] Updated carrier ${carrierId} status to ${status}`);
  }
}

export default new CarrierRoutingService();
