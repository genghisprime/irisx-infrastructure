# IRIS Multi-Channel Communications Platform
## Complete Architecture & Implementation Guide

**Version:** 3.0 (Multi-Channel Expansion)
**Last Updated:** 2025-01-15
**Company:** TechRadium (www.useiris.com)
**Status:** Master Architecture Document

---

## Executive Summary

**IRIS** is evolving from a voice-only platform to a **unified multi-channel communications platform** that enables developers and enterprises to reach customers across **voice, SMS, email, and social media** from a single API.

### **What Makes IRIS Different**

After 20 years in the communications industry, TechRadium is building the next-generation platform that combines:

- 🎯 **Unified API:** One endpoint sends to voice + SMS + email + social simultaneously
- 💰 **Least-Cost Routing:** Automatic provider selection saves customers 30-50% vs competitors
- 🔄 **Smart Fallback:** If voice fails, auto-cascade to SMS, then email
- 🎨 **No-Code Builder:** Visual interface for non-technical users
- 📡 **RSS Feeds + Widgets:** Real-time alerts embedded on customer websites
- 📊 **Real-Time Analytics:** See delivery rates across all channels
- 🏗️ **Enterprise Ready:** SOC 2, HIPAA, multi-region, 99.99% uptime

### **Target Market**

1. **Utilities (Water, Electric, Gas):** Emergency alerts, outage notifications, appointment reminders
2. **Government Agencies:** Emergency management, public alerts, citizen engagement
3. **Healthcare Systems:** Appointment reminders, test results, emergency notifications
4. **Call Centers:** Omnichannel customer communication
5. **Developers:** API-first communications infrastructure

### **Competitive Position**

**vs Twilio:** 30% cheaper, better queue system, unified multi-channel API
**vs SendGrid:** Includes voice + SMS, not just email
**vs Zapier:** Built for high-volume, real-time communications (not workflow automation)
**vs Hootsuite:** Two-way communication, not just social scheduling

