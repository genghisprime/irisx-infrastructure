<template>
  <div class="system-health">
    <div class="page-header">
      <h1>System Health & Infrastructure Monitoring</h1>
      <button @click="fetchAllData" class="refresh-btn" :disabled="loading">
        <span v-if="loading">Refreshing...</span>
        <span v-else>🔄 Refresh</span>
      </button>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="loading && !health" class="loading">
      Loading system health...
    </div>

    <!-- Infrastructure Overview -->
    <div v-if="health" class="infrastructure-overview">
      <div class="overall-status" :class="health.status">
        <h2>Overall Status: {{ health.status.toUpperCase() }}</h2>
        <p class="timestamp">Last Updated: {{ formatTimestamp(health.timestamp) }}</p>
      </div>

      <div class="overview-cards">
        <div class="overview-card">
          <div class="overview-label">Total Regions</div>
          <div class="overview-value">{{ health.overview.totalRegions }}</div>
          <div class="overview-subtitle">{{ health.overview.activeRegions }} Active</div>
        </div>
        <div class="overview-card">
          <div class="overview-label">Total Instances</div>
          <div class="overview-value">{{ health.overview.totalInstances }}</div>
          <div class="overview-subtitle">{{ health.overview.healthyInstances }} Healthy</div>
        </div>
        <div class="overview-card">
          <div class="overview-label">Database</div>
          <div class="overview-value">{{ health.components?.database?.status || 'unknown' }}</div>
          <div class="overview-subtitle" v-if="health.components?.database?.responseTime">
            {{ health.components.database.responseTime }}ms
          </div>
        </div>
        <div class="overview-card">
          <div class="overview-label">Redis Cache</div>
          <div class="overview-value">{{ health.components?.redis?.status || 'unknown' }}</div>
          <div class="overview-subtitle" v-if="health.components?.redis?.responseTime">
            {{ health.components.redis.responseTime }}ms
          </div>
        </div>
      </div>
    </div>

    <!-- Regional Breakdown -->
    <div v-if="health && health.regions" class="regions-section">
      <div v-for="(region, regionKey) in health.regions" :key="regionKey" class="region-container">
        <div class="region-header" :class="region.status">
          <h2>
            {{ region.name }}
            <span v-if="region.primary" class="primary-badge">PRIMARY</span>
          </h2>
          <div class="region-status-badge" :class="region.status">
            {{ region.status }}
          </div>
        </div>

        <!-- Availability Zones -->
        <div class="availability-zones">
          <div v-for="(az, azKey) in region.availabilityZones" :key="azKey" class="az-container">
            <h3 class="az-title">{{ az.name }}</h3>

            <!-- API Servers -->
            <div v-if="az.apiServers && az.apiServers.length > 0" class="server-group">
              <h4>API Servers</h4>
              <div class="server-list">
                <div v-for="server in az.apiServers" :key="server.instanceId"
                     class="server-card" :class="server.status">
                  <div class="server-header">
                    <span class="server-type">API</span>
                    <span class="server-status" :class="server.status">{{ server.status }}</span>
                  </div>
                  <div class="server-details">
                    <div class="server-detail">
                      <span class="label">Instance:</span>
                      <span class="value">{{ server.instanceId }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Public IP:</span>
                      <span class="value">{{ server.ip }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Private IP:</span>
                      <span class="value">{{ server.privateIp }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- FreeSWITCH Servers -->
            <div v-if="az.freeswitchServers && az.freeswitchServers.length > 0" class="server-group">
              <h4>FreeSWITCH Servers</h4>
              <div class="server-list">
                <div v-for="server in az.freeswitchServers" :key="server.instanceId"
                     class="server-card" :class="server.status">
                  <div class="server-header">
                    <span class="server-type">FreeSWITCH</span>
                    <span class="server-status" :class="server.status">{{ server.status }}</span>
                  </div>
                  <div class="server-details">
                    <div class="server-detail">
                      <span class="label">Instance:</span>
                      <span class="value">{{ server.instanceId }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Public IP:</span>
                      <span class="value">{{ server.ip }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Service:</span>
                      <span class="value" :class="getServiceStatusClass(server.serviceStatus)">
                        {{ server.serviceStatus }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mail Servers -->
            <div v-if="az.mailServers && az.mailServers.length > 0" class="server-group">
              <h4>Mail Servers</h4>
              <div class="server-list">
                <div v-for="server in az.mailServers" :key="server.instanceId"
                     class="server-card" :class="server.status">
                  <div class="server-header">
                    <span class="server-type">MAIL</span>
                    <span class="server-status" :class="server.status">{{ server.status }}</span>
                  </div>
                  <div class="server-details">
                    <div class="server-detail">
                      <span class="label">Instance:</span>
                      <span class="value">{{ server.instanceId }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Hostname:</span>
                      <span class="value">{{ server.hostname }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Public IP:</span>
                      <span class="value">{{ server.ip }}</span>
                    </div>
                    <div class="server-detail">
                      <span class="label">Service:</span>
                      <span class="value" :class="getServiceStatusClass(server.serviceStatus)">
                        {{ server.serviceStatus }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty AZ Message -->
            <div v-if="(!az.apiServers || az.apiServers.length === 0) &&
                       (!az.freeswitchServers || az.freeswitchServers.length === 0) &&
                       (!az.mailServers || az.mailServers.length === 0)"
                 class="empty-az">
              No instances deployed in this availability zone
            </div>
          </div>
        </div>

        <!-- Load Balancers -->
        <div v-if="region.loadBalancers && region.loadBalancers.length > 0" class="load-balancers">
          <h3>Load Balancers</h3>
          <div class="lb-list">
            <div v-for="(lb, idx) in region.loadBalancers" :key="idx"
                 class="lb-card" :class="lb.status">
              <div class="lb-header">
                <span class="lb-service">{{ lb.service }}</span>
                <span class="lb-status" :class="lb.status">{{ lb.status }}</span>
              </div>
              <div class="lb-details">
                <div class="lb-detail">
                  <span class="label">DNS:</span>
                  <span class="value">{{ lb.dns }}</span>
                </div>
                <div class="lb-detail">
                  <span class="label">Type:</span>
                  <span class="value">{{ lb.type }}</span>
                </div>
                <div class="lb-detail">
                  <span class="label">Targets:</span>
                  <span class="value">
                    {{ lb.targets.healthy }} healthy / {{ lb.targets.total }} total
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CloudWatch Alarms -->
        <div v-if="region.cloudwatchAlarms && region.cloudwatchAlarms.length > 0" class="cloudwatch-alarms">
          <h3>CloudWatch Alarms</h3>
          <div class="alarms-grid">
            <div v-for="(alarm, idx) in region.cloudwatchAlarms" :key="idx"
                 class="alarm-card" :class="alarm.status">
              <div class="alarm-name">{{ alarm.name }}</div>
              <div class="alarm-service">{{ alarm.service }}</div>
              <div class="alarm-status" :class="alarm.status">{{ alarm.status }}</div>
            </div>
          </div>
        </div>
      </div>
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
          <div class="metric-label">Total Users</div>
          <div class="metric-value">{{ metrics.totalUsers }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Voice Calls (24h)</div>
          <div class="metric-value">{{ formatNumber(metrics.communications.voice.total) }}</div>
          <div class="metric-subtitle">
            {{ metrics.communications.voice.successful }} successful
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
      <h2 class="section-title">Uptime & SLA</h2>
      <div class="uptime-grid">
        <div class="uptime-card">
          <div class="uptime-label">System Uptime</div>
          <div class="uptime-value">{{ uptime.uptime.days }}d {{ uptime.uptime.hours }}h {{ uptime.uptime.minutes }}m</div>
        </div>
        <div class="uptime-card">
          <div class="uptime-label">7-Day Availability</div>
          <div class="uptime-value" :class="getSLAClass(uptime.availability.last7Days)">
            {{ uptime.availability.last7Days.toFixed(2) }}%
          </div>
        </div>
        <div class="uptime-card">
          <div class="uptime-label">30-Day Availability</div>
          <div class="uptime-value" :class="getSLAClass(uptime.availability.last30Days)">
            {{ uptime.availability.last30Days.toFixed(2) }}%
          </div>
          <div class="uptime-subtitle">Target: {{ uptime.sla.target }}%</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const health = ref(null)
const metrics = ref(null)
const uptime = ref(null)
const errors = ref(null)
const loading = ref(false)
const error = ref(null)
const errorTimeRange = ref(24)

let refreshInterval = null

async function fetchAllData() {
  loading.value = true
  error.value = null

  try {
    const token = localStorage.getItem('admin_token')
    if (!token) {
      error.value = 'Not authenticated. Please log in.'
      return
    }
    const headers = { Authorization: `Bearer ${token}` }

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
    error.value = err.response?.status === 401 ? 'Session expired. Please log in again.' : 'Failed to load system health data'
  } finally {
    loading.value = false
  }
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

function getSLAClass(availability) {
  if (availability >= 99.9) return 'sla-excellent'
  if (availability >= 99.0) return 'sla-good'
  return 'sla-poor'
}

function getServiceStatusClass(status) {
  if (status === 'active') return 'status-active'
  if (status === 'unknown') return 'status-unknown'
  return 'status-inactive'
}

onMounted(() => {
  fetchAllData()
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
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.page-header h1 {
  font-size: 28px;
  color: #2c3e50;
  margin: 0;
}

.refresh-btn {
  padding: 10px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}

.refresh-btn:hover:not(:disabled) {
  background: #2980b9;
}

.refresh-btn:disabled {
  background: #95a5a6;
  cursor: not-allowed;
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 20px;
  border-left: 4px solid #c33;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
  font-size: 18px;
}

/* Infrastructure Overview */
.infrastructure-overview {
  margin-bottom: 30px;
}

.overall-status {
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
}

.overall-status.healthy {
  background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
  color: white;
}

.overall-status.degraded {
  background: linear-gradient(135deg, #f39c12 0%, #f1c40f 100%);
  color: white;
}

.overall-status.unhealthy {
  background: linear-gradient(135deg, #c0392b 0%, #e74c3c 100%);
  color: white;
}

.overall-status h2 {
  margin: 0 0 10px 0;
  font-size: 24px;
}

.timestamp {
  margin: 0;
  opacity: 0.9;
  font-size: 14px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.overview-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}

.overview-label {
  font-size: 12px;
  color: #7f8c8d;
  text-transform: uppercase;
  margin-bottom: 8px;
  font-weight: 600;
}

.overview-value {
  font-size: 32px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 5px;
}

.overview-subtitle {
  font-size: 14px;
  color: #95a5a6;
}

/* Regions */
.regions-section {
  margin-bottom: 30px;
}

.region-container {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.region-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 15px;
  border-bottom: 2px solid #ecf0f1;
  margin-bottom: 20px;
}

.region-header h2 {
  margin: 0;
  font-size: 22px;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 10px;
}

.primary-badge {
  background: #3498db;
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.region-status-badge {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
}

.region-status-badge.healthy {
  background: #27ae60;
  color: white;
}

.region-status-badge.degraded {
  background: #f39c12;
  color: white;
}

.region-status-badge.unhealthy {
  background: #e74c3c;
  color: white;
}

/* Availability Zones */
.availability-zones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.az-container {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 15px;
}

.az-title {
  font-size: 16px;
  color: #34495e;
  margin: 0 0 15px 0;
  font-weight: 600;
}

.server-group {
  margin-bottom: 15px;
}

.server-group h4 {
  font-size: 14px;
  color: #7f8c8d;
  margin: 0 0 10px 0;
  font-weight: 600;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.server-card {
  background: white;
  border-radius: 6px;
  padding: 12px;
  border-left: 4px solid #95a5a6;
}

.server-card.healthy {
  border-left-color: #27ae60;
}

.server-card.stopped {
  border-left-color: #e74c3c;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.server-type {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.server-status {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.server-status.healthy {
  background: #d5f4e6;
  color: #27ae60;
}

.server-status.stopped {
  background: #fadbd8;
  color: #e74c3c;
}

.server-status.unknown {
  background: #ecf0f1;
  color: #7f8c8d;
}

.server-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.server-detail {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.server-detail .label {
  color: #7f8c8d;
  font-weight: 600;
  min-width: 80px;
}

.server-detail .value {
  color: #2c3e50;
  font-family: monospace;
}

.status-active {
  color: #27ae60 !important;
  font-weight: 600;
}

.status-inactive {
  color: #e74c3c !important;
  font-weight: 600;
}

.status-unknown {
  color: #95a5a6 !important;
}

.empty-az {
  padding: 20px;
  text-align: center;
  color: #95a5a6;
  font-style: italic;
}

/* Load Balancers */
.load-balancers {
  margin-bottom: 20px;
}

.load-balancers h3 {
  font-size: 16px;
  color: #2c3e50;
  margin: 0 0 15px 0;
}

.lb-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 15px;
}

.lb-card {
  background: white;
  border-radius: 6px;
  padding: 15px;
  border: 2px solid #ecf0f1;
}

.lb-card.healthy {
  border-color: #27ae60;
}

.lb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.lb-service {
  font-weight: 600;
  color: #2c3e50;
  font-size: 16px;
}

.lb-status {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.lb-status.healthy {
  background: #d5f4e6;
  color: #27ae60;
}

.lb-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lb-detail {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.lb-detail .label {
  color: #7f8c8d;
  font-weight: 600;
  min-width: 60px;
}

.lb-detail .value {
  color: #2c3e50;
  font-size: 11px;
}

/* CloudWatch Alarms */
.cloudwatch-alarms h3 {
  font-size: 16px;
  color: #2c3e50;
  margin: 0 0 15px 0;
}

.alarms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.alarm-card {
  background: white;
  border-radius: 6px;
  padding: 12px;
  border-left: 4px solid #95a5a6;
}

.alarm-card.healthy {
  border-left-color: #27ae60;
}

.alarm-card.unhealthy {
  border-left-color: #e74c3c;
}

.alarm-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 13px;
  margin-bottom: 4px;
}

.alarm-service {
  font-size: 11px;
  color: #7f8c8d;
  margin-bottom: 6px;
}

.alarm-status {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 3px;
  display: inline-block;
}

.alarm-status.healthy {
  background: #d5f4e6;
  color: #27ae60;
}

.alarm-status.unhealthy {
  background: #fadbd8;
  color: #e74c3c;
}

.alarm-status.unknown {
  background: #ecf0f1;
  color: #7f8c8d;
}

/* Metrics */
.metrics-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.section-title {
  font-size: 20px;
  color: #2c3e50;
  margin: 0 0 20px 0;
  font-weight: 600;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.metric-card {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 6px;
  text-align: center;
}

.metric-label {
  font-size: 12px;
  color: #7f8c8d;
  text-transform: uppercase;
  margin-bottom: 8px;
  font-weight: 600;
}

.metric-value {
  font-size: 28px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 5px;
}

.metric-subtitle {
  font-size: 13px;
  color: #95a5a6;
}

/* Uptime */
.uptime-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.uptime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.uptime-card {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 6px;
  text-align: center;
}

.uptime-label {
  font-size: 12px;
  color: #7f8c8d;
  text-transform: uppercase;
  margin-bottom: 10px;
  font-weight: 600;
}

.uptime-value {
  font-size: 32px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 5px;
}

.uptime-value.sla-excellent {
  color: #27ae60;
}

.uptime-value.sla-good {
  color: #f39c12;
}

.uptime-value.sla-poor {
  color: #e74c3c;
}

.uptime-subtitle {
  font-size: 13px;
  color: #95a5a6;
}
</style>
