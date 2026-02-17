<template>
  <div class="min-h-screen bg-zinc-900 p-4" :class="{ 'p-0': isFullscreen }">
    <!-- Header -->
    <div v-if="!isFullscreen" class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-2xl font-bold text-zinc-100">Real-time Wallboard</h1>
        <p class="text-zinc-400">Live contact center metrics and agent status</p>
      </div>
      <div class="flex items-center gap-3">
        <select
          v-model="selectedQueue"
          class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
        >
          <option value="">All Queues</option>
          <option v-for="queue in queues" :key="queue.id" :value="queue.id">{{ queue.name }}</option>
        </select>
        <button
          @click="toggleFullscreen"
          class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Fullscreen
        </button>
      </div>
    </div>

    <!-- Fullscreen Exit Button -->
    <button
      v-if="isFullscreen"
      @click="toggleFullscreen"
      class="fixed top-4 right-4 z-50 px-3 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-white rounded-lg text-sm"
    >
      Exit Fullscreen
    </button>

    <!-- Real-time Status Bar -->
    <div class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-4 mb-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span class="text-white font-medium">Live</span>
          <span class="text-white/70 text-sm">Last updated: {{ lastUpdated }}</span>
        </div>
        <div class="text-white/90">
          {{ new Date().toLocaleTimeString() }}
        </div>
      </div>
    </div>

    <!-- Main Metrics Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
      <!-- Calls in Queue -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Calls in Queue</p>
            <p class="text-3xl font-bold text-red-400">{{ metrics.callsInQueue }}</p>
          </div>
        </div>
      </div>

      <!-- Active Calls -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Active Calls</p>
            <p class="text-3xl font-bold text-green-400">{{ metrics.activeCalls }}</p>
          </div>
        </div>
      </div>

      <!-- Agents Available -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Available</p>
            <p class="text-3xl font-bold text-blue-400">{{ metrics.agentsAvailable }}</p>
          </div>
        </div>
      </div>

      <!-- Avg Wait Time -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Avg Wait</p>
            <p class="text-3xl font-bold text-yellow-400">{{ formatDuration(metrics.avgWaitTime) }}</p>
          </div>
        </div>
      </div>

      <!-- Service Level -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Service Level</p>
            <p :class="['text-3xl font-bold', metrics.serviceLevel >= 80 ? 'text-green-400' : metrics.serviceLevel >= 60 ? 'text-yellow-400' : 'text-red-400']">
              {{ metrics.serviceLevel }}%
            </p>
          </div>
        </div>
      </div>

      <!-- Abandoned Rate -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Abandoned</p>
            <p :class="['text-3xl font-bold', metrics.abandonedRate <= 5 ? 'text-green-400' : metrics.abandonedRate <= 10 ? 'text-yellow-400' : 'text-red-400']">
              {{ metrics.abandonedRate }}%
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Agent Status Grid -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Agent Status ({{ agents.length }})
        </h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto">
          <div
            v-for="agent in agents"
            :key="agent.id"
            :class="[
              'p-3 rounded-lg border text-center transition-all',
              getAgentStatusClass(agent.status)
            ]"
          >
            <div class="w-10 h-10 mx-auto mb-2 rounded-full bg-zinc-700 flex items-center justify-center">
              <span class="text-lg font-bold text-zinc-300">{{ getInitials(agent.name) }}</span>
            </div>
            <p class="text-sm font-medium text-zinc-200 truncate">{{ agent.name }}</p>
            <p class="text-xs text-zinc-400 capitalize">{{ agent.status.replace('_', ' ') }}</p>
            <p v-if="agent.call_duration" class="text-xs text-zinc-500 mt-1">
              {{ formatDuration(agent.call_duration) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Queue Status -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Queue Status
        </h3>
        <div class="space-y-3 max-h-80 overflow-y-auto">
          <div
            v-for="queue in queueStats"
            :key="queue.id"
            class="p-3 bg-zinc-900 rounded-lg"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium text-zinc-200">{{ queue.name }}</span>
              <span :class="['text-sm px-2 py-0.5 rounded', getQueueStatusClass(queue)]">
                {{ queue.waiting }} waiting
              </span>
            </div>
            <div class="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span class="text-zinc-500">Active</span>
                <p class="text-zinc-200 font-medium">{{ queue.active }}</p>
              </div>
              <div>
                <span class="text-zinc-500">Available</span>
                <p class="text-zinc-200 font-medium">{{ queue.available }}</p>
              </div>
              <div>
                <span class="text-zinc-500">Avg Wait</span>
                <p class="text-zinc-200 font-medium">{{ formatDuration(queue.avg_wait) }}</p>
              </div>
              <div>
                <span class="text-zinc-500">SL</span>
                <p :class="['font-medium', queue.service_level >= 80 ? 'text-green-400' : 'text-yellow-400']">
                  {{ queue.service_level }}%
                </p>
              </div>
            </div>
          </div>
          <div v-if="queueStats.length === 0" class="text-center py-4 text-zinc-500">
            No queue data available
          </div>
        </div>
      </div>
    </div>

    <!-- Calls in Queue Details -->
    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-6">
      <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        Calls Waiting
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="text-left text-sm text-zinc-400 border-b border-zinc-700">
              <th class="pb-2">Caller</th>
              <th class="pb-2">Queue</th>
              <th class="pb-2">Wait Time</th>
              <th class="pb-2">Priority</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-700">
            <tr v-for="call in callsWaiting" :key="call.id" class="text-sm">
              <td class="py-2 text-zinc-200">{{ call.caller_id || 'Unknown' }}</td>
              <td class="py-2 text-zinc-300">{{ call.queue_name }}</td>
              <td :class="['py-2 font-mono', call.wait_seconds > 120 ? 'text-red-400' : call.wait_seconds > 60 ? 'text-yellow-400' : 'text-green-400']">
                {{ formatDuration(call.wait_seconds) }}
              </td>
              <td class="py-2">
                <span :class="['px-2 py-0.5 rounded text-xs', call.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-400']">
                  {{ call.priority || 'normal' }}
                </span>
              </td>
            </tr>
            <tr v-if="callsWaiting.length === 0">
              <td colspan="4" class="py-4 text-center text-zinc-500">No calls waiting</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Call Volume Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <!-- Hourly Call Volume -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          Hourly Call Volume
        </h3>
        <div class="h-48">
          <canvas ref="hourlyChartRef"></canvas>
        </div>
      </div>

      <!-- Service Level Trend -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Service Level Trend
        </h3>
        <div class="h-48">
          <canvas ref="serviceLevelChartRef"></canvas>
        </div>
      </div>
    </div>

    <!-- Channel Distribution & Agent Utilization -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <!-- Channel Distribution Pie -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          </svg>
          Channel Mix
        </h3>
        <div class="h-40">
          <canvas ref="channelChartRef"></canvas>
        </div>
      </div>

      <!-- Agent Utilization -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 lg:col-span-2">
        <h3 class="text-lg font-medium text-zinc-100 mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Agent Utilization (Last 4 Hours)
        </h3>
        <div class="h-40">
          <canvas ref="utilizationChartRef"></canvas>
        </div>
      </div>
    </div>

    <!-- Today's Performance -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
        <p class="text-sm text-zinc-400 mb-1">Calls Handled Today</p>
        <p class="text-2xl font-bold text-zinc-100">{{ todayStats.callsHandled }}</p>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
        <p class="text-sm text-zinc-400 mb-1">Avg Handle Time</p>
        <p class="text-2xl font-bold text-zinc-100">{{ formatDuration(todayStats.avgHandleTime) }}</p>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
        <p class="text-sm text-zinc-400 mb-1">Calls Abandoned</p>
        <p class="text-2xl font-bold text-red-400">{{ todayStats.callsAbandoned }}</p>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
        <p class="text-sm text-zinc-400 mb-1">Longest Wait</p>
        <p class="text-2xl font-bold text-yellow-400">{{ formatDuration(todayStats.longestWait) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import Chart from 'chart.js/auto'

const authStore = useAuthStore()

// Chart refs
const hourlyChartRef = ref(null)
const serviceLevelChartRef = ref(null)
const channelChartRef = ref(null)
const utilizationChartRef = ref(null)
let hourlyChart = null
let serviceLevelChart = null
let channelChart = null
let utilizationChart = null

// Chart data
const hourlyData = ref([])
const serviceLevelData = ref([])
const channelData = ref({ voice: 0, sms: 0, email: 0, chat: 0, social: 0 })
const utilizationData = ref([])

// State
const isFullscreen = ref(false)
const selectedQueue = ref('')
const lastUpdated = ref('--:--:--')
const queues = ref([])

const metrics = ref({
  callsInQueue: 0,
  activeCalls: 0,
  agentsAvailable: 0,
  avgWaitTime: 0,
  serviceLevel: 0,
  abandonedRate: 0,
})

const agents = ref([])
const queueStats = ref([])
const callsWaiting = ref([])

const todayStats = ref({
  callsHandled: 0,
  avgHandleTime: 0,
  callsAbandoned: 0,
  longestWait: 0,
})

let updateInterval = null
let websocket = null

// Methods
const loadWallboardData = async () => {
  try {
    const params = new URLSearchParams()
    if (selectedQueue.value) params.set('queue_id', selectedQueue.value)

    const response = await fetch(`/api/v1/wallboard?${params}`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      const data = await response.json()

      if (data.metrics) {
        metrics.value = {
          callsInQueue: data.metrics.calls_in_queue || 0,
          activeCalls: data.metrics.active_calls || 0,
          agentsAvailable: data.metrics.agents_available || 0,
          avgWaitTime: data.metrics.avg_wait_time || 0,
          serviceLevel: data.metrics.service_level || 0,
          abandonedRate: data.metrics.abandoned_rate || 0,
        }
      }

      if (data.agents) {
        agents.value = data.agents
      }

      if (data.queues) {
        queueStats.value = data.queues
      }

      if (data.calls_waiting) {
        callsWaiting.value = data.calls_waiting
      }

      if (data.today_stats) {
        todayStats.value = {
          callsHandled: data.today_stats.calls_handled || 0,
          avgHandleTime: data.today_stats.avg_handle_time || 0,
          callsAbandoned: data.today_stats.calls_abandoned || 0,
          longestWait: data.today_stats.longest_wait || 0,
        }
      }

      lastUpdated.value = new Date().toLocaleTimeString()
    }
  } catch (error) {
    console.error('Failed to load wallboard data:', error)
  }
}

const loadQueues = async () => {
  try {
    const response = await fetch('/api/v1/queues', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    if (response.ok) {
      const data = await response.json()
      queues.value = data.queues || []
    }
  } catch (error) {
    console.error('Failed to load queues:', error)
  }
}

const connectWebSocket = () => {
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/wallboard`

  try {
    websocket = new WebSocket(wsUrl)

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'wallboard_update') {
        // Update metrics from WebSocket
        if (data.metrics) {
          metrics.value = { ...metrics.value, ...data.metrics }
        }
        if (data.agents) {
          agents.value = data.agents
        }
        lastUpdated.value = new Date().toLocaleTimeString()
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    websocket.onclose = () => {
      // Reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000)
    }
  } catch (error) {
    console.error('WebSocket connection failed:', error)
  }
}

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const getInitials = (name) => {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
}

const getAgentStatusClass = (status) => {
  const classes = {
    available: 'bg-green-500/10 border-green-500/50',
    on_call: 'bg-blue-500/10 border-blue-500/50',
    wrap_up: 'bg-yellow-500/10 border-yellow-500/50',
    break: 'bg-orange-500/10 border-orange-500/50',
    offline: 'bg-zinc-700/50 border-zinc-600',
    busy: 'bg-purple-500/10 border-purple-500/50',
  }
  return classes[status] || classes.offline
}

const getQueueStatusClass = (queue) => {
  if (queue.waiting === 0) return 'bg-green-500/20 text-green-400'
  if (queue.waiting <= 3) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

// Chart functions
const loadChartData = async () => {
  try {
    const response = await fetch('/api/v1/wallboard/trends', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })

    if (response.ok) {
      const data = await response.json()

      if (data.hourly) {
        hourlyData.value = data.hourly
        renderHourlyChart()
      }

      if (data.service_level_trend) {
        serviceLevelData.value = data.service_level_trend
        renderServiceLevelChart()
      }

      if (data.channel_distribution) {
        channelData.value = data.channel_distribution
        renderChannelChart()
      }

      if (data.utilization) {
        utilizationData.value = data.utilization
        renderUtilizationChart()
      }
    } else {
      // Generate demo data if API not available
      generateDemoChartData()
    }
  } catch (error) {
    console.error('Failed to load chart data:', error)
    generateDemoChartData()
  }
}

const generateDemoChartData = () => {
  // Generate hourly data for past 12 hours
  const now = new Date()
  const hourlyDemo = []
  for (let i = 11; i >= 0; i--) {
    const hour = new Date(now - i * 3600000)
    hourlyDemo.push({
      hour: hour.getHours(),
      label: `${hour.getHours()}:00`,
      inbound: Math.floor(Math.random() * 50) + 20,
      outbound: Math.floor(Math.random() * 30) + 10,
      answered: Math.floor(Math.random() * 40) + 15,
      abandoned: Math.floor(Math.random() * 10)
    })
  }
  hourlyData.value = hourlyDemo

  // Generate SL trend
  const slDemo = []
  for (let i = 11; i >= 0; i--) {
    const hour = new Date(now - i * 3600000)
    slDemo.push({
      label: `${hour.getHours()}:00`,
      value: Math.floor(Math.random() * 20) + 75
    })
  }
  serviceLevelData.value = slDemo

  // Channel distribution
  channelData.value = {
    voice: Math.floor(Math.random() * 200) + 100,
    sms: Math.floor(Math.random() * 80) + 20,
    email: Math.floor(Math.random() * 60) + 30,
    chat: Math.floor(Math.random() * 40) + 20,
    social: Math.floor(Math.random() * 20) + 5
  }

  // Utilization trend (4 hours)
  const utilDemo = []
  for (let i = 3; i >= 0; i--) {
    const hour = new Date(now - i * 3600000)
    utilDemo.push({
      label: `${hour.getHours()}:00`,
      utilization: Math.floor(Math.random() * 30) + 60,
      occupancy: Math.floor(Math.random() * 25) + 70
    })
  }
  utilizationData.value = utilDemo

  // Render all charts
  renderHourlyChart()
  renderServiceLevelChart()
  renderChannelChart()
  renderUtilizationChart()
}

const renderHourlyChart = () => {
  if (!hourlyChartRef.value || hourlyData.value.length === 0) return

  if (hourlyChart) {
    hourlyChart.destroy()
  }

  const ctx = hourlyChartRef.value.getContext('2d')
  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hourlyData.value.map(d => d.label),
      datasets: [
        {
          label: 'Inbound',
          data: hourlyData.value.map(d => d.inbound),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 4
        },
        {
          label: 'Outbound',
          data: hourlyData.value.map(d => d.outbound),
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#a1a1aa', boxWidth: 12, padding: 10 }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#71717a' }
        },
        y: {
          stacked: true,
          grid: { color: 'rgba(113, 113, 122, 0.2)' },
          ticks: { color: '#71717a' }
        }
      }
    }
  })
}

const renderServiceLevelChart = () => {
  if (!serviceLevelChartRef.value || serviceLevelData.value.length === 0) return

  if (serviceLevelChart) {
    serviceLevelChart.destroy()
  }

  const ctx = serviceLevelChartRef.value.getContext('2d')
  serviceLevelChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: serviceLevelData.value.map(d => d.label),
      datasets: [
        {
          label: 'Service Level %',
          data: serviceLevelData.value.map(d => d.value),
          borderColor: 'rgba(168, 85, 247, 1)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(168, 85, 247, 1)'
        },
        {
          label: 'Target (80%)',
          data: serviceLevelData.value.map(() => 80),
          borderColor: 'rgba(239, 68, 68, 0.5)',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#a1a1aa', boxWidth: 12, padding: 10 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#71717a' }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(113, 113, 122, 0.2)' },
          ticks: { color: '#71717a' }
        }
      }
    }
  })
}

const renderChannelChart = () => {
  if (!channelChartRef.value) return

  if (channelChart) {
    channelChart.destroy()
  }

  const ctx = channelChartRef.value.getContext('2d')
  channelChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Voice', 'SMS', 'Email', 'Chat', 'Social'],
      datasets: [{
        data: [
          channelData.value.voice,
          channelData.value.sms,
          channelData.value.email,
          channelData.value.chat,
          channelData.value.social
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#a1a1aa', boxWidth: 12, padding: 8 }
        }
      },
      cutout: '60%'
    }
  })
}

const renderUtilizationChart = () => {
  if (!utilizationChartRef.value || utilizationData.value.length === 0) return

  if (utilizationChart) {
    utilizationChart.destroy()
  }

  const ctx = utilizationChartRef.value.getContext('2d')
  utilizationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: utilizationData.value.map(d => d.label),
      datasets: [
        {
          label: 'Utilization %',
          data: utilizationData.value.map(d => d.utilization),
          borderColor: 'rgba(245, 158, 11, 1)',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(245, 158, 11, 1)'
        },
        {
          label: 'Occupancy %',
          data: utilizationData.value.map(d => d.occupancy),
          borderColor: 'rgba(6, 182, 212, 1)',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(6, 182, 212, 1)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#a1a1aa', boxWidth: 12, padding: 10 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#71717a' }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(113, 113, 122, 0.2)' },
          ticks: { color: '#71717a' }
        }
      }
    }
  })
}

// Lifecycle
onMounted(async () => {
  await Promise.all([loadQueues(), loadWallboardData()])

  // Load chart data after a brief delay to ensure canvas elements are mounted
  setTimeout(() => {
    loadChartData()
  }, 100)

  // Start polling every 5 seconds
  updateInterval = setInterval(loadWallboardData, 5000)

  // Refresh charts every 60 seconds
  setInterval(() => {
    loadChartData()
  }, 60000)

  // Try to connect WebSocket for real-time updates
  connectWebSocket()

  // Handle fullscreen change
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval)
  }
  if (websocket) {
    websocket.close()
  }
  // Destroy charts to prevent memory leaks
  if (hourlyChart) hourlyChart.destroy()
  if (serviceLevelChart) serviceLevelChart.destroy()
  if (channelChart) channelChart.destroy()
  if (utilizationChart) utilizationChart.destroy()
})
</script>
