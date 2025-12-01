<template>
  <div class="p-6 space-y-6">
    <!-- Page Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Contact Management</h1>
        <p class="text-gray-600 mt-1">Cross-tenant contact database search and management</p>
      </div>
      <div class="flex gap-3">
        <button
          @click="exportContacts"
          class="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          :disabled="loading"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Export CSV
        </button>
        <button
          @click="showDNCList"
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          DNC List
        </button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div v-if="stats" class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Total Contacts</p>
            <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats.total.toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Active</p>
            <p class="text-3xl font-bold text-green-600 mt-2">{{ stats.by_status.active.toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">DNC</p>
            <p class="text-3xl font-bold text-red-600 mt-2">{{ stats.by_status.dnc.toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">New This Month</p>
            <p class="text-3xl font-bold text-purple-600 mt-2">{{ stats.new_this_month.toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Search</label>
          <input
            v-model="filters.search"
            @input="debouncedFetchContacts"
            type="text"
            placeholder="Name, email, or phone..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Tenant</label>
          <input
            v-model="filters.tenant_id"
            @change="fetchContacts"
            type="number"
            placeholder="Tenant ID"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            v-model="filters.status"
            @change="fetchContacts"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="dnc">DNC</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>

      </div>

      <div class="mt-4 flex gap-2">
        <button
          @click="clearFilters"
          class="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Clear Filters
        </button>
      </div>
    </div>

    <!-- Bulk Actions Bar (shown when contacts are selected) -->
    <div v-if="selectedContacts.length > 0" class="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
      <div class="flex items-center gap-2">
        <span class="font-medium text-blue-900">{{ selectedContacts.length }} selected</span>
        <button
          @click="selectedContacts = []"
          class="text-blue-600 hover:text-blue-800 text-sm"
        >
          Clear selection
        </button>
      </div>
      <div class="flex gap-2">
        <button
          @click="showBulkActionModal('add_tag')"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Tag
        </button>
        <button
          @click="showBulkActionModal('mark_dnc')"
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Mark as DNC
        </button>
        <button
          @click="showBulkActionModal('delete')"
          class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Delete
        </button>
      </div>
    </div>

    <!-- Contacts Table -->
    <div class="bg-white rounded-xl shadow-md overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-6 py-3 text-left">
              <input
                type="checkbox"
                @change="toggleSelectAll"
                :checked="selectedContacts.length === contacts.length && contacts.length > 0"
                class="rounded border-gray-300"
              />
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lists</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="loading">
            <td colspan="8" class="px-6 py-12 text-center text-gray-500">
              <div class="flex justify-center items-center gap-2">
                <svg class="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading contacts...
              </div>
            </td>
          </tr>
          <tr v-else-if="contacts.length === 0">
            <td colspan="8" class="px-6 py-12 text-center text-gray-500">
              No contacts found
            </td>
          </tr>
          <tr v-else v-for="contact in contacts" :key="contact.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <input
                type="checkbox"
                v-model="selectedContacts"
                :value="contact.id"
                class="rounded border-gray-300"
              />
            </td>
            <td class="px-6 py-4">
              <div>
                <div class="font-medium text-gray-900">{{ contact.first_name }} {{ contact.last_name }}</div>
                <div class="text-sm text-gray-500">{{ contact.email }}</div>
                <div class="text-sm text-gray-500">{{ contact.phone }}</div>
              </div>
            </td>
            <td class="px-6 py-4">
              <div class="text-sm text-gray-900">{{ contact.tenant_name || `Tenant #${contact.tenant_id}` }}</div>
            </td>
            <td class="px-6 py-4">
              <span :class="getStatusBadgeClass(contact.status)" class="px-2 py-1 text-xs font-medium rounded-full">
                {{ contact.status }}
              </span>
            </td>
            <td class="px-6 py-4">
              <div v-if="contact.tags && contact.tags.length > 0" class="flex flex-wrap gap-1">
                <span v-for="tag in contact.tags.slice(0, 3)" :key="tag" class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {{ tag }}
                </span>
                <span v-if="contact.tags.length > 3" class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  +{{ contact.tags.length - 3 }}
                </span>
              </div>
              <span v-else class="text-sm text-gray-400">No tags</span>
            </td>
            <td class="px-6 py-4">
              <span class="text-sm text-gray-600">{{ contact.list_count || 0 }} lists</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(contact.created_at) }}
            </td>
            <td class="px-6 py-4">
              <button
                @click="viewContactDetails(contact.id)"
                class="text-blue-600 hover:text-blue-800 font-medium text-sm"
              >
                View Details
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && contacts.length > 0" class="flex justify-between items-center">
      <div class="text-sm text-gray-600">
        Showing {{ ((pagination.page - 1) * pagination.limit) + 1 }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} contacts
      </div>
      <div class="flex gap-2">
        <button
          @click="previousPage"
          :disabled="pagination.page === 1"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          @click="nextPage"
          :disabled="pagination.page * pagination.limit >= pagination.total"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Bulk Action Modal -->
    <div v-if="showBulkModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">
          {{ bulkActionTitle }}
        </h2>

        <div v-if="bulkAction === 'add_tag'" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Tag Name</label>
            <input
              v-model="bulkActionValue"
              type="text"
              placeholder="Enter tag name"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div v-else-if="bulkAction === 'mark_dnc'" class="space-y-4">
          <p class="text-gray-600">Are you sure you want to mark {{ selectedContacts.length }} contacts as Do Not Call?</p>
        </div>

        <div v-else-if="bulkAction === 'delete'" class="space-y-4">
          <p class="text-red-600 font-medium">Warning: This action cannot be undone!</p>
          <p class="text-gray-600">Are you sure you want to delete {{ selectedContacts.length }} contacts?</p>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="closeBulkActionModal"
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="executeBulkAction"
            :disabled="processing"
            :class="bulkAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
            class="px-4 py-2 text-white rounded-lg disabled:opacity-50"
          >
            {{ processing ? 'Processing...' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Contact Details Modal -->
    <div v-if="selectedContact" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 m-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">{{ selectedContact.first_name }} {{ selectedContact.last_name }}</h2>
            <p class="text-gray-600">Contact ID: {{ selectedContact.id }}</p>
          </div>
          <button
            @click="closeContactDetails"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Contact Information -->
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 class="font-semibold text-gray-900 mb-3">Contact Information</h3>
            <div class="space-y-2 text-sm">
              <div><span class="text-gray-600">Email:</span> <span class="font-medium">{{ selectedContact.email }}</span></div>
              <div><span class="text-gray-600">Phone:</span> <span class="font-medium">{{ selectedContact.phone }}</span></div>
              <div><span class="text-gray-600">Status:</span> <span :class="getStatusBadgeClass(selectedContact.status)" class="px-2 py-1 text-xs font-medium rounded-full ml-2">{{ selectedContact.status }}</span></div>
            </div>
          </div>

          <div>
            <h3 class="font-semibold text-gray-900 mb-3">Tenant Information</h3>
            <div class="space-y-2 text-sm">
              <div><span class="text-gray-600">Tenant:</span> <span class="font-medium">{{ selectedContact.tenant_name }}</span></div>
              <div><span class="text-gray-600">Created:</span> <span class="font-medium">{{ formatDate(selectedContact.created_at) }}</span></div>
              <div><span class="text-gray-600">Updated:</span> <span class="font-medium">{{ formatDate(selectedContact.updated_at) }}</span></div>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="selectedContact.tags && selectedContact.tags.length > 0" class="mb-6">
          <h3 class="font-semibold text-gray-900 mb-3">Tags</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="tag in selectedContact.tags" :key="tag" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Lists -->
        <div v-if="selectedContact.lists && selectedContact.lists.length > 0" class="mb-6">
          <h3 class="font-semibold text-gray-900 mb-3">Contact Lists</h3>
          <div class="space-y-2">
            <div v-for="list in selectedContact.lists" :key="list.list_id" class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span class="font-medium">{{ list.list_name }}</span>
              <span class="text-sm text-gray-600">Added {{ formatDate(list.joined_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Activity Timeline -->
        <div v-if="selectedContact.activity && selectedContact.activity.length > 0">
          <h3 class="font-semibold text-gray-900 mb-3">Recent Activity</h3>
          <div class="space-y-3">
            <div v-for="activity in selectedContact.activity" :key="activity.id" class="flex gap-3 p-3 bg-gray-50 rounded-lg">
              <div class="flex-shrink-0">
                <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div class="flex-grow">
                <div class="font-medium text-gray-900">{{ activity.type }}</div>
                <div class="text-sm text-gray-600">{{ activity.description }}</div>
                <div class="text-xs text-gray-500 mt-1">{{ formatDate(activity.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end mt-6">
          <button
            @click="closeContactDetails"
            class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(false)
const processing = ref(false)
const contacts = ref([])
const stats = ref(null)
const selectedContacts = ref([])
const selectedContact = ref(null)
const showBulkModal = ref(false)
const bulkAction = ref(null)
const bulkActionValue = ref('')

const filters = ref({
  search: '',
  tenant_id: '',
  status: ''
})

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0
})

onMounted(async () => {
  await Promise.all([
    fetchContacts(),
    fetchStats()
  ])
})

async function fetchContacts() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...filters.value
    }

    // Remove empty filters
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null) {
        delete params[key]
      }
    })

    const response = await adminAPI.contacts.list(params)
    contacts.value = response.data.contacts
    pagination.value.total = response.data.total
    pagination.value.page = response.data.page
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
    alert('Failed to load contacts. Please try again.')
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  try {
    const response = await adminAPI.contacts.getStats()
    stats.value = response.data
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

let debounceTimer
function debouncedFetchContacts() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    pagination.value.page = 1
    fetchContacts()
  }, 500)
}

function clearFilters() {
  filters.value = {
    search: '',
    tenant_id: '',
    status: ''
  }
  pagination.value.page = 1
  fetchContacts()
}

function toggleSelectAll(event) {
  if (event.target.checked) {
    selectedContacts.value = contacts.value.map(c => c.id)
  } else {
    selectedContacts.value = []
  }
}

function showBulkActionModal(action) {
  bulkAction.value = action
  bulkActionValue.value = ''
  showBulkModal.value = true
}

function closeBulkActionModal() {
  showBulkModal.value = false
  bulkAction.value = null
  bulkActionValue.value = ''
}

const bulkActionTitle = computed(() => {
  switch (bulkAction.value) {
    case 'add_tag': return 'Add Tag to Selected Contacts'
    case 'mark_dnc': return 'Mark as Do Not Call'
    case 'delete': return 'Delete Contacts'
    default: return ''
  }
})

async function executeBulkAction() {
  if (bulkAction.value === 'add_tag' && !bulkActionValue.value) {
    alert('Please enter a tag name')
    return
  }

  processing.value = true
  try {
    const data = {
      action: bulkAction.value,
      contact_ids: selectedContacts.value
    }

    if (bulkAction.value === 'add_tag') {
      data.tag = bulkActionValue.value
    }

    await adminAPI.contacts.bulkAction(data)

    alert(`Successfully performed ${bulkAction.value} on ${selectedContacts.value.length} contacts`)
    selectedContacts.value = []
    closeBulkActionModal()
    await Promise.all([
      fetchContacts(),
      fetchStats()
    ])
  } catch (error) {
    console.error('Bulk action failed:', error)
    alert('Failed to perform bulk action. Please try again.')
  } finally {
    processing.value = false
  }
}

async function viewContactDetails(contactId) {
  try {
    const response = await adminAPI.contacts.get(contactId)
    selectedContact.value = response.data
  } catch (error) {
    console.error('Failed to fetch contact details:', error)
    alert('Failed to load contact details. Please try again.')
  }
}

function closeContactDetails() {
  selectedContact.value = null
}

async function showDNCList() {
  filters.value.status = 'dnc'
  filters.value.search = ''
  filters.value.tenant_id = ''
  pagination.value.page = 1
  await fetchContacts()
}

async function exportContacts() {
  try {
    const params = { ...filters.value }
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null) {
        delete params[key]
      }
    })

    const response = await adminAPI.contacts.export(params)

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `contacts_export_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to export contacts:', error)
    alert('Failed to export contacts. Please try again.')
  }
}

function previousPage() {
  if (pagination.value.page > 1) {
    pagination.value.page--
    fetchContacts()
  }
}

function nextPage() {
  if (pagination.value.page * pagination.value.limit < pagination.value.total) {
    pagination.value.page++
    fetchContacts()
  }
}

function getStatusBadgeClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    dnc: 'bg-red-100 text-red-800',
    bounced: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>
