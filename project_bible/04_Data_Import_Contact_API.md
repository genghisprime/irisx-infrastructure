# IRIS Data Import & Contact Management API
## The Complete Communications Backend - Import Made Simple

> **OPTION: Use Your Own Contact Database OR Use IRIS Contact Management**
> IRIS provides world-class contact management and import tools, but you're never locked in. Use our APIs to manage contacts, or keep using your existing database and just send messages. Perfect for alert systems, emergency notifications, marketing campaigns, and more.

---

## Table of Contents

1. [Overview](#overview)
2. [Why IRIS Import Matters](#why-iris-import-matters)
3. [Architecture](#architecture)
4. [For Direct Customers (GUI Users)](#for-direct-customers-gui-users)
5. [For API Developers (Building on IRIS)](#for-api-developers-building-on-iris)
6. [Import API Reference](#import-api-reference)
7. [Contact Management API](#contact-management-api)
8. [Embeddable Import Widget](#embeddable-import-widget)
9. [White-Label Options](#white-label-options)
10. [Use Cases & Examples](#use-cases--examples)
11. [Competitive Advantage](#competitive-advantage)

---

## Overview

**IRIS provides the most comprehensive data import and contact management system in the communications industry.**

### What Makes IRIS Different?

**Twilio's Offering:**
- Voice API ✓
- SMS API ✓
- That's it. You build everything else.

**IRIS's Offering:**
- Voice API ✓
- SMS API ✓
- Email API ✓
- Social APIs (40+ channels) ✓
- **Contact Management API ✓** ← Twilio doesn't have
- **Import API ✓** ← Twilio doesn't have
- **Campaign Management ✓** ← Twilio doesn't have
- **Analytics ✓** ← Twilio doesn't have

### Developer-First Design

Every API is designed to be **stupid simple**. Get started in 5 minutes, not 5 days.

```javascript
// Import 10,000 contacts in 5 lines of code
const iris = new IRIS('your-api-key');
const result = await iris.imports.create({
  file: 'contacts.csv',
  auto_map: true  // AI figures out the fields
});
console.log(`Imported ${result.success_count} contacts`);
```

---

## Why IRIS Import Matters

### The Problem Every Developer Faces

You're building a school notification app. You need to:
1. Let schools upload their student/parent lists
2. Map CSV columns to your database fields
3. Handle duplicates (same parent for multiple kids)
4. Validate phone numbers (international formats)
5. Show upload progress
6. Handle errors gracefully
7. Preview before importing
8. Support Excel, Google Sheets, CSV

### Without IRIS Import:
- Build CSV upload UI: **2 weeks**
- Build field mapping: **1 week**
- Build duplicate detection: **1 week**
- Build validation: **1 week**
- Build error handling: **1 week**
- Build progress tracking: **1 week**
- **Total: 7 weeks (1.75 months)**

### With IRIS Import API:
- Call IRIS Import API: **1 day**
- Embed IRIS widget: **1 day**
- **Total: 2 days**

**Save 98% of development time. Ship 35x faster.**

---

## Architecture

### 5-Level Import Strategy

IRIS supports every import method from simple drag-drop to complex database synchronization:

```
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Simple Import (CSV/Excel Drag-Drop)               │
│ → For non-technical users                                   │
│ → Visual field mapping, duplicate detection UI              │
│ → Google Sheets integration                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 2: Bulk Import API                                    │
│ → For developers building on IRIS                           │
│ → POST /v1/imports with CSV/JSON                            │
│ → Auto-mapping with AI, webhook notifications               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 3: CRM Integrations                                   │
│ → Salesforce, HubSpot, Zendesk, Pipedrive                  │
│ → One-click sync, bi-directional updates                   │
│ → Zapier/Make.com for no-code users                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 4: Database Direct Connect                            │
│ → PostgreSQL, MySQL, MongoDB, SQL Server                   │
│ → Real-time sync with change data capture                  │
│ → For technical teams with existing databases              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 5: API Integrations (Webhooks)                        │
│ → Your app sends data via webhook as events occur          │
│ → Real-time contact creation/updates                        │
│ → Perfect for SaaS apps with user signups                  │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Import Jobs
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),

  -- Import Details
  filename TEXT,
  source_type TEXT NOT NULL, -- csv, excel, google_sheets, api, crm, database
  total_rows INTEGER,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL, -- pending, mapping, processing, completed, failed
  progress_percent INTEGER DEFAULT 0,

  -- Field Mapping
  field_mapping JSONB, -- { "csv_col": "db_field" }
  auto_mapped BOOLEAN DEFAULT false,

  -- Options
  duplicate_strategy TEXT, -- skip, update, create_new
  validation_rules JSONB,

  -- Results
  error_details JSONB, -- [{ row: 42, error: "Invalid phone" }]
  preview_data JSONB, -- First 10 rows for preview

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts (Enhanced)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Basic Info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,

  -- Multi-Channel Contact Points
  phone_numbers JSONB, -- [{ type: "mobile", number: "+1...", verified: true }]
  email_addresses JSONB,
  social_handles JSONB, -- { twitter: "@user", facebook: "id" }

  -- Metadata
  custom_fields JSONB, -- Flexible schema
  tags TEXT[],
  lists UUID[], -- Array of list IDs

  -- Tracking
  imported_from UUID REFERENCES import_jobs(id),
  source TEXT, -- csv, api, crm, manual, webhook
  external_id TEXT, -- ID in source system

  -- Status
  status TEXT DEFAULT 'active', -- active, unsubscribed, bounced, invalid

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_custom ON contacts USING GIN(custom_fields);
```

---

## For Direct Customers (GUI Users)

### Simple CSV/Excel Upload

**Easiest import experience in the industry. No technical knowledge required.**

#### Step 1: Upload File (Drag & Drop)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│          📁 Drag & Drop CSV or Excel File               │
│                                                         │
│              or click to browse                         │
│                                                         │
│   Supported: CSV, Excel (.xlsx), Google Sheets         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Step 2: AI-Powered Field Mapping

IRIS automatically detects fields with 95%+ accuracy:

```
Your CSV Column          →    IRIS Field
─────────────────────────────────────────────────
First Name               →    First Name      ✓
Last Name                →    Last Name       ✓
Email Address            →    Email           ✓
Cell Phone               →    Phone (Mobile)  ✓
Parent Name              →    Custom Field    ⚙️
Student Grade            →    Custom Field    ⚙️
Emergency Contact        →    Custom Field    ⚙️
```

**💡 Smart Detection:**
- Recognizes "Cell", "Mobile", "Phone" as phone fields
- Detects international formats (+1, +44, etc.)
- Identifies email even if column is "Email Address" or "E-mail"
- Suggests custom fields for unmapped columns

#### Step 3: Duplicate Detection

**Choose how to handle duplicates:**

```
○ Skip duplicates (keep existing data)
● Update duplicates (overwrite with new data)
○ Create new records (allow duplicates)

Duplicate Detection By:
☑ Phone Number (recommended)
☑ Email Address
☐ Custom Field: Student ID
```

#### Step 4: Preview Before Import

**See exactly what will be imported:**

```
Preview: First 10 of 1,247 rows

✓ John Smith      +1-555-0101    john@example.com
✓ Jane Doe        +1-555-0102    jane@example.com
⚠ Bob Johnson     555-INVALID    bob@example.com  ← Invalid phone
✓ Alice Williams  +1-555-0104    alice@example.com
...

Issues Found:
⚠ 3 rows with invalid phone numbers (will skip)
⚠ 12 rows with missing email (will import without email)

[ Cancel ]  [ Fix Issues ]  [ Import Anyway ]
```

#### Step 5: Import Progress

**Real-time progress tracking:**

```
Importing contacts... 847 / 1,247 (68%)

[████████████████░░░░░░░░] 68%

✓ 847 imported successfully
⚠ 3 skipped (invalid data)
⊕ 12 duplicates updated

Estimated time remaining: 23 seconds
```

#### Step 6: Import Complete

```
✓ Import Complete!

📊 Results:
  ✓ 1,232 contacts imported successfully
  ⚠ 3 rows skipped (invalid phone numbers)
  ⊕ 12 duplicates updated

📥 Download error report (3 rows)
📋 View imported contacts
🔄 Import another file
```

### Google Sheets Integration

**Sync directly from Google Sheets - no file upload needed.**

```javascript
// User clicks "Connect Google Sheets"
// OAuth flow connects their Google account
// Select sheet:

Connected Sheets:
☐ Students 2024-2025 (1,247 rows)
☐ Parent Contact List (892 rows)
☑ Emergency Contacts (1,543 rows)

[ ] Auto-sync every 1 hour
[ ] One-time import

[ Connect ]
```

---

## For API Developers (Building on IRIS)

### Quick Start (5 Minutes)

**Goal: Import 10,000 contacts into your app with zero UI development.**

#### Install SDK

```bash
npm install @iris/sdk
# or
pip install iris-sdk
# or
composer require iris/sdk
```

#### Import Contacts (3 Lines)

```javascript
import IRIS from '@iris/sdk';

const iris = new IRIS('sk_live_...');

// Option 1: Upload CSV file
const result = await iris.imports.create({
  file: './contacts.csv',
  auto_map: true  // AI figures out the fields
});

console.log(`Imported ${result.success_count} contacts`);
// → Imported 9,847 contacts
```

**That's it. You're done.**

---

### Bulk Import API

#### Basic Import (CSV/JSON)

```javascript
// POST /v1/imports

const response = await fetch('https://api.iris.com/v1/imports', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk_live_...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    source: 'csv',
    file_url: 'https://yourapp.com/contacts.csv',
    // or inline data:
    data: [
      { first_name: 'John', phone: '+1-555-0101', email: 'john@example.com' },
      { first_name: 'Jane', phone: '+1-555-0102', email: 'jane@example.com' }
    ],
    options: {
      auto_map: true,
      duplicate_strategy: 'update',
      duplicate_key: 'phone',
      validate_phone: true,
      webhook_url: 'https://yourapp.com/webhooks/import-complete'
    }
  })
});

const job = await response.json();
console.log(job);
// {
//   id: 'imp_abc123',
//   status: 'processing',
//   total_rows: 10000,
//   progress_percent: 0
// }
```

#### Check Import Status

```javascript
// GET /v1/imports/:id

const status = await iris.imports.get('imp_abc123');
console.log(status);
// {
//   id: 'imp_abc123',
//   status: 'completed',
//   total_rows: 10000,
//   success_count: 9847,
//   error_count: 3,
//   duplicate_count: 150,
//   progress_percent: 100,
//   errors: [
//     { row: 42, error: 'Invalid phone number: 555-INVALID' },
//     { row: 108, error: 'Missing required field: phone' },
//     { row: 956, error: 'Invalid email format' }
//   ]
// }
```

#### Webhook Notification

**When import completes, IRIS calls your webhook:**

```javascript
// POST https://yourapp.com/webhooks/import-complete
{
  event: 'import.completed',
  import_id: 'imp_abc123',
  status: 'completed',
  success_count: 9847,
  error_count: 3,
  duplicate_count: 150
}
```

---

### Advanced Field Mapping

**If auto-mapping doesn't work, specify exact field mapping:**

```javascript
await iris.imports.create({
  file: 'students.csv',
  field_mapping: {
    // CSV Column → IRIS Field
    'First Name': 'first_name',
    'Last Name': 'last_name',
    'Parent Cell': 'phone',
    'Parent Email': 'email',
    'Student Grade': 'custom_fields.grade',
    'Student ID': 'custom_fields.student_id',
    'Emergency Contact': 'custom_fields.emergency_phone'
  },
  duplicate_strategy: 'update',
  duplicate_key: 'custom_fields.student_id'  // Use Student ID as unique key
});
```

---

### Custom Validation Rules

```javascript
await iris.imports.create({
  file: 'contacts.csv',
  validation: {
    phone: {
      required: true,
      format: 'E164',  // +1-555-0101
      countries: ['US', 'CA']  // Only accept US/Canada
    },
    email: {
      required: false,
      verify_dns: true  // Check if domain has MX records
    },
    custom_fields: {
      age: {
        type: 'number',
        min: 18,
        max: 120
      },
      grade: {
        type: 'enum',
        values: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
      }
    }
  }
});
```

---

## Contact Management API

### Create Contact

**Super simple - just phone and/or email required:**

```javascript
// POST /v1/contacts

const contact = await iris.contacts.create({
  first_name: 'John',
  last_name: 'Smith',
  phone: '+1-555-0101',
  email: 'john@example.com',
  tags: ['student', 'grade-5'],
  custom_fields: {
    student_id: 'STU12345',
    grade: '5',
    parent_name: 'Jane Smith',
    emergency_contact: '+1-555-0199'
  }
});

console.log(contact.id); // → con_abc123
```

### Update Contact

```javascript
// PATCH /v1/contacts/:id

await iris.contacts.update('con_abc123', {
  tags: ['student', 'grade-6'],  // Updated grade
  custom_fields: {
    grade: '6'
  }
});
```

### Get Contact

```javascript
// GET /v1/contacts/:id

const contact = await iris.contacts.get('con_abc123');
console.log(contact);
// {
//   id: 'con_abc123',
//   first_name: 'John',
//   last_name: 'Smith',
//   phone: '+1-555-0101',
//   email: 'john@example.com',
//   tags: ['student', 'grade-6'],
//   custom_fields: { ... }
// }
```

### List Contacts (with Filters)

```javascript
// GET /v1/contacts?tag=grade-5&limit=100

const contacts = await iris.contacts.list({
  tag: 'grade-5',
  limit: 100,
  offset: 0
});

console.log(contacts.data.length); // → 100
console.log(contacts.total); // → 1,247
```

### Search Contacts

**Full-text search with fuzzy matching:**

```javascript
// GET /v1/contacts/search?q=john+smith

const results = await iris.contacts.search('john smith');
console.log(results);
// [
//   { id: 'con_abc123', name: 'John Smith', score: 0.95 },
//   { id: 'con_def456', name: 'John Smythe', score: 0.82 },
//   { id: 'con_ghi789', name: 'Johnny Smith', score: 0.78 }
// ]
```

### Delete Contact

```javascript
// DELETE /v1/contacts/:id

await iris.contacts.delete('con_abc123');
```

---

## List & Segment Management API

### Create List

```javascript
// POST /v1/lists

const list = await iris.lists.create({
  name: 'Grade 5 Students',
  description: 'All students in 5th grade',
  type: 'static'  // or 'dynamic' for auto-updating
});

console.log(list.id); // → lst_abc123
```

### Add Contacts to List

```javascript
// POST /v1/lists/:id/contacts

await iris.lists.addContacts('lst_abc123', {
  contact_ids: ['con_abc', 'con_def', 'con_ghi']
});
```

### Create Dynamic Segment

**Auto-updates based on rules:**

```javascript
const segment = await iris.lists.create({
  name: 'High School Students',
  type: 'dynamic',
  rules: {
    all: [  // AND condition
      { field: 'tags', operator: 'contains', value: 'student' },
      { field: 'custom_fields.grade', operator: 'in', value: ['9', '10', '11', '12'] }
    ]
  }
});

// Segment auto-updates as students advance grades
```

---

## Tag Management API

### Add Tags to Contact

```javascript
// POST /v1/contacts/:id/tags

await iris.contacts.addTags('con_abc123', ['vip', 'attended-event-2024']);
```

### Remove Tags

```javascript
// DELETE /v1/contacts/:id/tags

await iris.contacts.removeTags('con_abc123', ['attended-event-2024']);
```

### Get All Tags

```javascript
// GET /v1/tags

const tags = await iris.tags.list();
console.log(tags);
// [
//   { name: 'student', count: 1247 },
//   { name: 'parent', count: 892 },
//   { name: 'staff', count: 143 }
// ]
```

---

## Export API

**Reverse of import - export contacts to CSV/Excel:**

```javascript
// POST /v1/exports

const exportJob = await iris.exports.create({
  format: 'csv',  // or 'excel', 'json'
  filters: {
    tags: ['grade-5']
  },
  fields: ['first_name', 'last_name', 'phone', 'email', 'custom_fields.grade'],
  webhook_url: 'https://yourapp.com/webhooks/export-complete'
});

console.log(exportJob);
// {
//   id: 'exp_abc123',
//   status: 'processing',
//   download_url: null  // Available when complete
// }

// When complete, webhook receives:
// {
//   event: 'export.completed',
//   export_id: 'exp_abc123',
//   download_url: 'https://iris-exports.s3.amazonaws.com/...',
//   expires_at: '2024-10-29T12:00:00Z'  // 24 hours
// }
```

---

## Embeddable Import Widget

### The Easiest Way to Add Import to Your App

**Drop-in UI component - zero backend code needed.**

#### JavaScript (Vanilla)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.iris.com/import-widget.js"></script>
</head>
<body>
  <div id="iris-import"></div>

  <script>
    const widget = new IRISImport({
      apiKey: 'pk_live_...',
      container: '#iris-import',
      onComplete: (result) => {
        console.log(`Imported ${result.success_count} contacts`);
        // Redirect to your contacts page
        window.location.href = '/contacts';
      }
    });
  </script>
</body>
</html>
```

#### React

```jsx
import { IRISImportWidget } from '@iris/react';

function ContactsImportPage() {
  return (
    <div>
      <h1>Import Contacts</h1>
      <IRISImportWidget
        apiKey="pk_live_..."
        onComplete={(result) => {
          alert(`Imported ${result.success_count} contacts`);
          navigate('/contacts');
        }}
        onError={(error) => {
          alert(`Import failed: ${error.message}`);
        }}
      />
    </div>
  );
}
```

#### Vue

```vue
<template>
  <div>
    <h1>Import Contacts</h1>
    <IRISImportWidget
      :api-key="apiKey"
      @complete="onImportComplete"
      @error="onImportError"
    />
  </div>
</template>

<script>
import { IRISImportWidget } from '@iris/vue';

export default {
  components: { IRISImportWidget },
  data() {
    return {
      apiKey: 'pk_live_...'
    };
  },
  methods: {
    onImportComplete(result) {
      alert(`Imported ${result.success_count} contacts`);
      this.$router.push('/contacts');
    },
    onImportError(error) {
      alert(`Import failed: ${error.message}`);
    }
  }
};
</script>
```

#### Angular

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-import',
  template: `
    <h1>Import Contacts</h1>
    <iris-import-widget
      [apiKey]="apiKey"
      (complete)="onImportComplete($event)"
      (error)="onImportError($event)">
    </iris-import-widget>
  `
})
export class ImportComponent {
  apiKey = 'pk_live_...';

  onImportComplete(result: any) {
    alert(`Imported ${result.success_count} contacts`);
    this.router.navigate(['/contacts']);
  }

  onImportError(error: any) {
    alert(`Import failed: ${error.message}`);
  }
}
```

### Widget Configuration

```javascript
const widget = new IRISImport({
  apiKey: 'pk_live_...',
  container: '#iris-import',

  // Customization
  theme: 'light',  // or 'dark'
  primaryColor: '#007bff',

  // Features
  allowedSources: ['csv', 'excel', 'google_sheets'],  // Limit upload types
  maxFileSize: 10 * 1024 * 1024,  // 10 MB

  // Field Mapping
  requiredFields: ['phone'],  // Phone is required
  customFields: [
    { name: 'student_id', label: 'Student ID', type: 'text' },
    { name: 'grade', label: 'Grade', type: 'select', options: ['K', '1', '2', ...] }
  ],

  // Duplicate Handling
  defaultDuplicateStrategy: 'update',
  duplicateKey: 'phone',

  // Callbacks
  onStart: () => console.log('Import started'),
  onProgress: (percent) => console.log(`Progress: ${percent}%`),
  onComplete: (result) => console.log('Import complete', result),
  onError: (error) => console.error('Import failed', error)
});
```

---

## White-Label Options

### Enterprise White-Label ($499/month)

**Rebrand the import widget as your own product:**

```javascript
const widget = new IRISImport({
  apiKey: 'pk_live_...',
  branding: {
    logo: 'https://yourapp.com/logo.png',
    companyName: 'YourApp',
    primaryColor: '#007bff',
    hideIRISBranding: true  // Removes "Powered by IRIS"
  }
});
```

**Custom Domain:**
```
Instead of: https://import.iris.com/widget.js
Your domain: https://import.yourapp.com/widget.js
```

**Email Notifications:**
```
From: noreply@yourapp.com (instead of IRIS)
Subject: Import Complete - 1,247 contacts imported
```

---

## Use Cases & Examples

### 1. School Alert System

**Import students, parents, staff - send emergency alerts.**

```javascript
// Import students from school database
const students = await iris.imports.create({
  file: 'students-2024.csv',
  field_mapping: {
    'Student ID': 'custom_fields.student_id',
    'First Name': 'first_name',
    'Last Name': 'last_name',
    'Grade': 'custom_fields.grade',
    'Parent Name': 'custom_fields.parent_name',
    'Parent Cell': 'phone',  // This is who gets alerts
    'Parent Email': 'email'
  },
  tags: ['student', 'active'],
  duplicate_key: 'custom_fields.student_id'
});

// Send emergency alert
await iris.messages.send({
  to: { tag: 'student' },  // All students
  channels: ['sms', 'voice', 'email'],  // Multi-channel
  message: 'EMERGENCY: School closed due to severe weather. All after-school activities cancelled.',
  priority: 'urgent'
});
```

### 2. E-Commerce Order Notifications

**Import customers, send order updates.**

```javascript
// When customer places order in your app
await iris.contacts.upsert({
  external_id: customer.id,  // Your customer ID
  phone: customer.phone,
  email: customer.email,
  first_name: customer.first_name,
  tags: ['customer'],
  custom_fields: {
    total_orders: customer.order_count,
    lifetime_value: customer.ltv
  }
});

// Send order confirmation
await iris.messages.send({
  to: { phone: customer.phone },
  template: 'order-confirmation',
  variables: {
    order_id: order.id,
    total: order.total,
    items: order.items
  }
});
```

### 3. SaaS User Onboarding

**Import signups, send onboarding sequence.**

```javascript
// Webhook when user signs up in your SaaS app
app.post('/webhooks/user-signup', async (req) => {
  const user = req.body;

  // Add to IRIS
  await iris.contacts.create({
    external_id: user.id,
    email: user.email,
    phone: user.phone,
    tags: ['trial-user'],
    custom_fields: {
      plan: user.plan,
      signup_date: user.created_at
    }
  });

  // Start onboarding sequence
  await iris.campaigns.enroll(user.id, 'onboarding-sequence');
});
```

### 4. Healthcare Appointment Reminders

**Import patients, send appointment reminders (HIPAA-compliant).**

```javascript
// Import patients from EMR system
const patients = await iris.imports.create({
  source: 'database',
  connection: {
    type: 'postgresql',
    host: 'emr-db.hospital.com',
    database: 'patients',
    query: `
      SELECT
        patient_id,
        first_name,
        last_name,
        phone,
        email,
        date_of_birth
      FROM patients
      WHERE active = true
    `
  },
  field_mapping: {
    'patient_id': 'custom_fields.patient_id',
    'first_name': 'first_name',
    'last_name': 'last_name',
    'phone': 'phone',
    'email': 'email',
    'date_of_birth': 'custom_fields.dob'
  },
  encryption: true,  // HIPAA-compliant encryption
  tags: ['patient']
});

// Send appointment reminder
await iris.messages.send({
  to: { external_id: 'PAT12345' },
  template: 'appointment-reminder',
  variables: {
    patient_name: 'John Smith',
    appointment_date: '2024-11-15',
    appointment_time: '2:30 PM',
    doctor_name: 'Dr. Sarah Johnson'
  },
  hipaa_compliant: true  // Enables encryption, secure logging
});
```

### 5. Real Estate Agent Listings

**Import leads, send new listing alerts.**

```javascript
// Import leads from CRM
const leads = await iris.imports.create({
  source: 'salesforce',
  object: 'Lead',
  filters: {
    Status: 'Active',
    LeadSource: 'Website'
  },
  field_mapping: {
    'FirstName': 'first_name',
    'LastName': 'last_name',
    'Phone': 'phone',
    'Email': 'email',
    'Budget__c': 'custom_fields.budget',
    'PreferredLocation__c': 'custom_fields.location'
  }
});

// Send new listing alert
await iris.messages.send({
  to: {
    custom_fields: {
      location: 'Downtown',
      budget: { gte: 500000, lte: 700000 }
    }
  },
  template: 'new-listing',
  variables: {
    address: '123 Main St',
    price: '$650,000',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 2100
  }
});
```

---

## Competitive Advantage

### IRIS vs Twilio vs Plivo

| Feature | IRIS | Twilio | Plivo |
|---------|------|--------|-------|
| **SMS API** | ✓ | ✓ | ✓ |
| **Voice API** | ✓ | ✓ | ✓ |
| **Email API** | ✓ | ✗ | ✗ |
| **Social APIs (40+ channels)** | ✓ | ✗ | ✗ |
| **Contact Management** | ✓ | ✗ | ✗ |
| **Import API** | ✓ | ✗ | ✗ |
| **Embeddable Import Widget** | ✓ | ✗ | ✗ |
| **Campaign Management** | ✓ | ✗ | ✗ |
| **Analytics Dashboard** | ✓ | Basic | Basic |
| **Multi-Channel Unified API** | ✓ | ✗ | ✗ |
| **White-Label Option** | ✓ | ✗ | ✗ |
| **Pricing** | **40-60% cheaper** | Expensive | Moderate |

### Time to Value

**Building a School Alert System:**

| Task | DIY + Twilio | IRIS |
|------|-------------|------|
| Setup messaging API | 1 day | 5 minutes |
| Build contact database | 2 weeks | 0 (use IRIS) |
| Build import UI | 2 weeks | 0 (use widget) |
| Build field mapping | 1 week | 0 (auto-mapped) |
| Build duplicate detection | 1 week | 0 (built-in) |
| Build validation | 1 week | 0 (built-in) |
| Build campaign management | 3 weeks | 5 minutes |
| Build analytics | 2 weeks | 0 (built-in) |
| **Total Time** | **12 weeks** | **1 day** |

**IRIS gets you to market 98% faster.**

---

## Developer Experience Principles

### 1. Stupid Simple APIs

Every API should be usable in 5 lines of code or less.

**Bad (Twilio-style):**
```javascript
// 30 lines just to send a message
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

client.messages
  .create({
    body: 'Hello World',
    from: '+15551234567',
    to: '+15559876543'
  })
  .then(message => console.log(message.sid));
```

**Good (IRIS-style):**
```javascript
// 3 lines to send a message
import IRIS from '@iris/sdk';
const iris = new IRIS('sk_live_...');
await iris.send({ to: '+1-555-9876543', message: 'Hello World' });
```

### 2. Smart Defaults

Never make developers configure things that can be inferred.

```javascript
// Auto-detects channel based on recipient format
await iris.send({ to: '+1-555-0101', message: 'SMS' });  // Sends SMS
await iris.send({ to: 'user@example.com', message: 'Email' });  // Sends Email
await iris.send({ to: '@twitter', message: 'Twitter DM' });  // Sends Twitter DM
```

### 3. Consistent Patterns

All APIs follow the same structure.

```javascript
// Contacts
await iris.contacts.create({ ... });
await iris.contacts.get(id);
await iris.contacts.update(id, { ... });
await iris.contacts.delete(id);

// Lists
await iris.lists.create({ ... });
await iris.lists.get(id);
await iris.lists.update(id, { ... });
await iris.lists.delete(id);

// Campaigns
await iris.campaigns.create({ ... });
await iris.campaigns.get(id);
await iris.campaigns.update(id, { ... });
await iris.campaigns.delete(id);
```

### 4. Helpful Errors

Errors tell you exactly what's wrong and how to fix it.

```javascript
{
  error: {
    code: 'invalid_phone',
    message: 'Phone number "+1-555-INVALID" is not a valid E.164 format',
    fix: 'Use format: +1-555-0101',
    docs: 'https://docs.iris.com/phone-formats'
  }
}
```

### 5. Interactive Docs

Every API endpoint has a "Try It" button.

```
GET /v1/contacts/:id

Try it now:
┌────────────────────────────────────┐
│ Contact ID: con_abc123             │
│ API Key: sk_live_...               │
│                                    │
│ [ Run Request ]                    │
└────────────────────────────────────┘

Response:
{
  "id": "con_abc123",
  "first_name": "John",
  ...
}
```

---

## OPTION: Use Your Own Database

**You don't have to use IRIS contact management.**

### Scenario: You Have an Existing Database

**Perfect. Keep using it. IRIS is just the messaging layer.**

```javascript
// Your existing database
const students = await db.query('SELECT * FROM students WHERE grade = 5');

// Send via IRIS without importing
for (const student of students) {
  await iris.send({
    to: student.parent_phone,
    message: `Hi ${student.parent_name}, this is a reminder about tomorrow's field trip.`
  });
}
```

**Or use bulk send:**

```javascript
const students = await db.query('SELECT * FROM students WHERE grade = 5');

await iris.messages.sendBulk({
  recipients: students.map(s => ({
    phone: s.parent_phone,
    variables: {
      parent_name: s.parent_name,
      student_name: s.first_name
    }
  })),
  template: 'field-trip-reminder'
});
```

### When to Use IRIS Contact Management

**Use IRIS contacts when:**
- You don't have a database yet (new app)
- You want IRIS to handle duplicates, validation, segmentation
- You want to use the embeddable import widget
- You want to use dynamic segments and tags

**Use your own database when:**
- You already have a robust contact database
- You have complex relational data (students → parents → teachers)
- You want full control over schema and queries

**Either way works perfectly. IRIS is flexible.**

---

## Pricing

### Import API Pricing

**Always free. No per-row charges.**

| Feature | Price |
|---------|-------|
| CSV/Excel Import | Free |
| Google Sheets Import | Free |
| Bulk Import API | Free |
| CRM Integrations | Free |
| Database Direct Connect | Free |
| Embeddable Widget | Free |
| Contact Storage (first 10K contacts) | Free |
| Contact Storage (per 10K contacts) | $5/month |

**Example:**
- 50,000 contacts stored: **$25/month**
- Unlimited imports: **$0**
- Unlimited exports: **$0**

### White-Label Pricing

| Feature | Price |
|---------|-------|
| White-Label Import Widget | $499/month |
| Custom Domain (import.yourapp.com) | Included |
| Remove IRIS Branding | Included |
| Custom Logo & Colors | Included |
| Custom Email Notifications | Included |

---

## Summary

**IRIS provides the most comprehensive data import and contact management system in the communications industry.**

### For Direct Customers:
- ✓ Drag-drop CSV/Excel upload (easiest in the industry)
- ✓ AI-powered field mapping (95%+ accuracy)
- ✓ Duplicate detection with multiple strategies
- ✓ Google Sheets integration
- ✓ Real-time progress tracking
- ✓ Preview before import

### For API Developers:
- ✓ Bulk Import API (import 10K contacts in 3 lines of code)
- ✓ Embeddable import widget (React, Vue, Angular, vanilla JS)
- ✓ White-label options for enterprise
- ✓ Contact CRUD APIs
- ✓ List/Segment management
- ✓ Tag management
- ✓ Export API

### Competitive Advantages:
- ✓ **98% faster time to market** vs DIY + Twilio
- ✓ **40-60% cheaper** than competitors
- ✓ **Complete communications backend** (not just messaging APIs)
- ✓ **Developer-first design** (5-minute quickstart)
- ✓ **OPTION: Use your own database OR IRIS contact management**

---

## Next Steps

1. **Get API Keys**: [Sign up for IRIS](https://iris.com/signup)
2. **Read Full Docs**: [docs.iris.com/import-api](https://docs.iris.com/import-api)
3. **Try Interactive Playground**: [playground.iris.com](https://playground.iris.com)
4. **Watch Video Tutorial**: [youtube.com/iris-import-demo](https://youtube.com/iris-import-demo)
5. **Join Developer Slack**: [slack.iris.com](https://slack.iris.com)

**Questions? Email: developers@iris.com**

---

**IRIS: The Complete Communications Backend**
**Stop building infrastructure. Start building features.**
