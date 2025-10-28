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

## Current Status

**Phase:** Pre-development (planning complete)
**Next Step:** Start Phase 0, Week 1 (infrastructure setup)
**Team:** Ryan + Claude (AI-assisted development)

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
├── 00_TECH_STACK_SUMMARY.md         ← Quick reference
├── 00_MASTER_CHECKLIST.md           ← 500+ tasks to build
├── SESSION_RECOVERY.md              ← This file
├── DEVELOPMENT_CHECKLIST.md         ← Same as master checklist
├── TECH_STACK_FINAL.md              ← Same as summary
├── project_bible/
│   ├── 01_START_HERE_Tech_Stack_Development_Order.md  ← Read this
│   ├── 02_README_Platform_Overview.md
│   ├── 03_Multi_Channel_Architecture.md
│   ├── 04_Data_Import_Contact_API.md
│   └── [23 more comprehensive docs]
└── (backend, frontend, infrastructure repos - not created yet)
```

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

✅ Complete platform planning (25 comprehensive documents, 1,100+ pages)
✅ Tech stack finalized (AWS + Firebase + Hono.js + Vue 3.5)
✅ Development order organized (6 phases, 34 weeks, 500+ tasks)
✅ Cost model defined (~$70/mo startup → scales linearly)
✅ Architecture diagrams created
✅ Database schemas designed
✅ API specifications written

**Ready to start building!**

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
