# Agent Desktop Phase 2 - TODO

## Current Status: Phase 1 Complete (50%)

Foundation is ready. Need to complete Phase 2 components.

## What's Already Done:
- ✅ Project structure (Vite + Vue 3)
- ✅ Dependencies (Vue Router, Pinia, Axios, SIP.js, Socket.io, Tailwind)
- ✅ Config files (Tailwind, PostCSS, .env.example)
- ✅ Auth store (src/stores/auth.js)
- ✅ API client (src/utils/api.js)
- ✅ main.js, App.vue, style.css

## Phase 2 - Files to Create (50%):

### 1. Router (CRITICAL)
**File:** `src/router/index.js`
- Import Login and AgentDashboard views
- Define routes (/, /login, /agent)
- Add beforeEach auth guard
- Check for requiresAuth meta

### 2. Login Page
**File:** `src/views/auth/Login.vue`
- Email + password form
- Use authStore.login()
- Redirect to /agent on success
- Copy structure from Customer Portal Login.vue

### 3. Agent Dashboard (MAIN UI)
**File:** `src/views/agent/AgentDashboard.vue`
- Layout with header (status selector, user email, logout)
- Main area with Softphone component
- Sidebar with call history
- Use Tailwind grid layout

### 4. Softphone Component
**File:** `src/components/Softphone.vue`
- Dial pad (0-9, *, #, call/hangup buttons)
- Display: number being dialed, call status, timer
- Call controls: mute, hold, transfer buttons
- For Phase 2: Just UI mockup (no actual SIP.js yet)
- Show "DEMO MODE" banner

### 5. Agent Status Selector
**File:** `src/components/AgentStatusSelector.vue`
- Dropdown with: Available, Busy, Away, Offline
- Green/yellow/red/gray color coding
- Store status in local state (no Firebase yet)

### 6. Call Disposition Modal (OPTIONAL)
**File:** `src/components/CallDispositionModal.vue`
- Opens after call ends
- Textarea for notes
- Dropdown for outcome (Completed, No Answer, etc.)
- Save button (calls API)

## Quick Start Commands:

```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop

# Copy Login from Customer Portal as template
cp ../irisx-customer-portal/src/views/auth/Login.vue src/views/auth/Login.vue

# Then modify the copied Login.vue to:
# 1. Change title to "Agent Login"
# 2. Redirect to /agent instead of /dashboard
# 3. Keep everything else the same

# Create the router, dashboard, and components from scratch
```

## Phase 2 Completion Estimate: 1-2 hours

## Note on WebRTC:
Phase 2 will create a WORKING agent desktop with DEMO softphone UI.
Real SIP.js WebRTC integration can be Phase 3 (requires FreeSWITCH WebRTC config).

The UI will be fully functional - just won't make real calls yet.
