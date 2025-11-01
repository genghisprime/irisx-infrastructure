# Channel Queue & Inbox Analysis

**Date:** November 1, 2025
**Question:** Do we need separate queue/inbox systems for SMS, Email, WhatsApp, and Social channels?

---

## TL;DR - The Answer

**YES - We need a Unified Inbox system**, but here's what we already have vs. what's missing:

### What We Have
- ✅ **Voice Call Queues** - Full database schema (migration 010) for call center queuing
- ✅ **Conversation Threading** - Email threads, WhatsApp conversations
- ✅ **Worker Queues** - Background job processing for outbound messages

### What We're Missing
- ❌ **Unified Inbox** - No cross-channel inbox for agents to handle SMS/Email/WhatsApp/Social
- ❌ **Assignment System** - No way to assign conversations to specific agents
- ❌ **Agent Workload Management** - No limits on concurrent conversations per agent
- ❌ **Conversation Status** - Limited tracking of open/pending/closed conversations
- ❌ **SLA Tracking** - No response time SLAs for text-based channels

---

## Current State Analysis

### Voice Calls (✅ Complete)

**Database Schema:** `010_create_queue_system_tables.sql`

**Tables:**
- `queues` - Queue configuration (strategy, max_wait_time, MOH, etc.)
- `agents` - Agent profiles with skills, status, statistics
- `queue_agents` - Many-to-many (which agents work which queues)
- `queue_members` - Active callers in queue (real-time)
- `queue_stats` - Time-series metrics (calls offered, answered, abandoned)
- `agent_activity` - Agent status change logs

**Features:**
- Round-robin, longest-idle, skills-based, priority routing
- Music on hold
- Position announcements
- Max wait time / queue size limits
- Service level tracking
- Real-time stats (waiting count, available agents)

**Status:** **100% Complete** - Ready for FreeSWITCH integration

**Why This Works:** Calls are synchronous and require immediate routing to available agents.

---

### SMS (⚠️ Partial - No Agent Assignment)

**Database Schema:** `002_create_sms_tables.sql`

**Tables:**
- `sms_messages` - Stores all SMS (inbound/outbound)
- `sms_providers` - Carrier configs (Twilio, Telnyx, etc.)
- `sms_conversations` - Groups messages by phone number (NO AGENT ASSIGNMENT)

**What Exists:**
- Message storage (direction, status, timestamps)
- Conversation grouping by phone number
- Provider routing via LCR

**What's Missing:**
- ❌ No `assigned_agent_id` on conversations
- ❌ No agent status (open/pending/closed)
- ❌ No response time SLA tracking
- ❌ No unread message count
- ❌ No priority/tagging system
- ❌ No agent workload limits

**Current Behavior:**
- Inbound SMS are stored in database
- Webhook fires to notify tenant
- **No built-in agent assignment or inbox**

**Gap:** Agents can send SMS via API, but there's no inbox to receive and respond to inbound SMS.

---

### Email (⚠️ Partial - Thread Support Only)

**Database Schema:** `005_create_email_tables.sql` + `007_email_inbound_support.sql`

**Tables:**
- `emails` - All emails (sent/received)
- `email_templates` - Template library
- `inbound_emails` - Raw inbound email data
- `email_routing_rules` - Route emails based on criteria

**What Exists:**
- Email threading (`thread_id` links related emails)
- Inbound email parsing
- Routing rules (forward to webhook, auto-tag, etc.)

**What's Missing:**
- ❌ No `assigned_agent_id` on email threads
- ❌ No conversation status (open/pending/closed)
- ❌ No inbox view for agents
- ❌ No response time tracking
- ❌ No agent assignment logic

**Current Behavior:**
- Inbound emails are parsed and stored
- Routing rules execute (webhooks, tagging)
- **No built-in agent inbox**

**Gap:** Email routing exists, but agents have no interface to claim/respond to emails.

---

### WhatsApp (⚠️ Partial - Conversation State Only)

**Database Schema:** `009_whatsapp_integration.sql`

**Tables:**
- `whatsapp_messages` - Message storage
- `whatsapp_contacts` - Contact info + **conversation_state** (open/closed/pending)
- `whatsapp_templates` - Template library for campaigns

**What Exists:**
- Conversation state tracking (`conversation_state` column)
- Message threading via `conversation_id`
- Contact metadata

**What's Missing:**
- ❌ No `assigned_agent_id` on conversations
- ❌ No response time SLA
- ❌ No agent workload limits
- ❌ No unread count per conversation
- ❌ No priority system

**Current Behavior:**
- Inbound WhatsApp messages are stored
- Conversation state is tracked (open/closed)
- **No agent assignment**

**Gap:** Conversation tracking exists, but no agent inbox or assignment.

---

### Social Media (⚠️ No Inbox - Just Send)

