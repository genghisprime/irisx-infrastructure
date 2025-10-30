<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">API Keys</h1>
        <p class="mt-1 text-sm text-gray-600">
          Manage your API keys for authenticating requests to the IRISX API.
        </p>
      </div>
      <button
        @click="showCreateModal = true"
        class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create API Key
      </button>
    </div>

    <!-- API Keys List -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-4 py-5 sm:p-6">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <p class="text-gray-500">Loading API keys...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="apiKeys.length === 0" class="text-center py-8">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
          <p class="mt-1 text-sm text-gray-500">Get started by creating a new API key.</p>
        </div>

        <!-- API Keys Table -->
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Key
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Used
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 bg-gray-50 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="key in apiKeys" :key="key.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ key.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                  {{ key.key_masked }}
                  <button
                    @click="copyToClipboard(key.key_full || key.key_masked)"
                    class="ml-2 text-indigo-600 hover:text-indigo-900"
                    title="Copy to clipboard"
                  >
                    <svg class="h-4 w-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(key.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ key.last_used_at ? formatDate(key.last_used_at) : 'Never' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="key.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ key.is_active ? 'Active' : 'Revoked' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    v-if="key.is_active"
                    @click="revokeKey(key.id)"
                    class="text-red-600 hover:text-red-900"
                  >
                    Revoke
                  </button>
                  <button
                    v-else
                    @click="deleteKey(key.id)"
                    class="text-gray-600 hover:text-gray-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create API Key Modal -->
    <div v-if="showCreateModal" class="fixed z-10 inset-0 overflow-y-auto">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showCreateModal = false"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
              Create New API Key
            </h3>

            <div v-if="newApiKey" class="mb-4 p-4 bg-green-50 border border-green-200 rounded">
              <p class="text-sm text-green-800 mb-2">
                <strong>API Key created successfully!</strong>
              </p>
              <p class="text-xs text-green-700 mb-2">
                Make sure to copy your API key now. You won't be able to see it again!
              </p>
              <div class="flex items-center">
                <code class="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono">
                  {{ newApiKey }}
                </code>
                <button
                  @click="copyToClipboard(newApiKey)"
                  class="ml-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Copy
                </button>
              </div>
            </div>

            <div v-else>
              <div class="mb-4">
                <label for="key-name" class="block text-sm font-medium text-gray-700">
                  Key Name
                </label>
                <input
                  id="key-name"
                  v-model="createForm.name"
                  type="text"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Production API Key"
                />
              </div>

              <div v-if="createError" class="mb-4 text-sm text-red-600">
                {{ createError }}
              </div>
            </div>
          </div>

          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              v-if="!newApiKey"
              @click="createApiKey"
              :disabled="creating || !createForm.name"
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {{ creating ? 'Creating...' : 'Create Key' }}
            </button>
            <button
              @click="closeCreateModal"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              {{ newApiKey ? 'Close' : 'Cancel' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../../utils/api'

const loading = ref(true)
const apiKeys = ref([])
const showCreateModal = ref(false)
const createForm = ref({ name: '' })
const creating = ref(false)
const createError = ref(null)
const newApiKey = ref(null)

onMounted(async () => {
  await fetchApiKeys()
})

async function fetchApiKeys() {
  loading.value = true
  try {
    const response = await apiClient.get('/v1/api-keys')
    apiKeys.value = response.data.keys || []
  } catch (error) {
    console.error('Failed to fetch API keys:', error)
  } finally {
    loading.value = false
  }
}

async function createApiKey() {
  creating.value = true
  createError.value = null

  try {
    const response = await apiClient.post('/v1/api-keys', {
      name: createForm.value.name
    })

    newApiKey.value = response.data.key
    await fetchApiKeys()
  } catch (error) {
    createError.value = error.response?.data?.message || 'Failed to create API key'
  } finally {
    creating.value = false
  }
}

async function revokeKey(keyId) {
  if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
    return
  }

  try {
    await apiClient.delete(`/v1/api-keys/${keyId}`)
    await fetchApiKeys()
  } catch (error) {
    alert('Failed to revoke API key')
  }
}

async function deleteKey(keyId) {
  if (!confirm('Are you sure you want to delete this API key?')) {
    return
  }

  try {
    await apiClient.delete(`/v1/api-keys/${keyId}`)
    await fetchApiKeys()
  } catch (error) {
    alert('Failed to delete API key')
  }
}

function closeCreateModal() {
  showCreateModal.value = false
  createForm.value = { name: '' }
  newApiKey.value = null
  createError.value = null
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Copied to clipboard!')
  })
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString()
}
</script>
