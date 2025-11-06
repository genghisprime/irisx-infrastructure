<template>
  <DashboardLayout>
    <div class="agent-management">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Agent Management</h1>
          <p class="mt-1 text-sm text-gray-500">
            Manage your call center agents and their SIP extensions
          </p>
        </div>
        <button
          @click="openCreateModal"
          class="btn-primary"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Agent
        </button>
      </div>

      <!-- Filters -->
      <div class="filters-section">
        <div class="flex gap-4">
          <div class="flex-1">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search agents by name or email..."
              class="input-field"
            />
          </div>
          <select v-model="selectedStatus" class="select-field">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select v-model="selectedRole" class="select-field">
            <option value="all">All Roles</option>
            <option value="agent">Agent</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon bg-blue-100 text-blue-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Total Agents</p>
            <p class="stat-value">{{ stats.total }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-green-100 text-green-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Active Agents</p>
            <p class="stat-value">{{ stats.active }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-purple-100 text-purple-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Extensions Assigned</p>
            <p class="stat-value">{{ stats.extensions }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-yellow-100 text-yellow-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Online Now</p>
            <p class="stat-value">{{ stats.online }}</p>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading agents...</p>
      </div>

      <!-- Agents Table -->
      <div v-else-if="filteredAgents.length > 0" class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Email</th>
              <th>Role</th>
              <th>Extensions</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in filteredAgents" :key="agent.id">
              <td>
                <div class="flex items-center">
                  <div class="agent-avatar">
                    {{ getInitials(agent.first_name, agent.last_name) }}
                  </div>
                  <div class="ml-3">
                    <p class="font-medium text-gray-900">
                      {{ agent.first_name }} {{ agent.last_name }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="text-gray-600">{{ agent.email }}</td>
              <td>
                <span class="badge" :class="getRoleBadgeClass(agent.role)">
                  {{ agent.role }}
                </span>
              </td>
              <td>
                <div v-if="agent.extensions && agent.extensions.length > 0" class="flex gap-1">
                  <span
                    v-for="ext in agent.extensions"
                    :key="ext.id"
                    class="extension-badge"
                    :title="`Extension ${ext.extension} - ${ext.status}`"
                  >
                    {{ ext.extension }}
                  </span>
                </div>
                <span v-else class="text-gray-400 text-sm">No extensions</span>
              </td>
              <td>
                <span class="status-badge" :class="getStatusClass(agent.status)">
                  {{ agent.status }}
                </span>
              </td>
              <td class="text-gray-600 text-sm">
                {{ formatDate(agent.last_login_at) }}
              </td>
              <td>
                <div class="flex gap-2">
                  <button
                    @click="openEditModal(agent)"
                    class="btn-icon"
                    title="Edit agent"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    @click="toggleAgentStatus(agent)"
                    class="btn-icon"
                    :title="agent.status === 'active' ? 'Suspend agent' : 'Activate agent'"
                  >
                    <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" w-4 h-4" v-if="agent.status === 'active'"  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" w-4 h-4" v-else  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    @click="openDeleteModal(agent)"
                    class="btn-icon text-red-600 hover:bg-red-50"
                    title="Delete agent"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <svg class="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No agents found</h3>
        <p class="text-gray-500 mb-4">Get started by creating your first agent</p>
        <button @click="openCreateModal" class="btn-primary">
          Add Agent
        </button>
      </div>

      <!-- Create/Edit Modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="text-xl font-bold text-gray-900">
              {{ isEditing ? 'Edit Agent' : 'Create New Agent' }}
            </h2>
            <button @click="closeModal" class="modal-close">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form @submit.prevent="saveAgent" class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">First Name *</label>
                <input
                  v-model="formData.first_name"
                  type="text"
                  required
                  class="input-field"
                  placeholder="John"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Last Name *</label>
                <input
                  v-model="formData.last_name"
                  type="text"
                  required
                  class="input-field"
                  placeholder="Doe"
                />
              </div>

              <div class="form-group col-span-2">
                <label class="form-label">Email *</label>
                <input
                  v-model="formData.email"
                  type="email"
                  required
                  :disabled="isEditing"
                  class="input-field"
                  :class="{ 'bg-gray-100': isEditing }"
                  placeholder="john.doe@company.com"
                />
                <p v-if="isEditing" class="text-xs text-gray-500 mt-1">
                  Email cannot be changed after creation
                </p>
              </div>

              <div class="form-group">
                <label class="form-label">Role *</label>
                <select v-model="formData.role" required class="select-field">
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div v-if="!isEditing" class="form-group">
                <label class="form-label">Number of Extensions *</label>
                <input
                  v-model.number="formData.extensions_count"
                  type="number"
                  min="1"
                  max="5"
                  required
                  class="input-field"
                  placeholder="1"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Agent will receive {{ formData.extensions_count }} SIP extension(s)
                </p>
              </div>

              <div v-if="isEditing" class="form-group">
                <label class="form-label">Status</label>
                <select v-model="formData.status" class="select-field">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div v-if="!isEditing" class="form-group col-span-2">
                <label class="flex items-center">
                  <input
                    v-model="formData.send_welcome_email"
                    type="checkbox"
                    class="checkbox"
                  />
                  <span class="ml-2 text-sm text-gray-700">
                    Send welcome email with login credentials
                  </span>
                </label>
              </div>
            </div>

            <!-- Error Message -->
            <div v-if="errorMessage" class="error-message">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{ errorMessage }}
            </div>

            <!-- Success Message (for create) -->
            <div v-if="successMessage" class="success-message">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="font-medium">{{ successMessage }}</p>
                <p v-if="tempPassword" class="text-sm mt-1">
                  Temporary Password: <code class="bg-gray-100 px-2 py-1 rounded">{{ tempPassword }}</code>
                </p>
                <p class="text-xs text-gray-600 mt-2">
                  Save this password - it won't be shown again!
                </p>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                @click="closeModal"
                class="btn-secondary"
                :disabled="saving"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="saving"
              >
                <span v-if="saving" class="flex items-center">
                  <div class="spinner-small mr-2"></div>
                  {{ isEditing ? 'Updating...' : 'Creating...' }}
                </span>
                <span v-else>
                  {{ isEditing ? 'Update Agent' : 'Create Agent' }}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <h2 class="text-xl font-bold text-gray-900">Delete Agent</h2>
            <button @click="showDeleteModal = false" class="modal-close">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div class="text-center mb-4">
              <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 mb-2">
                Are you sure you want to delete this agent?
              </h3>
              <p class="text-sm text-gray-600 mb-4">
                This will delete <strong>{{ agentToDelete?.first_name }} {{ agentToDelete?.last_name }}</strong>
                and deprovision all their extensions.
              </p>
              <div v-if="agentToDelete?.extensions?.length" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p class="text-sm text-yellow-800">
                  Extensions to be deprovisioned:
                  <strong>{{ agentToDelete.extensions.map(e => e.extension).join(', ') }}</strong>
                </p>
              </div>
              <p class="text-xs text-gray-500">
                This action cannot be undone.
              </p>
            </div>

            <div v-if="errorMessage" class="error-message mb-4">
              {{ errorMessage }}
            </div>

            <div class="modal-footer">
              <button
                @click="showDeleteModal = false"
                class="btn-secondary"
                :disabled="deleting"
              >
                Cancel
              </button>
              <button
                @click="confirmDelete"
                class="btn-danger"
                :disabled="deleting"
              >
                <span v-if="deleting" class="flex items-center">
                  <div class="spinner-small mr-2"></div>
                  Deleting...
                </span>
                <span v-else>Delete Agent</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import DashboardLayout from './dashboard/DashboardLayout.vue'

const authStore = useAuthStore()
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://3.83.53.69:3000'

// State
const agents = ref([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const searchQuery = ref('')
const selectedStatus = ref('all')
const selectedRole = ref('all')
const showModal = ref(false)
const showDeleteModal = ref(false)
const isEditing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const tempPassword = ref('')
const agentToDelete = ref(null)

// Form Data
const formData = ref({
  first_name: '',
  last_name: '',
  email: '',
  role: 'agent',
  extensions_count: 1,
  send_welcome_email: true,
  status: 'active'
})

const currentAgent = ref(null)

// Stats
const stats = computed(() => ({
  total: agents.value.length,
  active: agents.value.filter(a => a.status === 'active').length,
  extensions: agents.value.reduce((sum, a) => sum + (a.extensions?.length || 0), 0),
  online: agents.value.filter(a => {
    const lastLogin = new Date(a.last_login_at)
    const now = new Date()
    const diffMinutes = (now - lastLogin) / 1000 / 60
    return diffMinutes < 15 // Online if logged in within last 15 minutes
  }).length
}))

// Filtered Agents
const filteredAgents = computed(() => {
  let filtered = agents.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(a =>
      a.first_name.toLowerCase().includes(query) ||
      a.last_name.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query)
    )
  }

  // Filter by status
  if (selectedStatus.value !== 'all') {
    filtered = filtered.filter(a => a.status === selectedStatus.value)
  }

  // Filter by role
  if (selectedRole.value !== 'all') {
    filtered = filtered.filter(a => a.role === selectedRole.value)
  }

  return filtered
})

// Methods
async function fetchAgents() {
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/v1/admin/agents`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch agents')
    }

    const data = await response.json()
    agents.value = data.agents || []
  } catch (error) {
    console.error('Error fetching agents:', error)
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  isEditing.value = false
  currentAgent.value = null
  formData.value = {
    first_name: '',
    last_name: '',
    email: '',
    role: 'agent',
    extensions_count: 1,
    send_welcome_email: true,
    status: 'active'
  }
  errorMessage.value = ''
  successMessage.value = ''
  tempPassword.value = ''
  showModal.value = true
}

function openEditModal(agent) {
  isEditing.value = true
  currentAgent.value = agent
  formData.value = {
    first_name: agent.first_name,
    last_name: agent.last_name,
    email: agent.email,
    role: agent.role,
    status: agent.status
  }
  errorMessage.value = ''
  successMessage.value = ''
  tempPassword.value = ''
  showModal.value = true
}

function closeModal() {
  // If we just created an agent successfully, refresh the list
  if (successMessage.value) {
    fetchAgents()
  }
  showModal.value = false
  errorMessage.value = ''
  successMessage.value = ''
  tempPassword.value = ''
}

async function saveAgent() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const url = isEditing.value
      ? `${API_BASE_URL}/v1/admin/agents/${currentAgent.value.id}`
      : `${API_BASE_URL}/v1/admin/agents`

    const method = isEditing.value ? 'PATCH' : 'POST'

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to save agent')
    }

    if (isEditing.value) {
      successMessage.value = 'Agent updated successfully'
      setTimeout(() => {
        closeModal()
      }, 1500)
    } else {
      successMessage.value = `Agent ${data.agent.first_name} ${data.agent.last_name} created successfully!`
      tempPassword.value = data.temporary_password
      // Don't auto-close so admin can copy the password
    }
  } catch (error) {
    console.error('Error saving agent:', error)
    errorMessage.value = error.message
  } finally {
    saving.value = false
  }
}

async function toggleAgentStatus(agent) {
  const newStatus = agent.status === 'active' ? 'suspended' : 'active'

  try {
    const response = await fetch(`${API_BASE_URL}/v1/admin/agents/${agent.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    })

    if (!response.ok) {
      throw new Error('Failed to update agent status')
    }

    // Update local state
    agent.status = newStatus
  } catch (error) {
    console.error('Error toggling agent status:', error)
    alert('Failed to update agent status')
  }
}

function openDeleteModal(agent) {
  agentToDelete.value = agent
  errorMessage.value = ''
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!agentToDelete.value) return

  deleting.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${API_BASE_URL}/v1/admin/agents/${agentToDelete.value.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to delete agent')
    }

    // Remove from local state
    agents.value = agents.value.filter(a => a.id !== agentToDelete.value.id)

    showDeleteModal.value = false
    agentToDelete.value = null
  } catch (error) {
    console.error('Error deleting agent:', error)
    errorMessage.value = error.message
  } finally {
    deleting.value = false
  }
}

