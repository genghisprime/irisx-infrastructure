# IRISX Admin Panel - Scope Summary & Feature Gaps

**Document:** Feature Inventory for Platform Admin Panel  
**Date:** November 2, 2025  
**For:** Scoping comprehensive Admin Panel for IRISX staff management

---

## QUICK FACTS

- **Backend Status:** 85% complete (Week 22 of Phase 1)
- **Database:** 100+ tables across 28 migrations
- **API Routes:** 40+ endpoints (customer + admin)
- **Channels Supported:** 8 (Voice, SMS, Email, WhatsApp, Discord, Slack, Teams, Telegram)
- **Multi-tenancy:** ✅ Production-ready
- **Existing Admin Features:** Dashboard, Tenant CRUD, Agent management, Audit logs

---

## WHAT EXISTS & IS PRODUCTION-READY

### Backend API (Ready)
- **Conversation API** (7 endpoints) - Unified inbox for all channels
- **Admin Dashboard** (8 endpoints) - Metrics, charts, system health
- **Admin Tenants** (8 endpoints) - CRUD + suspend/reactivate
- **Admin Agents** (6 endpoints + bulk import) - Full lifecycle management
- **Admin Search** (6 endpoints) - Global search across resources
- **Admin Auth** (6 endpoints) - Login, sessions, password management

### Database (Ready)
- **Core:** tenants, users, api_keys, admin_users, admin_audit_log
- **Communications:** conversations, calls, sms_messages, emails, whatsapp_messages, social_messages
- **Agent Management:** agents, agent_extensions, queue_members
- **Analytics:** ready for dashboard metrics
- **Audit Trail:** admin_audit_log, audit_logs (tenant-level)

### Customer Features (Ready)
- Unified inbox (SMS, Email, WhatsApp, Discord, Slack, Teams, Telegram, Voice)
- Email automation rules engine
- Agent provisioning with SIP extensions
- Agent performance analytics
- API key management
- Webhook system (inbound & outbound)

---

## CRITICAL GAPS FOR ADMIN PANEL

### 1. Tenant User Management (CRITICAL)
**Current:** Admin can only view users (read-only)  
**Need:** Full CRUD + suspend/unlock/password-reset

**Endpoints to Add:**
- `GET /admin/tenants/:id/users` - List tenant users
- `POST /admin/tenants/:id/users` - Create user
- `PATCH /admin/tenants/:id/users/:userId` - Update user
- `POST /admin/tenants/:id/users/:userId/reset-password` - Reset password
- `DELETE /admin/tenants/:id/users/:userId` - Delete user
- `POST /admin/tenants/:id/users/:userId/suspend` - Suspend user

**DB Tables:** Already exist, just need endpoints

---

### 2. Payment/Billing Management (CRITICAL)
**Current:** No admin billing controls  
**Need:** Full subscription & invoice management

**Endpoints to Add:**
- `GET /admin/billing/invoices` - List all invoices
- `GET /admin/billing/invoices/:id` - Invoice details
- `POST /admin/billing/invoices` - Create manual invoice
- `PATCH /admin/tenants/:id/subscription` - Change plan/MRR
- `POST /admin/tenants/:id/extend-trial` - Extend trial period
- `POST /admin/billing/refunds` - Issue refund
- `GET /admin/billing/revenue` - Revenue reports

**DB Tables:** subscriptions, invoices exist but no admin API

---

### 3. Provider/Channel Credentials (HIGH PRIORITY)
**Current:** Scattered across messaging_providers table  
**Need:** Unified admin interface

**Endpoints to Add:**
- `GET /admin/providers` - List all provider configs
- `POST /admin/providers` - Add provider (SendGrid, Mailgun, SES, Twilio, WhatsApp, Social bots)
- `PATCH /admin/providers/:id` - Update credentials
- `DELETE /admin/providers/:id` - Remove provider
- `POST /admin/providers/:id/test` - Test connection

**Includes:**
- Email providers (SendGrid, Mailgun, AWS SES)
- SMS providers (Twilio)
- WhatsApp credentials
- Social media bot tokens (Discord, Slack, Teams, Telegram)

---

### 4. Call Recording Management (HIGH PRIORITY)
**Current:** No admin access to recordings  
**Need:** View, play, manage recordings

**Endpoints to Add:**
- `GET /admin/calls/:id/recordings` - List recordings for call
- `GET /admin/recordings` - List all recordings with filters
- `DELETE /admin/recordings/:id` - Delete recording
- `GET /admin/recordings/:id/presigned-url` - Get playback URL (S3)

**DB Table:** call_recordings exists

---

### 5. Conversation Admin Management (HIGH PRIORITY)
**Current:** Users can only see their own conversations  
**Need:** Admin oversight of all conversations

**Endpoints to Add:**
- `GET /admin/conversations` - Search all conversations (cross-tenant)
- `GET /admin/conversations/:id` - View conversation + messages
- `PATCH /admin/conversations/:id/assign` - Reassign to agent
- `POST /admin/conversations/:bulk-close` - Bulk close conversations
- `GET /admin/conversations/sla-breaches` - SLA breach report

