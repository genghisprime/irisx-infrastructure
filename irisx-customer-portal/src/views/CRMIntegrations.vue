<template>
  <div class="p-6 max-w-5xl mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">CRM Integrations</h1>
      <p class="text-gray-500">Connect your CRM to sync contacts, log calls, and automate workflows</p>
    </div>

    <!-- Connected CRMs -->
    <div v-if="connections.length > 0" class="mb-8">
      <h2 class="text-lg font-semibold mb-4">Connected Platforms</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="conn in connections"
          :key="conn.id"
          class="bg-white border rounded-xl p-5"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div :class="['p-2 rounded-lg', getProviderBg(conn.provider)]">
                <component :is="getProviderIcon(conn.provider)" :class="['h-6 w-6', getProviderColor(conn.provider)]" />
              </div>
              <div>
                <h3 class="font-semibold capitalize">{{ conn.provider }}</h3>
                <p class="text-sm text-gray-500">{{ conn.instance_url || 'Connected' }}</p>
              </div>
            </div>
            <span :class="['px-2 py-1 rounded-full text-xs font-medium', getStatusBadge(conn.status)]">
              {{ conn.status }}
            </span>
          </div>

          <div class="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <span>{{ conn.linked_records || 0 }} records linked</span>
            <span>{{ conn.mappings_count || 0 }} mappings</span>
          </div>

          <div v-if="conn.last_sync_at" class="text-xs text-gray-400 mb-4">
            Last sync: {{ formatDateTime(conn.last_sync_at) }}
          </div>

          <div class="flex items-center gap-2">
            <button @click="configureConnection(conn)" class="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50">
              Configure
            </button>
            <button @click="syncNow(conn)" :disabled="syncing === conn.id" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {{ syncing === conn.id ? 'Syncing...' : 'Sync Now' }}
            </button>
            <button @click="disconnectCRM(conn)" class="p-2 text-red-500 hover:bg-red-50 rounded-lg">
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Available CRMs -->
    <div>
      <h2 class="text-lg font-semibold mb-4">Available Integrations</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="provider in availableProviders"
          :key="provider.id"
          class="bg-white border rounded-xl p-5 hover:border-blue-500 transition-colors"
        >
          <div class="flex items-center gap-3 mb-3">
            <div :class="['p-2 rounded-lg', getProviderBg(provider.id)]">
              <component :is="getProviderIcon(provider.id)" :class="['h-6 w-6', getProviderColor(provider.id)]" />
            </div>
            <div>
              <h3 class="font-semibold">{{ provider.name }}</h3>
            </div>
          </div>
          <p class="text-sm text-gray-500 mb-4">{{ provider.description }}</p>
          <div class="flex flex-wrap gap-1 mb-4">
            <span v-for="feature in provider.features" :key="feature" class="px-2 py-0.5 bg-gray-100 rounded text-xs">
              {{ feature }}
            </span>
          </div>
          <button
            @click="connectCRM(provider)"
            :disabled="isConnected(provider.id)"
            :class="[
              'w-full py-2 rounded-lg text-sm font-medium',
              isConnected(provider.id)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            ]"
          >
            {{ isConnected(provider.id) ? 'Connected' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Configure Modal -->
    <div v-if="showConfigModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg capitalize">Configure {{ selectedConnection?.provider }}</h3>
          <button @click="showConfigModal = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>

        <div class="p-4 overflow-y-auto max-h-[60vh]">
          <!-- Tabs -->
          <div class="flex border-b mb-4">
            <button
              @click="configTab = 'mappings'"
              :class="['px-4 py-2 text-sm font-medium', configTab === 'mappings' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500']"
            >
              Field Mappings
            </button>
            <button
              @click="configTab = 'automations'"
              :class="['px-4 py-2 text-sm font-medium', configTab === 'automations' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500']"
            >
              Automations
            </button>
            <button
              @click="configTab = 'logs'"
              :class="['px-4 py-2 text-sm font-medium', configTab === 'logs' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500']"
            >
              Sync Logs
            </button>
          </div>

          <!-- Mappings Tab -->
          <div v-if="configTab === 'mappings'">
            <div class="space-y-4">
              <div v-for="mapping in fieldMappings" :key="mapping.id" class="p-4 border rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="font-medium">{{ mapping.irisx_object }} → {{ mapping.crm_object }}</h4>
                  <span :class="['px-2 py-0.5 rounded text-xs', mapping.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100']">
                    {{ mapping.mapping_type }}
                  </span>
                </div>
                <div v-if="mapping.fields" class="text-sm text-gray-500">
                  {{ mapping.fields.length }} field mappings
                </div>
              </div>
            </div>

            <button @click="showMappingEditor = true" class="mt-4 w-full py-2 border-2 border-dashed rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-600">
              + Add Field Mapping
            </button>
          </div>

          <!-- Automations Tab -->
          <div v-if="configTab === 'automations'">
            <div class="space-y-4">
              <div v-for="rule in automationRules" :key="rule.id" class="p-4 border rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="font-medium">{{ rule.name }}</h4>
                  <div class="flex items-center gap-2">
                    <span :class="['px-2 py-0.5 rounded text-xs', rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100']">
                      {{ rule.is_active ? 'Active' : 'Disabled' }}
                    </span>
                    <button @click="deleteAutomation(rule)" class="text-red-500 hover:text-red-700">
                      <TrashIcon class="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p class="text-sm text-gray-500">
                  When {{ rule.trigger_event.replace('_', ' ') }} → {{ rule.action_type.replace('_', ' ') }} in {{ rule.target_object }}
                </p>
              </div>
            </div>

            <button @click="showAutomationEditor = true" class="mt-4 w-full py-2 border-2 border-dashed rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-600">
              + Add Automation Rule
            </button>
          </div>

          <!-- Sync Logs Tab -->
          <div v-if="configTab === 'logs'">
            <div class="space-y-2">
              <div v-for="log in syncLogs" :key="log.id" class="p-3 border rounded-lg flex items-center justify-between">
                <div>
                  <p class="font-medium text-sm">{{ log.sync_type }} sync - {{ log.object_type }}</p>
                  <p class="text-xs text-gray-500">{{ formatDateTime(log.started_at) }}</p>
                </div>
                <div class="text-right">
                  <span :class="['px-2 py-0.5 rounded text-xs font-medium', getLogStatusBadge(log.status)]">
                    {{ log.status }}
                  </span>
                  <p class="text-xs text-gray-500 mt-1">
                    {{ log.records_processed }} processed, {{ log.records_failed }} failed
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mapping Editor Modal -->
    <div v-if="showMappingEditor" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold">Add Field Mapping</h3>
          <button @click="showMappingEditor = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">IRISX Object</label>
            <select v-model="mappingForm.irisx_object" class="w-full px-3 py-2 border rounded-lg">
              <option value="contact">Contact</option>
              <option value="call">Call</option>
              <option value="conversation">Conversation</option>
              <option value="ticket">Ticket</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CRM Object</label>
            <input v-model="mappingForm.crm_object" class="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Contact, Lead, Ticket" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Sync Type</label>
            <select v-model="mappingForm.mapping_type" class="w-full px-3 py-2 border rounded-lg">
              <option value="sync">Bidirectional Sync</option>
              <option value="push_only">Push to CRM Only</option>
              <option value="pull_only">Pull from CRM Only</option>
            </select>
          </div>
        </div>
        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="showMappingEditor = false" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="saveMapping" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Mapping</button>
        </div>
      </div>
    </div>

    <!-- Automation Editor Modal -->
    <div v-if="showAutomationEditor" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold">Add Automation Rule</h3>
          <button @click="showAutomationEditor = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
            <input v-model="automationForm.name" class="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Log Calls to Salesforce" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Trigger Event</label>
            <select v-model="automationForm.trigger_event" class="w-full px-3 py-2 border rounded-lg">
              <option value="call_completed">When Call Completed</option>
              <option value="conversation_closed">When Conversation Closed</option>
              <option value="contact_created">When Contact Created</option>
              <option value="ticket_created">When Ticket Created</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select v-model="automationForm.action_type" class="w-full px-3 py-2 border rounded-lg">
              <option value="create_record">Create CRM Record</option>
              <option value="update_record">Update CRM Record</option>
              <option value="add_note">Add Note to Record</option>
              <option value="create_task">Create Task</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Target CRM Object</label>
            <input v-model="automationForm.target_object" class="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Task, Activity, Note" />
          </div>
        </div>
        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="showAutomationEditor = false" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="saveAutomation" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Rule</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue'
import api from '../services/api'

// Icon Components
const TrashIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }
const CloudIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z' })]) }

// State
const connections = ref([])
const providers = ref([])
const syncing = ref(null)
const showConfigModal = ref(false)
const selectedConnection = ref(null)
const configTab = ref('mappings')
const fieldMappings = ref([])
const automationRules = ref([])
const syncLogs = ref([])
const showMappingEditor = ref(false)
const showAutomationEditor = ref(false)

const mappingForm = reactive({
  irisx_object: 'contact',
  crm_object: '',
  mapping_type: 'sync',
})

const automationForm = reactive({
  name: '',
  trigger_event: 'call_completed',
  action_type: 'create_record',
  target_object: '',
})

// Computed
const availableProviders = computed(() => {
  return providers.value.filter(p => !isConnected(p.id))
})

// Lifecycle
onMounted(async () => {
  await Promise.all([loadConnections(), loadProviders()])
})

// Methods
async function loadConnections() {
  try {
    const { data } = await api.get('/crm/connections')
    connections.value = data.connections || []
  } catch (error) {
    console.error('Failed to load connections:', error)
  }
}

async function loadProviders() {
  try {
    const { data } = await api.get('/crm/providers')
    providers.value = data.providers || []
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

function isConnected(providerId) {
  return connections.value.some(c => c.provider === providerId && c.status === 'connected')
}

async function connectCRM(provider) {
  try {
    const redirectUri = `${window.location.origin}/integrations/callback`
    const { data } = await api.get(`/crm/oauth/${provider.id}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`)
    window.location.href = data.authorization_url
  } catch (error) {
    console.error('Failed to initiate OAuth:', error)
  }
}

async function disconnectCRM(conn) {
  if (!confirm(`Disconnect ${conn.provider}? This will remove all synced data links.`)) return
  try {
    await api.delete(`/crm/connections/${conn.id}`)
    await loadConnections()
  } catch (error) {
    console.error('Failed to disconnect:', error)
  }
}

async function syncNow(conn) {
  syncing.value = conn.id
  try {
    await api.post(`/crm/connections/${conn.id}/sync`, { sync_type: 'incremental', object_type: 'contact' })
    // In production, poll for sync status
    setTimeout(() => {
      syncing.value = null
      loadConnections()
    }, 3000)
  } catch (error) {
    console.error('Sync failed:', error)
    syncing.value = null
  }
}

async function configureConnection(conn) {
  selectedConnection.value = conn
  configTab.value = 'mappings'
  showConfigModal.value = true
  await Promise.all([
    loadFieldMappings(conn.id),
    loadAutomationRules(conn.id),
    loadSyncLogs(conn.id),
  ])
}

async function loadFieldMappings(connectionId) {
  try {
    const { data } = await api.get(`/crm/connections/${connectionId}/mappings`)
    fieldMappings.value = data.mappings || []
  } catch (error) {
    console.error('Failed to load mappings:', error)
  }
}

async function loadAutomationRules(connectionId) {
  try {
    const { data } = await api.get(`/crm/connections/${connectionId}/automations`)
    automationRules.value = data.rules || []
  } catch (error) {
    console.error('Failed to load automations:', error)
  }
}

async function loadSyncLogs(connectionId) {
  try {
    const { data } = await api.get(`/crm/connections/${connectionId}/sync-logs`)
    syncLogs.value = data.logs || []
  } catch (error) {
    console.error('Failed to load sync logs:', error)
  }
}

async function saveMapping() {
  try {
    await api.post(`/crm/connections/${selectedConnection.value.id}/mappings`, mappingForm)
    await loadFieldMappings(selectedConnection.value.id)
    showMappingEditor.value = false
    mappingForm.irisx_object = 'contact'
    mappingForm.crm_object = ''
    mappingForm.mapping_type = 'sync'
  } catch (error) {
    console.error('Failed to save mapping:', error)
  }
}

async function saveAutomation() {
  try {
    await api.post(`/crm/connections/${selectedConnection.value.id}/automations`, automationForm)
    await loadAutomationRules(selectedConnection.value.id)
    showAutomationEditor.value = false
    automationForm.name = ''
    automationForm.trigger_event = 'call_completed'
    automationForm.action_type = 'create_record'
    automationForm.target_object = ''
  } catch (error) {
    console.error('Failed to save automation:', error)
  }
}

async function deleteAutomation(rule) {
  if (!confirm('Delete this automation rule?')) return
  try {
    await api.delete(`/crm/automations/${rule.id}`)
    await loadAutomationRules(selectedConnection.value.id)
  } catch (error) {
    console.error('Failed to delete automation:', error)
  }
}

function getProviderBg(provider) {
  const colors = {
    salesforce: 'bg-blue-100',
    hubspot: 'bg-orange-100',
    zendesk: 'bg-green-100',
    intercom: 'bg-indigo-100',
  }
  return colors[provider] || 'bg-gray-100'
}

function getProviderColor(provider) {
  const colors = {
    salesforce: 'text-blue-600',
    hubspot: 'text-orange-600',
    zendesk: 'text-green-600',
    intercom: 'text-indigo-600',
  }
  return colors[provider] || 'text-gray-600'
}

function getProviderIcon(provider) {
  // In production, use actual provider logos
  return CloudIcon
}

function getStatusBadge(status) {
  const colors = {
    connected: 'bg-green-100 text-green-800',
    disconnected: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getLogStatusBadge(status) {
  const colors = {
    completed: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function formatDateTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>
