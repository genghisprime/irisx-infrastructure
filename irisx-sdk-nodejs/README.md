# IRISX Node.js SDK

Official Node.js SDK for IRISX Communications Platform - Voice, SMS, and Email APIs

[![npm version](https://badge.fury.io/js/%40irisx%2Fsdk.svg)](https://www.npmjs.com/package/@irisx/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @irisx/sdk
```

## Quick Start

```javascript
const IRISX = require('@irisx/sdk');

const irisx = new IRISX({
  apiKey: process.env.IRISX_API_KEY
});

// Make a call
const call = await irisx.calls.create({
  to: '+15551234567',
  from: '+15559876543',
  record: true
});

console.log(`Call initiated: ${call.uuid}`);
```

## Features

- ✅ **Voice Calls** - Make and receive calls with intelligent routing
- ✅ **SMS/MMS** - Send text messages with delivery tracking
- ✅ **Email** - Transactional email with open/click tracking
- ✅ **Webhooks** - Real-time event notifications
- ✅ **Phone Numbers** - Search, purchase, and configure numbers
- ✅ **Analytics** - Usage statistics and reporting
- ✅ **TypeScript** - Full type definitions included
- ✅ **Error Handling** - Comprehensive error types
- ✅ **Retry Logic** - Automatic retry with exponential backoff

## Documentation

- 📚 [Full Documentation](https://docs.useiris.com/sdks/nodejs)
- 📖 [API Reference](https://docs.useiris.com/api-reference)
- 💡 [Code Examples](https://github.com/irisx/examples)

## Usage Examples

### Making Calls

```javascript
const call = await irisx.calls.create({
  to: '+15551234567',
  from: '+15559876543',
  webhook_url: 'https://yourapp.com/webhooks',
  record: true,
  metadata: {
    customer_id: 'cust_123'
  }
});
```

### Sending SMS

```javascript
const message = await irisx.sms.send({
  to: '+15551234567',
  from: '+15559876543',
  body: 'Hello from IRISX!'
});
```

### Webhooks

```javascript
const webhook = await irisx.webhooks.create({
  url: 'https://yourapp.com/webhooks/irisx',
  events: ['call.completed', 'sms.delivered']
});
```

## TypeScript

Full TypeScript support with type definitions:

```typescript
import IRISX, { Call, SMS } from '@irisx/sdk';

const irisx = new IRISX({ apiKey: process.env.IRISX_API_KEY! });

const call: Call = await irisx.calls.create({
  to: '+15551234567',
  from: '+15559876543'
});
```

## Error Handling

```javascript
const { IRISXError, RateLimitError } = require('@irisx/sdk');

try {
  const call = await irisx.calls.create({ /* ... */ });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited - retry after ${error.retry_after}s`);
  } else if (error instanceof IRISXError) {
    console.error(`API Error: ${error.message}`);
  }
}
```

## Support

- 💬 [Discord Community](https://discord.gg/irisx)
- 📧 Email: support@useiris.com
- 🐛 [GitHub Issues](https://github.com/irisx/sdk-nodejs/issues)

## License

MIT © IRISX
