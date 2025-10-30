# Week 13-14: Email Channel Expansion Plan

**Status:** 📋 Planning
**Duration:** 2 weeks
**Goal:** Expand email functionality beyond basic API with advanced features

---

## Current State Analysis

### ✅ What Already Exists (Week 11-12)

**API Endpoints (13 endpoints):**
- `POST /v1/email/send` - Send basic email
- `POST /v1/email/send-template` - Send template email
- `GET /v1/email/:id` - Get email details
- `GET /v1/email` - List emails
- `GET /v1/email/stats` - Email statistics
- `POST /v1/email/templates` - Create template
- `GET /v1/email/templates` - List templates
- `GET /v1/email/templates/:slug` - Get template
- `PUT /v1/email/templates/:slug` - Update template
- `DELETE /v1/email/templates/:slug` - Delete template
- `POST /v1/email/webhooks/sendgrid` - SendGrid webhook
- `POST /v1/email/unsubscribe` - Unsubscribe

**Database Tables:**
- `emails` - Email records
- `email_templates` - Template storage
- `email_events` - Tracking events (opens, clicks, bounces)
- `email_attachments` - File attachments
- `email_unsubscribes` - Opt-out management

**Features:**
- Multi-provider support (Elastic Email, SendGrid, Resend, SES, Postmark, Mailgun)
- Template engine with {{variable}} substitution
- Open/click tracking
- Bounce/unsubscribe handling
- NATS queue for async sending
- Email worker for processing

**Customer Portal:**
- `EmailCampaigns.vue` (535 lines) - Basic email tracking with opens/clicks/bounces

---

## ❌ What's Missing (Week 13-14 Goals)

### 1. Inbound Email Processing
**Current:** Can only SEND emails
**Goal:** Receive emails, parse, and route to webhooks/API

**Features Needed:**
- Inbound email webhook receiver
- MIME email parser
- Attachment extraction and S3 storage
- Reply-to threading
- Spam filtering
- Auto-responder support

**Use Cases:**
- Customer replies to support emails → route to ticket system
- Email-to-SMS gateway (send email, get SMS)
- Voicemail transcriptions via email
- Contact form submissions

### 2. Advanced Email Templates UI
**Current:** Templates exist in database, basic CRUD via API
**Goal:** Visual template builder in Customer Portal

**Features Needed:**
- Rich text editor (Quill or TipTap)
- Template variables picker
- Preview with sample data
- Version history
- Duplicate/clone templates
- Template categories/folders
- Search and filter templates

### 3. Email Campaign Builder
**Current:** Basic campaign management exists
**Goal:** Full-featured campaign builder

**Features Needed:**
- Visual campaign workflow builder
- A/B testing support
- Drip campaign sequencing
- Contact list segmentation
- Schedule sending (timezone-aware)
- Send time optimization
- Unsubscribe link injection
- Campaign analytics dashboard

### 4. Enhanced Email Analytics
**Current:** Basic stats (sent, opens, clicks, bounces)
**Goal:** Comprehensive analytics dashboard

**Features Needed:**
- Real-time delivery tracking
- Engagement heatmaps (time of day, day of week)
- Geographic analytics
- Device/client analytics
- Link click breakdown
- Bounce reason analysis
- Spam complaint tracking
- ROI tracking (for e-commerce integrations)

### 5. Email Automation Rules
**Current:** Manual sending only
**Goal:** Trigger-based automation

**Features Needed:**
- Trigger rules (new user → welcome email)
- Time-based triggers (7 days after signup → reminder)
- Behavior triggers (abandoned cart → reminder)
- Conditional logic
- Multi-step workflows
- Delay between steps

### 6. Email Deliverability Tools
**Current:** Basic provider health monitoring
**Goal:** Advanced deliverability optimization

**Features Needed:**
- SPF/DKIM/DMARC checker
- Domain reputation monitoring
- Bounce categorization (hard vs soft)
- Suppression list management
- Email validation API (syntax, MX, disposable)
- Send reputation score per tenant

