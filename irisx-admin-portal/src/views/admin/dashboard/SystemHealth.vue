<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">System Health</h1>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Health Status -->
    <div v-else>
      <!-- Overall Status Badge -->
      <div class="mb-6">
        <span
          class="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium"
          :class="overallStatusClass"
        >
          <span class="w-2 h-2 rounded-full mr-2" :class="overallStatusDotClass"></span>
          {{ overallStatusText }}
        </span>
      </div>

      <!-- System Components -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <!-- Database -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Database</h3>
            <span
              class="px-3 py-1 rounded-full text-xs font-medium"
              :class="getStatusClass(health?.database?.status)"
            >
              {{ health?.database?.status || 'unknown' }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Host:</span> {{ health?.database?.host || 'N/A' }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Version:</span> {{ health?.database?.version || 'N/A' }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Connections:</span> {{ health?.database?.connections || 0 }}
            </p>
          </div>
        </div>

        <!-- Redis -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Redis Cache</h3>
            <span
              class="px-3 py-1 rounded-full text-xs font-medium"
              :class="getStatusClass(health?.redis?.status)"
            >
              {{ health?.redis?.status || 'unknown' }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Memory Used:</span> {{ formatBytes(health?.redis?.memory_used) }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Keys:</span> {{ health?.redis?.keys || 0 }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Hit Rate:</span> {{ health?.redis?.hit_rate || 0 }}%
            </p>
          </div>
        </div>

        <!-- FreeSWITCH -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">FreeSWITCH</h3>
            <span
              class="px-3 py-1 rounded-full text-xs font-medium"
              :class="getStatusClass(health?.freeswitch?.status)"
            >
              {{ health?.freeswitch?.status || 'unknown' }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Active Calls:</span> {{ health?.freeswitch?.active_calls || 0 }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Sessions:</span> {{ health?.freeswitch?.sessions || 0 }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Uptime:</span> {{ formatUptime(health?.freeswitch?.uptime) }}
            </p>
          </div>
        </div>

        <!-- API Server -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">API Server</h3>
            <span class="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              healthy
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Version:</span> {{ health?.api?.version || '1.0.0' }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Uptime:</span> {{ formatUptime(health?.api?.uptime) }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Memory:</span> {{ formatBytes(health?.api?.memory_usage) }}
            </p>
          </div>
        </div>

        <!-- S3 Storage -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">S3 Storage</h3>
            <span
              class="px-3 py-1 rounded-full text-xs font-medium"
              :class="getStatusClass(health?.s3?.status)"
            >
              {{ health?.s3?.status || 'unknown' }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Bucket:</span> {{ health?.s3?.bucket || 'N/A' }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Objects:</span> {{ health?.s3?.object_count || 0 }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Size:</span> {{ formatBytes(health?.s3?.total_size) }}
            </p>
          </div>
        </div>

        <!-- Email Service -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Email Service</h3>
            <span
              class="px-3 py-1 rounded-full text-xs font-medium"
              :class="getStatusClass(health?.email?.status)"
            >
              {{ health?.email?.status || 'unknown' }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <p class="text-gray-600">
              <span class="font-medium">Provider:</span> {{ health?.email?.provider || 'N/A' }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Sent Today:</span> {{ health?.email?.sent_today || 0 }}
            </p>
            <p class="text-gray-600">
              <span class="font-medium">Queue:</span> {{ health?.email?.queue_size || 0 }}
            </p>
          </div>
        </div>
      </div>

      <!-- Refresh Button -->
      <button
        @click="fetchHealth"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Refresh Status
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const error = ref(null)
const health = ref(null)

const overallStatusText = computed(() => {
  if (!health.value) return 'Unknown'

  const statuses = [
    health.value.database?.status,
    health.value.redis?.status,
    health.value.freeswitch?.status,
    health.value.s3?.status,
    health.value.email?.status
  ]

  if (statuses.some(s => s === 'error' || s === 'disconnected')) return 'Degraded'
  if (statuses.every(s => s === 'connected' || s === 'healthy')) return 'All Systems Operational'
  return 'Checking...'
})

const overallStatusClass = computed(() => {
  const text = overallStatusText.value
  if (text === 'All Systems Operational') return 'bg-green-100 text-green-800'
  if (text === 'Degraded') return 'bg-red-100 text-red-800'
  return 'bg-yellow-100 text-yellow-800'
})

const overallStatusDotClass = computed(() => {
  const text = overallStatusText.value
  if (text === 'All Systems Operational') return 'bg-green-500'
  if (text === 'Degraded') return 'bg-red-500'
  return 'bg-yellow-500'
})

onMounted(() => {
  fetchHealth()
})

async function fetchHealth() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.dashboard.getHealth()
    health.value = response.data
  } catch (err) {
    console.error('Failed to fetch system health:', err)
    error.value = 'Failed to load system health'
  } finally {
    loading.value = false
  }
}

function getStatusClass(status) {
  if (status === 'connected' || status === 'healthy') return 'bg-green-100 text-green-800'
  if (status === 'disconnected' || status === 'error') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
</script>
