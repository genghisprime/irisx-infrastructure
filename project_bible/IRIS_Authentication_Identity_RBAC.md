# IRIS Authentication, Identity & Access Management (IAM)
## Comprehensive Multi-Tenant Auth, RBAC & User Management System

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Part of:** IRIS Multi-Channel Communications Platform
**Priority:** **CRITICAL** - Required for all other features

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Multi-Tenant Architecture](#2-multi-tenant-architecture)
3. [Company Signup & Tenant Provisioning](#3-company-signup--tenant-provisioning)
4. [Authentication System](#4-authentication-system)
5. [Role-Based Access Control (RBAC)](#5-role-based-access-control-rbac)
6. [User Management](#6-user-management)
7. [Team & Organization Management](#7-team--organization-management)
8. [API Authentication](#8-api-authentication)
9. [Session Management](#9-session-management)
10. [Single Sign-On (SSO)](#10-single-sign-on-sso)
11. [Two-Factor Authentication (2FA/MFA)](#11-two-factor-authentication-2famfa)
12. [Security & Compliance](#12-security--compliance)
13. [Audit Logging](#13-audit-logging)
14. [Implementation Guide](#14-implementation-guide)

---

## 1. Executive Summary

### 1.1 What This Document Covers

**IRIS Authentication & Identity Management (IAM)** is the foundational security layer that enables:

✅ **Multi-Tenant Isolation** - Complete data separation between companies
✅ **Self-Service Signup** - Companies can register and start using IRIS in minutes
✅ **Role-Based Access Control** - Granular permissions for different user types
✅ **Team Management** - Organize users into departments/teams with specific access
✅ **Enterprise SSO** - SAML 2.0, OAuth 2.0 for large customers
✅ **API Security** - Multiple authentication methods for developers
✅ **Compliance Ready** - SOC 2, GDPR, HIPAA audit logging

### 1.2 Authentication Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    IRIS Authentication Flow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Company Signup                                         │
│  ┌──────────────────────────────────────────────┐              │
│  │  1. Company fills signup form                │              │
│  │  2. Email verification sent                  │              │
│  │  3. Tenant created (workspace)              │              │
│  │  4. Owner user created                       │              │
│  └──────────────────────────────────────────────┘              │
│                       ↓                                          │
│  Step 2: User Authentication                                    │
│  ┌──────────────────────────────────────────────┐              │
│  │  1. User enters email/password               │              │
│  │  2. Check credentials                        │              │
│  │  3. 2FA challenge (if enabled)              │              │
│  │  4. Generate JWT tokens (access + refresh)  │              │
│  │  5. Return session to client                │              │
│  └──────────────────────────────────────────────┘              │
│                       ↓                                          │
│  Step 3: Authorization Check                                    │
│  ┌──────────────────────────────────────────────┐              │
│  │  1. Extract JWT from request                │              │
│  │  2. Verify signature + expiration           │              │
│  │  3. Load user + tenant + roles              │              │
│  │  4. Check permissions for resource          │              │
│  │  5. Allow or deny request                   │              │
│  └──────────────────────────────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Features

| Feature | Description | Priority |
|---------|-------------|----------|
| **Multi-Tenant Signup** | Self-service company registration with email verification | P0 (Critical) |
| **Email/Password Auth** | Standard username/password authentication | P0 (Critical) |
| **JWT Sessions** | Stateless authentication with access + refresh tokens | P0 (Critical) |
| **RBAC System** | 6 built-in roles + custom roles | P0 (Critical) |
| **User Invites** | Email-based user invitation with activation | P0 (Critical) |
| **API Keys** | Developer API authentication | P0 (Critical) |
| **Password Reset** | Secure password recovery flow | P1 (High) |
| **2FA/MFA** | TOTP-based two-factor authentication | P1 (High) |
| **OAuth 2.0** | Login with Google, Microsoft, GitHub | P2 (Medium) |
| **SAML SSO** | Enterprise single sign-on | P3 (Low, Enterprise) |
| **IP Whitelisting** | Restrict access by IP address | P3 (Low, Enterprise) |
| **Audit Logging** | Complete activity tracking | P1 (High) |

---

## 2. Multi-Tenant Architecture

### 2.1 Tenant Isolation Model

**Tenant = Company/Organization**

Each company that signs up for IRIS gets a **tenant** - a completely isolated workspace with:

- ✅ Separate data (messages, contacts, campaigns)
- ✅ Own users with roles
- ✅ Own billing account
- ✅ Own API keys
- ✅ Own settings & configuration

**Isolation Strategy: Shared Database, Row-Level Isolation**

```sql
-- All tenant-specific tables have tenant_id column
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- ... other columns

  INDEX idx_messages_tenant (tenant_id, created_at DESC)
);

-- Postgres Row-Level Security (RLS) enforces isolation
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### 2.2 Core Identity Database Schema

```sql
-- Tenants (companies/organizations)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company info
  company_name VARCHAR(255) NOT NULL,
  company_slug VARCHAR(100) UNIQUE NOT NULL, -- 'acme-corp' for acme-corp.iris.com

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended', 'trial', 'cancelled'
  trial_ends_at TIMESTAMPTZ,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_tenants_slug (company_slug),
  INDEX idx_tenants_status (status)
);

-- Users (people who use IRIS)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identity
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255), -- NULL for SSO-only users

  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMPTZ,

  -- Security
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255), -- TOTP secret
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ, -- Account lockout

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, email),
  INDEX idx_users_tenant (tenant_id),
  INDEX idx_users_email (email)
);

-- Roles (predefined + custom)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system roles

  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Permissions (array of permission strings)
  permissions JSONB NOT NULL DEFAULT '[]',

  -- Built-in roles cannot be deleted
  is_system_role BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, name),
  INDEX idx_roles_tenant (tenant_id)
);

-- User role assignments
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

  -- Optional: Scope role to specific resource
  resource_type VARCHAR(50), -- 'campaign', 'phone_number', 'team'
  resource_id UUID,

  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role_id, resource_type, resource_id),
  INDEX idx_user_roles_user (user_id),
  INDEX idx_user_roles_role (role_id)
);

-- Permissions cache (denormalized for performance)
CREATE TABLE user_permissions_cache (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Flattened list of all permissions from all roles
  permissions JSONB NOT NULL,

  -- Invalidate cache when roles change
  cached_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_user_perms_tenant (tenant_id)
);

-- Teams/groups within tenant
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id, name),
  INDEX idx_teams_tenant (tenant_id)
);

-- Team members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Optional: Role specific to this team
  role_id UUID REFERENCES roles(id),

  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, user_id),
  INDEX idx_team_members_team (team_id),
  INDEX idx_team_members_user (user_id)
);
```

---

## 3. Company Signup & Tenant Provisioning

### 3.1 Self-Service Signup Flow

**Step 1: Registration Form**

```typescript
// pages/signup.tsx
interface SignupForm {
  // Company info
  companyName: string;
  companySlug: string; // Auto-generated from company name

