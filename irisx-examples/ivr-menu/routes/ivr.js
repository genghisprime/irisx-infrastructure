/**
 * IVR Menu Routes and Logic
 *
 * Handles incoming call webhooks from IRISX and provides
 * IVR menu responses with DTMF navigation.
 */

import express from 'express';
const router = express.Router();

// IVR Menu Configuration
const IVR_MENUS = {
  // Main menu
  main: {
    id: 'main',
    message: 'Welcome to IRISX Demo. Press 1 for Sales, Press 2 for Support, Press 3 for Billing, or Press 0 for the operator.',
    options: {
      '1': { action: 'menu', target: 'sales' },
      '2': { action: 'menu', target: 'support' },
      '3': { action: 'menu', target: 'billing' },
      '0': { action: 'transfer', target: '+15551234567' }
    },
    invalidMessage: 'Invalid selection. Please try again.',
    maxRetries: 3
  },

  // Sales menu
  sales: {
    id: 'sales',
    message: 'You have reached Sales. Press 1 for New Customers, Press 2 for Existing Customers, or Press 9 to return to the main menu.',
    options: {
      '1': { action: 'transfer', target: '+15551111111', department: 'Sales - New Customers' },
      '2': { action: 'transfer', target: '+15552222222', department: 'Sales - Existing Customers' },
      '9': { action: 'menu', target: 'main' }
    },
    invalidMessage: 'Invalid selection. Please press 1, 2, or 9.',
    maxRetries: 3
  },

  // Support menu
  support: {
    id: 'support',
    message: 'You have reached Technical Support. Press 1 for Account Issues, Press 2 for Technical Problems, Press 3 for API Support, or Press 9 to return to the main menu.',
    options: {
      '1': { action: 'transfer', target: '+15553333333', department: 'Support - Account Issues' },
      '2': { action: 'transfer', target: '+15554444444', department: 'Support - Technical' },
      '3': { action: 'transfer', target: '+15555555555', department: 'Support - API' },
      '9': { action: 'menu', target: 'main' }
    },
    invalidMessage: 'Invalid selection. Please press 1, 2, 3, or 9.',
    maxRetries: 3
  },

  // Billing menu
  billing: {
    id: 'billing',
    message: 'You have reached Billing. Press 1 for Payment Information, Press 2 for Invoice Questions, Press 3 to speak with a billing representative, or Press 9 to return to the main menu.',
    options: {
      '1': { action: 'play', target: 'billing_payment_info.mp3' },
      '2': { action: 'transfer', target: '+15556666666', department: 'Billing - Invoices' },
      '3': { action: 'transfer', target: '+15557777777', department: 'Billing - Representative' },
      '9': { action: 'menu', target: 'main' }
    },
    invalidMessage: 'Invalid selection. Please press 1, 2, 3, or 9.',
    maxRetries: 3
  }
};

/**
 * Main IVR webhook endpoint
 * Called by IRISX when a call arrives
 */
