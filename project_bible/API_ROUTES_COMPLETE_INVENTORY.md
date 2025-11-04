# IRISX Platform - Complete API Routes Inventory

**Last Updated:** November 2, 2025  
**Purpose:** Complete reference of all API endpoints for admin panel scoping

---

## CUSTOMER ROUTES (Tenant User Endpoints)

### Conversations - Unified Inbox
**File:** `/api/src/routes/conversations.js`

```
GET    /v1/conversations                      List conversations (filterable by channel, status, priority, assigned_to)
GET    /v1/conversations/:id                  Get conversation details + messages
POST   /v1/conversations/:id/messages         Send message/reply
PATCH  /v1/conversations/:id/assign           Assign conversation to agent
PATCH  /v1/conversations/:id/status           Update status (open, pending, closed, snoozed)
PATCH  /v1/conversations/:id                  Update priority, tags, category, subject
DELETE /v1/conversations/:id                  Archive/delete conversation
```

**Query Parameters:**
- `channel` - sms, email, whatsapp, discord, slack, telegram, teams, voice, all
- `status` - open, pending, closed, snoozed, all
- `priority` - urgent, high, normal, low, all
- `assigned_to` - me, unassigned, all
- `search` - search by subject, customer_name, identifier

---

### Voice Calls
**File:** `/api/src/routes/calls.js`

```
POST   /v1/calls                              Initiate outbound call via FreeSWITCH
```

**Request Body:**
```json
{
  "to": "+1234567890",              // E.164 format
  "from": "+0987654321",            // optional (uses default if omitted)
  "record": true,                   // optional
  "metadata": {}                    // optional
}
```

---

### WhatsApp
**File:** `/api/src/routes/whatsapp.js`

```
POST   /v1/whatsapp/send/text                 Send text message
POST   /v1/whatsapp/send/template             Send template message
POST   /v1/whatsapp/send/media                Send media (image, file, audio, video)
POST   /v1/whatsapp/send/button               Send button message
POST   /v1/whatsapp/mark-read                 Mark message as read
POST   /v1/whatsapp/webhook                   Inbound webhook (verification & events)
GET    /v1/whatsapp/accounts                  List WhatsApp accounts
GET    /v1/whatsapp/templates                 List WhatsApp templates
```

---

### Social Media (Discord, Slack, Teams, Telegram)
**File:** `/api/src/routes/social-media.js`

```
POST   /v1/social/webhook/discord             Discord gateway events
POST   /v1/social/webhook/slack               Slack webhook events
POST   /v1/social/webhook/teams               Microsoft Teams webhook
POST   /v1/social/webhook/telegram            Telegram bot webhook
POST   /v1/social/send                        Send message to social platform
```

---

### Email Automation
**File:** `/api/src/routes/email-automation.js`

```
GET    /v1/email/automation/rules             List automation rules
POST   /v1/email/automation/rules             Create automation rule
PATCH  /v1/email/automation/rules/:id         Update automation rule
DELETE /v1/email/automation/rules/:id         Delete automation rule
GET    /v1/email/automation/executions        Get automation execution history
GET    /v1/email/automation/stats             Get automation performance stats
```

---

### Email Inbound & Routing
**File:** `/api/src/routes/email-inbound.js`

```
POST   /v1/email/inbound/webhook/sendgrid     SendGrid inbound webhook
POST   /v1/email/inbound/webhook/mailgun      Mailgun inbound webhook
POST   /v1/email/inbound/webhook/ses          AWS SES inbound webhook
POST   /v1/email/inbound/webhook/generic      Generic MIME email webhook
GET    /v1/email/:id/raw                      Get raw MIME email from S3
GET    /v1/email/:id/thread                   Get email conversation thread
POST   /v1/email/routing-rules                Create email routing rule
GET    /v1/email/routing-rules                List routing rules
DELETE /v1/email/routing-rules/:id            Delete routing rule
```

---

### API Keys
**File:** `/api/src/routes/api-keys.js`

```
POST   /v1/api-keys                           Create new API key
GET    /v1/api-keys                           List tenant's API keys
DELETE /v1/api-keys/:id                       Revoke API key
```

---

### Analytics - Agent Performance
**File:** `/api/src/routes/analytics-agents.js`

```
GET    /v1/analytics/agents/overview          Agent overview stats
GET    /v1/analytics/agents/:id               Individual agent metrics
GET    /v1/analytics/agents/leaderboard       Agent leaderboard
GET    /v1/analytics/agents/performance       Agent performance by time range
```

