# Week 27: Deployment Plan - Week 24-25 Features

**Date:** November 3, 2025
**Status:** 📋 READY TO EXECUTE
**Estimated Time:** 2-3 hours

---

## Executive Summary

Week 26 prepared the database (migrations applied) and identified that the local codebase is MORE complete than production. Local has all admin routes + Week 24-25 features. Production is missing admin routes that index.js references.

**Solution:** Deploy complete local `api/src` directory to production (forward-only deployment).

---

## Pre-Deployment Checklist

### ✅ Completed
- [x] Database migrations 025 & 026 applied to production
- [x] Week 24-25 routes added to local index.js (chat, usage)
- [x] All changes committed to Git (commit: 0a0097e0, 943162d7)
- [x] Production backup strategy verified (3 backups available)
- [x] Local codebase validated (12 admin routes + Week 24-25 features)

### ⏳ Pending
- [ ] Full syntax validation of all local JavaScript files
- [ ] Test deployment dry-run on staging (if available)
- [ ] Production deployment via full src directory replacement
- [ ] Health check verification
- [ ] Endpoint testing (chat, usage, campaigns, analytics)

---

## Deployment Steps

### Phase 1: Pre-Deployment (15 minutes)

1. **Validate Local Code**
   ```bash
   cd /Users/gamer/Documents/GitHub/IRISX/api
   find src -name "*.js" -exec node --check {} \;
   ```
   Expected: No syntax errors

2. **Create Production Backup**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
     "cd /home/ubuntu && tar czf irisx-backend-backup-week27-$(date +%Y%m%d-%H%M%S).tar.gz irisx-backend/"
   ```

3. **Package Local Code**
   ```bash
   cd /Users/gamer/Documents/GitHub/IRISX/api
   tar czf /tmp/irisx-api-week27-full.tar.gz src/
   ```

### Phase 2: Deployment (10 minutes)

4. **Copy to Production**
   ```bash
   scp -i ~/.ssh/irisx-prod-key.pem /tmp/irisx-api-week27-full.tar.gz ubuntu@3.83.53.69:/tmp/
   ```

5. **Deploy on Production**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 << 'ENDSSH'
   cd /home/ubuntu/irisx-backend
   rm -rf src/
   tar xzf /tmp/irisx-api-week27-full.tar.gz
   pm2 restart irisx-api
   ENDSSH
   ```

### Phase 3: Verification (10 minutes)

6. **Health Check**
   ```bash
   sleep 5
   curl -s http://3.83.53.69:3000/health | jq '.'
   ```
   Expected: `{"status": "healthy", ...}`

7. **Check PM2 Logs**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 30"
   ```
   Expected: No errors, "Server running on port 3000"

8. **Test New Endpoints**
   ```bash
   # Get API key from database first
   API_KEY="irisx_live_b74ca83f2351f4d70e1ed3d7b18754959db8d0eec55273c9e1f966c2a9e87a6f"

   # Test chat endpoint
   curl -s -H "X-API-Key: $API_KEY" http://3.83.53.69:3000/v1/chat/widgets | jq '.'

   # Test usage endpoint
   curl -s -H "X-API-Key: $API_KEY" http://3.83.53.69:3000/v1/usage/current-period | jq '.'

   # Test campaigns endpoint (already deployed)
   curl -s -H "X-API-Key: $API_KEY" http://3.83.53.69:3000/v1/campaigns | jq '.'

   # Test analytics endpoint (already deployed)
   curl -s -H "X-API-Key: $API_KEY" http://3.83.53.69:3000/v1/analytics/dashboard | jq '.'
   ```

### Phase 4: Rollback (if needed)

9. **If Deployment Fails**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 << 'ENDSSH'
   cd /home/ubuntu
   tar xzf irisx-backend-backup-week27-*.tar.gz --overwrite
   pm2 restart irisx-api
   ENDSSH
   ```

---

## Expected Results

### New Endpoints Available

**Chat API (`/v1/chat`)**
- `GET /v1/chat/widgets` - List chat widgets
- `POST /v1/chat/widgets` - Create widget
- `GET /v1/chat/conversations` - List conversations
- `POST /v1/chat/conversations/:id/messages` - Send message
- `GET /v1/chat/conversations/:id/messages` - Get messages
- 8 more endpoints...

**Usage API (`/v1/usage`)**
- `GET /v1/usage/current-period` - Current period usage
- `GET /v1/usage/history` - Usage history
- `GET /v1/usage/invoices` - Invoice list
- `GET /v1/usage/invoices/:id` - Invoice details

