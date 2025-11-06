<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">API Keys</h1>
        <p class="text-gray-500 mt-1">Manage API keys for {{ tenant?.company_name }}</p>
      </div>
      <button
        v-if="authStore.isAdmin"
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Create API Key
      </button>
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

    <!-- API Keys List -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="key in apiKeys" :key="key.id">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">{{ key.name }}</div>
              <div v-if="key.description" class="text-sm text-gray-500">{{ key.description }}</div>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center space-x-2">
                <code class="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                  {{ maskApiKey(key.key_hash) }}
                </code>
                <button
                  v-if="key.full_key"
                  @click="copyToClipboard(key.full_key)"
                  class="text-blue-600 hover:text-blue-800"
                  title="Copy full key"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p v-if="key.full_key" class="text-xs text-yellow-600 mt-1">
                ⚠️ Save this key now - it won't be shown again!
              </p>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(key.created_at) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ key.last_used_at ? formatDate(key.last_used_at) : 'Never' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="getStatusClass(key.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ key.status }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
              <button
                v-if="key.status === 'active' && authStore.isAdmin"
                @click="revokeKey(key)"
                class="text-red-600 hover:text-red-800"
              >
                Revoke
              </button>
            </td>
          </tr>
          <tr v-if="apiKeys.length === 0">
            <td colspan="6" class="px-6 py-12 text-center text-gray-500">
              No API keys found. Create one to get started.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showCreateModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Create API Key</h3>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
          <input
            v-model="newKeyName"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Production API Key"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
          <textarea
            v-model="newKeyDescription"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows="3"
            placeholder="Used for production server integration"
          ></textarea>
        </div>

        <div class="flex justify-end space-x-2">
          <button
            @click="showCreateModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="createApiKey"
            :disabled="!newKeyName"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Key
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const route = useRoute()
const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const tenant = ref(null)
const apiKeys = ref([])
const showCreateModal = ref(false)
const newKeyName = ref('')
const newKeyDescription = ref('')

onMounted(() => {
  fetchTenant()
  fetchApiKeys()
})

async function fetchTenant() {
  try {
    const response = await adminAPI.tenants.get(route.params.id)
    tenant.value = response.data
  } catch (err) {
    console.error('Failed to fetch tenant:', err)
  }
}

async function fetchApiKeys() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.apiKeys.list(route.params.id)
    apiKeys.value = response.data
  } catch (err) {
    console.error('Failed to fetch API keys:', err)
    error.value = 'Failed to load API keys'
  } finally {
    loading.value = false
  }
}

async function createApiKey() {
  try {
    const response = await adminAPI.apiKeys.create(route.params.id, {
      name: newKeyName.value,
      description: newKeyDescription.value
    })

    // Add the new key to the list with the full key visible
    apiKeys.value.unshift({
      ...response.data,
      full_key: response.data.key // The full key is only returned on creation
    })

    // Reset form
    showCreateModal.value = false
    newKeyName.value = ''
    newKeyDescription.value = ''

    // Show success message
    alert('API key created successfully! Make sure to copy it now - it won\'t be shown again.')
  } catch (err) {
    console.error('Failed to create API key:', err)
    alert('Failed to create API key')
  }
}

async function revokeKey(key) {
  if (!confirm(`Revoke API key "${key.name}"? This action cannot be undone.`)) return

  try {
    await adminAPI.apiKeys.revoke(route.params.id, key.id)
    await fetchApiKeys()
  } catch (err) {
    console.error('Failed to revoke API key:', err)
    alert('Failed to revoke API key')
  }
}

function maskApiKey(hash) {
  if (!hash) return '••••••••••••••••'
  // Show first 8 chars and last 4 chars
  if (hash.length > 12) {
    return hash.substring(0, 8) + '••••' + hash.substring(hash.length - 4)
  }
  return hash.substring(0, 4) + '••••••••'
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('API key copied to clipboard!')
  }).catch(err => {
    console.error('Failed to copy:', err)
  })
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    revoked: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}
</script>
