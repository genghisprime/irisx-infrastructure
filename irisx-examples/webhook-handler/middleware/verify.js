/**
 * Webhook Signature Verification Middleware
 *
 * Verifies HMAC-SHA256 signatures from IRISX webhooks
 * to ensure requests are authentic and haven't been tampered with.
 */

import crypto from 'crypto';

/**
 * Verify webhook signature
 * Compares HMAC signature in header with calculated signature
 */
function verifySignature(req, res, next) {
  try {
    // Skip verification in development if disabled
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_SIGNATURE_VERIFICATION === 'true') {
      console.log('⚠️  Signature verification skipped (development mode)');
      return next();
    }

    const signature = req.headers['x-irisx-signature'] || req.headers['x-irisx-signature-256'];
    const timestamp = req.headers['x-irisx-timestamp'];
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // Check if signature exists
    if (!signature) {
      console.error('❌ Missing signature header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing signature header'
      });
    }

    // Check if webhook secret is configured
    if (!webhookSecret) {
      console.error('❌ WEBHOOK_SECRET not configured');
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Webhook secret not configured'
      });
    }

    // Get raw body (must use raw body for signature verification)
    const payload = JSON.stringify(req.body);

    // Calculate expected signature
    let expectedSignature;

    if (timestamp) {
      // Signature includes timestamp (recommended)
      const signedPayload = `${timestamp}.${payload}`;
      expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');
    } else {
      // Signature without timestamp (legacy)
      expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
    }

    // Compare signatures
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.error('❌ Invalid signature');
      console.error(`   Expected: ${expectedSignature}`);
      console.error(`   Received: ${signature}`);

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature'
      });
    }

    // Verify timestamp to prevent replay attacks
    if (timestamp) {
      const currentTime = Math.floor(Date.now() / 1000);
      const webhookTime = parseInt(timestamp);
      const timeDifference = Math.abs(currentTime - webhookTime);

      // Reject webhooks older than 5 minutes
      const MAX_AGE = 300; // 5 minutes

      if (timeDifference > MAX_AGE) {
        console.error(`❌ Webhook too old: ${timeDifference}s`);

        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Webhook timestamp too old'
        });
      }
    }

    // Signature is valid
    console.log('✅ Signature verified');
    next();
  } catch (error) {
    console.error('❌ Signature verification error:', error);

    res.status(500).json({
      error: 'Verification Error',
      message: 'Failed to verify signature'
    });
  }
}

/**
 * Generate signature for testing
 * Use this to generate test signatures for development
 */
export function generateSignature(payload, secret, timestamp = null) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (timestamp) {
    const signedPayload = `${timestamp}.${payloadString}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
  } else {
    return crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }
}

export default verifySignature;
