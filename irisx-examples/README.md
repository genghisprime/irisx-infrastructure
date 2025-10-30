# IRISX Code Examples

Production-ready code examples demonstrating how to use the IRISX API for voice calls, SMS, IVR systems, voicemail, webhooks, and marketing campaigns.

## Overview

This directory contains 5 complete, working examples that showcase the core capabilities of the IRISX platform. Each example is fully documented, production-ready, and can be used as a starting point for your own applications.

## Examples

### 1. Simple Call Example
**Directory:** `simple-call/`

Make outbound calls with the IRISX API.

**Features:**
- Basic outbound call initiation
- Real-time status monitoring
- Error handling and retries
- Call cost tracking
- Recording support

**Use Cases:**
- Click-to-call functionality
- Automated notifications
- Call verification systems

**Quick Start:**
```bash
cd simple-call
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

[View Full Documentation →](simple-call/README.md)

---

### 2. IVR Menu System
**Directory:** `ivr-menu/`

Build interactive voice response (IVR) systems with multi-level menus.

**Features:**
- Multi-level menu navigation
- DTMF input handling (press 1, 2, 3, etc.)
- Text-to-Speech integration
- Call routing by department
- Invalid input handling with retries

**Use Cases:**
- Customer support phone trees
- Department routing
- Self-service hotlines
- Automated attendants

**Quick Start:**
```bash
cd ivr-menu
npm install
cp .env.example .env
# Edit .env with your settings
npm start
# Use ngrok to expose webhook: ngrok http 3000
```

[View Full Documentation →](ivr-menu/README.md)

---

### 3. Voicemail System
**Directory:** `voicemail/`

Complete voicemail recording and management system.

**Features:**
- Automatic voicemail recording
- Customizable greeting messages
- Automatic transcription
- Message management (read, delete)
- Recording playback
- Email notifications

**Use Cases:**
- After-hours voicemail
- Missed call messages
- Voice message portals
- Customer feedback collection

**Quick Start:**
```bash
cd voicemail
npm install
cp .env.example .env
npm start
```

[View Full Documentation →](voicemail/README.md)

---

### 4. Production Webhook Handler
**Directory:** `webhook-handler/`

Secure webhook server that handles all IRISX events.

**Features:**
- HMAC-SHA256 signature verification
- Organized event handlers (calls, SMS)
- Request logging and monitoring
- Replay attack prevention
- Comprehensive error handling

**Use Cases:**
- Production webhook processing
- Real-time event handling
- Call/SMS event tracking
- Integration with business systems

**Quick Start:**
```bash
cd webhook-handler
npm install
cp .env.example .env
# Add your webhook secret from IRISX dashboard
npm start
```

[View Full Documentation →](webhook-handler/README.md)

---

### 5. SMS Marketing Campaign
**Directory:** `sms-campaign/`

Complete SMS marketing platform with contact management and bulk sending.

**Features:**
- Contact list management
- Message templates with variables
- Bulk SMS with rate limiting
- Campaign scheduling
- Delivery tracking and analytics
- Opt-in/opt-out management

**Use Cases:**
- Marketing campaigns
- Customer notifications
- Promotional messages
- Announcements

**Quick Start:**
```bash
cd sms-campaign
npm install
cp .env.example .env
npm start
```

[View Full Documentation →](sms-campaign/README.md)

---

## Prerequisites

All examples require:

- **Node.js** 18.0.0 or higher
- **IRISX Account** with API credentials ([Sign up](https://irisx.io))
- **npm** or **yarn** package manager

Some examples also require:

- **Public URL** for webhooks (use [ngrok](https://ngrok.com) for development)
- **Phone Number** from IRISX for sending calls/SMS

## Getting Started

### 1. Get IRISX Credentials

1. Sign up at [https://irisx.io](https://irisx.io)
2. Get your API key from the dashboard
3. Note your tenant ID
4. (Optional) Purchase a phone number for calls/SMS

### 2. Choose an Example

Pick the example that matches your use case:

- **Voice Calls** → `simple-call/`
- **Phone Menus** → `ivr-menu/`
- **Voicemail** → `voicemail/`
- **Event Processing** → `webhook-handler/`
- **SMS Marketing** → `sms-campaign/`

### 3. Install & Configure

```bash
cd [example-directory]
npm install
cp .env.example .env
# Edit .env with your IRISX credentials
```

### 4. Run the Example

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Common Configuration

All examples use environment variables for configuration:

```env
# IRISX API Configuration
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=your_api_key_here
IRISX_TENANT_ID=1

# Phone Numbers
FROM_NUMBER=+15551234567
TO_NUMBER=+15559876543

# Server Settings (for webhook examples)
PORT=3000
BASE_URL=http://localhost:3000
```

## Using ngrok for Webhooks

Several examples require a public URL for webhooks. Use ngrok:

```bash
# Install ngrok
npm install -g ngrok

# Start your app
npm start

# In another terminal, expose port 3000
ngrok http 3000

# Use the ngrok URL in your IRISX webhook configuration
# Example: https://abc123.ngrok.io/webhooks
```

## Production Deployment

### Environment Variables

For production, set these environment variables:

```env
NODE_ENV=production
IRISX_API_KEY=prod_key_here
BASE_URL=https://your-domain.com
```

### Docker

All examples are Docker-ready:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t irisx-example .
docker run -p 3000:3000 --env-file .env irisx-example
```

### Process Manager (PM2)

For production deployment with auto-restart:

```bash
npm install -g pm2
pm2 start index.js --name irisx-app
pm2 save
pm2 startup
```

