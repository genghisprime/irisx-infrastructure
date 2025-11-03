# Feature 1: Customer Signup Flow

**Priority:** ⭐⭐⭐ CRITICAL
**Status:** 🚀 IN PROGRESS (60% Complete)
**Estimated Time:** 4-6 hours
**Dependencies:** Email service (already integrated), JWT auth (already exists)

---

## Overview

Enable customers to self-register for Tazzi accounts without manual intervention from IRISX staff. This is the #1 blocker for customer acquisition.

**Goal:** Any customer can visit app.tazzi.com/signup, create an account, verify their email, and immediately start using Tazzi with a 14-day free trial.

---

## User Flow

1. Customer visits https://app.tazzi.com/signup
2. Fills out signup form:
   - Company name
   - Admin user first/last name
   - Admin user email
   - Password (with confirmation)
   - Phone number (optional)
3. Submits form
4. System creates:
   - New tenant record
   - New admin user record
   - Sends verification email
5. Customer receives email with verification link
6. Clicks verification link → email confirmed
7. Redirects to app.tazzi.com/login
8. Customer logs in and sees Customer Portal

---

## Database Changes

### Migration 014: Customer Signup Fields

**File:** `database/migrations/014_customer_signup.sql`

```sql
-- Add email verification to users table
ALTER TABLE users
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN email_verification_token VARCHAR(255),
  ADD COLUMN email_verification_expires_at TIMESTAMPTZ;

-- Add trial tracking to tenants table
ALTER TABLE tenants
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN signup_source VARCHAR(50) DEFAULT 'website';

-- Create public signups tracking table
CREATE TABLE public_signups (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  tenant_id INTEGER REFERENCES tenants(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, verified, activated
  verification_token VARCHAR(255),
  signup_ip VARCHAR(50),
  utm_source VARCHAR(100),
  utm_campaign VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ
);

CREATE INDEX idx_public_signups_email ON public_signups(email);
CREATE INDEX idx_public_signups_status ON public_signups(status);
CREATE INDEX idx_public_signups_tenant ON public_signups(tenant_id);
```

---

## Backend API

### 1. Public Signup Endpoint

**Route:** `POST /public/signup`
**File:** `api/src/routes/public-signup.js`
**Authentication:** None (public endpoint)

**Request Body:**
```json
{
  "companyName": "Acme Corp",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@acmecorp.com",
  "password": "SecurePass123!",
  "phone": "+1234567890",
  "utmSource": "google",
  "utmCampaign": "signup-ad"
}
```

**Validation:**
- Company name: Required, 2-100 characters
- First/Last name: Required, 1-50 characters
- Email: Required, valid format, unique
- Password: Required, min 8 chars, 1 uppercase, 1 number, 1 special
- Phone: Optional, E.164 format

**Process:**
1. Validate input with Zod
2. Check if email already exists
3. Generate verification token (crypto.randomBytes)
4. Hash password with bcrypt
5. Create tenant record (trial_ends_at = NOW() + 14 days)
6. Create admin user record
7. Create public_signups record
8. Send verification email
9. Return success response

**Response (200):**
```json
{
  "success": true,
  "message": "Account created! Please check your email to verify.",
  "email": "john@acmecorp.com",
  "verificationRequired": true
}
```

---

### 2. Email Verification Endpoint

**Route:** `GET /public/verify-email/:token`
**File:** `api/src/routes/public-signup.js`
**Authentication:** None (public endpoint)

**Process:**
1. Find signup record by token
2. Check token hasn't expired (24 hours)
3. Update user.email_verified = true
4. Update signup.status = 'verified'
5. Update signup.verified_at = NOW()
6. Return HTML redirect to login page

**Response:** HTTP 302 redirect to https://app.tazzi.com/login?verified=true

---

### 3. Resend Verification Email

**Route:** `POST /public/resend-verification`
**File:** `api/src/routes/public-signup.js`
**Authentication:** None

**Request:**
```json
{
  "email": "john@acmecorp.com"
}
```

**Process:**
1. Find unverified signup by email
2. Generate new token
3. Update token and expiry
4. Send new verification email

---

## Email Service

### Verification Email Template

**File:** `api/src/services/signup-email.js`

**Subject:** "Verify your Tazzi account"

