# NEXT STEPS - Implementation Plan
**Date:** October 29, 2025
**Status:** Ready for Next Session
**Context:** Multi-Provider LCR System Complete, Now Building UI + Auth + Workers

---

## 🎯 SESSION SUMMARY - What Was Accomplished

### Today's Achievements (5,435 lines of code)

1. **Multi-Carrier Voice Routing** (2,087 lines) ✅
   - Complete LCR system with 7+ carriers
   - 16 REST API endpoints for calls
   - 16 carrier management endpoints
   - Health monitoring and automatic failover

2. **Multi-Provider SMS/Email Routing** (2,418 lines) ✅
   - Unified messaging provider system
   - Database functions for LCR selection
   - Cost tracking and analytics
   - Unlimited provider support

3. **Comprehensive Audit Report** ✅
   - Found: 242 API endpoints, 24 services, 99 database tables
   - Identified: Vue dashboard is 0% complete (critical blocker)
   - Confirmed: Backend is 90% complete, Frontend is 0% complete

### Cost Savings Implemented
- Voice: 50%+ savings ($450/month at 100K minutes)
- SMS: 56% savings ($440/month at 100K messages)
- Email: 20% savings ($20/month at 1M emails)
- **Total: $910/month savings potential**

---

## ⚠️ CRITICAL FINDINGS - Must Address

### 1. Vue Dashboard - 0% Complete (BLOCKER)
**Current State:** Only 2 default Vite template files
**Missing:** 40+ Vue components needed
**Impact:** Platform is unusable without UI

### 2. Authentication API - Missing
**Current State:** No login/signup endpoints found
**Missing:** JWT middleware, password reset, auth routes
**Impact:** Users cannot log in

### 3. FreeSWITCH Workers - Missing
**Current State:** 3 workers exist (webhook, email, SMS)
**Missing:** orchestrator.js (NATS→FreeSWITCH), cdr.js (events→DB)
**Impact:** Call orchestration incomplete

---

## 🚀 THREE PRIORITIES - DO NOT SKIP, DO IN ORDER

## PRIORITY 1: Authentication API ⭐ CRITICAL
**Reference:** Master Checklist Week 4 - Backend API Foundation
**Estimated Time:** 16 hours
**Files to Create:** 4 files (~800 lines)

### Files to Create:

#### 1. `/IRISX/src/routes/auth.js` (~300 lines)
```javascript
// Endpoints to implement:
// POST /v1/auth/register - Create tenant + admin user
// POST /v1/auth/login - Email/password → JWT
// POST /v1/auth/refresh - Refresh JWT token
// POST /v1/auth/logout - Invalidate JWT
// POST /v1/auth/forgot-password - Send reset email
// POST /v1/auth/reset-password - Reset with token
// GET /v1/auth/me - Get current user
```

#### 2. `/IRISX/src/services/auth.js` (~300 lines)
```javascript
// Methods to implement:
// - hashPassword(password) - bcrypt hashing
// - comparePassword(password, hash) - verify password
// - generateJWT(user, tenant) - create JWT token
// - verifyJWT(token) - validate JWT
// - generateResetToken() - password reset token
// - sendResetEmail(email, token) - email password reset
```

#### 3. `/IRISX/src/middleware/auth.js` (~150 lines)
```javascript
// Middleware to implement:
// - authenticateJWT() - verify JWT in header
// - authenticateAPIKey() - verify X-API-Key header
// - requireRole(role) - check user role
// - requireTenant() - ensure tenant context
```

#### 4. Update `/IRISX/src/index.js` (~50 lines)
```javascript
// Add:
// - Import auth routes
// - Mount auth routes: app.route('/v1/auth', auth)
// - Apply auth middleware to protected routes
```

### Testing Checklist:
- [ ] Register new tenant with admin user
- [ ] Login with email/password, receive JWT
- [ ] Access protected route with JWT
- [ ] Refresh JWT token
- [ ] Forgot password flow
- [ ] Reset password with token
- [ ] Invalid JWT returns 401
- [ ] Expired JWT returns 401

---

## PRIORITY 2A: Platform Admin Dashboard (IRISX Staff) ⭐ CRITICAL
**Reference:** Master Checklist Phase 1 Week 9-10
**Estimated Time:** 40 hours
**Location:** `/irisx-dashboard/` (rename to `irisx-platform-admin/`)
**Components:** 25+ Vue files (~3,500 lines)

### Step 1: Setup & Configuration (4 hours)

**NOTE:** npm has permission issues. Fix before starting:
```bash
sudo chown -R $(whoami) ~/.npm
cd /Users/gamer/Documents/GitHub/IRISX/irisx-dashboard
npm install
```

