# IRIS Multi-Channel Communications Platform

> **Next-generation unified communications platform: Voice + SMS + Email + Social from ONE API**

---

## 🚨 **IF CLAUDE CRASHES - START HERE**

**To recover context and continue building:**

```
Say to new Claude: "Read SESSION_RECOVERY.md and let's continue building IRIS"
```

**Or to start a specific task:**

```
Say to new Claude: "Read SESSION_RECOVERY.md, then work on Week 2: Database Schema"
```

### **Critical Recovery Files:**

1. 📄 **[SESSION_RECOVERY.md](SESSION_RECOVERY.md)** ⭐ **READ THIS FIRST** - Complete context (5 min)
2. 📋 **[00_MASTER_CHECKLIST.md](00_MASTER_CHECKLIST.md)** - 500+ tasks organized by week
3. 📊 **[00_TECH_STACK_SUMMARY.md](00_TECH_STACK_SUMMARY.md)** - Final tech decisions
4. 📚 **[project_bible/](project_bible/)** - 25 comprehensive implementation guides

---

## 🚀 Quick Start

### **For New Developers:**

1. Read **[SESSION_RECOVERY.md](SESSION_RECOVERY.md)** (5 minutes)
2. Review **[00_TECH_STACK_SUMMARY.md](00_TECH_STACK_SUMMARY.md)** (2 minutes)
3. Open **[00_MASTER_CHECKLIST.md](00_MASTER_CHECKLIST.md)** (your todo list)
4. Ask Claude: "What should we work on next?"

### **For Returning to Project:**

```
Say to Claude: "Read SESSION_RECOVERY.md. Where did we leave off?"
```

---

## 📋 Project Status

**Phase:** Phase 0 - Foundation ✅ **COMPLETE**
**Current:** Phase 1 - Core Features (In Progress)
**Completed:**
- ✅ AWS Infrastructure (VPC, RDS, Redis, S3)
- ✅ Node.js API Server (Hono.js)
- ✅ Database Schema (34 tables)
- ✅ **Voice/Telephony Platform (Production Ready)**
  - Inbound/outbound calling
  - IVR system with DTMF navigation
  - Call recording with S3 storage
  - FreeSWITCH + Twilio integration
- ✅ **SMS/MMS Messaging (Complete)**
  - Send/receive SMS via REST API
  - MMS support with media attachments
  - Delivery tracking
- ✅ **Multi-Tenant Architecture (Enterprise-Grade)**
  - Concurrent call limits per tenant
  - API rate limiting (minute + hour)
  - Usage metering for billing
- ✅ **Dual-Layer Payment System**
  - Platform payments (IRISX revenue)
  - Tenant payments (marketplace model)
  - Tilled/Stripe/PayPal support
- ✅ **Auto-Scaling Architecture (Documented)**
- ✅ **Webhook Notification System (Deployed)**
  - HMAC-SHA256 signed webhooks
  - Exponential backoff retry logic
  - 25+ event types (call, SMS, email, system)
  - Real-time delivery tracking
  - 9 REST API endpoints
- ✅ **Email API System (Deployed)**
  - **Primary Provider: Elastic Email** ($0.09 per 1,000 emails)
  - Multi-provider support (Elastic Email, SendGrid, Resend, AWS SES, Postmark, Mailgun)
  - Easy provider switching via tenant configuration
  - Template engine with {{variable}} substitution
  - Open/click tracking, bounce/unsubscribe handling
  - 13 REST API endpoints, 10 database tables
  - Suppression lists

- ✅ **NATS JetStream Queue System (Deployed)**
  - Persistent message queue for SMS, Email, Webhooks
  - 3 streams with 7-day retention
  - Automatic retry logic (5 attempts)
  - Horizontal scaling ready
  - 3 workers deployed (SMS, Email, Webhook)

- ✅ **Analytics API System (Deployed)**
  - Real-time dashboard metrics
  - Call/SMS/Email analytics with time series
  - Usage tracking for billing
  - Webhook delivery monitoring

- ✅ **Contact Management API (Deployed)**
  - Full contact CRUD operations
  - Tag-based organization
  - Custom fields per tenant (JSONB)
  - Contact lists and segmentation
  - Activity timeline tracking
  - Bulk import support
  - DNC/opt-in compliance flags
  - 17 REST API endpoints

- ✅ **Queue & Agent Management System (Deployed)**
  - Redis-based real-time queue management
  - Agent presence tracking with heartbeat
  - Advanced routing strategies:
    - Round-robin (longest waiting)
    - Longest-idle agent
    - Skills-based routing (match caller needs to agent skills)
    - Sticky agent (route repeat callers to same agent)
  - Queue statistics and metrics (EWT, service level)
  - Priority queuing support (1-10 priority levels)
  - Queue overflow handling (automatic timeout)
  - Agent performance tracking
  - Queue member management (enqueue/dequeue)
  - 23 REST API endpoints (13 queue + 10 agent)

