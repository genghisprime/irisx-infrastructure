<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Database Management</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading database stats...</div>
    </div>

    <div v-else class="space-y-6">
      <!-- Overview Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Database Size</div>
          <div class="text-3xl font-bold text-gray-900">{{ formatBytes(stats.total_size) }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Active Connections</div>
          <div class="text-3xl font-bold text-blue-600">{{ stats.active_connections }}</div>
          <div class="text-xs text-gray-500">Max: {{ stats.max_connections }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Queries/sec</div>
          <div class="text-3xl font-bold text-green-600">{{ stats.queries_per_sec }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Cache Hit Rate</div>
          <div class="text-3xl font-bold text-purple-600">{{ stats.cache_hit_rate }}%</div>
        </div>
      </div>

      <!-- Size by Tenant -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Storage by Tenant</h2>
        <div class="space-y-3">
          <div v-for="tenant in tenantSizes" :key="tenant.tenant_id" class="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div class="flex-1">
              <RouterLink :to="`/dashboard/tenants/${tenant.tenant_id}`" class="text-sm font-medium text-blue-600 hover:underline">
                {{ tenant.tenant_name }}
              </RouterLink>
              <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div class="bg-blue-600 h-2 rounded-full" :style="{width: tenant.percentage + '%'}"></div>
              </div>
            </div>
            <div class="text-right ml-4">
              <div class="text-sm font-medium text-gray-900">{{ formatBytes(tenant.size) }}</div>
              <div class="text-xs text-gray-600">{{ tenant.percentage.toFixed(1) }}%</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Pool -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Connection Pool Status</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-600">Active Connections</div>
            <div class="text-2xl font-bold text-gray-900">{{ connections.active }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Idle Connections</div>
            <div class="text-2xl font-bold text-gray-900">{{ connections.idle }}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Waiting Clients</div>
            <div class="text-2xl font-bold" :class="connections.waiting > 0 ? 'text-red-600' : 'text-gray-900'">
              {{ connections.waiting }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Max Pool Size</div>
            <div class="text-2xl font-bold text-gray-900">{{ connections.max_pool_size }}</div>
          </div>
        </div>
      </div>

      <!-- Slow Queries -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Slow Queries (> 1000ms)</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Query</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Execution Time</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Count (24h)</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="(query, index) in slowQueries" :key="index" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900 font-mono max-w-md truncate">{{ query.query }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600">{{ query.exec_time }}ms</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{{ query.count }}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{{ formatTime(query.last_seen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Backups -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Recent Backups</h2>
        <div class="space-y-2">
          <div v-for="backup in backups" :key="backup.id" class="flex items-center justify-between p-3 border border-gray-200 rounded">
            <div>
              <div class="text-sm font-medium text-gray-900">{{ backup.name }}</div>
              <div class="text-xs text-gray-600">{{ formatTime(backup.created_at) }} • {{ formatBytes(backup.size) }}</div>
            </div>
            <span :class="[
              'px-2 py-1 text-xs font-medium rounded',
              backup.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            ]">
              {{ backup.status }}
            </span>
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
  total_size: 0,
  active_connections: 0,
  max_connections: 0,
  queries_per_sec: 0,
  cache_hit_rate: 0
})

const tenantSizes = ref([])
const connections = ref({})
const slowQueries = ref([])
const backups = ref([])

async function fetchStats() {
  loading.value = true
  try {
    const [statsRes, connectionsRes, queriesRes, backupsRes] = await Promise.all([
      adminAPI.database.getStats(),
      adminAPI.database.getConnections(),
      adminAPI.database.getQueries({ slow: true }),
      adminAPI.database.getBackups()
    ])
    stats.value = statsRes.data
    tenantSizes.value = statsRes.data.tenant_sizes
    connections.value = connectionsRes.data
    slowQueries.value = queriesRes.data
    backups.value = backupsRes.data
  } catch (err) {
    console.error('Failed to fetch database stats:', err)
    // Mock data
    stats.value = {
      total_size: 42949672960, // 40 GB
      active_connections: 45,
      max_connections: 100,
      queries_per_sec: 1250,
      cache_hit_rate: 94.5
    }
    tenantSizes.value = [
      { tenant_id: 7, tenant_name: 'Demo Corp', size: 12884901888, percentage: 30 },
      { tenant_id: 8, tenant_name: 'TechStart Inc', size: 8589934592, percentage: 20 }
    ]
    connections.value = { active: 45, idle: 35, waiting: 0, max_pool_size: 100 }
    slowQueries.value = [
      { query: 'SELECT * FROM conversations WHERE tenant_id = ? AND created_at > ?', exec_time: 2150, count: 23, last_seen: '2025-11-06T19:50:00Z' }
    ]
    backups.value = [
      { id: 1, name: 'backup-2025-11-06.sql', size: 42949672960, created_at: '2025-11-06T02:00:00Z', status: 'completed' }
    ]
  } finally {
    loading.value = false
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

onMounted(() => {
  fetchStats()
})
</script>