**IRIS = Twilio + SendGrid + Hootsuite combined, with better pricing and unified API**

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
2. [Multi-Channel Architecture](#2-multi-channel-architecture)
3. [Unified API Design](#3-unified-api-design)
4. [Broadcast Modes](#4-broadcast-modes)
5. [Channel Implementations](#5-channel-implementations)
6. [Provider Abstraction Layer](#6-provider-abstraction-layer)
7. [Least-Cost Routing Engine](#7-least-cost-routing-engine)
8. [No-Code Flow Builder](#8-no-code-flow-builder)
9. [RSS Feeds & Widgets](#9-rss-feeds--widgets)
10. [Data Model (Multi-Channel)](#10-data-model-multi-channel)
11. [Cost Model (All Channels)](#11-cost-model-all-channels)
12. [Phased Rollout Plan](#12-phased-rollout-plan)
13. [Technical Decisions](#13-technical-decisions)
14. [Migration from Voice-Only](#14-migration-from-voice-only)

---

## 1. Vision & Scope

### **The Problem**

Organizations need to communicate with customers across multiple channels, but current solutions are:

1. **Fragmented:** Separate platforms for voice (Twilio), email (SendGrid), social (Hootsuite)
2. **Expensive:** Each platform charges separately, no cost optimization
3. **Complex:** No unified API, developers integrate 5+ platforms
4. **No Fallback:** If email fails, manually send SMS (no automation)
5. **Poor Analytics:** Can't see unified delivery rates across channels

### **The IRIS Solution**

**One Platform, All Channels, Unified API**

```javascript
// Single API call reaches customer everywhere
POST /v1/messages
{
  "broadcast_mode": "all_channels",
  "to": {
    "phone": "+15555551234",
    "email": "customer@example.com",
    "facebook_id": "user_12345",
    "twitter": "@username",
    "discord_id": "channel_67890"
  },
  "message": {
    "subject": "EMERGENCY: Water Main Break",
    "body": "Critical water main break at Main St. Boil water advisory in effect."
  }
}

// Result: Customer receives call + SMS + email + Facebook + Twitter + Discord
// All within 2 seconds, from one API call
```

### **Core Principles**

1. **Unified Experience:** One API, one SDK, one dashboard
2. **Customer Choice:** They control which channels, in what order
3. **Cost Optimization:** We pick cheapest providers automatically
4. **Reliability:** Multi-provider redundancy per channel
5. **Developer First:** API-driven, excellent docs, fast onboarding
6. **No-Code Option:** Visual builder for non-technical users

---

## 2. Multi-Channel Architecture

### **High-Level System Design**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    IRIS Platform (Control Plane)                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  API Gateway (Hono.js on Cloudflare Workers)                 │   │
│  │  - Unified /v1/messages endpoint                             │   │
│  │  - Channel-specific endpoints (/v1/calls, /v1/sms, etc.)    │   │
│  │  - Authentication, rate limiting, idempotency                │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           ↓                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Broadcast Orchestrator (Bun.js Workers)                     │   │
│  │  - Parse message, determine channels                         │   │
│  │  - Apply broadcast mode (all, cascade, single, etc.)        │   │
│  │  - Select providers per channel (least-cost routing)        │   │
│  │  - Enqueue to channel-specific workers                      │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           ↓                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  NATS JetStream (Message Queue)                              │   │
│  │  - Durable streams per channel                               │   │
│  │  - Retry logic, dead letter queues                           │   │
│  │  - Priority queues (critical > high > normal > low)         │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
└────────────────────────────┼──────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ↓                    ↓                    ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Voice Worker │  │  SMS Worker  │  │ Email Worker │
│              │  │              │  │              │
│ Consumes:    │  │ Consumes:    │  │ Consumes:    │
│ voice-queue  │  │ sms-queue    │  │ email-queue  │
│              │  │              │  │              │
│ Providers:   │  │ Providers:   │  │ Providers:   │
│ - Twilio     │  │ - Telnyx     │  │ - ElasticEmail│
│ - Telnyx     │  │ - Plivo      │  │ - Postmark   │
│ - Bandwidth  │  │ - Vonage     │  │ - SendGrid   │
│              │  │ - Twilio     │  │ - Mailgun    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       ↓                 ↓                 ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│Social Worker │  │ RSS Worker   │  │Widget Worker │
│              │  │              │  │              │
│ Consumes:    │  │ Consumes:    │  │ Consumes:    │
│ social-queue │  │ rss-queue    │  │ widget-queue │
│              │  │              │  │              │
│ Platforms:   │  │ Generates:   │  │ Updates:     │
│ - Facebook   │  │ - RSS 2.0    │  │ - Redis cache│
│ - Twitter/X  │  │ - Atom feeds │  │ - CDN purge  │
│ - Discord    │  │ - JSON feeds │  │              │
│ - Telegram   │  │              │  │              │
│ - WhatsApp   │  │              │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       ↓                 ↓                 ↓
┌─────────────────────────────────────────────────┐
│          Delivery Tracking & Analytics          │
│  - Write to Postgres (CDR, deliveries)          │
│  - Stream to ClickHouse (analytics)             │
│  - Update Firestore (real-time UI)              │
│  - Trigger webhooks (customer notification)     │
└─────────────────────────────────────────────────┘
```

### **Technology Stack (Multi-Channel)**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API Gateway** | Cloudflare Workers + Hono.js | Edge API, global distribution |
| **Orchestrator** | Bun.js workers on AWS ECS Fargate | Channel routing, provider selection |
| **Message Queue** | NATS JetStream | Durable event streams per channel |
| **Voice** | FreeSWITCH + Twilio/Telnyx/Bandwidth | Phone calls, IVR, queues |
| **SMS/MMS** | Telnyx, Plivo, Vonage, Twilio APIs | Text messaging |
| **Email** | ElasticEmail, Postmark, SendGrid + self-hosted SMTP | Email delivery |
| **Social** | Facebook Graph API, Twitter API v2, Discord webhooks | Social posts + DMs |
| **RSS** | Custom generator (Bun.js) | Feed generation, XML/JSON |
| **Widgets** | Vue 3 components + CDN | Embeddable alerts |
| **Database** | Neon Postgres (startup) → Aurora (scale) | Messages, deliveries, contacts |
| **Cache** | Upstash Redis (startup) → ElastiCache (scale) | Provider health, rate limits |
| **Analytics** | ClickHouse Cloud | Real-time delivery analytics |
| **Storage** | Cloudflare R2 (recordings, attachments) | Media files |
| **Monitoring** | Better Stack → Grafana Cloud | Logs, metrics, alerts |

---

## 3. Unified API Design

### **Core Endpoint: POST /v1/messages**

The unified endpoint that routes to any channel combination:

```typescript
interface MessageRequest {
  // Broadcast configuration
  broadcast_mode: 'all_channels' | 'cascade' | 'single' | 'primary_backup' | 'staged' | 'smart';

  // Recipients (provide any/all - 30+ channels supported)
  to: {
    // Core Channels
    phone?: string | string[];           // E.164 format: +15555551234 (for SMS/MMS/Voice/RCS)
    email?: string | string[];           // customer@example.com

    // Social Media
    facebook_id?: string | string[];     // Facebook user ID or page ID
    twitter?: string | string[];         // @username or user ID
    instagram_id?: string | string[];    // Instagram user ID (IGID)
    discord_id?: string | string[];      // Discord channel ID or user ID
    telegram_id?: string | string[];     // Telegram chat ID or channel (@channelname)

    // Messaging Apps
    whatsapp?: string | string[];        // WhatsApp number (E.164)
    viber?: string | string[];           // Viber ID
    wechat?: string | string[];          // WeChat OpenID
    line?: string | string[];            // Line user ID

    // Business Messaging
    apple_business_id?: string | string[];  // Apple Business Messages ID
    google_business_id?: string | string[];  // Google Business Messages conversation ID

    // Enterprise Platforms
    slack_channel?: string | string[];   // Slack channel ID or #channel-name
    slack_user?: string | string[];      // Slack user ID (U0123456789)
    teams_channel?: string;              // Teams channel ID (requires team_id)
    teams_chat?: string;                 // Teams chat ID
    linkedin_id?: string | string[];     // LinkedIn member ID

    // Mobile & Push
    push_token?: string | string[];      // Device push notification token (FCM)

    // Government & Emergency
    ipaws_area?: IPAWSTargetArea;        // IPAWS WEA/EAS geographic targeting

    // Physical & IoT
    led_display_id?: string | string[];  // Digital signage display ID
    smart_speaker_id?: string | string[];  // Alexa/Google Home device ID
    satellite_imei?: string | string[];  // Satellite device IMEI

    // Integrations
    webhook_url?: string | string[];     // Custom webhook endpoint
    salesforce_id?: string | string[];   // Salesforce user/group ID
    servicenow_user?: string | string[]; // ServiceNow user ID
    jira_user?: string | string[];       // Jira user ID
  };

  // Message content
  message: {
    subject?: string;                     // For email, ignored by SMS/voice
    body: string;                         // Main message content

    // Voice-specific
    voice_settings?: {
      tts: boolean;                       // Use text-to-speech?
      voice?: string;                     // TTS voice ID
      audio_url?: string;                 // Or play audio file
      gather?: {                          // Collect DTMF/speech input
        input: ('dtmf' | 'speech')[];
        timeout: number;
        num_digits?: number;
      };
    };

    // Media attachments (for MMS, email, social)
    media?: Array<{
      type: 'image' | 'video' | 'audio' | 'document';
      url: string;
      alt_text?: string;
    }>;

    // Email-specific
    email_settings?: {
      html_body?: string;                 // HTML version
      reply_to?: string;
      cc?: string[];
      bcc?: string[];
    };

    // Social-specific
    social_settings?: {
      post_type?: 'status' | 'photo' | 'video' | 'link';
      link_preview?: boolean;
      hashtags?: string[];
    };
  };

  // Options
  options?: {
    priority?: 'critical' | 'high' | 'normal' | 'low';
    scheduled_at?: string;                // ISO 8601 timestamp
    retry_failed?: boolean;
    max_retries?: number;
    webhook_url?: string;                 // Delivery status callbacks
    idempotency_key?: string;
    tags?: string[];                      // For filtering/analytics
    metadata?: Record<string, any>;       // Custom data

    // Cascade-specific
    fallback_order?: string[];            // ['voice', 'sms', 'email']
    cascade_timeout?: number;             // Seconds to wait before fallback

    // Staged-specific
    stages?: Array<{
      channels: string[];
      delay: number;                      // Seconds from now
    }>;

    // Cost controls
    max_cost_per_message?: number;        // Abort if estimated cost exceeds
    least_cost_routing?: boolean;         // Use cheapest providers (default: true)
  };
}
```

### **Example Requests**

#### **Emergency Broadcast (All Channels)**

```bash
curl -X POST https://api.useiris.com/v1/messages \
  -H "Authorization: Bearer ix_live_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "broadcast_mode": "all_channels",
    "to": {
      "phone": "+15555551234",
      "email": "customer@example.com",
      "facebook_id": "user_12345",
      "twitter": "@johndoe",
      "discord_id": "123456789012345678"
    },
    "message": {
      "subject": "EMERGENCY: Water Main Break",
      "body": "Critical water main break at Main St and 5th Ave. Boil water advisory in effect until further notice. Updates: https://status.waterutility.com",
      "voice_settings": {
        "tts": true,
        "voice": "en-US-Neural2-A"
      },
      "media": [{
        "type": "image",
        "url": "https://cdn.waterutility.com/map-affected-area.png",
        "alt_text": "Map of affected area"
      }]
    },
    "options": {
      "priority": "critical",
      "webhook_url": "https://waterutility.com/webhooks/delivery"
    }
  }'
```

**Response:**

```json
{
  "message_id": "msg_01J1KQZX9F7GH4JWXY12",
  "broadcast_mode": "all_channels",
  "status": "processing",
  "channels_queued": ["voice", "sms", "email", "facebook", "twitter", "discord"],
  "estimated_delivery_time": "2025-01-20T15:32:15Z",
  "estimated_cost": 0.0565,
  "deliveries": [
    {
      "delivery_id": "dlv_voice_abc123",
      "channel": "voice",
      "provider": "twilio",
      "recipient": "+15555551234",
      "status": "queued",
      "estimated_cost": 0.020
    },
    {
      "delivery_id": "dlv_sms_def456",
      "channel": "sms",
      "provider": "telnyx",
      "recipient": "+15555551234",
      "status": "queued",
      "estimated_cost": 0.012
    },
    {
      "delivery_id": "dlv_email_ghi789",
      "channel": "email",
      "provider": "elastic_email",
      "recipient": "customer@example.com",
      "status": "queued",
      "estimated_cost": 0.0005
    },
    {
      "delivery_id": "dlv_fb_jkl012",
      "channel": "facebook",
      "recipient": "user_12345",
      "status": "queued",
      "estimated_cost": 0.001
    },
    {
      "delivery_id": "dlv_tw_mno345",
      "channel": "twitter",
      "recipient": "@johndoe",
      "status": "queued",
      "estimated_cost": 0.001
    },
    {
      "delivery_id": "dlv_dc_pqr678",
      "channel": "discord",
      "recipient": "123456789012345678",
      "status": "queued",
      "estimated_cost": 0.001
    }
  ],
  "webhook_url": "https://waterutility.com/webhooks/delivery",
  "created_at": "2025-01-20T15:32:10.123Z"
}
```

#### **Smart Cascade (Fallback)**

```bash
curl -X POST https://api.useiris.com/v1/messages \
  -H "Authorization: Bearer ix_live_abc123" \
  -d '{
    "broadcast_mode": "cascade",
    "fallback_order": ["voice", "sms", "email"],
    "cascade_timeout": 30,
    "to": {
      "phone": "+15555551234",
      "email": "customer@example.com"
    },
    "message": {
      "subject": "Appointment Reminder",
      "body": "Your appointment is tomorrow at 2 PM. Reply CONFIRM or call us at 555-0100."
    }
  }'
```

**Behavior:**
1. Try **voice call** → Ring 30 seconds → No answer
2. Auto-send **SMS** → Delivered ✅ → STOP (success)
3. Email never sent (not needed)

---

## 4. Broadcast Modes

### **Mode 1: All Channels (`all_channels`)**

Send to ALL channels simultaneously (emergency use case).

```javascript
{
  "broadcast_mode": "all_channels",
  "to": { /* all contact methods */ }
}
```

**Use Cases:**
- Emergency alerts (water main break, gas leak, power outage)
- Critical security notifications
- Service outages affecting all customers

**Behavior:**
- All channels triggered at once (parallel execution)
- Each channel tracked independently
- Customer receives 6+ notifications within seconds

---

### **Mode 2: Cascade (`cascade`)**

Try channels in order, stop on first success (cost optimization).

```javascript
{
  "broadcast_mode": "cascade",
  "fallback_order": ["voice", "sms", "email", "facebook"],
  "cascade_timeout": 30  // Seconds before trying next
}
```

**Use Cases:**
- Appointment reminders (try calling first, SMS backup)
- Payment reminders
- Non-urgent notifications

**Behavior:**
- Try `voice` first → wait 30 sec
- If no answer/failed → try `sms` → wait 30 sec
- If failed → try `email` → wait 30 sec
- If failed → try `facebook`
- STOP on first successful delivery

**Cost Savings:**
- If voice succeeds: $0.020
- If cascade to SMS: $0.020 + $0.012 = $0.032
- vs sending all channels: $0.020 + $0.012 + $0.0005 + $0.001 = $0.0335

---

### **Mode 3: Single Channel (`single`)**

Send to one channel only (precise control).

```javascript
{
  "broadcast_mode": "single",
  "channel": "email",
  "to": { "email": "customer@example.com" }
}
```

**Use Cases:**
- Billing invoices (email only)
- Marketing newsletters
- Social media campaigns

---

### **Mode 4: Primary + Backup (`primary_backup`)**

Send to primary, if fails send to backup after delay.

```javascript
{
  "broadcast_mode": "primary_backup",
  "primary": "voice",
  "backup": "sms",
  "backup_delay": 60
}
```

**Behavior:**
- Send `voice` immediately
- If fails within 60 seconds → send `sms` backup
- If voice succeeds → sms never sent

---

### **Mode 5: Staged Rollout (`staged`)**

Send to channels at different times (non-urgent, multi-touch).

```javascript
{
  "broadcast_mode": "staged",
  "stages": [
    { "channels": ["voice"], "delay": 0 },        // Now
    { "channels": ["sms"], "delay": 300 },        // 5 min later
    { "channels": ["email"], "delay": 3600 }      // 1 hour later
  ]
}
```

**Use Cases:**
- Event reminders (call 1 day before, SMS 1 hour before, email 15 min before)
- Debt collection (escalating contact strategy)
- Multi-touch marketing campaigns

---

### **Mode 6: Smart Adaptive (`smart`)**

AI picks best channel based on recipient's history.

```javascript
{
  "broadcast_mode": "smart",
  "to": { /* provide all contact methods */ }
}
```

**Algorithm:**

```javascript
async function selectBestChannel(recipient) {
  // Analyze past 30 days
  const history = await getDeliveryHistory(recipient.id, 30);

  const channels = ['voice', 'sms', 'email', 'facebook'];
  const scores = {};

  for (const channel of channels) {
    const stats = history.filter(h => h.channel === channel);
    const deliveryRate = stats.filter(s => s.status === 'delivered').length / stats.length;
    const avgResponseTime = average(stats.map(s => s.response_time_seconds));

    // Score = delivery rate * 100 - (response time / 60)
    scores[channel] = (deliveryRate * 100) - (avgResponseTime / 60);
  }

  // Pick highest scoring channel
  return Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
}
```

**Example:**
- Recipient historically:
  - Voice: 60% answer rate, 5 min response → score = 60 - 5 = 55
  - SMS: 95% delivery, 2 min response → score = 95 - 2 = 93 ← **Winner**
  - Email: 80% open rate, 60 min response → score = 80 - 60 = 20

System automatically sends SMS (not voice or email).

---

## 5. Channel Implementations

### **5.1 Voice (Detailed in separate docs)**

**Providers:**
- Twilio (primary, highest cost, best reliability)
- Telnyx (secondary, cheapest, good quality)
- Bandwidth (tertiary, mid-cost, excellent US coverage)
- SignalWire (backup, FreeSWITCH-native)

**Features:**
- Outbound calling
- Inbound call routing
- IVR (text-to-speech, DTMF, speech recognition)
- Call queues with agent routing
- Call recording
- Conference bridges
- Voicemail

**Tech Stack:**
- FreeSWITCH (media server)
- Kamailio (SIP proxy, load balancer)
- NATS (event bus)
- Redis (call state, queue management)

**Cost:** $0.011-0.020/min depending on provider

---

### **5.2 SMS**

**Providers (Least-Cost Order):**

| Provider | SMS (US) | International | Notes |
|----------|----------|---------------|-------|
| **Telnyx** | $0.0079 | Good coverage | Cheapest, 30-day terms |
| **Plivo** | $0.0085 | Excellent | Good API docs |
| **Vonage** | $0.0095 | Best coverage | Enterprise-grade |
| **Twilio** | $0.0118 | Excellent | Most expensive, highest deliverability |

**Implementation:**

```typescript
// SMS Worker (Bun.js)
import { Telnyx } from '@telnyx/sdk';
import { Twilio } from 'twilio';

class SMSRouter {
  async send(message: SMSMessage) {
    const provider = await this.selectProvider(message);

    switch (provider.name) {
      case 'telnyx':
        return this.sendViaTelnyx(message);
      case 'twilio':
        return this.sendViaTwilio(message);
      case 'plivo':
        return this.sendViaPlivo(message);
    }
  }

  async selectProvider(message: SMSMessage) {
    const providers = [
      { name: 'telnyx', cost: 0.0079, health: await getHealthScore('telnyx') },
      { name: 'plivo', cost: 0.0085, health: await getHealthScore('plivo') },
      { name: 'twilio', cost: 0.0118, health: await getHealthScore('twilio') }
    ];

    // Filter out unhealthy providers (health < 90%)
    const healthy = providers.filter(p => p.health > 0.90);

    if (message.priority === 'critical') {
      // Critical: use most reliable (Twilio)
      return healthy.find(p => p.name === 'twilio') || healthy[0];
    } else {
      // Normal: use cheapest healthy provider
      return healthy.sort((a, b) => a.cost - b.cost)[0];
    }
  }

  async sendViaTelnyx(message: SMSMessage) {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY });

    try {
      const result = await telnyx.messages.create({
        from: message.from,
        to: message.to,
        text: message.body,
        media_urls: message.media?.map(m => m.url)
      });

      return {
        provider: 'telnyx',
        external_id: result.data.id,
        status: 'sent',
        cost: 0.0079
      };
    } catch (error) {
      // Log error, mark provider as degraded
      await reportProviderError('telnyx', error);
      throw error;
    }
  }
}
```

**Features:**
- Long message auto-segmentation (SMS >160 chars split into multiple)
- Two-way messaging (receive replies via webhook)
- Shortcode support (for marketing campaigns)
- Toll-free numbers (for A2P messaging)
- Link shortening (optional)
- Unsubscribe management (compliance)

**Compliance:**
- TCPA (Telephone Consumer Protection Act) enforcement
- Opt-in/opt-out management
- 10DLC registration (Application-to-Person campaigns)
- Carrier filtering (spam protection)

**Cost:** $0.0079-0.0118/msg

---

### **5.3 MMS (Multimedia Messaging)**

**Providers (Least-Cost Order):**

| Provider | MMS (US) | Max File Size | Supported Types | Notes |
|----------|----------|---------------|-----------------|-------|
| **Telnyx** | $0.030 | 5 MB | Image, Video, Audio, PDF | Cheapest, excellent API |
| **Plivo** | $0.035 | 5 MB | Image, Video, Audio, vCard | Good reliability |
| **Vonage** | $0.040 | 5 MB | Image, Video, Audio | Enterprise-grade |
| **Twilio** | $0.045 | 5 MB | Image, Video, Audio, PDF, vCard | Best deliverability |

**Implementation:**

```typescript
// MMS Worker (extends SMS Worker)
class MMSRouter extends SMSRouter {
  async send(message: MMSMessage) {
    // Validate media files
    const validMedia = await this.validateMedia(message.media);

    const provider = await this.selectProvider(message);

    switch (provider.name) {
      case 'telnyx':
        return this.sendMMSViaTelnyx(message, validMedia);
      case 'twilio':
        return this.sendMMSViaTwilio(message, validMedia);
      case 'plivo':
        return this.sendMMSViaPlivo(message, validMedia);
    }
  }

  async validateMedia(media: MediaAttachment[]): Promise<MediaAttachment[]> {
    const validated = [];

    for (const file of media) {
      // Check file size (5 MB max per carrier rules)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error(`Media file ${file.url} exceeds 5 MB limit`);
      }

      // Check MIME type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'video/mp4', 'video/3gpp',
        'audio/mpeg', 'audio/mp3', 'audio/wav',
        'text/vcard', 'application/pdf'
      ];

      if (!allowedTypes.includes(file.mime_type)) {
        throw new Error(`Unsupported media type: ${file.mime_type}`);
      }

      // Ensure URL is publicly accessible (carriers fetch from URL)
      const accessible = await this.checkUrlAccessible(file.url);
      if (!accessible) {
        throw new Error(`Media URL not accessible: ${file.url}`);
      }

      validated.push(file);
    }

    return validated;
  }

  async sendMMSViaTelnyx(message: MMSMessage, media: MediaAttachment[]) {
    const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY });

    try {
      const result = await telnyx.messages.create({
        from: message.from,
        to: message.to,
        text: message.body,
        media_urls: media.map(m => m.url),
        // Optional: set webhook for delivery receipts
        webhook_url: `${process.env.API_BASE_URL}/webhooks/telnyx/mms`,
        webhook_failover_url: `${process.env.API_BASE_URL}/webhooks/telnyx/mms/failover`
      });

      return {
        provider: 'telnyx',
        channel: 'mms',
        external_id: result.data.id,
        status: 'sent',
        cost: 0.030,
        media_count: media.length
      };
    } catch (error) {
      await reportProviderError('telnyx', error);
      throw error;
    }
  }

  async sendMMSViaTwilio(message: MMSMessage, media: MediaAttachment[]) {
    const twilio = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    try {
      const result = await twilio.messages.create({
        from: message.from,
        to: message.to,
        body: message.body,
        mediaUrl: media.map(m => m.url),
        statusCallback: `${process.env.API_BASE_URL}/webhooks/twilio/mms`
      });

      return {
        provider: 'twilio',
        channel: 'mms',
        external_id: result.sid,
        status: 'sent',
        cost: 0.045,
        media_count: media.length
      };
    } catch (error) {
      await reportProviderError('twilio', error);
      throw error;
    }
  }
}
```

**Use Cases:**
- **Schools:** Send photos of school events, lunch menus, permission slips
- **Healthcare:** Send prescription images, medical forms, appointment cards
- **Real Estate:** Send property photos, virtual tour links, floor plans
- **Retail:** Send product images, QR codes, coupons with barcodes
- **Government:** Send maps of affected areas, infographics, emergency alerts with images

**Technical Considerations:**

1. **Media Hosting:** MMS requires publicly accessible URLs (carriers fetch media, not push)
   - Host on Cloudflare R2 (CDN, global distribution)
   - Generate signed URLs with 24-hour expiry
   - Optimize images (compress JPEG, resize to 1024x1024 max)

2. **Fallback to Link:** If MMS fails, auto-fallback to SMS with link
   ```typescript
   async sendWithFallback(message: MMSMessage) {
     try {
       return await this.send(message);
     } catch (error) {
       // Fallback: upload to CDN, send SMS with link
       const cdnUrl = await uploadToCDN(message.media);
       return await this.sendSMS({
         to: message.to,
         body: `${message.body}\n\nView media: ${cdnUrl}`
       });
     }
   }
   ```

3. **Carrier Limits:**
   - Most carriers: 5 MB total per MMS
   - Verizon: 1.2 MB (strict)
   - AT&T, T-Mobile: 3.5 MB
   - Recommendation: Keep under 1 MB for universal compatibility

4. **Message Concatenation:** MMS + SMS text (160 chars) = one message
   - Body can be up to 1,600 characters (10 SMS segments)
   - Carriers may charge SMS segments separately (check provider docs)

**Pricing:**
- Telnyx: $0.030/MMS (recommended)
- Plivo: $0.035/MMS
- Vonage: $0.040/MMS
- Twilio: $0.045/MMS

**Cost Optimization:**
- Compress images (JPEG quality 80%, resize to 800x800)
- Use image CDN with auto-optimization (Cloudflare Images: $5/month + $1/100K)
- For bulk campaigns: pre-generate optimized images, cache URLs

**Compliance:**
- Same TCPA rules as SMS (opt-in required)
- Carrier content filtering (adult content blocked)
- A2P 10DLC registration required for high-volume MMS

---

### **5.4 Email**

**Providers (Least-Cost Order):**

| Provider | Cost | Features | Use Case |
|----------|------|----------|----------|
| **ElasticEmail** | $0.0001/email | Bulk + transactional | Primary (cheapest) |
| **Postmark** | $0.0125/email | Transactional only, best deliverability | High-priority |
| **SendGrid** | $0.00095/email | Marketing + transactional | Bulk campaigns |
| **Mailgun** | $0.0008/email | Developer-friendly | API users |
| **Self-hosted SMTP** | $0.00001/email | Postfix/PowerMTA on AWS | Phase 3 (bulk only) |

**Implementation:**

```typescript
// Email Worker
import { ElasticEmail } from '@elasticemail/sdk';
import { Client as PostmarkClient } from 'postmark';

class EmailRouter {
  async send(email: EmailMessage) {
    const provider = await this.selectProvider(email);

    switch (provider.name) {
      case 'elastic_email':
        return this.sendViaElasticEmail(email);
      case 'postmark':
        return this.sendViaPostmark(email);
      case 'sendgrid':
        return this.sendViaSendGrid(email);
    }
  }

  async selectProvider(email: EmailMessage) {
    if (email.type === 'transactional' && email.priority === 'high') {
      // High-priority transactional: use Postmark (best deliverability)
      return { name: 'postmark', cost: 0.0125 };
    } else if (email.type === 'marketing' || email.recipients.length > 100) {
      // Bulk marketing: use SendGrid or ElasticEmail
      return { name: 'elastic_email', cost: 0.0001 };
    } else {
      // Default: cheapest (ElasticEmail)
      return { name: 'elastic_email', cost: 0.0001 };
    }
  }

  async sendViaElasticEmail(email: EmailMessage) {
    const client = new ElasticEmail(process.env.ELASTIC_EMAIL_API_KEY);

    const result = await client.emails.send({
      from: { email: email.from, name: email.from_name },
      to: email.to.map(addr => ({ email: addr })),
      subject: email.subject,
      bodyHtml: email.html_body,
      bodyText: email.text_body,
      attachments: email.attachments?.map(a => ({
        binaryContent: a.content,
        name: a.filename,
        contentType: a.mime_type
      }))
    });

    return {
      provider: 'elastic_email',
      external_id: result.messageId,
      status: 'sent',
      cost: 0.0001 * email.to.length
    };
  }
}
```

**Features:**
- HTML + plain text versions
- Inline images (embedded in email)
- Attachments (PDFs, images, etc.)
- Email templates with variables
- Bounce handling (hard/soft bounces)
- Complaint handling (spam reports)
- Link tracking (click analytics)
- Open tracking (read receipts)
- Unsubscribe management
- DKIM/SPF/DMARC authentication

**Self-Hosted SMTP (Phase 3):**

```yaml
# Postfix + PowerMTA on AWS EC2
infrastructure:
  smtp_cluster:
    - server: smtp-1.useiris.com
      ip: 52.12.34.56
      capacity: 1M emails/day
      warm_up_days: 30

    - server: smtp-2.useiris.com
      ip: 52.12.34.57
      capacity: 1M emails/day
      warm_up_days: 30

  ip_warming:
    day_1-7: 500 emails/day per IP
    day_8-14: 5K emails/day per IP
    day_15-21: 25K emails/day per IP
    day_22-30: 100K emails/day per IP
    day_31+: Full capacity

  dns_records:
    spf: "v=spf1 ip4:52.12.34.56 ip4:52.12.34.57 -all"
    dkim: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3..."
    dmarc: "v=DMARC1; p=reject; rua=mailto:dmarc@useiris.com"
```

**Cost:** $0.0001/email (ElasticEmail), $0.00001/email (self-hosted at scale)

---

### **5.5 Social Media**

**Platforms:**

#### **Facebook (Meta Graph API)**

```typescript
import { FacebookClient } from 'facebook-api-sdk';

class FacebookPoster {
  async post(message: SocialMessage) {
    const fb = new FacebookClient(process.env.FACEBOOK_ACCESS_TOKEN);

    // Post to page feed
    const result = await fb.pages.publishPost({
      page_id: message.recipient,  // Page ID
      message: message.body,
      link: message.link_url,
      media: message.media?.map(m => ({
        url: m.url,
        type: m.type  // photo, video
      }))
    });

    return {
      provider: 'facebook',
      external_id: result.id,  // Post ID
      post_url: `https://facebook.com/${result.id}`,
      status: 'published'
    };
  }

  async sendMessage(message: SocialMessage) {
    // Send direct message (Messenger)
    const fb = new FacebookClient(process.env.FACEBOOK_ACCESS_TOKEN);

    const result = await fb.messenger.sendMessage({
      recipient: { id: message.recipient },
      message: {
        text: message.body,
        attachments: message.media?.map(m => ({
          type: m.type,
          payload: { url: m.url }
        }))
      }
    });

    return {
      provider: 'facebook_messenger',
      external_id: result.message_id,
      status: 'sent'
    };
  }
}
```

**Features:**
- Post to Facebook Pages
- Send Messenger DMs
- Schedule posts
- Image/video uploads
- Link previews
- Hashtags, mentions

**Cost:** $0 (free API)

---

#### **Twitter/X (API v2)**

```typescript
import { TwitterApi } from 'twitter-api-v2';

class TwitterPoster {
  async post(message: SocialMessage) {
    const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

    // Upload media first (if any)
    const media_ids = [];
    for (const media of message.media || []) {
      const upload = await client.v1.uploadMedia(media.url);
      media_ids.push(upload);
    }

    // Post tweet
    const result = await client.v2.tweet({
      text: message.body,
      media: media_ids.length > 0 ? { media_ids } : undefined
    });

    return {
      provider: 'twitter',
      external_id: result.data.id,
      post_url: `https://twitter.com/i/status/${result.data.id}`,
      status: 'published'
    };
  }

  async sendDM(message: SocialMessage) {
    // Send direct message
    const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

    const result = await client.v1.sendDm({
      recipient_id: message.recipient,
      text: message.body,
      attachment: message.media?.[0]
    });

    return {
      provider: 'twitter_dm',
      external_id: result.event.id,
      status: 'sent'
    };
  }
}
```

**Features:**
- Post tweets (up to 280 chars)
- Send DMs
- Upload images (up to 4 per tweet)
- Upload videos
- Hashtags, mentions, URLs
- Quote tweets, reply threads

**Cost:** $0 (free tier: 1,500 tweets/month), $100/mo (basic: 10K tweets/month)

---

#### **Discord (Webhooks + Bot API)**

```typescript
import { Client, GatewayIntentBits } from 'discord.js';

class DiscordPoster {
  async postToChannel(message: SocialMessage) {
    // Use webhook (easier, no bot needed)
    const webhookUrl = await getDiscordWebhook(message.recipient);  // Channel ID

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message.body,
        embeds: message.media?.map(m => ({
          image: { url: m.url },
          description: m.alt_text
        }))
      })
    });

    return {
      provider: 'discord',
      external_id: response.id,
      status: 'published'
    };
  }

  async sendDM(message: SocialMessage) {
    // Bot DM (requires Discord bot)
    const client = new Client({ intents: [GatewayIntentBits.DirectMessages] });
    await client.login(process.env.DISCORD_BOT_TOKEN);

    const user = await client.users.fetch(message.recipient);
    await user.send({
      content: message.body,
      files: message.media?.map(m => ({ attachment: m.url }))
    });

    return {
      provider: 'discord_dm',
      status: 'sent'
    };
  }
}
```

**Features:**
- Post to channels (via webhooks)
- Send DMs (via bot)
- Rich embeds (formatted messages)
- File attachments
- Mentions (@user, @role)
- Reactions (emoji responses)

**Cost:** $0 (free API, unlimited)

---

#### **Telegram (Bot API)**

```typescript
import TelegramBot from 'node-telegram-bot-api';

class TelegramPoster {
  async sendMessage(message: SocialMessage) {
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

    const result = await bot.sendMessage(
      message.recipient,  // Chat ID or channel username
      message.body,
      {
        parse_mode: 'Markdown',  // Or 'HTML'
        disable_web_page_preview: false
      }
    );

    // Send media if provided
    if (message.media) {
      for (const media of message.media) {
        if (media.type === 'image') {
          await bot.sendPhoto(message.recipient, media.url);
        } else if (media.type === 'video') {
          await bot.sendVideo(message.recipient, media.url);
        }
      }
    }

    return {
      provider: 'telegram',
      external_id: result.message_id,
      status: 'sent'
    };
  }
}
```

**Features:**
- Send to channels (broadcast)
- Send to groups
- Send DMs
- Markdown/HTML formatting
- Inline keyboards (buttons)
- File attachments (up to 50 MB)

**Cost:** $0 (free API, unlimited)

---

#### **WhatsApp Business (Cloud API)**

```typescript
import { WhatsAppCloudAPI } from 'whatsapp-cloud-api';

class WhatsAppSender {
  async sendMessage(message: SocialMessage) {
    const wa = new WhatsAppCloudAPI({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
    });

    const result = await wa.messages.send({
      to: message.recipient,  // E.164 format
      type: 'text',
      text: { body: message.body }
    });

    // Send media if provided
    if (message.media) {
      for (const media of message.media) {
        await wa.messages.send({
          to: message.recipient,
          type: media.type,  // 'image', 'video', 'document'
          [media.type]: {
            link: media.url,
            caption: media.alt_text
          }
        });
      }
    }

    return {
      provider: 'whatsapp',
      external_id: result.messages[0].id,
      status: 'sent'
    };
  }

  async sendTemplate(message: SocialMessage) {
    // Pre-approved templates only (WhatsApp requirement)
    const wa = new WhatsAppCloudAPI({ /* ... */ });

    const result = await wa.messages.send({
      to: message.recipient,
      type: 'template',
      template: {
        name: 'appointment_reminder',  // Pre-approved template name
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: '2 PM' },     // {{1}}
            { type: 'text', text: 'tomorrow' }  // {{2}}
          ]
        }]
      }
    });

    return {
      provider: 'whatsapp_template',
      external_id: result.messages[0].id,
      status: 'sent'
    };
  }
}
```

**Features:**
- Send text messages
- Send media (images, videos, documents, audio)
- Send location
- Send contacts
- Pre-approved templates (required for first message)
- Rich messages (lists, buttons)
- Two-way messaging

**Cost:**
- **Free tier:** 1,000 conversations/month
- **Business-initiated:** $0.005-0.04/msg (varies by country)
- **User-initiated:** $0 (customer replies)

**Compliance:**
- Must use pre-approved templates for first message
- 24-hour messaging window (after customer replies)
- Opt-in required

---

#### **Slack (Workspace Messaging)**

```typescript
import { WebClient } from '@slack/web-api';

