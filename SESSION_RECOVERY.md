# Claude Session Recovery - IRIS Project

**Use this file if Claude crashes or you start a new session**

---

## Quick Context for Claude

> "I'm building IRIS, a multi-channel communications platform (voice, SMS, email, social). We just finalized the tech stack. I need you to help me build it following the master checklist."

---

## Tech Stack (FINAL - DO NOT CHANGE)

**Frontend:**
- Vue 3.5 + Vite 6 + Tailwind CSS 4
- Hosted on Vercel (free)

**Backend:**
- Node.js 22 + Hono.js
- Hosted on AWS EC2 t3.medium ($30/mo)

**Database & Cache:**
- AWS RDS PostgreSQL db.t4g.micro ($15/mo)
- AWS ElastiCache Redis cache.t4g.micro ($12/mo)

**Storage:**
- AWS S3 + CloudFront ($5/mo)

**Real-time:**
- Firebase FCM (push notifications)
- Firebase Realtime DB (agent presence)

**Telephony:**
- FreeSWITCH on EC2 (same box as API)
- Twilio + Telnyx (carriers)

**Total Startup Cost: ~$70/mo**

---

## Key Files (Read These First)

In order of importance:

1. **[00_TECH_STACK_SUMMARY.md](00_TECH_STACK_SUMMARY.md)** - Final tech decisions (2 min read)
2. **[00_MASTER_CHECKLIST.md](00_MASTER_CHECKLIST.md)** - 500+ tasks organized by week
3. **[project_bible/01_START_HERE_Tech_Stack_Development_Order.md](project_bible/01_START_HERE_Tech_Stack_Development_Order.md)** - Complete tech stack + development order
4. **[project_bible/02_README_Platform_Overview.md](project_bible/02_README_Platform_Overview.md)** - Platform overview

---

## What We Decided

