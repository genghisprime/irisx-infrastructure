# IRISX API Endpoints Reference

**Version:** 1.0.0
**Base URL:** `http://3.83.53.69:3000` (internal) | `https://api.irisx.com` (production)
**Authentication:** API Key via `X-API-Key` header

---

## Authentication

All API endpoints (except `/health` and `/`) require authentication via API key.

**Header:**
```
X-API-Key: your_api_key_here
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid API key
- `403 Forbidden` - API key inactive or tenant account not active

---

## Rate Limiting

API endpoints have rate limiting to prevent abuse:

- **Standard endpoints:** 100 requests per minute
- **Call creation (POST /v1/calls):** 10 requests per minute

**Rate Limit Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1698624000000
```

**Rate Limit Error (429):**
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Maximum 10 requests per 60 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60
}
```

---

## Endpoints

### Health Check

**GET /health**

Check API server health and database/Redis connectivity.

**Authentication:** None required

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T01:43:59.580Z",
  "database": {
    "status": "connected",
    "serverTime": "2025-10-29T01:43:59.577Z"
  },
  "redis": {
    "status": "connected"
  },
  "version": "1.0.0"
}
```

**Response 503 (Unhealthy):**
```json
{
  "status": "unhealthy",
  "error": "Connection refused",
  "timestamp": "2025-10-29T01:43:59.580Z"
}
```

---

### Create Call

**POST /v1/calls**

Initiate an outbound call.

**Authentication:** Required
**Rate Limit:** 10 requests/minute

