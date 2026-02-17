<template>
  <div class="traditional-social-config">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Traditional Social Media</h1>
        <p class="page-description">
          Configure OAuth app credentials for Facebook, Twitter, Instagram, and LinkedIn integrations
        </p>
      </div>
      <button @click="refreshData" class="btn btn-secondary" :disabled="loading">
        <RefreshIcon class="btn-icon" :class="{ 'spin': loading }" />
        Refresh
      </button>
    </div>

    <!-- Stats Overview -->
    <div class="stats-grid" v-if="stats">
      <div class="stat-card">
        <div class="stat-icon icon-facebook">
          <FacebookIcon />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.accounts?.find(a => a.platform === 'facebook')?.total_accounts || 0 }}</span>
          <span class="stat-label">Facebook Pages</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-twitter">
          <TwitterIcon />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.accounts?.find(a => a.platform === 'twitter')?.total_accounts || 0 }}</span>
          <span class="stat-label">Twitter Accounts</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-instagram">
          <InstagramIcon />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.accounts?.find(a => a.platform === 'instagram')?.total_accounts || 0 }}</span>
          <span class="stat-label">Instagram Accounts</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-linkedin">
          <LinkedInIcon />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.accounts?.find(a => a.platform === 'linkedin')?.total_accounts || 0 }}</span>
          <span class="stat-label">LinkedIn Pages</span>
        </div>
      </div>
    </div>

    <!-- Platform Configurations -->
    <div class="platforms-section">
      <h2 class="section-title">Platform Configuration</h2>
      <p class="section-description">
        Configure OAuth app credentials for each platform. Customers will use these apps to connect their accounts.
      </p>

      <div class="platform-configs">
        <div v-for="platform in platforms" :key="platform.platform" class="platform-config-card">
          <div class="config-header">
            <div class="platform-info">
              <component :is="getPlatformIcon(platform.platform)" class="platform-icon" :class="`icon-${platform.platform}`" />
              <div>
                <h3>{{ getPlatformName(platform.platform) }}</h3>
                <span class="status-badge" :class="{ enabled: platform.is_enabled, disabled: !platform.is_enabled }">
                  {{ platform.is_enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
            </div>
            <div class="config-actions">
              <button
                @click="togglePlatform(platform)"
                class="btn btn-sm"
                :class="platform.is_enabled ? 'btn-warning' : 'btn-success'"
              >
                {{ platform.is_enabled ? 'Disable' : 'Enable' }}
              </button>
              <button @click="editPlatform(platform)" class="btn btn-sm btn-primary">
                Configure
              </button>
            </div>
          </div>

          <div class="config-details">
            <div class="detail-row">
              <span class="detail-label">App ID:</span>
              <span class="detail-value">{{ platform.app_id || 'Not configured' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">App Secret:</span>
              <span class="detail-value">{{ platform.has_app_secret ? '••••••••' : 'Not configured' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Webhook Verify Token:</span>
              <span class="detail-value">{{ platform.webhook_verify_token || 'Not set' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Connected Accounts (Cross-Tenant) -->
    <div class="accounts-section">
      <h2 class="section-title">Connected Accounts Across Tenants</h2>

      <!-- Filters -->
      <div class="filters-row">
        <select v-model="filters.platform" class="filter-select">
          <option value="">All Platforms</option>
          <option value="facebook">Facebook</option>
          <option value="twitter">Twitter</option>
          <option value="instagram">Instagram</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select v-model="filters.status" class="filter-select">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="error">Error</option>
        </select>
        <button @click="loadAccounts" class="btn btn-secondary btn-sm">
          Apply Filters
        </button>
      </div>

      <!-- Accounts Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Account</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Connected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in connectedAccounts" :key="`${account.platform}-${account.id}`">
              <td>
                <div class="platform-cell">
                  <component :is="getPlatformIcon(account.platform)" class="cell-icon" :class="`icon-${account.platform}`" />
                  <span>{{ getPlatformName(account.platform) }}</span>
                </div>
              </td>
              <td>
                <div class="account-cell">
                  <img v-if="account.profile_picture_url" :src="account.profile_picture_url" class="account-avatar" />
                  <span>{{ account.account_name }}</span>
                </div>
              </td>
              <td>{{ account.tenant_name || 'Unknown' }}</td>
              <td>
                <span class="status-badge" :class="account.status">
                  {{ account.status }}
                </span>
              </td>
              <td>{{ formatDate(account.created_at) }}</td>
              <td>
                <div class="action-buttons">
                  <button
                    @click="updateAccountStatus(account, account.status === 'active' ? 'disabled' : 'active')"
                    class="btn-icon"
                    :title="account.status === 'active' ? 'Disable' : 'Enable'"
                  >
                    <component :is="account.status === 'active' ? BanIcon : CheckIcon" class="icon-sm" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="connectedAccounts.length === 0">
              <td colspan="6" class="empty-row">
                No connected accounts found
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.totalPages > 1" class="pagination">
        <button
          @click="changePage(pagination.page - 1)"
          :disabled="pagination.page === 1"
          class="btn btn-sm btn-secondary"
        >
          Previous
        </button>
        <span class="page-info">
          Page {{ pagination.page }} of {{ pagination.totalPages }}
        </span>
        <button
          @click="changePage(pagination.page + 1)"
          :disabled="pagination.page === pagination.totalPages"
          class="btn btn-sm btn-secondary"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Edit Platform Modal -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Configure {{ getPlatformName(editingPlatform?.platform) }}</h3>
          <button @click="showEditModal = false" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>App ID / Client ID</label>
            <input v-model="editForm.app_id" type="text" class="form-input" placeholder="Enter App ID" />
          </div>
          <div class="form-group">
            <label>App Secret / Client Secret</label>
            <input v-model="editForm.app_secret" type="password" class="form-input" placeholder="Enter new secret (leave blank to keep existing)" />
          </div>
          <div class="form-group">
            <label>Webhook Verify Token</label>
            <input v-model="editForm.webhook_verify_token" type="text" class="form-input" placeholder="Optional webhook verification token" />
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="editForm.is_enabled" type="checkbox" />
              <span>Enable this platform</span>
            </label>
          </div>

          <div class="help-text" v-if="editingPlatform">
            <h4>Setup Instructions</h4>
            <p>{{ editingPlatform.setup_instructions || 'No setup instructions available.' }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showEditModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="savePlatformConfig" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Configuration' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, h } from 'vue'
import adminApi from '@/utils/api'

// Icons
const FacebookIcon = {
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' })
  ])
}

const TwitterIcon = {
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' })
  ])
}

const InstagramIcon = {
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' })
  ])
}

const LinkedInIcon = {
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' })
  ])
}

const RefreshIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' })
  ])
}

const BanIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' })
  ])
}

const CheckIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M5 13l4 4L19 7' })
  ])
}

// State
const loading = ref(false)
const saving = ref(false)
const platforms = ref([])
const connectedAccounts = ref([])
const stats = ref(null)
const showEditModal = ref(false)
const editingPlatform = ref(null)
const editForm = reactive({
  app_id: '',
  app_secret: '',
  webhook_verify_token: '',
  is_enabled: false
})

const filters = reactive({
  platform: '',
  status: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0
})

// Methods
function getPlatformIcon(platform) {
  const icons = { facebook: FacebookIcon, twitter: TwitterIcon, instagram: InstagramIcon, linkedin: LinkedInIcon }
  return icons[platform] || FacebookIcon
}

function getPlatformName(platform) {
  const names = { facebook: 'Facebook / Messenger', twitter: 'Twitter / X', instagram: 'Instagram', linkedin: 'LinkedIn' }
  return names[platform] || platform
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function refreshData() {
  loading.value = true
  try {
    await Promise.all([loadPlatforms(), loadStats(), loadAccounts()])
  } finally {
    loading.value = false
  }
}

async function loadPlatforms() {
  try {
    const response = await adminApi.get('/admin/traditional-social/platforms')
    platforms.value = response.data.platforms || []
  } catch (error) {
    console.error('Failed to load platforms:', error)
  }
}

async function loadStats() {
  try {
    const response = await adminApi.get('/admin/traditional-social/stats')
    stats.value = response.data.stats || null
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function loadAccounts() {
  try {
    const params = new URLSearchParams()
    params.append('page', pagination.page)
    params.append('limit', pagination.limit)
    if (filters.platform) params.append('platform', filters.platform)
    if (filters.status) params.append('status', filters.status)

    const response = await adminApi.get(`/admin/traditional-social/accounts?${params.toString()}`)
    connectedAccounts.value = response.data.accounts || []
    Object.assign(pagination, response.data.pagination || {})
  } catch (error) {
    console.error('Failed to load accounts:', error)
  }
}

async function togglePlatform(platform) {
  try {
    await adminApi.patch(`/admin/traditional-social/platforms/${platform.platform}/toggle`, {
      is_enabled: !platform.is_enabled
    })
    await loadPlatforms()
  } catch (error) {
    console.error('Failed to toggle platform:', error)
    alert('Failed to toggle platform: ' + (error.response?.data?.error || error.message))
  }
}

function editPlatform(platform) {
  editingPlatform.value = platform
  editForm.app_id = platform.app_id || ''
  editForm.app_secret = ''
  editForm.webhook_verify_token = platform.webhook_verify_token || ''
  editForm.is_enabled = platform.is_enabled
  showEditModal.value = true
}

async function savePlatformConfig() {
  if (!editForm.app_id) {
    alert('App ID is required')
    return
  }
  if (!editForm.app_secret && !editingPlatform.value?.has_app_secret) {
    alert('App Secret is required')
    return
  }

  saving.value = true
  try {
    const payload = {
      app_id: editForm.app_id,
      is_enabled: editForm.is_enabled
    }
    if (editForm.app_secret) {
      payload.app_secret = editForm.app_secret
    }
    if (editForm.webhook_verify_token) {
      payload.webhook_verify_token = editForm.webhook_verify_token
    }

    await adminApi.put(`/admin/traditional-social/platforms/${editingPlatform.value.platform}`, payload)
    showEditModal.value = false
    await loadPlatforms()
  } catch (error) {
    console.error('Failed to save config:', error)
    alert('Failed to save: ' + (error.response?.data?.error || error.message))
  } finally {
    saving.value = false
  }
}

async function updateAccountStatus(account, newStatus) {
  try {
    await adminApi.patch(`/admin/traditional-social/accounts/${account.platform}/${account.id}/status`, {
      status: newStatus
    })
    await loadAccounts()
  } catch (error) {
    console.error('Failed to update account status:', error)
    alert('Failed to update: ' + (error.response?.data?.error || error.message))
  }
}

function changePage(newPage) {
  pagination.page = newPage
  loadAccounts()
}

onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.traditional-social-config {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.page-description {
  color: var(--text-secondary);
  font-size: 14px;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon svg {
  width: 24px;
  height: 24px;
}

.icon-facebook { background: rgba(24, 119, 242, 0.1); color: #1877f2; }
.icon-twitter { background: rgba(0, 0, 0, 0.1); color: var(--text-primary); }
.icon-instagram { background: linear-gradient(135deg, rgba(131, 58, 180, 0.1), rgba(253, 29, 29, 0.1)); color: #e1306c; }
.icon-linkedin { background: rgba(0, 119, 181, 0.1); color: #0077b5; }

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Sections */
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.section-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 20px;
}

.platforms-section {
  margin-bottom: 40px;
}

/* Platform Config Cards */
.platform-configs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .platform-configs {
    grid-template-columns: 1fr;
  }
}

.platform-config-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.platform-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.platform-icon {
  width: 40px;
  height: 40px;
  padding: 8px;
  border-radius: 10px;
}

.platform-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: capitalize;
}

.status-badge.enabled, .status-badge.active {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-badge.disabled {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.status-badge.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.config-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.detail-label {
  color: var(--text-secondary);
}

.detail-value {
  color: var(--text-primary);
  font-family: monospace;
}

/* Accounts Section */
.accounts-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.filters-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}

/* Table */
.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.data-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.platform-cell, .account-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-icon {
  width: 20px;
  height: 20px;
}

.account-avatar {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.empty-row {
  text-align: center;
  color: var(--text-muted);
  padding: 40px;
}

.action-buttons {
  display: flex;
  gap: 4px;
}

.btn-icon {
  padding: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-secondary);
}

.btn-icon:hover {
  background: var(--bg-tertiary);
}

.icon-sm {
  width: 16px;
  height: 16px;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
}

.page-info {
  color: var(--text-secondary);
  font-size: 13px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.btn-warning {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--card-bg);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.help-text {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.help-text h4 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.help-text p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--border-color);
}
</style>
