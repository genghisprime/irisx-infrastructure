# IRISX Platform - API Testing Guide

**Production Ready Testing for Day 1 Launch**

---

## 📋 Overview

This guide provides comprehensive testing procedures for all IRISX API endpoints. The testing suite is designed to validate production readiness before Day 1 launch.

**Test Coverage:**
- 62+ API endpoints across all services
- Authentication & security validation
- Error handling & edge cases
- Performance & response time checks
- Integration testing with dependencies

---

## 🚀 Quick Start

### Prerequisites
```bash
# Node.js 22+ required
node --version

# Install dependencies (if running locally)
cd /path/to/IRISX
npm install
```

### Running Tests

**1. Configure Test Environment:**
```bash
cd IRISX/tests
cp .env.example .env
# Edit .env with your API credentials
```

**2. Run All Tests:**
```bash
node tests/api-test-suite.js
```

**3. Run Specific Test Suite:**
```bash
# Health checks only
node tests/api-test-suite.js --suite=health

# Webhook tests only
node tests/api-test-suite.js --suite=webhooks
```

**4. Verbose Mode:**
```bash
node tests/api-test-suite.js --verbose
```

---

## 📊 Test Suites

### 1. Health & System Tests

**Endpoints Tested:**
- `GET /health` - System health check
- `GET /` - Root endpoint
- `GET /v1` - API version info

**What's Validated:**
- ✅ All services connected (DB, Redis, FreeSWITCH)
- ✅ Response format correctness
- ✅ Response time < 100ms

**Example Request:**
```bash
curl http://3.83.53.69:3000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T16:00:00.000Z",
  "database": {
    "status": "connected",
    "serverTime": "2025-10-29T16:00:00.000Z"
  },
  "redis": {
    "status": "connected"
  },
  "freeswitch": {
    "status": "connected"
  },
  "ivr": {
    "activeSessions": 0
  },
  "version": "1.0.0"
}
```

---

### 2. Voice/Call API Tests

**Endpoints Tested:**
- `POST /v1/calls` - Create outbound call
- `GET /v1/calls` - List calls
- `GET /v1/calls/:sid` - Get call details
- `DELETE /v1/calls/:sid` - Hangup call

**What's Validated:**
- ✅ Authentication required
- ✅ Input validation (phone numbers, tenant ID)
- ✅ Rate limiting enforcement
- ✅ Call state management
- ✅ FreeSWITCH integration

**Example Request:**
```bash
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "to": "+15559876543",
    "url": "https://example.com/twiml"
  }'
```

---

### 3. Webhook API Tests

**Endpoints Tested:**
- `GET /v1/webhooks` - List webhooks
- `POST /v1/webhooks` - Create webhook
- `GET /v1/webhooks/:id` - Get webhook details
- `PUT /v1/webhooks/:id` - Update webhook
- `DELETE /v1/webhooks/:id` - Delete webhook
- `GET /v1/webhooks/event-types` - List event types
- `POST /v1/webhooks/:id/test` - Test webhook delivery
- `GET /v1/webhooks/:id/deliveries` - List deliveries
- `POST /v1/webhooks/deliveries/:id/retry` - Retry delivery

**What's Validated:**
- ✅ HMAC signature generation
- ✅ Webhook URL validation
- ✅ Event type validation
- ✅ Delivery tracking
- ✅ Retry logic with exponential backoff

**Example Request:**
```bash
curl -X POST http://3.83.53.69:3000/v1/webhooks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks",
    "events": ["call.created", "call.completed", "sms.received"],
    "secret": "your-webhook-secret"
  }'
```

**Webhook Signature Verification:**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

### 4. Email API Tests

**Endpoints Tested:**
- `POST /v1/email/send` - Send email
- `POST /v1/email/send-template` - Send templated email
- `GET /v1/email` - List emails
- `GET /v1/email/:id` - Get email details
- `GET /v1/email/stats` - Email statistics
- `GET /v1/email/templates` - List templates
- `POST /v1/email/templates` - Create template
- `GET /v1/email/templates/:id` - Get template
- `PUT /v1/email/templates/:id` - Update template
- `DELETE /v1/email/templates/:id` - Delete template

