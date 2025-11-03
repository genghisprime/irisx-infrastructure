# Live Chat Widget Integration Guide

**Status:** Feature 4 Complete - Backend Ready
**Created:** Week 24 - November 2025

---

## Overview

The IRISX Live Chat Widget is an embeddable chat solution that enables real-time conversations between website visitors and your support agents. The backend API is production-ready with full conversation management, agent assignment, and analytics.

---

## Architecture

### Backend Components (Complete)

1. **Database Schema** (`026_live_chat.sql`)
   - 5 tables: widgets, conversations, messages, agent_presence, typing_indicators
   - 6 SQL functions for operations
   - 2 triggers for automation

2. **Chat Service** (`chat.js`)
   - Widget configuration management
   - Conversation lifecycle handling
   - Message operations
   - Agent assignment with workload balancing
   - Real-time presence and typing indicators
   - Analytics and statistics

3. **REST API** (`routes/chat.js`)
   - 6 public endpoints (no auth required)
   - 7 authenticated endpoints (JWT required)
   - Full CRUD operations for chat functionality

---

## Quick Start

### Step 1: Create a Chat Widget

```bash
# Authenticate and get JWT token
TOKEN="your-jwt-token"

# Create a widget
curl -X POST https://api.tazzi.com/v1/chat/widgets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Main Website Chat",
    "description": "Support widget for homepage",
    "primaryColor": "#667eea",
    "widgetPosition": "bottom-right",
    "greetingMessage": "Hi! How can we help you today?"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "widget_key": "cw_abc123...",
    "primary_color": "#667eea",
    "greeting_message": "Hi! How can we help you today?",
    ...
  }
}
```

### Step 2: Embed Widget on Your Website

Add this HTML to your website (just before `</body>`):

