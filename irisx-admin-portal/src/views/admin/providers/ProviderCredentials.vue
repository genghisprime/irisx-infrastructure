<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Provider & Carrier Management</h1>
      <button
        v-if="authStore.isAdmin && activeTab === 'credentials'"
        @click="showAddModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Add Credentials
      </button>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="border-b border-gray-200">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'credentials'"
            :class="activeTab === 'credentials' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Credentials
          </button>
          <button
            @click="activeTab = 'lcr'"
            :class="activeTab === 'lcr' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            LCR Routing
          </button>
          <button
            @click="activeTab = 'health'"
            :class="activeTab === 'health' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Health Monitoring
          </button>
          <button
            @click="activeTab = 'failover'"
            :class="activeTab === 'failover' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Failover
          </button>
        </nav>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div v-if="activeTab === 'credentials'">
      <!-- Info Alert -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          <strong>🔒 Security:</strong> All credentials are encrypted using AES-256-CBC. Only masked values are displayed.
        </p>
      </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select v-model="filters.type" class="px-3 py-2 border rounded-md">
          <option value="">All Types</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="social">Social Media</option>
        </select>
        <select v-model="filters.provider" class="px-3 py-2 border rounded-md">
          <option value="">All Providers</option>
          <option value="sendgrid">SendGrid</option>
          <option value="mailgun">Mailgun</option>
          <option value="twilio">Twilio</option>
          <option value="telnyx">Telnyx</option>
          <option value="meta">Meta (WhatsApp)</option>
        </select>
        <button
          @click="applyFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Credentials Grid -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        v-for="cred in credentials"
        :key="cred.id"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ cred.provider_name }}</h3>
            <p class="text-sm text-gray-500">{{ cred.provider_type }}</p>
          </div>
          <span
            class="px-3 py-1 text-xs font-medium rounded-full"
            :class="cred.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
          >
            {{ cred.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>

        <!-- Credentials Info -->
        <div class="space-y-2 mb-4">
          <div>
            <p class="text-xs text-gray-500 uppercase">Credentials</p>
            <p class="text-sm text-gray-900">{{ cred.credentials_preview || 'API Credentials configured' }}</p>
          </div>
          <div v-if="cred.tenant_name">
            <p class="text-xs text-gray-500 uppercase">Tenant</p>
            <p class="text-sm text-gray-900">{{ cred.tenant_name }}</p>
          </div>
          <div v-else>
            <p class="text-xs text-gray-500 uppercase">Scope</p>
            <p class="text-sm text-gray-900">Global (All Tenants)</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex space-x-2 pt-4 border-t">
          <button
            v-if="authStore.isAdmin"
            @click="testConnection(cred)"
            class="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm"
          >
            Test Connection
          </button>
          <button
            v-if="authStore.isAdmin"
            @click="editCredential(cred)"
            class="flex-1 px-3 py-2 bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 text-sm"
          >
            Edit
          </button>
          <button
            v-if="authStore.isSuperAdmin"
            @click="deleteCredential(cred)"
            class="px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && !error && credentials.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-gray-500">No provider credentials found</p>
    </div>
    </div>

    <!-- LCR Routing Tab -->
    <div v-if="activeTab === 'lcr'" class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-4">Least Cost Routing (LCR) Configuration</h2>
      <p class="text-sm text-gray-600 mb-6">Configure carrier priority and cost routing for optimizing voice call expenses.</p>

      <div class="space-y-4">
        <div class="border rounded-lg p-4" v-for="(route, index) in lcrRoutes" :key="index">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-medium">Priority {{ route.priority }}</h3>
            <span class="text-sm text-gray-500">Cost per minute: ${{ route.cost_per_minute }}</span>
          </div>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-600">Carrier:</span>
              <span class="ml-2 font-medium">{{ route.carrier }}</span>
            </div>
            <div>
              <span class="text-gray-600">Success Rate:</span>
              <span class="ml-2 font-medium">{{ route.success_rate }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Health Monitoring Tab -->
    <div v-if="activeTab === 'health'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-lg shadow p-6" v-for="carrier in carrierHealth" :key="carrier.name">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">{{ carrier.name }}</h3>
            <span
              :class="carrier.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
              class="px-2 py-1 text-xs font-medium rounded-full"
            >
              {{ carrier.status }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Uptime:</span>
              <span class="font-medium">{{ carrier.uptime }}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Avg Latency:</span>
              <span class="font-medium">{{ carrier.latency }}ms</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Error Rate:</span>
              <span class="font-medium">{{ carrier.error_rate }}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Last Check:</span>
              <span class="font-medium">{{ carrier.last_check }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Failover Tab -->
    <div v-if="activeTab === 'failover'" class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-4">Emergency Failover Configuration</h2>
      <p class="text-sm text-gray-600 mb-6">Configure automatic failover rules when primary carriers become unavailable.</p>

      <div class="space-y-6">
        <div class="border rounded-lg p-4">
          <h3 class="font-medium mb-4">Failover Rules</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between py-2 border-b">
              <div>
                <p class="text-sm font-medium">High Error Rate Failover</p>
                <p class="text-xs text-gray-500">Switch if error rate exceeds 5%</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.high_error" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div class="flex items-center justify-between py-2 border-b">
              <div>
                <p class="text-sm font-medium">Latency Threshold Failover</p>
                <p class="text-xs text-gray-500">Switch if latency exceeds 200ms</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.high_latency" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div class="flex items-center justify-between py-2">
              <div>
                <p class="text-sm font-medium">Carrier Unavailable Failover</p>
                <p class="text-xs text-gray-500">Switch immediately if carrier is down</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.carrier_down" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Credentials Modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showAddModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add Provider Credentials</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Type</label>
            <select v-model="newCredential.provider_type" class="w-full px-3 py-2 border rounded-md">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="social">Social Media</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Provider</label>
            <select v-model="newCredential.provider_name" class="w-full px-3 py-2 border rounded-md">
              <option value="sendgrid">SendGrid</option>
              <option value="mailgun">Mailgun</option>
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
              <option value="meta">Meta (WhatsApp)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Credentials (JSON)</label>
            <textarea
              v-model="newCredential.credentials"
              rows="4"
              placeholder='{"api_key": "your-key", "api_secret": "your-secret"}'
              class="w-full px-3 py-2 border rounded-md font-mono text-sm"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button
            @click="showAddModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="addCredential"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Credentials
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const activeTab = ref('credentials')
const loading = ref(true)
const error = ref(null)
const credentials = ref([])
const showAddModal = ref(false)

// LCR Routes data
const lcrRoutes = ref([
  { priority: 1, carrier: 'Twilio', cost_per_minute: 0.0085, success_rate: 99.2 },
  { priority: 2, carrier: 'Telnyx', cost_per_minute: 0.0090, success_rate: 98.8 },
  { priority: 3, carrier: 'Bandwidth', cost_per_minute: 0.0095, success_rate: 98.5 }
])

// Carrier Health data
const carrierHealth = ref([
  { name: 'Twilio', status: 'healthy', uptime: 99.98, latency: 45, error_rate: 0.2, last_check: '2 mins ago' },
  { name: 'Telnyx', status: 'healthy', uptime: 99.95, latency: 52, error_rate: 0.4, last_check: '2 mins ago' },
  { name: 'Bandwidth', status: 'healthy', uptime: 99.92, latency: 48, error_rate: 0.5, last_check: '3 mins ago' }
])

// Failover Rules
const failoverRules = ref({
  high_error: true,
  high_latency: true,
  carrier_down: true
})

const filters = ref({
  type: '',
  provider: ''
})

const newCredential = ref({
  provider_type: 'email',
  provider_name: 'sendgrid',
  credentials: ''
})

onMounted(() => {
  fetchCredentials()
})

async function fetchCredentials() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.providers.list(filters.value)
    credentials.value = response.data.providers || []
  } catch (err) {
    console.error('Failed to fetch credentials:', err)
    error.value = 'Failed to load provider credentials'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  fetchCredentials()
}

async function addCredential() {
  try {
    const credentialsObj = JSON.parse(newCredential.value.credentials)
    await adminAPI.providers.create({
      provider_type: newCredential.value.provider_type,
      provider_name: newCredential.value.provider_name,
      credentials: credentialsObj
    })
    showAddModal.value = false
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to add credentials:', err)
    alert('Failed to add credentials. Check JSON format.')
  }
}

async function testConnection(cred) {
  try {
    const response = await adminAPI.providers.test(cred.id)
    if (response.data.success) {
      alert('✅ Connection test successful!')
    } else {
      alert('❌ Connection test failed: ' + (response.data.error || 'Unknown error'))
    }
  } catch (err) {
    console.error('Failed to test connection:', err)
    alert('❌ Connection test failed')
  }
}

function editCredential(cred) {
  // TODO: Implement edit modal
  console.log('Edit credential:', cred)
}

async function deleteCredential(cred) {
  if (!confirm(`Delete ${cred.provider_name} credentials? This action cannot be undone.`)) return

  try {
    await adminAPI.providers.delete(cred.id)
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to delete credentials:', err)
    alert('Failed to delete credentials')
  }
}
</script>