**What's Validated:**
- ✅ Multi-provider support (Elastic Email primary)
- ✅ Email validation (RFC 5322)
- ✅ Template variable substitution
- ✅ Attachment handling
- ✅ Bounce/unsubscribe tracking
- ✅ Provider failover

**Example Request:**
```bash
curl -X POST http://3.83.53.69:3000/v1/email/send \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@irisx.com",
    "to": "user@example.com",
    "subject": "Welcome to IRISX",
    "html": "<h1>Welcome!</h1><p>Thank you for signing up.</p>",
    "text": "Welcome! Thank you for signing up."
  }'
```

---

### 5. Analytics API Tests

**Endpoints Tested:**
- `GET /v1/analytics/dashboard` - Dashboard overview
- `GET /v1/analytics/calls` - Call analytics
- `GET /v1/analytics/sms` - SMS analytics
- `GET /v1/analytics/email` - Email analytics
- `GET /v1/analytics/usage` - Usage metrics
- `GET /v1/analytics/webhooks` - Webhook analytics

**What's Validated:**
- ✅ Real-time metrics accuracy
- ✅ Time series data formatting
- ✅ Aggregation correctness (hourly, daily, monthly)
- ✅ Filtering by date range
- ✅ Multi-tenant data isolation

**Example Request:**
```bash
curl "http://3.83.53.69:3000/v1/analytics/calls?startDate=2025-10-01&endDate=2025-10-31&groupBy=day" \
  -H "X-API-Key: your-api-key"
```

**Expected Response:**
```json
{
  "period": {
    "start": "2025-10-01T00:00:00.000Z",
    "end": "2025-10-31T23:59:59.999Z"
  },
  "summary": {
    "totalCalls": 1250,
    "totalDuration": 45600,
    "averageDuration": 36,
    "inboundCalls": 800,
    "outboundCalls": 450
  },
  "timeSeries": [
    {
      "date": "2025-10-01",
      "calls": 45,
      "duration": 1620,
      "avgDuration": 36
    }
  ]
}
```

---

### 6. TTS API Tests

**Endpoints Tested:**
- `POST /v1/tts/generate` - Generate speech from text
- `GET /v1/tts/voices` - List available voices
- `GET /v1/tts/providers` - List TTS providers

**What's Validated:**
- ✅ Multi-provider support (OpenAI, ElevenLabs, AWS Polly)
- ✅ Caching functionality
- ✅ Audio format handling (MP3, WAV)
- ✅ Voice selection
- ✅ Cost tracking
- ✅ Provider failover

**Example Request:**
```bash
curl -X POST http://3.83.53.69:3000/v1/tts/generate \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, welcome to IRISX communications platform.",
    "voice": "alloy",
    "provider": "openai",
    "format": "mp3"
  }'
```

**Expected Response:**
```json
{
  "audioUrl": "https://s3.amazonaws.com/irisx-tts-cache/abc123.mp3",
  "duration": 3.5,
  "characterCount": 48,
  "provider": "openai",
  "voice": "alloy",
  "cached": false,
  "cost": {
    "cents": 0.072,
    "currency": "USD"
  }
}
```

---

### 7. Error Handling Tests

**What's Validated:**
- ✅ 400 Bad Request - Invalid input
- ✅ 401 Unauthorized - Missing/invalid API key
- ✅ 403 Forbidden - Insufficient permissions
- ✅ 404 Not Found - Resource doesn't exist
- ✅ 422 Unprocessable Entity - Validation errors
- ✅ 429 Too Many Requests - Rate limit exceeded
- ✅ 500 Internal Server Error - Server errors
- ✅ 503 Service Unavailable - Dependency failures

**Example Error Response:**
```json
{
  "error": "Validation Error",
  "message": "Invalid phone number format",
  "code": "INVALID_PHONE_NUMBER",
  "field": "to",
  "timestamp": "2025-10-29T16:00:00.000Z"
}
```

---

### 8. Security Tests

**What's Validated:**
- ✅ API key authentication
- ✅ Rate limiting (per minute & hour)
- ✅ CORS headers
- ✅ SQL injection prevention
- ✅ XSS prevention
- ✅ HMAC signature verification
- ✅ Multi-tenant data isolation

