# IRISX Security Architecture

**Date:** October 28, 2025
**Status:** Needs Implementation

---

## Current Security Issues Found

**CRITICAL:** Both API and FreeSWITCH servers are using the same security group!

- API server should NOT have SIP/RTP ports open
- FreeSWITCH server needs separate security group
- SSH is open to 0.0.0.0/0 (should be your IP only)

---

## Recommended Security Architecture

### 1. API Server Security (3.83.53.69)

**Purpose:** Run Hono.js API, process webhooks, manage database

#### Security Group: `irisx-prod-sg-api`

| Port | Protocol | Source | Purpose | Status |
|------|----------|--------|---------|--------|
| 22 | TCP | YOUR_IP/32 | SSH access | ⚠️ Need to restrict |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirect to HTTPS) | ✅ OK |
| 443 | TCP | 0.0.0.0/0 | HTTPS (nginx → API) | ✅ OK |
| 5060 | TCP/UDP | - | SIP signaling | ❌ REMOVE |
| 16384-32768 | UDP | - | RTP media | ❌ REMOVE |

#### Application Security Layers

1. **nginx Reverse Proxy**
   ```nginx
   # Only expose HTTPS, API runs on localhost:3000
   server {
       listen 443 ssl http2;
       server_name api.irisx.com;

       # SSL certificate from Let's Encrypt
       ssl_certificate /etc/letsencrypt/live/api.irisx.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.irisx.com/privkey.pem;

       # Rate limiting
       limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
       limit_req zone=api burst=20 nodelay;

       # Proxy to API
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. **API Key Authentication**
   ```javascript
   // middleware/auth.js
   export const authenticate = async (c, next) => {
       const apiKey = c.req.header('X-API-Key');

       if (!apiKey) {
           return c.json({ error: 'Missing API key' }, 401);
       }

       // Query api_keys table
       const result = await query(
           'SELECT tenant_id, status FROM api_keys WHERE key_hash = $1',
           [hashApiKey(apiKey)]
       );

       if (result.rows.length === 0) {
           return c.json({ error: 'Invalid API key' }, 401);
       }

       if (result.rows[0].status !== 'active') {
           return c.json({ error: 'API key inactive' }, 403);
       }

       // Set tenant_id in context for multi-tenancy
       c.set('tenantId', result.rows[0].tenant_id);

       await next();
   };
   ```

3. **Rate Limiting (per API key)**
   ```javascript
   // middleware/rateLimit.js
   import { getCache, setCache } from '../db/redis.js';

   export const rateLimit = async (c, next) => {
       const apiKey = c.req.header('X-API-Key');
       const key = `ratelimit:${apiKey}`;

       const current = await getCache(key);

       if (current && parseInt(current) > 100) {
           return c.json({
               error: 'Rate limit exceeded',
               retry_after: 60
           }, 429);
       }

       await setCache(key, current ? parseInt(current) + 1 : 1, 60);

       await next();
   };
   ```

4. **Input Validation (Zod)**
   ```javascript
   import { z } from 'zod';

   const callSchema = z.object({
       to: z.string().regex(/^\+?[1-9]\d{1,14}$/),
       from: z.string().regex(/^\+?[1-9]\d{1,14}$/),
       webhook_url: z.string().url().optional()
   });

   // Use in endpoint
   const data = callSchema.parse(await c.req.json());
   ```

5. **Webhook IP Whitelist** (optional)
   ```javascript
   // Only accept webhooks from known IPs
   const TWILIO_IPS = [
       '54.172.60.0/23',
       '54.244.51.0/24',
       // ... Twilio IP ranges
   ];
   ```

---

### 2. FreeSWITCH Server Security (54.160.220.243)

**Purpose:** Handle SIP signaling and RTP media for voice calls

#### Security Group: `irisx-prod-sg-freeswitch` (NEW - needs creation)

| Port | Protocol | Source | Purpose | Status |
|------|----------|--------|---------|--------|
| 22 | TCP | YOUR_IP/32 | SSH access | ⏳ Need to create |
| 5060 | TCP | 0.0.0.0/0 | SIP signaling (TCP) | ⏳ Need to create |
| 5060 | UDP | 0.0.0.0/0 | SIP signaling (UDP) | ⏳ Need to create |
| 5061 | TCP | 0.0.0.0/0 | SIP TLS (optional) | ⏳ Future |
| 8021 | TCP | sg-03f77311c140b8f2e | ESL (API server only) | ⏳ Need to create |
| 16384-32768 | UDP | 0.0.0.0/0 | RTP media streams | ⏳ Need to create |

#### FreeSWITCH Application Security

1. **SIP Profile ACL** (deny unknown IPs)
   ```xml
   <!-- /etc/freeswitch/autoload_configs/acl.conf.xml -->
   <configuration name="acl.conf" description="Network Lists">
     <network-lists>
       <list name="trusted" default="deny">
         <node type="allow" cidr="54.172.60.0/23"/>  <!-- Twilio -->
         <node type="allow" cidr="54.244.51.0/24"/>  <!-- Twilio -->
         <!-- Add your SIP provider IPs -->
       </list>
     </network-lists>
   </configuration>
   ```

2. **ESL Password Protection**
   ```xml
   <!-- /etc/freeswitch/autoload_configs/event_socket.conf.xml -->
   <configuration name="event_socket.conf" description="Socket Client">
     <settings>
       <param name="nat-map" value="false"/>
       <param name="listen-ip" value="0.0.0.0"/>
       <param name="listen-port" value="8021"/>
       <param name="password" value="STRONG_RANDOM_PASSWORD"/>
     </settings>
   </configuration>
   ```

3. **SIP Authentication Required**
   ```xml
   <!-- All SIP endpoints must authenticate -->
   <!-- No anonymous calls allowed -->
   <param name="auth-calls" value="true"/>
   <param name="accept-blind-auth" value="false"/>
   ```

4. **Fail2Ban** (block brute force attacks)
   ```bash
   # Install fail2ban on FreeSWITCH server
   sudo apt-get install fail2ban

   # Configure to monitor FreeSWITCH logs
   # Ban IPs with failed SIP auth attempts
   ```

---

### 3. Database Security (RDS PostgreSQL)

**Status:** ✅ Already properly secured!

- ✅ In private subnet (not internet accessible)
- ✅ Security group only allows connections from API/FreeSWITCH servers
- ✅ SSL/TLS encryption enforced
- ✅ Strong password (32 characters hex)
- ✅ Automated backups enabled

**Additional Recommendations:**

- Enable RDS Performance Insights (monitor queries)
- Set up CloudWatch alarms for failed connections
- Rotate database password every 90 days
- Use IAM authentication (future enhancement)

---

### 4. Redis Security (ElastiCache)

**Status:** ✅ Already properly secured!

- ✅ In private subnet (not internet accessible)
- ✅ Security group only allows connections from API/FreeSWITCH servers
- ✅ Encryption at rest enabled
- ✅ Encryption in transit enabled

**Additional Recommendations:**

- Enable Redis AUTH (password protection)
- Set up CloudWatch alarms for high memory usage
- Regular snapshots for disaster recovery

---

### 5. S3 Bucket Security (Recordings)

**Status:** ⚠️ Needs review

**Current bucket:** `irisx-prod-recordings-672e7c49`

**Required security:**

1. **Block Public Access** (enabled by default on new buckets)
   ```bash
   aws s3api put-public-access-block \
     --bucket irisx-prod-recordings-672e7c49 \
     --public-access-block-configuration \
     "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
   ```

2. **Enable Encryption** (at rest)
   ```bash
   aws s3api put-bucket-encryption \
     --bucket irisx-prod-recordings-672e7c49 \
     --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   ```

3. **Versioning** (protect against accidental deletion)
   ```bash
   aws s3api put-bucket-versioning \
     --bucket irisx-prod-recordings-672e7c49 \
     --versioning-configuration Status=Enabled
   ```

4. **Lifecycle Policy** (auto-delete after 90 days to save cost)
   ```json
   {
     "Rules": [{
       "Status": "Enabled",
       "ExpirationInDays": 90,
       "NoncurrentVersionExpirationInDays": 30
     }]
   }
   ```

5. **IAM Policy** (least privilege)
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::irisx-prod-recordings-672e7c49/*"
       }
     ]
   }
   ```

