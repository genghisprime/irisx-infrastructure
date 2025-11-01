<template>
  <div class="agent-performance">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Agent Performance</h1>
        <p class="mt-1 text-sm text-gray-500">
          Monitor agent productivity, call metrics, and performance trends
        </p>
      </div>
      <div class="flex gap-3">
        <select v-model="timeRange" @change="loadData" class="select-field">
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="all">All Time</option>
        </select>
        <button @click="loadData" class="btn-secondary" :disabled="loading">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-blue-100 text-blue-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <div>
          <p class="stat-label">Total Calls</p>
          <p class="stat-value">{{ overview.totalCalls?.toLocaleString() || 0 }}</p>
          <p class="stat-sublabel">{{ overview.answeredCalls || 0 }} answered</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-green-100 text-green-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p class="stat-label">Avg Call Duration</p>
          <p class="stat-value">{{ formatDuration(overview.avgDurationSeconds) }}</p>
          <p class="stat-sublabel">{{ formatDuration(overview.totalTalkTimeSeconds, true) }} total talk time</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-purple-100 text-purple-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <p class="stat-label">Active Agents</p>
          <p class="stat-value">{{ overview.activeAgents || 0 }}</p>
          <p class="stat-sublabel">{{ agents.length || 0 }} total agents</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-red-100 text-red-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <p class="stat-label">Missed Calls</p>
          <p class="stat-value">{{ overview.missedCalls || 0 }}</p>
          <p class="stat-sublabel">{{ missedCallsPercentage }}% of inbound</p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading agent performance data...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <p class="text-red-600">{{ error }}</p>
      <button @click="loadData" class="btn-primary mt-4">Retry</button>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Leaderboard -->
      <div class="section-card mb-6">
        <div class="section-header">
          <h2 class="section-title">Top Performers</h2>
          <select v-model="leaderboardMetric" @change="loadLeaderboard" class="select-field-sm">
            <option value="calls">Most Calls</option>
            <option value="duration">Most Talk Time</option>
            <option value="answered">Most Answered</option>
          </select>
        </div>

        <div v-if="leaderboard.length === 0" class="empty-state">
          <p>No leaderboard data available</p>
        </div>

        <div v-else class="leaderboard-list">
          <div v-for="entry in leaderboard" :key="entry.agentId" class="leaderboard-item">
            <div class="leaderboard-rank">
              <span :class="['rank-badge', getRankClass(entry.rank)]">{{ entry.rank }}</span>
            </div>
            <div class="leaderboard-content">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="leaderboard-name">{{ entry.agentName }}</h3>
                  <p class="leaderboard-email">{{ entry.email }}</p>
                </div>
                <div class="leaderboard-metrics">
                  <div class="metric">
                    <span class="metric-label">Calls</span>
                    <span class="metric-value">{{ entry.totalCalls }}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Talk Time</span>
                    <span class="metric-value">{{ formatDuration(entry.totalTalkTimeSeconds, true) }}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Avg Duration</span>
                    <span class="metric-value">{{ formatDuration(entry.avgDurationSeconds) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent List -->
      <div class="section-card">
        <div class="section-header">
          <h2 class="section-title">All Agents</h2>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search agents..."
            class="input-field-sm"
            style="max-width: 300px"
          />
        </div>

        <div v-if="filteredAgents.length === 0" class="empty-state">
          <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p>No agents found</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="agent-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Extensions</th>
                <th>Status</th>
                <th>Total Calls</th>
                <th>Inbound</th>
                <th>Outbound</th>
                <th>Talk Time</th>
                <th>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agent in filteredAgents" :key="agent.id" class="agent-row">
                <td>
                  <div>
                    <div class="agent-name">{{ agent.name }}</div>
                    <div class="agent-email">{{ agent.email }}</div>
                  </div>
                </td>
                <td>
                  <div class="extensions-list">
                    <span v-for="ext in agent.extensions" :key="ext" class="extension-badge">
                      {{ ext }}
                    </span>
                    <span v-if="agent.extensions.length === 0" class="text-gray-400 text-sm">None</span>
                  </div>
                </td>
                <td>
                  <span :class="['status-badge', `status-${agent.status}`]">
                    {{ agent.status }}
                  </span>
                </td>
                <td class="metric-cell">{{ agent.metrics.totalCalls }}</td>
                <td class="metric-cell">{{ agent.metrics.inboundAnswered }}</td>
                <td class="metric-cell">{{ agent.metrics.outboundCalls }}</td>
                <td class="metric-cell">{{ formatDuration(agent.metrics.totalTalkTimeSeconds, true) }}</td>
                <td class="metric-cell">{{ formatDuration(agent.metrics.avgCallDurationSeconds) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'AgentPerformance',
  setup() {
    const router = useRouter()
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://3.83.53.69:3000'

    // State
    const loading = ref(false)
    const error = ref(null)
    const timeRange = ref('24h')
    const leaderboardMetric = ref('calls')
    const searchQuery = ref('')

    const overview = reactive({
      totalCalls: 0,
      answeredCalls: 0,
      missedCalls: 0,
      totalTalkTimeSeconds: 0,
      avgDurationSeconds: 0,
      activeAgents: 0
    })

    const agents = ref([])
    const leaderboard = ref([])

    // Computed
    const missedCallsPercentage = computed(() => {
      const total = overview.totalCalls || 0
      const missed = overview.missedCalls || 0
      if (total === 0) return 0
      return Math.round((missed / total) * 100)
    })

    const filteredAgents = computed(() => {
      if (!searchQuery.value) return agents.value
      const query = searchQuery.value.toLowerCase()
      return agents.value.filter(agent =>
        agent.name.toLowerCase().includes(query) ||
        agent.email.toLowerCase().includes(query)
      )
    })

    // Get JWT token
    const getToken = () => {
      return localStorage.getItem('auth_token')
    }

    // API Helper
    const apiRequest = async (endpoint) => {
      const token = getToken()
      if (!token) {
        router.push('/login')
        throw new Error('Not authenticated')
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.status === 401) {
        localStorage.removeItem('auth_token')
        router.push('/login')
        throw new Error('Session expired')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || 'Request failed')
      }

      return response.json()
    }

    // Load overview data
    const loadOverview = async () => {
      try {
        const data = await apiRequest(`/v1/analytics/agents/overview?timeRange=${timeRange.value}`)
        Object.assign(overview, data.overview)
      } catch (err) {
        console.error('Failed to load overview:', err)
      }
    }

    // Load agent list
    const loadAgents = async () => {
      try {
        const data = await apiRequest(`/v1/analytics/agents/list?timeRange=${timeRange.value}`)
        agents.value = data.agents || []
      } catch (err) {
        console.error('Failed to load agents:', err)
      }
    }

    // Load leaderboard
    const loadLeaderboard = async () => {
      try {
        const data = await apiRequest(`/v1/analytics/agents/leaderboard?timeRange=${timeRange.value}&metric=${leaderboardMetric.value}&limit=5`)
        leaderboard.value = data.leaderboard || []
      } catch (err) {
        console.error('Failed to load leaderboard:', err)
      }
    }

    // Load all data
    const loadData = async () => {
      loading.value = true
      error.value = null

      try {
        await Promise.all([
          loadOverview(),
          loadAgents(),
          loadLeaderboard()
        ])
      } catch (err) {
        error.value = err.message
        console.error('Failed to load data:', err)
      } finally {
        loading.value = false
      }
    }

    // Format duration
    const formatDuration = (seconds, short = false) => {
      if (!seconds || seconds === 0) return short ? '0s' : '0:00'

      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const secs = seconds % 60

      if (short) {
        if (hours > 0) return `${hours}h ${minutes}m`
        if (minutes > 0) return `${minutes}m`
        return `${secs}s`
      }

      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      }
      return `${minutes}:${String(secs).padStart(2, '0')}`
    }

    // Get rank class for styling
    const getRankClass = (rank) => {
      if (rank === 1) return 'rank-gold'
      if (rank === 2) return 'rank-silver'
      if (rank === 3) return 'rank-bronze'
      return 'rank-normal'
    }

    // Load on mount
    onMounted(() => {
      loadData()
    })

    return {
      loading,
      error,
      timeRange,
      leaderboardMetric,
      searchQuery,
      overview,
      agents,
      leaderboard,
      filteredAgents,
      missedCallsPercentage,
      loadData,
      loadLeaderboard,
      formatDuration,
      getRankClass
    }
  }
}
</script>

<style scoped>
/* Page Layout */
.agent-performance {
  min-height: 100vh;
  background-color: #f9fafb;
  padding: 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
}

.stat-sublabel {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

/* Section Card */
.section-card {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

/* Leaderboard */
.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.leaderboard-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  transition: all 0.15s;
}

.leaderboard-item:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
}

.leaderboard-rank {
  flex-shrink: 0;
}

.rank-badge {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.125rem;
}

.rank-gold { background: #fbbf24; color: white; }
.rank-silver { background: #9ca3af; color: white; }
.rank-bronze { background: #d97706; color: white; }
.rank-normal { background: #e5e7eb; color: #6b7280; }

.leaderboard-content {
  flex: 1;
}

.leaderboard-name {
  font-weight: 600;
  color: #111827;
}

.leaderboard-email {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.leaderboard-metrics {
  display: flex;
  gap: 2rem;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.metric-label {
  font-size: 0.75rem;
  color: #6b7280;
}

.metric-value {
  font-weight: 600;
  color: #111827;
  font-size: 0.875rem;
}

/* Agent Table */
.agent-table {
  width: 100%;
  border-collapse: collapse;
}

.agent-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-bottom: 2px solid #e5e7eb;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.agent-row {
  border-bottom: 1px solid #e5e7eb;
  transition: background-color 0.15s;
}

.agent-row:hover {
  background-color: #f9fafb;
}

.agent-table td {
  padding: 1rem;
  font-size: 0.875rem;
}

.agent-name {
  font-weight: 600;
  color: #111827;
}

.agent-email {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.extensions-list {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.extension-badge {
  background: #dbeafe;
  color: #1e40af;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-active { background: #dcfce7; color: #166534; }
.status-suspended { background: #fecaca; color: #991b1b; }

.metric-cell {
  font-weight: 600;
  color: #374151;
  text-align: right;
}

/* States */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: #6b7280;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Form Elements */
.select-field,
.select-field-sm {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
}

.select-field-sm {
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
}

.input-field-sm {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #f9fafb;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
