# IRIS Advanced IVR: Natural Language & Visual IVR

> **GPT-4 powered conversational IVR with natural language understanding and mobile-first visual menus**

---

## Overview

### Why Advanced IVR Matters

**Traditional IVR Problems:**
- Press 1 for sales, Press 2 for support... (10+ menu levels)
- 60% of callers press 0 to reach a human immediately
- "I didn't understand that" frustration
- Zero mobile-first experience

**Modern Solution:**
- **Natural Language IVR**: "Hi, I want to check my order status" → Routes to correct agent
- **Visual IVR**: Mobile app shows menu with icons, tap to navigate (no listening to options)
- **Context-Aware**: Knows caller's history, account status, previous interactions

**Business Impact:**
- 40% reduction in call handling time
- 70% reduction in mis-routed calls
- 90% customer satisfaction improvement
- Compete with Google Contact Center AI, Twilio Autopilot

---

## Natural Language IVR (NLU)

### Architecture

```
Caller says: "I need help with my billing"
         │
         ▼
┌────────────────────────────┐
│  Speech-to-Text            │
│  (Deepgram real-time)      │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Intent Recognition        │
│  (GPT-4 Turbo)             │
│  → billing_inquiry         │
│  Confidence: 0.95          │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Entity Extraction         │
│  account_number: 12345     │
│  issue_type: payment       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Dialog Manager            │
│  - Check if auth needed    │
│  - Gather missing info     │
│  - Route to agent/self-srv │
└────────┬───────────────────┘
         │
         ▼
   Route to billing queue
```

### Implementation

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Intent {
  name: string;
  confidence: number;
  entities: Record<string, any>;
  next_action: 'collect_info' | 'route_to_agent' | 'self_service' | 'fallback';
}

