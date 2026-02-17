<template>
  <div class="h-full flex bg-white rounded-lg shadow">
    <!-- Conversation List (Left Panel) -->
    <div class="w-80 border-r border-gray-200 flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900">Inbox</h3>
        <div class="flex gap-1 mt-2">
          <button
            v-for="filter in channelFilters"
            :key="filter.id"
            @click="activeFilter = filter.id"
            :class="[
              'px-2 py-1 text-xs rounded-full transition-colors',
              activeFilter === filter.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            ]"
          >
            {{ filter.label }} ({{ filter.count }})
          </button>
        </div>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="convo in filteredConversations"
          :key="convo.id"
          @click="selectConversation(convo)"
          :class="[
            'p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors',
            selectedConversation?.id === convo.id ? 'bg-blue-50' : ''
          ]"
        >
          <div class="flex items-start gap-3">
            <!-- Channel Icon -->
            <div :class="['w-10 h-10 rounded-full flex items-center justify-center', getChannelClass(convo.channel)]">
              <component :is="getChannelIcon(convo.channel)" class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gray-900 truncate">{{ convo.contact_name || convo.contact_id }}</span>
                <span class="text-xs text-gray-500">{{ formatTime(convo.last_message_at) }}</span>
              </div>
              <p class="text-sm text-gray-600 truncate">{{ convo.last_message }}</p>
              <div class="flex items-center gap-2 mt-1">
                <span :class="['text-xs px-1.5 py-0.5 rounded', getStatusClass(convo.status)]">
                  {{ convo.status }}
                </span>
                <span v-if="convo.unread_count" class="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                  {{ convo.unread_count }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredConversations.length === 0" class="p-8 text-center text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p>No conversations</p>
        </div>
      </div>
    </div>

    <!-- Conversation View (Center Panel) -->
    <div class="flex-1 flex flex-col">
      <!-- Selected Conversation -->
      <template v-if="selectedConversation">
        <!-- Conversation Header -->
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div :class="['w-10 h-10 rounded-full flex items-center justify-center', getChannelClass(selectedConversation.channel)]">
              <component :is="getChannelIcon(selectedConversation.channel)" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="font-medium text-gray-900">{{ selectedConversation.contact_name || selectedConversation.contact_id }}</h4>
              <p class="text-sm text-gray-500">{{ selectedConversation.channel }} - {{ selectedConversation.contact_id }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="transferConversation"
              class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Transfer"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
            <button
              @click="closeConversation"
              class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
          <div
            v-for="message in selectedConversation.messages"
            :key="message.id"
            :class="['flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start']"
          >
            <div
              :class="[
                'max-w-xs lg:max-w-md px-4 py-2 rounded-lg',
                message.direction === 'outbound'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              ]"
            >
              <p class="text-sm">{{ message.content }}</p>
              <div :class="['flex items-center gap-2 mt-1', message.direction === 'outbound' ? 'justify-end' : '']">
                <span :class="['text-xs', message.direction === 'outbound' ? 'text-blue-200' : 'text-gray-500']">
                  {{ formatTime(message.created_at) }}
                </span>
                <span v-if="message.direction === 'outbound'" class="text-xs text-blue-200">
                  {{ message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : '' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Typing Indicator -->
          <div v-if="isTyping" class="flex justify-start">
            <div class="bg-gray-100 px-4 py-2 rounded-lg">
              <div class="flex gap-1">
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Message Input -->
        <div class="p-4 border-t border-gray-200">
          <!-- Canned Responses -->
          <div v-if="showCannedResponses" class="mb-3 max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-2">
            <div
              v-for="response in cannedResponses"
              :key="response.id"
              @click="insertCannedResponse(response)"
              class="p-2 hover:bg-gray-100 rounded cursor-pointer"
            >
              <p class="text-sm font-medium text-gray-900">{{ response.title }}</p>
              <p class="text-xs text-gray-500 truncate">{{ response.content }}</p>
            </div>
          </div>

          <div class="flex items-end gap-2">
            <!-- Attachment Button -->
            <button class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <!-- Canned Response Button -->
            <button
              @click="showCannedResponses = !showCannedResponses"
              class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Canned Responses"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>

            <!-- Text Input -->
            <div class="flex-1">
              <textarea
                v-model="messageInput"
                @keydown.enter.exact.prevent="sendMessage"
                rows="1"
                class="w-full border border-gray-300 rounded-lg px-4 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type a message..."
              ></textarea>
            </div>

            <!-- Send Button -->
            <button
              @click="sendMessage"
              :disabled="!messageInput.trim()"
              class="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </template>

      <!-- No Conversation Selected -->
      <template v-else>
        <div class="flex-1 flex items-center justify-center text-gray-500">
          <div class="text-center">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p class="text-lg font-medium">Select a conversation</p>
            <p class="text-sm">Choose a conversation from the list to start messaging</p>
          </div>
        </div>
      </template>
    </div>

    <!-- Contact Info Panel (Right Panel) -->
    <div v-if="selectedConversation" class="w-72 border-l border-gray-200 p-4">
      <h4 class="font-semibold text-gray-900 mb-4">Contact Info</h4>

      <div class="space-y-4">
        <!-- Contact Details -->
        <div>
          <label class="text-xs text-gray-500">Name</label>
          <p class="text-sm font-medium text-gray-900">{{ contactInfo?.name || 'Unknown' }}</p>
        </div>
        <div v-if="contactInfo?.email">
          <label class="text-xs text-gray-500">Email</label>
          <p class="text-sm text-gray-900">{{ contactInfo.email }}</p>
        </div>
        <div v-if="contactInfo?.phone">
          <label class="text-xs text-gray-500">Phone</label>
          <p class="text-sm text-gray-900">{{ contactInfo.phone }}</p>
        </div>

        <!-- Tags -->
        <div v-if="contactInfo?.tags?.length">
          <label class="text-xs text-gray-500">Tags</label>
          <div class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in contactInfo.tags"
              :key="tag"
              class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Previous Interactions -->
        <div>
          <label class="text-xs text-gray-500 mb-2 block">Recent Interactions</label>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            <div
              v-for="interaction in recentInteractions"
              :key="interaction.id"
              class="p-2 bg-gray-50 rounded text-xs"
            >
              <div class="flex items-center gap-2">
                <span :class="['w-2 h-2 rounded-full', getChannelDot(interaction.channel)]"></span>
                <span class="text-gray-600">{{ interaction.channel }}</span>
                <span class="text-gray-400 ml-auto">{{ formatDate(interaction.date) }}</span>
              </div>
              <p class="text-gray-500 truncate mt-1">{{ interaction.summary }}</p>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Notes</label>
          <textarea
            v-model="notes"
            rows="3"
            class="w-full text-sm border border-gray-300 rounded-lg p-2 resize-none"
            placeholder="Add notes..."
          ></textarea>
          <button
            @click="saveNotes"
            class="mt-2 w-full px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, h } from 'vue'

const props = defineProps({
  agentId: { type: Number, required: true },
  token: { type: String, required: true },
})

const emit = defineEmits(['conversation-selected', 'message-sent'])

// Channel Icons as render functions
const ChatIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
  ])
}

const SmsIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' })
  ])
}

const EmailIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' })
  ])
}

const WhatsAppIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' })
  ])
}

const FacebookIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' })
  ])
}

const TwitterIcon = {
  render: () => h('svg', { class: 'w-5 h-5', fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' })
  ])
}

// State
const activeFilter = ref('all')
const conversations = ref([])
const selectedConversation = ref(null)
const messageInput = ref('')
const isTyping = ref(false)
const showCannedResponses = ref(false)
const notes = ref('')
const contactInfo = ref(null)
const recentInteractions = ref([])
const messagesContainer = ref(null)

const cannedResponses = ref([
  { id: 1, title: 'Greeting', content: 'Hello! Thank you for contacting us. How can I help you today?' },
  { id: 2, title: 'Hold Please', content: 'Please hold for a moment while I look into this for you.' },
  { id: 3, title: 'Transfer', content: 'I\'ll transfer you to a specialist who can better assist you.' },
  { id: 4, title: 'Closing', content: 'Is there anything else I can help you with today?' },
  { id: 5, title: 'Thank You', content: 'Thank you for your patience. I appreciate your understanding.' },
])

const channelFilters = computed(() => [
  { id: 'all', label: 'All', count: conversations.value.length },
  { id: 'chat', label: 'Chat', count: conversations.value.filter(c => c.channel === 'chat').length },
  { id: 'sms', label: 'SMS', count: conversations.value.filter(c => c.channel === 'sms').length },
  { id: 'email', label: 'Email', count: conversations.value.filter(c => c.channel === 'email').length },
  { id: 'whatsapp', label: 'WhatsApp', count: conversations.value.filter(c => c.channel === 'whatsapp').length },
  { id: 'social', label: 'Social', count: conversations.value.filter(c => ['facebook', 'twitter', 'instagram'].includes(c.channel)).length },
])

