# Admin Portal Phase 2 - Frontend Development TODO

## Overview
Building the Admin Portal frontend to integrate with 46 backend endpoints created in Phase 1.

**Tech Stack:** Vue 3 + TypeScript + Vite + Tailwind CSS + Vue Router + Pinia

## Phase 2 Progress Tracker

### 1. Project Setup ✅
- [x] Create Vue 3 + Vite project structure
- [x] Copy from customer portal template (reuse working setup)
- [x] Update package.json name/description
- [ ] Clean out customer portal views
- [ ] Create admin portal directory structure
- [ ] Configure .env for admin API endpoints

### 2. Core Infrastructure (Week 1 - Day 1-2)
- [ ] **Auth Store** (Pinia)
  - Admin login/logout
  - JWT token management (4-hour expiry)
  - Role-based permissions (superadmin, admin, support, readonly)
  - Auto-redirect on token expiry

- [ ] **API Client** (axios)
  - Base URL configuration
  - Request interceptor (add auth token)
  - Response interceptor (handle 401/403)
  - Error handling

- [ ] **Router Configuration**
  - Admin routes with auth guards
  - Role-based route access
  - Redirect unauthenticated users to login

- [ ] **Layout Components**
  - AdminLayout (sidebar + header)
  - Sidebar navigation with role-based menu items
  - Header with user info + logout

### 3. Authentication Pages (Week 1 - Day 2-3)
- [ ] **AdminLogin.vue**
  - Email + password form
  - Remember me checkbox
  - Error handling
  - Redirect to dashboard on success
  - Different branding from customer portal (IRISX staff only)

### 4. Dashboard Pages (Week 1 - Day 3-5)
- [ ] **DashboardOverview.vue**
  - Platform-wide statistics
  - Total tenants, active users, revenue
  - Recent activity feed
  - System health status
  - Charts (revenue, growth, usage)

- [ ] **SystemHealth.vue**
  - Database status
  - Redis status
  - FreeSWITCH status
  - API performance metrics
  - Error rates

- [ ] **AuditLog.vue**
  - Searchable audit log
  - Filter by admin, action, resource type
  - Date range picker
  - Export to CSV

### 5. Tenant Management Pages (Week 2 - Day 1-3)
- [ ] **TenantList.vue**
  - Paginated tenant list
  - Search by name/email/domain
  - Filter by plan (free, starter, professional, enterprise)
  - Filter by status (trial, active, suspended, cancelled)
  - Sort by created_at, MRR, user count
  - Quick actions (view, suspend, delete)

- [ ] **TenantDetails.vue**
  - Tenant overview (plan, status, MRR, trial end date)
  - Statistics (users, calls, messages, storage)
  - Billing history
  - Feature flags
  - Usage limits
  - Recent activity
  - Action buttons (change plan, extend trial, suspend, delete)

- [ ] **TenantCreate.vue**
  - Create new tenant form
  - Company name, domain, plan selection
  - Initial user (email, name, password)
  - Trial period configuration

- [ ] **TenantUsers.vue**
  - List users for selected tenant
  - Create new users
  - Reset passwords
  - Suspend/reactivate users
  - Soft delete users (superadmin only)

### 6. Billing Management Pages (Week 2 - Day 3-5)
- [ ] **InvoiceList.vue**
  - Paginated invoice list
  - Filter by tenant, status (draft, sent, paid, overdue, cancelled)
  - Search by invoice number
  - Date range picker
  - Quick view invoice details

- [ ] **InvoiceCreate.vue**
  - Create manual invoice
  - Select tenant
  - Add line items (description, quantity, unit price)
  - Calculate total
  - Set due date
  - Send invoice button

- [ ] **RevenueReports.vue**
  - MRR chart (monthly recurring revenue)
  - Revenue by plan breakdown
  - Growth rate
  - Churn rate
  - Forecasting
  - Export reports

- [ ] **SubscriptionManagement.vue**
  - Change tenant subscription plans
  - Update MRR manually
  - Extend trial periods
  - Issue refunds (superadmin only)