class SlackMessenger {
  private client: WebClient;

  constructor() {
    this.client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }

  async sendToChannel(message: SlackMessage) {
    // Post to public/private channel
    const result = await this.client.chat.postMessage({
      channel: message.channel_id,  // C0123456789 or #general
      text: message.body,
      blocks: message.blocks,  // Rich formatting (optional)
      attachments: message.media?.map(m => ({
        image_url: m.url,
        title: m.alt_text
      })),
      thread_ts: message.thread_ts,  // Reply to thread (optional)
      reply_broadcast: message.broadcast_to_channel  // Broadcast thread reply
    });

    return {
      provider: 'slack',
      channel: 'slack',
      external_id: result.ts,  // Message timestamp (unique ID)
      permalink: await this.getPermalink(message.channel_id, result.ts),
      status: 'sent'
    };
  }

  async sendDM(message: SlackMessage) {
    // Send direct message to user
    const result = await this.client.chat.postMessage({
      channel: message.user_id,  // U0123456789
      text: message.body,
      blocks: message.blocks
    });

    return {
      provider: 'slack',
      channel: 'slack',
      external_id: result.ts,
      status: 'sent'
    };
  }

  async broadcastToMultipleChannels(message: SlackMessage, channels: string[]) {
    // Broadcast to multiple channels simultaneously
    const results = await Promise.allSettled(
      channels.map(channel =>
        this.client.chat.postMessage({
          channel,
          text: message.body,
          blocks: message.blocks,
          attachments: message.attachments
        })
      )
    );

    return {
      provider: 'slack',
      channel: 'slack',
      total_channels: channels.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        channel: channels[i],
        status: r.status,
        message_id: r.status === 'fulfilled' ? r.value.ts : null,
        error: r.status === 'rejected' ? r.reason : null
      }))
    };
  }

  async sendRichMessage(message: SlackMessage) {
    // Send message with Slack Block Kit (rich formatting)
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: message.subject || 'Alert'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message.body
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `Sent via IRIS at ${new Date().toLocaleString()}`
        }]
      }
    ];

    // Add action buttons (optional)
    if (message.actions) {
      blocks.push({
        type: 'actions',
        elements: message.actions.map(action => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.label
          },
          url: action.url,
          action_id: action.id
        }))
      });
    }

    const result = await this.client.chat.postMessage({
      channel: message.channel_id,
      text: message.body,  // Fallback text
      blocks
    });

    return {
      provider: 'slack',
      external_id: result.ts,
      status: 'sent'
    };
  }

  async getPermalink(channel: string, timestamp: string): Promise<string> {
    const result = await this.client.chat.getPermalink({
      channel,
      message_ts: timestamp
    });
    return result.permalink;
  }
}
```

**Use Cases:**
- **Internal Team Alerts:** Notify dev/ops teams of incidents, errors, deployments
- **Customer Support:** Forward urgent customer issues to #support channel
- **Sales Notifications:** New leads, deal updates to #sales channel
- **Emergency Broadcast:** Send critical alerts to entire workspace
- **Monitoring Alerts:** Server down, API errors, high latency warnings
- **Schools/Enterprise:** Broadcast to staff channels (teachers, admin, IT)

**Features:**
- Post to public/private channels
- Send direct messages to users
- Rich formatting (Block Kit: buttons, images, sections, dividers)
- Thread replies
- File uploads
- Emoji reactions
- Message scheduling
- Interactive components (buttons, dropdowns, date pickers)
- Webhooks (incoming/outgoing)

**Authentication:**
- **Bot Token** (most common): `xoxb-*` - Requires Slack App installation in workspace
- **User Token** (less common): `xoxp-*` - Acts on behalf of user
- **Incoming Webhook** (simple): Webhook URL for posting to single channel

**Setup Process:**
1. Create Slack App at api.slack.com/apps
2. Request OAuth scopes:
   - `chat:write` - Post messages
   - `chat:write.public` - Post to channels without joining
   - `users:read` - Read user info
   - `channels:read` - Read channel list
3. Install App to workspace
4. Save Bot Token to environment variables

**Rate Limits:**
- **Tier 1** (chat.postMessage): 1 request/second per channel
- **Tier 2** (most methods): 20 requests/minute
- **Tier 3** (intensive): 50+ requests/minute
- Burst allowance: 100 requests in 1 minute

**Cost:** $0 (Free API, no messaging fees)

**Compliance:**
- Messages stored in customer's Slack workspace (Slack's compliance)
- Enterprise Grid: Data residency, DLP, eDiscovery available
- GDPR/HIPAA: Customer's responsibility (Slack Enterprise required for HIPAA)

**Technical Considerations:**

1. **Multi-Workspace Support:**
   ```typescript
   // Store multiple workspace tokens per tenant
   interface SlackIntegration {
     tenant_id: string;
     workspace_id: string;
     workspace_name: string;
     bot_token: string;
     team_id: string;
     installed_at: Date;
   }
   ```

2. **Channel Discovery:**
   ```typescript
   async listChannels(workspaceToken: string) {
     const client = new WebClient(workspaceToken);
     const result = await client.conversations.list({
       exclude_archived: true,
       types: 'public_channel,private_channel'
     });
     return result.channels;
   }
   ```

3. **Error Handling:**
   ```typescript
   // Common errors
   switch (error.data.error) {
     case 'channel_not_found':
       throw new Error('Channel does not exist or bot not invited');
     case 'not_in_channel':
       // Auto-join channel if possible
       await client.conversations.join({ channel: channelId });
       return await this.sendToChannel(message);  // Retry
     case 'rate_limited':
       // Retry with exponential backoff
       await sleep(error.data.retry_after * 1000);
       return await this.sendToChannel(message);
   }
   ```

4. **Webhook Alternative (Simpler):**
   ```typescript
   async sendViaWebhook(webhookUrl: string, message: SlackMessage) {
     // No authentication needed, faster setup
     const result = await fetch(webhookUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         text: message.body,
         blocks: message.blocks
       })
     });

     if (!result.ok) {
       throw new Error(`Slack webhook failed: ${result.status}`);
     }
   }
   ```

**Pricing for IRIS:**
- Free API (no per-message cost)
- Customer provides their own Slack workspace + bot token
- IRIS acts as integration layer (no Slack fees passed through)

---

#### **Instagram DMs (Meta Business Platform)**

```typescript
import { InstagramClient } from 'instagram-graph-api-sdk';

class InstagramMessenger {
  private client: InstagramClient;

  constructor() {
    this.client = new InstagramClient({
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      pageId: process.env.INSTAGRAM_PAGE_ID
    });
  }

  async sendDM(message: InstagramMessage) {
    // Send direct message to Instagram user
    const result = await this.client.sendMessage({
      recipient: { id: message.recipient_id },  // Instagram user ID (IGID)
      message: {
        text: message.body,
        attachment: message.media ? {
          type: message.media.type,  // image, video, audio
          payload: { url: message.media.url }
        } : undefined
      }
    });

    return {
      provider: 'instagram',
      channel: 'instagram_dm',
      external_id: result.message_id,
      status: 'sent'
    };
  }

  async sendStory(message: InstagramMessage) {
    // Post to Instagram Story
    const result = await this.client.createStory({
      media_type: message.media.type,  // IMAGE or VIDEO
      media_url: message.media.url,
      caption: message.body
    });

    return {
      provider: 'instagram',
      channel: 'instagram_story',
      external_id: result.id,
      status: 'published'
    };
  }

  async replyToComment(commentId: string, message: string) {
    // Reply to comment on Instagram post
    const result = await this.client.comments.createReply({
      comment_id: commentId,
      message
    });

    return {
      provider: 'instagram',
      external_id: result.id,
      status: 'sent'
    };
  }
}
```

**Use Cases:**
- **Retail:** Customer service via Instagram DMs
- **Influencer Marketing:** Automated responses to followers
- **E-commerce:** Order confirmations, shipping updates via DM
- **Restaurants:** Reservation confirmations, menu questions
- **Fashion/Beauty:** Product inquiries, styling advice

**Features:**
- Send text messages
- Send images, videos, audio
- Send story mentions
- Reply to comments
- Quick replies (predefined response buttons)
- Generic templates (structured messages)

**Limitations:**
- **24-hour window:** Can only message users who messaged you first (within 24 hrs)
- **Message tags:** For messages outside 24hr window (limited use cases)
- **No broadcast:** Cannot initiate DMs to users who haven't messaged you
- **Requires Business Account:** Must have Instagram Business or Creator account
- **Facebook Page required:** Instagram must be linked to Facebook Page

**Cost:** $0 (Free API, no messaging fees)

**Compliance:**
- Meta Business Platform Terms of Service
- Cannot send promotional content outside 24hr window
- Must respond to user inquiries (not marketing blasts)

---

#### **Microsoft Teams (Enterprise Chat)**

```typescript
import { Client } from '@microsoft/microsoft-graph-client';

class TeamsMessenger {
  private client: Client;

  constructor(accessToken: string) {
    this.client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  async sendToChannel(message: TeamsMessage) {
    // Post to Teams channel
    const chatMessage = {
      body: {
        contentType: 'html',
        content: message.html_body || message.body
      },
      attachments: message.media?.map(m => ({
        id: m.id,
        contentType: m.mime_type,
        contentUrl: m.url,
        name: m.filename
      }))
    };

    const result = await this.client
      .api(`/teams/${message.team_id}/channels/${message.channel_id}/messages`)
      .post(chatMessage);

    return {
      provider: 'teams',
      channel: 'teams',
      external_id: result.id,
      web_url: result.webUrl,
      status: 'sent'
    };
  }

  async sendToChat(message: TeamsMessage) {
    // Send to 1:1 or group chat
    const chatMessage = {
      body: {
        contentType: 'html',
        content: message.html_body || message.body
      }
    };

    const result = await this.client
      .api(`/chats/${message.chat_id}/messages`)
      .post(chatMessage);

    return {
      provider: 'teams',
      external_id: result.id,
      status: 'sent'
    };
  }

  async sendAdaptiveCard(message: TeamsMessage) {
    // Send rich Adaptive Card (Teams' Block Kit equivalent)
    const card = {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            text: message.subject,
            weight: 'Bolder',
            size: 'Large'
          },
          {
            type: 'TextBlock',
            text: message.body,
            wrap: true
          },
          {
            type: 'Image',
            url: message.media?.[0]?.url,
            size: 'Large'
          }
        ],
        actions: message.actions?.map(action => ({
          type: 'Action.OpenUrl',
          title: action.label,
          url: action.url
        }))
      }
    };

    const chatMessage = {
      body: {
        contentType: 'html',
        content: message.body  // Fallback
      },
      attachments: [card]
    };

    const result = await this.client
      .api(`/teams/${message.team_id}/channels/${message.channel_id}/messages`)
      .post(chatMessage);

    return {
      provider: 'teams',
      external_id: result.id,
      status: 'sent'
    };
  }
}
```

**Use Cases:**
- **Enterprise Internal Comms:** Company announcements, HR updates, IT alerts
- **Customer Support:** Enterprise customers using Teams for support
- **Project Management:** Status updates, milestone alerts
- **Sales:** Deal updates, quote approvals
- **IT Operations:** Server monitoring, incident alerts

**Features:**
- Post to channels
- Send to 1:1 or group chats
- Adaptive Cards (rich formatting, buttons, images)
- @mentions (users, channels, teams)
- File attachments
- Threaded replies
- Meeting notifications

**Authentication:**
- **OAuth 2.0** - Microsoft Azure AD required
- **Application Permissions** - ChannelMessage.Send, Chat.ReadWrite.All
- **Delegated Permissions** - Send on behalf of user

**Cost:** $0 (Free API, customer provides Teams license)

**Compliance:**
- Microsoft 365 compliance (customer's responsibility)
- Data residency options available
- GDPR, HIPAA compliant (with E5 license)

---

#### **Push Notifications (Mobile Apps)**

```typescript
import * as admin from 'firebase-admin';
import { APNs } from 'apns2';

