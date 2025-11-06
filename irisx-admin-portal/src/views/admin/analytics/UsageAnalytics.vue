<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Usage & Analytics</h1>
      <p class="text-gray-500 mt-1">System-wide usage metrics and analytics</p>
    </div>

    <!-- Date Range Filter -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center space-x-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
          <select v-model="timeRange" @change="fetchAnalytics" class="px-3 py-2 border border-gray-300 rounded-md">
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
        <div class="flex-1"></div>
        <button @click="fetchAnalytics" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Refresh Data
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

    <div v-else class="space-y-6">
      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Total Calls -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Calls</p>
              <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(analytics.calls.total) }}</p>
              <p class="text-sm text-gray-500 mt-1">{{ formatDuration(analytics.calls.total_minutes) }} minutes</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Total SMS -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total SMS</p>
              <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(analytics.sms.total) }}</p>
              <p class="text-sm text-gray-500 mt-1">{{ analytics.sms.delivered }}% delivered</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Total Emails -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Total Emails</p>
              <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(analytics.emails.total) }}</p>
              <p class="text-sm text-gray-500 mt-1">{{ analytics.emails.open_rate }}% open rate</p>
            </div>
            <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Storage Used -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600">Storage Used</p>
              <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatBytes(analytics.storage.total_bytes) }}</p>
              <p class="text-sm text-gray-500 mt-1">Across {{ analytics.storage.tenant_count }} tenants</p>
            </div>
            <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- API & Resource Metrics -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- API Requests -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">API Usage</h2>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Total Requests</span>
                <span class="font-semibold">{{ formatNumber(analytics.api.total_requests) }}</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full" :style="{ width: '100%' }"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Avg Response Time</span>
                <span class="font-semibold">{{ analytics.api.avg_response_ms }}ms</span>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Error Rate</span>
                <span class="font-semibold" :class="analytics.api.error_rate > 5 ? 'text-red-600' : 'text-green-600'">
                  {{ analytics.api.error_rate }}%
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  :class="analytics.api.error_rate > 5 ? 'bg-red-600' : 'bg-green-600'"
                  class="h-2 rounded-full"
                  :style="{ width: analytics.api.error_rate + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Resource Utilization -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Resource Utilization</h2>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">CPU Usage</span>
                <span class="font-semibold">{{ analytics.resources.cpu_percent }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  :class="analytics.resources.cpu_percent > 80 ? 'bg-red-600' : 'bg-green-600'"
                  class="h-2 rounded-full"
                  :style="{ width: analytics.resources.cpu_percent + '%' }"
                ></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Memory Usage</span>
                <span class="font-semibold">{{ analytics.resources.memory_percent }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  :class="analytics.resources.memory_percent > 80 ? 'bg-red-600' : 'bg-green-600'"
                  class="h-2 rounded-full"
                  :style="{ width: analytics.resources.memory_percent + '%' }"
                ></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Bandwidth (24h)</span>
                <span class="font-semibold">{{ formatBytes(analytics.resources.bandwidth_bytes) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Tenants by Usage -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold">Top Tenants by Usage</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calls</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SMS</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emails</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Storage</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="tenant in analytics.top_tenants" :key="tenant.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <RouterLink :to="`/dashboard/tenants/${tenant.id}`" class="text-blue-600 hover:text-blue-800 font-medium">
                    {{ tenant.company_name }}
                  </RouterLink>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatNumber(tenant.calls) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatNumber(tenant.sms) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatNumber(tenant.emails) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatBytes(tenant.storage_bytes) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${{ tenant.total_cost.toFixed(2) }}</td>
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
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const timeRange = ref('30d')
const analytics = ref({
  calls: { total: 0, total_minutes: 0 },
  sms: { total: 0, delivered: 0 },
  emails: { total: 0, open_rate: 0 },
  storage: { total_bytes: 0, tenant_count: 0 },
  api: { total_requests: 0, avg_response_ms: 0, error_rate: 0 },
  resources: { cpu_percent: 0, memory_percent: 0, bandwidth_bytes: 0 },
  top_tenants: []
})

onMounted(() => {
  fetchAnalytics()
})

async function fetchAnalytics() {
  loading.value = true

  try {
    const response = await adminAPI.analytics.getUsage({ timeRange: timeRange.value })
    analytics.value = response.data
  } catch (err) {
    console.error('Failed to fetch analytics:', err)
  } finally {
    loading.value = false
  }
}

function formatNumber(num) {
  if (!num) return '0'
  return new Intl.NumberFormat().format(num)
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(minutes) {
  if (!minutes) return '0'
  if (minutes < 60) return Math.round(minutes) + 'm'
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}
</script>
