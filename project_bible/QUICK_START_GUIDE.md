# IRIS Quick Start Guide - Optimized for AI-Assisted Development

**Purpose:** Get Claude building code FAST. Everything optimized for Ryan + Claude development.

---

## 🚀 Getting Started (2 Minutes)

### If Claude Just Woke Up:

**Say this to Claude:**
```
Read QUICK_START_GUIDE.md and let's start building IRIS
```

**Claude will:**
1. Understand the full context (5 seconds)
2. Know exactly what to build (tech stack locked in)
3. Start coding immediately (no questions about architecture)

---

## 📁 File Organization (Optimized for Claude)

### **Critical Files (In Reading Order):**

```
ROOT/
├── QUICK_START_GUIDE.md          ⭐ YOU ARE HERE (read first)
├── SESSION_RECOVERY.md            ⭐ If Claude crashes (5 min read)
├── 00_TECH_STACK_SUMMARY.md       ⭐ Final tech decisions (2 min)
├── 00_MASTER_CHECKLIST.md         ⭐ 500+ tasks (your todo list)
├── PROVIDER_FLEXIBILITY.md        ℹ️ Multi-provider flexibility
├── README.md                      ℹ️ Project overview
│
└── project_bible/                 📚 Reference docs (25 guides)
    ├── 01_START_HERE_Tech_Stack_Development_Order.md
    ├── 02_README_Platform_Overview.md
    ├── 03_Multi_Channel_Architecture.md
    ├── 04_Data_Import_Contact_API.md
    └── ... 21 more comprehensive guides
```

