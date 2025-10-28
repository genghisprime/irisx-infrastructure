# IRIS Provider Flexibility - No Vendor Lock-In

**Question:** Are all systems with multiple providers flexible? Can we change/add/remove providers easily?

**Answer:** ✅ YES - 100% FLEXIBLE. Zero vendor lock-in.

---

## Architecture: Provider Abstraction Layer (PAL)

### How It Works:

```
Your API Call
    ↓
Channel Router (decides voice/sms/email)
    ↓
Provider Selector (picks cheapest/fastest/healthiest)
    ↓
Provider Abstraction Layer (IProvider interface)
    ↓
Actual Provider (Twilio, Telnyx, AWS SES, etc.)
```

**Key Point:** All providers implement the same `IProvider` interface. You can:
- ✅ Add new providers in minutes
- ✅ Remove providers instantly
- ✅ Switch between providers dynamically
- ✅ Use multiple providers simultaneously
- ✅ Test new providers in parallel (A/B testing)

---

## Multi-Provider Channels

### 1. Voice (Phone Calls)

**Currently Planned:**
- Twilio (primary)
- Telnyx (backup)
- Bandwidth (optional)

**Can Add:**
- Vonage
- Plivo
- SignalWire
- Any SIP trunk provider
- Your own SIP infrastructure

**Flexibility:**
```typescript
// Add new voice provider
registry.register('voice', 'signalwire', new SignalWireProvider());

// Enable/disable via admin panel
PUT /admin/providers/voice/twilio
{ "enabled": false } // Instantly disabled

// Route calls via different provider
POST /v1/calls
{ "provider": "telnyx" } // Override default
```

**How Easy to Switch:**
- ⏱️ **Add new provider:** 30 minutes (create class, test)
- ⏱️ **Switch primary provider:** 2 seconds (admin toggle)
- ⏱️ **Remove provider:** Instant (disable in admin)

---

### 2. SMS/MMS

**Currently Planned:**
- Telnyx (primary - cheapest)
- Twilio (backup)
- Plivo (backup)
- Vonage (optional)

**Can Add:**
- Bandwidth
- SignalWire
- MessageBird
- Sinch
- Any SMS API provider

**Flexibility:**
```typescript
// SMS Provider Registry
registry.register('sms', 'telnyx', new TelnyxSMSProvider());
registry.register('sms', 'twilio', new TwilioSMSProvider());
registry.register('sms', 'plivo', new PlivoSMSProvider());
registry.register('sms', 'bandwidth', new BandwidthSMSProvider());

// Least-cost routing automatically picks cheapest
// Failover automatically tries next if one fails
// Health scoring disables bad providers automatically
```

**Provider Interface (All SMS providers implement this):**
```typescript
interface IProvider {
  name: string;
  channel: 'sms';

  send(message: Message): Promise<DeliveryResult>;
  getHealthScore(): Promise<number>; // 0-1 score
  getCost(destination: string): Promise<number>; // Per-message cost
}
```

**How Easy to Switch:**
- ⏱️ **Add new provider:** 1 hour (implement interface, add pricing)
- ⏱️ **Switch primary provider:** 2 seconds (admin toggle)
- ⏱️ **Test new provider:** Minutes (send test messages)

---

### 3. Email

**Currently Planned:**
- AWS SES (primary - bulk email, cheapest)
- Postmark (transactional - high deliverability)
- SendGrid (backup)
- Self-hosted SMTP (optional)

**Can Add:**
- Mailgun
- SparkPost
- Elastic Email
- Mailjet
- Any SMTP server
- Custom email infrastructure

**Flexibility:**
```typescript
// Email Provider Registry
registry.register('email', 'aws_ses', new AWSSESProvider());
registry.register('email', 'postmark', new PostmarkProvider());
registry.register('email', 'sendgrid', new SendGridProvider());
registry.register('email', 'mailgun', new MailgunProvider());
registry.register('email', 'smtp', new SMTPProvider({
  host: 'smtp.yourcompany.com',
  port: 587
}));

// Different providers for different use cases
if (email.type === 'transactional') {
  provider = registry.getProvider('email', 'postmark');
} else if (email.type === 'marketing') {
  provider = registry.getProvider('email', 'aws_ses');
}
```

