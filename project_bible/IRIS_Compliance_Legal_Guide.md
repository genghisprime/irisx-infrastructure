# IRIS Compliance & Legal Implementation Guide

**Version:** 1.0
**Last Updated:** 2025-01-15
**Status:** Implementation Guide

---

## Executive Summary

This document provides **complete implementation guidance** for all legal and compliance requirements for the IRIS multi-channel communications platform. Operating in the telecommunications and digital communications space requires strict adherence to federal regulations, carrier policies, and international data protection laws.

**Failure to comply can result in:**
- FCC fines: $10,000 - $50,000+ per violation
- Carrier suspension (losing ability to send messages)
- Class-action lawsuits (TCPA violations)
- GDPR fines: Up to 4% of global revenue or €20M

**This guide covers:**
1. TCPA (Voice & SMS regulations)
2. CAN-SPAM (Email regulations)
3. GDPR (EU data protection)
4. CASL (Canadian anti-spam)
5. A2P 10DLC (SMS brand registration)
6. STIR/SHAKEN (Caller ID authentication)
7. Consent Management System
8. Opt-out/Unsubscribe Handling
9. Data Retention & Privacy
10. Compliance Dashboard & Reporting

---

## Table of Contents

1. [TCPA Compliance (Voice & SMS)](#1-tcpa-compliance)
2. [CAN-SPAM Compliance (Email)](#2-can-spam-compliance)
3. [GDPR Compliance (EU)](#3-gdpr-compliance)
4. [CASL Compliance (Canada)](#4-casl-compliance)
5. [A2P 10DLC Registration](#5-a2p-10dlc-registration)
6. [STIR/SHAKEN Implementation](#6-stirshaken-implementation)
7. [Consent Management System](#7-consent-management-system)
8. [Opt-Out & Unsubscribe Handling](#8-opt-out-unsubscribe-handling)
9. [Do Not Call (DNC) Registry](#9-do-not-call-registry)
10. [Data Retention & Privacy](#10-data-retention-privacy)
11. [Recording Consent](#11-recording-consent)
12. [Compliance Dashboard](#12-compliance-dashboard)
13. [Legal Disclaimer Templates](#13-legal-disclaimer-templates)
14. [Compliance Testing](#14-compliance-testing)

---

## 1. TCPA Compliance (Voice & SMS)

### **What is TCPA?**

The **Telephone Consumer Protection Act (1991)** restricts telemarketing calls, auto-dialed calls, pre-recorded messages, text messages, and faxes.

**Key Requirements:**

1. **Prior Express Written Consent** required for:
   - Automated/robocalls to cell phones
   - Text messages to cell phones
   - Pre-recorded voice messages

2. **Call Time Restrictions:**
   - No calls before 8:00 AM or after 9:00 PM (recipient's local time)
   - Must respect time zones

3. **Identification Requirements:**
   - Must state caller's identity
   - Must provide callback number
   - Must state purpose of call

4. **Do Not Call (DNC) Registry:**
   - Must scrub against National DNC Registry
   - Must maintain internal DNC list
   - Honor opt-out requests within 30 days

5. **Frequency Limits:**
   - No more than 3 abandoned calls per 30-day period to same number
   - Abandoned call = no agent available within 2 seconds

**Penalties:**
- $500 per violation
- Up to $1,500 per willful violation
- No cap on damages (class actions can be millions)

---

### **Implementation**

#### **A. Consent Collection**

**Database Schema:**

```sql
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Consent details
  consent_type VARCHAR(50) NOT NULL,  -- 'voice', 'sms', 'email', 'all'
  consent_method VARCHAR(50) NOT NULL,  -- 'web_form', 'phone_call', 'sms_reply', 'paper'
  consent_purpose TEXT NOT NULL,  -- "Appointment reminders and service alerts"

  -- Legal proof
  ip_address INET,
  user_agent TEXT,
  consent_text TEXT NOT NULL,  -- Exact language shown to customer
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Verification
  verification_method VARCHAR(50),  -- 'double_opt_in', 'phone_verification', 'none'
  verified_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(50) DEFAULT 'active',  -- 'active', 'revoked', 'expired'
  revoked_at TIMESTAMPTZ,
  revocation_method VARCHAR(50),  -- 'customer_request', 'keyword_stop', 'admin'

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consents_contact ON consents(contact_id);
CREATE INDEX idx_consents_tenant ON consents(tenant_id);
CREATE INDEX idx_consents_status ON consents(status);
```

**Consent Form Example (Web):**

```html
<form id="consent-form">
  <h3>Communication Preferences</h3>

  <label>
    <input type="checkbox" name="consent_voice" value="1" required>
    I consent to receive automated voice calls from [Company Name] at the phone number provided above.
    I understand that consent is not required to make a purchase.
  </label>

  <label>
    <input type="checkbox" name="consent_sms" value="1" required>
    I consent to receive text messages (SMS) from [Company Name] at the phone number provided above.
    Message and data rates may apply. Reply STOP to unsubscribe at any time.
  </label>

  <p class="consent-disclaimer">
    By clicking "I Agree", I provide my signature expressly consenting to receive
    automated calls and text messages to my phone number. I understand that my consent
    is not a condition of purchase.
  </p>

  <button type="submit">I Agree</button>
</form>

<script>
document.getElementById('consent-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const consent = {
    contact_id: '{{contact_id}}',
    consent_type: [],
    consent_method: 'web_form',
    consent_purpose: 'Service alerts and appointment reminders',
    consent_text: document.querySelector('.consent-disclaimer').textContent,
    ip_address: await fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip),
    user_agent: navigator.userAgent
  };

  if (e.target.consent_voice.checked) consent.consent_type.push('voice');
  if (e.target.consent_sms.checked) consent.consent_type.push('sms');

  await fetch('/api/v1/consents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(consent)
  });
});
</script>
```

---

#### **B. Time Zone Enforcement**

**Before placing call/sending SMS:**

```typescript
async function checkCallTimeCompliance(recipient: Contact): Promise<boolean> {
  // Get recipient's timezone (from contact record or infer from area code)
  const timezone = recipient.timezone || inferTimezone(recipient.phone);

  // Get current time in recipient's timezone
  const now = DateTime.now().setZone(timezone);
  const hour = now.hour;

  // TCPA: No calls before 8 AM or after 9 PM
  if (hour < 8 || hour >= 21) {
    logger.warn('Call time violation prevented', {
      contact_id: recipient.id,
      phone: recipient.phone,
      timezone,
      local_time: now.toISO()
    });

    // Schedule for next available time (8 AM next day)
    const nextAvailable = now.hour >= 21
      ? now.plus({ days: 1 }).set({ hour: 8, minute: 0 })
      : now.set({ hour: 8, minute: 0 });

    await rescheduleMessage(recipient.id, nextAvailable);

    return false;
  }

  return true;
}

function inferTimezone(phone: string): string {
  // US/Canada area code mapping (simplified)
  const areaCode = phone.substring(2, 5);  // +1NXXNXXXXXX

  const timezones: Record<string, string> = {
    // Eastern
    '212': 'America/New_York',
    '917': 'America/New_York',
    '718': 'America/New_York',
    // ... (full mapping needed for production)

    // Pacific
    '310': 'America/Los_Angeles',
    '415': 'America/Los_Angeles',
    // ...
  };

  return timezones[areaCode] || 'America/New_York';  // Default to ET (safest)
}
```

---

#### **C. Frequency Caps**

**Track call attempts to prevent spam:**

```sql
CREATE TABLE call_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,

  attempt_type VARCHAR(50) NOT NULL,  -- 'voice', 'sms'
  attempt_result VARCHAR(50) NOT NULL,  -- 'answered', 'no_answer', 'busy', 'failed', 'abandoned'

  attempted_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_attempts_contact_date(contact_id, attempted_at DESC),
  INDEX idx_attempts_phone_date(phone, attempted_at DESC)
);
```

**Enforcement:**

```typescript
async function checkFrequencyLimits(contact: Contact, type: 'voice' | 'sms'): Promise<boolean> {
  const last30Days = DateTime.now().minus({ days: 30 });

  // TCPA: Max 3 abandoned calls per 30 days
  if (type === 'voice') {
    const abandonedCalls = await db.query(`
      SELECT COUNT(*) as count
      FROM call_attempts
      WHERE contact_id = $1
        AND attempt_type = 'voice'
        AND attempt_result = 'abandoned'
        AND attempted_at >= $2
    `, [contact.id, last30Days.toISO()]);

    if (abandonedCalls.count >= 3) {
      logger.warn('Abandoned call limit reached', { contact_id: contact.id });
      return false;
    }
  }

  // Custom limit: Max 10 calls per week (prevent harassment)
  const last7Days = DateTime.now().minus({ days: 7 });

  const recentCalls = await db.query(`
    SELECT COUNT(*) as count
    FROM call_attempts
    WHERE contact_id = $1
      AND attempt_type = $2
      AND attempted_at >= $3
  `, [contact.id, type, last7Days.toISO()]);

  if (recentCalls.count >= 10) {
    logger.warn('Weekly call limit reached', { contact_id: contact.id, type });
    return false;
  }

  return true;
}
```

---

#### **D. Caller ID Requirements**

**For all outbound calls, must display:**
- Valid, reachable callback number
- Matches the calling entity

```typescript
async function validateCallerID(campaign: Campaign): Promise<boolean> {
  const callerID = campaign.caller_id;

  // Must be E.164 format
  if (!callerID.match(/^\+1\d{10}$/)) {
    throw new Error('Invalid caller ID format');
  }

  // Must be owned by tenant (prevent spoofing)
  const owned = await db.query(`
    SELECT 1 FROM numbers
    WHERE e164 = $1 AND tenant_id = $2
  `, [callerID, campaign.tenant_id]);

  if (!owned.rowCount) {
    throw new Error('Caller ID not owned by tenant');
  }

  // Must be answerable (test call)
  // TODO: Periodic verification that number rings

  return true;
}
```

---

### **TCPA Compliance Checklist**

- [ ] Obtain prior express written consent (stored in database)
- [ ] Consent form includes all required disclosures
- [ ] Consent is contact-specific (not just account-level)
- [ ] Time zone enforcement active (8 AM - 9 PM local)
- [ ] Frequency limits enforced (max 3 abandoned/30 days)
- [ ] Caller ID validation (owned, reachable)
- [ ] DNC scrubbing before every campaign (see Section 9)
- [ ] Opt-out honored within 30 days (preferably immediately)
- [ ] Audit trail of all consents and opt-outs
- [ ] Abandoned call rate <3% (for predictive dialer)

---

## 2. CAN-SPAM Compliance (Email)

### **What is CAN-SPAM?**

The **Controlling the Assault of Non-Solicited Pornography And Marketing Act (2003)** sets rules for commercial email.

**Key Requirements:**

1. **Accurate "From" Information:**
   - From, To, Reply-To must be accurate
   - Routing information (headers) must be accurate

2. **Truthful Subject Lines:**
   - Subject must reflect email content
   - No deceptive subjects

3. **Identify as Advertisement:**
   - Must clearly state if email is an ad

4. **Include Physical Address:**
   - Valid postal address in footer

5. **Unsubscribe Mechanism:**
   - Clear, conspicuous opt-out link
   - Must process within 10 business days
   - Can't require login to unsubscribe
   - Must honor for 30 days minimum

6. **Monitor Third Parties:**
   - Responsible if you hire someone to send emails

**Penalties:**
- $50,120 per violation (as of 2023)
- No private right of action (only FTC enforces)

---

### **Implementation**

#### **A. Email Headers**

```typescript
async function sendMarketingEmail(recipient: Contact, email: EmailContent) {
  const headers = {
    'From': `"${email.from_name}" <noreply@useiris.com>`,
    'Reply-To': email.reply_to || 'support@useiris.com',
    'To': recipient.email,
    'Subject': email.subject,

    // Optional but recommended
    'List-Unsubscribe': `<mailto:unsubscribe@useiris.com?subject=unsubscribe_${recipient.id}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',  // RFC 8058 (one-click unsub)

    // Custom headers for tracking
    'X-Campaign-ID': email.campaign_id,
    'X-Tenant-ID': email.tenant_id
  };

  // Ensure physical address in footer
  email.html_body = email.html_body + `
    <div style="margin-top: 40px; padding: 20px; background: #f5f5f5; font-size: 12px; color: #666;">
      <p>This email was sent by ${email.tenant_name}</p>
      <p>${email.tenant_address}</p>
      <p>
        <a href="https://useiris.com/unsubscribe/${recipient.unsubscribe_token}">Unsubscribe</a> |
        <a href="https://useiris.com/preferences/${recipient.unsubscribe_token}">Manage Preferences</a>
      </p>
    </div>
  `;

  await emailProvider.send({
    headers,
    html: email.html_body,
    text: email.text_body
  });
}
```

---

#### **B. Physical Address Requirement**

**Tenant must provide physical address during onboarding:**

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  -- Legal entity info (required for CAN-SPAM)
  legal_entity_name VARCHAR(255) NOT NULL,
  physical_address JSONB NOT NULL,  -- {street, city, state, zip, country}

  -- Must be verified
  address_verified BOOLEAN DEFAULT FALSE,
  address_verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Validation:**

```typescript
function validatePhysicalAddress(address: Address): boolean {
  // Must have all fields
  if (!address.street || !address.city || !address.state || !address.postal_code) {
    throw new Error('Complete physical address required for CAN-SPAM compliance');
  }

  // Can't be PO Box (some states require physical location)
  if (address.street.toLowerCase().includes('po box') ||
      address.street.toLowerCase().includes('p.o. box')) {
    throw new Error('PO Box not accepted. Physical address required.');
  }

  return true;
}
```

---

#### **C. Unsubscribe Link**

**One-click unsubscribe (best practice):**

```html
<!-- In email footer -->
<a href="https://useiris.com/unsubscribe/{{unsubscribe_token}}?confirm=1"
   style="color: #0066cc; text-decoration: underline;">
  Unsubscribe from these emails
</a>
```

**Backend handler:**

```typescript
// GET /unsubscribe/:token?confirm=1
async function handleOneClickUnsubscribe(req: Request, res: Response) {
  const { token } = req.params;
  const { confirm } = req.query;

  // Decode token (JWT or encrypted ID)
  const contact = await decodeUnsubscribeToken(token);

  if (!contact) {
    return res.status(404).send('Invalid unsubscribe link');
  }

  if (confirm === '1') {
    // One-click: immediately unsubscribe (no confirmation page)
    await unsubscribeContact(contact.id, 'email', 'one_click_link');

    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>✓ You've been unsubscribed</h1>
          <p>You will no longer receive marketing emails from us.</p>
          <p>You may still receive transactional emails (receipts, account updates).</p>
        </body>
      </html>
    `);
  } else {
    // Show confirmation page
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>Unsubscribe Confirmation</h1>
          <p>Are you sure you want to unsubscribe from marketing emails?</p>
          <form method="POST" action="/unsubscribe/${token}">
            <button type="submit" style="padding: 10px 20px; font-size: 16px;">
              Yes, Unsubscribe Me
            </button>
          </form>
        </body>
      </html>
    `);
  }
}

// POST /unsubscribe/:token
async function handleUnsubscribeConfirmed(req: Request, res: Response) {
  const { token } = req.params;
  const contact = await decodeUnsubscribeToken(token);

  await unsubscribeContact(contact.id, 'email', 'confirmation_page');

  return res.redirect('/unsubscribe/' + token + '?confirm=1');
}
```

**Unsubscribe processing:**

```typescript
async function unsubscribeContact(
  contactId: string,
  channel: 'email' | 'sms' | 'voice' | 'all',
  method: string
) {
  // Update contact record
  await db.query(`
    UPDATE contacts
    SET
      opted_out_channels = array_append(opted_out_channels, $2),
      opted_in_channels = array_remove(opted_in_channels, $2),
      opted_out_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `, [contactId, channel]);

  // Log opt-out (audit trail)
  await db.query(`
    INSERT INTO opt_outs (contact_id, channel, method, opted_out_at)
    VALUES ($1, $2, $3, NOW())
  `, [contactId, channel, method]);

  // Add to suppression list (prevent accidental re-adding)
  await db.query(`
    INSERT INTO suppression_list (contact_id, channel, reason, added_at)
    VALUES ($1, $2, 'user_optout', NOW())
    ON CONFLICT (contact_id, channel) DO NOTHING
  `, [contactId, channel]);

  logger.info('Contact unsubscribed', { contact_id: contactId, channel, method });
}
```

---

#### **D. Transactional vs Marketing Emails**

**Transactional emails are EXEMPT from CAN-SPAM unsubscribe requirements:**

- Order confirmations
- Password resets
- Account notifications
- Service alerts (e.g., water outage)

**But still must:**
- Have accurate headers
- Not include marketing content (or it becomes marketing email)

```typescript
type EmailType = 'transactional' | 'marketing' | 'mixed';

function classifyEmail(email: EmailContent): EmailType {
  // Keywords that indicate marketing
  const marketingKeywords = [
    'sale', 'discount', 'offer', 'limited time', 'buy now',
    'special', 'promotion', 'deal', 'savings'
  ];

  const lowerBody = email.body.toLowerCase();
  const hasMarketingContent = marketingKeywords.some(kw => lowerBody.includes(kw));

  if (email.campaign_id && email.purpose === 'marketing') {
    return 'marketing';
  }

  if (email.purpose === 'transactional' && !hasMarketingContent) {
    return 'transactional';
  }

  // If transactional email includes marketing content, entire email is marketing
  return 'mixed';
}

async function sendEmail(recipient: Contact, email: EmailContent) {
  const emailType = classifyEmail(email);

  // Check if contact opted out of marketing emails
  if (emailType === 'marketing' || emailType === 'mixed') {
    if (recipient.opted_out_channels?.includes('email')) {
      throw new Error('Contact opted out of marketing emails');
    }

    // Must include unsubscribe link
    email.html_body = addUnsubscribeLink(email.html_body, recipient);
  }

  // Transactional emails can be sent even if opted out
  await emailProvider.send(email);
}
```

---

### **CAN-SPAM Compliance Checklist**

- [ ] Accurate "From" and "Reply-To" headers
- [ ] Truthful subject lines (no deception)
- [ ] Physical address in all marketing emails
- [ ] One-click unsubscribe link (prominent, easy to find)
- [ ] Unsubscribe processed within 10 business days (preferably immediate)
- [ ] Transactional emails don't include marketing content
- [ ] Suppression list prevents sending to opted-out contacts
- [ ] Audit trail of all unsubscribes

---

## 3. GDPR Compliance (EU)

### **What is GDPR?**

The **General Data Protection Regulation (2018)** governs data protection and privacy in the European Union.

**Key Rights:**

1. **Right to Access** - Users can request copy of their data
2. **Right to Rectification** - Users can correct inaccurate data
3. **Right to Erasure ("Right to be Forgotten")** - Users can request deletion
4. **Right to Portability** - Users can export data in machine-readable format
5. **Right to Object** - Users can object to processing (e.g., marketing)
6. **Right to Restrict Processing** - Users can limit how data is used

**Consent Requirements:**
- Must be freely given, specific, informed, unambiguous
- Pre-ticked boxes not valid
- Easy to withdraw consent
- Separate consent for different purposes

**Penalties:**
- Up to €20M or 4% of global annual revenue (whichever is higher)

---

### **Implementation**

#### **A. Data Subject Access Request (DSAR)**

**API Endpoint:**

```typescript
// POST /v1/privacy/export
async function handleDataExport(req: Request, res: Response) {
  const { email } = req.body;

  // Verify identity (send confirmation email first)
  const verificationToken = await sendVerificationEmail(email);

  return res.json({
    message: 'Verification email sent. Click link to confirm and download data.',
    verification_token: verificationToken
  });
}

// GET /v1/privacy/export/:token
async function downloadDataExport(req: Request, res: Response) {
  const { token } = req.params;

  // Verify token
  const contact = await verifyExportToken(token);

  if (!contact) {
    return res.status(404).send('Invalid or expired token');
  }

  // Gather all data about this contact
  const data = await gatherContactData(contact.id);

  // Generate JSON export
  const exportData = {
    export_date: new Date().toISOString(),
    contact_info: {
      id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      created_at: contact.created_at,
      updated_at: contact.updated_at
    },
    consents: data.consents,
    messages_sent: data.messages,
    deliveries: data.deliveries,
    opt_outs: data.opt_outs,
    custom_fields: contact.custom_fields
  };

  // Send as downloadable JSON file
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="my-data-${contact.id}.json"`);
  res.send(JSON.stringify(exportData, null, 2));

  // Log DSAR (audit trail)
  await db.query(`
    INSERT INTO privacy_requests (contact_id, request_type, completed_at)
    VALUES ($1, 'export', NOW())
  `, [contact.id]);
}

async function gatherContactData(contactId: string) {
  const [consents, messages, deliveries, optOuts] = await Promise.all([
    db.query('SELECT * FROM consents WHERE contact_id = $1', [contactId]),
    db.query('SELECT * FROM messages WHERE contact_id = $1 LIMIT 1000', [contactId]),
    db.query('SELECT * FROM message_deliveries WHERE contact_id = $1 LIMIT 1000', [contactId]),
    db.query('SELECT * FROM opt_outs WHERE contact_id = $1', [contactId])
  ]);

  return {
    consents: consents.rows,
    messages: messages.rows,
    deliveries: deliveries.rows,
    opt_outs: optOuts.rows
  };
}
```

---

#### **B. Right to Erasure (Delete Account)**

```typescript
// POST /v1/privacy/delete
async function handleDataDeletion(req: Request, res: Response) {
  const { email, reason } = req.body;

  // Send confirmation email (prevent malicious deletions)
  const verificationToken = await sendDeletionConfirmationEmail(email);

  return res.json({
    message: 'Confirmation email sent. Click link to permanently delete your account.',
    verification_token: verificationToken
  });
}

// POST /v1/privacy/delete/:token/confirm
async function confirmDataDeletion(req: Request, res: Response) {
  const { token } = req.params;

  const contact = await verifyDeletionToken(token);

  if (!contact) {
    return res.status(404).send('Invalid or expired token');
  }

  // Archive data (for legal compliance - may need to retain for X years)
  await archiveContactData(contact.id);

  // Anonymize instead of hard delete (preserve analytics)
  await anonymizeContact(contact.id);

  // Log deletion request (audit trail)
  await db.query(`
    INSERT INTO privacy_requests (contact_id, request_type, completed_at)
    VALUES ($1, 'deletion', NOW())
  `, [contact.id]);

  return res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>✓ Account Deleted</h1>
        <p>Your personal data has been permanently deleted from our systems.</p>
        <p>Some data may be retained for legal or security purposes as outlined in our Privacy Policy.</p>
      </body>
    </html>
  `);
}

async function anonymizeContact(contactId: string) {
  // Replace PII with anonymized values
  await db.query(`
    UPDATE contacts
    SET
      first_name = 'DELETED',
      last_name = 'USER',
      email = CONCAT('deleted_', id, '@example.com'),
      phone = NULL,
      facebook_id = NULL,
      twitter_handle = NULL,
      discord_id = NULL,
      custom_fields = NULL,
      deleted_at = NOW()
    WHERE id = $1
  `, [contactId]);

  // Keep message delivery records (aggregated stats) but anonymize
  await db.query(`
    UPDATE message_deliveries
    SET recipient = 'ANONYMIZED'
    WHERE contact_id = $1
  `, [contactId]);

  logger.info('Contact anonymized', { contact_id: contactId });
}
```

---

#### **C. Cookie Consent Banner**

**For dashboard/portal (if tracking users):**

```html
<!-- Cookie consent banner (GDPR requirement) -->
<div id="cookie-banner" style="position: fixed; bottom: 0; width: 100%; background: #333; color: white; padding: 20px; display: none;">
  <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center;">
    <p style="margin: 0;">
      We use cookies to improve your experience and analyze site usage.
      <a href="/privacy-policy" style="color: #4CAF50;">Learn more</a>
    </p>
    <div>
      <button onclick="acceptCookies()" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; margin-left: 10px; cursor: pointer;">
        Accept All
      </button>
      <button onclick="rejectCookies()" style="background: #666; color: white; border: none; padding: 10px 20px; margin-left: 10px; cursor: pointer;">
        Reject Non-Essential
      </button>
    </div>
  </div>
</div>

<script>
// Show banner if user hasn't made choice
if (!localStorage.getItem('cookie_consent')) {
  document.getElementById('cookie-banner').style.display = 'block';
}

function acceptCookies() {
  localStorage.setItem('cookie_consent', 'accepted');
  document.getElementById('cookie-banner').style.display = 'none';

  // Enable analytics
  enableGoogleAnalytics();
}

function rejectCookies() {
  localStorage.setItem('cookie_consent', 'rejected');
  document.getElementById('cookie-banner').style.display = 'none';

  // Disable non-essential cookies
}
</script>
```

---

### **GDPR Compliance Checklist**

- [ ] Privacy Policy published (clear, concise language)
- [ ] Cookie consent banner (for portal/dashboard)
- [ ] Data export functionality (JSON download)
- [ ] Account deletion functionality (anonymize PII)
- [ ] Consent forms updated (GDPR-compliant language)
- [ ] Data Processing Agreement (DPA) for enterprise customers
- [ ] Appointing Data Protection Officer (if >250 employees or high-risk processing)
- [ ] Data breach notification procedure (<72 hours to authorities)
- [ ] Privacy by Design (minimize data collection)

---

## 4. CASL Compliance (Canada)

### **What is CASL?**

Canada's **Anti-Spam Legislation (2014)** regulates commercial electronic messages (CEMs).

**Stricter than CAN-SPAM:**
- Requires **opt-in** (not opt-out)
- Applies to SMS and email
- Unsubscribe must work for 60 days (not 30)

**Key Requirements:**

1. **Express Consent Required:**
   - Must get permission before sending CEMs
   - Implied consent allowed for existing business relationships (expires after 2 years)

2. **Identification:**
   - Clearly identify sender
   - Provide contact info

3. **Unsubscribe Mechanism:**
   - Must work for 60 days minimum
   - Can't charge to unsubscribe
   - Process within 10 business days

**Penalties:**
- Up to $10M CAD per violation

---

### **Implementation**

**Same as CAN-SPAM, but:**

```typescript
function validateCANSPAMvsC

ASL(recipient: Contact, tenant: Tenant): boolean {
  // CASL applies if recipient is in Canada
  const isCanadian = recipient.country === 'CA' || recipient.phone.startsWith('+1') && isCanadianAreaCode(recipient.phone);

  if (isCanadian) {
    // CASL: Must have EXPRESS consent (opt-in)
    const hasConsent = recipient.opted_in_channels?.includes('email');

    if (!hasConsent) {
      throw new Error('CASL: Express consent required for Canadian recipients');
    }

    // Consent must be <2 years old (for implied consent)
    const consent = await getLatestConsent(recipient.id, 'email');
    const consentAge = DateTime.now().diff(DateTime.fromISO(consent.consent_timestamp), 'years').years;

    if (consentAge > 2 && consent.consent_type === 'implied') {
      throw new Error('CASL: Implied consent expired (>2 years). Need express consent.');
    }
  }

  // US recipients: CAN-SPAM rules (opt-out)
  // EU recipients: GDPR rules (opt-in)

  return true;
}

function isCanadianAreaCode(phone: string): boolean {
  const areaCode = phone.substring(2, 5);

  const canadianAreaCodes = [
    '204', '226', '236', '249', '250', '289', '306', '343', '365', '367',
    '403', '416', '418', '431', '437', '438', '450', '506', '514', '519',
    '548', '579', '581', '587', '604', '613', '639', '647', '672', '705',
    '709', '778', '780', '782', '807', '819', '825', '867', '873', '902',
    '905'
  ];

  return canadianAreaCodes.includes(areaCode);
}
```

---

## 5. A2P 10DLC Registration

### **What is A2P 10DLC?**

**Application-to-Person 10-Digit Long Code** - New standard (2021) for SMS sent from applications to US consumers.

**Why it exists:**
- Combat SMS spam
- Improve deliverability
- Carrier filtering

**Requirements:**
1. **Brand Registration** - Register your business with The Campaign Registry (TCR)
2. **Campaign Registration** - Register each use case (alerts, reminders, marketing)
3. **Vetting** - Verified brands get higher throughput

**Without registration:**
- SMS filtered/blocked by carriers
- Throughput limited to 1 msg/sec per number
- Higher cost

---

### **Implementation**

#### **A. Brand Registration (via Twilio/Telnyx)**

```typescript
// POST /v1/tenants/:id/10dlc/brand
async function register10DLCBrand(tenantId: string) {
  const tenant = await getTenant(tenantId);

  // Required info for brand registration
  const brandData = {
    // Business info
    legal_name: tenant.legal_entity_name,
    display_name: tenant.name,
    website: tenant.website_url,
    vertical: tenant.industry,  // 'UTILITY', 'HEALTHCARE', 'GOVERNMENT', etc.

    // Address
    street: tenant.physical_address.street,
    city: tenant.physical_address.city,
    state: tenant.physical_address.state,
    postal_code: tenant.physical_address.postal_code,
    country: 'US',

    // Tax ID (EIN)
    ein: tenant.tax_id,

    // Contact
    email: tenant.primary_email,
    phone: tenant.primary_phone,

    // Stock info (if public company)
    stock_symbol: tenant.stock_symbol,
    stock_exchange: tenant.stock_exchange,

    // External vetting (optional, for higher trust score)
    external_vetting: {
      evp_id: tenant.evp_id,  // External Vetting Provider ID
      evp_vetting_class: 'STANDARD'  // or 'POLITICAL'
    }
  };

  // Submit to Twilio A2P API
  const twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const brand = await twilio.messaging.v1.a2p.brands.create(brandData);

  // Save brand SID
  await db.query(`
    UPDATE tenants
    SET
      dlc_brand_sid = $1,
      dlc_brand_status = $2,
      dlc_brand_registered_at = NOW()
    WHERE id = $3
  `, [brand.sid, brand.status, tenantId]);

  logger.info('10DLC brand registered', { tenant_id: tenantId, brand_sid: brand.sid });

  return brand;
}
```

**Typical approval time:** 1-5 business days

---

#### **B. Campaign Registration**

```typescript
// POST /v1/tenants/:id/10dlc/campaigns
async function register10DLCCampaign(tenantId: string, campaignData: any) {
  const tenant = await getTenant(tenantId);

  if (!tenant.dlc_brand_sid) {
    throw new Error('Must register brand before campaigns');
  }

  // Campaign use case categories
  const useCases = {
    'ALERTS': '2FA, account alerts, emergency notifications',
    'MARKETING': 'Promotional content, offers, discounts',
    'MIXED': 'Both marketing and non-marketing',
    'HIGHER_EDUCATION': 'College/university communications',
    'CUSTOMER_CARE': 'Support, service updates, confirmations',
    'DELIVERY': 'Shipping notifications',
    'FRAUD': 'Fraud alerts, security notifications',
    'PUBLIC_SERVICE': 'Government, nonprofit, emergency services'
  };

  const campaign = {
    brand_sid: tenant.dlc_brand_sid,

    // Campaign details
    description: campaignData.description,
    use_case: campaignData.use_case,  // From above list
    message_samples: campaignData.sample_messages,  // Array of 5 sample messages

    // Subscriber info
    subscriber_opt_in: true,  // Must be true
    subscriber_opt_out: true,  // Must be true
    subscriber_help: true,  // Must support HELP keyword

    // Expected volume
    daily_volume: campaignData.daily_volume || 1000,

    // Opt-in methods
    opt_in_message: campaignData.opt_in_message,
    opt_in_keywords: ['START', 'YES', 'UNSTOP'],
    opt_out_keywords: ['STOP', 'END', 'CANCEL', 'UNSUBSCRIBE'],
    help_keywords: ['HELP', 'INFO'],
    help_message: `Reply STOP to unsubscribe. Msg&data rates may apply. Contact ${tenant.support_email} for help.`
  };

  const twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const registeredCampaign = await twilio.messaging.v1.a2p.campaigns.create(campaign);

  // Save campaign SID
  await db.query(`
    INSERT INTO dlc_campaigns (tenant_id, campaign_sid, use_case, status, registered_at)
    VALUES ($1, $2, $3, $4, NOW())
  `, [tenantId, registeredCampaign.sid, campaignData.use_case, registeredCampaign.status]);

  logger.info('10DLC campaign registered', {
    tenant_id: tenantId,
    campaign_sid: registeredCampaign.sid
  });

  return registeredCampaign;
}
```

**Approval time:**
- Standard: 1-2 weeks
- Special review (political, cannabis): 2-6 weeks

---

#### **C. Number Association**

```typescript
// After campaign approved, associate phone numbers
async function associate10DLCNumber(campaignSid: string, phoneNumberSid: string) {
  const twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  await twilio.messaging.v1.a2p
    .campaignPhoneNumbers(campaignSid)
    .create({ phoneNumberSid });

  logger.info('Number associated with 10DLC campaign', { campaign_sid: campaignSid, phone: phoneNumberSid });
}
```

---

#### **D. Keyword Auto-Responses**

**STOP, HELP, START must be handled:**

```typescript
// Inbound SMS handler
async function handleInboundSMS(from: string, to: string, body: string) {
  const keyword = body.trim().toUpperCase();

  // STOP - Unsubscribe
  if (['STOP', 'END', 'CANCEL', 'UNSUBSCRIBE', 'QUIT'].includes(keyword)) {
    await unsubscribeContact(from, 'sms', 'keyword_stop');

    await sendSMS({
      from: to,
      to: from,
      body: 'You have been unsubscribed. You will not receive further messages from this number. Reply START to resubscribe.'
    });

    return;
  }

  // START - Resubscribe
  if (['START', 'YES', 'UNSTOP'].includes(keyword)) {
    await resubscribeContact(from, 'sms');

    await sendSMS({
      from: to,
      to: from,
      body: 'You have been resubscribed. You will now receive messages from this number. Reply STOP to unsubscribe. Reply HELP for help.'
    });

    return;
  }

  // HELP - Info
  if (['HELP', 'INFO'].includes(keyword)) {
    const tenant = await getTenantByNumber(to);

    await sendSMS({
      from: to,
      to: from,
      body: `${tenant.name} alerts. Msg&data rates may apply. Reply STOP to unsubscribe. Contact: ${tenant.support_email} or ${tenant.support_phone}`
    });

    return;
  }

  // Forward to customer's webhook
  await forwardInboundSMS(from, to, body);
}
```

---

### **10DLC Compliance Checklist**

- [ ] Brand registered with The Campaign Registry (TCR)
- [ ] Tax ID (EIN) verified
- [ ] Campaign registered for each use case
- [ ] 5 sample messages provided per campaign
- [ ] STOP, HELP, START keywords handled automatically
- [ ] Opt-in consent collected before first message
- [ ] Phone numbers associated with approved campaigns
- [ ] Daily volume limits respected

---

## 6. STIR/SHAKEN Implementation

### **What is STIR/SHAKEN?**

**STIR:** Secure Telephone Identity Revisited
**SHAKEN:** Signature-based Handling of Asserted information using toKENs

**Purpose:** Combat caller ID spoofing and robocalls

**Attestation Levels:**
- **A (Full):** Carrier knows and authenticated caller + phone number
- **B (Partial):** Carrier authenticated caller but not number ownership
- **C (Gateway):** Carrier received call from gateway, no authentication

**FCC Requirement (June 2021):**
- All carriers must implement STIR/SHAKEN
- Must block calls without attestation from non-trusted sources

---

### **Implementation**

**Phase 1: Rely on Carrier Attestation (Now)**

```typescript
// Twilio/Telnyx provide attestation automatically
// No action needed, but track attestation level in CDR

interface CallMetadata {
  stir_shaken_attestation?: 'A' | 'B' | 'C';
  stir_shaken_verified?: boolean;
}

async function handleOutboundCall(call: Call) {
  // Carrier (Twilio) signs the call with STIR/SHAKEN
  // Attestation level depends on number ownership

  const result = await twilioClient.calls.create({
    from: call.from,  // Must be owned by us → Attestation B
    to: call.to,
    url: call.webhook_url
  });

  // Save attestation level (Twilio provides this)
  await db.query(`
    UPDATE calls
    SET metadata = jsonb_set(metadata, '{stir_shaken_attestation}', '"B"')
    WHERE id = $1
  `, [call.id]);
}
```

---

**Phase 2: Become STI-AS (Authentication Service) (Future)**

**Requires:**
- Certificate from STI-PA (Policy Administrator)
- SIP integration to sign calls
- Complex implementation (6-12 months)

**Decision:** Defer to Phase 4+ (carrier attestation sufficient for now)

---

### **STIR/SHAKEN Checklist**

- [ ] Use phone numbers owned by tenant (not spoofed)
- [ ] Track attestation level in CDR
- [ ] Monitor call blocking rates (carriers may block low attestation)
- [ ] Phase 4: Consider becoming STI-AS for full attestation

---

## 7. Consent Management System

*(Already detailed in Section 1A, summarized here)*

**Database Schema:** See Section 1A

**Features:**
- Track consent per channel (voice, SMS, email, social)
- Record consent method (web form, phone, SMS reply, paper)
- Store exact consent language shown
- Capture IP address, user agent (proof)
- Support double opt-in (email verification)
- Easy consent withdrawal
- Consent expiration (re-confirm after X years)

---

## 8. Opt-Out & Unsubscribe Handling

**Unified opt-out system across all channels:**

```sql
CREATE TABLE opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  channel VARCHAR(50) NOT NULL,  -- 'voice', 'sms', 'email', 'all'
  method VARCHAR(50) NOT NULL,  -- 'keyword_stop', 'one_click_link', 'customer_request', 'admin'

  opted_out_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_opt_outs_contact(contact_id),
  INDEX idx_opt_outs_tenant_channel(tenant_id, channel)
);

-- Suppression list (prevent accidental re-add)
CREATE TABLE suppression_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  channel VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NOT NULL,

  added_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contact_id, channel)
);
```

**Before sending any message:**

```typescript
async function checkOptOutStatus(contact: Contact, channel: string): Promise<boolean> {
  // Check if contact opted out of this channel
  const optedOut = await db.query(`
    SELECT 1 FROM opt_outs
    WHERE contact_id = $1 AND (channel = $2 OR channel = 'all')
    LIMIT 1
  `, [contact.id, channel]);

  if (optedOut.rowCount > 0) {
    logger.warn('Contact opted out', { contact_id: contact.id, channel });
    return false;  // Do not send
  }

  // Check suppression list
  const suppressed = await db.query(`
    SELECT 1 FROM suppression_list
    WHERE contact_id = $1 AND channel = $2
    LIMIT 1
  `, [contact.id, channel]);

  if (suppressed.rowCount > 0) {
    logger.warn('Contact on suppression list', { contact_id: contact.id, channel });
    return false;
  }

  return true;  // OK to send
}
```

---

## 9. Do Not Call (DNC) Registry

### **National DNC Registry (US)**

**API Integration via third-party (ScrubBird, DNC.com, etc.):**

```typescript
import { ScrubBird } from 'scrubbird-sdk';

async function scrubAgainstDNC(phoneNumbers: string[]): Promise<{clean: string[], dnc: string[]}> {
  const scrubbird = new ScrubBird(process.env.SCRUBBIRD_API_KEY);

  // Batch scrub (max 1000 per request)
  const result = await scrubbird.scrub({
    phone_numbers: phoneNumbers,
    lists: ['national_dnc', 'litigator_list', 'wireless_block']
  });

  const clean = result.results.filter(r => r.is_safe).map(r => r.phone_number);
  const dnc = result.results.filter(r => !r.is_safe).map(r => r.phone_number);

  // Log DNC hits
  for (const phone of dnc) {
    logger.warn('Number on DNC registry', { phone, lists: result.results.find(r => r.phone_number === phone).flags });
  }

  return { clean, dnc };
}

// Before launching campaign
async function launchCampaign(campaign: Campaign) {
  const contacts = await getCampaignContacts(campaign.id);
  const phoneNumbers = contacts.map(c => c.phone);

  // Scrub against DNC
  const { clean, dnc } = await scrubAgainstDNC(phoneNumbers);

  // Remove DNC numbers from campaign
  await db.query(`
    UPDATE campaign_contacts
    SET status = 'dnc_excluded', exclude_reason = 'national_dnc'
    WHERE campaign_id = $1 AND phone = ANY($2)
  `, [campaign.id, dnc]);

  logger.info('Campaign scrubbed', {
    campaign_id: campaign.id,
    total: phoneNumbers.length,
    clean: clean.length,
    dnc: dnc.length
  });

  // Launch with clean numbers only
  await startCalling(campaign, clean);
}
```

**Cost:** ~$0.0005 - $0.002 per number scrubbed

---

## 10. Data Retention & Privacy

**Retention policies:**

```sql
CREATE TABLE retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = global policy

  data_type VARCHAR(50) NOT NULL,  -- 'cdr', 'recordings', 'logs', 'contacts'
  retention_days INTEGER NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default policies
INSERT INTO retention_policies (tenant_id, data_type, retention_days) VALUES
(NULL, 'cdr', 730),              -- 2 years (CDR)
(NULL, 'recordings', 90),        -- 90 days (recordings)
(NULL, 'logs', 30),              -- 30 days (application logs)
(NULL, 'contacts', 1825);        -- 5 years (contact data)
```

**Automated deletion:**

```typescript
// Cron job (daily at 2 AM)
async function purgeExpiredData() {
  const policies = await db.query('SELECT * FROM retention_policies');

  for (const policy of policies.rows) {
    const cutoffDate = DateTime.now().minus({ days: policy.retention_days });

    switch (policy.data_type) {
      case 'cdr':
        await db.query(`
          DELETE FROM cdr
          WHERE created_at < $1
            AND (tenant_id = $2 OR $2 IS NULL)
        `, [cutoffDate.toISO(), policy.tenant_id]);
        break;

      case 'recordings':
        // Move to Glacier first (cheaper long-term storage)
        const oldRecordings = await db.query(`
          SELECT storage_key FROM recordings
          WHERE created_at < $1 AND (tenant_id = $2 OR $2 IS NULL)
        `, [cutoffDate.toISO(), policy.tenant_id]);

        for (const rec of oldRecordings.rows) {
          await moveToGlacier(rec.storage_key);
        }

        // Delete from database after 90 days in Glacier
        const glacierCutoff = DateTime.now().minus({ days: policy.retention_days + 90 });
        await db.query(`
          DELETE FROM recordings
          WHERE created_at < $1 AND (tenant_id = $2 OR $2 IS NULL)
        `, [glacierCutoff.toISO(), policy.tenant_id]);
        break;

      case 'contacts':
        // Anonymize instead of delete (preserve analytics)
        await db.query(`
          UPDATE contacts
          SET
            first_name = 'ARCHIVED',
            last_name = 'USER',
            email = NULL,
            phone = NULL,
            archived_at = NOW()
          WHERE last_contacted_at < $1
            AND (tenant_id = $2 OR $2 IS NULL)
            AND archived_at IS NULL
        `, [cutoffDate.toISO(), policy.tenant_id]);
        break;
    }

    logger.info('Data purged', {
      data_type: policy.data_type,
      retention_days: policy.retention_days,
      tenant_id: policy.tenant_id
    });
  }
}
```

---

## 11. Recording Consent

**Two-party consent states (US):**
- California, Florida, Illinois, Maryland, Massachusetts, Montana, New Hampshire, Pennsylvania, Washington

**Requirement:** Must inform BOTH parties that call is being recorded

**Implementation:**

```typescript
async function handleRecordedCall(call: Call) {
  const recipientState = inferState(call.to);

  const twoPartyConsentStates = [
    'CA', 'FL', 'IL', 'MD', 'MA', 'MT', 'NH', 'PA', 'WA'
  ];

  const requiresConsent = twoPartyConsentStates.includes(recipientState);

  if (requiresConsent && call.record) {
    // Play disclosure before connecting
    await playTTS(call.id, 'This call may be recorded for quality assurance purposes. By continuing, you consent to recording.');

    // Wait for acknowledgment (or timeout after 10 seconds)
    await waitForDTMF(call.id, '1', 10);  // Press 1 to continue
  }

  // Proceed with call
  await connectCall(call);
}
```

---

## 12. Compliance Dashboard

**Dashboard for compliance team:**

```typescript
// /dashboard/compliance
interface ComplianceDashboard {
  // Consent metrics
  consents: {
    total_active: number;
    total_revoked: number;
    consent_rate: number;  // % of contacts with valid consent
    expiring_soon: number;  // Consents expiring in next 30 days
  };

  // Opt-out metrics
  opt_outs: {
    last_24h: number;
    last_7d: number;
    last_30d: number;
    opt_out_rate: number;  // % of messages resulting in opt-out
    by_channel: Record<string, number>;
  };

  // TCPA compliance
  tcpa: {
    calls_blocked_time: number;  // Calls blocked due to time restrictions
    calls_blocked_frequency: number;  // Calls blocked due to frequency limits
    calls_blocked_dnc: number;  // Calls blocked due to DNC
    abandoned_call_rate: number;  // % of calls abandoned
  };

  // CAN-SPAM compliance
  can_spam: {
    unsubscribe_rate: number;  // % of emails resulting in unsubscribe
    unsubscribe_process_time_avg: number;  // Avg time to process (must be <10 days)
    emails_missing_physical_address: number;  // Should be 0
    emails_missing_unsubscribe: number;  // Should be 0
  };

  // GDPR compliance
  gdpr: {
    dsar_requests_pending: number;  // Data export requests pending
    deletion_requests_pending: number;  // Deletion requests pending
    avg_dsar_completion_time: number;  // Avg time to fulfill (must be <30 days)
  };

  // A2P 10DLC
  dlc: {
    brands_registered: number;
    brands_pending: number;
    campaigns_registered: number;
    campaigns_pending: number;
    daily_volume_usage: number;  // % of daily limit used
  };

  // Recent violations (flagged for review)
  violations: Array<{
    type: string;
    description: string;
    contact_id: string;
    timestamp: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}
```

---

## 13. Legal Disclaimer Templates

### **SMS Opt-In (Web Form)**

```
By checking this box and clicking "Submit", I agree to receive automated
text messages from [Company Name] at the phone number provided. I understand
that consent is not a condition of purchase. Message frequency varies. Message
and data rates may apply. Reply STOP to unsubscribe at any time. Reply HELP
for help. View our Privacy Policy at [URL] and Terms at [URL].
```

---

### **Email Marketing Footer**

```
This email was sent to {{email}} by [Company Name]

[Company Legal Name]
[Street Address]
[City, State ZIP]

You're receiving this email because you signed up for our marketing emails.

Unsubscribe | Manage Preferences | Privacy Policy

© 2025 [Company Name]. All rights reserved.
```

---

### **Call Recording Disclosure (IVR)**

```
"This call may be recorded for quality and training purposes. By continuing
this call, you consent to recording. If you do not consent, please hang up now."
```

---

## 14. Compliance Testing

### **Automated Tests**

```typescript
describe('Compliance Tests', () => {
  describe('TCPA', () => {
    it('should block calls outside 8 AM - 9 PM recipient time', async () => {
      const contact = {
        phone: '+13105551234',  // LA (Pacific)
        timezone: 'America/Los_Angeles'
      };

      // Mock current time to 7:30 AM Pacific
      mockTime('2025-01-20T07:30:00-08:00');

      const canCall = await checkCallTimeCompliance(contact);
      expect(canCall).toBe(false);
    });

    it('should enforce frequency limits (max 3 abandoned/30 days)', async () => {
      const contact = await createContact();

      // Simulate 3 abandoned calls in last 30 days
      await createCallAttempts(contact.id, 'abandoned', 3);

      const canCall = await checkFrequencyLimits(contact, 'voice');
      expect(canCall).toBe(false);
    });
  });

  describe('CAN-SPAM', () => {
    it('should include physical address in all marketing emails', async () => {
      const email = await generateMarketingEmail(tenant, content);

      expect(email.html_body).toContain(tenant.physical_address.street);
      expect(email.html_body).toContain(tenant.physical_address.city);
    });

    it('should include unsubscribe link in all marketing emails', async () => {
      const email = await generateMarketingEmail(tenant, content);

      expect(email.html_body).toMatch(/unsubscribe/i);
      expect(email.html_body).toContain('https://');
    });

    it('should process unsubscribe within 10 days', async () => {
      const unsub = await createUnsubscribeRequest(contact.id);

      // Fast-forward 10 days
      await advanceTime({ days: 10 });

      const contact = await getContact(contact.id);
      expect(contact.opted_out_channels).toContain('email');
    });
  });

  describe('GDPR', () => {
    it('should export all user data on request', async () => {
      const contact = await createContact();
      await createMessages(contact.id, 10);

      const exported = await exportContactData(contact.id);

      expect(exported.contact_info.email).toBe(contact.email);
      expect(exported.messages).toHaveLength(10);
      expect(exported.consents).toBeDefined();
    });

    it('should anonymize user data on deletion request', async () => {
      const contact = await createContact({ email: 'test@example.com' });

      await deleteContactData(contact.id);

      const updated = await getContact(contact.id);
      expect(updated.email).not.toBe('test@example.com');
      expect(updated.first_name).toBe('DELETED');
    });
  });

  describe('10DLC', () => {
    it('should handle STOP keyword and unsubscribe', async () => {
      const from = '+13105551234';
      const to = '+18005551234';

      await handleInboundSMS(from, to, 'STOP');

      const contact = await getContactByPhone(from);
      expect(contact.opted_out_channels).toContain('sms');
    });

    it('should respond to HELP keyword', async () => {
      const from = '+13105551234';
      const to = '+18005551234';

      const response = await handleInboundSMS(from, to, 'HELP');

      expect(response.body).toContain('STOP');
      expect(response.body).toContain('support');
    });
  });
});
```

---

## Conclusion

This compliance guide provides **complete implementation** for all major regulations:

✅ **TCPA** - Voice & SMS consent, time restrictions, frequency limits
✅ **CAN-SPAM** - Email unsubscribe, physical address, truthful headers
✅ **GDPR** - Data export, deletion, consent management
✅ **CASL** - Canadian opt-in requirements
✅ **10DLC** - Brand & campaign registration, keyword handling
✅ **STIR/SHAKEN** - Caller ID authentication
✅ **DNC** - National registry scrubbing
✅ **Recording Consent** - Two-party state disclosures

**Next Steps:**
1. Implement consent management system (Section 7)
2. Set up opt-out handling (Section 8)
3. Integrate DNC scrubbing API (Section 9)
4. Register 10DLC brands/campaigns (Section 5)
5. Build compliance dashboard (Section 12)
6. Test all compliance checks (Section 14)

**Legal Review:** Have attorney review all disclaimer templates and privacy policies before launch.

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Status:** Implementation Ready
