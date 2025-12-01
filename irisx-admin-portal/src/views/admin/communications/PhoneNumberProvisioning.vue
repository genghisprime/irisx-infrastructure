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
      <div class="bg-white rounded-lg shadow p-6 text-center">
        <p class="text-sm text-gray-600 mb-2">Total Numbers</p>
        <p class="text-2xl font-bold text-gray-900">{{ stats.total }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6 text-center">
        <p class="text-sm text-gray-600 mb-2">Active</p>
        <p class="text-2xl font-bold text-green-600">{{ stats.active }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6 text-center">
        <p class="text-sm text-gray-600 mb-2">Unassigned</p>
        <p class="text-2xl font-bold text-yellow-600">{{ stats.unassigned }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6 text-center">
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
            <td class="px-6 py-4 text-right text-sm font-medium">
              <div class="flex justify-end gap-2">
                <button
                  v-if="!number.tenant_id && authStore.isAdmin"
                  @click="assignNumber(number)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                  title="Assign to tenant"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  <span>Assign</span>
                </button>
                <button
                  v-if="number.tenant_id && authStore.isAdmin"
                  @click="showUnassignModal(number)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded-md transition-colors"
                  title="Unassign from tenant"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                  </svg>
                  <span>Unassign</span>
                </button>
                <button
                  v-if="authStore.isAdmin"
                  @click="testNumber(number)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-md transition-colors"
                  title="Test number connectivity"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>Test</span>
                </button>
                <button
                  v-if="authStore.isSuperAdmin"
                  @click="showReleaseModal(number)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                  title="Release number from provider"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                  <span>Release</span>
                </button>
              </div>
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

    <!-- Unassign Confirmation Modal -->
    <div
      v-if="unassigningNumber"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="cancelUnassign"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <div class="flex items-start mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div class="ml-3 flex-1">
            <h3 class="text-lg font-semibold text-gray-900">Unassign Phone Number</h3>
            <p class="mt-2 text-sm text-gray-600">
              You are about to unassign <span class="font-semibold">{{ formatPhoneNumber(unassigningNumber?.phone_number) }}</span> from <span class="font-semibold">{{ unassigningNumber?.tenant_name }}</span>.
            </p>
            <p class="mt-2 text-sm text-gray-600">
              To confirm, please type <span class="font-mono font-semibold bg-gray-100 px-2 py-0.5 rounded">UNASSIGN</span> below:
            </p>
          </div>
        </div>
        <form @submit.prevent="handleUnassignNumber" class="space-y-4">
          <div>
            <input
              v-model="unassignConfirmText"
              type="text"
              required
              placeholder="Type UNASSIGN to confirm"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              @click="cancelUnassign"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="unassignConfirmText !== 'UNASSIGN'"
              class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Unassign Number
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Release Confirmation Modal -->
    <div
      v-if="releasingNumber"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="cancelRelease"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <div class="flex items-start mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div class="ml-3 flex-1">
            <h3 class="text-lg font-semibold text-red-900">Release Phone Number</h3>
            <p class="mt-2 text-sm text-gray-600">
              <span class="font-semibold text-red-600">⚠️ CRITICAL ACTION:</span> You are about to permanently release <span class="font-semibold">{{ formatPhoneNumber(releasingNumber?.phone_number) }}</span> from the provider.
            </p>
            <p class="mt-2 text-sm text-gray-600">
              This action will:
            </p>
            <ul class="mt-1 ml-4 text-sm text-gray-600 list-disc">
              <li>Cancel the number with {{ releasingNumber?.provider }}</li>
              <li>Stop all monthly billing for this number</li>
              <li>Make the number unavailable for future use</li>
            </ul>
            <p class="mt-3 text-sm font-semibold text-red-600">
              This action cannot be undone.
            </p>
            <p class="mt-3 text-sm text-gray-600">
              To confirm, please type <span class="font-mono font-semibold bg-red-100 px-2 py-0.5 rounded">RELEASE</span> below:
            </p>
          </div>
        </div>
        <form @submit.prevent="handleReleaseNumber" class="space-y-4">
          <div>
            <input
              v-model="releaseConfirmText"
              type="text"
              required
              placeholder="Type RELEASE to confirm"
              class="w-full px-3 py-2 border border-red-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              @click="cancelRelease"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="releaseConfirmText !== 'RELEASE'"
              class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Release Number Permanently
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
const unassigningNumber = ref(null)
const releasingNumber = ref(null)

const provisionForm = ref({
  provider: 'twilio',
  area_code: '',
  number_type: 'local',
  tenant_id: ''
})

const assignForm = ref({
  tenant_id: ''
})

const unassignConfirmText = ref('')
const releaseConfirmText = ref('')

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

function showUnassignModal(number) {
  unassigningNumber.value = number
  unassignConfirmText.value = ''
}

function cancelUnassign() {
  unassigningNumber.value = null
  unassignConfirmText.value = ''
}

async function handleUnassignNumber() {
  if (unassignConfirmText.value !== 'UNASSIGN') return

  try {
    await adminAPI.phoneNumbers.unassign(unassigningNumber.value.id)
    unassigningNumber.value = null
    unassignConfirmText.value = ''
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

function showReleaseModal(number) {
  releasingNumber.value = number
  releaseConfirmText.value = ''
}

function cancelRelease() {
  releasingNumber.value = null
  releaseConfirmText.value = ''
}

async function handleReleaseNumber() {
  if (releaseConfirmText.value !== 'RELEASE') return

  try {
    await adminAPI.phoneNumbers.release(releasingNumber.value.id)
    releasingNumber.value = null
    releaseConfirmText.value = ''
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
