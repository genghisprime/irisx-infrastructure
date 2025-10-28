# IRIS X Master Scope of Work v2.0 (Part 2)

## 10. Event and Data Flow

### Detailed Event Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: API Request                                             │
│  Client → Cloudflare Workers (Hono.js)                           │
│    - Validate API key and tenant limits                          │
│    - Check rate limits in Upstash Redis                          │
│    - Generate call_id (ULID for sortability)                     │
│    - Return 202 Accepted with call_id                            │
│    - Latency: <100ms                                             │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Event Publishing                                        │
│  API → NATS JetStream                                            │
│    - Publish to subject: calls.{tenant_id}.create                │
│    - Durable stream with acknowledgment                          │
│    - Idempotency key prevents duplicate calls                    │
│    - Latency: <10ms                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Orchestrator Consumption                                │
│  NATS → Orchestrator Worker (Bun.js)                             │
│    - Consumer pulls from stream (push or pull mode)              │
│    - Check pacing limits (CPS, channels, carrier headroom)       │
│    - Enqueue to Redis: queue:{tenant_id}:outbound                │
│    - Update call status in Postgres: "queued"                    │
│    - Latency: <50ms                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Media Node Selection                                    │
│  Orchestrator → Redis (node registry)                            │
│    - Query available nodes: nodes:region:us-east-1               │
│    - Select node with lowest channel count                       │
│    - Lock node capacity (increment counter)                      │
│    - Latency: <10ms                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Originate Call (ESL)                                    │
│  Orchestrator → FreeSWITCH (Event Socket Layer)                  │
│    - Send: originate {params}sofia/gateway/twilio/+15555551234  │
│    - FreeSWITCH sends INVITE to Twilio SIP trunk                 │
│    - Update call status: "ringing"                               │
│    - Latency: <100ms                                             │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: Carrier Processing                                      │
│  FreeSWITCH → Twilio → PSTN                                      │
│    - Twilio routes to destination carrier                        │
│    - Destination rings, returns 180 Ringing                      │
│    - FreeSWITCH emits CHANNEL_PROGRESS event                     │
│    - Latency: 200-2000ms (depends on carrier)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 7: Call Answered                                           │
│  PSTN → Twilio → FreeSWITCH                                      │
│    - Destination answers, returns 200 OK                         │
│    - RTP media stream established                                │
│    - FreeSWITCH emits CHANNEL_ANSWER event                       │
│    - Update call status: "in-progress"                           │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 8: Event Processing                                        │
│  FreeSWITCH → NATS → Worker                                      │
│    - Worker consumes events from NATS stream                     │
│    - Update Postgres CDR (answer_time, status)                   │
│    - Update Redis call state (for real-time queries)             │
│    - Trigger customer webhook (async via Cloud Tasks)            │
│    - Latency: <500ms                                             │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 9: Webhook Execution                                       │
│  Worker → Customer's webhook URL                                 │
│    - POST with call.answered event                               │
│    - Customer responds with verbs (say, play, gather, etc.)      │
│    - Worker sends commands to FreeSWITCH via ESL                 │
│    - FreeSWITCH executes verbs (play TTS, gather DTMF, etc.)     │
│    - Latency: depends on customer's server (target <1s)          │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Step 10: Call Completion                                        │
│  Either party hangs up                                           │
│    - FreeSWITCH emits CHANNEL_HANGUP event                       │
│    - Worker updates CDR (end_time, duration, disposition)        │
│    - Rating engine calculates cost                               │
│    - Recording uploaded to R2/S3 (if enabled)                    │
│    - Final webhook: call.completed                               │
│    - Latency: <5s for CDR + webhook                              │
└─────────────────────────────────────────────────────────────────┘
```

### Event Schema

All events published to NATS follow this schema:

```json
{
  "event_id": "evt_01J1KQZX9F7GH4JWXY12ABCD",
  "event_type": "call.answered",
  "timestamp": "2025-01-15T14:32:11.234Z",
  "tenant_id": "tenant_01J1KQZ",
  "call_id": "call_01J1KQZX9F7GH4",
  "correlation_id": "req_01J1KQZX9F7GH4",
  "payload": {
    "from": "+15555551234",
    "to": "+15555556789",
    "direction": "outbound",
    "status": "in-progress",
    "answered_at": "2025-01-15T14:32:11.234Z"
  },
  "metadata": {
    "region": "us-east-1",
    "media_node": "freeswitch-1",
    "carrier": "twilio"
  }
}
```

---

## 11. High Volume Handling and Scaling

### Startup Capacity (Phase 1)

**Single t3.medium EC2:**
- **Concurrent calls:** 100 (tested limit: 150 burst)
- **CPS:** 40-60 sustained (existing Twilio trunk limit)
- **Memory usage:** 2GB (FreeSWITCH 1.5GB, NATS 200MB, coturn 300MB)
- **CPU usage:** 40-60% average (spikes to 80% during burst)
- **Network:** 50 Mbps (G.711 codec = 87 kbps per call × 100 = 8.7 Mbps)

**Cost:** $30/month (t3.medium) + $170/month usage = **$200/month total**

**Growth triggers:**
- Sustained >80 concurrent calls for >1 hour = add t3.large ($60/mo)
- >60 CPS = add second carrier (Telnyx) + Kamailio load balancer

### Scale Tier (Phase 2-3)

**Target: 5,000 concurrent calls**

**Infrastructure:**
- **3x c7i.2xlarge** (8 vCPU, 16GB RAM)
  - Each handles 2,000 concurrent calls
  - Total capacity: 6,000 (buffer for failover)
  - Cost: 3 × $250/mo = $750/mo

- **Kamailio cluster:** 2x t3.small (load balancer + failover)
  - Cost: 2 × $15/mo = $30/mo

- **Neon Postgres** (paid tier with autoscaling)
  - Cost: ~$100/mo

- **Upstash Redis Pro** (multi-region replication)
  - Cost: ~$80/mo

- **ClickHouse Cloud** (1TB ingestion/month)
  - Cost: ~$100/mo

**Total infrastructure:** ~$1,060/mo

**Telephony costs** (assuming 50K concurrent = 15M minutes/month):
- Carrier: $0.011/min × 15M = $165,000
- Revenue: $0.020/min × 15M = $300,000
- **Gross profit:** $135,000 (45% margin)

### Enterprise Tier (Phase 4)

**Target: 50K-100K concurrent calls**

**Multi-region active-active:**
- **us-east-1:** 5x c7i.4xlarge = $2,500/mo
- **us-west-2:** 5x c7i.4xlarge = $2,500/mo
- **eu-west-1:** 3x c7i.4xlarge = $1,500/mo (if serving Europe)

**Managed services:**
- **Aurora Global Database:** $1,500/mo
- **ElastiCache Redis Cluster:** $800/mo
- **ClickHouse Cloud:** $500/mo
- **Kafka (MSK):** $600/mo
- **CloudFront + S3:** $200/mo

**Total infrastructure:** ~$10,100/mo

**Telephony costs** (100K concurrent = 300M minutes/month):
- Carrier: $0.011/min × 300M = $3.3M
- Revenue: $0.020/min × 300M = $6M
- **Gross profit:** $2.7M (45% margin)

### Autoscaling Rules

**Media nodes (FreeSWITCH):**

Trigger scale-out:
- Avg channels per node >75% capacity (e.g., 1,500 on 2K node)
- OR CPS >80% capacity sustained for 5 minutes
- OR CPU >80% for 2 minutes

Trigger scale-in:
- Avg channels per node <40% capacity for 15 minutes
- AND all nodes healthy (no recent restarts)
- Keep minimum 2 nodes per region (redundancy)

**Orchestrator workers:**

Trigger scale-out:
- NATS stream lag >10,000 messages
- OR queue depth in Redis >5,000 calls
- OR processing latency p95 >5 seconds

Trigger scale-in:
- NATS stream lag <1,000 messages for 10 minutes
- AND queue depth <500 calls
- Keep minimum 2 workers (redundancy)

**Database connections:**

**Neon Postgres:**
- Autoscaling compute (0.25 - 4 vCPU)
- Scales up when CPU >70% for 1 minute
- Scales down when CPU <30% for 5 minutes

**PgBouncer connection pooling:**
- Pool size = (num_workers × 2) + 10
- Max connections to DB = 100 (default)
- Transaction pooling mode for better utilization

### Carrier Strategy

**Phase 1 (Startup):**
- **Twilio only:** Existing trunk, 40-60 CPS, $0.013/min
- Pros: Already set up, known quality
- Cons: Expensive, single point of failure

**Phase 2 (Growth):**
- **Add Telnyx:** $0.004/min, 100 CPS, 30-day payment terms
- **Routing:** Telnyx primary (cheaper), Twilio failover
- **Least-cost routing:** Route to Telnyx first, overflow to Twilio

**Phase 3 (Scale):**
- **Add Bandwidth:** $0.0049/min, 200 CPS, excellent US coverage
- **Add SignalWire:** $0.0065/min, FreeSWITCH-native, easy integration
- **Adaptive routing:** Based on ASR (answer seizure ratio)
  - If carrier ASR <85%, downgrade to backup
  - If carrier 5xx errors >5%, temporary pause for 5 minutes

**Carrier health scoring:**

```javascript
function calculateCarrierHealth(carrier, window = '15 minutes') {
  const stats = getCarrierStats(carrier, window);

  const asr = stats.answered / stats.total; // 0-1
  const errorRate = stats.errors / stats.total; // 0-1
  const avgConnectTime = stats.total_connect_time / stats.answered; // seconds

  // Scoring (0-100)
  const asrScore = asr * 100; // 85% ASR = 85 points
  const errorScore = (1 - errorRate) * 100; // 2% errors = 98 points
  const latencyScore = Math.max(0, 100 - (avgConnectTime - 1) * 20); // <1s = 100, 2s = 80

  const healthScore = (asrScore * 0.5) + (errorScore * 0.3) + (latencyScore * 0.2);

  return Math.round(healthScore);
}
```

**Routing decision:**
```javascript
function selectCarrier(destination) {
  const carriers = getCarriersForDestination(destination); // e.g., [twilio, telnyx, bandwidth]

  // Sort by health score descending
  carriers.sort((a, b) => b.healthScore - a.healthScore);

  // Filter out unhealthy carriers (score <70)
  const healthyCarriers = carriers.filter(c => c.healthScore >= 70);

  if (healthyCarriers.length === 0) {
    // All carriers unhealthy, fallback to default (Twilio)
    return carriers[0];
  }

  // Weighted random selection based on health score
  const totalScore = healthyCarriers.reduce((sum, c) => sum + c.healthScore, 0);
  const rand = Math.random() * totalScore;
  let cumulative = 0;

  for (const carrier of healthyCarriers) {
    cumulative += carrier.healthScore;
    if (rand <= cumulative) {
      return carrier;
    }
  }

  return healthyCarriers[0]; // fallback
}
```

### Pacing and Back Pressure

**Pacing algorithm (predictive dialer):**

```javascript
function calculateAllowedCPS() {
  const carrierHeadroom = getCarrierCPSHeadroom(); // e.g., 100 - 20 = 80 CPS available
  const mediaHeadroom = getMediaCPSHeadroom(); // e.g., 5000 max - 3000 active = 2000 / 60 = 33 CPS
  const tenantCap = getTenantCPSLimit(); // e.g., 50 CPS
  const agentBasedPace = calculateAgentBasedCPS(); // agents available × dial ratio

  const allowedCPS = Math.min(
    carrierHeadroom,
    mediaHeadroom,
    tenantCap,
    agentBasedPace
  ) * 0.85; // 85% safety factor

  return Math.floor(allowedCPS);
}

