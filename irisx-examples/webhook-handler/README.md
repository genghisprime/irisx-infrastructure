# IRISX Production Webhook Handler

A production-ready webhook server that securely handles all IRISX events with HMAC-SHA256 signature verification, comprehensive error handling, and organized event routing.

## Features

- HMAC-SHA256 signature verification
- Organized event handlers (calls, SMS, recordings)
- Request logging and monitoring
- Replay attack prevention (timestamp validation)
- Graceful error handling
- Health check endpoint
- Production-ready architecture
- Comprehensive event coverage

## Prerequisites

- Node.js 18.0.0 or higher
- IRISX account with webhook secret
- Publicly accessible server or ngrok for development

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Configure your webhook secret:

```env
PORT=3000
WEBHOOK_SECRET=your_webhook_secret_from_irisx_dashboard
NODE_ENV=production
```

## Usage

### Development Mode

1. Start the server:

```bash
npm run dev
```

2. Expose with ngrok:

```bash
ngrok http 3000
```

3. Configure webhook URL in IRISX Dashboard:
   - Go to Settings → Webhooks
   - Add webhook URL: `https://your-ngrok-url.ngrok.io/webhooks`
   - Copy webhook secret to `.env`

### Production Mode

```bash
npm start
```

## Webhook Endpoints

### Main Webhook (All Events)
```
POST /webhooks
```

Handles all IRISX events and routes to appropriate handlers.

### Call-Specific Webhook
```
POST /webhooks/calls
```

Only receives call-related events.

### SMS-Specific Webhook
```
POST /webhooks/sms
```

Only receives SMS-related events.

### Health Check
```
GET /health
```

Returns server health status.

## Signature Verification

All webhook requests are verified using HMAC-SHA256 signatures to ensure they come from IRISX and haven't been tampered with.

### How It Works

1. IRISX signs the webhook payload with your secret key
2. Signature is sent in `X-IRISX-Signature` header
3. Server calculates expected signature
4. Signatures are compared using timing-safe comparison
5. Request is rejected if signatures don't match

### Request Headers

```
X-IRISX-Signature: hmac_signature_here
X-IRISX-Timestamp: 1698765432
Content-Type: application/json
```

### Signature Format

```
signature = HMAC-SHA256(timestamp.payload, webhook_secret)
```

## Supported Events

### Call Events

- `call.initiated` - Outbound call started
- `call.ringing` - Destination phone ringing
- `call.answered` - Call was answered
- `call.completed` - Call ended successfully
- `call.failed` - Call failed
- `call.no_answer` - No answer
- `call.busy` - Line busy
- `call.cancelled` - Call cancelled

### SMS Events

- `sms.sent` - SMS sent from your system
- `sms.delivered` - SMS delivered to recipient
- `sms.failed` - SMS delivery failed
- `sms.received` - Incoming SMS received

### Recording Events

- `recording.complete` - Call recording finished
- `recording.transcribed` - Transcription available

## Event Handler Structure

### Call Handler Example

```javascript
// handlers/calls.js
export async function handleCallCompleted(data, req) {
  const { call_uuid, duration_seconds, total_cost } = data;

  // Update database
  await db.calls.update(call_uuid, {
    status: 'completed',
    duration_seconds,
    total_cost
  });

  // Update analytics
  await analytics.recordCall(data);

  // Send notification
  await notify.callCompleted(data);
}
```

### SMS Handler Example

```javascript
// handlers/sms.js
export async function handleSmsReceived(data, req) {
  const { message_id, from_number, message } = data;

  // Process STOP keyword
  if (message.toUpperCase() === 'STOP') {
    await contacts.optOut(from_number);
    return;
  }

  // Create support ticket
  await tickets.create({
    from: from_number,
    message,
    channel: 'sms'
  });
}
```

## Customizing Handlers

### 1. Update Event Handlers

Edit files in `handlers/` directory:

- `handlers/calls.js` - Call event logic
- `handlers/sms.js` - SMS event logic

### 2. Add Database Integration

```javascript
// handlers/calls.js
import db from '../db/index.js';

export async function handleCallCompleted(data) {
  await db.query(
    'UPDATE calls SET status = $1, duration = $2 WHERE uuid = $3',
    ['completed', data.duration_seconds, data.call_uuid]
  );
}
```

### 3. Add Notifications

```javascript
import emailService from '../services/email.js';

export async function handleCallFailed(data) {
  await emailService.send({
    to: 'admin@example.com',
    subject: 'Call Failed Alert',
    body: `Call ${data.call_uuid} failed: ${data.error_message}`
  });
}
```

