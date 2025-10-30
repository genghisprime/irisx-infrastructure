# IRISX Simple Call Example

A production-ready example demonstrating how to make outbound calls using the IRISX API with comprehensive error handling.

## Features

- Simple outbound call initiation
- Real-time call status monitoring
- Automatic carrier selection (Least Cost Routing)
- Comprehensive error handling
- Call cost tracking
- Recording support
- Custom metadata support

## Prerequisites

- Node.js 18.0.0 or higher
- IRISX account with API credentials
- At least one phone number provisioned in your IRISX account

## Installation

1. Clone or download this example
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file from the example:

```bash
cp .env.example .env
```

4. Edit `.env` and add your credentials:

```env
IRISX_API_URL=https://api.irisx.io
IRISX_API_KEY=your_api_key_here
IRISX_TENANT_ID=1
FROM_NUMBER=+15551234567
TO_NUMBER=+15559876543
```

## Usage

### Basic Usage

Run the example with default settings:

```bash
npm start
```

### Using Custom Phone Numbers

Set phone numbers via environment variables:

```bash
FROM_NUMBER=+15551234567 TO_NUMBER=+15559876543 npm start
```

### Using as a Module

You can import and use the functions in your own code:

```javascript
import { makeCall, getCallStatus, monitorCall } from './index.js';

// Make a call
const call = await makeCall('+15551234567', '+15559876543', {
  timeout: 60,
  record: true,
  metadata: { campaign: 'sales' }
});

// Get call status
const status = await getCallStatus(call.uuid);

// Monitor call until completion
await monitorCall(call.uuid);
```

## Configuration Options

### Call Options

```javascript
{
  timeout: 60,              // Call timeout in seconds (default: 60)
  record: true,             // Enable call recording (default: false)
  callerId: '+15551234567', // Custom caller ID (default: fromNumber)
  metadata: {               // Custom metadata (optional)
    campaign: 'sales',
    customer_id: '12345'
  }
}
```

## API Response

### Success Response

```json
{
  "success": true,
  "data": {
    "id": 123,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "tenant_id": 1,
    "direction": "outbound",
    "from_number": "+15551234567",
    "to_number": "+15559876543",
    "status": "queued",
    "carrier_id": 1,
    "carrier_rate": 0.0040,
    "created_at": "2025-10-30T10:00:00.000Z"
  },
  "routing": {
    "primary": {
      "id": 1,
      "name": "Telnyx",
      "rate_per_minute": 0.0040
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "No healthy carriers available for destination"
}
```

## Call Statuses

- `queued` - Call has been queued
- `ringing` - Call is ringing
- `in-progress` - Call is active
- `completed` - Call completed successfully
- `failed` - Call failed
- `no-answer` - No answer
- `busy` - Line busy
- `cancelled` - Call cancelled

## Error Handling

The example includes comprehensive error handling for:

- API authentication errors
- Invalid phone numbers
- Network timeouts
- Carrier failures
- Rate limit errors
- Invalid configuration

## Cost Tracking

After a call completes, you'll see the total cost:

```
Call Summary:
   Final Status: completed
   Duration: 120 seconds
   Total Cost: $0.008
   Hangup Cause: NORMAL_CLEARING
```

## Monitoring Calls

The example includes automatic call monitoring:

```javascript
await monitorCall(callUuid, {
  maxAttempts: 60,    // Maximum polling attempts
  intervalMs: 5000    // Poll every 5 seconds
});
```

Output:
```
Monitoring call 550e8400-e29b-41d4-a716-446655440000...
   [10:00:05] Status: queued
   [10:00:10] Status: ringing
   [10:00:15] Status: in-progress
   [10:02:20] Status: completed
```

## Best Practices

1. **Always validate environment variables** before making calls
2. **Use try-catch blocks** for all API calls
3. **Monitor call status** for production applications
4. **Set appropriate timeouts** based on your use case
5. **Store call UUIDs** for later reference and reconciliation
6. **Handle all possible call statuses** in your application logic

## Troubleshooting

### "IRISX_API_KEY is required"
- Make sure your `.env` file exists and contains valid credentials
- Check that `IRISX_API_KEY` is set correctly

### "No healthy carriers available"
- Verify your account has active carriers configured
- Check that the destination number is valid and supported
- Contact support if the issue persists

### "Call timeout"
- Increase the `timeout_seconds` value
- Check that the destination number is reachable

### Network errors
- Verify your internet connection
- Check firewall settings
- Ensure the API URL is correct

## Support

For help with this example:

- Documentation: https://docs.irisx.io
- API Reference: https://api.irisx.io/docs
- Support: support@irisx.io

## License

MIT
