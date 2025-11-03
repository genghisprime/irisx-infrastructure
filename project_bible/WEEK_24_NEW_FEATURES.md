# Week 24: New Feature Development - Customer Growth Features

**Date:** November 2, 2025
**Status:** 🚀 IN PROGRESS
**Focus:** Customer acquisition, API discovery, monetization, and engagement

---

## Overview

With Week 23 complete (100% - all production deployments done), Week 24 focuses on **enabling customer growth** through self-service signup, developer tools, usage tracking, and engagement features.

**Goal:** Build the features that enable customers to discover, sign up, use, and pay for Tazzi.

---

## Week 24 Features (Priority Order)

### Feature 1: Customer Signup Flow ⭐ HIGHEST PRIORITY
**Status:** ✅ 90% CODE COMPLETE (Deployment Pending)
**Time Estimate:** 4-6 hours (5 hours actual)
**Value:** Critical for customer acquisition

**What to Build:**
1. **Public Signup Backend API**
   - POST /public/signup endpoint
   - Email verification system
   - Tenant provisioning automation
   - Trial period setup (14 days free)
   - Welcome email integration

2. **Public Signup Frontend Page**
   - Clean signup form at app.tazzi.com/signup
   - Company information collection
   - Admin user creation
   - Email verification flow
   - Redirect to Customer Portal after activation

**Database Changes:**
- Add `email_verified` column to users table
- Add `email_verification_token` column
- Add `trial_ends_at` column to tenants table
- Add `onboarding_completed` flag

**Deliverables:**
- [ ] Database migration for signup fields
- [ ] Signup API route (/public/signup)
- [ ] Email verification endpoint
- [ ] Signup Vue component
- [ ] Welcome email template
- [ ] Tenant provisioning service
- [ ] Testing and documentation

---

### Feature 2: API Documentation Website ⭐ HIGH PRIORITY
**Status:** ✅ 80% CODE COMPLETE (Deployment Pending)
**Time Estimate:** 6 hours (5 hours actual)
**Value:** Critical for developer onboarding

**What to Build:**
1. **Static Documentation Site** ✅ COMPLETE
   - Mintlify deployment (chosen framework)
   - OpenAPI spec integration (already exists - 800+ lines) ✅
   - Interactive API explorer ✅
   - Code examples in 4 languages (cURL, Node.js, Python, PHP) ✅
   - Authentication guides ✅
   - Webhook integration guides ✅

2. **CloudFront + S3 Deployment** ⏳ PENDING
   - Deploy to docs.tazzi.com
   - SSL certificate setup
   - DNS configuration
   - CloudFront distribution

**Deliverables:**
- [x] Choose documentation framework (Mintlify selected)
- [x] Initialize docs project (926 packages installed)
- [x] Import existing OpenAPI spec (openapi.yaml)
- [x] Add getting started guide (Introduction + Quick Start pages)
- [x] Add authentication guide (Authentication + API Keys pages)
- [x] Add webhook guide (Overview, Events, Security pages)
- [x] Add code examples (4 languages: cURL, Node.js, Python, PHP)
- [x] Create tutorial guides (4 guides: First Call, Send SMS, WhatsApp, Unified Inbox)
- [x] Create API reference pages (5 sections: Calls, SMS, Email, WhatsApp, Conversations)
- [ ] Deploy to docs.tazzi.com
- [ ] Test all interactive features

---

### Feature 3: Usage & Billing Dashboard ⭐ HIGH PRIORITY
**Status:** Pending
**Time Estimate:** 6-8 hours
**Value:** Required for monetization

**What to Build:**
1. **Usage Tracking API**
   - GET /v1/usage/current-period endpoint
   - GET /v1/usage/history endpoint
   - Per-channel usage metrics (calls, SMS, emails, WhatsApp)
   - Cost calculation per channel
   - Usage alerts (80%, 90%, 100% of quota)

2. **Billing Dashboard UI**
   - Current period usage display
   - Cost breakdown by channel
   - Usage charts and trends
   - Invoice generation
   - Payment method management
   - Upgrade/downgrade plan options

**Deliverables:**
- [ ] Usage tracking service
- [ ] Usage API routes (3 endpoints)
- [ ] Usage calculation logic per channel
- [ ] Usage Dashboard Vue component
- [ ] Billing history component
- [ ] Cost calculator
- [ ] Usage alerts system
- [ ] Integration with Stripe/PayPal (optional)

---

### Feature 4: Live Chat Widget 🌟 NICE TO HAVE
**Status:** Pending
**Time Estimate:** 8-10 hours
**Value:** Adds competitive feature

**What to Build:**
1. **Embeddable Chat Widget**
   - JavaScript widget for customer websites
   - Real-time messaging via WebSockets
   - Customizable appearance
   - File sharing support
   - Typing indicators

2. **Chat Backend**
   - WebSocket server for real-time messages
   - Chat message storage
   - Agent assignment logic
   - Chat history API
   - Unread message tracking

3. **Chat Management UI (Customer Portal)**
   - Live chat inbox
   - Agent response interface
   - Chat history viewer
   - Customer information panel

**Deliverables:**
- [ ] Database migration for chat tables
- [ ] WebSocket server setup
- [ ] Chat widget JavaScript library
- [ ] Widget customization API
- [ ] Chat backend API routes
- [ ] Chat inbox UI in Customer Portal
- [ ] Agent assignment system
- [ ] File upload support
- [ ] Testing and documentation

---

## Success Metrics

**Feature 1 Success:**
- Customers can sign up without manual intervention
- Email verification works correctly
- Trial period auto-activates
- Welcome email delivers successfully

**Feature 2 Success:**
- Developers can discover all API endpoints
- Interactive explorer works
- Code examples are copyable
- Authentication flow is clear

**Feature 3 Success:**
- Customers can see usage in real-time
- Cost calculations are accurate
- Alerts trigger at correct thresholds
- Invoices generate properly

**Feature 4 Success:**
- Widget embeds on customer websites
- Messages deliver in real-time
- Agents can respond quickly
- Chat history persists correctly

---

## Timeline

**Day 1 (4-6 hours):**
- Feature 1: Customer Signup Flow

**Day 2 (4-6 hours):**
- Feature 2: API Documentation Website

**Day 3 (6-8 hours):**
- Feature 3: Usage & Billing Dashboard

**Day 4 (8-10 hours) - Optional:**
- Feature 4: Live Chat Widget

**Total Time:** 22-30 hours across 3-4 days

---

## Dependencies

**For Feature 1 (Signup):**
- Email service integration (already have: SendGrid, Mailgun, SES)
- Tenant provisioning logic (already exists in Admin Portal)
- JWT generation (already implemented)

**For Feature 2 (API Docs):**
- OpenAPI specification (already exists)
- CloudFront + SSL (already configured)
- Route53 DNS (already set up)

**For Feature 3 (Usage Tracking):**
- Database access to all channel tables
- Cost per-unit pricing configuration
- Stripe integration (optional for payments)

**For Feature 4 (Live Chat):**
- WebSocket library (socket.io)
- Chat message storage (PostgreSQL)
- File storage (S3 - already configured)

---

## Notes

- All features are production-ready and customer-facing
- Features 1-3 are **required** for customer onboarding
- Feature 4 is **optional** but competitive
- All features integrate with existing infrastructure
- No breaking changes to existing functionality

---

**Let's build!** 🚀
