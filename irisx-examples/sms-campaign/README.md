# IRISX SMS Marketing Campaign System

A complete SMS marketing campaign platform with contact management, message templates, bulk sending with rate limiting, and comprehensive analytics.

## Features

- Contact list management with tags and custom fields
- Message templates with variable substitution
- Bulk SMS sending with rate limiting
- Campaign scheduling
- Real-time delivery tracking
- Campaign analytics and reporting
- Opt-in/opt-out management
- Contact import/export (CSV/JSON)
- RESTful API

## Prerequisites

- Node.js 18.0.0 or higher
- IRISX account with API credentials
- SMS-enabled phone number

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Configure environment:

```env
PORT=3000
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=your_api_key_here
DEFAULT_FROM_NUMBER=+15551234567
```

## Usage

Start the server:

```bash
npm start
```

Development mode with auto-reload:

```bash
npm run dev
```

## API Reference

### Contact Management

#### Create Contact
```http
POST /contacts
Content-Type: application/json

{
  "phone_number": "+15559876543",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "tags": ["customer", "vip"],
  "custom_fields": {
    "company": "ACME Corp",
    "account_id": "12345"
  }
}
```

Response:
```json
{
  "contact": {
    "id": 1,
    "phone_number": "+15559876543",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "tags": ["customer", "vip"],
    "custom_fields": {
      "company": "ACME Corp"
    },
    "opted_in": true,
    "created_at": "2025-10-30T10:00:00.000Z"
  }
}
```

#### List Contacts
```http
GET /contacts?tag=customer&opted_in=true&limit=100&offset=0
```

#### Get Contact
```http
GET /contacts/:id
```

#### Update Contact
```http
PUT /contacts/:id
Content-Type: application/json

{
  "first_name": "Jane",
  "tags": ["customer", "vip", "premium"]
}
```

#### Delete Contact
```http
DELETE /contacts/:id
```

#### Import Contacts
```http
POST /contacts/import
Content-Type: application/json

{
  "contacts": [
    {
      "phone_number": "+15551111111",
      "first_name": "Alice",
      "tags": ["customer"]
    },
    {
      "phone_number": "+15552222222",
      "first_name": "Bob",
      "tags": ["prospect"]
    }
  ]
}
```

Response:
```json
{
  "message": "Import completed",
  "imported": 2,
  "skipped": 0
}
```

#### Export Contacts
```http
GET /contacts/export?format=csv&tag=customer
```

Returns CSV file or JSON array of contacts.

#### Opt-Out Contact
```http
POST /contacts/:id/opt-out
```

#### Opt-In Contact
```http
POST /contacts/:id/opt-in
```

### Campaign Management

#### Create Campaign
```http
POST /campaigns
Content-Type: application/json

{
  "name": "Summer Sale 2025",
  "message_template": "Hi {{first_name}}! 🌟 Summer Sale: 50% off all products. Shop now at example.com. Reply STOP to opt-out.",
  "from_number": "+15551234567",
  "tags": ["customer", "vip"],
  "rate_limit_per_minute": 60,
  "scheduled_at": null
}
```

Response:
```json
{
  "campaign": {
    "id": 1,
    "name": "Summer Sale 2025",
    "message_template": "Hi {{first_name}}! ...",
    "from_number": "+15551234567",
    "tags": ["customer", "vip"],
    "variables": ["first_name"],
    "rate_limit_per_minute": 60,
    "status": "draft",
    "stats": {
      "total_recipients": 0,
      "sent": 0,
      "delivered": 0,
      "failed": 0
    },
    "created_at": "2025-10-30T10:00:00.000Z"
  }
}
```

#### List Campaigns
```http
GET /campaigns?status=completed&limit=50
```

#### Get Campaign
```http
GET /campaigns/:id
```

#### Update Campaign
```http
PUT /campaigns/:id
Content-Type: application/json

{
  "name": "Updated Campaign Name",
  "message_template": "New message template"
}
```

Note: Can only update campaigns in `draft` status.

#### Delete Campaign
```http
DELETE /campaigns/:id
```

