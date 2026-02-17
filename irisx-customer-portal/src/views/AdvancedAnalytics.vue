<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Advanced Analytics</h1>
        <p class="text-sm text-gray-600 mt-1">Cross-channel performance metrics and insights</p>
      </div>
      <div class="flex space-x-2">
        <button
          @click="exportData('csv')"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Export CSV
        </button>
        <button
          @click="exportToExcel"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Export Excel
        </button>
        <button
          @click="exportData('pdf')"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Export PDF
        </button>
      </div>
    </div>

    <!-- Date Range Selector -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
          <input
            v-model="dateRange.start"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            v-model="dateRange.end"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Channel</label>
          <select
            v-model="selectedChannel"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="all">All Channels</option>
            <option value="voice">Voice</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="social">Social Media</option>
          </select>
        </div>
        <div class="flex items-end">
          <button
            @click="fetchAnalytics"
            class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Analytics Content -->
    <div v-else>
      <!-- Overview Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Total Interactions</p>
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ formatNumber(overview.total) }}</p>
          <p class="text-xs text-gray-500 mt-1">
            <span :class="overview.growth >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ overview.growth >= 0 ? '+' : '' }}{{ overview.growth }}%
            </span>
            vs previous period
          </p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Avg Response Time</p>
            <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ overview.avg_response_time }}s</p>
          <p class="text-xs text-gray-500 mt-1">Across all channels</p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Customer Satisfaction</p>
            <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ overview.csat_score }}%</p>
          <p class="text-xs text-gray-500 mt-1">Based on {{ overview.csat_responses }} responses</p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Resolution Rate</p>
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ overview.resolution_rate }}%</p>
          <p class="text-xs text-gray-500 mt-1">First contact resolution</p>
        </div>
      </div>

      <!-- Channel Performance -->
      <div class="bg-white rounded-lg shadow overflow-hidden mb-8">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Channel Performance</h2>
        </div>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Response</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resolution Rate</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CSAT</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trend</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="channel in channelStats" :key="channel.name" class="hover:bg-gray-50">
              <td class="px-6 py-4">
                <div class="flex items-center">
                  <span class="text-2xl mr-2">{{ getChannelIcon(channel.name) }}</span>
                  <span class="text-sm font-medium text-gray-900">{{ channel.name }}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ formatNumber(channel.volume) }}</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ channel.avg_response }}s</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ channel.resolution_rate }}%</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ channel.csat }}%</td>
              <td class="px-6 py-4">
                <span :class="channel.trend >= 0 ? 'text-green-600' : 'text-red-600'" class="text-sm font-medium">
                  {{ channel.trend >= 0 ? '↑' : '↓' }} {{ Math.abs(channel.trend) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Peak Hours Chart -->
      <div class="bg-white rounded-lg shadow p-6 mb-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Peak Hours Analysis</h2>
        <div class="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
          <div class="text-center">
            <p class="text-gray-500 mb-2">Hourly Distribution Chart</p>
            <p class="text-xs text-gray-400">Peak: {{ peakHours.peak_hour }} ({{ peakHours.peak_volume }} interactions)</p>
          </div>
        </div>
      </div>

      <!-- Agent Performance -->
      <div class="bg-white rounded-lg shadow overflow-hidden mb-8">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Top Performing Agents</h2>
        </div>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interactions</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Handle Time</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CSAT</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resolution Rate</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="agent in topAgents" :key="agent.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ agent.name }}</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ agent.interactions }}</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ agent.avg_handle_time }}s</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ agent.csat }}%</td>
              <td class="px-6 py-4 text-sm text-gray-900">{{ agent.resolution_rate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Comparison Widget -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Period Comparison</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="border-l-4 border-blue-500 pl-4">
            <p class="text-sm text-gray-600">This Period</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatNumber(comparison.current.total) }}</p>
            <p class="text-xs text-gray-500">{{ dateRange.start }} to {{ dateRange.end }}</p>
          </div>
          <div class="border-l-4 border-gray-300 pl-4">
            <p class="text-sm text-gray-600">Previous Period</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatNumber(comparison.previous.total) }}</p>
            <p class="text-xs text-gray-500">Comparison baseline</p>
          </div>
          <div class="border-l-4 border-green-500 pl-4">
            <p class="text-sm text-gray-600">Change</p>
            <p class="text-2xl font-bold" :class="comparison.change >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ comparison.change >= 0 ? '+' : '' }}{{ comparison.change }}%
            </p>
            <p class="text-xs text-gray-500">{{ comparison.change >= 0 ? 'Improvement' : 'Decline' }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../utils/api'
import { downloadExcel, downloadMultiSheetExcel } from '../utils/excelExport'

const loading = ref(true)
const selectedChannel = ref('all')
const dateRange = ref({
  start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  end: new Date().toISOString().split('T')[0]
})

const overview = ref({
  total: 0,
  growth: 0,
  avg_response_time: 0,
  csat_score: 0,
  csat_responses: 0,
  resolution_rate: 0
})

const channelStats = ref([])
const topAgents = ref([])
const peakHours = ref({ peak_hour: '14:00', peak_volume: 0 })
const comparison = ref({
  current: { total: 0 },
  previous: { total: 0 },
  change: 0
})

onMounted(() => {
  fetchAnalytics()
})

async function fetchAnalytics() {
  loading.value = true
  try {
    const params = {
      start_date: dateRange.value.start,
      end_date: dateRange.value.end,
      channel: selectedChannel.value !== 'all' ? selectedChannel.value : undefined
    }

    const [overviewRes, channelsRes, agentsRes] = await Promise.all([
      apiClient.get('/v1/analytics/overview', { params }),
      apiClient.get('/v1/analytics/channels', { params }),
      apiClient.get('/v1/analytics/agents', { params })
    ])

    overview.value = overviewRes.data || overview.value
    channelStats.value = channelsRes.data.channels || []
    topAgents.value = agentsRes.data.agents || []
    peakHours.value = overviewRes.data.peak_hours || peakHours.value
    comparison.value = overviewRes.data.comparison || comparison.value
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
  } finally {
    loading.value = false
  }
}

async function exportData(format) {
  try {
    const params = {
      start_date: dateRange.value.start,
      end_date: dateRange.value.end,
      channel: selectedChannel.value !== 'all' ? selectedChannel.value : undefined,
      format
    }

    const response = await apiClient.post('/v1/analytics/export', params, {
      responseType: 'blob'
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `analytics-${dateRange.value.start}-to-${dateRange.value.end}.${format}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (error) {
    console.error('Failed to export analytics:', error)
    alert('Failed to export analytics')
  }
}

function formatNumber(num) {
  if (!num) return '0'
  return num.toLocaleString()
}

function getChannelIcon(channel) {
  const icons = {
    'Voice': '📞',
    'SMS': '💬',
    'Email': '📧',
    'WhatsApp': '📱',
    'Social': '🌐'
  }
  return icons[channel] || '📊'
}

function exportToExcel() {
  const filename = `analytics-${dateRange.value.start}-to-${dateRange.value.end}`

  // Multi-sheet export with overview, channels, and agents
  const sheets = [
    {
      name: 'Overview',
      data: [{
        metric: 'Total Interactions',
        value: overview.value.total,
        growth: `${overview.value.growth}%`
      }, {
        metric: 'Avg Response Time',
        value: overview.value.avg_response_time,
        growth: 'N/A'
      }, {
        metric: 'Customer Satisfaction',
        value: `${overview.value.csat_score}%`,
        growth: 'N/A'
      }, {
        metric: 'Resolution Rate',
        value: `${overview.value.resolution_rate}%`,
        growth: 'N/A'
      }],
      columns: [
        { key: 'metric', label: 'Metric', width: 150 },
        { key: 'value', label: 'Value', width: 100 },
        { key: 'growth', label: 'Growth', width: 80 }
      ]
    },
    {
      name: 'Channel Performance',
      data: channelStats.value.map(ch => ({
        channel: ch.name,
        volume: ch.volume,
        avg_response: `${ch.avg_response}s`,
        resolution_rate: `${ch.resolution_rate}%`,
        csat: `${ch.csat}%`,
        trend: `${ch.trend >= 0 ? '+' : ''}${ch.trend}%`
      })),
      columns: [
        { key: 'channel', label: 'Channel', width: 100 },
        { key: 'volume', label: 'Volume', width: 80, type: 'Number' },
        { key: 'avg_response', label: 'Avg Response', width: 100 },
        { key: 'resolution_rate', label: 'Resolution Rate', width: 110 },
        { key: 'csat', label: 'CSAT', width: 80 },
        { key: 'trend', label: 'Trend', width: 80 }
      ]
    },
    {
      name: 'Top Agents',
      data: topAgents.value.map(agent => ({
        name: agent.name,
        interactions: agent.interactions,
        avg_handle_time: `${agent.avg_handle_time}s`,
        csat: `${agent.csat}%`,
        resolution_rate: `${agent.resolution_rate}%`
      })),
      columns: [
        { key: 'name', label: 'Agent Name', width: 150 },
        { key: 'interactions', label: 'Interactions', width: 100, type: 'Number' },
        { key: 'avg_handle_time', label: 'Avg Handle Time', width: 120 },
        { key: 'csat', label: 'CSAT', width: 80 },
        { key: 'resolution_rate', label: 'Resolution Rate', width: 110 }
      ]
    }
  ]

  downloadMultiSheetExcel(sheets, filename)
}
</script>