---

## Implementation Plan

### Phase 1: Inbound Email Processing (Days 1-3)

#### Backend Tasks:
1. **Inbound Webhook Receiver**
   - File: `api/src/routes/email-inbound.js`
   - Endpoint: `POST /v1/email/inbound/webhook`
   - Parse SendGrid/Mailgun/SES inbound format
   - Extract headers, body, attachments
   - Store in database

2. **Email Parser Service**
   - File: `api/src/services/email-parser.js`
   - Parse MIME emails
   - Extract HTML/plain text
   - Handle multipart messages
   - Extract attachments

3. **Attachment Storage**
   - S3 upload for email attachments
   - Generate secure download URLs
   - Virus scanning integration (ClamAV or VirusTotal API)

4. **Reply Threading**
   - Parse `In-Reply-To` and `References` headers
   - Link replies to original emails
   - Build conversation threads

#### Database Changes:
```sql
-- Add to emails table
ALTER TABLE emails ADD COLUMN direction VARCHAR(10) DEFAULT 'outbound'; -- 'inbound' or 'outbound'
ALTER TABLE emails ADD COLUMN thread_id UUID;
ALTER TABLE emails ADD COLUMN in_reply_to VARCHAR(255);
ALTER TABLE emails ADD COLUMN raw_email_s3_key TEXT; -- Full MIME email in S3

-- New table for inbound routing rules
CREATE TABLE email_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  from_pattern VARCHAR(255), -- email regex pattern
  to_pattern VARCHAR(255),
  subject_pattern VARCHAR(255),
  webhook_url TEXT,
  forward_to_email VARCHAR(255),
  auto_response_template_id UUID REFERENCES email_templates(id),
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### API Endpoints:
- `POST /v1/email/inbound/webhook` - Receive inbound emails
- `GET /v1/email/:id/raw` - Get raw MIME email
- `GET /v1/email/:id/thread` - Get email conversation thread
- `POST /v1/email/routing-rules` - Create routing rule
- `GET /v1/email/routing-rules` - List routing rules
- `PUT /v1/email/routing-rules/:id` - Update routing rule
- `DELETE /v1/email/routing-rules/:id` - Delete routing rule

### Phase 2: Template Builder UI (Days 4-5)

#### Frontend Component:
**File:** `irisx-customer-portal/src/views/EmailTemplates.vue` (600+ lines)

**Features:**
- Template list with search/filter
- Create/edit/delete templates
- Rich text editor (TipTap)
- Variable picker sidebar
- Live preview with sample data
- Template categories
- Version history

**UI Sections:**
1. **Template List** (left sidebar)
   - Search bar
   - Category filter
   - Sort by name/date
   - Create new button

2. **Template Editor** (main area)
   - Template name input
   - Subject line input
   - Rich text editor
   - Variable picker ({{first_name}}, {{company}}, etc.)
   - HTML/Preview toggle

3. **Preview Panel** (right sidebar)
   - Live preview with sample data
   - Desktop/mobile toggle
   - Test send button

**Dependencies:**
```bash
npm install @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-placeholder
```

### Phase 3: Email Campaign Builder (Days 6-8)

#### Frontend Component:
**File:** `irisx-customer-portal/src/views/EmailCampaignBuilder.vue` (800+ lines)

**Features:**
- Campaign wizard (4 steps)
- Contact list selection
- Template selection
- Scheduling options
- A/B testing setup
- Send and track

**Wizard Steps:**
1. **Campaign Details**
   - Name, description
   - Campaign type (one-time, drip, A/B test)

2. **Recipients**
   - Contact list selection
   - Segmentation filters
   - Estimated recipients count
   - Preview recipient list

3. **Content**
   - Template selection or create new
   - A/B test variants (if enabled)
   - Personalization preview

4. **Schedule & Send**
   - Send now or schedule
   - Timezone selection
   - Send time optimization toggle
   - Review and launch

**Backend Changes:**
- Update `campaigns` table with new fields
- Add A/B test tracking
- Add campaign scheduling queue

### Phase 4: Enhanced Analytics Dashboard (Days 9-10)

#### Frontend Component:
**File:** `irisx-customer-portal/src/views/EmailAnalytics.vue` (700+ lines)

**Features:**
- Real-time metrics cards
- Engagement timeline chart
- Geographic heatmap
- Device breakdown pie chart
- Link click analysis
- Bounce reason breakdown

**Metrics Displayed:**
- Sent, Delivered, Bounced (hard/soft)
- Opens (unique/total), Open rate
- Clicks (unique/total), Click rate
- Unsubscribes, Spam complaints
- Engagement score

**Charts:**
1. **Timeline Chart** (Chart.js)
   - Last 30 days
   - Sent, Delivered, Opened, Clicked

2. **Geographic Map** (Vue Leaflet)
   - Opens by country
   - Clicks by country

3. **Device Breakdown**
   - Desktop, Mobile, Tablet
   - Email clients (Gmail, Outlook, Apple Mail)

4. **Link Heatmap**
   - Click tracking per link
   - Most clicked links

### Phase 5: Email Automation Engine (Days 11-13)

#### Backend Service:
**File:** `api/src/services/email-automation.js` (500+ lines)

**Features:**
- Trigger evaluation engine
- Rule matching
- Workflow execution
- Delay handling

**Trigger Types:**
1. **Event-based:**
   - New user created → Welcome email
   - Call completed → Follow-up email
   - SMS bounced → Email notification

2. **Time-based:**
   - 7 days after signup → Check-in email
   - 30 days no activity → Re-engagement email
   - Birthday → Birthday email

3. **Behavior-based:**
   - Email opened but not clicked → Reminder
   - Link clicked → Next step email
   - Unsubscribed → Exit survey

**Database Tables:**
```sql
CREATE TABLE email_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'event', 'time', 'behavior'
  trigger_config JSONB NOT NULL, -- trigger-specific config
  conditions JSONB, -- optional conditions
  actions JSONB NOT NULL, -- array of actions to perform
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE email_automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES email_automation_rules(id),
  contact_id UUID,
  triggered_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(20), -- 'pending', 'running', 'completed', 'failed'
  error_message TEXT
);
```

**API Endpoints:**
- `POST /v1/email/automation/rules` - Create automation rule
- `GET /v1/email/automation/rules` - List rules
- `PUT /v1/email/automation/rules/:id` - Update rule
- `DELETE /v1/email/automation/rules/:id` - Delete rule
- `GET /v1/email/automation/executions` - List executions
- `POST /v1/email/automation/rules/:id/test` - Test rule

### Phase 6: Deliverability Tools (Days 14)

#### Frontend Component:
**File:** `irisx-customer-portal/src/views/EmailDeliverability.vue` (500+ lines)

**Features:**
1. **Domain Health Check**
   - SPF record status
   - DKIM record status
   - DMARC record status
   - MX record validation
   - Reputation score

2. **Suppression List Manager**
   - View suppressed emails
   - Remove from suppression
   - Bulk import/export
   - Suppression reasons

3. **Email Validator**
   - Validate single email
   - Bulk validation
   - Check syntax, MX records, disposable domains
   - Risk score

4. **Bounce Analysis**
   - Hard vs soft bounces
   - Bounce categories (invalid, full mailbox, spam)
   - Actionable insights

**Backend Service:**
**File:** `api/src/services/email-deliverability.js` (400+ lines)

**Features:**
- DNS record checker (SPF, DKIM, DMARC)
- Domain reputation API integration (SenderScore, Google Postmaster)
- Email syntax validation
- Disposable email detection
- MX record lookup

**API Endpoints:**
- `GET /v1/email/deliverability/domain-check` - Check domain records
- `POST /v1/email/deliverability/validate` - Validate email
- `POST /v1/email/deliverability/validate-bulk` - Bulk validate
- `GET /v1/email/deliverability/reputation` - Get domain reputation
- `GET /v1/email/deliverability/suppression-list` - Get suppressed emails
- `DELETE /v1/email/deliverability/suppression/:email` - Remove from suppression

---

## Files to Create

### Backend (10 files, ~3,500 lines)
1. `api/src/routes/email-inbound.js` (300 lines)
2. `api/src/services/email-parser.js` (400 lines)
3. `api/src/services/email-automation.js` (500 lines)
4. `api/src/services/email-deliverability.js` (400 lines)
5. `api/src/workers/email-automation-worker.js` (300 lines)
6. `database/migrations/007_email_expansion.sql` (200 lines)
7. `database/migrations/008_email_automation.sql` (150 lines)
8. Updates to existing files (750 lines total)

### Frontend (6 files, ~3,800 lines)
1. `irisx-customer-portal/src/views/EmailTemplates.vue` (600 lines)
2. `irisx-customer-portal/src/views/EmailCampaignBuilder.vue` (800 lines)
3. `irisx-customer-portal/src/views/EmailAnalytics.vue` (700 lines)
4. `irisx-customer-portal/src/views/EmailAutomation.vue` (600 lines)
5. `irisx-customer-portal/src/views/EmailDeliverability.vue` (500 lines)
6. `irisx-customer-portal/src/views/EmailInbox.vue` (600 lines) - Inbound email viewer

### Documentation (2 files)
1. `docs/guides/email-automation.mdx` (800 lines)
2. `docs/guides/email-deliverability.mdx` (600 lines)

**Total:** 18 files, ~8,500 lines of code

---

## Dependencies to Add

### Backend:
```bash
npm install mailparser          # MIME email parsing
npm install nodemailer          # Email sending (if needed)
npm install email-validator     # Email validation
npm install dns                 # Built-in (DNS lookups)
```

### Frontend:
```bash
npm install @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-placeholder
npm install chart.js vue-chartjs
npm install leaflet vue-leaflet  # Geographic maps
npm install date-fns             # Date handling
```

---

## Testing Plan

### Unit Tests:
- Email parser (MIME parsing)
- Template variable substitution
- Automation rule matching
- Email validation

### Integration Tests:
- Inbound email webhook → database
- Automation trigger → email sent
- Campaign send → tracking events

### Load Tests:
- 1,000 emails/minute send rate
- 100 concurrent inbound emails
- Template rendering performance

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Inbound email processing time | < 2 seconds |
| Template builder UX | 5-star feedback |
| Campaign send rate | 1,000 emails/min |
| Deliverability score | 95%+ inbox rate |
| Automation rule execution | < 5 sec from trigger |

---

## Timeline

| Day | Tasks | Deliverable |
|-----|-------|-------------|
| 1-3 | Inbound email processing | Receive & parse emails |
| 4-5 | Template builder UI | Visual template editor |
| 6-8 | Campaign builder | Full campaign wizard |
| 9-10 | Analytics dashboard | Enhanced email analytics |
| 11-13 | Automation engine | Trigger-based automation |
| 14 | Deliverability tools | Domain health checker |

**Total:** 14 days (2 weeks)

---

## Next Steps

1. **Review this plan** with stakeholder
2. **Start Phase 1:** Inbound email processing
3. **Create migration files** for database changes
4. **Set up TipTap editor** for templates
5. **Build email parser service**

---

## Notes

- **Priority:** Focus on features that differentiate from competitors (automation, inbound processing)
- **Defer:** Advanced features like AI-powered send time optimization can wait
- **Quick Wins:** Template builder and analytics will provide immediate customer value

**Status:** 📋 Ready to begin implementation
**Estimated Completion:** Week 14 (2 weeks from now)
