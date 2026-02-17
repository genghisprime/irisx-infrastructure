<template>
  <div class="social-connect">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Connect Social Accounts</h1>
        <p class="page-description">
          Connect your Facebook, Twitter, Instagram, and LinkedIn accounts to manage conversations
        </p>
      </div>
    </div>

    <!-- Success/Error Messages -->
    <div v-if="successMessage" class="alert alert-success">
      <CheckCircleIcon class="alert-icon" />
      <span>{{ successMessage }}</span>
      <button @click="successMessage = ''" class="alert-close">&times;</button>
    </div>

    <div v-if="errorMessage" class="alert alert-error">
      <ExclamationCircleIcon class="alert-icon" />
      <span>{{ errorMessage }}</span>
      <button @click="errorMessage = ''" class="alert-close">&times;</button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading connected accounts...</p>
    </div>

    <!-- Main Content -->
    <div v-else class="content-grid">
      <!-- Available Platforms -->
      <div class="platforms-section">
        <h2 class="section-title">Available Platforms</h2>
        <div class="platform-cards">
          <div
            v-for="platform in availablePlatforms"
            :key="platform.id"
            class="platform-card"
            :class="{ disabled: !platform.enabled }"
          >
            <div class="platform-header">
              <component :is="platform.icon" class="platform-icon" :class="`icon-${platform.id}`" />
              <div class="platform-info">
                <h3>{{ platform.name }}</h3>
                <span v-if="platform.enabled" class="status-badge enabled">Available</span>
                <span v-else class="status-badge disabled">Coming Soon</span>
              </div>
            </div>
            <p class="platform-description">{{ platform.description }}</p>
            <div class="platform-actions">
              <button
                v-if="platform.enabled"
                @click="connectPlatform(platform.id)"
                :disabled="connecting === platform.id"
                class="btn btn-primary"
              >
                <span v-if="connecting === platform.id">Connecting...</span>
                <span v-else>
                  <PlusIcon class="btn-icon" />
                  Connect {{ platform.name }}
                </span>
              </button>
              <button v-else disabled class="btn btn-disabled">
                Not Available
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Connected Accounts -->
      <div class="connected-section">
        <h2 class="section-title">
          Connected Accounts
          <span class="account-count">{{ totalConnectedAccounts }}</span>
        </h2>

        <!-- Facebook Pages -->
        <div v-if="accounts.facebook.length > 0" class="account-group">
          <div class="group-header">
            <FacebookIcon class="group-icon icon-facebook" />
            <h3>Facebook Pages</h3>
          </div>
          <div class="account-list">
            <div v-for="page in accounts.facebook" :key="page.id" class="account-item">
              <img
                v-if="page.profile_picture_url"
                :src="page.profile_picture_url"
                class="account-avatar"
                :alt="page.page_name"
              />
              <div v-else class="account-avatar-placeholder">
                <FacebookIcon class="icon-sm" />
              </div>
              <div class="account-info">
                <span class="account-name">{{ page.page_name }}</span>
                <span class="account-meta">Connected {{ formatDate(page.created_at) }}</span>
              </div>
              <div class="account-status" :class="page.status">
                {{ page.status }}
              </div>
              <button @click="disconnectAccount('facebook', page.id)" class="btn-icon-only btn-danger">
                <TrashIcon class="icon-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- Twitter Accounts -->
        <div v-if="accounts.twitter.length > 0" class="account-group">
          <div class="group-header">
            <TwitterIcon class="group-icon icon-twitter" />
            <h3>Twitter Accounts</h3>
          </div>
          <div class="account-list">
            <div v-for="account in accounts.twitter" :key="account.id" class="account-item">
              <img
                v-if="account.profile_image_url"
                :src="account.profile_image_url"
                class="account-avatar"
                :alt="account.username"
              />
              <div v-else class="account-avatar-placeholder">
                <TwitterIcon class="icon-sm" />
              </div>
              <div class="account-info">
                <span class="account-name">@{{ account.username }}</span>
                <span class="account-meta">{{ account.display_name }}</span>
              </div>
              <div class="account-status" :class="account.status">
                {{ account.status }}
              </div>
              <button @click="disconnectAccount('twitter', account.id)" class="btn-icon-only btn-danger">
                <TrashIcon class="icon-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- Instagram Accounts -->
        <div v-if="accounts.instagram.length > 0" class="account-group">
          <div class="group-header">
            <InstagramIcon class="group-icon icon-instagram" />
            <h3>Instagram Accounts</h3>
          </div>
          <div class="account-list">
            <div v-for="account in accounts.instagram" :key="account.id" class="account-item">
              <img
                v-if="account.profile_picture_url"
                :src="account.profile_picture_url"
                class="account-avatar"
                :alt="account.username"
              />
              <div v-else class="account-avatar-placeholder">
                <InstagramIcon class="icon-sm" />
              </div>
              <div class="account-info">
                <span class="account-name">@{{ account.username }}</span>
                <span class="account-meta">{{ account.display_name }}</span>
              </div>
              <div class="account-status" :class="account.status">
                {{ account.status }}
              </div>
              <button @click="disconnectAccount('instagram', account.id)" class="btn-icon-only btn-danger">
                <TrashIcon class="icon-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- LinkedIn Pages -->
        <div v-if="accounts.linkedin.length > 0" class="account-group">
          <div class="group-header">
            <LinkedInIcon class="group-icon icon-linkedin" />
            <h3>LinkedIn Pages</h3>
          </div>
          <div class="account-list">
            <div v-for="page in accounts.linkedin" :key="page.id" class="account-item">
              <img
                v-if="page.logo_url"
                :src="page.logo_url"
                class="account-avatar"
                :alt="page.organization_name"
              />
              <div v-else class="account-avatar-placeholder">
                <LinkedInIcon class="icon-sm" />
              </div>
              <div class="account-info">
                <span class="account-name">{{ page.organization_name }}</span>
                <span class="account-meta">{{ page.vanity_name }}</span>
              </div>
              <div class="account-status" :class="page.status">
                {{ page.status }}
              </div>
              <button @click="disconnectAccount('linkedin', page.id)" class="btn-icon-only btn-danger">
                <TrashIcon class="icon-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- No Accounts -->
        <div v-if="totalConnectedAccounts === 0" class="empty-state">
          <div class="empty-icon">
            <LinkIcon class="icon-lg" />
          </div>
          <h3>No accounts connected</h3>
          <p>Connect your social media accounts to start managing conversations from a single inbox.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/utils/api'

