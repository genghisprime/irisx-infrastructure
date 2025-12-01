# Provider Names Display Fix

## Issue
Provider names were not showing on the Providers page at `http://localhost:5174/dashboard/providers`

## Root Cause
Field name mismatch between backend API and frontend component:

### Backend Returns (admin-providers.js):
- `provider_name` - The name of the provider (sendgrid, twilio, etc.)
- `provider_type` - The type (email, sms, whatsapp, social)
- `credentials_preview` - Description of credential type
- `tenant_name` - Name of the tenant (if tenant-specific)

### Frontend Was Expecting:
- `provider` (incorrect) ❌
- `type` (incorrect) ❌
- `masked_credentials` (only available in single provider view) ❌

## Changes Made

### File: `irisx-admin-portal/src/views/admin/providers/ProviderCredentials.vue`

1. **Display Fields** (Lines 108-109)
   - Changed `{{ cred.provider }}` → `{{ cred.provider_name }}`
   - Changed `{{ cred.type }}` → `{{ cred.provider_type }}`

2. **Credentials Display** (Lines 119-133)
   - Replaced `masked_credentials` loop with `credentials_preview` display
   - Added tenant information display
   - Shows "Global (All Tenants)" for non-tenant-specific providers

3. **Form Fields** (Lines 283, 292)
   - Changed `v-model="newCredential.type"` → `v-model="newCredential.provider_type"`
   - Changed `v-model="newCredential.provider"` → `v-model="newCredential.provider_name"`

4. **Data Object** (Lines 368-372)
   - Changed `type: 'email'` → `provider_type: 'email'`
   - Changed `provider: 'sendgrid'` → `provider_name: 'sendgrid'`

5. **API Call** (Lines 400-403)
   - Changed `type: newCredential.value.type` → `provider_type: newCredential.value.provider_type`
   - Changed `provider: newCredential.value.provider` → `provider_name: newCredential.value.provider_name`

6. **Delete Confirmation** (Line 433)
   - Changed `${cred.provider}` → `${cred.provider_name}`

## Testing
After these changes, the Providers page should now correctly display:
- Provider names (SendGrid, Mailgun, Twilio, etc.)
- Provider types (email, sms, whatsapp, social)
- Credentials preview text
- Tenant information
- Active/Inactive status

## Related Files
- Backend: `api/src/routes/admin-providers.js`
- Frontend: `irisx-admin-portal/src/views/admin/providers/ProviderCredentials.vue`
- API Client: `irisx-admin-portal/src/utils/api.js`