#### Dependencies (Already in package.json):
- Vue Router 4
- Pinia 2
- Axios
- Chart.js + vue-chartjs
- TailwindCSS 3

#### Files to Create:

1. **Router Configuration** (`src/router/index.js`)
```javascript
// Routes:
// / → Dashboard (system overview)
// /login → Login page
// /monitoring → System monitoring
// /carriers → Carrier management
// /providers → SMS/Email providers
// /tenants → Tenant management
// /analytics → Platform analytics
// /settings → Platform settings
```

2. **Pinia Stores** (`src/stores/`)
```javascript
// auth.js - Authentication state
// system.js - System monitoring state
// carriers.js - Carriers state
// providers.js - Messaging providers state
// tenants.js - Tenants state
```

3. **API Client** (`src/services/api.js`)
```javascript
// Axios instance with:
// - Base URL from env
// - JWT interceptor
// - Error handling
// - Request/response logging
```

4. **TailwindCSS Config** (`tailwind.config.js`)
```javascript
// Install: npx tailwindcss init
// Configure colors, fonts, etc.
```

### Step 2: Authentication Pages (4 hours)

**Files:**
- `src/views/Login.vue` - Login form with JWT
- `src/views/Signup.vue` - Admin signup (if needed)
- `src/views/ForgotPassword.vue` - Password reset request
- `src/views/ResetPassword.vue` - Password reset form

**Features:**
- Form validation
- Error messages
- JWT storage in localStorage
- Auto-redirect after login

### Step 3: Main Layout (4 hours)

**Files:**
- `src/components/layout/Sidebar.vue` - Navigation sidebar
- `src/components/layout/Header.vue` - Top header with user menu
- `src/components/layout/MainLayout.vue` - Wraps all authenticated pages

**Sidebar Navigation:**
- Dashboard
- System Monitoring
- Carriers
- SMS/Email Providers
- Tenants
- Analytics
- Settings

### Step 4: Dashboard Home Page (6 hours)

**File:** `src/views/Dashboard.vue`

**Widgets to Build:**
- System health overview (API, DB, Redis, FreeSWITCH, NATS)
- Active calls counter (real-time)
- Today's stats (calls, SMS, emails)
- Cost savings chart (today vs yesterday)
- Recent alerts/incidents
- Quick actions (add carrier, view tenants)

**Components:**
- `src/components/dashboard/StatsCard.vue` - Metric card
- `src/components/dashboard/HealthIndicator.vue` - Green/yellow/red dot
- `src/components/dashboard/RecentActivity.vue` - Activity feed

### Step 5: System Monitoring Page (8 hours) 🔥 **REQUESTED FEATURE**

**File:** `src/views/SystemMonitoring.vue`

**Monitoring Sections:**

1. **API Server Health**
   - CPU usage (%)
   - Memory usage (MB / %)
   - Disk space
   - Uptime
   - Request rate (req/sec)
   - Error rate (errors/min)
   - Average response time

2. **Database (PostgreSQL)**
   - Connection pool status
   - Active queries
   - Slow queries (> 1s)
   - Database size
   - Table sizes
   - Replication lag (if multi-region)

3. **Cache (Redis)**
   - Memory usage
   - Key count
   - Hit rate
   - Evictions
   - Connected clients

4. **FreeSWITCH**
   - Status (up/down)
   - Active channels
   - Calls per second (CPS)
   - Sessions count
   - CPU/memory usage
   - SIP gateway status

5. **NATS JetStream**
   - Stream status (SMS, EMAIL, WEBHOOKS)
   - Message counts
   - Consumer lag
   - Pending messages
   - API errors

6. **Error Log Viewer**
   - Recent errors (last 100)
   - Error count by type
   - Error timeline chart
   - Filter by severity

7. **Performance Metrics**
   - API latency (p50, p95, p99)
   - Database query times
   - External API latency (Twilio, Telnyx, etc.)

**Components:**
- `src/components/monitoring/MetricCard.vue` - Single metric display
- `src/components/monitoring/TimeSeriesChart.vue` - Line chart for trends
- `src/components/monitoring/ErrorLogTable.vue` - Error log table
- `src/components/monitoring/ServiceStatus.vue` - Service health indicator

**API Endpoints to Call:**
- GET /v1/monitoring/stats - System statistics
- GET /v1/monitoring/health - Component health checks
- GET /v1/monitoring/errors - Recent errors
- GET /health - Overall health check

### Step 6: Carrier Management (6 hours)

