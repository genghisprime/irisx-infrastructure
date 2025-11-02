# Platform Admin Panel - Complete Scope & Requirements

**Document:** Complete scoping for IRISX Platform Admin Panel
**Date:** November 2, 2025
**Purpose:** Build comprehensive admin interface for IRISX staff to manage all tenants

---

## EXECUTIVE SUMMARY

### What We Have
- ✅ **Backend APIs:** 27 admin endpoints across 4 areas (auth, tenants, dashboard, search)
- ✅ **Database:** Complete schema with admin tables, views, and audit logging
- ✅ **Customer Portal:** 19 Vue pages, fully functional for tenant users
- ✅ **Agent Desktop:** 6 Vue components with WebRTC softphone
- ✅ **8 Communication Channels:** Voice, SMS, Email, WhatsApp, Discord, Slack, Teams, Telegram

### What We Need to Build
- ❌ **Admin Portal Frontend:** 0% complete (no Vue app exists)
- ❌ **Additional Backend APIs:** 15-20 endpoints for critical gaps
- ❌ **Missing Customer Features:** Some backend features have no customer UI

---

## PART 1: PLATFORM ADMIN PANEL (For IRISX Staff)

**Target Users:** IRISX staff (superadmin, admin, support, readonly roles)

### Backend Status: 60% Complete

#### ✅ What Exists (Ready to Use)
1. **Admin Authentication** (6 endpoints)
   - POST /admin/auth/login
   - POST /admin/auth/logout
   - GET /admin/auth/me
   - POST /admin/auth/change-password
   - GET /admin/auth/sessions
   - DELETE /admin/auth/sessions/:id

2. **Tenant Management** (8 endpoints)
   - GET /admin/tenants (list with pagination, filters, search)
   - GET /admin/tenants/:id (details + stats)
   - POST /admin/tenants (create tenant + admin user)
   - PATCH /admin/tenants/:id (update settings)
   - POST /admin/tenants/:id/suspend
   - POST /admin/tenants/:id/reactivate
   - DELETE /admin/tenants/:id (soft delete, superadmin only)
   - GET /admin/tenants/:id/audit-log

3. **Platform Dashboard** (8 endpoints)
   - GET /admin/dashboard/overview (total tenants, users, calls, revenue)
   - GET /admin/dashboard/stats (detailed metrics)
   - GET /admin/dashboard/charts/daily-activity
   - GET /admin/dashboard/charts/tenant-growth
   - GET /admin/dashboard/revenue
   - GET /admin/dashboard/recent-activity
   - GET /admin/dashboard/system-health (DB, Redis, FreeSWITCH)
   - GET /admin/dashboard/audit-log

4. **Global Search** (5 endpoints)
   - GET /admin/search (global search across all resources)
   - GET /admin/search/tenants
   - GET /admin/search/users
   - GET /admin/search/calls
   - GET /admin/search/suggestions

### ❌ Critical Backend Gaps (Need to Build)

#### 1. Tenant User Management (6 endpoints)
**Priority:** CRITICAL
**Reason:** Admins need to manage tenant users (password resets, suspensions)

- GET /admin/tenants/:id/users (list users)
- POST /admin/tenants/:id/users (create user)
- PATCH /admin/tenants/:id/users/:userId (update user)
- POST /admin/tenants/:id/users/:userId/reset-password
- POST /admin/tenants/:id/users/:userId/suspend
- DELETE /admin/tenants/:id/users/:userId

**DB Tables:** Already exist (`users` table)

---

#### 2. Billing & Payment Management (7 endpoints)
**Priority:** CRITICAL
**Reason:** Revenue management, plan changes, invoicing

- GET /admin/billing/invoices (all invoices)
- GET /admin/billing/invoices/:id (invoice details)
- POST /admin/billing/invoices (manual invoice)
- PATCH /admin/tenants/:id/subscription (change plan/MRR)
- POST /admin/tenants/:id/extend-trial
- POST /admin/billing/refunds
- GET /admin/billing/revenue (revenue reports)