const filteredConversations = computed(() => {
  if (activeFilter.value === 'all') return conversations.value
  if (activeFilter.value === 'social') {
    return conversations.value.filter(c => ['facebook', 'twitter', 'instagram'].includes(c.channel))
  }
  return conversations.value.filter(c => c.channel === activeFilter.value)
})

let websocket = null
let pollingInterval = null

// Methods
const loadConversations = async () => {
  try {
    const response = await fetch('/api/v1/agent/conversations?status=open', {
      headers: { Authorization: `Bearer ${props.token}` }
    })
    if (response.ok) {
      const data = await response.json()
      conversations.value = data.conversations || []
    }
  } catch (error) {
    console.error('Failed to load conversations:', error)
  }
}

const selectConversation = async (convo) => {
  selectedConversation.value = convo
  emit('conversation-selected', convo)

  // Load full conversation with messages
  try {
    const response = await fetch(`/api/v1/conversations/${convo.id}`, {
      headers: { Authorization: `Bearer ${props.token}` }
    })
    if (response.ok) {
      const data = await response.json()
      selectedConversation.value = { ...convo, messages: data.messages || [] }
      contactInfo.value = data.contact || null
      recentInteractions.value = data.recent_interactions || []

      await nextTick()
      scrollToBottom()
    }
  } catch (error) {
    console.error('Failed to load conversation:', error)
  }
}

const sendMessage = async () => {
  if (!messageInput.value.trim() || !selectedConversation.value) return

  const content = messageInput.value.trim()
  messageInput.value = ''
  showCannedResponses.value = false

  // Optimistically add message
  const tempMessage = {
    id: Date.now(),
    content,
    direction: 'outbound',
    status: 'sending',
    created_at: new Date().toISOString(),
  }
  selectedConversation.value.messages.push(tempMessage)
  await nextTick()
  scrollToBottom()

  try {
    const response = await fetch(`/api/v1/conversations/${selectedConversation.value.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${props.token}`
      },
      body: JSON.stringify({ content, channel: selectedConversation.value.channel })
    })

    if (response.ok) {
      const data = await response.json()
      // Update temp message with real data
      const idx = selectedConversation.value.messages.findIndex(m => m.id === tempMessage.id)
      if (idx !== -1) {
        selectedConversation.value.messages[idx] = data.message
      }
      emit('message-sent', data.message)
    }
  } catch (error) {
    console.error('Failed to send message:', error)
    tempMessage.status = 'failed'
  }
}

const insertCannedResponse = (response) => {
  messageInput.value = response.content
  showCannedResponses.value = false
}