**How Easy to Switch:**
- ⏱️ **Add new provider:** 1-2 hours (implement interface, test)
- ⏱️ **Switch providers:** Instant (config change)
- ⏱️ **Use own SMTP:** Minutes (just add credentials)

---

### 4. Social Media

**Currently Planned:**
- Facebook Messenger (Graph API)
- Twitter DM (API v2)
- Discord (Webhooks)
- Telegram (Bot API)
- WhatsApp Business (Cloud API)

**Can Add:**
- Instagram DM
- LinkedIn messaging
- Slack
- Microsoft Teams
- Any platform with an API

**Flexibility:**
```typescript
// Social Provider Registry
registry.register('social', 'facebook', new FacebookProvider());
registry.register('social', 'twitter', new TwitterProvider());
registry.register('social', 'discord', new DiscordProvider());
registry.register('social', 'telegram', new TelegramProvider());
registry.register('social', 'whatsapp', new WhatsAppProvider());

// Add new platform
registry.register('social', 'slack', new SlackProvider());
```

**How Easy to Switch:**
- ⏱️ **Add new platform:** 2-4 hours (API integration)
- ⏱️ **Disable platform:** Instant
- ⏱️ **Test new platform:** Minutes

---

## Dynamic Provider Selection

### Least-Cost Routing (Automatic)

```typescript
// You don't pick provider, IRIS does
POST /v1/sms
{
  "to": "+15555551234",
  "message": "Hello"
}

// Behind the scenes:
// 1. Check destination (+1 = USA)
// 2. Query all SMS providers for USA rates:
//    - Telnyx: $0.0079
//    - Twilio: $0.0120
//    - Plivo: $0.0095
// 3. Pick cheapest (Telnyx)
// 4. Send via Telnyx
// 5. If Telnyx fails, try Twilio (next cheapest)
```

### Health-Based Routing (Automatic)

```typescript
// Provider health tracked in real-time
{
  "telnyx": {
    "health_score": 0.98,  // 98% success rate
    "avg_latency": 450ms,
    "last_failure": null
  },
  "twilio": {
    "health_score": 0.85,  // 85% success rate (degraded)
    "avg_latency": 800ms,
    "last_failure": "2025-01-15 14:23:00"
  }
}

// IRIS automatically routes around unhealthy providers
// If health_score < 0.80, provider is temporarily disabled
// Retries every 5 minutes to check if recovered
```

### Manual Provider Override (When Needed)

```typescript
// Force specific provider (testing, troubleshooting)
POST /v1/sms
{
  "to": "+15555551234",
  "message": "Test message",
  "provider": "twilio"  // Override automatic selection
}

// Or set provider preference per tenant
PUT /v1/tenants/:id/settings
{
  "preferred_sms_provider": "telnyx",
  "fallback_sms_providers": ["twilio", "plivo"]
}
```

---

## Adding New Providers (Step-by-Step)

### Example: Adding MessageBird (SMS)

**Step 1: Create Provider Class (30 minutes)**

```typescript
// providers/messagebird-sms.ts
import MessageBird from 'messagebird';

export class MessageBirdSMSProvider implements IProvider {
  name = 'messagebird';
  channel = 'sms' as const;
  client: MessageBird;

  constructor() {
    this.client = new MessageBird(process.env.MESSAGEBIRD_API_KEY);
  }

  async send(message: Message): Promise<DeliveryResult> {
    try {
      const result = await this.client.messages.create({
        originator: message.from,
        recipients: [message.to],
        body: message.body
      });

      return {
        provider: 'messagebird',
        provider_message_id: result.id,
        status: 'sent',
        cost: 0.0085, // MessageBird rate
        timestamp: new Date()
      };
    } catch (error) {
      return {
        provider: 'messagebird',
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async getHealthScore(): Promise<number> {
    // Query last 100 messages sent via MessageBird
    const recent = await db.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered
      FROM deliveries
      WHERE provider = 'messagebird'
      AND created_at > NOW() - INTERVAL '1 hour'
    `);

    return recent.delivered / recent.total;
  }

  async getCost(destination: string): Promise<number> {
    // MessageBird pricing by country
    const country = destination.substring(0, 2);
    const pricing = {
      '+1': 0.0085,  // USA/Canada
      '+44': 0.0095, // UK
      '+49': 0.0105  // Germany
    };
    return pricing[country] || 0.01; // Default
  }
}
```

**Step 2: Register Provider (2 minutes)**

```typescript
// providers/registry.ts
import { MessageBirdSMSProvider } from './messagebird-sms';

