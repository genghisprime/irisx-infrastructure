# FreeSWITCH Workers & Multi-Region Load Balancing Explained
**Date:** October 30, 2025

## Question 1: What Do FreeSWITCH Workers Do?

### The Problem They Solve

Right now we have:
- ✅ API that accepts `POST /v1/calls` requests
- ✅ FreeSWITCH server running
- ✅ NATS message queue running
- ❌ **NO CONNECTION between them!**

**Without workers, phone calls CAN'T happen** even though all the pieces exist!

### orchestrator.js - The Call Maker

**What it does:**
Bridges the API → FreeSWITCH to actually place phone calls

**Flow:**
```
1. Customer API request: POST /v1/calls
   {
     "to": "+14155551234",
     "from": "+15105551234",
     "url": "https://example.com/twiml"
   }

2. API validates request
   ↓
3. API creates call record in database
   ↓
4. API publishes message to NATS 'calls' stream
   {
     "call_id": "123",
     "to": "+14155551234",
     "from": "+15105551234",
     "carrier_id": 5,
     "originate_command": "originate {sip_h_X-Call-ID=123}sofia/..."
   }

5. orchestrator.js worker picks up message
   ↓
6. Connects to FreeSWITCH ESL (Event Socket Library) on port 8021
   ↓
7. Sends FreeSWITCH command: "api originate ..."
   ↓
8. FreeSWITCH dials the number via Twilio SIP trunk
   ↓
9. Phone rings! 📞
   ↓
10. FreeSWITCH sends events back:
    - CHANNEL_CREATE
    - CHANNEL_ANSWER
    - CHANNEL_HANGUP

11. orchestrator.js updates database:
    UPDATE calls SET status='ringing' WHERE id=123
    UPDATE calls SET status='in-progress' WHERE id=123
    UPDATE calls SET status='completed' WHERE id=123
```

**Why it's separate from API:**
- API stays fast (no blocking on FreeSWITCH)
- Worker can restart without affecting API
- Can scale workers independently (10 workers, 1 API)
- Retry logic if FreeSWITCH is temporarily down

**Code structure (~300 lines):**
```javascript
// orchestrator.js
import { connect as natsConnect } from 'nats';
import ESL from 'modesl';

// Connect to NATS
const nc = await natsConnect({ servers: 'localhost:4222' });
const js = nc.jetstream();

// Connect to FreeSWITCH ESL
const conn = new ESL.Connection('10.0.1.213', 8021, 'ClueCon', () => {
  console.log('Connected to FreeSWITCH');
});

// Subscribe to 'calls' stream
const consumer = await js.consumers.get('calls', 'orchestrator');
while (true) {
  const msg = await consumer.next();
  const call = JSON.parse(msg.data);

  // Originate call via FreeSWITCH
  conn.api('originate', call.originate_command, (res) => {
    // Update database with result
    query('UPDATE calls SET status = $1 WHERE id = $2',
          [res.success ? 'ringing' : 'failed', call.id]);
  });

  msg.ack();
}
```

### cdr.js - The Call Records Collector

**What it does:**
Captures detailed call data (CDR = Call Detail Record) from FreeSWITCH and stores in database

**Flow:**
```
1. Call ends (customer hangs up)
   ↓
2. FreeSWITCH fires CHANNEL_HANGUP event
   Contains:
   - Call duration
   - Answer time
   - Hangup cause
   - Audio codec used
   - RTP stats (jitter, packet loss)
   - Cost data

3. cdr.js worker listens to these events
   ↓
4. Parses CDR data
   ↓
5. Writes to 'cdr' table in database
   INSERT INTO cdr (
     call_id,
     duration_seconds,
     billable_seconds,
     cost,
     hangup_cause,
     audio_codec,
     created_at
   ) VALUES (...)

6. Publishes to NATS 'events' stream for analytics
   ↓
7. Used for:
   - Billing customers
   - Analytics dashboards
   - Cost tracking
   - Quality monitoring
```

**Why it's important:**
- **Billing:** Can't charge customers without accurate call duration
- **Analytics:** Can't show call history without CDRs
- **Debugging:** Can't troubleshoot failed calls without details
- **Cost tracking:** Can't calculate profit margins without cost data