Note: Can only delete campaigns in `draft` status.

#### Send Campaign
```http
POST /campaigns/:id/send
```

Starts sending the campaign to all matching contacts.

Response:
```json
{
  "message": "Campaign sending started",
  "campaign": {
    "id": 1,
    "status": "sending",
    "recipients_count": 150
  }
}
```

#### Get Campaign Statistics
```http
GET /campaigns/:id/stats
```

Response:
```json
{
  "stats": {
    "total_recipients": 150,
    "sent": 150,
    "delivered": 145,
    "failed": 5,
    "delivery_rate": "96.67%",
    "failure_rate": "3.33%",
    "messages": 150,
    "campaign_duration": "150s"
  }
}
```

#### Get Campaign Messages
```http
GET /campaigns/:id/messages
```

Returns detailed list of all messages sent in campaign.

## Message Templates

### Variable Substitution

Use double curly braces for variables:

```
Hi {{first_name}}! Your order {{order_id}} is ready for pickup.
```

### Available Variables

**Contact Fields:**
- `{{first_name}}` - Contact's first name
- `{{last_name}}` - Contact's last name
- `{{email}}` - Contact's email
- `{{phone_number}}` - Contact's phone number

**Custom Fields:**
- `{{company}}` - Any custom field defined in contact
- `{{account_id}}` - Any custom field

### Template Examples

**Welcome Message:**
```
Welcome {{first_name}}! Thanks for joining {{company}}. Reply HELP for assistance.
```

**Promotion:**
```
Hi {{first_name}}! 🎉 Exclusive offer: Get 25% off with code SAVE25. Shop: example.com
```

**Reminder:**
```
Hi {{first_name}}, your appointment at {{location}} is tomorrow at {{time}}. Reply C to confirm.
```

**Event Invitation:**
```
{{first_name}}, you're invited to our exclusive event on {{date}}! RSVP: example.com/rsvp
```

## Rate Limiting

Control sending speed with `rate_limit_per_minute`:

```json
{
  "rate_limit_per_minute": 60
}
```

- `60` - Send 60 messages per minute (1/second)
- `120` - Send 120 messages per minute (2/second)
- `30` - Send 30 messages per minute (1 every 2 seconds)

This helps:
- Comply with carrier limits
- Avoid spam filters
- Distribute load over time
- Control costs

## Campaign Workflow

### 1. Create Contacts

```bash
curl -X POST http://localhost:3000/contacts \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+15559876543",
    "first_name": "John",
    "tags": ["customer"]
  }'
```

### 2. Create Campaign

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Campaign",
    "message_template": "Hi {{first_name}}! Check out our new products.",
    "from_number": "+15551234567",
    "tags": ["customer"],
    "rate_limit_per_minute": 60
  }'
```

### 3. Send Campaign

```bash
curl -X POST http://localhost:3000/campaigns/1/send
```

### 4. Monitor Progress

```bash
curl http://localhost:3000/campaigns/1/stats
```

## Contact Segmentation

Target specific groups using tags:

**Send to VIP customers only:**
```json
{
  "tags": ["vip"]
}
```

**Send to customers AND prospects:**
```json
{
  "tags": ["customer", "prospect"]
}
```

**Send to everyone (no tags):**
```json
{
  "tags": []
}
```

## Compliance Features

### Automatic Opt-Out Handling

The system automatically filters out opted-out contacts.

### Opt-Out Management

```bash
# Opt-out a contact
curl -X POST http://localhost:3000/contacts/1/opt-out

