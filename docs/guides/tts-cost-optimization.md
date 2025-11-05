# TTS Cost Optimization Guide

## How to Save 99% on Text-to-Speech Costs

IRISX/Tazzi implements an intelligent TTS caching system that can dramatically reduce your costs when sending voice messages. This guide explains how to maximize your savings.

---

## Understanding TTS Caching

### How It Works

When you send a voice message, IRISX generates speech using AI providers like OpenAI TTS. **The smart part:** If you send the same message to multiple people, IRISX reuses the audio file instead of generating it again.

**Cache Key Formula:**
```
SHA256(message_text + voice + provider) = cache_key
```

If these three factors are identical, you get a cache hit (no cost).

---

## Cost Comparison Examples

### Example 1: Emergency Alert (Static Message)

**Scenario:** Send "Building evacuation required. Please exit immediately." to 10,000 residents.

| Approach | TTS Calls | Cost |
|----------|-----------|------|
| **With Caching** ✅ | 1 | $0.015 |
| **Without Caching** | 10,000 | $150.00 |
| **Savings** | 99.9% | **$149.985** |

### Example 2: Personalized Appointment Reminder

**Scenario:** Send "Hi {name}, your appointment with Dr. {doctor} is at {time}" to 1,000 patients.

| Approach | TTS Calls | Cost |
|----------|-----------|------|
| **Fully Personalized** ⚠️ | 1,000 | $15.00 |
| **Hybrid (see below)** ✅ | 101 | $1.52 |
| **Savings** | 89.9% | **$13.48** |

---

## 5 Best Practices for Maximum Savings

### 1. Use Static Messages Whenever Possible

**Best For:**
- Emergency alerts
- System announcements
- Event notifications
- Weather updates
- Service outages
- Holiday greetings

**Example:**
```javascript
// ✅ EXCELLENT - Will be cached
{
  "text": "Your building has a scheduled fire drill at 2 PM today.",
  "recipients": 5000
}
// Cost: $0.015 (1 TTS call)
```

```javascript
// ❌ EXPENSIVE - No caching possible
{
  "text": "Hi {name}, your building has a scheduled fire drill at 2 PM today.",
  "recipients": 5000
}
// Cost: $75.00 (5,000 unique TTS calls)
```

**Savings:** $74.985 (99.98%)

---

### 2. Batch Personalization Intelligently

Instead of creating unique messages for every recipient, group by common attributes.

**Example: Appointment Reminders**

❌ **BAD:** Fully personalized
```
"Hi Sarah, your appointment with Dr. Smith is tomorrow at 10:30 AM"
"Hi John, your appointment with Dr. Jones is tomorrow at 10:30 AM"
"Hi Emily, your appointment with Dr. Smith is tomorrow at 2:00 PM"
```
- 3 unique messages = 3 TTS calls = $0.045

✅ **GOOD:** Group by appointment time
```
"Your appointment is tomorrow at 10:30 AM" (Sarah + John + 98 others)
"Your appointment is tomorrow at 2:00 PM" (Emily + 99 others)
```
- 2 unique messages = 2 TTS calls = $0.030
- **Savings:** 33%

✅ **BETTER:** Single static message
```
"You have an appointment tomorrow. Check your email for details."
```
- 1 unique message = 1 TTS call = $0.015
- **Savings:** 66%

---

### 3. Split Static Intro + Personalized Details

For situations where personalization is required, split the message into two calls:

**Example: Payment Reminder**

**Call 1 (Static):** "This is a payment reminder from ABC Company."
- 1,000 recipients = 1 TTS call = $0.015

**Call 2 (Personalized):** "Your balance is {amount}. Due date: {date}."
- 1,000 unique amounts = 1,000 TTS calls = $15.00

**Total Cost:** $15.015

**Compare to fully personalized:**
"This is a payment reminder from ABC Company. Your balance is {amount}. Due date: {date}."
- 1,000 recipients = 1,000 TTS calls = $15.00

**Savings:** Minimal, but intro is reusable for future campaigns.

---

### 4. Leverage Template Reuse

Reduce unique message variations by standardizing content.

**Example: Order Status**

❌ **EXPENSIVE:**
```
"Your order #12345 is out for delivery and will arrive between 2:00 PM and 4:00 PM"
"Your order #12346 is out for delivery and will arrive between 2:15 PM and 4:15 PM"
"Your order #12347 is out for delivery and will arrive between 2:30 PM and 4:30 PM"
```
- 3 unique messages = 3 TTS calls

✅ **CHEAPER:**
```
"Your order is out for delivery and will arrive this afternoon"
"Your order is out for delivery and will arrive this afternoon"
"Your order is out for delivery and will arrive this afternoon"
```
- 1 unique message = 1 TTS call = **66% savings**

**Strategy:** Round times to common windows (morning/afternoon/evening) instead of specific times.

---

### 5. Maintain Voice Consistency

Changing the voice or provider creates a new cache entry, even for the same text.

**Example:**

```javascript
// Call 1
{
  "text": "Welcome to our service",
  "voice": "alloy",
  "provider": "openai"
}
// Cache key: a3f8bc9d7e2f1a4b... → TTS call required

// Call 2 (different voice)
{
  "text": "Welcome to our service",
  "voice": "nova",
  "provider": "openai"
}
// Cache key: 7d2c1b9e4f8a3c6d... → NEW TTS call required
```

