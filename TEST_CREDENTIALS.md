# Test Credentials for IRISX/Tazzi Platform

**Last Updated:** November 4, 2025
**Password for Customer Portal accounts:** `test123`
**Password for Admin Portal account:** `Admin1234` (requires 8+ characters)

---

## 🔐 Portal Login Credentials

### Customer Portal (https://customer.tazzi.com)

**Test User 1 - Demo Account:**
- **Email:** `demo@demo.com`
- **Password:** `test123`
- **Role:** Admin
- **Tenant ID:** 5
- **Use Case:** General testing of customer portal features

**Test User 2 - Voice Testing Account:**
- **Email:** `voicetest@irisx.com`
- **Password:** `test123`
- **Role:** Admin
- **Tenant ID:** 7
- **Use Case:** Voice call testing and API testing

---

### Admin Portal (https://admin.tazzi.com)

**Platform Superadmin:**
- **Email:** `admin@irisx.internal`
- **Password:** `Admin1234` (Admin portal requires 8+ character passwords)
- **Role:** Superadmin
- **Tenant ID:** 1 (Platform tenant)
- **Use Case:** Platform administration, tenant management, system settings

---

### Agent Desktop (https://agent.tazzi.com)

**Agent Login:**
- **Email:** `demo@irisx.com`
- **Password:** `demo123` (Demo mode - works without backend)

---

## 🧪 Testing Scenarios

### 1. Test Data Import (Task 9)
**Portal:** Customer Portal or Admin Portal
**Login:** Any of the above accounts
**Steps:**
1. Navigate to "Data Import" in the menu
2. Try uploading a CSV file
3. Test Google Sheets import
4. Test bulk JSON import

### 2. Test Voice Calling
**Portal:** Customer Portal
**Login:** `voicetest@irisx.com` / `test123`
**Steps:**
1. Navigate to "Make Call"
2. Use dry run mode: `{"dry_run": true}`
3. Make test call to `+17137057323`

### 3. Test Admin Features
**Portal:** Admin Portal
**Login:** `admin@irisx.internal` / `Admin1234`
**Steps:**
1. View tenant list
2. Check system health
3. View audit logs
4. Manage feature flags

---

## 🔑 API Testing

### Get Authentication Token

**For Customer Portal Users (demo@demo.com or voicetest@irisx.com):**
```bash
curl -X POST https://api.tazzi.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@demo.com",
    "password": "test123"
  }'
```

**For Admin Portal (admin@irisx.internal):**
```bash
curl -X POST https://api.tazzi.com/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@irisx.internal",
    "password": "Admin1234"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "demo@demo.com",
    "role": "admin"
  }
}
```

### Use Token for API Calls

```bash
TOKEN="your_token_here"

# Test Data Import
curl -X POST https://api.tazzi.com/v1/imports/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "contacts": [
      {"first_name": "John", "email": "john@test.com", "phone": "+1234567890"}
    ]
  }'

# Test Voice Call (Dry Run)
curl -X POST https://api.tazzi.com/v1/calls \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "to": "+17137057323",
    "from": "+15551234567",
    "dry_run": true
  }'
```

---

## 🗄️ Database Access

**Connection String:**
```
postgresql://irisx_admin:5cdce73ae642767beb8bac7085ad2bf2@irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432/irisx_prod
```

**SSH Tunnel from Local Machine:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem -L 5432:irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432 ubuntu@3.83.53.69
```

Then connect locally:
```bash
psql -h localhost -U irisx_admin -d irisx_prod
# Password: 5cdce73ae642767beb8bac7085ad2bf2
```

---

## 🔄 Resetting Passwords

If you need to change any password, use this SQL:

```bash
# Generate new bcrypt hash for "newpassword123"
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "cd /home/ubuntu/irisx-backend && node -e \"const bcrypt = require('bcrypt'); bcrypt.hash('newpassword123', 10).then(hash => console.log(hash));\""

# Update user password
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD='5cdce73ae642767beb8bac7085ad2bf2' psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com -U irisx_admin -d irisx_prod -c \"UPDATE users SET password_hash = 'PASTE_HASH_HERE' WHERE email = 'user@example.com';\""
```

---

## 📝 Notes

1. **Customer Portal password:** `test123`
2. **Admin Portal password:** `Admin1234` (requires min 8 characters)
3. **Agent Desktop password:** `demo123` (demo mode)
3. **Auth Endpoints:**
   - Customer: `https://api.tazzi.com/v1/auth/login` (note the `/v1/` prefix!)
   - Admin: `https://api.tazzi.com/admin/auth/login`
4. **This is for TESTING ONLY** - Change passwords before public launch
5. **API URL:** `https://api.tazzi.com` (HTTPS enabled!)
6. **WebSocket URL:** `wss://api.tazzi.com/ws/imports` (Secure WebSocket)

---

## ⚠️ Security Reminder

**IMPORTANT:** These are test credentials for development/testing only. Before production launch:
1. Change all passwords to strong, unique values
2. Enable 2FA for admin accounts
3. Rotate API keys
4. Update database password
5. Enable HTTPS (SSL certificates)
6. Use environment variables for sensitive data

---

## 🎉 Ready to Test!

You now have full access to all three portals and the API. Start testing the Data Import System (Task 9) features!

**Questions?** Check [TASK_9_COMPLETE.md](TASK_9_COMPLETE.md) for full documentation.