### ✅ YES - Use These:
- AWS (single vendor for infrastructure)
- Firebase (push notifications + real-time presence only)
- Hono.js (faster than Express, AI-friendly)
- Vue 3.5 (Ryan's preference)
- Node.js 22 (Ryan's preference)

### ❌ NO - Don't Use These:
- Cloudflare Workers (can't run telephony)
- Cloudflare R2 (using S3 instead)
- Neon Postgres (using RDS instead)
- Upstash Redis (using ElastiCache instead)
- Express.js (using Hono.js instead)

---

## Current Status - UPDATED OCT 30, 2025

**WE ARE AT WEEK 26 OF 34 (76% complete)**

**Current Phase:** PHASE 1 - Core Calling & Webhooks (Weeks 5-12)
**Current Week:** Week 9-10 - Webhooks & Customer Portal
**Focus:** Building Customer Portal (Vue 3) - Frontend development begins

**Overall Progress:** Phase 1 backend ~85% done, Frontend 0% (starting now)

### ✅ What's Complete:
- **Infrastructure:** AWS fully deployed (API, DB, Redis, FreeSWITCH, NATS all running)
- **Backend:** 25/25 routes, 25/25 services, 24 migrations
- **Auth API:** Complete with JWT, bcrypt (deployed Oct 30)
- **Multi-carrier LCR:** Voice routing with cost optimization
- **Multi-provider:** SMS/Email routing
- **Workers:** 5/5 workers 100% COMPLETE ✅
  - email-worker.js ✅
  - sms-worker.js ✅
  - webhook-worker.js ✅
  - orchestrator.js ✅ (321 lines - API→NATS→FreeSWITCH)
  - cdr.js ✅ (338 lines - CDR collection for billing)

### 🔄 In Progress (Oct 30, 2025 - 5:25 AM):
- **Customer Portal:** Building authentication UI (Login.vue, Signup.vue)
- **Completed:** Auth store (Pinia), API client utility, project structure
- **Next:** Vue Router setup, dashboard pages (home, API keys, webhooks, call logs)
- **Note on phone testing:** Requires carrier SIP configuration (Twilio/Telnyx credentials + FreeSWITCH gateway setup)

### ✅ Just Completed (Last 30 minutes):
- **orchestrator.js worker:** ✅ FULLY OPERATIONAL
  - Connected to FreeSWITCH ESL (54.160.220.243:8021)
  - Connected to NATS with token auth (localhost:4222)
  - Consumer subscribed to calls.> subject (workqueue mode)
  - Listening for call requests and processing FreeSWITCH events
  - Fixed NATS v2.29.3 pullSubscribe consumer config API
- **cdr.js worker:** ✅ FULLY OPERATIONAL
  - Connected to FreeSWITCH ESL (54.160.220.243:8021)
  - Connected to NATS with token auth (localhost:4222)
  - Subscribed to CHANNEL_HANGUP events
  - Collecting CDR records for billing and analytics
  - Publishing CDR events to NATS events stream

### ❌ What's Missing:
- **Customer Portal:** 0% (Vue 3 dashboard for customers)
- **Agent Desktop:** 0% (Vue 3 with WebRTC softphone)
- **Platform Admin Dashboard:** 5% (Vue 3 for IRISX staff)
- **Social channels:** Discord, Teams, WhatsApp, Slack, Telegram

**Next Step:** Deploy cdr.js worker, test end-to-end call, then start Customer Portal (Week 9-10)
**Team:** Ryan + Claude

**📊 Full Audit:** See docs/COMPLETE_AUDIT_OCT30.md

---

## How to Resume

### If Claude forgets context, say:

> "Read SESSION_RECOVERY.md and then let's continue from [task name] in the master checklist"

### To start fresh:

> "Read SESSION_RECOVERY.md. Let's start Phase 0, Week 1: AWS infrastructure setup"

### To jump to specific task:

> "Read SESSION_RECOVERY.md. Let's work on Week 2: PostgreSQL database schema"

---

## Important Notes

1. **Don't suggest architecture changes** - Stack is finalized
2. **Follow the checklist order** - Items are ordered by dependencies
3. **Hono.js is confirmed** - We chose it over Express for AI-assisted development
4. **AWS + Firebase only** - No other vendors
5. **Start cost is ~$70/mo** - Startup phase infrastructure

---

## Project Structure

```
IRISX/
├── README.md                        ← Project overview
├── SESSION_RECOVERY.md              ← This file (session context)
├── 00_TECH_STACK_SUMMARY.md         ← Quick reference
├── 00_MASTER_CHECKLIST.md           ← 500+ tasks to build
├── docs/                            ← Organized documentation
│   ├── infrastructure/              ← AWS, EC2, networking docs
│   │   ├── AWS_COST_STRATEGY.md
│   │   ├── AWS_INFRASTRUCTURE_SUMMARY.md
│   │   ├── AWS_NAMING_CONVENTIONS.md
│   │   ├── EC2_INSTANCES_SUMMARY.md
│   │   └── PHASE_0_WEEK_1_COMPLETE.md
│   ├── database/                    ← Database docs
│   │   ├── DATABASE_SCHEMA.md
│   │   ├── DATABASE_STRATEGY.md
│   │   └── DATABASE_MIGRATION_NOTES.md
│   ├── security/                    ← Security documentation
│   │   ├── SECURITY_ARCHITECTURE.md
│   │   └── SECURITY_UPDATE_PHASE1.md
│   └── api/                         ← API documentation
│       └── API_SETUP_COMPLETE.md
├── database/                        ← SQL migrations & seeds
│   ├── migrations/
│   │   └── 001_create_core_tables.sql
│   └── seeds/
│       └── 001_sample_data.sql
├── project_bible/                   ← Planning docs (25 files)
│   ├── 01_START_HERE_Tech_Stack_Development_Order.md
│   ├── 02_README_Platform_Overview.md
│   └── [23 more comprehensive docs]
└── aws-infrastructure-ids.txt       ← AWS resource IDs
```

**GitHub Repos Created:**
- `irisx-infrastructure` - This repo (AWS, docs, scripts)
- `irisx-backend` - Not created yet (will be Hono.js API)
- `irisx-frontend` - Not created yet (will be Vue 3.5)
- `irisx-docs` - Not created yet (will be public docs)

---

## Quick Commands for Claude

**When starting a new session:**
1. "Read SESSION_RECOVERY.md"
2. "What task should we work on next?"
3. Claude will guide you from there

**When resuming specific work:**
1. "Read SESSION_RECOVERY.md"
2. "Let's work on [specific task from checklist]"
3. Claude will read the relevant docs and implement

**When stuck:**
1. "Read SESSION_RECOVERY.md"
2. "What are the key decisions we made?"
3. Claude will summarize from this file

---

## What's Been Done

### Planning Phase (Complete)
✅ Complete platform planning (25 comprehensive documents, 1,100+ pages)
✅ Tech stack finalized (AWS + Firebase + Hono.js + Vue 3.5)
✅ Development order organized (6 phases, 34 weeks, 500+ tasks)
✅ Cost model defined (~$58/mo actual vs $70/mo planned)

### Phase 0, Week 1 (Infrastructure - Complete)
✅ AWS VPC, subnets, Internet Gateway, route tables
✅ Security groups (separate for API and FreeSWITCH)
✅ RDS PostgreSQL db.t4g.micro (ARM-based)
✅ ElastiCache Redis cache.t4g.micro (ARM-based)
✅ S3 bucket for recordings
✅ 2× EC2 t3.small instances (API + FreeSWITCH separated)
✅ Elastic IP for FreeSWITCH (54.160.220.243)
✅ SSH restricted to home IP only (73.6.78.238/32)
✅ Database migrations (10 core tables created)

### Phase 0, Week 2 (Backend API - 100% Complete ✅)
✅ Node.js 22 + npm installed on API server
✅ Hono.js API server with PostgreSQL + Redis connections
✅ PM2 process manager configured with auto-restart
✅ Health check endpoint operational
✅ Database connection pool (20 connections)
✅ Redis caching helpers
✅ API key authentication middleware (SHA-256 hashing)
✅ Rate limiting middleware (10 req/min for calls, 100 for reads)
✅ POST /v1/calls endpoint (create outbound call)
✅ GET /v1/calls/:sid endpoint (get call details)
✅ GET /v1/calls endpoint (list calls with pagination)
✅ Input validation with Zod v3
✅ All endpoints tested and working
✅ Comprehensive API documentation

**Documentation:** All docs organized in `/docs` folder by category!

---

## What's Next

**Phase 0 (Weeks 1-4): Foundations**
- Week 1: AWS setup (RDS, ElastiCache, EC2)
- Week 2: Database schema (PostgreSQL migrations)
- Week 3: FreeSWITCH setup (Packer AMI, Twilio trunk)
- Week 4: Hono.js API (first endpoint working)

**Goal:** First call works end-to-end by Week 4

---

## Contact Info

**Project:** IRIS Multi-Channel Communications Platform
**Owner:** Ryan
**Company:** TechRadium (20+ years in telecom)
**AI Assistant:** Claude (Anthropic)
**Start Date:** TBD
**Target Beta Launch:** Week 12
**Target Production Launch:** Week 34

---

## Remember

- **You (Ryan) + Claude** = Fast development
- **Hono.js** = Chosen because Claude writes better code with it
- **AWS only** = Simpler, one vendor
- **Follow checklist** = Items are ordered correctly
- **$70/mo** = Startup cost (very affordable)

**Let's build! 🚀**
