<template>
  <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p class="mt-1 text-sm text-gray-500">
        Welcome back! Here's an overview of your communications activity.
      </p>
    </div>

    <!-- Stats Cards - 2 rows: 3 + 2 on large screens -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <!-- Total Calls -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-500 truncate">Total Calls</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalCalls.toLocaleString() }}</p>
          </div>
          <span class="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            +{{ stats.callsGrowth }}%
          </span>
        </div>
      </div>

      <!-- Total Messages -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-500 truncate">Total Messages</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalMessages.toLocaleString() }}</p>
          </div>
          <span class="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            +{{ stats.messagesGrowth }}%
          </span>
        </div>
      </div>

      <!-- Active Numbers -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-500 truncate">Active Numbers</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.activeNumbers }}</p>
          </div>
        </div>
      </div>

      <!-- Total Emails -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-500 truncate">Total Emails</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalEmails?.toLocaleString() || 0 }}</p>
          </div>
          <span class="flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            +{{ stats.emailsGrowth || 0 }}%
          </span>
        </div>
      </div>

      <!-- Monthly Cost -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-500 truncate">This Month</p>
            <p class="text-2xl font-bold text-gray-900">${{ stats.monthlyCost.toFixed(2) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <div class="px-5 py-4 border-b border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900">Recent Calls</h3>
      </div>
      <div class="p-5">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p class="mt-2 text-sm text-gray-500">Loading recent calls...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="recentCalls.length === 0" class="text-center py-12">
          <div class="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h4 class="text-sm font-medium text-gray-900 mb-1">No calls yet</h4>
          <p class="text-sm text-gray-500">Make your first call using the API!</p>
        </div>

        <!-- Calls Table -->
        <div v-else class="-mx-5 -mb-5 overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="call in recentCalls" :key="call.id" class="hover:bg-gray-50">
                <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatTime(call.created_at) }}</td>
                <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{{ call.from_number }}</td>
                <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{{ call.to_number }}</td>
                <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatDuration(call.duration) }}</td>
                <td class="px-5 py-4 whitespace-nowrap">
                  <span :class="getStatusClass(call.status)" class="px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full">
                    {{ call.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../../utils/api'

const loading = ref(true)
const stats = ref({
  totalCalls: 0,
  callsGrowth: 0,
  totalMessages: 0,
  messagesGrowth: 0,
  activeNumbers: 0,
  monthlyCost: 0
})
const recentCalls = ref([])

onMounted(async () => {
  await fetchDashboardData()
})

async function fetchDashboardData() {
  loading.value = true
  try {
    // Fetch stats
    const statsResponse = await apiClient.get('/v1/analytics/stats')
    // API returns { success: true, data: {...} }
    stats.value = {
      ...stats.value,
      ...(statsResponse.data.data || statsResponse.data)
    }

    // Fetch recent calls
    const callsResponse = await apiClient.get('/v1/calls?limit=10')
    recentCalls.value = callsResponse.data.calls || []
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  } finally {
    loading.value = false
  }
}

function formatTime(timestamp) {
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
    'ringing': 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
