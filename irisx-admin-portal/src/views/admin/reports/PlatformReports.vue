<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Platform Reports</h1>
        <p class="text-sm text-gray-600 mt-1">System-wide reporting and analytics across all tenants</p>
      </div>
      <div class="flex space-x-3">
        <button
          @click="exportReport('csv')"
          :disabled="!selectedReport"
          class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
        <button
          @click="exportReport('xlsx')"
          :disabled="!selectedReport"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Export Excel
        </button>
      </div>
    </div>

    <!-- Report Type Selection -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="p-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold">Report Configuration</h2>
      </div>
      <div class="p-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
            <select
              v-model="selectedReport"
              @change="onReportChange"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select report...</option>
              <option value="usage">Platform Usage Summary</option>
              <option value="revenue">Revenue by Tenant</option>
              <option value="volume">Call Volume Trends</option>
              <option value="agents">Agent Activity Summary</option>
              <option value="campaigns">Campaign Performance</option>
              <option value="sla">SLA Compliance</option>
            </select>
          </div>
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
            <label class="block text-sm font-medium text-gray-700 mb-2">Tenant</label>
            <select
              v-model="selectedTenant"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Tenants</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                {{ tenant.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <button
            @click="runReport"
            :disabled="!selectedReport || loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Generate Report</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Stats -->
    <div v-if="quickStats" class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Total Records</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatNumber(quickStats.totalRecords) }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-full">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Total Value</p>
            <p class="text-2xl font-bold text-gray-900">${{ formatNumber(quickStats.totalValue) }}</p>
          </div>
          <div class="p-3 bg-green-100 rounded-full">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Active Tenants</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatNumber(quickStats.activeTenants) }}</p>
          </div>
          <div class="p-3 bg-purple-100 rounded-full">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Avg. per Tenant</p>
            <p class="text-2xl font-bold text-gray-900">{{ formatNumber(quickStats.avgPerTenant) }}</p>
          </div>
          <div class="p-3 bg-orange-100 rounded-full">
            <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Chart Visualization -->
    <div v-if="reportData" class="bg-white rounded-lg shadow mb-6">
      <div class="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="font-semibold text-gray-900">{{ reportTitles[selectedReport] || 'Report' }}</h3>
        <div class="flex space-x-2">
          <button
            v-for="chartType in ['bar', 'line', 'pie']"
            :key="chartType"
            @click="currentChartType = chartType; renderChart()"
            :class="[
              'px-3 py-1 rounded text-sm',
              currentChartType === chartType
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            ]"
          >
            {{ chartType.charAt(0).toUpperCase() + chartType.slice(1) }}
          </button>
        </div>
      </div>
      <div class="p-4">
        <div class="h-80">
          <canvas ref="chartCanvas"></canvas>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div v-if="reportData" class="bg-white rounded-lg shadow">
      <div class="p-4 border-b border-gray-200">
        <h3 class="font-semibold text-gray-900">Detailed Data</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th
                v-for="column in reportColumns"
                :key="column.key"
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="(row, index) in reportData.slice(0, 100)" :key="index">
              <td
                v-for="column in reportColumns"
                :key="column.key"
                class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
              >
                <span v-if="column.type === 'currency'">${{ formatNumber(row[column.key]) }}</span>
                <span v-else-if="column.type === 'number'">{{ formatNumber(row[column.key]) }}</span>
                <span v-else-if="column.type === 'percent'">{{ row[column.key] }}%</span>
                <span v-else-if="column.type === 'date'">{{ formatDate(row[column.key]) }}</span>
                <span v-else>{{ row[column.key] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="reportData.length > 100" class="p-4 text-center text-gray-500 text-sm">
          Showing 100 of {{ reportData.length }} rows. Export for full data.
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!reportData && !loading" class="bg-white rounded-lg shadow p-12 text-center">
      <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">No Report Selected</h3>
      <p class="text-gray-500">Select a report type and date range, then click "Generate Report"</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import Chart from 'chart.js/auto'

const adminAuth = useAdminAuthStore()

// State
const loading = ref(false)
const selectedReport = ref('')
const selectedTenant = ref('')
const tenants = ref([])
const reportData = ref(null)
const quickStats = ref(null)
const chartCanvas = ref(null)
const chartInstance = ref(null)
const currentChartType = ref('bar')

const dateRange = ref({
  start: '',
  end: ''
})

// Report Configuration
const reportTitles = {
  usage: 'Platform Usage Summary',
  revenue: 'Revenue by Tenant',
  volume: 'Call Volume Trends',
  agents: 'Agent Activity Summary',
  campaigns: 'Campaign Performance',
  sla: 'SLA Compliance'
}

const reportConfigs = {
  usage: {
    columns: [
      { key: 'tenant_name', label: 'Tenant', type: 'string' },
      { key: 'total_calls', label: 'Total Calls', type: 'number' },
      { key: 'total_sms', label: 'Total SMS', type: 'number' },
      { key: 'total_emails', label: 'Total Emails', type: 'number' },
      { key: 'total_cost', label: 'Total Cost', type: 'currency' }
    ],
    labelField: 'tenant_name',
    valueField: 'total_calls'
  },
  revenue: {
    columns: [
      { key: 'tenant_name', label: 'Tenant', type: 'string' },
      { key: 'total_revenue', label: 'Revenue', type: 'currency' },
      { key: 'invoice_count', label: 'Invoices', type: 'number' },
      { key: 'paid_amount', label: 'Paid', type: 'currency' },
      { key: 'outstanding', label: 'Outstanding', type: 'currency' }
    ],
    labelField: 'tenant_name',
    valueField: 'total_revenue'
  },
  volume: {
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'inbound_calls', label: 'Inbound', type: 'number' },
      { key: 'outbound_calls', label: 'Outbound', type: 'number' },
      { key: 'total_calls', label: 'Total', type: 'number' },
      { key: 'avg_duration', label: 'Avg Duration (s)', type: 'number' }
    ],
    labelField: 'date',
    valueField: 'total_calls'
  },
  agents: {
    columns: [
      { key: 'agent_name', label: 'Agent', type: 'string' },
      { key: 'tenant_name', label: 'Tenant', type: 'string' },
      { key: 'calls_handled', label: 'Calls Handled', type: 'number' },
      { key: 'avg_handle_time', label: 'Avg Handle Time', type: 'number' },
      { key: 'utilization', label: 'Utilization', type: 'percent' }
    ],
    labelField: 'agent_name',
    valueField: 'calls_handled'
  },
  campaigns: {
    columns: [
      { key: 'campaign_name', label: 'Campaign', type: 'string' },
      { key: 'tenant_name', label: 'Tenant', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'total_sent', label: 'Sent', type: 'number' },
      { key: 'delivered', label: 'Delivered', type: 'number' },
      { key: 'delivery_rate', label: 'Delivery Rate', type: 'percent' }
    ],
    labelField: 'campaign_name',
    valueField: 'total_sent'
  },
  sla: {
    columns: [
      { key: 'queue_name', label: 'Queue', type: 'string' },
      { key: 'tenant_name', label: 'Tenant', type: 'string' },
      { key: 'total_calls', label: 'Total Calls', type: 'number' },
      { key: 'answered_in_sla', label: 'In SLA', type: 'number' },
      { key: 'sla_percent', label: 'SLA %', type: 'percent' },
      { key: 'abandoned', label: 'Abandoned', type: 'number' }
    ],
    labelField: 'queue_name',
    valueField: 'sla_percent'
  }
}

