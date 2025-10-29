# Multi-Carrier Setup Guide - IRIS Platform
## High Availability Voice Infrastructure (Week 31)

---

## 🎯 Overview

Implement multi-carrier failover to ensure 99.99% voice uptime by routing calls across multiple SIP carriers (Twilio + Telnyx) with automatic failover and least-cost routing (LCR).

**Benefits:**
- **High Availability:** If Twilio fails, calls automatically route to Telnyx
- **Cost Optimization:** Automatically select cheapest carrier per route
- **Load Balancing:** Distribute calls across carriers
- **Redundancy:** No single point of failure

---

## 📋 Architecture

```
┌────────────────┐
│  IRIS API      │
│  (Calls API)   │
└────────┬───────┘
         │
    ┌────▼─────┐
    │FreeSWITCH│
    │  (Media) │
    └────┬─────┘
         │
    ┌────▼───────────┐
    │   Kamailio     │ ← Load Balancer
    │ (SIP Proxy)    │
    └────┬───────────┘
         │
    ┌────▼─────┬──────────┐
    │          │          │
┌───▼────┐ ┌──▼────┐ ┌──▼────┐
│ Twilio │ │Telnyx │ │Bandwidth│
│Primary │ │Backup │ │Backup2│
└────────┘ └───────┘ └───────┘
```

---

## 1️⃣ Carrier Setup

### **A. Twilio (Primary Carrier)**

#### **1. Sign Up & Get Credentials**
```bash
# Twilio Dashboard: https://console.twilio.com
# Account SID: ACxxxxxxxxxxxxxxxxxxxx
# Auth Token: xxxxxxxxxxxxxxxxxxxx
# SIP Domain: yourapp.pstn.twilio.com
```

####**2. Create SIP Trunk**
```bash
# In Twilio Console:
# 1. Go to Voice → Elastic SIP Trunking
# 2. Create new SIP Trunk: "IRIS-Production"
# 3. Configure Origination URI:
#    sip:YOUR_PUBLIC_IP:5060
# 4. Configure Termination URI:
#    yourapp.pstn.twilio.com
```

#### **3. Twilio Rate Card**
```
US Domestic: $0.0085/min
Canada: $0.0085/min
UK: $0.0240/min
```

---

### **B. Telnyx (Backup Carrier)**

#### **1. Sign Up & Get Credentials**
```bash
# Telnyx Mission Control: https://portal.telnyx.com
# API Key: KEY_xxxxxxxxxxxxxxxxxxxxxxxx
# SIP Connection ID: 1234567
# SIP Domain: sip.telnyx.com
```

#### **2. Create SIP Connection**
```bash
# In Telnyx Portal:
# 1. Go to Voice → Connections
# 2. Create new Connection: "IRIS-Production"
# 3. Add Outbound Settings:
#    - Tech Prefix: blank
#    - ANI Override: No
# 4. Add Inbound Settings:
#    - Destination: sip:YOUR_PUBLIC_IP:5060
# 5. Add IP Address to whitelist: YOUR_PUBLIC_IP
```

#### **3. Telnyx Rate Card**
```
US Domestic: $0.0040/min (cheaper than Twilio!)
Canada: $0.0065/min
UK: $0.0150/min
```

---

## 2️⃣ Database Setup

### **Migration: Add Carrier Configuration**

