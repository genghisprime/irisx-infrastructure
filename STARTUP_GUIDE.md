# IRISX Startup Guide

## Quick Start (Recommended)

```bash
cd /Users/gamer/Documents/GitHub/IRISX
./start-local-dev.sh
```

This starts both the API (port 3000) and Admin Portal (port 5173) automatically.

To stop:
```bash
./stop-local-dev.sh
```

---

## All Components

| Component | Location | Port | Start Command |
|-----------|----------|------|---------------|
| API Server | `api/` | 3000 | `node src/index.js` |
| Admin Portal | `irisx-admin-portal/` | 5173 | `npm run dev` |
| Customer Portal | `irisx-customer-portal/` | 5174* | `npm run dev` |
| Agent Desktop | `irisx-agent-desktop/` | 5175* | `npm run dev` |
| Dashboard | `irisx-dashboard/` | 5176* | `npm run dev` |

*Ports auto-assigned when multiple frontends run simultaneously

---

## Manual Startup (Each in separate terminal)

### 1. API Server
```bash
cd /Users/gamer/Documents/GitHub/IRISX/api
node src/index.js
```
- Health check: http://localhost:3000/health
- API docs: http://localhost:3000/docs

### 2. Admin Portal (Staff management)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-admin-portal
npm run dev
```
- URL: http://localhost:5173

### 3. Customer Portal (Tenant self-service)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-customer-portal
npm run dev
```
- URL: http://localhost:5174

### 4. Agent Desktop (Call center agents + WebRTC Softphone)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop
npm run dev
```
- URL: http://localhost:5175
- Includes built-in WebRTC softphone that connects to FreeSWITCH

### 5. Dashboard (System monitoring)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-dashboard
npm run dev
```
- URL: http://localhost:5176

---

## AWS Infrastructure

### EC2 Instances

| Service | Instance ID | Elastic IP | Private IP | Purpose |
|---------|-------------|------------|------------|---------|
| API Server | `i-032d6844d393bdef4` | `3.211.106.196` | `10.0.1.240` | Node.js API + Workers |
| FreeSWITCH | `i-00b4b8ad65f1f32c1` | `54.160.220.243` | `10.0.1.213` | PBX/WebRTC |
| Mail Server | `i-03c2c04c25ceaf029` | `54.85.183.55` | `10.0.1.63` | Postfix/Dovecot |

### Managed Services

| Service | Type | Endpoint |
|---------|------|----------|
| PostgreSQL | RDS | `irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432` |
| Redis | ElastiCache | `irisx-prod-redis.zjxfxn.0001.use1.cache.amazonaws.com:6379` |
| S3 Recordings | S3 | `irisx-prod-recordings-672e7c49` |
| NATS JetStream | On API Server | `localhost:4222` (internal) |

### Security Groups

| Group | ID | Purpose |
|-------|-----|---------|
| Employee Home IPs | `sg-0953588730a981680` | Home IP access (add employee IPs here) |
| Internal Servers | `sg-05a8befb4f85cf59e` | Server-to-server communication |

**Current Access:** All servers locked to home IP `170.203.120.44` only.

### VPC
- VPC ID: `vpc-0bab7828e5ffb7fa5`
- All IRISX servers in same VPC for internal communication

---

## SSH to Servers

### API Server
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196
```

### FreeSWITCH Server
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
```

### Mail Server
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55
```

---

## FreeSWITCH / PBX Access

```bash
# SSH to FreeSWITCH
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243

# Connect to FreeSWITCH CLI
sudo fs_cli

# Useful fs_cli commands:
sofia status          # SIP registration status
show channels         # Active calls
show registrations    # Registered extensions
reloadxml             # Reload configuration
```

### WebRTC Endpoints
- WebSocket: `wss://54.160.220.243:7443`
- SIP WebSocket: `wss://54.160.220.243:5066`

---

## Production API Management

### Check Status
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "pm2 list"
```

### View Logs
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "pm2 logs irisx-api --lines 50"
```

### Restart Services
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "pm2 restart all"
```

### PM2 Processes on API Server
| Process | Purpose |
|---------|---------|
| irisx-api | Main API server (port 3000) |
| irisx-sms-worker | SMS delivery via NATS |
| irisx-email-worker | Email delivery via NATS |
| irisx-webhook-worker | Webhook delivery via NATS |

---

## NATS JetStream (Message Queue)

### Check Streams
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "nats stream list"
```

