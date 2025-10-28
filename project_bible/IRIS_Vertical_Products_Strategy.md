# IRIS Vertical Products Strategy
## Multi-Industry Expansion Roadmap

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Part of:** IRIS Multi-Channel Communications Platform

---

## Table of Contents

1. [Vertical Strategy Overview](#1-vertical-strategy-overview)
2. [Schools & Education (K-12)](#2-schools--education-k-12)
3. [Healthcare & Medical](#3-healthcare--medical)
4. [Local Government & Public Safety](#4-local-government--public-safety)
5. [Small Business Marketing](#5-small-business-marketing)
6. [Real Estate & Property Management](#6-real-estate--property-management)
7. [Non-Profits & Churches](#7-non-profits--churches)
8. [Financial Services](#8-financial-services)
9. [Hospitality & Travel](#9-hospitality--travel)
10. [Retail & E-Commerce](#10-retail--e-commerce)
11. [Build Order & Timeline](#11-build-order--timeline)
12. [Shared Components](#12-shared-components)

---

## 1. Vertical Strategy Overview

### 1.1 The Multi-Vertical Playbook

**Core Insight:** Same messaging infrastructure → Different UIs for different industries

```
                     IRIS Core API
                  (Horizontal Layer)
                         ↓
    ┌─────────────┬──────────────┬──────────────┬──────────────┐
    │             │              │              │              │
 Education    Healthcare    Government     Small Biz
 $390M TAM    $2.1B TAM     $850M TAM     $4.5B TAM
```

### 1.2 Why This Works

**Advantages:**
1. ✅ **Amortized R&D** - Build core once, reuse for all verticals
2. ✅ **Diversified risk** - Not dependent on one industry
3. ✅ **Higher margins** - Charge for value (vertical solution), not usage (commodity)
4. ✅ **Defensibility** - Hard for competitors to copy 10 vertical products
5. ✅ **Cross-sell** - School customer refers hospital friend
6. ✅ **Valuation multiple** - Vertical SaaS trades at 8-12x revenue vs 4-6x for infrastructure

### 1.3 Success Metrics Per Vertical

| Metric | Target |
|--------|--------|
| Time to 10 customers | < 6 months |
| Customer acquisition cost (CAC) | < 6 months LTV |
| Gross margin | > 75% |
| Net revenue retention (NRR) | > 110% |
| Monthly churn | < 2% |

---

## 2. Schools & Education (K-12)

### 2.1 Market Size

**Total Addressable Market:**
- 130,600 schools in US
- 50.8 million students
- 13,500 school districts
- **TAM: $390M/year** (at $3/student/year)

**Serviceable Market:**
- 50,000 schools with communication budgets
- **SAM: $150M/year**

**Year 1 Target:**
- 500 schools
- **Revenue: $1.5M ARR**

### 2.2 Use Cases (Priority Order)

#### **1. Emergency Alerts** 🚨 (MUST-HAVE)
**Scenario:** Lockdown, evacuation, weather closure

**Requirements:**
- Multi-channel broadcast (SMS + Voice + Email simultaneously)
- Send to 10,000 people in < 5 minutes
- 99.99% uptime (lives depend on this)
- Mobile app for admins (send from anywhere)
- Pre-written templates (no thinking during crisis)

**Message example:**
```
URGENT: School in lockdown. Students safe and secure.
Do NOT come to campus. Police on scene.
Updates: schoolname.edu/alerts
```

**Revenue impact:** THIS is what wins RFPs. Districts will pay 2x for reliable emergency alerts.

---

#### **2. Attendance Notifications** 📋
**Scenario:** Student absent, notify parent immediately

**Requirements:**
- Real-time sync with SIS (PowerSchool, Infinite Campus, etc.)
- Triggered automatically when attendance marked
- Two-way SMS (parent replies to excuse)
- Multi-language support

**Message example:**
```
Hi Parent, Sarah was marked absent from Period 2 Math at 9:15 AM.
Reply:
  OK - Excused absence
  SICK - Illness
  LATE - Running late
  ? - I'll call the office
```

**Volume:** 5-10% daily absences = 50-100 messages/day per 1000 students

---

#### **3. School Closures & Delays** ❄️
**Scenario:** Snow day, early dismissal

**Requirements:**
- Schedule ahead (send at 6 AM even if decided at 11 PM)
- District-wide broadcast
- Multi-language
- Confirmation tracking (who saw it?)

**Message example:**
```
SCHOOL CLOSED: All schools closed tomorrow, Nov 15, due to snow.
Virtual learning day - check Google Classroom.
Staff report at 10 AM.
```

**Volume:** 2-5 times per year, but HIGH stakes

---

#### **4. Event Reminders** 📅
**Scenario:** Parent-teacher conferences, field trips, picture day

**Message example:**
```
Reminder: Parent-teacher conferences Thursday 5-8 PM.
Book your 15-min slot: schoolname.edu/conferences
```

**Volume:** 2-3 per month per family

---

#### **5. Grade Notifications** 📊
**Scenario:** Progress reports, grade drops

**Requirements:**
- Integration with gradebook
- Trigger rules (send if grade drops below C)
- Parent portal link

**Message example:**
```
Sarah's grade in AP Calculus dropped to D (68%).
Missing assignments: 3
View details: portal.schoolname.edu
```

**Volume:** 10-15% of students per grading period

---

#### **6. Sports & Activities** ⚽
**Scenario:** Practice cancelled, game schedule change

**Message example:**
```
Boys Basketball practice CANCELLED today due to gym flooding.
Makeup practice: Saturday 9 AM.
Questions? Coach Smith: 555-1234
```

**Volume:** 20-30% of students in activities

---

#### **7. Lunch Balance Alerts** 🍕
**Scenario:** Low lunch account balance

**Message example:**
```
Sarah's lunch account balance: $2.50
Add funds online: schoolname.edu/lunch
Or send cash/check with student.
```

**Volume:** Weekly for 30-40% of families

---

#### **8. Transportation Updates** 🚌
**Scenario:** Bus delays, route changes

**Requirements:**
- GPS integration with bus tracking systems
- Real-time updates
- Route-specific targeting

**Message example:**
```
Bus 42 running 15 minutes late due to traffic.
Now arriving: 3:45 PM (instead of 3:30 PM)
Track live: schoolname.edu/bus42
```

**Volume:** Daily during school year

---

### 2.3 Product Features for Schools

#### **Core Platform:**
```
IRIS for Schools
├── Dashboard
│   ├── Emergency Alert Button (big red button)
│   ├── Quick Send (attendance, closure, etc.)
│   ├── Message Calendar (scheduled messages)
│   └── Analytics (delivery rates, engagement)
│
├── Integrations
│   ├── PowerSchool
│   ├── Infinite Campus
│   ├── Skyward
│   ├── Tyler SIS
│   ├── Aeries
│   ├── Schoology
│   └── Google Classroom
│
├── Contact Management
│   ├── Student Directory (auto-sync from SIS)
│   ├── Parent/Guardian Contacts
│   ├── Staff Directory
│   ├── Groups (by grade, class, activity)
│   └── Multi-language preferences
│
├── Templates Library
│   ├── Emergency Alerts (10 templates)
│   ├── Attendance (5 templates)
│   ├── Events (20 templates)
│   ├── Weather (8 templates)
│   └── Custom Templates
│
├── Multi-Language
│   ├── Auto-detect parent language from SIS
│   ├── Auto-translate messages
│   ├── Supported: Spanish, Mandarin, Vietnamese, Arabic, Tagalog
│   └── Custom translations
│
├── Two-Way Messaging
│   ├── SMS replies routed to office
│   ├── Auto-responses for common replies
│   ├── Conversation threads
│   └── Reply templates
│
├── Compliance
│   ├── FERPA audit logs
│   ├── Opt-out management
│   ├── Consent forms
│   ├── Data retention (7 years)
│   └── Role-based permissions
│
└── Reporting
    ├── Delivery Reports (per message)
    ├── Engagement Reports (read rates)
    ├── Cost Reports (by department)
    ├── Compliance Reports (audit trails)
    └── Usage Reports (messages per month)
```

---

### 2.4 School RFP Requirements Checklist

**When schools issue RFPs, they require ALL of these. Missing even 1 = disqualified.**

#### **Functional Requirements:**
- [ ] Multi-channel (SMS, Voice, Email)
- [ ] Emergency broadcast (< 5 min to 10K people)
- [ ] SIS integration (PowerSchool, Infinite Campus, Skyward)
- [ ] Multi-language support (Spanish minimum)
- [ ] Two-way messaging
- [ ] Mobile app (iOS + Android)
- [ ] Scheduled messaging
- [ ] Message templates
- [ ] Group targeting (by grade, class, etc.)
- [ ] Delivery confirmations
- [ ] Analytics dashboard
- [ ] Parent opt-out management
- [ ] Cost tracking by department
- [ ] Message history (searchable)

#### **Security Requirements:**
- [ ] FERPA compliant
- [ ] SOC 2 Type II certification
- [ ] Data encryption (at rest + in transit)
- [ ] Role-based access control (RBAC)
- [ ] Multi-factor authentication (MFA)
- [ ] Audit logging (all actions tracked)
- [ ] Data backup (daily)
- [ ] Disaster recovery plan (documented)
- [ ] Penetration testing (annual)
- [ ] Vendor security questionnaire (VSQ)

#### **Operational Requirements:**
- [ ] 99.9% uptime SLA
- [ ] 24/7 emergency support
- [ ] Dedicated account manager
- [ ] Training (onsite + webinars)
- [ ] Implementation timeline (< 30 days)
- [ ] Data migration support
- [ ] Custom integrations (if needed)

#### **Business Requirements:**
- [ ] Fixed pricing (no surprise bills)
- [ ] Multi-year contract discount
- [ ] Payment terms (NET 30)
- [ ] References (3+ similar-sized districts)
- [ ] Financial stability (prove you won't disappear)
- [ ] Insurance (general liability, E&O)
- [ ] W-9 form
- [ ] Certificate of Insurance

#### **Compliance Requirements:**
- [ ] FERPA attestation
- [ ] COPPA compliance (if students under 13)
- [ ] State-specific laws (varies)
- [ ] E-Rate eligible (if applicable)
- [ ] ADA accessible (website/app)
- [ ] Data Processing Agreement (DPA)
- [ ] Right to audit (you allow them to audit you)

---

### 2.5 Pricing for Schools

#### **Option 1: Per-Student Annual** (RECOMMENDED for RFPs)
```
Tier 1: $2.50/student/year (1-1000 students)
Tier 2: $2.00/student/year (1001-5000 students)
Tier 3: $1.75/student/year (5001+ students)

Includes:
✓ Unlimited messages (SMS + Voice + Email)
✓ All features
✓ SIS integration (1 provider)
✓ Multi-language support
✓ Training + support
✓ Mobile app

Example:
- 2,000 student high school: $4,000/year ($333/mo)
- 10,000 student district: $17,500/year ($1,458/mo)
```

#### **Option 2: Tiered Plans**
```
Basic: $500/month
- 1 school (up to 1,000 students)
- SMS only
- 50K messages/month included
- Email support

Professional: $1,500/month
- 5 schools (up to 5,000 students)
- SMS + Voice + Email
- 200K messages/month included
- SIS integration (1 provider)
- Phone + email support

Enterprise: Custom
- Unlimited schools/students
- All features
- Custom integrations
- Dedicated account manager
- 24/7 emergency support
```

#### **Option 3: Usage-Based** (For small schools)
```
$0.01 per SMS
$0.02 per voice minute
$0.0001 per email

Monthly minimum: $100/month

Good for: Private schools, charters with < 500 students
```

---

### 2.6 Competitor Comparison

| Feature | IRIS | Remind | ParentSquare | Blackboard | SchoolMessenger |
|---------|------|--------|--------------|------------|-----------------|
| **Price/student/year** | $2.00 | $6-8 | $7-10 | $5-7 | $4-6 |
| SMS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Voice | ✅ | ❌ | Limited | ✅ | ✅ |
| Email | ✅ | Limited | ✅ | ✅ | ✅ |
| Multi-language | ✅ (5+) | Limited | ✅ (3) | ✅ (2) | Limited |
| Two-way SMS | ✅ | ✅ | ✅ | Limited | Limited |
| Emergency alerts | ✅ | ❌ | ✅ | ✅ | ✅ |
| SIS integration | ✅ (6+) | Limited | ✅ (3) | ✅ (4) | ✅ (5) |
| Mobile app | ✅ | ✅ | ✅ | ✅ | ✅ |
| Modern UI | ✅ | ✅ | Medium | ❌ | ❌ |
| Delivery rate | 98%+ | 85-90% | 90% | 85% | 88% |

**Your competitive advantages:**
1. ✅ **40-60% cheaper** than competitors
2. ✅ **Better delivery rates** (multi-provider redundancy)
3. ✅ **More languages** (5+ vs 2-3)
4. ✅ **Modern tech** (built in 2025, not 2010)
5. ✅ **All-in-one** (voice + SMS + email, not just one)

---

### 2.7 Schools GTM Strategy

#### **Phase 1: First 10 Schools (Months 1-3)**

**Target:** Small-medium schools (500-2000 students) within driving distance

**Outreach:**
```
Subject: Cut parent communication costs 50%

Hi [Principal Name],

Quick question: How much are you paying for Remind/ParentSquare?

Most schools pay $5-10 per student ($5,000-20,000/year for your school).

We're IRIS - multi-channel parent communication at $2/student/year.

Same features (SMS, voice, email, emergency alerts, SIS integration).
Better delivery rates. Half the cost.

Would a 15-min demo make sense? I can show you the platform live.

Ryan
IRIS Communications
ryan@useiris.com
555-1234
```

**Close process:**
1. Demo (15 min)
2. Trial (30 days free)
3. Contract (annual, NET 30)

**Timeline:** 2-4 weeks per school

---

#### **Phase 2: First District (Months 4-9)**

**Target:** Mid-size district (5K-15K students, 5-10 schools)

**Decision makers:**
- Superintendent
- IT Director
- Director of Communications
- Principals (stakeholder input)

**Process:**
1. **Initial meeting** (1 hour) - Show platform, discuss needs
2. **Technical review** (2 weeks) - IT evaluates security, integration
3. **Pilot program** (1-2 schools, 3 months) - Prove it works
4. **RFP response** (if required) - 30-60 days
5. **Contract negotiation** (2-4 weeks)
6. **Implementation** (30-60 days)

**Timeline:** 6-9 months total

**Contract value:** $15K-60K/year (3-year contract = $45K-180K TCV)

---

#### **Phase 3: State Vendor List (Month 12+)**

**Target:** Get on state "approved vendor" lists

**Examples:**
- **Texas DIR** (Department of Information Resources)
- **California CMAS** (Multiple Award Schedules)
- **E-rate Eligible** (FCC program for school telecom)

**Why powerful:** Once on list, 1000+ districts can buy without RFP

**Process:**
- Apply (100+ page application)
- Wait 3-6 months for approval
- Once approved, market to all districts in state

**Payoff:** 10-50x easier to close deals

---

### 2.8 Implementation Timeline

**From contract signature to go-live: 30 days**

```
Week 1: Kickoff + Data Sync
├── Kickoff call (all stakeholders)
├── SIS credentials provided
├── Test data sync
└── Identify key contacts

Week 2: Configuration
├── Import student roster
├── Import staff directory
├── Set up groups (grades, activities)
├── Configure templates
└── Train admin users (2 hours)

Week 3: Training + Testing
├── Train all staff (1-hour webinar)
├── Send test messages
├── Verify delivery rates
└── Two-way SMS testing

Week 4: Go-Live
├── Announce to parents
├── First real messages sent
├── Monitor delivery
└── Support standby

Week 5-8: Optimization
├── Weekly check-ins
├── Adjust based on feedback
├── Add more templates
└── Train additional staff
```

---

### 2.9 Annual Contract Template

**See separate document:** `IRIS_Schools_Contract_Template.pdf`

**Key terms:**
- **Term:** 12 months (auto-renews)
- **Payment:** Annual upfront OR quarterly
- **Price:** $X per student (based on October 1 enrollment count)
- **SLA:** 99.9% uptime
- **Support:** Email + phone (M-F 8 AM - 6 PM)
- **Emergency:** 24/7 hotline for critical alerts
- **Training:** Included (onsite or webinar)
- **Termination:** 60 days notice
- **Data:** You own it, we delete within 30 days of termination

---

## 3. Healthcare & Medical

### 3.1 Market Size

**Total Addressable Market:**
- 6,100 hospitals in US
- 1.1 million physicians
- 280K dental practices
- 40K mental health practices
- **TAM: $2.1B/year**

### 3.2 Use Cases

#### **1. Appointment Reminders**
```
Hi Sarah, reminder: Dr. Smith appointment tomorrow at 2:00 PM.
Location: 123 Main St, Suite 200
Reply C to confirm, R to reschedule, X to cancel.
```

**ROI:** Reduces no-shows by 30-40% = $50-100 per prevented no-show

#### **2. Prescription Refill Reminders**
```
Your prescription for Lisinopril is due for refill.
Refills left: 0
Call 555-1234 or request online: pharmacy.example.com
```

#### **3. Lab Results Ready**
```
Your lab results are ready. Call 555-1234 to discuss with Dr. Smith,
or view online: portal.example.com (Login required)
```

#### **4. Post-Procedure Follow-Up**
```
Hi Sarah, checking in after your procedure yesterday.
How are you feeling? Any concerns?
Reply or call 555-1234 if you need assistance.
```

#### **5. Patient Recalls**
```
It's been 6 months since your last dental cleaning.
Time to schedule your next appointment!
Book online: dentist.example.com or call 555-1234
```

---

### 3.3 Product Features for Healthcare

```
IRIS for Healthcare
├── EHR/PM Integrations
│   ├── Epic
│   ├── Cerner
│   ├── Athena
│   ├── DrChrono
│   ├── AdvancedMD
│   └── Practice Fusion
│
├── Appointment Workflows
│   ├── Reminder scheduling (24h, 2h before)
│   ├── Two-way confirmation
│   ├── Rescheduling links
│   ├── No-show tracking
│   └── Waitlist management
│
├── HIPAA Compliance
│   ├── BAA (Business Associate Agreement)
│   ├── PHI encryption
│   ├── Audit logging
│   ├── Access controls
│   └── Data retention policies
│
└── Patient Portal Integration
    ├── Secure messaging
    ├── Appointment booking links
    ├── Bill pay links
    └── Telehealth links
```

---

### 3.4 Pricing for Healthcare

```
Small Practice (1-5 providers): $299/month
- 10,000 messages/month included
- EHR integration (1 provider)
- Basic features

Group Practice (6-20 providers): $799/month
- 50,000 messages/month included
- EHR integration (2 providers)
- All features
- Phone support

Enterprise (Hospital/Health System): Custom
- Unlimited messages
- Multiple EHR integrations
- Custom workflows
- Dedicated account manager
- HIPAA compliance consulting
```

---

## 4. Local Government & Public Safety

### 4.1 Market Size

**Total Addressable Market:**
- 19,500 municipalities
- 3,031 counties
- 50 state governments
- **TAM: $850M/year**

### 4.2 Use Cases

#### **1. Emergency Alerts** 🚨
```
TORNADO WARNING: Take shelter immediately.
Seek lowest level of building away from windows.
Monitor weather.gov for updates.
```

#### **2. Public Service Notifications**
```
Trash pickup delayed 1 day due to holiday.
Thursday pickup → Friday
Friday pickup → Saturday
```

#### **3. Utility Outages**
```
Planned water outage in your area:
When: Thursday 9 AM - 3 PM
Area: Oak St to Elm St
Questions: 555-1234
```

#### **4. Event Notifications**
```
City Council meeting tonight at 7 PM.
Agenda: Budget vote, zoning changes
Watch live: cityname.gov/live
Submit public comment: cityname.gov/comment
```

#### **5. Recreation Updates**
```
Youth soccer registration now open!
Ages 5-12, Spring season starts March 15
Register: cityname.gov/parks
Deadline: Feb 28
```

---

### 4.3 Product Features for Government

```
IRIS for Government
├── GIS Integration (map-based targeting)
├── Multi-language (critical for diverse populations)
├── Accessibility (ADA compliant)
├── Opt-in management (TCPA compliance)
├── Emergency alerting (IPAWS integration) ⭐ CRITICAL
├── Public records (all messages logged)
└── Multi-channel (SMS, Voice, Email, WEA, EAS, Push)
```

**IPAWS Integration (Game-Changer for Government Sales):**

- **Wireless Emergency Alerts (WEA)** - Reach EVERY cell phone in jurisdiction (no opt-in required)
- **Emergency Alert System (EAS)** - Interrupt TV/radio broadcasts
- **NOAA Weather Radio** - All-hazards radio network
- **Geographic Targeting** - County-wide or polygon-based (specific neighborhoods)
- **No Cost** - FEMA system is free (no per-alert fees)
- **Competitive Advantage** - Everbridge charges $50K-100K/year for IPAWS, we include it

**IPAWS Use Cases:**

1. **Tornado Warning** - WEA to all phones in affected area
2. **Evacuation Order** - Wildfire, chemical spill, flooding
3. **Boil Water Notice** - Water contamination (utilities)
4. **Amber Alert** - Child abduction (law enforcement)
5. **Shelter-in-Place** - Active shooter, hazmat incident
6. **All-Clear** - Cancel previous alert

**IPAWS Requirements (Customer provides):**

- FEMA authorization (30-60 day process)
- COG (Collaborative Operating Gateway) account
- COWS certificate (digital signature from FEMA)
- FEMA training (IS-247.A - free online course)
- 24/7 staffing (required by FEMA)

**IRIS Role:**

- Build CAP (Common Alerting Protocol) message generator
- Sign messages with customer's COWS certificate
- Submit to IPAWS-OPEN gateway
- Track WEA delivery (100% reach in < 1 minute)
- Update/cancel alerts as needed

**Sales Pitch:**

> "IRIS includes IPAWS integration at no additional cost. Everbridge charges $50,000-100,000/year for this capability. With IRIS, send Wireless Emergency Alerts that reach every cell phone in your jurisdiction—even people who haven't signed up for notifications. During a tornado or evacuation, you need 100% population reach. IPAWS provides that."

---

### 4.4 Pricing for Government

```
Small City (< 50K population): $1,500/month
Medium City (50K-250K): $3,500/month
Large City (250K+): $8,000/month

County: $5,000-15,000/month
State: Custom

Includes:
✓ Unlimited messages
✓ All features
✓ Training
✓ 24/7 emergency support
```

---

## 5. Small Business Marketing

### 5.1 Market Size

**Total Addressable Market:**
- 33.2 million small businesses in US
- Target: Service businesses (salons, restaurants, gyms, etc.)
- **TAM: $4.5B/year**

### 5.2 Use Cases

#### **1. Appointment Reminders (Salons, Spas)**
```
Hi Sarah, reminder: Haircut with Jessica tomorrow at 3 PM.
Reply C to confirm.
Cancel/reschedule: salon.example.com or call 555-1234
```

#### **2. Promotions (Restaurants)**
```
🍕 FLASH SALE: 50% off large pizzas tonight only!
Order: pizzaplace.com or call 555-1234
Promo code: FLASH50
Expires: 11 PM tonight
```

#### **3. Review Requests**
```
Thanks for visiting us today!
Love your experience? Leave us a review:
Google: bit.ly/review-us
Takes 30 seconds. We appreciate you!
```

#### **4. Loyalty Programs**
```
Congrats! You've earned a FREE coffee! ☕
Show this text at checkout to redeem.
Valid through Sunday.
```

---

### 5.3 Product Features for SMB

```
IRIS for Small Business
├── Contact Management (built-in CRM)
├── Campaigns (one-time + recurring)
├── Automated workflows
│   ├── Appointment reminders
│   ├── Follow-ups
│   ├── Birthday messages
│   └── Win-back campaigns
├── Analytics (ROI tracking)
└── Integrations
    ├── Square
    ├── Calendly
    ├── Google Calendar
    └── Zapier
```

---

### 5.4 Pricing for SMB

```
Starter: $49/month
- 500 messages/month
- 1,000 contacts
- Basic features

Growth: $149/month
- 5,000 messages/month
- 10,000 contacts
- All features
- Automation

Pro: $299/month
- 20,000 messages/month
- Unlimited contacts
- White-label
- Priority support
```

---

## 6-10. Other Verticals (Summary)

### **6. Real Estate & Property Management**
**Use cases:** Lease reminders, maintenance notifications, open house alerts
**TAM:** $650M/year

### **7. Non-Profits & Churches**
**Use cases:** Event reminders, donation campaigns, volunteer coordination
**TAM:** $420M/year

### **8. Financial Services**
**Use cases:** Payment reminders, fraud alerts, account notifications
**TAM:** $1.8B/year (highly regulated)

### **9. Hospitality & Travel**
**Use cases:** Booking confirmations, check-in reminders, special offers
**TAM:** $890M/year

### **10. Retail & E-Commerce**
**Use cases:** Order updates, shipping notifications, marketing campaigns
**TAM:** $2.3B/year

---

## 11. Build Order & Timeline

### **Recommended Sequence:**

```
Year 1:
├── Q1-Q2: Core API Platform
├── Q3: Schools (Vertical #1)
└── Q4: Healthcare (Vertical #2)

Year 2:
├── Q1: Local Government (Vertical #3)
├── Q2: Small Business (Vertical #4)
├── Q3: Real Estate (Vertical #5)
└── Q4: Scale + optimize

Year 3:
├── Expand to remaining verticals
├── International expansion
└── Acquisition/exit opportunities
```

### **Why This Order?**

1. **Schools** - Urgent need (emergency alerts), RFP season starts in spring
2. **Healthcare** - Proven ROI (reduce no-shows), recurring revenue
3. **Government** - Long sales cycle, start early for Year 2 revenue
4. **SMB** - Self-service, viral growth, diversification

---

## 12. Shared Components

**Build once, reuse for all verticals:**

✅ Contact management
✅ Message templates
✅ Scheduled sending
✅ Multi-channel routing
✅ Delivery tracking
✅ Analytics dashboard
✅ Two-way messaging
✅ Multi-language support
✅ Mobile apps (admin + end-user)
✅ Webhooks & API
✅ Billing & payments
✅ Compliance (TCPA, GDPR, etc.)

**Vertical-specific components:**

- SIS integration (Schools)
- EHR integration (Healthcare)
- GIS integration (Government)
- CRM (Small Business)
- Etc.

---

## Summary

**The vertical strategy gives you:**

1. ✅ **10x bigger market** - $13B+ TAM across all verticals vs $390M for just schools
2. ✅ **Defensible moat** - Hard for competitors to replicate 10 vertical products
3. ✅ **Higher margins** - 75-85% gross margins on vertical products vs 50-60% on API
4. ✅ **Diversified revenue** - Not dependent on one industry
5. ✅ **Valuation arbitrage** - Vertical SaaS trades at 10-15x revenue, infrastructure at 4-6x

**Bottom line:** Build the core once, wrap 10 different UIs around it, dominate multiple industries.

---

**Next Document:** IRIS Schools RFP Readiness Guide (complete checklist)