**DB Tables:** `subscriptions`, `invoices` exist

---

#### 3. Provider/Channel Credentials (5 endpoints)
**Priority:** HIGH
**Reason:** Centralized management of all email/SMS/WhatsApp/Social credentials

- GET /admin/providers (list all provider configs)
- POST /admin/providers (add SendGrid, Mailgun, SES, Twilio, WhatsApp, bots)
- PATCH /admin/providers/:id (update credentials)
- DELETE /admin/providers/:id
- POST /admin/providers/:id/test (test connection)

**Providers to Manage:**
- Email: SendGrid, Mailgun, AWS SES, Postmark, SMTP
- SMS: Twilio, Telnyx, Bandwidth, Plivo, Vonage, MessageBird, Sinch
- WhatsApp: Meta Cloud API credentials
- Social: Discord bot, Slack bot, Teams bot, Telegram bot

**DB Tables:** `messaging_providers` exists, needs admin API

---

#### 4. Call Recording Management (4 endpoints)
**Priority:** HIGH
**Reason:** Compliance, quality assurance, dispute resolution

- GET /admin/recordings (list all with filters)
- GET /admin/calls/:id/recordings
- GET /admin/recordings/:id/presigned-url (S3 playback URL)
- DELETE /admin/recordings/:id

**DB Tables:** `call_recordings` exists

---

#### 5. Conversation Admin (5 endpoints)
**Priority:** HIGH
**Reason:** Oversight of unified inbox across all tenants

- GET /admin/conversations (cross-tenant search)
- GET /admin/conversations/:id (view conversation + messages)
- PATCH /admin/conversations/:id/assign (reassign agent)
- POST /admin/conversations/bulk-close
- GET /admin/conversations/sla-breaches

**DB Tables:** `conversations`, `conversation_messages` exist

---

#### 6. Phone Number Management (4 endpoints)
**Priority:** MEDIUM
**Reason:** Provisioning, assignment, deactivation

- GET /admin/phone-numbers (list all across tenants)
- POST /admin/tenants/:id/phone-numbers (provision)
- PATCH /admin/phone-numbers/:id (update)
- DELETE /admin/phone-numbers/:id (deactivate)

**DB Tables:** `phone_numbers` exists

---

#### 7. Feature Flags & Enablement (3 endpoints)
**Priority:** MEDIUM
**Reason:** Per-tenant feature access control

- GET /admin/tenants/:id/features (view enabled features)
- PATCH /admin/tenants/:id/features (enable/disable)
- GET /admin/feature-flags (system flags)

**DB Tables:** Needs new table `tenant_features`

---

#### 8. System Configuration (4 endpoints)
**Priority:** MEDIUM
**Reason:** Rate limits, queue settings, webhook retries

- GET /admin/settings (view system settings)
- PATCH /admin/settings (update settings)
- GET /admin/settings/usage-limits
- PATCH /admin/settings/usage-limits

**DB Tables:** Needs new table `system_settings`

---

#### 9. Agent Management (Already Exists - Just Need UI)
**Priority:** HIGH
**Reason:** Backend exists, just needs admin UI

**Existing Endpoints:**
- GET /v1/admin/agents
- POST /v1/admin/agents
- GET /v1/admin/agents/:id
- PATCH /v1/admin/agents/:id
- DELETE /v1/admin/agents/:id
- POST /v1/admin/agents/bulk-import
- GET /v1/admin/freeswitch/status

**DB Tables:** `agents`, `agent_extensions` exist

---

### Frontend Requirements: Admin Portal (Vue 3 App)

**Status:** 0% complete - Need to create entire app