class PushNotificationService {
  private fcm: admin.messaging.Messaging;
  private apns: APNs;

  constructor() {
    // Initialize Firebase Cloud Messaging (Android + iOS)
    admin.initializeApp({
      credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT)
    });
    this.fcm = admin.messaging();

    // Initialize Apple Push Notification service (iOS native)
    this.apns = new APNs({
      team: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      signingKey: process.env.APPLE_SIGNING_KEY
    });
  }

  async sendToDevice(notification: PushNotification) {
    // Send to single device (FCM for Android/iOS)
    const message = {
      token: notification.device_token,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.image_url
      },
      data: notification.data,  // Custom payload
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          sound: notification.sound || 'default',
          icon: notification.icon,
          color: notification.color
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body
            },
            sound: notification.sound || 'default',
            badge: notification.badge
          }
        }
      }
    };

    const result = await this.fcm.send(message);

    return {
      provider: 'fcm',
      channel: 'push',
      external_id: result,  // Message ID
      status: 'sent'
    };
  }

  async sendToTopic(notification: PushNotification, topic: string) {
    // Broadcast to all devices subscribed to topic
    const message = {
      topic,  // e.g., 'emergency_alerts'
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data
    };

    const result = await this.fcm.send(message);

    return {
      provider: 'fcm',
      channel: 'push',
      topic,
      external_id: result,
      status: 'sent'
    };
  }

  async sendToSegment(notification: PushNotification, deviceTokens: string[]) {
    // Batch send to up to 500 devices
    const messages = deviceTokens.map(token => ({
      token,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data
    }));

    const result = await this.fcm.sendEach(messages);

    return {
      provider: 'fcm',
      channel: 'push',
      total: result.responses.length,
      successful: result.successCount,
      failed: result.failureCount,
      results: result.responses
    };
  }
}
```

**Use Cases:**
- **Schools:** Emergency alerts, event reminders to parent mobile apps
- **Healthcare:** Appointment reminders, prescription refill alerts
- **Retail:** Order status, delivery notifications, promotions
- **Banking:** Transaction alerts, fraud warnings
- **News/Media:** Breaking news alerts

**Features:**
- Silent notifications (background data sync)
- Rich notifications (images, actions, buttons)
- Notification badges
- Custom sounds
- Deep linking (open specific app screen)
- Topic-based subscriptions
- Scheduled notifications
- A/B testing

**Platforms Supported:**
- **Firebase Cloud Messaging (FCM):** Android + iOS (recommended)
- **Apple Push Notification Service (APNs):** iOS native
- **Expo Push:** React Native apps using Expo
- **OneSignal:** Third-party aggregator (multi-platform)

**Cost:**
- Firebase FCM: Free (unlimited)
- APNs: Free (unlimited)
- OneSignal: $9/month (10K subscribers), $99/month (100K)

**Technical Considerations:**

1. **Device Token Management:**
   ```typescript
   // Store device tokens per user
   interface DeviceToken {
     user_id: string;
     token: string;
     platform: 'ios' | 'android' | 'web';
     app_version: string;
     created_at: Date;
     last_used: Date;
   }
   ```

2. **Token Expiry Handling:**
   ```typescript
   async cleanupInvalidTokens(results: any[]) {
     const invalidTokens = results
       .filter(r => r.error?.code === 'messaging/registration-token-not-registered')
       .map(r => r.token);

     // Remove from database
     await db.query(
       'DELETE FROM device_tokens WHERE token = ANY($1)',
       [invalidTokens]
     );
   }
   ```

3. **Notification Delivery Tracking:**
   ```typescript
   // Track opens via deep links
   const deepLink = `myapp://notification/${notificationId}?utm_source=push`;

   // Log when user opens notification
   await trackNotificationOpen(notificationId, userId, timestamp);
   ```

---

#### **RCS (Rich Communication Services)**

```typescript
import { RCSBusinessMessaging } from 'google-rcs-business-messaging';

class RCSMessenger {
  private client: RCSBusinessMessaging;

  constructor() {
    this.client = new RCSBusinessMessaging({
      credentials: JSON.parse(process.env.GOOGLE_RCS_CREDENTIALS)
    });
  }

  async sendRichCard(message: RCSMessage) {
    // Send rich card with image, description, buttons
    const rcsMessage = {
      contentMessage: {
        richCard: {
          standaloneCard: {
            cardOrientation: 'VERTICAL',
            cardContent: {
              title: message.title,
              description: message.body,
              media: {
                height: 'MEDIUM',
                contentInfo: {
                  fileUrl: message.image_url,
                  forceRefresh: false
                }
              },
              suggestions: message.actions?.map(action => ({
                action: {
                  text: action.label,
                  postbackData: action.id,
                  openUrlAction: {
                    url: action.url
                  }
                }
              }))
            }
          }
        }
      }
    };

    const result = await this.client.sendMessage({
      parent: `conversations/${message.conversation_id}`,
      message: rcsMessage
    });

    return {
      provider: 'rcs',
      channel: 'rcs',
      external_id: result.name,
      status: 'sent'
    };
  }

  async sendCarousel(messages: RCSMessage[]) {
    // Send carousel of multiple cards
    const rcsMessage = {
      contentMessage: {
        richCard: {
          carouselCard: {
            cardWidth: 'MEDIUM',
            cardContents: messages.map(msg => ({
              title: msg.title,
              description: msg.body,
              media: {
                height: 'MEDIUM',
                contentInfo: {
                  fileUrl: msg.image_url
                }
              },
              suggestions: msg.actions?.map(action => ({
                action: {
                  text: action.label,
                  openUrlAction: { url: action.url }
                }
              }))
            }))
          }
        }
      }
    };

    const result = await this.client.sendMessage({
      parent: `conversations/${messages[0].conversation_id}`,
      message: rcsMessage
    });

    return {
      provider: 'rcs',
      external_id: result.name,
      status: 'sent'
    };
  }
}
```

**Use Cases:**
- **Retail:** Product catalogs with images + "Buy Now" buttons
- **Airlines:** Boarding passes, flight updates with QR codes
- **Banking:** Transaction receipts with rich formatting
- **Restaurants:** Menu with photos, "Order Now" buttons
- **Schools:** Event invites with RSVP buttons, photo galleries

**Features:**
- Rich cards (images, descriptions, buttons)
- Carousels (swipeable cards)
- Read receipts
- Typing indicators
- High-resolution images (up to 2 MB)
- Suggested replies/actions
- File transfer (PDFs, videos)
- Location sharing
- Group messaging

**Availability:**
- **Android only** (90% of Android devices in US, UK, France, Spain, Mexico)
- **Carrier-dependent** (T-Mobile, AT&T, Verizon support in US)
- **Fallback to SMS** automatic if RCS unavailable

**Cost:**
- Google RCS Business Messaging: $0.01/message (free tier: 100K/month)
- Much cheaper than SMS ($0.0079) for rich content

**Limitations:**
- Not available on iPhone (iMessage incompatible)
- Requires carrier + device support
- Google Business Communications account required
- Message verification required (brand approval)

---

#### **Webhook / HTTP POST**

```typescript
class WebhookSender {
  async send(webhook: WebhookMessage) {
    const payload = {
      event: webhook.event_type,  // 'alert', 'notification', 'update'
      timestamp: new Date().toISOString(),
      data: webhook.data,
      metadata: webhook.metadata
    };

    // Add signature for verification
    const signature = this.generateSignature(
      payload,
      webhook.secret_key
    );

    const result = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'IRIS-Platform/1.0',
        'X-IRIS-Signature': signature,
        'X-IRIS-Event': webhook.event_type,
        ...webhook.custom_headers
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(webhook.timeout || 30000)
    });

    if (!result.ok) {
      throw new Error(`Webhook failed: ${result.status} ${result.statusText}`);
    }

    return {
      provider: 'webhook',
      channel: 'webhook',
      status_code: result.status,
      response_body: await result.text(),
      status: 'sent'
    };
  }

  generateSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  async sendWithRetry(webhook: WebhookMessage, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.send(webhook);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }
}
```

**Use Cases:**
- **Custom Integrations:** Send data to customer's internal systems
- **Zapier/Make.com:** Trigger automation workflows
- **CRM Updates:** Push leads to Salesforce, HubSpot
- **Ticketing Systems:** Create tickets in Jira, ServiceNow
- **Analytics:** Send events to Mixpanel, Segment, Amplitude

**Features:**
- Custom HTTP headers
- Signature verification (HMAC)
- Automatic retries with exponential backoff
- Timeout configuration
- Success/failure tracking
- Payload transformation

**Cost:** $0 (customer provides endpoint)

---

#### **IPAWS (Integrated Public Alert & Warning System)**

```typescript
import { CAP } from 'cap-xml';  // Common Alerting Protocol
import { X509Certificate } from 'crypto';

class IPAWSIntegration {
  private cowaCertificate: X509Certificate;
  private ipawsEndpoint: string = 'https://apps.fema.gov/IPAWS-COG/COG_SERVICE';

  constructor() {
    // Load FEMA-issued COWS certificate
    this.cowaCertificate = new X509Certificate(
      process.env.IPAWS_CERTIFICATE
    );
  }

  async sendEmergencyAlert(alert: EmergencyAlert) {
    // Generate CAP (Common Alerting Protocol) XML
    const capMessage = this.generateCAPMessage(alert);

    // Sign with COWS certificate
    const signedCAP = await this.signCAPMessage(capMessage);

    // Submit to IPAWS-OPEN
    const result = await fetch(this.ipawsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': `Bearer ${process.env.IPAWS_API_KEY}`
      },
      body: signedCAP
    });

    if (!result.ok) {
      throw new Error(`IPAWS submission failed: ${result.status}`);
    }

    const response = await result.text();

    return {
      provider: 'ipaws',
      channel: 'ipaws',
      external_id: this.extractAlertId(response),
      status: 'sent',
      wea_enabled: alert.wireless_emergency_alerts,
      eas_enabled: alert.emergency_alert_system
    };
  }

  generateCAPMessage(alert: EmergencyAlert): string {
    const cap = new CAP({
      // Alert identification
      identifier: alert.id,
      sender: alert.sender_email,  // Must be @authorized-domain.gov
      sent: new Date().toISOString(),
      status: 'Actual',  // Actual | Exercise | Test
      msgType: 'Alert',  // Alert | Update | Cancel
      scope: 'Public',

      // Alert info
      info: {
        category: alert.category,  // Geo, Met, Safety, Security, Rescue, Fire, Health, Env, Transport, Infra, CBRNE, Other
        event: alert.event_type,   // e.g., "Tornado Warning", "Evacuation Order"
        urgency: alert.urgency,    // Immediate | Expected | Future | Past
        severity: alert.severity,   // Extreme | Severe | Moderate | Minor
        certainty: alert.certainty, // Observed | Likely | Possible | Unlikely

        // Message content
        headline: alert.headline,
        description: alert.description,
        instruction: alert.instruction,

        // Geographic area (polygon or SAME code)
        area: {
          areaDesc: alert.area_description,
          polygon: alert.polygon,  // lat,lon pairs (WGS 84)
          geocode: {
            valueName: 'SAME',
            value: alert.same_codes  // e.g., ['006037'] for LA County
          }
        },

        // Wireless Emergency Alerts (WEA) settings
        parameter: [
          {
            valueName: 'WEA',
            value: alert.wireless_emergency_alerts ? '1' : '0'
          },
          {
            valueName: 'CMAMtext',
            value: alert.wea_short_text  // 90 chars max for WEA
          },
          {
            valueName: 'CMAMlongtext',
            value: alert.wea_long_text  // 360 chars max
          }
        ]
      }
    });

    return cap.toXML();
  }

  async signCAPMessage(capXML: string): Promise<string> {
    // Sign with COWS (Collaborative Operating Web Services) certificate
    // Required by FEMA for all IPAWS submissions
    const crypto = require('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(capXML);
    const signature = sign.sign(this.cowaCertificate, 'base64');

    // Wrap in signed envelope
    return `
      <SignedCAP>
        <CAP>${capXML}</CAP>
        <Signature>${signature}</Signature>
      </SignedCAP>
    `;
  }

  extractAlertId(response: string): string {
    // Parse IPAWS response to get alert ID
    const match = response.match(/<alertId>(.*?)<\/alertId>/);
    return match ? match[1] : 'unknown';
  }

  async updateAlert(originalAlertId: string, update: EmergencyAlert) {
    // Send CAP Update message (references original alert)
    update.references = originalAlertId;
    return await this.sendEmergencyAlert(update);
  }

  async cancelAlert(originalAlertId: string, reason: string) {
    // Send CAP Cancel message
    const cancelMessage = this.generateCAPMessage({
      id: `cancel-${originalAlertId}`,
      msgType: 'Cancel',
      references: originalAlertId,
      description: reason
    } as EmergencyAlert);

    const signedCAP = await this.signCAPMessage(cancelMessage);

    const result = await fetch(this.ipawsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': `Bearer ${process.env.IPAWS_API_KEY}`
      },
      body: signedCAP
    });

    return {
      provider: 'ipaws',
      channel: 'ipaws',
      action: 'cancel',
      original_alert_id: originalAlertId,
      status: result.ok ? 'cancelled' : 'failed'
    };
  }
}
```

**What is IPAWS?**

IPAWS is the **federal government's emergency alerting backbone** managed by FEMA. It enables authorized officials to send emergency alerts through:

1. **Wireless Emergency Alerts (WEA)** - Cell phone alerts (Amber Alerts, Presidential Alerts, Extreme/Severe Weather)
2. **Emergency Alert System (EAS)** - TV/radio broadcast interruption
3. **NOAA Weather Radio** - All-hazards radio network

**Why IPAWS is Critical:**

| Customer Type | Use Case | Why Required |
|---------------|----------|--------------|
| **Cities/Counties** | Tornado warnings, evacuation orders, boil water notices | WEA reaches 100% of cell phones in area (no opt-in) |
| **Water Utilities** | Water main breaks, contamination, boil orders | Federally-mandated alert capability |
| **Power Companies** | Rolling blackouts, grid emergencies | Public safety requirement |
| **School Districts** | Lockdowns, shootings, severe weather | Reaches parents even without app/registration |
| **State/Federal Agencies** | Amber Alerts, natural disasters, terrorism | Federal law (Presidential directive) |

**Use Cases:**

1. **Tornado Warning** (Weather Service)
   - Trigger WEA to all phones in affected counties
   - Interrupt TV/radio broadcasts
   - 100% population reach in < 1 minute

2. **Evacuation Order** (City Emergency Management)
   - WEA with evacuation instructions
   - Polygon-based targeting (specific neighborhoods)
   - Multi-language support

3. **Amber Alert** (Law Enforcement)
   - Statewide WEA
   - Vehicle description, license plate
   - Critical first hours of child abduction

4. **Water Contamination** (Water Utility)
   - "Do not drink water" alert via WEA
   - Targeted to affected zip codes
   - Follow-up with boil order instructions

**Features:**

- **WEA Delivery:** Alert appears on cell phones like Presidential Alert (can't be blocked)
- **EAS Broadcast:** Interrupts TV/radio programming
- **Geographic Targeting:** Polygon (lat/lon) or SAME codes (county-level)
- **Multi-language:** Spanish support required
- **90-char WEA limit:** Short message for phone display
- **360-char extended:** Longer message via "Learn More" button
- **Priority Levels:** Presidential (highest), Imminent Threat, Amber Alert

**Requirements:**

- **FEMA Authorization** - Apply via IPAWS-OPEN program
- **COG Account** - Collaborative Operating Gateway
- **COWS Certificate** - Digital signature certificate from FEMA
- **Training** - FEMA IS-247.A certification (free online course)
- **Testing** - Monthly test required (not sent to public)
- **Approval Process** - 30-60 days for new organizations

**Authentication:**

1. Organization must be government entity or critical infrastructure
2. Submit application to FEMA with:
   - Government authorization letter
   - Designated alerting authority contact
   - Proof of 24/7 staffing
3. Complete FEMA training (IS-247.A)
4. Receive COG credentials + COWS certificate
5. Pass testing period (practice alerts)

**Technical Requirements:**

- **CAP 1.2 Standard** - Common Alerting Protocol XML
- **Digital Signatures** - All messages signed with COWS cert
- **SAME Codes** - Specific Area Message Encoding (county codes)
- **Polygon Coordinates** - WGS 84 decimal degrees
- **WEA Character Limits:** 90 chars (English), 90 chars (Spanish)

**Cost:**

- **IPAWS Access:** $0 (free federal system)
- **FEMA Training:** $0 (free online)
- **Integration Development:** One-time cost (8-16 hours dev time)
- **COWS Certificate:** $0 (issued by FEMA)
- **Per-Alert Cost:** $0 (no fees)

**Compliance:**

- **EAS Rules (FCC Part 11)** - Mandates for broadcast stations
- **WEA Rules (FCC Part 10)** - Mobile carrier participation
- **Stafford Act** - Federal disaster response law
- **Presidential Directive PPD-8** - National preparedness system

**Limitations:**

- **Authorization Required** - Can't use without FEMA approval
- **Government/Critical Infrastructure Only** - Not for commercial use
- **False Alert Liability** - Hawaii false missile alert ($12M+ cost)
- **No Marketing** - Strictly emergency use only
- **Testing Required** - Must test monthly (logged by FEMA)

**IRIS Integration Strategy:**

1. **Phase 1:** Build CAP message generator + COWS signing
2. **Phase 2:** Partner with city/county for pilot (they provide COWS cert)
3. **Phase 3:** Document setup process for customer's IPAWS account
4. **Phase 4:** White-label solution (customers use their own FEMA credentials)

**Competitive Advantage:**

- **Remind:** No IPAWS integration
- **ParentSquare:** No IPAWS integration
- **Everbridge:** Has IPAWS ($$$$ enterprise pricing)
- **Rave Mobile Safety:** Has IPAWS (expensive)
- **IRIS:** Include IPAWS in standard pricing (schools/cities get WEA capability)

**Sales Pitch for Cities:**

> "IRIS includes IPAWS integration at no extra cost. Send Wireless Emergency Alerts (WEA) that reach every cell phone in your jurisdiction—even people without smartphones or your app. Other vendors charge $50K-100K/year for IPAWS. We include it free."

**Sales Pitch for Schools:**

> "During a lockdown, reach parents instantly via Wireless Emergency Alerts (WEA)—even those who didn't install your app or sign up for notifications. IPAWS integration means 100% parent reach in under 1 minute."

---

#### **Apple Business Messages (iMessage for Business)**

```typescript
import { AppleBusinessChat } from 'apple-business-chat-sdk';