- ✅ **TTS (Text-to-Speech) System (Deployed)**
  - Multi-provider: OpenAI ($0.015/1K), ElevenLabs ($0.30/1K), AWS Polly
  - Automatic provider failover
  - Caching layer for cost optimization
  - Cost tracking per tenant
  - 3 REST API endpoints

- ✅ **IVR + TTS Integration (Deployed)**
  - Dynamic speech generation in IVR menus
  - Support for static files, inline TTS, and full TTS objects
  - Automatic caching for repeated prompts
  - Multi-provider TTS selection per menu

- ✅ **IVR Management API (Deployed)**
  - Full CRUD for IVR menus and options
  - Active session monitoring
  - IVR analytics and reporting
  - 11 REST API endpoints

- ✅ **Campaign Management System (Deployed)**
  - Bulk SMS/Email/Voice campaign orchestration
  - Template engine with {{variable}} substitution
  - Contact list targeting with filtering
  - Rate limiting and scheduling support
  - Campaign analytics and performance tracking
  - Link click tracking for campaigns
  - Global unsubscribe management
  - Recipient-level status tracking
  - 8 REST API endpoints
  - 9 database tables

- ✅ **Billing & Rating Engine (Deployed)**
  - International rate tables with LCR (Least Cost Routing)
  - Automatic call cost calculation with database triggers
  - Usage tracking (daily/monthly aggregation)
  - Spend limits with alert thresholds
  - Invoice generation and management
  - Payment method storage (Stripe-ready)
  - Monthly billing summaries
  - 10 database tables with views
  - 19 REST API endpoints

- ✅ **API Documentation System (Complete)**
  - OpenAPI 3.0 specification for all 154 endpoints
  - Interactive Swagger UI at `/docs`
  - Complete request/response schemas
  - Authentication and rate limit documentation
  - Webhook signature verification guide
  - Production-ready developer portal

**Next:** Admin dashboard (Vue 3), Load testing, SSL/TLS setup
**Timeline:** 34 weeks to production launch
**Current:** Week 23 of 34 (68% complete) 🚀
**Startup Cost:** ~$71-86/mo (no change)
**API Endpoints:** 154 production-ready endpoints
**API Documentation:** https://api.irisx.io/docs
**Latest Session:** [FINAL_SESSION_SUMMARY_OCT29.md](docs/FINAL_SESSION_SUMMARY_OCT29.md) ⭐ **EPIC SESSION**
**See Also:** [PHASE_0_COMPLETE_SUMMARY.md](docs/infrastructure/PHASE_0_COMPLETE_SUMMARY.md)

---

## 🛠️ Tech Stack (FINAL)

**Frontend:**
- Vue 3.5 + Vite 6 + Tailwind CSS 4
- Hosted on Vercel (free)

**Backend:**
- Node.js 22 + Hono.js
- AWS EC2 t3.medium ($30/mo)

**Database:**
- AWS RDS PostgreSQL ($15/mo)
- AWS ElastiCache Redis ($12/mo)

**Storage:**
- AWS S3 + CloudFront ($5/mo)

**Real-time:**
- Firebase (push notifications + agent presence)

**Telephony:**
- FreeSWITCH on EC2
- Twilio + Telnyx carriers

**Total: ~$70/mo infrastructure**

---

## 📚 Documentation Structure

```
IRISX/
├── SESSION_RECOVERY.md              ⭐ Start here if Claude crashes
├── 00_MASTER_CHECKLIST.md           ⭐ 500+ tasks to build
├── 00_TECH_STACK_SUMMARY.md         ⭐ Tech decisions
├── DEVELOPMENT_CHECKLIST.md         (same as 00_MASTER_CHECKLIST)
├── TECH_STACK_FINAL.md              (same as 00_TECH_STACK_SUMMARY)
│
├── project_bible/                   📚 25 comprehensive guides
│   ├── 01_START_HERE_Tech_Stack_Development_Order.md
│   ├── 02_README_Platform_Overview.md
│   ├── 03_Multi_Channel_Architecture.md
│   ├── 04_Data_Import_Contact_API.md
│   ├── IRIS_Authentication_Identity_RBAC.md
│   ├── IRIS_Campaign_Management.md
│   ├── IRIS_Analytics_Reporting.md
│   ├── IRIS_Billing_Payments.md
│   ├── IRIS_Media_Processing_TTS_STT.md
│   ├── IRIS_Call_Recording_Encryption_Security.md
│   ├── IRIS_Video_Calling_Screen_Sharing.md
│   ├── IRIS_AI_Conversation_Intelligence.md
│   └── ... 17 more comprehensive docs
│
└── (backend, frontend, infrastructure repos - not created yet)
```

