<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-gray-900">Live Chat Inbox</h1>
              <p class="mt-1 text-sm text-gray-500">
                Manage customer conversations in real-time
              </p>
            </div>
            <div class="flex items-center space-x-4">
              <!-- Presence Status -->
              <div class="flex items-center space-x-2">
                <span class="text-sm font-medium text-gray-700">Status:</span>
                <select
                  v-model="agentStatus"
                  @change="updatePresence"
                  class="rounded-md border-gray-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="online">🟢 Online</option>
                  <option value="away">🟡 Away</option>
                  <option value="busy">🔴 Busy</option>
                  <option value="offline">⚫ Offline</option>
                </select>
              </div>

              <!-- Active Chats Count -->
              <div class="bg-indigo-50 px-4 py-2 rounded-lg">
                <span class="text-sm font-medium text-indigo-900">
                  {{ activeConversations.length }} Active Chat{{ activeConversations.length !== 1 ? 's' : '' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
        <!-- Conversations List -->
        <div class="lg:col-span-1 bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col">
          <!-- Tabs -->
          <div class="border-b">
            <nav class="flex -mb-px">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                @click="selectedTab = tab.value; loadConversations()"
                :class="[
                  'flex-1 py-3 px-4 text-center border-b-2 font-medium text-sm transition-colors',
                  selectedTab === tab.value
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                ]"
              >
                {{ tab.label }}
                <span
                  v-if="tab.count > 0"
                  class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                >
                  {{ tab.count }}
                </span>
              </button>
            </nav>
          </div>

          <!-- Conversation List -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-8 text-center">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p class="mt-2 text-sm text-gray-500">Loading conversations...</p>
            </div>

            <div v-else-if="conversations.length === 0" class="p-8 text-center">
              <svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="mx-auto  text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p class="mt-2 text-sm text-gray-500">No conversations</p>
            </div>

            <div v-else>
              <div
                v-for="conv in conversations"
                :key="conv.conversation_id"
                @click="selectConversation(conv)"
                :class="[
                  'p-4 border-b cursor-pointer transition-colors hover:bg-gray-50',
                  selectedConversation?.conversation_id === conv.conversation_id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''
                ]"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center space-x-2">
                      <p class="text-sm font-medium text-gray-900 truncate">
                        {{ conv.visitor_name || conv.visitor_id || 'Anonymous Visitor' }}
                      </p>
                      <span
                        v-if="conv.unread_count > 0"
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                      >
                        {{ conv.unread_count }}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-gray-500">
                      {{ formatTime(conv.created_at) }}
                    </p>
                    <p class="mt-1 text-sm text-gray-600 truncate">
                      {{ conv.last_message || 'No messages yet' }}
                    </p>
                  </div>
                  <div class="ml-2">
                    <span
                      :class="[
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        conv.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      ]"
                    >
                      {{ conv.status }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Window -->
        <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border overflow-hidden flex flex-col">
          <div v-if="!selectedConversation" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p class="mt-4 text-lg font-medium text-gray-900">Select a conversation</p>
              <p class="mt-1 text-sm text-gray-500">Choose a chat from the list to start messaging</p>
            </div>
          </div>

          <template v-else>
            <!-- Chat Header -->
            <div class="px-6 py-4 border-b bg-gray-50">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h3 class="text-lg font-semibold text-gray-900">
                    {{ selectedConversation.visitor_name || 'Anonymous Visitor' }}
                  </h3>
                  <div class="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                    <span v-if="selectedConversation.visitor_email">
                      📧 {{ selectedConversation.visitor_email }}
                    </span>
                    <span v-if="selectedConversation.page_title">
                      📄 {{ selectedConversation.page_title }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center space-x-2">
                  <button
                    v-if="selectedConversation.status === 'active'"
                    @click="closeConversation"
                    class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close Chat
                  </button>
                </div>
              </div>
            </div>

            <!-- Messages -->
            <div ref="messagesContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
              <div v-if="loadingMessages" class="text-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              </div>

              <div v-else-if="messages.length === 0" class="text-center py-8">
                <p class="text-sm text-gray-500">No messages yet</p>
              </div>

              <div
                v-for="message in messages"
                :key="message.message_id"
                :class="[
                  'flex',
                  message.sender_type === 'agent' ? 'justify-end' : 'justify-start'
                ]"
              >
                <div
                  :class="[
                    'max-w-xs lg:max-w-md px-4 py-2 rounded-lg',
                    message.sender_type === 'agent'
                      ? 'bg-indigo-600 text-white'
                      : message.sender_type === 'system'
                      ? 'bg-gray-200 text-gray-700 italic'
                      : 'bg-gray-200 text-gray-900'
                  ]"
                >
                  <p class="text-sm whitespace-pre-wrap">{{ message.message_text }}</p>
                  <p
                    :class="[
                      'mt-1 text-xs',
                      message.sender_type === 'agent' ? 'text-indigo-200' : 'text-gray-500'
                    ]"
                  >
                    {{ formatMessageTime(message.created_at) }}
                  </p>
                </div>
              </div>

              <!-- Typing Indicator -->
              <div v-if="isVisitorTyping" class="flex justify-start">
                <div class="bg-gray-200 px-4 py-2 rounded-lg">
                  <div class="flex space-x-1">
                    <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Message Input -->
            <div class="px-6 py-4 border-t bg-gray-50">
              <form @submit.prevent="sendMessage" class="flex space-x-4">
                <input
                  v-model="messageText"
                  type="text"
                  placeholder="Type your message..."
                  :disabled="selectedConversation.status !== 'active'"
                  class="flex-1 rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  @input="handleTyping"
                />
                <button
                  type="submit"
                  :disabled="!messageText.trim() || selectedConversation.status !== 'active' || sending"
                  class="px-6 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {{ sending ? 'Sending...' : 'Send' }}
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
import { ref, onMounted, computed, nextTick } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const agentStatus = ref('online');
const selectedTab = ref('my-chats');
const loading = ref(false);
const loadingMessages = ref(false);
const sending = ref(false);
const conversations = ref([]);
const activeConversations = ref([]);
const queueConversations = ref([]);
const selectedConversation = ref(null);
const messages = ref([]);
const messageText = ref('');
const isVisitorTyping = ref(false);
const messagesContainer = ref(null);

