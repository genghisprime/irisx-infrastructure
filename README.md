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

**Phase:** Pre-development (planning complete ✅)
**Next Step:** Phase 0, Week 1 - AWS Infrastructure Setup
**Timeline:** 34 weeks to production launch
**Startup Cost:** ~$70/mo

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
