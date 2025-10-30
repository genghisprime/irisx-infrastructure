# 🔐 Agent Desktop - Login Instructions

## Quick Start (DEMO Mode)

The Agent Desktop now includes a **DEMO login** that works without the backend API!

---

## 🎮 DEMO Credentials

**Email:** `demo@irisx.com`
**Password:** `demo123`

These credentials work **immediately** without any backend configuration.

---

## 📝 Step-by-Step Login

### 1. Start the Dev Server (if not running)
```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop
npm run dev
```

### 2. Open Your Browser
Navigate to: **http://localhost:5173**

### 3. You'll See the Login Page
- Title: "Agent Login"
- Subtitle: "IRISX Agent Desktop"

### 4. Enter DEMO Credentials
- **Email:** `demo@irisx.com`
- **Password:** `demo123`

### 5. Click "Sign in"
You'll be redirected to the Agent Dashboard at `/agent`

---

## 🎯 What You'll See After Login

### Agent Dashboard Layout

**Header (Top):**
- "IRISX Agent Desktop" title
- Status selector (Available/Busy/Away/Offline)
- User info: "demo@irisx.com"
- Logout button

**Left Column - Softphone:**
- Yellow "DEMO MODE" banner
- Black display screen
- 12-key dial pad (0-9, *, #)
- Call/Hangup buttons
- Backspace button

**Right Column:**
- "Recent Calls" section (empty initially)
- Quick stats cards:
  - Calls Today: 0
  - Talk Time: 0:00
  - Avg Duration: 0:00

---

## 🧪 Testing the Softphone

### Make a Demo Call:

1. **Click dial pad** to enter a number (e.g., `15551234567`)
2. **Click green "Call" button**
3. Watch the status change:
   - "Dialing..." (1 second)
   - "Ringing..." (2 seconds)
   - "Connected - 00:00" (timer starts)
4. **While connected:**
   - Click "Mute" - toggles red
   - Click "Hold" - toggles yellow, changes to "Resume"
   - Click "Transfer" - logs to console (DEMO)
5. **Click red "Hang Up" button**
6. **Disposition modal appears:**
   - Select outcome (8 options)
   - Add notes (optional)
   - Click "Save Disposition"
7. **Call appears in history:**
   - Color-coded outcome badge
   - Duration displayed
   - "View Notes" button (if notes added)
8. **Stats update:**
   - Calls Today: 1
   - Talk Time: (call duration)
   - Avg Duration: (calculated)

---

## 🔄 Backend API Login (When Available)

If your backend API is running, you can use real credentials:

### Requirements:
1. Backend API running on `http://54.160.220.243:3000`
2. User account created in database
3. Valid email/password

### Create a Backend User:

**Option A - Via API:**
```bash
curl -X POST http://54.160.220.243:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@irisx.com",
    "password": "yourpassword",
    "company_name": "Your Company",
    "first_name": "Agent",
    "last_name": "Name",
    "role": "agent"
  }'
```

**Option B - Via SQL:**
```sql
-- Connect to PostgreSQL
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d irisx

-- Create agent user (use bcrypt for password_hash)
INSERT INTO users (email, password_hash, role, first_name, last_name, company_name, created_at)
VALUES (
  'agent@irisx.com',
  '$2b$10$...', -- bcrypt hash
  'agent',
  'Agent',
  'Name',
  'Your Company',
  NOW()
);
```

Then login with those credentials instead of the demo account.

---

## 🚪 Logout

Click the **logout icon** (arrow) in the top-right header to logout.

You'll be redirected back to `/login`.

---

## ⚠️ Troubleshooting

### "Login failed" error
- Make sure you're using **exactly** `demo@irisx.com` / `demo123`
- Check browser console (F12) for errors
- Verify dev server is running on port 5173

### Can't access /agent directly
- This is expected! The route is protected
- You must login first to access the dashboard
- Attempting to access `/agent` without auth redirects to `/login`

### Logout doesn't work
- Click the logout icon in the header (top-right)
- If stuck, clear localStorage: `localStorage.clear()` in browser console
- Refresh the page

### Dev server not running
```bash
# Check if port 5173 is in use
lsof -i :5173

# Start the server
npm run dev
```

---

## 🎨 Demo Account Features

The demo account has full access to all features:

✅ **Available:**
- Change agent status
- Make demo calls (simulated)
- View call history
- Add call dispositions
- See stats update
- All UI interactions

❌ **Not Available (Phase 3):**
- Real WebRTC calls
- Incoming calls
- Firebase presence sync
- Socket.io real-time updates
- API call history persistence

---

## 💡 Tips

1. **Test Multiple Calls:** Make several calls to see history build up
2. **Try Different Outcomes:** Use all 8 disposition types to see different badges
3. **Add Notes:** Test the notes feature with various call scenarios
4. **Change Status:** Switch between Available/Busy/Away/Offline
5. **Check Console:** Open DevTools (F12) to see demo mode logs

---

## 📊 Demo Mode Indicators

You'll know you're in demo mode:
- 🟡 Yellow "DEMO MODE" banner on softphone
- 🎮 "DEMO LOGIN: Using mock credentials" in console
- 📞 Simulated call progression (not real calls)

---

## ✅ Ready to Test!

1. Open **http://localhost:5173**
2. Login with **demo@irisx.com** / **demo123**
3. Start making demo calls!

---

**Enjoy testing the Agent Desktop!** 🚀
