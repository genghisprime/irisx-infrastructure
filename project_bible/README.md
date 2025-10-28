# IRIS Multi-Channel Communications Platform - Project Bible

> **The complete technical and business blueprint for building the next-generation IRIS platform**

---

## 🚨 **IF CLAUDE CRASHES - READ THIS FIRST**

**To recover context and continue building:**

```
Say to new Claude: "Read SESSION_RECOVERY.md and let's continue building IRIS"
```

**Or to start a specific task:**

```
Say to new Claude: "Read SESSION_RECOVERY.md, then work on [task name from checklist]"
```

**Critical Files for Recovery:**
1. 📄 **[SESSION_RECOVERY.md](../SESSION_RECOVERY.md)** - Quick context (5 min read)
2. 📋 **[00_MASTER_CHECKLIST.md](../00_MASTER_CHECKLIST.md)** - 500+ tasks organized
3. 📚 **[01_START_HERE_Tech_Stack_Development_Order.md](01_START_HERE_Tech_Stack_Development_Order.md)** - Complete tech stack

---

This directory contains the master scope of work, architecture decisions, implementation plans, and operational guides for **IRIS** - a unified multi-channel communications platform that enables developers and enterprises to reach customers across **voice, SMS, email, and social media** from a single API.

## 🌟 **What is IRIS?**

IRIS (by TechRadium - 20+ years in communications) is the platform that **Twilio + SendGrid + Hootsuite combined *should* have been**:

- 📞 **Voice:** Calls, IVR, queues, recording (FreeSWITCH + multi-carrier)
- 💬 **SMS/MMS:** Text messaging with least-cost routing across 4+ providers
- 📧 **Email:** Transactional + bulk email (managed providers + self-hosted SMTP)
- 📱 **Social:** Facebook, Twitter, Discord, Telegram, WhatsApp Business
- 📡 **RSS + Widgets:** Real-time alert feeds embedded on customer websites
- 🎯 **Unified API:** One endpoint, all channels, smart fallback, intelligent routing

---

## 📚 Table of Contents