**Security Best Practices:**
```javascript
// 1. Always use HTTPS in production
const API_URL = 'https://api.irisx.com';

// 2. Store API keys securely (never in code)
const API_KEY = process.env.IRISX_API_KEY;

// 3. Validate webhook signatures
function verifyWebhook(req) {
  const signature = req.headers['x-irisx-signature'];
  const timestamp = req.headers['x-irisx-timestamp'];
  const secret = process.env.WEBHOOK_SECRET;

  return verifySignature(req.body, signature, secret, timestamp);
}

// 4. Handle rate limits gracefully
if (response.status === 429) {
  const retryAfter = response.headers['retry-after'];
  await sleep(retryAfter * 1000);
  // Retry request
}
```

---

## 🎯 Performance Benchmarks

### Target Response Times (Day 1 Launch)

| Endpoint Type | Target | Acceptable | Action Required |
|---------------|--------|------------|-----------------|
| Health check | < 10ms | < 50ms | > 50ms |
| Simple GET (list) | < 50ms | < 200ms | > 200ms |
| POST (create) | < 100ms | < 500ms | > 500ms |
| Analytics queries | < 200ms | < 1s | > 1s |
| TTS generation | < 2s | < 5s | > 5s |

### Load Testing Recommendations

**Day 1 Expected Load:**
- 100 concurrent users
- 1,000 requests/minute
- 60,000 requests/hour

**Test Commands:**
```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test health endpoint (1000 requests, 10 concurrent)
ab -n 1000 -c 10 http://3.83.53.69:3000/health

# Test with API key
ab -n 1000 -c 10 -H "X-API-Key: your-key" \
   http://3.83.53.69:3000/v1/calls
```

---

## 📝 Test Reporting

### Automated Test Reports

The test suite generates detailed reports:

**Console Output:**
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║    IRISX Platform - API Test Suite                        ║
║    Testing http://3.83.53.69:3000                         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

=== Health & System Tests ===

▶ GET /health - System health check
  ✓ PASS

▶ GET / - Root endpoint
  ✓ PASS

=== Voice/Call API Tests ===

▶ GET /v1/calls - List calls
  ✓ PASS

...

============================================================
Test Summary

  Total Tests:  42
  Passed:       42
  Failed:       0
  Skipped:      0
  Duration:     3.24s

✓ All tests passed!
```

### CI/CD Integration

**GitHub Actions Example:**
```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Run API tests
        env:
          API_BASE_URL: ${{ secrets.API_URL }}
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
        run: node tests/api-test-suite.js
```

---

## 🔧 Troubleshooting

### Common Issues

**1. Connection Refused**
```
Error: connect ECONNREFUSED 3.83.53.69:3000
```
**Solution:** Verify API server is running
```bash
ssh ubuntu@3.83.53.69 'pm2 list'
```

**2. 401 Unauthorized**
```json
{"error": "Unauthorized", "message": "Invalid API key"}
```
**Solution:** Check API key in `.env` file

**3. Tests Timing Out**
```
Error: Request timeout after 30000ms
```
**Solution:** Check network connectivity and server load

**4. Rate Limit Errors**
```json
{"error": "Too Many Requests", "message": "Rate limit exceeded"}
```
**Solution:** Add delays between requests or use different API keys

---

## 📚 Additional Resources

- [API Documentation](API_REFERENCE.md)
- [Webhook Integration Guide](features/WEBHOOK_SYSTEM_COMPLETE.md)
- [Email System Guide](features/EMAIL_SYSTEM_COMPLETE.md)
- [TTS System Guide](features/TTS_SYSTEM_COMPLETE.md)
- [Deployment Status](DEPLOYMENT_STATUS.md)

---

## ✅ Pre-Launch Checklist

Before Day 1 launch, ensure:

- [ ] All test suites pass (42/42 tests)
- [ ] Response times within acceptable range
- [ ] Load testing completed (1,000 req/min)
- [ ] Error handling validated
- [ ] Security tests pass
- [ ] Rate limiting configured correctly
- [ ] Monitoring & alerting active
- [ ] Database backups configured
- [ ] SSL certificates installed
- [ ] API documentation complete

---

**Testing Team:** IRISX Platform Development
**Last Updated:** October 29, 2025
**Next Review:** Before Production Launch
