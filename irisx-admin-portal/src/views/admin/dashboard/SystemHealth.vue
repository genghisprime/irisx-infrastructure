<template>
  <div class="system-health">
    <div class="page-header">
      <h1>System Health & Monitoring</h1>
      <button @click="fetchAllData" class="refresh-btn" :disabled="loading">
        <span v-if="loading">Refreshing...</span>
        <span v-else>Refresh</span>
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="loading && !health" class="loading">
      Loading system health...
    </div>

    <div v-if="health" class="health-container">
      <!-- Overall Status -->
      <div class="overall-status" :class="health.status">
        <h2>Overall Status: {{ health.status.toUpperCase() }}</h2>
        <p class="timestamp">Last Updated: {{ formatTimestamp(health.timestamp) }}</p>
      </div>

      <!-- Platform Metrics -->
      <div v-if="metrics" class="metrics-section">
        <h2 class="section-title">Platform Metrics</h2>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Active Tenants</div>
            <div class="metric-value">{{ metrics.activeTenants }}</div>
            <div class="metric-subtitle">Total: {{ metrics.totalTenants }}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Active Users</div>
            <div class="metric-value">{{ metrics.activeUsers }}</div>
            <div class="metric-subtitle">Total: {{ metrics.totalUsers }}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Voice Calls (24h)</div>
            <div class="metric-value">{{ formatNumber(metrics.communications.voice.total) }}</div>
            <div class="metric-subtitle">
              Success: {{ metrics.communications.voice.successful }}
              ({{ calculateSuccessRate(metrics.communications.voice) }}%)
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">SMS Messages (24h)</div>
            <div class="metric-value">{{ formatNumber(metrics.communications.sms.total) }}</div>
            <div class="metric-subtitle">
              Success: {{ metrics.communications.sms.successful }}
              ({{ calculateSuccessRate(metrics.communications.sms) }}%)
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Emails (24h)</div>
            <div class="metric-value">{{ formatNumber(metrics.communications.email.total) }}</div>
            <div class="metric-subtitle">
              Success: {{ metrics.communications.email.successful }}
              ({{ calculateSuccessRate(metrics.communications.email) }}%)
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Database Size</div>
            <div class="metric-value">{{ formatBytes(metrics.database.totalSize) }}</div>
            <div class="metric-subtitle">{{ metrics.database.tables }} tables</div>
          </div>
        </div>
      </div>

      <!-- Uptime & SLA -->
      <div v-if="uptime" class="uptime-section">
        <h2 class="section-title">Uptime & SLA Compliance</h2>
        <div class="uptime-grid">
          <div class="uptime-card">
            <div class="uptime-label">System Uptime</div>
            <div class="uptime-value">{{ uptime.uptime.days }}d {{ uptime.uptime.hours }}h {{ uptime.uptime.minutes }}m</div>
            <div class="uptime-subtitle">Since: {{ formatTimestamp(uptime.startTime) }}</div>
          </div>
          <div class="uptime-card">
            <div class="uptime-label">Availability (7 days)</div>
            <div class="uptime-value" :class="getSLAClass(uptime.availability.last7Days)">
              {{ uptime.availability.last7Days.toFixed(3) }}%
            </div>
            <div class="uptime-subtitle">Target: {{ uptime.sla.target }}%</div>
          </div>
          <div class="uptime-card">
            <div class="uptime-label">Availability (30 days)</div>
            <div class="uptime-value" :class="getSLAClass(uptime.availability.last30Days)">
              {{ uptime.availability.last30Days.toFixed(3) }}%
            </div>
            <div class="uptime-subtitle">{{ uptime.sla.status }}</div>
          </div>
        </div>
      </div>

      <!-- Component Health -->
      <div class="components-section">
        <h2 class="section-title">Component Health</h2>
        <div class="components-grid">
          <div v-for="(component, name) in health.components" :key="name"
               class="component-card" :class="component.status">
            <h3>{{ formatComponentName(name) }}</h3>
            <div class="status-badge" :class="component.status">
              {{ component.status }}
            </div>

            <div v-if="component.responseTime" class="metric">
              Response Time: {{ component.responseTime }}ms
            </div>

            <div v-if="component.connections" class="metric">
              Connections: {{ component.connections.current }}/{{ component.connections.max }}
              ({{ component.connections.percentage }}%)
            </div>

            <div v-if="component.memory" class="metric">
              Memory: {{ formatBytes(component.memory.used) }} / {{ formatBytes(component.memory.total) }}
              ({{ component.memory.percentage }}%)
            </div>

            <div v-if="component.hitRate !== undefined" class="metric">
              Cache Hit Rate: {{ component.hitRate }}%
            </div>

            <div v-if="component.registered !== undefined" class="metric">
              Status: {{ component.registered ? 'Registered' : 'Not Registered' }}
            </div>

            <div v-if="component.activeChannels !== undefined" class="metric">
              Active Channels: {{ component.activeChannels }}
            </div>

            <div v-if="component.error" class="error-detail">
              {{ component.error }}
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Errors -->
      <div v-if="errors && errors.errors.length > 0" class="errors-section">
        <h2 class="section-title">Recent Errors (Last {{ errorTimeRange }}h)</h2>
        <div class="errors-summary">
          <div class="error-stat">
            <span class="error-stat-label">Failed Calls:</span>
            <span class="error-stat-value">{{ errors.summary.failedCalls }}</span>
          </div>
          <div class="error-stat">
            <span class="error-stat-label">Failed SMS:</span>
            <span class="error-stat-value">{{ errors.summary.failedSMS }}</span>
          </div>
          <div class="error-stat">
            <span class="error-stat-label">Failed Emails:</span>
            <span class="error-stat-value">{{ errors.summary.failedEmails }}</span>
          </div>
        </div>
        <div class="errors-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Tenant</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="err in errors.errors.slice(0, 10)" :key="err.id">
                <td>{{ formatTimestamp(err.timestamp) }}</td>
                <td><span class="error-type-badge">{{ err.type }}</span></td>
                <td>{{ err.tenantName || err.tenantId }}</td>
                <td class="error-message">{{ err.errorMessage }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const loading = ref(true)
const error = ref(null)
const health = ref(null)
const metrics = ref(null)
const uptime = ref(null)
const errors = ref(null)
const errorTimeRange = ref(24) // hours
let refreshInterval = null

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchAllData() {
  loading.value = true
  error.value = null

  try {
    const token = localStorage.getItem('adminToken')
    const headers = { Authorization: `Bearer ${token}` }

    // Fetch all monitoring data in parallel
    const [healthRes, metricsRes, uptimeRes, errorsRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/admin/system/health`, { headers }),
      axios.get(`${API_BASE_URL}/admin/system/metrics`, { headers }),
      axios.get(`${API_BASE_URL}/admin/system/uptime`, { headers }),
      axios.get(`${API_BASE_URL}/admin/system/errors?hours=${errorTimeRange.value}`, { headers })
    ])

    health.value = healthRes.data
    metrics.value = metricsRes.data
    uptime.value = uptimeRes.data
    errors.value = errorsRes.data
  } catch (err) {
    console.error('Failed to fetch system data:', err)
    error.value = 'Failed to load system health data'
  } finally {
    loading.value = false
  }
}

function formatComponentName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function formatNumber(num) {
  return num.toLocaleString()
}

function calculateSuccessRate(commData) {
  if (commData.total === 0) return 100
  return ((commData.successful / commData.total) * 100).toFixed(1)
}

function getSLAClass(availability) {
  if (availability >= 99.9) return 'sla-excellent'
  if (availability >= 99.0) return 'sla-good'
  return 'sla-poor'
}

onMounted(() => {
  fetchAllData()
  // Auto-refresh every 30 seconds
  refreshInterval = setInterval(fetchAllData, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
.system-health {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  font-weight: 600;
  color: #1f2937;
}

.refresh-btn {
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: #2563eb;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  padding: 1rem;
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}

.health-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.overall-status {
  padding: 1.5rem;
  border-radius: 0.5rem;
  text-align: center;
}

.overall-status.healthy {
  background-color: #d1fae5;
  color: #065f46;
}

.overall-status.degraded {
  background-color: #fef3c7;
  color: #92400e;
}

.overall-status.unhealthy {
  background-color: #fee2e2;
  color: #991b1b;
}

.overall-status h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.timestamp {
  color: #6b7280;
  font-size: 0.875rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 1rem;
}

/* Metrics Section */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.metric-card {
  padding: 1.5rem;
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: center;
}

.metric-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.metric-subtitle {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Uptime Section */
.uptime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.uptime-card {
  padding: 1.5rem;
  background-color: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: center;
}

.uptime-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.uptime-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.uptime-value.sla-excellent {
  color: #059669;
}

.uptime-value.sla-good {
  color: #d97706;
}

.uptime-value.sla-poor {
  color: #dc2626;
}

.uptime-subtitle {
  font-size: 0.75rem;
  color: #9ca3af;
}

/* Components Section */
.components-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.component-card {
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 2px solid #e5e7eb;
  background-color: white;
}

.component-card.healthy {
  border-color: #10b981;
}

.component-card.degraded {
  border-color: #f59e0b;
}

.component-card.unhealthy {
  border-color: #ef4444;
}

.component-card h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #1f2937;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 1rem;
  text-transform: uppercase;
}

.status-badge.healthy {
  background-color: #d1fae5;
  color: #065f46;
}

.status-badge.degraded {
  background-color: #fef3c7;
  color: #92400e;
}

.status-badge.unhealthy {
  background-color: #fee2e2;
  color: #991b1b;
}

.metric {
  padding: 0.5rem 0;
  color: #4b5563;
  font-size: 0.875rem;
  border-top: 1px solid #e5e7eb;
}

.error-detail {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

/* Errors Section */
.errors-summary {
  display: flex;
  gap: 2rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background-color: #fef2f2;
  border-radius: 0.5rem;
}

.error-stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.error-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #dc2626;
}

.errors-table {
  background-color: white;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.errors-table table {
  width: 100%;
  border-collapse: collapse;
}

.errors-table thead {
  background-color: #f9fafb;
}

.errors-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.errors-table td {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #6b7280;
  border-bottom: 1px solid #f3f4f6;
}

.error-type-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.error-message {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