async function recognizeIntent(userInput: string, context: CallContext): Promise<Intent> {
  const prompt = `
You are an IVR intent classifier for a multi-channel communications platform.

CALLER INPUT: "${userInput}"

CALLER CONTEXT:
- Previous calls: ${context.previous_calls?.length || 0}
- Account status: ${context.account_status || 'unknown'}
- Current balance: $${context.account_balance || 0}
- Open tickets: ${context.open_tickets || 0}

AVAILABLE INTENTS:
- billing_inquiry (billing questions, payment issues)
- technical_support (product not working, bugs, errors)
- sales_inquiry (pricing, features, demos)
- account_management (password reset, profile update)
- order_status (track order, delivery questions)
- cancel_service (cancellation, refunds)
- general_inquiry (other questions)

Return JSON:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "entities": { "key": "value" },
  "reasoning": "why you chose this intent",
  "next_action": "collect_info|route_to_agent|self_service|fallback",
  "suggested_response": "What to say to caller next"
}
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: 'You are an expert IVR intent recognition system.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const result = JSON.parse(response.choices[0].message.content!);

  return {
    name: result.intent,
    confidence: result.confidence,
    entities: result.entities,
    next_action: result.next_action,
  };
}

// Dialog Manager
class ConversationalIVR {
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private collectedEntities: Record<string, any> = {};

  async handleUserInput(input: string, callId: string): Promise<IVRResponse> {
    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: input });

    // Get intent
    const intent = await recognizeIntent(input, await this.getCallContext(callId));

    // Handle based on next action
    switch (intent.next_action) {
      case 'collect_info':
        return await this.collectMissingInfo(intent);

      case 'route_to_agent':
        return await this.routeToAgent(callId, intent);

      case 'self_service':
        return await this.handleSelfService(intent);

      case 'fallback':
        return {
          message: "I'm not sure I understood that. Let me connect you with someone who can help.",
          action: 'transfer_to_human',
        };
    }
  }

  private async collectMissingInfo(intent: Intent): Promise<IVRResponse> {
    // Check what entities we still need
    const requiredEntities = this.getRequiredEntities(intent.name);
    const missing = requiredEntities.filter(e => !this.collectedEntities[e]);

    if (missing.length > 0) {
      const entityToCollect = missing[0];
      return {
        message: this.getPromptForEntity(entityToCollect),
        action: 'collect_input',
        expected_entity: entityToCollect,
      };
    }

    // Have all required info, route call
    return await this.routeToAgent(this.callId, intent);
  }

  private async routeToAgent(callId: string, intent: Intent): Promise<IVRResponse> {
    // Find best queue
    const queueId = await this.selectQueue(intent.name);

    // Enqueue call
    await fetch(`/v1/calls/${callId}/enqueue`, {
      method: 'POST',
      body: JSON.stringify({
        queue_id: queueId,
        priority: intent.name === 'cancel_service' ? 'high' : 'normal',
        context: {
          intent: intent.name,
          entities: this.collectedEntities,
          conversation: this.conversationHistory,
        },
      }),
    });

    return {
      message: "I'm connecting you with a specialist now. Please hold.",
      action: 'queue',
    };
  }
}

interface IVRResponse {
  message: string;
  action: 'collect_input' | 'transfer_to_human' | 'queue' | 'self_service' | 'end_call';
  expected_entity?: string;
}
```

### FreeSWITCH Integration

```xml
<!-- Natural Language IVR Extension -->
<extension name="nlu_ivr">
  <condition field="destination_number" expression="^ivr_nlu$">
    <action application="answer"/>
    <action application="sleep" data="1000"/>

    <!-- Welcome message -->
    <action application="playback" data="/prompts/welcome.wav"/>

    <!-- Start streaming audio to STT + GPT-4 -->
    <action application="lua" data="nlu_ivr.lua"/>
  </condition>
</extension>
```

```lua
-- nlu_ivr.lua
local session = assert(session)
local api = freeswitch.API()

-- Play welcome
session:speak("Welcome to IRIS. How can I help you today?")

-- Start Deepgram transcription
local transcript = ""
session:streamFile("/tmp/recording.wav")

-- Send audio to Deepgram WebSocket
local deepgram = require("deepgram")
local connection = deepgram.connect()

connection:on("transcript", function(text)
  transcript = transcript .. " " .. text

  -- Send to GPT-4 for intent recognition
  local http = require("socket.http")
  local response = http.request({
    url = "https://api.iris.com/v1/ivr/nlu",
    method = "POST",
    body = json.encode({
      call_id = session:getVariable("uuid"),
      input = text,
    }),
  })

  local intent = json.decode(response.body)

  if intent.action == "queue" then
    -- Transfer to queue
    session:execute("fifo", intent.queue_name)
  elseif intent.action == "collect_input" then
    -- Ask follow-up question
    session:speak(intent.message)
  end
end)
```

---

## Visual IVR

### Mobile App Implementation

```tsx
import { useState, useEffect } from 'react';

interface VisualIVROption {
  id: string;
  icon: string;
  title: string;
  description: string;
  action: 'navigate' | 'call' | 'self_service';
  destination?: string;
}

export function VisualIVR({ phoneNumber }: { phoneNumber: string }) {
  const [currentMenu, setCurrentMenu] = useState<VisualIVROption[]>([]);
  const [path, setPath] = useState<string[]>(['root']);

  useEffect(() => {
    loadMenu('root');
  }, []);

  async function loadMenu(menuId: string) {
    const response = await fetch(`/v1/visual-ivr/menu/${menuId}?phone=${phoneNumber}`);
    const menu = await response.json();
    setCurrentMenu(menu.options);
  }

  async function handleOptionSelect(option: VisualIVROption) {
    if (option.action === 'navigate') {
      setPath(prev => [...prev, option.id]);
      await loadMenu(option.destination!);
    } else if (option.action === 'call') {
      // Initiate call with context
      window.location.href = `tel:${phoneNumber}?context=${option.id}`;
    } else if (option.action === 'self_service') {
      // Open self-service flow
      window.location.href = `/self-service/${option.destination}`;
    }
  }

  function goBack() {
    const newPath = path.slice(0, -1);
    setPath(newPath);
    loadMenu(newPath[newPath.length - 1]);
  }

  return (
    <div className="visual-ivr">
      <header>
        {path.length > 1 && (
          <button onClick={goBack}>← Back</button>
        )}
        <h2>How can we help?</h2>
      </header>

      <div className="options-grid">
        {currentMenu.map(option => (
          <button
            key={option.id}
            className="ivr-option"
            onClick={() => handleOptionSelect(option)}
          >
            <span className="icon">{option.icon}</span>
            <h3>{option.title}</h3>
            <p>{option.description}</p>
          </button>
        ))}
      </div>

      <div className="quick-call">
        <button onClick={() => window.location.href = `tel:${phoneNumber}`}>
          📞 Call Us Directly
        </button>
      </div>
    </div>
  );
}
```

### Backend Menu Configuration

```typescript
// GET /v1/visual-ivr/menu/:menu_id
async function getVisualIVRMenu(req: Request): Promise<Response> {
  const menuId = req.params.menu_id;
  const phoneNumber = req.query.phone;

  // Get customer context
  const customer = await db.query(`
    SELECT * FROM customers WHERE phone_number = $1
  `, [phoneNumber]);

  const context = customer.rows[0] || {};

  // Load menu configuration
  const menu = await db.query(`
    SELECT * FROM visual_ivr_menus WHERE id = $1
  `, [menuId]);

  // Personalize options based on context
  let options = menu.rows[0].options;

  if (context.open_tickets > 0) {
    options.unshift({
      id: 'check_ticket_status',
      icon: '🎫',
      title: 'Check Ticket Status',
      description: `You have ${context.open_tickets} open ticket(s)`,
      action: 'self_service',
      destination: '/tickets',
    });
  }

  if (context.account_balance < 0) {
    options.unshift({
      id: 'pay_bill',
      icon: '💳',
      title: 'Pay Your Bill',
      description: `Amount due: $${Math.abs(context.account_balance)}`,
      action: 'self_service',
      destination: '/billing/pay',
    });
  }

  return Response.json({ options });
}
```

### Database Schema

```sql
-- Visual IVR menus
CREATE TABLE visual_ivr_menus (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  options JSONB NOT NULL,
  personalization_rules JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Example menu:
INSERT INTO visual_ivr_menus (id, tenant_id, name, options) VALUES (
  'root',
  'tenant-123',
  'Main Menu',
  '[
    {
      "id": "billing",
      "icon": "💳",
      "title": "Billing & Payments",
      "description": "View bills, make payments",
      "action": "navigate",
      "destination": "billing_menu"
    },
    {
      "id": "support",
      "icon": "🛠️",
      "title": "Technical Support",
      "description": "Get help with issues",
      "action": "call",
      "destination": "support_queue"
    },
    {
      "id": "sales",
      "icon": "🎯",
      "title": "Sales & Upgrades",
      "description": "Learn about new features",
      "action": "call",
      "destination": "sales_queue"
    }
  ]'::jsonb
);
```

---

## Multi-Turn Conversations

```typescript
class MultiTurnDialog {
  private context: DialogContext;

  async handleTurn(userInput: string): Promise<DialogResponse> {
    // Add to history
    this.context.turns.push({
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    });

    // Check if we're in middle of information collection
    if (this.context.collecting_entity) {
      return await this.processEntityValue(userInput);
    }

    // Otherwise, get intent
    const intent = await recognizeIntent(userInput, this.context);

    // Check if we need more information
    const missing = this.getMissingEntities(intent);

    if (missing.length > 0) {
      this.context.collecting_entity = missing[0];
      return {
        message: this.getPromptFor(missing[0]),
        action: 'collect_input',
      };
    }

    // Have everything, proceed
    return await this.executeIntent(intent);
  }

  private async processEntityValue(value: string): Promise<DialogResponse> {
    const entity = this.context.collecting_entity!;

    // Validate entity value
    if (!this.validateEntity(entity, value)) {
      return {
        message: `Sorry, that doesn't look like a valid ${entity}. Could you try again?`,
        action: 'collect_input',
      };
    }

    // Store entity
    this.context.entities[entity] = value;
    this.context.collecting_entity = null;

    // Check if we need more
    const missing = this.getMissingEntities(this.context.current_intent!);

    if (missing.length > 0) {
      this.context.collecting_entity = missing[0];
      return {
        message: this.getPromptFor(missing[0]),
        action: 'collect_input',
      };
    }

    // Have everything
    return await this.executeIntent(this.context.current_intent!);
  }
}
```

---

## Cost Model

**Natural Language IVR:**
- Deepgram STT: $0.0043/min
- GPT-4 intent recognition: $0.02/call (avg 2K tokens)
- **Total: $0.025/call** (2.5¢)

**Visual IVR:**
- API calls: $0.0001/request (negligible)
- **Total: $0.0001/session** (0.01¢)

**Pricing:**
- Charge: $0.10/call for NLU IVR (10¢)
- Cost: $0.025/call (2.5¢)
- **Margin: 75%**

**Visual IVR:**
- Charge: $5/month per tenant (flat fee)
- Cost: $0.50/month (hosting)
- **Margin: 90%**

---

## Summary

✅ **Natural Language IVR** with GPT-4
✅ **Visual IVR** for mobile-first experience
✅ **Context-aware routing**
✅ **Multi-turn conversations**
✅ **75-90% margins**

**Ready to compete with Google Contact Center AI! 🤖✨**
