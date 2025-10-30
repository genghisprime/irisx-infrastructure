/**
 * IRISX Simple Outbound Call Example
 *
 * This example demonstrates how to make a simple outbound call
 * using the IRISX API with proper error handling.
 *
 * Features:
 * - Basic outbound call initiation
 * - Error handling with detailed logging
 * - Call status monitoring
 * - Timeout handling
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// IRISX API configuration
const IRISX_API_URL = process.env.IRISX_API_URL || 'https://api.irisx.io';
const IRISX_API_KEY = process.env.IRISX_API_KEY;
const TENANT_ID = process.env.IRISX_TENANT_ID;

// Validate required environment variables
if (!IRISX_API_KEY) {
  console.error('Error: IRISX_API_KEY is required');
  process.exit(1);
}

if (!TENANT_ID) {
  console.error('Error: IRISX_TENANT_ID is required');
  process.exit(1);
}

/**
 * Create an axios instance with IRISX API configuration
 */
const irisxClient = axios.create({
  baseURL: IRISX_API_URL,
  headers: {
    'Authorization': `Bearer ${IRISX_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 second timeout
});

/**
 * Make an outbound call
 * @param {string} fromNumber - The caller ID number (must be owned by your tenant)
 * @param {string} toNumber - The destination phone number
 * @param {object} options - Additional call options
 * @returns {Promise<object>} - Call details
 */
async function makeCall(fromNumber, toNumber, options = {}) {
  try {
    console.log(`\n📞 Initiating call from ${fromNumber} to ${toNumber}...`);

    const callData = {
      tenant_id: parseInt(TENANT_ID),
      from_number: fromNumber,
      to_number: toNumber,
      caller_id: options.callerId || fromNumber,
      timeout_seconds: options.timeout || 60,
      record: options.record || false,
      metadata: options.metadata || {}
    };

    // Make API request to create call
    const response = await irisxClient.post('/v1/calls', callData);

    if (response.data.success) {
      const call = response.data.data;
      console.log('✅ Call initiated successfully!');
      console.log(`   Call UUID: ${call.uuid}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Carrier: ${response.data.routing?.primary?.name || 'Unknown'}`);
      console.log(`   Rate: $${response.data.routing?.primary?.rate_per_minute || '0'}/min`);

      return call;
    } else {
      throw new Error(response.data.error || 'Failed to create call');
    }
  } catch (error) {
    handleCallError(error);
    throw error;
  }
}

/**
 * Get call status by UUID
 * @param {string} callUuid - The call UUID
 * @returns {Promise<object>} - Call details with current status
 */
async function getCallStatus(callUuid) {
  try {
    const response = await irisxClient.get(`/v1/calls/${callUuid}`);

    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.error || 'Failed to get call status');
    }
  } catch (error) {
    handleCallError(error);
    throw error;
  }
}

/**
 * Monitor call status until completion
 * @param {string} callUuid - The call UUID to monitor
 * @param {number} maxAttempts - Maximum polling attempts
 * @param {number} intervalMs - Polling interval in milliseconds
 */
async function monitorCall(callUuid, maxAttempts = 60, intervalMs = 5000) {
  console.log(`\n👀 Monitoring call ${callUuid}...`);

  let attempts = 0;
  const completedStatuses = ['completed', 'failed', 'no-answer', 'busy', 'cancelled'];

  while (attempts < maxAttempts) {
    try {
      const call = await getCallStatus(callUuid);
      console.log(`   [${new Date().toLocaleTimeString()}] Status: ${call.status}`);

      // Check if call has completed
      if (completedStatuses.includes(call.status)) {
        console.log('\n📊 Call Summary:');
        console.log(`   Final Status: ${call.status}`);
        console.log(`   Duration: ${call.duration_seconds || 0} seconds`);
        console.log(`   Total Cost: $${call.total_cost || '0.00'}`);

        if (call.hangup_cause) {
          console.log(`   Hangup Cause: ${call.hangup_cause}`);
        }

        return call;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      attempts++;
    } catch (error) {
      console.error('   Error monitoring call:', error.message);
      break;
    }
  }

  console.log('\n⏰ Monitoring timeout reached');
}

/**
 * Handle and log call errors
 * @param {Error} error - The error object
 */
function handleCallError(error) {
  console.error('\n❌ Call Error:');

  if (error.response) {
    // API returned an error response
    console.error(`   Status: ${error.response.status}`);
    console.error(`   Message: ${error.response.data?.error || error.message}`);

    if (error.response.data?.details) {
      console.error(`   Details:`, error.response.data.details);
    }
  } else if (error.request) {
    // Request made but no response received
    console.error('   No response received from API');
    console.error(`   Message: ${error.message}`);
  } else {
    // Error in request setup
    console.error(`   Message: ${error.message}`);
  }
}

/**
 * Example usage
 */
async function main() {
  try {
    // Example: Make a simple call
    const fromNumber = process.env.FROM_NUMBER || '+15551234567';
    const toNumber = process.env.TO_NUMBER || '+15559876543';

    console.log('🚀 IRISX Simple Call Example');
    console.log('================================\n');

    // Make the call
    const call = await makeCall(fromNumber, toNumber, {
      timeout: 60,
      record: true,
      metadata: {
        campaign: 'demo',
        customer_id: '12345'
      }
    });

    // Monitor call status (optional)
    if (call && call.uuid) {
      await monitorCall(call.uuid);
    }

    console.log('\n✅ Example completed successfully!');
  } catch (error) {
    console.error('\n❌ Example failed');
    process.exit(1);
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export functions for use as a module
export { makeCall, getCallStatus, monitorCall };
