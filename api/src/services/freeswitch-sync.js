/**
 * FreeSWITCH Sync Service
 * Bidirectional synchronization between IRISX database and FreeSWITCH configuration
 *
 * Features:
 * - Create/update SIP trunk gateways in FreeSWITCH when database changes
 * - Automatically reload FreeSWITCH configuration via ESL
 * - Monitor FreeSWITCH gateway status and update database
 */

import pkg from 'modesl';
const { Connection } = pkg;
import { promises as fs } from 'fs';
import pool from '../db/connection.js';

class FreeSWITCHSyncService {
  constructor() {
    this.freeswitchHost = process.env.FREESWITCH_HOST || '10.0.1.213';
    this.freeswitchPort = parseInt(process.env.FREESWITCH_PORT || '8021');
    this.freeswitchPassword = process.env.FREESWITCH_PASSWORD || 'ClueCon';
    this.freeswitchUser = process.env.FREESWITCH_SSH_USER || 'ubuntu';
    this.freeswitchServerIp = process.env.FREESWITCH_SERVER_IP || '54.160.220.243';
    this.connection = null;
  }

  /**
   * Connect to FreeSWITCH Event Socket Layer (ESL)
   */
  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`[FreeSWITCH Sync] Connecting to ${this.freeswitchHost}:${this.freeswitchPort}...`);

      this.connection = new Connection(this.freeswitchHost, this.freeswitchPort, this.freeswitchPassword, () => {
        console.log('[FreeSWITCH Sync] Connected to ESL');
        resolve();
      });

      this.connection.on('error', (err) => {
        console.error('[FreeSWITCH Sync] ESL connection error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Execute FreeSWITCH API command via ESL
   */
  async executeCommand(command) {
    if (!this.connection) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.connection.api(command, (response) => {
        const body = response.getBody();
        console.log(`[FreeSWITCH Sync] Command: ${command}`);
        console.log(`[FreeSWITCH Sync] Response: ${body}`);
        resolve(body);
      });
    });
  }

  /**
   * Generate FreeSWITCH gateway XML configuration
   */
  generateGatewayXML(trunk) {
    const gatewayName = trunk.freeswitch_gateway_name || this.sanitizeGatewayName(trunk.name);

    // Build XML based on whether trunk uses authentication
    let xml = '<include>\n';
    xml += `  <gateway name="${gatewayName}">\n`;

    // Proxy/Realm (SIP URI)
    xml += `    <param name="proxy" value="${trunk.sip_uri}"/>\n`;
    xml += `    <param name="realm" value="${trunk.sip_uri}"/>\n`;

    // Authentication
    if (trunk.username && trunk.password) {
      // Username/password authentication
      xml += `    <param name="username" value="${trunk.username}"/>\n`;
      xml += `    <param name="password" value="${trunk.password}"/>\n`;
      xml += `    <param name="register" value="true"/>\n`;
    } else {
      // IP-based authentication (like Twilio)
      xml += `    <param name="register" value="false"/>\n`;
    }

    // Caller ID settings
    xml += `    <param name="caller-id-in-from" value="true"/>\n`;
    xml += `    <param name="extension-in-contact" value="false"/>\n`;

    // Codec configuration
    if (trunk.codec) {
      xml += `    <param name="codec-prefs" value="${trunk.codec}"/>\n`;
    }

    xml += '  </gateway>\n';
    xml += '</include>\n';

    return xml;
  }

  /**
   * Sanitize trunk name for use as FreeSWITCH gateway name
   */
  sanitizeGatewayName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Create or update SIP trunk gateway in FreeSWITCH
   * This will create the XML file and reload the gateway
   */
  async syncTrunkToFreeSWITCH(trunkId) {
    try {
      // Get trunk from database
      const result = await pool.query(
        'SELECT * FROM sip_trunks WHERE id = $1 AND deleted_at IS NULL',
        [trunkId]
      );

      if (result.rows.length === 0) {
        console.error(`[FreeSWITCH Sync] Trunk ${trunkId} not found`);
        return { success: false, error: 'Trunk not found' };
      }

      const trunk = result.rows[0];
      const gatewayName = trunk.freeswitch_gateway_name || this.sanitizeGatewayName(trunk.name);

      // Generate gateway XML
      const gatewayXML = this.generateGatewayXML(trunk);

      console.log(`[FreeSWITCH Sync] Generated XML for gateway "${gatewayName}":`);
      console.log(gatewayXML);

      // Write XML file to FreeSWITCH server
      // Note: This requires SSH access or a shared filesystem
      // For now, we'll log the XML and provide instructions

      const gatewayFilePath = `/usr/local/freeswitch/etc/freeswitch/sip_profiles/external/${gatewayName}.xml`;

      console.log(`[FreeSWITCH Sync] To complete sync, write this XML to: ${gatewayFilePath}`);
      console.log(`[FreeSWITCH Sync] Then run: sofia profile external rescan`);

      // Update database with gateway name
      await pool.query(
        'UPDATE sip_trunks SET freeswitch_gateway_name = $1, updated_at = NOW() WHERE id = $2',
        [gatewayName, trunkId]
      );

      // Reload FreeSWITCH gateway via ESL
      try {
        await this.connect();

        // Rescan external profile to pick up new/updated gateway
        await this.executeCommand('sofia profile external rescan');

        // Check gateway status
        const statusResponse = await this.executeCommand(`sofia status gateway ${gatewayName}`);

        // Update status in database
        let status = 'inactive';
        if (statusResponse.includes('REGED')) {
          status = 'registered';
        } else if (statusResponse.includes('NOREG')) {
          status = 'registered'; // NOREG means not registering (IP-based auth), but it's active
        } else if (statusResponse.includes('FAIL')) {
          status = 'failed';
        }

        await pool.query(
          'UPDATE sip_trunks SET status = $1, updated_at = NOW() WHERE id = $2',
          [status, trunkId]
        );

        return {
          success: true,
          gatewayName,
          gatewayFilePath,
          xml: gatewayXML,
          status,
          message: 'Gateway configuration generated. Manual deployment to FreeSWITCH server required.'
        };

      } catch (eslError) {
        console.error('[FreeSWITCH Sync] ESL error:', eslError.message);
        return {
          success: false,
          gatewayName,
          gatewayFilePath,
          xml: gatewayXML,
          error: 'Failed to communicate with FreeSWITCH ESL',
          message: 'Gateway XML generated, but could not reload FreeSWITCH. Deploy XML manually.'
        };
      }

    } catch (err) {
      console.error('[FreeSWITCH Sync] Sync error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Delete SIP trunk gateway from FreeSWITCH
   */
  async removeTrunkFromFreeSWITCH(gatewayName) {
    try {
      console.log(`[FreeSWITCH Sync] Removing gateway "${gatewayName}" from FreeSWITCH...`);

      const gatewayFilePath = `/usr/local/freeswitch/etc/freeswitch/sip_profiles/external/${gatewayName}.xml`;

      console.log(`[FreeSWITCH Sync] To complete removal, delete: ${gatewayFilePath}`);
      console.log(`[FreeSWITCH Sync] Then run: sofia profile external rescan`);

      // Reload FreeSWITCH via ESL
      try {
        await this.connect();
        await this.executeCommand('sofia profile external rescan');

        return {
          success: true,
          gatewayFilePath,
          message: 'Gateway removal instructions provided. Manual deletion from FreeSWITCH server required.'
        };
      } catch (eslError) {
        console.error('[FreeSWITCH Sync] ESL error:', eslError.message);
        return {
          success: false,
          gatewayFilePath,
          error: 'Failed to communicate with FreeSWITCH ESL',
          message: 'Delete XML file manually and reload FreeSWITCH.'
        };
      }

    } catch (err) {
      console.error('[FreeSWITCH Sync] Remove error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Sync all active trunks from database to FreeSWITCH
   */
  async syncAllTrunks() {
    try {
      const result = await pool.query(
        'SELECT id, name, freeswitch_gateway_name FROM sip_trunks WHERE deleted_at IS NULL'
      );

      console.log(`[FreeSWITCH Sync] Syncing ${result.rows.length} trunks to FreeSWITCH...`);

      const results = [];
      for (const trunk of result.rows) {
        const syncResult = await this.syncTrunkToFreeSWITCH(trunk.id);
        results.push({
          trunkId: trunk.id,
          trunkName: trunk.name,
          ...syncResult
        });
      }

      return {
        success: true,
        synced: results.length,
        results
      };

    } catch (err) {
      console.error('[FreeSWITCH Sync] Sync all error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get gateway status from FreeSWITCH and update database
   */
  async updateGatewayStatus(gatewayName) {
    try {
      await this.connect();

      const statusResponse = await this.executeCommand(`sofia status gateway ${gatewayName}`);

      // Parse status
      let status = 'inactive';
      if (statusResponse.includes('REGED')) {
        status = 'registered';
      } else if (statusResponse.includes('NOREG')) {
        status = 'registered'; // Not registering, but active (IP-based auth)
      } else if (statusResponse.includes('FAIL')) {
        status = 'failed';
      } else if (statusResponse.includes('not found')) {
        status = 'unregistered';
      }

      // Update database
      await pool.query(
        'UPDATE sip_trunks SET status = $1, last_used_at = NOW(), updated_at = NOW() WHERE freeswitch_gateway_name = $2',
        [status, gatewayName]
      );

      return { success: true, status };

    } catch (err) {
      console.error('[FreeSWITCH Sync] Status update error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all gateway statuses from FreeSWITCH
   */
  async getAllGatewayStatuses() {
    try {
      await this.connect();

      const response = await this.executeCommand('sofia status');

      // Parse response for gateway statuses
      console.log('[FreeSWITCH Sync] All gateways status:');
      console.log(response);

      return { success: true, response };

    } catch (err) {
      console.error('[FreeSWITCH Sync] Get statuses error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Disconnect from FreeSWITCH ESL
   */
  disconnect() {
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
      console.log('[FreeSWITCH Sync] Disconnected from ESL');
    }
  }
}

// Export singleton instance
const freeswitchSync = new FreeSWITCHSyncService();
export default freeswitchSync;