**Query Parameters:**
- `timeRange` - 24h, 7d, 30d, all

---

## ADMIN ROUTES (IRISX Staff Only)

### Admin Authentication
**File:** `/api/src/routes/admin-auth.js`

```
POST   /admin/login                           Admin login
POST   /admin/logout                          Admin logout
GET    /admin/me                              Get current admin info
POST   /admin/change-password                 Change admin password
GET    /admin/sessions                        List active admin sessions
DELETE /admin/sessions/:id                    Revoke admin session
```

---

### Admin Dashboard
**File:** `/api/src/routes/admin-dashboard.js`

```
GET    /admin/dashboard/overview              Platform health overview
GET    /admin/dashboard/stats                 Detailed stats by channel
GET    /admin/dashboard/charts/daily-activity Daily activity chart (30d)
GET    /admin/dashboard/charts/tenant-growth  Tenant growth chart (90d)
GET    /admin/dashboard/revenue               Revenue overview & MRR
GET    /admin/dashboard/recent-activity       Recent platform events
GET    /admin/dashboard/system-health         Database health & performance
GET    /admin/dashboard/audit-log             Admin action audit log (paginated)
```

**Query Parameters:**
- `timeRange` - 1d, 7d, 30d, 90d, all (for stats)
- `channel` - calls, sms, email, whatsapp, all (for charts)
- `page` - pagination (default 1)
- `limit` - results per page (default 50, max 200)
- `action` - filter audit log by action type

---

### Admin Tenant Management
**File:** `/api/src/routes/admin-tenants.js`

```
GET    /admin/tenants                         List all tenants (paginated, filterable)
GET    /admin/tenants/:id                     Get tenant details + usage stats
POST   /admin/tenants                         Create new tenant
PATCH  /admin/tenants/:id                     Update tenant
POST   /admin/tenants/:id/suspend             Suspend tenant
POST   /admin/tenants/:id/reactivate          Reactivate tenant
DELETE /admin/tenants/:id                     Soft delete tenant
GET    /admin/tenants/:id/audit-log           Get tenant's audit log
```

**List Tenants Query Parameters:**
- `status` - active, suspended, trial, cancelled
- `plan` - trial, starter, professional, enterprise
- `search` - search by name or domain
- `page` - pagination (default 1)
- `limit` - results per page (default 50, max 100)

**Create Tenant Request Body:**
```json
{
  "name": "Company Name",
  "domain": "company.domain.com",                    // optional
  "plan": "trial|starter|professional|enterprise",  // default: trial
  "trial_days": 14,                                 // default: 14, max: 90
  "admin_email": "admin@company.com",
  "admin_first_name": "John",
  "admin_last_name": "Doe",
  "admin_password": "...",                          // optional (auto-generates if omitted)
  "notes": "..."                                    // optional
}
```

**Update Tenant Request Body:**
```json
{
  "name": "...",                                    // optional
  "domain": "...",                                  // optional
  "status": "active|suspended|trial|cancelled",    // optional
  "plan": "trial|starter|professional|enterprise", // optional
  "mrr": 99.99,                                     // optional (Monthly Recurring Revenue)
  "notes": "..."                                    // optional
}
```

---

### Admin Agent Management
**File:** `/api/src/routes/admin-agents.js`

```
POST   /v1/admin/agents                       Create new agent (with auto-provisioning)
GET    /v1/admin/agents                       List all agents (filterable)
GET    /v1/admin/agents/:id                   Get agent details + extensions
PATCH  /v1/admin/agents/:id                   Update agent (suspend/activate)
DELETE /v1/admin/agents/:id                   Delete agent & deprovision extensions
POST   /v1/admin/agents/bulk-import           Bulk import agents (up to 100)
GET    /v1/admin/freeswitch/status            Get FreeSWITCH server status
```

