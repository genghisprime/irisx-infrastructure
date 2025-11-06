<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Queue Management</h1>
      <button @click="showCreateModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
        Create Queue
      </button>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading queues...</div>
    </div>

    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Queue Statistics -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Total Queues</div>
          <div class="text-3xl font-bold text-gray-900">{{ queues.length }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Active Calls</div>
          <div class="text-3xl font-bold text-blue-600">{{ totalActiveCalls }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Waiting Calls</div>
          <div class="text-3xl font-bold text-orange-600">{{ totalWaitingCalls }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Avg Wait Time</div>
          <div class="text-3xl font-bold text-gray-900">{{ avgWaitTime }}s</div>
        </div>
      </div>

      <!-- Queues List -->
      <div class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Queue Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strategy</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agents</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active/Waiting</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Wait</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="queue in queues" :key="queue.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">{{ queue.name }}</div>
                  <div class="text-xs text-gray-500">{{ queue.description }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <RouterLink :to="`/dashboard/tenants/${queue.tenant_id}`" class="text-sm text-blue-600 hover:underline">
                    {{ queue.tenant_name }}
                  </RouterLink>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900 font-medium">{{ queue.strategy }}</span>
                  <div class="text-xs text-gray-500">Priority: {{ queue.priority }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ queue.agents_online }}/{{ queue.agents_total }}</div>
                  <div class="text-xs text-gray-500">{{ queue.agents_available }} available</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm">
                    <span class="text-blue-600 font-medium">{{ queue.active_calls }}</span>
                    <span class="text-gray-400 mx-1">/</span>
                    <span class="text-orange-600 font-medium">{{ queue.waiting_calls }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ queue.avg_wait_time }}s</div>
                  <div class="text-xs" :class="queue.max_wait_time > 300 ? 'text-red-600' : 'text-gray-500'">
                    Max: {{ queue.max_wait_time }}s
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    queue.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  ]">
                    {{ queue.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <button @click="editQueue(queue)" class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                  <button @click="viewPerformance(queue)" class="text-green-600 hover:text-green-800">Stats</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Queue Performance Modal -->
      <div v-if="selectedQueue && showPerformanceModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
          <div class="p-6">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-2xl font-bold text-gray-900">Queue Performance: {{ selectedQueue.name }}</h2>
              <button @click="showPerformanceModal = false" class="text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="space-y-6">
              <!-- Key Metrics -->
              <div class="grid grid-cols-3 gap-4">
                <div class="bg-blue-50 rounded-lg p-4">
                  <div class="text-sm text-blue-600 font-medium">Calls Handled Today</div>
                  <div class="text-2xl font-bold text-blue-900">{{ selectedQueue.calls_today }}</div>
                </div>
                <div class="bg-green-50 rounded-lg p-4">
                  <div class="text-sm text-green-600 font-medium">Service Level</div>
                  <div class="text-2xl font-bold text-green-900">{{ selectedQueue.service_level }}%</div>
                  <div class="text-xs text-green-700">Target: 80%</div>
                </div>
                <div class="bg-orange-50 rounded-lg p-4">
                  <div class="text-sm text-orange-600 font-medium">Abandon Rate</div>
                  <div class="text-2xl font-bold text-orange-900">{{ selectedQueue.abandon_rate }}%</div>
                </div>
              </div>

              <!-- Agent Performance -->
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Agent Performance</h3>
                <div class="space-y-2">
                  <div v-for="agent in selectedQueue.agent_stats" :key="agent.id" class="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <div class="font-medium text-gray-900">{{ agent.name }}</div>
                      <div class="text-sm text-gray-600">{{ agent.status }}</div>
                    </div>
                    <div class="text-right">
                      <div class="text-sm font-medium text-gray-900">{{ agent.calls_handled }} calls</div>
                      <div class="text-xs text-gray-600">Avg: {{ agent.avg_handle_time }}s</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Call Distribution -->
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Call Distribution (Last 24h)</h3>
                <div class="space-y-2">
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Answered</span>
                    <span class="font-medium text-green-600">{{ selectedQueue.calls_answered }} ({{ selectedQueue.answer_rate }}%)</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Abandoned</span>
                    <span class="font-medium text-red-600">{{ selectedQueue.calls_abandoned }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-gray-600">Voicemail</span>
                    <span class="font-medium text-blue-600">{{ selectedQueue.calls_voicemail }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create/Edit Queue Modal -->
      <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
          <div class="p-6">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-2xl font-bold text-gray-900">{{ editingQueue ? 'Edit Queue' : 'Create Queue' }}</h2>
              <button @click="closeCreateModal" class="text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <form @submit.prevent="saveQueue" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Queue Name</label>
                <input v-model="queueForm.name" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea v-model="queueForm.description" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                <select v-model="queueForm.tenant_id" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Select Tenant</option>
                  <option value="1">Tenant 1</option>
                  <option value="2">Tenant 2</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Queue Strategy</label>
                <select v-model="queueForm.strategy" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="ring-all">Ring All - Ring all agents simultaneously</option>
                  <option value="round-robin">Round Robin - Distribute calls evenly</option>
                  <option value="longest-idle">Longest Idle - Agent idle longest gets call</option>
                  <option value="least-recent">Least Recent - Agent with least recent call</option>
                  <option value="fewest-calls">Fewest Calls - Agent with fewest calls today</option>
                  <option value="random">Random - Random agent selection</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Priority (1-10)</label>
                <input v-model.number="queueForm.priority" type="number" min="1" max="10" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <p class="text-xs text-gray-500 mt-1">Higher priority queues are processed first</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Wait Time (seconds)</label>
                <input v-model.number="queueForm.max_wait_time" type="number" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <p class="text-xs text-gray-500 mt-1">0 = unlimited</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Timeout Action</label>
                <select v-model="queueForm.timeout_action" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="voicemail">Send to Voicemail</option>
                  <option value="hangup">Hangup</option>
                  <option value="transfer">Transfer to Number</option>
                </select>
              </div>

              <div class="flex items-center">
                <input v-model="queueForm.record_calls" type="checkbox" id="record_calls" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                <label for="record_calls" class="ml-2 text-sm text-gray-700">Record all calls in this queue</label>
              </div>

              <div class="flex justify-end space-x-3 pt-4">
                <button type="button" @click="closeCreateModal" class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" :disabled="saving" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {{ saving ? 'Saving...' : editingQueue ? 'Update Queue' : 'Create Queue' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const error = ref(null)
const queues = ref([])
const showCreateModal = ref(false)
const showPerformanceModal = ref(false)
const selectedQueue = ref(null)
const editingQueue = ref(null)
const saving = ref(false)

const queueForm = ref({
  name: '',
  description: '',
  tenant_id: '',
  strategy: 'round-robin',
  priority: 5,
  max_wait_time: 300,
  timeout_action: 'voicemail',
  record_calls: false
})

const totalActiveCalls = computed(() => queues.value.reduce((sum, q) => sum + q.active_calls, 0))
const totalWaitingCalls = computed(() => queues.value.reduce((sum, q) => sum + q.waiting_calls, 0))
const avgWaitTime = computed(() => {
  const total = queues.value.reduce((sum, q) => sum + q.avg_wait_time, 0)
  return queues.value.length ? Math.round(total / queues.value.length) : 0
})

async function fetchQueues() {
  loading.value = true
  error.value = null
  try {
    const response = await adminAPI.queues.list()
    queues.value = response.data
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
  showCreateModal.value = true
}

function viewPerformance(queue) {
  selectedQueue.value = queue
  showPerformanceModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  editingQueue.value = null
  queueForm.value = {
    name: '',
    description: '',
    tenant_id: '',
    strategy: 'round-robin',
    priority: 5,
    max_wait_time: 300,
    timeout_action: 'voicemail',
    record_calls: false
  }
}

async function saveQueue() {
  saving.value = true
  try {
    if (editingQueue.value) {
      await adminAPI.queues.update(editingQueue.value.id, queueForm.value)
    } else {
      await adminAPI.queues.create(queueForm.value)
    }
    await fetchQueues()
    closeCreateModal()
  } catch (err) {
    console.error('Failed to save queue:', err)
    alert('Failed to save queue. This feature requires backend API implementation.')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchQueues()
})
</script>
