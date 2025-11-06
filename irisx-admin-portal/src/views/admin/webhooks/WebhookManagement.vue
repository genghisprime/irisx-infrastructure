<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Webhook Management</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading webhooks...</div>
    </div>

    <div v-else class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Total Webhooks</div>
          <div class="text-3xl font-bold text-gray-900">{{ webhooks.length }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Successful (24h)</div>
          <div class="text-3xl font-bold text-green-600">{{ stats.successful }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Failed (24h)</div>
          <div class="text-3xl font-bold text-red-600">{{ stats.failed }}</div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Delivery</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="webhook in webhooks" :key="webhook.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <RouterLink :to="`/dashboard/tenants/${webhook.tenant_id}`" class="text-sm text-blue-600 hover:underline">
                    {{ webhook.tenant_name }}
                  </RouterLink>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ webhook.event_type }}</td>
                <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{{ webhook.url }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium" :class="webhook.success_rate > 90 ? 'text-green-600' : 'text-red-600'">
                    {{ webhook.success_rate }}%
                  </div>
                  <div class="text-xs text-gray-500">{{ webhook.deliveries_24h }} deliveries</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ formatTime(webhook.last_delivery) }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    webhook.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  ]">
                    {{ webhook.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button @click="testWebhook(webhook.id)" class="text-green-600 hover:text-green-800">Test</button>
                  <button @click="viewLogs(webhook)" class="text-blue-600 hover:text-blue-800">Logs</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Webhook Logs Modal -->
      <div v-if="showLogsModal && selectedWebhook" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
          <div class="p-6">
            <div class="flex justify-between items-center mb-6">
              <h2 class="text-2xl font-bold text-gray-900">Webhook Logs: {{ selectedWebhook.event_type }}</h2>
              <button @click="showLogsModal = false" class="text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="space-y-3">
              <div v-for="log in webhookLogs" :key="log.id" class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start">
                  <div>
                    <div class="flex items-center space-x-2">
                      <span :class="[
                        'px-2 py-1 text-xs font-medium rounded',
                        log.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      ]">
                        {{ log.success ? 'Success' : 'Failed' }}
                      </span>
                      <span class="text-sm text-gray-600">{{ formatTime(log.timestamp) }}</span>
                      <span class="text-sm text-gray-600">{{ log.response_time }}ms</span>
                    </div>
                    <div v-if="!log.success" class="mt-2 text-sm text-red-600">{{ log.error }}</div>
                  </div>
                  <button v-if="!log.success" @click="retryWebhook(selectedWebhook.id, log.id)" class="text-blue-600 hover:text-blue-800 text-sm">
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const webhooks = ref([])
const showLogsModal = ref(false)
const selectedWebhook = ref(null)
const webhookLogs = ref([])

const stats = ref({
  successful: 0,
  failed: 0
})

async function fetchWebhooks() {
  loading.value = true
  try {
    const response = await adminAPI.webhooks.list()
    webhooks.value = response.data
  } catch (err) {
    console.error('Failed to fetch webhooks:', err)
    error.value = 'Failed to load webhooks'
  } finally {
    loading.value = false
  }
}

async function testWebhook(id) {
  try {
    await adminAPI.webhooks.test(id)
    alert('Test webhook sent successfully')
  } catch (err) {
    alert('Test webhook failed')
  }
}

async function viewLogs(webhook) {
  selectedWebhook.value = webhook
  try {
    const response = await adminAPI.webhooks.getLogs(webhook.id)
    webhookLogs.value = response.data
  } catch (err) {
    console.error('Failed to fetch logs:', err)
    webhookLogs.value = []
  }
  showLogsModal.value = true
}

async function retryWebhook(webhookId, logId) {
  try {
    await adminAPI.webhooks.retry(webhookId, logId)
    alert('Webhook retry initiated')
    await viewLogs(selectedWebhook.value)
  } catch (err) {
    alert('Retry failed')
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)

  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString()
}

onMounted(() => {
  fetchWebhooks()
})
</script>
