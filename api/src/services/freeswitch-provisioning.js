/**
 * FreeSWITCH Auto-Provisioning Service
 * Automatically creates SIP extensions and dialplans for Agent Desktop
 *
 * This service eliminates manual FreeSWITCH configuration for new agents.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

// FreeSWITCH server details
const FREESWITCH_SERVER = process.env.FREESWITCH_SERVER || '54.160.220.243'
const FREESWITCH_USER = process.env.FREESWITCH_USER || 'ubuntu'
const FREESWITCH_KEY = process.env.FREESWITCH_SSH_KEY || '~/.ssh/irisx-prod-key.pem'
const FREESWITCH_DIR = '/usr/local/freeswitch/etc/freeswitch'

// WebSocket URL for Agent Desktop
const WEBSOCKET_URL = process.env.FREESWITCH_WEBSOCKET_URL || 'wss://54.160.220.243:8066'

/**
 * Provision a new SIP extension in FreeSWITCH
 * Creates user XML file and reloads FreeSWITCH directory
 */
export async function provisionExtension({
  tenantId,
  extension,
  sipPassword,
  userName = 'Agent',
  voicemailEnabled = true
}) {
  try {
    console.log(`📞 Provisioning extension ${extension} for tenant ${tenantId}...`)

    // 1. Generate SIP user XML
    const userXml = generateUserXML({
      extension,
      sipPassword,
      tenantId,
      userName,
      voicemailEnabled
    })

    // 2. Write XML file to FreeSWITCH server
    const xmlPath = `${FREESWITCH_DIR}/directory/default/${extension}.xml`
    await writeFileToFreeSWITCH(xmlPath, userXml)

    // 3. Create tenant dialplan if this is first extension
    await ensureTenantDialplan(tenantId)

    // 4. Reload FreeSWITCH directory to pick up new extension
    await reloadFreeSWITCH()

    console.log(`✅ Extension ${extension} provisioned successfully`)

    return {
      success: true,
      extension,
      websocketUrl: WEBSOCKET_URL
    }

  } catch (error) {
    console.error(`❌ Failed to provision extension ${extension}:`, error.message)
    throw new Error(`Provisioning failed: ${error.message}`)
  }
}

/**
 * Deprovision (delete) a SIP extension from FreeSWITCH
 */
export async function deprovisionExtension(extension) {
  try {
    console.log(`🗑️  Deprovisioning extension ${extension}...`)

    const xmlPath = `${FREESWITCH_DIR}/directory/default/${extension}.xml`

    // Delete XML file
    await execSSH(`sudo rm -f ${xmlPath}`)

    // Reload FreeSWITCH
    await reloadFreeSWITCH()

    console.log(`✅ Extension ${extension} deprovisioned`)

    return { success: true }

  } catch (error) {
    console.error(`❌ Failed to deprovision extension ${extension}:`, error.message)
    throw error
  }
}

/**
 * Update an existing extension's password
 */
export async function updateExtensionPassword(extension, newSipPassword) {
  try {
    console.log(`🔒 Updating password for extension ${extension}...`)

    // Get existing XML file content
    const xmlPath = `${FREESWITCH_DIR}/directory/default/${extension}.xml`
    const { stdout: existingXml } = await execSSH(`cat ${xmlPath}`)

    // Replace password in XML
    const updatedXml = existingXml.replace(
      /<param name="password" value="[^"]+"/,
      `<param name="password" value="${newSipPassword}"`
    )

    // Write updated XML
    await writeFileToFreeSWITCH(xmlPath, updatedXml)

    // Reload FreeSWITCH
    await reloadFreeSWITCH()

    console.log(`✅ Password updated for extension ${extension}`)

    return { success: true }

  } catch (error) {
    console.error(`❌ Failed to update password for extension ${extension}:`, error.message)
    throw error
  }
}

/**
 * Generate FreeSWITCH user XML for SIP extension
 */
function generateUserXML({ extension, sipPassword, tenantId, userName, voicemailEnabled }) {
  return `<include>
  <user id="${extension}">
    <params>
      <param name="password" value="${sipPassword}"/>
      <param name="vm-password" value="${extension}"/>
      <param name="dial-string" value="{^^:sip_invite_domain=\${dialed_domain}:presence_id=\${dialed_user}@\${dialed_domain}}\${sofia_contact(*/${extension}@\${dialed_domain})}"/>
    </params>
    <variables>
      <variable name="tenant_id" value="${tenantId}"/>
      <variable name="user_context" value="default"/>
      <variable name="effective_caller_id_name" value="${userName}"/>
      <variable name="effective_caller_id_number" value="${extension}"/>
      <variable name="outbound_caller_id_name" value="\${outbound_caller_id_name}"/>
      <variable name="outbound_caller_id_number" value="\${outbound_caller_id_number}"/>
      ${voicemailEnabled ? '<variable name="voicemail_enabled" value="true"/>' : ''}
      <variable name="toll_allow" value="domestic,international"/>
      <variable name="accountcode" value="${extension}"/>
    </variables>
  </user>
</include>
`
}

/**
 * Ensure tenant-specific dialplan exists
 * Creates outbound and inbound routing rules for the tenant
 */