function calculateAgentBasedCPS() {
  const availableAgents = getAvailableAgentCount();
  const dialRatio = getDialRatio(); // e.g., 2.5:1 for predictive
  const avgCallDuration = getAvgCallDuration(); // e.g., 180 seconds

  // How many calls can we make per second such that agents are always busy?
  // Formula: (agents × dial_ratio) / (avg_call_duration / 60)
  const cps = (availableAgents * dialRatio) / (avgCallDuration / 60);

  return cps;
}
```

**Back pressure signals:**

Monitor these metrics every 2 seconds:

1. **SIP 503 (Service Unavailable) rate:** If >5%, reduce CPS by 50%
2. **SIP 486 (Busy Here) rate:** If >10%, reduce CPS by 25%
3. **Originate failures:** If >10%, reduce CPS by 50% and alert
4. **Dispatcher queue time:** If >500ms, reduce CPS by 25%
5. **Packet loss:** If >1%, reduce CPS by 25% (network congestion)

**Auto-recovery:**

After reducing CPS due to back pressure:
- Wait 1 minute
- Increase CPS by 10% every 30 seconds
- Monitor error rates
- If errors spike again, reduce and wait 2 minutes (exponential backoff)

### Redis Sharding Strategy

**Key distribution:**

- **Rate limits:** `rate:{global|tenant}:{tenant_id}:{window}` → Shard by tenant_id hash
- **Queues:** `queue:{tenant_id}:{queue_name}` → Shard by tenant_id hash
- **Agent presence:** `agent:{tenant_id}:{agent_id}` → Shard by tenant_id hash
- **Call state:** `call:{call_id}` → Shard by call_id hash
- **Node registry:** `nodes:{region}:{node_id}` → Shard by region hash

**Sharding algorithm:**

```javascript
function selectShard(key) {
  const hash = crc32(key); // Fast, non-cryptographic hash
  const shardIndex = hash % NUM_SHARDS; // e.g., 3 shards
  return REDIS_SHARDS[shardIndex];
}
```

**Shard sizing:**

- **Startup:** 1 shard (single Redis instance, no cluster mode)
  - Capacity: 10K commands/sec, 2GB memory
  - Cost: $0/mo (Upstash free tier)

- **Growth:** 3 shards (Redis Cluster)
  - Capacity: 30K commands/sec, 6GB memory
  - Cost: ~$50/mo (Upstash Pro tier)

- **Scale:** 6 shards (Redis Cluster with replicas)
  - Capacity: 100K commands/sec, 24GB memory
  - Cost: ~$200/mo (ElastiCache or Upstash)

### Testing Before Day One

**Load test plan:**

**Week 1: Component tests**
- FreeSWITCH: 200 concurrent calls, 10 CPS, 10 minutes
- Kamailio: 500 CPS, 1,000 concurrent, 5 minutes
- API: 10K requests/sec, 1 minute
- NATS: 50K events/sec, 5 minutes
- Redis: 20K commands/sec, 5 minutes

**Week 2: Integration tests**
- End-to-end: 500 concurrent calls, 20 CPS, 30 minutes
- Verify CDR accuracy (compare FreeSWITCH logs to database)
- Verify recording uploads (100 calls recorded, all files in S3)
- Verify webhooks (all events delivered, retries work)

**Week 3: Soak test**
- 2,000 concurrent calls, 40 CPS, 2 hours
- Monitor memory leaks (FreeSWITCH RSS growth)
- Monitor CPU (should stay <80%)
- Monitor disk I/O (recordings, logs)
- **Success criteria:** No crashes, <1% call failures, CDR 100% accurate

**Week 4: Chaos engineering**

Day 1: Kill media node mid-call
- Expectation: Calls on that node drop, new calls route to other nodes
- Recovery time: <60 seconds (node replaced by ASG)

Day 2: Simulate carrier failure (Twilio 503s)
- Expectation: Calls fail over to Telnyx within 10 seconds
- Success rate: >98% of calls completed

Day 3: Drop Redis shard
- Expectation: Graceful degradation (read/write failures logged, retries work)
- Recovery time: <5 minutes (Redis Cluster auto-failover)

Day 4: Remove entire region (us-east-1 goes dark)
- Expectation: Route 53 fails over to us-west-2
- Aurora Global Database promotes us-west-2 to primary
- Recovery time: <15 minutes (RPO <5 min, RTO <15 min)

**Data reconciliation:**
- Compare CDR count vs FreeSWITCH logs: Must match within 1%
- Compare recording count vs CDR (where recording=true): Must match 100%
- Compare invoice line items vs CDR: Must match 100%

---

## 12. API Surface v1

### Authentication

All API requests require authentication via one of:

1. **API Key (Server-to-Server):**
```bash
curl -H "Authorization: Bearer ix_live_abc123xyz..." \
  https://api.irisx.com/v1/calls
