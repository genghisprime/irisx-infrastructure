# IRISX IVR Menu System Example

A production-ready Interactive Voice Response (IVR) system with multi-level menu navigation, DTMF input handling, and intelligent call routing.

## Features

- Multi-level IVR menu system
- DTMF input handling (phone keypad navigation)
- Text-to-Speech (TTS) integration
- Call transfer to departments
- Invalid input handling with retries
- Automatic operator fallback
- Express.js webhook server
- Production-ready error handling
- Menu configuration system

## Menu Structure

```
Main Menu
├── 1. Sales
│   ├── 1. New Customers → Transfer
│   ├── 2. Existing Customers → Transfer
│   └── 9. Back to Main Menu
├── 2. Support
│   ├── 1. Account Issues → Transfer
│   ├── 2. Technical Problems → Transfer
│   ├── 3. API Support → Transfer
│   └── 9. Back to Main Menu
├── 3. Billing
│   ├── 1. Payment Information → Audio
│   ├── 2. Invoice Questions → Transfer
│   ├── 3. Billing Representative → Transfer
│   └── 9. Back to Main Menu
└── 0. Operator → Transfer
```

## Prerequisites

- Node.js 18.0.0 or higher
- IRISX account with API credentials
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

3. Configure your environment variables:

```env
PORT=3000
BASE_URL=https://your-domain.com
CALLER_ID=+15551234567
OPERATOR_NUMBER=+15551234567
```

## Usage

### Development Mode

1. Start the server:

```bash
npm run dev
```

2. Expose your local server with ngrok:

```bash
ngrok http 3000
```

3. Configure your IRISX phone number webhook URL:
   - Go to IRISX Dashboard → Phone Numbers
   - Set webhook URL to: `https://your-ngrok-url.ngrok.io/ivr/webhook`

### Production Mode

1. Deploy to your server
2. Update `BASE_URL` in `.env` with your production domain
3. Configure IRISX webhook URL to your production endpoint

```bash
npm start
```

## Webhook Configuration

In your IRISX dashboard, configure your phone number to send webhooks to:

```
POST https://your-domain.com/ivr/webhook
```

The server will handle these events:
- `call.answered` - New call received
- `dtmf.received` - User pressed a key
- `playback.complete` - Audio playback finished

## API Endpoints

### Webhook Endpoint
```
POST /ivr/webhook
```

Receives call events from IRISX and returns IVR instructions.

**Request Body:**
```json
{
  "call_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "event": "call.answered",
  "from_number": "+15559876543",
  "to_number": "+15551234567"
}
```