---

## Implementation Plan

### Phase 1: Immediate (Critical)

1. **Get your current public IP**
   ```bash
   curl -s https://api.ipify.org
   ```

2. **Create FreeSWITCH security group**
   ```bash
   # Create new security group for FreeSWITCH
   aws ec2 create-security-group \
     --group-name irisx-prod-sg-freeswitch \
     --description "IRISX FreeSWITCH server security group" \
     --vpc-id vpc-0bab7828e5ffb7fa5

   # Add SIP, RTP, ESL, SSH rules
   ```

3. **Update API security group**
   ```bash
   # Remove SIP/RTP ports from API server
   # Restrict SSH to your IP only
   ```

4. **Assign correct security groups**
   ```bash
   # API server → irisx-prod-sg-api (updated)
   # FreeSWITCH server → irisx-prod-sg-freeswitch (new)
   ```

### Phase 2: Week 2 (High Priority)

5. **Install nginx on API server**
   - Reverse proxy configuration
   - SSL/TLS certificate from Let's Encrypt
   - Rate limiting configuration

6. **Implement API authentication**
   - API key middleware
   - Rate limiting middleware
   - Input validation with Zod

7. **Secure S3 bucket**
   - Block public access
   - Enable encryption
   - Enable versioning
   - Set lifecycle policy

