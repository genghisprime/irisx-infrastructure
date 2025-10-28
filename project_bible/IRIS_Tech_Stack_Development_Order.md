# IRIS Tech Stack & Development Order
## Complete Technology Decisions & Implementation Roadmap

**Version:** 2.0
**Last Updated:** 2025-01-15
**Purpose:** Final tech stack decisions and organized development order

**✅ FINAL DECISIONS:**
- **No Cloudflare** - All AWS infrastructure
- **Hono.js confirmed** - Fast, modern, AI-friendly
- **AWS RDS PostgreSQL** - Not Neon (managed AWS service)
- **AWS ElastiCache Redis** - Not Upstash (managed AWS service)
- **Firebase for real-time only** - Push notifications + agent presence
- **Startup Cost: ~$70/mo** - Single vendor (AWS) + Firebase free tier

---

## Table of Contents

1. [Tech Stack Summary](#tech-stack-summary)
2. [Frontend Technology Decision](#frontend-technology-decision)
3. [Backend Technology Decision](#backend-technology-decision)
4. [Complete Stack Overview](#complete-stack-overview)
5. [Development Order (Organized)](#development-order-organized)
6. [Module Dependencies](#module-dependencies)
7. [Team Structure](#team-structure)
8. [Timeline & Milestones](#timeline--milestones)

---

## Tech Stack Summary

### ✅ CONFIRMED DECISIONS

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend Framework** | **Vue 3.5** | Your preference + best for AI-assisted development |
| **Backend Runtime** | **Node.js 22 LTS** | Your preference + mature ecosystem |
| **Backend Framework** | **Hono.js** | Fastest Node framework, cleaner than Express, AI-friendly |
| **Database** | **AWS RDS PostgreSQL** | Managed, reliable, scales to Aurora |
| **Cache/Queue** | **AWS ElastiCache Redis** | Managed, cluster mode, multi-AZ |
| **Media Server** | **FreeSWITCH on EC2** | Battle-tested, handles 1000s CPS |
| **Object Storage** | **AWS S3 + CloudFront** | Standard, reliable, global CDN |
| **Event Bus** | **NATS JetStream** | Lightweight, durable, self-hosted on EC2 |
| **Real-time Features** | **Firebase (FCM + Realtime DB)** | Free push notifications, agent presence |

---

## Frontend Technology Decision

### Vue 3.5 - CONFIRMED ✅

**Why Vue 3 (Not React or Angular):**

1. **Your Preference:** You know Vue, faster development
2. **Performance:** Vapor mode (Vue 3.5) rivals Solid.js speed
3. **Developer Experience:** Composition API is cleaner than React hooks
4. **Bundle Size:** Smaller than React (30% less)
5. **Learning Curve:** Easier for team to pick up vs React/Angular

**Vue 3.5 Stack:**
```javascript
// Frontend Stack
- Vue 3.5 (Vapor mode for performance)
- Vite 6 (build tool, 10x faster than Webpack)
- Pinia (state management, simpler than Vuex)
- Vue Router (routing)
- Tailwind CSS 4 (styling, JIT compiler)
- VueUse (composition utilities)
- Headless UI (accessible components)
- Chart.js or Apache ECharts (dashboards)
```

**Applications Using Vue:**
1. **Customer Portal** - Dashboard, campaigns, analytics
2. **Admin Portal** - System management, tenant management
3. **Agent Desktop** - Softphone, queue management, CRM panel
4. **Flow Builder** - Drag-and-drop IVR builder
5. **API Documentation** - Mintlify (not Vue, but integrates)

**Hosting:**
- **Vercel** (free tier, CDN, auto-deploy from Git) - Recommended
- **AWS S3 + CloudFront** (enterprise option, more control)

---

## Backend Technology Decision

### Node.js 22 LTS + Hono.js - CONFIRMED ✅

**Why Node.js (Not Bun or Deno):**

1. **Your Preference:** You know Node, stable ecosystem
2. **Maturity:** 15 years of production use, proven at scale
3. **Libraries:** 2M+ npm packages, everything you need
4. **Telephony Libraries:** FreeSWITCH ESL, SIP.js all have Node bindings
5. **Team Knowledge:** Easier to hire Node developers

**Why Hono.js (Not Express or Fastify):**

1. **Speed:** 3x faster than Express (50K vs 15K req/sec)
2. **Clean Code:** Less boilerplate, easier for AI to work with
3. **TypeScript-First:** Native TypeScript support, better autocomplete
4. **Modern API:** Similar to Express but cleaner
5. **Small:** 12KB bundle size vs Express 200KB
6. **AI-Friendly:** Cleaner code = Claude writes better code faster

**Backend Stack:**
```javascript
// Backend Stack
- Node.js 22 LTS (runtime)
- Hono.js (HTTP framework)
- AWS RDS PostgreSQL + pg library (database)
- AWS ElastiCache Redis + ioredis (cache/queue)
- NATS.js (event bus, self-hosted)
- FreeSWITCH ESL (telephony control)
- Firebase Admin SDK (push notifications, presence)
- Zod (validation)
- JWT (authentication)
- Stripe SDK (billing)
- OpenAI SDK (TTS/STT/GPT-4)
- AWS SDK (S3, SES, KMS)
```

**Deployment:**
- **Everything on EC2 (to start):** API + Workers + FreeSWITCH + NATS on one t3.medium ($30/mo)
- **Later scaling:** ALB + Auto Scaling Group with multiple EC2 instances
- **No serverless:** Telephony needs persistent connections (SIP, database, WebSocket)

---

## Complete Stack Overview

### Infrastructure Layers

```
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND LAYER (Vue 3.5 on Vercel)             │
├─────────────────────────────────────────────────────────────┤
│ - Customer Portal                                           │
│ - Admin Portal                                              │
│ - Agent Desktop (connects to Firebase for real-time)       │
│ - Flow Builder                                              │
│ - API Docs (Mintlify)                                       │
└─────────────────────────────────────────────────────────────┘
          ↓ HTTPS (REST API)          ↓ WebSocket (Firebase)
┌────────────────────────────┐  ┌────────────────────────────┐
│   AWS EC2 t3.medium        │  │   Firebase (Free Tier)     │
├────────────────────────────┤  ├────────────────────────────┤
│ Hono.js API (port 3000)    │  │ - FCM Push Notifications   │
│ Workers (orchestrator,     │  │ - Realtime DB (presence)   │
│   CDR, billing, etc.)      │  │   * Agent status           │
│ FreeSWITCH (port 5060)     │  │   * Live wallboards        │
│ NATS JetStream             │  └────────────────────────────┘
│ nginx (HTTPS reverse proxy)│
└────────────────────────────┘
          ↓                ↓
┌──────────────────┐  ┌──────────────────┐
│  RDS PostgreSQL  │  │ ElastiCache Redis│
│  (db.t4g.micro)  │  │ (cache.t4g.micro)│
│  $15/mo          │  │ $12/mo           │
└──────────────────┘  └──────────────────┘
          ↓
┌──────────────────────────┐
│  S3 + CloudFront         │
│  (recordings, TTS cache) │
│  $5/mo                   │
└──────────────────────────┘
          ↓
┌──────────────────────────────────────────┐
│  EXTERNAL SERVICES                       │
├──────────────────────────────────────────┤
│ - OpenAI (TTS, STT, GPT-4)              │
│ - ElevenLabs (TTS, voice cloning)       │
│ - Deepgram (STT)                         │
│ - Stripe (billing)                       │
│ - Twilio (SMS, voice carrier)            │
│ - Telnyx (backup voice carrier)          │
│ - ClickHouse Cloud (analytics)           │
│ - Better Stack (monitoring)              │
└──────────────────────────────────────────┘

TOTAL STARTUP COST: ~$70/mo
- EC2 t3.medium: $30/mo
- RDS db.t4g.micro: $15/mo
- ElastiCache cache.t4g.micro: $12/mo
- S3 + CloudFront: $5/mo
- Firebase: $0/mo (free tier)
- Vercel: $0/mo (free tier)
- Everything else: Pay-per-use
```

---

## Development Order (Organized)

### Overview: 6 Phases, 34 Weeks

**Philosophy:** Build in order of dependencies, validate early, scale incrementally.

**Key Principles:**
1. **Backend First:** API must work before building UI
2. **Core Before Features:** Get calling working before queues/dialer
3. **Validate Early:** Beta customers after Phase 1
4. **Scale Last:** Don't optimize prematurely

---

### PHASE 0: FOUNDATIONS (Weeks 1-4)
**Goal:** Infrastructure ready, first call works end-to-end

#### Week 1: Setup & Planning
**Team:** 1 Backend + 1 DevOps

**Tasks:**
- [ ] Set up AWS account, IAM users, billing alarms
- [ ] Register domain (useiris.com), configure DNS
- [ ] Create GitHub organization, repos (backend, frontend, infrastructure)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Create AWS RDS PostgreSQL (db.t4g.micro, $15/mo)
- [ ] Create AWS ElastiCache Redis (cache.t4g.micro, $12/mo)
- [ ] Create Firebase project (free tier) for push notifications + presence
- [ ] Set up Better Stack monitoring (free tier)

**Deliverables:**
- AWS account configured
- Domain registered and DNS working
- GitHub repos created with CI/CD
- RDS PostgreSQL accessible
- ElastiCache Redis accessible
- Firebase project created

---

#### Week 2: Database Schema
**Team:** 1 Backend

**Tasks:**
- [ ] Design database schema (tenants, users, phone_numbers, calls, cdr)
- [ ] Create migration files (use `node-pg-migrate` or Prisma)
- [ ] Write seed data for testing
- [ ] Set up row-level security (RLS) for multi-tenancy
- [ ] Create database indexes for performance
- [ ] Test: CRUD operations on all tables

**Deliverables:**
- Complete database schema
- Migration system working
- Seed data populates correctly

**SQL Schema Preview:**
```sql
-- Tenants (companies/organizations)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (people who log in)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone Numbers (DIDs)
CREATE TABLE phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  number TEXT UNIQUE NOT NULL, -- E.164 format
  provider TEXT, -- twilio, telnyx
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls (real-time call state)
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  from_number TEXT,
  to_number TEXT,
  direction TEXT, -- inbound, outbound
  status TEXT, -- queued, ringing, in_progress, completed, failed
  freeswitch_uuid TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CDR (call detail records)
CREATE TABLE cdr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  call_id UUID REFERENCES calls(id),
  from_number TEXT,
  to_number TEXT,
  duration_seconds INT,
  billable_seconds INT,
  cost DECIMAL(10,6),
  status TEXT, -- completed, busy, no_answer, failed
  hangup_cause TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition CDR by month for performance
CREATE TABLE cdr_2025_01 PARTITION OF cdr
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

#### Week 3: FreeSWITCH Setup
**Team:** 1 Telephony Engineer + 1 DevOps

**Tasks:**
- [ ] Build FreeSWITCH AMI with Packer (Ubuntu 24.04, FreeSWITCH 1.10.12)
- [ ] Launch t3.medium EC2 instance (2 vCPU, 4GB RAM)
- [ ] Assign Elastic IP
- [ ] Configure FreeSWITCH for SIP trunking
- [ ] Configure Twilio SIP trunk to point to EC2 Elastic IP
- [ ] Test inbound call (dial Twilio number → FreeSWITCH answers)
- [ ] Test outbound call (FreeSWITCH → Twilio → PSTN)
- [ ] Set up NATS JetStream on same EC2

**Deliverables:**
- FreeSWITCH running and accessible
- Twilio trunk connected
- Test calls working both directions
- NATS JetStream running

**FreeSWITCH Config Preview:**
```xml
<!-- /etc/freeswitch/sip_profiles/external.xml -->
<profile name="external">
  <gateways>
    <gateway name="twilio">
      <param name="username" value="your-twilio-account-sid"/>
      <param name="password" value="your-auth-token"/>
      <param name="proxy" value="your-region.pstn.twilio.com"/>
      <param name="register" value="false"/>
    </gateway>
  </gateways>
</profile>
```

---

#### Week 4: Backend API Foundation
**Team:** 2 Backend Engineers

**Tasks:**
- [ ] Set up Node.js 22 project with TypeScript
- [ ] Install Hono.js, configure middleware (CORS, auth, rate limiting)
- [ ] Implement POST /v1/calls endpoint (accept call params)
- [ ] Publish call job to NATS JetStream
- [ ] Build orchestrator worker (consume NATS, send to FreeSWITCH via ESL)
- [ ] Test end-to-end: API → NATS → Worker → FreeSWITCH → Twilio
- [ ] Implement CDR write path (FreeSWITCH events → NATS → Postgres)
- [ ] Test: CDR written within 10 seconds of call end

**Deliverables:**
- API can create outbound call
- Orchestrator worker originates call in FreeSWITCH
- CDR written to database after call

**API Example:**
```javascript
// POST /v1/calls
import { Hono } from 'hono';
import { nats } from './nats';

const app = new Hono();

app.post('/v1/calls', async (c) => {
  const { to, from, message } = await c.req.json();

  // Validate
  if (!to || !message) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Create call record
  const call = await db.query(`
    INSERT INTO calls (tenant_id, to_number, from_number, status)
    VALUES ($1, $2, $3, 'queued')
    RETURNING id
  `, [c.get('tenant_id'), to, from]);

  // Publish to NATS
  await nats.publish('calls.originate', {
    call_id: call.rows[0].id,
    to,
    from,
    message
  });

  return c.json({ call_id: call.rows[0].id, status: 'queued' });
});
```

**Orchestrator Worker:**
```javascript
// workers/orchestrator.js
import { connect } from 'nats';
import { ESL } from 'modesl';

const nc = await connect({ servers: 'nats://localhost:4222' });
const js = nc.jetstream();
const consumer = await js.consumers.get('calls', 'orchestrator');

for await (const msg of await consumer.consume()) {
  const job = JSON.parse(msg.data);

  // Originate call via FreeSWITCH ESL
  const conn = new ESL.Connection('localhost', 8021, 'ClueCon');
  conn.api(`originate {origination_uuid=${job.call_id}}sofia/gateway/twilio/${job.to} &park()`);

  msg.ack();
}
```

---

**PHASE 0 EXIT CRITERIA:**
- [ ] 10 test calls placed successfully, 100% success rate
- [ ] CDR written within 10 seconds
- [ ] Infrastructure cost <$50/mo
- [ ] Basic API authentication working

---

### PHASE 1: CORE CALLING & WEBHOOKS (Weeks 5-12)
**Goal:** Production-ready calling platform, first 5 beta customers

#### Week 5-6: TTS Integration & Media
**Team:** 1 Backend + 1 Telephony

**Tasks:**
- [ ] Integrate OpenAI TTS API
- [ ] Implement TTS caching to Cloudflare R2 (cache static messages)
- [ ] Implement ElevenLabs TTS (higher quality option)
- [ ] Build TTS router (fallback: ElevenLabs → OpenAI → AWS Polly)
- [ ] Implement Say verb (play TTS to caller)
- [ ] Implement Play verb (stream audio URL from R2)
- [ ] Test: IVR flow with TTS greeting

**Deliverables:**
- TTS working with caching
- Multi-provider TTS with failover
- Say and Play verbs functional

---

#### Week 7-8: Call Control Actions
**Team:** 2 Backend

**Tasks:**
- [ ] Implement Gather verb (DTMF and speech input)
- [ ] Implement Transfer verb (blind and attended transfer)
- [ ] Implement Record verb (start/stop recording, upload to R2)
- [ ] Implement Dial verb (connect to another number)
- [ ] Test: Multi-step IVR (press 1 for sales, 2 for support)
- [ ] Test: Call recording and playback

**Deliverables:**
- All call control verbs working
- Multi-step IVR flows functional

---

#### Week 9-10: Webhooks & Customer Portal
**Team:** 1 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Implement webhook system (HMAC signing, retry logic with exponential backoff)
- [ ] Implement webhook events (call.initiated, call.answered, call.completed)
- [ ] Test: Webhooks delivered within 2 seconds, retry on failure

**Frontend Tasks (Vue 3):**
- [ ] Set up Vue 3.5 + Vite 6 project
- [ ] Install Tailwind CSS 4, Pinia, Vue Router
- [ ] Build authentication pages (login, signup, password reset)
- [ ] Build dashboard home page (call stats, usage)
- [ ] Build API key management page
- [ ] Build webhook inspector (show webhook payloads, retry failed)
- [ ] Build live call logs (refresh every 5 seconds)
- [ ] Deploy to Vercel

**Deliverables:**
- Webhook system working with retries
- Customer portal live with basic features

**Vue Component Example:**
```vue
<!-- components/CallLogs.vue -->
<template>
  <div class="p-6">
    <h2 class="text-2xl font-bold mb-4">Call Logs</h2>

    <table class="w-full">
      <thead>
        <tr>
          <th>Time</th>
          <th>From</th>
          <th>To</th>
          <th>Duration</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="call in calls" :key="call.id">
          <td>{{ formatTime(call.created_at) }}</td>
          <td>{{ call.from_number }}</td>
          <td>{{ call.to_number }}</td>
          <td>{{ call.duration_seconds }}s</td>
          <td>
            <span :class="statusClass(call.status)">
              {{ call.status }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useCallStore } from '@/stores/calls';

const callStore = useCallStore();
const calls = ref([]);

onMounted(async () => {
  calls.value = await callStore.fetchCalls();

  // Auto-refresh every 5 seconds
  setInterval(async () => {
    calls.value = await callStore.fetchCalls();
  }, 5000);
});

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString();
};

const statusClass = (status) => {
  return {
    'completed': 'text-green-600',
    'failed': 'text-red-600',
    'in_progress': 'text-blue-600'
  }[status] || 'text-gray-600';
};
</script>
```

---

#### Week 11-12: Documentation & Beta Launch
**Team:** 1 Backend + 1 Frontend + 1 Technical Writer

**Tasks:**
- [ ] Write OpenAPI 3.1 specification for all endpoints
- [ ] Set up Mintlify documentation site
- [ ] Write quickstart guide (5 minutes to first call)
- [ ] Write API reference (auto-generated from OpenAPI)
- [ ] Generate Node.js SDK (Speakeasy from OpenAPI)
- [ ] Create sample code repository (examples in Node.js, Python, PHP)
- [ ] Build pricing calculator page
- [ ] Onboard 5 beta customers (free trial)
- [ ] Load test: 100 concurrent calls, 20 CPS, 30 minutes
- [ ] Set up error tracking (Sentry)

**Deliverables:**
- API documentation published
- Node.js SDK available on npm
- 5 beta customers making calls
- Load test passed (>98% success rate)

---

**PHASE 1 EXIT CRITERIA:**
- [ ] API docs published at docs.useiris.com
- [ ] 5 beta customers active, positive feedback
- [ ] Load test passed (>98% success rate)
- [ ] Zero P0/P1 incidents in last 2 weeks
- [ ] Infrastructure cost $150-200/mo

---

### PHASE 2: QUEUES & AGENTS (Weeks 13-18)
**Goal:** ACD (Automatic Call Distributor) for call centers

#### Week 13-14: Queue Backend
**Team:** 2 Backend

**Tasks:**
- [ ] Implement Redis-backed queue system (LPUSH/RPOP)
- [ ] Implement agent presence tracking (WebSocket heartbeat)
- [ ] Implement Enqueue verb
- [ ] Implement round-robin routing
- [ ] Implement queue music on hold
- [ ] Implement queue position announcements
- [ ] Test: 10 calls in queue, 3 agents pick up sequentially

**Deliverables:**
- Queue system working with multiple callers
- Agent presence tracking

---

#### Week 15-16: Advanced Routing
**Team:** 2 Backend

**Tasks:**
- [ ] Implement skills-based routing (Spanish, billing, technical)
- [ ] Implement sticky agent (same caller → same agent)
- [ ] Implement priority queuing (VIP customers first)
- [ ] Implement queue metrics (EWT, service level, abandon rate)
- [ ] Implement queue overflow (transfer to voicemail after X minutes)
- [ ] Test: Skills matching works correctly

**Deliverables:**
- Skills-based routing functional
- Queue metrics accurate

---

#### Week 17-18: Agent Desktop & Supervisor Dashboard
**Team:** 2 Frontend + 1 Backend

**Frontend Tasks (Vue 3):**
- [ ] Build agent login page
- [ ] Build agent dashboard (available/busy/away status)
- [ ] Build WebRTC softphone component (JsSIP integration)
- [ ] Build queue dashboard (live queue depth, EWT, agents)
- [ ] Build agent grid (status, current call, today's stats)
- [ ] Build supervisor tools (monitor, whisper, barge)
- [ ] Test: Agent logs in via web, receives call from queue

**Backend Tasks:**
- [ ] Implement WebSocket server for real-time updates
- [ ] Implement agent state change API
- [ ] Implement supervisor actions (monitor, whisper, barge)
- [ ] Test: Agent presence updates in <500ms

**Deliverables:**
- Agent desktop fully functional
- WebRTC softphone working
- Supervisor dashboard live

**Vue Component Example:**
```vue
<!-- components/AgentSoftphone.vue -->
<template>
  <div class="softphone p-4 bg-white rounded shadow">
    <div class="status mb-4">
      <span :class="statusColor">{{ agentStatus }}</span>
    </div>

    <div v-if="currentCall" class="call-info mb-4">
      <p class="text-lg">{{ currentCall.from_number }}</p>
      <p class="text-sm text-gray-600">{{ callDuration }}</p>
    </div>

    <div class="controls grid grid-cols-3 gap-2">
      <button @click="answer" v-if="!currentCall" class="btn-primary">
        Answer
      </button>
      <button @click="mute" class="btn-secondary">
        {{ isMuted ? 'Unmute' : 'Mute' }}
      </button>
      <button @click="hold" class="btn-secondary">
        {{ isHeld ? 'Resume' : 'Hold' }}
      </button>
      <button @click="transfer" class="btn-secondary">
        Transfer
      </button>
      <button @click="hangup" v-if="currentCall" class="btn-danger">
        Hang Up
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { JsSIP } from 'jssip';

const agentStatus = ref('offline');
const currentCall = ref(null);
const isMuted = ref(false);
const isHeld = ref(false);

const statusColor = computed(() => {
  return {
    'available': 'text-green-600',
    'busy': 'text-red-600',
    'away': 'text-yellow-600',
    'offline': 'text-gray-600'
  }[agentStatus.value];
});

// JsSIP integration
let ua;

onMounted(() => {
  const socket = new JsSIP.WebSocketInterface('wss://sip.useiris.com');
  const configuration = {
    sockets: [socket],
    uri: 'sip:agent@useiris.com',
    password: 'secret'
  };

  ua = new JsSIP.UA(configuration);
  ua.start();

  ua.on('newRTCSession', (e) => {
    currentCall.value = e.session;
  });
});
</script>
```

---

**PHASE 2 EXIT CRITERIA:**
- [ ] Queue holds 1,000 callers without issues
- [ ] Agent presence updates in <500ms
- [ ] WebRTC softphone works in Chrome, Firefox, Safari
- [ ] 1 call center customer in production

---

### PHASE 3: CAMPAIGNS & DIALER (Weeks 19-26)
**Goal:** Outbound dialer for campaigns, billing system

#### Week 19-20: Campaign Management
**Team:** 1 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Build campaign CRUD API
- [ ] Implement CSV upload for contacts (handle 100K+ rows)
- [ ] Implement contact import (parse, validate, dedupe)
- [ ] Implement progressive dialer (1:1 dial ratio)
- [ ] Test: Campaign of 1K contacts completes

**Frontend Tasks (Vue 3):**
- [ ] Build campaign list page
- [ ] Build campaign create/edit form
- [ ] Build contact upload page (drag-drop CSV)
- [ ] Build campaign dashboard (live stats)
- [ ] Test: Non-technical user can create campaign

**Deliverables:**
- Campaign management working
- CSV upload handles large files
- Progressive dialer functional

---

#### Week 21-22: Predictive Dialer & Compliance
**Team:** 2 Backend

**Tasks:**
- [ ] Implement dial ratio calculation (adaptive based on answer rate)
- [ ] Implement AMD (answering machine detection)
- [ ] Implement DNC list checking (National Do Not Call Registry)
- [ ] Implement TCPA compliance (time zone enforcement, frequency caps)
- [ ] Implement call pacing (max CPS per campaign)
- [ ] Test: Predictive dialer at 2.5:1 ratio, <3% abandon rate

**Deliverables:**
- Predictive dialer working
- TCPA compliance enforced
- DNC checking integrated

---

#### Week 23-24: Billing Engine
**Team:** 2 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Build rating engine (prefix match, calculate cost per minute)
- [ ] Implement usage tracking (real-time cost accumulation)
- [ ] Implement invoice generation (monthly, PDF via Stripe)
- [ ] Integrate Stripe for payment processing
- [ ] Implement spend limits and alerts
- [ ] Test: Invoice generated automatically on 1st of month

**Frontend Tasks (Vue 3):**
- [ ] Build billing dashboard (current usage, costs)
- [ ] Build invoice history page
- [ ] Build payment method management (Stripe Elements)
- [ ] Build usage alerts configuration
- [ ] Test: Customer can view/download invoices

**Deliverables:**
- Billing engine calculating costs correctly
- Stripe integration working
- Invoices auto-generated

---

#### Week 25-26: Analytics & Reporting
**Team:** 1 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Set up ClickHouse Cloud
- [ ] Stream CDR data to ClickHouse
- [ ] Build analytics API endpoints
- [ ] Implement spend alerts (email + webhook at 80%, 100%)

**Frontend Tasks (Vue 3):**
- [ ] Build analytics dashboard (calls/day, cost/day, top destinations)
- [ ] Build usage charts (Chart.js or ECharts)
- [ ] Build export functionality (CSV, PDF reports)
- [ ] Test: Dashboard updates in real-time

**Load Testing:**
- [ ] Soak test: 1,000 concurrent calls for 2 hours
- [ ] Stress test: Ramp up to failure point
- [ ] Fix any bottlenecks discovered

**Deliverables:**
- Analytics dashboard live
- ClickHouse ingesting CDR data
- Load tests passed

---

**PHASE 3 EXIT CRITERIA:**
- [ ] Predictive dialer working (<3% abandon rate)
- [ ] Invoices auto-generated (99.9% accuracy)
- [ ] First paying customer ($199/mo)
- [ ] MRR >$1,000
- [ ] 1,000 concurrent call test passed

---

### PHASE 4: MULTI-CHANNEL (Weeks 27-30)
**Goal:** Add SMS, Email, Social Media channels

#### Week 27-28: SMS Integration
**Team:** 2 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Integrate Telnyx SMS API
- [ ] Integrate Twilio SMS API (fallback)
- [ ] Implement least-cost routing for SMS
- [ ] Implement SMS campaign support
- [ ] Test: SMS delivery working

**Frontend Tasks (Vue 3):**
- [ ] Build SMS campaign page
- [ ] Build SMS template editor
- [ ] Update unified message API to support SMS
- [ ] Test: Send SMS campaign to 1K recipients

**Deliverables:**
- SMS working with multi-provider support
- SMS campaigns functional

---

#### Week 29-30: Email & Social Media
**Team:** 2 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Integrate AWS SES for email
- [ ] Integrate Postmark (transactional email)
- [ ] Integrate Facebook Messenger API
- [ ] Integrate Twitter DM API
- [ ] Implement unified send API (one endpoint, all channels)
- [ ] Test: Send same message to voice + SMS + email + social

**Frontend Tasks (Vue 3):**
- [ ] Build multi-channel message composer
- [ ] Build channel selector (all, cascade, single)
- [ ] Update analytics to show all channels
- [ ] Test: Broadcast to all channels works

**Deliverables:**
- Email and social media working
- Unified API functional
- Multi-channel campaigns working

---

**PHASE 4 EXIT CRITERIA:**
- [ ] All channels (voice, SMS, email, social) working
- [ ] Unified API delivers to all channels
- [ ] Multi-channel campaign completed successfully
- [ ] MRR >$5,000

---

### PHASE 5: ENTERPRISE FEATURES (Weeks 31-32)
**Goal:** Multi-carrier, multi-region, enterprise-ready

#### Week 31: Multi-Carrier & High Availability
**Team:** 1 Telephony + 1 DevOps

**Tasks:**
- [ ] Add Telnyx as second voice carrier
- [ ] Implement carrier failover (if Twilio fails, use Telnyx)
- [ ] Set up Kamailio load balancer (distribute load across carriers)
- [ ] Test: Carrier failover works automatically
- [ ] Set up multi-region (us-east-1 + us-west-2)
- [ ] Test: Multi-region failover works (RTO <15 minutes)

**Deliverables:**
- Multi-carrier working with failover
- Multi-region deployment functional

---

#### Week 32: Security & Compliance
**Team:** 1 Backend + 1 Security

**Tasks:**
- [ ] Implement call recording encryption (AES-256-GCM)
- [ ] Implement STIR/SHAKEN call attestation
- [ ] Complete SOC 2 readiness assessment
- [ ] Implement audit logging (all API calls, admin actions)
- [ ] Set up intrusion detection
- [ ] Test: Penetration testing

**Deliverables:**
- Call recordings encrypted
- SOC 2 controls implemented
- Security audit passed

---

**PHASE 5 EXIT CRITERIA:**
- [ ] Multi-carrier failover working
- [ ] Multi-region RTO <15 minutes
- [ ] SOC 2 readiness confirmed
- [ ] First enterprise customer ($5K+/mo)
- [ ] MRR >$10K

---

### PHASE 6: ADVANCED FEATURES (Weeks 33-34)
**Goal:** AI features, video calling, workforce management

#### Week 33: AI Features
**Team:** 1 Backend + 1 AI/ML

**Tasks:**
- [ ] Integrate Deepgram for real-time transcription
- [ ] Implement GPT-4 call summarization
- [ ] Implement sentiment analysis
- [ ] Implement topic extraction
- [ ] Build AI conversation intelligence dashboard

**Deliverables:**
- Real-time transcription working
- AI summaries generated after calls

---

#### Week 34: Video Calling & Final Polish
**Team:** 2 Backend + 1 Frontend

**Backend Tasks:**
- [ ] Set up MediaSoup SFU for video conferencing
- [ ] Implement WebRTC video calling API
- [ ] Implement screen sharing

**Frontend Tasks (Vue 3):**
- [ ] Build video calling component
- [ ] Build screen sharing UI
- [ ] Final UI polish across all pages
- [ ] Performance optimization

**Deliverables:**
- Video calling working (1-on-1 and multi-party)
- Screen sharing functional
- All UI polished and performant

---

**PHASE 6 EXIT CRITERIA:**
- [ ] AI features working (transcription, summaries)
- [ ] Video calling functional
- [ ] Platform feature-complete
- [ ] MRR >$25K

---

## Module Dependencies

### Dependency Graph

```
FOUNDATION (Week 1-4)
├── Database Schema ────────────┐
├── FreeSWITCH Setup ──────────┤
└── Backend API Foundation ────┤
                               ↓
CORE CALLING (Week 5-12)       │
├── TTS Integration ───────────┤
├── Call Control ──────────────┤
├── Webhooks ──────────────────┤
└── Customer Portal (Vue) ─────┤
                               ↓
QUEUES & AGENTS (Week 13-18)   │
├── Queue Backend ─────────────┤
├── Advanced Routing ──────────┤
└── Agent Desktop (Vue) ───────┤
                               ↓
CAMPAIGNS & DIALER (Week 19-26)│
├── Campaign Management ───────┤
├── Predictive Dialer ─────────┤
├── Billing Engine ────────────┤
└── Analytics Dashboard (Vue) ─┤
                               ↓
MULTI-CHANNEL (Week 27-30)     │
├── SMS Integration ───────────┤
├── Email Integration ─────────┤
└── Social Media APIs ─────────┤
                               ↓
ENTERPRISE (Week 31-32)        │
├── Multi-Carrier ─────────────┤
├── Multi-Region ──────────────┤
└── Security & Compliance ─────┤
                               ↓
ADVANCED FEATURES (Week 33-34) │
├── AI Features ───────────────┤
└── Video Calling ─────────────┘
```

### Critical Path

**Cannot start until complete:**
1. Database Schema → All backend work
2. FreeSWITCH Setup → Call testing
3. Backend API → Frontend development
4. Core Calling → Queues (need call control first)
5. Queues → Dialer (need queue infrastructure)
6. Billing → Production launch (need to charge customers)

---

## Team Structure

### Recommended Team (Phases 0-3)

**Total: 5-6 people**

| Role | FTE | Responsibilities |
|------|-----|------------------|
| **Technical Lead** | 1.0 | Architecture decisions, code review, unblock team |
| **Backend Engineer #1** | 1.0 | API development, database, integrations |
| **Backend Engineer #2** | 1.0 | Worker processes, billing, analytics |
| **Telephony Engineer** | 1.0 | FreeSWITCH, SIP, carriers, WebRTC |
| **Frontend Engineer** | 1.0 | Vue 3 development, all customer-facing UI |
| **DevOps Engineer** | 0.5 | Infrastructure, CI/CD, monitoring |

**Total Cost:** ~$65K/mo fully loaded (US salaries)

### Extended Team (Phases 4-6)

**Add:**
- Backend Engineer #3 (multi-channel)
- Frontend Engineer #2 (agent desktop)
- AI/ML Engineer (conversation intelligence)
- Security Engineer (SOC 2 compliance)

**Total: 9-10 people**

---

## Timeline & Milestones

### Overall Timeline: 34 Weeks (8 Months)

```
Month 1 (Week 1-4):   PHASE 0 - Foundations
Month 2 (Week 5-8):   PHASE 1 - Core Calling (Part 1)
Month 3 (Week 9-12):  PHASE 1 - Core Calling (Part 2) → BETA LAUNCH
Month 4 (Week 13-16): PHASE 2 - Queues & Agents (Part 1)
Month 5 (Week 17-20): PHASE 2 - Queues & Agents (Part 2) + PHASE 3 (Part 1)
Month 6 (Week 21-24): PHASE 3 - Campaigns & Dialer (Part 2)
Month 7 (Week 25-28): PHASE 3 - Analytics + PHASE 4 - Multi-Channel (Part 1)
Month 8 (Week 29-32): PHASE 4 - Multi-Channel (Part 2) + PHASE 5 - Enterprise
Month 9 (Week 33-34): PHASE 6 - Advanced Features → PRODUCTION LAUNCH
```

### Key Milestones

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| **4** | Foundation Complete | First test call works end-to-end |
| **8** | TTS & Media Working | IVR flows functional |
| **12** | **BETA LAUNCH** | 5 beta customers making calls |
| **18** | Queues & Agents | First call center customer live |
| **26** | Campaigns & Billing | First paying customer, MRR >$1K |
| **30** | Multi-Channel | Voice + SMS + Email + Social working |
| **32** | Enterprise Ready | Multi-carrier, multi-region, SOC 2 |
| **34** | **PRODUCTION LAUNCH** | Feature-complete, MRR >$10K |

---

## Infrastructure Costs by Phase

### Phase 0 (Week 1-4): $50/mo
- 1x t3.medium EC2: $30/mo
- Neon Postgres: Free tier
- Upstash Redis: Free tier
- Cloudflare Workers: $5/mo
- Better Stack: Free tier
- Domain: $15/mo

### Phase 1 (Week 5-12): $150-200/mo
- Same as Phase 0
- Add: TTS/STT usage ~$30/mo
- Add: Twilio voice minutes ~$50/mo (beta testing)
- Add: Cloudflare R2 usage ~$5/mo

### Phase 2 (Week 13-18): $200-300/mo
- Same as Phase 1
- Add: WebSocket server (same EC2, no extra cost)
- Add: Higher TTS/STT usage ~$50/mo
- Add: More voice minutes ~$100/mo

### Phase 3 (Week 19-26): $300-500/mo
- Same as Phase 2
- Add: ClickHouse Cloud ~$50/mo
- Add: Higher voice minutes ~$200/mo
- Add: Stripe fees (2.9% of revenue)

### Phase 4 (Week 27-30): $500-800/mo
- Same as Phase 3
- Add: SMS usage ~$100/mo
- Add: Email usage (AWS SES) ~$10/mo
- Add: Social media API usage ~$50/mo

### Phase 5-6 (Week 31-34): $800-1,500/mo
- Add: Second EC2 for multi-region ~$30/mo
- Add: Kamailio load balancer ~$30/mo
- Add: Telnyx carrier ~$100/mo
- Add: Higher usage across all channels ~$400/mo
- Upgrade: Neon → Aurora Serverless ~$100/mo
- Upgrade: Upstash → ElastiCache ~$50/mo

**At Scale (100K concurrent calls): $5,000-10,000/mo infrastructure**

---

## Next Steps

### Immediate Actions (This Week)

1. **Confirm Tech Stack**
   - ✅ Vue 3.5 for frontend
   - ✅ Node.js 22 + Hono.js for backend
   - ✅ PostgreSQL + Redis + FreeSWITCH

2. **Set Up Accounts**
   - [ ] AWS account (if not already)
   - [ ] Cloudflare account
   - [ ] GitHub organization
   - [ ] Neon Postgres account
   - [ ] Upstash Redis account

3. **Assemble Team**
   - [ ] Hire/assign Technical Lead
   - [ ] Hire/assign 2 Backend Engineers
   - [ ] Hire/assign 1 Telephony Engineer
   - [ ] Hire/assign 1 Frontend Engineer (Vue 3 expert)
   - [ ] Hire/assign 0.5 DevOps Engineer

4. **Kick Off Phase 0**
   - [ ] Week 1 starts Monday
   - [ ] Daily standups at 9am
   - [ ] Weekly sprint planning Mondays
   - [ ] Weekly demos Fridays

---

## Summary

**Tech Stack Confirmed:**
- ✅ **Frontend:** Vue 3.5 + Vite 6 + Tailwind CSS 4
- ✅ **Backend:** Node.js 22 LTS + Hono.js
- ✅ **Database:** PostgreSQL (Neon → Aurora)
- ✅ **Cache:** Redis (Upstash → ElastiCache)
- ✅ **Media:** FreeSWITCH on AWS EC2
- ✅ **Storage:** Cloudflare R2 or AWS S3
- ✅ **Event Bus:** NATS JetStream

**Development Order:**
1. **Phase 0 (Week 1-4):** Foundation - database, FreeSWITCH, basic API
2. **Phase 1 (Week 5-12):** Core Calling - TTS, webhooks, customer portal → **BETA LAUNCH**
3. **Phase 2 (Week 13-18):** Queues & Agents - ACD, WebRTC softphone, agent desktop
4. **Phase 3 (Week 19-26):** Campaigns & Dialer - CSV upload, predictive dialer, billing
5. **Phase 4 (Week 27-30):** Multi-Channel - SMS, email, social media, unified API
6. **Phase 5 (Week 31-32):** Enterprise - multi-carrier, multi-region, SOC 2
7. **Phase 6 (Week 33-34):** Advanced Features - AI, video calling → **PRODUCTION LAUNCH**

**Timeline:** 34 weeks (8 months) to feature-complete platform

**Team:** 5-6 people initially, 9-10 at scale

**Cost:** $50/mo (Phase 0) → $1,500/mo (Production)

**You're ready to build. Let's go! 🚀**
