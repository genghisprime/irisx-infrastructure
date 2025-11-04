# Agent Desktop Provisioning - Automated Customer Onboarding

## Problem
We manually configured FreeSWITCH extensions, dialplans, ACLs, etc. for extension 1000.
Customers can't do this - it needs to be **completely automated**.

## Solution: Auto-Provisioning System

### Customer Experience (5 Minutes Total)

**Step 1: Admin Creates Agent (Customer Portal)**
```
Customer Portal → Settings → Agents → "Add Agent"

Form:
- First Name: John
- Last Name: Doe
- Email: john@company.com
- Role: Agent (dropdown)
- Extensions to assign: 1 (default)

[Create Agent Button]
```

**Step 2: System Auto-Provisions (30 seconds)**
```
✅ Creates user in database (users table)
✅ Assigns tenant_id automatically
✅ Finds next available extension (e.g., 2001, 2002, 2003...)
✅ Generates secure random SIP password
✅ Calls FreeSWITCH provisioning API
✅ Creates SIP user XML file dynamically
✅ Creates tenant-specific dialplan rules
✅ Reloads FreeSWITCH config (mod_xml_curl or fs_cli)
✅ Sends welcome email with login link
```

**Step 3: Agent Logs In (1 minute)**
```
Agent receives email:
"Welcome to IRISX! Your Agent Desktop is ready."
[Login to Agent Desktop]

Agent clicks link → https://agent.irisx.com
Logs in with email/password
Softphone connects automatically (no config needed)
Agent can make/receive calls immediately
```

---

## Technical Architecture

### 1. Extension Pool Management

**Database Table: `agent_extensions`**
```sql
CREATE TABLE agent_extensions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  user_id INTEGER REFERENCES users(id), -- NULL = available, set = assigned
  extension VARCHAR(10) NOT NULL, -- e.g., "2001", "2002"
  sip_password VARCHAR(255) NOT NULL, -- bcrypt hashed
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, deleted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(tenant_id, extension) -- Each tenant has own extension namespace
);

-- Index for fast lookup
CREATE INDEX idx_agent_extensions_tenant_user ON agent_extensions(tenant_id, user_id);
CREATE INDEX idx_agent_extensions_available ON agent_extensions(tenant_id, user_id) WHERE user_id IS NULL;
```

**Extension Ranges by Tenant:**
- Tenant 1: Extensions 2000-2999 (1000 agents max)
- Tenant 2: Extensions 3000-3999
- Tenant 3: Extensions 4000-4999
- Formula: `base_extension = (tenant_id + 1) * 1000`

### 2. Auto-Provisioning API

**New Endpoint: POST /v1/admin/agents**

```javascript
// api/src/routes/admin-agents.js
import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { provisionFreeSWITCHExtension } from '../services/freeswitch-provisioning.js'
import { sendAgentWelcomeEmail } from '../services/email.js'

const router = new Hono()

const createAgentSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['agent', 'supervisor', 'admin']).default('agent'),
  extensions_count: z.number().min(1).max(5).default(1) // Most agents need 1
})

router.post('/v1/admin/agents', async (c) => {
  try {
    const body = await c.req.json()
    const data = createAgentSchema.parse(body)
    const tenantId = c.get('tenantId') // From JWT middleware

    // 1. Create user account
    const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10)
    const userResult = await c.get('db').query(
      `INSERT INTO users (tenant_id, email, password, first_name, last_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, email, first_name, last_name`,
      [tenantId, data.email, hashedPassword, data.first_name, data.last_name, data.role]
    )
    const user = userResult.rows[0]

    // 2. Find next available extension(s) for this tenant
    const extensionBase = (tenantId + 1) * 1000
    const availableExtensions = await c.get('db').query(
      `SELECT extension, sip_password
       FROM agent_extensions
       WHERE tenant_id = $1 AND user_id IS NULL
       ORDER BY extension ASC
       LIMIT $2`,
      [tenantId, data.extensions_count]
    )

    let extensions = availableExtensions.rows

    // 3. If no pre-created extensions, create new ones
    if (extensions.length < data.extensions_count) {
      const lastExtension = await c.get('db').query(
        `SELECT COALESCE(MAX(CAST(extension AS INTEGER)), $1) as last_ext
         FROM agent_extensions
         WHERE tenant_id = $2`,
        [extensionBase - 1, tenantId]
      )
      let nextExtNum = parseInt(lastExtension.rows[0].last_ext) + 1

      for (let i = extensions.length; i < data.extensions_count; i++) {
        const sipPassword = crypto.randomBytes(32).toString('hex')
        const hashedSipPassword = await bcrypt.hash(sipPassword, 10)

        await c.get('db').query(
          `INSERT INTO agent_extensions (tenant_id, extension, sip_password, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [tenantId, nextExtNum.toString(), hashedSipPassword]
        )

        extensions.push({ extension: nextExtNum.toString(), sip_password: sipPassword })
        nextExtNum++
      }
    }

    // 4. Assign extensions to user
    const assignedExtensions = []
    for (const ext of extensions) {
      await c.get('db').query(
        `UPDATE agent_extensions
         SET user_id = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND extension = $3`,
        [user.id, tenantId, ext.extension]
      )

      // 5. Provision in FreeSWITCH
      await provisionFreeSWITCHExtension({
        tenantId,
        extension: ext.extension,
        sipPassword: ext.sip_password,
        userName: `${data.first_name} ${data.last_name}`,
        voicemailEnabled: true
      })

      assignedExtensions.push(ext.extension)
    }

    // 6. Send welcome email
    await sendAgentWelcomeEmail({
      email: data.email,
      firstName: data.first_name,
      extensions: assignedExtensions,
      loginUrl: 'https://agent.irisx.com',
      temporaryPassword: hashedPassword // In real system, use password reset link
    })

    return c.json({
      success: true,
      agent: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        extensions: assignedExtensions
      }
    }, 201)

  } catch (error) {
    console.error('Agent creation error:', error)
    return c.json({ error: 'Failed to create agent', details: error.message }, 500)
  }
})

