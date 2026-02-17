<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-900">My Performance</h3>
      <select
        v-model="selectedPeriod"
        @change="fetchMetrics"
        class="text-xs border-gray-300 rounded py-1 px-2"
      >
        <option value="today">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
      </select>
    </div>

    <div class="p-4">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-8">
        <svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>

      <div v-else>
        <!-- Key Metrics Grid -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <!-- Calls Handled -->
          <div class="bg-blue-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-blue-700">{{ metrics.callsHandled }}</div>
            <div class="text-xs text-blue-600">Calls Handled</div>
            <div class="text-xs mt-1" :class="metrics.callsTrend >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ metrics.callsTrend >= 0 ? '+' : '' }}{{ metrics.callsTrend }}% vs avg
            </div>
          </div>

          <!-- Avg Handle Time -->
          <div class="bg-purple-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-purple-700">{{ formatTime(metrics.avgHandleTime) }}</div>
            <div class="text-xs text-purple-600">Avg Handle Time</div>
            <div class="text-xs mt-1" :class="metrics.ahtTrend <= 0 ? 'text-green-600' : 'text-red-600'">
              {{ metrics.ahtTrend <= 0 ? '' : '+' }}{{ metrics.ahtTrend }}% vs target
            </div>
          </div>

          <!-- First Call Resolution -->
          <div class="bg-green-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-green-700">{{ metrics.fcrRate }}%</div>
            <div class="text-xs text-green-600">FCR Rate</div>
            <div class="text-xs mt-1 text-gray-500">Target: {{ metrics.fcrTarget }}%</div>
          </div>

          <!-- Customer Satisfaction -->
          <div class="bg-yellow-50 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-yellow-700">{{ metrics.csat.toFixed(1) }}</div>
            <div class="text-xs text-yellow-600">CSAT Score</div>
            <div class="flex justify-center mt-1">
              <template v-for="star in 5" :key="star">
                <svg
                  class="w-3 h-3"
                  :class="star <= Math.round(metrics.csat) ? 'text-yellow-400' : 'text-gray-300'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </template>
            </div>
          </div>
        </div>

        <!-- Additional Stats -->
        <div class="space-y-3">
          <!-- Talk Time -->
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-600">Talk Time</span>
              <span class="font-medium">{{ formatTime(metrics.talkTime) }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-blue-500 h-2 rounded-full"
                :style="{ width: `${Math.min(100, (metrics.talkTime / metrics.totalTime) * 100)}%` }"
              ></div>
            </div>
          </div>

          <!-- Hold Time -->
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-600">Hold Time</span>
              <span class="font-medium">{{ formatTime(metrics.holdTime) }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-orange-500 h-2 rounded-full"
                :style="{ width: `${Math.min(100, (metrics.holdTime / metrics.totalTime) * 100)}%` }"
              ></div>
            </div>
          </div>

          <!-- Wrap-up Time -->
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-600">Wrap-up Time</span>
              <span class="font-medium">{{ formatTime(metrics.wrapUpTime) }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-purple-500 h-2 rounded-full"
                :style="{ width: `${Math.min(100, (metrics.wrapUpTime / metrics.totalTime) * 100)}%` }"
              ></div>
            </div>
          </div>

          <!-- Idle Time -->
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-600">Idle Time</span>
              <span class="font-medium">{{ formatTime(metrics.idleTime) }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-gray-400 h-2 rounded-full"
                :style="{ width: `${Math.min(100, (metrics.idleTime / metrics.totalTime) * 100)}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Goals Progress -->
        <div class="mt-4 pt-3 border-t border-gray-200">
          <h4 class="text-xs font-semibold text-gray-700 mb-2">Daily Goals</h4>
          <div class="space-y-2">
            <div v-for="goal in goals" :key="goal.name" class="flex items-center gap-2">
              <div class="flex-1">
                <div class="flex justify-between text-xs mb-0.5">
                  <span class="text-gray-600">{{ goal.name }}</span>
                  <span class="text-gray-900">{{ goal.current }}/{{ goal.target }}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    class="h-1.5 rounded-full transition-all"
                    :class="goal.current >= goal.target ? 'bg-green-500' : 'bg-blue-500'"
                    :style="{ width: `${Math.min(100, (goal.current / goal.target) * 100)}%` }"
                  ></div>
                </div>
              </div>
              <svg
                v-if="goal.current >= goal.target"
                class="w-4 h-4 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Rank Badge -->
        <div v-if="metrics.rank" class="mt-4 pt-3 border-t border-gray-200 text-center">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full text-white text-sm">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clip-rule="evenodd" />
            </svg>
            <span>Rank #{{ metrics.rank }} of {{ metrics.totalAgents }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  agentId: {
    type: [String, Number],
    required: true
  }
})

const loading = ref(true)
const selectedPeriod = ref('today')
const metrics = ref({
  callsHandled: 0,
  callsTrend: 0,
  avgHandleTime: 0,
  ahtTrend: 0,
  fcrRate: 0,
  fcrTarget: 80,
  csat: 0,
  talkTime: 0,
  holdTime: 0,
  wrapUpTime: 0,
  idleTime: 0,
  totalTime: 1,
  rank: null,
  totalAgents: 0
})

const goals = ref([])

onMounted(() => {
  fetchMetrics()
})

async function fetchMetrics() {
  loading.value = true
  try {
    // In production, this would be an API call
    // const response = await fetch(`/v1/agents/${props.agentId}/metrics?period=${selectedPeriod.value}`)
    // const data = await response.json()

    // Demo data
    await new Promise(resolve => setTimeout(resolve, 500))

    const baseData = {
      today: {
        callsHandled: 24,
        callsTrend: 12,
        avgHandleTime: 285, // 4:45
        ahtTrend: -5,
        fcrRate: 82,
        fcrTarget: 80,
        csat: 4.6,
        talkTime: 4500,
        holdTime: 420,
        wrapUpTime: 1200,
        idleTime: 1880,
        rank: 3,
        totalAgents: 15
      },
      week: {
        callsHandled: 142,
        callsTrend: 8,
        avgHandleTime: 295,
        ahtTrend: -2,
        fcrRate: 79,
        fcrTarget: 80,
        csat: 4.5,
        talkTime: 28000,
        holdTime: 2800,
        wrapUpTime: 7100,
        idleTime: 10100,
        rank: 5,
        totalAgents: 15
      },
      month: {
        callsHandled: 580,
        callsTrend: 5,
        avgHandleTime: 290,
        ahtTrend: 0,
        fcrRate: 81,
        fcrTarget: 80,
        csat: 4.4,
        talkTime: 112000,
        holdTime: 11500,
        wrapUpTime: 29000,
        idleTime: 47500,
        rank: 4,
        totalAgents: 15
      }
    }

    const data = baseData[selectedPeriod.value]
    data.totalTime = data.talkTime + data.holdTime + data.wrapUpTime + data.idleTime
    metrics.value = data

    // Update goals based on period
    if (selectedPeriod.value === 'today') {
      goals.value = [
        { name: 'Calls', current: 24, target: 30 },
        { name: 'CSAT Surveys', current: 18, target: 20 },
        { name: 'Callbacks', current: 3, target: 3 }
      ]
    } else if (selectedPeriod.value === 'week') {
      goals.value = [
        { name: 'Calls', current: 142, target: 150 },
        { name: 'FCR Rate', current: 79, target: 80 },
        { name: 'Training Hours', current: 2, target: 2 }
      ]
    } else {
      goals.value = [
        { name: 'Calls', current: 580, target: 600 },
        { name: 'Quality Score', current: 92, target: 90 },
        { name: 'Attendance', current: 98, target: 95 }
      ]
    }
  } catch (error) {
    console.error('Failed to fetch metrics:', error)
  } finally {
    loading.value = false
  }
}

function formatTime(seconds) {
  if (!seconds) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>