---

## 🎯 What is IRIS?

**The platform Twilio + SendGrid + Hootsuite *should* have been:**

### Channels Supported:
- 📞 **Voice** - Calls, IVR, queues, recording
- 💬 **SMS/MMS** - Multi-provider with least-cost routing
- 📧 **Email** - Transactional + bulk email
- 📱 **Social** - Facebook, Twitter, Discord, Telegram, WhatsApp
- 📡 **Push** - iOS & Android push notifications
- 🌐 **In-App** - SDK for mobile/web messaging

### Key Features:
- ✅ **Unified API** - One endpoint, all channels
- ✅ **Multi-Provider** - Automatic failover & least-cost routing
- ✅ **No-Code Builder** - Visual flow builder for non-technical users
- ✅ **Real-Time Analytics** - Live dashboards, call quality monitoring
- ✅ **AI-Powered** - GPT-4 call summaries, sentiment analysis
- ✅ **Enterprise Ready** - SOC 2, HIPAA, multi-region

---

## 💰 Pricing Model

**Startup Phase:** $70/mo infrastructure
**At Scale:** $2,000/mo for 10,000 concurrent calls
**Revenue:** $0.05/min × 10min × 30K calls/day = $15K/day
**Margin:** 95%+ on infrastructure

---

## 📅 Development Timeline

**Phase 0 (Week 1-4):** Foundations
- AWS setup, database schema, FreeSWITCH, basic API

**Phase 1 (Week 5-12):** Core Calling
- TTS, webhooks, customer portal → **BETA LAUNCH**

**Phase 2 (Week 13-18):** Queues & Agents
- Call center ACD, WebRTC softphone, agent desktop

**Phase 3 (Week 19-26):** Campaigns & Billing
- Dialer, campaigns, billing system

**Phase 4 (Week 27-30):** Multi-Channel
- SMS, email, social media APIs

**Phase 5 (Week 31-32):** Enterprise
- Multi-carrier, multi-region, SOC 2

**Phase 6 (Week 33-34):** Advanced
- AI features, video calling → **PRODUCTION LAUNCH**

---

## 🤝 Team

**Project Owner:** Ryan
**Company:** TechRadium (20+ years in telecom)
**AI Assistant:** Claude (Anthropic)
**Development Approach:** AI-assisted development (Ryan + Claude)

---

## 🆘 Getting Help

### If Claude Crashes:
1. Open new Claude session
2. Upload **SESSION_RECOVERY.md**
3. Say: "Read this and continue where we left off"

### If Stuck on a Task:
1. Say: "Read SESSION_RECOVERY.md"
2. Say: "Let's work on [task name from checklist]"
3. Claude will read relevant docs and help

### If Starting Fresh:
1. Read **SESSION_RECOVERY.md** (you, not Claude)
2. Read **00_TECH_STACK_SUMMARY.md**
3. Open **00_MASTER_CHECKLIST.md**
4. Ask Claude: "What's the first task?"

---

## ✅ What's Been Done

✅ Complete platform planning (25 docs, 1,100+ pages)
✅ Tech stack finalized (AWS + Firebase + Hono.js + Vue 3.5)
✅ Development order organized (34 weeks, 500+ tasks)
✅ Cost model defined (~$70/mo startup)
✅ Architecture diagrams created
✅ Database schemas designed
✅ API specifications written

**Ready to start building! 🚀**

---

## 📖 Key Documentation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [SESSION_RECOVERY.md](SESSION_RECOVERY.md) | Quick context for Claude if crash | 5 min |
| [00_MASTER_CHECKLIST.md](00_MASTER_CHECKLIST.md) | 500+ tasks organized by week | Reference |
| [00_TECH_STACK_SUMMARY.md](00_TECH_STACK_SUMMARY.md) | Final tech decisions | 2 min |
| [project_bible/01_START_HERE_Tech_Stack_Development_Order.md](project_bible/01_START_HERE_Tech_Stack_Development_Order.md) | Complete tech stack + dev order | 15 min |
| [project_bible/02_README_Platform_Overview.md](project_bible/02_README_Platform_Overview.md) | Platform overview | 10 min |
| [project_bible/03_Multi_Channel_Architecture.md](project_bible/03_Multi_Channel_Architecture.md) | Multi-channel architecture | 30 min |

---

## 🚀 Ready to Build

**Tell Claude:**

> "Read SESSION_RECOVERY.md and let's start Phase 0, Week 1"

Or:

> "Read SESSION_RECOVERY.md. What should we work on first?"

**Let's go! 🎯**
