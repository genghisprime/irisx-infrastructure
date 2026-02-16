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

### 4. Agent Desktop (Call center agents)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop
npm run dev
```

### 5. Dashboard (System monitoring)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-dashboard
npm run dev
```

---

## AWS Services (Always Running)

| Service | Type | Endpoint |
|---------|------|----------|
| PostgreSQL | RDS | `irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432` |
| Redis | ElastiCache | `irisx-prod-redis.zjxfxn.0001.use1.cache.amazonaws.com:6379` |
| FreeSWITCH | EC2 | `54.160.220.243` (Elastic IP) |
| Production API | EC2 | `3.83.53.69:3000` / `https://api.tazzi.com` |
| S3 Recordings | S3 | `irisx-prod-recordings-672e7c49` |

### AWS Access
- SSH Key: `~/.ssh/irisx-prod-key.pem`
- API Instance: `i-032d6844d393bdef4`
- FreeSWITCH Instance: `i-00b4b8ad65f1f32c1`
- VPC: `vpc-0bab7828e5ffb7fa5`

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

| Log | Location |
|-----|----------|
| API (dev) | `/tmp/irisx-api-dev.log` |
| Admin Portal (dev) | `/tmp/irisx-admin-dev.log` |
| Production API | `/tmp/api-production.log` |

View logs:
```bash
tail -f /tmp/irisx-api-dev.log
```

---

## Database Access

```bash
PGPASSWORD='5cdce73ae642767beb8bac7085ad2bf2' psql \
  -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod
```

---

## SSH to Servers

### API Server
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
```

### FreeSWITCH Server
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
```

---

## Service Architecture

```
Browser (localhost:5173)
    |
Vue Frontends (Admin/Customer/Agent/Dashboard)
    |
API Server (localhost:3000)
    |
    +-- PostgreSQL (AWS RDS)
    +-- Redis (AWS ElastiCache)
    +-- Twilio/Telnyx (Voice/SMS)
    +-- FreeSWITCH (WebRTC)
    +-- S3 (Recordings)
    +-- SendGrid/Mailgun (Email)
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
| Production API | https://api.tazzi.com |
| Production Admin | https://admin.tazzi.com |