```

2. **JWT (User Sessions):**
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  https://api.irisx.com/v1/calls
```

### Endpoints

#### **Calls**

**Create outbound call:**
```bash
POST /v1/calls
Content-Type: application/json

{
  "from": "+15555551234",
  "to": "+15555556789",
  "application_id": "app_01J1KQZX9F7GH4",
  "webhook_url": "https://example.com/webhooks/call",
  "play": {
    "type": "tts",
    "text": "Hello, this is a test call from IRIS X.",
    "voice": "en-US-Neural2-A"
  },
  "record": true,
  "custom_data": {
    "campaign_id": "camp_123",
    "agent_id": "agent_456"
  }
}
```

Response (202 Accepted):
```json
{
  "call_id": "call_01J1KQZX9F7GH4JWXY12ABCD",
  "status": "queued",
  "from": "+15555551234",
  "to": "+15555556789",
  "created_at": "2025-01-15T14:32:11.234Z",
  "webhook_url": "https://example.com/webhooks/call"
}
```

**Get call status:**
```bash
GET /v1/calls/:call_id
```

Response (200 OK):
```json
{
  "call_id": "call_01J1KQZX9F7GH4JWXY12ABCD",
  "status": "in-progress",
  "from": "+15555551234",
  "to": "+15555556789",
  "direction": "outbound",
  "start_time": "2025-01-15T14:32:11.234Z",
  "answer_time": "2025-01-15T14:32:15.456Z",
  "duration_seconds": 45,
  "recording_id": "rec_01J1KQZX9F7GH4",
  "custom_data": {
    "campaign_id": "camp_123"
  }
}
```

