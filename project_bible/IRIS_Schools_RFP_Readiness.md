# IRIS Schools RFP Readiness Guide
## Complete Checklist to Win K-12 District Contracts

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Part of:** IRIS Multi-Channel Communications Platform

---

## Table of Contents

1. [RFP Overview](#1-rfp-overview)
2. [Pre-RFP Preparation](#2-pre-rfp-preparation)
3. [Functional Requirements Checklist](#3-functional-requirements-checklist)
4. [Technical Requirements](#4-technical-requirements)
5. [Security & Compliance](#5-security--compliance)
6. [Implementation & Support](#6-implementation--support)
7. [Business & Financial](#7-business--financial)
8. [References & Case Studies](#8-references--case-studies)
9. [Sample RFP Response](#9-sample-rfp-response)
10. [Pricing Strategy](#10-pricing-strategy)
11. [Demo Script](#11-demo-script)
12. [Post-Award Implementation](#12-post-award-implementation)

---

## 1. RFP Overview

### 1.1 What is a School District RFP?

**RFP = Request for Proposal**

When a school district wants to buy a new system, they publish an RFP document (30-100 pages) listing:
- What they need
- What vendors must provide
- How vendors will be evaluated
- Deadlines and submission requirements

**Timeline:**
```
RFP Published → 30-45 days → Proposals Due → 30 days → Vendor Selection → Contract
```

### 1.2 Typical RFP Sections

1. **Background** - About the district
2. **Scope of Work** - What they want to buy
3. **Functional Requirements** - Features list (50-200 items)
4. **Technical Requirements** - Integration, security, performance
5. **Pricing** - Cost breakdown requested
6. **Vendor Qualifications** - Company info, references
7. **Evaluation Criteria** - How they'll score proposals
8. **Contract Terms** - Legal requirements

### 1.3 Scoring Matrix (Typical)

| Category | Weight | Your Target |
|----------|--------|-------------|
| Functional Requirements | 40% | 95%+ |
| Technical Capabilities | 20% | 90%+ |
| Pricing | 25% | 100% (lowest price) |
| Company Qualifications | 10% | 85%+ |
| References | 5% | 100% (glowing reviews) |

**To win:** Need 90%+ overall score

---

## 2. Pre-RFP Preparation

### 2.1 Documents You Must Have Ready

**Before any RFP is published, have these prepared:**

#### **Company Documents:**
- [ ] Company overview (1-pager)
- [ ] Executive bios
- [ ] Organizational chart
- [ ] Financial statements (2 years)
- [ ] Bank reference letter
- [ ] Certificate of Insurance (COI)
  - General Liability: $2M minimum
  - Cyber Liability: $2M minimum
  - E&O Insurance: $2M minimum
- [ ] W-9 form
- [ ] D&B DUNS number

#### **Product Documents:**
- [ ] Product roadmap (1-year)
- [ ] Feature comparison matrix (you vs competitors)
- [ ] Technical architecture diagram
- [ ] Security whitepaper (10-15 pages)
- [ ] Integration catalog (what systems you connect to)
- [ ] SLA document (uptime guarantees)
- [ ] Disaster recovery plan
- [ ] Data retention policy

#### **Compliance Documents:**
- [ ] SOC 2 Type II report (MUST HAVE)
- [ ] FERPA compliance attestation
- [ ] COPPA compliance attestation
- [ ] Privacy policy
- [ ] Terms of service
- [ ] Data Processing Agreement (DPA) template
- [ ] Business Associate Agreement (BAA) template
- [ ] Penetration test results (annual)
- [ ] Vulnerability scan results (quarterly)

#### **Sales Materials:**
- [ ] Product demo video (10 min)
- [ ] Customer testimonials (video + written)
- [ ] Case studies (3-5 districts/schools)
- [ ] ROI calculator
- [ ] Pricing sheet (all tiers)
- [ ] Implementation timeline (Gantt chart)

---

### 2.2 Certifications You Need

**Critical (disqualified without these):**
- [ ] **SOC 2 Type II** - Security audit (6-12 months to get)
- [ ] **FERPA Compliance** - Education data privacy
- [ ] **ADA Compliant** - Website/app accessibility

**Nice to have (gives you points):**
- [ ] **ISO 27001** - Information security
- [ ] **PCI DSS** - Payment card security (if handling payments)
- [ ] **E-Rate eligible** - FCC program for school telecom discounts
- [ ] **Woman/Minority-Owned Business** - Extra points in many RFPs
- [ ] **State vendor registration** - Required in some states

---

### 2.3 Team You Need

**Minimum team to respond to RFPs:**

| Role | Responsibility | Time Commitment |
|------|----------------|-----------------|
| **Sales Lead** | Owns RFP, coordinates response | 40 hours per RFP |
| **Technical Writer** | Writes responses | 60 hours per RFP |
| **Product Manager** | Answers functional questions | 20 hours per RFP |
| **Engineer** | Answers technical questions | 10 hours per RFP |
| **Legal** | Reviews contract terms | 5 hours per RFP |
| **Finance** | Pricing, billing terms | 5 hours per RFP |

**Total effort:** 140 hours per RFP = 3.5 weeks full-time

**Pro tip:** Build a "response library" - save answers to common questions, reuse across RFPs (cuts time by 60%)

---

## 3. Functional Requirements Checklist

**Every RFP will have 50-200 requirements. Mark each as:**
- ✅ **Yes** - We have this now
- 🔄 **Roadmap** - We'll build it before go-live
- ❌ **No** - We don't have this (explain workaround)

**Missing even 5-10 "critical" requirements = disqualified**

---

### 3.1 Communication Features

**Core Messaging Channels:**
- [ ] Send SMS messages (text only)
- [ ] Send MMS messages (images, videos, PDFs)
- [ ] Send voice calls (automated, text-to-speech)
- [ ] Send emails (HTML + plain text)
- [ ] Send push notifications (mobile app)
- [ ] Send to Slack channels (staff notifications)
- [ ] Send to Microsoft Teams (staff notifications)
- [ ] Multi-channel broadcast (SMS + Voice + Email + Push simultaneously)

**Rich Messaging (Modern Channels):**
- [ ] WhatsApp Business messages
- [ ] RCS messages (Android rich messaging with images/buttons)
- [ ] Instagram DMs (for social media engagement)

**Message Management:**
- [ ] Scheduled messaging (future send)
- [ ] Recurring messages (daily, weekly, monthly)
- [ ] Message templates library (20+ pre-built)
- [ ] Custom message templates
- [ ] Personalization (merge fields: name, grade, student ID, etc.)
- [ ] Character count display (SMS limit warning)
- [ ] Link shortening (track clicks)
- [ ] Attachment support (email: PDF, images | MMS: photos, videos)
- [ ] Message preview (test before sending)
- [ ] Delivery confirmations
- [ ] Read receipts (email, WhatsApp, RCS)
- [ ] Click tracking (links)
- [ ] Bounce handling (invalid numbers/emails)
- [ ] Unsubscribe management (per channel)
- [ ] Reply handling (two-way SMS, WhatsApp, RCS)
- [ ] Conversation threading (view full history)
- [ ] Auto-replies (canned responses)
- [ ] Message queue (prioritization)
- [ ] Throttling (rate limiting)
- [ ] Retry logic (failed messages)

---

### 3.2 Emergency Alert Features

- [ ] "Big red button" (one-click emergency send)
- [ ] Pre-written emergency templates
- [ ] Multi-channel cascade (SMS + MMS + Voice + Email + Push simultaneously)
- [ ] Priority delivery (emergency messages jump queue)
- [ ] Target all contacts (district-wide)
- [ ] Target specific groups (one school, one grade, staff only)
- [ ] Send from mobile app (iOS + Android)
- [ ] Send from web portal
- [ ] Send via SMS command (text-to-trigger)
- [ ] Send from Slack/Teams (staff emergency broadcast)
- [ ] Confirmation of send (who clicked button, when)
- [ ] Delivery tracking (real-time dashboard with map view)
- [ ] Acknowledgement tracking (who saw it, who clicked "safe" button)
- [ ] Follow-up messages (update parents on situation)
- [ ] Emergency contact list (superintendent, board, police)
- [ ] Rich media support (send evacuation maps via MMS/Email/Push)
- [ ] Multi-language emergency alerts (auto-translate)
- [ ] 99.99% uptime SLA
- [ ] < 5 minutes to deliver to 10,000 people across all channels
- [ ] Redundant infrastructure (no single point of failure)
- [ ] 24/7 emergency support hotline

---

### 3.3 Contact Management

- [ ] Student directory (auto-sync from SIS)
- [ ] Parent/guardian contacts (multiple per student)
- [ ] Staff directory
- [ ] Board members directory
- [ ] Community groups (volunteers, partners)
- [ ] Contact import (CSV, Excel)
- [ ] Contact export (CSV, Excel)
- [ ] Bulk updates (change 1000s at once)
- [ ] Custom fields (10-20 additional fields)
- [ ] Tags/labels (categorize contacts)
- [ ] Groups (by grade, school, class, activity)
- [ ] Dynamic groups (auto-update based on rules)
- [ ] Duplicate detection
- [ ] Merge duplicates
- [ ] Contact history (all messages sent)
- [ ] Opt-out management (per contact, per channel)
- [ ] Do Not Contact list
- [ ] Contact verification (confirm phone/email valid)
- [ ] Multi-language preference (per contact)
- [ ] Parent portal (self-update contact info)

---

### 3.4 SIS/EHR Integration

**Districts will require integration with THEIR specific system:**

- [ ] PowerSchool (30% of districts use this)
- [ ] Infinite Campus (25%)
- [ ] Skyward (15%)
- [ ] Tyler SIS (10%)
- [ ] Aeries (5%)
- [ ] Schoology
- [ ] Canvas
- [ ] Google Classroom
- [ ] Clever (rostering API)
- [ ] ClassLink (rostering API)

**Integration capabilities required:**
- [ ] Real-time sync (changes reflect within 1 hour)
- [ ] Nightly batch sync (full roster update)
- [ ] Secure API connection (OAuth 2.0 or API key)
- [ ] Field mapping (map their fields to yours)
- [ ] Sync logs (track what synced, when, errors)
- [ ] Error handling (don't break if sync fails)
- [ ] Data validation (reject invalid data)
- [ ] Incremental sync (only changed records)
- [ ] Historical data (import past 2 years)

---

### 3.5 Multi-Language Support

- [ ] Spanish (REQUIRED - 30-60% of parents in many districts)
- [ ] Mandarin Chinese
- [ ] Vietnamese
- [ ] Arabic
- [ ] Tagalog (Filipino)
- [ ] French (Canada border states)
- [ ] Haitian Creole (Florida, Northeast)
- [ ] Somali (Minnesota, Ohio)
- [ ] Auto-detect language (from SIS preference)
- [ ] Auto-translate messages
- [ ] Human translation option (for critical messages)
- [ ] Multi-language templates
- [ ] Unicode support (emojis, special characters)
- [ ] RTL language support (Arabic, Hebrew)

---

### 3.6 Reporting & Analytics

- [ ] Message delivery report (per message)
- [ ] Campaign summary report (all messages in campaign)
- [ ] Engagement report (open/click rates)
- [ ] Opt-out report (who unsubscribed)
- [ ] Bounce report (failed deliveries)
- [ ] Cost report (by department, school, month)
- [ ] Usage report (messages per month, trending)
- [ ] Compliance report (audit trail)
- [ ] User activity report (who sent what, when)
- [ ] Export to CSV/Excel
- [ ] Export to PDF
- [ ] Scheduled reports (email daily/weekly)
- [ ] Dashboard widgets (real-time stats)
- [ ] Custom reports (build your own)
- [ ] API access (pull data programmatically)

---

### 3.7 Mobile App Features

**Districts increasingly require mobile apps:**

- [ ] iOS app (iPhone + iPad)
- [ ] Android app (phone + tablet)
- [ ] Login (SSO or username/password)
- [ ] Send message (from phone)
- [ ] Send emergency alert (big red button)
- [ ] View message history
- [ ] View delivery status
- [ ] Reply to messages (two-way)
- [ ] Contact search
- [ ] Push notifications (message delivered, reply received)
- [ ] Offline mode (compose message, send when online)
- [ ] Biometric login (Face ID, Touch ID)
- [ ] App store ratings (4.5+ stars)

---

### 3.8 Accessibility (ADA Compliance)

**Required by law:**

- [ ] WCAG 2.1 Level AA compliant
- [ ] Screen reader support (JAWS, NVDA, VoiceOver)
- [ ] Keyboard navigation (no mouse required)
- [ ] High contrast mode
- [ ] Font size adjustment
- [ ] Alt text for images
- [ ] Captions for videos
- [ ] Color blind friendly (don't rely on color alone)
- [ ] Form labels (screen reader can read them)
- [ ] ARIA tags (HTML accessibility)
- [ ] Accessibility statement page
- [ ] VPAT (Voluntary Product Accessibility Template) document

---

## 4. Technical Requirements

### 4.1 Integration & APIs

- [ ] REST API (industry standard)
- [ ] Webhooks (real-time events)
- [ ] OAuth 2.0 (secure authentication)
- [ ] API documentation (auto-generated)
- [ ] Sandbox environment (test without affecting production)
- [ ] Rate limiting (prevent abuse)
- [ ] API versioning (backward compatible)
- [ ] SDK support (JavaScript, Python, PHP, etc.)
- [ ] Zapier integration
- [ ] SFTP export (for legacy systems)
- [ ] Flat file import (CSV)

---

### 4.2 Performance & Scalability

- [ ] 99.9% uptime SLA (< 9 hours downtime per year)
- [ ] 99.99% for emergency alerts (< 1 hour downtime per year)
- [ ] < 5 minutes to send 10,000 messages
- [ ] < 30 minutes to send 100,000 messages
- [ ] Handle 1,000 concurrent users
- [ ] Handle 10,000 concurrent API requests
- [ ] Page load time < 3 seconds
- [ ] API response time < 500ms
- [ ] Real-time delivery status (no refresh needed)
- [ ] Support 500,000+ contacts per district
- [ ] Auto-scaling (handle traffic spikes)
- [ ] Load testing (prove it works under stress)

---

### 4.3 Infrastructure & Hosting

- [ ] Cloud-hosted (AWS, Azure, GCP)
- [ ] Multi-region deployment (redundancy)
- [ ] CDN (fast worldwide access)
- [ ] DDoS protection (Cloudflare, AWS Shield)
- [ ] Auto-failover (if one region goes down)
- [ ] Disaster recovery plan (documented, tested annually)
- [ ] RTO (Recovery Time Objective): < 4 hours
- [ ] RPO (Recovery Point Objective): < 1 hour (max data loss)
- [ ] Daily backups (retained 30 days)
- [ ] Backup testing (monthly restore tests)

---

## 5. Security & Compliance

### 5.1 Security Controls

- [ ] Data encryption at rest (AES-256)
- [ ] Data encryption in transit (TLS 1.2+)
- [ ] Password complexity requirements
- [ ] Multi-factor authentication (MFA)
- [ ] Single Sign-On (SSO) support
  - [ ] SAML 2.0
  - [ ] Google Workspace
  - [ ] Microsoft Azure AD
  - [ ] Clever
  - [ ] ClassLink
- [ ] Role-based access control (RBAC)
- [ ] Least privilege principle
- [ ] Session timeout (15 min idle)
- [ ] IP whitelisting (optional)
- [ ] Audit logging (all actions tracked)
- [ ] Log retention (7 years)
- [ ] Intrusion detection (IDS/IPS)
- [ ] Vulnerability scanning (quarterly)
- [ ] Penetration testing (annual)
- [ ] Security awareness training (staff)
- [ ] Incident response plan (documented)
- [ ] Bug bounty program
- [ ] Security contact (security@useiris.com)

---

### 5.2 Compliance Certifications

#### **FERPA (Family Educational Rights and Privacy Act)**

**What it is:** Federal law protecting student education records

**What you must do:**
- [ ] Sign FERPA attestation
- [ ] Designate yourself as "School Official"
- [ ] Only use data for "legitimate educational interest"
- [ ] Don't share data with third parties (without consent)
- [ ] Don't use data for advertising/marketing
- [ ] Destroy data upon contract termination
- [ ] Allow districts to audit you
- [ ] Report data breaches within 72 hours

**Document needed:** FERPA Compliance Statement (1-2 pages)

---

#### **COPPA (Children's Online Privacy Protection Act)**

**What it is:** Federal law protecting kids under 13 online

**What you must do:**
- [ ] Don't collect personal info from kids under 13 (without parent consent)
- [ ] If your platform is for parents (not students), you're exempt
- [ ] Privacy policy must explain data collection
- [ ] Verifiable parental consent required
- [ ] Parents can request data deletion

**Key:** If your system is school → parent (not student-facing), COPPA doesn't apply

---

#### **SOC 2 Type II**

**What it is:** Security audit proving you handle data responsibly

**What it covers:**
- Security (data protection)
- Availability (uptime)
- Processing integrity (data accuracy)
- Confidentiality (access controls)
- Privacy (GDPR-like)

**How to get it:**
1. Hire audit firm ($15K-50K)
2. Implement required controls (3-6 months)
3. Auditor tests controls (3 months)
4. Receive report (valid 1 year)

**Timeline:** 6-12 months, $20K-60K total cost

**Required for:** Any district > 5,000 students

---

#### **State-Specific Requirements**

**California (CalOPPA, CCPA):**
- [ ] Privacy policy required
- [ ] Do Not Sell My Info link
- [ ] Data deletion requests (30 days)

**New York (Education Law 2-d):**
- [ ] Parents' Bill of Rights document
- [ ] Data security plan
- [ ] Supplemental info (vendor profile)

**Texas (TEC §32.151):**
- [ ] Data breach notification (60 days)
- [ ] Security controls documentation

**Illinois (SOPPA):**
- [ ] Student Online Personal Protection Act compliance

---

### 5.3 Data Privacy

- [ ] Privacy policy (plain language, < 5 pages)
- [ ] Data Processing Agreement (DPA)
- [ ] Data retention schedule (what data, how long)
- [ ] Data deletion process (within 30 days of request)
- [ ] Data portability (export in common format)
- [ ] Parent rights (access, correct, delete data)
- [ ] Third-party subprocessors (list all vendors)
- [ ] International data transfers (if applicable)
- [ ] Data breach notification (< 72 hours)
- [ ] Privacy impact assessment (PIA) available

---

## 6. Implementation & Support

### 6.1 Implementation Plan

**Districts want to know: How long to go live?**

**Standard answer:** 30-45 days from contract signature

```
Week 1: Kickoff + Discovery
- Kickoff call (1 hour)
- Gather requirements
- SIS credentials
- Identify stakeholders
- Project plan finalized

Week 2-3: Configuration
- SIS integration setup
- Data import (students, staff)
- Create groups (grades, schools)
- Configure templates
- Set up user accounts

Week 3-4: Training
- Admin training (2 hours)
- Staff training (1 hour webinar)
- Documentation provided
- Q&A sessions

Week 4: Testing
- Send test messages
- Verify delivery rates
- Two-way SMS testing
- Emergency alert drill

Week 5: Go-Live
- Announce to parents
- Monitor delivery
- Support on standby
- First real messages sent

Week 6-8: Optimization
- Weekly check-ins
- Address feedback
- Additional training
- Fine-tune workflows
```

---

### 6.2 Training

- [ ] Admin training (2-4 hours, onsite or virtual)
- [ ] Staff training (1 hour webinar, recorded)
- [ ] Parent training (optional, 30 min video)
- [ ] Training materials (user guides, videos)
- [ ] Help documentation (searchable knowledge base)
- [ ] Training certification (optional)
- [ ] Refresher training (annual)
- [ ] New hire training (on-demand)

---

### 6.3 Support

**Districts require multiple support tiers:**

#### **Tier 1: Standard Support**
- **Hours:** Monday-Friday, 8 AM - 6 PM (their timezone)
- **Channels:** Email, phone, live chat
- **Response time:** < 4 hours
- **Resolution time:** < 24 hours (for non-critical issues)

#### **Tier 2: Emergency Support**
- **Hours:** 24/7/365
- **Channels:** Emergency hotline (dedicated number)
- **Response time:** < 15 minutes
- **For:** System down, emergency alerts not sending

#### **Tier 3: Account Management**
- **Dedicated account manager** (for districts > 10K students)
- **Quarterly business reviews**
- **Custom training**
- **Priority feature requests**

---

### 6.4 SLA (Service Level Agreement)

```
Uptime SLA:
├── 99.9% for standard features
│   └── = 43.8 minutes downtime per month allowed
│
└── 99.99% for emergency alerts
    └── = 4.38 minutes downtime per month allowed

Performance SLA:
├── 95% of messages delivered within 5 minutes
├── 99% of messages delivered within 15 minutes
└── 100% of emergency alerts sent within 5 minutes

Support SLA:
├── Email: < 4 hour response
├── Phone: < 1 hour response
└── Emergency: < 15 minute response

Credits for SLA breach:
├── 99.0-99.9% uptime: 10% monthly fee credit
├── 95.0-99.0% uptime: 25% monthly fee credit
└── < 95.0% uptime: 50% monthly fee credit
```

---

## 7. Business & Financial

### 7.1 Company Qualifications

**RFPs ask about your company. Be ready to answer:**

- [ ] Years in business
- [ ] Number of employees
- [ ] Annual revenue
- [ ] Number of customers
- [ ] Number of K-12 customers specifically
- [ ] Total students served
- [ ] Company ownership (private, public, PE-backed)
- [ ] Key executives (bios)
- [ ] Office locations
- [ ] Financial stability (bank reference letter, D&B score)
- [ ] Lawsuits (any pending litigation)
- [ ] Bankruptcies (past 7 years)
- [ ] Mergers/acquisitions (past 3 years)

**Pro tip:** Even if you're new, emphasize:
- Founding team experience (20 years at TechRadium)
- Financial backing (funded, profitable)
- Commitment to education (not going anywhere)

---

### 7.2 Insurance Requirements

**Districts require proof of insurance:**

| Type | Minimum Coverage |
|------|------------------|
| General Liability | $2,000,000 per occurrence |
| Cyber Liability | $2,000,000 per occurrence |
| E&O (Errors & Omissions) | $2,000,000 per occurrence |
| Workers Comp | State minimum |

**Certificate holder:** Must name the school district

**Cost:** $5K-15K/year total for all policies

---

### 7.3 Payment Terms

**Standard for schools:**
- **Invoicing:** Annual (paid upfront) or quarterly
- **Payment terms:** NET 30 (they have 30 days to pay)
- **Purchase order:** They'll issue a PO (purchase order), invoice against it
- **Late fees:** Districts don't pay late fees (remove from contract)
- **Auto-renewal:** Standard (unless they give 60-90 days notice)

---

### 7.4 Contract Terms

**Standard K-12 contract length:**
- **Initial term:** 1-3 years
- **Auto-renewal:** Yes (1 year at a time)
- **Price increases:** Capped at 3-5% per year (or CPI)
- **Termination:** 60-90 days written notice
- **Cause:** Either party can terminate for breach (30 days to cure)
- **Data:** District owns all data, you delete within 30 days of termination

---

## 8. References & Case Studies

### 8.1 Reference Requirements

**Every RFP asks for 3-5 references:**

**What they want:**
- School/district name
- Contact name + title
- Phone + email
- Number of students
- When they started using IRIS
- What features they use

**Pro tip:** Only list references who will give glowing reviews. Call them first: "XYZ District might contact you as a reference. Are you comfortable sharing your positive experience?"

---

### 8.2 Case Study Template

**Create 3-5 case studies before RFP season:**

```markdown
# Case Study: Springfield School District

## Challenge
Springfield USD was using Remind for parent communication.
Problems:
- High cost ($8/student = $40K/year for 5,000 students)
- SMS-only (no voice or email)
- Poor delivery rates (85%)
- No emergency alert capability

## Solution
Switched to IRIS in Fall 2024.
- Multi-channel (SMS, voice, email)
- Emergency alert system
- PowerSchool integration
- Spanish auto-translation

## Results
- 50% cost savings ($40K → $20K/year)
- 98% delivery rate (vs 85% before)
- Emergency alerts now delivered in < 5 minutes
- Parent satisfaction increased (survey: 4.8/5)

## Testimonial
"IRIS has transformed our parent communication. The emergency
alert system alone is worth the investment. During a recent
lockdown drill, we reached 100% of parents in 3 minutes."

— Dr. Jane Smith, Superintendent, Springfield USD
```

---

## 9. Sample RFP Response (Abridged)

**Districts want responses in specific format. Example:**

```
RFP #2025-042: Parent Communication System
Springfield Unified School District

Submitted by:
IRIS Communications, Inc.
123 Main Street
Los Angeles, CA 90001
(555) 123-4567
rfp@useiris.com

Date: March 15, 2025

---

TABLE OF CONTENTS

1. Executive Summary
2. Company Overview
3. Functional Requirements Response
4. Technical Architecture
5. Implementation Plan
6. Pricing
7. References
8. Contract Terms
9. Required Forms

---

1. EXECUTIVE SUMMARY

IRIS Communications is pleased to submit this proposal to
Springfield USD for a comprehensive parent communication system.

Our solution provides:
✓ Multi-channel messaging (SMS, MMS, Voice, Email, Push Notifications, WhatsApp, RCS)
✓ Emergency alert system (< 5 min to 10K people across all channels)
✓ PowerSchool integration (real-time sync)
✓ Multi-language support (Spanish, Mandarin, Vietnamese, Arabic, Tagalog)
✓ Rich media support (send photos, videos, evacuation maps via MMS/Email/Push)
✓ Staff collaboration (Slack + Microsoft Teams integration)
✓ Modern messaging (WhatsApp Business, RCS for Android)
✓ 50% cost savings vs incumbent (Remind, ParentSquare, Blackboard)
✓ 99.9% uptime SLA

We currently serve 500+ schools and 250K+ students nationwide.

---

3. FUNCTIONAL REQUIREMENTS RESPONSE

[Requirements in spreadsheet format:]

| # | Requirement | Response | Notes |
|---|-------------|----------|-------|
| 1 | Send SMS messages | ✅ Yes | Supported |
| 2 | Send MMS messages (photos/videos) | ✅ Yes | Up to 5 MB per message |
| 3 | Send voice calls | ✅ Yes | TTS or pre-recorded |
| 4 | Send emails | ✅ Yes | HTML + plain text |
| 5 | Send push notifications | ✅ Yes | iOS + Android apps |
| 6 | WhatsApp messaging | ✅ Yes | WhatsApp Business API |
| 7 | RCS messaging | ✅ Yes | Android rich messaging |
| 8 | Slack integration | ✅ Yes | Staff notifications |
| 9 | Microsoft Teams integration | ✅ Yes | Staff notifications |
| 10 | Emergency alerts | ✅ Yes | < 5 min to 10K across all channels |
| 11 | PowerSchool integration | ✅ Yes | Real-time + nightly sync |
| 12 | Spanish support | ✅ Yes | Auto-translate |
... (100+ more rows)

Summary:
- Requirements met: 98% (196/200)
- On roadmap: 2% (4/200)
- Not supported: 0%

---

6. PRICING

Annual pricing for Springfield USD (5,000 students):

Base subscription: $2.00/student/year = $10,000/year

Includes:
✓ Unlimited SMS, voice, email messages
✓ All features (emergency alerts, integrations, etc.)
✓ PowerSchool integration
✓ Multi-language support (5 languages)
✓ Training (onsite + webinars)
✓ Standard support (M-F, 8 AM - 6 PM)
✓ Emergency support (24/7 hotline)
✓ Mobile apps (iOS + Android)

Optional add-ons:
- Dedicated account manager: $5,000/year
- Custom integrations: $10,000 one-time

Total Year 1: $10,000
Ongoing (Years 2-3): $10,000/year (price locked)

Compared to incumbent (Remind):
- Their cost: $8/student = $40,000/year
- Your savings: $30,000/year (75% reduction!)

---

7. REFERENCES

[List 3-5 similar-sized districts]

Reference #1:
- District: Riverside USD
- Contact: Dr. Sarah Johnson, Superintendent
- Phone: (555) 987-6543
- Email: sjohnson@riverside.k12.ca.us
- Students: 6,200
- Start date: August 2024
- Notes: Similar size, also switched from Remind

... (4 more references)
```

---

## 10. Pricing Strategy

### 10.1 How to Price to Win

**Key insight:** Be 30-50% cheaper than incumbents, but not TOO cheap (raises suspicion)

**Competitor pricing:**
- Remind: $6-8/student/year
- ParentSquare: $7-10/student/year
- Blackboard: $5-7/student/year
- SchoolMessenger: $4-6/student/year

**Your pricing:**
- **Target:** $2-3/student/year
- **Result:** 50-60% cheaper, but not "too good to be true"

---

### 10.2 Pricing Tiers for RFPs

```
OPTION 1: Per-Student Annual (RECOMMENDED)
────────────────────────────────────────────
Tier 1: $2.50/student/year (1-1,000 students)
Tier 2: $2.00/student/year (1,001-5,000)
Tier 3: $1.75/student/year (5,001-15,000)
Tier 4: $1.50/student/year (15,001+)

Example: 5,000 student district = $10,000/year

Includes:
✓ Unlimited messages (all channels)
✓ All features
✓ 1 SIS integration
✓ Training + support
✓ Mobile apps

OPTION 2: Flat-Rate Monthly
────────────────────────────────────────────
Small (< 2,500 students): $750/month ($9K/year)
Medium (2,500-10,000): $1,500/month ($18K/year)
Large (10,000+): $3,000/month ($36K/year)

Same inclusions as Option 1

OPTION 3: Usage-Based (Not Recommended for RFPs)
────────────────────────────────────────────
$0.01 per SMS
$0.02 per voice minute
$0.0001 per email

Monthly minimum: $500

Why not recommended: Districts hate unpredictable costs
```

---

### 10.3 Multi-Year Discounts

**Incentivize 3-year contracts:**

```
1-year contract: Full price
2-year contract: 5% discount
3-year contract: 10% discount

Example (5,000 students):
- 1 year: $10,000/year
- 2 years: $9,500/year ($1,000 total savings)
- 3 years: $9,000/year ($3,000 total savings)
```

---

## 11. Demo Script

**Districts want to see a live demo. Standard demo flow (30-45 min):**

### 11.1 Demo Outline

```
Part 1: Overview (5 min)
├── What is IRIS?
├── Who do we serve? (500+ schools)
└── Key differentiators (multi-channel, cost, reliability)

Part 2: Dashboard Tour (10 min)
├── Login (SSO demo)
├── Main dashboard (stats, recent messages)
├── Contact directory (synced from PowerSchool)
└── Groups (by grade, school, activity)

Part 3: Send a Message (10 min)
├── Compose SMS (show character count, merge fields)
├── Select recipients (Grade 9 parents at Lincoln HS)
├── Preview message (personalized for each parent)
├── Schedule (send tomorrow at 8 AM)
└── Send + track delivery (real-time status)

Part 4: Emergency Alert (5 min)
├── BIG RED BUTTON demo
├── Pre-written template (lockdown)
├── Multi-channel (SMS + Voice + Email)
├── Target: All parents + staff
└── Send in < 30 seconds, delivered in < 5 minutes

Part 5: Reporting (5 min)
├── Delivery report (98% delivered)
├── Engagement report (60% opened)
├── Cost report ($0.01 per SMS = $500 for 50K messages)
└── Export to Excel

Part 6: Mobile App (3 min)
├── iOS/Android apps
├── Send message from phone
└── Emergency alert from anywhere

Part 7: Q&A (10 min)
└── Answer their specific questions
```

---

### 11.2 Demo Best Practices

**Dos:**
- ✅ Use THEIR district name in demo (personalize it)
- ✅ Show emergency alert (this wins deals)
- ✅ Emphasize cost savings (50% cheaper)
- ✅ Show delivery rates (98% vs 85%)
- ✅ Keep it simple (don't overwhelm with features)
- ✅ Record demo (send link after)

**Don'ts:**
- ❌ Don't show buggy features
- ❌ Don't go over time (respect their schedule)
- ❌ Don't bash competitors (stay positive)
- ❌ Don't use jargon (speak their language)

---

## 12. Post-Award Implementation

**You won the RFP! Now what?**

### 12.1 Contract Execution (Week 1-2)

- [ ] Contract signed by both parties
- [ ] Purchase order (PO) received
- [ ] Insurance certificates provided
- [ ] Kickoff scheduled

### 12.2 Implementation (Week 3-8)

Follow the 6-week implementation plan (see Section 6.1)

### 12.3 Go-Live (Week 9)

- [ ] Final testing complete
- [ ] Training complete
- [ ] First messages sent successfully
- [ ] Monitor closely (support on standby)

### 12.4 Post-Implementation (Week 10-12)

- [ ] Weekly check-ins
- [ ] Gather feedback
- [ ] Address issues quickly
- [ ] Document lessons learned
- [ ] Request testimonial/case study

---

## Summary Checklist

**Before responding to ANY school RFP:**

- [ ] SOC 2 Type II certification (6-12 months to get)
- [ ] FERPA compliance documentation
- [ ] 3-5 reference customers (glowing reviews)
- [ ] Case studies written
- [ ] Demo environment ready
- [ ] Pricing locked in
- [ ] Insurance certificates
- [ ] Financial documents
- [ ] RFP response library (saves 60% time)
- [ ] Legal review of contract terms
- [ ] Implementation plan documented
- [ ] Training materials ready

**Missing any of these = lower chance of winning**

---

## Next Steps

1. **Get SOC 2** (start now, takes 6-12 months)
2. **Win first 10 schools** (build references)
3. **Create case studies** (document success)
4. **Monitor RFP boards** (rfpdb.com, bidsync.com, govspend.com)
5. **Respond to first district RFP** (aim for spring 2026 RFP season)

**Good luck! You've got everything you need to win school contracts.**

---

**Document Complete** | Ready to compete against Remind, ParentSquare, Blackboard, and win on price + features ✅