class AppleMessenger {
  private client: AppleBusinessChat;

  constructor() {
    this.client = new AppleBusinessChat({
      businessId: process.env.APPLE_BUSINESS_ID,
      certificate: process.env.APPLE_BUSINESS_CERT,
      privateKey: process.env.APPLE_PRIVATE_KEY
    });
  }

  async sendMessage(message: AppleMessage) {
    // Send rich message to iPhone user via iMessage
    const result = await this.client.sendMessage({
      destinationId: message.recipient_id,  // Apple customer ID
      sourceId: message.business_id,
      message: {
        type: 'richLink',
        title: message.title,
        subtitle: message.subtitle,
        imageURL: message.image_url,
        url: message.link_url
      }
    });

    return {
      provider: 'apple_business_messages',
      channel: 'apple_messages',
      external_id: result.messageId,
      status: 'sent'
    };
  }

  async sendInteractiveMessage(message: AppleMessage) {
    // Send message with buttons, pickers, payment options
    const result = await this.client.sendMessage({
      destinationId: message.recipient_id,
      sourceId: message.business_id,
      message: {
        type: 'interactive',
        body: message.body,
        style: 'icon',
        imageName: 'calendar',
        bubbles: [
          {
            title: 'Pick a time',
            type: 'timePicker',
            timeslots: message.time_slots
          }
        ]
      }
    });

    return {
      provider: 'apple_business_messages',
      external_id: result.messageId,
      status: 'sent'
    };
  }

  async sendApplePayRequest(payment: ApplePayment) {
    // Request Apple Pay payment in chat
    const result = await this.client.sendMessage({
      destinationId: payment.recipient_id,
      sourceId: payment.business_id,
      message: {
        type: 'pay',
        merchantIdentifier: payment.merchant_id,
        amount: payment.amount,
        currencyCode: 'USD',
        lineItems: payment.items.map(item => ({
          label: item.label,
          amount: item.amount
        }))
      }
    });

    return {
      provider: 'apple_business_messages',
      external_id: result.messageId,
      payment_id: result.paymentId,
      status: 'payment_requested'
    };
  }
}
```

**What is Apple Business Messages?**

Apple's platform for businesses to chat with customers via iMessage on iPhone, iPad, Mac.

**Why Critical:**
- **50%+ US market share** - Half of US uses iPhone
- **Rich messaging** - Images, buttons, location, Apple Pay
- **Native experience** - Built into Messages app (no download)
- **High engagement** - iMessage has 90%+ open rates
- **Trust** - Apple badge = verified business

**Use Cases:**
- **Schools:** Appointment scheduling, lunch balance via Apple Pay
- **Healthcare:** Appointment reminders with calendar picker
- **Retail:** Order confirmations, delivery tracking, Apple Pay checkout
- **Banking:** Transaction alerts, fraud verification
- **Hospitality:** Booking confirmations, check-in

**Features:**
- Rich links (images, titles, URLs)
- Interactive pickers (time, location, list)
- Apple Pay integration
- Live chat with agents
- OAuth authentication
- Custom app integration

**Entry Points:**
- Safari web browser ("Message" button)
- Apple Maps (business listing)
- Siri ("Message [BusinessName]")
- Custom app deep links

**Cost:** $0 (Free API, no per-message fees)

**Requirements:**
- Apple Developer account
- D-U-N-S number
- Apple Business Register verification (1-2 weeks)
- CSP (Chat Service Provider) or direct integration

---

#### **Google Business Messages (Rich Business Messaging)**

```typescript
import { GoogleBusinessMessages } from 'google-business-communications';

class GoogleBusinessMessenger {
  private client: GoogleBusinessMessages;

  constructor() {
    this.client = new GoogleBusinessMessages({
      credentials: JSON.parse(process.env.GOOGLE_BUSINESS_CREDENTIALS)
    });
  }

  async sendMessage(message: GoogleBusinessMessage) {
    // Send message to user who initiated chat from Google Search/Maps
    const result = await this.client.conversations.sendMessage({
      parent: message.conversation_id,
      message: {
        text: message.body,
        containsRichText: true,
        richCard: message.rich_card ? {
          standaloneCard: {
            cardContent: {
              title: message.rich_card.title,
              description: message.rich_card.description,
              media: {
                height: 'MEDIUM',
                contentInfo: {
                  fileUrl: message.rich_card.image_url,
                  altText: message.rich_card.alt_text
                }
              },
              suggestions: message.rich_card.actions?.map(action => ({
                reply: {
                  text: action.label,
                  postbackData: action.id
                }
              }))
            }
          }
        } : undefined
      }
    });

    return {
      provider: 'google_business_messages',
      channel: 'google_business',
      external_id: result.name,
      status: 'sent'
    };
  }

  async sendCarousel(message: GoogleBusinessMessage, cards: RichCard[]) {
    // Send swipeable carousel of cards
    const result = await this.client.conversations.sendMessage({
      parent: message.conversation_id,
      message: {
        richCard: {
          carouselCard: {
            cardWidth: 'MEDIUM',
            cardContents: cards.map(card => ({
              title: card.title,
              description: card.description,
              media: {
                height: 'MEDIUM',
                contentInfo: {
                  fileUrl: card.image_url
                }
              },
              suggestions: card.actions?.map(action => ({
                action: {
                  text: action.label,
                  openUrlAction: {
                    url: action.url
                  }
                }
              }))
            }))
          }
        }
      }
    });

    return {
      provider: 'google_business_messages',
      external_id: result.name,
      status: 'sent'
    };
  }
}
```

**What is Google Business Messages?**

Google's platform for businesses to chat with customers directly from Google Search and Maps.

**Why Critical:**
- **High intent** - Users actively searching for your business
- **No app required** - Built into Google Search/Maps
- **100M+ monthly users** - Massive reach
- **Rich messaging** - Cards, carousels, buttons, images
- **Search visibility** - "Message" button in search results

**Use Cases:**
- **Schools:** Parents search "[school name]", click Message for quick questions
- **Healthcare:** Patients search "[doctor name]", message for appointments
- **Restaurants:** Customers search "[restaurant]", message for reservations
- **Retail:** Product questions, store hours, inventory checks
- **Government:** Residents search "[city services]", message for assistance

**Features:**
- Rich cards (images, buttons, suggestions)
- Carousels (multiple cards)
- Suggested replies/actions
- Business hours automation
- Bot + human handoff
- OAuth authentication

**Entry Points:**
- Google Search results ("Message" button)
- Google Maps business listing
- Google Assistant

**Cost:** $0 (Free API, no per-message fees)

**Requirements:**
- Google Business Profile (verified)
- Google Business Messages agent setup
- Brand verification

---

#### **SMS Shortcodes (5-6 Digit Numbers)**

```typescript
class ShortcodeManager {
  private providers = {
    primary: 'telnyx',
    backup: 'twilio'
  };

  async sendViaShortcode(message: ShortcodeMessage) {
    // Send SMS using shortcode (e.g., 12345)
    const shortcode = await this.selectShortcode(message.campaign_type);

    const result = await this.sendSMS({
      from: shortcode.number,  // e.g., "12345"
      to: message.to,
      body: message.body,
      campaign_id: message.campaign_id
    });

    return {
      provider: 'shortcode',
      channel: 'sms',
      shortcode: shortcode.number,
      external_id: result.id,
      status: 'sent'
    };
  }

  async selectShortcode(campaignType: string): Promise<Shortcode> {
    // Different shortcodes for different campaign types
    const shortcodes = {
      voting: '12345',        // Text VOTE to 12345
      alerts: '54321',        // Emergency alerts
      marketing: '98765',     // Promotional campaigns
      donations: '24680'      // Text GIVE to 24680
    };

    return {
      number: shortcodes[campaignType] || shortcodes.alerts,
      type: 'shared',  // or 'dedicated'
      throughput: 100  // msgs/second
    };
  }

  async handleInboundShortcode(from: string, to: string, body: string) {
    // Handle keyword-based responses
    const keyword = body.trim().toUpperCase();

    switch (keyword) {
      case 'VOTE':
        return await this.processVote(from);
      case 'STOP':
        return await this.unsubscribe(from, to);
      case 'HELP':
        return await this.sendHelp(from, to);
      case 'INFO':
        return await this.sendInfo(from, to);
      default:
        return await this.handleCustomKeyword(from, to, keyword);
    }
  }
}
```

**What are SMS Shortcodes?**

5-6 digit phone numbers (e.g., 12345) designed for high-volume SMS campaigns.

**Why Critical:**
- **High throughput** - 100+ msgs/second (vs 1/sec for long codes)
- **Better deliverability** - Carriers prioritize shortcode traffic
- **Brand recognition** - Easy to remember (text VOTE to 12345)
- **Required for scale** - Necessary for 1M+ msgs/day
- **Keyword-based** - Text JOIN, STOP, HELP to shortcode

**Use Cases:**
- **Mass alerts** - City-wide emergency alerts (100K+ people)
- **Voting campaigns** - TV shows, contests (text VOTE to 12345)
- **Fundraising** - Text DONATE to 24680 (Red Cross model)
- **Marketing** - Text JOIN to get 20% off
- **Info services** - Text WEATHER to get forecast

**Types:**
1. **Shared shortcode** - $500-1K/month, share with other businesses
2. **Dedicated shortcode** - $1K-2K/month, exclusive to your brand
3. **Random vs Vanity** - Vanity (e.g., 77777) costs more

**Features:**
- 100-300 msgs/second throughput
- Keyword auto-responders
- Double opt-in support
- MMS support (most shortcodes)
- Compliance built-in (STOP, HELP)

**Cost:**
- Setup: $500-5K (one-time)
- Monthly: $500-2K/month
- Per-message: $0.0079-0.0118 (same as long code)

**Requirements:**
- CTIA Short Code approval (4-8 weeks)
- Use case documentation
- Sample messages
- Compliance program
- Carrier approval

---

#### **LinkedIn Messages**

```typescript
import { LinkedInAPI } from 'linkedin-api-sdk';

class LinkedInMessenger {
  private client: LinkedInAPI;

  constructor() {
    this.client = new LinkedInAPI({
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN
    });
  }

  async sendMessage(message: LinkedInMessage) {
    // Send direct message to LinkedIn connection
    const result = await this.client.messages.send({
      recipients: [message.recipient_id],
      subject: message.subject,
      body: message.body
    });

    return {
      provider: 'linkedin',
      channel: 'linkedin',
      external_id: result.messageUrn,
      status: 'sent'
    };
  }

  async sendInMail(message: LinkedInInMail) {
    // Send InMail to non-connection (requires Premium)
    const result = await this.client.inmail.send({
      recipient: message.recipient_id,
      subject: message.subject,
      body: message.body,
      category: 'RECRUITING'  // or 'SALES'
    });

    return {
      provider: 'linkedin',
      channel: 'linkedin_inmail',
      external_id: result.inMailUrn,
      credits_used: 1,
      status: 'sent'
    };
  }
}
```

**Use Cases:**
- **HR/Recruiting:** Job openings, interview reminders, offer letters
- **B2B Sales:** Prospect outreach, meeting confirmations
- **Professional Networking:** Event invites, webinar reminders

**Limitations:**
- Must be connected OR use InMail credits (expensive)
- Strict anti-spam policies
- Low volume (not for mass campaigns)

**Cost:** Free for connections, InMail requires Premium ($$ per message)

---

### **5.8 RSS Feeds**

**Implementation:**

```typescript
// RSS Worker
import { Feed } from 'feed';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

class RSSGenerator {
  async generateFeed(tenant: Tenant, alerts: Alert[]) {
    const feed = new Feed({
      title: `${tenant.name} Alerts`,
      description: `Real-time alerts from ${tenant.name}`,
      id: `https://alerts.useiris.com/feeds/${tenant.slug}`,
      link: `https://alerts.useiris.com/feeds/${tenant.slug}`,
      language: 'en',
      image: tenant.logo_url,
      favicon: tenant.favicon_url,
      copyright: `© ${new Date().getFullYear()} ${tenant.name}`,
      updated: new Date(),
      generator: 'IRIS Platform',
      feedLinks: {
        rss: `https://alerts.useiris.com/feeds/${tenant.slug}/rss.xml`,
        json: `https://alerts.useiris.com/feeds/${tenant.slug}/feed.json`,
        atom: `https://alerts.useiris.com/feeds/${tenant.slug}/atom.xml`
      },
      author: {
        name: tenant.name,
        email: tenant.contact_email,
        link: tenant.website_url
      }
    });

    // Add alerts as feed items
    for (const alert of alerts) {
      feed.addItem({
        title: alert.subject,
        id: alert.id,
        link: `https://alerts.useiris.com/alerts/${alert.id}`,
        description: alert.body,
        content: alert.html_body || alert.body,
        author: [{
          name: tenant.name,
          email: tenant.contact_email
        }],
        date: alert.created_at,
        image: alert.media?.[0]?.url,
        category: [{
          name: alert.category,  // 'emergency', 'outage', 'maintenance'
          term: alert.category
        }]
      });
    }

    // Generate RSS 2.0, Atom, JSON feeds
    const rss = feed.rss2();
    const atom = feed.atom1();
    const json = feed.json1();

    // Upload to S3/R2
    await this.uploadFeed(tenant.slug, 'rss.xml', rss, 'application/rss+xml');
    await this.uploadFeed(tenant.slug, 'atom.xml', atom, 'application/atom+xml');
    await this.uploadFeed(tenant.slug, 'feed.json', json, 'application/json');

    return {
      rss_url: `https://alerts.useiris.com/feeds/${tenant.slug}/rss.xml`,
      atom_url: `https://alerts.useiris.com/feeds/${tenant.slug}/atom.xml`,
      json_url: `https://alerts.useiris.com/feeds/${tenant.slug}/feed.json`
    };
  }

  async uploadFeed(slug: string, filename: string, content: string, contentType: string) {
    const s3 = new S3Client({ region: 'us-east-1' });

    await s3.send(new PutObjectCommand({
      Bucket: 'iris-rss-feeds',
      Key: `${slug}/${filename}`,
      Body: content,
      ContentType: contentType,
      CacheControl: 'max-age=300',  // 5 minute cache
      ACL: 'public-read'
    }));

    // Purge Cloudflare CDN cache
    await purgeCloudflareCache(`https://alerts.useiris.com/feeds/${slug}/${filename}`);
  }
}
```

**Feed URL Structure:**
- RSS 2.0: `https://alerts.useiris.com/feeds/{tenant_slug}/rss.xml`
- Atom 1.0: `https://alerts.useiris.com/feeds/{tenant_slug}/atom.xml`
- JSON Feed: `https://alerts.useiris.com/feeds/{tenant_slug}/feed.json`

**Features:**
- Auto-generated from alerts
- Multiple formats (RSS, Atom, JSON)
- CDN cached (5-minute TTL)
- Embeddable in websites
- Podcast-ready (if audio alerts)

**Update Trigger:**
- New alert published → regenerate feed within 10 seconds
- Updated via NATS event: `feeds.{tenant_id}.update`

**Cost:** $0 (S3 storage + CDN bandwidth)

---

### **5.6 Embeddable Widgets**

**Implementation:**

#### **Widget JavaScript SDK**