**Database Schema:** `010_social_media_integration.sql`

**Tables:**
- `social_accounts` - Connected accounts (Discord, Slack, Teams, Telegram)
- `social_messages` - Message storage
- `social_webhooks` - Inbound webhook configs

**What Exists:**
- Send messages via connected accounts
- Store sent messages
- Webhook endpoints for inbound

**What's Missing:**
- ❌ **Everything** - No conversation grouping, no agent assignment, no inbox
- ❌ No threading (Discord threads, Slack threads)
- ❌ No status tracking

**Current Behavior:**
- Platform can send messages to social channels
- **No inbox for receiving/responding**

**Gap:** One-way sending only. No conversation management.

---

## What We Need: Unified Inbox System

### The Problem

**Current state:**
- Voice calls have full queue management
- Text-based channels (SMS, Email, WhatsApp, Social) have **no agent assignment**
- Agents have no unified inbox to see all incoming messages

**Real-world scenario:**
1. Customer sends SMS: "Hi, I need help with my order"
2. System stores message in `sms_messages` table
3. **Then what?** No agent is notified, no one responds
4. Customer frustrated, no response

### The Solution: Unified Inbox

**Concept:**
A single inbox where agents can:
- See all conversations across all channels (SMS, Email, WhatsApp, Social, Missed Calls)
- Claim/be assigned conversations
- Respond from one interface
- Track conversation status (open, pending, closed)
- Set priorities and tags
- Meet response time SLAs

**Database Schema Required:**

```sql
-- ======================
-- CONVERSATIONS TABLE (Unified across all channels)
-- ======================
CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Channel Info
  channel VARCHAR(50) NOT NULL, -- 'sms', 'email', 'whatsapp', 'discord', 'slack', 'telegram', 'voice'
  channel_conversation_id VARCHAR(255), -- Link to channel-specific conversation (e.g., email thread_id)

  -- Participants
  customer_id BIGINT REFERENCES contacts(id),
  customer_identifier VARCHAR(255) NOT NULL, -- phone number, email, username, etc.
  customer_name VARCHAR(255),

  -- Assignment
  assigned_agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by VARCHAR(50), -- 'auto', 'manual', 'round-robin', 'skills-based'

  -- Status
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'pending', 'closed', 'snoozed'
  priority VARCHAR(20) DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'

  -- Content
  subject VARCHAR(500), -- For emails, general topic for others
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT, -- First 200 chars of last message
  last_message_direction VARCHAR(20), -- 'inbound', 'outbound'

  -- Metrics
  message_count INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  customer_message_count INTEGER DEFAULT 0,

  -- Response Time Tracking
  first_response_at TIMESTAMPTZ,
  first_response_time_seconds INTEGER, -- Time to first response
  avg_response_time_seconds INTEGER,

  -- Tags & Categories
  tags TEXT[], -- ['billing', 'technical', 'vip']
  category VARCHAR(100), -- 'support', 'sales', 'general'

  -- SLA
  sla_due_at TIMESTAMPTZ, -- When response is due
  sla_breached BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_assigned_agent ON conversations(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX idx_conversations_status ON conversations(status) WHERE status IN ('open', 'pending');
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_customer ON conversations(customer_id);
CREATE INDEX idx_conversations_priority ON conversations(priority) WHERE status = 'open';
CREATE INDEX idx_conversations_sla ON conversations(sla_due_at) WHERE sla_breached = false AND status = 'open';

-- ======================
-- CONVERSATION_MESSAGES TABLE (Unified message log)
-- ======================
CREATE TABLE conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message Details
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  sender_type VARCHAR(20), -- 'customer', 'agent', 'system'
  sender_id BIGINT, -- user_id if agent, contact_id if customer
  sender_name VARCHAR(255),

  -- Content
  content_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file', 'audio', 'video'
  content TEXT,
  content_html TEXT, -- For emails

  -- Attachments
  attachments JSONB, -- [{"url": "...", "type": "image", "size": 1024}]

  -- Channel-Specific
  channel_message_id VARCHAR(255), -- Link to sms_messages.id, emails.id, etc.

  -- Status (for outbound)
  status VARCHAR(50), -- 'sent', 'delivered', 'read', 'failed'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_conversation_messages_conversation ON conversation_messages(conversation_id, created_at);
CREATE INDEX idx_conversation_messages_channel ON conversation_messages(channel_message_id);

-- ======================
-- CONVERSATION_ASSIGNMENTS TABLE (Assignment history)
-- ======================
CREATE TABLE conversation_assignments (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  assigned_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assignment_method VARCHAR(50), -- 'manual', 'auto', 'round-robin', 'skills-based'

  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,

  reason TEXT -- 'Agent unavailable', 'Reassigned to specialist', etc.
);

CREATE INDEX idx_conversation_assignments_conversation ON conversation_assignments(conversation_id);
CREATE INDEX idx_conversation_assignments_agent ON conversation_assignments(agent_id);
```