### 7. Communications Management Pages (Week 3 - Day 1-3)
- [ ] **ConversationOversight.vue**
  - Cross-tenant conversation search
  - Filter by channel (voice, sms, email, whatsapp, social)
  - Filter by status (open, pending, closed)
  - View conversation + messages
  - Reassign to agent
  - Bulk close conversations

- [ ] **SLABreaches.vue**
  - List SLA breaches
  - Filter by tenant, severity
  - Sort by breach time
  - View conversation details

- [ ] **RecordingManagement.vue**
  - List all call recordings
  - Filter by tenant, date range
  - Play recordings (S3 presigned URL)
  - Download recordings
  - Delete recordings (superadmin only)
  - Storage statistics

- [ ] **PhoneNumberProvisioning.vue**
  - List all phone numbers
  - Filter by provider (Twilio, Telnyx)
  - Filter by type (local, tollfree, mobile)
  - Provision new numbers for tenants
  - Update number configuration
  - Deactivate numbers (superadmin only)
  - Cost tracking by provider

### 8. Agent Management Pages (Week 3 - Day 3-4)
- [ ] **AgentList.vue**
  - List all agents across all tenants
  - Filter by tenant, status (active, away, offline)
  - Search by name/email
  - View agent performance stats
  - Quick actions (view details, suspend)

- [ ] **AgentBulkImport.vue**
  - CSV import for agent creation
  - Template download
  - Validation + preview
  - Bulk create with default passwords

### 9. Provider Management Page (Week 3 - Day 4-5)
- [ ] **ProviderCredentials.vue**
  - List all provider credentials
  - Filter by type (email, sms, whatsapp, social)
  - Filter by provider (SendGrid, Mailgun, Twilio, Telnyx, etc.)
  - Add new credentials (encrypted AES-256-CBC)
  - Update credentials
  - Test provider connection
  - View masked credentials (last 4 chars only)
  - Delete credentials (superadmin only)

### 10. Settings Pages (Week 3 - Day 5)
- [ ] **SystemSettings.vue**
  - Rate limit configuration
  - Queue configuration
  - Security settings
  - SMTP settings
  - S3 settings
  - All editable by superadmin only

- [ ] **FeatureFlags.vue**
  - System-wide feature flags
  - Per-tenant feature flags
  - Enable/disable features by plan
  - Custom features per tenant

- [ ] **UsageLimits.vue**
  - View default limits by plan
  - Set custom limits per tenant
  - Monitor usage vs limits

### 11. Shared Components (Ongoing)
- [ ] **StatCard.vue** - Dashboard stat cards
- [ ] **DataTable.vue** - Reusable paginated table
- [ ] **ConfirmDialog.vue** - Confirmation modals
- [ ] **LoadingSpinner.vue** - Loading states
- [ ] **EmptyState.vue** - No data states
- [ ] **Badge.vue** - Status badges
- [ ] **DateRangePicker.vue** - Date range selection
- [ ] **SearchInput.vue** - Search with debounce
- [ ] **SelectDropdown.vue** - Custom select
- [ ] **Modal.vue** - Generic modal wrapper

### 12. Testing & Polish (Week 4)
- [ ] Test all pages with real backend
- [ ] Error handling on all API calls
- [ ] Loading states on all async operations
- [ ] Success/error toast notifications
- [ ] Responsive design (mobile-friendly)
- [ ] Dark mode support
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Performance optimization
- [ ] SEO meta tags

### 13. Deployment
- [ ] Build production bundle
- [ ] Deploy to production server
- [ ] Configure nginx reverse proxy
- [ ] SSL certificate
- [ ] Test production deployment

## API Endpoints Reference

### Auth (admin-auth.js)
- POST /admin/auth/login
- POST /admin/auth/logout
- GET /admin/auth/me
- POST /admin/auth/refresh

### Dashboard (admin-dashboard.js)
- GET /admin/dashboard/stats
- GET /admin/dashboard/activity
- GET /admin/dashboard/health