**Files:**
- `src/views/Carriers.vue` - List all carriers
- `src/views/CarrierDetail.vue` - Single carrier detail
- `src/components/carriers/CarrierForm.vue` - Add/edit carrier
- `src/components/carriers/CarrierHealthBadge.vue` - Health score badge
- `src/components/carriers/RateTable.vue` - Rate display table
- `src/components/carriers/BulkRateUpload.vue` - CSV upload

**Features:**
- List carriers with health scores
- Add carrier with form validation
- Edit carrier configuration
- Test carrier connectivity
- Bulk upload rates (CSV)
- View carrier performance stats
- Cost comparison chart

**API Endpoints:**
- GET /v1/carriers
- POST /v1/carriers
- GET /v1/carriers/:id
- PATCH /v1/carriers/:id
- POST /v1/carriers/:id/test-connection
- POST /v1/carriers/:id/rates/bulk

### Step 7: SMS/Email Provider Management (6 hours)

**Files:**
- `src/views/Providers.vue` - List all providers
- `src/views/ProviderDetail.vue` - Single provider detail
- `src/components/providers/ProviderForm.vue` - Add/edit provider
- `src/components/providers/ProviderHealthBadge.vue` - Health indicator
- `src/components/providers/CostChart.vue` - Cost comparison

**Features:**
- List SMS and email providers
- Add provider with credentials
- Edit provider configuration
- Test provider connectivity
- View cost savings analytics
- Health monitoring

**Note:** Need to create provider management endpoints (similar to carriers API)

### Step 8: Tenant Management (4 hours)

**Files:**
- `src/views/Tenants.vue` - List all tenants
- `src/views/TenantDetail.vue` - Single tenant detail
- `src/components/tenants/TenantCard.vue` - Tenant summary card
- `src/components/tenants/UsageChart.vue` - Usage over time

**Features:**
- List all tenants
- View tenant details
- Tenant usage statistics
- Billing overview
- Enable/disable tenant
- View tenant activity logs

**API Endpoints:**
- GET /v1/tenants
- GET /v1/tenants/:id
- GET /v1/tenants/:id/usage
- PATCH /v1/tenants/:id

---

## PRIORITY 2B: Tenant Admin Dashboard (Customer-Facing) ⭐ CRITICAL
**Reference:** Master Checklist Phase 1 Week 9-10
**Estimated Time:** 32 hours
**Location:** Create NEW folder `/irisx-tenant-dashboard/`
**Components:** 20+ Vue files (~2,800 lines)

### Differences from Platform Admin:
- **Scope:** Single tenant only (their data)
- **No access to:** System monitoring, other tenants, carrier management
- **Focus on:** Their calls, contacts, campaigns, billing, API keys

### Setup (2 hours)

```bash
cd /Users/gamer/Documents/GitHub/IRISX
npm create vite@latest irisx-tenant-dashboard -- --template vue
cd irisx-tenant-dashboard
npm install vue-router pinia axios chart.js vue-chartjs
```

### Pages to Build:

1. **Authentication** (4 hours)
   - Login.vue
   - Signup.vue (tenant self-service)
   - ForgotPassword.vue
   - ResetPassword.vue

2. **Dashboard Home** (4 hours)
   - Stats overview (their calls, SMS, emails)
   - Recent activity
   - Quick actions

3. **Call Logs** (4 hours)
   - List their calls
   - Filter by date, status, direction
   - Play recordings
   - Download CDR

4. **Contact Management** (4 hours)
   - List contacts
   - Add/edit contacts
   - Import CSV
   - Contact lists

5. **Campaign Management** (4 hours)
   - Create campaign
   - Upload CSV
   - Start/pause/stop
   - Campaign analytics

6. **API Keys** (2 hours)
   - List their API keys
   - Create new key
   - Rotate keys
   - View usage

7. **Webhooks** (2 hours)
   - Configure webhook endpoints
   - View delivery logs
   - Test webhooks

8. **Billing & Usage** (4 hours)
   - Current usage
   - Cost breakdown
   - Invoices
   - Payment methods

9. **Settings** (2 hours)
   - Account settings
   - Team members
   - Notifications

---

## PRIORITY 3: FreeSWITCH Workers ⭐ HIGH
**Reference:** Master Checklist Week 4
**Estimated Time:** 20 hours
**Files to Create:** 2 files (~1,200 lines)

### Check First: FreeSWITCH Status

**IMPORTANT:** Audit found many background FreeSWITCH builds running. Check status:

```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 'sudo /usr/local/freeswitch/bin/fs_cli -x "status"'
```

**If FreeSWITCH is already installed and running:**
- ✅ Skip installation
- ✅ Skip configuration
- ✅ Proceed to worker creation

