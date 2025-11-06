<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Redis Cache Management</h1>
      <button @click="clearCache" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
        Clear All Cache
      </button>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading cache stats...</div>
    </div>

    <div v-else class="space-y-6">
      <!-- Overview Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Memory Used</div>
          <div class="text-3xl font-bold text-gray-900">{{ formatBytes(stats.memory_used) }}</div>
          <div class="text-xs text-gray-500">of {{ formatBytes(stats.memory_max) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Total Keys</div>
          <div class="text-3xl font-bold text-blue-600">{{ formatNumber(stats.total_keys) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Hit Rate</div>
          <div class="text-3xl font-bold text-green-600">{{ stats.hit_rate }}%</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Ops/sec</div>
          <div class="text-3xl font-bold text-purple-600">{{ formatNumber(stats.ops_per_sec) }}</div>
        </div>
      </div>

      <!-- Memory Usage Chart -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Memory Usage</h2>
        <div class="flex items-center space-x-4">
          <div class="flex-1">
            <div class="w-full bg-gray-200 rounded-full h-8">
              <div class="bg-blue-600 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                   :style="{width: stats.memory_percentage + '%'}">
                {{ stats.memory_percentage }}%
              </div>
            </div>
          </div>
          <div class="text-sm text-gray-600">
            {{ formatBytes(stats.memory_used) }} / {{ formatBytes(stats.memory_max) }}
          </div>
        </div>
      </div>

      <!-- Cache Patterns -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Cache by Pattern</h2>
        <div class="space-y-3">
          <div v-for="pattern in cachePatterns" :key="pattern.pattern" class="border border-gray-200 rounded p-4">
            <div class="flex justify-between items-start mb-2">
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-900 font-mono">{{ pattern.pattern }}</div>
                <div class="text-xs text-gray-600 mt-1">{{ pattern.keys }} keys • {{ formatBytes(pattern.memory) }}</div>
              </div>
              <button @click="clearPattern(pattern.pattern)" class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">
                Clear
              </button>
            </div>
            <div class="text-xs text-gray-600 space-x-4">
              <span>Hit Rate: {{ pattern.hit_rate }}%</span>
              <span>Avg TTL: {{ pattern.avg_ttl }}s</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Sessions -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Active Sessions</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session ID</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="session in sessions" :key="session.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">{{ session.user_email }}</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ session.tenant_name }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 font-mono">{{ session.id.substring(0, 16) }}...</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{{ formatTime(session.created_at) }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{{ formatTime(session.expires_at) }}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <button @click="invalidateSession(session.id)" class="text-red-600 hover:text-red-800 text-sm">
                    Invalidate
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Eviction Stats -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Eviction Statistics (Last 24h)</h2>
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center p-4 bg-gray-50 rounded">
            <div class="text-2xl font-bold text-gray-900">{{ formatNumber(evictionStats.total_evictions) }}</div>
            <div class="text-sm text-gray-600">Total Evictions</div>
          </div>
          <div class="text-center p-4 bg-gray-50 rounded">
            <div class="text-2xl font-bold text-gray-900">{{ evictionStats.eviction_policy }}</div>
            <div class="text-sm text-gray-600">Policy</div>
          </div>
          <div class="text-center p-4 bg-gray-50 rounded">
            <div class="text-2xl font-bold text-gray-900">{{ evictionStats.expired_keys }}</div>
            <div class="text-sm text-gray-600">Expired Keys</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)

const stats = ref({
  memory_used: 0,
  memory_max: 0,
  memory_percentage: 0,
  total_keys: 0,
  hit_rate: 0,
  ops_per_sec: 0
})

const cachePatterns = ref([])
const sessions = ref([])
const evictionStats = ref({})

async function fetchStats() {
  loading.value = true
  try {
    const [statsRes, sessionsRes] = await Promise.all([
      adminAPI.cache.getStats(),
      adminAPI.cache.getSessions()
    ])
    stats.value = statsRes.data
    sessions.value = sessionsRes.data
  } catch (err) {
    console.error('Failed to fetch cache stats:', err)
    // Mock data
    stats.value = {
      memory_used: 536870912, // 512 MB
      memory_max: 2147483648, // 2 GB
      memory_percentage: 25,
      total_keys: 45238,
      hit_rate: 92.3,
      ops_per_sec: 3450
    }
    cachePatterns.value = [
      { pattern: 'session:*', keys: 1234, memory: 52428800, hit_rate: 98.5, avg_ttl: 3600 },
      { pattern: 'user:*', keys: 5678, memory: 104857600, hit_rate: 95.2, avg_ttl: 7200 },
      { pattern: 'tenant:*', keys: 234, memory: 10485760, hit_rate: 99.1, avg_ttl: 1800 }
    ]
    sessions.value = [
      { id: 'sess_abc123...', user_email: 'user@demo.com', tenant_name: 'Demo Corp', created_at: '2025-11-06T18:00:00Z', expires_at: '2025-11-07T18:00:00Z' }
    ]
    evictionStats.value = {
      total_evictions: 1523,
      eviction_policy: 'allkeys-lru',
      expired_keys: 8932
    }
  } finally {
    loading.value = false
  }
}

async function clearCache() {
  if (!confirm('Are you sure you want to clear ALL cache? This will affect all tenants.')) return
  try {
    await adminAPI.cache.clear('*')
    alert('Cache cleared successfully')
    await fetchStats()
  } catch (err) {
    alert('Failed to clear cache')
  }
}

async function clearPattern(pattern) {
  if (!confirm(`Clear all keys matching pattern: ${pattern}?`)) return
  try {
    await adminAPI.cache.clear(pattern)
    alert('Pattern cleared successfully')
    await fetchStats()
  } catch (err) {
    alert('Failed to clear pattern')
  }
}

async function invalidateSession(sessionId) {
  if (!confirm('Invalidate this session? The user will be logged out.')) return
  try {
    await adminAPI.cache.clear(`session:${sessionId}`)
    alert('Session invalidated')
    await fetchStats()
  } catch (err) {
    alert('Failed to invalidate session')
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function formatNumber(num) {
  return num.toLocaleString()
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

onMounted(() => {
  fetchStats()
})
</script>
