<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-900">My Queues</h3>
      <button
        @click="fetchQueues"
        :disabled="loading"
        class="text-gray-400 hover:text-gray-600"
      >
        <svg
          class="w-4 h-4"
          :class="{ 'animate-spin': loading }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>

    <div class="p-4">
      <!-- Loading State -->
      <div v-if="loading && queues.length === 0" class="flex justify-center py-4">
        <svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>

      <!-- Empty State -->
      <div v-else-if="queues.length === 0" class="text-center py-4 text-gray-500 text-sm">
        No queues assigned
      </div>

      <!-- Queue List -->
      <div v-else class="space-y-3">
        <div
          v-for="queue in queues"
          :key="queue.id"
          class="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
          :class="getQueueBorderClass(queue)"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900 text-sm">{{ queue.name }}</span>
              <span
                v-if="queue.priority === 'high'"
                class="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded"
              >
                High
              </span>
            </div>
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full"
              :class="getStatusClass(queue.status)"
            >
              {{ queue.status }}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            <!-- Waiting -->
            <div class="text-center p-2 bg-gray-50 rounded">
              <div class="text-lg font-bold" :class="queue.waiting > 5 ? 'text-red-600' : 'text-gray-900'">
                {{ queue.waiting }}
              </div>
              <div class="text-gray-500">Waiting</div>
            </div>

            <!-- Active -->
            <div class="text-center p-2 bg-gray-50 rounded">
              <div class="text-lg font-bold text-blue-600">{{ queue.active }}</div>
              <div class="text-gray-500">Active</div>
            </div>

            <!-- Avg Wait -->
            <div class="text-center p-2 bg-gray-50 rounded">
              <div class="text-lg font-bold" :class="queue.avgWait > 120 ? 'text-orange-600' : 'text-gray-900'">
                {{ formatWaitTime(queue.avgWait) }}
              </div>
              <div class="text-gray-500">Avg Wait</div>
            </div>
          </div>

          <!-- SLA Indicator -->
          <div v-if="queue.slaTarget" class="mt-2">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-gray-500">SLA</span>
              <span :class="queue.slaPercent >= 80 ? 'text-green-600' : 'text-red-600'">
                {{ queue.slaPercent }}%
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-1.5">
              <div
                class="h-1.5 rounded-full transition-all"
                :class="queue.slaPercent >= 80 ? 'bg-green-500' : 'bg-red-500'"
                :style="{ width: `${Math.min(100, queue.slaPercent)}%` }"
              ></div>
            </div>
          </div>

          <!-- Longest Wait Alert -->
          <div
            v-if="queue.longestWait > 180"
            class="mt-2 flex items-center gap-1 text-xs text-orange-600"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Longest wait: {{ formatWaitTime(queue.longestWait) }}</span>
          </div>
        </div>
      </div>

      <!-- Summary Footer -->
      <div v-if="queues.length > 0" class="mt-4 pt-3 border-t border-gray-200">
        <div class="flex justify-between text-xs text-gray-500">
          <span>Total waiting: <strong class="text-gray-900">{{ totalWaiting }}</strong></span>
          <span>Last updated: {{ lastUpdated }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  agentId: {
    type: [String, Number],
    required: true
  },
  refreshInterval: {
    type: Number,
    default: 30000 // 30 seconds
  }
})

const loading = ref(false)
const queues = ref([])
const lastUpdatedTime = ref(null)
let refreshTimer = null

const totalWaiting = computed(() => {
  return queues.value.reduce((sum, q) => sum + (q.waiting || 0), 0)
})

const lastUpdated = computed(() => {
  if (!lastUpdatedTime.value) return 'Never'
  return lastUpdatedTime.value.toLocaleTimeString()
})

onMounted(() => {
  fetchQueues()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})

function startAutoRefresh() {
  if (props.refreshInterval > 0) {
    refreshTimer = setInterval(fetchQueues, props.refreshInterval)
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function fetchQueues() {
  loading.value = true
  try {
    // In production, this would be an API call
    // const response = await fetch(`/v1/agents/${props.agentId}/queues`)
    // queues.value = await response.json()

    // Demo data
    await new Promise(resolve => setTimeout(resolve, 500))
    queues.value = [
      {
        id: 1,
        name: 'Sales Inbound',
        status: 'active',
        priority: 'high',
        waiting: 3,
        active: 5,
        avgWait: 45,
        longestWait: 120,
        slaTarget: 60,
        slaPercent: 85
      },
      {
        id: 2,
        name: 'Support General',
        status: 'active',
        priority: 'normal',
        waiting: 7,
        active: 8,
        avgWait: 90,
        longestWait: 240,
        slaTarget: 120,
        slaPercent: 72
      },
      {
        id: 3,
        name: 'Billing',
        status: 'active',
        priority: 'normal',
        waiting: 1,
        active: 2,
        avgWait: 30,
        longestWait: 45,
        slaTarget: 90,
        slaPercent: 95
      }
    ]
    lastUpdatedTime.value = new Date()
  } catch (error) {
    console.error('Failed to fetch queues:', error)
  } finally {
    loading.value = false
  }
}

function formatWaitTime(seconds) {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function getQueueBorderClass(queue) {
  if (queue.waiting > 10) return 'border-red-300'
  if (queue.waiting > 5) return 'border-orange-300'
  if (queue.priority === 'high') return 'border-blue-300'
  return 'border-gray-200'
}

function getStatusClass(status) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'paused':
      return 'bg-yellow-100 text-yellow-700'
    case 'closed':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}
</script>