### Active Streams
| Stream | Subjects | Purpose |
|--------|----------|---------|
| SMS | `sms.>` | SMS delivery jobs |
| EMAIL | `email.>` | Email delivery jobs |
| WEBHOOKS | `webhooks.>` | Webhook delivery jobs |
| CALLS | `calls.>` | Call events |

---

## Database Access

```bash
PGPASSWORD='5cdce73ae642767beb8bac7085ad2bf2' psql \
  -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod
```

---

## Run Tests

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api

npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
```

---

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| `./deploy-api.sh` | Deploy API to production EC2 |
| `./restart-production-api.sh` | Restart production API service |
| `./deploy-all-admin-fixes.sh` | Deploy admin route updates |

---

## Logs

### Local Development
| Log | Location |
|-----|----------|
| API (dev) | `/tmp/irisx-api-dev.log` |
| Admin Portal (dev) | `/tmp/irisx-admin-dev.log` |

```bash
tail -f /tmp/irisx-api-dev.log
```

### Production
```bash
# API logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "pm2 logs irisx-api --lines 100"

# FreeSWITCH logs
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 "sudo tail -100 /var/log/freeswitch/freeswitch.log"
```

---

## Service Architecture

```
Browser (localhost:5173-5176)
    |
Vue Frontends (Admin/Customer/Agent/Dashboard)
    |
    +-- Agent Desktop includes WebRTC Softphone
    |       |
    |       +-- FreeSWITCH (54.160.220.243:7443 WebSocket)
    |
API Server (localhost:3000 or 3.211.106.196:3000)
    |
    +-- PostgreSQL (AWS RDS)
    +-- Redis (AWS ElastiCache)
    +-- NATS JetStream (Message Queue)
    |       +-- SMS Worker
    |       +-- Email Worker
    |       +-- Webhook Worker
    +-- FreeSWITCH (WebRTC/SIP)
    +-- Mail Server (SMTP)
    +-- Twilio/Telnyx (Voice/SMS)
    +-- S3 (Recordings)
    +-- OpenAI (TTS/AI)
    +-- Firebase (Push notifications)
```

---

## Common Issues

### Port already in use
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill it
```

### Redis connection timeout
Normal for local development - Redis is locked to AWS VPC. The API will work without it (caching disabled).

### Workers crashing (High CPU)
Check NATS streams exist:
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.211.106.196 "nats stream list"
```
If streams missing, create them:
```bash
nats stream add SMS --subjects 'sms.>' --storage file --retention limits --max-age=72h --discard old --replicas=1 --defaults
nats stream add EMAIL --subjects 'email.>' --storage file --retention limits --max-age=72h --discard old --replicas=1 --defaults
nats stream add WEBHOOKS --subjects 'webhooks.>' --storage file --retention limits --max-age=72h --discard old --replicas=1 --defaults
```

### npm install needed
If you see module errors, run:
```bash
npm install
```
in the respective directory.

---

## Key URLs

| Environment | URL |
|-------------|-----|
| Local API | http://localhost:3000 |
| Local Admin | http://localhost:5173 |
| Local Customer | http://localhost:5174 |
| Local Agent | http://localhost:5175 |
| Local Dashboard | http://localhost:5176 |
| **Production API** | https://api.tazzi.com |
| **Production Admin Portal** | https://admin.tazzi.com |
| **Production Customer Portal** | https://customer.tazzi.com |
| **Production Agent Desktop** | https://agent.tazzi.com |
| **Production Dashboard** | https://dashboard.tazzi.com |
| **Production API Docs** | https://api.tazzi.com/docs |

*All production URLs use SSL/TLS (HTTPS) via Let's Encrypt certificates (auto-renewing)*

---

## Adding New Employee IPs

To give a new employee access to the servers:

```bash
# Add their IP to the Employee Home IPs security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-0953588730a981680 \
  --protocol tcp \
  --port 22 \
  --cidr <NEW_IP>/32 \
  --description "Employee Name"

# Repeat for other needed ports (3000, 443, 80, etc.)
```

Or add all common ports at once by updating the security group in AWS Console.