**If FreeSWITCH is NOT running:**
- Follow installation steps from previous sessions
- Configure ESL (Event Socket Library) on port 8021
- Test connection from API server

### Worker 1: Orchestrator Worker (~700 lines)

**File:** `/IRISX/src/workers/orchestrator.js`

**Purpose:** Consume NATS calls stream → Originate calls via FreeSWITCH ESL

**Flow:**
1. Connect to NATS JetStream
2. Subscribe to `calls` stream
3. For each message:
   - Extract call details (from_number, to_number, carrier)
   - Connect to FreeSWITCH ESL (10.0.1.213:8021)
   - Execute originate command
   - Update call status in database
4. Handle ESL events (CHANNEL_ANSWER, CHANNEL_HANGUP)
5. ACK message after processing

**Dependencies:**
```bash
npm install esl
```

**Key Methods:**
- connectToFreeSWITCH() - ESL connection
- originateCall(callData) - Execute originate command
- handleChannelAnswer(event) - Update call to "in-progress"
- handleChannelHangup(event) - Update call to "completed"
- updateCallStatus(uuid, status) - Database update

**Testing:**
- [ ] POST /v1/calls → NATS message published
- [ ] Orchestrator consumes message
- [ ] FreeSWITCH originates call
- [ ] Call status updated to "ringing"
- [ ] Call answered, status updated to "in-progress"
- [ ] Call hung up, status updated to "completed"

### Worker 2: CDR Worker (~500 lines)

**File:** `/IRISX/src/workers/cdr.js`

**Purpose:** Subscribe to FreeSWITCH ESL events → Write CDR to PostgreSQL

**Flow:**
1. Connect to FreeSWITCH ESL
2. Subscribe to CHANNEL_HANGUP_COMPLETE events
3. For each event:
   - Parse CDR data (call_uuid, duration, hangup_cause, etc.)
   - Write to `cdr` table in PostgreSQL
   - Publish to NATS `events` stream (for analytics)
4. Handle errors and retry

**CDR Fields to Extract:**
- call_uuid
- tenant_id
- from_number
- to_number
- direction (inbound/outbound)
- carrier_id
- answered_at
- ended_at
- duration_seconds
- billsec (billed seconds)
- hangup_cause
- sip_hangup_disposition
- carrier_cost (calculate using LCR rate)

**Testing:**
- [ ] Make test call via FreeSWITCH
- [ ] Call ends
- [ ] CDR written to database within 10 seconds
- [ ] CDR contains accurate duration and cost
- [ ] Event published to NATS

---

## 📋 COMPLETE CHECKLIST - DO IN ORDER

### Week 1 (40 hours)
- [ ] Fix npm permissions: `sudo chown -R $(whoami) ~/.npm`
- [ ] Install dependencies in irisx-dashboard: `npm install`
- [ ] Create authentication API (auth.js routes, service, middleware)
- [ ] Test authentication flow end-to-end
- [ ] Setup Platform Admin dashboard (router, stores, API client, TailwindCSS)
- [ ] Build authentication pages (Login, Signup, ForgotPassword)
- [ ] Build main layout (Sidebar, Header, MainLayout)
- [ ] Build Dashboard home page with stats widgets
- [ ] Build System Monitoring page (CPU, memory, DB, Redis, FreeSWITCH, NATS, errors)
- [ ] Test Platform Admin dashboard with real API

### Week 2 (40 hours)
- [ ] Build Carrier Management screens (list, detail, form, bulk upload)
- [ ] Build Provider Management screens (SMS/Email providers)
- [ ] Build Tenant Management screens (list, detail, usage)
- [ ] Build Analytics page (cost savings, usage charts)
- [ ] Build Settings page (platform configuration)
- [ ] Setup Tenant Admin dashboard (NEW project)
- [ ] Build Tenant Auth pages
- [ ] Build Tenant Dashboard home
- [ ] Build Call Logs page for tenants

### Week 3 (32 hours)
- [ ] Build Tenant Contact Management
- [ ] Build Tenant Campaign Management
- [ ] Build Tenant API Keys page
- [ ] Build Tenant Webhooks page
- [ ] Build Tenant Billing & Usage page
- [ ] Check FreeSWITCH status (installed? running?)
- [ ] Create orchestrator.js worker (NATS → FreeSWITCH)
- [ ] Create cdr.js worker (FreeSWITCH → PostgreSQL)
- [ ] Test workers with live calls