**HTML Body:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white; padding: 30px; text-align: center; }
    .content { background: #f9f9f9; padding: 30px; }
    .button { display: inline-block; background: #667eea; color: white;
              padding: 12px 30px; text-decoration: none; border-radius: 5px;
              margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Tazzi!</h1>
    </div>
    <div class="content">
      <p>Hi {{firstName}},</p>
      <p>Thanks for signing up for Tazzi! You're one step away from accessing your multi-channel communication platform.</p>
      <p>Click the button below to verify your email address:</p>
      <a href="{{verificationLink}}" class="button">Verify Email Address</a>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #667eea;">{{verificationLink}}</p>
      <p>This link expires in 24 hours.</p>
      <p><strong>Your trial includes:</strong></p>
      <ul>
        <li>14 days free access to all features</li>
        <li>Voice calls, SMS, Email, WhatsApp, and Social channels</li>
        <li>Up to 5 agents</li>
        <li>1,000 free credits ($50 value)</li>
      </ul>
      <p>Questions? Reply to this email or visit our help center.</p>
      <p>Best regards,<br>The Tazzi Team</p>
    </div>
    <div class="footer">
      <p>© 2025 Tazzi. All rights reserved.</p>
      <p>If you didn't create a Tazzi account, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
```

---

## Frontend Page

### Signup Component

**File:** `irisx-customer-portal/src/views/auth/Signup.vue`

**Features:**
- Clean, modern signup form
- Real-time password strength indicator
- Email format validation
- Company name autocomplete (optional)
- Phone number formatting
- Terms of Service checkbox
- Privacy policy link
- Loading states during submission
- Error message display
- Success state with email verification notice

**Form Fields:**
1. Company Name (text input)
2. First Name (text input)
3. Last Name (text input)
4. Email (email input with validation)
5. Password (password input with strength meter)
6. Confirm Password (password input)
7. Phone Number (tel input, optional)
8. Terms Acceptance (checkbox, required)

**Validation:**
- All required fields present
- Email valid format
- Passwords match
- Password meets complexity requirements
- Terms accepted

**Submit Flow:**
1. Validate form client-side
2. Disable submit button
3. POST to /public/signup
4. Show success message
5. Display "Check your email" notice
6. Provide "Resend verification" link after 30 seconds

---

## Verification Success Page

**File:** `irisx-customer-portal/src/views/auth/EmailVerified.vue`

**Features:**
- Success message
- Confetti animation (optional)
- Auto-redirect to login after 3 seconds
- "Continue to Login" button

---

## Security Considerations

1. **Rate Limiting:** Max 3 signup attempts per IP per hour
2. **Email Validation:** Check for disposable email domains
3. **Password Hashing:** bcrypt with cost factor 10
4. **Token Security:** Cryptographically random 32-byte tokens
5. **Token Expiry:** 24-hour expiration on verification tokens
6. **SQL Injection:** Use parameterized queries
7. **XSS Protection:** Sanitize all user inputs

---

## Testing Checklist

- [ ] Happy path: Complete signup → verify → login
- [ ] Duplicate email detection
- [ ] Invalid email format rejection
- [ ] Weak password rejection
- [ ] Password mismatch detection
- [ ] Verification email delivery
- [ ] Token expiration (24 hours)
- [ ] Resend verification works
- [ ] Rate limiting prevents abuse
- [ ] Trial period set correctly (14 days)
- [ ] Tenant provisioned with correct defaults

---

## Success Metrics

- Signup completion rate > 70%
- Email verification rate > 80%
- Time from signup to first login < 5 minutes
- Abandoned signups can be re-engaged

---

## Deliverables Checklist

### Backend (api/) - ✅ 100% COMPLETE
- [x] Migration 014: database schema (90 lines)
- [x] public-signup.js route file (345 lines)
- [x] signup-email.js service (410 lines)
- [x] Zod validation schemas
- [x] Email template (HTML + text)
- [ ] Unit tests (deferred)

### Frontend (irisx-customer-portal/) - ⏳ IN PROGRESS
- [ ] Signup.vue component
- [ ] EmailVerified.vue component
- [ ] Router updates (add /signup, /verify-email routes)
- [ ] API client updates (signup, verify methods)
- [ ] Form validation logic
- [ ] Error handling

### Deployment - ⏳ PENDING
- [ ] Apply migration to production database
- [ ] Deploy backend routes
- [ ] Deploy frontend pages
- [ ] Test end-to-end on production
- [ ] Update documentation

---

**Estimated Time Breakdown:**
- Database migration: 30 minutes
- Backend API (3 endpoints): 2 hours
- Email service/template: 1 hour
- Frontend signup page: 1.5 hours
- Frontend verification page: 30 minutes
- Testing & bug fixes: 1 hour
- Deployment: 30 minutes

**Total: 5.5 hours**
