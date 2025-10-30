# IRISX Voicemail System Example

A production-ready voicemail system with recording, transcription, playback, and comprehensive message management.

## Features

- Automatic voicemail recording
- Customizable greeting messages
- Automatic transcription
- Message management (read, delete, bulk operations)
- Recording playback with presigned URLs
- Email notifications for new voicemails
- RESTful API for voicemail access
- Statistics and analytics
- Express.js webhook server

## Prerequisites

- Node.js 18.0.0 or higher
- IRISX account with API credentials
- Phone number configured for voicemail
- Publicly accessible webhook URL (use ngrok for development)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Configure environment variables:

```env
PORT=3000
BASE_URL=https://your-domain.com
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=your_api_key_here
NOTIFICATION_EMAIL=admin@example.com
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

3. Configure IRISX webhook:
   - Dashboard → Phone Numbers
   - Set webhook to: `https://your-ngrok-url.ngrok.io/voicemail/webhook`

### Production Mode

```bash
npm start
```

## Webhook Flow

1. **Call Received**
   ```
   IRISX → POST /voicemail/webhook
   Event: call.answered
   ```

2. **System Response**
   - Plays greeting message
   - Starts recording (max 3 minutes)
   - Enables transcription

3. **Recording Complete**
   ```
   IRISX → POST /voicemail/webhook
   Event: recording.complete
   Body: { recording_url, duration, transcription }
   ```

4. **System Actions**
   - Saves voicemail to database
   - Sends email notification
   - Returns success response

## API Endpoints

### List Voicemails
```http
GET /voicemail/messages
```

**Query Parameters:**
- `status` - Filter by status (new, read)
- `limit` - Results per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "call_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "from_number": "+15559876543",
      "to_number": "+15551234567",
      "recording_url": "https://s3.amazonaws.com/...",
      "duration_seconds": 45,
      "transcription": "Hi, this is John calling about...",
      "status": "new",
      "created_at": "2025-10-30T10:00:00.000Z",
      "read_at": null
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0,
    "pages": 1
  }
}
```

### Get Specific Voicemail
```http
GET /voicemail/messages/:id
```

**Response:**
```json
{
  "message": {
    "id": 1,
    "from_number": "+15559876543",
    "duration_seconds": 45,
    "transcription": "Hi, this is John...",
    "status": "new"
  }
}
```

### Mark as Read
```http
PATCH /voicemail/messages/:id/read
```

**Response:**
```json
{
  "message": "Voicemail marked as read",
  "voicemail": { ... }
}
```

### Delete Voicemail
```http
DELETE /voicemail/messages/:id
```

**Response:**
```json
{
  "message": "Voicemail deleted successfully"
}
```

### Get Recording URL
```http
GET /voicemail/messages/:id/recording
```

**Response:**
```json
{
  "recording_url": "https://s3.amazonaws.com/presigned-url",
  "duration_seconds": 45,
  "expires_in": 900
}
```

### Get Transcription
```http
GET /voicemail/messages/:id/transcription
```

**Response:**
```json
{
  "transcription": "Hi, this is John calling about the meeting tomorrow...",
  "confidence": 0.95
}
```

### Get Statistics
```http
GET /voicemail/stats
```

**Response:**
```json
{
  "stats": {
    "total": 50,
    "new": 5,
    "read": 45,
    "total_duration": 2250,
    "average_duration": 45,
    "transcribed": 48
  }
}
```

### Bulk Mark as Read
```http
POST /voicemail/bulk/mark-read
Content-Type: application/json

{
  "message_ids": [1, 2, 3, 4, 5]
}
```

**Response:**
```json
{
  "message": "5 voicemails marked as read",
  "updated": 5
}
```

### Bulk Delete
```http
DELETE /voicemail/bulk/delete
Content-Type: application/json

