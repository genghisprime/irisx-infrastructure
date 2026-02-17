<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Supervisor Dashboard</h1>
      <div class="flex items-center space-x-3">
        <span class="text-sm text-gray-500">Auto-refresh:</span>
        <select v-model="refreshInterval" @change="setRefreshInterval" class="border rounded px-2 py-1 text-sm">
          <option :value="0">Off</option>
          <option :value="5000">5s</option>
          <option :value="10000">10s</option>
          <option :value="30000">30s</option>
        </select>
        <button @click="fetchActiveCalls" class="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
          Refresh
        </button>
      </div>
    </div>

    <!-- Live Statistics -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">Active Calls</div>
        <div class="text-3xl font-bold text-blue-600">{{ activeCalls.length }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">Being Monitored</div>
        <div class="text-3xl font-bold text-purple-600">{{ monitoredCallsCount }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">My Sessions</div>
        <div class="text-3xl font-bold text-green-600">{{ mySessions.length }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">Agents Online</div>
        <div class="text-3xl font-bold text-gray-900">{{ agentsOnline }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">Avg Duration</div>
        <div class="text-3xl font-bold text-orange-600">{{ avgCallDuration }}s</div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <!-- Active Sessions Banner -->
    <div v-if="mySessions.length > 0" class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
      <h3 class="text-purple-800 font-semibold mb-2">Your Active Monitoring Sessions</h3>
      <div class="space-y-2">
        <div v-for="session in mySessions" :key="session.id" class="flex items-center justify-between bg-white rounded p-3 shadow-sm">
          <div>
            <span class="font-medium text-gray-900">{{ session.call.from }} -> {{ session.call.to }}</span>
            <span class="ml-2 px-2 py-0.5 text-xs rounded-full" :class="getActionTypeBadgeClass(session.action_type)">
              {{ session.action_type }}
            </span>
            <span class="ml-2 text-sm text-gray-500">Agent: {{ session.agent?.name || 'N/A' }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-500">{{ formatDuration(session.duration_seconds) }}</span>
            <button v-if="session.action_type === 'monitor'" @click="escalateToWhisper(session.call_sid)"
                    class="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600">
              Whisper
            </button>
            <button v-if="session.action_type !== 'barge'" @click="escalateToBarge(session.call_sid)"
                    class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">
              Barge
            </button>
            <button @click="stopSession(session.call_sid)"
                    class="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600">
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Queue</label>
          <select v-model="filters.queueId" @change="fetchActiveCalls" class="w-full border rounded px-3 py-2">
            <option value="">All Queues</option>
            <option v-for="queue in queues" :key="queue.id" :value="queue.id">{{ queue.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Agent</label>
          <select v-model="filters.agentId" @change="fetchActiveCalls" class="w-full border rounded px-3 py-2">
            <option value="">All Agents</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Direction</label>
          <select v-model="filters.direction" @change="fetchActiveCalls" class="w-full border rounded px-3 py-2">
            <option value="">All</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select v-model="filters.status" @change="fetchActiveCalls" class="w-full border rounded px-3 py-2">
            <option value="">All</option>
            <option value="ringing">Ringing</option>
            <option value="in-progress">In Progress</option>
            <option value="answered">Answered</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Active Calls Table -->
    <div class="bg-white rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-900">Live Calls</h2>
      </div>

      <div v-if="loading" class="text-center py-12">
        <div class="text-gray-500">Loading active calls...</div>
      </div>

      <div v-else-if="filteredCalls.length === 0" class="text-center py-12">
        <div class="text-gray-500">No active calls matching your filters</div>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From / To</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Queue</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monitors</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="call in filteredCalls" :key="call.call_sid" class="hover:bg-gray-50">
              <td class="px-4 py-4 whitespace-nowrap">
                <span :class="[
                  'px-2 py-1 text-xs font-medium rounded-full',
                  call.direction === 'inbound' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                ]">
                  {{ call.direction }}
                </span>
              </td>
              <td class="px-4 py-4">
                <div class="text-sm font-medium text-gray-900">{{ call.from }}</div>
                <div class="text-sm text-gray-500">{{ call.to }}</div>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <div v-if="call.agent" class="text-sm">
                  <div class="font-medium text-gray-900">{{ call.agent.name }}</div>
                  <div class="text-gray-500 text-xs">{{ call.agent.email }}</div>
                </div>
                <span v-else class="text-gray-400 text-sm">Unassigned</span>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <span v-if="call.queue" class="text-sm text-gray-900">{{ call.queue.name }}</span>
                <span v-else class="text-gray-400 text-sm">-</span>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <span :class="[
                  'px-2 py-1 text-xs font-medium rounded-full',
                  getStatusBadgeClass(call.status)
                ]">
                  {{ call.status }}
                </span>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ formatDuration(call.duration_seconds) }}</div>
                <div class="text-xs text-gray-500">Since {{ formatTime(call.initiated_at) }}</div>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <span v-if="call.active_monitors > 0" class="flex items-center text-purple-600">
                  <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                    <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
                  </svg>
                  {{ call.active_monitors }}
                </span>
                <span v-else class="text-gray-400 text-sm">-</span>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <div class="flex space-x-2">
                  <button @click="startMonitor(call.call_sid)"
                          :disabled="isMonitoringCall(call.call_sid)"
                          :class="[
                            'px-2 py-1 text-xs rounded',
                            isMonitoringCall(call.call_sid)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-blue-500 text-white hover:bg-blue-600'
                          ]">
                    Monitor
                  </button>
                  <button @click="startWhisper(call.call_sid)"
                          :disabled="call.status === 'ringing'"
                          :class="[
                            'px-2 py-1 text-xs rounded',
                            call.status === 'ringing'
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-yellow-500 text-white hover:bg-yellow-600'
                          ]">
                    Whisper
                  </button>
                  <button @click="startBarge(call.call_sid)"
                          :disabled="call.status === 'ringing'"
                          :class="[
                            'px-2 py-1 text-xs rounded',
                            call.status === 'ringing'
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-red-500 text-white hover:bg-red-600'
                          ]">
                    Barge
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Audit Log Section -->
    <div class="bg-white rounded-lg shadow mt-6">
      <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h2 class="text-lg font-semibold text-gray-900">Recent Supervisor Actions</h2>
        <button @click="fetchAuditLog" class="text-blue-600 text-sm hover:underline">
          Refresh
        </button>
      </div>

      <div v-if="auditLog.length === 0" class="text-center py-8">
        <p class="text-gray-500">No supervisor actions recorded yet</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supervisor</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Call</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="entry in auditLog" :key="entry.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {{ formatDateTime(entry.created_at) }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ entry.supervisor?.name || 'Unknown' }}</div>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span :class="['px-2 py-1 text-xs font-medium rounded-full', getActionTypeBadgeClass(entry.action_type)]">
                  {{ entry.action_type }}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                {{ entry.agent?.name || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {{ entry.call_sid?.substring(0, 10) }}...
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {{ entry.ip_address || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Action Confirmation Modal -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">{{ confirmModal.title }}</h3>
        <p class="text-gray-600 mb-6">{{ confirmModal.message }}</p>
        <div class="flex justify-end space-x-3">
          <button @click="showConfirmModal = false" class="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button @click="confirmAction" :class="['px-4 py-2 rounded text-white', confirmModal.buttonClass]">
            {{ confirmModal.buttonText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'

const authStore = useAdminAuthStore()
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// State
const loading = ref(false)
const error = ref('')
const activeCalls = ref([])
const mySessions = ref([])
const auditLog = ref([])
const queues = ref([])
const agents = ref([])
const refreshInterval = ref(10000)
let refreshTimer = null

// Filters
const filters = ref({
  queueId: '',
  agentId: '',
  direction: '',
  status: ''
})

// Confirmation Modal
const showConfirmModal = ref(false)
const confirmModal = ref({
  title: '',
  message: '',
  buttonText: '',
  buttonClass: '',
  action: null
})

// Computed
const filteredCalls = computed(() => {
  return activeCalls.value.filter(call => {
    if (filters.value.direction && call.direction !== filters.value.direction) return false
    if (filters.value.status && call.status !== filters.value.status) return false
    return true
  })
})

const monitoredCallsCount = computed(() => {
  return activeCalls.value.filter(c => c.active_monitors > 0).length
})

const agentsOnline = computed(() => {
  const uniqueAgents = new Set(activeCalls.value.filter(c => c.agent).map(c => c.agent.id))
  return uniqueAgents.size
})

const avgCallDuration = computed(() => {
  const calls = activeCalls.value.filter(c => c.duration_seconds > 0)
  if (calls.length === 0) return 0
  const total = calls.reduce((sum, c) => sum + c.duration_seconds, 0)
  return Math.round(total / calls.length)
})

// Methods
const fetchActiveCalls = async () => {
  try {
    loading.value = true
    error.value = ''

    const params = new URLSearchParams()
    if (filters.value.queueId) params.append('queue_id', filters.value.queueId)
    if (filters.value.agentId) params.append('agent_id', filters.value.agentId)

    const response = await fetch(`${API_URL}/admin/supervisor/active-calls?${params}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) throw new Error('Failed to fetch active calls')

    const data = await response.json()
    activeCalls.value = data.active_calls || []
  } catch (e) {
    error.value = e.message
    console.error('Error fetching active calls:', e)
  } finally {
    loading.value = false
  }
}

const fetchMySessions = async () => {
  try {
    const response = await fetch(`${API_URL}/admin/supervisor/sessions`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) throw new Error('Failed to fetch sessions')

    const data = await response.json()
    mySessions.value = data.sessions || []
  } catch (e) {
    console.error('Error fetching sessions:', e)
  }
}

const fetchAuditLog = async () => {
  try {
    const response = await fetch(`${API_URL}/admin/supervisor/audit-log?limit=20`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) throw new Error('Failed to fetch audit log')

    const data = await response.json()
    auditLog.value = data.audit_log || []
  } catch (e) {
    console.error('Error fetching audit log:', e)
  }
}

const startMonitor = async (callSid) => {
  await performSupervisorAction(callSid, 'monitor')
}

const startWhisper = async (callSid) => {
  confirmModal.value = {
    title: 'Start Whisper',
    message: 'You will be able to speak to the agent. The caller will not hear you.',
    buttonText: 'Start Whisper',
    buttonClass: 'bg-yellow-500 hover:bg-yellow-600',
    action: () => performSupervisorAction(callSid, 'whisper')
  }
  showConfirmModal.value = true
}

const startBarge = async (callSid) => {
  confirmModal.value = {
    title: 'Barge Into Call',
    message: 'You will join the call. Both the agent AND caller will hear you. Use with caution.',
    buttonText: 'Barge In',
    buttonClass: 'bg-red-500 hover:bg-red-600',
    action: () => performSupervisorAction(callSid, 'barge')
  }
  showConfirmModal.value = true
}

const escalateToWhisper = async (callSid) => {
  await performSupervisorAction(callSid, 'whisper')
}

const escalateToBarge = async (callSid) => {
  confirmModal.value = {
    title: 'Escalate to Barge',
    message: 'This will make you audible to both the agent AND caller.',
    buttonText: 'Barge In',
    buttonClass: 'bg-red-500 hover:bg-red-600',
    action: () => performSupervisorAction(callSid, 'barge')
  }
  showConfirmModal.value = true
}

const stopSession = async (callSid) => {
  try {
    const response = await fetch(`${API_URL}/admin/supervisor/calls/${callSid}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to stop session')
    }

    await fetchMySessions()
    await fetchActiveCalls()
    await fetchAuditLog()
  } catch (e) {
    error.value = e.message
  }
}

const performSupervisorAction = async (callSid, action) => {
  try {
    const response = await fetch(`${API_URL}/admin/supervisor/calls/${callSid}/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || `Failed to ${action}`)
    }

    await fetchMySessions()
    await fetchActiveCalls()
    await fetchAuditLog()
  } catch (e) {
    error.value = e.message
  }
}

const confirmAction = async () => {
  showConfirmModal.value = false
  if (confirmModal.value.action) {
    await confirmModal.value.action()
  }
}

const isMonitoringCall = (callSid) => {
  return mySessions.value.some(s => s.call_sid === callSid)
}

const setRefreshInterval = () => {
  if (refreshTimer) clearInterval(refreshTimer)

  if (refreshInterval.value > 0) {
    refreshTimer = setInterval(() => {
      fetchActiveCalls()
      fetchMySessions()
    }, refreshInterval.value)
  }
}

// Formatters
const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleTimeString()
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'ringing': return 'bg-yellow-100 text-yellow-800'
    case 'in-progress':
    case 'answered': return 'bg-green-100 text-green-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

const getActionTypeBadgeClass = (actionType) => {
  switch (actionType) {
    case 'monitor': return 'bg-blue-100 text-blue-800'
    case 'whisper': return 'bg-yellow-100 text-yellow-800'
    case 'barge': return 'bg-red-100 text-red-800'
    case 'stop': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    fetchActiveCalls(),
    fetchMySessions(),
    fetchAuditLog()
  ])
  setRefreshInterval()
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>
