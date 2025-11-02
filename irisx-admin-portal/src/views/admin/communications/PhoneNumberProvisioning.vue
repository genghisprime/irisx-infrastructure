<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Phone Number Provisioning</h1>
      <button
        v-if="authStore.isAdmin"
        @click="showProvisionModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        + Provision Number
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Total Numbers</p>
        <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Active</p>
        <p class="text-2xl font-bold text-green-600">{{ stats.active }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Unassigned</p>
        <p class="text-2xl font-bold text-yellow-600">{{ stats.unassigned }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Monthly Cost</p>
        <p class="text-2xl font-bold text-gray-900">${{ stats.monthly_cost }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search by number..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <select
          v-model="filters.tenant_id"
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Tenants</option>
          <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
            {{ tenant.company_name }}
          </option>
        </select>
        <select
          v-model="filters.provider"
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Providers</option>
          <option value="twilio">Twilio</option>
          <option value="telnyx">Telnyx</option>
          <option value="bandwidth">Bandwidth</option>
        </select>
        <select
          v-model="filters.status"
          class="w-full px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="unassigned">Unassigned</option>
          <option value="suspended">Suspended</option>
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

    <!-- Phone Numbers Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Phone Number
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tenant
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Provider
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Type
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Monthly Cost
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="number in phoneNumbers" :key="number.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">
              {{ formatPhoneNumber(number.phone_number) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ number.tenant_name || 'Unassigned' }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getProviderClass(number.provider)"
              >
                {{ number.provider }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-600">
              {{ number.number_type }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(number.status)"
              >
                {{ number.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              ${{ number.monthly_cost || '0.00' }}
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <button
                v-if="!number.tenant_id && authStore.isAdmin"
                @click="assignNumber(number)"
                class="text-blue-600 hover:text-blue-800"
              >
                Assign
              </button>
              <button
                v-if="number.tenant_id && authStore.isAdmin"
                @click="unassignNumber(number)"
                class="text-yellow-600 hover:text-yellow-800"
              >
                Unassign
              </button>
              <button
                v-if="authStore.isAdmin"
                @click="testNumber(number)"
                class="text-green-600 hover:text-green-800"
              >
                Test
              </button>
              <button
                v-if="authStore.isSuperAdmin"
                @click="releaseNumber(number)"
                class="text-red-600 hover:text-red-800"
              >
                Release
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="phoneNumbers.length === 0" class="text-center py-12">
        <p class="text-gray-500">No phone numbers found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex items-center justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 20 + 1 }} to {{ Math.min(currentPage * 20, total) }} of {{ total }} numbers
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

    <!-- Provision Number Modal -->
    <div
      v-if="showProvisionModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showProvisionModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Provision New Number</h3>
        <form @submit.prevent="handleProvisionNumber" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Provider</label>
            <select
              v-model="provisionForm.provider"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
              <option value="bandwidth">Bandwidth</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Area Code</label>
            <input
              v-model="provisionForm.area_code"
              type="text"
              required
              pattern="[0-9]{3}"
              maxlength="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="415"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Number Type</label>
            <select
              v-model="provisionForm.number_type"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="local">Local</option>
              <option value="toll-free">Toll-Free</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Assign to Tenant (Optional)</label>
            <select
              v-model="provisionForm.tenant_id"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Leave Unassigned</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                {{ tenant.company_name }}
              </option>
            </select>
          </div>
          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="showProvisionModal = false"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Provision Number
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Assign Number Modal -->
    <div
      v-if="assigningNumber"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="assigningNumber = null"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Assign Number</h3>
        <p class="text-sm text-gray-600 mb-4">
          Assign {{ formatPhoneNumber(assigningNumber.phone_number) }} to:
        </p>
        <form @submit.prevent="handleAssignNumber" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Tenant</label>
            <select
              v-model="assignForm.tenant_id"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select Tenant</option>
              <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                {{ tenant.company_name }}
              </option>
            </select>
          </div>
          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="assigningNumber = null"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Assign
            </button>
          </div>
        </form>
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
const phoneNumbers = ref([])
const tenants = ref([])
const total = ref(0)
const currentPage = ref(1)

const stats = ref({
  total: 0,
  active: 0,
  unassigned: 0,
  monthly_cost: 0
})

const filters = ref({
  search: '',
  tenant_id: '',
  provider: '',
  status: ''
})

const showProvisionModal = ref(false)
const assigningNumber = ref(null)

const provisionForm = ref({
  provider: 'twilio',
  area_code: '',
  number_type: 'local',
  tenant_id: ''
})

const assignForm = ref({
  tenant_id: ''
})

const totalPages = computed(() => Math.ceil(total.value / 20))

onMounted(() => {
  fetchData()
})

async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const [numbersRes, tenantsRes, statsRes] = await Promise.all([
      adminAPI.phoneNumbers.list({ page: currentPage.value, limit: 20, ...filters.value }),
      adminAPI.tenants.list({ limit: 1000 }),
      adminAPI.phoneNumbers.getStats()
    ])

    phoneNumbers.value = numbersRes.data.phone_numbers || []
    total.value = numbersRes.data.total || 0
    tenants.value = tenantsRes.data.tenants || []
    stats.value = statsRes.data || {}
  } catch (err) {
    console.error('Failed to fetch data:', err)
    error.value = 'Failed to load phone numbers'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchData()
}

function changePage(page) {
  currentPage.value = page
  fetchData()
}

async function handleProvisionNumber() {
  try {
    await adminAPI.phoneNumbers.provision(provisionForm.value)
    showProvisionModal.value = false
    provisionForm.value = { provider: 'twilio', area_code: '', number_type: 'local', tenant_id: '' }
    await fetchData()
  } catch (err) {
    console.error('Failed to provision number:', err)
    alert('Failed to provision number')
  }
}

function assignNumber(number) {
  assigningNumber.value = number
  assignForm.value.tenant_id = ''
}

async function handleAssignNumber() {
  try {
    await adminAPI.phoneNumbers.assign(assigningNumber.value.id, assignForm.value.tenant_id)
    assigningNumber.value = null
    await fetchData()
  } catch (err) {
    console.error('Failed to assign number:', err)
    alert('Failed to assign number')
  }
}

async function unassignNumber(number) {
  if (!confirm(`Unassign ${formatPhoneNumber(number.phone_number)} from ${number.tenant_name}?`)) return

  try {
    await adminAPI.phoneNumbers.unassign(number.id)
    await fetchData()
  } catch (err) {
    console.error('Failed to unassign number:', err)
    alert('Failed to unassign number')
  }
}

async function testNumber(number) {
  try {
    const response = await adminAPI.phoneNumbers.test(number.id)
    if (response.data.success) {
      alert('✅ Number test successful!')
    } else {
      alert('❌ Number test failed: ' + (response.data.error || 'Unknown error'))
    }
  } catch (err) {
    console.error('Failed to test number:', err)
    alert('Failed to test number')
  }
}

async function releaseNumber(number) {
  if (!confirm(`RELEASE ${formatPhoneNumber(number.phone_number)}? This will cancel it with the provider.`)) return

  try {
    await adminAPI.phoneNumbers.release(number.id)
    await fetchData()
  } catch (err) {
    console.error('Failed to release number:', err)
    alert('Failed to release number')
  }
}

function formatPhoneNumber(number) {
  if (!number) return ''
  const cleaned = number.replace(/\D/g, '')
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return number
}

function getProviderClass(provider) {
  const classes = {
    twilio: 'bg-red-100 text-red-800',
    telnyx: 'bg-blue-100 text-blue-800',
    bandwidth: 'bg-purple-100 text-purple-800'
  }
  return classes[provider] || 'bg-gray-100 text-gray-800'
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    unassigned: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
