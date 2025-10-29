# IRISX API Setup Complete

**Date:** October 28, 2025
**Server:** API Server (3.83.53.69)
**Status:** Running and operational

---

## Backend API Successfully Deployed

The Hono.js API server is now running on the EC2 API server with full database and Redis connectivity!

### What Was Built

1. **Directory Structure**
   ```
   ~/irisx-backend/
   ├── src/
   │   ├── index.js              # Main Hono.js server
   │   ├── db/
   │   │   ├── connection.js     # PostgreSQL connection pool
   │   │   └── redis.js          # Redis client with helpers
   │   ├── routes/               # API routes (ready for endpoints)
   │   └── middleware/           # Custom middleware (ready to use)
   ├── logs/                     # PM2 logs
   ├── .env                      # Environment configuration
   ├── package.json              # Dependencies and scripts
   └── ecosystem.config.cjs      # PM2 process manager config
   ```

2. **Core Modules Created**
   - **Database Connection Module** (`src/db/connection.js`)
     - PostgreSQL connection pool (max 20 connections)
     - Query helper with logging
     - Automatic reconnection
     - SSL/TLS encrypted connections to RDS

   - **Redis Connection Module** (`src/db/redis.js`)
     - Redis client with auto-reconnect
     - Helper functions: `setCache()`, `getCache()`, `deleteCache()`
     - JSON serialization support
     - Configurable TTL (default 1 hour)

   - **Main API Server** (`src/index.js`)
     - Hono.js framework (3x faster than Express)
     - CORS middleware enabled
     - Logger middleware
     - Health check endpoint with DB/Redis status
     - Error handling and 404 handler
     - Graceful shutdown handlers

3. **Installed Dependencies**
   ```json
   {
     "hono": "^4.10.3",
     "@hono/node-server": "^1.19.5",
     "pg": "^8.16.3",
     "ioredis": "^5.8.2",
     "zod": "^4.1.12",
     "dotenv": "^17.2.3",
     "pm2": "^5.x.x"
   }
   ```

4. **Environment Configuration** (`.env`)
   ```bash
   NODE_ENV=development
   PORT=3000
   DB_HOST=irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com
   DB_PORT=5432
   DB_NAME=irisx_prod
   DB_USER=irisx_admin
   DB_PASSWORD=5cdce73ae642767beb8bac7085ad2bf2
   REDIS_HOST=irisx-prod-redis.zjxfxn.0001.use1.cache.amazonaws.com
   REDIS_PORT=6379
   ```

---

## API Endpoints Available

### 1. Root Endpoint
```bash
GET http://3.83.53.69:3000/
```

**Response:**
```json
{
  "name": "IRISX API",
  "version": "1.0.0",
  "description": "Multi-channel communications platform API",
  "endpoints": {
    "health": "/health",
    "docs": "/docs",
    "api": "/v1"
  }
}
```

### 2. Health Check
```bash
GET http://3.83.53.69:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T00:59:59.810Z",
  "database": {
    "status": "connected",
    "serverTime": "2025-10-29T00:59:59.806Z"
  },
  "redis": {
    "status": "connected"
  },
  "version": "1.0.0"
}
```

### 3. API v1 Info
```bash
GET http://3.83.53.69:3000/v1
```

**Response:**
```json
{
  "version": "v1",
  "message": "IRISX API v1 - Coming soon",
  "endpoints": [
    "POST /v1/calls - Initiate a call",
    "GET /v1/calls/:id - Get call details",
    "POST /v1/sms - Send SMS",
    "GET /v1/phone-numbers - List phone numbers"
  ]
}
```

---

## Process Management with PM2

The API is managed by PM2 for production reliability:

### PM2 Commands

```bash
# SSH to server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Check status
cd ~/irisx-backend
npx pm2 status

# View logs (real-time)
npx pm2 logs irisx-api

# View logs (last 100 lines)
npx pm2 logs irisx-api --lines 100

# Restart API
npx pm2 restart irisx-api

# Stop API
npx pm2 stop irisx-api

# Start API
npx pm2 start ecosystem.config.cjs

# Monitor (CPU, memory, logs)
npx pm2 monit

# Save process list (for auto-restart on reboot)
npx pm2 save
```