```html
<!-- Tazzi Live Chat Widget -->
<script>
(function() {
  // Configuration
  var WIDGET_KEY = 'cw_abc123...'; // Your widget key
  var API_URL = 'https://api.tazzi.com/v1/chat';

  // Initialize chat
  window.TazziChat = {
    widgetKey: WIDGET_KEY,
    apiUrl: API_URL,
    conversationId: null,
    visitorId: null,

    init: function() {
      // Load widget configuration
      fetch(API_URL + '/widget/' + WIDGET_KEY)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            this.config = data.data;
            this.render();
          }
        });
    },

    render: function() {
      // Create widget UI
      var widget = document.createElement('div');
      widget.id = 'tazzi-chat-widget';
      widget.innerHTML = `
        <div class="tazzi-chat-launcher" onclick="TazziChat.toggle()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        </div>
        <div class="tazzi-chat-window" style="display: none;">
          <div class="tazzi-chat-header">
            <span>Chat with us</span>
            <button onclick="TazziChat.close()">×</button>
          </div>
          <div class="tazzi-chat-messages" id="tazzi-messages"></div>
          <div class="tazzi-chat-input">
            <input type="text" id="tazzi-input" placeholder="Type a message..." />
            <button onclick="TazziChat.send()">Send</button>
          </div>
        </div>
      `;
      document.body.appendChild(widget);

      // Apply styles
      this.applyStyles();
    },

    toggle: function() {
      var window = document.querySelector('.tazzi-chat-window');
      if (window.style.display === 'none') {
        this.open();
      } else {
        window.style.display = 'none';
      }
    },

    open: function() {
      var window = document.querySelector('.tazzi-chat-window');
      window.style.display = 'flex';

      // Start conversation if not exists
      if (!this.conversationId) {
        this.startConversation();
      }
    },

    close: function() {
      document.querySelector('.tazzi-chat-window').style.display = 'none';
    },

    startConversation: function() {
      // Get or create visitor ID
      this.visitorId = localStorage.getItem('tazzi_visitor_id') ||
                       'visitor_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('tazzi_visitor_id', this.visitorId);

      // Start conversation
      fetch(API_URL + '/conversation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetKey: WIDGET_KEY,
          visitorId: this.visitorId,
          pageUrl: window.location.href,
          pageTitle: document.title,
          referrer: document.referrer
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          this.conversationId = data.data.conversation_id;
          this.loadMessages();

          // Send greeting
          this.addMessage('agent', this.config.greeting_message);
        }
      });
    },

    loadMessages: function() {
      if (!this.conversationId) return;

      fetch(API_URL + '/conversation/' + this.conversationId + '/messages')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            data.data.messages.forEach(msg => {
              this.addMessage(msg.sender_type, msg.message_text, false);
            });
          }
        });
    },

    send: function() {
      var input = document.getElementById('tazzi-input');
      var message = input.value.trim();
      if (!message) return;

      // Add to UI
      this.addMessage('visitor', message);
      input.value = '';

      // Send to API
      fetch(API_URL + '/message/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: this.conversationId,
          senderType: 'visitor',
          messageText: message
        })
      });
    },

    addMessage: function(sender, text, scroll = true) {
      var messages = document.getElementById('tazzi-messages');
      var msg = document.createElement('div');
      msg.className = 'tazzi-message tazzi-message-' + sender;
      msg.textContent = text;
      messages.appendChild(msg);

      if (scroll) {
        messages.scrollTop = messages.scrollHeight;
      }
    },

    applyStyles: function() {
      var style = document.createElement('style');
      style.textContent = `
        #tazzi-chat-widget {
          position: fixed;
          ${this.config.widget_position === 'bottom-right' ? 'bottom: 20px; right: 20px;' : ''}
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .tazzi-chat-launcher {
          width: 60px;
          height: 60px;
          border-radius: 30px;
          background: ${this.config.primary_color};
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .tazzi-chat-window {
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 350px;
          height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
        }
        .tazzi-chat-header {
          padding: 16px;
          background: ${this.config.primary_color};
          color: white;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .tazzi-chat-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
        }
        .tazzi-message {
          margin-bottom: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          max-width: 80%;
        }
        .tazzi-message-visitor {
          background: ${this.config.primary_color};
          color: white;
          margin-left: auto;
        }
        .tazzi-message-agent {
          background: #f3f4f6;
          color: #1f2937;
        }
        .tazzi-chat-input {
          padding: 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 8px;
        }
        .tazzi-chat-input input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }
        .tazzi-chat-input button {
          padding: 8px 16px;
          background: ${this.config.primary_color};
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      TazziChat.init();
    });
  } else {
    TazziChat.init();
  }
})();
</script>
```

---

## API Reference

### Public Endpoints (No Authentication)

#### 1. Get Widget Configuration
```
GET /v1/chat/widget/:widgetKey
```

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "widget_key": "cw_abc123",
    "primary_color": "#667eea",
    "greeting_message": "Hi! How can we help?",
    "is_active": true
  }
}
```

#### 2. Start Conversation
```
POST /v1/chat/conversation/start
Content-Type: application/json

{
  "widgetKey": "cw_abc123",
  "visitorId": "visitor_xyz",
  "visitorName": "John Doe",
  "visitorEmail": "john@example.com",
  "pageUrl": "https://example.com/pricing",
  "pageTitle": "Pricing - Example",
  "referrer": "https://google.com"
}
```

#### 3. Send Message
```
POST /v1/chat/message/send
Content-Type: application/json

{
  "conversationId": "cc_def456",
  "senderType": "visitor",
  "messageText": "I need help with my account"
}
```

#### 4. Get Messages
```
GET /v1/chat/conversation/:conversationId/messages?limit=50&offset=0
```

#### 5. Rate Conversation
```
POST /v1/chat/conversation/:conversationId/rate
Content-Type: application/json

{
  "rating": 5,
  "feedback": "Great support!"
}
```

#### 6. Close Conversation
```
POST /v1/chat/conversation/:conversationId/close
```

### Authenticated Endpoints (JWT Required)

#### 7. Create Widget
```
POST /v1/chat/widgets
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "Main Website Chat",
  "primaryColor": "#667eea",
  "widgetPosition": "bottom-right"
}
```

#### 8. Get Agent Conversations
```
GET /v1/chat/agent/conversations
Authorization: Bearer <jwt-token>
```

#### 9. Get Queue (Unassigned)
```
GET /v1/chat/queue
Authorization: Bearer <jwt-token>
```

#### 10. Update Agent Presence
```
POST /v1/chat/agent/presence
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "status": "online",
  "socketId": "socket_123"
}
```

