<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Answering Machine Detection</h1>
        <p class="text-sm text-gray-600 mt-1">Configure AMD settings for predictive dialer campaigns</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Configuration
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-200 mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
          activeTab === tab.id
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ tab.name }}
      </button>
    </div>

    <!-- Configurations Tab -->
    <div v-if="activeTab === 'configurations'">
      <div v-if="loading" class="flex justify-center py-12">
        <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>

      <div v-else-if="configurations.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p class="text-gray-600">No AMD configurations yet</p>
        <p class="text-sm text-gray-500 mt-1">Create a configuration to enable answering machine detection</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="config in configurations"
          :key="config.id"
          class="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-gray-900">{{ config.name }}</h3>
              <p class="text-xs text-gray-500">
                {{ config.campaign_name || 'Default (All Campaigns)' }}
              </p>
            </div>
            <span
              :class="[
                'px-2 py-1 text-xs font-medium rounded-full',
                config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              ]"
            >
              {{ config.enabled ? 'Active' : 'Disabled' }}
            </span>
          </div>

          <div class="space-y-2 text-sm text-gray-600 mb-4">
            <div class="flex justify-between">
              <span>Detection Mode:</span>
              <span class="font-medium">{{ config.detection_mode }}</span>
            </div>
            <div class="flex justify-between">
              <span>Human Action:</span>
              <span class="font-medium capitalize">{{ config.human_action }}</span>
            </div>
            <div class="flex justify-between">
              <span>Machine Action:</span>
              <span class="font-medium capitalize">{{ config.machine_action }}</span>
            </div>
            <div class="flex justify-between">
              <span>Beep Detection:</span>
              <span class="font-medium">{{ config.beep_detection_enabled ? 'Yes' : 'No' }}</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              @click="editConfiguration(config)"
              class="flex-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
            >
              Edit
            </button>
            <button
              @click="deleteConfiguration(config)"
              class="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Tab -->
    <div v-if="activeTab === 'analytics'">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-600">Total Calls</p>
          <p class="text-2xl font-bold text-gray-900">{{ analytics.summary.total_calls?.toLocaleString() || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-600">Human Rate</p>
          <p class="text-2xl font-bold text-green-600">{{ analytics.summary.human_rate || 0 }}%</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-600">Machine Rate</p>
          <p class="text-2xl font-bold text-orange-600">{{ analytics.summary.machine_rate || 0 }}%</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-600">Uncertain</p>
          <p class="text-2xl font-bold text-gray-600">{{ analytics.summary.uncertain_count?.toLocaleString() || 0 }}</p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-4 border-b">
          <h3 class="font-semibold text-gray-900">Detection Timeline</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Human</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Machine</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uncertain</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Detection</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="row in analytics.timeline" :key="row.period" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">{{ formatDate(row.period) }}</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ row.total_calls }}</td>
                <td class="px-4 py-3 text-sm text-green-600">{{ row.human_count }} ({{ row.human_rate }}%)</td>
                <td class="px-4 py-3 text-sm text-orange-600">{{ row.machine_count }} ({{ row.machine_rate }}%)</td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ row.uncertain_count }}</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ row.avg_detection_time_ms }}ms</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ (row.avg_confidence * 100).toFixed(1) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Verification Tab -->
    <div v-if="activeTab === 'verification'">
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-4 border-b flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-gray-900">Verification Queue</h3>
            <p class="text-sm text-gray-500">Review uncertain detections to improve accuracy</p>
          </div>
          <button
            @click="fetchVerificationQueue"
            class="text-blue-600 hover:text-blue-700 text-sm"
          >
            Refresh
          </button>
        </div>

        <div v-if="verificationQueue.length === 0" class="p-8 text-center text-gray-500">
          No calls pending verification
        </div>

        <div v-else class="divide-y divide-gray-200">
          <div
            v-for="item in verificationQueue"
            :key="item.id"
            class="p-4 flex items-center justify-between hover:bg-gray-50"
          >
            <div>
              <p class="font-medium text-gray-900">{{ item.phone_number || item.call_id }}</p>
              <p class="text-sm text-gray-500">
                Detected: <span class="font-medium capitalize">{{ item.result }}</span>
                ({{ (item.confidence * 100).toFixed(1) }}% confidence)
              </p>
              <p class="text-xs text-gray-400">{{ formatDate(item.created_at) }}</p>
            </div>
            <div class="flex gap-2">
              <button
                @click="verifyResult(item.id, 'human')"
                class="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Human
              </button>
              <button
                @click="verifyResult(item.id, 'machine')"
                class="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
              >
                Machine
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingConfig" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ editingConfig ? 'Edit Configuration' : 'New AMD Configuration' }}
          </h2>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div class="space-y-4">
            <!-- Basic Settings -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  v-model="formData.name"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Aggressive Detection"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Detection Mode</label>
                <select v-model="formData.detection_mode" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option value="async">Async (Non-blocking)</option>
                  <option value="sync">Sync (Blocking)</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.enabled" class="rounded text-blue-600">
                <span class="text-sm text-gray-700">Enabled</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.adaptive_enabled" class="rounded text-blue-600">
                <span class="text-sm text-gray-700">Adaptive Learning</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="formData.beep_detection_enabled" class="rounded text-blue-600">
                <span class="text-sm text-gray-700">Beep Detection</span>
              </label>
            </div>

            <!-- Timing Thresholds -->
            <div class="border-t pt-4">
              <h4 class="font-medium text-gray-900 mb-3">Timing Thresholds (milliseconds)</h4>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Initial Silence Max</label>
                  <input
                    v-model.number="formData.initial_silence_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Human Greeting Max</label>
                  <input
                    v-model.number="formData.greeting_max_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Machine Greeting Min</label>
                  <input
                    v-model.number="formData.machine_greeting_min_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Total Analysis Time</label>
                  <input
                    v-model.number="formData.total_analysis_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <!-- Word Detection -->
            <div class="border-t pt-4">
              <h4 class="font-medium text-gray-900 mb-3">Word Detection</h4>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Min Word Length (ms)</label>
                  <input
                    v-model.number="formData.min_word_length_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Between Words (ms)</label>
                  <input
                    v-model.number="formData.between_words_silence_ms"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Max Words (Human)</label>
                  <input
                    v-model.number="formData.max_number_of_words"
                    type="number"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="border-t pt-4">
              <h4 class="font-medium text-gray-900 mb-3">Actions</h4>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Human Detected</label>
                  <select v-model="formData.human_action" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="connect">Connect to Agent</option>
                    <option value="transfer">Transfer</option>
                    <option value="ivr">Send to IVR</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Machine Detected</label>
                  <select v-model="formData.machine_action" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="hangup">Hang Up</option>
                    <option value="voicemail">Leave Voicemail</option>
                    <option value="callback">Schedule Callback</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">Uncertain</label>
                  <select v-model="formData.uncertain_action" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="connect">Connect (Assume Human)</option>
                    <option value="hangup">Hang Up</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            @click="closeModal"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            @click="saveConfiguration"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? 'Saving...' : (editingConfig ? 'Update' : 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'

const authStore = useAdminAuthStore()

const tabs = [
  { id: 'configurations', name: 'Configurations' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'verification', name: 'Verification Queue' },
]

const activeTab = ref('configurations')
const loading = ref(true)
const saving = ref(false)
const configurations = ref([])
const analytics = ref({ summary: {}, timeline: [] })
const verificationQueue = ref([])
const showCreateModal = ref(false)
const editingConfig = ref(null)

const defaultFormData = {
  name: '',
  enabled: true,
  detection_mode: 'async',
  initial_silence_ms: 2500,
  greeting_max_ms: 1500,
  after_greeting_silence_ms: 800,
  total_analysis_ms: 5000,
  min_word_length_ms: 100,
  between_words_silence_ms: 50,
  max_number_of_words: 3,
  machine_greeting_min_ms: 1500,
  beep_detection_enabled: true,
  human_action: 'connect',
  machine_action: 'voicemail',
  uncertain_action: 'connect',
  adaptive_enabled: true,
}

const formData = ref({ ...defaultFormData })

onMounted(() => {
  fetchConfigurations()
  fetchAnalytics()
  fetchVerificationQueue()
})

async function fetchConfigurations() {
  loading.value = true
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/amd/configurations`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    configurations.value = data.configurations || []
  } catch (error) {
    console.error('Error fetching configurations:', error)
  } finally {
    loading.value = false
  }
}

async function fetchAnalytics() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/amd/analytics`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    analytics.value = data
  } catch (error) {
    console.error('Error fetching analytics:', error)
  }
}

