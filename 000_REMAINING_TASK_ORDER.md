# 000 - REMAINING TASK ORDER
## IRISX/Tazzi Platform - Implementation Sequence

**Last Updated:** November 4, 2025
**Strategy:** Quick Wins → MVP Validation → Infrastructure → AI Features
**Estimated Total Time:** 145-199 hours (excluding payment integration per user request)

---

## 📋 TASK EXECUTION ORDER

### **PHASE 1: QUICK WINS** ⚡ (Week 1: 5-9 hours)
*Goal: Validate platform with zero external costs, get documentation in place*

#### **TASK 1: Add Dry Run Mode to Load Tests** (30 mins)
**Why First:** Enables safe load testing without $15-20 cost
**Files to Modify:**
- `api/src/routes/calls.js` - Add dry_run parameter
- `api/src/routes/sms.js` - Add dry_run parameter
- `api/src/services/sms.js` - Add dry_run support
- `load-tests/scripts/calls-load-test.js` - Add DRY_RUN env var
- `load-tests/scripts/sms-load-test.js` - Add DRY_RUN env var

**Acceptance Criteria:**
- [ ] Calls with `dry_run: true` skip FreeSWITCH but create DB records
- [ ] SMS with `dry_run: true` skip provider but create DB records
- [ ] Load test scripts accept `--env DRY_RUN=true`
- [ ] Test with single dry_run call - verify DB record created

**Testing:**
```bash
# Test dry_run works
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"to":"+15551234567","from":"+18326378414","dry_run":true}'
```

---

#### **TASK 2: Execute Load Tests (Dry Run)** (2-3 hours)
**Why Second:** Validate capacity limits with zero cost
**Dependencies:** Task 1 complete

**Steps:**
1. Run API stress test (dry run) - find breaking point
2. Run SMS load test (dry run) - 200 msgs/min
3. Run calls load test (dry run) - 100 concurrent VUs, 30 min
4. Monitor CloudWatch metrics during tests
5. Document capacity limits

**Commands:**
```bash
cd load-tests

# Test 1: API Stress (find breaking point)
k6 run scripts/api-stress-test.js \
  --env API_URL=http://3.83.53.69:3000 \
  --env API_KEY=your_key

# Test 2: SMS Load (dry run)
k6 run scripts/sms-load-test.js \
  --env API_URL=http://3.83.53.69:3000 \
  --env API_KEY=your_key \
  --env DRY_RUN=true

# Test 3: Calls Load (dry run)
k6 run scripts/calls-load-test.js \
  --env API_URL=http://3.83.53.69:3000 \
  --env API_KEY=your_key \
  --env DRY_RUN=true
```

**Acceptance Criteria:**
- [ ] System handles 100 concurrent VUs (dry run)
- [ ] >98% success rate
- [ ] API response time <2s (p95)
- [ ] No database connection pool exhaustion
- [ ] No memory leaks detected
- [ ] Capacity limits documented

**Deliverable:** Load test results document with max capacity, bottlenecks found

---

#### **TASK 3: Execute Real Call Validation (10 calls)** (30 mins)
**Why Third:** Validate end-to-end integration with minimal cost ($0.05)
**Dependencies:** Task 2 complete

**Steps:**
1. Create small k6 script (10 iterations, 1 VU)
2. Run 10 real calls to your test number (+17137057323)
3. Verify CDR updates in real-time
4. Verify call status transitions (initiated→ringing→answered→completed)
5. Check for any errors

**Commands:**
```bash
# Create small test script
cat > load-tests/scripts/calls-validation-test.js <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 1,
  iterations: 10,
};

const API_URL = __ENV.API_URL || 'http://3.83.53.69:3000';
const API_KEY = __ENV.API_KEY;

export default function() {
  const payload = JSON.stringify({
    to: '+17137057323',
    from: '+18326378414',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  };

  const res = http.post(`${API_URL}/v1/calls`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has call_sid': (r) => JSON.parse(r.body).sid !== undefined,
  });

  sleep(30); // Wait 30s between calls
}
EOF

# Run validation test
k6 run scripts/calls-validation-test.js \
  --env API_URL=http://3.83.53.69:3000 \
  --env API_KEY=your_key
```

**Acceptance Criteria:**
- [ ] 10/10 calls successful
- [ ] CDR records created for all calls
- [ ] Call status updates correctly (initiated→ringing→completed)
- [ ] No errors in orchestrator logs
- [ ] Total cost <$0.10

**Deliverable:** Validation report confirming end-to-end integration works

---

#### **TASK 4: Verify Call Status Webhooks** (1-2 hours)
**Why Fourth:** 95% done, just needs verification
**Dependencies:** Task 3 complete (can test with real calls)