### PM2 Configuration

**File:** `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: "irisx-api",
    script: "./src/index.js",
    instances: 1,
    exec_mode: "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    error_file: "./logs/error.log",
    out_file: "./logs/out.log",
    log_file: "./logs/combined.log",
    time: true
  }]
};
```

### Auto-Start on Reboot

PM2 is configured to automatically start the API when the server reboots:

```bash
# This was already configured
sudo systemctl status pm2-ubuntu
```

---

## Testing the API

### From EC2 Server (Internal)

```bash
# SSH to server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Test health check
curl http://localhost:3000/health | jq .

# Test root endpoint
curl http://localhost:3000/ | jq .

# Test v1 endpoint
curl http://localhost:3000/v1 | jq .
```

### From Your Local Machine (External)

⚠️ **Currently blocked by security group** - Port 3000 is not exposed publicly (by design).

To test from your local machine:

1. **Option A: SSH Tunnel (Recommended for development)**
   ```bash
   # Create SSH tunnel
   ssh -i ~/.ssh/irisx-prod-key.pem -L 3000:localhost:3000 ubuntu@3.83.53.69 -N

   # In another terminal
   curl http://localhost:3000/health | jq .
   ```

2. **Option B: Open port 3000 temporarily (NOT recommended for production)**
   ```bash
   export PATH="/opt/homebrew/bin:$PATH"
   export AWS_PROFILE=irisx-virginia

   # Get your public IP
   MY_IP=$(curl -s https://api.ipify.org)

   # Add rule to security group
   aws ec2 authorize-security-group-ingress \
     --group-id sg-03f77311c140b8f2e \
     --protocol tcp \
     --port 3000 \
     --cidr $MY_IP/32

   # Test
   curl http://3.83.53.69:3000/health | jq .

   # Remove rule after testing
   aws ec2 revoke-security-group-ingress \
     --group-id sg-03f77311c140b8f2e \
     --protocol tcp \
     --port 3000 \
     --cidr $MY_IP/32
   ```

3. **Option C: nginx Reverse Proxy (Production solution - Week 2)**
   - Configure nginx to proxy `https://api.irisx.com` → `localhost:3000`
   - SSL/TLS certificate from Let's Encrypt
   - This is the next step!

---

## Connection Status

| Service | Status | Endpoint | Response Time |
|---------|--------|----------|---------------|
| **API Server** | ✅ Online | Port 3000 | < 5ms |
| **PostgreSQL** | ✅ Connected | RDS | ~170ms |
| **Redis** | ✅ Connected | ElastiCache | < 5ms |
| **PM2** | ✅ Running | Auto-restart enabled | - |

---

## Next Steps (Phase 0, Week 2 Continued)

### 1. Install and Configure nginx
```bash
# SSH to server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Install nginx
sudo apt-get install -y nginx

# Configure reverse proxy
# Create /etc/nginx/sites-available/irisx-api
```

### 2. Set Up SSL/TLS with Let's Encrypt
```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate (requires domain pointing to server)
sudo certbot --nginx -d api.irisx.com
```

### 3. Build First API Endpoint: POST /v1/calls
Create `src/routes/calls.js`:
```javascript
import { Hono } from 'hono';
import { query } from '../db/connection.js';
import { z } from 'zod';

const calls = new Hono();

// Create call endpoint
calls.post('/', async (c) => {
  // Input validation with Zod
  // Insert into database
  // Return call SID
});

export default calls;
```

### 4. Implement Authentication Middleware
Create `src/middleware/auth.js`:
```javascript
export const authenticate = async (c, next) => {
  // Check Authorization header
  // Validate API key from api_keys table
  // Set tenant_id in context
  await next();
};
```

### 5. Add More API Endpoints
- `GET /v1/calls/:id` - Get call details
- `POST /v1/sms` - Send SMS
- `GET /v1/phone-numbers` - List phone numbers
- `POST /v1/webhooks` - Register webhook

---

## Performance Notes

