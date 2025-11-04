# IRISX Voice Call Testing Guide
**Date:** November 4, 2025
**Status:** Ready for Manual Testing
**Critical Gap:** Voice has NEVER been tested end-to-end

---

## Why This Is Critical

According to the project bible and gap analysis:
- Voice calling was supposed to be the CORE feature
- All code exists (FreeSWITCH, Twilio integration, API endpoints)
- **ZERO end-to-end tests have been run**
- High probability voice doesn't work without testing

---

## Prerequisites

###1. Twilio Account Configuration

**Check if Twilio is configured:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "cat /usr/local/freeswitch/conf/directory/default/twilio.xml"
```

**Expected:** SIP gateway configuration with:
- Twilio SIP domain
- Auth credentials
- Register settings

**If missing:** Need to configure Twilio SIP trunk in FreeSWITCH

### 2. Phone Number Provisioned

**Check for active phone numbers:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD=5cdce73ae642767beb8bac7085ad2bf2 psql \
   -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
   -U irisx_admin -d irisx_prod \
   -c 'SELECT id, tenant_id, phone_number, status FROM phone_numbers;'"
```

**If no numbers exist:** Need to provision a Twilio number first via `/v1/phone-numbers`

### 3. Valid API Key

**API keys exist but you need the plaintext key (not the hash).**

**Option A: Create new API key via customer portal**
1. Go to https://app.tazzi.com
2. Login with existing credentials
3. Navigate to Settings → API Keys
4. Click "Create New Key"
5. Copy the key (shown only once!)

**Option B: Create via API (if you have JWT token)**
```bash
# Login first to get JWT
TOKEN=$(curl -s -X POST http://3.83.53.69:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"voicetest@irisx.com","password":"ACTUAL_PASSWORD"}' \
  | jq -r '.token')

# Create API key
curl -X POST http://3.83.53.69:3000/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Voice Test - Nov 4","description":"For end-to-end voice testing"}' | jq
```

---

## Test 1: Make Outbound Call

### Step 1: Prepare Test

**What we're testing:**
1. API accepts POST /v1/calls
2. Call record created in database
3. FreeSWITCH ESL command executes
4. Call connects to Twilio
5. Twilio dials destination number
6. CDR written to database

### Step 2: Execute Call

```bash
# Replace with your actual API key
API_KEY="irisx_live_XXXXXXXXXXXXXXXXXXXXXXX"

# Replace with your phone number to receive the test call
YOUR_PHONE="+1XXXXXXXXXX"

# Replace with the from number (must be provisioned in phone_numbers table)
FROM_NUMBER="+1XXXXXXXXXX"

curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"to\": \"$YOUR_PHONE\",
    \"from\": \"$FROM_NUMBER\",
    \"record\": true
  }" | jq
```

**Expected Success Response:**
```json
{
  "id": 123,
  "call_sid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "initiated",
  "from_number": "+1XXXXXXXXXX",
  "to_number": "+1XXXXXXXXXX",
  "initiated_at": "2025-11-04T17:30:00.000Z"
}
```

### Step 3: Verify Call Progress

**Check PM2 logs for API activity:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "pm2 logs irisx-api --lines 50 | grep -i 'call\|freesw'"
```

**Look for:**
- ✅ "📞 Originating call via FreeSWITCH"
- ✅ "FreeSWITCH: Call originated successfully"
- ❌ Any errors about ESL connection
- ❌ Any errors from FreeSWITCH

**Check FreeSWITCH logs on telephony server:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo tail -100 /usr/local/freeswitch/log/freeswitch.log | grep -i 'twilio\|outbound\|originate'"
```

**Look for:**
- ✅ "EXECUTE sofia/gateway/twilio/+1XXXXXXXXXX"
- ✅ "Twilio SIP 200 OK"
- ✅ "Channel answered"
- ❌ "503 Service Unavailable" (Twilio auth failed)
- ❌ "No route to host" (network issue)

### Step 4: Verify Call Record

**Check database for call record:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD=5cdce73ae642767beb8bac7085ad2bf2 psql \
   -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
   -U irisx_admin -d irisx_prod \
   -c 'SELECT call_sid, status, from_number, to_number, duration, initiated_at, answered_at, ended_at FROM calls ORDER BY initiated_at DESC LIMIT 5;'"
```

**Expected:**
- Call record exists with `status = 'ringing'` or `status = 'in-progress'`
- After call ends, status should update to `'completed'`

### Step 5: Verify CDR Written

**Check call_logs table:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD=5cdce73ae642767beb8bac7085ad2bf2 psql \
   -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
   -U irisx_admin -d irisx_prod \
   -c 'SELECT event_type, created_at FROM call_logs ORDER BY created_at DESC LIMIT 10;'"
```

**Expected events:**
- `call.initiated`
- `call.ringing`
- `call.answered`
- `call.completed`

### Step 6: Verify Recording (if enabled)