### Week 4 (16 hours)
- [ ] End-to-end testing (Platform Admin → Tenant Admin → API → Workers → FreeSWITCH)
- [ ] Load testing (100 concurrent calls, 20 CPS)
- [ ] Bug fixes and polish
- [ ] Documentation updates
- [ ] Deploy to production

---

## 🚨 CRITICAL REMINDERS

### Before Starting ANY Work:

1. **Check if it's already done:**
   ```bash
   # Check for existing files
   ls -la /Users/gamer/Documents/GitHub/IRISX/IRISX/src/routes/auth.js
   ls -la /Users/gamer/Documents/GitHub/IRISX/IRISX/src/workers/orchestrator.js

   # Check FreeSWITCH status
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 'sudo /usr/local/freeswitch/bin/fs_cli -x "status"'
   ```

2. **Read the Master Checklist:**
   - `/Users/gamer/Documents/GitHub/IRISX/project_bible/00_MASTER_CHECKLIST.md`
   - Follow the exact order

3. **Check the audit report:**
   - See what was already implemented
   - Avoid double-development

### npm Permission Fix:
```bash
sudo chown -R $(whoami) ~/.npm
# OR if above doesn't work:
sudo chown -R 507:20 "/Users/gamer/.npm"
```

### Environment Variables:
Platform Admin Dashboard needs `.env`:
```env
VITE_API_URL=http://3.83.53.69:3000
VITE_WS_URL=ws://3.83.53.69:3000
```

Tenant Admin Dashboard needs `.env`:
```env
VITE_API_URL=http://3.83.53.69:3000
VITE_WS_URL=ws://3.83.53.69:3000
```

---

## 📚 Reference Documentation

**Project Bible Files:**
- `/Users/gamer/Documents/GitHub/IRISX/project_bible/00_MASTER_CHECKLIST.md` - Main checklist
- `/Users/gamer/Documents/GitHub/IRISX/project_bible/01_START_HERE_Tech_Stack_Development_Order.md` - Development order
- `/Users/gamer/Documents/GitHub/IRISX/project_bible/IRIS_Customer_Onboarding_Portal.md` - Tenant dashboard specs
- `/Users/gamer/Documents/GitHub/IRISX/project_bible/IRIS_Command_Center_Master_Admin.md` - Platform admin specs

**Implementation Guides:**
- `/Users/gamer/Documents/GitHub/IRISX/docs/SESSION_SUMMARY_MULTI_PROVIDER_LCR_OCT29.md` - Today's work summary
- `/Users/gamer/Documents/GitHub/IRISX/docs/MULTI_CARRIER_SETUP.md` - Carrier setup guide
- `/Users/gamer/Documents/GitHub/IRISX/README.md` - Current platform status

**API Documentation:**
- `/Users/gamer/Documents/GitHub/IRISX/IRISX/openapi.yaml` - Complete API spec (1,058 lines, 242 endpoints)

---

## 🎯 IMMEDIATE NEXT SESSION TASKS

**Say to Claude in next session:**

> "Read /Users/gamer/Documents/GitHub/IRISX/docs/NEXT_STEPS_IMPLEMENTATION_PLAN.md and let's build Priority 1 (Authentication API) following the exact specifications. Check first if auth.js routes already exist before creating anything new."

**Then proceed in order:**
1. Priority 1: Authentication API (16 hours)
2. Priority 2A: Platform Admin Dashboard (40 hours)
3. Priority 2B: Tenant Admin Dashboard (32 hours)
4. Priority 3: FreeSWITCH Workers (20 hours)

**Total Estimated Time:** 108 hours (13.5 days of full-time work)

---

## ✅ SUCCESS CRITERIA

**Platform Admin Dashboard:**
- [ ] IRISX staff can login
- [ ] View real-time system health (CPU, memory, DB, Redis, FreeSWITCH, NATS)
- [ ] Add/edit carriers via UI
- [ ] Add/edit SMS/Email providers via UI
- [ ] View all tenants and their usage
- [ ] See cost savings analytics
- [ ] Monitor errors in real-time

**Tenant Admin Dashboard:**
- [ ] Customers can signup/login
- [ ] View their calls, SMS, emails
- [ ] Manage contacts and lists
- [ ] Create campaigns
- [ ] View billing and usage
- [ ] Configure API keys and webhooks

**Authentication:**
- [ ] Secure JWT-based authentication
- [ ] Role-based access control (platform admin vs tenant admin)
- [ ] Password reset flow works

**Workers:**
- [ ] Calls placed via API are routed through FreeSWITCH
- [ ] CDR written to database within 10 seconds
- [ ] Call events update status in real-time

---

**End of Implementation Plan**
**Ready for Next Session** 🚀
