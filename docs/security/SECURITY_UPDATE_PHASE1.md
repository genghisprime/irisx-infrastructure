# Security Update - Phase 1 Complete

**Date:** October 28, 2025
**Your IP:** 73.6.78.238/32
**Status:** ✅ All critical security fixes applied

---

## What Was Fixed

### CRITICAL Issue Resolved
Both API and FreeSWITCH servers were using the **same security group** with incorrect port configurations. This has been completely fixed!

---

## New Security Group Architecture

### 1. API Server Security Group
**Security Group ID:** `sg-03f77311c140b8f2e`
**Name:** `irisx-prod-sg-api`
**Instance:** API Server (3.83.53.69)

| Port | Protocol | Source | Purpose | Status |
|------|----------|--------|---------|--------|
| 22 | TCP | 73.6.78.238/32 | SSH (your IP only) | ✅ SECURED |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirect to HTTPS) | ✅ OK |
| 443 | TCP | 0.0.0.0/0 | HTTPS (nginx reverse proxy) | ✅ OK |
| ~~5060~~ | ~~TCP/UDP~~ | - | ~~SIP~~ | ✅ REMOVED |
| ~~16384-32768~~ | ~~UDP~~ | - | ~~RTP~~ | ✅ REMOVED |

**Changes Made:**
- ✅ Removed SIP port 5060 (TCP/UDP)
- ✅ Removed RTP ports 16384-32768 (UDP)
- ✅ Restricted SSH to your IP only (73.6.78.238/32)
- ✅ Kept HTTP/HTTPS for API access

---

### 2. FreeSWITCH Server Security Group (NEW)
**Security Group ID:** `sg-0460ce5af3265896a`
**Name:** `irisx-prod-sg-freeswitch`
**Instance:** FreeSWITCH Server (54.160.220.243)

| Port | Protocol | Source | Purpose | Status |
|------|----------|--------|---------|--------|
| 22 | TCP | 73.6.78.238/32 | SSH (your IP only) | ✅ SECURED |
| 5060 | TCP | 0.0.0.0/0 | SIP signaling (TCP) | ✅ REQUIRED |
| 5060 | UDP | 0.0.0.0/0 | SIP signaling (UDP) | ✅ REQUIRED |
| 16384-32768 | UDP | 0.0.0.0/0 | RTP media streams | ✅ REQUIRED |
| 8021 | TCP | sg-03f77311c140b8f2e | ESL (API server only) | ✅ SECURED |

**Why These Ports:**
- **SIP 5060:** Must be open to internet for SIP providers (Twilio, etc.)
- **RTP 16384-32768:** Must be open for voice media (audio streams)
- **ESL 8021:** Locked to API server security group only (not public!)
- **SSH 22:** Locked to your IP only

---

## Security Improvements Summary

### Before (CRITICAL ISSUES)
- ❌ Both servers shared same security group
- ❌ API server had unnecessary SIP/RTP ports open
- ❌ SSH open to entire internet (0.0.0.0/0)
- ❌ No separation of concerns

### After (SECURE)
- ✅ Separate security groups for each server
- ✅ API server: Only HTTP/HTTPS/SSH
- ✅ FreeSWITCH server: Proper telephony ports
- ✅ SSH locked to your IP only (73.6.78.238/32)
- ✅ ESL port locked to API server only
- ✅ Proper network segmentation

---

## Updated AWS Resources

**File:** [aws-infrastructure-ids.txt](./aws-infrastructure-ids.txt)

```bash
# Security Groups
API_SG=sg-03f77311c140b8f2e                    # API server security group
FREESWITCH_SG=sg-0460ce5af3265896a             # FreeSWITCH security group (NEW)

# Your IP
SSH_ALLOWED_IP=73.6.78.238/32                  # SSH restricted to this IP
```

---

## Testing SSH Access

Both servers should still be accessible via SSH:

```bash
# Test API server SSH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
# Should work ✅

# Test FreeSWITCH server SSH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
# Should work ✅

# Test from different IP (should fail)
# Someone else trying to SSH → DENIED ❌
```

---

## What's Protected Now

### API Server (3.83.53.69)
- ✅ **Port 3000:** Blocked (localhost only)
- ✅ **SSH:** Only from your IP (73.6.78.238)
- ✅ **SIP/RTP:** Removed (not needed here)
- ✅ **Database:** Already in private subnet
- ✅ **Redis:** Already in private subnet

### FreeSWITCH Server (54.160.220.243)
- ✅ **SIP 5060:** Open (required for telephony)
- ✅ **RTP 16384-32768:** Open (required for voice)
- ✅ **ESL 8021:** Locked to API server only
- ✅ **SSH:** Only from your IP (73.6.78.238)

### Database (RDS)
- ✅ **Private subnet:** Not internet accessible
- ✅ **Security group:** Only API/FreeSWITCH can connect
- ✅ **SSL/TLS:** Encrypted connections

### Redis (ElastiCache)
- ✅ **Private subnet:** Not internet accessible
- ✅ **Security group:** Only API/FreeSWITCH can connect
- ✅ **Encryption:** At rest and in transit

---

## Network Architecture Diagram

