<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">Call Logs</h1>
      <p class="mt-1 text-sm text-gray-600">
        View and search your call history.
      </p>
    </div>

    <!-- Filters -->
    <div class="bg-white shadow rounded-lg p-4 mb-6">
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
        <!-- Status Filter -->
        <div>
          <label for="status-filter" class="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="status-filter"
            v-model="filters.status"
            @change="fetchCallLogs"
            class="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="busy">Busy</option>
            <option value="no-answer">No Answer</option>
          </select>
        </div>

        <!-- Date From -->
        <div>
          <label for="date-from" class="block text-sm font-medium text-gray-700 mb-1">
            From Date
          </label>
          <input
            id="date-from"
            v-model="filters.dateFrom"
            type="date"
            @change="fetchCallLogs"
            class="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        <!-- Date To -->
        <div>
          <label for="date-to" class="block text-sm font-medium text-gray-700 mb-1">
            To Date
          </label>
          <input
            id="date-to"
            v-model="filters.dateTo"
            type="date"
            @change="fetchCallLogs"
            class="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>

        <!-- Search -->
        <div>
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            id="search"
            v-model="filters.search"
            type="text"
            @input="debouncedSearch"
            placeholder="Phone number..."
            class="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
      </div>
    </div>

    <!-- Call Logs Table -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-4 py-5 sm:p-6">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <p class="text-gray-500">Loading call logs...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="callLogs.length === 0" class="text-center py-8">
          <svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="mx-auto  text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No call logs found</h3>
          <p class="mt-1 text-sm text-gray-500">Try adjusting your filters or make your first call.</p>
        </div>

        <!-- Calls Table -->
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th class="px-6 py-3 bg-gray-50 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="call in callLogs" :key="call.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatDateTime(call.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ call.from_number }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ call.to_number }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ formatDuration(call.duration) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getStatusClass(call.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ call.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ call.cost ? `$${call.cost.toFixed(4)}` : '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    @click="viewCallDetails(call)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    Details
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div class="flex-1 flex justify-between sm:hidden">
              <button
                @click="previousPage"
                :disabled="currentPage === 1"
                class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                @click="nextPage"
                :disabled="!hasNextPage"
                class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p class="text-sm text-gray-700">
                  Showing
                  <span class="font-medium">{{ (currentPage - 1) * pageSize + 1 }}</span>
                  to
                  <span class="font-medium">{{ Math.min(currentPage * pageSize, totalCalls) }}</span>
                  of
                  <span class="font-medium">{{ totalCalls }}</span>
                  results
                </p>
              </div>
              <div>
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    @click="previousPage"
                    :disabled="currentPage === 1"
                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    @click="nextPage"
                    :disabled="!hasNextPage"
                    class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Call Details Modal -->
    <div v-if="selectedCall" class="fixed z-10 inset-0 overflow-y-auto">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="selectedCall = null"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
              Call Details
            </h3>

            <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt class="text-sm font-medium text-gray-500">Call ID</dt>
                <dd class="mt-1 text-sm text-gray-900 font-mono">{{ selectedCall.id }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="mt-1">
                  <span :class="getStatusClass(selectedCall.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ selectedCall.status }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">From Number</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedCall.from_number }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">To Number</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedCall.to_number }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Duration</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ formatDuration(selectedCall.duration) }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Cost</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedCall.cost ? `$${selectedCall.cost.toFixed(4)}` : '-' }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Started At</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ formatDateTime(selectedCall.created_at) }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Ended At</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedCall.ended_at ? formatDateTime(selectedCall.ended_at) : '-' }}</dd>
              </div>
              <div v-if="selectedCall.recording_url" class="sm:col-span-2">
                <dt class="text-sm font-medium text-gray-500">Recording</dt>
                <dd class="mt-1">
                  <audio controls class="w-full">
                    <source :src="selectedCall.recording_url" type="audio/mpeg">
                    Your browser does not support audio playback.
                  </audio>
                </dd>
              </div>
            </dl>
          </div>

          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              @click="selectedCall = null"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm"
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
import { apiClient } from '../../utils/api'

const loading = ref(true)
const callLogs = ref([])
const selectedCall = ref(null)
const currentPage = ref(1)
const pageSize = ref(25)
const totalCalls = ref(0)
const hasNextPage = ref(false)

const filters = ref({
  status: '',
  dateFrom: '',
  dateTo: '',
  search: ''
})

let searchTimeout = null

onMounted(async () => {
  await fetchCallLogs()
})

async function fetchCallLogs() {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      ...filters.value
    }

    const response = await apiClient.get('/v1/calls', { params })
    callLogs.value = response.data.calls || []
    totalCalls.value = response.data.total || 0
    hasNextPage.value = response.data.has_next || false
  } catch (error) {
    console.error('Failed to fetch call logs:', error)
  } finally {
    loading.value = false
  }
}

function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    fetchCallLogs()
  }, 500)
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    fetchCallLogs()
  }
}

function nextPage() {
  if (hasNextPage.value) {
    currentPage.value++
    fetchCallLogs()
  }
}

function viewCallDetails(call) {
  selectedCall.value = call
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function formatDuration(seconds) {
  if (!seconds) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getStatusClass(status) {
  const classes = {
    'completed': 'bg-green-100 text-green-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    'failed': 'bg-red-100 text-red-800',
    'busy': 'bg-yellow-100 text-yellow-800',
    'no-answer': 'bg-gray-100 text-gray-800',
    'ringing': 'bg-blue-100 text-blue-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
