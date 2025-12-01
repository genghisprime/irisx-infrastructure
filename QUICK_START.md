# IRISX Local Development - Quick Start

## Your Local Environment is READY!

### What's Running

- **API Server**: http://localhost:3000 (connected to production database)
- **Admin Portal**: http://localhost:5173 (configured to use local API)

Both servers are running in the background right now!

### How to Use

#### Option 1: Simple Start Script (Recommended)
```bash
./start-local-dev.sh   # Start both API and admin portal
./stop-local-dev.sh    # Stop both servers
```

#### Option 2: Manual Start
```bash
# Start API
cd api && node src/index.js

# Start Admin Portal (in another terminal)
cd irisx-admin-portal && npm run dev
```

### View Logs

```bash
# API logs
tail -f /tmp/irisx-api-dev.log

# Admin Portal logs
tail -f /tmp/irisx-admin-dev.log
```

### Testing the Admin Portal Locally

1. **Open the admin portal**: http://localhost:5173
2. **Log in** with your admin credentials
3. **Test features** - all API calls now go to your local API
4. **See errors in real-time** in `/tmp/irisx-api-dev.log`

### Making Changes

1. Edit any file in [api/src/routes/](api/src/routes/)
2. Restart the API: `killall node && cd api && node src/index.js`
3. Test in the admin portal
4. Fix bugs, test again
5. Deploy when working: `./deploy-api.sh api/src/routes/your-file.js`

### Key Features

- **Real production data** - your local API connects to production database
- **No Redis needed** - Redis timeout is expected and OK
- **Hot reload** - Admin portal auto-reloads on file changes
- **API needs restart** - API changes require manual restart
- **Real-time debugging** - See all errors and queries in the logs

### Next Steps

Test the `/admin/billing/invoices` endpoint that was failing:

1. Open http://localhost:5173 in your browser
2. Navigate to Billing → Invoices
3. Watch `/tmp/irisx-api-dev.log` for errors
4. Fix any bugs in [api/src/routes/admin-billing.js](api/src/routes/admin-billing.js)
5. Restart API and test again

### Troubleshooting

**Port already in use:**
```bash
killall node
./start-local-dev.sh
```

**Can't connect to database:**
- Check your IP is whitelisted in AWS RDS security group
- Verify DATABASE_URL in [api/.env](api/.env)

**Admin portal shows errors:**
- Check that VITE_API_BASE_URL=http://localhost:3000 in [irisx-admin-portal/.env](irisx-admin-portal/.env)

---

**You now have a complete local development workflow!**

No more blind debugging in production. Test everything locally first, then deploy with confidence.
