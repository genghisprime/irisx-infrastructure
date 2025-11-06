<template>
  <div class="lists-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Contact Lists</h1>
        <p class="page-description">Organize contacts into targeted segments</p>
      </div>
      <button @click="openCreateModal" class="btn-primary">
        <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" class="mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create List
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-blue-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Total Lists</p>
          <p class="stat-value">{{ stats.total }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-green-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Total Contacts</p>
          <p class="stat-value text-green-600">{{ stats.contacts }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-purple-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Active Lists</p>
          <p class="stat-value text-purple-600">{{ stats.active }}</p>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-orange-100">
          <svg style="width: 24px; height: 24px; min-width: 24px; max-width: 24px;" class="text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div class="stat-content">
          <p class="stat-label">Avg List Size</p>
          <p class="stat-value text-orange-600">{{ stats.average }}</p>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="search-section">
      <div class="search-box">
        <svg style="width: 20px; height: 20px; min-width: 20px; max-width: 20px;" class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search lists by name or description..."
          class="search-input"
        />
      </div>
    </div>

    <!-- Lists Grid -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading lists...</p>
    </div>

    <div v-else-if="filteredLists.length === 0" class="empty-state">
      <svg style="width: 48px; height: 48px; min-width: 48px; max-width: 48px;" class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <h3>No lists found</h3>
      <p>{{ searchQuery ? 'Try adjusting your search' : 'Create your first contact list to get started' }}</p>
      <button @click="openCreateModal" class="btn-primary mt-4">
        Create List
      </button>
    </div>

    <div v-else class="lists-grid">
      <div v-for="list in filteredLists" :key="list.id" class="list-card">
        <div class="list-card-header">
          <div class="list-info">
            <h3 class="list-name">{{ list.name }}</h3>
            <p class="list-description">{{ list.description || 'No description' }}</p>
          </div>
          <div class="list-actions">
            <button @click="editList(list)" class="btn-icon" title="Edit">
              <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button @click="deleteList(list)" class="btn-icon text-red-600" title="Delete">
              <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <div class="list-stats">
          <div class="list-stat">
            <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" class="text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>{{ list.contact_count || 0 }} contacts</span>
          </div>
          <div class="list-stat">
            <svg style="width: 16px; height: 16px; min-width: 16px; max-width: 16px;" class="text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{{ formatDate(list.created_at) }}</span>
          </div>
        </div>

        <div class="list-card-footer">
          <router-link :to="`/dashboard/contacts?list=${list.id}`" class="btn-text">
            View Contacts →
          </router-link>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content modal-md">
        <div class="modal-header">
          <h2>{{ editingList ? 'Edit List' : 'Create New List' }}</h2>
          <button @click="closeModal" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveList">
            <div class="form-group">
              <label>List Name *</label>
              <input v-model="formData.name" type="text" required class="form-input" placeholder="e.g., VIP Customers" />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea v-model="formData.description" rows="3" class="form-textarea" placeholder="What is this list for?"></textarea>
            </div>

            <div class="form-group">
              <label>Status</label>
              <select v-model="formData.status" class="form-select">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div class="modal-actions">
              <button type="button" @click="closeModal" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-primary">
                {{ editingList ? 'Save Changes' : 'Create List' }}
              </button>
            </div>
          </form>
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
const lists = ref([])
const loading = ref(false)
const searchQuery = ref('')
const showModal = ref(false)
const editingList = ref(null)

// Form data
const formData = ref({
  name: '',
  description: '',
  status: 'active'
})

// Stats
const stats = computed(() => {
  const totalContacts = lists.value.reduce((sum, list) => sum + (list.contact_count || 0), 0)
  const activeLists = lists.value.filter(l => l.status === 'active').length
  const avgSize = lists.value.length > 0 ? Math.round(totalContacts / lists.value.length) : 0

  return {
    total: lists.value.length,
    contacts: totalContacts,
    active: activeLists,
    average: avgSize
  }
})

// Filtered lists
const filteredLists = computed(() => {
  if (!searchQuery.value) return lists.value

  const query = searchQuery.value.toLowerCase()
  return lists.value.filter(list =>
    list.name?.toLowerCase().includes(query) ||
    list.description?.toLowerCase().includes(query)
  )
})

// Methods
async function loadLists() {
  loading.value = true
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
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  editingList.value = null
  formData.value = {
    name: '',
    description: '',
    status: 'active'
  }
  showModal.value = true
}

function editList(list) {
  editingList.value = list
  formData.value = { ...list }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingList.value = null
}

async function saveList() {
  try {
    const url = editingList.value
      ? `${import.meta.env.VITE_API_BASE_URL}/v1/lists/${editingList.value.id}`
      : `${import.meta.env.VITE_API_BASE_URL}/v1/lists`

    const response = await fetch(url, {
      method: editingList.value ? 'PUT' : 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    })

    if (response.ok) {
      await loadLists()
      closeModal()
    }
  } catch (error) {
    console.error('Failed to save list:', error)
    alert('Failed to save list')
  }
}

async function deleteList(list) {
  if (!confirm(`Delete "${list.name}"? This will not delete the contacts.`)) return

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/v1/lists/${list.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      }
    )

    if (response.ok) {
      await loadLists()
    }
  } catch (error) {
    console.error('Failed to delete list:', error)
    alert('Failed to delete list')
  }
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

onMounted(() => {
  loadLists()
})
</script>

<style scoped>
.lists-page {
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

.search-section {
  margin-bottom: 24px;
}

.search-box {
  position: relative;
  max-width: 500px;
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
  background: white;
}

.lists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.list-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.list-card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.list-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.list-info {
  flex: 1;
  min-width: 0;
}

.list-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-description {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.list-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
}

.list-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #6b7280;
}

.list-card-footer {
  display: flex;
  justify-content: flex-end;
}

.loading-state,
.empty-state {
  padding: 60px 20px;
  text-align: center;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

.btn-text {
  padding: 0;
  background: none;
  color: #4f46e5;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
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

.mr-2 {
  margin-right: 8px;
}

.mt-4 {
  margin-top: 16px;
}

.text-red-600 {
  color: #dc2626;
}

.text-gray-400 {
  color: #9ca3af;
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
  max-width: 500px;
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