**Best Practice:** Pick one voice per campaign and stick with it.

---

## Real-World ROI Examples

### Scenario 1: Property Management Company

**Use Case:** Daily maintenance announcements

- Message: "Pool maintenance scheduled for today. Pool will be closed from 10 AM to 2 PM."
- Frequency: 100 units, 3 times per week
- Annual volume: 100 units × 156 announcements = 15,600 calls

| Approach | Annual TTS Calls | Annual Cost |
|----------|------------------|-------------|
| **With Caching** ✅ | 156 | $2.34 |
| **Without Caching** | 15,600 | $234.00 |
| **Annual Savings** | | **$231.66** |

---

### Scenario 2: Medical Practice

**Use Case:** Appointment reminders

- Message: "Appointment reminder: You have an appointment tomorrow."
- Frequency: 50 patients/day, 250 business days
- Annual volume: 12,500 calls

| Approach | Annual TTS Calls | Annual Cost |
|----------|------------------|-------------|
| **With Caching** ✅ | 1 | $0.015 |
| **Without Caching** | 12,500 | $187.50 |
| **Annual Savings** | | **$187.485** |

---

### Scenario 3: School District

**Use Case:** Weather closures, event reminders, emergency alerts

- Average messages: 10 unique announcements per year
- Recipients: 5,000 parents/staff
- Annual volume: 50,000 calls

| Approach | Annual TTS Calls | Annual Cost |
|----------|------------------|-------------|
| **With Caching** ✅ | 10 | $0.15 |
| **Without Caching** | 50,000 | $750.00 |
| **Annual Savings** | | **$749.85** |

---

## Cost Calculator

Use this formula to estimate your savings:

```
Static Message Savings:
  Cost without caching = (recipients × messages × $0.015)
  Cost with caching = (unique_messages × $0.015)
  Savings = Cost without caching - Cost with caching

Personalized Message Cost:
  Cost = (unique_variations × $0.015)
```

**Example:**
- 10,000 recipients
- 5 different announcements per month
- 12 months

Without caching:
```
10,000 × 5 × 12 × $0.015 = $9,000/year
```

With caching:
```
5 × 12 × $0.015 = $0.90/year
```

**Annual Savings: $8,999.10 (99.99%)**

---

## Technical Details

### Cache Storage

- **Location:** `/tmp/tts-cache/` on server
- **Retention:** 30 days from last use
- **Renewal:** Frequently used messages stay cached indefinitely
- **Cleanup:** Automatic, daily at 3:00 AM

### Cache Key Example

```
Input:
  Text: "Emergency alert: Building evacuation required"
  Voice: "alloy"
  Provider: "openai"

Cache Key Generation:
  Data = "Emergency alert: Building evacuation required|alloy|openai"
  SHA256 Hash = "7a3d8f9e2b1c4a5e6d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9"

Cache Files:
  /tmp/tts-cache/7a3d8f9e2b1c4a5e6d7f8a9b0c1d2e3f.json (metadata)
  /tmp/tts-cache/7a3d8f9e2b1c4a5e6d7f8a9b0c1d2e3f.mp3 (audio)
```

### Provider Pricing

| Provider | Cost per 1,000 chars | Speed | Quality |
|----------|---------------------|-------|---------|
| **OpenAI TTS** (default) | $0.015 | Fast | Excellent |
| **ElevenLabs** | $0.30 | Medium | Premium |
| **AWS Polly** | $0.004 | Fast | Good |

---

## API Usage

### Enable Caching (Default)

```javascript
POST /v1/tts/generate
{
  "text": "Your message here",
  "voice": "alloy",
  "provider": "openai",
  "cache": true  // Default, can be omitted
}
```

### Disable Caching (Time-Sensitive Data)

```javascript
POST /v1/tts/generate
{
  "text": "Current temperature is 72 degrees at 3:45 PM",
  "cache": false  // Don't cache time-sensitive data
}
```

---

## Frequently Asked Questions

### Q: How long are messages cached?

**A:** 30 days from last use. Frequently used messages stay cached indefinitely through automatic renewal.

---

### Q: Does changing the voice invalidate the cache?

**A:** Yes. The cache key includes voice ID, so "alloy" and "nova" create separate cache entries even for identical text.

---

### Q: Can I manually clear the cache?

**A:** Yes, contact support to manually clear cache entries if needed (rare).

---

### Q: What happens if I change one word in a message?

**A:** It creates a new cache entry. "Your order is ready" and "Your order is complete" are two separate cache entries.

---

### Q: Is there a limit to cache size?

**A:** No hard limit, but old files (30+ days) are automatically cleaned up. Average cache size: 50KB per unique message.

---

### Q: Can I see cache statistics?

**A:** Yes, check your dashboard under Analytics → TTS Usage for cache hit rates and cost savings.

---

## Summary

**Key Takeaways:**

1. ✅ **Static messages = 99.9% cost savings**
2. ✅ **Group similar messages to reduce unique variations**
3. ✅ **Use consistent voice/provider per campaign**
4. ✅ **Split static intro + personalized details when needed**
5. ✅ **Round/standardize values to increase cache hits**

**Bottom Line:**
With smart message design, you can send thousands of calls for the price of one TTS generation.

---

**Need Help?** Contact support@irisx.com for assistance optimizing your campaigns.

**Last Updated:** November 2025
