# Voice Call Testing Plan - P0 BLOCKER
**Date:** November 3, 2025
**Status:** Ready to Execute
**Priority:** P0 - Must complete before MVP launch

---

## Overview

The voice channel has **never been tested end-to-end** despite being code-complete. This is a **BLOCKER** for production launch.

**Risk Level:** HIGH - Voice may not work in production
**Estimated Time:** 2-4 hours
**Test Environment:** Production (3.83.53.69 API + 54.160.220.243 FreeSWITCH)

---

## Pre-Test Checklist

### Infrastructure Status
- [x] API Server running on 3.83.53.69
- [x] FreeSWITCH running on 54.160.220.243
- [x] PostgreSQL database accessible
- [x] Redis cache accessible
- [ ] Twilio trunk configured and active
- [ ] SIP credentials verified in FreeSWITCH
- [ ] Security group rules allow SIP/RTP traffic

### API Endpoints Available
- [x] POST /v1/calls - Create outbound call
- [x] POST /v1/calls/:id/answer - Answer call
- [x] POST /v1/calls/:id/hangup - End call
- [x] GET /v1/calls/:id - Get call details
- [x] GET /v1/calls - List calls with CDR

---

## Test Plan

### Test 1: Basic Outbound Call via API ✅ PASS
**Objective:** Verify POST /v1/calls endpoint creates a call and reaches FreeSWITCH

**Steps:**
1. Get valid JWT token or API key for tenant
2. Make POST request to /v1/calls with:
   ```json
   {
     "to": "+17137057323",
     "from": "+15551234567",
     "twiml": "<Response><Say>This is a test call from IRISX.</Say></Response>"
   }
   ```
3. Check HTTP response (should be 201 with call_sid)
4. Check database for new call record
5. Monitor FreeSWITCH logs for INVITE

**Expected Results:**
- HTTP 201 response with call_sid
- Call record inserted in `calls` table
- FreeSWITCH receives INVITE from API
- Call state = 'initiated'

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 2: FreeSWITCH Receives Call ✅ PASS
**Objective:** Verify FreeSWITCH processes the INVITE correctly

**Steps:**
1. SSH into FreeSWITCH server (54.160.220.243)
2. Run `fs_cli` to monitor logs in real-time
3. Trigger outbound call from Test 1
4. Watch for:
   - INVITE received
   - Dialplan executed
   - Bridge attempt to Twilio trunk

**Expected Results:**
- FreeSWITCH logs show INVITE
- Dialplan matches and executes
- SIP user 1000 is resolved
- Bridge command executed to Twilio gateway

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 3: Call Connects to PSTN (Twilio/Telnyx) ❌ NOT TESTED
**Objective:** Verify call reaches the destination phone number via Twilio

**Steps:**
1. Ensure Twilio account has active trunk
2. Verify Twilio SIP credentials in FreeSWITCH `/usr/local/freeswitch/conf/sip_profiles/external.xml`
3. Make test call to real phone number (+17137057323)
4. Answer the phone and listen for TTS message
5. Check Twilio console for call logs

**Expected Results:**
- Phone rings at destination number
- TTS message plays: "This is a test call from IRISX"
- Call duration recorded
- Twilio shows successful call completion

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 4: CDR Written to Database ❌ NOT TESTED
**Objective:** Verify Call Detail Records are persisted after call ends

**Steps:**
1. Complete Test 3 (make a real call)
2. Let call complete normally (TTS finishes, call hangs up)
3. Query database: `SELECT * FROM calls WHERE to_number = '+17137057323' ORDER BY created_at DESC LIMIT 1;`
4. Check CDR fields:
   - call_sid (UUID)
   - status ('completed', 'failed', 'busy', 'no-answer')
   - duration_seconds
   - start_time, end_time
   - recording_url (if recording enabled)

**Expected Results:**
- Call record exists in database
- Status reflects actual outcome ('completed')
- Duration matches actual call length
- Timestamps are accurate

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 5: IVR Flow with DTMF ❌ NOT TESTED
**Objective:** Test Interactive Voice Response with user input

**Steps:**
1. Create call with IVR TwiML:
   ```xml
   <Response>
     <Gather numDigits="1" action="https://3.83.53.69:3000/v1/calls/gather">
       <Say>Press 1 for sales, 2 for support</Say>
     </Gather>
   </Response>
   ```
2. Make call to test phone
3. Press "1" on phone keypad
4. Verify webhook receives DTMF digit
5. Check database for updated call state

**Expected Results:**
- TTS plays menu options
- DTMF digit "1" is captured
- Webhook POST to /v1/calls/gather with `Digits=1`
- Call flow branches based on input

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 6: Call Recording ❌ NOT TESTED
**Objective:** Verify calls can be recorded and played back

**Steps:**
1. Create call with recording enabled:
   ```json
   {
     "to": "+17137057323",
     "from": "+15551234567",
     "record": true,
     "twiml": "<Response><Say>This call is being recorded.</Say><Pause length=\"3\"/></Response>"
   }
   ```
2. Complete the call
3. Check S3 bucket `irisx-recordings` for .wav file
4. Query database for `recording_url`
5. Play back recording via URL

**Expected Results:**
- Recording file saved to S3
- File format: .wav or .mp3
- recording_url populated in database
- Audio playback works correctly
- Recording duration matches call duration

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 7: Call Control Verbs ❌ NOT TESTED
**Objective:** Test TwiML-like call control commands

