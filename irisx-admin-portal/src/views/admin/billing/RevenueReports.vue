<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Revenue Reports</h1>

    <!-- Date Range Filter -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
          <input
            v-model="filters.start_date"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            v-model="filters.end_date"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
          <select
            v-model="filters.report_type"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="mrr">MRR Overview</option>
            <option value="arr">ARR Overview</option>
            <option value="churn">Churn Rate</option>
            <option value="ltv">Customer LTV</option>
          </select>
        </div>
        <div class="flex items-end">
          <button
            @click="applyFilters"
            class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Generate Report
          </button>
        </div>
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

    <!-- Revenue Overview -->
    <div v-else>
      <!-- Key Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Current MRR</p>
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">${{ formatCurrency(metrics.current_mrr) }}</p>
          <p class="text-xs text-gray-500 mt-1">
            <span :class="metrics.mrr_growth >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ metrics.mrr_growth >= 0 ? '+' : '' }}{{ metrics.mrr_growth }}%
            </span>
            vs last month
          </p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">ARR</p>
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">${{ formatCurrency(metrics.arr) }}</p>
          <p class="text-xs text-gray-500 mt-1">Annual Recurring Revenue</p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Churn Rate</p>
            <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">{{ metrics.churn_rate }}%</p>
          <p class="text-xs text-gray-500 mt-1">Last 30 days</p>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm text-gray-600">Avg LTV</p>
            <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p class="text-2xl font-bold text-gray-900">${{ formatCurrency(metrics.avg_ltv) }}</p>
          <p class="text-xs text-gray-500 mt-1">Lifetime Value</p>
        </div>
      </div>

      <!-- MRR Growth Chart (Placeholder) -->
      <div class="bg-white rounded-lg shadow p-6 mb-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">MRR Growth Trend</h2>
        <div class="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
          <p class="text-gray-500">Chart visualization would go here (integrate with Chart.js or similar)</p>
        </div>
      </div>

      <!-- Revenue by Plan -->
      <div class="bg-white rounded-lg shadow overflow-hidden mb-8">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Revenue by Plan</h2>
        </div>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Plan
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Subscribers
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                MRR
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                % of Total
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Avg per Customer
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="plan in revenueByPlan" :key="plan.name" class="hover:bg-gray-50">
              <td class="px-6 py-4">
                <span
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="getPlanClass(plan.name)"
                >
                  {{ plan.name }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-900">
                {{ plan.subscribers }}
              </td>
              <td class="px-6 py-4 text-sm font-medium text-gray-900">
                ${{ formatCurrency(plan.mrr) }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-900">
                {{ plan.percentage }}%
              </td>
              <td class="px-6 py-4 text-sm text-gray-900">
                ${{ formatCurrency(plan.avg_per_customer) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Recent Transactions -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Recent Transactions</h2>
        </div>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tenant
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="txn in recentTransactions" :key="txn.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 text-sm text-gray-900">
                {{ formatDate(txn.date) }}
              </td>
              <td class="px-6 py-4 text-sm font-medium text-gray-900">
                {{ txn.tenant_name }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-600">
                {{ txn.type }}
              </td>
              <td class="px-6 py-4 text-sm font-medium text-gray-900">
                ${{ formatCurrency(txn.amount) }}
              </td>
              <td class="px-6 py-4">
                <span
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="getStatusClass(txn.status)"
                >
                  {{ txn.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty State -->
        <div v-if="recentTransactions.length === 0" class="text-center py-12">
          <p class="text-gray-500">No transactions found</p>
        </div>
      </div>

      <!-- Export Actions -->
      <div class="mt-6 flex justify-end space-x-3">
        <button
          @click="exportCSV"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
        <button
          @click="exportPDF"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Export PDF
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const error = ref(null)

const filters = ref({
  start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0],
  report_type: 'mrr'
})

const metrics = ref({
  current_mrr: 0,
  mrr_growth: 0,
  arr: 0,
  churn_rate: 0,
  avg_ltv: 0
})

const revenueByPlan = ref([])
const recentTransactions = ref([])

onMounted(() => {
  fetchReports()
})

async function fetchReports() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.billing.getRevenueReport(filters.value)

    metrics.value = response.data.metrics || {}
    revenueByPlan.value = response.data.revenue_by_plan || []
    recentTransactions.value = response.data.recent_transactions || []
  } catch (err) {
    console.error('Failed to fetch revenue reports:', err)
    error.value = 'Failed to load revenue reports'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  fetchReports()
}

function formatCurrency(value) {
  if (!value) return '0.00'
  return parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString()
}

function getPlanClass(plan) {
  const classes = {
    free: 'bg-gray-100 text-gray-800',
    starter: 'bg-blue-100 text-blue-800',
    professional: 'bg-purple-100 text-purple-800',
    enterprise: 'bg-yellow-100 text-yellow-800'
  }
  return classes[plan.toLowerCase()] || 'bg-gray-100 text-gray-800'
}

function getStatusClass(status) {
  const classes = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

async function exportCSV() {
  try {
    const response = await adminAPI.billing.exportRevenueReport({ ...filters.value, format: 'csv' })
    // Create download link
    const blob = new Blob([response.data], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${filters.value.start_date}-to-${filters.value.end_date}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to export CSV:', err)
    alert('Failed to export CSV')
  }
}

async function exportPDF() {
  try {
    const response = await adminAPI.billing.exportRevenueReport({ ...filters.value, format: 'pdf' })
    // Create download link
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${filters.value.start_date}-to-${filters.value.end_date}.pdf`
    a.click()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to export PDF:', err)
    alert('Failed to export PDF')
  }
}
</script>
