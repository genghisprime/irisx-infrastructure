<template>
  <div class="py-6">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
      <h1 class="text-2xl font-semibold text-gray-900 mb-6">Unified Inbox</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Conversations List -->
        <div class="lg:col-span-1 bg-white shadow rounded-lg overflow-hidden">
          <!-- Filters -->
          <div class="p-4 border-b border-gray-200">
            <div class="flex items-center space-x-2 mb-3">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search conversations..."
                @input="debouncedSearch"
                class="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
            <div class="flex space-x-2">
              <button
                v-for="channel in channels"
                :key="channel.value"
                @click="selectedChannel = channel.value"
                :class="{
                  'bg-indigo-100 text-indigo-700': selectedChannel === channel.value,
                  'bg-gray-100 text-gray-700': selectedChannel !== channel.value
                }"
                class="px-3 py-1 text-xs font-medium rounded-md hover:bg-indigo-50"
              >
                {{ channel.label }}
              </button>
            </div>
          </div>

          <!-- Conversation List -->
          <div class="overflow-y-auto" style="max-height: calc(100vh - 300px)">
            <div v-if="isLoadingConversations" class="p-8 text-center">
              <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>

            <div v-else-if="conversations.length === 0" class="p-8 text-center text-gray-500">
              <svg class="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p class="mt-2 text-sm">No conversations found</p>
            </div>

            <div
              v-for="conversation in conversations"
              :key="conversation.id"
              @click="selectConversation(conversation)"
              :class="{
                'bg-indigo-50 border-l-4 border-indigo-500': selectedConversation?.id === conversation.id,
                'hover:bg-gray-50': selectedConversation?.id !== conversation.id
              }"
              class="p-4 border-b border-gray-200 cursor-pointer"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center space-x-2">
                    <span
                      :class="getChannelColor(conversation.channel)"
                      class="flex-shrink-0 w-2 h-2 rounded-full"
                    ></span>
                    <p class="text-sm font-medium text-gray-900 truncate">
                      {{ conversation.contact_name || conversation.contact_identifier }}
                    </p>
                    <span
                      v-if="conversation.unread_count > 0"
                      class="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full"
                    >
                      {{ conversation.unread_count }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 mt-1">
                    {{ getChannelLabel(conversation.channel) }} • {{ formatRelativeTime(conversation.last_message_at) }}
                  </p>
                  <p class="text-sm text-gray-600 mt-1 truncate">
                    {{ conversation.last_message_preview }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conversation Detail -->
        <div class="lg:col-span-2 bg-white shadow rounded-lg flex flex-col" style="height: calc(100vh - 200px)">
          <div v-if="!selectedConversation" class="flex-1 flex items-center justify-center text-gray-500">
            <div class="text-center">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p class="mt-2">Select a conversation to view details</p>
            </div>
          </div>

          <template v-else>
            <!-- Conversation Header -->
            <div class="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 class="text-lg font-medium text-gray-900">
                  {{ selectedConversation.contact_name || selectedConversation.contact_identifier }}
                </h2>
                <p class="text-sm text-gray-500">
                  {{ getChannelLabel(selectedConversation.channel) }} • {{ selectedConversation.contact_identifier }}
                </p>
              </div>
              <button
                @click="markAsRead(selectedConversation.id)"
                v-if="selectedConversation.unread_count > 0"
                class="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Mark as read
              </button>
            </div>

            <!-- Messages -->
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
              <div v-if="isLoadingMessages" class="text-center">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              </div>

              <div
                v-for="message in messages"
                :key="message.id"
                :class="{
                  'flex justify-end': message.direction === 'outbound',
                  'flex justify-start': message.direction === 'inbound'
                }"
                class="flex"
              >
                <div
                  :class="{
                    'bg-indigo-600 text-white': message.direction === 'outbound',
                    'bg-gray-200 text-gray-900': message.direction === 'inbound'
                  }"
                  class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg"
                >
                  <div v-if="message.channel === 'voice'" class="flex items-center space-x-2">
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <span class="text-sm">
                      {{ message.direction === 'outbound' ? 'Outbound' : 'Inbound' }} call
                      {{ message.duration ? `(${formatDuration(message.duration)})` : '' }}
                    </span>
                  </div>

                  <div v-else-if="message.channel === 'sms'" class="text-sm">
                    {{ message.content }}
                  </div>

                  <div v-else-if="message.channel === 'email'">
                    <p class="text-xs font-semibold mb-1">{{ message.subject }}</p>
                    <p class="text-sm">{{ message.preview || message.content }}</p>
                  </div>

                  <div v-else class="text-sm">
                    {{ message.content }}
                  </div>

                  <div
                    :class="{
                      'text-indigo-200': message.direction === 'outbound',
                      'text-gray-500': message.direction === 'inbound'
                    }"
                    class="text-xs mt-1"
                  >
                    {{ formatTime(message.created_at) }}
                    <span v-if="message.status" class="ml-1">• {{ message.status }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Message Input -->
            <div class="p-4 border-t border-gray-200">
              <div v-if="selectedConversation.channel === 'voice'" class="text-center text-gray-500 py-4">
                <p class="text-sm">Voice conversations are view-only</p>
                <button
                  @click="initiateCall"
                  class="mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <svg class="mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                  Call {{ selectedConversation.contact_identifier }}
                </button>
              </div>

              <form v-else @submit.prevent="sendMessage" class="flex space-x-2">
                <input
                  v-model="newMessage"
                  type="text"
                  :placeholder="`Send ${selectedConversation.channel === 'sms' ? 'SMS' : 'message'}...`"
                  class="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  :disabled="isSending"
                />
                <button
                  type="submit"
                  :disabled="!newMessage.trim() || isSending"
                  class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ isSending ? 'Sending...' : 'Send' }}
                </button>
              </form>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { apiClient } from '@/utils/api'

