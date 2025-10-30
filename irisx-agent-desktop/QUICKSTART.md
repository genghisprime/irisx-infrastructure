# Agent Desktop - Quick Start Guide

## ✅ Status: Ready to Run!

All dependencies are installed and the dev server has been tested successfully.

---

## 🚀 Start Development Server

```bash
cd /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 📝 Login Credentials

You'll need valid credentials from the IRISX backend API:

- **API Endpoint:** http://54.160.220.243:3000
- **Login Endpoint:** POST /v1/auth/login

Example test user (if configured in backend):
```json
{
  "email": "agent@irisx.com",
  "password": "your-password"
}
```

---

## 🎮 Testing the DEMO Softphone

1. **Login** - Enter email/password and click "Sign in"
2. **Dashboard** - Should redirect to `/agent` automatically
3. **Change Status** - Click status dropdown in header (Available/Busy/Away/Offline)
4. **Make Demo Call:**
   - Click dial pad to enter number (e.g., `15551234567`)
   - Click green "Call" button
   - Watch status: Dialing → Ringing → Connected
   - Timer should increment
5. **Call Controls:**
   - **Mute** - Toggle mute state (red when active)
   - **Hold** - Toggle hold state (yellow when active)
   - **Transfer** - Opens transfer dialog (DEMO)
6. **Hangup:**
   - Click red "Hang Up" button
   - Disposition modal appears
7. **Disposition:**
   - Select outcome (8 options)
   - Add notes (optional)
   - Click "Save Disposition"
8. **Call History:**
   - Completed call appears in sidebar
   - Shows outcome badge with color coding
   - Click "View Notes" to see saved notes
9. **Stats Update:**
   - "Calls Today" increments
   - "Talk Time" adds call duration
   - "Avg Duration" recalculates

---

## 🛠️ NPM Commands

```bash
npm run dev      # Start dev server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

---

## 🔧 Configuration

Environment variables are set in `.env`:

```
VITE_API_URL=http://54.160.220.243:3000
VITE_WS_URL=ws://54.160.220.243:3000
VITE_SIP_SERVER=54.160.220.243
VITE_SIP_PORT=5066
```

To use local API server:
```
VITE_API_URL=http://localhost:3000
```

---

## 📦 Dependencies Installed

✅ All dependencies installed successfully using:
```bash
npm install --cache /tmp/npm-cache
```

**Packages:**
- vue@3.5.22
- vue-router@4.6.3
- pinia@2.3.1
- axios@1.13.1
- tailwindcss@4.1.16
- @tailwindcss/postcss@4.1.16 (Tailwind CSS 4 PostCSS plugin)
- vite@7.1.12
- sip.js@0.21.2 (Phase 3)
- socket.io-client@4.8.1 (Phase 3)

---

## 📁 Project Structure

```
irisx-agent-desktop/
├── src/
│   ├── components/
│   │   ├── AgentStatusSelector.vue    ✅ Status dropdown
│   │   ├── CallDispositionModal.vue   ✅ Post-call form
│   │   └── Softphone.vue              ✅ Dial pad & controls
│   ├── views/
│   │   ├── auth/
│   │   │   └── Login.vue              ✅ Agent login
│   │   └── agent/
│   │       └── AgentDashboard.vue     ✅ Main dashboard
│   ├── router/index.js                ✅ Vue Router + guards
│   ├── stores/auth.js                 ✅ Pinia auth store
│   ├── utils/api.js                   ✅ Axios client
│   ├── App.vue
│   └── main.js
├── .env                               ✅ Environment config
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

---

## ⚠️ Known Issues (All Fixed!)

### NPM Cache Permissions (Fixed ✅)
If you encounter `EACCES` errors with npm:
```bash
# Use temporary cache
npm install --cache /tmp/npm-cache

# Or fix permissions (requires sudo)
sudo chown -R 507:20 "/Users/gamer/.npm"
```

### Tailwind CSS 4 PostCSS Error (Fixed ✅)
Tailwind CSS 4 requires `@tailwindcss/postcss` plugin instead of the old `tailwindcss` PostCSS plugin.

**Already fixed in this project!**
- ✅ Installed `@tailwindcss/postcss@4.1.16`
- ✅ Updated `postcss.config.js` to use `@tailwindcss/postcss`
- ✅ Dev server now runs without errors

---

## 🎯 Phase 2 Complete!

**Status:** 100% Complete ✅
**Total Code:** 1,299 lines
**Files Created:** 6 components
**Features:** Login, Dashboard, Softphone, Status, Disposition, History

---

## 📚 Next Phase

**Phase 3 - WebRTC Integration (Future):**
- SIP.js WebRTC implementation
- FreeSWITCH WSS configuration
- Real audio calls
- Incoming call handling
- Firebase presence sync

**Estimated Time:** 4-6 hours

---

## 🐛 Troubleshooting

### Dev server won't start
```bash
# Check if port 5173 is in use
lsof -i :5173

# Kill process on port
kill -9 $(lsof -t -i:5173)
```

### Login fails
- Check API server is running on 54.160.220.243:3000
- Verify backend auth endpoint: GET http://54.160.220.243:3000/health
- Check browser console for network errors

### Blank page after login
- Open browser DevTools (F12)
- Check Console tab for errors
- Verify router is loaded in Network tab

---

## ✅ Success Checklist

- [x] Dependencies installed
- [x] .env file created
- [x] Dev server tested
- [x] All components created
- [x] Router configured
- [x] Auth guards working
- [x] DEMO mode functional

---

**Ready to develop!** 🚀

Run `npm run dev` and start testing the Agent Desktop.