- **Hono.js:** 3x faster than Express (per benchmarks)
- **Connection Pool:** 20 PostgreSQL connections (suitable for t3.small)
- **Memory Usage:** ~45-50 MB (PM2 monitoring)
- **CPU Usage:** < 1% idle
- **Response Times:**
  - Root endpoint: ~4ms
  - Health check (with DB query): ~170ms
  - Redis operations: < 5ms

---

## Monitoring and Logs

### Log Files

```bash
# PM2 logs
~/irisx-backend/logs/error.log     # Error logs
~/irisx-backend/logs/out.log       # Standard output
~/irisx-backend/logs/combined.log  # Combined logs

# View logs
tail -f ~/irisx-backend/logs/combined.log
```

### Real-Time Monitoring

```bash
# PM2 monitoring dashboard
npx pm2 monit

# Shows:
# - CPU usage
# - Memory usage
# - Logs (real-time)
# - Restart count
```

### CloudWatch (Future)

Set up CloudWatch agent to send logs to AWS CloudWatch:
- API access logs
- Error logs
- Performance metrics
- Database query logs

---

## Database Schema Available

All 10 core tables are created and ready to use:

1. **tenants** - Organizations (multi-tenancy)
2. **users** - User accounts
3. **api_keys** - API authentication
4. **phone_numbers** - DID inventory
5. **calls** - Call records
6. **call_logs** - CDR events
7. **webhooks** - Webhook endpoints
8. **webhook_deliveries** - Webhook audit log
9. **contacts** - Address book
10. **sessions** - User sessions

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for full schema.

---

## Security Notes

- ✅ Database in private subnet (not publicly accessible)
- ✅ Redis in private subnet
- ✅ SSL/TLS for database connections
- ✅ API key authentication ready (tables created)
- ✅ PM2 running as non-root user
- ⏳ nginx reverse proxy (next step)
- ⏳ HTTPS/SSL certificate (next step)
- ⏳ Rate limiting (to be implemented)
- ⏳ Input validation with Zod (to be implemented)

---

## Troubleshooting

### API Not Responding

```bash
# Check PM2 status
npx pm2 status

# Check logs
npx pm2 logs irisx-api --lines 50

# Restart API
npx pm2 restart irisx-api
```

### Database Connection Issues

```bash
# Test connection manually
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  -c "SELECT version();"

# Check security group allows EC2 → RDS
# (Already configured correctly)
```

### Redis Connection Issues

```bash
# Test Redis connectivity
redis-cli -h irisx-prod-redis.zjxfxn.0001.use1.cache.amazonaws.com ping

# Should return: PONG
```

### Port 3000 Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Restart PM2
npx pm2 restart irisx-api
```

---

## Cost Impact

**API Server is already running** - No additional cost for API software!

The t3.small EC2 instance ($15/mo) now runs:
- ✅ Node.js 22 + npm
- ✅ Hono.js API server
- ✅ PM2 process manager
- ✅ PostgreSQL client
- ✅ Redis client
- ⏳ nginx (next step)
- ⏳ NATS JetStream (Week 2)
- ⏳ Worker processes (Week 2)

---

## Summary

Backend API is **fully operational** with:

- ✅ Hono.js server running on port 3000
- ✅ PostgreSQL connection established (RDS)
- ✅ Redis connection established (ElastiCache)
- ✅ PM2 process manager configured
- ✅ Auto-restart on server reboot
- ✅ Health check endpoint working
- ✅ Graceful shutdown handling
- ✅ Error handling and logging
- ✅ ES modules (modern JavaScript)
- ✅ Environment configuration

**Next:** Install nginx reverse proxy and build first API endpoint!

---

## Quick Reference

**API Server IP:** `3.83.53.69`
**API Port:** `3000` (internal only)
**PM2 App Name:** `irisx-api`
**Working Directory:** `/home/ubuntu/irisx-backend`
**Logs:** `~/irisx-backend/logs/`
**Process Manager:** PM2
**Auto-Start:** Enabled (systemd)

**SSH:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
```

**Check Status:**
```bash
curl http://localhost:3000/health | jq .
npx pm2 status
```

**View Logs:**
```bash
npx pm2 logs irisx-api
```

---

Phase 0, Week 2 - API Development: **50% Complete** ✅

Ready to build API endpoints! 🚀