const conversations = ref([])
const selectedConversation = ref(null)
const messages = ref([])
const isLoadingConversations = ref(false)
const isLoadingMessages = ref(false)
const isSending = ref(false)
const newMessage = ref('')
const searchQuery = ref('')
const selectedChannel = ref('all')
const messagesContainer = ref(null)

const channels = [
  { value: 'all', label: 'All' },
  { value: 'voice', label: 'Voice' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' }
]

let searchTimeout = null

onMounted(() => {
  fetchConversations()
})

function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchConversations()
  }, 500)
}

async function fetchConversations() {
  isLoadingConversations.value = true
  try {
    const params = {
      channel: selectedChannel.value !== 'all' ? selectedChannel.value : undefined,
      search: searchQuery.value || undefined
    }

    const response = await apiClient.get('/v1/conversations', { params })
    conversations.value = response.data.conversations || []
  } catch (error) {
    console.error('Failed to fetch conversations:', error)
    conversations.value = []
  } finally {
    isLoadingConversations.value = false
  }
}

async function selectConversation(conversation) {
  selectedConversation.value = conversation
  await fetchMessages(conversation.id)
}

async function fetchMessages(conversationId) {
  isLoadingMessages.value = true
  try {
    const response = await apiClient.get(`/v1/conversations/${conversationId}/messages`)
    messages.value = response.data.messages || []

    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    messages.value = []
  } finally {
    isLoadingMessages.value = false
  }
}

async function sendMessage() {
  if (!newMessage.value.trim() || !selectedConversation.value) return

  isSending.value = true
  try {
    const endpoint = selectedConversation.value.channel === 'sms'
      ? '/v1/messages'
      : '/v1/emails'

    const payload = selectedConversation.value.channel === 'sms'
      ? {
          to: selectedConversation.value.contact_identifier,
          body: newMessage.value
        }
      : {
          to: selectedConversation.value.contact_identifier,
          subject: 'Re: ' + (selectedConversation.value.last_subject || 'Conversation'),
          body: newMessage.value
        }

    await apiClient.post(endpoint, payload)

    newMessage.value = ''
    await fetchMessages(selectedConversation.value.id)
    await fetchConversations()
  } catch (error) {
    console.error('Failed to send message:', error)
    alert('Failed to send message')
  } finally {
    isSending.value = false
  }
}

async function markAsRead(conversationId) {
  try {
    await apiClient.patch(`/v1/conversations/${conversationId}/read`)
    await fetchConversations()

    if (selectedConversation.value) {
      selectedConversation.value.unread_count = 0
    }
  } catch (error) {
    console.error('Failed to mark as read:', error)
  }
}

function initiateCall() {
  if (!selectedConversation.value) return
  // This would integrate with the API to initiate a call
  alert(`Initiating call to ${selectedConversation.value.contact_identifier}`)
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function getChannelColor(channel) {
  const colors = {
    voice: 'bg-green-500',
    sms: 'bg-blue-500',
    email: 'bg-purple-500',
    social: 'bg-pink-500'
  }
  return colors[channel] || 'bg-gray-500'
}

function getChannelLabel(channel) {
  const labels = {
    voice: 'Voice',
    sms: 'SMS',
    email: 'Email',
    social: 'Social'
  }
  return labels[channel] || channel
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''

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

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>
