# FreeSWITCH WebSocket Binding Fix

**Date:** October 31, 2025
**Issue:** WebSocket code 1006 errors preventing WebRTC registration
**Root Cause:** FreeSWITCH WebSocket only listening on internal IP (10.0.1.213)

---

## Problem Diagnosis

### Symptoms
- WebSocket connections fail with code 1006 (abnormal closure)
- Browser WebRTC client can't register with FreeSWITCH
- SIP.js shows "Transport not connected" errors

### Investigation Results

**Port Listening Status:**
```bash
$ sudo ss -tuln | grep -E '5066|7443'
tcp   LISTEN 0      64    10.0.1.213:5066      0.0.0.0:*     ← INTERNAL IP ONLY
tcp   LISTEN 0      64    10.0.1.213:7443      0.0.0.0:*     ← INTERNAL IP ONLY
```

**FreeSWITCH Status:**
```bash
$ fs_cli -x 'sofia status profile internal'
WS-BIND-URL     sip:mod_sofia@10.0.1.213:5066;transport=ws
WSS-BIND-URL    sips:mod_sofia@10.0.1.213:7443;transport=wss
```

**SIP Registrations:**
```bash
$ fs_cli -x 'sofia status profile internal reg'
Total items returned: 0   ← NO REGISTRATIONS
```

---

## Root Cause

FreeSWITCH's internal SIP profile is configured with:
```xml
<param name="sip-ip" value="$${local_ip_v4}"/>  <!-- 10.0.1.213 -->
```

When `sip-ip` is set to a specific internal IP, WebSocket bindings (`ws-binding` and `wss-binding`) also bind to that IP instead of `0.0.0.0`.

This means:
- WebSockets are NOT accessible from the internet
- Nginx proxy on port 8066 can't reach FreeSWITCH WebSocket
- External clients (browsers) can't connect

---

## Solution

### Option 1: Use Nginx Proxy (RECOMMENDED - Already Configured)

**Current Setup:**
- Nginx listening on `0.0.0.0:8066` ✅
- Proxies to `127.0.0.1:5066` ❌ (FreeSWITCH not listening there)

**Fix Nginx Configuration:**

Edit `/etc/nginx/sites-available/freeswitch-ws`:
```nginx
server {
    listen 8066;
    server_name _;

    location / {
        proxy_pass http://10.0.1.213:5066;   # Use internal IP instead of 127.0.0.1
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

**Apply:**
```bash
sudo systemctl reload nginx
```

**Update WebRTC service to use Nginx:**
```javascript
// irisx-agent-desktop/src/services/webrtc.js
const transportOptions = {
  server: `ws://54.160.220.243:8066`,  // Use Nginx proxy
}
```

### Option 2: Bind FreeSWITCH WebSocket to 0.0.0.0 (ADVANCED)

**Edit SIP Profile:**
```bash
sudo nano /usr/local/freeswitch/etc/freeswitch/sip_profiles/internal.xml
```

**Change:**
```xml
<!-- OLD -->
<param name="ws-binding"  value=":5066"/>
<param name="wss-binding" value=":7443"/>

<!-- NEW -->
<param name="ws-binding"  value="0.0.0.0:5066"/>
<param name="wss-binding" value="0.0.0.0:7443"/>
```

**Restart FreeSWITCH:**
```bash
sudo systemctl restart freeswitch
```

**Verify:**
```bash
sudo ss -tuln | grep -E '5066|7443'
# Should show: 0.0.0.0:5066 and 0.0.0.0:7443
```

---

## Testing After Fix

### 1. Test WebSocket Connection

From local machine:
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  http://54.160.220.243:8066
```

**Expected:** HTTP 101 Switching Protocols

### 2. Test SIP Registration from Browser

Open Agent Desktop (http://localhost:5174), click "Connect":

**Browser Console Should Show:**
```
🔌 Transport connected
🔥 Attempting SIP registration for: 1000@54.160.220.243
✅ Registered with SIP server
```

**FreeSWITCH Should Show:**
```bash
$ fs_cli -x 'sofia status profile internal reg'
Registrations:
=================================================================================================
Call-ID:        xxxxx
User:           1000@54.160.220.243
Contact:        "Agent 1000" <sip:xxxxx@xxx.xxx.xxx.xxx;transport=ws>
Agent:          SIP.js/0.21.2
Status:         Registered(UDP-NAT)
=================================================================================================
Total items returned: 1
```

### 3. Test Outbound Call

In Agent Desktop:
1. Enter phone number: `17137057323`
2. Click "Call"
3. Phone should ring within 2-3 seconds

**Expected Call Flow:**
```
Browser (WebRTC)
  → ws://54.160.220.243:8066 (Nginx)
  → ws://10.0.1.213:5066 (FreeSWITCH)
  → SIP INVITE
  → Twilio SIP Trunk
  → PSTN (713-705-7323)
```

---

## Current Status

- ✅ FreeSWITCH WebSocket configured (ports 5066, 7443)
- ✅ Nginx proxy installed and running (port 8066)
- ✅ AWS Security Group rules added (5066, 7443, 8066)
- ✅ WebRTC service code complete (438 lines)
- ✅ Softphone component integrated
- ❌ **Nginx needs configuration update** (proxy to 10.0.1.213 instead of 127.0.0.1)

---

## Next Steps

1. **Update Nginx proxy target** from 127.0.0.1 to 10.0.1.213
2. **Reload Nginx** to apply changes
3. **Test WebSocket connection** from browser
4. **Verify SIP registration** in FreeSWITCH
5. **Make test call** to confirm end-to-end functionality

---

## Files to Update

### On FreeSWITCH Server (54.160.220.243):
- `/etc/nginx/sites-available/freeswitch-ws` - Update proxy_pass to use 10.0.1.213

### On Local Machine:
- `irisx-agent-desktop/src/services/webrtc.js` - Already configured for ws://54.160.220.243:8066 ✅

---

## Commands Cheat Sheet

**SSH to FreeSWITCH Server:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
```

**Check WebSocket Ports:**
```bash
sudo ss -tuln | grep -E '5066|7443|8066'
```

**Check SIP Registrations:**
```bash
sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status profile internal reg'
```

**Check FreeSWITCH Logs:**
```bash
sudo tail -f /usr/local/freeswitch/var/log/freeswitch/freeswitch.log
```

**Reload Nginx:**
```bash
sudo systemctl reload nginx
```

**Restart FreeSWITCH:**
```bash
sudo systemctl restart freeswitch
```

---

**Last Updated:** October 31, 2025
**Status:** Fix identified, pending Nginx configuration update