**Create Agent Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@company.com",
  "role": "agent|supervisor|admin",          // default: agent
  "extensions_count": 1,                      // default: 1, max: 5
  "send_welcome_email": true                  // default: true
}
```

**Update Agent Request Body:**
```json
{
  "first_name": "...",                        // optional
  "last_name": "...",                         // optional
  "email": "...",                             // optional
  "status": "active|suspended"                // optional
}
```

**Bulk Import Request Body:**
```json
{
  "agents": [
    {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@company.com",
      "role": "agent",                        // optional, default: agent
      "extensions_count": 1,                  // optional, default: 1
      "send_welcome_email": true              // optional, default: true
    },
    // ... more agents
  ]
}
```

**List Agents Query Parameters:**
- `status` - active, suspended
- `role` - agent, supervisor, admin
- `page` - pagination (default 1)
- `limit` - results per page (default 50)

---

### Admin Global Search
**File:** `/api/src/routes/admin-search.js`

```
GET    /admin/search                          Global search across resources
GET    /admin/search/tenants                  Search tenants
GET    /admin/search/users                    Search users across tenants
GET    /admin/search/calls                    Search calls
GET    /admin/search/sms                      Search SMS messages
GET    /admin/search/emails                   Search emails
```

**Global Search Query Parameters:**
- `q` - search query (required, min 2 characters)
- `type` - tenant, user, agent, call, sms, email, all (default: all)
- `limit` - max results per type (default: 10, max: 50)

---

## WEBHOOK ENDPOINTS (Inbound from Providers)

### SMS (Twilio)
```
POST   /v1/sms/webhook                        Twilio SMS inbound webhook
```

### Email Webhooks
```
POST   /v1/email/inbound/webhook/sendgrid     SendGrid inbound
POST   /v1/email/inbound/webhook/mailgun      Mailgun inbound
POST   /v1/email/inbound/webhook/ses          AWS SES inbound
POST   /v1/email/inbound/webhook/generic      Generic MIME inbound
```

### Voice (FreeSWITCH)
```
POST   /v1/calls/webhook                      Call events from FreeSWITCH
```

### WhatsApp
```
POST   /v1/whatsapp/webhook                   WhatsApp webhook
```

### Social Media Webhooks
```
POST   /v1/social/webhook/discord             Discord events
POST   /v1/social/webhook/slack               Slack events
POST   /v1/social/webhook/teams               Teams events
POST   /v1/social/webhook/telegram            Telegram events
```

---

## SUMMARY BY FEATURE AREA

| Feature | # Endpoints | Main Files |
|---|---|---|
| Conversations (Unified Inbox) | 7 | conversations.js |
| Voice Calls | 1 | calls.js |
| WhatsApp | 8 | whatsapp.js |
| Social Media | 5 | social-media.js |
| Email Automation | 6 | email-automation.js |
| Email Inbound | 9 | email-inbound.js |
| API Keys | 3 | api-keys.js |
| Agent Analytics | 4 | analytics-agents.js |
| **Admin Auth** | 6 | admin-auth.js |
| **Admin Dashboard** | 8 | admin-dashboard.js |
| **Admin Tenants** | 8 | admin-tenants.js |
| **Admin Agents** | 7 | admin-agents.js |
| **Admin Search** | 6 | admin-search.js |
| **Webhooks** | 10 | various |
| **TOTAL** | ~89 | 13 files |

---

## AUTHENTICATION

### Tenant Routes
- **Bearer Token:** JWT token from login endpoint
- **Header:** `Authorization: Bearer <token>`
- **Extracted:** `tenantId` from token claims

### Admin Routes
- **Bearer Token:** JWT token from `/admin/login`
- **Header:** `Authorization: Bearer <adminToken>`
- **Extracted:** `admin` object with role (superadmin, admin, support, readonly)

---

## ERROR HANDLING

### Standard Response Formats

**Success:**
```json
{
  "success": true,
  "data": {},
  "message": "..."
}
```

**Error:**
```json
{
  "error": "Error title",
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": []  // for validation errors
}
```

### HTTP Status Codes
- `200` OK
- `201` Created
- `204` No Content
- `207` Multi-Status (partial success in bulk operations)
- `400` Bad Request (validation error)
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `409` Conflict (unique constraint violation)
- `500` Server Error

---

## PAGINATION

**Standard pagination query parameters:**
- `page` - page number (default: 1)
- `limit` - results per page (default varies, max capped)

**Response includes:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "total_pages": 3
  }
}
```

---

## FILTERING

### Common filter patterns:
- `status` - filter by status
- `role` - filter by role
- `channel` - filter by communication channel
- `priority` - filter by priority
- `search` - full-text search
- `timeRange` - time-based filtering (1d, 7d, 30d, etc.)

---

**Document:** IRISX Complete API Routes Inventory  
**Status:** Current as of Week 22  
**Next Update:** When new endpoints added
