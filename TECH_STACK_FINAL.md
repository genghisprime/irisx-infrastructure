# IRIS Final Tech Stack - AWS + Firebase + Hono.js

**Version:** 2.0 FINAL
**Date:** 2025-01-15
**Status:** ✅ LOCKED IN - Ready to Build

---

## ✅ Final Decisions

### No Cloudflare
- ❌ Removed Cloudflare Workers (can't run telephony workloads)
- ❌ Removed Cloudflare R2 (use AWS S3 instead)
- ✅ Using AWS for all infrastructure (single vendor)

### Database & Cache
- ✅ **AWS RDS PostgreSQL** (db.t4g.micro, $15/mo) - Not Neon
- ✅ **AWS ElastiCache Redis** (cache.t4g.micro, $12/mo) - Not Upstash
- ✅ Managed services, easy to scale

### Backend Framework
- ✅ **Hono.js** - Confirmed (fast, clean, AI-friendly)
- ✅ **Node.js 22 LTS** - Your preference
- ✅ 3x faster than Express, less boilerplate

### Real-time Features
- ✅ **Firebase** - Push notifications (FCM) + Real-time presence
- ✅ Free tier covers startup phase
- ✅ Saves weeks of WebSocket development

---

## Complete Stack

```
FRONTEND:
- Vue 3.5 + Vite 6 + Tailwind CSS 4
- Hosted on Vercel (free tier)
- Connects to Hono.js API + Firebase

BACKEND:
- Node.js 22 + Hono.js (HTTP framework)
- Hosted on AWS EC2 t3.medium ($30/mo)
- Runs: API + Workers + FreeSWITCH + NATS

DATABASE:
- AWS RDS PostgreSQL db.t4g.micro ($15/mo)
- AWS ElastiCache Redis cache.t4g.micro ($12/mo)

STORAGE:
- AWS S3 + CloudFront ($5/mo)

REAL-TIME:
- Firebase FCM (push notifications) - free
- Firebase Realtime DB (agent presence) - free

TELEPHONY:
- FreeSWITCH on EC2 (same box as API)
- Twilio SIP trunk (primary carrier)
- Telnyx SIP trunk (backup carrier)

EVENT BUS:
- NATS JetStream (self-hosted on EC2)
```

---

## Startup Cost: ~$70/mo

| Item | Cost |
|------|------|
| EC2 t3.medium | $30 |
| RDS PostgreSQL | $15 |
| ElastiCache Redis | $12 |
| S3 + CloudFront | $5 |
| Firebase | $0 |
| Vercel | $0 |
| Domain | $5 |
| **TOTAL** | **$67/mo** |

Plus variable costs: Twilio ($0.011/min), OpenAI TTS/STT (pay-per-use)

---

## Why This Stack

### 1. Single Vendor (AWS)
- One bill
- One security model
- One support contact
- Easier to reason about

### 2. Scales Better Than Cloudflare
- Cloudflare Workers: 50ms CPU limit, can't run telephony
- AWS EC2: Unlimited, persistent connections, perfect for telephony
- Proven by Twilio, Plivo (both use EC2-like architecture)

### 3. Managed Services
- RDS handles backups, failover, upgrades
- ElastiCache handles replication, failover
- Less ops work for you

### 4. Firebase = Free Real-time
- Push notifications: Free vs AWS SNS $0.50/million
- Real-time presence: 5 lines vs 500 lines custom WebSocket
- Saves 2-3 weeks of development time

### 5. Hono.js = AI-Friendly
- Clean, simple code = Claude writes better code
- 3x faster than Express
- TypeScript-first

---

## Scaling Path

### Phase 1: Single Server ($70/mo)
```
1x EC2 t3.medium
- 100 concurrent calls
- 1,000 API req/sec
```

### Phase 2: Horizontal Scaling ($300/mo)
```
ALB + 3x EC2
- 1,000 concurrent calls
- 10,000 API req/sec
```

### Phase 3: Enterprise ($2,000/mo)
```
Multi-region
10x EC2 per region
Aurora Global Database
ElastiCache Cluster Mode
- 10,000+ concurrent calls
- 100,000+ API req/sec
```

**AWS scales linearly with revenue. Pay for what you use.**

---

## What Changed

### Before (Original Plan):
- Cloudflare Workers (API)
- Cloudflare R2 (storage)
- Neon Postgres (database)
- Upstash Redis (cache)
- 3 vendors: AWS + Cloudflare + Neon/Upstash

### After (Final):
- AWS EC2 (API + workers)
- AWS S3 (storage)
- AWS RDS PostgreSQL (database)
- AWS ElastiCache Redis (cache)
- 2 vendors: AWS + Firebase

**Simpler, cheaper, scales better.**

---

## Documentation Updated

✅ [IRIS_Tech_Stack_Development_Order.md](project_bible/IRIS_Tech_Stack_Development_Order.md)
✅ [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md)
✅ [README.md](project_bible/README.md)

All references to Cloudflare/Neon/Upstash removed.
All costs updated to ~$70/mo.

---

## Ready to Start

You can now tell Claude:

> "Let's start Phase 0, Week 1 - set up AWS infrastructure"

Or:

> "Let's work on Week 2 - create the PostgreSQL database schema"

Everything is documented and ready to build! 🚀
