# IRISX Beta Customer Onboarding Checklist

**Target:** Onboard first 5 beta customers
**Timeline:** Week 12
**Free Credits:** $100 per customer

---

## Pre-Onboarding (Before Contact)

### Prerequisites
- [ ] API deployed and stable (http://54.160.220.243:3000)
- [ ] Documentation published at docs.useiris.com
- [ ] Node.js SDK published to npm
- [ ] Example code repository public on GitHub
- [ ] Customer portal deployed (portal.useiris.com)
- [ ] Support channels ready (Discord, email)
- [ ] Monitoring dashboards configured

### Beta Program Materials
- [ ] Beta program landing page
- [ ] Beta application form
- [ ] Terms of service (beta version)
- [ ] Privacy policy
- [ ] SLA expectations (beta: 95% uptime)

---

## Customer Identification

### Target Beta Customers (10 prospects → 5 customers)

**Ideal Beta Customer Profile:**
- Small to medium business (10-100 employees)
- Currently using communications API (Twilio, Plivo, Vonage)
- Technical team (can integrate APIs)
- Use cases: Customer support, notifications, marketing
- Willing to provide feedback
- Not mission-critical use case (beta tolerance)

**Outreach Channels:**
1. **LinkedIn** - Direct outreach to CTOs/Developers
2. **Reddit** - r/startups, r/SaaS, r/selfhosted
3. **Product Hunt** - Beta launch announcement
4. **Hacker News** - Show HN post
5. **Discord/Slack** - Developer communities
6. **Email** - Existing network/contacts
7. **Twitter/X** - Developer audience

**Outreach Message Template:**
```
Subject: Early Access to IRISX - Multi-Channel Communications API

Hi [Name],

I'm launching IRISX, a new communications platform for voice, SMS, and email.

We're looking for 5 beta partners to help us refine the product. Beta customers get:
- $100 in free credits (no credit card required)
- Direct access to our engineering team
- Influence on feature roadmap
- Discounted pricing after beta (50% off for 6 months)

Our API is simpler than Twilio with better pricing ($0.015/min vs $0.025/min for voice).

Interested? Reply and I'll send you access details.

Thanks,
Ryan
Founder, IRISX
```

---

## Customer Onboarding Flow

### Step 1: Application & Approval (Day 0)
- [ ] Customer applies via form
- [ ] Review application (use case, technical capability)
- [ ] Approve/reject within 24 hours
- [ ] Send welcome email with next steps

**Welcome Email Template:**
```
Subject: Welcome to IRISX Beta! 🎉

Hi [Name],

Welcome to the IRISX beta program! We're excited to have [Company] on board.

Here's what happens next:

1. **Account Setup** (Today)
   - Visit https://portal.useiris.com/signup
   - Use code: BETA-[UNIQUE-CODE]
   - This automatically adds $100 in credits

2. **Documentation** (15 minutes)
   - Read our quickstart: https://docs.useiris.com/quickstart
   - API reference: https://docs.useiris.com/api-reference
   - Code examples: https://github.com/irisx/examples

3. **Onboarding Call** (Schedule below)
   - We'll walk you through integration
   - Answer any questions
   - Set up your use case

Schedule your onboarding call: [Calendly Link]

Join our Discord for support: https://discord.gg/irisx

Looking forward to working with you!

Best,
Ryan
IRISX Founder
```

### Step 2: Account Creation (Day 0-1)
- [ ] Customer signs up at portal.useiris.com
- [ ] Enters beta code for $100 credits
- [ ] Verify email address
- [ ] Complete profile (company name, use case)
- [ ] System auto-approves with beta code

**Post-Signup Automation:**
- Send confirmation email
- Add to Discord channel (#beta-customers)
- Add to beta customers spreadsheet
- Send Slack notification to team
- Schedule onboarding call reminder

### Step 3: Onboarding Call (Day 1-3)
**Duration:** 30-45 minutes
**Attendees:** Customer tech lead + IRISX founder/engineer

**Agenda:**
1. **Introductions** (5 min)
   - Customer's background and use case
   - IRISX overview and roadmap

2. **Technical Walkthrough** (15 min)
   - API authentication (API keys vs JWT)
   - Making first call/SMS
   - Webhook setup
   - Error handling

3. **Use Case Deep Dive** (15 min)
   - Customer's specific requirements
   - Feature availability check
   - Integration architecture
   - Timeline and milestones

4. **Support & Resources** (5 min)
   - How to get help (Discord, email, docs)
   - Response time expectations (< 2 hours)
   - Weekly check-in schedule
   - Feedback channels

**Onboarding Call Checklist:**
- [ ] Share screen with documentation
- [ ] Live demo: Make test call
- [ ] Show customer portal features
- [ ] Review API keys and security
- [ ] Set up webhook endpoint together
- [ ] Answer all technical questions
- [ ] Schedule next check-in

### Step 4: First Integration (Day 3-7)
**Goal:** Customer makes first successful API call

**Support Activities:**
- [ ] Monitor customer's API usage
- [ ] Watch for errors in dashboard
- [ ] Proactive outreach if stuck
- [ ] Code review if requested
- [ ] Help debug integration issues

**Milestone Checklist:**
- [ ] First API call successful
- [ ] Webhooks configured and receiving events
- [ ] Phone number purchased (if needed)
- [ ] First production call/SMS sent
- [ ] Error handling implemented
- [ ] Customer confident with API

**Celebration Email:**
```
Subject: 🎉 First Call Success!

Hi [Name],

Congratulations! I see you just made your first successful call through IRISX.

That's a huge milestone! Here's what's next:

- Keep testing and integrating
- Join our weekly check-in (Fridays 2pm PT)
- Share any feedback in Discord
- Let me know if you need anything

We're here to help you succeed!

Best,
Ryan
```

### Step 5: Weekly Check-ins (Ongoing)
**Schedule:** Every Friday, 30 minutes

**Check-in Format:**
1. **Usage Review** (5 min)
   - Volume metrics (calls, SMS, emails)
   - Success rates
   - Error patterns
   - Cost tracking

2. **Feedback Session** (15 min)
   - What's working well?
   - Pain points or blockers?
   - Feature requests
   - Documentation gaps

3. **Roadmap Preview** (5 min)
   - Upcoming features
   - Beta timeline
   - GA pricing preview

4. **Action Items** (5 min)
   - Customer commitments
   - IRISX commitments
   - Timeline for resolution

**Check-in Notes Template:**
```
# Beta Check-in: [Company Name] - [Date]

## Attendees
- Customer: [Names]
- IRISX: [Names]

## Usage Metrics (Past Week)
- Calls: [X] total, [Y]% success rate
- SMS: [X] sent, [Y]% delivered
- Errors: [List top 3]
- Credits used: $[X] / $100

## Feedback
- Positive: [List]
- Pain points: [List]
- Feature requests: [List]
- Documentation issues: [List]

## Action Items
- [ ] IRISX: [Action, Owner, Due Date]
- [ ] Customer: [Action, Owner, Due Date]

## Next Check-in
- Date: [Date]
- Agenda: [Topics]
```

---

## Beta Program Success Criteria

### Customer Success Metrics
- [ ] Customer makes first API call within 7 days
- [ ] Customer sends production traffic within 14 days
- [ ] Customer uses $50+ of $100 credits
- [ ] Customer attends 3+ weekly check-ins
- [ ] Customer provides feedback (survey score 8+/10)

### Product Quality Metrics
- [ ] API uptime > 95% during beta
- [ ] Average response time < 500ms
- [ ] Error rate < 2%
- [ ] Support response time < 2 hours
- [ ] Zero critical bugs

### Feedback Collection
- [ ] Weekly satisfaction score (1-10)
- [ ] Feature request log
- [ ] Bug report log
- [ ] Documentation feedback
- [ ] Pricing feedback

---

## Beta Graduation (Week 16-18)

### Graduation Criteria (Per Customer)
- Used > $75 of $100 credits
- Integrated into production system
- Provided substantive feedback
- No critical blockers
- Willing to become paying customer

### Graduation Offer
**Early Adopter Pricing:**
- 50% off standard pricing for 6 months
- Priority support (< 1 hour response)
- Dedicated customer success manager
- Feature request priority
- Case study opportunity (optional)

**Graduation Email:**
```
Subject: IRISX Beta Graduation - Special Offer Inside

Hi [Name],

Amazing work these past few weeks! You've been an incredible beta partner.

Your feedback helped us:
- [Specific improvement 1]
- [Specific improvement 2]
- [Specific improvement 3]

We're moving to General Availability on [Date]. Here's your exclusive offer:

**Early Adopter Pricing:**
- 50% off for 6 months ($0.0075/min voice, $0.00375/SMS)
- Priority support (< 1 hour response)
- Free white-glove migration assistance
- Lock in this rate by [Date + 2 weeks]

Ready to continue? Reply to this email or book time: [Link]

Thank you for being part of our journey!

Best,
Ryan
```

---

## Support Infrastructure

### Discord Server
**Channels:**
- #announcements - Product updates
- #beta-customers - Private channel
- #general - Community chat
- #api-help - Technical support
- #feature-requests - Ideas and requests
- #bugs - Bug reports

### Support SLA (Beta)
- **Response Time:** < 2 hours (business hours)
- **Resolution Time:** < 24 hours (non-critical)
- **Availability:** Mon-Fri 8am-6pm PT
- **Emergency:** founder@useiris.com (24/7)

### Documentation
- Quickstart guide: https://docs.useiris.com/quickstart
- API reference: https://docs.useiris.com/api-reference
- SDKs: https://docs.useiris.com/sdks
- Examples: https://github.com/irisx/examples
- Status page: https://status.useiris.com

---

## Tracking & Metrics

### Customer Tracking Spreadsheet
**Columns:**
- Company Name
- Contact Name & Email
- Application Date
- Status (Applied, Approved, Onboarding, Active, Graduated, Churned)
- Use Case
- Weekly Usage (Calls, SMS, Email)
- Credits Used / $100
- Last Check-in Date
- Satisfaction Score (1-10)
- Feedback Summary
- Action Items
- Notes

### Weekly Beta Report
**Metrics to Track:**
- Total active beta customers
- API calls this week (total, by customer)
- Success rate
- Error rate
- Average response time
- Support tickets (open, resolved)
- Feature requests (new, completed)
- Customer satisfaction (average score)

---

## Beta Customer Rewards

### Incentives for Participation
1. **$100 free credits** (no credit card)
2. **50% discount** for 6 months after beta
3. **Feature request priority** - Build what they need
4. **Direct founder access** - Weekly 1:1 calls
5. **Early access** to new features
6. **Case study opportunity** - Get exposure
7. **Referral bonus** - $200 credits per referral
8. **Beta alumni badge** - In customer portal

---

## Exit Criteria

### Successful Beta Exit
- 5+ active beta customers
- 50,000+ API calls processed
- 99%+ success rate
- < 2% error rate
- 95%+ uptime
- 8+ average satisfaction score
- 80%+ conversion to paid (4/5 customers)

### Go/No-Go Decision (Week 18)
**GO if:**
- All exit criteria met
- No critical bugs
- Positive customer feedback
- Infrastructure stable
- Documentation complete
- Support processes proven

**NO-GO if:**
- < 3 active customers
- Critical bugs unresolved
- < 95% uptime
- < 7 average satisfaction
- Infrastructure issues

---

## Templates & Resources

### Email Templates
- ✅ Welcome email (above)
- ✅ First success celebration (above)
- ✅ Weekly check-in invite
- ✅ Graduation offer (above)
- ✅ Feedback request
- ✅ Beta extension (if needed)

### Documents
- [ ] Beta program terms & conditions
- [ ] Acceptable use policy
- [ ] Data processing agreement (GDPR)
- [ ] SLA document
- [ ] Pricing sheet (beta vs GA)

### Tools
- [ ] Calendly - Scheduling
- [ ] Discord - Community & support
- [ ] Google Sheets - Customer tracking
- [ ] Typeform - Feedback surveys
- [ ] Intercom - In-app messaging (optional)
- [ ] Sentry - Error tracking
- [ ] DataDog - Monitoring (optional)

---

## Automation Checklist

### Automated Workflows
- [ ] Beta code redemption → Add credits
- [ ] New signup → Send welcome email
- [ ] First API call → Send celebration email
- [ ] Error spike → Alert team
- [ ] Weekly check-in reminder → Send calendar invite
- [ ] Credit balance low → Notify customer & team
- [ ] 30 days inactive → Re-engagement email

---

**Status:** Ready to execute
**Next Step:** Begin outreach to 10 prospects
**Goal:** 5 active beta customers by Week 13
