# IRISX API Endpoints Reference

**Version:** 2.0.0
**Base URL:** `https://api.irisx.com` (production) | `http://localhost:3000` (development)
**Authentication:** API Key via `X-API-Key` header or JWT Bearer token
**Last Updated:** February 2026

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Error Handling](#error-handling)
4. [Core Endpoints](#core-endpoints)
   - [Health Check](#health-check)
   - [Calls](#calls)
   - [SMS Messages](#sms-messages)
   - [Email](#email)
5. [Messaging Channels](#messaging-channels)
   - [WhatsApp](#whatsapp)
   - [Social Media](#social-media)
   - [Business Messaging](#business-messaging)
   - [Web Chat](#web-chat)
6. [Contact Center](#contact-center)
   - [Agents](#agents)
   - [Queues](#queues)
   - [Callbacks](#callbacks)
   - [Campaigns](#campaigns)
   - [IVR](#ivr)
   - [Supervisor](#supervisor)
   - [Wallboard](#wallboard)
7. [AI & Automation](#ai--automation)
   - [AI Engine](#ai-engine)
   - [Voice Assistants](#voice-assistants)
   - [Translation](#translation)
   - [AMD (Answering Machine Detection)](#amd-answering-machine-detection)
   - [Agent Scripts](#agent-scripts)
8. [Video & Collaboration](#video--collaboration)
   - [Video Calls](#video-calls)
9. [Quality & Compliance](#quality--compliance)
   - [Quality Management](#quality-management)
   - [STIR/SHAKEN](#stirshaken)
10. [Security & Authentication](#security--authentication)
    - [SSO/SAML](#ssosaml)
11. [Analytics & Reports](#analytics--reports)
    - [Analytics](#analytics)
    - [Reports](#reports)
    - [Usage](#usage)
12. [Configuration](#configuration)
    - [Webhooks](#webhooks)
    - [API Keys](#api-keys)
    - [Tenant Settings](#tenant-settings)
    - [Billing](#billing)
13. [Admin Endpoints](#admin-endpoints)

---

## Authentication

All API endpoints (except `/health`, `/`, and public webhook receivers) require authentication.

### API Key Authentication

```
X-API-Key: your_api_key_here
```

### JWT Bearer Token

```
Authorization: Bearer <jwt_token>
```

### Error Responses

| Status | Description |
|--------|-------------|
| `401 Unauthorized` | Missing or invalid API key/token |
| `403 Forbidden` | API key inactive or tenant account not active |

---

## Rate Limiting

| Endpoint Type | Limit |
|---------------|-------|
| Standard endpoints | 100 requests/minute |
| Call creation | 10 requests/minute |
| SMS sending | 30 requests/minute |
| Bulk operations | 5 requests/minute |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1698624000000
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description",
  "code": "ERROR_CODE",
  "details": []
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `MISSING_API_KEY` | 401 | API key not provided |
| `INVALID_API_KEY` | 401 | API key invalid |
| `API_KEY_INACTIVE` | 403 | API key disabled |
| `TENANT_INACTIVE` | 403 | Tenant account disabled |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## Core Endpoints

### Health Check

**GET /health**

Check API server health and connectivity.

**Authentication:** None required

**Response 200:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-17T12:00:00.000Z",
  "database": { "status": "connected" },
  "redis": { "status": "connected" },
  "version": "2.0.0"
}
```

---

### Calls

#### Create Call

**POST /v1/calls**

Initiate an outbound call.

**Request Body:**
```json
{
  "to": "+15555559999",
  "from": "+15555551234",
  "record": true,
  "amd_enabled": false,
  "metadata": {
    "customer_id": "123",
    "campaign": "summer_sale"
  }
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Destination (E.164 format) |
| `from` | string | No | Caller ID (defaults to tenant's number) |
| `record` | boolean | No | Record call (default: false) |
| `amd_enabled` | boolean | No | Enable answering machine detection |
| `metadata` | object | No | Custom key-value pairs |

**Response 201:**
```json
{
  "sid": "CA834003994ba453cfe344047731d71cd5",
  "status": "initiated",
  "from": "+15555551234",
  "to": "+15555559999",
  "initiated_at": "2026-02-17T12:00:00.000Z"
}
```

#### Get Call Details

**GET /v1/calls/:sid**

Retrieve details for a specific call.

**Response 200:**
```json
{
  "sid": "CA834003994ba453cfe344047731d71cd5",
  "direction": "outbound",
  "from": "+15555551234",
  "to": "+15555559999",
  "status": "completed",
  "duration": 125,
  "recording_url": "https://...",
  "answered_at": "2026-02-17T12:00:05.000Z",
  "ended_at": "2026-02-17T12:02:10.000Z"
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

#### List Calls

**GET /v1/calls**

List calls with pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Results per page (max 100) |
| `offset` | integer | 0 | Pagination offset |
| `status` | string | - | Filter by status |
| `direction` | string | - | Filter: `inbound` or `outbound` |
| `from_date` | string | - | ISO date start |
| `to_date` | string | - | ISO date end |

#### End Call

**POST /v1/calls/:sid/end**

Terminate an active call.

#### Transfer Call

**POST /v1/calls/:sid/transfer**

Transfer a call to another destination.

```json
{
  "to": "+15555559999",
  "type": "blind"
}
```

#### Get Call Recording

**GET /v1/calls/:sid/recording**

Get the recording URL for a call.

#### Get Call Transcript

**GET /v1/calls/:sid/transcript**

Get AI-generated transcript for a recorded call.

---

### Call Recordings

#### List Recordings

**GET /v1/recordings**

List call recordings for the tenant.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (max 100) |
| `status` | string | Filter by recording status |
| `startDate` | string | Filter from date (ISO) |
| `endDate` | string | Filter to date (ISO) |
| `search` | string | Search by phone number |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "recordings": [
      {
        "id": 1,
        "call_sid": "CA123...",
        "call_uuid": "uuid-123",
        "from_number": "+15555551234",
        "to_number": "+15555559999",
        "direction": "outbound",
        "call_status": "completed",
        "recording_url": "https://...",
        "recording_status": "completed",
        "recording_duration_seconds": 125,
        "recording_size_bytes": 250000,
        "transcription_text": "Hello...",
        "transcription_confidence": 0.95,
        "agent_name": "John Doe",
        "created_at": "2026-02-17T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 150,
      "totalPages": 6
    }
  }
}
```

#### Get Recording

**GET /v1/recordings/:id**

Get details for a specific recording.

#### Delete Recording

**DELETE /v1/recordings/:id**

Delete a recording (marks as deleted, removes URL).

#### Recording Statistics

**GET /v1/recordings/stats**

Get recording statistics for the tenant.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalRecordings": 1500,
    "totalDuration": 125000,
    "totalSize": 2500000000,
    "transcribedCount": 1200
  }
}
```

---

### SMS Messages

#### Send SMS

**POST /v1/sms**

Send an SMS message.

**Request Body:**
```json
{
  "to": "+15555559999",
  "from": "+15555551234",
  "body": "Hello from IRISX!",
  "media_urls": [],
  "metadata": {}
}
```

**Response 201:**
```json
{
  "sid": "SM834003994ba453cfe344047731d71cd5",
  "status": "queued",
  "to": "+15555559999",
  "from": "+15555551234",
  "body": "Hello from IRISX!",
  "segments": 1
}
```

#### Get SMS Details

**GET /v1/sms/:sid**

#### List SMS Messages

**GET /v1/sms**

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `direction` | string | `inbound` or `outbound` |
| `status` | string | Filter by status |

#### Send Bulk SMS

**POST /v1/sms/bulk**

Send SMS to multiple recipients.

```json
{
  "recipients": ["+15555551111", "+15555552222"],
  "body": "Bulk message content",
  "from": "+15555551234"
}
```

---

### Email

#### Send Email

**POST /v1/email/send**

Send a transactional email.

```json
{
  "to": "recipient@example.com",
  "from": "sender@company.com",
  "subject": "Welcome!",
  "html": "<h1>Hello</h1>",
  "text": "Hello",
  "template_id": "tpl_123",
  "variables": {}
}
```

#### List Emails

**GET /v1/email**

#### Get Email Details

**GET /v1/email/:id**

#### Email Templates

**GET /v1/email/templates** - List templates
**POST /v1/email/templates** - Create template
**GET /v1/email/templates/:id** - Get template
**PUT /v1/email/templates/:id** - Update template
**DELETE /v1/email/templates/:id** - Delete template

#### Email Campaigns

**GET /v1/email/campaigns** - List campaigns
**POST /v1/email/campaigns** - Create campaign
**GET /v1/email/campaigns/:id** - Get campaign
**PUT /v1/email/campaigns/:id** - Update campaign
**DELETE /v1/email/campaigns/:id** - Delete campaign
**POST /v1/email/campaigns/:id/send** - Send campaign
**POST /v1/email/campaigns/:id/schedule** - Schedule campaign
**GET /v1/email/campaigns/:id/stats** - Get campaign statistics

#### Email Automation

**GET /v1/email/automation** - List automation workflows
**POST /v1/email/automation** - Create workflow
**PUT /v1/email/automation/:id** - Update workflow
**DELETE /v1/email/automation/:id** - Delete workflow
**POST /v1/email/automation/:id/activate** - Activate workflow
**POST /v1/email/automation/:id/deactivate** - Deactivate workflow

#### Email Analytics

**GET /v1/email/analytics** - Get email analytics
**GET /v1/email/analytics/deliverability** - Deliverability metrics
**GET /v1/email/analytics/engagement** - Engagement metrics

#### Email Statistics

**GET /v1/emails/stats** - Get email statistics

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total": 5000,
    "sent": 4800,
    "delivered": 4700,
    "opened": 2500,
    "clicked": 800,
    "bounced": 100,
    "failed": 50,
    "deliveryRate": 98,
    "openRate": 53
  }
}
```

**GET /v1/emails/stats/timeline** - Get email statistics over time

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | 30 | Number of days to include |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "timeline": [
      {
        "date": "2026-02-17",
        "total": 150,
        "sent": 145,
        "delivered": 140,
        "opened": 75,
        "clicked": 25,
        "bounced": 5
      }
    ],
    "period": 30
  }
}
```

#### Email Deliverability

**GET /v1/email/deliverability** - Get email deliverability stats and health

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "sent_30d": 15234,
      "delivery_rate": 98.5,
      "bounce_rate": 1.5,
      "open_rate": 45.2,
      "click_rate": 12.8
    },
    "bounce_stats": {
      "hard_bounces": 50,
      "soft_bounces": 150
    },
    "overall_score": 92,
    "suppression_list": [],
    "insights": [],
    "dns_records": {
      "spf": { "status": "valid" },
      "dkim": { "status": "valid" },
      "dmarc": { "status": "valid" }
    }
  }
}
```

**POST /v1/email/deliverability/check** - Run deliverability health check

---

## Messaging Channels

### WhatsApp

#### Send WhatsApp Message

**POST /v1/whatsapp/send**

```json
{
  "to": "+15555559999",
  "type": "text",
  "text": { "body": "Hello via WhatsApp!" }
}
```

**Message Types:**
- `text` - Plain text message
- `image` - Image with optional caption
- `document` - Document attachment
- `template` - Pre-approved template message
- `interactive` - Buttons/lists

#### Send Template Message

**POST /v1/whatsapp/template**

```json
{
  "to": "+15555559999",
  "template_name": "order_confirmation",
  "language": "en",
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "John" },
        { "type": "text", "text": "12345" }
      ]
    }
  ]
}
```

#### WhatsApp Endpoints

**GET /v1/whatsapp/messages** - List messages
**GET /v1/whatsapp/messages/:id** - Get message details
**GET /v1/whatsapp/templates** - List templates
**POST /v1/whatsapp/templates** - Create template
**GET /v1/whatsapp/media/:id** - Get media file
**POST /v1/whatsapp/media** - Upload media

---

### Social Media

#### Social Hub

**GET /v1/social/accounts** - List connected social media accounts

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": 1,
        "platform": "discord",
        "name": "Support Server",
        "status": "connected",
        "created_at": "2026-02-01T00:00:00.000Z"
      }
    ]
  }
}
```

**GET /v1/social/stats** - Get social media statistics

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total_messages": 5000,
    "by_platform": {
      "discord": 2000,
      "slack": 1500,
      "teams": 1000,
      "telegram": 500
    },
    "avg_response_time": 45
  }
}
```

#### Facebook Messenger

**POST /v1/social/facebook/send** - Send message
**GET /v1/social/facebook/messages** - List messages
**GET /v1/social/facebook/pages** - List connected pages
**POST /v1/social/facebook/connect** - Connect page

#### Instagram

**POST /v1/social/instagram/send** - Send message
**GET /v1/social/instagram/messages** - List messages
**GET /v1/social/instagram/accounts** - List connected accounts

#### Twitter/X

**POST /v1/social/twitter/send** - Send DM
**GET /v1/social/twitter/messages** - List messages

#### Social Media Unified

**GET /v1/social/conversations** - List all social conversations
**GET /v1/social/conversations/:id** - Get conversation
**POST /v1/social/conversations/:id/reply** - Reply to conversation

---

### Business Messaging

#### Apple Messages for Business

**POST /v1/business-messaging/apple/send** - Send message
**GET /v1/business-messaging/apple/messages** - List messages
**GET /v1/business-messaging/apple/config** - Get configuration
**PUT /v1/business-messaging/apple/config** - Update configuration
**POST /v1/business-messaging/apple/rich-link** - Send rich link
**POST /v1/business-messaging/apple/list-picker** - Send list picker
**POST /v1/business-messaging/apple/time-picker** - Send time picker

#### Google Business Messages

**POST /v1/business-messaging/google/send** - Send message
**GET /v1/business-messaging/google/messages** - List messages
**GET /v1/business-messaging/google/config** - Get configuration
**PUT /v1/business-messaging/google/config** - Update configuration
**POST /v1/business-messaging/google/suggestions** - Send with suggestions
**POST /v1/business-messaging/google/rich-card** - Send rich card
**POST /v1/business-messaging/google/carousel** - Send carousel

#### RCS (Rich Communication Services)

**POST /v1/business-messaging/rcs/send** - Send message
**GET /v1/business-messaging/rcs/messages** - List messages
**GET /v1/business-messaging/rcs/config** - Get configuration
**PUT /v1/business-messaging/rcs/config** - Update configuration
**POST /v1/business-messaging/rcs/rich-card** - Send rich card
**POST /v1/business-messaging/rcs/carousel** - Send carousel
**GET /v1/business-messaging/rcs/capabilities/:phone** - Check RCS capability

---

### Web Chat

#### Chat Widget Configuration

**GET /v1/chat/config** - Get widget configuration
**PUT /v1/chat/config** - Update configuration

#### Chat Sessions

**GET /v1/chat/sessions** - List chat sessions
**GET /v1/chat/sessions/:id** - Get session details
**GET /v1/chat/sessions/:id/messages** - Get session messages
**POST /v1/chat/sessions/:id/messages** - Send message
**POST /v1/chat/sessions/:id/end** - End session
**POST /v1/chat/sessions/:id/transfer** - Transfer to agent

#### Chat Analytics

**GET /v1/chat/analytics** - Chat analytics
**GET /v1/chat/analytics/satisfaction** - CSAT scores

---

## Contact Center

### Agents

#### Agent Management

**GET /v1/agents** - List agents
**POST /v1/agents** - Create agent
**GET /v1/agents/:id** - Get agent details
**PUT /v1/agents/:id** - Update agent
**DELETE /v1/agents/:id** - Delete agent

#### Agent Status

**GET /v1/agents/:id/status** - Get agent status
**PUT /v1/agents/:id/status** - Update status

**Status Values:**
- `available` - Ready to receive calls
- `busy` - On a call
- `away` - Temporarily away
- `offline` - Not logged in
- `wrap-up` - After-call work

#### Agent Skills

**GET /v1/agents/:id/skills** - Get agent skills
**PUT /v1/agents/:id/skills** - Update skills

#### Agent Performance

**GET /v1/agents/:id/performance** - Performance metrics
**GET /v1/agents/:id/calls** - Agent's call history
**GET /v1/agents/performance** - All agents performance

---

### Queues

#### Queue Management

**GET /v1/queues** - List queues
**POST /v1/queues** - Create queue
**GET /v1/queues/:id** - Get queue details
**PUT /v1/queues/:id** - Update queue
**DELETE /v1/queues/:id** - Delete queue

#### Queue Configuration

```json
{
  "name": "Sales Queue",
  "strategy": "round-robin",
  "max_wait_time": 300,
  "music_on_hold": "default",
  "agents": ["agent_1", "agent_2"],
  "skills_required": ["sales", "english"],
  "priority": 1
}
```

**Routing Strategies:**
- `round-robin` - Distribute evenly
- `least-occupied` - Fewest active calls
- `skills-based` - Match required skills
- `priority` - Based on agent priority
- `ring-all` - Ring all available

#### Queue Status

**GET /v1/queues/:id/status** - Real-time queue status
**GET /v1/queues/:id/callers** - Callers waiting
**GET /v1/queues/:id/agents** - Agents in queue

---

### Callbacks

#### Callback Management

**GET /v1/callbacks** - List callbacks
**POST /v1/callbacks** - Schedule callback
**GET /v1/callbacks/:id** - Get callback details
**PUT /v1/callbacks/:id** - Update callback
**DELETE /v1/callbacks/:id** - Cancel callback
**POST /v1/callbacks/:id/execute** - Execute callback now

**Request Body:**
```json
{
  "phone_number": "+15555559999",
  "scheduled_at": "2026-02-17T14:00:00.000Z",
  "queue_id": "queue_123",
  "priority": "high",
  "notes": "Customer requested callback",
  "metadata": {}
}
```

---

### Campaigns

#### Campaign Management

**GET /v1/campaigns** - List campaigns
**POST /v1/campaigns** - Create campaign
**GET /v1/campaigns/:id** - Get campaign details
**PUT /v1/campaigns/:id** - Update campaign
**DELETE /v1/campaigns/:id** - Delete campaign

#### Campaign Control

**POST /v1/campaigns/:id/start** - Start campaign
**POST /v1/campaigns/:id/pause** - Pause campaign
**POST /v1/campaigns/:id/resume** - Resume campaign
**POST /v1/campaigns/:id/stop** - Stop campaign

#### Campaign Contacts

**GET /v1/campaigns/:id/contacts** - List contacts
**POST /v1/campaigns/:id/contacts** - Add contacts
**DELETE /v1/campaigns/:id/contacts/:contactId** - Remove contact
**POST /v1/campaigns/:id/contacts/import** - Import from file

#### Campaign Statistics

**GET /v1/campaigns/:id/stats** - Campaign statistics
**GET /v1/campaigns/:id/results** - Call results

---

### IVR

#### IVR Flow Management

**GET /v1/ivr/flows** - List IVR flows
**POST /v1/ivr/flows** - Create flow
**GET /v1/ivr/flows/:id** - Get flow details
**PUT /v1/ivr/flows/:id** - Update flow
**DELETE /v1/ivr/flows/:id** - Delete flow

#### IVR Flow Structure

```json
{
  "name": "Main Menu",
  "entry_point": "node_1",
  "nodes": [
    {
      "id": "node_1",
      "type": "play",
      "config": {
        "text": "Welcome to IRISX. Press 1 for sales, 2 for support.",
        "voice": "en-US-Neural2-F"
      },
      "next": "node_2"
    },
    {
      "id": "node_2",
      "type": "gather",
      "config": {
        "num_digits": 1,
        "timeout": 5
      },
      "branches": {
        "1": "node_sales",
        "2": "node_support",
        "timeout": "node_1"
      }
    }
  ]
}
```

**Node Types:**
- `play` - Play audio/TTS
- `gather` - Collect DTMF input
- `menu` - Interactive menu
- `transfer` - Transfer call
- `queue` - Route to queue
- `voicemail` - Leave voicemail
- `webhook` - Call external API
- `condition` - Conditional branching
- `set_variable` - Set variable
- `ai_agent` - Route to AI assistant

#### IVR Prompts

**GET /v1/ivr/prompts** - List prompts
**POST /v1/ivr/prompts** - Upload prompt
**DELETE /v1/ivr/prompts/:id** - Delete prompt

---

### Supervisor

#### Live Monitoring

**GET /v1/supervisor/calls** - Active calls
**GET /v1/supervisor/agents** - Agent statuses
**GET /v1/supervisor/queues** - Queue statuses

#### Call Control

**POST /v1/supervisor/calls/:sid/listen** - Silent monitor
**POST /v1/supervisor/calls/:sid/whisper** - Whisper to agent
**POST /v1/supervisor/calls/:sid/barge** - Barge into call
**POST /v1/supervisor/calls/:sid/takeover** - Take over call

#### Agent Control

**POST /v1/supervisor/agents/:id/logout** - Force logout
**POST /v1/supervisor/agents/:id/status** - Change status

---

### Wallboard

**GET /v1/wallboard** - Wallboard data
**GET /v1/wallboard/stats** - Real-time statistics
**GET /v1/wallboard/config** - Wallboard configuration
**PUT /v1/wallboard/config** - Update configuration

**Response:**
```json
{
  "calls_in_queue": 5,
  "agents_available": 12,
  "agents_busy": 8,
  "avg_wait_time": 45,
  "avg_handle_time": 180,
  "service_level": 85.5,
  "abandoned_rate": 3.2
}
```

---

## AI & Automation

### AI Engine

#### Conversation AI

**POST /v1/ai/chat** - Chat completion
**POST /v1/ai/analyze** - Analyze text
**POST /v1/ai/summarize** - Summarize conversation
**POST /v1/ai/sentiment** - Sentiment analysis
**POST /v1/ai/intent** - Intent detection
**POST /v1/ai/entities** - Entity extraction

#### AI Configuration

**GET /v1/ai/config** - Get AI settings
**PUT /v1/ai/config** - Update AI settings
**GET /v1/ai/models** - Available models

#### Knowledge Base

**GET /v1/ai/knowledge** - List knowledge items
**POST /v1/ai/knowledge** - Add knowledge
**PUT /v1/ai/knowledge/:id** - Update knowledge
**DELETE /v1/ai/knowledge/:id** - Delete knowledge
**POST /v1/ai/knowledge/upload** - Upload document
**POST /v1/ai/knowledge/search** - Search knowledge base

---

### Voice Assistants

#### Assistant Management

**GET /v1/voice/assistants** - List assistants
**POST /v1/voice/assistants** - Create assistant
**GET /v1/voice/assistants/:id** - Get assistant
**PUT /v1/voice/assistants/:id** - Update assistant
**DELETE /v1/voice/assistants/:id** - Delete assistant

#### Assistant Configuration

```json
{
  "name": "Sales Assistant",
  "voice": "en-US-Neural2-F",
  "personality": "professional",
  "greeting": "Hello, how can I help you today?",
  "knowledge_base_id": "kb_123",
  "capabilities": ["appointments", "orders", "faq"],
  "escalation_triggers": ["angry", "supervisor"]
}
```

#### Assistant Deployment

**POST /v1/voice/assistants/:id/deploy** - Deploy to phone number
**POST /v1/voice/assistants/:id/undeploy** - Remove deployment

---

### Translation

#### Real-time Translation

**POST /v1/translation/translate** - Translate text
**POST /v1/translation/detect** - Detect language
**GET /v1/translation/languages** - Supported languages

#### Translation Configuration

**GET /v1/translation/config** - Get settings
**PUT /v1/translation/config** - Update settings

**Request:**
```json
{
  "text": "Hello, how can I help you?",
  "source": "en",
  "target": "es"
}
```

**Response:**
```json
{
  "translated": "Hola, ¿cómo puedo ayudarte?",
  "source_language": "en",
  "target_language": "es",
  "confidence": 0.98
}
```

---

### AMD (Answering Machine Detection)

#### AMD Configuration

**GET /v1/amd/config** - Get AMD settings
**PUT /v1/amd/config** - Update AMD settings

**Configuration:**
```json
{
  "enabled": true,
  "initial_silence": 2500,
  "greeting_length": 1500,
  "after_greeting_silence": 800,
  "total_analysis_time": 5000,
  "minimum_word_length": 100,
  "between_words_silence": 50,
  "maximum_words": 3,
  "action_on_machine": "leave_voicemail",
  "action_on_human": "connect"
}
```

#### AMD Results

**GET /v1/amd/results** - AMD detection results
**GET /v1/amd/statistics** - AMD accuracy statistics

---

### Agent Scripts

#### Script Management

**GET /v1/scripts** - List scripts
**POST /v1/scripts** - Create script
**GET /v1/scripts/:id** - Get script
**PUT /v1/scripts/:id** - Update script
**DELETE /v1/scripts/:id** - Delete script

#### Script Structure

```json
{
  "name": "Sales Script",
  "type": "outbound",
  "steps": [
    {
      "id": "step_1",
      "type": "greeting",
      "content": "Hello {{customer_name}}, this is {{agent_name}} from IRISX.",
      "next": "step_2"
    },
    {
      "id": "step_2",
      "type": "question",
      "content": "Are you interested in learning about our new products?",
      "responses": [
        { "label": "Yes", "next": "step_3" },
        { "label": "No", "next": "step_objection" }
      ]
    }
  ],
  "variables": ["customer_name", "agent_name", "product_name"]
}
```

#### Script Assignment

**POST /v1/scripts/:id/assign** - Assign to queue/campaign
**DELETE /v1/scripts/:id/assign** - Remove assignment

---

## Video & Collaboration

### Video Calls

#### Room Management

**GET /v1/video/rooms** - List rooms
**POST /v1/video/rooms** - Create room
**GET /v1/video/rooms/:id** - Get room details
**DELETE /v1/video/rooms/:id** - Delete room

**Request:**
```json
{
  "name": "Sales Meeting",
  "type": "group",
  "max_participants": 10,
  "recording_enabled": true,
  "waiting_room": true
}
```

#### Room Control

**POST /v1/video/rooms/:id/join** - Join room (get token)
**POST /v1/video/rooms/:id/leave** - Leave room
**GET /v1/video/rooms/:id/participants** - List participants
**POST /v1/video/rooms/:id/kick/:participantId** - Remove participant
**POST /v1/video/rooms/:id/mute/:participantId** - Mute participant

#### Video Recordings

**GET /v1/video/recordings** - List recordings
**GET /v1/video/recordings/:id** - Get recording
**DELETE /v1/video/recordings/:id** - Delete recording

---

## Quality & Compliance

### Quality Management

#### Scorecards

**GET /v1/quality/scorecards** - List scorecards
**POST /v1/quality/scorecards** - Create scorecard
**GET /v1/quality/scorecards/:id** - Get scorecard
**PUT /v1/quality/scorecards/:id** - Update scorecard
**DELETE /v1/quality/scorecards/:id** - Delete scorecard

#### Evaluations

**GET /v1/quality/evaluations** - List evaluations
**POST /v1/quality/evaluations** - Create evaluation
**GET /v1/quality/evaluations/:id** - Get evaluation
**PUT /v1/quality/evaluations/:id** - Update evaluation

#### Quality Reports

**GET /v1/quality/reports** - Quality reports
**GET /v1/quality/reports/agents** - Agent quality scores
**GET /v1/quality/reports/trends** - Quality trends

---

### STIR/SHAKEN

#### Certificate Management

**GET /v1/stir-shaken/certificates** - List certificates
**POST /v1/stir-shaken/certificates** - Upload certificate
**GET /v1/stir-shaken/certificates/:id** - Get certificate
**DELETE /v1/stir-shaken/certificates/:id** - Delete certificate

#### STIR/SHAKEN Configuration

**GET /v1/stir-shaken/config** - Get configuration
**PUT /v1/stir-shaken/config** - Update configuration

**Configuration:**
```json
{
  "enabled": true,
  "attestation_level": "A",
  "certificate_id": "cert_123",
  "origination_id": "orig_456"
}
```

#### Verification

**POST /v1/stir-shaken/sign** - Sign a call
**POST /v1/stir-shaken/verify** - Verify call signature
**GET /v1/stir-shaken/status** - STIR/SHAKEN status
**GET /v1/stir-shaken/logs** - Verification logs

---

## Security & Authentication

### SSO/SAML

#### SAML Configuration

**GET /v1/sso/saml/config** - Get SAML config
**PUT /v1/sso/saml/config** - Update SAML config

**Configuration:**
```json
{
  "enabled": true,
  "entity_id": "https://api.irisx.com/sso/saml",
  "sso_url": "https://idp.example.com/sso",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "name_id_format": "email",
  "attribute_mapping": {
    "email": "user.email",
    "firstName": "user.firstName",
    "lastName": "user.lastName"
  }
}
```

#### SAML Endpoints

**GET /v1/sso/saml/metadata** - SP metadata XML
**POST /v1/sso/saml/acs** - Assertion Consumer Service
**GET /v1/sso/saml/login** - Initiate SSO login
**POST /v1/sso/saml/logout** - Single logout

#### Session Management

**GET /v1/sso/sessions** - List SSO sessions
**DELETE /v1/sso/sessions/:id** - Revoke session

---

## Analytics & Reports

### Analytics

#### Real-time Analytics

**GET /v1/analytics/realtime** - Real-time metrics
**GET /v1/analytics/realtime/calls** - Active calls
**GET /v1/analytics/realtime/agents** - Agent metrics

#### Historical Analytics

**GET /v1/analytics/calls** - Call analytics
**GET /v1/analytics/messages** - Message analytics
**GET /v1/analytics/agents** - Agent analytics
**GET /v1/analytics/queues** - Queue analytics
**GET /v1/analytics/campaigns** - Campaign analytics

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Start date (ISO) |
| `end_date` | string | End date (ISO) |
| `granularity` | string | `hour`, `day`, `week`, `month` |
| `group_by` | string | Grouping field |

---

### Reports

#### Report Management

**GET /v1/reports** - List reports
**POST /v1/reports** - Create report
**GET /v1/reports/:id** - Get report
**PUT /v1/reports/:id** - Update report
**DELETE /v1/reports/:id** - Delete report

#### Report Execution

**POST /v1/reports/:id/run** - Run report
**GET /v1/reports/:id/results** - Get results
**GET /v1/reports/:id/export** - Export (CSV/PDF)

#### Scheduled Reports

**POST /v1/reports/:id/schedule** - Schedule report
**DELETE /v1/reports/:id/schedule** - Remove schedule

---

### Usage

**GET /v1/usage** - Usage summary
**GET /v1/usage/calls** - Call usage
**GET /v1/usage/sms** - SMS usage
**GET /v1/usage/email** - Email usage
**GET /v1/usage/storage** - Storage usage
**GET /v1/usage/ai** - AI usage

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Start date |
| `end_date` | string | End date |

---

## Configuration

### Webhooks

#### Webhook Management

**GET /v1/webhooks** - List webhooks
**POST /v1/webhooks** - Create webhook
**GET /v1/webhooks/:id** - Get webhook
**PUT /v1/webhooks/:id** - Update webhook
**DELETE /v1/webhooks/:id** - Delete webhook

**Request:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["call.completed", "sms.received", "chat.message"],
  "secret": "webhook_secret_123",
  "enabled": true
}
```

#### Webhook Events

| Event | Description |
|-------|-------------|
| `call.initiated` | Call started |
| `call.ringing` | Call ringing |
| `call.answered` | Call answered |
| `call.completed` | Call ended |
| `sms.sent` | SMS sent |
| `sms.delivered` | SMS delivered |
| `sms.received` | Inbound SMS |
| `email.sent` | Email sent |
| `email.delivered` | Email delivered |
| `email.opened` | Email opened |
| `email.clicked` | Email link clicked |
| `chat.started` | Chat session started |
| `chat.message` | New chat message |
| `chat.ended` | Chat session ended |
| `agent.status_changed` | Agent status change |

#### Webhook Testing

**POST /v1/webhooks/:id/test** - Send test event
**GET /v1/webhooks/:id/logs** - Delivery logs

---

### API Keys

**GET /v1/api-keys** - List API keys
**POST /v1/api-keys** - Create API key
**GET /v1/api-keys/:id** - Get API key
**PUT /v1/api-keys/:id** - Update API key
**DELETE /v1/api-keys/:id** - Revoke API key

**Request:**
```json
{
  "name": "Production Key",
  "permissions": ["calls:read", "calls:write", "sms:read", "sms:write"],
  "rate_limit": 100,
  "expires_at": "2027-01-01T00:00:00.000Z"
}
```

---

### Tenant Settings

**GET /v1/settings** - Get tenant settings
**PUT /v1/settings** - Update settings
**GET /v1/settings/phone-numbers** - Phone numbers
**POST /v1/settings/phone-numbers** - Add phone number
**DELETE /v1/settings/phone-numbers/:id** - Remove phone number

---

### Billing

**GET /v1/billing** - Billing overview
**GET /v1/billing/invoices** - List invoices
**GET /v1/billing/invoices/:id** - Get invoice
**GET /v1/billing/payment-methods** - Payment methods
**POST /v1/billing/payment-methods** - Add payment method
**DELETE /v1/billing/payment-methods/:id** - Remove payment method
**GET /v1/billing/subscription** - Current subscription
**PUT /v1/billing/subscription** - Update subscription

---

## Admin Endpoints

> **Note:** Admin endpoints require admin authentication and are not available via standard API keys.

### Tenant Management

**GET /admin/tenants** - List tenants
**POST /admin/tenants** - Create tenant
**GET /admin/tenants/:id** - Get tenant
**PUT /admin/tenants/:id** - Update tenant
**DELETE /admin/tenants/:id** - Delete tenant
**POST /admin/tenants/:id/suspend** - Suspend tenant
**POST /admin/tenants/:id/activate** - Activate tenant

### Admin User Management

**GET /admin/users** - List admin users
**POST /admin/users** - Create admin user
**PUT /admin/users/:id** - Update admin user
**DELETE /admin/users/:id** - Delete admin user

### System Management

**GET /admin/system/health** - System health
**GET /admin/system/metrics** - System metrics
**GET /admin/system/logs** - System logs
**GET /admin/system/config** - System configuration

### Phone Number Management

**GET /admin/phone-numbers** - All phone numbers
**POST /admin/phone-numbers** - Provision number
**PUT /admin/phone-numbers/:id** - Update number
**DELETE /admin/phone-numbers/:id** - Release number
**POST /admin/phone-numbers/:id/assign** - Assign to tenant

### Platform Reports

**GET /admin/reports/usage** - Platform usage
**GET /admin/reports/revenue** - Revenue reports
**GET /admin/reports/tenants** - Tenant reports

### Carrier Management

**GET /admin/carriers** - List carriers
**POST /admin/carriers** - Add carrier
**PUT /admin/carriers/:id** - Update carrier
**DELETE /admin/carriers/:id** - Remove carrier

### Feature Flags

**GET /admin/features** - List feature flags
**PUT /admin/features/:id** - Update feature flag
**GET /admin/features/tenant/:tenantId** - Tenant features
**PUT /admin/features/tenant/:tenantId** - Update tenant features

---

## Changelog

### v2.1.0 (February 2026)

**New Features:**
- Call Recordings API (`/v1/recordings`) - List, get, delete recordings
- Email Statistics Timeline (`/v1/emails/stats/timeline`) - Daily email metrics
- Email Deliverability (`/v1/email/deliverability`) - DNS health, bounce stats
- Social Hub (`/v1/social/accounts`, `/v1/social/stats`) - Unified social media management
- Email Automation Rules (`/v1/email/automation/rules`) - Automation rule management

**Bug Fixes:**
- Fixed route ordering for `/v1/contacts/lists`
- Fixed WFM tables (shift_swaps, shift_offers)
- Fixed analytics unified metrics

### v2.0.0 (February 2026)

**New Features:**
- Business Messaging (Apple, Google, RCS)
- Video Calling with Mediasoup
- Voice Assistants
- Agent Scripts
- AMD Configuration
- STIR/SHAKEN Compliance
- SSO/SAML Authentication
- Translation Services
- Quality Management
- Advanced IVR Builder
- Comprehensive Analytics

**Enhancements:**
- Multi-channel conversation support
- Real-time supervisor tools
- AI-powered features
- Enhanced webhook events

### v1.0.0 (October 2025)

- Initial API release
- Basic call endpoints
- SMS messaging
- API key authentication
- Multi-tenant support

---

## Support

- **Documentation:** https://docs.irisx.com
- **API Status:** https://status.irisx.com
- **Support:** support@irisx.com

---

Last Updated: February 18, 2026
