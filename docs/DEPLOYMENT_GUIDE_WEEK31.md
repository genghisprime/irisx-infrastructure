# IRIS Deployment Guide - Week 31 Updates

## Overview
This guide covers deploying the 29 new API endpoints and 7 enterprise backend systems completed in Week 31.

---

## 🚀 New Features to Deploy

### **1. Job Queue System**
- **Database:** Migration 021 (`database/migrations/021_create_job_queue_tables.sql`)
- **Service Layer:** `IRISX/src/services/jobQueue.js`
- **API Routes:** `IRISX/src/routes/jobs.js` (14 endpoints)
- **Dependencies:** Bull, Redis

### **2. Webhook Management API**
- **Database:** Migration 020 (`database/migrations/020_create_webhooks_enhanced_table.sql`)
- **Service Layer:** `IRISX/src/services/webhooks.js`
- **API Routes:** `IRISX/src/routes/webhooks-enhanced.js` (15 endpoints)
- **Workers:** `IRISX/src/workers/webhook-worker.js`

### **3. Additional Systems**
- Notification System (Migration 017)
- Audit Logging (Migration 018)
- Rate Limiting (Migration 019)
- Health Monitoring (Migration 018)
- API Key Management (Service layer only)

---

## 📋 Pre-Deployment Checklist

### **1. Server Requirements**
```bash
# SSH into API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Verify Node.js version
node --version  # Should be v22.x

# Verify Redis is running
redis-cli ping  # Should return PONG

# Verify PostgreSQL connection
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com -U irisx_admin -d irisx_prod -c "SELECT version();"
```

### **2. Dependencies**
```bash
cd ~/irisx-backend

# Install new dependencies
npm install bull zod

# Verify package.json
cat package.json
```

---

## 🗄️ Database Migrations

### **Run New Migrations**
```bash
# Connect to production database
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
     -U irisx_admin \
     -d irisx_prod

# Run migrations in order
\i /path/to/migrations/017_create_notification_tables.sql
\i /path/to/migrations/018_create_audit_logging_tables.sql
\i /path/to/migrations/018_create_health_monitoring_tables.sql
\i /path/to/migrations/019_create_rate_limiting_tables.sql
\i /path/to/migrations/020_create_webhooks_enhanced_table.sql
\i /path/to/migrations/021_create_job_queue_tables.sql

# Verify tables created
\dt

# Check row counts
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 📦 Deploy Code Updates

### **1. Pull Latest Code**
```bash
cd ~/irisx-backend
git pull origin main
```

### **2. Verify New Files**
```bash
# Check new route files
ls -la src/routes/jobs.js
ls -la src/routes/webhooks-enhanced.js

# Check new service files
ls -la src/services/jobQueue.js
ls -la src/services/webhooks.js
ls -la src/services/apiKeys.js
ls -la src/services/auditLog.js
ls -la src/services/rateLimit.js
ls -la src/services/healthMonitoring.js
ls -la src/services/notifications.js

# Check updated index.js
grep "jobs.js" src/index.js
grep "webhooks-enhanced.js" src/index.js
```

### **3. Restart API Server**
```bash
# Using PM2
pm2 restart irisx-api

# Or manual restart
pm2 stop irisx-api
cd ~/irisx-backend
node src/index.js

# Check logs
pm2 logs irisx-api --lines 50
```

---

## ✅ Verification Tests

### **1. Health Check**
```bash
curl http://localhost:3000/health | jq
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T20:00:00.000Z",
  "database": { "status": "connected" },
  "redis": { "status": "connected" },
  "freeswitch": { "status": "connected" },
  "version": "1.0.0"
}
```

### **2. Test Job Queue Endpoints**
```bash
# Create a test job
curl -X POST http://localhost:3000/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "tenant_id": 1,
    "job_name": "test_job",
    "job_type": "webhook_delivery",
    "queue_name": "webhooks",
    "payload": {"test": true},
    "priority": 5
  }' | jq

# List jobs
curl http://localhost:3000/v1/jobs?tenant_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq

# Get queue stats
curl http://localhost:3000/v1/jobs/queues/webhooks/stats?tenant_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq
```

### **3. Test Webhook Management Endpoints**
```bash
# Create webhook endpoint
curl -X POST http://localhost:3000/v1/webhooks/endpoints \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "tenant_id": 1,
    "url": "https://webhook.site/unique-id",
    "subscribed_events": ["call.completed", "sms.received"],
    "description": "Test webhook endpoint"
  }' | jq

# List webhook endpoints
curl http://localhost:3000/v1/webhooks/endpoints?tenant_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq

# List available events
curl http://localhost:3000/v1/webhooks/events \
  -H "X-API-Key: YOUR_API_KEY" | jq
```

### **4. Test Other New Endpoints**
```bash
# Notifications
curl http://localhost:3000/v1/notifications?user_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq

# Audit Logs
curl http://localhost:3000/v1/audit/logs?tenant_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq

# Rate Limits
curl http://localhost:3000/v1/rate-limits?tenant_id=1 \
  -H "X-API-Key: YOUR_API_KEY" | jq

# Health Monitoring
curl http://localhost:3000/v1/monitoring/health \
  -H "X-API-Key: YOUR_API_KEY" | jq
```

---

## 🔧 Troubleshooting

### **Issue: Routes Not Found (404)**
```bash
# Check if routes are properly mounted in index.js
grep "app.route" src/index.js | grep -E "(jobs|webhooks)"

# Restart API server
pm2 restart irisx-api
```

### **Issue: Database Connection Errors**
```bash
# Verify environment variables
cat .env | grep DB_

# Test database connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT NOW();"

# Check PostgreSQL logs
pm2 logs irisx-api | grep -i "database\|postgres"
```

### **Issue: Redis Connection Errors**
```bash
# Check Redis status
redis-cli ping

# Verify Redis environment variables
cat .env | grep REDIS_

# Test Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### **Issue: Worker Errors**
```bash
# Check PM2 status
pm2 list

# Check worker logs
pm2 logs irisx-webhook-worker
pm2 logs irisx-email-worker
pm2 logs irisx-sms-worker

# Restart workers
pm2 restart irisx-webhook-worker
pm2 restart irisx-email-worker
pm2 restart irisx-sms-worker
```

---

## 📊 Monitoring

### **1. API Performance**
```bash
# Check PM2 metrics
pm2 monit

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health
```

### **2. Database Queries**
```bash
# Monitor active queries
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
ORDER BY duration DESC;
"

# Check table sizes
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::text) DESC
LIMIT 10;
"
```

### **3. Redis Memory**
```bash
# Check Redis memory usage
redis-cli INFO memory

# Check key count
redis-cli DBSIZE

# Monitor Redis activity
redis-cli MONITOR
```

---

## 🔐 Security Checklist

- [ ] API keys rotated after deployment
- [ ] Database credentials secured in .env
- [ ] Redis password configured
- [ ] HTTPS enabled for production
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] CORS configured properly
- [ ] Sensitive endpoints protected with authentication

---

## 📈 Post-Deployment Metrics

### **Baseline Metrics to Track:**
1. **API Response Times:** P50, P95, P99
2. **Error Rates:** 4xx, 5xx errors
3. **Database Query Performance:** Slow query log
4. **Redis Hit Rate:** Cache effectiveness
5. **Worker Queue Lengths:** Job processing backlog
6. **Webhook Delivery Success Rate:** % successful deliveries

### **Monitoring Commands:**
```bash
# API error rate (last hour)
pm2 logs irisx-api --lines 1000 | grep -i error | wc -l

# Job queue backlog
curl http://localhost:3000/v1/jobs/queues/stats?tenant_id=1 | jq '.data[] | {queue: .queue_name, waiting: .waiting_count}'

# Webhook delivery success rate
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM webhook_deliveries
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
"
```

---

## 🎯 Rollback Plan

If issues arise, rollback to previous version:

```bash
# Stop current API
pm2 stop irisx-api

# Checkout previous commit
cd ~/irisx-backend
git log --oneline -10  # Find previous commit
git checkout <previous-commit-hash>

# Restart API
pm2 restart irisx-api

# Verify rollback
curl http://localhost:3000/health | jq
```

---

## ✅ Deployment Success Criteria

- [ ] All 29 new endpoints responding with 200 status
- [ ] No 500 errors in logs for 30 minutes
- [ ] Database migrations completed successfully
- [ ] Workers processing jobs successfully
- [ ] Health check returns "healthy" status
- [ ] Response times under 200ms (P95)
- [ ] No memory leaks detected
- [ ] All integration tests passing

---

## 📞 Support Contacts

**If deployment issues occur:**
- Check logs: `pm2 logs irisx-api`
- Review error tracking: Sentry/GlitchTip
- Database issues: Check RDS CloudWatch metrics
- Redis issues: Check ElastiCache metrics

---

**Deployment Date:** TBD
**Deployed By:** TBD
**Version:** 1.1.0 (Week 31 Update)
**Git Commit:** `<commit-hash>`
