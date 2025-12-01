# Feature Flags System Implementation

## Overview
Comprehensive feature flags management system for IRISX admin portal, enabling gradual feature rollouts, A/B testing, and tenant-specific feature control.

## Implementation Status
✅ **COMPLETE** - All components implemented and ready for testing

---

## Components Created

### 1. Database Migration
**File:** `database/migrations/026_create_feature_flags.sql`

**Tables Created:**
- `feature_flags` - Main feature flags table
  - `id` (SERIAL PRIMARY KEY)
  - `key` (VARCHAR unique) - Feature identifier (e.g., `ai_powered_routing`)
  - `name` (VARCHAR) - Human-readable name
  - `description` (TEXT) - Feature description
  - `enabled` (BOOLEAN) - Global enable/disable
  - `rollout_percentage` (INTEGER 0-100) - Percentage-based rollout
  - `rollout_tenants` (JSONB) - Specific tenant IDs for targeted rollout
  - `created_by`, `created_at`, `updated_at`

- `tenant_feature_overrides` - Per-tenant overrides
  - `id` (SERIAL PRIMARY KEY)
  - `tenant_id` (FK to tenants)
  - `feature_key` (FK to feature_flags)
  - `enabled` (BOOLEAN)
  - Unique constraint on (tenant_id, feature_key)

**Default Flags Seeded:**
1. `ai_powered_routing` - AI-Powered Channel Routing
2. `new_campaign_builder` - New Campaign Builder UI (10% rollout)
3. `advanced_analytics` - Advanced Analytics Dashboard
4. `multi_agent_support` - Multi-Agent Support (100% enabled)
5. `voice_transcription` - Voice Call Transcription (25% rollout)
6. `sentiment_analysis` - Sentiment Analysis
7. `custom_integrations` - Custom Integrations
8. `priority_support` - Priority Support

### 2. Backend API Routes
**File:** `api/src/routes/admin-feature-flags.js`

**Endpoints:**
- `GET /admin/feature-flags` - List all feature flags
- `GET /admin/feature-flags/:key` - Get flag details with overrides
- `POST /admin/feature-flags` - Create new flag (superadmin only)
- `PATCH /admin/feature-flags/:key` - Update flag configuration
- `DELETE /admin/feature-flags/:key` - Delete flag (superadmin only)
- `GET /admin/feature-flags/:key/tenants` - List all tenants with flag status
- `POST /admin/feature-flags/:key/tenants/:tenantId/override` - Set tenant override
- `DELETE /admin/feature-flags/:key/tenants/:tenantId/override` - Remove tenant override
- `GET /admin/feature-flags/:key/check/:tenantId` - Check if enabled for tenant

**Features:**
- Hash-based percentage rollout (deterministic)
- Tenant-specific overrides (highest priority)
- Rollout list targeting (beta testers)
- Full audit logging for all actions
- Role-based permissions (admin/superadmin)

**Route Mounted:** Line 415 in `api/src/index.js`

### 3. Frontend Component
**File:** `irisx-admin-portal/src/views/admin/settings/FeatureFlags.vue`

**Features:**
- List all feature flags with status badges
- Visual rollout percentage indicators
- Create/Edit flag modal with full configuration
- View details modal showing:
  - Rollout configuration
  - Tenant overrides list
  - Current status
- Toggle enable/disable
- Delete functionality (superadmin)
- Real-time updates

**UI Components:**
- Rollout percentage progress bars
- Status badges (Enabled/Disabled)
- Override count display
- Modal forms for CRUD operations

### 4. API Client Integration
**File:** `irisx-admin-portal/src/utils/api.js`

