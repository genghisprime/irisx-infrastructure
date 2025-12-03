<template>
  <div class="social-media-hub">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>Social Media Hub</h1>
        <p class="subtitle">Manage Discord, Slack, Teams, and Telegram integrations</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn btn-secondary" :disabled="loading">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
          Refresh
        </button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="stats-grid" v-if="stats">
      <div class="stat-card">
        <div class="stat-icon discord">
          <i class="fab fa-discord"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.accounts?.discord_accounts || 0 }}</span>
          <span class="stat-label">Discord</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon slack">
          <i class="fab fa-slack"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.accounts?.slack_accounts || 0 }}</span>
          <span class="stat-label">Slack</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teams">
          <i class="fab fa-microsoft"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.accounts?.teams_accounts || 0 }}</span>
          <span class="stat-label">Teams</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon telegram">
          <i class="fab fa-telegram"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stats.accounts?.telegram_accounts || 0 }}</span>
          <span class="stat-label">Telegram</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon messages">
          <i class="fas fa-comments"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ formatNumber(stats.messages?.total_messages) }}</span>
          <span class="stat-label">Total Messages</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon active">
          <i class="fas fa-chart-line"></i>
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ formatNumber(stats.messages?.messages_24h) }}</span>
          <span class="stat-label">Messages (24h)</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['tab', { active: activeTab === tab.id }]"
        >
          <i :class="tab.icon"></i>
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Accounts Tab -->
      <div v-if="activeTab === 'accounts'" class="accounts-tab">
        <!-- Filters -->
        <div class="filters-bar">
          <div class="filter-group">
            <select v-model="filters.platform" @change="loadAccounts" class="filter-select">
              <option value="">All Platforms</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="telegram">Telegram</option>
            </select>
            <select v-model="filters.status" @change="loadAccounts" class="filter-select">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="error">Error</option>
            </select>
            <input
              type="text"
              v-model="filters.search"
              @input="debounceSearch"
              placeholder="Search accounts..."
              class="filter-input"
            />
          </div>
        </div>

        <!-- Accounts Table -->
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Account</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Messages (24h)</th>
                <th>Channels</th>
                <th>Last Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in accounts" :key="account.id">
                <td>
                  <span :class="['platform-badge', account.platform]">
                    <i :class="getPlatformIcon(account.platform)"></i>
                    {{ account.platform }}
                  </span>
                </td>
                <td>
                  <strong>{{ account.account_name }}</strong>
                </td>
                <td>{{ account.tenant_name || 'Unknown' }}</td>
                <td>
                  <span :class="['status-badge', account.status]">
                    {{ account.status }}
                  </span>
                </td>
                <td>{{ formatNumber(account.messages_24h) }}</td>
                <td>{{ account.channel_count }}</td>
                <td>{{ formatDate(account.last_synced_at) }}</td>
                <td>
                  <div class="action-buttons">
                    <button @click="viewAccountDetails(account)" class="btn btn-sm btn-secondary">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button @click="testConnection(account)" class="btn btn-sm btn-primary" :disabled="testingAccount === account.id">
                      <i class="fas fa-plug" :class="{ 'fa-spin': testingAccount === account.id }"></i>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="accounts.length === 0 && !loading">
                <td colspan="8" class="empty-state">
                  <i class="fas fa-inbox"></i>
                  <p>No social media accounts found</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination" v-if="pagination.totalPages > 1">
          <button
            @click="changePage(pagination.page - 1)"
            :disabled="pagination.page <= 1"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="page-info">
            Page {{ pagination.page }} of {{ pagination.totalPages }}
          </span>
          <button
            @click="changePage(pagination.page + 1)"
            :disabled="pagination.page >= pagination.totalPages"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Messages Tab -->
      <div v-if="activeTab === 'messages'" class="messages-tab">
        <!-- Filters -->
        <div class="filters-bar">
          <div class="filter-group">
            <select v-model="messageFilters.platform" @change="loadMessages" class="filter-select">
              <option value="">All Platforms</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="telegram">Telegram</option>
            </select>
            <select v-model="messageFilters.direction" @change="loadMessages" class="filter-select">
              <option value="">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <input
              type="text"
              v-model="messageFilters.search"
              @input="debounceMessageSearch"
              placeholder="Search messages..."
              class="filter-input"
            />
          </div>
        </div>

        <!-- Messages Table -->
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Channel</th>
                <th>From</th>
                <th>Message</th>
                <th>Direction</th>
                <th>Tenant</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="message in messages" :key="message.id">
                <td>
                  <span :class="['platform-badge', message.platform]">
                    <i :class="getPlatformIcon(message.platform)"></i>
                  </span>
                </td>
                <td>{{ message.channel_name || message.platform_channel_id }}</td>
                <td>
                  <div class="user-info">
                    <img v-if="message.from_avatar_url" :src="message.from_avatar_url" class="user-avatar" />
                    <span>{{ message.from_username || message.from_user_id }}</span>
                  </div>
                </td>
                <td class="message-preview">{{ message.text_preview || '[No text]' }}</td>
                <td>
                  <span :class="['direction-badge', message.direction]">
                    <i :class="message.direction === 'inbound' ? 'fas fa-arrow-down' : 'fas fa-arrow-up'"></i>
                    {{ message.direction }}
                  </span>
                </td>
                <td>{{ message.tenant_name || 'Unknown' }}</td>
                <td>{{ formatDate(message.created_at) }}</td>
              </tr>
              <tr v-if="messages.length === 0 && !loading">
                <td colspan="7" class="empty-state">
                  <i class="fas fa-comments"></i>
                  <p>No messages found</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination" v-if="messagePagination.totalPages > 1">
          <button
            @click="changeMessagePage(messagePagination.page - 1)"
            :disabled="messagePagination.page <= 1"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="page-info">
            Page {{ messagePagination.page }} of {{ messagePagination.totalPages }}
          </span>
          <button
            @click="changeMessagePage(messagePagination.page + 1)"
            :disabled="messagePagination.page >= messagePagination.totalPages"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Webhooks Tab -->
      <div v-if="activeTab === 'webhooks'" class="webhooks-tab">
        <!-- Filters -->
        <div class="filters-bar">
          <div class="filter-group">
            <select v-model="webhookFilters.platform" @change="loadWebhooks" class="filter-select">
              <option value="">All Platforms</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="telegram">Telegram</option>
            </select>
            <select v-model="webhookFilters.processed" @change="loadWebhooks" class="filter-select">
              <option value="">All Status</option>
              <option value="true">Processed</option>
              <option value="false">Pending</option>
            </select>
            <label class="filter-checkbox">
              <input type="checkbox" v-model="webhookFilters.hasError" @change="loadWebhooks" />
              Show Only Errors
            </label>
          </div>
        </div>

        <!-- Webhooks Table -->
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Event Type</th>
                <th>Account</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Error</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="webhook in webhooks" :key="webhook.id" :class="{ 'error-row': webhook.processing_error }">
                <td>
                  <span :class="['platform-badge', webhook.platform]">
                    <i :class="getPlatformIcon(webhook.platform)"></i>
                  </span>
                </td>
                <td>{{ webhook.event_type || 'unknown' }}</td>
                <td>{{ webhook.account_name || '-' }}</td>
                <td>{{ webhook.tenant_name || '-' }}</td>
                <td>
                  <span :class="['status-badge', webhook.processed ? 'active' : 'pending']">
                    {{ webhook.processed ? 'Processed' : 'Pending' }}
                  </span>
                </td>
                <td class="error-cell">
                  <span v-if="webhook.processing_error" class="error-text" :title="webhook.processing_error">
                    {{ truncate(webhook.processing_error, 50) }}
                  </span>
                  <span v-else>-</span>
                </td>
                <td>{{ formatDate(webhook.received_at) }}</td>
              </tr>
              <tr v-if="webhooks.length === 0 && !loading">
                <td colspan="7" class="empty-state">
                  <i class="fas fa-satellite-dish"></i>
                  <p>No webhook events found</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="pagination" v-if="webhookPagination.totalPages > 1">
          <button
            @click="changeWebhookPage(webhookPagination.page - 1)"
            :disabled="webhookPagination.page <= 1"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="page-info">
            Page {{ webhookPagination.page }} of {{ webhookPagination.totalPages }}
          </span>
          <button
            @click="changeWebhookPage(webhookPagination.page + 1)"
            :disabled="webhookPagination.page >= webhookPagination.totalPages"
            class="btn btn-sm btn-secondary"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Health Tab -->
      <div v-if="activeTab === 'health'" class="health-tab">
        <!-- Health Summary -->
        <div class="health-summary" v-if="healthData">
          <div class="health-card healthy">
            <i class="fas fa-check-circle"></i>
            <span class="count">{{ healthData.summary?.healthy || 0 }}</span>
            <span class="label">Healthy</span>
          </div>
          <div class="health-card warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span class="count">{{ healthData.summary?.warning || 0 }}</span>
            <span class="label">Warning</span>
          </div>
          <div class="health-card error">
            <i class="fas fa-times-circle"></i>
            <span class="count">{{ healthData.summary?.error || 0 }}</span>
            <span class="label">Error</span>
          </div>
          <div class="health-card failures">
            <i class="fas fa-bug"></i>
            <span class="count">{{ healthData.summary?.recent_webhook_failures || 0 }}</span>
            <span class="label">Recent Failures</span>
          </div>
        </div>

        <!-- Account Health Table -->
        <h3>Account Health Status</h3>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Health</th>
                <th>Platform</th>
                <th>Account</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Messages (24h)</th>
                <th>Last Sync</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in healthData?.accounts || []" :key="account.id" :class="['health-row', account.health_status]">
                <td>
                  <span :class="['health-indicator', account.health_status]">
                    <i :class="getHealthIcon(account.health_status)"></i>
                  </span>
                </td>
                <td>
                  <span :class="['platform-badge', account.platform]">
                    <i :class="getPlatformIcon(account.platform)"></i>
                  </span>
                </td>
                <td>{{ account.account_name }}</td>
                <td>{{ account.tenant_name || 'Unknown' }}</td>
                <td>
                  <span :class="['status-badge', account.status]">
                    {{ account.status }}
                  </span>
                </td>
                <td>{{ account.messages_24h }}</td>
                <td>{{ formatDate(account.last_synced_at) }}</td>
                <td class="error-cell">
                  <span v-if="account.error_message" class="error-text" :title="account.error_message">
                    {{ truncate(account.error_message, 40) }}
                  </span>
                  <span v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Recent Failures -->
        <h3 v-if="healthData?.recentFailures?.length">Recent Webhook Failures</h3>
        <div class="data-table-container" v-if="healthData?.recentFailures?.length">
          <table class="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Event</th>
                <th>Account</th>
                <th>Error</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="failure in healthData.recentFailures" :key="failure.id" class="error-row">
                <td>
                  <span :class="['platform-badge', failure.platform]">
                    <i :class="getPlatformIcon(failure.platform)"></i>
                  </span>
                </td>
                <td>{{ failure.event_type }}</td>
                <td>{{ failure.account_name || '-' }}</td>
                <td class="error-cell">{{ failure.processing_error }}</td>
                <td>{{ formatDate(failure.received_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics Tab -->
      <div v-if="activeTab === 'analytics'" class="analytics-tab">
        <div class="analytics-controls">
          <select v-model="analyticsDays" @change="loadAnalytics" class="filter-select">
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
        </div>

        <!-- Top Channels -->
        <div class="analytics-section">
          <h3>Top Active Channels</h3>
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Platform</th>
                  <th>Account</th>
                  <th>Tenant</th>
                  <th>Messages</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="channel in analytics?.topChannels || []" :key="channel.id">
                  <td>{{ channel.channel_name }}</td>
                  <td>
                    <span :class="['platform-badge', channel.platform]">
                      <i :class="getPlatformIcon(channel.platform)"></i>
                    </span>
                  </td>
                  <td>{{ channel.account_name }}</td>
                  <td>{{ channel.tenant_name }}</td>
                  <td>{{ formatNumber(channel.message_count) }}</td>
                  <td>{{ formatDate(channel.last_message_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Messages by Tenant -->
        <div class="analytics-section">
          <h3>Messages by Tenant</h3>
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Platform</th>
                  <th>Total</th>
                  <th>Inbound</th>
                  <th>Outbound</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in analytics?.messagesByTenant || []" :key="index">
                  <td>{{ item.tenant_name || 'Unknown' }}</td>
                  <td>
                    <span :class="['platform-badge', item.platform]">
                      <i :class="getPlatformIcon(item.platform)"></i>
                    </span>
                  </td>
                  <td>{{ formatNumber(item.message_count) }}</td>
                  <td>{{ formatNumber(item.inbound) }}</td>
                  <td>{{ formatNumber(item.outbound) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Webhook Stats -->
        <div class="analytics-section">
          <h3>Webhook Success Rates</h3>
          <div class="webhook-stats-grid">
            <div v-for="stat in analytics?.webhookStats || []" :key="stat.platform" class="webhook-stat-card">
              <div class="stat-header">
                <i :class="getPlatformIcon(stat.platform)"></i>
                <span>{{ stat.platform }}</span>
              </div>
              <div class="stat-body">
                <div class="stat-row">
                  <span>Total:</span>
                  <strong>{{ formatNumber(stat.total_webhooks) }}</strong>
                </div>
                <div class="stat-row">
                  <span>Processed:</span>
                  <strong class="success">{{ formatNumber(stat.processed) }}</strong>
                </div>
                <div class="stat-row">
                  <span>Failed:</span>
                  <strong class="error">{{ formatNumber(stat.failed) }}</strong>
                </div>
                <div class="stat-row success-rate">
                  <span>Success Rate:</span>
                  <strong :class="getSuccessRateClass(stat.success_rate)">{{ stat.success_rate || 0 }}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Account Details Modal -->
    <div v-if="showAccountModal" class="modal-overlay" @click.self="showAccountModal = false">
      <div class="modal-content large">
        <div class="modal-header">
          <h2>
            <i :class="getPlatformIcon(selectedAccount?.platform)"></i>
            {{ selectedAccount?.account_name }}
          </h2>
          <button @click="showAccountModal = false" class="close-btn">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" v-if="accountDetails">
          <!-- Account Info -->
          <div class="detail-section">
            <h3>Account Information</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">Platform</span>
                <span class="value">{{ accountDetails.account?.platform }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Tenant</span>
                <span class="value">{{ accountDetails.account?.tenant_name }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Status</span>
                <span :class="['status-badge', accountDetails.account?.status]">
                  {{ accountDetails.account?.status }}
                </span>
              </div>
              <div class="detail-item">
                <span class="label">Last Sync</span>
                <span class="value">{{ formatDate(accountDetails.account?.last_synced_at) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Has Access Token</span>
                <span class="value">{{ accountDetails.account?.has_access_token ? 'Yes' : 'No' }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Has Bot Token</span>
                <span class="value">{{ accountDetails.account?.has_bot_token ? 'Yes' : 'No' }}</span>
              </div>
            </div>
          </div>

          <!-- Message Stats -->
          <div class="detail-section">
            <h3>Message Statistics</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">Total Messages</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.total_messages) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Inbound</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.inbound) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Outbound</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.outbound) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Last 24h</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.last_24h) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Last 7 Days</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.last_7d) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Unique Users</span>
                <span class="value">{{ formatNumber(accountDetails.messageStats?.unique_users) }}</span>
              </div>
            </div>
          </div>

          <!-- Channels -->
          <div class="detail-section" v-if="accountDetails.channels?.length">
            <h3>Channels ({{ accountDetails.channels.length }})</h3>
            <div class="channels-list">
              <div v-for="channel in accountDetails.channels" :key="channel.id" class="channel-item">
                <div class="channel-info">
                  <span class="channel-name"># {{ channel.channel_name }}</span>
                  <span class="channel-type">{{ channel.channel_type }}</span>
                </div>
                <div class="channel-stats">
                  <span>{{ formatNumber(channel.message_count) }} messages</span>
                  <span :class="['status-dot', channel.is_enabled ? 'active' : 'disabled']"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent Messages -->
          <div class="detail-section" v-if="accountDetails.recentMessages?.length">
            <h3>Recent Messages</h3>
            <div class="recent-messages">
              <div v-for="msg in accountDetails.recentMessages" :key="msg.id" class="message-item">
                <div class="message-header">
                  <span class="username">{{ msg.from_username || msg.from_user_id }}</span>
                  <span class="channel">#{{ msg.channel_name }}</span>
                  <span class="time">{{ formatDate(msg.created_at) }}</span>
                </div>
                <div class="message-content">{{ msg.text_preview || '[No text content]' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { adminAPI } from '../../../utils/api';

// State
const loading = ref(false);
const activeTab = ref('accounts');
const stats = ref(null);
const testingAccount = ref(null);

// Accounts
const accounts = ref([]);
const pagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 });
const filters = ref({ platform: '', status: '', search: '' });

// Messages
const messages = ref([]);
const messagePagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 });
const messageFilters = ref({ platform: '', direction: '', search: '' });

// Webhooks
const webhooks = ref([]);
const webhookPagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 });
const webhookFilters = ref({ platform: '', processed: '', hasError: false });

// Health
const healthData = ref(null);

// Analytics
const analytics = ref(null);
const analyticsDays = ref(7);

// Account Details Modal
const showAccountModal = ref(false);
const selectedAccount = ref(null);
const accountDetails = ref(null);

// Tabs config
const tabs = [
  { id: 'accounts', label: 'Accounts', icon: 'fas fa-user-circle' },
  { id: 'messages', label: 'Messages', icon: 'fas fa-comments' },
  { id: 'webhooks', label: 'Webhooks', icon: 'fas fa-satellite-dish' },
  { id: 'health', label: 'Health', icon: 'fas fa-heartbeat' },
  { id: 'analytics', label: 'Analytics', icon: 'fas fa-chart-bar' }
];

// Debounce timers
let searchTimer = null;
let messageSearchTimer = null;

// Load data on mount
onMounted(() => {
  loadStats();
  loadAccounts();
});

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'messages' && messages.value.length === 0) {
    loadMessages();
  } else if (newTab === 'webhooks' && webhooks.value.length === 0) {
    loadWebhooks();
  } else if (newTab === 'health' && !healthData.value) {
    loadHealth();
  } else if (newTab === 'analytics' && !analytics.value) {
    loadAnalytics();
  }
});

// API calls
async function loadStats() {
  try {
    const response = await adminAPI.socialMedia.getStats();
    stats.value = response.stats;
  } catch (error) {
    console.error('Failed to load social media stats:', error);
  }
}

async function loadAccounts() {
  loading.value = true;
  try {
    const response = await adminAPI.socialMedia.getAccounts({
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...filters.value
    });
    accounts.value = response.accounts;
    pagination.value = response.pagination;
  } catch (error) {
    console.error('Failed to load accounts:', error);
  } finally {
    loading.value = false;
  }
}

async function loadMessages() {
  loading.value = true;
  try {
    const response = await adminAPI.socialMedia.getMessages({
      page: messagePagination.value.page,
      limit: messagePagination.value.limit,
      ...messageFilters.value
    });
    messages.value = response.messages;
    messagePagination.value = response.pagination;
  } catch (error) {
    console.error('Failed to load messages:', error);
  } finally {
    loading.value = false;
  }
}

async function loadWebhooks() {
  loading.value = true;
  try {
    const response = await adminAPI.socialMedia.getWebhooks({
      page: webhookPagination.value.page,
      limit: webhookPagination.value.limit,
      platform: webhookFilters.value.platform,
      processed: webhookFilters.value.processed,
      has_error: webhookFilters.value.hasError ? 'true' : ''
    });
    webhooks.value = response.webhooks;
    webhookPagination.value = response.pagination;
  } catch (error) {
    console.error('Failed to load webhooks:', error);
  } finally {
    loading.value = false;
  }
}

async function loadHealth() {
  loading.value = true;
  try {
    const response = await adminAPI.socialMedia.getHealth();
    healthData.value = response;
  } catch (error) {
    console.error('Failed to load health data:', error);
  } finally {
    loading.value = false;
  }
}

async function loadAnalytics() {
  loading.value = true;
  try {
    const response = await adminAPI.socialMedia.getAnalytics({ days: analyticsDays.value });
    analytics.value = response.analytics;
  } catch (error) {
    console.error('Failed to load analytics:', error);
  } finally {
    loading.value = false;
  }
}

async function viewAccountDetails(account) {
  selectedAccount.value = account;
  showAccountModal.value = true;
  try {
    const response = await adminAPI.socialMedia.getAccountDetails(account.id);
    accountDetails.value = response;
  } catch (error) {
    console.error('Failed to load account details:', error);
  }
}

async function testConnection(account) {
  testingAccount.value = account.id;
  try {
    const response = await adminAPI.socialMedia.testAccount(account.id);
    if (response.success) {
      alert(`Connection test passed for ${account.account_name}`);
      loadAccounts();
    } else {
      alert(`Connection test failed: ${response.error}`);
    }
  } catch (error) {
    alert(`Connection test failed: ${error.message}`);
  } finally {
    testingAccount.value = null;
  }
}

function refreshData() {
  loadStats();
  if (activeTab.value === 'accounts') loadAccounts();
  else if (activeTab.value === 'messages') loadMessages();
  else if (activeTab.value === 'webhooks') loadWebhooks();
  else if (activeTab.value === 'health') loadHealth();
  else if (activeTab.value === 'analytics') loadAnalytics();
}

// Pagination
function changePage(page) {
  pagination.value.page = page;
  loadAccounts();
}

function changeMessagePage(page) {
  messagePagination.value.page = page;
  loadMessages();
}

function changeWebhookPage(page) {
  webhookPagination.value.page = page;
  loadWebhooks();
}

// Debounced search
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    pagination.value.page = 1;
    loadAccounts();
  }, 300);
}

function debounceMessageSearch() {
  clearTimeout(messageSearchTimer);
  messageSearchTimer = setTimeout(() => {
    messagePagination.value.page = 1;
    loadMessages();
  }, 300);
}

// Helpers
function getPlatformIcon(platform) {
  const icons = {
    discord: 'fab fa-discord',
    slack: 'fab fa-slack',
    teams: 'fab fa-microsoft',
    telegram: 'fab fa-telegram'
  };
  return icons[platform] || 'fas fa-comment';
}

function getHealthIcon(status) {
  const icons = {
    healthy: 'fas fa-check-circle',
    warning: 'fas fa-exclamation-triangle',
    error: 'fas fa-times-circle'
  };
  return icons[status] || 'fas fa-question-circle';
}

function getSuccessRateClass(rate) {
  if (rate >= 95) return 'excellent';
  if (rate >= 80) return 'good';
  if (rate >= 50) return 'warning';
  return 'error';
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return parseInt(num).toLocaleString();
}

function formatDate(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

function truncate(text, length) {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
}
</script>

<style scoped>
.social-media-hub {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-content h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.subtitle {
  color: #666;
  margin: 4px 0 0;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
}

.stat-icon.discord { background: linear-gradient(135deg, #5865F2, #7289DA); }
.stat-icon.slack { background: linear-gradient(135deg, #4A154B, #611f69); }
.stat-icon.teams { background: linear-gradient(135deg, #464EB8, #6264A7); }
.stat-icon.telegram { background: linear-gradient(135deg, #0088cc, #229ED9); }
.stat-icon.messages { background: linear-gradient(135deg, #10B981, #059669); }
.stat-icon.active { background: linear-gradient(135deg, #F59E0B, #D97706); }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 13px;
  color: #666;
}

/* Tabs */
.tabs-container {
  margin-bottom: 24px;
}

.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0;
}

.tab {
  padding: 12px 20px;
  border: none;
  background: none;
  color: #666;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tab:hover {
  color: #4F46E5;
}

.tab.active {
  color: #4F46E5;
  border-bottom-color: #4F46E5;
}

/* Platform Badge */
.platform-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.platform-badge.discord {
  background: rgba(88, 101, 242, 0.1);
  color: #5865F2;
}

.platform-badge.slack {
  background: rgba(74, 21, 75, 0.1);
  color: #4A154B;
}

.platform-badge.teams {
  background: rgba(70, 78, 184, 0.1);
  color: #464EB8;
}

.platform-badge.telegram {
  background: rgba(0, 136, 204, 0.1);
  color: #0088cc;
}

/* Status Badge */
.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #D1FAE5;
  color: #065F46;
}

.status-badge.disabled {
  background: #F3F4F6;
  color: #6B7280;
}

.status-badge.error {
  background: #FEE2E2;
  color: #DC2626;
}

.status-badge.pending {
  background: #FEF3C7;
  color: #D97706;
}

/* Direction Badge */
.direction-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.direction-badge.inbound {
  background: #DBEAFE;
  color: #1D4ED8;
}

.direction-badge.outbound {
  background: #D1FAE5;
  color: #065F46;
}

/* Filters */
.filters-bar {
  background: white;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

/* Data Table */
.data-table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.data-table th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #6b7280;
}

.data-table tbody tr:hover {
  background: #f9fafb;
}

.error-row {
  background: #FEF2F2 !important;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: #9ca3af;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 12px;
}

/* Message Preview */
.message-preview {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
}

/* User Info */
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

/* Error Cell */
.error-cell {
  max-width: 200px;
}

.error-text {
  color: #DC2626;
  font-size: 12px;
}

/* Health Section */
.health-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.health-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.health-card i {
  font-size: 32px;
  margin-bottom: 8px;
}

.health-card .count {
  display: block;
  font-size: 28px;
  font-weight: 700;
}

.health-card .label {
  color: #666;
  font-size: 13px;
}

.health-card.healthy i { color: #10B981; }
.health-card.warning i { color: #F59E0B; }
.health-card.error i { color: #EF4444; }
.health-card.failures i { color: #8B5CF6; }

.health-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.health-indicator.healthy {
  background: #D1FAE5;
  color: #10B981;
}

.health-indicator.warning {
  background: #FEF3C7;
  color: #F59E0B;
}

.health-indicator.error {
  background: #FEE2E2;
  color: #EF4444;
}

.health-row.error {
  background: #FEF2F2;
}

/* Analytics */
.analytics-controls {
  margin-bottom: 24px;
}

.analytics-section {
  margin-bottom: 32px;
}

.analytics-section h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.webhook-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.webhook-stat-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.webhook-stat-card .stat-header {
  padding: 12px 16px;
  background: #f9fafb;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  text-transform: capitalize;
}

.webhook-stat-card .stat-body {
  padding: 16px;
}

.webhook-stat-card .stat-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.webhook-stat-card .stat-row:last-child {
  border-bottom: none;
}

.webhook-stat-card .success { color: #10B981; }
.webhook-stat-card .error { color: #EF4444; }
.webhook-stat-card .excellent { color: #10B981; }
.webhook-stat-card .good { color: #3B82F6; }
.webhook-stat-card .warning { color: #F59E0B; }

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}

.page-info {
  color: #666;
  font-size: 14px;
}

/* Modal */
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
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}

.modal-content.large {
  max-width: 800px;
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
  display: flex;
  align-items: center;
  gap: 12px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
}

.modal-body {
  padding: 24px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #374151;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item .label {
  font-size: 12px;
  color: #6b7280;
}

.detail-item .value {
  font-weight: 500;
}

/* Channels List */
.channels-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f9fafb;
  border-radius: 8px;
}

.channel-name {
  font-weight: 500;
}

.channel-type {
  font-size: 12px;
  color: #9ca3af;
  margin-left: 8px;
}

.channel-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #6b7280;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active { background: #10B981; }
.status-dot.disabled { background: #9ca3af; }

/* Recent Messages in Modal */
.recent-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.message-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.message-header {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 12px;
}

.message-header .username {
  font-weight: 600;
  color: #374151;
}

.message-header .channel {
  color: #6b7280;
}

.message-header .time {
  color: #9ca3af;
  margin-left: auto;
}

.message-content {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
}

/* Buttons */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-primary {
  background: #4F46E5;
  color: white;
}

.btn-primary:hover {
  background: #4338CA;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 6px;
}
</style>