router.post('/webhook', async (req, res) => {
  try {
    const { call_uuid, event, digits, menu_id, retry_count = 0 } = req.body;

    console.log(`📞 IVR Webhook: ${event} | Call: ${call_uuid} | Menu: ${menu_id || 'main'} | Digits: ${digits || 'none'}`);

    // Determine current menu
    const currentMenuId = menu_id || 'main';
    const currentMenu = IVR_MENUS[currentMenuId];

    if (!currentMenu) {
      console.error(`❌ Invalid menu: ${currentMenuId}`);
      return res.json(buildErrorResponse(call_uuid));
    }

    // Handle different events
    switch (event) {
      case 'call.answered':
        // Call just answered, play main menu
        return res.json(buildMenuResponse(currentMenu, call_uuid));

      case 'dtmf.received':
        // User pressed a key
        return res.json(handleDTMFInput(currentMenu, digits, call_uuid, retry_count));

      case 'playback.complete':
        // Audio finished playing, collect input
        return res.json(collectDTMF(currentMenu, call_uuid));

      default:
        console.log(`ℹ️  Unhandled event: ${event}`);
        return res.json({ status: 'ok' });
    }
  } catch (error) {
    console.error('❌ IVR webhook error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Build initial menu response with TTS
 */
function buildMenuResponse(menu, callUuid) {
  return {
    actions: [
      {
        action: 'say',
        text: menu.message,
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'gather',
        numDigits: 1,
        timeout: 5,
        finishOnKey: '#',
        action_url: `${process.env.BASE_URL || 'http://localhost:3000'}/ivr/webhook`,
        method: 'POST'
      }
    ],
    metadata: {
      menu_id: menu.id,
      call_uuid: callUuid
    }
  };
}

/**
 * Handle DTMF input from user
 */
function handleDTMFInput(menu, digits, callUuid, retryCount) {
  const option = menu.options[digits];

  if (!option) {
    // Invalid input
    console.log(`⚠️  Invalid input: ${digits} for menu ${menu.id}`);

    if (retryCount >= menu.maxRetries) {
      // Max retries reached, transfer to operator
      console.log(`⚠️  Max retries reached, transferring to operator`);
      return buildTransferResponse('+15551234567', 'Operator', callUuid);
    }

    // Play error message and retry
    return {
      actions: [
        {
          action: 'say',
          text: menu.invalidMessage,
          voice: 'alloy',
          language: 'en-US'
        },
        {
          action: 'say',
          text: menu.message,
          voice: 'alloy',
          language: 'en-US'
        },
        {
          action: 'gather',
          numDigits: 1,
          timeout: 5,
          finishOnKey: '#',
          action_url: `${process.env.BASE_URL || 'http://localhost:3000'}/ivr/webhook`,
          method: 'POST'
        }
      ],
      metadata: {
        menu_id: menu.id,
        call_uuid: callUuid,
        retry_count: retryCount + 1
      }
    };
  }

  // Valid input, execute action
  console.log(`✅ Valid input: ${digits} -> ${option.action} ${option.target}`);

  switch (option.action) {
    case 'menu':
      // Navigate to another menu
      const nextMenu = IVR_MENUS[option.target];
      return buildMenuResponse(nextMenu, callUuid);

    case 'transfer':
      // Transfer call to phone number
      return buildTransferResponse(option.target, option.department, callUuid);

    case 'play':
      // Play audio file
      return buildPlayResponse(option.target, menu.id, callUuid);

    case 'hangup':
      // End call
      return buildHangupResponse(callUuid);

    default:
      console.error(`❌ Unknown action: ${option.action}`);
      return buildErrorResponse(callUuid);
  }
}

/**
 * Collect DTMF input after playback
 */
function collectDTMF(menu, callUuid) {
  return {
    actions: [
      {
        action: 'gather',
        numDigits: 1,
        timeout: 5,
        finishOnKey: '#',
        action_url: `${process.env.BASE_URL || 'http://localhost:3000'}/ivr/webhook`,
        method: 'POST'
      }
    ],
    metadata: {
      menu_id: menu.id,
      call_uuid: callUuid
    }
  };
}

/**
 * Build transfer response
 */
function buildTransferResponse(phoneNumber, department, callUuid) {
  return {
    actions: [
      {
        action: 'say',
        text: `Please hold while we transfer you to ${department || 'the requested department'}.`,
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'dial',
        number: phoneNumber,
        timeout: 30,
        callerId: process.env.CALLER_ID || '+15551234567'
      }
    ],
    metadata: {
      call_uuid: callUuid,
      transfer_to: phoneNumber,
      department: department
    }
  };
}

/**
 * Build audio playback response
 */
function buildPlayResponse(audioFile, menuId, callUuid) {
  return {
    actions: [
      {
        action: 'play',
        url: `${process.env.BASE_URL || 'http://localhost:3000'}/audio/${audioFile}`
      }
    ],
    metadata: {
      menu_id: menuId,
      call_uuid: callUuid
    }
  };
}

/**
 * Build hangup response
 */
function buildHangupResponse(callUuid) {
  return {
    actions: [
      {
        action: 'say',
        text: 'Thank you for calling. Goodbye.',
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'hangup'
      }
    ],
    metadata: {
      call_uuid: callUuid
    }
  };
}

/**
 * Build error response
 */
function buildErrorResponse(callUuid) {
  return {
    actions: [
      {
        action: 'say',
        text: 'We are experiencing technical difficulties. Please try again later. Goodbye.',
        voice: 'alloy',
        language: 'en-US'
      },
      {
        action: 'hangup'
      }
    ],
    metadata: {
      call_uuid: callUuid,
      error: true
    }
  };
}

/**
 * Get IVR statistics
 */
router.get('/stats', (req, res) => {
  // In production, this would query a database
  res.json({
    total_calls: 0,
    menus: Object.keys(IVR_MENUS),
    message: 'Statistics endpoint - implement database tracking in production'
  });
});

/**
 * Get menu configuration (for admin/debugging)
 */
router.get('/menus', (req, res) => {
  const menuSummary = Object.entries(IVR_MENUS).map(([id, menu]) => ({
    id,
    message: menu.message,
    options: Object.keys(menu.options)
  }));

  res.json({ menus: menuSummary });
});

export default router;