**Why This Order Works:**
1. **QUICK_START_GUIDE.md** - Tells Claude how to help you (30 sec)
2. **SESSION_RECOVERY.md** - Quick context if crash (5 min)
3. **00_TECH_STACK_SUMMARY.md** - Tech decisions (2 min)
4. **00_MASTER_CHECKLIST.md** - What to build (reference)
5. **project_bible/** - Deep implementation details (when needed)

---

## 🎯 How to Work With Claude

### **Pattern 1: Start New Task**

**You say:**
```
Let's work on Week 2: Database Schema. Create the PostgreSQL migrations.
```

**Claude will:**
1. Read relevant docs (IRIS_Authentication_Identity_RBAC.md, etc.)
2. Generate complete migration files
3. Test the SQL
4. Give you the code

**No back-and-forth. Just code.**

---

### **Pattern 2: Continue Previous Work**

**You say:**
```
Continue from where we left off
```

**Claude will:**
1. Check the checklist for last completed item
2. Read context from previous messages
3. Continue next task
4. Generate code

---

### **Pattern 3: Jump to Specific Feature**

**You say:**
```
Let's build the Hono.js API with POST /v1/calls endpoint
```

**Claude will:**
1. Read API specs from docs
2. Generate Hono.js code
3. Add TypeScript types
4. Include tests
5. Give you working code

---

### **Pattern 4: Fix/Debug**

**You say:**
```
The API is returning 500 errors. Here's the error log: [paste error]
```

**Claude will:**
1. Analyze the error
2. Read relevant code context
3. Identify the issue
4. Generate the fix
5. Explain what was wrong

---

## 🛠️ Tech Stack (LOCKED IN)

**Don't ask Claude about these - they're decided:**

```javascript
Frontend:  Vue 3.5 + Vite 6 + Tailwind CSS 4
Backend:   Node.js 22 + Hono.js
Database:  AWS RDS PostgreSQL
Cache:     AWS ElastiCache Redis
Storage:   AWS S3 + CloudFront
Real-time: Firebase (FCM + Realtime DB)
Telephony: FreeSWITCH on EC2
Carriers:  Twilio + Telnyx
```

**If Claude suggests changes:** Politely say "tech stack is locked in, let's use what we have"

---

## 📋 Development Order (Follow This)

### **Phase 0: Foundations (Weeks 1-4)**
1. AWS setup (RDS, ElastiCache, EC2)
2. Database schema (PostgreSQL migrations)
3. FreeSWITCH setup (Packer AMI, Twilio trunk)
4. Hono.js API (first endpoint working)

**Goal:** First call works end-to-end

---

### **Phase 1: Core Calling (Weeks 5-12)**
1. TTS integration (OpenAI, cache in S3)
2. Call control verbs (Say, Play, Gather, Record, Transfer)
3. Webhook system (HMAC, retries)
4. Vue 3 customer portal (auth, dashboard, call logs)
5. Documentation (Mintlify)
6. Beta launch (5 customers)

**Goal:** Production-ready calling platform

---

### **Phase 2: Queues & Agents (Weeks 13-18)**
1. Redis queue system
2. Agent presence (WebSocket)
3. Skills-based routing
4. Vue 3 agent desktop (WebRTC softphone)
5. Supervisor dashboard

**Goal:** Call center ACD functional

---

### **Phase 3: Campaigns & Billing (Weeks 19-26)**
1. Campaign management + CSV upload
2. Progressive/predictive dialer
3. Billing engine + Stripe
4. Analytics (ClickHouse)

**Goal:** First paying customer

---

### **Phase 4: Multi-Channel (Weeks 27-30)**
1. SMS (Telnyx, Twilio)
2. Email (AWS SES, Postmark)
3. Social (Facebook, Twitter, Discord)
4. Unified API

**Goal:** All channels working

---

### **Phase 5-6: Enterprise & Advanced (Weeks 31-34)**
1. Multi-carrier + multi-region
2. Security (encryption, SOC 2)
3. AI features (transcription, summaries)
4. Video calling

**Goal:** Enterprise-ready, production launch

---

## 💡 Tips for Fast Development

### **1. Be Specific With Tasks**

**❌ Bad (vague):**
```
"Build the API"
```

**✅ Good (specific):**
```
"Build Hono.js API with POST /v1/calls endpoint.
Accept: to, from, message.
Publish to NATS.
Return call_id.
Add TypeScript types."
```

**Why:** Claude generates better code with specifics.

---

### **2. Reference the Checklist**

**✅ Good:**
```
"Let's work on Week 2, Task: Design users table with RBAC"
```

**Why:** Checklist has all the details, Claude reads it automatically.

---

### **3. Provide Error Context**

**✅ Good:**
```
"API returning 500 error when calling POST /v1/calls.
Error: 'Cannot read property id of undefined'
Here's my code: [paste code]"
```

**Why:** Claude can fix it in one shot with full context.

---

### **4. Ask for Tests**

**✅ Good:**
```
"Build the database schema AND write Jest tests to verify it"
```

**Why:** Catch bugs early, move faster.

---

### **5. Request Code Comments**

**✅ Good:**
```
"Build the TTS service with detailed comments explaining the caching strategy"
```

**Why:** You'll understand it later, easier to modify.

---

## 🔥 Fast Iteration Pattern

### **Step 1: Pick Task (30 seconds)**
```
You: "Let's work on Week 4: Build Hono.js API with POST /v1/calls endpoint"
```

### **Step 2: Claude Generates Code (2 minutes)**
```
Claude: [reads API spec, generates complete Hono.js code with types, tests]
```

### **Step 3: You Test (5 minutes)**
```
You: Run the code, test it
```

### **Step 4: Fix Issues (2 minutes)**
```
You: "Getting CORS error, fix it"
Claude: [updates code with CORS middleware]
```

### **Step 5: Mark Complete (10 seconds)**
```
You: Check off task in 00_MASTER_CHECKLIST.md
```

### **Total Time: ~10 minutes per task**

**At this pace:**
- 6 tasks/hour
- 48 tasks/day (8 hours)
- 240 tasks/week
- **500 tasks = ~2 weeks of focused work**

(Realistically: 4-8 weeks with testing, debugging, learning)

---

## 🎯 What Makes This Setup Optimal for AI

### **1. Clear Tech Stack (No Decisions Needed)**
- Claude doesn't waste time asking "should we use Express or Hono?"
- Answer is in TECH_STACK_SUMMARY.md
- Just builds with Hono.js immediately

### **2. Comprehensive Specs (No Guessing)**
- Database schemas fully designed
- API endpoints fully specified
- Architecture decisions made
- Claude just implements

### **3. Organized Checklist (Clear Next Steps)**
- 500+ tasks in dependency order
- Each task is specific
- No "what should I build next?" delays
- Just follow the list top to bottom

### **4. Reference Docs Available (Deep Context)**
- 25 comprehensive guides
- 1,100+ pages of specs
- Code examples throughout
- Claude reads when needed

### **5. Flexible Provider System (No Rewrites)**
- Multi-provider from day 1
- Add/remove providers easily
- No "we need to refactor everything" later
- Built right the first time

---

## 🚨 Common Patterns

### **When Claude Crashes Mid-Task:**

**You say:**
```
Read SESSION_RECOVERY.md. We were working on [task name]. Continue.
```

**Claude will:**
1. Read recovery doc (5 seconds)
2. Understand context
3. Continue exactly where left off

---

### **When You Return After Days:**

**You say:**
```
Read SESSION_RECOVERY.md. What did we finish? What's next?
```

**Claude will:**
1. Check checklist for completed tasks
2. Identify next task
3. Explain what to build next
4. Start coding when you're ready

---

### **When You Want to Skip Ahead:**

**You say:**
```
Skip Phase 2 for now. Let's build the billing system (Phase 3).
```

**Claude will:**
1. Jump to Phase 3 tasks
2. Note dependencies (may need Phase 0-1 done first)
3. Build what's possible
4. Flag missing dependencies

---

### **When You're Stuck:**

**You say:**
```
I don't understand how the provider abstraction layer works. Explain it.
```

**Claude will:**
1. Read PROVIDER_FLEXIBILITY.md
2. Explain in simple terms
3. Show code examples
4. Answer follow-up questions

---

## 📊 Progress Tracking

### **How to Track Progress:**

**Option 1: Checklist (Manual)**
```
Edit 00_MASTER_CHECKLIST.md
Change [ ] to [x] as you complete tasks
```

**Option 2: Ask Claude**
```
You: "What % complete are we?"
Claude: [counts checked items, calculates percentage]
```

**Option 3: Git Commits**
```
Commit after each major task
Git log shows progress
```

---

## 🎓 Learning Resources (If Needed)

### **If You're New to These Technologies:**

**Hono.js:** https://hono.dev/docs
**Vue 3:** https://vuejs.org/guide/introduction.html
**FreeSWITCH:** https://freeswitch.org/confluence/
**PostgreSQL:** https://www.postgresql.org/docs/

**But honestly:** Claude knows all of these. Just ask Claude to explain as you go.

---

## ✅ Pre-Flight Checklist (Before Starting)

**Do these once before building:**

- [ ] Read this file (QUICK_START_GUIDE.md) ← You just did!
- [ ] Read SESSION_RECOVERY.md (5 minutes)
- [ ] Read 00_TECH_STACK_SUMMARY.md (2 minutes)
- [ ] Open 00_MASTER_CHECKLIST.md (your todo list)
- [ ] Set up AWS account (if needed)
- [ ] Set up Firebase account (if needed)
- [ ] Install Node.js 22 LTS
- [ ] Install PostgreSQL client (psql)
- [ ] Install Redis client (redis-cli)

**Then you're ready! 🚀**

---

## 🚀 Start Building Now

### **Say to Claude:**

**Option 1: Start from beginning**
```
"Let's start Phase 0, Week 1: AWS infrastructure setup"
```

**Option 2: Jump to coding**
```
"Skip setup for now. Let's build the Hono.js API first."
```

**Option 3: Build something specific**
```
"Let's build the PostgreSQL database schema for users and tenants"
```

**Claude will:**
1. Read the relevant docs (automatic)
2. Generate complete working code
3. Include tests
4. Explain what it does
5. Give you next steps

---

## 📝 Summary

### **What Makes This Optimal:**

1. ✅ **No architecture decisions** - All decided, documented
2. ✅ **Clear next steps** - 500+ tasks in order
3. ✅ **Comprehensive specs** - Every detail documented
4. ✅ **Fast iteration** - Specific tasks → Claude generates → You test → Repeat
5. ✅ **Easy recovery** - If crash, SESSION_RECOVERY.md brings Claude back
6. ✅ **Flexible system** - Multi-provider, no lock-in
7. ✅ **AI-friendly code** - Hono.js, clean patterns

### **Your Job:**
- Pick tasks from checklist
- Tell Claude what to build
- Test the code
- Provide feedback/fixes
- Check off completed tasks

### **Claude's Job:**
- Read relevant docs automatically
- Generate working code
- Add tests
- Explain implementations
- Fix bugs
- Answer questions

### **Together:** Build IRIS in 4-8 weeks of focused work 🚀

---

## 🎯 Ready to Start?

**Say:**
```
"Let's start Phase 0, Week 1: Set up AWS RDS PostgreSQL"
```

**Or:**
```
"What's the first task we should work on?"
```

**Or:**
```
"Let's build [specific thing you want to build]"
```

**Let's go! 🔥**