- [Quick Start](#quick-start)
- [Document Structure](#document-structure)
- [How to Use This Bible](#how-to-use-this-bible)
- [Development Phases](#development-phases)
- [Key Decisions](#key-decisions)
- [Getting Help](#getting-help)

---

## 🚀 Quick Start

**New to the project?** Start here:

1. **Read:** [Executive Summary](#executive-summary) (5 min)
2. **Review:** [Tech Stack](#tech-stack) (10 min)
3. **Understand:** [Startup Phase](#startup-phase) (15 min)
4. **Plan:** [Phase 0 - Foundations](#phase-0-foundations) (30 min)

**Ready to build?** Jump to:
- [Order of Development](IRIS%20X_call_master_scope_of_work_v_2_part3.md#27-order-of-development)
- [Infrastructure Setup](IRIS%20X_call_master_scope_of_work_v_2_part3.md#15-infrastructure-and-deployment)
- [Operational Runbooks](IRIS%20X_call_master_scope_of_work_v_2_part3.md#31-operational-runbooks)

---

## 📖 Document Structure

This bible contains **25 comprehensive documents** covering the complete platform:

### **🛠️ Tech Stack & Development Order** ⭐⭐⭐ **START HERE FIRST**
📄 [`IRIS_Tech_Stack_Development_Order.md`](IRIS_Tech_Stack_Development_Order.md)

**Final tech decisions & organized roadmap** | ~40 pages | **NEW** | **REQUIRED READING**

#### What's Inside:
- **✅ Confirmed Tech Stack** - Vue 3.5 (frontend) + Node.js 22 (backend) - YOUR preferences respected
- **Complete Stack Overview** - Every technology decision explained with rationale
- **6-Phase Development Order** - 34 weeks, organized by dependencies
- **Weekly Breakdown** - Specific tasks for each week with exit criteria
- **Module Dependencies** - What must be built first (critical path)
- **Team Structure** - 5-6 people initially, 9-10 at scale
- **Infrastructure Costs** - $50/mo (Phase 0) → $1,500/mo (Production)
- **Timeline & Milestones** - Beta launch Week 12, Production Week 34

#### Why This Document First:
- **Confirms Vue 3 for all frontend work** (your preference)
- **Confirms Node.js 22 for all backend work** (your preference)
- **Organized development order** - build in logical sequence
- **Clear dependencies** - know what blocks what
- **Realistic timeline** - 8 months to feature-complete platform

**Read this before anything else to understand the build plan!**

---

### **🌐 Multi-Channel Master Architecture** ⭐ **READ SECOND**
📄 [`IRIS_Multi_Channel_Platform_Architecture.md`](IRIS_Multi_Channel_Platform_Architecture.md)

**Complete multi-channel guide** | ~90 pages | **NEW**

#### What's Inside:
- **Unified API Design** - Single endpoint for voice + SMS + email + social
- **Broadcast Modes** - All channels, cascade, single, staged, smart adaptive
- **Provider Abstraction Layer** - Multi-provider support per channel
- **Least-Cost Routing Engine** - Automatic provider selection (30-50% savings)
- **Channel Implementations:**
  - Voice (FreeSWITCH, Twilio, Telnyx, Bandwidth)
  - SMS (Telnyx, Plivo, Vonage, Twilio)
  - Email (ElasticEmail, Postmark, SendGrid, self-hosted SMTP)
  - Social (Facebook, Twitter, Discord, Telegram, WhatsApp)
  - RSS Feeds + Embeddable Widgets
- **No-Code Flow Builder** - Visual drag-and-drop campaign builder
- **Multi-Channel Data Model** - Unified messages + deliveries tables
- **Cost Model (All Channels)** - Startup ($241/mo) to Scale ($4,430/mo)
- **4-Phase Rollout Plan** - Voice+SMS → Email+Social → RSS+Widgets → Enterprise

**Read this first to understand the complete platform vision!**

---

### **📋 Compliance & Legal Guide**
📄 [`IRIS_Compliance_Legal_Guide.md`](IRIS_Compliance_Legal_Guide.md)

**Complete legal implementation** | ~65 pages | **NEW**

#### What's Inside:
- **TCPA Compliance** - Consent collection, time zone enforcement, frequency caps
- **CAN-SPAM Compliance** - Email headers, unsubscribe implementation
- **GDPR Compliance** - Data export (DSAR), right to erasure, cookie consent
- **CASL Compliance** - Canadian anti-spam law requirements
- **A2P 10DLC Registration** - Brand/campaign registration workflows
- **STIR/SHAKEN** - Call authentication implementation
- **Consent Management System** - Complete consent tracking with database schemas
- **Opt-Out & Unsubscribe** - Multi-channel opt-out handling
- **DNC Registry Integration** - Do Not Call list checking
- **Recording Consent** - Two-party state compliance
- **Compliance Dashboard** - Real-time compliance monitoring
- **Legal Disclaimers** - Ready-to-use templates
- **Compliance Testing** - Automated test suites

---

### **📊 Campaign Management System**
📄 [`IRIS_Campaign_Management.md`](IRIS_Campaign_Management.md)

**Complete campaign management** | ~50 pages | **NEW**

#### What's Inside:
- **Contact & List Management** - Static and dynamic lists with CSV import
- **Campaign Types** - Bulk, scheduled, recurring, drip, triggered, A/B test
- **Multi-Channel Execution** - SMS, email, voice, social with broadcast modes
- **Advanced Segmentation** - Rule-based targeting with geo-location
- **A/B Testing Framework** - Automated variant testing with winner selection
- **Drip Campaigns** - Multi-step automation with conditional logic
- **Template Management** - Handlebars-based with custom helpers
- **Campaign Analytics** - Real-time dashboards with delivery/open/click rates
- **Rate Limiting** - Token bucket algorithm with burst handling
- **Approval Workflows** - Multi-level campaign approval system
- **Import/Export** - CSV/JSON/Excel with CRM integrations

---

### **📈 Analytics & Reporting System**
📄 [`IRIS_Analytics_Reporting.md`](IRIS_Analytics_Reporting.md)

**Complete analytics platform** | ~40 pages | **NEW**

#### What's Inside:
- **Real-Time Metrics** - Live dashboards with WebSocket streaming
- **Event Tracking** - Comprehensive message lifecycle tracking
- **Campaign Analytics** - Performance metrics, A/B test results, geographic distribution
- **Channel Performance** - Provider comparison, delivery rates, error analysis
- **Engagement Scoring** - Contact-level engagement with recency decay
- **Quality Metrics** - Delivery rates, bounce tracking, suppression lists
- **Financial Analytics** - Cost tracking, budget alerts, LCR savings calculation
- **Custom Reports** - Dynamic report builder with scheduled exports
- **Data Warehouse ETL** - NDJSON exports to S3/GCS, BigQuery integration
- **Anomaly Detection** - Statistical anomaly detection with real-time alerts
- **API Analytics** - Request tracking, response times, error rates

---

### **💳 Billing & Payment Processing**
📄 [`IRIS_Billing_Payments.md`](IRIS_Billing_Payments.md)

**Complete billing system** | ~35 pages | **NEW**

#### What's Inside:
- **Subscription Management** - Multiple plans with tiered pricing
- **Usage-Based Billing** - Pay-per-message with overage rates
- **Stripe Integration** - Full payment processing with webhooks
- **Invoicing** - Automated invoice generation with PDF receipts
- **Credit System** - Promotional credits, refunds, prepaid balances
- **Provider Cost Tracking** - Margin calculation and profitability analysis
- **Reseller Billing** - White-label custom pricing with markup
- **Tax Calculation** - TaxJar integration for sales tax
- **Dunning Management** - Automated retry with exponential backoff
- **Revenue Reporting** - MRR, churn rate, revenue analytics
- **PCI Compliance** - Tokenized payments, no card storage

---

### **🛠️ Admin & Support Tools**
📄 [`IRIS_Admin_Support_Tools.md`](IRIS_Admin_Support_Tools.md)

**Complete admin platform** | ~30 pages | **NEW**

#### What's Inside:
- **Admin Dashboard** - System-wide metrics and health monitoring
- **User Management** - RBAC with granular permissions
- **Tenant Management** - Suspend, reactivate, delete tenants
- **System Monitoring** - Real-time health checks and alerting
- **Support Tickets** - Full ticketing system with SLA tracking
- **Audit Logging** - Complete activity tracking for compliance
- **Feature Flags** - Gradual rollouts with percentage and tenant targeting
- **Impersonation** - Admin debugging with full audit trail
- **Provider Management** - Enable/disable providers, view health
- **System Config** - Global settings management
- **API Key Management** - Generate, revoke, scope-based keys
- **Webhook Management** - Event subscriptions with retry logic

---

### **🚀 Customer Onboarding & Self-Service Portal**
📄 [`IRIS_Customer_Onboarding_Portal.md`](IRIS_Customer_Onboarding_Portal.md)

**Complete onboarding system** | ~35 pages | **NEW** | **PRIORITY #1**

#### What's Inside:
- **Registration & Sign-Up** - Email verification, tenant provisioning
- **5-Minute Onboarding Wizard** - Interactive 5-step setup
- **API Playground** - Test APIs directly in dashboard
- **Self-Service Number Purchasing** - Search and buy phone numbers instantly
- **Account & Team Management** - User roles, permissions, team invites
- **Usage Dashboard** - Real-time usage metrics and billing estimates
- **Billing Portal** - Self-service subscription and payment management
- **In-App Notifications** - Announcements, product tours, tooltips
- **Product Tours** - Interactive walkthroughs with Shepherd.js
- **Progress Tracking** - Onboarding completion percentage

---

### **👨‍💻 Developer Experience & SDKs**
📄 [`IRIS_Developer_Experience_SDKs.md`](IRIS_Developer_Experience_SDKs.md)

**Complete DX toolkit** | ~32 pages | **NEW** | **PRIORITY #2**

#### What's Inside:
- **OpenAPI 3.1 Specification** - Machine-readable API definition
- **SDK Generation Pipeline** - Auto-generate SDKs from OpenAPI
- **7 Official SDKs** - JavaScript, Python, PHP, Ruby, Go, Java, C#
- **Code Examples Library** - Copy-paste examples in all languages
- **Postman/Insomnia Collections** - Pre-configured API collections
- **CLI Tool** - Command-line interface for quick testing (`iris sms`, `iris call`)
- **Docker Compose** - Local development environment
- **Webhook Testing Tools** - ngrok integration and request inspector
- **Integration Guides** - Framework-specific tutorials (Rails, Laravel, Next.js)
- **Type Safety** - Full TypeScript/type definitions
- **Error Handling** - Clear, actionable error messages with solutions

---

### **📚 Documentation Site**
📄 [`IRIS_Documentation_Site.md`](IRIS_Documentation_Site.md)

**Complete docs platform** | ~28 pages | **NEW** | **PRIORITY #3**

#### What's Inside:
- **Mintlify Platform** - Modern, beautiful documentation site
- **Auto-Generated API Reference** - From OpenAPI specification
- **5-Minute Quickstart** - Get developers to first message in < 5 minutes
- **Multi-Language Examples** - Code samples in 7+ languages
- **Interactive Playground** - Test APIs directly in docs
- **Algolia DocSearch** - Fast, powerful search
- **Video Tutorials** - Embedded screencasts for complex features
- **Versioning & Changelog** - Version-specific docs with migration guides
- **Community Integration** - Discord, GitHub, Stack Overflow links
- **Analytics & Feedback** - Track page views, code copies, "Was this helpful?"
- **SEO Optimization** - Meta tags, sitemap, structured data

---

### **🔐 Authentication & Identity Management**
📄 [`IRIS_Authentication_Identity_RBAC.md`](IRIS_Authentication_Identity_RBAC.md)

**Complete auth system** | ~65 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Multi-Tenant Architecture** - Row-level security with tenant isolation
- **Company Signup & Provisioning** - Self-service tenant creation with email verification
- **JWT Authentication** - Access + refresh token system
- **Role-Based Access Control** - 6 system roles (Owner, Admin, Manager, Developer, Member, Viewer)
- **Granular Permissions** - 40+ permissions across all resources
- **User Lifecycle Management** - Invitations, password reset, email verification
- **Team Management** - Teams, assignments, hierarchies
- **API Key Authentication** - Scoped API keys with rate limiting
- **OAuth 2.0 Integration** - Google, Microsoft, GitHub login
- **SAML 2.0 SSO** - Enterprise single sign-on
- **2FA/MFA** - TOTP-based multi-factor authentication
- **Security Features** - Password policies, IP whitelisting, session management
- **Audit Logging** - Complete activity tracking for compliance

---

### **🎙️ Media Processing & TTS/STT**
📄 [`IRIS_Media_Processing_TTS_STT.md`](IRIS_Media_Processing_TTS_STT.md)

**Complete media platform** | ~50 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Multi-Provider TTS** - OpenAI, ElevenLabs, Google Cloud, AWS Polly
- **TTS Router with Failover** - Automatic provider fallback and cost optimization
- **Multi-Provider STT** - OpenAI Whisper, Deepgram, Google Speech-to-Text
- **Real-Time Transcription** - Live streaming transcription with WebSocket
- **Audio Processing** - Normalization, compression, format conversion (FFmpeg)
- **Video Processing** - Transcoding, thumbnail generation, format conversion
- **Image Processing** - Optimization, resizing, format conversion (Sharp)
- **Voice Cloning** - ElevenLabs voice cloning for custom voices
- **Media Storage & CDN** - CloudFront + R2 for global delivery
- **WebRTC Audio Streaming** - Real-time audio streaming for calls
- **Cost Optimization** - Provider selection based on cost/quality/speed
- **Usage Tracking** - Complete usage analytics and cost tracking

---

### **🗺️ Geocoding & Location Services**
📄 [`IRIS_Geocoding_Location_Services.md`](IRIS_Geocoding_Location_Services.md)

**Complete location platform** | ~45 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Multi-Provider Geocoding** - Google Maps, Mapbox, Nominatim, SmartyStreets
- **Reverse Geocoding** - Convert coordinates to addresses
- **Geographic Targeting** - Radius, polygon, bounding box, ZIP code, county (FIPS)
- **PostGIS Spatial Database** - GEOMETRY columns with spatial indexes
- **Map-Based Emergency Alerts** - Draw polygons for IPAWS/WEA/EAS alerts
- **IPAWS Polygon Integration** - Import and process emergency alert polygons
- **Geofencing & Proximity** - Location-based triggers and alerts
- **Timezone Detection** - TCPA compliance (9am-9pm local time rule)
- **Address Validation** - USPS and SmartyStreets validation
- **Distance Calculation** - Haversine formula and PostGIS distance queries
- **Caching Strategy** - Redis caching for geocoding results (30-day TTL)
- **Cost Optimization** - Provider fallback and result caching

---

### **🔒 Call Recording Encryption & Security**
📄 [`IRIS_Call_Recording_Encryption_Security.md`](IRIS_Call_Recording_Encryption_Security.md)

**Enterprise-grade security** | ~60 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **AES-256-GCM Encryption** - FIPS 140-2 compliant encryption at rest
- **TLS 1.3** - Encryption in transit for all recordings
- **Key Management** - AWS KMS or HashiCorp Vault integration
- **Per-Tenant Keys** - Data isolation with separate encryption keys
- **HIPAA/PCI Compliance** - BAA-ready for healthcare & finance
- **Secure Playback URLs** - Temporary signed URLs (15-minute TTL)
- **RBAC Access Control** - Role-based recording access with audit logs
- **Retention Policies** - Automatic deletion after retention period
- **GDPR Support** - Right to erasure, data export
- **PCI Redaction** - Mute/redact sensitive payment information
- **Cost Optimization** - $0.0003/recording (0.03¢) at scale

---

### **📊 Call Quality Monitoring & MOS Scoring**
📄 [`IRIS_Call_Quality_Monitoring_MOS.md`](IRIS_Call_Quality_Monitoring_MOS.md)

**Real-time quality analytics** | ~55 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **MOS Calculation** - ITU-T E-Model for Mean Opinion Score (1.0-5.0)
- **RTCP Monitoring** - Real-time jitter, packet loss, latency tracking
- **FreeSWITCH Integration** - ESL event subscription for RTP stats
- **TimescaleDB** - Time-series database for fast quality queries
- **WebSocket Dashboards** - Live quality graphs during calls
- **Quality Alerts** - Automatic alerts when MOS < 3.0
- **Carrier Comparison** - Rank carriers by quality metrics
- **Agent Performance** - Quality reports per agent
- **Network Diagnostics** - Troubleshoot one-way audio, echo, latency
- **Predictive Quality** - ML-based quality issue prediction
- **Cost Tracking** - $0.003¢ per call for quality monitoring

---

### **📹 Video Calling & Screen Sharing**
📄 [`IRIS_Video_Calling_Screen_Sharing.md`](IRIS_Video_Calling_Screen_Sharing.md)

**WebRTC video platform** | ~50 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **WebRTC Implementation** - 1-on-1 and multi-party video calls
- **Screen Sharing** - Full screen or application window sharing
- **Co-Browsing** - Remote control for technical support (Surfly/Upscope)
- **Multi-Party Conferences** - Up to 50 participants with MediaSoup SFU
- **Video Recording** - Encrypted recording with same security as audio
- **Virtual Backgrounds** - TensorFlow.js background blur/replacement
- **Waiting Rooms** - Admission control for hosts
- **Mobile SDKs** - iOS & Android native SDKs
- **TURN Server** - Coturn for NAT traversal
- **Real-Time Chat** - Text chat during video calls
- **Cost Model** - $0.0002/min (0.02¢) per participant, 98% margin

---

### **🤖 AI Conversation Intelligence**
📄 [`IRIS_AI_Conversation_Intelligence.md`](IRIS_AI_Conversation_Intelligence.md)

**GPT-powered call analysis** | ~45 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Real-Time Transcription** - Deepgram WebSocket streaming (200ms latency)
- **Speaker Diarization** - Identify who said what (agent vs customer)
- **GPT-4 Analysis** - Automated summaries, sentiment, topics
- **Action Item Detection** - Extract commitments & follow-ups
- **Sentiment Analysis** - Real-time positive/neutral/negative scoring
- **Topic Extraction** - Categorize calls by subject matter
- **Compliance Monitoring** - Detect profanity, unauthorized promises
- **Competitor Mentions** - Track competitor brand names
- **Agent Coaching** - Performance insights & training recommendations
- **Semantic Search** - Find calls by topic using pgvector embeddings
- **Call Scoring** - Predicted CSAT (1-5 stars)
- **Cost Model** - $0.029/call (2.9¢) for full AI analysis, 71% margin

---

### **👔 Agent Desktop & Supervisor Tools**
📄 [`IRIS_Agent_Desktop_Supervisor_Tools.md`](IRIS_Agent_Desktop_Supervisor_Tools.md)

**Unified workspace & coaching** | ~70 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Unified Agent Desktop** - Softphone, CRM, knowledge base, omnichannel inbox in one interface
- **Supervisor Tools** - Whisper (coach), Barge (join), Monitor (listen) for real-time coaching
- **Real-Time Wallboards** - Queue metrics, agent status, SLA tracking with WebSocket updates
- **Quality Assurance** - Automated call scoring with AI, QA scorecards, performance reviews
- **WebRTC Softphone** - Built-in call controls with mute, hold, transfer, dialpad
- **CRM Integration Panel** - Customer context, call history, tickets, notes
- **Knowledge Base** - Integrated help articles with search
- **Omnichannel Inbox** - Voice, SMS, email, chat, social in one unified view
- **Wrap-Up & Disposition** - Post-call notes and categorization
- **Call Supervision Log** - Audit trail for all coaching activities
- **Cost Model** - $0.30/agent/month cost, 98.8% margin

---

### **🎤 Advanced IVR: Natural Language & Visual**
📄 [`IRIS_Advanced_IVR_NLU_Visual.md`](IRIS_Advanced_IVR_NLU_Visual.md)

**GPT-4 conversational IVR** | ~40 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Natural Language Understanding** - "I need help with my billing" → Routes to billing queue
- **GPT-4 Intent Recognition** - 95%+ accuracy for intent classification
- **Entity Extraction** - Automatically extract account numbers, dates, issues from speech
- **Dialog Management** - Multi-turn conversations with context tracking
- **Visual IVR** - Mobile-first menu with icons and tap navigation (no listening)
- **Context-Aware Routing** - Knows caller history, account status, open tickets
- **FreeSWITCH Integration** - Lua scripts for real-time NLU processing
- **Self-Service Flows** - Handle common requests without agent (check balance, pay bill)
- **Fallback Handling** - Graceful degradation to human agent
- **Personalized Menus** - Dynamic options based on customer profile
- **Cost Model** - $0.025/call (2.5¢) for NLU, 75% margin

---

### **📅 Workforce Management & Scheduling**
📄 [`IRIS_Workforce_Management_Scheduling.md`](IRIS_Workforce_Management_Scheduling.md)

**AI-powered scheduling & forecasting** | ~35 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **AI Call Volume Forecasting** - TensorFlow LSTM model predicts volume 30 days out
- **Automated Shift Scheduling** - Constraint satisfaction solver for optimal staffing
- **Real-Time Adherence Tracking** - Monitor if agents are at desk when scheduled
- **Break Management** - Scheduled breaks with automatic tracking
- **Time-Off Requests** - Agent self-service requests with approval workflow
- **Intraday Adjustments** - Offer overtime via SMS when queue spikes
- **Agent Preferences** - Respect preferred shifts, days off, skills
- **Fairness Algorithm** - Distribute desirable/undesirable shifts evenly
- **Schedule Templates** - Reusable shift patterns (9-5, 12-8, split shifts)
- **Compliance Rules** - Max hours/week, min rest between shifts, consecutive days
- **Calendar UI** - Agent-facing schedule calendar with mobile app
- **Cost Model** - $0.30/agent/month cost, 97% margin

---

### **🌐 Complete Platform Extensions**
📄 [`IRIS_Complete_Platform_Extensions.md`](IRIS_Complete_Platform_Extensions.md)

**Omnichannel, modern messaging, integrations** | ~50 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **Omnichannel Unified Queue** - Voice, SMS, email, chat, social in ONE queue with intelligent routing
- **Skills-Based Routing** - Match conversations to agents by channel skills + expertise
- **RCS Messaging** - Rich media for Android (2B+ devices) with buttons, carousels, verified sender
- **Push Notifications** - FCM (Android) + APNs (iOS) for mobile alerts
- **In-App Messaging SDKs** - iOS/Android/React Native SDKs for embedding chat
- **CRM Integrations** - Salesforce, HubSpot, Zendesk, Intercom connectors
- **Zapier & Make.com** - No-code automation with 5000+ apps
- **GraphQL API** - Modern alternative to REST with flexible queries
- **Callback Queue Management** - Virtual queue with estimated wait time + SMS confirmations
- **Knowledge Base Integration** - Zendesk, Confluence, custom KB search in agent desktop
- **ISO 27001 & HIPAA BAA** - Enterprise compliance certifications
- **Multi-Region Failover** - Route53 health checks + automatic regional failover

---

### **📦 Data Import & Contact Management API**
📄 [`IRIS_Data_Import_Contact_Management_API.md`](IRIS_Data_Import_Contact_Management_API.md)

**Complete import & contact APIs** | ~65 pages | **NEW** | **CRITICAL**

#### What's Inside:
- **5-Level Import Strategy** - CSV upload, Bulk API, CRM integrations, Database direct connect, API/webhooks
- **Smart Field Mapping** - AI-powered auto-detection (95%+ accuracy)
- **Duplicate Detection** - Multiple strategies (phone, email, custom fields)
- **Embeddable Import Widget** - React, Vue, Angular, vanilla JS components
- **White-Label Options** - Rebrand the widget for enterprise customers ($499/month)
- **Contact Management API** - Full CRUD, search, tagging, list/segment management
- **Export API** - Reverse of import (CSV, Excel, JSON)
- **Developer-First Design** - Get started in 5 minutes with stupid-simple APIs
- **Use Cases** - School alerts, e-commerce, SaaS onboarding, healthcare, real estate
- **Competitive Advantage** - Import-as-a-Service (Twilio doesn't have this)
- **OPTION** - Use your own contact database OR use IRIS (flexibility first)

#### Key Positioning:
- **"IRIS: The Complete Communications Backend"** - Not just messaging APIs
- **98% faster time to market** vs DIY + Twilio (7 weeks → 2 days)
- **40-60% cheaper** than competitors
- **Perfect for alert systems, emergency notifications, and marketing campaigns**
- **Extreme emphasis on ease of use** - All APIs super easy for developers

---

### **Part 1: Foundation & Architecture** (Voice-Only Baseline)
📄 [`IRIS X_call_master_scope_of_work_v_2.md`](IRIS%20X_call_master_scope_of_work_v_2.md)

**Sections 1-9** | ~40 pages

#### What's Inside:
- **Executive Summary** - Voice platform vision (subset of multi-channel)
- **Glossary** - All telecom and technical terms defined
- **Core Technology Stack** - Modern 2025 stack (Bun, Hono, Cloudflare, Neon)
- **Startup Phase Strategy** - How to start for <$200/month (voice only)
- **Cost Model & Unit Economics** - Voice-only pricing, margins, break-even
- **Architecture Diagrams** - System design, call flows, data flows
- **Major Modules** - Identity, Numbers, Calls, Queues, Dialer, Media, WebRTC, Billing

#### Key Topics:
- ✅ Why we chose each technology
- ✅ How to scale from 100 to 100K concurrent calls
- ✅ Detailed database schemas with indexes
- ✅ Cost breakdown per concurrent call
- ✅ Number porting (LNP) complete workflow

---

### **Part 2: APIs & Data**
📄 [`IRIS X_call_master_scope_of_work_v_2_part2.md`](IRIS%20X_call_master_scope_of_work_v_2_part2.md)

**Sections 10-14** | ~35 pages

#### What's Inside:
- **Event & Data Flow** - How events flow through the system (detailed diagrams)
- **High Volume Handling** - Scaling to 3-6K CPS, carrier strategy, pacing algorithms
- **API Surface v1** - Complete REST API documentation with examples
- **API Versioning Strategy** - Deprecation policy, breaking vs non-breaking changes
- **Data Model** - Complete PostgreSQL schemas with partitioning strategy

#### Key Topics:
- ✅ Every API endpoint with request/response examples
- ✅ Webhook security (HMAC signatures, replay protection)
- ✅ Rate limiting and error handling
- ✅ Database partitioning for 100M+ CDR rows
- ✅ Carrier health scoring and failover logic

---

### **Part 3: Operations & Launch**
📄 [`IRIS X_call_master_scope_of_work_v_2_part3.md`](IRIS%20X_call_master_scope_of_work_v_2_part3.md)

**Sections 15-32** | ~45 pages

#### What's Inside:
- **Infrastructure & Deployment** - Terraform code, Packer AMIs, CI/CD pipelines
- **Observability** - Metrics, alerts, dashboards (4 types)
- **Security & Compliance** - SOC 2, HIPAA, STIR/SHAKEN, encryption, audit logging
- **Fraud Detection** - 5 fraud patterns with automated detection rules
- **Disaster Recovery** - 6 scenarios with step-by-step recovery procedures
- **Testing Strategy** - Load tests, soak tests, chaos engineering
- **Go-to-Market** - Target customers, pricing, competitive positioning
- **Operational Runbooks** - 5 detailed runbooks with copy-paste commands
- **Development Timeline** - Week-by-week plan for 8 months

#### Key Topics:
- ✅ Terraform infrastructure as code (complete examples)
- ✅ Prometheus alerts and Grafana dashboards
- ✅ Fraud detection algorithms (velocity limits, geographic anomalies)
- ✅ Disaster recovery RTO/RPO targets
- ✅ 34-week development roadmap

---

## 🎯 How to Use This Bible

### **For Product Owners / Founders:**
1. Read [Executive Summary](IRIS%20X_call_master_scope_of_work_v_2.md#executive-summary)
2. Review [Cost Model](IRIS%20X_call_master_scope_of_work_v_2.md#8-cost-model--unit-economics)
3. Understand [Go-to-Market Strategy](IRIS%20X_call_master_scope_of_work_v_2_part3.md#29-go-to-market-strategy)
4. Check [Competitive Differentiation](IRIS%20X_call_master_scope_of_work_v_2_part3.md#30-competitive-differentiation)

### **For Technical Leads / Architects:**
1. Study [Tech Stack Rationale](IRIS%20X_call_master_scope_of_work_v_2.md#4-platform-choice-rationale)
2. Review [Architecture Diagrams](IRIS%20X_call_master_scope_of_work_v_2.md#6-architecture-diagrams)
3. Understand [High Volume Scaling](IRIS%20X_call_master_scope_of_work_v_2_part2.md#11-high-volume-handling-and-scaling)
4. Read [Build vs Buy Analysis](IRIS%20X_call_master_scope_of_work_v_2_part3.md#23-build-vs-buy-analysis)

### **For Backend Engineers:**
1. Review [API Surface v1](IRIS%20X_call_master_scope_of_work_v_2_part2.md#12-api-surface-v1)
2. Study [Data Model](IRIS%20X_call_master_scope_of_work_v_2_part2.md#14-data-model)
3. Implement modules from [Major Modules](IRIS%20X_call_master_scope_of_work_v_2.md#9-major-modules-and-deliverables)
4. Follow [Order of Development](IRIS%20X_call_master_scope_of_work_v_2_part3.md#27-order-of-development)

### **For Telephony Engineers:**
1. Review [FreeSWITCH Setup](IRIS%20X_call_master_scope_of_work_v_2_part3.md#infrastructure-as-code)
2. Study [Carrier Integration](IRIS%20X_call_master_scope_of_work_v_2.md#92-numbers-and-carriers)
3. Understand [Media Features](IRIS%20X_call_master_scope_of_work_v_2.md#96-media-features)
4. Review [SIP Proxy Strategy](IRIS%20X_call_master_scope_of_work_v_2_part2.md#edge-and-media)

### **For DevOps / SRE:**
1. Read [Infrastructure & Deployment](IRIS%20X_call_master_scope_of_work_v_2_part3.md#15-infrastructure-and-deployment)
2. Set up [Observability](IRIS%20X_call_master_scope_of_work_v_2_part3.md#16-observability-slos-and-kpis)
3. Practice [Operational Runbooks](IRIS%20X_call_master_scope_of_work_v_2_part3.md#31-operational-runbooks)
4. Plan [Disaster Recovery Drills](IRIS%20X_call_master_scope_of_work_v_2_part3.md#20-disaster-recovery-procedures)

### **For Security Engineers:**
1. Review [Security Controls](IRIS%20X_call_master_scope_of_work_v_2_part3.md#18-security-and-compliance-controls)
2. Implement [Fraud Detection](IRIS%20X_call_master_scope_of_work_v_2_part3.md#19-fraud-detection-and-prevention)
3. Plan [SOC 2 Compliance](IRIS%20X_call_master_scope_of_work_v_2_part3.md#compliance-frameworks)
4. Review [Incident Response Plan](IRIS%20X_call_master_scope_of_work_v_2_part3.md#incident-response-plan)

---

## 📅 Development Phases

### **Phase 0: Foundations** (Weeks 1-4)
**Goal:** Infrastructure ready, first call working end-to-end
**Cost:** <$50/month
**Team:** 2 engineers

**Key Milestones:**
- [ ] AWS account setup, Terraform baseline
- [ ] FreeSWITCH AMI built and deployed (t3.medium)
- [ ] Twilio trunk connected to FreeSWITCH
- [ ] Basic API deployed to EC2 (Hono.js on port 3000)
- [ ] Test call: API → NATS → FreeSWITCH → Twilio → PSTN ✅

**Exit Criteria:**
- 10 test calls, 100% success rate
- CDR written within 10 seconds
- Infrastructure cost <$50/month

📖 **Full Details:** [Section 27 - Phase 0](IRIS%20X_call_master_scope_of_work_v_2_part3.md#phase-0-foundations-weeks-1-4)

---

### **Phase 1: Core Calling** (Weeks 5-12)
**Goal:** Production-ready calling platform, 5 beta customers
**Cost:** $150-200/month
**Team:** 3-4 engineers

**Key Milestones:**
- [ ] TTS integration (OpenAI, ElevenLabs)
- [ ] Webhook system (HMAC signing, retry logic)
- [ ] Call control (Say, Play, Gather, Record, Transfer)
- [ ] Visual flow builder (Vue 3 drag-and-drop)
- [ ] API documentation (Mintlify)
- [ ] Load test: 100 concurrent, 20 CPS ✅

**Exit Criteria:**
- API docs published
- 5 beta customers active
- Load test passed (>98% success)
- Zero P0/P1 incidents for 2 weeks

📖 **Full Details:** [Section 27 - Phase 1](IRIS%20X_call_master_scope_of_work_v_2_part3.md#phase-1-core-calling-and-webhooks-weeks-5-12)

---

### **Phase 2: Queues & Agents** (Weeks 13-18)
**Goal:** ACD system for call centers
**Cost:** $150-200/month
**Team:** 4 engineers

**Key Milestones:**
- [ ] Redis-backed queue system
- [ ] Agent presence (WebSocket)
- [ ] Skills-based routing
- [ ] Supervisor dashboard (Vue 3)
- [ ] WebRTC softphone (JsSIP)
- [ ] First call center customer (10 agents) ✅

**Exit Criteria:**
- Queue holds 1K callers
- Agent status updates <500ms
- WebRTC works in Chrome/Firefox/Safari
- 1 call center customer in production

📖 **Full Details:** [Section 27 - Phase 2](IRIS%20X_call_master_scope_of_work_v_2_part3.md#phase-2-queues-and-agents-weeks-13-18)

---

### **Phase 3: Dialer & Billing** (Weeks 19-26)
**Goal:** Outbound dialer + billing system
**Cost:** $150-200/month
**Team:** 4-5 engineers

**Key Milestones:**
- [ ] Campaign management (CSV upload)
- [ ] Progressive dialer (1:1 ratio)
- [ ] Predictive dialer (2.5:1 ratio, <3% abandon)
- [ ] Billing engine (rating, invoices)
- [ ] Stripe integration
- [ ] Soak test: 1K concurrent, 2 hours ✅

**Exit Criteria:**
- Predictive dialer working
- Invoices auto-generated (99.9% accurate)
- First paying customer ($199/mo)
- MRR >$1,000

📖 **Full Details:** [Section 27 - Phase 3](IRIS%20X_call_master_scope_of_work_v_2_part3.md#phase-3-dialer-and-billing-weeks-19-26)

---

### **Phase 4: Enterprise Ready** (Weeks 27-34)
**Goal:** Multi-carrier, multi-region, 10K concurrent
**Cost:** $500-1,000/month
**Team:** 5-6 engineers

**Key Milestones:**
- [ ] Second carrier (Telnyx or Bandwidth)
- [ ] Kamailio load balancer
- [ ] Multi-region (us-east-1 + us-west-2)
- [ ] STT + sentiment analysis
- [ ] SOC 2 readiness review
- [ ] First enterprise customer ($5K+/mo) ✅

**Exit Criteria:**
- Multi-carrier failover working
- Multi-region RTO <15 minutes
- Infrastructure handles 5K concurrent
- MRR >$10K

📖 **Full Details:** [Section 27 - Phase 4](IRIS%20X_call_master_scope_of_work_v_2_part3.md#phase-4-multi-carrier-multi-region-weeks-27-34)

---

## 🔑 Key Decisions

### **Why This Tech Stack?**

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| **AWS EC2** | Full control, persistent connections, runs everything | Serverless (can't run FreeSWITCH/workers) |
| **AWS RDS PostgreSQL** | Managed, reliable, scales to Aurora | Self-hosted (more work), Neon (another vendor) |
| **AWS ElastiCache Redis** | Managed, cluster mode, multi-AZ | Self-hosted (more work), Upstash (another vendor) |
| **Node.js 22** | Mature, 2M+ packages, telephony library support | Bun (newer, less mature) |
| **Hono.js** | 3x faster than Express, clean API, TypeScript-first | Express (older), Fastify (good alternative) |
| **Firebase** | Free push + real-time presence | AWS SNS ($0.50/million), custom WebSocket (weeks to build) |
| **FreeSWITCH** | Battle-tested, handles 1000s CPS, open source | Asterisk (older, lower CPS), Drachtio (immature) |
| **NATS JetStream** | Lightweight, self-hosted, durable streams | Kafka (heavy, $100+/mo managed), Pub/Sub (vendor lock-in) |
| **AWS S3 + CloudFront** | Standard, reliable, global CDN | Cloudflare R2 (another vendor) |
| **OpenAI TTS** | Best quality/cost, $0.015/1K chars | AWS Polly (lower quality), ElevenLabs (expensive) |

📖 **Full Rationale:** [Section 4 - Platform Choice](IRIS%20X_call_master_scope_of_work_v_2.md#4-platform-choice-rationale)

---

## 💰 Cost Breakdown

### **Startup Phase (0-100 concurrent calls)**

| Component | Technology | Cost/Month | Notes |
|-----------|-----------|------------|-------|
| **Compute** | 1x t3.medium EC2 | $30 | Runs API, workers, FreeSWITCH, NATS |
| **Database** | RDS PostgreSQL db.t4g.micro | $15 | Managed, single-AZ |
| **Cache/Queue** | ElastiCache Redis cache.t4g.micro | $12 | Managed, single node |
| **Storage** | S3 + CloudFront | $5 | Recordings, TTS cache |
| **Event Bus** | NATS (self-hosted) | $0 | Runs on same EC2 |
| **Real-time** | Firebase (free tier) | $0 | Push notifications + presence |
| **Frontend** | Vercel (free tier) | $0 | Vue 3 portal hosting |
| **Monitoring** | Better Stack or CloudWatch | $0 | Free tier |
| **Domain** | Route53 or Cloudflare DNS | $5 | Domain + DNS |
| **TOTAL FIXED** | | **~$70/mo** | Infrastructure only |

**Variable Costs (per 10K minutes/month):**
- Telephony: $112 (Twilio: $0.011/min avg)
- TTS/STT: $8 (OpenAI APIs)
- **Total Variable:** $120/mo

**Grand Total:** **~$190/month** for 10K minutes (1,000 calls @ 10 min avg)

📖 **Full Cost Model:** [Section 8 - Cost Model & Unit Economics](IRIS%20X_call_master_scope_of_work_v_2.md#8-cost-model--unit-economics)

---

## 🚨 Critical Path Items

### **Must-Have Before Launch:**

#### **Technical:**
- [ ] End-to-end test call working (API → PSTN)
- [ ] CDR accuracy 100% (compare to FreeSWITCH logs)
- [ ] Webhook delivery success rate >99%
- [ ] Load test passed (100 concurrent, 20 CPS, 30 min)
- [ ] Monitoring and alerts configured (CPU, memory, errors)

#### **Security:**
- [ ] API key authentication working
- [ ] Webhook HMAC signature validation
- [ ] Rate limiting enforced (prevent abuse)
- [ ] Fraud detection rules active (velocity limits, premium blocks)
- [ ] Database encrypted at rest

#### **Business:**
- [ ] Pricing calculator on website
- [ ] API documentation published
- [ ] Sign-up flow working (self-service)
- [ ] Payment processing (Stripe integration)
- [ ] Terms of Service + Privacy Policy (legal review)

#### **Compliance:**
- [ ] Emergency calling (E911) addresses validated
- [ ] STIR/SHAKEN attestation via carrier
- [ ] Robocall mitigation plan published
- [ ] DNC list checking implemented

---

## 📊 Success Metrics

### **Phase 1 Targets (Month 3):**
- [ ] 5 beta customers active
- [ ] 50K minutes/month processed
- [ ] 99.5% call success rate
- [ ] <1% webhook failure rate
- [ ] $0 MRR (beta is free)

### **Phase 2 Targets (Month 6):**
- [ ] 20 customers (10 paid)
- [ ] 200K minutes/month
- [ ] 99.7% call success rate
- [ ] $1,000 MRR

### **Phase 3 Targets (Month 9):**
- [ ] 50 customers (30 paid)
- [ ] 500K minutes/month
- [ ] 99.9% call success rate
- [ ] $5,000 MRR

### **Phase 4 Targets (Month 12):**
- [ ] 100 customers (60 paid)
- [ ] 1M minutes/month
- [ ] 99.95% call success rate
- [ ] $10,000 MRR

📖 **Full GTM Strategy:** [Section 29 - Go-to-Market](IRIS%20X_call_master_scope_of_work_v_2_part3.md#29-go-to-market-strategy)

---

## 🛠️ Quick Reference

### **Essential Links**

**External Services:**
- [Twilio Console](https://console.twilio.com/) - SIP trunk management
- [Neon Dashboard](https://console.neon.tech/) - Database management
- [Cloudflare Dashboard](https://dash.cloudflare.com/) - Workers, R2, DNS
- [Upstash Console](https://console.upstash.com/) - Redis management
- [Better Stack](https://betterstack.com/) - Monitoring and logs

**Documentation:**
- [FreeSWITCH Docs](https://freeswitch.org/confluence/)
- [NATS Docs](https://docs.nats.io/)
- [Hono Docs](https://hono.dev/)
- [Bun Docs](https://bun.sh/docs)

**Tools:**
- [OpenAPI Generator](https://openapi-generator.tech/) - SDK generation
- [k6](https://k6.io/) - Load testing
- [SIPp](https://github.com/SIPp/sipp) - SIP load testing
- [Packer](https://www.packer.io/) - AMI builds
- [OpenTofu](https://opentofu.org/) - Infrastructure as code

---

### **Common Commands**

**FreeSWITCH:**
```bash
# Connect to FreeSWITCH CLI
fs_cli

# Show active channels
fs_cli -x "show channels count"

# Show registrations
fs_cli -x "sofia status"

# Reload configuration
fs_cli -x "reloadxml"
```

**Database:**
```bash
# Connect to RDS PostgreSQL
psql "postgres://user:pass@irisx.xxxxx.us-east-1.rds.amazonaws.com:5432/irisx"

# Recent calls
SELECT * FROM calls ORDER BY created_at DESC LIMIT 10;

# CDR summary
SELECT COUNT(*), AVG(billable_seconds), SUM(cost) FROM cdr WHERE created_at > NOW() - INTERVAL '1 day';
```

**Redis:**
```bash
# Connect to ElastiCache Redis
redis-cli -h irisx.xxxxx.cache.amazonaws.com -p 6379

# Check queue depth
LLEN queue:tenant123:support

# Check agent presence
HGETALL agent:tenant123:agent_abc
```

**Deployment:**
```bash
# Deploy API to EC2 (via GitHub Actions or manual)
ssh ec2-user@api.useiris.com
cd /opt/irisx-backend && git pull && pm2 restart all

# Build FreeSWITCH AMI
cd packer && packer build freeswitch.pkr.hcl

# Apply Terraform changes
cd infrastructure/environments/production && terraform apply
```

---

## 🆘 Getting Help

### **Found a Bug?**
1. Check [Operational Runbooks](IRIS%20X_call_master_scope_of_work_v_2_part3.md#31-operational-runbooks) for common issues
2. Search existing GitHub issues
3. Create new issue with template

### **Have a Question?**
1. Check this README
2. Search the 3 scope documents (Cmd+F is your friend)
3. Ask in team Slack channel

### **Need to Make a Decision?**
1. Review [Build vs Buy Analysis](IRIS%20X_call_master_scope_of_work_v_2_part3.md#23-build-vs-buy-analysis)
2. Check [Key Decisions](#key-decisions) section above
3. If architecture change: Write RFC (Request for Comments), get Tech Lead approval
4. If product priority: Product Owner has final say

### **Emergency (P0 Incident)?**
1. Follow [Incident Response Plan](IRIS%20X_call_master_scope_of_work_v_2_part3.md#incident-response-plan)
2. Page on-call engineer via PagerDuty
3. Create incident in Slack (#incidents)
4. Follow relevant [Operational Runbook](IRIS%20X_call_master_scope_of_work_v_2_part3.md#31-operational-runbooks)

---

## 📈 Project Status

**Current Phase:** Not Started
**Target Launch:** Month 3 (Beta)
**Target MRR:** $10K by Month 12

**Team:**
- [ ] Product Owner (0.5 FTE) - TBD
- [ ] Tech Lead (1 FTE) - TBD
- [ ] Backend Engineer (2 FTE) - TBD
- [ ] Telephony Engineer (1 FTE) - TBD
- [ ] Frontend Engineer (1 FTE) - TBD
- [ ] DevOps/SRE (0.5 FTE) - TBD

**Next Steps:**
1. [ ] Team hiring/assignment
2. [ ] AWS account setup
3. [ ] Kick off Phase 0 (Week 1)

---

## 📝 Document Updates

**Version:** 2.0
**Last Updated:** 2025-01-15
**Authors:** Claude (AI Assistant) + Ryan (Product Owner)

**Change Log:**
- 2025-01-15: Initial v2.0 release (complete rewrite with modern stack, startup focus)
- Previous: v1.0 (original scope, Firebase-heavy, enterprise-first)

**Contributing:**
- Scope documents are living documents
- Suggest changes via PR
- Major changes require Tech Lead approval

---

## 🎉 Let's Build This!

This bible represents **hundreds of hours** of planning, research, and technical design. Everything you need to build IRIS X from idea to $10M ARR is documented here.

**Remember:**
- ✅ Start small ($200/month)
- ✅ Validate with beta customers
- ✅ Scale incrementally with revenue
- ✅ Don't over-engineer early
- ✅ Focus on developer experience

**Now go build something amazing! 🚀**

---

*For questions or feedback, contact: [Your Contact Info]*