// Icons (inline SVG components)
const FacebookIcon = {
  render: () => h('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' })
  ])
}

const TwitterIcon = {
  render: () => h('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' })
  ])
}

const InstagramIcon = {
  render: () => h('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' })
  ])
}

const LinkedInIcon = {
  render: () => h('svg', { class: 'icon', viewBox: '0 0 24 24', fill: 'currentColor' }, [
    h('path', { d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' })
  ])
}

const CheckCircleIcon = {
  render: () => h('svg', { class: 'icon', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' })
  ])
}

const ExclamationCircleIcon = {
  render: () => h('svg', { class: 'icon', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' })
  ])
}

const PlusIcon = {
  render: () => h('svg', { class: 'icon', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 4v16m8-8H4' })
  ])
}

const TrashIcon = {
  render: () => h('svg', { class: 'icon', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
  ])
}

const LinkIcon = {
  render: () => h('svg', { class: 'icon', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' })
  ])
}

// State
const route = useRoute()
const loading = ref(true)
const connecting = ref(null)
const successMessage = ref('')
const errorMessage = ref('')
const platforms = ref([])
const accounts = ref({
  facebook: [],
  twitter: [],
  instagram: [],
  linkedin: []
})

// Available platforms configuration
const availablePlatforms = computed(() => [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: FacebookIcon,
    description: 'Connect Facebook Pages to manage Messenger conversations',
    enabled: platforms.value.find(p => p.platform === 'facebook')?.enabled ?? false
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: TwitterIcon,
    description: 'Connect Twitter accounts to manage Direct Messages',
    enabled: platforms.value.find(p => p.platform === 'twitter')?.enabled ?? false
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: InstagramIcon,
    description: 'Connect Instagram Business accounts for DM management',
    enabled: platforms.value.find(p => p.platform === 'instagram')?.enabled ?? false
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: LinkedInIcon,
    description: 'Connect LinkedIn Organization pages',
    enabled: platforms.value.find(p => p.platform === 'linkedin')?.enabled ?? false
  }
])

const totalConnectedAccounts = computed(() => {
  return accounts.value.facebook.length +
         accounts.value.twitter.length +
         accounts.value.instagram.length +
         accounts.value.linkedin.length
})

// Methods
async function loadData() {
  try {
    loading.value = true

    // Load available platforms
    const platformsResponse = await api.get('/v1/social/oauth/platforms')
    platforms.value = platformsResponse.data.platforms || []

    // Load connected accounts
    const accountsResponse = await api.get('/v1/social/oauth/accounts')
    accounts.value = accountsResponse.data.accounts || {
      facebook: [],
      twitter: [],
      instagram: [],
      linkedin: []
    }
  } catch (error) {
    console.error('Failed to load data:', error)
    errorMessage.value = 'Failed to load social accounts'
  } finally {
    loading.value = false
  }
}

async function connectPlatform(platformId) {
  try {
    connecting.value = platformId

    const response = await api.get(`/v1/social/oauth/${platformId}/connect`)

    if (response.data.auth_url) {
      // Redirect to OAuth provider
      window.location.href = response.data.auth_url
    }
  } catch (error) {
    console.error(`Failed to connect ${platformId}:`, error)
    errorMessage.value = `Failed to connect ${platformId}: ${error.response?.data?.error || error.message}`
    connecting.value = null
  }
}

async function disconnectAccount(platform, accountId) {
  if (!confirm(`Are you sure you want to disconnect this ${platform} account?`)) {
    return
  }

  try {
    await api.delete(`/v1/social/oauth/accounts/${platform}/${accountId}`)
    successMessage.value = `${platform} account disconnected successfully`
    await loadData()
  } catch (error) {
    console.error(`Failed to disconnect ${platform} account:`, error)
    errorMessage.value = `Failed to disconnect: ${error.response?.data?.error || error.message}`
  }
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Handle OAuth callback messages
function handleOAuthCallback() {
  const query = route.query
  if (query.success) {
    const pageCount = query.pages || query.accounts || 1
    successMessage.value = `Successfully connected ${query.success}! ${pageCount > 1 ? `(${pageCount} accounts)` : ''}`
  }
  if (query.error) {
    const errorMessages = {
      invalid_state: 'OAuth session expired. Please try again.',
      token_exchange_failed: 'Failed to complete authentication. Please try again.',
      server_error: 'An error occurred. Please try again later.'
    }
    errorMessage.value = errorMessages[query.error] || `Connection failed: ${query.error}`
  }
}

onMounted(() => {
  handleOAuthCallback()
  loadData()
})
</script>

<style scoped>
.social-connect {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
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

/* Alerts */
.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

.alert-success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.alert-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.alert-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.alert-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
}

.alert-close:hover {
  opacity: 1;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: var(--text-secondary);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Content Grid */
.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

/* Sections */
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-count {
  background: var(--primary);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* Platform Cards */
.platform-cards {
  display: grid;
  gap: 16px;
}

.platform-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.platform-card:hover:not(.disabled) {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.platform-card.disabled {
  opacity: 0.6;
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.platform-icon {
  width: 40px;
  height: 40px;
  padding: 8px;
  border-radius: 10px;
}

.icon-facebook { background: rgba(24, 119, 242, 0.1); color: #1877f2; }
.icon-twitter { background: rgba(0, 0, 0, 0.1); color: var(--text-primary); }
.icon-instagram { background: linear-gradient(135deg, rgba(131, 58, 180, 0.1), rgba(253, 29, 29, 0.1)); color: #e1306c; }
.icon-linkedin { background: rgba(0, 119, 181, 0.1); color: #0077b5; }

.platform-info h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-badge.enabled {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.status-badge.disabled {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.platform-description {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.platform-actions {
  display: flex;
  justify-content: flex-end;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-disabled {
  background: var(--bg-tertiary);
  color: var(--text-muted);
  cursor: not-allowed;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.btn-icon-only {
  padding: 8px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.btn-icon-only:hover {
  background: var(--bg-tertiary);
}

.btn-icon-only.btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Connected Accounts */
.connected-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
}

.account-group {
  margin-bottom: 24px;
}

.account-group:last-child {
  margin-bottom: 0;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.group-icon {
  width: 24px;
  height: 24px;
}

.group-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  transition: background 0.2s;
}

.account-item:hover {
  background: var(--bg-tertiary);
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}

.account-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  display: block;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-meta {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
}

.account-status {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  text-transform: capitalize;
}

.account-status.active {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.account-status.disabled {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.account-status.error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 16px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.icon-lg {
  width: 30px;
  height: 30px;
}

.icon-sm {
  width: 16px;
  height: 16px;
}

.empty-state h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 13px;
  line-height: 1.5;
}
</style>