#### Core Structure
```
irisx-admin-portal/
├── src/
│   ├── components/
│   │   ├── AdminSidebar.vue
│   │   ├── AdminHeader.vue
│   │   ├── StatsCard.vue
│   │   └── DataTable.vue
│   ├── views/
│   │   ├── auth/
│   │   │   └── AdminLogin.vue
│   │   ├── dashboard/
│   │   │   ├── Dashboard.vue (overview)
│   │   │   ├── SystemHealth.vue
│   │   │   └── AuditLog.vue
│   │   ├── tenants/
│   │   │   ├── TenantList.vue
│   │   │   ├── TenantDetails.vue
│   │   │   ├── CreateTenant.vue
│   │   │   └── TenantUsers.vue
│   │   ├── billing/
│   │   │   ├── Invoices.vue
│   │   │   ├── Revenue.vue
│   │   │   └── Subscriptions.vue
│   │   ├── communications/
│   │   │   ├── Conversations.vue
│   │   │   ├── Recordings.vue
│   │   │   └── PhoneNumbers.vue
│   │   ├── agents/
│   │   │   ├── AgentList.vue
│   │   │   ├── AgentDetails.vue
│   │   │   └── BulkImport.vue
│   │   ├── providers/
│   │   │   ├── ProviderList.vue
│   │   │   └── ProviderConfig.vue
│   │   ├── settings/
│   │   │   ├── SystemSettings.vue
│   │   │   ├── FeatureFlags.vue
│   │   │   └── UsageLimits.vue
│   │   └── search/
│   │       └── GlobalSearch.vue
│   ├── stores/
│   │   ├── adminAuth.js
│   │   ├── tenants.js
│   │   └── dashboard.js
│   ├── utils/
│   │   └── adminApi.js
│   └── router/
│       └── index.js
├── package.json
└── vite.config.js
```

#### Pages to Build (19 pages)

**Authentication (1 page)**
1. AdminLogin.vue - Admin login page (separate from tenant login)

**Dashboard (3 pages)**
2. Dashboard.vue - Overview with key metrics, charts
3. SystemHealth.vue - DB/Redis/FreeSWITCH monitoring
4. AuditLog.vue - Global audit log with filters

**Tenant Management (4 pages)**
5. TenantList.vue - List all tenants with search/filters
6. TenantDetails.vue - View tenant info, stats, agents, users
7. CreateTenant.vue - Wizard to create new tenant
8. TenantUsers.vue - Manage users for a tenant

**Billing (3 pages)**
9. Invoices.vue - All invoices across tenants
10. Revenue.vue - Revenue reports and charts
11. Subscriptions.vue - Active subscriptions, plan changes

**Communications (3 pages)**
12. Conversations.vue - Cross-tenant conversation oversight
13. Recordings.vue - Call recording management
14. PhoneNumbers.vue - Phone number provisioning

**Agent Management (2 pages)**
15. AgentList.vue - View all agents across tenants
16. BulkImport.vue - Import agents in bulk

**Provider Management (1 page)**
17. ProviderList.vue - Manage email/SMS/WhatsApp/Social credentials

**Settings (2 pages)**
18. SystemSettings.vue - Rate limits, queue config
19. FeatureFlags.vue - Enable/disable features per tenant

---

## PART 2: CUSTOMER PORTAL GAPS (For Tenant Users)

**Target Users:** Tenant admin users (customers)

### ✅ What Exists (19 Pages Already Built)

1. **Auth**
   - Login.vue
   - Signup.vue

2. **Dashboard**
   - DashboardHome.vue (multi-channel stats)
   - DashboardLayout.vue

3. **Voice**
   - CallLogs.vue (filters, recording playback)

4. **Messaging**
   - Messages.vue (SMS/MMS)
   - WhatsAppMessages.vue
   - SocialMessages.vue (Discord, Slack, Teams, Telegram)
   - Conversations.vue (unified inbox)

5. **Email**
   - EmailTemplates.vue (template builder)
   - EmailCampaignBuilder.vue (campaign wizard)
   - EmailAnalytics.vue (opens, clicks, bounces)
   - EmailAutomation.vue (automation rules)
   - EmailDeliverability.vue (DNS health, suppressions)
   - EmailCampaigns.vue (campaign tracking)

6. **Integrations**
   - Webhooks.vue (webhook management)
   - APIKeys.vue (API key CRUD)