**Methods Added:**
```javascript
adminAPI.featureFlags = {
  list: () => GET /admin/feature-flags
  get: (key) => GET /admin/feature-flags/:key
  create: (data) => POST /admin/feature-flags
  update: (key, data) => PATCH /admin/feature-flags/:key
  delete: (key) => DELETE /admin/feature-flags/:key
  getTenants: (key, params) => GET /admin/feature-flags/:key/tenants
  setOverride: (key, tenantId, enabled) => POST override
  removeOverride: (key, tenantId) => DELETE override
  check: (key, tenantId) => GET check status
}
```

---

## Feature Rollout Strategies

### 1. Global Enable/Disable
Simplest method - turn feature on/off for everyone
```
enabled: true, rollout_percentage: 100
```

### 2. Percentage-Based Rollout
Gradual rollout to X% of tenants (hash-based, deterministic)
```
enabled: true, rollout_percentage: 25 (25% of tenants)
```

### 3. Targeted Beta Testing
Enable for specific tenant IDs only
```
enabled: true, rollout_tenants: [1, 2, 3]
```

### 4. Tenant Overrides
Override global settings for specific tenants (highest priority)
```
Tenant 7: Override enabled: true (even if global disabled)
Tenant 12: Override enabled: false (even if global enabled)
```

### Priority Order:
1. **Tenant Override** (if exists)
2. **Rollout List** (if tenant in list)
3. **Percentage Rollout** (if enabled and within percentage)
4. **Global Enabled** (default)

---

## Usage Examples

### Creating a New Feature Flag

```javascript
adminAPI.featureFlags.create({
  key: 'video_calling',
  name: 'Video Calling Support',
  description: 'Enable video calls in conversations',
  enabled: false,
  rollout_percentage: 0,
  rollout_tenants: []
})
```

### Gradual Rollout (10% → 25% → 50% → 100%)

```javascript
// Start with 10%
adminAPI.featureFlags.update('video_calling', {
  enabled: true,
  rollout_percentage: 10
})

// Monitor, then increase to 25%
adminAPI.featureFlags.update('video_calling', {
  rollout_percentage: 25
})

// Continue until 100%
```

### Beta Testing with Specific Tenants

```javascript
adminAPI.featureFlags.update('video_calling', {
  enabled: true,
  rollout_tenants: [5, 12, 23] // Beta tester tenant IDs
})
```

### Setting Tenant-Specific Override

```javascript
// Enable for premium tenant even if globally disabled
adminAPI.featureFlags.setOverride('video_calling', 42, true)

// Disable for problematic tenant even if globally enabled
adminAPI.featureFlags.setOverride('video_calling', 17, false)
```

### Checking Feature Status

```javascript
const { enabled } = await adminAPI.featureFlags.check('video_calling', 42)
if (enabled) {
  // Show video calling UI
}
```

---

## Testing Checklist

### Backend Testing
- [ ] Run database migration 026
- [ ] Create a new feature flag via API
- [ ] Update flag configuration
- [ ] Set tenant override
- [ ] Check flag status for different tenants
- [ ] Verify hash-based rollout is deterministic
- [ ] Delete a feature flag
- [ ] Verify audit logs are created

### Frontend Testing
- [ ] Navigate to `/dashboard/settings/features`
- [ ] View list of feature flags
- [ ] Create a new flag (as superadmin)
- [ ] Edit an existing flag
- [ ] Toggle enable/disable
- [ ] View flag details modal
- [ ] Check tenant overrides display
- [ ] Delete a flag (as superadmin)

### Integration Testing
- [ ] Percentage rollout consistency (same tenant always gets same result)
- [ ] Tenant override takes precedence over global setting
- [ ] Rollout list targeting works correctly
- [ ] Permission checks (admin vs superadmin)

---

## Access Control

### SuperAdmin
- ✅ Create new feature flags
- ✅ Delete feature flags
- ✅ Update any flag configuration
- ✅ Set/remove tenant overrides
- ✅ View all flags and details

### Admin
- ❌ Cannot create flags
- ❌ Cannot delete flags
- ✅ Update existing flag configuration
- ✅ Set/remove tenant overrides
- ✅ View all flags and details

