<template>
    <div class="conversations-inbox">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Unified Inbox</h1>
          <p class="mt-1 text-sm text-gray-500">
            Manage conversations across all channels (SMS, Email, WhatsApp, Social)
          </p>
        </div>
        <div class="flex gap-3">
          <button
            @click="refreshConversations"
            class="btn-secondary"
            :disabled="loading"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon bg-blue-100 text-blue-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Open Conversations</p>
            <p class="stat-value">{{ stats.open }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-yellow-100 text-yellow-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Unread Messages</p>
            <p class="stat-value">{{ stats.unread }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-green-100 text-green-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">Assigned to Me</p>
            <p class="stat-value">{{ stats.assignedToMe }}</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon bg-red-100 text-red-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="stat-label">SLA Breached</p>
            <p class="stat-value text-red-600">{{ stats.slaBreached }}</p>
          </div>
        </div>
      </div>

      <!-- Main Content: Split View -->
      <div class="inbox-container">
        <!-- Left Sidebar: Conversation List -->
        <div class="conversation-list-panel">
          <!-- Filters -->
          <div class="filters-section-compact">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search conversations..."
              class="input-field-sm"
            />

            <div class="filter-row">
              <select v-model="filters.channel" class="select-field-sm">
                <option value="all">All Channels</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
                <option value="telegram">Telegram</option>
                <option value="teams">Microsoft Teams</option>
                <option value="voice">Voice (Missed Calls)</option>
              </select>

              <select v-model="filters.status" class="select-field-sm">
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="snoozed">Snoozed</option>
                <option value="all">All Statuses</option>
              </select>
            </div>

            <div class="filter-row">
              <select v-model="filters.priority" class="select-field-sm">
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>

              <select v-model="filters.assignedTo" class="select-field-sm">
                <option value="me">Assigned to Me</option>
                <option value="unassigned">Unassigned</option>
                <option value="all">All Assignments</option>
              </select>
            </div>
          </div>

          <!-- Conversation List -->
          <div v-if="loading" class="loading-state-compact">
            <div class="spinner"></div>
            <p>Loading conversations...</p>
          </div>

          <div v-else-if="error" class="error-state-compact">
            <p>{{ error }}</p>
            <button @click="loadConversations" class="btn-secondary-sm">Retry</button>
          </div>

          <div v-else-if="conversations.length === 0" class="empty-state-compact">
            <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p class="text-gray-500 text-sm">No conversations found</p>
          </div>

          <div v-else class="conversation-list">
            <div
              v-for="conversation in conversations"
              :key="conversation.id"
              @click="selectConversation(conversation)"
              :class="[
                'conversation-item',
                { 'active': selectedConversation?.id === conversation.id },
                { 'unread': conversation.unread_count > 0 }
              ]"
            >
              <!-- Channel Icon -->
              <div :class="['channel-icon', `channel-${conversation.channel}`]">
                <component :is="getChannelIcon(conversation.channel)" class="w-5 h-5" />
              </div>

              <div class="conversation-content">
                <div class="conversation-header">
                  <h3 class="conversation-name">{{ conversation.customer_name || conversation.customer_identifier }}</h3>
                  <span class="conversation-time">{{ formatTime(conversation.last_message_at) }}</span>
                </div>

                <div class="conversation-subject" v-if="conversation.subject">
                  {{ conversation.subject }}
                </div>

                <p class="conversation-preview">
                  {{ conversation.last_message_preview }}
                </p>

                <div class="conversation-meta">
                  <span :class="['priority-badge', `priority-${conversation.priority}`]">
                    {{ conversation.priority }}
                  </span>
                  <span v-if="conversation.unread_count > 0" class="unread-badge">
                    {{ conversation.unread_count }}
                  </span>
                  <span v-if="conversation.sla_breached" class="sla-badge">
                    SLA Breach
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="pagination.totalPages > 1" class="pagination-compact">
            <button
              @click="goToPage(pagination.currentPage - 1)"
              :disabled="pagination.currentPage === 1"
              class="pagination-btn"
            >
              Previous
            </button>
            <span class="pagination-info">
              Page {{ pagination.currentPage }} of {{ pagination.totalPages }}
            </span>
            <button
              @click="goToPage(pagination.currentPage + 1)"
              :disabled="pagination.currentPage === pagination.totalPages"
              class="pagination-btn"
            >
              Next
            </button>
          </div>
        </div>

        <!-- Right Panel: Conversation Detail -->
        <div class="conversation-detail-panel">
          <div v-if="!selectedConversation" class="empty-detail-state">
            <svg class="w-24 h-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p class="text-gray-500">Select a conversation to view details</p>
          </div>

          <div v-else class="conversation-detail">
            <!-- Conversation Header -->
            <div class="detail-header">
              <div class="detail-header-left">
                <div :class="['channel-icon-lg', `channel-${selectedConversation.channel}`]">
                  <component :is="getChannelIcon(selectedConversation.channel)" class="w-6 h-6" />
                </div>
                <div>
                  <h2 class="detail-title">{{ selectedConversation.customer_name || selectedConversation.customer_identifier }}</h2>
                  <p class="detail-subtitle">
                    {{ selectedConversation.customer_identifier }} · {{ selectedConversation.channel }}
                  </p>
                </div>
              </div>

              <div class="detail-header-actions">
                <select
                  v-model="selectedConversation.status"
                  @change="updateStatus"
                  class="select-field-sm"
                >
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="closed">Closed</option>
                  <option value="snoozed">Snoozed</option>
                </select>

                <select
                  v-model="selectedConversation.priority"
                  @change="updatePriority"
                  class="select-field-sm"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>

                <button @click="assignToMe" class="btn-secondary-sm" v-if="!selectedConversation.assigned_agent_id">
                  Assign to Me
                </button>
                <button @click="unassign" class="btn-secondary-sm" v-else>
                  Unassign
                </button>
              </div>
            </div>

            <!-- Conversation Info Bar -->
            <div class="info-bar">
              <div class="info-item">
                <span class="info-label">Messages:</span>
                <span class="info-value">{{ selectedConversation.message_count }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Assigned to:</span>
                <span class="info-value">{{ selectedConversation.assigned_agent_name || 'Unassigned' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">First Response:</span>
                <span class="info-value">{{ formatResponseTime(selectedConversation.first_response_time_seconds) }}</span>
              </div>
              <div class="info-item" v-if="selectedConversation.sla_due_at">
                <span class="info-label">SLA Due:</span>
                <span :class="['info-value', { 'text-red-600': selectedConversation.sla_breached }]">
                  {{ formatSLADue(selectedConversation.sla_due_at) }}
                </span>
              </div>
            </div>

            <!-- Messages Thread -->
            <div class="messages-container" ref="messagesContainer">
              <div v-if="loadingMessages" class="loading-messages">
                <div class="spinner"></div>
                <p>Loading messages...</p>
              </div>

              <div v-else-if="messages.length === 0" class="empty-messages">
                <p>No messages yet</p>
              </div>

              <div v-else class="messages-thread">
                <div
                  v-for="message in messages"
                  :key="message.id"
                  :class="['message', `message-${message.direction}`]"
                >
                  <div class="message-avatar">
                    <div :class="['avatar', message.direction === 'inbound' ? 'avatar-customer' : 'avatar-agent']">
                      {{ getMessageInitials(message) }}
                    </div>
                  </div>

                  <div class="message-content">
                    <div class="message-header">
                      <span class="message-sender">{{ message.sender_name || (message.direction === 'inbound' ? 'Customer' : 'You') }}</span>
                      <span class="message-time">{{ formatMessageTime(message.created_at) }}</span>
                    </div>

                    <div class="message-body" v-if="message.content_html" v-html="message.content_html"></div>
                    <div class="message-body" v-else>{{ message.content }}</div>

                    <div v-if="message.attachments && message.attachments.length > 0" class="message-attachments">
                      <div v-for="(attachment, idx) in message.attachments" :key="idx" class="attachment">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <a :href="attachment.url" target="_blank" class="attachment-link">{{ attachment.name || 'Attachment' }}</a>
                      </div>
                    </div>

                    <div v-if="message.status" class="message-status">
                      <span :class="['status-badge', `status-${message.status}`]">
                        {{ message.status }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Reply Composer -->
            <div class="reply-composer">
              <div class="composer-toolbar">
                <button @click="toggleInternalNote" :class="['toolbar-btn', { 'active': isInternalNote }]" title="Internal Note">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {{ isInternalNote ? 'Internal Note' : 'Reply to Customer' }}
                </button>
              </div>

              <textarea
                v-model="replyContent"
                :placeholder="isInternalNote ? 'Add an internal note (customer will not see this)...' : 'Type your reply...'"
                class="composer-textarea"
                rows="4"
                @keydown.ctrl.enter="sendReply"
                @keydown.meta.enter="sendReply"
              ></textarea>

              <div class="composer-actions">
                <div class="composer-actions-left">
                  <button class="toolbar-btn" title="Attach File">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <span class="text-xs text-gray-500">Ctrl+Enter to send</span>
                </div>

                <div class="composer-actions-right">
                  <button @click="replyContent = ''" class="btn-secondary-sm">Cancel</button>
                  <button @click="sendReply" class="btn-primary-sm" :disabled="!replyContent.trim() || sending">
                    <span v-if="sending">Sending...</span>
                    <span v-else>Send Reply</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>

<script>
import { ref, reactive, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'

export default {
  name: 'Conversations',
  setup() {
    const router = useRouter()
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://3.83.53.69:3000'

    // State
    const loading = ref(false)
    const loadingMessages = ref(false)
    const sending = ref(false)
    const error = ref(null)
    const conversations = ref([])
    const selectedConversation = ref(null)
    const messages = ref([])
    const messagesContainer = ref(null)

    const searchQuery = ref('')
    const filters = reactive({
      channel: 'all',
      status: 'open',
      priority: 'all',
      assignedTo: 'me'
    })

    const pagination = reactive({
      currentPage: 1,
      limit: 50,
      totalPages: 1,
      totalItems: 0
    })

    const stats = reactive({
      open: 0,
      unread: 0,
      assignedToMe: 0,
      slaBreached: 0
    })

    const replyContent = ref('')
    const isInternalNote = ref(false)

    // Get JWT token
    const getToken = () => {
      return localStorage.getItem('auth_token')
    }

    // API Helper
    const apiRequest = async (endpoint, options = {}) => {
      const token = getToken()
      if (!token) {
        router.push('/login')
        throw new Error('Not authenticated')
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers
        }
      })

      if (response.status === 401) {
        localStorage.removeItem('auth_token')
        router.push('/login')
        throw new Error('Session expired')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || 'Request failed')
      }

      return response.json()
    }

    // Load conversations
    const loadConversations = async () => {
      loading.value = true
      error.value = null

      try {
        const params = new URLSearchParams({
          page: pagination.currentPage,
          limit: pagination.limit,
          status: filters.status,
          assigned_to: filters.assignedTo
        })

        if (filters.channel !== 'all') {
          params.append('channel', filters.channel)
        }

        if (filters.priority !== 'all') {
          params.append('priority', filters.priority)
        }

        if (searchQuery.value) {
          params.append('search', searchQuery.value)
        }

        const data = await apiRequest(`/v1/conversations?${params}`)

        conversations.value = data.conversations || []
        pagination.currentPage = data.pagination.page
        pagination.totalPages = data.pagination.totalPages
        pagination.totalItems = data.pagination.totalItems

        // Update stats
        updateStats()
      } catch (err) {
        error.value = err.message
        console.error('Failed to load conversations:', err)
      } finally {
        loading.value = false
      }
    }

    // Update stats (from conversations data)
    const updateStats = () => {
      stats.open = conversations.value.filter(c => c.status === 'open').length
      stats.unread = conversations.value.reduce((sum, c) => sum + (c.unread_count || 0), 0)
      stats.assignedToMe = conversations.value.filter(c => c.assigned_agent_id).length
      stats.slaBreached = conversations.value.filter(c => c.sla_breached).length
    }

    // Select conversation and load messages
    const selectConversation = async (conversation) => {
      selectedConversation.value = conversation
      loadingMessages.value = true

      try {
        const data = await apiRequest(`/v1/conversations/${conversation.id}`)
        selectedConversation.value = data.conversation
        messages.value = data.messages || []

        // Scroll to bottom
        await nextTick()
        scrollToBottom()
      } catch (err) {
        console.error('Failed to load messages:', err)
        error.value = err.message
      } finally {
        loadingMessages.value = false
      }
    }

    // Send reply
    const sendReply = async () => {
      if (!replyContent.value.trim() || !selectedConversation.value) return

      sending.value = true
      try {
        const data = await apiRequest(`/v1/conversations/${selectedConversation.value.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: replyContent.value,
            is_internal_note: isInternalNote.value
          })
        })

        // Add new message to thread
        messages.value.push(data.message)
        replyContent.value = ''
        isInternalNote.value = false

        // Scroll to bottom
        await nextTick()
        scrollToBottom()

        // Refresh conversation list to update last_message_preview
        loadConversations()
      } catch (err) {
        console.error('Failed to send reply:', err)
        alert('Failed to send reply: ' + err.message)
      } finally {
        sending.value = false
      }
    }

    // Update status
    const updateStatus = async () => {
      if (!selectedConversation.value) return

      try {
        await apiRequest(`/v1/conversations/${selectedConversation.value.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: selectedConversation.value.status
          })
        })

        loadConversations()
      } catch (err) {
        console.error('Failed to update status:', err)
        alert('Failed to update status: ' + err.message)
      }
    }

    // Update priority
    const updatePriority = async () => {
      if (!selectedConversation.value) return

      try {
        await apiRequest(`/v1/conversations/${selectedConversation.value.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            priority: selectedConversation.value.priority
          })
        })

        loadConversations()
      } catch (err) {
        console.error('Failed to update priority:', err)
        alert('Failed to update priority: ' + err.message)
      }
    }

    // Assign to me
    const assignToMe = async () => {
      if (!selectedConversation.value) return

      try {
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}')

        await apiRequest(`/v1/conversations/${selectedConversation.value.id}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({
            agent_id: userData.userId
          })
        })

        selectedConversation.value.assigned_agent_id = userData.userId
        selectedConversation.value.assigned_agent_name = userData.name || userData.email
        loadConversations()
      } catch (err) {
        console.error('Failed to assign conversation:', err)
        alert('Failed to assign: ' + err.message)
      }
    }

    // Unassign
    const unassign = async () => {
      if (!selectedConversation.value) return

      try {
        await apiRequest(`/v1/conversations/${selectedConversation.value.id}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({
            agent_id: null
          })
        })

        selectedConversation.value.assigned_agent_id = null
        selectedConversation.value.assigned_agent_name = null
        loadConversations()
      } catch (err) {
        console.error('Failed to unassign conversation:', err)
        alert('Failed to unassign: ' + err.message)
      }
    }

    // Pagination
    const goToPage = (page) => {
      if (page < 1 || page > pagination.totalPages) return
      pagination.currentPage = page
      loadConversations()
    }

    // Refresh
    const refreshConversations = () => {
      loadConversations()
      if (selectedConversation.value) {
        selectConversation(selectedConversation.value)
      }
    }

    // Toggle internal note
    const toggleInternalNote = () => {
      isInternalNote.value = !isInternalNote.value
    }

    // Scroll to bottom of messages
    const scrollToBottom = () => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    }

    // Format time
    const formatTime = (timestamp) => {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
      if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`

      return date.toLocaleDateString()
    }

    const formatMessageTime = (timestamp) => {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return date.toLocaleString()
    }

    const formatResponseTime = (seconds) => {
      if (!seconds) return 'N/A'
      if (seconds < 60) return `${seconds}s`
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
      return `${Math.floor(seconds / 3600)}h`
    }

    const formatSLADue = (timestamp) => {
      if (!timestamp) return 'N/A'
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = date - now
      const diffMins = Math.floor(diffMs / 60000)

      if (diffMins < 0) return 'OVERDUE'
      if (diffMins < 60) return `${diffMins}m`
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
      return `${Math.floor(diffMins / 1440)}d`
    }

    // Get channel icon
    const getChannelIcon = (channel) => {
      const icons = {
        sms: 'IconSMS',
        email: 'IconEmail',
        whatsapp: 'IconWhatsApp',
        discord: 'IconDiscord',
        slack: 'IconSlack',
        telegram: 'IconTelegram',
        teams: 'IconTeams',
        voice: 'IconPhone'
      }
      return icons[channel] || 'IconMessage'
    }

    // Get message initials
    const getMessageInitials = (message) => {
      if (message.sender_name) {
        return message.sender_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      }
      return message.direction === 'inbound' ? 'C' : 'A'
    }

    // Watch filters
    watch([() => filters.channel, () => filters.status, () => filters.priority, () => filters.assignedTo, searchQuery], () => {
      pagination.currentPage = 1
      loadConversations()
    })

    // Load on mount
    onMounted(() => {
      loadConversations()
    })

    return {
      loading,
      loadingMessages,
      sending,
      error,
      conversations,
      selectedConversation,
      messages,
      messagesContainer,
      searchQuery,
      filters,
      pagination,
      stats,
      replyContent,
      isInternalNote,
      loadConversations,
      selectConversation,
      sendReply,
      updateStatus,
      updatePriority,
      assignToMe,
      unassign,
      goToPage,
      refreshConversations,
      toggleInternalNote,
      formatTime,
      formatMessageTime,
      formatResponseTime,
      formatSLADue,
      getChannelIcon,
      getMessageInitials
    }
  }
}
</script>

<style scoped>
/* Base Styles */
.conversations-inbox {
  min-height: 100vh;
  background-color: #f9fafb;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
}

/* Inbox Container */
.inbox-container {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 1.5rem;
  height: calc(100vh - 400px);
  min-height: 600px;
}

/* Conversation List Panel */
.conversation-list-panel {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filters-section-compact {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.input-field-sm {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.select-field-sm {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background-color 0.15s;
}

.conversation-item:hover {
  background-color: #f9fafb;
}

.conversation-item.active {
  background-color: #eff6ff;
  border-left: 3px solid #3b82f6;
}

.conversation-item.unread {
  background-color: #fef3c7;
}

.channel-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.channel-sms { background: #dbeafe; color: #1e40af; }
.channel-email { background: #fce7f3; color: #9f1239; }
.channel-whatsapp { background: #dcfce7; color: #166534; }
.channel-discord { background: #ede9fe; color: #5b21b6; }
.channel-slack { background: #fef3c7; color: #92400e; }
.channel-telegram { background: #dbeafe; color: #1e3a8a; }
.channel-teams { background: #e0e7ff; color: #3730a3; }
.channel-voice { background: #f3e8ff; color: #6b21a8; }

.conversation-content {
  flex: 1;
  min-width: 0;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.conversation-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-time {
  font-size: 0.75rem;
  color: #6b7280;
  flex-shrink: 0;
}

.conversation-subject {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-preview {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.priority-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
  text-transform: uppercase;
}

.priority-urgent { background: #fecaca; color: #991b1b; }
.priority-high { background: #fed7aa; color: #9a3412; }
.priority-normal { background: #d1d5db; color: #374151; }
.priority-low { background: #dbeafe; color: #1e40af; }

.unread-badge {
  background: #3b82f6;
  color: white;
  font-size: 0.625rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.sla-badge {
  background: #fecaca;
  color: #991b1b;
  font-size: 0.625rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

/* Conversation Detail Panel */
.conversation-detail-panel {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-detail-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.conversation-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.detail-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.channel-icon-lg {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
}

.detail-subtitle {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.detail-header-actions {
  display: flex;
  gap: 0.5rem;
}

.info-bar {
  padding: 0.75rem 1.5rem;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  gap: 2rem;
}

.info-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.info-label {
  color: #6b7280;
  font-weight: 500;
}

.info-value {
  color: #111827;
  font-weight: 600;
}

/* Messages Container */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.loading-messages,
.empty-messages {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7280;
}

.messages-thread {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
}

.message-inbound {
  align-self: flex-start;
}

.message-outbound {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  color: white;
}

.avatar-customer {
  background: #3b82f6;
}

.avatar-agent {
  background: #10b981;
}

.message-content {
  max-width: 65%;
  background: #f3f4f6;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
}

.message-outbound .message-content {
  background: #dbeafe;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.message-sender {
  font-weight: 600;
  font-size: 0.875rem;
  color: #111827;
}

.message-time {
  font-size: 0.75rem;
  color: #6b7280;
}

.message-body {
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.5;
}

.message-attachments {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.attachment {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.attachment-link {
  color: #3b82f6;
  text-decoration: underline;
}

.message-status {
  margin-top: 0.5rem;
}

.status-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
  text-transform: uppercase;
  background: #d1d5db;
  color: #374151;
}

.status-sent { background: #dbeafe; color: #1e40af; }
.status-delivered { background: #dcfce7; color: #166534; }
.status-read { background: #d1fae5; color: #065f46; }
.status-failed { background: #fecaca; color: #991b1b; }

/* Reply Composer */
.reply-composer {
  border-top: 1px solid #e5e7eb;
  padding: 1rem 1.5rem;
}

.composer-toolbar {
  margin-bottom: 0.5rem;
}

.toolbar-btn {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: #f9fafb;
}

.toolbar-btn.active {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #92400e;
}

.composer-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  resize: vertical;
  font-family: inherit;
}

.composer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
}

.composer-actions-left,
.composer-actions-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-primary-sm,
.btn-secondary-sm {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #f9fafb;
}

.btn-primary-sm,
.btn-secondary-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.btn-primary:disabled,
.btn-primary-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pagination */
.pagination-compact {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  font-size: 0.875rem;
  cursor: pointer;
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Loading & Error States */
.loading-state-compact,
.error-state-compact,
.empty-state-compact {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Utility Classes */
.input-field,
.select-field {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
}
</style>
