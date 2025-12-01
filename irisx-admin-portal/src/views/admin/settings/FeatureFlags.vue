<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p class="text-sm text-gray-600 mt-1">Manage system-wide feature rollouts and tenant-specific overrides</p>
      </div>
      <button
        v-if="authStore.isSuperAdmin"
        @click="showAddModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Add Feature Flag
      </button>
    </div>

    <!-- Info Alert -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <p class="text-sm text-blue-800">
        <strong>📊 Rollout Strategies:</strong> Control feature access via global enable, percentage rollout, specific tenant targeting, or individual tenant overrides.
      </p>
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

    <!-- Feature Flags Grid -->
    <div v-else class="grid grid-cols-1 gap-6">
      <div
        v-for="flag in flags"
        :key="flag.id"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center space-x-3">
              <h3 class="text-lg font-semibold text-gray-900">{{ flag.name }}</h3>
              <span
                class="px-3 py-1 text-xs font-medium rounded-full"
                :class="flag.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
              >
                {{ flag.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
            <p class="text-sm text-gray-500 mt-1">{{ flag.key }}</p>
            <p class="text-sm text-gray-600 mt-2">{{ flag.description || 'No description' }}</p>
          </div>
        </div>

        <!-- Rollout Configuration -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <p class="text-xs text-gray-500 uppercase mb-1">Rollout Percentage</p>
            <div class="flex items-center space-x-2">
              <div class="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  class="bg-blue-600 rounded-full h-2 transition-all"
                  :style="{ width: flag.rollout_percentage + '%' }"
                ></div>
              </div>
              <span class="text-sm font-medium text-gray-900">{{ flag.rollout_percentage }}%</span>
            </div>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase mb-1">Rollout Tenants</p>
            <p class="text-sm text-gray-900">
              {{ flag.rollout_tenants && flag.rollout_tenants.length > 0 ? flag.rollout_tenants.length + ' tenants' : 'All tenants' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase mb-1">Tenant Overrides</p>
            <p class="text-sm text-gray-900">{{ flag.override_count || 0 }} overrides</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex space-x-2 pt-4 border-t">
          <button
            @click="viewFlagDetails(flag)"
            class="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm"
          >
            View Details
          </button>
          <button
            v-if="authStore.isAdmin"
            @click="editFlag(flag)"
            class="flex-1 px-3 py-2 bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 text-sm"
          >
            Edit
          </button>
          <button
            v-if="authStore.isAdmin"
            @click="toggleFlag(flag)"
            class="flex-1 px-3 py-2 rounded-md text-sm"
            :class="flag.enabled ? 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100' : 'bg-green-50 text-green-600 hover:bg-green-100'"
          >
            {{ flag.enabled ? 'Disable' : 'Enable' }}
          </button>
          <button
            v-if="authStore.isSuperAdmin"
            @click="deleteFlag(flag)"
            class="px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && !error && flags.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-gray-500">No feature flags found</p>
    </div>

    <!-- Add/Edit Flag Modal -->
    <div
      v-if="showAddModal || showEditModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="closeModals"
    >
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">{{ showAddModal ? 'Add Feature Flag' : 'Edit Feature Flag' }}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Key <span class="text-red-500">*</span></label>
            <input
              v-model="flagForm.key"
              :disabled="showEditModal"
              type="text"
              placeholder="ai_powered_routing"
              class="w-full px-3 py-2 border rounded-md"
              :class="showEditModal ? 'bg-gray-100 cursor-not-allowed' : ''"
            />
            <p class="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and underscores only</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Name <span class="text-red-500">*</span></label>
            <input
              v-model="flagForm.name"
              type="text"
              placeholder="AI-Powered Channel Routing"
              class="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Description</label>
            <textarea
              v-model="flagForm.description"
              rows="3"
              placeholder="Detailed description of this feature..."
              class="w-full px-3 py-2 border rounded-md"
            ></textarea>
          </div>
          <div class="flex items-center space-x-2">
            <input
              v-model="flagForm.enabled"
              type="checkbox"
              id="enabled"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label for="enabled" class="text-sm font-medium">Feature Enabled</label>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Rollout Percentage ({{ flagForm.rollout_percentage }}%)</label>
            <input
              v-model.number="flagForm.rollout_percentage"
              type="range"
              min="0"
              max="100"
              step="5"
              class="w-full"
            />
            <p class="text-xs text-gray-500 mt-1">Percentage of tenants to enable (hash-based for consistency)</p>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Rollout Tenants (Beta Testing)</label>
            <input
              v-model="rolloutTenantsInput"
              type="text"
              placeholder="1,2,3 (comma-separated tenant IDs)"
              class="w-full px-3 py-2 border rounded-md"
            />
            <p class="text-xs text-gray-500 mt-1">Specific tenant IDs to enable (overrides percentage)</p>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button
            @click="closeModals"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="showAddModal ? createFlag() : updateFlag()"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {{ showAddModal ? 'Create Flag' : 'Update Flag' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Flag Details Modal -->
    <div
      v-if="showDetailsModal && selectedFlag"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showDetailsModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">{{ selectedFlag.name }}</h3>
          <button @click="showDetailsModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="mb-6">
          <p class="text-sm text-gray-500">{{ selectedFlag.key }}</p>
          <p class="text-sm text-gray-600 mt-2">{{ selectedFlag.description || 'No description' }}</p>
        </div>

        <div class="mb-6">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Rollout Configuration</h4>
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-xs text-gray-500 uppercase">Status</p>
              <p class="text-lg font-semibold" :class="selectedFlag.enabled ? 'text-green-600' : 'text-gray-600'">
                {{ selectedFlag.enabled ? 'Enabled' : 'Disabled' }}
              </p>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-xs text-gray-500 uppercase">Rollout %</p>
              <p class="text-lg font-semibold text-blue-600">{{ selectedFlag.rollout_percentage }}%</p>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-xs text-gray-500 uppercase">Target Tenants</p>
              <p class="text-lg font-semibold text-purple-600">
                {{ selectedFlag.rollout_tenants && selectedFlag.rollout_tenants.length > 0 ? selectedFlag.rollout_tenants.length : 'All' }}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Tenant Overrides</h4>
          <div v-if="loadingDetails" class="text-center py-8">
            <svg class="animate-spin h-6 w-6 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <div v-else-if="flagOverrides.length === 0" class="text-center py-8 text-gray-500">
            No tenant overrides set
          </div>
          <div v-else class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="override in flagOverrides"
              :key="override.tenant_id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p class="text-sm font-medium text-gray-900">{{ override.tenant_name }}</p>
                <p class="text-xs text-gray-500">Tenant ID: {{ override.tenant_id }}</p>
              </div>
              <span
                class="px-3 py-1 text-xs font-medium rounded-full"
                :class="override.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
              >
                {{ override.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const loadingDetails = ref(false)
const error = ref(null)
const flags = ref([])
const showAddModal = ref(false)
const showEditModal = ref(false)
const showDetailsModal = ref(false)
const selectedFlag = ref(null)
const flagOverrides = ref([])

const flagForm = ref({
  key: '',
  name: '',
  description: '',
  enabled: false,
  rollout_percentage: 0,
  rollout_tenants: []
})

const rolloutTenantsInput = ref('')

onMounted(() => {
  fetchFlags()
})

async function fetchFlags() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.featureFlags.list()
    flags.value = response.data.flags || []
  } catch (err) {
    console.error('Failed to fetch feature flags:', err)
    error.value = 'Failed to load feature flags'
  } finally {
    loading.value = false
  }
}

async function viewFlagDetails(flag) {
  selectedFlag.value = flag
  showDetailsModal.value = true
  loadingDetails.value = true

  try {
    const response = await adminAPI.featureFlags.get(flag.key)
    selectedFlag.value = response.data.flag
    flagOverrides.value = response.data.overrides || []
  } catch (err) {
    console.error('Failed to fetch flag details:', err)
  } finally {
    loadingDetails.value = false
  }
}

function editFlag(flag) {
  flagForm.value = {
    key: flag.key,
    name: flag.name,
    description: flag.description || '',
    enabled: flag.enabled,
    rollout_percentage: flag.rollout_percentage || 0,
    rollout_tenants: flag.rollout_tenants || []
  }
  rolloutTenantsInput.value = flag.rollout_tenants && flag.rollout_tenants.length > 0 ? flag.rollout_tenants.join(',') : ''
  showEditModal.value = true
}

async function createFlag() {
  try {
    // Parse rollout tenants
    const rolloutTenants = rolloutTenantsInput.value
      ? rolloutTenantsInput.value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      : []

    await adminAPI.featureFlags.create({
      key: flagForm.value.key,
      name: flagForm.value.name,
      description: flagForm.value.description,
      enabled: flagForm.value.enabled,
      rollout_percentage: flagForm.value.rollout_percentage,
      rollout_tenants: rolloutTenants
    })

    closeModals()
    await fetchFlags()
    alert('✅ Feature flag created successfully')
  } catch (err) {
    console.error('Failed to create flag:', err)
    alert('❌ Failed to create feature flag: ' + (err.response?.data?.error || err.message))
  }
}

async function updateFlag() {
  try {
    // Parse rollout tenants
    const rolloutTenants = rolloutTenantsInput.value
      ? rolloutTenantsInput.value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      : []

    await adminAPI.featureFlags.update(flagForm.value.key, {
      name: flagForm.value.name,
      description: flagForm.value.description,
      enabled: flagForm.value.enabled,
      rollout_percentage: flagForm.value.rollout_percentage,
      rollout_tenants: rolloutTenants
    })

    closeModals()
    await fetchFlags()
    alert('✅ Feature flag updated successfully')
  } catch (err) {
    console.error('Failed to update flag:', err)
    alert('❌ Failed to update feature flag: ' + (err.response?.data?.error || err.message))
  }
}

async function toggleFlag(flag) {
  if (!confirm(`${flag.enabled ? 'Disable' : 'Enable'} feature flag "${flag.name}"?`)) return

  try {
    await adminAPI.featureFlags.update(flag.key, {
      enabled: !flag.enabled
    })
    await fetchFlags()
    alert(`✅ Feature flag ${flag.enabled ? 'disabled' : 'enabled'}`)
  } catch (err) {
    console.error('Failed to toggle flag:', err)
    alert('❌ Failed to toggle feature flag')
  }
}

async function deleteFlag(flag) {
  if (!confirm(`Delete feature flag "${flag.name}"? This action cannot be undone.`)) return

  try {
    await adminAPI.featureFlags.delete(flag.key)
    await fetchFlags()
    alert('✅ Feature flag deleted')
  } catch (err) {
    console.error('Failed to delete flag:', err)
    alert('❌ Failed to delete feature flag')
  }
}

function closeModals() {
  showAddModal.value = false
  showEditModal.value = false
  flagForm.value = {
    key: '',
    name: '',
    description: '',
    enabled: false,
    rollout_percentage: 0,
    rollout_tenants: []
  }
  rolloutTenantsInput.value = ''
}
</script>