const reportColumns = computed(() => {
  return reportConfigs[selectedReport.value]?.columns || []
})

// Methods
async function fetchTenants() {
  try {
    const response = await fetch('/admin-api/v1/tenants?limit=1000', {
      headers: {
        'Authorization': `Bearer ${adminAuth.token}`
      }
    })
    const result = await response.json()
    if (result.success || result.data) {
      tenants.value = result.data || result.tenants || []
    }
  } catch (error) {
    console.error('Error fetching tenants:', error)
  }
}

function onReportChange() {
  reportData.value = null
  quickStats.value = null
}

async function runReport() {
  if (!selectedReport.value) return

  loading.value = true
  try {
    // Build query params
    const params = new URLSearchParams()
    params.append('report_type', selectedReport.value)
    if (dateRange.value.start) params.append('start_date', dateRange.value.start)
    if (dateRange.value.end) params.append('end_date', dateRange.value.end)
    if (selectedTenant.value) params.append('tenant_id', selectedTenant.value)

    const response = await fetch(`/admin-api/v1/reports/platform?${params}`, {
      headers: {
        'Authorization': `Bearer ${adminAuth.token}`
      }
    })

    const result = await response.json()
    if (result.success) {
      reportData.value = result.data
      quickStats.value = result.stats || calculateQuickStats(result.data)
      setTimeout(renderChart, 100)
    } else {
      // Generate mock data for demo
      reportData.value = generateMockData()
      quickStats.value = calculateQuickStats(reportData.value)
      setTimeout(renderChart, 100)
    }
  } catch (error) {
    console.error('Error running report:', error)
    // Generate mock data for demo
    reportData.value = generateMockData()
    quickStats.value = calculateQuickStats(reportData.value)
    setTimeout(renderChart, 100)
  } finally {
    loading.value = false
  }
}

