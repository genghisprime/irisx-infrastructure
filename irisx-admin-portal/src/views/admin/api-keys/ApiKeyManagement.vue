<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">API Keys Management</h1>
        <p class="text-gray-500 mt-1">Cross-tenant API key visibility and security controls</p>
      </div>
      <div class="flex items-center space-x-2">
        <button
          v-if="selectedKeys.length > 0"
          @click="bulkRevoke"
          class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Revoke Selected ({{ selectedKeys.length }})
        </button>
        <button
          @click="refreshData"
          class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-500">Total API Keys</div>
        <div class="text-2xl font-bold text-gray-900">{{ stats.total_keys || 0 }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-500">Active Keys</div>
        <div class="text-2xl font-bold text-green-600">{{ stats.active_keys || 0 }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-500">Used (24h)</div>
        <div class="text-2xl font-bold text-blue-600">{{ stats.keys_used_24h || 0 }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-500">Revoked (24h)</div>
        <div class="text-2xl font-bold text-red-600">{{ stats.keys_revoked_24h || 0 }}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
          <input
            v-model="filters.search"
            type="text"
            placeholder="Key name, tenant..."
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            @input="debouncedSearch"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            v-model="filters.status"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            @change="fetchKeys"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
          <select
            v-model="filters.tenant_id"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            @change="fetchKeys"
          >
            <option value="">All Tenants</option>
            <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
              {{ tenant.name }}
            </option>
          </select>
        </div>
        <div class="flex items-end">
          <button
            @click="clearFilters"
            class="w-full px-3 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Clear Filters
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

    <!-- Keys by Tenant Summary -->
    <div v-if="keysByTenant.length > 0" class="bg-white rounded-lg shadow mb-6 overflow-hidden">
      <div class="px-4 py-3 bg-gray-50 border-b">
        <h3 class="text-sm font-semibold text-gray-700">Top Tenants by API Key Count</h3>
      </div>
      <div class="divide-y divide-gray-200">
        <div
          v-for="tenant in keysByTenant"
          :key="tenant.tenant_id"
          class="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
          @click="filters.tenant_id = tenant.tenant_id; fetchKeys()"
        >
          <div>
            <span class="font-medium text-gray-900">{{ tenant.tenant_name }}</span>
            <span class="ml-2 text-sm text-gray-500">
              {{ tenant.active_keys }} active / {{ tenant.total_keys }} total
            </span>
          </div>
          <div class="text-sm text-gray-500">
            Last used: {{ tenant.last_used_at ? formatDate(tenant.last_used_at) : 'Never' }}
          </div>
        </div>
      </div>
    </div>

    <!-- API Keys Table -->
    <div v-if="!loading && !error" class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left">
              <input
                type="checkbox"
                :checked="allSelected"
                @change="toggleSelectAll"
                class="rounded"
              />
            </th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key Name</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key (Masked)</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="key in keys" :key="key.id" :class="{ 'bg-red-50': key.status === 'revoked' }">
            <td class="px-4 py-4">
              <input
                type="checkbox"
                :checked="selectedKeys.includes(key.id)"
                @change="toggleSelect(key.id)"
                :disabled="key.status === 'revoked'"
                class="rounded"
              />
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
              <span class="text-sm font-medium text-blue-600 hover:underline cursor-pointer">
                {{ key.tenant_name }}
              </span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">{{ key.name }}</div>
            </td>
            <td class="px-4 py-4">
              <code class="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                {{ key.key_masked }}
              </code>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
              <span :class="getStatusClass(key.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ key.status }}
              </span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(key.created_at) }}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ key.last_used_at ? formatDate(key.last_used_at) : 'Never' }}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm">
              <button
                v-if="key.status === 'active'"
                @click="revokeKey(key)"
                class="text-red-600 hover:text-red-800 font-medium"
              >
                Revoke
              </button>
              <button
                @click="showKeyDetails(key)"
                class="ml-2 text-blue-600 hover:text-blue-800"
              >
                Details
              </button>
            </td>
          </tr>
          <tr v-if="keys.length === 0">
            <td colspan="8" class="px-6 py-12 text-center text-gray-500">
              No API keys found matching your criteria.
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="pagination.pages > 1" class="px-4 py-3 border-t flex items-center justify-between">
        <div class="text-sm text-gray-500">
          Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
          {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
          {{ pagination.total }} keys
        </div>
        <div class="flex space-x-2">
          <button
            @click="changePage(pagination.page - 1)"
            :disabled="pagination.page === 1"
            class="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            @click="changePage(pagination.page + 1)"
            :disabled="pagination.page === pagination.pages"
            class="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Stale Keys Warning -->
    <div v-if="staleKeys.length > 0" class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-yellow-800 mb-2">
        Stale Keys Warning ({{ staleKeys.length }} keys not used in 30+ days)
      </h3>
      <div class="text-sm text-yellow-700">
        <ul class="list-disc list-inside">
          <li v-for="stale in staleKeys.slice(0, 5)" :key="stale.id">
            {{ stale.name }} ({{ stale.tenant_name }}) - Created {{ formatDate(stale.created_at) }}
          </li>
        </ul>
        <p v-if="staleKeys.length > 5" class="mt-2">
          ... and {{ staleKeys.length - 5 }} more
        </p>
      </div>
    </div>

    <!-- Key Details Modal -->
    <div
      v-if="showDetailsModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showDetailsModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">API Key Details</h3>

        <div v-if="selectedKey" class="space-y-4">
          <div>
            <label class="text-sm text-gray-500">Key Name</label>
            <p class="font-medium">{{ selectedKey.name }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-500">Tenant</label>
            <p class="font-medium">{{ selectedKey.tenant_name }}</p>
          </div>
          <div>
            <label class="text-sm text-gray-500">Key (Masked)</label>
            <code class="block bg-gray-100 px-2 py-1 rounded font-mono">{{ selectedKey.key_masked }}</code>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-500">Status</label>
              <p>
                <span :class="getStatusClass(selectedKey.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                  {{ selectedKey.status }}
                </span>
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-500">Created</label>
              <p class="font-medium">{{ formatDate(selectedKey.created_at) }}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm text-gray-500">Last Used</label>
              <p class="font-medium">{{ selectedKey.last_used_at ? formatDate(selectedKey.last_used_at) : 'Never' }}</p>
            </div>
            <div v-if="selectedKey.revoked_at">
              <label class="text-sm text-gray-500">Revoked At</label>
              <p class="font-medium text-red-600">{{ formatDate(selectedKey.revoked_at) }}</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end mt-6 space-x-2">
          <button
            v-if="selectedKey?.status === 'active'"
            @click="revokeKey(selectedKey); showDetailsModal = false"
            class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Revoke Key
          </button>
          <button
            @click="showDetailsModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Revoke Confirmation Modal -->
    <div
      v-if="showRevokeModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showRevokeModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4 text-red-600">Confirm Revocation</h3>

        <p class="text-gray-700 mb-4">
          Are you sure you want to revoke this API key? This action cannot be undone.
        </p>

        <div class="bg-gray-50 rounded p-3 mb-4">
          <p class="text-sm"><strong>Key:</strong> {{ keyToRevoke?.name }}</p>
          <p class="text-sm"><strong>Tenant:</strong> {{ keyToRevoke?.tenant_name }}</p>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
          <textarea
            v-model="revokeReason"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            rows="2"
            placeholder="Security concern, key compromised, etc."
          ></textarea>
        </div>

        <div class="flex justify-end space-x-2">
          <button
            @click="showRevokeModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="confirmRevoke"
            class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Revoke Key
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import apiClient from '../../../utils/api'

const authStore = useAdminAuthStore()

// State
const loading = ref(true)
const error = ref(null)
const stats = ref({})
const keys = ref([])
const keysByTenant = ref([])
const staleKeys = ref([])
const tenants = ref([])
const selectedKeys = ref([])
const pagination = ref({ page: 1, limit: 50, total: 0, pages: 0 })

// Filters
const filters = ref({
  search: '',
  status: '',
  tenant_id: ''
})

// Modals
const showDetailsModal = ref(false)
const showRevokeModal = ref(false)
const selectedKey = ref(null)
const keyToRevoke = ref(null)
const revokeReason = ref('')

// Computed
const allSelected = computed(() => {
  const activeKeys = keys.value.filter(k => k.status === 'active')
  return activeKeys.length > 0 && activeKeys.every(k => selectedKeys.value.includes(k.id))
})

// Debounce for search
let searchTimeout = null
function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchKeys()
  }, 300)
}