**Code structure (~200 lines):**
```javascript
// cdr.js
import ESL from 'modesl';
import { query } from '../db/connection.js';

// Connect to FreeSWITCH ESL
const conn = new ESL.Connection('10.0.1.213', 8021, 'ClueCon', () => {
  console.log('Connected to FreeSWITCH for CDR');

  // Subscribe to CHANNEL_HANGUP events
  conn.subscribe('CHANNEL_HANGUP', (event) => {
    const cdr = {
      call_id: event.getHeader('variable_call_id'),
      duration: parseInt(event.getHeader('variable_duration')),
      billable_duration: parseInt(event.getHeader('variable_billsec')),
      hangup_cause: event.getHeader('variable_hangup_cause'),
      // ... parse 30+ headers
    };

    // Write to database
    await query(`
      INSERT INTO cdr (call_id, duration_seconds, billable_seconds, cost, hangup_cause)
      VALUES ($1, $2, $3, $4, $5)
    `, [cdr.call_id, cdr.duration, cdr.billable_duration, cdr.cost, cdr.hangup_cause]);

    console.log(`CDR written for call ${cdr.call_id}`);
  });
});
```

---

## Question 2: Where Does Multi-Region Load Balancing Fit?

### Timeline Answer: **Week 31** (Much Later!)

According to Master Checklist line 949:
> **Week 31: Multi-Carrier & High Availability**
> Multi-Region Deployment

**Current Week:** We're on Week 4 (FreeSWITCH Workers)

**Weeks until multi-region:** 27 weeks away!

### Development Order (Simplified)

```
Week 1-4:   Infrastructure, Auth, FreeSWITCH Workers ← WE ARE HERE
Week 5-8:   TTS, Call Control (Gather, Transfer, Record)
Week 9-12:  Webhooks, Customer Portal, IVR
Week 13-16: Queues, Agents, Call Center Features
Week 17-20: WebRTC Softphone, Screen Pop, CRM
Week 21-24: Campaigns, Predictive Dialer
Week 25-26: Analytics, ClickHouse, Billing
Week 27-30: SMS, Email, Social Media (Discord, Teams, WhatsApp)
Week 31:    Multi-Region & Kamailio Load Balancer ← MULTI-REGION COMES HERE
Week 32-34: Security, SOC 2, Production Launch
```

### What Multi-Region Actually Means

**Current Architecture (Week 4):**
```
Single Region: us-east-1 (Virginia)

┌──────────────────────────┐
│   AWS us-east-1          │
│                          │
│  ┌─────────────────────┐ │
│  │ API Server          │ │
│  │ 3.83.53.69          │ │
│  │ - Hono.js API       │ │
│  │ - NATS              │ │
│  │ - Workers           │ │
│  └─────────────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ FreeSWITCH          │ │
│  │ 54.160.220.243      │ │
│  └─────────────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ RDS PostgreSQL      │ │
│  └─────────────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ ElastiCache Redis   │ │
│  └─────────────────────┘ │
└──────────────────────────┘
```

**Multi-Region Architecture (Week 31):**
```
Two Regions: us-east-1 (Virginia) + us-west-2 (Oregon)

                    Route53 DNS
                    (Latency-Based Routing)
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
┌────────────────────────┐    ┌────────────────────────┐
│  AWS us-east-1         │    │  AWS us-west-2         │
│  (Virginia - Primary)  │    │  (Oregon - Secondary)  │
│                        │    │                        │
│  ┌──────────────────┐  │    │  ┌──────────────────┐  │
│  │ Kamailio LB      │◄─┼────┼─►│ Kamailio LB      │  │
│  │ (SIP Proxy)      │  │    │  │ (SIP Proxy)      │  │
│  └──────┬───────────┘  │    │  └──────┬───────────┘  │
│         │              │    │         │              │
│  ┌──────▼───────────┐  │    │  ┌──────▼───────────┐  │
│  │ FreeSWITCH       │  │    │  │ FreeSWITCH       │  │
│  │ (Media Server)   │  │    │  │ (Media Server)   │  │
│  └──────────────────┘  │    │  └──────────────────┘  │
│                        │    │                        │
│  ┌──────────────────┐  │    │  ┌──────────────────┐  │
│  │ API Servers x2   │  │    │  │ API Servers x2   │  │
│  │ (Auto Scaling)   │  │    │  │ (Auto Scaling)   │  │
│  └──────────────────┘  │    │  └──────────────────┘  │
│                        │    │                        │
│  ┌──────────────────┐  │    │  ┌──────────────────┐  │
│  │ RDS Multi-AZ     │◄─┼────┼─►│ RDS Read Replica │  │
│  │ (Primary)        │  │    │  │ (Failover)       │  │
│  └──────────────────┘  │    │  └──────────────────┘  │
│                        │    │                        │
└────────────────────────┘    └────────────────────────┘
```