export default router
```

### 3. FreeSWITCH Provisioning Service

**New Service: `api/src/services/freeswitch-provisioning.js`**

```javascript
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'

const execAsync = promisify(exec)

export async function provisionFreeSWITCHExtension({
  tenantId,
  extension,
  sipPassword,
  userName,
  voicemailEnabled = true
}) {
  try {
    // 1. Create SIP user XML file
    const userXml = `
<include>
  <user id="${extension}">
    <params>
      <param name="password" value="${sipPassword}"/>
      <param name="vm-password" value="${extension}"/>
    </params>
    <variables>
      <variable name="tenant_id" value="${tenantId}"/>
      <variable name="user_context" value="default"/>
      <variable name="effective_caller_id_name" value="${userName}"/>
      <variable name="effective_caller_id_number" value="${extension}"/>
      ${voicemailEnabled ? '<variable name="voicemail_enabled" value="true"/>' : ''}
    </variables>
  </user>
</include>
`

    // 2. Write XML file to FreeSWITCH directory (via SSH or shared volume)
    const xmlPath = `/usr/local/freeswitch/etc/freeswitch/directory/default/${extension}.xml`

    // Option A: If API server has direct access (shared volume)
    await fs.writeFile(xmlPath, userXml, 'utf8')

    // Option B: If separate server, use SSH
    // await execAsync(`ssh ubuntu@54.160.220.243 "echo '${userXml.replace(/'/g, "'\\''")}' | sudo tee ${xmlPath}"`)

    // 3. Create tenant-specific dialplan (first time only)
    await createTenantDialplan(tenantId)

    // 4. Reload FreeSWITCH directory
    await execAsync('sudo /usr/local/freeswitch/bin/fs_cli -x "reloadxml"')

    console.log(`✅ Provisioned extension ${extension} for tenant ${tenantId}`)
    return { success: true, extension }

  } catch (error) {
    console.error('FreeSWITCH provisioning error:', error)
    throw new Error(`Failed to provision extension ${extension}: ${error.message}`)
  }
}

async function createTenantDialplan(tenantId) {
  const dialplanPath = `/usr/local/freeswitch/etc/freeswitch/dialplan/default/${tenantId}_tenant.xml`

  // Check if already exists
  try {
    await fs.access(dialplanPath)
    return // Already exists
  } catch {
    // Doesn't exist, create it
  }

  const dialplanXml = `
<include>
  <!-- Tenant ${tenantId} - Outbound PSTN -->
  <extension name="tenant_${tenantId}_outbound">
    <condition field="\${tenant_id}" expression="^${tenantId}$"/>
    <condition field="destination_number" expression="^([2-9]\\d{9})$">
      <action application="log" data="INFO Tenant ${tenantId} calling PSTN: $1"/>
      <action application="set" data="effective_caller_id_number=\${outbound_caller_id_number}"/>
      <action application="bridge" data="sofia/external/$1@54.160.220.243"/>
    </condition>
  </extension>

  <!-- Tenant ${tenantId} - Inbound from PSTN -->
  <extension name="tenant_${tenantId}_inbound">
    <condition field="destination_number" expression="^(tenant${tenantId}_\\d+)$">
      <action application="answer"/>
      <action application="sleep" data="500"/>
      <action application="set" data="tenant_id=${tenantId}"/>
      <action application="bridge" data="user/\${regex(destination_number|tenant${tenantId}_(\\d+)|%1)}@10.0.1.213"/>
    </condition>
  </extension>
</include>
`

  await fs.writeFile(dialplanPath, dialplanXml, 'utf8')
  console.log(`✅ Created dialplan for tenant ${tenantId}`)
}

