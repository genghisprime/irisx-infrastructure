<template>
  <div>
    <div class="mb-6">
      <RouterLink
        :to="`/dashboard/tenants/${tenantId}`"
        class="text-blue-600 hover:text-blue-800 flex items-center"
      >
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tenant
      </RouterLink>
    </div>

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">
        Manage Users - {{ tenant?.company_name || 'Loading...' }}
      </h1>
      <button
        v-if="authStore.isAdmin"
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        + Add User
      </button>
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

    <!-- Users Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Name
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Email
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Role
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Last Login
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <p class="text-sm font-medium text-gray-900">{{ user.first_name }} {{ user.last_name }}</p>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ user.email }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getRoleClass(user.role)"
              >
                {{ user.role }}
              </span>
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(user.status)"
              >
                {{ user.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ user.last_login_at ? formatDate(user.last_login_at) : 'Never' }}
            </td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <button
                v-if="authStore.isAdmin"
                @click="editUser(user)"
                class="text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
              <button
                v-if="user.status === 'active' && authStore.isAdmin"
                @click="suspendUser(user)"
                class="text-yellow-600 hover:text-yellow-800"
              >
                Suspend
              </button>
              <button
                v-if="user.status === 'suspended' && authStore.isAdmin"
                @click="reactivateUser(user)"
                class="text-green-600 hover:text-green-800"
              >
                Reactivate
              </button>
              <button
                v-if="authStore.isAdmin"
                @click="resetPassword(user)"
                class="text-purple-600 hover:text-purple-800"
              >
                Reset Password
              </button>
              <button
                v-if="authStore.isSuperAdmin"
                @click="deleteUser(user)"
                class="text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="users.length === 0" class="text-center py-12">
        <p class="text-gray-500">No users found for this tenant</p>
      </div>
    </div>

    <!-- Create User Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showCreateModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add New User</h3>
        <form @submit.prevent="handleCreateUser" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">First Name</label>
            <input
              v-model="newUser.first_name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
            <input
              v-model="newUser.last_name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              v-model="newUser.email"
              type="email"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <select
              v-model="newUser.role"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="showCreateModal = false"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div
      v-if="editingUser"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="editingUser = null"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Edit User</h3>
        <form @submit.prevent="handleUpdateUser" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">First Name</label>
            <input
              v-model="editingUser.first_name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
            <input
              v-model="editingUser.last_name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              v-model="editingUser.email"
              type="email"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Role</label>
            <select
              v-model="editingUser.role"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="editingUser = null"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Update User
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const route = useRoute()
const authStore = useAdminAuthStore()

const tenantId = route.params.id
const loading = ref(true)
const error = ref(null)
const tenant = ref(null)
const users = ref([])
const showCreateModal = ref(false)
const editingUser = ref(null)

const newUser = ref({
  first_name: '',
  last_name: '',
  email: '',
  role: 'agent'
})

onMounted(() => {
  fetchData()
})

async function fetchData() {
  loading.value = true
  error.value = null

  try {
    const [tenantRes, usersRes] = await Promise.all([
      adminAPI.tenants.get(tenantId),
      adminAPI.users.listByTenant(tenantId)
    ])

    tenant.value = tenantRes.data.tenant
    users.value = usersRes.data.users || []
  } catch (err) {
    console.error('Failed to fetch data:', err)
    error.value = 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function handleCreateUser() {
  try {
    await adminAPI.users.create(tenantId, newUser.value)
    showCreateModal.value = false
    newUser.value = { first_name: '', last_name: '', email: '', role: 'agent' }
    await fetchData()
  } catch (err) {
    console.error('Failed to create user:', err)
    alert('Failed to create user')
  }
}

function editUser(user) {
  editingUser.value = { ...user }
}

async function handleUpdateUser() {
  try {
    await adminAPI.users.update(tenantId, editingUser.value.id, editingUser.value)
    editingUser.value = null
    await fetchData()
  } catch (err) {
    console.error('Failed to update user:', err)
    alert('Failed to update user')
  }
}

async function suspendUser(user) {
  if (!confirm(`Suspend user "${user.first_name} ${user.last_name}"?`)) return

  try {
    await adminAPI.users.suspend(tenantId, user.id)
    await fetchData()
  } catch (err) {
    console.error('Failed to suspend user:', err)
    alert('Failed to suspend user')
  }
}

async function reactivateUser(user) {
  if (!confirm(`Reactivate user "${user.first_name} ${user.last_name}"?`)) return

  try {
    await adminAPI.users.reactivate(tenantId, user.id)
    await fetchData()
  } catch (err) {
    console.error('Failed to reactivate user:', err)
    alert('Failed to reactivate user')
  }
}

async function resetPassword(user) {
  if (!confirm(`Send password reset email to "${user.email}"?`)) return

  try {
    const response = await adminAPI.users.resetPassword(tenantId, user.id)
    alert(`Password reset email sent. Temporary password: ${response.data.temp_password}`)
  } catch (err) {
    console.error('Failed to reset password:', err)
    alert('Failed to reset password')
  }
}

async function deleteUser(user) {
  if (!confirm(`DELETE user "${user.first_name} ${user.last_name}"? This action cannot be undone.`)) return

  try {
    await adminAPI.users.delete(tenantId, user.id)
    await fetchData()
  } catch (err) {
    console.error('Failed to delete user:', err)
    alert('Failed to delete user')
  }
}

function getRoleClass(role) {
  const classes = {
    agent: 'bg-blue-100 text-blue-800',
    manager: 'bg-purple-100 text-purple-800',
    admin: 'bg-yellow-100 text-yellow-800'
  }
  return classes[role] || 'bg-gray-100 text-gray-800'
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    invited: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString()
}
</script>
