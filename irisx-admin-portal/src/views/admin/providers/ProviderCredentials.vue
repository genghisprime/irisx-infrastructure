<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Provider Credentials</h1>
      <button
        v-if="authStore.isAdmin"
        @click="showAddModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Add Credentials
      </button>
    </div>

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
            <h3 class="text-lg font-semibold text-gray-900">{{ cred.provider }}</h3>
            <p class="text-sm text-gray-500">{{ cred.type }}</p>
          </div>
          <span
            class="px-3 py-1 text-xs font-medium rounded-full"
            :class="cred.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
          >
            {{ cred.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>

        <!-- Masked Credentials -->
        <div class="space-y-2 mb-4">
          <div v-for="(value, key) in cred.masked_credentials" :key="key">
            <p class="text-xs text-gray-500 uppercase">{{ key }}</p>
            <p class="text-sm text-gray-900 font-mono">{{ value }}</p>
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
            <select v-model="newCredential.type" class="w-full px-3 py-2 border rounded-md">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="social">Social Media</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Provider</label>
            <select v-model="newCredential.provider" class="w-full px-3 py-2 border rounded-md">
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

const loading = ref(true)
const error = ref(null)
const credentials = ref([])
const showAddModal = ref(false)

const filters = ref({
  type: '',
  provider: ''
})

const newCredential = ref({
  type: 'email',
  provider: 'sendgrid',
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
      type: newCredential.value.type,
      provider: newCredential.value.provider,
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
  if (!confirm(`Delete ${cred.provider} credentials? This action cannot be undone.`)) return

  try {
    await adminAPI.providers.delete(cred.id)
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to delete credentials:', err)
    alert('Failed to delete credentials')
  }
}
</script>
