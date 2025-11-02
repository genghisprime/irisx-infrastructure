<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Agent Management</h1>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search agents..."
          class="px-3 py-2 border rounded-md"
        />
        <select v-model="filters.status" class="px-3 py-2 border rounded-md">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="away">Away</option>
          <option value="offline">Offline</option>
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

    <!-- Agents Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Agent
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tenant
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Active Calls
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Today's Stats
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Last Active
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="agent in agents" :key="agent.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <div>
                <p class="text-sm font-medium text-gray-900">{{ agent.name }}</p>
                <p class="text-sm text-gray-500">{{ agent.email }}</p>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ agent.tenant_name }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full flex items-center w-fit"
                :class="getStatusClass(agent.status)"
              >
                <span class="w-2 h-2 rounded-full mr-1" :class="getStatusDotClass(agent.status)"></span>
                {{ agent.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ agent.active_calls || 0 }}
            </td>
            <td class="px-6 py-4">
              <div class="text-sm">
                <p class="text-gray-900">{{ agent.calls_today || 0 }} calls</p>
                <p class="text-gray-500">{{ formatDuration(agent.talk_time_today) }}</p>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(agent.last_active_at) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="agents.length === 0" class="text-center py-12">
        <p class="text-gray-500">No agents found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 50 + 1 }} to {{ Math.min(currentPage * 50, total) }} of {{ total }}
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
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const error = ref(null)
const agents = ref([])
const total = ref(0)
const currentPage = ref(1)

const filters = ref({
  search: '',
  status: '',
  tenant_id: ''
})

const totalPages = computed(() => Math.ceil(total.value / 50))

onMounted(() => {
  fetchAgents()
})

async function fetchAgents() {
  loading.value = true
  error.value = null

  try {
    const params = {
      page: currentPage.value,
      limit: 50,
      ...filters.value
    }

    const response = await adminAPI.agents.list(params)
    agents.value = response.data.agents || []
    total.value = response.data.total || 0
  } catch (err) {
    console.error('Failed to fetch agents:', err)
    error.value = 'Failed to load agents'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchAgents()
}

function changePage(page) {
  currentPage.value = page
  fetchAgents()
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    away: 'bg-yellow-100 text-yellow-800',
    offline: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function getStatusDotClass(status) {
  const classes = {
    active: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-500'
  }
  return classes[status] || 'bg-gray-500'
}

function formatDuration(seconds) {
  if (!seconds) return '0m'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function formatDate(dateString) {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return date.toLocaleDateString()
}
</script>
