# IRIS X Master Scope of Work v2.0

## Executive Summary

IRIS X delivers a developer-friendly voice platform that combines modern serverless control plane architecture for speed with a FreeSWITCH media core on AWS for power and scale. Starting with a minimal footprint (under $200/month) leveraging existing Twilio trunk capacity (40-60 CPS), the platform grows incrementally as customers migrate. A durable event bus, Redis-backed queues, and a paced orchestrator allow ingestion of millions of call jobs with controlled launch rates across multiple carriers. Real-time dashboards, strong security, and a clear path to compliance and multi-region operation make the platform ready for enterprise and public sector clients.

**Key Innovation:** Start small, scale smart. Single t3.medium EC2 instance handles media + orchestration for first 100 concurrent channels. Add capacity only when revenue justifies it.

---

## Table of Contents

1. [Objective](#1-objective)
2. [Glossary](#2-glossary)
3. [Core Technology Stack](#3-core-technology-stack)
4. [Platform Choice Rationale](#4-platform-choice-rationale)
5. [High Level Architecture](#5-high-level-architecture)
6. [Architecture Diagrams](#6-architecture-diagrams)
7. [Startup Phase: Under $200/Month](#7-startup-phase-under-200month)
8. [Cost Model & Unit Economics](#8-cost-model--unit-economics)
9. [Major Modules and Deliverables](#9-major-modules-and-deliverables)
10. [Event and Data Flow](#10-event-and-data-flow)
11. [High Volume Handling and Scaling](#11-high-volume-handling-and-scaling)
12. [API Surface v1](#12-api-surface-v1)
13. [API Versioning Strategy](#13-api-versioning-strategy)
14. [Data Model](#14-data-model)
15. [Infrastructure and Deployment](#15-infrastructure-and-deployment)
16. [Observability, SLOs, and KPIs](#16-observability-slos-and-kpis)
17. [Observability Dashboard Specifications](#17-observability-dashboard-specifications)
18. [Security and Compliance Controls](#18-security-and-compliance-controls)
19. [Fraud Detection and Prevention](#19-fraud-detection-and-prevention)
20. [Disaster Recovery Procedures](#20-disaster-recovery-procedures)
21. [Acceptance Criteria](#21-acceptance-criteria)
22. [Risks and Mitigations](#22-risks-and-mitigations)
23. [Build vs Buy Analysis](#23-build-vs-buy-analysis)
24. [Dependencies and Assumptions](#24-dependencies-and-assumptions)
25. [Firebase to AWS Migration Path](#25-firebase-to-aws-migration-path)
26. [Roles and RACI Matrix](#26-roles-and-raci-matrix)
27. [Order of Development](#27-order-of-development)
28. [Testing Strategy](#28-testing-strategy)
29. [Go-to-Market Strategy](#29-go-to-market-strategy)
30. [Competitive Differentiation](#30-competitive-differentiation)
31. [Operational Runbooks](#31-operational-runbooks)
32. [Documentation and Handover](#32-documentation-and-handover)

---

## 1. Objective

Build a multi-tenant, API-driven voice platform that allows developers and utilities to create call flows, dialers, and queue systems using IRIS X infrastructure. The system must scale across many tenants, expose clean REST and WebSocket APIs, support text-to-speech or audio playback, queues, dialers, recording, analytics, and billing, and feel as easy to build on as Twilio while remaining vendor-controlled.

**Core principle:** Start with existing Twilio trunk (40-60 CPS capacity), minimize infrastructure costs, and scale incrementally as customer revenue grows.

---

## 2. Glossary

- **CPS:** Calls per second
- **CDR:** Call detail record
- **EWT:** Estimated wait time
- **SLA:** Service level agreement
- **ASR:** Answer seizure ratio (% of calls answered)
- **ACD:** Average call duration
- **AHT:** Average handle time (for queue systems)
- **TTS:** Text to speech
- **STT:** Speech to text
- **DNC:** Do not call list
- **AMD:** Answering machine detection
- **STIR/SHAKEN:** Secure Telephone Identity standards
- **LNP:** Local number portability
- **LOA:** Letter of authorization (for number porting)
- **CSR:** Customer service record
- **FOC:** Firm order commitment (porting completion date)
- **RTP:** Real-time transport protocol (audio/video streams)
- **SIP:** Session initiation protocol
- **PSTN:** Public switched telephone network
- **DID:** Direct inward dialing (phone number)
- **E.164:** International phone number format (+1XXXYYYZZZZ)
- **MOS:** Mean opinion score (audio quality 1-5)
- **PESQ:** Perceptual evaluation of speech quality
- **RPO:** Recovery point objective (max acceptable data loss)
- **RTO:** Recovery time objective (max acceptable downtime)
- **mTLS:** Mutual TLS (two-way certificate authentication)
- **HMAC:** Hash-based message authentication code
- **JWT:** JSON web token
- **CORS:** Cross-origin resource sharing
- **IAM:** Identity and access management
- **KMS:** Key management service
- **SSM:** Systems Manager (AWS)
- **NLB:** Network load balancer
- **ASG:** Auto scaling group

---

## 3. Core Technology Stack

### Modern Stack (2025)

| Layer | Technology | Purpose | Why This Choice |
|---|---|---|---|
| **Portal & Console** | Vue 3.5, Vite 6, Tailwind CSS 4, Vercel or Firebase Hosting | Developer and admin UI, dashboards, visual flow builder | Latest Vue with Vapor mode, Tailwind v4 performance, free hosting tier |
| **Control Plane Backend** | Node.js 22 LTS, Hono.js, Cloudflare Workers or AWS Lambda | REST and WebSocket APIs, event dispatcher | Hono is fastest Node framework (2024), edge deployment, $0-5/mo to start |
| **WebSocket Server** | Bun 1.1+ with WebSockets, or PartyKit | Real-time agent presence, live dashboards | Native WebSocket support, 3x faster than Node |
| **Data Stores - Startup** | SQLite (Turso) or Neon Postgres Serverless, Upstash Redis | All data (replaces Aurora + Redis initially) | Free tiers: Turso 9GB, Neon 0.5GB, Upstash 10K commands/day |
| **Data Stores - Scale** | Neon Postgres or PlanetScale, Upstash Redis (paid tier) | Move from serverless free tiers when >10K calls/day | $20-50/mo range, autoscaling included |
| **Data Stores - Enterprise** | Aurora PostgreSQL Serverless v2, ElastiCache Redis | High-availability multi-region setup | Only when >100K calls/day and compliance demands it |
| **Analytics** | ClickHouse Cloud (free tier) or Tinybird | Real-time CDR analytics, dashboards | ClickHouse free tier: 1TB ingestion/month |
| **Media Plane** | FreeSWITCH 1.10.12+ on AWS EC2 t3.medium (startup) → c7i.4xlarge (scale) | SIP, RTP, bridging, queues, recording | t3.medium = $30/mo, handles 100 concurrent calls |
| **SIP Proxy** | Kamailio 5.8+ or OpenSIPS 3.5+ | SIP routing, load balancing, flood protection | Start without proxy (direct FreeSWITCH), add at 500+ CPS |
| **WebRTC TURN** | Cloudflare Calls (beta) or coturn on existing media node | ICE/TURN for WebRTC clients | Cloudflare free tier, coturn same instance = $0 |
| **Event Bus** | NATS JetStream (self-hosted) or Upstash Kafka (managed) | Durable event stream for billing, analytics | NATS = free self-hosted, Upstash Kafka = $10/mo starter |
| **Object Storage** | Cloudflare R2 (10GB free) or AWS S3 | Recordings, TTS cache, audio prompts | R2 = $0 egress vs S3 egress fees |
| **TTS Engine** | ElevenLabs API or OpenAI TTS (startup), AWS Polly (scale) | Text-to-speech generation | ElevenLabs = $5/mo, higher quality than Polly |
| **STT Engine** | OpenAI Whisper API or Deepgram | Speech-to-text transcription | Whisper = $0.006/min, Deepgram = $0.0043/min |
| **Infrastructure** | Terraform + OpenTofu (open source fork) | Infrastructure as code | OpenTofu = fork of Terraform without license concerns |
| **CI/CD** | GitHub Actions (free tier) | Build, test, deploy pipeline | 2000 minutes/month free |
| **Observability - Startup** | Better Stack (free tier) or Grafana Cloud (free) | Logs, metrics, uptime monitoring | Better Stack = 1GB logs/mo free, 10 monitors |
| **Observability - Scale** | Grafana Cloud + Prometheus + Loki, OpenTelemetry | Full observability stack | Grafana Cloud free tier: 10K series, 50GB logs |
| **Error Tracking** | Sentry (free tier) or GlitchTip (self-hosted) | Error monitoring and alerting | Sentry = 5K errors/month free |
| **CDN** | Cloudflare (free tier) | Audio file delivery, portal hosting | Free unlimited bandwidth |
| **Email** | Resend (free tier) or Postmark | Transactional emails, alerts, invoices | Resend = 3K emails/month free |
| **Payment Processing** | Stripe Billing | Invoicing, subscriptions, usage billing | 2.9% + $0.30 per transaction |
| **API Docs** | Mintlify or Docusaurus | Developer documentation site | Mintlify free hosting, MDX-based |
| **SDK Generation** | Speakeasy or Fern | Auto-generate SDKs from OpenAPI | Free tier available |

### Startup Stack Summary (Month 1-6, <100 concurrent calls)

**Total Cost: $150-200/month**

- **Compute:** 1x t3.medium EC2 ($30/mo) + 1x Cloudflare Workers ($5/mo) = $35/mo
- **Database:** Neon Postgres free tier (upgrade $20/mo when needed) = $0-20/mo
- **Redis:** Upstash Redis free tier = $0/mo
- **Storage:** Cloudflare R2 free tier = $0/mo
- **Event Bus:** NATS self-hosted on same EC2 = $0/mo
- **Monitoring:** Better Stack free tier = $0/mo
- **Telephony:** Existing Twilio trunk (40-60 CPS) = $0 infrastructure cost
- **TTS/STT:** Pay-per-use (ElevenLabs $5/mo + OpenAI Whisper usage) = $10-30/mo
- **Misc:** Domain, email (Resend free), CDN (Cloudflare free) = $15/mo
- **Buffer:** $50-80/mo for usage spikes

---

## 4. Platform Choice Rationale

**Start lean with serverless + single EC2, scale deliberately based on revenue.**

### Phase 1: Startup (0-500 concurrent calls)
- **Serverless control plane:** Cloudflare Workers or AWS Lambda with Hono.js framework
- **Serverless database:** Neon Postgres (free → $20/mo) or Turso SQLite
- **Single media node:** FreeSWITCH on t3.medium ($30/mo), co-located with NATS and coturn
- **Existing trunk:** Leverage 40-60 CPS Twilio capacity
- **Why:** Get to market in 4-6 weeks, validate product-market fit, <$200/mo burn

### Phase 2: Growth (500-5000 concurrent calls)
- **Same control plane:** Cloudflare Workers scales automatically
- **Upgraded database:** Neon paid tier or move to PlanetScale/Upstash for Redis Pro
- **Media scaling:** Add second t3.large node ($60/mo), implement Kamailio load balancer
- **Multiple carriers:** Add Telnyx or Bandwidth alongside Twilio for redundancy
- **Why:** Incremental cost increase tied to revenue growth, still <$500/mo infrastructure

### Phase 3: Scale (5K-50K concurrent calls)
- **Hybrid cloud:** Keep control plane serverless, move orchestrator to AWS ECS Fargate
- **Managed services:** Aurora Serverless v2, ElastiCache Redis cluster
- **Media cluster:** 3-5 c7i.2xlarge instances with auto-scaling
- **Multi-region:** Deploy to us-east-1 + us-west-2 for redundancy
- **Why:** Revenue supports $2-5K/mo infrastructure, compliance needs increase

### Phase 4: Enterprise (50K+ concurrent calls)
- **Full AWS native:** Lambda + DynamoDB + Aurora Global + EventBridge
- **Multi-region active-active:** 3+ regions with global load balancing
- **Dedicated carriers:** Direct SIP trunks with Lumen, AT&T, etc.
- **SOC 2 Type II + HIPAA compliance**
- **Why:** Enterprise contracts justify $20-50K/mo infrastructure spend

---

## 5. High Level Architecture

### Startup Architecture (Phase 1)

```
Internet
    ↓
Cloudflare (CDN + DDoS protection)
    ↓
Cloudflare Workers (Hono.js API) ←→ Neon Postgres (free tier)
    ↓                                         ↓
NATS JetStream (same EC2) ←→ Upstash Redis (free tier)
    ↓
FreeSWITCH (t3.medium EC2) ←→ Twilio SIP Trunk (40-60 CPS)
    ↓
Cloudflare R2 (recordings + TTS cache)
```

**Key Points:**
- Single EC2 instance runs FreeSWITCH + NATS + coturn
- No Kamailio initially (direct SIP to FreeSWITCH)
- Cloudflare Workers handle all API traffic (scales to millions of requests)
- NATS provides durable event queue for billing/analytics
- Total infra cost: ~$150/mo

### Scale Architecture (Phase 3+)

```
Developers/Utilities → CloudFront + WAF
                            ↓
                    API Gateway + Lambda (Hono.js) ←→ Aurora Serverless
                            ↓                              ↓
                    EventBridge/NATS ←→ ElastiCache Redis ←→ ECS Fargate (Orchestrators)
                            ↓                              ↓
                    Route 53 (geo routing)           DynamoDB (hot state)
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
    Region 1 (us-east-1)            Region 2 (us-west-2)
            ↓                               ↓
    NLB → Kamailio cluster            NLB → Kamailio cluster
            ↓                               ↓
    FreeSWITCH ASG (c7i.4xlarge)     FreeSWITCH ASG (c7i.4xlarge)
            ↓                               ↓
    Twilio, Telnyx, Bandwidth         Twilio, Telnyx, Bandwidth
            ↓                               ↓
        PSTN carriers                   PSTN carriers
            ↓
    S3 (recordings) → Glacier (90-day lifecycle)
            ↓
    ClickHouse Cloud (analytics) ← Fivetran (CDC from Aurora)
```

---

## 6. Architecture Diagrams

### Call Flow Sequence Diagram (ASCII)

```
Client       API          NATS      Orchestrator  FreeSWITCH   Twilio      PSTN
  |           |            |            |             |           |          |
  |--POST---->|            |            |             |           |          |
  | /v1/calls |            |            |             |           |          |
  |           |--validate->|            |             |           |          |
  |           |--publish-->|            |             |           |          |
  |<--202-----|            |             |             |           |          |
  | job_id    |            |            |             |           |          |
  |           |            |--consume-->|             |           |          |
  |           |            |            |--originate->|           |          |
  |           |            |            |             |--INVITE-->|          |
  |           |            |            |             |           |--setup-->|
  |           |            |            |             |           |<--ring---|
  |           |            |            |             |<--RING----|          |
  |           |            |            |<--event-----|           |          |
  |           |<--webhook--|<--publish--|             |           |          |
  |<--POST----|            |            |             |           |          |
  | answered  |            |            |             |<--answer--|          |
  |           |            |            |--play TTS-->|           |          |
  |           |            |            |             |===audio===>====audio===>
  |           |            |            |<--hangup----|<--BYE-----|          |
  |           |            |            |--CDR------->|           |          |
  |           |            |<--publish--|             |           |          |
  |           |<--webhook--|            |             |           |          |
  |<--POST----|            |            |             |           |          |
  | completed |            |            |             |           |          |
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Control Plane                         │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐             │
│  │   API    │───▶│  NATS/   │───▶│  Worker   │             │
│  │ (Hono.js)│    │ EventBus │    │ (Bun/Node)│             │
│  └────┬─────┘    └────┬─────┘    └─────┬─────┘             │
│       │               │                 │                    │
│       ▼               ▼                 ▼                    │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────┐              │
│  │  Postgres   │ │    Redis    │ │  S3/R2   │              │
│  │  (config,   │ │  (presence, │ │ (record, │              │
│  │   CDR)      │ │   queues)   │ │  TTS)    │              │
│  └─────────────┘ └─────────────┘ └──────────┘              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Media Plane                           │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐          │
│  │ Kamailio │───▶│ FreeSWITCH   │───▶│ Carriers │──▶ PSTN  │
│  │  (LB)    │    │  (media)     │    │ (Twilio) │          │
│  └──────────┘    └──────┬───────┘    └──────────┘          │
│                         │                                    │
│                         ▼                                    │
│                  ┌─────────────┐                             │
│                  │   Events    │                             │
│                  │  (to NATS)  │                             │
│                  └─────────────┘                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Analytics Plane                         │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │  ClickHouse  │    │   Grafana    │                       │
│  │  (time-      │───▶│  (dashboards,│                       │
│  │   series)    │    │   alerts)    │                       │
│  └──────────────┘    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Startup Phase: Under $200/Month

### Infrastructure Spec (Month 1-3)

**Compute:**
- **1x AWS EC2 t3.medium** (us-east-1)
  - 2 vCPU, 4GB RAM, 50GB gp3 SSD
  - Runs: FreeSWITCH, NATS JetStream, coturn, Prometheus node exporter
  - Capacity: 100 concurrent calls (40-60 CPS burst)
  - Cost: $30.37/month (on-demand) or $18/month (1-year reserved)

**Control Plane:**
- **Cloudflare Workers** (Hono.js API)
  - 100K requests/day free tier
  - Upgrade to $5/month for 10M requests if needed
  - Sub-50ms response time globally

**Database:**
- **Neon Postgres** Serverless
  - Free tier: 0.5GB storage, 1 branch, 1GB transfer
  - Upgrade at $20/month for 10GB storage + autoscaling compute
  - Connection pooling via Neon's built-in pgBouncer

**Caching/Queue:**
- **Upstash Redis** Free tier
  - 10K commands/day free
  - Upgrade to $10/month for 100K commands/day
  - Global replication optional ($20/mo)

**Storage:**
- **Cloudflare R2**
  - 10GB storage free/month
  - $0 egress (vs S3's $0.09/GB)
  - Use for recordings, TTS cache, audio prompts

**Events:**
- **NATS JetStream** (self-hosted on EC2)
  - ~100MB RAM footprint
  - Disk-backed streams for durability
  - Replaces Kafka/Pub Sub at zero cost

**Monitoring:**
- **Better Stack** Free tier
  - 1GB logs/month
  - 10 uptime monitors
  - 5-minute incident phone calls
  - Upgrade $10/month for Slack integration

**CDN + DNS:**
- **Cloudflare** Free tier
  - Unlimited bandwidth
  - DDoS protection
  - SSL certificates
  - 100% uptime SLA on free tier

### Estimated Usage Costs (Per Month)

**Telephony (variable based on call volume):**

Assuming 10,000 minutes/month (moderate usage):
- **Twilio inbound:** $0.0085/min × 5,000 min = $42.50
- **Twilio outbound:** $0.013/min × 5,000 min = $65
- **Twilio phone number:** $1/month per DID × 5 DIDs = $5
- **Total telephony:** ~$112.50/month

**TTS/STT (variable):**
- **ElevenLabs TTS:** $5/month for 30K characters (~300 TTS calls)
- **OpenAI Whisper STT:** $0.006/min × 500 min = $3
- **Total AI:** ~$8/month

**Total Predictable Costs:**
- EC2: $30/month
- Cloudflare Workers: $5/month
- Neon Postgres: $0-20/month (start free)
- Upstash Redis: $0/month (free tier)
- Better Stack: $0-10/month (start free)
- Domain/Email: $15/month
- **Fixed costs: $50-70/month**

**Total with Usage:**
- Fixed: $50-70
- Telephony: $112
- AI: $8
- **Grand total: $170-190/month**

### Growth Triggers

**When to upgrade each component:**

| Component | Free Tier Limit | Upgrade Trigger | New Cost |
|---|---|---|---|
| Cloudflare Workers | 100K requests/day | >50K calls/day | +$5/mo |
| Neon Postgres | 0.5GB storage | >50K CDRs stored | +$20/mo |
| Upstash Redis | 10K commands/day | >500 concurrent calls | +$10/mo |
| EC2 t3.medium | 100 concurrent | >80 concurrent sustained | +$60/mo (add t3.large) |
| NATS JetStream | 10GB disk | >1M events/day | +$0 (resize disk $5/mo) |
| Better Stack | 1GB logs/month | Heavy debug logging | +$10/mo |

**Revenue-based scaling:**
- Charge $0.02/minute (vs Twilio's $0.013 carrier cost)
- 10K minutes/month = $200 revenue
- Gross margin: ($200 - $112 telephony - $70 infra) / $200 = **9% margin**
- Need 50K+ minutes/month ($1K revenue) for healthy 40%+ margins

---

## 8. Cost Model & Unit Economics

### Carrier Costs (Wholesale)

**Twilio (existing trunk):**
- Outbound US: $0.013/min
- Inbound US: $0.0085/min
- Blended average: $0.011/min
- Phone numbers: $1/mo per DID
- Capacity: 40-60 CPS included

**Alternative Carriers (add when scaling):**

| Carrier | Outbound US | Inbound US | Notes |
|---|---|---|---|
| Telnyx | $0.004/min | $0.004/min | Lowest cost, 30-day payment terms |
| Bandwidth | $0.0049/min | $0.004/min | Best US coverage, good support |
| SignalWire | $0.0065/min | $0.004/min | FreeSWITCH native, easy integration |
| Twilio | $0.013/min | $0.0085/min | Current provider, highest cost |

**International (by zone):**
- Canada/UK/Australia: $0.01-0.02/min
- Europe (most): $0.02-0.05/min
- Latin America: $0.05-0.15/min
- Asia/Africa: $0.10-0.40/min

### Infrastructure Costs per Concurrent Call

**Startup tier (t3.medium, 100 concurrent calls):**
- EC2: $30/month ÷ 100 = $0.30 per concurrent call/month
- Database: $20/month ÷ 100 = $0.20
- Redis: $10/month ÷ 100 = $0.10
- Storage (recordings, 90-day retention): $0.05
- **Total: $0.65 per concurrent call per month**

**Scale tier (c7i.2xlarge, 2000 concurrent calls per node):**
- EC2: $250/month ÷ 2000 = $0.125 per concurrent call/month
- Database: $200/month ÷ 10K concurrent = $0.02
- Redis: $100/month ÷ 10K concurrent = $0.01
- Storage: $0.02
- **Total: $0.175 per concurrent call per month**

**Rule of thumb:** 1 concurrent call = 10 minutes of traffic per hour on average
- 100 concurrent calls = 100 × 10 min/hour × 24 hours × 30 days = 720K minutes/month

### TTS/STT Costs

**Text-to-Speech:**
- ElevenLabs: $5/month (30K characters), then $0.18 per 1K characters
- OpenAI TTS: $15 per 1M characters ($0.015 per 1K)
- AWS Polly: $4 per 1M characters ($0.004 per 1K)
- Google Cloud TTS: $4 per 1M characters (WaveNet), $16 per 1M (Neural2)

**Recommendation:** Start with OpenAI TTS (best quality/cost), move to Polly at scale

**Average TTS usage:**
- IVR greeting: 200 characters
- Menu prompts: 500 characters per call
- Assume 50% of calls use TTS = 350 characters per TTS-enabled call

**Speech-to-Text:**
- OpenAI Whisper: $0.006/min
- Deepgram: $0.0043/min (Nova-2 model)
- AWS Transcribe: $0.024/min (higher cost, better accuracy)
- Google Speech-to-Text: $0.016/min

**Recommendation:** Deepgram (cheapest, fast, good quality)

### Pricing Model

**Goal:** 50-70% gross margin after carrier + infrastructure costs

**Target Pricing:**

| Service | IRIS X Price | Carrier Cost | Infra Cost | Gross Margin |
|---|---|---|---|---|
| Outbound minute (US) | $0.020 | $0.011 | $0.002 | 35% |
| Inbound minute (US) | $0.015 | $0.0085 | $0.002 | 30% |
| Phone number (DID) | $1.50/mo | $1.00/mo | $0.10/mo | 27% |
| TTS (1K chars) | $0.025 | $0.015 | $0.001 | 36% |
| STT (per minute) | $0.010 | $0.0043 | $0.001 | 47% |
| Recording storage | $0.005/min | $0 | $0.001 | 80% |
| Queue/IVR minute | $0.008 | $0 | $0.003 | 63% |

**Bundled Plans:**

**Developer (Free Tier):**
- 100 minutes/month free
- 1 phone number
- 100MB recording storage
- API access, no SLA
- **Revenue: $0, Customer acquisition**

**Startup ($49/month):**
- Includes 2,000 minutes ($40 value)
- 5 phone numbers
- 5GB recording storage (90 days)
- 99.9% uptime SLA
- Additional minutes: $0.020/min
- **Break-even at 1,500 min/mo**

**Growth ($199/month):**
- Includes 10,000 minutes ($180 value)
- 25 phone numbers
- 50GB recording storage (180 days)
- Queue + IVR builder
- 99.95% uptime SLA
- Additional minutes: $0.018/min (10% discount)
- **Break-even at 8,000 min/mo**

**Enterprise (Custom):**
- Volume discounts start at 100K min/month
- Dedicated media nodes optional
- SOC 2 + HIPAA compliance
- 99.99% uptime SLA
- Custom carrier routing
- **Pricing: $0.012-0.015/min all-in**

### Monthly Recurring Revenue (MRR) Scenarios

**Scenario 1: 10 Startup plan customers**
- 10 × $49 = $490 MRR
- Included minutes: 20K total
- Avg overage: 5K minutes @ $0.020 = $100
- **Total revenue: $590/month**
- **Costs:** $112 (carrier) + $70 (infra) = $182
- **Gross profit: $408 (69% margin)**

**Scenario 2: 5 Growth + 20 Startup customers**
- Growth: 5 × $199 = $995
- Startup: 20 × $49 = $980
- Total MRR: $1,975
- Included minutes: 50K + 40K = 90K
- Avg overage: 20K @ $0.019 = $380
- **Total revenue: $2,355/month**
- **Costs:** $990 (carrier) + $150 (infra, still on t3.medium) = $1,140
- **Gross profit: $1,215 (52% margin)**

**Scenario 3: Path to $10K MRR**
- Needs: ~500K minutes/month (50K/customer × 10 Growth customers)
- Infrastructure: 2x c7i.2xlarge ($500/mo), upgraded DB/Redis ($300/mo)
- Carrier costs: 500K × $0.011 = $5,500
- Infra costs: $800
- **Total costs: $6,300**
- **Gross profit: $3,700 (37% margin)**
- Need to optimize margins via cheaper carriers (Telnyx) or higher pricing

### Break-Even Analysis

**Monthly fixed costs at startup:** $70/month

**Variable costs per minute:** $0.013 (carrier + infra)

**Revenue per minute:** $0.020

**Contribution margin:** $0.007/min (35%)

**Break-even minutes:** $70 ÷ $0.007 = 10,000 minutes/month

**At current 40 CPS capacity:** 40 × 60 sec × 60 min × 24 hrs × 30 days = 103M call-seconds = 1.7M minutes/month theoretical max

**Realistic utilization:** 20% average = 350K minutes/month capacity

**Break-even is only 3% of capacity** - very achievable in Month 1-2 with beta customers.

### Customer Acquisition Cost (CAC) Targets

**Target payback period:** 3 months

**Startup plan ($49/mo):**
- LTV (24 months): $49 × 24 = $1,176
- Allowable CAC (3:1 LTV:CAC): $392
- **Spend up to $390 to acquire a Startup customer**

**Growth plan ($199/mo):**
- LTV (24 months): $199 × 24 = $4,776
- Allowable CAC: $1,592
- **Spend up to $1,500 to acquire a Growth customer**

**Acquisition channels:**
- Developer community content (blogs, videos): $50-100 CAC
- Google Ads (branded + competitor): $200-400 CAC
- Sales outreach to utilities/enterprises: $800-2000 CAC
- Reseller partnerships: 20-30% revenue share

---

## 9. Major Modules and Deliverables

### 9.1 Identity and Tenancy

**Capabilities:**
- Multi-tenant data isolation at database and storage level
- Firebase Authentication for login (Google, GitHub, email/password)
- API key generation with scopes (calls.write, queues.read, etc.)
- OAuth 2.0 client credentials flow for server-to-server
- Role-based access control (RBAC)

**Roles:**
- **Owner:** Full access, billing, can delete tenant
- **Admin:** Manage users, apps, numbers, view billing
- **Developer:** API keys, test calls, logs, cannot manage users
- **Agent:** WebRTC softphone access, queue login, no API access
- **Analyst:** Read-only access to CDR, analytics, dashboards
- **Read-Only:** View-only access to everything except billing

**Tenant Limits (enforced in real-time):**
- CPS (calls per second): Default 5, max 100 without approval
- Concurrent channels: Default 10, max 500
- Queue length: Default 100, max 10,000
- Recording retention: 90 days (Startup), 180 days (Growth), custom (Enterprise)
- TTS quota: 100K characters/month
- Storage quota: 5GB (Startup), 50GB (Growth), unlimited (Enterprise)

**Database Schema:**
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(63) UNIQUE NOT NULL, -- subdomain/identifier
  plan VARCHAR(50) NOT NULL, -- free, startup, growth, enterprise
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, cancelled
  limits JSONB NOT NULL DEFAULT '{
    "cps": 5,
    "concurrent_channels": 10,
    "queue_length": 100,
    "recording_days": 90,
    "tts_quota_monthly": 100000,
    "storage_gb": 5
  }',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  firebase_uid VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL, -- ix_live_abc123
  key_hash VARCHAR(128) NOT NULL, -- bcrypt hash of full key
  scopes TEXT[] NOT NULL, -- ['calls.*', 'queues.read']
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

**Acceptance Criteria:**
- User can sign up and create tenant in <30 seconds
- API key authentication works with Bearer token
- Rate limits enforced per tenant within 100ms
- Tenant cannot exceed CPS limit (returns 429 Too Many Requests)
- Role permissions enforced on all API endpoints
- API key scopes prevent unauthorized actions

---

### 9.2 Numbers and Carriers

**DID Lifecycle:**
1. **Search:** Query available numbers by area code, prefix, pattern
2. **Purchase:** Reserve number from carrier, store in database
3. **Assign:** Link number to application or queue
4. **Configure:** Set voice webhook, fallback webhook, caller ID
5. **Port In:** LNP workflow (see below)
6. **Release:** Return number to carrier pool

**Carrier Integration:**

**Phase 1 (Startup):**
- Twilio SIP Trunk (existing, 40-60 CPS)
- Supports inbound + outbound
- Numbers managed via Twilio API

**Phase 2 (Growth):**
- Add Telnyx or Bandwidth
- Multi-carrier failover
- Least-cost routing by prefix

**Phase 3 (Scale):**
- Add SignalWire, Flowroute
- Adaptive routing based on ASR (answer seizure ratio)
- Automatic carrier downgrade on high failure rates

**Number Porting (LNP) Workflow:**

Porting a phone number from another carrier to IRIS X:

```
┌─────────────────────────────────────────────────────────┐
│  1. Customer submits port request                        │
│     - Current carrier name                               │
│     - Account number with current carrier                │
│     - Authorized person name                             │
│     - Service address (must match carrier records)       │
│     - Desired FOC (Firm Order Commitment) date           │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  2. Generate LOA (Letter of Authorization)               │
│     - PDF document signed by customer                    │
│     - Upload to carrier portal (Bandwidth, Telnyx)       │
│     - Carrier validates with losing carrier              │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  3. CSR (Customer Service Record) validation             │
│     - Carrier pulls CSR from losing carrier              │
│     - Checks: account number, service address match      │
│     - Rejects if data doesn't match (customer fixes)     │
│     - Typical time: 2-5 business days                    │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  4. FOC date confirmed                                   │
│     - Carrier confirms port will complete on FOC date    │
│     - Usually 7-14 days from submission                  │
│     - IRIS X marks number as "porting" in database       │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  5. Pre-port testing (day before FOC)                    │
│     - Configure number in IRIS X (don't activate yet)    │
│     - Test webhook endpoints                             │
│     - Prepare fallback plan                              │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  6. Port completion (FOC date, usually 11:30 AM ET)      │
│     - Carrier activates number on IRIS X                 │
│     - Losing carrier deactivates number                  │
│     - IRIS X marks number as "active"                    │
│     - Monitor inbound calls for 24 hours                 │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│  7. Post-port validation                                 │
│     - Inbound test call successful                       │
│     - Outbound caller ID working                         │
│     - Customer notified of completion                    │
│     - Losing carrier typically bills through end of month│
└─────────────────────────────────────────────────────────┘
```

**Porting Failure Scenarios:**
- **CSR mismatch:** Service address doesn't match (customer must correct with losing carrier first)
- **Account not found:** Wrong account number provided
- **Number has porting restrictions:** Under contract, unpaid bills
- **Unauthorized request:** Name doesn't match account holder
- **Carrier rejects FOC:** Losing carrier disputes port (requires escalation)

**Porting API Integration:**
- **Bandwidth:** RESTful API, webhooks for status updates, 7-10 day typical timeline
- **Telnyx:** API + portal, auto-CSR validation, 5-7 day timeline
- **Twilio:** Most expensive ($1 port fee), but simplest for low volume

**Database Schema:**
```sql
CREATE TABLE numbers (
  e164 VARCHAR(20) PRIMARY KEY, -- +15555551234
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  carrier VARCHAR(50) NOT NULL, -- twilio, telnyx, bandwidth
  carrier_ref VARCHAR(255), -- carrier's ID for this number
  status VARCHAR(50) NOT NULL, -- active, porting, released
  voice_application_id UUID REFERENCES applications(id),
  voice_webhook_url TEXT,
  fallback_webhook_url TEXT,
  emergency_address_id UUID,
  purchased_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE number_port_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  e164 VARCHAR(20) NOT NULL,
  losing_carrier VARCHAR(255) NOT NULL,
  account_number VARCHAR(255) NOT NULL,
  authorized_person VARCHAR(255) NOT NULL,
  service_address JSONB NOT NULL,
  desired_foc_date DATE,
  actual_foc_date DATE,
  status VARCHAR(50) NOT NULL, -- submitted, validated, confirmed, completed, rejected
  rejection_reason TEXT,
  loa_document_url TEXT,
  carrier VARCHAR(50), -- which carrier we're porting TO
  carrier_port_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Emergency Services (E911):**
- Required for all US numbers
- Address validation via carrier APIs
- Store addresses, link to numbers
- Update required within 24 hours of address change
- FCC compliance: $10K+ fines for missing/incorrect E911

**Database Schema:**
```sql
CREATE TABLE emergency_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  label VARCHAR(255), -- "HQ Office", "Remote Agent - John"
  street VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  country VARCHAR(2) DEFAULT 'US',
  validated BOOLEAN DEFAULT FALSE,
  carrier_address_id VARCHAR(255), -- SID from carrier
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Acceptance Criteria:**
- Search for available numbers by area code in <2 seconds
- Purchase number and assign to application in <10 seconds
- Port request submitted with LOA generation automated
- CSR validation failures provide clear error messages to customer
- FOC date tracked and customer notified 24 hours before completion
- Post-port, inbound calls route correctly within 5 minutes
- Emergency address validated and linked to number before activation
- Multi-carrier failover: if Twilio fails, automatically retry via Telnyx

---

### 9.3 Call Control and Webhooks

**REST Endpoints:**

```
POST   /v1/calls                  Create outbound call
GET    /v1/calls/:id              Get call status
POST   /v1/calls/:id/actions      Execute action (play, gather, transfer, hangup)
GET    /v1/calls                  List calls (filtered by tenant)
```

**Webhook Events:**

Customer's webhook URL receives POST requests on these events:

1. **call.initiated** - Call request accepted, queued for origination
2. **call.ringing** - Carrier received INVITE, endpoint ringing
3. **call.answered** - Call connected, media flowing
4. **call.completed** - Call ended (hangup by either party)
5. **call.failed** - Call failed (busy, no answer, invalid number)
6. **gather.completed** - DTMF or speech input collected
7. **recording.ready** - Recording uploaded to storage, URL available
8. **queue.entered** - Call added to queue
9. **queue.agent_assigned** - Agent picked up call from queue
10. **queue.abandoned** - Caller hung up while in queue
11. **billing.threshold** - Tenant reached spend threshold (e.g., 80% of monthly limit)

**Webhook Payload Example:**

```json
{
  "event": "call.answered",
  "call_id": "call_01J1KQZX9F7GH4JWXY12ABCD",
  "tenant_id": "tenant_01J1KQZ",
  "timestamp": "2025-01-15T14:32:11.234Z",
  "from": "+15555551234",
  "to": "+15555556789",
  "direction": "outbound",
  "status": "in-progress",
  "duration": 0,
  "answered_at": "2025-01-15T14:32:11.234Z"
}
```

**Webhook Security:**

1. **HMAC Signature (required):**
   ```
   X-IRISX-Signature: t=1705329131,v1=5f3d8a2b1c...
   ```
   - Computed as: HMAC-SHA256(signing_secret, timestamp + "." + body)
   - Customer verifies signature using their webhook signing secret
   - Reject requests where timestamp is >5 minutes old (replay protection)

2. **Timestamp validation:**
   - Reject webhooks with timestamps >5 minutes in past (replay attack)
   - Reject timestamps in future (clock skew >30 seconds)

3. **TLS required:**
   - Only HTTPS webhook URLs accepted
   - Certificate validation enforced
   - Option to allow self-signed certs for development (with warning)

4. **Retry policy:**
   - Retry on 5xx errors or timeouts
   - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (6 retries max)
   - After 6 failures, move to dead letter queue (DLQ)
   - DLQ webhooks visible in portal, customer can replay manually

5. **Dead Letter Queue:**
   - Failed webhooks stored for 7 days
   - Customer can replay from portal with "Retry Webhook" button
   - Replay respects original order

**TwiML-Style Verbs:**

Customer webhook responds with JSON containing verbs:

```json
{
  "verbs": [
    {
      "verb": "say",
      "text": "Thank you for calling. Please hold while we connect you.",
      "voice": "en-US-Neural2-A",
      "language": "en-US"
    },
    {
      "verb": "play",
      "url": "https://example.com/hold-music.mp3",
      "loop": 3
    },
    {
      "verb": "gather",
      "input": ["dtmf", "speech"],
      "timeout": 5,
      "num_digits": 1,
      "finish_on_key": "#",
      "speech_model": "phone_call",
      "speech_language": "en-US",
      "action_url": "https://example.com/webhooks/gather-result"
    },
    {
      "verb": "dial",
      "number": "+15555551234",
      "timeout": 30,
      "caller_id": "+15555556789",
      "record": true,
      "recording_status_callback_url": "https://example.com/webhooks/recording"
    },
    {
      "verb": "enqueue",
      "queue_name": "support",
      "wait_url": "https://example.com/wait-music.mp3",
      "max_wait_time": 300
    },
    {
      "verb": "hangup"
    }
  ]
}
```

**Verb Descriptions:**

- **say:** Text-to-speech playback (uses TTS engine)
- **play:** Audio file playback (MP3, WAV supported)
- **gather:** Collect DTMF digits or speech input
- **dial:** Bridge to another number or SIP endpoint
- **bridge:** Connect two active calls
- **enqueue:** Place call in queue for agent pickup
- **dequeue:** (Agent-initiated) Pick call from queue
- **record:** Start/stop recording current call leg
- **hangup:** Terminate call immediately

**Visual Call Flow Builder:**

Portal includes drag-and-drop flow builder that generates JSON:

```
[Incoming Call] → [Say: Welcome] → [Gather: Press 1 for Sales, 2 for Support]
                                        ↓
                              ┌─────────┴─────────┐
                              ↓                   ↓
                       [Enqueue: Sales]   [Enqueue: Support]
```

Generates:
```json
{
  "steps": [
    {"id": "step1", "type": "say", "text": "Welcome to IRIS X", "next": "step2"},
    {"id": "step2", "type": "gather", "prompt": "Press 1 for Sales, 2 for Support", "digits": 1, "next": "step3"},
    {"id": "step3", "type": "switch", "variable": "Digits", "cases": [
      {"value": "1", "next": "step4"},
      {"value": "2", "next": "step5"}
    ]},
    {"id": "step4", "type": "enqueue", "queue": "sales"},
    {"id": "step5", "type": "enqueue", "queue": "support"}
  ]
}
```

**Sandbox Mode:**

Test call flows without real media:

- Simulate inbound call with custom caller ID
- Step through flow manually, see webhook payloads
- Inspect gather results, TTS output
- Validate webhook signatures locally
- **Zero telephony costs for testing**

**Database Schema:**
```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- webhook, flow, hybrid
  voice_webhook_url TEXT, -- for webhook type
  flow_json JSONB, -- for flow type (visual builder)
  status_webhook_url TEXT,
  fallback_webhook_url TEXT,
  webhook_signing_secret VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  call_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  request_body JSONB,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  status VARCHAR(50), -- success, failed, retrying, dlq
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_tenant_call ON webhook_logs(tenant_id, call_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status) WHERE status IN ('failed', 'dlq');
```

**Acceptance Criteria:**
- POST /v1/calls creates call and returns 202 Accepted within 200ms
- Webhook signature validation prevents replay attacks (5-minute window)
- Webhook retries work with exponential backoff (6 attempts)
- Failed webhooks appear in DLQ, customer can replay from portal
- Visual flow builder exports to executable JSON
- Sandbox mode simulates complete call without telephony charges
- Gather verb collects DTMF and speech input correctly
- Say verb uses TTS engine, caches output for repeat calls
- Play verb streams audio from customer's URL or CDN

---

### 9.4 Queue and Agent System

**Architecture:**

- Redis lists store queue entries: `queue:{tenant_id}:{queue_name}`
- Each queue entry is a JSON object with caller info and timestamp
- Agent presence tracked in Redis hashes: `agent:{tenant_id}:{agent_id}`
- Firestore mirrors agent presence for real-time UI updates

**Routing Strategies:**

1. **Round Robin:** Distribute calls evenly across available agents
2. **Least Recent:** Agent who hasn't taken a call in longest time
3. **Fewest Calls:** Agent with lowest call count today
4. **Skills-Based:** Match caller requirements to agent skills
5. **Priority:** VIP callers routed to senior agents first
6. **Sticky Agent:** Repeat callers routed to same agent (by caller number hash)

**Skills Matching:**

Agents tagged with skills:
```json
{
  "agent_id": "agent_01J1KQZ",
  "skills": ["spanish", "billing", "technical"],
  "proficiency": {
    "spanish": 5,
    "billing": 4,
    "technical": 3
  }
}
```

Callers tagged with requirements:
```json
{
  "caller": "+15555551234",
  "required_skills": ["spanish"],
  "priority": "high"
}
```

Matching algorithm:
- Filter agents with ALL required skills
- If multiple matches, use proficiency score as tiebreaker
- Fall back to "no skills" agents if no match after 30 seconds

**Queue Metrics (Real-Time):**

Calculated every 5 seconds, stored in Redis, mirrored to Firestore:

```json
{
  "queue_name": "support",
  "waiting_count": 12,
  "available_agents": 5,
  "busy_agents": 8,
  "ewt_seconds": 47, // Estimated wait time
  "avg_wait_seconds": 35,
  "longest_wait_seconds": 120,
  "service_level_pct": 87.5, // % answered within SLA (e.g., 80% in 20 sec)
  "abandon_rate_pct": 5.2,
  "agent_occupancy_pct": 61.5 // % of time agents in active calls
}
```

**Service Level Agreement (SLA):**

Common SLA: "80% of calls answered within 20 seconds"

Calculation:
```sql
SELECT
  COUNT(*) FILTER (WHERE wait_seconds <= 20) * 100.0 / COUNT(*) AS service_level_pct
FROM queue_events
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND event = 'answered';
```

**Supervisor Dashboard:**

Real-time view of queues and agents:

**Queue View:**
- List of queues with metrics (waiting, EWT, service level)
- Drill-down to individual callers in queue (name, wait time, priority)
- Actions: pause queue, redirect calls, adjust max wait time

**Agent View:**
- Grid of agents with status (available, busy, wrap-up, offline)
- Current call details (caller ID, duration, queue)
- Actions: force logout, whisper to agent, barge into call, monitor call

**Wall Board (Public Display):**
- Large-screen dashboard for call center floor
- Real-time CPS, queue depth, service level
- Agent leaderboard (calls handled, AHT, customer satisfaction)

**Database Schema:**
```sql
CREATE TABLE queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  strategy VARCHAR(50) DEFAULT 'round_robin',
  max_wait_seconds INTEGER DEFAULT 300,
  service_level_threshold_seconds INTEGER DEFAULT 20,
  required_skills JSONB DEFAULT '[]',
  priority_enabled BOOLEAN DEFAULT FALSE,
  sticky_agent_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  skills JSONB DEFAULT '[]',
  capacity INTEGER DEFAULT 1, -- concurrent calls, usually 1, up to 3 for chat
  state VARCHAR(50) DEFAULT 'offline', -- available, busy, wrap_up, offline
  last_call_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
  call_id VARCHAR(255) NOT NULL,
  agent_id UUID REFERENCES agents(id),
  event VARCHAR(50) NOT NULL, -- entered, answered, abandoned, completed
  wait_seconds INTEGER,
  handle_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_events_queue_time ON queue_events(queue_id, created_at);
CREATE INDEX idx_queue_events_call ON queue_events(call_id);
```

**Redis Data Structures:**

```redis
# Queue (List)
LPUSH queue:tenant123:support '{"call_id":"call_abc","from":"+15555551234","enqueued_at":1705329131}'
RPOP queue:tenant123:support

# Agent Presence (Hash)
HSET agent:tenant123:agent_xyz state available calls_today 5 last_call_at 1705329131

# Queue Metrics (Hash, expires every 60 seconds)
HSET queue_metrics:tenant123:support waiting 12 available_agents 5 ewt_seconds 47
EXPIRE queue_metrics:tenant123:support 60
```

**WebSocket for Agent Presence:**

Agents connect to WebSocket at `wss://api.irisx.com/v1/agent/ws`:

```json
// Agent → Server (heartbeat every 30 seconds)
{
  "type": "heartbeat",
  "state": "available",
  "agent_id": "agent_01J1KQZ"
}

// Server → Agent (incoming call)
{
  "type": "call_offered",
  "call_id": "call_abc",
  "from": "+15555551234",
  "queue": "support",
  "wait_time": 45
}

// Agent → Server (accept call)
{
  "type": "call_accept",
  "call_id": "call_abc"
}

// Server → Agent (call connected)
{
  "type": "call_connected",
  "call_id": "call_abc",
  "webrtc_offer_sdp": "..."
}
```

**Acceptance Criteria:**
- Queue holds 10K callers without Redis memory exhaustion
- Agent login reflects in UI within 500ms (via Firestore listener)
- Call distribution follows selected strategy (round robin, least recent, etc.)
- Skills-based routing matches caller to agent within 2 seconds
- EWT calculation accurate within ±10 seconds
- Service level metric updates every 5 seconds
- Supervisor can monitor agent call (listen only) without audio glitches
- Abandoned calls (caller hangup before answer) correctly decremented from queue

---

### 9.5 Dialer Engine

**Campaign Types:**

1. **Preview Dialer (Phase 2):**
   - Agent sees contact info before call
   - Agent clicks "Dial" to initiate
   - 1:1 agent-to-call ratio
   - Use case: High-value sales, complex accounts

2. **Progressive Dialer (Phase 2):**
   - System dials automatically when agent available
   - 1:1 agent-to-call ratio
   - No wasted time between calls
   - Use case: Collections, surveys, reminders

3. **Predictive Dialer (Phase 3):**
   - System dials multiple numbers per agent (e.g., 2.5:1 ratio)
   - Predicts agent availability based on AHT
   - Abandoned calls if no agent available (must be <3% per FCC)
   - Use case: Large outbound campaigns, lead generation

**List Ingestion:**

Three methods:

1. **CSV Upload:**
   ```csv
   phone,first_name,last_name,timezone,custom_field_1
   +15555551234,John,Doe,America/New_York,value1
   +15555556789,Jane,Smith,America/Los_Angeles,value2
   ```
   - Max 100K rows per upload
   - Deduplicated by phone number
   - Auto-detected columns

2. **NDJSON (Newline-Delimited JSON):**
   ```json
   {"phone":"+15555551234","name":"John Doe","timezone":"America/New_York"}
   {"phone":"+15555556789","name":"Jane Smith","timezone":"America/Los_Angeles"}
   ```
   - Streaming ingestion, no size limit
   - Preferred for >100K contacts

3. **S3 Pointer:**
   ```json
   {
     "type": "s3_pointer",
     "bucket": "my-bucket",
     "key": "contacts/campaign_001.csv",
     "format": "csv"
   }
   ```
   - Customer uploads to their S3 bucket, grants IRIS X read access
   - IRIS X streams from S3, no upload needed
   - Preferred for >1M contacts

**Pacing and Guardrails:**

Predictive dialer pacing algorithm:

```
allowed_cps = MIN(
  carrier_headroom,      // Carrier CPS limit - current usage
  media_headroom,        // FreeSWITCH channels available
  tenant_cap,            // Tenant's CPS limit
  agent_based_pace       // Agents available × dial ratio
) × 0.85                 // 85% safety factor
```

**Dial ratio calculation:**
```
dial_ratio = (total_calls_made / calls_answered) × (1 - abandon_rate_target)

Example:
- 100 calls made, 40 answered = 2.5 ratio
- Target abandon rate 3% = 0.97 multiplier
- Dial ratio = 2.5 × 0.97 = 2.43
```

**Adaptive pacing:** Adjust dial ratio every 2 minutes based on real-time answer rate

**DNC (Do Not Call) List:**

- Customer uploads DNC list (CSV with phone numbers)
- Stored in Postgres table, indexed for fast lookup
- Before dialing, check: `SELECT 1 FROM dnc WHERE phone = ? AND tenant_id = ?`
- Also check against National DNC Registry (via ScrubBird or similar API)

**Time Zone and Curfew Enforcement:**

FCC regulations: No calls before 8 AM or after 9 PM in recipient's local time.

Implementation:
- Each contact has `timezone` field (e.g., `America/New_York`)
- Before dialing, check: `current_time_in_tz >= 08:00 AND <= 21:00`
- If outside window, skip contact and reschedule for next day 8 AM

**Max Attempts:**

- Default: 3 attempts per contact
- Configurable per campaign (1-10 attempts)
- Attempts spread across different times of day (morning, afternoon, evening)
- If contact answers but no agent available, doesn't count as attempt

**Answering Machine Detection (AMD):**

FreeSWITCH has built-in AMD:

```xml
<action application="play_and_detect_speech" data="beep detect:audio_stream {start-input-timers=false,no-input-timeout=5000,speech-timeout=1000}"/>
```

Detection outcomes:
- **Human:** Voice detected within 5 seconds, hand off to agent
- **Machine:** Beep detected or long greeting (>10 seconds), play message or hangup
- **Unknown:** Timeout, treat as human (safer)

AMD accuracy: ~85-90% (industry standard)

**Live Campaign Controls:**

Supervisor dashboard actions:
- **Pause campaign:** Stop dialing, finish active calls
- **Resume campaign:** Restart dialing at previous pace
- **Adjust pace:** Manually override dial ratio (e.g., reduce from 2.5 to 1.5)
- **Skip contact:** Manually move to next contact
- **View stats:** Calls made, answer rate, abandon rate, avg wait time

**Database Schema:**
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- preview, progressive, predictive
  status VARCHAR(50) DEFAULT 'draft', -- draft, active, paused, completed
  dial_ratio NUMERIC(3,2) DEFAULT 1.00,
  max_attempts INTEGER DEFAULT 3,
  curfew_start TIME DEFAULT '21:00',
  curfew_end TIME DEFAULT '08:00',
  amd_enabled BOOLEAN DEFAULT TRUE,
  agent_queue_id UUID REFERENCES queues(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  data JSONB, -- first_name, last_name, custom fields
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  attempts INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, called, answered, no_answer, dnc
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_contacts_campaign_status ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_next_attempt ON campaign_contacts(next_attempt_at) WHERE status = 'pending';

CREATE TABLE dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_dnc_phone ON dnc_list(phone);
```

**Acceptance Criteria:**
- CSV upload of 100K contacts completes within 60 seconds
- DNC check query completes in <10ms (indexed lookup)
- Curfew enforcement prevents calls outside 8 AM-9 PM local time
- Predictive dialer maintains <3% abandon rate over 1-hour window
- AMD correctly identifies answering machines >85% of the time
- Campaign pause stops new dials within 2 seconds
- Max attempts enforced (contact marked as complete after 3 failed attempts)
- Dial ratio auto-adjusts based on answer rate every 2 minutes

---

### 9.6 Media Features

**Text-to-Speech (TTS):**

**Supported Engines:**
1. **OpenAI TTS** (default, best quality/cost)
   - Voices: alloy, echo, fable, onyx, nova, shimmer
   - HD quality: $0.015 per 1K characters
   - Speed: 200-400ms for typical prompt

2. **ElevenLabs** (highest quality, voices sound most natural)
   - Voices: 50+ pre-made, or clone custom voices
   - $5/month for 30K characters, then $0.18 per 1K
   - Speed: 300-500ms

3. **AWS Polly** (cheapest at scale)
   - Voices: Neural (Joanna, Matthew, etc.) and Standard
   - $4 per 1M characters (neural)
   - Speed: 100-200ms

**TTS Caching:**

- Compute hash of (text + voice + speed + engine)
- Check Cloudflare R2 for cached audio: `tts/{hash}.mp3`
- If hit, return CDN URL immediately (0ms TTS cost)
- If miss, generate TTS, upload to R2, return URL
- Cache TTL: 90 days (most prompts are reused)

**SSML Normalization for Cache Hits:**

Normalize text before hashing to maximize cache hits:
```javascript
function normalizeTTS(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .trim();
}
```

Example:
- "Hello, John!" → "hello john"
- "Hello John" → "hello john"
- Both cache to same file

**Audio Playback:**

**Supported Formats:**
- **Upload:** MP3, WAV, OGG, FLAC, M4A
- **Storage:** Transcoded to WAV (16-bit, 8kHz, mono) for telephony
- **Streaming:** MP3 or WAV from CDN (Cloudflare R2)

**Audio Upload API:**
```bash
POST /v1/media
Content-Type: multipart/form-data

file=@hold-music.mp3
```

Response:
```json
{
  "id": "media_01J1KQZX9F7GH4",
  "url": "https://cdn.irisx.com/media/tenant123/hold-music.mp3",
  "duration_seconds": 180,
  "format": "mp3",
  "sample_rate": 44100,
  "channels": 2,
  "created_at": "2025-01-15T14:32:11.234Z"
}
```

**Transcoding:**

If uploaded audio isn't telephony-compatible, transcode via FFmpeg:

```bash
ffmpeg -i input.mp3 -ar 8000 -ac 1 -ab 128k output.wav
```

- Sample rate: 8kHz (PSTN standard) or 16kHz (wideband)
- Channels: Mono
- Codec: PCM (WAV) or µ-law (G.711)

**Gain Control:**

Normalize audio volume to prevent clipping or inaudibility:

```bash
ffmpeg -i input.wav -filter:a "volume=1.5" output.wav
```

Exposed in API:
```json
{
  "verb": "play",
  "url": "https://cdn.irisx.com/media/hold-music.mp3",
  "gain": 1.5,
  "loop": 3
}
```

**Recording:**

**Types:**
1. **Single leg:** Record inbound or outbound leg only
2. **Full bridge:** Record both parties (stereo or mixed mono)

**Storage:**
- Recordings uploaded to Cloudflare R2 or AWS S3
- Encrypted at rest (AES-256)
- Retention: 90 days (Startup), 180 days (Growth), custom (Enterprise)
- Lifecycle policy: Move to S3 Glacier after 30 days (reduce cost by 80%)

**Signed URL Access:**

Recordings not publicly accessible. Customer requests signed URL:

```bash
GET /v1/recordings/:id/url
```

Response:
```json
{
  "url": "https://cdn.irisx.com/recordings/abc123.wav?signature=xyz&expires=1705329131",
  "expires_at": "2025-01-15T15:32:11.234Z"
}
```

URL valid for 15 minutes, then expires.

**Redaction:**

For PCI/HIPAA compliance, redact portions of recording:

```json
{
  "recording_id": "rec_01J1KQZX9F7GH4",
  "redactions": [
    {"start_seconds": 45, "end_seconds": 60, "reason": "credit_card"}
  ]
}
```

Redacted audio replaced with silence or tone.

**Speech-to-Text (STT):**

**Supported Engines:**
1. **OpenAI Whisper** (best accuracy, $0.006/min)
2. **Deepgram** (fastest, $0.0043/min)
3. **AWS Transcribe** (compliance, $0.024/min)

**Transcription Request:**
```bash
POST /v1/recordings/:id/transcribe
```

Response (async):
```json
{
  "transcription_id": "trans_01J1KQZX9F7GH4",
  "status": "processing",
  "webhook_url": "https://example.com/webhooks/transcription"
}
```

Webhook payload when complete:
```json
{
  "event": "transcription.completed",
  "transcription_id": "trans_01J1KQZX9F7GH4",
  "recording_id": "rec_01J1KQZX9F7GH4",
  "text": "Thank you for calling. How can I help you today?",
  "confidence": 0.95,
  "words": [
    {"word": "Thank", "start": 0.0, "end": 0.2, "confidence": 0.99},
    {"word": "you", "start": 0.2, "end": 0.4, "confidence": 0.98}
  ]
}
```

**Sentiment Analysis:**

Optional add-on, uses OpenAI GPT-4o or similar:

```json
{
  "sentiment": "positive",
  "score": 0.78,
  "keywords": ["happy", "satisfied", "thank you"],
  "summary": "Customer was satisfied with the service provided."
}
```

Cost: $0.01-0.03 per call (depending on length)

**Database Schema:**
```sql
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL, -- s3://bucket/tenant123/file.mp3
  duration_seconds INTEGER,
  format VARCHAR(20),
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  storage_key VARCHAR(500) NOT NULL,
  duration_seconds INTEGER,
  channels INTEGER DEFAULT 1, -- 1 = mono, 2 = stereo
  redaction_json JSONB, -- redacted time ranges
  transcription_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- based on retention policy
);

CREATE INDEX idx_recordings_call ON recordings(call_id);
CREATE INDEX idx_recordings_expires ON recordings(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  confidence NUMERIC(3,2),
  words JSONB, -- word-level timestamps
  sentiment JSONB, -- optional sentiment analysis
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Acceptance Criteria:**
- TTS generates audio in <500ms for 200-character prompt
- TTS cache hit returns URL in <50ms (no generation cost)
- Audio upload transcoded to 8kHz mono WAV automatically
- Recording uploaded to storage within 30 seconds of call end
- Signed URL for recording expires after 15 minutes
- Redacted recording has silence where specified (verified via waveform)
- STT transcription accuracy >90% for clear audio (measured on test set)
- Sentiment analysis completes within 10 seconds for 5-minute call

---

(Continued in next message due to length...)

---

### 9.7 WebRTC and Softphone

**WebRTC Token Endpoint:**

```bash
POST /v1/tokens/webrtc
{
  "agent_id": "agent_01J1KQZX9F7GH4",
  "ttl_seconds": 3600
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-01-15T15:32:11.234Z",
  "stun_servers": ["stun:stun.irisx.com:3478"],
  "turn_servers": [{
    "urls": "turn:turn.irisx.com:3478",
    "username": "1705329131:agent_01J1KQZ",
    "credential": "generated_credential"
  }]
}
```

**Token Claims:**
```json
{
  "sub": "agent_01J1KQZX9F7GH4",
  "tenant_id": "tenant_01J1KQZ",
  "role": "agent",
  "iat": 1705329131,
  "exp": 1705332731
}
```

**TURN/STUN Setup:**

- **STUN:** Public STUN server (stun.irisx.com) for NAT traversal
- **TURN:** coturn running on same EC2 as FreeSWITCH (startup), dedicated instances (scale)
- **Cloudflare Calls:** Alternative (beta), zero-config WebRTC

**coturn Configuration:**

```ini
listening-port=3478
tls-listening-port=5349
realm=turn.irisx.com
use-auth-secret
static-auth-secret=your_secret_here
```

**Generate TURN credentials:**
```javascript
const crypto = require('crypto');
const ttl = 24 * 3600; // 24 hours
const username = Math.floor(Date.now() / 1000) + ttl + ':agent_01J1KQZ';
const hmac = crypto.createHmac('sha1', 'your_secret_here');
hmac.update(username);
const credential = hmac.digest('base64');
```

**Softphone Vue Component:**

Features:
- **Mute:** Toggle microphone
- **Hold:** Place call on hold (play music to caller)
- **Transfer:** Blind or attended transfer
- **Wrap-up:** Post-call notes entry
- **Agent Status:** Toggle between available, busy, wrap-up, offline

**Component Structure:**

```vue
<template>
  <div class="softphone">
    <div class="call-info" v-if="activeCall">
      <p>{{ activeCall.from }}</p>
      <p>{{ callDuration }}</p>
    </div>
    <div class="controls">
      <button @click="toggleMute">{{ muted ? 'Unmute' : 'Mute' }}</button>
      <button @click="toggleHold">{{ onHold ? 'Resume' : 'Hold' }}</button>
      <button @click="transfer">Transfer</button>
      <button @click="hangup" class="hangup">End Call</button>
    </div>
    <div class="status">
      <select v-model="agentStatus" @change="updateStatus">
        <option value="available">Available</option>
        <option value="busy">Busy</option>
        <option value="wrap_up">Wrap-Up</option>
        <option value="offline">Offline</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { JsSIP } from 'jssip';

const activeCall = ref(null);
const muted = ref(false);
const onHold = ref(false);
const agentStatus = ref('offline');

let rtcSession = null;

onMounted(async () => {
  const { token, stun_servers, turn_servers } = await fetchWebRTCToken();

  const socket = new JsSIP.WebSocketInterface('wss://sip.irisx.com');
  const ua = new JsSIP.UA({
    sockets: [socket],
    uri: 'sip:agent@irisx.com',
    authorization_jwt: token,
    ice_servers: [...stun_servers, ...turn_servers]
  });

  ua.start();

  ua.on('newRTCSession', (e) => {
    rtcSession = e.session;
    activeCall.value = { from: e.request.from.display_name };
  });
});

const toggleMute = () => {
  if (rtcSession) {
    muted.value = !muted.value;
    rtcSession.mute({ audio: muted.value });
  }
};

const toggleHold = () => {
  if (rtcSession) {
    onHold.value = !onHold.value;
    onHold.value ? rtcSession.hold() : rtcSession.unhold();
  }
};

const hangup = () => {
  if (rtcSession) {
    rtcSession.terminate();
    activeCall.value = null;
  }
};
</script>
```

**WebRTC Libraries:**
- **JsSIP:** Most mature, SIP.js alternative
- **Sipster:** Lightweight, modern
- **Cloudflare Calls SDK:** If using Cloudflare's WebRTC service

**Database Schema:**
```sql
CREATE TABLE webrtc_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webrtc_tokens_expires ON webrtc_tokens(expires_at);
```

**Acceptance Criteria:**
- WebRTC token generated and returned in <200ms
- Softphone connects to SIP server within 3 seconds
- Audio quality MOS >4.0 (tested via PESQ)
- Mute, hold, transfer functions work without audio glitches
- Token cannot be reused after expiry (enforced by FreeSWITCH)
- TURN relay works from restricted corporate networks
- Agent status change reflects in supervisor dashboard within 500ms

---

### 9.8 Billing and Analytics

**CDR Write Path:**

```
FreeSWITCH → NATS event → Worker → Postgres CDR table
                      ↓
                   ClickHouse (analytics copy)
```

**CDR Schema:**
```sql
CREATE TABLE cdr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(255) UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL, -- completed, failed, busy, no-answer
  start_time TIMESTAMPTZ NOT NULL,
  answer_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER, -- ring + talk time
  billable_seconds INTEGER, -- talk time only
  disposition VARCHAR(50), -- ANSWERED, NO_ANSWER, BUSY, FAILED
  hangup_cause VARCHAR(100),
  carrier VARCHAR(50),
  region VARCHAR(50), -- us-east-1, us-west-2
  codec VARCHAR(20), -- PCMU, PCMA, OPUS
  rate NUMERIC(10,6), -- rate per minute
  cost NUMERIC(10,4), -- total cost for this call
  recording_id UUID REFERENCES recordings(id),
  custom_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (start_time);

-- Partitions by month for performance
CREATE TABLE cdr_2025_01 PARTITION OF cdr FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE cdr_2025_02 PARTITION OF cdr FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- ... create partitions automatically via cron job or pg_partman

CREATE INDEX idx_cdr_tenant_time ON cdr(tenant_id, start_time DESC);
CREATE INDEX idx_cdr_call_id ON cdr(call_id);
```

**Rating Engine:**

Real-time rating as calls complete:

```javascript
async function rateCall(cdr) {
  // Lookup rate card for destination
  const rate = await getRateForDestination(cdr.to_number, cdr.carrier);

  // Calculate cost
  const billableMinutes = Math.ceil(cdr.billable_seconds / 60);
  const cost = billableMinutes * rate.per_minute_cost;

  // Apply taxes and surcharges
  const taxes = cost * 0.10; // Example: 10% telecom tax
  const surcharges = 0.02; // Example: $0.02 regulatory fee

  const totalCost = cost + taxes + surcharges;

  // Write to invoice line items
  await createInvoiceLineItem({
    tenant_id: cdr.tenant_id,
    call_id: cdr.call_id,
    description: `Call to ${cdr.to_number}`,
    quantity: billableMinutes,
    unit_price: rate.per_minute_cost,
    subtotal: cost,
    taxes,
    surcharges,
    total: totalCost,
    period: getCurrentBillingPeriod()
  });

  return { cost, totalCost };
}
```

**Rate Cards:**

```sql
CREATE TABLE rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID, -- NULL = default rate card
  destination_prefix VARCHAR(20) NOT NULL, -- +1, +44, +1212
  destination_name VARCHAR(255), -- "United States", "New York City"
  carrier VARCHAR(50), -- twilio, telnyx, bandwidth
  route_class VARCHAR(50), -- standard, premium, tollfree
  per_minute_cost NUMERIC(10,6) NOT NULL,
  effective_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_cards_prefix ON rate_cards(destination_prefix);
CREATE INDEX idx_rate_cards_tenant ON rate_cards(tenant_id) WHERE tenant_id IS NOT NULL;
```

**Prefix Matching:**

Longest prefix match for accurate rating:

```sql
-- Rate lookup for +12125551234 (NYC number)
SELECT * FROM rate_cards
WHERE destination_prefix = ANY(ARRAY[
  '+12125551234', -- exact match
  '+1212555123',  -- 10-digit
  '+121255512',   -- 9-digit
  '+12125551',    -- 8-digit
  '+1212555',     -- 7-digit
  '+121255',      -- 6-digit
  '+12125',       -- 5-digit
  '+1212',        -- 4-digit (NYC)
  '+121',         -- 3-digit
  '+12',          -- 2-digit
  '+1'            -- 1-digit (US)
])
AND (tenant_id = ? OR tenant_id IS NULL)
ORDER BY LENGTH(destination_prefix) DESC, tenant_id NULLS LAST
LIMIT 1;
```

**Invoice Generation:**

Monthly invoices auto-generated on 1st of month:

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- INV-2025-01-00123
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  taxes NUMERIC(10,2) DEFAULT 0,
  surcharges NUMERIC(10,2) DEFAULT 0,
  credits NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft', -- draft, sent, paid, overdue
  due_date DATE,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  call_id VARCHAR(255),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,6) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  taxes NUMERIC(10,2) DEFAULT 0,
  surcharges NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
```

**Invoice PDF Generation:**

Use Puppeteer or similar to generate PDF from HTML template:

```javascript
import puppeteer from 'puppeteer';

async function generateInvoicePDF(invoice) {
  const html = renderInvoiceHTML(invoice); // Template engine (Handlebars, EJS)

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html);

  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', right: '10mm', bottom: '20mm', left: '10mm' }
  });

  await browser.close();

  // Upload to R2/S3
  const pdfUrl = await uploadToStorage(pdf, `invoices/${invoice.id}.pdf`);

  // Update invoice record
  await updateInvoice(invoice.id, { pdf_url: pdfUrl });

  return pdfUrl;
}
```

**Usage Dashboards:**

Real-time usage displayed in portal:

**Today's Usage:**
- Calls: 1,234 (↑ 15% vs yesterday)
- Minutes: 5,678 (↓ 5% vs yesterday)
- Spend: $113.56 (on track for $3,400 this month)
- Top destinations: US (80%), Canada (10%), UK (5%)

**This Month:**
- Total calls: 45,000
- Total minutes: 150,000
- Current spend: $3,000
- Projected spend: $3,400 (based on current pace)
- Spend limit: $5,000 (60% used)

**Spend Alerts:**

Configurable thresholds:

```sql
CREATE TABLE spend_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  threshold_pct INTEGER NOT NULL, -- 50, 80, 100
  threshold_amount NUMERIC(10,2), -- absolute dollar amount
  notification_method VARCHAR(50) NOT NULL, -- webhook, email, sms
  webhook_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(20),
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Worker checks spend every 5 minutes:

```javascript
async function checkSpendAlerts() {
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    const currentSpend = await getCurrentMonthSpend(tenant.id);
    const spendLimit = tenant.limits.monthly_spend_limit;
    const spendPct = (currentSpend / spendLimit) * 100;

    const alerts = await getSpendAlerts(tenant.id);

    for (const alert of alerts) {
      if (spendPct >= alert.threshold_pct && !alert.triggered_at) {
        // Send notification
        await sendSpendAlert(tenant, alert, currentSpend, spendLimit);

        // Mark as triggered
        await markAlertTriggered(alert.id);
      }
    }
  }
}
```

**Analytics in ClickHouse:**

CDR data streamed to ClickHouse for fast analytics:

```sql
CREATE TABLE cdr (
  call_id String,
  tenant_id String,
  direction String,
  from_number String,
  to_number String,
  status String,
  start_time DateTime,
  answer_time Nullable(DateTime),
  end_time DateTime,
  duration_seconds UInt32,
  billable_seconds UInt32,
  disposition String,
  carrier String,
  region String,
  codec String,
  rate Decimal(10,6),
  cost Decimal(10,4),
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (tenant_id, start_time);
```

**Example Queries:**

**Average call duration by day:**
```sql
SELECT
  toDate(start_time) AS date,
  AVG(billable_seconds) AS avg_duration
FROM cdr
WHERE tenant_id = 'tenant123'
  AND start_time >= now() - INTERVAL 30 DAY
GROUP BY date
ORDER BY date;
```

**Top destinations by spend:**
```sql
SELECT
  substring(to_number, 1, 2) AS country_code,
  COUNT(*) AS calls,
  SUM(cost) AS total_cost
FROM cdr
WHERE tenant_id = 'tenant123'
  AND start_time >= toStartOfMonth(now())
GROUP BY country_code
ORDER BY total_cost DESC
LIMIT 10;
```

**Answer seizure ratio (ASR) by carrier:**
```sql
SELECT
  carrier,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE disposition = 'ANSWERED') AS answered_calls,
  (answered_calls * 100.0 / total_calls) AS asr_pct
FROM cdr
WHERE start_time >= now() - INTERVAL 24 HOUR
GROUP BY carrier
ORDER BY asr_pct DESC;
```

**Acceptance Criteria:**
- CDR written to Postgres within 5 seconds of call end
- Rating engine calculates cost in <100ms per call
- Invoice generated automatically on 1st of month, PDF available within 5 minutes
- Usage dashboard updates in real-time (within 10 seconds of call end)
- Spend alert webhook fired within 1 minute of threshold breach
- ClickHouse queries return in <1 second for 1M+ CDR rows

---

(Continued in next message...)<

**Token limit reached. I'll write the remaining sections directly to the file.**