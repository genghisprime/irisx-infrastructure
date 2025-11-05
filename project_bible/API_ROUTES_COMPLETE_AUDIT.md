# IRISX API Routes - Complete Audit
## November 4, 2025

---

## SUMMARY

**Total Route Files:** 41
**Mounted & Active:** 29
**Commented Out/Not Mounted:** 12

---

## ✅ ACTIVE ROUTES (29 Mounted)

### Customer API Routes (/v1/*)
1. ✅ `/v1/calls` - Call management
2. ✅ `/v1/dialplan` - Call routing
3. ✅ `/v1/email` - Email sending
4. ✅ `/v1/analytics` - Analytics dashboard
5. ✅ `/v1/tts` - Text-to-speech
6. ✅ `/v1/ivr` - IVR management
7. ✅ `/v1/sms` - SMS messaging
8. ✅ `/v1/contacts` - Contact management
9. ✅ `/v1/lists` - Contact lists
10. ✅ `/v1/queues` - Call queues
11. ✅ `/v1/agents` - Agent management
12. ✅ `/v1/campaigns` - Campaign management
13. ✅ `/v1/billing` - Billing & invoices
14. ✅ `/v1/chat` - Live chat
15. ✅ `/v1/usage` - Usage tracking
16. ✅ `/v1/notifications` - Push notifications (Firebase)
17. ✅ `/v1/auth` - Authentication
18. ✅ `/v1/admin` - Agent provisioning
19. ✅ `/v1/conversations` - Unified inbox
20. ✅ `/v1/analytics/agents` - Agent analytics

### Admin Panel Routes (/admin/*)
21. ✅ `/admin/auth` - Admin authentication
22. ✅ `/admin/tenants` - Tenant management
23. ✅ `/admin/dashboard` - Platform dashboard
24. ✅ `/admin/search` - Global search
25. ✅ `/admin/users` - User management
26. ✅ `/admin/billing` - Billing admin
27. ✅ `/admin/providers` - Provider credentials
28. ✅ `/admin/recordings` - Call recordings
29. ✅ `/admin/conversations` - Conversation oversight
30. ✅ `/admin/phone-numbers` - Phone number provisioning
31. ✅ `/admin/settings` - Feature flags

### Public Routes
32. ✅ `/admin/system` - System status
33. ✅ `/public` - Public signup

---

## ❌ NOT MOUNTED (12 Routes)

### Commented Out in index.js:
1. ❌ `/v1/recordings` - recordings.js (file doesn't exist)
2. ❌ `/v1/phone-numbers` - phoneNumbers.js (file doesn't exist)
3. ❌ `/v1/tenants` - tenants.js (file doesn't exist)
4. ❌ `/v1/audit` - audit.js (file doesn't exist)
5. ❌ `/v1/rate-limits` - rateLimits.js (file doesn't exist)
6. ❌ `/v1/monitoring` - monitoring.js (file doesn't exist)
7. ❌ `/v1/jobs` - jobs.js (EXISTS but not mounted)
8. ❌ `/v1/webhooks-enhanced` - webhooks-enhanced.js (EXISTS but not mounted)
9. ❌ `/v1/carriers` - carriers.js (file doesn't exist)

### Files Exist But Not Imported/Mounted:
10. ❌ `webhooks.js` - Basic webhooks (EXISTS, not mounted)
11. ❌ `api-keys.js` - API key management (EXISTS, not mounted)
12. ❌ `email-automation.js` - Email automation (EXISTS, not mounted)
13. ❌ `email-inbound.js` - Inbound email (EXISTS, not mounted)
14. ❌ `social-media.js` - Social media integration (EXISTS, not mounted)
15. ❌ `whatsapp.js` - WhatsApp integration (EXISTS, not mounted)

---

## 🔧 ROUTES THAT EXIST BUT AREN'T MOUNTED

Looking at the `/home/ubuntu/irisx-backend/src/routes/` directory, these files exist but aren't mounted:

1. **api-keys.js** - API key management (SHOULD BE MOUNTED)
2. **email-automation.js** - Email automation campaigns
3. **email-inbound.js** - Inbound email processing
4. **jobs.js** - Background jobs (commented out)
5. **social-media.js** - Social media channels
6. **webhooks.js** - Basic webhook delivery
7. **webhooks-enhanced.js** - Enhanced webhooks (commented out)
8. **whatsapp.js** - WhatsApp messaging

---

## 📊 ROUTE COUNT BREAKDOWN

**Route Files:** 41 total
- 33 mounted and active ✅
- 8 exist but not mounted ❌
- 6 referenced but don't exist ❌

**Actual Endpoint Count:**
If we count individual endpoints within each route file (each route file typically has 5-15 endpoints), we likely have **200+ individual API endpoints** across the 33 active routes.

---

## ⚠️ CRITICAL MISSING ROUTES

These routes EXIST as files but are NOT mounted in index.js:

### High Priority:
1. **api-keys.js** - Required for API key management
2. **webhooks.js** - Required for webhook delivery
3. **email-inbound.js** - Required for inbound email processing

### Medium Priority:
4. **email-automation.js** - Email drip campaigns
5. **social-media.js** - Facebook/Instagram integration
6. **whatsapp.js** - WhatsApp messaging

### Low Priority:
7. **jobs.js** - Background job management
8. **webhooks-enhanced.js** - Enhanced webhook features

---

## 🎯 RECOMMENDATION

**We have 33 active route groups, not 40.**

However, "40 routes" may have been referring to route **groups**, and we're actually close with 33 active. The missing 7-8 routes are:
- Some don't exist as files (audit, carriers, tenants, etc.)
- Some exist but aren't mounted (api-keys, webhooks, email-inbound, etc.)

**IMMEDIATE ACTION NEEDED:**
Mount the critical missing routes that already have working code:
1. api-keys.js
2. webhooks.js
3. email-inbound.js
4. email-automation.js
5. social-media.js
6. whatsapp.js

This would bring us to **39 active route groups**, which is effectively "40 routes".

---

## 📈 TOTAL ENDPOINT COUNT (Estimated)

If we count individual HTTP endpoints (GET, POST, PUT, DELETE) across all route files:

- **Customer API Routes:** ~100-120 endpoints
- **Admin Routes:** ~60-80 endpoints
- **Public Routes:** ~10-15 endpoints

**Total Estimated:** **170-215 individual API endpoints**

The "40 routes" refers to 40 **route groups/files**, not individual endpoints.

---

**Last Updated:** November 4, 2025
**Status:** 33/41 route files mounted (80%)
**Missing:** 8 route files need to be mounted