**Request Body:**
```json
{
  "to": "+15555559999",
  "from": "+15555551234",
  "record": true,
  "metadata": {
    "customer_id": "123",
    "campaign": "summer_sale"
  }
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Destination phone number (E.164 format) |
| `from` | string | No | Caller ID (must be owned by tenant, uses default if omitted) |
| `record` | boolean | No | Whether to record the call (default: false) |
| `metadata` | object | No | Custom key-value pairs for tracking |

**Response 201 (Success):**
```json
{
  "sid": "CA834003994ba453cfe344047731d71cd5",
  "status": "initiated",
  "from": "+15555551234",
  "to": "+15555559999",
  "initiated_at": "2025-10-29T01:43:59.580Z",
  "record": true,
  "metadata": {
    "customer_id": "123",
    "campaign": "summer_sale"
  }
}
```

**Response 400 (Validation Error):**
```json
{
  "error": "Validation Error",
  "message": "Invalid request data",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_string",
      "message": "Invalid phone number format (E.164)",
      "path": ["to"]
    }
  ]
}
```

**Response 400 (No Phone Number):**
```json
{
  "error": "Bad Request",
  "message": "No active phone number configured",
  "code": "NO_DEFAULT_NUMBER"
}
```

**Response 403 (Invalid Caller ID):**
```json
{
  "error": "Forbidden",
  "message": "Invalid caller ID",
  "code": "INVALID_CALLER_ID"
}
```

---

### Get Call Details

**GET /v1/calls/:sid**

Retrieve details for a specific call.

**Authentication:** Required
**Rate Limit:** 100 requests/minute

**Parameters:**

| Parameter | Type | Location | Description |
|-----------|------|----------|-------------|
| `sid` | string | path | Call SID (e.g., CA834003994ba453cfe344047731d71cd5) |

**Response 200:**
```json
{
  "sid": "CA834003994ba453cfe344047731d71cd5",
  "direction": "outbound",
  "from": "+15555551234",
  "to": "+15555559999",
  "status": "initiated",
  "duration": null,
  "recording_url": null,
  "answered_at": null,
  "ended_at": null,
  "initiated_at": "2025-10-29T01:43:59.580Z",
  "metadata": {
    "customer_id": "123"
  }
}
```

**Call Status Values:**
- `initiated` - Call is being set up
- `ringing` - Destination is ringing
- `in-progress` - Call is active
- `completed` - Call ended successfully
- `failed` - Call failed
- `busy` - Destination was busy
- `no-answer` - No one answered
- `canceled` - Call was canceled

**Response 404:**
```json
{
  "error": "Not Found",
  "message": "Call not found",
  "code": "CALL_NOT_FOUND"
}
```

---

### List Calls

**GET /v1/calls**

List calls for the authenticated tenant with pagination.

**Authentication:** Required
**Rate Limit:** 100 requests/minute

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Number of results (max 100) |
| `offset` | integer | No | 0 | Pagination offset |
| `status` | string | No | - | Filter by call status |

**Examples:**
```
GET /v1/calls
GET /v1/calls?limit=10&offset=20
GET /v1/calls?status=completed
GET /v1/calls?status=in-progress&limit=25
```

**Response 200:**
```json
{
  "calls": [
    {
      "sid": "CA834003994ba453cfe344047731d71cd5",
      "direction": "outbound",
      "from": "+15555551234",
      "to": "+15555559999",
      "status": "initiated",
      "duration": null,
      "answered_at": null,
      "ended_at": null,
      "initiated_at": "2025-10-29T01:43:59.580Z"
    },
    {
      "sid": "CA123test",
      "direction": "outbound",
      "from": "+15555551234",
      "to": "+15555558888",
      "status": "completed",
      "duration": 45,
      "answered_at": "2025-10-29T01:42:15.123Z",
      "ended_at": "2025-10-29T01:43:00.456Z",
      "initiated_at": "2025-10-29T01:42:11.080Z"
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_API_KEY` | 401 | X-API-Key header not provided |
| `INVALID_API_KEY` | 401 | API key not found or invalid |
| `API_KEY_INACTIVE` | 403 | API key is not active |
| `TENANT_INACTIVE` | 403 | Tenant account is not active |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `NO_DEFAULT_NUMBER` | 400 | No active phone number configured |
| `INVALID_CALLER_ID` | 403 | Caller ID not owned by tenant |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `CALL_NOT_FOUND` | 404 | Call SID not found |
| `CALL_CREATE_ERROR` | 500 | Failed to create call |
| `CALL_RETRIEVE_ERROR` | 500 | Failed to retrieve call |
| `CALL_LIST_ERROR` | 500 | Failed to list calls |

---

## Testing with curl

### Create a Call
```bash
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test_key_12345" \
  -d '{
    "to": "+15555559999",
    "record": true,
    "metadata": {
      "customer_id": "123"
    }
  }'
```

### Get Call Details
```bash
curl -X GET http://3.83.53.69:3000/v1/calls/CA834003994ba453cfe344047731d71cd5 \
  -H "X-API-Key: test_key_12345"
```

### List Calls
```bash
curl -X GET "http://3.83.53.69:3000/v1/calls?limit=10" \
  -H "X-API-Key: test_key_12345"
```

### Health Check
```bash
curl -X GET http://3.83.53.69:3000/health
```

---

## Test Credentials

**Tenant:** Test Company
**API Key:** `test_key_12345`
**Phone Number:** `+15555551234`

**Note:** These are test credentials for development. Do not use in production!

---

## Next Steps

- [ ] Install nginx reverse proxy for HTTPS
- [ ] Add SSL certificate (Let's Encrypt)
- [ ] Implement FreeSWITCH integration (ESL)
- [ ] Add webhook delivery system
- [ ] Build SMS endpoints
- [ ] Add phone number management endpoints

---

## Changelog

**v1.0.0** (2025-10-29)
- Initial API release
- POST /v1/calls endpoint
- GET /v1/calls/:sid endpoint
- GET /v1/calls endpoint
- API key authentication
- Rate limiting (10 req/min for calls, 100 req/min for reads)
- Multi-tenant support
- Input validation with Zod
- Database transactions for data integrity

---

Last Updated: October 29, 2025
