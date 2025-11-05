# Routes to Add - One at a Time Plan
## Current Status: 13/41 Routes Mounted

**API Status:** ✅ HEALTHY with 13 working routes

---

## Currently Mounted (13 routes):
1. /v1/calls
2. /v1/dialplan
3. /v1/email
4. /v1/analytics
5. /v1/tts
6. /v1/ivr
7. /v1/sms
8. /v1/contacts
9. /v1/lists
10. /v1/queues
11. /v1/agents
12. /v1/campaigns
13. /v1/billing

---

## Routes to Add (28 more) - IN ORDER:

### Customer API Routes (Priority 1):
14. **chat.js** → /v1/chat (Live chat widget - CRITICAL)
15. **usage.js** → /v1/usage (Usage tracking - CRITICAL)
16. **auth.js** → /v1/auth (Authentication - CRITICAL)
17. **conversations.js** → /v1/conversations (Unified inbox - CRITICAL)
18. **notifications.js** → /v1/notifications (Push notifications - Firebase)
19. **webhooks.js** → /v1/webhooks (Webhook delivery)

### Admin Panel Routes (Priority 2):
20. **admin-auth.js** → /admin/auth (Admin authentication)
21. **admin-tenants.js** → /admin/tenants (Tenant management)
22. **admin-dashboard.js** → /admin/dashboard (Platform dashboard)
23. **admin-search.js** → /admin/search (Global search)
24. **admin-users.js** → /admin/users (User management)
25. **admin-billing.js** → /admin/billing (Billing admin)
26. **admin-providers.js** → /admin/providers (Provider credentials)
27. **admin-recordings.js** → /admin/recordings (Call recordings)
28. **admin-conversations.js** → /admin/conversations (Conversation oversight)
29. **admin-phone-numbers.js** → /admin/phone-numbers (Phone number provisioning)
30. **admin-settings.js** → /admin/settings (Feature flags)
31. **admin-agents.js** → /v1/admin (Agent provisioning)
32. **analytics-agents.js** → /v1/analytics/agents (Agent analytics)

### System Routes (Priority 3):
33. **system-status.js** → /admin/system (System status)
34. **public-signup.js** → /public (Public signup)

### Optional/Advanced Routes (Priority 4):
35. **api-keys.js** → /v1/api-keys (API key management)
36. **email-automation.js** → /v1/email/automation (Email campaigns)
37. **email-inbound.js** → /v1/email/inbound (Inbound email)
38. **social-media.js** → /v1/social (Facebook/Instagram)
39. **whatsapp.js** → /v1/whatsapp (WhatsApp messaging)
40. **jobs.js** → /v1/jobs (Background jobs)
41. **webhooks-enhanced.js** → /v1/webhooks/enhanced (Enhanced webhooks)

---

## ADD PROCESS (ONE AT A TIME):

For each route:
1. Backup current index.js
2. Add import statement
3. Add route mount
4. Restart API
5. Test health endpoint
6. Test new route endpoint
7. If success → commit, move to next
8. If failure → revert, fix issue, try again

---

## Next Step:
Add route #14 (chat.js) first.

**Command to add chat:**
```bash
# 1. Add import
sed -i '/import billing/a import chat from '\''./routes/chat.js'\'';' index.js

# 2. Add route
sed -i '/app.route.*billing/a app.route('\''/v1/chat'\'', chat);' index.js

# 3. Restart and test
pm2 restart irisx-api
curl http://localhost:3000/health
```

---

**Total Missing:** 28 routes need to be added
**Est. Time:** 2-3 hours (5-10 minutes per route with testing)