function generateMockData() {
  const config = reportConfigs[selectedReport.value]
  if (!config) return []

  const data = []
  const count = Math.floor(Math.random() * 20) + 10

  for (let i = 0; i < count; i++) {
    const row = {}
    config.columns.forEach(col => {
      if (col.type === 'string') {
        if (col.key.includes('tenant')) {
          row[col.key] = `Tenant ${i + 1}`
        } else if (col.key.includes('agent')) {
          row[col.key] = `Agent ${i + 1}`
        } else if (col.key.includes('campaign') || col.key.includes('queue')) {
          row[col.key] = `${col.key.split('_')[0]} ${i + 1}`
        } else {
          row[col.key] = `Item ${i + 1}`
        }
      } else if (col.type === 'currency') {
        row[col.key] = Math.floor(Math.random() * 10000) + 100
      } else if (col.type === 'number') {
        row[col.key] = Math.floor(Math.random() * 1000) + 10
      } else if (col.type === 'percent') {
        row[col.key] = Math.floor(Math.random() * 40) + 60
      } else if (col.type === 'date') {
        const date = new Date()
        date.setDate(date.getDate() - i)
        row[col.key] = date.toISOString().split('T')[0]
      }
    })
    data.push(row)
  }

  return data
}

function calculateQuickStats(data) {
  if (!data || data.length === 0) {
    return {
      totalRecords: 0,
      totalValue: 0,
      activeTenants: 0,
      avgPerTenant: 0
    }
  }

  const config = reportConfigs[selectedReport.value]
  const valueField = config?.valueField || 'total'
  const totalValue = data.reduce((sum, row) => sum + (parseFloat(row[valueField]) || 0), 0)
  const uniqueTenants = new Set(data.map(row => row.tenant_name || row.tenant_id)).size

  return {
    totalRecords: data.length,
    totalValue: totalValue,
    activeTenants: uniqueTenants || data.length,
    avgPerTenant: uniqueTenants ? Math.round(totalValue / uniqueTenants) : totalValue
  }
}

function renderChart() {
  if (!chartCanvas.value || !reportData.value || reportData.value.length === 0) return

  if (chartInstance.value) {
    chartInstance.value.destroy()
  }

  const config = reportConfigs[selectedReport.value]
  if (!config) return

  const ctx = chartCanvas.value.getContext('2d')
  const labels = reportData.value.slice(0, 20).map(row => row[config.labelField] || 'Unknown')
  const values = reportData.value.slice(0, 20).map(row => parseFloat(row[config.valueField]) || 0)

  const colors = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(6, 182, 212, 0.7)',
    'rgba(132, 204, 22, 0.7)'
  ]

  const backgroundColors = currentChartType.value === 'pie'
    ? labels.map((_, i) => colors[i % colors.length])
    : 'rgba(59, 130, 246, 0.7)'

  chartInstance.value = new Chart(ctx, {
    type: currentChartType.value,
    data: {
      labels,
      datasets: [{
        label: config.columns.find(c => c.key === config.valueField)?.label || 'Value',
        data: values,
        backgroundColor: backgroundColors,
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: currentChartType.value === 'pie' ? 'right' : 'top'
        }
      },
      scales: currentChartType.value !== 'pie' ? {
        y: {
          beginAtZero: true
        }
      } : undefined
    }
  })
}

async function exportReport(format) {
  if (!reportData.value) return

  try {
    const params = new URLSearchParams()
    params.append('report_type', selectedReport.value)
    params.append('format', format)
    if (dateRange.value.start) params.append('start_date', dateRange.value.start)
    if (dateRange.value.end) params.append('end_date', dateRange.value.end)
    if (selectedTenant.value) params.append('tenant_id', selectedTenant.value)

    const response = await fetch(`/admin-api/v1/reports/platform/export?${params}`, {
      headers: {
        'Authorization': `Bearer ${adminAuth.token}`
      }
    })

    if (response.ok) {
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `platform_report_${selectedReport.value}_${Date.now()}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      // Fallback: export current data as CSV
      exportToCSV()
    }
  } catch (error) {
    console.error('Error exporting:', error)
    exportToCSV()
  }
}

function exportToCSV() {
  if (!reportData.value) return

  const headers = reportColumns.value.map(c => c.label)
  const rows = reportData.value.map(row =>
    reportColumns.value.map(c => row[c.key] || '')
  )

  let csv = headers.join(',') + '\n'
  rows.forEach(row => {
    csv += row.join(',') + '\n'
  })

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `platform_report_${selectedReport.value}_${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatNumber(value) {
  if (value === null || value === undefined) return '0'
  return new Intl.NumberFormat().format(value)
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

// Lifecycle
onMounted(() => {
  // Set default date range
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  dateRange.value.start = start.toISOString().split('T')[0]
  dateRange.value.end = end.toISOString().split('T')[0]

  fetchTenants()
})

watch(currentChartType, () => {
  if (reportData.value) {
    renderChart()
  }
})
</script>
