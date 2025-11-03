# Feature 3: Usage & Billing Dashboard

**Priority:** ⭐⭐ HIGH
**Time:** 6-8 hours
**Goal:** Customers can track usage, costs, and manage billing

## What to Build

1. **Backend API (3 endpoints)**
   - GET /v1/usage/current-period
   - GET /v1/usage/history?start_date&end_date
   - GET /v1/billing/invoice/:id

2. **Frontend Dashboard**
   - Current period usage cards (calls, SMS, emails, minutes)
   - Cost breakdown by channel
   - Usage charts (7/30/90 days)
   - Billing history table
   - Invoice download

3. **Database Migration**
   - usage_tracking table (channel, quantity, cost, timestamp)
   - invoices table (amount, period, status, pdf_url)

## Deliverables
- [ ] Migration 015
- [ ] usage-tracking.js service
- [ ] usage.js routes
- [ ] UsageDashboard.vue
- [ ] BillingHistory.vue

**Time: 6-8 hours**