```typescript
// widget.js (CDN: https://cdn.useiris.com/widget.js)
(function() {
  class IRISWidget {
    constructor(config) {
      this.tenantSlug = config.tenantSlug;
      this.feedUrl = `https://alerts.useiris.com/feeds/${this.tenantSlug}/feed.json`;
      this.container = document.querySelector(config.selector || '#iris-widget');
      this.refreshInterval = config.refreshInterval || 60000;  // 1 minute
      this.maxAlerts = config.maxAlerts || 5;
      this.theme = config.theme || 'light';

      this.init();
    }

    async init() {
      // Load alerts from JSON feed
      const alerts = await this.fetchAlerts();
      this.render(alerts);

      // Auto-refresh every minute
      setInterval(() => this.refresh(), this.refreshInterval);

      // Listen for real-time updates (WebSocket)
      this.connectWebSocket();
    }

    async fetchAlerts() {
      const response = await fetch(this.feedUrl);
      const feed = await response.json();
      return feed.items.slice(0, this.maxAlerts);
    }

    render(alerts) {
      const html = `
        <div class="iris-widget iris-widget-${this.theme}">
          <div class="iris-widget-header">
            <span class="iris-widget-title">Live Alerts</span>
            <button class="iris-widget-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
          <div class="iris-widget-alerts">
            ${alerts.map(alert => this.renderAlert(alert)).join('')}
          </div>
        </div>
      `;

      this.container.innerHTML = html;
    }

    renderAlert(alert) {
      const urgency = alert.category || 'info';  // critical, urgent, warning, info
      const icon = this.getIcon(urgency);

      return `
        <div class="iris-alert iris-alert-${urgency}">
          <div class="iris-alert-icon">${icon}</div>
          <div class="iris-alert-content">
            <div class="iris-alert-title">${alert.title}</div>
            <div class="iris-alert-body">${alert.content_text}</div>
            <div class="iris-alert-time">${this.timeAgo(alert.date_published)}</div>
          </div>
        </div>
      `;
    }

    connectWebSocket() {
      const ws = new WebSocket(`wss://alerts.useiris.com/ws/${this.tenantSlug}`);

      ws.onmessage = (event) => {
        const alert = JSON.parse(event.data);
        this.addAlert(alert);
      };
    }

    addAlert(alert) {
      // Prepend new alert to top
      const container = this.container.querySelector('.iris-widget-alerts');
      const alertHtml = this.renderAlert(alert);
      container.insertAdjacentHTML('afterbegin', alertHtml);

      // Remove oldest if > maxAlerts
      const alerts = container.querySelectorAll('.iris-alert');
      if (alerts.length > this.maxAlerts) {
        alerts[alerts.length - 1].remove();
      }

      // Flash animation
      container.firstElementChild.classList.add('iris-alert-new');
    }

    getIcon(urgency) {
      const icons = {
        critical: '🚨',
        urgent: '⚠️',
        warning: '⚡',
        info: 'ℹ️'
      };
      return icons[urgency] || icons.info;
    }

    timeAgo(date) {
      const seconds = Math.floor((new Date() - new Date(date)) / 1000);
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
      return `${Math.floor(seconds / 86400)} days ago`;
    }
  }

  // Auto-initialize if data attribute present
  document.addEventListener('DOMContentLoaded', () => {
    const elements = document.querySelectorAll('[data-iris-widget]');
    elements.forEach(el => {
      new IRISWidget({
        tenantSlug: el.dataset.irisTenant,
        selector: `#${el.id}`,
        theme: el.dataset.irisTheme || 'light',
        maxAlerts: parseInt(el.dataset.irisMaxAlerts) || 5
      });
    });
  });

  window.IRISWidget = IRISWidget;
})();
```

#### **Customer Usage**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Water Utility - Status</title>
  <!-- Include IRIS widget CSS + JS -->
  <link rel="stylesheet" href="https://cdn.useiris.com/widget.css">
  <script src="https://cdn.useiris.com/widget.js"></script>
</head>
<body>
  <h1>Water Utility Status</h1>

  <!-- Option 1: Auto-init with data attributes -->
  <div id="iris-widget"
       data-iris-widget
       data-iris-tenant="water-utility-xyz"
       data-iris-theme="light"
       data-iris-max-alerts="5">
  </div>

  <!-- Option 2: Manual init -->
  <script>
    new IRISWidget({
      tenantSlug: 'water-utility-xyz',
      selector: '#iris-widget',
      theme: 'dark',
      maxAlerts: 10,
      refreshInterval: 30000  // 30 seconds
    });
  </script>
</body>
</html>
```

**Widget Types:**

1. **Alert Banner** (top of page, dismissable)
2. **Alert Feed** (scrollable list)
3. **Alert Modal** (popup for critical alerts)
4. **Status Indicator** (green/yellow/red dot)
5. **Ticker** (scrolling text at top/bottom)

**Customization:**
- Themes: light, dark, custom CSS
- Position: top, bottom, sidebar, modal
- Auto-hide after X seconds
- Sound alerts (optional)
- Desktop notifications (with permission)

**Features:**
- Real-time updates via WebSocket
- Fallback to polling if WebSocket unavailable
- Mobile-responsive
- Accessible (ARIA labels)
- No jQuery dependency (vanilla JS)
- <10 KB gzipped

**Cost:** $0 (CDN bandwidth)

---

### **5.9 International Messaging Platforms**

#### **Viber Business Messages**

```typescript
import { ViberClient } from 'viber-bot';

class ViberMessenger {
  private bot: ViberClient;

  constructor() {
    this.bot = new ViberClient({
      authToken: process.env.VIBER_AUTH_TOKEN,
      name: process.env.VIBER_BOT_NAME,
      avatar: process.env.VIBER_BOT_AVATAR
    });
  }

  async sendMessage(message: ViberMessage) {
    const result = await this.bot.sendMessage({
      receiver: message.recipient_id,
      type: 'text',
      text: message.body
    });

    return {
      provider: 'viber',
      channel: 'viber',
      external_id: result.message_token,
      status: 'sent'
    };
  }

  async sendRichMedia(message: ViberMessage) {
    const result = await this.bot.sendMessage({
      receiver: message.recipient_id,
      type: 'rich_media',
      rich_media: {
        ButtonsGroupColumns: 6,
        ButtonsGroupRows: 7,
        Buttons: message.buttons?.map(btn => ({
          Columns: 6,
          Rows: 1,
          ActionType: 'open-url',
          ActionBody: btn.url,
          Text: btn.label
        }))
      }
    });

    return {
      provider: 'viber',
      external_id: result.message_token,
      status: 'sent'
    };
  }
}
```

**Market:** 1B users - Popular in Eastern Europe, Middle East, Southeast Asia
**Cost:** $0.005-0.01/message
**Use Cases:** International schools, global enterprises, travel/hospitality

---

#### **WeChat (China)**

```typescript
import { WeChatAPI } from 'wechat-api';

class WeChatMessenger {
  private client: WeChatAPI;

  constructor() {
    this.client = new WeChatAPI(
      process.env.WECHAT_APP_ID,
      process.env.WECHAT_APP_SECRET
    );
  }

  async sendTemplateMessage(message: WeChatMessage) {
    const result = await this.client.sendTemplateMessage({
      touser: message.recipient_openid,
      template_id: message.template_id,
      data: message.template_data,
      url: message.url
    });

    return {
      provider: 'wechat',
      channel: 'wechat',
      external_id: result.msgid,
      status: 'sent'
    };
  }
}
```

**Market:** 1.3B users - Mandatory for China operations
**Requirements:** Chinese business license, ICP filing
**Use Cases:** Schools with Chinese exchange students, international companies
**Cost:** Free API

---

#### **Line (Japan/Thailand/Taiwan)**

```typescript
import { LineClient } from '@line/bot-sdk';

class LineMessenger {
  private client: LineClient;

  constructor() {
    this.client = new LineClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    });
  }

  async sendMessage(message: LineMessage) {
    const result = await this.client.pushMessage({
      to: message.recipient_id,
      messages: [{
        type: 'text',
        text: message.body
      }]
    });

    return {
      provider: 'line',
      channel: 'line',
      external_id: result.messageId,
      status: 'sent'
    };
  }

  async sendFlexMessage(message: LineMessage) {
    // Send rich interactive message
    const result = await this.client.pushMessage({
      to: message.recipient_id,
      messages: [{
        type: 'flex',
        altText: message.alt_text,
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: message.image_url,
            size: 'full'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{
              type: 'text',
              text: message.title,
              weight: 'bold',
              size: 'xl'
            }]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: message.actions?.map(action => ({
              type: 'button',
              action: {
                type: 'uri',
                label: action.label,
                uri: action.url
              }
            }))
          }
        }
      }]
    });

    return {
      provider: 'line',
      external_id: result.messageId,
      status: 'sent'
    };
  }
}
```

**Market:** 200M users - Dominant in Japan
**Cost:** Free API
**Use Cases:** International schools, travel/hospitality, Japanese enterprises

---

#### **Telegram Channels (Broadcast)**

```typescript
import { Telegraf } from 'telegraf';

class TelegramChannelBroadcaster {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  }

  async broadcastToChannel(channel: string, message: TelegramMessage) {
    // Broadcast to public/private channel (unlimited subscribers)
    const result = await this.bot.telegram.sendMessage(
      channel,  // @channelname or -1001234567890
      message.body,
      {
        parse_mode: 'HTML',
        disable_web_page_preview: !message.show_preview
      }
    );

    return {
      provider: 'telegram',
      channel: 'telegram_channel',
      channel_name: channel,
      external_id: result.message_id,
      status: 'sent'
    };
  }

  async broadcastWithMedia(channel: string, message: TelegramMessage) {
    let result;

    if (message.media_type === 'photo') {
      result = await this.bot.telegram.sendPhoto(
        channel,
        message.media_url,
        { caption: message.body }
      );
    } else if (message.media_type === 'video') {
      result = await this.bot.telegram.sendVideo(
        channel,
        message.media_url,
        { caption: message.body }
      );
    }

    return {
      provider: 'telegram',
      external_id: result.message_id,
      status: 'sent'
    };
  }
}
```

**Use Cases:** Public announcements, news alerts, community updates
**Cost:** Free (unlimited subscribers)
**Note:** Different from 1:1 Telegram messaging - this is broadcast to channels

---

### **5.10 Emerging & Specialized Channels**

#### **Satellite Messaging (Starlink, Iridium)**

```typescript
import { IridiumSatellite } from 'iridium-sat-sdk';

class SatelliteMessenger {
  private iridium: IridiumSatellite;

  constructor() {
    this.iridium = new IridiumSatellite({
      accountId: process.env.IRIDIUM_ACCOUNT_ID,
      password: process.env.IRIDIUM_PASSWORD
    });
  }

  async sendSatelliteMessage(message: SatelliteMessage) {
    // Send message to satellite device (when cellular unavailable)
    const result = await this.iridium.sendMessage({
      deviceId: message.device_imei,  // Satellite device IMEI
      message: message.body.substring(0, 160),  // 160 char limit
      priority: message.priority || 'normal'
    });

    return {
      provider: 'iridium_satellite',
      channel: 'satellite',
      device_id: message.device_imei,
      external_id: result.messageId,
      status: 'sent',
      delivery_time_estimate: '5-15 minutes'
    };
  }
}
```

**Use Cases:**
- **Emergency Management:** Disaster response when cell towers down
- **Rural Areas:** Remote locations without cellular coverage
- **Maritime:** Ships at sea
- **Critical Infrastructure:** Backup communication for utilities

**Cost:** $0.50-2.00/message (expensive but critical)
**Delivery:** 5-15 minutes (satellite latency)
**ROI:** Low volume but high value for emergency preparedness

---

#### **Digital Signage / LED Displays**

```typescript
class DigitalSignageController {
  async sendToSign(sign: DigitalSign, message: SignMessage) {
    // Control LED signs, building displays, highway message boards
    const result = await fetch(sign.api_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sign.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        display_id: sign.display_id,
        message: message.body,
        duration: message.duration_seconds || 30,
        priority: message.priority,  // 'normal' | 'urgent' | 'emergency'
        color: message.color || 'amber',
        effect: message.effect || 'scroll'
      })
    });

    return {
      provider: 'digital_signage',
      channel: 'led_display',
      display_id: sign.display_id,
      location: sign.location,
      status: result.ok ? 'displayed' : 'failed'
    };
  }

  async broadcastToAllSigns(tenant: Tenant, message: SignMessage) {
    // Emergency broadcast to all LED signs in district
    const signs = await this.getActiveSigns(tenant.id);

    const results = await Promise.allSettled(
      signs.map(sign => this.sendToSign(sign, message))
    );

    return {
      provider: 'digital_signage',
      total_signs: signs.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length
    };
  }
}
```

**Use Cases:**
- **Schools:** Hallway displays, cafeteria menus, emergency alerts
- **Cities:** Downtown LED signs, highway message boards
- **Buildings:** Lobby displays, elevator screens
- **Transit:** Bus/train station displays

**Protocols:** MQTT, REST API, Modbus, BACnet (building automation)
**Cost:** $0 (customer owns displays)
**ROI:** Medium - enhances emergency alert visibility

---

#### **Smart Speaker Announcements (Alexa/Google Home)**

```typescript
import { AlexaNotifications } from 'alexa-notifications-sdk';
import { GoogleHomeNotifier } from 'google-home-notifier';

class SmartSpeakerBroadcaster {
  async sendAlexaAnnouncement(announcement: SmartSpeakerMessage) {
    // Send announcement to all Alexa devices in household
    const alexa = new AlexaNotifications({
      clientId: process.env.ALEXA_CLIENT_ID,
      clientSecret: process.env.ALEXA_CLIENT_SECRET
    });

    const result = await alexa.sendAnnouncement({
      userId: announcement.user_id,
      announcement: announcement.body,
      target: 'all'  // all devices or specific room
    });

    return {
      provider: 'alexa',
      channel: 'smart_speaker',
      external_id: result.announcementId,
      status: 'announced'
    };
  }

  async sendGoogleHomeAnnouncement(announcement: SmartSpeakerMessage) {
    const google = new GoogleHomeNotifier({
      deviceName: announcement.device_name || 'all'
    });

    await google.notify(announcement.body);

    return {
      provider: 'google_home',
      channel: 'smart_speaker',
      status: 'announced'
    };
  }
}
```

**Use Cases:**
- **Schools:** "Alexa, announce fire drill in 5 minutes"
- **Homes:** Emergency alerts spoken aloud
- **Buildings:** Office announcements

**Limitations:**
- Requires user opt-in
- Privacy concerns
- Limited API access

**Cost:** Free API
**ROI:** Low priority but innovative

---

#### **QR Code / NFC Triggers**

```typescript
class PhysicalTriggerManager {
  async generateSubscriptionQR(subscription: Subscription) {
    // Generate QR code that subscribes user when scanned
    const deepLink = `https://iris.app/subscribe?id=${subscription.id}&channel=${subscription.channel}`;

    const qrCode = await QRCode.toDataURL(deepLink, {
      width: 500,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      qr_code_url: qrCode,
      deep_link: deepLink,
      subscription_id: subscription.id,
      scan_count: 0
    };
  }

  async handleQRScan(userId: string, subscriptionId: string) {
    // User scanned QR code - auto-subscribe them
    await this.subscribeUser(userId, subscriptionId);

    await this.trackScan(subscriptionId);

    return {
      status: 'subscribed',
      message: 'You will now receive alerts via SMS'
    };
  }

  async generateNFCTag(subscription: Subscription) {
    // Generate NFC tag data (NDEF format)
    const nfcData = {
      type: 'URI',
      uri: `https://iris.app/subscribe?id=${subscription.id}`
    };

    return {
      nfc_data: nfcData,
      subscription_id: subscription.id,
      tap_count: 0
    };
  }
}
```

**Use Cases:**
- **Event Check-ins:** Scan QR to get event notifications
- **Building Entry:** NFC tap to subscribe to building alerts
- **Posters:** "Scan to subscribe" QR codes
- **Business Cards:** NFC tap to connect

**Cost:** $0 (QR generation), NFC tags $0.50-2 each
**ROI:** Increases subscription rate by 30-50%

---

### **5.11 B2B Integration Channels**

#### **Salesforce Chatter**

```typescript
import { SalesforceAPI } from 'salesforce-api';

class SalesforceIntegration {
  private sf: SalesforceAPI;

  constructor() {
    this.sf = new SalesforceAPI({
      instanceUrl: process.env.SALESFORCE_INSTANCE_URL,
      accessToken: process.env.SALESFORCE_ACCESS_TOKEN
    });
  }

  async postToChatter(post: ChatterPost) {
    // Post to Salesforce Chatter feed
    const result = await this.sf.chatter.feedItems.create({
      feedElementType: 'FeedItem',
      subjectId: post.group_id || post.user_id,
      body: {
        messageSegments: [{
          type: 'Text',
          text: post.body
        }]
      }
    });

    return {
      provider: 'salesforce',
      channel: 'chatter',
      external_id: result.id,
      url: result.url,
      status: 'posted'
    };
  }
}
```

**Use Cases:** Sales team notifications, CRM alerts, deal updates
**Cost:** Included with Salesforce license

---

#### **ServiceNow**

```typescript
import { ServiceNowAPI } from 'servicenow-api';

class ServiceNowIntegration {
  private sn: ServiceNowAPI;

  constructor() {
    this.sn = new ServiceNowAPI({
      instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
      username: process.env.SERVICENOW_USERNAME,
      password: process.env.SERVICENOW_PASSWORD
    });
  }