```sql
-- database/migrations/022_create_carriers_table.sql

CREATE TABLE IF NOT EXISTS carriers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL, -- 'twilio', 'telnyx', 'bandwidth'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'disabled', 'testing'
  priority INTEGER DEFAULT 1, -- 1 = highest priority
  weight INTEGER DEFAULT 100, -- For load balancing (0-100)

  -- SIP Configuration
  sip_domain VARCHAR(255) NOT NULL,
  sip_username VARCHAR(255),
  sip_password VARCHAR(255),
  sip_proxy VARCHAR(255),
  sip_port INTEGER DEFAULT 5060,

  -- API Configuration
  api_key TEXT,
  api_secret TEXT,
  api_endpoint VARCHAR(255),

  -- Health Monitoring
  health_score INTEGER DEFAULT 100, -- 0-100
  last_health_check TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,

  -- Rate Card
  default_rate_per_minute DECIMAL(10, 6) DEFAULT 0.01,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carrier rate tables
CREATE TABLE IF NOT EXISTS carrier_rates (
  id BIGSERIAL PRIMARY KEY,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE CASCADE,
  destination_prefix VARCHAR(20) NOT NULL, -- E.164 prefix (e.g., '+1', '+44')
  destination_name VARCHAR(100), -- 'United States', 'United Kingdom'
  rate_per_minute DECIMAL(10, 6) NOT NULL,
  effective_date DATE DEFAULT CURRENT_DATE,
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carrier_rates_prefix ON carrier_rates(carrier_id, destination_prefix);
CREATE INDEX idx_carrier_rates_effective ON carrier_rates(carrier_id, effective_date, expires_at);

-- Carrier health metrics
CREATE TABLE IF NOT EXISTS carrier_health_logs (
  id BIGSERIAL PRIMARY KEY,
  carrier_id BIGINT REFERENCES carriers(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'sip_options', 'test_call', 'api_health'
  status VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'failed'
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call routing decisions (for debugging)
CREATE TABLE IF NOT EXISTS call_routing_logs (
  id BIGSERIAL PRIMARY KEY,
  call_id BIGINT REFERENCES calls(id),
  destination_number VARCHAR(50),
  selected_carrier_id BIGINT REFERENCES carriers(id),
  carrier_selection_reason VARCHAR(255), -- 'lcr', 'failover', 'priority'
  alternate_carriers JSONB, -- Array of other carriers considered
  routing_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default carriers
INSERT INTO carriers (name, type, sip_domain, priority, weight, default_rate_per_minute, status)
VALUES
  ('Twilio', 'twilio', 'yourapp.pstn.twilio.com', 1, 60, 0.0085, 'active'),
  ('Telnyx', 'telnyx', 'sip.telnyx.com', 2, 40, 0.0040, 'active');

-- Insert sample rates (Twilio)
INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, rate_per_minute)
VALUES
  (1, '+1', 'United States', 0.0085),
  (1, '+44', 'United Kingdom', 0.0240),
  (1, '+61', 'Australia', 0.0360);

-- Insert sample rates (Telnyx - cheaper)
INSERT INTO carrier_rates (carrier_id, destination_prefix, destination_name, rate_per_minute)
VALUES
  (2, '+1', 'United States', 0.0040),
  (2, '+44', 'United Kingdom', 0.0150),
  (2, '+61', 'Australia', 0.0290);
```

---

## 3️⃣ FreeSWITCH Configuration

### **A. Configure Multiple Gateways**

Edit `/usr/local/freeswitch/conf/sip_profiles/external/twilio.xml`:
```xml
<gateway name="twilio">
  <param name="proxy" value="yourapp.pstn.twilio.com"/>
  <param name="register" value="false"/>
  <param name="caller-id-in-from" value="true"/>
  <param name="extension-in-contact" value="true"/>
</gateway>
```

Edit `/usr/local/freeswitch/conf/sip_profiles/external/telnyx.xml`:
```xml
<gateway name="telnyx">
  <param name="username" value="YOUR_TELNYX_CONNECTION_ID"/>
  <param name="password" value="YOUR_TELNYX_PASSWORD"/>
  <param name="proxy" value="sip.telnyx.com"/>
  <param name="register" value="true"/>
  <param name="caller-id-in-from" value="true"/>
</gateway>
```

### **B. Configure Dialplan with Failover**

Edit `/usr/local/freeswitch/conf/dialplan/default/01_outbound.xml`:
```xml
<extension name="outbound_with_failover">
  <condition field="destination_number" expression="^(\+?1[2-9]\d{9})$">
    <!-- Try Telnyx first (cheaper for US) -->
    <action application="set" data="hangup_after_bridge=true"/>
    <action application="set" data="continue_on_fail=true"/>
    <action application="set" data="failover_to_twilio=true"/>

    <!-- Primary: Telnyx -->
    <action application="bridge" data="sofia/gateway/telnyx/$1"/>

    <!-- If Telnyx fails, failover to Twilio -->
    <action application="bridge" data="sofia/gateway/twilio/$1"/>

    <!-- If both fail, log error -->
    <action application="log" data="ERR Both carriers failed for call to $1"/>
    <action application="hangup" data="NETWORK_OUT_OF_ORDER"/>
  </condition>
</extension>
```

---

## 4️⃣ LCR (Least Cost Routing) Service

### **Create Service: `src/services/carrierRouting.js`**