---

## Database Queries

### Get all enabled features for a tenant
```sql
SELECT ff.*
FROM feature_flags ff
LEFT JOIN tenant_feature_overrides tfo
  ON ff.key = tfo.feature_key AND tfo.tenant_id = $1
WHERE
  -- Override takes precedence
  CASE
    WHEN tfo.enabled IS NOT NULL THEN tfo.enabled
    WHEN ff.rollout_tenants @> $1::text THEN TRUE
    WHEN ff.enabled AND ff.rollout_percentage >= (hashtext($1::text) % 100) THEN TRUE
    ELSE FALSE
  END = TRUE
```

### Get tenant override count per flag
```sql
SELECT
  ff.key,
  ff.name,
  COUNT(tfo.id) as override_count
FROM feature_flags ff
LEFT JOIN tenant_feature_overrides tfo ON ff.key = tfo.feature_key
GROUP BY ff.id, ff.key, ff.name
```

---

## Audit Logging

All feature flag actions are logged to `admin_audit_log`:

- `admin.feature_flags.list` - Listed all flags
- `admin.feature_flag.view` - Viewed specific flag
- `admin.feature_flag.create` - Created new flag
- `admin.feature_flag.update` - Updated flag config
- `admin.feature_flag.delete` - Deleted flag
- `admin.feature_flag.override_set` - Set tenant override
- `admin.feature_flag.override_remove` - Removed tenant override

---

## API Endpoints Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/feature-flags` | Admin | List all flags |
| GET | `/admin/feature-flags/:key` | Admin | Get flag details |
| POST | `/admin/feature-flags` | SuperAdmin | Create flag |
| PATCH | `/admin/feature-flags/:key` | Admin | Update flag |
| DELETE | `/admin/feature-flags/:key` | SuperAdmin | Delete flag |
| GET | `/admin/feature-flags/:key/tenants` | Admin | List tenant statuses |
| POST | `/admin/feature-flags/:key/tenants/:id/override` | Admin | Set override |
| DELETE | `/admin/feature-flags/:key/tenants/:id/override` | Admin | Remove override |
| GET | `/admin/feature-flags/:key/check/:id` | Admin | Check if enabled |

---

## Next Steps

1. **Run Migration:**
   ```bash
   psql $DATABASE_URL < database/migrations/026_create_feature_flags.sql
   ```

2. **Restart API Server:**
   ```bash
   cd api
   npm start
   ```

3. **Access Feature Flags Page:**
   - Navigate to: `http://localhost:5173/dashboard/settings/features`
   - Login as admin
   - Test all CRUD operations

4. **Integration with Application Code:**
   ```javascript
   // In tenant application code
   if (await featureFlags.isEnabled('ai_powered_routing', tenantId)) {
     // Use AI routing
   } else {
     // Use legacy routing
   }
   ```

---

## Files Modified/Created

### Created:
1. `database/migrations/026_create_feature_flags.sql`
2. `api/src/routes/admin-feature-flags.js`
3. `FEATURE_FLAGS_IMPLEMENTATION.md` (this file)

### Modified:
1. `api/src/index.js` - Added feature flags route mounting
2. `irisx-admin-portal/src/views/admin/settings/FeatureFlags.vue` - Full implementation
3. `irisx-admin-portal/src/utils/api.js` - Added API client methods

---

## Notes

- Feature flags use **deterministic hash-based rollout** - the same tenant will always get the same result for a given percentage
- Tenant overrides have **highest priority** and can force-enable or force-disable features
- All admin actions are **fully audited** for compliance
- The system supports **multiple rollout strategies** simultaneously
- Perfect for **gradual rollouts**, **A/B testing**, and **beta programs**

---

## Support

For issues or questions:
- Check API logs: `/tmp/api.log`
- Check browser console for frontend errors
- Verify database migration ran successfully
- Ensure admin user has correct permissions