registry.register('sms', 'messagebird', new MessageBirdSMSProvider());
```

**Step 3: Add to Admin Panel (10 minutes)**

```vue
<!-- Admin UI -->
<template>
  <div>
    <h3>SMS Providers</h3>
    <div v-for="provider in smsProviders">
      <label>
        <input type="checkbox" v-model="provider.enabled" />
        {{ provider.name }}
        (Health: {{ provider.health_score }})
      </label>
    </div>

    <!-- Add new provider form -->
    <button @click="addProvider('messagebird')">
      Add MessageBird
    </button>
  </div>
</template>
```

**Step 4: Test (5 minutes)**

```bash
# Send test SMS via MessageBird
curl -X POST https://api.iris.com/v1/sms \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "to": "+15555551234",
    "message": "Test via MessageBird",
    "provider": "messagebird"
  }'
```

**Total Time: ~1 hour**

---

## Switching Providers (Examples)

### Scenario 1: Twilio Gets Expensive

**Problem:** Twilio raises SMS prices by 20%

**Solution (takes 2 seconds):**
```typescript
// Admin panel: Disable Twilio for SMS
PUT /admin/providers/sms/twilio
{ "enabled": false }

// IRIS automatically routes to next cheapest (Telnyx)
// Zero downtime, zero code changes
```

### Scenario 2: AWS SES Account Suspended

**Problem:** AWS SES temporarily suspended (compliance issue)

**Solution (takes 5 seconds):**
```typescript
// Admin panel: Switch email to Postmark
PUT /admin/providers/email/aws_ses
{ "enabled": false }

PUT /tenants/all/settings
{ "primary_email_provider": "postmark" }

// All email immediately routes via Postmark
// Fix AWS issue later, re-enable when ready
```

### Scenario 3: Test New Provider (No Risk)

**Problem:** Want to try SignalWire for voice, but don't want to risk production

**Solution:**
```typescript
// Add SignalWire as provider
registry.register('voice', 'signalwire', new SignalWireProvider());

// Send 1% of traffic to SignalWire (A/B test)
PUT /admin/providers/voice/signalwire
{
  "enabled": true,
  "traffic_percentage": 1  // 1% of calls
}