#### 11. Get Chat Statistics
```
GET /v1/chat/stats?start_date=2025-11-01&end_date=2025-11-30
Authorization: Bearer <jwt-token>
```

#### 12. Mark Messages as Read
```
POST /v1/chat/conversation/:conversationId/read
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "senderType": "visitor"
}
```

---

## Features

### Widget Customization
- **Primary Color:** Custom brand colors
- **Position:** Bottom-right, bottom-left, top-right, top-left
- **Greeting Message:** Customizable welcome text
- **Auto-Open:** Automatically open after delay
- **File Uploads:** Support for image and file sharing

### Conversation Management
- **Auto-Assignment:** Agents assigned based on workload
- **Visitor Tracking:** Persistent visitor IDs across sessions
- **Page Context:** Track URL, title, referrer
- **Read Receipts:** Know when messages are read
- **Typing Indicators:** Real-time typing status

### Agent Features
- **Presence Status:** Online, away, busy, offline
- **Workload Balancing:** Distribute chats evenly
- **Queue Management:** See unassigned conversations
- **Chat History:** Full conversation logs
- **Multi-Channel:** Handle multiple chats simultaneously

### Analytics
- **Response Time:** Average first response time
- **Resolution Time:** Average time to close
- **Customer Ratings:** 1-5 star ratings with feedback
- **Volume Metrics:** Total chats, messages, conversions

---

## Database Schema

### Tables

1. **chat_widgets** - Widget configurations
2. **chat_conversations** - Chat sessions
3. **chat_messages** - Individual messages
4. **chat_agent_presence** - Agent online status
5. **chat_typing_indicators** - Real-time typing

### Key Fields

**Conversation:**
- `conversation_id` - Unique ID (cc_...)
- `visitor_id` - Persistent visitor tracking
- `assigned_agent_id` - Assigned agent
- `status` - active, closed, abandoned
- `rating` - 1-5 stars
- `first_response_at` - SLA tracking

**Message:**
- `message_id` - Unique ID (cm_...)
- `sender_type` - visitor, agent, system
- `message_type` - text, image, file
- `is_read` - Read receipt
- `file_url` - Attachment support

---

## Best Practices

### Performance
- Use WebSocket for real-time updates (recommended)
- Poll `/messages` endpoint every 2-3 seconds as fallback
- Implement message pagination for long chats
- Cache widget configuration

### Security
- Validate widget key on every request
- Sanitize user input before displaying
- Implement rate limiting on public endpoints
- Use HTTPS only for all API calls

### User Experience
- Show typing indicators
- Display agent name and avatar
- Provide offline message option
- Auto-scroll to new messages
- Show "Agent is typing..." feedback

### Analytics
- Track conversation start rate
- Monitor first response time
- Analyze drop-off points
- Review customer ratings regularly

---

## Monitoring

### Health Checks
```sql
-- Active conversations
SELECT COUNT(*) FROM chat_conversations WHERE status = 'active';

-- Online agents
SELECT COUNT(*) FROM chat_agent_presence WHERE status = 'online';

-- Average response time (last 24 hours)
SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)))
FROM chat_conversations
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND first_response_at IS NOT NULL;
```

---

## Troubleshooting

### Widget Not Loading
- Verify widget_key is correct
- Check API URL is accessible
- Ensure widget is active (`is_active = true`)
- Check browser console for errors

### Messages Not Sending
- Verify conversation_id is valid
- Check API response for errors
- Ensure conversation is not closed
- Verify network connectivity

### Agent Assignment Not Working
- Check agents are online (`status = 'online'`)
- Verify agents have capacity (`active_chats < max_concurrent_chats`)
- Review `chat_agent_presence` table

---

## Future Enhancements

- **WebSocket Server:** Real-time bidirectional communication
- **Chat Transcripts:** Email conversation history
- **Canned Responses:** Quick reply templates
- **Chat Routing:** Department-based routing
- **Visitor Info:** Show visitor's browsing history
- **Proactive Chat:** Trigger chat based on behavior
- **Mobile SDK:** Native iOS/Android widgets

---

## Support

For questions or issues with the Live Chat system:
- Review API response error messages
- Check database logs for errors
- Monitor agent presence status
- Review conversation status transitions

**Documentation Version:** 1.0
**Last Updated:** November 2025
**Maintained By:** IRISX Platform Team