```javascript
import { query } from '../db/connection.js';

class CarrierRoutingService {
  /**
   * Select best carrier for a destination using LCR
   */
  async selectCarrier(destinationNumber, options = {}) {
    const {
      preferCost = true, // If true, prefer cheapest; if false, prefer reliability
      excludeCarriers = [], // Array of carrier IDs to exclude
    } = options;

    // Extract country prefix from destination
    const prefix = this.extractPrefix(destinationNumber);

    // Get all active carriers with rates for this prefix
    const sql = `
      SELECT
        c.id,
        c.name,
        c.type,
        c.sip_domain,
        c.priority,
        c.weight,
        c.health_score,
        cr.rate_per_minute,
        c.consecutive_failures,
        CASE
          WHEN c.consecutive_failures >= 5 THEN 0
          WHEN c.health_score < 50 THEN c.health_score * 0.5
          ELSE c.health_score
        END as effective_health
      FROM carriers c
      LEFT JOIN carrier_rates cr ON cr.carrier_id = c.id
        AND cr.destination_prefix = $1
        AND (cr.expires_at IS NULL OR cr.expires_at > CURRENT_DATE)
      WHERE c.status = 'active'
        AND c.id NOT IN (${excludeCarriers.join(',') || 'NULL'})
      ORDER BY
        effective_health DESC,
        ${preferCost ? 'cr.rate_per_minute ASC' : 'c.priority ASC'}
      LIMIT 3
    `;

    const result = await query(sql, [prefix]);

    if (result.rows.length === 0) {
      throw new Error(`No carrier available for destination ${destinationNumber}`);
    }

    const primary = result.rows[0];
    const alternates = result.rows.slice(1);

    return {
      primary,
      alternates,
      selection_reason: preferCost ? 'lcr' : 'priority',
    };
  }

  /**
   * Extract country prefix from phone number
   */
  extractPrefix(number) {
    // Remove leading + if present
    const cleaned = number.replace(/^\+/, '');

    // Common prefixes
    const prefixes = {
      '1': '+1',     // US/Canada
      '44': '+44',   // UK
      '61': '+61',   // Australia
      '7': '+7',     // Russia
      '86': '+86',   // China
      '33': '+33',   // France
      '49': '+49',   // Germany
    };

    // Check 1-3 digit prefixes
    for (let i = 3; i >= 1; i--) {
      const prefix = cleaned.substring(0, i);
      if (prefixes[prefix]) {
        return prefixes[prefix];
      }
    }

    // Default to +1 (US/Canada)
    return '+1';
  }

  /**
   * Update carrier health after call attempt
   */
  async updateCarrierHealth(carrierId, callSuccess) {
    if (callSuccess) {
      // Successful call - improve health
      await query(`
        UPDATE carriers
        SET
          health_score = LEAST(100, health_score + 5),
          consecutive_failures = 0,
          total_calls = total_calls + 1,
          last_health_check = NOW()
        WHERE id = $1
      `, [carrierId]);
    } else {
      // Failed call - degrade health
      await query(`
        UPDATE carriers
        SET
          health_score = GREATEST(0, health_score - 10),
          consecutive_failures = consecutive_failures + 1,
          total_calls = total_calls + 1,
          failed_calls = failed_calls + 1,
          last_health_check = NOW()
        WHERE id = $1
      `, [carrierId]);

      // Auto-disable carrier after 10 consecutive failures
      await query(`
        UPDATE carriers
        SET status = 'disabled'
        WHERE id = $1 AND consecutive_failures >= 10
      `, [carrierId]);
    }

    // Log health check
    await query(`
      INSERT INTO carrier_health_logs (carrier_id, check_type, status)
      VALUES ($1, 'call_result', $2)
    `, [carrierId, callSuccess ? 'healthy' : 'failed']);
  }

  /**
   * Log routing decision for debugging
   */
  async logRoutingDecision(callId, destinationNumber, routing) {
    await query(`
      INSERT INTO call_routing_logs
        (call_id, destination_number, selected_carrier_id, carrier_selection_reason, alternate_carriers)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      callId,
      destinationNumber,
      routing.primary.id,
      routing.selection_reason,
      JSON.stringify(routing.alternates.map(c => ({ id: c.id, name: c.name, rate: c.rate_per_minute }))),
    ]);
  }
}

export default new CarrierRoutingService();
```

---

## 5️⃣ Integration with Calls API

### **Update `src/routes/calls.js`**

```javascript
import carrierRouting from '../services/carrierRouting.js';