// Monitor for 1 week
// If good: increase to 10%, then 50%, then 100%
// If bad: disable instantly, zero impact
```

---

## Provider Management UI (Admin Panel)

### Dashboard View:

```
┌─────────────────────────────────────────────────────┐
│ SMS Providers                                       │
├─────────────────────────────────────────────────────┤
│ ✅ Telnyx        Health: 98%   Cost: $0.0079   70%  │
│ ✅ Twilio        Health: 95%   Cost: $0.0120   20%  │
│ ✅ Plivo         Health: 92%   Cost: $0.0095   10%  │
│ ❌ MessageBird   Health: --    Cost: $0.0085    0%  │
│                                                     │
│ [+ Add Provider]  [Test Provider]  [View Stats]    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Email Providers                                     │
├─────────────────────────────────────────────────────┤
│ ✅ AWS SES       Health: 99%   Cost: $0.0001   80%  │
│ ✅ Postmark      Health: 99%   Cost: $0.0100   20%  │
│ ❌ SendGrid      Health: --    Cost: $0.0015    0%  │
│                                                     │
│ [+ Add Provider]  [Test Provider]  [View Stats]    │
└─────────────────────────────────────────────────────┘
```

### Per-Provider Actions:

- ✅ Enable/Disable (instant)
- 🔧 Configure credentials
- 📊 View health metrics
- 💰 Update pricing
- 🧪 Send test message
- 📈 View usage stats
- ⚙️ Set traffic percentage (A/B testing)

---

## Database Schema (Provider Flexibility)

```sql
-- Provider configuration (flexible)
CREATE TABLE providers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,              -- 'twilio', 'telnyx', etc.
  channel TEXT NOT NULL,            -- 'voice', 'sms', 'email'
  enabled BOOLEAN DEFAULT true,
  credentials JSONB,                -- Encrypted API keys
  pricing JSONB,                    -- Rate table by destination
  health_score DECIMAL(3,2),        -- 0.00 - 1.00
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery tracking (provider-agnostic)
CREATE TABLE deliveries (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id),
  provider TEXT NOT NULL,           -- Which provider was used
  provider_message_id TEXT,         -- Provider's tracking ID
  status TEXT,                      -- sent, delivered, failed
  cost DECIMAL(10,6),              -- Actual cost from provider
  latency_ms INT,                  -- How fast was delivery
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider health tracking
CREATE TABLE provider_health_log (
  id UUID PRIMARY KEY,
  provider TEXT,
  channel TEXT,
  success_rate DECIMAL(5,2),       -- e.g., 98.50
  avg_latency_ms INT,
  total_messages INT,
  failed_messages INT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Point:** No provider-specific columns. All providers tracked generically.

---

## Summary: Zero Vendor Lock-In

### ✅ What You CAN Do:

1. **Add providers** - 1 hour per provider
2. **Remove providers** - Instant (disable)
3. **Switch providers** - 2 seconds (admin toggle)
4. **Use multiple providers** - Default behavior
5. **Test new providers** - A/B testing built-in
6. **Set provider preferences** - Per tenant, per channel
7. **Override provider** - Per API call if needed
8. **Automatic failover** - Built-in
9. **Automatic least-cost routing** - Built-in
10. **Health-based routing** - Built-in

### ❌ What You CANNOT Do:

1. **Get locked into one provider** - Architecture prevents this
2. **Lose data if provider changes** - All stored provider-agnostic
3. **Have downtime when switching** - Hot-swap supported

---

## Real-World Example: Complete Flexibility

**Day 1: Launch with Twilio only**
```typescript
registry.register('sms', 'twilio', new TwilioSMSProvider());
// 100% traffic → Twilio
```

**Week 2: Add Telnyx (cheaper)**
```typescript
registry.register('sms', 'telnyx', new TelnyxSMSProvider());
// 50% → Telnyx, 50% → Twilio (A/B test)
```

**Week 3: Telnyx performing well**
```typescript
// 90% → Telnyx (cheaper), 10% → Twilio (backup)
```

**Week 4: Add Plivo (another backup)**
```typescript
registry.register('sms', 'plivo', new PlivoSMSProvider());
// 90% → Telnyx, 5% → Twilio, 5% → Plivo
```

**Month 2: Twilio raises prices**
```typescript
// Disable Twilio, shift traffic
// 95% → Telnyx, 5% → Plivo
// Zero downtime, zero code changes
```

**Month 6: Build own SMS infrastructure**
```typescript
registry.register('sms', 'internal', new InternalSMSProvider());
// 100% → Your own infrastructure
// But keep Telnyx as backup (0% traffic, hot standby)
```

---

## Conclusion

### ✅ YES - 100% FLEXIBLE

**Every multi-provider system in IRIS is designed for:**
- Zero vendor lock-in
- Easy provider changes
- Hot-swapping providers
- A/B testing new providers
- Automatic failover
- Cost optimization

**You control:**
- Which providers to use
- When to switch
- How to route traffic
- Provider preferences

**You never worry about:**
- Being stuck with expensive provider
- Provider outages (automatic failover)
- Testing new providers (A/B testing built-in)
- Data migration (all stored generically)

**Change your mind anytime. Switch providers in seconds. Zero lock-in. 🔓**