**Steps:**
1. Review orchestrator.js ESL event handlers
2. Make test call
3. Monitor orchestrator logs for ESL events
4. Verify CDR updates in real-time
5. Test webhook delivery to customer URL (use webhook.site)
6. Document webhook payloads

**Commands:**
```bash
# Terminal 1: Monitor orchestrator
ssh ubuntu@3.83.53.69
pm2 logs orchestrator

# Terminal 2: Make test call with webhook URL
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "to":"+17137057323",
    "from":"+18326378414",
    "metadata":{"webhook_url":"https://webhook.site/your-unique-url"}
  }'

# Check webhook.site for delivered events
```

**Acceptance Criteria:**
- [ ] Call status updates within 2 seconds
- [ ] CDR shows correct status transitions
- [ ] Webhook events delivered to customer URLs
- [ ] Event payloads match API spec
- [ ] Retry logic works on webhook failure

**Deliverable:** Webhook documentation with example payloads

---

#### **TASK 5: TTS Caching Documentation** (2-4 hours)
**Why Fifth:** Code works perfectly, customers need guidance to avoid 1000x costs
**Dependencies:** None (documentation only)

**Steps:**
1. Add comprehensive header comments to `api/src/services/tts.js`
2. Create cost comparison table
3. Add code examples (static vs personalized)
4. Write "How to Save 99% on TTS Costs" guide
5. Document cache key generation logic
6. Document cache cleanup schedule

**Files to Create/Modify:**
- `api/src/services/tts.js` - Add header documentation
- `docs/guides/tts-cost-optimization.mdx` - Create cost guide
- `docs/api-reference/tts.mdx` - Add caching section

**Content to Add:**
```javascript
// api/src/services/tts.js - Add at top of file (after imports)
/**
 * TTS SERVICE - INTELLIGENT CACHING STRATEGY
 *
 * COST OPTIMIZATION:
 * -----------------
 * Static Messages: Generate once, reuse forever
 *   Example: "School is closed today"
 *   - 1 TTS call serves unlimited recipients
 *   - 1000 calls = $0.015 (99.9% cost savings)
 *
 * Personalized Messages: Each unique text generates new TTS
 *   Example: "Hello {{parent_name}}, {{child_name}} was absent"
 *   - Each recipient gets unique message
 *   - 1000 calls = $15.00 (no caching benefit)
 *
 * CACHE KEY GENERATION:
 *   SHA256(text + voice + provider)
 *   Same text + same voice = cache hit
 *
 * CACHE STORAGE:
 *   Location: /tmp/tts-cache/
 *   Retention: 30 days
 *   Cleanup: Daily at 3 AM
 *
 * COST COMPARISON TABLE:
 * | Scenario              | Recipients | TTS Calls | Cost @ $0.015/1K chars |
 * |-----------------------|-----------|-----------|------------------------|
 * | Emergency Alert       | 1,000     | 1         | $0.015 ✅              |
 * | School Closure        | 10,000    | 1         | $0.015 ✅              |
 * | Personalized Alert    | 1,000     | 1,000     | $15.00 ⚠️              |
 * | Personalized Alert    | 10,000    | 10,000    | $150.00 ⚠️             |
 *
 * BEST PRACTICES:
 * 1. Use static messages whenever possible
 * 2. Batch personalization (e.g., "Press 1 for John, Press 2 for Sarah")
 * 3. Split static intro + personalized follow-up
 * 4. Cache common phrases and reuse
 */
```

**Acceptance Criteria:**
- [ ] TTS service has comprehensive header documentation
- [ ] Cost comparison table in header comments
- [ ] API docs include caching explanation
- [ ] Customer-facing best practices guide published
- [ ] Code examples show static vs personalized
- [ ] Cache behavior clearly explained

**Deliverable:** Complete TTS cost optimization documentation

---

### **PHASE 2: MVP VALIDATION** 🎯 (Week 2: 4-5 hours)
*Goal: Ensure platform works end-to-end with real usage patterns*

#### **TASK 6: Campaign End-to-End Testing** (1-2 hours)
**Why Sixth:** Backend 100% complete, just needs E2E validation
**Dependencies:** Load testing complete (validates worker capacity)

**Steps:**
1. Upload 100 test contacts via API
2. Create voice campaign with progressive dialer
3. Monitor campaign execution (orchestrator logs)
4. Verify campaign stats update correctly
5. Test pause/resume/stop controls
6. Verify CDR records for all campaign calls

