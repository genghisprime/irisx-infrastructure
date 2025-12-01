# Email Systems Implementation TODO

**Goal**: Implement multi-provider email system with least-cost routing (LCR) and automatic failover

**Start Date**: January 2025
**Status**: IN PROGRESS

---

## 📋 Implementation Checklist

### ✅ Phase 1: Email Provider Adapters (COMPLETED)

- [x] **Create Elastic Email Provider Adapter** - `/api/src/services/email-providers/elastic-email.js`
  - [x] Implement `send()` method with Elastic Email API v2
  - [x] Implement `testConnection()` for credential verification
  - [x] Implement `getStats()` for delivery metrics
  - [x] Handle attachments
  - [x] Support multiple recipients (semicolon-separated)

- [x] **Create SendGrid Provider Adapter** - `/api/src/services/email-providers/sendgrid.js`
  - [x] Implement `send()` method with SendGrid API v3
  - [x] Handle 202 response (no body on success)
  - [x] Implement `testConnection()` using /scopes endpoint
  - [x] Implement `getStats()` with date aggregation
  - [x] Handle attachments (Base64 encoding)
  - [x] Support multiple recipients (array format)

- [x] **Create Custom SMTP Provider Adapter** - `/api/src/services/email-providers/custom-smtp.js`
  - [x] Implement using nodemailer
  - [x] Connection pooling (5 connections, 100 messages)
  - [x] Support TLS/SSL configuration
  - [x] Implement `testConnection()` using verify()
  - [x] Handle attachments
  - [x] Prepare for future self-hosted email server

- [x] **Create Provider Factory** - `/api/src/services/email-providers/index.js`
  - [x] Implement `createEmailProvider()` factory function
  - [x] Support aliases (elastic-email, elasticemail, sendgrid, twilio-sendgrid, smtp, custom-smtp)
  - [x] Export all provider classes

---

### ✅ Phase 2: Email Sending Service with LCR (COMPLETED)

- [x] **Create Email Service** - `/api/src/services/email-service.js`
  - [ ] Implement `sendEmail()` function with LCR
  - [ ] Call `select_email_provider()` database function
  - [ ] Get provider credentials from `messaging_providers` table
  - [ ] Decrypt credentials using AES-256-CBC
  - [ ] Instantiate provider using factory pattern
  - [ ] Attempt email send
  - [ ] Handle success: update provider health score (+2)
  - [ ] Handle failure: update provider health score (-5)
  - [ ] Implement automatic failover on error
  - [ ] Log routing decision to `message_routing_logs` table
  - [ ] Return delivery result with messageId

- [ ] **Create Email API Route** - `/api/src/routes/emails.js`
  - [ ] `POST /v1/emails` - Send email with LCR
  - [ ] Validate request body (to, subject, html/text required)
  - [ ] Call email service
  - [ ] Return response with provider used and delivery status
  - [ ] Handle authentication and tenant isolation

---

### 🚧 Phase 3: Database Configuration (PENDING)

- [ ] **Create Provider Migration** - `/database/migrations/024_add_email_providers.sql`
  - [ ] Insert Elastic Email provider
    - Name: "Elastic Email Primary"
    - Type: email
    - Provider: elastic-email
    - Priority: 1
    - Status: active
    - Rate: $0.09 per 1000 emails
    - API Key: [ENCRYPTED]
    - From Email: noreply@irisx.com
    - From Name: IRISX
  - [ ] Insert SendGrid provider
    - Name: "SendGrid Backup"
    - Type: email
    - Provider: sendgrid
    - Priority: 2
    - Status: active
    - Rate: $0.10 per 1000 emails
    - API Key: [ENCRYPTED]
    - From Email: noreply@irisx.com
    - From Name: IRISX
  - [ ] Run migration on production database

---

### 🚧 Phase 4: Backend API Integration (PENDING)

- [ ] **Mount Email Routes** - `/api/src/index.js`
  - [ ] Import email routes: `import emailRoutes from './routes/emails.js'`
  - [ ] Mount: `app.route('/v1/emails', emailRoutes)`

- [ ] **Mount Provider Management Routes** - `/api/src/index.js`
  - [ ] Import admin provider routes: `import adminProvidersRoutes from './routes/admin-providers.js'`
  - [ ] Mount: `app.route('/admin/providers', adminProvidersRoutes)`
  - [ ] Verify authentication middleware applied

---

### 🚧 Phase 5: Admin Portal Integration (PENDING)

- [ ] **Update Admin API Client** - `/irisx-admin-portal/src/utils/api.js`
  - [ ] Add `getProviders()` function
  - [ ] Add `createProvider()` function
  - [ ] Add `updateProvider()` function
  - [ ] Add `deleteProvider()` function
  - [ ] Add `testProviderConnection()` function
  - [ ] Add `getProviderStats()` function

- [ ] **Update Admin Navigation** - `/irisx-admin-portal/src/router/index.js`
  - [ ] Add "Email Management" section to navigation
  - [ ] Link to `/admin/providers?type=email`
  - [ ] Use existing ProviderCredentials.vue component