let typingTimeout = null;
let refreshInterval = null;

const tabs = computed(() => [
  { label: 'My Chats', value: 'my-chats', count: activeConversations.value.length },
  { label: 'Queue', value: 'queue', count: queueConversations.value.length }
]);

// Get auth token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

// Update agent presence
async function updatePresence() {
  try {
    await axios.post(
      `${API_URL}/v1/chat/agent/presence`,
      {
        status: agentStatus.value,
        socketId: null // Will be used for WebSocket in future
      },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
  } catch (error) {
    console.error('Error updating presence:', error);
  }
}

// Load conversations
async function loadConversations() {
  loading.value = true;
  try {
    if (selectedTab.value === 'my-chats') {
      const response = await axios.get(`${API_URL}/v1/chat/agent/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      activeConversations.value = response.data.data;
      conversations.value = activeConversations.value;
    } else {
      const response = await axios.get(`${API_URL}/v1/chat/queue`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      queueConversations.value = response.data.data;
      conversations.value = queueConversations.value;
    }
  } catch (error) {
    console.error('Error loading conversations:', error);
  } finally {
    loading.value = false;
  }
}

// Select conversation
async function selectConversation(conv) {
  selectedConversation.value = conv;
  await loadMessages();
  await markAsRead();
}

// Load messages
async function loadMessages() {
  if (!selectedConversation.value) return;

  loadingMessages.value = true;
  try {
    const response = await axios.get(
      `${API_URL}/v1/chat/conversation/${selectedConversation.value.conversation_id}/messages`
    );
    messages.value = response.data.data.messages;

    // Scroll to bottom
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  } catch (error) {
    console.error('Error loading messages:', error);
  } finally {
    loadingMessages.value = false;
  }
}

// Send message
async function sendMessage() {
  if (!messageText.value.trim() || !selectedConversation.value) return;

  sending.value = true;
  const text = messageText.value;
  messageText.value = '';

  try {
    const response = await axios.post(
      `${API_URL}/v1/chat/message/send`,
      {
        conversationId: selectedConversation.value.conversation_id,
        senderType: 'agent',
        messageText: text
      },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    // Add message to UI
    messages.value.push(response.data.data);

    // Scroll to bottom
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  } catch (error) {
    console.error('Error sending message:', error);
    messageText.value = text; // Restore message on error
  } finally {
    sending.value = false;
  }
}

// Handle typing indicator
function handleTyping() {
  // In production, this would emit a typing event via WebSocket
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    // Stop typing indicator
  }, 1000);
}

// Mark messages as read
async function markAsRead() {
  if (!selectedConversation.value) return;

  try {
    await axios.post(
      `${API_URL}/v1/chat/conversation/${selectedConversation.value.conversation_id}/read`,
      { senderType: 'visitor' },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    // Update unread count
    const conv = conversations.value.find(c => c.conversation_id === selectedConversation.value.conversation_id);
    if (conv) {
      conv.unread_count = 0;
    }
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

// Close conversation
async function closeConversation() {
  if (!selectedConversation.value) return;

  if (!confirm('Are you sure you want to close this conversation?')) return;

  try {
    await axios.post(
      `${API_URL}/v1/chat/conversation/${selectedConversation.value.conversation_id}/close`,
      {},
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    selectedConversation.value.status = 'closed';

    // Reload conversations
    await loadConversations();
  } catch (error) {
    console.error('Error closing conversation:', error);
  }
}

// Format time
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Auto-refresh conversations
function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    loadConversations();
    if (selectedConversation.value) {
      loadMessages();
    }
  }, 3000); // Poll every 3 seconds (use WebSocket for real-time in production)
}

// Lifecycle
onMounted(async () => {
  await updatePresence();
  await loadConversations();
  startAutoRefresh();
});

// Cleanup
window.addEventListener('beforeunload', () => {
  clearInterval(refreshInterval);
  agentStatus.value = 'offline';
  updatePresence();
});
</script>
