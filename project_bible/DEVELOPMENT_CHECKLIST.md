# IRIS Development Checklist
## Master Checklist - Follow This Step-by-Step

**Start Date:** TBD
**Target Beta Launch:** Week 12
**Target Production Launch:** Week 34

> **📖 Reference Document:** [Tech Stack & Development Order](project_bible/IRIS_Tech_Stack_Development_Order.md)

---

## How to Use This Checklist

1. **Work top to bottom** - items are ordered by dependencies
2. **Check off items** as you complete them (change `[ ]` to `[x]`)
3. **Read linked docs** for implementation details
4. **Ask Claude** to implement each item when ready
5. **Test thoroughly** before moving to next item

---

## PRE-PHASE: SETUP & PLANNING (Week 0)

### Team Assembly
- [ ] Hire/assign Technical Lead
- [ ] Hire/assign Backend Engineer #1
- [ ] Hire/assign Backend Engineer #2
- [ ] Hire/assign Telephony Engineer
- [ ] Hire/assign Frontend Engineer (Vue 3 expert)
- [ ] Hire/assign DevOps Engineer (0.5 FTE)

### Account Setup
- [ ] AWS account created (if not exists)
- [ ] Firebase account created (https://firebase.google.com) - for push + presence
- [ ] GitHub organization created (https://github.com/your-org)
- [ ] Better Stack account created (https://betterstack.com) or use AWS CloudWatch
- [ ] Stripe account created (https://stripe.com)
- [ ] OpenAI account created (https://openai.com)
- [ ] Vercel account created (https://vercel.com) - for frontend hosting

### Domain & DNS
- [ ] Register domain (useiris.com or irisx.com)
- [ ] Configure DNS (AWS Route53 or Cloudflare DNS only)
- [ ] Create DNS records (api.*, app.*, docs.*)

### Development Tools
- [ ] Install Node.js 22 LTS
- [ ] Install Vue CLI / Vite
- [ ] Install Docker Desktop
- [ ] Install PostgreSQL client (psql)
- [ ] Install Redis client (redis-cli)
- [ ] Install AWS CLI
- [ ] Install Terraform/OpenTofu

**✅ PRE-PHASE COMPLETE:** All accounts and tools ready

---

## PHASE 0: FOUNDATIONS (Weeks 1-4)
**📖 Reference:** [Tech Stack Doc - Phase 0](project_bible/IRIS_Tech_Stack_Development_Order.md#phase-0-foundations-weeks-1-4)

### Week 1: Infrastructure Setup

#### AWS Configuration
- [ ] Set up AWS account with root user
- [ ] Create IAM users for team
- [ ] Set up billing alarms ($50, $100, $200 thresholds)
- [ ] Create VPC in us-east-1 (3 subnets: public, private, database)
- [ ] Create security groups (API, FreeSWITCH, database)
- [ ] Request Elastic IP for FreeSWITCH

#### GitHub Setup
- [ ] Create GitHub repos:
  - [ ] `irisx-backend` (Node.js API + workers)
  - [ ] `irisx-frontend` (Vue 3 customer portal)
  - [ ] `irisx-infrastructure` (Terraform/Packer)
  - [ ] `irisx-docs` (Mintlify documentation)
- [ ] Set up GitHub Actions workflows (CI/CD)
- [ ] Configure branch protection (main, develop)
- [ ] Set up GitHub Secrets (API keys, credentials)

#### Database & Cache
- [ ] Create AWS RDS PostgreSQL (db.t4g.micro, $15/mo)
  - [ ] PostgreSQL 16
  - [ ] Single-AZ (upgrade to Multi-AZ later)
  - [ ] Save connection string to environment
- [ ] Create AWS ElastiCache Redis (cache.t4g.micro, $12/mo)
  - [ ] Redis 7.x
  - [ ] Single node (upgrade to cluster later)
  - [ ] Save Redis URL to environment
- [ ] Create Firebase project (free tier)
  - [ ] Enable Realtime Database
  - [ ] Enable FCM (Firebase Cloud Messaging)
  - [ ] Save Firebase credentials to environment
- [ ] Test connections from local machine

#### Monitoring
- [ ] Set up Better Stack account
- [ ] Create log source for API
- [ ] Create log source for FreeSWITCH
- [ ] Set up uptime monitors (when deployed)

**Ask Claude:** "Let's set up the GitHub repos and CI/CD pipeline for Phase 0 Week 1"

---

### Week 2: Database Schema
**📖 Reference:** [Authentication & Identity](project_bible/IRIS_Authentication_Identity_RBAC.md), [Data Model](project_bible/IRIS%20X_call_master_scope_of_work_v_2_part2.md#14-data-model)

#### Schema Design
- [ ] Create database migration system (node-pg-migrate or Prisma)
- [ ] Design `tenants` table
- [ ] Design `users` table with RBAC
- [ ] Design `phone_numbers` table
- [ ] Design `calls` table
- [ ] Design `cdr` table with monthly partitions
- [ ] Design `api_keys` table
- [ ] Design `webhooks` table
- [ ] Design `contacts` table (for campaigns)
- [ ] Design `campaigns` table

#### Indexes & Constraints
- [ ] Create indexes on `tenant_id` (all tables)
- [ ] Create indexes on `created_at` (time-series queries)
- [ ] Create unique constraints (email, phone_number)
- [ ] Set up foreign keys with cascade rules
- [ ] Enable row-level security (RLS) for multi-tenancy

#### Testing & Seeding
- [ ] Write seed data script (sample tenants, users)
- [ ] Run migrations on AWS RDS PostgreSQL
- [ ] Test CRUD operations on all tables
- [ ] Verify RLS prevents cross-tenant access

**Ask Claude:** "Let's create the complete database schema with migrations for Week 2"

---

### Week 3: FreeSWITCH Setup
**📖 Reference:** [Voice Architecture](project_bible/IRIS%20X_call_master_scope_of_work_v_2.md#96-media-features)

#### AMI Build
- [ ] Create Packer template (Ubuntu 24.04)
- [ ] Install FreeSWITCH 1.10.12 from packages
- [ ] Install NATS JetStream server
- [ ] Install coturn (WebRTC TURN server)
- [ ] Configure FreeSWITCH profiles (internal, external)
- [ ] Configure FreeSWITCH ESL (port 8021)
- [ ] Build AMI with Packer

#### EC2 Deployment
- [ ] Launch t3.medium EC2 instance from AMI
- [ ] Attach Elastic IP
- [ ] Configure security group (SIP 5060, RTP 16384-32768, ESL 8021)
- [ ] SSH into instance and verify FreeSWITCH running
- [ ] Verify NATS running (`nats-server -v`)

#### Carrier Integration
- [ ] Configure Twilio SIP trunk in FreeSWITCH
  - [ ] Add gateway definition
  - [ ] Configure authentication
  - [ ] Set up dial plan
- [ ] Point Twilio trunk to EC2 Elastic IP
- [ ] Test inbound call (dial Twilio number → FreeSWITCH answers)
- [ ] Test outbound call (FreeSWITCH → Twilio → PSTN)

#### NATS Configuration
- [ ] Create NATS JetStream stream: `calls`
- [ ] Create consumer: `orchestrator`
- [ ] Create stream: `events` (for CDR)
- [ ] Test publish/consume from Node.js

**Ask Claude:** "Let's create the Packer template and FreeSWITCH configuration for Week 3"

---

### Week 4: Backend API Foundation
**📖 Reference:** [API Surface v1](project_bible/IRIS%20X_call_master_scope_of_work_v_2_part2.md#12-api-surface-v1)

#### API Setup
- [ ] Initialize Node.js 22 project with TypeScript
- [ ] Install dependencies:
  - [ ] Hono.js (HTTP framework)
  - [ ] pg (PostgreSQL client)
  - [ ] ioredis (Redis client)
  - [ ] nats (NATS client)
  - [ ] jsonwebtoken (JWT auth)
  - [ ] zod (validation)
- [ ] Set up project structure (src/, routes/, middleware/, utils/)
- [ ] Configure TypeScript (tsconfig.json)
- [ ] Configure ESLint + Prettier

#### Authentication Middleware
- [ ] Implement JWT generation (login)
- [ ] Implement JWT verification middleware
- [ ] Implement API key authentication
- [ ] Implement rate limiting (Redis-backed)
- [ ] Test: Protected routes require auth

#### Core Endpoints
- [ ] POST /v1/auth/login (email + password → JWT)
- [ ] POST /v1/auth/register (create tenant + user)
- [ ] POST /v1/calls (create outbound call)
  - [ ] Validate request body (Zod schema)
  - [ ] Create call record in database
  - [ ] Publish to NATS `calls` stream
  - [ ] Return `call_id` and status
- [ ] GET /v1/calls/:id (get call status)
- [ ] GET /v1/calls (list calls for tenant)

#### Orchestrator Worker
- [ ] Create worker script (workers/orchestrator.js)
- [ ] Connect to NATS JetStream
- [ ] Consume from `calls` stream
- [ ] Connect to FreeSWITCH ESL
- [ ] Originate call via ESL API
- [ ] Handle ESL events (CHANNEL_ANSWER, CHANNEL_HANGUP)
- [ ] Update call status in database
- [ ] Test: API call → NATS → Worker → FreeSWITCH → Twilio

#### CDR Pipeline
- [ ] Create CDR worker (workers/cdr.js)
- [ ] Subscribe to FreeSWITCH ESL events
- [ ] Parse CDR data from CHANNEL_HANGUP
- [ ] Write to `cdr` table in database
- [ ] Publish to NATS `events` stream (for analytics)
- [ ] Test: CDR written within 10 seconds of hangup

#### Deployment
- [ ] Deploy API to Cloudflare Workers (or AWS Lambda)
- [ ] Deploy workers to EC2 (same instance as FreeSWITCH)
- [ ] Set up environment variables
- [ ] Test deployed API endpoints

**Ask Claude:** "Let's build the Hono.js API with authentication and the POST /v1/calls endpoint for Week 4"

---

**✅ PHASE 0 COMPLETE:** First call works end-to-end (API → NATS → FreeSWITCH → Twilio)

**Exit Criteria:**
- [ ] 10 test calls placed successfully, 100% success rate
- [ ] CDR written within 10 seconds
- [ ] Infrastructure cost <$50/mo
- [ ] Team can run system locally

---

## PHASE 1: CORE CALLING & WEBHOOKS (Weeks 5-12)
**📖 Reference:** [Tech Stack Doc - Phase 1](project_bible/IRIS_Tech_Stack_Development_Order.md#phase-1-core-calling--webhooks-weeks-5-12)

### Week 5-6: TTS Integration & Media
**📖 Reference:** [Media Processing & TTS](project_bible/IRIS_Media_Processing_TTS_STT.md)

#### OpenAI TTS Integration
- [ ] Create TTS service (services/tts.js)
- [ ] Integrate OpenAI TTS API
- [ ] Implement TTS caching strategy:
  - [ ] Hash text (SHA-256)
  - [ ] Check Redis cache first
  - [ ] If miss, call OpenAI API
  - [ ] Upload MP3 to Cloudflare R2
  - [ ] Store R2 URL in Redis (1 year TTL)
- [ ] Test: Static message TTS once, reused 100x

#### ElevenLabs TTS Integration
- [ ] Integrate ElevenLabs API (premium option)
- [ ] Add to TTS router (ElevenLabs → OpenAI fallback)
- [ ] Test: Failover works if ElevenLabs down

#### Call Control Verbs
- [ ] Implement `Say` verb (play TTS to caller)
  - [ ] Generate TTS (cached)
  - [ ] Play via FreeSWITCH `playback` command
- [ ] Implement `Play` verb (stream audio URL)
  - [ ] Support HTTP(S) URLs
  - [ ] Support R2/S3 URLs
- [ ] Test: IVR flow with TTS greeting

**Ask Claude:** "Let's implement the TTS service with OpenAI + ElevenLabs and caching for Week 5-6"

---

### Week 7-8: Call Control Actions

#### Gather Verb (Input Collection)
- [ ] Implement `Gather` verb (DTMF + speech input)
  - [ ] Set timeout (default 5 seconds)
  - [ ] Collect DTMF digits
  - [ ] Optional: Speech-to-text with Whisper
  - [ ] POST gathered input to webhook URL
- [ ] Test: "Press 1 for sales" → captures "1"

#### Transfer Verb
- [ ] Implement `Transfer` verb (blind transfer)
- [ ] Implement attended transfer (ask before transfer)
- [ ] Test: Transfer call to external number

#### Record Verb
- [ ] Implement `Record` verb
  - [ ] Start recording via FreeSWITCH
  - [ ] Stop on timeout or DTMF (#)
  - [ ] Upload recording to R2
  - [ ] Return recording URL in webhook
- [ ] Test: Record voicemail, playback works

#### Dial Verb
- [ ] Implement `Dial` verb (connect to another number)
  - [ ] Bridge to external number
  - [ ] Handle busy/no answer
  - [ ] Track call duration
- [ ] Test: Dial external number, bridge successful

**Ask Claude:** "Let's implement Gather, Transfer, Record, and Dial verbs for Week 7-8"

---

### Week 9-10: Webhooks & Customer Portal

#### Webhook System (Backend)
**📖 Reference:** [API Surface - Webhooks](project_bible/IRIS%20X_call_master_scope_of_work_v_2_part2.md#webhooks)

- [ ] Implement webhook delivery service
  - [ ] HMAC signature (SHA-256)
  - [ ] Retry logic (exponential backoff: 1s, 2s, 4s, 8s, 16s)
  - [ ] Timeout (10 seconds)
  - [ ] Store delivery attempts in database
- [ ] Implement webhook events:
  - [ ] `call.initiated` (call created)
  - [ ] `call.ringing` (callee phone ringing)
  - [ ] `call.answered` (callee picked up)
  - [ ] `call.completed` (call ended)
  - [ ] `call.failed` (call failed)
  - [ ] `recording.ready` (recording uploaded)
- [ ] Test: Webhooks delivered within 2 seconds
- [ ] Test: Retry works on failure

#### Customer Portal (Vue 3)
**📖 Reference:** [Customer Onboarding Portal](project_bible/IRIS_Customer_Onboarding_Portal.md)

- [ ] Initialize Vue 3.5 project (Vite 6)
- [ ] Install dependencies:
  - [ ] Vue Router 4
  - [ ] Pinia (state management)
  - [ ] Tailwind CSS 4
  - [ ] VueUse (utilities)
  - [ ] Axios or Fetch API
- [ ] Set up project structure (views/, components/, stores/, router/)

#### Authentication Pages
- [ ] Build login page (email + password)
- [ ] Build signup page (create tenant + user)
- [ ] Build password reset page
- [ ] Build email verification page
- [ ] Implement auth store (Pinia)
  - [ ] Login action (POST /v1/auth/login)
  - [ ] Store JWT in localStorage
  - [ ] Auto-refresh token
  - [ ] Logout action

#### Dashboard Pages
- [ ] Build dashboard home (call stats, usage)
- [ ] Build API keys page (generate, revoke keys)
- [ ] Build webhook configuration page
  - [ ] Add webhook URL
  - [ ] Select events to subscribe
  - [ ] View webhook logs
  - [ ] Retry failed webhooks
- [ ] Build call logs page
  - [ ] Table of recent calls
  - [ ] Filters (status, date range)
  - [ ] Auto-refresh every 5 seconds
  - [ ] Click to view call details

#### Deployment
- [ ] Deploy to Vercel (or Cloudflare Pages)
- [ ] Configure custom domain (app.useiris.com)
- [ ] Set up environment variables (API_URL)

**Ask Claude:** "Let's build the Vue 3 customer portal with authentication and dashboard for Week 9-10"

---

### Week 11-12: Documentation & Beta Launch
**📖 Reference:** [Documentation Site](project_bible/IRIS_Documentation_Site.md), [Developer Experience](project_bible/IRIS_Developer_Experience_SDKs.md)

#### OpenAPI Specification
- [ ] Write OpenAPI 3.1 spec (openapi.yaml)
  - [ ] Document all endpoints
  - [ ] Request/response schemas
  - [ ] Authentication (Bearer token, API key)
  - [ ] Error responses
- [ ] Validate spec (openapi-generator validate)

#### Documentation Site
- [ ] Set up Mintlify project (docs/)
- [ ] Write documentation pages:
  - [ ] Introduction
  - [ ] Quickstart (5-minute guide)
  - [ ] Authentication
  - [ ] Making Calls
  - [ ] Call Control Verbs
  - [ ] Webhooks
  - [ ] Error Handling
- [ ] Auto-generate API reference from OpenAPI
- [ ] Deploy to docs.useiris.com

#### SDK Generation
- [ ] Generate Node.js SDK (Speakeasy or openapi-generator)
- [ ] Test SDK against live API
- [ ] Publish to npm (@irisx/sdk)
- [ ] Add SDK examples to docs

#### Sample Code Repository
- [ ] Create `irisx-examples` repo
- [ ] Add examples:
  - [ ] Simple outbound call (Node.js)
  - [ ] IVR with menu (Node.js)
  - [ ] Voicemail system (Node.js)
  - [ ] Call recording (Node.js)
  - [ ] Webhook handler (Node.js, Express)

#### Beta Customer Onboarding
- [ ] Create onboarding checklist for beta customers
- [ ] Reach out to 10 potential beta customers
- [ ] Onboard first 5 beta customers
- [ ] Give free credits ($100 each)
- [ ] Schedule weekly check-ins

#### Load Testing
- [ ] Set up k6 load testing scripts
- [ ] Test: 100 concurrent calls, 20 CPS
- [ ] Run for 30 minutes
- [ ] Monitor infrastructure (CPU, memory, network)
- [ ] Fix any bottlenecks
- [ ] Confirm: >98% success rate

#### Error Tracking
- [ ] Set up Sentry (or GlitchTip)
- [ ] Integrate in API (backend)
- [ ] Integrate in Portal (frontend)
- [ ] Test: Errors sent to Sentry

**Ask Claude:** "Let's create the OpenAPI spec and Mintlify documentation site for Week 11-12"

---

**✅ PHASE 1 COMPLETE:** Beta launch! 5 customers making production calls.

**Exit Criteria:**
- [ ] API docs published at docs.useiris.com
- [ ] Node.js SDK available on npm
- [ ] 5 beta customers active, positive feedback
- [ ] Load test passed (>98% success rate)
- [ ] Zero P0/P1 incidents in last 2 weeks
- [ ] Infrastructure cost $150-200/mo

---

## PHASE 2: QUEUES & AGENTS (Weeks 13-18)
**📖 Reference:** [Tech Stack Doc - Phase 2](project_bible/IRIS_Tech_Stack_Development_Order.md#phase-2-queues--agents-weeks-13-18), [Agent Desktop](project_bible/IRIS_Agent_Desktop_Supervisor_Tools.md)

### Week 13-14: Queue Backend

#### Redis Queue Implementation
- [ ] Design queue data structures in Redis:
  - [ ] `queue:{tenant_id}:{queue_name}` LIST (callers waiting)
  - [ ] `agent:{tenant_id}:{agent_id}` HASH (status, skills)
  - [ ] `agents:{tenant_id}:{queue_name}` SET (available agents)
- [ ] Implement queue operations:
  - [ ] `enqueue(caller)` - add to queue
  - [ ] `dequeue(agent)` - pop from queue, assign to agent
  - [ ] `position(caller_id)` - get position in queue
  - [ ] `length(queue)` - get queue depth

#### Agent Presence System
- [ ] Implement WebSocket server (Bun or Node.js)
- [ ] Agent connects via WebSocket on login
- [ ] Heartbeat every 30 seconds
- [ ] Update Redis on state change (available → busy)
- [ ] Disconnect handling (set offline)

#### Enqueue Verb
- [ ] Implement `Enqueue` verb
  - [ ] Add caller to Redis queue
  - [ ] Play music on hold (MOH)
  - [ ] Announce position every 30 seconds
  - [ ] Calculate EWT (estimated wait time)
  - [ ] Timeout after X minutes → voicemail

#### Round-Robin Routing
- [ ] Implement routing algorithm
  - [ ] Find available agents in queue
  - [ ] Pick next agent (round-robin)
  - [ ] Bridge call to agent
  - [ ] If agent doesn't answer, try next
- [ ] Test: 10 calls in queue, 3 agents pick up

**Ask Claude:** "Let's implement the Redis queue system and Enqueue verb for Week 13-14"

---

### Week 15-16: Advanced Routing

#### Skills-Based Routing
- [ ] Add `skills` field to agents table (JSONB array)
- [ ] Add `required_skills` to queue configuration
- [ ] Modify routing: Match caller skills to agent skills
- [ ] Test: Spanish caller → Spanish-speaking agent

#### Sticky Agent (Same Caller → Same Agent)
- [ ] Store last agent in `calls` table
- [ ] Check if last agent available
- [ ] Route to same agent if possible
- [ ] Fallback to skills-based if unavailable

#### Priority Queuing
- [ ] Add `priority` field to queue (1-10, default 5)
- [ ] Sort queue by priority (high first)
- [ ] VIP customers get priority 10
- [ ] Test: VIP skips ahead in queue

#### Queue Metrics
- [ ] Calculate real-time metrics:
  - [ ] Queue depth (callers waiting)
  - [ ] EWT (average wait time last 10 calls)
  - [ ] Service level (% answered in 30 seconds)
  - [ ] Abandon rate (% hung up before answer)
  - [ ] Avg handle time (AHT)
- [ ] Store metrics in Redis (time-series)
- [ ] Expose via API: GET /v1/queues/:id/metrics

#### Queue Overflow Handling
- [ ] Set max wait time per queue (e.g., 5 minutes)
- [ ] Transfer to voicemail after timeout
- [ ] Option: Callback instead of wait
- [ ] Test: Caller waits 5 min → voicemail

**Ask Claude:** "Let's implement skills-based routing and priority queuing for Week 15-16"

---

### Week 17-18: Agent Desktop & Supervisor Dashboard

#### WebRTC Softphone (Vue 3)
- [ ] Install JsSIP library (WebRTC SIP client)
- [ ] Create Softphone component
  - [ ] Connect to FreeSWITCH via WebSocket
  - [ ] Register SIP agent
  - [ ] Answer incoming calls
  - [ ] Make outbound calls
  - [ ] Mute/unmute
  - [ ] Hold/resume
  - [ ] Transfer call
  - [ ] Hang up
- [ ] Test: Agent receives call from queue via browser

#### Agent Desktop (Vue 3)
- [ ] Build agent login page
- [ ] Build agent dashboard:
  - [ ] Status selector (available, busy, away, offline)
  - [ ] Current call info (caller ID, duration)
  - [ ] Call history (today's calls)
  - [ ] Stats (calls handled, avg handle time)
  - [ ] Softphone embedded
- [ ] Build wrap-up form (post-call notes, disposition)

#### Queue Dashboard (Vue 3)
- [ ] Build queue wallboard (real-time):
  - [ ] Queue depth (callers waiting)
  - [ ] EWT (estimated wait time)
  - [ ] Service level (% in 30 sec)
  - [ ] Abandon rate
  - [ ] Longest wait (time)
- [ ] Auto-refresh every 5 seconds (WebSocket)
- [ ] Test: Metrics update in real-time

#### Agent Grid (Vue 3)
- [ ] Build agent grid (supervisor view):
  - [ ] List all agents
  - [ ] Status (available, busy, away, offline)
  - [ ] Current call (caller ID, duration)
  - [ ] Today's stats (calls, AHT)
- [ ] Auto-refresh via WebSocket
- [ ] Click agent → view details

#### Supervisor Tools (Backend)
- [ ] Implement supervisor actions:
  - [ ] Monitor (listen to call, agent can't hear)
  - [ ] Whisper (coach agent, caller can't hear)
  - [ ] Barge (join call, everyone hears)
- [ ] FreeSWITCH integration (eavesdrop API)
- [ ] Audit log (all supervisor actions)
- [ ] Test: Supervisor monitors call successfully

**Ask Claude:** "Let's build the Vue 3 agent desktop with WebRTC softphone for Week 17-18"

---

**✅ PHASE 2 COMPLETE:** Call center ACD functional, first call center customer live.

**Exit Criteria:**
- [ ] Queue holds 1,000 callers without issues
- [ ] Agent presence updates in <500ms
- [ ] WebRTC softphone works in Chrome, Firefox, Safari
- [ ] Service level metrics accurate
- [ ] 1 call center customer in production (10+ agents)

---

## PHASE 3: CAMPAIGNS & DIALER (Weeks 19-26)
**📖 Reference:** [Campaign Management](project_bible/IRIS_Campaign_Management.md), [Billing & Payments](project_bible/IRIS_Billing_Payments.md)

### Week 19-20: Campaign Management ✅ COMPLETE

#### Campaign CRUD (Backend)
- [x] Create `campaigns` table (name, status, contacts, settings)
- [x] Create `campaign_contacts` table (phone, name, custom_fields)
- [x] API endpoints:
  - [x] POST /v1/campaigns (create)
  - [x] GET /v1/campaigns (list)
  - [x] GET /v1/campaigns/:id (get)
  - [x] PATCH /v1/campaigns/:id (update)
  - [x] DELETE /v1/campaigns/:id (delete)
  - [x] POST /v1/campaigns/:id/launch (start dialing)
  - [x] POST /v1/campaigns/:id/pause (pause)
  - [x] GET /v1/campaigns/:id/stats (analytics)

#### CSV Upload & Import
- [ ] Implement CSV parser (papaparse or csv-parser)
- [ ] Handle large files (streaming, 100K+ rows)
- [ ] Validate phone numbers (E.164 format)
- [ ] Deduplicate contacts
- [ ] Import to `campaign_contacts` table
- [ ] Test: Upload 10K contact CSV

#### Progressive Dialer (1:1 Ratio)
- [ ] Create dialer worker (workers/dialer.js)
- [ ] Logic:
  - [ ] For each available agent
  - [ ] Pick next contact from campaign
  - [ ] Originate call
  - [ ] When answered, bridge to agent
- [ ] Test: Campaign of 1K contacts completes

#### Campaign Dashboard (Vue 3)
- [ ] Build campaign list page
- [ ] Build campaign create form
  - [ ] Name, description
  - [ ] Upload CSV
  - [ ] Select queue (agents)
  - [ ] Select dial mode (progressive, predictive)
- [ ] Build campaign dashboard (live stats):
  - [ ] Contacts: total, dialed, completed
  - [ ] Results: answered, busy, no answer, failed
  - [ ] Progress bar
  - [ ] Start/pause/stop buttons
- [ ] Test: Non-technical user creates campaign

**Ask Claude:** "Let's build the campaign management system with CSV upload for Week 19-20"

---

### Week 21-22: Predictive Dialer & Compliance
**📖 Reference:** [Compliance & Legal](project_bible/IRIS_Compliance_Legal_Guide.md)

#### Predictive Dialer Algorithm
- [ ] Implement adaptive dial ratio:
  - [ ] Track answer rate (last 100 calls)
  - [ ] Calculate dial ratio (available agents × ratio)
  - [ ] Ratio formula: `agents * (1 + (answer_rate - abandon_target))`
  - [ ] Start at 1.5:1, max 3:1
  - [ ] Adjust every 5 minutes
- [ ] Handle no-agent-available:
  - [ ] Play message: "Please hold, connecting you now..."
  - [ ] Enqueue caller (max 30 seconds)
  - [ ] If no agent in 30s, hang up (abandon)
- [ ] Track abandon rate (<3% target)
- [ ] Test: Predictive dialer at 2.5:1 ratio

#### Answering Machine Detection (AMD)
- [ ] Integrate FreeSWITCH AMD module
- [ ] Detect: human vs machine vs no answer
- [ ] If machine: Leave voicemail (optional)
- [ ] If human: Bridge to agent
- [ ] Test: AMD accuracy >90%

#### DNC List Checking
- [ ] Create `dnc_list` table (phone numbers to block)
- [ ] Import National DNC Registry (periodic updates)
- [ ] Check before dialing
- [ ] Skip if on DNC list
- [ ] Log DNC blocks for compliance
- [ ] Test: DNC number not dialed

#### TCPA Compliance
- [ ] Implement time zone enforcement:
  - [ ] Lookup phone number area code → timezone
  - [ ] Only dial 9am-9pm local time
  - [ ] Skip if outside hours
- [ ] Implement frequency caps:
  - [ ] Max 3 attempts per contact
  - [ ] Min 7 days between campaigns
- [ ] Store consent records in database
- [ ] Test: No calls outside 9am-9pm

#### Call Pacing
- [ ] Implement max CPS per campaign (default 10 CPS)
- [ ] Rate limit using token bucket algorithm
- [ ] Prevent carrier flooding
- [ ] Test: Campaign respects 10 CPS limit

**Ask Claude:** "Let's implement the predictive dialer with AMD and TCPA compliance for Week 21-22"

---

### Week 23-24: Billing Engine ✅ COMPLETE

**📖 Reference:** [Billing & Payments](project_bible/IRIS_Billing_Payments.md)

#### Rating Engine ✅
- [x] Create `rate_tables` table (prefix, cost_per_minute)
- [x] Import carrier rate deck (10 international rates)
- [x] Implement LCR (least-cost routing):
  - [x] Lookup destination prefix
  - [x] Find cheapest carrier by priority
  - [x] Database trigger for automatic cost calculation
- [x] Calculate cost after call:
  - [x] Lookup rate by prefix
  - [x] Apply minimum duration and billing increments
  - [x] Store in database
- [x] Test: Costs calculated correctly via database triggers

#### Usage Tracking ✅
- [x] Track usage per tenant:
  - [x] Daily usage aggregation table
  - [x] Monthly rollup views
  - [x] API endpoints for current month usage
- [x] Persist to database (daily aggregation)

#### Invoice Generation ✅
- [x] Create `invoices` table
- [x] Create `invoice_line_items` table
- [x] Generate invoice function:
  - [x] Query usage from monthly summary
  - [x] Sum costs by tenant
  - [x] Add subscription fee
  - [x] Create invoice record with line items
- [x] API endpoints for invoice management
- [ ] Generate PDF (future)
- [ ] Send via email (future)

#### Stripe Integration (Schema Ready)
- [ ] Install Stripe SDK (future)
- [x] Create `payment_methods` table
- [x] Store payment method metadata in database
- [ ] Implement Stripe Elements UI (future)
- [ ] Stripe webhook handler (future)

#### Spend Limits & Alerts ✅
- [x] Set spend limit per tenant
- [x] Create `spend_limits` table with thresholds
- [x] Check spend limit API endpoint
- [x] Alert threshold configuration (80%, 100%)
- [ ] Email + webhook notifications (future)

#### Additional Features Completed ✅
- [x] **API Documentation System** - OpenAPI 3.0 + Swagger UI
- [x] **Call Recording Management** - S3 storage + retention policies
- [x] **Phone Number Management** - Inventory + E911
- [x] **Tenant & User Management** - Multi-tenant API

**Ask Claude:** "Let's build the billing engine with Stripe integration for Week 23-24"

---

### Week 25-26: Analytics & Reporting ✅ NOTIFICATIONS COMPLETE

**📖 Reference:** [Analytics & Reporting](project_bible/IRIS_Analytics_Reporting.md)

#### Notification System ✅ COMPLETE
- [x] **Notification System** - Multi-channel notifications with templates
  - [x] `notifications` table - Core notification tracking
  - [x] `notification_preferences` table - Per-user preferences
  - [x] `notification_templates` table - Reusable templates
  - [x] `notification_delivery_log` table - Delivery tracking
  - [x] 7 API endpoints for notifications
  - [x] Multi-channel support (in_app, email, SMS, webhook)
  - [x] Template variable substitution ({{variable}})
  - [x] Default templates (spend alerts, payment failures, etc.)
  - [x] Per-user notification preferences

#### ClickHouse Setup
- [ ] Create ClickHouse Cloud account
- [ ] Create database: `irisx_analytics`
- [ ] Create table: `cdr_analytics` (denormalized CDR)
- [ ] Create materialized views for aggregations

#### ETL Pipeline
- [ ] Create analytics worker (workers/analytics.js)
- [ ] Consume CDR from NATS `events` stream
- [ ] Transform CDR (add derived fields)
- [ ] Batch insert to ClickHouse (1000 rows)
- [ ] Test: CDR appears in ClickHouse within 10 seconds

#### Analytics API Endpoints
- [ ] GET /v1/analytics/calls (time-series: calls per hour)
- [ ] GET /v1/analytics/costs (time-series: cost per day)
- [ ] GET /v1/analytics/destinations (top 10 destinations)
- [ ] GET /v1/analytics/campaigns (campaign performance)
- [ ] Test: API returns correct data

#### Analytics Dashboard (Vue 3)
- [ ] Build analytics page:
  - [ ] Calls chart (Chart.js or ECharts)
  - [ ] Cost chart (daily spend)
  - [ ] Top destinations table
  - [ ] Campaign performance table
- [ ] Date range picker
- [ ] Export to CSV button
- [ ] Test: Dashboard updates in real-time

#### Spend Alerts
- [ ] Implement alert system:
  - [ ] Check spend every hour
  - [ ] If 80% limit reached → email alert
  - [ ] If 100% limit reached → webhook + email + pause calls
- [ ] Test: Alert triggered at 80%

#### Load Testing
- [ ] Soak test: 1,000 concurrent calls for 2 hours
- [ ] Monitor infrastructure:
  - [ ] FreeSWITCH CPU/memory
  - [ ] Database connections
  - [ ] Redis memory
  - [ ] API response times
- [ ] Fix bottlenecks
- [ ] Test passed: >99% success rate

**Ask Claude:** "Let's set up ClickHouse and build the analytics dashboard for Week 25-26"

---

**✅ PHASE 3 COMPLETE:** Campaigns, billing, analytics functional. First paying customer!

**Exit Criteria:**
- [ ] Predictive dialer working (<3% abandon rate)
- [ ] Invoices auto-generated (99.9% accuracy)
- [ ] Stripe payments working
- [ ] First paying customer ($199/mo Growth plan)
- [ ] MRR >$1,000
- [ ] 1,000 concurrent call test passed

---

## PHASE 4: MULTI-CHANNEL (Weeks 27-30)
**📖 Reference:** [Multi-Channel Architecture](project_bible/IRIS_Multi_Channel_Platform_Architecture.md)

### Week 27-28: SMS Integration

#### SMS Provider Integration (Backend)
- [ ] Integrate Telnyx SMS API
- [ ] Integrate Twilio SMS API (fallback)
- [ ] Implement least-cost routing for SMS
- [ ] Unified send function:
  - [ ] Input: to, from, message
  - [ ] Select cheapest provider
  - [ ] Send SMS
  - [ ] Track delivery status (webhook)
- [ ] Test: SMS delivered successfully

#### SMS API Endpoints
- [ ] POST /v1/messages (unified: auto-detect voice vs SMS)
- [ ] POST /v1/sms (explicit SMS)
- [ ] GET /v1/sms/:id (get status)
- [ ] Webhook: sms.delivered, sms.failed

#### SMS Campaign Support
- [ ] Add SMS to campaign types
- [ ] Bulk SMS sending (1000/sec rate limit)
- [ ] Template variables ({{first_name}}, etc.)
- [ ] Test: Send SMS campaign to 1K recipients

#### SMS UI (Vue 3)
- [ ] Build SMS campaign page
- [ ] Build SMS template editor
- [ ] Build SMS test page (send test message)
- [ ] Test: User creates SMS campaign

**Ask Claude:** "Let's integrate SMS with Telnyx and Twilio for Week 27-28"

---

### Week 29-30: Email & Social Media

#### Email Integration (Backend)
- [ ] Integrate AWS SES (bulk email)
- [ ] Integrate Postmark (transactional email)
- [ ] Implement email templates (Handlebars)
- [ ] Unified send function (auto-detect email)
- [ ] Track opens/clicks (tracking pixel, link wrapping)
- [ ] Test: Email delivered successfully

#### Social Media APIs (Backend)
- [ ] Integrate Facebook Messenger API
- [ ] Integrate Twitter DM API
- [ ] Integrate Discord webhook API
- [ ] Integrate Telegram Bot API
- [ ] Unified send function (auto-detect channel)
- [ ] Test: Message sent to all social channels

#### Unified API
- [ ] POST /v1/messages (accepts phone, email, social handles)
- [ ] Auto-detect channel from recipient format:
  - [ ] `+1...` → SMS or Voice
  - [ ] `user@example.com` → Email
  - [ ] `@twitter` → Twitter DM
  - [ ] `facebook:12345` → Facebook Messenger
- [ ] Broadcast modes:
  - [ ] `all_channels` - send to all
  - [ ] `cascade` - try voice, fallback SMS, fallback email
  - [ ] `single` - send to one channel only
- [ ] Test: One API call sends to all channels

#### Multi-Channel UI (Vue 3)
- [ ] Build multi-channel message composer:
  - [ ] Select channels (voice, SMS, email, social)
  - [ ] Message editor (rich text for email)
  - [ ] Preview per channel
- [ ] Update analytics to show all channels
- [ ] Test: User sends multi-channel broadcast

**Ask Claude:** "Let's implement email and social media integrations with unified API for Week 29-30"

---

**✅ PHASE 4 COMPLETE:** All channels working, unified API functional.

**Exit Criteria:**
- [ ] All channels working (voice, SMS, email, Facebook, Twitter, Discord, Telegram)
- [ ] Unified API delivers to all channels
- [ ] Multi-channel campaign completed successfully
- [ ] Analytics track all channels
- [ ] MRR >$5,000

---

## PHASE 5: ENTERPRISE FEATURES (Weeks 31-32)
**📖 Reference:** [Complete Platform Extensions](project_bible/IRIS_Complete_Platform_Extensions.md)

### Week 31: Multi-Carrier & High Availability

#### Multi-Carrier Setup
- [ ] Add Telnyx as second voice carrier
- [ ] Configure Telnyx SIP trunk in FreeSWITCH
- [ ] Implement carrier health scoring:
  - [ ] Track ASR (answer seizure ratio)
  - [ ] Track ACD (average call duration)
  - [ ] Score = (ASR × 0.7) + (ACD_normal × 0.3)
- [ ] Implement carrier failover:
  - [ ] If Twilio call fails → retry with Telnyx
  - [ ] Auto-blacklist carrier if health < 80%
- [ ] Test: Carrier failover works automatically

#### Kamailio Load Balancer
- [ ] Launch t3.small EC2 for Kamailio
- [ ] Install Kamailio 5.8
- [ ] Configure dispatcher module:
  - [ ] Add both carriers as destinations
  - [ ] Round-robin load balancing
  - [ ] Health checks (OPTIONS ping)
- [ ] Point FreeSWITCH to Kamailio
- [ ] Test: Calls distributed across carriers

#### Multi-Region Deployment
- [ ] Launch infrastructure in us-west-2:
  - [ ] FreeSWITCH EC2
  - [ ] Kamailio EC2
  - [ ] PostgreSQL read replica
- [ ] Set up Route53 health checks
- [ ] Implement automatic failover (RTO <15 min)
- [ ] Test: us-east-1 down → traffic routes to us-west-2

**Ask Claude:** "Let's set up multi-carrier with Telnyx and Kamailio load balancer for Week 31"

---

### Week 32: Security & Compliance

#### Audit Logging ✅ COMPLETE
- [x] **Audit Logging System** - Comprehensive audit trail for security & compliance
  - [x] Create `audit_logs` table (user, action, resource, timestamp)
  - [x] Create `security_events` table (failed logins, rate limits)
  - [x] Create `data_access_logs` table (PII/PHI compliance)
  - [x] Create `admin_activity_logs` table (privileged actions)
  - [x] Automatic API request logging with middleware
  - [x] Failed login detection (brute force monitoring)
  - [x] Sensitive data access reporting
  - [x] Views for common security queries
  - [x] Functions for automatic cleanup and event logging
  - [x] Retention policies (365 days for audit, forever for security)
  - [x] 9 REST API endpoints for audit querying

#### Call Recording Encryption
**📖 Reference:** [Call Recording Encryption](project_bible/IRIS_Call_Recording_Encryption_Security.md)

- [ ] Implement AES-256-GCM encryption for recordings
- [ ] Integrate AWS KMS for key management
- [ ] Per-tenant encryption keys
- [ ] Encrypt before uploading to R2
- [ ] Secure playback (signed URLs, 15-min TTL)
- [ ] Test: Recording encrypted, playback works

#### STIR/SHAKEN
- [ ] Request STIR/SHAKEN certificate from carrier
- [ ] Configure FreeSWITCH to add attestation
- [ ] Test: Outbound calls show verified caller ID

#### SOC 2 Readiness
- [ ] Complete SOC 2 readiness assessment
- [ ] Implement required controls:
  - [ ] Access control (RBAC implemented ✅)
  - [ ] Encryption (at rest ✅, in transit ✅)
  - [ ] Audit logging (implemented ✅)
  - [ ] Incident response plan (written)
  - [ ] Disaster recovery plan (written)
  - [ ] Vulnerability scanning (monthly)
  - [ ] Penetration testing (annual)
- [ ] Document all controls
- [ ] Hire SOC 2 auditor (Vanta or Drata)

#### Penetration Testing
- [ ] Hire security firm (or use HackerOne)
- [ ] Scope: API, Portal, FreeSWITCH
- [ ] Fix all critical/high vulnerabilities
- [ ] Retest after fixes
- [ ] Test: No critical/high issues remaining

**Ask Claude:** "Let's implement call recording encryption and audit logging for Week 32"

---

**✅ PHASE 5 COMPLETE:** Enterprise-ready, first enterprise customer signed!

**Exit Criteria:**
- [ ] Multi-carrier failover working
- [ ] Multi-region RTO <15 minutes
- [ ] Call recordings encrypted
- [ ] SOC 2 controls implemented
- [ ] Penetration test passed
- [ ] First enterprise customer ($5K+/mo)
- [ ] MRR >$10,000

---

## PHASE 6: ADVANCED FEATURES (Weeks 33-34)
**📖 Reference:** [AI Conversation Intelligence](project_bible/IRIS_AI_Conversation_Intelligence.md), [Video Calling](project_bible/IRIS_Video_Calling_Screen_Sharing.md)

### Week 33: AI Features

#### Real-Time Transcription
- [ ] Integrate Deepgram streaming API
- [ ] Tap audio from FreeSWITCH (RTP stream)
- [ ] Stream to Deepgram via WebSocket
- [ ] Receive transcription in real-time (<1 sec latency)
- [ ] Display in agent desktop (live captions)
- [ ] Test: Transcription accuracy >95%

#### GPT-4 Call Summarization
- [ ] After call ends, send transcript to GPT-4
- [ ] Prompt: "Summarize this call in 2-3 sentences"
- [ ] Store summary in `cdr` table
- [ ] Display in call logs (Vue 3)
- [ ] Test: Summary accurate and concise

#### Sentiment Analysis
- [ ] Use GPT-4 to analyze sentiment (positive, neutral, negative)
- [ ] Score 1-5 stars
- [ ] Store in `cdr` table
- [ ] Display in analytics dashboard
- [ ] Alert if sentiment < 2 stars (angry customer)
- [ ] Test: Sentiment detection works

#### Topic Extraction
- [ ] Use GPT-4 to extract topics (billing, technical support, sales)
- [ ] Tag call with topics
- [ ] Search calls by topic
- [ ] Test: Topic extraction accurate

#### AI Conversation Intelligence Dashboard (Vue 3)
- [ ] Build AI insights page:
  - [ ] Sentiment trend (chart)
  - [ ] Top topics (bar chart)
  - [ ] Low-scoring calls (table)
  - [ ] Agent performance (avg sentiment per agent)
- [ ] Test: Dashboard shows insights

**Ask Claude:** "Let's implement real-time transcription with Deepgram and GPT-4 summarization for Week 33"

---

### Week 34: Video Calling & Final Polish

#### MediaSoup SFU Setup
- [ ] Launch t3.large EC2 for MediaSoup
- [ ] Install MediaSoup server
- [ ] Configure WebRTC transport
- [ ] Test: Video call between 2 browsers

#### Video Calling API
- [ ] POST /v1/video-rooms (create video room)
- [ ] GET /v1/video-rooms/:id/token (join token)
- [ ] WebRTC signaling via WebSocket
- [ ] Test: 1-on-1 video call works

#### Screen Sharing
- [ ] Implement screen sharing (getDisplayMedia API)
- [ ] Share screen in video call
- [ ] Test: Screen sharing works

#### Video UI (Vue 3)
- [ ] Build video call component
- [ ] Participant grid (up to 9 participants)
- [ ] Screen sharing view
- [ ] Controls (mute video, mute audio, share screen, hang up)
- [ ] Test: Video call functional

#### Final UI Polish
- [ ] Review all pages for consistency
- [ ] Fix any UI bugs
- [ ] Improve loading states
- [ ] Add animations/transitions
- [ ] Mobile responsiveness check
- [ ] Accessibility audit (WCAG 2.1 AA)

#### Performance Optimization
- [ ] Frontend:
  - [ ] Code splitting (lazy load routes)
  - [ ] Image optimization
  - [ ] Bundle size reduction
  - [ ] Lighthouse score >90
- [ ] Backend:
  - [ ] Query optimization (add indexes)
  - [ ] N+1 query fixes
  - [ ] Redis caching
  - [ ] Response time <200ms (p95)

**Ask Claude:** "Let's implement video calling with MediaSoup and do final UI polish for Week 34"

---

**✅ PHASE 6 COMPLETE:** Platform feature-complete! Ready for production launch.

**Exit Criteria:**
- [ ] AI features working (transcription, summaries, sentiment)
- [ ] Video calling functional (1-on-1 and multi-party)
- [ ] Screen sharing works
- [ ] All UI polished and responsive
- [ ] Performance targets met
- [ ] Accessibility audit passed
- [ ] MRR >$25,000

---

## POST-LAUNCH: ONGOING (Week 35+)

### Production Operations
- [ ] Monitor uptime (target 99.95%)
- [ ] Monitor error rates (target <0.1%)
- [ ] Monitor response times (p95 <500ms)
- [ ] Weekly incident review
- [ ] Monthly disaster recovery drill

### Customer Success
- [ ] Onboard new customers (weekly)
- [ ] Quarterly business reviews (enterprise customers)
- [ ] NPS surveys (monthly)
- [ ] Feature requests (prioritize quarterly)

### Feature Roadmap
- [ ] Workforce management (forecasting, scheduling)
- [ ] Advanced IVR (natural language understanding)
- [ ] CRM integrations (Salesforce, HubSpot)
- [ ] Mobile SDKs (iOS, Android)
- [ ] WhatsApp Business API
- [ ] RCS messaging
- [ ] International expansion (EMEA, APAC)

---

## Summary

**Total Timeline:** 34 weeks (8 months) + 1 week prep = 35 weeks

**Team:** 5-6 people

**Tech Stack:**
- Frontend: Vue 3.5 + Vite 6 + Tailwind CSS 4
- Backend: Node.js 22 + Hono.js
- Database: PostgreSQL (Neon → Aurora)
- Cache: Redis (Upstash → ElastiCache)
- Media: FreeSWITCH on AWS EC2

**Costs:**
- Phase 0: $50/mo
- Phase 1-3: $200-500/mo
- Phase 4-6: $800-1,500/mo
- Production: $5,000-10,000/mo (at scale)

**Revenue Targets:**
- Week 12 (Beta): $0 MRR (free beta)
- Week 26: $1,000 MRR
- Week 30: $5,000 MRR
- Week 32: $10,000 MRR
- Week 34: $25,000 MRR

---

## How to Work with Claude

**When you're ready to start a task, tell Claude:**

> "Let's work on Week X, Task Y. Please help me implement Z."

**Example:**
> "Let's work on Week 2, Database Schema. Please help me create the PostgreSQL migration files for the tenants, users, and calls tables."

**Claude will:**
1. Review the relevant documentation
2. Ask clarifying questions if needed
3. Generate code for you
4. Test the code
5. Update this checklist when done

**After each task:**
- Test thoroughly
- Commit to Git
- Deploy to dev environment
- Mark checkbox as complete `[x]`

---

**🚀 Ready to start? Tell me which task you want to work on first!**
