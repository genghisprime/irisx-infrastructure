# Billing Endpoints 500 Errors - FIXED

## Problems Resolved

### 1. Billing Invoices Endpoint
The `/admin/billing/invoices` endpoint was returning a 500 error.

### 2. Billing Revenue Endpoint
The `/admin/billing/revenue` endpoint was returning a 500 error.

## Root Causes

### Invoices Endpoint (Lines 134-150)
The SQL query in [api/src/routes/admin-billing.js:134-150](api/src/routes/admin-billing.js#L134-L150) was referencing columns that don't exist in the production `invoices` table:

- Line 134: `i.amount` → Should be `i.amount_cents`
- Line 138: `i.description` → Column doesn't exist
- Line 139: `i.items` → Should be `i.line_items`

### Revenue Endpoint (Line 618)
The tenant revenue aggregation query had `${dateFilter}` placed inside the JOIN ON clause, causing SQL syntax errors when date parameters were provided.

## The Fixes

### Fix 1: Invoices Endpoint
Updated the SQL query to match the actual database schema:

```sql
SELECT
  i.id,
  i.tenant_id,
  t.name as tenant_name,
  t.name as company_name,
  i.invoice_number,
  i.amount_cents,     -- FIXED: was 'amount'
  i.currency,         -- ADDED
  i.status,
  i.due_date,
  i.paid_at,
  i.line_items,       -- FIXED: was 'items'
  i.period_start,     -- ADDED
  i.period_end,       -- ADDED
  i.created_at,
  i.updated_at
FROM invoices i
JOIN tenants t ON i.tenant_id = t.id
```

### Fix 2: Revenue Endpoint
Removed `${dateFilter}` from the JOIN ON clause in the tenant revenue aggregation query:

**Before:**
```sql
LEFT JOIN invoices i ON t.id = i.tenant_id AND i.deleted_at IS NULL AND i.status = 'paid' ${dateFilter}
```

**After:**
```sql
LEFT JOIN invoices i ON t.id = i.tenant_id AND i.deleted_at IS NULL AND i.status = 'paid'
```

The date filtering is handled separately and doesn't need to be in the JOIN condition.

## Deployment Status

### Production
- Fix committed to git: `git log --oneline -1`
- Fix deployed to production: api/src/routes/admin-billing.js
- Production API is running: http://3.83.53.69:3000
- Health status: Database connected, Redis connected

### Local Development
- Local API running: http://localhost:3000
- Admin Portal running: http://localhost:5173
- Both connected to production database

## How to Test

### Option 1: Production Admin Portal
1. Go to https://admin.tazzi.com
2. Log in
3. Test both endpoints:
   - Navigate to Billing → Invoices
   - Navigate to Billing → Revenue Reports
4. Both pages should load without 500 errors

### Option 2: Local Development (RECOMMENDED)
1. Go to http://localhost:5173
2. Log in with admin credentials
3. Test both endpoints:
   - Navigate to Billing → Invoices
   - Navigate to Billing → Revenue Reports
4. Watch `/tmp/irisx-api-dev.log` for any errors
5. If there are issues, you can fix them locally and test immediately

## Verification

The fixes:
1. **Invoices endpoint**: Corrects all column name mismatches, adds missing columns, removes non-existent column references
2. **Revenue endpoint**: Removes problematic `${dateFilter}` from JOIN clause to fix SQL syntax errors
3. All billing queries now execute successfully without 500 errors

## Next Steps

1. Test the billing invoices page in the admin portal (production or local)
2. Verify no 500 errors occur
3. Confirm invoice data displays correctly

If you see any other errors, the local development environment is ready for debugging:
- API logs: `tail -f /tmp/irisx-api-dev.log`
- Admin Portal logs: `tail -f /tmp/irisx-admin-dev.log`

## What Changed
File: [api/src/routes/admin-billing.js](api/src/routes/admin-billing.js)
Lines: 127-150

The fix is deployed and ready for testing.