### Tenants (admin-tenants.js)
- GET /admin/tenants
- GET /admin/tenants/:id
- POST /admin/tenants
- PATCH /admin/tenants/:id
- DELETE /admin/tenants/:id
- POST /admin/tenants/:id/suspend
- POST /admin/tenants/:id/reactivate

### Users (admin-users.js)
- GET /admin/tenants/:tenantId/users
- POST /admin/tenants/:tenantId/users
- PATCH /admin/tenants/:tenantId/users/:userId
- POST /admin/tenants/:tenantId/users/:userId/reset-password
- POST /admin/tenants/:tenantId/users/:userId/suspend
- POST /admin/tenants/:tenantId/users/:userId/reactivate
- DELETE /admin/tenants/:tenantId/users/:userId

### Billing (admin-billing.js)
- GET /admin/billing/invoices
- POST /admin/billing/invoices
- PATCH /admin/tenants/:tenantId/subscription
- POST /admin/tenants/:tenantId/extend-trial
- POST /admin/billing/refunds
- GET /admin/billing/revenue
- GET /admin/tenants/:tenantId/subscription

### Providers (admin-providers.js)
- GET /admin/providers
- POST /admin/providers
- PATCH /admin/providers/:id
- DELETE /admin/providers/:id
- POST /admin/providers/:id/test
- GET /admin/tenants/:tenantId/providers

### Recordings (admin-recordings.js)
- GET /admin/recordings
- GET /admin/calls/:callId/recordings
- GET /admin/recordings/:id/presigned-url
- DELETE /admin/recordings/:id
- GET /admin/recordings/stats
- GET /admin/tenants/:tenantId/recordings

### Conversations (admin-conversations.js)
- GET /admin/conversations
- GET /admin/conversations/:id
- PATCH /admin/conversations/:id/assign
- POST /admin/conversations/bulk-close
- GET /admin/conversations/sla-breaches
- GET /admin/conversations/stats
- GET /admin/tenants/:tenantId/conversations

### Phone Numbers (admin-phone-numbers.js)
- GET /admin/phone-numbers
- POST /admin/tenants/:tenantId/phone-numbers
- PATCH /admin/phone-numbers/:id
- DELETE /admin/phone-numbers/:id
- GET /admin/phone-numbers/stats
- GET /admin/tenants/:tenantId/phone-numbers

### Settings (admin-settings.js)
- GET /admin/tenants/:tenantId/features
- PATCH /admin/tenants/:tenantId/features
- GET /admin/feature-flags
- GET /admin/settings
- PATCH /admin/settings
- GET /admin/settings/usage-limits
- PATCH /admin/tenants/:tenantId/usage-limits

### Search (admin-search.js)
- GET /admin/search/tenants
- GET /admin/search/users
- GET /admin/search/global

### Agents (admin-agents.js)
- GET /admin/agents
- POST /admin/agents/bulk-import
- GET /admin/tenants/:tenantId/agents

### Audit (admin-audit.js - if exists)
- GET /admin/audit-log

## Estimated Timeline

**Week 1 (40 hours):**
- Day 1-2: Project setup, auth, API client, router (16h)
- Day 3-5: Login + Dashboard pages (24h)

**Week 2 (40 hours):**
- Day 1-3: Tenant Management (24h)
- Day 3-5: Billing Management (16h)

**Week 3 (40 hours):**
- Day 1-3: Communications pages (24h)
- Day 3-4: Agent Management (8h)
- Day 4-5: Provider + Settings (8h)

**Week 4 (20 hours):**
- Testing, polish, deployment (20h)

**Total: 140 hours (3.5 weeks)**

## Next Immediate Steps
1. Clean out customer portal views from copied structure
2. Create admin directory structure in src/views/admin/
3. Build auth store with Pinia
4. Build API client with axios
5. Configure router with admin routes
6. Build AdminLayout component
7. Build AdminLogin page
8. Start on Dashboard pages
