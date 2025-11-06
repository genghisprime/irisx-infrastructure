<template>
  <div class="contacts-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Contacts</h1>
        <p class="page-description">Manage your contact database</p>
      </div>
      <div class="header-actions">
        <button @click="showImportModal = true" class="btn-secondary">
          <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" class="mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Import Contacts
        </button>
        <button @click="openCreateModal" class="btn-primary">
          <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" class="mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Contact
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-blue-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Total Contacts</p>
          <p class="stat-value">{{ stats.total }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-green-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Active</p>
          <p class="stat-value text-green-600">{{ stats.active }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-yellow-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Unsubscribed</p>
          <p class="stat-value text-yellow-600">{{ stats.unsubscribed }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-purple-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Tagged</p>
          <p class="stat-value text-purple-600">{{ stats.tagged }}</p>
        </div>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="filters-section">
      <div class="search-box">
        <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search contacts by name, email, or phone..."
          class="search-input"
        />
      </div>

      <div class="filter-group">
        <select v-model="filterStatus" class="filter-select">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
        </select>

        <select v-model="filterList" class="filter-select">
          <option value="">All Lists</option>
          <option v-for="list in lists" :key="list.id" :value="list.id">
            {{ list.name }}
          </option>
        </select>

        <select v-model="filterTag" class="filter-select">
          <option value="">All Tags</option>
          <option v-for="tag in tags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>

        <button @click="clearFilters" class="btn-text">Clear Filters</button>
      </div>
    </div>

    <!-- Contacts Table -->
    <div class="table-container">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading contacts...</p>
      </div>

      <div v-else-if="filteredContacts.length === 0" class="empty-state">
        <svg style="width: 48px; height: 48px; min-width: 48px; max-width: 48px;" class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3>No contacts found</h3>
        <p>{{ searchQuery ? 'Try adjusting your search or filters' : 'Get started by adding your first contact' }}</p>
        <button @click="openCreateModal" class="btn-primary mt-4">
          Add Contact
        </button>
      </div>

      <table v-else class="data-table">
        <thead>
          <tr>
            <th>
              <input type="checkbox" @change="toggleSelectAll" :checked="allSelected" />
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Lists</th>
            <th>Added</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="contact in paginatedContacts" :key="contact.id">
            <td>
              <input type="checkbox" v-model="selectedContacts" :value="contact.id" />
            </td>
            <td>
              <div class="contact-name">
                <div class="contact-avatar">
                  {{ getInitials(contact.first_name, contact.last_name) }}
                </div>
                <span>{{ contact.first_name }} {{ contact.last_name }}</span>
              </div>
            </td>
            <td>{{ contact.email || '-' }}</td>
            <td>{{ contact.phone || '-' }}</td>
            <td>
              <span class="status-badge" :class="getStatusClass(contact.status)">
                {{ contact.status }}
              </span>
            </td>
            <td>
              <div class="tags-cell">
                <span v-for="tag in contact.tags?.slice(0, 2)" :key="tag" class="tag">
                  {{ tag }}
                </span>
                <span v-if="contact.tags?.length > 2" class="tag-more">
                  +{{ contact.tags.length - 2 }}
                </span>
              </div>
            </td>
            <td>{{ contact.lists?.length || 0 }} lists</td>
            <td>{{ formatDate(contact.created_at) }}</td>
            <td>
              <div class="action-buttons">
                <button @click="editContact(contact)" class="btn-icon" title="Edit">
                  <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button @click="deleteContact(contact)" class="btn-icon text-red-600" title="Delete">
                  <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="filteredContacts.length > 0" class="pagination">
        <div class="pagination-info">
          Showing {{ startIndex + 1 }}-{{ Math.min(endIndex, filteredContacts.length) }} of {{ filteredContacts.length }} contacts
        </div>
        <div class="pagination-controls">
          <button @click="previousPage" :disabled="currentPage === 1" class="btn-icon">
            <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="page-indicator">Page {{ currentPage }} of {{ totalPages }}</span>
          <button @click="nextPage" :disabled="currentPage === totalPages" class="btn-icon">
            <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Bulk Actions Bar (shown when contacts are selected) -->
    <transition name="slide-up">
      <div v-if="selectedContacts.length > 0" class="bulk-actions-bar">
        <div class="bulk-actions-content">
          <span class="bulk-count">{{ selectedContacts.length }} selected</span>
          <div class="bulk-buttons">
            <button @click="bulkAddToList" class="btn-secondary">Add to List</button>
            <button @click="bulkAddTag" class="btn-secondary">Add Tag</button>
            <button @click="bulkExport" class="btn-secondary">Export</button>
            <button @click="bulkDelete" class="btn-danger">Delete</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Create/Edit Contact Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content modal-md">
        <div class="modal-header">
          <h2>{{ editingContact ? 'Edit Contact' : 'Add New Contact' }}</h2>
          <button @click="closeModal" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveContact">
            <div class="form-grid">
              <div class="form-group">
                <label>First Name *</label>
                <input v-model="formData.first_name" type="text" required class="form-input" />
              </div>
              <div class="form-group">
                <label>Last Name *</label>
                <input v-model="formData.last_name" type="text" required class="form-input" />
              </div>
            </div>

            <div class="form-group">
              <label>Email</label>
              <input v-model="formData.email" type="email" class="form-input" />
            </div>

            <div class="form-group">
              <label>Phone</label>
              <input v-model="formData.phone" type="tel" class="form-input" placeholder="+1234567890" />
            </div>

            <div class="form-group">
              <label>Status</label>
              <select v-model="formData.status" class="form-select">
                <option value="active">Active</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>

            <div class="form-group">
              <label>Tags (comma separated)</label>
              <input v-model="tagsInput" type="text" class="form-input" placeholder="customer, vip, lead" />
            </div>

            <div class="form-group">
              <label>Company</label>
              <input v-model="formData.company" type="text" class="form-input" />
            </div>

            <div class="form-group">
              <label>Notes</label>
              <textarea v-model="formData.notes" rows="3" class="form-textarea"></textarea>
            </div>

            <div class="modal-actions">
              <button type="button" @click="closeModal" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">
                {{ editingContact ? 'Save Changes' : 'Add Contact' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal-content modal-md">
        <div class="modal-header">
          <h2>Import Contacts</h2>
          <button @click="showImportModal = false" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="text-center py-8">
            <svg style="width: 48px; height: 48px; min-width: 48px; max-width: 48px;" class="mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-gray-600 mb-4">Upload a CSV file with your contacts</p>
            <router-link to="/dashboard/data-import" class="btn-primary">
              Go to Data Import
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

// State
const contacts = ref([])
const lists = ref([])
const tags = ref([])
const loading = ref(false)
const searchQuery = ref('')
const filterStatus = ref('')
const filterList = ref('')
const filterTag = ref('')
const selectedContacts = ref([])
const showModal = ref(false)
const showImportModal = ref(false)
const editingContact = ref(null)
const currentPage = ref(1)
const perPage = ref(25)

// Form data
const formData = ref({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  status: 'active',
  company: '',
  notes: '',
  tags: []
})
const tagsInput = ref('')

// Stats
const stats = computed(() => ({
  total: contacts.value.length,
  active: contacts.value.filter(c => c.status === 'active').length,
  unsubscribed: contacts.value.filter(c => c.status === 'unsubscribed').length,
  tagged: contacts.value.filter(c => c.tags && c.tags.length > 0).length
}))

// Filtered contacts
const filteredContacts = computed(() => {
  let filtered = contacts.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.first_name?.toLowerCase().includes(query) ||
      c.last_name?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.phone?.includes(query)
    )
  }

  if (filterStatus.value) {
    filtered = filtered.filter(c => c.status === filterStatus.value)
  }

  if (filterList.value) {
    filtered = filtered.filter(c => c.lists?.includes(filterList.value))
  }

  if (filterTag.value) {
    filtered = filtered.filter(c => c.tags?.includes(filterTag.value))
  }

  return filtered
})

// Pagination
const totalPages = computed(() => Math.ceil(filteredContacts.value.length / perPage.value))
const startIndex = computed(() => (currentPage.value - 1) * perPage.value)
const endIndex = computed(() => startIndex.value + perPage.value)
const paginatedContacts = computed(() =>
  filteredContacts.value.slice(startIndex.value, endIndex.value)
)

const allSelected = computed(() =>
  selectedContacts.value.length === paginatedContacts.value.length &&
  paginatedContacts.value.length > 0
)

// Methods
async function loadContacts() {
  loading.value = true
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/contacts`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    if (response.ok) {
      const data = await response.json()
      contacts.value = data.contacts || []

      // Extract unique tags
      const allTags = new Set()
      contacts.value.forEach(c => {
        c.tags?.forEach(tag => allTags.add(tag))
      })
      tags.value = Array.from(allTags)
    }
  } catch (error) {
    console.error('Failed to load contacts:', error)
  } finally {
    loading.value = false
  }
}

async function loadLists() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/lists`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    if (response.ok) {
      const data = await response.json()
      lists.value = data.lists || []
    }
  } catch (error) {
    console.error('Failed to load lists:', error)
  }
}

function openCreateModal() {
  editingContact.value = null
  formData.value = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    status: 'active',
    company: '',
    notes: '',
    tags: []
  }
  tagsInput.value = ''
  showModal.value = true
}

function editContact(contact) {
  editingContact.value = contact
  formData.value = { ...contact }
  tagsInput.value = contact.tags?.join(', ') || ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingContact.value = null
}

async function saveContact() {
  // Parse tags from input
  formData.value.tags = tagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(t => t)

  try {
    const url = editingContact.value
      ? `${import.meta.env.VITE_API_BASE_URL}/v1/contacts/${editingContact.value.id}`
      : `${import.meta.env.VITE_API_BASE_URL}/v1/contacts`

    const response = await fetch(url, {
      method: editingContact.value ? 'PUT' : 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    })

    if (response.ok) {
      await loadContacts()
      closeModal()
    }
  } catch (error) {
    console.error('Failed to save contact:', error)
    alert('Failed to save contact')
  }
}

async function deleteContact(contact) {
  if (!confirm(`Delete ${contact.first_name} ${contact.last_name}?`)) return

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/v1/contacts/${contact.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      }
    )

    if (response.ok) {
      await loadContacts()
    }
  } catch (error) {
    console.error('Failed to delete contact:', error)
    alert('Failed to delete contact')
  }
}