**Campaigns API (`/v1/campaigns`)** - Already working
**Analytics API (`/v1/analytics`)** - Already working

### Database Tables Ready

From migrations 025 & 026:
- `usage_records`, `usage_summaries`, `invoices`, `invoice_line_items`
- `pricing_plans`, `plan_features`
- `chat_widgets`, `chat_conversations`, `chat_messages`
- `chat_agent_presence`, `chat_typing_indicators`

---

## Risk Assessment

### Low Risk ✅
- Database migrations already applied and tested
- Local code has more files than production (additive deployment)
- Backup strategy proven (used successfully in Week 26)
- All new code committed to Git

### Medium Risk ⚠️
- Full src directory replacement (not incremental)
- Production dependencies (db, redis, freeswitch connections) must work
- Admin routes never tested in production

### Mitigation
- Backup created before deployment
- Health check immediately after
- Fast rollback procedure (< 1 minute)
- PM2 auto-restart on crash

---

## Post-Deployment Tasks

### Immediate (Day 1)
1. ✅ Verify all endpoints respond
2. ✅ Check PM2 logs for errors
3. ✅ Test one chat widget creation
4. ✅ Test usage tracking recording
5. ✅ Monitor for 1 hour

### Short-term (Week 27)
6. Configure voice call webhooks (FreeSWITCH callbacks)
7. Load testing (100 concurrent API requests)
8. Test voice call with 10 concurrent calls
9. Document any issues found

### Medium-term (Week 28+)
10. Admin Panel Phase 2 (tenant/user management UIs)
11. Agent Desktop WebRTC completion
12. Stripe billing integration

---

## Success Criteria

**Deployment Successful If:**
- ✅ Health check returns "healthy"
- ✅ No errors in PM2 logs
- ✅ All 4 new endpoint groups respond (chat, usage, campaigns, analytics)
- ✅ Database connections stable
- ✅ FreeSWITCH connection maintained
- ✅ Voice calls still work (test with one call)

**Deployment Failed If:**
- ❌ API won't start (PM2 shows "errored")
- ❌ Health check fails
- ❌ Database connection errors
- ❌ Missing module errors
- ❌ Syntax errors in logs

**Rollback Triggers:**
- API crashes on restart
- Health check fails after 3 attempts (15 seconds apart)
- Critical endpoints (calls, SMS) stop working

---

## Timeline

**Optimal Time:** Off-peak hours (late night / early morning)

**Duration Estimate:**
- Preparation: 15 minutes
- Deployment: 10 minutes
- Verification: 10 minutes
- **Total: 35 minutes**

**Buffer:** +25 minutes for unexpected issues = **1 hour total**

---

## Communication Plan

**Before Deployment:**
- Notify stakeholders of maintenance window
- Post status: "Deploying new features (Chat, Usage Tracking)"

**During Deployment:**
- Monitor PM2 logs in real-time
- Keep health check URL open in browser
- Have rollback commands ready

**After Deployment:**
- Post success status: "Deployment complete - new features live"
- Document any issues encountered
- Update project_bible and SESSION_RECOVERY.md

---

## Appendix: File Counts

**Local `api/src` (Week 24-25 Complete):**
```
routes/: 42 files (including 12 admin routes + chat.js + usage.js)
services/: 24 files (including chat.js, usage-tracking.js, usage-recorder.js)
middleware/: 8 files
db/: 2 files (connection.js, redis.js)
index.js: 1 file
Total: ~77 files
```

**Production `irisx-backend/src` (Pre-Week 24-25):**
```
routes/: ~38 files (missing admin routes, chat, usage)
services/: ~20 files (missing chat, usage services)
Total: ~65 files (estimated)
```

**Deployment:** Full replacement adds ~12 files, updates ~50 files

---

## Next Session Recovery

If this session ends before deployment:

**Resume With:**
```bash
# 1. Verify database migrations still applied
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD=5cdce73ae642767beb8bac7085ad2bf2 psql \
  -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin -d irisx_prod \
  -c \"SELECT tablename FROM pg_tables WHERE tablename IN ('usage_records', 'chat_widgets');\""

# 2. Check production health
curl -s http://3.83.53.69:3000/health | jq '.status'

# 3. Follow deployment steps above starting at Phase 1
```

---

**Status:** 📋 READY - All prerequisites met, deployment plan documented
**Next:** Execute deployment during off-peak hours
**MVP Impact:** +10% readiness (from 80% to 90%) after successful deployment

---

_"Database ready. Code ready. Deployment plan ready. Let's ship it."_ 🚀📦
