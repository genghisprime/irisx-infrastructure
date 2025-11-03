# Usage Tracking Integration Guide

**Status:** Feature 3 Complete - Usage tracking backend ready
**Created:** Week 24 - November 2025

---

## Overview

The IRISX platform includes a comprehensive usage tracking and billing system that automatically records API usage across all communication channels (voice, SMS, email, WhatsApp, social media) and calculates costs in real-time.

## Architecture

### Components

1. **Database Layer** (`025_usage_billing.sql`)
   - `usage_records`: Records every API usage event
   - `usage_summaries`: Pre-aggregated daily summaries
   - `invoices` & `invoice_line_items`: Invoice generation
   - `pricing_plans` & `pricing_rates`: Flexible pricing configuration

2. **Usage Tracking Service** (`usage-tracking.js`)
   - `recordUsage()`: Core method to record any usage event
   - `getCurrentPeriodUsage()`: Get current billing period summary
   - `getUsageHistory()`: Historical usage queries
   - `getInvoices()` & `getInvoice()`: Invoice management

3. **Usage Recorder Service** (`usage-recorder.js`)
   - `recordCallUsage()`: Record voice call usage (per minute)
   - `recordMessageUsage()`: Record SMS/MMS usage (per message)
   - `recordEmailUsage()`: Record email usage (per recipient)
   - `recordWhatsAppUsage()`: Record WhatsApp usage (per message)
   - `backfillUsage()`: Populate usage for historical data

4. **API Routes** (`routes/usage.js`)
   - `GET /v1/usage/current-period`: Current period usage
   - `GET /v1/usage/history`: Historical usage
   - `GET /v1/billing/invoices`: List invoices
   - `GET /v1/billing/invoice/:id`: Invoice details

5. **Frontend Components**
   - `UsageDashboard.vue`: Real-time usage display
   - `BillingHistory.vue`: Invoice list and details

---

## Integration Methods

### Method 1: Manual Recording (Recommended for Now)

Add usage recording calls after successful API operations:

```javascript
import usageRecorder from '../services/usage-recorder.js';

// Example: After call completes
calls.patch('/:sid', authenticate, async (c) => {
  const { sid } = c.req.param();
  const { status } = await c.req.json();

  // Update call status
  const result = await pool.query(
    'UPDATE calls SET status = $1, ended_at = NOW() WHERE call_sid = $2 RETURNING *',
    [status, sid]
  );

  const call = result.rows[0];

  // Record usage if call completed
  if (status === 'completed' && call.duration_seconds > 0) {
    await usageRecorder.recordCallUsage(call);
  }

  return c.json({ success: true, call });
});

// Example: After SMS sent
sms.post('/send', authenticate, async (c) => {
  const { to, body, media_urls } = await c.req.json();

  // Send SMS via provider
  const message = await sendSMS(to, body, media_urls);

  // Record usage immediately
  await usageRecorder.recordMessageUsage(message);

  return c.json({ success: true, message });
});
```

### Method 2: Webhook/Event Integration

Configure FreeSWITCH to send CDR webhooks:

```javascript
// In your webhook handler
import usageRecorder from '../services/usage-recorder.js';

webhooks.post('/cdr', async (c) => {
  const cdrData = await c.req.json();

  // Automatically record usage from CDR
  await usageRecorder.recordCallFromCDR(cdrData);

  return c.json({ success: true });
});
```

### Method 3: Database Triggers (Future Enhancement)

Create PostgreSQL triggers to automatically record usage:

```sql
-- Example trigger for calls
CREATE OR REPLACE FUNCTION record_call_usage_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.duration_seconds > 0 THEN
    -- Call usage recording function
    PERFORM record_call_usage(NEW.id, NEW.tenant_id, NEW.call_sid, NEW.duration_seconds);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_call_complete
AFTER UPDATE ON calls
FOR EACH ROW
EXECUTE FUNCTION record_call_usage_trigger();
```

---

## Default Pricing

Configured in migration `025_usage_billing.sql`:

| Channel | Resource Type | Unit Price | Notes |
|---------|--------------|------------|-------|
| Voice | minute | $0.015 | Per minute of call time |
| SMS | message | $0.0075 | Per SMS message |
| SMS | mms | $0.02 | Per MMS message (with media) |
| Email | message | $0.001 | Per recipient |
| WhatsApp | message | $0.005 | Per WhatsApp message |

### Pricing Plans

| Plan | Monthly Fee | Included Credits |
|------|-------------|------------------|
| Free Trial | $0 | $50 |
| Starter | $29 | $10 |
| Professional | $99 | $50 |
| Enterprise | $499 | $200 |

---

## Usage Recording Best Practices

### 1. Record After Success

Only record usage after the operation successfully completes:

```javascript
try {
  // Perform operation
  const result = await sendEmail(to, subject, body);

  // Only record if successful
  if (result.success) {
    await usageRecorder.recordEmailUsage(result.email);
  }
} catch (error) {
  // Don't record usage on failure
  console.error('Email failed, no usage recorded:', error);
}
```

### 2. Don't Block Main Flow

Usage recording should not break the main API flow:

```javascript
// Record usage asynchronously
usageRecorder.recordCallUsage(call).catch(err => {
  console.error('Failed to record usage (non-fatal):', err);
});

// Or use fire-and-forget
process.nextTick(() => {
  usageRecorder.recordCallUsage(call).catch(console.error);
});
```

### 3. Include Metadata

Add context to help with debugging and analysis:

```javascript
await usageTracking.recordUsage({
  tenantId: 123,
  channel: 'voice',
  resourceType: 'minute',
  resourceId: 'CA1234567890',
  quantity: 5.25,
  metadata: {
    call_id: 456,
    from: '+15551234567',
    to: '+15559876543',
    duration_seconds: 315,
    region: 'US',
    carrier: 'twilio'
  }
});
```

### 4. Handle Edge Cases

```javascript
// Don't record inbound calls from customers (they're free)
if (call.direction === 'outbound') {
  await usageRecorder.recordCallUsage(call);
}

// Don't record zero-duration calls
if (call.duration_seconds > 0) {
  await usageRecorder.recordCallUsage(call);
}

// Count MMS differently than SMS
const resourceType = message.media_urls?.length > 0 ? 'mms' : 'message';
```

---

## Testing Usage Tracking

### 1. Check Current Usage

```bash
TOKEN="your-jwt-token"

curl -X GET http://localhost:3000/v1/usage/current-period \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "tenantId": 7,
    "periodStart": "2025-11-01",
    "periodEnd": "2025-11-30",
    "summary": {
      "totalCost": "12.5750",
      "totalRecords": 342,
      "creditBalance": "37.42",
      "remainingCredits": "24.85"
    },
    "byChannel": [
      {
        "channel": "voice",
        "totalCost": 7.5,
        "totalQuantity": 500,
        "resources": [
          {
            "resourceType": "minute",
            "quantity": 500,
            "cost": 7.5
          }
        ]
      }
    ]
  }
}
```

### 2. Manually Record Test Usage

```javascript
import usageTracking from './services/usage-tracking.js';

// Test call usage
await usageTracking.recordUsage({
  tenantId: 7,
  channel: 'voice',
  resourceType: 'minute',
  resourceId: 'CA_TEST_123',
  quantity: 2.5,
  metadata: { test: true }
});

// Test SMS usage
await usageTracking.recordUsage({
  tenantId: 7,
  channel: 'sms',
  resourceType: 'message',
  resourceId: 'SM_TEST_456',
  quantity: 1,
  metadata: { test: true }
});
```

### 3. Backfill Historical Usage

```javascript
import usageRecorder from './services/usage-recorder.js';

// Backfill usage for October 2025
await usageRecorder.backfillUsage('2025-10-01', '2025-10-31');
```

---

## Monitoring

### Check Usage Records

```sql
-- Recent usage records
SELECT
  channel,
  resource_type,
  quantity,
  unit_cost,
  total_cost,
  created_at
FROM usage_records
WHERE tenant_id = 7
ORDER BY created_at DESC
LIMIT 20;

-- Daily summaries
SELECT
  summary_date,
  channel,
  resource_type,
  total_quantity,
  total_cost,
  record_count
FROM usage_summaries
WHERE tenant_id = 7
  AND summary_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY summary_date DESC, channel;
```

### Check Tenant Balance

```sql
SELECT
  t.company_name,
  t.credit_balance,
  pp.display_name as plan,
  pp.included_credits,
  (SELECT SUM(total_cost)
   FROM usage_records
   WHERE tenant_id = t.id
     AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
  ) as current_period_usage
FROM tenants t
LEFT JOIN pricing_plans pp ON t.plan_id = pp.id
WHERE t.id = 7;
```

---

## Future Enhancements

1. **Automatic Database Triggers**: Create PostgreSQL triggers for fully automatic usage recording
2. **Real-time Balance Checks**: Prevent API calls when credit balance is negative
3. **Usage Alerts**: Email/SMS alerts at 80%, 90%, 100% usage thresholds
4. **Invoice PDF Generation**: Auto-generate PDF invoices
5. **Payment Integration**: Stripe/PayPal integration for automatic billing
6. **Usage Analytics**: Advanced usage patterns and cost optimization insights
7. **Rate Limiting by Balance**: Throttle API calls based on remaining credits

---

## Integration Checklist

- [ ] Run migration `025_usage_billing.sql`
- [ ] Verify pricing_plans and pricing_rates tables populated
- [ ] Add usage recording to call completion handlers
- [ ] Add usage recording to SMS/MMS send handlers
- [ ] Add usage recording to email send handlers
- [ ] Test usage API endpoints
- [ ] Verify usage displays in UsageDashboard.vue
- [ ] Set up monitoring queries
- [ ] Configure usage alerts (optional)
- [ ] Backfill historical usage (if needed)

---

## Support

For questions or issues with usage tracking:
- Check logs for usage recording errors
- Verify tenant has a pricing plan assigned
- Check pricing_rates table for active rates
- Review usage_records table for recorded events

**Documentation Version:** 1.0
**Last Updated:** November 2025
**Maintained By:** IRISX Platform Team