async function fetchVerificationQueue() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/amd/verification-queue`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    verificationQueue.value = data.results || []
  } catch (error) {
    console.error('Error fetching verification queue:', error)
  }
}

function editConfiguration(config) {
  editingConfig.value = config
  formData.value = { ...config }
}

function closeModal() {
  showCreateModal.value = false
  editingConfig.value = null
  formData.value = { ...defaultFormData }
}

async function saveConfiguration() {
  saving.value = true
  try {
    const url = editingConfig.value
      ? `${import.meta.env.VITE_API_URL}/v1/amd/configurations/${editingConfig.value.id}`
      : `${import.meta.env.VITE_API_URL}/v1/amd/configurations`

    const response = await fetch(url, {
      method: editingConfig.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(formData.value)
    })

    if (response.ok) {
      closeModal()
      fetchConfigurations()
    }
  } catch (error) {
    console.error('Error saving configuration:', error)
  } finally {
    saving.value = false
  }
}

async function deleteConfiguration(config) {
  if (!confirm(`Delete configuration "${config.name}"?`)) return

  try {
    await fetch(`${import.meta.env.VITE_API_URL}/v1/amd/configurations/${config.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    fetchConfigurations()
  } catch (error) {
    console.error('Error deleting configuration:', error)
  }
}

async function verifyResult(resultId, verifiedResult) {
  try {
    await fetch(`${import.meta.env.VITE_API_URL}/v1/amd/results/${resultId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ verified_result: verifiedResult })
    })
    fetchVerificationQueue()
  } catch (error) {
    console.error('Error verifying result:', error)
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}
</script>