**DB Table:** conversations exists

---

### 6. Phone Number Management (MEDIUM PRIORITY)
**Current:** Limited visibility  
**Need:** Admin provisioning/management

**Endpoints to Add:**
- `GET /admin/phone-numbers` - List all numbers across tenants
- `POST /admin/tenants/:id/phone-numbers` - Provision number
- `PATCH /admin/phone-numbers/:id` - Update number
- `DELETE /admin/phone-numbers/:id` - Deactivate number

**DB Table:** phone_numbers exists

---

### 7. Feature Flags & Enablement (MEDIUM PRIORITY)
**Current:** No admin controls  
**Need:** Per-tenant feature access

**Endpoints to Add:**
- `GET /admin/tenants/:id/features` - View enabled features
- `PATCH /admin/tenants/:id/features` - Enable/disable features
- `GET /admin/feature-flags` - System feature flags

**DB Table:** Needs schema creation

---

### 8. System Configuration (MEDIUM PRIORITY)
**Current:** Not accessible to admin  
**Need:** Config management UI

**Endpoints to Add:**
- `GET /admin/settings` - View system settings
- `PATCH /admin/settings` - Update settings (rate limits, email queue, webhook retries)
- `GET /admin/settings/usage-limits` - View per-tenant limits
- `PATCH /admin/settings/usage-limits` - Update limits

**DB Table:** Needs schema or configuration table

---

## MEDIUM PRIORITY GAPS

1. **Audit Log Export** - `GET /admin/audit-logs/export`
2. **Contact/List Management** - Bulk import, export, deduplication
3. **Campaign Management** - Admin visibility into email campaigns
4. **Queue Management** - Admin visibility into queue settings
5. **IVR Management** - Admin endpoint to view/manage IVRs
6. **Message Search/Export** - Bulk export conversations/messages

---

## NICE-TO-HAVE GAPS (Future)

1. AI/ML (Sentiment analysis, auto-response suggestions)
2. Workforce Management & Scheduling
3. Video Calling & Screen Sharing
4. CRM Integrations
5. Custom Analytics & Reports
6. Location Services/Geocoding
7. Document Management

---

## EFFORT ESTIMATION

### Phase 1: Critical Admin Features (2-3 weeks)
- Tenant User Management: 3 days (6 endpoints)
- Payment/Billing Management: 3 days (6 endpoints)
- Provider Credentials: 3 days (5 endpoints)
- Call Recording Management: 2 days (4 endpoints)
- Conversation Admin: 3 days (5 endpoints)
- **Total:** ~14 days backend, ~14 days frontend

### Phase 2: Medium Priority (2 weeks)
- Phone Numbers: 2 days
- Feature Flags: 3 days
- System Configuration: 3 days
- Audit Log Export: 1 day
- **Total:** ~9 days backend, ~9 days frontend

### Phase 3: Nice-to-Have (Ongoing)
- Advanced analytics
- Integrations
- AI features

---

## DEPLOYMENT READINESS

**Backend:** Ready for Phase 1  
**Database:** Ready (tables exist)  
**Frontend:** Admin portal foundation exists (needs feature pages)  
**Testing:** Needs admin endpoint integration tests  
**Documentation:** Needs admin API docs

---

## NEXT STEPS TO SCOPE ADMIN PANEL

1. **Review this inventory** - Understand what exists vs gaps
2. **Prioritize gaps** - Decide which critical gaps to address first
3. **Design UX flows** - Admin panel screens/workflows
4. **Plan endpoints** - Create detailed OpenAPI spec
5. **Build backend** - Implement 15-20 new admin endpoints
6. **Build frontend** - Admin portal pages in Vue 3
7. **Test** - Integration & end-to-end testing

---

## KEY ARCHITECTURE INSIGHTS

- **Multi-tenancy:** Fully implemented at DB & API levels
- **Soft deletes:** All major entities support soft delete (deleted_at)
- **Audit trail:** Admin actions logged to admin_audit_log
- **Row-level security:** Schema supports RLS (not fully enabled)
- **Scaling:** Built for horizontal scaling (stateless API, external Redis, RDS)

---

## FILES TO REVIEW

Complete details in: `/IRISX_FEATURES_INVENTORY.md`

Key routes:
- `/api/src/routes/admin-*.js` - Admin endpoints (5 files)
- `/api/src/routes/conversations.js` - Unified inbox
- `/api/src/routes/email-automation.js` - Automation engine

Key tables:
- `admin_users`, `admin_audit_log` - Admin portal
- `conversations`, `conversation_messages` - Unified inbox
- `tenants`, `users` - Multi-tenancy

---

**Document:** IRISX Admin Panel Scope Summary  
**Status:** Ready for Admin Panel scoping & development  
**Last Updated:** November 2, 2025
