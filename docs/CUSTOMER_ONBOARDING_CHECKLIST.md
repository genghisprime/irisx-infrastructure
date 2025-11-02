# IRISX Customer Onboarding Checklist

**Last Updated:** November 2, 2025
**Version:** 1.0
**Purpose:** Guide new customers through setup and first successful communication

---

## Table of Contents

1. [Pre-Onboarding](#pre-onboarding)
2. [Account Creation](#account-creation)
3. [Initial Configuration](#initial-configuration)
4. [First Voice Call Test](#first-voice-call-test)
5. [First SMS Test](#first-sms-test)
6. [First Email Test](#first-email-test)
7. [Agent Setup](#agent-setup)
8. [Advanced Features](#advanced-features)
9. [Go-Live Checklist](#go-live-checklist)
10. [Post-Launch Support](#post-launch-support)

---

## Pre-Onboarding

### Information to Collect (Before Onboarding Call)

**Company Information:**
- [ ] Company legal name
- [ ] Primary contact name and title
- [ ] Business email address
- [ ] Business phone number
- [ ] Company website
- [ ] Number of employees/agents
- [ ] Expected monthly call volume
- [ ] Expected monthly SMS volume
- [ ] Expected monthly email volume

**Technical Information:**
- [ ] IT contact name and email
- [ ] Preferred domain for email sending (e.g., notifications@company.com)
- [ ] Existing phone numbers to port (if any)
- [ ] CRM system in use (for potential integration)
- [ ] Preferred data center region (US East/West, EU, Asia)

**Use Case Information:**
- [ ] Primary use case (inbound support, outbound sales, notifications, etc.)
- [ ] Channels needed (Voice, SMS, Email, WhatsApp, Social)
- [ ] Peak hours of operation
- [ ] Compliance requirements (HIPAA, PCI-DSS, GDPR, etc.)
- [ ] SLA requirements
- [ ] Any custom features needed

---

## Account Creation

### Step 1: Create Tenant Account (Admin Task)

**Admin Portal Actions:**
```bash
1. Login to Admin Portal: http://3.83.53.69/
2. Navigate to: Tenants → Create New Tenant
3. Fill in form:
   - Company Name: [Customer Company Name]
   - Admin Email: [customer-admin@company.com]
   - Admin First Name: [First]
   - Admin Last Name: [Last]
   - Plan: [Starter / Professional / Enterprise]
   - Trial Days: [14 / 30 / Custom]
4. Click "Create Tenant"
5. Save the tenant ID (will need later)
```

**Expected Result:**
- Tenant account created
- Admin user created
- Welcome email sent to admin email
- Temporary password provided

**Verification:**
```bash
# Check tenant was created
psql -h <rds-endpoint> -U irisx_admin -d irisx_production \
  -c "SELECT id, company_name, status, plan FROM tenants WHERE company_name = 'Customer Company Name';"

# Should show: status = 'active', plan = selected plan
```

---

### Step 2: Customer Admin Login (Customer Task)

**Customer Instructions:**
```
1. Check email for "Welcome to IRISX" message
2. Note the temporary password
3. Visit: https://portal.irisx.com (or your custom domain)
4. Login with:
   - Email: [customer-admin@company.com]
   - Password: [temporary password from email]
5. You will be prompted to change password
6. Set a strong password (min 8 characters, uppercase, lowercase, number, special char)
7. After password change, you'll be logged in to Customer Portal dashboard
```

**Expected Result:**
- Customer successfully logged in
- Dashboard shows "Welcome to IRISX"
- Navigation menu visible on left
- Stats cards show zeros (no data yet)

**Troubleshooting:**
- **"Invalid credentials"**: Double-check email and temp password (case-sensitive)
- **"Account not found"**: Admin may not have created account yet
- **Password reset**: Use "Forgot Password" link on login page

---

## Initial Configuration

### Step 3: Generate API Keys (Customer Task)

**Customer Instructions:**
```
1. In Customer Portal, navigate to: Settings → API Keys
2. Click "+ Create API Key"
3. Fill in:
   - Name: "Production API Key"
   - Description: "For production application"
4. Click "Create"
5. IMPORTANT: Copy the API key immediately (shown only once)
6. Store API key securely (password manager, secrets vault)
7. Click "Done"
```

**Expected Result:**
- API key created and copied
- API key shown in list with masked value
- API key ready for use

**Verification (Customer):**
```bash
# Test API key with health check
curl -X GET https://api.irisx.com/v1/health \
  -H "X-API-Key: irisx_live_[your-key-here]"

# Should return: {"status":"ok","timestamp":"2025-11-02T12:00:00.000Z"}
```

---

### Step 4: Configure Webhooks (Optional - Customer Task)

**If Customer Needs Real-Time Notifications:**
```
1. In Customer Portal, navigate to: Settings → Webhooks
2. Click "+ Create Webhook"
3. Fill in:
   - Name: "Production Webhook"
   - URL: https://your-app.com/webhooks/irisx
   - Events: Select events to listen for:
     □ call.created
     □ call.answered
     □ call.completed
     □ sms.received
     □ email.opened
     □ whatsapp.received
     (select as many as needed)
   - Secret: [auto-generated, copy this]
4. Click "Test Webhook" to verify your endpoint is accessible
5. If test succeeds, click "Create"
```

**Expected Result:**
- Webhook created
- Test webhook succeeds (200 OK response from customer's server)
- Webhook shown in list as "Active"

**Customer Server Requirements:**
- HTTPS endpoint (no HTTP)
- Returns 200 OK within 5 seconds
- Verifies webhook signature (recommended)

**Webhook Signature Verification (Example in Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const computed = hmac.digest('hex');
  return computed === signature;
}

// In your webhook handler:
app.post('/webhooks/irisx', (req, res) => {
  const signature = req.headers['x-irisx-signature'];
  const payload = req.body;

  if (verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    // Process webhook
    console.log('Event:', payload.event);
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});
```

---

## First Voice Call Test

### Step 5: Provision Phone Number (Admin Task)

**Admin Portal Actions:**
```bash
1. Login to Admin Portal
2. Navigate to: Communications → Phone Numbers
3. Click "+ Provision Number"
4. Fill in:
   - Tenant: [Select customer tenant]
   - Provider: Twilio
   - Phone Number: +1-XXX-XXX-XXXX (from Twilio)
   - Cost Per Month: $1.00 (or actual cost)
5. Click "Provision"
```

**Alternative - Customer Brings Their Own Number:**
```bash
# If customer has existing Twilio account:
1. Customer provides their Twilio SIP credentials
2. Admin creates custom gateway in FreeSWITCH
3. Admin configures routing to customer's trunk
```

**Expected Result:**
- Phone number provisioned
- Number visible in customer's Phone Numbers list
- Number ready to receive/make calls

---

### Step 6: Make First Outbound Call (Customer Task)

**Customer Instructions:**
```
1. In Customer Portal, navigate to: Voice → Make Call
2. Fill in:
   - From Number: [Select your provisioned number]
   - To Number: [Your mobile phone for testing]
3. Click "Call"
4. Answer your mobile phone
5. You should hear a ringtone, then connection
6. Say "Testing IRISX" and verify audio quality
7. Hang up
```

**Expected Result:**
- Call connects within 5 seconds
- Audio is clear in both directions
- Call appears in Call Logs with status "completed"
- CDR saved with duration

**Verification (Customer):**
```
1. Navigate to: Voice → Call Logs
2. Find the test call
3. Verify:
   - Status: Completed
   - Duration: [actual call duration]
   - Recording: Available (if enabled)
```

**Troubleshooting:**
- **Call doesn't connect**: Check phone number format (+1XXXXXXXXXX)
- **No audio**: Check firewall allows UDP 16384-32768
- **One-way audio**: Contact support (NAT/firewall issue)

---

### Step 7: Test Inbound Call (Customer Task)

**Customer Instructions:**
```
1. From your mobile phone, call your provisioned IRISX number
2. Phone should ring
3. Answer will depend on configuration:
   - IVR: Follow menu options
   - Queue: Wait for agent
   - Direct: Connects immediately
4. Verify audio quality
5. Hang up
```

**Expected Result:**
- Inbound call works
- Call appears in Call Logs
- IVR/Queue behaves as configured

**Troubleshooting:**
- **Call goes to voicemail**: Check Twilio configuration
- **"Number not in service"**: Contact support
- **No answer**: Check agent availability or queue settings

---

## First SMS Test

### Step 8: Send First SMS (Customer Task)

**Via API:**
```bash
curl -X POST https://api.irisx.com/v1/sms/send \
  -H "X-API-Key: irisx_live_[your-key]" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1XXXXXXXXXX",
    "from": "+1YYYYYYYYYY",
    "message": "Hello from IRISX! This is a test message."
  }'
```

**Via Customer Portal:**
```
1. Navigate to: SMS → Send Message
2. Fill in:
   - To: [Your mobile phone]
   - From: [Your provisioned number]
   - Message: "Hello from IRISX!"
3. Click "Send"
4. Check your mobile phone for SMS
```

**Expected Result:**
- SMS delivers within 10 seconds
- Message appears in SMS → Messages list
- Status shows "delivered"

**Verification:**
```
1. Check your mobile phone
2. Verify message received
3. In Customer Portal: SMS → Messages
4. Find the message, status should be "delivered"
```

**Troubleshooting:**
- **Status "failed"**: Check phone number format
- **Not received**: Check mobile carrier (some block shortcodes)
- **Delayed**: Normal for some carriers (up to 30 seconds)

---

## First Email Test

### Step 9: Configure Email Sender Domain (Customer Task)

**DNS Configuration Required:**
```
1. In Customer Portal, navigate to: Email → Settings
2. You'll see required DNS records:

   SPF Record:
   Type: TXT
   Host: @
   Value: v=spf1 include:sendgrid.net ~all

   DKIM Record:
   Type: TXT
   Host: default._domainkey
   Value: [provided by system]

   DMARC Record:
   Type: TXT
   Host: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com

3. Add these records to your domain's DNS (GoDaddy, Cloudflare, etc.)
4. Wait 24-48 hours for DNS propagation
5. Click "Verify Domain" in portal
```

**Expected Result:**
- DNS records added
- Domain verified (after propagation)
- Ready to send emails

---

### Step 10: Send First Email (Customer Task)

**Via API:**
```bash
curl -X POST https://api.irisx.com/v1/email/send \
  -H "X-API-Key: irisx_live_[your-key]" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "from": "noreply@yourdomain.com",
    "subject": "Test Email from IRISX",
    "body": "<h1>Hello!</h1><p>This is a test email from IRISX.</p>",
    "text": "Hello! This is a test email from IRISX."
  }'
```

**Via Customer Portal:**
```
1. Navigate to: Email → Send Email
2. Fill in:
   - To: [Your email]
   - From: noreply@yourdomain.com
   - Subject: "Test Email"
   - Body: "Hello from IRISX!"
3. Click "Send"
4. Check your email inbox
```

**Expected Result:**
- Email delivers within 30 seconds
- Not in spam folder
- Status shows "delivered"

**Troubleshooting:**
- **In spam**: Check SPF/DKIM/DMARC records
- **Not received**: Check email address spelling
- **Bounce**: Verify sender domain matches DNS records

---

## Agent Setup

### Step 11: Create First Agent (Customer Task)

**Customer Instructions:**
```
1. Navigate to: Agents → Manage Agents
2. Click "+ Add Agent"
3. Fill in:
   - First Name: John
   - Last Name: Doe
   - Email: john.doe@company.com
   - Send Welcome Email: ✓
4. Click "Create Agent"
5. System will:
   - Create agent account
   - Auto-provision SIP extension (e.g., 8000)
   - Generate SIP password
   - Send welcome email to agent
```

**Expected Result:**
- Agent created
- Extension assigned
- Welcome email sent to agent
- Agent can login to Agent Desktop

---

### Step 12: Agent Login and First Call (Agent Task)

**Agent Instructions:**
```
1. Check email for "Welcome to IRISX - Agent Account"
2. Note login credentials:
   - Email: john.doe@company.com
   - Temporary Password: [from email]
   - Extension: 8000
   - SIP Password: [from email]
3. Visit: https://agent.irisx.com
4. Login with email and temp password
5. Change password when prompted
6. After login, you'll see Agent Desktop
7. Click "Connect" button (top right)
8. Status changes to "Available"
9. Test making a call:
   - Enter phone number in dialpad
   - Click "Call"
   - Verify call connects and audio works
```

**Expected Result:**
- Agent successfully connected via WebRTC
- Agent can make outbound calls
- Agent can receive inbound calls (if configured)

**Troubleshooting:**
- **Can't connect**: Check browser allows microphone access
- **No audio**: Check browser console for WebRTC errors
- **Call fails**: Verify gateway is registered (contact support)

---

## Advanced Features

### Step 13: Configure Call Queue (Customer Task - Optional)

**Customer Instructions:**
```
1. Navigate to: Voice → Queues
2. Click "+ Create Queue"
3. Fill in:
   - Name: "Support Queue"
   - Extension: 9001
   - Max Wait Time: 300 seconds
   - Strategy: longest-idle
   - Music on Hold: default
   - Overflow Action: voicemail
4. Click "Create"
5. Add agents to queue:
   - Click queue name
   - Click "Add Agent"
   - Select agent(s)
   - Click "Add"
```

**Expected Result:**
- Queue created
- Agents assigned
- Inbound calls can be routed to queue

---

### Step 14: Create Email Campaign (Customer Task - Optional)

**Customer Instructions:**
```
1. Navigate to: Email → Campaigns
2. Click "+ Create Campaign"
3. Select template or create new
4. Upload contact list (CSV):
   - Format: email,first_name,last_name
   - Example:
     john@example.com,John,Doe
     jane@example.com,Jane,Smith
5. Schedule or send now
6. Monitor campaign results
```

**Expected Result:**
- Campaign created
- Emails queued for sending
- Real-time stats visible

---

### Step 15: Setup WhatsApp (Customer Task - Optional)

**Requirements:**
- Meta Business Account
- WhatsApp Business Account
- Approved phone number

**Customer Instructions:**
```
1. Navigate to: WhatsApp → Settings
2. Click "Connect WhatsApp Business"
3. You'll need:
   - WhatsApp Business Phone Number ID
   - WhatsApp Business Account ID
   - Access Token (from Meta Business)
4. Enter credentials
5. Click "Connect"
6. Configure webhook:
   - Callback URL: [provided by system]
   - Verify Token: [provided by system]
7. Test by sending message via portal
```

**Expected Result:**
- WhatsApp connected
- Can send/receive messages
- Webhook receiving updates

---

## Go-Live Checklist

### Pre-Launch Verification (48 hours before go-live)

**System Health:**
- [ ] All services running (API, FreeSWITCH, Workers)
- [ ] Database backups enabled
- [ ] Monitoring configured
- [ ] Alerting working

**Customer Configuration:**
- [ ] All agents created and tested
- [ ] Phone numbers provisioned and tested
- [ ] Email domain verified
- [ ] Webhooks tested
- [ ] Call queues configured
- [ ] IVR flows tested

**Documentation:**
- [ ] Customer has API documentation
- [ ] Customer has integration guide
- [ ] Support contact info provided
- [ ] SLA documented

**Testing:**
- [ ] Voice calls (inbound/outbound) ✓
- [ ] SMS (send/receive) ✓
- [ ] Email (send) ✓
- [ ] WhatsApp (if enabled) ✓
- [ ] Webhooks receiving events ✓
- [ ] Agent Desktop working ✓
- [ ] Customer Portal accessible ✓

---

### Go-Live Day Checklist

**Morning (8:00 AM):**
- [ ] System health check
- [ ] Verify all agents online
- [ ] Test one call, SMS, email
- [ ] Monitor dashboards ready
- [ ] Support team on standby

**During Business Hours:**
- [ ] Monitor call volume every hour
- [ ] Check for any errors in logs
- [ ] Respond to customer questions quickly
- [ ] Track any issues in tracking system

**End of Day:**
- [ ] Review metrics (calls, SMS, emails sent)
- [ ] Check for any failed messages
- [ ] Customer satisfaction check-in
- [ ] Document any issues encountered

---

## Post-Launch Support

### Week 1 Check-in (Day 3)

**Questions to Ask Customer:**
1. How is call quality?
2. Any issues with agents?
3. Are webhooks working as expected?
4. Any feature requests?
5. Do you need additional training?

**Metrics to Review:**
- Total calls handled
- Average call duration
- SMS delivery rate
- Email delivery rate
- Any system errors

---

### Week 2 Check-in (Day 10)

**Review:**
1. Usage patterns (peak hours, volume)
2. Any recurring issues?
3. Performance optimization needed?
4. Additional features needed?

**Optimization:**
- Scale resources if needed
- Adjust queue strategies
- Add more agents if needed
- Optimize API usage

---

### Month 1 Review (Day 30)

**Business Review:**
- Monthly usage report
- Cost analysis
- ROI discussion
- Growth planning

**Technical Review:**
- System performance
- Uptime percentage
- Average response times
- Any incidents

**Next Steps:**
- Plan for Month 2
- Feature requests prioritization
- Contract renewal discussion (if trial)

---

## Support Contacts

**For Urgent Issues (P0/P1):**
- Email: support@irisx.com
- Phone: +1-XXX-XXX-XXXX
- Slack: #irisx-support (if invited)

**For General Questions:**
- Email: support@irisx.com
- Documentation: https://docs.irisx.com
- Community Forum: https://community.irisx.com

**For Billing:**
- Email: billing@irisx.com
- Portal: Customer Portal → Billing

**For Technical Integration:**
- Email: integrations@irisx.com
- API Docs: https://docs.irisx.com/api

---

## Appendix: Quick Reference

### Phone Number Formats
- US: +12025551234
- UK: +442071234567
- Always use E.164 format

### API Rate Limits
- Calls: 10/minute
- SMS: 100/minute
- Email: 1000/minute
- Other endpoints: 100/minute

### Supported Countries
- Voice: US, CA, UK, AU (50+ countries)
- SMS: US, CA, UK (100+ countries)
- Email: Worldwide
- WhatsApp: Worldwide (Meta approved)

### Data Retention
- Call recordings: 90 days (configurable)
- CDR: 2 years
- Messages: 1 year
- Logs: 30 days

---

**End of Customer Onboarding Checklist**