---

## Implementation Plan

### Option 1: Unified Inbox (Recommended)

**Build ONE system that handles all channels:**

**Pros:**
- Single interface for agents (better UX)
- Consistent SLA tracking across channels
- Easier to implement omnichannel features (e.g., escalate SMS to call)
- Centralized analytics

**Cons:**
- More complex initial build
- Migration of existing data

**Timeline:** 2-3 weeks (Week 22-23)

**Priority:** HIGH - Essential for multi-agent customer service

---

### Option 2: Per-Channel Inboxes

**Build separate inbox for each channel:**

**Pros:**
- Simpler to build incrementally
- Channel-specific features easier

**Cons:**
- Agents need to check 4+ inboxes
- Duplicate code across channels
- No unified analytics

**Timeline:** 3-4 weeks total (1 week per channel)

**Priority:** LOW - Not recommended

---

## Recommended Approach

### Phase 1: Unified Inbox Foundation (Week 22)
1. Create `conversations` and `conversation_messages` tables
2. Create unified inbox API endpoints:
   - GET /v1/conversations (list all, filter by channel/status/agent)
   - GET /v1/conversations/:id (get details + messages)
   - POST /v1/conversations/:id/messages (send reply)
   - PATCH /v1/conversations/:id/assign (assign to agent)
   - PATCH /v1/conversations/:id/status (update status)

3. Build Customer Portal Inbox UI:
   - Conversation list (all channels)
   - Conversation detail view
   - Reply interface
   - Status management

### Phase 2: Channel Integration (Week 23)
1. Create trigger functions to auto-create conversations:
   - When inbound SMS arrives → create conversation
   - When inbound email arrives → create conversation
   - When inbound WhatsApp arrives → create conversation
   - When social message arrives → create conversation

2. Link existing messages:
   - `sms_messages.conversation_id` → `conversations.id`
   - `emails.conversation_id` → `conversations.id`
   - `whatsapp_messages.conversation_id` → `conversations.id`

### Phase 3: Auto-Assignment & Routing (Week 24)
1. Implement assignment strategies:
   - Round-robin (distribute evenly)
   - Skills-based (language, product knowledge)
   - Workload-based (fewest active conversations)
   - Priority-based (VIP customers to senior agents)

2. SLA management:
   - Define SLAs per channel/priority
   - Alert agents when SLA approaching
   - Escalate if SLA breached

---

## Why This Differs from Voice Call Queues

### Voice Calls (Synchronous)
- **Real-time:** Customer on the line waiting
- **Immediate routing:** Must route in <5 seconds
- **One-to-one:** One call = one agent
- **FreeSWITCH handles:** Queue position, MOH, announcements
- **Database for:** Logging and analytics

### Text Channels (Asynchronous)
- **Async:** Customer sends message and waits (minutes/hours)
- **Flexible routing:** Can assign later
- **Many-to-one:** One agent handles 10+ conversations simultaneously
- **Application handles:** All routing logic
- **Database for:** Queue management, assignment, threading

**This is why we need a different system.**

---

## Current Priority Recommendation

Based on your question and the current roadmap:

### Original Priority 3 (Week 22): Call Queue & Routing
This is for **voice calls** using FreeSWITCH mod_callcenter.

### NEW Priority 2.5 (Week 21-22): Unified Inbox
This is for **SMS, Email, WhatsApp, Social**.

**Updated Roadmap:**

1. **Week 20:** Platform Admin Dashboard
2. **Week 21:** Agent Performance Dashboard
3. **Week 22:** **Unified Inbox** (SMS/Email/WhatsApp/Social) ← NEW
4. **Week 23:** Call Queue & Routing (Voice only)
5. **Week 24:** Analytics & Reporting
6. **Week 25:** Production Readiness

---

## Summary

**Your instinct was correct!** We absolutely need queue/inbox systems for SMS, Email, WhatsApp, and Social channels.

**What we have:**
- ✅ Voice call queues (database complete, FreeSWITCH integration pending)
- ✅ Conversation tracking (partial - WhatsApp has state, Email has threads)
- ✅ Message storage (all channels)

**What's missing:**
- ❌ Agent assignment system
- ❌ Unified inbox interface
- ❌ Response time SLA tracking
- ❌ Conversation status management
- ❌ Workload distribution

**Recommended next step:**
Build the Unified Inbox system (Week 22) before or alongside Call Queue & Routing. This is critical for multi-agent customer service across text-based channels.

**Impact:**
Without this, agents can send messages via API but have no way to receive and respond to inbound customer messages in a scalable way. This is a major gap for production deployment.