**List calls:**
```bash
GET /v1/calls?status=completed&from=2025-01-01&to=2025-01-31&limit=100
```

**Execute call action:**
```bash
POST /v1/calls/:call_id/actions
Content-Type: application/json

{
  "action": "play",
  "url": "https://example.com/hold-music.mp3",
  "loop": 3
}
```

Supported actions:
- `play`: Play audio file or TTS
- `gather`: Collect DTMF or speech input
- `transfer`: Transfer to another number
- `record`: Start/stop recording
- `hangup`: Terminate call

#### **Queues**

**Create queue:**
```bash
POST /v1/queues
Content-Type: application/json

{
  "name": "support",
  "strategy": "round_robin",
  "max_wait_seconds": 300,
  "service_level_threshold_seconds": 20,
  "required_skills": ["billing", "technical"]
}
```

**Get queue metrics:**
```bash
GET /v1/queues/:queue_id/metrics
```

Response:
```json
{
  "queue_id": "queue_01J1KQZX9F7GH4",
  "name": "support",
  "waiting_count": 12,
  "available_agents": 5,
  "busy_agents": 8,
  "ewt_seconds": 47,
  "service_level_pct": 87.5,
  "abandon_rate_pct": 5.2
}
```

**Enqueue call:**
```bash
POST /v1/queues/:queue_id/enqueue
Content-Type: application/json

{
  "call_id": "call_01J1KQZX9F7GH4",
  "priority": "high",
  "required_skills": ["spanish"]
}
```