// Lifecycle
onMounted(() => {
  refreshData()
  fetchTenants()
})

// Methods
async function refreshData() {
  await Promise.all([
    fetchStats(),
    fetchKeys(),
    fetchUsageSummary()
  ])
}

async function fetchStats() {
  try {
    const response = await apiClient.get('/admin/api-keys/stats')
    stats.value = response.data.stats || {}
    keysByTenant.value = response.data.keysByTenant || []
  } catch (err) {
    console.error('Failed to fetch stats:', err)
  }
}

async function fetchKeys() {
  loading.value = true
  error.value = null

  try {
    const params = new URLSearchParams()
    if (filters.value.search) params.append('search', filters.value.search)
    if (filters.value.status) params.append('status', filters.value.status)
    if (filters.value.tenant_id) params.append('tenant_id', filters.value.tenant_id)
    params.append('page', pagination.value.page)
    params.append('limit', pagination.value.limit)

    const response = await apiClient.get(`/admin/api-keys?${params.toString()}`)
    keys.value = response.data.keys || []
    pagination.value = response.data.pagination || { page: 1, limit: 50, total: 0, pages: 0 }
  } catch (err) {
    console.error('Failed to fetch keys:', err)
    error.value = 'Failed to load API keys'
  } finally {
    loading.value = false
  }
}