  // Owner user info
  firstName: string;
  lastName: string;
  email: string;
  password: string;

  // Legal
  agreedToTerms: boolean;
  agreedToPrivacyPolicy: boolean;
}

async function handleSignup(form: SignupForm) {
  // 1. Validate form
  if (!form.agreedToTerms) {
    throw new Error('You must agree to Terms of Service');
  }

  // 2. Check if email already exists
  const existingUser = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [form.email]
  );

  if (existingUser.rows.length > 0) {
    throw new Error('An account with this email already exists');
  }

  // 3. Check if company slug available
  const existingTenant = await db.query(
    'SELECT id FROM tenants WHERE company_slug = $1',
    [form.companySlug]
  );

  if (existingTenant.rows.length > 0) {
    throw new Error('This company name is already taken');
  }

  // 4. Hash password
  const passwordHash = await bcrypt.hash(form.password, 12);

  // 5. Create tenant + owner user in transaction
  const result = await db.transaction(async (trx) => {
    // Create tenant
    const tenant = await trx.query(`
      INSERT INTO tenants (company_name, company_slug, status, trial_ends_at)
      VALUES ($1, $2, 'trial', NOW() + INTERVAL '14 days')
      RETURNING id, company_slug
    `, [form.companyName, form.companySlug]);

    const tenantId = tenant.rows[0].id;

    // Create owner user
    const user = await trx.query(`
      INSERT INTO users (
        tenant_id, email, password_hash, first_name, last_name,
        email_verified, is_active
      )
      VALUES ($1, $2, $3, $4, $5, false, true)
      RETURNING id, email
    `, [
      tenantId,
      form.email,
      passwordHash,
      form.firstName,
      form.lastName
    ]);

    const userId = user.rows[0].id;

    // Assign 'owner' role
    const ownerRole = await trx.query(`
      SELECT id FROM roles WHERE name = 'owner' AND is_system_role = true
    `);

    await trx.query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
    `, [userId, ownerRole.rows[0].id]);

    // Initialize onboarding progress
    await trx.query(`
      INSERT INTO onboarding_progress (tenant_id, user_id, tenant_created)
      VALUES ($1, $2, true)
    `, [tenantId, userId]);

    return {
      tenantId,
      userId,
      email: user.rows[0].email,
      companySlug: tenant.rows[0].company_slug
    };
  });

  // 6. Send verification email
  await sendVerificationEmail(result.email, result.userId);

  // 7. Return success
  return {
    success: true,
    message: 'Account created! Check your email to verify.',
    tenantSlug: result.companySlug,
    redirectUrl: `https://${result.companySlug}.iris.com/verify-email`
  };
}
```

**Step 2: Email Verification**

```typescript
// Generate verification token
interface VerificationToken {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
}