**Commands:**
```bash
# Create test contacts
curl -X POST http://3.83.53.69:3000/v1/contacts/import \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "contacts": [
      {"phone": "+15551234567", "name": "Test Contact 1"},
      {"phone": "+15551234568", "name": "Test Contact 2"},
      ... (100 contacts)
    ]
  }'

# Create campaign
curl -X POST http://3.83.53.69:3000/v1/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Campaign",
    "type": "voice",
    "contact_list_id": "uuid-from-above",
    "message": "This is a test campaign message",
    "schedule": "immediate",
    "rate_limit": {
      "calls_per_hour": 60
    }
  }'

# Monitor campaign
pm2 logs orchestrator

# Test controls
curl -X POST http://3.83.53.69:3000/v1/campaigns/{id}/pause
curl -X POST http://3.83.53.69:3000/v1/campaigns/{id}/resume
curl -X POST http://3.83.53.69:3000/v1/campaigns/{id}/stop
```

**Acceptance Criteria:**
- [ ] Campaign completes 100 contacts successfully
- [ ] Stats accurate (completed, failed, pending counts)
- [ ] Controls work (pause/resume/stop)
- [ ] CDR records created for all calls
- [ ] No memory leaks in orchestrator
- [ ] Rate limiting respected

**Deliverable:** Campaign testing report with stats and screenshots

---

#### **TASK 7: Monitoring Enhancement** (2-3 hours)
**Why Seventh:** Infrastructure monitored, add application-level metrics
**Dependencies:** Load testing reveals what metrics matter

**Steps:**
1. Add custom CloudWatch metrics for call success rate
2. Add custom CloudWatch metrics for API error rate
3. Create CloudWatch alarms for these metrics
4. Test alarm triggering
5. Create incident response runbook

**Files to Create:**
- `scripts/cloudwatch-custom-metrics.js` - Emit custom metrics
- `docs/runbooks/high-call-failure-rate.md` - Incident runbook
- `docs/runbooks/high-api-error-rate.md` - Incident runbook

**AWS Commands:**
```bash
# Create call success rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-Call-Success-Rate-Low" \
  --alarm-description "Alert when call success rate drops below 95%" \
  --metric-name "CallSuccessRate" \
  --namespace "IRISX/Production" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 95 \
  --comparison-operator LessThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:IRISX-Production-Alerts

# Create API error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-API-Error-Rate-High" \
  --alarm-description "Alert when API error rate exceeds 1%" \
  --metric-name "APIErrorRate" \
  --namespace "IRISX/Production" \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:IRISX-Production-Alerts
```

**Code to Add:**
```javascript
// api/src/middleware/metrics.js - Create new file
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: 'us-east-1' });

export async function emitCallMetric(success) {
  await cloudwatch.putMetricData({
    Namespace: 'IRISX/Production',
    MetricData: [{
      MetricName: 'CallSuccessRate',
      Value: success ? 100 : 0,
      Unit: 'Percent',
      Timestamp: new Date()
    }]
  });
}

export async function emitAPIErrorMetric(isError) {
  await cloudwatch.putMetricData({
    Namespace: 'IRISX/Production',
    MetricData: [{
      MetricName: 'APIErrorRate',
      Value: isError ? 100 : 0,
      Unit: 'Percent',
      Timestamp: new Date()
    }]
  });
}
```

**Acceptance Criteria:**
- [ ] Custom metrics for call success rate working
- [ ] Custom metrics for API error rate working
- [ ] Alarms fire when thresholds exceeded
- [ ] SNS notifications received
- [ ] Runbooks created for common incidents
- [ ] Test alarm triggering manually

**Deliverable:** Enhanced monitoring with application-level metrics + runbooks

---

#### **TASK 8: Beta Customer Onboarding (Start)** (2-3 hours)
**Why Eighth:** Platform validated, ready for real users
**Dependencies:** Load testing + campaign testing complete

**Steps:**
1. Create beta onboarding checklist
2. Identify 10 potential beta customers
3. Create beta onboarding email template
4. Schedule first onboarding call
5. Onboard 1 pilot customer
6. Provide $100 free credits
7. Set up weekly check-in
8. Monitor usage closely

**Files to Create:**
- `docs/beta/onboarding-checklist.md` - Checklist
- `docs/beta/beta-customer-list.md` - Potential customers
- `docs/beta/email-template.md` - Outreach template
- `docs/beta/onboarding-script.md` - Call script

**Acceptance Criteria:**
- [ ] Beta onboarding checklist created
- [ ] 10 potential beta customers identified
- [ ] Email outreach sent to 10 prospects
- [ ] 1 pilot customer onboarded successfully
- [ ] $100 credits provided
- [ ] Weekly check-in scheduled
- [ ] Usage monitoring dashboard set up