async function ensureTenantDialplan(tenantId) {
  const dialplanPath = `${FREESWITCH_DIR}/dialplan/default/${tenantId}_tenant.xml`

  // Check if dialplan already exists
  try {
    await execSSH(`test -f ${dialplanPath}`)
    console.log(`  ℹ️  Dialplan for tenant ${tenantId} already exists`)
    return // Already exists
  } catch {
    // Doesn't exist, create it
  }

  console.log(`  📝 Creating dialplan for tenant ${tenantId}...`)

  const dialplanXml = generateTenantDialplan(tenantId)
  await writeFileToFreeSWITCH(dialplanPath, dialplanXml)

  console.log(`  ✅ Dialplan created for tenant ${tenantId}`)
}

/**
 * Generate tenant-specific dialplan XML
 */
function generateTenantDialplan(tenantId) {
  // Calculate extension range for this tenant
  const extensionBase = (tenantId + 1) * 1000
  const extensionEnd = extensionBase + 999

  return `<include>
  <!-- Tenant ${tenantId} Dialplan -->

  <!-- Outbound PSTN Calls -->
  <extension name="tenant_${tenantId}_outbound_pstn">
    <condition field="\${tenant_id}" expression="^${tenantId}$"/>
    <condition field="destination_number" expression="^\\+?1?([2-9]\\d{9})$">
      <action application="log" data="INFO Tenant ${tenantId} calling PSTN: $1"/>
      <action application="set" data="effective_caller_id_number=\${outbound_caller_id_number}"/>
      <action application="set" data="effective_caller_id_name=\${outbound_caller_id_name}"/>
      <action application="bridge" data="sofia/external/$1@${FREESWITCH_SERVER}"/>
      <action application="hangup"/>
    </condition>
  </extension>

  <!-- Inbound from PSTN to Tenant Extensions -->
  <extension name="tenant_${tenantId}_inbound">
    <condition field="destination_number" expression="^(${extensionBase}|${extensionBase}\\d{1,3})$">
      <action application="answer"/>
      <action application="sleep" data="500"/>
      <action application="set" data="tenant_id=${tenantId}"/>
      <action application="log" data="INFO Routing inbound call to tenant ${tenantId} extension $1"/>
      <action application="bridge" data="user/$1@10.0.1.213"/>
      <action application="hangup"/>
    </condition>
  </extension>

  <!-- Extension to Extension (within tenant) -->
  <extension name="tenant_${tenantId}_local">
    <condition field="\${tenant_id}" expression="^${tenantId}$"/>
    <condition field="destination_number" expression="^(${extensionBase}|${extensionBase}\\d{1,3})$">
      <action application="log" data="INFO Tenant ${tenantId} local call to extension $1"/>
      <action application="bridge" data="user/$1@10.0.1.213"/>
      <action application="hangup"/>
    </condition>
  </extension>
</include>
`
}

/**
 * Write file to FreeSWITCH server via SSH
 */
async function writeFileToFreeSWITCH(remotePath, content) {
  // Escape content for shell
  const escapedContent = content.replace(/'/g, "'\\''")

  // Write file using SSH
  const command = `echo '${escapedContent}' | sudo tee ${remotePath} > /dev/null`
  await execSSH(command)
}

/**
 * Reload FreeSWITCH XML configuration
 */
async function reloadFreeSWITCH() {
  console.log(`  🔄 Reloading FreeSWITCH configuration...`)

  try {
    await execSSH('sudo /usr/local/freeswitch/bin/fs_cli -x "reloadxml"')
    console.log(`  ✅ FreeSWITCH reloaded`)
  } catch (error) {
    console.warn(`  ⚠️  FreeSWITCH reload warning:`, error.message)
    // Don't throw - reload warnings are often not critical
  }
}

/**
 * Execute command on FreeSWITCH server via SSH
 */
async function execSSH(command) {
  const sshCommand = `ssh -i ${FREESWITCH_KEY} -o StrictHostKeyChecking=no ${FREESWITCH_USER}@${FREESWITCH_SERVER} "${command}"`

  try {
    const result = await execAsync(sshCommand, { timeout: 30000 })
    return result
  } catch (error) {
    console.error(`SSH command failed: ${command}`)
    console.error(`Error: ${error.message}`)
    throw error
  }
}

/**
 * Test connectivity to FreeSWITCH server
 */
export async function testFreeSWITCHConnection() {
  try {
    const { stdout } = await execSSH('echo "Connection test successful"')
    return { success: true, message: stdout.trim() }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Get FreeSWITCH status (number of registered users, active calls, etc.)
 */
export async function getFreeSWITCHStatus() {
  try {
    const { stdout: showRegistrations } = await execSSH('sudo /usr/local/freeswitch/bin/fs_cli -x "show registrations"')
    const { stdout: showCalls } = await execSSH('sudo /usr/local/freeswitch/bin/fs_cli -x "show calls"')

    // Parse output to count registrations and calls
    const registrationCount = (showRegistrations.match(/\n/g) || []).length - 2 // Subtract header lines
    const callCount = (showCalls.match(/\n/g) || []).length - 2

    return {
      success: true,
      registeredUsers: Math.max(0, registrationCount),
      activeCalls: Math.max(0, callCount),
      serverIp: FREESWITCH_SERVER,
      websocketUrl: WEBSOCKET_URL
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
