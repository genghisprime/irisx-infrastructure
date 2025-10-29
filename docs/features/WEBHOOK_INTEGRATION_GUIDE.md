# Webhook Integration Guide

**Status:** Ready for Integration
**Phase:** Phase 1, Week 9-10
**Date:** October 29, 2025

---

## Overview

This guide explains how to integrate the webhook notification system with existing services (calls, SMS, recordings, etc.) to trigger real-time event notifications to tenant endpoints.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Event Trigger Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Service Event → webhookService.triggerEvent() →            │
│  Database Record → Queue → HTTP Delivery →                  │
│  Retry Logic → Update Stats                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. FreeSWITCH Call Events

**File:** `src/services/freeswitch.js`

Add webhook triggers to event handlers:

```javascript
import webhookService from './webhook.js';

// In FreeSWITCH service event handlers:

// Call initiated
this.connection.on('call:created', async (data) => {
  const { uuid, direction, from, to, tenant_id } = data;

  // Existing database insert...

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId: tenant_id,
    eventType: 'call.initiated',
    eventId: uuid,
    payload: {
      call_sid: uuid,
      direction,
      from,
      to,
      status: 'initiated',
      timestamp: new Date().toISOString()
    }
  });
});

// Call answered
this.connection.on('call:answered', async (data) => {
  const { uuid, from, to, tenant_id } = data;

  // Existing status update...

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId: tenant_id,
    eventType: 'call.answered',
    eventId: uuid,
    payload: {
      call_sid: uuid,
      from,
      to,
      status: 'in-progress',
      answered_at: new Date().toISOString()
    }
  });
});

// Call completed
this.connection.on('call:hungup', async (data) => {
  const { uuid, cause, duration, tenant_id } = data;

  // Existing CDR update...

  // Get call details from database
  const callResult = await query(
    'SELECT * FROM calls WHERE call_sid = $1',
    [uuid]
  );

  const call = callResult.rows[0];

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId: tenant_id,
    eventType: 'call.completed',
    eventId: uuid,
    payload: {
      call_sid: uuid,
      from: call.from_number,
      to: call.to_number,
      direction: call.direction,
      status: 'completed',
      hangup_cause: cause,
      duration_seconds: duration,
      started_at: call.started_at,
      ended_at: new Date().toISOString()
    }
  });
});

// DTMF received
this.connection.on('call:dtmf', async (data) => {
  const { uuid, digit, tenant_id } = data;

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId: tenant_id,
    eventType: 'call.dtmf',
    eventId: `${uuid}_dtmf_${Date.now()}`,
    payload: {
      call_sid: uuid,
      digit,
      timestamp: new Date().toISOString()
    }
  });
});
```

---

### 2. Call Recording Events

**File:** `src/services/freeswitch.js` or recording service

Add webhook triggers when recordings complete:

```javascript
// After recording saved to S3
async onRecordingComplete(callSid, recordingUrl, tenantId) {
  // Existing database insert...

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId,
    eventType: 'call.recording.completed',
    eventId: `recording_${callSid}`,
    payload: {
      call_sid: callSid,
      recording_url: recordingUrl,
      duration_seconds: recordingDuration,
      size_bytes: fileSize,
      format: 'wav',
      created_at: new Date().toISOString()
    }
  });
}
```

---

### 3. SMS/MMS Events

**File:** `src/services/sms.js`

Add webhook triggers to SMS delivery flow:

```javascript
import webhookService from './webhook.js';

// After SMS sent successfully
async sendMessage(params) {
  const { tenantId, to, from, body, mediaUrls } = params;

  // Existing Twilio send...

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId,
    eventType: 'sms.sent',
    eventId: messageSid,
    payload: {
      message_sid: messageSid,
      from,
      to,
      body,
      media_urls: mediaUrls,
      direction: 'outbound',
      status: 'sent',
      segments: this.estimateSegments(body),
      timestamp: new Date().toISOString()
    }
  });
}

// Inbound SMS webhook handler
async handleInboundSMS(req) {
  const { MessageSid, From, To, Body, NumMedia } = req;

  // Get tenant from phone number
  const tenantResult = await query(
    'SELECT tenant_id FROM phone_numbers WHERE phone_number = $1',
    [To]
  );

  if (tenantResult.rows.length === 0) {
    console.error(`No tenant found for number ${To}`);
    return;
  }

  const tenantId = tenantResult.rows[0].tenant_id;

  // Existing database insert...

  // Trigger webhook
  await webhookService.triggerEvent({
    tenantId,
    eventType: 'sms.received',
    eventId: MessageSid,
    payload: {
      message_sid: MessageSid,
      from: From,
      to: To,
      body: Body,
      media_count: parseInt(NumMedia) || 0,
      direction: 'inbound',
      received_at: new Date().toISOString()
    }
  });
}

// SMS status callback handler
async handleStatusCallback(req) {
  const { MessageSid, MessageStatus, ErrorCode, tenantId } = req;

  // Existing status update...

  // Trigger webhook based on status
  let eventType;
  if (MessageStatus === 'delivered') {
    eventType = 'sms.delivered';
  } else if (['failed', 'undelivered'].includes(MessageStatus)) {
    eventType = 'sms.failed';
  } else {
    return; // Don't trigger for intermediate states
  }

  await webhookService.triggerEvent({
    tenantId,
    eventType,
    eventId: `${MessageSid}_status`,
    payload: {
      message_sid: MessageSid,
      status: MessageStatus,
      error_code: ErrorCode || null,
      timestamp: new Date().toISOString()
    }
  });
}
```

---

### 4. System Events

**File:** Various locations

Add webhook triggers for system-level events:

#### Tenant Limit Warnings

```javascript
// In usage metering service
async checkTenantLimits(tenantId) {
  const usage = await this.getUsageForMonth(tenantId);
  const limits = await this.getTenantLimits(tenantId);

  // Check if approaching limit (80%)
  if (usage.call_minutes >= limits.max_minutes * 0.8) {
    await webhookService.triggerEvent({
      tenantId,
      eventType: 'tenant.limit.warning',
      eventId: `limit_warning_${tenantId}_${Date.now()}`,
      payload: {
        resource: 'call_minutes',
        current: usage.call_minutes,
        limit: limits.max_minutes,
        percent_used: (usage.call_minutes / limits.max_minutes) * 100,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Check if limit reached
  if (usage.call_minutes >= limits.max_minutes) {
    await webhookService.triggerEvent({
      tenantId,
      eventType: 'tenant.limit.reached',
      eventId: `limit_reached_${tenantId}_${Date.now()}`,
      payload: {
        resource: 'call_minutes',
        current: usage.call_minutes,
        limit: limits.max_minutes,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

#### Phone Number Assignment

```javascript
// In phone number management
async assignPhoneNumber(tenantId, phoneNumber) {
  // Existing assignment logic...

  await webhookService.triggerEvent({
    tenantId,
    eventType: 'phone_number.assigned',
    eventId: `phone_${phoneNumber}_assigned`,
    payload: {
      phone_number: phoneNumber,
      assigned_at: new Date().toISOString()
    }
  });
}
```

---

## Webhook Payload Schemas

### Call Events

```json
{
  "event": "call.completed",
  "event_id": "uuid-here",
  "timestamp": "2025-10-29T12:00:00Z",
  "data": {
    "call_sid": "uuid-here",
    "from": "+15551234567",
    "to": "+15559876543",
    "direction": "outbound",
    "status": "completed",
    "hangup_cause": "NORMAL_CLEARING",
    "duration_seconds": 120,
    "started_at": "2025-10-29T11:58:00Z",
    "ended_at": "2025-10-29T12:00:00Z"
  }
}
```

### SMS Events

```json
{
  "event": "sms.received",
  "event_id": "SM1234567890abcdef",
  "timestamp": "2025-10-29T12:00:00Z",
  "data": {
    "message_sid": "SM1234567890abcdef",
    "from": "+15551234567",
    "to": "+15559876543",
    "body": "Hello from customer",
    "media_count": 0,
    "direction": "inbound",
    "received_at": "2025-10-29T12:00:00Z"
  }
}
```

---

## Security: HMAC Signature Verification

Tenants should verify webhook signatures to ensure authenticity:

### Node.js Example

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret, timestamp) {
  // Check timestamp (prevent replay attacks - reject if > 5 minutes old)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - parseInt(timestamp)) > 300) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')}`;

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