7. **Team**
   - AgentManagement.vue (agent provisioning)
   - AgentPerformance.vue (analytics, leaderboard)

### ❌ Customer Portal Gaps (Missing UI for Existing Backend)

#### 1. Phone Number Management
**Priority:** HIGH
**Backend:** Endpoints exist
**Need:** Customer UI to purchase/manage numbers

**New Page:** PhoneNumbers.vue
- List tenant's phone numbers
- Purchase new numbers (via Twilio/Telnyx)
- Configure routing (IVR, agent, queue)
- Release numbers

---

#### 2. Queue Management
**Priority:** HIGH
**Backend:** Tables exist, limited API
**Need:** Full queue configuration UI

**New Page:** CallQueues.vue
- Create/edit queues
- Configure queue settings (max wait, overflow, music)
- Assign agents to queues
- View queue statistics

**Backend to Add:**
- POST /v1/queues
- PATCH /v1/queues/:id
- GET /v1/queues/:id/stats

---

#### 3. IVR Builder
**Priority:** MEDIUM
**Backend:** Tables exist, no API
**Need:** Visual IVR flow builder

**New Page:** IVRBuilder.vue
- Drag-and-drop IVR builder
- Configure prompts, menu options
- Set routing rules
- Test IVR flows

**Backend to Add:**
- POST /v1/ivrs
- PATCH /v1/ivrs/:id
- GET /v1/ivrs/:id
- POST /v1/ivrs/:id/test

---

#### 4. Campaign Dialer (Voice)
**Priority:** MEDIUM
**Backend:** Progressive dialer code exists, no API
**Need:** Campaign UI similar to EmailCampaignBuilder

**New Page:** VoiceCampaignBuilder.vue
- Create outbound call campaigns
- Upload contact lists
- Configure dialer settings (CPS, retry logic)
- Monitor campaign progress

**Backend to Add:**
- POST /v1/campaigns/voice
- GET /v1/campaigns/voice/:id
- PATCH /v1/campaigns/voice/:id/start
- GET /v1/campaigns/voice/:id/stats

---

#### 5. Contact Management
**Priority:** MEDIUM
**Backend:** Tables exist, no API
**Need:** Contact list management UI

**New Page:** Contacts.vue
- Import/export contacts
- Create segments
- Tag contacts
- View contact history (calls, messages, emails)

**Backend to Add:**
- POST /v1/contacts
- POST /v1/contacts/import
- GET /v1/contacts
- PATCH /v1/contacts/:id
- DELETE /v1/contacts/:id

---

#### 6. User Management (Self-Service)
**Priority:** MEDIUM
**Backend:** Tables exist, limited API
**Need:** Tenant admin UI to manage their own users

**New Page:** UserManagement.vue
- Invite users
- Manage roles (admin, agent, readonly)
- Suspend/reactivate users
- View user activity

**Backend to Add:**
- POST /v1/users/invite
- PATCH /v1/users/:id
- DELETE /v1/users/:id
- POST /v1/users/:id/suspend

---

#### 7. Billing/Plan Management (Self-Service)
**Priority:** LOW
**Backend:** Tables exist, no API
**Need:** Tenant view of their own billing

**New Page:** Billing.vue
- View current plan
- Upgrade/downgrade plan
- View invoices
- Update payment method

**Backend to Add:**
- GET /v1/billing/subscription
- PATCH /v1/billing/subscription
- GET /v1/billing/invoices
- POST /v1/billing/payment-method

---

## PART 3: EFFORT ESTIMATION

### Phase 1: Critical Admin Backend (2 weeks)
**Backend Work:**
- Tenant User Management: 6 endpoints (3 days)
- Billing Management: 7 endpoints (3 days)
- Provider Credentials: 5 endpoints (3 days)
- Call Recordings: 4 endpoints (2 days)
- Conversation Admin: 5 endpoints (3 days)

**Total:** ~14 days backend

---