**Check S3 for recording file:**
```bash
aws s3 ls s3://irisx-prod-recordings/recordings/ --recursive | tail -5
```

**Expected:**
- File named: `<call_sid>.wav` or `<call_sid>.mp3`
- File size > 0 bytes

---

## Test 2: IVR Flow

### Step 1: Create IVR Flow

**Check if IVR flows exist:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "PGPASSWORD=5cdce73ae642767beb8bac7085ad2bf2 psql \
   -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
   -U irisx_admin -d irisx_prod \
   -c 'SELECT id, name, steps FROM ivr_flows LIMIT 3;'"
```

**Create simple IVR flow via API:**
```bash
curl -X POST http://3.83.53.69:3000/v1/ivr/flows \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "name": "Test IVR",
    "steps": [
      {
        "action": "say",
        "text": "Welcome to IRISX. Press 1 for sales, press 2 for support."
      },
      {
        "action": "gather",
        "numDigits": 1,
        "timeout": 5
      },
      {
        "action": "switch",
        "input": "{{Digits}}",
        "cases": {
          "1": [{"action": "say", "text": "Transferring to sales"}],
          "2": [{"action": "say", "text": "Transferring to support"}]
        }
      }
    ]
  }' | jq
```

### Step 2: Make Call with IVR

```bash
curl -X POST http://3.83.53.69:3000/v1/calls \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"to\": \"$YOUR_PHONE\",
    \"from\": \"$FROM_NUMBER\",
    \"ivr_flow_id\": 1
  }" | jq
```

### Step 3: Verify IVR Execution

**Answer the call and:**
1. Listen for IVR prompt
2. Press a digit (1 or 2)
3. Verify correct action taken

**Check logs:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo tail -100 /usr/local/freeswitch/log/freeswitch.log | grep -i 'DTMF\|gather\|playback'"
```

---

## Test 3: Inbound Call (Requires Twilio Configuration)

**This test requires:**
1. Twilio phone number configured
2. Twilio webhook pointing to: `http://3.83.53.69:3000/v1/webhooks/twilio/voice`
3. Number mapped in phone_numbers table

**Steps:**
1. Call the Twilio number from your phone
2. Verify webhook received
3. Verify FreeSWITCH processes call
4. Verify call routed to agent

---

## Common Issues & Solutions

### Issue 1: "No active phone number configured"

**Cause:** No phone numbers in `phone_numbers` table for this tenant

**Solution:**
```bash
# Provision a Twilio number first
curl -X POST http://3.83.53.69:3000/v1/phone-numbers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"area_code": "713"}' | jq
```

### Issue 2: "FreeSWITCH connection failed"

**Cause:** ESL (Event Socket Library) connection down

**Check FreeSWITCH is running:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo systemctl status freeswitch"
```

**Check ESL port is open:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo netstat -tlnp | grep 8021"
```

**Expected:** Port 8021 listening

### Issue 3: "503 Service Unavailable" from Twilio

**Cause:** Twilio SIP credentials incorrect or trunk not configured

**Check Twilio gateway config:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo /usr/local/freeswitch/bin/fs_cli -x 'sofia status gateway twilio'"
```

**Expected:** Status = REGED (registered)

**If not registered:**
1. Check credentials in `/usr/local/freeswitch/conf/directory/default/twilio.xml`
2. Verify Twilio account has SIP trunk enabled
3. Check Twilio IP ACL allows AWS EC2 IP (54.160.220.243)

### Issue 4: No recording file in S3

**Causes:**
1. `record: true` not set in call request
2. S3 permissions issue
3. FreeSWITCH recording module not loaded

**Check S3 permissions:**
```bash
aws s3api get-bucket-acl --bucket irisx-prod-recordings
```

**Check FreeSWITCH recording module:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 \
  "sudo /usr/local/freeswitch/bin/fs_cli -x 'module_exists mod_shout'"
```

---

## Success Criteria

✅ **Test 1 PASSED:**
- API returns 200 with call_sid
- Phone rings
- Call connects
- Call record in database with correct status
- CDR events written
- Recording uploaded to S3 (if enabled)

✅ **Test 2 PASSED:**
- IVR prompts play
- DTMF digits captured
- Correct action taken based on input

✅ **Test 3 PASSED:**
- Inbound call received
- Webhook processed
- Call routed correctly

---

## Next Steps After Testing

If tests pass:
- ✅ Document capacity limits
- ✅ Run load testing (k6 scripts)
- ✅ Set up monitoring for call quality

If tests fail:
- ❌ Debug issues (see Common Issues above)
- ❌ Fix configuration
- ❌ Re-test
- ❌ DO NOT proceed to load testing until basic calls work

---

## Automated Testing Script

I can create an automated test script, but it requires:
1. Valid API key (plaintext)
2. Provisioned phone number
3. Destination phone number for testing

Would you like me to create this script?