// In webhook endpoint
app.post('/webhooks/irisx', (req, res) => {
  const signature = req.headers['x-irisx-signature'];
  const timestamp = req.headers['x-irisx-timestamp'];
  const secret = process.env.IRISX_WEBHOOK_SECRET; // From webhook creation

  if (!verifyWebhookSignature(req.body, signature, secret, timestamp)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
  console.log('Webhook verified:', req.body);
  res.status(200).json({ received: true });
});
```

### Python Example

```python
import hmac
import hashlib
import time
import json

def verify_webhook_signature(payload, signature, secret, timestamp):
    # Check timestamp (prevent replay attacks)
    current_timestamp = int(time.time())
    if abs(current_timestamp - int(timestamp)) > 300:
        return False

    # Compute expected signature
    signed_payload = f"{timestamp}.{json.dumps(payload)}"
    expected_signature = f"sha256={hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()}"

    # Constant-time comparison
    return hmac.compare_digest(expected_signature, signature)
```

---

## Retry Logic

The webhook system automatically retries failed deliveries with exponential backoff:

**Retry Schedule:**
1. Immediate attempt
2. After 1 second
3. After 2 seconds
4. After 4 seconds
5. After 8 seconds
6. After 16 seconds (final attempt)

**Success Criteria:**
- HTTP status 2xx (200-299)

**Failure Criteria:**
- HTTP status 4xx/5xx
- Connection timeout (default: 10 seconds)
- Network errors

After max retries (default: 5), the delivery is marked as `failed` and can be manually retried via the API.

---

## Rate Limiting

Webhooks are rate limited per endpoint:

- **Per Minute:** 60 requests (default)
- **Per Hour:** 1000 requests (default)

Configurable per webhook in database.

---

## Monitoring

### Webhook Statistics

Available via API: `GET /v1/webhooks/:id`

```json
{
  "webhook": {
    "id": 1,
    "url": "https://example.com/webhooks",
    "total_deliveries": 1250,
    "successful_deliveries": 1200,
    "failed_deliveries": 50,
    "last_success_at": "2025-10-29T12:00:00Z",
    "last_failure_at": "2025-10-29T11:30:00Z"
  },
  "statistics": {
    "successful_deliveries": "1200",
    "failed_deliveries": "50",
    "pending_deliveries": "3",
    "avg_duration_ms": "245"
  }
}
```

### Delivery Logs

Available via API: `GET /v1/webhooks/:id/deliveries`

Shows individual delivery attempts with:
- Event type
- HTTP status code
- Response body
- Error messages
- Retry attempts
- Timing information

---

## Testing

### Test Webhook Endpoint

```bash
curl -X POST https://api.irisx.com/v1/webhooks/123/test \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

This sends a test event to verify webhook configuration.

### Webhook Testing Services

- **webhook.site** - Inspect webhook payloads
- **RequestBin** - Debug webhook delivery
- **ngrok** - Test local webhook endpoints

---

## Deployment Checklist

- [ ] Deploy webhook service (`src/services/webhook.js`)
- [ ] Deploy webhook routes (`src/routes/webhooks.js`)
- [ ] Run database migration (`004_create_webhook_tables.sql`)
- [ ] Integrate webhook triggers in FreeSWITCH service
- [ ] Integrate webhook triggers in SMS service
- [ ] Integrate webhook triggers in usage metering
- [ ] Update main index.js to mount webhook routes
- [ ] Test webhook creation via API
- [ ] Test webhook delivery with test endpoint
- [ ] Verify HMAC signature generation
- [ ] Test retry logic with failing endpoint
- [ ] Monitor webhook delivery performance

---

## Future Enhancements

1. **Queue Integration** - Move to NATS JetStream for delivery queue
2. **Batch Delivery** - Group multiple events into single request
3. **Webhook Templates** - Pre-configured webhook endpoints for common integrations
4. **Event Filtering** - Advanced filtering beyond event types
5. **Webhook Verification Challenge** - Endpoint verification like Twilio
6. **Delivery Analytics** - Detailed webhook performance metrics
7. **Webhook Marketplace** - Pre-built integrations (Zapier, Make, n8n)

---

**Document Version:** 1.0
**Last Updated:** October 29, 2025
**Related Files:**
- [src/services/webhook.js](../../IRISX/src/services/webhook.js)
- [src/routes/webhooks.js](../../IRISX/src/routes/webhooks.js)
- [database/migrations/004_create_webhook_tables.sql](../../database/migrations/004_create_webhook_tables.sql)
