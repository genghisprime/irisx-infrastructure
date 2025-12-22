<template>
  <div class="analytics-overview">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Analytics Dashboard</h1>
        <p class="text-muted">Cross-tenant usage analytics and revenue insights</p>
      </div>
      <div class="header-actions">
        <select v-model="selectedPeriod" @change="loadAllData" class="form-select">
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
        </select>
        <button @click="loadAllData" class="btn btn-secondary" :disabled="loading">
          <i class="bi bi-arrow-clockwise" :class="{ 'spin': loading }"></i>
          Refresh
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !overview" class="loading-container">
      <div class="spinner"></div>
      <p>Loading analytics data...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <i class="bi bi-exclamation-triangle"></i>
      <p>{{ error }}</p>
      <button @click="loadAllData" class="btn btn-primary">Retry</button>
    </div>

    <!-- Dashboard Content -->
    <div v-else class="dashboard-content">
      <!-- Overview Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card tenants">
          <div class="stat-icon">
            <i class="bi bi-building"></i>
          </div>
          <div class="stat-content">
            <h3>{{ overview?.tenants?.total || 0 }}</h3>
            <p>Total Tenants</p>
            <span class="stat-meta">{{ overview?.tenants?.active || 0 }} active</span>
          </div>
        </div>

        <div class="stat-card calls">
          <div class="stat-icon">
            <i class="bi bi-telephone"></i>
          </div>
          <div class="stat-content">
            <h3>{{ formatNumber(overview?.usage?.totalCalls) }}</h3>
            <p>Voice Calls</p>
            <span class="stat-meta">{{ formatNumber(overview?.usage?.totalCallMinutes) }} minutes</span>
          </div>
        </div>

        <div class="stat-card sms">
          <div class="stat-icon">
            <i class="bi bi-chat-dots"></i>
          </div>
          <div class="stat-content">
            <h3>{{ formatNumber(overview?.usage?.totalSMS) }}</h3>
            <p>SMS Messages</p>
            <span class="stat-meta">All tenants</span>
          </div>
        </div>

        <div class="stat-card emails">
          <div class="stat-icon">
            <i class="bi bi-envelope"></i>
          </div>
          <div class="stat-content">
            <h3>{{ formatNumber(overview?.usage?.totalEmails) }}</h3>
            <p>Emails Sent</p>
            <span class="stat-meta">All tenants</span>
          </div>
        </div>

        <div class="stat-card revenue">
          <div class="stat-icon">
            <i class="bi bi-currency-dollar"></i>
          </div>
          <div class="stat-content">
            <h3>${{ formatCurrency(overview?.revenue?.total) }}</h3>
            <p>Total Revenue</p>
            <span class="stat-meta">${{ formatCurrency(overview?.revenue?.collected) }} collected</span>
          </div>
        </div>

        <div class="stat-card cost">
          <div class="stat-icon">
            <i class="bi bi-graph-up"></i>
          </div>
          <div class="stat-content">
            <h3>${{ formatCurrency(overview?.usage?.totalCost) }}</h3>
            <p>Total Usage Cost</p>
            <span class="stat-meta">{{ selectedPeriod }} period</span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <i :class="tab.icon"></i>
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- Channel Comparison Tab -->
        <div v-if="activeTab === 'channels'" class="channels-tab">
          <h2>Channel Comparison</h2>
          <p class="section-description">Usage distribution across communication channels</p>

          <div class="channel-grid">
            <div
              v-for="channel in channelData?.channels || []"
              :key="channel.channel"
              class="channel-card"
              :class="channel.channel"
            >
              <div class="channel-header">
                <i :class="getChannelIcon(channel.channel)"></i>
                <h3>{{ channel.label }}</h3>
              </div>
              <div class="channel-stats">
                <div class="stat">
                  <span class="value">{{ formatNumber(channel.count) }}</span>
                  <span class="label">Total</span>
                </div>
                <div class="stat">
                  <span class="value">{{ channel.percentage }}%</span>
                  <span class="label">Share</span>
                </div>
                <div class="stat">
                  <span class="value">${{ formatCurrency(channel.cost) }}</span>
                  <span class="label">Cost</span>
                </div>
              </div>
              <div class="channel-bar">
                <div class="bar-fill" :style="{ width: channel.percentage + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="channel-totals">
            <div class="total-item">
              <span class="label">Total Messages/Calls:</span>
              <span class="value">{{ formatNumber(channelData?.totals?.count) }}</span>
            </div>
            <div class="total-item">
              <span class="label">Total Cost:</span>
              <span class="value">${{ formatCurrency(channelData?.totals?.cost) }}</span>
            </div>
          </div>
        </div>

        <!-- Usage Trends Tab -->
        <div v-if="activeTab === 'trends'" class="trends-tab">
          <h2>Usage Trends</h2>
          <p class="section-description">Daily usage patterns over time</p>

          <div class="trends-controls">
            <select v-model="trendsGranularity" @change="loadUsageTrends" class="form-select">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div class="trends-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Calls</th>
                  <th>Call Minutes</th>
                  <th>SMS</th>
                  <th>Emails</th>
                  <th>Cost</th>
                  <th>Active Tenants</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="trend in usageTrends?.trends || []" :key="trend.date">
                  <td>{{ formatDate(trend.date) }}</td>
                  <td>{{ formatNumber(trend.calls) }}</td>
                  <td>{{ formatNumber(trend.callMinutes) }}</td>
                  <td>{{ formatNumber(trend.sms) }}</td>
                  <td>{{ formatNumber(trend.emails) }}</td>
                  <td>${{ formatCurrency(trend.cost) }}</td>
                  <td>{{ trend.activeTenants }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Tenants Tab -->
        <div v-if="activeTab === 'topTenants'" class="top-tenants-tab">
          <h2>Top Tenants</h2>
          <p class="section-description">Highest usage and revenue generating tenants</p>

          <div class="top-tenants-controls">
            <select v-model="topTenantsSortBy" @change="loadTopTenants" class="form-select">
              <option value="cost">By Cost</option>
              <option value="calls">By Calls</option>
              <option value="sms">By SMS</option>
              <option value="emails">By Emails</option>
            </select>
          </div>

          <div class="top-tenants-list">
            <div
              v-for="tenant in topTenants?.tenants || []"
              :key="tenant.tenantId"
              class="tenant-card"
            >
              <div class="tenant-rank">#{{ tenant.rank }}</div>
              <div class="tenant-info">
                <h4>{{ tenant.tenantName }}</h4>
                <span :class="['status-badge', tenant.status]">{{ tenant.status }}</span>
              </div>
              <div class="tenant-stats">
                <div class="stat">
                  <i class="bi bi-telephone"></i>
                  <span>{{ formatNumber(tenant.totalCalls) }} calls</span>
                </div>
                <div class="stat">
                  <i class="bi bi-chat-dots"></i>
                  <span>{{ formatNumber(tenant.totalSMS) }} SMS</span>
                </div>
                <div class="stat">
                  <i class="bi bi-envelope"></i>
                  <span>{{ formatNumber(tenant.totalEmails) }} emails</span>
                </div>
              </div>
              <div class="tenant-cost">
                <span class="cost-value">${{ formatCurrency(tenant.totalCost) }}</span>
                <span class="cost-label">Total Cost</span>
              </div>
              <button
                @click="viewTenantAnalytics(tenant.tenantId)"
                class="btn btn-sm btn-outline"
              >
                View Details
              </button>
            </div>
          </div>
        </div>

        <!-- Cost Breakdown Tab -->
        <div v-if="activeTab === 'costs'" class="costs-tab">
          <h2>Cost Breakdown</h2>
          <p class="section-description">Cost distribution by tenant and channel</p>

          <div class="cost-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Voice Cost</th>
                  <th>SMS Cost</th>
                  <th>Email Cost</th>
                  <th>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tenant in costBreakdown?.tenants || []" :key="tenant.tenantId">
                  <td>
                    <strong>{{ tenant.tenantName }}</strong>
                  </td>
                  <td>${{ formatCurrency(tenant.voiceCost) }}</td>
                  <td>${{ formatCurrency(tenant.smsCost) }}</td>
                  <td>${{ formatCurrency(tenant.emailCost) }}</td>
                  <td class="total-col">${{ formatCurrency(tenant.totalCost) }}</td>
                </tr>
              </tbody>
              <tfoot v-if="costBreakdown?.tenants?.length">
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>${{ formatCurrency(calculateTotal(costBreakdown?.tenants, 'voiceCost')) }}</strong></td>
                  <td><strong>${{ formatCurrency(calculateTotal(costBreakdown?.tenants, 'smsCost')) }}</strong></td>
                  <td><strong>${{ formatCurrency(calculateTotal(costBreakdown?.tenants, 'emailCost')) }}</strong></td>
                  <td class="total-col"><strong>${{ formatCurrency(calculateTotal(costBreakdown?.tenants, 'totalCost')) }}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Real-Time Tab -->
        <div v-if="activeTab === 'realtime'" class="realtime-tab">
          <h2>Real-Time Activity</h2>
          <p class="section-description">Live platform activity (last 24 hours)</p>

          <div class="realtime-stats">
            <div class="realtime-card active-calls">
              <div class="pulse-indicator"></div>
              <h3>{{ realTimeData?.activeCalls || 0 }}</h3>
              <p>Active Calls</p>
            </div>
            <div class="realtime-card active-chats">
              <div class="pulse-indicator"></div>
              <h3>{{ realTimeData?.activeChats || 0 }}</h3>
              <p>Active Chats</p>
            </div>
          </div>

          <div class="hourly-breakdown" v-if="realTimeData?.hourlyBreakdown?.length">
            <h3>Hourly Activity (Last 24h)</h3>
            <table class="data-table compact">
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Calls</th>
                  <th>SMS</th>
                  <th>Emails</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hour in realTimeData.hourlyBreakdown" :key="hour.hour">
                  <td>{{ formatHour(hour.hour) }}</td>
                  <td>{{ hour.calls }}</td>
                  <td>{{ hour.sms }}</td>
                  <td>{{ hour.emails }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="realtime-footer">
            <span>Last updated: {{ realTimeData?.timestamp ? formatDateTime(realTimeData.timestamp) : 'N/A' }}</span>
            <button @click="loadRealTimeData" class="btn btn-sm btn-secondary">
              <i class="bi bi-arrow-clockwise"></i>
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tenant Details Modal -->
    <div v-if="showTenantModal" class="modal-overlay" @click.self="closeTenantModal">
      <div class="modal-content large">
        <div class="modal-header">
          <h2>Tenant Analytics: {{ selectedTenantData?.tenant?.name }}</h2>
          <button @click="closeTenantModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body" v-if="selectedTenantData">
          <div class="tenant-detail-grid">
            <div class="detail-card">
              <h4>Tenant Info</h4>
              <p><strong>Name:</strong> {{ selectedTenantData.tenant.name }}</p>
              <p><strong>Status:</strong> {{ selectedTenantData.tenant.status }}</p>
              <p><strong>Credit Balance:</strong> ${{ formatCurrency(selectedTenantData.tenant.creditBalance) }}</p>
            </div>
            <div class="detail-card">
              <h4>Voice Usage</h4>
              <p><strong>Calls:</strong> {{ formatNumber(selectedTenantData.usage.totalCalls) }}</p>
              <p><strong>Minutes:</strong> {{ formatNumber(selectedTenantData.usage.totalCallMinutes) }}</p>
              <p><strong>Cost:</strong> ${{ formatCurrency(selectedTenantData.usage.totalCallCost) }}</p>
            </div>
            <div class="detail-card">
              <h4>SMS Usage</h4>
              <p><strong>Messages:</strong> {{ formatNumber(selectedTenantData.usage.totalSMS) }}</p>
              <p><strong>Cost:</strong> ${{ formatCurrency(selectedTenantData.usage.totalSMSCost) }}</p>
            </div>
            <div class="detail-card">
              <h4>Email Usage</h4>
              <p><strong>Emails:</strong> {{ formatNumber(selectedTenantData.usage.totalEmails) }}</p>
              <p><strong>Cost:</strong> ${{ formatCurrency(selectedTenantData.usage.totalEmailCost) }}</p>
            </div>
          </div>

          <div class="tenant-daily-trends" v-if="selectedTenantData.dailyTrends?.length">
            <h4>Daily Usage Trends</h4>
            <table class="data-table compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Calls</th>
                  <th>SMS</th>
                  <th>Emails</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in selectedTenantData.dailyTrends.slice(-14)" :key="day.date">
                  <td>{{ formatDate(day.date) }}</td>
                  <td>{{ day.calls }}</td>
                  <td>{{ day.sms }}</td>
                  <td>{{ day.emails }}</td>
                  <td>${{ formatCurrency(day.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

// State
const loading = ref(false)
const error = ref(null)
const selectedPeriod = ref('30d')
const activeTab = ref('channels')
const trendsGranularity = ref('daily')
const topTenantsSortBy = ref('cost')

// Data
const overview = ref(null)
const channelData = ref(null)
const usageTrends = ref(null)
const topTenants = ref(null)
const costBreakdown = ref(null)
const realTimeData = ref(null)

// Tenant Modal
const showTenantModal = ref(false)
const selectedTenantData = ref(null)

// Tabs configuration
const tabs = [
  { id: 'channels', label: 'Channels', icon: 'bi bi-bar-chart' },
  { id: 'trends', label: 'Usage Trends', icon: 'bi bi-graph-up' },
  { id: 'topTenants', label: 'Top Tenants', icon: 'bi bi-trophy' },
  { id: 'costs', label: 'Cost Breakdown', icon: 'bi bi-pie-chart' },
  { id: 'realtime', label: 'Real-Time', icon: 'bi bi-lightning' }
]

// Load all data
const loadAllData = async () => {
  loading.value = true
  error.value = null

  try {
    const [overviewRes, channelsRes, trendsRes, topTenantsRes, costsRes] = await Promise.all([
      adminAPI.analyticsDashboard.getOverview({ period: selectedPeriod.value }),
      adminAPI.analyticsDashboard.getChannelComparison({ period: selectedPeriod.value }),
      adminAPI.analyticsDashboard.getUsageTrends({ period: selectedPeriod.value, granularity: trendsGranularity.value }),
      adminAPI.analyticsDashboard.getTopTenants({ period: selectedPeriod.value, sortBy: topTenantsSortBy.value }),
      adminAPI.analyticsDashboard.getCostBreakdown({ period: selectedPeriod.value })
    ])

    overview.value = overviewRes
    channelData.value = channelsRes
    usageTrends.value = trendsRes
    topTenants.value = topTenantsRes
    costBreakdown.value = costsRes
  } catch (err) {
    console.error('Error loading analytics:', err)
    error.value = err.response?.data?.error || 'Failed to load analytics data'
  } finally {
    loading.value = false
  }
}

// Load usage trends with granularity
const loadUsageTrends = async () => {
  try {
    usageTrends.value = await adminAPI.analyticsDashboard.getUsageTrends({
      period: selectedPeriod.value,
      granularity: trendsGranularity.value
    })
  } catch (err) {
    console.error('Error loading trends:', err)
  }
}

// Load top tenants with sort
const loadTopTenants = async () => {
  try {
    topTenants.value = await adminAPI.analyticsDashboard.getTopTenants({
      period: selectedPeriod.value,
      sortBy: topTenantsSortBy.value
    })
  } catch (err) {
    console.error('Error loading top tenants:', err)
  }
}

// Load real-time data
const loadRealTimeData = async () => {
  try {
    realTimeData.value = await adminAPI.analyticsDashboard.getRealTime()
  } catch (err) {
    console.error('Error loading real-time data:', err)
  }
}

// View tenant analytics
const viewTenantAnalytics = async (tenantId) => {
  try {
    selectedTenantData.value = await adminAPI.analyticsDashboard.getTenantAnalytics(tenantId, {
      period: selectedPeriod.value
    })
    showTenantModal.value = true
  } catch (err) {
    console.error('Error loading tenant analytics:', err)
  }
}

const closeTenantModal = () => {
  showTenantModal.value = false
  selectedTenantData.value = null
}

// Helper functions
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat().format(Math.round(num))
}

const formatCurrency = (num) => {
  if (num === null || num === undefined) return '0.00'
  return parseFloat(num).toFixed(2)
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

const formatHour = (hourStr) => {
  if (!hourStr) return ''
  return new Date(hourStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getChannelIcon = (channel) => {
  const icons = {
    voice: 'bi bi-telephone',
    sms: 'bi bi-chat-dots',
    email: 'bi bi-envelope',
    whatsapp: 'bi bi-whatsapp',
    social: 'bi bi-share'
  }
  return icons[channel] || 'bi bi-circle'
}

const calculateTotal = (items, field) => {
  if (!items) return 0
  return items.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0)
}

// Initialize
onMounted(() => {
  loadAllData()
  loadRealTimeData()

  // Refresh real-time data every 60 seconds
  setInterval(loadRealTimeData, 60000)
})
</script>

<style scoped>
.analytics-overview {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
}

.page-header .text-muted {
  color: #6c757d;
  margin: 4px 0 0 0;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.form-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 150px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-outline {
  background: transparent;
  border: 1px solid #ddd;
  color: #374151;
}

.btn-outline:hover {
  background: #f3f4f6;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 0.75rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Loading & Error States */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #6c757d;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f4f6;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-container i {
  font-size: 48px;
  color: #ef4444;
  margin-bottom: 16px;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid;
}

.stat-card.tenants { border-left-color: #6366f1; }
.stat-card.calls { border-left-color: #22c55e; }
.stat-card.sms { border-left-color: #eab308; }
.stat-card.emails { border-left-color: #3b82f6; }
.stat-card.revenue { border-left-color: #14b8a6; }
.stat-card.cost { border-left-color: #f97316; }

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: #f3f4f6;
}

.stat-card.tenants .stat-icon { color: #6366f1; }
.stat-card.calls .stat-icon { color: #22c55e; }
.stat-card.sms .stat-icon { color: #eab308; }
.stat-card.emails .stat-icon { color: #3b82f6; }
.stat-card.revenue .stat-icon { color: #14b8a6; }
.stat-card.cost .stat-icon { color: #f97316; }

.stat-content h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-content p {
  margin: 4px 0;
  color: #6c757d;
  font-size: 0.875rem;
}

.stat-meta {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0;
}

.tab {
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: #6c757d;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tab:hover {
  color: #374151;
}

.tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

/* Tab Content */
.tab-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-content h2 {
  margin: 0 0 8px 0;
  font-size: 1.25rem;
}

.section-description {
  color: #6c757d;
  margin: 0 0 20px 0;
}

/* Channel Grid */
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.channel-card {
  background: #f9fafb;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #e5e7eb;
}

.channel-card.voice { border-top: 3px solid #22c55e; }
.channel-card.sms { border-top: 3px solid #eab308; }
.channel-card.email { border-top: 3px solid #3b82f6; }
.channel-card.whatsapp { border-top: 3px solid #25d366; }
.channel-card.social { border-top: 3px solid #6366f1; }

.channel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.channel-header i {
  font-size: 1.25rem;
}

.channel-header h3 {
  margin: 0;
  font-size: 1rem;
}

.channel-stats {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.channel-stats .stat {
  text-align: center;
}

.channel-stats .value {
  display: block;
  font-size: 1.125rem;
  font-weight: 600;
}

.channel-stats .label {
  font-size: 0.75rem;
  color: #6c757d;
}

.channel-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.channel-totals {
  display: flex;
  justify-content: flex-end;
  gap: 32px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.total-item {
  display: flex;
  gap: 8px;
}

.total-item .label {
  color: #6c757d;
}

.total-item .value {
  font-weight: 600;
}

/* Controls */
.trends-controls,
.top-tenants-controls {
  margin-bottom: 16px;
}

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.data-table th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
}

.data-table tbody tr:hover {
  background: #f9fafb;
}

.data-table.compact th,
.data-table.compact td {
  padding: 8px 12px;
  font-size: 0.875rem;
}

.data-table tfoot td {
  background: #f3f4f6;
  font-weight: 600;
}

.total-col {
  font-weight: 600;
  color: #3b82f6;
}

/* Top Tenants List */
.top-tenants-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tenant-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}

.tenant-rank {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.tenant-info {
  flex: 1;
}

.tenant-info h4 {
  margin: 0;
  font-size: 1rem;
}

.tenant-info p {
  margin: 4px 0;
  color: #6c757d;
  font-size: 0.875rem;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.active {
  background: #dcfce7;
  color: #166534;
}

.status-badge.suspended {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.tenant-stats {
  display: flex;
  gap: 16px;
}

.tenant-stats .stat {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6c757d;
  font-size: 0.875rem;
}

.tenant-cost {
  text-align: right;
  min-width: 100px;
}

.cost-value {
  display: block;
  font-size: 1.125rem;
  font-weight: 700;
  color: #22c55e;
}

.cost-label {
  font-size: 0.75rem;
  color: #6c757d;
}

/* Real-Time Tab */
.realtime-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}

.realtime-card {
  flex: 1;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
  position: relative;
}

.realtime-card.active-chats {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
}

.pulse-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 10px;
  height: 10px;
  background: #fbbf24;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

.realtime-card h3 {
  margin: 0;
  font-size: 3rem;
  font-weight: 700;
}

.realtime-card p {
  margin: 8px 0 0 0;
  opacity: 0.9;
}

.hourly-breakdown {
  margin-top: 24px;
}

.hourly-breakdown h3 {
  margin: 0 0 12px 0;
  font-size: 1rem;
}

.realtime-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  color: #6c757d;
  font-size: 0.875rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 900px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}

.close-btn:hover {
  color: #374151;
}

.modal-body {
  padding: 24px;
}

.tenant-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.detail-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}

.detail-card h4 {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  color: #6c757d;
  text-transform: uppercase;
}

.detail-card p {
  margin: 6px 0;
  font-size: 0.875rem;
}

.tenant-daily-trends h4 {
  margin: 0 0 12px 0;
}

/* Table Container */
.trends-table-container,
.cost-table-container {
  overflow-x: auto;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .tabs {
    overflow-x: auto;
    white-space: nowrap;
  }

  .tenant-card {
    flex-wrap: wrap;
  }

  .tenant-stats {
    width: 100%;
    justify-content: space-around;
    margin-top: 12px;
  }

  .tenant-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