# Opt-in a contact
curl -X POST http://localhost:3000/contacts/1/opt-in
```

### STOP Keyword Processing

Handle STOP keywords in your webhook handler:

```javascript
if (message.toUpperCase() === 'STOP') {
  await fetch('http://localhost:3000/contacts/1/opt-out', {
    method: 'POST'
  });
}
```

## Database Integration

For production, replace in-memory storage with a database:

### PostgreSQL Schema

```sql
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  tags TEXT[],
  custom_fields JSONB,
  opted_in BOOLEAN DEFAULT true,
  opted_out_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  message_template TEXT NOT NULL,
  from_number VARCHAR(20) NOT NULL,
  tags TEXT[],
  rate_limit_per_minute INTEGER DEFAULT 60,
  status VARCHAR(20) DEFAULT 'draft',
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE campaign_messages (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  contact_id INTEGER REFERENCES contacts(id),
  phone_number VARCHAR(20),
  message TEXT,
  status VARCHAR(20),
  irisx_message_id VARCHAR(100),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  error TEXT
);
```

### MongoDB Schema

```javascript
const contactSchema = new Schema({
  phone_number: { type: String, required: true, unique: true },
  first_name: String,
  last_name: String,
  email: String,
  tags: [String],
  custom_fields: Schema.Types.Mixed,
  opted_in: { type: Boolean, default: true },
  opted_out_at: Date,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const campaignSchema = new Schema({
  name: { type: String, required: true },
  message_template: { type: String, required: true },
  from_number: { type: String, required: true },
  tags: [String],
  rate_limit_per_minute: { type: Number, default: 60 },
  status: { type: String, default: 'draft' },
  stats: {
    total_recipients: Number,
    sent: Number,
    delivered: Number,
    failed: Number
  },
  sent_at: Date,
  completed_at: Date,
  created_at: { type: Date, default: Date.now }
});
```

## Advanced Features

### Schedule Campaigns

```json
{
  "scheduled_at": "2025-11-01T09:00:00Z"
}
```

Implement scheduling with a cron job or task scheduler.

### A/B Testing

Create multiple campaigns with variations:

```json
{
  "name": "Campaign A - Short Message",
  "message_template": "Quick sale! 50% off today only."
},
{
  "name": "Campaign B - Detailed Message",
  "message_template": "Hi {{first_name}}! Limited time offer: 50% off all products today. Shop now!"
}
```

### Personalization

Use custom fields for deep personalization:

```json
{
  "message_template": "Hi {{first_name}}! Your {{car_model}} is due for service. Book now at {{dealer_location}}."
}
```

### Multi-Language Support

Store language preference in custom fields:

```javascript
const templates = {
  en: "Hi {{first_name}}! Summer sale: 50% off!",
  es: "Hola {{first_name}}! Venta de verano: 50% de descuento!",
  fr: "Bonjour {{first_name}}! Soldes d'été: 50% de réduction!"
};

const language = contact.custom_fields.language || 'en';
const message = renderMessage(templates[language], contact);
```

## Production Deployment

### Environment Variables

```env
NODE_ENV=production
PORT=3000
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=prod_api_key
DEFAULT_FROM_NUMBER=+15551234567
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://localhost:6379
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

### Monitoring

Add monitoring for:
- Campaign send rates
- Delivery rates
- Failed messages
- API errors
- Rate limit violations

## Best Practices

1. **Test with small groups first** - Send to 10-20 contacts before full campaign
2. **Monitor delivery rates** - Investigate if delivery rate drops below 90%
3. **Respect opt-outs** - Always check opt-in status before sending
4. **Use meaningful tags** - Organize contacts with clear, descriptive tags
5. **Personalize messages** - Use first names and custom fields
6. **Set appropriate rate limits** - Start slow, increase gradually
7. **Track campaign performance** - Analyze stats after each campaign
8. **Backup contact lists** - Export regularly
9. **Validate phone numbers** - Use proper formatting (+1234567890)
10. **Include opt-out instructions** - Add "Reply STOP to opt-out" to messages

## Troubleshooting

### Low delivery rates
- Check phone number formatting
- Verify contacts are opted-in
- Review message content for spam indicators
- Check carrier restrictions

### Campaign not sending
- Verify API credentials
- Check rate limit settings
- Ensure contacts match tag criteria
- Review server logs for errors

### Messages not personalized
- Verify template variables match contact fields
- Check custom_fields are set correctly
- Ensure variable names use correct casing

## Support

- Documentation: https://docs.irisx.io
- API Reference: https://api.irisx.io/docs
- Support: support@irisx.io

## License

MIT