  async createIncident(incident: ServiceNowIncident) {
    // Create incident in ServiceNow
    const result = await this.sn.table('incident').create({
      short_description: incident.title,
      description: incident.description,
      priority: incident.priority,
      caller_id: incident.caller_id
    });

    return {
      provider: 'servicenow',
      channel: 'incident',
      incident_number: result.number,
      sys_id: result.sys_id,
      status: 'created'
    };
  }
}
```

**Use Cases:** IT incident notifications, ticket updates
**Cost:** Included with ServiceNow license

---

#### **Jira / Confluence**

```typescript
import { JiraAPI } from 'jira-client';

class JiraIntegration {
  private jira: JiraAPI;

  constructor() {
    this.jira = new JiraAPI({
      host: process.env.JIRA_HOST,
      username: process.env.JIRA_USERNAME,
      password: process.env.JIRA_API_TOKEN
    });
  }

  async createIssue(issue: JiraIssue) {
    // Create Jira issue
    const result = await this.jira.addNewIssue({
      fields: {
        project: { key: issue.project_key },
        summary: issue.summary,
        description: issue.description,
        issuetype: { name: issue.type }
      }
    });

    return {
      provider: 'jira',
      channel: 'issue',
      issue_key: result.key,
      issue_url: `${process.env.JIRA_HOST}/browse/${result.key}`,
      status: 'created'
    };
  }

  async commentOnIssue(issueKey: string, comment: string) {
    await this.jira.addComment(issueKey, comment);

    return {
      provider: 'jira',
      issue_key: issueKey,
      status: 'commented'
    };
  }
}
```

**Use Cases:** Build notifications, sprint alerts, deployment updates
**Cost:** Included with Jira license

---

## 6. Provider Abstraction Layer

### **Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Channel Workers (Bun.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Voice Worker │  │  SMS Worker  │  │ Email Worker │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          ↓                  ↓                  ↓
┌─────────────────────────────────────────────────────────────────┐
│               Provider Abstraction Layer (PAL)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Interface: IProvider {                                  │   │
│  │    send(message): Promise<DeliveryResult>                │   │
│  │    getHealthScore(): Promise<number>                     │   │
│  │    getCost(destination): Promise<number>                 │   │
│  │  }                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────────┐
│                    Provider Implementations                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐     │
│  │  Twilio  │  │  Telnyx  │  │   Plivo    │  │  Vonage   │     │
│  │ Adapter  │  │ Adapter  │  │  Adapter   │  │  Adapter  │     │
│  └──────────┘  └──────────┘  └────────────┘  └───────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### **Implementation**

```typescript
// providers/interface.ts
export interface IProvider {
  name: string;
  channel: 'voice' | 'sms' | 'email' | 'social';

  // Send message via this provider
  send(message: Message): Promise<DeliveryResult>;

  // Get current health score (0-1, where 1 = perfect)
  getHealthScore(): Promise<number>;

  // Get cost for destination
  getCost(destination: string): Promise<number>;

  // Check if provider supports destination
  supportsDestination(destination: string): Promise<boolean>;
}

export interface DeliveryResult {
  provider: string;
  external_id: string;  // Provider's message ID
  status: 'sent' | 'delivered' | 'failed';
  cost: number;
  metadata?: Record<string, any>;
}

// providers/twilio-sms.ts
import { Twilio } from 'twilio';

export class TwilioSMSProvider implements IProvider {
  name = 'twilio';
  channel = 'sms' as const;
  client: Twilio;