{
  "message_ids": [1, 2, 3]
}
```

**Response:**
```json
{
  "message": "3 voicemails deleted",
  "deleted": 3
}
```

## Customization

### Custom Greeting Messages

Edit `routes/voicemail.js`:

```javascript
function getGreeting(phoneNumber) {
  const greetings = {
    '+15551234567': "You've reached Sales. Please leave a message.",
    '+15559876543': "You've reached Support. Please leave a message.",
    default: "Please leave a message after the beep."
  };

  return greetings[phoneNumber] || greetings.default;
}
```

### Recording Settings

Adjust recording parameters in webhook response:

```javascript
{
  action: 'record',
  maxLength: 180,        // 3 minutes (max: 600 seconds)
  finishOnKey: '#',      // Press # to finish
  transcribe: true,      // Enable transcription
  playBeep: true         // Play beep before recording
}
```

### Email Notifications

Implement email sending in `sendNotification()`:

```javascript
async function sendNotification(message) {
  await emailService.send({
    to: process.env.NOTIFICATION_EMAIL,
    subject: `New Voicemail from ${message.from_number}`,
    html: `
      <h2>New Voicemail</h2>
      <p><strong>From:</strong> ${message.from_number}</p>
      <p><strong>Duration:</strong> ${message.duration_seconds}s</p>
      <p><strong>Transcription:</strong> ${message.transcription}</p>
      <a href="${process.env.BASE_URL}/voicemail/messages/${message.id}">
        Listen to Voicemail
      </a>
    `
  });
}
```

## Database Integration

For production, replace the in-memory Map with a database:

### PostgreSQL Example

```javascript
// Save voicemail
const result = await pool.query(`
  INSERT INTO voicemails (
    call_uuid, from_number, to_number, recording_url,
    duration_seconds, transcription, status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING *
`, [call_uuid, from_number, to_number, recording_url,
    duration_seconds, transcription, 'new']);
```

### MongoDB Example

```javascript
// Save voicemail
const voicemail = new Voicemail({
  call_uuid,
  from_number,
  to_number,
  recording_url,
  duration_seconds,
  transcription,
  status: 'new'
});

await voicemail.save();
```

## Security Considerations

### Webhook Verification

Add signature verification:

```javascript
import crypto from 'crypto';

function verifyWebhook(req) {
  const signature = req.headers['x-irisx-signature'];
  const payload = JSON.stringify(req.body);
  const secret = process.env.WEBHOOK_SECRET;

  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === hash;
}

router.post('/webhook', (req, res) => {
  if (!verifyWebhook(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // ... handle webhook
});
```

### Recording Access Control

Implement authentication for recording URLs:

```javascript
router.get('/messages/:id/recording', authenticateUser, async (req, res) => {
  // Verify user has access to this voicemail
  const message = await getVoicemail(req.params.id);

  if (message.to_number !== req.user.phone_number) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Return presigned URL
  res.json({ recording_url: message.recording_url });
});
```

## Production Deployment

### Environment Variables

```env
# Production settings
NODE_ENV=production
PORT=3000
BASE_URL=https://voicemail.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# IRISX
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=prod_key_here
WEBHOOK_SECRET=your_webhook_secret

# Storage
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=voicemails-prod
AWS_REGION=us-east-1

# Notifications
NOTIFICATION_EMAIL=voicemail@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
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

### Health Monitoring

Add health checks:

```javascript
router.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    database: await checkDatabase(),
    storage: await checkS3(),
    api: await checkIRISXAPI()
  };

  const allHealthy = Object.values(checks).every(c => c === 'ok');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks
  });
});
```

## Testing

### Test Webhook Locally

```bash
curl -X POST http://localhost:3000/voicemail/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call.answered",
    "call_uuid": "test-123",
    "from_number": "+15559876543",
    "to_number": "+15551234567"
  }'
```

### Test Recording Complete

```bash
curl -X POST http://localhost:3000/voicemail/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "recording.complete",
    "call_uuid": "test-123",
    "from_number": "+15559876543",
    "to_number": "+15551234567",
    "recording_url": "https://example.com/recording.mp3",
    "recording_duration": 45,
    "transcription": "This is a test voicemail"
  }'
```

## Troubleshooting

### No recording saved
- Check webhook URL is correct
- Verify API key is valid
- Inspect server logs for errors
- Test webhook with cURL

### Transcription not working
- Verify transcription is enabled in account
- Check recording duration (min 2 seconds)
- Ensure audio quality is good

### Email notifications not sending
- Verify SMTP credentials
- Check email address is valid
- Review email service logs

### Recording playback issues
- Verify S3 bucket permissions
- Check presigned URL expiration
- Ensure CORS is configured

## Best Practices

1. **Storage Management**
   - Implement retention policies (delete after 90 days)
   - Compress recordings to save space
   - Use S3 lifecycle rules

2. **Performance**
   - Cache transcriptions
   - Use database indexes
   - Implement pagination

3. **Security**
   - Verify webhook signatures
   - Encrypt recordings at rest
   - Use presigned URLs with short TTL
   - Implement access controls

4. **Reliability**
   - Handle webhook retries
   - Log all operations
   - Monitor error rates
   - Set up alerts

## Support

- Documentation: https://docs.irisx.io
- API Reference: https://api.irisx.io/docs
- Support: support@irisx.io

## License

MIT
