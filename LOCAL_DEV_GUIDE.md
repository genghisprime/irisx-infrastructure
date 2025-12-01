# Local Development Setup - Quick Start Guide

## What's Working

✅ **Local API Server** running at `http://localhost:3000`
- Connected to PRODUCTION database (read/write access)
- All dependencies installed
- Admin routes ready for testing

⚠️ **Redis** - Not accessible locally (locked to AWS VPC) - this is OK, database is what matters for admin portal

## How to Start the Local API

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api
node src/index.js
```

The API will start on port 3000. You should see:
```
✅ Environment variables validated (development mode)
🚀 Starting IRISX API server...
📍 Port: 3000
✓ Server running at http://localhost:3000
```

**Note**: Redis will timeout (expected) - database connection is what matters.

## How to Test Admin Endpoints Locally

### 1. Get a Fresh Admin Token

First, log into the admin portal at https://admin.tazzi.com and get your JWT token from browser DevTools:
1. Open DevTools (F12)
2. Go to Application tab → Local Storage
3. Find the auth token
4. Copy it

### 2. Test the Billing Endpoint

```bash
# Replace YOUR_TOKEN with the token from step 1
curl -s http://localhost:3000/admin/billing/invoices \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq
```

If successful, you'll see invoice data. If you get errors, you'll see the actual error message in:
- The terminal where `node src/index.js` is running
- The response from curl

## Making Changes & Testing

1. **Edit the file**: Open [api/src/routes/admin-billing.js](api/src/routes/admin-billing.js)
2. **Stop the API**: Press `Ctrl+C` in the terminal where it's running
3. **Restart the API**: Run `node src/index.js` again
4. **Test**: Use curl or the admin portal to test your changes

## Common Endpoints to Test

```bash
# Replace YOUR_TOKEN with your actual token

# List invoices
curl -s "http://localhost:3000/admin/billing/invoices?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq

# Get revenue data
curl -s "http://localhost:3000/admin/billing/revenue" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq

# List tenants
curl -s "http://localhost:3000/admin/tenants?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq

# Health check (no auth needed)
curl -s "http://localhost:3000/health" | jq
```

## Viewing Real-Time Logs

When the API is running, you'll see all requests and errors in real-time in your terminal. This makes debugging much easier than production!

Example output:
```
<-- GET /admin/billing/invoices
PostgreSQL pool error: column "deleted_at" does not exist
--> GET /admin/billing/invoices 500 234ms
```

## Files You Can Edit

All these files are ready for local editing:
- [api/src/routes/admin-billing.js](api/src/routes/admin-billing.js) - Billing & invoices
- [api/src/routes/admin-tenants.js](api/src/routes/admin-tenants.js) - Tenant management
- [api/src/routes/admin-conversations.js](api/src/routes/admin-conversations.js) - Conversations
- [api/src/routes/admin-analytics.js](api/src/routes/admin-analytics.js) - Analytics
- [api/src/routes/admin-audit.js](api/src/routes/admin-audit.js) - Audit logs
- [api/src/routes/admin-system.js](api/src/routes/admin-system.js) - System health

## Deploying Changes to Production

Once you've tested and fixed issues locally:

```bash
# Deploy the admin-billing.js file (example)
./deploy-api.sh api/src/routes/admin-billing.js

# Or deploy all admin route files
./deploy-all-admin-fixes.sh
```

## Troubleshooting

### API won't start
- Check if port 3000 is already in use: `lsof -ti:3000`
- Kill existing process: `kill $(lsof -ti:3000)`
- Check for typos in [api/.env](api/.env)

### Can't connect to database
- Verify your IP is whitelisted in AWS RDS security group
- Check DATABASE_URL in [api/.env](api/.env)

### Getting 401 Unauthorized
- Your JWT token expired (they expire after 4 hours)
- Log out and back into admin portal to get a fresh token

## Next Steps

1. Start the local API: `cd api && node src/index.js`
2. Get your admin token from https://admin.tazzi.com
3. Test the endpoints that were failing
4. Fix any bugs you find
5. Restart API and test again
6. Deploy to production when working

---

**You are now set up for local development! No more blind debugging in production.**