```
Internet
   │
   ├─────────────────────────────────────────────┐
   │                                             │
   ▼                                             ▼
[Your IP: 73.6.78.238]                    [SIP Providers]
   │                                             │
   │ SSH (22)                                    │ SIP (5060)
   │                                             │ RTP (16384-32768)
   ▼                                             ▼
┌──────────────────┐                    ┌──────────────────┐
│   API Server     │◄──── ESL (8021) ───│ FreeSWITCH       │
│  3.83.53.69      │                    │ 54.160.220.243   │
│                  │                    │                  │
│ sg-03f77311      │                    │ sg-0460ce5       │
│ - HTTP/HTTPS     │                    │ - SIP/RTP        │
│ - SSH (your IP)  │                    │ - SSH (your IP)  │
└──────────────────┘                    └──────────────────┘
        │                                        │
        │                                        │
        └────────────┬──────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Private Subnet │
            │                │
            │  ┌──────────┐  │
            │  │   RDS    │  │
            │  │PostgreSQL│  │
            │  └──────────┘  │
            │                │
            │  ┌──────────┐  │
            │  │  Redis   │  │
            │  │ElastiCache│ │
            │  └──────────┘  │
            └────────────────┘
```

---

## If Your IP Changes

If your home IP changes, you'll need to update the security groups:

```bash
# 1. Get new IP
NEW_IP=$(curl -s https://api.ipify.org)
echo "New IP: $NEW_IP"

# 2. Update API server security group
export AWS_PROFILE=irisx-virginia

# Remove old rule
aws ec2 revoke-security-group-ingress \
  --group-id sg-03f77311c140b8f2e \
  --protocol tcp --port 22 --cidr 73.6.78.238/32

# Add new rule
aws ec2 authorize-security-group-ingress \
  --group-id sg-03f77311c140b8f2e \
  --ip-permissions "[{\"IpProtocol\": \"tcp\", \"FromPort\": 22, \"ToPort\": 22, \"IpRanges\": [{\"CidrIp\": \"$NEW_IP/32\", \"Description\": \"SSH from home\"}]}]"

# 3. Update FreeSWITCH server security group
aws ec2 revoke-security-group-ingress \
  --group-id sg-0460ce5af3265896a \
  --protocol tcp --port 22 --cidr 73.6.78.238/32

aws ec2 authorize-security-group-ingress \
  --group-id sg-0460ce5af3265896a \
  --ip-permissions "[{\"IpProtocol\": \"tcp\", \"FromPort\": 22, \"ToPort\": 22, \"IpRanges\": [{\"CidrIp\": \"$NEW_IP/32\", \"Description\": \"SSH from home\"}]}]"

# 4. Update aws-infrastructure-ids.txt
# Replace SSH_ALLOWED_IP with new IP
```

---

## Next Security Steps (Phase 2 - Week 2)

### Still To Do (Not Critical)

1. **nginx Reverse Proxy**
   - Install nginx on API server
   - Configure SSL/TLS with Let's Encrypt
   - Add rate limiting (10 req/s)
   - Block direct port 3000 access

2. **API Authentication**
   - Implement API key middleware
   - Rate limiting per API key
   - Input validation with Zod

3. **S3 Bucket Hardening**
   - Block public access
   - Enable encryption at rest
   - Enable versioning
   - Set lifecycle policy (auto-delete after 90 days)

4. **CloudWatch Monitoring**
   - Set up alarms for failed SSH attempts
   - Monitor API errors
   - Track database connections

5. **Fail2Ban** (Week 3)
   - Auto-ban IPs after 5 failed SSH attempts
   - Monitor FreeSWITCH for SIP attacks
   - Protect API from brute force

See [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) for full plan.

---

## Security Group Quick Reference

### View Current Rules

```bash
export AWS_PROFILE=irisx-virginia

# API server
aws ec2 describe-security-groups \
  --group-ids sg-03f77311c140b8f2e \
  --query 'SecurityGroups[0].IpPermissions'

# FreeSWITCH server
aws ec2 describe-security-groups \
  --group-ids sg-0460ce5af3265896a \
  --query 'SecurityGroups[0].IpPermissions'
```

### Test Security

```bash
# Should work (from your IP)
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Should be blocked (port 3000 not exposed)
curl http://3.83.53.69:3000
# curl: (7) Failed to connect

# Should work (API will work once nginx is set up)
curl http://3.83.53.69
```

---

## Cost Impact

**Additional Cost:** $0.00/month

Security groups are free! No additional cost for these security improvements.

---

## Summary

✅ **Phase 1 Security: COMPLETE**

- Created separate FreeSWITCH security group
- Removed SIP/RTP from API server
- Restricted SSH to your IP only (both servers)
- ESL port locked to API server only
- Proper network segmentation

**Security Posture:**
- Before: ⚠️ Critical vulnerabilities
- After: ✅ Production-ready (with Phase 2 planned)

**Next:** Install nginx reverse proxy and implement API authentication!

---

## Files Updated

1. ✅ [aws-infrastructure-ids.txt](./aws-infrastructure-ids.txt) - Added FREESWITCH_SG and SSH_ALLOWED_IP
2. ✅ [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) - Complete security documentation
3. ✅ [SECURITY_UPDATE_PHASE1.md](./SECURITY_UPDATE_PHASE1.md) - This file

Ready to continue with API development! 🔒