async function fetchUsageSummary() {
  try {
    const response = await apiClient.get('/admin/api-keys/usage/summary')
    staleKeys.value = response.data.staleKeys || []
  } catch (err) {
    console.error('Failed to fetch usage summary:', err)
  }
}

async function fetchTenants() {
  try {
    const response = await apiClient.get('/admin/tenants?limit=100')
    tenants.value = response.data.tenants || []
  } catch (err) {
    console.error('Failed to fetch tenants:', err)
  }
}

function clearFilters() {
  filters.value = { search: '', status: '', tenant_id: '' }
  pagination.value.page = 1
  fetchKeys()
}

function changePage(page) {
  pagination.value.page = page
  fetchKeys()
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedKeys.value = []
  } else {
    selectedKeys.value = keys.value
      .filter(k => k.status === 'active')
      .map(k => k.id)
  }
}

function toggleSelect(id) {
  const index = selectedKeys.value.indexOf(id)
  if (index === -1) {
    selectedKeys.value.push(id)
  } else {
    selectedKeys.value.splice(index, 1)
  }
}

function showKeyDetails(key) {
  selectedKey.value = key
  showDetailsModal.value = true
}

function revokeKey(key) {
  keyToRevoke.value = key
  revokeReason.value = ''
  showRevokeModal.value = true
}

async function confirmRevoke() {
  try {
    await apiClient.delete(`/admin/api-keys/${keyToRevoke.value.id}`, {
      data: { reason: revokeReason.value }
    })
    showRevokeModal.value = false
    keyToRevoke.value = null
    await refreshData()
  } catch (err) {
    console.error('Failed to revoke key:', err)
    alert('Failed to revoke API key')
  }
}

async function bulkRevoke() {
  if (!confirm(`Revoke ${selectedKeys.value.length} API keys? This action cannot be undone.`)) {
    return
  }

  try {
    await apiClient.post('/admin/api-keys/bulk-revoke', {
      key_ids: selectedKeys.value,
      reason: 'Bulk admin revocation'
    })
    selectedKeys.value = []
    await refreshData()
  } catch (err) {
    console.error('Failed to bulk revoke:', err)
    alert('Failed to revoke API keys')
  }
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    revoked: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}
</script>