**Response:**
```json
{
  "actions": [
    {
      "action": "say",
      "text": "Welcome to IRISX Demo...",
      "voice": "alloy",
      "language": "en-US"
    },
    {
      "action": "gather",
      "numDigits": 1,
      "timeout": 5
    }
  ],
  "metadata": {
    "menu_id": "main",
    "call_uuid": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Statistics Endpoint
```
GET /ivr/stats
```

Returns IVR usage statistics (implement database tracking in production).

### Menu Configuration
```
GET /ivr/menus
```

Returns current menu configuration for debugging.

## Customizing Menus

Edit `routes/ivr.js` to customize menus:

```javascript
const IVR_MENUS = {
  main: {
    id: 'main',
    message: 'Welcome to your company...',
    options: {
      '1': { action: 'menu', target: 'sales' },
      '2': { action: 'transfer', target: '+15551234567' }
    },
    invalidMessage: 'Invalid selection.',
    maxRetries: 3
  }
};
```

### Menu Options

#### Navigate to Submenu
```javascript
'1': { action: 'menu', target: 'submenu_id' }
```

#### Transfer Call
```javascript
'2': {
  action: 'transfer',
  target: '+15551234567',
  department: 'Sales'
}
```

#### Play Audio File
```javascript
'3': { action: 'play', target: 'audio_file.mp3' }
```

#### Hang Up
```javascript
'9': { action: 'hangup' }
```

## IVR Actions

### Say (Text-to-Speech)
```json
{
  "action": "say",
  "text": "Welcome to our service",
  "voice": "alloy",
  "language": "en-US"
}
```

### Gather (Collect DTMF Input)
```json
{
  "action": "gather",
  "numDigits": 1,
  "timeout": 5,
  "finishOnKey": "#",
  "action_url": "https://your-domain.com/ivr/webhook"
}
```

### Dial (Transfer Call)
```json
{
  "action": "dial",
  "number": "+15551234567",
  "timeout": 30,
  "callerId": "+15559876543"
}
```

### Play (Audio File)
```json
{
  "action": "play",
  "url": "https://your-domain.com/audio/file.mp3"
}
```

### Hangup
```json
{
  "action": "hangup"
}
```

## Error Handling

The system includes comprehensive error handling:

1. **Invalid Input**: User pressed invalid key
   - Plays error message
   - Repeats menu options
   - Tracks retry count

2. **Max Retries Reached**: User exceeded retry limit
   - Automatically transfers to operator
   - Logs event for review

3. **System Error**: Server or API error
   - Plays apologetic message
   - Gracefully ends call
   - Logs error for debugging

## Call Flow Example

1. **Call Arrives**
   ```
   User calls → IRISX → Webhook (call.answered)
   ```

2. **Main Menu Played**
   ```
   Server responds with TTS and gather action
   ```

3. **User Presses 1 (Sales)**
   ```
   IRISX → Webhook (dtmf.received, digits: "1")
   Server responds with sales menu
   ```

4. **User Presses 2 (Existing Customers)**
   ```
   IRISX → Webhook (dtmf.received, digits: "2")
   Server responds with transfer action
   Call transferred to sales team
   ```

## Testing

### Test with cURL

Simulate a call answered event:
```bash
curl -X POST http://localhost:3000/ivr/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "call_uuid": "test-123",
    "event": "call.answered",
    "from_number": "+15559876543",
    "to_number": "+15551234567"
  }'
```

Simulate DTMF input:
```bash
curl -X POST http://localhost:3000/ivr/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "call_uuid": "test-123",
    "event": "dtmf.received",
    "digits": "1",
    "menu_id": "main"
  }'
```

## Production Considerations

1. **Database Integration**
   - Store call logs and IVR interactions
   - Track menu navigation patterns
   - Analyze user behavior

2. **Monitoring**
   - Log all webhook requests
   - Track error rates
   - Monitor response times

3. **Security**
   - Implement webhook signature verification
   - Rate limit webhook endpoints
   - Validate all input data

4. **Scaling**
   - Use load balancer for multiple instances
   - Implement caching for menu configurations
   - Optimize database queries

5. **Business Hours**
   - Add time-based routing
   - Different menus for business/after hours
   - Holiday schedules

## Troubleshooting

### "Webhook not receiving calls"
- Verify webhook URL is publicly accessible
- Check IRISX phone number configuration
- Ensure server is running
- Test with ngrok in development

### "TTS not working"
- Verify IRISX account has TTS enabled
- Check voice name is valid
- Ensure text is properly formatted

### "Call transfers failing"
- Verify destination phone numbers are valid
- Check caller ID is authorized
- Ensure phone numbers have proper formatting

### "Menu not progressing"
- Check action_url is correct
- Verify BASE_URL environment variable
- Inspect webhook payload in logs

## Best Practices

1. **Keep menus simple** - 3-4 options per menu maximum
2. **Clear instructions** - Tell users exactly what to press
3. **Provide escape routes** - Always offer "press 0 for operator"
4. **Set reasonable timeouts** - 5 seconds for input, 30 seconds for transfers
5. **Log everything** - Track all interactions for analysis
6. **Test thoroughly** - Test all menu paths and edge cases
7. **Monitor performance** - Track completion rates and drop-off points

## Support

- Documentation: https://docs.irisx.io
- API Reference: https://api.irisx.io/docs
- Support: support@irisx.io

## License

MIT