### Phase 2: Admin Frontend (3 weeks)
**Frontend Work:**
- Setup admin portal app (1 day)
- Auth + Dashboard (3 pages, 3 days)
- Tenant Management (4 pages, 4 days)
- Billing (3 pages, 3 days)
- Communications (3 pages, 3 days)
- Agents (2 pages, 2 days)
- Providers (1 page, 1 day)
- Settings (2 pages, 2 days)

**Total:** ~19 days frontend

---

### Phase 3: Customer Portal Missing Features (2 weeks)
**Backend + Frontend:**
- Phone Numbers (2 days)
- Queue Management (3 days)
- IVR Builder (4 days)
- Contact Management (3 days)
- User Management (2 days)

**Total:** ~14 days

---

### Phase 4: Nice-to-Have (Future)
- Voice Campaign Builder (1 week)
- Advanced Analytics (1 week)
- Self-service Billing UI (1 week)

---

## PART 4: RECOMMENDED APPROACH

### Option A: Complete Admin Panel First (Recommended)
**Timeline:** 5 weeks
**Deliverable:** Full Platform Admin Panel for IRISX staff

**Week 1-2:** Backend APIs (27 endpoints)
**Week 3-5:** Admin Portal UI (19 pages)

**Result:** IRISX staff can fully manage all tenants

---

### Option B: Hybrid Approach
**Timeline:** 6 weeks
**Deliverable:** Admin Panel + Critical Customer Features

**Week 1-2:** Admin backend (critical gaps)
**Week 3-4:** Admin frontend (core pages)
**Week 5-6:** Customer features (phone numbers, queues, IVR)

**Result:** Admin panel + improved customer experience

---

### Option C: Customer First
**Timeline:** 4 weeks
**Deliverable:** Complete Customer Portal

**Week 1-4:** Add missing customer features

**Result:** Feature-complete customer portal, admin panel delayed

---

## PART 5: TECHNOLOGY STACK

### Admin Portal
- **Framework:** Vue 3.5 + Vite 6
- **Styling:** Tailwind CSS 4
- **State:** Pinia 2.2
- **API:** Axios with JWT interceptors
- **Charts:** Chart.js + vue-chartjs
- **Tables:** Custom DataTable component
- **Routing:** Vue Router 4 with role guards

### Reusable from Customer Portal
- Auth patterns (JWT, token refresh)
- API client setup
- Tailwind configuration
- Pinia store patterns
- Component structure

---

## PART 6: NEXT STEPS

### Immediate Actions
1. **Review this document** with stakeholders
2. **Choose approach** (Option A, B, or C)
3. **Prioritize endpoints** if doing hybrid
4. **Design admin UI mockups** (optional but helpful)
5. **Create detailed OpenAPI spec** for new endpoints
6. **Start development** following chosen path

### Development Order (If choosing Option A)
1. Build remaining admin backend endpoints
2. Test all admin endpoints
3. Create admin portal Vue app structure
4. Build admin login + auth flow
5. Build dashboard (overview, health, audit)
6. Build tenant management pages
7. Build billing pages
8. Build remaining admin pages
9. End-to-end testing
10. Deploy to production

---

## SUMMARY

### What's Complete
- ✅ **27 admin backend endpoints** (60% of admin backend)
- ✅ **19 customer portal pages** (80% of customer UI)
- ✅ **Database schema** (100% ready)
- ✅ **Multi-channel support** (8 channels live)
- ✅ **Agent management** (backend + frontend)

### What's Needed
- ❌ **Admin Portal Frontend** (0% - 19 pages to build)
- ❌ **38 additional backend endpoints** (40% remaining)
- ❌ **6 customer portal pages** (20% remaining)

### Estimated Total Effort
- **Admin Backend:** 2 weeks
- **Admin Frontend:** 3 weeks
- **Customer Features:** 2 weeks
- **Total:** 7 weeks for everything

---

**Document Status:** Ready for stakeholder review
**Last Updated:** November 2, 2025
**Created By:** AI Assistant (Claude) + Ryan