#### **Agents**

**Update agent state:**
```bash
POST /v1/agents/:agent_id/state
Content-Type: application/json

{
  "state": "available"
}
```

States: `available`, `busy`, `wrap_up`, `offline`

**List agents:**
```bash
GET /v1/agents?queue_id=queue_01J1KQZX9F7GH4&state=available
```

#### **Numbers**

**List numbers:**
```bash
GET /v1/numbers
```

**Search available numbers:**
```bash
GET /v1/numbers/available?area_code=212&limit=10
```

**Purchase number:**
```bash
POST /v1/numbers
Content-Type: application/json

{
  "e164": "+12125551234",
  "voice_application_id": "app_01J1KQZX9F7GH4"
}
```

**Update number configuration:**
```bash
PATCH /v1/numbers/:e164
Content-Type: application/json

{
  "voice_webhook_url": "https://example.com/webhooks/inbound",
  "fallback_webhook_url": "https://example.com/webhooks/fallback"
}
```

**Release number:**
```bash
DELETE /v1/numbers/:e164
```

#### **Media & TTS**

**Upload audio file:**
```bash
POST /v1/media
Content-Type: multipart/form-data

file=@hold-music.mp3
```

**Generate TTS:**
```bash
POST /v1/tts
Content-Type: application/json

{
  "text": "Thank you for calling. Please hold.",
  "voice": "en-US-Neural2-A",
  "engine": "openai"
}
```

Response:
```json
{
  "audio_url": "https://cdn.irisx.com/tts/abc123.mp3",
  "duration_seconds": 5.2,
  "cache_hit": false
}
```

#### **WebRTC**

**Generate WebRTC token:**
```bash
POST /v1/tokens/webrtc
Content-Type: application/json

{
  "agent_id": "agent_01J1KQZX9F7GH4",
  "ttl_seconds": 3600
}
```