  constructor() {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async send(message: Message): Promise<DeliveryResult> {
    try {
      const result = await this.client.messages.create({
        from: message.from,
        to: message.to,
        body: message.body,
        mediaUrl: message.media?.map(m => m.url)
      });

      return {
        provider: 'twilio',
        external_id: result.sid,
        status: 'sent',
        cost: await this.getCost(message.to),
        metadata: {
          segments: result.numSegments,
          price: result.price,
          status: result.status
        }
      };
    } catch (error) {
      // Report error to health monitoring
      await reportProviderError('twilio', error);

      throw new ProviderError('twilio', error.message, {
        code: error.code,
        status: error.status
      });
    }
  }

  async getHealthScore(): Promise<number> {
    // Check Redis cache first
    const cached = await redis.get('provider:twilio:health');
    if (cached) return parseFloat(cached);

    // Calculate based on last 100 messages
    const recent = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_latency
      FROM message_deliveries
      WHERE provider = 'twilio'
        AND channel = 'sms'
        AND created_at > NOW() - INTERVAL '15 minutes'
    `);

    const deliveryRate = recent.delivered / (recent.delivered + recent.failed);
    const latencyScore = Math.max(0, 1 - (recent.avg_latency / 10));  // Penalize if >10 sec

    const healthScore = (deliveryRate * 0.7) + (latencyScore * 0.3);

    // Cache for 1 minute
    await redis.setex('provider:twilio:health', 60, healthScore.toString());

    return healthScore;
  }

  async getCost(destination: string): Promise<number> {
    // US numbers: $0.0118/msg, Canada: $0.0120, etc.
    const countryCode = destination.substring(0, 2);

    const rates = {
      '+1': 0.0118,   // US/Canada
      '+44': 0.0150,  // UK
      '+61': 0.0180,  // Australia
      '+91': 0.0250   // India
    };

    return rates[countryCode] || 0.05;  // Default international
  }

  async supportsDestination(destination: string): Promise<boolean> {
    // Twilio supports almost all countries
    return true;
  }
}

// providers/telnyx-sms.ts
export class TelnyxSMSProvider implements IProvider {
  name = 'telnyx';
  channel = 'sms' as const;

  async send(message: Message): Promise<DeliveryResult> {
    const telnyx = new Telnyx(process.env.TELNYX_API_KEY);

    const result = await telnyx.messages.create({
      from: message.from,
      to: message.to,
      text: message.body,
      media_urls: message.media?.map(m => m.url)
    });

    return {
      provider: 'telnyx',
      external_id: result.data.id,
      status: 'sent',
      cost: 0.0079,  // Telnyx US rate
      metadata: result.data
    };
  }

  async getCost(destination: string): Promise<number> {
    const countryCode = destination.substring(0, 2);

    const rates = {
      '+1': 0.0079,   // US/Canada (cheapest!)
      '+44': 0.0120,  // UK
      '+61': 0.0150,  // Australia
      '+91': 0.0200   // India
    };

    return rates[countryCode] || 0.04;
  }

  async getHealthScore(): Promise<number> {
    // Same implementation as Twilio
    // ...
  }

  async supportsDestination(destination: string): Promise<boolean> {
    return true;
  }
}
```

### **Provider Registry**

```typescript
// providers/registry.ts
import { IProvider } from './interface';
import { TwilioSMSProvider } from './twilio-sms';
import { TelnyxSMSProvider } from './telnyx-sms';
import { PlivoSMSProvider } from './plivo-sms';
import { ElasticEmailProvider } from './elastic-email';
import { PostmarkProvider } from './postmark';

export class ProviderRegistry {
  private providers: Map<string, Map<string, IProvider>> = new Map();

  constructor() {
    this.register('sms', 'twilio', new TwilioSMSProvider());
    this.register('sms', 'telnyx', new TelnyxSMSProvider());
    this.register('sms', 'plivo', new PlivoSMSProvider());

    this.register('email', 'elastic_email', new ElasticEmailProvider());
    this.register('email', 'postmark', new PostmarkProvider());

    // ... register all providers
  }

  register(channel: string, name: string, provider: IProvider) {
    if (!this.providers.has(channel)) {
      this.providers.set(channel, new Map());
    }
    this.providers.get(channel)!.set(name, provider);
  }

  getProvider(channel: string, name: string): IProvider | undefined {
    return this.providers.get(channel)?.get(name);
  }

  getProviders(channel: string): IProvider[] {
    return Array.from(this.providers.get(channel)?.values() || []);
  }

  async selectBestProvider(
    channel: string,
    destination: string,
    priority: 'cost' | 'reliability'
  ): Promise<IProvider> {
    const providers = this.getProviders(channel);

    // Filter to providers that support destination
    const supported = [];
    for (const provider of providers) {
      if (await provider.supportsDestination(destination)) {
        supported.push(provider);
      }
    }

    if (supported.length === 0) {
      throw new Error(`No provider supports ${channel} to ${destination}`);
    }

    // Get health scores and costs
    const scored = await Promise.all(supported.map(async (provider) => ({
      provider,
      health: await provider.getHealthScore(),
      cost: await provider.getCost(destination)
    })));

    // Filter out unhealthy providers (health < 0.9)
    const healthy = scored.filter(p => p.health > 0.9);

    if (healthy.length === 0) {
      throw new Error(`No healthy providers for ${channel}`);
    }

    if (priority === 'cost') {
      // Pick cheapest
      return healthy.sort((a, b) => a.cost - b.cost)[0].provider;
    } else {
      // Pick most reliable
      return healthy.sort((a, b) => b.health - a.health)[0].provider;
    }
  }
}

export const registry = new ProviderRegistry();
```

---

## 7. Least-Cost Routing Engine

### **Algorithm**

```typescript
// routing/least-cost.ts
import { registry } from '../providers/registry';

export class LeastCostRouter {
  async route(message: Message): Promise<RoutingDecision> {
    const channel = message.channel;
    const destination = message.to;
    const priority = message.priority || 'normal';

    // Get all providers for channel
    const providers = registry.getProviders(channel);

    // Score each provider
    const scores = await Promise.all(providers.map(async (provider) => {
      const [health, cost, supports] = await Promise.all([
        provider.getHealthScore(),
        provider.getCost(destination),
        provider.supportsDestination(destination)
      ]);

      if (!supports) return null;

      // Calculate weighted score
      let score: number;

      if (priority === 'critical') {
        // Critical: prioritize reliability (health)
        score = (health * 0.8) + ((1 - cost) * 0.2);
      } else if (priority === 'high') {
        // High: balance reliability and cost
        score = (health * 0.6) + ((1 - cost) * 0.4);
      } else {
        // Normal/Low: prioritize cost
        score = (health * 0.3) + ((1 - cost) * 0.7);
      }

      return {
        provider,
        health,
        cost,
        score
      };
    }));

    // Filter out nulls (unsupported) and unhealthy (health < 0.85)
    const viable = scores
      .filter(s => s !== null && s.health > 0.85)
      .sort((a, b) => b.score - a.score);

    if (viable.length === 0) {
      throw new RoutingError('No viable providers for this message');
    }

    // Pick top provider
    const selected = viable[0];

    // Also return backup provider (2nd best)
    const backup = viable[1];

    return {
      primary: selected.provider,
      primary_cost: selected.cost,
      primary_health: selected.health,
      backup: backup?.provider,
      backup_cost: backup?.cost,
      reasoning: this.explainDecision(selected, viable)
    };
  }

  explainDecision(selected: any, allOptions: any[]): string {
    const reasons = [];

    if (selected.health > 0.98) {
      reasons.push('excellent reliability (>98%)');
    }

    if (selected.cost < allOptions[allOptions.length - 1].cost * 0.7) {
      reasons.push('significantly cheaper than alternatives');
    }

    if (selected.score > allOptions[1]?.score * 1.2) {
      reasons.push('clear best choice');
    }

    return `Selected ${selected.provider.name}: ${reasons.join(', ')}`;
  }
}
```

### **Example Routing Decisions**

**Scenario 1: Normal Priority SMS to US Number**

```
Providers evaluated:
├─ Telnyx: health=0.98, cost=$0.0079 → score=0.96
├─ Plivo:  health=0.96, cost=$0.0085 → score=0.94
├─ Vonage: health=0.99, cost=$0.0095 → score=0.91
└─ Twilio: health=0.99, cost=$0.0118 → score=0.87

Selected: Telnyx
Reasoning: significantly cheaper (50% less than Twilio), excellent reliability (98%)
Backup: Plivo
Estimated savings: $0.0039 per message (vs Twilio)
```

**Scenario 2: Critical Priority Voice Call**

```
Providers evaluated:
├─ Twilio:    health=0.995, cost=$0.020 → score=0.992
├─ Bandwidth: health=0.990, cost=$0.015 → score=0.986
└─ Telnyx:    health=0.975, cost=$0.011 → score=0.974

Selected: Twilio
Reasoning: highest reliability (99.5%), critical priority demands best
Backup: Bandwidth
Note: Paying premium ($0.009 more than Telnyx) for 2% better reliability
```

**Scenario 3: Bulk Email (10K recipients)**

```
Providers evaluated:
├─ ElasticEmail: health=0.92, cost=$0.0001 → score=0.95
├─ SendGrid:     health=0.96, cost=$0.00095 → score=0.82
└─ Postmark:     health=0.99, cost=$0.0125 → score=0.51

Selected: ElasticEmail
Reasoning: dramatically cheaper ($1 vs $9.50 vs $125), acceptable reliability
Backup: SendGrid (if ElasticEmail rate limits hit)
Estimated cost: $1.00 for 10K emails (vs $9.50 SendGrid, $125 Postmark)
```

---

## 8. No-Code Flow Builder

### **Visual Interface (Vue 3)**

```vue
<!-- FlowBuilder.vue -->
<template>
  <div class="flow-builder">
    <div class="flow-canvas" ref="canvas">
      <!-- Nodes -->
      <FlowNode
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        @update="updateNode"
        @delete="deleteNode"
      />

      <!-- Connections -->
      <svg class="flow-connections">
        <FlowConnection
          v-for="conn in connections"
          :key="conn.id"
          :from="getNode(conn.from)"
          :to="getNode(conn.to)"
        />
      </svg>
    </div>

    <div class="flow-sidebar">
      <h3>Add Step</h3>
      <div class="node-palette">
        <button @click="addNode('trigger')">📥 Trigger</button>
        <button @click="addNode('condition')">🔀 Condition</button>
        <button @click="addNode('send_message')">📨 Send Message</button>
        <button @click="addNode('wait')">⏱️ Wait</button>
        <button @click="addNode('api_call')">🔗 API Call</button>
      </div>

      <h3>Flow Settings</h3>
      <div class="flow-settings">
        <label>
          Name:
          <input v-model="flow.name" />
        </label>
        <label>
          Description:
          <textarea v-model="flow.description"></textarea>
        </label>
      </div>

      <button @click="save" class="btn-primary">💾 Save Flow</button>
      <button @click="test" class="btn-secondary">🧪 Test Flow</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFlowStore } from '@/stores/flow';

const flowStore = useFlowStore();
const nodes = ref([]);
const connections = ref([]);

function addNode(type: string) {
  const node = {
    id: `node_${Date.now()}`,
    type,
    position: { x: 100, y: 100 },
    config: getDefaultConfig(type)
  };

  nodes.value.push(node);
}

function getDefaultConfig(type: string) {
  switch (type) {
    case 'trigger':
      return {
        trigger_type: 'api_call',  // or 'schedule', 'webhook', 'manual'
        schedule: null
      };

    case 'send_message':
      return {
        broadcast_mode: 'all_channels',
        channels: ['voice', 'sms', 'email'],
        message: {
          subject: '',
          body: '',
          voice_settings: {
            tts: true,
            voice: 'en-US-Neural2-A'
          }
        }
      };

    case 'condition':
      return {
        field: 'priority',
        operator: 'equals',
        value: 'high',
        on_true: null,  // Node ID
        on_false: null  // Node ID
      };

    case 'wait':
      return {
        duration: 300,  // seconds
        unit: 'seconds'
      };

    default:
      return {};
  }
}

async function save() {
  const flow = {
    name: flow.value.name,
    description: flow.value.description,
    nodes: nodes.value,
    connections: connections.value
  };

  await flowStore.saveFlow(flow);
}

async function test() {
  // Run flow with test data
  const result = await flowStore.testFlow({
    nodes: nodes.value,
    connections: connections.value,
    testData: {
      to: {
        phone: '+15555551234',
        email: 'test@example.com'
      },
      message: {
        body: 'This is a test message'
      }
    }
  });

  console.log('Test result:', result);
}
</script>
```

### **Flow Node Types**

**1. Trigger Node**
- API Call
- Scheduled (cron)
- Webhook
- Manual (button click)

**2. Condition Node**
- If/else logic
- Multiple conditions (AND/OR)
- Field comparisons

**3. Send Message Node**
- Multi-channel selector
- Message composer
- Broadcast mode selector

**4. Wait Node**
- Delay execution
- Wait for time
- Wait for webhook response

**5. API Call Node**
- HTTP request to external API
- Parse response
- Use response in next steps

**6. Loop Node**
- Iterate over list of contacts
- Send batch messages

**Example Flow JSON:**

```json
{
  "id": "flow_01J1KQZX9F7GH4",
  "name": "Emergency Water Alert",
  "description": "Send multi-channel alerts for water emergencies",
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger",
      "config": {
        "trigger_type": "api_call",
        "endpoint": "/v1/flows/emergency-water-alert/trigger"
      }
    },
    {
      "id": "condition_1",
      "type": "condition",
      "config": {
        "field": "severity",
        "operator": "equals",
        "value": "critical",
        "on_true": "send_all_channels",
        "on_false": "send_email_only"
      }
    },
    {
      "id": "send_all_channels",
      "type": "send_message",
      "config": {
        "broadcast_mode": "all_channels",
        "channels": ["voice", "sms", "email", "facebook", "twitter"],
        "message": {
          "subject": "CRITICAL: Water Emergency",
          "body": "{{alert_message}}",
          "voice_settings": {
            "tts": true,
            "voice": "en-US-Neural2-A"
          }
        }
      }
    },
    {
      "id": "send_email_only",
      "type": "send_message",
      "config": {
        "broadcast_mode": "single",
        "channel": "email",
        "message": {
          "subject": "Water Alert",
          "body": "{{alert_message}}"
        }
      }
    }
  ],
  "connections": [
    {"from": "trigger_1", "to": "condition_1"},
    {"from": "condition_1", "to": "send_all_channels", "condition": "true"},
    {"from": "condition_1", "to": "send_email_only", "condition": "false"}
  ]
}
```

---

## 9. RSS Feeds & Widgets

(Already covered in Section 5.5 and 5.6 above)

---

## 10. Data Model (Multi-Channel)

### **Core Tables**

```sql
-- Messages table (unified for all channels)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Broadcast configuration
  broadcast_mode VARCHAR(50) NOT NULL,  -- 'all_channels', 'cascade', 'single', etc.
  channels TEXT[] NOT NULL,             -- ['voice', 'sms', 'email', 'facebook']

  -- Message content
  subject TEXT,
  body TEXT NOT NULL,
  html_body TEXT,
  media JSONB,  -- [{type: 'image', url: '...', alt_text: '...'}]

  -- Channel-specific settings
  voice_settings JSONB,
  email_settings JSONB,
  social_settings JSONB,

  -- Metadata
  message_type VARCHAR(50),  -- 'emergency', 'reminder', 'billing', 'marketing'
  priority VARCHAR(20) DEFAULT 'normal',
  tags TEXT[],
  metadata JSONB,

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'

  -- Cost tracking
  estimated_cost NUMERIC(10,6),
  actual_cost NUMERIC(10,6),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant_created ON messages(tenant_id, created_at DESC);
CREATE INDEX idx_messages_status ON messages(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_messages_scheduled ON messages(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- Deliveries table (one row per channel per recipient)
CREATE TABLE message_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,

  -- Channel and recipient
  channel VARCHAR(50) NOT NULL,  -- 'voice', 'sms', 'email', 'facebook', etc.
  recipient VARCHAR(255) NOT NULL,  -- Phone, email, social ID

  -- Provider
  provider VARCHAR(50),  -- 'twilio', 'telnyx', 'elastic_email', etc.
  external_id VARCHAR(255),  -- Provider's message/call ID

  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'queued',  -- 'queued', 'sent', 'delivered', 'failed', 'bounced'
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Cost
  estimated_cost NUMERIC(10,6),
  actual_cost NUMERIC(10,6),

  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Response tracking (for two-way channels)
  response_received BOOLEAN DEFAULT FALSE,
  response_at TIMESTAMPTZ,
  response_body TEXT,

  -- Metadata
  metadata JSONB,  -- Provider-specific details

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deliveries_message ON message_deliveries(message_id);
CREATE INDEX idx_deliveries_tenant_channel ON message_deliveries(tenant_id, channel, created_at DESC);
CREATE INDEX idx_deliveries_status ON message_deliveries(status);
CREATE INDEX idx_deliveries_recipient ON message_deliveries(recipient, channel);

-- Contacts table (unified contact info)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identity
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Social handles
  facebook_id VARCHAR(255),
  twitter_handle VARCHAR(255),
  discord_id VARCHAR(255),
  telegram_id VARCHAR(255),
  whatsapp_number VARCHAR(20),

  -- Preferences
  preferred_channel VARCHAR(50),  -- 'sms', 'email', 'voice', etc.
  broadcast_rules JSONB,  -- Per message-type preferences

  -- Opt-ins/Opt-outs
  opted_in_channels TEXT[],  -- ['sms', 'email']
  opted_out_channels TEXT[],  -- ['voice']
  opted_out_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[],
  custom_fields JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email) WHERE email IS NOT NULL;

-- Provider health tracking
CREATE TABLE provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  channel VARCHAR(50) NOT NULL,

  -- Health metrics
  health_score NUMERIC(3,2),  -- 0.00 to 1.00
  delivery_rate NUMERIC(3,2),
  avg_latency_ms INTEGER,
  error_rate NUMERIC(3,2),

  -- Window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_size INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(provider, channel, window_start)
);

CREATE INDEX idx_provider_health_provider ON provider_health(provider, channel, window_start DESC);
```

### **Analytics Views**

```sql
-- Delivery summary by channel
CREATE MATERIALIZED VIEW delivery_summary_by_channel AS
SELECT
  tenant_id,
  channel,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) as avg_delivery_time_sec,
  SUM(actual_cost) as total_cost
FROM message_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id, channel, hour;

CREATE INDEX idx_delivery_summary_tenant_channel ON delivery_summary_by_channel(tenant_id, channel, hour DESC);

-- Refresh every 5 minutes
CREATE OR REPLACE FUNCTION refresh_delivery_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY delivery_summary_by_channel;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (via pg_cron or external cron)
-- SELECT cron.schedule('refresh-delivery-summary', '*/5 * * * *', 'SELECT refresh_delivery_summary()');
```

---

## 11. Cost Model (All Channels)

### **Startup Phase (< $350/month)**

| Component | Cost/Month | Notes |
|-----------|------------|-------|
| **Infrastructure** |  |  |
| 1x t3.medium EC2 (voice) | $30 | FreeSWITCH + NATS + coturn |
| Cloudflare Workers (API) | $5 | 100K req/day → upgrade to $5/mo |
| Neon Postgres | $20 | Free tier exhausted, upgrade |
| Upstash Redis | $0 | Free tier (10K commands/day) |
| Cloudflare R2 (storage) | $0 | 10GB free |
| Better Stack (monitoring) | $10 | Logs + uptime + alerts |
| Domain + Email (Resend) | $15 | Domain reg + transactional email |
| **Subtotal Infrastructure** | **$80/mo** |  |
|  |  |  |
| **Variable (per-use)** |  |  |
| Voice (10K mins) | $110 | Twilio: $0.011/min avg |
| SMS (5K messages) | $40 | Telnyx: $0.0079/msg |
| MMS (500 messages) | $15 | Telnyx: $0.030/msg |
| Email (50K emails) | $5 | ElasticEmail: $0.0001/email |
| Social (1K posts) | $0 | Free APIs (Facebook, Twitter, Discord) |
| Slack (1K messages) | $0 | Free API |
| WhatsApp (500 msgs) | $3 | $0.005/msg average |
| Push Notifications | $0 | Firebase FCM free |
| RCS (100 messages) | $1 | $0.01/msg (Google) |
| TTS (20K chars) | $3 | OpenAI: $0.015/1K |
| STT (500 mins) | $3 | Deepgram: $0.0043/min |
| **Subtotal Usage** | **$180/mo** |  |
|  |  |  |
| **TOTAL** | **$260/month** | All channels included |

**Revenue (example):**
- Voice: 10K mins × $0.020 = $200
- SMS: 5K msgs × $0.012 = $60
- MMS: 500 msgs × $0.040 = $20
- Email: 50K emails × $0.0005 = $25
- WhatsApp: 500 msgs × $0.010 = $5
- RCS: 100 msgs × $0.015 = $1.50
- **Total revenue: $311.50**

**Profit: $311.50 - $260 = $51.50 (17% margin)**

*Note: Margins improve with volume due to fixed cost leverage and cheaper provider routing.*

---

### **Scale Phase (>100K messages/month)**

| Component | Cost/Month | Notes |
|-----------|------------|-------|
| **Infrastructure** |  |  |
| 3x c7i.2xlarge EC2 (voice) | $750 | Auto-scaling cluster |
| Kamailio cluster (2x t3.small) | $30 | Load balancer |
| Cloudflare Workers | $50 | Millions of API requests |
| Aurora Serverless v2 | $300 | High-availability DB |
| ElastiCache Redis | $100 | Clustered Redis |
| ClickHouse Cloud | $100 | Analytics |
| Cloudflare R2 | $20 | 1TB storage |
| Grafana Cloud | $50 | Advanced monitoring |
| Misc (CDN, email, domain) | $50 | Various services |
| **Subtotal Infrastructure** | **$1,450/mo** |  |
|  |  |  |
| **Variable (100K voice + 200K SMS + 1M email + other channels)** |  |  |
| Voice (100K mins) | $1,100 | Least-cost routing (avg $0.011) |
| SMS (200K msgs) | $1,580 | Telnyx primary ($0.0079) |
| MMS (20K msgs) | $600 | Telnyx ($0.030) |
| Email (1M emails) | $100 | ElasticEmail ($0.0001) |
| Social (10K posts) | $0 | Free (Facebook, Twitter, Discord, Instagram) |
| Slack (10K msgs) | $0 | Free API |
| Teams (5K msgs) | $0 | Free API (customer has M365 license) |
| WhatsApp (10K msgs) | $50 | $0.005/msg average |
| Push Notifications | $0 | Firebase FCM free |
| RCS (5K msgs) | $50 | $0.01/msg (Google) |
| TTS/STT | $200 | Heavy usage |
| **Subtotal Usage** | **$3,680/mo** |  |
|  |  |  |
| **TOTAL** | **$5,130/month** |  |

**Revenue (example):**
- Voice: 100K mins × $0.020 = $2,000
- SMS: 200K msgs × $0.012 = $2,400
- MMS: 20K msgs × $0.040 = $800
- Email: 1M emails × $0.0005 = $500
- WhatsApp: 10K msgs × $0.010 = $100
- RCS: 5K msgs × $0.015 = $75
- Push Notifications: Included in customer's app
- Slack/Teams: $0 (customer integrations)
- **Total revenue: $5,875**

**Profit: $5,875 - $5,130 = $745 (13% margin)**

*Margins improve to 30-40% with:*
- Enterprise customers (higher prices)
- Self-hosted email (Phase 3)
- Volume discounts from providers

---

## 12. Phased Rollout Plan

### **Phase 1: Voice + SMS** (Months 1-4)

**Goal:** Core voice platform + SMS layer

**Features:**
- ✅ Voice calling (outbound, inbound, IVR)
- ✅ SMS/MMS with Telnyx
- ✅ Unified `/v1/messages` API
- ✅ Broadcast modes: all_channels, cascade, single
- ✅ Provider abstraction layer
- ✅ Least-cost routing (voice + SMS)
- ✅ Basic dashboard

**Team:** 4 engineers (1 telephony, 2 backend, 1 frontend)

**Deliverables:**
- [ ] FreeSWITCH cluster operational
- [ ] Twilio + Telnyx integrated
- [ ] API endpoints functional
- [ ] Dashboard (send message, view logs)
- [ ] Load test: 100 concurrent calls + 1K SMS/min

**Exit Criteria:**
- 5 beta customers
- 50K voice mins + 100K SMS/month
- 99.5% delivery rate
- $1K MRR

---

### **Phase 2: Email + Social** (Months 5-6)

**Goal:** Add email and social channels

**Features:**
- ✅ Email via ElasticEmail
- ✅ Facebook posts + Messenger
- ✅ Twitter posts + DMs
- ✅ Discord webhooks
- ✅ Multi-channel broadcast (voice + SMS + email + social)
- ✅ No-code flow builder (beta)

**Team:** 5 engineers (add 1 frontend for flow builder)

**Deliverables:**
- [ ] Email worker operational
- [ ] Social platform integrations
- [ ] Flow builder UI (drag-and-drop)
- [ ] Template library (10 pre-built flows)

**Exit Criteria:**
- 20 customers (10 paid)
- 200K emails + 5K social posts/month
- No-code builder used by 50% of customers
- $5K MRR

---

### **Phase 3: RSS, Widgets, Advanced Features** (Months 7-9)

**Goal:** RSS feeds, embeddable widgets, listening

**Features:**
- ✅ RSS feed generator
- ✅ Embeddable widgets (5 types)
- ✅ Social listening (monitor mentions)
- ✅ Two-way SMS (receive replies)
- ✅ Advanced analytics (ClickHouse)
- ✅ Self-hosted SMTP (Phase 3a)

**Team:** 6 engineers (add 1 DevOps for SMTP cluster)

**Deliverables:**
- [ ] RSS feeds auto-generated
- [ ] Widget SDK published (NPM package)
- [ ] Social listening webhooks
- [ ] Self-hosted email cluster (2 servers, IP warming)

**Exit Criteria:**
- 50 customers (30 paid)
- RSS feeds embedded on 20+ websites
- Widgets viewed 1M+ times/month
- $10K MRR

---

### **Phase 4: Enterprise Features** (Months 10-12)

**Goal:** Enterprise-ready compliance and scale

**Features:**
- ✅ WhatsApp Business API
- ✅ Multi-region (us-east-1 + us-west-2)
- ✅ SOC 2 Type II compliance
- ✅ HIPAA compliance (for healthcare)
- ✅ Advanced fraud detection
- ✅ Custom white-label portals

**Team:** 8 engineers (add security + compliance roles)

**Deliverables:**
- [ ] WhatsApp integration
- [ ] SOC 2 audit passed
- [ ] Multi-region failover tested (RTO <15 min)
- [ ] Enterprise tier launched

**Exit Criteria:**
- 100 customers (60 paid, 5 enterprise)
- First $5K+/mo enterprise customer
- 99.99% uptime SLA
- $25K+ MRR

---

## 13. Technical Decisions

### **Why Unified API?**

**Decision:** Single `/v1/messages` endpoint that routes to any channel

**Rationale:**
- Customer sends once, reaches everywhere (huge DX win)
- Enables intelligent fallback (voice → SMS → email)
- Simplifies customer code (one integration vs 5)
- Aligns with modern platforms (Twilio Conversations, SendGrid Marketing Campaigns)

**Trade-off:**
- More complex backend routing
- Harder to optimize per-channel
- **Verdict:** Worth it for customer experience

---

### **Why Least-Cost Routing?**

**Decision:** Automatically pick cheapest provider per message

**Rationale:**
- 30-50% cost savings for customers
- Competitive advantage vs Twilio (fixed pricing)
- TechRadium captures margin (buy at $0.0079, sell at $0.012)
- Provider redundancy improves reliability

**Trade-off:**
- Must maintain provider integrations
- Health monitoring complexity
- **Verdict:** Core differentiator, worth the effort

---

### **Why No-Code Builder?**

**Decision:** Visual flow builder for non-technical users

**Rationale:**
- Utilities/government have non-technical staff
- Expands TAM beyond developers
- Higher LTV (SaaS subscription + usage)
- Sticky (hard to migrate once workflows built)

**Trade-off:**
- Frontend complexity (drag-and-drop, state management)
- Must maintain backwards compatibility
- **Verdict:** Strategic move, enables enterprise sales

---

### **Why Self-Hosted SMTP (Phase 3)?**

**Decision:** Build own email servers alongside providers

**Rationale:**
- Email is **100x cheaper** self-hosted ($0.00001 vs $0.0001)
- At 10M+ emails/month, saves $900/month
- Full control over deliverability, IP reputation
- Can offer lower prices than competitors

**Trade-off:**
- DevOps burden (Postfix, IP warming, monitoring)
- Takes 30 days to warm up IPs
- Blacklist management
- **Verdict:** Only do at scale (>1M emails/month)

---

## 14. Migration from Voice-Only

### **For Existing IRIS Customers**

**Scenario:** Existing IRIS platform has voice-only customers. How to migrate to multi-channel?

**Step 1: Backwards Compatibility (Month 1)**
- Existing `/v1/calls` API continues to work
- All existing integrations unaffected
- Dashboard shows "NEW: Add SMS, Email, Social" banner

**Step 2: Opt-In Beta (Month 2-3)**
- Invite select customers to beta test multi-channel
- Provide free credits for SMS/email trials
- Collect feedback, iterate on UX

**Step 3: General Availability (Month 4)**
- Multi-channel available to all customers
- Pricing tiers introduced (Free, Startup, Growth, Enterprise)
- Migration guide published
- Webinar: "How to Add SMS and Email to Your Voice Alerts"

**Step 4: Incentivize Adoption (Month 5-6)**
- Discount: "Add SMS for 50% off first 3 months"
- Case study: "Utility XYZ increased reach 3x with multi-channel"
- Feature flag: Auto-enable multi-channel for new signups

**Step 5: Sunsetting Voice-Only (Month 12+)**
- Announce: "Voice-only plans deprecated, migrate by [date]"
- 6-month grace period
- Assisted migration for large customers
- Voice-only API remains functional (just discouraged)

---

## Conclusion

IRIS Multi-Channel Platform represents **the future of customer communications**: unified, intelligent, cost-optimized, and developer-friendly.

**Next Steps:**
1. **Approve this architecture** (get executive sign-off)
2. **Finalize Phase 1 scope** (Voice + SMS in 4 months)
3. **Allocate team** (4 engineers to start)
4. **Kick off Phase 0** (Infrastructure setup)

**Target Launch:**
- **Phase 1 (Voice + SMS):** Month 4
- **Phase 2 (Email + Social):** Month 6
- **Phase 3 (RSS + Widgets):** Month 9
- **Phase 4 (Enterprise):** Month 12

**Revenue Target:** $25K MRR by Month 12

---

**Document Version:** 3.0 (Multi-Channel)
**Last Updated:** 2025-01-15
**Author:** Claude AI + Ryan (TechRadium)
**Status:** Master Architecture - Awaiting Approval
