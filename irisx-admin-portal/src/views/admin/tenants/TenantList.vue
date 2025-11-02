<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">All Tenants</h1>
      <RouterLink
        v-if="authStore.isAdmin"
        to="/dashboard/tenants/create"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        + Create Tenant
      </RouterLink>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search by name or email..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <select
          v-model="filters.plan"
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          v-model="filters.status"
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          @click="applyFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply Filters
        </button>
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

    <!-- Tenants Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Company
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Plan
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              MRR
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Users
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Created
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="tenant in tenants" :key="tenant.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <div>
                <p class="text-sm font-medium text-gray-900">{{ tenant.company_name }}</p>
                <p class="text-sm text-gray-500">{{ tenant.domain }}</p>
              </div>
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getPlanClass(tenant.plan)"
              >
                {{ tenant.plan }}
              </span>
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(tenant.status)"
              >
                {{ tenant.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              ${{ tenant.mrr || 0 }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ tenant.user_count || 0 }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(tenant.created_at) }}
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <RouterLink
                :to="`/dashboard/tenants/${tenant.id}`"
                class="text-blue-600 hover:text-blue-800"
              >
                View
              </RouterLink>
              <button
                v-if="tenant.status === 'active' && authStore.isAdmin"
                @click="suspendTenant(tenant)"
                class="text-yellow-600 hover:text-yellow-800"
              >
                Suspend
              </button>
              <button
                v-if="tenant.status === 'suspended' && authStore.isAdmin"
                @click="reactivateTenant(tenant)"
                class="text-green-600 hover:text-green-800"
              >
                Reactivate
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="tenants.length === 0" class="text-center py-12">
        <p class="text-gray-500">No tenants found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex items-center justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 20 + 1 }} to {{ Math.min(currentPage * 20, total) }} of {{ total }} tenants
        </div>
        <div class="flex space-x-2">
          <button
            @click="changePage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            @click="changePage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const tenants = ref([])
const total = ref(0)
const currentPage = ref(1)

const filters = ref({
  search: '',
  plan: '',
  status: ''
})

const totalPages = computed(() => Math.ceil(total.value / 20))

onMounted(() => {
  fetchTenants()
})

async function fetchTenants() {
  loading.value = true
  error.value = null

  try {
    const params = {
      page: currentPage.value,
      limit: 20,
      ...filters.value
    }

    const response = await adminAPI.tenants.list(params)
    tenants.value = response.data.tenants || []
    total.value = response.data.total || 0
  } catch (err) {
    console.error('Failed to fetch tenants:', err)
    error.value = 'Failed to load tenants'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchTenants()
}

function changePage(page) {
  currentPage.value = page
  fetchTenants()
}

async function suspendTenant(tenant) {
  if (!confirm(`Suspend tenant "${tenant.company_name}"?`)) return

  try {
    await adminAPI.tenants.suspend(tenant.id)
    await fetchTenants()
  } catch (err) {
    console.error('Failed to suspend tenant:', err)
    alert('Failed to suspend tenant')
  }
}

async function reactivateTenant(tenant) {
  if (!confirm(`Reactivate tenant "${tenant.company_name}"?`)) return

  try {
    await adminAPI.tenants.reactivate(tenant.id)
    await fetchTenants()
  } catch (err) {
    console.error('Failed to reactivate tenant:', err)
    alert('Failed to reactivate tenant')
  }
}

function getPlanClass(plan) {
  const classes = {
    free: 'bg-gray-100 text-gray-800',
    starter: 'bg-blue-100 text-blue-800',
    professional: 'bg-purple-100 text-purple-800',
    enterprise: 'bg-yellow-100 text-yellow-800'
  }
  return classes[plan] || 'bg-gray-100 text-gray-800'
}

function getStatusClass(status) {
  const classes = {
    trial: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString()
}
</script>