### Why Multi-Region?

**Benefits:**
1. **Low Latency:** Oregon customers get routed to Oregon servers (faster)
2. **High Availability:** If Virginia goes down, Oregon takes over automatically
3. **Compliance:** Some customers require data in specific regions
4. **Scale:** Distribute 10K concurrent calls across 2 regions

**Kamailio Load Balancer:**
- SIP proxy that sits in front of multiple FreeSWITCH servers
- Routes calls based on:
  - Server load (CPU, memory, active channels)
  - Geographic location (latency)
  - Health checks (is FreeSWITCH responding?)
- Example: "Virginia FreeSWITCH is at 80% capacity, route next call to Oregon"

**Failover:**
- Route53 health checks (every 30 seconds)
- If Virginia API fails health check → Route all traffic to Oregon
- RTO (Recovery Time Objective): < 15 minutes
- Automatic database failover with RDS Multi-AZ

### Cost Comparison

**Current (Single Region):**
- 1x API Server (t3.medium): $30/mo
- 1x FreeSWITCH Server (t3.medium): $30/mo
- 1x RDS PostgreSQL: $15/mo
- 1x Redis: $12/mo
- **Total: ~$87/mo**

**Multi-Region (Week 31):**
- 2x API Servers (us-east-1): $60/mo
- 2x API Servers (us-west-2): $60/mo
- 2x FreeSWITCH Servers: $60/mo
- 2x Kamailio Load Balancers: $40/mo
- RDS Multi-AZ + Read Replica: $45/mo
- Redis Cluster: $24/mo
- Route53 + Health Checks: $5/mo
- **Total: ~$294/mo**

---

## Summary

### FreeSWITCH Workers (Week 4 - RIGHT NOW)

**orchestrator.js:**
- Connects API → FreeSWITCH to make calls happen
- Without it, `POST /v1/calls` does nothing
- ~300 lines, critical for core functionality

**cdr.js:**
- Captures call records from FreeSWITCH → Database
- Without it, can't bill customers or show call history
- ~200 lines, critical for billing

**Priority:** MUST BUILD THIS FIRST before anything else works!

### Multi-Region (Week 31 - 27 WEEKS AWAY)

**What it adds:**
- Second datacenter in Oregon (us-west-2)
- Kamailio load balancer for SIP traffic
- Automatic failover if one region goes down
- Lower latency for west coast customers

**Priority:** Build this LAST, after:
- Core calling works
- TTS and call control
- Webhooks and customer portal
- IVR and queues
- Agent desktop
- Campaigns
- Analytics
- SMS/Email/Discord/Teams/WhatsApp

---

## What To Build Next

**Immediate Priority (Week 4):**
1. ✅ Auth API - DONE
2. 🎯 orchestrator.js - DO THIS NOW
3. 🎯 cdr.js - DO THIS NOW
4. 🎯 Test making actual phone call

**Then (Weeks 5-30):**
- TTS integration
- Call control verbs
- Customer portal
- All the channels (SMS, Email, Discord, Teams, WhatsApp)

**Finally (Week 31):**
- Multi-region deployment
- Load balancing

**Bottom Line:** FreeSWITCH workers enable basic calling. Multi-region enables enterprise scale. Workers come first!
