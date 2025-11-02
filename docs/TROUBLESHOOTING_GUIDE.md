# IRISX Troubleshooting Guide

**Last Updated:** November 2, 2025
**Version:** 1.0
**Audience:** Operations Team, Support Engineers

---

## Table of Contents

1. [Quick Diagnostic Steps](#quick-diagnostic-steps)
2. [API Server Issues](#api-server-issues)
3. [Database Issues](#database-issues)
4. [FreeSWITCH Issues](#freeswitch-issues)
5. [Voice Call Issues](#voice-call-issues)
6. [SMS Issues](#sms-issues)
7. [Email Issues](#email-issues)
8. [WhatsApp Issues](#whatsapp-issues)
9. [Agent Desktop Issues](#agent-desktop-issues)
10. [Customer Portal Issues](#customer-portal-issues)
11. [Admin Portal Issues](#admin-portal-issues)
12. [Performance Issues](#performance-issues)
13. [Error Code Reference](#error-code-reference)

---

## Quick Diagnostic Steps

When an issue is reported, follow these steps:

### Step 1: Identify the Component (30 seconds)
```bash
# Test API Server
curl http://3.83.53.69:3000/health

# Test Database
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c 'SELECT 1'"

# Test FreeSWITCH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl status freeswitch"

# Test Redis
redis-cli -h <redis-endpoint> ping
```

### Step 2: Check Recent Logs (1 minute)
```bash
# API logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 50"

# FreeSWITCH logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo tail -100 /usr/local/freeswitch/log/freeswitch.log | grep ERROR"

# System logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo tail -50 /var/log/syslog"
```

### Step 3: Check System Resources (30 seconds)
```bash
# CPU and Memory
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "top -bn1 | head -20"

# Disk Space
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "df -h"

# Network
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "netstat -tuln | grep LISTEN"
```

---

## API Server Issues

### Issue: API Server Not Responding

**Symptoms:**
- `curl http://3.83.53.69:3000/health` times out or returns no response
- Customer Portal shows "Cannot connect to server"
- All API requests fail

**Diagnostic Steps:**
```bash
# Check if PM2 process is running
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 list"

# Check system status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "systemctl status pm2-ubuntu"

# Check logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 100"
```

**Common Causes:**
1. **PM2 Process Crashed**
   - Look for `errored` or `stopped` status in `pm2 list`
   - Check logs for unhandled exceptions

2. **Out of Memory**
   - Run `free -h` to check available memory
   - Look for "JavaScript heap out of memory" in logs

3. **Port Already in Use**
   - Run `netstat -tuln | grep 3000`
   - Another process may be using port 3000

4. **Database Connection Failed**
   - Check RDS status in AWS Console
   - Verify security group allows connection from API server

**Resolution:**
```bash
# Restart PM2 process
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"

# If that doesn't work, restart all processes
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart all"

# Check status
curl http://3.83.53.69:3000/health
```

**If Restart Doesn't Work:**
```bash
# Kill all node processes
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pkill -9 node"

# Start PM2 again
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 resurrect"

# Or manually start
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cd /home/ubuntu/irisx-backend && pm2 start src/index.js --name irisx-api"
```

---

### Issue: API Returns 500 Internal Server Error

**Symptoms:**
- API returns HTTP 500 status code
- Error message: "Internal Server Error"
- Specific endpoints failing

**Diagnostic Steps:**
```bash
# Check recent errors in logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 200 | grep -i error"

# Check for specific error patterns
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 500 | grep -E 'TypeError|ReferenceError|SyntaxError'"
```

**Common Causes:**
1. **Database Query Error**
   - Look for "syntax error" or "column does not exist"
   - Migration may not have been applied

2. **Unhandled Exception**
   - Look for stack traces in logs
   - Code bug causing crash

3. **Missing Environment Variable**
   - Look for "undefined is not a function" or "Cannot read property"
   - Check `.env` file has all required variables

**Resolution:**
```bash
# Apply pending migrations
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cd /home/ubuntu/irisx-backend && psql -h <rds-endpoint> -U irisx_admin -d irisx_production -f database/migrations/XXX_new_migration.sql"

# Check environment variables
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cat /home/ubuntu/irisx-backend/.env | grep -v PASSWORD"

# Restart after fixes
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"
```

---

### Issue: API Slow Response Times

**Symptoms:**
- Requests take > 3 seconds to complete
- Customer Portal feels sluggish
- Timeout errors

**Diagnostic Steps:**
```bash
# Check CPU usage
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "top -bn1 | head -20"

# Check database connections
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'irisx_production';"

# Check for long-running queries
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';"
```

**Common Causes:**
1. **Database Connection Pool Exhausted**
   - Max connections reached (default: 20)
   - Queries not releasing connections

2. **Slow Database Queries**
   - Missing indexes
   - Full table scans
   - Large result sets

3. **High CPU Usage**
   - Too many concurrent requests
   - CPU-intensive operations

4. **Redis Connection Issues**
   - Cache not being used
   - Redis overloaded

**Resolution:**
```bash
# Terminate long-running queries
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT pg_terminate_backend(<pid>);"

# Restart API server (resets connection pool)
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"

# Scale up if needed (increase EC2 instance size)
# This requires stopping instance, changing type, and restarting
```

---

## Database Issues

### Issue: Database Connection Failed

**Symptoms:**
- API logs show "Error connecting to database"
- All API requests fail with 500 errors
- PM2 logs show "ECONNREFUSED" or "ETIMEDOUT"

**Diagnostic Steps:**
```bash
# Test database connection from API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c 'SELECT 1'"

# Check RDS status
aws rds describe-db-instances --db-instance-identifier irisx-production --query 'DBInstances[0].DBInstanceStatus'

# Check security group
aws ec2 describe-security-groups --group-ids <db-security-group-id>
```

**Common Causes:**
1. **RDS Instance Stopped or Restarting**
   - Check AWS Console for RDS status
   - May be in maintenance window

2. **Security Group Blocking Connection**
   - Port 5432 not open from API server IP
   - Wrong security group attached

3. **Wrong Credentials**
   - Username or password incorrect in `.env`
   - Password changed but not updated

4. **Connection Pool Exhausted**
   - Too many connections open
   - Connections not being released

**Resolution:**
```bash
# Start RDS if stopped
aws rds start-db-instance --db-instance-identifier irisx-production

# Verify security group allows API server
aws ec2 authorize-security-group-ingress \
  --group-id <db-security-group-id> \
  --protocol tcp \
  --port 5432 \
  --source-group <api-security-group-id>

# Restart API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"
```

---

### Issue: Database Running Out of Space

**Symptoms:**
- API returns "No space left on device"
- Cannot insert new records
- RDS storage at 100%

**Diagnostic Steps:**
```bash
# Check database size
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT pg_size_pretty(pg_database_size('irisx_production'));"

# Check table sizes
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 20;"

# Check AWS RDS storage
aws rds describe-db-instances --db-instance-identifier irisx-production --query 'DBInstances[0].[AllocatedStorage,MaxAllocatedStorage]'
```

**Common Causes:**
1. **Large CDR Table**
   - Call records accumulating
   - No cleanup policy

2. **Large Recording Files Metadata**
   - Many recordings stored
   - Metadata not pruned

3. **Old Logs**
   - PostgreSQL logs filling disk
   - Not rotated

**Resolution:**
```bash
# Delete old call records (older than 90 days)
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "DELETE FROM calls WHERE created_at < NOW() - INTERVAL '90 days';"

# Vacuum database to reclaim space
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "VACUUM FULL;"

# Increase RDS storage (AWS Console or CLI)
aws rds modify-db-instance \
  --db-instance-identifier irisx-production \
  --allocated-storage 100 \
  --apply-immediately
```

---

## FreeSWITCH Issues

### Issue: FreeSWITCH Service Down

**Symptoms:**
- All calls failing
- `systemctl status freeswitch` shows "inactive (dead)"
- No SIP registrations

**Diagnostic Steps:**
```bash
# Check service status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl status freeswitch"

# Check logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo tail -200 /usr/local/freeswitch/log/freeswitch.log"

# Check for core dumps
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "ls -lh /usr/local/freeswitch/"
```

**Common Causes:**
1. **FreeSWITCH Crashed**
   - Segmentation fault
   - Out of memory
   - Module failure

2. **Configuration Error**
   - Invalid XML
   - Module load failure
   - Port conflict

3. **Disk Full**
   - Log directory full
   - Recording directory full

**Resolution:**
```bash
# Start FreeSWITCH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl start freeswitch"

# Check status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl status freeswitch"

# If config error, check XML syntax
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/freeswitch -nc -nonat -syntax"

# Clean up old recordings if disk full
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo find /usr/local/freeswitch/recordings -mtime +30 -delete"
```

---

### Issue: SIP Gateway Not Registered (Twilio)

**Symptoms:**
- Outbound calls fail with "No route to destination"
- `sofia status gateway twilio` shows "NOREG" or "FAIL_WAIT"
- FreeSWITCH logs show "401 Unauthorized"

**Diagnostic Steps:**
```bash
# Check gateway status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status gateway twilio'"

# Check for authentication errors
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo grep -i '401\|403' /usr/local/freeswitch/log/freeswitch.log | tail -20"

# Test network connectivity
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "telnet pstn-sip-1.twilio.com 5060"
```

**Common Causes:**
1. **Wrong Credentials**
   - Username or password incorrect
   - Credentials changed in Twilio but not updated in config

2. **IP Not Whitelisted**
   - Twilio IP Access Control List doesn't include FreeSWITCH server IP
   - Elastic IP changed

3. **Firewall Blocking**
   - Security group doesn't allow outbound port 5060
   - Network ACL blocking

4. **Twilio Trunk Down**
   - Twilio service outage
   - Check Twilio status page

**Resolution:**
```bash
# Verify credentials in gateway config
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo cat /usr/local/freeswitch/etc/freeswitch/sip_profiles/external/twilio.xml"

# Reload gateway
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia profile external killgw twilio'"

# Wait 10 seconds for re-registration
sleep 10

# Check status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status gateway twilio'"
```

**If Still Not Working:**
```bash
# Check Elastic IP
curl ifconfig.me

# Verify it matches what's in Twilio IP ACL
# Login to Twilio Console → Elastic SIP Trunking → IP Access Control Lists

# Update gateway config with correct credentials
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo nano /usr/local/freeswitch/etc/freeswitch/sip_profiles/external/twilio.xml"

# Reload SIP profile
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'reloadxml'"
```

---

## Voice Call Issues

### Issue: Outbound Calls Not Connecting

**Symptoms:**
- API returns "Call initiated" but call never rings
- Customer reports no call received
- CDR shows status "failed" or "no-answer"

**Diagnostic Steps:**
```bash
# Check recent call logs in database
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT id, to_number, status, error_message, created_at FROM calls ORDER BY created_at DESC LIMIT 10;"

# Check FreeSWITCH logs for call
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo grep '<call-id>' /usr/local/freeswitch/log/freeswitch.log"

# Check gateway status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status gateway twilio'"
```

**Common Causes:**
1. **Invalid Phone Number Format**
   - Not in E.164 format (+12345678901)
   - Missing country code

2. **Gateway Offline**
   - Twilio gateway not registered
   - No route to PSTN

3. **Insufficient Twilio Credit**
   - Twilio account balance too low
   - Check Twilio Console

4. **Dialplan Error**
   - Wrong dialplan configuration
   - Call not being routed correctly

**Resolution:**
```bash
# Test call with proper E.164 format
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"to":"+17137057323","from":"+15551234567"}'

# If gateway offline, reload it
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia profile external killgw twilio'"

# Check Twilio balance
# Login to Twilio Console → Account → Balance
```

---

### Issue: Inbound Calls Not Working

**Symptoms:**
- Calls to Twilio number go to voicemail
- FreeSWITCH never receives INVITE
- Twilio shows "Call failed"

**Diagnostic Steps:**
```bash
# Check Twilio webhook configuration
# Twilio Console → Phone Numbers → Active Numbers → Select number → Voice Configuration

# Check FreeSWITCH ACL (allows Twilio IPs)
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo cat /usr/local/freeswitch/etc/freeswitch/autoload_configs/acl.conf.xml"

# Check public dialplan
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo ls -lh /usr/local/freeswitch/etc/freeswitch/dialplan/public/"

# Test if FreeSWITCH is listening on port 5060
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo netstat -tuln | grep 5060"
```

**Common Causes:**
1. **Wrong Elastic IP in Twilio**
   - Twilio trunk pointing to old IP
   - Check origination SIP URI

2. **ACL Blocking Twilio**
   - Twilio IP ranges not in whitelist
   - 54.172.60.0/23, 54.244.51.0/24, etc.

3. **Dialplan Not Routing Call**
   - No matching dialplan for inbound calls
   - Extension not found

4. **Security Group Blocking**
   - AWS security group doesn't allow UDP 5060 from Twilio IPs
   - Check inbound rules

**Resolution:**
```bash
# Verify Twilio is sending to correct IP
# Twilio Console → Elastic SIP Trunking → Origination → SIP URI
# Should be: sip:54.160.220.243:5060

# Add Twilio IPs to ACL if missing
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo nano /usr/local/freeswitch/etc/freeswitch/autoload_configs/acl.conf.xml"

# Add this inside <network-lists>:
# <list name="twilio" default="deny">
#   <node type="allow" cidr="54.172.60.0/23"/>
#   <node type="allow" cidr="54.244.51.0/24"/>
# </list>

# Reload ACL
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'reloadacl'"
```

---

### Issue: One-Way Audio (Can't Hear Caller)

**Symptoms:**
- Call connects but one party can't hear the other
- Caller hears agent but agent can't hear caller (or vice versa)
- WebRTC calls have no audio in one direction

**Diagnostic Steps:**
```bash
# Check SIP profile settings
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo cat /usr/local/freeswitch/etc/freeswitch/sip_profiles/internal.xml | grep rtp"

# Check if RTP ports are open
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo netstat -uln | grep -E '(16384|32768)'"

# Check for NAT issues
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'nat_map status'"
```

**Common Causes:**
1. **RTP Ports Blocked**
   - UDP ports 16384-32768 not open in security group
   - Firewall blocking media

2. **NAT Issues**
   - FreeSWITCH behind NAT without proper ext-rtp-ip
   - External IP not configured

3. **Codec Mismatch**
   - No common codec between endpoints
   - G.711 not enabled

4. **WebRTC ICE Failure**
   - STUN/TURN not configured
   - ICE candidates not exchanged

**Resolution:**
```bash
# Verify RTP ports open in security group
aws ec2 describe-security-groups --group-ids <freeswitch-sg-id> --query 'SecurityGroups[0].IpPermissions[?IpProtocol==`udp`]'

# If not open, add rule:
aws ec2 authorize-security-group-ingress \
  --group-id <freeswitch-sg-id> \
  --protocol udp \
  --port 16384-32768 \
  --cidr 0.0.0.0/0

# Configure external IP in SIP profile
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo nano /usr/local/freeswitch/etc/freeswitch/vars.xml"

# Set: <X-PRE-PROCESS cmd="set" data="external_rtp_ip=54.160.220.243"/>
# Set: <X-PRE-PROCESS cmd="set" data="external_sip_ip=54.160.220.243"/>

# Reload config
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'reloadxml'"
```

---

## SMS Issues

### Issue: SMS Not Sending

**Symptoms:**
- API returns success but SMS never delivers
- Database shows status "queued" or "failed"
- Customer reports not receiving SMS

**Diagnostic Steps:**
```bash
# Check recent SMS logs
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT id, to_number, status, error_message, provider, created_at FROM sms_messages ORDER BY created_at DESC LIMIT 20;"

# Check worker logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs sms-worker --lines 100"

# Check provider status (Twilio, Telnyx, etc.)
# Login to provider console and check account status
```

**Common Causes:**
1. **Provider Account Suspended**
   - Insufficient balance
   - Account verification required
   - Compliance issue

2. **Invalid Phone Number**
   - Not in E.164 format
   - Landline number (can't receive SMS)
   - Invalid country code

3. **Worker Not Running**
   - SMS worker crashed
   - NATS connection failed

4. **Rate Limiting**
   - Sending too fast
   - Provider throttling messages

**Resolution:**
```bash
# Restart SMS worker
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart sms-worker"

# Retry failed messages
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "UPDATE sms_messages SET status = 'pending' WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour';"

# Check provider balance
# Twilio: Console → Balance
# Telnyx: Portal → Billing

# Test with valid mobile number
curl -X POST http://3.83.53.69:3000/v1/sms/send \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"to":"+17137057323","from":"+15551234567","message":"Test SMS"}'
```

---

## Email Issues

### Issue: Emails Not Sending

**Symptoms:**
- Emails stuck in "queued" status
- SendGrid/Mailgun returning errors
- Customers not receiving emails

**Diagnostic Steps:**
```bash
# Check recent emails
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT id, to_email, subject, status, error_message, provider, created_at FROM emails ORDER BY created_at DESC LIMIT 20;"

# Check email worker logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs email-worker --lines 100"

# Check provider dashboard
# SendGrid: Dashboard → Activity
# Mailgun: Dashboard → Logs
```

**Common Causes:**
1. **Invalid API Key**
   - API key expired or revoked
   - Wrong API key in environment variables

2. **Sender Domain Not Verified**
   - SPF/DKIM records not configured
   - Domain verification pending

3. **Recipient Email Invalid**
   - Invalid email format
   - Domain doesn't exist

4. **Rate Limiting**
   - Exceeded daily send limit
   - Burst rate exceeded

**Resolution:**
```bash
# Restart email worker
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart email-worker"

# Verify API keys
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cat /home/ubuntu/irisx-backend/.env | grep SENDGRID_API_KEY"

# Test with verified sender
curl -X POST http://3.83.53.69:3000/v1/email/send \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","from":"noreply@yourdomain.com","subject":"Test","body":"Test email"}'

# Check DNS records
dig TXT yourdomain.com
dig TXT default._domainkey.yourdomain.com
```

---

## WhatsApp Issues

### Issue: WhatsApp Messages Not Sending

**Symptoms:**
- Messages stuck in "queued"
- Meta API returning errors
- WhatsApp webhook not receiving updates

**Diagnostic Steps:**
```bash
# Check recent WhatsApp messages
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT id, phone_number, status, error_message, created_at FROM whatsapp_messages ORDER BY created_at DESC LIMIT 20;"

# Check API logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 200 | grep -i whatsapp"

# Check Meta Business Platform
# business.facebook.com → WhatsApp Manager → Message Templates
```

**Common Causes:**
1. **Template Not Approved**
   - Using unapproved template
   - Template in pending or rejected status

2. **Phone Number Not Registered**
   - WhatsApp Business Account not verified
   - Phone number not added to account

3. **Invalid Access Token**
   - Token expired (90 days)
   - Token revoked

4. **Rate Limiting**
   - Tier 1 limit: 1,000 messages/24h
   - Exceeded quality rating threshold

**Resolution:**
```bash
# Check access token
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cat /home/ubuntu/irisx-backend/.env | grep WHATSAPP_ACCESS_TOKEN"

# Test with approved template
curl -X POST http://3.83.53.69:3000/v1/whatsapp/send/template \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"to":"+17137057323","template_name":"hello_world","language":"en"}'

# Verify webhook configured
# Meta Business → WhatsApp Manager → Configuration → Webhooks
# Callback URL: http://3.83.53.69:3000/v1/whatsapp/webhook
# Verify token: (from .env)
```

---

## Agent Desktop Issues

### Issue: WebRTC Not Connecting

**Symptoms:**
- Agent clicks "Connect" but stays disconnected
- Browser console shows WebSocket errors
- No SIP registration

**Diagnostic Steps:**
```bash
# Check FreeSWITCH WebSocket on port 8082
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo netstat -tuln | grep 8082"

# Check Nginx WebSocket proxy
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl status nginx"

# Check browser console (F12)
# Look for: "WebSocket connection failed" or "401 Unauthorized"

# Check FreeSWITCH verto/WebRTC logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo tail -100 /usr/local/freeswitch/log/freeswitch.log | grep -i websocket"
```

**Common Causes:**
1. **Wrong WebSocket URL**
   - URL in Agent Desktop code incorrect
   - Should be: wss://54.160.220.243:8082

2. **SSL Certificate Issue**
   - Self-signed certificate rejected by browser
   - Certificate expired

3. **Nginx Not Running**
   - WebSocket proxy down
   - Port 8082 not listening

4. **Wrong SIP Credentials**
   - Extension number incorrect
   - SIP password wrong

**Resolution:**
```bash
# Verify WebSocket URL in Agent Desktop
# Check src/services/webrtc.js
# transportOptions.server: 'wss://54.160.220.243:8082'

# Restart Nginx
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl restart nginx"

# Check extension registered in FreeSWITCH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status profile internal reg'"

# Get SIP credentials from API
curl http://3.83.53.69:3000/v1/auth/me \
  -H "Authorization: Bearer <jwt-token>"
```

---

### Issue: Agent Can't Make Calls

**Symptoms:**
- Agent connected to WebRTC but dial button does nothing
- Call fails with "Call failed" error
- No audio when call connects

**Diagnostic Steps:**
```bash
# Check if agent is registered
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status profile internal reg' | grep <extension>"

# Check recent calls
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'show calls'"

# Check dialplan execution
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo tail -200 /usr/local/freeswitch/log/freeswitch.log | grep Dialplan"
```

**Common Causes:**
1. **Extension Not Provisioned**
   - Agent extension not created in FreeSWITCH
   - User directory missing

2. **Dialplan Error**
   - Outbound dialplan not configured for tenant
   - Wrong context

3. **Gateway Offline**
   - Twilio gateway not registered
   - Can't route to PSTN

4. **Audio Codec Issue**
   - Browser doesn't support PCMU/PCMA
   - Codec negotiation failed

**Resolution:**
```bash
# Provision extension if missing
curl -X POST http://3.83.53.69:3000/admin/agents \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":7,"first_name":"Test","last_name":"Agent","email":"agent@test.com"}'

# Check tenant dialplan exists
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo ls -lh /usr/local/freeswitch/etc/freeswitch/dialplan/default/ | grep tenant_7"

# Reload dialplan
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo /usr/local/freeswitch/bin/fs_cli -x 'reloadxml'"
```

---

## Customer Portal Issues

### Issue: Cannot Login

**Symptoms:**
- Login form shows "Invalid credentials"
- JWT token not being saved
- Redirects back to login page

**Diagnostic Steps:**
```bash
# Test login API endpoint
curl -X POST http://3.83.53.69:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Check API logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 100 | grep 'auth/login'"

# Check browser console (F12)
# Look for CORS errors or network failures
```

**Common Causes:**
1. **Wrong Password**
   - User forgot password
   - Caps lock on

2. **Account Not Active**
   - Account suspended
   - Email not verified

3. **CORS Issue**
   - API not allowing Customer Portal origin
   - Preflight request failing

4. **JWT Not Being Stored**
   - LocalStorage blocked
   - Browser in private mode

**Resolution:**
```bash
# Reset user password (admin)
curl -X POST http://3.83.53.69:3000/admin/users/<user-id>/reset-password \
  -H "Authorization: Bearer <admin-token>"

# Check CORS configuration
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cat /home/ubuntu/irisx-backend/src/index.js | grep cors"

# Verify user status
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT id, email, status FROM users WHERE email = 'test@example.com';"
```

---

## Admin Portal Issues

### Issue: Admin Portal Not Loading

**Symptoms:**
- Blank white page at http://3.83.53.69/
- 404 errors on page refresh
- Assets not loading

**Diagnostic Steps:**
```bash
# Check Nginx status
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo systemctl status nginx"

# Check Nginx config
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo cat /etc/nginx/sites-available/default"

# Check build files exist
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "ls -lh /var/www/admin-portal/"

# Check Nginx error log
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo tail -50 /var/log/nginx/error.log"
```

**Common Causes:**
1. **Nginx Not Running**
   - Service crashed
   - Configuration error

2. **Build Files Missing**
   - Deployment failed
   - Files deleted

3. **Vue Router Mode Issue**
   - Using history mode but Nginx not configured
   - 404 on refresh

4. **Permission Issues**
   - www-data can't read files
   - Wrong ownership

**Resolution:**
```bash
# Restart Nginx
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo systemctl restart nginx"

# Verify Nginx config has Vue Router fallback
# location / {
#   try_files $uri $uri/ /index.html;
# }

# Fix file permissions
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo chown -R www-data:www-data /var/www/admin-portal"

# Redeploy if files missing
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "cd /path/to/irisx-admin-portal && npm run build && sudo cp -r dist/* /var/www/admin-portal/"
```

---

## Performance Issues

### Issue: High CPU Usage

**Symptoms:**
- Server responding slowly
- `top` shows >80% CPU
- Requests timing out

**Diagnostic Steps:**
```bash
# Check which process is using CPU
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "top -bn2 | head -20"

# Check Node.js processes
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "ps aux | grep node"

# Check PM2 metrics
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 monit"
```

**Common Causes:**
1. **Infinite Loop**
   - Code bug causing CPU spike
   - Check recent deployments

2. **Too Many Concurrent Requests**
   - Traffic spike
   - DDoS attack

3. **Heavy Computation**
   - Complex database queries
   - Large file processing

4. **Memory Leak**
   - Process memory growing
   - Garbage collection running constantly

**Resolution:**
```bash
# Restart API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"

# If FreeSWITCH high CPU
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo systemctl restart freeswitch"

# Scale up EC2 instance if sustained high load
# AWS Console → EC2 → Instances → Actions → Instance Settings → Change Instance Type

# Identify slow queries
psql -h <rds-endpoint> -U irisx_admin -d irisx_production -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

### Issue: High Memory Usage

**Symptoms:**
- OOM errors in logs
- Process killed unexpectedly
- System becomes unresponsive

**Diagnostic Steps:**
```bash
# Check memory usage
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "free -h"

# Check process memory
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "ps aux --sort=-%mem | head -10"

# Check PM2 memory
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 list"
```

**Common Causes:**
1. **Memory Leak**
   - Objects not being garbage collected
   - Event listeners not removed

2. **Large Dataset in Memory**
   - Loading too much data at once
   - Not paginating results

3. **Too Many Processes**
   - PM2 cluster mode with too many instances
   - Other services consuming memory

4. **FreeSWITCH Media Buffers**
   - Too many concurrent calls
   - RTP buffers not released

**Resolution:**
```bash
# Restart leaking process
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "pm2 restart irisx-api"

# Clear cache
redis-cli -h <redis-endpoint> FLUSHALL

# Increase swap if needed (temporary)
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 "sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"

# Scale up EC2 instance for more RAM
```

---

## Error Code Reference

### API Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 400 | Bad Request | Invalid input data | Check request body format |
| 401 | Unauthorized | Missing or invalid API key/JWT | Provide valid credentials |
| 403 | Forbidden | Insufficient permissions | Check user role |
| 404 | Not Found | Resource doesn't exist | Verify resource ID |
| 409 | Conflict | Duplicate resource | Use different identifier |
| 429 | Too Many Requests | Rate limit exceeded | Wait before retrying |
| 500 | Internal Server Error | Server-side error | Check API logs |
| 503 | Service Unavailable | Server overloaded or down | Wait and retry |

### FreeSWITCH Hangup Causes

| Cause | Code | Description | Resolution |
|-------|------|-------------|------------|
| NORMAL_CLEARING | 16 | Call ended normally | No action needed |
| USER_BUSY | 17 | Called party is busy | Retry later |
| NO_ANSWER | 19 | Called party didn't answer | Retry or leave voicemail |
| CALL_REJECTED | 21 | Call was rejected | Check caller ID or permissions |
| NO_ROUTE_DESTINATION | 3 | Can't route call | Check gateway status |
| NETWORK_OUT_OF_ORDER | 38 | Network issue | Check connectivity |
| NORMAL_TEMPORARY_FAILURE | 41 | Temporary failure | Retry |
| ORIGINATOR_CANCEL | 487 | Caller hung up before answer | No action needed |

### Database Error Codes

| Error | Description | Resolution |
|-------|-------------|------------|
| 08006 | Connection failure | Restart API, check RDS status |
| 23505 | Unique constraint violation | Change duplicate value |
| 42P01 | Table doesn't exist | Apply migrations |
| 42703 | Column doesn't exist | Apply migrations |
| 53300 | Too many connections | Restart API, increase max_connections |

---

## Getting Help

**If you can't resolve an issue:**

1. **Gather Information**
   - Error messages
   - Recent logs
   - Steps to reproduce
   - Time issue started

2. **Check Documentation**
   - Operations Runbook
   - API Documentation
   - Vendor support pages

3. **Escalate**
   - Contact on-call engineer
   - Open support ticket with vendor
   - Post in team Slack channel

**Useful Resources:**
- FreeSWITCH Wiki: https://freeswitch.org/confluence/
- Twilio Support: https://support.twilio.com/
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Node.js Docs: https://nodejs.org/docs/

---

**End of Troubleshooting Guide**