- [ ] **Test Admin UI**
  - [ ] Navigate to Email Management
  - [ ] View existing providers (Elastic Email, SendGrid)
  - [ ] Test provider connections
  - [ ] View LCR routing decisions
  - [ ] View provider health scores
  - [ ] Check failover configuration

---

### 🚧 Phase 6: Testing & Deployment (PENDING)

- [ ] **Local Testing**
  - [ ] Test email send with Elastic Email (priority 1)
  - [ ] Test email send with attachments
  - [ ] Test failover to SendGrid when Elastic Email fails
  - [ ] Test health score updates
  - [ ] Test routing log creation
  - [ ] Verify cost tracking

- [ ] **Production Deployment**
  - [ ] Deploy email provider adapters to production
  - [ ] Deploy email service to production
  - [ ] Deploy email routes to production
  - [ ] Run database migration
  - [ ] Deploy admin portal updates
  - [ ] Restart API server
  - [ ] Clear admin portal cache

- [ ] **Production Verification**
  - [ ] Send test email via API
  - [ ] Verify Elastic Email is selected (lowest cost)
  - [ ] Check `message_routing_logs` table
  - [ ] Check provider health scores
  - [ ] Test manual failover
  - [ ] Monitor for 24 hours

---

## 🏗️ Architecture Overview

### Database Schema
- **Table**: `messaging_providers` - Stores provider credentials and configuration
- **Table**: `messaging_provider_rates` - Country-specific pricing (future)
- **Table**: `messaging_provider_health_logs` - Health check history
- **Table**: `message_routing_logs` - Tracks every routing decision
- **Function**: `select_email_provider()` - Returns best provider based on health + cost
- **Function**: `update_messaging_provider_health()` - Updates health scores

### LCR Selection Logic
1. Filter providers: `type='email'`, `status='active'`, `health_score >= 30`
2. Sort by: `health_score DESC`, `email_rate_per_1000 ASC`, `priority ASC`
3. Return top provider
4. On failure: retry with next provider in sorted list

### Provider Priority
- **Priority 1**: Elastic Email ($0.09/1000) - Primary, lowest cost
- **Priority 2**: SendGrid ($0.10/1000) - Backup, higher cost
- **Priority 3**: Custom SMTP ($0.00/1000) - Future self-hosted server

### Health Monitoring
- **Success**: health_score +2, consecutive_failures = 0
- **Failure**: health_score -5, consecutive_failures +1
- **Auto-disable**: After 10 consecutive failures

### Credential Security
- All API keys encrypted with AES-256-CBC
- Encryption key from `ENCRYPTION_KEY` environment variable
- Credentials decrypted on-demand for sending

---

## 📝 Implementation Notes

### Elastic Email API
- **Endpoint**: `https://api.elasticemail.com/v2`
- **Method**: POST to `/email/send`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Recipients**: Semicolon-separated string
- **Response**: JSON with `success` boolean and `data.messageid`

### SendGrid API
- **Endpoint**: `https://api.sendgrid.com/v3`
- **Method**: POST to `/mail/send`
- **Content-Type**: `application/json`
- **Recipients**: Array of objects with `email` field
- **Response**: 202 status with no body (success), X-Message-Id in headers

### Custom SMTP
- **Uses**: nodemailer library
- **Connection**: Pooled (5 connections, 100 messages per connection)
- **Security**: TLS/SSL support via `smtp_secure` flag
- **Future**: Will point to self-hosted mail server

---

## 🔗 Related Files

### Backend
- [admin-providers.js](../api/src/routes/admin-providers.js) - Provider CRUD API
- [elastic-email.js](../api/src/services/email-providers/elastic-email.js) - Elastic Email adapter
- [sendgrid.js](../api/src/services/email-providers/sendgrid.js) - SendGrid adapter
- [custom-smtp.js](../api/src/services/email-providers/custom-smtp.js) - SMTP adapter
- [index.js](../api/src/services/email-providers/index.js) - Provider factory

### Frontend
- [ProviderCredentials.vue](../irisx-admin-portal/src/views/admin/providers/ProviderCredentials.vue) - Provider management UI
- [api.js](../irisx-admin-portal/src/utils/api.js) - API client

### Database
- [023_create_messaging_providers_table.sql](../database/migrations/023_create_messaging_providers_table.sql) - Provider schema

---

## ✅ Success Criteria

1. **Email Routing**: System automatically selects Elastic Email for new emails
2. **Failover**: System switches to SendGrid when Elastic Email fails
3. **Health Monitoring**: Provider health scores update after each send
4. **Cost Tracking**: `message_routing_logs` records selected_rate for each email
5. **Admin UI**: Providers visible and manageable in admin portal
6. **Security**: All credentials encrypted at rest
7. **Logging**: Every routing decision logged with reason and alternatives

---

**Last Updated**: January 2025
**Updated By**: Claude Code
**Next Session**: Continue with Phase 2 - Email Sending Service with LCR