**Deliverable:** First beta customer onboarded and active

**Note:** This is ongoing - will continue through next phases

---

### **PHASE 3: INFRASTRUCTURE HARDENING** 🏗️ (Weeks 3-5: 20-30 hours)
*Goal: Production-grade infrastructure and deployment*

#### **TASK 9: Vercel Migration for All Frontends** (4-6 hours)
**Why Ninth:** Low risk, high productivity gain
**Dependencies:** None (S3 working as fallback)

**Steps:**
1. Create Vercel account (if not exists)
2. Create 3 Vercel projects (Customer Portal, Admin Portal, Agent Desktop)
3. Configure build settings for Vue/Vite
4. Set up environment variables
5. Deploy to preview URLs first
6. Test all functionality on preview URLs
7. Configure custom domains
8. Update DNS to point to Vercel
9. Verify SSL certificates working
10. Set up automatic deployments on git push
11. Test preview deployments for feature branches

**Commands:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy Customer Portal
cd irisx-customer-portal
vercel --prod

# Deploy Admin Portal
cd ../irisx-admin-portal
vercel --prod

# Deploy Agent Desktop
cd ../irisx-agent-desktop
vercel --prod

# Configure custom domains in Vercel dashboard:
# - app.tazzi.com → irisx-customer-portal
# - admin.tazzi.com → irisx-admin-portal
# - agent.tazzi.com → irisx-agent-desktop
```

**Vercel Configuration (vercel.json):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Acceptance Criteria:**
- [ ] All 3 frontends deployed to Vercel
- [ ] Preview URLs working and tested
- [ ] Custom domains configured (app.tazzi.com, admin.tazzi.com, agent.tazzi.com)
- [ ] SSL certificates active
- [ ] Automatic deployments on git push to main
- [ ] Preview deployments for feature branches
- [ ] Performance equal or better than S3/CloudFront
- [ ] S3 buckets kept as backup

**Deliverable:** All frontends on Vercel with automatic deployments

---

#### **TASK 10: AWS Multi-AZ Load Balancing & High Availability** (16-24 hours)
**Why Tenth:** Critical for production, eliminates single point of failure
**Dependencies:** Vercel migration (clean separation of concerns)

**WARNING:** This is complex infrastructure work. Plan for a full day. Do NOT do this right before customer demos.

**Steps:**

**Part 1: Create Application Load Balancer (4-6 hours)**
1. Create ALB in us-east-1
2. Create target group for API servers
3. Configure health checks
4. Update security groups
5. Test ALB health checks

**Part 2: Multi-AZ API Deployment (6-8 hours)**
1. Launch new API instance in us-east-1b (duplicate existing us-east-1a)
2. Install all dependencies on new instance
3. Configure PM2 on new instance
4. Add both instances to ALB target group
5. Test load distribution
6. Update DNS to point to ALB

**Part 3: Auto-Scaling Group (4-6 hours)**
1. Create AMI from existing API instance
2. Create launch template
3. Create auto-scaling group (min 2, max 10)
4. Configure scaling policies (CPU >70% = scale up)
5. Test auto-scaling

**Part 4: CI/CD Updates (2-4 hours)**
1. Update GitHub Actions to deploy to all instances
2. Implement blue-green deployment strategy
3. Test zero-downtime deployment

**AWS Commands:**
```bash
# 1. Create Application Load Balancer
aws elbv2 create-load-balancer \
  --name irisx-api-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups sg-xxxxx \
  --scheme internet-facing \
  --type application

# 2. Create target group
aws elbv2 create-target-group \
  --name irisx-api-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3

# 3. Register targets
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --targets Id=i-032d6844d393bdef4 Id=i-NEW_INSTANCE_ID

# 4. Create listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...

# 5. Launch new instance in us-east-1b
aws ec2 run-instances \
  --image-id ami-xxxxx \
  --instance-type t3.small \
  --subnet-id subnet-us-east-1b \
  --security-group-ids sg-xxxxx \
  --key-name your-key \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=IRISX-API-1b}]'

# 6. Create AMI from existing instance
aws ec2 create-image \
  --instance-id i-032d6844d393bdef4 \
  --name "IRISX-API-$(date +%Y%m%d)" \
  --description "IRISX API Server Image"

# 7. Create launch template
aws ec2 create-launch-template \
  --launch-template-name irisx-api-template \
  --launch-template-data file://launch-template.json

# 8. Create auto-scaling group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name irisx-api-asg \
  --launch-template LaunchTemplateName=irisx-api-template \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 2 \
  --vpc-zone-identifier "subnet-1a,subnet-1b,subnet-1c" \
  --target-group-arns arn:aws:elasticloadbalancing:... \
  --health-check-type ELB \
  --health-check-grace-period 300
