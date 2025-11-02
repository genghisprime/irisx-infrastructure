<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Conversation Oversight</h1>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search conversations..."
          class="px-3 py-2 border rounded-md"
        />
        <select v-model="filters.channel" class="px-3 py-2 border rounded-md">
          <option value="">All Channels</option>
          <option value="voice">Voice</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="social">Social</option>
        </select>
        <select v-model="filters.status" class="px-3 py-2 border rounded-md">
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
        <select v-model="filters.tenant_id" class="px-3 py-2 border rounded-md">
          <option value="">All Tenants</option>
        </select>
        <button
          @click="applyFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Open Conversations</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ stats.open || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Pending</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ stats.pending || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">SLA Breaches</p>
        <p class="text-2xl font-bold text-red-600 mt-2">{{ stats.sla_breaches || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Avg Response Time</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ stats.avg_response_time || '0m' }}</p>
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

    <!-- Conversations Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              ID
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tenant
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Channel
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Customer
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Agent
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Created
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="conv in conversations" :key="conv.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">
              #{{ conv.id }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ conv.tenant_name }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getChannelClass(conv.channel)"
              >
                {{ conv.channel }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ conv.customer_name || 'Unknown' }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ conv.agent_name || 'Unassigned' }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(conv.status)"
              >
                {{ conv.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(conv.created_at) }}
            </td>
            <td class="px-6 py-4 text-right text-sm space-x-2">
              <button
                @click="viewConversation(conv)"
                class="text-blue-600 hover:text-blue-800"
              >
                View
              </button>
              <button
                v-if="conv.status !== 'closed' && authStore.isAdmin"
                @click="closeConversation(conv)"
                class="text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="conversations.length === 0" class="text-center py-12">
        <p class="text-gray-500">No conversations found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 20 + 1 }} to {{ Math.min(currentPage * 20, total) }} of {{ total }}
        </div>
        <div class="flex space-x-2">
          <button
            @click="changePage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            @click="changePage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const conversations = ref([])
const stats = ref({})
const total = ref(0)
const currentPage = ref(1)

const filters = ref({
  search: '',
  channel: '',
  status: '',
  tenant_id: ''
})

const totalPages = computed(() => Math.ceil(total.value / 20))

onMounted(() => {
  fetchConversations()
  fetchStats()
})

async function fetchConversations() {
  loading.value = true
  error.value = null

  try {
    const params = {
      page: currentPage.value,
      limit: 20,
      ...filters.value
    }

    const response = await adminAPI.conversations.list(params)
    conversations.value = response.data.conversations || []
    total.value = response.data.total || 0
  } catch (err) {
    console.error('Failed to fetch conversations:', err)
    error.value = 'Failed to load conversations'
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  try {
    const response = await adminAPI.conversations.getStats()
    stats.value = response.data
  } catch (err) {
    console.error('Failed to fetch stats:', err)
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchConversations()
}

function changePage(page) {
  currentPage.value = page
  fetchConversations()
}

function viewConversation(conv) {
  // TODO: Implement conversation detail modal
  console.log('View conversation:', conv)
}

async function closeConversation(conv) {
  if (!confirm(`Close conversation #${conv.id}?`)) return

  try {
    await adminAPI.conversations.bulkClose({ conversation_ids: [conv.id] })
    await fetchConversations()
  } catch (err) {
    console.error('Failed to close conversation:', err)
    alert('Failed to close conversation')
  }
}

function getChannelClass(channel) {
  const classes = {
    voice: 'bg-blue-100 text-blue-800',
    sms: 'bg-green-100 text-green-800',
    email: 'bg-purple-100 text-purple-800',
    whatsapp: 'bg-green-100 text-green-800',
    social: 'bg-pink-100 text-pink-800'
  }
  return classes[channel] || 'bg-gray-100 text-gray-800'
}

function getStatusClass(status) {
  const classes = {
    open: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    closed: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}
</script>