export async function deprovisionFreeSWITCHExtension(extension) {
  try {
    const xmlPath = `/usr/local/freeswitch/etc/freeswitch/directory/default/${extension}.xml`
    await fs.unlink(xmlPath)
    await execAsync('sudo /usr/local/freeswitch/bin/fs_cli -x "reloadxml"')
    console.log(`✅ Deprovisioned extension ${extension}`)
    return { success: true }
  } catch (error) {
    console.error('Deprovision error:', error)
    throw error
  }
}
```

### 4. Agent Desktop Auto-Configuration

**Frontend: Automatic SIP Credentials**

The Agent Desktop needs to know:
- SIP server (wss://54.160.220.243:8066)
- Extension number
- SIP password

**Solution: API returns credentials on login**

```javascript
// api/src/routes/auth.js - Add to /v1/auth/me endpoint
router.get('/v1/auth/me', authenticateJWT, async (c) => {
  const userId = c.get('userId')

  const result = await c.get('db').query(`
    SELECT
      u.id, u.email, u.first_name, u.last_name, u.role, u.tenant_id,
      json_agg(json_build_object(
        'extension', ae.extension,
        'sip_password', ae.sip_password
      )) FILTER (WHERE ae.id IS NOT NULL) as extensions
    FROM users u
    LEFT JOIN agent_extensions ae ON ae.user_id = u.id AND ae.status = 'active'
    WHERE u.id = $1
    GROUP BY u.id
  `, [userId])

  const user = result.rows[0]

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      tenantId: user.tenant_id,
      extensions: user.extensions || [],
      sipServer: 'wss://54.160.220.243:8066' // Or from env config
    }
  })
})
```

**Frontend: Auto-connect on login**

```javascript
// irisx-agent-desktop/src/stores/auth.js
async function fetchUser() {
  const response = await apiClient.get('/v1/auth/me')
  user.value = response.data.user

  // Auto-configure WebRTC if agent has extensions
  if (user.value.extensions && user.value.extensions.length > 0) {
    const primaryExtension = user.value.extensions[0]

    // Store SIP credentials for WebRTC service
    localStorage.setItem('sip_config', JSON.stringify({
      server: user.value.sipServer,
      extension: primaryExtension.extension,
      password: primaryExtension.sip_password
    }))
  }
}
```

```javascript
// irisx-agent-desktop/src/services/webrtc.js - Auto-load config
export class WebRTCService {
  constructor() {
    // Load SIP config from localStorage (set by auth.js)
    const config = JSON.parse(localStorage.getItem('sip_config') || '{}')

    if (config.server && config.extension && config.password) {
      this.sipServer = config.server
      this.extension = config.extension
      this.sipPassword = config.password
      this.autoConfigured = true
    } else {
      this.autoConfigured = false
    }
  }

  async connect() {
    if (!this.autoConfigured) {
      throw new Error('SIP credentials not configured. Please contact support.')
    }

    // Use auto-loaded credentials
    // ... rest of connection logic
  }
}
```

---

## Deployment Architecture

### Option 1: Shared FreeSWITCH (Current - Simple)

```
All Customers → Single FreeSWITCH Instance (54.160.220.243)
- Tenant isolation via extension ranges
- Tenant ID in SIP variables
- Dialplan routing by tenant_id
```

**Pros:**
- Simple to manage
- Lower cost ($0 extra)
- Easy to start

**Cons:**
- Single point of failure
- All customers affected by outage
- Scaling limits (~500 concurrent calls per server)

### Option 2: Multi-Tenant FreeSWITCH Cluster (Future - Scalable)

```
Tenant 1-10 → FreeSWITCH Server 1 (us-east-1)
Tenant 11-20 → FreeSWITCH Server 2 (us-west-2)
Tenant 21-30 → FreeSWITCH Server 3 (eu-west-1)
```

**Database: `freeswitch_clusters`**
```sql
CREATE TABLE freeswitch_clusters (
  id SERIAL PRIMARY KEY,
  region VARCHAR(50) NOT NULL, -- us-east-1, us-west-2, eu-west-1
  ip_address VARCHAR(50) NOT NULL,
  websocket_url VARCHAR(255) NOT NULL, -- wss://ip:8066
  max_tenants INTEGER DEFAULT 50,
  current_tenants INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active'
);