```

**Testing Checklist:**
- [ ] ALB health checks passing for both instances
- [ ] Traffic distributed evenly between instances
- [ ] Stop one instance - ALB routes to healthy instance only
- [ ] Start instance back - ALB adds it back to rotation
- [ ] DNS updated to ALB endpoint
- [ ] Auto-scaling triggers on high CPU
- [ ] Deploy new code - zero downtime

**Acceptance Criteria:**
- [ ] API running in 2+ availability zones (us-east-1a, us-east-1b)
- [ ] Load balancer distributing traffic
- [ ] System survives single AZ failure
- [ ] Auto-scaling responds to load (CPU >70%)
- [ ] Zero-downtime deployments possible
- [ ] Health checks working correctly
- [ ] DNS points to ALB
- [ ] All existing functionality still works

**Deliverable:** Production-grade multi-AZ infrastructure with auto-scaling

---

### **PHASE 4: AI & DIFFERENTIATION** 🚀 (Weeks 6-12: 92-136 hours)
*Goal: Features that differentiate from Twilio/Plivo*

#### **TASK 11: Data Import System (CSV/Excel Upload with AI Field Mapping)** (40-60 hours)
**Why Eleventh:** Major competitive advantage over Twilio
**Dependencies:** None

**Sub-Tasks:**

**Week 1: Core Upload & Basic Mapping (15 hours)**
1. Create `import_jobs` database table (1h)
2. Build file upload API with multer (3h)
3. Implement CSV/Excel parsing (2h)
4. Build manual field mapping UI (4h)
5. Basic import processing (3h)
6. Test with 1K contacts (2h)

**Week 2: AI Auto-Mapping & Duplicate Detection (18 hours)**
1. Integrate GPT-4 for field mapping suggestions (5h)
2. Build duplicate detection logic (5h)
3. Add skip/update/create strategies (3h)
4. Test AI mapping accuracy (target 90%+) (3h)
5. Test duplicate detection (2h)

**Week 3: Progress Tracking & Error Handling (12 hours)**
1. Add websocket progress tracking (4h)
2. Implement preview before import (2h)
3. Build error reporting system (3h)
4. Add error download functionality (1h)
5. Test with 10K contacts (2h)

**Week 4: Google Sheets & Export (10-15 hours)**
1. Implement Google Sheets OAuth (4h)
2. Build Google Sheets import (3h)
3. Build export API (CSV, Excel, JSON) (3h)
4. Create import history view (2h)
5. Polish UI/UX (3h)

**Database Schema:**
```sql
-- Create import_jobs table
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename TEXT,
  source_type TEXT, -- csv, excel, google_sheets, api
  total_rows INTEGER,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  status TEXT, -- pending, mapping, processing, completed, failed
  progress_percent INTEGER DEFAULT 0,
  field_mapping JSONB,
  duplicate_strategy TEXT, -- skip, update, create_new
  error_details JSONB,
  preview_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_import_jobs_tenant_id ON import_jobs(tenant_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(status);
```

**API Endpoints to Create:**
```
POST   /v1/imports/upload          Upload CSV/Excel file
GET    /v1/imports/:id             Get import job status
POST   /v1/imports/:id/map         Submit field mapping
POST   /v1/imports/:id/start       Start import with mapping
GET    /v1/imports/:id/preview     Get preview (first 10 rows)
GET    /v1/imports/:id/errors      Download error report
POST   /v1/imports/google-sheets   Import from Google Sheets
GET    /v1/exports/contacts        Export contacts to CSV/Excel
GET    /v1/imports                 List import history
DELETE /v1/imports/:id             Delete import job
```

**Files to Create:**
- `api/src/routes/imports.js` - Import routes
- `api/src/services/import.js` - Import service
- `api/src/services/field-mapper.js` - AI field mapping
- `api/src/services/duplicate-detector.js` - Duplicate detection
- `irisx-customer-portal/src/views/DataImport.vue` - Import UI
- `irisx-customer-portal/src/components/FieldMapper.vue` - Mapping UI
- `irisx-customer-portal/src/components/ImportProgress.vue` - Progress UI

**Acceptance Criteria:**
- [ ] Upload CSV/Excel via drag-drop UI
- [ ] AI auto-maps fields with 90%+ accuracy
- [ ] Duplicate detection works (phone/email matching)
- [ ] Skip/update/create strategies work
- [ ] Progress bar shows real-time status via websockets
- [ ] Preview shows first 10 rows before import
- [ ] Error report downloadable as CSV
- [ ] 10,000 contacts import in <30 seconds
- [ ] Google Sheets import works
- [ ] Export contacts to CSV/Excel works
- [ ] Import history view shows all past imports

**Testing Strategy:**
- Test with 100 rows (validation)
- Test with 1,000 rows (performance)
- Test with 10,000 rows (stress test)
- Test with duplicate contacts (50% duplicates)
- Test with malformed CSV (error handling)
- Test AI mapping accuracy (10 different CSV formats)

**Deliverable:** Complete data import system - major competitive advantage

---

#### **TASK 12: AI Virtual Receptionist / Conversational AI** (40-60 hours)
**Why Twelfth:** Killer feature that sets you apart from ALL competitors
**Dependencies:** Data Import (needs contact data for context)

**Sub-Tasks:**

**Week 1: Speech-to-Text & Conversation Engine (20 hours)**
1. Integrate Deepgram speech-to-text (4h)
2. Integrate GPT-4 for conversation (6h)
3. Build conversational AI service (5h)
4. Implement context management (3h)
5. Test basic conversation flow (2h)

**Week 2: Flow Builder & Actions (18 hours)**
1. Create virtual receptionist flow builder (8h)
2. Implement function calling for actions (4h)
3. Add call transfer capability (2h)
4. Add appointment booking (2h)
5. Add FAQ answering (2h)

**Week 3: UI & Templates (12 hours)**
1. Build AI configuration UI (6h)
2. Create conversation templates (3h)
3. Add safety/moderation filters (2h)
4. Test with real calls (1h)

**Week 4: Testing & Tuning (10 hours)**
1. Test with 100 real calls (4h)
2. Measure accuracy metrics (2h)
3. Tune conversation flow (2h)
4. Polish UI/UX (2h)

**Technology Stack:**
- Deepgram API - Speech-to-text (https://deepgram.com)
- OpenAI GPT-4 or Anthropic Claude - Conversation
- OpenAI TTS (already integrated) - Text-to-speech
- Redis - Context/conversation memory

**API Endpoints to Create:**
```
POST   /v1/ai/receptionist              Create AI receptionist
GET    /v1/ai/receptionist/:id          Get receptionist config
PUT    /v1/ai/receptionist/:id          Update receptionist
DELETE /v1/ai/receptionist/:id          Delete receptionist
POST   /v1/ai/receptionist/:id/test     Test conversation flow
GET    /v1/ai/conversations             List conversations
GET    /v1/ai/conversations/:id         Get conversation transcript
POST   /v1/ai/templates                 Create conversation template
GET    /v1/ai/templates                 List templates
```

**Files to Create:**
- `api/src/services/speech-to-text.js` - Deepgram integration
- `api/src/services/conversational-ai.js` - GPT-4 conversation
- `api/src/services/ai-receptionist.js` - Virtual receptionist
- `api/src/routes/ai.js` - AI routes
- `irisx-customer-portal/src/views/AIReceptionist.vue` - AI config UI
- `irisx-customer-portal/src/components/FlowBuilder.vue` - Flow builder
- `irisx-customer-portal/src/components/ConversationTester.vue` - Test UI

**Example Use Case:**
```javascript
// Create AI receptionist
const receptionist = await ai.createReceptionist({
  name: "Medical Office Receptionist",
  greeting: "Thank you for calling Dr. Smith's office. How can I help you?",
  flow: [
    {
      intent: "book_appointment",
      action: "transfer_to_scheduler",
      response: "I'll transfer you to our scheduling team."
    },
    {
      intent: "prescription_refill",
      action: "collect_info",
      fields: ["patient_name", "medication"],
      response: "I've recorded your refill request. Our pharmacy will call you within 2 hours."
    },
    {
      intent: "emergency",
      action: "transfer_to_doctor",
      response: "Let me connect you with the doctor immediately."
    }
  ],
  voice: "alloy",
  model: "gpt-4"
});
```

**Acceptance Criteria:**
- [ ] AI can handle natural conversations (multi-turn)
- [ ] Speech-to-text accuracy >90%
- [ ] Response time <2 seconds
- [ ] Context maintained across conversation
- [ ] Can transfer to human agent
- [ ] Can book appointments
- [ ] Can answer FAQs
- [ ] Safety filters prevent inappropriate responses
- [ ] Flow builder UI working
- [ ] Conversation templates available (appointment, FAQ, routing)
- [ ] Test with 100 calls - >90% intent detection accuracy

**Testing Strategy:**
- Test with scripted conversations (10 scenarios)
- Test with real calls (100 calls)
- Measure intent detection accuracy
- Measure response quality (human review)
- Test safety filters (inappropriate inputs)
- Stress test (10 concurrent conversations)

**Deliverable:** AI Virtual Receptionist - killer feature

---

#### **TASK 13: Additional TTS Engine Integrations** (12-16 hours)
**Why Thirteenth:** Cost optimization and redundancy
**Dependencies:** None

**Steps:**
1. Complete AWS Polly integration (stub exists) (3-4h)
2. Add Google Cloud TTS (3-4h)
3. Add Microsoft Azure TTS (3-4h)
4. Test failover logic (1h)
5. Document voice samples (1h)
6. Create provider comparison guide (1-2h)

**Providers to Add:**
```javascript
// api/src/services/tts.js - Add these providers

// AWS Polly (complete the stub)
async generateWithPolly(text, voice = 'Joanna') {
  const polly = new Polly({ region: 'us-east-1' });
  const params = {
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: voice,
    Engine: 'neural'
  };
  const result = await polly.synthesizeSpeech(params).promise();
  return result.AudioStream;
}

// Google Cloud TTS
async generateWithGoogle(text, voice = 'en-US-Neural2-C') {
  const textToSpeech = require('@google-cloud/text-to-speech');
  const client = new textToSpeech.TextToSpeechClient();
  const request = {
    input: { text },
    voice: { languageCode: 'en-US', name: voice },
    audioConfig: { audioEncoding: 'MP3' }
  };
  const [response] = await client.synthesizeSpeech(request);
  return response.audioContent;
}

// Microsoft Azure TTS
async generateWithAzure(text, voice = 'en-US-JennyNeural') {
  const sdk = require('microsoft-cognitiveservices-speech-sdk');
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY,
    process.env.AZURE_SPEECH_REGION
  );
  speechConfig.speechSynthesisVoiceName = voice;
  // ... synthesis code
}
```

**Provider Comparison Table:**
| Provider | Cost per 1K chars | Quality | Speed | Voices | Languages |
|----------|------------------|---------|-------|--------|-----------|
| OpenAI TTS | $0.015 | Good | Fast | 6 | 50+ |
| ElevenLabs | $0.30 | Premium | Medium | 100+ | 29 |
| AWS Polly | $0.004 | Good | Fast | 60+ | 30+ |
| Google Cloud | $0.004 | Good | Fast | 220+ | 40+ |
| Azure | $0.001 | Good | Fast | 400+ | 119 |
| Deepgram | $0.0036 | Good | Very Fast | 10 | 36 |

**Acceptance Criteria:**
- [ ] At least 4 TTS providers working (OpenAI, ElevenLabs, Polly, Google)
- [ ] Automatic failover if provider fails
- [ ] Cost tracking for all providers
- [ ] Voice samples documented
- [ ] Provider comparison guide published

**Deliverable:** Multi-provider TTS with cost optimization

---

### **PHASE 5: POLISH** 🔧 (Weeks 13-16: 24-36 hours)
*Goal: Nice-to-have features and improvements*

#### **TASK 14: Admin Panel Polish** (8-12 hours)
**Why Fourteenth:** Already 85% functional, just needs polish
**Dependencies:** None

**Steps:**
1. E2E test all 17 admin components (3h)
2. Polish tenant management UI (2h)
3. Enhance system monitoring dashboard (2h)
4. Add missing form validations (1-2h)
5. Improve error handling (1-2h)
6. Polish UI/UX styling (2-3h)

**Components to Polish:**
- TenantList.vue - Add pagination, sorting
- TenantDetails.vue - Add activity timeline
- SystemHealth.vue - Add real-time metrics
- InvoiceList.vue - Add filters, search
- PhoneNumberProvisioning.vue - Add bulk provisioning
- AuditLog.vue - Add advanced filtering

**Acceptance Criteria:**
- [ ] All 17 components tested end-to-end
- [ ] Tenant management smooth and intuitive
- [ ] System monitoring shows real-time data
- [ ] Form validations complete
- [ ] Error messages helpful
- [ ] UI consistent and polished

**Deliverable:** Production-ready admin panel

---

#### **TASK 15: Advanced Campaign Features** (16-24 hours)
**Why Fifteenth:** Progressive dialer sufficient for MVP, add compliance features
**Dependencies:** Campaign testing complete

**Steps:**
1. Research AMD (Answering Machine Detection) providers (2h)
2. Integrate AMD service (6-8h)
3. Add DNC (Do Not Call) list checking (4-6h)
4. Add TCPA time zone enforcement (4-6h)
5. Test with real campaigns (2h)

**Features to Add:**

**1. AMD (Answering Machine Detection):**
```javascript
// api/src/services/amd.js
class AMDService {
  async detectAnsweringMachine(callSid) {
    // Option 1: Use Twilio AMD
    // Option 2: Use AWS Transcribe
    // Option 3: Use custom ML model

    // Return: 'human' or 'machine'
  }
}
```

**2. DNC List:**
```javascript
// api/src/services/dnc.js
class DNCService {
  async checkNumber(phoneNumber) {
    // Check against:
    // - National DNC Registry
    // - Internal DNC list
    // - State DNC lists

    // Return: true if on DNC list
  }
}
```

**3. TCPA Compliance:**
```javascript
// api/src/services/tcpa.js
class TCPAService {
  async canCallNow(phoneNumber) {
    const timezone = await this.lookupTimezone(phoneNumber);
    const localTime = this.getLocalTime(timezone);

    // TCPA: No calls before 9am or after 9pm local time
    if (localTime.hour < 9 || localTime.hour >= 21) {
      return { allowed: false, reason: 'Outside TCPA hours (9am-9pm local)' };
    }

    return { allowed: true };
  }
}
```

**Acceptance Criteria:**
- [ ] AMD accuracy >90%
- [ ] DNC numbers skipped automatically
- [ ] No calls outside 9am-9pm local time (TCPA)
- [ ] Campaign respects all compliance rules
- [ ] Compliance violations logged

**Deliverable:** Compliant campaign system with AMD, DNC, TCPA

---

### **PHASE 6: DEFER TO POST-LAUNCH** ⏸️ (160-240 hours)
*These are Phase 6 features - add based on customer demand*

#### **TASK 16: Facebook Messenger Integration** (8-12 hours)
**Status:** OPTIONAL - 4 social platforms already working
**Recommendation:** Only add if customers request

#### **TASK 17: Twitter DM Integration** (8-12 hours)
**Status:** OPTIONAL - 4 social platforms already working
**Recommendation:** Only add if customers request

#### **TASK 18: Video Calling (Phase 6)** (40-60 hours)
**Status:** Not Started - Phase 6 feature
**Recommendation:** Defer until post-launch

#### **TASK 19: AI Call Analytics (Phase 6)** (40-60 hours)
**Status:** Not Started - Separate from Virtual Receptionist
**Note:** This is call analytics AFTER the call (transcription, summarization, sentiment)
**Recommendation:** Defer until post-launch

#### **TASK 20: Multi-Region Deployment** (80-120 hours)
**Status:** Not Started
**Note:** Fix Multi-AZ (Task 10) FIRST before attempting multi-region
**Recommendation:** Defer until scale demands it

---

## 📊 SUMMARY

### By Phase
| Phase | Tasks | Time | Priority | Cost |
|-------|-------|------|----------|------|
| **Phase 1: Quick Wins** | 1-5 | 5-9 hours | CRITICAL ⚡ | $0.05 |
| **Phase 2: MVP Validation** | 6-8 | 4-5 hours | CRITICAL 🎯 | $0.50 |
| **Phase 3: Infrastructure** | 9-10 | 20-30 hours | HIGH 🏗️ | $100-200 |
| **Phase 4: AI Features** | 11-13 | 92-136 hours | VERY HIGH 🚀 | $500+ |
| **Phase 5: Polish** | 14-15 | 24-36 hours | MEDIUM 🔧 | $0 |
| **Phase 6: Deferred** | 16-20 | 176-264 hours | LOW ⏸️ | TBD |
| **TOTAL (P1-P5)** | **15 tasks** | **145-216 hours** | | **~$600** |

### Recommended Path

**OPTION A: Fastest MVP (2 weeks)**
- Complete Phase 1 + Phase 2 only
- Total: 9-14 hours
- Get to market, validate with customers
- Iterate based on feedback

**OPTION B: Production-Ready (4-5 weeks)**
- Complete Phase 1 + Phase 2 + Phase 3
- Total: 29-44 hours
- Enterprise-grade infrastructure
- Multi-AZ high availability

**OPTION C: AI-Powered Platform (10-12 weeks)**
- Complete Phase 1-4
- Total: 121-180 hours
- Major Twilio competitor
- AI Virtual Receptionist = killer feature

---

## 🎯 STARTING NOW

**Ready to start with TASK 1: Add Dry Run Mode to Load Tests (30 mins)**

This enables safe load testing without spending $15-20 on hundreds of real calls/SMS.

**Next Steps:**
1. I'll modify the calls.js and sms.js routes to support `dry_run: true`
2. Update load test scripts to accept `--env DRY_RUN=true`
3. Test with a single dry_run call to verify it works
4. Then you can run full load tests with zero cost

**Ready to proceed with Task 1?**
