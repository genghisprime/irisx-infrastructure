<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Webhook Configuration</h1>
        <p class="text-sm text-gray-600 mt-1">Configure webhooks for real-time event notifications</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Create Webhook
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Webhooks List -->
    <div v-else class="space-y-4">
      <div
        v-for="webhook in webhooks"
        :key="webhook.id"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center space-x-2 mb-2">
              <h3 class="text-lg font-semibold text-gray-900">{{ webhook.name }}</h3>
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="webhook.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
              >
                {{ webhook.active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <p class="text-sm text-gray-600 mb-3">{{ webhook.url }}</p>
            <div class="flex flex-wrap gap-2 mb-3">
              <span
                v-for="event in webhook.events"
                :key="event"
                class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded"
              >
                {{ event }}
              </span>
            </div>
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p class="text-gray-500">Last Delivery</p>
                <p class="font-medium">{{ webhook.last_delivery_at ? formatDate(webhook.last_delivery_at) : 'Never' }}</p>
              </div>
              <div>
                <p class="text-gray-500">Success Rate</p>
                <p class="font-medium">{{ webhook.success_rate || 0 }}%</p>
              </div>
              <div>
                <p class="text-gray-500">Total Deliveries</p>
                <p class="font-medium">{{ webhook.delivery_count || 0 }}</p>
              </div>
            </div>
          </div>
          <div class="flex space-x-2">
            <button
              @click="testWebhook(webhook)"
              class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
            >
              Test
            </button>
            <button
              @click="editWebhook(webhook)"
              class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
            >
              Edit
            </button>
            <button
              @click="deleteWebhook(webhook)"
              class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div v-if="webhooks.length === 0" class="bg-white rounded-lg shadow p-12 text-center">
        <p class="text-gray-500 mb-4">No webhooks configured</p>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create First Webhook
        </button>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingWebhook"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="closeModal"
    >
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">{{ editingWebhook ? 'Edit Webhook' : 'Create Webhook' }}</h3>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Webhook Name</label>
            <input
              v-model="webhookForm.name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="My Webhook"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Endpoint URL</label>
            <input
              v-model="webhookForm.url"
              type="url"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="https://example.com/webhook"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Events</label>
            <div class="grid grid-cols-2 gap-2">
              <label v-for="event in availableEvents" :key="event.value" class="flex items-center">
                <input
                  type="checkbox"
                  :value="event.value"
                  v-model="webhookForm.events"
                  class="mr-2"
                />
                <span class="text-sm">{{ event.label }}</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Secret Key (Optional)</label>
            <input
              v-model="webhookForm.secret"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="For webhook signature verification"
            />
          </div>

          <div class="flex items-center">
            <input
              v-model="webhookForm.active"
              type="checkbox"
              class="mr-2"
            />
            <label class="text-sm text-gray-700">Active</label>
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {{ editingWebhook ? 'Update' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../utils/api'

const loading = ref(true)
const webhooks = ref([])
const showCreateModal = ref(false)
const editingWebhook = ref(null)

const webhookForm = ref({
  name: '',
  url: '',
  events: [],
  secret: '',
  active: true
})

const availableEvents = [
  { value: 'call.created', label: 'Call Created' },
  { value: 'call.answered', label: 'Call Answered' },
  { value: 'call.completed', label: 'Call Completed' },
  { value: 'sms.received', label: 'SMS Received' },
  { value: 'sms.sent', label: 'SMS Sent' },
  { value: 'email.received', label: 'Email Received' },
  { value: 'email.sent', label: 'Email Sent' },
  { value: 'email.opened', label: 'Email Opened' },
  { value: 'whatsapp.received', label: 'WhatsApp Received' },
  { value: 'conversation.created', label: 'Conversation Created' },
  { value: 'conversation.closed', label: 'Conversation Closed' }
]

onMounted(() => {
  fetchWebhooks()
})

async function fetchWebhooks() {
  loading.value = true
  try {
    const response = await apiClient.get('/v1/webhooks')
    webhooks.value = response.data.webhooks || []
  } catch (error) {
    console.error('Failed to fetch webhooks:', error)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    if (editingWebhook.value) {
      await apiClient.patch(`/v1/webhooks/${editingWebhook.value.id}`, webhookForm.value)
    } else {
      await apiClient.post('/v1/webhooks', webhookForm.value)
    }
    closeModal()
    await fetchWebhooks()
  } catch (error) {
    console.error('Failed to save webhook:', error)
    alert('Failed to save webhook')
  }
}

function editWebhook(webhook) {
  editingWebhook.value = webhook
  webhookForm.value = { ...webhook }
}

async function testWebhook(webhook) {
  try {
    const response = await apiClient.post(`/v1/webhooks/${webhook.id}/test`)
    if (response.data.success) {
      alert('✅ Webhook test successful!')
    } else {
      alert('❌ Webhook test failed: ' + (response.data.error || 'Unknown error'))
    }
  } catch (error) {
    alert('Failed to test webhook')
  }
}

async function deleteWebhook(webhook) {
  if (!confirm(`Delete webhook "${webhook.name}"?`)) return
  try {
    await apiClient.delete(`/v1/webhooks/${webhook.id}`)
    await fetchWebhooks()
  } catch (error) {
    alert('Failed to delete webhook')
  }
}

function closeModal() {
  showCreateModal.value = false
  editingWebhook.value = null
  webhookForm.value = { name: '', url: '', events: [], secret: '', active: true }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString()
}
</script>