## Example Comparison

| Feature | Simple Call | IVR Menu | Voicemail | Webhook Handler | SMS Campaign |
|---------|-------------|----------|-----------|-----------------|--------------|
| **Complexity** | ⭐ Simple | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐⭐ Advanced |
| **Outbound Calls** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Inbound Calls** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **SMS** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Webhooks** | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Database** | ❌ | ❌ | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |
| **REST API** | ❌ | ❌ | ✅ | ❌ | ✅ |

Legend: ✅ Included | ⚠️ Recommended | ❌ Not applicable

## Architecture Patterns

### 1. Direct API Usage (simple-call)

```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.irisx.io',
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

const call = await client.post('/v1/calls', {
  from_number: '+15551234567',
  to_number: '+15559876543'
});
```

### 2. Webhook Server (ivr-menu, voicemail, webhook-handler)

```javascript
import express from 'express';

const app = express();

app.post('/webhook', (req, res) => {
  const { event, data } = req.body;

  // Process event
  handleEvent(event, data);

  // Return instructions
  res.json({ actions: [...] });
});
```

### 3. REST API (sms-campaign)

```javascript
// RESTful endpoints for managing resources
app.get('/campaigns', listCampaigns);
app.post('/campaigns', createCampaign);
app.post('/campaigns/:id/send', sendCampaign);
```

## Integration Examples

### Express.js

```javascript
import express from 'express';
import { makeCall } from './irisx-client.js';

const app = express();

app.post('/click-to-call', async (req, res) => {
  const { phone_number } = req.body;
  const call = await makeCall('+15551234567', phone_number);
  res.json({ call });
});
```

### React Frontend

```javascript
async function initiateCall(phoneNumber) {
  const response = await fetch('http://localhost:3000/click-to-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber })
  });

  const { call } = await response.json();
  console.log('Call initiated:', call.uuid);
}
```

### Database Integration

```javascript
// PostgreSQL example
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function saveCall(callData) {
  await pool.query(
    'INSERT INTO calls (uuid, from_number, to_number, status) VALUES ($1, $2, $3, $4)',
    [callData.uuid, callData.from_number, callData.to_number, callData.status]
  );
}
```

## Testing

### Unit Tests

```bash
npm install --save-dev jest
npm test
```

### Integration Tests

Test with the IRISX API:

```javascript
import { makeCall } from './index.js';

describe('Simple Call', () => {
  it('should initiate a call', async () => {
    const call = await makeCall('+15551234567', '+15559876543');
    expect(call.status).toBe('queued');
  });
});
```

### Webhook Testing

Test webhooks with curl:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "call.answered", "data": {...}}'
```

## Troubleshooting

### Common Issues

**"API key invalid"**
- Verify API key in .env file
- Check for extra spaces or quotes
- Ensure key is for correct environment (dev/prod)

**"Phone number not found"**
- Verify phone number format (+1234567890)
- Check number is purchased in IRISX dashboard
- Ensure number is active

**"Webhook not receiving events"**
- Verify URL is publicly accessible (use ngrok)
- Check webhook URL in IRISX dashboard
- Inspect server logs for incoming requests
- Verify firewall allows incoming traffic

**"Rate limit exceeded"**
- Reduce request frequency
- Implement exponential backoff
- Contact support for limit increase

### Debug Mode

Enable debug logging:

```env
DEBUG=irisx:*
NODE_ENV=development
```

### Getting Help

1. Check example README files
2. Review [IRISX Documentation](https://docs.irisx.io)
3. Search [Community Forum](https://community.irisx.io)
4. Contact [Support](mailto:support@irisx.io)

## Best Practices

### Security

1. **Never commit API keys** - Use .env files
2. **Verify webhook signatures** - See webhook-handler example
3. **Use HTTPS in production** - Not HTTP
4. **Implement rate limiting** - Prevent abuse
5. **Validate all input** - Sanitize user data

### Performance

1. **Use connection pooling** - For database connections
2. **Implement caching** - For frequently accessed data
3. **Process webhooks quickly** - Return 200 immediately
4. **Use async operations** - Don't block the event loop
5. **Monitor error rates** - Set up alerts

### Scalability

1. **Horizontal scaling** - Run multiple instances
2. **Load balancing** - Distribute traffic
3. **Queue heavy tasks** - Use Redis/RabbitMQ
4. **Database optimization** - Add indexes
5. **CDN for static assets** - Reduce server load

## Contributing

Found a bug or want to improve an example?

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Resources

### Documentation

- [IRISX API Reference](https://api.irisx.io/docs)
- [Developer Guides](https://docs.irisx.io)
- [Webhook Events](https://docs.irisx.io/webhooks)

### Tools

- [ngrok](https://ngrok.com) - Expose local server
- [Postman](https://postman.com) - API testing
- [curl](https://curl.se) - Command-line HTTP client

### Community

- [Community Forum](https://community.irisx.io)
- [GitHub Issues](https://github.com/irisx/examples/issues)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/irisx)

## Support

Need help with these examples?

- 📧 Email: support@irisx.io
- 💬 Live Chat: Available in dashboard
- 📖 Documentation: https://docs.irisx.io
- 🐛 Report Bugs: GitHub Issues

## License

All examples are released under the MIT License. Feel free to use them in your projects!

## What's Next?

After exploring these examples:

1. **Build your application** - Use examples as foundation
2. **Read the API docs** - Learn advanced features
3. **Join the community** - Connect with other developers
4. **Deploy to production** - Launch your service!

Happy coding! 🚀