function getInitials(firstName, lastName) {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase()
}

function getRoleBadgeClass(role) {
  const classes = {
    agent: 'badge-blue',
    supervisor: 'badge-purple',
    admin: 'badge-red'
  }
  return classes[role] || 'badge-gray'
}

function getStatusClass(status) {
  return status === 'active' ? 'status-active' : 'status-suspended'
}

function formatDate(dateString) {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

// Lifecycle
onMounted(() => {
  fetchAgents()
})
</script>

<style scoped>
/* Layout */
.agent-management {
  @apply space-y-6;
}

.page-header {
  @apply flex justify-between items-start;
}

.filters-section {
  @apply bg-white rounded-lg shadow p-4;
}

.stats-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4;
}

.stat-card {
  @apply bg-white rounded-lg shadow p-6 flex items-center gap-4;
}

.stat-icon {
  @apply w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0;
}

.stat-label {
  @apply text-sm font-medium text-gray-600;
}

.stat-value {
  @apply text-2xl font-bold text-gray-900;
}

/* Table */
.table-container {
  @apply bg-white rounded-lg shadow overflow-hidden;
}

.data-table {
  @apply min-w-full divide-y divide-gray-200;
}

.data-table thead {
  @apply bg-gray-50;
}

.data-table th {
  @apply px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider;
}