### Phase 3: Week 3 (Medium Priority)

8. **FreeSWITCH hardening**
   - Install and configure FreeSWITCH
   - Set up SIP ACLs
   - Configure ESL password
   - Require SIP authentication

9. **Install Fail2Ban**
   - On both servers
   - Monitor SSH, API, and FreeSWITCH logs
   - Auto-ban after 5 failed attempts

10. **CloudWatch monitoring**
    - Set up alarms for security events
    - Failed login attempts
    - Unusual API activity
    - High database connection count

### Phase 4: Week 4+ (Nice to Have)

11. **AWS WAF** (Web Application Firewall)
    - Protect against SQL injection
    - Protect against XSS
    - Block malicious IPs
    - Cost: ~$5-10/mo

12. **VPN for SSH access** (optional)
    - Even more secure than IP whitelisting
    - Cost: Free with AWS Client VPN

13. **IAM roles** instead of access keys
    - For EC2 → RDS access
    - For EC2 → S3 access

---

## Security Checklist

### Network Layer
- [ ] Separate security groups for API and FreeSWITCH
- [ ] SSH restricted to your IP only
- [ ] Database/Redis in private subnet
- [ ] No unnecessary ports open

### Application Layer
- [ ] nginx reverse proxy (HTTPS only)
- [ ] API key authentication
- [ ] Rate limiting (per key and per IP)
- [ ] Input validation (Zod)
- [ ] Webhook signature verification

### Data Layer
- [ ] Database in private subnet
- [ ] SSL/TLS for database connections
- [ ] Redis AUTH enabled
- [ ] S3 public access blocked
- [ ] S3 encryption at rest

### Monitoring
- [ ] CloudWatch alarms for security events
- [ ] Fail2Ban on both servers
- [ ] API access logs
- [ ] Database slow query logs

### Compliance
- [ ] GDPR: Data encryption, retention policy
- [ ] PCI DSS: If handling payment data
- [ ] HIPAA: If handling health data
- [ ] TCPA: Call recording consent

---

## Cost Impact

| Security Enhancement | Monthly Cost |
|---------------------|--------------|
| Let's Encrypt SSL | $0 (free) |
| nginx | $0 (included) |
| Fail2Ban | $0 (free) |
| CloudWatch Alarms | ~$0.50 (10 alarms) |
| AWS WAF (optional) | ~$5-10 |
| VPN (optional) | ~$0.10/connection |
| **Total** | **~$0.50 - $15/mo** |

Most security is **free** - just configuration!

---

## Quick Commands Reference

### Check Your Public IP
```bash
curl -s https://api.ipify.org
```

### View Security Group Rules
```bash
aws ec2 describe-security-groups \
  --group-ids sg-03f77311c140b8f2e \
  --query 'SecurityGroups[0].IpPermissions'
```

### Add SSH restriction to your IP
```bash
# Replace YOUR_IP with output from ipify
aws ec2 authorize-security-group-ingress \
  --group-id sg-03f77311c140b8f2e \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32
```

### Test nginx rate limiting
```bash
# Should get 429 after 10 requests/second
for i in {1..20}; do
  curl -I https://api.irisx.com/health
done
```

---

## Summary

**Current Status:** ⚠️ Both servers using same security group - needs fix

**Priority Actions:**
1. Create separate FreeSWITCH security group
2. Remove SIP/RTP from API server
3. Restrict SSH to your IP only
4. Install nginx reverse proxy
5. Implement API key authentication

**Timeline:** Phase 1 (critical) can be done in 30 minutes!

Let me know if you want me to implement Phase 1 now! 🔒
