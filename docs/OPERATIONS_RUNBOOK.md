# IRISX Operations Runbook

**Last Updated:** November 2, 2025
**Version:** 1.0
**Owner:** Operations Team

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Server Management](#server-management)
4. [Database Operations](#database-operations)
5. [FreeSWITCH Management](#freeswitch-management)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Backup & Recovery](#backup--recovery)
8. [Incident Response](#incident-response)
9. [Common Tasks](#common-tasks)
10. [Emergency Contacts](#emergency-contacts)

---

## System Overview

### Architecture

**Production Environment:**
- **API Server:** 3.83.53.69 (t3.medium EC2)
- **FreeSWITCH Server:** 54.160.220.243 (t3.small EC2 with Elastic IP)
- **Database:** AWS RDS PostgreSQL (db.t4g.micro)
- **Cache:** AWS ElastiCache Redis (cache.t4g.micro)
- **Storage:** AWS S3 + CloudFront
- **Admin Portal:** http://3.83.53.69/
- **Customer Portal:** TBD (Vercel or S3+CloudFront)
- **Agent Desktop:** TBD (S3+CloudFront)

###System Components

**Backend (Node.js + Hono.js):**
- 29 route files (200+ REST API endpoints)
- 5 background workers (NATS subscribers)
- PM2 process manager (auto-restart)

**Frontend:**
- Admin Portal (17 pages, Vue 3)
- Customer Portal (20+ pages, Vue 3)
- Agent Desktop (7 pages, Vue 3 + WebRTC)

**Database:**
- 27 migrations applied
- 99+ tables
- ~50GB storage allocated

**External Dependencies:**
- Twilio SIP Trunk (voice calling)
- Telnyx (backup voice carrier)
- SendGrid, Mailgun, Postmark, SES (email)
- Twilio, Telnyx, Bandwidth, Plivo (SMS)
- Meta WhatsApp Business API
- Discord, Slack, Teams, Telegram APIs

---

## Daily Operations

### Morning Checklist (Every Day at 8:00 AM EST)

1. **Check System Health**
   ```bash
   # Test API server
   curl http://3.83.53.69:3000/health

   # Expected: {"status":"ok","timestamp":"2025-11-02T12:00:00.000Z"}
   ```

2. **Check FreeSWITCH Status**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
   sudo systemctl status freeswitch

   # Expected: active (running)
   ```

3. **Check Active Calls**
   ```bash
   sudo /usr/local/freeswitch/bin/fs_cli -x "show calls"

   # Shows current active calls (should be 0 off-hours)
   ```

4. **Check PM2 Processes**
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
   pm2 list

   # Expected: all processes "online" status
   ```

5. **Check Database Connections**
   ```bash
   # SSH to API server
   pm2 logs irisx-api --lines 20 | grep "database"

   # Should see no connection errors
   ```

6. **Check Redis**
   ```bash
   redis-cli -h <redis-endpoint> ping

   # Expected: PONG
   ```

7. **Check S3 Storage**
   ```bash
   aws s3 ls s3://irisx-recordings/ | wc -l

   # Monitor recording file count
   ```

### Weekly Checklist (Every Monday)

1. **Review CloudWatch Metrics**
   - API server CPU usage (should be < 70%)
   - RDS CPU usage (should be < 60%)
   - Redis CPU usage (should be < 50%)
   - Disk space on both EC2 instances (should be > 20% free)

2. **Check Database Size**
   ```sql
   SELECT pg_size_pretty(pg_database_size('irisx_production'));
   ```

3. **Review Failed Jobs** (if any job queue exists)
   ```sql
   SELECT COUNT(*) FROM background_jobs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '7 days';
   ```

4. **Check for Pending Migrations**
   ```bash
   # SSH to API server
   cd /home/ubuntu/irisx-backend
   ls database/migrations/ | tail -5
   ```

5. **Test Backup Restoration** (monthly on first Monday)
   - Download latest RDS snapshot
   - Restore to test database
   - Verify data integrity

### Monthly Checklist

1. **Security Updates**
   ```bash
   # API server
   ssh ubuntu@3.83.53.69
   sudo apt update && sudo apt upgrade -y

   # FreeSWITCH server
   ssh ubuntu@54.160.220.243
   sudo apt update && sudo apt upgrade -y
   ```

2. **SSL Certificate Renewal** (if using Let's Encrypt)
   ```bash
   sudo certbot renew
   ```

3. **Audit Log Review**
   - Review admin_audit_log table
   - Check for suspicious activity
   - Verify no unauthorized access

4. **Cost Optimization**
   - Review AWS billing dashboard
   - Check for unused resources
   - Optimize S3 storage (lifecycle policies)

---

## Server Management

### SSH Access

**API Server:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
```

**FreeSWITCH Server:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
```

**Key Location:** `~/.ssh/irisx-prod-key.pem` (permissions: 400)

### Restart API Server

```bash
# SSH to API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Restart PM2 processes
pm2 restart all

# Or restart specific process
pm2 restart irisx-api

# Check logs
pm2 logs irisx-api --lines 50
```

### Restart FreeSWITCH

```bash
# SSH to FreeSWITCH server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243

# Restart FreeSWITCH
sudo systemctl restart freeswitch

# Check status
sudo systemctl status freeswitch

# View logs
sudo tail -f /usr/local/freeswitch/log/freeswitch.log
```

### Check Server Resources

**CPU Usage:**
```bash
top -bn1 | head -20
```

**Memory Usage:**
```bash
free -h
```

**Disk Usage:**
```bash
df -h
```

**Network Connections:**
```bash
netstat -tuln | grep LISTEN
```

### Update Application Code

```bash
# SSH to API server
cd /home/ubuntu/irisx-backend

# Pull latest code
git pull origin main

# Install dependencies (if package.json changed)
npm install

# Restart application
pm2 restart all

# Verify
curl http://localhost:3000/health
```

---

## Database Operations

### Connect to Database

```bash
# From API server
psql -h <rds-endpoint> -U irisx_admin -d irisx_production

# Or from local machine (if whitelisted)
psql -h <rds-endpoint> -U irisx_admin -d irisx_production
```

### Run Database Migration

```bash
# SSH to API server
cd /home/ubuntu/irisx-backend

# Apply migration
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -f database/migrations/028_new_migration.sql

# Verify
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "\dt"
```

### Check Active Connections

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'irisx_production';
```

### Terminate Long-Running Queries

```sql
-- Find long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
AND state = 'active';

-- Kill specific query
SELECT pg_terminate_backend(<pid>);
```

### Database Backup (Manual)

```bash
# Create snapshot via AWS CLI
aws rds create-db-snapshot \
  --db-instance-identifier irisx-production \
  --db-snapshot-identifier irisx-manual-$(date +%Y%m%d-%H%M%S)
```

### Database Restore

```bash
# Restore from snapshot (creates new instance)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier irisx-restore-test \
  --db-snapshot-identifier irisx-backup-20251102
```

---

## FreeSWITCH Management

### Access FreeSWITCH CLI

```bash
# SSH to FreeSWITCH server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243

# Connect to fs_cli
sudo /usr/local/freeswitch/bin/fs_cli
```

### Common FreeSWITCH Commands

**Show Active Calls:**
```
show calls
show channels
```

**Reload Configuration:**
```
reloadxml
reload mod_sofia
```

**Show SIP Registrations:**
```
sofia status profile internal reg
```

**Show Gateway Status:**
```
sofia status gateway twilio
```

**Originate Test Call:**
```
originate {origination_caller_id_number=+15551234567}sofia/gateway/twilio/+17137057323 &echo
```

**Show Call Statistics:**
```
status
```

**Restart Module:**
```
reload mod_sofia
reload mod_dialplan_xml
```

### FreeSWITCH Logs

**View Live Logs:**
```bash
sudo tail -f /usr/local/freeswitch/log/freeswitch.log
```

**Filter for Errors:**
```bash
sudo grep "ERROR" /usr/local/freeswitch/log/freeswitch.log | tail -50
```

**View CDR Logs:**
```bash
sudo ls -lh /usr/local/freeswitch/log/cdr-csv/
```

### Provision New Agent Extension

```bash
# SSH to API server
# Use Admin API endpoint
curl -X POST http://3.83.53.69:3000/admin/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "tenant_id": 7,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }'

# Extension is auto-provisioned via SSH to FreeSWITCH
```

### Remove Agent Extension

```bash
# SSH to FreeSWITCH server
sudo rm /usr/local/freeswitch/etc/freeswitch/directory/irisx-domain/user_8005.xml

# Reload config
sudo /usr/local/freeswitch/bin/fs_cli -x "reloadxml"
```

---

## Monitoring & Alerts

### CloudWatch Alarms (To Be Configured)

**Critical Alarms:**
- API Server CPU > 80% for 5 minutes
- RDS CPU > 80% for 5 minutes
- RDS Storage < 10% free
- RDS Connections > 90% of max
- FreeSWITCH Server Down
- API Health Check Failed (3 consecutive failures)

**Warning Alarms:**
- API Server CPU > 60% for 10 minutes
- RDS CPU > 60% for 10 minutes
- Redis Memory > 80%
- Disk Space < 20% on EC2 instances

### Manual Health Checks

**API Server Health:**
```bash
curl -s http://3.83.53.69:3000/health | jq
```

**Database Health:**
```sql
SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE datname = 'irisx_production') as connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
  pg_size_pretty(pg_database_size('irisx_production')) as db_size;
```

**Redis Health:**
```bash
redis-cli -h <redis-endpoint> info | grep -E "used_memory_human|connected_clients"
```

**FreeSWITCH Health:**
```bash
sudo /usr/local/freeswitch/bin/fs_cli -x "status" | head -10
```

### Log Locations

**API Server:**
- Application: `pm2 logs irisx-api`
- System: `/var/log/syslog`
- Nginx: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`

**FreeSWITCH:**
- Main Log: `/usr/local/freeswitch/log/freeswitch.log`
- CDR: `/usr/local/freeswitch/log/cdr-csv/`
- XML CDR: `/usr/local/freeswitch/log/xml_cdr/`

**Database:**
- AWS RDS Logs (accessible via AWS Console or CloudWatch)

---

## Backup & Recovery

### Automated Backups

**RDS PostgreSQL:**
- Automated daily snapshots (7-day retention)
- Snapshot window: 03:00-04:00 AM EST
- Point-in-time recovery enabled (5-minute granularity)

**S3 Recordings:**
- Versioning enabled
- Lifecycle policy: Move to Glacier after 90 days
- Delete after 2 years

### Manual Backup Procedures

**1. Database Backup:**
```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier irisx-production \
  --db-snapshot-identifier irisx-manual-$(date +%Y%m%d-%H%M%S)
```

**2. Application Code Backup:**
```bash
# Code is in Git - ensure all changes are committed
cd /home/ubuntu/irisx-backend
git status  # Should show "nothing to commit, working tree clean"
```

**3. Configuration Backup:**
```bash
# Backup PM2 ecosystem
pm2 save

# Backup FreeSWITCH config
sudo tar -czf /home/ubuntu/freeswitch-config-$(date +%Y%m%d).tar.gz \
  /usr/local/freeswitch/etc/freeswitch/
```

### Disaster Recovery Procedures

**Scenario 1: API Server Failure**

1. Launch new EC2 instance from AMI
2. Update Elastic IP to point to new instance
3. Restore application code from Git
4. Restore PM2 configuration
5. Update DNS (if needed)
6. Verify health check passes

**Estimated Recovery Time:** 20-30 minutes

**Scenario 2: Database Failure**

1. Restore RDS from latest snapshot (or specific point-in-time)
2. Update API server connection string (if new endpoint)
3. Restart API server
4. Verify data integrity

**Estimated Recovery Time:** 30-45 minutes

**Scenario 3: FreeSWITCH Server Failure**

1. Launch new EC2 instance
2. Install FreeSWITCH
3. Restore configuration from backup
4. Update Elastic IP
5. Update Twilio SIP trunk settings (if needed)
6. Test inbound/outbound calling

**Estimated Recovery Time:** 1-2 hours

**Scenario 4: Complete System Failure**

1. Restore database from snapshot
2. Launch new API server from AMI
3. Launch new FreeSWITCH server
4. Configure networking (security groups, Elastic IPs)
5. Deploy frontend applications
6. Update DNS records
7. Test all systems

**Estimated Recovery Time:** 3-4 hours

---

## Incident Response

### Severity Levels

**P0 - Critical (Respond within 15 minutes):**
- Complete system outage
- Database unavailable
- All calls failing
- Data breach

**P1 - High (Respond within 1 hour):**
- Partial system outage
- API degraded performance
- FreeSWITCH intermittent failures
- 50%+ call failure rate

**P2 - Medium (Respond within 4 hours):**
- Single feature broken
- Performance degradation
- Non-critical errors
- 10-50% call failure rate

**P3 - Low (Respond within 24 hours):**
- Cosmetic issues
- Minor bugs
- Documentation errors
- Feature requests

### Incident Response Playbook

**Step 1: Acknowledge (Within 5 minutes)**
- Confirm incident is real
- Assess severity
- Post status update

**Step 2: Investigate (Within 15 minutes)**
- Check monitoring dashboards
- Review logs
- Identify root cause
- Estimate impact

**Step 3: Mitigate (Within 30 minutes)**
- Implement temporary fix if possible
- Redirect traffic if needed
- Scale resources if needed
- Communicate with affected customers

**Step 4: Resolve**
- Implement permanent fix
- Test thoroughly
- Deploy fix
- Monitor for recurrence

**Step 5: Post-Mortem (Within 48 hours)**
- Document incident timeline
- Root cause analysis
- Action items to prevent recurrence
- Update runbook

### Common Incident Scenarios

**1. API Server 5xx Errors**

**Symptoms:** HTTP 500/502/503 errors, slow response times

**Investigation:**
```bash
# Check PM2 status
pm2 list

# Check logs
pm2 logs irisx-api --lines 100

# Check system resources
top -bn1 | head -20
df -h
```

**Common Causes:**
- Database connection pool exhausted
- Memory leak
- Unhandled exception
- Disk full

**Resolution:**
- Restart PM2 process: `pm2 restart irisx-api`
- Check database connections
- Free up disk space if needed
- Deploy fix if code issue

**2. FreeSWITCH Not Registering with Twilio**

**Symptoms:** Calls not connecting, gateway offline

**Investigation:**
```bash
# Check gateway status
sudo /usr/local/freeswitch/bin/fs_cli -x "sofia status gateway twilio"

# Check logs
sudo tail -100 /usr/local/freeswitch/log/freeswitch.log | grep -i "twilio\|error"
```

**Common Causes:**
- Incorrect credentials
- Network connectivity issue
- Twilio IP whitelist issue
- Firewall blocking SIP ports

**Resolution:**
- Reload gateway: `sofia profile external killgw twilio`
- Check security group allows ports 5060-5080
- Verify Twilio credentials in gateway config
- Test network: `telnet twilio-sip-endpoint 5060`

**3. Database Connection Errors**

**Symptoms:** API returns "Database connection failed"

**Investigation:**
```bash
# Check database status
aws rds describe-db-instances --db-instance-identifier irisx-production

# Check connection from API server
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT 1"

# Check active connections
# (from psql) SELECT count(*) FROM pg_stat_activity WHERE datname = 'irisx_production';
```

**Common Causes:**
- RDS instance stopped or restarting
- Connection pool exhausted (max_connections reached)
- Security group blocking port 5432
- Incorrect credentials

**Resolution:**
- Check RDS status in AWS Console
- Terminate idle connections if pool exhausted
- Restart API server to reset connection pool
- Verify security group rules

**4. High Call Failure Rate**

**Symptoms:** Customers report calls not connecting

**Investigation:**
```bash
# Check FreeSWITCH status
sudo /usr/local/freeswitch/bin/fs_cli -x "status"

# Check recent call failures
sudo /usr/local/freeswitch/bin/fs_cli -x "show calls" | head -20

# Check CDR logs
psql -h <rds-endpoint> -U irisx_admin -d irisx_production \
  -c "SELECT status, COUNT(*) FROM calls WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status;"
```

**Common Causes:**
- Twilio trunk down
- FreeSWITCH module crashed
- Dialplan misconfiguration
- Network connectivity issue

**Resolution:**
- Test gateway: `sofia profile external killgw twilio`
- Reload modules: `reload mod_sofia`
- Check Twilio dashboard for outages
- Failover to Telnyx if Twilio is down

---

## Common Tasks

### Add New Tenant

```bash
# Use Admin API
curl -X POST http://3.83.53.69:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "company_name": "Acme Corp",
    "admin_email": "admin@acme.com",
    "admin_first_name": "John",
    "admin_last_name": "Doe",
    "plan": "starter",
    "trial_days": 30
  }'
```

### Suspend Tenant

```bash
# Use Admin API (superadmin only)
curl -X POST http://3.83.53.69:3000/admin/tenants/123/suspend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <superadmin-jwt-token>" \
  -d '{
    "reason": "Payment failed"
  }'
```

### Reset User Password

```bash
# Use Admin API
curl -X POST http://3.83.53.69:3000/admin/users/456/reset-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>"

# Returns temporary password to send to user
```

### Provision Phone Number

```bash
# Use Admin API
curl -X POST http://3.83.53.69:3000/admin/phone-numbers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -d '{
    "tenant_id": 7,
    "phone_number": "+15551234567",
    "provider": "twilio",
    "cost_per_month": 1.00
  }'
```

### View System Metrics

```bash
# API request metrics (last 24 hours)
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c \
  "SELECT COUNT(*) as total_requests FROM api_logs WHERE created_at > NOW() - INTERVAL '24 hours';"

# Call volume (last 24 hours)
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c \
  "SELECT COUNT(*) as total_calls, SUM(duration) as total_minutes FROM calls WHERE created_at > NOW() - INTERVAL '24 hours';"

# Active tenants
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c \
  "SELECT COUNT(*) FROM tenants WHERE status = 'active';"
```

---

## Emergency Contacts

**Primary On-Call:**
- Name: Ryan
- Email: TBD
- Phone: TBD

**Backup On-Call:**
- Name: TBD
- Email: TBD
- Phone: TBD

**Vendor Support:**
- **AWS Support:** https://console.aws.amazon.com/support/
- **Twilio Support:** https://support.twilio.com/ | +1-888-TWILIO-1
- **SendGrid Support:** https://support.sendgrid.com/
- **Meta WhatsApp Support:** https://developers.facebook.com/support/

**Escalation Procedure:**
1. Contact Primary On-Call
2. If no response within 15 minutes, contact Backup On-Call
3. For P0 incidents, contact all team members immediately
4. Open support ticket with vendor if vendor service is affected

---

## Appendix

### Useful Commands Cheat Sheet

**SSH Shortcuts:**
```bash
alias ssh-api="ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69"
alias ssh-fs="ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243"
```

**Quick Health Check:**
```bash
# All-in-one health check
curl -s http://3.83.53.69:3000/health && echo "API: OK" || echo "API: FAIL"
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl is-active freeswitch" && echo "FS: OK" || echo "FS: FAIL"
```

**View Recent Logs:**
```bash
# API logs (last 50 lines)
ssh-api "pm2 logs irisx-api --lines 50"

# FreeSWITCH errors (last 20)
ssh-fs "sudo grep ERROR /usr/local/freeswitch/log/freeswitch.log | tail -20"
```

### Environment Variables

**API Server (.env):**
```
NODE_ENV=production
PORT=3000
DATABASE_HOST=<rds-endpoint>
DATABASE_PORT=5432
DATABASE_NAME=irisx_production
DATABASE_USER=irisx_admin
DATABASE_PASSWORD=<password>
REDIS_HOST=<redis-endpoint>
REDIS_PORT=6379
JWT_SECRET=<secret>
S3_BUCKET=irisx-recordings
AWS_REGION=us-east-1
```

**Admin Portal (.env):**
```
VITE_API_URL=http://3.83.53.69:3000
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-02 | Claude | Initial version |

---

**End of Operations Runbook**