ALTER TABLE tenants ADD COLUMN freeswitch_cluster_id INTEGER REFERENCES freeswitch_clusters(id);
```

**Load Balancing:**
- New customer signs up → Find cluster with lowest load
- Assign tenant to cluster
- All agents for that tenant connect to same cluster
- Can migrate tenants between clusters (rare)

---

## Migration Plan: From Manual to Automated

### Phase 1: Create Provisioning System (This Week)
1. Create `agent_extensions` table
2. Build `POST /v1/admin/agents` endpoint
3. Build `freeswitch-provisioning.js` service
4. Test with tenant 7 (your test account)

### Phase 2: Customer Portal Integration (Next Week)
1. Add "Agents" page to Customer Portal
2. Add "Add Agent" button
3. List all agents with extensions
4. Add "Suspend Agent" / "Delete Agent" actions

### Phase 3: Agent Desktop Auto-Config (Same Week)
1. Modify `/v1/auth/me` to return SIP credentials
2. Auto-load SIP config in WebRTC service
3. Remove hardcoded extension 1000
4. Test multi-agent scenario

### Phase 4: Documentation (Next Week)
1. Customer documentation: "How to Add Agents"
2. Agent documentation: "Getting Started with Agent Desktop"
3. Support documentation: "Troubleshooting Agent Login"

---

## Customer Onboarding Flow (Final Vision)

**Company: Acme Corp signs up**

1. **Admin creates account** (5 min)
   - Goes to https://irisx.com/signup
   - Enters company name, admin email, password
   - Verifies email
   - Logs into Customer Portal

2. **Admin adds phone number** (2 min)
   - Goes to Numbers → Buy Number
   - Selects area code, buys number
   - Configures inbound routing: "Ring all agents"

3. **Admin adds agents** (1 min per agent)
   - Goes to Agents → Add Agent
   - Enters: John Doe, john@acme.com
   - Clicks "Create Agent"
   - System emails John with login link

4. **Agent starts working** (2 min)
   - John receives email: "Welcome to Acme Corp's IRISX Agent Desktop"
   - Clicks login link → https://agent.irisx.com
   - Logs in with email + temp password (prompted to change)
   - Softphone shows "Extension 2001" and auto-connects
   - John clicks "Available" status
   - Calls start ringing! 🎉

**Total time: 10 minutes from signup to first call**

---

## Summary: What Needs to Be Built

### Backend (API Server)
- [ ] Database migration: `agent_extensions` table
- [ ] New route: `POST /v1/admin/agents` (create agent)
- [ ] New route: `GET /v1/admin/agents` (list agents)
- [ ] New route: `PATCH /v1/admin/agents/:id` (suspend/activate)
- [ ] New route: `DELETE /v1/admin/agents/:id` (delete agent)
- [ ] New service: `freeswitch-provisioning.js`
- [ ] Update route: `GET /v1/auth/me` (return SIP credentials)

### Frontend (Customer Portal)
- [ ] New page: `AgentManagement.vue`
- [ ] Component: `AddAgentModal.vue`
- [ ] Component: `AgentList.vue`
- [ ] Route: `/dashboard/agents`

### Frontend (Agent Desktop)
- [ ] Update: `auth.js` store (save SIP config)
- [ ] Update: `webrtc.js` service (auto-load config)
- [ ] Remove: Hardcoded extension 1000

### Infrastructure
- [ ] Shared volume or SSH access between API server and FreeSWITCH
- [ ] FreeSWITCH directory write permissions
- [ ] Email service integration (welcome emails)

### Documentation
- [ ] Customer guide: "Adding Agents"
- [ ] Agent guide: "Getting Started"
- [ ] Admin guide: "Managing Extensions"

---

## Next Steps

**Want me to build the automated provisioning system?**

I can create:
1. Database migration for `agent_extensions` table
2. Full provisioning API with all CRUD operations
3. FreeSWITCH XML generation service
4. Customer Portal agent management page
5. Agent Desktop auto-configuration

This will make onboarding **completely automated** for your customers!