async function generateVerificationToken(userId: string, email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.query(`
    INSERT INTO email_verifications (user_id, email, token, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [userId, email, token, expiresAt]);

  return token;
}

// Send verification email
async function sendVerificationEmail(email: string, userId: string) {
  const token = await generateVerificationToken(userId, email);
  const verificationUrl = `https://iris.com/verify-email?token=${token}`;

  await sendEmail({
    to: email,
    from: 'noreply@iris.com',
    subject: 'Verify your IRIS account',
    html: `
      <h1>Welcome to IRIS!</h1>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${verificationUrl}">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
    `
  });
}

// Verify email endpoint
async function verifyEmail(token: string): Promise<{ success: boolean }> {
  const verification = await db.query(`
    SELECT user_id, email, expires_at
    FROM email_verifications
    WHERE token = $1 AND verified = false
  `, [token]);

  if (verification.rows.length === 0) {
    throw new Error('Invalid or expired verification token');
  }

  const { user_id, expires_at } = verification.rows[0];

  if (new Date() > new Date(expires_at)) {
    throw new Error('Verification token has expired');
  }

  // Mark user as verified
  await db.query(`
    UPDATE users
    SET email_verified = true, email_verified_at = NOW()
    WHERE id = $1
  `, [user_id]);

  // Mark verification as used
  await db.query(`
    UPDATE email_verifications
    SET verified = true, verified_at = NOW()
    WHERE token = $1
  `, [token]);

  // Update onboarding progress
  await db.query(`
    UPDATE onboarding_progress
    SET email_verified = true
    WHERE user_id = $1
  `, [user_id]);

  return { success: true };
}
```

### 3.2 Tenant Provisioning

**What Gets Created:**

1. **Tenant Record** - Company workspace
2. **Owner User** - First admin user
3. **Default Roles** - Copy system roles to tenant
4. **Default Settings** - Timezone, locale, etc.
5. **Trial Subscription** - 14-day free trial
6. **Onboarding State** - Progress tracker
7. **Welcome Email** - Getting started guide

```typescript
async function provisionTenant(companyName: string, ownerEmail: string): Promise<Tenant> {
  return await db.transaction(async (trx) => {
    // 1. Create tenant
    const tenant = await trx.query(`
      INSERT INTO tenants (
        company_name,
        company_slug,
        status,
        trial_ends_at,
        settings
      ) VALUES ($1, $2, 'trial', NOW() + INTERVAL '14 days', $3)
      RETURNING *
    `, [
      companyName,
      slugify(companyName),
      JSON.stringify({
        timezone: 'America/New_York',
        locale: 'en-US',
        date_format: 'MM/DD/YYYY',
        time_format: '12h',
        currency: 'USD'
      })
    ]);

    const tenantId = tenant.rows[0].id;

    // 2. Copy system roles to tenant
    await trx.query(`
      INSERT INTO roles (tenant_id, name, display_name, description, permissions, is_system_role)
      SELECT
        $1 as tenant_id,
        name,
        display_name,
        description,
        permissions,
        false as is_system_role
      FROM roles
      WHERE tenant_id IS NULL AND is_system_role = true
    `, [tenantId]);

    // 3. Create default team
    await trx.query(`
      INSERT INTO teams (tenant_id, name, description)
      VALUES ($1, 'Default Team', 'All users are part of this team')
    `, [tenantId]);

    // 4. Initialize billing account
    await trx.query(`
      INSERT INTO billing_accounts (tenant_id, plan_id, status)
      VALUES ($1, (SELECT id FROM plans WHERE name = 'trial'), 'trialing')
    `, [tenantId]);

    return tenant.rows[0];
  });
}
```

---

## 4. Authentication System

### 4.1 Email/Password Authentication

```typescript
// Login endpoint
interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

interface LoginResponse {
  success: boolean;
  user: User;
  tenant: Tenant;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

async function login(req: LoginRequest): Promise<LoginResponse> {
  // 1. Find user by email
  const user = await db.query(`
    SELECT
      u.*,
      t.id as tenant_id,
      t.company_name,
      t.company_slug,
      t.status as tenant_status
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.email = $1
  `, [req.email]);

  if (user.rows.length === 0) {
    throw new AuthError('Invalid email or password');
  }

  const userRecord = user.rows[0];

  // 2. Check if account is locked
  if (userRecord.locked_until && new Date() < new Date(userRecord.locked_until)) {
    throw new AuthError('Account is locked. Try again later.');
  }

  // 3. Check if tenant is active
  if (userRecord.tenant_status !== 'active' && userRecord.tenant_status !== 'trial') {
    throw new AuthError('Your account has been suspended. Contact support.');
  }

  // 4. Verify password
  const passwordValid = await bcrypt.compare(req.password, userRecord.password_hash);

  if (!passwordValid) {
    // Increment failed login attempts
    await db.query(`
      UPDATE users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= 5
            THEN NOW() + INTERVAL '30 minutes'
            ELSE NULL
          END
      WHERE id = $1
    `, [userRecord.id]);

    throw new AuthError('Invalid email or password');
  }

  // 5. Check if email verified
  if (!userRecord.email_verified) {
    throw new AuthError('Please verify your email before logging in');
  }

  // 6. Check if 2FA enabled
  if (userRecord.mfa_enabled) {
    // Return intermediate response - client must call /verify-2fa next
    return {
      success: false,
      requiresMFA: true,
      userId: userRecord.id,
      message: 'Please enter your 2FA code'
    };
  }

  // 7. Generate tokens
  const accessToken = generateAccessToken(userRecord);
  const refreshToken = await generateRefreshToken(userRecord.id);

  // 8. Update login metadata
  await db.query(`
    UPDATE users
    SET
      last_login_at = NOW(),
      last_login_ip = $1,
      failed_login_attempts = 0,
      locked_until = NULL
    WHERE id = $2
  `, [req.ipAddress, userRecord.id]);

  // 9. Log authentication event
  await logAuditEvent({
    userId: userRecord.id,
    tenantId: userRecord.tenant_id,
    action: 'user.login',
    ipAddress: req.ipAddress,
    userAgent: req.userAgent
  });

  return {
    success: true,
    user: {
      id: userRecord.id,
      email: userRecord.email,
      firstName: userRecord.first_name,
      lastName: userRecord.last_name,
      avatarUrl: userRecord.avatar_url
    },
    tenant: {
      id: userRecord.tenant_id,
      companyName: userRecord.company_name,
      companySlug: userRecord.company_slug
    },
    accessToken,
    refreshToken,
    expiresIn: 3600 // 1 hour
  };
}
```

### 4.2 JWT Token Generation

```typescript
import jwt from 'jsonwebtoken';

interface TokenPayload {
  sub: string; // user_id
  tenant_id: string;
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

function generateAccessToken(user: User): string {
  const payload: TokenPayload = {
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles.map(r => r.name),
    permissions: user.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256'
  });
}

async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.query(`
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
  `, [userId, token, expiresAt]);

  return token;
}

// Middleware to verify JWT
async function authenticateRequest(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as TokenPayload;

    // Load full user + permissions from database
    const user = await db.query(`
      SELECT
        u.*,
        t.company_name,
        t.company_slug,
        COALESCE(
          json_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles,
        upc.permissions
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_permissions_cache upc ON u.id = upc.user_id
      WHERE u.id = $1 AND u.is_active = true
      GROUP BY u.id, t.company_name, t.company_slug, upc.permissions
    `, [payload.sub]);

    if (user.rows.length === 0) {
      throw new AuthError('User not found or inactive');
    }

    return user.rows[0];
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthError('Token has expired');
    }
    throw new AuthError('Invalid token');
  }
}
```

### 4.3 Password Reset Flow

```typescript
// Request password reset
async function requestPasswordReset(email: string): Promise<{ success: boolean }> {
  const user = await db.query(`
    SELECT id, email, first_name FROM users WHERE email = $1
  `, [email]);

  if (user.rows.length === 0) {
    // Don't reveal if email exists - return success anyway
    return { success: true };
  }

  const userId = user.rows[0].id;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

  await db.query(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
  `, [userId, token, expiresAt]);

  const resetUrl = `https://iris.com/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    from: 'noreply@iris.com',
    subject: 'Reset your IRIS password',
    html: `
      <h1>Password Reset Request</h1>
      <p>Hi ${user.rows[0].first_name},</p>
      <p>We received a request to reset your password. Click the link below:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `
  });

  return { success: true };
}

