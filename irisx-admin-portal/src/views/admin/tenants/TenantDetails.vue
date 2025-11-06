<template>
  <div>
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

    <!-- Tenant Details -->
    <div v-else-if="tenant">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ tenant.company_name }}</h1>
          <p class="text-gray-500">{{ tenant.domain }}</p>
        </div>
        <div class="flex space-x-2">
          <RouterLink
            :to="`/dashboard/tenants/${tenant.id}/users`"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Manage Users
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            :to="`/dashboard/tenants/${tenant.id}/api-keys`"
            class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            API Keys
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            :to="`/dashboard/tenants/${tenant.id}/billing`"
            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Billing
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            :to="`/dashboard/tenants/${tenant.id}/features`"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Features
          </RouterLink>
          <button
            v-if="tenant.status === 'active' && authStore.isAdmin"
            @click="suspendTenant"
            class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            Suspend
          </button>
          <button
            v-if="tenant.status === 'suspended' && authStore.isAdmin"
            @click="reactivateTenant"
            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Reactivate
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-600">Plan</p>
          <p class="text-2xl font-bold text-gray-900 mt-2">{{ tenant.plan }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-600">MRR</p>
          <p class="text-2xl font-bold text-gray-900 mt-2">${{ tenant.mrr || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-600">Users</p>
          <p class="text-2xl font-bold text-gray-900 mt-2">{{ tenant.user_count || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-600">Status</p>
          <p class="text-2xl font-bold mt-2">
            <span :class="getStatusClass(tenant.status)">{{ tenant.status }}</span>
          </p>
        </div>
      </div>

      <!-- Information Sections -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Account Information -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Account Information</h2>
          <dl class="space-y-3">
            <div>
              <dt class="text-sm font-medium text-gray-500">Company Name</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ tenant.company_name }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Domain</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ tenant.domain }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Created</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ formatDate(tenant.created_at) }}</dd>
            </div>
            <div v-if="tenant.trial_ends_at">
              <dt class="text-sm font-medium text-gray-500">Trial Ends</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ formatDate(tenant.trial_ends_at) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Subscription Details -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Subscription</h2>
          <dl class="space-y-3">
            <div>
              <dt class="text-sm font-medium text-gray-500">Plan</dt>
              <dd class="text-sm text-gray-900 mt-1 capitalize">{{ tenant.plan }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Monthly Recurring Revenue</dt>
              <dd class="text-sm text-gray-900 mt-1">${{ tenant.mrr || 0 }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Billing Status</dt>
              <dd class="text-sm text-gray-900 mt-1 capitalize">{{ tenant.billing_status || 'active' }}</dd>
            </div>
            <div v-if="authStore.isAdmin">
              <button
                @click="showChangePlanModal = true"
                class="text-sm text-blue-600 hover:text-blue-800"
              >
                Change Plan
              </button>
            </div>
          </dl>
        </div>

        <!-- Usage Statistics -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Usage (Last 30 Days)</h2>
          <dl class="space-y-3">
            <div>
              <dt class="text-sm font-medium text-gray-500">Calls</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ tenant.stats?.calls || 0 }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Messages</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ tenant.stats?.messages || 0 }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Emails</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ tenant.stats?.emails || 0 }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">Storage Used</dt>
              <dd class="text-sm text-gray-900 mt-1">{{ formatBytes(tenant.stats?.storage_bytes) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Recent Activity -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Recent Activity</h2>
          <div class="space-y-3">
            <div v-for="(activity, index) in recentActivity" :key="index" class="text-sm">
              <p class="text-gray-900">{{ activity.description }}</p>
              <p class="text-gray-500 text-xs mt-1">{{ formatDate(activity.created_at) }}</p>
            </div>
            <p v-if="recentActivity.length === 0" class="text-gray-500 text-sm">
              No recent activity
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Change Plan Modal -->
    <div
      v-if="showChangePlanModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showChangePlanModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Change Subscription Plan</h3>
        <select
          v-model="newPlan"
          class="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
        >
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <div class="flex justify-end space-x-2">
          <button
            @click="showChangePlanModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="changePlan"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Update Plan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const route = useRoute()
const router = useRouter()
const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const tenant = ref(null)
const recentActivity = ref([])
const showChangePlanModal = ref(false)
const newPlan = ref('')

onMounted(() => {
  fetchTenantDetails()
})

async function fetchTenantDetails() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.tenants.get(route.params.id)
    tenant.value = response.data
    newPlan.value = tenant.value.plan
  } catch (err) {
    console.error('Failed to fetch tenant:', err)
    error.value = 'Failed to load tenant details'
  } finally {
    loading.value = false
  }
}

async function suspendTenant() {
  if (!confirm(`Suspend tenant "${tenant.value.company_name}"?`)) return

  try {
    await adminAPI.tenants.suspend(tenant.value.id)
    await fetchTenantDetails()
  } catch (err) {
    console.error('Failed to suspend tenant:', err)
    alert('Failed to suspend tenant')
  }
}

async function reactivateTenant() {
  if (!confirm(`Reactivate tenant "${tenant.value.company_name}"?`)) return

  try {
    await adminAPI.tenants.reactivate(tenant.value.id)
    await fetchTenantDetails()
  } catch (err) {
    console.error('Failed to reactivate tenant:', err)
    alert('Failed to reactivate tenant')
  }
}

async function changePlan() {
  try {
    await adminAPI.billing.updateSubscription(tenant.value.id, { plan: newPlan.value })
    showChangePlanModal.value = false
    await fetchTenantDetails()
  } catch (err) {
    console.error('Failed to change plan:', err)
    alert('Failed to change plan')
  }
}

function getStatusClass(status) {
  const classes = {
    trial: 'text-blue-600',
    active: 'text-green-600',
    suspended: 'text-red-600',
    cancelled: 'text-gray-600'
  }
  return classes[status] || 'text-gray-600'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>