.data-table td {
  @apply px-6 py-4 whitespace-nowrap text-sm;
}

.data-table tbody tr {
  @apply hover:bg-gray-50 transition-colors;
}

/* Avatar */
.agent-avatar {
  @apply w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm;
}

/* Badges */
.badge {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
}

.badge-blue {
  @apply bg-blue-100 text-blue-800;
}

.badge-purple {
  @apply bg-purple-100 text-purple-800;
}

.badge-red {
  @apply bg-red-100 text-red-800;
}

.badge-gray {
  @apply bg-gray-100 text-gray-800;
}

.extension-badge {
  @apply inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-mono;
}

.status-badge {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
}

.status-active {
  @apply bg-green-100 text-green-800;
}

.status-suspended {
  @apply bg-yellow-100 text-yellow-800;
}

/* Buttons */
.btn-primary {
  @apply inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors;
}

.btn-secondary {
  @apply inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors;
}

.btn-danger {
  @apply inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors;
}

.btn-icon {
  @apply p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors;
}

/* Forms */
.input-field {
  @apply block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm;
}

.select-field {
  @apply block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm;
}

.form-grid {
  @apply grid grid-cols-2 gap-4;
}

.form-group {
  @apply space-y-1;
}

.form-label {
  @apply block text-sm font-medium text-gray-700;
}

.checkbox {
  @apply h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded;
}

/* Modal */
.modal-overlay {
  @apply fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50;
}

.modal-content {
  @apply bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto;
}

.modal-header {
  @apply flex items-center justify-between p-6 border-b border-gray-200;
}

.modal-close {
  @apply text-gray-400 hover:text-gray-500 transition-colors;
}

.modal-body {
  @apply p-6 space-y-4;
}

.modal-footer {
  @apply flex justify-end gap-3 pt-4 border-t border-gray-200;
}

/* Messages */
.error-message {
  @apply flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm;
}

.success-message {
  @apply flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm;
}

/* States */
.loading-state {
  @apply flex flex-col items-center justify-center py-12 text-gray-500;
}

.empty-state {
  @apply flex flex-col items-center justify-center py-12 bg-white rounded-lg shadow;
}

/* Spinner */
.spinner {
  @apply animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full;
}

.spinner-small {
  @apply animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block;
}
</style>