#### **CDR & Billing**

**Get CDRs:**
```bash
GET /v1/cdrs?from=2025-01-01&to=2025-01-31&status=completed&limit=100
```

**Lookup rate:**
```bash
GET /v1/rates/lookup?destination=+442071234567
```

Response:
```json
{
  "destination": "+442071234567",
  "destination_name": "United Kingdom - London",
  "per_minute_cost": 0.015,
  "currency": "USD"
}
```

**Get usage:**
```bash
GET /v1/usage?period=2025-01
```

**List invoices:**
```bash
GET /v1/invoices
```

**Get invoice PDF:**
```bash
GET /v1/invoices/:invoice_id/pdf
```

Returns redirect to signed PDF URL.

### Pagination

All list endpoints support cursor-based pagination:

```bash
GET /v1/calls?limit=100&cursor=call_01J1KQZX9F7GH4
```

Response:
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "call_01J1KQZY9F7GH5",
    "has_more": true
  }
}
```

### Rate Limiting

Rate limits per API key:

- **Free tier:** 100 requests/minute
- **Startup plan:** 1,000 requests/minute
- **Growth plan:** 10,000 requests/minute
- **Enterprise:** Custom

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1705329131
```

When exceeded:
```json
HTTP/1.1 429 Too Many Requests
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Please retry after 2025-01-15T14:32:11Z"
}
```

### Error Handling

Standard error response:
```json
{
  "error": "invalid_request",
  "message": "The 'to' field must be a valid E.164 phone number.",
  "details": {
    "field": "to",
    "provided": "555-1234",
    "expected": "+15555551234"
  }
}
```

Error codes:
- `invalid_request`: Malformed request
- `authentication_failed`: Invalid API key or JWT
- `authorization_failed`: Insufficient permissions
- `rate_limit_exceeded`: Too many requests
- `resource_not_found`: Call/queue/agent not found
- `resource_conflict`: Duplicate resource (e.g., number already purchased)
- `insufficient_balance`: Tenant out of credit
- `service_unavailable`: Temporary outage

---

## 13. API Versioning Strategy

### Versioning Scheme

**URL path versioning:** `/v1/`, `/v2/`, etc.

Example:
- `https://api.irisx.com/v1/calls` (current)
- `https://api.irisx.com/v2/calls` (future)

### Version Lifecycle

1. **Alpha:** Internal testing, no SLA, frequent breaking changes
2. **Beta:** Public but unstable, no SLA, breaking changes possible
3. **Stable:** Production-ready, SLA enforced, no breaking changes
4. **Deprecated:** Still works, but customers encouraged to migrate
5. **Sunset:** Version shut down, returns 410 Gone

### Breaking vs Non-Breaking Changes

**Non-breaking (patch within same version):**
- Adding new optional fields to requests
- Adding new fields to responses
- Adding new endpoints
- Adding new error codes (as long as error handling is generic)
- Adding new enum values (if code handles unknowns gracefully)

**Breaking (requires new major version):**
- Removing or renaming fields
- Changing field types (e.g., string → integer)
- Changing status codes for existing errors
- Changing authentication mechanisms
- Removing endpoints
- Changing required vs optional fields

### Deprecation Policy

**Timeline:**
1. **Announcement:** New version released, old version marked as "deprecated"
2. **Migration period:** 12 months to migrate (24 months for Enterprise customers)
3. **Sunset warning:** 3 months before shutdown, weekly email reminders
4. **Sunset:** Old version returns 410 Gone with migration instructions

**Communication:**
- Deprecation header: `Sunset: Sat, 15 Jan 2026 00:00:00 GMT`
- Changelog published: `https://docs.irisx.com/changelog`
- Email notifications to all affected customers
- API response warning header: `Warning: 299 - "API version v1 is deprecated. Migrate to v2 by 2026-01-15."`

### Version Negotiation

**Default:** If no version specified, use latest stable version

**Explicit version:**
```bash
GET https://api.irisx.com/v1/calls
```

**Header-based (alternative):**
```bash
GET https://api.irisx.com/calls
API-Version: 2025-01-15
```

Date-based versioning for fine-grained control (Stripe-style).

### SDK Versioning

SDKs track API versions:

```javascript
// Node.js SDK
import { IRISX } from '@irisx/sdk';

const client = new IRISX({
  apiKey: 'ix_live_abc123',
  apiVersion: '2025-01-15' // Optional, defaults to SDK's default version
});
```

SDK releases:
- **Major version (1.x → 2.x):** Breaking API changes
- **Minor version (1.1 → 1.2):** New features, backward-compatible
- **Patch version (1.1.0 → 1.1.1):** Bug fixes only

---

## 14. Data Model

### Database Selection

**Startup (Phase 1):**
- **Neon Postgres Serverless:** Free tier (0.5GB) → Paid ($20/mo for 10GB)
- Autoscaling compute (0.25 - 4 vCPU)
- Built-in connection pooling (pgBouncer)
- Branching for dev/staging environments

**Scale (Phase 3):**
- **Aurora PostgreSQL Serverless v2:** $100-500/mo depending on usage
- Autoscaling (0.5 - 128 ACU)
- Multi-AZ for high availability
- Aurora Global Database for multi-region

**Enterprise (Phase 4):**
- **Aurora Global Database:** Read replicas in 3+ regions
- Cross-region failover <1 minute
- Cost: $1,500+/mo

### Schema Design

**Tenants and Users:**
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(63) UNIQUE NOT NULL,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'startup', 'growth', 'enterprise')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  limits JSONB NOT NULL DEFAULT '{
    "cps": 5,
    "concurrent_channels": 10,
    "queue_length": 100,
    "recording_days": 90,
    "tts_quota_monthly": 100000,
    "storage_gb": 5,
    "monthly_spend_limit": 1000
  }',
  billing_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'developer', 'agent', 'analyst', 'readonly')),
  firebase_uid VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
```

**Applications and Numbers:**
```sql
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('webhook', 'flow', 'hybrid')),
  voice_webhook_url TEXT,
  flow_json JSONB,
  status_webhook_url TEXT,
  fallback_webhook_url TEXT,
  webhook_signing_secret VARCHAR(128) NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE numbers (
  e164 VARCHAR(20) PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  carrier VARCHAR(50) NOT NULL,
  carrier_ref VARCHAR(255),
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'porting', 'released')),
  voice_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  voice_webhook_url TEXT,
  fallback_webhook_url TEXT,
  emergency_address_id UUID,
  capabilities JSONB DEFAULT '{"voice": true, "sms": false, "mms": false}',
  purchased_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_numbers_tenant ON numbers(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_numbers_status ON numbers(status);
```

**Calls and CDR:**
```sql
CREATE TABLE calls (
  id VARCHAR(50) PRIMARY KEY, -- ULID for sortability
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answer_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  sip_call_id VARCHAR(255),
  application_id UUID REFERENCES applications(id),
  custom_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calls_tenant_time ON calls(tenant_id, start_time DESC);
CREATE INDEX idx_calls_status ON calls(status) WHERE status IN ('queued', 'ringing', 'in-progress');

CREATE TABLE cdr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(50) REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  duration_seconds INTEGER,
  billable_seconds INTEGER,
  disposition VARCHAR(50),
  hangup_cause VARCHAR(100),
  carrier VARCHAR(50),
  region VARCHAR(50),
  codec VARCHAR(20),
  rate NUMERIC(10,6),
  cost NUMERIC(10,4),
  recording_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Partitions managed by pg_partman or manual cron
CREATE TABLE cdr_2025_01 PARTITION OF cdr FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE cdr_2025_02 PARTITION OF cdr FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE INDEX idx_cdr_tenant_time ON cdr(tenant_id, created_at DESC);
CREATE INDEX idx_cdr_call ON cdr(call_id);
```

**Queues and Agents:**
```sql
CREATE TABLE queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  strategy VARCHAR(50) DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'least_recent', 'fewest_calls', 'skills_based', 'priority', 'sticky_agent')),
  max_wait_seconds INTEGER DEFAULT 300,
  service_level_threshold_seconds INTEGER DEFAULT 20,
  required_skills JSONB DEFAULT '[]',
  priority_enabled BOOLEAN DEFAULT FALSE,
  sticky_agent_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  skills JSONB DEFAULT '[]',
  capacity INTEGER DEFAULT 1 CHECK (capacity BETWEEN 1 AND 5),
  state VARCHAR(50) DEFAULT 'offline' CHECK (state IN ('available', 'busy', 'wrap_up', 'offline')),
  last_call_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_tenant_state ON agents(tenant_id, state);

