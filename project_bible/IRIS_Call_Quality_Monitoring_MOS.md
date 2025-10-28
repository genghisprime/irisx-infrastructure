# IRIS Call Quality Monitoring & MOS Scoring

> **Real-time call quality monitoring with Mean Opinion Score (MOS), RTCP analytics, and automated quality assurance**

---

## Table of Contents

1. [Overview](#overview)
2. [MOS Score Explained](#mos-score-explained)
3. [Architecture](#architecture)
4. [RTCP Collection](#rtcp-collection)
5. [MOS Calculation](#mos-calculation)
6. [Database Schema](#database-schema)
7. [Real-Time Monitoring](#real-time-monitoring)
8. [Quality Alerts](#quality-alerts)
9. [Analytics & Reporting](#analytics--reporting)
10. [Troubleshooting Dashboard](#troubleshooting-dashboard)
11. [API Implementation](#api-implementation)
12. [Cost Model](#cost-model)

---

## Overview

### Why Call Quality Monitoring Matters

**Business Impact:**
- Poor call quality = lost sales, customer churn, brand damage
- 5-star rated calls convert 3x better than 2-star calls
- Proactive quality alerts prevent customer complaints
- Data-driven carrier selection saves 20-30% on costs

**Technical Benefits:**
- Identify network issues before customers complain
- Optimize carrier selection based on quality metrics
- Debug one-way audio, echo, latency issues
- Prove SLA compliance to customers

**Competitive Necessity:**
- Five9, Talkdesk, Genesys, RingCentral all provide MOS scoring
- Without MOS, cannot compete in contact center market
- Enterprise customers require quality SLAs (MOS >3.5 guaranteed)

### What We're Building

**Core Features:**
- ✅ Real-time RTCP monitoring during calls
- ✅ MOS score calculation (ITU-T P.800 & E-Model)
- ✅ Quality metrics: jitter, packet loss, latency, R-factor
- ✅ Post-call quality reports (per call, per agent, per carrier)
- ✅ Live quality dashboard with WebSocket updates
- ✅ Automatic alerts for poor quality (MOS <3.0)
- ✅ Carrier quality comparison & ranking
- ✅ Predictive quality scoring (ML-based)
- ✅ Network troubleshooting tools

**MOS Score Range:**
| MOS Score | Quality | User Experience |
|-----------|---------|-----------------|
| **4.3 - 5.0** | Excellent | Crystal clear, no issues |
| **4.0 - 4.3** | Good | Slight imperfections, barely noticeable |
| **3.6 - 4.0** | Fair | Noticeable but not annoying |
| **3.1 - 3.6** | Poor | Annoying, impacts conversation |
| **2.6 - 3.0** | Bad | Very annoying, hard to communicate |
| **1.0 - 2.5** | Unacceptable | Unusable |

**Target: MOS >4.0 for 95% of calls**

---

## MOS Score Explained

### What is MOS?

**Mean Opinion Score (MOS):**
- Subjective measure of voice quality (1.0 - 5.0 scale)
- Originally: Humans rate call quality after listening
- Modern: Calculated algorithmically from network metrics (RTCP)

**ITU-T Standards:**
- **P.800**: Original subjective MOS testing methodology
- **E-Model (G.107)**: Objective quality calculation
- **PESQ (P.862)**: Perceptual Evaluation of Speech Quality
- **POLQA (P.863)**: Latest standard (2011+)

### Factors Affecting MOS

**Network Metrics (from RTCP):**
1. **Packet Loss**: Most critical (>3% = MOS <3.5)
2. **Jitter**: Variation in packet arrival time (>30ms = poor)
3. **Latency (RTT)**: Round-trip time (>150ms = echo/delay)
4. **Codec**: G.711 (MOS 4.4) vs G.729 (MOS 3.9) vs Opus (MOS 4.5)

**Other Factors:**
5. **Echo**: Acoustic echo (ERL), line echo
6. **Noise**: Background noise, line noise (SNR)
7. **Clipping**: Voice cutoff from aggressive VAD
8. **Compression**: Low bitrate codecs reduce quality

### E-Model R-Factor

**R-Factor (0-100):**
- Intermediate value used to calculate MOS
- Accounts for all quality impairments
- Easier to combine multiple factors than MOS directly

**Formula:**
```
R = R0 - Is - Id - Ie + A

Where:
R0 = Basic signal-to-noise ratio (93.2 for G.711)
Is = Impairments occurring simultaneously with voice (0-10)
Id = Impairments caused by delay (0-25)
Ie = Impairments caused by codec + packet loss (0-40)
A  = Advantage factor (0 for wired, 5 for mobile)
```

**R-Factor to MOS Conversion:**
```
If R < 0:    MOS = 1.0
If R > 100:  MOS = 4.5
Else:
  MOS = 1 + 0.035*R + 7*10^-6*R*(R-60)*(100-R)
```

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  FreeSWITCH     │
│  (Call Active)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  RTCP Packets (every 5 seconds) │
│  - Jitter, packet loss, RTT     │
│  - Sent by both endpoints       │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  FreeSWITCH ESL (Event Socket Layer)    │
│  - Subscribe to RTCP events              │
│  - Parse RTP stats from events           │
└────────┬─────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  Quality Monitor (Bun Worker)            │
│                                          │
│  1. Receive RTCP event from NATS         │
│  2. Calculate MOS from metrics           │
│  3. Store in TimescaleDB (time-series)   │
│  4. Check alert thresholds               │
│  5. Broadcast to dashboard (WebSocket)   │
│  6. Update call quality score            │
└────────┬─────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  TimescaleDB        │
│  (Hypertable)       │ ← Fast time-series queries
│  - RTCP metrics     │
│  - MOS scores       │
└─────────────────────┘

┌─────────────────────────────────────────┐
│  Dashboard (WebSocket)                  │
│  - Real-time quality graph per call    │
│  - Alert when MOS < 3.0                 │
│  - Carrier quality comparison           │
└─────────────────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **RTCP Source** | FreeSWITCH ESL | Captures RTP/RTCP stats from calls |
| **Quality Monitor** | Bun worker (NATS consumer) | Calculates MOS, stores metrics |
| **Time-Series DB** | TimescaleDB (Postgres extension) | Stores metrics for fast queries |
| **Real-Time Updates** | WebSocket (Hono) | Pushes quality updates to dashboard |
| **Alerting** | NATS pub/sub | Sends alerts for poor quality |
| **ML Model** | Python (scikit-learn) | Predicts quality issues |

---

## RTCP Collection

### FreeSWITCH RTCP Configuration

**Enable RTCP in SIP profile (`sip_profiles/internal.xml`):**
```xml
<profile name="internal">
  <settings>
    <param name="rtcp-interval" value="5000"/> <!-- Send RTCP every 5 seconds -->
    <param name="rtcp-stats" value="true"/>
  </settings>
</profile>
```

### Event Socket Layer (ESL) Subscription

```typescript
import { Client as ESLClient } from 'esl';

const esl = new ESLClient();

esl.on('ready', async () => {
  console.log('✅ Connected to FreeSWITCH ESL');

  // Subscribe to RTCP events
  await esl.send('event json CHANNEL_HANGUP RTCP');

  console.log('📊 Subscribed to RTCP events');
});

esl.on('esl::event::RTCP', async (event: any) => {
  const callId = event.getHeader('Unique-ID');
  const direction = event.getHeader('Call-Direction'); // inbound/outbound

  // Parse RTCP statistics
  const rtcpStats = {
    call_id: callId,
    timestamp: new Date(),

    // Jitter (ms)
    jitter_in: parseFloat(event.getHeader('RTCP-Audio-In-Jitter-Max-Variance')) || 0,
    jitter_out: parseFloat(event.getHeader('RTCP-Audio-Out-Jitter-Max-Variance')) || 0,

    // Packet Loss (%)
    packet_loss_in: parseFloat(event.getHeader('RTCP-Audio-In-Packet-Loss')) || 0,
    packet_loss_out: parseFloat(event.getHeader('RTCP-Audio-Out-Packet-Loss')) || 0,

    // Round-Trip Time (ms)
    rtt: parseFloat(event.getHeader('RTCP-Audio-RTT-Msec')) || 0,

    // Codec
    codec: event.getHeader('Channel-Read-Codec-Name'), // PCMU, PCMA, Opus, etc.

    // Packet counts
    packets_sent: parseInt(event.getHeader('RTCP-Audio-Out-Packet-Count')) || 0,
    packets_received: parseInt(event.getHeader('RTCP-Audio-In-Packet-Count')) || 0,
    packets_lost: parseInt(event.getHeader('RTCP-Audio-In-Skip-Packet-Count')) || 0,

    // Media quality
    mos_estimate: parseFloat(event.getHeader('RTCP-Audio-In-Mean-MOS')) || 0, // FreeSWITCH estimate
  };

  // Publish to NATS for processing
  await nc.publish('rtcp.stats', JSON.stringify(rtcpStats));
});

esl.connect('127.0.0.1', 8021, 'ClueCon'); // Default FreeSWITCH ESL password
```

### NATS Consumer (Quality Monitor)

```typescript
import { connect } from 'nats';

const nc = await connect({ servers: 'nats://localhost:4222' });
const js = nc.jetstream();

const consumer = await js.consumers.get('calls', 'quality-monitor');

console.log('📊 Quality Monitor started');

for await (const msg of await consumer.consume()) {
  const rtcpStats = JSON.parse(msg.string());

  // Calculate MOS
  const qualityMetrics = await calculateQualityMetrics(rtcpStats);

  // Store in database
  await storeQualityMetrics(rtcpStats.call_id, qualityMetrics);

  // Check alert thresholds
  if (qualityMetrics.mos < 3.0) {
    await sendQualityAlert(rtcpStats.call_id, qualityMetrics);
  }

  // Broadcast to dashboard
  await broadcastQualityUpdate(rtcpStats.call_id, qualityMetrics);

  msg.ack();
}
```

---

## MOS Calculation

### E-Model Implementation

```typescript
interface RTCPStats {
  jitter_in: number;      // ms
  jitter_out: number;     // ms
  packet_loss_in: number; // %
  packet_loss_out: number; // %
  rtt: number;            // ms (round-trip time)
  codec: string;          // PCMU, PCMA, Opus, G729, etc.
}

interface QualityMetrics {
  mos: number;           // 1.0 - 5.0
  r_factor: number;      // 0 - 100
  quality: string;       // Excellent, Good, Fair, Poor, Bad
  jitter_avg: number;    // ms
  packet_loss_avg: number; // %
  latency: number;       // ms (one-way)
}

async function calculateQualityMetrics(stats: RTCPStats): Promise<QualityMetrics> {
  // 1. Calculate average jitter
  const jitter_avg = (stats.jitter_in + stats.jitter_out) / 2;

  // 2. Calculate average packet loss
  const packet_loss_avg = (stats.packet_loss_in + stats.packet_loss_out) / 2;

  // 3. Calculate one-way latency (RTT / 2)
  const latency = stats.rtt / 2;

  // 4. Get codec parameters
  const codecParams = getCodecParams(stats.codec);

  // 5. Calculate R-Factor using E-Model (ITU-T G.107)
  const r_factor = calculateRFactor({
    codec: codecParams,
    packet_loss: packet_loss_avg,
    latency,
    jitter: jitter_avg,
  });

  // 6. Convert R-Factor to MOS
  const mos = rFactorToMOS(r_factor);

  // 7. Determine quality label
  const quality = getQualityLabel(mos);

  return {
    mos,
    r_factor,
    quality,
    jitter_avg,
    packet_loss_avg,
    latency,
  };
}

// Codec quality parameters
function getCodecParams(codecName: string): CodecParams {
  const codecs: Record<string, CodecParams> = {
    'PCMU': { r0: 93.2, ie_base: 0 },  // G.711 μ-law (best quality)
    'PCMA': { r0: 93.2, ie_base: 0 },  // G.711 A-law
    'Opus': { r0: 94.0, ie_base: 0 },  // Opus (best quality, adaptive)
    'G729': { r0: 93.2, ie_base: 11 }, // G.729 (lower quality, compressed)
    'G722': { r0: 93.2, ie_base: 0 },  // G.722 (wideband)
  };

  return codecs[codecName] || codecs['PCMU'];
}

interface CodecParams {
  r0: number;     // Base signal-to-noise ratio
  ie_base: number; // Equipment impairment factor
}

// Calculate R-Factor (E-Model)
function calculateRFactor(params: {
  codec: CodecParams;
  packet_loss: number; // %
  latency: number;     // ms
  jitter: number;      // ms
}): number {
  const { codec, packet_loss, latency, jitter } = params;

  // R0: Basic signal-to-noise ratio (93.2 for G.711)
  const R0 = codec.r0;

  // Is: Impairments occurring simultaneously with voice signal
  // (Quantization noise, side tone, etc.)
  const Is = 0; // Typically 0 for VoIP

  // Id: Impairments caused by delay
  // Formula: Id = 0.024*d + 0.11*(d-177.3)*H(d-177.3)
  // where H(x) = 0 if x<0, else 1
  let Id = 0;
  if (latency < 177.3) {
    Id = 0.024 * latency;
  } else {
    Id = 0.024 * latency + 0.11 * (latency - 177.3);
  }

  // Ie: Equipment impairment factor (codec + packet loss)
  // Formula: Ie = Ie_base + (95 - Ie_base) * (packet_loss / (packet_loss + Bpl))
  // Bpl = Packet Loss Robustness Factor (codec-specific)
  const Bpl = 25; // For most codecs
  const Ie = codec.ie_base + (95 - codec.ie_base) * (packet_loss / (packet_loss + Bpl));

  // A: Advantage factor (0 for landline, 5 for mobile, 10 for satellite)
  const A = 0;

  // Calculate R-Factor
  let R = R0 - Is - Id - Ie + A;

  // Jitter penalty (not in standard E-Model, but practical adjustment)
  if (jitter > 30) {
    R -= (jitter - 30) * 0.1; // Reduce R-Factor for high jitter
  }

  // Clamp to valid range
  R = Math.max(0, Math.min(100, R));

  return R;
}

// Convert R-Factor to MOS (ITU-T G.107)
function rFactorToMOS(R: number): number {
  if (R < 0) return 1.0;
  if (R > 100) return 4.5;

  // Formula: MOS = 1 + 0.035*R + 7*10^-6*R*(R-60)*(100-R)
  const MOS = 1 + 0.035 * R + 0.000007 * R * (R - 60) * (100 - R);

  // Round to 1 decimal place
  return Math.round(MOS * 10) / 10;
}

// Get quality label from MOS score
function getQualityLabel(mos: number): string {
  if (mos >= 4.3) return 'Excellent';
  if (mos >= 4.0) return 'Good';
  if (mos >= 3.6) return 'Fair';
  if (mos >= 3.1) return 'Poor';
  if (mos >= 2.6) return 'Bad';
  return 'Unacceptable';
}
```

### Example Calculation

**Scenario:** G.711 call with 2% packet loss, 80ms latency, 15ms jitter

```typescript
const stats = {
  jitter_in: 15,
  jitter_out: 15,
  packet_loss_in: 2.0,
  packet_loss_out: 2.0,
  rtt: 160,
  codec: 'PCMU',
};

const metrics = await calculateQualityMetrics(stats);

// Results:
// R0 = 93.2
// Is = 0
// Id = 0.024 * 80 = 1.92
// Ie = 0 + (95 - 0) * (2 / (2 + 25)) = 7.04
// R = 93.2 - 0 - 1.92 - 7.04 + 0 = 84.24
// MOS = 1 + 0.035*84.24 + 0.000007*84.24*(84.24-60)*(100-84.24) = 4.1

console.log(metrics);
// {
//   mos: 4.1,
//   r_factor: 84.2,
//   quality: 'Good',
//   jitter_avg: 15,
//   packet_loss_avg: 2.0,
//   latency: 80
// }
```

---

## Database Schema

### TimescaleDB Setup

**Why TimescaleDB?**
- PostgreSQL extension for time-series data
- 20x faster queries than regular Postgres
- Automatic partitioning (hypertables)
- Continuous aggregates (pre-computed rollups)
- Data retention policies

**Installation:**
```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Schema

```sql
-- Call quality metrics (time-series)
CREATE TABLE call_quality_metrics (
  time TIMESTAMPTZ NOT NULL,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- MOS & R-Factor
  mos NUMERIC(3,1) NOT NULL CHECK (mos >= 1.0 AND mos <= 5.0),
  r_factor NUMERIC(5,2) NOT NULL CHECK (r_factor >= 0 AND r_factor <= 100),
  quality TEXT NOT NULL, -- Excellent, Good, Fair, Poor, Bad, Unacceptable

  -- Network metrics
  jitter_avg NUMERIC(8,2), -- ms
  jitter_in NUMERIC(8,2),  -- ms
  jitter_out NUMERIC(8,2), -- ms

  packet_loss_avg NUMERIC(5,2), -- %
  packet_loss_in NUMERIC(5,2),  -- %
  packet_loss_out NUMERIC(5,2), -- %

  latency NUMERIC(8,2), -- ms (one-way)
  rtt NUMERIC(8,2),     -- ms (round-trip time)

  -- Codec
  codec TEXT NOT NULL,

  -- Packet counts
  packets_sent INTEGER,
  packets_received INTEGER,
  packets_lost INTEGER,

  -- Call metadata (for joins)
  carrier_id UUID REFERENCES carriers(id),
  agent_id UUID REFERENCES users(id),
  direction TEXT CHECK (direction IN ('inbound', 'outbound'))
);

-- Convert to hypertable (enables time-series optimizations)
SELECT create_hypertable('call_quality_metrics', 'time',
  chunk_time_interval => INTERVAL '1 day');

-- Indexes for fast queries
CREATE INDEX idx_cqm_call_id ON call_quality_metrics (call_id, time DESC);
CREATE INDEX idx_cqm_tenant_id ON call_quality_metrics (tenant_id, time DESC);
CREATE INDEX idx_cqm_carrier_id ON call_quality_metrics (carrier_id, time DESC) WHERE carrier_id IS NOT NULL;
CREATE INDEX idx_cqm_agent_id ON call_quality_metrics (agent_id, time DESC) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_cqm_mos ON call_quality_metrics (mos, time DESC);

-- Continuous aggregate: Hourly quality averages
CREATE MATERIALIZED VIEW call_quality_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS hour,
  tenant_id,
  carrier_id,
  AVG(mos) AS avg_mos,
  AVG(r_factor) AS avg_r_factor,
  AVG(jitter_avg) AS avg_jitter,
  AVG(packet_loss_avg) AS avg_packet_loss,
  AVG(latency) AS avg_latency,
  COUNT(*) AS call_count,
  COUNT(*) FILTER (WHERE mos < 3.0) AS poor_quality_count
FROM call_quality_metrics
GROUP BY hour, tenant_id, carrier_id;

-- Continuous aggregate: Daily carrier quality comparison
CREATE MATERIALIZED VIEW carrier_quality_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS day,
  tenant_id,
  carrier_id,
  AVG(mos) AS avg_mos,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mos) AS median_mos,
  MIN(mos) AS min_mos,
  COUNT(*) AS call_count,
  COUNT(*) FILTER (WHERE mos >= 4.0) AS excellent_count,
  COUNT(*) FILTER (WHERE mos < 3.0) AS poor_count,
  (COUNT(*) FILTER (WHERE mos >= 4.0)::FLOAT / COUNT(*) * 100) AS quality_percentage
FROM call_quality_metrics
WHERE carrier_id IS NOT NULL
GROUP BY day, tenant_id, carrier_id;

-- Refresh policy (update aggregates every 10 minutes)
SELECT add_continuous_aggregate_policy('call_quality_hourly',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '10 minutes');

SELECT add_continuous_aggregate_policy('carrier_quality_daily',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Data retention policy (keep raw data for 90 days)
SELECT add_retention_policy('call_quality_metrics', INTERVAL '90 days');

-- Quality alerts table
CREATE TABLE call_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  -- Alert details
  alert_type TEXT NOT NULL, -- low_mos, high_jitter, high_packet_loss, high_latency
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),

  -- Metrics at time of alert
  mos NUMERIC(3,1),
  jitter NUMERIC(8,2),
  packet_loss NUMERIC(5,2),
  latency NUMERIC(8,2),

  -- Alert message
  message TEXT NOT NULL,

  -- Status
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_alerts_tenant ON call_quality_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_quality_alerts_call ON call_quality_alerts(call_id);
CREATE INDEX idx_quality_alerts_unacknowledged ON call_quality_alerts(tenant_id)
  WHERE acknowledged = FALSE;
```

---

## Real-Time Monitoring

### WebSocket Updates

```typescript
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';

const app = new Hono();

// WebSocket endpoint for real-time quality updates
app.get('/ws/quality/:call_id', upgradeWebSocket((c) => {
  const callId = c.req.param('call_id');
  const tenantId = c.req.user.tenant_id;

  return {
    onOpen: async (evt, ws) => {
      console.log(`📊 Quality monitoring started for call ${callId}`);

      // Send initial quality data
      const initialMetrics = await db.query(`
        SELECT mos, r_factor, quality, jitter_avg, packet_loss_avg, latency
        FROM call_quality_metrics
        WHERE call_id = $1 AND tenant_id = $2
        ORDER BY time DESC
        LIMIT 1
      `, [callId, tenantId]);

      if (initialMetrics.rows.length > 0) {
        ws.send(JSON.stringify({
          type: 'initial_quality',
          data: initialMetrics.rows[0],
        }));
      }

      // Subscribe to NATS for this call
      const sub = nc.subscribe(`quality.${callId}`);
      (async () => {
        for await (const msg of sub) {
          const metrics = JSON.parse(msg.string());
          ws.send(JSON.stringify({
            type: 'quality_update',
            data: metrics,
            timestamp: new Date().toISOString(),
          }));
        }
      })();

      // Store subscription for cleanup
      ws.data = { subscription: sub };
    },

    onClose: (evt, ws) => {
      console.log(`📊 Quality monitoring stopped for call ${callId}`);
      ws.data?.subscription?.unsubscribe();
    },
  };
}));
```

### Dashboard Component (React)

```tsx
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';

interface QualityMetrics {
  mos: number;
  r_factor: number;
  quality: string;
  jitter_avg: number;
  packet_loss_avg: number;
  latency: number;
}

export function CallQualityMonitor({ callId }: { callId: string }) {
  const [metrics, setMetrics] = useState<QualityMetrics[]>([]);
  const [currentQuality, setCurrentQuality] = useState<QualityMetrics | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`wss://api.iris.com/ws/quality/${callId}`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'initial_quality') {
        setCurrentQuality(message.data);
        setMetrics([message.data]);
      } else if (message.type === 'quality_update') {
        setCurrentQuality(message.data);
        setMetrics((prev) => [...prev.slice(-60), message.data]); // Keep last 60 samples
      }
    };

    return () => ws.close();
  }, [callId]);

  const chartData = {
    labels: metrics.map((_, i) => `${i * 5}s`), // Every 5 seconds
    datasets: [
      {
        label: 'MOS Score',
        data: metrics.map((m) => m.mos),
        borderColor: getMOSColor(currentQuality?.mos || 0),
        backgroundColor: 'transparent',
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    scales: {
      y: {
        min: 1,
        max: 5,
        ticks: {
          callback: (value: number) => {
            if (value === 4.3) return 'Excellent';
            if (value === 4.0) return 'Good';
            if (value === 3.6) return 'Fair';
            if (value === 3.1) return 'Poor';
            return value;
          },
        },
      },
    },
    plugins: {
      annotation: {
        annotations: {
          threshold: {
            type: 'line',
            yMin: 3.0,
            yMax: 3.0,
            borderColor: 'red',
            borderDash: [5, 5],
            label: {
              content: 'Alert Threshold',
              enabled: true,
            },
          },
        },
      },
    },
  };

  return (
    <div className="quality-monitor">
      <div className="quality-score">
        <h2>Call Quality</h2>
        <div
          className="mos-badge"
          style={{ backgroundColor: getMOSColor(currentQuality?.mos || 0) }}
        >
          {currentQuality?.mos.toFixed(1) || '--'}
        </div>
        <div className="quality-label">{currentQuality?.quality || 'Unknown'}</div>
      </div>

      <div className="quality-metrics">
        <div className="metric">
          <span className="label">Jitter:</span>
          <span className="value">{currentQuality?.jitter_avg.toFixed(1)}ms</span>
        </div>
        <div className="metric">
          <span className="label">Packet Loss:</span>
          <span className="value">{currentQuality?.packet_loss_avg.toFixed(2)}%</span>
        </div>
        <div className="metric">
          <span className="label">Latency:</span>
          <span className="value">{currentQuality?.latency.toFixed(0)}ms</span>
        </div>
      </div>

      <div className="quality-chart">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

function getMOSColor(mos: number): string {
  if (mos >= 4.3) return '#10b981'; // Green
  if (mos >= 4.0) return '#84cc16'; // Light green
  if (mos >= 3.6) return '#facc15'; // Yellow
  if (mos >= 3.1) return '#f97316'; // Orange
  return '#ef4444'; // Red
}
```

---

## Quality Alerts

### Alert Thresholds

```typescript
const QUALITY_ALERT_THRESHOLDS = {
  critical: {
    mos: 2.5,
    jitter: 50,        // ms
    packet_loss: 5.0,  // %
    latency: 200,      // ms
  },
  warning: {
    mos: 3.0,
    jitter: 30,
    packet_loss: 3.0,
    latency: 150,
  },
};

async function checkQualityAlerts(callId: string, metrics: QualityMetrics) {
  const alerts: string[] = [];
  let severity: 'warning' | 'critical' = 'warning';

  // Check MOS
  if (metrics.mos < QUALITY_ALERT_THRESHOLDS.critical.mos) {
    alerts.push(`Critical: MOS score is ${metrics.mos} (below 2.5)`);
    severity = 'critical';
  } else if (metrics.mos < QUALITY_ALERT_THRESHOLDS.warning.mos) {
    alerts.push(`Warning: MOS score is ${metrics.mos} (below 3.0)`);
  }

  // Check jitter
  if (metrics.jitter_avg > QUALITY_ALERT_THRESHOLDS.critical.jitter) {
    alerts.push(`Critical: Jitter is ${metrics.jitter_avg.toFixed(1)}ms (above 50ms)`);
    severity = 'critical';
  } else if (metrics.jitter_avg > QUALITY_ALERT_THRESHOLDS.warning.jitter) {
    alerts.push(`Warning: Jitter is ${metrics.jitter_avg.toFixed(1)}ms (above 30ms)`);
  }

  // Check packet loss
  if (metrics.packet_loss_avg > QUALITY_ALERT_THRESHOLDS.critical.packet_loss) {
    alerts.push(`Critical: Packet loss is ${metrics.packet_loss_avg.toFixed(2)}% (above 5%)`);
    severity = 'critical';
  } else if (metrics.packet_loss_avg > QUALITY_ALERT_THRESHOLDS.warning.packet_loss) {
    alerts.push(`Warning: Packet loss is ${metrics.packet_loss_avg.toFixed(2)}% (above 3%)`);
  }

  // Check latency
  if (metrics.latency > QUALITY_ALERT_THRESHOLDS.critical.latency) {
    alerts.push(`Critical: Latency is ${metrics.latency.toFixed(0)}ms (above 200ms)`);
    severity = 'critical';
  } else if (metrics.latency > QUALITY_ALERT_THRESHOLDS.warning.latency) {
    alerts.push(`Warning: Latency is ${metrics.latency.toFixed(0)}ms (above 150ms)`);
  }

  // Send alerts if any
  if (alerts.length > 0) {
    await sendQualityAlert(callId, severity, alerts.join('; '), metrics);
  }
}

async function sendQualityAlert(
  callId: string,
  severity: 'warning' | 'critical',
  message: string,
  metrics: QualityMetrics
) {
  // Get call details
  const call = await db.query(`
    SELECT tenant_id, from_number, to_number, agent_id, carrier_id
    FROM calls
    WHERE id = $1
  `, [callId]);

  if (call.rows.length === 0) return;

  const { tenant_id, agent_id, carrier_id } = call.rows[0];

  // Store alert in database
  await db.query(`
    INSERT INTO call_quality_alerts (
      call_id, tenant_id, alert_type, severity,
      mos, jitter, packet_loss, latency, message
    )
    VALUES ($1, $2, 'low_mos', $3, $4, $5, $6, $7, $8)
  `, [
    callId,
    tenant_id,
    severity,
    metrics.mos,
    metrics.jitter_avg,
    metrics.packet_loss_avg,
    metrics.latency,
    message,
  ]);

  // Send real-time notification via WebSocket
  await nc.publish(`alerts.${tenant_id}`, JSON.stringify({
    type: 'quality_alert',
    severity,
    call_id: callId,
    agent_id,
    carrier_id,
    message,
    metrics,
  }));

  // Send email/SMS for critical alerts
  if (severity === 'critical') {
    await sendEmail({
      to: 'ops@iris.com',
      subject: `CRITICAL: Poor call quality on call ${callId}`,
      body: `MOS: ${metrics.mos}, Jitter: ${metrics.jitter_avg}ms, Packet Loss: ${metrics.packet_loss_avg}%, Latency: ${metrics.latency}ms\n\n${message}`,
    });
  }

  console.log(`🚨 ${severity.toUpperCase()} quality alert for call ${callId}: ${message}`);
}
```

---

## Analytics & Reporting

### Carrier Quality Comparison

```typescript
// GET /v1/analytics/carrier-quality
async function getCarrierQualityReport(req: Request): Promise<Response> {
  const tenantId = req.user.tenant_id;
  const days = parseInt(req.query.days || '30');

  const report = await db.query(`
    SELECT
      c.name AS carrier_name,
      cq.avg_mos,
      cq.median_mos,
      cq.min_mos,
      cq.call_count,
      cq.quality_percentage,
      cq.poor_count,
      (cq.poor_count::FLOAT / cq.call_count * 100) AS poor_percentage
    FROM carrier_quality_daily cq
    JOIN carriers c ON c.id = cq.carrier_id
    WHERE cq.tenant_id = $1
      AND cq.day >= NOW() - INTERVAL '${days} days'
    GROUP BY c.name, cq.avg_mos, cq.median_mos, cq.min_mos,
             cq.call_count, cq.quality_percentage, cq.poor_count
    ORDER BY cq.avg_mos DESC
  `, [tenantId]);

  return Response.json({ carriers: report.rows });
}
```

### Agent Quality Report

```typescript
// GET /v1/analytics/agent-quality
async function getAgentQualityReport(req: Request): Promise<Response> {
  const tenantId = req.user.tenant_id;
  const days = parseInt(req.query.days || '30');

  const report = await db.query(`
    SELECT
      u.first_name || ' ' || u.last_name AS agent_name,
      AVG(cqm.mos) AS avg_mos,
      COUNT(*) AS call_count,
      COUNT(*) FILTER (WHERE cqm.mos >= 4.0) AS excellent_count,
      COUNT(*) FILTER (WHERE cqm.mos < 3.0) AS poor_count,
      (COUNT(*) FILTER (WHERE cqm.mos >= 4.0)::FLOAT / COUNT(*) * 100) AS quality_percentage
    FROM call_quality_metrics cqm
    JOIN users u ON u.id = cqm.agent_id
    WHERE cqm.tenant_id = $1
      AND cqm.time >= NOW() - INTERVAL '${days} days'
      AND cqm.agent_id IS NOT NULL
    GROUP BY u.id, agent_name
    ORDER BY avg_mos DESC
  `, [tenantId]);

  return Response.json({ agents: report.rows });
}
```

---

## Troubleshooting Dashboard

### Network Diagnostics

```typescript
// GET /v1/calls/:id/diagnostics
async function getCallDiagnostics(req: Request): Promise<Response> {
  const callId = req.params.id;
  const tenantId = req.user.tenant_id;

  // Get call details
  const call = await db.query(`
    SELECT * FROM calls WHERE id = $1 AND tenant_id = $2
  `, [callId, tenantId]);

  if (call.rows.length === 0) {
    return Response.json({ error: 'Call not found' }, { status: 404 });
  }

  // Get quality metrics timeline
  const metrics = await db.query(`
    SELECT time, mos, jitter_avg, packet_loss_avg, latency
    FROM call_quality_metrics
    WHERE call_id = $1
    ORDER BY time ASC
  `, [callId]);

  // Get quality alerts
  const alerts = await db.query(`
    SELECT * FROM call_quality_alerts
    WHERE call_id = $1
    ORDER BY created_at ASC
  `, [callId]);

  // Diagnose issues
  const diagnosis = diagnoseQualityIssues(metrics.rows);

  return Response.json({
    call: call.rows[0],
    metrics: metrics.rows,
    alerts: alerts.rows,
    diagnosis,
  });
}

function diagnoseQualityIssues(metrics: QualityMetrics[]): string[] {
  const issues: string[] = [];

  const avgMOS = metrics.reduce((sum, m) => sum + m.mos, 0) / metrics.length;
  const avgJitter = metrics.reduce((sum, m) => sum + m.jitter_avg, 0) / metrics.length;
  const avgPacketLoss = metrics.reduce((sum, m) => sum + m.packet_loss_avg, 0) / metrics.length;
  const avgLatency = metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length;

  if (avgMOS < 3.5) {
    issues.push(`Overall call quality was poor (MOS: ${avgMOS.toFixed(2)})`);
  }

  if (avgJitter > 30) {
    issues.push(`High jitter detected (${avgJitter.toFixed(1)}ms) - Network congestion or poor buffering`);
  }

  if (avgPacketLoss > 2.0) {
    issues.push(`High packet loss (${avgPacketLoss.toFixed(2)}%) - Network congestion or carrier issues`);
  }

  if (avgLatency > 150) {
    issues.push(`High latency (${avgLatency.toFixed(0)}ms) - Geographic distance or routing issues`);
  }

  // Check for degradation over time
  const firstHalf = metrics.slice(0, metrics.length / 2);
  const secondHalf = metrics.slice(metrics.length / 2);

  const mosFirstHalf = firstHalf.reduce((sum, m) => sum + m.mos, 0) / firstHalf.length;
  const mosSecondHalf = secondHalf.reduce((sum, m) => sum + m.mos, 0) / secondHalf.length;

  if (mosSecondHalf < mosFirstHalf - 0.5) {
    issues.push('Call quality degraded significantly during the call');
  }

  if (issues.length === 0) {
    issues.push('No quality issues detected - call quality was acceptable');
  }

  return issues;
}
```

---

## API Implementation

### Get Call Quality

```typescript
// GET /v1/calls/:id/quality
async function getCallQuality(req: Request): Promise<Response> {
  const callId = req.params.id;
  const tenantId = req.user.tenant_id;

  const metrics = await db.query(`
    SELECT
      AVG(mos) AS avg_mos,
      MIN(mos) AS min_mos,
      MAX(mos) AS max_mos,
      AVG(jitter_avg) AS avg_jitter,
      AVG(packet_loss_avg) AS avg_packet_loss,
      AVG(latency) AS avg_latency,
      COUNT(*) AS sample_count
    FROM call_quality_metrics
    WHERE call_id = $1 AND tenant_id = $2
  `, [callId, tenantId]);

  if (metrics.rows.length === 0) {
    return Response.json({ error: 'No quality data available' }, { status: 404 });
  }

  return Response.json({ quality: metrics.rows[0] });
}
```

---

## Cost Model

**Infrastructure:**
- TimescaleDB: Free (Neon Postgres extension)
- NATS: Free (self-hosted)
- Compute: $30/month (t3.medium for quality monitor)

**Per-Call Cost:**
- RTCP processing: ~0.001 CPU seconds
- Database storage: 1KB per metric × 12 metrics/minute × 5min avg call = 60KB/call
- TimescaleDB compression: 90% savings = 6KB/call

**Scale:**
- 1M calls/month × 6KB = 6GB storage
- Neon: Free tier (0.5GB), paid $0.10/GB = **$0.60/month**

**Total Cost: $30.60/month** for 1M calls

**Per-Call Cost: $0.0000306** (0.003¢)

---

## Summary

✅ **Real-time MOS scoring** with ITU-T E-Model
✅ **RTCP monitoring** from FreeSWITCH
✅ **TimescaleDB** for fast time-series queries
✅ **WebSocket updates** for live dashboards
✅ **Quality alerts** (MOS <3.0)
✅ **Carrier comparison** & ranking
✅ **Agent quality reports**
✅ **Diagnostic tools**
✅ **$0.003¢ per call** at scale

**Ready to monitor call quality like a pro! 📊✨**
