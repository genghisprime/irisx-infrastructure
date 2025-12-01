# Admin Settings 404 Fix

## Issue
System Settings page at `/dashboard/settings/system` was getting 404 error:
```
GET https://api.tazzi.com/admin/settings 404 (Not Found)
SystemSettings.vue:369 Failed to fetch settings: AxiosError
```

## Root Cause
Path mismatch between frontend expectations and backend route definition:

### Frontend Expectation:
- Component: `irisx-admin-portal/src/views/admin/settings/SystemSettings.vue`
- API call: `adminAPI.settings.get()`
- Mapped to: `GET /admin/settings` (via api.js line 124)

### Backend Configuration:
- Route file: `api/src/routes/admin-settings.js`
- Mounted in index.js: `app.route('/admin/settings', adminSettings)` (line 402)
- Endpoint defined as: `adminSettings.get('/settings', ...)` (line 246)
- **Resulting path: `/admin/settings/settings`** (double path!)

## The Fix

### File: `api/src/routes/admin-settings.js`
Changed line 246 from:
```javascript
adminSettings.get('/settings', async (c) => {
```

To:
```javascript
adminSettings.get('/', async (c) => {
```

This makes the full path `/admin/settings` instead of `/admin/settings/settings`.

## Deployment

1. **Deployed fixed file:**
   ```bash
   scp api/src/routes/admin-settings.js ubuntu@3.83.53.69:~/irisx-backend/src/routes/
   ```

2. **Restarted API:**
   ```bash
   pkill -f 'node src/index.js'
   cd ~/irisx-backend && nohup node src/index.js > /tmp/api-settings-final-test.log 2>&1 &
   ```

3. **Tested endpoint:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/settings
   ```

   **Result:** HTTP 200 with settings JSON

## Verification

### Working Endpoint:
```bash
GET /admin/settings
Response: 200 OK
{
  "settings": {
    "rate_limits": {
      "calls_per_second": 10,
      "api_requests_per_minute": 100
    },
    "email_queue": {
      "max_retries": 3,
      "retry_delay_seconds": 300
    },
    "webhook_settings": {
      "max_retries": 5,
      "timeout_seconds": 30
    },
    "storage": {
      "recordings_bucket": "irisx-recordings",
      "max_recording_days": 90
    },
    "security": {
      "jwt_expiry_hours": 24,
      "admin_jwt_expiry_hours": 4,
      "max_login_attempts": 5
    }
  }
}
```

### Removed Endpoint:
```bash
GET /admin/settings/settings
Response: 404 Not Found
```

## Related Files

- **Backend Route:** [api/src/routes/admin-settings.js](api/src/routes/admin-settings.js) (line 246)
- **Route Mounting:** [api/src/index.js](api/src/index.js) (line 402)
- **Frontend Component:** [irisx-admin-portal/src/views/admin/settings/SystemSettings.vue](irisx-admin-portal/src/views/admin/settings/SystemSettings.vue)
- **API Client:** [irisx-admin-portal/src/utils/api.js](irisx-admin-portal/src/utils/api.js) (line 124)

## Status
✅ **FIXED** - System Settings page now loads successfully

## Date
December 1, 2025