CREATE TABLE queue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
  call_id VARCHAR(50) REFERENCES calls(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  event VARCHAR(50) NOT NULL CHECK (event IN ('entered', 'answered', 'abandoned', 'completed')),
  wait_seconds INTEGER,
  handle_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_events_queue_time ON queue_events(queue_id, created_at DESC);
CREATE INDEX idx_queue_events_call ON queue_events(call_id);
```

**Campaigns and Dialer:**
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('preview', 'progressive', 'predictive')),
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  dial_ratio NUMERIC(3,2) DEFAULT 1.00 CHECK (dial_ratio BETWEEN 1.00 AND 5.00),
  max_attempts INTEGER DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  curfew_start TIME DEFAULT '21:00',
  curfew_end TIME DEFAULT '08:00',
  amd_enabled BOOLEAN DEFAULT TRUE,
  agent_queue_id UUID REFERENCES queues(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  data JSONB,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  attempts INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'called', 'answered', 'no_answer', 'dnc', 'completed')),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_contacts_campaign_status ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_next_attempt ON campaign_contacts(next_attempt_at) WHERE status = 'pending';

CREATE TABLE dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  reason VARCHAR(255),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

CREATE INDEX idx_dnc_phone ON dnc_list(phone);
```

**Recordings and Transcriptions:**
```sql
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id VARCHAR(50) REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  storage_key VARCHAR(500) NOT NULL,
  duration_seconds INTEGER,
  channels INTEGER DEFAULT 1,
  file_size_bytes BIGINT,
  redaction_json JSONB,
  transcription_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_recordings_call ON recordings(call_id);
CREATE INDEX idx_recordings_tenant_time ON recordings(tenant_id, created_at DESC);
CREATE INDEX idx_recordings_expires ON recordings(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  confidence NUMERIC(3,2),
  words JSONB,
  sentiment JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Billing:**
```sql
CREATE TABLE rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  destination_prefix VARCHAR(20) NOT NULL,
  destination_name VARCHAR(255),
  carrier VARCHAR(50),
  route_class VARCHAR(50) DEFAULT 'standard',
  per_minute_cost NUMERIC(10,6) NOT NULL,
  effective_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_cards_prefix ON rate_cards(destination_prefix);
CREATE INDEX idx_rate_cards_tenant ON rate_cards(tenant_id) WHERE tenant_id IS NOT NULL;

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  taxes NUMERIC(10,2) DEFAULT 0,
  surcharges NUMERIC(10,2) DEFAULT 0,
  credits NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant_period ON invoices(tenant_id, period_start DESC);

CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  call_id VARCHAR(50),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,6) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  taxes NUMERIC(10,2) DEFAULT 0,
  surcharges NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
```

### Indexes and Performance

**Query patterns to optimize:**

1. **Get recent calls for tenant:**
```sql
SELECT * FROM calls WHERE tenant_id = ? ORDER BY start_time DESC LIMIT 100;
-- Covered by: idx_calls_tenant_time
```

2. **Get active calls:**
```sql
SELECT * FROM calls WHERE status IN ('queued', 'ringing', 'in-progress');
-- Covered by: idx_calls_status (partial index)
```

3. **Rate lookup:**
```sql
SELECT * FROM rate_cards WHERE destination_prefix = ? ORDER BY LENGTH(destination_prefix) DESC LIMIT 1;
-- Covered by: idx_rate_cards_prefix
```

4. **DNC check:**
```sql
SELECT 1 FROM dnc_list WHERE tenant_id = ? AND phone = ? LIMIT 1;
-- Covered by: unique(tenant_id, phone) and idx_dnc_phone
```

5. **Queue events for analytics:**
```sql
SELECT * FROM queue_events WHERE queue_id = ? AND created_at >= ? ORDER BY created_at DESC;
-- Covered by: idx_queue_events_queue_time
```

**Index maintenance:**
- `REINDEX CONCURRENTLY` monthly for large tables (cdr, calls)
- `VACUUM ANALYZE` daily via cron
- Monitor index bloat with `pg_stat_user_indexes`

---

(Content continues but hitting length limits. The file has been created with extensive detail. Let me create a summary of what's included and what remains.)