## Security Best Practices

### 1. Always Verify Signatures

Never disable signature verification in production:

```env
# ❌ DO NOT DO THIS IN PRODUCTION
SKIP_SIGNATURE_VERIFICATION=true
```

### 2. Validate Timestamps

The middleware automatically rejects webhooks older than 5 minutes to prevent replay attacks.

### 3. Use HTTPS

Always use HTTPS in production:

```
https://your-domain.com/webhooks
```

### 4. Rate Limiting

Add rate limiting to prevent abuse:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});

app.use('/webhooks', limiter);
```

### 5. Input Validation

Always validate webhook data:

```javascript
import { z } from 'zod';

const callSchema = z.object({
  call_uuid: z.string().uuid(),
  from_number: z.string(),
  to_number: z.string(),
  duration_seconds: z.number().min(0)
});

export async function handleCallCompleted(data) {
  const validated = callSchema.parse(data);
  // Process validated data
}
```

## Testing

### Test Signature Verification

Create `test/test-signature.js`:

```javascript
import { generateSignature } from '../middleware/verify.js';

const payload = {
  event: 'call.completed',
  data: { call_uuid: 'test-123' }
};

const secret = 'your_webhook_secret';
const timestamp = Math.floor(Date.now() / 1000);

const signature = generateSignature(payload, secret, timestamp);

console.log('Signature:', signature);
console.log('Timestamp:', timestamp);
```

### Test Webhook Locally

```bash
curl -X POST http://localhost:3000/webhooks \
  -H "Content-Type: application/json" \
  -H "X-IRISX-Signature: calculated_signature_here" \
  -H "X-IRISX-Timestamp: 1698765432" \
  -d '{
    "event": "call.completed",
    "data": {
      "call_uuid": "test-123",
      "duration_seconds": 120,
      "total_cost": 0.05
    }
  }'
```

## Error Handling

The server always returns 200 OK to acknowledge receipt, even on errors:

```javascript
app.post('/webhooks', async (req, res) => {
  try {
    await processWebhook(req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    // Still return 200 to prevent retries
    res.status(200).json({ success: false });
  }
});
```

This prevents infinite retry loops for permanent errors.

## Monitoring

### Request Logging

All requests are logged with:
- Request ID
- Timestamp
- Method and path
- Response status
- Processing duration

```
[2025-10-30T10:00:00.000Z] req-123 POST /webhooks
[2025-10-30T10:00:00.100Z] req-123 200 100ms
```

### Health Monitoring

Check server health:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "IRISX Webhook Handler",
  "timestamp": "2025-10-30T10:00:00.000Z",
  "uptime": 3600
}
```

## Production Deployment

### Environment Variables

```env
NODE_ENV=production
PORT=3000
WEBHOOK_SECRET=prod_webhook_secret_here
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your_sentry_dsn
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Process Manager (PM2)

```bash
npm install -g pm2
pm2 start index.js --name irisx-webhooks
pm2 save
```

### Load Balancing

For high traffic, use multiple instances:

```bash
pm2 start index.js -i max --name irisx-webhooks
```

### Logging

Add structured logging:

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## Troubleshooting

### "Invalid signature" error

1. Verify webhook secret is correct
2. Check that body parsing preserves raw body
3. Ensure signature calculation matches IRISX format
4. Verify no middleware modifies request body before verification

### "Webhook timestamp too old" error

1. Check server time is synchronized (NTP)
2. Verify timestamp is in seconds (not milliseconds)
3. Increase MAX_AGE if needed (not recommended)

### Webhooks not received

1. Verify URL is publicly accessible
2. Check firewall allows incoming connections
3. Test with curl to ensure server responds
4. Check IRISX webhook configuration
5. Review server logs for errors

### High latency

1. Optimize database queries
2. Use async processing for heavy tasks
3. Add caching layer
4. Scale horizontally with load balancer

## Best Practices

1. **Return 200 quickly** - Process heavy tasks asynchronously
2. **Idempotent handlers** - Handle duplicate webhooks gracefully
3. **Log everything** - You'll need it for debugging
4. **Monitor error rates** - Set up alerts for failures
5. **Validate all input** - Never trust webhook data blindly
6. **Use database transactions** - Ensure data consistency
7. **Implement retries** - For failed external API calls
8. **Scale horizontally** - Use multiple instances for high traffic

## Support

- Documentation: https://docs.irisx.io/webhooks
- API Reference: https://api.irisx.io/docs
- Support: support@irisx.io

## License

MIT