// Reset password with token
async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
  const reset = await db.query(`
    SELECT user_id, expires_at
    FROM password_reset_tokens
    WHERE token = $1 AND used = false
  `, [token]);

  if (reset.rows.length === 0) {
    throw new Error('Invalid or expired reset token');
  }

  const { user_id, expires_at } = reset.rows[0];

  if (new Date() > new Date(expires_at)) {
    throw new Error('Reset token has expired');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  await db.query(`
    UPDATE users
    SET password_hash = $1, password_changed_at = NOW()
    WHERE id = $2
  `, [passwordHash, user_id]);

  // Mark token as used
  await db.query(`
    UPDATE password_reset_tokens
    SET used = true, used_at = NOW()
    WHERE token = $1
  `, [token]);

  // Invalidate all existing sessions
  await db.query(`
    DELETE FROM refresh_tokens WHERE user_id = $1
  `, [user_id]);

  return { success: true };
}
```

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Built-in Roles

**6 System Roles (cannot be deleted):**

| Role | Description | Permissions |
|------|-------------|-------------|
| **Owner** | Company owner, full access | ALL permissions |
| **Admin** | Administrator | All except billing.manage, tenant.delete |
| **Manager** | Team manager | campaigns.*, contacts.*, reports.read, users.read |
| **Developer** | API developer | api_keys.*, webhooks.*, messages.send, numbers.read |
| **Member** | Standard user | campaigns.read, contacts.read, messages.send |
| **Viewer** | Read-only access | *.read (read-only across all resources) |

### 5.2 Permission Structure

**Format:** `{resource}.{action}`

**Examples:**
- `campaigns.create`
- `campaigns.read`
- `campaigns.update`
- `campaigns.delete`
- `campaigns.*` (wildcard - all campaign permissions)
- `*.*` (all permissions)

**Full Permission List:**

```typescript
const PERMISSIONS = {
  // Campaigns
  'campaigns.create': 'Create campaigns',
  'campaigns.read': 'View campaigns',
  'campaigns.update': 'Edit campaigns',
  'campaigns.delete': 'Delete campaigns',
  'campaigns.send': 'Send/execute campaigns',

  // Contacts
  'contacts.create': 'Create contacts',
  'contacts.read': 'View contacts',
  'contacts.update': 'Edit contacts',
  'contacts.delete': 'Delete contacts',
  'contacts.import': 'Import contact lists',
  'contacts.export': 'Export contact lists',

  // Messages
  'messages.send': 'Send individual messages',
  'messages.read': 'View message history',

  // Phone Numbers
  'numbers.purchase': 'Buy phone numbers',
  'numbers.read': 'View phone numbers',
  'numbers.release': 'Release phone numbers',

  // API Keys
  'api_keys.create': 'Create API keys',
  'api_keys.read': 'View API keys',
  'api_keys.delete': 'Revoke API keys',

  // Webhooks
  'webhooks.create': 'Create webhooks',
  'webhooks.read': 'View webhooks',
  'webhooks.update': 'Edit webhooks',
  'webhooks.delete': 'Delete webhooks',

  // Users & Teams
  'users.invite': 'Invite users',
  'users.read': 'View users',
  'users.update': 'Edit user details',
  'users.delete': 'Remove users',
  'teams.create': 'Create teams',
  'teams.manage': 'Manage teams',

  // Billing
  'billing.read': 'View billing info',
  'billing.manage': 'Manage billing/payments',

  // Tenant
  'tenant.read': 'View tenant settings',
  'tenant.update': 'Update tenant settings',
  'tenant.delete': 'Delete tenant',

  // Reports
  'reports.read': 'View analytics/reports',
  'reports.export': 'Export reports'
};
```

### 5.3 Permission Checking

```typescript
// Check if user has permission
async function hasPermission(userId: string, permission: string): Promise<boolean> {
  // Load from cache
  const cache = await db.query(`
    SELECT permissions
    FROM user_permissions_cache
    WHERE user_id = $1
  `, [userId]);

  if (cache.rows.length === 0) {
    // Cache miss - rebuild cache
    await rebuildPermissionsCache(userId);
    return hasPermission(userId, permission); // Retry
  }

  const permissions = cache.rows[0].permissions as string[];

  // Check exact match
  if (permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions
  const [resource, action] = permission.split('.');

  // Check resource.* (e.g., "campaigns.*" grants "campaigns.create")
  if (permissions.includes(`${resource}.*`)) {
    return true;
  }

  // Check *.* (full access)
  if (permissions.includes('*.*')) {
    return true;
  }

  return false;
}

// Rebuild permissions cache
async function rebuildPermissionsCache(userId: string): Promise<void> {
  const result = await db.query(`
    SELECT DISTINCT jsonb_array_elements_text(r.permissions) as permission
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
  `, [userId]);

  const permissions = result.rows.map(r => r.permission);

  await db.query(`
    INSERT INTO user_permissions_cache (user_id, tenant_id, permissions, cached_at)
    SELECT $1, tenant_id, $2, NOW()
    FROM users WHERE id = $1
    ON CONFLICT (user_id)
    DO UPDATE SET permissions = $2, cached_at = NOW()
  `, [userId, JSON.stringify(permissions)]);
}

// Middleware to require permission
function requirePermission(permission: string) {
  return async (req: AuthenticatedRequest) => {
    const hasAccess = await hasPermission(req.user.id, permission);

    if (!hasAccess) {
      throw new ForbiddenError(`Missing required permission: ${permission}`);
    }
  };
}

// Usage in API routes
app.post('/api/campaigns',
  authenticateRequest,
  requirePermission('campaigns.create'),
  async (req, res) => {
    // Create campaign
  }
);
```

### 5.4 Custom Roles (Enterprise Feature)

```typescript
// Create custom role
async function createCustomRole(
  tenantId: string,
  name: string,
  displayName: string,
  permissions: string[]
): Promise<Role> {
  // Validate permissions
  for (const perm of permissions) {
    if (!Object.keys(PERMISSIONS).includes(perm) && !perm.endsWith('.*')) {
      throw new Error(`Invalid permission: ${perm}`);
    }
  }

  const role = await db.query(`
    INSERT INTO roles (tenant_id, name, display_name, permissions, is_system_role)
    VALUES ($1, $2, $3, $4, false)
    RETURNING *
  `, [tenantId, name, displayName, JSON.stringify(permissions)]);

  return role.rows[0];
}

// Example custom role: "Campaign Manager"
await createCustomRole(
  tenantId,
  'campaign_manager',
  'Campaign Manager',
  [
    'campaigns.*',      // Full campaign access
    'contacts.read',    // View contacts
    'contacts.import',  // Import contacts
    'messages.read',    // View message history
    'reports.read'      // View analytics
  ]
);
```

---

## 6. User Management

### 6.1 User Invitation Flow

```typescript
// Invite user to tenant
interface UserInvitation {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  teamIds?: string[];
  message?: string;
}

async function inviteUser(
  tenantId: string,
  invitedBy: string,
  invitation: UserInvitation
): Promise<{ success: boolean }> {
  // 1. Check if user already exists in this tenant
  const existing = await db.query(`
    SELECT id FROM users WHERE tenant_id = $1 AND email = $2
  `, [tenantId, invitation.email]);

  if (existing.rows.length > 0) {
    throw new Error('User already exists in this organization');
  }

  // 2. Generate invitation token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // 3. Create user record (inactive until accepted)
  const user = await db.query(`
    INSERT INTO users (
      tenant_id,
      email,
      first_name,
      last_name,
      is_active,
      email_verified
    ) VALUES ($1, $2, $3, $4, false, false)
    RETURNING id
  `, [
    tenantId,
    invitation.email,
    invitation.firstName,
    invitation.lastName
  ]);

  const userId = user.rows[0].id;

  // 4. Assign roles
  for (const roleId of invitation.roleIds) {
    await db.query(`
      INSERT INTO user_roles (user_id, role_id, assigned_by)
      VALUES ($1, $2, $3)
    `, [userId, roleId, invitedBy]);
  }

  // 5. Add to teams
  if (invitation.teamIds) {
    for (const teamId of invitation.teamIds) {
      await db.query(`
        INSERT INTO team_members (team_id, user_id)
        VALUES ($1, $2)
      `, [teamId, userId]);
    }
  }

  // 6. Create invitation record
  await db.query(`
    INSERT INTO user_invitations (
      user_id,
      tenant_id,
      invited_by,
      token,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5)
  `, [userId, tenantId, invitedBy, token, expiresAt]);

  // 7. Send invitation email
  const acceptUrl = `https://iris.com/accept-invitation?token=${token}`;
  const inviter = await getUser(invitedBy);
  const tenant = await getTenant(tenantId);

  await sendEmail({
    to: invitation.email,
    from: 'noreply@iris.com',
    subject: `You've been invited to join ${tenant.company_name} on IRIS`,
    html: `
      <h1>You're invited!</h1>
      <p>${inviter.first_name} ${inviter.last_name} has invited you to join ${tenant.company_name} on IRIS.</p>
      ${invitation.message ? `<p><em>"${invitation.message}"</em></p>` : ''}
      <p><a href="${acceptUrl}">Accept Invitation</a></p>
      <p>This invitation expires in 7 days.</p>
    `
  });

  return { success: true };
}

// Accept invitation
async function acceptInvitation(token: string, password: string): Promise<LoginResponse> {
  const invitation = await db.query(`
    SELECT ui.user_id, ui.tenant_id, ui.expires_at, u.email
    FROM user_invitations ui
    JOIN users u ON ui.user_id = u.id
    WHERE ui.token = $1 AND ui.accepted = false
  `, [token]);

  if (invitation.rows.length === 0) {
    throw new Error('Invalid or expired invitation');
  }

  const { user_id, tenant_id, expires_at, email } = invitation.rows[0];

  if (new Date() > new Date(expires_at)) {
    throw new Error('Invitation has expired');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Activate user
  await db.query(`
    UPDATE users
    SET
      password_hash = $1,
      is_active = true,
      email_verified = true,
      email_verified_at = NOW()
    WHERE id = $2
  `, [passwordHash, user_id]);

  // Mark invitation as accepted
  await db.query(`
    UPDATE user_invitations
    SET accepted = true, accepted_at = NOW()
    WHERE token = $1
  `, [token]);

  // Generate login tokens
  const user = await getUser(user_id);
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user_id);

  return {
    success: true,
    user,
    tenant: await getTenant(tenant_id),
    accessToken,
    refreshToken,
    expiresIn: 3600
  };
}
```

### 6.2 User Lifecycle Management

```typescript
// Suspend user
async function suspendUser(userId: string, reason: string): Promise<void> {
  await db.query(`
    UPDATE users
    SET is_active = false
    WHERE id = $1
  `, [userId]);

  // Invalidate all sessions
  await db.query(`
    DELETE FROM refresh_tokens WHERE user_id = $1
  `, [userId]);

  // Log event
  await logAuditEvent({
    userId,
    action: 'user.suspended',
    details: { reason }
  });
}

// Reactivate user
async function reactivateUser(userId: string): Promise<void> {
  await db.query(`
    UPDATE users
    SET is_active = true
    WHERE id = $1
  `, [userId]);

  await logAuditEvent({
    userId,
    action: 'user.reactivated'
  });
}

// Delete user (soft delete)
async function deleteUser(userId: string): Promise<void> {
  await db.query(`
    UPDATE users
    SET
      is_active = false,
      deleted_at = NOW(),
      email = CONCAT(email, '.deleted.', id) -- Prevent email reuse
    WHERE id = $1
  `, [userId]);

  // Remove from all teams
  await db.query(`
    DELETE FROM team_members WHERE user_id = $1
  `, [userId]);

  // Invalidate sessions
  await db.query(`
    DELETE FROM refresh_tokens WHERE user_id = $1
  `, [userId]);
}
```

---

## 7. Team & Organization Management

### 7.1 Team Structure

```typescript
// Create team
async function createTeam(
  tenantId: string,
  name: string,
  description: string
): Promise<Team> {
  const team = await db.query(`
    INSERT INTO teams (tenant_id, name, description)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [tenantId, name, description]);

  return team.rows[0];
}

// Add user to team
async function addUserToTeam(teamId: string, userId: string, roleId?: string): Promise<void> {
  await db.query(`
    INSERT INTO team_members (team_id, user_id, role_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (team_id, user_id) DO NOTHING
  `, [teamId, userId, roleId]);
}

// Get team members
async function getTeamMembers(teamId: string): Promise<User[]> {
  const members = await db.query(`
    SELECT
      u.id,
      u.email,
      u.first_name,
      u.last_name,
      u.avatar_url,
      r.display_name as role,
      tm.added_at
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    LEFT JOIN roles r ON tm.role_id = r.id
    WHERE tm.team_id = $1
    ORDER BY tm.added_at ASC
  `, [teamId]);

  return members.rows;
}
```

---

## 8. API Authentication

### 8.1 API Keys

```typescript
// Generate API key
interface APIKey {
  id: string;
  key: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
}

async function createAPIKey(
  tenantId: string,
  userId: string,
  name: string,
  scopes: string[],
  expiresAt?: Date
): Promise<APIKey> {
  // Generate key: iris_live_xxxxxxxxxxxxx
  const prefix = 'iris_live';
  const secret = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_${secret}`;

  // Hash the key for storage
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const result = await db.query(`
    INSERT INTO api_keys (
      tenant_id,
      created_by_user_id,
      name,
      key_hash,
      key_prefix,
      scopes,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, scopes, expires_at
  `, [
    tenantId,
    userId,
    name,
    keyHash,
    `${prefix}_${secret.substring(0, 8)}...`, // Store prefix for display
    JSON.stringify(scopes),
    expiresAt
  ]);

  // Return the key ONCE - user must save it
  return {
    id: result.rows[0].id,
    key, // Only time we return the full key
    name: result.rows[0].name,
    scopes: result.rows[0].scopes,
    expiresAt: result.rows[0].expires_at
  };
}

// Authenticate API key
async function authenticateAPIKey(key: string): Promise<{ tenantId: string; scopes: string[] }> {
  if (!key.startsWith('iris_live_') && !key.startsWith('iris_test_')) {
    throw new AuthError('Invalid API key format');
  }

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const result = await db.query(`
    SELECT
      ak.tenant_id,
      ak.scopes,
      ak.expires_at,
      ak.revoked,
      t.status as tenant_status
    FROM api_keys ak
    JOIN tenants t ON ak.tenant_id = t.id
    WHERE ak.key_hash = $1
  `, [keyHash]);

  if (result.rows.length === 0) {
    throw new AuthError('Invalid API key');
  }

  const { tenant_id, scopes, expires_at, revoked, tenant_status } = result.rows[0];

  if (revoked) {
    throw new AuthError('API key has been revoked');
  }

  if (expires_at && new Date() > new Date(expires_at)) {
    throw new AuthError('API key has expired');
  }

  if (tenant_status !== 'active' && tenant_status !== 'trial') {
    throw new AuthError('Account is not active');
  }

  // Update last used timestamp
  await db.query(`
    UPDATE api_keys
    SET last_used_at = NOW()
    WHERE key_hash = $1
  `, [keyHash]);

  return {
    tenantId: tenant_id,
    scopes
  };
}

// API authentication middleware
async function authenticateAPIRequest(req: Request): Promise<{ tenantId: string }> {
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    throw new AuthError('Missing API key');
  }

  const auth = await authenticateAPIKey(apiKey);

  // Check if API key has required scope for this endpoint
  const requiredScope = req.method === 'GET' ? 'read' : 'write';

  if (!auth.scopes.includes(requiredScope) && !auth.scopes.includes('*')) {
    throw new AuthError(`API key missing required scope: ${requiredScope}`);
  }

  return auth;
}
```

### 8.2 Webhook Signatures

```typescript
// Sign webhook payload
function signWebhookPayload(payload: object, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

// Verify webhook signature
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  tolerance: number = 300 // 5 minutes
): boolean {
  const [timestampPart, signaturePart] = signatureHeader.split(',');

  const timestamp = parseInt(timestampPart.split('=')[1]);
  const signature = signaturePart.split('=')[1];

  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new Error('Webhook timestamp is too old');
  }

  // Recompute signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## 9. Session Management

### 9.1 Refresh Token Flow

```typescript
// Refresh access token
async function refreshAccessToken(refreshToken: string): Promise<LoginResponse> {
  const token = await db.query(`
    SELECT rt.user_id, rt.expires_at, u.tenant_id
    FROM refresh_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token = $1 AND rt.revoked = false
  `, [refreshToken]);

  if (token.rows.length === 0) {
    throw new AuthError('Invalid refresh token');
  }

  const { user_id, expires_at, tenant_id } = token.rows[0];

  if (new Date() > new Date(expires_at)) {
    throw new AuthError('Refresh token has expired');
  }

  // Load user
  const user = await getUser(user_id);

  // Generate new access token
  const accessToken = generateAccessToken(user);

  // Optionally rotate refresh token
  const newRefreshToken = await generateRefreshToken(user_id);

  // Revoke old refresh token
  await db.query(`
    UPDATE refresh_tokens
    SET revoked = true
    WHERE token = $1
  `, [refreshToken]);

  return {
    success: true,
    user,
    tenant: await getTenant(tenant_id),
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 3600
  };
}
```

### 9.2 Session Revocation

```typescript
// Logout (revoke refresh token)
async function logout(refreshToken: string): Promise<void> {
  await db.query(`
    UPDATE refresh_tokens
    SET revoked = true
    WHERE token = $1
  `, [refreshToken]);
}

// Logout all sessions
async function logoutAllSessions(userId: string): Promise<void> {
  await db.query(`
    UPDATE refresh_tokens
    SET revoked = true
    WHERE user_id = $1
  `, [userId]);
}

// Get active sessions
async function getActiveSessions(userId: string): Promise<Session[]> {
  const sessions = await db.query(`
    SELECT
      id,
      created_at,
      expires_at,
      last_used_at,
      user_agent,
      ip_address
    FROM refresh_tokens
    WHERE user_id = $1 AND revoked = false
    ORDER BY created_at DESC
  `, [userId]);

  return sessions.rows;
}
```

---

## 10. Single Sign-On (SSO)

### 10.1 OAuth 2.0 (Google, Microsoft, GitHub)

```typescript
// OAuth configuration
const OAUTH_PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['email', 'profile']
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    scopes: ['user.read']
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    scopes: ['user:email']
  }
};

// Initiate OAuth flow
function initiateOAuthLogin(provider: string): string {
  const config = OAUTH_PROVIDERS[provider];
  const state = crypto.randomBytes(32).toString('hex');
  const redirectUri = `https://iris.com/auth/callback/${provider}`;

  // Store state in session to verify callback
  // ... (use signed cookie or Redis)

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state
  });

  return `${config.authUrl}?${params.toString()}`;
}

