<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Queue Management</h1>
        <p class="text-sm text-gray-600 mt-1">Manage call queues and agent assignments</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        + Create Queue
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Total Queues</p>
        <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Active</p>
        <p class="text-2xl font-bold text-green-600">{{ stats.active }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Calls Waiting</p>
        <p class="text-2xl font-bold text-yellow-600">{{ stats.waiting }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Avg Wait Time</p>
        <p class="text-2xl font-bold text-gray-900">{{ stats.avgWaitTime }}s</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="h-6 w-6 animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Queues List -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Queue Name
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Extension
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Agents
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Waiting
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Max Wait (s)
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="queue in queues" :key="queue.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <p class="text-sm font-medium text-gray-900">{{ queue.name }}</p>
              <p class="text-xs text-gray-500">{{ queue.description }}</p>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ queue.extension }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ queue.agent_count || 0 }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ queue.calls_waiting || 0 }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ queue.max_wait_time || 300 }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(queue.status)"
              >
                {{ queue.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <button
                @click="editQueue(queue)"
                class="text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
              <button
                @click="manageAgents(queue)"
                class="text-purple-600 hover:text-purple-800"
              >
                Agents
              </button>
              <button
                v-if="queue.status === 'active'"
                @click="pauseQueue(queue)"
                class="text-yellow-600 hover:text-yellow-800"
              >
                Pause
              </button>
              <button
                v-else
                @click="activateQueue(queue)"
                class="text-green-600 hover:text-green-800"
              >
                Activate
              </button>
              <button
                @click="deleteQueue(queue)"
                class="text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="queues.length === 0" class="text-center py-12">
        <p class="text-gray-500 mb-4">No queues found</p>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Your First Queue
        </button>
      </div>
    </div>

    <!-- Create/Edit Queue Modal -->
    <div
      v-if="showCreateModal || editingQueue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="closeModals"
    >
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">{{ editingQueue ? 'Edit Queue' : 'Create New Queue' }}</h3>
        <form @click.prevent="handleSubmitQueue" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Queue Name</label>
              <input
                v-model="queueForm.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Support Queue"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Extension</label>
              <input
                v-model="queueForm.extension"
                type="text"
                required
                pattern="[0-9]{4}"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="9000"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              v-model="queueForm.description"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Customer support queue"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Wait Time (seconds)</label>
              <input
                v-model.number="queueForm.max_wait_time"
                type="number"
                min="30"
                max="3600"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Strategy</label>
              <select
                v-model="queueForm.strategy"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="ring-all">Ring All</option>
                <option value="longest-idle">Longest Idle</option>
                <option value="round-robin">Round Robin</option>
                <option value="sequential">Sequential</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Music on Hold</label>
              <select
                v-model="queueForm.music_on_hold"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="default">Default</option>
                <option value="none">None</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Overflow Action</label>
              <select
                v-model="queueForm.overflow_action"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="voicemail">Send to Voicemail</option>
                <option value="hangup">Hangup</option>
                <option value="redirect">Redirect to Number</option>
              </select>
            </div>
          </div>

          <div class="flex items-center">
            <input
              v-model="queueForm.announce_position"
              type="checkbox"
              class="mr-2"
            />
            <label class="text-sm text-gray-700">Announce position in queue</label>
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              @click="closeModals"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {{ editingQueue ? 'Update Queue' : 'Create Queue' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Manage Agents Modal -->
    <div
      v-if="managingQueue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="managingQueue = null"
    >
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Manage Agents - {{ managingQueue.name }}</h3>

        <div class="space-y-4">
          <p class="text-sm text-gray-600">{{ queueAgents.length }} agents assigned</p>

          <!-- Available Agents -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Add Agent</label>
            <div class="flex space-x-2">
              <select
                v-model="selectedAgent"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select agent...</option>
                <option v-for="agent in availableAgents" :key="agent.id" :value="agent.id">
                  {{ agent.name }} ({{ agent.extension }})
                </option>
              </select>
              <button
                @click="addAgentToQueue"
                :disabled="!selectedAgent"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          <!-- Assigned Agents -->
          <div class="border rounded-lg overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Agent</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Extension</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="agent in queueAgents" :key="agent.id">
                  <td class="px-4 py-2 text-sm">{{ agent.name }}</td>
                  <td class="px-4 py-2 text-sm">{{ agent.extension }}</td>
                  <td class="px-4 py-2 text-right text-sm">
                    <button
                      @click="removeAgentFromQueue(agent.id)"
                      class="text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="queueAgents.length === 0" class="text-center py-8 text-gray-500 text-sm">
              No agents assigned to this queue
            </div>
          </div>

          <div class="flex justify-end pt-4 border-t">
            <button
              @click="managingQueue = null"
              class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../utils/api'

const loading = ref(true)
const error = ref(null)
const queues = ref([])
const stats = ref({
  total: 0,
  active: 0,
  waiting: 0,
  avgWaitTime: 0
})

const showCreateModal = ref(false)
const editingQueue = ref(null)
const managingQueue = ref(null)
const queueAgents = ref([])
const availableAgents = ref([])
const selectedAgent = ref('')

const queueForm = ref({
  name: '',
  extension: '',
  description: '',
  max_wait_time: 300,
  strategy: 'longest-idle',
  music_on_hold: 'default',
  overflow_action: 'voicemail',
  announce_position: true
})

onMounted(() => {
  fetchQueues()
})

async function fetchQueues() {
  loading.value = true
  error.value = null

  try {
    const response = await apiClient.get('/v1/queues')
    queues.value = response.data.queues || []

    // Calculate stats
    stats.value.total = queues.value.length
    stats.value.active = queues.value.filter(q => q.status === 'active').length
    stats.value.waiting = queues.value.reduce((sum, q) => sum + (q.calls_waiting || 0), 0)
    stats.value.avgWaitTime = Math.round(
      queues.value.reduce((sum, q) => sum + (q.avg_wait_time || 0), 0) / (queues.value.length || 1)
    )
  } catch (err) {
    console.error('Failed to fetch queues:', err)
    error.value = 'Failed to load queues'
  } finally {
    loading.value = false
  }
}

function editQueue(queue) {
  editingQueue.value = queue
  queueForm.value = { ...queue }
}

async function handleSubmitQueue() {
  try {
    if (editingQueue.value) {
      await apiClient.patch(`/v1/queues/${editingQueue.value.id}`, queueForm.value)
    } else {
      await apiClient.post('/v1/queues', queueForm.value)
    }
    closeModals()
    await fetchQueues()
  } catch (err) {
    console.error('Failed to save queue:', err)
    alert('Failed to save queue')
  }
}

async function manageAgents(queue) {
  managingQueue.value = queue

  try {
    const [agentsRes, availableRes] = await Promise.all([
      apiClient.get(`/v1/queues/${queue.id}/members`),
      apiClient.get('/v1/agents')
    ])

    queueAgents.value = agentsRes.data.members || []
    availableAgents.value = availableRes.data.agents || []
  } catch (err) {
    console.error('Failed to fetch agents:', err)
  }
}

async function addAgentToQueue() {
  if (!selectedAgent.value) return

  try {
    await apiClient.post(`/v1/queues/${managingQueue.value.id}/members`, {
      agent_id: selectedAgent.value
    })
    selectedAgent.value = ''
    await manageAgents(managingQueue.value)
  } catch (err) {
    console.error('Failed to add agent:', err)
    alert('Failed to add agent to queue')
  }
}

async function removeAgentFromQueue(agentId) {
  if (!confirm('Remove this agent from the queue?')) return

  try {
    await apiClient.delete(`/v1/queues/${managingQueue.value.id}/members/${agentId}`)
    await manageAgents(managingQueue.value)
  } catch (err) {
    console.error('Failed to remove agent:', err)
    alert('Failed to remove agent')
  }
}

async function pauseQueue(queue) {
  try {
    await apiClient.patch(`/v1/queues/${queue.id}`, { status: 'paused' })
    await fetchQueues()
  } catch (err) {
    console.error('Failed to pause queue:', err)
    alert('Failed to pause queue')
  }
}

async function activateQueue(queue) {
  try {
    await apiClient.patch(`/v1/queues/${queue.id}`, { status: 'active' })
    await fetchQueues()
  } catch (err) {
    console.error('Failed to activate queue:', err)
    alert('Failed to activate queue')
  }
}

async function deleteQueue(queue) {
  if (!confirm(`Delete queue "${queue.name}"? This action cannot be undone.`)) return

  try {
    await apiClient.delete(`/v1/queues/${queue.id}`)
    await fetchQueues()
  } catch (err) {
    console.error('Failed to delete queue:', err)
    alert('Failed to delete queue')
  }
}

function closeModals() {
  showCreateModal.value = false
  editingQueue.value = null
  queueForm.value = {
    name: '',
    extension: '',
    description: '',
    max_wait_time: 300,
    strategy: 'longest-idle',
    music_on_hold: 'default',
    overflow_action: 'voicemail',
    announce_position: true
  }
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    disabled: 'bg-red-100 text-red-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
