<template>
  <div class="py-6">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">Webhooks</h1>
        <button
          @click="showCreateModal = true"
          class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Create Webhook
        </button>
      </div>

      <!-- Info Banner -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-blue-800">About Webhooks</h3>
            <div class="mt-2 text-sm text-blue-700">
              <p>Webhooks allow you to receive real-time notifications when events occur. Subscribe to events like call completion, message delivery, or email opens.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Webhooks List -->
      <div class="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div v-if="isLoading" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p class="mt-2 text-gray-600">Loading webhooks...</p>
        </div>

        <div v-else-if="webhooks.length === 0" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p class="mt-2">No webhooks configured</p>
          <p class="text-sm text-gray-400 mt-1">Create your first webhook to start receiving event notifications</p>
        </div>

        <div v-else class="divide-y divide-gray-200">
          <div v-for="webhook in webhooks" :key="webhook.id" class="p-6 hover:bg-gray-50">
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center">
                  <h3 class="text-lg font-medium text-gray-900">{{ webhook.name }}</h3>
                  <span
                    :class="{
                      'bg-green-100 text-green-800': webhook.is_active,
                      'bg-gray-100 text-gray-800': !webhook.is_active
                    }"
                    class="ml-3 px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  >
                    {{ webhook.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-600 font-mono break-all">{{ webhook.url }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="event in webhook.events"
                    :key="event"
                    class="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded"
                  >
                    {{ event }}
                  </span>
                </div>
                <div class="mt-3 flex items-center text-sm text-gray-500">
                  <span>Last delivery: {{ formatDateTime(webhook.last_delivery_at) }}</span>
                  <span class="mx-2">•</span>
                  <span v-if="webhook.failure_count > 0" class="text-red-600">
                    {{ webhook.failure_count }} recent failures
                  </span>
                  <span v-else class="text-green-600">No recent failures</span>
                </div>
              </div>
              <div class="ml-4 flex-shrink-0 flex space-x-2">
                <button
                  @click="viewWebhookDetails(webhook)"
                  class="text-indigo-600 hover:text-indigo-900 px-3 py-1 border border-indigo-600 rounded hover:bg-indigo-50"
                >
                  Details
                </button>
                <button
                  @click="testWebhook(webhook.id)"
                  :disabled="testingWebhookId === webhook.id"
                  class="text-blue-600 hover:text-blue-900 px-3 py-1 border border-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
                >
                  {{ testingWebhookId === webhook.id ? 'Testing...' : 'Test' }}
                </button>
                <button
                  v-if="webhook.is_active"
                  @click="toggleWebhook(webhook.id, false)"
                  class="text-yellow-600 hover:text-yellow-900 px-3 py-1 border border-yellow-600 rounded hover:bg-yellow-50"
                >
                  Disable
                </button>
                <button
                  v-else
                  @click="toggleWebhook(webhook.id, true)"
                  class="text-green-600 hover:text-green-900 px-3 py-1 border border-green-600 rounded hover:bg-green-50"
                >
                  Enable
                </button>
                <button
                  @click="deleteWebhook(webhook.id)"
                  class="text-red-600 hover:text-red-900 px-3 py-1 border border-red-600 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Webhook Modal -->
    <div
      v-if="showCreateModal"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="showCreateModal = false"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <form @submit.prevent="createWebhook">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg leading-6 font-medium text-gray-900">Create Webhook</h3>
                <button type="button" @click="showCreateModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div v-if="createError" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {{ createError }}
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    v-model="createForm.name"
                    type="text"
                    required
                    placeholder="My Production Webhook"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input
                    v-model="createForm.url"
                    type="url"
                    required
                    placeholder="https://example.com/webhook"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p class="mt-1 text-xs text-gray-500">Must be HTTPS for production webhooks</p>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Events to Subscribe</label>
                  <div class="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-3">
                    <label v-for="event in availableEvents" :key="event.value" class="flex items-start">
                      <input
                        v-model="createForm.events"
                        :value="event.value"
                        type="checkbox"
                        class="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                      <span class="ml-2">
                        <span class="block text-sm text-gray-900">{{ event.label }}</span>
                        <span class="block text-xs text-gray-500">{{ event.description }}</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Secret (Optional)</label>
                  <input
                    v-model="createForm.secret"
                    type="text"
                    placeholder="Used to sign webhook payloads"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p class="mt-1 text-xs text-gray-500">We'll include an HMAC signature in the X-Webhook-Signature header</p>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                :disabled="isCreating || createForm.events.length === 0"
                class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ isCreating ? 'Creating...' : 'Create Webhook' }}
              </button>
              <button
                type="button"
                @click="showCreateModal = false"
                class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Webhook Details Modal -->
    <div
      v-if="selectedWebhook"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="selectedWebhook = null"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900">Webhook Delivery Log</h3>
              <button @click="selectedWebhook = null" class="text-gray-400 hover:text-gray-500">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <dl class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 mb-6 bg-gray-50 p-4 rounded">
              <div>
                <dt class="text-sm font-medium text-gray-500">Name</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedWebhook.name }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="mt-1">
                  <span
                    :class="{
                      'bg-green-100 text-green-800': selectedWebhook.is_active,
                      'bg-gray-100 text-gray-800': !selectedWebhook.is_active
                    }"
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  >
                    {{ selectedWebhook.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </dd>
              </div>
              <div class="col-span-2">
                <dt class="text-sm font-medium text-gray-500">URL</dt>
                <dd class="mt-1 text-sm text-gray-900 font-mono break-all">{{ selectedWebhook.url }}</dd>
              </div>
            </dl>

            <!-- Delivery History -->
            <h4 class="text-sm font-medium text-gray-900 mb-3">Recent Deliveries</h4>
            <div class="max-h-96 overflow-y-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-if="deliveryHistory.length === 0">
                    <td colspan="4" class="px-4 py-8 text-center text-gray-500">No deliveries yet</td>
                  </tr>
                  <tr v-for="delivery in deliveryHistory" :key="delivery.id">
                    <td class="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {{ formatDateTime(delivery.created_at) }}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">{{ delivery.event_type }}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <span
                        :class="{
                          'bg-green-100 text-green-800': delivery.success,
                          'bg-red-100 text-red-800': !delivery.success
                        }"
                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      >
                        {{ delivery.success ? 'Success' : 'Failed' }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">
                      {{ delivery.response_code || '-' }}
                      <span v-if="delivery.error_message" class="text-red-600">
                        ({{ delivery.error_message }})
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              @click="selectedWebhook = null"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
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
import { apiClient } from '@/utils/api'

const webhooks = ref([])
const isLoading = ref(false)
const showCreateModal = ref(false)
const isCreating = ref(false)
const createError = ref('')
const selectedWebhook = ref(null)
const deliveryHistory = ref([])
const testingWebhookId = ref(null)

const availableEvents = [
  { value: 'call.initiated', label: 'Call Initiated', description: 'Triggered when a call starts' },
  { value: 'call.ringing', label: 'Call Ringing', description: 'Triggered when recipient phone is ringing' },
  { value: 'call.answered', label: 'Call Answered', description: 'Triggered when call is answered' },
  { value: 'call.completed', label: 'Call Completed', description: 'Triggered when call ends' },
  { value: 'call.failed', label: 'Call Failed', description: 'Triggered when call fails' },
  { value: 'message.sent', label: 'Message Sent', description: 'SMS/MMS sent successfully' },
  { value: 'message.delivered', label: 'Message Delivered', description: 'SMS/MMS delivered to recipient' },
  { value: 'message.failed', label: 'Message Failed', description: 'SMS/MMS delivery failed' },
  { value: 'message.received', label: 'Message Received', description: 'Inbound SMS/MMS received' },
  { value: 'email.sent', label: 'Email Sent', description: 'Email sent successfully' },
  { value: 'email.delivered', label: 'Email Delivered', description: 'Email delivered to recipient' },
  { value: 'email.bounced', label: 'Email Bounced', description: 'Email bounced' },
  { value: 'email.opened', label: 'Email Opened', description: 'Recipient opened email' },
  { value: 'email.clicked', label: 'Email Link Clicked', description: 'Recipient clicked link in email' }
]

const createForm = ref({
  name: '',
  url: '',
  events: [],
  secret: ''
})

onMounted(() => {
  fetchWebhooks()
})

async function fetchWebhooks() {
  isLoading.value = true
  try {
    const response = await apiClient.get('/v1/webhooks')
    webhooks.value = response.data.webhooks || []
  } catch (error) {
    console.error('Failed to fetch webhooks:', error)
    webhooks.value = []
  } finally {
    isLoading.value = false
  }
}

async function createWebhook() {
  isCreating.value = true
  createError.value = ''

  try {
    await apiClient.post('/v1/webhooks', {
      name: createForm.value.name,
      url: createForm.value.url,
      events: createForm.value.events,
      secret: createForm.value.secret || null
    })

    showCreateModal.value = false
    createForm.value = { name: '', url: '', events: [], secret: '' }
    await fetchWebhooks()
  } catch (error) {
    createError.value = error.response?.data?.error || 'Failed to create webhook'
  } finally {
    isCreating.value = false
  }
}

async function viewWebhookDetails(webhook) {
  selectedWebhook.value = webhook

  try {
    const response = await apiClient.get(`/v1/webhooks/${webhook.id}/deliveries`)
    deliveryHistory.value = response.data.deliveries || []
  } catch (error) {
    console.error('Failed to fetch delivery history:', error)
    deliveryHistory.value = []
  }
}

async function testWebhook(webhookId) {
  testingWebhookId.value = webhookId

  try {
    await apiClient.post(`/v1/webhooks/${webhookId}/test`)
    alert('Test webhook sent successfully! Check your endpoint.')
  } catch (error) {
    alert('Failed to send test webhook: ' + (error.response?.data?.error || 'Unknown error'))
  } finally {
    testingWebhookId.value = null
  }
}

async function toggleWebhook(webhookId, isActive) {
  try {
    await apiClient.patch(`/v1/webhooks/${webhookId}`, { is_active: isActive })
    await fetchWebhooks()
  } catch (error) {
    alert('Failed to update webhook: ' + (error.response?.data?.error || 'Unknown error'))
  }
}

async function deleteWebhook(webhookId) {
  if (!confirm('Are you sure you want to delete this webhook? This action cannot be undone.')) {
    return
  }

  try {
    await apiClient.delete(`/v1/webhooks/${webhookId}`)
    await fetchWebhooks()
  } catch (error) {
    alert('Failed to delete webhook: ' + (error.response?.data?.error || 'Unknown error'))
  }
}

function formatDateTime(dateString) {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