function toggleSelectAll(event) {
  if (event.target.checked) {
    selectedContacts.value = paginatedContacts.value.map(c => c.id)
  } else {
    selectedContacts.value = []
  }
}

function bulkAddToList() {
  alert('Bulk add to list - Coming soon')
}

function bulkAddTag() {
  alert('Bulk add tag - Coming soon')
}

function bulkExport() {
  alert('Bulk export - Coming soon')
}

async function bulkDelete() {
  if (!confirm(`Delete ${selectedContacts.value.length} contacts?`)) return
  alert('Bulk delete - Coming soon')
}

function clearFilters() {
  searchQuery.value = ''
  filterStatus.value = ''
  filterList.value = ''
  filterTag.value = ''
}

function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
}

function getStatusClass(status) {
  const classes = {
    active: 'status-success',
    unsubscribed: 'status-warning',
    bounced: 'status-danger'
  }
  return classes[status] || 'status-default'
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function previousPage() {
  if (currentPage.value > 1) currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}

onMounted(() => {
  loadContacts()
  loadLists()
})
</script>

<style scoped>
.contacts-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
}

.page-description {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 4px 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.filters-section {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.search-box {
  position: relative;
  margin-bottom: 12px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
}

.search-input {
  width: 100%;
  padding: 10px 10px 10px 40px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.filter-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: #f9fafb;
  padding: 12px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e5e7eb;
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
  color: #374151;
}

.contact-name {
  display: flex;
  align-items: center;
  gap: 10px;
}

.contact-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #4f46e5;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.status-success {
  background: #d1fae5;
  color: #065f46;
}

.status-warning {
  background: #fef3c7;
  color: #92400e;
}

.status-danger {
  background: #fee2e2;
  color: #991b1b;
}

.tags-cell {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e0e7ff;
  color: #4f46e5;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.tag-more {
  display: inline-block;
  padding: 2px 8px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
}

.pagination-info {
  font-size: 14px;
  color: #6b7280;
}

.pagination-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.page-indicator {
  font-size: 14px;
  color: #374151;
}

.bulk-actions-bar {
  position: fixed;
  bottom: 0;
  left: 256px;
  right: 0;
  background: white;
  border-top: 2px solid #4f46e5;
  box-shadow: 0 -4px 6px rgba(0, 0, 0, 0.1);
  z-index: 50;
}

.bulk-actions-content {
  padding: 16px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bulk-count {
  font-size: 14px;
  font-weight: 600;
  color: #4f46e5;
}

.bulk-buttons {
  display: flex;
  gap: 12px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.loading-state,
.empty-state {
  padding: 60px 20px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  color: #9ca3af;
  margin: 0 auto 16px;
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

/* Utility classes */
.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #4338ca;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #f9fafb;
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #b91c1c;
}

.btn-text {
  padding: 8px 12px;
  background: none;
  color: #4f46e5;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-text:hover {
  text-decoration: underline;
}

.btn-icon {
  padding: 6px;
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f3f4f6;
  color: #111827;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mr-2 {
  margin-right: 8px;
}

.mt-4 {
  margin-top: 16px;
}

.mx-auto {
  margin-left: auto;
  margin-right: auto;
}

.mb-4 {
  margin-bottom: 16px;
}

.py-8 {
  padding-top: 32px;
  padding-bottom: 32px;
}

.text-center {
  text-align: center;
}

.text-red-600 {
  color: #dc2626;
}

.text-gray-400 {
  color: #9ca3af;
}

.text-gray-600 {
  color: #4b5563;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
  max-height: 90vh;
  overflow-y: auto;
}

.modal-md {
  width: 90%;
  max-width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #f3f4f6;
  color: #111827;
}

.modal-body {
  padding: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