**Test 7a: Transfer (Blind)**
```xml
<Response>
  <Dial>
    <Number>+17137057323</Number>
  </Dial>
</Response>
```

**Test 7b: Conference**
```xml
<Response>
  <Conference>TestRoom</Conference>
</Response>
```

**Test 7c: Queue with Music on Hold**
```xml
<Response>
  <Enqueue waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical">support</Enqueue>
</Response>
```

**Expected Results:**
- Each verb executes correctly
- Call state transitions properly
- Audio streams work (MOH, conference)

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

### Test 8: Error Handling ❌ NOT TESTED
**Objective:** Verify graceful handling of failure scenarios

**Test 8a: Invalid Phone Number**
```json
{"to": "+1234", "from": "+15551234567"}
```
Expected: 400 Bad Request - "Invalid phone number"

**Test 8b: No Twilio Trunk Available**
- Temporarily disable Twilio credentials
- Attempt call
Expected: 500 Internal Server Error, call status = 'failed'

**Test 8c: Call Timeout**
- Call number that doesn't answer
- Wait for timeout (30 seconds)
Expected: Status = 'no-answer', proper cleanup

**Expected Results:**
- Errors logged to database
- HTTP status codes are correct
- No memory leaks or hanging connections
- FreeSWITCH cleans up failed calls

**Actual Results:**
- [To be filled during testing]

**Status:** ⏳ Pending

---

## Test Execution Log

### Session 1: [Date/Time]
**Tester:** [Name]
**Environment:** Production

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Basic Outbound Call | ⏳ | |
| 2 | FreeSWITCH Receives Call | ⏳ | |
| 3 | PSTN Connection | ⏳ | |
| 4 | CDR Database Write | ⏳ | |
| 5 | IVR with DTMF | ⏳ | |
| 6 | Call Recording | ⏳ | |
| 7 | Call Control Verbs | ⏳ | |
| 8 | Error Handling | ⏳ | |

---

## Issues Found

### Critical Issues (P0)
*None yet - to be filled during testing*

### High Priority Issues (P1)
*None yet - to be filled during testing*

### Medium Priority Issues (P2)
*None yet - to be filled during testing*

---

## Configuration Checklist

### FreeSWITCH Configuration Files to Verify
- [ ] `/usr/local/freeswitch/conf/sip_profiles/external.xml` - Twilio gateway config
- [ ] `/usr/local/freeswitch/conf/dialplan/default.xml` - Routing rules
- [ ] `/usr/local/freeswitch/conf/directory/default/1000.xml` - SIP user for API calls
- [ ] `/usr/local/freeswitch/conf/autoload_configs/event_socket.conf.xml` - ESL port 8021

### Twilio Account Configuration
- [ ] Active phone number: +1555XXXXXXX (to be verified)
- [ ] SIP trunk configured and enabled
- [ ] SIP credentials match FreeSWITCH external gateway
- [ ] Allowed IP addresses include 54.160.220.243
- [ ] Billing account has credits

### AWS Security Groups
- [ ] FreeSWITCH SG allows:
  - TCP 5060 (SIP signaling)
  - UDP 5060 (SIP signaling)
  - UDP 16384-32768 (RTP media)
  - TCP 8021 from API server (ESL)
- [ ] API Server SG allows:
  - Outbound to FreeSWITCH:8021

### Database Schema
- [ ] `calls` table exists with correct columns
- [ ] Indexes on tenant_id, created_at, status
- [ ] Foreign key to `tenants` table

---

## Success Criteria

**Minimum Viable Product (MVP) Pass:**
✅ Test 1: Basic API call creation works
✅ Test 2: FreeSWITCH receives and processes calls
✅ Test 3: Calls connect to real phone numbers
✅ Test 4: CDRs written to database correctly

**Production Ready:**
✅ Test 5: IVR flows work with DTMF
✅ Test 6: Call recording and playback functional
✅ Test 7: Call control verbs execute properly
✅ Test 8: Error handling is robust

---

## Next Steps After Testing

1. **If All Tests Pass:**
   - Mark voice channel as production-ready
   - Update COMPLETION_STATUS_NOV_3_2025.md (Voice: 90% → 100%)
   - Proceed to load testing
   - Enable voice for beta customers

2. **If Tests Fail:**
   - Document all issues with severity
   - Fix critical (P0) issues immediately
   - Re-test after fixes
   - Update timeline estimate

3. **Documentation:**
   - Create VOICE_TESTING_RESULTS.md with findings
   - Update API documentation with any corrections
   - Add troubleshooting guide for common issues

---

## Test Environment Details

**API Server (3.83.53.69):**
- OS: Ubuntu 22.04
- Node.js: v22.x
- API Framework: Hono.js
- Database: PostgreSQL (RDS)
- Cache: Redis (ElastiCache)

**FreeSWITCH Server (54.160.220.243):**
- OS: Ubuntu 22.04
- FreeSWITCH: 1.10.x
- SIP Profile: external (port 5060)
- ESL Port: 8021
- RTP Range: 16384-32768

**Test Phone Number:**
- Number: +1 (713) 705-7323
- Owner: Test account
- Purpose: Receive test calls

---

**Created:** November 3, 2025
**Last Updated:** November 3, 2025
**Status:** Ready to begin testing