// Handle OAuth callback
async function handleOAuthCallback(
  provider: string,
  code: string,
  state: string
): Promise<LoginResponse> {
  // 1. Verify state
  // ... (check against stored state)

  const config = OAUTH_PROVIDERS[provider];
  const redirectUri = `https://iris.com/auth/callback/${provider}`;

  // 2. Exchange code for access token
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const { access_token } = await tokenResponse.json();

  // 3. Fetch user info
  const userInfoResponse = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${access_token}` }
  });

  const userInfo = await userInfoResponse.json();

  // 4. Find or create user
  const email = userInfo.email;
  const firstName = userInfo.given_name || userInfo.name?.split(' ')[0];
  const lastName = userInfo.family_name || userInfo.name?.split(' ')[1];
  const avatarUrl = userInfo.picture || userInfo.avatar_url;

  // Check if user exists
  let user = await db.query(`
    SELECT * FROM users WHERE email = $1
  `, [email]);

  if (user.rows.length === 0) {
    // New user - create account
    // For OAuth, we may need to prompt for company name first
    throw new Error('No account found. Please sign up first.');
  }

  user = user.rows[0];

  // 5. Update user profile
  await db.query(`
    UPDATE users
    SET
      first_name = COALESCE(first_name, $1),
      last_name = COALESCE(last_name, $2),
      avatar_url = COALESCE(avatar_url, $3),
      email_verified = true,
      last_login_at = NOW()
    WHERE id = $4
  `, [firstName, lastName, avatarUrl, user.id]);

  // 6. Generate JWT tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    success: true,
    user,
    tenant: await getTenant(user.tenant_id),
    accessToken,
    refreshToken,
    expiresIn: 3600
  };
}
```

### 10.2 SAML 2.0 SSO (Enterprise)

```typescript
// SAML configuration per tenant
interface SAMLConfig {
  tenantId: string;
  entityId: string;
  ssoUrl: string; // IdP login URL
  x509Certificate: string; // IdP public cert
  enforceSSO: boolean; // Force all users to use SSO
}

// Store SAML config
await db.query(`
  INSERT INTO saml_configs (tenant_id, entity_id, sso_url, x509_certificate, enforce_sso)
  VALUES ($1, $2, $3, $4, $5)
`, [tenantId, entityId, ssoUrl, x509Certificate, enforceSSO]);

// SAML login flow (simplified)
import { SAML } from 'samlify';

const saml = SAML.IdentityProvider({
  metadata: tenantSAMLConfig.metadata
});

// Generate SAML request
function generateSAMLRequest(tenantId: string): string {
  const config = await getSAMLConfig(tenantId);
  return saml.createLoginRequest(config.ssoUrl);
}

// Handle SAML response
async function handleSAMLResponse(samlResponse: string): Promise<LoginResponse> {
  const assertion = saml.parseLoginResponse(samlResponse);

  const email = assertion.email;
  const firstName = assertion.firstName;
  const lastName = assertion.lastName;

  // Find or create user
  // ... (similar to OAuth)

  return loginResponse;
}
```

---

## 11. Two-Factor Authentication (2FA/MFA)

### 11.1 TOTP-Based 2FA

```typescript
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

// Enable 2FA for user
async function enable2FA(userId: string): Promise<{ qrCode: string; backupCodes: string[] }> {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: 'IRIS',
    issuer: 'IRIS Communications'
  });

  // Store secret (encrypted)
  await db.query(`
    UPDATE users
    SET mfa_secret = $1
    WHERE id = $2
  `, [secret.base32, userId]);

  // Generate QR code
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  // Generate backup codes
  const backupCodes = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex');
    backupCodes.push(code);

    await db.query(`
      INSERT INTO mfa_backup_codes (user_id, code_hash)
      VALUES ($1, $2)
    `, [userId, crypto.createHash('sha256').update(code).digest('hex')]);
  }

  return {
    qrCode,
    backupCodes
  };
}

// Verify 2FA token
async function verify2FA(userId: string, token: string): Promise<boolean> {
  const user = await db.query(`
    SELECT mfa_secret FROM users WHERE id = $1
  `, [userId]);

  if (user.rows.length === 0 || !user.rows[0].mfa_secret) {
    return false;
  }

  const verified = speakeasy.totp.verify({
    secret: user.rows[0].mfa_secret,
    encoding: 'base32',
    token,
    window: 2 // Allow 2 time steps before/after
  });

  return verified;
}

// Verify backup code
async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  const result = await db.query(`
    SELECT id FROM mfa_backup_codes
    WHERE user_id = $1 AND code_hash = $2 AND used = false
  `, [userId, codeHash]);

  if (result.rows.length === 0) {
    return false;
  }

  // Mark backup code as used
  await db.query(`
    UPDATE mfa_backup_codes
    SET used = true, used_at = NOW()
    WHERE id = $1
  `, [result.rows[0].id]);

  return true;
}

// Complete login with 2FA
async function verify2FAAndLogin(userId: string, token: string): Promise<LoginResponse> {
  const verified = await verify2FA(userId, token);

  if (!verified) {
    // Try backup code
    const backupVerified = await verifyBackupCode(userId, token);
    if (!backupVerified) {
      throw new AuthError('Invalid 2FA code');
    }
  }

  // Complete login
  const user = await getUser(userId);
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(userId);

  return {
    success: true,
    user,
    tenant: await getTenant(user.tenant_id),
    accessToken,
    refreshToken,
    expiresIn: 3600
  };
}
```

---

## 12. Security & Compliance

### 12.1 Password Policies

```typescript
interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventReuse: number; // Prevent last N passwords
  maxAge: number; // Days until password must be changed
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventReuse: 5,
  maxAge: 90
};

function validatePassword(password: string, policy: PasswordPolicy): void {
  if (password.length < policy.minLength) {
    throw new Error(`Password must be at least ${policy.minLength} characters`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }

  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one number');
  }

  if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new Error('Password must contain at least one special character');
  }
}

// Check password history
async function checkPasswordHistory(
  userId: string,
  newPasswordHash: string,
  policy: PasswordPolicy
): Promise<void> {
  const history = await db.query(`
    SELECT password_hash
    FROM password_history
    WHERE user_id = $1
    ORDER BY changed_at DESC
    LIMIT $2
  `, [userId, policy.preventReuse]);

  for (const row of history.rows) {
    const matches = await bcrypt.compare(newPasswordHash, row.password_hash);
    if (matches) {
      throw new Error(`Cannot reuse any of your last ${policy.preventReuse} passwords`);
    }
  }
}
```

### 12.2 IP Whitelisting (Enterprise)

```typescript
// Check if IP is whitelisted
async function checkIPWhitelist(tenantId: string, ipAddress: string): Promise<boolean> {
  const whitelist = await db.query(`
    SELECT ip_address, ip_range
    FROM ip_whitelists
    WHERE tenant_id = $1 AND is_active = true
  `, [tenantId]);

  if (whitelist.rows.length === 0) {
    return true; // No whitelist = allow all
  }

  // Check exact IP match
  for (const row of whitelist.rows) {
    if (row.ip_address === ipAddress) {
      return true;
    }

    // Check CIDR range
    if (row.ip_range && isIPInRange(ipAddress, row.ip_range)) {
      return true;
    }
  }

  return false;
}
```

### 12.3 Rate Limiting

```typescript
// Rate limit by user
async function checkRateLimit(userId: string, action: string): Promise<void> {
  const key = `ratelimit:${userId}:${action}`;
  const limit = RATE_LIMITS[action]; // e.g., { requests: 100, window: 60 }

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, limit.window);
  }

  if (count > limit.requests) {
    throw new RateLimitError(`Rate limit exceeded for ${action}`);
  }
}
```

---

## 13. Audit Logging

### 13.1 Comprehensive Audit Log

```typescript
// Audit log schema
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),

  action VARCHAR(100) NOT NULL, -- 'user.login', 'campaign.created', 'message.sent'
  resource_type VARCHAR(50), -- 'campaign', 'user', 'message'
  resource_id UUID,

  -- Changes made
  old_values JSONB,
  new_values JSONB,

  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),

  -- Result
  success BOOLEAN DEFAULT true,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_audit_logs_tenant (tenant_id, created_at DESC),
  INDEX idx_audit_logs_user (user_id, created_at DESC),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_resource (resource_type, resource_id)
);

// Log audit event
async function logAuditEvent(event: AuditEvent): Promise<void> {
  await db.query(`
    INSERT INTO audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      old_values,
      new_values,
      ip_address,
      user_agent,
      request_id,
      success,
      error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    event.tenantId,
    event.userId,
    event.action,
    event.resourceType,
    event.resourceId,
    event.oldValues ? JSON.stringify(event.oldValues) : null,
    event.newValues ? JSON.stringify(event.newValues) : null,
    event.ipAddress,
    event.userAgent,
    event.requestId,
    event.success,
    event.errorMessage
  ]);
}
```

---

## 14. Implementation Guide

### 14.1 Phase 0: Core Auth (Week 1-2)

**Priority: P0 (Critical)**

- [ ] Database schema setup (tenants, users, roles, permissions)
- [ ] Company signup flow
- [ ] Email verification
- [ ] Email/password login
- [ ] JWT token generation
- [ ] Password reset flow
- [ ] Basic RBAC (6 system roles)
- [ ] API key authentication

### 14.2 Phase 1: User Management (Week 3-4)

**Priority: P1 (High)**

- [ ] User invitation flow
- [ ] Role assignment
- [ ] Team creation
- [ ] Permission checking middleware
- [ ] Session management
- [ ] Audit logging

### 14.3 Phase 2: Advanced Security (Week 5-6)

**Priority: P1-P2**

- [ ] 2FA/MFA (TOTP)
- [ ] Password policies
- [ ] Account lockout
- [ ] Rate limiting
- [ ] IP whitelisting
- [ ] Webhook signatures

### 14.4 Phase 3: Enterprise SSO (Week 7-8)

**Priority: P3 (Enterprise)**

- [ ] OAuth 2.0 (Google, Microsoft, GitHub)
- [ ] SAML 2.0 SSO
- [ ] Custom roles
- [ ] Advanced audit logs

---

## 15. Conclusion

**IRIS Authentication & Identity Management** provides enterprise-grade security with:

✅ **Multi-Tenant Isolation** - Complete data separation
✅ **Self-Service Signup** - Companies onboard in minutes
✅ **Granular RBAC** - 6 built-in roles + custom roles
✅ **Multiple Auth Methods** - Email/password, OAuth, SAML, API keys
✅ **Enterprise Security** - 2FA, IP whitelisting, audit logs
✅ **Compliance Ready** - SOC 2, GDPR, HIPAA

**This is the foundation for all other IRIS features.**

---

**Document Complete**
**Status:** Comprehensive Auth/Identity/RBAC system documented
**File Size:** ~65KB
**Last Updated:** 2025-10-28