app.post('/', async (c) => {
  const { to, from, tenant_id } = await c.req.json();

  // Select best carrier
  const routing = await carrierRouting.selectCarrier(to, {
    preferCost: true, // Use LCR
  });

  console.log(`Selected carrier: ${routing.primary.name} ($${routing.primary.rate_per_minute}/min)`);

  // Create call with carrier info
  const call = await query(`
    INSERT INTO calls (tenant_id, from_number, to_number, carrier_id, status)
    VALUES ($1, $2, $3, $4, 'queued')
    RETURNING *
  `, [tenant_id, from, to, routing.primary.id]);

  // Log routing decision
  await carrierRouting.logRoutingDecision(call.rows[0].id, to, routing);

  // Originate call via FreeSWITCH with selected carrier
  const gateway = routing.primary.type; // 'twilio' or 'telnyx'
  await freeswitch.api(`originate {origination_caller_id_number=${from}}sofia/gateway/${gateway}/${to} &park`);

  return c.json({ success: true, data: call.rows[0], carrier: routing.primary.name });
});
```

---

## 6️⃣ Kamailio Load Balancer (Optional)

### **A. Install Kamailio**

```bash
# Launch new t3.small EC2 instance
# SSH into Kamailio server
sudo apt-get update
sudo apt-get install -y kamailio kamailio-postgres-modules

# Edit /etc/kamailio/kamailio.cfg
```

### **B. Configure Dispatcher**

```
#!define CARRIER1 "sip:yourapp.pstn.twilio.com:5060"
#!define CARRIER2 "sip:sip.telnyx.com:5060"

loadmodule "dispatcher.so"

modparam("dispatcher", "list_file", "/etc/kamailio/dispatcher.list")
modparam("dispatcher", "flags", 2)
modparam("dispatcher", "ds_ping_interval", 30)
modparam("dispatcher", "ds_probing_mode", 1)

route[DISPATCH] {
  if (!ds_select_dst("1", "4")) {
    send_reply("503", "Service Unavailable");
    exit;
  }
  t_on_failure("RTF_DISPATCH");
  route(RELAY);
}

failure_route[RTF_DISPATCH] {
  if (t_is_canceled()) {
    exit;
  }
  if (ds_next_dst()) {
    t_relay();
    exit;
  }
}
```

Create `/etc/kamailio/dispatcher.list`:
```
# Carrier Group 1
1 sip:yourapp.pstn.twilio.com:5060 0 10
1 sip:sip.telnyx.com:5060 0 10
```

---

## 7️⃣ Monitoring & Alerts

### **A. Carrier Health Dashboard**

```sql
-- Get carrier health summary
SELECT
  c.name,
  c.status,
  c.health_score,
  c.consecutive_failures,
  c.total_calls,
  c.failed_calls,
  ROUND(100.0 * c.failed_calls / NULLIF(c.total_calls, 0), 2) as failure_rate_percent,
  c.last_health_check
FROM carriers c
ORDER BY c.priority;
```

### **B. Alert Rules**

1. **Carrier Down:** Health score < 50 for 5+ minutes
2. **High Failure Rate:** >10% failure rate in last hour
3. **No Healthy Carriers:** All carriers disabled/degraded

---

## 8️⃣ Testing

### **Test Failover**

```bash
# 1. Make call via API
curl -X POST http://localhost:3000/v1/calls \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"to": "+12125551234", "from": "+19175551234", "tenant_id": 1}'

# 2. Disable primary carrier (Twilio) in database
psql -d irisx_prod -c "UPDATE carriers SET status = 'disabled' WHERE name = 'Twilio';"

# 3. Make another call - should auto-route to Telnyx
curl -X POST http://localhost:3000/v1/calls \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"to": "+12125551234", "from": "+19175551234", "tenant_id": 1}'

# 4. Check routing logs
psql -d irisx_prod -c "SELECT * FROM call_routing_logs ORDER BY created_at DESC LIMIT 5;"
```

---

## ✅ Success Criteria

- [ ] Both carriers configured and tested
- [ ] LCR working (selects cheapest carrier)
- [ ] Automatic failover within 5 seconds
- [ ] Health monitoring updates carrier scores
- [ ] Routing logs captured for all calls
- [ ] No single point of failure
- [ ] Cost reduced by 20%+ via LCR

---

**Estimated Time:** 2-3 days
**Priority:** High (Week 31 milestone)
**Dependencies:** FreeSWITCH, PostgreSQL