const transferConversation = () => {
  // TODO: Show transfer modal
  console.log('Transfer conversation')
}

const closeConversation = async () => {
  if (!selectedConversation.value) return

  if (!confirm('Close this conversation?')) return

  try {
    await fetch(`/api/v1/conversations/${selectedConversation.value.id}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${props.token}` }
    })
    conversations.value = conversations.value.filter(c => c.id !== selectedConversation.value.id)
    selectedConversation.value = null
  } catch (error) {
    console.error('Failed to close conversation:', error)
  }
}

const saveNotes = async () => {
  if (!selectedConversation.value) return

  try {
    await fetch(`/api/v1/conversations/${selectedConversation.value.id}/notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${props.token}`
      },
      body: JSON.stringify({ notes: notes.value })
    })
  } catch (error) {
    console.error('Failed to save notes:', error)
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const connectWebSocket = () => {
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/agent`

  try {
    websocket = new WebSocket(wsUrl)

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'new_conversation') {
        conversations.value.unshift(data.conversation)
      } else if (data.type === 'new_message') {
        // Add message to conversation if it's the selected one
        if (selectedConversation.value?.id === data.conversation_id) {
          selectedConversation.value.messages.push(data.message)
          nextTick(scrollToBottom)
        }
        // Update conversation in list
        const convo = conversations.value.find(c => c.id === data.conversation_id)
        if (convo) {
          convo.last_message = data.message.content
          convo.last_message_at = data.message.created_at
          convo.unread_count = (convo.unread_count || 0) + 1
        }
      } else if (data.type === 'typing') {
        if (selectedConversation.value?.id === data.conversation_id) {
          isTyping.value = true
          setTimeout(() => { isTyping.value = false }, 3000)
        }
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    websocket.onclose = () => {
      setTimeout(connectWebSocket, 5000)
    }
  } catch (error) {
    console.error('WebSocket connection failed:', error)
  }
}

// Helpers
const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return 'Yesterday'
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const getChannelIcon = (channel) => {
  const icons = {
    chat: ChatIcon,
    sms: SmsIcon,
    email: EmailIcon,
    whatsapp: WhatsAppIcon,
    facebook: FacebookIcon,
    twitter: TwitterIcon,
    instagram: FacebookIcon, // Use FB icon for Instagram
  }
  return icons[channel] || ChatIcon
}

const getChannelClass = (channel) => {
  const classes = {
    chat: 'bg-blue-100 text-blue-600',
    sms: 'bg-green-100 text-green-600',
    email: 'bg-purple-100 text-purple-600',
    whatsapp: 'bg-emerald-100 text-emerald-600',
    facebook: 'bg-indigo-100 text-indigo-600',
    twitter: 'bg-sky-100 text-sky-600',
    instagram: 'bg-pink-100 text-pink-600',
  }
  return classes[channel] || 'bg-gray-100 text-gray-600'
}

const getChannelDot = (channel) => {
  const classes = {
    chat: 'bg-blue-500',
    sms: 'bg-green-500',
    email: 'bg-purple-500',
    whatsapp: 'bg-emerald-500',
    facebook: 'bg-indigo-500',
    twitter: 'bg-sky-500',
    instagram: 'bg-pink-500',
  }
  return classes[channel] || 'bg-gray-500'
}

const getStatusClass = (status) => {
  const classes = {
    open: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    closed: 'bg-gray-100 text-gray-700',
    waiting: 'bg-blue-100 text-blue-700',
  }
  return classes[status] || 'bg-gray-100 text-gray-700'
}

// Lifecycle
onMounted(() => {
  loadConversations()
  connectWebSocket()

  // Poll for updates every 30 seconds as backup
  pollingInterval = setInterval(loadConversations, 30000)
})

onUnmounted(() => {
  if (websocket) {
    websocket.close()
  }
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }
})
</script>
